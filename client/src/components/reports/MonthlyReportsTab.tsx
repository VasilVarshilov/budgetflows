import React, { useState, useMemo } from "react";
import {
  PieChart,
  Filter,
  Calendar,
  ChevronDown,
  CreditCard,
  Zap,
  Phone,
  Wifi,
  Download,
  TrendingUp,
  PiggyBank,
  Scale,
  Banknote,
} from "lucide-react";
import { MonthlyRecord, ExpenseItem, IncomeItem } from "@/types";
import {
  getHexFromTailwindClass,
  SYSTEM_CATEGORY_COLORS,
} from "@/utils/colors";
import { ExportCenterModal } from "@/components/export/ExportCenterModal";
import { MonthToMonthComparison } from "@/components/common/MonthToMonthComparison";
import {
  computeMonthToMonthComparison,
  calculateMonthIncome,
  calculateMonthSavings,
} from "@/utils/comparisonStorage";

interface MonthlyReportsTabProps {
  monthlyData: Record<string, MonthlyRecord>;
  globalSavings?: IncomeItem[];
}

interface ChartSegment {
  name: string;
  value: number;
  color: string;
  percentage: number;
}

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

// Generate years from 2024 up to current year + 1
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) =>
  (CURRENT_YEAR - 1 + i).toString(),
);

export const MonthlyReportsTab: React.FC<MonthlyReportsTabProps> = ({
  monthlyData,
  globalSavings = [],
}) => {
  // Default to current date
  const now = new Date();
  const currentMonthName = now.toLocaleDateString("bg-BG", { month: "long" });
  const capitalizedMonth =
    currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);

  const [selectedMonth, setSelectedMonth] = useState(capitalizedMonth);
  const [selectedYear, setSelectedYear] = useState(
    now.getFullYear().toString(),
  );

  // Reporting & Export Center State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const recordKey = `${selectedMonth} ${selectedYear}`;
  const record = monthlyData[recordKey];

  // Month-to-Month comparison (Current Month vs Previous Month)
  const comparisonData = useMemo(() => {
    const y = parseInt(selectedYear, 10) || now.getFullYear();
    return computeMonthToMonthComparison(
      selectedMonth,
      y,
      monthlyData,
      globalSavings
    );
  }, [selectedMonth, selectedYear, monthlyData, globalSavings]);

  // Aggregation Logic
  const chartData = useMemo(() => {
    if (!record || !record.expenses) return [];

    const segments: ChartSegment[] = [];
    const exp = record.expenses;

    // 1. Electricity
    if (exp.saved_em2_eur > 0) {
      segments.push({
        name: "Ток",
        value: exp.saved_em2_eur,
        color: SYSTEM_CATEGORY_COLORS["Ток"],
        percentage: 0,
      });
    }

    // 2. Fixed Expenses
    // Handle both new array format and legacy object format
    if (Array.isArray(exp.fixed_expenses)) {
      // Aggregate by category just in case there are duplicates, though usually unique
      const fixedMap: Record<string, number> = {};
      exp.fixed_expenses.forEach((item) => {
        fixedMap[item.categoryName] =
          (fixedMap[item.categoryName] || 0) + item.amount;
      });

      Object.entries(fixedMap).forEach(([name, amount]) => {
        // Try to map system colors if possible
        let color = "#94a3b8"; // slate
        if (name === "Кредит") color = SYSTEM_CATEGORY_COLORS["Кредит"];
        else if (name === "Телефон") color = SYSTEM_CATEGORY_COLORS["Телефон"];
        else if (name === "Интернет")
          color = SYSTEM_CATEGORY_COLORS["Интернет"];
        else {
          // Attempt to find the item to extract its color class
          const item = exp.fixed_expenses.find((i) => i.categoryName === name);
          if (item) color = getHexFromTailwindClass(item.categoryColor);
        }

        segments.push({ name, value: amount, color, percentage: 0 });
      });
    } else if (exp.fixed_expenses) {
      // Legacy Object Format
      const legacy = exp.fixed_expenses as any;
      if (legacy.credit_eur > 0) {
        segments.push({
          name: "Кредит",
          value: legacy.credit_eur,
          color: SYSTEM_CATEGORY_COLORS["Кредит"],
          percentage: 0,
        });
      }
      if (legacy.phone_eur > 0) {
        segments.push({
          name: "Телефон",
          value: legacy.phone_eur,
          color: SYSTEM_CATEGORY_COLORS["Телефон"],
          percentage: 0,
        });
      }
      if (legacy.internet_eur > 0) {
        segments.push({
          name: "Интернет",
          value: legacy.internet_eur,
          color: SYSTEM_CATEGORY_COLORS["Интернет"],
          percentage: 0,
        });
      }
    }

    // 3. Additional Expenses (Grouped)
    const groupedAdditional: Record<string, { value: number; color: string }> =
      {};

    if (exp.additional_expenses) {
      exp.additional_expenses.forEach((item: ExpenseItem) => {
        if (!groupedAdditional[item.categoryName]) {
          groupedAdditional[item.categoryName] = {
            value: 0,
            color: getHexFromTailwindClass(item.categoryColor),
          };
        }
        groupedAdditional[item.categoryName].value += item.amount;
      });
    }

    Object.entries(groupedAdditional).forEach(([name, data]) => {
      segments.push({
        name,
        value: data.value,
        color: data.color,
        percentage: 0,
      });
    });

    // Calculate Percentages
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (total > 0) {
      segments.forEach((s) => {
        s.percentage = (s.value / total) * 100;
      });
    }

    // Sort by value desc
    return segments.sort((a, b) => b.value - a.value);
  }, [record]);

  const totalExpense = chartData.reduce((sum, item) => sum + item.value, 0);

  const selectedYearNum = parseInt(selectedYear, 10) || now.getFullYear();

  const totalIncomeForMonth = useMemo(() => {
    return calculateMonthIncome(
      selectedMonth,
      selectedYearNum,
      record,
      globalSavings
    );
  }, [selectedMonth, selectedYearNum, record, globalSavings]);

  const totalSavingsForMonth = useMemo(() => {
    return calculateMonthSavings(selectedMonth, selectedYearNum, globalSavings);
  }, [selectedMonth, selectedYearNum, globalSavings]);

  const netBalanceForMonth = totalIncomeForMonth - totalExpense;

  // Income Category Breakdown for selected month
  const incomeBreakdown = useMemo(() => {
    const map: Record<string, { value: number; color: string; count: number }> = {};
    const seenIds = new Set<string>();
    const monthIdx = MONTHS_BG.indexOf(selectedMonth);

    const addItem = (item: IncomeItem, fallbackName: string) => {
      if (!item || item.amount <= 0 || item.type === "expense" || seenIds.has(item.id)) return;
      seenIds.add(item.id);
      const name = item.categoryName || fallbackName;
      if (!map[name]) {
        map[name] = {
          value: 0,
          color: item.categoryColor ? getHexFromTailwindClass(item.categoryColor) : "#10b981",
          count: 0,
        };
      }
      map[name].value += Number(item.amount) || 0;
      map[name].count += 1;
    };

    if (record?.incomes && Array.isArray(record.incomes)) {
      record.incomes.forEach((inc) => addItem(inc, "Други приходи"));
    }

    globalSavings.forEach((tx) => {
      if (!tx || !tx.date) return;
      const d = new Date(tx.date);
      if (!isNaN(d.getTime()) && d.getFullYear() === selectedYearNum && d.getMonth() === monthIdx) {
        addItem(tx, "Спестявания / Приход");
      }
    });

    const total = Object.values(map).reduce((s, d) => s + d.value, 0);
    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        value: data.value,
        color: data.color,
        count: data.count,
        percentage: total > 0 ? (data.value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [record, globalSavings, selectedMonth, selectedYearNum]);

  const hasAnyMonthData =
    Boolean(record) || totalIncomeForMonth > 0 || totalSavingsForMonth !== 0;

  // Helper for Donut Chart SVG
  const renderDonutChart = () => {
    if (chartData.length === 0) return null;

    let cumulativePercent = 0;
    const GAP_PERCENT = 1;

    // Improved SVG coordinate system: 100x100
    const radius = 40;
    const circumference = 2 * Math.PI * radius;

    return (
      <div className="relative w-52 h-52 sm:w-64 sm:h-64 mx-auto my-4 sm:my-6">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full transform -rotate-90"
        >
          {chartData.map((segment, index) => {
            const val = segment.percentage; // 0 to 100

            const strokeLength = (val / 100) * circumference;
            const gapLength =
              chartData.length > 1 ? (GAP_PERCENT / 100) * circumference : 0;
            const drawLength = Math.max(0, strokeLength - gapLength);

            const offset = -1 * (cumulativePercent / 100) * circumference;
            cumulativePercent += val;

            return (
              <circle
                key={index}
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke={segment.color}
                strokeWidth="12"
                strokeDasharray={`${drawLength} ${circumference - drawLength}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                className="transition-all duration-500 ease-out hover:opacity-90"
              />
            );
          })}
        </svg>
        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider mb-1">
            Общо
          </span>
          <span className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
            €{totalExpense.toFixed(2)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center justify-between transition-colors">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <PieChart className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Месечен отчет</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Month Selector */}
          <div className="relative flex-1 sm:flex-none">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[44px] py-2 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer text-xs sm:text-sm"
            >
              {MONTHS_BG.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Year Selector */}
          <div className="relative flex-1 sm:flex-none">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 min-h-[44px] py-2 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer text-xs sm:text-sm"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y} г.
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Export Button */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs sm:text-sm font-semibold transition-colors shadow-xs cursor-pointer"
            title="Експорт на отчет в текстов файл"
          >
            <Download className="w-4 h-4" />
            <span>Експорт</span>
          </button>
        </div>
      </div>

      {/* Month-to-Month Comparison Section */}
      <MonthToMonthComparison comparisonData={comparisonData} />

      {/* Monthly KPI Summary Strip */}
      {hasAnyMonthData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 p-4 shadow-2xs transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Приходи</span>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              +€{totalIncomeForMonth.toFixed(2)}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-rose-200/80 dark:border-rose-900/60 p-4 shadow-2xs transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 mb-1">
              <CreditCard className="w-3.5 h-3.5" />
              <span>Разходи</span>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              -€{totalExpense.toFixed(2)}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-purple-200/80 dark:border-purple-900/60 p-4 shadow-2xs transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">
              <PiggyBank className="w-3.5 h-3.5" />
              <span>Спестявания</span>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              €{totalSavingsForMonth.toFixed(2)}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-blue-200/80 dark:border-blue-900/60 p-4 shadow-2xs transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
              <Scale className="w-3.5 h-3.5" />
              <span>Нетен баланс</span>
            </div>
            <p
              className={`text-xl font-bold tabular-nums ${
                netBalanceForMonth >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {netBalanceForMonth >= 0 ? "+" : ""}€{netBalanceForMonth.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!hasAnyMonthData ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-12 text-center transition-colors">
          <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
            Няма данни за този период
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            Няма намерени записи за {selectedMonth} {selectedYear}.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Chart Section */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center min-h-[350px] transition-colors">
            <h3 className="w-full text-left font-semibold text-slate-700 dark:text-slate-200 mb-6 flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              Разпределение
            </h3>

            {chartData.length > 0 ? (
              renderDonutChart()
            ) : (
              <div className="h-64 flex items-center justify-center w-full">
                <p className="text-slate-400 dark:text-slate-500">Няма разходи за показване</p>
              </div>
            )}

            {/* Legend / Mini Stats */}
            <div className="flex flex-wrap gap-3 justify-center mt-6">
              {chartData.slice(0, 5).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 text-xs bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-700"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-slate-600 dark:text-slate-300 font-bold">
                    {Math.round(item.percentage)}%
                  </span>
                  <span className="text-slate-400 dark:text-slate-400 truncate max-w-[80px]">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* List Section */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 flex flex-col transition-colors">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-6 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              Детайли по категория
            </h3>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar max-h-[400px]">
              {chartData.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm"
                      style={{ backgroundColor: item.color }}
                    >
                      {/* Icon placeholder logic */}
                      {item.name === "Ток" ? (
                        <Zap className="w-5 h-5" />
                      ) : item.name === "Телефон" ? (
                        <Phone className="w-5 h-5" />
                      ) : item.name === "Интернет" ? (
                        <Wifi className="w-5 h-5" />
                      ) : item.name === "Кредит" ? (
                        <CreditCard className="w-5 h-5" />
                      ) : (
                        <span className="text-xs font-bold">
                          {item.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{item.name}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${item.percentage}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {item.percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="font-bold text-slate-700 dark:text-slate-200">
                    €{item.value.toFixed(2)}
                  </span>
                </div>
              ))}

              {chartData.length === 0 && (
                <div className="text-center py-8 text-slate-400 dark:text-slate-500 italic">
                  Няма записани разходи
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Общо разходи
              </span>
              <span className="text-xl font-bold text-slate-800 dark:text-white tabular-nums">
                €{totalExpense.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Income Breakdown Section */}
        {incomeBreakdown.length > 0 && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-500" />
                Приходи по категории
              </h3>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                Общо: +€{totalIncomeForMonth.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {incomeBreakdown.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50/70 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: item.color }}
                    >
                      {item.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200 text-sm truncate">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${item.percentage}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                          {item.percentage.toFixed(1)}% · {item.count}{" "}
                          {item.count === 1 ? "запис" : "записа"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0 ml-2">
                    +€{item.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      )}

      {/* Reporting & Export Center Modal */}
      <ExportCenterModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        monthlyData={monthlyData}
        globalSavings={globalSavings}
        initialPeriodType="month"
        initialMonth={selectedMonth}
        initialYear={selectedYear}
      />
    </div>
  );
};
