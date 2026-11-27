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
  ChevronDown,
  ChevronUp,
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
import {
  useI18n,
  translateMonthName,
  translateCategoryName,
  formatLocalizedMonthYear,
  pluralizeUnit,
} from "@/i18n";

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
  const { t, language } = useI18n();
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
  const [isReportFiltersOpen, setIsReportFiltersOpen] = useState(variant === "modal");

  useEffect(() => {
    if (variant !== "inline" || !isReportFiltersOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsReportFiltersOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant, isReportFiltersOpen]);

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

    return Array.from(map.values()).sort((a, b) =>
      translateCategoryName(a, language).localeCompare(
        translateCategoryName(b, language),
        language === "bg" ? "bg" : "en"
      )
    );
  }, [monthlyData, language]);

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
      setFeedbackMessage(t("exportCenter.toastTxtSuccess"));
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
      setFeedbackMessage(t("exportCenter.toastPngSuccess"));
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
        t("exportCenter.toastExcelSuccess", {
          filename: res.filename,
          sheets: res.sheets.length,
        })
      );
      setTimeout(() => setFeedbackMessage(null), 4500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const displayPeriodLabel = useMemo(() => {
    if (periodType === "month") {
      return formatLocalizedMonthYear(`${selectedMonth} ${selectedYear}`, language);
    }
    if (periodType === "year") {
      return `${selectedYear} ${t("common.yearFullSuffix")}`;
    }
    return previewData.periodLabel;
  }, [periodType, selectedMonth, selectedYear, previewData.periodLabel, language, t]);

  const isModal = variant === "modal";

  const renderFilterSections = () => (
    <div>
      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
        {t("exportCenter.step1Title")}
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
          {t("exportCenter.periodMonth")}
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
          {t("exportCenter.periodYear")}
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
          {t("exportCenter.periodCustom")}
        </button>
      </div>

      {/* Period Sub-selectors */}
      <div className="mt-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
        {periodType === "month" && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                {t("common.month")}
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-2 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {MONTHS_BG.map((m) => (
                  <option key={m} value={m}>
                    {translateMonthName(m, language)}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-1/3">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                {t("common.year")}
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-2 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y} {t("common.yearSuffix")}
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
                {t("exportCenter.selectYearLabel")}
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-2 font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {t("exportCenter.all12MonthsOption", { year: y })}
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
                {t("exportCenter.fromDate")}
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
                {t("exportCenter.toDate")}
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
            <span>{t("exportCenter.filtersToggle")}</span>
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold tabular-nums">
                {t("exportCenter.activeFiltersBadge", { count: activeFiltersCount })}
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
              <span>{t("common.reset")}</span>
            </button>
          )}
        </div>

        {showFiltersPanel && (
          <div className="space-y-2.5 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Status Filter */}
              <div>
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                  {t("exportCenter.statusLabel")}
                </label>
                <div className="grid grid-cols-3 gap-1 p-0.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                  {(
                    [
                      { id: "completed", label: t("exportCenter.statusCompleted") },
                      { id: "upcoming", label: t("exportCenter.statusUpcoming") },
                      { id: "all", label: t("exportCenter.statusAll") },
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
                  {t("exportCenter.recurringLabel")}
                </label>
                <div className="grid grid-cols-3 gap-1 p-0.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                  {(
                    [
                      { id: "all", label: t("exportCenter.recurringAll") },
                      { id: "recurring", label: t("exportCenter.recurringOnly") },
                      { id: "one_time", label: t("exportCenter.oneTimeOnly") },
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
                  {t("exportCenter.categoriesLabel", {
                    selection:
                      selectedCategories.length === 0
                        ? t("common.all")
                        : t("exportCenter.selectedCategoriesCount", {
                            count: selectedCategories.length,
                          }),
                  })}
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
                  {t("common.all")}
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
                      <span>{translateCategoryName(catName, language)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

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
              {t("exportCenter.title")}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("exportCenter.subtitle")}
            </p>
          </div>
        </div>
        {isModal && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
            aria-label={t("common.close")}
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
          {/* Step 1: Collapsed [ Филтри ] Bar by default on inline Reports tab; expanded directly in modal */}
          {isModal ? (
            renderFilterSections()
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsReportFiltersOpen((prev) => !prev)}
                  aria-expanded={isReportFiltersOpen}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[42px] rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer ${
                    isReportFiltersOpen || activeFiltersCount > 0
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700 shadow-2xs"
                      : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{t("exportCenter.filtersButton")}</span>
                  {activeFiltersCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold tabular-nums">
                      {activeFiltersCount}
                    </span>
                  )}
                  <span className="hidden sm:inline-flex items-center text-slate-400 dark:text-slate-400">
                    {isReportFiltersOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>

                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t("common.reset")}</span>
                  </button>
                )}
              </div>

              {/* Desktop: Inline expandable filter panel */}
              {isReportFiltersOpen && (
                <div className="hidden sm:block pt-1 animate-in fade-in duration-150">
                  {renderFilterSections()}
                </div>
              )}

              {/* Mobile: Bottom sheet filter panel */}
              {isReportFiltersOpen && (
                <div
                  className="sm:hidden fixed inset-0 z-50 flex items-end bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
                  role="dialog"
                  aria-modal="true"
                  aria-label={t("exportCenter.filtersPanelTitle")}
                  onClick={() => setIsReportFiltersOpen(false)}
                >
                  <div
                    className="w-full max-h-[88vh] bg-white dark:bg-slate-900 rounded-t-2xl border-t border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-center pt-2.5 pb-1">
                      <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                    </div>
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {t("exportCenter.filtersPanelTitle")}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeFiltersCount > 0 && (
                          <button
                            type="button"
                            onClick={resetFilters}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/60 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{t("common.reset")}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsReportFiltersOpen(false)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                          aria-label={t("common.close")}
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 overflow-y-auto flex-1">
                      {renderFilterSections()}
                    </div>
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                      <button
                        type="button"
                        onClick={() => setIsReportFiltersOpen(false)}
                        className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        {t("exportCenter.applyFilters")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Live Statistics Preview */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("exportCenter.step2Title")}
              </label>
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                {displayPeriodLabel}
              </span>
            </div>

            {/* KPI 4 Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300 mb-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{t("exportCenter.kpiIncome")}</span>
                </div>
                <div className="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  €{previewData.incomeTotal.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-rose-800 dark:text-rose-300 mb-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{t("exportCenter.kpiExpenses")}</span>
                </div>
                <div className="text-base font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                  €{previewData.expensesTotal.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">
                  <PiggyBank className="w-3.5 h-3.5" />
                  <span>{t("exportCenter.kpiSavings")}</span>
                </div>
                <div className="text-base font-bold text-purple-700 dark:text-purple-400 tabular-nums">
                  €{previewData.savingsTotal.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
                  <Scale className="w-3.5 h-3.5" />
                  <span>{t("exportCenter.kpiNetBalance")}</span>
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
                  {t("exportCenter.summaryLineLeft", {
                    cats: previewData.categoryBreakdown.length,
                    expCount: previewData.filteredExpenses.length,
                    incCount: previewData.filteredIncomes.length,
                  })}
                </span>
                <span>
                  {t("exportCenter.summaryLineRight", {
                    count: previewData.recordCount,
                    unit: pluralizeUnit(
                      previewData.recordCount,
                      "common.monthsSingular",
                      "common.monthsPlural",
                      language
                    ),
                  })}
                </span>
              </div>

              {previewData.categoryBreakdown.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  {t("exportCenter.emptyPreview")}
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
                      <span className="font-medium">
                        {translateCategoryName(cat.name, language)}:
                      </span>
                      <span className="font-bold">€{cat.amount.toFixed(0)}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        ({cat.percentage.toFixed(0)}%)
                      </span>
                    </span>
                  ))}
                  {previewData.categoryBreakdown.length > 6 && (
                    <span className="inline-flex items-center text-xs px-2 py-1 rounded-md text-slate-500 dark:text-slate-400">
                      {t("common.moreCount", {
                        count: previewData.categoryBreakdown.length - 6,
                      })}
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
            {t("exportCenter.formatsFooter")}{" "}
            <strong className="text-slate-700 dark:text-slate-300">TXT</strong>,{" "}
            <strong className="text-slate-700 dark:text-slate-300">PNG</strong>{" "}
            {language === "bg" ? "и" : "&"}{" "}
            <strong className="text-emerald-700 dark:text-emerald-400">Excel (.xlsx)</strong>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {isModal && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                {t("common.close")}
              </button>
            )}

            {/* Export TXT Button */}
            <button
              type="button"
              onClick={handleExportTxt}
              disabled={isExportingTxt}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold border border-slate-300 dark:border-slate-700 rounded-xl shadow-xs transition-colors cursor-pointer text-sm"
              title={t("exportCenter.exportTxtTitle")}
            >
              {isExportingTxt ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-500 dark:text-slate-400" />
              ) : (
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              )}
              <span>{t("exportCenter.exportTxt")}</span>
            </button>

            {/* Export PNG Button */}
            <button
              type="button"
              onClick={handleExportPng}
              disabled={isExportingPng}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer text-sm"
              title={t("exportCenter.exportPngTitle")}
            >
              {isExportingPng ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Image className="w-4 h-4" />
              )}
              <span>{t("exportCenter.exportPng")}</span>
            </button>

            {/* Export Excel (.xlsx) Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer text-sm"
              title={t("exportCenter.exportExcelTitle")}
            >
              {isExportingExcel ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>{t("exportCenter.exportExcel")}</span>
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
  const { t } = useI18n();

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
      aria-label={t("exportCenter.title")}
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
