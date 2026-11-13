import {
  MonthlyRecord,
  IncomeItem,
  ExpenseItem,
  ElectricityRecord,
  ElectricityInputs,
  ExpenseCategory,
  AppSettings,
  BudgetConfig,
  CategoriesStore,
  BackupData,
  RecurringIncomeTemplate,
} from "@/types";
import { STORAGE_KEY_ELECTRICITY_HISTORY } from "./electricityStorage";
import { STORAGE_KEY_RECURRING_INCOMES } from "./incomeStorage";

// Storage Keys
export const STORAGE_KEY_MONTHLY = "HomeBudget_Data";
export const STORAGE_KEY_SAVINGS = "HomeBudget_GlobalSavings";
export const STORAGE_KEY_ELECTRICITY_LAST = "HomeBudget_ElectricityLastReadings";
export const STORAGE_KEY_CATEGORIES = "HomeBudget_Categories";
export const STORAGE_KEY_BUDGETS = "HomeBudget_Budgets";
export const STORAGE_KEY_SETTINGS = "HomeBudget_Settings";

// Default Settings
export const DEFAULT_SETTINGS: AppSettings = {
  currency: "EUR",
  language: "bg",
  theme: "light",
  autoSaveElectricity: true,
  defaultPriceT1: "0.15458",
  defaultPriceT2: "0.09226",
  notificationReminder: true,
  savingsTargetPercent: 20,
};

// Default Categories
export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "water", name: "Вода", iconName: "Droplets", colorClass: "bg-blue-100 text-blue-500" },
  { id: "electricity", name: "Ток", iconName: "Zap", colorClass: "bg-yellow-100 text-yellow-600" },
  { id: "fuel", name: "Гориво", iconName: "Fuel", colorClass: "bg-red-100 text-red-500" },
  { id: "car", name: "Кола", iconName: "Car", colorClass: "bg-zinc-100 text-zinc-600" },
  { id: "food", name: "Храна", iconName: "Utensils", colorClass: "bg-orange-100 text-orange-500" },
  { id: "hair", name: "Фризьор", iconName: "Scissors", colorClass: "bg-purple-100 text-purple-500" },
  { id: "restaurant", name: "Ресторант", iconName: "UtensilsCrossed", colorClass: "bg-yellow-100 text-yellow-600" },
  { id: "cinema", name: "Кино", iconName: "Film", colorClass: "bg-indigo-100 text-indigo-500" },
  { id: "pharmacy", name: "Аптека", iconName: "Pill", colorClass: "bg-emerald-100 text-emerald-600" },
  { id: "pets", name: "Домашни любимци", iconName: "PawPrint", colorClass: "bg-amber-100 text-amber-600" },
  { id: "cleaning", name: "Почистване", iconName: "Sparkles", colorClass: "bg-cyan-100 text-cyan-500" },
  { id: "clothes", name: "Дрехи", iconName: "Shirt", colorClass: "bg-pink-100 text-pink-500" },
  { id: "cosmetics", name: "Козметика", iconName: "Heart", colorClass: "bg-rose-100 text-rose-500" },
  { id: "gifts", name: "Подаръци", iconName: "Gift", colorClass: "bg-fuchsia-100 text-fuchsia-500" },
  { id: "education", name: "Образование", iconName: "GraduationCap", colorClass: "bg-blue-100 text-blue-500" },
  { id: "health", name: "Здраве", iconName: "Heart", colorClass: "bg-red-50 text-red-600" },
  { id: "transport", name: "Транспорт", iconName: "Bus", colorClass: "bg-slate-100 text-slate-600" },
  { id: "other", name: "Други", iconName: "ShoppingBag", colorClass: "bg-emerald-100 text-emerald-500" },
];

export const DEFAULT_INCOME_CATEGORIES: ExpenseCategory[] = [
  { id: "salary", name: "Заплата", iconName: "Briefcase", colorClass: "bg-emerald-100 text-emerald-600" },
  { id: "bonus", name: "Бонус", iconName: "Sparkles", colorClass: "bg-amber-100 text-amber-600" },
  { id: "freelance", name: "Фрийланс", iconName: "Laptop", colorClass: "bg-blue-100 text-blue-600" },
  { id: "dividends", name: "Дивиденти", iconName: "TrendingUp", colorClass: "bg-purple-100 text-purple-600" },
  { id: "rental", name: "Наем", iconName: "Home", colorClass: "bg-teal-100 text-teal-600" },
  { id: "interest", name: "Лихви", iconName: "Landmark", colorClass: "bg-indigo-100 text-indigo-600" },
  { id: "gift", name: "Подарък", iconName: "Gift", colorClass: "bg-pink-100 text-pink-500" },
  { id: "refund", name: "Възстановяване", iconName: "RotateCcw", colorClass: "bg-cyan-100 text-cyan-600" },
  { id: "other_income", name: "Други", iconName: "Wallet", colorClass: "bg-slate-100 text-slate-600" },
];

export const DEFAULT_BUDGETS: BudgetConfig[] = [
  { id: "b_food", categoryName: "Храна", categoryId: "food", monthlyLimit: 350 },
  { id: "b_bills", categoryName: "Сметки и битови", categoryId: "electricity", monthlyLimit: 150 },
  { id: "b_transport", categoryName: "Гориво и транспорт", categoryId: "fuel", monthlyLimit: 120 },
  { id: "b_rest", categoryName: "Ресторанти и забавления", categoryId: "restaurant", monthlyLimit: 100 },
  { id: "b_other", categoryName: "Други разходи", categoryId: "other", monthlyLimit: 80 },
];

/**
 * Reads safe JSON from localStorage with fallback
 */
function readStorageSafe<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`Failed reading ${key} from storage:`, e);
    return fallback;
  }
}

/**
 * Gathers complete application data from localStorage across all modules.
 */
export function gatherApplicationData(): BackupData {
  // 1. Monthly Records (containing Expenses and per-month Incomes)
  const monthlyRecords = readStorageSafe<Record<string, MonthlyRecord>>(
    STORAGE_KEY_MONTHLY,
    {}
  );

  // 2. Savings & Global Income transactions
  const savings = readStorageSafe<IncomeItem[]>(STORAGE_KEY_SAVINGS, []);

  // 3. Electricity History & Last Inputs
  const electricityHistory = readStorageSafe<ElectricityRecord[]>(
    STORAGE_KEY_ELECTRICITY_HISTORY,
    []
  );
  const electricityLastReadings = readStorageSafe<ElectricityInputs | undefined>(
    STORAGE_KEY_ELECTRICITY_LAST,
    undefined
  );

  // 4. Categories (expense + income)
  const categories = readStorageSafe<CategoriesStore>(STORAGE_KEY_CATEGORIES, {
    expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
    incomeCategories: DEFAULT_INCOME_CATEGORIES,
  });

  // 5. Budgets
  const budgets = readStorageSafe<BudgetConfig[]>(
    STORAGE_KEY_BUDGETS,
    DEFAULT_BUDGETS
  );

  // 6. Settings
  const settings = readStorageSafe<AppSettings>(
    STORAGE_KEY_SETTINGS,
    DEFAULT_SETTINGS
  );

  // 7. Recurring Incomes
  const recurringIncomes = readStorageSafe<RecurringIncomeTemplate[]>(
    STORAGE_KEY_RECURRING_INCOMES,
    []
  );

  // Compute Income list (combines global savings of income type + any per-month explicit incomes)
  const incomeList: IncomeItem[] = [];
  const seenIncomeIds = new Set<string>();

  // From global savings
  savings.forEach((s) => {
    if (s.type === "income" || !s.type) {
      if (!seenIncomeIds.has(s.id)) {
        seenIncomeIds.add(s.id);
        incomeList.push(s);
      }
    }
  });

  // From monthly records
  Object.values(monthlyRecords).forEach((record) => {
    if (record.incomes && Array.isArray(record.incomes)) {
      record.incomes.forEach((inc) => {
        if (!seenIncomeIds.has(inc.id)) {
          seenIncomeIds.add(inc.id);
          incomeList.push(inc);
        }
      });
    }
  });

  // Count total expense items across all months
  let totalExpensesCount = 0;
  const allExpenseItems: ExpenseItem[] = [];
  Object.values(monthlyRecords).forEach((record) => {
    if (record.expenses) {
      if (Array.isArray(record.expenses.fixed_expenses)) {
        totalExpensesCount += record.expenses.fixed_expenses.length;
        allExpenseItems.push(...record.expenses.fixed_expenses);
      }
      if (Array.isArray(record.expenses.additional_expenses)) {
        totalExpensesCount += record.expenses.additional_expenses.length;
        allExpenseItems.push(...record.expenses.additional_expenses);
      }
    }
  });

  const monthsCovered = Object.keys(monthlyRecords);

  const nowIso = new Date().toISOString();

  // Update last backup date in settings
  const updatedSettings: AppSettings = {
    ...settings,
    lastBackupDate: nowIso,
  };

  return {
    version: "1.0",
    appName: "BudgetFlows",
    exportDate: nowIso,
    summary: {
      incomeCount: incomeList.length,
      expensesCount: totalExpensesCount,
      savingsCount: savings.length,
      electricityCount: electricityHistory.length,
      categoriesCount:
        categories.expenseCategories.length +
        categories.incomeCategories.length,
      budgetsCount: budgets.length,
      recurringIncomesCount: recurringIncomes.length,
      monthsCovered,
    },
    data: {
      income: incomeList,
      expenses: {
        monthlyRecords,
        totalExpensesCount,
      },
      savings,
      electricityHistory,
      electricityLastReadings,
      categories,
      budgets,
      settings: updatedSettings,
      recurringIncomes,
    },
  };
}

/**
 * Triggers a download of the full backup JSON file.
 */
export function exportBackupFile(): { filename: string; backup: BackupData } {
  const backup = gatherApplicationData();

  // Save the updated lastBackupDate to localStorage
  try {
    localStorage.setItem(
      STORAGE_KEY_SETTINGS,
      JSON.stringify(backup.data.settings)
    );
  } catch (e) {
    console.warn("Could not save settings timestamp:", e);
  }

  const jsonString = JSON.stringify(backup, null, 2);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, "0")}-${String(
    now.getMinutes()
  ).padStart(2, "0")}`;
  const filename = `BudgetFlows_Backup_${dateStr}_${timeStr}.json`;

  const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { filename, backup };
}

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
  backup?: BackupData;
}

/**
 * Validates any uploaded JSON text to ensure it's a valid BudgetFlows backup.
 * Normalizes both direct version 1.0 backups and legacy raw dumps.
 */
export function validateAndParseBackupFile(rawText: string): ValidationResult {
  if (!rawText || !rawText.trim()) {
    return {
      isValid: false,
      errorMessage: "Файлът е празен. Моля, изберете валиден JSON архив.",
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawText, (key, value) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        return undefined;
      }
      return value;
    });
  } catch (e) {
    return {
      isValid: false,
      errorMessage:
        "Невалиден JSON формат. Файлът съдържа синтактични грешки и не може да бъде разчетен.",
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      isValid: false,
      errorMessage:
        "Форматът на файла е невалиден: очаква се JSON обект с архивни данни.",
    };
  }

  // Check if it's our structured BackupData schema
  if (parsed.data && typeof parsed.data === "object") {
    const d = parsed.data;

    // Normalize monthly records
    const monthlyRecords =
      d.expenses?.monthlyRecords ||
      d.monthlyRecords ||
      (d.HomeBudget_Data ? d.HomeBudget_Data : {});

    // Normalize savings
    const savings = Array.isArray(d.savings)
      ? d.savings
      : Array.isArray(d.HomeBudget_GlobalSavings)
      ? d.HomeBudget_GlobalSavings
      : [];

    // Normalize electricity
    const electricityHistory = Array.isArray(d.electricityHistory)
      ? d.electricityHistory
      : Array.isArray(d.HomeBudget_ElectricityHistory)
      ? d.HomeBudget_ElectricityHistory
      : [];

    // Normalize income
    const income = Array.isArray(d.income) ? d.income : [];

    // Normalize categories
    const categories: CategoriesStore = {
      expenseCategories: Array.isArray(d.categories?.expenseCategories)
        ? d.categories.expenseCategories
        : DEFAULT_EXPENSE_CATEGORIES,
      incomeCategories: Array.isArray(d.categories?.incomeCategories)
        ? d.categories.incomeCategories
        : DEFAULT_INCOME_CATEGORIES,
    };

    // Normalize budgets
    const budgets: BudgetConfig[] = Array.isArray(d.budgets)
      ? d.budgets
      : DEFAULT_BUDGETS;

    // Normalize settings
    const settings: AppSettings =
      d.settings && typeof d.settings === "object"
        ? { ...DEFAULT_SETTINGS, ...d.settings }
        : DEFAULT_SETTINGS;

    // Normalize recurringIncomes
    const recurringIncomes: RecurringIncomeTemplate[] = Array.isArray(
      d.recurringIncomes
    )
      ? d.recurringIncomes
      : [];

    let totalExpensesCount = 0;
    let totalMonthlyIncomesCount = 0;
    Object.values(monthlyRecords).forEach((record: any) => {
      if (record?.expenses) {
        if (Array.isArray(record.expenses.fixed_expenses)) {
          totalExpensesCount += record.expenses.fixed_expenses.length;
        }
        if (Array.isArray(record.expenses.additional_expenses)) {
          totalExpensesCount += record.expenses.additional_expenses.length;
        }
      }
      if (Array.isArray(record?.incomes)) {
        totalMonthlyIncomesCount += record.incomes.length;
      }
    });

    const monthsCovered = Object.keys(monthlyRecords);

    const normalizedBackup: BackupData = {
      version: parsed.version || "1.0",
      appName: parsed.appName || "BudgetFlows",
      exportDate: parsed.exportDate || new Date().toISOString(),
      summary: {
        incomeCount:
          income.length ||
          totalMonthlyIncomesCount +
            savings.filter((s: any) => s?.type === "income").length,
        expensesCount: totalExpensesCount,
        savingsCount: savings.length,
        electricityCount: electricityHistory.length,
        categoriesCount:
          categories.expenseCategories.length +
          categories.incomeCategories.length,
        budgetsCount: budgets.length,
        recurringIncomesCount: recurringIncomes.length,
        monthsCovered,
      },
      data: {
        income,
        expenses: {
          monthlyRecords,
          totalExpensesCount,
        },
        savings,
        electricityHistory,
        electricityLastReadings: d.electricityLastReadings,
        categories,
        budgets,
        settings,
        recurringIncomes,
      },
    };

    return { isValid: true, backup: normalizedBackup };
  }

  // Handle direct legacy key mapping (e.g. { HomeBudget_Data, HomeBudget_GlobalSavings, ... })
  if (
    parsed.HomeBudget_Data ||
    parsed.HomeBudget_GlobalSavings ||
    parsed.HomeBudget_ElectricityHistory
  ) {
    const monthlyRecords = parsed.HomeBudget_Data || {};
    const savings = Array.isArray(parsed.HomeBudget_GlobalSavings)
      ? parsed.HomeBudget_GlobalSavings
      : [];
    const electricityHistory = Array.isArray(parsed.HomeBudget_ElectricityHistory)
      ? parsed.HomeBudget_ElectricityHistory
      : [];

    let totalExpenses = 0;
    Object.values(monthlyRecords).forEach((record: any) => {
      if (record?.expenses) {
        if (Array.isArray(record.expenses.fixed_expenses)) {
          totalExpenses += record.expenses.fixed_expenses.length;
        }
        if (Array.isArray(record.expenses.additional_expenses)) {
          totalExpenses += record.expenses.additional_expenses.length;
        }
      }
    });

    const normalizedBackup: BackupData = {
      version: "legacy",
      appName: "BudgetFlows",
      exportDate: new Date().toISOString(),
      summary: {
        incomeCount: savings.filter((s: any) => s.type === "income").length,
        expensesCount: totalExpenses,
        savingsCount: savings.length,
        electricityCount: electricityHistory.length,
        categoriesCount:
          DEFAULT_EXPENSE_CATEGORIES.length + DEFAULT_INCOME_CATEGORIES.length,
        budgetsCount: DEFAULT_BUDGETS.length,
        monthsCovered: Object.keys(monthlyRecords),
      },
      data: {
        income: savings.filter((s: any) => s.type === "income"),
        expenses: {
          monthlyRecords,
          totalExpensesCount: totalExpenses,
        },
        savings,
        electricityHistory,
        electricityLastReadings: parsed.HomeBudget_ElectricityLastReadings,
        categories: {
          expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
          incomeCategories: DEFAULT_INCOME_CATEGORIES,
        },
        budgets: DEFAULT_BUDGETS,
        settings: DEFAULT_SETTINGS,
      },
    };

    return { isValid: true, backup: normalizedBackup };
  }

  return {
    isValid: false,
    errorMessage:
      "Файлът не съдържа разпознати структури на BudgetFlows (липсват данни за разходи, спестявания или ток).",
  };
}

export interface ImportResult {
  success: boolean;
  mode: "merge" | "replace";
  monthlyRecordsCount: number;
  savingsCount: number;
  electricityCount: number;
  categoriesCount: number;
  budgetsCount: number;
  message: string;
}

/**
 * Applies the validated backup data into localStorage.
 * Supports:
 * - 'replace': Overwrites all existing records with imported data.
 * - 'merge': Merges records without losing existing data, deduplicating IDs.
 */
export function applyBackup(
  backup: BackupData,
  mode: "merge" | "replace"
): ImportResult {
  const incoming = backup.data;

  if (mode === "replace") {
    // 1. Monthly Records
    localStorage.setItem(
      STORAGE_KEY_MONTHLY,
      JSON.stringify(incoming.expenses.monthlyRecords || {})
    );

    // 2. Global Savings
    localStorage.setItem(
      STORAGE_KEY_SAVINGS,
      JSON.stringify(incoming.savings || [])
    );

    // 3. Electricity History
    localStorage.setItem(
      STORAGE_KEY_ELECTRICITY_HISTORY,
      JSON.stringify(incoming.electricityHistory || [])
    );

    // 4. Electricity Last Readings
    if (incoming.electricityLastReadings) {
      localStorage.setItem(
        STORAGE_KEY_ELECTRICITY_LAST,
        JSON.stringify(incoming.electricityLastReadings)
      );
    }

    // 5. Categories
    localStorage.setItem(
      STORAGE_KEY_CATEGORIES,
      JSON.stringify(
        incoming.categories || {
          expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
          incomeCategories: DEFAULT_INCOME_CATEGORIES,
        }
      )
    );

    // 6. Budgets
    localStorage.setItem(
      STORAGE_KEY_BUDGETS,
      JSON.stringify(incoming.budgets || DEFAULT_BUDGETS)
    );

    // 7. Settings
    localStorage.setItem(
      STORAGE_KEY_SETTINGS,
      JSON.stringify(incoming.settings || DEFAULT_SETTINGS)
    );

    // 8. Recurring Incomes
    localStorage.setItem(
      STORAGE_KEY_RECURRING_INCOMES,
      JSON.stringify(incoming.recurringIncomes || [])
    );

    const monthCount = Object.keys(incoming.expenses.monthlyRecords || {}).length;

    return {
      success: true,
      mode: "replace",
      monthlyRecordsCount: monthCount,
      savingsCount: (incoming.savings || []).length,
      electricityCount: (incoming.electricityHistory || []).length,
      categoriesCount:
        (incoming.categories?.expenseCategories?.length || 0) +
        (incoming.categories?.incomeCategories?.length || 0),
      budgetsCount: (incoming.budgets || []).length,
      message: `Всички данни бяха успешно заменени с архива (${monthCount} месеца, ${(incoming.savings || []).length} записа в спестявания, ${(incoming.electricityHistory || []).length} сметки за ток).`,
    };
  }

  // --- MERGE MODE ---
  // 1. Merge Monthly Records
  const currentMonthly = readStorageSafe<Record<string, MonthlyRecord>>(
    STORAGE_KEY_MONTHLY,
    {}
  );
  const mergedMonthly = { ...currentMonthly };

  Object.entries(incoming.expenses.monthlyRecords || {}).forEach(
    ([monthKey, incomingRecord]) => {
      const existingRecord = mergedMonthly[monthKey];

      if (!existingRecord) {
        // Month doesn't exist locally: copy it completely
        mergedMonthly[monthKey] = incomingRecord;
      } else {
        // Month exists: merge fixed and additional expenses + incomes
        const existingFixed = existingRecord.expenses?.fixed_expenses || [];
        const incomingFixed = incomingRecord.expenses?.fixed_expenses || [];
        const fixedIds = new Set(existingFixed.map((f) => f.id));
        const mergedFixed = [...existingFixed];
        incomingFixed.forEach((f) => {
          if (!fixedIds.has(f.id)) {
            fixedIds.add(f.id);
            mergedFixed.push(f);
          }
        });

        const existingAdditional =
          existingRecord.expenses?.additional_expenses || [];
        const incomingAdditional =
          incomingRecord.expenses?.additional_expenses || [];
        const additionalIds = new Set(existingAdditional.map((a) => a.id));
        const mergedAdditional = [...existingAdditional];
        incomingAdditional.forEach((a) => {
          if (!additionalIds.has(a.id)) {
            additionalIds.add(a.id);
            mergedAdditional.push(a);
          }
        });

        const existingIncomes = existingRecord.incomes || [];
        const incomingIncomes = incomingRecord.incomes || [];
        const incomeIds = new Set(existingIncomes.map((i) => i.id));
        const mergedIncomes = [...existingIncomes];
        incomingIncomes.forEach((i) => {
          if (!incomeIds.has(i.id)) {
            incomeIds.add(i.id);
            mergedIncomes.push(i);
          }
        });

        mergedMonthly[monthKey] = {
          ...existingRecord,
          inputs: incomingRecord.inputs || existingRecord.inputs,
          results: incomingRecord.results || existingRecord.results,
          expenses: {
            saved_em2_eur:
              existingRecord.expenses?.saved_em2_eur ||
              incomingRecord.expenses?.saved_em2_eur ||
              0,
            fixed_expenses: mergedFixed,
            additional_expenses: mergedAdditional,
          },
          incomes: mergedIncomes,
        };
      }
    }
  );

  localStorage.setItem(STORAGE_KEY_MONTHLY, JSON.stringify(mergedMonthly));

  // 2. Merge Savings
  const currentSavings = readStorageSafe<IncomeItem[]>(STORAGE_KEY_SAVINGS, []);
  const savingsIds = new Set(currentSavings.map((s) => s.id));
  const mergedSavings = [...currentSavings];
  (incoming.savings || []).forEach((s) => {
    if (!savingsIds.has(s.id)) {
      savingsIds.add(s.id);
      mergedSavings.push(s);
    }
  });
  localStorage.setItem(STORAGE_KEY_SAVINGS, JSON.stringify(mergedSavings));

  // 3. Merge Electricity History
  const currentElec = readStorageSafe<ElectricityRecord[]>(
    STORAGE_KEY_ELECTRICITY_HISTORY,
    []
  );
  const elecKeys = new Set(
    currentElec.map((e) => e.id || `${e.month}-${e.year}-${e.createdAt}`)
  );
  const mergedElec = [...currentElec];
  (incoming.electricityHistory || []).forEach((e) => {
    const key = e.id || `${e.month}-${e.year}-${e.createdAt}`;
    if (!elecKeys.has(key)) {
      elecKeys.add(key);
      mergedElec.push(e);
    }
  });
  localStorage.setItem(
    STORAGE_KEY_ELECTRICITY_HISTORY,
    JSON.stringify(mergedElec)
  );

  // 4. Electricity Last Readings (only replace if current is empty or if present)
  if (incoming.electricityLastReadings) {
    const currentLast = localStorage.getItem(STORAGE_KEY_ELECTRICITY_LAST);
    if (!currentLast) {
      localStorage.setItem(
        STORAGE_KEY_ELECTRICITY_LAST,
        JSON.stringify(incoming.electricityLastReadings)
      );
    }
  }

  // 5. Merge Categories
  const currentCats = readStorageSafe<CategoriesStore>(STORAGE_KEY_CATEGORIES, {
    expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
    incomeCategories: DEFAULT_INCOME_CATEGORIES,
  });
  const catExpenseMap = new Map(
    currentCats.expenseCategories.map((c) => [c.id, c])
  );
  (incoming.categories?.expenseCategories || []).forEach((c) => {
    if (!catExpenseMap.has(c.id)) {
      catExpenseMap.set(c.id, c);
    }
  });

  const catIncomeMap = new Map(
    currentCats.incomeCategories.map((c) => [c.id, c])
  );
  (incoming.categories?.incomeCategories || []).forEach((c) => {
    if (!catIncomeMap.has(c.id)) {
      catIncomeMap.set(c.id, c);
    }
  });

  const mergedCats: CategoriesStore = {
    expenseCategories: Array.from(catExpenseMap.values()),
    incomeCategories: Array.from(catIncomeMap.values()),
  };
  localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(mergedCats));

  // 6. Merge Budgets
  const currentBudgets = readStorageSafe<BudgetConfig[]>(
    STORAGE_KEY_BUDGETS,
    DEFAULT_BUDGETS
  );
  const budgetMap = new Map(
    currentBudgets.map((b) => [b.categoryName.toLowerCase(), b])
  );
  (incoming.budgets || []).forEach((b) => {
    const key = b.categoryName.toLowerCase();
    if (!budgetMap.has(key)) {
      budgetMap.set(key, b);
    }
  });
  const mergedBudgets = Array.from(budgetMap.values());
  localStorage.setItem(STORAGE_KEY_BUDGETS, JSON.stringify(mergedBudgets));

  // 7. Settings: keep current, apply imported if missing
  const currentSettings = readStorageSafe<AppSettings>(
    STORAGE_KEY_SETTINGS,
    DEFAULT_SETTINGS
  );
  const mergedSettings: AppSettings = {
    ...incoming.settings,
    ...currentSettings,
    lastBackupDate: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(mergedSettings));

  // 8. Merge Recurring Incomes
  const currentRecurring = readStorageSafe<RecurringIncomeTemplate[]>(
    STORAGE_KEY_RECURRING_INCOMES,
    []
  );
  const recurringMap = new Map(currentRecurring.map((r) => [r.id, r]));
  (incoming.recurringIncomes || []).forEach((r) => {
    const existing = recurringMap.get(r.id);
    if (!existing) {
      recurringMap.set(r.id, r);
    } else {
      recurringMap.set(r.id, {
        ...existing,
        handledOccurrences: {
          ...(r.handledOccurrences || {}),
          ...(existing.handledOccurrences || {}),
        },
      });
    }
  });
  localStorage.setItem(
    STORAGE_KEY_RECURRING_INCOMES,
    JSON.stringify(Array.from(recurringMap.values()))
  );

  const totalMonths = Object.keys(mergedMonthly).length;

  return {
    success: true,
    mode: "merge",
    monthlyRecordsCount: totalMonths,
    savingsCount: mergedSavings.length,
    electricityCount: mergedElec.length,
    categoriesCount:
      mergedCats.expenseCategories.length +
      mergedCats.incomeCategories.length,
    budgetsCount: mergedBudgets.length,
    message: `Данните бяха успешно обединени! Общо ${totalMonths} месеца, ${mergedSavings.length} спестявания и ${mergedElec.length} сметки за ток.`,
  };
}
