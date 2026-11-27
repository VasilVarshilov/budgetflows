import React, { useState, useMemo, useEffect } from "react";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  PiggyBank,
  ArrowRight,
  Filter,
  CheckCircle2,
  RefreshCw,
  Target,
  ArrowUpRight,
  HelpCircle,
  Award,
  Layers,
  PieChart as PieChartIcon,
  Info,
  X,
  Calculator,
  Database,
  ListChecks,
  ChevronRight,
} from "lucide-react";
import { MonthlyRecord, IncomeItem } from "@/types";
import {
  generateLocalFinancialAnalysis,
  translateHealthRating,
  AiMetricId,
} from "@/utils/aiAnalysisEngine";
import { isCompletedExpense } from "@/utils/expenseStatus";
import { CategoryDistributionChart } from "@/components/charts/CategoryDistributionChart";
import { AiChatSection } from "./AiChatSection";
import { AiInsightsCarousel } from "./AiInsightsCarousel";
import { useI18n } from "@/i18n";
import { formatLocalizedMonthYear } from "@/i18n/helpers";
import { SAVINGS_GOALS_UPDATED_EVENT } from "@/utils/savingsGoalsStorage";
import { ELECTRICITY_UPDATED_EVENT } from "@/utils/electricityStorage";

interface AiAnalysisTabProps {
  monthlyData: Record<string, MonthlyRecord>;
  globalSavings: IncomeItem[];
  currentMonth?: string;
  onNavigateTab?: (tab: any) => void;
}

type FilterCategory = "all" | "income" | "spending" | "savings" | "electricity" | "trend" | "top";

export const AiAnalysisTab: React.FC<AiAnalysisTabProps> = ({
  monthlyData,
  globalSavings,
  currentMonth,
  onNavigateTab,
}) => {
  const { t, language } = useI18n();
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [summaryScope, setSummaryScope] = useState<"current" | "all">("current");
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [selectedMetricId, setSelectedMetricId] = useState<AiMetricId | null>(null);

  useEffect(() => {
    if (!selectedMetricId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedMetricId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedMetricId]);

  useEffect(() => {
    const bumpRevision = () => setAnalysisRevision((v) => v + 1);
    window.addEventListener("homebudget:budgets-updated", bumpRevision);
    window.addEventListener(SAVINGS_GOALS_UPDATED_EVENT, bumpRevision);
    window.addEventListener(ELECTRICITY_UPDATED_EVENT, bumpRevision);
    window.addEventListener("homebudget:categories-updated", bumpRevision);
    window.addEventListener("homebudget:data-restored", bumpRevision);
    window.addEventListener("budgetflows:account-changed", bumpRevision);
    window.addEventListener("storage", bumpRevision);
    return () => {
      window.removeEventListener("homebudget:budgets-updated", bumpRevision);
      window.removeEventListener(SAVINGS_GOALS_UPDATED_EVENT, bumpRevision);
      window.removeEventListener(ELECTRICITY_UPDATED_EVENT, bumpRevision);
      window.removeEventListener("homebudget:categories-updated", bumpRevision);
      window.removeEventListener("homebudget:data-restored", bumpRevision);
      window.removeEventListener("budgetflows:account-changed", bumpRevision);
      window.removeEventListener("storage", bumpRevision);
    };
  }, []);

  // Generate analysis from real user data
  const analysis = useMemo(() => {
    return generateLocalFinancialAnalysis(monthlyData, globalSavings, language);
  }, [monthlyData, globalSavings, language, analysisRevision]);

  const activeMonthKey = useMemo(() => {
    if (currentMonth && monthlyData[currentMonth]) return currentMonth;
    if (currentMonth) return currentMonth;
    const keys = Object.keys(monthlyData || {});
    return keys.length > 0 ? keys[keys.length - 1] : "";
  }, [monthlyData, currentMonth]);

  const categorySummaryItems = useMemo(() => {
    const map: Record<string, { value: number; colorClass?: string }> = {};
    const targetRecords =
      summaryScope === "current" && activeMonthKey && monthlyData[activeMonthKey]
        ? [monthlyData[activeMonthKey]]
        : Object.values(monthlyData || {});

    targetRecords.forEach((rec) => {
      const exp = rec?.expenses;
      if (!exp) return;
      if (Array.isArray(exp.fixed_expenses)) {
        exp.fixed_expenses.forEach((item) => {
          if (!isCompletedExpense(item)) return;
          if (!map[item.categoryName]) {
            map[item.categoryName] = { value: 0, colorClass: item.categoryColor };
          }
          map[item.categoryName].value += Number(item.amount) || 0;
        });
      }
      if (Array.isArray(exp.additional_expenses)) {
        exp.additional_expenses.forEach((item) => {
          if (!isCompletedExpense(item)) return;
          if (!map[item.categoryName]) {
            map[item.categoryName] = { value: 0, colorClass: item.categoryColor };
          }
          map[item.categoryName].value += Number(item.amount) || 0;
        });
      }
    });

    return Object.entries(map).map(([name, d]) => ({
      name,
      value: parseFloat(d.value.toFixed(2)),
      colorClass: d.colorClass,
    }));
  }, [monthlyData, summaryScope, activeMonthKey]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setAnalysisRevision((v) => v + 1);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };

  // Filtered insights list
  const filteredInsights = useMemo(() => {
    if (selectedFilter === "top") {
      return analysis.topRecommendations;
    }
    if (selectedFilter === "all") {
      return analysis.insights;
    }
    return analysis.insights.filter((item) => item.category === selectedFilter);
  }, [analysis, selectedFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 min-w-0 overflow-x-hidden">
      {/* Top Banner / Hero Header */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl p-4 sm:p-8 text-white shadow-lg relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 min-w-0">
          <div className="space-y-2 max-w-2xl min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/20 rounded-full text-xs font-semibold text-indigo-200 backdrop-blur-md max-w-full flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
              <span className="break-words">{t("ai.assistantBadge")}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight break-words">
              {t("ai.heroTitle")}
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed break-words">
              {t("ai.heroDesc")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
            <button
              onClick={handleRefresh}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-semibold backdrop-blur-md transition-all shadow-xs cursor-pointer text-center ${
                isRefreshing ? "opacity-75" : ""
              }`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>{t("ai.refreshBtn")}</span>
            </button>

            <button
              onClick={() => onNavigateTab?.("budgets")}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer text-center"
            >
              <Target className="w-4 h-4 shrink-0" />
              <span>{t("ai.applyBudgetBtn")}</span>
            </button>
          </div>
        </div>

        {/* Financial Health Scorecard Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-8 pt-6 border-t border-white/10 min-w-0">
          <button
            type="button"
            onClick={() => setSelectedMetricId("healthScore")}
            aria-label={`${t("ai.healthScoreTitle")} — ${t("ai.clickForDetailsHint")}`}
            title={t("ai.clickForDetailsHint")}
            className="group min-w-0 overflow-hidden bg-white/5 hover:bg-white/12 border border-white/10 hover:border-sky-300/40 p-3 sm:p-3.5 rounded-2xl backdrop-blur-xs text-left transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <div className="flex items-start justify-between gap-1.5 min-w-0">
              <span className="text-[11px] font-medium text-slate-300 block break-words leading-snug min-w-0">
                {t("ai.healthScoreTitle")}
              </span>
              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-300 shrink-0 mt-0.5 transition-colors" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mt-1.5 min-w-0">
              <div className="inline-flex items-baseline gap-1 shrink-0">
                <span className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                  {analysis.healthScore.score}
                </span>
                <span className="text-xs text-indigo-300 font-semibold">/100</span>
              </div>
              <span className="text-[10px] sm:text-[11px] leading-tight px-2 py-0.5 rounded-md font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 max-w-full whitespace-normal break-words">
                {translateHealthRating(analysis.healthScore.rating, language)}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMetricId("savingsRate")}
            aria-label={`${t("ai.savingsRateTitle")} — ${t("ai.clickForDetailsHint")}`}
            title={t("ai.clickForDetailsHint")}
            className="group min-w-0 overflow-hidden bg-white/5 hover:bg-white/12 border border-white/10 hover:border-sky-300/40 p-3 sm:p-3.5 rounded-2xl backdrop-blur-xs text-left transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <div className="flex items-start justify-between gap-1.5 min-w-0">
              <span className="text-[11px] font-medium text-slate-300 block break-words leading-snug min-w-0">
                {t("ai.savingsRateTitle")}
              </span>
              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-300 shrink-0 mt-0.5 transition-colors" />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1.5 min-w-0">
              <span className="text-2xl sm:text-3xl font-black text-white tabular-nums break-all">
                {analysis.healthScore.savingsRate}%
              </span>
              <span className="text-[11px] text-slate-300 break-words">
                {t("ai.ofIncomeLabel")}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMetricId("runwayMonths")}
            aria-label={`${t("ai.emergencyReserveTitle")} — ${t("ai.clickForDetailsHint")}`}
            title={t("ai.clickForDetailsHint")}
            className="group min-w-0 overflow-hidden bg-white/5 hover:bg-white/12 border border-white/10 hover:border-sky-300/40 p-3 sm:p-3.5 rounded-2xl backdrop-blur-xs text-left transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <div className="flex items-start justify-between gap-1.5 min-w-0">
              <span className="text-[11px] font-medium text-slate-300 block break-words leading-snug min-w-0">
                {t("ai.emergencyReserveTitle")}
              </span>
              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-300 shrink-0 mt-0.5 transition-colors" />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1.5 min-w-0">
              <span className="text-2xl sm:text-3xl font-black text-white tabular-nums break-all">
                {analysis.healthScore.runwayMonths}
              </span>
              <span className="text-xs text-slate-300 break-words">
                {t("ai.monthsBufferSuffix")}
              </span>
            </div>
            <span className="mt-1 block text-[11px] leading-snug text-slate-300/90 break-words">
              {t("ai.emergencyBasedOnAllSavingsNote")}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMetricId("monthlySavingsPotential")}
            aria-label={`${t("ai.savingsPotentialTitle")} — ${t("ai.clickForDetailsHint")}`}
            title={t("ai.clickForDetailsHint")}
            className="group min-w-0 overflow-hidden bg-white/5 hover:bg-white/12 border border-white/10 hover:border-emerald-300/40 p-3 sm:p-3.5 rounded-2xl backdrop-blur-xs text-left transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <div className="flex items-start justify-between gap-1.5 min-w-0">
              <span className="text-[11px] font-medium text-slate-300 block break-words leading-snug min-w-0">
                {t("ai.savingsPotentialTitle")}
              </span>
              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-300 shrink-0 mt-0.5 transition-colors" />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1.5 min-w-0">
              <span className="text-2xl sm:text-3xl font-black text-emerald-400 tabular-nums break-all">
                ~€{analysis.healthScore.monthlySavingsPotential}
              </span>
              <span className="text-xs text-slate-300 break-words">
                {t("ai.perMonthSuffix")}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Modern AI Chat Assistant */}
      <AiChatSection
        monthlyData={monthlyData}
        globalSavings={globalSavings}
        currentMonth={currentMonth}
      />

      {/* Visual Category Summary */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4 transition-colors min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
              <PieChartIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base break-words">
                {t("ai.visualDistTitle")}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
                {summaryScope === "current" && activeMonthKey
                  ? t("ai.categoriesForPeriod", {
                      period: formatLocalizedMonthYear(activeMonthKey, language),
                    })
                  : t("ai.allAnalyzedMonths", {
                      count: analysis.monthsAnalyzedCount,
                    })}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/80 dark:border-slate-700/80 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setSummaryScope("current")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                summaryScope === "current"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {t("ai.currentMonthScope")}
            </button>
            <button
              type="button"
              onClick={() => setSummaryScope("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                summaryScope === "all"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {t("ai.allMonthsScope", { count: analysis.monthsAnalyzedCount })}
            </button>
          </div>
        </div>

        <CategoryDistributionChart
          items={categorySummaryItems}
          totalLabel={t("ai.filterSpending")}
          emptyTitle={t("ai.emptyChartTitle")}
          compact
        />
      </div>

      {/* Filter Tabs Bar */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-2 sm:gap-3 transition-colors">
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setSelectedFilter("all")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "all"
                ? "bg-slate-900 dark:bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {t("ai.allInsightsCount", { count: analysis.insights.length })}
          </button>

          <button
            onClick={() => setSelectedFilter("top")}
            className={`min-h-[38px] flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "top"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t("ai.topRecsCount", { count: analysis.topRecommendations.length })}</span>
          </button>

          <button
            onClick={() => setSelectedFilter("income")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "income"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {t("nav.income")}
          </button>

          <button
            onClick={() => setSelectedFilter("spending")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "spending"
                ? "bg-rose-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {t("ai.filterSpending")}
          </button>

          <button
            onClick={() => setSelectedFilter("savings")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "savings"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {t("ai.filterSavings")}
          </button>

          <button
            onClick={() => setSelectedFilter("electricity")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "electricity"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {t("ai.filterElectricity")}
          </button>

          <button
            onClick={() => setSelectedFilter("trend")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "trend"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {t("ai.filterTrendBudget")}
          </button>
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400 hidden md:block shrink-0 pr-2">
          {t("ai.analyzedMonthsCount", { count: analysis.monthsAnalyzedCount })}
        </span>
      </div>

      {/* Insight Cards Swipe Carousel */}
      {filteredInsights.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-500 dark:text-slate-400">
          <HelpCircle className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-400 mb-2" />
          <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">
            {t("ai.noCategoryInsightsTitle")}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t("ai.noCategoryInsightsDesc")}
          </p>
        </div>
      ) : (
        <AiInsightsCarousel
          insights={filteredInsights}
          filterKey={selectedFilter}
        />
      )}

      {/* Financial Health Best Practices Section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-4 transition-colors min-w-0 overflow-hidden">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-white text-base break-words">
              {t("ai.bestPracticesTitle")}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
              {t("ai.bestPracticesSub")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 min-w-0">
          <div className="min-w-0 overflow-hidden p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1.5 min-w-0">
              <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-black text-xs flex items-center justify-center shrink-0">
                1
              </span>
              <h4 className="font-bold text-slate-800 dark:text-white text-sm break-words min-w-0">{t("ai.rule1Title")}</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 break-words leading-relaxed">
              {t("ai.rule1Desc")}
            </p>
          </div>

          <div className="min-w-0 overflow-hidden p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1.5 min-w-0">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-black text-xs flex items-center justify-center shrink-0">
                2
              </span>
              <h4 className="font-bold text-slate-800 dark:text-white text-sm break-words min-w-0">{t("ai.rule2Title")}</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 break-words leading-relaxed">
              {t("ai.rule2Desc")}
            </p>
          </div>

          <div className="min-w-0 overflow-hidden p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1.5 min-w-0">
              <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-black text-xs flex items-center justify-center shrink-0">
                3
              </span>
              <h4 className="font-bold text-slate-800 dark:text-white text-sm break-words min-w-0">{t("ai.rule3Title")}</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 break-words leading-relaxed">
              {t("ai.rule3Desc")}
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Metric Explanation Modal */}
      {selectedMetricId && analysis.metricBreakdowns[selectedMetricId] && (() => {
        const detail = analysis.metricBreakdowns[selectedMetricId];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 dark:bg-black/75 backdrop-blur-xs animate-in fade-in"
            role="dialog"
            aria-modal="true"
            aria-label={detail.title}
            onClick={() => setSelectedMetricId(null)}
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 text-white shrink-0">
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 block">
                    {t("ai.metricModal.subtitle")}
                  </span>
                  <h3 className="text-base sm:text-lg font-extrabold text-white mt-0.5 break-words">
                    {detail.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-2xl font-black text-emerald-400 tabular-nums">
                      {detail.displayValue}
                    </span>
                    {detail.badgeText && (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-white/10 text-indigo-100 border border-white/15">
                        {detail.badgeText}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMetricId(null)}
                  aria-label={t("common.close")}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs sm:text-sm min-w-0">
                {/* Formula */}
                <div className="rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/70 p-3.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-1.5">
                    <Calculator className="w-3.5 h-3.5 shrink-0" />
                    <span>{t("ai.metricModal.formulaLabel")}</span>
                  </div>
                  <p className="text-xs font-mono text-slate-800 dark:text-slate-200 break-words leading-relaxed">
                    {detail.formula}
                  </p>
                </div>

                {/* Inputs Used */}
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Database className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                    <span>{t("ai.metricModal.inputsLabel")}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 min-w-0">
                    {detail.inputsUsed.map((inp, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 p-2.5 min-w-0"
                      >
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block break-words">
                          {inp.label}
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white break-words block mt-0.5 tabular-nums">
                          {inp.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Calculation Steps */}
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <ListChecks className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    <span>{t("ai.metricModal.breakdownLabel")}</span>
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    {detail.calculationSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 p-3 min-w-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 dark:text-white text-xs break-words">
                            {step.label}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 break-words leading-relaxed">
                            {step.detail}
                          </div>
                        </div>
                        {step.delta && (
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${
                              step.tone === "positive"
                                ? "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300"
                                : step.tone === "negative"
                                ? "bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300"
                                : "bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {step.delta}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Interpretation */}
                <div className="rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 p-3.5 min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1">
                    {t("ai.metricModal.interpretationLabel")}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed break-words">
                    {detail.interpretation}
                  </p>
                </div>

                {/* Recommendations */}
                {detail.recommendations.length > 0 && (
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <Lightbulb className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                      <span>{t("ai.metricModal.recommendationsLabel")}</span>
                    </div>
                    <ul className="space-y-1.5 min-w-0">
                      {detail.recommendations.map((rec, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="min-w-0 flex-1">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2 bg-slate-50/70 dark:bg-slate-900/90 shrink-0">
                {detail.targetActionTab && onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = detail.targetActionTab;
                      setSelectedMetricId(null);
                      if (target) onNavigateTab(target);
                    }}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <span>{detail.targetActionLabel}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedMetricId(null)}
                  className="min-h-[40px] inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-200/80 hover:bg-slate-300/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
