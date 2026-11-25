import { MonthlyRecord, IncomeItem, ExpenseItem } from "@/types";
import { getStoredElectricityHistory } from "./electricityStorage";
import { calculateAllBudgetsStatus, loadBudgets } from "./budgetStorage";
import { computeMonthToMonthComparison, MONTHS_BG } from "./comparisonStorage";
import { loadAppSettings } from "./incomeStorage";
import { parseMonthKeyToYearMonth } from "./recurrenceEngine";
import {
  computeSavingsAllocationSummary,
  loadSavingsGoals,
} from "./savingsGoalsStorage";
import { isCompletedExpense, isRecordCompleted } from "./expenseStatus";
import {
  formatLocalizedMonthYear,
  getCurrentLanguage,
  t,
  translateCategoryName,
} from "@/i18n/helpers";
import type { SupportedLanguage } from "@/i18n/types";

export type InsightType =
  | "income"
  | "spending"
  | "savings"
  | "electricity"
  | "trend"
  | "unusual"
  | "recommendation";

export type InsightPriority = "high" | "medium" | "low" | "opportunity";

export interface FinancialInsight {
  id: string;
  type: InsightType;
  category: "income" | "spending" | "savings" | "electricity" | "trend";
  priority: InsightPriority;
  title: string;
  description: string;
  impact?: string; // e.g. "Спестяване: ~€60/мес"
  actionableTip: string;
  metricLabel?: string;
  metricValue?: string;
  isTopRecommendation?: boolean;
}

export interface FinancialHealthScore {
  score: number; // 0 - 100
  rating: "Отличен" | "Добър" | "Задоволителен" | "Нужда от оптимизация";
  savingsRate: number; // %
  runwayMonths: number;
  monthlySavingsPotential: number; // in EUR
}

export interface FullAnalysisResult {
  healthScore: FinancialHealthScore;
  totalExpensesAnalyzed: number;
  totalIncomeAnalyzed: number;
  totalSavingsBalance: number;
  monthsAnalyzedCount: number;
  insights: FinancialInsight[];
  topRecommendations: FinancialInsight[];
}

export function translateHealthRating(
  rating: FinancialHealthScore["rating"],
  lang: SupportedLanguage = getCurrentLanguage()
): string {
  switch (rating) {
    case "Отличен":
      return t("ai.ratings.excellent", undefined, lang);
    case "Добър":
      return t("ai.ratings.good", undefined, lang);
    case "Задоволителен":
      return t("ai.ratings.fair", undefined, lang);
    default:
      return t("ai.ratings.needsOptimization", undefined, lang);
  }
}

/**
 * Intelligent Rule-Based Local Financial Analysis Engine
 * Extracts deep metrics across all stored records and generates high-fidelity insights.
 */
export function generateLocalFinancialAnalysis(
  monthlyData: Record<string, MonthlyRecord>,
  globalSavings: IncomeItem[],
  lang: SupportedLanguage = getCurrentLanguage()
): FullAnalysisResult {
  const isEn = lang === "en";
  const electricityHistory = getStoredElectricityHistory();
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();

  const allMonthlyRecords = Object.values(monthlyData);
  const monthsCount = allMonthlyRecords.length;

  // Flatten all expense items
  const allExpenses: ExpenseItem[] = [];
  const expensesByCategory: Record<string, number> = {};
  let totalFixedExpenses = 0;
  let totalVariableExpenses = 0;
  let totalExpenses = 0;

  allMonthlyRecords.forEach((record) => {
    if (!record || !record.expenses) return;
    const exp = record.expenses;

    if (Array.isArray(exp.fixed_expenses)) {
      exp.fixed_expenses.forEach((item) => {
        if (!isCompletedExpense(item)) return;
        allExpenses.push(item);
        totalFixedExpenses += item.amount;
        totalExpenses += item.amount;
        expensesByCategory[item.categoryName] =
          (expensesByCategory[item.categoryName] || 0) + item.amount;
      });
    } else if (exp.fixed_expenses) {
      const leg = exp.fixed_expenses as any;
      if (leg.credit_eur) {
        totalFixedExpenses += leg.credit_eur;
        totalExpenses += leg.credit_eur;
        expensesByCategory["Кредит"] = (expensesByCategory["Кредит"] || 0) + leg.credit_eur;
      }
      if (leg.phone_eur) {
        totalFixedExpenses += leg.phone_eur;
        totalExpenses += leg.phone_eur;
        expensesByCategory["Телефон"] = (expensesByCategory["Телефон"] || 0) + leg.phone_eur;
      }
      if (leg.internet_eur) {
        totalFixedExpenses += leg.internet_eur;
        totalExpenses += leg.internet_eur;
        expensesByCategory["Интернет"] = (expensesByCategory["Интернет"] || 0) + leg.internet_eur;
      }
    }

    if (Array.isArray(exp.additional_expenses)) {
      exp.additional_expenses.forEach((item) => {
        if (!isCompletedExpense(item)) return;
        allExpenses.push(item);
        totalVariableExpenses += item.amount;
        totalExpenses += item.amount;
        expensesByCategory[item.categoryName] =
          (expensesByCategory[item.categoryName] || 0) + item.amount;
      });
    }
  });

  // Calculate total income strictly from MonthlyRecord.incomes (Savings are NOT income)
  let totalIncome = 0;
  const seenIncomeIds = new Set<string>();
  const incomesByCategory: Record<string, number> = {};

  allMonthlyRecords.forEach((r) => {
    if (r.incomes && Array.isArray(r.incomes)) {
      r.incomes.forEach((inc) => {
        if (
          !inc ||
          inc.amount <= 0 ||
          inc.type === "expense" ||
          !isRecordCompleted(inc) ||
          seenIncomeIds.has(inc.id)
        ) {
          return;
        }
        seenIncomeIds.add(inc.id);
        totalIncome += inc.amount;
        const cat = inc.categoryName || "Други приходи";
        incomesByCategory[cat] = (incomesByCategory[cat] || 0) + inc.amount;
      });
    }
  });

  // Calculate current savings balance
  const currentSavingsBalance = globalSavings.reduce((acc, item) => {
    return acc + (item.type === "expense" ? -item.amount : item.amount);
  }, 0);

  // Average monthly calculations
  const avgMonthlyExpenses = monthsCount > 0 ? totalExpenses / monthsCount : totalExpenses;
  const avgMonthlyIncome = monthsCount > 0 ? totalIncome / monthsCount : totalIncome;

  // Savings rate
  const savingsRate =
    avgMonthlyIncome > 0
      ? Math.max(0, Math.min(100, ((avgMonthlyIncome - avgMonthlyExpenses) / avgMonthlyIncome) * 100))
      : 0;

  // Emergency runway (months of expenses covered by savings)
  const runwayMonths =
    avgMonthlyExpenses > 0
      ? parseFloat((currentSavingsBalance / avgMonthlyExpenses).toFixed(1))
      : currentSavingsBalance > 0
      ? 12
      : 0;

  const savingsGoals = loadSavingsGoals();
  const savingsAllocation = computeSavingsAllocationSummary(
    globalSavings,
    savingsGoals,
    monthlyData
  );
  const activeGoals = savingsAllocation.activeGoals;
  const totalGoalTarget = activeGoals.reduce((sum, g) => sum + Math.max(0, g.targetAmount), 0);
  const totalGoalAllocated = activeGoals.reduce(
    (sum, g) => sum + Math.min(Math.max(0, g.allocatedAmount), Math.max(0, g.targetAmount)),
    0
  );
  const totalGoalRemaining = Math.max(0, totalGoalTarget - totalGoalAllocated);

  // Pick the best reference monthly record for category budget evaluation
  const nowRef = new Date();
  const currentMonthKey = `${MONTHS_BG[nowRef.getMonth()]} ${nowRef.getFullYear()}`;
  const hasCompletedExpenses = (rec?: MonthlyRecord): boolean => {
    if (!rec?.expenses) return false;
    const fixed = Array.isArray(rec.expenses.fixed_expenses) ? rec.expenses.fixed_expenses : [];
    const add = Array.isArray(rec.expenses.additional_expenses) ? rec.expenses.additional_expenses : [];
    return [...fixed, ...add].some((e) => isCompletedExpense(e) && (e.amount || 0) > 0);
  };
  const sortedMonthKeysDesc = Object.keys(monthlyData || {}).sort((a, b) => {
    const pa = parseMonthKeyToYearMonth(a);
    const pb = parseMonthKeyToYearMonth(b);
    if (!pa && !pb) return a.localeCompare(b);
    if (!pa) return 1;
    if (!pb) return -1;
    if (pb.year !== pa.year) return pb.year - pa.year;
    return pb.monthIndex - pa.monthIndex;
  });
  const latestMonthWithExpensesKey =
    (hasCompletedExpenses(monthlyData[currentMonthKey]) ? currentMonthKey : undefined) ||
    sortedMonthKeysDesc.find((k) => hasCompletedExpenses(monthlyData[k])) ||
    sortedMonthKeysDesc[0];
  const budgetEvalRecord = latestMonthWithExpensesKey
    ? monthlyData[latestMonthWithExpensesKey]
    : undefined;
  const budgetStatus = calculateAllBudgetsStatus(
    budgetEvalRecord,
    totalMonthlyBudget,
    categoryBudgets
  );
  const exceededCategoryBudgets = budgetStatus.categoryStatuses.filter(
    (c) => c.isExceeded && c.overspentAmount > 0
  );
  const categoryOverspendTotal = exceededCategoryBudgets.reduce(
    (sum, c) => sum + c.overspentAmount,
    0
  );

  // Calculate Health Score (0-100)
  let healthScoreVal = 50;
  if (savingsRate >= 20) healthScoreVal += 20;
  else if (savingsRate >= 10) healthScoreVal += 10;
  else if (avgMonthlyExpenses > avgMonthlyIncome && avgMonthlyExpenses > 0) healthScoreVal -= 20;

  if (runwayMonths >= 6) healthScoreVal += 20;
  else if (runwayMonths >= 3) healthScoreVal += 10;
  else if (runwayMonths < 1) healthScoreVal -= 15;

  if (totalMonthlyBudget > 0 && avgMonthlyExpenses > 0) {
    if (avgMonthlyExpenses <= totalMonthlyBudget) {
      healthScoreVal += 10;
    } else {
      healthScoreVal -= 15;
    }
  }
  if (exceededCategoryBudgets.length > 0) {
    healthScoreVal -= Math.min(10, exceededCategoryBudgets.length * 3);
  }
  if (activeGoals.length > 0 && totalGoalTarget > 0 && (totalExpenses > 0 || totalIncome > 0 || currentSavingsBalance > 0)) {
    const goalProgressPct = (totalGoalAllocated / totalGoalTarget) * 100;
    if (goalProgressPct >= 80) healthScoreVal += 5;
    else if (goalProgressPct >= 40) healthScoreVal += 2;
    else if (goalProgressPct < 20) healthScoreVal -= 3;
  }
  healthScoreVal = Math.min(100, Math.max(10, healthScoreVal));

  let healthRating: "Отличен" | "Добър" | "Задоволителен" | "Нужда от оптимизация" = "Добър";
  if (healthScoreVal >= 80) healthRating = "Отличен";
  else if (healthScoreVal >= 65) healthRating = "Добър";
  else if (healthScoreVal >= 45) healthRating = "Задоволителен";
  else healthRating = "Нужда от оптимизация";

  // Insights generation container
  const insights: FinancialInsight[] = [];
  let potentialMonthlySavings = 0;

  // ----------------------------------------------------
  // 1. SPENDING ANALYSIS & REDUCTION SUGGESTIONS
  // ----------------------------------------------------
  const sortedCategories = Object.entries(expensesByCategory).sort(
    (a, b) => b[1] - a[1]
  );
  const topCategory = sortedCategories[0];

  if (topCategory && totalExpenses > 0) {
    const topCatPct = Math.round((topCategory[1] / totalExpenses) * 100);
    const monthlyTopSpend = monthsCount > 0 ? topCategory[1] / monthsCount : topCategory[1];
    const topCatDisplay = translateCategoryName(topCategory[0], lang);

    if (topCatPct >= 35) {
      const suggestReduction = Math.round(monthlyTopSpend * 0.15);
      potentialMonthlySavings += suggestReduction;

      insights.push({
        id: "spending_top_heavy",
        type: "spending",
        category: "spending",
        priority: "high",
        title: isEn
          ? `High spending concentration in “${topCatDisplay}” (${topCatPct}%)`
          : `Висока концентрация на разходи в „${topCatDisplay}“ (${topCatPct}%)`,
        description: isEn
          ? `Category “${topCatDisplay}” accounts for ${topCatPct}% of all your expenses (€${monthlyTopSpend.toFixed(2)}/mo). This is a key area for quick optimization.`
          : `Категорията „${topCatDisplay}“ заема почти ${topCatPct}% от всичките ви разходи (€${monthlyTopSpend.toFixed(2)}/мес). Това е ключова област за бърза оптимизация.`,
        impact: isEn ? `Savings: ~€${suggestReduction}/mo` : `Спестяване: ~€${suggestReduction}/мес`,
        actionableTip: isEn
          ? `Reducing spending on ${topCatDisplay} by just 15% will free up around €${suggestReduction} in extra cash every month.`
          : `Намаляването на харчовете за ${topCatDisplay} с едва 15% ще освободи около €${suggestReduction} допълнителни свободни парични средства всеки месец.`,
        metricLabel: isEn ? "Share of total expenses" : "Дял от общите разходи",
        metricValue: `${topCatPct}%`,
        isTopRecommendation: true,
      });
    } else {
      insights.push({
        id: "spending_healthy_distribution",
        type: "spending",
        category: "spending",
        priority: "low",
        title: isEn ? "Balanced expense distribution" : "Балансирано разпределение на разходите",
        description: isEn
          ? `Your largest category is “${topCatDisplay}” at ${topCatPct}%, showing healthy diversification without over-reliance on a single category.`
          : `Най-голямото перо е „${topCatDisplay}“ с ${topCatPct}%, което показва стабилна диверсификация без прекомерна зависимост от единична категория.`,
        actionableTip: isEn
          ? "Continue tracking expenses by category to preserve this healthy balance."
          : "Продължавайте да следите разходите по категории, за да задържите този баланс.",
        metricLabel: isEn ? "Top category" : "Водеща категория",
        metricValue: `${topCatDisplay} (${topCatPct}%)`,
      });
    }
  }

  // Dining & Food Delivery / Entertainment analysis
  const diningTotal =
    (expensesByCategory["Ресторант"] || 0) +
    (expensesByCategory["Ресторанти"] || 0) +
    (expensesByCategory["Кафе"] || 0) +
    (expensesByCategory["Забавления"] || 0);

  if (diningTotal > 0 && totalExpenses > 0) {
    const diningMonthly = monthsCount > 0 ? diningTotal / monthsCount : diningTotal;
    const diningPct = (diningTotal / totalExpenses) * 100;

    if (diningPct > 15 || diningMonthly > 120) {
      const diningSavings = Math.round(diningMonthly * 0.25);
      potentialMonthlySavings += diningSavings;

      insights.push({
        id: "spending_dining_out",
        type: "spending",
        category: "spending",
        priority: "medium",
        title: isEn
          ? "Opportunity to reduce dining out and entertainment costs"
          : "Възможност за намаляване на разходите за хранене навън и заведения",
        description: isEn
          ? `You spend an average of €${diningMonthly.toFixed(2)} per month on restaurants, cafes, and entertainment (${diningPct.toFixed(1)}% of expenses).`
          : `За ресторанти, кафе и забавления харчите средно €${diningMonthly.toFixed(2)} на месец (${diningPct.toFixed(1)}% от бюджета).`,
        impact: isEn ? `Savings: ~€${diningSavings}/mo` : `Спестяване: ~€${diningSavings}/мес`,
        actionableTip: isEn
          ? `Cooking at home just 2–3 extra times per month can save roughly €${diningSavings}/mo without limiting your social life.`
          : `Приготвянето на храна у дома само 2-3 пъти повече в месеца може да спести приблизително €${diningSavings} на месец, без да ограничава социалния ви живот.`,
        metricLabel: isEn ? "Monthly dining & leisure" : "Месечно за заведения",
        metricValue: `€${diningMonthly.toFixed(2)}`,
        isTopRecommendation: true,
      });
    }
  }

  // Ratio of Fixed vs Variable Expenses (50/30/20 Rule advice)
  if (totalExpenses > 0) {
    const fixedRatio = Math.round((totalFixedExpenses / totalExpenses) * 100);
    const variableRatio = Math.round((totalVariableExpenses / totalExpenses) * 100);

    if (fixedRatio > 65) {
      insights.push({
        id: "spending_fixed_high",
        type: "recommendation",
        category: "spending",
        priority: "high",
        title: isEn
          ? `Budget tip: High recurring commitments (${fixedRatio}%)`
          : `Бюджетен съвет: Високи повтарящи се ангажименти (${fixedRatio}%)`,
        description: isEn
          ? `Your recurring expenses (loans, bills, subscriptions) take up ${fixedRatio}% of all expenses. The recommended 50/30/20 threshold is up to 50%.`
          : `Повтарящите ви се разходи (кредити, сметки, абонаменти) заемат ${fixedRatio}% от всички разходи. Препоръчителният праг по правилото 50/30/20 е до 50%.`,
        impact: isEn ? "Debt & contract optimization" : "Оптимизация на дълг и договори",
        actionableTip: isEn
          ? "Review mobile, TV, and insurance subscriptions or consider refinancing high-interest loans."
          : "Прегледайте абонаментите за мобилни оператори, телевизия и застраховки или помислете за предоговаряне на банкови лихви и обединяване на кредити.",
        metricLabel: isEn ? "Recurring expenses" : "Повтарящи се разходи",
        metricValue: `${fixedRatio}%`,
        isTopRecommendation: true,
      });
    } else {
      insights.push({
        id: "spending_fixed_good",
        type: "spending",
        category: "spending",
        priority: "low",
        title: isEn
          ? "Healthy split between recurring and variable expenses"
          : "Добра структура между повтарящи се и допълнителни разходи",
        description: isEn
          ? `Recurring expenses are ${fixedRatio}% and variable expenses are ${variableRatio}%, leaving solid flexibility for unexpected needs.`
          : `Повтарящите ви се разходи са ${fixedRatio}%, а текущите допълнителни са ${variableRatio}%, което оставя достатъчна гъвкавост за реакция при непредвидени обстоятелства.`,
        actionableTip: isEn
          ? "Keep control over variable spending by tracking weekly category limits."
          : "Запазете контрола върху гъвкавите разходи чрез редовно следене на седмичните лимити.",
        metricLabel: isEn ? "Recurring / Additional" : "Повтарящи се / Допълнителни",
        metricValue: `${fixedRatio}% / ${variableRatio}%`,
      });
    }
  }

  // ----------------------------------------------------
  // 2. UNUSUAL EXPENSE DETECTION
  // ----------------------------------------------------
  if (allExpenses.length >= 3) {
    const avgExpenseAmount = totalExpenses / allExpenses.length;
    // Find expenses that are > 2.5x the average single expense and > €75
    const outliers = allExpenses
      .filter((e) => e.amount > avgExpenseAmount * 2.5 && e.amount >= 75)
      .sort((a, b) => b.amount - a.amount);

    if (outliers.length > 0) {
      const topOutlier = outliers[0];
      const outlierCat = translateCategoryName(topOutlier.categoryName, lang);
      insights.push({
        id: `unusual_exp_${topOutlier.id}`,
        type: "unusual",
        category: "spending",
        priority: "medium",
        title: isEn
          ? `Unusually large single expense detected: €${topOutlier.amount.toFixed(2)}`
          : `Открит необичайно висок единичен разход: €${topOutlier.amount.toFixed(2)}`,
        description: isEn
          ? `The payment in “${outlierCat}” (${topOutlier.note || "no note"}) exceeds your typical transaction size by more than 2.5x.`
          : `Плащането в категория „${outlierCat}“ (${topOutlier.note || "без бележка"}) надвишава обичайния размер на трансакциите повече от 2.5 пъти.`,
        impact: isEn ? "Notice: One-time spike" : "Внимание: Еднократно натоварване",
        actionableTip: isEn
          ? "If this is an annual or seasonal expense, consider creating a dedicated savings goal so it does not strain a single month's budget."
          : "Ако това е редовно повтарящ се годишен или сезонен разход, създайте отделен целеви подфонд, за да не натоварва бюджета в рамките на един-единствен месец.",
        metricLabel: isEn ? "Expense amount" : "Сума на записа",
        metricValue: `€${topOutlier.amount.toFixed(2)}`,
        isTopRecommendation: outliers.length > 0 && runwayMonths < 3,
      });
    }
  }

  // ----------------------------------------------------
  // 3. SAVINGS ANALYSIS & OPPORTUNITIES
  // ----------------------------------------------------
  if (runwayMonths < 3) {
    const targetFund = avgMonthlyExpenses * 3;
    const deficit = Math.max(0, targetFund - currentSavingsBalance);
    const monthlyNeeded = Math.round(deficit / 6);

    insights.push({
      id: "savings_emergency_fund_critical",
      type: "savings",
      category: "savings",
      priority: "high",
      title: isEn
        ? "Priority: Build a 3-month Emergency Fund"
        : "Спешна възможност: Изграждане на 3-месечен авариен фонд",
      description: isEn
        ? `Your current savings cover ${runwayMonths} months of expenses. Financial guidelines recommend at least 3 to 6 months as a safety buffer.`
        : `Текущите ви спестявания покриват ${runwayMonths} месеца от месечните ви разходи. Финансовите експерти препоръчват минимум 3 до 6 месеца буфер за сигурност.`,
      impact: isEn ? `Target: €${targetFund.toFixed(0)} fund` : `Цел: €${targetFund.toFixed(0)} фонд`,
      actionableTip: isEn
        ? `Setting aside an extra €${monthlyNeeded}/mo will build a full 3-month safety reserve within the next six months.`
        : `Заделянето на допълнителни €${monthlyNeeded}/мес ще ви осигури пълен 3-месечен фонд за сигурност само за следващите половин година.`,
      metricLabel: isEn ? "Current buffer" : "Наличен буфер",
      metricValue: isEn ? `${runwayMonths} mo.` : `${runwayMonths} мес.`,
      isTopRecommendation: true,
    });
  } else if (runwayMonths >= 6) {
    insights.push({
      id: "savings_runway_strong",
      type: "savings",
      category: "savings",
      priority: "opportunity",
      title: isEn
        ? `Strong emergency buffer (${runwayMonths} months covered)`
        : `Отличен авариен буфер (${runwayMonths} месеца издръжка)`,
      description: isEn
        ? `You have €${currentSavingsBalance.toFixed(2)} saved, providing peace of mind for over half a year in case of income disruption.`
        : `Имате натрупани €${currentSavingsBalance.toFixed(2)}, които гарантират спокойствие за повече от половин година при евентуална загуба на доходи.`,
      impact: isEn ? "Investment opportunity" : "Възможност за инвестиции",
      actionableTip: isEn
        ? "With your emergency fund fully covered, consider allocating new savings toward long-term yielding instruments."
        : "Тъй като аварийният ви фонд е напълно обезпечен, можете да помислите за доходно насочване на новите спестявания към дългосрочни инструменти.",
      metricLabel: isEn ? "Expense coverage" : "Покритие на разходи",
      metricValue: isEn ? `${runwayMonths} months` : `${runwayMonths} месеца`,
      isTopRecommendation: false,
    });
  } else {
    insights.push({
      id: "savings_runway_moderate",
      type: "savings",
      category: "savings",
      priority: "medium",
      title: isEn
        ? `Solid savings buffer (${runwayMonths} months)`
        : `Стабилен спестовен фонд (${runwayMonths} месеца)`,
      description: isEn
        ? `Your savings cover ${runwayMonths} months of expenses. Growing this toward 6 months will maximize financial security.`
        : `Спестовният ви фонд покрива разходите за ${runwayMonths} месеца. Придвижването към 6 месеца ще ви осигури максимална сигурност.`,
      actionableTip: isEn
        ? "Automate saving on payday using the “Pay yourself first” principle."
        : "Автоматизирайте спестяването още в деня на получаване на заплата (принципът „Плати първо на себе си“).",
      metricLabel: isEn ? "Available balance" : "Наличност",
      metricValue: `€${currentSavingsBalance.toFixed(2)}`,
    });
  }

  // Savings rate recommendations
  if (savingsRate < 10 && avgMonthlyIncome > 0) {
    const boostSavings = Math.round(avgMonthlyIncome * 0.1);
    potentialMonthlySavings += boostSavings;

    insights.push({
      id: "savings_rate_low",
      type: "recommendation",
      category: "savings",
      priority: "high",
      title: isEn
        ? "Aim to raise your savings rate to at least 15%"
        : "Увеличете нормата на спестяване до поне 15%",
      description: isEn
        ? `You are currently saving an average of ${savingsRate.toFixed(1)}% of income. A healthy long-term target is 15–20%.`
        : `В момента спестявате средно ${savingsRate.toFixed(1)}% от доходите си. Златният стандарт за финансова независимост е минимум 15-20%.`,
      impact: isEn ? `Potential: +€${boostSavings}/mo` : `Потенциал: +€${boostSavings}/мес`,
      actionableTip: isEn
        ? "Redirect money saved from trimming subscriptions and dining out straight into savings at the start of the month."
        : "Пренасочете спестените пари от оптимизиране на абонаменти и ресторанти директно към спестовната сметка преди началото на месеца.",
      metricLabel: isEn ? "Current rate" : "Текуща норма",
      metricValue: `${savingsRate.toFixed(1)}%`,
    });
  }

  // ----------------------------------------------------
  // 4. ELECTRICITY ANALYSIS & EFFICIENCY
  // ----------------------------------------------------
  if (electricityHistory.length > 0) {
    const totalElecCost = electricityHistory.reduce((s, h) => s + h.totalCost, 0);
    const avgElecCost = totalElecCost / electricityHistory.length;
    const totalCons = electricityHistory.reduce((s, h) => s + h.consumption, 0);
    const avgCons = totalCons / electricityHistory.length;

    // Check Day vs Night tariff efficiency
    const totalDayCons = electricityHistory.reduce((s, h) => s + h.consT1, 0);
    const totalNightCons = electricityHistory.reduce((s, h) => s + h.consT2, 0);
    const nightRatio = totalCons > 0 ? Math.round((totalNightCons / totalCons) * 100) : 0;

    if (nightRatio < 30) {
      const elecSavings = Math.round(avgElecCost * 0.12);
      potentialMonthlySavings += elecSavings;

      insights.push({
        id: "elec_night_tariff_opportunity",
        type: "electricity",
        category: "electricity",
        priority: "medium",
        title: isEn
          ? `Electricity: Low night-tariff usage (${nightRatio}%)`
          : `Електроенергия: Ниско използване на нощната тарифа (${nightRatio}%)`,
        description: isEn
          ? `Only ${nightRatio}% of your electricity is consumed on the cheaper night tariff. Night rates are nearly 40% lower than daytime rates.`
          : `Само ${nightRatio}% от електроенергията ви се потребява на евтината нощна тарифа. Нощната тарифа е почти 40% по-изгодна от дневната.`,
        impact: isEn ? `Savings: ~€${elecSavings}/mo` : `Спестяване: ~€${elecSavings}/мес`,
        actionableTip: isEn
          ? "Schedule water heaters, washing machines, and dishwashers via timer during night hours (22:00 – 06:00) to cut bills by up to 15%."
          : "Настройвайте бойлера, пералнята и съдомиялната машина с таймер за работа в нощните часове (22:00 - 06:00 ч.), за да намалите сметката с до 15%.",
        metricLabel: isEn ? "Night tariff share" : "Нощна тарифа",
        metricValue: `${nightRatio}%`,
        isTopRecommendation: true,
      });
    } else {
      insights.push({
        id: "elec_tariff_efficient",
        type: "electricity",
        category: "electricity",
        priority: "low",
        title: isEn
          ? `Great night-tariff electricity optimization (${nightRatio}%)`
          : `Отлична оптимизация на нощната тарифа за ток (${nightRatio}%)`,
        description: isEn
          ? `You consume ${nightRatio}% of energy at the lower night rate, creating consistent monthly savings.`
          : `Потребявате ${nightRatio}% от енергията на по-ниската цена, което ви осигурява реални спестявания всеки месец.`,
        actionableTip: isEn
          ? "Continue running high-draw appliances during off-peak night hours."
          : "Продължавайте да планирате енергоемките уреди през часовете с намалена цена на киловатчас.",
        metricLabel: isEn ? "Night usage share" : "Дял нощна консумация",
        metricValue: `${nightRatio}%`,
      });
    }

    // Check consumption trend across last 2 electricity records
    if (electricityHistory.length >= 2) {
      const latest = electricityHistory[0];
      const previous = electricityHistory[1];
      const costChange = latest.totalCost - previous.totalCost;
      const pctChange = previous.totalCost > 0 ? (costChange / previous.totalCost) * 100 : 0;

      if (pctChange > 15) {
        const prevPeriodDisplay = formatLocalizedMonthYear(
          `${previous.month} ${previous.year}`,
          lang
        );
        insights.push({
          id: "elec_cost_spike",
          type: "trend",
          category: "electricity",
          priority: "high",
          title: isEn
            ? `Electricity bill spike: +${pctChange.toFixed(0)}% (€${latest.totalCost.toFixed(2)})`
            : `Ръст в сметката за ток: +${pctChange.toFixed(0)}% (€${latest.totalCost.toFixed(2)})`,
          description: isEn
            ? `Your latest bill is €${costChange.toFixed(2)} higher than the previous period (${prevPeriodDisplay}).`
            : `Последната ви сметка е с €${costChange.toFixed(2)} по-висока спрямо предходния отчен период (${prevPeriodDisplay}).`,
          impact: isEn
            ? `Usage: +${(latest.consumption - previous.consumption).toFixed(0)} kWh`
            : `Консумация: +${(latest.consumption - previous.consumption).toFixed(0)} kWh`,
          actionableTip: isEn
            ? "Check for increased heating/AC runtime or window and door insulation."
            : "Проверете за увеличена работа на отоплителни или климатични уреди, или уплътнения на прозорци и врати.",
          metricLabel: isEn ? "Change vs prior month" : "Промяна спрямо минал месец",
          metricValue: `+${pctChange.toFixed(0)}%`,
        });
      }
    }
  }

  // ----------------------------------------------------
  // 5. TREND ANALYSIS & BUDGET OPTIMIZATION ADVICE
  // ----------------------------------------------------
  let budgetOverspendPotential = 0;
  if (totalMonthlyBudget > 0 && avgMonthlyExpenses > 0) {
    const budgetPct = Math.round((avgMonthlyExpenses / totalMonthlyBudget) * 100);

    if (budgetPct > 100) {
      const overspent = Math.round(avgMonthlyExpenses - totalMonthlyBudget);
      budgetOverspendPotential = Math.max(budgetOverspendPotential, overspent);
      insights.push({
        id: "budget_over_limit",
        type: "recommendation",
        category: "trend",
        priority: "high",
        title: isEn
          ? `Monthly budget exceeded by €${overspent}`
          : `Превишаване на месечния бюджет с €${overspent}`,
        description: isEn
          ? `Your average monthly spend (€${avgMonthlyExpenses.toFixed(2)}) exceeds the €${totalMonthlyBudget.toFixed(2)} limit by ${budgetPct - 100}%.`
          : `Средният ви месечен разход (€${avgMonthlyExpenses.toFixed(2)}) надвишава определения лимит от €${totalMonthlyBudget.toFixed(2)} с ${budgetPct - 100}%.`,
        impact: isEn ? `Overspent: €${overspent}/mo` : `Преразход: €${overspent}/мес`,
        actionableTip: isEn
          ? "Review individual category limits in the Budgets tab or adjust the monthly limit to match your actual needs."
          : "Прегледайте индивидуалните лимити по категории в секция „Бюджет“ или коригирайте месечния лимит според реалните ви нужди.",
        metricLabel: isEn ? "Limit utilization" : "Усвояване на лимита",
        metricValue: `${budgetPct}%`,
        isTopRecommendation: true,
      });
    } else {
      const surplus = Math.round(totalMonthlyBudget - avgMonthlyExpenses);
      insights.push({
        id: "budget_healthy_cushion",
        type: "trend",
        category: "trend",
        priority: "low",
        title: isEn
          ? `Budget stays on track (€${surplus} cushion)`
          : `Бюджетът се спазва стриктно (€${surplus} буфер)`,
        description: isEn
          ? `You spend on average ${budgetPct}% of your monthly limit (€${totalMonthlyBudget.toFixed(2)}), keeping a positive margin.`
          : `Харчите средно ${budgetPct}% от зададения месечен лимит (€${totalMonthlyBudget.toFixed(2)}), запазвайки положителен свободен остатък.`,
        actionableTip: isEn
          ? `Transfer the remaining €${surplus} cushion directly to your savings fund at the end of each month.`
          : `Прехвърляйте спестения буфер от €${surplus} автоматично към спестовния фонд в края на всеки месец.`,
        metricLabel: isEn ? "Available margin" : "Свободен марж",
        metricValue: isEn ? `€${surplus}/mo` : `€${surplus}/мес`,
      });
    }
  }

  if (exceededCategoryBudgets.length > 0) {
    const roundedCatOverspend = Math.round(categoryOverspendTotal);
    budgetOverspendPotential = Math.max(budgetOverspendPotential, roundedCatOverspend);
    const topExceeded = [...exceededCategoryBudgets].sort(
      (a, b) => b.overspentAmount - a.overspentAmount
    )[0];
    const topBudgetLabel = topExceeded.budget.categoryName;

    insights.push({
      id: "budget_categories_over_limit",
      type: "recommendation",
      category: "trend",
      priority: "high",
      title: isEn
        ? `Category budget exceeded: ${topBudgetLabel} (+€${topExceeded.overspentAmount.toFixed(0)})`
        : `Надвишен бюджет по категория: ${topBudgetLabel} (+€${topExceeded.overspentAmount.toFixed(0)})`,
      description: isEn
        ? `${exceededCategoryBudgets.length} category budget(s) exceeded their limit by a combined €${categoryOverspendTotal.toFixed(2)}.`
        : `${exceededCategoryBudgets.length} бюджетни категории надвишават лимита си с общо €${categoryOverspendTotal.toFixed(2)}.`,
      impact: isEn
        ? `Cut overspend: ~€${roundedCatOverspend}/mo`
        : `Ограничаване на преразхода: ~€${roundedCatOverspend}/мес`,
      actionableTip: isEn
        ? `Trim spending in “${topBudgetLabel}” or rebalance category limits in the Budgets tab.`
        : `Намалете разходите в „${topBudgetLabel}“ или преразпределете лимитите в секция „Бюджети“.`,
      metricLabel: isEn ? "Exceeded categories" : "Превишени категории",
      metricValue: `${exceededCategoryBudgets.length}`,
      isTopRecommendation: true,
    });
  }

  potentialMonthlySavings += budgetOverspendPotential;

  if (activeGoals.length > 0 && totalGoalTarget > 0) {
    const progressPct = Math.round((totalGoalAllocated / totalGoalTarget) * 100);
    const suggestedMonthlyGoal = Math.round(totalGoalRemaining / 6);
    insights.push({
      id: "savings_goals_progress",
      type: "savings",
      category: "savings",
      priority: totalGoalRemaining > 0 ? "opportunity" : "low",
      title: isEn
        ? totalGoalRemaining > 0
          ? `Savings goals at ${progressPct}% (€${totalGoalRemaining.toFixed(0)} remaining)`
          : "All active savings goals fully funded"
        : totalGoalRemaining > 0
        ? `Цели за спестяване на ${progressPct}% (остават €${totalGoalRemaining.toFixed(0)})`
        : "Всички активни спестовни цели са достигнати",
      description: isEn
        ? `Allocated €${totalGoalAllocated.toFixed(2)} toward €${totalGoalTarget.toFixed(2)} across ${activeGoals.length} active goal(s).`
        : `Заделени са €${totalGoalAllocated.toFixed(2)} от общо €${totalGoalTarget.toFixed(2)} по ${activeGoals.length} активни цели.`,
      impact:
        totalGoalRemaining > 0
          ? isEn
            ? `Goal pace: ~€${suggestedMonthlyGoal}/mo`
            : `Нужен темп: ~€${suggestedMonthlyGoal}/мес`
          : undefined,
      actionableTip: isEn
        ? totalGoalRemaining > 0
          ? `Allocating ~€${suggestedMonthlyGoal}/mo keeps you on track to complete your active goals in 6 months.`
          : "Great discipline — consider adding a new goal or investing surplus funds."
        : totalGoalRemaining > 0
        ? `Отделянето на ~€${suggestedMonthlyGoal}/мес ще покрие остатъка по целите ви в рамките на 6 месеца.`
        : "Отлична дисциплина — добавете нова цел или насочете свободния ресурс към инвестиции.",
      metricLabel: isEn ? "Goals funded" : "Покритие на цели",
      metricValue: `${progressPct}%`,
    });
  }

  // ----------------------------------------------------
  // 6. INCOME TRENDS, DIVERSIFICATION & SAVINGS TARGET
  // ----------------------------------------------------
  const now = new Date();
  const currentMonthName = MONTHS_BG[now.getMonth()];
  const currentYear = now.getFullYear();
  const momComparison = computeMonthToMonthComparison(
    currentMonthName,
    currentYear,
    monthlyData,
    globalSavings
  );

  if (
    momComparison.income.previousValue > 0 &&
    momComparison.income.currentValue > 0 &&
    Math.abs(momComparison.income.percentageChange) >= 3
  ) {
    const isUp = momComparison.income.difference > 0;
    const currLabel = formatLocalizedMonthYear(momComparison.currentMonthLabel, lang);
    const prevLabel = formatLocalizedMonthYear(momComparison.previousMonthLabel, lang);
    insights.push({
      id: "income_mom_trend",
      type: "income",
      category: "income",
      priority: isUp ? "opportunity" : "medium",
      title: isEn
        ? isUp
          ? `Income increased by ${momComparison.income.formattedPercentage} vs last month`
          : `Income decreased by ${momComparison.income.formattedPercentage} vs last month`
        : isUp
        ? `Приходите са нараснали с ${momComparison.income.formattedPercentage} спрямо миналия месец`
        : `Понижение на приходите с ${momComparison.income.formattedPercentage} спрямо миналия месец`,
      description: isEn
        ? `For ${currLabel}, recorded income was €${momComparison.income.currentValue.toFixed(2)} compared to €${momComparison.income.previousValue.toFixed(2)} in ${prevLabel}.`
        : `За ${currLabel} са отчетени €${momComparison.income.currentValue.toFixed(2)} приход спрямо €${momComparison.income.previousValue.toFixed(2)} за ${prevLabel}.`,
      impact: isEn
        ? isUp
          ? `+€${momComparison.income.difference.toFixed(2)} extra funds`
          : `-€${Math.abs(momComparison.income.difference).toFixed(2)} lower income`
        : isUp
        ? `+€${momComparison.income.difference.toFixed(2)} повече ресурс`
        : `-€${Math.abs(momComparison.income.difference).toFixed(2)} по-нисък приход`,
      actionableTip: isEn
        ? isUp
          ? "Use the extra income to accelerate a savings goal or pay down recurring obligations."
          : "With lower monthly income, review discretionary spending to keep net balance positive."
        : isUp
        ? "Използвайте допълнителния приход за ускоряване на спестовната цел или погасяване на повтарящи се задължения."
        : "При по-нисък месечен приход прегледайте променливите разходи, за да запазите положителния нетен баланс.",
      metricLabel: isEn ? "Change (MoM)" : "Промяна (MoM)",
      metricValue: momComparison.income.formattedPercentage,
    });
  }

  const sortedIncomeCats = Object.entries(incomesByCategory).sort((a, b) => b[1] - a[1]);
  const topIncomeCat = sortedIncomeCats[0];
  if (topIncomeCat && totalIncome > 0) {
    const sharePct = Math.round((topIncomeCat[1] / totalIncome) * 100);
    const topIncomeDisplay = translateCategoryName(topIncomeCat[0], lang);
    insights.push({
      id: "income_top_source",
      type: "income",
      category: "income",
      priority: sharePct >= 85 && sortedIncomeCats.length === 1 ? "medium" : "low",
      title: isEn
        ? `Primary income source: “${topIncomeDisplay}” (${sharePct}%)`
        : `Основен източник на доход: „${topIncomeDisplay}“ (${sharePct}%)`,
      description: isEn
        ? `Category “${topIncomeDisplay}” generated €${topIncomeCat[1].toFixed(2)}, representing ${sharePct}% of analyzed income.`
        : `Категория „${topIncomeDisplay}“ генерира €${topIncomeCat[1].toFixed(2)} или ${sharePct}% от общите анализирани приходи.`,
      actionableTip: isEn
        ? sortedIncomeCats.length > 1
          ? `You have ${sortedIncomeCats.length} active income streams — maintaining diverse sources strengthens financial resilience.`
          : "Adding a secondary income stream (freelance, dividends, or rent) reduces risk if primary salary changes."
        : sortedIncomeCats.length > 1
        ? `Имате ${sortedIncomeCats.length} активни източника на приход — поддържането на допълнителни канали повишава финансовата устойчивост.`
        : "Добавянето на вторичен източник на доход (фрийланс, дивидент или наем) намалява риска при промяна в основната заплата.",
      metricLabel: isEn ? "Share of income" : "Дял от приходите",
      metricValue: `${sharePct}%`,
    });
  }

  const { savingsTargetPercent = 20 } = loadAppSettings();
  if (avgMonthlyIncome > 0) {
    const targetSaveAmount = (avgMonthlyIncome * savingsTargetPercent) / 100;
    const actualSavedAvg = Math.max(0, avgMonthlyIncome - avgMonthlyExpenses);
    const meetsTarget = savingsRate >= savingsTargetPercent;

    insights.push({
      id: "income_savings_target_alignment",
      type: "income",
      category: "income",
      priority: meetsTarget ? "low" : "opportunity",
      title: isEn
        ? meetsTarget
          ? `Meeting your ${savingsTargetPercent}% savings target`
          : `Savings tip: €${targetSaveAmount.toFixed(0)}/mo (${savingsTargetPercent}%)`
        : meetsTarget
        ? `Постигате целевото спестяване от ${savingsTargetPercent}%`
        : `Препоръка за спестяване: €${targetSaveAmount.toFixed(0)}/мес (${savingsTargetPercent}%)`,
      description: isEn
        ? `With an average monthly income of €${avgMonthlyIncome.toFixed(2)}, your ${savingsTargetPercent}% target requires €${targetSaveAmount.toFixed(2)}/mo (current net surplus: €${actualSavedAvg.toFixed(2)}).`
        : `При среден месечен доход €${avgMonthlyIncome.toFixed(2)} зададената цел от ${savingsTargetPercent}% изисква заделяне на €${targetSaveAmount.toFixed(2)} на месец (текущ нетен остатък: €${actualSavedAvg.toFixed(2)}).`,
      impact: isEn
        ? `Target: €${targetSaveAmount.toFixed(2)}/mo`
        : `Цел: €${targetSaveAmount.toFixed(2)}/мес`,
      actionableTip: isEn
        ? meetsTarget
          ? "Maintain this discipline or raise your savings percentage on the dashboard to build wealth faster."
          : `Set aside €${targetSaveAmount.toFixed(2)} immediately upon receiving income and budget the remaining €${(avgMonthlyIncome - targetSaveAmount).toFixed(2)}.`
        : meetsTarget
        ? "Запазете текущата дисциплина или увеличете процента на спестяване на таблото за по-бързо натрупване."
        : `Заделете €${targetSaveAmount.toFixed(2)} веднага при постъпване на дохода и планирайте месечните разходи с останалите €${(avgMonthlyIncome - targetSaveAmount).toFixed(2)}.`,
      metricLabel: isEn ? `Target ${savingsTargetPercent}%` : `Цел ${savingsTargetPercent}%`,
      metricValue: isEn ? `€${targetSaveAmount.toFixed(0)}/mo` : `€${targetSaveAmount.toFixed(0)}/мес`,
    });
  }

  if (
    totalVariableExpenses > 0 &&
    potentialMonthlySavings === 0
  ) {
    const avgMonthlyVariable =
      monthsCount > 0 ? totalVariableExpenses / monthsCount : totalVariableExpenses;
    potentialMonthlySavings += Math.round(avgMonthlyVariable * 0.1);
  }

  if (
    totalGoalRemaining > 0 &&
    (avgMonthlyExpenses > 0 || avgMonthlyIncome > 0)
  ) {
    const goalPotentialCap = Math.max(
      1,
      Math.round((avgMonthlyExpenses > 0 ? avgMonthlyExpenses : avgMonthlyIncome) * 0.1)
    );
    potentialMonthlySavings += Math.min(Math.round(totalGoalRemaining / 12), goalPotentialCap);
  }

  // Ensure we have top recommendations prioritized
  const sortedByPriority = [...insights].sort((a, b) => {
    const priorityWeight: Record<InsightPriority, number> = {
      high: 4,
      opportunity: 3,
      medium: 2,
      low: 1,
    };
    return priorityWeight[b.priority] - priorityWeight[a.priority];
  });

  // Mark top 3 as topRecommendations
  const topRecommendations = sortedByPriority.slice(0, 3);
  topRecommendations.forEach((item) => {
    item.isTopRecommendation = true;
  });

  return {
    healthScore: {
      score: healthScoreVal,
      rating: healthRating,
      savingsRate: parseFloat(savingsRate.toFixed(1)),
      runwayMonths,
      monthlySavingsPotential: Math.max(0, Math.round(potentialMonthlySavings)),
    },
    totalExpensesAnalyzed: parseFloat(totalExpenses.toFixed(2)),
    totalIncomeAnalyzed: parseFloat(totalIncome.toFixed(2)),
    totalSavingsBalance: parseFloat(currentSavingsBalance.toFixed(2)),
    monthsAnalyzedCount: monthsCount,
    insights: sortedByPriority,
    topRecommendations,
  };
}
