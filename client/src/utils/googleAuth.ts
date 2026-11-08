import { initializeApp, getApps, getApp as getSdkApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
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
export const STORAGE_KEY_AUTO_BACKUP = "HomeBudget_AutoBackup";
export const STORAGE_KEY_LAST_SYNC = "HomeBudget_LastCloudSync";

export interface StoredUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  lastLogin: string;
}

// In-memory cache for the OAuth access token (per security guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

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

    const result = await signInWithPopup(client, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error("Не бе получен OAuth токен за достъп от Google.");
    }

    cachedAccessToken = credential.accessToken;
    saveStoredUserProfile(result.user);

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Google sign-in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

/**
 * Signs out from Google and clears in-memory token & cached profile
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
    cachedAccessToken = null;
    saveStoredUserProfile(null);
  }
}

/**
 * Gets cached access token
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

/**
 * Sets access token manually if refreshed
 */
export function setGoogleAccessToken(token: string | null): void {
  cachedAccessToken = token;
}

/**
 * Initializes Google Auth state observer
 */
export function initGoogleAuth(
  onUserChanged: (user: User | null, token: string | null) => void
): () => void {
  const client = getAuthClient() || auth;
  if (!client) {
    // Attempt async resolution in the background
    loadFirebaseConfigAsync().then(() => {
      const resolvedClient = getAuthClient();
      if (resolvedClient) {
        return onAuthStateChanged(resolvedClient, async (user) => {
          if (user) {
            saveStoredUserProfile(user);
            onUserChanged(user, cachedAccessToken);
          } else {
            cachedAccessToken = null;
            onUserChanged(null, null);
          }
        });
      }
    });
    return () => {};
  }

  return onAuthStateChanged(client, async (user) => {
    if (user) {
      saveStoredUserProfile(user);
      onUserChanged(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      onUserChanged(null, null);
    }
  });
}
