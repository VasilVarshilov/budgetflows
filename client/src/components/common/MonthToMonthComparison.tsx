import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  ArrowDownLeft,
  PiggyBank,
  Receipt,
  Calendar,
  Layers,
  ArrowRight,
  Info,
} from "lucide-react";
import {
  MonthComparisonData,
  MetricComparison,
} from "@/utils/comparisonStorage";

interface MonthToMonthComparisonProps {
  comparisonData: MonthComparisonData;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export const MonthToMonthComparison: React.FC<MonthToMonthComparisonProps> = ({
  comparisonData,
  title = "Сравнение месец спрямо месец",
  subtitle,
  compact = false,
}) => {
  const {
    currentMonthLabel,
    previousMonthLabel,
    hasPreviousData,
    income,
    expenses,
    savings,
    electricity,
  } = comparisonData;

  const renderMetricCard = (
    metric: MetricComparison,
    icon: React.ReactNode,
    metricType: "income" | "expenses" | "savings" | "electricity"
  ) => {
    const isImprovement = metric.trend === "improvement";
    const isNegative = metric.trend === "negative";
    const isNeutral = metric.trend === "neutral";

    // Colors:
    // Green = Improvement
    // Red = Negative Trend
    const badgeBg = isImprovement
      ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
      : isNegative
      ? "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
      : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700";

    const badgeDot = isImprovement
      ? "bg-emerald-500"
      : isNegative
      ? "bg-rose-500"
      : "bg-slate-400 dark:bg-slate-500";

    const indicatorTextColor = isImprovement
      ? "text-emerald-700 dark:text-emerald-400 font-bold"
      : isNegative
      ? "text-rose-700 dark:text-rose-400 font-bold"
      : "text-slate-600 dark:text-slate-400 font-medium";

    const iconWrapperBg =
      metricType === "income"
        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
        : metricType === "expenses"
        ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
        : metricType === "savings"
        ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400"
        : "bg-yellow-50 dark:bg-yellow-950/60 text-yellow-600 dark:text-yellow-400";

    // Arrow icon direction:
    // If value increased (+): Arrow pointing up
    // If value decreased (-): Arrow pointing down
    const diffIsPositive = metric.difference > 0;
    const diffIsNegative = metric.difference < 0;

    return (
      <div
        key={metric.name}
        className={`bg-white dark:bg-slate-900 rounded-2xl border p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
          isImprovement
            ? "border-emerald-100/90 dark:border-emerald-900/60 hover:border-emerald-200 dark:hover:border-emerald-700"
            : isNegative
            ? "border-rose-100/90 dark:border-rose-900/60 hover:border-rose-200 dark:hover:border-rose-700"
            : "border-slate-200/80 dark:border-slate-800"
        }`}
      >
        <div>
          {/* Card Header: Icon, Name, and Status Badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconWrapperBg}`}
              >
                {icon}
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                  {metric.name}
                </h4>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
                  {currentMonthLabel} спрямо предходен
                </span>
              </div>
            </div>

            {/* Percentage Badge with Visual Indicator */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs ${badgeBg}`}
            >
              {diffIsPositive && (
                <TrendingUp className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
              )}
              {diffIsNegative && (
                <TrendingDown className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
              )}
              {!diffIsPositive && !diffIsNegative && (
                <Minus className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{metric.formattedPercentage}</span>
            </div>
          </div>

          {/* Current vs Previous Values */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50/80 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
              <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">
                Текущ ({currentMonthLabel})
              </span>
              <span className="font-black text-slate-900 dark:text-white text-base">
                €{metric.currentValue.toFixed(2)}
              </span>
            </div>

            <div className="bg-slate-50/80 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
              <span className="text-slate-400 dark:text-slate-500 block text-[11px] font-medium">
                Предходен ({previousMonthLabel})
              </span>
              <span className="font-bold text-slate-700 dark:text-slate-300 text-base">
                €{metric.previousValue.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Trend Analysis Bar */}
        <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${badgeDot}`} />
            <span className={indicatorTextColor}>
              {isImprovement && "Подобрение спрямо предходния месец"}
              {isNegative && "Отрицателна тенденция"}
              {isNeutral && "Без промяна"}
            </span>
          </div>

          <span className="text-slate-500 dark:text-slate-400 font-semibold text-[11px]">
            {metric.difference >= 0 ? "+" : ""}€
            {metric.difference.toFixed(2)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4 transition-colors">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">{title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {subtitle ||
                `Сравнение на финансовите показатели: ${currentMonthLabel} спрямо предходен месец (${previousMonthLabel})`}
            </p>
          </div>
        </div>

        {/* Legend Indicator */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Зелено = Подобрение
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Червено = Отрицателен тренд
          </span>
        </div>
      </div>

      {/* Notice if no previous month data */}
      {!hasPreviousData && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-2.5 rounded-xl text-xs text-amber-800 dark:text-amber-200">
          <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Липсват или са нулеви записите за предходния месец ({previousMonthLabel}). Показаните разлики са изчислени спрямо наличните данни.
          </span>
        </div>
      )}

      {/* Grid of 4 comparison metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Income Card */}
        {renderMetricCard(
          income,
          <ArrowDownLeft className="w-4 h-4" />,
          "income"
        )}

        {/* Expenses Card */}
        {renderMetricCard(
          expenses,
          <ArrowUpRight className="w-4 h-4" />,
          "expenses"
        )}

        {/* Savings Card */}
        {renderMetricCard(
          savings,
          <PiggyBank className="w-4 h-4" />,
          "savings"
        )}

        {/* Electricity Costs Card */}
        {renderMetricCard(
          electricity,
          <Zap className="w-4 h-4" />,
          "electricity"
        )}
      </div>
    </div>
  );
};
