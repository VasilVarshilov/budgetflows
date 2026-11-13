import { MonthlyRecord, ExpenseItem, IncomeItem } from "@/types";
import { SYSTEM_CATEGORY_COLORS, getHexFromTailwindClass } from "@/utils/colors";

export type ExportPeriodType = "month" | "year" | "custom";

export interface CategorySummary {
  name: string;
  amount: number;
  percentage: number;
  color: string;
  count: number;
}

export interface MonthlyTrendItem {
  monthKey: string;
  shortLabel: string;
  monthIndex: number;
  year: number;
  income: number;
  expenses: number;
  savings: number;
  netBalance: number;
}

export interface ExportReportData {
  periodType: ExportPeriodType;
  periodLabel: string;
  dateRangeText: string;
  generatedAt: string;
  incomeTotal: number;
  expensesTotal: number;
  fixedExpensesTotal: number;
  additionalExpensesTotal: number;
  savingsTotal: number; // Net savings in period
  netBalance: number; // Income - Expenses
  savingsRate: number; // (Savings / Income) * 100 or 0
  categoryBreakdown: CategorySummary[];
  incomeCategoryBreakdown: CategorySummary[];
  monthlyBreakdown: MonthlyTrendItem[];
  recordCount: number;
  detailedRecords: {
    key: string;
    month: string;
    year: number;
    record: MonthlyRecord;
  }[];
}

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

export const MONTHS_SHORT_BG = [
  "Яну",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Юни",
  "Юли",
  "Авг",
  "Сеп",
  "Окт",
  "Ное",
  "Дек",
];

const DEFAULT_PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#f97316", // orange
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#84cc16", // lime
  "#a855f7", // violet
];

/**
 * Aggregates all data from monthlyData and globalSavings for the given period.
 */
export function aggregateExportData(params: {
  periodType: ExportPeriodType;
  selectedMonth: string;
  selectedYear: string;
  customStartDate: string; // YYYY-MM-DD
  customEndDate: string; // YYYY-MM-DD
  monthlyData: Record<string, MonthlyRecord>;
  globalSavings: IncomeItem[];
}): ExportReportData {
  const {
    periodType,
    selectedMonth,
    selectedYear,
    customStartDate,
    customEndDate,
    monthlyData,
    globalSavings = [],
  } = params;

  // 1. Parse monthlyData keys
  const parsedMonths: {
    key: string;
    month: string;
    year: number;
    monthIndex: number;
    record: MonthlyRecord;
  }[] = [];

  Object.entries(monthlyData).forEach(([key, record]) => {
    if (!record) return;
    const parts = key.trim().split(" ");
    if (parts.length >= 2) {
      const month = parts[0];
      const year = parseInt(parts[1], 10);
      const monthIndex = MONTHS_BG.indexOf(month);
      if (!isNaN(year) && monthIndex !== -1) {
        parsedMonths.push({ key, month, year, monthIndex, record });
      }
    }
  });

  // 2. Filter active months based on period
  let activeMonths = parsedMonths;
  let periodLabel = "";
  let dateRangeText = "";

  if (periodType === "month") {
    const targetKey = `${selectedMonth} ${selectedYear}`;
    activeMonths = parsedMonths.filter((p) => p.key === targetKey);
    periodLabel = `${selectedMonth} ${selectedYear}`;
    dateRangeText = `${selectedMonth} ${selectedYear}`;
  } else if (periodType === "year") {
    const targetYear = parseInt(selectedYear, 10);
    activeMonths = parsedMonths.filter((p) => p.year === targetYear);
    periodLabel = `${selectedYear} година`;
    dateRangeText = `01.01.${selectedYear} – 31.12.${selectedYear}`;
  } else if (periodType === "custom") {
    const sDate = new Date(customStartDate + "T00:00:00");
    const eDate = new Date(customEndDate + "T23:59:59");
    const sFormatted = new Date(customStartDate).toLocaleDateString("bg-BG");
    const eFormatted = new Date(customEndDate).toLocaleDateString("bg-BG");
    periodLabel = `${sFormatted} – ${eFormatted}`;
    dateRangeText = `${sFormatted} – ${eFormatted}`;

    activeMonths = parsedMonths.filter((p) => {
      const mStart = new Date(p.year, p.monthIndex, 1);
      const mEnd = new Date(p.year, p.monthIndex + 1, 0, 23, 59, 59);
      return mEnd >= sDate && mStart <= eDate;
    });
  }

  // Sort active months chronologically
  activeMonths.sort((a, b) => a.year * 12 + a.monthIndex - (b.year * 12 + b.monthIndex));

  // 3. Filter globalSavings by date
  const filteredSavings = globalSavings.filter((tx) => {
    if (!tx || !tx.date) return false;
    const txDate = new Date(tx.date);
    if (isNaN(txDate.getTime())) return false;

    if (periodType === "month") {
      const mIdx = MONTHS_BG.indexOf(selectedMonth);
      const y = parseInt(selectedYear, 10);
      return txDate.getFullYear() === y && txDate.getMonth() === mIdx;
    }
    if (periodType === "year") {
      const y = parseInt(selectedYear, 10);
      return txDate.getFullYear() === y;
    }
    if (periodType === "custom") {
      const sDate = new Date(customStartDate + "T00:00:00");
      const eDate = new Date(customEndDate + "T23:59:59");
      return txDate >= sDate && txDate <= eDate;
    }
    return true;
  });

  // 4. Compute Income & Savings from filteredSavings + record.incomes
  let incomeTotal = 0;
  let savingsTotal = 0; // Net added to savings
  const seenIncomeIds = new Set<string>();
  const incomeCategoryMap: Record<
    string,
    { amount: number; color?: string; count: number }
  > = {};

  const sCustomDate = periodType === "custom" ? new Date(customStartDate + "T00:00:00") : null;
  const eCustomDate = periodType === "custom" ? new Date(customEndDate + "T23:59:59") : null;

  filteredSavings.forEach((tx) => {
    if (tx.type === "expense") {
      savingsTotal -= tx.amount;
    } else {
      seenIncomeIds.add(tx.id);
      incomeTotal += tx.amount;
      savingsTotal += tx.amount;

      const catName = tx.categoryName || "Спестявания / Приход";
      if (!incomeCategoryMap[catName]) {
        incomeCategoryMap[catName] = {
          amount: 0,
          color: tx.categoryColor ? getHexFromTailwindClass(tx.categoryColor) : "#10b981",
          count: 0,
        };
      }
      incomeCategoryMap[catName].amount += tx.amount;
      incomeCategoryMap[catName].count += 1;
    }
  });

  // Also include explicit monthly incomes from MonthlyRecord.incomes (Income Tab)
  // Note: MonthlyRecord.incomes are income entries, NOT savings fund deposits.
  activeMonths.forEach(({ record }) => {
    if (record.incomes && Array.isArray(record.incomes)) {
      record.incomes.forEach((inc) => {
        if (!inc || inc.amount <= 0) return;

        if (periodType === "custom" && inc.date && sCustomDate && eCustomDate) {
          const incDate = new Date(inc.date);
          if (!isNaN(incDate.getTime()) && (incDate < sCustomDate || incDate > eCustomDate)) {
            return;
          }
        }

        if (!seenIncomeIds.has(inc.id) && inc.type !== "expense") {
          seenIncomeIds.add(inc.id);
          incomeTotal += inc.amount;

          const catName = inc.categoryName || "Други приходи";
          if (!incomeCategoryMap[catName]) {
            incomeCategoryMap[catName] = {
              amount: 0,
              color: inc.categoryColor ? getHexFromTailwindClass(inc.categoryColor) : "#10b981",
              count: 0,
            };
          }
          incomeCategoryMap[catName].amount += inc.amount;
          incomeCategoryMap[catName].count += 1;
        }
      });
    }
  });

  // 5. Compute Expenses & Category Breakdown
  let fixedExpensesTotal = 0;
  let additionalExpensesTotal = 0;
  const categoryMap: Record<
    string,
    { amount: number; color?: string; count: number }
  > = {};

  activeMonths.forEach(({ record }) => {
    const exp = record.expenses;
    if (!exp) return;

    // Electricity (saved_em2_eur) if present
    if (exp.saved_em2_eur && exp.saved_em2_eur > 0) {
      const catName = "Ток";
      if (!categoryMap[catName]) {
        categoryMap[catName] = {
          amount: 0,
          color: SYSTEM_CATEGORY_COLORS["Ток"] || "#f59e0b",
          count: 0,
        };
      }
      categoryMap[catName].amount += exp.saved_em2_eur;
      categoryMap[catName].count += 1;
      fixedExpensesTotal += exp.saved_em2_eur;
    }

    // Fixed expenses
    if (Array.isArray(exp.fixed_expenses)) {
      exp.fixed_expenses.forEach((item: ExpenseItem) => {
        fixedExpensesTotal += item.amount;
        if (!categoryMap[item.categoryName]) {
          categoryMap[item.categoryName] = {
            amount: 0,
            color:
              SYSTEM_CATEGORY_COLORS[item.categoryName] ||
              getHexFromTailwindClass(item.categoryColor),
            count: 0,
          };
        }
        categoryMap[item.categoryName].amount += item.amount;
        categoryMap[item.categoryName].count += 1;
      });
    } else if (exp.fixed_expenses) {
      const legacy = exp.fixed_expenses as any;
      if (legacy.credit_eur) {
        fixedExpensesTotal += legacy.credit_eur;
        if (!categoryMap["Кредит"]) {
          categoryMap["Кредит"] = {
            amount: 0,
            color: SYSTEM_CATEGORY_COLORS["Кредит"] || "#ef4444",
            count: 0,
          };
        }
        categoryMap["Кредит"].amount += legacy.credit_eur;
        categoryMap["Кредит"].count += 1;
      }
      if (legacy.phone_eur) {
        fixedExpensesTotal += legacy.phone_eur;
        if (!categoryMap["Телефон"]) {
          categoryMap["Телефон"] = {
            amount: 0,
            color: SYSTEM_CATEGORY_COLORS["Телефон"] || "#3b82f6",
            count: 0,
          };
        }
        categoryMap["Телефон"].amount += legacy.phone_eur;
        categoryMap["Телефон"].count += 1;
      }
      if (legacy.internet_eur) {
        fixedExpensesTotal += legacy.internet_eur;
        if (!categoryMap["Интернет"]) {
          categoryMap["Интернет"] = {
            amount: 0,
            color: SYSTEM_CATEGORY_COLORS["Интернет"] || "#8b5cf6",
            count: 0,
          };
        }
        categoryMap["Интернет"].amount += legacy.internet_eur;
        categoryMap["Интернет"].count += 1;
      }
    }

    // Additional expenses
    if (Array.isArray(exp.additional_expenses)) {
      exp.additional_expenses.forEach((item: ExpenseItem) => {
        if (periodType === "custom" && item.date) {
          const itemDate = new Date(item.date);
          const sDate = new Date(customStartDate + "T00:00:00");
          const eDate = new Date(customEndDate + "T23:59:59");
          if (itemDate < sDate || itemDate > eDate) return;
        }

        additionalExpensesTotal += item.amount;
        if (!categoryMap[item.categoryName]) {
          categoryMap[item.categoryName] = {
            amount: 0,
            color: getHexFromTailwindClass(item.categoryColor),
            count: 0,
          };
        }
        categoryMap[item.categoryName].amount += item.amount;
        categoryMap[item.categoryName].count += 1;
      });
    }
  });

  const expensesTotal = fixedExpensesTotal + additionalExpensesTotal;

  // Build category summaries with percentages
  const categoryBreakdown: CategorySummary[] = Object.entries(categoryMap)
    .map(([name, data], idx) => ({
      name,
      amount: parseFloat(data.amount.toFixed(2)),
      percentage:
        expensesTotal > 0
          ? parseFloat(((data.amount / expensesTotal) * 100).toFixed(1))
          : 0,
      color: data.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
      count: data.count,
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const incomeCategoryBreakdown: CategorySummary[] = Object.entries(incomeCategoryMap)
    .map(([name, data], idx) => ({
      name,
      amount: parseFloat(data.amount.toFixed(2)),
      percentage:
        incomeTotal > 0
          ? parseFloat(((data.amount / incomeTotal) * 100).toFixed(1))
          : 0,
      color: data.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
      count: data.count,
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // 6. Build Monthly Breakdown / Trend
  const monthlyBreakdown: MonthlyTrendItem[] = [];

  if (periodType === "year") {
    // 12 months of the year
    const targetY = parseInt(selectedYear, 10);
    MONTHS_BG.forEach((mName, mIdx) => {
      const monthKey = `${mName} ${targetY}`;
      const recItem = activeMonths.find(
        (a) => a.monthIndex === mIdx && a.year === targetY,
      );

      let mExp = 0;
      if (recItem?.record.expenses) {
        const exp = recItem.record.expenses;
        if (exp.saved_em2_eur) mExp += exp.saved_em2_eur;
        if (Array.isArray(exp.fixed_expenses)) {
          mExp += exp.fixed_expenses.reduce((s, i) => s + i.amount, 0);
        } else if (exp.fixed_expenses) {
          const leg = exp.fixed_expenses as any;
          mExp += (leg.credit_eur || 0) + (leg.phone_eur || 0) + (leg.internet_eur || 0);
        }
        if (Array.isArray(exp.additional_expenses)) {
          mExp += exp.additional_expenses.reduce((s, i) => s + i.amount, 0);
        }
      }

      // Incomes & savings for this month
      let mInc = 0;
      let mSav = 0;
      const seenMonthIncIds = new Set<string>();
      filteredSavings.forEach((tx) => {
        const d = new Date(tx.date);
        if (d.getFullYear() === targetY && d.getMonth() === mIdx) {
          if (tx.type === "expense") {
            mSav -= tx.amount;
          } else {
            seenMonthIncIds.add(tx.id);
            mInc += tx.amount;
            mSav += tx.amount;
          }
        }
      });
      if (recItem?.record.incomes && Array.isArray(recItem.record.incomes)) {
        recItem.record.incomes.forEach((inc) => {
          if (inc && inc.amount > 0 && inc.type !== "expense" && !seenMonthIncIds.has(inc.id)) {
            seenMonthIncIds.add(inc.id);
            mInc += inc.amount;
          }
        });
      }

      monthlyBreakdown.push({
        monthKey,
        shortLabel: MONTHS_SHORT_BG[mIdx],
        monthIndex: mIdx,
        year: targetY,
        income: parseFloat(mInc.toFixed(2)),
        expenses: parseFloat(mExp.toFixed(2)),
        savings: parseFloat(mSav.toFixed(2)),
        netBalance: parseFloat((mInc - mExp).toFixed(2)),
      });
    });
  } else {
    // For single month or custom range, push active months
    activeMonths.forEach((m) => {
      let mExp = 0;
      if (m.record.expenses) {
        const exp = m.record.expenses;
        if (exp.saved_em2_eur) mExp += exp.saved_em2_eur;
        if (Array.isArray(exp.fixed_expenses)) {
          mExp += exp.fixed_expenses.reduce((s, i) => s + i.amount, 0);
        } else if (exp.fixed_expenses) {
          const leg = exp.fixed_expenses as any;
          mExp += (leg.credit_eur || 0) + (leg.phone_eur || 0) + (leg.internet_eur || 0);
        }
        if (Array.isArray(exp.additional_expenses)) {
          exp.additional_expenses.forEach((item) => {
            if (periodType === "custom" && item.date && sCustomDate && eCustomDate) {
              const itemDate = new Date(item.date);
              if (itemDate < sCustomDate || itemDate > eCustomDate) return;
            }
            mExp += item.amount;
          });
        }
      }

      let mInc = 0;
      let mSav = 0;
      const seenMonthIncIds = new Set<string>();
      filteredSavings.forEach((tx) => {
        const d = new Date(tx.date);
        if (d.getFullYear() === m.year && d.getMonth() === m.monthIndex) {
          if (tx.type === "expense") {
            mSav -= tx.amount;
          } else {
            seenMonthIncIds.add(tx.id);
            mInc += tx.amount;
            mSav += tx.amount;
          }
        }
      });
      if (m.record.incomes && Array.isArray(m.record.incomes)) {
        m.record.incomes.forEach((inc) => {
          if (!inc || inc.amount <= 0 || inc.type === "expense") return;
          if (periodType === "custom" && inc.date && sCustomDate && eCustomDate) {
            const incDate = new Date(inc.date);
            if (!isNaN(incDate.getTime()) && (incDate < sCustomDate || incDate > eCustomDate)) {
              return;
            }
          }
          if (!seenMonthIncIds.has(inc.id)) {
            seenMonthIncIds.add(inc.id);
            mInc += inc.amount;
          }
        });
      }

      monthlyBreakdown.push({
        monthKey: m.key,
        shortLabel: `${MONTHS_SHORT_BG[m.monthIndex]} ${m.year}`,
        monthIndex: m.monthIndex,
        year: m.year,
        income: parseFloat(mInc.toFixed(2)),
        expenses: parseFloat(mExp.toFixed(2)),
        savings: parseFloat(mSav.toFixed(2)),
        netBalance: parseFloat((mInc - mExp).toFixed(2)),
      });
    });
  }

  // Net Balance = Income - Expenses (per requirements)
  const netBalance = incomeTotal - expensesTotal;
  const savingsRate =
    incomeTotal > 0 ? (savingsTotal / incomeTotal) * 100 : 0;

  return {
    periodType,
    periodLabel,
    dateRangeText,
    generatedAt: new Date().toLocaleString("bg-BG"),
    incomeTotal: parseFloat(incomeTotal.toFixed(2)),
    expensesTotal: parseFloat(expensesTotal.toFixed(2)),
    fixedExpensesTotal: parseFloat(fixedExpensesTotal.toFixed(2)),
    additionalExpensesTotal: parseFloat(additionalExpensesTotal.toFixed(2)),
    savingsTotal: parseFloat(savingsTotal.toFixed(2)),
    netBalance: parseFloat(netBalance.toFixed(2)),
    savingsRate: parseFloat(savingsRate.toFixed(1)),
    categoryBreakdown,
    incomeCategoryBreakdown,
    monthlyBreakdown,
    recordCount: activeMonths.length,
    detailedRecords: activeMonths,
  };
}

/**
 * Generates and downloads a structured UTF-8 TXT Report.
 */
export function exportTxtReport(data: ExportReportData): void {
  const lines: string[] = [];
  const divider = "================================================================================";
  const subDivider = "--------------------------------------------------------------------------------";

  lines.push(divider);
  lines.push("                 ФИНАНСОВ И БЮДЖЕТЕН ОТЧЕТ (BudgetFlows)                       ");
  lines.push("                 Reporting & Export Center - Текстов Доклад                    ");
  lines.push(divider);
  lines.push(`Период на отчета    : ${data.periodLabel}`);
  lines.push(`Обхват на данните   : ${data.dateRangeText}`);
  lines.push(`Дата на генериране  : ${data.generatedAt}`);
  lines.push(`Брой включени месеци: ${data.recordCount}`);
  lines.push(divider);
  lines.push("");

  // 1. ОСНОВНИ ФИНАНСОВИ ПОКАЗАТЕЛИ (KPIs)
  lines.push("1. ОСНОВНИ ФИНАНСОВИ ПОКАЗАТЕЛИ");
  lines.push(subDivider);
  lines.push(` • Общо приходи (Income)         : €${data.incomeTotal.toFixed(2)}`);
  lines.push(` • Общо разходи (Expenses)       : €${data.expensesTotal.toFixed(2)}`);
  lines.push(`     - Фиксирани разходи         : €${data.fixedExpensesTotal.toFixed(2)}`);
  lines.push(`     - Допълнителни разходи      : €${data.additionalExpensesTotal.toFixed(2)}`);
  lines.push(` • Спестявания за периода        : €${data.savingsTotal.toFixed(2)}`);
  lines.push(` • НЕТЕН БАЛАНС (Приходи-Разходи): ${data.netBalance >= 0 ? "+" : ""}€${data.netBalance.toFixed(2)}`);
  if (data.incomeTotal > 0) {
    lines.push(` • Норма на спестяване (Savings%): ${data.savingsRate.toFixed(1)}%`);
  }
  lines.push("");

  // 2. РАЗБИВКА ПО КАТЕГОРИИ РАЗХОДИ
  lines.push("2. РАЗПРЕДЕЛЕНИЕ НА РАЗХОДИТЕ ПО КАТЕГОРИИ");
  lines.push(subDivider);
  lines.push(
    ` ${"#".padEnd(4)} ${"Категория".padEnd(28)} ${"Сума (€)".padEnd(14)} ${"Дял (%)".padEnd(10)}`,
  );
  lines.push(subDivider);

  if (data.categoryBreakdown.length === 0) {
    lines.push(" Няма записани разходи за посочения период.");
  } else {
    data.categoryBreakdown.forEach((cat, index) => {
      const idxStr = (index + 1).toString().padEnd(4);
      const nameStr = cat.name.padEnd(28);
      const amtStr = `€${cat.amount.toFixed(2)}`.padEnd(14);
      const pctStr = `${cat.percentage.toFixed(1)}%`.padEnd(10);
      lines.push(` ${idxStr} ${nameStr} ${amtStr} ${pctStr}`);
    });
  }
  lines.push(subDivider);
  lines.push(` ОБЩО РАЗХОДИ : €${data.expensesTotal.toFixed(2)} (100.0%)`);
  lines.push("");

  // 3. МЕСЕЧНА ХРОНОЛОГИЯ (ако има повече от 1 месец или година)
  if (data.monthlyBreakdown.length > 0) {
    lines.push("3. МЕСЕЧНА ХРОНОЛОГИЯ И ТЕНДЕНЦИЯ");
    lines.push(subDivider);
    lines.push(
      ` ${"Месец".padEnd(20)} ${"Приходи (€)".padEnd(16)} ${"Разходи (€)".padEnd(16)} ${"Баланс (€)".padEnd(14)}`,
    );
    lines.push(subDivider);

    data.monthlyBreakdown.forEach((m) => {
      const mStr = m.monthKey.padEnd(20);
      const incStr = `€${m.income.toFixed(2)}`.padEnd(16);
      const expStr = `€${m.expenses.toFixed(2)}`.padEnd(16);
      const balStr = `${m.netBalance >= 0 ? "+" : ""}€${m.netBalance.toFixed(2)}`.padEnd(14);
      lines.push(` ${mStr} ${incStr} ${expStr} ${balStr}`);
    });
    lines.push("");
  }

  // 4. ДЕТАЙЛИ ПО МЕСЕЦИ И РАЗХОДНИ ПЕРА
  if (data.detailedRecords.length > 0) {
    lines.push("4. ДЕТАЙЛЕН ОПИС ПО МЕСЕЦИ");
    lines.push(subDivider);

    data.detailedRecords.forEach(({ key, record }) => {
      lines.push(`\n>>> МЕСЕЦ: ${key.toUpperCase()}`);
      const exp = record.expenses;

      if (Array.isArray(record.incomes) && record.incomes.length > 0) {
        lines.push("   [Приходи]:");
        record.incomes.forEach((inc) => {
          const catLabel = inc.categoryName || "Приход";
          const noteText = inc.note ? ` (${inc.note})` : "";
          const dateText = inc.date ? ` [${new Date(inc.date).toLocaleDateString("bg-BG")}]` : "";
          lines.push(`     • ${(catLabel + noteText).padEnd(28)}: +€${inc.amount.toFixed(2)}${dateText}`);
        });
      }

      if (exp?.saved_em2_eur && exp.saved_em2_eur > 0) {
        lines.push(`   [Ток - Електроенергия] : €${exp.saved_em2_eur.toFixed(2)}`);
      }

      if (Array.isArray(exp?.fixed_expenses) && exp.fixed_expenses.length > 0) {
        lines.push("   [Фиксирани разходи]:");
        exp.fixed_expenses.forEach((item) => {
          lines.push(`     • ${item.categoryName.padEnd(24)}: €${item.amount.toFixed(2)}`);
        });
      }

      if (Array.isArray(exp?.additional_expenses) && exp.additional_expenses.length > 0) {
        lines.push("   [Допълнителни разходи]:");
        exp.additional_expenses.forEach((item) => {
          const noteText = item.note ? ` (${item.note})` : "";
          const dateText = item.date ? ` [${new Date(item.date).toLocaleDateString("bg-BG")}]` : "";
          lines.push(`     • ${(item.categoryName + noteText).padEnd(28)}: €${item.amount.toFixed(2)}${dateText}`);
        });
      }
    });
    lines.push("");
  }

  if (data.incomeCategoryBreakdown.length > 0) {
    lines.push("5. РАЗПРЕДЕЛЕНИЕ НА ПРИХОДИТЕ ПО КАТЕГОРИИ");
    lines.push(subDivider);
    data.incomeCategoryBreakdown.forEach((cat, index) => {
      const idxStr = (index + 1).toString().padEnd(4);
      const nameStr = cat.name.padEnd(28);
      const amtStr = `+€${cat.amount.toFixed(2)}`.padEnd(14);
      const pctStr = `${cat.percentage.toFixed(1)}%`.padEnd(10);
      lines.push(` ${idxStr} ${nameStr} ${amtStr} ${pctStr}`);
    });
    lines.push("");
  }

  lines.push(divider);
  lines.push(" BudgetFlows App • Автоматично генериран текстов отчет за личен бюджет");
  lines.push(divider);

  const fileContent = lines.join("\n");
  const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const cleanLabel = data.periodLabel.replace(/[\s\.\–\-\/\:]+/g, "_");
  anchor.href = url;
  anchor.download = `BudgetFlows_Report_${cleanLabel}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a crisp, high-resolution PNG Report graphic.
 * Uses HTML5 Canvas directly (2x DPI scale for Retina clarity, 1200 x 1400 px base).
 */
export function exportPngReport(data: ExportReportData): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const scale = 2; // High-res retina scale
      const width = 1200;
      // Dynamic height based on category breakdown length
      const categoryRows = Math.min(data.categoryBreakdown.length, 8);
      const height = 1350 + (categoryRows > 4 ? (categoryRows - 4) * 35 : 0);

      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Неуспешно инициализиране на графичния Canvas контекст.");
      }

      ctx.scale(scale, scale);

      // 1. Background
      ctx.fillStyle = "#0f172a"; // Deep navy slate background
      ctx.fillRect(0, 0, width, height);

      // Subtle ambient gradient circle
      const radialGrad = ctx.createRadialGradient(width * 0.8, 120, 10, width * 0.8, 120, 450);
      radialGrad.addColorStop(0, "rgba(99, 102, 241, 0.18)");
      radialGrad.addColorStop(1, "rgba(15, 23, 42, 0)");
      ctx.fillStyle = radialGrad;
      ctx.fillRect(0, 0, width, 500);

      // 2. Header Container
      ctx.save();
      // App Badge
      ctx.fillStyle = "rgba(99, 102, 241, 0.15)";
      roundRect(ctx, 48, 42, 160, 28, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(129, 140, 248, 0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#a5b4fc";
      ctx.font = "bold 12px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("BUDGETFLOWS REPORT", 60, 61);

      // Title
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 32px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Финансов и Бюджетен Отчет", 48, 110);

      // Subtitle / Period
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 16px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText(`Период: ${data.periodLabel} (${data.dateRangeText})`, 48, 138);

      // Metadata right-aligned
      ctx.textAlign = "right";
      ctx.fillStyle = "#64748b";
      ctx.font = "13px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText(`Генериран на: ${data.generatedAt}`, width - 48, 62);
      ctx.fillText(`Включени записи: ${data.recordCount} месеца`, width - 48, 86);
      ctx.restore();

      // Divider line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(48, 165);
      ctx.lineTo(width - 48, 165);
      ctx.stroke();

      // 3. 4 KPI Metric Cards
      const cardY = 190;
      const cardHeight = 110;
      const cardGap = 16;
      const cardWidth = (width - 48 * 2 - cardGap * 3) / 4;

      const kpiItems = [
        {
          label: "ОБЩО ПРИХОДИ",
          value: `+€${data.incomeTotal.toLocaleString("bg-BG", { minimumFractionDigits: 2 })}`,
          sub: "Постъпления и приходи",
          accentColor: "#10b981", // Emerald
          bg: "#064e3b15",
          border: "#05966940",
        },
        {
          label: "ОБЩО РАЗХОДИ",
          value: `-€${data.expensesTotal.toLocaleString("bg-BG", { minimumFractionDigits: 2 })}`,
          sub: `Фиксирани: €${data.fixedExpensesTotal.toFixed(0)} | Доп.: €${data.additionalExpensesTotal.toFixed(0)}`,
          accentColor: "#f43f5e", // Rose
          bg: "#88133715",
          border: "#e11d4840",
        },
        {
          label: "СПЕСТЯВАНИЯ",
          value: `€${data.savingsTotal.toLocaleString("bg-BG", { minimumFractionDigits: 2 })}`,
          sub: data.incomeTotal > 0 ? `Дял: ${data.savingsRate.toFixed(1)}% от дохода` : "Заделени средства",
          accentColor: "#8b5cf6", // Purple
          bg: "#4c1d9515",
          border: "#7c3aed40",
        },
        {
          label: "НЕТЕН БАЛАНС",
          value: `${data.netBalance >= 0 ? "+" : ""}€${data.netBalance.toLocaleString("bg-BG", { minimumFractionDigits: 2 })}`,
          sub: "Приходи минус Разходи",
          accentColor: data.netBalance >= 0 ? "#38bdf8" : "#fb7185", // Sky blue or coral
          bg: "#0c4a6e15",
          border: "#0284c740",
        },
      ];

      kpiItems.forEach((kpi, idx) => {
        const x = 48 + idx * (cardWidth + cardGap);

        // Card container
        ctx.save();
        ctx.fillStyle = "#1e293b";
        roundRect(ctx, x, cardY, cardWidth, cardHeight, 12);
        ctx.fill();

        ctx.strokeStyle = kpi.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Top accent line
        ctx.fillStyle = kpi.accentColor;
        roundRect(ctx, x + 16, cardY, cardWidth - 32, 3, 2);
        ctx.fill();

        // Card label
        ctx.fillStyle = "#94a3b8";
        ctx.font = "bold 11px Inter, system-ui, -apple-system, sans-serif";
        ctx.fillText(kpi.label, x + 16, cardY + 28);

        // Card value
        ctx.fillStyle = kpi.accentColor;
        ctx.font = "bold 22px Inter, system-ui, -apple-system, sans-serif";
        ctx.fillText(kpi.value, x + 16, cardY + 62);

        // Subtext
        ctx.fillStyle = "#64748b";
        ctx.font = "11px Inter, system-ui, -apple-system, sans-serif";
        ctx.fillText(kpi.sub, x + 16, cardY + 88);

        ctx.restore();
      });

      // 4. Main Section: Left = Donut Chart + Category List; Right = Trends / Breakdown
      const sectionY = 325;
      const leftWidth = 560;
      const rightX = 48 + leftWidth + 24;
      const rightWidth = width - 48 - rightX;
      const sectionHeight = 440;

      // --- Left Card: Expenses by Category (Donut Chart & Ranked Bars) ---
      ctx.save();
      ctx.fillStyle = "#1e293b";
      roundRect(ctx, 48, sectionY, leftWidth, sectionHeight, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.stroke();

      // Card Header
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Разходи по категории", 72, sectionY + 36);

      ctx.fillStyle = "#64748b";
      ctx.font = "12px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Разпределение на общата сума по разходни пера", 72, sectionY + 56);

      // Render Donut Chart
      const donutCenterX = 160;
      const donutCenterY = sectionY + 180;
      const donutOuterR = 85;
      const donutInnerR = 52;

      if (data.categoryBreakdown.length === 0 || data.expensesTotal === 0) {
        // Empty state ring
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 26;
        ctx.beginPath();
        ctx.arc(donutCenterX, donutCenterY, 70, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#64748b";
        ctx.font = "13px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Няма данни", donutCenterX, donutCenterY + 4);
      } else {
        let currentAngle = -Math.PI / 2;
        data.categoryBreakdown.forEach((cat) => {
          const sliceAngle = (cat.amount / data.expensesTotal) * (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(donutCenterX, donutCenterY, donutOuterR, currentAngle, currentAngle + sliceAngle);
          ctx.arc(donutCenterX, donutCenterY, donutInnerR, currentAngle + sliceAngle, currentAngle, true);
          ctx.closePath();
          ctx.fillStyle = cat.color;
          ctx.fill();
          currentAngle += sliceAngle;
        });

        // Center total in donut
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px Inter, sans-serif";
        ctx.fillText(`€${Math.round(data.expensesTotal)}`, donutCenterX, donutCenterY);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText("Общо разходи", donutCenterX, donutCenterY + 18);
        ctx.textAlign = "left";
      }

      // Category Bars list on the right side of the card
      const barStartX = 280;
      const topCategories = data.categoryBreakdown.slice(0, 5);
      topCategories.forEach((cat, idx) => {
        const itemY = sectionY + 95 + idx * 64;

        // Color dot & Name
        ctx.fillStyle = cat.color;
        ctx.beginPath();
        ctx.arc(barStartX + 6, itemY + 6, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f1f5f9";
        ctx.font = "bold 13px Inter, sans-serif";
        ctx.fillText(cat.name, barStartX + 20, itemY + 10);

        // Amount & Pct
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px Inter, sans-serif";
        ctx.fillText(`€${cat.amount.toFixed(2)}`, 48 + leftWidth - 24, itemY + 10);

        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText(`${cat.percentage.toFixed(1)}%`, 48 + leftWidth - 24, itemY + 26);
        ctx.textAlign = "left";

        // Progress bar background
        const barWidth = leftWidth - 280 - 48;
        ctx.fillStyle = "#334155";
        roundRect(ctx, barStartX + 20, itemY + 22, barWidth - 60, 6, 3);
        ctx.fill();

        // Progress bar fill
        const fillW = Math.max(4, ((barWidth - 60) * cat.percentage) / 100);
        ctx.fillStyle = cat.color;
        roundRect(ctx, barStartX + 20, itemY + 22, fillW, 6, 3);
        ctx.fill();
      });

      // Bottom note in left card
      ctx.fillStyle = "#64748b";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText(`Показани са топ 5 от ${data.categoryBreakdown.length} категории`, 72, sectionY + sectionHeight - 20);
      ctx.restore();

      // --- Right Card: Monthly Trend / Financial Comparison Bar Chart ---
      ctx.save();
      ctx.fillStyle = "#1e293b";
      roundRect(ctx, rightX, sectionY, rightWidth, sectionHeight, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.stroke();

      // Header
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px Inter, system-ui, -apple-system, sans-serif";
      const rightTitle = data.periodType === "year" ? "Годишен тренд (Приходи vs Разходи)" : "Сравнителен финансов анализ";
      ctx.fillText(rightTitle, rightX + 24, sectionY + 36);

      // Legend
      ctx.fillStyle = "#10b981"; // Income
      ctx.fillRect(rightX + rightWidth - 200, sectionY + 26, 12, 12);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText("Приходи", rightX + rightWidth - 182, sectionY + 36);

      ctx.fillStyle = "#f43f5e"; // Expenses
      ctx.fillRect(rightX + rightWidth - 110, sectionY + 26, 12, 12);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("Разходи", rightX + rightWidth - 92, sectionY + 36);

      // Chart area
      const chartX = rightX + 45;
      const chartY = sectionY + 80;
      const chartW = rightWidth - 70;
      const chartH = sectionHeight - 140;

      // Draw horizontal grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const gy = chartY + (chartH / 4) * g;
        ctx.beginPath();
        ctx.moveTo(chartX, gy);
        ctx.lineTo(chartX + chartW, gy);
        ctx.stroke();
      }

      // Draw Bars
      const trendData = data.monthlyBreakdown.length > 0 ? data.monthlyBreakdown : [];
      if (trendData.length > 0) {
        const maxVal = Math.max(
          ...trendData.map((d) => Math.max(d.income, d.expenses)),
          100,
        );

        const groupCount = trendData.length;
        const groupW = chartW / groupCount;
        const barW = Math.min(22, (groupW - 12) / 2);

        trendData.forEach((item, idx) => {
          const gx = chartX + idx * groupW + (groupW - barW * 2 - 4) / 2;

          // Income bar
          const incH = Math.max(2, (item.income / maxVal) * chartH);
          ctx.fillStyle = "#10b981";
          roundRect(ctx, gx, chartY + chartH - incH, barW, incH, 3);
          ctx.fill();

          // Expense bar
          const expH = Math.max(2, (item.expenses / maxVal) * chartH);
          ctx.fillStyle = "#f43f5e";
          roundRect(ctx, gx + barW + 4, chartY + chartH - expH, barW, expH, 3);
          ctx.fill();

          // Month label
          ctx.fillStyle = "#94a3b8";
          ctx.font = "11px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(item.shortLabel, gx + barW + 2, chartY + chartH + 20);
        });
        ctx.textAlign = "left";
      } else {
        // Fallback for single period comparison: Fixed vs Variable vs Savings
        const bars = [
          { name: "Приходи", val: data.incomeTotal, col: "#10b981" },
          { name: "Фиксирани", val: data.fixedExpensesTotal, col: "#ef4444" },
          { name: "Допълнителни", val: data.additionalExpensesTotal, col: "#f59e0b" },
          { name: "Спестявания", val: Math.max(0, data.savingsTotal), col: "#8b5cf6" },
        ];
        const maxB = Math.max(...bars.map((b) => b.val), 100);
        const colW = chartW / bars.length;
        bars.forEach((b, idx) => {
          const bx = chartX + idx * colW + colW * 0.2;
          const bw = colW * 0.6;
          const bh = (b.val / maxB) * chartH;
          ctx.fillStyle = b.col;
          roundRect(ctx, bx, chartY + chartH - bh, bw, bh, 4);
          ctx.fill();

          ctx.textAlign = "center";
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 12px Inter, sans-serif";
          ctx.fillText(`€${Math.round(b.val)}`, bx + bw / 2, chartY + chartH - bh - 8);

          ctx.fillStyle = "#94a3b8";
          ctx.font = "11px Inter, sans-serif";
          ctx.fillText(b.name, bx + bw / 2, chartY + chartH + 20);
        });
        ctx.textAlign = "left";
      }

      ctx.restore();

      // 5. Category Details Structured Table (Bottom Section)
      const tableY = sectionY + sectionHeight + 24;
      const tableW = width - 48 * 2;
      const tableRows = data.categoryBreakdown.slice(0, 8);
      const tableH = 110 + tableRows.length * 38;

      ctx.save();
      ctx.fillStyle = "#1e293b";
      roundRect(ctx, 48, tableY, tableW, tableH, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.stroke();

      // Table Header
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("Подробен опис на категориите", 72, tableY + 34);

      // Columns header bar
      const colHeaderY = tableY + 54;
      ctx.fillStyle = "#334155";
      roundRect(ctx, 64, colHeaderY, tableW - 32, 28, 6);
      ctx.fill();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.fillText("КАТЕГОРИЯ", 84, colHeaderY + 18);
      ctx.fillText("БРОЙ ОПЕРАЦИИ", 480, colHeaderY + 18);
      ctx.fillText("ДЯЛ ОТ РАЗХОДИТЕ", 720, colHeaderY + 18);
      ctx.textAlign = "right";
      ctx.fillText("СУМА В ЕВРО", tableW + 30, colHeaderY + 18);
      ctx.textAlign = "left";

      // Rows
      tableRows.forEach((cat, idx) => {
        const ry = colHeaderY + 38 + idx * 38;

        // Alternating row background
        if (idx % 2 === 1) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
          roundRect(ctx, 64, ry - 14, tableW - 32, 34, 4);
          ctx.fill();
        }

        // Color bullet + category name
        ctx.fillStyle = cat.color;
        ctx.beginPath();
        ctx.arc(84, ry, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f8fafc";
        ctx.font = "500 13px Inter, sans-serif";
        ctx.fillText(cat.name, 98, ry + 4);

        // Count
        ctx.fillStyle = "#94a3b8";
        ctx.font = "12px Inter, sans-serif";
        ctx.fillText(`${cat.count} ${cat.count === 1 ? "запис" : "записа"}`, 480, ry + 4);

        // Percentage Badge
        ctx.fillStyle = "rgba(99, 102, 241, 0.15)";
        roundRect(ctx, 720, ry - 10, 56, 20, 4);
        ctx.fill();
        ctx.fillStyle = "#a5b4fc";
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.fillText(`${cat.percentage.toFixed(1)}%`, 732, ry + 4);

        // Amount
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px Inter, sans-serif";
        ctx.fillText(`€${cat.amount.toFixed(2)}`, tableW + 30, ry + 4);
        ctx.textAlign = "left";
      });

      // Bottom Total Summary in Table
      const summaryBarY = colHeaderY + 38 + tableRows.length * 38;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(64, summaryBarY);
      ctx.lineTo(tableW + 32, summaryBarY);
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.fillText("ОБЩО ЗА ПЕРИОДА:", 84, summaryBarY + 22);

      ctx.textAlign = "right";
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 14px Inter, sans-serif";
      ctx.fillText(`Разходи: €${data.expensesTotal.toFixed(2)}  |  Приходи: €${data.incomeTotal.toFixed(2)}  |  Баланс: ${data.netBalance >= 0 ? "+" : ""}€${data.netBalance.toFixed(2)}`, tableW + 30, summaryBarY + 22);
      ctx.textAlign = "left";
      ctx.restore();

      // 6. Footer Branding
      ctx.save();
      const footerY = height - 35;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(48, footerY - 15);
      ctx.lineTo(width - 48, footerY - 15);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "12px Inter, system-ui, -apple-system, sans-serif";
      ctx.fillText("BudgetFlows • Професионален мениджър на лични финанси и домакински бюджет", 48, footerY + 8);

      ctx.textAlign = "right";
      ctx.fillText(`Страница 1 от 1 • Доклад #${Date.now().toString().slice(-6)}`, width - 48, footerY + 8);
      ctx.restore();

      // Convert to blob and download
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Неуспешно генериране на изображението."));
            return;
          }
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          const cleanLabel = data.periodLabel.replace(/[\s\.\–\-\/\:]+/g, "_");
          anchor.href = url;
          anchor.download = `BudgetFlows_Report_${cleanLabel}.png`;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
          resolve();
        },
        "image/png",
        0.95,
      );
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Helper to draw rounded rectangle in Canvas
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}
