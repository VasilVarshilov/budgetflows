import React, { useState, useMemo } from "react";
import {
  PieChart,
  Filter,
  Calendar,
  ChevronDown,
  CreditCard,
  Zap,
  Phone,
  Wifi,
  Download,
  FileText,
  X,
} from "lucide-react";
import { MonthlyRecord, ExpenseItem } from "@/types";
import {
  getHexFromTailwindClass,
  SYSTEM_CATEGORY_COLORS,
} from "@/utils/colors";

interface MonthlyReportsTabProps {
  monthlyData: Record<string, MonthlyRecord>;
}

interface ChartSegment {
  name: string;
  value: number;
  color: string;
  percentage: number;
}

const MONTHS_BG = [
  "Януари",
  "Февруари",
  "Март",
  "Април",
  "Май",
  "Юни",
  "Юли",
  "Август",
  "Септември",
  "Октомври",
  "Ноември",
  "Декември",
];

// Generate years from 2024 up to current year + 1
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) =>
  (CURRENT_YEAR - 1 + i).toString(),
);

export const MonthlyReportsTab: React.FC<MonthlyReportsTabProps> = ({
  monthlyData,
}) => {
  // Default to current date
  const now = new Date();
  const currentMonthName = now.toLocaleDateString("bg-BG", { month: "long" });
  const capitalizedMonth =
    currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);

  const [selectedMonth, setSelectedMonth] = useState(capitalizedMonth);
  const [selectedYear, setSelectedYear] = useState(
    now.getFullYear().toString(),
  );

  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"current" | "year" | "all" | "custom">("current");
  const [customStartMonth, setCustomStartMonth] = useState("Януари");
  const [customStartYear, setCustomStartYear] = useState(selectedYear);
  const [customEndMonth, setCustomEndMonth] = useState(selectedMonth);
  const [customEndYear, setCustomEndYear] = useState(selectedYear);

  const recordKey = `${selectedMonth} ${selectedYear}`;
  const record = monthlyData[recordKey];

  // Helper to extract filtered records for export
  const getFilteredExportRecords = () => {
    const keys = Object.keys(monthlyData);
    const parsedList: { key: string; month: string; year: number; monthIndex: number; record: MonthlyRecord }[] = [];

    keys.forEach((key) => {
      const parts = key.trim().split(" ");
      if (parts.length >= 2) {
        const month = parts[0];
        const year = parseInt(parts[1], 10);
        const monthIndex = MONTHS_BG.indexOf(month);
        if (!isNaN(year) && monthIndex !== -1 && monthlyData[key]) {
          parsedList.push({ key, month, year, monthIndex, record: monthlyData[key] });
        }
      }
    });

    let filtered = parsedList;

    if (exportScope === "current") {
      filtered = parsedList.filter((p) => p.key === recordKey);
    } else if (exportScope === "year") {
      const y = parseInt(selectedYear, 10);
      filtered = parsedList.filter((p) => p.year === y);
    } else if (exportScope === "custom") {
      const sMonthIdx = MONTHS_BG.indexOf(customStartMonth);
      const sYear = parseInt(customStartYear, 10);
      const eMonthIdx = MONTHS_BG.indexOf(customEndMonth);
      const eYear = parseInt(customEndYear, 10);

      const startScore = sYear * 12 + sMonthIdx;
      const endScore = eYear * 12 + eMonthIdx;
      const minScore = Math.min(startScore, endScore);
      const maxScore = Math.max(startScore, endScore);

      filtered = parsedList.filter((p) => {
        const score = p.year * 12 + p.monthIndex;
        return score >= minScore && score <= maxScore;
      });
    }

    // Sort chronologically
    return filtered.sort((a, b) => a.year * 12 + a.monthIndex - (b.year * 12 + b.monthIndex));
  };

  const handleExportTxt = () => {
    const records = getFilteredExportRecords();
    if (records.length === 0) return;

    let periodLabel = "";
    if (exportScope === "current") {
      periodLabel = `${selectedMonth} ${selectedYear}`;
    } else if (exportScope === "year") {
      periodLabel = `${selectedYear} година`;
    } else if (exportScope === "all") {
      periodLabel = "Всички налични отчети";
    } else {
      periodLabel = `${customStartMonth} ${customStartYear} - ${customEndMonth} ${customEndYear}`;
    }

    let totalAllFixed = 0;
    let totalAllAdditional = 0;
    let totalAllMonths = 0;

    const lines: string[] = [];
    lines.push("================================================================================");
    lines.push("                    БЮДЖЕТЕН ОТЧЕТ - РАЗХОДИ (BudgetFlows)                    ");
    lines.push("================================================================================");
    lines.push(`Период: ${periodLabel}`);
    lines.push(`Генериран на: ${new Date().toLocaleString("bg-BG")}`);
    lines.push(`Брой включени месеци: ${records.length}`);
    lines.push("================================================================================\n");

    records.forEach(({ key, record: rec }) => {
      lines.push("--------------------------------------------------------------------------------");
      lines.push(`МЕСЕЦ: ${key.toUpperCase()}`);
      lines.push("--------------------------------------------------------------------------------");

      const exp = rec.expenses;
      let monthFixedTotal = 0;
      let monthAdditionalTotal = 0;

      // 1. Фиксирани разходи
      lines.push("\n1. ФИКСИРАНИ РАЗХОДИ:");
      if (exp && Array.isArray(exp.fixed_expenses) && exp.fixed_expenses.length > 0) {
        exp.fixed_expenses.forEach((item) => {
          monthFixedTotal += item.amount;
          lines.push(`   • ${item.categoryName.padEnd(28)} : €${item.amount.toFixed(2)}`);
        });
      } else if (exp && !Array.isArray(exp.fixed_expenses) && exp.fixed_expenses) {
        const legacy = exp.fixed_expenses as any;
        if (legacy.credit_eur) {
          monthFixedTotal += legacy.credit_eur;
          lines.push(`   • ${"Кредит".padEnd(28)} : €${legacy.credit_eur.toFixed(2)}`);
        }
        if (legacy.phone_eur) {
          monthFixedTotal += legacy.phone_eur;
          lines.push(`   • ${"Телефон".padEnd(28)} : €${legacy.phone_eur.toFixed(2)}`);
        }
        if (legacy.internet_eur) {
          monthFixedTotal += legacy.internet_eur;
          lines.push(`   • ${"Интернет".padEnd(28)} : €${legacy.internet_eur.toFixed(2)}`);
        }
      } else {
        lines.push("   (Няма въведени фиксирани разходи)");
      }
      lines.push(`   -> Междинна сума (Фиксирани): €${monthFixedTotal.toFixed(2)}`);

      // 2. Допълнителни разходи
      lines.push("\n2. ДОПЪЛНИТЕЛНИ РАЗХОДИ:");
      if (exp && exp.additional_expenses && exp.additional_expenses.length > 0) {
        exp.additional_expenses.forEach((item) => {
          monthAdditionalTotal += item.amount;
          const noteText = item.note ? ` (${item.note})` : "";
          const dateText = item.date ? ` [${new Date(item.date).toLocaleDateString("bg-BG")}]` : "";
          lines.push(`   • ${(item.categoryName + noteText).padEnd(32)} : €${item.amount.toFixed(2)}${dateText}`);
        });
      } else {
        lines.push("   (Няма въведени допълнителни разходи)");
      }
      lines.push(`   -> Междинна сума (Допълнителни): €${monthAdditionalTotal.toFixed(2)}`);

      const monthTotal = monthFixedTotal + monthAdditionalTotal;
      totalAllFixed += monthFixedTotal;
      totalAllAdditional += monthAdditionalTotal;
      totalAllMonths += monthTotal;

      lines.push(`\n>>> ОБЩО РАЗХОДИ ЗА ${key}: €${monthTotal.toFixed(2)}\n`);
    });

    lines.push("================================================================================");
    lines.push("                       ОБЩА РАВНОСМЕТКА ЗА ЦЕЛИЯ ПЕРИОД                         ");
    lines.push("================================================================================");
    lines.push(`Общо фиксирани разходи    : €${totalAllFixed.toFixed(2)}`);
    lines.push(`Общо допълнителни разходи  : €${totalAllAdditional.toFixed(2)}`);
    lines.push(`ОБЩО РАЗХОДИ ЗА ПЕРИОДА    : €${totalAllMonths.toFixed(2)}`);
    if (records.length > 1) {
      lines.push(`Средно месечен разход      : €${(totalAllMonths / records.length).toFixed(2)}`);
    }
    lines.push("================================================================================\n");

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Otchet_Razhodi_${periodLabel.replace(/[\s\(\)]+/g, "_")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportModalOpen(false);
  };

  // Aggregation Logic
  const chartData = useMemo(() => {
    if (!record || !record.expenses) return [];

    const segments: ChartSegment[] = [];
    const exp = record.expenses;

    // 1. Electricity
    if (exp.saved_em2_eur > 0) {
      segments.push({
        name: "Ток",
        value: exp.saved_em2_eur,
        color: SYSTEM_CATEGORY_COLORS["Ток"],
        percentage: 0,
      });
    }

    // 2. Fixed Expenses
    // Handle both new array format and legacy object format
    if (Array.isArray(exp.fixed_expenses)) {
      // Aggregate by category just in case there are duplicates, though usually unique
      const fixedMap: Record<string, number> = {};
      exp.fixed_expenses.forEach((item) => {
        fixedMap[item.categoryName] =
          (fixedMap[item.categoryName] || 0) + item.amount;
      });

      Object.entries(fixedMap).forEach(([name, amount]) => {
        // Try to map system colors if possible
        let color = "#94a3b8"; // slate
        if (name === "Кредит") color = SYSTEM_CATEGORY_COLORS["Кредит"];
        else if (name === "Телефон") color = SYSTEM_CATEGORY_COLORS["Телефон"];
        else if (name === "Интернет")
          color = SYSTEM_CATEGORY_COLORS["Интернет"];
        else {
          // Attempt to find the item to extract its color class
          const item = exp.fixed_expenses.find((i) => i.categoryName === name);
          if (item) color = getHexFromTailwindClass(item.categoryColor);
        }

        segments.push({ name, value: amount, color, percentage: 0 });
      });
    } else if (exp.fixed_expenses) {
      // Legacy Object Format
      const legacy = exp.fixed_expenses as any;
      if (legacy.credit_eur > 0) {
        segments.push({
          name: "Кредит",
          value: legacy.credit_eur,
          color: SYSTEM_CATEGORY_COLORS["Кредит"],
          percentage: 0,
        });
      }
      if (legacy.phone_eur > 0) {
        segments.push({
          name: "Телефон",
          value: legacy.phone_eur,
          color: SYSTEM_CATEGORY_COLORS["Телефон"],
          percentage: 0,
        });
      }
      if (legacy.internet_eur > 0) {
        segments.push({
          name: "Интернет",
          value: legacy.internet_eur,
          color: SYSTEM_CATEGORY_COLORS["Интернет"],
          percentage: 0,
        });
      }
    }

    // 3. Additional Expenses (Grouped)
    const groupedAdditional: Record<string, { value: number; color: string }> =
      {};

    if (exp.additional_expenses) {
      exp.additional_expenses.forEach((item: ExpenseItem) => {
        if (!groupedAdditional[item.categoryName]) {
          groupedAdditional[item.categoryName] = {
            value: 0,
            color: getHexFromTailwindClass(item.categoryColor),
          };
        }
        groupedAdditional[item.categoryName].value += item.amount;
      });
    }

    Object.entries(groupedAdditional).forEach(([name, data]) => {
      segments.push({
        name,
        value: data.value,
        color: data.color,
        percentage: 0,
      });
    });

    // Calculate Percentages
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (total > 0) {
      segments.forEach((s) => {
        s.percentage = (s.value / total) * 100;
      });
    }

    // Sort by value desc
    return segments.sort((a, b) => b.value - a.value);
  }, [record]);

  const totalExpense = chartData.reduce((sum, item) => sum + item.value, 0);

  // Helper for Donut Chart SVG
  const renderDonutChart = () => {
    if (chartData.length === 0) return null;

    let cumulativePercent = 0;
    const GAP_PERCENT = 1;

    // Improved SVG coordinate system: 100x100
    const radius = 40;
    const circumference = 2 * Math.PI * radius;

    return (
      <div className="relative w-64 h-64 mx-auto my-6">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full transform -rotate-90"
        >
          {chartData.map((segment, index) => {
            const val = segment.percentage; // 0 to 100

            const strokeLength = (val / 100) * circumference;
            const gapLength =
              chartData.length > 1 ? (GAP_PERCENT / 100) * circumference : 0;
            const drawLength = Math.max(0, strokeLength - gapLength);

            const offset = -1 * (cumulativePercent / 100) * circumference;
            cumulativePercent += val;

            return (
              <circle
                key={index}
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke={segment.color}
                strokeWidth="12"
                strokeDasharray={`${drawLength} ${circumference - drawLength}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                className="transition-all duration-500 ease-out hover:opacity-90"
              />
            );
          })}
        </svg>
        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">
            Общо
          </span>
          <span className="text-2xl font-black text-slate-800 tracking-tight">
            €{totalExpense.toFixed(2)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <PieChart className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Месечен отчет</h2>
        </div>

        <div className="flex gap-2">
          {/* Month Selector */}
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 py-2 pl-4 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
            >
              {MONTHS_BG.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Year Selector */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 py-2 pl-4 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Export Button */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-sm font-semibold transition-colors shadow-xs cursor-pointer"
            title="Експорт на отчет в текстов файл"
          >
            <Download className="w-4 h-4" />
            <span>Експорт</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      {!record ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            Няма данни за този период
          </h3>
          <p className="text-slate-500">
            Няма намерени записи за {selectedMonth} {selectedYear}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Chart Section */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 flex flex-col items-center justify-center min-h-[350px]">
            <h3 className="w-full text-left font-semibold text-slate-700 mb-6 flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              Разпределение
            </h3>

            {chartData.length > 0 ? (
              renderDonutChart()
            ) : (
              <div className="h-64 flex items-center justify-center w-full">
                <p className="text-slate-400">Няма разходи за показване</p>
              </div>
            )}

            {/* Legend / Mini Stats */}
            <div className="flex flex-wrap gap-3 justify-center mt-6">
              {chartData.slice(0, 5).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 text-xs bg-slate-50 px-2 py-1 rounded-md border border-slate-100"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-slate-600 font-bold">
                    {Math.round(item.percentage)}%
                  </span>
                  <span className="text-slate-400 truncate max-w-[80px]">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* List Section */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 flex flex-col">
            <h3 className="font-semibold text-slate-700 mb-6 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400" />
              Детайли по категория
            </h3>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar max-h-[400px]">
              {chartData.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm"
                      style={{ backgroundColor: item.color }}
                    >
                      {/* Icon placeholder logic */}
                      {item.name === "Ток" ? (
                        <Zap className="w-5 h-5" />
                      ) : item.name === "Телефон" ? (
                        <Phone className="w-5 h-5" />
                      ) : item.name === "Интернет" ? (
                        <Wifi className="w-5 h-5" />
                      ) : item.name === "Кредит" ? (
                        <CreditCard className="w-5 h-5" />
                      ) : (
                        <span className="text-xs font-bold">
                          {item.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{item.name}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${item.percentage}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                        <p className="text-xs text-slate-400">
                          {item.percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="font-bold text-slate-700">
                    €{item.value.toFixed(2)}
                  </span>
                </div>
              ))}

              {chartData.length === 0 && (
                <div className="text-center py-8 text-slate-400 italic">
                  Няма записани разходи
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center">
              <span className="text-sm font-medium text-slate-500">
                Общо разходи
              </span>
              <span className="text-xl font-bold text-slate-800">
                €{totalExpense.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Експорт на отчет</h3>
                  <p className="text-xs text-slate-400">Сваляне в текстов (.txt) файл</p>
                </div>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Изберете период за експорт:
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "current"}
                      onChange={() => setExportScope("current")}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="text-sm">
                      <span className="font-medium text-slate-700 block">Текущ избран месец</span>
                      <span className="text-xs text-slate-400">{selectedMonth} {selectedYear}</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "year"}
                      onChange={() => setExportScope("year")}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="text-sm">
                      <span className="font-medium text-slate-700 block">Цялата година</span>
                      <span className="text-xs text-slate-400">{selectedYear} г. (всички налични месеци)</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "all"}
                      onChange={() => setExportScope("all")}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="text-sm">
                      <span className="font-medium text-slate-700 block">Всички налични отчети</span>
                      <span className="text-xs text-slate-400">Пълна история на записите</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "custom"}
                      onChange={() => setExportScope("custom")}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="text-sm">
                      <span className="font-medium text-slate-700 block">Конкретен период (От ... До ...)</span>
                      <span className="text-xs text-slate-400">Избор на начален и краен месец</span>
                    </div>
                  </label>
                </div>
              </div>

              {exportScope === "custom" && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in duration-150">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs font-semibold text-slate-600 block mb-1">От:</span>
                      <div className="flex gap-1">
                        <select
                          value={customStartMonth}
                          onChange={(e) => setCustomStartMonth(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 rounded p-1.5"
                        >
                          {MONTHS_BG.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          value={customStartYear}
                          onChange={(e) => setCustomStartYear(e.target.value)}
                          className="text-xs bg-white border border-slate-200 rounded p-1.5"
                        >
                          {YEARS.map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-600 block mb-1">До:</span>
                      <div className="flex gap-1">
                        <select
                          value={customEndMonth}
                          onChange={(e) => setCustomEndMonth(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 rounded p-1.5"
                        >
                          {MONTHS_BG.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          value={customEndYear}
                          onChange={(e) => setCustomEndYear(e.target.value)}
                          className="text-xs bg-white border border-slate-200 rounded p-1.5"
                        >
                          {YEARS.map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-indigo-50/70 rounded-xl text-xs text-indigo-800 flex justify-between items-center">
                <span>Включени в отчета:</span>
                <span className="font-bold">
                  {getFilteredExportRecords().length} {getFilteredExportRecords().length === 1 ? "месец" : "месеца"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Отказ
              </button>
              <button
                onClick={handleExportTxt}
                disabled={getFilteredExportRecords().length === 0}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Свали .txt файл
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
