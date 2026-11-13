import React, { useState, useMemo } from "react";
import {
  X,
  Download,
  FileText,
  Image,
  Calendar,
  CheckCircle2,
  TrendingUp,
  CreditCard,
  PiggyBank,
  Scale,
  Loader2,
  Sparkles,
} from "lucide-react";
import { MonthlyRecord, IncomeItem } from "@/types";
import {
  ExportPeriodType,
  MONTHS_BG,
  aggregateExportData,
  exportTxtReport,
  exportPngReport,
} from "@/utils/exportEngine";

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

export const ExportCenterModal: React.FC<ExportCenterModalProps> = ({
  isOpen,
  onClose,
  monthlyData,
  globalSavings,
  initialPeriodType = "month",
  initialMonth,
  initialYear,
}) => {
  const now = new Date();
  const currentMonthName = now.toLocaleDateString("bg-BG", { month: "long" });
  const capitalizedCurrentMonth =
    currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);

  const [periodType, setPeriodType] = useState<ExportPeriodType>(initialPeriodType);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    initialMonth || capitalizedCurrentMonth,
  );
  const [selectedYear, setSelectedYear] = useState<string>(
    initialYear || CURRENT_YEAR.toString(),
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

  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingTxt, setIsExportingTxt] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Calculate live preview data based on selections
  const previewData = useMemo(() => {
    return aggregateExportData({
      periodType,
      selectedMonth,
      selectedYear,
      customStartDate,
      customEndDate,
      monthlyData,
      globalSavings,
    });
  }, [
    periodType,
    selectedMonth,
    selectedYear,
    customStartDate,
    customEndDate,
    monthlyData,
    globalSavings,
  ]);

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white leading-tight">
                Център за отчети и експорт
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Генериране на структурирани текстови и графични отчети
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            aria-label="Затвори"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Step 1: Period Selection */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
              1. Изберете период на отчета
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

            {/* Sub-selectors */}
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
          </div>

          {/* Step 2: Live Statistics Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                2. Преглед на данните за периода
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
                <div className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                  €{previewData.incomeTotal.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-rose-800 dark:text-rose-300 mb-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Разходи</span>
                </div>
                <div className="text-base font-bold text-rose-700 dark:text-rose-400">
                  €{previewData.expensesTotal.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">
                  <PiggyBank className="w-3.5 h-3.5" />
                  <span>Спестявания</span>
                </div>
                <div className="text-base font-bold text-purple-700 dark:text-purple-400">
                  €{previewData.savingsTotal.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800/70">
                <div className="flex items-center gap-1.5 text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
                  <Scale className="w-3.5 h-3.5" />
                  <span>Нетен баланс</span>
                </div>
                <div
                  className={`text-base font-bold ${
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

            {/* Category summary preview */}
            <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex justify-between">
                <span>Категории разходи ({previewData.categoryBreakdown.length})</span>
                <span>
                  Включени: {previewData.recordCount}{" "}
                  {previewData.recordCount === 1 ? "месечен отчет" : "месечни отчета"}
                </span>
              </div>

              {previewData.categoryBreakdown.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  Няма записани разходи в избрания период.
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
                      <span className="text-slate-500 dark:text-slate-400">({cat.percentage.toFixed(0)}%)</span>
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
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            Поддържани формати: <strong className="text-slate-700 dark:text-slate-300">TXT</strong> и{" "}
            <strong className="text-slate-700 dark:text-slate-300">PNG</strong> (HD)
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Затвори
            </button>

            {/* Export TXT Button */}
            <button
              type="button"
              onClick={handleExportTxt}
              disabled={isExportingTxt}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold border border-slate-300 dark:border-slate-700 rounded-xl shadow-xs transition-colors cursor-pointer text-sm"
              title="Свали пълен отчет в текстов файл"
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
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer text-sm"
              title="Генерирай красиво графично изображение с графики и табла"
            >
              {isExportingPng ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Image className="w-4 h-4" />
              )}
              <span>Експорт PNG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
