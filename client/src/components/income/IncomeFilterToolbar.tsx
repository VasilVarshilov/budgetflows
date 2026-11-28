import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  ArrowUpDown,
  X,
  Calendar,
  Tag,
  Banknote,
  RotateCcw,
  SlidersHorizontal,
  CalendarRange,
  CheckCircle2,
  Clock,
  Check,
  Repeat,
} from "lucide-react";
import { ExpenseCategory } from "@/types";
import { sanitizeDecimalInput } from "@/utils/formatting";
import {
  formatLocalizedMonthYear,
  pluralizeUnit,
  translateCategoryName,
  useI18n,
} from "@/i18n";

export type IncomeSortOption = "newest" | "oldest" | "highest" | "lowest";

export type IncomeStatusFilterOption = "all" | "completed" | "planned";

export type IncomeTypeFilterOption = "all" | "fixed" | "additional";

export interface IncomeFiltersState {
  searchTerm: string;
  monthFilter: string; // 'current' | 'all' | 'custom' | 'year:<YYYY>' | specific month label e.g. 'Ноември 2026'
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  categoryId: string; // 'all' or category id/name
  minAmount: string;
  maxAmount: string;
  sortBy: IncomeSortOption;
  statusFilter: IncomeStatusFilterOption;
  typeFilter?: IncomeTypeFilterOption;
}

export const DEFAULT_INCOME_FILTERS: IncomeFiltersState = {
  searchTerm: "",
  monthFilter: "current",
  startDate: "",
  endDate: "",
  categoryId: "all",
  minAmount: "",
  maxAmount: "",
  sortBy: "newest",
  statusFilter: "all",
  typeFilter: "all",
};

interface IncomeFilterToolbarProps {
  filters: IncomeFiltersState;
  onChangeFilters: (filters: IncomeFiltersState) => void;
  availableMonths: string[];
  availableYears: string[];
  currentMonth: string;
  categories: ExpenseCategory[];
  totalResultsCount: number;
  totalFilteredSum: number;
  totalFilteredUpcomingSum?: number;
}

const SORT_LABEL_KEYS: Record<IncomeSortOption, string> = {
  newest: "expenses.filters.sortDateDesc",
  oldest: "expenses.filters.sortDateAsc",
  highest: "expenses.filters.sortHighestEur",
  lowest: "expenses.filters.sortLowestEur",
};

const SORT_SHORT_LABEL_KEYS: Record<IncomeSortOption, string> = {
  newest: "expenses.filters.sortNewestShort",
  oldest: "expenses.filters.sortOldestShort",
  highest: "expenses.filters.sortAmountDesc",
  lowest: "expenses.filters.sortAmountAsc",
};

const formatCompactDate = (isoDate: string): string => {
  if (!isoDate) return "...";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}`;
};

const countModalFilters = (state: IncomeFiltersState): number => {
  let count = 0;
  if (state.statusFilter && state.statusFilter !== "all") count++;
  if (state.typeFilter && state.typeFilter !== "all") count++;
  if (state.sortBy !== "newest") count++;
  if (state.monthFilter !== "current") count++;
  if (state.categoryId !== "all") count++;
  if (state.minAmount !== "" || state.maxAmount !== "") count++;
  return count;
};

export const IncomeFilterToolbar: React.FC<IncomeFilterToolbarProps> = ({
  filters,
  onChangeFilters,
  availableMonths,
  availableYears,
  currentMonth,
  categories,
  totalResultsCount,
  totalFilteredSum,
  totalFilteredUpcomingSum = 0,
}) => {
  const { language, t } = useI18n();
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<IncomeFiltersState>(filters);

  const activeFiltersCount = useMemo(() => countModalFilters(filters), [filters]);
  const draftFiltersCount = useMemo(() => countModalFilters(draftFilters), [draftFilters]);

  const handleOpenModal = () => {
    setDraftFilters(filters);
    setIsFilterModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsFilterModalOpen(false);
  };

  const handleApplyFilters = () => {
    onChangeFilters(draftFilters);
    setIsFilterModalOpen(false);
  };

  const handleResetAll = () => {
    onChangeFilters(DEFAULT_INCOME_FILTERS);
    setDraftFilters(DEFAULT_INCOME_FILTERS);
  };

  const handleResetDraft = () => {
    setDraftFilters({
      ...DEFAULT_INCOME_FILTERS,
      searchTerm: filters.searchTerm,
    });
  };

  useEffect(() => {
    if (!isFilterModalOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFilterModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isFilterModalOpen]);

  const updateLiveFilter = <K extends keyof IncomeFiltersState>(
    key: K,
    value: IncomeFiltersState[K]
  ) => {
    onChangeFilters({
      ...filters,
      [key]: value,
    });
  };

  const updateDraftFilter = <K extends keyof IncomeFiltersState>(
    key: K,
    value: IncomeFiltersState[K]
  ) => {
    setDraftFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSetDraftDatePreset = (daysBack: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);

    setDraftFilters((prev) => ({
      ...prev,
      monthFilter: "custom",
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    }));
  };

  const handleSetDraftAmountPreset = (min: string, max: string) => {
    setDraftFilters((prev) => {
      const isAlreadySelected = prev.minAmount === min && prev.maxAmount === max;
      return {
        ...prev,
        minAmount: isAlreadySelected ? "" : min,
        maxAmount: isAlreadySelected ? "" : max,
      };
    });
  };

  const selectedCategoryName = useMemo(() => {
    if (filters.categoryId === "all") return "";
    const found = categories.find(
      (c) => c.id === filters.categoryId || c.name === filters.categoryId
    )?.name;
    return translateCategoryName(found || filters.categoryId, language);
  }, [filters.categoryId, categories, language]);

  const periodChipLabel = useMemo(() => {
    if (filters.monthFilter === "all") return t("expenses.filters.allMonthsChip");
    if (filters.monthFilter.startsWith("year:")) {
      return t("income.filters.fullYearOption", {
        year: filters.monthFilter.replace("year:", ""),
      });
    }
    if (filters.monthFilter === "custom") {
      return `${formatCompactDate(filters.startDate)} – ${formatCompactDate(filters.endDate)}`;
    }
    return formatLocalizedMonthYear(filters.monthFilter, language);
  }, [filters.monthFilter, filters.startDate, filters.endDate, language, t]);

  return (
    <>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-2.5 sm:p-3 space-y-2 transition-colors">
        {/* Default Visible Controls ONLY: 1. Search bar, 2. Filter button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filters.searchTerm}
              onChange={(e) => updateLiveFilter("searchTerm", e.target.value)}
              placeholder={t("expenses.filters.searchToolbarPlaceholder")}
              aria-label={t("income.filters.searchAria")}
              className="w-full pl-9 pr-9 py-2 min-h-[44px] sm:min-h-[40px] bg-slate-50 dark:bg-slate-800 hover:bg-slate-100/70 dark:hover:bg-slate-700/60 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
            />
            {filters.searchTerm && (
              <button
                type="button"
                onClick={() => updateLiveFilter("searchTerm", "")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer min-h-[34px] min-w-[34px] flex items-center justify-center"
                title={t("expenses.filters.clearSearch")}
                aria-label={t("expenses.filters.clearSearch")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleOpenModal}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl text-xs sm:text-sm font-semibold transition-all border cursor-pointer shrink-0 whitespace-nowrap ${
              activeFiltersCount > 0
                ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 shadow-xs"
                : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
            }`}
            aria-label={t("expenses.filters.openFiltersAria")}
            aria-expanded={isFilterModalOpen}
          >
            <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{t("expenses.filters.filtersBtn")}</span>
            {activeFiltersCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold tabular-nums">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Active Filter Chips (only visible when filters are applied) */}
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            {filters.statusFilter && filters.statusFilter !== "all" && (
              <button
                type="button"
                onClick={() => updateLiveFilter("statusFilter", "all")}
                className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title={t("expenses.filters.removeStatusChipTitle")}
              >
                <span>
                  {filters.statusFilter === "planned"
                    ? t("expenses.filters.statusUpcoming")
                    : t("expenses.filters.statusCompleted")}
                </span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {filters.typeFilter && filters.typeFilter !== "all" && (
              <button
                type="button"
                onClick={() => updateLiveFilter("typeFilter", "all")}
                className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-200/80 dark:border-indigo-800 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title={t("income.filters.removeTypeTitle")}
              >
                <span>
                  {filters.typeFilter === "fixed"
                    ? t("income.filters.typeFixed")
                    : t("income.filters.typeAdditional")}
                </span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {filters.sortBy !== "newest" && (
              <button
                type="button"
                onClick={() => updateLiveFilter("sortBy", "newest")}
                className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title={t("expenses.filters.resetSortTitle")}
              >
                <span>{t(SORT_SHORT_LABEL_KEYS[filters.sortBy])}</span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {filters.monthFilter !== "current" && (
              <button
                type="button"
                onClick={() =>
                  onChangeFilters({
                    ...filters,
                    monthFilter: "current",
                    startDate: "",
                    endDate: "",
                  })
                }
                className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-lg border border-blue-200/80 dark:border-blue-800 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title={t("expenses.filters.removePeriodTitle")}
              >
                <span>{periodChipLabel}</span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {filters.categoryId !== "all" && (
              <button
                type="button"
                onClick={() => updateLiveFilter("categoryId", "all")}
                className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-200/80 dark:border-emerald-800 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title={t("expenses.filters.removeCategoryTitle")}
              >
                <span>{selectedCategoryName}</span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {(filters.minAmount !== "" || filters.maxAmount !== "") && (
              <button
                type="button"
                onClick={() =>
                  onChangeFilters({ ...filters, minAmount: "", maxAmount: "" })
                }
                className="inline-flex items-center gap-1 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 px-2.5 py-1 rounded-lg border border-teal-200/80 dark:border-teal-800 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
                title={t("expenses.filters.removeAmountTitle")}
              >
                <span>
                  {filters.minAmount === "" && filters.maxAmount !== ""
                    ? t("expenses.filters.amountUnder", { amount: filters.maxAmount })
                    : filters.minAmount !== "" && filters.maxAmount === ""
                    ? t("expenses.filters.amountOver", { amount: filters.minAmount })
                    : `€${filters.minAmount} – €${filters.maxAmount}`}
                </span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {activeFiltersCount > 1 && (
              <button
                type="button"
                onClick={handleResetAll}
                className="px-2 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                {t("common.clear")}
              </button>
            )}
          </div>
        )}

        {/* Compact Single-Line Summary Bar */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {totalResultsCount}{" "}
            {pluralizeUnit(
              totalResultsCount,
              "common.incomesSingular",
              "common.incomesPlural",
              language
            )}
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            •
          </span>
          <span>
            <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
              +€{totalFilteredSum.toFixed(2)}
            </strong>{" "}
            {t("income.filters.summaryRealized")}
          </span>
          {totalFilteredUpcomingSum > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                •
              </span>
              <span className="text-amber-700 dark:text-amber-300 font-semibold">
                {t("income.filters.summaryExpected", {
                  amount: totalFilteredUpcomingSum.toFixed(2),
                })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Filter Bottom Sheet (Mobile) / Centered Modal (Desktop) */}
      {isFilterModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/55 dark:bg-black/75 backdrop-blur-xs sheet-backdrop-safe animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseModal();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="income-filter-modal-title"
          >
            <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col sheet-panel-safe sm:max-h-[85dvh] overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
              {/* Mobile Drag Handle */}
              <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
                <span className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              </div>

              {/* Sticky Modal Header */}
              <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <h2
                    id="income-filter-modal-title"
                    className="text-base font-bold text-slate-900 dark:text-white truncate"
                  >
                    {t("expenses.filters.modalTitle")}
                  </h2>
                  {draftFiltersCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold tabular-nums shrink-0">
                      {draftFiltersCount}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="min-h-[40px] min-w-[40px] shrink-0 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label={t("expenses.filters.closeFiltersAria")}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Filter Controls Body */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-4 space-y-5">
                {/* 1. Status (Realized vs Upcoming / Future) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t("expenses.filters.statusLabel")}</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("statusFilter", "all")}
                      className={`min-h-[44px] px-1.5 sm:px-3 min-w-0 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        (draftFilters.statusFilter || "all") === "all"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <span className="truncate">{t("expenses.filters.statusAll")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("statusFilter", "completed")}
                      className={`min-h-[44px] px-1.5 sm:px-3 min-w-0 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        draftFilters.statusFilter === "completed"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{t("expenses.filters.statusCompleted")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("statusFilter", "planned")}
                      className={`min-h-[44px] px-1.5 sm:px-3 min-w-0 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        draftFilters.statusFilter === "planned"
                          ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{t("expenses.filters.statusUpcoming")}</span>
                    </button>
                  </div>
                </div>

                {/* 2. Income Type (All / Recurring / Additional) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Repeat className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t("income.filters.typeLabel")}</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("typeFilter", "all")}
                      className={`min-h-[44px] px-1.5 sm:px-2.5 min-w-0 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center ${
                        (draftFilters.typeFilter || "all") === "all"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <span className="truncate">{t("common.all")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("typeFilter", "fixed")}
                      className={`min-h-[44px] px-1.5 sm:px-2.5 min-w-0 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center ${
                        draftFilters.typeFilter === "fixed"
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <span className="truncate">{t("income.filters.typeFixed")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("typeFilter", "additional")}
                      className={`min-h-[44px] px-1.5 sm:px-2.5 min-w-0 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center ${
                        draftFilters.typeFilter === "additional"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <span className="truncate">{t("income.filters.typeAdditional")}</span>
                    </button>
                  </div>
                </div>

                {/* 3. Sorting */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t("expenses.filters.sortSectionLabel")}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(SORT_LABEL_KEYS) as IncomeSortOption[]).map((option) => {
                      const active = draftFilters.sortBy === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => updateDraftFilter("sortBy", option)}
                          className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            active
                              ? "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-200 border-emerald-400 dark:border-emerald-700"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          <span className="truncate">{t(SORT_LABEL_KEYS[option])}</span>
                          {active && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Period / Month / Year / Custom Date Range */}
                <div className="space-y-2.5">
                  <label
                    htmlFor="income-filter-month-select"
                    className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t("income.filters.periodYearMonthLabel")}</span>
                  </label>
                  <select
                    id="income-filter-month-select"
                    value={draftFilters.monthFilter}
                    onChange={(e) => updateDraftFilter("monthFilter", e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="current">
                      {t("expenses.filters.currentMonthOption", {
                        month: formatLocalizedMonthYear(currentMonth, language),
                      })}
                    </option>
                    <option value="all">{t("expenses.filters.allMonthsHistoryOption")}</option>
                    {availableYears.map((y) => (
                      <option key={y} value={`year:${y}`}>
                        {t("income.filters.fullYearOption", { year: y })}
                      </option>
                    ))}
                    <option value="custom">{t("income.filters.customRangeOption")}</option>
                    {availableMonths.length > 0 && (
                      <optgroup label={t("expenses.filters.specificMonthGroup")}>
                        {availableMonths.map((m) => (
                          <option key={m} value={m}>
                            {formatLocalizedMonthYear(m, language)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSetDraftDatePreset(7)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    >
                      {t("expenses.filters.last7Days")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDraftDatePreset(30)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    >
                      {t("expenses.filters.last30Days")}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("monthFilter", "all")}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        draftFilters.monthFilter === "all"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {t("income.filters.fullHistoryBtn")}
                    </button>
                  </div>

                  {draftFilters.monthFilter === "custom" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/60">
                      <div className="min-w-0">
                        <label className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1 mb-1">
                          <CalendarRange className="w-3 h-3 shrink-0" />
                          <span>{t("expenses.filters.fromDateLabel")}</span>
                        </label>
                        <input
                          type="date"
                          value={draftFilters.startDate}
                          onChange={(e) => updateDraftFilter("startDate", e.target.value)}
                          className="w-full min-w-0 max-w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 min-h-[42px] text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1 mb-1">
                          <CalendarRange className="w-3 h-3 shrink-0" />
                          <span>{t("expenses.filters.toDateLabel")}</span>
                        </label>
                        <input
                          type="date"
                          value={draftFilters.endDate}
                          onChange={(e) => updateDraftFilter("endDate", e.target.value)}
                          className="w-full min-w-0 max-w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 min-h-[42px] text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. Category */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="income-filter-category-select"
                    className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <Tag className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t("common.category")}</span>
                  </label>
                  <select
                    id="income-filter-category-select"
                    value={draftFilters.categoryId}
                    onChange={(e) => updateDraftFilter("categoryId", e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 min-h-[44px] text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all">{t("expenses.filters.allCategories")}</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {translateCategoryName(cat.name, language)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 6. Amount Range */}
                <div className="space-y-2.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t("expenses.filters.amountRangeLabel")}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draftFilters.minAmount}
                      onChange={(e) =>
                        updateDraftFilter("minAmount", sanitizeDecimalInput(e.target.value))
                      }
                      placeholder={t("income.filters.minPlaceholder")}
                      aria-label={t("expenses.filters.minAmountAria")}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-xs sm:text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium tabular-nums"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draftFilters.maxAmount}
                      onChange={(e) =>
                        updateDraftFilter("maxAmount", sanitizeDecimalInput(e.target.value))
                      }
                      placeholder={t("expenses.filters.maxAmountPlaceholder")}
                      aria-label={t("expenses.filters.maxAmountAria")}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 min-h-[44px] text-xs sm:text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium tabular-nums"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSetDraftAmountPreset("", "200")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer tabular-nums ${
                        draftFilters.minAmount === "" && draftFilters.maxAmount === "200"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {t("expenses.filters.amountUnder", { amount: 200 })}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDraftAmountPreset("200", "1000")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer tabular-nums ${
                        draftFilters.minAmount === "200" && draftFilters.maxAmount === "1000"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      €200 – €1000
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDraftAmountPreset("1000", "")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer tabular-nums ${
                        draftFilters.minAmount === "1000" && draftFilters.maxAmount === ""
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {t("expenses.filters.amountOver", { amount: 1000 })}
                    </button>
                  </div>
                </div>
              </div>

              {/* Sticky Modal Footer */}
              <div className="px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResetDraft}
                  disabled={draftFiltersCount === 0}
                  className="min-h-[44px] px-3.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t("common.clear")}</span>
                </button>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyFilters}
                    className="min-h-[44px] px-5 rounded-xl text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] shadow-sm transition-all cursor-pointer whitespace-nowrap"
                  >
                    {t("expenses.filters.applyBtn")}
                    {draftFiltersCount > 0 ? ` (${draftFiltersCount})` : ""}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
