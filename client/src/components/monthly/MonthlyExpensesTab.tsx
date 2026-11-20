import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus,
  Trash2,
  Wallet,
  Phone,
  Wifi,
  Calendar,
  CalendarDays,
  CreditCard,
  Home,
  Droplets,
  Zap,
  Fuel,
  Car,
  Utensils,
  UtensilsCrossed,
  Scissors,
  Film,
  Pill,
  PawPrint,
  Sparkles,
  Shirt,
  Heart,
  Gift,
  GraduationCap,
  Bus,
  ShoppingBag,
  CircleHelp,
  RefreshCw,
  Repeat,
  Shield,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
  Camera,
  Upload,
  Store,
  Receipt,
  Target,
  Layers,
  Clock,
} from "lucide-react";
import { ExpenseCategory, ExpenseItem, MonthlyRecord, BudgetConfig, RepeatFrequency, OpenRecordTarget } from "@/types";
import { parseExpenseNote } from "@/utils/expenseFormatter";
import {
  isCompletedExpense,
  isPlannedExpense,
  isRecordCompleted,
  toggleRecordCompletion,
} from "@/utils/expenseStatus";
import {
  formatRepeatLabel,
  isRepeatingFrequency,
  markRecurrenceDismissed,
  normalizeRepeatValue,
  parseMonthKeyToYearMonth,
  partitionExpensesByRepeat,
  resolveItemRepeat,
} from "@/utils/recurrenceEngine";
import {
  dateKeyToStableIso,
  getMonthKeyFromDateKey,
  parseLocalDateKey,
  resolveRecordDateKey,
  toLocalDateKey,
} from "@/utils/calendarEngine";
import {
  RecurrenceCompletionRows,
  CompletionSwitch,
} from "@/components/ui/RecurrenceCompletionRows";
import { InputGroup } from "@/components/ui/InputGroup";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { ScanReceiptModal } from "@/components/monthly/ScanReceiptModal";
import {
  AVAILABLE_ICONS_MAP,
  loadStoredCategories,
  getCategoryBadgeClasses,
  resolveCategoryDisplayIcon,
} from "@/utils/categoryStorage";
import {
  loadBudgets,
  findMatchingBudgetCategoryId,
  isExpenseMatchingBudget,
} from "@/utils/budgetStorage";
import {
  ExpenseFilterToolbar,
  ExpenseFiltersState,
  DEFAULT_FILTERS,
} from "@/components/monthly/ExpenseFilterToolbar";
import {
  sanitizeDecimalInput,
  parseDecimalInput,
  compareExpensesChronologically,
} from "@/utils/formatting";
import {
  isManualElectricityExpense,
  upsertElectricityRecordFromExpense,
  deleteElectricityRecordByExpenseId,
} from "@/utils/electricityStorage";

// Map за иконките, поддържащ всички налични иконки и AI предложения
const ICON_MAP: Record<string, any> = AVAILABLE_ICONS_MAP;

// Fixed Default Values in EUR
const DEFAULT_CREDIT_EUR = 321.32;
const DEFAULT_PHONE_EUR = 24.54;
const DEFAULT_INTERNET_EUR = 23.01;

const PREDEFINED_CATEGORIES: ExpenseCategory[] = [
  {
    id: "water",
    name: "Вода",
    iconName: "Droplets",
    colorClass: "bg-blue-100 text-blue-500",
  },
  {
    id: "electricity",
    name: "Ток",
    iconName: "Zap",
    colorClass: "bg-yellow-100 text-yellow-600",
  },
  {
    id: "fuel",
    name: "Гориво",
    iconName: "Fuel",
    colorClass: "bg-red-100 text-red-500",
  },
  {
    id: "car",
    name: "Кола",
    iconName: "Car",
    colorClass: "bg-zinc-100 text-zinc-600",
  },
  {
    id: "food",
    name: "Храна",
    iconName: "Utensils",
    colorClass: "bg-orange-100 text-orange-500",
  },
  {
    id: "hair",
    name: "Фризьор",
    iconName: "Scissors",
    colorClass: "bg-purple-100 text-purple-500",
  },
  {
    id: "restaurant",
    name: "Ресторант",
    iconName: "UtensilsCrossed",
    colorClass: "bg-yellow-100 text-yellow-600",
  },
  {
    id: "cinema",
    name: "Кино",
    iconName: "Film",
    colorClass: "bg-indigo-100 text-indigo-500",
  },
  {
    id: "pharmacy",
    name: "Аптека",
    iconName: "Pill",
    colorClass: "bg-emerald-100 text-emerald-600",
  },
  {
    id: "pets",
    name: "Домашни любимци",
    iconName: "PawPrint",
    colorClass: "bg-amber-100 text-amber-600",
  },
  {
    id: "cleaning",
    name: "Почистване",
    iconName: "Sparkles",
    colorClass: "bg-cyan-100 text-cyan-500",
  },
  {
    id: "clothes",
    name: "Дрехи",
    iconName: "Shirt",
    colorClass: "bg-pink-100 text-pink-500",
  },
  {
    id: "cosmetics",
    name: "Козметика",
    iconName: "Heart",
    colorClass: "bg-rose-100 text-rose-500",
  },
  {
    id: "gifts",
    name: "Подаръци",
    iconName: "Gift",
    colorClass: "bg-fuchsia-100 text-fuchsia-500",
  },
  {
    id: "education",
    name: "Образование",
    iconName: "GraduationCap",
    colorClass: "bg-blue-100 text-blue-500",
  },
  {
    id: "health",
    name: "Здраве",
    iconName: "Heart",
    colorClass: "bg-red-50 text-red-600",
  },
  {
    id: "transport",
    name: "Транспорт",
    iconName: "Bus",
    colorClass: "bg-slate-100 text-slate-600",
  },
  {
    id: "taxi",
    name: "Такси и услуги",
    iconName: "Receipt",
    colorClass: "bg-yellow-50 text-yellow-600",
  },
  {
    id: "other",
    name: "Други",
    iconName: "ShoppingBag",
    colorClass: "bg-emerald-100 text-emerald-500",
  },
];

// Categories for Fixed Expenses
const FIXED_CATEGORIES: ExpenseCategory[] = [
  {
    id: "credit",
    name: "Кредит",
    iconName: "CreditCard",
    colorClass: "bg-blue-100 text-blue-600",
  },
  {
    id: "phone",
    name: "Телефон",
    iconName: "Phone",
    colorClass: "bg-indigo-100 text-indigo-600",
  },
  {
    id: "internet",
    name: "Интернет",
    iconName: "Wifi",
    colorClass: "bg-cyan-100 text-cyan-600",
  },
  {
    id: "rent",
    name: "Наем",
    iconName: "Home",
    colorClass: "bg-emerald-100 text-emerald-600",
  },
  {
    id: "subscription",
    name: "Абонамент",
    iconName: "RefreshCw",
    colorClass: "bg-purple-100 text-purple-600",
  },
  {
    id: "insurance",
    name: "Застраховка",
    iconName: "Shield",
    colorClass: "bg-red-100 text-red-600",
  },
];

interface MonthlyExpensesTabProps {
  currentMonth: string;
  onSaveExpenses: (data: any, targetMonth?: string) => void;
  initialData?: any;
  allMonthlyData?: Record<string, MonthlyRecord>;
  onMonthChange?: (newMonth: string) => void;
  onOpenCalendar?: (dateKey?: string) => void;
  pendingRecordTarget?: OpenRecordTarget | null;
  onConsumeRecordTarget?: () => void;
}

export const MonthlyExpensesTab: React.FC<MonthlyExpensesTabProps> = ({
  currentMonth,
  onSaveExpenses,
  initialData,
  allMonthlyData = {},
  onMonthChange,
  onOpenCalendar,
  pendingRecordTarget,
  onConsumeRecordTarget,
}) => {
  // Helper to create fixed item (always recurring Monthly by default)
  function createFixedItem(
    name: string,
    amount: number,
    icon: string,
    color: string,
    isRecurring: boolean = true,
    timestampOffset: number = 0,
  ): ExpenseItem {
    const nowMs = Date.now() + timestampOffset;
    const nowIso = new Date(nowMs).toISOString();
    return {
      id: `fix_${nowMs}_${Math.random().toString(36).substring(2, 9)}`,
      categoryId: name.toLowerCase(),
      categoryName: name,
      categoryIcon: icon,
      categoryColor: color,
      amount: amount,
      date: nowIso,
      createdAt: nowIso,
      timestamp: nowMs,
      isRecurring: isRecurring,
      isFixedItem: isRecurring ? true : undefined,
      repeat: isRecurring ? "monthly" : "never",
      completed: true,
      status: "completed",
      completedAt: nowIso,
    };
  }

  function getDefaultFixedExpenses(): ExpenseItem[] {
    return [
      createFixedItem(
        "Кредит",
        DEFAULT_CREDIT_EUR,
        "CreditCard",
        "bg-blue-100 text-blue-600",
        true,
        0,
      ),
      createFixedItem(
        "Телефон",
        DEFAULT_PHONE_EUR,
        "Phone",
        "bg-indigo-100 text-indigo-600",
        true,
        1,
      ),
      createFixedItem(
        "Интернет",
        DEFAULT_INTERNET_EUR,
        "Wifi",
        "bg-cyan-100 text-cyan-600",
        true,
        2,
      ),
    ];
  }

  function resolveMonthExpensesFromData(sourceData?: any): {
    fixed: ExpenseItem[];
    additional: ExpenseItem[];
  } {
    const savedFixed = sourceData?.expenses?.fixed_expenses;
    const savedAdditionalRaw: ExpenseItem[] = Array.isArray(
      sourceData?.expenses?.additional_expenses
    )
      ? sourceData.expenses.additional_expenses
      : [];

    let rawFixed: ExpenseItem[] = [];

    if (Array.isArray(savedFixed)) {
      if (savedFixed.length > 0 || savedAdditionalRaw.length > 0) {
        rawFixed = savedFixed.map((item) => {
          let amount = item.amount;
          if (item.categoryName === "Кредит" && item.amount === 353.69) {
            amount = DEFAULT_CREDIT_EUR;
          }
          return {
            ...item,
            amount,
          };
        });
      } else {
        rawFixed = getDefaultFixedExpenses();
      }
    } else if (savedFixed && !Array.isArray(savedFixed)) {
      const legacy: ExpenseItem[] = [];
      const creditAmount =
        savedFixed.credit_eur === 353.69
          ? DEFAULT_CREDIT_EUR
          : savedFixed.credit_eur || DEFAULT_CREDIT_EUR;
      legacy.push(
        createFixedItem(
          "Кредит",
          creditAmount,
          "CreditCard",
          "bg-blue-100 text-blue-600",
          true,
        ),
      );
      if (savedFixed.phone_eur)
        legacy.push(
          createFixedItem(
            "Телефон",
            savedFixed.phone_eur,
            "Phone",
            "bg-indigo-100 text-indigo-600",
            true,
          ),
        );
      if (savedFixed.internet_eur)
        legacy.push(
          createFixedItem(
            "Интернет",
            savedFixed.internet_eur,
            "Wifi",
            "bg-cyan-100 text-cyan-600",
            true,
          ),
        );
      rawFixed = legacy;
    } else {
      rawFixed = getDefaultFixedExpenses();
    }

    const { fixedExpenses: normalizedFixed, additionalExpenses: normalizedAdditional } =
      partitionExpensesByRepeat(rawFixed, savedAdditionalRaw);

    return { fixed: normalizedFixed, additional: normalizedAdditional };
  }

  // Initialize Fixed & Variable Expenses strictly partitioned by Repeat
  const initialPartition = resolveMonthExpensesFromData(initialData);
  const [fixedExpenses, setFixedExpenses] = useState<ExpenseItem[]>(
    () => initialPartition.fixed,
  );
  const [expenses, setExpenses] = useState<ExpenseItem[]>(
    () => initialPartition.additional,
  );

  // Refs to prevent phantom saves on initial mount or month switching
  const hasInitializedSaveRef = useRef<boolean>(false);
  const lastMonthRef = useRef<string>(currentMonth);
  const syncingMonthSnapshotRef = useRef<string | null>(null);
  const prevDataRef = useRef<string>("");

  // Sync state if month changes (without triggering a phantom auto-save)
  useEffect(() => {
    if (lastMonthRef.current === currentMonth) return;

    const { fixed: nextFixed, additional: nextAdditional } =
      resolveMonthExpensesFromData(initialData);

    syncingMonthSnapshotRef.current = JSON.stringify({
      saved_em2_eur: initialData?.expenses?.saved_em2_eur || 0,
      fixed_expenses: nextFixed,
      additional_expenses: nextAdditional,
    });

    setFixedExpenses(nextFixed);
    setExpenses(nextAdditional);
    const nextDefaultDate = getDefaultDateKeyForMonth(currentMonth);
    setExpenseDate(nextDefaultDate);
    setFixedDate(nextDefaultDate);
  }, [currentMonth, initialData]);

  // UI State - initialized from persistent storage
  const [categories, setCategories] = useState<ExpenseCategory[]>(() =>
    loadStoredCategories(),
  );

  // Sync categories if storage updates
  const handleCategoriesChanged = (updated: ExpenseCategory[]) => {
    setCategories(updated);
  };

  // User-defined Budget Categories for assignment
  const [budgetCategories, setBudgetCategories] = useState<BudgetConfig[]>(() =>
    loadBudgets().categoryBudgets
  );

  useEffect(() => {
    const refreshBudgets = () => {
      setBudgetCategories(loadBudgets().categoryBudgets);
      setCategories(loadStoredCategories());
    };
    refreshBudgets();
    window.addEventListener("storage", refreshBudgets);
    window.addEventListener("homebudget:budgets-updated", refreshBudgets);
    window.addEventListener("homebudget:categories-updated", refreshBudgets);
    return () => {
      window.removeEventListener("storage", refreshBudgets);
      window.removeEventListener("homebudget:budgets-updated", refreshBudgets);
      window.removeEventListener("homebudget:categories-updated", refreshBudgets);
    };
  }, []);

  const getDefaultDateKeyForMonth = (monthKey: string): string => {
    const today = new Date();
    const ym = parseMonthKeyToYearMonth(monthKey);
    if (!ym) return toLocalDateKey(today);
    if (ym.year === today.getFullYear() && ym.monthIndex === today.getMonth()) {
      return toLocalDateKey(today);
    }
    const lastDay = new Date(ym.year, ym.monthIndex + 1, 0).getDate();
    const clampedDay = Math.min(today.getDate(), lastDay);
    return toLocalDateKey(new Date(ym.year, ym.monthIndex, clampedDay, 12, 0, 0, 0));
  };

  // Add Variable Expense Form State
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [selectedBudgetCategoryId, setSelectedBudgetCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [expenseDate, setExpenseDate] = useState<string>(() =>
    getDefaultDateKeyForMonth(currentMonth)
  );
  const [expenseRepeat, setExpenseRepeat] = useState<RepeatFrequency>("never");
  const [expenseCompleted, setExpenseCompleted] = useState<boolean>(true);

  // Edit Variable Expense State
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editExpenseCategory, setEditExpenseCategory] =
    useState<ExpenseCategory | null>(null);
  const [showEditExpenseCategoryPicker, setShowEditExpenseCategoryPicker] =
    useState(false);
  const [editExpenseAmount, setEditExpenseAmount] = useState("");
  const [editExpenseNote, setEditExpenseNote] = useState("");
  const [editExpenseDate, setEditExpenseDate] = useState<string>(() =>
    getDefaultDateKeyForMonth(currentMonth)
  );
  const [editExpenseBudgetCategoryId, setEditExpenseBudgetCategoryId] = useState<string>("");
  const [editExpenseRepeat, setEditExpenseRepeat] = useState<RepeatFrequency>("never");
  const [editExpenseCompleted, setEditExpenseCompleted] = useState<boolean>(true);
  const [editExpenseIsGenerated, setEditExpenseIsGenerated] = useState<boolean>(false);
  const [editingExpenseSourceMonth, setEditingExpenseSourceMonth] = useState<string | null>(null);
  const [editingExpenseIsFixed, setEditingExpenseIsFixed] = useState(false);

  // --- Smart Search, Filter & Sort State ---
  const [expenseFilters, setExpenseFilters] = useState<ExpenseFiltersState>(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isFullWidthMode, setIsFullWidthMode] = useState<boolean>(false);
  const [expandedExpenseIds, setExpandedExpenseIds] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 25; // Optimize for large datasets: 25 items per page

  const toggleExpandExpense = (id: string) => {
    setExpandedExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Add Fixed Expense Form State (defaults Repeat to "monthly" since Fixed = Recurring)
  const [isAddingFixed, setIsAddingFixed] = useState(false);
  const [showFixedCategoryPicker, setShowFixedCategoryPicker] = useState(false);
  const [selectedFixedCategory, setSelectedFixedCategory] =
    useState<ExpenseCategory | null>(null);
  const [selectedFixedBudgetCategoryId, setSelectedFixedBudgetCategoryId] = useState<string>("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [fixedDate, setFixedDate] = useState<string>(() =>
    getDefaultDateKeyForMonth(currentMonth)
  );
  const [fixedRepeat, setFixedRepeat] = useState<RepeatFrequency>("monthly");
  const [fixedCompleted, setFixedCompleted] = useState<boolean>(true);

  // Edit Fixed Expense State
  const [editingFixedId, setEditingFixedId] = useState<string | null>(null);
  const [editFixedCategory, setEditFixedCategory] =
    useState<ExpenseCategory | null>(null);
  const [showEditFixedCategoryPicker, setShowEditFixedCategoryPicker] =
    useState(false);
  const [editFixedName, setEditFixedName] = useState("");
  const [editFixedAmount, setEditFixedAmount] = useState("");
  const [editFixedDate, setEditFixedDate] = useState<string>(() =>
    getDefaultDateKeyForMonth(currentMonth)
  );
  const [editFixedBudgetCategoryId, setEditFixedBudgetCategoryId] = useState<string>("");
  const [editFixedRepeat, setEditFixedRepeat] = useState<RepeatFrequency>("monthly");
  const [editFixedCompleted, setEditFixedCompleted] = useState<boolean>(true);
  const [editFixedIsGenerated, setEditFixedIsGenerated] = useState<boolean>(false);

  // Receipt Scan & Notification State & Delete Confirmation State
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [importNotification, setImportNotification] = useState<{
    message: string;
    type: "success" | "info";
  } | null>(null);
  const [pendingDeleteFixed, setPendingDeleteFixed] = useState<ExpenseItem | null>(null);
  const [pendingDeleteExpenseItem, setPendingDeleteExpenseItem] = useState<
    (ExpenseItem & { sourceMonth?: string; isFixedItem?: boolean }) | null
  >(null);
  const lastConsumedTargetNonceRef = useRef<number | null>(null);

  const handleExpenseFromReceipt = (newExpense: ExpenseItem) => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const enrichedExpense: ExpenseItem = {
      ...newExpense,
      createdAt: newExpense.createdAt || nowIso,
      timestamp: newExpense.timestamp || nowMs,
      repeat: "never",
      completed: true,
      status: "completed",
      completedAt: newExpense.completedAt || nowIso,
    };
    setExpenses((prev) => [...prev, enrichedExpense]);
    if (isManualElectricityExpense(enrichedExpense)) {
      upsertElectricityRecordFromExpense(enrichedExpense, currentMonth);
    }
    setImportNotification({
      message: `Добавен е разход "${enrichedExpense.categoryName}" (${enrichedExpense.amount.toFixed(2)} €) от касова бележка.`,
      type: "success",
    });
    setTimeout(() => {
      setImportNotification(null);
    }, 5000);
  };

  // Persist data only when user actually modifies local expenses
  useEffect(() => {
    const dataToSave = {
      saved_em2_eur: initialData?.expenses?.saved_em2_eur || 0,
      fixed_expenses: fixedExpenses,
      additional_expenses: expenses,
    };

    const dataString = JSON.stringify(dataToSave);

    // Never persist on initial mount
    if (!hasInitializedSaveRef.current) {
      hasInitializedSaveRef.current = true;
      lastMonthRef.current = currentMonth;
      prevDataRef.current = dataString;
      return;
    }

    // Wait until month transition state has finished syncing before saving again
    if (lastMonthRef.current !== currentMonth) {
      lastMonthRef.current = currentMonth;
      if (syncingMonthSnapshotRef.current === dataString) {
        prevDataRef.current = dataString;
        syncingMonthSnapshotRef.current = null;
      }
      return;
    }

    if (syncingMonthSnapshotRef.current !== null) {
      if (syncingMonthSnapshotRef.current === dataString) {
        prevDataRef.current = dataString;
        syncingMonthSnapshotRef.current = null;
      }
      return;
    }

    // Only trigger save if user actually changed expense data
    if (prevDataRef.current !== dataString) {
      prevDataRef.current = dataString;
      onSaveExpenses(dataToSave, currentMonth);
    }
  }, [fixedExpenses, expenses, onSaveExpenses, initialData, currentMonth]);

  // --- Candidate Expenses Collection across Months & Types ---
  const candidateExpenses = useMemo(() => {
    // 1. Current Month filter
    if (expenseFilters.monthFilter === "current") {
      let items: (ExpenseItem & { sourceMonth?: string; isFixedItem?: boolean })[] = expenses.map(
        (e) => ({ ...e, sourceMonth: currentMonth, isFixedItem: false })
      );
      if (expenseFilters.includeFixed) {
        items = [
          ...items,
          ...fixedExpenses.map((f) => ({ ...f, sourceMonth: currentMonth, isFixedItem: true })),
        ];
      }
      return items;
    }

    // 2. Specific Month filter
    if (
      expenseFilters.monthFilter !== "all" &&
      expenseFilters.monthFilter !== "custom" &&
      allMonthlyData[expenseFilters.monthFilter]
    ) {
      const targetMonth = expenseFilters.monthFilter;
      const isCur = targetMonth === currentMonth;
      const rec = allMonthlyData[targetMonth];
      const vars = isCur
        ? expenses
        : rec?.expenses?.additional_expenses || [];
      let items: (ExpenseItem & { sourceMonth?: string; isFixedItem?: boolean })[] = vars.map(
        (e) => ({ ...e, sourceMonth: targetMonth, isFixedItem: false })
      );

      if (expenseFilters.includeFixed) {
        const fixes = isCur
          ? fixedExpenses
          : rec?.expenses?.fixed_expenses || [];
        items = [
          ...items,
          ...fixes.map((f) => ({ ...f, sourceMonth: targetMonth, isFixedItem: true })),
        ];
      }
      return items;
    }

    // 3. All Months or Custom Date Range filter
    const allItems: (ExpenseItem & { sourceMonth?: string; isFixedItem?: boolean })[] = [];
    const allMonthKeys = Object.keys(allMonthlyData);
    if (!allMonthKeys.includes(currentMonth)) {
      allMonthKeys.push(currentMonth);
    }

    for (const m of allMonthKeys) {
      const isCur = m === currentMonth;
      const rec = allMonthlyData[m];
      const monthVars = isCur ? expenses : rec?.expenses?.additional_expenses || [];

      for (const item of monthVars) {
        allItems.push({ ...item, sourceMonth: m, isFixedItem: false });
      }

      if (expenseFilters.includeFixed) {
        const monthFixed = isCur ? fixedExpenses : rec?.expenses?.fixed_expenses || [];
        for (const item of monthFixed) {
          allItems.push({ ...item, sourceMonth: m, isFixedItem: true });
        }
      }
    }

    return allItems;
  }, [
    expenses,
    fixedExpenses,
    allMonthlyData,
    currentMonth,
    expenseFilters.monthFilter,
    expenseFilters.includeFixed,
  ]);

  // --- Smart Search, Filter & Sort Pipeline ---
  const filteredExpenses = useMemo(() => {
    const term = expenseFilters.searchTerm.trim().toLowerCase();
    const hasCategoryFilter = expenseFilters.categoryId !== "all";
    const minVal = expenseFilters.minAmount !== "" ? parseDecimalInput(expenseFilters.minAmount) : null;
    const maxVal = expenseFilters.maxAmount !== "" ? parseDecimalInput(expenseFilters.maxAmount) : null;
    const isCustomDate = expenseFilters.monthFilter === "custom";
    const startIso = expenseFilters.startDate ? expenseFilters.startDate + "T00:00:00" : null;
    const endIso = expenseFilters.endDate ? expenseFilters.endDate + "T23:59:59" : null;

    return candidateExpenses
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => {
        // Smart Search by Note, Category, Amount
        if (term) {
          const noteMatch = item.note && item.note.toLowerCase().includes(term);
          const catMatch = item.categoryName && item.categoryName.toLowerCase().includes(term);
          const amtStr = item.amount.toString();
          const amtFixed = item.amount.toFixed(2);
          const amtMatch = amtStr.includes(term) || amtFixed.includes(term);

          if (!noteMatch && !catMatch && !amtMatch) {
            return false;
          }
        }

        // Filter by Category
        if (hasCategoryFilter) {
          const catSelected = expenseFilters.categoryId.toLowerCase();
          const matchesCategory =
            item.categoryName.toLowerCase() === catSelected ||
            item.categoryId.toLowerCase() === catSelected;
          if (!matchesCategory) return false;
        }

        // Filter by Budget Category
        if (expenseFilters.budgetCategoryId && expenseFilters.budgetCategoryId !== "all") {
          if (expenseFilters.budgetCategoryId === "none") {
            if (item.budgetCategoryId && item.budgetCategoryId !== "none" && item.budgetCategoryId !== "no_budget") {
              return false;
            }
          } else {
            const targetBudget = budgetCategories.find((b) => b.id === expenseFilters.budgetCategoryId);
            if (targetBudget) {
              if (!isExpenseMatchingBudget(item, targetBudget)) {
                return false;
              }
            } else if (item.budgetCategoryId !== expenseFilters.budgetCategoryId) {
              return false;
            }
          }
        }

        // Filter by Amount Range
        if (minVal !== null && !isNaN(minVal) && item.amount < minVal) {
          return false;
        }
        if (maxVal !== null && !isNaN(maxVal) && item.amount > maxVal) {
          return false;
        }

        // Filter by Custom Date Range
        if (isCustomDate) {
          const recDateKey = resolveRecordDateKey(item, item.sourceMonth || currentMonth);
          const recIso = dateKeyToStableIso(recDateKey);
          if (startIso && recIso < startIso) return false;
          if (endIso && recIso > endIso) return false;
        }

        // Filter by Expense Status ("all" | "completed" | "planned")
        if (expenseFilters.statusFilter === "completed" && !isCompletedExpense(item)) {
          return false;
        }
        if (expenseFilters.statusFilter === "planned" && !isPlannedExpense(item)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (expenseFilters.sortBy) {
          case "oldest":
            return compareExpensesChronologically(a.item, b.item, "asc", a.idx, b.idx);
          case "highest":
            return (
              b.item.amount - a.item.amount ||
              compareExpensesChronologically(a.item, b.item, "desc", a.idx, b.idx)
            );
          case "lowest":
            return (
              a.item.amount - b.item.amount ||
              compareExpensesChronologically(a.item, b.item, "desc", a.idx, b.idx)
            );
          case "newest":
          default:
            return compareExpensesChronologically(a.item, b.item, "desc", a.idx, b.idx);
        }
      })
      .map(({ item }) => item);
  }, [candidateExpenses, expenseFilters, budgetCategories]);

  // Pagination for large dataset optimization
  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedExpenses = useMemo(() => {
    const startIdx = (safePage - 1) * PAGE_SIZE;
    return filteredExpenses.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredExpenses, safePage, PAGE_SIZE]);

  const totalFilteredSum = useMemo(() => {
    return filteredExpenses
      .filter((item) => isCompletedExpense(item))
      .reduce((sum, item) => sum + item.amount, 0);
  }, [filteredExpenses]);

  const totalFilteredPlannedSum = useMemo(() => {
    return filteredExpenses
      .filter((item) => isPlannedExpense(item))
      .reduce((sum, item) => sum + item.amount, 0);
  }, [filteredExpenses]);

  // --- Helpers & Handlers for Variable Expenses ---

  const resolveExpenseCategoryObject = (item: ExpenseItem): ExpenseCategory => {
    const byId = item.categoryId
      ? categories.find((c) => c.id === item.categoryId)
      : undefined;
    if (byId) return byId;
    const byName = item.categoryName
      ? categories.find(
          (c) => c.name.trim().toLowerCase() === item.categoryName.trim().toLowerCase()
        )
      : undefined;
    if (byName) return byName;
    return {
      id: item.categoryId || item.categoryName || "other",
      name: item.categoryName || "Други",
      iconName:
        resolveCategoryDisplayIcon(item.categoryIcon, item.categoryName) ||
        "ShoppingBag",
      colorClass: item.categoryColor || "bg-slate-100 text-slate-600",
    };
  };

  const resolveDisplayBudgetName = (item: ExpenseItem): string => {
    if (!item.budgetCategoryId || item.budgetCategoryId === "none") return "";
    const liveBudget = budgetCategories.find((b) => b.id === item.budgetCategoryId);
    return liveBudget?.categoryName || item.budgetCategoryName || item.budgetCategoryId;
  };

  const handleAddNewCategory = (newCat: ExpenseCategory) => {
    setCategories(loadStoredCategories());
    handleSelectCategory(newCat);
  };

  const handleSelectCategory = (cat: ExpenseCategory) => {
    setSelectedCategory(cat);
    setShowCategoryPicker(false);
    const suggested = findMatchingBudgetCategoryId(cat.id, cat.name, budgetCategories);
    if (suggested) {
      setSelectedBudgetCategoryId(suggested);
    }
  };

  const handleAddExpense = () => {
    if (!selectedCategory || !amount) return;

    const parsedAmount = parseDecimalInput(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const chosenBudget = budgetCategories.find(
      (b) => b.id === selectedBudgetCategoryId
    );

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const safeDateKey =
      expenseDate && /^\d{4}-\d{2}-\d{2}$/.test(expenseDate)
        ? expenseDate
        : getDefaultDateKeyForMonth(currentMonth);
    const targetMonthKey = getMonthKeyFromDateKey(safeDateKey);
    const normalizedRepeat = normalizeRepeatValue(expenseRepeat);
    const goesToFixed = isRepeatingFrequency(normalizedRepeat);

    const newExpense: ExpenseItem = {
      id: `${goesToFixed ? "fix" : "exp"}_${nowMs}`,
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      categoryIcon: selectedCategory.iconName,
      categoryColor: selectedCategory.colorClass,
      budgetCategoryId: selectedBudgetCategoryId || undefined,
      budgetCategoryName: chosenBudget ? chosenBudget.categoryName : undefined,
      amount: parsedAmount,
      note: note.trim() || undefined,
      date: dateKeyToStableIso(safeDateKey),
      expectedDate: safeDateKey,
      createdAt: nowIso,
      timestamp: nowMs,
      repeat: normalizedRepeat,
      isRecurring: goesToFixed,
      isFixedItem: goesToFixed ? true : undefined,
      completed: expenseCompleted,
      status: expenseCompleted ? "completed" : "planned",
      completedAt: expenseCompleted ? nowIso : undefined,
    };

    if (targetMonthKey === currentMonth) {
      if (goesToFixed) {
        setFixedExpenses((prev) => [...prev, newExpense]);
      } else {
        setExpenses((prev) => [...prev, newExpense]);
      }
    } else {
      const targetRecord = allMonthlyData[targetMonthKey];
      const existingExpenses = targetRecord?.expenses || {
        saved_em2_eur: 0,
        fixed_expenses: [],
        additional_expenses: [],
      };
      onSaveExpenses(
        {
          ...existingExpenses,
          fixed_expenses: goesToFixed
            ? [...(existingExpenses.fixed_expenses || []), newExpense]
            : existingExpenses.fixed_expenses || [],
          additional_expenses: goesToFixed
            ? existingExpenses.additional_expenses || []
            : [...(existingExpenses.additional_expenses || []), newExpense],
        },
        targetMonthKey
      );
    }

    if (isRecordCompleted(newExpense) && isManualElectricityExpense(newExpense)) {
      upsertElectricityRecordFromExpense(newExpense, targetMonthKey);
    }

    // Reset form
    setIsAddingExpense(false);
    setSelectedCategory(null);
    setSelectedBudgetCategoryId("");
    setAmount("");
    setNote("");
    setExpenseDate(getDefaultDateKeyForMonth(currentMonth));
    setExpenseRepeat("never");
    setExpenseCompleted(true);
  };

  const handleDeleteExpense = (id: string) => {
    const target = expenses.find((e) => e.id === id);
    if (target?.recurrenceSourceId && target?.recurrenceOccurrenceKey) {
      markRecurrenceDismissed(target.recurrenceSourceId, target.recurrenceOccurrenceKey);
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    deleteElectricityRecordByExpenseId(id);
    if (editingExpenseId === id) {
      setEditingExpenseId(null);
    }
  };

  const handleDeleteExpenseItem = (
    expense: ExpenseItem & { sourceMonth?: string; isFixedItem?: boolean }
  ) => {
    const targetMonth = expense.sourceMonth || currentMonth;
    const isFixedTarget =
      Boolean(expense.isFixedItem) || isRepeatingFrequency(expense.repeat);

    if (targetMonth === currentMonth) {
      if (isFixedTarget) {
        handleDeleteFixedExpense(expense.id);
      } else {
        handleDeleteExpense(expense.id);
      }
    } else {
      if (expense.recurrenceSourceId && expense.recurrenceOccurrenceKey) {
        markRecurrenceDismissed(expense.recurrenceSourceId, expense.recurrenceOccurrenceKey);
      }
      const record = allMonthlyData[targetMonth];
      if (record && record.expenses) {
        const updatedFixed = isFixedTarget
          ? (record.expenses.fixed_expenses || []).filter((e) => e.id !== expense.id)
          : record.expenses.fixed_expenses;
        const updatedAdd = !isFixedTarget
          ? (record.expenses.additional_expenses || []).filter((e) => e.id !== expense.id)
          : record.expenses.additional_expenses;
        onSaveExpenses(
          {
            ...record.expenses,
            fixed_expenses: updatedFixed,
            additional_expenses: updatedAdd,
          },
          targetMonth
        );
      }
      deleteElectricityRecordByExpenseId(expense.id);
    }
  };

  const handleStartEditExpense = (
    expense: ExpenseItem & { sourceMonth?: string; isFixedItem?: boolean }
  ) => {
    const resolvedMonth = expense.sourceMonth || currentMonth;
    setEditingExpenseId(expense.id);
    setEditExpenseCategory(resolveExpenseCategoryObject(expense));
    setEditExpenseAmount(expense.amount.toString());
    setEditExpenseNote(expense.note || "");
    setEditExpenseDate(resolveRecordDateKey(expense, resolvedMonth));
    setEditExpenseBudgetCategoryId(expense.budgetCategoryId || "");
    setEditExpenseRepeat(resolveItemRepeat(expense));
    setEditExpenseCompleted(isRecordCompleted(expense));
    setEditExpenseIsGenerated(Boolean(expense.recurrenceSourceId));
    setEditingExpenseSourceMonth(resolvedMonth);
    setEditingExpenseIsFixed(
      Boolean(expense.isFixedItem) || isRepeatingFrequency(expense.repeat)
    );
  };

  const handleSaveEditExpense = (id: string) => {
    const val = parseDecimalInput(editExpenseAmount);
    if (isNaN(val) || val < 0) return;

    const oldMonth = editingExpenseSourceMonth || currentMonth;
    const safeDateKey =
      editExpenseDate && /^\d{4}-\d{2}-\d{2}$/.test(editExpenseDate)
        ? editExpenseDate
        : getDefaultDateKeyForMonth(oldMonth);
    const targetMonth = getMonthKeyFromDateKey(safeDateKey);
    const parsedNote = parseExpenseNote(editExpenseNote);
    const chosenBudget = budgetCategories.find(
      (b) => b.id === editExpenseBudgetCategoryId
    );
    const nowIso = new Date().toISOString();
    const effectiveRepeat = normalizeRepeatValue(editExpenseRepeat);
    const willBeFixed = isRepeatingFrequency(effectiveRepeat);

    const buildUpdated = (item: ExpenseItem): ExpenseItem => ({
      ...item,
      categoryId: editExpenseCategory?.id || item.categoryId,
      categoryName: editExpenseCategory?.name || item.categoryName,
      categoryIcon: editExpenseCategory?.iconName || item.categoryIcon,
      categoryColor: editExpenseCategory?.colorClass || item.categoryColor,
      amount: val,
      note: editExpenseNote.trim() || undefined,
      merchantName: parsedNote.merchantName || item.merchantName,
      receiptItems: parsedNote.items.length > 0 ? parsedNote.items : item.receiptItems,
      date: dateKeyToStableIso(safeDateKey),
      expectedDate: safeDateKey,
      budgetCategoryId: editExpenseBudgetCategoryId || undefined,
      budgetCategoryName: chosenBudget ? chosenBudget.categoryName : undefined,
      repeat: effectiveRepeat,
      isRecurring: willBeFixed,
      isFixedItem: willBeFixed ? true : undefined,
      completed: editExpenseCompleted,
      status: editExpenseCompleted ? "completed" : "planned",
      completedAt: editExpenseCompleted ? item.completedAt || nowIso : undefined,
    });

    const sourceItem =
      oldMonth === currentMonth
        ? fixedExpenses.find((item) => item.id === id) ||
          expenses.find((item) => item.id === id)
        : (allMonthlyData[oldMonth]?.expenses?.fixed_expenses || []).find(
            (i) => i.id === id
          ) ||
          (allMonthlyData[oldMonth]?.expenses?.additional_expenses || []).find(
            (i) => i.id === id
          );

    if (sourceItem) {
      const updatedItem = buildUpdated(sourceItem);

      if (oldMonth === targetMonth) {
        if (targetMonth === currentMonth) {
          if (willBeFixed) {
            setExpenses((prev) => prev.filter((item) => item.id !== id));
            setFixedExpenses((prev) =>
              prev.some((item) => item.id === id)
                ? prev.map((item) => (item.id === id ? updatedItem : item))
                : [...prev, updatedItem]
            );
          } else {
            setFixedExpenses((prev) => prev.filter((item) => item.id !== id));
            setExpenses((prev) =>
              prev.some((item) => item.id === id)
                ? prev.map((item) => (item.id === id ? updatedItem : item))
                : [...prev, updatedItem]
            );
          }
        } else {
          const record = allMonthlyData[targetMonth];
          const oldFixed = record?.expenses?.fixed_expenses || [];
          const oldAdd = record?.expenses?.additional_expenses || [];
          onSaveExpenses(
            {
              saved_em2_eur: record?.expenses?.saved_em2_eur || 0,
              fixed_expenses: willBeFixed
                ? [...oldFixed.filter((i) => i.id !== id), updatedItem]
                : oldFixed.filter((i) => i.id !== id),
              additional_expenses: willBeFixed
                ? oldAdd.filter((i) => i.id !== id)
                : [...oldAdd.filter((i) => i.id !== id), updatedItem],
            },
            targetMonth
          );
        }
      } else {
        // Cross-month move due to Expected Date edit
        if (oldMonth === currentMonth) {
          setFixedExpenses((prev) => prev.filter((i) => i.id !== id));
          setExpenses((prev) => prev.filter((i) => i.id !== id));
        } else {
          const oldRec = allMonthlyData[oldMonth];
          if (oldRec?.expenses) {
            onSaveExpenses(
              {
                ...oldRec.expenses,
                fixed_expenses: (oldRec.expenses.fixed_expenses || []).filter(
                  (i) => i.id !== id
                ),
                additional_expenses: (
                  oldRec.expenses.additional_expenses || []
                ).filter((i) => i.id !== id),
              },
              oldMonth
            );
          }
        }

        if (targetMonth === currentMonth) {
          if (willBeFixed) {
            setFixedExpenses((prev) => [...prev, updatedItem]);
          } else {
            setExpenses((prev) => [...prev, updatedItem]);
          }
        } else {
          const targetRec = allMonthlyData[targetMonth];
          const destExp = targetRec?.expenses || {
            saved_em2_eur: 0,
            fixed_expenses: [],
            additional_expenses: [],
          };
          onSaveExpenses(
            {
              ...destExp,
              fixed_expenses: willBeFixed
                ? [...(destExp.fixed_expenses || []), updatedItem]
                : destExp.fixed_expenses || [],
              additional_expenses: willBeFixed
                ? destExp.additional_expenses || []
                : [...(destExp.additional_expenses || []), updatedItem],
            },
            targetMonth
          );
        }
      }

      if (isRecordCompleted(updatedItem)) {
        upsertElectricityRecordFromExpense(updatedItem, targetMonth);
      } else if (isManualElectricityExpense(updatedItem)) {
        deleteElectricityRecordByExpenseId(updatedItem.id);
      }
    }
    setEditingExpenseId(null);
  };

  const handleToggleExpenseCompletion = (
    expense: ExpenseItem & { sourceMonth?: string; isFixedItem?: boolean },
    nextCompleted: boolean
  ) => {
    const targetMonth = expense.sourceMonth || currentMonth;
    const isFixed =
      Boolean(expense.isFixedItem) || isRepeatingFrequency(expense.repeat);

    if (isFixed) {
      handleToggleFixedCompletion(expense.id, nextCompleted, targetMonth);
      return;
    }

    if (targetMonth === currentMonth) {
      const toggled = toggleRecordCompletion(expense, nextCompleted);
      setExpenses((prev) =>
        prev.map((item) =>
          item.id === expense.id ? toggleRecordCompletion(item, nextCompleted) : item
        )
      );
      if (isRecordCompleted(toggled)) {
        upsertElectricityRecordFromExpense(toggled, targetMonth);
      } else if (isManualElectricityExpense(toggled)) {
        deleteElectricityRecordByExpenseId(toggled.id);
      }
    } else {
      const record = allMonthlyData[targetMonth];
      if (record && record.expenses) {
        let updatedItem: ExpenseItem | null = null;
        const updatedAdd = (record.expenses.additional_expenses || []).map((item) => {
          if (item.id === expense.id) {
            updatedItem = toggleRecordCompletion(item, nextCompleted);
            return updatedItem;
          }
          return item;
        });
        onSaveExpenses(
          {
            ...record.expenses,
            additional_expenses: updatedAdd,
          },
          targetMonth
        );
        if (updatedItem) {
          if (isRecordCompleted(updatedItem)) {
            upsertElectricityRecordFromExpense(updatedItem, targetMonth);
          } else if (isManualElectricityExpense(updatedItem)) {
            deleteElectricityRecordByExpenseId((updatedItem as ExpenseItem).id);
          }
        }
      }
    }
  };

  const handleCancelEditExpense = () => {
    setEditingExpenseId(null);
  };

  // --- Handlers for Fixed Expenses ---

  const handleAddNewFixedCategory = (name: string) => {
    const newCat: ExpenseCategory = {
      id: `custom_fixed_${Date.now()}`,
      name,
      iconName: "CreditCard",
      colorClass: "bg-slate-100 text-slate-500",
      isCustom: true,
    };
    handleSelectFixedCategory(newCat);
  };

  const handleSelectFixedCategory = (cat: ExpenseCategory) => {
    setSelectedFixedCategory(cat);
    setShowFixedCategoryPicker(false);
    const suggested = findMatchingBudgetCategoryId(cat.id, cat.name, budgetCategories);
    if (suggested) {
      setSelectedFixedBudgetCategoryId(suggested);
    }
  };

  const handleAddFixedExpense = () => {
    if (!selectedFixedCategory || !fixedAmount) return;

    const parsed = parseDecimalInput(fixedAmount);
    if (isNaN(parsed) || parsed <= 0) return;

    const chosenBudget = budgetCategories.find(
      (b) => b.id === selectedFixedBudgetCategoryId
    );

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const safeDateKey =
      fixedDate && /^\d{4}-\d{2}-\d{2}$/.test(fixedDate)
        ? fixedDate
        : getDefaultDateKeyForMonth(currentMonth);
    const targetMonthKey = getMonthKeyFromDateKey(safeDateKey);
    const normalizedRepeat = normalizeRepeatValue(fixedRepeat);
    const goesToFixed = isRepeatingFrequency(normalizedRepeat);

    const newItem: ExpenseItem = {
      id: `${goesToFixed ? "fix" : "exp"}_${nowMs}`,
      categoryId: selectedFixedCategory.id,
      categoryName: selectedFixedCategory.name,
      categoryIcon: selectedFixedCategory.iconName,
      categoryColor: selectedFixedCategory.colorClass,
      budgetCategoryId: selectedFixedBudgetCategoryId || undefined,
      budgetCategoryName: chosenBudget ? chosenBudget.categoryName : undefined,
      amount: parsed,
      date: dateKeyToStableIso(safeDateKey),
      expectedDate: safeDateKey,
      createdAt: nowIso,
      timestamp: nowMs,
      repeat: normalizedRepeat,
      isRecurring: goesToFixed,
      isFixedItem: goesToFixed ? true : undefined,
      completed: fixedCompleted,
      status: fixedCompleted ? "completed" : "planned",
      completedAt: fixedCompleted ? nowIso : undefined,
    };

    if (targetMonthKey === currentMonth) {
      if (goesToFixed) {
        setFixedExpenses((prev) => [...prev, newItem]);
      } else {
        setExpenses((prev) => [...prev, newItem]);
      }
    } else {
      const targetRec = allMonthlyData[targetMonthKey];
      const existingExp = targetRec?.expenses || {
        saved_em2_eur: 0,
        fixed_expenses: [],
        additional_expenses: [],
      };
      onSaveExpenses(
        {
          ...existingExp,
          fixed_expenses: goesToFixed
            ? [...(existingExp.fixed_expenses || []), newItem]
            : existingExp.fixed_expenses || [],
          additional_expenses: goesToFixed
            ? existingExp.additional_expenses || []
            : [...(existingExp.additional_expenses || []), newItem],
        },
        targetMonthKey
      );
    }

    if (isRecordCompleted(newItem) && isManualElectricityExpense(newItem)) {
      upsertElectricityRecordFromExpense(newItem, targetMonthKey);
    }

    // Reset form (Fixed defaults back to "monthly")
    setIsAddingFixed(false);
    setSelectedFixedCategory(null);
    setSelectedFixedBudgetCategoryId("");
    setFixedAmount("");
    setFixedDate(getDefaultDateKeyForMonth(currentMonth));
    setFixedRepeat("monthly");
    setFixedCompleted(true);
  };

  const handleDeleteFixedExpense = (id: string) => {
    const target = fixedExpenses.find((e) => e.id === id);
    if (target?.recurrenceSourceId && target?.recurrenceOccurrenceKey) {
      markRecurrenceDismissed(target.recurrenceSourceId, target.recurrenceOccurrenceKey);
    }
    setFixedExpenses((prev) => prev.filter((e) => e.id !== id));
    deleteElectricityRecordByExpenseId(id);
    if (editingFixedId === id) {
      setEditingFixedId(null);
    }
  };

  const handleStartEditFixed = (item: ExpenseItem) => {
    setEditingFixedId(item.id);
    setEditFixedCategory(resolveExpenseCategoryObject(item));
    setEditFixedName(item.categoryName);
    setEditFixedAmount(item.amount.toString());
    setEditFixedDate(resolveRecordDateKey(item, currentMonth));
    setEditFixedBudgetCategoryId(item.budgetCategoryId || "");
    setEditFixedRepeat(resolveItemRepeat(item));
    setEditFixedCompleted(isRecordCompleted(item));
    setEditFixedIsGenerated(Boolean(item.recurrenceSourceId));
  };

  const handleSaveEditFixed = (id: string) => {
    const val = parseDecimalInput(editFixedAmount);
    if (isNaN(val) || val < 0) return;

    const chosenBudget = budgetCategories.find(
      (b) => b.id === editFixedBudgetCategoryId
    );
    const nowIso = new Date().toISOString();

    const existingItem = fixedExpenses.find((item) => item.id === id);
    if (!existingItem) {
      setEditingFixedId(null);
      return;
    }

    const safeDateKey =
      editFixedDate && /^\d{4}-\d{2}-\d{2}$/.test(editFixedDate)
        ? editFixedDate
        : getDefaultDateKeyForMonth(currentMonth);
    const targetMonthKey = getMonthKeyFromDateKey(safeDateKey);
    const effectiveRepeat = normalizeRepeatValue(editFixedRepeat);
    const willStayFixed = isRepeatingFrequency(effectiveRepeat);

    const updatedItem: ExpenseItem = {
      ...existingItem,
      categoryId: editFixedCategory?.id || existingItem.categoryId,
      categoryName:
        editFixedName.trim() || editFixedCategory?.name || existingItem.categoryName,
      categoryIcon: editFixedCategory?.iconName || existingItem.categoryIcon,
      categoryColor: editFixedCategory?.colorClass || existingItem.categoryColor,
      amount: val,
      date: dateKeyToStableIso(safeDateKey),
      expectedDate: safeDateKey,
      budgetCategoryId: editFixedBudgetCategoryId || undefined,
      budgetCategoryName: chosenBudget ? chosenBudget.categoryName : undefined,
      repeat: effectiveRepeat,
      isRecurring: willStayFixed,
      isFixedItem: willStayFixed ? true : undefined,
      completed: editFixedCompleted,
      status: editFixedCompleted ? "completed" : "planned",
      completedAt: editFixedCompleted
        ? existingItem.completedAt || nowIso
        : undefined,
    };

    if (targetMonthKey === currentMonth) {
      if (willStayFixed) {
        setFixedExpenses((prev) =>
          prev.map((item) => (item.id === id ? updatedItem : item))
        );
      } else {
        // Repeat changed from Recurring -> Never: move automatically to Additional Expenses
        setFixedExpenses((prev) => prev.filter((item) => item.id !== id));
        setExpenses((prev) =>
          prev.some((item) => item.id === id)
            ? prev.map((item) => (item.id === id ? updatedItem : item))
            : [...prev, updatedItem]
        );
      }
    } else {
      setFixedExpenses((prev) => prev.filter((item) => item.id !== id));
      const targetRec = allMonthlyData[targetMonthKey];
      const destExp = targetRec?.expenses || {
        saved_em2_eur: 0,
        fixed_expenses: [],
        additional_expenses: [],
      };
      onSaveExpenses(
        {
          ...destExp,
          fixed_expenses: willStayFixed
            ? [...(destExp.fixed_expenses || []), updatedItem]
            : destExp.fixed_expenses || [],
          additional_expenses: willStayFixed
            ? destExp.additional_expenses || []
            : [...(destExp.additional_expenses || []), updatedItem],
        },
        targetMonthKey
      );
    }

    if (isRecordCompleted(updatedItem)) {
      upsertElectricityRecordFromExpense(updatedItem, targetMonthKey);
    } else if (isManualElectricityExpense(updatedItem)) {
      deleteElectricityRecordByExpenseId(updatedItem.id);
    }
    setEditingFixedId(null);
  };

  const handleToggleFixedCompletion = (
    id: string,
    nextCompleted: boolean,
    targetMonth: string = currentMonth
  ) => {
    if (targetMonth === currentMonth) {
      const target = fixedExpenses.find((i) => i.id === id);
      const updated = target ? toggleRecordCompletion(target, nextCompleted) : null;
      setFixedExpenses((prev) =>
        prev.map((item) =>
          item.id === id ? toggleRecordCompletion(item, nextCompleted) : item
        )
      );
      if (updated) {
        if (isRecordCompleted(updated)) {
          upsertElectricityRecordFromExpense(updated, targetMonth);
        } else if (isManualElectricityExpense(updated)) {
          deleteElectricityRecordByExpenseId(updated.id);
        }
      }
      return;
    }

    const record = allMonthlyData[targetMonth];
    if (record && record.expenses && Array.isArray(record.expenses.fixed_expenses)) {
      let updatedItem: ExpenseItem | null = null;
      const updatedFixed = record.expenses.fixed_expenses.map((item) => {
        if (item.id === id) {
          updatedItem = toggleRecordCompletion(item, nextCompleted);
          return updatedItem;
        }
        return item;
      });
      onSaveExpenses(
        {
          ...record.expenses,
          fixed_expenses: updatedFixed,
        },
        targetMonth
      );
      if (updatedItem) {
        if (isRecordCompleted(updatedItem)) {
          upsertElectricityRecordFromExpense(updatedItem, targetMonth);
        } else if (isManualElectricityExpense(updatedItem)) {
          deleteElectricityRecordByExpenseId((updatedItem as ExpenseItem).id);
        }
      }
    }
  };

  const handleCancelEditFixed = () => {
    setEditingFixedId(null);
  };

  const totalFixed = fixedExpenses
    .filter((item) => isCompletedExpense(item))
    .reduce((sum, item) => sum + item.amount, 0);
  const totalVariable = expenses
    .filter((item) => isCompletedExpense(item))
    .reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = totalFixed + totalVariable;

  const totalPlannedFixed = fixedExpenses
    .filter((item) => isPlannedExpense(item))
    .reduce((sum, item) => sum + item.amount, 0);
  const totalPlannedVariable = expenses
    .filter((item) => isPlannedExpense(item))
    .reduce((sum, item) => sum + item.amount, 0);
  const totalPlannedExpenses = totalPlannedFixed + totalPlannedVariable;

  // Open specific expense when navigated from Calendar / Dashboard
  useEffect(() => {
    if (!pendingRecordTarget || pendingRecordTarget.kind !== "expense") return;
    if (lastConsumedTargetNonceRef.current === pendingRecordTarget.nonce) return;
    if (pendingRecordTarget.monthKey !== currentMonth) return;

    const fixedMatch = fixedExpenses.find(
      (i) => i.id === pendingRecordTarget.recordId
    );
    if (fixedMatch) {
      lastConsumedTargetNonceRef.current = pendingRecordTarget.nonce;
      setIsFullWidthMode(false);
      handleStartEditFixed(fixedMatch);
      onConsumeRecordTarget?.();
      setTimeout(() => {
        document
          .getElementById(`expense-record-${fixedMatch.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
      return;
    }

    const varMatch = expenses.find(
      (i) => i.id === pendingRecordTarget.recordId
    );
    if (varMatch) {
      lastConsumedTargetNonceRef.current = pendingRecordTarget.nonce;
      setExpenseFilters((prev) => ({
        ...DEFAULT_FILTERS,
        monthFilter: "current",
        includeFixed: prev.includeFixed,
      }));
      handleStartEditExpense({
        ...varMatch,
        sourceMonth: currentMonth,
        isFixedItem: false,
      });
      onConsumeRecordTarget?.();
      setTimeout(() => {
        document
          .getElementById(`expense-record-${varMatch.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    // Fallback check in case target belongs to allMonthlyData snapshot
    const rec = allMonthlyData[pendingRecordTarget.monthKey];
    const inOtherFixed = rec?.expenses?.fixed_expenses?.find(
      (i) => i.id === pendingRecordTarget.recordId
    );
    const inOtherVar = rec?.expenses?.additional_expenses?.find(
      (i) => i.id === pendingRecordTarget.recordId
    );
    if (inOtherFixed) {
      lastConsumedTargetNonceRef.current = pendingRecordTarget.nonce;
      setExpenseFilters((prev) => ({
        ...DEFAULT_FILTERS,
        monthFilter: pendingRecordTarget.monthKey,
        includeFixed: true,
      }));
      handleStartEditExpense({
        ...inOtherFixed,
        sourceMonth: pendingRecordTarget.monthKey,
        isFixedItem: true,
      });
      onConsumeRecordTarget?.();
    } else if (inOtherVar) {
      lastConsumedTargetNonceRef.current = pendingRecordTarget.nonce;
      setExpenseFilters({
        ...DEFAULT_FILTERS,
        monthFilter: pendingRecordTarget.monthKey,
      });
      handleStartEditExpense({
        ...inOtherVar,
        sourceMonth: pendingRecordTarget.monthKey,
        isFixedItem: false,
      });
      onConsumeRecordTarget?.();
    }
  }, [
    pendingRecordTarget,
    currentMonth,
    fixedExpenses,
    expenses,
    allMonthlyData,
    onConsumeRecordTarget,
  ]);

  // Keep edited variable expense visible on its current page & scroll it into view
  useEffect(() => {
    if (!editingExpenseId) return;
    const idx = filteredExpenses.findIndex((i) => i.id === editingExpenseId);
    if (idx !== -1) {
      const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
      if (targetPage !== safePage) {
        setCurrentPage(targetPage);
      }
      setTimeout(() => {
        document
          .getElementById(`expense-record-${editingExpenseId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
    }
  }, [editingExpenseId, filteredExpenses, safePage, PAGE_SIZE]);

  // Available months list for switcher if provided
  const recordedMonthKeys = Object.keys(allMonthlyData || {});

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">
              Месечни разходи
            </h2>

            {/* Month Badge or Switcher */}
            {onMonthChange && recordedMonthKeys.length > 1 ? (
              <div className="relative inline-block ml-1">
                <select
                  value={currentMonth}
                  onChange={(e) => onMonthChange(e.target.value)}
                  className="appearance-none bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 font-semibold text-xs rounded-full pl-3 pr-7 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-colors"
                >
                  {recordedMonthKeys.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {!recordedMonthKeys.includes(currentMonth) && (
                    <option value={currentMonth}>{currentMonth}</option>
                  )}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            ) : (
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 ml-1 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 px-2.5 py-0.5 rounded-full">
                {currentMonth}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Управлявайте повтарящите се и допълнителни разходи за домакинството
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 self-end sm:self-center">
          {/* Add Expense Button (Moved above recurring expenses) */}
          <button
            onClick={() => setIsAddingExpense((prev) => !prev)}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95"
            title="Добави нов разход ръчно"
          >
            <Plus className="w-4 h-4" />
            <span>Добави разход</span>
          </button>

          {/* Scan Receipt Button - Single entry point */}
          <button
            onClick={() => setIsScanModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Сканирай касова бележка с камера или файл от устройството"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Сканирай касова бележка</span>
            <span className="sm:hidden">Сканирай бележка</span>
          </button>

          <div className="text-right pl-2 border-l border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block uppercase font-medium tracking-wider">
              Общо разходи
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              €{totalExpenses.toFixed(2)}
            </span>
            {totalPlannedExpenses > 0 && (
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 block tabular-nums">
                Предстоящи: €{totalPlannedExpenses.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Import Notification Banner */}
      {importNotification && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between text-emerald-800 dark:text-emerald-200 text-sm animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="font-semibold">{importNotification.message}</span>
          </div>
          <button
            onClick={() => setImportNotification(null)}
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add Variable Expense Form Panel - Positioned above Fixed Expenses */}
      {isAddingExpense && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-md border-2 border-indigo-200 dark:border-indigo-800 animate-in slide-in-from-top-3 relative space-y-4">
          <button
            onClick={() => setIsAddingExpense(false)}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white text-base">
                  Нов допълнителен разход
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Въведете текущ или периодичен разход за месеца
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsAddingExpense(false);
                setIsScanModalOpen(true);
              }}
              className="mr-7 flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/40 dark:to-indigo-950/40 hover:from-violet-100 hover:to-indigo-100 dark:hover:from-violet-900/60 dark:hover:to-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-semibold transition-all active:scale-95 shadow-2xs"
              title="Сканирай касова бележка с камера"
            >
              <Camera className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Сканирай бележка с камера</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category Selector Trigger */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Категория
              </label>
              <button
                onClick={() => setShowCategoryPicker(true)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 transition-all text-left"
              >
                {selectedCategory ? (
                  <span className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-medium">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center ${getCategoryBadgeClasses(selectedCategory.colorClass)}`}
                    >
                      {selectedCategory.iconName &&
                      ICON_MAP[selectedCategory.iconName] ? (
                        React.createElement(
                          ICON_MAP[selectedCategory.iconName],
                          { className: "w-3 h-3 text-current" },
                        )
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-current" />
                      )}
                    </span>
                    {selectedCategory.name}
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400 text-sm">
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
          </div>

          {/* Budget Category Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Бюджетна категория (Budget Category)
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                За изчисляване и следене в бюджета
              </span>
            </label>
            <select
              value={selectedBudgetCategoryId}
              onChange={(e) => setSelectedBudgetCategoryId(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm text-sm text-slate-900 dark:text-white"
            >
              <option value="">-- Автоматично по категория --</option>
              <option value="none">-- Без бюджетна категория (No Budget) --</option>
              {budgetCategories.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.categoryName} (Лимит: €{b.monthlyLimit.toFixed(0)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {!expenseCompleted ? "Очаквана дата" : "Дата / Очаквана дата"}
              </label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3 py-2 min-h-[44px] sm:min-h-[40px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Бележка (опционално)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 min-h-[44px] sm:min-h-[40px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400"
                placeholder="напр. пазаруване, вечеря, гориво, абонамент..."
              />
            </div>
          </div>

          <RecurrenceCompletionRows
            repeat={expenseRepeat}
            onRepeatChange={setExpenseRepeat}
            completed={expenseCompleted}
            onCompletedChange={setExpenseCompleted}
          />

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleAddExpense}
              disabled={
                !selectedCategory ||
                !amount ||
                isNaN(parseDecimalInput(amount)) ||
                parseDecimalInput(amount) <= 0
              }
              className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              Добави разход
            </button>
            <button
              onClick={() => setIsAddingExpense(false)}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-semibold transition-colors"
            >
              Отказ
            </button>
          </div>
        </div>
      )}

      <div className={isFullWidthMode ? "space-y-6" : "grid grid-cols-1 lg:grid-cols-2 gap-6"}>
        {/* Left Column: Fixed Monthly Expenses */}
        {!isFullWidthMode && (
          <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-blue-500" />
                Повтарящи се разходи
              </h3>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium">
                {fixedExpenses.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                  €{totalFixed.toFixed(2)}
                </span>
                {totalPlannedFixed > 0 && (
                  <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                    Предстоящи: €{totalPlannedFixed.toFixed(2)}
                  </span>
                )}
              </div>
              {!isAddingFixed && (
                <button
                  onClick={() => setIsAddingFixed(true)}
                  className="p-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors shadow-sm"
                  title="Добави повтарящ се разход"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Add Recurring Expense Form */}
          {isAddingFixed && (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-blue-200 dark:border-blue-900/60 animate-in slide-in-from-top-2 relative space-y-3">
              <button
                onClick={() => setIsAddingFixed(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>

              <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                Нов повтарящ се разход
              </h4>

              <div>
                <button
                  onClick={() => setShowFixedCategoryPicker(true)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:border-blue-300 dark:hover:border-blue-500 transition-all text-left"
                >
                  {selectedFixedCategory ? (
                    <span className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-medium">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${getCategoryBadgeClasses(selectedFixedCategory.colorClass)}`}
                      >
                        {ICON_MAP[selectedFixedCategory.iconName] ? (
                          React.createElement(
                            ICON_MAP[selectedFixedCategory.iconName],
                            { className: "w-3.5 h-3.5 text-current" },
                          )
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-current" />
                        )}
                      </span>
                      {selectedFixedCategory.name}
                    </span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">Избери категория (напр. Наем, Застраховка)...</span>
                  )}
                  <Plus className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Бюджетна категория (Budget Category)
                </label>
                <select
                  value={selectedFixedBudgetCategoryId}
                  onChange={(e) => setSelectedFixedBudgetCategoryId(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Автоматично по категория --</option>
                  <option value="none">-- Без бюджетна категория (No Budget) --</option>
                  {budgetCategories.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.categoryName} (Лимит: €{b.monthlyLimit.toFixed(0)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {!fixedCompleted ? "Очаквана дата" : "Дата / Очаквана дата"}
                </label>
                <input
                  type="date"
                  value={fixedDate}
                  onChange={(e) => setFixedDate(e.target.value)}
                  className="w-full px-3 py-2 min-h-[44px] sm:min-h-[38px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={fixedAmount}
                  onChange={(e) => setFixedAmount(sanitizeDecimalInput(e.target.value))}
                  placeholder="Сума €"
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  onClick={handleAddFixedExpense}
                  disabled={
                    !selectedFixedCategory ||
                    !fixedAmount ||
                    isNaN(parseDecimalInput(fixedAmount)) ||
                    parseDecimalInput(fixedAmount) <= 0
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  Добави
                </button>
              </div>

              <RecurrenceCompletionRows
                repeat={fixedRepeat}
                onRepeatChange={setFixedRepeat}
                completed={fixedCompleted}
                onCompletedChange={setFixedCompleted}
              />
            </div>
          )}

          {/* Fixed Expenses List */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {fixedExpenses.map((item) => {
              const isEditing = editingFixedId === item.id;

              if (isEditing) {
                return (
                  <div
                    key={item.id}
                    id={`expense-record-${item.id}`}
                    className="p-4 bg-blue-50/60 dark:bg-blue-950/30 border-l-4 border-blue-500 space-y-3 animate-in fade-in duration-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                        Редактиране на повтарящ се разход
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelEditFixed}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                        title="Отказ"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                          Категория на разхода
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowEditFixedCategoryPicker(true)}
                          className="w-full flex items-center justify-between px-3 py-2 min-h-[42px] sm:min-h-[38px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:border-blue-400 dark:hover:border-blue-500 transition-all text-left text-sm cursor-pointer"
                        >
                          {editFixedCategory ? (
                            <span className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-medium min-w-0">
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${getCategoryBadgeClasses(editFixedCategory.colorClass)}`}
                              >
                                {editFixedCategory.iconName && ICON_MAP[editFixedCategory.iconName] ? (
                                  React.createElement(ICON_MAP[editFixedCategory.iconName], {
                                    className: "w-3 h-3 text-current",
                                  })
                                ) : (
                                  <span className="w-2 h-2 rounded-full bg-current" />
                                )}
                              </span>
                              <span className="truncate">{editFixedCategory.name}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">
                              Избери категория...
                            </span>
                          )}
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        </button>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                          Сума (€)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editFixedAmount}
                          onChange={(e) => setEditFixedAmount(sanitizeDecimalInput(e.target.value))}
                          className="w-full px-3 py-2 min-h-[42px] sm:min-h-[38px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800 dark:text-white tabular-nums"
                          placeholder="Сума €"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1 flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          Бюджетна категория (Budget Category)
                        </label>
                        <select
                          value={editFixedBudgetCategoryId}
                          onChange={(e) => setEditFixedBudgetCategoryId(e.target.value)}
                          className="w-full px-3 py-2 min-h-[42px] sm:min-h-[38px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">-- Автоматично по категория --</option>
                          <option value="none">-- Без бюджетна категория (No Budget) --</option>
                          {budgetCategories.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.categoryName} (Лимит: €{b.monthlyLimit.toFixed(0)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                          {!editFixedCompleted ? "Очаквана дата" : "Дата / Очаквана дата"}
                        </label>
                        <input
                          type="date"
                          value={editFixedDate}
                          onChange={(e) => setEditFixedDate(e.target.value)}
                          className="w-full px-3 py-2 min-h-[42px] sm:min-h-[38px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                        Име / Описание на разхода
                      </label>
                      <input
                        type="text"
                        value={editFixedName}
                        onChange={(e) => setEditFixedName(e.target.value)}
                        className="w-full px-3 py-2 min-h-[40px] sm:min-h-[36px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="напр. Телефон, Наем, Застраховка"
                      />
                    </div>

                    <RecurrenceCompletionRows
                      repeat={editFixedRepeat}
                      onRepeatChange={setEditFixedRepeat}
                      completed={editFixedCompleted}
                      onCompletedChange={setEditFixedCompleted}
                      completedHint={
                        editFixedIsGenerated
                          ? "Автоматично генериран повтарящ се запис"
                          : undefined
                      }
                    />

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCancelEditFixed}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        Отказ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEditFixed(item.id)}
                        disabled={
                          !editFixedAmount ||
                          isNaN(parseDecimalInput(editFixedAmount)) ||
                          parseDecimalInput(editFixedAmount) < 0
                        }
                        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Запази
                      </button>
                    </div>
                  </div>
                );
              }

              const isPlanned = isPlannedExpense(item);
              const budgetLabel = resolveDisplayBudgetName(item);
              const dateKey = resolveRecordDateKey(item, currentMonth);
              const formattedDate = parseLocalDateKey(dateKey).toLocaleDateString("bg-BG");
              const repeatLabel =
                item.repeat && item.repeat !== "never"
                  ? formatRepeatLabel(item.repeat)
                  : "Периодичен";

              return (
                <div
                  key={item.id}
                  id={`expense-record-${item.id}`}
                  className={`px-3 py-2.5 sm:px-4 sm:py-3 group transition-colors ${
                    isPlanned
                      ? "bg-amber-50/45 dark:bg-amber-950/20 hover:bg-amber-50/75 dark:hover:bg-amber-950/30"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  {/* Row 1: Category Icon + Title (+ Planned indicator) | Amount (+ Desktop actions) */}
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${getCategoryBadgeClasses(item.categoryColor)}`}
                      >
                        {(() => {
                          const fixedIcon = resolveCategoryDisplayIcon(
                            item.categoryIcon,
                            item.categoryName
                          );
                          return fixedIcon && ICON_MAP[fixedIcon] ? (
                            React.createElement(ICON_MAP[fixedIcon], {
                              className: "w-4 h-4 text-current",
                            })
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-current" />
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate"
                          title={item.categoryName}
                        >
                          {item.categoryName}
                        </span>
                        {isPlanned && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-amber-100/90 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded-md border border-amber-200/80 dark:border-amber-800 shrink-0">
                            <Clock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                            <span>Предстоящ</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <span
                        className={`font-bold text-sm sm:text-base tabular-nums ${
                          isPlanned
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-slate-900 dark:text-white"
                        }`}
                      >
                        €{item.amount.toFixed(2)}
                      </span>
                      <div className="hidden sm:flex items-center gap-1">
                        <CompletionSwitch
                          checked={!isPlanned}
                          onChange={(val) => handleToggleFixedCompletion(item.id, val)}
                          ariaLabel={`Изпълнено за ${item.categoryName}`}
                          size="sm"
                        />
                        <button
                          onClick={() => handleStartEditFixed(item)}
                          className="min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Редактирай"
                          aria-label="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setPendingDeleteFixed(item)}
                          className="min-h-[32px] min-w-[32px] flex items-center justify-center text-slate-400 hover:text-red-500 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Изтрий"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Clean Inline Metadata (Zero Duplication) + Compact Mobile Actions */}
                  <div className="flex items-center justify-between gap-2 mt-1 pl-[42px] sm:pl-[46px]">
                    <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 min-w-0 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400 whitespace-nowrap shrink-0">
                        <Repeat className="w-3 h-3 shrink-0" />
                        <span>{repeatLabel}</span>
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      {isPlanned && onOpenCalendar ? (
                        <button
                          type="button"
                          onClick={() => onOpenCalendar(dateKey)}
                          className="inline-flex items-center gap-1 font-semibold text-amber-800 dark:text-amber-300 hover:underline cursor-pointer tabular-nums shrink-0"
                          title="Отвори датата в Календар"
                        >
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          <span>{formattedDate}</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 tabular-nums shrink-0">
                          <CalendarDays className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{formattedDate}</span>
                        </span>
                      )}
                      {budgetLabel && (
                        <>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                            ·
                          </span>
                          <span
                            className="inline-flex items-center gap-1 min-w-0 max-w-[140px] sm:max-w-[190px] text-emerald-700 dark:text-emerald-400 font-medium"
                            title={`Бюджет: ${budgetLabel}`}
                          >
                            <Target className="w-3 h-3 shrink-0" />
                            <span className="truncate">{budgetLabel}</span>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Compact Mobile Action Row */}
                    <div className="flex sm:hidden items-center gap-0.5 shrink-0">
                      <CompletionSwitch
                        checked={!isPlanned}
                        onChange={(val) => handleToggleFixedCompletion(item.id, val)}
                        ariaLabel={`Изпълнено за ${item.categoryName}`}
                        size="sm"
                      />
                      <button
                        onClick={() => handleStartEditFixed(item)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Редактирай"
                        aria-label="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPendingDeleteFixed(item)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-red-500 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Изтрий"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {fixedExpenses.length === 0 && (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm italic">
                Няма добавени повтарящи се разходи
              </div>
            )}
          </div>
        </div>
      )}

        {/* Right Column: Variable Expenses List (or Full-Width Explorer) */}
        <div className={isFullWidthMode ? "space-y-4 col-span-full" : "space-y-4"}>
          {isFullWidthMode && (
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center justify-between text-indigo-900 dark:text-indigo-200 text-xs">
              <span className="font-semibold">
                Разширен режим на цял екран за търсене и преглед на разходите
              </span>
              <button
                onClick={() => setIsFullWidthMode(false)}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-bold rounded-lg border border-indigo-200 dark:border-indigo-700 transition-colors shadow-xs"
              >
                Обратно към стандартен изглед
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-700 dark:text-slate-200">Допълнителни разходи</h3>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium">
                {expenses.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                  €{totalVariable.toFixed(2)}
                </span>
                {totalPlannedVariable > 0 && (
                  <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                    Предстоящи: €{totalPlannedVariable.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Smart Search, Filters & Sorting Toolbar */}
          <ExpenseFilterToolbar
            filters={expenseFilters}
            onChangeFilters={(newFilters) => {
              setExpenseFilters(newFilters);
              setCurrentPage(1);
            }}
            availableMonths={recordedMonthKeys}
            currentMonth={currentMonth}
            categories={categories}
            budgetCategories={budgetCategories}
            totalResultsCount={filteredExpenses.length}
            totalFilteredSum={totalFilteredSum}
            totalFilteredPlannedSum={totalFilteredPlannedSum}
            isFullWidthMode={isFullWidthMode}
            onToggleFullWidthMode={() => setIsFullWidthMode((prev) => !prev)}
          />

          {/* Expenses List */}
          <div className="space-y-3">
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 space-y-2">
                <Search className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {expenses.length === 0
                    ? "Няма добавени разходи"
                    : "Няма намерени разходи, отговарящи на филтрите"}
                </p>
                {(expenseFilters.searchTerm ||
                  expenseFilters.monthFilter !== "current" ||
                  expenseFilters.categoryId !== "all" ||
                  expenseFilters.budgetCategoryId !== "all" ||
                  expenseFilters.minAmount !== "" ||
                  expenseFilters.maxAmount !== "" ||
                  expenseFilters.includeFixed ||
                  expenseFilters.statusFilter !== "all") && (
                  <button
                    onClick={() => {
                      setExpenseFilters(DEFAULT_FILTERS);
                      setCurrentPage(1);
                    }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold underline"
                  >
                    Изчисти филтрите и търсенето
                  </button>
                )}
              </div>
            ) : (
              paginatedExpenses.map((expense) => {
                const isEditing = editingExpenseId === expense.id;

                if (isEditing) {
                  return (
                    <div
                      key={expense.id}
                      id={`expense-record-${expense.id}`}
                      className="p-4 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border-l-4 border-indigo-500 border border-indigo-100 dark:border-indigo-900/60 space-y-3 animate-in fade-in duration-200"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wide truncate pr-2">
                          Редактиране на разход: {editExpenseCategory?.name || expense.categoryName}
                        </span>
                        <button
                          type="button"
                          onClick={handleCancelEditExpense}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 shrink-0"
                          title="Отказ"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                            Категория на разхода
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowEditExpenseCategoryPicker(true)}
                            className="w-full flex items-center justify-between px-3 py-2 min-h-[44px] sm:min-h-[40px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:border-indigo-400 dark:hover:border-indigo-500 transition-all text-left text-sm cursor-pointer"
                          >
                            {editExpenseCategory ? (
                              <span className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-medium min-w-0">
                                <span
                                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${getCategoryBadgeClasses(editExpenseCategory.colorClass)}`}
                                >
                                  {editExpenseCategory.iconName &&
                                  ICON_MAP[editExpenseCategory.iconName] ? (
                                    React.createElement(
                                      ICON_MAP[editExpenseCategory.iconName],
                                      { className: "w-3 h-3 text-current" },
                                    )
                                  ) : (
                                    <span className="w-2 h-2 rounded-full bg-current" />
                                  )}
                                </span>
                                <span className="truncate">{editExpenseCategory.name}</span>
                              </span>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">
                                Избери категория...
                              </span>
                            )}
                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          </button>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                            Сума (€)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editExpenseAmount}
                            onChange={(e) =>
                              setEditExpenseAmount(sanitizeDecimalInput(e.target.value))
                            }
                            className="w-full px-3 py-2 min-h-[44px] sm:min-h-[40px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-semibold tabular-nums"
                            placeholder="Сума €"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                          Бележка / Артикули
                        </label>
                        <textarea
                          rows={2}
                          value={editExpenseNote}
                          onChange={(e) => setEditExpenseNote(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-xs sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                          placeholder="Бележка или артикули..."
                        />
                      </div>

                      {/* Expected Date & Independent Budget Category Selector in Edit Expense */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                            {!editExpenseCompleted ? "Очаквана дата" : "Дата / Очаквана дата"}
                          </label>
                          <input
                            type="date"
                            value={editExpenseDate}
                            onChange={(e) => setEditExpenseDate(e.target.value)}
                            className="w-full px-3 py-2 min-h-[44px] sm:min-h-[40px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1 flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            Бюджетна категория (Budget Category)
                          </label>
                          <select
                            value={editExpenseBudgetCategoryId}
                            onChange={(e) => setEditExpenseBudgetCategoryId(e.target.value)}
                            className="w-full px-3 py-2 min-h-[44px] sm:min-h-[40px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">-- Автоматично по категория --</option>
                            <option value="none">-- Без бюджетна категория (No Budget) --</option>
                            {budgetCategories.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.categoryName} (Лимит: €{b.monthlyLimit.toFixed(0)})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <RecurrenceCompletionRows
                        repeat={editExpenseRepeat}
                        onRepeatChange={setEditExpenseRepeat}
                        completed={editExpenseCompleted}
                        onCompletedChange={setEditExpenseCompleted}
                        completedHint={
                          editExpenseIsGenerated
                            ? "Автоматично генериран повтарящ се запис"
                            : undefined
                        }
                      />

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleCancelEditExpense}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          Отказ
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEditExpense(expense.id)}
                          disabled={
                            !editExpenseAmount ||
                            isNaN(parseDecimalInput(editExpenseAmount)) ||
                            parseDecimalInput(editExpenseAmount) < 0
                          }
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Запази
                        </button>
                      </div>
                    </div>
                  );
                }

                // Parse receipt details (merchant name, structured items, legacy notes)
                const parsedReceipt = parseExpenseNote(
                  expense.note,
                  expense.merchantName,
                  expense.receiptItems
                );
                const hasReceiptItems = parsedReceipt.items && parsedReceipt.items.length > 0;
                const isExpanded =
                  expandedExpenseIds.has(expense.id) || parsedReceipt.items.length <= 2;

                const isPlanned = isPlannedExpense(expense);
                const expenseBudgetLabel = resolveDisplayBudgetName(expense);
                const hasRepeatFrequency =
                  (expense.repeat && expense.repeat !== "never") || expense.isRecurring;

                return (
                  <div
                    key={expense.id}
                    id={`expense-record-${expense.id}`}
                    className={`group rounded-xl shadow-xs border transition-all p-3 sm:p-4 space-y-2 ${
                      isPlanned
                        ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-300/80 dark:border-amber-800/70 hover:shadow-md"
                        : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:shadow-md dark:hover:bg-slate-800/70"
                    }`}
                  >
                    {/* Top Row: Category Icon & Badges (Left) + Amount & Actions (Right) */}
                    <div className="flex items-start justify-between gap-2.5">
                      {/* Left: Category Icon + Category Name + Clean Metadata */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${getCategoryBadgeClasses(expense.categoryColor)}`}
                        >
                          {(() => {
                            const expIcon = resolveCategoryDisplayIcon(
                              expense.categoryIcon,
                              expense.categoryName
                            );
                            return expIcon && ICON_MAP[expIcon] ? (
                              React.createElement(ICON_MAP[expIcon], {
                                className: "w-4 h-4 sm:w-5 sm:h-5 text-current",
                              })
                            ) : (
                              <div className="w-2.5 h-2.5 rounded-full bg-current" />
                            );
                          })()}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Category Name & Constrained Status/Budget Info */}
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate max-w-full">
                              {expense.categoryName}
                            </p>

                            {/* Planned Status Indicator */}
                            {isPlanned && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 shrink-0">
                                <Clock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                Предстоящ
                              </span>
                            )}

                            {/* Budget Category Badge (Strictly Constrained with Ellipsis) */}
                            {expenseBudgetLabel && (
                              <span
                                className="inline-flex items-center gap-1 min-w-0 max-w-[165px] sm:max-w-[225px] text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800"
                                title={`Бюджет: ${expenseBudgetLabel}`}
                              >
                                <Target className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="truncate">{expenseBudgetLabel}</span>
                              </span>
                            )}

                            {/* Source Month Badge if from another month */}
                            {expense.sourceMonth &&
                              expense.sourceMonth !== currentMonth && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 shrink-0">
                                  <Calendar className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                                  {expense.sourceMonth}
                                </span>
                              )}

                            {/* Repeat indicator (no duplicate "Повтарящ се" + "Месечно") */}
                            {hasRepeatFrequency ? (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap shrink-0"
                                title="Повтарящ се разход"
                              >
                                <Repeat className="w-3 h-3 shrink-0" />
                                {expense.repeat && expense.repeat !== "never"
                                  ? formatRepeatLabel(expense.repeat)
                                  : "Периодичен"}
                              </span>
                            ) : expense.isFixedItem ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                                Повтарящ се
                              </span>
                            ) : null}
                          </div>

                          {/* Date */}
                          {(() => {
                            const dateKey = resolveRecordDateKey(
                              expense,
                              expense.sourceMonth || currentMonth
                            );
                            const formatted = parseLocalDateKey(dateKey).toLocaleDateString("bg-BG");
                            if (isPlanned && onOpenCalendar) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => onOpenCalendar(dateKey)}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:underline cursor-pointer tabular-nums"
                                  title="Отвори датата в Календар"
                                >
                                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                                  <span>Очаквана дата: {formatted}</span>
                                </button>
                              );
                            }
                            return (
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-400">
                                <Calendar className="w-3.5 h-3.5 shrink-0" />
                                <span className="tabular-nums">{formatted}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Right: Amount & Actions */}
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <span
                          className={`font-extrabold mr-1 text-base sm:text-lg tabular-nums ${
                            isPlanned
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-slate-900 dark:text-white"
                          }`}
                        >
                          €{expense.amount.toFixed(2)}
                        </span>
                        <CompletionSwitch
                          checked={!isPlanned}
                          onChange={(val) => handleToggleExpenseCompletion(expense, val)}
                          ariaLabel={`Изпълнено за ${expense.categoryName}`}
                          size="sm"
                        />
                        <button
                          onClick={() => handleStartEditExpense(expense)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Редактирай"
                          aria-label="Редактирай"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setPendingDeleteExpenseItem(expense)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Изтрий"
                          aria-label="Изтрий"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Merchant Name Section (Prominently displayed) */}
                    {parsedReceipt.merchantName && (
                      <div className="pl-0 sm:pl-13">
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-800/80 max-w-full">
                          <Store className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="truncate uppercase tracking-wide">
                            {parsedReceipt.merchantName}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Receipt Items (Structured, Collapsible Details, Vertical list) */}
                    {hasReceiptItems && (
                      <div className="pl-0 sm:pl-13">
                        <div className="p-3 bg-slate-50/80 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                              <Receipt className="w-3.5 h-3.5 text-indigo-500" />
                              Артикули ({parsedReceipt.items.length})
                            </span>
                            {parsedReceipt.items.length > 2 && (
                              <button
                                type="button"
                                onClick={() => toggleExpandExpense(expense.id)}
                                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold inline-flex items-center gap-1 text-xs py-0.5 px-1.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                              >
                                {isExpanded ? (
                                  <>
                                    <span>Скрий детайли</span>
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  </>
                                ) : (
                                  <>
                                    <span>Виж детайли</span>
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          {isExpanded ? (
                            <ul className="space-y-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                              {parsedReceipt.items.map((item, idx) => {
                                const curSym = parsedReceipt.currencySymbol || "€";
                                const fmtItemPrice = (val: number) =>
                                  curSym === "$" || curSym === "€" || curSym === "£"
                                    ? `${curSym}${val.toFixed(2)}`
                                    : `${val.toFixed(2)} ${curSym}`;
                                const netPrice = item.finalPrice ?? item.price;
                                const hasDisc =
                                  Boolean(item.discount && item.discount > 0 && item.originalPrice !== undefined);
                                return (
                                  <li
                                    key={idx}
                                    className="flex items-start justify-between gap-3 text-slate-700 dark:text-slate-300 py-0.5"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span className="block break-words leading-tight">
                                        • {item.quantity && item.quantity >= 1 ? `${item.quantity} x ` : ""}
                                        {item.name}
                                      </span>
                                      {hasDisc && item.originalPrice !== undefined && item.discount !== undefined && (
                                        <div className="mt-0.5 pl-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
                                          <span className="text-slate-400 dark:text-slate-500 line-through">
                                            {fmtItemPrice(item.originalPrice)}
                                          </span>
                                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                            -{fmtItemPrice(item.discount)} {item.discountLabel || "Отстъпка"}
                                          </span>
                                          <span className="text-slate-600 dark:text-slate-300 font-medium">
                                            Final: {fmtItemPrice(netPrice)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-right shrink-0 font-mono tabular-nums">
                                      {hasDisc && item.originalPrice !== undefined && (
                                        <span className="block text-[10px] text-slate-400 dark:text-slate-500 line-through leading-none mb-0.5">
                                          {fmtItemPrice(item.originalPrice)}
                                        </span>
                                      )}
                                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                                        {fmtItemPrice(netPrice)}
                                      </span>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                              • {parsedReceipt.items[0].quantity && parsedReceipt.items[0].quantity >= 1 ? `${parsedReceipt.items[0].quantity} x ` : ""}{parsedReceipt.items[0].name} (
                              {parsedReceipt.currencySymbol === "$" ||
                              parsedReceipt.currencySymbol === "€" ||
                              parsedReceipt.currencySymbol === "£"
                                ? `${parsedReceipt.currencySymbol}${(parsedReceipt.items[0].finalPrice ?? parsedReceipt.items[0].price).toFixed(2)}`
                                : `${(parsedReceipt.items[0].finalPrice ?? parsedReceipt.items[0].price).toFixed(2)} ${parsedReceipt.currencySymbol || "€"}`}
                              ) … и още {parsedReceipt.items.length - 1} артикула
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Standard Note (when no receipt items exist) */}
                    {!hasReceiptItems && parsedReceipt.plainNote && (
                      <div className="pl-0 sm:pl-13 text-xs text-slate-600 dark:text-slate-400 italic break-words leading-relaxed">
                        {parsedReceipt.plainNote}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Pagination Controls for Large Datasets */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Показване на {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filteredExpenses.length)} от{" "}
                  {filteredExpenses.length} разхода
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Предишна страница"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold px-2 text-slate-700 dark:text-slate-200">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Следваща страница"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modals */}
      <ConfirmDeleteDialog
        isOpen={Boolean(pendingDeleteFixed)}
        detailLabel={
          pendingDeleteFixed
            ? `${pendingDeleteFixed.categoryName} (€${pendingDeleteFixed.amount.toFixed(2)})`
            : undefined
        }
        onCancel={() => setPendingDeleteFixed(null)}
        onConfirm={() => {
          if (pendingDeleteFixed) {
            handleDeleteFixedExpense(pendingDeleteFixed.id);
            setPendingDeleteFixed(null);
          }
        }}
      />

      <ConfirmDeleteDialog
        isOpen={Boolean(pendingDeleteExpenseItem)}
        detailLabel={
          pendingDeleteExpenseItem
            ? `${pendingDeleteExpenseItem.merchantName || pendingDeleteExpenseItem.categoryName} (€${pendingDeleteExpenseItem.amount.toFixed(2)})`
            : undefined
        }
        onCancel={() => setPendingDeleteExpenseItem(null)}
        onConfirm={() => {
          if (pendingDeleteExpenseItem) {
            handleDeleteExpenseItem(pendingDeleteExpenseItem);
            setPendingDeleteExpenseItem(null);
          }
        }}
      />

      {/* Scan Receipt Modal */}
      <ScanReceiptModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        categories={categories}
        currentMonth={currentMonth}
        onExpenseCreated={handleExpenseFromReceipt}
      />

      {/* Category Pickers Modals */}
      {showCategoryPicker && (
        <CategoryPicker
          categories={categories}
          onSelect={handleSelectCategory}
          onClose={() => setShowCategoryPicker(false)}
          onAddNewCategory={handleAddNewCategory}
          onCategoriesChanged={handleCategoriesChanged}
        />
      )}

      {showFixedCategoryPicker && (
        <CategoryPicker
          categories={categories}
          onSelect={handleSelectFixedCategory}
          onClose={() => setShowFixedCategoryPicker(false)}
          onAddNewCategory={(newCat) => {
            handleCategoriesChanged(loadStoredCategories());
            handleSelectFixedCategory(newCat);
          }}
          onCategoriesChanged={handleCategoriesChanged}
        />
      )}

      {showEditExpenseCategoryPicker && (
        <CategoryPicker
          categories={categories}
          onSelect={(cat) => {
            setEditExpenseCategory(cat);
            setShowEditExpenseCategoryPicker(false);
          }}
          onClose={() => setShowEditExpenseCategoryPicker(false)}
          onAddNewCategory={(newCat) => {
            handleCategoriesChanged(loadStoredCategories());
            setEditExpenseCategory(newCat);
            setShowEditExpenseCategoryPicker(false);
          }}
          onCategoriesChanged={handleCategoriesChanged}
        />
      )}

      {showEditFixedCategoryPicker && (
        <CategoryPicker
          categories={categories}
          onSelect={(cat) => {
            setEditFixedCategory(cat);
            setEditFixedName(cat.name);
            setShowEditFixedCategoryPicker(false);
          }}
          onClose={() => setShowEditFixedCategoryPicker(false)}
          onAddNewCategory={(newCat) => {
            handleCategoriesChanged(loadStoredCategories());
            setEditFixedCategory(newCat);
            setEditFixedName(newCat.name);
            setShowEditFixedCategoryPicker(false);
          }}
          onCategoriesChanged={handleCategoriesChanged}
        />
      )}
    </div>
  );
};
