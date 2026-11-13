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
  ChevronRight,
  X,
  SlidersHorizontal,
  Banknote,
} from "lucide-react";

// Components
import { DashboardTab } from "@/components/dashboard/DashboardTab";
import { ElectricityTab } from "@/components/electricity/ElectricityTab";
import { MonthlyExpensesTab } from "@/components/monthly/MonthlyExpensesTab";
import { IncomeTab } from "@/components/income/IncomeTab";
import { MonthlyReportsTab } from "@/components/reports/MonthlyReportsTab";
import { SavingsTab } from "@/components/savings/SavingsTab";
import { BackupRestoreSection } from "@/components/backup/BackupRestoreSection";
import { BudgetManagementTab } from "@/components/budgets/BudgetManagementTab";
import { AiAnalysisTab } from "@/components/analysis/AiAnalysisTab";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ThemeProvider } from "@/utils/themeContext";
import { CloudSyncProvider, useCloudSync } from "@/utils/cloudSyncContext";
import { Cloud } from "lucide-react";

// Utils & Types
import { getCurrentMonthBulgarian } from "@/utils/formatting";
import { createEmptyMonthlyRecord } from "@/utils/incomeStorage";
import { MonthlyRecord, IncomeItem, ExpenseItem } from "@/types";

type Tab = "dashboard" | "monthly" | "income" | "electricity" | "reports" | "savings" | "budgets" | "ai-analysis" | "backup";

// Storage Keys
const STORAGE_KEY_MONTHLY = "HomeBudget_Data";
const STORAGE_KEY_SAVINGS = "HomeBudget_GlobalSavings";

interface NavTabItem {
  id: Tab;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

const NAV_TABS: NavTabItem[] = [
  {
    id: "dashboard",
    label: "Табло",
    icon: LayoutDashboard,
    accentColor: "text-indigo-600 dark:text-indigo-400",
  },
  {
    id: "monthly",
    label: "Месечни разходи",
    shortLabel: "Разходи",
    icon: Calendar,
    accentColor: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "income",
    label: "Приходи",
    shortLabel: "Приходи",
    icon: Banknote,
    accentColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "electricity",
    label: "Сметка ТОК",
    shortLabel: "ТОК",
    icon: Zap,
    accentColor: "text-amber-500 dark:text-amber-400",
  },
  {
    id: "reports",
    label: "Отчети",
    icon: PieChart,
    accentColor: "text-purple-600 dark:text-purple-400",
  },
  {
    id: "savings",
    label: "Спестявания",
    icon: PiggyBank,
    accentColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "budgets",
    label: "Бюджети",
    shortLabel: "Бюджет",
    icon: Target,
    accentColor: "text-rose-600 dark:text-rose-400",
  },
  {
    id: "ai-analysis",
    label: "AI Анализ",
    icon: Sparkles,
    accentColor: "text-amber-500",
  },
  {
    id: "backup",
    label: "Архив",
    icon: FolderArchive,
    accentColor: "text-slate-600 dark:text-slate-300",
  },
];

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [currentMonth, setCurrentMonth] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);

  const [monthlyData, setMonthlyData] = useState<
    Record<string, MonthlyRecord>
  >({});
  const [globalSavings, setGlobalSavings] = useState<IncomeItem[]>([]);

  const {
    triggerAutoSync,
    syncStatus,
    user,
    storedProfile,
    isOnline,
  } = useCloudSync();

  const displayUser = user || storedProfile;

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
        triggerAutoSync();
        return newData;
      });
    },
    [triggerAutoSync]
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
      triggerAutoSync();
      return newData;
    });
  }, [currentMonth, triggerAutoSync]);

  // Monthly Incomes Save (for any monthKey)
  const handleSaveIncomesForMonth = useCallback(
    (targetMonthKey: string, incomes: IncomeItem[]) => {
      setMonthlyData((prev) => {
        const monthKey = targetMonthKey || currentMonth || getCurrentMonthBulgarian();
        const existing = prev[monthKey] || createEmptyMonthlyRecord(monthKey);

        const updated: MonthlyRecord = {
          ...existing,
          incomes,
        };

        const newData = { ...prev, [monthKey]: updated };
        saveMonthlyToStorage(newData);
        triggerAutoSync();
        return newData;
      });
    },
    [currentMonth, triggerAutoSync]
  );

  // Global Savings Save
  const handleUpdateGlobalSavings = useCallback(
    (newSavings: IncomeItem[]) => {
      setGlobalSavings(newSavings);
      saveSavingsToStorage(newSavings);
      triggerAutoSync();
    },
    [triggerAutoSync]
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

  // Listen for data-restored events from either local JSON or Google Drive
  useEffect(() => {
    window.addEventListener("homebudget:data-restored", handleDataRestored);
    return () => {
      window.removeEventListener("homebudget:data-restored", handleDataRestored);
    };
  }, [handleDataRestored]);

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
      <header className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 shadow-xs backdrop-blur-md transition-colors">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
          {/* Row 1: Brand Logo, Active Month & Controls */}
          <div className="flex justify-between items-center h-14 sm:h-15 gap-2 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 dark:from-indigo-500 dark:to-indigo-600 p-2 rounded-xl shadow-xs text-white">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-800 dark:text-white text-lg tracking-tight">
                  Budget Flow
                </span>
                <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                  {currentMonth}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="sm:hidden text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {currentMonth}
              </span>

              {/* Cloud Sync Status / User Profile Chip */}
              {displayUser ? (
                <button
                  type="button"
                  onClick={() => setActiveTab("backup")}
                  title={`Google Drive: ${displayUser.email || "Свързан"}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                >
                  {displayUser.photoURL ? (
                    <img
                      src={displayUser.photoURL}
                      alt="Google Profile"
                      className="w-4 h-4 rounded-full object-cover"
                    />
                  ) : (
                    <Cloud className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  )}
                  <span className="hidden sm:inline font-semibold text-[11px] max-w-[90px] truncate">
                    {displayUser.displayName
                      ? displayUser.displayName.split(" ")[0]
                      : "Drive"}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      !isOnline
                        ? "bg-amber-400"
                        : syncStatus === "syncing"
                        ? "bg-blue-500 animate-pulse"
                        : syncStatus === "synced"
                        ? "bg-emerald-500"
                        : syncStatus === "failed"
                        ? "bg-rose-500"
                        : "bg-emerald-500"
                    }`}
                    title={
                      !isOnline
                        ? "Офлайн"
                        : syncStatus === "syncing"
                        ? "Синхронизиране..."
                        : syncStatus === "synced"
                        ? "Синхронизирано"
                        : syncStatus === "failed"
                        ? "Грешка при синхронизация"
                        : "Готово"
                    }
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab("backup")}
                  title="Свържи Google Drive архив"
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                >
                  <Cloud className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px]">Drive</span>
                </button>
              )}

              <ThemeToggle />
            </div>
          </div>

          {/* Row 2: Desktop Navigation (Hidden on mobile < md, visible on desktop >= md) */}
          <div className="py-2 hidden md:block">
            <nav
              aria-label="Основна навигация"
              className="grid grid-cols-9 gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs"
            >
              {NAV_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-xs border border-slate-200/80 dark:border-slate-700/80"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? tab.accentColor : "text-slate-400 dark:text-slate-500"
                      }`}
                    />
                    <span className="truncate">
                      <span className="hidden xl:inline">{tab.label}</span>
                      <span className="xl:hidden">{tab.shortLabel || tab.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content (with bottom padding for mobile navigation bar) */}
      <main className="flex-1 max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 w-full pb-28 md:pb-8">
        {activeTab === "dashboard" && (
          <DashboardTab
            monthlyData={monthlyData}
            globalSavings={globalSavings}
            onNavigateTab={setActiveTab}
            onTriggerSync={triggerAutoSync}
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

        {activeTab === "income" && (
          <IncomeTab
            currentMonth={currentMonth}
            allMonthlyData={monthlyData}
            onMonthChange={setCurrentMonth}
            onSaveIncomesForMonth={handleSaveIncomesForMonth}
            onTriggerSync={triggerAutoSync}
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

      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto transition-colors mb-16 md:mb-0">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Budget Flow Application © {new Date().getFullYear()}
          </p>
        </div>
      </footer>

      {/* Mobile "More" Drawer / Sheet (md:hidden) */}
      {isMobileMoreOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileMoreOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl z-10 animate-in slide-in-from-bottom-5 duration-250 pb-safe">
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Още функции
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Допълнителни инструменти и настройки
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMoreOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Затвори менюто"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {/* Savings */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab("savings");
                  setIsMobileMoreOpen(false);
                }}
                className={`w-full min-h-[52px] flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer ${
                  activeTab === "savings"
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-bold border border-emerald-200 dark:border-emerald-900"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
                    <PiggyBank className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold block">Спестявания</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Спестовен фонд и баланс
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              {/* Budgets */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab("budgets");
                  setIsMobileMoreOpen(false);
                }}
                className={`w-full min-h-[52px] flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer ${
                  activeTab === "budgets"
                    ? "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 font-bold border border-rose-200 dark:border-rose-900"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                    <Target className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold block">Бюджети & Лимити</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Месечен бюджет и контрол на разходите
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              {/* AI Analysis */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab("ai-analysis");
                  setIsMobileMoreOpen(false);
                }}
                className={`w-full min-h-[52px] flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer ${
                  activeTab === "ai-analysis"
                    ? "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 font-bold border border-amber-200 dark:border-amber-900"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold block">AI Финансов Анализ</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Автоматични финансови препоръки
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              {/* Cloud Backup & Drive */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab("backup");
                  setIsMobileMoreOpen(false);
                }}
                className={`w-full min-h-[52px] flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer ${
                  activeTab === "backup"
                    ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 font-bold border border-indigo-200 dark:border-indigo-900"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <FolderArchive className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold block">Облачен архив & Google Drive</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Синхронизация, бекъп и възстановяване
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (md:hidden) */}
      <nav
        aria-label="Мобилна навигация"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe shadow-lg"
      >
        <div className="grid grid-cols-6 items-center h-16 px-1">
          {/* 1. Dashboard */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("dashboard");
              setIsMobileMoreOpen(false);
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "text-indigo-600 dark:text-indigo-400 font-bold scale-105"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Табло</span>
          </button>

          {/* 2. Expenses */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("monthly");
              setIsMobileMoreOpen(false);
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-all cursor-pointer ${
              activeTab === "monthly"
                ? "text-blue-600 dark:text-blue-400 font-bold scale-105"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Calendar className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Разходи</span>
          </button>

          {/* 3. Income */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("income");
              setIsMobileMoreOpen(false);
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-all cursor-pointer ${
              activeTab === "income"
                ? "text-emerald-600 dark:text-emerald-400 font-bold scale-105"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Banknote className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Приходи</span>
          </button>

          {/* 4. Electricity */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("electricity");
              setIsMobileMoreOpen(false);
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-all cursor-pointer ${
              activeTab === "electricity"
                ? "text-amber-500 dark:text-amber-400 font-bold scale-105"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Zap className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">ТОК</span>
          </button>

          {/* 5. Reports */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("reports");
              setIsMobileMoreOpen(false);
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-all cursor-pointer ${
              activeTab === "reports"
                ? "text-purple-600 dark:text-purple-400 font-bold scale-105"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <PieChart className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Отчети</span>
          </button>

          {/* 6. More */}
          <button
            type="button"
            onClick={() => setIsMobileMoreOpen((prev) => !prev)}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-all cursor-pointer ${
              activeTab === "savings" ||
              activeTab === "budgets" ||
              activeTab === "ai-analysis" ||
              activeTab === "backup" ||
              isMobileMoreOpen
                ? "text-indigo-600 dark:text-indigo-400 font-bold scale-105"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <SlidersHorizontal className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Още</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <CloudSyncProvider>
        <AppContent />
      </CloudSyncProvider>
    </ThemeProvider>
  );
};

export default App;
