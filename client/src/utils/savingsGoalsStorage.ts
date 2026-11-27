import { IncomeItem, MonthlyRecord, SavingsGoal } from "@/types";
import { isCompletedExpense } from "./expenseStatus";
import { STORAGE_BASE_SAVINGS_GOALS, userStorage } from "./userStorage";
import { t } from "@/i18n/helpers";

export const SAVINGS_GOALS_UPDATED_EVENT = "homebudget:savings-goals-updated";
export const EMERGENCY_FUND_TARGET_MONTHS = 6;
export const EMERGENCY_FUND_DEFAULT_DESCRIPTION =
  "За непредвидени разходи (Препоръчителен период от 6 месеца)";

function roundCurrency(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function normalizeSavingsGoal(raw: any): SavingsGoal | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!id || !name) return null;

  const targetAmount = Math.max(0, Number(raw.targetAmount) || 0);
  const allocatedAmount = Math.max(0, Number(raw.allocatedAmount) || 0);
  const nowIso = new Date().toISOString();

  return {
    id,
    name,
    targetAmount: roundCurrency(targetAmount),
    allocatedAmount: roundCurrency(allocatedAmount),
    description: typeof raw.description === "string" ? raw.description.trim() || undefined : undefined,
    isEmergencyFund: Boolean(raw.isEmergencyFund),
    archived: Boolean(raw.archived),
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : nowIso,
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : nowIso,
  };
}

export function loadSavingsGoals(uid?: string): SavingsGoal[] {
  const rawList = userStorage.getJSON<unknown[]>(STORAGE_BASE_SAVINGS_GOALS, [], uid);
  if (!Array.isArray(rawList)) return [];

  const seenIds = new Set<string>();
  const goals: SavingsGoal[] = [];
  let hasEmergency = false;

  for (const entry of rawList) {
    const normalized = normalizeSavingsGoal(entry);
    if (!normalized || seenIds.has(normalized.id)) continue;
    seenIds.add(normalized.id);

    // Ensure at most one active dedicated Emergency Fund goal
    if (normalized.isEmergencyFund && !normalized.archived) {
      if (hasEmergency) {
        normalized.isEmergencyFund = false;
      } else {
        hasEmergency = true;
      }
    }
    goals.push(normalized);
  }

  return goals;
}

export function saveSavingsGoals(goals: SavingsGoal[], uid?: string): SavingsGoal[] {
  const sanitized = goals
    .map((g) => normalizeSavingsGoal(g))
    .filter((g): g is SavingsGoal => g !== null);

  userStorage.setJSON(STORAGE_BASE_SAVINGS_GOALS, sanitized, uid);
  userStorage.markLocalModified(uid);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SAVINGS_GOALS_UPDATED_EVENT));
  }

  return sanitized;
}

/**
 * Computes net Total Savings balance from the global savings ledger.
 */
export function calculateTotalSavingsBalance(savingsData: IncomeItem[]): number {
  let balance = 0;
  for (const item of savingsData || []) {
    const amount = Number(item.amount) || 0;
    if (item.type === "expense") {
      balance -= amount;
    } else {
      balance += amount;
    }
  }
  return roundCurrency(balance);
}

/**
 * Computes Average Monthly Expenses across all recorded months that have > 0 completed expenses.
 * Only Completed expenses count (planned/upcoming items are excluded).
 */
export function calculateAverageMonthlyExpenses(
  monthlyData: Record<string, MonthlyRecord>
): number {
  const monthlyTotals: number[] = [];

  for (const record of Object.values(monthlyData || {})) {
    const fixed = (record?.expenses?.fixed_expenses || []).filter(isCompletedExpense);
    const additional = (record?.expenses?.additional_expenses || []).filter(isCompletedExpense);
    const total =
      fixed.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) +
      additional.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    if (total > 0) {
      monthlyTotals.push(total);
    }
  }

  if (monthlyTotals.length === 0) return 0;
  const sum = monthlyTotals.reduce((a, b) => a + b, 0);
  return roundCurrency(sum / monthlyTotals.length);
}

export interface SavingsAllocationSummary {
  totalSavings: number;
  activeGoals: SavingsGoal[];
  archivedGoals: SavingsGoal[];
  emergencyFundGoal: SavingsGoal | null;
  emergencyFundAllocated: number;
  otherGoalsAllocated: number;
  totalAllocated: number;
  unallocatedSavings: number;
  overAllocatedAmount: number;
  averageMonthlyExpenses: number;
  emergencyCoverageMonths: number | null;
}

export function computeSavingsAllocationSummary(
  savingsData: IncomeItem[],
  goals: SavingsGoal[],
  monthlyData: Record<string, MonthlyRecord> = {}
): SavingsAllocationSummary {
  const totalSavings = calculateTotalSavingsBalance(savingsData);
  const rawActiveGoals = goals.filter((g) => !g.archived);
  const archivedGoals = goals.filter((g) => Boolean(g.archived));

  const averageMonthlyExpenses = calculateAverageMonthlyExpenses(monthlyData);
  const rawEmergencyGoal = rawActiveGoals.find((g) => Boolean(g.isEmergencyFund)) || null;
  const emergencyFundGoal = rawEmergencyGoal
    ? {
        ...rawEmergencyGoal,
        targetAmount:
          averageMonthlyExpenses > 0
            ? roundCurrency(averageMonthlyExpenses * EMERGENCY_FUND_TARGET_MONTHS)
            : rawEmergencyGoal.targetAmount,
      }
    : null;
  const activeGoals = emergencyFundGoal
    ? rawActiveGoals.map((g) => (g.id === emergencyFundGoal.id ? emergencyFundGoal : g))
    : rawActiveGoals;

  const emergencyFundAllocated = emergencyFundGoal
    ? roundCurrency(emergencyFundGoal.allocatedAmount)
    : 0;

  const otherGoalsAllocated = roundCurrency(
    activeGoals
      .filter((g) => g.id !== emergencyFundGoal?.id)
      .reduce((sum, g) => sum + (Number(g.allocatedAmount) || 0), 0)
  );

  const totalAllocated = roundCurrency(emergencyFundAllocated + otherGoalsAllocated);
  const rawUnallocated = roundCurrency(totalSavings - totalAllocated);
  const unallocatedSavings = Math.max(0, rawUnallocated);
  const overAllocatedAmount = rawUnallocated < 0 ? roundCurrency(Math.abs(rawUnallocated)) : 0;

  const emergencyCoverageMonths =
    averageMonthlyExpenses > 0
      ? Math.round((emergencyFundAllocated / averageMonthlyExpenses) * 10) / 10
      : null;

  return {
    totalSavings,
    activeGoals,
    archivedGoals,
    emergencyFundGoal,
    emergencyFundAllocated,
    otherGoalsAllocated,
    totalAllocated,
    unallocatedSavings,
    overAllocatedAmount,
    averageMonthlyExpenses,
    emergencyCoverageMonths,
  };
}

export function getGoalProgressPercent(goal: Pick<SavingsGoal, "allocatedAmount" | "targetAmount">): number {
  if (!goal.targetAmount || goal.targetAmount <= 0) {
    return goal.allocatedAmount > 0 ? 100 : 0;
  }
  const pct = (goal.allocatedAmount / goal.targetAmount) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}

export interface GoalOperationResult {
  ok: boolean;
  error?: string;
  goals: SavingsGoal[];
}

export function createSavingsGoal(
  goals: SavingsGoal[],
  totalSavings: number,
  input: {
    name: string;
    targetAmount: number;
    initialAllocation?: number;
    description?: string;
    isEmergencyFund?: boolean;
  }
): GoalOperationResult {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: t("savings.errors.emptyGoalName"), goals };
  }
  const targetAmount = roundCurrency(Number(input.targetAmount) || 0);
  if (targetAmount <= 0) {
    return { ok: false, error: t("savings.errors.invalidTargetAmount"), goals };
  }

  const initialAllocation = roundCurrency(Math.max(0, Number(input.initialAllocation) || 0));
  const summary = computeSavingsAllocationSummary(
    [{ id: "_tmp", amount: totalSavings, categoryId: "", categoryName: "", categoryIcon: "", categoryColor: "", date: "", type: "income" }],
    goals
  );

  if (initialAllocation > summary.unallocatedSavings + 0.0001) {
    return {
      ok: false,
      error: t("savings.errors.exceedsUnallocated", {
        available: summary.unallocatedSavings.toFixed(2),
      }),
      goals,
    };
  }

  const nowIso = new Date().toISOString();
  const wantEmergency = Boolean(input.isEmergencyFund);
  const alreadyHasEmergency = goals.some((g) => !g.archived && g.isEmergencyFund);

  const newGoal: SavingsGoal = {
    id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    targetAmount,
    allocatedAmount: initialAllocation,
    description: input.description?.trim() || undefined,
    isEmergencyFund: wantEmergency && !alreadyHasEmergency,
    archived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return { ok: true, goals: [...goals, newGoal] };
}

export function allocateToSavingsGoal(
  goals: SavingsGoal[],
  goalId: string,
  amount: number,
  totalSavings: number
): GoalOperationResult {
  const value = roundCurrency(Number(amount) || 0);
  if (value <= 0) {
    return { ok: false, error: t("savings.errors.invalidAmount"), goals };
  }

  const target = goals.find((g) => g.id === goalId && !g.archived);
  if (!target) {
    return { ok: false, error: t("savings.errors.goalNotFound"), goals };
  }

  const totalAllocated = roundCurrency(
    goals
      .filter((g) => !g.archived)
      .reduce((sum, g) => sum + (Number(g.allocatedAmount) || 0), 0)
  );
  const unallocated = roundCurrency(Math.max(0, totalSavings - totalAllocated));

  if (value > unallocated + 0.0001) {
    return {
      ok: false,
      error: t("savings.errors.exceedsUnallocatedMax", {
        available: unallocated.toFixed(2),
      }),
      goals,
    };
  }

  const nowIso = new Date().toISOString();
  const nextGoals = goals.map((g) =>
    g.id === goalId
      ? {
          ...g,
          allocatedAmount: roundCurrency(g.allocatedAmount + value),
          updatedAt: nowIso,
        }
      : g
  );

  return { ok: true, goals: nextGoals };
}

export function withdrawFromSavingsGoal(
  goals: SavingsGoal[],
  goalId: string,
  amount: number
): GoalOperationResult {
  const value = roundCurrency(Number(amount) || 0);
  if (value <= 0) {
    return { ok: false, error: t("savings.errors.invalidAmount"), goals };
  }

  const target = goals.find((g) => g.id === goalId && !g.archived);
  if (!target) {
    return { ok: false, error: t("savings.errors.goalNotFound"), goals };
  }

  if (value > target.allocatedAmount + 0.0001) {
    return {
      ok: false,
      error: t("savings.errors.exceedsAllocatedGoal", {
        name: target.isEmergencyFund ? t("savings.emergencyFundTitle") : target.name,
        available: target.allocatedAmount.toFixed(2),
      }),
      goals,
    };
  }

  const nowIso = new Date().toISOString();
  const nextGoals = goals.map((g) =>
    g.id === goalId
      ? {
          ...g,
          allocatedAmount: roundCurrency(Math.max(0, g.allocatedAmount - value)),
          updatedAt: nowIso,
        }
      : g
  );

  return { ok: true, goals: nextGoals };
}

export function updateSavingsGoalDetails(
  goals: SavingsGoal[],
  goalId: string,
  updates: {
    name: string;
    targetAmount: number;
    description?: string;
    isEmergencyFund?: boolean;
  }
): GoalOperationResult {
  const name = updates.name.trim();
  if (!name) {
    return { ok: false, error: t("savings.errors.emptyGoalName"), goals };
  }
  const targetAmount = roundCurrency(Number(updates.targetAmount) || 0);
  if (targetAmount <= 0) {
    return { ok: false, error: t("savings.errors.invalidTargetAmount"), goals };
  }

  const nowIso = new Date().toISOString();
  const anotherEmergency = goals.some(
    (g) => g.id !== goalId && !g.archived && g.isEmergencyFund
  );

  const nextGoals = goals.map((g) => {
    if (g.id !== goalId) return g;
    const allowEmergency =
      updates.isEmergencyFund !== undefined
        ? Boolean(updates.isEmergencyFund) && !anotherEmergency
        : g.isEmergencyFund;
    return {
      ...g,
      name,
      targetAmount,
      description: updates.description?.trim() || undefined,
      isEmergencyFund: allowEmergency,
      updatedAt: nowIso,
    };
  });

  return { ok: true, goals: nextGoals };
}

/**
 * Archives a goal and releases its allocated amount back to Unallocated Savings (allocatedAmount -> 0).
 */
export function archiveSavingsGoal(goals: SavingsGoal[], goalId: string): SavingsGoal[] {
  const nowIso = new Date().toISOString();
  return goals.map((g) =>
    g.id === goalId
      ? {
          ...g,
          archived: true,
          allocatedAmount: 0,
          updatedAt: nowIso,
        }
      : g
  );
}

export function unarchiveSavingsGoal(goals: SavingsGoal[], goalId: string): SavingsGoal[] {
  const nowIso = new Date().toISOString();
  const hasActiveEmergency = goals.some((g) => !g.archived && g.isEmergencyFund);
  return goals.map((g) =>
    g.id === goalId
      ? {
          ...g,
          archived: false,
          isEmergencyFund: g.isEmergencyFund && !hasActiveEmergency,
          updatedAt: nowIso,
        }
      : g
  );
}

export function deleteSavingsGoalPermanently(goals: SavingsGoal[], goalId: string): SavingsGoal[] {
  return goals.filter((g) => g.id !== goalId);
}
