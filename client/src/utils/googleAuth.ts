import { initializeApp, getApps, getApp as getSdkApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  reauthenticateWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  type User,
  type Auth,
} from "firebase/auth";
import {
  getFirebaseConfig,
  isFirebaseConfigured,
  loadFirebaseConfigAsync,
} from "./firebaseConfig";
import { purgeLegacySharedKeys } from "./userStorage";

const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

// Safe singleton Firebase initialization
let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function getApp(): FirebaseApp | null {
  if (appInstance) return appInstance;
  const existingApps = getApps();
  if (existingApps.length > 0) {
    appInstance = getSdkApp();
    return appInstance;
  }
  const config = getFirebaseConfig();
  if (config.apiKey && config.projectId) {
    try {
      appInstance = initializeApp(config);
      return appInstance;
    } catch (e) {
      console.warn("Failed to initialize Firebase app:", e);
    }
  }
  return null;
}

export function getAuthClient(): Auth | null {
  if (authInstance) return authInstance;
  const app = getApp();
  if (app) {
    try {
      authInstance = getAuth(app);
      return authInstance;
    } catch (e) {
      console.warn("Failed to get Firebase Auth client:", e);
    }
  }
  return null;
}

// Export auth getter/instance for backwards compatibility
export const auth: Auth | null = getAuthClient();

/**
 * Creates a configured GoogleAuthProvider with least-privilege appDataFolder scope.
 * Avoids forcing prompt=select_account during Drive reconnect so the active user isn't disrupted.
 */
function createGoogleProvider(options?: {
  prompt?: string;
  loginHint?: string | null;
}): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_APPDATA_SCOPE);
  const customParams: Record<string, string> = {};
  if (options?.prompt) {
    customParams.prompt = options.prompt;
  }
  if (options?.loginHint) {
    customParams.login_hint = options.loginHint;
  }
  if (Object.keys(customParams).length > 0) {
    provider.setCustomParameters(customParams);
  }
  return provider;
}

export interface StoredUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  lastLogin: string;
}

interface InMemoryOAuthToken {
  token: string;
  uid: string;
  expiresAt: number;
}

// Strictly in-memory OAuth access token cache bound to a specific Firebase UID.
// Never persisted in localStorage or sessionStorage.
let cachedAccessToken: InMemoryOAuthToken | null = null;
let isSigningIn = false;

// Clean up any legacy shared OAuth tokens or profiles on module load
purgeLegacySharedKeys();

/**
 * Saves or clears the Google OAuth token strictly in memory, bound to a user UID.
 */
export function saveStoredOAuthToken(
  token: string | null,
  expiresInSeconds = 3600,
  uid?: string
): void {
  // Always ensure no raw tokens exist in persistent browser storage
  purgeLegacySharedKeys();

  if (!token || !uid) {
    cachedAccessToken = null;
    return;
  }

  // Subtract 120s buffer so we refresh before hard expiry
  const validSeconds = Math.max(300, expiresInSeconds - 120);
  cachedAccessToken = {
    token,
    uid,
    expiresAt: Date.now() + validSeconds * 1000,
  };
}

/**
 * Retrieves valid Google OAuth token from memory only if unexpired and matching the active UID.
 */
export function getStoredOAuthToken(expectedUid?: string): string | null {
  if (!cachedAccessToken) return null;

  if (expectedUid && cachedAccessToken.uid !== expectedUid) {
    return null;
  }

  if (Date.now() >= cachedAccessToken.expiresAt) {
    cachedAccessToken = null;
    return null;
  }

  return cachedAccessToken.token;
}

export function getGoogleTokenExpiresAt(expectedUid?: string): number | null {
  if (!cachedAccessToken) return null;
  if (expectedUid && cachedAccessToken.uid !== expectedUid) return null;
  if (Date.now() >= cachedAccessToken.expiresAt) return null;
  return cachedAccessToken.expiresAt;
}

export function clearStoredOAuthToken(): void {
  cachedAccessToken = null;
  purgeLegacySharedKeys();
}

export function isGoogleTokenValid(expectedUid?: string): boolean {
  return Boolean(getStoredOAuthToken(expectedUid));
}

export function toUserProfile(user: User): StoredUserProfile {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    lastLogin: new Date().toISOString(),
  };
}

let gisLoadPromise: Promise<boolean> | null = null;
let discoveredOAuthClientId: string | null = null;
let discoveryAttempted = false;
let silentRestoreInFlight: Promise<{ accessToken: string; expiresIn: number } | null> | null = null;

async function loadGisClientScript(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if ((window as any).google?.accounts?.oauth2) return true;
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      if ((window as any).google?.accounts?.oauth2) {
        resolve(true);
        return;
      }
      const timer = setTimeout(() => resolve(false), 4500);
      existing.addEventListener("load", () => {
        clearTimeout(timer);
        resolve(Boolean((window as any).google?.accounts?.oauth2));
      });
      existing.addEventListener("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;

    const timer = setTimeout(() => {
      resolve(Boolean((window as any).google?.accounts?.oauth2));
    }, 4500);

    script.onload = () => {
      clearTimeout(timer);
      resolve(Boolean((window as any).google?.accounts?.oauth2));
    };
    script.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

async function resolveGoogleOAuthClientId(): Promise<string | null> {
  if (!isFirebaseConfigured()) {
    await loadFirebaseConfigAsync();
  }
  const config = getFirebaseConfig();
  if (config.oAuthClientId && config.oAuthClientId.includes(".apps.googleusercontent.com")) {
    return config.oAuthClientId;
  }
  if (discoveredOAuthClientId) return discoveredOAuthClientId;
  if (discoveryAttempted || !config.apiKey || typeof window === "undefined") return null;

  discoveryAttempted = true;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: "google.com",
          continueUri: window.location.origin,
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const authUri = typeof data?.authUri === "string" ? data.authUri : "";
    if (authUri) {
      const parsedUrl = new URL(authUri);
      const clientId = parsedUrl.searchParams.get("client_id");
      if (clientId && clientId.includes(".apps.googleusercontent.com")) {
        discoveredOAuthClientId = clientId;
        return discoveredOAuthClientId;
      }
    }
  } catch {
    // Non-fatal: GIS silent renewal simply skips when client_id is unavailable
  }
  return null;
}

/**
 * Attempts to silently acquire or renew a Google Drive OAuth access token via
 * Google Identity Services (prompt="") without disturbing the user with popups.
 */
export async function trySilentDriveTokenRestore(
  targetUser?: User | null,
  forceRefresh = false
): Promise<{ accessToken: string; expiresIn: number } | null> {
  if (typeof window === "undefined") return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;

  const client = getAuthClient() || auth;
  const activeUser = targetUser || client?.currentUser;
  if (!activeUser) return null;

  if (!forceRefresh) {
    const existing = getStoredOAuthToken(activeUser.uid);
    if (existing) {
      return { accessToken: existing, expiresIn: 3600 };
    }
  }

  if (silentRestoreInFlight) {
    return silentRestoreInFlight;
  }

  silentRestoreInFlight = (async () => {
    try {
      const clientId = await resolveGoogleOAuthClientId();
      if (!clientId) return null;

      const scriptReady = await loadGisClientScript();
      const oauth2 = (window as any).google?.accounts?.oauth2;
      if (!scriptReady || !oauth2?.initTokenClient) {
        return null;
      }

      return await new Promise<{ accessToken: string; expiresIn: number } | null>(
        (resolve) => {
          let settled = false;
          const finish = (val: { accessToken: string; expiresIn: number } | null) => {
            if (!settled) {
              settled = true;
              clearTimeout(timeoutId);
              resolve(val);
            }
          };

          const timeoutId = setTimeout(() => finish(null), 5500);

          try {
            const tokenClient = oauth2.initTokenClient({
              client_id: clientId,
              scope: DRIVE_APPDATA_SCOPE,
              hint: activeUser.email || undefined,
              prompt: "",
              callback: (resp: any) => {
                if (resp?.access_token && !resp?.error) {
                  const expiresIn = Number(resp.expires_in) || 3600;
                  saveStoredOAuthToken(resp.access_token, expiresIn, activeUser.uid);
                  finish({ accessToken: resp.access_token, expiresIn });
                } else {
                  finish(null);
                }
              },
              error_callback: () => finish(null),
            });

            tokenClient.requestAccessToken({ prompt: "" });
          } catch {
            finish(null);
          }
        }
      );
    } catch {
      return null;
    } finally {
      silentRestoreInFlight = null;
    }
  })();

  return silentRestoreInFlight;
}

export interface GoogleSignInOptions {
  mode?: "login" | "switch" | "reconnect";
  expectedUid?: string;
  loginHint?: string | null;
}

/**
 * Initiates Google OAuth Sign-in or Drive Reconnection with appDataFolder scope.
 * - mode="switch": forces account chooser (prompt="select_account").
 * - mode="reconnect": reauthenticates the active user seamlessly via login_hint without forcing account switch.
 */
export async function signInWithGoogle(
  options: GoogleSignInOptions = {}
): Promise<{
  user: User;
  accessToken: string;
}> {
  if (isSigningIn) {
    throw new Error("В момента тече вход в Google. Моля изчакайте.");
  }

  const mode = options.mode || "login";

  try {
    isSigningIn = true;

    // Ensure config is loaded if not yet set in environment
    if (!isFirebaseConfigured()) {
      await loadFirebaseConfigAsync();
    }

    const client = getAuthClient() || auth;
    if (!client) {
      throw new Error(
        "Google Authentication не е конфигуриран. Моля настройте VITE_FIREBASE_API_KEY в .env или GitHub Secrets."
      );
    }

    const currentUser = client.currentUser;
    const hintEmail = options.loginHint || currentUser?.email || null;

    // For reconnects, first try silent GIS token restoration (no popup needed if Google session is active)
    if (mode === "reconnect" && currentUser) {
      const silentRes = await trySilentDriveTokenRestore(currentUser);
      if (silentRes?.accessToken) {
        return { user: currentUser, accessToken: silentRes.accessToken };
      }
    }

    const provider = createGoogleProvider(
      mode === "switch"
        ? { prompt: "select_account" }
        : mode === "reconnect"
        ? { loginHint: hintEmail }
        : { prompt: currentUser ? undefined : "select_account", loginHint: hintEmail }
    );

    let result;
    try {
      if (mode === "reconnect" && currentUser) {
        result = await reauthenticateWithPopup(
          currentUser,
          provider,
          browserPopupRedirectResolver
        );
      } else {
        result = await signInWithPopup(client, provider, browserPopupRedirectResolver);
      }
    } catch (popupErr: any) {
      // If reauthenticateWithPopup encountered user mismatch or credential error, fall back safely
      if (mode === "reconnect" && popupErr?.code === "auth/user-mismatch") {
        throw new Error(
          "Избраният Google профил е различен от текущия. Използвайте бутона 'Смени акаунта', за да не смесвате данните."
        );
      }
      if (
        popupErr?.code === "auth/popup-blocked" ||
        popupErr?.code === "auth/cancelled-popup-request"
      ) {
        console.warn("Popup blocked or interrupted, falling back to signInWithRedirect...");
        await signInWithRedirect(client, provider, browserPopupRedirectResolver);
        return new Promise(() => {});
      }
      throw popupErr;
    }

    if (options.expectedUid && result.user.uid !== options.expectedUid && mode === "reconnect") {
      throw new Error(
        "Избраният Google профил е различен от текущия. Локалните ви данни са запазени непокътнати."
      );
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error("Не бе получен OAuth токен за достъп до Google Drive.");
    }

    saveStoredOAuthToken(credential.accessToken, 3600, result.user.uid);

    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error("Google sign-in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

/**
 * Detects Google Cloud API key HTTP Referrer restriction errors (403 PERMISSION_DENIED)
 */
export function isRefererBlockedError(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    code.includes("requests-from-referer") ||
    msg.includes("requests-from-referer") ||
    msg.includes("api_key_http_referrer_blocked") ||
    (msg.includes("referer") && msg.includes("blocked"))
  );
}

/**
 * Detects 403 access_denied / OAuth Testing mode restriction errors
 */
export function isAccessDeniedError(error: any): boolean {
  if (isRefererBlockedError(error)) return false;
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    msg.includes("access_denied") ||
    msg.includes("testing") ||
    msg.includes("test user") ||
    msg.includes("developer-approved") ||
    code.includes("access_denied") ||
    code === "auth/admin-restricted-operation"
  );
}

/**
 * Formats Firebase auth errors into human-readable Bulgarian explanations
 */
export function formatFirebaseAuthError(error: any): string {
  const code = error?.code || "";
  const msg = String(error?.message || "");
  const currentDomain = typeof window !== "undefined" ? window.location.hostname : "домейна";
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : `https://${currentDomain}`;
  const config = getFirebaseConfig();

  if (isRefererBlockedError(error)) {
    return (
      `Достъпът на Firebase API ключа от адрес (${currentOrigin}) е блокиран от Google Cloud (HTTP 403 API_KEY_HTTP_REFERRER_BLOCKED). ` +
      `Добавете "${currentOrigin}/*" и "https://${config.authDomain || `${config.projectId || "<PROJECT_ID>"}.firebaseapp.com`}/*" в Website restrictions на API ключа в Google Cloud Console -> APIs & Services -> Credentials.`
    );
  }
  if (isAccessDeniedError(error)) {
    return (
      "Грешка 403 (access_denied): OAuth приложението в Google Cloud все още е в режим 'Testing' (само за одобрени тестови потребители). " +
      "За да могат да влизат и други Google акаунти, превключете Publishing Status на 'In production' в Google Cloud Console -> Google Auth Platform -> Audience (или добавете имейла в Test users)."
    );
  }
  if (code === "auth/unauthorized-domain" || msg.includes("auth/unauthorized-domain")) {
    return `Неоторизиран домейн (${currentDomain}): Този домейн все още не е добавен в списъка "Authorized domains" във Firebase Authentication.`;
  }
  if (
    code === "auth/unauthorized-continue-uri" ||
    msg.includes("redirect_uri_mismatch")
  ) {
    return `Несъответствие в Redirect URI: Проверете Authorized redirect URIs в Google Cloud Console (трябва да съдържа https://${config.authDomain || `${config.projectId || "<PROJECT_ID>"}.firebaseapp.com`}/__/auth/handler).`;
  }
  if (code === "auth/operation-not-allowed") {
    return "Входът с Google не е активиран във Firebase Authentication (Build -> Authentication -> Sign-in method -> Google -> Enable).";
  }
  if (
    code === "auth/bad-request" ||
    msg.includes("The requested action is invalid") ||
    msg.includes("bad-request")
  ) {
    return `Грешка при OAuth заявката: В Google Cloud Console проверете ограниченията на API ключа и добавете "${currentOrigin}/*" и "https://${config.authDomain || `${config.projectId || "<PROJECT_ID>"}.firebaseapp.com`}/*".`;
  }
  if (code === "auth/popup-closed-by-user") {
    return "Прозорецът за вход с Google беше затворен преди да завърши автентикацията.";
  }
  if (code === "auth/popup-blocked") {
    return "Браузърът блокира изскачащия прозорец за вход. Моля, разрешете popups за този сайт.";
  }
  if (code === "auth/cancelled-popup-request") {
    return "Заявката за вход беше прекъсната от друга операция.";
  }
  if (code === "auth/network-request-failed") {
    return "Мрежова грешка при свързване със сървърите на Google. Проверете интернет връзката си.";
  }
  return msg || "Възникна неочаквана грешка при вход с Google.";
}

export function isUnauthorizedDomainError(error: any): boolean {
  return (
    error?.code === "auth/unauthorized-domain" ||
    Boolean(error?.message?.includes("auth/unauthorized-domain"))
  );
}

/**
 * Signs out from Google/Firebase and clears all in-memory tokens and legacy keys
 */
export async function signOutGoogle(): Promise<void> {
  const client = getAuthClient() || auth;
  try {
    if (client) {
      await signOut(client);
    }
  } catch (e) {
    console.warn("Sign out warning:", e);
  } finally {
    clearStoredOAuthToken();
  }
}

/**
 * Gets valid Google access token strictly from memory for the active user
 */
export async function getGoogleAccessToken(expectedUid?: string): Promise<string | null> {
  const client = getAuthClient() || auth;
  const activeUid = expectedUid || client?.currentUser?.uid;
  if (!activeUid) return null;
  return getStoredOAuthToken(activeUid);
}

/**
 * Ensures a valid Google OAuth Access Token is available in memory.
 * If missing or expired:
 * - When interactive is true, triggers signInWithGoogle to renew consent/token seamlessly.
 * - When interactive is false, returns null without disturbing the user.
 */
export async function ensureGoogleAccessToken(
  interactive = false,
  expectedUid?: string
): Promise<string | null> {
  const currentToken = await getGoogleAccessToken(expectedUid);
  if (currentToken) {
    return currentToken;
  }

  const client = getAuthClient() || auth;
  const activeUser = client?.currentUser;
  if (activeUser && (!expectedUid || activeUser.uid === expectedUid)) {
    const silentRes = await trySilentDriveTokenRestore(activeUser);
    if (silentRes?.accessToken) {
      return silentRes.accessToken;
    }
  }

  if (!interactive) {
    return null;
  }

  const result = await signInWithGoogle({
    mode: activeUser ? "reconnect" : "login",
    expectedUid: expectedUid || activeUser?.uid,
    loginHint: activeUser?.email,
  });
  return result.accessToken || null;
}

/**
 * Initializes Google Auth state observer with proper async cleanup.
 */
export function initGoogleAuth(
  onUserChanged: (user: User | null, token: string | null) => void,
  onAuthError?: (error: any) => void
): () => void {
  let isDisposed = false;
  let unsubscribeAuth: (() => void) | null = null;

  const attachObserver = (activeClient: Auth) => {
    if (isDisposed) return;

    // Check if user just returned from a redirect flow on mobile
    getRedirectResult(activeClient, browserPopupRedirectResolver)
      .then((redirectResult) => {
        if (isDisposed) return;
        if (redirectResult) {
          const cred = GoogleAuthProvider.credentialFromResult(redirectResult);
          if (cred?.accessToken) {
            saveStoredOAuthToken(cred.accessToken, 3600, redirectResult.user.uid);
            onUserChanged(redirectResult.user, cred.accessToken);
          }
        }
      })
      .catch((e) => {
        console.warn("Redirect result check:", e);
        if (!isDisposed && onAuthError) {
          onAuthError(e);
        }
      });

    unsubscribeAuth = onAuthStateChanged(activeClient, (user) => {
      if (isDisposed) return;
      if (user) {
        // Invalidate cached token if it belonged to a different user
        if (cachedAccessToken && cachedAccessToken.uid !== user.uid) {
          cachedAccessToken = null;
        }
        const activeToken = getStoredOAuthToken(user.uid);
        onUserChanged(user, activeToken);
      } else {
        clearStoredOAuthToken();
        onUserChanged(null, null);
      }
    });
  };

  const client = getAuthClient() || auth;
  if (!client) {
    loadFirebaseConfigAsync()
      .then(() => {
        if (isDisposed) return;
        const resolvedClient = getAuthClient();
        if (resolvedClient) {
          attachObserver(resolvedClient);
        } else {
          // Firebase is not configured at all; resolve auth state as guest
          onUserChanged(null, null);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          onUserChanged(null, null);
        }
      });
  } else {
    attachObserver(client);
  }

  return () => {
    isDisposed = true;
    if (unsubscribeAuth) {
      unsubscribeAuth();
      unsubscribeAuth = null;
    }
  };
}
