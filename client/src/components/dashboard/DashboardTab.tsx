import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  CreditCard,
  PiggyBank,
  Scale,
  Calendar,
  CalendarDays,
  ChevronDown,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  PieChart as PieChartIcon,
  BarChart2,
  LineChart as LineChartIcon,
  Zap,
  Info,
  Plus,
  Download,
  FileText,
  Target,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Clock,
  CheckCircle2,
  Repeat,
} from "lucide-react";
import { ExportCenterModal } from "@/components/export/ExportCenterModal";
import {
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { MonthlyRecord, IncomeItem, ExpenseItem, RepeatFrequency } from "@/types";
import { getCategoryColor } from "@/utils/colors";
import { CategoryDistributionChart } from "@/components/charts/CategoryDistributionChart";
import {
  loadBudgets,
  calculateAllBudgetsStatus,
} from "@/utils/budgetStorage";
import { AVAILABLE_ICONS_MAP } from "@/utils/categoryStorage";
import { MonthToMonthComparison } from "@/components/common/MonthToMonthComparison";
import { BudgetControlSection } from "./BudgetControlSection";
import { AiRecommendationsSection } from "./AiRecommendationsSection";
import { computeMonthToMonthComparison } from "@/utils/comparisonStorage";
import { generateLocalFinancialAnalysis } from "@/utils/aiAnalysisEngine";
import { useTheme } from "@/utils/themeContext";
import { loadAppSettings, saveAppSettings } from "@/utils/incomeStorage";
import { isCompletedExpense, isPlannedExpense, isRecordCompleted } from "@/utils/expenseStatus";
import { formatRepeatLabel, isRepeatingFrequency } from "@/utils/recurrenceEngine";
import { CompletionSwitch } from "@/components/ui/RecurrenceCompletionRows";
import { parseLocalDateKey, resolveRecordDateKey, toLocalDateKey } from "@/utils/calendarEngine";

interface UpcomingDashboardItem {
  id: string;
  monthKey: string;
  kind: "fixed" | "additional" | "income";
  categoryName: string;
  categoryIcon?: string;
  categoryColor?: string;
  note?: string;
  merchantName?: string;
  date: string;
  dateKey: string;
  amount: number;
  repeat?: RepeatFrequency;
}

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

const PALETTE = [
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

  // Export Center Modal State
  const [isExportCenterOpen, setIsExportCenterOpen] = useState(false);

  // Savings Target % setting (for Automatic Savings Suggestions)
  const [savingsTargetPercent, setSavingsTargetPercent] = useState<number>(() => {
    return loadAppSettings().savingsTargetPercent ?? 20;
  });

  const [budgetsRevision, setBudgetsRevision] = React.useState(0);

  React.useEffect(() => {
    const handleRestored = () => {
      setSavingsTargetPercent(loadAppSettings().savingsTargetPercent ?? 20);
      setBudgetsRevision((v) => v + 1);
    };
    const handleBudgetOrCatUpdate = () => {
      setBudgetsRevision((v) => v + 1);
    };
    window.addEventListener("homebudget:data-restored", handleRestored);
    window.addEventListener("homebudget:budgets-updated", handleBudgetOrCatUpdate);
    window.addEventListener("homebudget:categories-updated", handleBudgetOrCatUpdate);
    window.addEventListener("storage", handleBudgetOrCatUpdate);
    return () => {
      window.removeEventListener("homebudget:data-restored", handleRestored);
      window.removeEventListener("homebudget:budgets-updated", handleBudgetOrCatUpdate);
      window.removeEventListener("homebudget:categories-updated", handleBudgetOrCatUpdate);
      window.removeEventListener("storage", handleBudgetOrCatUpdate);
    };
  }, []);

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
              amount: amt,
              repeat: item.repeat,
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
              amount: amt,
              repeat: item.repeat,
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
              amount: amt,
              repeat: inc.repeat,
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
          amount: Number(item.amount) || 0,
          repeat: item.repeat,
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

  const { isDark } = useTheme();

  const gridStroke = isDark ? "#334155" : "#f1f5f9";
  const axisTickStyle = { fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" };
  const chartTooltipStyle = {
    backgroundColor: isDark ? "#0f172a" : "#ffffff",
    borderColor: isDark ? "#334155" : "#e2e8f0",
    color: isDark ? "#f8fafc" : "#0f172a",
    borderRadius: "12px",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.4)",
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Bar with Period Selector */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span>Финансово табло</span>
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 px-2.5 py-0.5 rounded-full">
              {currentPeriodLabel}
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Обобщен преглед на паричните потоци, разходите и спестяванията
          </p>
        </div>

        {/* Period Selector Controls */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full md:w-auto">
          {/* Quick Period Buttons */}
          <div className="grid grid-cols-2 sm:flex sm:flex-row items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200/60 dark:border-slate-700/60 w-full sm:w-auto gap-1">
            <button
              onClick={() => setPeriodType("current")}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                periodType === "current"
                  ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Текущ месец
            </button>
            <button
              onClick={() => setPeriodType("month")}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                periodType === "month"
                  ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Конкретен месец
            </button>
            <button
              onClick={() => setPeriodType("year")}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                periodType === "year"
                  ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Цяла година
            </button>
            <button
              onClick={() => setPeriodType("custom")}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                periodType === "custom"
                  ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Период
            </button>
          </div>

          {/* Conditional Dropdowns for Period */}
          {periodType === "month" && (
            <div className="flex items-center gap-1.5 w-full sm:w-auto animate-in fade-in duration-150">
              <div className="relative flex-1 sm:flex-none">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[38px] py-1.5 pl-3 pr-7 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {MONTHS_BG.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="relative flex-1 sm:flex-none">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[38px] py-1.5 pl-3 pr-7 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {periodType === "year" && (
            <div className="relative w-full sm:w-auto animate-in fade-in duration-150">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[38px] py-1.5 pl-3 pr-7 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y} г.
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {periodType === "custom" && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 w-full sm:w-auto animate-in fade-in duration-150">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[38px] py-1.5 px-3 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-slate-500 dark:text-slate-400 text-xs text-center hidden sm:inline">—</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[38px] py-1.5 px-3 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          )}

          {/* Export Button in Top Bar */}
          <button
            onClick={() => setIsExportCenterOpen(true)}
            className="flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs transition-colors shadow-2xs cursor-pointer w-full sm:w-auto"
            title="Отвори център за отчети и експорт (TXT / PNG)"
          >
            <Download className="w-4 h-4" />
            <span>Експорт на отчет</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Income Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Приходи
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight tabular-nums">
              €{totalIncome.toFixed(2)}
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>Повт.: €{totalFixedIncome.toFixed(2)}</span>
              <span>·</span>
              <span>Доп.: €{totalAdditionalIncome.toFixed(2)}</span>
              <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-semibold ml-auto">
                <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
                {incomeCount} бр.
              </span>
            </div>
          </div>
        </div>

        {/* 2. Expenses Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Разходи
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight tabular-nums">
              €{totalExpenses.toFixed(2)}
            </span>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>Повт.: €{totalFixed.toFixed(2)}</span>
              <span>·</span>
              <span>Доп.: €{totalVariable.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* 3. Savings Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Спестявания
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <PiggyBank className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight tabular-nums">
              €{periodSavings.toFixed(2)}
            </span>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>Общ наличен фонд:</span>
              <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                €{lifetimeSavings.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Net Balance Card (Net Balance = Income - Expenses) */}
        <div
          className={`p-5 rounded-2xl border shadow-xs hover:shadow-md transition-all ${
            netBalance >= 0
              ? "bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/30 dark:to-slate-900 border-emerald-200/80 dark:border-emerald-800/80"
              : "bg-gradient-to-br from-rose-50/50 to-white dark:from-rose-950/30 dark:to-slate-900 border-rose-200/80 dark:border-rose-800/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Нетно салдо
            </span>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                netBalance >= 0
                  ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300"
              }`}
            >
              <Scale className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className={`text-2xl font-black tracking-tight tabular-nums ${
                netBalance >= 0
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {netBalance >= 0 ? "+" : ""}€{netBalance.toFixed(2)}
            </span>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Приходи − Разходи</span>
              {totalIncome > 0 && (
                <span
                  className={`font-semibold ml-auto tabular-nums ${
                    netBalance >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {((netBalance / totalIncome) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Additional Summary: Realized vs Upcoming & Expected Totals */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Реализирани и предстоящи</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Само записите с включено „Изпълнено“ влизат в реалния баланс, бюджетите и отчетите
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Очаквани = Реализирани + Предстоящи
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-4">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
              Похарчени
            </span>
            <span className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1 block">
              €{totalExpenses.toFixed(2)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/85 dark:bg-amber-950/40 border border-amber-300/90 dark:border-amber-800/80 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Предстоящи разходи</span>
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 tabular-nums">
                {upcomingExpenseItems.length}
              </span>
            </div>
            <span className="text-xl font-extrabold text-amber-800 dark:text-amber-200 tabular-nums mt-1.5 block">
              €{totalPlannedExpenses.toFixed(2)}
            </span>
            <span className="text-[11px] text-amber-700/80 dark:text-amber-400/90 mt-1 block tabular-nums">
              Очаквани общо: €{(totalExpenses + totalPlannedExpenses).toFixed(2)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 block">
              Реализирани приходи
            </span>
            <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums mt-1 block">
              €{totalIncome.toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block tabular-nums">
              Повтарящи се: €{totalFixedIncome.toFixed(2)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-800/70">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Очаквани приходи</span>
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 tabular-nums">
                {upcomingIncomeItems.length}
              </span>
            </div>
            <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums mt-1.5 block">
              +€{totalExpectedIncome.toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block tabular-nums">
              Общо очаквани: €{(totalIncome + totalExpectedIncome).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Upcoming Today & Overdue Attention Strip (synced with Notifications) */}
      {(dueTodayItems.length > 0 || overdueItems.length > 0) && (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  overdueItems.length > 0
                    ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                    : "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
                }`}
              >
                {overdueItems.length > 0 ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Предстоящи днес
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {dueTodayItems.length} за днес
                  {overdueItems.length > 0 ? ` · ${overdueItems.length} с изминал падеж` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onOpenCalendar
                  ? onOpenCalendar((overdueItems[0] || dueTodayItems[0])?.dateKey)
                  : onNavigateTab?.("calendar")
              }
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Календар</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {[...overdueItems, ...dueTodayItems].map((item) => {
              const isOverdue = overdueItems.some(
                (o) => o.id === item.id && o.monthKey === item.monthKey
              );
              const isIncome = item.kind === "income";
              const dateLabel = parseLocalDateKey(item.dateKey).toLocaleDateString("bg-BG");
              return (
                <div
                  key={`today_${item.kind}_${item.monthKey}_${item.id}`}
                  onClick={() =>
                    onOpenRecord
                      ? onOpenRecord({
                          kind: item.kind,
                          monthKey: item.monthKey,
                          id: item.id,
                        })
                      : onOpenCalendar?.(item.dateKey)
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (onOpenRecord) {
                        onOpenRecord({
                          kind: item.kind,
                          monthKey: item.monthKey,
                          id: item.id,
                        });
                      } else {
                        onOpenCalendar?.(item.dateKey);
                      }
                    }
                  }}
                  className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {item.categoryName}
                      </span>
                      <span
                        className={`text-xs font-semibold tabular-nums shrink-0 ${
                          isOverdue
                            ? "text-rose-600 dark:text-rose-400"
                            : isIncome
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isOverdue
                          ? `Просрочен (${dateLabel})`
                          : isIncome
                          ? "Очакван приход днес"
                          : "Падеж днес"}
                      </span>
                    </div>
                    {(item.merchantName || item.note) && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {[item.merchantName, item.note].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>

                  <div
                    className="flex items-center gap-2.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        isIncome
                          ? "text-emerald-600 dark:text-emerald-400"
                          : isOverdue
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-slate-900 dark:text-white"
                      }`}
                    >
                      {isIncome ? "+" : "-"}€{item.amount.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onToggleRecordCompletion?.(item.monthKey, item.kind, item.id, true)
                      }
                      className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Изпълнено</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dedicated Upcoming Payments & Income Widget */}
      <div className="bg-gradient-to-br from-amber-50/80 via-white to-white dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900 p-5 rounded-2xl border border-amber-300/90 dark:border-amber-800/75 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-amber-200/75 dark:border-amber-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/70 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 border border-amber-200/80 dark:border-amber-700/60">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Предстоящи плащания и приходи
                </h3>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 tabular-nums">
                  {upcomingItems.length}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {upcomingItems.length > 0
                  ? `Натиснете запис, за да отворите датата му в Календар (${currentPeriodLabel})`
                  : `Няма предстоящи плащания и приходи за ${currentPeriodLabel}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-center text-right">
            {upcomingExpenseItems.length > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-amber-100/80 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-800/70 text-left">
                <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 block">
                  Предстоящи разходи ({upcomingExpenseItems.length})
                </span>
                <span className="text-sm sm:text-base font-extrabold text-amber-900 dark:text-amber-200 tabular-nums">
                  €{totalPlannedExpenses.toFixed(2)}
                </span>
              </div>
            )}
            {upcomingIncomeItems.length > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-left">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 block">
                  Очаквани приходи ({upcomingIncomeItems.length})
                </span>
                <span className="text-sm sm:text-base font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  +€{totalExpectedIncome.toFixed(2)}
                </span>
              </div>
            )}
            {upcomingExpenseItems.length === 0 && upcomingIncomeItems.length === 0 && (
              <span className="text-sm font-bold text-slate-400 dark:text-slate-500 tabular-nums">
                €0.00
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                onOpenCalendar
                  ? onOpenCalendar(upcomingItems[0]?.dateKey)
                  : onNavigateTab?.("calendar")
              }
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Отвори Календар</span>
            </button>
          </div>
        </div>

        {upcomingItems.length > 0 ? (
          <div className="divide-y divide-amber-200/70 dark:divide-amber-800/60 border border-amber-200/80 dark:border-amber-800/70 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
            {upcomingItems.map((item) => {
              const isIncome = item.kind === "income";
              const IconComponent =
                (item.categoryIcon && AVAILABLE_ICONS_MAP[item.categoryIcon]) ||
                (isIncome ? ArrowDownLeft : Clock);
              const formattedDate = parseLocalDateKey(item.dateKey).toLocaleDateString("bg-BG");
              const hasRepeat = Boolean(item.repeat && item.repeat !== "never");
              const secondaryLabel = [item.merchantName, item.note]
                .filter(Boolean)
                .join(" · ");

              return (
                <div
                  key={`${item.kind}_${item.monthKey}_${item.id}`}
                  onClick={() =>
                    onOpenCalendar
                      ? onOpenCalendar(item.dateKey)
                      : onNavigateTab?.("calendar")
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (onOpenCalendar) onOpenCalendar(item.dateKey);
                      else onNavigateTab?.("calendar");
                    }
                  }}
                  className="px-3.5 py-2.5 bg-white dark:bg-slate-900 hover:bg-amber-50/60 dark:hover:bg-amber-950/30 transition-colors cursor-pointer space-y-1.5"
                  title="Отвори датата в Календар"
                >
                  {/* Row 1: Icon + Title + Status Tag | Amount + Desktop Actions */}
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isIncome
                            ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-100/80 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                          {item.categoryName}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 border ${
                            isIncome
                              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/70"
                              : "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/70"
                          }`}
                        >
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{isIncome ? "Очакван" : "Предстоящ"}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`font-bold text-sm sm:text-base tabular-nums ${
                          isIncome
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-amber-800 dark:text-amber-300"
                        }`}
                      >
                        {isIncome ? "+" : "-"}€{item.amount.toFixed(2)}
                      </span>
                      {onOpenRecord && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenRecord({
                              kind: item.kind,
                              monthKey: item.monthKey,
                              id: item.id,
                            });
                          }}
                          className="hidden sm:inline-flex min-h-[30px] items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                          title="Отвори записа за редакция"
                        >
                          Отвори
                        </button>
                      )}
                      <div
                        className="hidden sm:flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Изпълнено
                        </span>
                        <CompletionSwitch
                          checked={false}
                          onChange={() =>
                            onToggleRecordCompletion?.(item.monthKey, item.kind, item.id, true)
                          }
                          ariaLabel={`Отбележи „${item.categoryName}“ като изпълнено`}
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Horizontal Metadata Chips + Description | Mobile Compact Actions */}
                  <div className="flex items-center justify-between gap-2 pl-10">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100/80 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/70 tabular-nums shrink-0">
                        <CalendarDays className="w-3 h-3 shrink-0" />
                        <span>{formattedDate}</span>
                      </span>
                      {hasRepeat && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70 shrink-0">
                          <Repeat className="w-3 h-3 shrink-0" />
                          <span>{formatRepeatLabel(item.repeat)}</span>
                        </span>
                      )}
                      {(periodType === "year" || periodType === "custom") && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                          {item.monthKey}
                        </span>
                      )}
                      {secondaryLabel && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate min-w-0">
                          {secondaryLabel}
                        </span>
                      )}
                    </div>

                    {/* Mobile Compact Actions */}
                    <div
                      className="flex sm:hidden items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onOpenRecord && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenRecord({
                              kind: item.kind,
                              monthKey: item.monthKey,
                              id: item.id,
                            })
                          }
                          className="min-h-[30px] inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          Отвори
                        </button>
                      )}
                      <CompletionSwitch
                        checked={false}
                        onChange={() =>
                          onToggleRecordCompletion?.(item.monthKey, item.kind, item.id, true)
                        }
                        ariaLabel={`Отбележи „${item.categoryName}“ като изпълнено`}
                        size="sm"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-5 px-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              Всички записи за периода са изпълнени или няма добавени предстоящи плащания и приходи.
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateTab?.("monthly")}
                className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer whitespace-nowrap shrink-0"
              >
                + Разход
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab?.("income")}
                className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer whitespace-nowrap shrink-0"
              >
                + Приход
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Automatic Savings Suggestions Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <PiggyBank className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Автоматично предложение за спестяване
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              При приходи от{" "}
              <strong className="text-slate-800 dark:text-slate-200 tabular-nums">
                €{totalIncome.toFixed(2)}
              </strong>{" "}
              и цел{" "}
              <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                {savingsTargetPercent}%
              </strong>
              : препоръчително заделяне{" "}
              <strong className="text-emerald-700 dark:text-emerald-300 tabular-nums">
                €{recommendedSavings.toFixed(2)}
              </strong>
              {totalIncome > 0 && (
                <>
                  {" · "}
                  {netBalance >= recommendedSavings
                    ? "Нетният баланс покрива целта ви"
                    : `Недостиг до целта: €${Math.max(0, recommendedSavings - Math.max(0, netBalance)).toFixed(2)}`}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>Цел (%):</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={savingsTargetPercent}
              onChange={(e) => handleSavingsTargetChange(e.target.value)}
              className="w-18 px-2.5 py-1.5 min-h-[38px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Цел за спестяване в проценти"
            />
          </label>

          <div className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-right">
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300 block font-medium">
              Препоръчително спестяване
            </span>
            <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
              €{recommendedSavings.toFixed(2)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab?.("income")}
            className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            Управление на приходи
          </button>
        </div>
      </div>

      {/* Budget and Expense Control Section */}
      <BudgetControlSection
        budgetData={budgetData}
        currentPeriodLabel={currentPeriodLabel}
        onNavigateTab={onNavigateTab}
      />

      {/* Month-to-Month Comparison Section */}
      <MonthToMonthComparison comparisonData={monthComparisonData} />

      {/* Charts Grid: 2x2 Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Expenses by Category (Pie Chart) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col transition-colors">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg">
                <PieChartIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Разходи по категории
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Дял на отделните видове харчове
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700">
              Общо: €{totalExpenses.toFixed(2)}
            </span>
          </div>

          <CategoryDistributionChart
            items={categoryBreakdown}
            totalLabel="Общо"
            emptyTitle="Няма разходи за този период"
            emptyActionLabel="+ Въведи разход"
            onEmptyAction={() => onNavigateTab?.("monthly")}
          />
        </div>

        {/* Chart 2: Income vs Expenses (Bar Chart) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col transition-colors">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <BarChart2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Приходи спрямо Разходи
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Сравнение на входящи и изходящи потоци
                </p>
              </div>
            </div>
          </div>

          <div className="h-[220px] w-full">
            {periodType === "year" || periodType === "custom" ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={incomeVsExpensesData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="monthName" tick={axisTickStyle} stroke={gridStroke} />
                  <YAxis tick={axisTickStyle} stroke={gridStroke} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(val: any) => [`€${Number(val).toFixed(2)}`]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 6, color: isDark ? "#cbd5e1" : "#475569" }}
                    formatter={(val) =>
                      val === "income" ? "Приходи" : "Разходи"
                    }
                  />
                  <Bar
                    dataKey="income"
                    name="income"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="expenses"
                    name="expenses"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={incomeVsExpensesData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="name" tick={axisTickStyle} stroke={gridStroke} />
                  <YAxis tick={axisTickStyle} stroke={gridStroke} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(val: any) => [`€${Number(val).toFixed(2)}`, "Сума"]}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {incomeVsExpensesData.map((entry: any, index: number) => (
                      <Cell key={`bar-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 3: Monthly Trend (Line Chart) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col transition-colors">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
                <LineChartIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Месечна тенденция на разходите
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Динамика през годината (€)
                </p>
              </div>
            </div>
          </div>

          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={monthlyTrendData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="month" tick={axisTickStyle} stroke={gridStroke} />
                <YAxis tick={axisTickStyle} stroke={gridStroke} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(val: any, name: any) => [
                    `€${Number(val).toFixed(2)}`,
                    name === "expenses" ? "Разходи" : "Приходи",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 6, color: isDark ? "#cbd5e1" : "#475569" }}
                  formatter={(val) => (val === "expenses" ? "Разходи" : "Приходи")}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#6366f1" }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 2.5, fill: "#10b981" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Savings Trend (Line Chart) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col transition-colors">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <PiggyBank className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Натрупване на спестявания
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Кумулативен баланс на спестовния фонд
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
              Баланс: €{lifetimeSavings.toFixed(2)}
            </span>
          </div>

          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={savingsTrendData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="month" tick={axisTickStyle} stroke={gridStroke} />
                <YAxis tick={axisTickStyle} stroke={gridStroke} />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(val: any) => [`€${Number(val).toFixed(2)}`, "Спестявания"]}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 3.5, fill: "#10b981" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top 3 AI Recommendations & Insights Section */}
      <AiRecommendationsSection
        aiAnalysis={aiAnalysis}
        onNavigateTab={onNavigateTab}
      />

      {/* Quick Actions Shortcuts */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
        <div>
          <h4 className="font-bold text-base text-white">Бързи действия</h4>
          <p className="text-xs text-slate-300 mt-0.5">
            Добавете нови плащания или изчислете текущата сметка за ток
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigateTab?.("monthly")}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold backdrop-blur-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Добави разход
          </button>
          <button
            onClick={() => onNavigateTab?.("income")}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Добави приход
          </button>
          <button
            onClick={() => onNavigateTab?.("electricity")}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-yellow-500 hover:bg-yellow-600 text-slate-950 rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            Сметка ТОК
          </button>
          <button
            onClick={() => onNavigateTab?.("budgets")}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Target className="w-3.5 h-3.5" />
            Бюджети
          </button>
          <button
            onClick={() => onNavigateTab?.("ai-analysis")}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            AI Анализ
          </button>
          <button
            onClick={() => setIsExportCenterOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Експорт на отчет
          </button>
        </div>
      </div>

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
