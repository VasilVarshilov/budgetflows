import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ArrowDownLeft,
  Plus,
  Download,
  Target,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ExportCenterModal } from "@/components/export/ExportCenterModal";
import { MonthlyRecord, IncomeItem, ExpenseItem } from "@/types";
import { getCategoryColor } from "@/utils/colors";
import {
  loadBudgets,
  calculateAllBudgetsStatus,
} from "@/utils/budgetStorage";
import { computeMonthToMonthComparison } from "@/utils/comparisonStorage";
import { generateLocalFinancialAnalysis } from "@/utils/aiAnalysisEngine";
import { useTheme } from "@/utils/themeContext";
import { loadAppSettings, saveAppSettings } from "@/utils/incomeStorage";
import { isCompletedExpense, isPlannedExpense, isRecordCompleted } from "@/utils/expenseStatus";
import { isRepeatingFrequency } from "@/utils/recurrenceEngine";
import { resolveRecordDateKey, toLocalDateKey } from "@/utils/calendarEngine";
import { BrandMark, APP_NAME, APP_TAGLINE } from "@/components/brand/BrandLogo";
import {
  ELECTRICITY_UPDATED_EVENT,
  getStoredElectricityHistory,
  mergeElectricityHistoryWithManualExpenses,
} from "@/utils/electricityStorage";
import {
  SAVINGS_GOALS_UPDATED_EVENT,
  computeSavingsAllocationSummary,
  loadSavingsGoals,
} from "@/utils/savingsGoalsStorage";
import { DashboardCarousel } from "./DashboardCarousel";
import { DashboardCardContent, UpcomingDashboardItem } from "./DashboardCards";
import {
  DashboardCardId,
  loadDashboardCardOrder,
  saveDashboardCardOrder,
} from "./dashboardCardConfig";

interface DashboardTabProps {
  monthlyData: Record<string, MonthlyRecord>;
  globalSavings: IncomeItem[];
  onNavigateTab?: (tab: "dashboard" | "monthly" | "income" | "calendar" | "electricity" | "reports" | "savings" | "backup" | "budgets" | "ai-analysis") => void;
  onOpenCalendar?: (dateKey?: string) => void;
  onOpenRecord?: (target: {
    kind: "fixed" | "additional" | "income";
    monthKey: string;
    id: string;
  }) => void;
  onTriggerSync?: () => void;
  onToggleRecordCompletion?: (
    monthKey: string,
    kind: "fixed" | "additional" | "income",
    recordId: string,
    nextCompleted?: boolean
  ) => void;
}

type PeriodType = "current" | "month" | "year" | "custom";

const MONTHS_BG = [
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

const MONTHS_SHORT = [
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

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [
  (CURRENT_YEAR - 1).toString(),
  CURRENT_YEAR.toString(),
  (CURRENT_YEAR + 1).toString(),
];

export const DashboardTab: React.FC<DashboardTabProps> = ({
  monthlyData,
  globalSavings,
  onNavigateTab,
  onOpenCalendar,
  onOpenRecord,
  onTriggerSync,
  onToggleRecordCompletion,
}) => {
  const now = new Date();
  const currentMonthName = now.toLocaleDateString("bg-BG", { month: "long" });
  const capitalizedCurrentMonth =
    currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);

  // Period Selector State
  const [periodType, setPeriodType] = useState<PeriodType>("current");
  const [selectedMonth, setSelectedMonth] = useState(capitalizedCurrentMonth);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear().toString());

  // Custom date range state (defaults to last 30 days)
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // 1st of current month
    return d.toISOString().split("T")[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return now.toISOString().split("T")[0];
  });

  // Export Center Modal & Compact Filters Sheet State
  const [isExportCenterOpen, setIsExportCenterOpen] = useState(false);
  const [isFiltersSheetOpen, setIsFiltersSheetOpen] = useState(false);

  // Savings Target % setting (for Automatic Savings Suggestions)
  const [savingsTargetPercent, setSavingsTargetPercent] = useState<number>(() => {
    return loadAppSettings().savingsTargetPercent ?? 20;
  });

  const [budgetsRevision, setBudgetsRevision] = React.useState(0);
  const [electricityRevision, setElectricityRevision] = React.useState(0);
  const [savingsGoalsRevision, setSavingsGoalsRevision] = React.useState(0);

  // Swipeable Card Carousel State (always start on "overview" when entering Dashboard)
  const [cardOrder, setCardOrder] = useState<DashboardCardId[]>(() =>
    loadDashboardCardOrder()
  );
  const [activeCardId, setActiveCardId] = useState<DashboardCardId>("overview");
  const [cardViewModes, setCardViewModes] = useState<
    Partial<Record<DashboardCardId, "summary" | "chart">>
  >({});
  const [expandedCardId, setExpandedCardId] = useState<DashboardCardId | null>(null);

  React.useEffect(() => {
    const handleRestored = () => {
      setSavingsTargetPercent(loadAppSettings().savingsTargetPercent ?? 20);
      setBudgetsRevision((v) => v + 1);
      setElectricityRevision((v) => v + 1);
      setSavingsGoalsRevision((v) => v + 1);
      setCardOrder(loadDashboardCardOrder());
    };
    const handleAccountChanged = () => {
      handleRestored();
      setActiveCardId("overview");
      setExpandedCardId(null);
    };
    const handleBudgetOrCatUpdate = () => {
      setBudgetsRevision((v) => v + 1);
    };
    const handleElectricityUpdate = () => {
      setElectricityRevision((v) => v + 1);
    };
    const handleSavingsGoalsUpdate = () => {
      setSavingsGoalsRevision((v) => v + 1);
    };
    window.addEventListener("homebudget:data-restored", handleRestored);
    window.addEventListener("budgetflows:account-changed", handleAccountChanged);
    window.addEventListener("homebudget:budgets-updated", handleBudgetOrCatUpdate);
    window.addEventListener("homebudget:categories-updated", handleBudgetOrCatUpdate);
    window.addEventListener(ELECTRICITY_UPDATED_EVENT, handleElectricityUpdate);
    window.addEventListener(SAVINGS_GOALS_UPDATED_EVENT, handleSavingsGoalsUpdate);
    window.addEventListener("storage", handleBudgetOrCatUpdate);
    return () => {
      window.removeEventListener("homebudget:data-restored", handleRestored);
      window.removeEventListener("budgetflows:account-changed", handleAccountChanged);
      window.removeEventListener("homebudget:budgets-updated", handleBudgetOrCatUpdate);
      window.removeEventListener("homebudget:categories-updated", handleBudgetOrCatUpdate);
      window.removeEventListener(ELECTRICITY_UPDATED_EVENT, handleElectricityUpdate);
      window.removeEventListener(SAVINGS_GOALS_UPDATED_EVENT, handleSavingsGoalsUpdate);
      window.removeEventListener("storage", handleBudgetOrCatUpdate);
    };
  }, []);

  React.useEffect(() => {
    if (!isFiltersSheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFiltersSheetOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFiltersSheetOpen]);

  const handleSelectCard = (nextId: DashboardCardId) => {
    setActiveCardId(nextId);
    setExpandedCardId((prev) => (prev && prev !== nextId ? null : prev));
  };

  const handleChangeCardOrder = (nextOrder: DashboardCardId[]) => {
    const normalized = saveDashboardCardOrder(nextOrder);
    setCardOrder(normalized);
  };

  const handleSavingsTargetChange = (rawValue: string) => {
    const parsed = parseFloat(rawValue);
    const clamped = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));
    setSavingsTargetPercent(clamped);
    saveAppSettings({ savingsTargetPercent: clamped });
    onTriggerSync?.();
  };

  // 1. Helper to extract active months based on period
  const activeMonthsList = useMemo(() => {
    const allKeys = Object.keys(monthlyData);
    const parsed = allKeys
      .map((key) => {
        const parts = key.trim().split(" ");
        if (parts.length < 2) return null;
        const month = parts[0];
        const year = parseInt(parts[1], 10);
        const monthIndex = MONTHS_BG.indexOf(month);
        if (isNaN(year) || monthIndex === -1) return null;
        return { key, month, year, monthIndex, record: monthlyData[key] };
      })
      .filter(Boolean) as {
      key: string;
      month: string;
      year: number;
      monthIndex: number;
      record: MonthlyRecord;
    }[];

    if (periodType === "current") {
      const curKey = `${capitalizedCurrentMonth} ${now.getFullYear()}`;
      return parsed.filter((p) => p.key === curKey);
    }

    if (periodType === "month") {
      const targetKey = `${selectedMonth} ${selectedYear}`;
      return parsed.filter((p) => p.key === targetKey);
    }

    if (periodType === "year") {
      const y = parseInt(selectedYear, 10);
      return parsed.filter((p) => p.year === y);
    }

    if (periodType === "custom") {
      const start = new Date(customStartDate + "T00:00:00");
      const end = new Date(customEndDate + "T23:59:59");
      return parsed.filter((p) => {
        // approximate month coverage
        const mStart = new Date(p.year, p.monthIndex, 1);
        const mEnd = new Date(p.year, p.monthIndex + 1, 0, 23, 59, 59);
        return mEnd >= start && mStart <= end;
      });
    }

    return parsed;
  }, [
    monthlyData,
    periodType,
    capitalizedCurrentMonth,
    now,
    selectedMonth,
    selectedYear,
    customStartDate,
    customEndDate,
  ]);

  // 2. Filter globalSavings based on period
  const filteredSavings = useMemo(() => {
    return globalSavings.filter((tx) => {
      const txDate = new Date(tx.date);
      if (isNaN(txDate.getTime())) return false;

      if (periodType === "current") {
        return (
          txDate.getFullYear() === now.getFullYear() &&
          txDate.getMonth() === now.getMonth()
        );
      }

      if (periodType === "month") {
        const mIdx = MONTHS_BG.indexOf(selectedMonth);
        const y = parseInt(selectedYear, 10);
        return txDate.getFullYear() === y && txDate.getMonth() === mIdx;
      }

      if (periodType === "year") {
        const y = parseInt(selectedYear, 10);
        return txDate.getFullYear() === y;
      }

      if (periodType === "custom") {
        const start = new Date(customStartDate + "T00:00:00");
        const end = new Date(customEndDate + "T23:59:59");
        return txDate >= start && txDate <= end;
      }

      return true;
    });
  }, [
    globalSavings,
    periodType,
    selectedMonth,
    selectedYear,
    customStartDate,
    customEndDate,
    now,
  ]);

  // 3. Compute KPI Aggregations
  // Expenses from monthlyData (completed only; planned isolated into upcoming summary)
  const {
    totalFixed,
    totalVariable,
    totalExpenses,
    totalPlannedExpenses,
    upcomingExpenseItems,
    categoryBreakdown,
  } = useMemo(() => {
    let fixed = 0;
    let variable = 0;
    let plannedSum = 0;
    const plannedList: UpcomingDashboardItem[] = [];
    const catMap: Record<string, { value: number; colorClass?: string }> = {};

    activeMonthsList.forEach(({ key, record }) => {
      const exp = record.expenses;
      if (!exp) return;

      // Fixed expenses
      if (Array.isArray(exp.fixed_expenses)) {
        exp.fixed_expenses.forEach((item: ExpenseItem) => {
          if (isPlannedExpense(item)) {
            const amt = Number(item.amount) || 0;
            plannedSum += amt;
            plannedList.push({
              id: item.id,
              monthKey: key,
              kind: "fixed",
              categoryName: item.categoryName,
              categoryIcon: item.categoryIcon,
              categoryColor: item.categoryColor,
              note: item.note,
              merchantName: item.merchantName,
              date: item.date || "",
              dateKey: resolveRecordDateKey(item, key),
              expectedDate: item.expectedDate,
              amount: amt,
              repeat: item.repeat,
              recurrenceDayOfMonth: item.recurrenceDayOfMonth,
              recurrenceMonthOfYear: item.recurrenceMonthOfYear,
              recurrenceDayOfWeek: item.recurrenceDayOfWeek,
            });
            return;
          }
          if (!isCompletedExpense(item)) return;

          fixed += item.amount;
          if (!catMap[item.categoryName]) {
            catMap[item.categoryName] = {
              value: 0,
              colorClass: item.categoryColor,
            };
          }
          catMap[item.categoryName].value += item.amount;
        });
      } else if (exp.fixed_expenses) {
        const legacy = exp.fixed_expenses as any;
        if (legacy.credit_eur) {
          fixed += legacy.credit_eur;
          catMap["Кредит"] = {
            value: (catMap["Кредит"]?.value || 0) + legacy.credit_eur,
          };
        }
        if (legacy.phone_eur) {
          fixed += legacy.phone_eur;
          catMap["Телефон"] = {
            value: (catMap["Телефон"]?.value || 0) + legacy.phone_eur,
          };
        }
        if (legacy.internet_eur) {
          fixed += legacy.internet_eur;
          catMap["Интернет"] = {
            value: (catMap["Интернет"]?.value || 0) + legacy.internet_eur,
          };
        }
      }

      // Additional / Variable expenses
      if (Array.isArray(exp.additional_expenses)) {
        exp.additional_expenses.forEach((item: ExpenseItem) => {
          // If in custom date range, filter by exact date if available
          if (periodType === "custom" && item.date) {
            const itemDate = new Date(item.date);
            const start = new Date(customStartDate + "T00:00:00");
            const end = new Date(customEndDate + "T23:59:59");
            if (itemDate < start || itemDate > end) return;
          }

          if (isPlannedExpense(item)) {
            const amt = Number(item.amount) || 0;
            plannedSum += amt;
            plannedList.push({
              id: item.id,
              monthKey: key,
              kind: "additional",
              categoryName: item.categoryName,
              categoryIcon: item.categoryIcon,
              categoryColor: item.categoryColor,
              note: item.note,
              merchantName: item.merchantName,
              date: item.date || "",
              dateKey: resolveRecordDateKey(item, key),
              expectedDate: item.expectedDate,
              amount: amt,
              repeat: item.repeat,
              recurrenceDayOfMonth: item.recurrenceDayOfMonth,
              recurrenceMonthOfYear: item.recurrenceMonthOfYear,
              recurrenceDayOfWeek: item.recurrenceDayOfWeek,
            });
            return;
          }
          if (!isCompletedExpense(item)) return;

          variable += item.amount;
          if (!catMap[item.categoryName]) {
            catMap[item.categoryName] = {
              value: 0,
              colorClass: item.categoryColor,
            };
          }
          catMap[item.categoryName].value += item.amount;
        });
      }
    });

    const categoriesArray = Object.entries(catMap)
      .map(([name, data]) => ({
        name,
        value: parseFloat(data.value.toFixed(2)),
        colorClass: data.colorClass,
        color: getCategoryColor(name, data.colorClass),
      }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
      totalFixed: fixed,
      totalVariable: variable,
      totalExpenses: fixed + variable,
      totalPlannedExpenses: plannedSum,
      upcomingExpenseItems: plannedList,
      categoryBreakdown: categoriesArray,
    };
  }, [activeMonthsList, periodType, customStartDate, customEndDate]);

  // Income from monthly records ONLY (completed only; upcoming isolated into upcoming widget)
  const {
    totalIncome,
    totalFixedIncome,
    totalAdditionalIncome,
    incomeCount,
    totalExpectedIncome,
    upcomingIncomeItems,
  } = useMemo(() => {
    let sum = 0;
    let fixedSum = 0;
    let additionalSum = 0;
    let count = 0;
    let expectedSum = 0;
    const expectedList: UpcomingDashboardItem[] = [];
    const seenIds = new Set<string>();

    activeMonthsList.forEach(({ key, record }) => {
      if (record?.incomes && Array.isArray(record.incomes)) {
        record.incomes.forEach((inc) => {
          if (!inc || inc.type === "expense" || seenIds.has(inc.id)) return;
          if (periodType === "custom" && inc.date) {
            const itemDate = new Date(inc.date);
            const start = new Date(customStartDate + "T00:00:00");
            const end = new Date(customEndDate + "T23:59:59");
            if (itemDate < start || itemDate > end) return;
          }
          seenIds.add(inc.id);
          const amt = Number(inc.amount) || 0;
          if (!isRecordCompleted(inc)) {
            expectedSum += amt;
            expectedList.push({
              id: inc.id,
              monthKey: key,
              kind: "income",
              categoryName: inc.categoryName || "Приход",
              categoryIcon: inc.categoryIcon,
              categoryColor: inc.categoryColor,
              note: inc.note,
              merchantName: inc.merchantName,
              date: inc.date || "",
              dateKey: resolveRecordDateKey(inc, key),
              expectedDate: inc.expectedDate,
              amount: amt,
              repeat: inc.repeat,
              recurrenceDayOfMonth: inc.recurrenceDayOfMonth,
              recurrenceMonthOfYear: inc.recurrenceMonthOfYear,
              recurrenceDayOfWeek: inc.recurrenceDayOfWeek,
            });
            return;
          }
          sum += amt;
          if (isRepeatingFrequency(inc.repeat)) {
            fixedSum += amt;
          } else {
            additionalSum += amt;
          }
          count += 1;
        });
      }
    });

    return {
      totalIncome: sum,
      totalFixedIncome: fixedSum,
      totalAdditionalIncome: additionalSum,
      incomeCount: count,
      totalExpectedIncome: expectedSum,
      upcomingIncomeItems: expectedList,
    };
  }, [activeMonthsList, periodType, customStartDate, customEndDate]);

  const upcomingItems = useMemo(() => {
    return [...upcomingExpenseItems, ...upcomingIncomeItems].sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    });
  }, [upcomingExpenseItems, upcomingIncomeItems]);

  const { dueTodayItems, overdueItems } = useMemo(() => {
    const todayKey = toLocalDateKey(new Date());
    const dueToday: UpcomingDashboardItem[] = [];
    const overdue: UpcomingDashboardItem[] = [];

    Object.entries(monthlyData || {}).forEach(([mKey, record]) => {
      if (!record) return;
      const pushIfDue = (
        item: ExpenseItem | IncomeItem,
        kind: "fixed" | "additional" | "income"
      ) => {
        if (!item || !isPlannedExpense(item)) return;
        if (kind === "income" && (item as IncomeItem).type === "expense") return;
        const dKey = resolveRecordDateKey(item, mKey);
        if (dKey > todayKey) return;
        const entry: UpcomingDashboardItem = {
          id: item.id,
          monthKey: mKey,
          kind,
          categoryName: item.categoryName,
          categoryIcon: item.categoryIcon,
          categoryColor: item.categoryColor,
          note: item.note,
          merchantName: item.merchantName,
          date: item.date || "",
          dateKey: dKey,
          expectedDate: item.expectedDate,
          amount: Number(item.amount) || 0,
          repeat: item.repeat,
          recurrenceDayOfMonth: item.recurrenceDayOfMonth,
          recurrenceMonthOfYear: item.recurrenceMonthOfYear,
          recurrenceDayOfWeek: item.recurrenceDayOfWeek,
        };
        if (dKey === todayKey) dueToday.push(entry);
        else overdue.push(entry);
      };

      if (Array.isArray(record.expenses?.fixed_expenses)) {
        record.expenses.fixed_expenses.forEach((e) => pushIfDue(e, "fixed"));
      }
      if (Array.isArray(record.expenses?.additional_expenses)) {
        record.expenses.additional_expenses.forEach((e) => pushIfDue(e, "additional"));
      }
      if (Array.isArray(record.incomes)) {
        record.incomes.forEach((inc) => pushIfDue(inc, "income"));
      }
    });

    return {
      dueTodayItems: dueToday.sort((a, b) => b.amount - a.amount),
      overdueItems: overdue.sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    };
  }, [monthlyData]);

  // Savings in period (income - expense in savings ledger)
  const periodSavings = useMemo(() => {
    return filteredSavings.reduce((acc, item) => {
      return acc + (item.type === "expense" ? -item.amount : item.amount);
    }, 0);
  }, [filteredSavings]);

  // Total Lifetime Savings balance
  const lifetimeSavings = useMemo(() => {
    return globalSavings.reduce((acc, item) => {
      return acc + (item.type === "expense" ? -item.amount : item.amount);
    }, 0);
  }, [globalSavings]);

  // Net Balance = Income - Expenses
  const netBalance = totalIncome - totalExpenses;

  // Automatic Recommended Savings based on Savings Target %
  const recommendedSavings = useMemo(() => {
    return parseFloat(((totalIncome * savingsTargetPercent) / 100).toFixed(2));
  }, [totalIncome, savingsTargetPercent]);

  // 4. Chart 2 Data: Income vs Expenses
  const incomeVsExpensesData = useMemo(() => {
    if (periodType === "year" || periodType === "custom") {
      // Group by month for the year / range
      const monthMap: Record<
        number,
        { monthName: string; income: number; expenses: number }
      > = {};

      MONTHS_BG.forEach((m, idx) => {
        monthMap[idx] = { monthName: MONTHS_SHORT[idx], income: 0, expenses: 0 };
      });

      const seenIncomeIds = new Set<string>();

      // Add monthlyData expenses & incomes
      activeMonthsList.forEach(({ monthIndex, record }) => {
        const exp = record.expenses;
        let sum = 0;
        if (exp?.fixed_expenses) {
          if (Array.isArray(exp.fixed_expenses)) {
            sum += exp.fixed_expenses
              .filter((i: ExpenseItem) => isCompletedExpense(i))
              .reduce((s, i) => s + i.amount, 0);
          } else {
            const leg = exp.fixed_expenses as any;
            sum += (leg.credit_eur || 0) + (leg.phone_eur || 0) + (leg.internet_eur || 0);
          }
        }
        if (exp?.additional_expenses) {
          sum += exp.additional_expenses
            .filter((i: ExpenseItem) => isCompletedExpense(i))
            .reduce((s, i) => s + i.amount, 0);
        }
        if (monthMap[monthIndex]) {
          monthMap[monthIndex].expenses += sum;
        }

        if (record.incomes && Array.isArray(record.incomes)) {
          record.incomes.forEach((inc) => {
            if (
              !inc ||
              inc.type === "expense" ||
              !isRecordCompleted(inc) ||
              seenIncomeIds.has(inc.id)
            ) {
              return;
            }
            if (periodType === "custom" && inc.date) {
              const d = new Date(inc.date);
              const start = new Date(customStartDate + "T00:00:00");
              const end = new Date(customEndDate + "T23:59:59");
              if (d < start || d > end) return;
            }
            seenIncomeIds.add(inc.id);
            if (monthMap[monthIndex]) {
              monthMap[monthIndex].income += Number(inc.amount) || 0;
            }
          });
        }
      });

      return Object.values(monthMap);
    }

    // For single month views: compare Income, Fixed, Variable, and Net
    return [
      { name: "Приходи", value: totalIncome, fill: "#10b981" },
      { name: "Повтарящи се", value: totalFixed, fill: "#3b82f6" },
      { name: "Допълнителни", value: totalVariable, fill: "#f59e0b" },
      { name: "Общо разходи", value: totalExpenses, fill: "#ef4444" },
    ];
  }, [
    periodType,
    activeMonthsList,
    customStartDate,
    customEndDate,
    totalIncome,
    totalFixed,
    totalVariable,
    totalExpenses,
  ]);

  // 5. Chart 3 Data: Monthly Trend (Expenses over time)
  const monthlyTrendData = useMemo(() => {
    const trend = Array(12)
      .fill(0)
      .map((_, i) => ({
        month: MONTHS_SHORT[i],
        expenses: 0,
        income: 0,
      }));

    const targetYear =
      periodType === "year" ? parseInt(selectedYear, 10) : now.getFullYear();
    const seenIncomeIds = new Set<string>();

    // Fill expenses & monthly incomes
    Object.entries(monthlyData).forEach(([key, record]) => {
      const parts = key.trim().split(" ");
      if (parts.length >= 2) {
        const mIndex = MONTHS_BG.indexOf(parts[0]);
        const y = parseInt(parts[1], 10);
        if (y === targetYear && mIndex !== -1) {
          const exp = record.expenses;
          let sum = 0;
          if (exp?.fixed_expenses) {
            if (Array.isArray(exp.fixed_expenses)) {
              sum += exp.fixed_expenses
                .filter((i: ExpenseItem) => isCompletedExpense(i))
                .reduce((s, i) => s + i.amount, 0);
            } else {
              const leg = exp.fixed_expenses as any;
              sum +=
                (leg.credit_eur || 0) +
                (leg.phone_eur || 0) +
                (leg.internet_eur || 0);
            }
          }
          if (exp?.additional_expenses) {
            sum += exp.additional_expenses
              .filter((i: ExpenseItem) => isCompletedExpense(i))
              .reduce((s, i) => s + i.amount, 0);
          }
          trend[mIndex].expenses += sum;

          if (record.incomes && Array.isArray(record.incomes)) {
            record.incomes.forEach((inc) => {
              if (
                !inc ||
                inc.type === "expense" ||
                !isRecordCompleted(inc) ||
                seenIncomeIds.has(inc.id)
              ) {
                return;
              }
              seenIncomeIds.add(inc.id);
              trend[mIndex].income += Number(inc.amount) || 0;
            });
          }
        }
      }
    });

    return trend;
  }, [monthlyData, periodType, selectedYear, now]);

  // 6. Chart 4 Data: Savings Trend (Cumulative balance over 12 months)
  const savingsTrendData = useMemo(() => {
    const targetYear =
      periodType === "year" ? parseInt(selectedYear, 10) : now.getFullYear();

    const data = Array(12)
      .fill(0)
      .map((_, month) => {
        const endOfMonth = new Date(targetYear, month + 1, 0, 23, 59, 59);
        const balance = globalSavings.reduce((acc, item) => {
          const itemDate = new Date(item.date);
          if (itemDate <= endOfMonth) {
            return acc + (item.type === "expense" ? -item.amount : item.amount);
          }
          return acc;
        }, 0);

        return {
          month: MONTHS_SHORT[month],
          balance: parseFloat(balance.toFixed(2)),
        };
      });

    return data;
  }, [globalSavings, periodType, selectedYear, now]);

  // Period label for title
  const currentPeriodLabel = useMemo(() => {
    if (periodType === "current") {
      return `${capitalizedCurrentMonth} ${now.getFullYear()}`;
    }
    if (periodType === "month") {
      return `${selectedMonth} ${selectedYear}`;
    }
    if (periodType === "year") {
      return `${selectedYear} година`;
    }
    return `${customStartDate} — ${customEndDate}`;
  }, [
    periodType,
    capitalizedCurrentMonth,
    now,
    selectedMonth,
    selectedYear,
    customStartDate,
    customEndDate,
  ]);

  // Budget calculations for the active period
  const activeRecordForBudget = useMemo(() => {
    if (periodType === "current") {
      const curKey = `${capitalizedCurrentMonth} ${now.getFullYear()}`;
      return monthlyData[curKey];
    }
    if (periodType === "month") {
      const targetKey = `${selectedMonth} ${selectedYear}`;
      return monthlyData[targetKey];
    }
    return activeMonthsList[0]?.record;
  }, [
    periodType,
    monthlyData,
    capitalizedCurrentMonth,
    now,
    selectedMonth,
    selectedYear,
    activeMonthsList,
  ]);

  const budgetData = useMemo(() => {
    const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
    return calculateAllBudgetsStatus(
      activeRecordForBudget,
      totalMonthlyBudget,
      categoryBudgets
    );
  }, [activeRecordForBudget, budgetsRevision]);

  // Month-to-Month comparison data (Current Month vs Previous Month)
  const monthComparisonData = useMemo(() => {
    let mName = capitalizedCurrentMonth;
    let yNum = now.getFullYear();
    if (periodType === "month") {
      mName = selectedMonth;
      yNum = parseInt(selectedYear, 10);
    } else if (periodType === "current") {
      mName = capitalizedCurrentMonth;
      yNum = now.getFullYear();
    }
    return computeMonthToMonthComparison(
      mName,
      yNum,
      monthlyData,
      globalSavings
    );
  }, [
    periodType,
    selectedMonth,
    selectedYear,
    capitalizedCurrentMonth,
    now,
    monthlyData,
    globalSavings,
  ]);

  // AI Financial Analysis for top recommendations
  const aiAnalysis = useMemo(() => {
    return generateLocalFinancialAnalysis(monthlyData, globalSavings);
  }, [monthlyData, globalSavings, budgetsRevision]);

  // Read-only Electricity History & Savings Goals summary for Dashboard cards
  const electricityHistory = useMemo(() => {
    return mergeElectricityHistoryWithManualExpenses(
      getStoredElectricityHistory(),
      monthlyData
    );
  }, [monthlyData, electricityRevision]);

  const savingsAllocationSummary = useMemo(() => {
    const goals = loadSavingsGoals();
    return computeSavingsAllocationSummary(globalSavings, goals, monthlyData);
  }, [globalSavings, monthlyData, savingsGoalsRevision]);

  const { isDark } = useTheme();

  const isCompletelyEmpty =
    Object.keys(monthlyData || {}).length === 0 && (globalSavings || []).length === 0;

  return (
    <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-500">
      {/* Welcome / Empty-State Banner */}
      {isCompletelyEmpty && (
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-600 text-white p-5 sm:p-6 rounded-2xl shadow-md border border-indigo-400/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <BrandMark size={52} variant="appIcon" className="rounded-full shadow-md shrink-0 ring-2 ring-white/20" />
            <div className="space-y-0.5">
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                Добре дошли в {APP_NAME}
              </h2>
              <p className="text-xs sm:text-sm font-semibold text-indigo-100">
                {APP_TAGLINE}
              </p>
              <p className="text-xs text-indigo-100/90 pt-0.5">
                Започнете като добавите първия си разход, приход или месечен бюджет.
              </p>
            </div>
          </div>
          {onNavigateTab && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateTab("monthly")}
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50 text-xs font-bold shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добави разход</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab("income")}
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Добави приход</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab("budgets")}
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Target className="w-3.5 h-3.5" />
                <span>Настрой бюджет</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Compact Mobile-First Dashboard Header */}
      <div className="flex items-center justify-between gap-2.5 px-0.5">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Финансово табло
          </h2>
          <button
            type="button"
            onClick={() => setIsFiltersSheetOpen(true)}
            className="inline-flex items-center text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/70 dark:border-indigo-800/80 px-2.5 py-0.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer truncate max-w-[190px] sm:max-w-none"
            title="Промени периода"
          >
            {currentPeriodLabel}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsFiltersSheetOpen(true)}
          aria-label="Филтри и експорт"
          aria-haspopup="dialog"
          aria-expanded={isFiltersSheetOpen}
          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#16181d] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-800 rounded-xl text-xs transition-colors shadow-2xs cursor-pointer shrink-0 whitespace-nowrap"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span className="hidden sm:inline">Филтри и експорт</span>
          <span className="sm:hidden">Филтри</span>
        </button>
      </div>

      {/* Swipeable Card-Based Dashboard Carousel */}
      <DashboardCarousel
        cardOrder={cardOrder}
        activeCardId={activeCardId}
        onSelectCard={handleSelectCard}
        onChangeOrder={handleChangeCardOrder}
        renderCard={(cardId, { isActive }) => (
          <DashboardCardContent
            cardId={cardId}
            isActive={isActive}
            viewMode={cardViewModes[cardId] ?? "summary"}
            isExpanded={expandedCardId === cardId}
            onToggleViewMode={(mode) =>
              setCardViewModes((prev) => ({ ...prev, [cardId]: mode }))
            }
            onToggleExpand={() =>
              setExpandedCardId((prev) => (prev === cardId ? null : cardId))
            }
            periodType={periodType}
            currentPeriodLabel={currentPeriodLabel}
            totalIncome={totalIncome}
            totalFixedIncome={totalFixedIncome}
            totalAdditionalIncome={totalAdditionalIncome}
            incomeCount={incomeCount}
            totalExpectedIncome={totalExpectedIncome}
            upcomingIncomeItems={upcomingIncomeItems}
            totalFixed={totalFixed}
            totalVariable={totalVariable}
            totalExpenses={totalExpenses}
            totalPlannedExpenses={totalPlannedExpenses}
            upcomingExpenseItems={upcomingExpenseItems}
            categoryBreakdown={categoryBreakdown}
            upcomingItems={upcomingItems}
            dueTodayItems={dueTodayItems}
            overdueItems={overdueItems}
            periodSavings={periodSavings}
            lifetimeSavings={lifetimeSavings}
            savingsTargetPercent={savingsTargetPercent}
            recommendedSavings={recommendedSavings}
            onSavingsTargetChange={handleSavingsTargetChange}
            savingsAllocationSummary={savingsAllocationSummary}
            netBalance={netBalance}
            budgetData={budgetData}
            monthComparisonData={monthComparisonData}
            aiAnalysis={aiAnalysis}
            electricityHistory={electricityHistory}
            incomeVsExpensesData={incomeVsExpensesData}
            monthlyTrendData={monthlyTrendData}
            savingsTrendData={savingsTrendData}
            isDark={isDark}
            onNavigateTab={onNavigateTab}
            onOpenCalendar={onOpenCalendar}
            onOpenRecord={onOpenRecord}
            onToggleRecordCompletion={onToggleRecordCompletion}
            onOpenExportCenter={() => setIsExportCenterOpen(true)}
          />
        )}
      />

      {/* Filters & Export Bottom Sheet (mobile) / Modal Dialog (desktop) */}
      {isFiltersSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs sm:p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-filters-title"
          onClick={() => setIsFiltersSheetOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Sheet Handle */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-1">
              <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="px-5 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="dashboard-filters-title"
                  className="text-base font-bold text-slate-900 dark:text-white"
                >
                  Филтри и експорт
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  Активен период: {currentPeriodLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFiltersSheetOpen(false)}
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                aria-label="Затвори"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body: Existing Period Filters + Export */}
            <div className="p-5 space-y-5 overflow-y-auto">
              <div className="space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Период
                </p>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 p-1.5 border border-slate-200/60 dark:border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => setPeriodType("current")}
                    className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                      periodType === "current"
                        ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Текущ месец
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodType("month")}
                    className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                      periodType === "month"
                        ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Конкретен месец
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodType("year")}
                    className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                      periodType === "year"
                        ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Цяла година
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodType("custom")}
                    className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                      periodType === "custom"
                        ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Период
                  </button>
                </div>

                {periodType === "month" && (
                  <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in duration-150">
                    <div className="relative">
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[42px] py-2 pl-3 pr-8 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        {MONTHS_BG.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    <div className="relative">
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[42px] py-2 pl-3 pr-8 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      >
                        {YEARS.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                )}

                {periodType === "year" && (
                  <div className="relative pt-1 animate-in fade-in duration-150">
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[42px] py-2 pl-3 pr-8 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y} г.
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}

                {periodType === "custom" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 animate-in fade-in duration-150">
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        От дата
                      </span>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[42px] py-2 px-3 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        До дата
                      </span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[42px] py-2 px-3 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Отчети и експорт
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsFiltersSheetOpen(false);
                    setIsExportCenterOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs transition-colors cursor-pointer"
                  title="Отвори център за отчети и експорт (TXT / PNG)"
                >
                  <Download className="w-4 h-4" />
                  <span>Експорт на отчет</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsFiltersSheetOpen(false)}
                className="w-full sm:w-auto min-h-[42px] px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reporting & Export Center Modal */}
      <ExportCenterModal
        isOpen={isExportCenterOpen}
        onClose={() => setIsExportCenterOpen(false)}
        monthlyData={monthlyData}
        globalSavings={globalSavings}
        initialPeriodType={periodType === "current" ? "month" : periodType}
        initialMonth={selectedMonth}
        initialYear={selectedYear}
      />
    </div>
  );
};
