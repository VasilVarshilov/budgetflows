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

// Google Auth Provider with appDataFolder scope
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.appdata");
provider.setCustomParameters({
  prompt: "select_account",
});

export const STORAGE_KEY_GOOGLE_USER = "HomeBudget_GoogleUser";
export const STORAGE_KEY_GOOGLE_TOKEN = "HomeBudget_GoogleOAuthToken";
export const STORAGE_KEY_AUTO_BACKUP = "HomeBudget_AutoBackup";
export const STORAGE_KEY_LAST_SYNC = "HomeBudget_LastCloudSync";

export interface StoredUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  lastLogin: string;
}

export interface StoredOAuthToken {
  token: string;
  expiresAt: number;
  savedAt: number;
}

// In-memory cache for the OAuth access token
let cachedAccessToken: string | null = null;
let isSigningIn = false;

/**
 * Saves or clears the Google OAuth token in memory and secure web storage with expiration
 */
export function saveStoredOAuthToken(token: string | null, expiresInSeconds = 3600): void {
  if (!token) {
    cachedAccessToken = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY_GOOGLE_TOKEN);
      localStorage.removeItem(STORAGE_KEY_GOOGLE_TOKEN);
    } catch {
      // ignore storage access issues
    }
    return;
  }

  cachedAccessToken = token;
  // Subtract 120s buffer so we refresh before hard expiry
  const validSeconds = Math.max(300, expiresInSeconds - 120);
  const payload: StoredOAuthToken = {
    token,
    expiresAt: Date.now() + validSeconds * 1000,
    savedAt: Date.now(),
  };

  try {
    sessionStorage.setItem(STORAGE_KEY_GOOGLE_TOKEN, JSON.stringify(payload));
  } catch (e) {
    console.warn("Could not persist token in sessionStorage:", e);
  }
  try {
    localStorage.setItem(STORAGE_KEY_GOOGLE_TOKEN, JSON.stringify(payload));
  } catch (e) {
    console.warn("Could not persist token in localStorage:", e);
  }
}

/**
 * Retrieves valid Google OAuth token from memory or storage if not expired
 */
export function getStoredOAuthToken(): string | null {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY_GOOGLE_TOKEN);
    if (!raw) {
      raw = localStorage.getItem(STORAGE_KEY_GOOGLE_TOKEN);
    }
  } catch {
    raw = null;
  }

  if (!raw) return null;

  try {
    const parsed: StoredOAuthToken = JSON.parse(raw);
    if (parsed && parsed.token && typeof parsed.expiresAt === "number") {
      if (Date.now() < parsed.expiresAt) {
        cachedAccessToken = parsed.token;
        return parsed.token;
      }
    }
  } catch {
    // Malformed JSON
  }

  // Token is expired or corrupt, clear it
  saveStoredOAuthToken(null);
  return null;
}

export function clearStoredOAuthToken(): void {
  saveStoredOAuthToken(null);
}

export function isGoogleTokenValid(): boolean {
  return Boolean(getStoredOAuthToken());
}

/**
 * Returns stored user profile from localStorage if available
 */
export function getStoredUserProfile(): StoredUserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GOOGLE_USER);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Saves non-sensitive profile info locally
 */
export function saveStoredUserProfile(user: User | null): void {
  try {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY_GOOGLE_USER);
      return;
    }
    const profile: StoredUserProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      lastLogin: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY_GOOGLE_USER, JSON.stringify(profile));
  } catch (e) {
    console.warn("Failed to persist user profile:", e);
  }
}

/**
 * Initiates Google OAuth Sign-in with Drive appDataFolder scope
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
      throw new Error("Не бе получен OAuth токен за достъп от Google.");
    }

    saveStoredOAuthToken(credential.accessToken);
    saveStoredUserProfile(result.user);

    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error("Google sign-in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

/**
 * Formats Firebase auth errors into human-readable Bulgarian explanations
 */
export function formatFirebaseAuthError(error: any): string {
  const code = error?.code || "";
  const currentDomain = typeof window !== "undefined" ? window.location.hostname : "домейна";

  if (code === "auth/unauthorized-domain" || error?.message?.includes("auth/unauthorized-domain")) {
    return `Неоторизиран домейн (${currentDomain}): Този домейн все още не е добавен в списъка "Authorized domains" във Firebase Authentication.`;
  }
  if (
    code === "auth/bad-request" ||
    error?.message?.includes("The requested action is invalid") ||
    error?.message?.includes("bad-request")
  ) {
    return `Грешка при OAuth заявката (The requested action is invalid): В Google Cloud Console е необходимо да добавите "https://${currentDomain}/*" и "https://${getFirebaseConfig().projectId || "gen-lang-client-0141580200"}.firebaseapp.com/*" в списъка на разрешенията за API ключа.`;
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
  return error?.message || "Възникна неочаквана грешка при вход с Google.";
}

export function isUnauthorizedDomainError(error: any): boolean {
  return (
    error?.code === "auth/unauthorized-domain" ||
    Boolean(error?.message?.includes("auth/unauthorized-domain"))
  );
}

/**
 * Signs out from Google and clears token & cached profile
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
    saveStoredUserProfile(null);
  }
}

/**
 * Gets valid Google access token from memory or storage
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  return getStoredOAuthToken();
}

/**
 * Sets access token manually if refreshed externally
 */
export function setGoogleAccessToken(token: string | null): void {
  saveStoredOAuthToken(token);
}

/**
 * Ensures a valid Google OAuth Access Token is available.
 * If missing or expired:
 * - When interactive is true, triggers signInWithGoogle to renew consent/token seamlessly.
 * - When interactive is false, returns null without disturbing the user.
 */
export async function ensureGoogleAccessToken(
  interactive = false
): Promise<string | null> {
  const currentToken = getStoredOAuthToken();
  if (currentToken) {
    return currentToken;
  }

  if (!interactive) {
    return null;
  }

  // Trigger Google sign-in to renew token with Google Drive appDataFolder scope
  const result = await signInWithGoogle();
  return result.accessToken || null;
}

/**
 * Initializes Google Auth state observer
 */
export function initGoogleAuth(
  onUserChanged: (user: User | null, token: string | null) => void
): () => void {
  const handleAuthObserver = (activeClient: Auth) => {
    // Check if user just returned from a redirect flow on mobile
    getRedirectResult(activeClient, browserPopupRedirectResolver)
      .then((redirectResult) => {
        if (redirectResult) {
          const cred = GoogleAuthProvider.credentialFromResult(redirectResult);
          if (cred?.accessToken) {
            saveStoredOAuthToken(cred.accessToken);
            saveStoredUserProfile(redirectResult.user);
            onUserChanged(redirectResult.user, cred.accessToken);
          }
        }
      })
      .catch((e) => {
        console.warn("Redirect result check:", e);
      });

    return onAuthStateChanged(activeClient, async (user) => {
      if (user) {
        saveStoredUserProfile(user);
        const activeToken = getStoredOAuthToken();
        onUserChanged(user, activeToken);
      } else {
        clearStoredOAuthToken();
        saveStoredUserProfile(null);
        onUserChanged(null, null);
      }
    });
  };

  const client = getAuthClient() || auth;
  if (!client) {
    loadFirebaseConfigAsync().then(() => {
      const resolvedClient = getAuthClient();
      if (resolvedClient) {
        handleAuthObserver(resolvedClient);
      }
    });
    return () => {};
  }

  return handleAuthObserver(client);
}
