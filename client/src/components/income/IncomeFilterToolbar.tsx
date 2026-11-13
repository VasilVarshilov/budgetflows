import React, { useState, useMemo } from "react";
import {
  Search,
  ArrowUpDown,
  X,
  Calendar,
  Tag,
  DollarSign,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  CalendarRange,
} from "lucide-react";
import { ExpenseCategory } from "@/types";

export type IncomeSortOption = "newest" | "oldest" | "highest" | "lowest";

export interface IncomeFiltersState {
  searchTerm: string;
  monthFilter: string; // 'current' | 'all' | 'custom' | 'year:<YYYY>' | specific month label e.g. 'Ноември 2026'
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  categoryId: string; // 'all' or category id/name
  minAmount: string;
  maxAmount: string;
  sortBy: IncomeSortOption;
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
}

export const IncomeFilterToolbar: React.FC<IncomeFilterToolbarProps> = ({
  filters,
  onChangeFilters,
  availableMonths,
  availableYears,
  currentMonth,
  categories,
  totalResultsCount,
  totalFilteredSum,
}) => {
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.searchTerm.trim() !== "") count++;
    if (filters.monthFilter !== "current") count++;
    if (filters.monthFilter === "custom" && (filters.startDate || filters.endDate)) {
      count++;
    }
    if (filters.categoryId !== "all") count++;
    if (filters.minAmount !== "" || filters.maxAmount !== "") count++;
    if (filters.sortBy !== "newest") count++;
    return count;
  }, [filters]);

  const updateFilter = <K extends keyof IncomeFiltersState>(
    key: K,
    value: IncomeFiltersState[K]
  ) => {
    onChangeFilters({
      ...filters,
      [key]: value,
    });
  };

  const handleResetFilters = () => {
    onChangeFilters(DEFAULT_INCOME_FILTERS);
  };

  const handleSetDatePreset = (daysBack: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);

    onChangeFilters({
      ...filters,
      monthFilter: "custom",
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-3.5 sm:p-4 space-y-3 transition-colors">
      {/* Top Search & Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filters.searchTerm}
            onChange={(e) => updateFilter("searchTerm", e.target.value)}
            placeholder="Търси по бележка, категория или сума (€)..."
            className="w-full pl-9 pr-8 py-2 min-h-[44px] sm:min-h-[38px] bg-slate-50 dark:bg-slate-800 hover:bg-slate-100/70 dark:hover:bg-slate-700/60 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
          />
          {filters.searchTerm && (
            <button
              type="button"
              onClick={() => updateFilter("searchTerm", "")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
              title="Изчисти търсенето"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <select
              value={filters.sortBy}
              onChange={(e) =>
                updateFilter("sortBy", e.target.value as IncomeSortOption)
              }
              className="w-full appearance-none bg-slate-50 dark:bg-slate-800 hover:bg-slate-100/80 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 pl-3 pr-7 py-2 min-h-[44px] sm:min-h-[38px] focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer transition-colors"
              title="Сортиране на приходите"
            >
              <option value="newest">Най-нови първо</option>
              <option value="oldest">Най-стари първо</option>
              <option value="highest">Най-висока сума (€)</option>
              <option value="lowest">Най-ниска сума (€)</option>
            </select>
            <ArrowUpDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={() => setIsFilterPanelOpen((prev) => !prev)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] sm:min-h-[38px] rounded-xl text-xs font-semibold transition-all border cursor-pointer shrink-0 whitespace-nowrap ${
              isFilterPanelOpen || activeFiltersCount > 0
                ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 shadow-xs"
                : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Филтри</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold tabular-nums">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                isFilterPanelOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Expandable Filter Panel */}
      {isFilterPanelOpen && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Period Filter */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                <Calendar className="w-3 h-3" />
                <span>Период / Месец / Година</span>
              </label>
              <select
                value={filters.monthFilter}
                onChange={(e) => updateFilter("monthFilter", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="current">Текущ месец ({currentMonth})</option>
                <option value="all">Всички месеци</option>
                {availableYears.map((y) => (
                  <option key={y} value={`year:${y}`}>
                    Цяла {y} г.
                  </option>
                ))}
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value="custom">Период от дата до дата</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                <Tag className="w-3 h-3" />
                <span>Категория</span>
              </label>
              <select
                value={filters.categoryId}
                onChange={(e) => updateFilter("categoryId", e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 min-h-[40px] text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Всички категории</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Min Amount */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                <DollarSign className="w-3 h-3" />
                <span>Мин. сума (€)</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={filters.minAmount}
                onChange={(e) => updateFilter("minAmount", e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 min-h-[40px] text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Max Amount */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                <DollarSign className="w-3 h-3" />
                <span>Макс. сума (€)</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={filters.maxAmount}
                onChange={(e) => updateFilter("maxAmount", e.target.value)}
                placeholder="∞"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 min-h-[40px] text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Custom Date Range Inputs */}
          {filters.monthFilter === "custom" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                  <CalendarRange className="w-3 h-3" />
                  <span>От дата</span>
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => updateFilter("startDate", e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                  <CalendarRange className="w-3 h-3" />
                  <span>До дата</span>
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => updateFilter("endDate", e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Quick Presets & Reset */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleSetDatePreset(7)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Последните 7 дни
              </button>
              <button
                type="button"
                onClick={() => handleSetDatePreset(30)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Последните 30 дни
              </button>
              <button
                type="button"
                onClick={() => updateFilter("monthFilter", "all")}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Цялата история
              </button>
            </div>

            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Нулирай филтрите</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compact Results Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>
            Намерени:{" "}
            <strong className="text-slate-800 dark:text-slate-200 tabular-nums">
              {totalResultsCount}
            </strong>{" "}
            {totalResultsCount === 1 ? "приход" : "прихода"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>Общо за извадката:</span>
          <strong className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
            +€{totalFilteredSum.toFixed(2)}
          </strong>
        </div>
      </div>
    </div>
  );
};
