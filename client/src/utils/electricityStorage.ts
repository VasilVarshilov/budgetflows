import { ElectricityRecord, ExpenseItem, MonthlyRecord } from "@/types";
import { userStorage, STORAGE_BASE_ELECTRICITY_HISTORY } from "./userStorage";
import { isCompletedExpense } from "./expenseStatus";
import { t } from "@/i18n/helpers";
import type { SupportedLanguage } from "@/i18n/types";

export const STORAGE_KEY_ELECTRICITY_HISTORY = "HomeBudget_ElectricityHistory";
export const STORAGE_BASE_ELECTRICITY_DELETED_EXPENSES = "ElectricityDeletedExpenseIds";
export const ELECTRICITY_UPDATED_EVENT = "budgetflows:electricity-updated";

export const MONTHS_BG_LIST = [
  "Януари",
  "Февруари",
  "Март",
  "Април",
  "Май",
  "Юни",
  "Юли",
  "Август",
  "Септември",
  "Октомври",
  "Ноември",
  "Декември",
];

export type ResolvedElectricityMeterMode = "single" | "double" | "manual";

export function isManualOrNoReadingsElectricityRecord(
  r: ElectricityRecord
): boolean {
  return Boolean(
    r.source === "manual" ||
      r.source === "receipt" ||
      (r.consumption === 0 &&
        r.previousReading === 0 &&
        r.currentReading === 0 &&
        r.costEm1 === 0 &&
        r.em2Remainder === 0)
  );
}

/**
 * Resolves the calculator type of any historical electricity record without mutating legacy data.
 * Legacy records saved prior to `meterMode` introduction used the 2-meter calculator.
 */
export function resolveElectricityMeterMode(
  r: ElectricityRecord
): ResolvedElectricityMeterMode {
  if (isManualOrNoReadingsElectricityRecord(r)) return "manual";
  if (r.meterMode === "single") return "single";
  if (r.meterMode === "double") return "double";
  return "double";
}

export function getElectricityMeterTypeLabel(
  r: ElectricityRecord,
  lang?: SupportedLanguage
): string {
  const mode = resolveElectricityMeterMode(r);
  if (mode === "single") return t("electricity.singleMeter", undefined, lang);
  if (mode === "double") return t("electricity.doubleMeter", undefined, lang);
  return t("electricity.manualEntry", undefined, lang);
}

function emitElectricityUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ELECTRICITY_UPDATED_EVENT));
  }
}

export function getDeletedElectricityExpenseIds(): Set<string> {
  try {
    const raw = userStorage.getItem(STORAGE_BASE_ELECTRICITY_DELETED_EXPENSES);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function markElectricityExpenseDeletedFromHistory(expenseId: string): void {
  if (!expenseId) return;
  try {
    const ids = getDeletedElectricityExpenseIds();
    ids.add(expenseId);
    userStorage.setItem(
      STORAGE_BASE_ELECTRICITY_DELETED_EXPENSES,
      JSON.stringify(Array.from(ids))
    );
  } catch {
    // ignore
  }
}

export function unmarkElectricityExpenseDeletedFromHistory(expenseId: string): void {
  if (!expenseId) return;
  try {
    const ids = getDeletedElectricityExpenseIds();
    if (!ids.has(expenseId)) return;
    ids.delete(expenseId);
    userStorage.setItem(
      STORAGE_BASE_ELECTRICITY_DELETED_EXPENSES,
      JSON.stringify(Array.from(ids))
    );
  } catch {
    // ignore
  }
}

/**
 * Loads electricity history from account-isolated userStorage.
 * New accounts start clean with [] (no seeded sample electricity history).
 */
export function getStoredElectricityHistory(): ElectricityRecord[] {
  try {
    const raw = userStorage.getItem(STORAGE_BASE_ELECTRICITY_HISTORY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error("Failed to load electricity history:", err);
    return [];
  }
}

/**
 * Saves full electricity history array to account-isolated userStorage.
 */
export function saveElectricityHistory(
  records: ElectricityRecord[]
): ElectricityRecord[] {
  try {
    userStorage.setItem(
      STORAGE_BASE_ELECTRICITY_HISTORY,
      JSON.stringify(records)
    );
    userStorage.markLocalModified();
    emitElectricityUpdated();
  } catch (err) {
    console.error("Failed to save electricity history:", err);
  }
  return records;
}

/**
 * Appends or prepends a new electricity bill record to history and saves to localStorage.
 */
export function addElectricityRecord(
  record: ElectricityRecord
): ElectricityRecord[] {
  const current = getStoredElectricityHistory();
  const filtered = current.filter((r) => r.id !== record.id);
  const updated = [record, ...filtered];
  saveElectricityHistory(updated);
  return updated;
}

/**
 * Deletes an electricity record by ID and updates localStorage.
 */
export function deleteElectricityRecord(id: string): ElectricityRecord[] {
  const current = getStoredElectricityHistory();
  const target = current.find((r) => r.id === id);
  if (target?.sourceExpenseId) {
    markElectricityExpenseDeletedFromHistory(target.sourceExpenseId);
  } else if (id.startsWith("elec_exp_")) {
    markElectricityExpenseDeletedFromHistory(id.slice("elec_exp_".length));
  }
  const updated = current.filter((r) => r.id !== id);
  saveElectricityHistory(updated);
  return updated;
}

/**
 * Determines whether an ExpenseItem represents a manually added (or receipt/imported) electricity bill.
 * Excludes calculator-generated "Сметка Ток - Електромер 1/2" items since the calculator already writes its full record.
 */
export function isManualElectricityExpense(item: ExpenseItem | null | undefined): boolean {
  if (!item) return false;
  if (
    item.id.startsWith("electricity_em1_") ||
    item.id.startsWith("electricity_em2_") ||
    (item.categoryName && item.categoryName.startsWith("Сметка Ток - Електромер"))
  ) {
    return false;
  }

  const catId = (item.categoryId || "").toLowerCase().trim();
  const catName = (item.categoryName || "").toLowerCase().trim();

  if (catId === "electricity") return true;
  if (/(^|[\s\-_/.,(])ток($|[\s\-_/.,)])/i.test(catName)) return true;
  if (catName.includes("електроенерг") || catName.includes("електрич")) return true;

  return false;
}

function parseMonthKeyLabel(monthKey?: string): { month: string; year: string } | null {
  if (!monthKey) return null;
  const parts = monthKey.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const rawMonth = parts[0];
  const matchedMonth = MONTHS_BG_LIST.find(
    (m) => m.toLowerCase() === rawMonth.toLowerCase()
  );
  const yearMatch = parts[1].match(/^\d{4}$/);
  if (matchedMonth && yearMatch) {
    return { month: matchedMonth, year: parts[1] };
  }
  return null;
}

function parsePeriodFromDateStr(dateStr?: string): { month: string; year: string } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const month = MONTHS_BG_LIST[d.getMonth()] || MONTHS_BG_LIST[0];
  const year = d.getFullYear().toString();
  return { month, year };
}

export function derivePeriodFromExpense(
  expense: ExpenseItem,
  fallbackMonthKey?: string
): { month: string; year: string; periodLabel: string } {
  const isReceipt = Boolean(
    expense.merchantName || (expense.receiptItems && expense.receiptItems.length > 0)
  );
  const fromDate = parsePeriodFromDateStr(expense.date);
  const fromMonthKey = parseMonthKeyLabel(fallbackMonthKey || expense.sourceMonth);

  const resolved = isReceipt
    ? fromDate || fromMonthKey
    : fromMonthKey || fromDate;

  if (resolved) {
    return {
      month: resolved.month,
      year: resolved.year,
      periodLabel: `${resolved.month} ${resolved.year}`,
    };
  }

  const now = new Date();
  const month = MONTHS_BG_LIST[now.getMonth()] || "Януари";
  const year = now.getFullYear().toString();
  return { month, year, periodLabel: `${month} ${year}` };
}

export function createElectricityRecordFromExpense(
  expense: ExpenseItem,
  fallbackMonthKey?: string
): ElectricityRecord {
  const { month, year, periodLabel } = derivePeriodFromExpense(expense, fallbackMonthKey);
  const isReceipt = Boolean(
    expense.merchantName || (expense.receiptItems && expense.receiptItems.length > 0)
  );

  return {
    id: `elec_exp_${expense.id}`,
    createdAt: expense.createdAt || expense.date || new Date().toISOString(),
    month,
    year,
    periodLabel,
    previousReading: 0,
    prevT1: 0,
    prevT2: 0,
    currentReading: 0,
    currT1: 0,
    currT2: 0,
    consumption: 0,
    consT1: 0,
    consT2: 0,
    unitPrice: 0,
    priceT1: 0,
    priceT2: 0,
    totalCost: Number(expense.amount) || 0,
    costEm1: 0,
    em2Remainder: 0,
    note:
      expense.note?.trim() ||
      (expense.categoryName && expense.categoryName !== "Ток"
        ? expense.categoryName
        : isReceipt
        ? "Сканирана сметка за ток"
        : "Ръчен запис (Разходи)"),
    source: isReceipt ? "receipt" : "manual",
    sourceExpenseId: expense.id,
  };
}

/**
 * Syncs an added or updated ExpenseItem to Electricity History.
 * If the item is not/no longer an electricity expense, removes any linked electricity record.
 */
export function upsertElectricityRecordFromExpense(
  expense: ExpenseItem,
  fallbackMonthKey?: string
): ElectricityRecord[] {
  if (!isManualElectricityExpense(expense) || !isCompletedExpense(expense)) {
    return deleteElectricityRecordByExpenseId(expense.id);
  }

  unmarkElectricityExpenseDeletedFromHistory(expense.id);

  const current = getStoredElectricityHistory();
  const nextRecord = createElectricityRecordFromExpense(expense, fallbackMonthKey);
  const existingIdx = current.findIndex(
    (r) => r.sourceExpenseId === expense.id || r.id === nextRecord.id
  );

  let updated: ElectricityRecord[];
  if (existingIdx >= 0) {
    const existing = current[existingIdx];
    updated = current.map((r, idx) =>
      idx === existingIdx
        ? {
            ...existing,
            month: nextRecord.month,
            year: nextRecord.year,
            periodLabel: nextRecord.periodLabel,
            totalCost: nextRecord.totalCost,
            note: nextRecord.note,
            unitPrice:
              existing.consumption > 0
                ? nextRecord.totalCost / existing.consumption
                : existing.unitPrice,
            source: existing.source || nextRecord.source,
            sourceExpenseId: expense.id,
          }
        : r
    );
  } else {
    updated = [nextRecord, ...current];
  }

  saveElectricityHistory(updated);
  return updated;
}

export function deleteElectricityRecordByExpenseId(
  expenseId: string
): ElectricityRecord[] {
  const current = getStoredElectricityHistory();
  const linkedId = `elec_exp_${expenseId}`;
  const updated = current.filter(
    (r) => r.sourceExpenseId !== expenseId && r.id !== linkedId
  );
  if (updated.length !== current.length) {
    saveElectricityHistory(updated);
  }
  return updated;
}

function getElectricityRecordSortScore(r: ElectricityRecord): {
  periodScore: number;
  createdMs: number;
} {
  const yearNum = parseInt(r.year, 10) || 0;
  const monthIdx = Math.max(
    0,
    MONTHS_BG_LIST.findIndex((m) => m.toLowerCase() === (r.month || "").toLowerCase())
  );
  const periodScore = yearNum * 12 + monthIdx;
  const createdMs = r.createdAt ? Date.parse(r.createdAt) || 0 : 0;
  return { periodScore, createdMs };
}

export function sortElectricityRecordsChronologically(
  records: ElectricityRecord[],
  order: "desc" | "asc" = "desc"
): ElectricityRecord[] {
  const dir = order === "desc" ? 1 : -1;
  return [...records].sort((a, b) => {
    const sa = getElectricityRecordSortScore(a);
    const sb = getElectricityRecordSortScore(b);
    if (sa.periodScore !== sb.periodScore) {
      return dir * (sb.periodScore - sa.periodScore);
    }
    if (sa.createdMs !== sb.createdMs) {
      return dir * (sb.createdMs - sa.createdMs);
    }
    return dir * b.id.localeCompare(a.id);
  });
}

/**
 * Non-mutating merge of stored ElectricityHistory with any manual electricity expenses
 * recorded in monthlyData that don't already have a persisted record (and weren't explicitly deleted).
 */
export function mergeElectricityHistoryWithManualExpenses(
  history: ElectricityRecord[],
  monthlyData?: Record<string, MonthlyRecord>
): ElectricityRecord[] {
  if (!monthlyData) {
    return sortElectricityRecordsChronologically(history, "desc");
  }

  const deletedIds = getDeletedElectricityExpenseIds();
  const seenExpenseIds = new Set<string>();

  history.forEach((r) => {
    if (r.sourceExpenseId) {
      seenExpenseIds.add(r.sourceExpenseId);
    } else if (r.id.startsWith("elec_exp_")) {
      seenExpenseIds.add(r.id.slice("elec_exp_".length));
    }
  });

  const merged = [...history];

  Object.entries(monthlyData).forEach(([monthKey, record]) => {
    if (!record || !record.expenses) return;
    const allItems: ExpenseItem[] = [
      ...(Array.isArray(record.expenses.additional_expenses)
        ? record.expenses.additional_expenses
        : []),
      ...(Array.isArray(record.expenses.fixed_expenses)
        ? record.expenses.fixed_expenses
        : []),
    ];

    allItems.forEach((exp) => {
      if (
        isCompletedExpense(exp) &&
        isManualElectricityExpense(exp) &&
        !seenExpenseIds.has(exp.id) &&
        !deletedIds.has(exp.id)
      ) {
        seenExpenseIds.add(exp.id);
        merged.push(createElectricityRecordFromExpense(exp, monthKey));
      }
    });
  });

  return sortElectricityRecordsChronologically(merged, "desc");
}

