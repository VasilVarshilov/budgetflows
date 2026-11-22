import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Download,
  FileText,
  Image,
  FileSpreadsheet,
  Filter,
  CheckCircle2,
  TrendingUp,
  CreditCard,
  PiggyBank,
  Scale,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { MonthlyRecord, IncomeItem } from "@/types";
import {
  ExportPeriodType,
  ExportRecurringFilter,
  ExportStatusFilter,
  MONTHS_BG,
  aggregateExportData,
  exportTxtReport,
  exportPngReport,
  exportExcelReport,
} from "@/utils/exportEngine";
import {
  loadStoredCategories,
  loadStoredIncomeCategories,
} from "@/utils/categoryStorage";
import { getCategoryColor } from "@/utils/colors";

export interface ExportCenterPanelProps {
  monthlyData: Record<string, MonthlyRecord>;
  globalSavings: IncomeItem[];
  initialPeriodType?: ExportPeriodType;
  initialMonth?: string;
  initialYear?: string;
  variant?: "modal" | "inline";
  onClose?: () => void;
  onPeriodChange?: (period: {
    periodType: ExportPeriodType;
    month: string;
    year: string;
  }) => void;
}

interface ExportCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthlyData: Record<string, MonthlyRecord>;
  globalSavings: IncomeItem[];
  initialPeriodType?: ExportPeriodType;
  initialMonth?: string;
  initialYear?: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [
  (CURRENT_YEAR - 2).toString(),
  (CURRENT_YEAR - 1).toString(),
  CURRENT_YEAR.toString(),
  (CURRENT_YEAR + 1).toString(),
];

export const ExportCenterPanel: React.FC<ExportCenterPanelProps> = ({
  monthlyData,
  globalSavings,
  initialPeriodType = "month",
  initialMonth,
  initialYear,
  variant = "modal",
  onClose,
  onPeriodChange,
}) => {
  const now = new Date();
  const currentMonthName = now.toLocaleDateString("bg-BG", { month: "long" });
  const capitalizedCurrentMonth =
    currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);

  const [periodType, setPeriodType] = useState<ExportPeriodType>(initialPeriodType);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    initialMonth || capitalizedCurrentMonth
  );
  const [selectedYear, setSelectedYear] = useState<string>(
    initialYear || CURRENT_YEAR.toString()
  );

  // Custom date range state
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return now.toISOString().split("T")[0];
  });

  // Report Filters (Filter-aware preview & Excel / TXT / PNG exports)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ExportStatusFilter>("completed");
  const [recurringFilter, setRecurringFilter] = useState<ExportRecurringFilter>("all");
  const [showFiltersPanel, setShowFiltersPanel] = useState(true);

  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingTxt, setIsExportingTxt] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Notify host view (e.g. Reports tab analytics) when period changes
  useEffect(() => {
    onPeriodChange?.({
      periodType,
      month: selectedMonth,
      year: selectedYear,
    });
  }, [periodType, selectedMonth, selectedYear, onPeriodChange]);

  // Available categories across stored categories & existing records
  const availableCategories = useMemo(() => {
    const map = new Map<string, string>();
    const addName = (raw?: string) => {
      const clean = (raw || "").trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!map.has(key)) map.set(key, clean);
    };

    loadStoredCategories().forEach((c) => addName(c.name));
    loadStoredIncomeCategories().forEach((c) => addName(c.name));

    Object.values(monthlyData || {}).forEach((rec) => {
      if (!rec) return;
      if (rec.expenses?.saved_em2_eur && rec.expenses.saved_em2_eur > 0) {
        addName("Ток");
      }
      if (Array.isArray(rec.expenses?.fixed_expenses)) {
        rec.expenses.fixed_expenses.forEach((e) => addName(e?.categoryName));
      }
      if (Array.isArray(rec.expenses?.additional_expenses)) {
        rec.expenses.additional_expenses.forEach((e) => addName(e?.categoryName));
      }
      if (Array.isArray(rec.incomes)) {
        rec.incomes.forEach((inc) => addName(inc?.categoryName));
      }
    });

    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "bg"));
  }, [monthlyData]);

  // Calculate live preview data based on period + active filters
  const previewData = useMemo(() => {
    return aggregateExportData({
      periodType,
      selectedMonth,
      selectedYear,
      customStartDate,
      customEndDate,
      monthlyData,
      globalSavings,
      filters: {
        selectedCategories,
        statusFilter,
        recurringFilter,
      },
    });
  }, [
    periodType,
    selectedMonth,
    selectedYear,
    customStartDate,
    customEndDate,
    monthlyData,
    globalSavings,
    selectedCategories,
    statusFilter,
    recurringFilter,
  ]);

  const activeFiltersCount =
    (selectedCategories.length > 0 ? 1 : 0) +
    (statusFilter !== "completed" ? 1 : 0) +
    (recurringFilter !== "all" ? 1 : 0);

  const toggleCategory = (catName: string) => {
    setSelectedCategories((prev) => {
      const lower = catName.toLowerCase();
      const exists = prev.some((c) => c.toLowerCase() === lower);
      if (exists) {
        return prev.filter((c) => c.toLowerCase() !== lower);
      }
      return [...prev, catName];
    });
  };

  const resetFilters = () => {
    setSelectedCategories([]);
    setStatusFilter("completed");
    setRecurringFilter("all");
  };

  const handleExportTxt = () => {
    try {
      setIsExportingTxt(true);
      exportTxtReport(previewData);
      setFeedbackMessage("Текстовият отчет (TXT) беше успешно изтеглен.");
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingTxt(false);
    }
  };

  const handleExportPng = async () => {
    try {
      setIsExportingPng(true);
      await exportPngReport(previewData);
      setFeedbackMessage("Графичният отчет (PNG) беше успешно генериран и изтеглен.");
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleExportExcel = () => {
    try {
      setIsExportingExcel(true);
      const res = exportExcelReport(previewData);
      setFeedbackMessage(
        `Excel отчетът (${res.filename}) с ${res.sheets.length} листа беше успешно изтеглен.`
      );
      setTimeout(() => setFeedbackMessage(null), 4500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const isModal = variant === "modal";

  return (
    <div
      className={
        isModal
          ? "bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
          : "bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 w-full flex flex-col overflow-hidden transition-colors"
      }
    >
      {/* Header */}
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0">
            <Download className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white leading-tight">
              Център за отчети и експорт
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Генериране на структурирани текстови, графични и Excel отчети
            </p>
          </div>
        </div>
        {isModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
            aria-label="Затвори"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div
        className={
          isModal
            ? "p-6 space-y-5 overflow-y-auto flex-1"
            : "p-5 sm:p-6 space-y-5"
        }
      >
          {/* Step 1: Period & Filter Selection */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
              1. Изберете период и филтри на отчета
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setPeriodType("month")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  periodType === "month"
                    ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Избран месец
              </button>
              <button
                type="button"
                onClick={() => setPeriodType("year")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  periodType === "year"
                    ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Цяла година
              </button>
              <button
                type="button"
                onClick={() => setPeriodType("custom")}
                className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  periodType === "custom"
                    ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Период по избор
              </button>
            </div>

            {/* Period Sub-selectors */}
            <div className="mt-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              {periodType === "month" && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      Месец
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-2 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {MONTHS_BG.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full sm:w-1/3">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      Година
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-2 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y} г.
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {periodType === "year" && (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      Изберете календарна година
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-2 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y} година (всички 12 месеца)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {periodType === "custom" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      От дата
                    </label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-2 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      До дата
                    </label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-2 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Filter-Aware Report Settings */}
            <div className="mt-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowFiltersPanel((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Филтри за експорта</span>
                  {activeFiltersCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold tabular-nums">
                      {activeFiltersCount} активни
                    </span>
                  )}
                </button>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Нулирай</span>
                  </button>
                )}
              </div>

              {showFiltersPanel && (
                <div className="space-y-2.5 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Status Filter */}
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                        Статус на операциите
                      </label>
                      <div className="grid grid-cols-3 gap-1 p-0.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                        {(
                          [
                            { id: "completed", label: "Изпълнени" },
                            { id: "upcoming", label: "Предстоящи" },
                            { id: "all", label: "Всички" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setStatusFilter(opt.id)}
                            className={`py-1 px-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                              statusFilter === opt.id
                                ? "bg-indigo-600 text-white shadow-2xs"
                                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Recurring Filter */}
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                        Повтаряемост
                      </label>
                      <div className="grid grid-cols-3 gap-1 p-0.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                        {(
                          [
                            { id: "all", label: "Всички" },
                            { id: "recurring", label: "Повтарящи" },
                            { id: "one_time", label: "Еднократни" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setRecurringFilter(opt.id)}
                            className={`py-1 px-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                              recurringFilter === opt.id
                                ? "bg-indigo-600 text-white shadow-2xs"
                                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Multi-Category Filter */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        Категории ({selectedCategories.length === 0 ? "Всички" : `${selectedCategories.length} избрани`})
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-[88px] overflow-y-auto pr-1 custom-scrollbar">
                      <button
                        type="button"
                        onClick={() => setSelectedCategories([])}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          selectedCategories.length === 0
                            ? "bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-600"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                        }`}
                      >
                        Всички
                      </button>
                      {availableCategories.map((catName) => {
                        const isSelected = selectedCategories.some(
                          (c) => c.toLowerCase() === catName.toLowerCase()
                        );
                        return (
                          <button
                            key={catName}
                            type="button"
                            onClick={() => toggleCategory(catName)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-200 border-indigo-400 dark:border-indigo-500 font-semibold"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: getCategoryColor(catName) }}
                            />
                            <span>{catName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Live Statistics Preview */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                2. Преглед на данните за експорт
              </label>
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                {previewData.periodLabel}
              </span>
            </div>

            {/* KPI 4 Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300 mb-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Приходи</span>
                </div>
                <div className="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  €{previewData.incomeTotal.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-rose-800 dark:text-rose-300 mb-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Разходи</span>
                </div>
                <div className="text-base font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                  €{previewData.expensesTotal.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">
                  <PiggyBank className="w-3.5 h-3.5" />
                  <span>Спестявания</span>
                </div>
                <div className="text-base font-bold text-purple-700 dark:text-purple-400 tabular-nums">
                  €{previewData.savingsTotal.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
                  <Scale className="w-3.5 h-3.5" />
                  <span>Нетен баланс</span>
                </div>
                <div
                  className={`text-base font-bold tabular-nums ${
                    previewData.netBalance >= 0
                      ? "text-blue-700 dark:text-blue-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {previewData.netBalance >= 0 ? "+" : ""}€
                  {previewData.netBalance.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Category & Records summary preview */}
            <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex flex-wrap justify-between gap-1">
                <span>
                  Категории разходи ({previewData.categoryBreakdown.length}) ·{" "}
                  {previewData.filteredExpenses.length} разх. /{" "}
                  {previewData.filteredIncomes.length} прих.
                </span>
                <span>
                  Включени: {previewData.recordCount}{" "}
                  {previewData.recordCount === 1 ? "месец" : "месеца"}
                </span>
              </div>

              {previewData.categoryBreakdown.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  Няма записани разходи за избрания период и филтри.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {previewData.categoryBreakdown.slice(0, 6).map((cat, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 shadow-2xs"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium">{cat.name}:</span>
                      <span className="font-bold">€{cat.amount.toFixed(0)}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        ({cat.percentage.toFixed(0)}%)
                      </span>
                    </span>
                  ))}
                  {previewData.categoryBreakdown.length > 6 && (
                    <span className="inline-flex items-center text-xs px-2 py-1 rounded-md text-slate-500 dark:text-slate-400">
                      +{previewData.categoryBreakdown.length - 6} още
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Feedback notification toast */}
          {feedbackMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{feedbackMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions / Download Buttons */}
        <div className="p-4 sm:px-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 hidden md:block">
            Формати: <strong className="text-slate-700 dark:text-slate-300">TXT</strong>,{" "}
            <strong className="text-slate-700 dark:text-slate-300">PNG</strong> и{" "}
            <strong className="text-emerald-700 dark:text-emerald-400">Excel (.xlsx)</strong>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {isModal && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Затвори
              </button>
            )}

            {/* Export TXT Button */}
            <button
              type="button"
              onClick={handleExportTxt}
              disabled={isExportingTxt}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold border border-slate-300 dark:border-slate-700 rounded-xl shadow-xs transition-colors cursor-pointer text-sm"
              title="Свали отчет в текстов файл (TXT)"
            >
              {isExportingTxt ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-500 dark:text-slate-400" />
              ) : (
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              )}
              <span>Експорт TXT</span>
            </button>

            {/* Export PNG Button */}
            <button
              type="button"
              onClick={handleExportPng}
              disabled={isExportingPng}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer text-sm"
              title="Генерирай графично изображение с диаграми (PNG)"
            >
              {isExportingPng ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Image className="w-4 h-4" />
              )}
              <span>Експорт PNG</span>
            </button>

            {/* Export Excel (.xlsx) Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer text-sm"
              title="Експортирай филтрирания отчет в Excel работна книга (.xlsx) с 6 листа"
            >
              {isExportingExcel ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>Експорт Excel</span>
            </button>
          </div>
        </div>
    </div>
  );
};

export const ExportCenterModal: React.FC<ExportCenterModalProps> = ({
  isOpen,
  onClose,
  monthlyData,
  globalSavings,
  initialPeriodType = "month",
  initialMonth,
  initialYear,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Център за отчети и експорт"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl flex justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <ExportCenterPanel
          monthlyData={monthlyData}
          globalSavings={globalSavings}
          initialPeriodType={initialPeriodType}
          initialMonth={initialMonth}
          initialYear={initialYear}
          variant="modal"
          onClose={onClose}
        />
      </div>
    </div>
  );
};
