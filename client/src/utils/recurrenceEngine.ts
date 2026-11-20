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

export const WEEKDAY_NAMES_BG = [
  "Неделя",
  "Понеделник",
  "Вторник",
  "Сряда",
  "Четвъртък",
  "Петък",
  "Събота",
] as const;

export const WEEKDAY_SHORT_NAMES_BG = [
  "Нд",
  "Пн",
  "Вт",
  "Ср",
  "Чт",
  "Пт",
  "Сб",
] as const;

/** Monday-first order for Bulgarian UI controls (values match Date.getDay(): 0=Sun..6=Sat). */
export const WEEKDAY_ORDER_MON_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

export const MONTH_NAMES_FULL_BG = MONTHS_BG;

export const MONTH_NAMES_SHORT_BG = [
  "яну",
  "фев",
  "мар",
  "апр",
  "май",
  "юни",
  "юли",
  "авг",
  "сеп",
  "окт",
  "ное",
  "дек",
] as const;

export const MONTHLY_DAY_PRESETS = [1, 5, 10, 15, 20, 25, 30] as const;

export interface RecurrenceScheduleConfig {
  dayOfMonth?: number; // 1..31
  monthOfYear?: number; // 0..11
  dayOfWeek?: number; // 0 (Sun)..6 (Sat)
}

const REPEAT_SET = new Set<RepeatFrequency>(REPEAT_OPTIONS.map((o) => o.value));

export function normalizeRepeatValue(
  repeat?: RepeatFrequency | string | null
): RepeatFrequency {
  if (repeat && REPEAT_SET.has(repeat as RepeatFrequency)) {
    return repeat as RepeatFrequency;
  }
  return "never";
}

export function isRepeatingFrequency(
  repeat?: RepeatFrequency | string | null
): boolean {
  return normalizeRepeatValue(repeat) !== "never";
}

export function isFixedByRepeat(
  item?: Pick<ExpenseItem, "repeat"> | Pick<IncomeItem, "repeat"> | null
): boolean {
  return isRepeatingFrequency(item?.repeat);
}

export function clampDayOfMonth(day?: number): number {
  if (typeof day !== "number" || !Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.round(day)));
}

export function clampMonthOfYear(month?: number): number {
  if (typeof month !== "number" || !Number.isFinite(month)) return 0;
  return Math.min(11, Math.max(0, Math.round(month)));
}

export function clampDayOfWeek(dow?: number): number {
  if (typeof dow !== "number" || !Number.isFinite(dow)) return 1;
  const n = Math.round(dow);
  return ((n % 7) + 7) % 7;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Parses a date string safely in local midday time (avoiding UTC midnight date drift).
 */
export function parseSafeLocalDate(raw?: string | null): Date | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoOnly) {
    return new Date(
      Number(isoOnly[1]),
      Number(isoOnly[2]) - 1,
      Number(isoOnly[3]),
      12,
      0,
      0,
      0
    );
  }

  const bgDot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (bgDot) {
    return new Date(
      Number(bgDot[3]),
      Number(bgDot[2]) - 1,
      Number(bgDot[1]),
      12,
      0,
      0,
      0
    );
  }

  const parsed = new Date(trimmed);
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

  return null;
}

export function extractScheduleDefaultsFromDate(
  dateStr?: string | null,
  fallbackMonthKey?: string
): { dayOfMonth: number; monthOfYear: number; dayOfWeek: number } {
  const parsed = parseSafeLocalDate(dateStr);
  if (parsed) {
    return {
      dayOfMonth: parsed.getDate(),
      monthOfYear: parsed.getMonth(),
      dayOfWeek: parsed.getDay(),
    };
  }
  const monthInfo = parseMonthKeyToYearMonth(fallbackMonthKey);
  if (monthInfo) {
    const d = new Date(monthInfo.year, monthInfo.monthIndex, 1, 12, 0, 0, 0);
    return {
      dayOfMonth: 1,
      monthOfYear: d.getMonth(),
      dayOfWeek: d.getDay(),
    };
  }
  const today = new Date();
  return {
    dayOfMonth: today.getDate(),
    monthOfYear: today.getMonth(),
    dayOfWeek: today.getDay(),
  };
}

/**
 * Returns normalized recurrence schedule parameters for an ExpenseItem / IncomeItem,
 * filling missing schedule parts cleanly from expectedDate / date / createdAt / monthKey.
 */
export function getItemRecurrenceSchedule(
  item?: Partial<
    Pick<
      ExpenseItem,
      | "repeat"
      | "recurrenceDayOfMonth"
      | "recurrenceMonthOfYear"
      | "recurrenceDayOfWeek"
      | "expectedDate"
      | "date"
      | "createdAt"
    >
  > & { dateKey?: string } | null,
  fallbackMonthKey?: string
): RecurrenceScheduleConfig {
  if (!item) return {};
  const repeat = normalizeRepeatValue(item.repeat);
  if (repeat === "never" || repeat === "daily") return {};

  const defaults = extractScheduleDefaultsFromDate(
    item.expectedDate || item.dateKey || item.date || item.createdAt,
    fallbackMonthKey
  );

  if (repeat === "weekly" || repeat === "biweekly") {
    const dow =
      typeof item.recurrenceDayOfWeek === "number" &&
      Number.isFinite(item.recurrenceDayOfWeek)
        ? clampDayOfWeek(item.recurrenceDayOfWeek)
        : defaults.dayOfWeek;
    return { dayOfWeek: dow };
  }

  const dom =
    typeof item.recurrenceDayOfMonth === "number" &&
    Number.isFinite(item.recurrenceDayOfMonth)
      ? clampDayOfMonth(item.recurrenceDayOfMonth)
      : defaults.dayOfMonth;

  if (repeat === "yearly") {
    const moy =
      typeof item.recurrenceMonthOfYear === "number" &&
      Number.isFinite(item.recurrenceMonthOfYear)
        ? clampMonthOfYear(item.recurrenceMonthOfYear)
        : defaults.monthOfYear;
    return { dayOfMonth: dom, monthOfYear: moy };
  }

  // monthly | quarterly | semiannual
  return { dayOfMonth: dom };
}

/**
 * Ensures explicit schedule fields on an item match its Repeat frequency.
 * Handles automatic data migration for legacy recurring records (e.g. Repeat=Monthly & Date=20.11.2026 -> recurrenceDayOfMonth=20)
 * and repairs legacy generated child records whose expectedDate accidentally remained on a prior month.
 */
export function normalizeScheduleFieldsForItem<T extends ExpenseItem>(
  item: T,
  fallbackMonthKey?: string
): { item: T; changed: boolean } {
  const repeat = normalizeRepeatValue(item.repeat);
  let nextExpectedDate = item.expectedDate;
  let repairedExpectedDate = false;

  // Repair legacy auto-generated child occurrences where expectedDate inherited the root's earlier month
  if (
    item.recurrenceSourceId &&
    item.recurrenceOccurrenceKey &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.recurrenceOccurrenceKey) &&
    item.expectedDate !== item.recurrenceOccurrenceKey
  ) {
    const dateParsed = parseSafeLocalDate(item.date);
    const dateMonth = dateParsed ? toYyyyMmDd(dateParsed).slice(0, 7) : null;
    const occMonth = item.recurrenceOccurrenceKey.slice(0, 7);
    if (
      !item.expectedDate ||
      (dateParsed && toYyyyMmDd(dateParsed) === item.recurrenceOccurrenceKey) ||
      (dateMonth === occMonth && item.expectedDate.slice(0, 7) !== occMonth)
    ) {
      nextExpectedDate = item.recurrenceOccurrenceKey;
      repairedExpectedDate = true;
    }
  }

  const effectiveForSchedule = repairedExpectedDate
    ? { ...item, expectedDate: nextExpectedDate }
    : item;
  const resolved = getItemRecurrenceSchedule(effectiveForSchedule, fallbackMonthKey);

  const nextDom = resolved.dayOfMonth;
  const nextMoy = resolved.monthOfYear;
  const nextDow = resolved.dayOfWeek;

  const scheduleChanged =
    item.recurrenceDayOfMonth !== nextDom ||
    item.recurrenceMonthOfYear !== nextMoy ||
    item.recurrenceDayOfWeek !== nextDow ||
    repairedExpectedDate;

  if (!scheduleChanged) {
    return { item, changed: false };
  }

  // Strip undefined keys cleanly for JSON/storage hygiene
  const updated: T = { ...item };
  if (repairedExpectedDate) {
    updated.expectedDate = nextExpectedDate;
  }
  if (repeat === "never" || repeat === "daily") {
    delete updated.recurrenceDayOfMonth;
    delete updated.recurrenceMonthOfYear;
    delete updated.recurrenceDayOfWeek;
  } else if (repeat === "weekly" || repeat === "biweekly") {
    delete updated.recurrenceDayOfMonth;
    delete updated.recurrenceMonthOfYear;
    updated.recurrenceDayOfWeek = nextDow;
  } else if (repeat === "yearly") {
    updated.recurrenceDayOfMonth = nextDom;
    updated.recurrenceMonthOfYear = nextMoy;
    delete updated.recurrenceDayOfWeek;
  } else {
    updated.recurrenceDayOfMonth = nextDom;
    delete updated.recurrenceMonthOfYear;
    delete updated.recurrenceDayOfWeek;
  }

  return { item: updated, changed: true };
}

/**
 * Builds clean schedule fields object to attach when creating/updating a transaction from a form.
 */
export function buildScheduleFieldsForRepeat(
  repeat: RepeatFrequency,
  schedule: RecurrenceScheduleConfig | undefined,
  anchorDateStr?: string,
  fallbackMonthKey?: string
): {
  recurrenceDayOfMonth?: number;
  recurrenceMonthOfYear?: number;
  recurrenceDayOfWeek?: number;
} {
  if (repeat === "never" || repeat === "daily") {
    return {
      recurrenceDayOfMonth: undefined,
      recurrenceMonthOfYear: undefined,
      recurrenceDayOfWeek: undefined,
    };
  }
  const defaults = extractScheduleDefaultsFromDate(anchorDateStr, fallbackMonthKey);

  if (repeat === "weekly" || repeat === "biweekly") {
    return {
      recurrenceDayOfMonth: undefined,
      recurrenceMonthOfYear: undefined,
      recurrenceDayOfWeek:
        typeof schedule?.dayOfWeek === "number"
          ? clampDayOfWeek(schedule.dayOfWeek)
          : defaults.dayOfWeek,
    };
  }

  const dom =
    typeof schedule?.dayOfMonth === "number"
      ? clampDayOfMonth(schedule.dayOfMonth)
      : defaults.dayOfMonth;

  if (repeat === "yearly") {
    const moy =
      typeof schedule?.monthOfYear === "number"
        ? clampMonthOfYear(schedule.monthOfYear)
        : defaults.monthOfYear;
    return {
      recurrenceDayOfMonth: dom,
      recurrenceMonthOfYear: moy,
      recurrenceDayOfWeek: undefined,
    };
  }

  return {
    recurrenceDayOfMonth: dom,
    recurrenceMonthOfYear: undefined,
    recurrenceDayOfWeek: undefined,
  };
}

/**
 * Returns the normalized Repeat setting stored on the item.
 * Note: Child recurring occurrences preserve their inherited repeat (e.g. "monthly")
 * so Fixed/Additional classification remains 100% consistent with Repeat = Single Source of Truth.
 */
export function resolveItemRepeat(
  item?: Pick<ExpenseItem, "repeat"> | null
): RepeatFrequency {
  if (!item) return "never";
  return normalizeRepeatValue(item.repeat);
}

/**
 * Only root records (without recurrenceSourceId) with Repeat !== "never" spawn future instances.
 * Child occurrences keep repeat !== "never" for Fixed classification without creating duplicate chains.
 */
export function isRecurringScheduleRoot(
  item?: Pick<ExpenseItem, "repeat" | "recurrenceSourceId"> | null
): boolean {
  if (!item || item.recurrenceSourceId) return false;
  return isRepeatingFrequency(item.repeat);
}

type RepeatLabelSource =
  | RecurrenceScheduleConfig
  | (Partial<
      Pick<
        ExpenseItem,
        | "recurrenceDayOfMonth"
        | "recurrenceMonthOfYear"
        | "recurrenceDayOfWeek"
        | "expectedDate"
        | "date"
      >
    > & { dateKey?: string });

export function formatRepeatLabel(
  repeat?: RepeatFrequency,
  source?: RepeatLabelSource | null
): string {
  const normalized = normalizeRepeatValue(repeat);
  const found = REPEAT_OPTIONS.find((opt) => opt.value === normalized);
  const baseLabel = found ? found.labelBg : "Никога";

  if (!source || normalized === "never" || normalized === "daily") {
    return baseLabel;
  }

  const asItem = source as Partial<
    Pick<
      ExpenseItem,
      | "recurrenceDayOfMonth"
      | "recurrenceMonthOfYear"
      | "recurrenceDayOfWeek"
      | "expectedDate"
      | "date"
    >
  > & { dateKey?: string };
  const asCfg = source as RecurrenceScheduleConfig;

  const hasItemFields =
    "recurrenceDayOfMonth" in asItem ||
    "recurrenceMonthOfYear" in asItem ||
    "recurrenceDayOfWeek" in asItem ||
    "expectedDate" in asItem ||
    "date" in asItem ||
    "dateKey" in asItem;

  const resolved: RecurrenceScheduleConfig = hasItemFields
    ? getItemRecurrenceSchedule({ ...asItem, repeat: normalized })
    : asCfg;

  if (normalized === "weekly" || normalized === "biweekly") {
    if (typeof resolved.dayOfWeek === "number") {
      const dayName = WEEKDAY_NAMES_BG[clampDayOfWeek(resolved.dayOfWeek)];
      return `${baseLabel} (${dayName})`;
    }
    return baseLabel;
  }

  if (normalized === "yearly") {
    if (
      typeof resolved.dayOfMonth === "number" &&
      typeof resolved.monthOfYear === "number"
    ) {
      const d = clampDayOfMonth(resolved.dayOfMonth);
      const m = MONTH_NAMES_SHORT_BG[clampMonthOfYear(resolved.monthOfYear)];
      return `${baseLabel} (${d} ${m})`;
    }
    return baseLabel;
  }

  // monthly | quarterly | semiannual
  if (typeof resolved.dayOfMonth === "number") {
    const d = clampDayOfMonth(resolved.dayOfMonth);
    return `${baseLabel} (${d}-о число)`;
  }

  return baseLabel;
}

/**
 * Partitions fixed and additional expense arrays strictly by Repeat as Single Source of Truth:
 * - Repeat !== "never" -> Fixed Expenses (isFixedItem: true, isRecurring: true)
 * - Repeat === "never" -> Additional Expenses (isFixedItem: undefined, isRecurring: false)
 * Also migrates/normalizes explicit recurrence schedule fields idempotently.
 */
export function partitionExpensesByRepeat(
  fixedList: ExpenseItem[],
  additionalList: ExpenseItem[],
  sourceRepeatById?: Map<string, RepeatFrequency>,
  sourceScheduleById?: Map<string, RecurrenceScheduleConfig>,
  monthKey?: string
): {
  fixedExpenses: ExpenseItem[];
  additionalExpenses: ExpenseItem[];
  changed: boolean;
} {
  const fixedOut: ExpenseItem[] = [];
  const additionalOut: ExpenseItem[] = [];
  const seenIds = new Set<string>();
  let changed = false;

  const getEffectiveRepeat = (item: ExpenseItem): RepeatFrequency => {
    const direct = normalizeRepeatValue(item.repeat);
    if (direct !== "never") return direct;
    if (item.recurrenceSourceId && sourceRepeatById?.has(item.recurrenceSourceId)) {
      const parentRepeat = sourceRepeatById.get(item.recurrenceSourceId);
      if (parentRepeat && parentRepeat !== "never") {
        return parentRepeat;
      }
    }
    return "never";
  };

  const applyScheduleNorm = (item: ExpenseItem): ExpenseItem => {
    let candidate = item;
    if (
      item.recurrenceSourceId &&
      sourceScheduleById?.has(item.recurrenceSourceId)
    ) {
      const parentSched = sourceScheduleById.get(item.recurrenceSourceId)!;
      const missingDom =
        typeof candidate.recurrenceDayOfMonth !== "number" &&
        typeof parentSched.dayOfMonth === "number";
      const missingMoy =
        typeof candidate.recurrenceMonthOfYear !== "number" &&
        typeof parentSched.monthOfYear === "number";
      const missingDow =
        typeof candidate.recurrenceDayOfWeek !== "number" &&
        typeof parentSched.dayOfWeek === "number";
      if (missingDom || missingMoy || missingDow) {
        candidate = {
          ...candidate,
          ...(missingDom ? { recurrenceDayOfMonth: parentSched.dayOfMonth } : {}),
          ...(missingMoy ? { recurrenceMonthOfYear: parentSched.monthOfYear } : {}),
          ...(missingDow ? { recurrenceDayOfWeek: parentSched.dayOfWeek } : {}),
        };
        changed = true;
      }
    }
    const schedRes = normalizeScheduleFieldsForItem(candidate, monthKey);
    if (schedRes.changed) changed = true;
    return schedRes.item;
  };

  for (const item of fixedList) {
    if (!item || (item.id && seenIds.has(item.id))) {
      changed = true;
      continue;
    }
    if (item.id) seenIds.add(item.id);

    const effectiveRepeat = getEffectiveRepeat(item);
    if (effectiveRepeat !== "never") {
      const needsFlagUpdate =
        item.repeat !== effectiveRepeat ||
        item.isRecurring !== true ||
        item.isFixedItem !== true;
      if (needsFlagUpdate) changed = true;
      const base = needsFlagUpdate
        ? {
            ...item,
            repeat: effectiveRepeat,
            isRecurring: true,
            isFixedItem: true,
          }
        : item;
      fixedOut.push(applyScheduleNorm(base));
    } else {
      // Fixed Expense with Repeat = Never -> must move to Additional Expenses
      changed = true;
      additionalOut.push(
        applyScheduleNorm({
          ...item,
          repeat: "never",
          isRecurring: false,
          isFixedItem: undefined,
        })
      );
    }
  }

  for (const item of additionalList) {
    if (!item || (item.id && seenIds.has(item.id))) {
      changed = true;
      continue;
    }
    if (item.id) seenIds.add(item.id);

    const effectiveRepeat = getEffectiveRepeat(item);
    if (effectiveRepeat !== "never") {
      // Additional Expense with Repeat != Never -> must move to Fixed Expenses
      changed = true;
      fixedOut.push(
        applyScheduleNorm({
          ...item,
          repeat: effectiveRepeat,
          isRecurring: true,
          isFixedItem: true,
        })
      );
    } else {
      const needsFlagUpdate =
        item.repeat !== "never" ||
        item.isRecurring !== false ||
        Boolean(item.isFixedItem);
      if (needsFlagUpdate) changed = true;
      const base = needsFlagUpdate
        ? {
            ...item,
            repeat: "never" as const,
            isRecurring: false,
            isFixedItem: undefined,
          }
        : item;
      additionalOut.push(applyScheduleNorm(base));
    }
  }

  return { fixedExpenses: fixedOut, additionalExpenses: additionalOut, changed };
}

function resolveIncomeEffectiveRepeat(
  inc: IncomeItem,
  sourceRepeatById?: Map<string, RepeatFrequency>
): RepeatFrequency {
  const direct = normalizeRepeatValue(inc.repeat);
  if (direct !== "never") return direct;

  if (inc.recurrenceSourceId && sourceRepeatById?.has(inc.recurrenceSourceId)) {
    const parentRepeat = sourceRepeatById.get(inc.recurrenceSourceId);
    if (parentRepeat && parentRepeat !== "never") {
      return parentRepeat;
    }
  }

  // Confirmed legacy RecurringIncomeTemplate occurrences keep their schedule frequency
  // without becoming new root generators (since recurringTemplateId / frequency are preserved).
  if (inc.recurringTemplateId && inc.frequency) {
    if (inc.frequency === "weekly" || inc.frequency === "monthly" || inc.frequency === "yearly") {
      return inc.frequency;
    }
  }

  return "never";
}

export function normalizeIncomeByRepeat(
  inc: IncomeItem,
  sourceRepeatById?: Map<string, RepeatFrequency>,
  sourceScheduleById?: Map<string, RecurrenceScheduleConfig>,
  monthKey?: string
): { item: IncomeItem; changed: boolean } {
  const effectiveRepeat = resolveIncomeEffectiveRepeat(inc, sourceRepeatById);
  const isFixed = effectiveRepeat !== "never";
  const flagChanged =
    inc.repeat !== effectiveRepeat ||
    inc.isRecurring !== isFixed ||
    Boolean(inc.isFixedItem) !== isFixed;

  let candidate: IncomeItem = flagChanged
    ? {
        ...inc,
        repeat: effectiveRepeat,
        isRecurring: isFixed,
        isFixedItem: isFixed,
      }
    : inc;

  let inheritedSchedule = false;
  if (
    candidate.recurrenceSourceId &&
    sourceScheduleById?.has(candidate.recurrenceSourceId)
  ) {
    const parentSched = sourceScheduleById.get(candidate.recurrenceSourceId)!;
    const missingDom =
      typeof candidate.recurrenceDayOfMonth !== "number" &&
      typeof parentSched.dayOfMonth === "number";
    const missingMoy =
      typeof candidate.recurrenceMonthOfYear !== "number" &&
      typeof parentSched.monthOfYear === "number";
    const missingDow =
      typeof candidate.recurrenceDayOfWeek !== "number" &&
      typeof parentSched.dayOfWeek === "number";
    if (missingDom || missingMoy || missingDow) {
      candidate = {
        ...candidate,
        ...(missingDom ? { recurrenceDayOfMonth: parentSched.dayOfMonth } : {}),
        ...(missingMoy ? { recurrenceMonthOfYear: parentSched.monthOfYear } : {}),
        ...(missingDow ? { recurrenceDayOfWeek: parentSched.dayOfWeek } : {}),
      };
      inheritedSchedule = true;
    }
  }

  const schedRes = normalizeScheduleFieldsForItem(candidate, monthKey);
  if (!flagChanged && !inheritedSchedule && !schedRes.changed) {
    return { item: inc, changed: false };
  }

  return {
    item: schedRes.item,
    changed: true,
  };
}

export interface NormalizeMonthlyDataResult {
  updatedMonthlyData: Record<string, MonthlyRecord>;
  migratedCount: number;
}

/**
 * Audits all MonthlyRecord entries and enforces Repeat as Single Source of Truth:
 * 1. Fixed Expenses with Repeat = Never -> moved to Additional Expenses.
 * 2. Additional Expenses with Repeat != Never -> moved to Fixed Expenses.
 * 3. Legacy generated child occurrences inherit parent Repeat & Schedule.
 * 4. Existing recurring records automatically migrate sensible schedule defaults
 *    (e.g. Repeat=Monthly & Date=20.11.2026 -> recurrenceDayOfMonth=20).
 * Strictly idempotent.
 */
export function normalizeMonthlyDataConsistency(
  monthlyData: Record<string, MonthlyRecord>
): NormalizeMonthlyDataResult {
  if (!monthlyData || typeof monthlyData !== "object") {
    return { updatedMonthlyData: monthlyData, migratedCount: 0 };
  }

  const sourceRepeatById = new Map<string, RepeatFrequency>();
  const sourceScheduleById = new Map<string, RecurrenceScheduleConfig>();

  Object.entries(monthlyData).forEach(([monthKey, rec]) => {
    if (!rec) return;
    const registerRoot = (item?: ExpenseItem | IncomeItem) => {
      if (!item || !item.id || item.recurrenceSourceId) return;
      const r = normalizeRepeatValue(item.repeat);
      if (r !== "never") {
        sourceRepeatById.set(item.id, r);
        sourceScheduleById.set(
          item.id,
          getItemRecurrenceSchedule({ ...item, repeat: r }, monthKey)
        );
      }
    };
    if (Array.isArray(rec.expenses?.fixed_expenses)) {
      rec.expenses.fixed_expenses.forEach(registerRoot);
    }
    if (Array.isArray(rec.expenses?.additional_expenses)) {
      rec.expenses.additional_expenses.forEach(registerRoot);
    }
    if (Array.isArray(rec.incomes)) {
      rec.incomes.forEach(registerRoot);
    }
  });

  let updatedMonthlyData: Record<string, MonthlyRecord> | null = null;
  let migratedCount = 0;

  for (const [monthKey, rec] of Object.entries(monthlyData)) {
    if (!rec) continue;
    let recChanged = false;
    let nextExpenses = rec.expenses;
    let nextIncomes = rec.incomes;

    if (rec.expenses) {
      const hasFixedArr = Array.isArray(rec.expenses.fixed_expenses);
      const hasAddArr = Array.isArray(rec.expenses.additional_expenses);
      if (hasFixedArr || hasAddArr) {
        const fixedArr = hasFixedArr ? rec.expenses.fixed_expenses : [];
        const addArr = hasAddArr ? rec.expenses.additional_expenses : [];
        const partitioned = partitionExpensesByRepeat(
          fixedArr,
          addArr,
          sourceRepeatById,
          sourceScheduleById,
          monthKey
        );
        if (partitioned.changed) {
          recChanged = true;
          nextExpenses = {
            ...rec.expenses,
            fixed_expenses: partitioned.fixedExpenses,
            additional_expenses: partitioned.additionalExpenses,
          };
        }
      }
    }

    if (Array.isArray(rec.incomes)) {
      const seenIncIds = new Set<string>();
      const normalizedList: IncomeItem[] = [];
      let incomesChanged = false;

      for (const inc of rec.incomes) {
        if (!inc || (inc.id && seenIncIds.has(inc.id))) {
          incomesChanged = true;
          continue;
        }
        if (inc.id) seenIncIds.add(inc.id);
        const res = normalizeIncomeByRepeat(
          inc,
          sourceRepeatById,
          sourceScheduleById,
          monthKey
        );
        if (res.changed) incomesChanged = true;
        normalizedList.push(res.item);
      }

      if (incomesChanged) {
        recChanged = true;
        nextIncomes = normalizedList;
      }
    }

    if (recChanged) {
      if (!updatedMonthlyData) {
        updatedMonthlyData = { ...monthlyData };
      }
      updatedMonthlyData[monthKey] = {
        ...rec,
        expenses: nextExpenses,
        incomes: nextIncomes,
      };
      migratedCount += 1;
    }
  }

  return {
    updatedMonthlyData: updatedMonthlyData ?? monthlyData,
    migratedCount,
  };
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
  item: Pick<ExpenseItem, "expectedDate" | "date" | "createdAt">,
  fallbackMonthKey: string
): Date | null {
  const candidates = [item.expectedDate, item.date, item.createdAt];
  for (const raw of candidates) {
    const parsed = parseSafeLocalDate(raw);
    if (parsed) return parsed;
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
 * Steps from an anchor date cleanly using explicit schedule fields (dayOfMonth, monthOfYear, dayOfWeek)
 * without calendar drift (e.g. Jan 31 -> Feb 28 -> Mar 31, or 15 Jan -> 15 Apr -> 15 Jul -> 15 Oct).
 */
export function advanceOccurrenceDate(
  anchorDate: Date,
  anchorDay: number,
  frequency: Exclude<RepeatFrequency, "never">,
  stepIndex: number,
  schedule?: RecurrenceScheduleConfig
): Date {
  const baseYear = anchorDate.getFullYear();
  const baseMonth = anchorDate.getMonth();
  const baseDay = anchorDate.getDate();

  switch (frequency) {
    case "daily":
      return new Date(baseYear, baseMonth, baseDay + stepIndex, 12, 0, 0, 0);

    case "weekly":
    case "biweekly": {
      const intervalDays = frequency === "biweekly" ? 14 : 7;
      const targetDow =
        typeof schedule?.dayOfWeek === "number"
          ? clampDayOfWeek(schedule.dayOfWeek)
          : anchorDate.getDay();
      const rawDiff = (targetDow - anchorDate.getDay() + 7) % 7;
      const firstDeltaDays = rawDiff === 0 ? intervalDays : rawDiff;
      return new Date(
        baseYear,
        baseMonth,
        baseDay + firstDeltaDays + (stepIndex - 1) * intervalDays,
        12,
        0,
        0,
        0
      );
    }

    case "monthly":
    case "quarterly":
    case "semiannual": {
      const monthStep =
        frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 6;
      const targetDay = clampDayOfMonth(schedule?.dayOfMonth ?? anchorDay);
      const totalMonths = baseYear * 12 + baseMonth + stepIndex * monthStep;
      const targetYear = Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12;
      const maxDayInMonth = daysInMonth(targetYear, targetMonth);
      const clampedDay = Math.min(targetDay, maxDayInMonth);
      return new Date(targetYear, targetMonth, clampedDay, 12, 0, 0, 0);
    }

    case "yearly": {
      const targetMonth =
        typeof schedule?.monthOfYear === "number"
          ? clampMonthOfYear(schedule.monthOfYear)
          : baseMonth;
      const targetDay = clampDayOfMonth(schedule?.dayOfMonth ?? anchorDay);
      const candBaseDay = Math.min(targetDay, daysInMonth(baseYear, targetMonth));
      const occursLaterSameYear =
        targetMonth > baseMonth ||
        (targetMonth === baseMonth && candBaseDay > baseDay);
      const firstYear = occursLaterSameYear ? baseYear : baseYear + 1;
      const targetYear = firstYear + (stepIndex - 1);
      const maxDayInMonth = daysInMonth(targetYear, targetMonth);
      const clampedDay = Math.min(targetDay, maxDayInMonth);
      return new Date(targetYear, targetMonth, clampedDay, 12, 0, 0, 0);
    }
  }
}

export interface GenerateRecurringOptions {
  referenceDate?: Date;
  dismissedKeys?: Set<string>;
}

export interface GeneratedRecurringItemMeta {
  id: string;
  monthKey: string;
  bucket: "fixed" | "income";
  categoryName: string;
  amount: number;
  occurrenceKey: string;
  sourceId: string;
}

export interface GenerateRecurringResult {
  updatedMonthlyData: Record<string, MonthlyRecord>;
  generatedCount: number;
  generatedItems: GeneratedRecurringItemMeta[];
}

const MAX_OCCURRENCES_PER_SOURCE = 120;

/**
 * Generates due recurring instances (ALWAYS with completed = false) across all months
 * strictly up to the real-world date cutoff derived from `referenceDate` (`new Date()`):
 * - Sub-monthly (`daily`, `weekly`, `biweekly`): up to end of real today.
 * - Monthly / quarterly / semiannual / yearly: up to end of the real current calendar month.
 * Never depends on UI-selected month navigation (`currentMonth` / `selectedMonth`).
 * Every recurring Expense generates into Fixed Expenses (`fixed_expenses`), and every generated
 * child sets `expectedDate: occKey` and preserves `repeat` + schedule fields alongside
 * `recurrenceSourceId` without spawning duplicate chains.
 */
export function generateDueRecurringInstances(
  monthlyData: Record<string, MonthlyRecord>,
  options: GenerateRecurringOptions = {}
): GenerateRecurringResult {
  if (!monthlyData || typeof monthlyData !== "object") {
    return { updatedMonthlyData: monthlyData, generatedCount: 0, generatedItems: [] };
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
    bucket: "fixed" | "income";
    item: ExpenseItem | IncomeItem;
    repeat: Exclude<RepeatFrequency, "never">;
  };

  const sources: SourceSpec[] = [];

  Object.entries(monthlyData).forEach(([monthKey, rec]) => {
    if (!rec) return;
    if (Array.isArray(rec.expenses?.fixed_expenses)) {
      rec.expenses.fixed_expenses.forEach((item) => {
        if (isRecurringScheduleRoot(item)) {
          sources.push({
            sourceMonthKey: monthKey,
            bucket: "fixed",
            item,
            repeat: normalizeRepeatValue(item.repeat) as Exclude<RepeatFrequency, "never">,
          });
        }
      });
    }
    if (Array.isArray(rec.expenses?.additional_expenses)) {
      rec.expenses.additional_expenses.forEach((item) => {
        if (isRecurringScheduleRoot(item)) {
          // Any repeating expense generates into Fixed Expenses
          sources.push({
            sourceMonthKey: monthKey,
            bucket: "fixed",
            item,
            repeat: normalizeRepeatValue(item.repeat) as Exclude<RepeatFrequency, "never">,
          });
        }
      });
    }
    if (Array.isArray(rec.incomes)) {
      rec.incomes.forEach((item) => {
        if (isRecurringScheduleRoot(item)) {
          sources.push({
            sourceMonthKey: monthKey,
            bucket: "income",
            item,
            repeat: normalizeRepeatValue(item.repeat) as Exclude<RepeatFrequency, "never">,
          });
        }
      });
    }
  });

  if (sources.length === 0) {
    return { updatedMonthlyData: monthlyData, generatedCount: 0, generatedItems: [] };
  }

  let updatedMonthlyData: Record<string, MonthlyRecord> | null = null;
  let generatedCount = 0;
  const generatedItems: GeneratedRecurringItemMeta[] = [];

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

    const schedule = getItemRecurrenceSchedule(
      { ...src.item, repeat: src.repeat },
      src.sourceMonthKey
    );
    const anchorDay = schedule.dayOfMonth ?? anchorDate.getDate();

    const isSubMonthly =
      src.repeat === "daily" || src.repeat === "weekly" || src.repeat === "biweekly";
    const endOfCurrentCalendarMonth = new Date(
      refDate.getFullYear(),
      refDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    const cutoff = isSubMonthly ? endOfToday : endOfCurrentCalendarMonth;

    for (let step = 1; step <= MAX_OCCURRENCES_PER_SOURCE; step++) {
      const occDate = advanceOccurrenceDate(
        anchorDate,
        anchorDay,
        src.repeat,
        step,
        schedule
      );
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
      const newIdPrefix = src.bucket === "fixed" ? "fix_rec" : "inc_rec";
      const safeKey = occKey.replace(/-/g, "");
      const generatedId = `${newIdPrefix}_${src.item.id}_${safeKey}_${Math.random()
        .toString(36)
        .substring(2, 6)}`;

      const targetRecord = ensureClonedRecord(targetMonthKey);

      const baseGenerated: ExpenseItem = {
        ...src.item,
        id: generatedId,
        date: occIso,
        expectedDate: occKey,
        createdAt: new Date().toISOString(),
        timestamp: occTs,
        completed: false,
        status: "planned",
        completedAt: undefined,
        repeat: src.repeat,
        isRecurring: true,
        recurrenceSourceId: src.item.id,
        recurrenceOccurrenceKey: occKey,
        ...(typeof schedule.dayOfMonth === "number"
          ? { recurrenceDayOfMonth: schedule.dayOfMonth }
          : {}),
        ...(typeof schedule.monthOfYear === "number"
          ? { recurrenceMonthOfYear: schedule.monthOfYear }
          : {}),
        ...(typeof schedule.dayOfWeek === "number"
          ? { recurrenceDayOfWeek: schedule.dayOfWeek }
          : {}),
        sourceMonth: targetMonthKey,
        isFixedItem: true,
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
      } else {
        const incItem: IncomeItem = {
          ...(baseGenerated as IncomeItem),
          type: (src.item as IncomeItem).type || "income",
          isFixedItem: true,
        };
        if (!Array.isArray(targetRecord.incomes)) {
          targetRecord.incomes = [];
        }
        targetRecord.incomes.push(incItem);
      }

      existingKeys.add(compositeKey);
      generatedCount += 1;
      generatedItems.push({
        id: generatedId,
        monthKey: targetMonthKey,
        bucket: src.bucket,
        categoryName: src.item.categoryName,
        amount: Number(src.item.amount) || 0,
        occurrenceKey: occKey,
        sourceId: src.item.id,
      });
    }
  }

  return {
    updatedMonthlyData: updatedMonthlyData ?? monthlyData,
    generatedCount,
    generatedItems,
  };
}
