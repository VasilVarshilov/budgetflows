/**
 * User Storage & Account Isolation Module
 * Guarantees complete data isolation per authenticated user (Firebase UID / Google Account ID).
 * Namespace format: budgetflows_user_<uid>_<baseKey>
 * Unauthenticated / Guest namespace: budgetflows_user_guest_<baseKey>
 */

// Storage Base Keys
export const STORAGE_BASE_MONTHLY = "Data";
export const STORAGE_BASE_SAVINGS = "GlobalSavings";
export const STORAGE_BASE_ELECTRICITY_LAST = "ElectricityLastReadings";
export const STORAGE_BASE_ELECTRICITY_HISTORY = "ElectricityHistory";
export const STORAGE_BASE_CATEGORIES = "Categories";
export const STORAGE_BASE_BUDGETS = "Budgets";
export const STORAGE_BASE_TOTAL_BUDGET = "TotalBudget";
export const STORAGE_BASE_SETTINGS = "Settings";
export const STORAGE_BASE_AUTO_BACKUP = "AutoBackup";
export const STORAGE_BASE_LAST_SYNC = "LastCloudSync";
export const STORAGE_BASE_DISMISSED_RESTORE_PROMPT = "DismissedRestorePrompt";

// Legacy keys for one-time seamless migration to guest namespace
const LEGACY_KEY_MAP: Record<string, string> = {
  [STORAGE_BASE_MONTHLY]: "HomeBudget_Data",
  [STORAGE_BASE_SAVINGS]: "HomeBudget_GlobalSavings",
  [STORAGE_BASE_ELECTRICITY_LAST]: "HomeBudget_ElectricityLastReadings",
  [STORAGE_BASE_ELECTRICITY_HISTORY]: "HomeBudget_ElectricityHistory",
  [STORAGE_BASE_CATEGORIES]: "HomeBudget_Categories",
  [STORAGE_BASE_BUDGETS]: "HomeBudget_Budgets",
  [STORAGE_BASE_TOTAL_BUDGET]: "HomeBudget_TotalBudget",
  [STORAGE_BASE_SETTINGS]: "HomeBudget_Settings",
  [STORAGE_BASE_AUTO_BACKUP]: "HomeBudget_AutoBackup",
  [STORAGE_BASE_LAST_SYNC]: "HomeBudget_LastCloudSync",
};

// Global active user state (defaults to guest until auth resolves)
let activeUid: string = "guest";

function sanitizeUid(uid: string): string {
  if (!uid || typeof uid !== "string") return "guest";
  return uid.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Changes the active storage account and notifies all subscribed listeners.
 */
export function setActiveStorageUser(uid: string | null | undefined): void {
  const sanitized = uid ? sanitizeUid(uid) : "guest";
  if (activeUid !== sanitized) {
    const previous = activeUid;
    activeUid = sanitized;
    console.log(`[UserStorage] 🔄 Account context switched: ${previous} -> ${activeUid}`);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("budgetflows:account-changed", {
          detail: { previousUid: previous, newUid: activeUid },
        })
      );
    }
  }
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

    // Backward compatibility: If guest namespace is empty, check legacy un-namespaced key
    if (targetUid === "guest" && LEGACY_KEY_MAP[baseKey]) {
      const legacyVal = localStorage.getItem(LEGACY_KEY_MAP[baseKey]);
      if (legacyVal !== null) {
        // Migrate to guest namespace
        localStorage.setItem(key, legacyVal);
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
 * Checks whether the given user has any local data stored on this device.
 * Used to detect fresh logins on new devices (Phone, Tablet, Laptop) to offer cloud restore.
 */
export function isUserStorageEmpty(specificUid?: string): boolean {
  const targetUid = specificUid ? sanitizeUid(specificUid) : activeUid;
  const rawMonthly = getUserItem(STORAGE_BASE_MONTHLY, targetUid);
  const rawSavings = getUserItem(STORAGE_BASE_SAVINGS, targetUid);
  const rawElectricity = getUserItem(STORAGE_BASE_ELECTRICITY_HISTORY, targetUid);

  const hasMonthly = Boolean(rawMonthly && rawMonthly.length > 5 && rawMonthly !== "{}");
  const hasSavings = Boolean(rawSavings && rawSavings.length > 5 && rawSavings !== "[]");
  const hasElectricity = Boolean(rawElectricity && rawElectricity.length > 10 && rawElectricity !== "[]");

  return !hasMonthly && !hasSavings && !hasElectricity;
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
    console.log(`[UserStorage] 🧹 Cleared isolated storage for account: ${targetUid}`);
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
  getActiveUid: getActiveStorageUser,
  setActiveUid: setActiveStorageUser,
  getKey: getUserStorageKey,
};
