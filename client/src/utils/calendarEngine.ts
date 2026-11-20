import {
  ExpenseItem,
  IncomeItem,
  MonthlyRecord,
  RecurringIncomeTemplate,
  RepeatFrequency,
  TransactionLocation,
} from "@/types";
import { MONTHS_BG } from "./comparisonStorage";
import { isRecordCompleted } from "./expenseStatus";
import { loadRecurringIncomes } from "./incomeStorage";
import { normalizeLocation } from "./locationUtils";
import {
  advanceOccurrenceDate,
  getDismissedRecurrenceKeys,
  isRecurringScheduleRoot,
  isRepeatingFrequency,
  normalizeRepeatValue,
  parseMonthKeyToYearMonth,
} from "./recurrenceEngine";

export type CalendarEventKind = "expense" | "income";
export type CalendarFilterMode =
  | "all"
  | "expenses"
  | "incomes"
  | "upcoming"
  | "completed"
  | "recurring";

export interface CalendarEvent {
  id: string;
  sourceId: string;
  monthKey: string;
  recordListType: "fixed" | "additional" | "income" | "template";
  kind: CalendarEventKind;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  merchantName?: string;
  note?: string;
  location?: TransactionLocation;
  amount: number;
  dateKey: string; // YYYY-MM-DD local
  isCompleted: boolean;
  isUpcoming: boolean;
  isRecurring: boolean;
  repeat: RepeatFrequency;
  isProjected: boolean;
  recurrenceSourceId?: string;
  recurrenceOccurrenceKey?: string;
  templateId?: string;
  sourceMonthKey?: string;
}

export interface CalendarDayCell {
  dateKey: string;
  date: Date;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDateKey(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateKey || "").trim());
  if (!match) {
    const fallback = new Date();
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 12, 0, 0, 0);
  }
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0,
    0
  );
}

/**
 * Converts a YYYY-MM-DD input string to a stable midday ISO string so date rendering
 * never shifts across UTC timezones.
 */
export function dateKeyToStableIso(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  return d.toISOString();
}

export function getMonthKeyFromDateKey(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  return `${MONTHS_BG[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Resolves any ExpenseItem / IncomeItem to a clean local YYYY-MM-DD key.
 * Priority: item.expectedDate -> item.date -> item.createdAt -> fallbackMonthKey first day.
 */
export function resolveRecordDateKey(
  item: Pick<ExpenseItem, "expectedDate" | "date" | "createdAt" | "recurrenceOccurrenceKey">,
  fallbackMonthKey?: string
): string {
  const rawExpected = (item.expectedDate || "").trim();
  if (rawExpected) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawExpected)) {
      return rawExpected;
    }
    const parsedExpected = new Date(rawExpected);
    if (!isNaN(parsedExpected.getTime())) {
      return toLocalDateKey(parsedExpected);
    }
  }

  const rawDate = (item.date || item.createdAt || "").trim();
  if (rawDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return rawDate;
    }
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      return toLocalDateKey(parsed);
    }
  }

  if (
    item.recurrenceOccurrenceKey &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.recurrenceOccurrenceKey.trim())
  ) {
    return item.recurrenceOccurrenceKey.trim();
  }

  if (fallbackMonthKey) {
    const ym = parseMonthKeyToYearMonth(fallbackMonthKey);
    if (ym) {
      return `${ym.year}-${String(ym.monthIndex + 1).padStart(2, "0")}-01`;
    }
  }

  return toLocalDateKey(new Date());
}

/**
 * Generates projected occurrence dates for a RecurringIncomeTemplate within [rangeStartKey, rangeEndKey].
 */
function getTemplateOccurrenceDates(
  template: RecurringIncomeTemplate,
  rangeStartKey: string,
  rangeEndKey: string
): Array<{ dateKey: string; occurrenceKey: string }> {
  if (!template.active) return [];
  const startDateObj = parseLocalDateKey(template.startDate || rangeStartKey);
  const startKey = toLocalDateKey(startDateObj);
  const effectiveStartKey = startKey > rangeStartKey ? startKey : rangeStartKey;
  if (effectiveStartKey > rangeEndKey) return [];

  const rangeStartObj = parseLocalDateKey(rangeStartKey);
  const rangeEndObj = parseLocalDateKey(rangeEndKey);
  const results: Array<{ dateKey: string; occurrenceKey: string }> = [];

  if (template.frequency === "monthly") {
    let year = rangeStartObj.getFullYear();
    let month = rangeStartObj.getMonth();
    const endYear = rangeEndObj.getFullYear();
    const endMonth = rangeEndObj.getMonth();
    const anchorDay = Math.max(1, Number(template.dayOfMonth) || startDateObj.getDate());

    let guard = 0;
    while ((year < endYear || (year === endYear && month <= endMonth)) && guard < 120) {
      guard++;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const day = Math.min(anchorDay, lastDay);
      const occDate = new Date(year, month, day, 12, 0, 0, 0);
      const dateKey = toLocalDateKey(occDate);
      const occurrenceKey = `${year}-${String(month + 1).padStart(2, "0")}`;
      if (dateKey >= startKey && dateKey >= rangeStartKey && dateKey <= rangeEndKey) {
        results.push({ dateKey, occurrenceKey });
      }
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
    }
  } else if (template.frequency === "weekly") {
    const targetDow =
      typeof template.dayOfWeek === "number" ? template.dayOfWeek : startDateObj.getDay();
    let cursor = new Date(rangeStartObj.getFullYear(), rangeStartObj.getMonth(), rangeStartObj.getDate(), 12, 0, 0, 0);
    const diff = (targetDow - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + diff);

    let guard = 0;
    while (cursor <= rangeEndObj && guard < 200) {
      guard++;
      const dateKey = toLocalDateKey(cursor);
      if (dateKey >= startKey && dateKey >= rangeStartKey && dateKey <= rangeEndKey) {
        results.push({ dateKey, occurrenceKey: dateKey });
      }
      cursor.setDate(cursor.getDate() + 7);
    }
  } else if (template.frequency === "yearly") {
    const startY = rangeStartObj.getFullYear();
    const endY = rangeEndObj.getFullYear();
    const targetMonth =
      typeof template.monthOfYear === "number" ? template.monthOfYear : startDateObj.getMonth();
    const anchorDay = Math.max(1, Number(template.dayOfMonth) || startDateObj.getDate());

    for (let y = startY; y <= endY; y++) {
      const lastDay = new Date(y, targetMonth + 1, 0).getDate();
      const day = Math.min(anchorDay, lastDay);
      const occDate = new Date(y, targetMonth, day, 12, 0, 0, 0);
      const dateKey = toLocalDateKey(occDate);
      if (dateKey >= startKey && dateKey >= rangeStartKey && dateKey <= rangeEndKey) {
        results.push({ dateKey, occurrenceKey: String(y) });
      }
    }
  }

  return results;
}

/**
 * Returns all calendar events (Completed, Upcoming, and Projected Recurring) within [rangeStart, rangeEnd].
 * Materialized records are always included on their exact resolved dateKey; recurring roots also project
 * future scheduled occurrences into future months/days without duplicating materialized instances.
 */
export function getCalendarEventsForRange(
  monthlyData: Record<string, MonthlyRecord>,
  rangeStart: Date,
  rangeEnd: Date,
  templatesOverride?: RecurringIncomeTemplate[]
): CalendarEvent[] {
  const rangeStartKey = toLocalDateKey(rangeStart);
  const rangeEndKey = toLocalDateKey(rangeEnd);
  const rangeEndObj = parseLocalDateKey(rangeEndKey);

  const dismissedKeys = getDismissedRecurrenceKeys();
  const events: CalendarEvent[] = [];
  const materializedOccurrencePairs = new Set<string>();
  const materializedDateCategoryPairs = new Set<string>();

  const recurringExpenseRoots: Array<{
    item: ExpenseItem;
    monthKey: string;
    anchorDate: Date;
    repeat: RepeatFrequency;
  }> = [];

  const recurringIncomeRoots: Array<{
    item: IncomeItem;
    monthKey: string;
    anchorDate: Date;
    repeat: RepeatFrequency;
  }> = [];

  // 1. Collect all materialized expenses and incomes + identify recurring roots
  for (const [monthKey, record] of Object.entries(monthlyData || {})) {
    const fixedExpenses = record?.expenses?.fixed_expenses || [];
    const additionalExpenses = record?.expenses?.additional_expenses || [];
    const incomes = record?.incomes || [];

    const processExpense = (item: ExpenseItem, recordListType: "fixed" | "additional") => {
      const dateKey = resolveRecordDateKey(item, monthKey);
      const repeat = normalizeRepeatValue(item.repeat || (item.isRecurring ? "monthly" : "never"));
      const isRecurring = recordListType === "fixed" || isRepeatingFrequency(repeat) || Boolean(item.isRecurring);
      const completed = isRecordCompleted(item);

      if (item.recurrenceSourceId && item.recurrenceOccurrenceKey) {
        materializedOccurrencePairs.add(`${item.recurrenceSourceId}::${item.recurrenceOccurrenceKey}`);
      }
      materializedOccurrencePairs.add(`${item.id}::${dateKey}`);
      materializedDateCategoryPairs.add(`expense::${item.categoryName.toLowerCase()}::${dateKey}`);

      if (isRecurringScheduleRoot(item)) {
        const effectiveRepeat = isRepeatingFrequency(repeat) ? repeat : "monthly";
        recurringExpenseRoots.push({
          item,
          monthKey,
          anchorDate: parseLocalDateKey(dateKey),
          repeat: effectiveRepeat,
        });
      }

      if (dateKey >= rangeStartKey && dateKey <= rangeEndKey) {
        events.push({
          id: item.id,
          sourceId: item.id,
          monthKey,
          recordListType,
          kind: "expense",
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          categoryIcon: item.categoryIcon,
          categoryColor: item.categoryColor,
          merchantName: item.merchantName,
          note: item.note,
          location: normalizeLocation(item.location),
          amount: Number(item.amount) || 0,
          dateKey,
          isCompleted: completed,
          isUpcoming: !completed,
          isRecurring,
          repeat,
          isProjected: false,
          recurrenceSourceId: item.recurrenceSourceId,
          recurrenceOccurrenceKey: item.recurrenceOccurrenceKey,
        });
      }
    };

    for (const item of fixedExpenses) {
      processExpense(item, "fixed");
    }
    for (const item of additionalExpenses) {
      processExpense(item, "additional");
    }

    for (const inc of incomes) {
      const dateKey = resolveRecordDateKey(inc, monthKey);
      const repeat = normalizeRepeatValue(inc.repeat || (inc.isRecurring ? "monthly" : "never"));
      const isRecurring =
        Boolean(inc.isFixedItem) ||
        isRepeatingFrequency(repeat) ||
        Boolean(inc.isRecurring) ||
        Boolean(inc.recurringTemplateId);
      const completed = isRecordCompleted(inc);

      if (inc.recurrenceSourceId && inc.recurrenceOccurrenceKey) {
        materializedOccurrencePairs.add(`${inc.recurrenceSourceId}::${inc.recurrenceOccurrenceKey}`);
      }
      materializedOccurrencePairs.add(`${inc.id}::${dateKey}`);
      materializedDateCategoryPairs.add(`income::${inc.categoryName.toLowerCase()}::${dateKey}`);
      if (inc.recurringTemplateId) {
        materializedDateCategoryPairs.add(`tpl::${inc.recurringTemplateId}::${dateKey}`);
      }

      if (isRecurringScheduleRoot(inc)) {
        const effectiveRepeat = isRepeatingFrequency(repeat) ? repeat : "monthly";
        recurringIncomeRoots.push({
          item: inc,
          monthKey,
          anchorDate: parseLocalDateKey(dateKey),
          repeat: effectiveRepeat,
        });
      }

      if (dateKey >= rangeStartKey && dateKey <= rangeEndKey) {
        events.push({
          id: inc.id,
          sourceId: inc.id,
          monthKey,
          recordListType: "income",
          kind: "income",
          categoryId: inc.categoryId,
          categoryName: inc.categoryName,
          categoryIcon: inc.categoryIcon,
          categoryColor: inc.categoryColor,
          note: inc.note,
          location: normalizeLocation(inc.location),
          amount: Number(inc.amount) || 0,
          dateKey,
          isCompleted: completed,
          isUpcoming: !completed,
          isRecurring,
          repeat,
          isProjected: false,
          recurrenceSourceId: inc.recurrenceSourceId,
          recurrenceOccurrenceKey: inc.recurrenceOccurrenceKey,
        });
      }
    }
  }

  // 2. Project future/range occurrences for recurring expense roots
  for (const root of recurringExpenseRoots) {
    if (root.repeat === "never") continue;
    const anchorDay = root.anchorDate.getDate();
    let stepIndex = 1;
    let cursor = advanceOccurrenceDate(root.anchorDate, anchorDay, root.repeat, stepIndex);

    while (cursor <= rangeEndObj && stepIndex <= 240) {
      const occKey = toLocalDateKey(cursor);
      const pair = `${root.item.id}::${occKey}`;

      if (occKey >= rangeStartKey && !materializedOccurrencePairs.has(pair) && !dismissedKeys.has(pair)) {
        materializedOccurrencePairs.add(pair);
        events.push({
          id: `proj_${root.item.id}_${occKey}`,
          sourceId: root.item.id,
          monthKey: getMonthKeyFromDateKey(occKey),
          recordListType: "fixed",
          kind: "expense",
          categoryId: root.item.categoryId,
          categoryName: root.item.categoryName,
          categoryIcon: root.item.categoryIcon,
          categoryColor: root.item.categoryColor,
          merchantName: root.item.merchantName,
          note: root.item.note,
          location: normalizeLocation(root.item.location),
          amount: Number(root.item.amount) || 0,
          dateKey: occKey,
          isCompleted: false,
          isUpcoming: true,
          isRecurring: true,
          repeat: root.repeat,
          isProjected: true,
          recurrenceSourceId: root.item.id,
          recurrenceOccurrenceKey: occKey,
          sourceMonthKey: root.monthKey,
        });
      }

      stepIndex += 1;
      cursor = advanceOccurrenceDate(root.anchorDate, anchorDay, root.repeat, stepIndex);
    }
  }

  // 3. Project future/range occurrences for recurring income roots
  for (const root of recurringIncomeRoots) {
    if (root.repeat === "never") continue;
    const anchorDay = root.anchorDate.getDate();
    let stepIndex = 1;
    let cursor = advanceOccurrenceDate(root.anchorDate, anchorDay, root.repeat, stepIndex);

    while (cursor <= rangeEndObj && stepIndex <= 240) {
      const occKey = toLocalDateKey(cursor);
      const pair = `${root.item.id}::${occKey}`;

      if (occKey >= rangeStartKey && !materializedOccurrencePairs.has(pair) && !dismissedKeys.has(pair)) {
        materializedOccurrencePairs.add(pair);
        events.push({
          id: `proj_${root.item.id}_${occKey}`,
          sourceId: root.item.id,
          monthKey: getMonthKeyFromDateKey(occKey),
          recordListType: "income",
          kind: "income",
          categoryId: root.item.categoryId,
          categoryName: root.item.categoryName,
          categoryIcon: root.item.categoryIcon,
          categoryColor: root.item.categoryColor,
          note: root.item.note,
          location: normalizeLocation(root.item.location),
          amount: Number(root.item.amount) || 0,
          dateKey: occKey,
          isCompleted: false,
          isUpcoming: true,
          isRecurring: true,
          repeat: root.repeat,
          isProjected: true,
          recurrenceSourceId: root.item.id,
          recurrenceOccurrenceKey: occKey,
          sourceMonthKey: root.monthKey,
        });
      }

      stepIndex += 1;
      cursor = advanceOccurrenceDate(root.anchorDate, anchorDay, root.repeat, stepIndex);
    }
  }

  // 4. Project active legacy RecurringIncomeTemplates
  const templates = templatesOverride ?? loadRecurringIncomes();
  for (const tpl of templates) {
    if (!tpl.active) continue;
    const occList = getTemplateOccurrenceDates(tpl, rangeStartKey, rangeEndKey);
    const repeatMap: Record<string, RepeatFrequency> = {
      weekly: "weekly",
      monthly: "monthly",
      yearly: "yearly",
    };

    for (const { dateKey, occurrenceKey } of occList) {
      const handled = tpl.handledOccurrences?.[occurrenceKey];
      if (handled === "confirmed" || handled === "skipped") continue;
      if (materializedDateCategoryPairs.has(`tpl::${tpl.id}::${dateKey}`)) continue;
      if (materializedDateCategoryPairs.has(`income::${tpl.categoryName.toLowerCase()}::${dateKey}`)) {
        continue;
      }

      events.push({
        id: `proj_tpl_${tpl.id}_${dateKey}`,
        sourceId: tpl.id,
        monthKey: getMonthKeyFromDateKey(dateKey),
        recordListType: "template",
        kind: "income",
        categoryId: tpl.categoryId,
        categoryName: tpl.categoryName,
        categoryIcon: tpl.categoryIcon,
        categoryColor: tpl.categoryColor,
        note: tpl.note,
        location: normalizeLocation(tpl.location),
        amount: Number(tpl.amount) || 0,
        dateKey,
        isCompleted: false,
        isUpcoming: true,
        isRecurring: true,
        repeat: repeatMap[tpl.frequency] || "monthly",
        isProjected: true,
        templateId: tpl.id,
        recurrenceOccurrenceKey: occurrenceKey,
      });
    }
  }

  return events.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
    if (a.kind !== b.kind) return a.kind === "income" ? -1 : 1;
    return b.amount - a.amount;
  });
}

export function filterCalendarEvents(
  events: CalendarEvent[],
  filter: CalendarFilterMode
): CalendarEvent[] {
  switch (filter) {
    case "expenses":
      return events.filter((e) => e.kind === "expense");
    case "incomes":
      return events.filter((e) => e.kind === "income");
    case "upcoming":
      return events.filter((e) => e.isUpcoming);
    case "completed":
      return events.filter((e) => e.isCompleted);
    case "recurring":
      return events.filter((e) => e.isRecurring);
    case "all":
    default:
      return events;
  }
}

/**
 * Builds Monday-first calendar grid cells for the given 0-indexed month & year.
 */
export function buildMonthCalendarGrid(year: number, monthIndex: number): CalendarDayCell[] {
  const firstOfMonth = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  const lastOfMonth = new Date(year, monthIndex + 1, 0, 12, 0, 0, 0);
  const todayKey = toLocalDateKey(new Date());

  // Monday = 0 ... Sunday = 6
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const totalDaysInMonth = lastOfMonth.getDate();
  const totalCells = Math.ceil((startOffset + totalDaysInMonth) / 7) * 7;

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const cellDate = new Date(year, monthIndex, 1 - startOffset + i, 12, 0, 0, 0);
    const dateKey = toLocalDateKey(cellDate);
    cells.push({
      dateKey,
      date: cellDate,
      dayOfMonth: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === monthIndex && cellDate.getFullYear() === year,
      isToday: dateKey === todayKey,
    });
  }

  return cells;
}

export interface DaySummaryTotals {
  expensesTotal: number;
  incomesTotal: number;
  completedExpensesTotal: number;
  upcomingExpensesTotal: number;
  completedIncomesTotal: number;
  upcomingIncomesTotal: number;
  net: number;
}

export function summarizeDayEvents(dayEvents: CalendarEvent[]): DaySummaryTotals {
  let expensesTotal = 0;
  let incomesTotal = 0;
  let completedExpensesTotal = 0;
  let upcomingExpensesTotal = 0;
  let completedIncomesTotal = 0;
  let upcomingIncomesTotal = 0;

  for (const ev of dayEvents) {
    if (ev.kind === "expense") {
      expensesTotal += ev.amount;
      if (ev.isCompleted) completedExpensesTotal += ev.amount;
      else upcomingExpensesTotal += ev.amount;
    } else {
      incomesTotal += ev.amount;
      if (ev.isCompleted) completedIncomesTotal += ev.amount;
      else upcomingIncomesTotal += ev.amount;
    }
  }

  return {
    expensesTotal: Math.round(expensesTotal * 100) / 100,
    incomesTotal: Math.round(incomesTotal * 100) / 100,
    completedExpensesTotal: Math.round(completedExpensesTotal * 100) / 100,
    upcomingExpensesTotal: Math.round(upcomingExpensesTotal * 100) / 100,
    completedIncomesTotal: Math.round(completedIncomesTotal * 100) / 100,
    upcomingIncomesTotal: Math.round(upcomingIncomesTotal * 100) / 100,
    net: Math.round((incomesTotal - expensesTotal) * 100) / 100,
  };
}
