export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  oAuthClientId?: string;
  measurementId?: string;
}

// In-memory runtime cache
let runtimeConfig: FirebaseConfig | null = null;

/**
 * Resolves Firebase configuration safely from Vite environment variables.
 * None of the keys are committed into repository source control.
 */
export function getFirebaseConfig(): FirebaseConfig {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  // Check Vite environment variables (populated from .env or CI/CD secrets)
  const envApiKey = (import.meta as any).env?.VITE_FIREBASE_API_KEY || "";
  const envProjectId = (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "";
  const envAuthDomain = (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "";
  const envStorageBucket = (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || "";
  const envMessagingSenderId = (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "";
  const envAppId = (import.meta as any).env?.VITE_FIREBASE_APP_ID || "";
  const envOAuthClientId = (import.meta as any).env?.VITE_FIREBASE_OAUTH_CLIENT_ID || "";

  runtimeConfig = {
    apiKey: envApiKey,
    authDomain: envAuthDomain || (envProjectId ? `${envProjectId}.firebaseapp.com` : ""),
    projectId: envProjectId,
    storageBucket: envStorageBucket || (envProjectId ? `${envProjectId}.firebasestorage.app` : ""),
    messagingSenderId: envMessagingSenderId,
    appId: envAppId,
    oAuthClientId: envOAuthClientId,
  };

  return runtimeConfig;
}

/**
 * Checks whether Firebase credentials have been configured
 */
export function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig();
  return Boolean(config.apiKey && config.apiKey.length > 5 && config.projectId);
}

/**
 * Allows dynamic injection of config (e.g. from /api/firebase-config in dev)
 */
export function setRuntimeFirebaseConfig(config: FirebaseConfig): void {
  runtimeConfig = { ...config };
}

/**
 * Async initialization helper: tries env vars first, then /api/firebase-config fallback
 */
export async function loadFirebaseConfigAsync(): Promise<FirebaseConfig> {
  const existing = getFirebaseConfig();
  if (existing.apiKey) {
    return existing;
  }

  try {
    const res = await fetch("/api/firebase-config");
    if (res.ok) {
      const data = await res.json();
      if (data && data.apiKey) {
        setRuntimeFirebaseConfig(data);
        return data;
      }
    }
  } catch {
    // Ignore network failure when running in offline or purely static mode
  }

  return existing;
}
