import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import {
  Zap,
  Calendar,
  CalendarDays,
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
import { CalendarTab } from "@/components/calendar/CalendarTab";
import { MonthlyReportsTab } from "@/components/reports/MonthlyReportsTab";
import { SavingsTab } from "@/components/savings/SavingsTab";
import { BackupRestoreSection } from "@/components/backup/BackupRestoreSection";
import { BudgetManagementTab } from "@/components/budgets/BudgetManagementTab";
import { AiAnalysisTab } from "@/components/analysis/AiAnalysisTab";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { ThemeProvider } from "@/utils/themeContext";
import { CloudSyncProvider, useCloudSync } from "@/utils/cloudSyncContext";
import { DriveRestoreModal } from "@/components/backup/DriveRestoreModal";
import {
  BrandHeaderLockup,
  BrandSplashLockup,
  APP_NAME,
  APP_PRODUCTION_URL,
  APP_TAGLINE,
} from "@/components/brand/BrandLogo";
import { AboutModal } from "@/components/brand/AboutModal";
import { SupportModal } from "@/components/brand/SupportModal";
import { Cloud, Coffee, DownloadCloud, Info, LogIn, Share2, UploadCloud, AlertTriangle } from "lucide-react";
import {
  I18nProvider,
  useI18n,
  formatLocalizedMonthYear,
  formatLocalizedDateTime,
} from "@/i18n";

// Utils & Types
import { getCurrentMonthBulgarian } from "@/utils/formatting";
import { createEmptyMonthlyRecord, loadRecurringIncomes, saveRecurringIncomes } from "@/utils/incomeStorage";
import { CalendarEvent, dateKeyToStableIso } from "@/utils/calendarEngine";
import {
  userStorage,
  STORAGE_BASE_MONTHLY,
  STORAGE_BASE_SAVINGS,
  STORAGE_BASE_EXPENSES_MONTH,
  STORAGE_BASE_INCOME_MONTH,
} from "@/utils/userStorage";
import { toggleRecordCompletion } from "@/utils/expenseStatus";
import { upsertElectricityRecordFromExpense } from "@/utils/electricityStorage";
import { loadSavingsGoals, SAVINGS_GOALS_UPDATED_EVENT } from "@/utils/savingsGoalsStorage";
import { resetPageScrollToTop, smoothScrollToTop } from "@/utils/scrollUtils";
import {
  clearAllNotifications,
  createEmptyNotificationsState,
  deleteNotification,
  dismissNotification,
  dispatchManualBackupNotification,
  loadNotificationsStore,
  MANUAL_BACKUP_NOTIFICATION_EVENT,
  ManualBackupAction,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  reconcileAllNotifications,
  recordBackupSuccessNotification,
  saveNotificationsStore,
} from "@/utils/notificationsEngine";
import {
  generateDueRecurringInstances,
  normalizeMonthlyDataConsistency,
  partitionExpensesByRepeat,
  normalizeIncomeByRepeat,
  parseMonthKeyToYearMonth,
} from "@/utils/recurrenceEngine";
import {
  AppNotification,
  ExpenseItem,
  IncomeItem,
  MonthlyRecord,
  NotificationsStoreState,
  NotificationTarget,
  OpenRecordTarget,
} from "@/types";

type Tab = "dashboard" | "monthly" | "income" | "calendar" | "electricity" | "reports" | "savings" | "budgets" | "ai-analysis" | "backup";

interface NavTabConfig {
  id: Tab;
  labelKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  drawerActiveClass: string;
  drawerIconClass: string;
}

const NAV_TAB_CONFIGS: NavTabConfig[] = [
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    descriptionKey: "nav.descriptions.dashboard",
    icon: LayoutDashboard,
    accentColor: "text-indigo-600 dark:text-indigo-400",
    drawerActiveClass: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 font-bold border border-indigo-200 dark:border-indigo-900",
    drawerIconClass: "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300",
  },
  {
    id: "monthly",
    labelKey: "nav.monthly",
    descriptionKey: "nav.descriptions.monthly",
    icon: Calendar,
    accentColor: "text-blue-600 dark:text-blue-400",
    drawerActiveClass: "bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 font-bold border border-blue-200 dark:border-blue-900",
    drawerIconClass: "bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300",
  },
  {
    id: "income",
    labelKey: "nav.income",
    descriptionKey: "nav.descriptions.income",
    icon: Banknote,
    accentColor: "text-emerald-600 dark:text-emerald-400",
    drawerActiveClass: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-bold border border-emerald-200 dark:border-emerald-900",
    drawerIconClass: "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300",
  },
  {
    id: "savings",
    labelKey: "nav.savings",
    descriptionKey: "nav.descriptions.savings",
    icon: PiggyBank,
    accentColor: "text-emerald-600 dark:text-emerald-400",
    drawerActiveClass: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-bold border border-emerald-200 dark:border-emerald-900",
    drawerIconClass: "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300",
  },
  {
    id: "calendar",
    labelKey: "nav.calendar",
    descriptionKey: "nav.descriptions.calendar",
    icon: CalendarDays,
    accentColor: "text-indigo-600 dark:text-indigo-400",
    drawerActiveClass: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 font-bold border border-indigo-200 dark:border-indigo-900",
    drawerIconClass: "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300",
  },
  {
    id: "budgets",
    labelKey: "nav.budgets",
    descriptionKey: "nav.descriptions.budgets",
    icon: Target,
    accentColor: "text-rose-600 dark:text-rose-400",
    drawerActiveClass: "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 font-bold border border-rose-200 dark:border-rose-900",
    drawerIconClass: "bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300",
  },
  {
    id: "reports",
    labelKey: "nav.reports",
    descriptionKey: "nav.descriptions.reports",
    icon: PieChart,
    accentColor: "text-purple-600 dark:text-purple-400",
    drawerActiveClass: "bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 font-bold border border-purple-200 dark:border-purple-900",
    drawerIconClass: "bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300",
  },
  {
    id: "electricity",
    labelKey: "nav.electricity",
    descriptionKey: "nav.descriptions.electricity",
    icon: Zap,
    accentColor: "text-amber-500 dark:text-amber-400",
    drawerActiveClass: "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 font-bold border border-amber-200 dark:border-amber-900",
    drawerIconClass: "bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300",
  },
  {
    id: "ai-analysis",
    labelKey: "nav.aiAnalysis",
    descriptionKey: "nav.descriptions.aiAnalysis",
    icon: Sparkles,
    accentColor: "text-amber-500 dark:text-amber-400",
    drawerActiveClass: "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 font-bold border border-amber-200 dark:border-amber-900",
    drawerIconClass: "bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300",
  },
  {
    id: "backup",
    labelKey: "nav.backup",
    descriptionKey: "nav.descriptions.backup",
    icon: FolderArchive,
    accentColor: "text-slate-600 dark:text-slate-300",
    drawerActiveClass: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 font-bold border border-indigo-200 dark:border-indigo-900",
    drawerIconClass: "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300",
  },
];

const MOBILE_PRIMARY_TABS = NAV_TAB_CONFIGS.slice(0, 5);
const MOBILE_MORE_TABS = NAV_TAB_CONFIGS.slice(5);

const readStoredTabMonth = (baseKey: string, specificUid?: string): string => {
  const stored = userStorage.getItem(baseKey, specificUid);
  if (stored && parseMonthKeyToYearMonth(stored)) {
    return stored;
  }
  return getCurrentMonthBulgarian();
};

const AppContent: React.FC = () => {
  const { language, t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [calendarInitialDate, setCalendarInitialDate] = useState<string | null>(null);
  const [pendingRecordTarget, setPendingRecordTarget] = useState<OpenRecordTarget | null>(null);
  const [defaultCurrentMonth] = useState(() => getCurrentMonthBulgarian());
  const [expensesSelectedMonth, setExpensesSelectedMonthState] = useState(() =>
    readStoredTabMonth(STORAGE_BASE_EXPENSES_MONTH)
  );
  const [incomeSelectedMonth, setIncomeSelectedMonthState] = useState(() =>
    readStoredTabMonth(STORAGE_BASE_INCOME_MONTH)
  );
  const updateExpensesSelectedMonth = useCallback((nextMonth: string) => {
    setExpensesSelectedMonthState(nextMonth);
    userStorage.setItem(STORAGE_BASE_EXPENSES_MONTH, nextMonth);
  }, []);
  const updateIncomeSelectedMonth = useCallback((nextMonth: string) => {
    setIncomeSelectedMonthState(nextMonth);
    userStorage.setItem(STORAGE_BASE_INCOME_MONTH, nextMonth);
  }, []);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [isGlobalRestoreModalOpen, setIsGlobalRestoreModalOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const pendingRecordTargetRef = useRef<OpenRecordTarget | null>(null);
  pendingRecordTargetRef.current = pendingRecordTarget;

  // Ensure initial branding splash remains visible for at least 2.4s while app initializes in parallel
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMinSplashElapsed(true);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, []);

  // Reset scroll to the top whenever switching tabs so each tab behaves like a separate screen
  useLayoutEffect(() => {
    resetPageScrollToTop(mainContentRef.current);

    if (pendingRecordTargetRef.current) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      if (!pendingRecordTargetRef.current) {
        resetPageScrollToTop(mainContentRef.current);
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [activeTab]);

  const handleSelectTab = useCallback(
    (tabId: Tab) => {
      setIsMobileMoreOpen(false);
      if (tabId === activeTab) {
        smoothScrollToTop(190, mainContentRef.current);
        return;
      }
      setActiveTab(tabId);
    },
    [activeTab]
  );

  const [monthlyData, setMonthlyData] = useState<
    Record<string, MonthlyRecord>
  >({});
  const [globalSavings, setGlobalSavings] = useState<IncomeItem[]>([]);
  const [notificationsStore, setNotificationsStore] = useState<NotificationsStoreState>(() =>
    createEmptyNotificationsState()
  );

  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  const {
    triggerAutoSync,
    syncStatus,
    user,
    storedProfile,
    activeUid,
    isAuthLoading,
    isSwitchingAccount,
    hasDriveAccessToken,
    driveSessionStatus,
    isRestoringDriveSession,
    isOnline,
    autoBackupEnabled,
    pendingRestoreOffer,
    syncConflict,
    dismissRestoreOffer,
    dismissSyncConflict,
    resolveConflictUseLocal,
    resolveConflictRestoreCloud,
    loginWithGoogle,
    reconnectGoogleDrive,
  } = useCloudSync();

  const monthlyDataRef = useRef<Record<string, MonthlyRecord>>({});
  monthlyDataRef.current = monthlyData;

  const notificationsStoreRef = useRef<NotificationsStoreState>(notificationsStore);
  notificationsStoreRef.current = notificationsStore;

  const displayUser = user || storedProfile;

  // Save helpers strictly scoped to the current activeUid (never capturing stale guest UID)
  const saveMonthlyToStorage = useCallback(
    (updated: Record<string, MonthlyRecord>, explicitUid?: string) => {
      const targetUid = explicitUid || userStorage.getActiveUid();
      userStorage.setJSON(STORAGE_BASE_MONTHLY, updated, targetUid);
      userStorage.markLocalModified(targetUid);
    },
    []
  );

  // Reload isolated data for the active user account
  const loadAccountWorkspaceData = useCallback((targetUid: string) => {
    setExpensesSelectedMonthState(
      readStoredTabMonth(STORAGE_BASE_EXPENSES_MONTH, targetUid)
    );
    setIncomeSelectedMonthState(
      readStoredTabMonth(STORAGE_BASE_INCOME_MONTH, targetUid)
    );
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
    const rawMonthly =
      storedMonthly && typeof storedMonthly === "object" ? storedMonthly : {};
    const { updatedMonthlyData: migratedMonthly, migratedCount } =
      normalizeMonthlyDataConsistency(rawMonthly);
    const { updatedMonthlyData: normalizedMonthly, generatedCount } =
      generateDueRecurringInstances(migratedMonthly);
    if (migratedCount > 0 || generatedCount > 0) {
      userStorage.setJSON(STORAGE_BASE_MONTHLY, normalizedMonthly, targetUid);
    }

    // Load and reconcile account-isolated notifications (actionable due/overdue & milestones)
    const nextNotifState = loadNotificationsStore(targetUid);
    const reconciled = reconcileAllNotifications(nextNotifState, {
      monthlyData: normalizedMonthly,
      goals: loadSavingsGoals(targetUid),
    });
    if (reconciled.changed) {
      saveNotificationsStore(reconciled.nextState, targetUid);
    }
    notificationsStoreRef.current = reconciled.nextState;
    setNotificationsStore(reconciled.nextState);

    monthlyDataRef.current = normalizedMonthly;
    setMonthlyData(normalizedMonthly);
    setGlobalSavings(Array.isArray(storedSavings) ? storedSavings : []);
    setWorkspaceRevision((prev) => prev + 1);
  }, []);

  // Load isolated storage whenever auth resolves or activeUid changes
  useEffect(() => {
    if (isAuthLoading || isSwitchingAccount) {
      // Clear active in-memory view during account transitions to avoid any data flash
      monthlyDataRef.current = {};
      setMonthlyData({});
      setGlobalSavings([]);
      const emptyNotifs = createEmptyNotificationsState();
      notificationsStoreRef.current = emptyNotifs;
      setNotificationsStore(emptyNotifs);
      return;
    }
    loadAccountWorkspaceData(activeUid);
  }, [activeUid, isAuthLoading, isSwitchingAccount, loadAccountWorkspaceData]);

  // Automatically normalize, materialize due recurring Expenses & Incomes, and sync notifications
  // Strictly independent of UI-selected month navigation (`currentMonth`): uses actual current date/time only.
  useEffect(() => {
    if (isAuthLoading || isSwitchingAccount) return;
    const { updatedMonthlyData: migratedMonthly, migratedCount } =
      normalizeMonthlyDataConsistency(monthlyDataRef.current);
    const { updatedMonthlyData, generatedCount } =
      generateDueRecurringInstances(migratedMonthly);
    const targetUid = userStorage.getActiveUid();

    if (migratedCount > 0 || generatedCount > 0) {
      monthlyDataRef.current = updatedMonthlyData;
      saveMonthlyToStorage(updatedMonthlyData, targetUid);
      setMonthlyData(updatedMonthlyData);
      triggerAutoSync();
    }

    // Reconcile actionable transaction & milestone notifications whenever monthlyData updates
    const recAll = reconcileAllNotifications(notificationsStoreRef.current, {
      monthlyData: updatedMonthlyData,
      goals: loadSavingsGoals(targetUid),
    });
    if (recAll.changed) {
      notificationsStoreRef.current = recAll.nextState;
      saveNotificationsStore(recAll.nextState, targetUid);
      setNotificationsStore(recAll.nextState);
    }
  }, [
    monthlyData,
    isAuthLoading,
    isSwitchingAccount,
    saveMonthlyToStorage,
    triggerAutoSync,
  ]);

  // Reconcile recurring generation + notifications when Savings Goals change, window regains focus, or date rolls over
  useEffect(() => {
    if (isAuthLoading || isSwitchingAccount) return;
    const syncGoalAndTimeNotifications = () => {
      const uid = userStorage.getActiveUid();
      const { updatedMonthlyData: migratedMonthly, migratedCount } =
        normalizeMonthlyDataConsistency(monthlyDataRef.current);
      const { updatedMonthlyData, generatedCount } =
        generateDueRecurringInstances(migratedMonthly);

      if (migratedCount > 0 || generatedCount > 0) {
        monthlyDataRef.current = updatedMonthlyData;
        saveMonthlyToStorage(updatedMonthlyData, uid);
        setMonthlyData(updatedMonthlyData);
        triggerAutoSync();
      }

      const res = reconcileAllNotifications(notificationsStoreRef.current, {
        monthlyData: updatedMonthlyData,
        goals: loadSavingsGoals(uid),
      });
      if (res.changed) {
        notificationsStoreRef.current = res.nextState;
        saveNotificationsStore(res.nextState, uid);
        setNotificationsStore(res.nextState);
      }
    };
    window.addEventListener(SAVINGS_GOALS_UPDATED_EVENT, syncGoalAndTimeNotifications);
    window.addEventListener("focus", syncGoalAndTimeNotifications);
    const timer = window.setInterval(syncGoalAndTimeNotifications, 60_000);
    return () => {
      window.removeEventListener(SAVINGS_GOALS_UPDATED_EVENT, syncGoalAndTimeNotifications);
      window.removeEventListener("focus", syncGoalAndTimeNotifications);
      window.clearInterval(timer);
    };
  }, [activeUid, isAuthLoading, isSwitchingAccount, saveMonthlyToStorage, triggerAutoSync]);

  // Emit backup/restore notification ONLY when triggered manually by the user (never for auto background sync)
  useEffect(() => {
    if (isAuthLoading || isSwitchingAccount) return;
    const handleManualBackupEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ action?: ManualBackupAction; timestamp?: string }>)?.detail;
      const action: ManualBackupAction =
        detail?.action === "manual_restore" ? "manual_restore" : "manual_backup";
      const timestamp = detail?.timestamp || new Date().toISOString();
      const uid = userStorage.getActiveUid();
      const res = recordBackupSuccessNotification(
        notificationsStoreRef.current,
        timestamp,
        action
      );
      if (res.changed) {
        notificationsStoreRef.current = res.nextState;
        saveNotificationsStore(res.nextState, uid);
        setNotificationsStore(res.nextState);
      }
    };
    window.addEventListener(MANUAL_BACKUP_NOTIFICATION_EVENT, handleManualBackupEvent);
    return () => {
      window.removeEventListener(MANUAL_BACKUP_NOTIFICATION_EVENT, handleManualBackupEvent);
    };
  }, [activeUid, isAuthLoading, isSwitchingAccount]);

  const saveSavingsToStorage = useCallback(
    (updated: IncomeItem[], explicitUid?: string) => {
      const targetUid = explicitUid || userStorage.getActiveUid();
      userStorage.setJSON(STORAGE_BASE_SAVINGS, updated, targetUid);
      userStorage.markLocalModified(targetUid);
    },
    []
  );

  // Add Electricity to Expenses (supports both 2-meter EM1+EM2 and 1-meter single bill)
  const handleAddElectricityToExpenses = useCallback(
    (em1Amount: number, em2Amount?: number) => {
      const targetUid = userStorage.getActiveUid();
      const prev = monthlyDataRef.current;
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

      // Remove any existing electricity calculator expenses to avoid duplicates
      const filteredExpenses = existingExpenses.filter(
        (e) => !e.categoryName.startsWith("Сметка Ток")
      );

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const newElectricityItems: ExpenseItem[] = [];

      if (typeof em2Amount === "number") {
        // Two-meter mode: preserve exact EM1 + EM2 expenses
        const em1Expense: ExpenseItem = {
          id: `electricity_em1_${nowMs}`,
          categoryId: "electricity",
          categoryName: "Сметка Ток - Електромер 1",
          categoryIcon: "Zap",
          categoryColor: "bg-yellow-100 text-yellow-600",
          amount: em1Amount,
          note: "",
          date: nowIso,
          createdAt: nowIso,
          timestamp: nowMs,
          completed: true,
          status: "completed",
          repeat: "never",
          completedAt: nowIso,
        };

        const em2Ms = nowMs + 1;
        const em2Iso = new Date(em2Ms).toISOString();
        const em2Expense: ExpenseItem = {
          id: `electricity_em2_${em2Ms}`,
          categoryId: "electricity",
          categoryName: "Сметка Ток - Електромер 2",
          categoryIcon: "Zap",
          categoryColor: "bg-yellow-100 text-yellow-600",
          amount: em2Amount,
          note: "",
          date: em2Iso,
          createdAt: em2Iso,
          timestamp: em2Ms,
          completed: true,
          status: "completed",
          repeat: "never",
          completedAt: em2Iso,
        };

        newElectricityItems.push(em1Expense, em2Expense);
      } else {
        // Single-meter mode: add single electricity bill expense
        const singleExpense: ExpenseItem = {
          id: `electricity_em1_${nowMs}`,
          categoryId: "electricity",
          categoryName: "Сметка Ток",
          categoryIcon: "Zap",
          categoryColor: "bg-yellow-100 text-yellow-600",
          amount: em1Amount,
          note: "",
          date: nowIso,
          createdAt: nowIso,
          timestamp: nowMs,
          completed: true,
          status: "completed",
          repeat: "never",
          completedAt: nowIso,
        };

        newElectricityItems.push(singleExpense);
      }

      const updated: MonthlyRecord = {
        ...existing,
        expenses: {
          saved_em2_eur: existing.expenses?.saved_em2_eur || 0,
          // Keep existing fixed expenses
          fixed_expenses: existing.expenses?.fixed_expenses || [],
          additional_expenses: [...filteredExpenses, ...newElectricityItems],
        },
      };

      const newData = { ...prev, [monthKey]: updated };
      monthlyDataRef.current = newData;
      saveMonthlyToStorage(newData, targetUid);
      setMonthlyData(newData);
      triggerAutoSync();
    },
    [activeUid, saveMonthlyToStorage, triggerAutoSync]
  );

  // Add manual electricity bill entry to Monthly Expenses as well as Electricity History
  const handleAddManualElectricityExpense = useCallback(
    (entry: {
      amount: number;
      month: string;
      year: string;
      note?: string;
      expenseId: string;
      createdAt: string;
      timestamp: number;
    }) => {
      const targetUid = userStorage.getActiveUid();
      const prev = monthlyDataRef.current;
      const monthKey = `${entry.month} ${entry.year}`;
      const existing = prev[monthKey] || createEmptyMonthlyRecord(monthKey);
      const existingExpenses = existing.expenses?.additional_expenses || [];

      const newExpense: ExpenseItem = {
        id: entry.expenseId,
        categoryId: "electricity",
        categoryName: "Ток",
        categoryIcon: "Zap",
        categoryColor: "bg-yellow-100 text-yellow-600",
        amount: entry.amount,
        note: entry.note,
        date: entry.createdAt,
        createdAt: entry.createdAt,
        timestamp: entry.timestamp,
        sourceMonth: monthKey,
        completed: true,
        status: "completed",
        repeat: "never",
        completedAt: entry.createdAt,
      };

      const updated: MonthlyRecord = {
        ...existing,
        expenses: {
          saved_em2_eur: existing.expenses?.saved_em2_eur || 0,
          fixed_expenses: existing.expenses?.fixed_expenses || [],
          additional_expenses: [...existingExpenses, newExpense],
        },
      };

      const newData = { ...prev, [monthKey]: updated };
      monthlyDataRef.current = newData;
      saveMonthlyToStorage(newData, targetUid);
      setMonthlyData(newData);
      triggerAutoSync();
    },
    [activeUid, saveMonthlyToStorage, triggerAutoSync]
  );

  // Monthly Expenses Save
  const handleSaveExpenses = useCallback(
    (expensesData: any, targetMonth?: string) => {
      const targetUid = userStorage.getActiveUid();
      const prev = monthlyDataRef.current;
      const monthKey =
        targetMonth || expensesSelectedMonth || getCurrentMonthBulgarian();

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

      let normalizedExpensesData = expensesData;
      if (
        expensesData &&
        (Array.isArray(expensesData.fixed_expenses) ||
          Array.isArray(expensesData.additional_expenses))
      ) {
        const partitioned = partitionExpensesByRepeat(
          Array.isArray(expensesData.fixed_expenses)
            ? expensesData.fixed_expenses
            : [],
          Array.isArray(expensesData.additional_expenses)
            ? expensesData.additional_expenses
            : []
        );
        normalizedExpensesData = {
          ...expensesData,
          fixed_expenses: partitioned.fixedExpenses,
          additional_expenses: partitioned.additionalExpenses,
        };
      }

      const updated: MonthlyRecord = {
        ...existing,
        expenses: normalizedExpensesData,
        incomes: existing.incomes || [],
      };

      const newData = { ...prev, [monthKey]: updated };
      monthlyDataRef.current = newData;
      saveMonthlyToStorage(newData, targetUid);
      setMonthlyData(newData);
      triggerAutoSync();
    },
    [expensesSelectedMonth, activeUid, saveMonthlyToStorage, triggerAutoSync]
  );

  // Toggle completion status (Изпълнено: true <-> false) for Expenses or Incomes from Dashboard
  const handleToggleRecordCompletion = useCallback(
    (
      monthKey: string,
      kind: "fixed" | "additional" | "income",
      recordId: string,
      nextCompleted?: boolean
    ) => {
      const targetUid = userStorage.getActiveUid();
      const prev = monthlyDataRef.current;
      const existing = prev[monthKey];
      if (!existing) return;

      if (kind === "income") {
        if (!Array.isArray(existing.incomes)) return;
        let changedIncome = false;
        const updatedIncomes = existing.incomes.map((inc) => {
          if (inc.id === recordId) {
            changedIncome = true;
            return toggleRecordCompletion(inc, nextCompleted);
          }
          return inc;
        });
        if (!changedIncome) return;

        const updated: MonthlyRecord = {
          ...existing,
          incomes: updatedIncomes,
        };
        const newData = { ...prev, [monthKey]: updated };
        monthlyDataRef.current = newData;
        saveMonthlyToStorage(newData, targetUid);
        setMonthlyData(newData);
        triggerAutoSync();
        return;
      }

      if (!existing.expenses) return;

      let toggledExpense: ExpenseItem | null = null;

      const updatedFixed =
        kind === "fixed" && Array.isArray(existing.expenses.fixed_expenses)
          ? existing.expenses.fixed_expenses.map((item) => {
              if (item.id === recordId) {
                toggledExpense = toggleRecordCompletion(item, nextCompleted);
                return toggledExpense;
              }
              return item;
            })
          : existing.expenses.fixed_expenses;

      const updatedAdditional =
        kind === "additional" && Array.isArray(existing.expenses.additional_expenses)
          ? existing.expenses.additional_expenses.map((item) => {
              if (item.id === recordId) {
                toggledExpense = toggleRecordCompletion(item, nextCompleted);
                return toggledExpense;
              }
              return item;
            })
          : existing.expenses.additional_expenses;

      if (!toggledExpense) return;

      const updated: MonthlyRecord = {
        ...existing,
        expenses: {
          ...existing.expenses,
          fixed_expenses: updatedFixed,
          additional_expenses: updatedAdditional,
        },
      };

      const newData = { ...prev, [monthKey]: updated };
      monthlyDataRef.current = newData;
      saveMonthlyToStorage(newData, targetUid);
      setMonthlyData(newData);
      upsertElectricityRecordFromExpense(toggledExpense, monthKey);
      triggerAutoSync();
    },
    [saveMonthlyToStorage, triggerAutoSync]
  );

  const handleOpenCalendar = useCallback((dateKey?: string) => {
    setCalendarInitialDate(dateKey || null);
    setActiveTab("calendar");
  }, []);

  const handleOpenRecordFromCalendar = useCallback((ev: CalendarEvent) => {
    if (ev.recordListType === "template") {
      setPendingRecordTarget({
        kind: "income",
        monthKey: ev.monthKey,
        recordId: ev.sourceId,
        recordListType: "template",
        templateId: ev.templateId,
        isProjected: ev.isProjected,
        nonce: Date.now(),
      });
      setActiveTab("income");
      return;
    }

    let targetMonthKey = ev.isProjected
      ? ev.sourceMonthKey || ev.monthKey
      : ev.monthKey;

    if (ev.isProjected && !ev.sourceMonthKey) {
      for (const [mKey, rec] of Object.entries(monthlyDataRef.current)) {
        if (!rec) continue;
        if (ev.kind === "expense") {
          const foundInFixed = (rec.expenses?.fixed_expenses || []).some(
            (i) => i.id === ev.sourceId
          );
          const foundInAdd = (rec.expenses?.additional_expenses || []).some(
            (i) => i.id === ev.sourceId
          );
          if (foundInFixed || foundInAdd) {
            targetMonthKey = mKey;
            break;
          }
        } else {
          const foundInInc = (rec.incomes || []).some(
            (i) => i.id === ev.sourceId
          );
          if (foundInInc) {
            targetMonthKey = mKey;
            break;
          }
        }
      }
    }

    if (ev.kind === "expense") {
      updateExpensesSelectedMonth(targetMonthKey);
    } else {
      updateIncomeSelectedMonth(targetMonthKey);
    }
    setPendingRecordTarget({
      kind: ev.kind,
      monthKey: targetMonthKey,
      recordId: ev.sourceId,
      recordListType: ev.recordListType,
      templateId: ev.templateId,
      isProjected: ev.isProjected,
      nonce: Date.now(),
    });
    setActiveTab(ev.kind === "expense" ? "monthly" : "income");
  }, [updateExpensesSelectedMonth, updateIncomeSelectedMonth]);

  const handleOpenDashboardRecord = useCallback(
    (target: { kind: "fixed" | "additional" | "income"; monthKey: string; id: string }) => {
      if (target.kind === "income") {
        updateIncomeSelectedMonth(target.monthKey);
      } else {
        updateExpensesSelectedMonth(target.monthKey);
      }
      setPendingRecordTarget({
        kind: target.kind === "income" ? "income" : "expense",
        monthKey: target.monthKey,
        recordId: target.id,
        recordListType: target.kind,
        nonce: Date.now(),
      });
      setActiveTab(target.kind === "income" ? "income" : "monthly");
    },
    [updateExpensesSelectedMonth, updateIncomeSelectedMonth]
  );

  // Notification Center Actions
  const updateAndSaveNotifications = useCallback(
    (updater: (prev: NotificationsStoreState) => NotificationsStoreState) => {
      const uid = userStorage.getActiveUid();
      const next = updater(notificationsStoreRef.current);
      notificationsStoreRef.current = next;
      saveNotificationsStore(next, uid);
      setNotificationsStore(next);
    },
    []
  );

  const handleMarkNotificationRead = useCallback(
    (id: string) => updateAndSaveNotifications((prev) => markNotificationAsRead(prev, id)),
    [updateAndSaveNotifications]
  );

  const handleMarkAllNotificationsRead = useCallback(
    () => updateAndSaveNotifications((prev) => markAllNotificationsAsRead(prev)),
    [updateAndSaveNotifications]
  );

  const handleDismissNotification = useCallback(
    (id: string) => updateAndSaveNotifications((prev) => dismissNotification(prev, id)),
    [updateAndSaveNotifications]
  );

  const handleDeleteNotification = useCallback(
    (id: string) => updateAndSaveNotifications((prev) => deleteNotification(prev, id)),
    [updateAndSaveNotifications]
  );

  const handleClearAllNotifications = useCallback(
    () => updateAndSaveNotifications((prev) => clearAllNotifications(prev)),
    [updateAndSaveNotifications]
  );

  const handleOpenNotificationTarget = useCallback(
    (target: NotificationTarget, notification: AppNotification) => {
      if (target.kind === "savings") {
        setActiveTab("savings");
        return;
      }
      if (target.kind === "backup") {
        setActiveTab("backup");
        return;
      }
      if (target.kind === "calendar") {
        handleOpenCalendar(target.dateKey || notification.dueDateKey);
        return;
      }
      if (target.monthKey && target.recordId) {
        const kind =
          target.recordListType || (target.kind === "income" ? "income" : "additional");
        handleOpenDashboardRecord({
          kind,
          monthKey: target.monthKey,
          id: target.recordId,
        });
        return;
      }
      if (target.dateKey || notification.dueDateKey) {
        handleOpenCalendar(target.dateKey || notification.dueDateKey);
      }
    },
    [handleOpenCalendar, handleOpenDashboardRecord]
  );

  const handleMaterializeProjectedEvent = useCallback(
    (ev: CalendarEvent) => {
      const targetUid = userStorage.getActiveUid();
      const prev = monthlyDataRef.current;
      const monthKey = ev.monthKey;
      const existing = prev[monthKey] || createEmptyMonthlyRecord(monthKey);
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const stableIso = dateKeyToStableIso(ev.dateKey);

      if (ev.kind === "income") {
        const newIncome: IncomeItem = {
          id: `inc_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
          categoryId: ev.categoryId,
          categoryName: ev.categoryName,
          categoryIcon: ev.categoryIcon,
          categoryColor: ev.categoryColor,
          amount: ev.amount,
          note: ev.note,
          ...(ev.location ? { location: ev.location } : {}),
          date: stableIso,
          expectedDate: ev.dateKey,
          createdAt: nowIso,
          timestamp: nowMs,
          type: "income",
          repeat: ev.repeat !== "never" ? ev.repeat : "monthly",
          ...(typeof ev.recurrenceDayOfMonth === "number"
            ? { recurrenceDayOfMonth: ev.recurrenceDayOfMonth }
            : {}),
          ...(typeof ev.recurrenceMonthOfYear === "number"
            ? { recurrenceMonthOfYear: ev.recurrenceMonthOfYear }
            : {}),
          ...(typeof ev.recurrenceDayOfWeek === "number"
            ? { recurrenceDayOfWeek: ev.recurrenceDayOfWeek }
            : {}),
          isRecurring: true,
          isFixedItem: true,
          recurringTemplateId: ev.templateId,
          recurrenceSourceId: ev.recurrenceSourceId || ev.sourceId,
          recurrenceOccurrenceKey: ev.recurrenceOccurrenceKey || ev.dateKey,
          completed: true,
          status: "completed",
          completedAt: nowIso,
        };

        const updated: MonthlyRecord = {
          ...existing,
          incomes: [...(existing.incomes || []), newIncome],
        };
        const newData = { ...prev, [monthKey]: updated };
        monthlyDataRef.current = newData;
        saveMonthlyToStorage(newData, targetUid);
        setMonthlyData(newData);

        if (ev.templateId && ev.recurrenceOccurrenceKey) {
          const templates = loadRecurringIncomes();
          const nextTemplates = templates.map((t) =>
            t.id === ev.templateId
              ? {
                  ...t,
                  handledOccurrences: {
                    ...(t.handledOccurrences || {}),
                    [ev.recurrenceOccurrenceKey!]: "confirmed" as const,
                  },
                }
              : t
          );
          saveRecurringIncomes(nextTemplates);
        }

        triggerAutoSync();
        return;
      }

      const newExpense: ExpenseItem = {
        id: `fix_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
        categoryId: ev.categoryId,
        categoryName: ev.categoryName,
        categoryIcon: ev.categoryIcon,
        categoryColor: ev.categoryColor,
        merchantName: ev.merchantName,
        amount: ev.amount,
        note: ev.note,
        ...(ev.location ? { location: ev.location } : {}),
        date: stableIso,
        expectedDate: ev.dateKey,
        createdAt: nowIso,
        timestamp: nowMs,
        sourceMonth: monthKey,
        repeat: ev.repeat !== "never" ? ev.repeat : "monthly",
        ...(typeof ev.recurrenceDayOfMonth === "number"
          ? { recurrenceDayOfMonth: ev.recurrenceDayOfMonth }
          : {}),
        ...(typeof ev.recurrenceMonthOfYear === "number"
          ? { recurrenceMonthOfYear: ev.recurrenceMonthOfYear }
          : {}),
        ...(typeof ev.recurrenceDayOfWeek === "number"
          ? { recurrenceDayOfWeek: ev.recurrenceDayOfWeek }
          : {}),
        isRecurring: true,
        isFixedItem: true,
        recurrenceSourceId: ev.recurrenceSourceId || ev.sourceId,
        recurrenceOccurrenceKey: ev.recurrenceOccurrenceKey || ev.dateKey,
        completed: true,
        status: "completed",
        completedAt: nowIso,
      };

      const existingExpenses = existing.expenses || {
        saved_em2_eur: 0,
        fixed_expenses: [],
        additional_expenses: [],
      };
      const updated: MonthlyRecord = {
        ...existing,
        expenses: {
          ...existingExpenses,
          fixed_expenses: [...(existingExpenses.fixed_expenses || []), newExpense],
        },
      };
      const newData = { ...prev, [monthKey]: updated };
      monthlyDataRef.current = newData;
      saveMonthlyToStorage(newData, targetUid);
      setMonthlyData(newData);
      upsertElectricityRecordFromExpense(newExpense, monthKey);
      triggerAutoSync();
    },
    [saveMonthlyToStorage, triggerAutoSync]
  );

  // Monthly Incomes Save (for any monthKey)
  const handleSaveIncomesForMonth = useCallback(
    (targetMonthKey: string, incomes: IncomeItem[]) => {
      const targetUid = userStorage.getActiveUid();
      const prev = monthlyDataRef.current;
      const monthKey =
        targetMonthKey || incomeSelectedMonth || getCurrentMonthBulgarian();
      const existing = prev[monthKey] || createEmptyMonthlyRecord(monthKey);

      const normalizedIncomes = Array.isArray(incomes)
        ? incomes.map((inc) => normalizeIncomeByRepeat(inc).item)
        : [];

      const updated: MonthlyRecord = {
        ...existing,
        incomes: normalizedIncomes,
      };

      const newData = { ...prev, [monthKey]: updated };
      monthlyDataRef.current = newData;
      saveMonthlyToStorage(newData, targetUid);
      setMonthlyData(newData);
      triggerAutoSync();
    },
    [incomeSelectedMonth, activeUid, saveMonthlyToStorage, triggerAutoSync]
  );

  // Global Savings Save
  const handleUpdateGlobalSavings = useCallback(
    (newSavings: IncomeItem[]) => {
      const targetUid = userStorage.getActiveUid();
      saveSavingsToStorage(newSavings, targetUid);
      setGlobalSavings(newSavings);
      triggerAutoSync();
    },
    [activeUid, saveSavingsToStorage, triggerAutoSync]
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

  const expensesMonthRecord = monthlyData[expensesSelectedMonth];
  const headerDisplayMonth =
    activeTab === "monthly"
      ? expensesSelectedMonth
      : activeTab === "income"
      ? incomeSelectedMonth
      : defaultCurrentMonth;

  if (!minSplashElapsed || isAuthLoading || isSwitchingAccount) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6 transition-colors relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.12),transparent_60%)] dark:bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.18),transparent_60%)]"
        />
        <BrandSplashLockup
          statusMessage={
            <div className="flex items-center gap-2 pt-1 text-slate-500 dark:text-slate-400 font-medium text-xs">
              <Loader2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 animate-spin shrink-0" />
              <span>
                {isSwitchingAccount
                  ? t("header.switchingProfile")
                  : t("header.loadingFinances")}
              </span>
            </div>
          }
        />
      </div>
    );
  }

  const handleShareApp = async () => {
    const shareUrl = APP_PRODUCTION_URL;
    const tagline = APP_TAGLINE;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: APP_NAME,
          text: `${APP_NAME} — ${tagline}`,
          url: shareUrl,
        });
        return;
      }
    } catch {
      // Dismissed or fallback to clipboard
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && shareUrl) {
        await navigator.clipboard.writeText(`${APP_NAME} — ${tagline}\n${shareUrl}`);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      }
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      <header className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 shadow-xs backdrop-blur-md transition-colors">
        <div className="max-w-6xl mx-auto header-safe-x">
          {/* Row 1: Brand Logo, Active Month & Controls */}
          <div className="flex justify-between items-center h-14 sm:h-15 gap-1.5 sm:gap-2 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <BrandHeaderLockup />
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50 whitespace-nowrap shrink-0">
                {formatLocalizedMonthYear(headerDisplayMonth, language)}
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">

              {/* Cloud Sync Status / User Profile Chip */}
              {displayUser ? (
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {driveSessionStatus === "needs_reauth" &&
                    autoBackupEnabled &&
                    isOnline &&
                    !isRestoringDriveSession && (
                      <button
                        type="button"
                        onClick={() => {
                          reconnectGoogleDrive().catch(() => setActiveTab("backup"));
                        }}
                        title={t("header.unsyncedTooltip")}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-[11px] font-semibold text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 transition-colors cursor-pointer"
                      >
                        <UploadCloud className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span className="hidden sm:inline">{t("header.syncBtn")}</span>
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => setActiveTab("backup")}
                    title={`Google Drive: ${displayUser.email || t("header.connectedLabel")}`}
                    className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
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
                          : isRestoringDriveSession || syncStatus === "syncing"
                          ? "bg-blue-500 animate-pulse"
                          : syncConflict
                          ? "bg-amber-500 animate-pulse"
                          : driveSessionStatus === "needs_reauth"
                          ? "bg-amber-400"
                          : syncStatus === "failed"
                          ? "bg-rose-500"
                          : hasDriveAccessToken || driveSessionStatus === "standby"
                          ? "bg-emerald-500"
                          : "bg-emerald-500"
                      }`}
                      title={
                        !isOnline
                          ? t("header.cloudOfflineShort")
                          : isRestoringDriveSession
                          ? t("header.driveRestoringSession")
                          : syncConflict
                          ? t("header.syncConflictTitle")
                          : driveSessionStatus === "needs_reauth"
                          ? t("header.cloudNeedsReauth")
                          : syncStatus === "syncing"
                          ? t("header.cloudSyncingShort")
                          : driveSessionStatus === "standby"
                          ? t("header.driveStandby")
                          : syncStatus === "synced"
                          ? t("header.driveConnectedSynced")
                          : syncStatus === "failed"
                          ? t("header.cloudError")
                          : t("header.driveConnected")
                      }
                    />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    loginWithGoogle().catch(() => setActiveTab("backup"));
                  }}
                  title={t("header.loginTooltip")}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/70 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer border border-indigo-200 dark:border-indigo-800"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span className="text-[11px] hidden sm:inline">{t("header.signInWithGoogle")}</span>
                  <span className="text-[11px] sm:hidden">{t("header.signInShort")}</span>
                </button>
              )}

              <ThemeToggle />
              <LanguageSwitcher />

              <NotificationCenter
                store={notificationsStore}
                onMarkAsRead={handleMarkNotificationRead}
                onMarkAllAsRead={handleMarkAllNotificationsRead}
                onDismiss={handleDismissNotification}
                onDelete={handleDeleteNotification}
                onClearAll={handleClearAllNotifications}
                onOpenTarget={handleOpenNotificationTarget}
                onOpenCalendarDate={(dateKey) => handleOpenCalendar(dateKey)}
                onCompleteTransaction={(monthKey, kind, recordId) =>
                  handleToggleRecordCompletion(monthKey, kind, recordId, true)
                }
              />
            </div>
          </div>

          {/* Row 2: Desktop Navigation (Hidden on mobile < md, visible on desktop >= md) */}
          <div className="py-2 hidden md:block">
            <nav
              aria-label={t("nav.desktopNavAria")}
              className="grid grid-cols-10 gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs"
            >
              {NAV_TAB_CONFIGS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const label = t(tab.labelKey);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleSelectTab(tab.id)}
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
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content (keyed by activeUid + workspaceRevision so switching accounts cleanly remounts all local tab state) */}
      <main
        ref={mainContentRef}
        key={`${activeUid}-${workspaceRevision}`}
        className="flex-1 max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 w-full pb-28 md:pb-8"
      >
        {activeTab === "dashboard" && (
          <DashboardTab
            monthlyData={monthlyData}
            globalSavings={globalSavings}
            onNavigateTab={handleSelectTab}
            onOpenCalendar={handleOpenCalendar}
            onOpenRecord={handleOpenDashboardRecord}
            onTriggerSync={triggerAutoSync}
            onToggleRecordCompletion={handleToggleRecordCompletion}
          />
        )}

        {activeTab === "monthly" && (
          <MonthlyExpensesTab
            currentMonth={expensesSelectedMonth}
            initialData={expensesMonthRecord}
            onSaveExpenses={handleSaveExpenses}
            allMonthlyData={monthlyData}
            onMonthChange={updateExpensesSelectedMonth}
            onOpenCalendar={handleOpenCalendar}
            pendingRecordTarget={pendingRecordTarget}
            onConsumeRecordTarget={() => setPendingRecordTarget(null)}
          />
        )}

        {activeTab === "income" && (
          <IncomeTab
            currentMonth={incomeSelectedMonth}
            allMonthlyData={monthlyData}
            onMonthChange={updateIncomeSelectedMonth}
            onSaveIncomesForMonth={handleSaveIncomesForMonth}
            onTriggerSync={triggerAutoSync}
            onOpenCalendar={handleOpenCalendar}
            pendingRecordTarget={pendingRecordTarget}
            onConsumeRecordTarget={() => setPendingRecordTarget(null)}
          />
        )}

        {activeTab === "calendar" && (
          <CalendarTab
            monthlyData={monthlyData}
            initialDateKey={calendarInitialDate}
            onConsumeInitialDate={() => setCalendarInitialDate(null)}
            onToggleRecordCompletion={({ monthKey, recordType, id, nextCompleted }) =>
              handleToggleRecordCompletion(monthKey, recordType, id, nextCompleted)
            }
            onMaterializeProjectedEvent={handleMaterializeProjectedEvent}
            onOpenEvent={handleOpenRecordFromCalendar}
            onNavigateTab={handleSelectTab}
          />
        )}

        {activeTab === "electricity" && (
          <ElectricityTab
            onAddToExpenses={handleAddElectricityToExpenses}
            monthlyData={monthlyData}
            onAddManualElectricityExpense={handleAddManualElectricityExpense}
          />
        )}

        {activeTab === "savings" && (
          <SavingsTab
            onUpdateSavings={handleUpdateGlobalSavings}
            savingsData={globalSavings}
            allMonthlyData={monthlyData}
            onTriggerSync={triggerAutoSync}
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
            onNavigateTab={handleSelectTab}
          />
        )}

        {activeTab === "ai-analysis" && (
          <AiAnalysisTab
            monthlyData={monthlyData}
            globalSavings={globalSavings}
            currentMonth={defaultCurrentMonth}
            onNavigateTab={handleSelectTab}
          />
        )}

        {activeTab === "backup" && (
          <BackupRestoreSection onDataRestored={handleDataRestored} />
        )}
      </main>

      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto transition-colors mb-16 md:mb-0">
        <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {APP_NAME} © {new Date().getFullYear()}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-medium">
              {APP_TAGLINE}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setIsAboutOpen(true)}
              className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>{t("header.aboutApp")}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSupportOpen(true)}
              className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300 hover:text-amber-700 dark:hover:text-amber-200 font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Coffee className="w-3.5 h-3.5 shrink-0" />
              <span>{t("brand.supportMenu")}</span>
            </button>
            <button
              type="button"
              onClick={handleShareApp}
              className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              <span>{shareCopied ? t("header.copiedShort") : t("brand.share")}</span>
            </button>
          </div>
        </div>
      </footer>

      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        onOpenSupport={() => {
          setIsAboutOpen(false);
          setIsSupportOpen(true);
        }}
      />
      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

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
                  {t("header.moreTitle")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("header.moreSubtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMoreOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label={t("header.closeMenuAria")}
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
                    onClick={() => handleSelectTab(tab.id)}
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
                        <span className="text-sm font-bold block">{t(tab.labelKey)}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {t(tab.descriptionKey)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setIsAboutOpen(true);
                }}
                className="min-h-[38px] px-1 inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>{t("header.aboutApp")}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  setIsSupportOpen(true);
                }}
                className="min-h-[38px] px-1 inline-flex items-center gap-1 text-amber-600 dark:text-amber-300 hover:text-amber-700 dark:hover:text-amber-200 font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Coffee className="w-3.5 h-3.5 shrink-0" />
                <span>{t("brand.supportMenu")}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMoreOpen(false);
                  handleShareApp();
                }}
                className="min-h-[38px] px-1 inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5 shrink-0" />
                <span>{shareCopied ? t("header.copiedShort") : t("brand.share")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (md:hidden) */}
      <nav
        aria-label={t("header.mobileNavBarAria")}
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
                onClick={() => handleSelectTab(tab.id)}
                className={`min-h-[48px] flex flex-col items-center justify-center transition-all cursor-pointer ${
                  isActive
                    ? `${tab.accentColor} font-bold scale-105`
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] tracking-tight truncate max-w-full px-0.5">
                  {t(tab.labelKey)}
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
            <span className="text-[10px] tracking-tight">{t("nav.more")}</span>
          </button>
        </div>
      </nav>

      {/* Global Safe Sync Conflict & Multi-Device Restore Resolution Modal */}
      {syncConflict &&
        syncConflict.uid === activeUid &&
        !isGlobalRestoreModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 animate-in zoom-in-95">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-3 rounded-xl ${
                      syncConflict.reason === "fresh_device"
                        ? "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {syncConflict.reason === "fresh_device" ? (
                      <DownloadCloud className="w-6 h-6" />
                    ) : (
                      <AlertTriangle className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      {syncConflict.reason === "fresh_device"
                        ? t("backup.conflictModal.freshTitle")
                        : syncConflict.reason === "cloud_newer"
                        ? t("backup.conflictModal.cloudNewerTitle")
                        : t("backup.conflictModal.divergedTitle")}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {user?.email || t("backup.conflictModal.yourAccountFallback")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissSyncConflict}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {syncConflict.reason === "fresh_device"
                  ? t("backup.conflictModal.freshBody")
                  : t("backup.conflictModal.divergedBody")}
              </p>

              {/* Version Comparison Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {t("backup.conflictModal.localVersionTitle")}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {syncConflict.localUpdatedAt
                      ? formatLocalizedDateTime(syncConflict.localUpdatedAt, language)
                      : t("backup.conflictModal.noRecordedChange")}
                  </div>
                  <div className="mt-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    {t("backup.conflictModal.countsLine", {
                      expenses: syncConflict.localSummary.expensesCount,
                      incomes: syncConflict.localSummary.incomeCount,
                    })}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70">
                  <div className="font-bold text-emerald-900 dark:text-emerald-200">
                    {t("backup.conflictModal.cloudVersionTitle")}
                  </div>
                  <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400 mt-0.5">
                    {syncConflict.cloudUpdatedAt
                      ? formatLocalizedDateTime(syncConflict.cloudUpdatedAt, language)
                      : t("backup.conflictModal.availableArchive")}
                  </div>
                  {syncConflict.cloudBackup && (
                    <div className="mt-1.5 text-[11px] font-medium text-emerald-900 dark:text-emerald-200">
                      {t("backup.conflictModal.countsLine", {
                        expenses: syncConflict.cloudBackup.summary.expensesCount,
                        incomes: syncConflict.cloudBackup.summary.incomeCount,
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap items-center justify-end gap-2 pt-2">
                {syncConflict.reason !== "fresh_device" && (
                  <button
                    type="button"
                    disabled={isResolvingConflict}
                    onClick={async () => {
                      setIsResolvingConflict(true);
                      try {
                        const res = await resolveConflictUseLocal();
                        if (res?.success) {
                          dispatchManualBackupNotification("manual_backup");
                        }
                      } finally {
                        setIsResolvingConflict(false);
                      }
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isResolvingConflict ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UploadCloud className="w-4 h-4" />
                    )}
                    <span>{t("backup.useLocalBtn")}</span>
                  </button>
                )}

                {syncConflict.cloudBackup && (
                  <button
                    type="button"
                    disabled={isResolvingConflict}
                    onClick={() => {
                      const res = resolveConflictRestoreCloud("merge");
                      if (res?.success) {
                        dispatchManualBackupNotification("manual_restore");
                      }
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <DownloadCloud className="w-4 h-4" />
                    <span>
                      {syncConflict.reason === "fresh_device"
                        ? t("backup.conflictModal.restoreFromDrive")
                        : t("backup.restoreMergeBtn")}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsGlobalRestoreModalOpen(true)}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  {t("backup.conflictModal.moreOptions")}
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Fallback Auto-Detected Cloud Backup Restore Offer when preview wasn't pre-loaded */}
      {!syncConflict &&
        pendingRestoreOffer &&
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
                      {t("backup.conflictModal.freshTitle")}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {user?.email || t("backup.conflictModal.yourAccountFallback")}
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
                {t("backup.conflictModal.restoreOfferBody", {
                  datePart: pendingRestoreOffer.fileInfo.modifiedTime
                    ? `${t("backup.conflictModal.ofDatePrefix")}${formatLocalizedDateTime(
                        pendingRestoreOffer.fileInfo.modifiedTime,
                        language
                      )}`
                    : "",
                })}
              </p>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={dismissRestoreOffer}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  {t("backup.conflictModal.laterBtn")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsGlobalRestoreModalOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>{t("backup.conflictModal.restoreFromDrive")}</span>
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
    <I18nProvider>
      <ThemeProvider>
        <CloudSyncProvider>
          <AppContent />
        </CloudSyncProvider>
      </ThemeProvider>
    </I18nProvider>
  );
};

export default App;
