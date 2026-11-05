import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  ArrowUpDown,
  X,
  Calendar,
  Tag,
  DollarSign,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  Check,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Layers,
} from "lucide-react";
import { ExpenseCategory, ExpenseItem } from "@/types";

export type ExpenseSortOption = "newest" | "oldest" | "highest" | "lowest";

export interface ExpenseFiltersState {
  searchTerm: string; // matches note, category, or amount
  monthFilter: string; // 'current' | 'all' | 'custom' | or specific month name like 'Ноември 2026'
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  categoryId: string; // 'all' or specific category name/id
  minAmount: string; // '' or number
  maxAmount: string; // '' or number
  sortBy: ExpenseSortOption;
  includeFixed: boolean; // include fixed expenses in search/filter
}

export const DEFAULT_FILTERS: ExpenseFiltersState = {
  searchTerm: "",
  monthFilter: "current",
  startDate: "",
  endDate: "",
  categoryId: "all",
  minAmount: "",
  maxAmount: "",
  sortBy: "newest",
  includeFixed: false,
};

interface ExpenseFilterToolbarProps {
  filters: ExpenseFiltersState;
  onChangeFilters: (filters: ExpenseFiltersState) => void;
  availableMonths: string[];
  currentMonth: string;
  categories: ExpenseCategory[];
  totalResultsCount: number;
  totalFilteredSum: number;
  isFullWidthMode?: boolean;
  onToggleFullWidthMode?: () => void;
}

export const ExpenseFilterToolbar: React.FC<ExpenseFilterToolbarProps> = ({
  filters,
  onChangeFilters,
  availableMonths,
  currentMonth,
  categories,
  totalResultsCount,
  totalFilteredSum,
  isFullWidthMode = false,
  onToggleFullWidthMode,
}) => {
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Compute number of active non-default filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.searchTerm.trim() !== "") count++;
    if (filters.monthFilter !== "current") count++;
    if (filters.monthFilter === "custom" && (filters.startDate || filters.endDate)) count++;
    if (filters.categoryId !== "all") count++;
    if (filters.minAmount !== "" || filters.maxAmount !== "") count++;
    if (filters.sortBy !== "newest") count++;
    if (filters.includeFixed) count++;
    return count;
  }, [filters]);

  const updateFilter = <K extends keyof ExpenseFiltersState>(
    key: K,
    value: ExpenseFiltersState[K]
  ) => {
    onChangeFilters({
      ...filters,
      [key]: value,
    });
  };

  const handleResetFilters = () => {
    onChangeFilters(DEFAULT_FILTERS);
  };

  // Quick Amount preset helpers
  const handleSetAmountPreset = (min: string, max: string) => {
    onChangeFilters({
      ...filters,
      minAmount: min,
      maxAmount: max,
    });
  };

  // Quick Date preset helpers
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
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3.5 sm:p-4 space-y-3 transition-all">
      {/* Top Search & Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Smart Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filters.searchTerm}
            onChange={(e) => updateFilter("searchTerm", e.target.value)}
            placeholder="Търси по бележка, категория или сума (€)..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
          {filters.searchTerm && (
            <button
              onClick={() => updateFilter("searchTerm", "")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200"
              title="Изчисти търсенето"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Controls: Sort, Filter Button, and Fullscreen Toggle */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Sort Selector */}
          <div className="relative">
            <select
              value={filters.sortBy}
              onChange={(e) =>
                updateFilter("sortBy", e.target.value as ExpenseSortOption)
              }
              className="appearance-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 pl-3 pr-7 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-colors"
              title="Сортиране на резултатите"
            >
              <option value="newest">Най-нови първо</option>
              <option value="oldest">Най-стари първо</option>
              <option value="highest">Най-висока сума (€)</option>
              <option value="lowest">Най-ниска сума (€)</option>
            </select>
            <ArrowUpDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Filter Drawer Toggle */}
          <button
            type="button"
            onClick={() => setIsFilterPanelOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
              isFilterPanelOpen || activeFiltersCount > 0
                ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-xs"
                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
            }`}
            title="Отвори разширени филтри (период, категория, сума)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
            <span>Филтри</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">
                {activeFiltersCount}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                isFilterPanelOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Optional View Mode Toggle */}
          {onToggleFullWidthMode && (
            <button
              type="button"
              onClick={onToggleFullWidthMode}
              className={`hidden sm:flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
                isFullWidthMode
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200"
              }`}
              title={
                isFullWidthMode
                  ? "Превключи към разделен изглед с фиксирани разходи"
                  : "Разшири изгледа на разходите на цял екран"
              }
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isFullWidthMode ? "Стандартен" : "Цял екран"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Filter Panel */}
      {isFilterPanelOpen && (
        <div className="pt-3 border-t border-slate-100 space-y-3.5 animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Filter 1: Month / Period */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-indigo-500" />
                Период / Месец
              </label>
              <select
                value={filters.monthFilter}
                onChange={(e) => updateFilter("monthFilter", e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="current">Текущ месец ({currentMonth})</option>
                <option value="all">Всички месеци (Цяла история)</option>
                <option value="custom">Персонализиран диапазон от-до</option>
                <optgroup label="Конкретен месец:">
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Filter 2: Category */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Tag className="w-3 h-3 text-indigo-500" />
                Категория
              </label>
              <select
                value={filters.categoryId}
                onChange={(e) => updateFilter("categoryId", e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">Всички категории</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 3: Min Amount */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-indigo-500" />
                Мин. сума (€)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={filters.minAmount}
                onChange={(e) => updateFilter("minAmount", e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>

            {/* Filter 4: Max Amount */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-indigo-500" />
                Макс. сума (€)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={filters.maxAmount}
                onChange={(e) => updateFilter("maxAmount", e.target.value)}
                placeholder="Без лимит"
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>
          </div>

          {/* Custom Date Range Row (Shown when custom month filter is active or date set) */}
          {filters.monthFilter === "custom" && (
            <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 flex-wrap">
                <CalendarRange className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-indigo-900">
                  Избор на диапазон от-до:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => updateFilter("startDate", e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-400">—</span>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => updateFilter("endDate", e.target.value)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Quick Date Range Shortcuts */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400">Бързи:</span>
                <button
                  type="button"
                  onClick={() => handleSetDatePreset(7)}
                  className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 rounded text-[11px] font-medium border border-slate-200 transition-colors"
                >
                  7 дни
                </button>
                <button
                  type="button"
                  onClick={() => handleSetDatePreset(30)}
                  className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 rounded text-[11px] font-medium border border-slate-200 transition-colors"
                >
                  30 дни
                </button>
                <button
                  type="button"
                  onClick={() => handleSetDatePreset(90)}
                  className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 rounded text-[11px] font-medium border border-slate-200 transition-colors"
                >
                  3 месеца
                </button>
              </div>
            </div>
          )}

          {/* Quick Amount Chips & Include Fixed Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400">Бързи суми:</span>
              <button
                type="button"
                onClick={() => handleSetAmountPreset("", "20")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  filters.minAmount === "" && filters.maxAmount === "20"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"
                }`}
              >
                до €20
              </button>
              <button
                type="button"
                onClick={() => handleSetAmountPreset("20", "100")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  filters.minAmount === "20" && filters.maxAmount === "100"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"
                }`}
              >
                €20 – €100
              </button>
              <button
                type="button"
                onClick={() => handleSetAmountPreset("100", "")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  filters.minAmount === "100" && filters.maxAmount === ""
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"
                }`}
              >
                над €100
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Include Fixed Expenses Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-600 select-none">
                <input
                  type="checkbox"
                  checked={filters.includeFixed}
                  onChange={(e) => updateFilter("includeFixed", e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Включи фиксирани разходи</span>
              </label>

              {/* Reset All Filters Button */}
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors ml-auto"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Изчисти всички</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips / Badges Row (visible when any filter active) */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100 text-[11px]">
          <span className="text-slate-400 font-medium">Активни:</span>

          {filters.searchTerm && (
            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100 font-semibold">
              Търсене: &quot;{filters.searchTerm}&quot;
              <button
                onClick={() => updateFilter("searchTerm", "")}
                className="hover:text-indigo-900"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.monthFilter !== "current" && (
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-100 font-semibold">
              Период:{" "}
              {filters.monthFilter === "all"
                ? "Всички месеци"
                : filters.monthFilter === "custom"
                ? `${filters.startDate || "..."} до ${filters.endDate || "..."}`
                : filters.monthFilter}
              <button
                onClick={() => updateFilter("monthFilter", "current")}
                className="hover:text-blue-900"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.categoryId !== "all" && (
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-100 font-semibold">
              Категория: {filters.categoryId}
              <button
                onClick={() => updateFilter("categoryId", "all")}
                className="hover:text-amber-900"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {(filters.minAmount !== "" || filters.maxAmount !== "") && (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100 font-semibold">
              Сума: €{filters.minAmount || "0"} – €{filters.maxAmount || "∞"}
              <button
                onClick={() =>
                  onChangeFilters({ ...filters, minAmount: "", maxAmount: "" })
                }
                className="hover:text-emerald-900"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.includeFixed && (
            <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md border border-purple-100 font-semibold">
              + Фиксирани
              <button
                onClick={() => updateFilter("includeFixed", false)}
                className="hover:text-purple-900"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            onClick={handleResetFilters}
            className="text-slate-400 hover:text-red-600 underline font-medium ml-1"
          >
            Изчисти
          </button>
        </div>
      )}

      {/* Summary KPI Results Ribbon */}
      <div className="flex items-center justify-between text-xs pt-1 text-slate-500 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">
            Намерени: <strong className="text-indigo-600">{totalResultsCount}</strong>{" "}
            {totalResultsCount === 1 ? "разход" : "разхода"}
          </span>
          {activeFiltersCount > 0 && (
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              (приложени филтри)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>
            Обща сума:{" "}
            <strong className="text-slate-900 font-black">
              €{totalFilteredSum.toFixed(2)}
            </strong>
          </span>
          {totalResultsCount > 0 && (
            <span className="hidden sm:inline text-slate-400">
              • Средно: €{(totalFilteredSum / totalResultsCount).toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
