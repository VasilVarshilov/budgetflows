import {
  AppSettings,
  MonthlyRecord,
  RecurrenceFrequency,
  RecurringIncomeTemplate,
} from "@/types";
import { MONTHS_BG } from "./comparisonStorage";
import {
  userStorage,
  STORAGE_BASE_RECURRING_INCOMES,
  STORAGE_BASE_SETTINGS,
} from "./userStorage";

export const STORAGE_KEY_RECURRING_INCOMES = "HomeBudget_RecurringIncomes";
export const STORAGE_KEY_APP_SETTINGS = "HomeBudget_Settings";

export const DEFAULT_SAVINGS_TARGET_PERCENT = 20;

export const WEEKDAYS_BG = [
  "Неделя",
  "Понеделник",
  "Вторник",
  "Сряда",
  "Четвъртък",
  "Петък",
  "Събота",
];

export const MONTHS_SHORT_BG = [
  "Яну",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Юни",
  "Юли",
  "Авг",
  "Сеп",
  "Окт",
  "Ное",
  "Дек",
];

export function loadRecurringIncomes(): RecurringIncomeTemplate[] {
  try {
    const raw = userStorage.getItem(STORAGE_BASE_RECURRING_INCOMES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed loading recurring incomes:", err);
    return [];
  }
}

export function saveRecurringIncomes(templates: RecurringIncomeTemplate[]): void {
  try {
    userStorage.setItem(
      STORAGE_BASE_RECURRING_INCOMES,
      JSON.stringify(templates)
    );
  } catch (err) {
    console.error("Failed saving recurring incomes:", err);
  }
}

export function loadAppSettings(): AppSettings {
  const defaults: AppSettings = {
    currency: "EUR",
    language: "bg",
    theme: "light",
    autoSaveElectricity: true,
    defaultPriceT1: "0.15458",
    defaultPriceT2: "0.09226",
    notificationReminder: true,
    savingsTargetPercent: DEFAULT_SAVINGS_TARGET_PERCENT,
  };

  try {
    const raw = userStorage.getItem(STORAGE_BASE_SETTINGS);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      savingsTargetPercent:
        typeof parsed?.savingsTargetPercent === "number" &&
        !isNaN(parsed.savingsTargetPercent)
          ? Math.min(100, Math.max(0, parsed.savingsTargetPercent))
          : DEFAULT_SAVINGS_TARGET_PERCENT,
    };
  } catch {
    return defaults;
  }
}

export function saveAppSettings(updates: Partial<AppSettings>): AppSettings {
  const current = loadAppSettings();
  const next: AppSettings = {
    ...current,
    ...updates,
  };
  try {
    userStorage.setItem(STORAGE_BASE_SETTINGS, JSON.stringify(next));
  } catch (err) {
    console.error("Failed saving app settings:", err);
  }
  return next;
}

/**
 * Converts a date (Date or ISO / YYYY-MM-DD string) into a MonthlyRecord key like "Ноември 2026".
 */
export function getMonthKeyFromDate(dateInput: Date | string): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const safeDate = isNaN(d.getTime()) ? new Date() : d;
  const monthName = MONTHS_BG[safeDate.getMonth()];
  return `${monthName} ${safeDate.getFullYear()}`;
}

export function toLocalYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Computes the current cycle's due occurrence key & due date for a recurring template.
 * Does NOT auto-create income items — only detects whether a confirmation banner should appear.
 */
export function getCurrentCycleOccurrence(
  template: RecurringIncomeTemplate,
  referenceDate: Date = new Date()
): {
  occurrenceKey: string;
  dueDate: Date;
  dueDateIso: string;
  isDue: boolean;
} {
  const today = startOfDay(referenceDate);
  const startRaw = template.startDate ? new Date(template.startDate + "T00:00:00") : today;
  const start = isNaN(startRaw.getTime()) ? today : startOfDay(startRaw);

  if (template.frequency === "monthly") {
    const year = today.getFullYear();
    const month = today.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const desiredDay = Math.min(Math.max(1, template.dayOfMonth || start.getDate()), lastDay);
    const dueDate = new Date(year, month, desiredDay);
    const occurrenceKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    const isDue = today >= dueDate && dueDate >= start;
    return {
      occurrenceKey,
      dueDate,
      dueDateIso: toLocalYyyyMmDd(dueDate),
      isDue,
    };
  }

  if (template.frequency === "weekly") {
    const targetDow =
      typeof template.dayOfWeek === "number" ? template.dayOfWeek : start.getDay();
    const diff = (today.getDay() - targetDow + 7) % 7;
    const dueDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
    const occurrenceKey = toLocalYyyyMmDd(dueDate);
    const isDue = dueDate <= today && dueDate >= start;
    return {
      occurrenceKey,
      dueDate,
      dueDateIso: occurrenceKey,
      isDue,
    };
  }

  // yearly
  const year = today.getFullYear();
  const targetMonth =
    typeof template.monthOfYear === "number" ? template.monthOfYear : start.getMonth();
  const lastDay = new Date(year, targetMonth + 1, 0).getDate();
  const desiredDay = Math.min(Math.max(1, template.dayOfMonth || start.getDate()), lastDay);
  const dueDate = new Date(year, targetMonth, desiredDay);
  const occurrenceKey = String(year);
  const isDue = today >= dueDate && dueDate >= start;
  return {
    occurrenceKey,
    dueDate,
    dueDateIso: toLocalYyyyMmDd(dueDate),
    isDue,
  };
}

export interface DueExpectedIncome {
  template: RecurringIncomeTemplate;
  occurrenceKey: string;
  dueDate: Date;
  dueDateIso: string;
  scheduleLabel: string;
}

/**
 * Returns all active recurring income templates whose current cycle due date has arrived
 * and has NOT yet been confirmed or skipped.
 */
export function getDueExpectedIncomes(
  templates: RecurringIncomeTemplate[],
  referenceDate: Date = new Date()
): DueExpectedIncome[] {
  const results: DueExpectedIncome[] = [];

  for (const tpl of templates) {
    if (!tpl.active) continue;
    const cycle = getCurrentCycleOccurrence(tpl, referenceDate);
    if (!cycle.isDue) continue;

    const status = tpl.handledOccurrences?.[cycle.occurrenceKey];
    if (status === "confirmed" || status === "skipped") continue;

    results.push({
      template: tpl,
      occurrenceKey: cycle.occurrenceKey,
      dueDate: cycle.dueDate,
      dueDateIso: cycle.dueDateIso,
      scheduleLabel: formatRecurrenceSchedule(tpl),
    });
  }

  return results.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function formatFrequencyLabel(freq: RecurrenceFrequency): string {
  switch (freq) {
    case "weekly":
      return "Седмичен";
    case "yearly":
      return "Годишен";
    case "monthly":
    default:
      return "Месечен";
  }
}

export function formatRecurrenceSchedule(template: RecurringIncomeTemplate): string {
  if (template.frequency === "weekly") {
    const dow =
      typeof template.dayOfWeek === "number"
        ? template.dayOfWeek
        : new Date(template.startDate + "T00:00:00").getDay();
    return `Всяка седмица (${WEEKDAYS_BG[dow] || "Понеделник"})`;
  }
  if (template.frequency === "yearly") {
    const start = new Date(template.startDate + "T00:00:00");
    const m =
      typeof template.monthOfYear === "number"
        ? template.monthOfYear
        : isNaN(start.getTime())
        ? 0
        : start.getMonth();
    const d = template.dayOfMonth || (isNaN(start.getTime()) ? 1 : start.getDate());
    return `Всяка година (${d} ${MONTHS_SHORT_BG[m] || ""})`;
  }
  const start = new Date(template.startDate + "T00:00:00");
  const d = template.dayOfMonth || (isNaN(start.getTime()) ? 1 : start.getDate());
  return `Всеки месец (на ${d}-о число)`;
}

/**
 * Helper to create a clean empty MonthlyRecord shell if adding income to a month with no record yet.
 */
export function createEmptyMonthlyRecord(monthKey: string): MonthlyRecord {
  return {
    month: monthKey,
    tab: "income",
    meta: { generated_at: new Date().toISOString() },
    inputs: {
      old_t1: 0,
      new_t1: 0,
      old_t2: 0,
      new_t2: 0,
      day_price_with_vat: 0,
      night_price_with_vat: 0,
      invoice_total: 0,
    },
    results: {
      cons_t1_kwh: 0,
      cons_t2_kwh: 0,
      total_cons_em1_kwh: 0,
      cost_em1_eur: 0,
      em2_remainder_eur: 0,
    },
    expenses: {
      saved_em2_eur: 0,
      fixed_expenses: [],
      additional_expenses: [],
    },
    incomes: [],
  };
}
