import React, { useState, useMemo, useCallback } from "react";
import {
  Filter,
  Calendar,
  CreditCard,
  Zap,
  Phone,
  Wifi,
  TrendingUp,
  PiggyBank,
  Scale,
  Banknote,
} from "lucide-react";
import { MonthlyRecord, ExpenseItem, IncomeItem } from "@/types";
import { getCategoryColor } from "@/utils/colors";
import { CategoryDistributionChart } from "@/components/charts/CategoryDistributionChart";
import { ExportCenterPanel } from "@/components/export/ExportCenterModal";
import { MonthToMonthComparison } from "@/components/common/MonthToMonthComparison";
import {
  computeMonthToMonthComparison,
  calculateMonthIncome,
  calculateMonthSavings,
} from "@/utils/comparisonStorage";
import { isCompletedExpense, isRecordCompleted } from "@/utils/expenseStatus";
import {
  useI18n,
  translateCategoryName,
  formatLocalizedMonthYear,
  pluralizeUnit,
} from "@/i18n";

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

export const MonthlyReportsTab: React.FC<MonthlyReportsTabProps> = ({
  monthlyData,
  globalSavings = [],
}) => {
  const { t, language } = useI18n();
  // Default to current date
  const now = new Date();
  const currentMonthName = now.toLocaleDateString("bg-BG", { month: "long" });
  const capitalizedMonth =
    currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);

  const [selectedMonth, setSelectedMonth] = useState(capitalizedMonth);
  const [selectedYear, setSelectedYear] = useState(
    now.getFullYear().toString(),
  );

  const handleExportCenterPeriodChange = useCallback(
    ({ month, year }: { month: string; year: string }) => {
      setSelectedMonth(month);
      setSelectedYear(year);
    },
    []
  );

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
        color: getCategoryColor("Ток"),
        percentage: 0,
      });
    }

    // 2. Fixed Expenses (Completed only)
    // Handle both new array format and legacy object format
    if (Array.isArray(exp.fixed_expenses)) {
      const fixedMap: Record<string, { amount: number; colorClass?: string }> = {};
      exp.fixed_expenses.forEach((item) => {
        if (!isCompletedExpense(item)) return;
        if (!fixedMap[item.categoryName]) {
          fixedMap[item.categoryName] = { amount: 0, colorClass: item.categoryColor };
        }
        fixedMap[item.categoryName].amount += item.amount;
      });

      Object.entries(fixedMap).forEach(([name, data]) => {
        segments.push({
          name,
          value: data.amount,
          color: getCategoryColor(name, data.colorClass),
          percentage: 0,
        });
      });
    } else if (exp.fixed_expenses) {
      // Legacy Object Format
      const legacy = exp.fixed_expenses as any;
      if (legacy.credit_eur > 0) {
        segments.push({
          name: "Кредит",
          value: legacy.credit_eur,
          color: getCategoryColor("Кредит"),
          percentage: 0,
        });
      }
      if (legacy.phone_eur > 0) {
        segments.push({
          name: "Телефон",
          value: legacy.phone_eur,
          color: getCategoryColor("Телефон"),
          percentage: 0,
        });
      }
      if (legacy.internet_eur > 0) {
        segments.push({
          name: "Интернет",
          value: legacy.internet_eur,
          color: getCategoryColor("Интернет"),
          percentage: 0,
        });
      }
    }

    // 3. Additional Expenses (Grouped, Completed only)
    const groupedAdditional: Record<string, { value: number; color: string }> =
      {};

    if (exp.additional_expenses) {
      exp.additional_expenses.forEach((item: ExpenseItem) => {
        if (!isCompletedExpense(item)) return;
        if (!groupedAdditional[item.categoryName]) {
          groupedAdditional[item.categoryName] = {
            value: 0,
            color: getCategoryColor(item.categoryName, item.categoryColor),
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

  // Income Category Breakdown for selected month (strictly from MonthlyRecord.incomes)
  const incomeBreakdown = useMemo(() => {
    const map: Record<string, { value: number; color: string; count: number }> = {};
    const seenIds = new Set<string>();

    const addItem = (item: IncomeItem, fallbackName: string) => {
      if (
        !item ||
        item.amount <= 0 ||
        item.type === "expense" ||
        !isRecordCompleted(item) ||
        seenIds.has(item.id)
      ) {
        return;
      }
      seenIds.add(item.id);
      const name = item.categoryName || fallbackName;
      if (!map[name]) {
        map[name] = {
          value: 0,
          color: getCategoryColor(name, item.categoryColor),
          count: 0,
        };
      }
      map[name].value += Number(item.amount) || 0;
      map[name].count += 1;
    };

    if (record?.incomes && Array.isArray(record.incomes)) {
      record.incomes.forEach((inc) => addItem(inc, "Други приходи"));
    }

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
  }, [record]);

  const hasAnyMonthData =
    Boolean(record) || totalIncomeForMonth > 0 || totalSavingsForMonth !== 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Unified Reporting & Export Center */}
      <ExportCenterPanel
        variant="inline"
        monthlyData={monthlyData}
        globalSavings={globalSavings}
        initialPeriodType="month"
        initialMonth={selectedMonth}
        initialYear={selectedYear}
        onPeriodChange={handleExportCenterPeriodChange}
      />

      {/* Month-to-Month Comparison Section */}
      <MonthToMonthComparison comparisonData={comparisonData} />

      {/* Monthly KPI Summary Strip */}
      {hasAnyMonthData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 p-4 shadow-2xs transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{t("reports.realizedIncome")}</span>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              +€{totalIncomeForMonth.toFixed(2)}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-rose-200/80 dark:border-rose-900/60 p-4 shadow-2xs transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 mb-1">
              <CreditCard className="w-3.5 h-3.5" />
              <span>{t("reports.realizedExpenses")}</span>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              -€{totalExpense.toFixed(2)}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-purple-200/80 dark:border-purple-900/60 p-4 shadow-2xs transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">
              <PiggyBank className="w-3.5 h-3.5" />
              <span>{t("reports.savingsLabel")}</span>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              €{totalSavingsForMonth.toFixed(2)}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-blue-200/80 dark:border-blue-900/60 p-4 shadow-2xs transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
              <Scale className="w-3.5 h-3.5" />
              <span>{t("reports.netBalanceLabel")}</span>
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
            {t("reports.noDataTitle")}
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            {t("reports.noDataSubtitle", {
              period: formatLocalizedMonthYear(recordKey, language),
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Chart Section */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 flex flex-col justify-between min-h-[350px] transition-colors">
            <h3 className="w-full text-left font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              {t("reports.distributionTitle")}
            </h3>

            <div className="flex-1 flex items-center w-full">
              <CategoryDistributionChart
                items={chartData.map((c) => ({ name: c.name, value: c.value, color: c.color }))}
                totalLabel={t("common.total")}
                emptyTitle={t("reports.noExpensesChart")}
              />
            </div>
          </div>

          {/* List Section */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 flex flex-col transition-colors">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-6 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              {t("reports.detailsByCategoryTitle")}
            </h3>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar max-h-[400px]">
              {chartData.map((item, idx) => {
                const displayName = translateCategoryName(item.name, language);
                return (
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
                          {displayName.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{displayName}</p>
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
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="font-bold text-slate-700 dark:text-slate-200">
                    €{item.value.toFixed(2)}
                  </span>
                </div>
                );
              })}

              {chartData.length === 0 && (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400 italic">
                  {t("reports.noExpensesRecorded")}
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {t("reports.realizedExpenses")}
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
                {t("reports.incomeByCategoryTitle")}
              </h3>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {t("common.total")}: +€{totalIncomeForMonth.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {incomeBreakdown.map((item, idx) => {
                const displayName = translateCategoryName(item.name, language);
                return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50/70 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: item.color }}
                    >
                      {displayName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200 text-sm truncate">
                        {displayName}
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
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {item.percentage.toFixed(1)}% · {item.count}{" "}
                          {pluralizeUnit(
                            item.count,
                            "common.entriesSingular",
                            "common.entriesPlural",
                            language
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0 ml-2">
                    +€{item.value.toFixed(2)}
                  </span>
                </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      )}

    </div>
  );
};
