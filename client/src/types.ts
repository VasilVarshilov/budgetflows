export interface ElectricityInputs {
  oldT1: string;
  newT1: string;
  oldT2: string;
  newT2: string;
  priceT1: string;
  priceT2: string;
  invoiceTotal: string;
}

export interface ElectricityResults {
  consT1: number;
  consT2: number;
  totalCons: number;
  costEm1: number;
  em2Remainder: number;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ElectricityRecord {
  id: string;
  createdAt: string; // ISO date string
  month: string; // e.g. "Ноември"
  year: string; // e.g. "2026"
  periodLabel: string; // e.g. "Ноември 2026"
  
  // Previous Reading
  previousReading: number; // total: prevT1 + prevT2
  prevT1: number;
  prevT2: number;
  
  // Current Reading
  currentReading: number; // total: currT1 + currT2
  currT1: number;
  currT2: number;
  
  // Consumption
  consumption: number; // totalCons = consT1 + consT2 (kWh)
  consT1: number;
  consT2: number;
  
  // Unit Price
  unitPrice: number; // Average price per kWh (€)
  priceT1: number;
  priceT2: number;
  
  // Total Cost
  totalCost: number; // Invoice total (€)
  costEm1: number;
  em2Remainder: number;
  
  note?: string;
  source?: "calculator" | "manual" | "receipt" | "imported";
  sourceExpenseId?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  iconName: string; // Lucide icon name
  colorClass: string; // Tailwind color class for background/text
  isCustom?: boolean;
}

export interface ReceiptItemDetail {
  name: string;
  price: number; // Final price after discount (synced with finalPrice ?? price)
  quantity?: number;
  originalPrice?: number;
  discount?: number;
  finalPrice?: number;
  discountLabel?: string;
}

export type ExpenseStatus = "planned" | "completed";

export type RepeatFrequency =
  | "never"
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "yearly";

export interface ExpenseItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  amount: number;
  note?: string;
  date: string;
  /** Optional explicit YYYY-MM-DD expected transaction date used for Calendar & planning. */
  expectedDate?: string;
  createdAt?: string;
  timestamp?: number;
  /** Universal completion status. Default when undefined: resolves via isRecordCompleted(). */
  completed?: boolean;
  /** Legacy v1 status mirror kept in sync with completed for backward compatibility. */
  status?: ExpenseStatus;
  completedAt?: string; // ISO timestamp when marked completed
  merchantName?: string;
  receiptItems?: ReceiptItemDetail[];
  /** Legacy recurring marker / UI indicator (kept synced when repeat !== "never"). */
  isRecurring?: boolean;
  /** Explicit recurring schedule frequency for automatic future instance generation. */
  repeat?: RepeatFrequency;
  /** Parent record ID for auto-generated future recurring occurrences. */
  recurrenceSourceId?: string;
  /** Occurrence key (YYYY-MM-DD) for idempotent generation & dismissal tracking. */
  recurrenceOccurrenceKey?: string;
  isFixedItem?: boolean;
  sourceMonth?: string;
  budgetCategoryId?: string; // Unique budget category ID (e.g. 'b_food', 'b_entertainment') or 'none'
  budgetCategoryName?: string; // Display cache of the assigned budget category name
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  allocatedAmount: number;
  description?: string;
  isEmergencyFund?: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RecurrenceFrequency = 'monthly' | 'weekly' | 'yearly';

export interface IncomeItem extends ExpenseItem {
  type?: 'income' | 'expense'; // 'income' adds to savings/income, 'expense' subtracts from savings
  frequency?: RecurrenceFrequency;
  recurringTemplateId?: string;
}

export interface OpenRecordTarget {
  kind: "expense" | "income";
  monthKey: string;
  recordId: string;
  recordListType?: "fixed" | "additional" | "income" | "template";
  templateId?: string;
  isProjected?: boolean;
  nonce: number;
}

export interface RecurringIncomeTemplate {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  amount: number;
  note?: string;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number; // 1-31 for monthly or yearly
  monthOfYear?: number; // 0-11 for yearly
  dayOfWeek?: number; // 0 (Sun) - 6 (Sat) for weekly
  startDate: string; // YYYY-MM-DD
  active: boolean;
  createdAt: string;
  /** Map of period occurrence key (YYYY-MM for monthly, YYYY-MM-DD for weekly, YYYY for yearly) -> 'confirmed' | 'skipped' */
  handledOccurrences?: Record<string, 'confirmed' | 'skipped'>;
}

export interface MonthlyRecord {
  month: string;
  tab: string; // Main active tab when saved, or just metadata
  inputs: {
    old_t1: number;
    new_t1: number;
    old_t2: number;
    new_t2: number;
    day_price_with_vat: number;
    night_price_with_vat: number;
    invoice_total: number;
  };
  results: {
    cons_t1_kwh: number;
    cons_t2_kwh: number;
    total_cons_em1_kwh: number;
    cost_em1_eur: number;
    em2_remainder_eur: number;
  };
  expenses?: {
    saved_em2_eur: number; // The user-saved or edited value
    // UPDATED: Fixed expenses is now an array of items
    fixed_expenses: ExpenseItem[];
    additional_expenses: ExpenseItem[];
  };
  incomes?: IncomeItem[];
  meta: {
    generated_at: string;
  };
}

export interface AppSettings {
  currency: string; // 'EUR'
  language: string; // 'bg' | 'en'
  theme: 'light' | 'dark' | 'system';
  autoSaveElectricity: boolean;
  defaultPriceT1: string;
  defaultPriceT2: string;
  lastBackupDate?: string;
  notificationReminder?: boolean;
  savingsTargetPercent?: number; // e.g., 20 for 20% automatic savings suggestion
}

export interface BudgetConfig {
  id: string;
  categoryName: string;
  categoryId?: string;
  monthlyLimit: number; // in EUR
  period?: string; // 'all' or month label
}

export interface CategoriesStore {
  expenseCategories: ExpenseCategory[];
  incomeCategories: ExpenseCategory[];
}

export interface BackupData {
  version: string;
  appName: string;
  exportDate: string;
  dataUpdatedAt?: string;
  ownerUid?: string;
  ownerEmail?: string | null;
  summary: {
    incomeCount: number;
    expensesCount: number;
    savingsCount: number;
    electricityCount: number;
    categoriesCount: number;
    budgetsCount: number;
    recurringIncomesCount?: number;
    monthsCovered: string[];
  };
  data: {
    income: IncomeItem[];
    expenses: {
      monthlyRecords: Record<string, MonthlyRecord>;
      totalExpensesCount: number;
    };
    savings: IncomeItem[];
    electricityHistory: ElectricityRecord[];
    electricityLastReadings?: ElectricityInputs;
    categories: CategoriesStore;
    budgets: BudgetConfig[];
    settings: AppSettings;
    recurringIncomes?: RecurringIncomeTemplate[];
  };
}
