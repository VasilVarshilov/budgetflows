import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Wallet, Phone, Wifi, Calendar } from 'lucide-react';
import { ExpenseCategory, ExpenseItem } from '../../types';
import { InputGroup } from '../ui/InputGroup';
import { CategoryPicker } from '../ui/CategoryPicker';

// Fixed Default Values in EUR (No conversion needed)
const DEFAULT_CREDIT_EUR = "353.69";
const DEFAULT_PHONE_EUR = "24.54";
const DEFAULT_INTERNET_EUR = "23.01";

const PREDEFINED_CATEGORIES: ExpenseCategory[] = [
  { id: 'water', name: 'Вода', iconName: 'Droplets', colorClass: 'bg-blue-100 text-blue-500' },
  { id: 'electricity', name: 'Ток', iconName: 'Zap', colorClass: 'bg-yellow-100 text-yellow-600' },
  { id: 'fuel', name: 'Гориво', iconName: 'Fuel', colorClass: 'bg-red-100 text-red-500' },
  { id: 'car', name: 'Кола', iconName: 'Car', colorClass: 'bg-zinc-100 text-zinc-600' },
  { id: 'food', name: 'Храна', iconName: 'Utensils', colorClass: 'bg-orange-100 text-orange-500' },
  { id: 'hair', name: 'Фризьор', iconName: 'Scissors', colorClass: 'bg-purple-100 text-purple-500' },
  { id: 'restaurant', name: 'Ресторант', iconName: 'UtensilsCrossed', colorClass: 'bg-yellow-100 text-yellow-600' },
  { id: 'cinema', name: 'Кино', iconName: 'Film', colorClass: 'bg-indigo-100 text-indigo-500' },
  { id: 'pharmacy', name: 'Аптека', iconName: 'Pill', colorClass: 'bg-emerald-100 text-emerald-600' },
  { id: 'pets', name: 'Домашни любимци', iconName: 'PawPrint', colorClass: 'bg-amber-100 text-amber-600' },
  { id: 'cleaning', name: 'Почистване', iconName: 'Sparkles', colorClass: 'bg-cyan-100 text-cyan-500' },
  { id: 'clothes', name: 'Дрехи', iconName: 'Shirt', colorClass: 'bg-pink-100 text-pink-500' },
  { id: 'cosmetics', name: 'Козметика', iconName: 'Heart', colorClass: 'bg-rose-100 text-rose-500' },
  { id: 'gifts', name: 'Подаръци', iconName: 'Gift', colorClass: 'bg-fuchsia-100 text-fuchsia-500' },
  { id: 'education', name: 'Образование', iconName: 'GraduationCap', colorClass: 'bg-blue-100 text-blue-500' },
  { id: 'health', name: 'Здраве', iconName: 'Heart', colorClass: 'bg-red-50 text-red-600' },
  { id: 'transport', name: 'Транспорт', iconName: 'Bus', colorClass: 'bg-slate-100 text-slate-600' },
  { id: 'taxi', name: 'Такси и услуги', iconName: 'CarTaxiFront', colorClass: 'bg-yellow-50 text-yellow-600' },
  { id: 'other', name: 'Други', iconName: 'ShoppingBag', colorClass: 'bg-emerald-100 text-emerald-500' },
];

interface MonthlyExpensesTabProps {
  currentMonth: string;
  onSaveExpenses: (data: any) => void;
  initialData?: any;
}

export const MonthlyExpensesTab: React.FC<MonthlyExpensesTabProps> = ({ 
  currentMonth, 
  onSaveExpenses,
  initialData
}) => {
  const [credit, setCredit] = useState<string>(() => 
    initialData?.expenses?.fixed_expenses?.credit_eur?.toString() ?? DEFAULT_CREDIT_EUR
  );
  
  const [phone, setPhone] = useState<string>(() => 
    initialData?.expenses?.fixed_expenses?.phone_eur?.toString() ?? DEFAULT_PHONE_EUR
  );

  const [internet, setInternet] = useState<string>(() => 
    initialData?.expenses?.fixed_expenses?.internet_eur?.toString() ?? DEFAULT_INTERNET_EUR
  );

  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => 
    initialData?.expenses?.additional_expenses || []
  );

  const [categories, setCategories] = useState<ExpenseCategory[]>(PREDEFINED_CATEGORIES);

  // UI State
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Refs to track previous values to avoid infinite save loops
  const prevDataRef = useRef<string>('');

  // Persist data when local state changes
  useEffect(() => {
    const dataToSave = {
      fixed_expenses: {
        credit_eur: parseFloat(credit) || 0,
        phone_eur: parseFloat(phone) || 0,
        internet_eur: parseFloat(internet) || 0,
      },
      additional_expenses: expenses
    };

    const dataString = JSON.stringify(dataToSave);
    
    // Only trigger save if data actually changed
    if (prevDataRef.current !== dataString) {
      prevDataRef.current = dataString;
      onSaveExpenses(dataToSave);
    }
  }, [credit, phone, internet, expenses, onSaveExpenses]);

  // Handlers
  const handleAddNewCategory = (name: string) => {
    const newCat: ExpenseCategory = {
      id: `custom_${Date.now()}`,
      name,
      iconName: 'CircleHelp',
      colorClass: 'bg-slate-100 text-slate-500',
      isCustom: true
    };
    setCategories(prev => [...prev, newCat]);
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
      date: new Date().toISOString()
    };

    setExpenses(prev => [...prev, newExpense]);
    
    // Reset form
    setIsAddingExpense(false);
    setSelectedCategory(null);
    setAmount('');
    setNote('');
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const totalExpenses = (
    (parseFloat(credit) || 0) +
    (parseFloat(phone) || 0) +
    (parseFloat(internet) || 0) +
    expenses.reduce((sum, item) => sum + item.amount, 0)
  );

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
            <span className="text-xs text-slate-400 block uppercase tracking-wider">Общо</span>
            <span className="text-2xl font-bold text-slate-800">€{totalExpenses.toFixed(2)}</span>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Fixed Monthly Expenses */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-500" />
              Фиксирани разходи
            </h3>
            <div className="space-y-4">
              <InputGroup 
                label="Кредит"
                value={credit}
                onChange={setCredit}
                icon={<Wallet className="w-4 h-4 text-slate-400" />}
              />
              <InputGroup 
                label="Сметка телефон"
                value={phone}
                onChange={setPhone}
                icon={<Phone className="w-4 h-4 text-slate-400" />}
              />
              <InputGroup 
                label="Интернет и телевизия"
                value={internet}
                onChange={setInternet}
                icon={<Wifi className="w-4 h-4 text-slate-400" />}
              />
            </div>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Категория</label>
                  <button
                    onClick={() => setShowCategoryPicker(true)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-slate-300 rounded-md hover:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all text-left"
                  >
                    {selectedCategory ? (
                      <span className="flex items-center gap-2 text-slate-800">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center ${selectedCategory.colorClass}`}>
                           {/* Assuming simple icon rendering logic or pass component */}
                           <span className="w-2 h-2 rounded-full bg-current" />
                        </span>
                        {selectedCategory.name}
                      </span>
                    ) : (
                      <span className="text-slate-400">Избери категория...</span>
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
                   <label className="block text-sm font-medium text-slate-700 mb-1">Бележка (опционално)</label>
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
                 <div key={expense.id} className="group flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
                    <div className="flex items-center gap-4">
                       <div className={`w-10 h-10 rounded-full flex items-center justify-center ${expense.categoryColor}`}>
                         <div className="w-2 h-2 rounded-full bg-current"></div>
                       </div>
                       <div>
                         <p className="font-medium text-slate-800">{expense.categoryName}</p>
                         {expense.note && (
                           <p className="text-xs text-slate-500">{expense.note}</p>
                         )}
                       </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-slate-800">€{expense.amount.toFixed(2)}</span>
                      <button 
                        onClick={() => handleDeleteExpense(expense.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
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

      {/* Category Picker Modal */}
      {showCategoryPicker && (
        <CategoryPicker 
          categories={categories}
          onSelect={handleSelectCategory}
          onClose={() => setShowCategoryPicker(false)}
          onAddNewCategory={handleAddNewCategory}
        />
      )}
    </div>
  );
};

