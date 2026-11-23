import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Repeat,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight as ChevronOpenIcon,
  X,
} from "lucide-react";
import { MonthlyRecord } from "@/types";
import {
  buildMonthCalendarGrid,
  CalendarEvent,
  CalendarFilterMode,
  filterCalendarEvents,
  getCalendarEventsForRange,
  parseLocalDateKey,
  summarizeDayEvents,
  toLocalDateKey,
} from "@/utils/calendarEngine";
import { formatRepeatLabel } from "@/utils/recurrenceEngine";
import { CompletionSwitch } from "@/components/ui/RecurrenceCompletionRows";
import { LocationCard } from "@/components/common/LocationCard";
import {
  formatFullMonthIndex,
  getMonFirstWeekdaysShort,
  pluralizeUnit,
  translateCategoryName,
  useI18n,
} from "@/i18n";

interface CalendarTabProps {
  monthlyData: Record<string, MonthlyRecord>;
  initialDateKey?: string | null;
  onConsumeInitialDate?: () => void;
  onToggleRecordCompletion?: (params: {
    monthKey: string;
    recordType: "fixed" | "additional" | "income";
    id: string;
    nextCompleted: boolean;
  }) => void;
  onMaterializeProjectedEvent?: (event: CalendarEvent) => void;
  onOpenEvent?: (event: CalendarEvent) => void;
  onNavigateTab?: (
    tab:
      | "dashboard"
      | "monthly"
      | "income"
      | "calendar"
      | "electricity"
      | "reports"
      | "savings"
      | "budgets"
      | "ai-analysis"
      | "backup"
  ) => void;
}

const FILTER_OPTIONS: Array<{ id: CalendarFilterMode; labelKey: string }> = [
  { id: "all", labelKey: "calendar.filters.all" },
  { id: "expenses", labelKey: "calendar.filters.expenses" },
  { id: "incomes", labelKey: "calendar.filters.incomes" },
  { id: "upcoming", labelKey: "calendar.filters.upcoming" },
  { id: "completed", labelKey: "calendar.filters.completed" },
  { id: "recurring", labelKey: "calendar.filters.recurring" },
];

export const CalendarTab: React.FC<CalendarTabProps> = ({
  monthlyData,
  initialDateKey,
  onConsumeInitialDate,
  onToggleRecordCompletion,
  onMaterializeProjectedEvent,
  onOpenEvent,
  onNavigateTab,
}) => {
  const { language, t } = useI18n();
  const weekdaysShort = useMemo(
    () => getMonFirstWeekdaysShort(language),
    [language]
  );
  const [viewCursor, setViewCursor] = useState<{ year: number; month: number }>(() => {
    if (initialDateKey) {
      const d = parseLocalDateKey(initialDateKey);
      return { year: d.getFullYear(), month: d.getMonth() };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [selectedDateKey, setSelectedDateKey] = useState<string>(() =>
    initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey)
      ? initialDateKey
      : toLocalDateKey(new Date())
  );
  const [filterMode, setFilterMode] = useState<CalendarFilterMode>("all");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(
    Boolean(initialDateKey)
  );

  useEffect(() => {
    if (initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey)) {
      const d = parseLocalDateKey(initialDateKey);
      setViewCursor({ year: d.getFullYear(), month: d.getMonth() });
      setSelectedDateKey(initialDateKey);
      setIsMobileDrawerOpen(true);
      onConsumeInitialDate?.();
    }
  }, [initialDateKey, onConsumeInitialDate]);

  const gridCells = useMemo(
    () => buildMonthCalendarGrid(viewCursor.year, viewCursor.month),
    [viewCursor.year, viewCursor.month]
  );

  const rangeBounds = useMemo(() => {
    const first = gridCells[0]?.date || new Date(viewCursor.year, viewCursor.month, 1, 12);
    const last =
      gridCells[gridCells.length - 1]?.date ||
      new Date(viewCursor.year, viewCursor.month + 1, 0, 12);
    return { first, last };
  }, [gridCells, viewCursor.year, viewCursor.month]);

  const allGridEvents = useMemo(
    () => getCalendarEventsForRange(monthlyData, rangeBounds.first, rangeBounds.last),
    [monthlyData, rangeBounds.first, rangeBounds.last]
  );

  const filteredEvents = useMemo(
    () => filterCalendarEvents(allGridEvents, filterMode),
    [allGridEvents, filterMode]
  );

  const eventsByDateKey = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filteredEvents) {
      const list = map.get(ev.dateKey);
      if (list) list.push(ev);
      else map.set(ev.dateKey, [ev]);
    }
    return map;
  }, [filteredEvents]);

  const monthPrefix = `${viewCursor.year}-${String(viewCursor.month + 1).padStart(2, "0")}-`;
  const currentMonthSummary = useMemo(() => {
    const inMonthEvents = filteredEvents.filter((e) => e.dateKey.startsWith(monthPrefix));
    return summarizeDayEvents(inMonthEvents);
  }, [filteredEvents, monthPrefix]);

  const selectedDayEvents = useMemo(
    () => eventsByDateKey.get(selectedDateKey) || [],
    [eventsByDateKey, selectedDateKey]
  );
  const selectedDaySummary = useMemo(
    () => summarizeDayEvents(selectedDayEvents),
    [selectedDayEvents]
  );

  const selectedDateFormatted = useMemo(() => {
    const d = parseLocalDateKey(selectedDateKey);
    return `${d.getDate()} ${formatFullMonthIndex(d.getMonth(), language)} ${d.getFullYear()}`;
  }, [selectedDateKey, language]);

  const handlePrevMonth = () => {
    setViewCursor((prev) => {
      const m = prev.month - 1;
      return m < 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: m };
    });
  };

  const handleNextMonth = () => {
    setViewCursor((prev) => {
      const m = prev.month + 1;
      return m > 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: m };
    });
  };

  const handleJumpToday = () => {
    const now = new Date();
    setViewCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDateKey(toLocalDateKey(now));
  };

  const handleSelectDay = (dateKey: string) => {
    setSelectedDateKey(dateKey);
    const d = parseLocalDateKey(dateKey);
    if (d.getMonth() !== viewCursor.month || d.getFullYear() !== viewCursor.year) {
      setViewCursor({ year: d.getFullYear(), month: d.getMonth() });
    }
    setIsMobileDrawerOpen(true);
  };

  const handleOpenTransaction = (ev: CalendarEvent) => {
    if (!onOpenEvent) return;
    setIsMobileDrawerOpen(false);
    onOpenEvent(ev);
  };

  const renderDayDetailsContent = () => {
    const expenses = selectedDayEvents.filter((e) => e.kind === "expense");
    const incomes = selectedDayEvents.filter((e) => e.kind === "income");

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {selectedDateFormatted}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedDayEvents.length === 0
                ? t("calendar.noDayTransactions")
                : `${selectedDayEvents.length} ${pluralizeUnit(
                    selectedDayEvents.length,
                    "common.entriesSingular",
                    "common.entriesPlural",
                    language
                  )}`}
            </p>
          </div>
        </div>

        {/* Day Totals Summary */}
        {selectedDayEvents.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50">
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300 block">
                {t("calendar.dayIncomesCount", {
                  count: selectedDaySummary.completedIncomesCount,
                })}
              </span>
              <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200 tabular-nums block">
                {selectedDaySummary.completedIncomesTotal > 0
                  ? `+€${selectedDaySummary.completedIncomesTotal.toFixed(2)}`
                  : "€0.00"}
              </span>
              {selectedDaySummary.upcomingIncomesTotal > 0 && (
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums block mt-0.5">
                  {t("income.expectedPrefix")} +€{selectedDaySummary.upcomingIncomesTotal.toFixed(2)}
                </span>
              )}
            </div>
            <div className="p-2.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50">
              <span className="text-[11px] text-rose-700 dark:text-rose-300 block">
                {t("calendar.dayExpensesCount", {
                  count: selectedDaySummary.completedExpensesCount,
                })}
              </span>
              <span className="text-sm font-bold text-rose-800 dark:text-rose-200 tabular-nums block">
                {selectedDaySummary.completedExpensesTotal > 0
                  ? `-€${selectedDaySummary.completedExpensesTotal.toFixed(2)}`
                  : "€0.00"}
              </span>
              {selectedDaySummary.upcomingExpensesTotal > 0 && (
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums block mt-0.5">
                  {t("income.upcomingPrefix")} -€{selectedDaySummary.upcomingExpensesTotal.toFixed(2)}
                </span>
              )}
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                {t("calendar.dayNet")}
              </span>
              <span
                className={`text-sm font-bold tabular-nums block ${
                  selectedDaySummary.completedNet >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {selectedDaySummary.completedNet > 0
                  ? "+"
                  : selectedDaySummary.completedNet < 0
                  ? "-"
                  : ""}
                €{Math.abs(selectedDaySummary.completedNet).toFixed(2)}
              </span>
              {(selectedDaySummary.upcomingIncomesTotal > 0 ||
                selectedDaySummary.upcomingExpensesTotal > 0) && (
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums block mt-0.5">
                  {t("calendar.withUpcoming")}{" "}
                  {selectedDaySummary.net > 0 ? "+" : selectedDaySummary.net < 0 ? "-" : ""}€
                  {Math.abs(selectedDaySummary.net).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Incomes Section */}
        {incomes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 flex items-center justify-between gap-2">
              <span>{t("calendar.dayIncomesCount", { count: incomes.length })}</span>
              <span className="tabular-nums text-right">
                {selectedDaySummary.completedIncomesTotal > 0 && (
                  <span>+€{selectedDaySummary.completedIncomesTotal.toFixed(2)}</span>
                )}
                {selectedDaySummary.completedIncomesTotal > 0 &&
                  selectedDaySummary.upcomingIncomesTotal > 0 && (
                    <span className="text-slate-400 mx-1">·</span>
                  )}
                {selectedDaySummary.upcomingIncomesTotal > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {t("calendar.expectedShort")} +€{selectedDaySummary.upcomingIncomesTotal.toFixed(2)}
                  </span>
                )}
              </span>
            </h4>
            <div className="space-y-2">
              {incomes.map((ev) => {
                const localizedCategory = translateCategoryName(ev.categoryName, language);
                return (
                  <div
                    key={ev.id}
                    role={onOpenEvent ? "button" : undefined}
                    tabIndex={onOpenEvent ? 0 : undefined}
                    onClick={() => handleOpenTransaction(ev)}
                    onKeyDown={(e) => {
                      if (onOpenEvent && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        handleOpenTransaction(ev);
                      }
                    }}
                    className={`p-3 rounded-xl border space-y-2.5 transition-colors ${
                      ev.isUpcoming
                        ? "border-amber-300/80 dark:border-amber-800/70 bg-amber-50/45 dark:bg-amber-950/20"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40"
                    } ${onOpenEvent ? "cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700" : ""}`}
                    title={onOpenEvent ? t("calendar.openIncomeTitle") : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {localizedCategory}
                          </span>
                          {ev.isRecurring && (
                            <Repeat
                              className="w-3.5 h-3.5 text-indigo-500 shrink-0"
                              aria-label={t("calendar.recurringAria")}
                            />
                          )}
                          {onOpenEvent && (
                            <ChevronOpenIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 ${
                              ev.isUpcoming ? "text-amber-700 dark:text-amber-300 font-semibold" : ""
                            }`}
                          >
                            {ev.isCompleted ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Clock className="w-3 h-3 text-amber-500" />
                            )}
                            {ev.isCompleted
                              ? t("calendar.statusCompleted")
                              : ev.isProjected
                              ? t("calendar.statusScheduled")
                              : t("calendar.statusUpcoming")}
                          </span>
                          {ev.isRecurring && (
                            <span className="whitespace-nowrap shrink-0">· {formatRepeatLabel(ev.repeat, ev)}</span>
                          )}
                        </div>
                        {ev.note && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 italic truncate mt-0.5">
                            {ev.note}
                          </p>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            ev.isUpcoming
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          +€{ev.amount.toFixed(2)}
                        </span>
                        {!ev.isProjected &&
                        ev.recordListType === "income" &&
                        onToggleRecordCompletion ? (
                          <CompletionSwitch
                            checked={ev.isCompleted}
                            onChange={(nextVal) =>
                              onToggleRecordCompletion({
                                monthKey: ev.monthKey,
                                recordType: "income",
                                id: ev.sourceId,
                                nextCompleted: nextVal,
                              })
                            }
                            ariaLabel={t("income.markCompletedAria", { name: localizedCategory })}
                            size="sm"
                          />
                        ) : (
                          ev.isProjected &&
                          onMaterializeProjectedEvent && (
                            <button
                              type="button"
                              onClick={() => onMaterializeProjectedEvent(ev)}
                              className="px-2 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                              title={t("calendar.recordProjectedIncomeTitle")}
                            >
                              {t("calendar.recordBtn")}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {(ev.location?.placeName || ev.location?.address) && (
                      <LocationCard location={ev.location} showHeading compact />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Expenses Section */}
        {expenses.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400 flex items-center justify-between gap-2">
              <span>{t("calendar.dayExpensesCount", { count: expenses.length })}</span>
              <span className="tabular-nums text-right">
                {selectedDaySummary.completedExpensesTotal > 0 && (
                  <span>-€{selectedDaySummary.completedExpensesTotal.toFixed(2)}</span>
                )}
                {selectedDaySummary.completedExpensesTotal > 0 &&
                  selectedDaySummary.upcomingExpensesTotal > 0 && (
                    <span className="text-slate-400 mx-1">·</span>
                  )}
                {selectedDaySummary.upcomingExpensesTotal > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {t("calendar.upcomingShort")} -€{selectedDaySummary.upcomingExpensesTotal.toFixed(2)}
                  </span>
                )}
              </span>
            </h4>
            <div className="space-y-2">
              {expenses.map((ev) => {
                const localizedCategory = translateCategoryName(ev.categoryName, language);
                return (
                  <div
                    key={ev.id}
                    role={onOpenEvent ? "button" : undefined}
                    tabIndex={onOpenEvent ? 0 : undefined}
                    onClick={() => handleOpenTransaction(ev)}
                    onKeyDown={(e) => {
                      if (onOpenEvent && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        handleOpenTransaction(ev);
                      }
                    }}
                    className={`p-3 rounded-xl border space-y-2.5 transition-colors ${
                      ev.isUpcoming
                        ? "border-amber-300/80 dark:border-amber-800/70 bg-amber-50/45 dark:bg-amber-950/20"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40"
                    } ${onOpenEvent ? "cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700" : ""}`}
                    title={onOpenEvent ? t("calendar.openExpenseTitle") : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {ev.merchantName || localizedCategory}
                          </span>
                          {ev.isRecurring && (
                            <Repeat
                              className="w-3.5 h-3.5 text-indigo-500 shrink-0"
                              aria-label={t("calendar.recurringAria")}
                            />
                          )}
                          {onOpenEvent && (
                            <ChevronOpenIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 ${
                              ev.isUpcoming ? "text-amber-700 dark:text-amber-300 font-semibold" : ""
                            }`}
                          >
                            {ev.isCompleted ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Clock className="w-3 h-3 text-amber-500" />
                            )}
                            {ev.isCompleted
                              ? t("calendar.statusCompleted")
                              : ev.isProjected
                              ? t("calendar.statusScheduled")
                              : t("calendar.statusUpcoming")}
                          </span>
                          {ev.merchantName && <span>· {localizedCategory}</span>}
                          {ev.isRecurring && (
                            <span className="whitespace-nowrap shrink-0">· {formatRepeatLabel(ev.repeat, ev)}</span>
                          )}
                        </div>
                        {ev.note && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 italic truncate mt-0.5">
                            {ev.note}
                          </p>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            ev.isUpcoming
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-rose-700 dark:text-rose-400"
                          }`}
                        >
                          -€{ev.amount.toFixed(2)}
                        </span>
                        {!ev.isProjected &&
                        (ev.recordListType === "fixed" || ev.recordListType === "additional") &&
                        onToggleRecordCompletion ? (
                          <CompletionSwitch
                            checked={ev.isCompleted}
                            onChange={(nextVal) =>
                              onToggleRecordCompletion({
                                monthKey: ev.monthKey,
                                recordType:
                                  ev.recordListType === "fixed" ? "fixed" : "additional",
                                id: ev.sourceId,
                                nextCompleted: nextVal,
                              })
                            }
                            ariaLabel={t("expenses.markCompletedAria", { name: localizedCategory })}
                            size="sm"
                          />
                        ) : (
                          ev.isProjected &&
                          onMaterializeProjectedEvent && (
                            <button
                              type="button"
                              onClick={() => onMaterializeProjectedEvent(ev)}
                              className="px-2 py-1 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                              title={t("calendar.recordProjectedExpenseTitle")}
                            >
                              {t("calendar.recordBtn")}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {(ev.location?.placeName || ev.location?.address) && (
                      <LocationCard location={ev.location} showHeading compact />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Action Shortcuts */}
        {onNavigateTab && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onNavigateTab("monthly")}
              className="flex-1 min-h-[40px] px-3 py-2 text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              {t("calendar.manageExpensesBtn")}
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab("income")}
              className="flex-1 min-h-[40px] px-3 py-2 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              {t("calendar.manageIncomesBtn")}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-400">
      {/* Header + Month Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            {t("calendar.pageTitle")}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t("calendar.pageSubtitle")}
          </p>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            aria-label={t("calendar.prevMonthAria")}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleJumpToday}
            className="px-4 py-2 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold min-w-[165px] text-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer"
            title={t("calendar.jumpCurrentMonthTitle")}
          >
            {formatFullMonthIndex(viewCursor.month, language)} {viewCursor.year}
          </button>

          <button
            type="button"
            onClick={handleNextMonth}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            aria-label={t("calendar.nextMonthAria")}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Month Summary Strip + Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Top-Left: Realized Income (Green) */}
          <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50">
            <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1 flex-wrap">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              <span>{t("calendar.summary.realizedIncome")}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-200/80 dark:bg-emerald-900/70 text-emerald-900 dark:text-emerald-200 text-[10px] font-extrabold tabular-nums">
                ({currentMonthSummary.completedIncomesCount})
              </span>
            </span>
            <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5 block">
              {currentMonthSummary.completedIncomesTotal > 0
                ? `+€${currentMonthSummary.completedIncomesTotal.toFixed(2)}`
                : "€0.00"}
            </span>
          </div>

          {/* Top-Right: Realized Expenses (Red) */}
          <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50">
            <span className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1 flex-wrap">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              <span>{t("calendar.summary.realizedExpenses")}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-rose-200/80 dark:bg-rose-900/70 text-rose-900 dark:text-rose-200 text-[10px] font-extrabold tabular-nums">
                ({currentMonthSummary.completedExpensesCount})
              </span>
            </span>
            <span className="text-base font-extrabold text-rose-600 dark:text-rose-400 tabular-nums mt-0.5 block">
              {currentMonthSummary.completedExpensesTotal > 0
                ? `-€${currentMonthSummary.completedExpensesTotal.toFixed(2)}`
                : "€0.00"}
            </span>
          </div>

          {/* Bottom-Left: Expected Income (Light Blue) */}
          <div className="p-3 rounded-xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200/80 dark:border-sky-800/60">
            <span className="text-[11px] font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-1 flex-wrap">
              <Clock className="w-3 h-3 shrink-0" />
              <span>{t("calendar.summary.expectedIncome")}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-sky-200/80 dark:bg-sky-900/70 text-sky-900 dark:text-sky-200 text-[10px] font-extrabold tabular-nums">
                ({currentMonthSummary.upcomingIncomesCount})
              </span>
            </span>
            <span className="text-base font-extrabold text-sky-600 dark:text-sky-400 tabular-nums mt-0.5 block">
              €{currentMonthSummary.upcomingIncomesTotal.toFixed(2)}
            </span>
          </div>

          {/* Bottom-Right: Upcoming Expenses (Amber) */}
          <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/35 border border-amber-300/80 dark:border-amber-800/70">
            <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1 flex-wrap">
              <Clock className="w-3 h-3 shrink-0" />
              <span>{t("calendar.summary.upcomingExpenses")}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-200/80 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 text-[10px] font-extrabold tabular-nums">
                ({currentMonthSummary.upcomingExpensesCount})
              </span>
            </span>
            <span className="text-base font-extrabold text-amber-700 dark:text-amber-300 tabular-nums mt-0.5 block">
              €{currentMonthSummary.upcomingExpensesTotal.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {FILTER_OPTIONS.map((opt) => {
            const active = filterMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilterMode(opt.id)}
                className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {t(opt.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split: Calendar Grid + Desktop Day Details Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70">
            {weekdaysShort.map((dayName) => (
              <div
                key={dayName}
                className="py-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Month Days Grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800">
            {gridCells.map((cell) => {
              const dayEvents = eventsByDateKey.get(cell.dateKey) || [];
              const dayTotals = summarizeDayEvents(dayEvents);
              const isSelected = cell.dateKey === selectedDateKey;
              const hasUpcoming = dayEvents.some((e) => e.isUpcoming);
              const hasRecurring = dayEvents.some((e) => e.isRecurring);

              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  onClick={() => handleSelectDay(cell.dateKey)}
                  className={`min-h-[72px] sm:min-h-[92px] p-1.5 sm:p-2 text-left flex flex-col justify-between transition-colors cursor-pointer focus:outline-none ${
                    !cell.inCurrentMonth
                      ? "bg-slate-50/70 dark:bg-slate-950/50 text-slate-400 dark:text-slate-600"
                      : "bg-white dark:bg-slate-900 hover:bg-indigo-50/40 dark:hover:bg-slate-800/60"
                  } ${
                    isSelected
                      ? "ring-2 ring-inset ring-indigo-600 dark:ring-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/25"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${
                        cell.isToday
                          ? "bg-indigo-600 text-white"
                          : isSelected
                          ? "text-indigo-700 dark:text-indigo-300"
                          : cell.inCurrentMonth
                          ? "text-slate-800 dark:text-slate-100"
                          : "text-slate-400 dark:text-slate-600"
                      }`}
                    >
                      {cell.dayOfMonth}
                    </span>

                    <div className="flex items-center gap-0.5">
                      {hasRecurring && (
                        <Repeat
                          className="w-3 h-3 text-indigo-500 dark:text-indigo-400"
                          aria-label={t("calendar.recurringAria")}
                        />
                      )}
                      {hasUpcoming && (
                        <Clock
                          className="w-3 h-3 text-amber-500 dark:text-amber-400"
                          aria-label={t("calendar.upcomingAria")}
                        />
                      )}
                    </div>
                  </div>

                  {/* Compact Day Indicators & Totals (Completed vs Upcoming separated) */}
                  {dayEvents.length > 0 && (
                    <div className="space-y-0.5 w-full mt-1">
                      {dayTotals.completedIncomesTotal > 0 && (
                        <div className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums truncate">
                          <ArrowDownLeft className="w-2.5 h-2.5 shrink-0 hidden sm:inline" />
                          <span className="truncate">
                            +€{dayTotals.completedIncomesTotal.toFixed(0)}
                          </span>
                        </div>
                      )}
                      {dayTotals.upcomingIncomesTotal > 0 && (
                        <div
                          className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums truncate"
                          title={t("calendar.summary.expectedIncome")}
                        >
                          <Clock className="w-2.5 h-2.5 shrink-0 hidden sm:inline" />
                          <span className="truncate">
                            +€{dayTotals.upcomingIncomesTotal.toFixed(0)}
                          </span>
                        </div>
                      )}
                      {dayTotals.completedExpensesTotal > 0 && (
                        <div className="flex items-center gap-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 tabular-nums truncate">
                          <ArrowUpRight className="w-2.5 h-2.5 shrink-0 hidden sm:inline" />
                          <span className="truncate">
                            -€{dayTotals.completedExpensesTotal.toFixed(0)}
                          </span>
                        </div>
                      )}
                      {dayTotals.upcomingExpensesTotal > 0 && (
                        <div
                          className="flex items-center gap-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400 tabular-nums truncate"
                          title={t("calendar.summary.upcomingExpenses")}
                        >
                          <Clock className="w-2.5 h-2.5 shrink-0 hidden sm:inline" />
                          <span className="truncate">
                            -€{dayTotals.upcomingExpensesTotal.toFixed(0)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop Sticky Side Day Details Panel */}
        <div className="hidden lg:block lg:col-span-5 xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs sticky top-6">
          {renderDayDetailsContent()}
        </div>
      </div>

      {/* Inline Mobile Fallback Day Summary (when drawer is closed) */}
      <div className="lg:hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
        {renderDayDetailsContent()}
      </div>

      {/* Mobile Slide-Up Day Details Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
          <div
            onClick={() => setIsMobileDrawerOpen(false)}
            className="fixed inset-0 bg-black/55 backdrop-blur-xs"
            aria-hidden="true"
          />
          <div className="relative z-10 bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 max-h-[82vh] overflow-y-auto shadow-2xl">
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3" />
            <div className="flex justify-end mb-1">
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label={t("calendar.closeDayDetailsAria")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderDayDetailsContent()}
          </div>
        </div>
      )}
    </div>
  );
};
