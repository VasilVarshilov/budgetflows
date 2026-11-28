import {
  getUserStorageKey,
  sanitizeUid,
  STORAGE_BASE_BUDGETS,
  STORAGE_BASE_CATEGORIES,
  STORAGE_BASE_DEFAULTS_INITIALIZED,
  STORAGE_BASE_ELECTRICITY_HISTORY,
  STORAGE_BASE_ELECTRICITY_LAST,
  STORAGE_BASE_LAST_SYNC,
  STORAGE_BASE_LOCAL_UPDATED_AT,
  STORAGE_BASE_MONTHLY,
  STORAGE_BASE_RECURRING_INCOMES,
  STORAGE_BASE_SAVINGS,
  STORAGE_BASE_SAVINGS_GOALS,
  STORAGE_BASE_SETTINGS,
  STORAGE_BASE_TOTAL_BUDGET,
  STORAGE_BASE_CLOUD_FILE_INFO,
  userStorage,
} from "./userStorage";

const EXISTING_WORKSPACE_BASE_KEYS = [
  STORAGE_BASE_MONTHLY,
  STORAGE_BASE_SAVINGS,
  STORAGE_BASE_SAVINGS_GOALS,
  STORAGE_BASE_RECURRING_INCOMES,
  STORAGE_BASE_BUDGETS,
  STORAGE_BASE_TOTAL_BUDGET,
  STORAGE_BASE_ELECTRICITY_HISTORY,
  STORAGE_BASE_ELECTRICITY_LAST,
  STORAGE_BASE_CATEGORIES,
  STORAGE_BASE_SETTINGS,
  STORAGE_BASE_LOCAL_UPDATED_AT,
  STORAGE_BASE_LAST_SYNC,
  STORAGE_BASE_CLOUD_FILE_INFO,
];

const LEGACY_GUEST_STORAGE_KEYS = [
  "HomeBudget_Data",
  "HomeBudget_GlobalSavings",
  "HomeBudget_ElectricityLastReadings",
  "HomeBudget_ElectricityHistory",
  "HomeBudget_Categories",
  "HomeBudget_Budgets",
  "HomeBudget_TotalMonthlyBudget",
  "HomeBudget_Settings",
  "HomeBudget_RecurringIncomes",
  "HomeBudget_AutoBackup",
  "HomeBudget_LastCloudSync",
];

/**
 * Checks whether a workspace namespace has never been initialized and contains
 * zero pre-existing user data (both namespaced and, for guest, legacy keys).
 * Reads localStorage directly without triggering migrations or mutations.
 */
export function isBrandNewUserWorkspace(specificUid?: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  const targetUid = sanitizeUid(specificUid || userStorage.getActiveUid());

  const initializedKey = getUserStorageKey(STORAGE_BASE_DEFAULTS_INITIALIZED, targetUid);
  if (window.localStorage.getItem(initializedKey) !== null) {
    return false;
  }

  for (const baseKey of EXISTING_WORKSPACE_BASE_KEYS) {
    const namespacedKey = getUserStorageKey(baseKey, targetUid);
    if (window.localStorage.getItem(namespacedKey) !== null) {
      return false;
    }
  }

  if (targetUid === "guest") {
    for (const legacyKey of LEGACY_GUEST_STORAGE_KEYS) {
      if (window.localStorage.getItem(legacyKey) !== null) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Marks a brand-new user workspace as initialized with a completely clean slate
 * (zero seeded goals, Emergency Fund, budgets, incomes, expenses, electricity history,
 * or notifications). Existing users are marked initialized without touching any data.
 * Does NOT call markLocalModified so cloud-sync fresh-device Drive restore detection stays intact.
 */
export function ensureNewUserDefaults(specificUid?: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  const targetUid = sanitizeUid(specificUid || userStorage.getActiveUid());

  const initializedKey = getUserStorageKey(STORAGE_BASE_DEFAULTS_INITIALIZED, targetUid);
  if (window.localStorage.getItem(initializedKey) !== null) {
    return false;
  }

  if (!isBrandNewUserWorkspace(targetUid)) {
    userStorage.setItem(STORAGE_BASE_DEFAULTS_INITIALIZED, "true", targetUid);
    return false;
  }

  userStorage.setItem(STORAGE_BASE_DEFAULTS_INITIALIZED, "true", targetUid);
  return true;
}
