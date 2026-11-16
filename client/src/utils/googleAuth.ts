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

// Strictly in-memory cross-tab OAuth handoff channel (never writes to disk/storage).
// Allows a reloaded or newly opened tab/window to silently receive an active,
// unexpired in-memory Drive OAuth token from another open tab of the same user.
const OAUTH_SYNC_CHANNEL_NAME = "budgetflows_oauth_sync";
let oauthBroadcastChannel: BroadcastChannel | null = null;
const pendingTokenRequests = new Map<
  string,
  (res: { accessToken: string; expiresIn: number } | null) => void
>();

function getOAuthBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (oauthBroadcastChannel) return oauthBroadcastChannel;
  try {
    const channel = new BroadcastChannel(OAUTH_SYNC_CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent) => {
      const msg = event?.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "REQUEST_TOKEN" && typeof msg.uid === "string" && typeof msg.requestId === "string") {
        if (
          cachedAccessToken &&
          cachedAccessToken.uid === msg.uid &&
          Date.now() < cachedAccessToken.expiresAt
        ) {
          channel.postMessage({
            type: "TOKEN_RESPONSE",
            requestId: msg.requestId,
            uid: cachedAccessToken.uid,
            token: cachedAccessToken.token,
            expiresAt: cachedAccessToken.expiresAt,
          });
        }
        return;
      }

      if (
        msg.type === "TOKEN_RESPONSE" &&
        typeof msg.requestId === "string" &&
        typeof msg.uid === "string" &&
        typeof msg.token === "string" &&
        typeof msg.expiresAt === "number"
      ) {
        if (msg.expiresAt > Date.now() + 30_000) {
          cachedAccessToken = {
            token: msg.token,
            uid: msg.uid,
            expiresAt: msg.expiresAt,
          };
          const resolver = pendingTokenRequests.get(msg.requestId);
          if (resolver) {
            pendingTokenRequests.delete(msg.requestId);
            resolver({
              accessToken: msg.token,
              expiresIn: Math.max(60, Math.floor((msg.expiresAt - Date.now()) / 1000)),
            });
          }
        }
        return;
      }

      if (msg.type === "TOKEN_CLEARED") {
        if (!msg.uid || (cachedAccessToken && cachedAccessToken.uid === msg.uid)) {
          cachedAccessToken = null;
        }
      }
    };
    oauthBroadcastChannel = channel;
    return channel;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") {
  getOAuthBroadcastChannel();
}

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
    const prevUid = cachedAccessToken?.uid;
    cachedAccessToken = null;
    try {
      getOAuthBroadcastChannel()?.postMessage({ type: "TOKEN_CLEARED", uid: prevUid || null });
    } catch {
      // ignore
    }
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
  const prevUid = cachedAccessToken?.uid || null;
  cachedAccessToken = null;
  purgeLegacySharedKeys();
  try {
    getOAuthBroadcastChannel()?.postMessage({ type: "TOKEN_CLEARED", uid: prevUid });
  } catch {
    // ignore
  }
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

let discoveredOAuthClientId: string | null = null;
let discoveryAttempted = false;
let startupDiagnosticsLogged = false;

export interface OAuthConfigurationDiagnostics {
  currentOrigin: string;
  currentHostname: string;
  currentPath: string;
  projectId: string;
  authDomain: string;
  oAuthClientId: string | null;
  oAuthClientIdSource: "env_or_config" | "firebase_identity_toolkit" | "unresolved";
  redirectUri: string | null;
  javascriptOrigin: string;
  originMismatchReasons: string[];
}

async function resolveGoogleOAuthClientId(): Promise<{
  clientId: string | null;
  source: OAuthConfigurationDiagnostics["oAuthClientIdSource"];
}> {
  if (!isFirebaseConfigured()) {
    await loadFirebaseConfigAsync();
  }
  const config = getFirebaseConfig();
  if (config.oAuthClientId && config.oAuthClientId.includes(".apps.googleusercontent.com")) {
    return { clientId: config.oAuthClientId, source: "env_or_config" };
  }
  if (discoveredOAuthClientId) {
    return { clientId: discoveredOAuthClientId, source: "firebase_identity_toolkit" };
  }
  if (discoveryAttempted || !config.apiKey || typeof window === "undefined") {
    return { clientId: null, source: "unresolved" };
  }

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
    if (!res.ok) return { clientId: null, source: "unresolved" };
    const data = await res.json();
    const authUri = typeof data?.authUri === "string" ? data.authUri : "";
    if (authUri) {
      const parsedUrl = new URL(authUri);
      const clientId = parsedUrl.searchParams.get("client_id");
      if (clientId && clientId.includes(".apps.googleusercontent.com")) {
        discoveredOAuthClientId = clientId;
        return { clientId: discoveredOAuthClientId, source: "firebase_identity_toolkit" };
      }
    }
  } catch {
    // Non-fatal: metadata discovery is optional
  }
  return { clientId: null, source: "unresolved" };
}

/**
 * Collects active OAuth configuration metadata (origin, client ID, redirect URI, JS origin)
 * without opening any OAuth popup or initiating interactive login.
 */
export async function getOAuthConfigurationDiagnostics(): Promise<OAuthConfigurationDiagnostics> {
  if (!isFirebaseConfigured()) {
    await loadFirebaseConfigAsync();
  }
  const config = getFirebaseConfig();
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const currentHostname = typeof window !== "undefined" ? window.location.hostname : "";
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "/";
  const resolved = await resolveGoogleOAuthClientId();

  const authDomain =
    config.authDomain || (config.projectId ? `${config.projectId}.firebaseapp.com` : "");
  const redirectUri = authDomain ? `https://${authDomain}/__/auth/handler` : null;

  const originMismatchReasons: string[] = [];
  if (currentOrigin) {
    originMismatchReasons.push(
      `Direct Google OAuth / GIS requires "${currentOrigin}" (exact scheme + host + port, no path) in Google Cloud Console -> Authorized JavaScript origins.`
    );
  }
  if (currentPath && currentPath !== "/" && currentOrigin) {
    originMismatchReasons.push(
      `App is served under subpath "${currentPath}". Authorized JavaScript origins must use "${currentOrigin}" WITHOUT "${currentPath}".`
    );
  }
  if (currentHostname.endsWith(".run.app")) {
    originMismatchReasons.push(
      `Running on preview origin "${currentOrigin}". Dynamic preview URLs are not registered in Google Cloud Authorized JavaScript origins by default; Firebase Auth popup uses "${redirectUri}" instead.`
    );
  }

  return {
    currentOrigin,
    currentHostname,
    currentPath,
    projectId: config.projectId || "",
    authDomain,
    oAuthClientId: resolved.clientId,
    oAuthClientIdSource: resolved.source,
    redirectUri,
    javascriptOrigin: currentOrigin,
    originMismatchReasons,
  };
}

/**
 * Logs OAuth configuration diagnostics safely to the console (never leaks secrets or raw tokens).
 */
export async function logOAuthDiagnostics(
  context: string
): Promise<OAuthConfigurationDiagnostics | null> {
  if (typeof window === "undefined") return null;
  try {
    const diag = await getOAuthConfigurationDiagnostics();
    console.info(`[BudgetFlows OAuth Diagnostics] (${context})`, {
      currentOrigin: diag.currentOrigin,
      javascriptOrigin: diag.javascriptOrigin,
      oAuthClientId: diag.oAuthClientId || "(unresolved — check Firebase Auth Google provider)",
      oAuthClientIdSource: diag.oAuthClientIdSource,
      redirectUri: diag.redirectUri || "(not configured)",
      authDomain: diag.authDomain || "(not configured)",
      projectId: diag.projectId || "(not configured)",
      originMismatchCheck: diag.originMismatchReasons,
    });
    return diag;
  } catch {
    return null;
  }
}

/**
 * Passively attempts to restore a valid Google Drive OAuth access token without opening popups:
 * 1. Checks current-tab in-memory token cache (if unexpired and matching UID).
 * 2. Requests an active, unexpired in-memory token from any sibling open tab/window via BroadcastChannel.
 * NEVER stores tokens in localStorage/sessionStorage and NEVER opens automatic OAuth popups.
 */
export async function trySilentDriveTokenRestore(
  targetUser?: User | null,
  forceRefresh = false
): Promise<{ accessToken: string; expiresIn: number } | null> {
  if (typeof window === "undefined") return null;
  if (forceRefresh) return null;

  const client = getAuthClient() || auth;
  const activeUser = targetUser || client?.currentUser;
  if (!activeUser) return null;

  const existing = getStoredOAuthToken(activeUser.uid);
  if (existing) {
    const exp = getGoogleTokenExpiresAt(activeUser.uid);
    const remainingSec = exp ? Math.max(60, Math.floor((exp - Date.now()) / 1000)) : 3600;
    return { accessToken: existing, expiresIn: remainingSec };
  }

  const channel = getOAuthBroadcastChannel();
  if (!channel) return null;

  return new Promise<{ accessToken: string; expiresIn: number } | null>((resolve) => {
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      pendingTokenRequests.delete(requestId);
      resolve(null);
    }, 150);

    pendingTokenRequests.set(requestId, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    });

    try {
      channel.postMessage({
        type: "REQUEST_TOKEN",
        uid: activeUser.uid,
        requestId,
      });
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        pendingTokenRequests.delete(requestId);
        resolve(null);
      }
    }
  });
}

export interface GoogleSignInOptions {
  mode?: "login" | "switch" | "reconnect";
  expectedUid?: string;
  loginHint?: string | null;
}

/**
 * Initiates Google OAuth Sign-in or Drive Reconnection with appDataFolder scope.
 * MUST ONLY be called in direct response to an explicit user action (button click).
 * - mode="switch": forces account chooser (prompt="select_account").
 * - mode="reconnect": reauthenticates the active user via login_hint using Firebase Auth popup handler.
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

    await logOAuthDiagnostics(`explicit_${mode}`);

    const client = getAuthClient() || auth;
    if (!client) {
      throw new Error(
        "Google Authentication не е конфигуриран. Моля настройте VITE_FIREBASE_API_KEY в .env или GitHub Secrets."
      );
    }

    const currentUser = client.currentUser;
    const hintEmail = options.loginHint || currentUser?.email || null;

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
    if (isOriginMismatchError(error)) {
      void logOAuthDiagnostics("origin_mismatch_detected");
    }
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
 * Detects OAuth 400 origin_mismatch / storagerelay invalid origin errors
 */
export function isOriginMismatchError(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    msg.includes("origin_mismatch") ||
    msg.includes("invalid_origin") ||
    msg.includes("storagerelay") ||
    code.includes("origin_mismatch") ||
    code === "auth/unauthorized-continue-uri"
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
  const redirectUri = `https://${config.authDomain || `${config.projectId || "<PROJECT_ID>"}.firebaseapp.com`}/__/auth/handler`;

  if (isRefererBlockedError(error)) {
    return (
      `Достъпът на Firebase API ключа от адрес (${currentOrigin}) е блокиран от Google Cloud (HTTP 403 API_KEY_HTTP_REFERRER_BLOCKED). ` +
      `Добавете "${currentOrigin}/*" и "https://${config.authDomain || `${config.projectId || "<PROJECT_ID>"}.firebaseapp.com`}/*" в Website restrictions на API ключа в Google Cloud Console -> APIs & Services -> Credentials.`
    );
  }
  if (isOriginMismatchError(error)) {
    return (
      `Грешка 400 (origin_mismatch): Текущият JavaScript origin (${currentOrigin}) не е добавен в "Authorized JavaScript origins" ` +
      `или Redirect URI (${redirectUri}) липсва в OAuth 2.0 Client ID в Google Cloud Console -> APIs & Services -> Credentials.`
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
    return `Несъответствие в Redirect URI: Проверете Authorized redirect URIs в Google Cloud Console (трябва да съдържа ${redirectUri}).`;
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
 * - When interactive is true (explicit user action), triggers signInWithGoogle to renew consent/token.
 * - When interactive is false, returns null silently without opening any OAuth popup.
 */
export async function ensureGoogleAccessToken(
  interactive = false,
  expectedUid?: string
): Promise<string | null> {
  const currentToken = await getGoogleAccessToken(expectedUid);
  if (currentToken) {
    return currentToken;
  }

  if (!interactive) {
    return null;
  }

  const client = getAuthClient() || auth;
  const activeUser = client?.currentUser;

  const result = await signInWithGoogle({
    mode: activeUser ? "reconnect" : "login",
    expectedUid: expectedUid || activeUser?.uid,
    loginHint: activeUser?.email,
  });
  return result.accessToken || null;
}

/**
 * Initializes passive Google Auth state observer on startup.
 * Restores existing Firebase Auth session and checks in-memory Drive token
 * WITHOUT automatically launching Google OAuth popups.
 */
export function initGoogleAuth(
  onUserChanged: (user: User | null, token: string | null) => void,
  onAuthError?: (error: any) => void
): () => void {
  let isDisposed = false;
  let unsubscribeAuth: (() => void) | null = null;

  if (!startupDiagnosticsLogged) {
    startupDiagnosticsLogged = true;
    void logOAuthDiagnostics("startup_passive_restore");
  }

  const attachObserver = (activeClient: Auth) => {
    if (isDisposed) return;

    // Check passively if user just returned from an explicit redirect flow
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
