import React from "react";
import { Repeat, Hourglass, ChevronRight, CalendarDays } from "lucide-react";
import { RepeatFrequency } from "@/types";
import {
  REPEAT_OPTIONS,
  RecurrenceScheduleConfig,
  WEEKDAY_ORDER_MON_FIRST,
  MONTHLY_DAY_PRESETS,
  clampDayOfMonth,
  clampMonthOfYear,
  clampDayOfWeek,
  daysInMonth,
  extractScheduleDefaultsFromDate,
} from "@/utils/recurrenceEngine";
import {
  formatFullMonthIndex,
  translateWeekday,
  useI18n,
} from "@/i18n";

interface CompletionSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

export const CompletionSwitch: React.FC<CompletionSwitchProps> = ({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  size = "md",
}) => {
  const isSmall = size === "sm";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed ${
        isSmall ? "h-5 w-9" : "h-7 w-12"
      } ${
        checked
          ? "bg-emerald-500 dark:bg-emerald-500"
          : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          isSmall ? "h-4 w-4" : "h-6 w-6"
        } ${
          checked
            ? isSmall
              ? "translate-x-4"
              : "translate-x-5"
            : "translate-x-0"
        }`}
      />
    </button>
  );
};

interface RecurrenceCompletionRowsProps {
  repeat: RepeatFrequency;
  onRepeatChange: (repeat: RepeatFrequency) => void;
  completed: boolean;
  onCompletedChange: (completed: boolean) => void;
  schedule?: RecurrenceScheduleConfig;
  onScheduleChange?: (schedule: RecurrenceScheduleConfig) => void;
  anchorDate?: string;
  hideRepeatRow?: boolean;
  disabled?: boolean;
  completedHint?: string;
}

export const RecurrenceCompletionRows: React.FC<RecurrenceCompletionRowsProps> = ({
  repeat,
  onRepeatChange,
  completed,
  onCompletedChange,
  schedule,
  onScheduleChange,
  anchorDate,
  hideRepeatRow = false,
  disabled = false,
  completedHint,
}) => {
  const { t, language } = useI18n();
  const defaults = extractScheduleDefaultsFromDate(anchorDate);
  const effectiveDayOfMonth = clampDayOfMonth(schedule?.dayOfMonth ?? defaults.dayOfMonth);
  const effectiveMonthOfYear = clampMonthOfYear(schedule?.monthOfYear ?? defaults.monthOfYear);
  const effectiveDayOfWeek = clampDayOfWeek(schedule?.dayOfWeek ?? defaults.dayOfWeek);

  const isMonthlyLike =
    repeat === "monthly" || repeat === "quarterly" || repeat === "semiannual";
  const isWeeklyLike = repeat === "weekly" || repeat === "biweekly";
  const isYearly = repeat === "yearly";
  const showSchedulePicker =
    !hideRepeatRow &&
    Boolean(onScheduleChange) &&
    (isMonthlyLike || isWeeklyLike || isYearly);

  const handleRepeatSelect = (nextRepeat: RepeatFrequency) => {
    onRepeatChange(nextRepeat);
    if (!onScheduleChange) return;

    if (nextRepeat === "never" || nextRepeat === "daily") {
      onScheduleChange({});
      return;
    }

    const freshDefaults = extractScheduleDefaultsFromDate(anchorDate);
    if (nextRepeat === "weekly" || nextRepeat === "biweekly") {
      onScheduleChange({
        dayOfWeek:
          typeof schedule?.dayOfWeek === "number"
            ? clampDayOfWeek(schedule.dayOfWeek)
            : freshDefaults.dayOfWeek,
      });
      return;
    }

    const dom =
      typeof schedule?.dayOfMonth === "number"
        ? clampDayOfMonth(schedule.dayOfMonth)
        : freshDefaults.dayOfMonth;

    if (nextRepeat === "yearly") {
      const moy =
        typeof schedule?.monthOfYear === "number"
          ? clampMonthOfYear(schedule.monthOfYear)
          : freshDefaults.monthOfYear;
      onScheduleChange({
        dayOfMonth: Math.min(dom, daysInMonth(2024, moy)),
        monthOfYear: moy,
      });
      return;
    }

    onScheduleChange({ dayOfMonth: dom });
  };

  const maxYearlyDays = daysInMonth(2024, effectiveMonthOfYear);
  const clampedYearlyDay = Math.min(effectiveDayOfMonth, maxYearlyDays);

  const monthlyHintPrefix =
    repeat === "quarterly"
      ? t("recurrence.every3Months")
      : repeat === "semiannual"
      ? t("recurrence.every6Months")
      : t("recurrence.everyMonth");

  return (
    <div className="rounded-xl bg-slate-50/90 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/80 divide-y divide-slate-200/80 dark:divide-slate-700/70 overflow-hidden">
      {!hideRepeatRow && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[48px]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Repeat className="w-4 h-4" />
            </span>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
              {t("recurrence.repeatLabel")}
            </span>
          </div>

          <div className="relative flex items-center shrink-0">
            <select
              aria-label={t("recurrence.repeatLabel")}
              disabled={disabled}
              value={repeat}
              onChange={(e) => handleRepeatSelect(e.target.value as RepeatFrequency)}
              className="appearance-none bg-transparent pr-5 pl-2 py-1 text-right text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white focus:outline-none cursor-pointer disabled:opacity-50"
            >
              {REPEAT_OPTIONS.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {t(`recurrence.${opt.value}`)}
                </option>
              ))}
            </select>
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute right-0 pointer-events-none" />
          </div>
        </div>
      )}

      {showSchedulePicker && (
        <div className="px-3.5 py-3 space-y-2.5 bg-indigo-50/40 dark:bg-indigo-950/20">
          {isMonthlyLike && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/70 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <CalendarDays className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block leading-tight">
                      {t("recurrence.dayOfMonth")}
                    </span>
                    <span className="text-[11px] text-indigo-700 dark:text-indigo-300 block leading-tight mt-0.5">
                      {t("recurrence.monthlyDesc", {
                        prefix: monthlyHintPrefix,
                        day: effectiveDayOfMonth,
                      })}
                      {effectiveDayOfMonth >= 29
                        ? t("recurrence.shortMonthHint")
                        : ""}
                    </span>
                  </div>
                </div>

                <select
                  aria-label={t("recurrence.dayOfMonth")}
                  disabled={disabled}
                  value={effectiveDayOfMonth}
                  onChange={(e) =>
                    onScheduleChange?.({
                      ...schedule,
                      dayOfMonth: clampDayOfMonth(Number(e.target.value)),
                    })
                  }
                  className="px-2.5 py-1.5 min-h-[36px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums cursor-pointer"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => (
                    <option key={dayNum} value={dayNum}>
                      {t("recurrence.dayOrdinal", { day: dayNum })}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {MONTHLY_DAY_PRESETS.map((preset) => {
                  const active = effectiveDayOfMonth === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onScheduleChange?.({
                          ...schedule,
                          dayOfMonth: preset,
                        })
                      }
                      className={`px-2.5 py-1 min-h-[30px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer tabular-nums ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {isWeeklyLike && (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/70 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block leading-tight">
                    {t("recurrence.dayOfWeek")}
                  </span>
                  <span className="text-[11px] text-indigo-700 dark:text-indigo-300 block leading-tight mt-0.5">
                    {repeat === "biweekly"
                      ? t("recurrence.every2Weeks")
                      : t("recurrence.everyWeek")}
                    {translateWeekday(effectiveDayOfWeek, false, language)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {WEEKDAY_ORDER_MON_FIRST.map((dow) => {
                  const active = effectiveDayOfWeek === dow;
                  const fullDay = translateWeekday(dow, false, language);
                  const shortDay = translateWeekday(dow, true, language);
                  return (
                    <button
                      key={dow}
                      type="button"
                      disabled={disabled}
                      title={fullDay}
                      aria-label={fullDay}
                      onClick={() =>
                        onScheduleChange?.({
                          ...schedule,
                          dayOfWeek: dow,
                        })
                      }
                      className={`min-h-[36px] py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer text-center ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                      }`}
                    >
                      {shortDay}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {isYearly && (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/70 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block leading-tight">
                    {t("recurrence.yearlyDate")}
                  </span>
                  <span className="text-[11px] text-indigo-700 dark:text-indigo-300 block leading-tight mt-0.5">
                    {t("recurrence.yearlyDesc", {
                      day: clampedYearlyDay,
                      month:
                        language === "bg"
                          ? formatFullMonthIndex(effectiveMonthOfYear, language).toLowerCase()
                          : formatFullMonthIndex(effectiveMonthOfYear, language),
                    })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    {t("recurrence.yearlyDayLabel")}
                  </label>
                  <select
                    aria-label={t("recurrence.yearlyDayAria")}
                    disabled={disabled}
                    value={clampedYearlyDay}
                    onChange={(e) =>
                      onScheduleChange?.({
                        ...schedule,
                        dayOfMonth: clampDayOfMonth(Number(e.target.value)),
                        monthOfYear: effectiveMonthOfYear,
                      })
                    }
                    className="w-full px-2.5 py-1.5 min-h-[38px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums cursor-pointer"
                  >
                    {Array.from({ length: maxYearlyDays }, (_, i) => i + 1).map(
                      (dayNum) => (
                        <option key={dayNum} value={dayNum}>
                          {dayNum}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    {t("recurrence.yearlyMonthLabel")}
                  </label>
                  <select
                    aria-label={t("recurrence.yearlyMonthAria")}
                    disabled={disabled}
                    value={effectiveMonthOfYear}
                    onChange={(e) => {
                      const nextMonth = clampMonthOfYear(Number(e.target.value));
                      const nextMax = daysInMonth(2024, nextMonth);
                      onScheduleChange?.({
                        ...schedule,
                        monthOfYear: nextMonth,
                        dayOfMonth: Math.min(effectiveDayOfMonth, nextMax),
                      });
                    }}
                    className="w-full px-2.5 py-1.5 min-h-[38px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {Array.from({ length: 12 }, (_, idx) => {
                      const monthLabel = formatFullMonthIndex(idx, language);
                      return (
                        <option key={idx} value={idx}>
                          {monthLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[48px]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-purple-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Hourglass className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100 block leading-tight">
              {t("recurrence.completed")}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight mt-0.5">
              {completedHint ||
                (completed
                  ? t("recurrence.includedInTotalsHint")
                  : t("recurrence.excludedFromReportsHint"))}
            </span>
          </div>
        </div>

        <CompletionSwitch
          checked={completed}
          onChange={onCompletedChange}
          ariaLabel={t("recurrence.completed")}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
