import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  const parsedCurrent = useMemo(
    () => parseMonthKeyToYearMonth(currentMonth),
    [currentMonth]
  );

  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonthIndex = now.getMonth();

  const [pickerYear, setPickerYear] = useState<number>(
    () => parsedCurrent?.year ?? todayYear
  );

  useEffect(() => {
    if (isOpen && parsedCurrent) {
      setPickerYear(parsedCurrent.year);
    }
  }, [isOpen, parsedCurrent]);

  // Close desktop popover on outside click & close either view on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (typeof window !== "undefined" && window.innerWidth < 768) return;
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isOpen]);

  const monthNames = useMemo(
    () => RESOURCES[language]?.months.full ?? MONTHS_BG,
    [language]
  );

  const handleSelectMonth = (monthIndex: number, year: number = pickerYear) => {
    const targetKey = `${MONTHS_BG[monthIndex]} ${year}`;
    onMonthChange(targetKey);
    setIsOpen(false);
  };

  const handleJumpToToday = () => {
    handleSelectMonth(todayMonthIndex, todayYear);
  };

  const isViewingTodayMonth =
    parsedCurrent?.year === todayYear &&
    parsedCurrent?.monthIndex === todayMonthIndex;

  const renderPickerBody = (isMobile: boolean) => (
    <div className={isMobile ? "px-5 pt-2 pb-6 space-y-4" : "p-4 space-y-3.5"}>
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {t("expenses.monthPicker.title")}
          </h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isViewingTodayMonth && (
            <button
              type="button"
              onClick={handleJumpToToday}
              className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer whitespace-nowrap"
            >
              {t("expenses.monthPicker.currentMonthBtn")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label={t("common.close")}
            className={`${
              isMobile ? "min-h-[44px] min-w-[44px]" : "min-h-[32px] min-w-[32px]"
            } flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Year Switcher */}
      <div className="flex items-center justify-between gap-2 bg-slate-100/90 dark:bg-slate-800/90 rounded-xl p-1 border border-slate-200/70 dark:border-slate-700/70">
        <button
          type="button"
          onClick={() => setPickerYear((y) => y - 1)}
          aria-label={t("expenses.monthPicker.prevYear")}
          title={t("expenses.monthPicker.prevYear")}
          className={`${
            isMobile ? "min-h-[44px] min-w-[44px]" : "min-h-[34px] min-w-[34px]"
          } flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tabular-nums tracking-tight select-none">
          {pickerYear}
        </span>

        <button
          type="button"
          onClick={() => setPickerYear((y) => y + 1)}
          aria-label={t("expenses.monthPicker.nextYear")}
          title={t("expenses.monthPicker.nextYear")}
          className={`${
            isMobile ? "min-h-[44px] min-w-[44px]" : "min-h-[34px] min-w-[34px]"
          } flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 12 Months Grid */}
      <div className="grid grid-cols-3 gap-2">
        {monthNames.map((label, idx) => {
          const isSelected =
            parsedCurrent?.year === pickerYear &&
            parsedCurrent?.monthIndex === idx;
          const isToday =
            todayYear === pickerYear && todayMonthIndex === idx;

          return (
            <button
              key={MONTHS_BG[idx]}
              type="button"
              onClick={() => handleSelectMonth(idx)}
              aria-pressed={isSelected}
              className={`${
                isMobile ? "min-h-[44px] px-2 text-xs" : "min-h-[38px] px-2 text-xs"
              } rounded-xl font-medium transition-all cursor-pointer truncate whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isSelected
                  ? "bg-indigo-600 text-white font-semibold shadow-xs"
                  : isToday
                  ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                  : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/70"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const mobileBottomSheet =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] md:hidden flex flex-col justify-end"
            role="dialog"
            aria-modal="true"
            aria-label={t("expenses.monthPicker.title")}
          >
            <div
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/55 backdrop-blur-xs"
              aria-hidden="true"
            />
            <div className="relative z-10 w-full bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl pb-safe animate-in slide-in-from-bottom-4 duration-150">
              <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1" />
              {renderPickerBody(true)}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} className="relative inline-flex max-w-full">
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
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={t("expenses.monthPicker.openAria")}
          className="inline-flex items-center gap-1.5 bg-transparent hover:bg-white/70 dark:hover:bg-slate-700/70 dark:text-slate-100 text-slate-800 font-semibold text-xs rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer transition-colors whitespace-nowrap"
        >
          <span>{formatLocalizedMonthYear(currentMonth, language)}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform duration-150 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
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

      {/* Desktop Compact Popover (>= md) */}
      {isOpen && (
        <div
          role="dialog"
          aria-label={t("expenses.monthPicker.title")}
          className="hidden md:block absolute left-0 top-full mt-2 w-[312px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl z-[60] animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {renderPickerBody(false)}
        </div>
      )}

      {/* Mobile Bottom Sheet (< md) */}
      {mobileBottomSheet}
    </div>
  );
};
