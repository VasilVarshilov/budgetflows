import React, { useState, useEffect, useRef } from "react";
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
  Shield,
} from "lucide-react";
import { ExpenseCategory, ExpenseItem } from "@/types";
import { InputGroup } from "@/components/ui/InputGroup";
import { CategoryPicker } from "@/components/ui/CategoryPicker";

// Map за lucide-react иконките (използва се по iconName)
const ICON_MAP: Record<string, any> = {
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
  CreditCard,
  Phone,
  Wifi,
  Home,
  RefreshCw,
  Shield,
};

// Fixed Default Values in EUR
const DEFAULT_CREDIT_EUR = 353.69;
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
  onSaveExpenses: (data: any) => void;
  initialData?: any;
}

export const MonthlyExpensesTab: React.FC<MonthlyExpensesTabProps> = ({
  currentMonth,
  onSaveExpenses,
  initialData,
}) => {
  // Initialize Fixed Expenses
  const [fixedExpenses, setFixedExpenses] = useState<ExpenseItem[]>(() => {
    const savedFixed = initialData?.expenses?.fixed_expenses;

    // 1. If it's an array (new format), use it
    if (Array.isArray(savedFixed) && savedFixed.length > 0) {
      return savedFixed;
    }

    // 2. If it's legacy object format, convert it
    if (savedFixed && !Array.isArray(savedFixed)) {
      const legacy: ExpenseItem[] = [];
      if (savedFixed.credit_eur)
        legacy.push(
          createFixedItem(
            "Кредит",
            savedFixed.credit_eur,
            "CreditCard",
            "bg-blue-100 text-blue-600",
          ),
        );
      if (savedFixed.phone_eur)
        legacy.push(
          createFixedItem(
            "Телефон",
            savedFixed.phone_eur,
            "Phone",
            "bg-indigo-100 text-indigo-600",
          ),
        );
      if (savedFixed.internet_eur)
        legacy.push(
          createFixedItem(
            "Интернет",
            savedFixed.internet_eur,
            "Wifi",
            "bg-cyan-100 text-cyan-600",
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
      ),
      createFixedItem(
        "Телефон",
        DEFAULT_PHONE_EUR,
        "Phone",
        "bg-indigo-100 text-indigo-600",
      ),
      createFixedItem(
        "Интернет",
        DEFAULT_INTERNET_EUR,
        "Wifi",
        "bg-cyan-100 text-cyan-600",
      ),
    ];
  });

  // Initialize Variable Expenses
  const [expenses, setExpenses] = useState<ExpenseItem[]>(
    () => initialData?.expenses?.additional_expenses || [],
  );

  // UI State
  const [categories, setCategories] = useState<ExpenseCategory[]>(
    PREDEFINED_CATEGORIES,
  );

  // Add Expense Form State
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  // Add Fixed Expense Form State
  const [isAddingFixed, setIsAddingFixed] = useState(false);
  const [showFixedCategoryPicker, setShowFixedCategoryPicker] = useState(false);
  const [selectedFixedCategory, setSelectedFixedCategory] =
    useState<ExpenseCategory | null>(null);
  const [fixedAmount, setFixedAmount] = useState("");

  // Refs to track previous values to avoid infinite save loops
  const prevDataRef = useRef<string>("");

  // Helper to create fixed item
  function createFixedItem(
    name: string,
    amount: number,
    icon: string,
    color: string,
  ): ExpenseItem {
    return {
      id: `fix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      categoryId: name.toLowerCase(),
      categoryName: name,
      categoryIcon: icon,
      categoryColor: color,
      amount: amount,
      date: new Date().toISOString(),
    };
  }

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
      onSaveExpenses(dataToSave);
    }
  }, [fixedExpenses, expenses, onSaveExpenses, initialData]);

  // --- Handlers for Variable Expenses ---

  const handleAddNewCategory = (name: string) => {
    const newCat: ExpenseCategory = {
      id: `custom_${Date.now()}`,
      name,
      iconName: "CircleHelp",
      colorClass: "bg-slate-100 text-slate-500",
      isCustom: true,
    };
    setCategories((prev) => [...prev, newCat]);
    handleSelectCategory(newCat);
  };

  const handleSelectCategory = (cat: ExpenseCategory) => {
    setSelectedCategory(cat);
    setShowCategoryPicker(false);
  };

  const handleAddExpense = () => {
    if (!selectedCategory || !amount) return;

    const newExpense: ExpenseItem = {
      id: Date.now().toString(),
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      categoryIcon: selectedCategory.iconName,
      categoryColor: selectedCategory.colorClass,
      amount: parseFloat(amount),
      note: note,
      date: new Date().toISOString(),
    };

    setExpenses((prev) => [...prev, newExpense]);

    // Reset form
    setIsAddingExpense(false);
    setSelectedCategory(null);
    setAmount("");
    setNote("");
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  // --- Handlers for Fixed Expenses ---

  const handleAddNewFixedCategory = (name: string) => {
    // Since FIXED_CATEGORIES is a constant, we can't update it directly.
    // Instead, we can create a temporary category object just for selection.
    // In a real app, you might want to persist custom categories too.
    const newCat: ExpenseCategory = {
      id: `custom_fixed_${Date.now()}`,
      name,
      iconName: "CreditCard", // Default icon for custom fixed expenses
      colorClass: "bg-slate-100 text-slate-500",
      isCustom: true,
    };

    // Select it immediately
    handleSelectFixedCategory(newCat);
  };

  const handleSelectFixedCategory = (cat: ExpenseCategory) => {
    setSelectedFixedCategory(cat);
    setShowFixedCategoryPicker(false);
  };

  const handleAddFixedExpense = () => {
    if (!selectedFixedCategory || !fixedAmount) return;

    const newFixed: ExpenseItem = {
      id: `fix_${Date.now()}`,
      categoryId: selectedFixedCategory.id,
      categoryName: selectedFixedCategory.name,
      categoryIcon: selectedFixedCategory.iconName,
      categoryColor: selectedFixedCategory.colorClass,
      amount: parseFloat(fixedAmount),
      date: new Date().toISOString(),
    };

    setFixedExpenses((prev) => [...prev, newFixed]);

    // Reset form
    setIsAddingFixed(false);
    setSelectedFixedCategory(null);
    setFixedAmount("");
  };

  const handleDeleteFixedExpense = (id: string) => {
    setFixedExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const totalFixed = fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totalVariable = expenses.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = totalFixed + totalVariable;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          Месечни разходи
          <span className="text-sm font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-0.5 rounded-full">
            {currentMonth}
          </span>
        </h2>
        <div className="text-right">
          <span className="text-xs text-slate-400 block uppercase tracking-wider">
            Общо
          </span>
          <span className="text-2xl font-bold text-slate-800">
            €{totalExpenses.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Fixed Monthly Expenses */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-500" />
              Фиксирани разходи
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-600">
                €{totalFixed.toFixed(2)}
              </span>
              {!isAddingFixed && (
                <button
                  onClick={() => setIsAddingFixed(true)}
                  className="p-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Add Fixed Expense Form */}
          {isAddingFixed && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 animate-in slide-in-from-top-2 relative">
              <button
                onClick={() => setIsAddingFixed(false)}
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-3">
                Нов фиксиран разход
              </h4>

              <div className="space-y-3">
                <div>
                  <button
                    onClick={() => setShowFixedCategoryPicker(true)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm hover:border-blue-300 transition-all text-left"
                  >
                    {selectedFixedCategory ? (
                      <span className="flex items-center gap-2 text-slate-800 font-medium">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center ${selectedFixedCategory.colorClass}`}
                        >
                          {ICON_MAP[selectedFixedCategory.iconName] ? (
                            React.createElement(
                              ICON_MAP[selectedFixedCategory.iconName],
                              {
                                className: "w-3.5 h-3.5 text-current",
                              },
                            )
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-current" />
                          )}
                        </span>
                        {selectedFixedCategory.name}
                      </span>
                    ) : (
                      <span className="text-slate-400">Избери вид...</span>
                    )}
                    <Plus className="w-3 h-3 text-slate-400" />
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    step="any"
                    value={fixedAmount}
                    onChange={(e) => setFixedAmount(e.target.value)}
                    placeholder="Сума €"
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={handleAddFixedExpense}
                    disabled={!selectedFixedCategory || !fixedAmount}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Fixed Expenses List */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {fixedExpenses.map((item) => (
              <div
                key={item.id}
                className="p-4 flex items-center justify-between hover:bg-slate-50 group transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${item.categoryColor}`}
                  >
                    {item.categoryIcon && ICON_MAP[item.categoryIcon] ? (
                      React.createElement(ICON_MAP[item.categoryIcon], {
                        className: "w-4 h-4 text-current",
                      })
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                    )}
                  </div>
                  <span className="font-medium text-slate-700">
                    {item.categoryName}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-800">
                    €{item.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleDeleteFixedExpense(item.id)}
                    className="text-slate-400 hover:text-red-500 p-2 transition-all"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {fixedExpenses.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm italic">
                Няма добавени фиксирани разходи
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Variable Expenses List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-700">Допълнителни разходи</h3>
            {!isAddingExpense && (
              <button
                onClick={() => setIsAddingExpense(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Добави разход
              </button>
            )}
          </div>

          {/* Add Expense Form Panel */}
          {isAddingExpense && (
            <div className="bg-white p-5 rounded-xl shadow-lg border border-indigo-100 animate-in slide-in-from-top-4 mb-4 relative">
              <button
                onClick={() => setIsAddingExpense(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <h4 className="font-medium text-indigo-900 mb-4">Нов разход</h4>

              <div className="space-y-4">
                {/* Category Selector Trigger */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Категория
                  </label>
                  <button
                    onClick={() => setShowCategoryPicker(true)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-slate-300 rounded-md hover:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all text-left"
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
                    onClick={handleAddExpense}
                    disabled={!selectedCategory || !amount}
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Добави
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Expenses List */}
          <div className="space-y-3">
            {expenses.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl border border-dashed border-slate-200 text-slate-400">
                <p>Няма добавени разходи</p>
              </div>
            ) : (
              expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="group flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${expense.categoryColor}`}
                    >
                      {expense.categoryIcon &&
                      ICON_MAP[expense.categoryIcon] ? (
                        React.createElement(ICON_MAP[expense.categoryIcon], {
                          className: "w-5 h-5 text-current",
                        })
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-current"></div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">
                        {expense.categoryName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(expense.date).toLocaleDateString("bg-BG")}
                      </p>
                      {expense.note && (
                        <p className="text-xs text-slate-500 mt-0.5 italic">
                          {expense.note}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-700">
                      €{expense.amount.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleDeleteExpense(expense.id)}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Category Pickers Modals */}
      {showCategoryPicker && (
        <CategoryPicker
          categories={categories}
          onSelect={handleSelectCategory}
          onClose={() => setShowCategoryPicker(false)}
          onAddNewCategory={handleAddNewCategory}
        />
      )}

      {showFixedCategoryPicker && (
        <CategoryPicker
          categories={FIXED_CATEGORIES}
          onSelect={handleSelectFixedCategory}
          onClose={() => setShowFixedCategoryPicker(false)}
          onAddNewCategory={handleAddNewFixedCategory}
        />
      )}
    </div>
  );
};
