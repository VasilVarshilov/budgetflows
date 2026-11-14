import React, { useState, useMemo, useEffect } from "react";
import {
  Target,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Wallet,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Calendar,
  Sparkles,
  X,
  Save,
  Check,
  Receipt,
} from "lucide-react";
import { MonthlyRecord, BudgetConfig, ExpenseCategory } from "@/types";
import {
  loadBudgets,
  saveBudgets,
  saveTotalMonthlyBudget,
  addCategoryBudget,
  updateCategoryBudget,
  deleteCategoryBudget,
  calculateAllBudgetsStatus,
  BudgetStatus,
  DEFAULT_TOTAL_MONTHLY_BUDGET,
} from "@/utils/budgetStorage";
import {
  loadStoredCategories,
  AVAILABLE_ICONS_MAP,
  getAiSuggestedIconAndColor,
  getCategoryBadgeClasses,
} from "@/utils/categoryStorage";
import { getCurrentMonthBulgarian } from "@/utils/formatting";

interface BudgetManagementTabProps {
  monthlyData: Record<string, MonthlyRecord>;
  onNavigateTab?: (tab: any) => void;
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

export const BudgetManagementTab: React.FC<BudgetManagementTabProps> = ({
  monthlyData,
  onNavigateTab,
}) => {
  // Selected month for comparison (defaults to current month)
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => {
    return getCurrentMonthBulgarian();
  });

  // State
  const [totalMonthlyBudget, setTotalMonthlyBudget] = useState<number>(
    DEFAULT_TOTAL_MONTHLY_BUDGET
  );
  const [categoryBudgets, setCategoryBudgets] = useState<BudgetConfig[]>([]);
  const [availableCategories, setAvailableCategories] = useState<
    ExpenseCategory[]
  >([]);

  // Editing Total Budget Inline State
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [totalBudgetInput, setTotalBudgetInput] = useState("");

  // Modal State for Adding/Editing Category Budget
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    categoryName: string;
    categoryId: string;
    monthlyLimit: string;
  }>({
    categoryName: "",
    categoryId: "",
    monthlyLimit: "",
  });
  const [formError, setFormError] = useState("");

  // Category details expansion state
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Record<string, boolean>>({});
  const toggleCategoryExpand = (id: string) => {
    setExpandedCategoryIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Load budgets and categories on mount
  const refreshBudgets = () => {
    const loaded = loadBudgets();
    setTotalMonthlyBudget(loaded.totalMonthlyBudget);
    setCategoryBudgets(loaded.categoryBudgets);
    setAvailableCategories(loadStoredCategories());
  };

  useEffect(() => {
    refreshBudgets();
  }, []);

  // Compute available months in data or current year
  const availableMonths = useMemo(() => {
    const keys = Object.keys(monthlyData);
    const current = getCurrentMonthBulgarian();
    if (!keys.includes(current)) {
      keys.unshift(current);
    }
    return keys.length > 0 ? keys : [current];
  }, [monthlyData]);

  // Current active monthly record
  const currentRecord = monthlyData[selectedMonthKey];

  // Budget calculations for the selected month
  const budgetCalc = useMemo(() => {
    return calculateAllBudgetsStatus(
      currentRecord,
      totalMonthlyBudget,
      categoryBudgets
    );
  }, [currentRecord, totalMonthlyBudget, categoryBudgets]);

  // Handle Save Total Monthly Budget
  const handleSaveTotalBudget = () => {
    const val = parseFloat(totalBudgetInput);
    if (isNaN(val) || val <= 0) return;
    saveTotalMonthlyBudget(val);
    setTotalMonthlyBudget(val);
    setIsEditingTotal(false);
  };

  // Open modal for Create
  const handleOpenAddModal = () => {
    setEditingBudgetId(null);
    setFormData({
      categoryName: availableCategories[0]?.name || "Храна",
      categoryId: availableCategories[0]?.id || "food",
      monthlyLimit: "300",
    });
    setFormError("");
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (budget: BudgetConfig) => {
    setEditingBudgetId(budget.id);
    setFormData({
      categoryName: budget.categoryName,
      categoryId: budget.categoryId || "",
      monthlyLimit: budget.monthlyLimit.toString(),
    });
    setFormError("");
    setIsModalOpen(true);
  };

  // Handle Form Category Selection Change
  const handleCategorySelect = (categoryId: string) => {
    if (categoryId === "custom") {
      setFormData((prev) => ({
        ...prev,
        categoryId: "",
        categoryName: "",
      }));
    } else {
      const found = availableCategories.find((c) => c.id === categoryId);
      if (found) {
        setFormData((prev) => ({
          ...prev,
          categoryId: found.id,
          categoryName: found.name,
        }));
      }
    }
  };

  // Submit Modal Form
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.categoryName.trim()) {
      setFormError("Моля, посочете име на категорията.");
      return;
    }
    const limit = parseFloat(formData.monthlyLimit);
    if (isNaN(limit) || limit <= 0) {
      setFormError("Моля, въведете валиден положителен бюджет.");
      return;
    }

    if (editingBudgetId) {
      const updated = updateCategoryBudget(editingBudgetId, {
        categoryName: formData.categoryName.trim(),
        categoryId: formData.categoryId || undefined,
        monthlyLimit: limit,
      });
      setCategoryBudgets(updated);
    } else {
      const updated = addCategoryBudget({
        categoryName: formData.categoryName.trim(),
        categoryId: formData.categoryId || undefined,
        monthlyLimit: limit,
      });
      setCategoryBudgets(updated);
    }

    setIsModalOpen(false);
  };

  // Handle Delete
  const handleDelete = (id: string) => {
    const updated = deleteCategoryBudget(id);
    setCategoryBudgets(updated);
    setDeleteConfirmId(null);
  };

  // Summary counts
  const healthyCount = budgetCalc.categoryStatuses.filter(
    (c) => c.status === "green"
  ).length;
  const warningCount = budgetCalc.categoryStatuses.filter(
    (c) => c.status === "yellow"
  ).length;
  const exceededCount = budgetCalc.categoryStatuses.filter(
    (c) => c.status === "red"
  ).length;

  const totalAllocated = categoryBudgets.reduce(
    (sum, b) => sum + b.monthlyLimit,
    0
  );
  const unallocatedBudget = totalMonthlyBudget - totalAllocated;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Header & Month Filter */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                Управление на бюджети
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Задайте месечни лимити и следете изразходването по категории в реално време
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 min-h-[44px] shadow-2xs">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div className="relative flex-1">
              <select
                value={selectedMonthKey}
                onChange={(e) => setSelectedMonthKey(e.target.value)}
                className="w-full appearance-none bg-transparent font-semibold text-xs sm:text-sm text-slate-700 dark:text-slate-200 pr-5 outline-none cursor-pointer"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m} className="dark:bg-slate-800 dark:text-white">
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Нов бюджет за категория</span>
          </button>
        </div>
      </div>

      {/* Exceeded Warnings Alert Banner (if any) */}
      {budgetCalc.activeWarnings.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-4 text-rose-900 dark:text-rose-200 shadow-xs animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-rose-100 dark:bg-rose-900/60 rounded-lg text-rose-600 dark:text-rose-400 mt-0.5 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm text-rose-800 dark:text-rose-300">
                Внимание: Надвишен бюджет за {selectedMonthKey}
              </h4>
              <p className="text-xs text-rose-700 dark:text-rose-300/80 mt-0.5">
                Имате категории или общ разход, които надхвърлят зададения лимит:
              </p>
              <div className="mt-2.5 space-y-1.5">
                {budgetCalc.activeWarnings.map((warn, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 border border-rose-200/60 dark:border-rose-900/60 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-950 dark:text-rose-200 shadow-2xs"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    <span>{warn}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Overall Monthly Budget Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs relative overflow-hidden transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Общ месечен бюджет
                </span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                    budgetCalc.totalStatus === "green"
                      ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                      : budgetCalc.totalStatus === "yellow"
                      ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                      : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                  }`}
                >
                  {budgetCalc.totalPercentage}% изразходван
                </span>
              </div>

              {!isEditingTotal ? (
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                    €{totalMonthlyBudget.toFixed(2)}
                  </span>
                  <button
                    onClick={() => {
                      setTotalBudgetInput(totalMonthlyBudget.toString());
                      setIsEditingTotal(true);
                    }}
                    className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Промени месечния бюджет"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">
                      €
                    </span>
                    <input
                      type="number"
                      step="10"
                      min="0"
                      value={totalBudgetInput}
                      onChange={(e) => setTotalBudgetInput(e.target.value)}
                      className="w-36 pl-7 pr-2.5 py-1 text-lg font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={handleSaveTotalBudget}
                    className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors cursor-pointer"
                    title="Запази"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsEditingTotal(false)}
                    className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
                    title="Отказ"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                Изразходвано ({selectedMonthKey})
              </span>
              <span className="text-base font-bold text-slate-900 dark:text-white">
                €{budgetCalc.totalSpent.toFixed(2)}
              </span>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                budgetCalc.isTotalExceeded
                  ? "bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60"
                  : "bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60"
              }`}
            >
              <span
                className={`text-xs block ${
                  budgetCalc.isTotalExceeded
                    ? "text-rose-700 dark:text-rose-300 font-semibold"
                    : "text-emerald-700 dark:text-emerald-300 font-semibold"
                }`}
              >
                {budgetCalc.isTotalExceeded ? "Превишен с" : "Оставащ бюджет"}
              </span>
              <span
                className={`text-base font-bold ${
                  budgetCalc.isTotalExceeded
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {budgetCalc.isTotalExceeded ? "-" : ""}€
                {Math.abs(budgetCalc.totalRemaining).toFixed(2)}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-1">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Разпределено</span>
              <span className="text-base font-bold text-slate-900 dark:text-white">
                €{totalAllocated.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar with Color Coding */}
        <div className="mt-5 space-y-2">
          <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>
              Прогрес на общия бюджет (
              {budgetCalc.totalStatus === "green"
                ? "Зелена зона 0-80%"
                : budgetCalc.totalStatus === "yellow"
                ? "Жълта зона 80-100%"
                : "Червена зона 100%+"}
              )
            </span>
            <span
              className={
                budgetCalc.totalStatus === "green"
                  ? "text-emerald-700 dark:text-emerald-400 font-bold"
                  : budgetCalc.totalStatus === "yellow"
                  ? "text-amber-700 dark:text-amber-400 font-bold"
                  : "text-rose-700 dark:text-rose-400 font-bold"
              }
            >
              €{budgetCalc.totalSpent.toFixed(2)} / €
              {totalMonthlyBudget.toFixed(2)}
            </span>
          </div>

          <div className="w-full h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-700">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                budgetCalc.totalStatus === "green"
                  ? "bg-emerald-500"
                  : budgetCalc.totalStatus === "yellow"
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
              style={{
                width: `${Math.min(budgetCalc.totalPercentage, 100)}%`,
              }}
            />
          </div>

          <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 pt-0.5">
            <span>0%</span>
            <span className="text-slate-500 dark:text-slate-400">80% праг</span>
            <span className="text-slate-500 dark:text-slate-400">100% лимит</span>
          </div>
        </div>
      </div>

      {/* Category Budgets Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <span>Бюджети по категории</span>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                {categoryBudgets.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Цветови индикатори: Зелен (0-80%), Жълт (80-100%), Червен (100%+)
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {healthyCount} в норма
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {warningCount} внимание
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              {exceededCount} надвишени
            </span>
          </div>
        </div>

        {budgetCalc.categoryStatuses.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-500 dark:text-slate-400">
            <HelpCircle className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Няма добавени бюджети за категории
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Създайте нов бюджет за Храна, Транспорт, Забавления или други разходи.
            </p>
            <button
              onClick={handleOpenAddModal}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
            >
              + Добави първи бюджет
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgetCalc.categoryStatuses.map((item) => {
              const IconComponent =
                AVAILABLE_ICONS_MAP[item.iconName] || Target;

              const barColor =
                item.status === "green"
                  ? "bg-emerald-500"
                  : item.status === "yellow"
                  ? "bg-amber-500"
                  : "bg-rose-500";

              const badgeColor =
                item.status === "green"
                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                  : item.status === "yellow"
                  ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                  : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800";

              return (
                <div
                  key={item.budget.id}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                    item.isExceeded
                      ? "border-rose-300 dark:border-rose-800 ring-1 ring-rose-200/50 dark:ring-rose-900/40"
                      : "border-slate-200/80 dark:border-slate-800"
                  }`}
                >
                  <div>
                    {/* Card Top: Icon, Title, Actions */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getCategoryBadgeClasses(item.colorClass)}`}
                        >
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                            {item.budget.categoryName}
                          </h4>
                          <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                            Лимит: €{item.limit.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleOpenEditModal(item.budget)}
                          className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center p-2 sm:p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Редактирай бюджет"
                          aria-label="Редактирай бюджет"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(item.budget.id)}
                          className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center p-2 sm:p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Изтрий бюджет"
                          aria-label="Изтрий бюджет"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Spent & Remaining Row */}
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                        <span className="text-slate-600 dark:text-slate-300 block text-[11px] font-medium">
                          Изразходвано
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          €{item.spent.toFixed(2)}
                        </span>
                      </div>

                      <div
                        className={`p-2.5 rounded-xl border ${
                          item.isExceeded
                            ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900/60"
                            : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        <span
                          className={`block text-[11px] font-medium ${
                            item.isExceeded
                              ? "text-rose-700 dark:text-rose-300 font-bold"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {item.isExceeded ? "Превишен с" : "Оставащ бюджет"}
                        </span>
                        <span
                          className={`font-bold text-sm ${
                            item.isExceeded
                              ? "text-rose-700 dark:text-rose-300"
                              : "text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {item.isExceeded ? "-" : ""}€
                          {Math.abs(item.remaining).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                          Усвояване
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold border ${badgeColor}`}
                        >
                          {item.percentage}%
                        </span>
                      </div>

                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/60 dark:border-slate-700 p-0.5">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                          style={{
                            width: `${Math.min(item.percentage, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Warning message if exceeded */}
                  {item.isExceeded && (
                    <div className="mt-3.5 pt-2.5 border-t border-rose-100 dark:border-rose-900/60 flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300 font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
                      <span>
                        {item.budget.categoryName} budget exceeded by €
                        {item.overspentAmount.toFixed(2)} (Бюджетът е надвишен)
                      </span>
                    </div>
                  )}

                  {/* Healthy state hint */}
                  {!item.isExceeded && item.status === "green" && (
                    <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400 dark:text-slate-400">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Бюджетът е в норма
                      </span>
                      <span>Остават €{item.remaining.toFixed(2)}</span>
                    </div>
                  )}

                  {!item.isExceeded && item.status === "yellow" && (
                    <div className="mt-3.5 pt-2.5 border-t border-amber-100 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 font-medium">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        Близо до лимита
                      </span>
                      <span>Остават €{item.remaining.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Category Breakdown & Expansion (Show Details / Hide Details) */}
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => toggleCategoryExpand(item.budget.id)}
                      className="w-full flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 py-1 transition-colors cursor-pointer group"
                    >
                      <span className="flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-indigo-500" />
                        {expandedCategoryIds[item.budget.id]
                          ? "Скрий детайли"
                          : `Покажи детайли (${item.expenses.length})`}
                      </span>
                      {expandedCategoryIds[item.budget.id] ? (
                        <ChevronUp className="w-4 h-4 text-indigo-500 group-hover:-translate-y-0.5 transition-transform" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-indigo-500 group-hover:translate-y-0.5 transition-transform" />
                      )}
                    </button>

                    {/* Expanded individual expenses */}
                    {expandedCategoryIds[item.budget.id] && (
                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {item.expenses.length === 0 ? (
                          <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center text-slate-500 dark:text-slate-400 text-xs">
                            Няма записани разходи в тази категория за {selectedMonthKey}.
                          </div>
                        ) : (
                          item.expenses.map((exp) => {
                            const title = exp.merchantName || exp.note?.split("\n")[0] || exp.categoryName;
                            const dateStr = exp.date ? exp.date.split("T")[0] : "";
                            const hasSubItems = exp.receiptItems && exp.receiptItems.length > 0;

                            return (
                              <div
                                key={exp.id}
                                className="p-2.5 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-1 shadow-2xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                    {title}
                                  </span>
                                  <span className="font-extrabold text-slate-900 dark:text-white shrink-0">
                                    €{exp.amount.toFixed(2)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                                  <span>{dateStr}</span>
                                  {exp.isRecurring && (
                                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                                      Периодичен
                                    </span>
                                  )}
                                </div>

                                {hasSubItems && (
                                  <div className="pt-1 mt-1 border-t border-slate-200/50 dark:border-slate-700/50 space-y-0.5">
                                    {exp.receiptItems!.slice(0, 3).map((sub, sIdx) => (
                                      <div key={sIdx} className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                        <span className="truncate max-w-[140px]">• {sub.quantity && sub.quantity >= 1 ? `${sub.quantity} x ` : ""}{sub.name}</span>
                                        <span>€{sub.price.toFixed(2)}</span>
                                      </div>
                                    ))}
                                    {exp.receiptItems!.length > 3 && (
                                      <span className="text-[9px] text-indigo-600 dark:text-indigo-400 block">
                                        + още {exp.receiptItems!.length - 3} артикула
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-xl border border-slate-200 dark:border-slate-800 text-center space-y-4 transition-colors">
            <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-base">
                Изтриване на бюджет
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Сигурни ли сте, че искате да премахнете този лимит? Записаните разходи няма да бъдат изтрити.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Отказ
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
              >
                Да, изтрий
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Category Budget Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Target className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white text-base">
                  {editingBudgetId
                    ? "Редактиране на бюджет"
                    : "Нов бюджет за категория"}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Category Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Изберете категория
                </label>
                <select
                  value={formData.categoryId || "custom"}
                  onChange={(e) => handleCategorySelect(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  {availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id} className="dark:bg-slate-800 dark:text-white">
                      {cat.name}
                    </option>
                  ))}
                  <option value="custom" className="dark:bg-slate-800 dark:text-white">+ Друга персонализирана категория</option>
                </select>
              </div>

              {/* If custom or editing name */}
              {(!formData.categoryId || formData.categoryId === "custom") && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Име на категорията
                  </label>
                  <input
                    type="text"
                    value={formData.categoryName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        categoryName: e.target.value,
                      }))
                    }
                    placeholder="напр. Ресторанти, Спорт, Развлечения"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 px-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
              )}

              {/* Monthly Limit Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Месечен лимит (€)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">
                    €
                  </span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={formData.monthlyLimit}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        monthlyLimit: e.target.value,
                      }))
                    }
                    placeholder="напр. 400"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white pl-8 pr-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-1">
                  Примери: Храна €400, Транспорт €250, Забавления €150
                </p>
              </div>

              {/* Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Отказ
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingBudgetId ? "Запази промените" : "Добави бюджет"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
