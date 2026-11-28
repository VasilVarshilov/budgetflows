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
import { getCurrentLanguage, t, translateBudgetName } from "@/i18n/helpers";

export const STORAGE_KEY_BUDGETS = "HomeBudget_Budgets";
export const STORAGE_KEY_TOTAL_BUDGET = "HomeBudget_TotalMonthlyBudget";

export const DEFAULT_TOTAL_MONTHLY_BUDGET = 0;

export const DEFAULT_CATEGORY_BUDGETS: BudgetConfig[] = [];

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
 * Returns all linked ExpenseCategory IDs for a BudgetConfig.
 * Authoritative `categoryIds` takes precedence when present (even if empty []),
 * otherwise falls back to legacy single `categoryId` (with legacy `b_bills` safety guard).
 */
export function getBudgetLinkedCategoryIds(
  budget: Pick<BudgetConfig, "categoryId" | "categoryIds" | "categoryName"> & { id?: string }
): string[] {
  if (!budget) return [];
  if (Array.isArray(budget.categoryIds)) {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const rawId of budget.categoryIds) {
      const trimmed = typeof rawId === "string" ? rawId.trim() : "";
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        ids.push(trimmed);
      }
    }
    return ids;
  }

  const single = (budget.categoryId || "").trim();
  if (!single) return [];

  const budgetNameNorm = (budget.categoryName || "").trim().toLowerCase();
  const isLegacyBrokenBillsLink =
    budget.id === "b_bills" &&
    single === "electricity" &&
    budgetNameNorm.includes("сметк");
  if (isLegacyBrokenBillsLink) return [];

  return [single];
}

/**
 * Resolves all ExpenseCategory objects linked to a BudgetConfig (1 or many).
 */
export function resolveCategoriesForBudget(
  budget: Pick<BudgetConfig, "categoryId" | "categoryIds" | "categoryName"> & { id?: string },
  categories: ExpenseCategory[]
): ExpenseCategory[] {
  const linkedIds = getBudgetLinkedCategoryIds(budget);
  if (linkedIds.length > 0) {
    const catById = new Map(categories.map((c) => [c.id, c]));
    const matched = linkedIds
      .map((id) => catById.get(id))
      .filter((c): c is ExpenseCategory => Boolean(c));
    if (matched.length > 0) return matched;
  }

  if (Array.isArray(budget.categoryIds) && budget.categoryIds.length === 0) {
    return [];
  }

  const budgetNameNorm = (budget.categoryName || "").trim().toLowerCase();
  if (!budgetNameNorm) return [];
  const exact = categories.find((c) => c.name.trim().toLowerCase() === budgetNameNorm);
  return exact ? [exact] : [];
}

/**
 * Resolves the primary canonical ExpenseCategory for a BudgetConfig.
 */
export function resolveCategoryForBudget(
  budget: Pick<BudgetConfig, "categoryId" | "categoryIds" | "categoryName"> & { id?: string },
  categories: ExpenseCategory[]
): ExpenseCategory | undefined {
  return resolveCategoriesForBudget(budget, categories)[0];
}

/**
 * Reconciles BudgetConfig entries with stored ExpenseCategory entries so that:
 * - Custom budget display names (e.g. "Дом и Бит", "Hobby & Gaming") are ALWAYS preserved.
 * - Valid linked categoryIds (single or multiple) stay linked cleanly.
 * - Deleted category IDs are safely pruned from categoryIds / categoryId.
 * - Renamed default categories propagate cleanly only when the budget is single-linked and still carried the default name.
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
    const exactNameCat = normName ? catByNameNorm.get(normName) : undefined;

    // Case A: Explicit multi-category array present
    if (Array.isArray(b.categoryIds)) {
      const validIds: string[] = [];
      const seen = new Set<string>();
      for (const cid of b.categoryIds) {
        const trimmedId = typeof cid === "string" ? cid.trim() : "";
        if (trimmedId && catById.has(trimmedId) && !seen.has(trimmedId)) {
          seen.add(trimmedId);
          validIds.push(trimmedId);
        }
      }

      const primaryCat = validIds.length === 1 ? catById.get(validIds[0]) : undefined;
      let nextName = trimmedName || primaryCat?.name.trim() || "Бюджет";

      if (validIds.length === 1 && primaryCat) {
        const originalDefaultName = DEFAULT_CAT_NAME_BY_ID.get(primaryCat.id);
        if (
          originalDefaultName &&
          normName === originalDefaultName &&
          primaryCat.name.trim().toLowerCase() !== normName
        ) {
          nextName = primaryCat.name.trim();
        }
      }

      const expectedLegacyId = validIds.length === 1 ? validIds[0] : undefined;
      const idsDiffer =
        validIds.length !== b.categoryIds.length ||
        validIds.some((id, i) => id !== b.categoryIds![i]);

      if (
        idsDiffer ||
        b.categoryName !== nextName ||
        b.categoryId !== expectedLegacyId
      ) {
        changed = true;
        const nextBudget: BudgetConfig = {
          ...b,
          categoryName: nextName,
          categoryIds: validIds,
        };
        if (expectedLegacyId) {
          nextBudget.categoryId = expectedLegacyId;
        } else {
          delete nextBudget.categoryId;
        }
        return nextBudget;
      }

      return b;
    }

    // Case B: Legacy single categoryId / unlinked budget
    const linkedCat = b.categoryId ? catById.get(b.categoryId) : undefined;

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

      if (!trimmedName) {
        changed = true;
        return {
          ...b,
          categoryName: linkedCat.name.trim(),
          categoryIds: [linkedCat.id],
        };
      }

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
          categoryIds: [linkedCat.id],
          categoryName: linkedCat.name.trim(),
        };
      }

      if (b.categoryName !== trimmedName) {
        changed = true;
        return { ...b, categoryName: trimmedName };
      }

      return b;
    }

    if (b.categoryId) {
      changed = true;
      if (exactNameCat) {
        return {
          ...b,
          categoryId: exactNameCat.id,
          categoryIds: [exactNameCat.id],
          categoryName: trimmedName || exactNameCat.name.trim(),
        };
      }
      const { categoryId: _removed, ...rest } = b;
      return {
        ...rest,
        categoryName: trimmedName,
      };
    }

    if (exactNameCat && !(normName.includes("сметк") || normName.includes("битов"))) {
      changed = true;
      return {
        ...b,
        categoryId: exactNameCat.id,
        categoryIds: [exactNameCat.id],
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

  // Keep empty array when no category budgets have been configured yet (clean empty state)

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
 * Add a new category budget (supports custom budget name + single or multiple linked expense categories)
 */
export function addCategoryBudget(
  newBudget: Omit<BudgetConfig, "id">
): BudgetConfig[] {
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
  const categories = loadStoredCategories();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const trimmedName = (newBudget.categoryName || "").trim();

  let validIds: string[] = [];
  if (Array.isArray(newBudget.categoryIds)) {
    const seen = new Set<string>();
    for (const cid of newBudget.categoryIds) {
      const clean = (cid || "").trim();
      if (clean && catById.has(clean) && !seen.has(clean)) {
        seen.add(clean);
        validIds.push(clean);
      }
    }
  } else if (newBudget.categoryId && catById.has(newBudget.categoryId)) {
    validIds = [newBudget.categoryId];
  } else if (newBudget.categoryId === undefined && newBudget.categoryIds === undefined) {
    const byName = categories.find(
      (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (byName) validIds = [byName.id];
  }

  const firstLinked = validIds.length > 0 ? catById.get(validIds[0]) : undefined;

  const created: BudgetConfig = {
    ...newBudget,
    categoryName: trimmedName || firstLinked?.name.trim() || "Бюджет",
    categoryIds: validIds,
    categoryId: validIds.length === 1 ? validIds[0] : undefined,
    id: `b_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    monthlyLimit: Number(newBudget.monthlyLimit) || 0,
  };
  if (validIds.length !== 1) {
    delete created.categoryId;
  }

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
 * Update an existing category budget (name, linked categories list, and monthly limit are all editable independently)
 */
export function updateCategoryBudget(
  id: string,
  updates: Partial<BudgetConfig>
): BudgetConfig[] {
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
  const categories = loadStoredCategories();
  const catById = new Map(categories.map((c) => [c.id, c]));
  let renamedTo: string | null = null;

  const updated = categoryBudgets.map((b) => {
    if (b.id === id) {
      const nextNameRaw =
        updates.categoryName !== undefined ? updates.categoryName : b.categoryName;
      const finalName = nextNameRaw.trim() || b.categoryName;

      if (finalName !== b.categoryName) {
        renamedTo = finalName;
      }

      let validIds: string[] = [];
      if ("categoryIds" in updates && Array.isArray(updates.categoryIds)) {
        const seen = new Set<string>();
        for (const cid of updates.categoryIds) {
          const clean = (cid || "").trim();
          if (clean && catById.has(clean) && !seen.has(clean)) {
            seen.add(clean);
            validIds.push(clean);
          }
        }
      } else if ("categoryId" in updates) {
        if (updates.categoryId && catById.has(updates.categoryId)) {
          validIds = [updates.categoryId];
        }
      } else {
        validIds = getBudgetLinkedCategoryIds(b).filter((cid) => catById.has(cid));
      }

      const nextBudget: BudgetConfig = {
        ...b,
        ...updates,
        categoryName: finalName,
        categoryIds: validIds,
        monthlyLimit:
          updates.monthlyLimit !== undefined
            ? Number(updates.monthlyLimit)
            : b.monthlyLimit,
      };

      if (validIds.length === 1) {
        nextBudget.categoryId = validIds[0];
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
 * Checks whether an ExpenseItem matches a single linked ExpenseCategory ID (by ID or category name).
 */
function itemMatchesLinkedCategoryId(
  itemCatIdNorm: string,
  itemCatNameNorm: string,
  linkedCatId: string,
  categoriesById: Map<string, ExpenseCategory>
): boolean {
  const linkedNorm = linkedCatId.trim().toLowerCase();
  if (!linkedNorm) return false;

  if (itemCatIdNorm && itemCatIdNorm === linkedNorm) {
    return true;
  }

  const catObj = categoriesById.get(linkedCatId);
  if (catObj && itemCatNameNorm && catObj.name.trim().toLowerCase() === itemCatNameNorm) {
    return true;
  }

  const defaultCatName = DEFAULT_CAT_NAME_BY_ID.get(linkedCatId);
  if (defaultCatName && itemCatNameNorm && defaultCatName === itemCatNameNorm) {
    return true;
  }

  // Legacy keyword aliases when old items lack categoryId
  if (
    linkedNorm === "electricity" &&
    (itemCatNameNorm.includes("ток") || itemCatIdNorm === "electricity")
  ) {
    return true;
  }
  if (
    linkedNorm === "food" &&
    (itemCatNameNorm.includes("храна") || itemCatIdNorm === "food")
  ) {
    return true;
  }
  if (
    linkedNorm === "restaurant" &&
    (itemCatNameNorm.includes("ресторант") || itemCatIdNorm === "restaurant")
  ) {
    return true;
  }
  if (
    linkedNorm === "entertainment" &&
    (itemCatNameNorm.includes("кино") ||
      itemCatNameNorm.includes("забавлен") ||
      itemCatIdNorm === "cinema" ||
      itemCatIdNorm === "entertainment")
  ) {
    return true;
  }
  if (
    linkedNorm === "transport" &&
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
 * Determines whether an ExpenseItem matches a specific BudgetConfig.
 *
 * Rules:
 * 1. If item has an explicit `budgetCategoryId`:
 *    - If 'none' or 'no_budget', returns false.
 *    - If matches budget.id or any linked categoryId of the budget, returns true.
 *    - Otherwise returns false (assigned to a different budget).
 * 2. If item does NOT have `budgetCategoryId`:
 *    - If budget defines linked categories (`categoryIds` or `categoryId`),
 *      matches ANY of the selected categories cleanly.
 *    - Otherwise preserves legacy fallback matching by budget name / semantic groups
 *      (unless `categoryIds` was explicitly set to []).
 */
export function isExpenseMatchingBudget(
  item: ExpenseItem,
  budget: BudgetConfig,
  preloadedCategories?: ExpenseCategory[]
): boolean {
  if (!item || !budget) return false;

  const linkedIds = getBudgetLinkedCategoryIds(budget);

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
    if (linkedIds.includes(item.budgetCategoryId)) {
      return true;
    }
    return false;
  }

  // 2. Match against linked expense categories (supports multi-category budgets!)
  const itemCatNameNorm = (item.categoryName || "").trim().toLowerCase();
  const itemCatIdNorm = (item.categoryId || "").trim().toLowerCase();

  if (linkedIds.length > 0) {
    const categories = preloadedCategories || loadStoredCategories();
    const categoriesById = new Map(categories.map((c) => [c.id, c]));
    return linkedIds.some((cid) =>
      itemMatchesLinkedCategoryId(itemCatIdNorm, itemCatNameNorm, cid, categoriesById)
    );
  }

  // If user explicitly cleared all categories on this budget, only explicit budgetCategoryId assignments count
  if (Array.isArray(budget.categoryIds) && budget.categoryIds.length === 0) {
    return false;
  }

  // 3. Legacy / Fallback matching for existing unlinked presets (e.g. default b_bills)
  const budgetCatNameNorm = budget.categoryName.trim().toLowerCase();

  if (itemCatNameNorm === budgetCatNameNorm) {
    return true;
  }

  // Utilities & Bills grouped budget ("Сметки и битови")
  if (
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

  if (
    budgetCatNameNorm.includes("ток") &&
    (itemCatNameNorm.includes("ток") || itemCatIdNorm === "electricity")
  ) {
    return true;
  }

  if (
    budgetCatNameNorm.includes("храна") &&
    (itemCatNameNorm.includes("храна") || itemCatIdNorm === "food")
  ) {
    return true;
  }

  if (
    budgetCatNameNorm.includes("ресторант") &&
    (itemCatNameNorm.includes("ресторант") || itemCatIdNorm === "restaurant")
  ) {
    return true;
  }

  if (
    (budgetCatNameNorm.includes("забавления") || budgetCatNameNorm.includes("кино")) &&
    (itemCatNameNorm.includes("кино") ||
      itemCatNameNorm.includes("забавления") ||
      itemCatNameNorm.includes("ресторант") ||
      itemCatIdNorm === "cinema" ||
      itemCatIdNorm === "entertainment")
  ) {
    return true;
  }

  if (
    (budgetCatNameNorm.includes("транспорт") || budgetCatNameNorm.includes("гориво")) &&
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
 * Finds the default matching BudgetConfig ID for a given expense category (supports multi-category budgets)
 */
export function findMatchingBudgetCategoryId(
  expenseCatId: string,
  expenseCatName: string,
  categoryBudgets: BudgetConfig[]
): string {
  const normName = expenseCatName.trim().toLowerCase();
  const normId = expenseCatId.trim().toLowerCase();
  const categories = loadStoredCategories();
  const catById = new Map(categories.map((c) => [c.id, c]));

  // 1. Exact linked categoryId match (works for both single & multi-category budgets)
  const matchLinkedId = categoryBudgets.find((b) =>
    getBudgetLinkedCategoryIds(b).some((cid) => cid.toLowerCase() === normId)
  );
  if (matchLinkedId) return matchLinkedId.id;

  // 2. Linked category name match (e.g. expense item had categoryName without id)
  if (normName) {
    const matchLinkedName = categoryBudgets.find((b) =>
      getBudgetLinkedCategoryIds(b).some((cid) => {
        const cat = catById.get(cid);
        return cat && cat.name.trim().toLowerCase() === normName;
      })
    );
    if (matchLinkedName) return matchLinkedName.id;
  }

  // 3. Exact budget name match (skip budgets explicitly set to empty categories)
  const matchName = categoryBudgets.find(
    (b) =>
      !(Array.isArray(b.categoryIds) && b.categoryIds.length === 0) &&
      b.categoryName.trim().toLowerCase() === normName
  );
  if (matchName) return matchName.id;

  // 4. Legacy semantic group matching (for unlinked presets without explicit categoryIds)
  const unlinkedLegacyBudgets = categoryBudgets.filter(
    (b) => getBudgetLinkedCategoryIds(b).length === 0 && !Array.isArray(b.categoryIds)
  );

  const utilityIds = new Set(["electricity", "water", "internet", "phone", "heating"]);
  const utilityWords = ["ток", "вода", "парно", "интернет", "телефон", "сметк"];
  if (utilityIds.has(normId) || utilityWords.some((w) => normName.includes(w))) {
    const billsBudget = unlinkedLegacyBudgets.find((b) => {
      const bn = b.categoryName.trim().toLowerCase();
      return bn.includes("сметк") || bn.includes("битов");
    });
    if (billsBudget) return billsBudget.id;
  }

  if (normId === "cinema" || normId === "entertainment" || normName.includes("кино") || normName.includes("ресторант")) {
    const entBudget = unlinkedLegacyBudgets.find((b) => {
      const bn = b.categoryName.trim().toLowerCase();
      return bn.includes("забавлен") || bn.includes("развлечен");
    });
    if (entBudget) return entBudget.id;
  }

  // 5. Substring matching fallback on legacy unlinked budgets
  const matchSub = unlinkedLegacyBudgets.find((b) => {
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
  budget: BudgetConfig,
  preloadedCategories?: ExpenseCategory[]
): number {
  if (!record || !record.expenses) return 0;

  let total = 0;
  const budgetCatNameNorm = budget.categoryName.trim().toLowerCase();
  const categories = preloadedCategories || loadStoredCategories();

  // Fixed expenses (completed only)
  if (Array.isArray(record.expenses.fixed_expenses)) {
    record.expenses.fixed_expenses.forEach((item) => {
      if (isCompletedExpense(item) && isExpenseMatchingBudget(item, budget, categories)) {
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
      if (isCompletedExpense(item) && isExpenseMatchingBudget(item, budget, categories)) {
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
  budget: BudgetConfig,
  preloadedCategories?: ExpenseCategory[]
): ExpenseItem[] {
  if (!record || !record.expenses) return [];

  const matched: ExpenseItem[] = [];
  const categories = preloadedCategories || loadStoredCategories();

  if (Array.isArray(record.expenses.fixed_expenses)) {
    record.expenses.fixed_expenses.forEach((item) => {
      if (isCompletedExpense(item) && isExpenseMatchingBudget(item, budget, categories)) {
        matched.push(item);
      }
    });
  }

  if (Array.isArray(record.expenses.additional_expenses)) {
    record.expenses.additional_expenses.forEach((item) => {
      if (isCompletedExpense(item) && isExpenseMatchingBudget(item, budget, categories)) {
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

  const hasTotalLimit = totalMonthlyLimit > 0;
  const totalRemaining = hasTotalLimit
    ? parseFloat((totalMonthlyLimit - totalSpent).toFixed(2))
    : 0;
  const totalPercentage = hasTotalLimit
    ? parseFloat(((totalSpent / totalMonthlyLimit) * 100).toFixed(1))
    : 0;
  const isTotalExceeded = hasTotalLimit && totalSpent > totalMonthlyLimit;
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

  const lang = getCurrentLanguage();
  const activeWarnings: string[] = [];

  // Exceeded monthly budget warning
  if (isTotalExceeded) {
    activeWarnings.push(
      t(
        "dashboard.budgetControl.totalBudgetExceededMsg",
        { amount: totalOverspentAmount.toFixed(2) },
        lang
      )
    );
  }

  // Calculate each category budget
  const categoryStatuses: BudgetStatus[] = safeBudgets.map((b) => {
    const expenses = getCategoryExpenses(monthlyRecord, b, categories);
    const spent = calculateCategorySpent(monthlyRecord, b, categories);
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
      warningMessage = t(
        "dashboard.budgetControl.categoryBudgetExceededMsg",
        {
          category: translateBudgetName(b.categoryName, lang),
          amount: overspentAmount.toFixed(2),
        },
        lang
      );
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
