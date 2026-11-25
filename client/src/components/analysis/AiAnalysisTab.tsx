import React, { useState, useMemo, useEffect } from "react";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  Zap,
  PiggyBank,
  Wallet,
  ArrowRight,
  Filter,
  CheckCircle2,
  RefreshCw,
  Target,
  ArrowUpRight,
  HelpCircle,
  Award,
  Layers,
  Banknote,
  PieChart as PieChartIcon,
} from "lucide-react";
import { MonthlyRecord, IncomeItem } from "@/types";
import {
  generateLocalFinancialAnalysis,
  FinancialInsight,
  InsightPriority,
  translateHealthRating,
} from "@/utils/aiAnalysisEngine";
import { isCompletedExpense } from "@/utils/expenseStatus";
import { CategoryDistributionChart } from "@/components/charts/CategoryDistributionChart";
import { AiChatSection } from "./AiChatSection";
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

  const getPriorityBadge = (priority: InsightPriority) => {
    switch (priority) {
      case "high":
        return {
          label: t("ai.priorityHigh"),
          className: "bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
          dot: "bg-rose-500",
        };
      case "opportunity":
        return {
          label: t("ai.priorityOpportunity"),
          className: "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
          dot: "bg-indigo-500",
        };
      case "medium":
        return {
          label: t("ai.priorityMedium"),
          className: "bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
          dot: "bg-amber-500",
        };
      case "low":
      default:
        return {
          label: t("ai.priorityLow"),
          className: "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
          dot: "bg-emerald-500",
        };
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "income":
        return <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case "spending":
        return <Wallet className="w-5 h-5 text-rose-600 dark:text-rose-400" />;
      case "savings":
        return <PiggyBank className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case "electricity":
        return <Zap className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case "trend":
      default:
        return <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
    }
  };

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
          <div className="min-w-0 overflow-hidden bg-white/5 border border-white/10 p-3 sm:p-3.5 rounded-2xl backdrop-blur-xs">
            <span className="text-[11px] font-medium text-slate-300 block break-words leading-snug">
              {t("ai.healthScoreTitle")}
            </span>
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
          </div>

          <div className="min-w-0 overflow-hidden bg-white/5 border border-white/10 p-3 sm:p-3.5 rounded-2xl backdrop-blur-xs">
            <span className="text-[11px] font-medium text-slate-300 block break-words leading-snug">
              {t("ai.savingsRateTitle")}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1.5 min-w-0">
              <span className="text-2xl sm:text-3xl font-black text-white tabular-nums break-all">
                {analysis.healthScore.savingsRate}%
              </span>
              <span className="text-[11px] text-slate-300 break-words">
                {t("ai.ofIncomeLabel")}
              </span>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden bg-white/5 border border-white/10 p-3 sm:p-3.5 rounded-2xl backdrop-blur-xs">
            <span className="text-[11px] font-medium text-slate-300 block break-words leading-snug">
              {t("ai.emergencyReserveTitle")}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1.5 min-w-0">
              <span className="text-2xl sm:text-3xl font-black text-white tabular-nums break-all">
                {analysis.healthScore.runwayMonths}
              </span>
              <span className="text-xs text-slate-300 break-words">
                {t("ai.monthsBufferSuffix")}
              </span>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden bg-white/5 border border-white/10 p-3 sm:p-3.5 rounded-2xl backdrop-blur-xs">
            <span className="text-[11px] font-medium text-slate-300 block break-words leading-snug">
              {t("ai.savingsPotentialTitle")}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 mt-1.5 min-w-0">
              <span className="text-2xl sm:text-3xl font-black text-emerald-400 tabular-nums break-all">
                ~€{analysis.healthScore.monthlySavingsPotential}
              </span>
              <span className="text-xs text-slate-300 break-words">
                {t("ai.perMonthSuffix")}
              </span>
            </div>
          </div>
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

      {/* Insight Cards Grid */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredInsights.map((insight) => {
            const priorityBadge = getPriorityBadge(insight.priority);

            return (
              <div
                key={insight.id}
                className={`min-w-0 overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border p-4 sm:p-6 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                  insight.priority === "high"
                    ? "border-rose-200/90 dark:border-rose-900/60"
                    : insight.priority === "opportunity"
                    ? "border-indigo-200/90 dark:border-indigo-900/60"
                    : "border-slate-200/80 dark:border-slate-800"
                }`}
              >
                <div className="min-w-0">
                  {/* Card Header */}
                  <div className="flex flex-wrap items-start justify-between gap-2.5 min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center shrink-0">
                        {getCategoryIcon(insight.category)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border max-w-full break-words ${priorityBadge.className}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityBadge.dot}`}
                            />
                            <span className="break-words">{priorityBadge.label}</span>
                          </span>

                          {insight.isTopRecommendation && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 max-w-full break-words">
                              {t("ai.topTipBadge")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Metric Chip */}
                    {insight.metricValue && (
                      <div className="text-left sm:text-right min-w-0 max-w-full">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block break-words">
                          {insight.metricLabel || t("ai.valueFallbackLabel")}
                        </span>
                        <span className="text-sm font-black text-slate-900 dark:text-white break-words block">
                          {insight.metricValue}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div className="mt-3.5 space-y-1.5 min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base leading-snug break-words">
                      {insight.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                      {insight.description}
                    </p>
                  </div>

                  {/* Impact Tag (if any) */}
                  {insight.impact && (
                    <div className="mt-3.5 inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 px-2.5 py-1 rounded-lg text-xs font-bold max-w-full whitespace-normal break-words">
                      <Lightbulb className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="break-words min-w-0">{insight.impact}</span>
                    </div>
                  )}
                </div>

                {/* Actionable Advice Footer */}
                <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 p-4 rounded-b-2xl min-w-0">
                  <div className="flex flex-wrap sm:flex-nowrap items-start gap-1.5 sm:gap-2 text-xs text-slate-700 dark:text-slate-200 min-w-0">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                      {t("ai.recommendationPrefix")}
                    </span>
                    <p className="font-medium text-slate-700 dark:text-slate-200 leading-relaxed break-words min-w-0 flex-1">
                      {insight.actionableTip}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
    </div>
  );
};
