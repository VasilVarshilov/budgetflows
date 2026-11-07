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
  Plug,
  RefreshCw,
  AlertTriangle,
  BarChart2,
  Clock,
  PlusCircle,
  HelpCircle,
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
import { MONTHS_BG_LIST } from "@/utils/electricityStorage";
import {
  exportElectricityHistoryToTxt,
  exportElectricityHistoryToPng,
  ElectricityFilterInfo,
} from "@/utils/electricityExport";
import { useTheme } from "@/utils/themeContext";

const BGN_EUR_RATE = 1.95583;

interface ElectricityHistoryTabProps {
  records: ElectricityRecord[];
  onDeleteRecord: (id: string) => void;
  onSwitchToCalculator: () => void;
}

export const ElectricityHistoryTab: React.FC<ElectricityHistoryTabProps> = ({
  records,
  onDeleteRecord,
  onSwitchToCalculator,
}) => {
  const { isDark } = useTheme();
  const gridStroke = isDark ? "#334155" : "#f1f5f9";
  const axisTickStyle = { fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" };

  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedYear !== "all" && r.year !== selectedYear) {
        return false;
      }
      if (selectedMonth !== "all" && r.month !== selectedMonth) {
        return false;
      }
      return true;
    });
  }, [records, selectedYear, selectedMonth]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalCount = filteredRecords.length;
    const totalConsumption = filteredRecords.reduce(
      (sum, r) => sum + r.consumption,
      0
    );
    const totalCost = filteredRecords.reduce((sum, r) => sum + r.totalCost, 0);
    const totalEm1 = filteredRecords.reduce((sum, r) => sum + r.costEm1, 0);
    const totalEm2 = filteredRecords.reduce((sum, r) => sum + r.em2Remainder, 0);

    const avgConsumption =
      totalCount > 0 ? totalConsumption / totalCount : 0;
    const avgCost = totalCount > 0 ? totalCost / totalCount : 0;
    const avgPrice =
      totalConsumption > 0 ? totalCost / totalConsumption : 0;

    return {
      totalCount,
      totalConsumption,
      totalCost,
      totalEm1,
      totalEm2,
      avgConsumption,
      avgCost,
      avgPrice,
    };
  }, [filteredRecords]);

  // Chronological data for charts (oldest to newest)
  const chartData = useMemo(() => {
    return [...filteredRecords]
      .reverse()
      .map((r) => ({
        period: r.periodLabel,
        shortPeriod: `${r.month.slice(0, 3)} '${r.year.slice(-2)}`,
        consumption: Number(r.consumption.toFixed(2)),
        consT1: Number(r.consT1.toFixed(2)),
        consT2: Number(r.consT2.toFixed(2)),
        totalCost: Number(r.totalCost.toFixed(2)),
        costEm1: Number(r.costEm1.toFixed(2)),
        em2Remainder: Number(r.em2Remainder.toFixed(2)),
      }));
  }, [filteredRecords]);

  const handleResetFilters = () => {
    setSelectedYear("all");
    setSelectedMonth("all");
  };

  const currentFilterInfo: ElectricityFilterInfo = {
    selectedYear,
    selectedMonth,
  };

  const handleExportTxt = () => {
    exportElectricityHistoryToTxt(filteredRecords, currentFilterInfo);
  };

  const handleExportPng = () => {
    exportElectricityHistoryToPng(filteredRecords, currentFilterInfo);
  };

  const handleDelete = (id: string) => {
    onDeleteRecord(id);
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-6">
      {/* Filters and Export Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        {/* Left side: Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 text-sm font-semibold">
            <Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Филтрирай:</span>
          </div>

          {/* Year Filter */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/20"
          >
            <option value="all">Всички години</option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr} г.
              </option>
            ))}
          </select>

          {/* Month Filter */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/20"
          >
            <option value="all">Всички месеци</option>
            {MONTHS_BG_LIST.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {(selectedYear !== "all" || selectedMonth !== "all") && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 rounded-md transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Изчисти филтрите
            </button>
          )}

          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-1">
            Намерени: <strong className="text-slate-800 dark:text-slate-100">{filteredRecords.length}</strong> от {records.length} записа
          </div>
        </div>

        {/* Right side: Export buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportTxt}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Експорт на историята в текстов файл (.txt)"
          >
            <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>Експорт TXT</span>
          </button>

          <button
            onClick={handleExportPng}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Експорт на историята в изображение (.png)"
          >
            <Download className="w-4 h-4" />
            <span>Експорт PNG</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Consumption */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-yellow-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
          <div className="flex items-center justify-between text-yellow-600 dark:text-yellow-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Общо потребление
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
            <span>Средно/месец:</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {stats.avgConsumption.toFixed(2)} kWh
            </span>
          </div>
        </div>

        {/* Total Cost */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-emerald-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Общ разход (Фактури)
            </span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-lg">
              <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 dark:text-white">
            €{stats.totalCost.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
            <span>В лева:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {(stats.totalCost * BGN_EUR_RATE).toFixed(2)} лв.
            </span>
          </div>
        </div>

        {/* Meter 1 vs Meter 2 */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-indigo-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Разпределение ЕМ1 / ЕМ2
            </span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-lg">
              <Lightbulb className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500">ЕМ 1:</div>
              <div className="text-lg font-bold text-slate-800 dark:text-white">
                €{stats.totalEm1.toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 dark:text-slate-500">ЕМ 2 (Остатък):</div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                €{stats.totalEm2.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
            <span>Средна сметка/отчет:</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              €{stats.avgCost.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Average Unit Price */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-sky-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
          <div className="flex items-center justify-between text-sky-600 dark:text-sky-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Средна цена за kWh
            </span>
            <div className="p-2 bg-sky-50 dark:bg-sky-950/60 rounded-lg">
              <TrendingUp className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 dark:text-white">
            €{stats.avgPrice.toFixed(4)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center justify-between">
            <span>В лева за kWh:</span>
            <span className="font-semibold text-sky-700 dark:text-sky-400">
              {(stats.avgPrice * BGN_EUR_RATE).toFixed(4)} лв.
            </span>
          </div>
        </div>
      </div>

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
                  Тренд на потреблението (kWh)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Разпределение по периоди и тарифи (Т1 Дневна / Т2 Нощна)
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
                          <p className="font-bold text-yellow-400">{d.period}</p>
                          <div className="pt-1 space-y-0.5">
                            <p className="text-slate-300">
                              Т1 Дневна: <span className="font-mono font-bold text-white">{d.consT1} kWh</span>
                            </p>
                            <p className="text-slate-300">
                              Т2 Нощна: <span className="font-mono font-bold text-white">{d.consT2} kWh</span>
                            </p>
                            <div className="border-t border-slate-700 pt-1 mt-1 flex justify-between font-bold text-white">
                              <span>Общо:</span>
                              <span className="text-yellow-400">{d.consumption} kWh</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                    formatter={(val) =>
                      val === "consT1"
                        ? "Т1 (Дневна)"
                        : val === "consT2"
                        ? "Т2 (Нощна)"
                        : "Общо (kWh)"
                    }
                  />
                  <Bar dataKey="consT1" stackId="a" fill="#f59e0b" name="consT1" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="consT2" stackId="a" fill="#6366f1" name="consT2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
                Няма данни за визуализация на потреблението.
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
                  Тренд на разходите (€)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Обща фактура спрямо Електромер 1 и Електромер 2
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
                          <p className="font-bold text-emerald-400">{d.period}</p>
                          <div className="pt-1 space-y-0.5">
                            <p className="text-slate-300">
                              Обща фактура:{" "}
                              <span className="font-mono font-bold text-white">
                                €{d.totalCost} ({(d.totalCost * BGN_EUR_RATE).toFixed(2)} лв.)
                              </span>
                            </p>
                            <p className="text-slate-300">
                              Електромер 1:{" "}
                              <span className="font-mono font-bold text-yellow-300">
                                €{d.costEm1}
                              </span>
                            </p>
                            <p className="text-slate-300">
                              Електромер 2:{" "}
                              <span className="font-mono font-bold text-emerald-300">
                                €{d.em2Remainder}
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                    formatter={(val) =>
                      val === "totalCost"
                        ? "Общо по фактура (€)"
                        : val === "costEm1"
                        ? "Електромер 1 (€)"
                        : "Електромер 2 (€)"
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
                  <Line
                    type="monotone"
                    dataKey="costEm1"
                    stroke="#f59e0b"
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: "#f59e0b" }}
                    name="costEm1"
                  />
                  <Line
                    type="monotone"
                    dataKey="em2Remainder"
                    stroke="#06b6d4"
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: "#06b6d4" }}
                    name="em2Remainder"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
                Няма данни за визуализация на разходите.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table View */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
              Списък със записани отчети
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
              {filteredRecords.length}
            </span>
          </div>

          <button
            onClick={onSwitchToCalculator}
            className="text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-950/60 hover:bg-yellow-200 dark:hover:bg-yellow-900/60 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Нов отчет в Калкулатора
          </button>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/60 rounded-full text-yellow-600 dark:text-yellow-400">
              <Zap className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Няма намерени отчети за избрания филтър
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
              Въведете нови показания в Калкулатора. Всяко изчисление се записва автоматично тук.
            </p>
            <button
              onClick={handleResetFilters}
              className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline cursor-pointer"
            >
              Изчисти филтрите
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/70 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-xs uppercase font-bold tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <th className="py-3 px-4">Период</th>
                  <th className="py-3 px-4">Старо показание</th>
                  <th className="py-3 px-4">Ново показание</th>
                  <th className="py-3 px-4">Потребление (kWh)</th>
                  <th className="py-3 px-4">Единична цена</th>
                  <th className="py-3 px-4">Сметка ЕМ 1 / ЕМ 2</th>
                  <th className="py-3 px-4">Общо фактура</th>
                  <th className="py-3 px-4 text-center">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredRecords.map((r) => {
                  const isConfirming = confirmDeleteId === r.id;
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors group"
                    >
                      {/* Period */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {r.periodLabel}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {new Date(r.createdAt).toLocaleDateString("bg-BG")}
                        </div>
                        {r.note && (
                          <div className="text-xs text-amber-600 dark:text-amber-400 font-medium italic mt-0.5">
                            "{r.note}"
                          </div>
                        )}
                      </td>

                      {/* Previous Reading */}
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="text-slate-800 dark:text-slate-200 font-semibold">
                          {r.previousReading.toFixed(1)}
                        </div>
                        <div className="text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                          <Sun className="w-3 h-3 text-amber-500" /> {r.prevT1}
                          <Moon className="w-3 h-3 text-indigo-400 ml-1" /> {r.prevT2}
                        </div>
                      </td>

                      {/* Current Reading */}
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="text-slate-800 dark:text-slate-200 font-semibold">
                          {r.currentReading.toFixed(1)}
                        </div>
                        <div className="text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                          <Sun className="w-3 h-3 text-amber-500" /> {r.currT1}
                          <Moon className="w-3 h-3 text-indigo-400 ml-1" /> {r.currT2}
                        </div>
                      </td>

                      {/* Consumption */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="font-bold text-amber-600 dark:text-amber-400 text-sm">
                          {r.consumption.toFixed(2)} kWh
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>Дн: {r.consT1.toFixed(1)}</span>
                          <span>Нощ: {r.consT2.toFixed(1)}</span>
                        </div>
                      </td>

                      {/* Unit Price */}
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-600 dark:text-slate-400">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          €{r.unitPrice.toFixed(4)}/kWh
                        </div>
                        <div className="text-slate-400 dark:text-slate-500 mt-0.5">
                          Т1: €{r.priceT1.toFixed(4)} | Т2: €{r.priceT2.toFixed(4)}
                        </div>
                      </td>

                      {/* Meter 1 vs Meter 2 */}
                      <td className="py-3.5 px-4 text-xs">
                        <div className="flex items-center gap-1 text-slate-800 dark:text-slate-200 font-medium">
                          <Lightbulb className="w-3 h-3 text-yellow-500" />
                          <span>ЕМ 1:</span>
                          <strong className="font-mono">€{r.costEm1.toFixed(2)}</strong>
                        </div>
                        <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium mt-1">
                          <Plug className="w-3 h-3 text-emerald-500" />
                          <span>ЕМ 2:</span>
                          <strong className="font-mono">€{r.em2Remainder.toFixed(2)}</strong>
                        </div>
                      </td>

                      {/* Total Cost */}
                      <td className="py-3.5 px-4">
                        <div className="text-base font-bold text-slate-900 dark:text-white font-mono">
                          €{r.totalCost.toFixed(2)}
                        </div>
                        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {(r.totalCost * BGN_EUR_RATE).toFixed(2)} лв.
                        </div>
                      </td>

                      {/* Delete Action */}
                      <td className="py-3.5 px-4 text-center">
                        {isConfirming ? (
                          <div className="flex items-center justify-center gap-1.5 animate-in fade-in">
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
                            >
                              Изтрий!
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-xs font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors cursor-pointer"
                            >
                              Отказ
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(r.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                            title="Изтрий този отчет от историята"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
