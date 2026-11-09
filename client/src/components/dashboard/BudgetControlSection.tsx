import React from "react";
import { Target, ArrowRight, AlertTriangle } from "lucide-react";
import { OverallBudgetCalculation } from "@/utils/budgetStorage";

interface BudgetControlSectionProps {
  budgetData: OverallBudgetCalculation;
  currentPeriodLabel: string;
  onNavigateTab?: (tab: "budgets" | "dashboard" | "monthly" | "electricity" | "reports" | "savings" | "backup" | "ai-analysis") => void;
}

export const BudgetControlSection: React.FC<BudgetControlSectionProps> = ({
  budgetData,
  currentPeriodLabel,
  onNavigateTab,
}) => {
  const totalLimit = budgetData.totalMonthlyLimit;
  const status = budgetData.totalStatus;
  const percentageSpent = budgetData.totalPercentage;
  const isExceeded = budgetData.isTotalExceeded;

  return (
    <>
      {/* Exceeded Budget Warnings Banner */}
      {budgetData.activeWarnings.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 text-rose-900 dark:text-rose-200 shadow-xs animate-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-rose-100 dark:bg-rose-900/80 rounded-lg text-rose-600 dark:text-rose-300 mt-0.5 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-rose-800 dark:text-rose-200">
                  ⚠️ Предупреждение: Превишен бюджет ({currentPeriodLabel})
                </h4>
                <div className="mt-2 space-y-1.5">
                  {budgetData.activeWarnings.map((warn, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-white/90 dark:bg-slate-800/90 border border-rose-200/80 dark:border-rose-800 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-950 dark:text-rose-200 shadow-2xs"
                    >
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                      <span>{warn}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab?.("budgets")}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer shadow-xs transition-colors self-start sm:self-auto"
            >
              Управление на бюджети
            </button>
          </div>
        </div>
      )}

      {/* Budget Overview & Category Limits Section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                Бюджет и контрол на разходите
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Сравнение на разходите спрямо предварително зададените лимити ({currentPeriodLabel})
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab?.("budgets")}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-3 py-1.5 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
          >
            <span>Настройка на бюджети</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4">
          {/* Left Column: Overall Monthly Budget Progress */}
          <div className="lg:col-span-5 bg-slate-50/70 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/70 dark:border-slate-700/70 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Месечен бюджет
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    totalLimit === 0
                      ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      : status === "green"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : status === "yellow"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                  }`}
                >
                  {percentageSpent.toFixed(0)}% изразходвани
                </span>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    €{budgetData.totalSpent.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    от лимит €{totalLimit.toFixed(2)}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`text-sm font-bold ${
                      isExceeded
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {isExceeded
                      ? `-€${(budgetData.totalSpent - totalLimit).toFixed(2)}`
                      : `€${budgetData.totalRemaining.toFixed(2)}`}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {isExceeded ? "Превишение" : "Оставащи"}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-4">
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      status === "green"
                        ? "bg-emerald-500"
                        : status === "yellow"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.min(percentageSpent, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Quick Helper Text */}
            <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>
                {budgetData.activeWarnings.length > 0 ? (
                  <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {budgetData.activeWarnings.length} превишени лимита
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    ✓ Всички бюджети са в норма
                  </span>
                )}
              </span>
              <span>Лимити за {budgetData.categoryStatuses.length} категории</span>
            </div>
          </div>

          {/* Right Column: Top Category Budget Progress Bars */}
          <div className="lg:col-span-7">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Категории с дефиниран бюджет
              </span>
              <span className="text-xs text-slate-400">
                Разход / Лимит
              </span>
            </div>

            {budgetData.categoryStatuses.length === 0 ? (
              <div className="p-6 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-medium">Все още няма въведени лимити по категории.</p>
                <button
                  onClick={() => onNavigateTab?.("budgets")}
                  className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                >
                  + Задай месечни лимити
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                {budgetData.categoryStatuses.map((cat, idx) => {
                  const pct = cat.percentage;
                  const categoryName = cat.budget.categoryName || cat.budget.categoryId;
                  return (
                    <div
                      key={cat.budget.id || idx}
                      className="p-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {categoryName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            €{cat.spent.toFixed(2)}
                          </span>
                          <span className="text-slate-400">/ €{cat.limit.toFixed(2)}</span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                              cat.status === "green"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : cat.status === "yellow"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            }`}
                          >
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            cat.status === "green"
                              ? "bg-emerald-500"
                              : cat.status === "yellow"
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        <span>
                          {cat.isExceeded ? (
                            <span className="text-rose-600 dark:text-rose-400 font-semibold">
                              Превишен с €{cat.overspentAmount.toFixed(2)}
                            </span>
                          ) : (
                            <span>Остават €{cat.remaining.toFixed(2)}</span>
                          )}
                        </span>
                        <span>
                          {cat.status === "green"
                            ? "Зелена зона"
                            : cat.status === "yellow"
                            ? "Жълта зона"
                            : "Червена зона"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
