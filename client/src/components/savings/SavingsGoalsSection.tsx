import React, { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import { IncomeItem, MonthlyRecord, SavingsGoal } from "@/types";
import {
  allocateToSavingsGoal,
  archiveSavingsGoal,
  computeSavingsAllocationSummary,
  createSavingsGoal,
  deleteSavingsGoalPermanently,
  getGoalProgressPercent,
  loadSavingsGoals,
  SAVINGS_GOALS_UPDATED_EVENT,
  saveSavingsGoals,
  unarchiveSavingsGoal,
  updateSavingsGoalDetails,
  withdrawFromSavingsGoal,
} from "@/utils/savingsGoalsStorage";
import { parseDecimalInput, sanitizeDecimalInput } from "@/utils/formatting";

interface SavingsGoalsSectionProps {
  savingsData: IncomeItem[];
  monthlyData: Record<string, MonthlyRecord>;
  onTriggerSync?: () => void;
}

type FundActionMode = "allocate" | "withdraw";

export const SavingsGoalsSection: React.FC<SavingsGoalsSectionProps> = ({
  savingsData,
  monthlyData,
  onTriggerSync,
}) => {
  const [goals, setGoals] = useState<SavingsGoal[]>(() => loadSavingsGoals());
  const [showArchived, setShowArchived] = useState(false);

  // Create / Edit Goal Modal State
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalInitialAllocation, setGoalInitialAllocation] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [goalIsEmergency, setGoalIsEmergency] = useState(false);
  const [goalFormError, setGoalFormError] = useState<string | null>(null);

  // Allocate / Withdraw Modal State
  const [fundModal, setFundModal] = useState<{
    goal: SavingsGoal;
    mode: FundActionMode;
  } | null>(null);
  const [fundAmount, setFundAmount] = useState("");
  const [fundError, setFundError] = useState<string | null>(null);

  useEffect(() => {
    const syncGoals = () => {
      setGoals(loadSavingsGoals());
    };
    window.addEventListener(SAVINGS_GOALS_UPDATED_EVENT, syncGoals);
    window.addEventListener("storage", syncGoals);
    return () => {
      window.removeEventListener(SAVINGS_GOALS_UPDATED_EVENT, syncGoals);
      window.removeEventListener("storage", syncGoals);
    };
  }, []);

  const summary = useMemo(
    () => computeSavingsAllocationSummary(savingsData, goals, monthlyData),
    [savingsData, goals, monthlyData]
  );

  const regularActiveGoals = useMemo(
    () => summary.activeGoals.filter((g) => !g.isEmergencyFund),
    [summary.activeGoals]
  );

  const persistGoals = (next: SavingsGoal[]) => {
    const saved = saveSavingsGoals(next);
    setGoals(saved);
    onTriggerSync?.();
  };

  const openCreateGoalModal = (presetEmergency = false) => {
    setEditingGoalId(null);
    setGoalName(presetEmergency ? "Авариен фонд" : "");
    if (presetEmergency && summary.averageMonthlyExpenses > 0) {
      setGoalTarget((summary.averageMonthlyExpenses * 3).toFixed(0));
    } else {
      setGoalTarget("");
    }
    setGoalInitialAllocation("");
    setGoalDescription(
      presetEmergency
        ? "Финансов буфер за непредвидени разходи (препоръчително 3–6 месеца разходи)"
        : ""
    );
    setGoalIsEmergency(presetEmergency);
    setGoalFormError(null);
    setIsGoalModalOpen(true);
  };

  const openEditGoalModal = (goal: SavingsGoal) => {
    setEditingGoalId(goal.id);
    setGoalName(goal.name);
    setGoalTarget(goal.targetAmount > 0 ? String(goal.targetAmount) : "");
    setGoalInitialAllocation("");
    setGoalDescription(goal.description || "");
    setGoalIsEmergency(Boolean(goal.isEmergencyFund));
    setGoalFormError(null);
    setIsGoalModalOpen(true);
  };

  const handleSaveGoalModal = (e: React.FormEvent) => {
    e.preventDefault();
    setGoalFormError(null);
    const parsedTarget = parseDecimalInput(goalTarget);

    if (editingGoalId) {
      const res = updateSavingsGoalDetails(goals, editingGoalId, {
        name: goalName,
        targetAmount: parsedTarget,
        description: goalDescription,
        isEmergencyFund: goalIsEmergency,
      });
      if (!res.ok) {
        setGoalFormError(res.error || "Невалидни данни.");
        return;
      }
      persistGoals(res.goals);
      setIsGoalModalOpen(false);
      return;
    }

    const parsedInitial = goalInitialAllocation
      ? parseDecimalInput(goalInitialAllocation)
      : 0;
    const res = createSavingsGoal(goals, summary.totalSavings, {
      name: goalName,
      targetAmount: parsedTarget,
      initialAllocation: isNaN(parsedInitial) ? 0 : parsedInitial,
      description: goalDescription,
      isEmergencyFund: goalIsEmergency,
    });
    if (!res.ok) {
      setGoalFormError(res.error || "Грешка при създаване на цел.");
      return;
    }
    persistGoals(res.goals);
    setIsGoalModalOpen(false);
  };

  const openFundModal = (goal: SavingsGoal, mode: FundActionMode) => {
    setFundModal({ goal, mode });
    setFundAmount("");
    setFundError(null);
  };

  const handleSubmitFundAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundModal) return;
    setFundError(null);
    const parsed = parseDecimalInput(fundAmount);
    if (isNaN(parsed) || parsed <= 0) {
      setFundError("Моля, въведете валидна сума по-голяма от €0.");
      return;
    }

    if (fundModal.mode === "allocate") {
      const res = allocateToSavingsGoal(
        goals,
        fundModal.goal.id,
        parsed,
        summary.totalSavings
      );
      if (!res.ok) {
        setFundError(res.error || "Грешка при разпределяне.");
        return;
      }
      persistGoals(res.goals);
      setFundModal(null);
    } else {
      const res = withdrawFromSavingsGoal(goals, fundModal.goal.id, parsed);
      if (!res.ok) {
        setFundError(res.error || "Грешка при изтегляне.");
        return;
      }
      persistGoals(res.goals);
      setFundModal(null);
    }
  };

  const renderEmergencyCard = () => {
    const ef = summary.emergencyFundGoal;
    if (!ef) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                Авариен фонд (Emergency Fund)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {summary.averageMonthlyExpenses > 0
                  ? `Отделете част от спестяванията си за спешни случаи. Средният ви месечен разход е €${summary.averageMonthlyExpenses.toFixed(2)}.`
                  : "Създайте защитен резерв от съществуващите спестявания за непредвидени ситуации."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openCreateGoalModal(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Създай Авариен фонд</span>
          </button>
        </div>
      );
    }

    const pct = getGoalProgressPercent(ef);
    const remaining = Math.max(0, ef.targetAmount - ef.allocatedAmount);

    return (
      <div className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-slate-900 dark:text-white text-base">
                  {ef.name}
                </h4>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                  {pct.toFixed(1)}%
                </span>
              </div>
              {ef.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {ef.description}
                </p>
              )}
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
                {summary.emergencyCoverageMonths !== null
                  ? `Покритие: ${summary.emergencyCoverageMonths.toFixed(1)} месеца (при ср. месечен разход €${summary.averageMonthlyExpenses.toFixed(2)})`
                  : "Покритие: Добавете завършени разходи за изчисление на месечния буфер"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openFundModal(ef, "allocate")}
              disabled={summary.unallocatedSavings <= 0}
              className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] bg-blue-600 hover:bg-blue-700 disabled:opacity-45 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Разпредели</span>
            </button>
            <button
              type="button"
              onClick={() => openFundModal(ef, "withdraw")}
              disabled={ef.allocatedAmount <= 0}
              className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-45 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Освободи</span>
            </button>
            <button
              type="button"
              onClick={() => openEditGoalModal(ef)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Редактирай Авариен фонд"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => persistGoals(archiveSavingsGoal(goals, ef.id))}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Архивирай (освобождава сумата обратно към неразпределени)"
            >
              <Archive className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
            <span>
              Заделени:{" "}
              <strong className="text-slate-900 dark:text-white">
                €{ef.allocatedAmount.toFixed(2)}
              </strong>
            </span>
            <span>
              Цел:{" "}
              <strong className="text-slate-900 dark:text-white">
                €{ef.targetAmount.toFixed(2)}
              </strong>
            </span>
            <span>
              Остават:{" "}
              <strong className="text-slate-900 dark:text-white">
                €{remaining.toFixed(2)}
              </strong>
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Цели за спестяване („Касички“)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Разпределете наличните спестявания по виртуални цели без дублиране на баланса
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {summary.archivedGoals.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showArchived
                ? "Скрий архивирани"
                : `Архивирани (${summary.archivedGoals.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => openCreateGoalModal(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Нова цел</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Общо спестявания
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1 block">
            €{summary.totalSavings.toFixed(2)}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Разпределени по цели
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1 block">
            €{summary.otherGoalsAllocated.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            Общо заделени: €{summary.totalAllocated.toFixed(2)}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Авариен фонд
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-blue-700 dark:text-blue-400 tabular-nums mt-1 block">
            €{summary.emergencyFundAllocated.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {summary.emergencyCoverageMonths !== null
              ? `Покритие: ${summary.emergencyCoverageMonths.toFixed(1)} мес.`
              : "Няма данни за разходи"}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Неразпределени спестявания
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1 block">
            €{summary.unallocatedSavings.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Over-allocation notice (if user withdrew ledger savings below allocated jars) */}
      {summary.overAllocatedAmount > 0 && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span>
            Разпределените суми по цели надвишават текущия общ баланс на спестяванията с{" "}
            <strong className="tabular-nums">€{summary.overAllocatedAmount.toFixed(2)}</strong>.
            Освободете средства от някоя цел или добавете спестяване, за да възстановите баланса.
          </span>
        </div>
      )}

      {/* Dedicated Emergency Fund Jar */}
      {renderEmergencyCard()}

      {/* Custom Goal Jars Grid */}
      {regularActiveGoals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {regularActiveGoals.map((goal) => {
            const pct = getGoalProgressPercent(goal);
            const remaining = Math.max(0, goal.targetAmount - goal.allocatedAmount);
            return (
              <div
                key={goal.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                        {goal.name}
                      </h4>
                      {goal.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                          {goal.description}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                      {pct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1 pt-1 text-[11px] tabular-nums">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Заделени</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        €{goal.allocatedAmount.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">Цел</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        €{goal.targetAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 dark:text-slate-400 block">Остават</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        €{remaining.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openFundModal(goal, "allocate")}
                      disabled={summary.unallocatedSavings <= 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>Добави</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openFundModal(goal, "withdraw")}
                      disabled={goal.allocatedAmount <= 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-45 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Извади</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditGoalModal(goal)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Редактирай целта"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => persistGoals(archiveSavingsGoal(goals, goal.id))}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Архивирай (освобождава сумата)"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Все още нямате създадени цели за спестяване (напр. „Ваканция“, „Нов автомобил“, „Техника“).
        </div>
      )}

      {/* Archived Goals Drawer */}
      {showArchived && summary.archivedGoals.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
          <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
            Архивирани цели ({summary.archivedGoals.length})
          </h4>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {summary.archivedGoals.map((ag) => (
              <div key={ag.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                    {ag.name}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                    Цел: €{ag.targetAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => persistGoals(unarchiveSavingsGoal(goals, ag.id))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    <span>Възстанови</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => persistGoals(deleteSavingsGoalPermanently(goals, ag.id))}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                    title="Изтрий завинаги"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Goal Modal */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingGoalId ? "Редактирай цел" : "Нова цел за спестяване"}
              </h3>
              <button
                type="button"
                onClick={() => setIsGoalModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGoalModal} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Име на целта
                </label>
                <input
                  type="text"
                  required
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  placeholder="напр. Ваканция, Нов автомобил, Авариен фонд"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Целева сума (€)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(sanitizeDecimalInput(e.target.value))}
                    placeholder="3000"
                    className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                  />
                </div>

                {!editingGoalId && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Начално заделяне (€)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={goalInitialAllocation}
                      onChange={(e) =>
                        setGoalInitialAllocation(sanitizeDecimalInput(e.target.value))
                      }
                      placeholder={`Макс: €${summary.unallocatedSavings.toFixed(2)}`}
                      className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Описание (опционално)
                </label>
                <input
                  type="text"
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  placeholder="Кратко описание на целта..."
                  className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {(!summary.emergencyFundGoal ||
                summary.emergencyFundGoal.id === editingGoalId) && (
                <label className="flex items-center gap-2.5 pt-1 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={goalIsEmergency}
                    onChange={(e) => setGoalIsEmergency(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Отбележи като специален „Авариен фонд“ (изчислява покритие в месеци)</span>
                </label>
              )}

              {goalFormError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {goalFormError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGoalModalOpen(false)}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Отказ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
                >
                  {editingGoalId ? "Запази" : "Създай цел"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Allocate / Withdraw Funds Modal */}
      {fundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {fundModal.mode === "allocate"
                  ? `Разпредели към „${fundModal.goal.name}“`
                  : `Освободи от „${fundModal.goal.name}“`}
              </h3>
              <button
                type="button"
                onClick={() => setFundModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitFundAction} className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {fundModal.mode === "allocate" ? (
                  <>
                    Налични неразпределени спестявания:{" "}
                    <strong className="text-slate-900 dark:text-white">
                      €{summary.unallocatedSavings.toFixed(2)}
                    </strong>
                  </>
                ) : (
                  <>
                    Заделени в тази цел:{" "}
                    <strong className="text-slate-900 dark:text-white">
                      €{fundModal.goal.allocatedAmount.toFixed(2)}
                    </strong>
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Сума (€)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  autoFocus
                  value={fundAmount}
                  onChange={(e) => setFundAmount(sanitizeDecimalInput(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                />
              </div>

              {/* Quick Preset Percentages */}
              <div className="flex flex-wrap gap-1.5">
                {fundModal.mode === "allocate" ? (
                  <>
                    {[0.25, 0.5, 1].map((ratio) => {
                      const preset = Math.round(summary.unallocatedSavings * ratio * 100) / 100;
                      if (preset <= 0) return null;
                      return (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setFundAmount(preset.toFixed(2))}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 tabular-nums cursor-pointer"
                        >
                          {ratio === 1 ? "Макс" : `${ratio * 100}%`} (€{preset.toFixed(0)})
                        </button>
                      );
                    })}
                    {fundModal.goal.targetAmount > fundModal.goal.allocatedAmount &&
                      summary.unallocatedSavings > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const needed = Math.min(
                              summary.unallocatedSavings,
                              fundModal.goal.targetAmount - fundModal.goal.allocatedAmount
                            );
                            setFundAmount(needed.toFixed(2));
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 cursor-pointer"
                        >
                          До целта
                        </button>
                      )}
                  </>
                ) : (
                  [0.25, 0.5, 1].map((ratio) => {
                    const preset = Math.round(fundModal.goal.allocatedAmount * ratio * 100) / 100;
                    if (preset <= 0) return null;
                    return (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setFundAmount(preset.toFixed(2))}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 tabular-nums cursor-pointer"
                      >
                        {ratio === 1 ? "Всичко" : `${ratio * 100}%`} (€{preset.toFixed(0)})
                      </button>
                    );
                  })
                )}
              </div>

              {fundError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {fundError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFundModal(null)}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Отказ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
                >
                  Потвърди
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
