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

export interface ExpenseCategory {
  id: string;
  name: string;
  iconName: string; // Lucide icon name
  colorClass: string; // Tailwind color class for background/text
  isCustom?: boolean;
}

export interface ExpenseItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  amount: number;
  note?: string;
  date: string;
}

export interface IncomeItem extends ExpenseItem {
  type?: 'income' | 'expense'; // 'income' adds to savings, 'expense' subtracts
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
