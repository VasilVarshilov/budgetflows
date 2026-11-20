import {
  MonthlyRecord,
  ExpenseItem,
  IncomeItem,
  ElectricityRecord,
} from "@/types";
import { getCategoryColor } from "@/utils/colors";
import { isRecordCompleted } from "@/utils/expenseStatus";
import {
  findMatchingBudgetCategoryId,
  isExpenseMatchingBudget,
  loadBudgets,
  resolveCategoriesForBudget,
} from "@/utils/budgetStorage";
import { loadStoredCategories } from "@/utils/categoryStorage";
import {
  formatRepeatLabel,
  isRepeatingFrequency,
  normalizeRepeatValue,
  parseMonthKeyToYearMonth,
  resolveItemRepeat,
} from "@/utils/recurrenceEngine";
import { loadSavingsGoals } from "@/utils/savingsGoalsStorage";
import { STORAGE_BASE_ELECTRICITY_HISTORY, userStorage } from "@/utils/userStorage";
import {
  CellValue,
  SheetSpec,
  boldTextCell,
  buildXlsxWorkbookBytes,
  currencyCell,
  dateCell,
  extractDateAndTime,
  extractExpenseDescriptionAndNotes,
  flattenText,
  headerCell,
  intCell,
  numCell,
  percentFromRatioCell,
  round2,
  round5,
  sectionCell,
  strCell,
  STYLE,
} from "@/utils/excelExport";

export type ExportPeriodType = "month" | "year" | "custom";
export type ExportStatusFilter = "completed" | "upcoming" | "all";
export type ExportRecurringFilter = "all" | "recurring" | "one_time";

export interface ExportReportFilters {
  selectedCategories: string[];
  statusFilter: ExportStatusFilter;
  recurringFilter: ExportRecurringFilter;
}

export const REPORT_EXCEL_FILENAME = "BudgetForce365_Report.xlsx";

export const REPORT_EXCEL_WORKSHEET_NAMES = [
  "Summary",
  "Expenses",
  "Incomes",
  "Savings",
  "Budgets",
  "Electricity",
] as const;

export interface CategorySummary {
  name: string;
  amount: number;
  percentage: number;
  color: string;
  count: number;
}

export interface MonthlyTrendItem {
  monthKey: string;
  shortLabel: string;
  monthIndex: number;
  year: number;
  income: number;
  expenses: number;
  savings: number;
  netBalance: number;
}

export interface ExportExpenseRow {
  monthKey: string;
  bucket: "fixed" | "additional";
  date: string;
  time: string;
  sortTs: number;
  category: string;
  budget: string;
  description: string;
  amount: number;
  completed: boolean;
  statusLabel: string;
  repeatLabel: string;
  isRecurring: boolean;
  expectedDate: string;
  notes: string;
  rawItem: ExpenseItem;
}

export interface ExportIncomeRow {
  monthKey: string;
  date: string;
  time: string;
  sortTs: number;
  category: string;
  description: string;
  amount: number;
  completed: boolean;
  statusLabel: string;
  repeatLabel: string;
  isRecurring: boolean;
  expectedDate: string;
  notes: string;
}

export interface ExportSavingsRow {
  date: string;
  sortTs: number;
  description: string;
  amount: number;
  goal: string;
  notes: string;
}

export interface ExportBudgetRow {
  budgetName: string;
  categories: string;
  budgetLimit: number;
  currentSpending: number;
  remaining: number;
}

export interface ExportElectricityRow {
  date: string;
  sortTs: number;
  consumption: number;
  pricePerKwh: number;
  totalCost: number;
}

export interface ExportReportData {
  periodType: ExportPeriodType;
  periodLabel: string;
  dateRangeText: string;
  generatedAt: string;
  generatedTimestampFormatted: string;
  filters: ExportReportFilters;
  appliedFiltersLabel: string;
  incomeTotal: number;
  expensesTotal: number;
  fixedExpensesTotal: number;
  additionalExpensesTotal: number;
  savingsTotal: number; // Net savings in period
  netBalance: number; // Income - Expenses
  savingsRate: number; // (Savings / Income) * 100 or 0
  categoryBreakdown: CategorySummary[];
  incomeCategoryBreakdown: CategorySummary[];
  monthlyBreakdown: MonthlyTrendItem[];
  recordCount: number;
  detailedRecords: {
    key: string;
    month: string;
    year: number;
    record: MonthlyRecord;
  }[];
  filteredExpenses: ExportExpenseRow[];
  filteredIncomes: ExportIncomeRow[];
  filteredSavings: ExportSavingsRow[];
  filteredBudgets: ExportBudgetRow[];
  filteredElectricity: ExportElectricityRow[];
}

export const MONTHS_BG = [
  "Януари",
  "Февруари",
  "Март",
  "Април",
  "Май",
  "Юни",
  "Юли",
  "Август",
  "Септември",
  "Октомври",
  "Ноември",
  "Декември",
];

export const MONTHS_SHORT_BG = [
  "Яну",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Юни",
  "Юли",
  "Авг",
  "Сеп",
  "Окт",
  "Ное",
  "Дек",
];

const DEFAULT_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#f97316", // orange
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#84cc16", // lime
  "#a855f7", // violet
];

function parseIsoDateLocal(isoDate: string): Date | null {
  const m = (isoDate || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function formatBgTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function translateStatusFilter(status: ExportStatusFilter): string {
  switch (status) {
    case "upcoming":
      return "Предстоящи";
    case "all":
      return "Всички (Изпълнени + Предстоящи)";
    default:
      return "Изпълнени";
  }
}

function translateRecurringFilter(rec: ExportRecurringFilter): string {
  switch (rec) {
    case "recurring":
      return "Само повтарящи се";
    case "one_time":
      return "Само еднократни";
    default:
      return "Всички";
  }
}

function matchesStatusFilter(completed: boolean, statusFilter: ExportStatusFilter): boolean {
  if (statusFilter === "completed") return completed;
  if (statusFilter === "upcoming") return !completed;
  return true;
}

function matchesRecurringFilter(isRecurring: boolean, recurringFilter: ExportRecurringFilter): boolean {
  if (recurringFilter === "recurring") return isRecurring;
  if (recurringFilter === "one_time") return !isRecurring;
  return true;
}

function matchesCategoryFilter(categoryName: string, selectedLowerSet: Set<string>): boolean {
  if (selectedLowerSet.size === 0) return true;
  return selectedLowerSet.has((categoryName || "").trim().toLowerCase());
}

/**
 * Aggregates all data from monthlyData, globalSavings, budgets, and electricityHistory
 * respecting Period, Categories, Status, and Recurring filters.
 */
export function aggregateExportData(params: {
  periodType: ExportPeriodType;
  selectedMonth: string;
  selectedYear: string;
  customStartDate: string; // YYYY-MM-DD
  customEndDate: string; // YYYY-MM-DD
  monthlyData: Record<string, MonthlyRecord>;
  globalSavings: IncomeItem[];
  filters?: Partial<ExportReportFilters>;
  electricityHistoryOverride?: ElectricityRecord[];
}): ExportReportData {
  const {
    periodType,
    selectedMonth,
    selectedYear,
    customStartDate,
    customEndDate,
    monthlyData,
    globalSavings = [],
    filters: rawFilters,
    electricityHistoryOverride,
  } = params;

  const filters: ExportReportFilters = {
    selectedCategories: Array.isArray(rawFilters?.selectedCategories)
      ? rawFilters!.selectedCategories.map((c) => c.trim()).filter(Boolean)
      : [],
    statusFilter: rawFilters?.statusFilter || "completed",
    recurringFilter: rawFilters?.recurringFilter || "all",
  };

  const selectedCategorySet = new Set(
    filters.selectedCategories.map((c) => c.trim().toLowerCase())
  );

  // Build readable applied-filters summary
  const filterParts: string[] = [];
  if (filters.selectedCategories.length > 0) {
    filterParts.push(filters.selectedCategories.join(", "));
  }
  if (filters.statusFilter !== "completed") {
    filterParts.push(`Статус: ${translateStatusFilter(filters.statusFilter)}`);
  }
  if (filters.recurringFilter !== "all") {
    filterParts.push(translateRecurringFilter(filters.recurringFilter));
  }
  const appliedFiltersLabel =
    filterParts.length > 0 ? filterParts.join(" | ") : "Всички категории · Изпълнени";

  // 1. Parse monthlyData keys
  const parsedMonths: {
    key: string;
    month: string;
    year: number;
    monthIndex: number;
    record: MonthlyRecord;
  }[] = [];

  Object.entries(monthlyData).forEach(([key, record]) => {
    if (!record) return;
    const parts = key.trim().split(" ");
    if (parts.length >= 2) {
      const month = parts[0];
      const year = parseInt(parts[1], 10);
      const monthIndex = MONTHS_BG.indexOf(month);
      if (!isNaN(year) && monthIndex !== -1) {
        parsedMonths.push({ key, month, year, monthIndex, record });
      }
    }
  });

  // 2. Filter active months based on period
  let activeMonths = parsedMonths;
  let periodLabel = "";
  let dateRangeText = "";
  let sCustomDate: Date | null = null;
  let eCustomDate: Date | null = null;

  if (periodType === "month") {
    const targetKey = `${selectedMonth} ${selectedYear}`;
    activeMonths = parsedMonths.filter((p) => p.key === targetKey);
    periodLabel = `${selectedMonth} ${selectedYear}`;
    dateRangeText = `${selectedMonth} ${selectedYear}`;
  } else if (periodType === "year") {
    const targetYear = parseInt(selectedYear, 10);
    activeMonths = parsedMonths.filter((p) => p.year === targetYear);
    periodLabel = `${selectedYear} година`;
    dateRangeText = `01.01.${selectedYear} – 31.12.${selectedYear}`;
  } else if (periodType === "custom") {
    sCustomDate = new Date(customStartDate + "T00:00:00");
    eCustomDate = new Date(customEndDate + "T23:59:59");
    const sFormatted = new Date(customStartDate).toLocaleDateString("bg-BG");
    const eFormatted = new Date(customEndDate).toLocaleDateString("bg-BG");
    periodLabel = `${sFormatted} – ${eFormatted}`;
    dateRangeText = `${sFormatted} – ${eFormatted}`;

    activeMonths = parsedMonths.filter((p) => {
      const mStart = new Date(p.year, p.monthIndex, 1);
      const mEnd = new Date(p.year, p.monthIndex + 1, 0, 23, 59, 59);
      return mEnd >= sCustomDate! && mStart <= eCustomDate!;
    });
  }

  activeMonths.sort((a, b) => a.year * 12 + a.monthIndex - (b.year * 12 + b.monthIndex));

  const isIsoDateInsideCustomPeriod = (isoDate: string): boolean => {
    if (periodType !== "custom" || !sCustomDate || !eCustomDate) return true;
    const d = parseIsoDateLocal(isoDate);
    if (!d) return true;
    return d >= sCustomDate && d <= eCustomDate;
  };

  // Load contextual metadata (budgets, categories, goals, electricity)
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
  const expenseCategories = loadStoredCategories();
  const budgetNameById = new Map(categoryBudgets.map((b) => [b.id, b.categoryName]));
  const savingsGoals = loadSavingsGoals();
  const goalNamesLower = new Map(savingsGoals.map((g) => [g.name.trim().toLowerCase(), g.name]));

  // 3. Filter & Collect Savings
  const filteredSavings: ExportSavingsRow[] = [];
  let savingsTotal = 0;

  globalSavings.forEach((tx) => {
    if (!tx || !tx.date) return;
    const txDate = new Date(tx.date);
    if (isNaN(txDate.getTime())) return;

    if (periodType === "month") {
      const mIdx = MONTHS_BG.indexOf(selectedMonth);
      const y = parseInt(selectedYear, 10);
      if (txDate.getFullYear() !== y || txDate.getMonth() !== mIdx) return;
    } else if (periodType === "year") {
      const y = parseInt(selectedYear, 10);
      if (txDate.getFullYear() !== y) return;
    } else if (periodType === "custom" && sCustomDate && eCustomDate) {
      if (txDate < sCustomDate || txDate > eCustomDate) return;
    }

    const { date, sortTs } = extractDateAndTime(tx);
    const isWithdrawal = tx.type === "expense";
    const amountAbs = Math.abs(Number(tx.amount) || 0);
    const signedAmount = isWithdrawal ? -amountAbs : amountAbs;
    savingsTotal += signedAmount;

    const actionLabel = isWithdrawal ? "Теглене" : "Внасяне";
    const category = (tx.categoryName || "Спестявания").trim();
    const matchedGoal =
      goalNamesLower.get(category.toLowerCase()) ||
      (category.toLowerCase() !== "спестявания" ? category : "Общи спестявания");

    filteredSavings.push({
      date,
      sortTs,
      description: `${actionLabel} - ${category}`,
      amount: round2(signedAmount),
      goal: matchedGoal,
      notes: flattenText(tx.note),
    });
  });

  filteredSavings.sort((a, b) => a.sortTs - b.sortTs);

  // 4. Filter & Collect Incomes
  const filteredIncomes: ExportIncomeRow[] = [];
  const seenIncomeIds = new Set<string>();
  const incomeCategoryMap: Record<string, { amount: number; color?: string; count: number }> = {};
  let incomeTotal = 0;

  activeMonths.forEach(({ key, record }) => {
    if (!Array.isArray(record.incomes)) return;
    record.incomes.forEach((inc) => {
      if (!inc || inc.amount <= 0 || inc.type === "expense") return;
      if (inc.id && seenIncomeIds.has(inc.id)) return;

      const { date, time, sortTs } = extractDateAndTime(inc, key);
      if (!isIsoDateInsideCustomPeriod(date)) return;

      const completed = isRecordCompleted(inc);
      if (!matchesStatusFilter(completed, filters.statusFilter)) return;

      const repeat = normalizeRepeatValue(inc.repeat);
      const isRecurring = Boolean(inc.isFixedItem || isRepeatingFrequency(repeat));
      if (!matchesRecurringFilter(isRecurring, filters.recurringFilter)) return;

      const catName = inc.categoryName || "Други приходи";
      if (!matchesCategoryFilter(catName, selectedCategorySet)) return;

      if (inc.id) seenIncomeIds.add(inc.id);
      incomeTotal += inc.amount;

      if (!incomeCategoryMap[catName]) {
        incomeCategoryMap[catName] = {
          amount: 0,
          color: getCategoryColor(catName, inc.categoryColor),
          count: 0,
        };
      }
      incomeCategoryMap[catName].amount += inc.amount;
      incomeCategoryMap[catName].count += 1;

      const firstLineNote = inc.note
        ?.split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean);
      const description =
        firstLineNote || (isRecurring ? "Повтарящ се приход" : "Допълнителен приход");

      filteredIncomes.push({
        monthKey: key,
        date,
        time,
        sortTs,
        category: catName,
        description,
        amount: round2(Number(inc.amount) || 0),
        completed,
        statusLabel: completed ? "Изпълнен" : "Предстоящ",
        repeatLabel:
          repeat === "never"
            ? isRecurring
              ? "Месечно"
              : "Никога"
            : formatRepeatLabel(repeat),
        isRecurring,
        expectedDate: (inc.expectedDate || "").trim(),
        notes: flattenText(inc.note),
      });
    });
  });

  filteredIncomes.sort((a, b) => a.sortTs - b.sortTs);

  // 5. Filter & Collect Expenses
  const filteredExpenses: ExportExpenseRow[] = [];
  const categoryMap: Record<string, { amount: number; color?: string; count: number }> = {};
  let fixedExpensesTotal = 0;
  let additionalExpensesTotal = 0;

  const resolveExpenseBudgetName = (item: ExpenseItem): string => {
    if (item.budgetCategoryId === "none" || item.budgetCategoryId === "no_budget") {
      return "Без бюджет";
    }
    if (item.budgetCategoryName && item.budgetCategoryName.trim()) {
      return item.budgetCategoryName.trim();
    }
    if (item.budgetCategoryId && budgetNameById.get(item.budgetCategoryId)) {
      return budgetNameById.get(item.budgetCategoryId)!;
    }
    const matchedId = findMatchingBudgetCategoryId(
      item.categoryId || "",
      item.categoryName || "",
      categoryBudgets
    );
    return matchedId ? budgetNameById.get(matchedId) || "" : "";
  };

  activeMonths.forEach(({ key, month, year, monthIndex, record }) => {
    const exp = record.expenses;
    if (!exp) return;

    // Electricity (saved_em2_eur) — realized recurring monthly bill
    if (exp.saved_em2_eur && exp.saved_em2_eur > 0) {
      const catName = "Ток";
      const completed = true;
      const isRecurring = true;
      const monthStartIso = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
      if (
        matchesStatusFilter(completed, filters.statusFilter) &&
        matchesRecurringFilter(isRecurring, filters.recurringFilter) &&
        matchesCategoryFilter(catName, selectedCategorySet) &&
        isIsoDateInsideCustomPeriod(monthStartIso)
      ) {
        const syntheticItem: ExpenseItem = {
          id: `em2_${key}`,
          categoryId: "electricity",
          categoryName: "Ток",
          categoryIcon: "Zap",
          categoryColor: "bg-yellow-100 text-yellow-600",
          amount: exp.saved_em2_eur,
          date: monthStartIso,
          completed: true,
          repeat: "monthly",
          isFixedItem: true,
        };
        fixedExpensesTotal += exp.saved_em2_eur;
        if (!categoryMap[catName]) {
          categoryMap[catName] = {
            amount: 0,
            color: getCategoryColor(catName),
            count: 0,
          };
        }
        categoryMap[catName].amount += exp.saved_em2_eur;
        categoryMap[catName].count += 1;

        filteredExpenses.push({
          monthKey: key,
          bucket: "fixed",
          date: monthStartIso,
          time: "",
          sortTs: new Date(year, monthIndex, 1, 12, 0, 0).getTime(),
          category: catName,
          budget: resolveExpenseBudgetName(syntheticItem),
          description: `Ток (Електромер 2) - ${month} ${year}`,
          amount: round2(exp.saved_em2_eur),
          completed: true,
          statusLabel: "Изпълнен",
          repeatLabel: "Месечно",
          isRecurring: true,
          expectedDate: "",
          notes: "Автоматично отчетен разход за ток",
          rawItem: syntheticItem,
        });
      }
    }

    const pushItem = (item: ExpenseItem, bucket: "fixed" | "additional") => {
      if (!item) return;
      const { date, time, sortTs } = extractDateAndTime(item, key);
      if (!isIsoDateInsideCustomPeriod(date)) return;

      const completed = isRecordCompleted(item);
      if (!matchesStatusFilter(completed, filters.statusFilter)) return;

      const repeat = resolveItemRepeat(item);
      const isRecurring = bucket === "fixed" || isRepeatingFrequency(repeat);
      if (!matchesRecurringFilter(isRecurring, filters.recurringFilter)) return;

      const catName = item.categoryName || "Други";
      if (!matchesCategoryFilter(catName, selectedCategorySet)) return;

      const amount = Number(item.amount) || 0;
      if (bucket === "fixed") {
        fixedExpensesTotal += amount;
      } else {
        additionalExpensesTotal += amount;
      }

      if (!categoryMap[catName]) {
        categoryMap[catName] = {
          amount: 0,
          color: getCategoryColor(catName, item.categoryColor),
          count: 0,
        };
      }
      categoryMap[catName].amount += amount;
      categoryMap[catName].count += 1;

      const { description, notes } = extractExpenseDescriptionAndNotes(item);

      filteredExpenses.push({
        monthKey: key,
        bucket,
        date,
        time,
        sortTs,
        category: catName,
        budget: resolveExpenseBudgetName(item),
        description,
        amount: round2(amount),
        completed,
        statusLabel: completed ? "Изпълнен" : "Предстоящ",
        repeatLabel:
          repeat === "never"
            ? isRecurring
              ? "Месечно"
              : "Никога"
            : formatRepeatLabel(repeat),
        isRecurring,
        expectedDate: (item.expectedDate || "").trim(),
        notes,
        rawItem: item,
      });
    };

    if (Array.isArray(exp.fixed_expenses)) {
      exp.fixed_expenses.forEach((item) => pushItem(item, "fixed"));
    } else if (exp.fixed_expenses) {
      const legacy = exp.fixed_expenses as any;
      const legacyEntries: Array<[string, string, string]> = [
        ["credit_eur", "credit", "Кредит"],
        ["phone_eur", "phone", "Телефон"],
        ["internet_eur", "internet", "Интернет"],
      ];
      legacyEntries.forEach(([prop, id, label]) => {
        const val = Number(legacy[prop] || 0);
        if (val > 0) {
          pushItem(
            {
              id: `legacy_${key}_${id}`,
              categoryId: id,
              categoryName: label,
              categoryIcon: "CreditCard",
              categoryColor: "",
              amount: val,
              date: `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`,
              completed: true,
              repeat: "monthly",
              isFixedItem: true,
            },
            "fixed"
          );
        }
      });
    }

    if (Array.isArray(exp.additional_expenses)) {
      exp.additional_expenses.forEach((item) => pushItem(item, "additional"));
    }
  });

  filteredExpenses.sort((a, b) => a.sortTs - b.sortTs);

  const expensesTotal = fixedExpensesTotal + additionalExpensesTotal;

  // Build category summaries with percentages
  const categoryBreakdown: CategorySummary[] = Object.entries(categoryMap)
    .map(([name, data], idx) => ({
      name,
      amount: parseFloat(data.amount.toFixed(2)),
      percentage:
        expensesTotal > 0
          ? parseFloat(((data.amount / expensesTotal) * 100).toFixed(1))
          : 0,
      color: data.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
      count: data.count,
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const incomeCategoryBreakdown: CategorySummary[] = Object.entries(incomeCategoryMap)
    .map(([name, data], idx) => ({
      name,
      amount: parseFloat(data.amount.toFixed(2)),
      percentage:
        incomeTotal > 0
          ? parseFloat(((data.amount / incomeTotal) * 100).toFixed(1))
          : 0,
      color: data.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
      count: data.count,
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // 6. Build Monthly Breakdown / Trend (respecting filtered items)
  const monthlyBreakdown: MonthlyTrendItem[] = [];

  if (periodType === "year") {
    const targetY = parseInt(selectedYear, 10);
    MONTHS_BG.forEach((mName, mIdx) => {
      const monthKey = `${mName} ${targetY}`;
      const mExp = filteredExpenses
        .filter((e) => e.monthKey === monthKey)
        .reduce((s, e) => s + e.amount, 0);
      const mInc = filteredIncomes
        .filter((i) => i.monthKey === monthKey)
        .reduce((s, i) => s + i.amount, 0);

      let mSav = 0;
      filteredSavings.forEach((tx) => {
        const d = parseIsoDateLocal(tx.date);
        if (d && d.getFullYear() === targetY && d.getMonth() === mIdx) {
          mSav += tx.amount;
        }
      });

      monthlyBreakdown.push({
        monthKey,
        shortLabel: MONTHS_SHORT_BG[mIdx],
        monthIndex: mIdx,
        year: targetY,
        income: parseFloat(mInc.toFixed(2)),
        expenses: parseFloat(mExp.toFixed(2)),
        savings: parseFloat(mSav.toFixed(2)),
        netBalance: parseFloat((mInc - mExp).toFixed(2)),
      });
    });
  } else {
    activeMonths.forEach((m) => {
      const mExp = filteredExpenses
        .filter((e) => e.monthKey === m.key)
        .reduce((s, e) => s + e.amount, 0);
      const mInc = filteredIncomes
        .filter((i) => i.monthKey === m.key)
        .reduce((s, i) => s + i.amount, 0);

      let mSav = 0;
      filteredSavings.forEach((tx) => {
        const d = parseIsoDateLocal(tx.date);
        if (d && d.getFullYear() === m.year && d.getMonth() === m.monthIndex) {
          mSav += tx.amount;
        }
      });

      monthlyBreakdown.push({
        monthKey: m.key,
        shortLabel: `${MONTHS_SHORT_BG[m.monthIndex]} ${m.year}`,
        monthIndex: m.monthIndex,
        year: m.year,
        income: parseFloat(mInc.toFixed(2)),
        expenses: parseFloat(mExp.toFixed(2)),
        savings: parseFloat(mSav.toFixed(2)),
        netBalance: parseFloat((mInc - mExp).toFixed(2)),
      });
    });
  }

  // 7. Filter & Compute Budgets (strictly reflecting selected period & filtered expenses)
  const monthsMultiplier = Math.max(1, activeMonths.length);
  const filteredBudgets: ExportBudgetRow[] = [];

  if (selectedCategorySet.size === 0) {
    const overallLimit = round2(totalMonthlyBudget * monthsMultiplier);
    const overallSpent = round2(expensesTotal);
    filteredBudgets.push({
      budgetName: "Общ месечен бюджет",
      categories: "Всички категории",
      budgetLimit: overallLimit,
      currentSpending: overallSpent,
      remaining: round2(overallLimit - overallSpent),
    });
  }

  for (const budget of categoryBudgets) {
    const linkedCats = resolveCategoriesForBudget(budget, expenseCategories);
    const linkedNamesText =
      linkedCats.map((c) => c.name).join(", ") || "Ръчно зачислени";

    if (selectedCategorySet.size > 0) {
      const matchesAnySelected =
        selectedCategorySet.has(budget.categoryName.trim().toLowerCase()) ||
        linkedCats.some((c) => selectedCategorySet.has(c.name.trim().toLowerCase()));
      if (!matchesAnySelected) continue;
    }

    const spent = round2(
      filteredExpenses
        .filter((e) => isExpenseMatchingBudget(e.rawItem, budget, expenseCategories))
        .reduce((sum, e) => sum + e.amount, 0)
    );
    const limit = round2(budget.monthlyLimit * monthsMultiplier);

    filteredBudgets.push({
      budgetName: budget.categoryName,
      categories: linkedNamesText,
      budgetLimit: limit,
      currentSpending: spent,
      remaining: round2(limit - spent),
    });
  }

  // 8. Filter & Collect Electricity Records
  let rawElectricity: ElectricityRecord[] = [];
  if (Array.isArray(electricityHistoryOverride)) {
    rawElectricity = electricityHistoryOverride;
  } else {
    const parsedElec = userStorage.getJSON<unknown>(
      STORAGE_BASE_ELECTRICITY_HISTORY,
      []
    );
    if (Array.isArray(parsedElec)) {
      rawElectricity = parsedElec as ElectricityRecord[];
    }
  }

  const includesElectricityCategory =
    selectedCategorySet.size === 0 ||
    selectedCategorySet.has("ток") ||
    selectedCategorySet.has("електроенергия") ||
    selectedCategorySet.has("electricity");

  const filteredElectricity: ExportElectricityRow[] = [];
  if (includesElectricityCategory && filters.statusFilter !== "upcoming") {
    for (const rec of rawElectricity) {
      if (!rec) continue;
      const recMonth = (rec.month || "").trim();
      const recYear = parseInt(String(rec.year || ""), 10);
      const recMonthIdx = MONTHS_BG.indexOf(recMonth);
      const createdDate = rec.createdAt ? new Date(rec.createdAt) : null;

      let matchesPeriod = false;
      if (periodType === "month") {
        const y = parseInt(selectedYear, 10);
        if (recMonth === selectedMonth && recYear === y) {
          matchesPeriod = true;
        } else if (
          (!recMonth || isNaN(recYear)) &&
          createdDate &&
          !isNaN(createdDate.getTime())
        ) {
          matchesPeriod =
            createdDate.getFullYear() === y &&
            createdDate.getMonth() === MONTHS_BG.indexOf(selectedMonth);
        }
      } else if (periodType === "year") {
        const y = parseInt(selectedYear, 10);
        if (recYear === y) {
          matchesPeriod = true;
        } else if (isNaN(recYear) && createdDate && !isNaN(createdDate.getTime())) {
          matchesPeriod = createdDate.getFullYear() === y;
        }
      } else if (periodType === "custom" && sCustomDate && eCustomDate) {
        if (createdDate && !isNaN(createdDate.getTime())) {
          matchesPeriod = createdDate >= sCustomDate && createdDate <= eCustomDate;
        } else if (!isNaN(recYear) && recMonthIdx !== -1) {
          const mStart = new Date(recYear, recMonthIdx, 1);
          const mEnd = new Date(recYear, recMonthIdx + 1, 0, 23, 59, 59);
          matchesPeriod = mEnd >= sCustomDate && mStart <= eCustomDate;
        }
      }

      if (!matchesPeriod) continue;

      const fallbackKey = recMonth && !isNaN(recYear) ? `${recMonth} ${recYear}` : undefined;
      const { date, sortTs } = extractDateAndTime(
        { date: rec.createdAt || "", createdAt: rec.createdAt },
        fallbackKey
      );
      const consumption = round2(Number(rec.consumption) || 0);
      const totalCost = round2(Number(rec.totalCost) || 0);
      const unitPriceRaw =
        Number(rec.unitPrice) > 0
          ? Number(rec.unitPrice)
          : consumption > 0
          ? totalCost / consumption
          : Number(rec.priceT1) || 0;

      filteredElectricity.push({
        date,
        sortTs,
        consumption,
        pricePerKwh: round5(unitPriceRaw),
        totalCost,
      });
    }
  }

  filteredElectricity.sort((a, b) => a.sortTs - b.sortTs);

  const now = new Date();
  const netBalance = incomeTotal - expensesTotal;
  const savingsRate = incomeTotal > 0 ? (savingsTotal / incomeTotal) * 100 : 0;

  return {
    periodType,
    periodLabel,
    dateRangeText,
    generatedAt: now.toLocaleString("bg-BG"),
    generatedTimestampFormatted: formatBgTimestamp(now),
    filters,
    appliedFiltersLabel,
    incomeTotal: parseFloat(incomeTotal.toFixed(2)),
    expensesTotal: parseFloat(expensesTotal.toFixed(2)),
    fixedExpensesTotal: parseFloat(fixedExpensesTotal.toFixed(2)),
    additionalExpensesTotal: parseFloat(additionalExpensesTotal.toFixed(2)),
    savingsTotal: parseFloat(savingsTotal.toFixed(2)),
    netBalance: parseFloat(netBalance.toFixed(2)),
    savingsRate: parseFloat(savingsRate.toFixed(1)),
    categoryBreakdown,
    incomeCategoryBreakdown,
    monthlyBreakdown,
    recordCount: activeMonths.length,
    detailedRecords: activeMonths,
    filteredExpenses,
    filteredIncomes,
    filteredSavings,
    filteredBudgets,
    filteredElectricity,
  };
}

/**
 * Generates and downloads a structured UTF-8 TXT Report.
 */
export function exportTxtReport(data: ExportReportData): void {
  const lines: string[] = [];
  const divider = "================================================================================";
  const subDivider = "--------------------------------------------------------------------------------";

  lines.push(divider);
  lines.push("               ФИНАНСОВ И БЮДЖЕТЕН ОТЧЕТ (Budget Force 365)                  ");
  lines.push("                 Reporting & Export Center - Текстов Доклад                    ");
  lines.push(divider);
  lines.push(`Период на отчета    : ${data.periodLabel}`);
  lines.push(`Обхват на данните   : ${data.dateRangeText}`);
  lines.push(`Приложени филтри    : ${data.appliedFiltersLabel}`);
  lines.push(`Дата на генериране  : ${data.generatedAt}`);
  lines.push(`Брой включени месеци: ${data.recordCount}`);
  lines.push(divider);
  lines.push("");

  // 1. ОСНОВНИ ФИНАНСОВИ ПОКАЗАТЕЛИ (KPIs)
  lines.push("1. ОСНОВНИ ФИНАНСОВИ ПОКАЗАТЕЛИ");
  lines.push(subDivider);
  lines.push(` • Общо приходи (Income)         : €${data.incomeTotal.toFixed(2)}`);
  lines.push(` • Общо разходи (Expenses)       : €${data.expensesTotal.toFixed(2)}`);
  lines.push(`     - Повтарящи се разходи     : €${data.fixedExpensesTotal.toFixed(2)}`);
  lines.push(`     - Допълнителни разходи      : €${data.additionalExpensesTotal.toFixed(2)}`);
  lines.push(` • Спестявания за периода        : €${data.savingsTotal.toFixed(2)}`);
  lines.push(` • НЕТЕН БАЛАНС (Приходи-Разходи): ${data.netBalance >= 0 ? "+" : ""}€${data.netBalance.toFixed(2)}`);
  if (data.incomeTotal > 0) {
    lines.push(` • Норма на спестяване (Savings%): ${data.savingsRate.toFixed(1)}%`);
  }
  lines.push("");

  // 2. РАЗБИВКА ПО КАТЕГОРИИ РАЗХОДИ
  lines.push("2. РАЗПРЕДЕЛЕНИЕ НА РАЗХОДИТЕ ПО КАТЕГОРИИ");
  lines.push(subDivider);
  lines.push(
    ` ${"#".padEnd(4)} ${"Категория".padEnd(28)} ${"Сума (€)".padEnd(14)} ${"Дял (%)".padEnd(10)}`,
  );
  lines.push(subDivider);

  if (data.categoryBreakdown.length === 0) {
    lines.push(" Няма записани разходи за посочения период.");
  } else {
    data.categoryBreakdown.forEach((cat, index) => {
      const idxStr = (index + 1).toString().padEnd(4);
      const nameStr = cat.name.padEnd(28);
      const amtStr = `€${cat.amount.toFixed(2)}`.padEnd(14);
      const pctStr = `${cat.percentage.toFixed(1)}%`.padEnd(10);
      lines.push(` ${idxStr} ${nameStr} ${amtStr} ${pctStr}`);
    });
  }
  lines.push(subDivider);
  lines.push(` ОБЩО РАЗХОДИ : €${data.expensesTotal.toFixed(2)} (100.0%)`);
  lines.push("");

  // 3. МЕСЕЧНА ХРОНОЛОГИЯ (ако има повече от 1 месец или година)
  if (data.monthlyBreakdown.length > 0) {
    lines.push("3. МЕСЕЧНА ХРОНОЛОГИЯ И ТЕНДЕНЦИЯ");
    lines.push(subDivider);
    lines.push(
      ` ${"Месец".padEnd(20)} ${"Приходи (€)".padEnd(16)} ${"Разходи (€)".padEnd(16)} ${"Баланс (€)".padEnd(14)}`,
    );
    lines.push(subDivider);

    data.monthlyBreakdown.forEach((m) => {
      const mStr = m.monthKey.padEnd(20);
      const incStr = `€${m.income.toFixed(2)}`.padEnd(16);
      const expStr = `€${m.expenses.toFixed(2)}`.padEnd(16);
      const balStr = `${m.netBalance >= 0 ? "+" : ""}€${m.netBalance.toFixed(2)}`.padEnd(14);
      lines.push(` ${mStr} ${incStr} ${expStr} ${balStr}`);
    });
    lines.push("");
  }

  // 4. ДЕТАЙЛИ ПО ФИЛТРИРАНИ ЗАПИСИ
  if (data.filteredExpenses.length > 0 || data.filteredIncomes.length > 0) {
    lines.push("4. ДЕТАЙЛЕН ОПИС НА ФИЛТРИРАНИТЕ ЗАПИСИ");
    lines.push(subDivider);
    if (data.filteredIncomes.length > 0) {
      lines.push("   [Приходи]:");
      data.filteredIncomes.forEach((inc) => {
        const desc = inc.description ? ` (${inc.description})` : "";
        lines.push(`     • ${(inc.category + desc).padEnd(32)}: +€${inc.amount.toFixed(2)} [${inc.date}] (${inc.statusLabel})`);
      });
    }
    if (data.filteredExpenses.length > 0) {
      lines.push("   [Разходи]:");
      data.filteredExpenses.forEach((exp) => {
        const desc = exp.description ? ` (${exp.description})` : "";
        lines.push(`     • ${(exp.category + desc).padEnd(32)}: €${exp.amount.toFixed(2)} [${exp.date}] (${exp.statusLabel})`);
      });
    }
    lines.push("");
  }

  if (data.incomeCategoryBreakdown.length > 0) {
    lines.push("5. РАЗПРЕДЕЛЕНИЕ НА ПРИХОДИТЕ ПО КАТЕГОРИИ");
    lines.push(subDivider);
    data.incomeCategoryBreakdown.forEach((cat, index) => {
      const idxStr = (index + 1).toString().padEnd(4);
      const nameStr = cat.name.padEnd(28);
      const amtStr = `+€${cat.amount.toFixed(2)}`.padEnd(14);
      const pctStr = `${cat.percentage.toFixed(1)}%`.padEnd(10);
      lines.push(` ${idxStr} ${nameStr} ${amtStr} ${pctStr}`);
    });
    lines.push("");
  }

  lines.push(divider);
  lines.push(" Budget Force 365 • May the Budget Force be with you. • Финансов отчет");
  lines.push(divider);

  const fileContent = lines.join("\n");
  const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const cleanLabel = data.periodLabel.replace(/[\s\.\–\-\/\:]+/g, "_");
  anchor.href = url;
  anchor.download = `BudgetForce365_Report_${cleanLabel}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a crisp, high-resolution PNG Report graphic.
 * Uses HTML5 Canvas directly (2x DPI scale for Retina clarity, 1200 x 1400 px base).
 */
export function exportPngReport(data: ExportReportData): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const scale = 2; // High-res retina scale
      const width = 1200;
      // Dynamic height based on category breakdown length
      const categoryRows = Math.min(data.categoryBreakdown.length, 8);
      const height = 1350 + (categoryRows > 4 ? (categoryRows - 4) * 35 : 0);

      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Неуспешно инициализиране на графичния Canvas контекст.");
      }

      ctx.scale(scale, scale);

      // 1. Background
      ctx.fillStyle = "#0f172a"; // Deep navy slate background
      ctx.fillRect(0, 0, width, height);

      // Subtle ambient gradient circle
      const radialGrad = ctx.createRadialGradient(width * 0.8, 120, 10, width * 0.8, 120, 450);
      radialGrad.addColorStop(0, "rgba(99, 102, 241, 0.18)");
      radialGrad.addColorStop(1, "rgba(15, 23, 42, 0)");
      ctx.fillStyle = radialGrad;
      ctx.fillRect(0, 0, width, 500);

      // 2. Header Container
      ctx.save();
      // App Badge
      ctx.fillStyle = "rgba(99, 102, 241, 0.15)";
      roundRect(ctx, 48, 42, 224, 28, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(129, 140, 248, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#a5b4fc";
      ctx.font = "bold 12px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("BUDGET FORCE 365 REPORT", 60, 61);

      // Title
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Финансов и Бюджетен Отчет", 48, 110);

      // Subtitle / Period
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 16px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText(`Период: ${data.periodLabel} (${data.dateRangeText})`, 48, 138);

      // Metadata right-aligned
      ctx.textAlign = "right";
      ctx.fillStyle = "#64748b";
      ctx.font = "13px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText(`Генериран на: ${data.generatedAt}`, width - 48, 62);
      ctx.fillText(`Включени записи: ${data.recordCount} месеца`, width - 48, 86);
      ctx.restore();

      // Divider line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(48, 165);
      ctx.lineTo(width - 48, 165);
      ctx.stroke();

      // 3. 4 KPI Metric Cards
      const cardY = 190;
      const cardHeight = 110;
      const cardGap = 16;
      const cardWidth = (width - 48 * 2 - cardGap * 3) / 4;

      const kpiItems = [
        {
          label: "ОБЩО ПРИХОДИ",
          value: `+€${data.incomeTotal.toLocaleString("bg-BG", { minimumFractionDigits: 2 })}`,
          sub: "Постъпления и приходи",
          accentColor: "#10b981", // Emerald
          bg: "#064e3b15",
          border: "#05966940",
        },
        {
          label: "ОБЩО РАЗХОДИ",
          value: `-€${data.expensesTotal.toLocaleString("bg-BG", { minimumFractionDigits: 2 })}`,
          sub: `Повт.: €${data.fixedExpensesTotal.toFixed(0)} | Доп.: €${data.additionalExpensesTotal.toFixed(0)}`,
          accentColor: "#f43f5e", // Rose
          bg: "#88133715",
          border: "#e11d4840",
        },
        {
          label: "СПЕСТЯВАНИЯ",
          value: `€${data.savingsTotal.toLocaleString("bg-BG", { minimumFractionDigits: 2 })}`,
          sub: data.incomeTotal > 0 ? `Дял: ${data.savingsRate.toFixed(1)}% от дохода` : "Заделени средства",
          accentColor: "#8b5cf6", // Purple
          bg: "#4c1d9515",
          border: "#7c3aed40",
        },
        {
          label: "НЕТЕН БАЛАНС",
          value: `${data.netBalance >= 0 ? "+" : ""}€${data.netBalance.toLocaleString("bg-BG", { minimumFractionDigits: 2 })}`,
          sub: "Приходи минус Разходи",
          accentColor: data.netBalance >= 0 ? "#38bdf8" : "#fb7185", // Sky blue or coral
          bg: "#0c4a6e15",
          border: "#0284c740",
        },
      ];

      kpiItems.forEach((kpi, idx) => {
        const x = 48 + idx * (cardWidth + cardGap);

        // Card container
        ctx.save();
        ctx.fillStyle = "#1e293b";
        roundRect(ctx, x, cardY, cardWidth, cardHeight, 12);
        ctx.fill();

        ctx.strokeStyle = kpi.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Top accent line
        ctx.fillStyle = kpi.accentColor;
        roundRect(ctx, x + 16, cardY, cardWidth - 32, 3, 2);
        ctx.fill();

        // Card label
        ctx.fillStyle = "#94a3b8";
        ctx.font = "bold 11px Inter, system-ui, -apple-system, sans-serif";
        ctx.fillText(kpi.label, x + 16, cardY + 28);

        // Card value
        ctx.fillStyle = kpi.accentColor;
        ctx.font = "bold 22px Inter, system-ui, -apple-system, sans-serif";
        ctx.fillText(kpi.value, x + 16, cardY + 62);

        // Subtext
        ctx.fillStyle = "#64748b";
        ctx.font = "11px Inter, system-ui, -apple-system, sans-serif";
        ctx.fillText(kpi.sub, x + 16, cardY + 88);

        ctx.restore();
      });

      // 4. Main Section: Left = Donut Chart + Category List; Right = Trends / Breakdown
      const sectionY = 325;
      const leftWidth = 560;
      const rightX = 48 + leftWidth + 24;
      const rightWidth = width - 48 - rightX;
      const sectionHeight = 440;

      // --- Left Card: Expenses by Category (Donut Chart & Ranked Bars) ---
      ctx.save();
      ctx.fillStyle = "#1e293b";
      roundRect(ctx, 48, sectionY, leftWidth, sectionHeight, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.stroke();

      // Card Header
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Разходи по категории", 72, sectionY + 36);

      ctx.fillStyle = "#64748b";
      ctx.font = "12px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Разпределение на общата сума по разходни пера", 72, sectionY + 56);

      // Render Donut Chart
      const donutCenterX = 160;
      const donutCenterY = sectionY + 180;
      const donutOuterR = 85;
      const donutInnerR = 52;

      if (data.categoryBreakdown.length === 0 || data.expensesTotal === 0) {
        // Empty state ring
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 26;
        ctx.beginPath();
        ctx.arc(donutCenterX, donutCenterY, 70, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#64748b";
        ctx.font = "13px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Няма данни", donutCenterX, donutCenterY + 4);
      } else {
        let currentAngle = -Math.PI / 2;
        data.categoryBreakdown.forEach((cat) => {
          const sliceAngle = (cat.amount / data.expensesTotal) * (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(donutCenterX, donutCenterY, donutOuterR, currentAngle, currentAngle + sliceAngle);
          ctx.arc(donutCenterX, donutCenterY, donutInnerR, currentAngle + sliceAngle, currentAngle, true);
          ctx.closePath();
          ctx.fillStyle = cat.color;
          ctx.fill();
          currentAngle += sliceAngle;
        });

        // Center total in donut
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px Inter, sans-serif";
        ctx.fillText(`€${Math.round(data.expensesTotal)}`, donutCenterX, donutCenterY);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText("Общо разходи", donutCenterX, donutCenterY + 18);
        ctx.textAlign = "left";
      }

      // Category Bars list on the right side of the card
      const barStartX = 280;
      const topCategories = data.categoryBreakdown.slice(0, 5);
      topCategories.forEach((cat, idx) => {
        const itemY = sectionY + 95 + idx * 64;

        // Color dot & Name
        ctx.fillStyle = cat.color;
        ctx.beginPath();
        ctx.arc(barStartX + 6, itemY + 6, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f1f5f9";
        ctx.font = "bold 13px Inter, sans-serif";
        ctx.fillText(cat.name, barStartX + 20, itemY + 10);

        // Amount & Pct
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px Inter, sans-serif";
        ctx.fillText(`€${cat.amount.toFixed(2)}`, 48 + leftWidth - 24, itemY + 10);

        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText(`${cat.percentage.toFixed(1)}%`, 48 + leftWidth - 24, itemY + 26);
        ctx.textAlign = "left";

        // Progress bar background
        const barWidth = leftWidth - 280 - 48;
        ctx.fillStyle = "#334155";
        roundRect(ctx, barStartX + 20, itemY + 22, barWidth - 60, 6, 3);
        ctx.fill();

        // Progress bar fill
        const fillW = Math.max(4, ((barWidth - 60) * cat.percentage) / 100);
        ctx.fillStyle = cat.color;
        roundRect(ctx, barStartX + 20, itemY + 22, fillW, 6, 3);
        ctx.fill();
      });

      // Bottom note in left card
      ctx.fillStyle = "#64748b";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText(`Показани са топ 5 от ${data.categoryBreakdown.length} категории`, 72, sectionY + sectionHeight - 20);
      ctx.restore();

      // --- Right Card: Monthly Trend / Financial Comparison Bar Chart ---
      ctx.save();
      ctx.fillStyle = "#1e293b";
      roundRect(ctx, rightX, sectionY, rightWidth, sectionHeight, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.stroke();

      // Header
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px Inter, system-ui, -apple-system, sans-serif";
      const rightTitle = data.periodType === "year" ? "Годишен тренд (Приходи vs Разходи)" : "Сравнителен финансов анализ";
      ctx.fillText(rightTitle, rightX + 24, sectionY + 36);

      // Legend
      ctx.fillStyle = "#10b981"; // Income
      ctx.fillRect(rightX + rightWidth - 200, sectionY + 26, 12, 12);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText("Приходи", rightX + rightWidth - 182, sectionY + 36);

      ctx.fillStyle = "#f43f5e"; // Expenses
      ctx.fillRect(rightX + rightWidth - 110, sectionY + 26, 12, 12);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Разходи", rightX + rightWidth - 92, sectionY + 36);

      // Chart area
      const chartX = rightX + 45;
      const chartY = sectionY + 80;
      const chartW = rightWidth - 70;
      const chartH = sectionHeight - 140;

      // Draw horizontal grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const gy = chartY + (chartH / 4) * g;
        ctx.beginPath();
        ctx.moveTo(chartX, gy);
        ctx.lineTo(chartX + chartW, gy);
        ctx.stroke();
      }

      // Draw Bars
      const trendData = data.monthlyBreakdown.length > 0 ? data.monthlyBreakdown : [];
      if (trendData.length > 0) {
        const maxVal = Math.max(
          ...trendData.map((d) => Math.max(d.income, d.expenses)),
          100,
        );

        const groupCount = trendData.length;
        const groupW = chartW / groupCount;
        const barW = Math.min(22, (groupW - 12) / 2);

        trendData.forEach((item, idx) => {
          const gx = chartX + idx * groupW + (groupW - barW * 2 - 4) / 2;

          // Income bar
          const incH = Math.max(2, (item.income / maxVal) * chartH);
          ctx.fillStyle = "#10b981";
          roundRect(ctx, gx, chartY + chartH - incH, barW, incH, 3);
          ctx.fill();

          // Expense bar
          const expH = Math.max(2, (item.expenses / maxVal) * chartH);
          ctx.fillStyle = "#f43f5e";
          roundRect(ctx, gx + barW + 4, chartY + chartH - expH, barW, expH, 3);
          ctx.fill();

          // Month label
          ctx.fillStyle = "#94a3b8";
          ctx.font = "11px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(item.shortLabel, gx + barW + 2, chartY + chartH + 20);
        });
        ctx.textAlign = "left";
      } else {
        // Fallback for single period comparison: Fixed vs Variable vs Savings
        const bars = [
          { name: "Приходи", val: data.incomeTotal, col: "#10b981" },
          { name: "Повтарящи се", val: data.fixedExpensesTotal, col: "#ef4444" },
          { name: "Допълнителни", val: data.additionalExpensesTotal, col: "#f59e0b" },
          { name: "Спестявания", val: Math.max(0, data.savingsTotal), col: "#8b5cf6" },
        ];
        const maxB = Math.max(...bars.map((b) => b.val), 100);
        const colW = chartW / bars.length;
        bars.forEach((b, idx) => {
          const bx = chartX + idx * colW + colW * 0.2;
          const bw = colW * 0.6;
          const bh = (b.val / maxB) * chartH;
          ctx.fillStyle = b.col;
          roundRect(ctx, bx, chartY + chartH - bh, bw, bh, 4);
          ctx.fill();

          ctx.textAlign = "center";
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 12px Inter, sans-serif";
          ctx.fillText(`€${Math.round(b.val)}`, bx + bw / 2, chartY + chartH - bh - 8);

          ctx.fillStyle = "#94a3b8";
          ctx.font = "11px Inter, sans-serif";
          ctx.fillText(b.name, bx + bw / 2, chartY + chartH + 20);
        });
        ctx.textAlign = "left";
      }

      ctx.restore();

      // 5. Category Details Structured Table (Bottom Section)
      const tableY = sectionY + sectionHeight + 24;
      const tableW = width - 48 * 2;
      const tableRows = data.categoryBreakdown.slice(0, 8);
      const tableH = 110 + tableRows.length * 38;

      ctx.save();
      ctx.fillStyle = "#1e293b";
      roundRect(ctx, 48, tableY, tableW, tableH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.stroke();

      // Table Header
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Подробен опис на категориите", 72, tableY + 34);

      // Columns header bar
      const colHeaderY = tableY + 54;
      ctx.fillStyle = "#334155";
      roundRect(ctx, 64, colHeaderY, tableW - 32, 28, 6);
      ctx.fill();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.fillText("КАТЕГОРИЯ", 84, colHeaderY + 18);
      ctx.fillText("БРОЙ ОПЕРАЦИИ", 480, colHeaderY + 18);
      ctx.fillText("ДЯЛ ОТ РАЗХОДИТЕ", 720, colHeaderY + 18);
      ctx.textAlign = "right";
      ctx.fillText("СУМА В ЕВРО", tableW + 30, colHeaderY + 18);
      ctx.textAlign = "left";

      // Rows
      tableRows.forEach((cat, idx) => {
        const ry = colHeaderY + 38 + idx * 38;

        // Alternating row background
        if (idx % 2 === 1) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
          roundRect(ctx, 64, ry - 14, tableW - 32, 34, 4);
          ctx.fill();
        }

        // Color bullet + category name
        ctx.fillStyle = cat.color;
        ctx.beginPath();
        ctx.arc(84, ry, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f8fafc";
        ctx.font = "500 13px Inter, sans-serif";
        ctx.fillText(cat.name, 98, ry + 4);

        // Count
        ctx.fillStyle = "#94a3b8";
        ctx.font = "12px Inter, sans-serif";
        ctx.fillText(`${cat.count} ${cat.count === 1 ? "запис" : "записа"}`, 480, ry + 4);

        // Percentage Badge
        ctx.fillStyle = "rgba(99, 102, 241, 0.15)";
        roundRect(ctx, 720, ry - 10, 56, 20, 4);
        ctx.fill();
        ctx.fillStyle = "#a5b4fc";
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.fillText(`${cat.percentage.toFixed(1)}%`, 732, ry + 4);

        // Amount
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px Inter, sans-serif";
        ctx.fillText(`€${cat.amount.toFixed(2)}`, tableW + 30, ry + 4);
        ctx.textAlign = "left";
      });

      // Bottom Total Summary in Table
      const summaryBarY = colHeaderY + 38 + tableRows.length * 38;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(64, summaryBarY);
      ctx.lineTo(tableW + 32, summaryBarY);
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.fillText("ОБЩО ЗА ПЕРИОДА:", 84, summaryBarY + 22);

      ctx.textAlign = "right";
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 14px Inter, sans-serif";
      ctx.fillText(`Разходи: €${data.expensesTotal.toFixed(2)}  |  Приходи: €${data.incomeTotal.toFixed(2)}  |  Баланс: ${data.netBalance >= 0 ? "+" : ""}€${data.netBalance.toFixed(2)}`, tableW + 30, summaryBarY + 22);
      ctx.textAlign = "left";
      ctx.restore();

      // 6. Footer Branding
      ctx.save();
      const footerY = height - 35;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(48, footerY - 15);
      ctx.lineTo(width - 48, footerY - 15);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "12px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Budget Force 365 • May the Budget Force be with you.", 48, footerY + 8);

      ctx.textAlign = "right";
      ctx.fillText(`Страница 1 от 1 • Доклад #${Date.now().toString().slice(-6)}`, width - 48, footerY + 8);
      ctx.restore();

      // Convert to blob and download
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Неуспешно генериране на изображението."));
            return;
          }
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          const cleanLabel = data.periodLabel.replace(/[\s\.\–\-\/\:]+/g, "_");
          anchor.href = url;
          anchor.download = `BudgetForce365_Report_${cleanLabel}.png`;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
          resolve();
        },
        "image/png",
        0.95,
      );
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Helper to draw rounded rectangle in Canvas
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

// =========================================================================
// Filter-Aware Reports & Export Center Excel (.xlsx) Workbook Generator
// =========================================================================

function buildReportSummarySheet(data: ExportReportData): SheetSpec {
  const rows: CellValue[][] = [
    [sectionCell("Финансов отчет — Budget Force 365 (Reports & Export Center)")],
    [headerCell("Показател"), headerCell("Стойност"), headerCell("Допълнителна информация")],
    [boldTextCell("Export Type"), strCell("Excel (.xlsx)"), strCell("UTF-8 / ECMA-376")],
    [boldTextCell("Period"), strCell(data.periodLabel), strCell(data.dateRangeText)],
    [
      boldTextCell("Applied Filters"),
      strCell(data.appliedFiltersLabel),
      strCell(
        data.filters.selectedCategories.length > 0
          ? `${data.filters.selectedCategories.length} избрани категории`
          : "Без ограничение по категория"
      ),
    ],
    [
      strCell("Selected Categories"),
      strCell(
        data.filters.selectedCategories.length > 0
          ? data.filters.selectedCategories.join(", ")
          : "Всички"
      ),
      strCell(""),
    ],
    [strCell("Status Filter"), strCell(translateStatusFilter(data.filters.statusFilter)), strCell("")],
    [
      strCell("Recurring Filter"),
      strCell(translateRecurringFilter(data.filters.recurringFilter)),
      strCell(""),
    ],
    [boldTextCell("Generated"), strCell(data.generatedTimestampFormatted), strCell(data.generatedAt)],
    [],
    [sectionCell("Финансови показатели (Според активния период и филтри)")],
    [headerCell("Показател"), headerCell("Сума / Стойност"), headerCell("Детайли")],
    [
      boldTextCell("Income"),
      currencyCell(data.incomeTotal, true),
      strCell(`${data.filteredIncomes.length} записа`),
    ],
    [
      boldTextCell("Expenses"),
      currencyCell(data.expensesTotal, true),
      strCell(`${data.filteredExpenses.length} записа`),
    ],
    [
      strCell("  • Повтарящи се разходи"),
      currencyCell(data.fixedExpensesTotal),
      strCell("EUR"),
    ],
    [
      strCell("  • Допълнителни разходи"),
      currencyCell(data.additionalExpensesTotal),
      strCell("EUR"),
    ],
    [
      boldTextCell("Savings"),
      currencyCell(data.savingsTotal, true),
      strCell(`${data.filteredSavings.length} записа`),
    ],
    [
      boldTextCell("Net Balance"),
      currencyCell(data.netBalance, true),
      strCell("Income - Expenses"),
    ],
    [],
    [sectionCell("Top Categories (Топ категории разходи)")],
    [headerCell("Category"), headerCell("Transactions"), headerCell("Amount (EUR)"), headerCell("Share (%)")],
  ];

  if (data.categoryBreakdown.length === 0) {
    rows.push([strCell("Няма разходи за избраните филтри"), intCell(0), currencyCell(0), percentFromRatioCell(0)]);
  } else {
    for (const cat of data.categoryBreakdown) {
      rows.push([
        strCell(cat.name),
        intCell(cat.count),
        currencyCell(cat.amount),
        percentFromRatioCell(data.expensesTotal > 0 ? cat.amount / data.expensesTotal : 0),
      ]);
    }
  }

  return {
    name: "Summary",
    rows,
    freezeHeader: false,
    autoFilter: false,
    minColWidths: [28, 32, 34, 14],
  };
}

function buildReportExpensesSheet(rowsData: ExportExpenseRow[]): SheetSpec {
  const header: CellValue[] = [
    headerCell("Date"),
    headerCell("Time"),
    headerCell("Category"),
    headerCell("Budget"),
    headerCell("Description"),
    headerCell("Amount"),
    headerCell("Status"),
    headerCell("Repeat"),
    headerCell("Expected Date"),
    headerCell("Notes"),
  ];

  const body: CellValue[][] = rowsData.map((r) => [
    dateCell(r.date),
    strCell(r.time),
    strCell(r.category),
    strCell(r.budget),
    strCell(r.description),
    currencyCell(r.amount),
    strCell(r.statusLabel),
    strCell(r.repeatLabel),
    dateCell(r.expectedDate),
    strCell(r.notes),
  ]);

  return {
    name: "Expenses",
    rows: [header, ...body],
    freezeHeader: true,
    autoFilter: true,
    minColWidths: [13, 10, 18, 20, 28, 14, 14, 15, 14, 34],
  };
}

function buildReportIncomesSheet(rowsData: ExportIncomeRow[]): SheetSpec {
  const header: CellValue[] = [
    headerCell("Date"),
    headerCell("Time"),
    headerCell("Category"),
    headerCell("Description"),
    headerCell("Amount"),
    headerCell("Status"),
    headerCell("Repeat"),
    headerCell("Expected Date"),
    headerCell("Notes"),
  ];

  const body: CellValue[][] = rowsData.map((r) => [
    dateCell(r.date),
    strCell(r.time),
    strCell(r.category),
    strCell(r.description),
    currencyCell(r.amount),
    strCell(r.statusLabel),
    strCell(r.repeatLabel),
    dateCell(r.expectedDate),
    strCell(r.notes),
  ]);

  return {
    name: "Incomes",
    rows: [header, ...body],
    freezeHeader: true,
    autoFilter: true,
    minColWidths: [13, 10, 18, 28, 14, 14, 15, 14, 32],
  };
}

function buildReportSavingsSheet(rowsData: ExportSavingsRow[]): SheetSpec {
  const header: CellValue[] = [
    headerCell("Date"),
    headerCell("Description"),
    headerCell("Amount"),
    headerCell("Goal"),
    headerCell("Notes"),
  ];

  const body: CellValue[][] = rowsData.map((r) => [
    dateCell(r.date),
    strCell(r.description),
    currencyCell(r.amount),
    strCell(r.goal),
    strCell(r.notes),
  ]);

  return {
    name: "Savings",
    rows: [header, ...body],
    freezeHeader: true,
    autoFilter: true,
    minColWidths: [13, 28, 14, 24, 32],
  };
}

function buildReportBudgetsSheet(rowsData: ExportBudgetRow[]): SheetSpec {
  const header: CellValue[] = [
    headerCell("Budget Name"),
    headerCell("Categories"),
    headerCell("Budget Limit"),
    headerCell("Current Spending"),
    headerCell("Remaining"),
  ];

  const body: CellValue[][] = rowsData.map((r) => [
    strCell(r.budgetName),
    strCell(r.categories),
    currencyCell(r.budgetLimit),
    currencyCell(r.currentSpending),
    currencyCell(r.remaining),
  ]);

  return {
    name: "Budgets",
    rows: [header, ...body],
    freezeHeader: true,
    autoFilter: true,
    minColWidths: [24, 34, 16, 18, 16],
  };
}

function buildReportElectricitySheet(rowsData: ExportElectricityRow[]): SheetSpec {
  const header: CellValue[] = [
    headerCell("Date"),
    headerCell("Consumption"),
    headerCell("Price Per kWh"),
    headerCell("Total Cost"),
  ];

  const body: CellValue[][] = rowsData.map((r) => [
    dateCell(r.date),
    currencyCell(r.consumption),
    numCell(r.pricePerKwh, STYLE.PRICE_5DEC),
    currencyCell(r.totalCost),
  ]);

  return {
    name: "Electricity",
    rows: [header, ...body],
    freezeHeader: true,
    autoFilter: true,
    minColWidths: [14, 18, 18, 16],
  };
}

/**
 * Generates raw OOXML `.xlsx` bytes for the filter-aware Reports & Export Center workbook
 * containing 6 sheets in order: Summary, Expenses, Incomes, Savings, Budgets, Electricity.
 */
export function buildReportExcelBytes(data: ExportReportData): Uint8Array {
  const sheets: SheetSpec[] = [
    buildReportSummarySheet(data),
    buildReportExpensesSheet(data.filteredExpenses),
    buildReportIncomesSheet(data.filteredIncomes),
    buildReportSavingsSheet(data.filteredSavings),
    buildReportBudgetsSheet(data.filteredBudgets),
    buildReportElectricitySheet(data.filteredElectricity),
  ];

  return buildXlsxWorkbookBytes(sheets);
}

/**
 * Generates and downloads `BudgetForce365_Report.xlsx` strictly respecting all active filters
 * in the Reports & Export Center.
 */
export function exportExcelReport(data: ExportReportData): {
  filename: string;
  sheets: string[];
} {
  const bytes = buildReportExcelBytes(data);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = REPORT_EXCEL_FILENAME;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return {
    filename: REPORT_EXCEL_FILENAME,
    sheets: [...REPORT_EXCEL_WORKSHEET_NAMES],
  };
}
