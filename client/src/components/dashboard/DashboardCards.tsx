import React from "react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Download,
  PiggyBank,
  Plus,
  Repeat,
  Scale,
  Sparkles,
  Target,
  Zap,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardCardId, DASHBOARD_CARDS_META } from "./dashboardCardConfig";
import { BudgetControlSection } from "./BudgetControlSection";
import { AiRecommendationsSection } from "./AiRecommendationsSection";
import { MonthToMonthComparison } from "@/components/common/MonthToMonthComparison";
import { CategoryDistributionChart } from "@/components/charts/CategoryDistributionChart";
import { CompletionSwitch } from "@/components/ui/RecurrenceCompletionRows";
import { ElectricityRecord, RepeatFrequency } from "@/types";
import { OverallBudgetCalculation } from "@/utils/budgetStorage";
import { MonthComparisonData, MetricComparison } from "@/utils/comparisonStorage";
import { FullAnalysisResult } from "@/utils/aiAnalysisEngine";
import { SavingsAllocationSummary, getGoalProgressPercent } from "@/utils/savingsGoalsStorage";
import {
  getElectricityMeterTypeLabel,
  resolveElectricityMeterMode,
  sortElectricityRecordsChronologically,
} from "@/utils/electricityStorage";
import { AVAILABLE_ICONS_MAP, resolveCategoryDisplayIcon } from "@/utils/categoryStorage";
import { parseLocalDateKey } from "@/utils/calendarEngine";
import { formatRepeatLabel } from "@/utils/recurrenceEngine";

export type DashboardTabTarget =
  | "dashboard"
  | "monthly"
  | "income"
  | "calendar"
  | "electricity"
  | "reports"
  | "savings"
  | "backup"
  | "budgets"
  | "ai-analysis";

export interface UpcomingDashboardItem {
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
  expectedDate?: string;
  amount: number;
  repeat?: RepeatFrequency;
  recurrenceDayOfMonth?: number;
  recurrenceMonthOfYear?: number;
  recurrenceDayOfWeek?: number;
}

export interface CategoryBreakdownEntry {
  name: string;
  value: number;
  colorClass?: string;
  color: string;
}

export interface DashboardCardRendererProps {
  cardId: DashboardCardId;
  isActive: boolean;
  viewMode: "summary" | "chart";
  isExpanded: boolean;
  onToggleViewMode: (mode: "summary" | "chart") => void;
  onToggleExpand: () => void;

  // Period
  periodType: "current" | "month" | "year" | "custom";
  currentPeriodLabel: string;

  // Financial aggregates (untouched calculations passed from DashboardTab)
  totalIncome: number;
  totalFixedIncome: number;
  totalAdditionalIncome: number;
  incomeCount: number;
  totalExpectedIncome: number;
  upcomingIncomeItems: UpcomingDashboardItem[];

  totalFixed: number;
  totalVariable: number;
  totalExpenses: number;
  totalPlannedExpenses: number;
  upcomingExpenseItems: UpcomingDashboardItem[];
  categoryBreakdown: CategoryBreakdownEntry[];

  upcomingItems: UpcomingDashboardItem[];
  dueTodayItems: UpcomingDashboardItem[];
  overdueItems: UpcomingDashboardItem[];

  periodSavings: number;
  lifetimeSavings: number;
  savingsTargetPercent: number;
  recommendedSavings: number;
  onSavingsTargetChange: (rawValue: string) => void;
  savingsAllocationSummary: SavingsAllocationSummary;

  netBalance: number;
  budgetData: OverallBudgetCalculation;
  monthComparisonData: MonthComparisonData;
  aiAnalysis: FullAnalysisResult;
  electricityHistory: ElectricityRecord[];

  // Chart data & theme styling
  incomeVsExpensesData: any[];
  monthlyTrendData: { month: string; expenses: number; income: number }[];
  savingsTrendData: { month: string; balance: number }[];
  isDark: boolean;

  // Navigation & Actions
  onNavigateTab?: (tab: DashboardTabTarget) => void;
  onOpenCalendar?: (dateKey?: string) => void;
  onOpenRecord?: (target: {
    kind: "fixed" | "additional" | "income";
    monthKey: string;
    id: string;
  }) => void;
  onToggleRecordCompletion?: (
    monthKey: string,
    kind: "fixed" | "additional" | "income",
    recordId: string,
    nextCompleted?: boolean
  ) => void;
  onOpenExportCenter: () => void;
}

function TrendIndicator({
  comparison,
  fallbackPercent,
  fallbackPositive,
  subLabel,
}: {
  comparison?: MetricComparison;
  fallbackPercent?: number;
  fallbackPositive?: boolean;
  subLabel?: string;
}) {
  if (comparison) {
    const isNeutral = comparison.trend === "neutral" || comparison.percentageChange === 0;
    const isGood = comparison.isImprovement;
    const toneClass = isNeutral
      ? "text-slate-500 dark:text-slate-400"
      : isGood
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
    const iconBgClass = isNeutral
      ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
      : isGood
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : "bg-rose-500/15 text-rose-600 dark:text-rose-400";

    const Icon = isNeutral
      ? ArrowRight
      : comparison.percentageChange > 0
      ? ArrowUpRight
      : ArrowDownRight;

    return (
      <div className="flex flex-col items-end shrink-0">
        <div className={`inline-flex items-center gap-1.5 text-sm font-bold tabular-nums ${toneClass}`}>
          <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center ${iconBgClass}`}>
            <Icon className="w-3.5 h-3.5" />
          </span>
          <span>{comparison.formattedPercentage}</span>
        </div>
        {subLabel && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 whitespace-nowrap">
            {subLabel}
          </span>
        )}
      </div>
    );
  }

  const pct = fallbackPercent ?? 0;
  const isZero = pct === 0;
  const positive = fallbackPositive ?? pct >= 0;
  const toneClass = isZero
    ? "text-slate-500 dark:text-slate-400"
    : positive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  const iconBgClass = isZero
    ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
    : positive
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : "bg-rose-500/15 text-rose-600 dark:text-rose-400";
  const Icon = isZero ? ArrowRight : pct >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="flex flex-col items-end shrink-0">
      <div className={`inline-flex items-center gap-1.5 text-sm font-bold tabular-nums ${toneClass}`}>
        <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center ${iconBgClass}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span>{pct > 0 ? `+${pct}%` : `${pct}%`}</span>
      </div>
      {subLabel && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 whitespace-nowrap">
          {subLabel}
        </span>
      )}
    </div>
  );
}

function CardHeader({
  title,
  periodLabel,
  supportsChartToggle,
  viewMode,
  onToggleViewMode,
  rightBadge,
}: {
  title: string;
  periodLabel: string;
  supportsChartToggle?: boolean;
  viewMode: "summary" | "chart";
  onToggleViewMode: (mode: "summary" | "chart") => void;
  rightBadge?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
          {title}{" "}
          <span className="font-medium text-slate-500 dark:text-slate-400">
            ({periodLabel})
          </span>
        </h3>
      </div>

      {supportsChartToggle ? (
        <div
          className="inline-flex items-center p-1 rounded-full bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shrink-0"
          role="group"
          aria-label="Превключване между карта и графика"
          data-no-drag="true"
        >
          <button
            type="button"
            onClick={() => onToggleViewMode("chart")}
            aria-pressed={viewMode === "chart"}
            title="Покажи графика"
            className={`w-9 h-7 rounded-full inline-flex items-center justify-center transition-all cursor-pointer ${
              viewMode === "chart"
                ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <BarChart2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode("summary")}
            aria-pressed={viewMode === "summary"}
            title="Покажи ключови данни"
            className={`w-9 h-7 rounded-full inline-flex items-center justify-center transition-all cursor-pointer ${
              viewMode === "summary"
                ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <CreditCard className="w-4 h-4" />
          </button>
        </div>
      ) : (
        rightBadge || null
      )}
    </div>
  );
}

function MetricRow({
  label,
  value,
  subValue,
  tone = "default",
}: {
  label: string;
  value: string;
  subValue?: string;
  tone?: "default" | "positive" | "negative" | "amber";
}) {
  const valueTone =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : "text-slate-900 dark:text-white";

  return (
    <div className="py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
          {label}
        </p>
        {subValue && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5 tabular-nums">
            {subValue}
          </p>
        )}
      </div>
      <span className={`text-sm sm:text-base font-bold tabular-nums shrink-0 ${valueTone}`}>
        {value}
      </span>
    </div>
  );
}

export const DashboardCardContent: React.FC<DashboardCardRendererProps> = (props) => {
  const {
    cardId,
    isActive,
    viewMode,
    isExpanded,
    onToggleViewMode,
    onToggleExpand,
    periodType,
    currentPeriodLabel,
    totalIncome,
    totalFixedIncome,
    totalAdditionalIncome,
    incomeCount,
    totalExpectedIncome,
    upcomingIncomeItems,
    totalFixed,
    totalVariable,
    totalExpenses,
    totalPlannedExpenses,
    upcomingExpenseItems,
    categoryBreakdown,
    upcomingItems,
    dueTodayItems,
    overdueItems,
    periodSavings,
    lifetimeSavings,
    savingsTargetPercent,
    recommendedSavings,
    onSavingsTargetChange,
    savingsAllocationSummary,
    netBalance,
    budgetData,
    monthComparisonData,
    aiAnalysis,
    electricityHistory,
    incomeVsExpensesData,
    monthlyTrendData,
    savingsTrendData,
    isDark,
    onNavigateTab,
    onOpenCalendar,
    onOpenRecord,
    onToggleRecordCompletion,
    onOpenExportCenter,
  } = props;

  const meta = DASHBOARD_CARDS_META[cardId];
  const gridStroke = isDark ? "#272b36" : "#f1f5f9";
  const axisTickStyle = { fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" };
  const chartTooltipStyle = {
    backgroundColor: isDark ? "#0f172a" : "#ffffff",
    borderColor: isDark ? "#334155" : "#e2e8f0",
    color: isDark ? "#f8fafc" : "#0f172a",
    borderRadius: "12px",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.35)",
  };

  // Lazy chart gate: only mount Recharts SVG trees on the active card
  const canRenderCharts = isActive;

  const renderCardFooter = ({
    primaryActionLabel,
    onPrimaryAction,
    expandLabel,
    hasExpandContent,
  }: {
    primaryActionLabel?: string;
    onPrimaryAction?: () => void;
    expandLabel?: string;
    hasExpandContent?: boolean;
  }) => (
    <div className="pt-3.5 mt-1 border-t border-slate-100 dark:border-slate-800/90 flex flex-wrap items-center justify-between gap-2">
      {hasExpandContent ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors cursor-pointer"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Скрий детайлите</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>{expandLabel || "Виж детайли"}</span>
            </>
          )}
        </button>
      ) : (
        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
          {meta.category}
        </span>
      )}

      {primaryActionLabel && onPrimaryAction && (
        <button
          type="button"
          onClick={onPrimaryAction}
          className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer ml-auto"
        >
          <span>{primaryActionLabel}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  // ============================================================================
  // 1. OVERVIEW CARD ("Общ преглед")
  // ============================================================================
  if (cardId === "overview") {
    const netSavingsPct =
      totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : 0;

    return (
      <div className="rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 shadow-xs space-y-5">
        <CardHeader
          title={meta.title}
          periodLabel={currentPeriodLabel}
          supportsChartToggle
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
        />

        {/* Hero KPI */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Scale className="w-3.5 h-3.5" />
              <span>Нетно салдо (Приходи − Разходи)</span>
            </span>
            <p
              className={`text-3xl sm:text-4xl font-black tracking-tight tabular-nums ${
                netBalance >= 0
                  ? "text-slate-900 dark:text-white"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {netBalance >= 0 ? "+" : "-"}€{Math.abs(netBalance).toFixed(2)}
            </p>
          </div>
          <TrendIndicator
            fallbackPercent={netSavingsPct}
            fallbackPositive={netBalance >= 0}
            subLabel={totalIncome > 0 ? "от приходите" : "за периода"}
          />
        </div>

        {/* Summary vs Chart View */}
        {viewMode === "chart" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Месечна динамика: Приходи спрямо Разходи (€)
            </p>
            <div className="h-[220px] w-full">
              {canRenderCharts ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={monthlyTrendData}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
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
                      wrapperStyle={{
                        fontSize: 11,
                        paddingTop: 6,
                        color: isDark ? "#cbd5e1" : "#475569",
                      }}
                      formatter={(val) => (val === "expenses" ? "Разходи" : "Приходи")}
                    />
                    <Line
                      type="monotone"
                      dataKey="income"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: "#10b981" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#6366f1" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full rounded-2xl bg-slate-50 dark:bg-slate-800/40" />
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border-t border-slate-100 dark:border-slate-800/80">
            <MetricRow
              label="Реализирани приходи"
              value={`€${totalIncome.toFixed(2)}`}
              subValue={`${incomeCount} бр. · Повт. €${totalFixedIncome.toFixed(2)} · Доп. €${totalAdditionalIncome.toFixed(2)}`}
              tone="positive"
            />
            <MetricRow
              label="Реализирани разходи"
              value={`€${totalExpenses.toFixed(2)}`}
              subValue={`Повт. €${totalFixed.toFixed(2)} · Доп. €${totalVariable.toFixed(2)}`}
              tone="negative"
            />
            <MetricRow
              label="Спестявания за периода"
              value={`€${periodSavings.toFixed(2)}`}
              subValue={`Общ наличен фонд: €${lifetimeSavings.toFixed(2)}`}
            />
            <MetricRow
              label="Очаквани до края на периода"
              value={`+€${totalExpectedIncome.toFixed(2)} / -€${totalPlannedExpenses.toFixed(2)}`}
              subValue={`Общо очаквани: Приходи €${(totalIncome + totalExpectedIncome).toFixed(2)} · Разходи €${(totalExpenses + totalPlannedExpenses).toFixed(2)}`}
              tone="amber"
            />
          </div>
        )}

        {/* Expanded Section: Month-to-Month Comparison + Quick Actions */}
        {isExpanded && (
          <div className="space-y-4 pt-2 animate-in fade-in duration-150">
            <MonthToMonthComparison comparisonData={monthComparisonData} />

            <div className="rounded-2xl bg-slate-900 dark:bg-slate-800/90 p-4 text-white space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Бързи действия
                </p>
                <span className="text-[11px] text-slate-400">Директен достъп</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab?.("monthly")}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добави разход</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab?.("income")}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добави приход</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab?.("electricity")}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-slate-950 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Сметка ТОК</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenExportCenter}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Експорт</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {renderCardFooter({
          hasExpandContent: true,
          expandLabel: "Сравнение и бързи действия",
          primaryActionLabel: "Експорт на отчет",
          onPrimaryAction: onOpenExportCenter,
        })}
      </div>
    );
  }

  // ============================================================================
  // 2. SPENDING OVERVIEW CARD ("Преглед на разходите")
  // ============================================================================
  if (cardId === "spending") {
    const visibleCategories = isExpanded
      ? categoryBreakdown
      : categoryBreakdown.slice(0, 4);

    return (
      <div className="rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 shadow-xs space-y-5">
        <CardHeader
          title={meta.title}
          periodLabel={currentPeriodLabel}
          supportsChartToggle
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
              <span>Реализирани разходи</span>
            </span>
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
              €{totalExpenses.toFixed(2)}
            </p>
          </div>
          <TrendIndicator
            comparison={monthComparisonData.expenses}
            subLabel={`сп. ${monthComparisonData.previousMonthLabel}`}
          />
        </div>

        {viewMode === "chart" ? (
          <div className="space-y-4">
            {canRenderCharts ? (
              <CategoryDistributionChart
                items={categoryBreakdown}
                totalLabel="Общо"
                emptyTitle="Няма разходи за този период"
                emptyActionLabel="+ Въведи разход"
                onEmptyAction={() => onNavigateTab?.("monthly")}
              />
            ) : (
              <div className="h-[220px] rounded-2xl bg-slate-50 dark:bg-slate-800/40" />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-100 dark:border-slate-800/80">
              <div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  Повтарящи се
                </span>
                <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                  €{totalFixed.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  Допълнителни
                </span>
                <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                  €{totalVariable.toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  Очаквани общо
                </span>
                <span className="text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5 block">
                  €{(totalExpenses + totalPlannedExpenses).toFixed(2)}
                </span>
              </div>
            </div>

            {visibleCategories.length > 0 ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Разпределение по категории</span>
                  <span className="tabular-nums">{categoryBreakdown.length} кат.</span>
                </div>
                <div className="space-y-2">
                  {visibleCategories.map((cat) => {
                    const share =
                      totalExpenses > 0
                        ? Math.round((cat.value / totalExpenses) * 100)
                        : 0;
                    return (
                      <div key={cat.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 min-w-0 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="truncate">{cat.name}</span>
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white tabular-nums shrink-0 ml-2">
                            €{cat.value.toFixed(2)}{" "}
                            <span className="text-[11px] font-medium text-slate-400">
                              ({share}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(3, share))}%`,
                              backgroundColor: cat.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center space-y-1">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Няма разходи за този период
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Натиснете „Добави разход“, за да запишете първия си разход.
                </p>
              </div>
            )}
          </div>
        )}

        {isExpanded && canRenderCharts && (
          <div className="pt-2 space-y-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-150">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 pt-2">
              Месечна тенденция на разходите (€)
            </p>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={monthlyTrendData}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
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
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#6366f1" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {renderCardFooter({
          hasExpandContent: categoryBreakdown.length > 0,
          expandLabel:
            categoryBreakdown.length > 4
              ? `Всички категории (${categoryBreakdown.length}) и графика`
              : "Годишна тенденция",
          primaryActionLabel: "Към Разходи",
          onPrimaryAction: () => onNavigateTab?.("monthly"),
        })}
      </div>
    );
  }

  // ============================================================================
  // 3. UPCOMING EXPENSES & PAYMENTS CARD ("Предстоящи разходи")
  // ============================================================================
  if (cardId === "upcoming") {
    const urgentItems = [...overdueItems, ...dueTodayItems];
    const urgentKeys = new Set(
      urgentItems.map((i) => `${i.kind}_${i.monthKey}_${i.id}`)
    );
    const remainingUpcoming = upcomingItems.filter(
      (i) => !urgentKeys.has(`${i.kind}_${i.monthKey}_${i.id}`)
    );
    const combinedOrdered = [...urgentItems, ...remainingUpcoming];
    const visibleItems = isExpanded ? combinedOrdered : combinedOrdered.slice(0, 4);

    return (
      <div className="rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 shadow-xs space-y-5">
        <CardHeader
          title={meta.title}
          periodLabel={currentPeriodLabel}
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
          rightBadge={
            overdueItems.length > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{overdueItems.length} просрочени</span>
              </span>
            ) : dueTodayItems.length > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <span>{dueTodayItems.length} днес</span>
              </span>
            ) : null
          }
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Планирани разходи ({upcomingExpenseItems.length} бр.)</span>
            </span>
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
              €{totalPlannedExpenses.toFixed(2)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
              Очаквани общо
            </span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tabular-nums">
              €{(totalExpenses + totalPlannedExpenses).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-100 dark:border-slate-800/80">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Падеж днес
            </span>
            <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
              {dueTodayItems.length} бр.
            </span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              С изминал падеж
            </span>
            <span
              className={`text-sm sm:text-base font-bold tabular-nums mt-0.5 block ${
                overdueItems.length > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-slate-900 dark:text-white"
              }`}
            >
              {overdueItems.length} бр.
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Очаквани приходи
            </span>
            <span className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">
              +€{totalExpectedIncome.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Upcoming Items Interactive List */}
        {visibleItems.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {visibleItems.map((item) => {
              const isOverdue = overdueItems.some(
                (o) => o.id === item.id && o.monthKey === item.monthKey && o.kind === item.kind
              );
              const isDueToday = dueTodayItems.some(
                (t) => t.id === item.id && t.monthKey === item.monthKey && t.kind === item.kind
              );
              const isIncome = item.kind === "income";
              const displayIconName = resolveCategoryDisplayIcon(
                item.categoryIcon,
                item.categoryName
              );
              const IconComponent =
                (displayIconName && AVAILABLE_ICONS_MAP[displayIconName]) ||
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
                  className="py-2.5 flex items-center justify-between gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl px-2 -mx-2 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isIncome
                          ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                          : isOverdue
                          ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                          : "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {item.categoryName}
                        </p>
                        {hasRepeat && (
                          <span
                            title={formatRepeatLabel(item.repeat, item)}
                            className="inline-flex shrink-0"
                          >
                            <Repeat className="w-3 h-3 text-indigo-500" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                        <span
                          className={
                            isOverdue
                              ? "text-rose-600 dark:text-rose-400 font-semibold"
                              : isDueToday
                              ? "text-amber-600 dark:text-amber-400 font-semibold"
                              : ""
                          }
                        >
                          {isOverdue
                            ? `Просрочен (${formattedDate})`
                            : isDueToday
                            ? "Падеж днес"
                            : formattedDate}
                        </span>
                        {(periodType === "year" || periodType === "custom") &&
                          ` · ${item.monthKey}`}
                        {secondaryLabel ? ` · ${secondaryLabel}` : ""}
                      </p>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-2 shrink-0"
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
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Всички записи за {currentPeriodLabel} са изпълнени
            </p>
            <div className="flex items-center justify-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => onNavigateTab?.("monthly")}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                + Планирай разход
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab?.("income")}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                + Очакван приход
              </button>
            </div>
          </div>
        )}

        {renderCardFooter({
          hasExpandContent: combinedOrdered.length > 4,
          expandLabel: `Виж всички (${combinedOrdered.length})`,
          primaryActionLabel: "Отвори Календар",
          onPrimaryAction: () =>
            onOpenCalendar
              ? onOpenCalendar((urgentItems[0] || upcomingItems[0])?.dateKey)
              : onNavigateTab?.("calendar"),
        })}
      </div>
    );
  }

  // ============================================================================
  // 4. INCOME OVERVIEW CARD ("Преглед на приходите")
  // ============================================================================
  if (cardId === "income") {
    const visibleUpcomingIncome = isExpanded
      ? upcomingIncomeItems
      : upcomingIncomeItems.slice(0, 3);

    return (
      <div className="rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 shadow-xs space-y-5">
        <CardHeader
          title={meta.title}
          periodLabel={currentPeriodLabel}
          supportsChartToggle
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
              <span>Реализирани приходи ({incomeCount} бр.)</span>
            </span>
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              €{totalIncome.toFixed(2)}
            </p>
          </div>
          <TrendIndicator
            comparison={monthComparisonData.income}
            subLabel={`сп. ${monthComparisonData.previousMonthLabel}`}
          />
        </div>

        {viewMode === "chart" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Приходи спрямо Разходи (€)
            </p>
            <div className="h-[220px] w-full">
              {canRenderCharts ? (
                periodType === "year" || periodType === "custom" ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={incomeVsExpensesData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis dataKey="monthName" tick={axisTickStyle} stroke={gridStroke} />
                      <YAxis tick={axisTickStyle} stroke={gridStroke} />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(val: any) => [`€${Number(val).toFixed(2)}`]}
                      />
                      <Legend
                        wrapperStyle={{
                          fontSize: 11,
                          paddingTop: 6,
                          color: isDark ? "#cbd5e1" : "#475569",
                        }}
                        formatter={(val) => (val === "income" ? "Приходи" : "Разходи")}
                      />
                      <Bar dataKey="income" name="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" name="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={incomeVsExpensesData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
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
                          <Cell key={`inc-bar-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              ) : (
                <div className="h-full rounded-2xl bg-slate-50 dark:bg-slate-800/40" />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border-t border-slate-100 dark:border-slate-800/80">
              <MetricRow
                label="Повтарящи се приходи"
                value={`€${totalFixedIncome.toFixed(2)}`}
                subValue="Заплата и регулярни постъпления"
              />
              <MetricRow
                label="Допълнителни приходи"
                value={`€${totalAdditionalIncome.toFixed(2)}`}
                subValue="Бонуси, извънредни и еднократни"
              />
              <MetricRow
                label={`Очаквани приходи (${upcomingIncomeItems.length} бр.)`}
                value={`+€${totalExpectedIncome.toFixed(2)}`}
                subValue={`Общо очаквани за периода: €${(totalIncome + totalExpectedIncome).toFixed(2)}`}
                tone="amber"
              />
            </div>

            {visibleUpcomingIncome.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Предстоящи постъпления
                </p>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {visibleUpcomingIncome.map((inc) => (
                    <div
                      key={`inc_${inc.monthKey}_${inc.id}`}
                      onClick={() =>
                        onOpenRecord
                          ? onOpenRecord({
                              kind: "income",
                              monthKey: inc.monthKey,
                              id: inc.id,
                            })
                          : onOpenCalendar?.(inc.dateKey)
                      }
                      className="py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg px-2 -mx-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {inc.categoryName}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate tabular-nums">
                          {parseLocalDateKey(inc.dateKey).toLocaleDateString("bg-BG")}
                          {inc.note ? ` · ${inc.note}` : ""}
                        </p>
                      </div>
                      <div
                        className="flex items-center gap-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          +€{inc.amount.toFixed(2)}
                        </span>
                        <CompletionSwitch
                          checked={false}
                          onChange={() =>
                            onToggleRecordCompletion?.(inc.monthKey, "income", inc.id, true)
                          }
                          ariaLabel={`Отбележи приход „${inc.categoryName}“ като получен`}
                          size="sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {renderCardFooter({
          hasExpandContent: upcomingIncomeItems.length > 3,
          expandLabel: `Всички очаквани (${upcomingIncomeItems.length})`,
          primaryActionLabel: "Управление на приходи",
          onPrimaryAction: () => onNavigateTab?.("income"),
        })}
      </div>
    );
  }

  // ============================================================================
  // 5. BUDGET STATUS CARD ("Статус на бюджета")
  // ============================================================================
  if (cardId === "budget") {
    const pctRounded = Math.round(budgetData.totalPercentage);
    const barWidth = Math.min(100, Math.max(0, pctRounded));
    const statusColorClass =
      budgetData.totalStatus === "red"
        ? "bg-rose-500"
        : budgetData.totalStatus === "yellow"
        ? "bg-amber-500"
        : "bg-emerald-500";
    const visibleCategories = budgetData.categoryStatuses.slice(0, 3);

    return (
      <div className="rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 shadow-xs space-y-5">
        <CardHeader
          title={meta.title}
          periodLabel={currentPeriodLabel}
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
          rightBadge={
            budgetData.activeWarnings.length > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{budgetData.activeWarnings.length} сигнала</span>
              </span>
            ) : null
          }
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Target className="w-3.5 h-3.5 text-indigo-500" />
              <span>Изразходвано от лимит €{budgetData.totalMonthlyLimit.toFixed(2)}</span>
            </span>
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
              €{budgetData.totalSpent.toFixed(2)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span
              className={`text-lg font-extrabold tabular-nums ${
                budgetData.totalStatus === "red"
                  ? "text-rose-600 dark:text-rose-400"
                  : budgetData.totalStatus === "yellow"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {pctRounded}%
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
              усвоен бюджет
            </span>
          </div>
        </div>

        {/* Budget Progress Bar */}
        <div className="space-y-2">
          <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${statusColorClass}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span className="text-slate-500 dark:text-slate-400">
              {budgetData.isTotalExceeded ? "Превишение:" : "Оставащ бюджет:"}
            </span>
            <span
              className={`font-bold ${
                budgetData.isTotalExceeded
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {budgetData.isTotalExceeded
                ? `+€${budgetData.totalOverspentAmount.toFixed(2)} над лимита`
                : `€${budgetData.totalRemaining.toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* Category Budget Compact Rows (or Expanded Full BudgetControlSection) */}
        {!isExpanded ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border-t border-slate-100 dark:border-slate-800/80">
            {visibleCategories.length > 0 ? (
              visibleCategories.map((cs) => {
                const catPct = Math.round(cs.percentage);
                return (
                  <div key={cs.budget.id} className="py-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {cs.budget.categoryName}
                      </span>
                      <span className="tabular-nums font-bold text-slate-900 dark:text-white shrink-0 ml-2">
                        €{cs.spent.toFixed(2)}{" "}
                        <span className="font-normal text-slate-400">
                          / €{cs.limit.toFixed(2)} ({catPct}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          cs.status === "red"
                            ? "bg-rose-500"
                            : cs.status === "yellow"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(2, catPct))}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                Няма зададени лимити по категории.
              </p>
            )}
          </div>
        ) : (
          <div className="pt-1 animate-in fade-in duration-150">
            <BudgetControlSection
              budgetData={budgetData}
              currentPeriodLabel={currentPeriodLabel}
              onNavigateTab={onNavigateTab}
            />
          </div>
        )}

        {renderCardFooter({
          hasExpandContent: true,
          expandLabel: "Пълен бюджетен контрол",
          primaryActionLabel: "Настрой бюджети",
          onPrimaryAction: () => onNavigateTab?.("budgets"),
        })}
      </div>
    );
  }

  // ============================================================================
  // 6. SAVINGS CARD ("Спестявания")
  // ============================================================================
  if (cardId === "savings") {
    const targetGap = Math.max(0, recommendedSavings - Math.max(0, netBalance));
    const goalProgressPct =
      recommendedSavings > 0
        ? Math.min(100, Math.max(0, Math.round((Math.max(0, periodSavings) / recommendedSavings) * 100)))
        : periodSavings > 0
        ? 100
        : 0;

    return (
      <div className="rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 shadow-xs space-y-5">
        <CardHeader
          title={meta.title}
          periodLabel={currentPeriodLabel}
          supportsChartToggle
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <PiggyBank className="w-3.5 h-3.5 text-emerald-500" />
              <span>Общ наличен спестовен фонд</span>
            </span>
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
              €{lifetimeSavings.toFixed(2)}
            </p>
          </div>
          <TrendIndicator
            comparison={monthComparisonData.savings}
            subLabel={`за периода: €${periodSavings.toFixed(2)}`}
          />
        </div>

        {viewMode === "chart" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Кумулативно натрупване на спестявания (€)
            </p>
            <div className="h-[220px] w-full">
              {canRenderCharts ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={savingsTrendData}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
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
                      dot={{ r: 3, fill: "#10b981" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full rounded-2xl bg-slate-50 dark:bg-slate-800/40" />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border-t border-slate-100 dark:border-slate-800/80">
              <MetricRow
                label="Нетно спестяване за периода"
                value={`€${periodSavings.toFixed(2)}`}
                subValue={`Постигнато спрямо месечна цел: ${goalProgressPct}%`}
                tone={periodSavings >= 0 ? "positive" : "negative"}
              />
              <MetricRow
                label={`Препоръчително заделяне (${savingsTargetPercent}% от €${totalIncome.toFixed(2)})`}
                value={`€${recommendedSavings.toFixed(2)}`}
                subValue={
                  totalIncome > 0
                    ? netBalance >= recommendedSavings
                      ? "Нетният баланс покрива целта ви"
                      : `Недостиг до целта: €${targetGap.toFixed(2)}`
                    : "Въведете приходи за автоматично изчисление"
                }
              />
              {savingsAllocationSummary.activeGoals.length > 0 && (
                <MetricRow
                  label={`Активни цели (${savingsAllocationSummary.activeGoals.length} бр.)`}
                  value={`€${savingsAllocationSummary.totalAllocated.toFixed(2)}`}
                  subValue={`Неразпределени: €${savingsAllocationSummary.unallocatedSavings.toFixed(2)}`}
                />
              )}
            </div>

            {/* Editable Monthly Savings Target % Control */}
            <div
              className="flex flex-wrap items-center justify-between gap-3 pt-1"
              data-no-drag="true"
            >
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>Месечна цел (%):</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={savingsTargetPercent}
                  onChange={(e) => onSavingsTargetChange(e.target.value)}
                  className="w-18 px-2.5 py-1.5 min-h-[38px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="Цел за спестяване в проценти"
                />
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Препоръка: <strong className="text-emerald-600 dark:text-emerald-400">€{recommendedSavings.toFixed(2)}</strong>
              </span>
            </div>
          </div>
        )}

        {isExpanded && savingsAllocationSummary.activeGoals.length > 0 && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5 animate-in fade-in duration-150">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Разпределение по спестовни цели
            </p>
            <div className="space-y-2">
              {savingsAllocationSummary.activeGoals.map((goal) => {
                const pct = getGoalProgressPercent(goal);
                return (
                  <div key={goal.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {goal.name}
                        {goal.isEmergencyFund ? " (Авариен фонд)" : ""}
                      </span>
                      <span className="tabular-nums font-bold text-slate-900 dark:text-white shrink-0 ml-2">
                        €{goal.allocatedAmount.toFixed(2)} / €{goal.targetAmount.toFixed(2)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {renderCardFooter({
          hasExpandContent: savingsAllocationSummary.activeGoals.length > 0,
          expandLabel: `Цели (${savingsAllocationSummary.activeGoals.length})`,
          primaryActionLabel: "Отвори Спестявания",
          onPrimaryAction: () => onNavigateTab?.("savings"),
        })}
      </div>
    );
  }

  // ============================================================================
  // 7. ELECTRICITY CARD ("Електроенергия")
  // ============================================================================
  if (cardId === "electricity") {
    const sortedDesc = sortElectricityRecordsChronologically(electricityHistory, "desc");
    const latest = sortedDesc[0];
    const previous = sortedDesc[1];
    const heroValue =
      monthComparisonData.electricity.currentValue > 0
        ? monthComparisonData.electricity.currentValue
        : latest?.totalCost ?? 0;

    const avgCost =
      sortedDesc.length > 0
        ? sortedDesc.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0) /
          sortedDesc.length
        : 0;
    const withKwh = sortedDesc.filter((r) => (Number(r.consumption) || 0) > 0);
    const avgKwh =
      withKwh.length > 0
        ? withKwh.reduce((sum, r) => sum + (Number(r.consumption) || 0), 0) /
          withKwh.length
        : 0;

    const chartData = sortElectricityRecordsChronologically(
      sortedDesc.slice(0, 10),
      "asc"
    ).map((r) => ({
      period: `${r.month.slice(0, 3)} ${String(r.year).slice(-2)}`,
      cost: Number((r.totalCost || 0).toFixed(2)),
      kwh: Number((r.consumption || 0).toFixed(0)),
    }));

    const latestMode = latest ? resolveElectricityMeterMode(latest) : null;

    return (
      <div className="rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 shadow-xs space-y-5">
        <CardHeader
          title={meta.title}
          periodLabel={latest ? latest.periodLabel : currentPeriodLabel}
          supportsChartToggle
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {monthComparisonData.electricity.currentValue > 0
                  ? `Сметка за ${monthComparisonData.currentMonthLabel}`
                  : latest
                  ? `Последна сметка (${latest.periodLabel})`
                  : "Няма отчетени сметки"}
              </span>
            </span>
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
              €{heroValue.toFixed(2)}
            </p>
          </div>
          {monthComparisonData.electricity.currentValue > 0 ||
          monthComparisonData.electricity.previousValue > 0 ? (
            <TrendIndicator
              comparison={monthComparisonData.electricity}
              subLabel={`сп. ${monthComparisonData.previousMonthLabel}`}
            />
          ) : previous && latest ? (
            <TrendIndicator
              fallbackPercent={
                previous.totalCost > 0
                  ? Math.round(
                      ((latest.totalCost - previous.totalCost) / previous.totalCost) * 100
                    )
                  : 0
              }
              fallbackPositive={latest.totalCost <= previous.totalCost}
              subLabel={`сп. ${previous.periodLabel}`}
            />
          ) : (
            <TrendIndicator fallbackPercent={0} subLabel="няма история" />
          )}
        </div>

        {viewMode === "chart" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Историческа тенденция на сметките за ток (€)
            </p>
            <div className="h-[220px] w-full">
              {canRenderCharts ? (
                chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis dataKey="period" tick={axisTickStyle} stroke={gridStroke} />
                      <YAxis tick={axisTickStyle} stroke={gridStroke} />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(val: any, name: any) =>
                          name === "cost"
                            ? [`€${Number(val).toFixed(2)}`, "Сметка"]
                            : [`${Number(val).toFixed(0)} kWh`, "Консумация"]
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="cost"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: "#f59e0b" }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    Няма достатъчно записи за графика.
                  </div>
                )
              ) : (
                <div className="h-full rounded-2xl bg-slate-50 dark:bg-slate-800/40" />
              )}
            </div>
          </div>
        ) : latest ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border-t border-slate-100 dark:border-slate-800/80">
            <MetricRow
              label="Последно потребление"
              value={
                latest.consumption > 0
                  ? `${latest.consumption.toFixed(0)} kWh`
                  : "Без kWh отчет"
              }
              subValue={
                latestMode === "double" && (latest.consT1 > 0 || latest.consT2 > 0)
                  ? `${getElectricityMeterTypeLabel(latest)} · T1: ${latest.consT1.toFixed(0)} kWh · T2: ${latest.consT2.toFixed(0)} kWh`
                  : `${getElectricityMeterTypeLabel(latest)}${latest.note ? ` · ${latest.note}` : ""}`
              }
            />
            <MetricRow
              label="Средна месечна сметка"
              value={`€${avgCost.toFixed(2)}`}
              subValue={
                avgKwh > 0
                  ? `Средно потребление: ${avgKwh.toFixed(0)} kWh (${sortedDesc.length} отчета)`
                  : `Общо ${sortedDesc.length} записа в историята`
              }
            />
            {previous && (
              <MetricRow
                label={`Предходен запис (${previous.periodLabel})`}
                value={`€${previous.totalCost.toFixed(2)}`}
                subValue={
                  previous.consumption > 0
                    ? `${previous.consumption.toFixed(0)} kWh`
                    : previous.note
                }
              />
            )}
          </div>
        ) : (
          <div className="py-6 text-center space-y-1">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Все още няма записани сметки за ток
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Използвайте калкулатора ТОК за точно разпределение и история.
            </p>
          </div>
        )}

        {isExpanded && sortedDesc.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 animate-in fade-in duration-150">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 pt-1">
              Последни отчетени периоди
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {sortedDesc.slice(0, 5).map((rec) => (
                <div
                  key={rec.id}
                  className="py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {rec.periodLabel}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 ml-2">
                      {getElectricityMeterTypeLabel(rec)}
                      {rec.consumption > 0 ? ` · ${rec.consumption.toFixed(0)} kWh` : ""}
                    </span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                    €{rec.totalCost.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {renderCardFooter({
          hasExpandContent: sortedDesc.length > 1,
          expandLabel: `История (${sortedDesc.length} сметки)`,
          primaryActionLabel: "Калкулатор ТОК",
          onPrimaryAction: () => onNavigateTab?.("electricity"),
        })}
      </div>
    );
  }

  // ============================================================================
  // 8. AI INSIGHTS CARD ("AI Инсайти")
  // ============================================================================
  const anomalyCount = aiAnalysis.insights.filter(
    (i) => i.type === "unusual" || i.priority === "high"
  ).length;
  const topSuggestions = aiAnalysis.topRecommendations.slice(0, 3);
  const score = aiAnalysis.healthScore.score;

  return (
    <div className="rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 shadow-xs space-y-5">
      <CardHeader
        title={meta.title}
        periodLabel={currentPeriodLabel}
        viewMode={viewMode}
        onToggleViewMode={onToggleViewMode}
        rightBadge={
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{aiAnalysis.healthScore.rating}</span>
          </span>
        }
      />

      <div className="flex items-end justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Финансов здравен индекс</span>
          </span>
          <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
            {score}
            <span className="text-lg font-bold text-slate-400 dark:text-slate-500">
              /100
            </span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums block">
            +{aiAnalysis.healthScore.monthlySavingsPotential.toFixed(0)} €/мес
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            потенциал за спестяване
          </span>
        </div>
      </div>

      {/* Compact Metrics Strip */}
      <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-100 dark:border-slate-800/80">
        <div>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
            Наблюдения
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
            {aiAnalysis.insights.length} бр.
          </span>
        </div>
        <div>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
            Аномалии / приоритетни
          </span>
          <span
            className={`text-sm sm:text-base font-bold tabular-nums mt-0.5 block ${
              anomalyCount > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-900 dark:text-white"
            }`}
          >
            {anomalyCount} бр.
          </span>
        </div>
        <div className="text-right">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
            Буфер (месеци)
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
            {aiAnalysis.healthScore.runwayMonths.toFixed(1)} мес.
          </span>
        </div>
      </div>

      {/* Top Suggestions or Expanded Full AiRecommendationsSection */}
      {!isExpanded ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {topSuggestions.length > 0 ? (
            topSuggestions.map((rec) => (
              <div key={rec.id} className="py-2.5 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                    {rec.title}
                  </p>
                  {rec.impact && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0 tabular-nums">
                      {rec.impact}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {rec.actionableTip || rec.description}
                </p>
              </div>
            ))
          ) : (
            <p className="py-4 text-xs text-slate-500 dark:text-slate-400 text-center">
              Добавете повече данни за персонализирани предложения за оптимизация.
            </p>
          )}
        </div>
      ) : (
        <div className="pt-1 animate-in fade-in duration-150">
          <AiRecommendationsSection
            aiAnalysis={aiAnalysis}
            onNavigateTab={onNavigateTab}
          />
        </div>
      )}

      {renderCardFooter({
        hasExpandContent: true,
        expandLabel: "Детайлни препоръки",
        primaryActionLabel: "Пълен AI Анализ",
        onPrimaryAction: () => onNavigateTab?.("ai-analysis"),
      })}
    </div>
  );
};
