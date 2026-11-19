import { BudgetConfig, MonthlyRecord, ExpenseItem, ExpenseCategory } from "@/types";
import {
  loadStoredCategories,
  DEFAULT_CATEGORIES,
  getAiSuggestedIconAndColor,
} from "./categoryStorage";
import {
  userStorage,
  STORAGE_BASE_BUDGETS,
  STORAGE_BASE_TOTAL_BUDGET,
  STORAGE_BASE_MONTHLY,
} from "./userStorage";
import { isCompletedExpense } from "./expenseStatus";

export const STORAGE_KEY_BUDGETS = "HomeBudget_Budgets";
export const STORAGE_KEY_TOTAL_BUDGET = "HomeBudget_TotalMonthlyBudget";

export const DEFAULT_TOTAL_MONTHLY_BUDGET = 1500;

export const DEFAULT_CATEGORY_BUDGETS: BudgetConfig[] = [
  {
    id: "b_food",
    categoryName: "Храна",
    categoryId: "food",
    monthlyLimit: 400,
  },
  {
    id: "b_transport",
    categoryName: "Транспорт",
    categoryId: "transport",
    monthlyLimit: 250,
  },
  {
    id: "b_entertainment",
    categoryName: "Забавления",
    monthlyLimit: 150,
  },
  {
    id: "b_bills",
    categoryName: "Сметки и битови",
    monthlyLimit: 200,
  },
  {
    id: "b_other",
    categoryName: "Други",
    categoryId: "other",
    monthlyLimit: 100,
  },
];

export interface BudgetStatus {
  budget: BudgetConfig;
  spent: number;
  limit: number;
  remaining: number; // limit - spent
  percentage: number; // (spent / limit) * 100
  status: "green" | "yellow" | "red"; // 0-80% = green, 80-100% = yellow, 100%+ = red
  isExceeded: boolean;
  overspentAmount: number; // spent - limit (if > 0)
  warningMessage: string | null;
  iconName: string;
  colorClass: string;
  expenses: ExpenseItem[];
}

export interface OverallBudgetCalculation {
  totalMonthlyLimit: number;
  totalSpent: number;
  totalRemaining: number;
  totalPercentage: number;
  totalStatus: "green" | "yellow" | "red";
  isTotalExceeded: boolean;
  totalOverspentAmount: number;
  categoryStatuses: BudgetStatus[];
  activeWarnings: string[];
}

const DEFAULT_CAT_NAME_BY_ID = new Map(
  DEFAULT_CATEGORIES.map((c) => [c.id, c.name.trim().toLowerCase()])
);

function dispatchBudgetsUpdated(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("homebudget:budgets-updated"));
  } catch {
    // ignore in non-DOM environments
  }
}

/**
 * Resolves the canonical ExpenseCategory for a BudgetConfig.
 * Supports custom budget names (e.g. "Hobby & Gaming") linked to any ExpenseCategory
 * while ignoring legacy corrupted preset links (e.g. "b_bills" -> "electricity").
 */
export function resolveCategoryForBudget(
  budget: Pick<BudgetConfig, "categoryId" | "categoryName"> & { id?: string },
  categories: ExpenseCategory[]
): ExpenseCategory | undefined {
  const budgetNameNorm = (budget.categoryName || "").trim().toLowerCase();

  if (budget.categoryId) {
    const byId = categories.find((c) => c.id === budget.categoryId);
    if (byId) {
      const isLegacyBrokenBillsLink =
        budget.id === "b_bills" &&
        byId.id === "electricity" &&
        budgetNameNorm.includes("сметк");
      if (!isLegacyBrokenBillsLink) {
        return byId;
      }
    }
  }

  if (!budgetNameNorm) return undefined;
  return categories.find((c) => c.name.trim().toLowerCase() === budgetNameNorm);
}

/**
 * Reconciles BudgetConfig entries with stored ExpenseCategory entries so that:
 * - Custom budget display names (e.g. "Hobby & Gaming") are ALWAYS preserved.
 * - Valid linked categoryIds stay linked even when the budget has a custom name.
 * - Stale/mismatched categoryIds (e.g. legacy "b_bills" pointing to "electricity"/"Ток"
 *   while displaying "Сметки и битови", or deleted categories) are repaired safely.
 * - Renamed default categories propagate cleanly if the budget still carried the default name.
 */
export function reconcileBudgetsWithCategories(
  budgets: BudgetConfig[],
  categories: ExpenseCategory[]
): { budgets: BudgetConfig[]; changed: boolean } {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const catByNameNorm = new Map(
    categories.map((c) => [c.name.trim().toLowerCase(), c])
  );

  let changed = false;

  const reconciled = budgets.map((b) => {
    if (!b || b.id === "total_monthly" || b.categoryName === "__TOTAL_MONTHLY__") {
      return b;
    }

    const trimmedName = (b.categoryName || "").trim();
    const normName = trimmedName.toLowerCase();
    const linkedCat = b.categoryId ? catById.get(b.categoryId) : undefined;
    const exactNameCat = normName ? catByNameNorm.get(normName) : undefined;

    // 1. Linked by categoryId and found in category store
    if (linkedCat) {
      // Repair historical preset bug where "b_bills" ("Сметки и битови") pointed to "electricity"
      if (
        b.id === "b_bills" &&
        linkedCat.id === "electricity" &&
        normName.includes("сметк")
      ) {
        changed = true;
        const { categoryId: _removed, ...rest } = b;
        return {
          ...rest,
          categoryName: trimmedName,
        };
      }

      // If budget still has an empty name, fill from linked category
      if (!trimmedName) {
        changed = true;
        return { ...b, categoryName: linkedCat.name.trim() };
      }

      // If budget still has the historical default name before user renamed that default category,
      // keep it synced with the renamed category.
      const originalDefaultName = DEFAULT_CAT_NAME_BY_ID.get(linkedCat.id);
      if (
        originalDefaultName &&
        normName === originalDefaultName &&
        linkedCat.name.trim().toLowerCase() !== normName
      ) {
        changed = true;
        return {
          ...b,
          categoryId: linkedCat.id,
          categoryName: linkedCat.name.trim(),
        };
      }

      if (b.categoryName !== trimmedName) {
        changed = true;
        return { ...b, categoryName: trimmedName };
      }

      // Preserve custom budget display name AND valid linked categoryId independently
      return b;
    }

    // 2. No valid categoryId (either undefined or references a deleted/missing category)
    if (b.categoryId) {
      // Stale/deleted categoryId — repair to exact name match if any, or clear stale link
      changed = true;
      if (exactNameCat) {
        return {
          ...b,
          categoryId: exactNameCat.id,
          categoryName: trimmedName || exactNameCat.name.trim(),
        };
      }
      const { categoryId: _removed, ...rest } = b;
      return {
        ...rest,
        categoryName: trimmedName,
      };
    }

    // Backfill default unlinked budgets if an exact category exists (except grouped "Сметки и битови")
    if (exactNameCat && !(normName.includes("сметк") || normName.includes("битов"))) {
      changed = true;
      return {
        ...b,
        categoryId: exactNameCat.id,
        categoryName: trimmedName || exactNameCat.name.trim(),
      };
    }

    if (b.categoryName !== trimmedName) {
      changed = true;
      return { ...b, categoryName: trimmedName };
    }

    return b;
  });

  return { budgets: reconciled, changed };
}

/**
 * Loads budgets from account-isolated userStorage with automatic schema/category migration
 */
export function loadBudgets(): {
  totalMonthlyBudget: number;
  categoryBudgets: BudgetConfig[];
} {
  let totalMonthlyBudget = DEFAULT_TOTAL_MONTHLY_BUDGET;

  // Try loading separate total monthly budget key
  try {
    const rawTotal = userStorage.getItem(STORAGE_BASE_TOTAL_BUDGET);
    if (rawTotal) {
      const parsedTotal = parseFloat(rawTotal);
      if (!isNaN(parsedTotal) && parsedTotal > 0) {
        totalMonthlyBudget = parsedTotal;
      }
    }
  } catch (e) {
    console.warn("Failed loading total monthly budget:", e);
  }

  // Load category budgets
  let categoryBudgets: BudgetConfig[] = [];
  let hasPersistedBudgets = false;
  let totalItemFromList: BudgetConfig | undefined;

  try {
    const rawBudgets = userStorage.getItem(STORAGE_BASE_BUDGETS);
    if (rawBudgets) {
      const parsed = JSON.parse(rawBudgets);
      if (Array.isArray(parsed)) {
        hasPersistedBudgets = true;
        totalItemFromList = parsed.find(
          (b) => b.id === "total_monthly" || b.categoryName === "__TOTAL_MONTHLY__"
        );
        if (totalItemFromList && totalItemFromList.monthlyLimit > 0) {
          totalMonthlyBudget = totalItemFromList.monthlyLimit;
        }

        // Filter out total_monthly from category list
        categoryBudgets = parsed.filter(
          (b) => b.id !== "total_monthly" && b.categoryName !== "__TOTAL_MONTHLY__"
        );
      }
    }
  } catch (e) {
    console.warn("Failed loading budgets list:", e);
  }

  // If no category budgets configured yet, return default presets without dirtying empty storage
  if (categoryBudgets.length === 0) {
    categoryBudgets = DEFAULT_CATEGORY_BUDGETS.map((b) => ({ ...b }));
  }

  // Run idempotent reconciliation against current categories
  const categories = loadStoredCategories();
  const { budgets: reconciledBudgets, changed } = reconcileBudgetsWithCategories(
    categoryBudgets,
    categories
  );

  // Persist migrated budgets only when budgets were already stored
  if (changed && hasPersistedBudgets) {
    try {
      const totalConfigItem: BudgetConfig = totalItemFromList || {
        id: "total_monthly",
        categoryName: "__TOTAL_MONTHLY__",
        monthlyLimit: totalMonthlyBudget,
        period: "monthly",
      };
      userStorage.setItem(
        STORAGE_BASE_BUDGETS,
        JSON.stringify([totalConfigItem, ...reconciledBudgets])
      );
    } catch (e) {
      console.warn("Failed persisting migrated budgets:", e);
    }
  }

  return { totalMonthlyBudget, categoryBudgets: reconciledBudgets };
}

/**
 * Runs budget-category consistency migration explicitly (e.g. after backup restore)
 */
export function migrateAndSyncBudgets(): {
  totalMonthlyBudget: number;
  categoryBudgets: BudgetConfig[];
} {
  return loadBudgets();
}

/**
 * Saves budgets to account-isolated userStorage, maintaining full compatibility with backupRestore
 */
export function saveBudgets(
  totalMonthlyBudget: number,
  categoryBudgets: BudgetConfig[]
): void {
  try {
    userStorage.setItem(
      STORAGE_BASE_TOTAL_BUDGET,
      totalMonthlyBudget.toString()
    );

    // Persist category budgets + total_monthly item in STORAGE_BASE_BUDGETS
    const totalConfigItem: BudgetConfig = {
      id: "total_monthly",
      categoryName: "__TOTAL_MONTHLY__",
      monthlyLimit: totalMonthlyBudget,
      period: "monthly",
    };

    const combined = [
      totalConfigItem,
      ...categoryBudgets.filter(
        (b) => b.id !== "total_monthly" && b.categoryName !== "__TOTAL_MONTHLY__"
      ),
    ];

    userStorage.setItem(STORAGE_BASE_BUDGETS, JSON.stringify(combined));
    userStorage.markLocalModified();
    dispatchBudgetsUpdated();
  } catch (e) {
    console.error("Failed saving budgets to storage:", e);
  }
}

/**
 * Updates only the total monthly budget limit
 */
export function saveTotalMonthlyBudget(amount: number): void {
  const { categoryBudgets } = loadBudgets();
  saveBudgets(amount, categoryBudgets);
}

/**
 * Add a new category budget (supports custom budget name + optional linked categoryId independently)
 */
export function addCategoryBudget(
  newBudget: Omit<BudgetConfig, "id">
): BudgetConfig[] {
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
  const categories = loadStoredCategories();
  const trimmedName = (newBudget.categoryName || "").trim();

  const linkedCat = newBudget.categoryId
    ? categories.find((c) => c.id === newBudget.categoryId)
    : newBudget.categoryId === undefined
    ? categories.find((c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase())
    : undefined;

  const created: BudgetConfig = {
    ...newBudget,
    categoryName: trimmedName || linkedCat?.name.trim() || "Бюджет",
    categoryId: linkedCat ? linkedCat.id : undefined,
    id: `b_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    monthlyLimit: Number(newBudget.monthlyLimit) || 0,
  };

  const updated = [...categoryBudgets, created];
  saveBudgets(totalMonthlyBudget, updated);
  return updated;
}

function syncExpenseBudgetNameCache(budgetId: string, newBudgetName: string): void {
  try {
    const rawMonthly = userStorage.getItem(STORAGE_BASE_MONTHLY);
    if (!rawMonthly) return;
    const monthlyMap = JSON.parse(rawMonthly) as Record<string, MonthlyRecord>;
    let changed = false;

    Object.values(monthlyMap).forEach((rec) => {
      if (!rec?.expenses) return;
      if (Array.isArray(rec.expenses.fixed_expenses)) {
        rec.expenses.fixed_expenses = rec.expenses.fixed_expenses.map((item) => {
          if (item.budgetCategoryId === budgetId && item.budgetCategoryName !== newBudgetName) {
            changed = true;
            return { ...item, budgetCategoryName: newBudgetName };
          }
          return item;
        });
      }
      if (Array.isArray(rec.expenses.additional_expenses)) {
        rec.expenses.additional_expenses = rec.expenses.additional_expenses.map((item) => {
          if (item.budgetCategoryId === budgetId && item.budgetCategoryName !== newBudgetName) {
            changed = true;
            return { ...item, budgetCategoryName: newBudgetName };
          }
          return item;
        });
      }
    });

    if (changed) {
      userStorage.setItem(STORAGE_BASE_MONTHLY, JSON.stringify(monthlyMap));
    }
  } catch (e) {
    console.warn("Failed syncing expense budgetCategoryName cache:", e);
  }
}

/**
 * Update an existing category budget (name, linked category, and monthly limit are all editable independently)
 */
export function updateCategoryBudget(
  id: string,
  updates: Partial<BudgetConfig>
): BudgetConfig[] {
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
  const categories = loadStoredCategories();
  let renamedTo: string | null = null;

  const updated = categoryBudgets.map((b) => {
    if (b.id === id) {
      const nextNameRaw =
        updates.categoryName !== undefined ? updates.categoryName : b.categoryName;
      const finalName = nextNameRaw.trim() || b.categoryName;
      const candidateCatId = "categoryId" in updates ? updates.categoryId : b.categoryId;
      const validCat = candidateCatId
        ? categories.find((c) => c.id === candidateCatId)
        : undefined;

      if (finalName !== b.categoryName) {
        renamedTo = finalName;
      }

      const nextBudget: BudgetConfig = {
        ...b,
        ...updates,
        categoryName: finalName,
        monthlyLimit:
          updates.monthlyLimit !== undefined
            ? Number(updates.monthlyLimit)
            : b.monthlyLimit,
      };

      if (validCat) {
        nextBudget.categoryId = validCat.id;
      } else {
        delete nextBudget.categoryId;
      }

      return nextBudget;
    }
    return b;
  });

  saveBudgets(totalMonthlyBudget, updated);
  if (renamedTo) {
    syncExpenseBudgetNameCache(id, renamedTo);
  }
  return updated;
}

/**
 * Delete a category budget
 */
export function deleteCategoryBudget(id: string): BudgetConfig[] {
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
  const updated = categoryBudgets.filter((b) => b.id !== id);
  saveBudgets(totalMonthlyBudget, updated);
  return updated;
}

/**
 * Determines whether an ExpenseItem matches a specific BudgetConfig.
 *
 * Rules:
 * 1. If item has an explicit `budgetCategoryId`:
 *    - If 'none' or 'no_budget', returns false.
 *    - If matches budget.id or budget.categoryId, returns true.
 *    - Otherwise returns false (assigned to a different budget category).
 * 2. If item does NOT have `budgetCategoryId` (legacy/backward compatibility):
 *    - Matches by categoryId, categoryName, or semantic category groups.
 */
export function isExpenseMatchingBudget(
  item: ExpenseItem,
  budget: BudgetConfig
): boolean {
  if (!item || !budget) return false;

  // 1. Explicit user assignment via budgetCategoryId
  if (
    item.budgetCategoryId !== undefined &&
    item.budgetCategoryId !== null &&
    item.budgetCategoryId !== ""
  ) {
    if (item.budgetCategoryId === "none" || item.budgetCategoryId === "no_budget") {
      return false;
    }
    if (item.budgetCategoryId === budget.id) {
      return true;
    }
    if (budget.categoryId && item.budgetCategoryId === budget.categoryId) {
      return true;
    }
    return false;
  }

  // 2. Legacy / Fallback matching for existing unassigned expenses
  const budgetCatNameNorm = budget.categoryName.trim().toLowerCase();
  const budgetCatIdNorm = (budget.categoryId || "").trim().toLowerCase();
  const itemCatNameNorm = (item.categoryName || "").trim().toLowerCase();
  const itemCatIdNorm = (item.categoryId || "").trim().toLowerCase();

  // Exact ID match
  if (budgetCatIdNorm && itemCatIdNorm && budgetCatIdNorm === itemCatIdNorm) {
    return true;
  }

  // Exact name match
  if (itemCatNameNorm === budgetCatNameNorm) {
    return true;
  }

  // Utilities & Bills grouped budget ("Сметки и битови")
  if (
    !budgetCatIdNorm &&
    (budgetCatNameNorm.includes("сметк") || budgetCatNameNorm.includes("битов")) &&
    (itemCatNameNorm.includes("сметк") ||
      itemCatNameNorm.includes("ток") ||
      itemCatNameNorm.includes("вода") ||
      itemCatNameNorm.includes("интернет") ||
      itemCatNameNorm.includes("телефон") ||
      itemCatNameNorm.includes("парно") ||
      itemCatNameNorm.includes("отопление") ||
      itemCatIdNorm === "electricity" ||
      itemCatIdNorm === "water" ||
      itemCatIdNorm === "internet" ||
      itemCatIdNorm === "phone" ||
      itemCatIdNorm === "heating")
  ) {
    return true;
  }

  // Common semantic mappings
  if (
    (budgetCatIdNorm === "electricity" || budgetCatNameNorm.includes("ток")) &&
    (itemCatNameNorm.includes("ток") || itemCatIdNorm === "electricity")
  ) {
    return true;
  }

  if (
    (budgetCatIdNorm === "food" || budgetCatNameNorm.includes("храна")) &&
    (itemCatNameNorm.includes("храна") || itemCatIdNorm === "food")
  ) {
    return true;
  }

  if (
    (budgetCatIdNorm === "restaurant" || budgetCatNameNorm.includes("ресторант")) &&
    (itemCatNameNorm.includes("ресторант") || itemCatIdNorm === "restaurant")
  ) {
    return true;
  }

  if (
    (budgetCatIdNorm === "entertainment" ||
      budgetCatNameNorm.includes("забавления") ||
      budgetCatNameNorm.includes("кино")) &&
    (itemCatNameNorm.includes("кино") ||
      itemCatNameNorm.includes("забавления") ||
      itemCatNameNorm.includes("ресторант") ||
      itemCatIdNorm === "cinema" ||
      itemCatIdNorm === "entertainment")
  ) {
    return true;
  }

  if (
    (budgetCatIdNorm === "transport" ||
      budgetCatNameNorm.includes("транспорт") ||
      budgetCatNameNorm.includes("гориво")) &&
    (itemCatNameNorm.includes("транспорт") ||
      itemCatNameNorm.includes("гориво") ||
      itemCatIdNorm === "fuel" ||
      itemCatIdNorm === "transport")
  ) {
    return true;
  }

  return false;
}

/**
 * Finds the default matching BudgetConfig ID for a given expense category (if any exists)
 */
export function findMatchingBudgetCategoryId(
  expenseCatId: string,
  expenseCatName: string,
  categoryBudgets: BudgetConfig[]
): string {
  const normName = expenseCatName.trim().toLowerCase();
  const normId = expenseCatId.trim().toLowerCase();

  // 1. Exact categoryId match
  const matchId = categoryBudgets.find(
    (b) => b.categoryId && b.categoryId.toLowerCase() === normId
  );
  if (matchId) return matchId.id;

  // 2. Exact name match
  const matchName = categoryBudgets.find(
    (b) => b.categoryName.trim().toLowerCase() === normName
  );
  if (matchName) return matchName.id;

  // 3. Semantic group matching (e.g. utilities -> "Сметки и битови", cinema -> "Забавления")
  const utilityIds = new Set(["electricity", "water", "internet", "phone", "heating"]);
  const utilityWords = ["ток", "вода", "парно", "интернет", "телефон", "сметк"];
  if (utilityIds.has(normId) || utilityWords.some((w) => normName.includes(w))) {
    const billsBudget = categoryBudgets.find((b) => {
      const bn = b.categoryName.trim().toLowerCase();
      return bn.includes("сметк") || bn.includes("битов");
    });
    if (billsBudget) return billsBudget.id;
  }

  if (normId === "cinema" || normId === "entertainment" || normName.includes("кино") || normName.includes("ресторант")) {
    const entBudget = categoryBudgets.find((b) => {
      const bn = b.categoryName.trim().toLowerCase();
      return bn.includes("забавлен") || bn.includes("развлечен");
    });
    if (entBudget) return entBudget.id;
  }

  // 4. Substring matching
  const matchSub = categoryBudgets.find((b) => {
    const bName = b.categoryName.trim().toLowerCase();
    return bName.includes(normName) || normName.includes(bName);
  });
  if (matchSub) return matchSub.id;

  return "";
}

/**
 * Computes how much was spent in a given monthly record for a specific category budget.
 */
export function calculateCategorySpent(
  record: MonthlyRecord | undefined,
  budget: BudgetConfig
): number {
  if (!record || !record.expenses) return 0;

  let total = 0;
  const budgetCatNameNorm = budget.categoryName.trim().toLowerCase();

  // Fixed expenses (completed only)
  if (Array.isArray(record.expenses.fixed_expenses)) {
    record.expenses.fixed_expenses.forEach((item) => {
      if (isCompletedExpense(item) && isExpenseMatchingBudget(item, budget)) {
        total += item.amount;
      }
    });
  } else if (record.expenses.fixed_expenses) {
    const legacy = record.expenses.fixed_expenses as any;
    if (budgetCatNameNorm.includes("кредит") && legacy.credit_eur) {
      total += legacy.credit_eur;
    }
    if (budgetCatNameNorm.includes("телефон") && legacy.phone_eur) {
      total += legacy.phone_eur;
    }
    if (budgetCatNameNorm.includes("интернет") && legacy.internet_eur) {
      total += legacy.internet_eur;
    }
  }

  // Additional / variable expenses (completed only)
  if (Array.isArray(record.expenses.additional_expenses)) {
    record.expenses.additional_expenses.forEach((item) => {
      if (isCompletedExpense(item) && isExpenseMatchingBudget(item, budget)) {
        total += item.amount;
      }
    });
  }

  return parseFloat(total.toFixed(2));
}

/**
 * Returns all individual completed ExpenseItems matching a category budget
 */
export function getCategoryExpenses(
  record: MonthlyRecord | undefined,
  budget: BudgetConfig
): ExpenseItem[] {
  if (!record || !record.expenses) return [];

  const matched: ExpenseItem[] = [];

  if (Array.isArray(record.expenses.fixed_expenses)) {
    record.expenses.fixed_expenses.forEach((item) => {
      if (isCompletedExpense(item) && isExpenseMatchingBudget(item, budget)) {
        matched.push(item);
      }
    });
  }

  if (Array.isArray(record.expenses.additional_expenses)) {
    record.expenses.additional_expenses.forEach((item) => {
      if (isCompletedExpense(item) && isExpenseMatchingBudget(item, budget)) {
        matched.push(item);
      }
    });
  }

  return matched;
}

/**
 * Computes status (green/yellow/red) from percentage:
 * 0-80% = Green
 * 80-100% = Yellow
 * 100%+ = Red
 */
export function getBudgetStatusLevel(percentage: number): "green" | "yellow" | "red" {
  if (percentage <= 80) return "green";
  if (percentage <= 100) return "yellow";
  return "red";
}

/**
 * Calculate full budget status for a month
 */
export function calculateAllBudgetsStatus(
  monthlyRecord: MonthlyRecord | undefined,
  totalMonthlyLimit: number,
  categoryBudgets: BudgetConfig[]
): OverallBudgetCalculation {
  // Compute total monthly completed expenses
  let totalSpent = 0;
  if (monthlyRecord && monthlyRecord.expenses) {
    if (Array.isArray(monthlyRecord.expenses.fixed_expenses)) {
      totalSpent += monthlyRecord.expenses.fixed_expenses.reduce(
        (sum, item) => sum + (isCompletedExpense(item) ? item.amount : 0),
        0
      );
    } else if (monthlyRecord.expenses.fixed_expenses) {
      const leg = monthlyRecord.expenses.fixed_expenses as any;
      totalSpent += (leg.credit_eur || 0) + (leg.phone_eur || 0) + (leg.internet_eur || 0);
    }

    if (Array.isArray(monthlyRecord.expenses.additional_expenses)) {
      totalSpent += monthlyRecord.expenses.additional_expenses.reduce(
        (sum, item) => sum + (isCompletedExpense(item) ? item.amount : 0),
        0
      );
    }
  }
  totalSpent = parseFloat(totalSpent.toFixed(2));

  const totalRemaining = parseFloat((totalMonthlyLimit - totalSpent).toFixed(2));
  const totalPercentage =
    totalMonthlyLimit > 0
      ? parseFloat(((totalSpent / totalMonthlyLimit) * 100).toFixed(1))
      : 0;
  const isTotalExceeded = totalSpent > totalMonthlyLimit;
  const totalOverspentAmount = isTotalExceeded
    ? parseFloat((totalSpent - totalMonthlyLimit).toFixed(2))
    : 0;
  const totalStatus = getBudgetStatusLevel(totalPercentage);

  const categories = loadStoredCategories();
  const categoryByNameMap = new Map(
    categories.map((c) => [c.name.toLowerCase().trim(), c])
  );

  // Also ensure budgets are reconciled defensively against current categories
  const { budgets: safeBudgets } = reconcileBudgetsWithCategories(
    categoryBudgets,
    categories
  );

  const activeWarnings: string[] = [];

  // Exceeded monthly budget warning
  if (isTotalExceeded) {
    activeWarnings.push(
      `Месечният бюджет е надвишен с €${totalOverspentAmount.toFixed(2)} (Monthly budget exceeded by €${totalOverspentAmount.toFixed(2)})`
    );
  }

  // Calculate each category budget
  const categoryStatuses: BudgetStatus[] = safeBudgets.map((b) => {
    const expenses = getCategoryExpenses(monthlyRecord, b);
    const spent = calculateCategorySpent(monthlyRecord, b);
    const limit = b.monthlyLimit;
    const remaining = parseFloat((limit - spent).toFixed(2));
    const percentage =
      limit > 0 ? parseFloat(((spent / limit) * 100).toFixed(1)) : 0;
    const isExceeded = spent > limit;
    const overspentAmount = isExceeded
      ? parseFloat((spent - limit).toFixed(2))
      : 0;
    const status = getBudgetStatusLevel(percentage);

    let warningMessage: string | null = null;
    if (isExceeded) {
      warningMessage = `Бюджетът за ${b.categoryName} е надвишен с €${overspentAmount.toFixed(2)} (${b.categoryName} budget exceeded by €${overspentAmount.toFixed(2)})`;
      activeWarnings.push(warningMessage);
    }

    // Determine icon and color strictly consistent with budget category name/ID
    const resolvedCat =
      resolveCategoryForBudget(b, categories) ||
      categoryByNameMap.get(b.categoryName.toLowerCase().trim());

    let iconName = "Tag";
    let colorClass = "bg-slate-100 text-slate-700";

    if (resolvedCat) {
      iconName = resolvedCat.iconName;
      colorClass = resolvedCat.colorClass;
    } else if (b.categoryName.trim()) {
      const smart = getAiSuggestedIconAndColor(b.categoryName);
      iconName = smart.iconName;
      colorClass = smart.colorClass;
    }

    return {
      budget: b,
      spent,
      limit,
      remaining,
      percentage,
      status,
      isExceeded,
      overspentAmount,
      warningMessage,
      iconName,
      colorClass,
      expenses,
    };
  });

  return {
    totalMonthlyLimit,
    totalSpent,
    totalRemaining,
    totalPercentage,
    totalStatus,
    isTotalExceeded,
    totalOverspentAmount,
    categoryStatuses,
    activeWarnings,
  };
}
