import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { MONTHS_BG } from "@/utils/comparisonStorage";
import { parseMonthKeyToYearMonth } from "@/utils/recurrenceEngine";
import { formatLocalizedMonthYear, RESOURCES, useI18n } from "@/i18n";

interface MonthPickerControlProps {
  currentMonth: string;
  onMonthChange: (newMonth: string) => void;
  onShiftMonth: (delta: number) => void;
}

export const MonthPickerControl: React.FC<MonthPickerControlProps> = ({
  currentMonth,
  onMonthChange,
  onShiftMonth,
}) => {
  const { t, language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const parsedCurrent = useMemo(
    () => parseMonthKeyToYearMonth(currentMonth),
    [currentMonth]
  );

  const currentCalendarYear = new Date().getFullYear();
  const currentCalendarMonthIndex = new Date().getMonth();

  const [draftYear, setDraftYear] = useState<number>(
    () => parsedCurrent?.year ?? currentCalendarYear
  );
  const [draftMonthIndex, setDraftMonthIndex] = useState<number>(
    () => parsedCurrent?.monthIndex ?? currentCalendarMonthIndex
  );

  useEffect(() => {
    if (!isOpen) return;
    setDraftYear(parsedCurrent?.year ?? currentCalendarYear);
    setDraftMonthIndex(parsedCurrent?.monthIndex ?? currentCalendarMonthIndex);
  }, [isOpen, parsedCurrent, currentCalendarYear, currentCalendarMonthIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>([
      currentCalendarYear - 1,
      currentCalendarYear,
      currentCalendarYear + 1,
    ]);
    if (parsedCurrent?.year) {
      years.add(parsedCurrent.year);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [currentCalendarYear, parsedCurrent]);

  const monthNames = useMemo(
    () => RESOURCES[language]?.months.full ?? MONTHS_BG,
    [language]
  );

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const targetKey = `${MONTHS_BG[draftMonthIndex]} ${draftYear}`;
    onMonthChange(targetKey);
    setIsOpen(false);
  };

  const dialog =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 dark:bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
          >
            <form
              onSubmit={handleConfirm}
              role="dialog"
              aria-modal="true"
              aria-label={t("expenses.monthPicker.title")}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 w-full max-w-xs rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 animate-in zoom-in-95 duration-150"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 min-w-0">
                  <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {t("expenses.monthPicker.title")}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label={t("common.close")}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Year & Month Dropdowns */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label
                    htmlFor="expense-picker-year"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
                  >
                    {t("common.year")}
                  </label>
                  <div className="relative">
                    <select
                      id="expense-picker-year"
                      value={draftYear}
                      onChange={(e) => setDraftYear(Number(e.target.value))}
                      className="w-full min-h-[44px] appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 pr-9 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="expense-picker-month"
                    className="block text-xs font-semibold text-slate-600 dark:text-slate-300"
                  >
                    {t("common.month")}
                  </label>
                  <div className="relative">
                    <select
                      id="expense-picker-month"
                      value={draftMonthIndex}
                      onChange={(e) => setDraftMonthIndex(Number(e.target.value))}
                      className="w-full min-h-[44px] appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 pr-9 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {monthNames.map((label, idx) => (
                        <option key={MONTHS_BG[idx]} value={idx}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="min-h-[44px] py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors active:scale-95 cursor-pointer"
                >
                  {t("expenses.monthPicker.confirm")}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative inline-flex max-w-full">
      <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200/70 dark:border-slate-700/70 max-w-full">
        <button
          type="button"
          onClick={() => onShiftMonth(-1)}
          className="min-h-[32px] min-w-[30px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
          title={t("income.prevMonth")}
          aria-label={t("income.prevMonth")}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={t("expenses.monthPicker.openAria")}
          className="inline-flex items-center gap-1.5 bg-transparent hover:bg-white/70 dark:hover:bg-slate-700/70 dark:text-slate-100 text-slate-800 font-semibold text-xs rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer transition-colors whitespace-nowrap"
        >
          <span>{formatLocalizedMonthYear(currentMonth, language)}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => onShiftMonth(1)}
          className="min-h-[32px] min-w-[30px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
          title={t("income.nextMonth")}
          aria-label={t("income.nextMonth")}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {dialog}
    </div>
  );
};
