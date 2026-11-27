import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  type SupportedLanguage,
} from "./types";
import { bg, type TranslationSchema } from "./resources/bg";
import { en } from "./resources/en";
import type { TranslationShape } from "./types";
import type { AppNotification } from "@/types";

export const RESOURCES: Record<SupportedLanguage, TranslationShape<TranslationSchema>> = {
  bg,
  en,
};

const BG_MONTHS = bg.months.full;

export function isSupportedLanguage(val: unknown): val is SupportedLanguage {
  return val === "bg" || val === "en";
}

export function getCurrentLanguage(): SupportedLanguage {
  try {
    if (typeof window === "undefined") return DEFAULT_LANGUAGE;
    const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(raw)) return raw;
  } catch {
    // ignore storage access issues
  }
  return DEFAULT_LANGUAGE;
}

export function setStoredLanguage(lang: SupportedLanguage): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  } catch {
    // ignore storage errors
  }
}

export function getIntlLocale(lang: SupportedLanguage = getCurrentLanguage()): string {
  const found = LANGUAGE_OPTIONS.find((opt) => opt.code === lang);
  return found?.locale ?? "en-US";
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let curr: unknown = obj;
  for (const part of parts) {
    if (curr && typeof curr === "object" && part in (curr as Record<string, unknown>)) {
      curr = (curr as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return curr;
}

export function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params[key] !== undefined ? String(params[key]) : match
  );
}

export function t(
  key: string,
  params?: Record<string, string | number>,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  let value = getNestedValue(dict, key);
  if (typeof value !== "string") {
    value = getNestedValue(RESOURCES[DEFAULT_LANGUAGE], key);
  }
  if (typeof value !== "string") {
    return key;
  }
  return interpolate(value, params);
}

/**
 * Translates a canonical Bulgarian month name (e.g. "Януари") into the active language.
 */
export function translateMonthName(
  monthBg: string,
  lang: SupportedLanguage = getCurrentLanguage(),
  short = false
): string {
  if (!monthBg) return monthBg;
  const idx = BG_MONTHS.findIndex((m) => m.toLowerCase() === monthBg.trim().toLowerCase());
  if (idx === -1) return monthBg;
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  return short ? dict.months.short[idx] ?? monthBg : dict.months.full[idx] ?? monthBg;
}

/**
 * Formats a canonical month-year key like "Ноември 2026" for display without mutating storage keys.
 */
export function formatLocalizedMonthYear(
  monthYearKey: string,
  lang: SupportedLanguage = getCurrentLanguage(),
  shortMonth = false
): string {
  if (!monthYearKey) return monthYearKey;
  const trimmed = monthYearKey.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const maybeMonth = parts[0];
    const rest = parts.slice(1).join(" ");
    const translatedMonth = translateMonthName(maybeMonth, lang, shortMonth);
    if (translatedMonth !== maybeMonth || lang === "bg") {
      return `${translatedMonth} ${rest}`;
    }
  }
  return monthYearKey;
}

/**
 * Translates an electricity record period label such as "Април 2026" or "Април 2026 (2)".
 */
export function translateElectricityPeriodLabel(
  periodLabel: string,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  if (!periodLabel) return periodLabel;
  const match = periodLabel.trim().match(/^(\S+)(\s+.*)?$/);
  if (!match) return periodLabel;
  const firstWord = match[1];
  const suffix = match[2] ?? "";
  const idx = BG_MONTHS.findIndex((m) => m.toLowerCase() === firstWord.toLowerCase());
  if (idx === -1) return periodLabel;
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  return `${dict.months.full[idx] ?? firstWord}${suffix}`;
}

export function formatShortMonthIndex(
  monthIndex0to11: number,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  return dict.months.short[monthIndex0to11] ?? "";
}

export function formatFullMonthIndex(
  monthIndex0to11: number,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  return dict.months.full[monthIndex0to11] ?? "";
}

export function translateWeekday(
  dayIndex0to6: number,
  short = false,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  const arr = short ? dict.weekdays.short : dict.weekdays.full;
  return arr[((dayIndex0to6 % 7) + 7) % 7] ?? "";
}

export function getMonFirstWeekdaysShort(
  lang: SupportedLanguage = getCurrentLanguage()
): readonly string[] {
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  return dict.weekdays.monFirstShort;
}

/**
 * Translates built-in categories while preserving user-created custom categories untouched.
 */
export function translateCategoryName(
  name: string,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  if (!name) return name;
  if (lang === "bg") return name;
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  const expMap = dict.categories.expense as Record<string, string>;
  if (expMap[name]) return expMap[name];
  const incMap = dict.categories.income as Record<string, string>;
  if (incMap[name]) return incMap[name];
  return name;
}

/**
 * Translates only the built-in system Emergency Fund goal name; user-created goal names remain untouched.
 */
export function translateGoalName(
  name: string,
  isEmergencyFund = false,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  if (isEmergencyFund || name === "Авариен фонд") {
    return t("savings.emergencyFundTitle", undefined, lang);
  }
  return name;
}

/**
 * Translates default budget names while leaving custom budget names untouched.
 */
export function translateBudgetName(
  name: string,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  if (!name || lang === "bg") return name;
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  const defaultsMap = dict.budgets.defaults as Record<string, string>;
  return defaultsMap[name] ?? name;
}

/**
 * Translates color labels by color ID (e.g. "blue") or canonical BG label (e.g. "Син").
 */
export function translateColorLabel(
  colorIdOrLabel: string,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  const colorsMap = dict.colors as Record<string, string>;
  if (colorsMap[colorIdOrLabel]) return colorsMap[colorIdOrLabel];
  const bgColors = bg.colors as Record<string, string>;
  const matchedId = Object.keys(bgColors).find(
    (id) => bgColors[id].toLowerCase() === colorIdOrLabel.toLowerCase()
  );
  if (matchedId && colorsMap[matchedId]) {
    return colorsMap[matchedId];
  }
  return colorIdOrLabel;
}

export function localizeComparisonMetricName(
  metricName: string,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  if (lang === "bg") return metricName;
  const dict = RESOURCES[lang] ?? RESOURCES[DEFAULT_LANGUAGE];
  const map = dict.comparison.metrics as Record<string, string>;
  return map[metricName] ?? metricName;
}

export function getLocalizedMeterType(
  mode: "single" | "double",
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  return mode === "double"
    ? t("electricity.doubleMeter", undefined, lang)
    : t("electricity.singleMeter", undefined, lang);
}

/**
 * Translates system-generated electricity record notes while preserving user-entered custom notes.
 */
export function translateElectricityNote(
  note: string | undefined,
  lang: SupportedLanguage = getCurrentLanguage()
): string | undefined {
  if (!note) return note;
  if (lang === "bg") return note;
  if (note === "Сканирана сметка за ток") {
    return t("electricity.scannedBillNote", undefined, lang);
  }
  if (note === "Ръчен запис (Разходи)") {
    return t("electricity.manualExpenseNote", undefined, lang);
  }
  if (note === "Ръчен запис (Ток)") {
    return t("electricity.manualDefaultNote", undefined, lang);
  }
  return note;
}

export function formatLocalizedDate(
  value: Date | string | number,
  lang: SupportedLanguage = getCurrentLanguage(),
  options?: Intl.DateTimeFormatOptions
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const defaultOptions: Intl.DateTimeFormatOptions =
    lang === "en"
      ? { month: "short", day: "numeric", year: "numeric" }
      : { day: "2-digit", month: "2-digit", year: "numeric" };
  return date.toLocaleDateString(getIntlLocale(lang), options ?? defaultOptions);
}

export function formatLocalizedDateTime(
  value: Date | string | number,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(getIntlLocale(lang), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseBgDateString(bgDate: string): Date | null {
  const match = bgDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]) - 1;
  const y = Number(match[3]);
  const dt = new Date(y, m, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Dynamically localizes stored AppNotification entries without changing persisted storage payloads.
 */
export function localizeNotification(
  n: AppNotification,
  lang: SupportedLanguage = getCurrentLanguage()
): { title: string; message: string; resolvedNote?: string } {
  let title = n.title;
  let message = n.message;
  let resolvedNote = n.resolvedNote;

  // Localize resolvedNote
  if (resolvedNote) {
    if (resolvedNote === "Записът е изтрит") {
      resolvedNote = t("notifications.templates.resolvedDeleted", undefined, lang);
    } else if (resolvedNote === "Премина в просрочени") {
      resolvedNote = t("notifications.templates.resolvedMovedOverdue", undefined, lang);
    } else if (resolvedNote.startsWith("Изпълнен на ")) {
      const rawDate = resolvedNote.replace("Изпълнен на ", "").trim();
      const parsed = parseBgDateString(rawDate);
      const formatted = parsed ? formatLocalizedDate(parsed, lang) : rawDate;
      resolvedNote = t("notifications.templates.resolvedCompletedOn", { date: formatted }, lang);
    } else if (resolvedNote.startsWith("Пренасрочен за ")) {
      const rawDate = resolvedNote.replace("Пренасрочен за ", "").trim();
      const parsed = parseBgDateString(rawDate);
      const formatted = parsed ? formatLocalizedDate(parsed, lang) : rawDate;
      resolvedNote = t("notifications.templates.resolvedPostponedTo", { date: formatted }, lang);
    }
  }

  if (n.type === "upcoming_expense" || n.type === "upcoming_income") {
    const rawCat = n.categoryName || n.title;
    const translatedCat = translateCategoryName(rawCat, lang);
    title = n.amount !== undefined ? `${translatedCat} (€${n.amount.toFixed(2)})` : translatedCat;
    message =
      n.type === "upcoming_expense"
        ? t("notifications.templates.dueTodayExpense", undefined, lang)
        : t("notifications.templates.dueTodayIncome", undefined, lang);
  } else if (n.type === "overdue_expense" || n.type === "overdue_income") {
    const rawCat = n.categoryName || n.title;
    const translatedCat = translateCategoryName(rawCat, lang);
    title = n.amount !== undefined ? `${translatedCat} (€${n.amount.toFixed(2)})` : translatedCat;
    const daysMatch = n.message.match(/(\d+)/);
    const days = daysMatch ? Number(daysMatch[1]) : 1;
    const dayWord =
      days === 1
        ? t("common.daysSingular", undefined, lang)
        : t("common.daysPlural", undefined, lang);
    message = t("notifications.templates.overdueByDays", { days, dayWord }, lang);
  } else if (n.type === "goal_milestone") {
    const quoteMatch = n.title.match(/„([^“]+)”|„([^“]+)“|"([^"]+)"/);
    const rawGoalName = quoteMatch?.[1] || quoteMatch?.[2] || quoteMatch?.[3] || n.title;
    const isEmergency = rawGoalName === "Авариен фонд" || n.dedupeKey?.includes("emergency");
    const goalName = translateGoalName(rawGoalName, isEmergency, lang);
    title = t("notifications.templates.goalTitle", { name: goalName }, lang);

    const pctMatch = n.message.match(/(\d+)\s*%/);
    const pct = pctMatch ? Number(pctMatch[1]) : 100;
    message =
      pct >= 100
        ? t("notifications.templates.goal100", undefined, lang)
        : t("notifications.templates.goalPct", { pct }, lang);
  } else if (n.type === "backup_success") {
    if (n.title.includes("Възстановяване")) {
      title = t("notifications.templates.restoreTitle", undefined, lang);
      message = t("notifications.templates.restoreMsg", undefined, lang);
    } else {
      title = t("notifications.templates.backupTitle", undefined, lang);
      message = t("notifications.templates.backupMsg", undefined, lang);
    }
  } else if (n.type === "recurring_generated") {
    title = t("notifications.templates.recurringTitle", undefined, lang);
    const countMatch = n.message.match(/(\d+)/);
    const count = countMatch ? Number(countMatch[1]) : 1;
    message =
      count === 1
        ? t("notifications.templates.recurringMsgSingle", undefined, lang)
        : t("notifications.templates.recurringMsgMulti", { count }, lang);
  }

  return { title, message, resolvedNote };
}

export function pluralizeUnit(
  count: number,
  singularKey: string,
  pluralKey: string,
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  return count === 1 ? t(singularKey, undefined, lang) : t(pluralKey, undefined, lang);
}
