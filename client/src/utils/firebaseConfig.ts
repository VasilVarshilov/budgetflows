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
 * Self-heals Firebase configuration in case environment variables or secrets
 * were entered in shifted slots (e.g. projectId in authDomain, appId in storageBucket).
 */
export function normalizeFirebaseConfig(
  raw: Partial<Record<keyof FirebaseConfig, string | undefined>>
): FirebaseConfig {
  const candidates = [
    raw.apiKey,
    raw.authDomain,
    raw.projectId,
    raw.storageBucket,
    raw.messagingSenderId,
    raw.appId,
    raw.oAuthClientId,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  const apiKey =
    candidates.find((v) => v.startsWith("AIza")) || raw.apiKey || "";
  const appId =
    candidates.find((v) =>
      /^\d+:\d+:(web|ios|android):[a-zA-Z0-9]+$/.test(v)
    ) ||
    raw.appId ||
    "";
  const authDomainCandidate =
    candidates.find(
      (v) => v.endsWith(".firebaseapp.com") || v.endsWith(".web.app")
    ) || "";
  const storageBucketCandidate =
    candidates.find(
      (v) => v.endsWith(".firebasestorage.app") || v.endsWith(".appspot.com")
    ) || "";
  const messagingSenderId =
    candidates.find((v) => /^\d{6,20}$/.test(v)) ||
    raw.messagingSenderId ||
    "";
  const oAuthClientId =
    candidates.find((v) => v.endsWith(".apps.googleusercontent.com")) ||
    raw.oAuthClientId ||
    "";

  const knownSpecials = new Set(
    [
      apiKey,
      appId,
      authDomainCandidate,
      storageBucketCandidate,
      messagingSenderId,
      oAuthClientId,
    ].filter(Boolean)
  );

  const projectIdFromDomain = authDomainCandidate
    ? authDomainCandidate.replace(/\.(firebaseapp\.com|web\.app)$/, "")
    : "";
  const projectIdFromBucket = storageBucketCandidate
    ? storageBucketCandidate.replace(/\.(firebasestorage\.app|appspot\.com)$/, "")
    : "";

  const projectId =
    candidates.find((v) => !knownSpecials.has(v) && !v.includes(".")) ||
    projectIdFromDomain ||
    projectIdFromBucket ||
    raw.projectId ||
    "";

  const authDomain =
    authDomainCandidate ||
    (raw.authDomain && raw.authDomain.includes(".") ? raw.authDomain : "") ||
    (projectId ? `${projectId}.firebaseapp.com` : "");

  const storageBucket =
    storageBucketCandidate ||
    (raw.storageBucket && raw.storageBucket.includes(".")
      ? raw.storageBucket
      : "") ||
    (projectId ? `${projectId}.firebasestorage.app` : "");

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    oAuthClientId,
    measurementId: raw.measurementId,
  };
}

/**
 * Resolves Firebase configuration safely from Vite environment variables.
 * None of the keys are committed into repository source control.
 */
export function getFirebaseConfig(): FirebaseConfig {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  // Check Vite environment variables (populated from .env or CI/CD secrets)
  const raw: Partial<Record<keyof FirebaseConfig, string>> = {
    apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || "",
    projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "",
    authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "",
    storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId:
      (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || "",
    oAuthClientId: (import.meta as any).env?.VITE_FIREBASE_OAUTH_CLIENT_ID || "",
  };

  runtimeConfig = normalizeFirebaseConfig(raw);
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
  runtimeConfig = normalizeFirebaseConfig(config);
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
        return getFirebaseConfig();
      }
    }
  } catch {
    // Ignore network failure when running in offline or purely static mode
  }

  return existing;
}
