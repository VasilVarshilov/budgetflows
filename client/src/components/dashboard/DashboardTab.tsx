import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  CreditCard,
  PiggyBank,
  Scale,
  Calendar,
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
} from "lucide-react";
import { ExportCenterModal } from "@/components/export/ExportCenterModal";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
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
import { MonthlyRecord, IncomeItem, ExpenseItem } from "@/types";
import {
  SYSTEM_CATEGORY_COLORS,
  getHexFromTailwindClass,
} from "@/utils/colors";
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

interface DashboardTabProps {
  monthlyData: Record<string, MonthlyRecord>;
  globalSavings: IncomeItem[];
  onNavigateTab?: (tab: "dashboard" | "monthly" | "income" | "electricity" | "reports" | "savings" | "backup" | "budgets" | "ai-analysis") => void;
  onTriggerSync?: () => void;
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
  onTriggerSync,
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

  React.useEffect(() => {
    const handleRestored = () => {
      setSavingsTargetPercent(loadAppSettings().savingsTargetPercent ?? 20);
    };
    window.addEventListener("homebudget:data-restored", handleRestored);
    return () => window.removeEventListener("homebudget:data-restored", handleRestored);
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
  // Expenses from monthlyData
  const { totalFixed, totalVariable, totalExpenses, categoryBreakdown } =
    useMemo(() => {
      let fixed = 0;
      let variable = 0;
      const catMap: Record<string, { value: number; color?: string }> = {};

      activeMonthsList.forEach(({ record }) => {
        const exp = record.expenses;
        if (!exp) return;

        // Fixed expenses
        if (Array.isArray(exp.fixed_expenses)) {
          exp.fixed_expenses.forEach((item: ExpenseItem) => {
            fixed += item.amount;
            if (!catMap[item.categoryName]) {
              catMap[item.categoryName] = {
                value: 0,
                color:
                  SYSTEM_CATEGORY_COLORS[item.categoryName] ||
                  getHexFromTailwindClass(item.categoryColor),
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
              color: SYSTEM_CATEGORY_COLORS["Кредит"],
            };
          }
          if (legacy.phone_eur) {
            fixed += legacy.phone_eur;
            catMap["Телефон"] = {
              value: (catMap["Телефон"]?.value || 0) + legacy.phone_eur,
              color: SYSTEM_CATEGORY_COLORS["Телефон"],
            };
          }
          if (legacy.internet_eur) {
            fixed += legacy.internet_eur;
            catMap["Интернет"] = {
              value: (catMap["Интернет"]?.value || 0) + legacy.internet_eur,
              color: SYSTEM_CATEGORY_COLORS["Интернет"],
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

            variable += item.amount;
            if (!catMap[item.categoryName]) {
              catMap[item.categoryName] = {
                value: 0,
                color: getHexFromTailwindClass(item.categoryColor),
              };
            }
            catMap[item.categoryName].value += item.amount;
          });
        }
      });

      const categoriesArray = Object.entries(catMap)
        .map(([name, data], idx) => ({
          name,
          value: parseFloat(data.value.toFixed(2)),
          color: data.color || PALETTE[idx % PALETTE.length],
        }))
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value);

      return {
        totalFixed: fixed,
        totalVariable: variable,
        totalExpenses: fixed + variable,
        categoryBreakdown: categoriesArray,
      };
    }, [activeMonthsList, periodType, customStartDate, customEndDate]);

  // Income from monthly records (Income tab) + Savings income transactions (deduplicated by ID)
  const { totalIncome, incomeCount } = useMemo(() => {
    let sum = 0;
    let count = 0;
    const seenIds = new Set<string>();

    activeMonthsList.forEach(({ record }) => {
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
          sum += Number(inc.amount) || 0;
          count += 1;
        });
      }
    });

    filteredSavings.forEach((item) => {
      if (item && item.type !== "expense" && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        sum += Number(item.amount) || 0;
        count += 1;
      }
    });

    return { totalIncome: sum, incomeCount: count };
  }, [activeMonthsList, filteredSavings, periodType, customStartDate, customEndDate]);

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
            sum += exp.fixed_expenses.reduce((s, i) => s + i.amount, 0);
          } else {
            const leg = exp.fixed_expenses as any;
            sum += (leg.credit_eur || 0) + (leg.phone_eur || 0) + (leg.internet_eur || 0);
          }
        }
        if (exp?.additional_expenses) {
          sum += exp.additional_expenses.reduce((s, i) => s + i.amount, 0);
        }
        if (monthMap[monthIndex]) {
          monthMap[monthIndex].expenses += sum;
        }

        if (record.incomes && Array.isArray(record.incomes)) {
          record.incomes.forEach((inc) => {
            if (!inc || inc.type === "expense" || seenIncomeIds.has(inc.id)) return;
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

      // Add incomes from filtered savings
      filteredSavings.forEach((tx) => {
        if (tx.type !== "expense" && !seenIncomeIds.has(tx.id)) {
          seenIncomeIds.add(tx.id);
          const mIdx = new Date(tx.date).getMonth();
          if (monthMap[mIdx]) {
            monthMap[mIdx].income += tx.amount;
          }
        }
      });

      return Object.values(monthMap);
    }

    // For single month views: compare Income, Fixed, Variable, and Net
    return [
      { name: "Приходи", value: totalIncome, fill: "#10b981" },
      { name: "Фиксирани", value: totalFixed, fill: "#3b82f6" },
      { name: "Допълнителни", value: totalVariable, fill: "#f59e0b" },
      { name: "Общо разходи", value: totalExpenses, fill: "#ef4444" },
    ];
  }, [
    periodType,
    activeMonthsList,
    filteredSavings,
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
              sum += exp.fixed_expenses.reduce((s, i) => s + i.amount, 0);
            } else {
              const leg = exp.fixed_expenses as any;
              sum +=
                (leg.credit_eur || 0) +
                (leg.phone_eur || 0) +
                (leg.internet_eur || 0);
            }
          }
          if (exp?.additional_expenses) {
            sum += exp.additional_expenses.reduce((s, i) => s + i.amount, 0);
          }
          trend[mIndex].expenses += sum;

          if (record.incomes && Array.isArray(record.incomes)) {
            record.incomes.forEach((inc) => {
              if (!inc || inc.type === "expense" || seenIncomeIds.has(inc.id)) return;
              seenIncomeIds.add(inc.id);
              trend[mIndex].income += Number(inc.amount) || 0;
            });
          }
        }
      }
    });

    // Fill incomes from savings ledger
    globalSavings.forEach((tx) => {
      const d = new Date(tx.date);
      if (d.getFullYear() === targetYear && tx.type !== "expense" && !seenIncomeIds.has(tx.id)) {
        seenIncomeIds.add(tx.id);
        const m = d.getMonth();
        trend[m].income += tx.amount;
      }
    });

    return trend;
  }, [monthlyData, globalSavings, periodType, selectedYear, now]);

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
  }, [activeRecordForBudget]);

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
  }, [monthlyData, globalSavings]);

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
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
                {incomeCount} бр.
              </span>
              <span>постъпления в периода</span>
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
              <span>Фикс.: €{totalFixed.toFixed(2)}</span>
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

          {categoryBreakdown.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4 flex-1">
              <div className="w-full sm:w-1/2 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {categoryBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(val: any) => [`€${Number(val).toFixed(2)}`, "Сума"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Category Legend List */}
              <div className="w-full sm:w-1/2 max-h-[220px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {categoryBreakdown.map((cat, idx) => {
                  const pct =
                    totalExpenses > 0
                      ? ((cat.value / totalExpenses) * 100).toFixed(1)
                      : "0";
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                          {cat.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="font-bold text-slate-900 dark:text-white">
                          €{cat.value.toFixed(2)}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 w-9 text-right">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-[220px] flex flex-col items-center justify-center text-center p-6 text-slate-500 dark:text-slate-400">
              <Info className="w-8 h-8 opacity-40 mb-2" />
              <p className="text-sm font-medium">Няма разходи за този период</p>
              <button
                onClick={() => onNavigateTab?.("monthly")}
                className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
              >
                + Въведи разход
              </button>
            </div>
          )}
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
