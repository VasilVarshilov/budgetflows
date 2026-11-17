import { ExpenseItem, IncomeItem, MonthlyRecord, RepeatFrequency } from "@/types";
import { MONTHS_BG } from "./comparisonStorage";
import { createEmptyMonthlyRecord } from "./incomeStorage";
import { STORAGE_BASE_RECURRENCE_DISMISSED, userStorage } from "./userStorage";

export interface RepeatOptionMeta {
  value: RepeatFrequency;
  labelBg: string;
  shortLabelBg: string;
}

export const REPEAT_OPTIONS: RepeatOptionMeta[] = [
  { value: "never", labelBg: "Никога", shortLabelBg: "Никога" },
  { value: "daily", labelBg: "Ежедневно", shortLabelBg: "Ежедневно" },
  { value: "weekly", labelBg: "Седмично", shortLabelBg: "Седмично" },
  { value: "biweekly", labelBg: "На 2 седмици", shortLabelBg: "На 2 седмици" },
  { value: "monthly", labelBg: "Месечно", shortLabelBg: "Месечно" },
  { value: "quarterly", labelBg: "На 3 месеца", shortLabelBg: "На 3 месеца" },
  { value: "semiannual", labelBg: "На 6 месеца", shortLabelBg: "На 6 месеца" },
  { value: "yearly", labelBg: "Годишно", shortLabelBg: "Годишно" },
];

const REPEAT_SET = new Set<RepeatFrequency>(REPEAT_OPTIONS.map((o) => o.value));

export function resolveItemRepeat(
  item?: Pick<ExpenseItem, "repeat" | "recurrenceSourceId"> | null
): RepeatFrequency {
  if (!item || item.recurrenceSourceId) return "never";
  if (item.repeat && REPEAT_SET.has(item.repeat)) {
    return item.repeat;
  }
  return "never";
}

export function formatRepeatLabel(repeat?: RepeatFrequency): string {
  const found = REPEAT_OPTIONS.find((opt) => opt.value === repeat);
  return found ? found.labelBg : "Никога";
}

export function makeRecurrenceTombstoneKey(
  sourceId: string,
  occurrenceKey: string
): string {
  return `${sourceId}::${occurrenceKey}`;
}

export function getDismissedRecurrenceKeys(): Set<string> {
  const raw = userStorage.getJSON<string[]>(STORAGE_BASE_RECURRENCE_DISMISSED, []);
  return new Set(Array.isArray(raw) ? raw : []);
}

export function markRecurrenceDismissed(
  sourceId?: string,
  occurrenceKey?: string
): void {
  if (!sourceId || !occurrenceKey) return;
  const existing = getDismissedRecurrenceKeys();
  const composite = makeRecurrenceTombstoneKey(sourceId, occurrenceKey);
  if (existing.has(composite)) return;
  existing.add(composite);
  // Keep latest 500 tombstones to avoid unbounded growth
  const pruned = Array.from(existing).slice(-500);
  userStorage.setJSON(STORAGE_BASE_RECURRENCE_DISMISSED, pruned);
}

function toYyyyMmDd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseAnchorDate(
  item: Pick<ExpenseItem, "date" | "createdAt">,
  fallbackMonthKey: string
): Date | null {
  const candidates = [item.date, item.createdAt];
  for (const raw of candidates) {
    if (!raw) continue;
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      return new Date(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate(),
        12,
        0,
        0,
        0
      );
    }
  }
  const monthInfo = parseMonthKeyToYearMonth(fallbackMonthKey);
  if (monthInfo) {
    return new Date(monthInfo.year, monthInfo.monthIndex, 1, 12, 0, 0, 0);
  }
  return null;
}

export function parseMonthKeyToYearMonth(
  monthKey?: string
): { year: number; monthIndex: number } | null {
  if (!monthKey) return null;
  const parts = monthKey.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const monthIndex = MONTHS_BG.indexOf(parts[0]);
  const year = parseInt(parts[1], 10);
  if (monthIndex === -1 || isNaN(year)) return null;
  return { year, monthIndex };
}

function formatMonthKeyFromDate(d: Date): string {
  return `${MONTHS_BG[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Steps from an anchor date cleanly without calendar drift (e.g. Jan 31 -> Feb 28 -> Mar 31).
 */
export function advanceOccurrenceDate(
  anchorDate: Date,
  anchorDay: number,
  frequency: Exclude<RepeatFrequency, "never">,
  stepIndex: number
): Date {
  const baseYear = anchorDate.getFullYear();
  const baseMonth = anchorDate.getMonth();
  const baseDay = anchorDate.getDate();

  switch (frequency) {
    case "daily":
      return new Date(baseYear, baseMonth, baseDay + stepIndex, 12, 0, 0, 0);
    case "weekly":
      return new Date(baseYear, baseMonth, baseDay + stepIndex * 7, 12, 0, 0, 0);
    case "biweekly":
      return new Date(baseYear, baseMonth, baseDay + stepIndex * 14, 12, 0, 0, 0);
    case "monthly":
    case "quarterly":
    case "semiannual":
    case "yearly": {
      const monthStep =
        frequency === "monthly"
          ? 1
          : frequency === "quarterly"
          ? 3
          : frequency === "semiannual"
          ? 6
          : 12;
      const totalMonths = baseYear * 12 + baseMonth + stepIndex * monthStep;
      const targetYear = Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12;
      const maxDayInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const clampedDay = Math.min(anchorDay, maxDayInMonth);
      return new Date(targetYear, targetMonth, clampedDay, 12, 0, 0, 0);
    }
  }
}

export interface GenerateRecurringOptions {
  referenceDate?: Date;
  activeMonthKey?: string;
  dismissedKeys?: Set<string>;
}

export interface GenerateRecurringResult {
  updatedMonthlyData: Record<string, MonthlyRecord>;
  generatedCount: number;
}

const MAX_OCCURRENCES_PER_SOURCE = 120;

/**
 * Generates due future recurring instances (with completed = false) across all months up to the
 * active cutoff date for both Expenses (fixed & additional) and Incomes.
 * Strictly idempotent and respects deleted occurrence tombstones.
 */
export function generateDueRecurringInstances(
  monthlyData: Record<string, MonthlyRecord>,
  options: GenerateRecurringOptions = {}
): GenerateRecurringResult {
  if (!monthlyData || typeof monthlyData !== "object") {
    return { updatedMonthlyData: monthlyData, generatedCount: 0 };
  }

  const refDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const endOfToday = new Date(
    refDate.getFullYear(),
    refDate.getMonth(),
    refDate.getDate(),
    23,
    59,
    59,
    999
  );
  const currentCalendarAbs = refDate.getFullYear() * 12 + refDate.getMonth();

  const activeInfo = parseMonthKeyToYearMonth(options.activeMonthKey);
  const endOfActiveMonth = activeInfo
    ? new Date(activeInfo.year, activeInfo.monthIndex + 1, 0, 23, 59, 59, 999)
    : null;
  const activeMonthAbs = activeInfo ? activeInfo.year * 12 + activeInfo.monthIndex : null;

  const dismissed = options.dismissedKeys ?? getDismissedRecurrenceKeys();

  // Track all existing occurrences across all records to prevent duplicates even across moves
  const existingKeys = new Set<string>();
  const registerItemKey = (item?: Pick<ExpenseItem, "recurrenceSourceId" | "recurrenceOccurrenceKey">) => {
    if (item?.recurrenceSourceId && item?.recurrenceOccurrenceKey) {
      existingKeys.add(
        makeRecurrenceTombstoneKey(item.recurrenceSourceId, item.recurrenceOccurrenceKey)
      );
    }
  };

  Object.values(monthlyData).forEach((rec) => {
    if (!rec) return;
    if (Array.isArray(rec.expenses?.fixed_expenses)) {
      rec.expenses.fixed_expenses.forEach(registerItemKey);
    }
    if (Array.isArray(rec.expenses?.additional_expenses)) {
      rec.expenses.additional_expenses.forEach(registerItemKey);
    }
    if (Array.isArray(rec.incomes)) {
      rec.incomes.forEach(registerItemKey);
    }
  });

  type SourceSpec = {
    sourceMonthKey: string;
    bucket: "fixed" | "additional" | "income";
    item: ExpenseItem | IncomeItem;
    repeat: Exclude<RepeatFrequency, "never">;
  };

  const sources: SourceSpec[] = [];

  Object.entries(monthlyData).forEach(([monthKey, rec]) => {
    if (!rec) return;
    if (Array.isArray(rec.expenses?.fixed_expenses)) {
      rec.expenses.fixed_expenses.forEach((item) => {
        const repeat = resolveItemRepeat(item);
        if (repeat !== "never") {
          sources.push({ sourceMonthKey: monthKey, bucket: "fixed", item, repeat });
        }
      });
    }
    if (Array.isArray(rec.expenses?.additional_expenses)) {
      rec.expenses.additional_expenses.forEach((item) => {
        const repeat = resolveItemRepeat(item);
        if (repeat !== "never") {
          sources.push({ sourceMonthKey: monthKey, bucket: "additional", item, repeat });
        }
      });
    }
    if (Array.isArray(rec.incomes)) {
      rec.incomes.forEach((item) => {
        const repeat = resolveItemRepeat(item);
        if (repeat !== "never") {
          sources.push({ sourceMonthKey: monthKey, bucket: "income", item, repeat });
        }
      });
    }
  });

  if (sources.length === 0) {
    return { updatedMonthlyData: monthlyData, generatedCount: 0 };
  }

  let updatedMonthlyData: Record<string, MonthlyRecord> | null = null;
  let generatedCount = 0;

  const ensureClonedRecord = (targetMonthKey: string): MonthlyRecord => {
    if (!updatedMonthlyData) {
      updatedMonthlyData = { ...monthlyData };
    }
    const existingRec = updatedMonthlyData[targetMonthKey];
    if (!existingRec) {
      const created = createEmptyMonthlyRecord(targetMonthKey);
      updatedMonthlyData[targetMonthKey] = created;
      return created;
    }
    if (existingRec === monthlyData[targetMonthKey]) {
      const cloned: MonthlyRecord = {
        ...existingRec,
        expenses: existingRec.expenses
          ? {
              ...existingRec.expenses,
              fixed_expenses: Array.isArray(existingRec.expenses.fixed_expenses)
                ? [...existingRec.expenses.fixed_expenses]
                : [],
              additional_expenses: Array.isArray(existingRec.expenses.additional_expenses)
                ? [...existingRec.expenses.additional_expenses]
                : [],
            }
          : {
              saved_em2_eur: 0,
              fixed_expenses: [],
              additional_expenses: [],
            },
        incomes: Array.isArray(existingRec.incomes) ? [...existingRec.incomes] : [],
      };
      updatedMonthlyData[targetMonthKey] = cloned;
      return cloned;
    }
    return existingRec;
  };

  for (const src of sources) {
    const anchorDate = parseAnchorDate(src.item, src.sourceMonthKey);
    if (!anchorDate) continue;

    const anchorDay = anchorDate.getDate();
    const isSubMonthly =
      src.repeat === "daily" || src.repeat === "weekly" || src.repeat === "biweekly";

    // Cutoff calculation:
    // - For monthly+ schedules, materialize due items up to max(endOfToday, endOfActiveMonth) so
    //   opening or switching into a new/current month immediately shows its due recurring bills.
    // - For daily/weekly/biweekly schedules in the current calendar month, only materialize up to
    //   endOfToday so future days within this month don't appear prematurely (unless viewing a future month).
    let cutoff = endOfToday;
    if (endOfActiveMonth) {
      if (!isSubMonthly) {
        if (endOfActiveMonth.getTime() > cutoff.getTime()) {
          cutoff = endOfActiveMonth;
        }
      } else if (activeMonthAbs !== null && activeMonthAbs > currentCalendarAbs) {
        cutoff = endOfActiveMonth;
      }
    }

    for (let step = 1; step <= MAX_OCCURRENCES_PER_SOURCE; step++) {
      const occDate = advanceOccurrenceDate(anchorDate, anchorDay, src.repeat, step);
      if (occDate.getTime() > cutoff.getTime()) {
        break;
      }

      const targetMonthKey = formatMonthKeyFromDate(occDate);
      const occKey = toYyyyMmDd(occDate);
      const compositeKey = makeRecurrenceTombstoneKey(src.item.id, occKey);

      if (existingKeys.has(compositeKey) || dismissed.has(compositeKey)) {
        continue;
      }

      const occIso = occDate.toISOString();
      const occTs = occDate.getTime();
      const newIdPrefix =
        src.bucket === "fixed" ? "fix_rec" : src.bucket === "income" ? "inc_rec" : "exp_rec";
      const safeKey = occKey.replace(/-/g, "");
      const generatedId = `${newIdPrefix}_${src.item.id}_${safeKey}_${Math.random()
        .toString(36)
        .substring(2, 6)}`;

      const targetRecord = ensureClonedRecord(targetMonthKey);

      const baseGenerated: ExpenseItem = {
        ...src.item,
        id: generatedId,
        date: occIso,
        createdAt: new Date().toISOString(),
        timestamp: occTs,
        completed: false,
        status: "planned",
        completedAt: undefined,
        repeat: "never", // Child occurrences do not spawn their own chains
        isRecurring: true,
        recurrenceSourceId: src.item.id,
        recurrenceOccurrenceKey: occKey,
        sourceMonth: targetMonthKey,
        isFixedItem: src.bucket === "fixed" ? true : undefined,
      };

      if (src.bucket === "fixed") {
        if (!targetRecord.expenses) {
          targetRecord.expenses = {
            saved_em2_eur: 0,
            fixed_expenses: [],
            additional_expenses: [],
          };
        }
        targetRecord.expenses.fixed_expenses.push(baseGenerated);
      } else if (src.bucket === "additional") {
        if (!targetRecord.expenses) {
          targetRecord.expenses = {
            saved_em2_eur: 0,
            fixed_expenses: [],
            additional_expenses: [],
          };
        }
        targetRecord.expenses.additional_expenses.push(baseGenerated);
      } else {
        const incItem: IncomeItem = {
          ...(baseGenerated as IncomeItem),
          type: (src.item as IncomeItem).type || "income",
        };
        if (!Array.isArray(targetRecord.incomes)) {
          targetRecord.incomes = [];
        }
        targetRecord.incomes.push(incItem);
      }

      existingKeys.add(compositeKey);
      generatedCount += 1;
    }
  }

  return {
    updatedMonthlyData: updatedMonthlyData ?? monthlyData,
    generatedCount,
  };
}
