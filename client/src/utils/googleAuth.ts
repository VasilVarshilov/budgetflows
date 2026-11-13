import { initializeApp, getApps, getApp as getSdkApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
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
 * Creates a configured GoogleAuthProvider with least-privilege appDataFolder scope
 * and prompt=select_account so multiple Google accounts can sign in or switch seamlessly.
 */
function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/drive.appdata");
  provider.setCustomParameters({
    prompt: "select_account",
  });
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

/**
 * Initiates Google OAuth Sign-in with Drive appDataFolder scope.
 * Uses prompt=select_account to support multiple accounts & switching.
 */
export async function signInWithGoogle(): Promise<{
  user: User;
  accessToken: string;
}> {
  if (isSigningIn) {
    throw new Error("В момента тече вход в Google. Моля изчакайте.");
  }

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

    const provider = createGoogleProvider();

    let result;
    try {
      result = await signInWithPopup(client, provider, browserPopupRedirectResolver);
    } catch (popupErr: any) {
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
 * Detects 403 access_denied / OAuth Testing mode restriction errors
 */
export function isAccessDeniedError(error: any): boolean {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    msg.includes("access_denied") ||
    msg.includes("403") ||
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
  const config = getFirebaseConfig();

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
    return `Грешка при OAuth заявката: В Google Cloud Console проверете ограниченията на API ключа и добавете "https://${currentDomain}/*" и "https://${config.authDomain || `${config.projectId || "<PROJECT_ID>"}.firebaseapp.com`}/*".`;
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

  if (!interactive) {
    return null;
  }

  const result = await signInWithGoogle();
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
