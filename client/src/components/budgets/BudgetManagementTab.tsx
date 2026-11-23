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
  StickyNote,
} from "lucide-react";
import { parseExpenseNote } from "@/utils/expenseFormatter";
import { MonthlyRecord, BudgetConfig, ExpenseCategory } from "@/types";
import {
  loadBudgets,
  saveBudgets,
  saveTotalMonthlyBudget,
  addCategoryBudget,
  updateCategoryBudget,
  deleteCategoryBudget,
  calculateAllBudgetsStatus,
  resolveCategoriesForBudget,
  BudgetStatus,
  DEFAULT_TOTAL_MONTHLY_BUDGET,
} from "@/utils/budgetStorage";
import {
  loadStoredCategories,
  DEFAULT_CATEGORIES,
  AVAILABLE_ICONS_MAP,
  getCategoryBadgeClasses,
} from "@/utils/categoryStorage";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import {
  getCurrentMonthBulgarian,
  sanitizeDecimalInput,
  parseDecimalInput,
} from "@/utils/formatting";
import { userStorage } from "@/utils/userStorage";
import { BudgetCardsCarousel } from "./BudgetCardsCarousel";
import {
  useI18n,
  formatLocalizedMonthYear,
  translateBudgetName,
  translateCategoryName,
  formatLocalizedDate,
} from "@/i18n";

const STORAGE_BASE_BUDGET_CARD_ORDER = "BudgetCardOrder";

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
  const { t, language } = useI18n();
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
    categoryIds: string[];
    monthlyLimit: string;
  }>({
    categoryName: "",
    categoryIds: [],
    monthlyLimit: "",
  });
  const [isCustomNameTouched, setIsCustomNameTouched] = useState(false);
  const [formError, setFormError] = useState("");

  // Category details expansion state
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Record<string, boolean>>({});
  const toggleCategoryExpand = (id: string) => {
    setExpandedCategoryIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Swipeable budget card carousel state & persisted order
  const [cardOrderIds, setCardOrderIds] = useState<string[]>(() => {
    const raw = userStorage.getJSON<unknown>(STORAGE_BASE_BUDGET_CARD_ORDER, []);
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  });
  const [activeBudgetId, setActiveBudgetId] = useState<string>("");

  // Load budgets and categories on mount
  const refreshBudgets = () => {
    const loaded = loadBudgets();
    setTotalMonthlyBudget(loaded.totalMonthlyBudget);
    setCategoryBudgets(loaded.categoryBudgets);
    setAvailableCategories(loadStoredCategories());
    const rawOrder = userStorage.getJSON<unknown>(STORAGE_BASE_BUDGET_CARD_ORDER, []);
    setCardOrderIds(
      Array.isArray(rawOrder) ? rawOrder.filter((v): v is string => typeof v === "string") : []
    );
  };

  useEffect(() => {
    refreshBudgets();
    const handleSync = () => refreshBudgets();
    const handleAccountChanged = () => {
      refreshBudgets();
      setActiveBudgetId("");
      setExpandedCategoryIds({});
    };
    window.addEventListener("homebudget:budgets-updated", handleSync);
    window.addEventListener("homebudget:categories-updated", handleSync);
    window.addEventListener("homebudget:data-restored", handleSync);
    window.addEventListener("budgetflows:account-changed", handleAccountChanged);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("homebudget:budgets-updated", handleSync);
      window.removeEventListener("homebudget:categories-updated", handleSync);
      window.removeEventListener("homebudget:data-restored", handleSync);
      window.removeEventListener("budgetflows:account-changed", handleAccountChanged);
      window.removeEventListener("storage", handleSync);
    };
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

  // Ordered budget statuses for swipeable cards (newly added budgets appear automatically)
  const orderedStatuses = useMemo(() => {
    const statusById = new Map(
      budgetCalc.categoryStatuses.map((s) => [s.budget.id, s])
    );
    const seen = new Set<string>();
    const ordered: BudgetStatus[] = [];

    for (const id of cardOrderIds) {
      const status = statusById.get(id);
      if (status && !seen.has(id)) {
        seen.add(id);
        ordered.push(status);
      }
    }

    for (const status of budgetCalc.categoryStatuses) {
      if (!seen.has(status.budget.id)) {
        seen.add(status.budget.id);
        ordered.push(status);
      }
    }

    return ordered;
  }, [budgetCalc.categoryStatuses, cardOrderIds]);

  const resolvedActiveBudgetId = useMemo(() => {
    if (
      activeBudgetId &&
      orderedStatuses.some((s) => s.budget.id === activeBudgetId)
    ) {
      return activeBudgetId;
    }
    return orderedStatuses[0]?.budget.id || "";
  }, [activeBudgetId, orderedStatuses]);

  const handleChangeBudgetOrder = (nextIds: string[]) => {
    const unique = Array.from(new Set(nextIds));
    setCardOrderIds(unique);
    userStorage.setJSON(STORAGE_BASE_BUDGET_CARD_ORDER, unique);
  };

  const handleResetBudgetOrder = () => {
    setCardOrderIds([]);
    userStorage.setJSON(STORAGE_BASE_BUDGET_CARD_ORDER, []);
  };

  // Handle Save Total Monthly Budget
  const handleSaveTotalBudget = () => {
    const val = parseDecimalInput(totalBudgetInput);
    if (isNaN(val) || val <= 0) return;
    saveTotalMonthlyBudget(val);
    setTotalMonthlyBudget(val);
    setIsEditingTotal(false);
  };

  // Open modal for Create
  const handleOpenAddModal = () => {
    const latestCategories = loadStoredCategories();
    setAvailableCategories(latestCategories);
    setEditingBudgetId(null);
    const defaultCat = latestCategories[0];
    setFormData({
      categoryName: defaultCat?.name || "Храна",
      categoryIds: defaultCat ? [defaultCat.id] : [],
      monthlyLimit: "300",
    });
    setIsCustomNameTouched(false);
    setFormError("");
    setIsModalOpen(true);
  };

  // Open modal for Edit — preserve Budget Name AND all linked Categories independently
  const handleOpenEditModal = (budget: BudgetConfig) => {
    const latestCategories = loadStoredCategories();
    setAvailableCategories(latestCategories);
    const matchedCategories = resolveCategoriesForBudget(budget, latestCategories);

    setEditingBudgetId(budget.id);
    setFormData({
      categoryName: budget.categoryName,
      categoryIds: matchedCategories.map((c) => c.id),
      monthlyLimit: budget.monthlyLimit.toString(),
    });
    setIsCustomNameTouched(true);
    setFormError("");
    setIsModalOpen(true);
  };

  // Toggle a category in multi-select checklist
  const handleToggleCategoryId = (categoryId: string) => {
    setFormData((prev) => {
      const exists = prev.categoryIds.includes(categoryId);
      const nextIds = exists
        ? prev.categoryIds.filter((id) => id !== categoryId)
        : [...prev.categoryIds, categoryId];

      let nextName = prev.categoryName;
      if (!editingBudgetId && !isCustomNameTouched) {
        if (nextIds.length === 1) {
          const singleCat = availableCategories.find((c) => c.id === nextIds[0]);
          if (singleCat) nextName = singleCat.name;
        } else if (nextIds.length > 1) {
          const names = nextIds
            .slice(0, 2)
            .map((id) => availableCategories.find((c) => c.id === id)?.name)
            .filter(Boolean);
          if (names.length > 0) {
            nextName =
              nextIds.length > 2
                ? `${names.join(" + ")} (+${nextIds.length - 2})`
                : names.join(" + ");
          }
        }
      }

      return {
        ...prev,
        categoryIds: nextIds,
        categoryName: nextName,
      };
    });
  };

  // Submit Modal Form
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formData.categoryName.trim();
    if (!trimmedName) {
      setFormError(t("budgets.errMissingName"));
      return;
    }
    const limit = parseDecimalInput(formData.monthlyLimit);
    if (isNaN(limit) || limit <= 0) {
      setFormError(t("budgets.errInvalidLimit"));
      return;
    }

    const validCatSet = new Set(availableCategories.map((c) => c.id));
    const cleanIds = formData.categoryIds.filter((id) => validCatSet.has(id));

    if (editingBudgetId) {
      const updated = updateCategoryBudget(editingBudgetId, {
        categoryName: trimmedName,
        categoryIds: cleanIds,
        categoryId: cleanIds.length === 1 ? cleanIds[0] : undefined,
        monthlyLimit: limit,
      });
      setCategoryBudgets(updated);
    } else {
      const updated = addCategoryBudget({
        categoryName: trimmedName,
        categoryIds: cleanIds,
        categoryId: cleanIds.length === 1 ? cleanIds[0] : undefined,
        monthlyLimit: limit,
      });
      setCategoryBudgets(updated);
      const createdBudget = updated[updated.length - 1];
      if (createdBudget) {
        setActiveBudgetId(createdBudget.id);
      }
    }

    setIsModalOpen(false);
  };

  // Handle Delete
  const handleDelete = (id: string) => {
    const prevIdx = orderedStatuses.findIndex((s) => s.budget.id === id);
    const updated = deleteCategoryBudget(id);
    setCategoryBudgets(updated);
    const nextOrder = cardOrderIds.filter((oid) => oid !== id);
    if (nextOrder.length !== cardOrderIds.length) {
      setCardOrderIds(nextOrder);
      userStorage.setJSON(STORAGE_BASE_BUDGET_CARD_ORDER, nextOrder);
    }
    if (resolvedActiveBudgetId === id) {
      const remainingOrdered = orderedStatuses.filter((s) => s.budget.id !== id);
      const fallbackIdx = Math.max(0, Math.min(prevIdx, remainingOrdered.length - 1));
      setActiveBudgetId(remainingOrdered[fallbackIdx]?.budget.id || "");
    }
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
                {t("budgets.pageTitle")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t("budgets.pageSubtitleRealtime")}
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
                    {formatLocalizedMonthYear(m, language)}
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
            <span>{t("budgets.newCategoryBudgetBtn")}</span>
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
                {t("budgets.warningBannerTitle", {
                  month: formatLocalizedMonthYear(selectedMonthKey, language),
                })}
              </h4>
              <p className="text-xs text-rose-700 dark:text-rose-300/80 mt-0.5">
                {t("budgets.warningBannerSubtitle")}
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
                  {t("budgets.overallTitle")}
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
                  {t("budgets.pctSpentBadge", { pct: budgetCalc.totalPercentage })}
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
                    title={t("budgets.editMonthlyBudgetTooltip")}
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
                      type="text"
                      inputMode="decimal"
                      value={totalBudgetInput}
                      onChange={(e) => setTotalBudgetInput(sanitizeDecimalInput(e.target.value))}
                      className="w-36 pl-7 pr-2.5 py-1 text-lg font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={handleSaveTotalBudget}
                    className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors cursor-pointer"
                    title={t("common.save")}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsEditingTotal(false)}
                    className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
                    title={t("common.cancel")}
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
                {t("budgets.spentForMonthLabel", {
                  month: formatLocalizedMonthYear(selectedMonthKey, language),
                })}
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
                {budgetCalc.isTotalExceeded
                  ? t("budgets.exceededByLabel")
                  : t("budgets.remainingBudgetLabel")}
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
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                {t("budgets.allocatedLabel")}
              </span>
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
              {t("budgets.overallProgressLine", {
                zone:
                  budgetCalc.totalStatus === "green"
                    ? t("budgets.zoneGreenRange")
                    : budgetCalc.totalStatus === "yellow"
                    ? t("budgets.zoneYellowRange")
                    : t("budgets.zoneRedRange"),
              })}
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
            <span className="text-slate-500 dark:text-slate-400">
              {t("budgets.threshold80")}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {t("budgets.limit100")}
            </span>
          </div>
        </div>
      </div>

      {/* Category Budgets Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <span>{t("budgets.categoryBudgetsTitle")}</span>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-semibold">
                {categoryBudgets.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("budgets.colorLegend")}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {t("budgets.statusInNorm", { count: healthyCount })}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {t("budgets.statusWarning", { count: warningCount })}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              {t("budgets.statusExceeded", { count: exceededCount })}
            </span>
          </div>
        </div>

        {orderedStatuses.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-500 dark:text-slate-400">
            <HelpCircle className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t("budgets.emptyTitle")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t("budgets.emptyDesc")}
            </p>
            <button
              onClick={handleOpenAddModal}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
            >
              {t("budgets.addFirstBudgetBtn")}
            </button>
          </div>
        ) : (
          <BudgetCardsCarousel
            items={orderedStatuses}
            activeBudgetId={resolvedActiveBudgetId}
            onSelectBudget={setActiveBudgetId}
            onChangeOrder={handleChangeBudgetOrder}
            onResetOrder={handleResetBudgetOrder}
            renderCard={(item) => {
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

              const linkedCats = resolveCategoriesForBudget(
                item.budget,
                availableCategories
              );

              return (
                <div
                  className={`bg-white dark:bg-[#16181d] rounded-3xl border p-5 sm:p-6 shadow-2xs transition-colors flex flex-col justify-between ${
                    item.isExceeded
                      ? "border-rose-300 dark:border-rose-800 ring-1 ring-rose-200/50 dark:ring-rose-900/40"
                      : "border-slate-200/90 dark:border-slate-800/90"
                  }`}
                >
                  <div>
                    {/* Card Top: Icon, Title, Actions */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${getCategoryBadgeClasses(item.colorClass)}`}
                        >
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4
                            className="font-bold text-slate-900 dark:text-white text-base sm:text-lg leading-snug line-clamp-2 break-words"
                            title={translateBudgetName(item.budget.categoryName, language)}
                          >
                            {translateBudgetName(item.budget.categoryName, language)}
                          </h4>
                          <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-semibold tabular-nums block mt-0.5">
                            {t("budgets.limitPrefix", { amount: item.limit.toFixed(2) })}
                          </span>
                          {linkedCats.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {linkedCats.map((cat) => {
                                const CatIcon = AVAILABLE_ICONS_MAP[cat.iconName] || Target;
                                return (
                                  <span
                                    key={cat.id}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${getCategoryBadgeClasses(
                                      cat.colorClass
                                    )}`}
                                  >
                                    <CatIcon className="w-3 h-3 shrink-0" />
                                    <span className="truncate max-w-[130px]">
                                      {translateCategoryName(cat.name, language)}
                                    </span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item.budget)}
                          className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] flex items-center justify-center p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                          title={t("budgets.editBudgetTooltip")}
                          aria-label={t("budgets.editBudgetTooltip")}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(item.budget.id)}
                          className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] flex items-center justify-center p-2 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                          title={t("budgets.deleteBudgetTooltip")}
                          aria-label={t("budgets.deleteBudgetTooltip")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Spent & Remaining Row */}
                    <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                        <span className="text-slate-600 dark:text-slate-300 block text-xs font-medium">
                          {t("budgets.spentCardLabel")}
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-white text-lg tabular-nums mt-0.5 block">
                          €{item.spent.toFixed(2)}
                        </span>
                      </div>

                      <div
                        className={`p-3.5 rounded-2xl border ${
                          item.isExceeded
                            ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-900/60"
                            : "bg-slate-50 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/80"
                        }`}
                      >
                        <span
                          className={`block text-xs font-medium ${
                            item.isExceeded
                              ? "text-rose-700 dark:text-rose-300 font-bold"
                              : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {item.isExceeded
                            ? t("budgets.exceededByLabel")
                            : t("budgets.remainingBudgetLabel")}
                        </span>
                        <span
                          className={`font-extrabold text-lg tabular-nums mt-0.5 block ${
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
                    <div className="mt-5 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                          {t("budgets.utilizationLabel")}
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold border tabular-nums ${badgeColor}`}
                        >
                          {item.percentage}%
                        </span>
                      </div>

                      <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/60 dark:border-slate-700 p-0.5">
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
                    <div className="mt-4 pt-3 border-t border-rose-100 dark:border-rose-900/60 flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300 font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" />
                      <span className="min-w-0 flex-1 break-words tabular-nums">
                        {t("budgets.exceededCardMsg", {
                          category: translateBudgetName(item.budget.categoryName, language),
                          amount: item.overspentAmount.toFixed(2),
                        })}
                      </span>
                    </div>
                  )}

                  {/* Healthy state hint */}
                  {!item.isExceeded && item.status === "green" && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        {t("budgets.healthyHint")}
                      </span>
                      <span className="tabular-nums">
                        {t("budgets.remainingShort", { amount: item.remaining.toFixed(2) })}
                      </span>
                    </div>
                  )}

                  {!item.isExceeded && item.status === "yellow" && (
                    <div className="mt-4 pt-3 border-t border-amber-100 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 font-medium">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        {t("budgets.nearLimitHint")}
                      </span>
                      <span className="tabular-nums">
                        {t("budgets.remainingShort", { amount: item.remaining.toFixed(2) })}
                      </span>
                    </div>
                  )}

                  {/* Category Breakdown & Expansion (Show Details / Hide Details) */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => toggleCategoryExpand(item.budget.id)}
                      className="w-full min-h-[40px] flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 py-1.5 transition-colors cursor-pointer group"
                    >
                      <span className="flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-indigo-500" />
                        {expandedCategoryIds[item.budget.id]
                          ? t("budgets.hideDetails")
                          : t("budgets.showDetailsCount", { count: item.expenses.length })}
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
                            {t("budgets.noExpensesForCategoryMonth", {
                              month: formatLocalizedMonthYear(selectedMonthKey, language),
                            })}
                          </div>
                        ) : (
                          item.expenses.map((exp) => {
                            const parsed = parseExpenseNote(
                              exp.note,
                              exp.merchantName,
                              exp.receiptItems
                            );
                            const title =
                              exp.merchantName ||
                              parsed.merchantName ||
                              translateCategoryName(exp.categoryName, language);
                            const dateStr = exp.date
                              ? formatLocalizedDate(exp.date, language)
                              : "";
                            const hasSubItems = exp.receiptItems && exp.receiptItems.length > 0;
                            const manualNote =
                              parsed.plainNote &&
                              parsed.plainNote.trim().toLowerCase() !== title.trim().toLowerCase()
                                ? parsed.plainNote
                                : undefined;

                            return (
                              <div
                                key={exp.id}
                                className="p-2.5 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-1.5 shadow-2xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                                    {title}
                                  </span>
                                  <span className="font-extrabold text-slate-900 dark:text-white shrink-0 tabular-nums">
                                    €{exp.amount.toFixed(2)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                                  <span>{dateStr}</span>
                                  {exp.isRecurring && (
                                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                                      {t("budgets.recurringBadge")}
                                    </span>
                                  )}
                                </div>

                                {manualNote && (
                                  <div className="p-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/60 space-y-0.5">
                                    <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                                      <StickyNote className="w-3 h-3 shrink-0" />
                                      {t("budgets.manualNoteBadge")}
                                    </span>
                                    <p className="text-[11px] text-slate-700 dark:text-slate-200 whitespace-pre-line break-words">
                                      {manualNote}
                                    </p>
                                  </div>
                                )}

                                {hasSubItems && (
                                  <div className="pt-1 mt-1 border-t border-slate-200/50 dark:border-slate-700/50 space-y-0.5">
                                    {exp.receiptItems!.slice(0, 3).map((sub, sIdx) => (
                                      <div key={sIdx} className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                        <span className="truncate max-w-[140px]">• {sub.quantity && sub.quantity >= 1 ? `${sub.quantity} x ` : ""}{sub.name}</span>
                                        <span className="tabular-nums">€{sub.price.toFixed(2)}</span>
                                      </div>
                                    ))}
                                    {exp.receiptItems!.length > 3 && (
                                      <span className="text-[9px] text-indigo-600 dark:text-indigo-400 block">
                                        {t("budgets.moreItemsInNote", {
                                          count: exp.receiptItems!.length - 3,
                                        })}
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
            }}
          />
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteDialog
        isOpen={Boolean(deleteConfirmId)}
        detailLabel={
          deleteConfirmId
            ? translateBudgetName(
                categoryBudgets.find((b) => b.id === deleteConfirmId)?.categoryName || "",
                language
              ) || undefined
            : undefined
        }
        onCancel={() => setDeleteConfirmId(null)}
        onConfirm={() => {
          if (deleteConfirmId) {
            handleDelete(deleteConfirmId);
          }
        }}
      />

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
                    ? t("budgets.editBudgetTitle")
                    : t("budgets.newBudgetTitle")}
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

              {/* Budget Name (Always Editable) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t("budgets.budgetNameLabel")}
                </label>
                <input
                  type="text"
                  value={formData.categoryName}
                  onChange={(e) => {
                    setIsCustomNameTouched(true);
                    setFormData((prev) => ({
                      ...prev,
                      categoryName: e.target.value,
                    }));
                  }}
                  placeholder={t("budgets.budgetNamePlaceholder")}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 px-3 py-2 min-h-[42px] rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                  required
                />
              </div>

              {/* Multi-Select Linked Expense Categories Checklist */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {t("budgets.linkedCategoriesLabel", { count: formData.categoryIds.length })}
                  </label>
                  {formData.categoryIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, categoryIds: [] }))}
                      className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      {t("budgets.clearSelectionBtn")}
                    </button>
                  )}
                </div>

                {/* Selected Categories Chips Preview */}
                {formData.categoryIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80">
                    {formData.categoryIds.map((cid) => {
                      const cat = availableCategories.find((c) => c.id === cid);
                      if (!cat) return null;
                      const CatIcon = AVAILABLE_ICONS_MAP[cat.iconName] || Target;
                      const catLabel = translateCategoryName(cat.name, language);
                      return (
                        <button
                          key={cid}
                          type="button"
                          onClick={() => handleToggleCategoryId(cid)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-85 cursor-pointer ${getCategoryBadgeClasses(
                            cat.colorClass
                          )}`}
                          title={t("budgets.removeCategoryTitle", { name: catLabel })}
                        >
                          <CatIcon className="w-3 h-3 shrink-0" />
                          <span>{catLabel}</span>
                          <X className="w-3 h-3 ml-0.5 opacity-75" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {(() => {
                  const defaultIdSet = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
                  const customCats = availableCategories.filter(
                    (c) => c.isCustom || !defaultIdSet.has(c.id)
                  );
                  const predefinedCats = availableCategories.filter(
                    (c) => !c.isCustom && defaultIdSet.has(c.id)
                  );

                  const renderChecklistRow = (cat: ExpenseCategory) => {
                    const isChecked = formData.categoryIds.includes(cat.id);
                    const CatIcon = AVAILABLE_ICONS_MAP[cat.iconName] || Target;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        onClick={() => handleToggleCategoryId(cat.id)}
                        className={`w-full px-3 py-2 min-h-[40px] flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${
                          isChecked
                            ? "bg-indigo-50/80 dark:bg-indigo-950/40"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isChecked
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </span>
                          <span
                            className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${getCategoryBadgeClasses(
                              cat.colorClass
                            )}`}
                          >
                            <CatIcon className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                            {translateCategoryName(cat.name, language)}
                          </span>
                        </div>
                        {isChecked && (
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                            {t("budgets.selectedBadge")}
                          </span>
                        )}
                      </button>
                    );
                  };

                  return (
                    <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 custom-scrollbar">
                      {customCats.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {t("budgets.customCategoriesHeader")}
                          </div>
                          {customCats.map(renderChecklistRow)}
                        </>
                      )}
                      <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t("budgets.defaultCategoriesHeader")}
                      </div>
                      {predefinedCats.map(renderChecklistRow)}
                    </div>
                  );
                })()}
                <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-1.5">
                  {t("budgets.linkedCategoriesHelp")}
                </p>
              </div>

              {/* Monthly Limit Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t("budgets.monthlyLimitLabel")}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">
                    €
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.monthlyLimit}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        monthlyLimit: sanitizeDecimalInput(e.target.value),
                      }))
                    }
                    placeholder={t("budgets.monthlyLimitPlaceholder")}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white pl-8 pr-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-1">
                  {t("budgets.monthlyLimitExamples")}
                </p>
              </div>

              {/* Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {editingBudgetId
                      ? t("common.saveChanges")
                      : t("budgets.addBudgetSubmit")}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
