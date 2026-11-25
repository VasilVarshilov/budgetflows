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

export type AiMetricId =
  | "healthScore"
  | "savingsRate"
  | "runwayMonths"
  | "monthlySavingsPotential";

export interface MetricBreakdownInput {
  label: string;
  value: string;
}

export interface MetricBreakdownStep {
  label: string;
  detail: string;
  delta?: string;
  tone?: "positive" | "negative" | "neutral";
}

export interface MetricExplanationData {
  id: AiMetricId;
  title: string;
  displayValue: string;
  badgeText?: string;
  formula: string;
  inputsUsed: MetricBreakdownInput[];
  calculationSteps: MetricBreakdownStep[];
  interpretation: string;
  recommendations: string[];
  targetActionTab?: "budgets" | "savings" | "monthly" | "income";
  targetActionLabel?: string;
}

export interface FullAnalysisResult {
  healthScore: FinancialHealthScore;
  totalExpensesAnalyzed: number;
  totalIncomeAnalyzed: number;
  totalSavingsBalance: number;
  monthsAnalyzedCount: number;
  insights: FinancialInsight[];
  topRecommendations: FinancialInsight[];
  metricBreakdowns: Record<AiMetricId, MetricExplanationData>;
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
  const healthScoreFactors: MetricBreakdownStep[] = [
    {
      label: isEn ? "Baseline score" : "Базова начална стойност",
      detail: isEn ? "Standard starting index before financial adjustments" : "Стандартна отправна точка преди корекциите",
      delta: "50",
      tone: "neutral",
    },
  ];

  if (savingsRate >= 20) {
    healthScoreVal += 20;
    healthScoreFactors.push({
      label: isEn ? "Savings rate (≥ 20%)" : "Норма на спестяване (≥ 20%)",
      detail: isEn
        ? `Strong savings rate of ${savingsRate.toFixed(1)}% meets the ≥ 20% benchmark.`
        : `Отлична норма на спестяване от ${savingsRate.toFixed(1)}% (праг ≥ 20%).`,
      delta: "+20",
      tone: "positive",
    });
  } else if (savingsRate >= 10) {
    healthScoreVal += 10;
    healthScoreFactors.push({
      label: isEn ? "Savings rate (10% – 19.9%)" : "Норма на спестяване (10% – 19.9%)",
      detail: isEn
        ? `Moderate savings rate of ${savingsRate.toFixed(1)}% gives a partial bonus.`
        : `Умерена норма на спестяване от ${savingsRate.toFixed(1)}% (праг ≥ 10%).`,
      delta: "+10",
      tone: "positive",
    });
  } else if (avgMonthlyExpenses > avgMonthlyIncome && avgMonthlyExpenses > 0) {
    healthScoreVal -= 20;
    healthScoreFactors.push({
      label: isEn ? "Monthly deficit (expenses > income)" : "Месечен дефицит (разходи > приходи)",
      detail: isEn
        ? `Avg monthly expenses (€${avgMonthlyExpenses.toFixed(2)}) exceed avg income (€${avgMonthlyIncome.toFixed(2)}).`
        : `Средните месечни разходи (€${avgMonthlyExpenses.toFixed(2)}) надвишават средния доход (€${avgMonthlyIncome.toFixed(2)}).`,
      delta: "-20",
      tone: "negative",
    });
  } else {
    healthScoreFactors.push({
      label: isEn ? "Savings rate (< 10%)" : "Норма на спестяване (< 10%)",
      detail: isEn
        ? `Current savings rate is ${savingsRate.toFixed(1)}% (no bonus applied).`
        : `Текущата норма на спестяване е ${savingsRate.toFixed(1)}% (без бонус точки).`,
      delta: "0",
      tone: "neutral",
    });
  }

  if (runwayMonths >= 6) {
    healthScoreVal += 20;
    healthScoreFactors.push({
      label: isEn ? "Emergency buffer (≥ 6 months)" : "Авариен фонд (≥ 6 месеца)",
      detail: isEn
        ? `Savings cover ${runwayMonths} months of expenses (full 6+ month safety cushion).`
        : `Спестяванията покриват ${runwayMonths} месеца разходи (пълен буфер ≥ 6 мес.).`,
      delta: "+20",
      tone: "positive",
    });
  } else if (runwayMonths >= 3) {
    healthScoreVal += 10;
    healthScoreFactors.push({
      label: isEn ? "Emergency buffer (3 – 5.9 months)" : "Авариен фонд (3 – 5.9 месеца)",
      detail: isEn
        ? `Savings cover ${runwayMonths} months of expenses (solid 3+ month cushion).`
        : `Спестяванията покриват ${runwayMonths} месеца разходи (стабилен буфер ≥ 3 мес.).`,
      delta: "+10",
      tone: "positive",
    });
  } else if (runwayMonths < 1) {
    healthScoreVal -= 15;
    healthScoreFactors.push({
      label: isEn ? "Low emergency buffer (< 1 month)" : "Нисък авариен фонд (< 1 месец)",
      detail: isEn
        ? `Current buffer covers ${runwayMonths} months of expenses (below 1 month minimum).`
        : `Текущият буфер покрива ${runwayMonths} месеца разходи (под минимума от 1 месец).`,
      delta: "-15",
      tone: "negative",
    });
  } else {
    healthScoreFactors.push({
      label: isEn ? "Emergency buffer (1 – 2.9 months)" : "Авариен фонд (1 – 2.9 месеца)",
      detail: isEn
        ? `Buffer covers ${runwayMonths} months (aim for ≥ 3 months for +10 points).`
        : `Буферът покрива ${runwayMonths} месеца (при ≥ 3 месеца носи +10 точки).`,
      delta: "0",
      tone: "neutral",
    });
  }

  if (totalMonthlyBudget > 0 && avgMonthlyExpenses > 0) {
    if (avgMonthlyExpenses <= totalMonthlyBudget) {
      healthScoreVal += 10;
      healthScoreFactors.push({
        label: isEn ? "Overall budget compliance" : "Спазване на общия месечен бюджет",
        detail: isEn
          ? `Avg spend (€${avgMonthlyExpenses.toFixed(2)}) stays within €${totalMonthlyBudget.toFixed(2)} limit.`
          : `Средният разход (€${avgMonthlyExpenses.toFixed(2)}) е в рамките на лимита от €${totalMonthlyBudget.toFixed(2)}.`,
        delta: "+10",
        tone: "positive",
      });
    } else {
      healthScoreVal -= 15;
      healthScoreFactors.push({
        label: isEn ? "Overall budget exceeded" : "Превишен общ месечен бюджет",
        detail: isEn
          ? `Avg spend (€${avgMonthlyExpenses.toFixed(2)}) exceeds €${totalMonthlyBudget.toFixed(2)} limit.`
          : `Средният разход (€${avgMonthlyExpenses.toFixed(2)}) надвишава лимита от €${totalMonthlyBudget.toFixed(2)}.`,
        delta: "-15",
        tone: "negative",
      });
    }
  } else {
    healthScoreFactors.push({
      label: isEn ? "Overall monthly budget" : "Общ месечен бюджет",
      detail: isEn
        ? totalMonthlyBudget <= 0
          ? "No overall monthly budget configured yet (+10 when within limit)."
          : "No expenses recorded yet to evaluate against the monthly limit."
        : totalMonthlyBudget <= 0
        ? "Не е зададен общ месечен бюджет (при спазване носи +10 точки)."
        : "Все още няма отчетени разходи за сравнение с лимита.",
      delta: "0",
      tone: "neutral",
    });
  }

  if (exceededCategoryBudgets.length > 0) {
    const catPenalty = Math.min(10, exceededCategoryBudgets.length * 3);
    healthScoreVal -= catPenalty;
    healthScoreFactors.push({
      label: isEn ? "Exceeded category budgets" : "Превишени бюджети по категории",
      detail: isEn
        ? `${exceededCategoryBudgets.length} category budget(s) exceeded (−3 pts each, capped at −10).`
        : `${exceededCategoryBudgets.length} надвишени категории (−3 т. на категория, макс. −10).`,
      delta: `-${catPenalty}`,
      tone: "negative",
    });
  }

  if (activeGoals.length > 0 && totalGoalTarget > 0 && (totalExpenses > 0 || totalIncome > 0 || currentSavingsBalance > 0)) {
    const goalProgressPct = (totalGoalAllocated / totalGoalTarget) * 100;
    if (goalProgressPct >= 80) {
      healthScoreVal += 5;
      healthScoreFactors.push({
        label: isEn ? "Savings goals progress (≥ 80%)" : "Напредък по спестовни цели (≥ 80%)",
        detail: isEn
          ? `${goalProgressPct.toFixed(0)}% funded across ${activeGoals.length} active goal(s).`
          : `Постигнати ${goalProgressPct.toFixed(0)}% по ${activeGoals.length} активни цели.`,
        delta: "+5",
        tone: "positive",
      });
    } else if (goalProgressPct >= 40) {
      healthScoreVal += 2;
      healthScoreFactors.push({
        label: isEn ? "Savings goals progress (40% – 79%)" : "Напредък по спестовни цели (40% – 79%)",
        detail: isEn
          ? `${goalProgressPct.toFixed(0)}% funded across ${activeGoals.length} active goal(s).`
          : `Постигнати ${goalProgressPct.toFixed(0)}% по ${activeGoals.length} активни цели.`,
        delta: "+2",
        tone: "positive",
      });
    } else if (goalProgressPct < 20) {
      healthScoreVal -= 3;
      healthScoreFactors.push({
        label: isEn ? "Savings goals progress (< 20%)" : "Напредък по спестовни цели (< 20%)",
        detail: isEn
          ? `Only ${goalProgressPct.toFixed(0)}% funded toward €${totalGoalTarget.toFixed(0)} target.`
          : `Заделени са ${goalProgressPct.toFixed(0)}% от целта €${totalGoalTarget.toFixed(0)}.`,
        delta: "-3",
        tone: "negative",
      });
    }
  }

  const rawHealthScoreVal = healthScoreVal;
  healthScoreVal = Math.min(100, Math.max(10, healthScoreVal));
  if (rawHealthScoreVal !== healthScoreVal) {
    healthScoreFactors.push({
      label: isEn ? "Scale bounds (10 – 100)" : "Ограничение на скалата (10 – 100)",
      detail: isEn
        ? `Raw sum (${rawHealthScoreVal}) clamped to [10, 100].`
        : `Суровият резултат (${rawHealthScoreVal}) е ограничен в интервала [10, 100].`,
      delta: `= ${healthScoreVal}`,
      tone: "neutral",
    });
  }

  let healthRating: "Отличен" | "Добър" | "Задоволителен" | "Нужда от оптимизация" = "Добър";
  if (healthScoreVal >= 80) healthRating = "Отличен";
  else if (healthScoreVal >= 65) healthRating = "Добър";
  else if (healthScoreVal >= 45) healthRating = "Задоволителен";
  else healthRating = "Нужда от оптимизация";

  // Insights generation container
  const insights: FinancialInsight[] = [];
  let potentialMonthlySavings = 0;
  const savingsPotentialParts: MetricBreakdownStep[] = [];

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
      savingsPotentialParts.push({
        label: isEn
          ? `15% optimization in “${topCatDisplay}”`
          : `15% оптимизация в „${topCatDisplay}“`,
        detail: isEn
          ? `Top category accounts for ${topCatPct}% of expenses (€${monthlyTopSpend.toFixed(2)}/mo × 15%).`
          : `Водещата категория заема ${topCatPct}% от разходите (€${monthlyTopSpend.toFixed(2)}/мес × 15%).`,
        delta: `+€${suggestReduction}`,
        tone: "positive",
      });

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
      savingsPotentialParts.push({
        label: isEn
          ? "25% trim on dining & entertainment"
          : "25% оптимизация на заведения и развлечения",
        detail: isEn
          ? `Avg dining/leisure spend is €${diningMonthly.toFixed(2)}/mo (${diningPct.toFixed(1)}% of expenses × 25%).`
          : `Средно за заведения/забавления: €${diningMonthly.toFixed(2)}/мес (${diningPct.toFixed(1)}% от разходите × 25%).`,
        delta: `+€${diningSavings}`,
        tone: "positive",
      });

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
    savingsPotentialParts.push({
      label: isEn
        ? "10% monthly income savings shift"
        : "10% целево пренасочване от дохода",
      detail: isEn
        ? `Savings rate (${savingsRate.toFixed(1)}%) is below 10% (10% of €${avgMonthlyIncome.toFixed(2)}/mo income).`
        : `Нормата на спестяване (${savingsRate.toFixed(1)}%) е под 10% (10% от €${avgMonthlyIncome.toFixed(2)}/мес доход).`,
      delta: `+€${boostSavings}`,
      tone: "positive",
    });

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
      savingsPotentialParts.push({
        label: isEn
          ? "12% electricity night-tariff shift"
          : "12% икономия от нощна тарифа за ток",
        detail: isEn
          ? `Night usage is ${nightRatio}% (< 30%) on an avg €${avgElecCost.toFixed(2)} electricity bill (× 12%).`
          : `Нощната консумация е ${nightRatio}% (< 30%) при средна сметка €${avgElecCost.toFixed(2)} (× 12%).`,
        delta: `+€${elecSavings}`,
        tone: "positive",
      });

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
  if (budgetOverspendPotential > 0) {
    savingsPotentialParts.push({
      label: isEn
        ? "Eliminating monthly/category budget overspend"
        : "Премахване на преразхода по бюджети",
      detail: isEn
        ? `Bringing actual spending back within your configured monthly/category limits.`
        : `Връщане на текущите разходи в рамките на зададените месечни и категорийни лимити.`,
      delta: `+€${budgetOverspendPotential}`,
      tone: "positive",
    });
  }

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
    const varOptimization = Math.round(avgMonthlyVariable * 0.1);
    potentialMonthlySavings += varOptimization;
    savingsPotentialParts.push({
      label: isEn
        ? "10% variable expense optimization"
        : "10% оптимизация на променливите разходи",
      detail: isEn
        ? `Estimated 10% trim across average variable spending (€${avgMonthlyVariable.toFixed(2)}/mo).`
        : `Очаквана 10% икономия от средните допълнителни разходи (€${avgMonthlyVariable.toFixed(2)}/мес).`,
      delta: `+€${varOptimization}`,
      tone: "positive",
    });
  }

  if (
    totalGoalRemaining > 0 &&
    (avgMonthlyExpenses > 0 || avgMonthlyIncome > 0)
  ) {
    const goalPotentialCap = Math.max(
      1,
      Math.round((avgMonthlyExpenses > 0 ? avgMonthlyExpenses : avgMonthlyIncome) * 0.1)
    );
    const goalContribution = Math.min(Math.round(totalGoalRemaining / 12), goalPotentialCap);
    potentialMonthlySavings += goalContribution;
    savingsPotentialParts.push({
      label: isEn
        ? "Active savings goals pace"
        : "Темп за активните спестовни цели",
      detail: isEn
        ? `Monthly allocation needed toward €${totalGoalRemaining.toFixed(2)} remaining goal target (capped at 10%).`
        : `Месечен резерв за оставащите €${totalGoalRemaining.toFixed(2)} по целите (до 10% от базата).`,
      delta: `+€${goalContribution}`,
      tone: "positive",
    });
  }

  const roundedSavingsRate = parseFloat(savingsRate.toFixed(1));
  const finalPotentialMonthlySavings = Math.max(0, Math.round(potentialMonthlySavings));
  const avgNetMonthlySurplus = avgMonthlyIncome - avgMonthlyExpenses;
  const recommended3MoFund = avgMonthlyExpenses * 3;
  const recommended6MoFund = avgMonthlyExpenses * 6;
  const effectiveMonthsDenominator = monthsCount > 0 ? monthsCount : 1;

  const metricBreakdowns: Record<AiMetricId, MetricExplanationData> = {
    healthScore: {
      id: "healthScore",
      title: isEn ? "Financial Health Index" : "Финансов здравен индекс",
      displayValue: `${healthScoreVal}/100`,
      badgeText: translateHealthRating(healthRating, lang),
      formula: isEn
        ? "50 (Base) ± Savings Rate (±20) ± Emergency Buffer (±20/-15) ± Budget Limit (+10/-15) − Category Overspend (up to -10) ± Savings Goals (+5/-3), clamped 10–100"
        : "50 (База) ± Норма на спестяване (±20) ± Авариен буфер (±20/-15) ± Общ бюджет (+10/-15) − Надвишени категории (до -10) ± Цели (+5/-3), скала 10–100",
      inputsUsed: [
        {
          label: isEn ? "Months analyzed" : "Анализирани месеци",
          value: `${monthsCount}`,
        },
        {
          label: isEn ? "Savings rate" : "Норма на спестяване",
          value: `${roundedSavingsRate}%`,
        },
        {
          label: isEn ? "Emergency buffer" : "Авариен фонд",
          value: isEn ? `${runwayMonths} mo.` : `${runwayMonths} мес.`,
        },
        {
          label: isEn ? "Monthly budget limit" : "Общ месечен бюджет",
          value:
            totalMonthlyBudget > 0
              ? `€${totalMonthlyBudget.toFixed(2)}`
              : isEn
              ? "Not set"
              : "Не е зададен",
        },
        {
          label: isEn ? "Exceeded category budgets" : "Надвишени категорийни бюджети",
          value: `${exceededCategoryBudgets.length}`,
        },
      ],
      calculationSteps: healthScoreFactors,
      interpretation:
        healthScoreVal >= 80
          ? isEn
            ? "Excellent financial resilience: strong savings discipline, healthy emergency coverage, and controlled spending."
            : "Отлична финансова стабилност: силна спестовна дисциплина, стабилен буфер и контролирани разходи."
          : healthScoreVal >= 65
          ? isEn
            ? "Good financial balance with clear headroom to strengthen reserves or tighten budget caps."
            : "Добър финансов баланс с ясен потенциал за подсилване на резерва или оптимизиране на лимитите."
          : healthScoreVal >= 45
          ? isEn
            ? "Fair status: some areas such as savings buffer or budget adherence are pulling the score down."
            : "Задоволително състояние: отделни показатели като аварийния буфер или спазването на бюджета понижават индекса."
          : isEn
          ? "Needs optimization: expenses are close to or above income and/or emergency coverage is critically low."
          : "Нужда от оптимизация: разходите се доближават или надвишават приходите и/или аварийният резерв е критично нисък.",
      recommendations: [
        ...(savingsRate < 20
          ? [
              isEn
                ? `Raising your savings rate to ≥ 20% adds up to +20 points to your index.`
                : `Достигането на норма на спестяване ≥ 20% носи до +20 точки към индекса.`,
            ]
          : []),
        ...(runwayMonths < 6
          ? [
              isEn
                ? `Growing your emergency buffer to 3 months adds +10 points (and +20 points at 6 months).`
                : `Увеличаването на аварийния фонд до 3 месеца носи +10 точки (и +20 точки при 6 месеца).`,
            ]
          : []),
        ...(totalMonthlyBudget <= 0 || exceededCategoryBudgets.length > 0 || (totalMonthlyBudget > 0 && avgMonthlyExpenses > totalMonthlyBudget)
          ? [
              isEn
                ? `Configure and stay within monthly and category budgets for up to +10 bonus points.`
                : `Задайте и спазвайте месечния и категорийните бюджети за до +10 бонус точки.`,
            ]
          : []),
        ...(healthScoreVal >= 80
          ? [
              isEn
                ? "Maintain your current rhythm and periodically review savings goals."
                : "Поддържайте текущия ритъм и актуализирайте спестовните си цели периодично.",
            ]
          : []),
      ],
      targetActionTab: "budgets",
      targetActionLabel: isEn ? "Open Budgets" : "Към Бюджети",
    },
    savingsRate: {
      id: "savingsRate",
      title: isEn ? "Savings Rate" : "Норма на спестяване",
      displayValue: `${roundedSavingsRate}%`,
      badgeText:
        avgMonthlyIncome > 0
          ? `${savingsRate >= savingsTargetPercent ? "✓ " : ""}${isEn ? "Target" : "Цел"}: ${savingsTargetPercent}%`
          : undefined,
      formula: isEn
        ? "((Avg Monthly Income − Avg Monthly Expenses) ÷ Avg Monthly Income) × 100  [clamped 0% – 100%]"
        : "((Среден месечен приход − Среден месечен разход) ÷ Среден месечен приход) × 100  [в интервала 0% – 100%]",
      inputsUsed: [
        {
          label: isEn ? "Total completed income" : "Общо реализирани приходи",
          value: `€${totalIncome.toFixed(2)}`,
        },
        {
          label: isEn ? "Total completed expenses" : "Общо приключени разходи",
          value: `€${totalExpenses.toFixed(2)}`,
        },
        {
          label: isEn ? "Months analyzed" : "Анализирани месеци",
          value: `${monthsCount}`,
        },
        {
          label: isEn ? "Configured target" : "Заложена целева норма",
          value: `${savingsTargetPercent}%`,
        },
      ],
      calculationSteps: [
        {
          label: isEn ? "Average monthly income" : "Среден месечен приход",
          detail: `€${totalIncome.toFixed(2)} ÷ ${effectiveMonthsDenominator} = €${avgMonthlyIncome.toFixed(2)}`,
          delta: `€${avgMonthlyIncome.toFixed(2)}`,
          tone: "neutral",
        },
        {
          label: isEn ? "Average monthly expenses" : "Среден месечен разход",
          detail: `€${totalExpenses.toFixed(2)} ÷ ${effectiveMonthsDenominator} = €${avgMonthlyExpenses.toFixed(2)}`,
          delta: `€${avgMonthlyExpenses.toFixed(2)}`,
          tone: "neutral",
        },
        {
          label: isEn ? "Average monthly net surplus" : "Среден месечен нетен остатък",
          detail: `€${avgMonthlyIncome.toFixed(2)} − €${avgMonthlyExpenses.toFixed(2)}`,
          delta: `${avgNetMonthlySurplus >= 0 ? "+" : "-"}€${Math.abs(avgNetMonthlySurplus).toFixed(2)}`,
          tone: avgNetMonthlySurplus > 0 ? "positive" : avgNetMonthlySurplus < 0 ? "negative" : "neutral",
        },
        {
          label: isEn ? "Resulting savings rate" : "Изчислена норма на спестяване",
          detail:
            avgMonthlyIncome > 0
              ? `(€${avgNetMonthlySurplus.toFixed(2)} ÷ €${avgMonthlyIncome.toFixed(2)}) × 100`
              : isEn
              ? "No recorded income yet, so savings rate defaults to 0%."
              : "Все още няма въведени приходи, поради което стойността е 0%.",
          delta: `${roundedSavingsRate}%`,
          tone: roundedSavingsRate >= 15 ? "positive" : roundedSavingsRate === 0 ? "negative" : "neutral",
        },
      ],
      interpretation:
        avgMonthlyIncome <= 0
          ? isEn
            ? "Add your completed monthly income so the engine can calculate what share of income remains unspent."
            : "Добавете реализираните си приходи, за да може системата да изчисли какъв дял от дохода остава за спестяване."
          : roundedSavingsRate >= 20
          ? isEn
            ? `Strong surplus: you retain ${roundedSavingsRate}% of income each month (exceeding the 20% rule-of-thumb).`
            : `Отличен резултат: запазвате ${roundedSavingsRate}% от приходите си всеки месец (над правилото за 20%).`
          : roundedSavingsRate >= 10
          ? isEn
            ? `Moderate surplus at ${roundedSavingsRate}%. Lifting it toward 20% builds wealth and emergency reserves twice as fast.`
            : `Умерена норма от ${roundedSavingsRate}%. Покачването към 20% ускорява двойно натрупването на резерв и цели.`
          : isEn
          ? `Low savings rate (${roundedSavingsRate}%): almost all monthly income is absorbed by current expenses.`
          : `Ниска норма на спестяване (${roundedSavingsRate}%): почти целият месечен доход се поема от текущите разходи.`,
      recommendations: [
        isEn
          ? `At €${avgMonthlyIncome.toFixed(2)} avg monthly income, a ${savingsTargetPercent}% target equals €${((avgMonthlyIncome * savingsTargetPercent) / 100).toFixed(2)}/mo.`
          : `При среден доход €${avgMonthlyIncome.toFixed(2)} целта от ${savingsTargetPercent}% се равнява на €${((avgMonthlyIncome * savingsTargetPercent) / 100).toFixed(2)}/мес.`,
        isEn
          ? "Note: Only completed income and completed expenses from your monthly records enter this formula (separate transfers to Savings do not distort income)."
          : "Важно: Във формулата участват само приключените приходи и разходи по месеци.",
      ],
      targetActionTab: "income",
      targetActionLabel: isEn ? "Review Income" : "Към Приходи",
    },
    runwayMonths: {
      id: "runwayMonths",
      title: isEn ? "Emergency Savings Buffer" : "Авариен спестовен фонд",
      displayValue: isEn ? `${runwayMonths} mo.` : `${runwayMonths} мес.`,
      badgeText:
        runwayMonths >= 6
          ? isEn
            ? "Optimal (6+ mo.)"
            : "Оптимален (6+ мес.)"
          : runwayMonths >= 3
          ? isEn
            ? "Stable (3+ mo.)"
            : "Стабилен (3+ мес.)"
          : isEn
          ? "Needs buildup"
          : "Нужда от попълване",
      formula: isEn
        ? "Current Total Savings Balance ÷ Avg Monthly Expenses"
        : "Текущ баланс на спестяванията ÷ Среден месечен разход",
      inputsUsed: [
        {
          label: isEn ? "Total savings balance" : "Текущ спестовен баланс",
          value: `€${currentSavingsBalance.toFixed(2)}`,
        },
        {
          label: isEn ? "Average monthly expenses" : "Среден месечен разход",
          value: `€${avgMonthlyExpenses.toFixed(2)}`,
        },
        {
          label: isEn ? "Recommended 3-mo target" : "Препоръчителна 3-мес. цел",
          value: `€${recommended3MoFund.toFixed(2)}`,
        },
        {
          label: isEn ? "Optimal 6-mo target" : "Оптимална 6-мес. цел",
          value: `€${recommended6MoFund.toFixed(2)}`,
        },
      ],
      calculationSteps: [
        {
          label: isEn ? "Net savings available" : "Налични нето спестявания",
          detail: isEn
            ? "Sum of all deposits minus withdrawals in your Savings ledger"
            : "Сума на всички вноски минус тегления в модул „Спестявания“",
          delta: `€${currentSavingsBalance.toFixed(2)}`,
          tone: currentSavingsBalance > 0 ? "positive" : "negative",
        },
        {
          label: isEn ? "Monthly burn baseline" : "База месечен разход",
          detail: `€${totalExpenses.toFixed(2)} ÷ ${effectiveMonthsDenominator}`,
          delta: `€${avgMonthlyExpenses.toFixed(2)}/мес`,
          tone: "neutral",
        },
        {
          label: isEn ? "Coverage duration" : "Покритие в месеци",
          detail:
            avgMonthlyExpenses > 0
              ? `€${currentSavingsBalance.toFixed(2)} ÷ €${avgMonthlyExpenses.toFixed(2)}`
              : currentSavingsBalance > 0
              ? isEn
                ? "Positive savings with €0 expenses defaults to 12 months."
                : "При положителни спестявания и €0 разходи се приема база 12 месеца."
              : isEn
              ? "No savings balance or expenses recorded yet."
              : "Все още няма записани спестявания или разходи.",
          delta: isEn ? `${runwayMonths} mo.` : `${runwayMonths} мес.`,
          tone: runwayMonths >= 3 ? "positive" : "negative",
        },
      ],
      interpretation:
        runwayMonths >= 6
          ? isEn
            ? `Your savings cover ${runwayMonths} months of regular living expenses — meeting the full 6-month gold standard.`
            : `Натрупаните спестявания покриват ${runwayMonths} месеца обичайни разходи — пълно покритие над препоръчителния праг от 6 месеца.`
          : runwayMonths >= 3
          ? isEn
            ? `You have a solid ${runwayMonths}-month buffer. Adding €${Math.max(0, recommended6MoFund - currentSavingsBalance).toFixed(0)} reaches the 6-month benchmark.`
            : `Разполагате със стабилен буфер за ${runwayMonths} месеца. Още €${Math.max(0, recommended6MoFund - currentSavingsBalance).toFixed(0)} ще достигнат оптимума от 6 месеца.`
          : isEn
            ? `Your buffer covers ${runwayMonths} months. Reaching a 3-month reserve (€${recommended3MoFund.toFixed(0)}) needs €${Math.max(0, recommended3MoFund - currentSavingsBalance).toFixed(0)} more.`
            : `Буферът ви покрива ${runwayMonths} месеца. За достигане на минималния 3-месечен резерв (€${recommended3MoFund.toFixed(0)}) са нужни още €${Math.max(0, recommended3MoFund - currentSavingsBalance).toFixed(0)}.`,
      recommendations: [
        isEn
          ? "Keep 3–6 months of core expenses liquid before tying up extra cash in illiquid assets."
          : "Поддържайте поне 3 до 6 месеца основни разходи в ликвиден резерв.",
        ...(activeGoals.length > 0
          ? [
              isEn
                ? `Active savings goals progress: €${totalGoalAllocated.toFixed(2)} allocated of €${totalGoalTarget.toFixed(2)} target.`
                : `Напредък по активни цели: заделени €${totalGoalAllocated.toFixed(2)} от общо €${totalGoalTarget.toFixed(2)}.`,
            ]
          : []),
      ],
      targetActionTab: "savings",
      targetActionLabel: isEn ? "Open Savings" : "Към Спестявания",
    },
    monthlySavingsPotential: {
      id: "monthlySavingsPotential",
      title: isEn ? "Savings Potential" : "Потенциал за икономия",
      displayValue: `~€${finalPotentialMonthlySavings}`,
      badgeText: isEn ? "per month" : "на месец",
      formula: isEn
        ? "Sum of triggered optimization opportunities (Top Category 15% + Dining 25% + Low Savings Shift 10% + Night Electricity 12% + Budget Overspend + Variable/Goal Pace)"
        : "Сума на активните възможности за оптимизация (Водеща категория 15% + Заведения 25% + Доход 10% + Нощен ток 12% + Преразход по бюджети + Цели/Променливи)",
      inputsUsed: [
        {
          label: isEn ? "Top category" : "Водеща категория",
          value: topCategory
            ? `${translateCategoryName(topCategory[0], lang)} (${Math.round((topCategory[1] / Math.max(1, totalExpenses)) * 100)}%)`
            : isEn
            ? "None"
            : "Няма",
        },
        {
          label: isEn ? "Budget overspend" : "Преразход по бюджети",
          value: `€${budgetOverspendPotential.toFixed(0)}`,
        },
        {
          label: isEn ? "Electricity records" : "Отчети за ток",
          value: `${electricityHistory.length}`,
        },
        {
          label: isEn ? "Active savings goals remaining" : "Остатък по активни цели",
          value: `€${totalGoalRemaining.toFixed(2)}`,
        },
      ],
      calculationSteps:
        savingsPotentialParts.length > 0
          ? savingsPotentialParts
          : [
              {
                label: isEn ? "No active optimization triggers" : "Няма активни сигнали за оптимизация",
                detail: isEn
                  ? "None of the spending concentration, overspend, tariff, or goal rules currently require extra monthly cuts."
                  : "Към момента няма превишени бюджети, свръхконцентрация на разходи или неоптимизирана тарифа.",
                delta: "€0",
                tone: "neutral",
              },
            ],
      interpretation:
        finalPotentialMonthlySavings > 0
          ? isEn
            ? `Based on your real transactions, budgets, electricity bills, and active goals, you can realistically free up ~€${finalPotentialMonthlySavings}/mo.`
            : `На база реалните ви разходи, бюджети, сметки за ток и активни цели можете реалистично да освободите ~€${finalPotentialMonthlySavings}/мес.`
          : isEn
          ? "Your tracked expenses, budgets, and tariff ratios currently look balanced with €0 estimated excess leakage."
          : "Отчетените разходи, бюджети и тарифи в момента са добре балансирани без изявени излишни течове (€0).",
      recommendations: [
        isEn
          ? "Adjusting category budgets, dining frequency, or shifting appliances to nighttime electricity updates this potential automatically."
          : "Всяка промяна в бюджетите, навиците за хранене навън, сметките за ток или спестовните цели преизчислява този потенциал автоматично.",
      ],
      targetActionTab: "budgets",
      targetActionLabel: isEn ? "Adjust Budgets" : "Настрой Бюджети",
    },
  };

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
      savingsRate: roundedSavingsRate,
      runwayMonths,
      monthlySavingsPotential: finalPotentialMonthlySavings,
    },
    totalExpensesAnalyzed: parseFloat(totalExpenses.toFixed(2)),
    totalIncomeAnalyzed: parseFloat(totalIncome.toFixed(2)),
    totalSavingsBalance: parseFloat(currentSavingsBalance.toFixed(2)),
    monthsAnalyzedCount: monthsCount,
    insights: sortedByPriority,
    topRecommendations,
    metricBreakdowns,
  };
}
