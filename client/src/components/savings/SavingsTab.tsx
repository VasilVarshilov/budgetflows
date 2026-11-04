import React, { useState, useMemo } from "react";
import {
  Plus,
  Minus,
  Trash2,
  PiggyBank,
  TrendingUp,
  BarChart3,
  Briefcase,
  Users,
  Gift,
  Sparkles,
  Smartphone,
  ShoppingBag,
  Wallet,
  Download,
  FileText,
  X,
  Calendar,
} from "lucide-react";
import { ExpenseCategory, IncomeItem } from "@/types";
import { InputGroup } from "@/components/ui/InputGroup";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { getHexFromTailwindClass } from "@/utils/colors";

// Map за lucide-react иконките (използва се по iconName)
const ICON_MAP: Record<string, any> = {
  Briefcase,
  Users,
  Gift,
  Sparkles,
  Smartphone,
  ShoppingBag,
  Wallet,
  TrendingUp,
};

// Predefined Income Categories
const PREDEFINED_INCOME_CATEGORIES: ExpenseCategory[] = [
  {
    id: "salary",
    name: "Заплата",
    iconName: "Briefcase",
    colorClass: "bg-emerald-100 text-emerald-600",
  },
  {
    id: "parents",
    name: "От родители",
    iconName: "Users",
    colorClass: "bg-blue-100 text-blue-600",
  },
  {
    id: "gifts",
    name: "Подаръци",
    iconName: "Gift",
    colorClass: "bg-pink-100 text-pink-500",
  },
  {
    id: "bonus",
    name: "Бонус",
    iconName: "Sparkles",
    colorClass: "bg-yellow-100 text-yellow-600",
  },
  {
    id: "freelance",
    name: "Фрийланс",
    iconName: "Smartphone",
    colorClass: "bg-purple-100 text-purple-600",
  },
  {
    id: "sales",
    name: "Продажби",
    iconName: "ShoppingBag",
    colorClass: "bg-orange-100 text-orange-600",
  },
  {
    id: "investments",
    name: "Инвестиции",
    iconName: "TrendingUp",
    colorClass: "bg-cyan-100 text-cyan-600",
  },
  {
    id: "other_income",
    name: "Други",
    iconName: "Wallet",
    colorClass: "bg-slate-100 text-slate-600",
  },
];

interface SavingsTabProps {
  onUpdateSavings: (incomes: IncomeItem[]) => void;
  savingsData: IncomeItem[];
}

const MONTHS_SHORT = [
  "Яну",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Юни",
  "Юли",
  "Авг",
  "Сеп",
  "Окт",
  "Ное",
  "Дек",
];

export const SavingsTab: React.FC<SavingsTabProps> = ({
  onUpdateSavings,
  savingsData,
}) => {
  const [categories, setCategories] = useState<ExpenseCategory[]>(
    PREDEFINED_INCOME_CATEGORIES,
  );

  // UI State
  const [isAdding, setIsAdding] = useState(false);
  const [transactionType, setTransactionType] = useState<"income" | "expense">(
    "income",
  );

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const currentYear = new Date().getFullYear();

  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<
    "all" | "current_month" | "current_year" | "custom_year" | "custom_range"
  >("all");
  const [exportYear, setExportYear] = useState(currentYear.toString());
  const [exportStartDate, setExportStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [exportEndDate, setExportEndDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );

  const getFilteredSavingsTransactions = () => {
    const now = new Date();
    return savingsData
      .filter((item) => {
        const itemDate = new Date(item.date);
        if (exportScope === "all") return true;

        if (exportScope === "current_month") {
          return (
            itemDate.getFullYear() === now.getFullYear() &&
            itemDate.getMonth() === now.getMonth()
          );
        }

        if (exportScope === "current_year") {
          return itemDate.getFullYear() === now.getFullYear();
        }

        if (exportScope === "custom_year") {
          return itemDate.getFullYear().toString() === exportYear;
        }

        if (exportScope === "custom_range") {
          if (!exportStartDate && !exportEndDate) return true;
          const start = exportStartDate
            ? new Date(exportStartDate + "T00:00:00")
            : new Date(0);
          const end = exportEndDate
            ? new Date(exportEndDate + "T23:59:59")
            : new Date(8640000000000000);
          return itemDate >= start && itemDate <= end;
        }

        return true;
      })
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
  };

  const handleExportTxt = () => {
    const filtered = getFilteredSavingsTransactions();
    if (filtered.length === 0) return;

    let periodLabel = "";
    const now = new Date();
    if (exportScope === "all") {
      periodLabel = "Пълна история (Lifetime)";
    } else if (exportScope === "current_month") {
      const monthName = now.toLocaleDateString("bg-BG", { month: "long" });
      periodLabel = `${monthName} ${now.getFullYear()}`;
    } else if (exportScope === "current_year") {
      periodLabel = `${now.getFullYear()} година`;
    } else if (exportScope === "custom_year") {
      periodLabel = `${exportYear} година`;
    } else {
      periodLabel = `${exportStartDate || "начало"} до ${exportEndDate || "край"}`;
    }

    let totalIncome = 0;
    let totalExpense = 0;

    filtered.forEach((tx) => {
      if (tx.type === "expense") {
        totalExpense += tx.amount;
      } else {
        totalIncome += tx.amount;
      }
    });

    const netChange = totalIncome - totalExpense;

    const lines: string[] = [];
    lines.push("================================================================================");
    lines.push("               ОТЧЕТ ЗА СПЕСТЯВАНИЯ И ТРАНЗАКЦИИ (BudgetFlows)                 ");
    lines.push("================================================================================");
    lines.push(`Период: ${periodLabel}`);
    lines.push(`Генериран на: ${new Date().toLocaleString("bg-BG")}`);
    lines.push(`Брой транзакции в периода: ${filtered.length}`);
    lines.push("--------------------------------------------------------------------------------");
    lines.push("ОБЩА РАВНОСМЕТКА ЗА ИЗБРАНИЯ ПЕРИОД:");
    lines.push(`• Общо постъпления (Приходи) : +€${totalIncome.toFixed(2)}`);
    lines.push(`• Общо изтеглени (Разходи)   : -€${totalExpense.toFixed(2)}`);
    lines.push(`• Нетно салдо за периода     : ${netChange >= 0 ? "+" : ""}€${netChange.toFixed(2)}`);
    lines.push(`• Текущ общ наличен баланс   : €${totalBalance.toFixed(2)}`);
    lines.push("================================================================================\n");

    lines.push("ПОДРОБЕН СПИСЪК С ТРАНЗАКЦИИ В ПЕРИОДА:");
    lines.push("--------------------------------------------------------------------------------");
    lines.push(
      "Дата".padEnd(12) +
      " | " +
      "Тип".padEnd(8) +
      " | " +
      "Категория".padEnd(20) +
      " | " +
      "Сума".padEnd(12) +
      " | Бележка"
    );
    lines.push("--------------------------------------------------------------------------------");

    filtered.forEach((tx) => {
      const dateStr = new Date(tx.date).toLocaleDateString("bg-BG");
      const typeStr = tx.type === "expense" ? "РАЗХОД" : "ПРИХОД";
      const sign = tx.type === "expense" ? "-€" : "+€";
      const amountStr = `${sign}${tx.amount.toFixed(2)}`;
      const noteStr = tx.note || "-";

      lines.push(
        dateStr.padEnd(12) +
        " | " +
        typeStr.padEnd(8) +
        " | " +
        tx.categoryName.padEnd(20) +
        " | " +
        amountStr.padEnd(12) +
        " | " +
        noteStr
      );
    });

    lines.push("--------------------------------------------------------------------------------");
    lines.push("================================================================================\n");

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Spestyavaniya_Otchet_${periodLabel.replace(/[\s\(\)]+/g, "_")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportModalOpen(false);
  };

  // Handlers
  const handleAddNewCategory = (name: string) => {
    const newCat: ExpenseCategory = {
      id: `custom_inc_${Date.now()}`,
      name,
      iconName: "Wallet",
      colorClass: "bg-slate-100 text-slate-600",
      isCustom: true,
    };
    setCategories((prev) => [...prev, newCat]);
    handleSelectCategory(newCat);
  };

  const handleSelectCategory = (cat: ExpenseCategory) => {
    setSelectedCategory(cat);
    setShowCategoryPicker(false);
  };

  const handleOpenAdd = (type: "income" | "expense") => {
    setTransactionType(type);
    setIsAdding(true);
    setSelectedCategory(null);
    setAmount("");
    setNote("");
  };

  const handleAddTransaction = () => {
    if (!selectedCategory || !amount) return;

    const newTransaction: IncomeItem = {
      id: Date.now().toString(),
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      categoryIcon: selectedCategory.iconName,
      categoryColor: selectedCategory.colorClass,
      amount: parseFloat(amount),
      note: note,
      date: new Date().toISOString(),
      type: transactionType,
    };

    const newData = [...savingsData, newTransaction];
    onUpdateSavings(newData);

    setIsAdding(false);
    setSelectedCategory(null);
    setAmount("");
    setNote("");
  };

  const handleDeleteTransaction = (id: string) => {
    const newData = savingsData.filter((e) => e.id !== id);
    onUpdateSavings(newData);
  };

  // Calculations for Current Total Balance
  const totalBalance = useMemo(() => {
    return savingsData.reduce((acc, item) => {
      return acc + (item.type === "expense" ? -item.amount : item.amount);
    }, 0);
  }, [savingsData]);

  // Chart Logic: Monthly Growth (Cumulative Balance per Month)
  const monthlyData = useMemo(() => {
    const data = Array(12).fill(0);

    for (let month = 0; month < 12; month++) {
      // End of the specific month
      const endOfMonth = new Date(currentYear, month + 1, 0, 23, 59, 59);

      const balance = savingsData.reduce((acc, item) => {
        const itemDate = new Date(item.date);
        if (itemDate <= endOfMonth) {
          return acc + (item.type === "expense" ? -item.amount : item.amount);
        }
        return acc;
      }, 0);

      data[month] = balance;
    }
    return data;
  }, [savingsData, currentYear]);

  const renderMonthlyGrowthChart = () => {
    // 1. Determine Scale
    const maxValue = Math.max(...monthlyData, 100); // Minimum scale of 100 to avoid flat lines on empty
    const minValue = Math.min(...monthlyData, 0);

    // Add breathing room (15%)
    const range = maxValue - minValue;
    const padding = range * 0.15;
    const yMax = maxValue + padding;
    const yMin = Math.min(0, minValue - Math.abs(minValue) * 0.1); // Extend down if negatives exist
    const yRange = yMax - yMin;

    const chartHeight = 280; // Increased height for better labels
    const chartWidth = 800; // Virtual width for SVG logic
    const barWidth = 40;
    const gap = (chartWidth - barWidth * 12) / 11;

    // Helper to map value to Y coordinate
    const getY = (val: number) => {
      const normalizedValue = val - yMin;
      // SVG Y grows downwards, so flip
      return chartHeight - (normalizedValue / yRange) * chartHeight;
    };

    const zeroY = getY(0);

    return (
      <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
        <div className="min-w-[600px] h-[300px] relative">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-full overflow-visible"
          >
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const val = yMin + range * pct;
              const y = getY(val);
              return (
                <g key={pct}>
                  <line
                    x1="0"
                    y1={y}
                    x2={chartWidth}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                </g>
              );
            })}

            {/* Zero Line (Stronger) */}
            <line
              x1="0"
              y1={zeroY}
              x2={chartWidth}
              y2={zeroY}
              stroke="#94a3b8"
              strokeWidth="1.5"
            />

            {/* Bars & Labels */}
            {monthlyData.map((value, index) => {
              const isPositive = value >= 0;
              const barHeight = Math.abs(getY(value) - zeroY);
              const x = index * (barWidth + gap);
              const y = isPositive ? getY(value) : zeroY;

              // Ensure minute values have at least a sliver of height
              const renderHeight = Math.max(barHeight, 2);

              return (
                <g key={index} className="group">
                  {/* Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={renderHeight}
                    rx="6" // Rounded corners
                    fill={isPositive ? "#10b981" : "#ef4444"}
                    className="transition-all duration-500 ease-out hover:opacity-80"
                  />

                  {/* Numeric Value Label */}
                  <text
                    x={x + barWidth / 2}
                    y={isPositive ? y - 10 : y + renderHeight + 18}
                    textAnchor="middle"
                    className="text-[12px] font-bold fill-slate-600 transition-all"
                    style={{ textShadow: "0 1px 2px rgba(255,255,255,0.8)" }}
                  >
                    €{Math.round(value)}
                  </text>

                  {/* Month Label */}
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 25}
                    textAnchor="middle"
                    className="text-[12px] fill-slate-400 font-semibold uppercase tracking-wide"
                  >
                    {MONTHS_SHORT[index]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <PiggyBank className="w-6 h-6 text-emerald-600" />
            Спестявания
          </h2>
          <p className="text-sm text-slate-500">
            Общ баланс и история (Lifetime)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-sm font-semibold transition-colors shadow-xs cursor-pointer"
            title="Експорт на спестявания в текстов файл"
          >
            <Download className="w-4 h-4" />
            <span>Експорт</span>
          </button>
          <div className="text-right bg-white px-4 py-2 rounded-xl border border-emerald-100 shadow-sm">
            <span className="text-xs text-slate-400 block uppercase tracking-wider font-semibold">
              Налични средства
            </span>
            <span
              className={`text-3xl font-black ${totalBalance >= 0 ? "text-emerald-600" : "text-red-500"}`}
            >
              €{totalBalance.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: List and Add Form */}
        <div className="space-y-4 order-2 lg:order-1">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-700">
              История на транзакциите
            </h3>
            {!isAdding && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenAdd("expense")}
                  className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleOpenAdd("income")}
                  className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Добави
                </button>
              </div>
            )}
          </div>

          {/* Add Form Panel */}
          {isAdding && (
            <div
              className={`
              p-5 rounded-xl shadow-lg border animate-in slide-in-from-top-4 mb-4 relative bg-white
              ${transactionType === "income" ? "border-emerald-100 ring-1 ring-emerald-50" : "border-red-100 ring-1 ring-red-50"}
            `}
            >
              <button
                onClick={() => setIsAdding(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <h4
                className={`font-bold mb-4 flex items-center gap-2 ${transactionType === "income" ? "text-emerald-700" : "text-red-700"}`}
              >
                {transactionType === "income" ? (
                  <Plus className="w-4 h-4" />
                ) : (
                  <Minus className="w-4 h-4" />
                )}
                {transactionType === "income" ? "Добави приход" : "Извади сума"}
              </h4>

              <div className="space-y-4">
                {/* Category Selector Trigger */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Категория
                  </label>
                  <button
                    onClick={() => setShowCategoryPicker(true)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-slate-300 rounded-md hover:border-emerald-300 focus:ring-2 focus:ring-emerald-100 transition-all text-left"
                  >
                    {selectedCategory ? (
                      <span className="flex items-center gap-2 text-slate-800">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center ${selectedCategory.colorClass}`}
                        >
                          {selectedCategory.iconName &&
                          ICON_MAP[selectedCategory.iconName] ? (
                            React.createElement(
                              ICON_MAP[selectedCategory.iconName],
                              {
                                className: "w-2.5 h-2.5 text-current",
                              },
                            )
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-current" />
                          )}
                        </span>
                        {selectedCategory.name}
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Избери категория...
                      </span>
                    )}
                    <Plus className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                <InputGroup
                  label="Сума (EUR)"
                  value={amount}
                  onChange={setAmount}
                  placeholder="0.00"
                />

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Бележка (опционално)
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm text-slate-900"
                    placeholder="..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleAddTransaction}
                    disabled={!selectedCategory || !amount}
                    className={`
                      flex-1 text-white py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                      ${transactionType === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
                    `}
                  >
                    {transactionType === "income" ? "Добави" : "Извади"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Transactions List */}
          <div className="space-y-3">
            {savingsData
              .slice()
              .reverse()
              .map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${item.categoryColor}`}
                    >
                      {item.categoryIcon && ICON_MAP[item.categoryIcon] ? (
                        React.createElement(ICON_MAP[item.categoryIcon], {
                          className: "w-4 h-4 text-white",
                        })
                      ) : item.type === "expense" ? (
                        <Minus className="w-4 h-4" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">
                        {item.categoryName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(item.date).toLocaleDateString("bg-BG")}
                      </p>
                      {item.note && (
                        <p className="text-xs text-slate-500 mt-0.5 italic">
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-bold ${item.type === "expense" ? "text-red-500" : "text-emerald-600"}`}
                    >
                      {item.type === "expense" ? "-" : "+"}€
                      {item.amount.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleDeleteTransaction(item.id)}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

            {savingsData.length === 0 && (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400">
                <PiggyBank className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p>Все още няма записи</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Chart */}
        <div className="order-1 lg:order-2">
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 sticky top-6">
            <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Месечен растеж
            </h3>
            {savingsData.length > 0 ? (
              renderMonthlyGrowthChart()
            ) : (
              <div className="h-[200px] flex items-center justify-center text-slate-400">
                Няма достатъчно данни за графиката
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category Picker Modal */}
      {showCategoryPicker && (
        <CategoryPicker
          categories={categories}
          onSelect={handleSelectCategory}
          onClose={() => setShowCategoryPicker(false)}
          onAddNewCategory={handleAddNewCategory}
        />
      )}

      {/* Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Експорт на спестявания</h3>
                  <p className="text-xs text-slate-400">Сваляне на транзакции в текстов (.txt) файл</p>
                </div>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
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
                      checked={exportScope === "all"}
                      onChange={() => setExportScope("all")}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="text-sm">
                      <span className="font-medium text-slate-700 block">Всички транзакции</span>
                      <span className="text-xs text-slate-400">Пълна история на спестяванията</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "current_month"}
                      onChange={() => setExportScope("current_month")}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="text-sm">
                      <span className="font-medium text-slate-700 block">Текущ месец</span>
                      <span className="text-xs text-slate-400">
                        {new Date().toLocaleDateString("bg-BG", { month: "long" })} {new Date().getFullYear()}
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "current_year"}
                      onChange={() => setExportScope("current_year")}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="text-sm">
                      <span className="font-medium text-slate-700 block">Текуща година</span>
                      <span className="text-xs text-slate-400">{currentYear} година</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "custom_range"}
                      onChange={() => setExportScope("custom_range")}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="text-sm">
                      <span className="font-medium text-slate-700 block">Конкретен диапазон от дати</span>
                      <span className="text-xs text-slate-400">Избор на начална и крайна дата</span>
                    </div>
                  </label>
                </div>
              </div>

              {exportScope === "custom_range" && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in duration-150">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">От дата:</label>
                      <input
                        type="date"
                        value={exportStartDate}
                        onChange={(e) => setExportStartDate(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">До дата:</label>
                      <input
                        type="date"
                        value={exportEndDate}
                        onChange={(e) => setExportEndDate(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 rounded p-1.5 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-emerald-50/70 rounded-xl text-xs text-emerald-800 flex justify-between items-center">
                <span>Включени транзакции:</span>
                <span className="font-bold">
                  {getFilteredSavingsTransactions().length} бр.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Отказ
              </button>
              <button
                onClick={handleExportTxt}
                disabled={getFilteredSavingsTransactions().length === 0}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
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
