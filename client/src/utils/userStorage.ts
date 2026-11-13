/**
 * User Storage & Account Isolation Module
 * Guarantees complete data isolation per authenticated user (Firebase UID / Google Account ID).
 * Namespace format: budgetflows_user_<uid>_<baseKey>
 * Unauthenticated / Guest namespace: budgetflows_user_guest_<baseKey>
 */

// Storage Base Keys (all user-owned data is strictly scoped under activeUid)
export const STORAGE_BASE_MONTHLY = "Data";
export const STORAGE_BASE_SAVINGS = "GlobalSavings";
export const STORAGE_BASE_ELECTRICITY_LAST = "ElectricityLastReadings";
export const STORAGE_BASE_ELECTRICITY_HISTORY = "ElectricityHistory";
export const STORAGE_BASE_CATEGORIES = "Categories";
export const STORAGE_BASE_BUDGETS = "Budgets";
export const STORAGE_BASE_TOTAL_BUDGET = "TotalMonthlyBudget";
export const STORAGE_BASE_SETTINGS = "Settings";
export const STORAGE_BASE_RECURRING_INCOMES = "RecurringIncomes";
export const STORAGE_BASE_AUTO_BACKUP = "AutoBackup";
export const STORAGE_BASE_LAST_SYNC = "LastCloudSync";
export const STORAGE_BASE_DISMISSED_RESTORE_PROMPT = "DismissedRestorePrompt";
export const STORAGE_BASE_PRE_RESTORE_PREFIX = "PreRestore_Backup_";

// Legacy un-namespaced keys for one-time migration ONLY to the guest namespace
const LEGACY_KEY_MAP: Record<string, string> = {
  [STORAGE_BASE_MONTHLY]: "HomeBudget_Data",
  [STORAGE_BASE_SAVINGS]: "HomeBudget_GlobalSavings",
  [STORAGE_BASE_ELECTRICITY_LAST]: "HomeBudget_ElectricityLastReadings",
  [STORAGE_BASE_ELECTRICITY_HISTORY]: "HomeBudget_ElectricityHistory",
  [STORAGE_BASE_CATEGORIES]: "HomeBudget_Categories",
  [STORAGE_BASE_BUDGETS]: "HomeBudget_Budgets",
  [STORAGE_BASE_TOTAL_BUDGET]: "HomeBudget_TotalMonthlyBudget",
  [STORAGE_BASE_SETTINGS]: "HomeBudget_Settings",
  [STORAGE_BASE_RECURRING_INCOMES]: "HomeBudget_RecurringIncomes",
  [STORAGE_BASE_AUTO_BACKUP]: "HomeBudget_AutoBackup",
  [STORAGE_BASE_LAST_SYNC]: "HomeBudget_LastCloudSync",
};

// Legacy shared auth/session keys that must never remain in plain storage
const LEGACY_SHARED_SESSION_KEYS = [
  "HomeBudget_GoogleUser",
  "HomeBudget_GoogleOAuthToken",
  "HomeBudget_AutoBackup",
  "HomeBudget_LastCloudSync",
];

// Global active user state (defaults to guest until auth resolves)
let activeUid: string = "guest";

export function sanitizeUid(uid: string): string {
  if (!uid || typeof uid !== "string") return "guest";
  return uid.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Removes legacy shared session/auth/token keys from browser storage
 * so no user profile or token ever leaks across accounts.
 */
export function purgeLegacySharedKeys(): void {
  if (typeof window === "undefined") return;
  try {
    LEGACY_SHARED_SESSION_KEYS.forEach((key) => {
      try {
        window.localStorage?.removeItem(key);
        window.sessionStorage?.removeItem(key);
      } catch {
        // ignore
      }
    });

    // Also remove any legacy un-namespaced PreRestore_Backup keys
    if (window.localStorage) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("HomeBudget_PreRestore_Backup_")) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    }
  } catch {
    // ignore storage access issues
  }
}

/**
 * Changes the active storage account and notifies all subscribed listeners.
 */
export function setActiveStorageUser(uid: string | null | undefined): string {
  const sanitized = uid ? sanitizeUid(uid) : "guest";
  if (activeUid !== sanitized) {
    const previous = activeUid;
    activeUid = sanitized;

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("budgetflows:account-changed", {
          detail: { previousUid: previous, newUid: activeUid },
        })
      );
    }
  }
  return activeUid;
}

/**
 * Returns the currently active storage user identifier ("guest" or Firebase UID).
 */
export function getActiveStorageUser(): string {
  return activeUid;
}

/**
 * Resolves account-isolated localStorage key.
 * Format: budgetflows_user_<uid>_<baseKey>
 */
export function getUserStorageKey(baseKey: string, specificUid?: string): string {
  const targetUid = specificUid ? sanitizeUid(specificUid) : activeUid;
  return `budgetflows_user_${targetUid}_${baseKey}`;
}

/**
 * Safe local storage reader for the active user account.
 */
export function getUserItem(baseKey: string, specificUid?: string): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const targetUid = specificUid ? sanitizeUid(specificUid) : activeUid;
  const key = getUserStorageKey(baseKey, targetUid);

  try {
    const val = localStorage.getItem(key);
    if (val !== null) return val;

    // Backward compatibility: ONLY for unauthenticated guest namespace,
    // migrate legacy un-namespaced data once and delete the shared legacy key.
    if (targetUid === "guest" && LEGACY_KEY_MAP[baseKey]) {
      const legacyKey = LEGACY_KEY_MAP[baseKey];
      const legacyVal = localStorage.getItem(legacyKey);
      if (legacyVal !== null) {
        localStorage.setItem(key, legacyVal);
        localStorage.removeItem(legacyKey);
        return legacyVal;
      }
    }
    return null;
  } catch (e) {
    console.warn(`[UserStorage] Failed reading key ${key}:`, e);
    return null;
  }
}

/**
 * Safe local storage writer for the active user account.
 */
export function setUserItem(baseKey: string, value: string, specificUid?: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const targetUid = specificUid ? sanitizeUid(specificUid) : activeUid;
  const key = getUserStorageKey(baseKey, targetUid);

  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error(`[UserStorage] Failed saving key ${key}:`, e);
  }
}

/**
 * Safe local storage remover for the active user account.
 */
export function removeUserItem(baseKey: string, specificUid?: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const targetUid = specificUid ? sanitizeUid(specificUid) : activeUid;
  const key = getUserStorageKey(baseKey, targetUid);

  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`[UserStorage] Failed removing key ${key}:`, e);
  }
}

/**
 * Reads JSON safely with fallback for the active user account.
 */
export function getUserJSON<T>(baseKey: string, fallback: T, specificUid?: string): T {
  const raw = getUserItem(baseKey, specificUid);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[UserStorage] Failed parsing JSON for ${baseKey}:`, e);
    return fallback;
  }
}

/**
 * Writes JSON safely for the active user account.
 */
export function setUserJSON<T>(baseKey: string, value: T, specificUid?: string): void {
  setUserItem(baseKey, JSON.stringify(value), specificUid);
}

/**
 * Checks whether the given user has any meaningful financial data stored on this device.
 * Used to detect fresh logins on new devices (Phone, Tablet, Laptop) to offer cloud restore,
 * and to protect against auto-overwriting an existing cloud backup with empty local state.
 */
export function isUserStorageEmpty(specificUid?: string): boolean {
  const targetUid = specificUid ? sanitizeUid(specificUid) : activeUid;

  const monthly = getUserJSON<Record<string, unknown>>(STORAGE_BASE_MONTHLY, {}, targetUid);
  const hasMonthly = Boolean(monthly && typeof monthly === "object" && Object.keys(monthly).length > 0);

  const savings = getUserJSON<unknown[]>(STORAGE_BASE_SAVINGS, [], targetUid);
  const hasSavings = Array.isArray(savings) && savings.length > 0;

  const electricity = getUserJSON<Array<{ id?: string }>>(
    STORAGE_BASE_ELECTRICITY_HISTORY,
    [],
    targetUid
  );
  const hasElectricity =
    Array.isArray(electricity) &&
    electricity.some((r) => !String(r?.id || "").startsWith("elec_seed_"));

  const recurring = getUserJSON<unknown[]>(STORAGE_BASE_RECURRING_INCOMES, [], targetUid);
  const hasRecurring = Array.isArray(recurring) && recurring.length > 0;

  return !hasMonthly && !hasSavings && !hasElectricity && !hasRecurring;
}

/**
 * Saves an account-isolated emergency pre-restore snapshot (retaining max 3 most recent snapshots).
 */
export function savePreRestoreSnapshot(snapshot: unknown, specificUid?: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const targetUid = specificUid ? sanitizeUid(specificUid) : activeUid;
  const snapshotKey = `${STORAGE_BASE_PRE_RESTORE_PREFIX}${Date.now()}`;
  setUserJSON(snapshotKey, snapshot, targetUid);

  // Prune old snapshots beyond the 3 most recent for this user
  try {
    const prefix = `budgetflows_user_${targetUid}_${STORAGE_BASE_PRE_RESTORE_PREFIX}`;
    const matchingKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        matchingKeys.push(k);
      }
    }
    matchingKeys.sort();
    while (matchingKeys.length > 3) {
      const oldest = matchingKeys.shift();
      if (oldest) localStorage.removeItem(oldest);
    }
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Clears all stored data belonging to a specific user account on this device.
 */
export function clearUserStorage(specificUid?: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const targetUid = specificUid ? sanitizeUid(specificUid) : activeUid;
  const prefix = `budgetflows_user_${targetUid}_`;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.warn(`[UserStorage] Failed clearing user storage for ${targetUid}:`, e);
  }
}

/**
 * User storage helper interface
 */
export const userStorage = {
  getItem: getUserItem,
  setItem: setUserItem,
  removeItem: removeUserItem,
  getJSON: getUserJSON,
  setJSON: setUserJSON,
  isEmpty: isUserStorageEmpty,
  clear: clearUserStorage,
  savePreRestoreSnapshot,
  purgeLegacySharedKeys,
  getActiveUid: getActiveStorageUser,
  setActiveUid: setActiveStorageUser,
  getKey: getUserStorageKey,
};
