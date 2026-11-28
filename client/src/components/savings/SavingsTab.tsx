import React, { useState, useMemo, useEffect } from "react";
import {
  Plus,
  Minus,
  Trash2,
  PiggyBank,
  TrendingUp,
  Download,
  FileText,
  X,
  Target,
} from "lucide-react";
import { ExpenseCategory, IncomeItem, MonthlyRecord, SavingsGoal } from "@/types";
import { SavingsGoalsSection } from "@/components/savings/SavingsGoalsSection";
import { InputGroup } from "@/components/ui/InputGroup";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import {
  AVAILABLE_ICONS_MAP,
  getCategoryBadgeClasses,
  loadStoredIncomeCategories,
  resolveCategoryDisplayIcon,
} from "@/utils/categoryStorage";
import {
  allocateToSavingsGoal,
  calculateTotalSavingsBalance,
  loadSavingsGoals,
  SAVINGS_GOALS_UPDATED_EVENT,
  saveSavingsGoals,
} from "@/utils/savingsGoalsStorage";
import { useTheme } from "@/utils/themeContext";
import {
  parseDecimalInput,
  compareExpensesChronologically,
} from "@/utils/formatting";
import {
  formatFullMonthIndex,
  formatLocalizedDate,
  formatShortMonthIndex,
  pluralizeUnit,
  translateCategoryName,
  translateGoalName,
  useI18n,
} from "@/i18n";

const ICON_MAP: Record<string, React.ElementType> = AVAILABLE_ICONS_MAP;

interface SavingsTabProps {
  onUpdateSavings: (incomes: IncomeItem[]) => void;
  savingsData: IncomeItem[];
  allMonthlyData?: Record<string, MonthlyRecord>;
  onTriggerSync?: () => void;
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
  allMonthlyData = {},
  onTriggerSync,
}) => {
  const { isDark } = useTheme();
  const { t, language } = useI18n();
  const [categories, setCategories] = useState<ExpenseCategory[]>(() =>
    loadStoredIncomeCategories(),
  );
  const [goals, setGoals] = useState<SavingsGoal[]>(() => loadSavingsGoals());

  useEffect(() => {
    const syncCats = () => setCategories(loadStoredIncomeCategories());
    const syncGoals = () => setGoals(loadSavingsGoals());
    const syncAll = () => {
      syncCats();
      syncGoals();
    };
    window.addEventListener("homebudget:categories-updated", syncCats);
    window.addEventListener(SAVINGS_GOALS_UPDATED_EVENT, syncGoals);
    window.addEventListener("homebudget:data-restored", syncAll);
    window.addEventListener("budgetflows:account-changed", syncAll);
    window.addEventListener("storage", syncAll);
    return () => {
      window.removeEventListener("homebudget:categories-updated", syncCats);
      window.removeEventListener(SAVINGS_GOALS_UPDATED_EVENT, syncGoals);
      window.removeEventListener("homebudget:data-restored", syncAll);
      window.removeEventListener("budgetflows:account-changed", syncAll);
      window.removeEventListener("storage", syncAll);
    };
  }, []);

  const activeGoals = useMemo(
    () => goals.filter((g) => !g.archived),
    [goals],
  );

  // UI State
  const [isAdding, setIsAdding] = useState(false);
  const [transactionType, setTransactionType] = useState<"income" | "expense">(
    "income",
  );
  const [pendingDeleteTx, setPendingDeleteTx] = useState<IncomeItem | null>(
    null,
  );

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState("");

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
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) =>
        compareExpensesChronologically(a.item, b.item, "desc", a.idx, b.idx)
      )
      .map(({ item }) => item);
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
    lines.push("            ОТЧЕТ ЗА СПЕСТЯВАНИЯ И ТРАНЗАКЦИИ (Budget Force 365)             ");
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
    lines.push(" Budget Force 365 • Track. Save. Grow.");
    lines.push("================================================================================\n");

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BudgetForce365_Savings_${periodLabel.replace(/[\s\(\)]+/g, "_")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportModalOpen(false);
  };

  // Handlers
  const handleAddNewCategory = (catOrName: ExpenseCategory | string) => {
    if (typeof catOrName === "string") {
      const latest = loadStoredIncomeCategories();
      const matched = latest.find(
        (c) => c.name.trim().toLowerCase() === catOrName.trim().toLowerCase(),
      );
      if (matched) {
        setCategories(latest);
        handleSelectCategory(matched);
      }
    } else {
      setCategories(loadStoredIncomeCategories());
      handleSelectCategory(catOrName);
    }
  };

  const handleSelectCategory = (cat: ExpenseCategory) => {
    setSelectedCategory(cat);
    setShowCategoryPicker(false);
  };

  const handleOpenAdd = (type: "income" | "expense") => {
    setTransactionType(type);
    setGoals(loadSavingsGoals());
    setIsAdding(true);
    setSelectedCategory(null);
    setAmount("");
    setNote("");
    setSelectedGoalId("");
  };

  const handleAddTransaction = () => {
    if (!selectedCategory || !amount) return;

    const parsedAmount = parseDecimalInput(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const newTransaction: IncomeItem = {
      id: nowMs.toString(),
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      categoryIcon: selectedCategory.iconName,
      categoryColor: selectedCategory.colorClass,
      amount: parsedAmount,
      note: note,
      date: nowIso,
      createdAt: nowIso,
      timestamp: nowMs,
      type: transactionType,
    };

    const newData = [...savingsData, newTransaction];
    onUpdateSavings(newData);

    if (transactionType === "income" && selectedGoalId) {
      const currentGoals = loadSavingsGoals();
      const nextTotalSavings = calculateTotalSavingsBalance(newData);
      const allocRes = allocateToSavingsGoal(
        currentGoals,
        selectedGoalId,
        parsedAmount,
        nextTotalSavings,
      );
      if (allocRes.ok) {
        const savedGoals = saveSavingsGoals(allocRes.goals);
        setGoals(savedGoals);
        onTriggerSync?.();
      }
    }

    setIsAdding(false);
    setSelectedCategory(null);
    setAmount("");
    setNote("");
    setSelectedGoalId("");
  };

  const handleDeleteTransaction = (id: string) => {
    const newData = savingsData.filter((e) => e.id !== id);
    onUpdateSavings(newData);
    setPendingDeleteTx(null);
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
    const gridLineStroke = isDark ? "#334155" : "#e2e8f0";
    const zeroLineStroke = isDark ? "#64748b" : "#94a3b8";

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
                    stroke={gridLineStroke}
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
              stroke={zeroLineStroke}
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
                    className="text-[12px] font-bold fill-slate-700 dark:fill-slate-200 transition-all"
                  >
                    €{Math.round(value)}
                  </text>

                  {/* Month Label */}
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 25}
                    textAnchor="middle"
                    className="text-[12px] fill-slate-500 dark:fill-slate-400 font-semibold uppercase tracking-wide"
                  >
                    {formatShortMonthIndex(index, language)}
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
      {/* Header (mirrors MonthlyExpensesTab top bar pattern) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl shadow-xs border border-slate-100 dark:border-slate-800 transition-colors">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <PiggyBank className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            {t("savings.mainTitle")}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t("savings.mainSubtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-end sm:self-center">
          <button
            onClick={() => {
              if (isAdding && transactionType === "income") {
                setIsAdding(false);
              } else {
                handleOpenAdd("income");
              }
            }}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
            title={t("savings.addTooltip")}
          >
            <Plus className="w-4 h-4" />
            <span>{t("savings.addShortBtn")}</span>
          </button>

          <button
            onClick={() => {
              if (isAdding && transactionType === "expense") {
                setIsAdding(false);
              } else {
                handleOpenAdd("expense");
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200/80 dark:border-red-900/60 rounded-xl text-xs sm:text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title={t("savings.withdrawTooltip")}
          >
            <Minus className="w-4 h-4" />
            <span>{t("savings.withdrawShortBtn")}</span>
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
            title={t("savings.exportTooltip")}
          >
            <Download className="w-4 h-4" />
            <span>{t("savings.exportBtn")}</span>
          </button>

          <div className="text-right pl-2 sm:pl-3 border-l border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block uppercase tracking-wider font-medium">
              {t("savings.availableFundsLabel")}
            </span>
            <span
              className={`text-xl sm:text-2xl font-black tabular-nums ${totalBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}
            >
              €{totalBalance.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Add / Withdraw Form Panel (directly below top header, matching MonthlyExpensesTab) */}
      {isAdding && (
        <div
          className={`
          p-5 rounded-2xl shadow-md border-2 animate-in slide-in-from-top-3 relative bg-white dark:bg-slate-900 transition-colors
          ${transactionType === "income" ? "border-emerald-200 dark:border-emerald-800" : "border-red-200 dark:border-red-800"}
        `}
        >
          <button
            onClick={() => setIsAdding(false)}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            title={t("common.close")}
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>

          <h4
            className={`font-bold mb-4 flex items-center gap-2 ${transactionType === "income" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}
          >
            {transactionType === "income" ? (
              <Plus className="w-4 h-4" />
            ) : (
              <Minus className="w-4 h-4" />
            )}
            {transactionType === "income"
              ? t("savings.addTooltip")
              : t("savings.withdrawTooltip")}
          </h4>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category Selector Trigger */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("common.category")}
                </label>
                <button
                  onClick={() => setShowCategoryPicker(true)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:border-emerald-300 dark:hover:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/40 transition-all text-left"
                >
                  {selectedCategory ? (
                    <span className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${getCategoryBadgeClasses(selectedCategory.colorClass)}`}
                      >
                        {(() => {
                          const iconKey = resolveCategoryDisplayIcon(
                            selectedCategory.iconName,
                            selectedCategory.name,
                          );
                          const IconComp = iconKey ? ICON_MAP[iconKey] : undefined;
                          return IconComp ? (
                            <IconComp className="w-2.5 h-2.5 text-current" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-current" />
                          );
                        })()}
                      </span>
                      {translateCategoryName(selectedCategory.name, language)}
                    </span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">
                      {t("savings.chooseCategoryPlaceholder")}
                    </span>
                  )}
                  <Plus className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <InputGroup
                label={t("savings.amountEurLabel")}
                value={amount}
                onChange={setAmount}
                placeholder="0.00"
              />
            </div>

            {transactionType === "income" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  {t("savings.goalJarOptionalLabel")}
                </label>
                <select
                  value={selectedGoalId}
                  onChange={(e) => setSelectedGoalId(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[42px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm"
                >
                  <option value="">{t("savings.goalJarNoneOption")}</option>
                  {activeGoals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.isEmergencyFund
                        ? t("savings.emergencyFundTitle")
                        : translateGoalName(goal.name, Boolean(goal.isEmergencyFund), language)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("savings.goalModal.noteLabel")}
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                placeholder="..."
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleAddTransaction}
                disabled={
                  !selectedCategory ||
                  !amount ||
                  isNaN(parseDecimalInput(amount)) ||
                  parseDecimalInput(amount) <= 0
                }
                className={`
                  flex-1 text-white py-2.5 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                  ${transactionType === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
                `}
              >
                {transactionType === "income"
                  ? t("savings.addShortBtn")
                  : t("savings.withdrawShortBtn")}
              </button>
              <button
                onClick={() => setIsAdding(false)}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Savings Goals ("Jars") & Emergency Fund */}
      <SavingsGoalsSection
        savingsData={savingsData}
        monthlyData={allMonthlyData}
        onTriggerSync={onTriggerSync}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Transactions List */}
        <div className="space-y-4 order-2 lg:order-1">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-700 dark:text-slate-200">
              {t("savings.transactionsHistoryTitle")}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium tabular-nums">
              {savingsData.length}{" "}
              {pluralizeUnit(
                savingsData.length,
                "common.entriesSingular",
                "common.entriesPlural",
                language
              )}
            </span>
          </div>

          {/* Transactions List */}
          <div className="space-y-3">
            {savingsData
              .map((item, idx) => ({ item, idx }))
              .sort((a, b) =>
                compareExpensesChronologically(a.item, b.item, "desc", a.idx, b.idx)
              )
              .map(({ item }) => (
                <div
                  key={item.id}
                  className="group flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md dark:hover:bg-slate-800/40 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${getCategoryBadgeClasses(item.categoryColor)}`}
                    >
                      {(() => {
                        const resolvedPrimary = resolveCategoryDisplayIcon(
                          item.categoryIcon,
                          item.categoryName,
                        );
                        let IconComp = resolvedPrimary
                          ? ICON_MAP[resolvedPrimary]
                          : undefined;
                        if (!IconComp) {
                          const matchedCat = categories.find(
                            (c) =>
                              c.id === item.categoryId ||
                              c.name.trim().toLowerCase() ===
                                item.categoryName.trim().toLowerCase(),
                          );
                          const matchedKey = matchedCat
                            ? resolveCategoryDisplayIcon(
                                matchedCat.iconName,
                                matchedCat.name,
                              )
                            : undefined;
                          if (matchedKey) {
                            IconComp = ICON_MAP[matchedKey];
                          }
                        }
                        if (IconComp) {
                          return <IconComp className="w-4 h-4 text-current" />;
                        }
                        return item.type === "expense" ? (
                          <Minus className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        );
                      })()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">
                        {translateCategoryName(item.categoryName, language)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatLocalizedDate(item.date, language)}
                      </p>
                      {item.note && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 italic">
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-bold ${item.type === "expense" ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
                    >
                      {item.type === "expense" ? "-" : "+"}€
                      {item.amount.toFixed(2)}
                    </span>
                    <button
                      onClick={() => setPendingDeleteTx(item)}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center p-2 text-slate-400 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      title={t("savings.deleteTxTooltip")}
                      aria-label={t("savings.deleteTxTooltip")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

            {savingsData.length === 0 && (
              <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <PiggyBank className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>{t("savings.noEntriesYet")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Chart */}
        <div className="order-1 lg:order-2">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 sticky top-6 transition-colors">
            <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              {t("savings.monthlyGrowthTitle")}
            </h3>
            {savingsData.length > 0 ? (
              renderMonthlyGrowthChart()
            ) : (
              <div className="h-[200px] flex items-center justify-center text-slate-500 dark:text-slate-400">
                {t("savings.notEnoughChartData")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category Picker Modal */}
      {showCategoryPicker && (
        <CategoryPicker
          mode="income"
          categories={categories}
          onSelect={handleSelectCategory}
          onClose={() => setShowCategoryPicker(false)}
          onAddNewCategory={handleAddNewCategory}
          onCategoriesChanged={setCategories}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteDialog
        isOpen={Boolean(pendingDeleteTx)}
        detailLabel={
          pendingDeleteTx
            ? `${translateCategoryName(pendingDeleteTx.categoryName, language)} (${pendingDeleteTx.type === "expense" ? "-" : "+"}€${pendingDeleteTx.amount.toFixed(2)})`
            : undefined
        }
        onCancel={() => setPendingDeleteTx(null)}
        onConfirm={() => {
          if (pendingDeleteTx) {
            handleDeleteTransaction(pendingDeleteTx.id);
          }
        }}
      />

      {/* Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-safe bg-slate-900/40 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full modal-panel-safe flex flex-col overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200 transition-colors">
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-lg shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-800 dark:text-white truncate">{t("savings.exportModal.title")}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{t("savings.exportModal.subtitle")}</p>
                </div>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="min-h-[40px] min-w-[40px] shrink-0 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label={t("common.close")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
              <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
                  {t("savings.exportModal.scopeLabel")}
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "all"}
                      onChange={() => setExportScope("all")}
                      className="text-emerald-600 focus:ring-emerald-500 shrink-0"
                    />
                    <div className="text-sm min-w-0 flex-1">
                      <span className="font-medium text-slate-700 dark:text-slate-200 block">{t("savings.exportModal.scopeAll")}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t("savings.exportModal.scopeAllDesc")}</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "current_month"}
                      onChange={() => setExportScope("current_month")}
                      className="text-emerald-600 focus:ring-emerald-500 shrink-0"
                    />
                    <div className="text-sm min-w-0 flex-1">
                      <span className="font-medium text-slate-700 dark:text-slate-200 block">{t("savings.exportModal.scopeCurrentMonth")}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatFullMonthIndex(new Date().getMonth(), language)} {new Date().getFullYear()}
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "current_year"}
                      onChange={() => setExportScope("current_year")}
                      className="text-emerald-600 focus:ring-emerald-500 shrink-0"
                    />
                    <div className="text-sm min-w-0 flex-1">
                      <span className="font-medium text-slate-700 dark:text-slate-200 block">{t("savings.exportModal.scopeCurrentYear")}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {t("savings.exportModal.scopeCurrentYearDesc", { year: currentYear })}
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === "custom_range"}
                      onChange={() => setExportScope("custom_range")}
                      className="text-emerald-600 focus:ring-emerald-500 shrink-0"
                    />
                    <div className="text-sm min-w-0 flex-1">
                      <span className="font-medium text-slate-700 dark:text-slate-200 block">{t("savings.exportModal.scopeCustomRange")}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t("savings.exportModal.scopeCustomRangeDesc")}</span>
                    </div>
                  </label>
                </div>
              </div>

              {exportScope === "custom_range" && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">{t("savings.exportModal.fromDateLabel")}</label>
                      <input
                        type="date"
                        value={exportStartDate}
                        onChange={(e) => setExportStartDate(e.target.value)}
                        className="w-full min-w-0 max-w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded p-2 min-h-[40px] outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">{t("savings.exportModal.toDateLabel")}</label>
                      <input
                        type="date"
                        value={exportEndDate}
                        onChange={(e) => setExportEndDate(e.target.value)}
                        className="w-full min-w-0 max-w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded p-2 min-h-[40px] outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex justify-between items-center gap-2">
                <span className="min-w-0">{t("savings.exportModal.includedTransactionsLabel")}</span>
                <span className="font-bold shrink-0">
                  {getFilteredSavingsTransactions().length} {t("common.pcs")}
                </span>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleExportTxt}
                disabled={getFilteredSavingsTransactions().length === 0}
                className="min-h-[40px] px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                {t("savings.exportModal.downloadTxtBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
