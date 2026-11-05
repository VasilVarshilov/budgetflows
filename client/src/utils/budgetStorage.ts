import { BudgetConfig, MonthlyRecord, ExpenseItem } from "@/types";
import { loadStoredCategories, AVAILABLE_ICONS_MAP } from "./categoryStorage";

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
    categoryId: "restaurant",
    monthlyLimit: 150,
  },
  {
    id: "b_bills",
    categoryName: "Сметки и битови",
    categoryId: "electricity",
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

/**
 * Loads budgets from localStorage with robust fallback
 */
export function loadBudgets(): {
  totalMonthlyBudget: number;
  categoryBudgets: BudgetConfig[];
} {
  let totalMonthlyBudget = DEFAULT_TOTAL_MONTHLY_BUDGET;

  // Try loading separate total monthly budget key
  try {
    const rawTotal = localStorage.getItem(STORAGE_KEY_TOTAL_BUDGET);
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
  try {
    const rawBudgets = localStorage.getItem(STORAGE_KEY_BUDGETS);
    if (rawBudgets) {
      const parsed = JSON.parse(rawBudgets);
      if (Array.isArray(parsed)) {
        // If an item represents the total monthly budget, extract it
        const totalItem = parsed.find(
          (b) => b.id === "total_monthly" || b.categoryName === "__TOTAL_MONTHLY__"
        );
        if (totalItem && totalItem.monthlyLimit > 0) {
          totalMonthlyBudget = totalItem.monthlyLimit;
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

  // If no category budgets configured, use defaults
  if (categoryBudgets.length === 0) {
    categoryBudgets = DEFAULT_CATEGORY_BUDGETS;
    saveBudgets(totalMonthlyBudget, categoryBudgets);
  }

  return { totalMonthlyBudget, categoryBudgets };
}

/**
 * Saves budgets to localStorage, maintaining full compatibility with backupRestore
 */
export function saveBudgets(
  totalMonthlyBudget: number,
  categoryBudgets: BudgetConfig[]
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_TOTAL_BUDGET,
      totalMonthlyBudget.toString()
    );

    // Persist category budgets + total_monthly item in STORAGE_KEY_BUDGETS
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

    localStorage.setItem(STORAGE_KEY_BUDGETS, JSON.stringify(combined));
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
 * Add a new category budget
 */
export function addCategoryBudget(
  newBudget: Omit<BudgetConfig, "id">
): BudgetConfig[] {
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
  const created: BudgetConfig = {
    ...newBudget,
    id: `b_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    monthlyLimit: Number(newBudget.monthlyLimit) || 0,
  };

  const updated = [...categoryBudgets, created];
  saveBudgets(totalMonthlyBudget, updated);
  return updated;
}

/**
 * Update an existing category budget
 */
export function updateCategoryBudget(
  id: string,
  updates: Partial<BudgetConfig>
): BudgetConfig[] {
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
  const updated = categoryBudgets.map((b) => {
    if (b.id === id) {
      return {
        ...b,
        ...updates,
        monthlyLimit:
          updates.monthlyLimit !== undefined
            ? Number(updates.monthlyLimit)
            : b.monthlyLimit,
      };
    }
    return b;
  });

  saveBudgets(totalMonthlyBudget, updated);
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
 * Computes how much was spent in a given monthly record for a specific category budget.
 */
export function calculateCategorySpent(
  record: MonthlyRecord | undefined,
  budget: BudgetConfig
): number {
  if (!record || !record.expenses) return 0;

  let total = 0;
  const budgetCatNameNorm = budget.categoryName.trim().toLowerCase();
  const budgetCatIdNorm = (budget.categoryId || "").trim().toLowerCase();

  const isMatch = (item: ExpenseItem) => {
    const itemCatNameNorm = (item.categoryName || "").trim().toLowerCase();
    const itemCatIdNorm = (item.categoryId || "").trim().toLowerCase();

    // 1. Exact categoryId match
    if (budgetCatIdNorm && itemCatIdNorm && budgetCatIdNorm === itemCatIdNorm) {
      return true;
    }

    // 2. Exact categoryName match
    if (itemCatNameNorm === budgetCatNameNorm) {
      return true;
    }

    // 3. Substring matching for utilities/electricity or combined categories
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
      (budgetCatIdNorm === "transport" || budgetCatNameNorm.includes("транспорт") || budgetCatNameNorm.includes("гориво")) &&
      (itemCatNameNorm.includes("транспорт") || itemCatNameNorm.includes("гориво") || itemCatIdNorm === "fuel" || itemCatIdNorm === "transport")
    ) {
      return true;
    }

    return false;
  };

  // Fixed expenses
  if (Array.isArray(record.expenses.fixed_expenses)) {
    record.expenses.fixed_expenses.forEach((item) => {
      if (isMatch(item)) {
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

  // Additional / variable expenses
  if (Array.isArray(record.expenses.additional_expenses)) {
    record.expenses.additional_expenses.forEach((item) => {
      if (isMatch(item)) {
        total += item.amount;
      }
    });
  }

  return parseFloat(total.toFixed(2));
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
  // Compute total monthly expenses
  let totalSpent = 0;
  if (monthlyRecord && monthlyRecord.expenses) {
    if (Array.isArray(monthlyRecord.expenses.fixed_expenses)) {
      totalSpent += monthlyRecord.expenses.fixed_expenses.reduce(
        (sum, item) => sum + item.amount,
        0
      );
    } else if (monthlyRecord.expenses.fixed_expenses) {
      const leg = monthlyRecord.expenses.fixed_expenses as any;
      totalSpent += (leg.credit_eur || 0) + (leg.phone_eur || 0) + (leg.internet_eur || 0);
    }

    if (Array.isArray(monthlyRecord.expenses.additional_expenses)) {
      totalSpent += monthlyRecord.expenses.additional_expenses.reduce(
        (sum, item) => sum + item.amount,
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
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const categoryByNameMap = new Map(
    categories.map((c) => [c.name.toLowerCase().trim(), c])
  );

  const activeWarnings: string[] = [];

  // Exceeded monthly budget warning
  if (isTotalExceeded) {
    activeWarnings.push(
      `Месечният бюджет е надвишен с €${totalOverspentAmount.toFixed(2)} (Monthly budget exceeded by €${totalOverspentAmount.toFixed(2)})`
    );
  }

  // Calculate each category budget
  const categoryStatuses: BudgetStatus[] = categoryBudgets.map((b) => {
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
      // User requested warning format: "Food budget exceeded by €45" / Bulgarian version
      warningMessage = `Бюджетът за ${b.categoryName} е надвишен с €${overspentAmount.toFixed(2)} (${b.categoryName} budget exceeded by €${overspentAmount.toFixed(2)})`;
      activeWarnings.push(warningMessage);
    }

    // Determine icon and color
    let iconName = "Tag";
    let colorClass = "bg-slate-100 text-slate-700";

    if (b.categoryId && categoryMap.has(b.categoryId)) {
      const found = categoryMap.get(b.categoryId)!;
      iconName = found.iconName;
      colorClass = found.colorClass;
    } else if (categoryByNameMap.has(b.categoryName.toLowerCase().trim())) {
      const found = categoryByNameMap.get(b.categoryName.toLowerCase().trim())!;
      iconName = found.iconName;
      colorClass = found.colorClass;
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
