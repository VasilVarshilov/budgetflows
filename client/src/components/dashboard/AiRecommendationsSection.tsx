import React from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { FullAnalysisResult } from "@/utils/aiAnalysisEngine";

interface AiRecommendationsSectionProps {
  aiAnalysis: FullAnalysisResult;
  onNavigateTab?: (tab: "budgets" | "dashboard" | "monthly" | "electricity" | "reports" | "savings" | "backup" | "ai-analysis") => void;
}

export const AiRecommendationsSection: React.FC<AiRecommendationsSectionProps> = ({
  aiAnalysis,
  onNavigateTab,
}) => {
  return (
    <div className="bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-white dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900 rounded-2xl border border-indigo-100/90 dark:border-indigo-900/50 p-5 shadow-xs transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-indigo-100/70 dark:border-indigo-900/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-xl shadow-xs">
            <Sparkles className="w-5 h-5 text-yellow-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Топ AI Препоръки & Инсайти
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Здравен индекс: {aiAnalysis.healthScore.score}/100
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Автоматично открити възможности за намаляване на разходи и по-бързо спестяване
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab?.("ai-analysis")}
          className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 border border-indigo-200/80 dark:border-indigo-800/80 px-3 py-1.5 rounded-xl shadow-2xs transition-all cursor-pointer self-start sm:self-auto"
        >
          <span>Виж всички инсайти ({aiAnalysis.insights.length})</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3 Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {aiAnalysis.topRecommendations.map((rec) => (
          <div
            key={rec.id}
            className="bg-white dark:bg-slate-800/90 rounded-xl border border-indigo-100/80 dark:border-slate-700/80 p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    rec.priority === "high"
                      ? "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                      : rec.priority === "opportunity"
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                      : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                  }`}
                >
                  {rec.category === "spending"
                    ? "Разходи"
                    : rec.category === "savings"
                    ? "Спестявания"
                    : rec.category === "electricity"
                    ? "Електроенергия"
                    : "Бюджет"}
                </span>

                {rec.impact && (
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                    {rec.impact}
                  </span>
                )}
              </div>

              <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-snug line-clamp-2">
                {rec.title}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                {rec.description}
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
              <span className="text-indigo-600 dark:text-indigo-400 font-bold shrink-0">💡</span>
              <span className="font-medium text-[11px] leading-tight text-slate-600 dark:text-slate-300 line-clamp-2">
                {rec.actionableTip}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
