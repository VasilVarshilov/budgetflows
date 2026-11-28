import React, { useState, useMemo } from "react";
import {
  Zap,
  Calendar,
  Filter,
  Download,
  FileText,
  Trash2,
  TrendingUp,
  CreditCard,
  Sun,
  Moon,
  Lightbulb,
  RefreshCw,
  BarChart2,
  Clock,
  PlusCircle,
  Eye,
  X,
  Gauge,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ElectricityRecord } from "@/types";
import {
  MONTHS_BG_LIST,
  sortElectricityRecordsChronologically,
  resolveElectricityMeterMode,
  getElectricityMeterTypeLabel,
  ResolvedElectricityMeterMode,
} from "@/utils/electricityStorage";
import {
  exportElectricityHistoryToTxt,
  exportElectricityHistoryToPng,
  ElectricityFilterInfo,
} from "@/utils/electricityExport";
import { useTheme } from "@/utils/themeContext";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { useI18n } from "@/i18n";
import {
  formatLocalizedDate,
  translateElectricityNote,
  translateElectricityPeriodLabel,
  translateMonthName,
} from "@/i18n/helpers";

type MeterTypeFilter = "all" | "single" | "double";

interface ElectricityHistoryTabProps {
  records: ElectricityRecord[];
  onDeleteRecord: (id: string) => void;
  onSwitchToCalculator: () => void;
  onOpenManualEntry?: () => void;
}

export const ElectricityHistoryTab: React.FC<ElectricityHistoryTabProps> = ({
  records,
  onDeleteRecord,
  onSwitchToCalculator,
  onOpenManualEntry,
}) => {
  const { isDark } = useTheme();
  const { t, language } = useI18n();
  const gridStroke = isDark ? "#334155" : "#f1f5f9";
  const axisTickStyle = { fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" };

  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [meterTypeFilter, setMeterTypeFilter] = useState<MeterTypeFilter>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedDetailRecord, setSelectedDetailRecord] = useState<ElectricityRecord | null>(null);

  // Available unique years from records or default
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    records.forEach((r) => {
      if (r.year) yearsSet.add(r.year);
    });
    const currentYear = new Date().getFullYear().toString();
    yearsSet.add(currentYear);
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [records]);

  // Filter records & sort newest first chronologically
  const filteredRecords = useMemo(() => {
    const filtered = records.filter((r) => {
      if (selectedYear !== "all" && r.year !== selectedYear) {
        return false;
      }
      if (selectedMonth !== "all" && r.month !== selectedMonth) {
        return false;
      }
      if (meterTypeFilter !== "all") {
        const mode = resolveElectricityMeterMode(r);
        if (mode !== meterTypeFilter) {
          return false;
        }
      }
      return true;
    });
    return sortElectricityRecordsChronologically(filtered, "desc");
  }, [records, selectedYear, selectedMonth, meterTypeFilter]);

  // Aggregate stats (exclude consumption===0 manual entries from kWh averages so they don't skew kWh stats)
  const stats = useMemo(() => {
    const totalCount = filteredRecords.length;
    const totalConsumption = filteredRecords.reduce(
      (sum, r) => sum + r.consumption,
      0
    );
    const totalConsT1 = filteredRecords.reduce((sum, r) => sum + r.consT1, 0);
    const totalConsT2 = filteredRecords.reduce((sum, r) => sum + r.consT2, 0);
    const totalCost = filteredRecords.reduce((sum, r) => sum + r.totalCost, 0);

    const singleRecords = filteredRecords.filter(
      (r) => resolveElectricityMeterMode(r) === "single"
    );
    const doubleRecords = filteredRecords.filter(
      (r) => resolveElectricityMeterMode(r) === "double"
    );
    const manualRecords = filteredRecords.filter(
      (r) => resolveElectricityMeterMode(r) === "manual"
    );

    const totalSingleCost = singleRecords.reduce((sum, r) => sum + r.totalCost, 0);
    const totalDoubleCost = doubleRecords.reduce((sum, r) => sum + r.totalCost, 0);
    const totalEm1 = doubleRecords.reduce((sum, r) => sum + r.costEm1, 0);
    const totalEm2 = doubleRecords.reduce((sum, r) => sum + r.em2Remainder, 0);

    const recordsWithConsumption = filteredRecords.filter(
      (r) => r.consumption > 0
    );
    const avgConsumption =
      recordsWithConsumption.length > 0
        ? totalConsumption / recordsWithConsumption.length
        : 0;
    const avgCost = totalCount > 0 ? totalCost / totalCount : 0;
    const costForMeasured = recordsWithConsumption.reduce(
      (sum, r) => sum + r.totalCost,
      0
    );
    const avgPrice =
      totalConsumption > 0 ? costForMeasured / totalConsumption : 0;

    let displayMode: "single" | "double" | "mixed" = "double";
    if (meterTypeFilter === "single") {
      displayMode = "single";
    } else if (meterTypeFilter === "double") {
      displayMode = "double";
    } else if (singleRecords.length > 0 && doubleRecords.length === 0) {
      displayMode = "single";
    } else if (singleRecords.length > 0 && doubleRecords.length > 0) {
      displayMode = "mixed";
    } else {
      displayMode = "double";
    }

    return {
      totalCount,
      measuredCount: recordsWithConsumption.length,
      singleCount: singleRecords.length,
      doubleCount: doubleRecords.length,
      manualCount: manualRecords.length,
      totalConsumption,
      totalConsT1,
      totalConsT2,
      totalCost,
      totalSingleCost,
      totalDoubleCost,
      totalEm1,
      totalEm2,
      avgConsumption,
      avgCost,
      avgPrice,
      displayMode,
    };
  }, [filteredRecords, meterTypeFilter]);

  // Chronological data for charts (oldest to newest)
  const chartData = useMemo(() => {
    const chronological = sortElectricityRecordsChronologically(
      filteredRecords,
      "asc"
    );
    const seenLabels = new Map<string, number>();

    return chronological.map((r) => {
      const baseLabel = `${translateMonthName(r.month, language, true)} '${r.year.slice(-2)}`;
      const seenCount = (seenLabels.get(baseLabel) || 0) + 1;
      seenLabels.set(baseLabel, seenCount);
      const shortPeriod =
        seenCount > 1 ? `${baseLabel} (${seenCount})` : baseLabel;
      const mode: ResolvedElectricityMeterMode = resolveElectricityMeterMode(r);
      const typeLabel = getElectricityMeterTypeLabel(r);
      const effectiveUnitPrice =
        r.unitPrice > 0
          ? r.unitPrice
          : r.consumption > 0
          ? r.totalCost / r.consumption
          : 0;

      return {
        period: translateElectricityPeriodLabel(r.periodLabel, language),
        shortPeriod,
        meterMode: mode,
        typeLabel,
        consumption: Number(r.consumption.toFixed(2)),
        consT1: Number(r.consT1.toFixed(2)),
        consT2: Number(r.consT2.toFixed(2)),
        totalCost: Number(r.totalCost.toFixed(2)),
        costEm1: mode === "double" ? Number(r.costEm1.toFixed(2)) : null,
        em2Remainder: mode === "double" ? Number(r.em2Remainder.toFixed(2)) : null,
        avgUnitPrice:
          effectiveUnitPrice > 0 ? Number(effectiveUnitPrice.toFixed(4)) : null,
        isManual: mode === "manual",
      };
    });
  }, [filteredRecords, language]);

  const handleResetFilters = () => {
    setSelectedYear("all");
    setSelectedMonth("all");
    setMeterTypeFilter("all");
  };

  const currentFilterInfo: ElectricityFilterInfo = {
    selectedYear,
    selectedMonth,
    meterTypeFilter,
  };

  const handleExportTxt = () => {
    exportElectricityHistoryToTxt(filteredRecords, currentFilterInfo);
  };

  const handleExportPng = () => {
    exportElectricityHistoryToPng(filteredRecords, currentFilterInfo);
  };

  const handleDelete = (id: string) => {
    onDeleteRecord(id);
    if (selectedDetailRecord?.id === id) {
      setSelectedDetailRecord(null);
    }
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-6">
      {/* Filters and Export Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors">
        {/* Left side: Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 text-sm font-semibold">
            <Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{t("electricity.history.filterPrefix")}</span>
          </div>

          {/* Year Filter */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/20"
          >
            <option value="all">{t("electricity.history.allYears")}</option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {language === "bg" ? `${yr} ${t("common.yearSuffix")}` : yr}
              </option>
            ))}
          </select>

          {/* Month Filter */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/20"
          >
            <option value="all">{t("electricity.history.allMonths")}</option>
            {MONTHS_BG_LIST.map((m) => (
              <option key={m} value={m}>
                {translateMonthName(m, language)}
              </option>
            ))}
          </select>

          {/* Calculator Type Filter */}
          <div
            role="group"
            aria-label={t("electricity.history.meterFilterAria")}
            className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            {(
              [
                { id: "all", label: t("common.all") },
                { id: "single", label: t("electricity.singleMeter") },
                { id: "double", label: t("electricity.doubleMeter") },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMeterTypeFilter(opt.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  meterTypeFilter === opt.id
                    ? "bg-yellow-500 text-slate-950 shadow-2xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {(selectedYear !== "all" || selectedMonth !== "all" || meterTypeFilter !== "all") && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 rounded-md transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              {t("common.clearFilters")}
            </button>
          )}

          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-1">
            {t("electricity.history.foundPrefix")}{" "}
            <strong className="text-slate-800 dark:text-slate-100">
              {filteredRecords.length}
            </strong>{" "}
            {t("electricity.history.ofRecordsSuffix", { total: records.length })}
          </div>
        </div>

        {/* Right side: Export buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportTxt}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title={t("electricity.history.exportTxtTitle")}
          >
            <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>{t("electricity.history.exportTxtBtn")}</span>
          </button>

          <button
            onClick={handleExportPng}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-950 rounded-lg text-xs font-bold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title={t("electricity.history.exportPngTitle")}
          >
            <Download className="w-4 h-4" />
            <span>{t("electricity.history.exportPngBtn")}</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {stats.displayMode === "single" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Consumption */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-yellow-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
            <div className="flex items-center justify-between text-yellow-600 dark:text-yellow-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("electricity.history.kpiTotalCons")}
              </span>
              <div className="p-2 bg-yellow-50 dark:bg-yellow-950/60 rounded-lg">
                <Zap className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white">
              {stats.totalConsumption.toFixed(2)}{" "}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">kWh</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
              <span>{t("electricity.history.t1T2Label")}</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {stats.totalConsT1.toFixed(0)} / {stats.totalConsT2.toFixed(0)} kWh
              </span>
            </div>
          </div>

          {/* Total Cost */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-emerald-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("electricity.history.kpiTotalCost")}
              </span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-lg">
                <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white tabular-nums">
              €{stats.totalCost.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
              <span>{t("electricity.history.avgPerRecord")}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                €{stats.avgCost.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Avg price / kWh */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-sky-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
            <div className="flex items-center justify-between text-sky-600 dark:text-sky-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("electricity.history.kpiAvgPriceKwh")}
              </span>
              <div className="p-2 bg-sky-50 dark:bg-sky-950/60 rounded-lg">
                <TrendingUp className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white tabular-nums">
              €{stats.avgPrice.toFixed(4)}{" "}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">/kWh</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
              <span>{t("electricity.history.tariffUnit")}</span>
              <span className="font-semibold text-sky-700 dark:text-sky-400">
                €/kWh (EUR)
              </span>
            </div>
          </div>

          {/* Avg Consumption */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-indigo-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("electricity.history.kpiAvgCons")}
              </span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-lg">
                <Gauge className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white tabular-nums">
              {stats.avgConsumption.toFixed(2)}{" "}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">kWh</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
              <span>{t("electricity.history.reportedPeriods")}</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {t("electricity.history.reportsCountUnit", { count: stats.measuredCount })}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Consumption */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-yellow-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
            <div className="flex items-center justify-between text-yellow-600 dark:text-yellow-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("electricity.history.kpiTotalCons")}
              </span>
              <div className="p-2 bg-yellow-50 dark:bg-yellow-950/60 rounded-lg">
                <Zap className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white">
              {stats.totalConsumption.toFixed(2)}{" "}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">kWh</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
              <span>{t("electricity.history.avgPerMonth")}</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {stats.avgConsumption.toFixed(2)} kWh
              </span>
            </div>
          </div>

          {/* Total Cost */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-emerald-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {stats.displayMode === "mixed"
                  ? t("electricity.history.kpiTotalCost")
                  : t("electricity.history.kpiTotalCostInvoices")}
              </span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-lg">
                <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white tabular-nums">
              €{stats.totalCost.toFixed(2)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
              <span>{t("electricity.history.avgPerRecord")}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                €{stats.avgCost.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Meter 1 vs Meter 2 (or Mixed Mode Breakdown) */}
          {stats.displayMode === "mixed" ? (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-indigo-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
              <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t("electricity.history.kpiBreakdownByType")}
                </span>
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-lg">
                  <Lightbulb className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t("electricity.history.singleShort")} ({stats.singleCount}):
                  </div>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    €{stats.totalSingleCost.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t("electricity.history.doubleShort")} ({stats.doubleCount}):
                  </div>
                  <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    €{stats.totalDoubleCost.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
                <span>{t("electricity.history.em1Em2DoubleLabel")}</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                  €{stats.totalEm1.toFixed(0)} / €{stats.totalEm2.toFixed(0)}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-indigo-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
              <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t("electricity.history.kpiBreakdownEm1Em2")}
                </span>
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-lg">
                  <Lightbulb className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t("electricity.history.em1Space")}
                  </div>
                  <div className="text-lg font-bold text-slate-800 dark:text-white">
                    €{stats.totalEm1.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t("electricity.history.em2Remainder")}
                  </div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    €{stats.totalEm2.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
                <span>{t("electricity.history.avgBillPerRecord")}</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  €{stats.avgCost.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Average Unit Price */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-sky-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
            <div className="flex items-center justify-between text-sky-600 dark:text-sky-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("electricity.history.kpiAvgPriceForKwh")}
              </span>
              <div className="p-2 bg-sky-50 dark:bg-sky-950/60 rounded-lg">
                <TrendingUp className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-white tabular-nums">
              €{stats.avgPrice.toFixed(4)}{" "}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">/kWh</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
              <span>{t("electricity.history.tariffUnit")}</span>
              <span className="font-semibold text-sky-700 dark:text-sky-400">
                €/kWh (EUR)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Charts Section: 1. Consumption Trend Chart, 2. Cost Trend Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Consumption Trend Chart */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col transition-colors">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-100 dark:bg-amber-950/60 rounded-lg text-amber-600 dark:text-amber-400">
                <BarChart2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  {t("electricity.history.consTrendTitle")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("electricity.history.consTrendSub")}
                </p>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis
                    dataKey="shortPeriod"
                    tick={axisTickStyle}
                    axisLine={{ stroke: gridStroke }}
                  />
                  <YAxis
                    tick={axisTickStyle}
                    axisLine={{ stroke: gridStroke }}
                    unit=" kWh"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl border border-slate-700 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-yellow-400">{d.period}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {d.typeLabel}
                            </span>
                          </div>
                          {d.consumption === 0 ? (
                            <p className="text-slate-300 pt-1">
                              {t("electricity.history.tooltipManualNoKwh")}
                            </p>
                          ) : (
                            <div className="pt-1 space-y-0.5">
                              <p className="text-slate-300">
                                {t("electricity.history.tooltipT1Day")}{" "}
                                <span className="font-mono font-bold text-white">{d.consT1} kWh</span>
                              </p>
                              <p className="text-slate-300">
                                {t("electricity.history.tooltipT2Night")}{" "}
                                <span className="font-mono font-bold text-white">{d.consT2} kWh</span>
                              </p>
                              <div className="border-t border-slate-700 pt-1 mt-1 flex justify-between font-bold text-white">
                                <span>{t("electricity.history.totalLabel")}</span>
                                <span className="text-yellow-400">{d.consumption} kWh</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px", color: isDark ? "#cbd5e1" : "#475569" }}
                    formatter={(val) =>
                      val === "consT1"
                        ? t("electricity.history.legendT1")
                        : val === "consT2"
                        ? t("electricity.history.legendT2")
                        : t("electricity.history.legendTotalKwh")
                    }
                  />
                  <Bar dataKey="consT1" stackId="a" fill="#f59e0b" name="consT1" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="consT2" stackId="a" fill="#6366f1" name="consT2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400 text-xs">
                {t("electricity.history.noConsChartData")}
              </div>
            )}
          </div>
        </div>

        {/* Cost Trend Chart */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col transition-colors">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-100 dark:bg-emerald-950/60 rounded-lg text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  {t("electricity.history.costTrendTitle")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {stats.displayMode === "single"
                    ? t("electricity.history.costTrendSubSingle")
                    : stats.displayMode === "mixed"
                    ? t("electricity.history.costTrendSubMixed")
                    : t("electricity.history.costTrendSubDouble")}
                </p>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis
                    dataKey="shortPeriod"
                    tick={axisTickStyle}
                    axisLine={{ stroke: gridStroke }}
                  />
                  <YAxis
                    tick={axisTickStyle}
                    axisLine={{ stroke: gridStroke }}
                    unit=" €"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl border border-slate-700 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-emerald-400">{d.period}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {d.typeLabel}
                            </span>
                          </div>
                          <div className="pt-1 space-y-0.5">
                            <p className="text-slate-300">
                              {d.meterMode === "double"
                                ? t("electricity.history.tooltipTotalInvoice")
                                : t("electricity.history.tooltipBillSingle")}{" "}
                              <span className="font-mono font-bold text-white">
                                €{Number(d.totalCost).toFixed(2)}
                              </span>
                            </p>
                            {d.meterMode === "double" && d.costEm1 !== null ? (
                              <>
                                <p className="text-slate-300">
                                  {t("electricity.history.tooltipEm1")}{" "}
                                  <span className="font-mono font-bold text-yellow-300">
                                    €{d.costEm1}
                                  </span>
                                </p>
                                <p className="text-slate-300">
                                  {t("electricity.history.tooltipEm2")}{" "}
                                  <span className="font-mono font-bold text-emerald-300">
                                    €{d.em2Remainder}
                                  </span>
                                </p>
                              </>
                            ) : d.meterMode === "single" ? (
                              <p className="text-amber-300/90">
                                {t("electricity.history.tooltipConsSingle", { cons: d.consumption })}
                              </p>
                            ) : (
                              <p className="text-slate-400 italic">
                                {t("electricity.history.tooltipManual")}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px", color: isDark ? "#cbd5e1" : "#475569" }}
                    formatter={(val) =>
                      val === "totalCost"
                        ? stats.displayMode === "single"
                          ? t("electricity.history.legendBillSingle")
                          : stats.displayMode === "mixed"
                          ? t("electricity.history.legendTotalSpent")
                          : t("electricity.history.legendTotalInvoice")
                        : val === "costEm1"
                        ? t("electricity.history.legendEm1")
                        : t("electricity.history.legendEm2")
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="totalCost"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#10b981" }}
                    activeDot={{ r: 6 }}
                    name="totalCost"
                  />
                  {stats.displayMode !== "single" && stats.doubleCount > 0 && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="costEm1"
                        stroke="#f59e0b"
                        strokeWidth={1.8}
                        strokeDasharray="4 4"
                        dot={{ r: 3, fill: "#f59e0b" }}
                        connectNulls={stats.displayMode === "double"}
                        name="costEm1"
                      />
                      <Line
                        type="monotone"
                        dataKey="em2Remainder"
                        stroke="#06b6d4"
                        strokeWidth={1.8}
                        strokeDasharray="4 4"
                        dot={{ r: 3, fill: "#06b6d4" }}
                        connectNulls={stats.displayMode === "double"}
                        name="em2Remainder"
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400 text-xs">
                {t("electricity.history.noCostChartData")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Additional One-Meter / Mixed Insights: Average €/kWh Trend & Day vs Night Usage */}
      {(stats.displayMode === "single" || (stats.displayMode === "mixed" && stats.singleCount > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Average €/kWh Trend Chart */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col transition-colors">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-sky-100 dark:bg-sky-950/60 rounded-lg text-sky-600 dark:text-sky-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                    {t("electricity.history.avgPriceChartTitle")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("electricity.history.avgPriceChartSub")}
                  </p>
                </div>
              </div>
            </div>

            <div className="h-56 w-full">
              {chartData.some((d) => d.avgUnitPrice !== null) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                    <XAxis
                      dataKey="shortPeriod"
                      tick={axisTickStyle}
                      axisLine={{ stroke: gridStroke }}
                    />
                    <YAxis
                      tick={axisTickStyle}
                      axisLine={{ stroke: gridStroke }}
                      tickFormatter={(v) => `€${Number(v).toFixed(2)}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl border border-slate-700 space-y-1">
                            <p className="font-bold text-sky-400">{d.period}</p>
                            <p className="text-slate-300">
                              {t("electricity.history.avgPriceTooltip")}{" "}
                              <span className="font-mono font-bold text-white">
                                {d.avgUnitPrice !== null ? `€${Number(d.avgUnitPrice).toFixed(4)}/kWh` : "—"}
                              </span>
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgUnitPrice"
                      stroke="#0ea5e9"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#0ea5e9" }}
                      connectNulls
                      name={t("electricity.history.avgPriceLegend")}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400 text-xs">
                  {t("electricity.history.noAvgPriceData")}
                </div>
              )}
            </div>
          </div>

          {/* Day vs Night (T1 / T2) Usage Summary */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-100 dark:bg-indigo-950/60 rounded-lg text-indigo-600 dark:text-indigo-400">
                  <Sun className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                    {t("electricity.history.tariffShareTitleAlt")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("electricity.history.tariffShareSub")}
                  </p>
                </div>
              </div>
            </div>

            {stats.totalConsumption > 0 ? (
              <div className="space-y-5 my-auto">
                {(() => {
                  const t1Pct = (stats.totalConsT1 / stats.totalConsumption) * 100;
                  const t2Pct = (stats.totalConsT2 / stats.totalConsumption) * 100;
                  return (
                    <>
                      <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${t1Pct}%` }}
                          className="bg-amber-500 h-full transition-all"
                          title={t("electricity.history.t1BarTitle", { pct: t1Pct.toFixed(1) })}
                        />
                        <div
                          style={{ width: `${t2Pct}%` }}
                          className="bg-indigo-500 h-full transition-all"
                          title={t("electricity.history.t2BarTitle", { pct: t2Pct.toFixed(1) })}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                            <Sun className="w-4 h-4" />
                            <span>{t("electricity.history.t1Label")}</span>
                          </div>
                          <div className="text-xl font-bold text-slate-900 dark:text-white font-mono mt-1">
                            {stats.totalConsT1.toFixed(2)} kWh
                          </div>
                          <div className="text-xs text-amber-700 dark:text-amber-400 font-semibold mt-0.5">
                            {t("electricity.history.ofTotalPct", { pct: t1Pct.toFixed(1) })}
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/50">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                            <Moon className="w-4 h-4" />
                            <span>{t("electricity.history.t2Label")}</span>
                          </div>
                          <div className="text-xl font-bold text-slate-900 dark:text-white font-mono mt-1">
                            {stats.totalConsT2.toFixed(2)} kWh
                          </div>
                          <div className="text-xs text-indigo-700 dark:text-indigo-400 font-semibold mt-0.5">
                            {t("electricity.history.ofTotalPct", { pct: t2Pct.toFixed(1) })}
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-slate-500 dark:text-slate-400 text-xs">
                {t("electricity.history.noKwhForTariff")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table View */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
              {t("electricity.history.recordsListTitle")}
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
              {filteredRecords.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {onOpenManualEntry && (
              <button
                onClick={onOpenManualEntry}
                className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                {t("electricity.history.manualRecordBtn")}
              </button>
            )}
            <button
              onClick={onSwitchToCalculator}
              className="text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-950/60 hover:bg-yellow-200 dark:hover:bg-yellow-900/60 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              {t("electricity.history.newCalcBtn")}
            </button>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/60 rounded-full text-yellow-600 dark:text-yellow-400">
              <Zap className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {t("electricity.history.emptyTitle")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
              {t("electricity.history.emptyHint")}
            </p>
            <button
              onClick={handleResetFilters}
              className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline cursor-pointer"
            >
              {t("common.clearFilters")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4 sm:p-5">
            {filteredRecords.map((r) => {
              const mode = resolveElectricityMeterMode(r);
              const isManualEntry = mode === "manual";
              const meterTypeBadgeLabel = getElectricityMeterTypeLabel(r);
              const sourceBadgeLabel =
                r.source === "receipt"
                  ? t("electricity.history.sourceReceipt")
                  : r.sourceExpenseId
                  ? t("electricity.history.sourceExpense")
                  : isManualEntry
                  ? t("electricity.history.sourceManual")
                  : null;
              const displayPeriod = translateElectricityPeriodLabel(r.periodLabel, language);
              const displayNote = translateElectricityNote(r.note, language);

              return (
                <article
                  key={r.id}
                  onClick={() => setSelectedDetailRecord(r)}
                  className="flex flex-col justify-between p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-yellow-400/80 dark:hover:border-yellow-500/50 transition-colors cursor-pointer min-w-0"
                >
                  <div>
                    {/* Priority 1 & 4: Period + Calculator Type Badge */}
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <h4 className="font-bold text-slate-900 dark:text-white text-base leading-snug truncate">
                        {displayPeriod}
                      </h4>
                      <span
                        className={`shrink-0 whitespace-nowrap text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${
                          mode === "single"
                            ? "bg-yellow-50 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800"
                            : mode === "double"
                            ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                            : "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                        }`}
                      >
                        {!isManualEntry
                          ? meterTypeBadgeLabel
                          : sourceBadgeLabel || meterTypeBadgeLabel}
                      </span>
                    </div>

                    {/* Priority 2: Total Cost */}
                    <div className="mt-3 mb-3.5">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {t("electricity.history.totalLabel")}
                      </div>
                      <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight mt-0.5">
                        €{r.totalCost.toFixed(2)}
                      </div>
                      {displayNote && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 italic mt-1.5 line-clamp-2 break-words">
                          „{displayNote}“
                        </p>
                      )}
                    </div>

                    {/* Priority 3 & Secondary Metrics */}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 py-3 border-y border-slate-100 dark:border-slate-800 text-xs min-w-0">
                      <div className="min-w-0">
                        <dt className="text-slate-500 dark:text-slate-400 font-medium">
                          {t("electricity.history.consumptionLabel")}
                        </dt>
                        <dd className="font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400 text-sm mt-0.5 truncate">
                          {r.consumption > 0 ? `${r.consumption.toFixed(2)} kWh` : "—"}
                        </dd>
                        {!isManualEntry && (
                          <dd className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                            {t("electricity.history.t1Short")}: {r.consT1.toFixed(1)} · {t("electricity.history.t2Short")}: {r.consT2.toFixed(1)}
                          </dd>
                        )}
                      </div>

                      <div className="min-w-0">
                        <dt className="text-slate-500 dark:text-slate-400 font-medium">
                          {t("electricity.history.unitPriceLabel")}
                        </dt>
                        <dd className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200 text-sm mt-0.5 truncate">
                          {r.unitPrice > 0 ? `€${r.unitPrice.toFixed(4)}/kWh` : "—"}
                        </dd>
                        {!isManualEntry && r.unitPrice > 0 && (
                          <dd className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                            {t("electricity.history.t1Short")}: {r.priceT1.toFixed(4)} · {t("electricity.history.t2Short")}: {r.priceT2.toFixed(4)}
                          </dd>
                        )}
                      </div>

                      {mode === "double" && (
                        <>
                          <div className="min-w-0">
                            <dt className="text-slate-500 dark:text-slate-400 font-medium">
                              {t("electricity.history.em1Label")}
                            </dt>
                            <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white text-sm mt-0.5">
                              €{r.costEm1.toFixed(2)}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-slate-500 dark:text-slate-400 font-medium">
                              {t("electricity.history.em2Label")}
                            </dt>
                            <dd className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 text-sm mt-0.5">
                              €{r.em2Remainder.toFixed(2)}
                            </dd>
                          </div>
                        </>
                      )}

                      <div className="col-span-2 flex items-center justify-between gap-2 pt-1">
                        <dt className="text-slate-500 dark:text-slate-400 font-medium">
                          {t("electricity.history.dateLabel")}
                        </dt>
                        <dd className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                          {formatLocalizedDate(r.createdAt, language)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Card Actions */}
                  <div
                    className="flex items-center gap-2 pt-3 mt-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedDetailRecord(r)}
                      className="flex-1 min-h-[44px] px-3 py-2 inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/60"
                      title={t("electricity.history.previewTitle")}
                    >
                      <Eye className="w-4 h-4 shrink-0" />
                      <span>{t("electricity.history.previewBtn")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(r.id)}
                      className="min-h-[44px] px-3.5 py-2 inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-slate-600 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                      title={t("electricity.history.deleteTitle")}
                      aria-label={t("electricity.history.deleteAria")}
                    >
                      <Trash2 className="w-4 h-4 shrink-0" />
                      <span>{t("common.delete")}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Record Details Modal */}
      {selectedDetailRecord && (() => {
        const detailMode = resolveElectricityMeterMode(selectedDetailRecord);
        const detailTypeLabel = getElectricityMeterTypeLabel(selectedDetailRecord);
        const isManualDetail = detailMode === "manual";
        const detailPeriod = translateElectricityPeriodLabel(
          selectedDetailRecord.periodLabel,
          language
        );
        const detailNote = translateElectricityNote(selectedDetailRecord.note, language);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-safe bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setSelectedDetailRecord(null)}
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full modal-panel-safe flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="p-2 bg-yellow-50 dark:bg-yellow-950/60 text-yellow-600 dark:text-yellow-400 rounded-xl shrink-0">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">
                      {t("electricity.history.detailTitle", { period: detailPeriod })}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {t("electricity.history.savedOn", {
                        date: formatLocalizedDate(selectedDetailRecord.createdAt, language),
                      })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDetailRecord(null)}
                  className="min-h-[40px] min-w-[40px] shrink-0 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label={t("common.close")}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-4 text-sm overflow-y-auto overflow-x-hidden flex-1 min-h-0">
                {/* Calculator Type Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {t("electricity.history.typeLabel")}
                  </span>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
                      detailMode === "single"
                        ? "bg-yellow-50 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800"
                        : detailMode === "double"
                        ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                        : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                    }`}
                  >
                    {detailTypeLabel}
                  </span>
                </div>

                {!isManualDetail && (
                  <>
                    {/* Readings */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 min-w-0">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                          {t("electricity.history.oldReadingLabel")}
                        </div>
                        <div className="font-mono font-bold text-slate-900 dark:text-white break-words">
                          {selectedDetailRecord.previousReading.toFixed(1)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 break-words">
                          {t("electricity.history.t1Short")}: {selectedDetailRecord.prevT1} | {t("electricity.history.t2Short")}: {selectedDetailRecord.prevT2}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 min-w-0">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                          {t("electricity.history.newReadingLabel")}
                        </div>
                        <div className="font-mono font-bold text-slate-900 dark:text-white break-words">
                          {selectedDetailRecord.currentReading.toFixed(1)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 break-words">
                          {t("electricity.history.t1Short")}: {selectedDetailRecord.currT1} | {t("electricity.history.t2Short")}: {selectedDetailRecord.currT2}
                        </div>
                      </div>
                    </div>

                    {/* Consumption & Unit Price */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                      <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/40 min-w-0">
                        <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1">
                          {t("electricity.history.consumptionCardLabel")}
                        </div>
                        <div className="font-mono font-bold text-slate-900 dark:text-white break-words">
                          {selectedDetailRecord.consumption.toFixed(3)} kWh
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono mt-0.5 break-words">
                          {t("electricity.history.t1Short")}: {selectedDetailRecord.consT1.toFixed(2)} | {t("electricity.history.t2Short")}: {selectedDetailRecord.consT2.toFixed(2)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-sky-50/60 dark:bg-sky-950/25 border border-sky-200/70 dark:border-sky-900/40 min-w-0">
                        <div className="text-[11px] font-semibold text-sky-700 dark:text-sky-300 mb-1">
                          {t("electricity.history.avgPriceLabel")}
                        </div>
                        <div className="font-mono font-bold text-slate-900 dark:text-white break-words">
                          €{selectedDetailRecord.unitPrice.toFixed(4)} /kWh
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono mt-0.5 break-words">
                          {t("electricity.history.t1Short")}: €{selectedDetailRecord.priceT1.toFixed(4)} | {t("electricity.history.t2Short")}: €{selectedDetailRecord.priceT2.toFixed(4)}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Cost Breakdown */}
                <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-900/50 space-y-2">
                  {detailMode === "double" ? (
                    <>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-600 dark:text-slate-300 min-w-0">
                          {t("electricity.history.em1BillLabel")}
                        </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">
                          €{selectedDetailRecord.costEm1.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-600 dark:text-slate-300 min-w-0">
                          {t("electricity.history.em2BillLabel")}
                        </span>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                          €{selectedDetailRecord.em2Remainder.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-emerald-200/80 dark:border-emerald-800/50">
                        <span className="font-bold text-slate-800 dark:text-slate-100 min-w-0">
                          {t("electricity.history.totalInvoiceLabel")}
                        </span>
                        <span className="font-mono text-lg font-extrabold text-slate-900 dark:text-white shrink-0">
                          €{selectedDetailRecord.totalCost.toFixed(2)}
                        </span>
                      </div>
                    </>
                  ) : detailMode === "single" ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-100 min-w-0">
                        {t("electricity.history.singleMeterBillLabel")}
                      </span>
                      <span className="font-mono text-lg font-extrabold text-slate-900 dark:text-white shrink-0">
                        €{selectedDetailRecord.costEm1.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-100 min-w-0">
                        {t("electricity.history.amountColon")}
                      </span>
                      <span className="font-mono text-lg font-extrabold text-slate-900 dark:text-white shrink-0">
                        €{selectedDetailRecord.totalCost.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {detailNote && (
                  <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 break-words">
                    <span className="font-semibold">{t("electricity.history.remarkPrefix")} </span>
                    {detailNote}
                  </div>
                )}
              </div>

              <div className="px-4 sm:px-5 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedDetailRecord(null)}
                  className="min-h-[40px] px-4 py-2 text-xs font-bold bg-slate-900 dark:bg-slate-700 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteDialog
        isOpen={Boolean(confirmDeleteId)}
        detailLabel={
          confirmDeleteId
            ? (() => {
                const rec = records.find((x) => x.id === confirmDeleteId);
                return rec
                  ? `${translateElectricityPeriodLabel(rec.periodLabel, language)} (€${rec.totalCost.toFixed(2)})`
                  : undefined;
              })()
            : undefined
        }
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) {
            handleDelete(confirmDeleteId);
          }
        }}
      />
    </div>
  );
};
