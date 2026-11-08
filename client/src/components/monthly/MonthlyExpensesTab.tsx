import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus,
  Trash2,
  Wallet,
  Phone,
  Wifi,
  Calendar,
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
  CarTaxiFront,
  ShoppingBag,
  CircleHelp,
  RefreshCw,
  Repeat,
  Shield,
  Pencil,
  Check,
  X,
  ChevronDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
} from "lucide-react";
import { ExpenseCategory, ExpenseItem, MonthlyRecord } from "@/types";
import { InputGroup } from "@/components/ui/InputGroup";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { ImportRecurringModal } from "@/components/monthly/ImportRecurringModal";
import {
  AVAILABLE_ICONS_MAP,
  loadStoredCategories,
} from "@/utils/categoryStorage";
import {
  ExpenseFilterToolbar,
  ExpenseFiltersState,
  DEFAULT_FILTERS,
} from "@/components/monthly/ExpenseFilterToolbar";

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
    iconName: "CarTaxiFront",
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
}

export const MonthlyExpensesTab: React.FC<MonthlyExpensesTabProps> = ({
  currentMonth,
  onSaveExpenses,
  initialData,
  allMonthlyData = {},
  onMonthChange,
}) => {
  // Helper to create fixed item
  function createFixedItem(
    name: string,
    amount: number,
    icon: string,
    color: string,
    isRecurring: boolean = true,
  ): ExpenseItem {
    return {
      id: `fix_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      categoryId: name.toLowerCase(),
      categoryName: name,
      categoryIcon: icon,
      categoryColor: color,
      amount: amount,
      date: new Date().toISOString(),
      isRecurring: isRecurring,
    };
  }

  // Initialize Fixed Expenses
  const [fixedExpenses, setFixedExpenses] = useState<ExpenseItem[]>(() => {
    const savedFixed = initialData?.expenses?.fixed_expenses;

    // 1. If it's an array (new format), use it
    if (Array.isArray(savedFixed) && savedFixed.length > 0) {
      return savedFixed.map((item) => {
        let amount = item.amount;
        if (item.categoryName === "Кредит" && item.amount === 353.69) {
          amount = DEFAULT_CREDIT_EUR;
        }
        return {
          ...item,
          amount,
          isRecurring: item.isRecurring !== undefined ? item.isRecurring : true,
        };
      });
    }

    // 2. If it's legacy object format, convert it
    if (savedFixed && !Array.isArray(savedFixed)) {
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
      return legacy;
    }

    // 3. Defaults if empty
    return [
      createFixedItem(
        "Кредит",
        DEFAULT_CREDIT_EUR,
        "CreditCard",
        "bg-blue-100 text-blue-600",
        true,
      ),
      createFixedItem(
        "Телефон",
        DEFAULT_PHONE_EUR,
        "Phone",
        "bg-indigo-100 text-indigo-600",
        true,
      ),
      createFixedItem(
        "Интернет",
        DEFAULT_INTERNET_EUR,
        "Wifi",
        "bg-cyan-100 text-cyan-600",
        true,
      ),
    ];
  });

  // Initialize Variable Expenses
  const [expenses, setExpenses] = useState<ExpenseItem[]>(
    () => initialData?.expenses?.additional_expenses || [],
  );

  // Sync state if initialData or month changes
  useEffect(() => {
    if (initialData?.expenses) {
      if (Array.isArray(initialData.expenses.fixed_expenses)) {
        setFixedExpenses(
          initialData.expenses.fixed_expenses.map((item: ExpenseItem) => ({
            ...item,
            isRecurring: item.isRecurring !== undefined ? item.isRecurring : true,
          })),
        );
      }
      if (Array.isArray(initialData.expenses.additional_expenses)) {
        setExpenses(initialData.expenses.additional_expenses);
      }
    }
  }, [currentMonth]);

  // UI State - initialized from persistent storage
  const [categories, setCategories] = useState<ExpenseCategory[]>(() =>
    loadStoredCategories(),
  );

  // Sync categories if storage updates
  const handleCategoriesChanged = (updated: ExpenseCategory[]) => {
    setCategories(updated);
  };

  // Add Variable Expense Form State
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isRecurringExpense, setIsRecurringExpense] = useState(false);

  // Edit Variable Expense State
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editExpenseAmount, setEditExpenseAmount] = useState("");
  const [editExpenseNote, setEditExpenseNote] = useState("");
  const [editExpenseRecurring, setEditExpenseRecurring] = useState(false);
  const [editingExpenseSourceMonth, setEditingExpenseSourceMonth] = useState<string | null>(null);
  const [editingExpenseIsFixed, setEditingExpenseIsFixed] = useState(false);

  // --- Smart Search, Filter & Sort State ---
  const [expenseFilters, setExpenseFilters] = useState<ExpenseFiltersState>(DEFAULT_FILTERS);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isFullWidthMode, setIsFullWidthMode] = useState<boolean>(false);
  const PAGE_SIZE = 25; // Optimize for large datasets: 25 items per page

  // Add Fixed Expense Form State
  const [isAddingFixed, setIsAddingFixed] = useState(false);
  const [showFixedCategoryPicker, setShowFixedCategoryPicker] = useState(false);
  const [selectedFixedCategory, setSelectedFixedCategory] =
    useState<ExpenseCategory | null>(null);
  const [fixedAmount, setFixedAmount] = useState("");
  const [isRecurringFixed, setIsRecurringFixed] = useState(true);

  // Edit Fixed Expense State
  const [editingFixedId, setEditingFixedId] = useState<string | null>(null);
  const [editFixedName, setEditFixedName] = useState("");
  const [editFixedAmount, setEditFixedAmount] = useState("");
  const [editFixedRecurring, setEditFixedRecurring] = useState(true);

  // Import Recurring Modal & Notification State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importNotification, setImportNotification] = useState<{
    message: string;
    type: "success" | "info";
  } | null>(null);

  // Refs to track previous values to avoid infinite save loops
  const prevDataRef = useRef<string>("");

  // Persist data when local state changes
  useEffect(() => {
    const dataToSave = {
      saved_em2_eur: initialData?.expenses?.saved_em2_eur || 0,
      fixed_expenses: fixedExpenses,
      additional_expenses: expenses,
    };

    const dataString = JSON.stringify(dataToSave);

    // Only trigger save if data actually changed
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
        (e) => ({ ...e, sourceMonth: currentMonth })
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
        (e) => ({ ...e, sourceMonth: targetMonth })
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
        allItems.push({ ...item, sourceMonth: m });
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
    const minVal = expenseFilters.minAmount !== "" ? parseFloat(expenseFilters.minAmount) : null;
    const maxVal = expenseFilters.maxAmount !== "" ? parseFloat(expenseFilters.maxAmount) : null;
    const isCustomDate = expenseFilters.monthFilter === "custom";
    const startIso = expenseFilters.startDate ? expenseFilters.startDate + "T00:00:00" : null;
    const endIso = expenseFilters.endDate ? expenseFilters.endDate + "T23:59:59" : null;

    return candidateExpenses
      .filter((item) => {
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

        // Filter by Amount Range
        if (minVal !== null && !isNaN(minVal) && item.amount < minVal) {
          return false;
        }
        if (maxVal !== null && !isNaN(maxVal) && item.amount > maxVal) {
          return false;
        }

        // Filter by Custom Date Range
        if (isCustomDate) {
          if (startIso && item.date < startIso) return false;
          if (endIso && item.date > endIso) return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (expenseFilters.sortBy) {
          case "oldest":
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          case "highest":
            return b.amount - a.amount;
          case "lowest":
            return a.amount - b.amount;
          case "newest":
          default:
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
      });
  }, [candidateExpenses, expenseFilters]);

  // Pagination for large dataset optimization
  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedExpenses = useMemo(() => {
    const startIdx = (safePage - 1) * PAGE_SIZE;
    return filteredExpenses.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredExpenses, safePage, PAGE_SIZE]);

  const totalFilteredSum = useMemo(() => {
    return filteredExpenses.reduce((sum, item) => sum + item.amount, 0);
  }, [filteredExpenses]);

  // --- Handlers for Variable Expenses ---

  const handleAddNewCategory = (newCat: ExpenseCategory) => {
    setCategories(loadStoredCategories());
    handleSelectCategory(newCat);
  };

  const handleSelectCategory = (cat: ExpenseCategory) => {
    setSelectedCategory(cat);
    setShowCategoryPicker(false);
  };

  const handleAddExpense = () => {
    if (!selectedCategory || !amount) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const newExpense: ExpenseItem = {
      id: Date.now().toString(),
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      categoryIcon: selectedCategory.iconName,
      categoryColor: selectedCategory.colorClass,
      amount: parsedAmount,
      note: note.trim() || undefined,
      date: new Date().toISOString(),
      isRecurring: isRecurringExpense,
    };

    setExpenses((prev) => [...prev, newExpense]);

    // Reset form
    setIsAddingExpense(false);
    setSelectedCategory(null);
    setAmount("");
    setNote("");
    setIsRecurringExpense(false);
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    if (editingExpenseId === id) {
      setEditingExpenseId(null);
    }
  };

  const handleDeleteExpenseItem = (
    expense: ExpenseItem & { sourceMonth?: string; isFixedItem?: boolean }
  ) => {
    const targetMonth = expense.sourceMonth || currentMonth;

    if (expense.isFixedItem || expense.id.startsWith("fix_")) {
      handleDeleteFixedExpense(expense.id);
    } else if (targetMonth === currentMonth) {
      handleDeleteExpense(expense.id);
    } else {
      const record = allMonthlyData[targetMonth];
      if (record && record.expenses) {
        const updatedAdd = (record.expenses.additional_expenses || []).filter(
          (e) => e.id !== expense.id
        );
        onSaveExpenses(
          {
            ...record.expenses,
            additional_expenses: updatedAdd,
          },
          targetMonth
        );
      }
    }
  };

  const handleStartEditExpense = (
    expense: ExpenseItem & { sourceMonth?: string; isFixedItem?: boolean }
  ) => {
    setEditingExpenseId(expense.id);
    setEditExpenseAmount(expense.amount.toString());
    setEditExpenseNote(expense.note || "");
    setEditExpenseRecurring(!!expense.isRecurring);
    setEditingExpenseSourceMonth(expense.sourceMonth || currentMonth);
    setEditingExpenseIsFixed(!!expense.isFixedItem || expense.id.startsWith("fix_"));
  };

  const handleSaveEditExpense = (id: string) => {
    const val = parseFloat(editExpenseAmount);
    if (isNaN(val) || val < 0) return;

    const targetMonth = editingExpenseSourceMonth || currentMonth;

    if (editingExpenseIsFixed) {
      setFixedExpenses((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                amount: val,
                isRecurring: editExpenseRecurring,
              }
            : item
        )
      );
    } else if (targetMonth === currentMonth) {
      setExpenses((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              amount: val,
              note: editExpenseNote.trim() || undefined,
              isRecurring: editExpenseRecurring,
            };
          }
          return item;
        })
      );
    } else {
      const record = allMonthlyData[targetMonth];
      if (record && record.expenses) {
        const updatedAdd = (record.expenses.additional_expenses || []).map((item) =>
          item.id === id
            ? {
                ...item,
                amount: val,
                note: editExpenseNote.trim() || undefined,
                isRecurring: editExpenseRecurring,
              }
            : item
        );
        onSaveExpenses(
          {
            ...record.expenses,
            additional_expenses: updatedAdd,
          },
          targetMonth
        );
      }
    }
    setEditingExpenseId(null);
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
  };

  const handleAddFixedExpense = () => {
    if (!selectedFixedCategory || !fixedAmount) return;

    const parsed = parseFloat(fixedAmount);
    if (isNaN(parsed) || parsed <= 0) return;

    const newFixed: ExpenseItem = {
      id: `fix_${Date.now()}`,
      categoryId: selectedFixedCategory.id,
      categoryName: selectedFixedCategory.name,
      categoryIcon: selectedFixedCategory.iconName,
      categoryColor: selectedFixedCategory.colorClass,
      amount: parsed,
      date: new Date().toISOString(),
      isRecurring: isRecurringFixed,
    };

    setFixedExpenses((prev) => [...prev, newFixed]);

    // Reset form
    setIsAddingFixed(false);
    setSelectedFixedCategory(null);
    setFixedAmount("");
    setIsRecurringFixed(true);
  };

  const handleDeleteFixedExpense = (id: string) => {
    setFixedExpenses((prev) => prev.filter((e) => e.id !== id));
    if (editingFixedId === id) {
      setEditingFixedId(null);
    }
  };

  const handleStartEditFixed = (item: ExpenseItem) => {
    setEditingFixedId(item.id);
    setEditFixedName(item.categoryName);
    setEditFixedAmount(item.amount.toString());
    setEditFixedRecurring(item.isRecurring !== false);
  };

  const handleSaveEditFixed = (id: string) => {
    const val = parseFloat(editFixedAmount);
    if (isNaN(val) || val < 0) return;

    setFixedExpenses((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            categoryName: editFixedName.trim() || item.categoryName,
            amount: val,
            isRecurring: editFixedRecurring,
          };
        }
        return item;
      }),
    );
    setEditingFixedId(null);
  };

  const handleCancelEditFixed = () => {
    setEditingFixedId(null);
  };

  // --- Import Recurring Handler ---
  const handleConfirmImport = (imported: {
    fixed: ExpenseItem[];
    variable: ExpenseItem[];
  }) => {
    let totalImported = 0;
    let totalSum = 0;

    if (imported.fixed.length > 0) {
      setFixedExpenses((prev) => [...prev, ...imported.fixed]);
      totalImported += imported.fixed.length;
      totalSum += imported.fixed.reduce((sum, item) => sum + item.amount, 0);
    }

    if (imported.variable.length > 0) {
      setExpenses((prev) => [...prev, ...imported.variable]);
      totalImported += imported.variable.length;
      totalSum += imported.variable.reduce((sum, item) => sum + item.amount, 0);
    }

    setImportNotification({
      message: `Успешно импортирани ${totalImported} периодични разхода на обща стойност €${totalSum.toFixed(2)} за месец ${currentMonth}!`,
      type: "success",
    });

    setTimeout(() => {
      setImportNotification(null);
    }, 5000);
  };

  const totalFixed = fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totalVariable = expenses.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = totalFixed + totalVariable;

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
          <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">
            Управлявайте фиксираните и текущи разходи за домакинството
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 self-end sm:self-center">
          {/* Add Expense Button (Moved above fixed expenses) */}
          <button
            onClick={() => setIsAddingExpense((prev) => !prev)}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95"
            title="Добави нов разход"
          >
            <Plus className="w-4 h-4" />
            <span>Добави разход</span>
          </button>

          {/* Import Recurring Expenses Button */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 dark:border-indigo-800 rounded-xl text-xs font-semibold transition-all shadow-sm active:scale-95"
            title="Копирай периодични разходи от предходен месец (Наем, Интернет, Телефон, Застраховка и др.)"
          >
            <Repeat className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden sm:inline">Импорт на периодични разходи</span>
            <span className="sm:hidden">Импорт периодични</span>
          </button>

          <div className="text-right pl-2 border-l border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 block uppercase font-medium tracking-wider">
              Общо разходи
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              €{totalExpenses.toFixed(2)}
            </span>
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

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 dark:text-white text-base">
                Нов допълнителен разход
              </h4>
              <p className="text-xs text-slate-400">
                Въведете текущ или периодичен разход за месеца
              </p>
            </div>
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
                      className={`w-5 h-5 rounded-full flex items-center justify-center ${selectedCategory.colorClass}`}
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
                  <span className="text-slate-400 dark:text-slate-500 text-sm">
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

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Бележка (опционално)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
              placeholder="напр. пазаруване, вечеря, гориво, абонамент..."
            />
          </div>

          {/* Recurring Expense Checkbox */}
          <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/60">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isRecurringExpense}
                onChange={(e) => setIsRecurringExpense(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer mt-0.5"
              />
              <div className="flex-1">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Периодичен разход (Recurring Expense)
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-relaxed">
                  Маркирайте разхода като повтарящ се, за да може да го копирате бързо и без повторно въвеждане в следващите месеци (напр. Наем, Интернет, Мобилен план, Застраховка).
                </span>
              </div>
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleAddExpense}
              disabled={!selectedCategory || !amount}
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
                Фиксирани разходи
              </h3>
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium">
                {fixedExpenses.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                €{totalFixed.toFixed(2)}
              </span>
              {!isAddingFixed && (
                <button
                  onClick={() => setIsAddingFixed(true)}
                  className="p-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors shadow-sm"
                  title="Добави фиксиран разход"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Add Fixed Expense Form */}
          {isAddingFixed && (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-blue-200 dark:border-blue-900/60 animate-in slide-in-from-top-2 relative space-y-3">
              <button
                onClick={() => setIsAddingFixed(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>

              <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                Нов фиксиран разход
              </h4>

              <div>
                <button
                  onClick={() => setShowFixedCategoryPicker(true)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:border-blue-300 dark:hover:border-blue-500 transition-all text-left"
                >
                  {selectedFixedCategory ? (
                    <span className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-medium">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${selectedFixedCategory.colorClass}`}
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
                    <span className="text-slate-400 dark:text-slate-500">Избери категория (напр. Наем, Застраховка)...</span>
                  )}
                  <Plus className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  value={fixedAmount}
                  onChange={(e) => setFixedAmount(e.target.value)}
                  placeholder="Сума €"
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  onClick={handleAddFixedExpense}
                  disabled={!selectedFixedCategory || !fixedAmount}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  Добави
                </button>
              </div>

              {/* Recurring Checkbox for Fixed Expense */}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isRecurringFixed}
                    onChange={(e) => setIsRecurringFixed(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Repeat className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Периодичен разход (Recurring Expense)
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 ml-6">
                  Позволява автоматично копиране в следващите месеци
                </p>
              </div>
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
                    className="p-4 bg-blue-50/60 dark:bg-blue-950/30 border-l-4 border-blue-500 space-y-3 animate-in fade-in duration-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                        Редактиране на фиксиран разход
                      </span>
                      <button
                        onClick={handleCancelEditFixed}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                        title="Отказ"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                          Име
                        </label>
                        <input
                          type="text"
                          value={editFixedName}
                          onChange={(e) => setEditFixedName(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Име на разход"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                          Сума (€)
                        </label>
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={editFixedAmount}
                          onChange={(e) => setEditFixedAmount(e.target.value)}
                          className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800 dark:text-white"
                          placeholder="Сума €"
                        />
                      </div>
                    </div>

                    {/* Checkbox Recurring inside edit fixed */}
                    <div className="pt-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={editFixedRecurring}
                          onChange={(e) =>
                            setEditFixedRecurring(e.target.checked)
                          }
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Repeat className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          Периодичен разход (Recurring Expense)
                        </span>
                      </label>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={handleCancelEditFixed}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        Отказ
                      </button>
                      <button
                        onClick={() => handleSaveEditFixed(item.id)}
                        disabled={!editFixedAmount}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Запази
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className="p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.categoryColor}`}
                    >
                      {item.categoryIcon && ICON_MAP[item.categoryIcon] ? (
                        React.createElement(ICON_MAP[item.categoryIcon], {
                          className: "w-4 h-4 text-current",
                        })
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-current" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                          {item.categoryName}
                        </span>
                        {item.isRecurring !== false && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200/80 dark:border-indigo-800"
                            title="Периодичен разход (копира се при импорт)"
                          >
                            <Repeat className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400" />
                            Периодичен
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Фиксиран месечен
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <span className="font-bold text-slate-800 dark:text-white mr-1 text-sm sm:text-base">
                      €{item.amount.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleStartEditFixed(item)}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-2 sm:p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
                      title="Редактирай"
                      aria-label="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteFixedExpense(item.id)}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center text-slate-400 hover:text-red-500 dark:hover:text-red-400 p-2 sm:p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-slate-800 transition-colors"
                      title="Изтрий"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            {fixedExpenses.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm italic">
                Няма добавени фиксирани разходи
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
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                €{totalVariable.toFixed(2)}
              </span>
              {!isAddingExpense && (
                <button
                  onClick={() => setIsAddingExpense(true)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold transition-colors"
                  title="Добави допълнителен разход"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добави</span>
                </button>
              )}
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
            totalResultsCount={filteredExpenses.length}
            totalFilteredSum={totalFilteredSum}
            isFullWidthMode={isFullWidthMode}
            onToggleFullWidthMode={() => setIsFullWidthMode((prev) => !prev)}
          />

          {/* Expenses List */}
          <div className="space-y-3">
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 space-y-2">
                <Search className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {expenses.length === 0
                    ? "Няма добавени разходи"
                    : "Няма намерени разходи, отговарящи на филтрите"}
                </p>
                {(expenseFilters.searchTerm ||
                  expenseFilters.monthFilter !== "current" ||
                  expenseFilters.categoryId !== "all" ||
                  expenseFilters.minAmount !== "" ||
                  expenseFilters.maxAmount !== "" ||
                  expenseFilters.includeFixed) && (
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
                      className="p-4 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border-l-4 border-indigo-500 border border-indigo-100 dark:border-indigo-900/60 space-y-3 animate-in fade-in duration-200"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wide">
                          Редактиране на разход: {expense.categoryName}
                        </span>
                        <button
                          onClick={handleCancelEditExpense}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                          title="Отказ"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                            Сума (€)
                          </label>
                          <input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            value={editExpenseAmount}
                            onChange={(e) =>
                              setEditExpenseAmount(e.target.value)
                            }
                            className="w-full px-3 py-2 min-h-[44px] sm:min-h-0 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                            placeholder="Сума €"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                            Бележка
                          </label>
                          <input
                            type="text"
                            value={editExpenseNote}
                            onChange={(e) => setEditExpenseNote(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Бележка..."
                          />
                        </div>
                      </div>

                      {/* Recurring Checkbox in Edit Variable */}
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editExpenseRecurring}
                            onChange={(e) =>
                              setEditExpenseRecurring(e.target.checked)
                            }
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <Repeat className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            Периодичен разход (Recurring Expense)
                          </span>
                        </label>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={handleCancelEditExpense}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          Отказ
                        </button>
                        <button
                          onClick={() => handleSaveEditExpense(expense.id)}
                          disabled={!editExpenseAmount}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Запази
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={expense.id}
                    className="group flex items-center justify-between p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md dark:hover:bg-slate-800/40 transition-all"
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${expense.categoryColor}`}
                      >
                        {expense.categoryIcon &&
                        ICON_MAP[expense.categoryIcon] ? (
                          React.createElement(ICON_MAP[expense.categoryIcon], {
                            className: "w-5 h-5 text-current",
                          })
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-current" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                            {expense.categoryName}
                          </p>

                          {/* Source Month Badge if from another month */}
                          {expense.sourceMonth &&
                            expense.sourceMonth !== currentMonth && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                                <Calendar className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                                {expense.sourceMonth}
                              </span>
                            )}

                          {/* Fixed Badge if included from fixed expenses */}
                          {(expense.isFixedItem || expense.id.startsWith("fix_")) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                              Фиксиран
                            </span>
                          )}

                          {expense.isRecurring && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200/80 dark:border-indigo-800"
                              title="Периодичен разход"
                            >
                              <Repeat className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400" />
                              Периодичен
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-400 mt-0.5">
                          <span>
                            {new Date(expense.date).toLocaleDateString("bg-BG")}
                          </span>
                          {expense.note && (
                            <>
                              <span>•</span>
                              <span className="text-slate-600 dark:text-slate-300 italic">
                                {expense.note}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2">
                      <span className="font-bold text-slate-800 dark:text-white mr-1 text-sm sm:text-base">
                        €{expense.amount.toFixed(2)}
                      </span>
                      <button
                        onClick={() => handleStartEditExpense(expense)}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center p-2 sm:p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Редактирай"
                        aria-label="Редактирай"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteExpenseItem(expense)}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center p-2 sm:p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Изтрий"
                        aria-label="Изтрий"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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

      {/* Import Recurring Expenses Confirmation Modal */}
      {isImportModalOpen && (
        <ImportRecurringModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          currentMonth={currentMonth}
          existingFixedExpenses={fixedExpenses}
          existingVariableExpenses={expenses}
          allMonthlyData={allMonthlyData}
          onConfirmImport={handleConfirmImport}
        />
      )}

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
    </div>
  );
};
