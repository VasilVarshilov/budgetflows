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
import { DriveRestoreModal } from "@/components/backup/DriveRestoreModal";
import { Cloud, DownloadCloud, LogIn } from "lucide-react";

// Utils & Types
import { getCurrentMonthBulgarian } from "@/utils/formatting";
import { createEmptyMonthlyRecord } from "@/utils/incomeStorage";
import {
  userStorage,
  STORAGE_BASE_MONTHLY,
  STORAGE_BASE_SAVINGS,
} from "@/utils/userStorage";
import { MonthlyRecord, IncomeItem, ExpenseItem } from "@/types";

type Tab = "dashboard" | "monthly" | "income" | "electricity" | "reports" | "savings" | "budgets" | "ai-analysis" | "backup";

interface NavTabItem {
  id: Tab;
  label: string;
  shortLabel?: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  drawerActiveClass: string;
  drawerIconClass: string;
}

const NAV_TABS: NavTabItem[] = [
  {
    id: "dashboard",
    label: "Табло",
    description: "Обобщен преглед на финансите",
    icon: LayoutDashboard,
    accentColor: "text-indigo-600 dark:text-indigo-400",
    drawerActiveClass: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 font-bold border border-indigo-200 dark:border-indigo-900",
    drawerIconClass: "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300",
  },
  {
    id: "monthly",
    label: "Разходи",
    description: "Фиксирани и променливи разходи",
    icon: Calendar,
    accentColor: "text-blue-600 dark:text-blue-400",
    drawerActiveClass: "bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 font-bold border border-blue-200 dark:border-blue-900",
    drawerIconClass: "bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300",
  },
  {
    id: "income",
    label: "Приходи",
    description: "Месечни приходи и шаблони",
    icon: Banknote,
    accentColor: "text-emerald-600 dark:text-emerald-400",
    drawerActiveClass: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-bold border border-emerald-200 dark:border-emerald-900",
    drawerIconClass: "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300",
  },
  {
    id: "savings",
    label: "Спестявания",
    description: "Спестовен фонд и баланс",
    icon: PiggyBank,
    accentColor: "text-emerald-600 dark:text-emerald-400",
    drawerActiveClass: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-bold border border-emerald-200 dark:border-emerald-900",
    drawerIconClass: "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300",
  },
  {
    id: "budgets",
    label: "Бюджет",
    description: "Месечен бюджет и контрол на разходите",
    icon: Target,
    accentColor: "text-rose-600 dark:text-rose-400",
    drawerActiveClass: "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 font-bold border border-rose-200 dark:border-rose-900",
    drawerIconClass: "bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300",
  },
  {
    id: "reports",
    label: "Отчети",
    description: "Месечни отчети и разпределение",
    icon: PieChart,
    accentColor: "text-purple-600 dark:text-purple-400",
    drawerActiveClass: "bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 font-bold border border-purple-200 dark:border-purple-900",
    drawerIconClass: "bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300",
  },
  {
    id: "electricity",
    label: "ТОК",
    description: "Калкулатор и история на тока",
    icon: Zap,
    accentColor: "text-amber-500 dark:text-amber-400",
    drawerActiveClass: "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 font-bold border border-amber-200 dark:border-amber-900",
    drawerIconClass: "bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300",
  },
  {
    id: "ai-analysis",
    label: "AI Анализ",
    description: "Автоматични финансови препоръки",
    icon: Sparkles,
    accentColor: "text-amber-500 dark:text-amber-400",
    drawerActiveClass: "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 font-bold border border-amber-200 dark:border-amber-900",
    drawerIconClass: "bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300",
  },
  {
    id: "backup",
    label: "Архив",
    description: "Облачен архив & Google Drive",
    icon: FolderArchive,
    accentColor: "text-slate-600 dark:text-slate-300",
    drawerActiveClass: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 font-bold border border-indigo-200 dark:border-indigo-900",
    drawerIconClass: "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300",
  },
];

const MOBILE_PRIMARY_TABS = NAV_TABS.slice(0, 5);
const MOBILE_MORE_TABS = NAV_TABS.slice(5);

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [currentMonth, setCurrentMonth] = useState(() => getCurrentMonthBulgarian());
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [isGlobalRestoreModalOpen, setIsGlobalRestoreModalOpen] = useState(false);

  const [monthlyData, setMonthlyData] = useState<
    Record<string, MonthlyRecord>
  >({});
  const [globalSavings, setGlobalSavings] = useState<IncomeItem[]>([]);

  const {
    triggerAutoSync,
    syncStatus,
    user,
    storedProfile,
    activeUid,
    isAuthLoading,
    isSwitchingAccount,
    hasDriveAccessToken,
    isOnline,
    pendingRestoreOffer,
    dismissRestoreOffer,
    loginWithGoogle,
  } = useCloudSync();

  const displayUser = user || storedProfile;

  // Reload isolated data for the active user account
  const loadAccountWorkspaceData = useCallback((targetUid: string) => {
    setCurrentMonth((prev) => prev || getCurrentMonthBulgarian());
    const storedMonthly = userStorage.getJSON<Record<string, MonthlyRecord>>(
      STORAGE_BASE_MONTHLY,
      {},
      targetUid
    );
    const storedSavings = userStorage.getJSON<IncomeItem[]>(
      STORAGE_BASE_SAVINGS,
      [],
      targetUid
    );
    setMonthlyData(storedMonthly && typeof storedMonthly === "object" ? storedMonthly : {});
    setGlobalSavings(Array.isArray(storedSavings) ? storedSavings : []);
    setWorkspaceRevision((prev) => prev + 1);
  }, []);

  // Load isolated storage whenever auth resolves or activeUid changes
  useEffect(() => {
    if (isAuthLoading || isSwitchingAccount) {
      // Clear active in-memory view during account transitions to avoid any data flash
      setMonthlyData({});
      setGlobalSavings([]);
      return;
    }
    loadAccountWorkspaceData(activeUid);
  }, [activeUid, isAuthLoading, isSwitchingAccount, loadAccountWorkspaceData]);

  // Save helpers strictly scoped to activeUid
  const saveMonthlyToStorage = (updated: Record<string, MonthlyRecord>) => {
    userStorage.setJSON(STORAGE_BASE_MONTHLY, updated, activeUid);
  };

  const saveSavingsToStorage = (updated: IncomeItem[]) => {
    userStorage.setJSON(STORAGE_BASE_SAVINGS, updated, activeUid);
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

  // Restore / reload all state after backup import or local clear
  const handleDataRestored = useCallback(() => {
    loadAccountWorkspaceData(userStorage.getActiveUid());
  }, [loadAccountWorkspaceData]);

  // Listen for data-restored & account-changed events
  useEffect(() => {
    window.addEventListener("homebudget:data-restored", handleDataRestored);
    return () => {
      window.removeEventListener("homebudget:data-restored", handleDataRestored);
    };
  }, [handleDataRestored]);

  const currentMonthRecord = monthlyData[currentMonth];

  if (isAuthLoading || isSwitchingAccount) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors">
         <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-spin" />
            <p className="text-slate-600 dark:text-slate-300 font-medium text-sm">
              {isSwitchingAccount ? "Превключване на профил и зареждане на данни..." : "Зареждане на профила..."}
            </p>
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
                      !isOnline || !hasDriveAccessToken
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
                        : !hasDriveAccessToken
                        ? "Изисква подновяване на Drive достъпа"
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
                  onClick={() => {
                    loginWithGoogle().catch(() => setActiveTab("backup"));
                  }}
                  title="Вход с Google и облачна синхронизация"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/70 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer border border-indigo-200 dark:border-indigo-800"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span className="text-[11px] hidden sm:inline">Вход с Google</span>
                  <span className="text-[11px] sm:hidden">Вход</span>
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
                        isActive ? tab.accentColor : "text-slate-500 dark:text-slate-400"
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

      {/* Main Content (keyed by activeUid + workspaceRevision so switching accounts cleanly remounts all local tab state) */}
      <main
        key={`${activeUid}-${workspaceRevision}`}
        className="flex-1 max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 w-full pb-28 md:pb-8"
      >
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
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
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
              {MOBILE_MORE_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setIsMobileMoreOpen(false);
                    }}
                    className={`w-full min-h-[52px] flex items-center justify-between p-3.5 rounded-2xl transition-all cursor-pointer ${
                      isActive
                        ? tab.drawerActiveClass
                        : "hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tab.drawerIconClass}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-bold block">{tab.label}</span>
                        {tab.description && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {tab.description}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                );
              })}
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
          {MOBILE_PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsMobileMoreOpen(false);
                }}
                className={`min-h-[48px] flex flex-col items-center justify-center transition-all cursor-pointer ${
                  isActive
                    ? `${tab.accentColor} font-bold scale-105`
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] tracking-tight truncate max-w-full px-0.5">
                  {tab.shortLabel || tab.label}
                </span>
              </button>
            );
          })}

          {/* 6. More */}
          <button
            type="button"
            onClick={() => setIsMobileMoreOpen((prev) => !prev)}
            className={`min-h-[48px] flex flex-col items-center justify-center transition-all cursor-pointer ${
              MOBILE_MORE_TABS.some((tab) => tab.id === activeTab) || isMobileMoreOpen
                ? "text-indigo-600 dark:text-indigo-400 font-bold scale-105"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <SlidersHorizontal className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Още</span>
          </button>
        </div>
      </nav>

      {/* Auto-Detected Cloud Backup Restore Offer (Multi-device login flow) */}
      {pendingRestoreOffer &&
        pendingRestoreOffer.uid === activeUid &&
        !isGlobalRestoreModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 animate-in zoom-in-95">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 rounded-xl">
                    <DownloadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      Открит е облачен архив в Google Drive
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {user?.email || "Вашият Google акаунт"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissRestoreOffer}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                В това устройство все още няма заредени данни за този акаунт, но в Google Drive (<code>appDataFolder</code>) има запазен архив{" "}
                {pendingRestoreOffer.fileInfo.modifiedTime
                  ? `от ${new Date(pendingRestoreOffer.fileInfo.modifiedTime).toLocaleString("bg-BG", { dateStyle: "short", timeStyle: "short" })}`
                  : ""}
                . Желаете ли да възстановите данните си веднага?
              </p>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={dismissRestoreOffer}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  По-късно
                </button>
                <button
                  type="button"
                  onClick={() => setIsGlobalRestoreModalOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>Възстанови от Google Drive</span>
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Global Drive Restore Modal (for fresh-device login flow) */}
      <DriveRestoreModal
        isOpen={isGlobalRestoreModalOpen}
        onClose={() => setIsGlobalRestoreModalOpen(false)}
        onSuccess={() => {
          setIsGlobalRestoreModalOpen(false);
          handleDataRestored();
        }}
      />
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
