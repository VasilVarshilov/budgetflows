import React, { useEffect, useMemo, useState } from "react";
import {
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
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { userStorage } from "@/utils/userStorage";
import { SavingsGoalCardsCarousel } from "./SavingsGoalCardsCarousel";
import { translateGoalName, useI18n } from "@/i18n";

const STORAGE_BASE_SAVINGS_GOAL_CARD_ORDER = "SavingsGoalCardOrder";

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
  const { t, language } = useI18n();
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

  // Delete Confirmation State (regular goals only)
  const [deleteGoalTarget, setDeleteGoalTarget] = useState<SavingsGoal | null>(null);

  // Swipeable goal card carousel state & persisted order
  const [cardOrderIds, setCardOrderIds] = useState<string[]>(() => {
    const raw = userStorage.getJSON<unknown>(STORAGE_BASE_SAVINGS_GOAL_CARD_ORDER, []);
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  });
  const [activeGoalId, setActiveGoalId] = useState<string>("");

  useEffect(() => {
    const syncGoals = () => {
      setGoals(loadSavingsGoals());
      const rawOrder = userStorage.getJSON<unknown>(STORAGE_BASE_SAVINGS_GOAL_CARD_ORDER, []);
      setCardOrderIds(
        Array.isArray(rawOrder) ? rawOrder.filter((v): v is string => typeof v === "string") : []
      );
    };
    const handleAccountChanged = () => {
      syncGoals();
      setActiveGoalId("");
    };
    window.addEventListener(SAVINGS_GOALS_UPDATED_EVENT, syncGoals);
    window.addEventListener("homebudget:data-restored", syncGoals);
    window.addEventListener("budgetflows:account-changed", handleAccountChanged);
    window.addEventListener("storage", syncGoals);
    return () => {
      window.removeEventListener(SAVINGS_GOALS_UPDATED_EVENT, syncGoals);
      window.removeEventListener("homebudget:data-restored", syncGoals);
      window.removeEventListener("budgetflows:account-changed", handleAccountChanged);
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

  const orderedRegularGoals = useMemo(() => {
    const byId = new Map(regularActiveGoals.map((g) => [g.id, g]));
    const seen = new Set<string>();
    const ordered: SavingsGoal[] = [];

    for (const id of cardOrderIds) {
      const goal = byId.get(id);
      if (goal && !seen.has(id)) {
        seen.add(id);
        ordered.push(goal);
      }
    }

    for (const goal of regularActiveGoals) {
      if (!seen.has(goal.id)) {
        seen.add(goal.id);
        ordered.push(goal);
      }
    }

    return ordered;
  }, [regularActiveGoals, cardOrderIds]);

  const resolvedActiveGoalId = useMemo(() => {
    if (
      activeGoalId &&
      orderedRegularGoals.some((g) => g.id === activeGoalId)
    ) {
      return activeGoalId;
    }
    return orderedRegularGoals[0]?.id || "";
  }, [activeGoalId, orderedRegularGoals]);

  const handleChangeGoalOrder = (nextIds: string[]) => {
    const unique = Array.from(new Set(nextIds));
    setCardOrderIds(unique);
    userStorage.setJSON(STORAGE_BASE_SAVINGS_GOAL_CARD_ORDER, unique);
  };

  const handleResetGoalOrder = () => {
    setCardOrderIds([]);
    userStorage.setJSON(STORAGE_BASE_SAVINGS_GOAL_CARD_ORDER, []);
  };

  const persistGoals = (next: SavingsGoal[]) => {
    const saved = saveSavingsGoals(next);
    setGoals(saved);
    onTriggerSync?.();
  };

  const handleConfirmDeleteGoal = () => {
    if (!deleteGoalTarget || deleteGoalTarget.isEmergencyFund) {
      setDeleteGoalTarget(null);
      return;
    }
    const deletedId = deleteGoalTarget.id;
    const prevIdx = orderedRegularGoals.findIndex((g) => g.id === deletedId);
    persistGoals(deleteSavingsGoalPermanently(goals, deletedId));

    const nextOrder = cardOrderIds.filter((oid) => oid !== deletedId);
    if (nextOrder.length !== cardOrderIds.length) {
      setCardOrderIds(nextOrder);
      userStorage.setJSON(STORAGE_BASE_SAVINGS_GOAL_CARD_ORDER, nextOrder);
    }

    if (resolvedActiveGoalId === deletedId) {
      const remaining = orderedRegularGoals.filter((g) => g.id !== deletedId);
      const fallbackIdx = Math.max(0, Math.min(prevIdx, remaining.length - 1));
      setActiveGoalId(remaining[fallbackIdx]?.id || "");
    }

    setDeleteGoalTarget(null);
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
      });
      if (!res.ok) {
        setGoalFormError(res.error || t("savings.errors.invalidData"));
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
      setGoalFormError(res.error || t("savings.errors.createGoalFailed"));
      return;
    }
    persistGoals(res.goals);
    const createdGoal = res.goals[res.goals.length - 1];
    if (createdGoal && !createdGoal.isEmergencyFund) {
      setActiveGoalId(createdGoal.id);
    }
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
      setFundError(t("savings.errors.invalidPositiveAmount"));
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
        setFundError(res.error || t("savings.errors.allocateFailed"));
        return;
      }
      persistGoals(res.goals);
      setFundModal(null);
    } else {
      const res = withdrawFromSavingsGoal(goals, fundModal.goal.id, parsed);
      if (!res.ok) {
        setFundError(res.error || t("savings.errors.withdrawFailed"));
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
                {t("savings.emergencyEmptyTitle")}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {summary.averageMonthlyExpenses > 0
                  ? t("savings.emergencyEmptyAvgDesc", {
                      avg: summary.averageMonthlyExpenses.toFixed(2),
                    })
                  : t("savings.emergencyEmptyNoAvgDesc")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openCreateGoalModal(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t("savings.createEmergencyBtn")}</span>
          </button>
        </div>
      );
    }

    const pct = getGoalProgressPercent(ef);
    const remaining = Math.max(0, ef.targetAmount - ef.allocatedAmount);
    const displayEfName = translateGoalName(ef.name, true, language);
    const displayEfDesc =
      ef.description ===
      "Финансов буфер за непредвидени разходи (препоръчително 3–6 месеца разходи)"
        ? t("savings.emergencyDefaultDesc")
        : ef.description;

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
                  {displayEfName}
                </h4>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                  {pct.toFixed(1)}%
                </span>
              </div>
              {displayEfDesc && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {displayEfDesc}
                </p>
              )}
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
                {summary.emergencyCoverageMonths !== null
                  ? t("savings.coverageMonthsDetail", {
                      months: summary.emergencyCoverageMonths.toFixed(1),
                      avg: summary.averageMonthlyExpenses.toFixed(2),
                    })
                  : t("savings.coverageAddExpensesHint")}
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
              <span>{t("savings.emergencyAddBtn")}</span>
            </button>
            <button
              type="button"
              onClick={() => openFundModal(ef, "withdraw")}
              disabled={ef.allocatedAmount <= 0}
              className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-45 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{t("savings.emergencyWithdrawBtn")}</span>
            </button>
            <button
              type="button"
              onClick={() => openEditGoalModal(ef)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={t("savings.goalModal.editEmergencyShort")}
              aria-label={t("savings.goalModal.editEmergencyShort")}
            >
              <Pencil className="w-4 h-4" />
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
              {t("savings.allocatedShort")}:{" "}
              <strong className="text-slate-900 dark:text-white">
                €{ef.allocatedAmount.toFixed(2)}
              </strong>
            </span>
            <span>
              {t("savings.targetShort")}:{" "}
              <strong className="text-slate-900 dark:text-white">
                €{ef.targetAmount.toFixed(2)}
              </strong>
            </span>
            <span>
              {t("savings.remainingShort")}:{" "}
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
            {t("savings.goalsJarsTitle")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t("savings.goalsJarsSubtitle")}
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
                ? t("savings.hideArchivedBtn")
                : t("savings.archivedCountBtn", { count: summary.archivedGoals.length })}
            </button>
          )}
          <button
            type="button"
            onClick={() => openCreateGoalModal(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t("savings.newGoalBtn")}</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            {t("savings.summaryTotalSavings")}
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-1 block">
            €{summary.totalSavings.toFixed(2)}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            {t("savings.summaryOtherGoalsAllocated")}
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1 block">
            €{summary.otherGoalsAllocated.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {t("savings.summaryTotalAllocated", {
              amount: summary.totalAllocated.toFixed(2),
            })}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            {t("savings.emergencyFundTitle")}
          </span>
          <span className="text-lg sm:text-xl font-extrabold text-blue-700 dark:text-blue-400 tabular-nums mt-1 block">
            €{summary.emergencyFundAllocated.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {summary.emergencyCoverageMonths !== null
              ? t("savings.coverageShort", {
                  months: summary.emergencyCoverageMonths.toFixed(1),
                })
              : t("savings.noExpenseDataShort")}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            {t("savings.summaryUnallocatedSavings")}
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
            {t("savings.overAllocatedNotice")}{" "}
            <strong className="tabular-nums">€{summary.overAllocatedAmount.toFixed(2)}</strong>.{" "}
            {t("savings.overAllocatedAction")}
          </span>
        </div>
      )}

      {/* Dedicated Fixed Emergency Fund Section (Always Visible Above Goals) */}
      <div className="space-y-2.5">
        <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>{t("savings.emergencyFundTitle")}</span>
        </h4>
        {renderEmergencyCard()}
      </div>

      {/* Regular Savings Goals Swipe Cards Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t("savings.goalsGroupTitle")}</span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
              · {orderedRegularGoals.length}
            </span>
          </h4>
        </div>

        {orderedRegularGoals.length > 0 ? (
          <SavingsGoalCardsCarousel
            goals={orderedRegularGoals}
            activeGoalId={resolvedActiveGoalId}
            onSelectGoal={setActiveGoalId}
            onChangeOrder={handleChangeGoalOrder}
            onResetOrder={handleResetGoalOrder}
            renderCard={(goal) => {
              const pct = getGoalProgressPercent(goal);
              const remaining = Math.max(0, goal.targetAmount - goal.allocatedAmount);
              return (
                <div className="bg-white dark:bg-[#16181d] border border-slate-200/90 dark:border-slate-800/90 rounded-3xl p-5 sm:p-6 shadow-2xs flex flex-col justify-between gap-4">
                  {/* Card Top: Icon, Title, Description, Edit & Delete */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Target className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4
                            className="font-bold text-slate-900 dark:text-white text-base sm:text-lg leading-snug truncate"
                            title={goal.name}
                          >
                            {goal.name}
                          </h4>
                          <span className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                        {goal.description && (
                          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                            {goal.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditGoalModal(goal)}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title={t("savings.goalEditTooltip")}
                        aria-label={t("savings.goalEditTooltip")}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteGoalTarget(goal)}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title={t("savings.goalDeleteTooltip")}
                        aria-label={t("savings.goalDeleteTooltip")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 pt-1 text-xs tabular-nums">
                      <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-700/70">
                        <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">
                          {t("savings.allocatedShort")}
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base mt-0.5 block">
                          €{goal.allocatedAmount.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-700/70">
                        <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">
                          {t("savings.targetShort")}
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base mt-0.5 block">
                          €{goal.targetAmount.toFixed(2)}
                        </span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-700/70 text-right">
                        <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">
                          {t("savings.remainingShort")}
                        </span>
                        <span className="font-extrabold text-emerald-700 dark:text-emerald-400 text-sm sm:text-base mt-0.5 block">
                          €{remaining.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Actions: Add / Withdraw */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => openFundModal(goal, "allocate")}
                      disabled={summary.unallocatedSavings <= 0}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>{t("savings.goalAddBtn")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openFundModal(goal, "withdraw")}
                      disabled={goal.allocatedAmount <= 0}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-45 text-slate-700 dark:text-slate-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      <span>{t("savings.goalWithdrawBtn")}</span>
                    </button>
                  </div>
                </div>
              );
            }}
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 space-y-3">
            <p>
              {t("savings.emptyJarsDesc")}
            </p>
            <button
              type="button"
              onClick={() => openCreateGoalModal(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t("savings.createFirstGoalBtn")}</span>
            </button>
          </div>
        )}
      </div>

      {/* Archived Goals Drawer */}
      {showArchived && summary.archivedGoals.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
          <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
            {t("savings.archivedGoalsHeading", { count: summary.archivedGoals.length })}
          </h4>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {summary.archivedGoals.map((ag) => (
              <div key={ag.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                    {translateGoalName(ag.name, Boolean(ag.isEmergencyFund), language)}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                    {t("savings.targetShort")}: €{ag.targetAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => persistGoals(unarchiveSavingsGoal(goals, ag.id))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    <span>{t("savings.restoreBtn")}</span>
                  </button>
                  {!ag.isEmergencyFund && (
                    <button
                      type="button"
                      onClick={() => persistGoals(deleteSavingsGoalPermanently(goals, ag.id))}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      title={t("savings.deleteForeverTooltip")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
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
                {editingGoalId
                  ? goalIsEmergency
                    ? t("savings.goalModal.editEmergencyShort")
                    : t("savings.goalModal.editGoalShort")
                  : goalIsEmergency
                  ? t("savings.goalModal.createEmergencyTitle")
                  : t("savings.goalModal.createGoalShort")}
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
              {!goalIsEmergency && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t("savings.goalModal.nameLabel")}
                  </label>
                  <input
                    type="text"
                    required
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    placeholder={t("savings.goalModal.shortNamePlaceholder")}
                    className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t("savings.goalModal.targetAmountLabel")}
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
                      {t("savings.goalModal.initialAllocationLabel")}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={goalInitialAllocation}
                      onChange={(e) =>
                        setGoalInitialAllocation(sanitizeDecimalInput(e.target.value))
                      }
                      placeholder={t("savings.goalModal.maxUnallocatedPlaceholder", {
                        amount: summary.unallocatedSavings.toFixed(2),
                      })}
                      className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t("savings.goalModal.descriptionLabel")}
                </label>
                <input
                  type="text"
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  placeholder={t("savings.goalModal.descriptionPlaceholder")}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

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
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
                >
                  {editingGoalId ? t("common.save") : t("savings.goalModal.createBtn")}
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
                  ? t("savings.fundModal.addTitle", {
                      name: translateGoalName(
                        fundModal.goal.name,
                        Boolean(fundModal.goal.isEmergencyFund),
                        language
                      ),
                    })
                  : t("savings.fundModal.withdrawTitle", {
                      name: translateGoalName(
                        fundModal.goal.name,
                        Boolean(fundModal.goal.isEmergencyFund),
                        language
                      ),
                    })}
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
                    {t("savings.fundModal.availableUnallocated")}{" "}
                    <strong className="text-slate-900 dark:text-white">
                      €{summary.unallocatedSavings.toFixed(2)}
                    </strong>
                  </>
                ) : (
                  <>
                    {t("savings.fundModal.allocatedInGoal")}{" "}
                    <strong className="text-slate-900 dark:text-white">
                      €{fundModal.goal.allocatedAmount.toFixed(2)}
                    </strong>
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t("savings.fundModal.amountLabel")}
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
                          {ratio === 1 ? t("savings.fundModal.maxPreset") : `${ratio * 100}%`} (€{preset.toFixed(0)})
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
                          {t("savings.fundModal.upToGoalBtn")}
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
                        {ratio === 1 ? t("savings.fundModal.allBtn") : `${ratio * 100}%`} (€{preset.toFixed(0)})
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
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
                >
                  {t("savings.fundModal.confirmBtn")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Goal Confirmation Dialog */}
      <ConfirmDeleteDialog
        isOpen={Boolean(deleteGoalTarget)}
        title={t("common.confirm")}
        message={t("savings.goalDeleteConfirmMsg")}
        detailLabel={
          deleteGoalTarget
            ? translateGoalName(
                deleteGoalTarget.name,
                Boolean(deleteGoalTarget.isEmergencyFund),
                language
              )
            : undefined
        }
        cancelLabel={t("common.cancel")}
        confirmLabel={t("common.delete")}
        onCancel={() => setDeleteGoalTarget(null)}
        onConfirm={handleConfirmDeleteGoal}
      />
    </section>
  );
};
