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
import { translateHealthRating } from "@/utils/aiAnalysisEngine";
import {
  useI18n,
  translateCategoryName,
  translateGoalName,
  translateBudgetName,
  translateMonthName,
  translateElectricityPeriodLabel,
  translateElectricityNote,
  formatLocalizedMonthYear,
  formatLocalizedDate,
  formatShortMonthIndex,
} from "@/i18n";

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
  toggleAriaLabel,
  showChartTitle,
  showSummaryTitle,
}: {
  title: string;
  periodLabel: string;
  supportsChartToggle?: boolean;
  viewMode: "summary" | "chart";
  onToggleViewMode: (mode: "summary" | "chart") => void;
  rightBadge?: React.ReactNode;
  toggleAriaLabel?: string;
  showChartTitle?: string;
  showSummaryTitle?: string;
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
          aria-label={toggleAriaLabel}
          data-no-drag="true"
        >
          <button
            type="button"
            onClick={() => onToggleViewMode("chart")}
            aria-pressed={viewMode === "chart"}
            title={showChartTitle}
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
            title={showSummaryTitle}
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
  value: React.ReactNode;
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

  const { t, language } = useI18n();
  const meta = {
    ...DASHBOARD_CARDS_META[cardId],
    title: t(`dashboard.cards.${cardId}.title`) || DASHBOARD_CARDS_META[cardId].title,
    category:
      t(`dashboard.cards.${cardId}.category`) || DASHBOARD_CARDS_META[cardId].category,
  };
  const headerToggleProps = {
    toggleAriaLabel: t("dashboard.toggleChartViewAria"),
    showChartTitle: t("dashboard.showChartTooltip"),
    showSummaryTitle: t("dashboard.showSummaryTooltip"),
  };
  const prevMonthLabel = formatLocalizedMonthYear(
    monthComparisonData.previousMonthLabel,
    language
  );
  const currMonthLabel = formatLocalizedMonthYear(
    monthComparisonData.currentMonthLabel,
    language
  );
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
              <span>{t("common.hideDetails")}</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>{expandLabel || t("common.showDetails")}</span>
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
  // 1. OVERVIEW CARD
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
          {...headerToggleProps}
        />

        {/* Hero KPI */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Scale className="w-3.5 h-3.5" />
              <span>{t("dashboard.overview.netBalanceLabel")}</span>
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
            subLabel={
              totalIncome > 0
                ? t("dashboard.overview.ofIncome")
                : t("dashboard.overview.forPeriod")
            }
          />
        </div>

        {/* Summary vs Chart View */}
        {viewMode === "chart" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t("dashboard.overview.monthlyDynamicsTitle")}
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
                        name === "expenses"
                          ? t("dashboard.overview.expensesSeries")
                          : t("dashboard.overview.incomeSeries"),
                      ]}
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: 11,
                        paddingTop: 6,
                        color: isDark ? "#cbd5e1" : "#475569",
                      }}
                      formatter={(val) =>
                        val === "expenses"
                          ? t("dashboard.overview.expensesSeries")
                          : t("dashboard.overview.incomeSeries")
                      }
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
              label={t("dashboard.overview.realizedIncome")}
              value={`€${totalIncome.toFixed(2)}`}
              tone="positive"
            />
            <MetricRow
              label={t("dashboard.overview.realizedExpenses")}
              value={`€${totalExpenses.toFixed(2)}`}
              tone="negative"
            />
            <MetricRow
              label={t("dashboard.overview.periodSavings")}
              value={`€${periodSavings.toFixed(2)}`}
            />
            <MetricRow
              label={t("dashboard.overview.upcomingEndPeriod")}
              value={
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-sky-600 dark:text-sky-400">
                    +€{totalExpectedIncome.toFixed(2)}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 font-normal">
                    /
                  </span>
                  <span className="text-amber-600 dark:text-amber-400">
                    -€{totalPlannedExpenses.toFixed(2)}
                  </span>
                </span>
              }
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
                  {t("dashboard.overview.quickActions")}
                </p>
                <span className="text-[11px] text-slate-400">
                  {t("dashboard.overview.directAccess")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab?.("monthly")}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t("dashboard.addExpense")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab?.("income")}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t("dashboard.addIncome")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab?.("electricity")}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-slate-950 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{t("dashboard.overview.electricityBtn")}</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenExportCenter}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t("dashboard.overview.exportBtn")}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {renderCardFooter({
          hasExpandContent: true,
          expandLabel: t("dashboard.overview.expandLabel"),
          primaryActionLabel: t("dashboard.exportReportBtn"),
          onPrimaryAction: onOpenExportCenter,
        })}
      </div>
    );
  }

  // ============================================================================
  // 2. SPENDING OVERVIEW CARD
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
          {...headerToggleProps}
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
              <span>{t("dashboard.spending.realizedExpenses")}</span>
            </span>
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
              €{totalExpenses.toFixed(2)}
            </p>
          </div>
          <TrendIndicator
            comparison={monthComparisonData.expenses}
            subLabel={t("dashboard.spending.vsPrev", { prev: prevMonthLabel })}
          />
        </div>

        {viewMode === "chart" ? (
          <div className="space-y-4">
            {canRenderCharts ? (
              <CategoryDistributionChart
                items={categoryBreakdown}
                totalLabel={t("common.total")}
                emptyTitle={t("dashboard.spending.emptyChartTitle")}
                emptyActionLabel={t("dashboard.spending.emptyChartAction")}
                onEmptyAction={() => onNavigateTab?.("monthly")}
              />
            ) : (
              <div className="h-[220px] rounded-2xl bg-slate-50 dark:bg-slate-800/40" />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-y border-slate-100 dark:border-slate-800/80">
              <div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  {t("dashboard.spending.recurring")}
                </span>
                <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                  €{totalFixed.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  {t("dashboard.spending.additional")}
                </span>
                <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                  €{totalVariable.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  {t("dashboard.spending.upcoming")}
                </span>
                <span className="text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5 block">
                  €{totalPlannedExpenses.toFixed(2)}
                </span>
              </div>
              <div className="sm:text-right">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  {t("dashboard.spending.expectedTotal")}
                </span>
                <span className="text-sm sm:text-base font-bold text-sky-600 dark:text-sky-400 tabular-nums mt-0.5 block">
                  €{(totalExpenses + totalPlannedExpenses).toFixed(2)}
                </span>
              </div>
            </div>

            {visibleCategories.length > 0 ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>{t("dashboard.spending.categoryDist")}</span>
                  <span className="tabular-nums">
                    {t("dashboard.spending.catCount", { count: categoryBreakdown.length })}
                  </span>
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
                            <span className="truncate">
                              {translateCategoryName(cat.name, language)}
                            </span>
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
                  {t("dashboard.spending.emptyChartTitle")}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {t("dashboard.spending.emptyHint")}
                </p>
              </div>
            )}
          </div>
        )}

        {isExpanded && canRenderCharts && (
          <div className="pt-2 space-y-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-150">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 pt-2">
              {t("dashboard.spending.monthlyTrendTitle")}
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
                      name === "expenses"
                        ? t("dashboard.overview.expensesSeries")
                        : t("dashboard.overview.incomeSeries"),
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
              ? t("dashboard.spending.expandAllCats", { count: categoryBreakdown.length })
              : t("dashboard.spending.expandYearTrend"),
          primaryActionLabel: t("dashboard.spending.toExpenses"),
          onPrimaryAction: () => onNavigateTab?.("monthly"),
        })}
      </div>
    );
  }

  // ============================================================================
  // 3. UPCOMING EXPENSES & PAYMENTS CARD
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
          {...headerToggleProps}
          rightBadge={
            overdueItems.length > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>
                  {t("dashboard.upcoming.overdueBadge", { count: overdueItems.length })}
                </span>
              </span>
            ) : dueTodayItems.length > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {t("dashboard.upcoming.todayBadge", { count: dueTodayItems.length })}
                </span>
              </span>
            ) : null
          }
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {t("dashboard.upcoming.plannedExpenses", {
                  count: upcomingExpenseItems.length,
                })}
              </span>
            </span>
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
              €{totalPlannedExpenses.toFixed(2)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
              {t("dashboard.upcoming.expectedTotal")}
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
              {t("dashboard.upcoming.dueToday")}
            </span>
            <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
              {dueTodayItems.length} {t("common.pcs")}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              {t("dashboard.upcoming.overdueLabel")}
            </span>
            <span
              className={`text-sm sm:text-base font-bold tabular-nums mt-0.5 block ${
                overdueItems.length > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-slate-900 dark:text-white"
              }`}
            >
              {overdueItems.length} {t("common.pcs")}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              {t("dashboard.upcoming.expectedIncome")}
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
                (td) => td.id === item.id && td.monthKey === item.monthKey && td.kind === item.kind
              );
              const isIncome = item.kind === "income";
              const displayIconName = resolveCategoryDisplayIcon(
                item.categoryIcon,
                item.categoryName
              );
              const IconComponent =
                (displayIconName && AVAILABLE_ICONS_MAP[displayIconName]) ||
                (isIncome ? ArrowDownLeft : Clock);
              const formattedDate = formatLocalizedDate(
                parseLocalDateKey(item.dateKey),
                language
              );
              const hasRepeat = Boolean(item.repeat && item.repeat !== "never");
              const secondaryLabel = [item.merchantName, item.note]
                .filter(Boolean)
                .join(" · ");
              const displayCategory = translateCategoryName(item.categoryName, language);

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
                          {displayCategory}
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
                            ? t("dashboard.upcoming.overdueDate", { date: formattedDate })
                            : isDueToday
                            ? t("dashboard.upcoming.dueTodayText")
                            : formattedDate}
                        </span>
                        {(periodType === "year" || periodType === "custom") &&
                          ` · ${formatLocalizedMonthYear(item.monthKey, language)}`}
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
                      ariaLabel={t("dashboard.upcoming.markCompletedAria", {
                        name: displayCategory,
                      })}
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
              {t("dashboard.upcoming.allDoneForPeriod", { period: currentPeriodLabel })}
            </p>
            <div className="flex items-center justify-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => onNavigateTab?.("monthly")}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                {t("dashboard.upcoming.planExpense")}
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab?.("income")}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                {t("dashboard.upcoming.expectedIncomeAction")}
              </button>
            </div>
          </div>
        )}

        {renderCardFooter({
          hasExpandContent: combinedOrdered.length > 4,
          expandLabel: t("dashboard.upcoming.seeAll", { count: combinedOrdered.length }),
          primaryActionLabel: t("dashboard.upcoming.openCalendar"),
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
          {...headerToggleProps}
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t("dashboard.income.realizedIncome", { count: incomeCount })}</span>
            </span>
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              €{totalIncome.toFixed(2)}
            </p>
          </div>
          <TrendIndicator
            comparison={monthComparisonData.income}
            subLabel={t("dashboard.spending.vsPrev", { prev: prevMonthLabel })}
          />
        </div>

        {viewMode === "chart" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t("dashboard.income.incomeVsExpenses")}
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
                        formatter={(val) =>
                          val === "income"
                            ? t("dashboard.overview.incomeSeries")
                            : t("dashboard.overview.expensesSeries")
                        }
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
                        formatter={(val: any) => [`€${Number(val).toFixed(2)}`, t("common.amount")]}
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
                label={t("dashboard.income.recurringIncome")}
                value={`€${totalFixedIncome.toFixed(2)}`}
                subValue={t("dashboard.income.recurringSub")}
              />
              <MetricRow
                label={t("dashboard.income.additionalIncome")}
                value={`€${totalAdditionalIncome.toFixed(2)}`}
                subValue={t("dashboard.income.additionalSub")}
              />
              <MetricRow
                label={t("dashboard.income.expectedIncomeCount", {
                  count: upcomingIncomeItems.length,
                })}
                value={`+€${totalExpectedIncome.toFixed(2)}`}
                subValue={t("dashboard.income.expectedIncomeSub", {
                  amount: (totalIncome + totalExpectedIncome).toFixed(2),
                })}
                tone="amber"
              />
            </div>

            {visibleUpcomingIncome.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t("dashboard.income.upcomingReceipts")}
                </p>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {visibleUpcomingIncome.map((inc) => {
                    const displayCat = translateCategoryName(inc.categoryName, language);
                    return (
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
                            {displayCat}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate tabular-nums">
                            {formatLocalizedDate(parseLocalDateKey(inc.dateKey), language)}
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
                            ariaLabel={t("dashboard.income.markReceivedAria", {
                              name: displayCat,
                            })}
                            size="sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {renderCardFooter({
          hasExpandContent: upcomingIncomeItems.length > 3,
          expandLabel: t("dashboard.income.seeAllExpected", {
            count: upcomingIncomeItems.length,
          }),
          primaryActionLabel: t("dashboard.income.manageIncome"),
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
          {...headerToggleProps}
          rightBadge={
            budgetData.activeWarnings.length > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  {t("dashboard.budget.signalsBadge", {
                    count: budgetData.activeWarnings.length,
                  })}
                </span>
              </span>
            ) : null
          }
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Target className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                {t("dashboard.budget.spentOfLimit", {
                  limit: budgetData.totalMonthlyLimit.toFixed(2),
                })}
              </span>
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
              {t("dashboard.budget.utilized")}
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
              {budgetData.isTotalExceeded
                ? t("dashboard.budget.overspent")
                : t("dashboard.budget.remaining")}
            </span>
            <span
              className={`font-bold ${
                budgetData.isTotalExceeded
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {budgetData.isTotalExceeded
                ? t("dashboard.budget.overLimitValue", {
                    amount: budgetData.totalOverspentAmount.toFixed(2),
                  })
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
                        {translateBudgetName(cs.budget.categoryName, language)}
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
                {t("dashboard.budget.noCategoryLimits")}
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
          expandLabel: t("dashboard.budget.fullBudgetControl"),
          primaryActionLabel: t("dashboard.budget.configureBudgets"),
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
          {...headerToggleProps}
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <PiggyBank className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t("dashboard.savings.totalFund")}</span>
            </span>
            <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
              €{lifetimeSavings.toFixed(2)}
            </p>
          </div>
          <TrendIndicator
            comparison={monthComparisonData.savings}
            subLabel={t("dashboard.savings.forPeriodVal", {
              amount: periodSavings.toFixed(2),
            })}
          />
        </div>

        {viewMode === "chart" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t("dashboard.savings.cumulativeTitle")}
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
                      formatter={(val: any) => [
                        `€${Number(val).toFixed(2)}`,
                        t("dashboard.savings.tooltipLabel"),
                      ]}
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
                label={t("dashboard.savings.netPeriodSavings")}
                value={`€${periodSavings.toFixed(2)}`}
                subValue={t("dashboard.savings.achievedTargetPct", { pct: goalProgressPct })}
                tone={periodSavings >= 0 ? "positive" : "negative"}
              />
              <MetricRow
                label={t("dashboard.savings.recommendedAllocation", {
                  pct: savingsTargetPercent,
                  income: totalIncome.toFixed(2),
                })}
                value={`€${recommendedSavings.toFixed(2)}`}
                subValue={
                  totalIncome > 0
                    ? netBalance >= recommendedSavings
                      ? t("dashboard.savings.goalCovered")
                      : t("dashboard.savings.goalGap", { gap: targetGap.toFixed(2) })
                    : t("dashboard.savings.enterIncomeHint")
                }
              />
              {savingsAllocationSummary.activeGoals.length > 0 && (
                <MetricRow
                  label={t("dashboard.savings.activeGoals", {
                    count: savingsAllocationSummary.activeGoals.length,
                  })}
                  value={`€${savingsAllocationSummary.totalAllocated.toFixed(2)}`}
                  subValue={t("dashboard.savings.unallocated", {
                    amount: savingsAllocationSummary.unallocatedSavings.toFixed(2),
                  })}
                />
              )}
            </div>

            {/* Editable Monthly Savings Target % Control */}
            <div
              className="flex flex-wrap items-center justify-between gap-3 pt-1"
              data-no-drag="true"
            >
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>{t("dashboard.savings.monthlyGoalPct")}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={savingsTargetPercent}
                  onChange={(e) => onSavingsTargetChange(e.target.value)}
                  className="w-18 px-2.5 py-1.5 min-h-[38px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label={t("dashboard.savings.goalAria")}
                />
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {t("dashboard.savings.recommendation")}{" "}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  €{recommendedSavings.toFixed(2)}
                </strong>
              </span>
            </div>
          </div>
        )}

        {isExpanded && savingsAllocationSummary.activeGoals.length > 0 && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5 animate-in fade-in duration-150">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t("dashboard.savings.goalsDistTitle")}
            </p>
            <div className="space-y-2">
              {savingsAllocationSummary.activeGoals.map((goal) => {
                const pct = getGoalProgressPercent(goal);
                return (
                  <div key={goal.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {translateGoalName(goal.name, goal.isEmergencyFund, language)}
                        {goal.isEmergencyFund && goal.name !== "Авариен фонд"
                          ? t("dashboard.savings.emergencySuffix")
                          : ""}
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
          expandLabel: t("dashboard.savings.goalsExpandLabel", {
            count: savingsAllocationSummary.activeGoals.length,
          }),
          primaryActionLabel: t("dashboard.savings.openSavings"),
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
      period: `${translateMonthName(r.month, language, true)} ${String(r.year).slice(-2)}`,
      cost: Number((r.totalCost || 0).toFixed(2)),
      kwh: Number((r.consumption || 0).toFixed(0)),
    }));

    const latestMode = latest ? resolveElectricityMeterMode(latest) : null;
    const latestPeriodDisplay = latest
      ? translateElectricityPeriodLabel(latest.periodLabel, language)
      : currentPeriodLabel;
    const previousPeriodDisplay = previous
      ? translateElectricityPeriodLabel(previous.periodLabel, language)
      : "";

    return (
      <div className="rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 shadow-xs space-y-5">
        <CardHeader
          title={meta.title}
          periodLabel={latestPeriodDisplay}
          supportsChartToggle
          viewMode={viewMode}
          onToggleViewMode={onToggleViewMode}
          {...headerToggleProps}
        />

        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {monthComparisonData.electricity.currentValue > 0
                  ? t("dashboard.electricity.billForMonth", { month: currMonthLabel })
                  : latest
                  ? t("dashboard.electricity.lastBill", { period: latestPeriodDisplay })
                  : t("dashboard.electricity.noBillsYet")}
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
              subLabel={t("dashboard.spending.vsPrev", { prev: prevMonthLabel })}
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
              subLabel={t("dashboard.spending.vsPrev", { prev: previousPeriodDisplay })}
            />
          ) : (
            <TrendIndicator fallbackPercent={0} subLabel={t("dashboard.electricity.noHistory")} />
          )}
        </div>

        {viewMode === "chart" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t("dashboard.electricity.trendTitle")}
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
                            ? [`€${Number(val).toFixed(2)}`, t("dashboard.electricity.billSeries")]
                            : [`${Number(val).toFixed(0)} kWh`, t("dashboard.electricity.kwhSeries")]
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
                    {t("dashboard.electricity.notEnoughForChart")}
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
              label={t("dashboard.electricity.lastConsumption")}
              value={
                latest.consumption > 0
                  ? `${latest.consumption.toFixed(0)} kWh`
                  : t("dashboard.electricity.noKwhReading")
              }
              subValue={
                latestMode === "double" && (latest.consT1 > 0 || latest.consT2 > 0)
                  ? `${getElectricityMeterTypeLabel(latest, language)} · T1: ${latest.consT1.toFixed(0)} kWh · T2: ${latest.consT2.toFixed(0)} kWh`
                  : `${getElectricityMeterTypeLabel(latest, language)}${latest.note ? ` · ${translateElectricityNote(latest.note, language)}` : ""}`
              }
            />
            <MetricRow
              label={t("dashboard.electricity.avgMonthlyBill")}
              value={`€${avgCost.toFixed(2)}`}
              subValue={
                avgKwh > 0
                  ? t("dashboard.electricity.avgConsumptionSub", {
                      kwh: avgKwh.toFixed(0),
                      count: sortedDesc.length,
                    })
                  : t("dashboard.electricity.totalRecordsSub", {
                      count: sortedDesc.length,
                    })
              }
            />
            {previous && (
              <MetricRow
                label={t("dashboard.electricity.previousRecord", {
                  period: previousPeriodDisplay,
                })}
                value={`€${previous.totalCost.toFixed(2)}`}
                subValue={
                  previous.consumption > 0
                    ? `${previous.consumption.toFixed(0)} kWh`
                    : translateElectricityNote(previous.note, language)
                }
              />
            )}
          </div>
        ) : (
          <div className="py-6 text-center space-y-1">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {t("dashboard.electricity.emptyTitle")}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t("dashboard.electricity.emptyHint")}
            </p>
          </div>
        )}

        {isExpanded && sortedDesc.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 animate-in fade-in duration-150">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 pt-1">
              {t("dashboard.electricity.recentPeriods")}
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {sortedDesc.slice(0, 5).map((rec) => (
                <div
                  key={rec.id}
                  className="py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {translateElectricityPeriodLabel(rec.periodLabel, language)}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 ml-2">
                      {getElectricityMeterTypeLabel(rec, language)}
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
          expandLabel: t("dashboard.electricity.historyExpandLabel", {
            count: sortedDesc.length,
          }),
          primaryActionLabel: t("dashboard.electricity.calculatorBtn"),
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
    <div className="rounded-3xl bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 p-5 sm:p-6 shadow-xs space-y-5 overflow-hidden min-w-0">
      <CardHeader
        title={meta.title}
        periodLabel={currentPeriodLabel}
        viewMode={viewMode}
        onToggleViewMode={onToggleViewMode}
        {...headerToggleProps}
        rightBadge={
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 max-w-full whitespace-normal break-words">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="break-words">{translateHealthRating(aiAnalysis.healthScore.rating, language)}</span>
          </span>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>{t("dashboard.ai.healthIndex")}</span>
          </span>
          <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
            {score}
            <span className="text-lg font-bold text-slate-400 dark:text-slate-500">
              /100
            </span>
          </p>
        </div>
        <div className="text-left sm:text-right min-w-0 max-w-full">
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums block">
            +{aiAnalysis.healthScore.monthlySavingsPotential.toFixed(0)}{" "}
            {t("dashboard.ai.perMonthUnit")}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 break-words">
            {t("dashboard.ai.savingsPotential")}
          </span>
        </div>
      </div>

      {/* Compact Metrics Strip */}
      <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-100 dark:border-slate-800/80 min-w-0">
        <div className="min-w-0">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block break-words">
            {t("dashboard.ai.insightsCount")}
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
            {aiAnalysis.insights.length} {t("common.pcs")}
          </span>
        </div>
        <div className="min-w-0">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block break-words">
            {t("dashboard.ai.anomaliesCount")}
          </span>
          <span
            className={`text-sm sm:text-base font-bold tabular-nums mt-0.5 block ${
              anomalyCount > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-900 dark:text-white"
            }`}
          >
            {anomalyCount} {t("common.pcs")}
          </span>
        </div>
        <div className="text-right min-w-0">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block break-words">
            {t("dashboard.ai.bufferMonths")}
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
            {aiAnalysis.healthScore.runwayMonths.toFixed(1)} {t("dashboard.ai.monthsUnit")}
          </span>
        </div>
      </div>

      {/* Top Suggestions or Expanded Full AiRecommendationsSection */}
      {!isExpanded ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80 min-w-0">
          {topSuggestions.length > 0 ? (
            topSuggestions.map((rec) => (
              <div key={rec.id} className="py-2.5 space-y-1 min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-snug break-words min-w-0 flex-1">
                    {rec.title}
                  </p>
                  {rec.impact && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 break-words max-w-full tabular-nums">
                      {rec.impact}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 break-words">
                  {rec.actionableTip || rec.description}
                </p>
              </div>
            ))
          ) : (
            <p className="py-4 text-xs text-slate-500 dark:text-slate-400 text-center">
              {t("dashboard.ai.emptyHint")}
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
        expandLabel: t("dashboard.ai.detailedRecs"),
        primaryActionLabel: t("dashboard.ai.fullAnalysis"),
        onPrimaryAction: () => onNavigateTab?.("ai-analysis"),
      })}
    </div>
  );
};
