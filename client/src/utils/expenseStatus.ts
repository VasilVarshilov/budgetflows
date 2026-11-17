import { ExpenseItem, ExpenseStatus } from "@/types";

/**
 * Universal completion resolver for both Expenses and Incomes.
 * - Explicit boolean `completed` always wins.
 * - Backward-compatible with v1 `status === "planned"` (resolves to false).
 * - Legacy records without `completed` or `status` default to `true` (Realized).
 */
export function isRecordCompleted(
  item?: Pick<ExpenseItem, "completed" | "status"> | null
): boolean {
  if (!item) return true;
  if (typeof item.completed === "boolean") {
    return item.completed;
  }
  if (item.status === "planned") {
    return false;
  }
  return true;
}

export function isRecordUpcoming(
  item?: Pick<ExpenseItem, "completed" | "status"> | null
): boolean {
  return !isRecordCompleted(item);
}

/**
 * Resolves the effective status of an expense or income item.
 */
export function getExpenseStatus(
  item?: Pick<ExpenseItem, "completed" | "status"> | null
): ExpenseStatus {
  return isRecordCompleted(item) ? "completed" : "planned";
}

export function isPlannedExpense(
  item?: Pick<ExpenseItem, "completed" | "status"> | null
): boolean {
  return !isRecordCompleted(item);
}

export function isCompletedExpense(
  item?: Pick<ExpenseItem, "completed" | "status"> | null
): boolean {
  return isRecordCompleted(item);
}

/**
 * Sets universal completion state while keeping legacy `status` and `completedAt` in sync.
 */
export function setRecordCompleted<T extends ExpenseItem>(
  item: T,
  completed: boolean
): T {
  const nowIso = new Date().toISOString();
  return {
    ...item,
    completed,
    status: completed ? "completed" : "planned",
    completedAt: completed ? item.completedAt || nowIso : undefined,
  };
}

/**
 * Toggles (or explicitly sets) completion state on an ExpenseItem or IncomeItem.
 */
export function toggleRecordCompletion<T extends ExpenseItem>(
  item: T,
  explicitCompleted?: boolean
): T {
  const nextCompleted =
    typeof explicitCompleted === "boolean"
      ? explicitCompleted
      : !isRecordCompleted(item);
  return setRecordCompleted(item, nextCompleted);
}

/**
 * Transitions a planned/upcoming record to completed and records the completion timestamp.
 */
export function approvePlannedExpense<T extends ExpenseItem>(item: T): T {
  return setRecordCompleted(item, true);
}
