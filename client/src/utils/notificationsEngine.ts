import {
  AppNotification,
  ExpenseItem,
  IncomeItem,
  MonthlyRecord,
  NotificationStatus,
  NotificationsStoreState,
  SavingsGoal,
} from "@/types";
import { parseLocalDateKey, resolveRecordDateKey, toLocalDateKey } from "./calendarEngine";
import { isRecordCompleted } from "./expenseStatus";
import { areLocationsEqual, normalizeLocation } from "./locationUtils";
import { GeneratedRecurringItemMeta } from "./recurrenceEngine";
import { STORAGE_BASE_NOTIFICATIONS, userStorage } from "./userStorage";

export const NOTIFICATIONS_UPDATED_EVENT = "budgetflows:notifications-updated";
export const MANUAL_BACKUP_NOTIFICATION_EVENT = "budgetforce365:manual-backup-notification";

export type ManualBackupAction = "manual_backup" | "manual_restore";

export function dispatchManualBackupNotification(action: ManualBackupAction): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(MANUAL_BACKUP_NOTIFICATION_EVENT, {
        detail: { action, timestamp: new Date().toISOString() },
      })
    );
  }
}

const GOAL_MILESTONES = [50, 100] as const;
const MAX_NOTIFICATIONS_HISTORY = 200;

export function createEmptyNotificationsState(): NotificationsStoreState {
  return {
    notifications: [],
    suppressedKeys: {},
  };
}

export function formatNotificationAmount(amount: number): string {
  const safe = Number(amount) || 0;
  if (Math.abs(safe - Math.round(safe)) < 0.001) {
    return String(Math.round(safe));
  }
  return safe.toFixed(2);
}

export function formatBgDateFromIsoOrKey(value?: string): string {
  if (!value) return new Date().toLocaleDateString("bg-BG");
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseLocalDateKey(trimmed).toLocaleDateString("bg-BG");
  }
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString("bg-BG");
  }
  return new Date().toLocaleDateString("bg-BG");
}

export function diffDaysBetweenDateKeys(earlierKey: string, laterKey: string): number {
  const a = parseLocalDateKey(earlierKey);
  const b = parseLocalDateKey(laterKey);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function makeNotificationId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeNotification(raw: any): AppNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "";
  const dedupeKey = typeof raw.dedupeKey === "string" ? raw.dedupeKey.trim() : "";
  const type = typeof raw.type === "string" ? raw.type : "";
  const status = typeof raw.status === "string" ? raw.status : "unread";
  const title = typeof raw.title === "string" ? raw.title : "";
  const message = typeof raw.message === "string" ? raw.message : "";
  if (!id || !dedupeKey || !type || !title) return null;

  const validStatuses: NotificationStatus[] = ["unread", "read", "dismissed", "resolved"];
  const normalizedStatus: NotificationStatus = validStatuses.includes(status as NotificationStatus)
    ? (status as NotificationStatus)
    : "unread";

  const nowIso = new Date().toISOString();

  return {
    id,
    dedupeKey,
    type: type as AppNotification["type"],
    status: normalizedStatus,
    title,
    message,
    amount: typeof raw.amount === "number" ? raw.amount : undefined,
    categoryName: typeof raw.categoryName === "string" ? raw.categoryName : undefined,
    dueDateKey: typeof raw.dueDateKey === "string" ? raw.dueDateKey : undefined,
    location: normalizeLocation(raw.location),
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : nowIso,
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : nowIso,
    readAt: typeof raw.readAt === "string" ? raw.readAt : undefined,
    dismissedAt: typeof raw.dismissedAt === "string" ? raw.dismissedAt : undefined,
    resolvedAt: typeof raw.resolvedAt === "string" ? raw.resolvedAt : undefined,
    resolvedNote: typeof raw.resolvedNote === "string" ? raw.resolvedNote : undefined,
    target: raw.target && typeof raw.target === "object" ? raw.target : undefined,
  };
}

function capHistorySize(notifications: AppNotification[]): AppNotification[] {
  if (notifications.length <= MAX_NOTIFICATIONS_HISTORY) return notifications;
  const active = notifications.filter((n) => n.status === "unread" || n.status === "read");
  const inactive = notifications
    .filter((n) => n.status === "resolved" || n.status === "dismissed")
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));

  const remainingSlots = Math.max(0, MAX_NOTIFICATIONS_HISTORY - active.length);
  return [...active, ...inactive.slice(0, remainingSlots)];
}

export function loadNotificationsStore(uid?: string): NotificationsStoreState {
  const raw = userStorage.getJSON<any>(STORAGE_BASE_NOTIFICATIONS, null, uid);
  if (!raw || typeof raw !== "object") {
    return createEmptyNotificationsState();
  }

  const rawList = Array.isArray(raw.notifications) ? raw.notifications : [];
  const seenKeys = new Set<string>();
  const notifications: AppNotification[] = [];

  for (const item of rawList) {
    const normalized = normalizeNotification(item);
    if (!normalized || seenKeys.has(normalized.dedupeKey)) continue;
    // Prune low-value automatic background sync & auto-generated recurring batch spam
    if (normalized.type === "recurring_generated") continue;
    if (
      normalized.type === "backup_success" &&
      normalized.dedupeKey.startsWith("backup_drive:")
    ) {
      continue;
    }
    seenKeys.add(normalized.dedupeKey);
    notifications.push(normalized);
  }

  const suppressedKeys: Record<string, string> = {};
  if (raw.suppressedKeys && typeof raw.suppressedKeys === "object") {
    for (const [k, v] of Object.entries(raw.suppressedKeys)) {
      if (typeof k === "string" && typeof v === "string") {
        suppressedKeys[k] = v;
      }
    }
  }

  return {
    notifications: capHistorySize(notifications),
    suppressedKeys,
  };
}

export function saveNotificationsStore(
  state: NotificationsStoreState,
  uid?: string
): NotificationsStoreState {
  const sanitized: NotificationsStoreState = {
    notifications: capHistorySize(state.notifications),
    suppressedKeys: state.suppressedKeys || {},
  };

  userStorage.setJSON(STORAGE_BASE_NOTIFICATIONS, sanitized, uid);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
  }

  return sanitized;
}

interface ScannedTransaction {
  kind: "expense" | "income";
  recordListType: "fixed" | "additional" | "income";
  monthKey: string;
  item: ExpenseItem | IncomeItem;
  dueDateKey: string;
  completed: boolean;
  amount: number;
  categoryName: string;
}

function scanMonthlyTransactions(
  monthlyData: Record<string, MonthlyRecord>
): Map<string, ScannedTransaction> {
  const map = new Map<string, ScannedTransaction>();

  for (const [monthKey, record] of Object.entries(monthlyData || {})) {
    if (!record) continue;

    if (Array.isArray(record.expenses?.fixed_expenses)) {
      for (const item of record.expenses.fixed_expenses) {
        if (!item?.id) continue;
        map.set(`expense:${item.id}`, {
          kind: "expense",
          recordListType: "fixed",
          monthKey,
          item,
          dueDateKey: resolveRecordDateKey(item, monthKey),
          completed: isRecordCompleted(item),
          amount: Number(item.amount) || 0,
          categoryName: item.categoryName || "Разход",
        });
      }
    }

    if (Array.isArray(record.expenses?.additional_expenses)) {
      for (const item of record.expenses.additional_expenses) {
        if (!item?.id) continue;
        map.set(`expense:${item.id}`, {
          kind: "expense",
          recordListType: "additional",
          monthKey,
          item,
          dueDateKey: resolveRecordDateKey(item, monthKey),
          completed: isRecordCompleted(item),
          amount: Number(item.amount) || 0,
          categoryName: item.categoryName || "Разход",
        });
      }
    }

    if (Array.isArray(record.incomes)) {
      for (const inc of record.incomes) {
        if (!inc?.id || inc.type === "expense") continue;
        map.set(`income:${inc.id}`, {
          kind: "income",
          recordListType: "income",
          monthKey,
          item: inc,
          dueDateKey: resolveRecordDateKey(inc, monthKey),
          completed: isRecordCompleted(inc),
          amount: Number(inc.amount) || 0,
          categoryName: inc.categoryName || "Приход",
        });
      }
    }
  }

  return map;
}

function isTransactionAlertType(type: AppNotification["type"]): boolean {
  return (
    type === "upcoming_expense" ||
    type === "upcoming_income" ||
    type === "overdue_expense" ||
    type === "overdue_income"
  );
}

/**
 * Reconciles notifications against current `monthlyData` and `savingsGoals`:
 * 1. Generates due-today (`expectedDate === today`) and overdue (`expectedDate < today`) alerts.
 * 2. Deduplicates per transaction event and supersedes `due` alerts cleanly if overdue.
 * 3. Automatically resolves active alerts when `Completed = true`, deleted, or rescheduled.
 * 4. Checks Savings Goal milestones (25%, 50%, 75%, 100%) without duplicate firing.
 */
export function reconcileAllNotifications(
  prevState: NotificationsStoreState,
  params: {
    monthlyData: Record<string, MonthlyRecord>;
    goals?: SavingsGoal[];
    referenceDate?: Date;
  }
): { nextState: NotificationsStoreState; changed: boolean } {
  const refDate = params.referenceDate ? new Date(params.referenceDate) : new Date();
  const todayKey = toLocalDateKey(refDate);
  const nowIso = refDate.toISOString();

  const txMap = scanMonthlyTransactions(params.monthlyData || {});
  let changed = false;

  const nextNotifications: AppNotification[] = prevState.notifications.map((n) => ({ ...n }));
  const nextSuppressed: Record<string, string> = { ...prevState.suppressedKeys };

  const findIndexByDedupe = (key: string) =>
    nextNotifications.findIndex((n) => n.dedupeKey === key);

  // Track which overdue record keys are currently active so due-today alert won't double up
  const overdueRecordKeys = new Set<string>();
  Array.from(txMap.entries()).forEach(([recKey, tx]) => {
    if (!tx.completed && tx.dueDateKey < todayKey) {
      overdueRecordKeys.add(recKey);
    }
  });

  // A. Resolve or clean up existing active transaction notifications automatically
  for (let i = 0; i < nextNotifications.length; i++) {
    const n = nextNotifications[i];
    if (!isTransactionAlertType(n.type)) continue;
    if (n.status !== "unread" && n.status !== "read") continue;

    const recordId = n.target?.recordId;
    const recordKind = n.target?.kind === "income" ? "income" : "expense";
    if (!recordId) continue;

    const tx = txMap.get(`${recordKind}:${recordId}`);

    // Case 1: Transaction deleted
    if (!tx) {
      nextNotifications[i] = {
        ...n,
        status: "dismissed",
        dismissedAt: nowIso,
        updatedAt: nowIso,
        resolvedNote: "Записът е изтрит",
      };
      changed = true;
      continue;
    }

    // Case 2: Marked Completed = true from ANY location (Expenses, Incomes, Calendar, Dashboard, Center)
    if (tx.completed) {
      const completedDateLabel = formatBgDateFromIsoOrKey(tx.item.completedAt || nowIso);
      nextNotifications[i] = {
        ...n,
        status: "resolved",
        resolvedAt: tx.item.completedAt || nowIso,
        updatedAt: nowIso,
        resolvedNote: `Изпълнен на ${completedDateLabel}`,
      };
      changed = true;
      continue;
    }

    // Case 3: Rescheduled into the future (> today)
    if (tx.dueDateKey > todayKey) {
      nextNotifications[i] = {
        ...n,
        status: "resolved",
        resolvedAt: nowIso,
        updatedAt: nowIso,
        resolvedNote: `Пренасрочен за ${formatBgDateFromIsoOrKey(tx.dueDateKey)}`,
      };
      changed = true;
      continue;
    }

    // Case 4: Previous "due today" alert is now superseded by an overdue state
    if (
      (n.type === "upcoming_expense" || n.type === "upcoming_income") &&
      overdueRecordKeys.has(`${recordKind}:${recordId}`)
    ) {
      nextNotifications[i] = {
        ...n,
        status: "resolved",
        resolvedAt: nowIso,
        updatedAt: nowIso,
        resolvedNote: "Премина в просрочени",
      };
      changed = true;
    }
  }

  // B. Create / refresh Upcoming Today and Overdue notifications for uncompleted items
  for (const tx of Array.from(txMap.values())) {
    if (tx.completed) continue;
    if (tx.dueDateKey > todayKey) continue;

    const isDueToday = tx.dueDateKey === todayKey;
    const amountLabel = formatNotificationAmount(tx.amount);
    const title = `${tx.categoryName} €${amountLabel}`;

    const normalizedLocation = normalizeLocation(tx.item.location);

    if (isDueToday) {
      const dedupeKey = `tx_due:${tx.kind}:${tx.item.id}:${tx.dueDateKey}`;
      if (nextSuppressed[dedupeKey]) continue;

      const message = tx.kind === "expense" ? "Падеж днес." : "Очакван приход днес.";
      const existingIdx = findIndexByDedupe(dedupeKey);

      if (existingIdx === -1) {
        nextNotifications.unshift({
          id: makeNotificationId("notif"),
          dedupeKey,
          type: tx.kind === "expense" ? "upcoming_expense" : "upcoming_income",
          status: "unread",
          title,
          message,
          amount: tx.amount,
          categoryName: tx.categoryName,
          dueDateKey: tx.dueDateKey,
          ...(normalizedLocation ? { location: normalizedLocation } : {}),
          createdAt: nowIso,
          updatedAt: nowIso,
          target: {
            kind: tx.kind,
            monthKey: tx.monthKey,
            recordId: tx.item.id,
            recordListType: tx.recordListType,
            dateKey: tx.dueDateKey,
          },
        });
        changed = true;
      } else {
        const existing = nextNotifications[existingIdx];
        if (
          (existing.status === "unread" || existing.status === "read") &&
          (existing.title !== title ||
            existing.target?.monthKey !== tx.monthKey ||
            !areLocationsEqual(existing.location, normalizedLocation))
        ) {
          nextNotifications[existingIdx] = {
            ...existing,
            title,
            amount: tx.amount,
            categoryName: tx.categoryName,
            location: normalizedLocation,
            updatedAt: nowIso,
            target: {
              ...existing.target,
              kind: tx.kind,
              monthKey: tx.monthKey,
              recordId: tx.item.id,
              recordListType: tx.recordListType,
              dateKey: tx.dueDateKey,
            },
          };
          changed = true;
        }
      }
    } else {
      // Overdue: dueDateKey < todayKey
      const days = Math.max(1, diffDaysBetweenDateKeys(tx.dueDateKey, todayKey));
      const dedupeKey = `tx_overdue:${tx.kind}:${tx.item.id}:${tx.dueDateKey}`;
      if (nextSuppressed[dedupeKey]) continue;

      const message =
        tx.kind === "expense"
          ? `Просрочено с ${days} ${days === 1 ? "ден" : "дни"}.`
          : `Очакваният приход е закъснял с ${days} ${days === 1 ? "ден" : "дни"}.`;

      const existingIdx = findIndexByDedupe(dedupeKey);

      if (existingIdx === -1) {
        nextNotifications.unshift({
          id: makeNotificationId("notif"),
          dedupeKey,
          type: tx.kind === "expense" ? "overdue_expense" : "overdue_income",
          status: "unread",
          title,
          message,
          amount: tx.amount,
          categoryName: tx.categoryName,
          dueDateKey: tx.dueDateKey,
          ...(normalizedLocation ? { location: normalizedLocation } : {}),
          createdAt: nowIso,
          updatedAt: nowIso,
          target: {
            kind: tx.kind,
            monthKey: tx.monthKey,
            recordId: tx.item.id,
            recordListType: tx.recordListType,
            dateKey: tx.dueDateKey,
          },
        });
        changed = true;
      } else {
        const existing = nextNotifications[existingIdx];
        if (
          (existing.status === "unread" || existing.status === "read") &&
          (existing.message !== message ||
            existing.title !== title ||
            existing.target?.monthKey !== tx.monthKey ||
            !areLocationsEqual(existing.location, normalizedLocation))
        ) {
          nextNotifications[existingIdx] = {
            ...existing,
            title,
            message,
            amount: tx.amount,
            categoryName: tx.categoryName,
            location: normalizedLocation,
            updatedAt: nowIso,
            target: {
              ...existing.target,
              kind: tx.kind,
              monthKey: tx.monthKey,
              recordId: tx.item.id,
              recordListType: tx.recordListType,
              dateKey: tx.dueDateKey,
            },
          };
          changed = true;
        }
      }
    }
  }

  // C. Savings Goal Milestones (25%, 50%, 75%, 100%)
  if (Array.isArray(params.goals)) {
    const existingKeys = new Set(nextNotifications.map((n) => n.dedupeKey));
    for (const goal of params.goals) {
      if (!goal || goal.archived || !goal.targetAmount || goal.targetAmount <= 0) continue;
      const pct = (goal.allocatedAmount / goal.targetAmount) * 100;
      const reached = GOAL_MILESTONES.filter((m) => pct + 0.001 >= m);
      if (reached.length === 0) continue;

      const unrecorded = reached.filter((m) => {
        const key = `goal_milestone:${goal.id}:${m}`;
        return !existingKeys.has(key) && !nextSuppressed[key];
      });

      if (unrecorded.length === 0) continue;

      // Fire only for the highest newly crossed milestone; suppress earlier thresholds crossed in the same jump
      const topMilestone = unrecorded[unrecorded.length - 1];
      for (const m of unrecorded) {
        if (m !== topMilestone) {
          nextSuppressed[`goal_milestone:${goal.id}:${m}`] = nowIso;
        }
      }

      const topKey = `goal_milestone:${goal.id}:${topMilestone}`;
      existingKeys.add(topKey);
      nextNotifications.unshift({
        id: makeNotificationId("notif"),
        dedupeKey: topKey,
        type: "goal_milestone",
        status: "unread",
        title: `Цел „${goal.name}“`,
        message:
          topMilestone === 100
            ? "100% изпълнена! Целта е постигната."
            : `${topMilestone}% изпълнена.`,
        amount: goal.allocatedAmount,
        categoryName: goal.name,
        createdAt: nowIso,
        updatedAt: nowIso,
        target: {
          kind: "savings",
          goalId: goal.id,
        },
      });
      changed = true;
    }
  }

  if (!changed) {
    return { nextState: prevState, changed: false };
  }

  return {
    nextState: {
      notifications: capHistorySize(nextNotifications),
      suppressedKeys: nextSuppressed,
    },
    changed: true,
  };
}

/**
 * Adds a deduplicated notification when recurring items are automatically generated.
 */
export function recordRecurringGeneratedNotification(
  prevState: NotificationsStoreState,
  generatedItems: GeneratedRecurringItemMeta[],
  referenceDate?: Date
): { nextState: NotificationsStoreState; changed: boolean } {
  if (!Array.isArray(generatedItems) || generatedItems.length === 0) {
    return { nextState: prevState, changed: false };
  }

  const signature = generatedItems
    .map((i) => `${i.sourceId}:${i.occurrenceKey}`)
    .sort()
    .join("|");
  const dedupeKey = `recur_batch:${signature.slice(0, 180)}`;

  if (
    prevState.suppressedKeys[dedupeKey] ||
    prevState.notifications.some((n) => n.dedupeKey === dedupeKey)
  ) {
    return { nextState: prevState, changed: false };
  }

  const nowIso = (referenceDate || new Date()).toISOString();
  const first = generatedItems[0];

  const isSingle = generatedItems.length === 1;
  const title = isSingle
    ? `${first.categoryName} €${formatNotificationAmount(first.amount)}`
    : `Нови повтарящи се операции (${generatedItems.length})`;

  const message = isSingle
    ? `Автоматично генерирана ${first.bucket === "fixed" ? "разходна" : "приходна"} операция за ${first.monthKey}.`
    : `${generatedItems
        .slice(0, 2)
        .map((i) => `${i.categoryName} €${formatNotificationAmount(i.amount)}`)
        .join(", ")}${
        generatedItems.length > 2 ? ` и още ${generatedItems.length - 2}` : ""
      }.`;

  const notification: AppNotification = {
    id: makeNotificationId("notif"),
    dedupeKey,
    type: "recurring_generated",
    status: "unread",
    title,
    message,
    amount: isSingle ? first.amount : undefined,
    categoryName: isSingle ? first.categoryName : undefined,
    dueDateKey: first.occurrenceKey,
    createdAt: nowIso,
    updatedAt: nowIso,
    target: isSingle
      ? {
          kind: first.bucket === "fixed" ? "expense" : "income",
          monthKey: first.monthKey,
          recordId: first.id,
          recordListType: first.bucket,
          dateKey: first.occurrenceKey,
        }
      : {
          kind: "calendar",
          dateKey: first.occurrenceKey,
        },
  };

  return {
    nextState: {
      ...prevState,
      notifications: capHistorySize([notification, ...prevState.notifications]),
    },
    changed: true,
  };
}

/**
 * Adds a deduplicated notification ONLY for explicit user-initiated Google Drive backup/restore actions.
 * Automatic background syncs must never call this.
 */
export function recordBackupSuccessNotification(
  prevState: NotificationsStoreState,
  syncIsoTimestamp: string,
  action: ManualBackupAction = "manual_backup"
): { nextState: NotificationsStoreState; changed: boolean } {
  const cleanIso = (syncIsoTimestamp || "").trim();
  if (!cleanIso) {
    return { nextState: prevState, changed: false };
  }

  const dedupeKey = `manual_backup:${action}:${cleanIso}`;
  if (
    prevState.suppressedKeys[dedupeKey] ||
    prevState.notifications.some((n) => n.dedupeKey === dedupeKey)
  ) {
    return { nextState: prevState, changed: false };
  }

  const nowIso = new Date().toISOString();
  const isRestore = action === "manual_restore";
  const notification: AppNotification = {
    id: makeNotificationId("notif"),
    dedupeKey,
    type: "backup_success",
    status: "unread",
    title: isRestore ? "Възстановяване от Google Drive" : "Google Drive архив",
    message: isRestore
      ? "Данните от Google Drive бяха възстановени успешно."
      : "Ръчният архив в Google Drive е запазен успешно.",
    createdAt: nowIso,
    updatedAt: nowIso,
    target: {
      kind: "backup",
    },
  };

  return {
    nextState: {
      ...prevState,
      notifications: capHistorySize([notification, ...prevState.notifications]),
    },
    changed: true,
  };
}

export function markNotificationAsRead(
  state: NotificationsStoreState,
  id: string
): NotificationsStoreState {
  const nowIso = new Date().toISOString();
  return {
    ...state,
    notifications: state.notifications.map((n) =>
      n.id === id && n.status === "unread"
        ? { ...n, status: "read", readAt: nowIso, updatedAt: nowIso }
        : n
    ),
  };
}

export function markAllNotificationsAsRead(
  state: NotificationsStoreState
): NotificationsStoreState {
  const nowIso = new Date().toISOString();
  return {
    ...state,
    notifications: state.notifications.map((n) =>
      n.status === "unread"
        ? { ...n, status: "read", readAt: nowIso, updatedAt: nowIso }
        : n
    ),
  };
}

export function dismissNotification(
  state: NotificationsStoreState,
  id: string
): NotificationsStoreState {
  const nowIso = new Date().toISOString();
  return {
    ...state,
    notifications: state.notifications.map((n) =>
      n.id === id
        ? { ...n, status: "dismissed", dismissedAt: nowIso, updatedAt: nowIso }
        : n
    ),
  };
}

export function deleteNotification(
  state: NotificationsStoreState,
  id: string
): NotificationsStoreState {
  const target = state.notifications.find((n) => n.id === id);
  const nextSuppressed = { ...state.suppressedKeys };
  if (target?.dedupeKey) {
    nextSuppressed[target.dedupeKey] = new Date().toISOString();
  }
  return {
    notifications: state.notifications.filter((n) => n.id !== id),
    suppressedKeys: nextSuppressed,
  };
}

export function clearAllNotifications(
  state: NotificationsStoreState
): NotificationsStoreState {
  const nowIso = new Date().toISOString();
  const nextSuppressed = { ...state.suppressedKeys };
  for (const n of state.notifications) {
    if (n.dedupeKey) {
      nextSuppressed[n.dedupeKey] = nowIso;
    }
  }
  return {
    notifications: [],
    suppressedKeys: nextSuppressed,
  };
}

export function getUnreadNotificationsCount(state: NotificationsStoreState): number {
  return state.notifications.reduce(
    (count, n) => (n.status === "unread" ? count + 1 : count),
    0
  );
}

const ACTIVE_PRIORITY: Record<AppNotification["type"], number> = {
  overdue_expense: 0,
  overdue_income: 1,
  upcoming_expense: 2,
  upcoming_income: 3,
  goal_milestone: 4,
  recurring_generated: 5,
  backup_success: 6,
};

export function getActiveNotifications(state: NotificationsStoreState): AppNotification[] {
  return state.notifications
    .filter((n) => n.status === "unread" || n.status === "read")
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "unread" ? -1 : 1;
      }
      const pDiff = (ACTIVE_PRIORITY[a.type] ?? 9) - (ACTIVE_PRIORITY[b.type] ?? 9);
      if (pDiff !== 0) return pDiff;
      return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
    });
}

export function getHistoryNotifications(state: NotificationsStoreState): AppNotification[] {
  return state.notifications
    .filter((n) => n.status === "read" || n.status === "dismissed" || n.status === "resolved")
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
}
