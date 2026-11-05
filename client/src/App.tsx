import React, { useState, useEffect, useCallback } from "react";
import {
  Zap,
  Calendar,
  LayoutDashboard,
  PieChart,
  PiggyBank,
  FolderArchive,
  Loader2,
  Target,
  Sparkles,
} from "lucide-react";

// Components
import { DashboardTab } from "@/components/dashboard/DashboardTab";
import { ElectricityTab } from "@/components/electricity/ElectricityTab";
import { MonthlyExpensesTab } from "@/components/monthly/MonthlyExpensesTab";
import { MonthlyReportsTab } from "@/components/reports/MonthlyReportsTab";
import { SavingsTab } from "@/components/savings/SavingsTab";
import { BackupRestoreSection } from "@/components/backup/BackupRestoreSection";
import { BudgetManagementTab } from "@/components/budgets/BudgetManagementTab";
import { AiAnalysisTab } from "@/components/analysis/AiAnalysisTab";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ThemeProvider } from "@/utils/themeContext";

// Utils & Types
import { getCurrentMonthBulgarian } from "@/utils/formatting";
import { MonthlyRecord, IncomeItem, ExpenseItem } from "@/types";

type Tab = "dashboard" | "monthly" | "electricity" | "reports" | "savings" | "budgets" | "ai-analysis" | "backup";

// Storage Keys
const STORAGE_KEY_MONTHLY = "HomeBudget_Data";
const STORAGE_KEY_SAVINGS = "HomeBudget_GlobalSavings";

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [currentMonth, setCurrentMonth] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [monthlyData, setMonthlyData] = useState<
    Record<string, MonthlyRecord>
  >({});
  const [globalSavings, setGlobalSavings] = useState<IncomeItem[]>([]);

  // Load stored data
  useEffect(() => {
    const loadData = async () => {
        setCurrentMonth(getCurrentMonthBulgarian());

        try {
            const storedMonthly = localStorage.getItem(STORAGE_KEY_MONTHLY);
            if (storedMonthly) setMonthlyData(JSON.parse(storedMonthly));
        } catch (e) {
            console.error("Failed to load monthly data", e);
        }

        try {
            const storedSavings = localStorage.getItem(STORAGE_KEY_SAVINGS);
            if (storedSavings) setGlobalSavings(JSON.parse(storedSavings));
        } catch (e) {
            console.error("Failed to load savings data", e);
        }
        
        // Simulate a small delay to ensure hydration prevents flicker/overwrite
        setTimeout(() => {
           setIsLoading(false);
        }, 500);
    };

    loadData();
  }, []);

  // Save helpers
  const saveMonthlyToStorage = (updated: Record<string, MonthlyRecord>) => {
    localStorage.setItem(STORAGE_KEY_MONTHLY, JSON.stringify(updated));
  };

  const saveSavingsToStorage = (updated: IncomeItem[]) => {
    localStorage.setItem(STORAGE_KEY_SAVINGS, JSON.stringify(updated));
  };

  // Add Electricity to Expenses
  const handleAddElectricityToExpenses = useCallback(
    (em1Amount: number, em2Amount: number) => {
      setMonthlyData((prev) => {
        const monthKey = getCurrentMonthBulgarian();
        const existing = prev[monthKey] || {
          month: monthKey,
          tab: "expenses",
          meta: { generated_at: new Date().toISOString() },
          inputs: {
            old_t1: 0,
            new_t1: 0,
            old_t2: 0,
            new_t2: 0,
            day_price_with_vat: 0,
            night_price_with_vat: 0,
            invoice_total: 0,
          },
          results: {
            cons_t1_kwh: 0,
            cons_t2_kwh: 0,
            total_cons_em1_kwh: 0,
            cost_em1_eur: 0,
            em2_remainder_eur: 0,
          },
        };

        const existingExpenses = existing.expenses?.additional_expenses || [];
        
        // Remove any existing electricity expenses to avoid duplicates
        const filteredExpenses = existingExpenses.filter(
          (e) => !e.categoryName.startsWith("Сметка Ток")
        );

        // Create two new electricity expense items
        const em1Expense: ExpenseItem = {
          id: `electricity_em1_${Date.now()}`,
          categoryId: "electricity",
          categoryName: "Сметка Ток - Електромер 1",
          categoryIcon: "Zap",
          categoryColor: "bg-yellow-100 text-yellow-600",
          amount: em1Amount,
          note: "",
          date: new Date().toISOString(),
        };

        const em2Expense: ExpenseItem = {
          id: `electricity_em2_${Date.now() + 1}`,
          categoryId: "electricity",
          categoryName: "Сметка Ток - Електромер 2",
          categoryIcon: "Zap",
          categoryColor: "bg-yellow-100 text-yellow-600",
          amount: em2Amount,
          note: "",
          date: new Date().toISOString(),
        };

        const updated: MonthlyRecord = {
          ...existing,
          expenses: {
            saved_em2_eur: existing.expenses?.saved_em2_eur || 0,
            // Keep existing fixed expenses
            fixed_expenses: existing.expenses?.fixed_expenses || [],
            additional_expenses: [...filteredExpenses, em1Expense, em2Expense],
          },
        };

        const newData = { ...prev, [monthKey]: updated };
        saveMonthlyToStorage(newData);
        return newData;
      });
    },
    []
  );

  // Monthly Expenses Save
  const handleSaveExpenses = useCallback((expensesData: any, targetMonth?: string) => {
    setMonthlyData((prev) => {
      const monthKey = targetMonth || currentMonth || getCurrentMonthBulgarian();

      const existing = prev[monthKey] || {
        month: monthKey,
        tab: "expenses",
        meta: { generated_at: new Date().toISOString() },
        inputs: {
          old_t1: 0,
          new_t1: 0,
          old_t2: 0,
          new_t2: 0,
          day_price_with_vat: 0,
          night_price_with_vat: 0,
          invoice_total: 0,
        },
        results: {
          cons_t1_kwh: 0,
          cons_t2_kwh: 0,
          total_cons_em1_kwh: 0,
          cost_em1_eur: 0,
          em2_remainder_eur: 0,
        },
      };

      const updated: MonthlyRecord = {
        ...existing,
        expenses: expensesData,
        incomes: existing.incomes || [],
      };

      const newData = { ...prev, [monthKey]: updated };
      saveMonthlyToStorage(newData);
      return newData;
    });
  }, [currentMonth]);

  // Global Savings Save
  const handleUpdateGlobalSavings = useCallback(
    (newSavings: IncomeItem[]) => {
      setGlobalSavings(newSavings);
      saveSavingsToStorage(newSavings);
    },
    []
  );

  // Restore / reload all state after backup import
  const handleDataRestored = useCallback(() => {
    try {
      const storedMonthly = localStorage.getItem(STORAGE_KEY_MONTHLY);
      if (storedMonthly) {
        setMonthlyData(JSON.parse(storedMonthly));
      } else {
        setMonthlyData({});
      }
    } catch (e) {
      console.error("Failed reloading monthly data after restore", e);
    }

    try {
      const storedSavings = localStorage.getItem(STORAGE_KEY_SAVINGS);
      if (storedSavings) {
        setGlobalSavings(JSON.parse(storedSavings));
      } else {
        setGlobalSavings([]);
      }
    } catch (e) {
      console.error("Failed reloading savings data after restore", e);
    }
  }, []);

  const currentMonthRecord = monthlyData[currentMonth];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors">
         <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-spin" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">Зареждане на данни...</p>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      <header className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 shadow-xs backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <div className="bg-indigo-600 dark:bg-indigo-500 p-1.5 rounded-lg shadow-xs">
                <LayoutDashboard className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-slate-800 dark:text-slate-100 text-lg hidden sm:block tracking-tight">
                Home Budget
              </span>
            </div>

            <div className="flex items-center gap-2">
              <nav className="flex space-x-1 sm:space-x-1.5 overflow-x-auto no-scrollbar py-2">
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === "dashboard"
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-400 shadow-2xs font-semibold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Табло</span>
                </button>

                <button
                  onClick={() => setActiveTab("monthly")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === "monthly"
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-400 font-semibold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span className="hidden sm:inline">Месечни разходи</span>
                  <span className="sm:hidden">Разходи</span>
                </button>

                <button
                  onClick={() => setActiveTab("electricity")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === "electricity"
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400 font-semibold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  <span>ТОК</span>
                </button>

                <button
                  onClick={() => setActiveTab("reports")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === "reports"
                      ? "bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-400 font-semibold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <PieChart className="w-4 h-4" />
                  <span>Отчети</span>
                </button>

                <button
                  onClick={() => setActiveTab("savings")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === "savings"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400 font-semibold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <PiggyBank className="w-4 h-4" />
                  <span>Спестявания</span>
                </button>

                <button
                  onClick={() => setActiveTab("budgets")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === "budgets"
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-400 font-semibold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <Target className="w-4 h-4" />
                  <span>Бюджет</span>
                </button>

                <button
                  onClick={() => setActiveTab("ai-analysis")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === "ai-analysis"
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs font-semibold"
                      : "text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>AI Анализ</span>
                </button>

                <button
                  onClick={() => setActiveTab("backup")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === "backup"
                      ? "bg-slate-800 dark:bg-slate-700 text-white shadow-xs font-semibold"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <FolderArchive className="w-4 h-4" />
                  <span>Архив</span>
                </button>
              </nav>

              {/* Theme Toggle Button */}
              <div className="pl-2 ml-1 border-l border-slate-200 dark:border-slate-800 shrink-0">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {activeTab === "dashboard" && (
          <DashboardTab
            monthlyData={monthlyData}
            globalSavings={globalSavings}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === "monthly" && (
          <MonthlyExpensesTab
            currentMonth={currentMonth}
            initialData={currentMonthRecord}
            onSaveExpenses={handleSaveExpenses}
            allMonthlyData={monthlyData}
            onMonthChange={setCurrentMonth}
          />
        )}

        {activeTab === "electricity" && (
          <ElectricityTab onAddToExpenses={handleAddElectricityToExpenses} />
        )}

        {activeTab === "savings" && (
          <SavingsTab
            onUpdateSavings={handleUpdateGlobalSavings}
            savingsData={globalSavings}
          />
        )}

        {activeTab === "reports" && (
          <MonthlyReportsTab
            monthlyData={monthlyData}
            globalSavings={globalSavings}
          />
        )}

        {activeTab === "budgets" && (
          <BudgetManagementTab
            monthlyData={monthlyData}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === "ai-analysis" && (
          <AiAnalysisTab
            monthlyData={monthlyData}
            globalSavings={globalSavings}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === "backup" && (
          <BackupRestoreSection onDataRestored={handleDataRestored} />
        )}
      </main>

      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto transition-colors">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Home Budget Application © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
