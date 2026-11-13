import React, { useState, useMemo } from "react";
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
} from "lucide-react";
import { MonthlyRecord, IncomeItem } from "@/types";
import {
  generateLocalFinancialAnalysis,
  FinancialInsight,
  InsightPriority,
} from "@/utils/aiAnalysisEngine";

interface AiAnalysisTabProps {
  monthlyData: Record<string, MonthlyRecord>;
  globalSavings: IncomeItem[];
  onNavigateTab?: (tab: any) => void;
}

type FilterCategory = "all" | "income" | "spending" | "savings" | "electricity" | "trend" | "top";

export const AiAnalysisTab: React.FC<AiAnalysisTabProps> = ({
  monthlyData,
  globalSavings,
  onNavigateTab,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Generate analysis from real user data
  const analysis = useMemo(() => {
    return generateLocalFinancialAnalysis(monthlyData, globalSavings);
  }, [monthlyData, globalSavings]);

  const handleRefresh = () => {
    setIsRefreshing(true);
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
          label: "Висок приоритет",
          className: "bg-rose-50 text-rose-700 border-rose-200",
          dot: "bg-rose-500",
        };
      case "opportunity":
        return {
          label: "Възможност за растеж",
          className: "bg-indigo-50 text-indigo-700 border-indigo-200",
          dot: "bg-indigo-500",
        };
      case "medium":
        return {
          label: "Препоръка за оптимизация",
          className: "bg-amber-50 text-amber-700 border-amber-200",
          dot: "bg-amber-500",
        };
      case "low":
      default:
        return {
          label: "Положителен статус",
          className: "bg-emerald-50 text-emerald-700 border-emerald-200",
          dot: "bg-emerald-500",
        };
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "income":
        return <Banknote className="w-5 h-5 text-emerald-600" />;
      case "spending":
        return <Wallet className="w-5 h-5 text-rose-600" />;
      case "savings":
        return <PiggyBank className="w-5 h-5 text-emerald-600" />;
      case "electricity":
        return <Zap className="w-5 h-5 text-yellow-600" />;
      case "trend":
      default:
        return <TrendingUp className="w-5 h-5 text-indigo-600" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Banner / Hero Header */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/20 rounded-full text-xs font-semibold text-indigo-200 backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              <span>Интелигентен финансов AI асистент</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              AI Финансов Анализ & Персонализирани Инсайти
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Автоматизирано сканиране на паричните потоци, енергийната ефективност и
              структурата на разходите. Генерира точни насоки за икономии и оптимизация.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleRefresh}
              className={`flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-semibold backdrop-blur-md transition-all shadow-xs cursor-pointer ${
                isRefreshing ? "opacity-75" : ""
              }`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>Обнови анализа</span>
            </button>

            <button
              onClick={() => onNavigateTab?.("budgets")}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <Target className="w-4 h-4" />
              <span>Приложи в Бюджет</span>
            </button>
          </div>
        </div>

        {/* Financial Health Scorecard Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-8 pt-6 border-t border-white/10">
          <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl backdrop-blur-xs">
            <span className="text-[11px] font-medium text-slate-300 block">
              Финансов здравен индекс
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {analysis.healthScore.score}
              </span>
              <span className="text-xs text-indigo-300 font-semibold">/100</span>
              <span className="text-[11px] px-2 py-0.5 rounded-md font-bold ml-auto bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {analysis.healthScore.rating}
              </span>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl backdrop-blur-xs">
            <span className="text-[11px] font-medium text-slate-300 block">
              Норма на спестяване
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {analysis.healthScore.savingsRate}%
              </span>
              <span className="text-[11px] text-slate-400 ml-1">от дохода</span>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl backdrop-blur-xs">
            <span className="text-[11px] font-medium text-slate-300 block">
              Авариен спестовен фонд
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {analysis.healthScore.runwayMonths}
              </span>
              <span className="text-xs text-slate-400 ml-1">месеца буфер</span>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl backdrop-blur-xs">
            <span className="text-[11px] font-medium text-slate-300 block">
              Потенциал за икономия
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl sm:text-3xl font-black text-emerald-400">
                ~€{analysis.healthScore.monthlySavingsPotential}
              </span>
              <span className="text-xs text-slate-400 ml-1">/месец</span>
            </div>
          </div>
        </div>
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
            Всички инсайти ({analysis.insights.length})
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
            <span>⭐ Топ препоръки ({analysis.topRecommendations.length})</span>
          </button>

          <button
            onClick={() => setSelectedFilter("income")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "income"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Приходи
          </button>

          <button
            onClick={() => setSelectedFilter("spending")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "spending"
                ? "bg-rose-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Разходи
          </button>

          <button
            onClick={() => setSelectedFilter("savings")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "savings"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Спестявания
          </button>

          <button
            onClick={() => setSelectedFilter("electricity")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "electricity"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Електроенергия
          </button>

          <button
            onClick={() => setSelectedFilter("trend")}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedFilter === "trend"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Тенденции & Бюджет
          </button>
        </div>

        <span className="text-xs text-slate-400 dark:text-slate-500 hidden md:block shrink-0 pr-2">
          Анализирани {analysis.monthsAnalyzedCount} месеца
        </span>
      </div>

      {/* Insight Cards Grid */}
      {filteredInsights.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400">
          <HelpCircle className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Няма инсайти в тази категория</h4>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Всички параметри в тази група функционират оптимално.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredInsights.map((insight) => {
            const priorityBadge = getPriorityBadge(insight.priority);

            return (
              <div
                key={insight.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 sm:p-6 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                  insight.priority === "high"
                    ? "border-rose-200/90 dark:border-rose-900/60"
                    : insight.priority === "opportunity"
                    ? "border-indigo-200/90 dark:border-indigo-900/60"
                    : "border-slate-200/80 dark:border-slate-800"
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center shrink-0">
                        {getCategoryIcon(insight.category)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${priorityBadge.className}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${priorityBadge.dot}`}
                            />
                            {priorityBadge.label}
                          </span>

                          {insight.isTopRecommendation && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              ⭐ Топ съвет
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Metric Chip */}
                    {insight.metricValue && (
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                          {insight.metricLabel || "Стойност"}
                        </span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {insight.metricValue}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div className="mt-3.5 space-y-1.5">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base leading-snug">
                      {insight.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {insight.description}
                    </p>
                  </div>

                  {/* Impact Tag (if any) */}
                  {insight.impact && (
                    <div className="mt-3.5 inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 px-2.5 py-1 rounded-lg text-xs font-bold">
                      <Lightbulb className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{insight.impact}</span>
                    </div>
                  )}
                </div>

                {/* Actionable Advice Footer */}
                <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-4 rounded-b-2xl">
                  <div className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                      💡 Препоръка:
                    </span>
                    <p className="font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Основни финансови правила за оптимизация
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Препоръки, вградени в алгоритмите за анализ на личния бюджет
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-black text-xs flex items-center justify-center">
                1
              </span>
              <h4 className="font-bold text-slate-800 dark:text-white text-sm">Правило 50/30/20</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              До 50% за фиксирани нужди (наем, ток, сметки), до 30% за лични желания
              и минимум 20% за спестявания и инвестиции.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-black text-xs flex items-center justify-center">
                2
              </span>
              <h4 className="font-bold text-slate-800 dark:text-white text-sm">3-6 месечен буфер</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Поддържайте ликвиден спестовен фонд, покриващ поне три пълни месеца от
              всичките ви регулярни битови разходи.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-black text-xs flex items-center justify-center">
                3
              </span>
              <h4 className="font-bold text-slate-800 dark:text-white text-sm">Нощна електроенергия</h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Планирайте работата на пералня, сушилня и бойлер след 22:00 ч. за намаляване
              на месечната фактура за ток с 10-15%.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
