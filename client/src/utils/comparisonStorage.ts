import { MonthlyRecord, IncomeItem, ExpenseItem } from "@/types";
import { getStoredElectricityHistory } from "./electricityStorage";

export const MONTHS_BG = [
  "Януари",
  "Февруари",
  "Март",
  "Април",
  "Май",
  "Юни",
  "Юли",
  "Август",
  "Септември",
  "Октомври",
  "Ноември",
  "Декември",
];

export interface MetricComparison {
  name: string;
  currentValue: number;
  previousValue: number;
  difference: number; // current - previous
  percentageChange: number; // percentage change
  formattedPercentage: string; // e.g. "+8%", "-15%"
  trend: "improvement" | "negative" | "neutral";
  isImprovement: boolean;
  label: string;
}

export interface MonthComparisonData {
  currentMonthLabel: string;
  previousMonthLabel: string;
  hasPreviousData: boolean;
  income: MetricComparison;
  expenses: MetricComparison;
  savings: MetricComparison;
  electricity: MetricComparison;
}

/**
 * Given a month name and year (e.g. "Ноември", 2026), returns the previous month name and year.
 */
export function getPreviousMonthAndYear(
  monthName: string,
  year: number
): { prevMonth: string; prevYear: number } {
  const idx = MONTHS_BG.indexOf(monthName);
  if (idx === -1) {
    // Default fallback
    return { prevMonth: "Октомври", prevYear: year };
  }

  if (idx === 0) {
    return { prevMonth: MONTHS_BG[11], prevYear: year - 1 };
  }

  return { prevMonth: MONTHS_BG[idx - 1], prevYear: year };
}

/**
 * Calculates total expenses for a single monthly record
 */
export function calculateMonthExpenses(record: MonthlyRecord | undefined): number {
  if (!record || !record.expenses) return 0;
  let total = 0;

  if (Array.isArray(record.expenses.fixed_expenses)) {
    total += record.expenses.fixed_expenses.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );
  } else if (record.expenses.fixed_expenses) {
    const leg = record.expenses.fixed_expenses as any;
    total += (Number(leg.credit_eur) || 0) + (Number(leg.phone_eur) || 0) + (Number(leg.internet_eur) || 0);
  }

  if (Array.isArray(record.expenses.additional_expenses)) {
    total += record.expenses.additional_expenses.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );
  }

  return parseFloat(total.toFixed(2));
}

/**
 * Calculates total income for a given month and year (strictly from MonthlyRecord.incomes; Savings are NOT income)
 */
export function calculateMonthIncome(
  _monthName: string,
  _year: number,
  record: MonthlyRecord | undefined,
  _globalSavings: IncomeItem[] = []
): number {
  let total = 0;
  const seenIds = new Set<string>();

  // Incomes recorded inside monthlyRecord
  if (record && record.incomes && Array.isArray(record.incomes)) {
    record.incomes.forEach((inc) => {
      if (inc && inc.amount > 0 && inc.type !== "expense" && !seenIds.has(inc.id)) {
        seenIds.add(inc.id);
        total += Number(inc.amount) || 0;
      }
    });
  }

  return parseFloat(total.toFixed(2));
}

/**
 * Calculates net savings contributed in a given month and year
 */
export function calculateMonthSavings(
  monthName: string,
  year: number,
  globalSavings: IncomeItem[]
): number {
  const monthIdx = MONTHS_BG.indexOf(monthName);
  let total = 0;

  globalSavings.forEach((tx) => {
    if (!tx || !tx.date) return;
    const d = new Date(tx.date);
    if (!isNaN(d.getTime())) {
      if (d.getFullYear() === year && d.getMonth() === monthIdx) {
        if (tx.type === "expense") {
          total -= Number(tx.amount) || 0;
        } else {
          total += Number(tx.amount) || 0;
        }
      }
    }
  });

  return parseFloat(total.toFixed(2));
}

/**
 * Calculates electricity cost for a given month and year
 */
export function calculateMonthElectricity(
  monthName: string,
  year: number,
  record: MonthlyRecord | undefined
): number {
  // 1. First check in Electricity History
  const history = getStoredElectricityHistory();
  const foundInHistory = history.find(
    (h) =>
      h.month.toLowerCase() === monthName.toLowerCase() &&
      Number(h.year) === year
  );
  if (foundInHistory && foundInHistory.totalCost > 0) {
    return parseFloat(foundInHistory.totalCost.toFixed(2));
  }

  // 2. Check in MonthlyRecord inputs or results
  if (record) {
    if (record.inputs && record.inputs.invoice_total > 0) {
      return parseFloat(record.inputs.invoice_total.toFixed(2));
    }
    if (record.results) {
      const sum =
        (Number(record.results.cost_em1_eur) || 0) +
        (Number(record.results.em2_remainder_eur) || 0);
      if (sum > 0) return parseFloat(sum.toFixed(2));
    }
    // Check in record.expenses
    if (record.expenses) {
      if (record.expenses.saved_em2_eur > 0) {
        return parseFloat(record.expenses.saved_em2_eur.toFixed(2));
      }
      if (Array.isArray(record.expenses.additional_expenses)) {
        const elecItems = record.expenses.additional_expenses.filter(
          (e) =>
            e.categoryId === "electricity" ||
            e.categoryName.toLowerCase().includes("ток")
        );
        if (elecItems.length > 0) {
          const sum = elecItems.reduce((acc, curr) => acc + curr.amount, 0);
          return parseFloat(sum.toFixed(2));
        }
      }
    }
  }

  return 0;
}

/**
 * Helper to compute percentage change and determine whether it represents an improvement
 * Metric rule:
 * - higherIsBetter = true (Income, Savings):
 *     Increase (+%) -> Improvement (Green)
 *     Decrease (-%) -> Negative Trend (Red)
 * - higherIsBetter = false (Expenses, Electricity):
 *     Increase (+%) -> Negative Trend (Red)
 *     Decrease (-%) -> Improvement (Green)
 */
function buildMetricComparison(
  name: string,
  currentVal: number,
  prevVal: number,
  higherIsBetter: boolean,
  labelPrefix: string
): MetricComparison {
  const diff = parseFloat((currentVal - prevVal).toFixed(2));

  let pct = 0;
  if (prevVal === 0) {
    if (currentVal > 0) pct = 100;
    else if (currentVal < 0) pct = -100;
    else pct = 0;
  } else {
    pct = parseFloat((((currentVal - prevVal) / Math.abs(prevVal)) * 100).toFixed(1));
  }

  // Format string with explicit sign, e.g. "+8%", "-15%"
  let formattedPct = `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
  if (pct === 0) formattedPct = "0%";

  let trend: "improvement" | "negative" | "neutral" = "neutral";
  let isImprovement = false;

  if (pct !== 0) {
    if (higherIsBetter) {
      // Income, Savings: positive change is an improvement
      if (diff > 0) {
        trend = "improvement";
        isImprovement = true;
      } else {
        trend = "negative";
        isImprovement = false;
      }
    } else {
      // Expenses, Electricity: negative change (spending less) is an improvement!
      if (diff < 0) {
        trend = "improvement";
        isImprovement = true;
      } else {
        trend = "negative";
        isImprovement = false;
      }
    }
  }

  return {
    name,
    currentValue: currentVal,
    previousValue: prevVal,
    difference: diff,
    percentageChange: pct,
    formattedPercentage: formattedPct,
    trend,
    isImprovement,
    label: `${labelPrefix} ${formattedPct}`,
  };
}

/**
 * Computes Month-to-Month comparison for Income, Expenses, Savings, and Electricity Costs
 */
export function computeMonthToMonthComparison(
  currentMonthName: string,
  currentYear: number,
  monthlyData: Record<string, MonthlyRecord>,
  globalSavings: IncomeItem[] = []
): MonthComparisonData {
  const { prevMonth, prevYear } = getPreviousMonthAndYear(
    currentMonthName,
    currentYear
  );

  const curKey = `${currentMonthName} ${currentYear}`;
  const prevKey = `${prevMonth} ${prevYear}`;

  const curRecord = monthlyData[curKey];
  const prevRecord = monthlyData[prevKey];

  // 1. Income
  const curIncome = calculateMonthIncome(
    currentMonthName,
    currentYear,
    curRecord,
    globalSavings
  );
  const prevIncome = calculateMonthIncome(
    prevMonth,
    prevYear,
    prevRecord,
    globalSavings
  );
  const incomeComp = buildMetricComparison(
    "Приходи",
    curIncome,
    prevIncome,
    true, // Higher income is better
    "Приходи"
  );

  // 2. Expenses
  const curExpenses = calculateMonthExpenses(curRecord);
  const prevExpenses = calculateMonthExpenses(prevRecord);
  const expensesComp = buildMetricComparison(
    "Разходи",
    curExpenses,
    prevExpenses,
    false, // Lower expenses is better (Expenses +8% is Negative/Red, Expenses -5% is Green)
    "Разходи"
  );

  // 3. Savings
  const curSavings = calculateMonthSavings(
    currentMonthName,
    currentYear,
    globalSavings
  );
  const prevSavings = calculateMonthSavings(prevMonth, prevYear, globalSavings);
  const savingsComp = buildMetricComparison(
    "Спестявания",
    curSavings,
    prevSavings,
    true, // Higher savings is better (Savings -15% is Negative/Red)
    "Спестявания"
  );

  // 4. Electricity Costs
  const curElectricity = calculateMonthElectricity(
    currentMonthName,
    currentYear,
    curRecord
  );
  const prevElectricity = calculateMonthElectricity(
    prevMonth,
    prevYear,
    prevRecord
  );
  const electricityComp = buildMetricComparison(
    "Сметка ТОК",
    curElectricity,
    prevElectricity,
    false, // Lower electricity bill is better (Electricity +12% is Negative/Red)
    "Ток"
  );

  const hasPreviousData =
    prevExpenses > 0 || prevIncome > 0 || prevSavings !== 0 || prevElectricity > 0;

  return {
    currentMonthLabel: `${currentMonthName} ${currentYear}`,
    previousMonthLabel: `${prevMonth} ${prevYear}`,
    hasPreviousData,
    income: incomeComp,
    expenses: expensesComp,
    savings: savingsComp,
    electricity: electricityComp,
  };
}
