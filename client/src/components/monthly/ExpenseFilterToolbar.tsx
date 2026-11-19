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
  Clock,
  CheckCircle2,
  Layers,
  Check,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { ExpenseCategory, BudgetConfig } from "@/types";
import { sanitizeDecimalInput } from "@/utils/formatting";

export type ExpenseSortOption = "newest" | "oldest" | "highest" | "lowest";
export type ExpenseStatusFilter = "all" | "completed" | "planned";

export interface ExpenseFiltersState {
  searchTerm: string; // matches note, category, or amount
  monthFilter: string; // 'current' | 'all' | 'custom' | or specific month name like 'Ноември 2026'
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  categoryId: string; // 'all' or specific category name/id
  budgetCategoryId: string; // 'all' | 'none' | or specific budget id
  minAmount: string; // '' or number
  maxAmount: string; // '' or number
  sortBy: ExpenseSortOption;
  includeFixed: boolean; // include recurring expenses in search/filter
  statusFilter: ExpenseStatusFilter;
}

export const DEFAULT_FILTERS: ExpenseFiltersState = {
  searchTerm: "",
  monthFilter: "current",
  startDate: "",
  endDate: "",
  categoryId: "all",
  budgetCategoryId: "all",
  minAmount: "",
  maxAmount: "",
  sortBy: "newest",
  includeFixed: false,
  statusFilter: "all",
};

interface ExpenseFilterToolbarProps {
  filters: ExpenseFiltersState;
  onChangeFilters: (filters: ExpenseFiltersState) => void;
  availableMonths: string[];
  currentMonth: string;
  categories: ExpenseCategory[];
  budgetCategories?: BudgetConfig[];
  totalResultsCount: number;
  totalFilteredSum: number;
  totalFilteredPlannedSum?: number;
  isFullWidthMode?: boolean;
  onToggleFullWidthMode?: () => void;
}

const SORT_LABELS: Record<ExpenseSortOption, string> = {
  newest: "Най-нови първо",
  oldest: "Най-стари първо",
  highest: "Най-висока сума (€)",
  lowest: "Най-ниска сума (€)",
};

const SORT_SHORT_LABELS: Record<ExpenseSortOption, string> = {
  newest: "Най-нови",
  oldest: "Най-стари",
  highest: "Най-висока сума",
  lowest: "Най-ниска сума",
};

const formatCompactDate = (isoDate: string): string => {
  if (!isoDate) return "...";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}`;
};

const countModalFilters = (state: ExpenseFiltersState): number => {
  let count = 0;
  if (state.statusFilter && state.statusFilter !== "all") count++;
  if (state.sortBy !== "newest") count++;
  if (state.monthFilter !== "current") count++;
  if (state.categoryId !== "all") count++;
  if (state.budgetCategoryId && state.budgetCategoryId !== "all") count++;
  if (state.minAmount !== "" || state.maxAmount !== "") count++;
  if (state.includeFixed) count++;
  return count;
};

export const ExpenseFilterToolbar: React.FC<ExpenseFilterToolbarProps> = ({
  filters,
  onChangeFilters,
  availableMonths,
  currentMonth,
  categories,
  budgetCategories = [],
  totalResultsCount,
  totalFilteredSum,
  totalFilteredPlannedSum = 0,
  isFullWidthMode = false,
  onToggleFullWidthMode,
}) => {
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ExpenseFiltersState>(filters);

  // Count non-default filters configured inside the filter modal
  const activeFiltersCount = useMemo(() => countModalFilters(filters), [filters]);
  const draftFiltersCount = useMemo(() => countModalFilters(draftFilters), [draftFilters]);

  // Sync draft when modal opens
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
    onChangeFilters(DEFAULT_FILTERS);
    setDraftFilters(DEFAULT_FILTERS);
  };

  const handleResetDraft = () => {
    setDraftFilters({
      ...DEFAULT_FILTERS,
      searchTerm: filters.searchTerm,
    });
  };

  // Close on Escape and lock background scroll while modal/sheet is open
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

  const updateLiveFilter = <K extends keyof ExpenseFiltersState>(
    key: K,
    value: ExpenseFiltersState[K]
  ) => {
    onChangeFilters({
      ...filters,
      [key]: value,
    });
  };

  const updateDraftFilter = <K extends keyof ExpenseFiltersState>(
    key: K,
    value: ExpenseFiltersState[K]
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

  const selectedBudgetName = useMemo(() => {
    if (!filters.budgetCategoryId || filters.budgetCategoryId === "all") return "";
    if (filters.budgetCategoryId === "none") return "Без бюджет";
    return (
      budgetCategories.find((b) => b.id === filters.budgetCategoryId)?.categoryName ||
      filters.budgetCategoryId
    );
  }, [filters.budgetCategoryId, budgetCategories]);

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
              placeholder="Търси по бележка, категория или сума (€)..."
              aria-label="Търси разходи"
              className="w-full pl-9 pr-9 py-2 min-h-[44px] sm:min-h-[40px] bg-slate-50 dark:bg-slate-800 hover:bg-slate-100/70 dark:hover:bg-slate-700/60 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
            {filters.searchTerm && (
              <button
                type="button"
                onClick={() => updateLiveFilter("searchTerm", "")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer min-h-[34px] min-w-[34px] flex items-center justify-center"
                title="Изчисти търсенето"
                aria-label="Изчисти търсенето"
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
                ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 shadow-xs"
                : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
            }`}
            aria-label="Отвори филтри"
            aria-expanded={isFilterModalOpen}
          >
            <SlidersHorizontal className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Филтри</span>
            {activeFiltersCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold tabular-nums">
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
                title="Премахни филтър за статус"
              >
                <span>{filters.statusFilter === "planned" ? "Предстоящи" : "Изпълнени"}</span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {filters.sortBy !== "newest" && (
              <button
                type="button"
                onClick={() => updateLiveFilter("sortBy", "newest")}
                className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Върни сортиране по подразбиране"
              >
                <span>{SORT_SHORT_LABELS[filters.sortBy]}</span>
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
                title="Премахни филтър за период"
              >
                <span>
                  {filters.monthFilter === "all"
                    ? "Всички месеци"
                    : filters.monthFilter === "custom"
                    ? `${formatCompactDate(filters.startDate)} – ${formatCompactDate(filters.endDate)}`
                    : filters.monthFilter}
                </span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {filters.categoryId !== "all" && (
              <button
                type="button"
                onClick={() => updateLiveFilter("categoryId", "all")}
                className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-200/80 dark:border-indigo-800 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Премахни филтър за категория"
              >
                <span>{filters.categoryId}</span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {filters.budgetCategoryId && filters.budgetCategoryId !== "all" && (
              <button
                type="button"
                onClick={() => updateLiveFilter("budgetCategoryId", "all")}
                className="inline-flex items-center gap-1 max-w-[210px] sm:max-w-[260px] bg-violet-50 dark:bg-violet-950/60 hover:bg-violet-100 dark:hover:bg-violet-900/60 text-violet-700 dark:text-violet-300 px-2.5 py-1 rounded-lg border border-violet-200/80 dark:border-violet-800 text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
                title={`Премахни филтър за бюджет: ${selectedBudgetName}`}
              >
                <span className="truncate">Бюджет: {selectedBudgetName}</span>
                <X className="w-3 h-3 opacity-75 shrink-0" />
              </button>
            )}

            {(filters.minAmount !== "" || filters.maxAmount !== "") && (
              <button
                type="button"
                onClick={() =>
                  onChangeFilters({ ...filters, minAmount: "", maxAmount: "" })
                }
                className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-200/80 dark:border-emerald-800 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
                title="Премахни филтър за сума"
              >
                <span>
                  {filters.minAmount === "" && filters.maxAmount !== ""
                    ? `до €${filters.maxAmount}`
                    : filters.minAmount !== "" && filters.maxAmount === ""
                    ? `над €${filters.minAmount}`
                    : `€${filters.minAmount} – €${filters.maxAmount}`}
                </span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {filters.includeFixed && (
              <button
                type="button"
                onClick={() => updateLiveFilter("includeFixed", false)}
                className="inline-flex items-center gap-1 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-lg border border-purple-200/80 dark:border-purple-800 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Изключи повтарящи се разходи"
              >
                <span>+ Повтарящи се</span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            )}

            {activeFiltersCount > 1 && (
              <button
                type="button"
                onClick={handleResetAll}
                className="px-2 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                Изчисти
              </button>
            )}
          </div>
        )}

        {/* Compact Single-Line Summary Bar */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {totalResultsCount} {totalResultsCount === 1 ? "разход" : "разхода"}
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
            •
          </span>
          <span>
            <strong className="text-slate-900 dark:text-white font-bold">
              €{totalFilteredSum.toFixed(2)}
            </strong>{" "}
            похарчени
          </span>
          {totalFilteredPlannedSum > 0 && (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                •
              </span>
              <span className="text-amber-700 dark:text-amber-300 font-semibold">
                €{totalFilteredPlannedSum.toFixed(2)} предстоящи
              </span>
            </>
          )}
        </div>
      </div>

      {/* Filter Bottom Sheet (Mobile) / Centered Modal (Desktop) */}
      {isFilterModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/55 dark:bg-black/75 backdrop-blur-xs sm:p-4 animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseModal();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-filter-modal-title"
          >
            <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
              {/* Mobile Drag Handle */}
              <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
                <span className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              </div>

              {/* Sticky Modal Header */}
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h2
                    id="expense-filter-modal-title"
                    className="text-base font-bold text-slate-900 dark:text-white"
                  >
                    Филтри и сортиране
                  </h2>
                  {draftFiltersCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold tabular-nums">
                      {draftFiltersCount}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Затвори филтрите"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Filter Controls Body */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
                {/* 1. Status (Realized vs Planned / Future) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Статус</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("statusFilter", "all")}
                      className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        (draftFilters.statusFilter || "all") === "all"
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      Всички
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("statusFilter", "completed")}
                      className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        draftFilters.statusFilter === "completed"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Изпълнени</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("statusFilter", "planned")}
                      className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        draftFilters.statusFilter === "planned"
                          ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>Предстоящи</span>
                    </button>
                  </div>
                </div>

                {/* 2. Sorting */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Сортиране</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(SORT_LABELS) as ExpenseSortOption[]).map((option) => {
                      const active = draftFilters.sortBy === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => updateDraftFilter("sortBy", option)}
                          className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            active
                              ? "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-200 border-indigo-400 dark:border-indigo-700"
                              : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                          }`}
                        >
                          <span className="truncate">{SORT_LABELS[option]}</span>
                          {active && <Check className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Period & Date Range (including Future months / All / Custom) */}
                <div className="space-y-2.5">
                  <label
                    htmlFor="expense-filter-month-select"
                    className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Период / Месец</span>
                  </label>

                  <select
                    id="expense-filter-month-select"
                    value={draftFilters.monthFilter}
                    onChange={(e) => updateDraftFilter("monthFilter", e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="current">Текущ месец ({currentMonth})</option>
                    <option value="all">Всички месеци (Цяла история и бъдещи)</option>
                    <option value="custom">Персонализиран диапазон от-до</option>
                    <optgroup label="Конкретен месец:">
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  {/* Quick Date Presets */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSetDraftDatePreset(7)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    >
                      Последните 7 дни
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDraftDatePreset(30)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    >
                      Последните 30 дни
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDraftDatePreset(90)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    >
                      3 месеца
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraftFilter("monthFilter", "all")}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        draftFilters.monthFilter === "all"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      Всички месеци
                    </button>
                  </div>

                  {draftFilters.monthFilter === "custom" && (
                    <div className="grid grid-cols-2 gap-2.5 p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/60">
                      <div>
                        <label className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1 mb-1">
                          <CalendarRange className="w-3 h-3" />
                          <span>От дата</span>
                        </label>
                        <input
                          type="date"
                          value={draftFilters.startDate}
                          onChange={(e) => updateDraftFilter("startDate", e.target.value)}
                          className="w-full px-2.5 py-2 min-h-[42px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1 mb-1">
                          <CalendarRange className="w-3 h-3" />
                          <span>До дата</span>
                        </label>
                        <input
                          type="date"
                          value={draftFilters.endDate}
                          onChange={(e) => updateDraftFilter("endDate", e.target.value)}
                          className="w-full px-2.5 py-2 min-h-[42px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Category & Budget Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="expense-filter-category-select"
                      className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <Tag className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Категория</span>
                    </label>
                    <select
                      id="expense-filter-category-select"
                      value={draftFilters.categoryId}
                      onChange={(e) => updateDraftFilter("categoryId", e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="all">Всички категории</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="expense-filter-budget-select"
                      className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5"
                    >
                      <Layers className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Бюджет</span>
                    </label>
                    <select
                      id="expense-filter-budget-select"
                      value={draftFilters.budgetCategoryId || "all"}
                      onChange={(e) => updateDraftFilter("budgetCategoryId", e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="all">Всички бюджети</option>
                      <option value="none">Без бюджетна категория</option>
                      {budgetCategories.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.categoryName} (€{b.monthlyLimit})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 5. Amount Range & Quick Amount Presets */}
                <div className="space-y-2.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Диапазон на сумата (€)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draftFilters.minAmount}
                        onChange={(e) =>
                          updateDraftFilter("minAmount", sanitizeDecimalInput(e.target.value))
                        }
                        placeholder="Мин. € (напр. 10)"
                        aria-label="Минимална сума в евро"
                        className="w-full px-3 py-2 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 font-medium tabular-nums"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draftFilters.maxAmount}
                        onChange={(e) =>
                          updateDraftFilter("maxAmount", sanitizeDecimalInput(e.target.value))
                        }
                        placeholder="Макс. € (без лимит)"
                        aria-label="Максимална сума в евро"
                        className="w-full px-3 py-2 min-h-[44px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 font-medium tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSetDraftAmountPreset("", "20")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer tabular-nums ${
                        draftFilters.minAmount === "" && draftFilters.maxAmount === "20"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      до €20
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDraftAmountPreset("20", "100")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer tabular-nums ${
                        draftFilters.minAmount === "20" && draftFilters.maxAmount === "100"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      €20 – €100
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetDraftAmountPreset("100", "")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer tabular-nums ${
                        draftFilters.minAmount === "100" && draftFilters.maxAmount === ""
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      над €100
                    </button>
                  </div>
                </div>

                {/* 6. Recurring toggle & View Mode */}
                <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 cursor-pointer min-h-[48px]">
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Включи повтарящи се разходи
                    </span>
                    <input
                      type="checkbox"
                      checked={draftFilters.includeFixed}
                      onChange={(e) => updateDraftFilter("includeFixed", e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </label>

                  {onToggleFullWidthMode && (
                    <button
                      type="button"
                      onClick={onToggleFullWidthMode}
                      className="hidden sm:flex w-full items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        {isFullWidthMode ? (
                          <Minimize2 className="w-4 h-4 text-indigo-500" />
                        ) : (
                          <Maximize2 className="w-4 h-4 text-indigo-500" />
                        )}
                        <span>
                          {isFullWidthMode
                            ? "Стандартен разделен изглед"
                            : "Разшири списъка на цял екран"}
                        </span>
                      </span>
                      <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                        {isFullWidthMode ? "Активен" : "Превключи"}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Sticky Modal Footer */}
              <div className="px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleResetDraft}
                  disabled={draftFiltersCount === 0}
                  className="min-h-[44px] px-3.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Изчисти</span>
                </button>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    Отказ
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyFilters}
                    className="min-h-[44px] px-5 rounded-xl text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] shadow-sm transition-all cursor-pointer whitespace-nowrap"
                  >
                    Приложи{draftFiltersCount > 0 ? ` (${draftFiltersCount})` : ""}
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
