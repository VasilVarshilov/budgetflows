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
  const tr = <T,>(bgText: T, enText: T, esText: T): T =>
    lang === "bg" ? bgText : lang === "es" ? esText : enText;
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
      label: tr("Базова начална стойност", "Baseline score", "Puntuación base"),
      detail: tr(
        "Стандартна отправна точка преди корекциите",
        "Standard starting index before financial adjustments",
        "Índice de referencia estándar antes de ajustes financieros"
      ),
      delta: "50",
      tone: "neutral",
    },
  ];

  if (savingsRate >= 20) {
    healthScoreVal += 20;
    healthScoreFactors.push({
      label: tr("Норма на спестяване (≥ 20%)", "Savings rate (≥ 20%)", "Tasa de ahorro (≥ 20%)"),
      detail: tr(
        `Отлична норма на спестяване от ${savingsRate.toFixed(1)}% (праг ≥ 20%).`,
        `Strong savings rate of ${savingsRate.toFixed(1)}% meets the ≥ 20% benchmark.`,
        `Excelente tasa de ahorro del ${savingsRate.toFixed(1)}% (umbral ≥ 20%).`
      ),
      delta: "+20",
      tone: "positive",
    });
  } else if (savingsRate >= 10) {
    healthScoreVal += 10;
    healthScoreFactors.push({
      label: tr("Норма на спестяване (10% – 19.9%)", "Savings rate (10% – 19.9%)", "Tasa de ahorro (10% – 19.9%)"),
      detail: tr(
        `Умерена норма на спестяване от ${savingsRate.toFixed(1)}% (праг ≥ 10%).`,
        `Moderate savings rate of ${savingsRate.toFixed(1)}% gives a partial bonus.`,
        `Tasa de ahorro moderada del ${savingsRate.toFixed(1)}% (umbral ≥ 10%).`
      ),
      delta: "+10",
      tone: "positive",
    });
  } else if (avgMonthlyExpenses > avgMonthlyIncome && avgMonthlyExpenses > 0) {
    healthScoreVal -= 20;
    healthScoreFactors.push({
      label: tr(
        "Месечен дефицит (разходи > приходи)",
        "Monthly deficit (expenses > income)",
        "Déficit mensual (gastos > ingresos)"
      ),
      detail: tr(
        `Средните месечни разходи (€${avgMonthlyExpenses.toFixed(2)}) надвишават средния доход (€${avgMonthlyIncome.toFixed(2)}).`,
        `Avg monthly expenses (€${avgMonthlyExpenses.toFixed(2)}) exceed avg income (€${avgMonthlyIncome.toFixed(2)}).`,
        `Los gastos mensuales medios (€${avgMonthlyExpenses.toFixed(2)}) superan los ingresos medios (€${avgMonthlyIncome.toFixed(2)}).`
      ),
      delta: "-20",
      tone: "negative",
    });
  } else {
    healthScoreFactors.push({
      label: tr("Норма на спестяване (< 10%)", "Savings rate (< 10%)", "Tasa de ahorro (< 10%)"),
      detail: tr(
        `Текущата норма на спестяване е ${savingsRate.toFixed(1)}% (без бонус точки).`,
        `Current savings rate is ${savingsRate.toFixed(1)}% (no bonus applied).`,
        `La tasa de ahorro actual es del ${savingsRate.toFixed(1)}% (sin bonificación).`
      ),
      delta: "0",
      tone: "neutral",
    });
  }

  if (runwayMonths >= 6) {
    healthScoreVal += 20;
    healthScoreFactors.push({
      label: tr("Авариен фонд (≥ 6 месеца)", "Emergency buffer (≥ 6 months)", "Colchón de emergencia (≥ 6 meses)"),
      detail: tr(
        `Спестяванията покриват ${runwayMonths} месеца разходи (пълен буфер ≥ 6 мес.).`,
        `Savings cover ${runwayMonths} months of expenses (full 6+ month safety cushion).`,
        `Los ahorros cubren ${runwayMonths} meses de gastos (colchón completo ≥ 6 meses).`
      ),
      delta: "+20",
      tone: "positive",
    });
  } else if (runwayMonths >= 3) {
    healthScoreVal += 10;
    healthScoreFactors.push({
      label: tr("Авариен фонд (3 – 5.9 месеца)", "Emergency buffer (3 – 5.9 months)", "Colchón de emergencia (3 – 5.9 meses)"),
      detail: tr(
        `Спестяванията покриват ${runwayMonths} месеца разходи (стабилен буфер ≥ 3 мес.).`,
        `Savings cover ${runwayMonths} months of expenses (solid 3+ month cushion).`,
        `Los ahorros cubren ${runwayMonths} meses de gastos (colchón sólido ≥ 3 meses).`
      ),
      delta: "+10",
      tone: "positive",
    });
  } else if (runwayMonths < 1) {
    healthScoreVal -= 15;
    healthScoreFactors.push({
      label: tr("Нисък авариен фонд (< 1 месец)", "Low emergency buffer (< 1 month)", "Colchón de emergencia bajo (< 1 mes)"),
      detail: tr(
        `Текущият буфер покрива ${runwayMonths} месеца разходи (под минимума от 1 месец).`,
        `Current buffer covers ${runwayMonths} months of expenses (below 1 month minimum).`,
        `El colchón actual cubre ${runwayMonths} meses de gastos (por debajo del mínimo de 1 mes).`
      ),
      delta: "-15",
      tone: "negative",
    });
  } else {
    healthScoreFactors.push({
      label: tr("Авариен фонд (1 – 2.9 месеца)", "Emergency buffer (1 – 2.9 months)", "Colchón de emergencia (1 – 2.9 meses)"),
      detail: tr(
        `Буферът покрива ${runwayMonths} месеца (при ≥ 3 месеца носи +10 точки).`,
        `Buffer covers ${runwayMonths} months (aim for ≥ 3 months for +10 points).`,
        `El colchón cubre ${runwayMonths} meses (alcanzar ≥ 3 meses suma +10 puntos).`
      ),
      delta: "0",
      tone: "neutral",
    });
  }

  if (totalMonthlyBudget > 0 && avgMonthlyExpenses > 0) {
    if (avgMonthlyExpenses <= totalMonthlyBudget) {
      healthScoreVal += 10;
      healthScoreFactors.push({
        label: tr(
          "Спазване на общия месечен бюджет",
          "Overall budget compliance",
          "Cumplimiento del presupuesto general"
        ),
        detail: tr(
          `Средният разход (€${avgMonthlyExpenses.toFixed(2)}) е в рамките на лимита от €${totalMonthlyBudget.toFixed(2)}.`,
          `Avg spend (€${avgMonthlyExpenses.toFixed(2)}) stays within €${totalMonthlyBudget.toFixed(2)} limit.`,
          `El gasto medio (€${avgMonthlyExpenses.toFixed(2)}) se mantiene dentro del límite de €${totalMonthlyBudget.toFixed(2)}.`
        ),
        delta: "+10",
        tone: "positive",
      });
    } else {
      healthScoreVal -= 15;
      healthScoreFactors.push({
        label: tr(
          "Превишен общ месечен бюджет",
          "Overall budget exceeded",
          "Presupuesto mensual general excedido"
        ),
        detail: tr(
          `Средният разход (€${avgMonthlyExpenses.toFixed(2)}) надвишава лимита от €${totalMonthlyBudget.toFixed(2)}.`,
          `Avg spend (€${avgMonthlyExpenses.toFixed(2)}) exceeds €${totalMonthlyBudget.toFixed(2)} limit.`,
          `El gasto medio (€${avgMonthlyExpenses.toFixed(2)}) supera el límite de €${totalMonthlyBudget.toFixed(2)}.`
        ),
        delta: "-15",
        tone: "negative",
      });
    }
  } else {
    healthScoreFactors.push({
      label: tr("Общ месечен бюджет", "Overall monthly budget", "Presupuesto mensual general"),
      detail:
        totalMonthlyBudget <= 0
          ? tr(
              "Не е зададен общ месечен бюджет (при спазване носи +10 точки).",
              "No overall monthly budget configured yet (+10 when within limit).",
              "Aún no se ha definido un presupuesto mensual general (+10 si se cumple)."
            )
          : tr(
              "Все още няма отчетени разходи за сравнение с лимита.",
              "No expenses recorded yet to evaluate against the monthly limit.",
              "Aún no hay gastos registrados para comparar con el límite."
            ),
      delta: "0",
      tone: "neutral",
    });
  }

  if (exceededCategoryBudgets.length > 0) {
    const catPenalty = Math.min(10, exceededCategoryBudgets.length * 3);
    healthScoreVal -= catPenalty;
    healthScoreFactors.push({
      label: tr(
        "Превишени бюджети по категории",
        "Exceeded category budgets",
        "Presupuestos por categoría excedidos"
      ),
      detail: tr(
        `${exceededCategoryBudgets.length} надвишени категории (−3 т. на категория, макс. −10).`,
        `${exceededCategoryBudgets.length} category budget(s) exceeded (−3 pts each, capped at −10).`,
        `${exceededCategoryBudgets.length} presupuesto(s) de categoría excedido(s) (−3 pts cada uno, máx. −10).`
      ),
      delta: `-${catPenalty}`,
      tone: "negative",
    });
  }

  if (activeGoals.length > 0 && totalGoalTarget > 0 && (totalExpenses > 0 || totalIncome > 0 || currentSavingsBalance > 0)) {
    const goalProgressPct = (totalGoalAllocated / totalGoalTarget) * 100;
    if (goalProgressPct >= 80) {
      healthScoreVal += 5;
      healthScoreFactors.push({
        label: tr(
          "Напредък по спестовни цели (≥ 80%)",
          "Savings goals progress (≥ 80%)",
          "Progreso de metas de ahorro (≥ 80%)"
        ),
        detail: tr(
          `Постигнати ${goalProgressPct.toFixed(0)}% по ${activeGoals.length} активни цели.`,
          `${goalProgressPct.toFixed(0)}% funded across ${activeGoals.length} active goal(s).`,
          `${goalProgressPct.toFixed(0)}% completado en ${activeGoals.length} meta(s) activa(s).`
        ),
        delta: "+5",
        tone: "positive",
      });
    } else if (goalProgressPct >= 40) {
      healthScoreVal += 2;
      healthScoreFactors.push({
        label: tr(
          "Напредък по спестовни цели (40% – 79%)",
          "Savings goals progress (40% – 79%)",
          "Progreso de metas de ahorro (40% – 79%)"
        ),
        detail: tr(
          `Постигнати ${goalProgressPct.toFixed(0)}% по ${activeGoals.length} активни цели.`,
          `${goalProgressPct.toFixed(0)}% funded across ${activeGoals.length} active goal(s).`,
          `${goalProgressPct.toFixed(0)}% completado en ${activeGoals.length} meta(s) activa(s).`
        ),
        delta: "+2",
        tone: "positive",
      });
    } else if (goalProgressPct < 20) {
      healthScoreVal -= 3;
      healthScoreFactors.push({
        label: tr(
          "Напредък по спестовни цели (< 20%)",
          "Savings goals progress (< 20%)",
          "Progreso de metas de ahorro (< 20%)"
        ),
        detail: tr(
          `Заделени са ${goalProgressPct.toFixed(0)}% от целта €${totalGoalTarget.toFixed(0)}.`,
          `Only ${goalProgressPct.toFixed(0)}% funded toward €${totalGoalTarget.toFixed(0)} target.`,
          `Solo un ${goalProgressPct.toFixed(0)}% financiado del objetivo de €${totalGoalTarget.toFixed(0)}.`
        ),
        delta: "-3",
        tone: "negative",
      });
    }
  }

  const rawHealthScoreVal = healthScoreVal;
  healthScoreVal = Math.min(100, Math.max(10, healthScoreVal));
  if (rawHealthScoreVal !== healthScoreVal) {
    healthScoreFactors.push({
      label: tr("Ограничение на скалата (10 – 100)", "Scale bounds (10 – 100)", "Límites de escala (10 – 100)"),
      detail: tr(
        `Суровият резултат (${rawHealthScoreVal}) е ограничен в интервала [10, 100].`,
        `Raw sum (${rawHealthScoreVal}) clamped to [10, 100].`,
        `La suma bruta (${rawHealthScoreVal}) se ajusta al rango [10, 100].`
      ),
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
        label: tr(
          `15% оптимизация в „${topCatDisplay}“`,
          `15% optimization in “${topCatDisplay}”`,
          `15% de optimización en “${topCatDisplay}”`
        ),
        detail: tr(
          `Водещата категория заема ${topCatPct}% от разходите (€${monthlyTopSpend.toFixed(2)}/мес × 15%).`,
          `Top category accounts for ${topCatPct}% of expenses (€${monthlyTopSpend.toFixed(2)}/mo × 15%).`,
          `La categoría principal representa el ${topCatPct}% de los gastos (€${monthlyTopSpend.toFixed(2)}/mes × 15%).`
        ),
        delta: `+€${suggestReduction}`,
        tone: "positive",
      });

      insights.push({
        id: "spending_top_heavy",
        type: "spending",
        category: "spending",
        priority: "high",
        title: tr(
          `Висока концентрация на разходи в „${topCatDisplay}“ (${topCatPct}%)`,
          `High spending concentration in “${topCatDisplay}” (${topCatPct}%)`,
          `Alta concentración de gastos en “${topCatDisplay}” (${topCatPct}%)`
        ),
        description: tr(
          `Категорията „${topCatDisplay}“ заема почти ${topCatPct}% от всичките ви разходи (€${monthlyTopSpend.toFixed(2)}/мес). Това е ключова област за бърза оптимизация.`,
          `Category “${topCatDisplay}” accounts for ${topCatPct}% of all your expenses (€${monthlyTopSpend.toFixed(2)}/mo). This is a key area for quick optimization.`,
          `La categoría “${topCatDisplay}” supone el ${topCatPct}% de todos tus gastos (€${monthlyTopSpend.toFixed(2)}/mes). Es un área clave para optimizar rápidamente.`
        ),
        impact: tr(
          `Спестяване: ~€${suggestReduction}/мес`,
          `Savings: ~€${suggestReduction}/mo`,
          `Ahorro: ~€${suggestReduction}/mes`
        ),
        actionableTip: tr(
          `Намаляването на харчовете за ${topCatDisplay} с едва 15% ще освободи около €${suggestReduction} допълнителни свободни парични средства всеки месец.`,
          `Reducing spending on ${topCatDisplay} by just 15% will free up around €${suggestReduction} in extra cash every month.`,
          `Reducir el gasto en ${topCatDisplay} solo un 15% liberará unos €${suggestReduction} extra cada mes.`
        ),
        metricLabel: tr("Дял от общите разходи", "Share of total expenses", "Cuota del gasto total"),
        metricValue: `${topCatPct}%`,
        isTopRecommendation: true,
      });
    } else {
      insights.push({
        id: "spending_healthy_distribution",
        type: "spending",
        category: "spending",
        priority: "low",
        title: tr(
          "Балансирано разпределение на разходите",
          "Balanced expense distribution",
          "Distribución equilibrada de gastos"
        ),
        description: tr(
          `Най-голямото перо е „${topCatDisplay}“ с ${topCatPct}%, което показва стабилна диверсификация без прекомерна зависимост от единична категория.`,
          `Your largest category is “${topCatDisplay}” at ${topCatPct}%, showing healthy diversification without over-reliance on a single category.`,
          `Tu categoría principal es “${topCatDisplay}” con un ${topCatPct}%, mostrando una diversificación saludable sin depender de una sola categoría.`
        ),
        actionableTip: tr(
          "Продължавайте да следите разходите по категории, за да задържите този баланс.",
          "Continue tracking expenses by category to preserve this healthy balance.",
          "Sigue controlando los gastos por categoría para mantener este equilibrio."
        ),
        metricLabel: tr("Водеща категория", "Top category", "Categoría principal"),
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
        label: tr(
          "25% оптимизация на заведения и развлечения",
          "25% trim on dining & entertainment",
          "25% de ajuste en restaurantes y ocio"
        ),
        detail: tr(
          `Средно за заведения/забавления: €${diningMonthly.toFixed(2)}/мес (${diningPct.toFixed(1)}% от разходите × 25%).`,
          `Avg dining/leisure spend is €${diningMonthly.toFixed(2)}/mo (${diningPct.toFixed(1)}% of expenses × 25%).`,
          `Gasto medio en ocio y restaurantes: €${diningMonthly.toFixed(2)}/mes (${diningPct.toFixed(1)}% de gastos × 25%).`
        ),
        delta: `+€${diningSavings}`,
        tone: "positive",
      });

      insights.push({
        id: "spending_dining_out",
        type: "spending",
        category: "spending",
        priority: "medium",
        title: tr(
          "Възможност за намаляване на разходите за хранене навън и заведения",
          "Opportunity to reduce dining out and entertainment costs",
          "Oportunidad para reducir gastos en restaurantes y ocio"
        ),
        description: tr(
          `За ресторанти, кафе и забавления харчите средно €${diningMonthly.toFixed(2)} на месец (${diningPct.toFixed(1)}% от бюджета).`,
          `You spend an average of €${diningMonthly.toFixed(2)} per month on restaurants, cafes, and entertainment (${diningPct.toFixed(1)}% of expenses).`,
          `Gastas una media de €${diningMonthly.toFixed(2)} al mes en restaurantes, cafés y ocio (${diningPct.toFixed(1)}% de tus gastos).`
        ),
        impact: tr(
          `Спестяване: ~€${diningSavings}/мес`,
          `Savings: ~€${diningSavings}/mo`,
          `Ahorro: ~€${diningSavings}/mes`
        ),
        actionableTip: tr(
          `Приготвянето на храна у дома само 2-3 пъти повече в месеца може да спести приблизително €${diningSavings} на месец, без да ограничава социалния ви живот.`,
          `Cooking at home just 2–3 extra times per month can save roughly €${diningSavings}/mo without limiting your social life.`,
          `Cocinar en casa solo 2 o 3 veces más al mes puede ahorrarte unos €${diningSavings}/mes sin limitar tu vida social.`
        ),
        metricLabel: tr("Месечно за заведения", "Monthly dining & leisure", "Ocio y restaurantes/mes"),
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
        title: tr(
          `Бюджетен съвет: Високи повтарящи се ангажименти (${fixedRatio}%)`,
          `Budget tip: High recurring commitments (${fixedRatio}%)`,
          `Consejo: Compromisos recurrentes altos (${fixedRatio}%)`
        ),
        description: tr(
          `Повтарящите ви се разходи (кредити, сметки, абонаменти) заемат ${fixedRatio}% от всички разходи. Препоръчителният праг по правилото 50/30/20 е до 50%.`,
          `Your recurring expenses (loans, bills, subscriptions) take up ${fixedRatio}% of all expenses. The recommended 50/30/20 threshold is up to 50%.`,
          `Tus gastos recurrentes (préstamos, facturas, suscripciones) suponen el ${fixedRatio}% del total. El umbral recomendado por la regla 50/30/20 es hasta el 50%.`
        ),
        impact: tr(
          "Оптимизация на дълг и договори",
          "Debt & contract optimization",
          "Optimización de deuda y contratos"
        ),
        actionableTip: tr(
          "Прегледайте абонаментите за мобилни оператори, телевизия и застраховки или помислете за предоговаряне на банкови лихви и обединяване на кредити.",
          "Review mobile, TV, and insurance subscriptions or consider refinancing high-interest loans.",
          "Revisa suscripciones de telefonía, TV y seguros o valora refinanciar préstamos con intereses altos."
        ),
        metricLabel: tr("Повтарящи се разходи", "Recurring expenses", "Gastos recurrentes"),
        metricValue: `${fixedRatio}%`,
        isTopRecommendation: true,
      });
    } else {
      insights.push({
        id: "spending_fixed_good",
        type: "spending",
        category: "spending",
        priority: "low",
        title: tr(
          "Добра структура между повтарящи се и допълнителни разходи",
          "Healthy split between recurring and variable expenses",
          "Buena proporción entre gastos recurrentes y variables"
        ),
        description: tr(
          `Повтарящите ви се разходи са ${fixedRatio}%, а текущите допълнителни са ${variableRatio}%, което оставя достатъчна гъвкавост за реакция при непредвидени обстоятелства.`,
          `Recurring expenses are ${fixedRatio}% and variable expenses are ${variableRatio}%, leaving solid flexibility for unexpected needs.`,
          `Los gastos recurrentes son el ${fixedRatio}% y los variables el ${variableRatio}%, dejando margen flexible para imprevistos.`
        ),
        actionableTip: tr(
          "Запазете контрола върху гъвкавите разходи чрез редовно следене на седмичните лимити.",
          "Keep control over variable spending by tracking weekly category limits.",
          "Mantén el control sobre los gastos variables revisando los límites semanales por categoría."
        ),
        metricLabel: tr(
          "Повтарящи се / Допълнителни",
          "Recurring / Additional",
          "Recurrentes / Adicionales"
        ),
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
        title: tr(
          `Открит необичайно висок единичен разход: €${topOutlier.amount.toFixed(2)}`,
          `Unusually large single expense detected: €${topOutlier.amount.toFixed(2)}`,
          `Gasto puntual inusualmente alto detectado: €${topOutlier.amount.toFixed(2)}`
        ),
        description: tr(
          `Плащането в категория „${outlierCat}“ (${topOutlier.note || "без бележка"}) надвишава обичайния размер на трансакциите повече от 2.5 пъти.`,
          `The payment in “${outlierCat}” (${topOutlier.note || "no note"}) exceeds your typical transaction size by more than 2.5x.`,
          `El pago en “${outlierCat}” (${topOutlier.note || "sin nota"}) supera en más de 2.5x el importe habitual de tus transacciones.`
        ),
        impact: tr(
          "Внимание: Еднократно натоварване",
          "Notice: One-time spike",
          "Aviso: Pico puntual"
        ),
        actionableTip: tr(
          "Ако това е редовно повтарящ се годишен или сезонен разход, създайте отделен целеви подфонд, за да не натоварва бюджета в рамките на един-единствен месец.",
          "If this is an annual or seasonal expense, consider creating a dedicated savings goal so it does not strain a single month's budget.",
          "Si es un gasto anual o estacional, crea una meta de ahorro específica para no sobrecargar el presupuesto de un solo mes."
        ),
        metricLabel: tr("Сума на записа", "Expense amount", "Importe del gasto"),
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
      title: tr(
        "Спешна възможност: Изграждане на 3-месечен авариен фонд",
        "Priority: Build a 3-month Emergency Fund",
        "Prioridad: Construir un Fondo de emergencia de 3 meses"
      ),
      description: tr(
        `Текущите ви спестявания покриват ${runwayMonths} месеца от месечните ви разходи. Финансовите експерти препоръчват минимум 3 до 6 месеца буфер за сигурност.`,
        `Your current savings cover ${runwayMonths} months of expenses. Financial guidelines recommend at least 3 to 6 months as a safety buffer.`,
        `Tus ahorros actuales cubren ${runwayMonths} meses de gastos. Se recomienda un colchón de seguridad de al menos 3 a 6 meses.`
      ),
      impact: tr(
        `Цел: €${targetFund.toFixed(0)} фонд`,
        `Target: €${targetFund.toFixed(0)} fund`,
        `Objetivo: fondo de €${targetFund.toFixed(0)}`
      ),
      actionableTip: tr(
        `Заделянето на допълнителни €${monthlyNeeded}/мес ще ви осигури пълен 3-месечен фонд за сигурност само за следващите половин година.`,
        `Setting aside an extra €${monthlyNeeded}/mo will build a full 3-month safety reserve within the next six months.`,
        `Apartar €${monthlyNeeded}/mes adicionales completará un fondo de seguridad de 3 meses en los próximos seis meses.`
      ),
      metricLabel: tr("Наличен буфер", "Current buffer", "Colchón actual"),
      metricValue: tr(`${runwayMonths} мес.`, `${runwayMonths} mo.`, `${runwayMonths} mes.`),
      isTopRecommendation: true,
    });
  } else if (runwayMonths >= 6) {
    insights.push({
      id: "savings_runway_strong",
      type: "savings",
      category: "savings",
      priority: "opportunity",
      title: tr(
        `Отличен авариен буфер (${runwayMonths} месеца издръжка)`,
        `Strong emergency buffer (${runwayMonths} months covered)`,
        `Sólido colchón de emergencia (${runwayMonths} meses cubiertos)`
      ),
      description: tr(
        `Имате натрупани €${currentSavingsBalance.toFixed(2)}, които гарантират спокойствие за повече от половин година при евентуална загуба на доходи.`,
        `You have €${currentSavingsBalance.toFixed(2)} saved, providing peace of mind for over half a year in case of income disruption.`,
        `Tienes €${currentSavingsBalance.toFixed(2)} ahorrados, lo que garantiza tranquilidad durante más de medio año ante imprevistos.`
      ),
      impact: tr("Възможност за инвестиции", "Investment opportunity", "Oportunidad de inversión"),
      actionableTip: tr(
        "Тъй като аварийният ви фонд е напълно обезпечен, можете да помислите за доходно насочване на новите спестявания към дългосрочни инструменти.",
        "With your emergency fund fully covered, consider allocating new savings toward long-term yielding instruments.",
        "Con tu fondo de emergencia cubierto, considera destinar nuevos ahorros a instrumentos de rendimiento a largo plazo."
      ),
      metricLabel: tr("Покритие на разходи", "Expense coverage", "Cobertura de gastos"),
      metricValue: tr(`${runwayMonths} месеца`, `${runwayMonths} months`, `${runwayMonths} meses`),
      isTopRecommendation: false,
    });
  } else {
    insights.push({
      id: "savings_runway_moderate",
      type: "savings",
      category: "savings",
      priority: "medium",
      title: tr(
        `Стабилен спестовен фонд (${runwayMonths} месеца)`,
        `Solid savings buffer (${runwayMonths} months)`,
        `Fondo de ahorro sólido (${runwayMonths} meses)`
      ),
      description: tr(
        `Спестовният ви фонд покрива разходите за ${runwayMonths} месеца. Придвижването към 6 месеца ще ви осигури максимална сигурност.`,
        `Your savings cover ${runwayMonths} months of expenses. Growing this toward 6 months will maximize financial security.`,
        `Tus ahorros cubren ${runwayMonths} meses de gastos. Ampliarlo hasta 6 meses maximizará tu seguridad financiera.`
      ),
      actionableTip: tr(
        "Автоматизирайте спестяването още в деня на получаване на заплата (принципът „Плати първо на себе си“).",
        "Automate saving on payday using the “Pay yourself first” principle.",
        "Automatiza el ahorro el día de cobro aplicando el principio de “Págate a ti primero”."
      ),
      metricLabel: tr("Наличност", "Available balance", "Saldo disponible"),
      metricValue: `€${currentSavingsBalance.toFixed(2)}`,
    });
  }

  // Savings rate recommendations
  if (savingsRate < 10 && avgMonthlyIncome > 0) {
    const boostSavings = Math.round(avgMonthlyIncome * 0.1);
    potentialMonthlySavings += boostSavings;
    savingsPotentialParts.push({
      label: tr(
        "10% целево пренасочване от дохода",
        "10% monthly income savings shift",
        "10% de reasignación mensual al ahorro"
      ),
      detail: tr(
        `Нормата на спестяване (${savingsRate.toFixed(1)}%) е под 10% (10% от €${avgMonthlyIncome.toFixed(2)}/мес доход).`,
        `Savings rate (${savingsRate.toFixed(1)}%) is below 10% (10% of €${avgMonthlyIncome.toFixed(2)}/mo income).`,
        `La tasa de ahorro (${savingsRate.toFixed(1)}%) está por debajo del 10% (10% de €${avgMonthlyIncome.toFixed(2)}/mes).`
      ),
      delta: `+€${boostSavings}`,
      tone: "positive",
    });

    insights.push({
      id: "savings_rate_low",
      type: "recommendation",
      category: "savings",
      priority: "high",
      title: tr(
        "Увеличете нормата на спестяване до поне 15%",
        "Aim to raise your savings rate to at least 15%",
        "Intenta elevar tu tasa de ahorro al menos al 15%"
      ),
      description: tr(
        `В момента спестявате средно ${savingsRate.toFixed(1)}% от доходите си. Златният стандарт за финансова независимост е минимум 15-20%.`,
        `You are currently saving an average of ${savingsRate.toFixed(1)}% of income. A healthy long-term target is 15–20%.`,
        `Actualmente ahorras una media del ${savingsRate.toFixed(1)}% de tus ingresos. Un objetivo saludable a largo plazo es del 15–20%.`
      ),
      impact: tr(
        `Потенциал: +€${boostSavings}/мес`,
        `Potential: +€${boostSavings}/mo`,
        `Potencial: +€${boostSavings}/mes`
      ),
      actionableTip: tr(
        "Пренасочете спестените пари от оптимизиране на абонаменти и ресторанти директно към спестовната сметка преди началото на месеца.",
        "Redirect money saved from trimming subscriptions and dining out straight into savings at the start of the month.",
        "Transfiere el dinero ahorrado al recortar suscripciones y comidas fuera directamente a ahorros al inicio de cada mes."
      ),
      metricLabel: tr("Текуща норма", "Current rate", "Tasa actual"),
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
        label: tr(
          "12% икономия от нощна тарифа за ток",
          "12% electricity night-tariff shift",
          "12% de ahorro cambiando a tarifa nocturna"
        ),
        detail: tr(
          `Нощната консумация е ${nightRatio}% (< 30%) при средна сметка €${avgElecCost.toFixed(2)} (× 12%).`,
          `Night usage is ${nightRatio}% (< 30%) on an avg €${avgElecCost.toFixed(2)} electricity bill (× 12%).`,
          `El consumo nocturno es del ${nightRatio}% (< 30%) con una factura media de €${avgElecCost.toFixed(2)} (× 12%).`
        ),
        delta: `+€${elecSavings}`,
        tone: "positive",
      });

      insights.push({
        id: "elec_night_tariff_opportunity",
        type: "electricity",
        category: "electricity",
        priority: "medium",
        title: tr(
          `Електроенергия: Ниско използване на нощната тарифа (${nightRatio}%)`,
          `Electricity: Low night-tariff usage (${nightRatio}%)`,
          `Electricidad: Bajo uso de tarifa nocturna (${nightRatio}%)`
        ),
        description: tr(
          `Само ${nightRatio}% от електроенергията ви се потребява на евтината нощна тарифа. Нощната тарифа е почти 40% по-изгодна от дневната.`,
          `Only ${nightRatio}% of your electricity is consumed on the cheaper night tariff. Night rates are nearly 40% lower than daytime rates.`,
          `Solo el ${nightRatio}% de tu electricidad se consume en la tarifa nocturna económica, que es casi un 40% más barata que la diurna.`
        ),
        impact: tr(
          `Спестяване: ~€${elecSavings}/мес`,
          `Savings: ~€${elecSavings}/mo`,
          `Ahorro: ~€${elecSavings}/mes`
        ),
        actionableTip: tr(
          "Настройвайте бойлера, пералнята и съдомиялната машина с таймер за работа в нощните часове (22:00 - 06:00 ч.), за да намалите сметката с до 15%.",
          "Schedule water heaters, washing machines, and dishwashers via timer during night hours (22:00 – 06:00) to cut bills by up to 15%.",
          "Programa termos, lavadoras y lavavajillas con temporizador en horario nocturno (22:00 – 06:00) para reducir la factura hasta un 15%."
        ),
        metricLabel: tr("Нощна тарифа", "Night tariff share", "Tarifa nocturna"),
        metricValue: `${nightRatio}%`,
        isTopRecommendation: true,
      });
    } else {
      insights.push({
        id: "elec_tariff_efficient",
        type: "electricity",
        category: "electricity",
        priority: "low",
        title: tr(
          `Отлична оптимизация на нощната тарифа за ток (${nightRatio}%)`,
          `Great night-tariff electricity optimization (${nightRatio}%)`,
          `Excelente optimización de la tarifa nocturna (${nightRatio}%)`
        ),
        description: tr(
          `Потребявате ${nightRatio}% от енергията на по-ниската цена, което ви осигурява реални спестявания всеки месец.`,
          `You consume ${nightRatio}% of energy at the lower night rate, creating consistent monthly savings.`,
          `Consumes el ${nightRatio}% de la energía en la tarifa nocturna económica, generando ahorros constantes cada mes.`
        ),
        actionableTip: tr(
          "Продължавайте да планирате енергоемките уреди през часовете с намалена цена на киловатчас.",
          "Continue running high-draw appliances during off-peak night hours.",
          "Sigue programando los electrodomésticos de alto consumo en las horas valle nocturnas."
        ),
        metricLabel: tr("Дял нощна консумация", "Night usage share", "Cuota nocturna"),
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
          title: tr(
            `Ръст в сметката за ток: +${pctChange.toFixed(0)}% (€${latest.totalCost.toFixed(2)})`,
            `Electricity bill spike: +${pctChange.toFixed(0)}% (€${latest.totalCost.toFixed(2)})`,
            `Subida en la factura de luz: +${pctChange.toFixed(0)}% (€${latest.totalCost.toFixed(2)})`
          ),
          description: tr(
            `Последната ви сметка е с €${costChange.toFixed(2)} по-висока спрямо предходния отчен период (${prevPeriodDisplay}).`,
            `Your latest bill is €${costChange.toFixed(2)} higher than the previous period (${prevPeriodDisplay}).`,
            `Tu última factura es €${costChange.toFixed(2)} mayor que la del período anterior (${prevPeriodDisplay}).`
          ),
          impact: tr(
            `Консумация: +${(latest.consumption - previous.consumption).toFixed(0)} kWh`,
            `Usage: +${(latest.consumption - previous.consumption).toFixed(0)} kWh`,
            `Consumo: +${(latest.consumption - previous.consumption).toFixed(0)} kWh`
          ),
          actionableTip: tr(
            "Проверете за увеличена работа на отоплителни или климатични уреди, или уплътнения на прозорци и врати.",
            "Check for increased heating/AC runtime or window and door insulation.",
            "Revisa un mayor uso de calefacción/aire acondicionado o el aislamiento de ventanas y puertas."
          ),
          metricLabel: tr("Промяна спрямо минал месец", "Change vs prior month", "Cambio vs mes anterior"),
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
        title: tr(
          `Превишаване на месечния бюджет с €${overspent}`,
          `Monthly budget exceeded by €${overspent}`,
          `Presupuesto mensual excedido en €${overspent}`
        ),
        description: tr(
          `Средният ви месечен разход (€${avgMonthlyExpenses.toFixed(2)}) надвишава определения лимит от €${totalMonthlyBudget.toFixed(2)} с ${budgetPct - 100}%.`,
          `Your average monthly spend (€${avgMonthlyExpenses.toFixed(2)}) exceeds the €${totalMonthlyBudget.toFixed(2)} limit by ${budgetPct - 100}%.`,
          `Tu gasto mensual medio (€${avgMonthlyExpenses.toFixed(2)}) supera el límite de €${totalMonthlyBudget.toFixed(2)} en un ${budgetPct - 100}%.`
        ),
        impact: tr(
          `Преразход: €${overspent}/мес`,
          `Overspent: €${overspent}/mo`,
          `Exceso: €${overspent}/mes`
        ),
        actionableTip: tr(
          "Прегледайте индивидуалните лимити по категории в секция „Бюджет“ или коригирайте месечния лимит според реалните ви нужди.",
          "Review individual category limits in the Budgets tab or adjust the monthly limit to match your actual needs.",
          "Revisa los límites por categoría en la pestaña Presupuestos o ajusta el límite mensual a tus necesidades reales."
        ),
        metricLabel: tr("Усвояване на лимита", "Limit utilization", "Uso del límite"),
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
        title: tr(
          `Бюджетът се спазва стриктно (€${surplus} буфер)`,
          `Budget stays on track (€${surplus} cushion)`,
          `El presupuesto se cumple (€${surplus} de margen)`
        ),
        description: tr(
          `Харчите средно ${budgetPct}% от зададения месечен лимит (€${totalMonthlyBudget.toFixed(2)}), запазвайки положителен свободен остатък.`,
          `You spend on average ${budgetPct}% of your monthly limit (€${totalMonthlyBudget.toFixed(2)}), keeping a positive margin.`,
          `Gastas una media del ${budgetPct}% de tu límite mensual (€${totalMonthlyBudget.toFixed(2)}), manteniendo un margen positivo.`
        ),
        actionableTip: tr(
          `Прехвърляйте спестения буфер от €${surplus} автоматично към спестовния фонд в края на всеки месец.`,
          `Transfer the remaining €${surplus} cushion directly to your savings fund at the end of each month.`,
          `Transfiere el margen restante de €${surplus} directamente a tu fondo de ahorros al final de cada mes.`
        ),
        metricLabel: tr("Свободен марж", "Available margin", "Margen disponible"),
        metricValue: tr(`€${surplus}/мес`, `€${surplus}/mo`, `€${surplus}/mes`),
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
      title: tr(
        `Надвишен бюджет по категория: ${topBudgetLabel} (+€${topExceeded.overspentAmount.toFixed(0)})`,
        `Category budget exceeded: ${topBudgetLabel} (+€${topExceeded.overspentAmount.toFixed(0)})`,
        `Presupuesto de categoría excedido: ${topBudgetLabel} (+€${topExceeded.overspentAmount.toFixed(0)})`
      ),
      description: tr(
        `${exceededCategoryBudgets.length} бюджетни категории надвишават лимита си с общо €${categoryOverspendTotal.toFixed(2)}.`,
        `${exceededCategoryBudgets.length} category budget(s) exceeded their limit by a combined €${categoryOverspendTotal.toFixed(2)}.`,
        `${exceededCategoryBudgets.length} presupuesto(s) de categoría superaron su límite por un total de €${categoryOverspendTotal.toFixed(2)}.`
      ),
      impact: tr(
        `Ограничаване на преразхода: ~€${roundedCatOverspend}/мес`,
        `Cut overspend: ~€${roundedCatOverspend}/mo`,
        `Recortar exceso: ~€${roundedCatOverspend}/mes`
      ),
      actionableTip: tr(
        `Намалете разходите в „${topBudgetLabel}“ или преразпределете лимитите в секция „Бюджети“.`,
        `Trim spending in “${topBudgetLabel}” or rebalance category limits in the Budgets tab.`,
        `Reduce el gasto en “${topBudgetLabel}” o reajusta los límites de categoría en la pestaña Presupuestos.`
      ),
      metricLabel: tr("Превишени категории", "Exceeded categories", "Categorías excedidas"),
      metricValue: `${exceededCategoryBudgets.length}`,
      isTopRecommendation: true,
    });
  }

  potentialMonthlySavings += budgetOverspendPotential;
  if (budgetOverspendPotential > 0) {
    savingsPotentialParts.push({
      label: tr(
        "Премахване на преразхода по бюджети",
        "Eliminating monthly/category budget overspend",
        "Eliminar el exceso en presupuestos"
      ),
      detail: tr(
        "Връщане на текущите разходи в рамките на зададените месечни и категорийни лимити.",
        "Bringing actual spending back within your configured monthly/category limits.",
        "Devolver el gasto real dentro de los límites mensuales y por categoría configurados."
      ),
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
      title:
        totalGoalRemaining > 0
          ? tr(
              `Цели за спестяване на ${progressPct}% (остават €${totalGoalRemaining.toFixed(0)})`,
              `Savings goals at ${progressPct}% (€${totalGoalRemaining.toFixed(0)} remaining)`,
              `Metas de ahorro al ${progressPct}% (faltan €${totalGoalRemaining.toFixed(0)})`
            )
          : tr(
              "Всички активни спестовни цели са достигнати",
              "All active savings goals fully funded",
              "Todas las metas activas de ahorro completadas"
            ),
      description: tr(
        `Заделени са €${totalGoalAllocated.toFixed(2)} от общо €${totalGoalTarget.toFixed(2)} по ${activeGoals.length} активни цели.`,
        `Allocated €${totalGoalAllocated.toFixed(2)} toward €${totalGoalTarget.toFixed(2)} across ${activeGoals.length} active goal(s).`,
        `Asignados €${totalGoalAllocated.toFixed(2)} de €${totalGoalTarget.toFixed(2)} en ${activeGoals.length} meta(s) activa(s).`
      ),
      impact:
        totalGoalRemaining > 0
          ? tr(
              `Нужен темп: ~€${suggestedMonthlyGoal}/мес`,
              `Goal pace: ~€${suggestedMonthlyGoal}/mo`,
              `Ritmo necesario: ~€${suggestedMonthlyGoal}/mes`
            )
          : undefined,
      actionableTip:
        totalGoalRemaining > 0
          ? tr(
              `Отделянето на ~€${suggestedMonthlyGoal}/мес ще покрие остатъка по целите ви в рамките на 6 месеца.`,
              `Allocating ~€${suggestedMonthlyGoal}/mo keeps you on track to complete your active goals in 6 months.`,
              `Apartar ~€${suggestedMonthlyGoal}/mes te permitirá completar tus metas activas en 6 meses.`
            )
          : tr(
              "Отлична дисциплина — добавете нова цел или насочете свободния ресурс към инвестиции.",
              "Great discipline — consider adding a new goal or investing surplus funds.",
              "Excelente disciplina — considera añadir una nueva meta o invertir los excedentes."
            ),
      metricLabel: tr("Покритие на цели", "Goals funded", "Metas financiadas"),
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
      title: isUp
        ? tr(
            `Приходите са нараснали с ${momComparison.income.formattedPercentage} спрямо миналия месец`,
            `Income increased by ${momComparison.income.formattedPercentage} vs last month`,
            `Los ingresos aumentaron un ${momComparison.income.formattedPercentage} frente al mes pasado`
          )
        : tr(
            `Понижение на приходите с ${momComparison.income.formattedPercentage} спрямо миналия месец`,
            `Income decreased by ${momComparison.income.formattedPercentage} vs last month`,
            `Los ingresos bajaron un ${momComparison.income.formattedPercentage} frente al mes pasado`
          ),
      description: tr(
        `За ${currLabel} са отчетени €${momComparison.income.currentValue.toFixed(2)} приход спрямо €${momComparison.income.previousValue.toFixed(2)} за ${prevLabel}.`,
        `For ${currLabel}, recorded income was €${momComparison.income.currentValue.toFixed(2)} compared to €${momComparison.income.previousValue.toFixed(2)} in ${prevLabel}.`,
        `En ${currLabel} se registraron €${momComparison.income.currentValue.toFixed(2)} de ingresos frente a €${momComparison.income.previousValue.toFixed(2)} en ${prevLabel}.`
      ),
      impact: isUp
        ? tr(
            `+€${momComparison.income.difference.toFixed(2)} повече ресурс`,
            `+€${momComparison.income.difference.toFixed(2)} extra funds`,
            `+€${momComparison.income.difference.toFixed(2)} de margen extra`
          )
        : tr(
            `-€${Math.abs(momComparison.income.difference).toFixed(2)} по-нисък приход`,
            `-€${Math.abs(momComparison.income.difference).toFixed(2)} lower income`,
            `-€${Math.abs(momComparison.income.difference).toFixed(2)} menos de ingresos`
          ),
      actionableTip: isUp
        ? tr(
            "Използвайте допълнителния приход за ускоряване на спестовната цел или погасяване на повтарящи се задължения.",
            "Use the extra income to accelerate a savings goal or pay down recurring obligations.",
            "Usa el ingreso extra para acelerar una meta de ahorro o reducir obligaciones recurrentes."
          )
        : tr(
            "При по-нисък месечен приход прегледайте променливите разходи, за да запазите положителния нетен баланс.",
            "With lower monthly income, review discretionary spending to keep net balance positive.",
            "Con menores ingresos mensuales, revisa los gastos variables para mantener un saldo neto positivo."
          ),
      metricLabel: tr("Промяна (MoM)", "Change (MoM)", "Variación (MoM)"),
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
      title: tr(
        `Основен източник на доход: „${topIncomeDisplay}“ (${sharePct}%)`,
        `Primary income source: “${topIncomeDisplay}” (${sharePct}%)`,
        `Fuente principal de ingresos: “${topIncomeDisplay}” (${sharePct}%)`
      ),
      description: tr(
        `Категория „${topIncomeDisplay}“ генерира €${topIncomeCat[1].toFixed(2)} или ${sharePct}% от общите анализирани приходи.`,
        `Category “${topIncomeDisplay}” generated €${topIncomeCat[1].toFixed(2)}, representing ${sharePct}% of analyzed income.`,
        `La categoría “${topIncomeDisplay}” generó €${topIncomeCat[1].toFixed(2)}, el ${sharePct}% de los ingresos analizados.`
      ),
      actionableTip:
        sortedIncomeCats.length > 1
          ? tr(
              `Имате ${sortedIncomeCats.length} активни източника на приход — поддържането на допълнителни канали повишава финансовата устойчивост.`,
              `You have ${sortedIncomeCats.length} active income streams — maintaining diverse sources strengthens financial resilience.`,
              `Tienes ${sortedIncomeCats.length} fuentes activas de ingresos — mantener fuentes diversas refuerza tu estabilidad financiera.`
            )
          : tr(
              "Добавянето на вторичен източник на доход (фрийланс, дивидент или наем) намалява риска при промяна в основната заплата.",
              "Adding a secondary income stream (freelance, dividends, or rent) reduces risk if primary salary changes.",
              "Añadir una fuente secundaria de ingresos (freelance, dividendos o alquiler) reduce el riesgo si varía el salario principal."
            ),
      metricLabel: tr("Дял от приходите", "Share of income", "Cuota de ingresos"),
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
      title: meetsTarget
        ? tr(
            `Постигате целевото спестяване от ${savingsTargetPercent}%`,
            `Meeting your ${savingsTargetPercent}% savings target`,
            `Cumpliendo tu objetivo de ahorro del ${savingsTargetPercent}%`
          )
        : tr(
            `Препоръка за спестяване: €${targetSaveAmount.toFixed(0)}/мес (${savingsTargetPercent}%)`,
            `Savings tip: €${targetSaveAmount.toFixed(0)}/mo (${savingsTargetPercent}%)`,
            `Consejo de ahorro: €${targetSaveAmount.toFixed(0)}/mes (${savingsTargetPercent}%)`
          ),
      description: tr(
        `При среден месечен доход €${avgMonthlyIncome.toFixed(2)} зададената цел от ${savingsTargetPercent}% изисква заделяне на €${targetSaveAmount.toFixed(2)} на месец (текущ нетен остатък: €${actualSavedAvg.toFixed(2)}).`,
        `With an average monthly income of €${avgMonthlyIncome.toFixed(2)}, your ${savingsTargetPercent}% target requires €${targetSaveAmount.toFixed(2)}/mo (current net surplus: €${actualSavedAvg.toFixed(2)}).`,
        `Con un ingreso mensual medio de €${avgMonthlyIncome.toFixed(2)}, tu objetivo del ${savingsTargetPercent}% requiere €${targetSaveAmount.toFixed(2)}/mes (superávit neto actual: €${actualSavedAvg.toFixed(2)}).`
      ),
      impact: tr(
        `Цел: €${targetSaveAmount.toFixed(2)}/мес`,
        `Target: €${targetSaveAmount.toFixed(2)}/mo`,
        `Meta: €${targetSaveAmount.toFixed(2)}/mes`
      ),
      actionableTip: meetsTarget
        ? tr(
            "Запазете текущата дисциплина или увеличете процента на спестяване на таблото за по-бързо натрупване.",
            "Maintain this discipline or raise your savings percentage on the dashboard to build wealth faster.",
            "Mantén esta disciplina o sube tu porcentaje de ahorro en el panel para acumular más rápido."
          )
        : tr(
            `Заделете €${targetSaveAmount.toFixed(2)} веднага при постъпване на дохода и планирайте месечните разходи с останалите €${(avgMonthlyIncome - targetSaveAmount).toFixed(2)}.`,
            `Set aside €${targetSaveAmount.toFixed(2)} immediately upon receiving income and budget the remaining €${(avgMonthlyIncome - targetSaveAmount).toFixed(2)}.`,
            `Aparta €${targetSaveAmount.toFixed(2)} en cuanto recibas el ingreso y presupuesta los gastos con los €${(avgMonthlyIncome - targetSaveAmount).toFixed(2)} restantes.`
          ),
      metricLabel: tr(`Цел ${savingsTargetPercent}%`, `Target ${savingsTargetPercent}%`, `Meta ${savingsTargetPercent}%`),
      metricValue: tr(
        `€${targetSaveAmount.toFixed(0)}/мес`,
        `€${targetSaveAmount.toFixed(0)}/mo`,
        `€${targetSaveAmount.toFixed(0)}/mes`
      ),
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
      label: tr(
        "10% оптимизация на променливите разходи",
        "10% variable expense optimization",
        "10% de optimización en gastos variables"
      ),
      detail: tr(
        `Очаквана 10% икономия от средните допълнителни разходи (€${avgMonthlyVariable.toFixed(2)}/мес).`,
        `Estimated 10% trim across average variable spending (€${avgMonthlyVariable.toFixed(2)}/mo).`,
        `Ahorro estimado del 10% sobre el gasto variable medio (€${avgMonthlyVariable.toFixed(2)}/mes).`
      ),
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
      label: tr(
        "Темп за активните спестовни цели",
        "Active savings goals pace",
        "Ritmo para metas de ahorro activas"
      ),
      detail: tr(
        `Месечен резерв за оставащите €${totalGoalRemaining.toFixed(2)} по целите (до 10% от базата).`,
        `Monthly allocation needed toward €${totalGoalRemaining.toFixed(2)} remaining goal target (capped at 10%).`,
        `Aportación mensual necesaria para los €${totalGoalRemaining.toFixed(2)} restantes (máx. 10%).`
      ),
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
      title: tr("Финансов здравен индекс", "Financial Health Index", "Índice de salud financiera"),
      displayValue: `${healthScoreVal}/100`,
      badgeText: translateHealthRating(healthRating, lang),
      formula: tr(
        "50 (База) ± Норма на спестяване (±20) ± Авариен буфер (±20/-15) ± Общ бюджет (+10/-15) − Надвишени категории (до -10) ± Цели (+5/-3), скала 10–100",
        "50 (Base) ± Savings Rate (±20) ± Emergency Buffer (±20/-15) ± Budget Limit (+10/-15) − Category Overspend (up to -10) ± Savings Goals (+5/-3), clamped 10–100",
        "50 (Base) ± Tasa de ahorro (±20) ± Colchón de emergencia (±20/-15) ± Presupuesto (+10/-15) − Exceso por categoría (hasta -10) ± Metas (+5/-3), escala 10–100"
      ),
      inputsUsed: [
        {
          label: tr("Анализирани месеци", "Months analyzed", "Meses analizados"),
          value: `${monthsCount}`,
        },
        {
          label: tr("Норма на спестяване", "Savings rate", "Tasa de ahorro"),
          value: `${roundedSavingsRate}%`,
        },
        {
          label: tr("Авариен фонд", "Emergency buffer", "Colchón de emergencia"),
          value: tr(`${runwayMonths} мес.`, `${runwayMonths} mo.`, `${runwayMonths} mes.`),
        },
        {
          label: tr("Общ месечен бюджет", "Monthly budget limit", "Límite presupuestario mensual"),
          value:
            totalMonthlyBudget > 0
              ? `€${totalMonthlyBudget.toFixed(2)}`
              : tr("Не е зададен", "Not set", "Sin definir"),
        },
        {
          label: tr("Надвишени категорийни бюджети", "Exceeded category budgets", "Presupuestos de categoría excedidos"),
          value: `${exceededCategoryBudgets.length}`,
        },
      ],
      calculationSteps: healthScoreFactors,
      interpretation:
        healthScoreVal >= 80
          ? tr(
              "Отлична финансова стабилност: силна спестовна дисциплина, стабилен буфер и контролирани разходи.",
              "Excellent financial resilience: strong savings discipline, healthy emergency coverage, and controlled spending.",
              "Excelente estabilidad financiera: sólida disciplina de ahorro, colchón saludable y gastos controlados."
            )
          : healthScoreVal >= 65
          ? tr(
              "Добър финансов баланс с ясен потенциал за подсилване на резерва или оптимизиране на лимитите.",
              "Good financial balance with clear headroom to strengthen reserves or tighten budget caps.",
              "Buen equilibrio financiero con margen claro para reforzar reservas u optimizar límites."
            )
          : healthScoreVal >= 45
          ? tr(
              "Задоволително състояние: отделни показатели като аварийния буфер или спазването на бюджета понижават индекса.",
              "Fair status: some areas such as savings buffer or budget adherence are pulling the score down.",
              "Estado aceptable: algunos indicadores como el colchón o el cumplimiento presupuestario reducen la puntuación."
            )
          : tr(
              "Нужда от оптимизация: разходите се доближават или надвишават приходите и/или аварийният резерв е критично нисък.",
              "Needs optimization: expenses are close to or above income and/or emergency coverage is critically low.",
              "Necesita optimización: los gastos se acercan o superan a los ingresos y/o el fondo de emergencia es muy bajo."
            ),
      recommendations: [
        ...(savingsRate < 20
          ? [
              tr(
                "Достигането на норма на спестяване ≥ 20% носи до +20 точки към индекса.",
                "Raising your savings rate to ≥ 20% adds up to +20 points to your index.",
                "Alcanzar una tasa de ahorro ≥ 20% suma hasta +20 puntos a tu índice."
              ),
            ]
          : []),
        ...(runwayMonths < 6
          ? [
              tr(
                "Увеличаването на аварийния фонд до 3 месеца носи +10 точки (и +20 точки при 6 месеца).",
                "Growing your emergency buffer to 3 months adds +10 points (and +20 points at 6 months).",
                "Ampliar el colchón de emergencia a 3 meses suma +10 puntos (y +20 puntos con 6 meses)."
              ),
            ]
          : []),
        ...(totalMonthlyBudget <= 0 || exceededCategoryBudgets.length > 0 || (totalMonthlyBudget > 0 && avgMonthlyExpenses > totalMonthlyBudget)
          ? [
              tr(
                "Задайте и спазвайте месечния и категорийните бюджети за до +10 бонус точки.",
                "Configure and stay within monthly and category budgets for up to +10 bonus points.",
                "Configura y respeta los presupuestos mensuales y por categoría para sumar hasta +10 puntos."
              ),
            ]
          : []),
        ...(healthScoreVal >= 80
          ? [
              tr(
                "Поддържайте текущия ритъм и актуализирайте спестовните си цели периодично.",
                "Maintain your current rhythm and periodically review savings goals.",
                "Mantén este ritmo y revisa periódicamente tus metas de ahorro."
              ),
            ]
          : []),
      ],
      targetActionTab: "budgets",
      targetActionLabel: tr("Към Бюджети", "Open Budgets", "Ir a Presupuestos"),
    },
    savingsRate: {
      id: "savingsRate",
      title: tr("Норма на спестяване", "Savings Rate", "Tasa de ahorro"),
      displayValue: `${roundedSavingsRate}%`,
      badgeText:
        avgMonthlyIncome > 0
          ? `${savingsRate >= savingsTargetPercent ? "✓ " : ""}${tr("Цел", "Target", "Meta")}: ${savingsTargetPercent}%`
          : undefined,
      formula: tr(
        "((Среден месечен приход − Среден месечен разход) ÷ Среден месечен приход) × 100  [в интервала 0% – 100%]",
        "((Avg Monthly Income − Avg Monthly Expenses) ÷ Avg Monthly Income) × 100  [clamped 0% – 100%]",
        "((Ingreso mensual medio − Gasto mensual medio) ÷ Ingreso mensual medio) × 100  [rango 0% – 100%]"
      ),
      inputsUsed: [
        {
          label: tr("Общо реализирани приходи", "Total completed income", "Total de ingresos realizados"),
          value: `€${totalIncome.toFixed(2)}`,
        },
        {
          label: tr("Общо приключени разходи", "Total completed expenses", "Total de gastos realizados"),
          value: `€${totalExpenses.toFixed(2)}`,
        },
        {
          label: tr("Анализирани месеци", "Months analyzed", "Meses analizados"),
          value: `${monthsCount}`,
        },
        {
          label: tr("Заложена целева норма", "Configured target", "Objetivo configurado"),
          value: `${savingsTargetPercent}%`,
        },
      ],
      calculationSteps: [
        {
          label: tr("Среден месечен приход", "Average monthly income", "Ingreso mensual medio"),
          detail: `€${totalIncome.toFixed(2)} ÷ ${effectiveMonthsDenominator} = €${avgMonthlyIncome.toFixed(2)}`,
          delta: `€${avgMonthlyIncome.toFixed(2)}`,
          tone: "neutral",
        },
        {
          label: tr("Среден месечен разход", "Average monthly expenses", "Gasto mensual medio"),
          detail: `€${totalExpenses.toFixed(2)} ÷ ${effectiveMonthsDenominator} = €${avgMonthlyExpenses.toFixed(2)}`,
          delta: `€${avgMonthlyExpenses.toFixed(2)}`,
          tone: "neutral",
        },
        {
          label: tr("Среден месечен нетен остатък", "Average monthly net surplus", "Superávit neto mensual medio"),
          detail: `€${avgMonthlyIncome.toFixed(2)} − €${avgMonthlyExpenses.toFixed(2)}`,
          delta: `${avgNetMonthlySurplus >= 0 ? "+" : "-"}€${Math.abs(avgNetMonthlySurplus).toFixed(2)}`,
          tone: avgNetMonthlySurplus > 0 ? "positive" : avgNetMonthlySurplus < 0 ? "negative" : "neutral",
        },
        {
          label: tr("Изчислена норма на спестяване", "Resulting savings rate", "Tasa de ahorro resultante"),
          detail:
            avgMonthlyIncome > 0
              ? `(€${avgNetMonthlySurplus.toFixed(2)} ÷ €${avgMonthlyIncome.toFixed(2)}) × 100`
              : tr(
                  "Все още няма въведени приходи, поради което стойността е 0%.",
                  "No recorded income yet, so savings rate defaults to 0%.",
                  "Aún no hay ingresos registrados, por lo que la tasa es 0%."
                ),
          delta: `${roundedSavingsRate}%`,
          tone: roundedSavingsRate >= 15 ? "positive" : roundedSavingsRate === 0 ? "negative" : "neutral",
        },
      ],
      interpretation:
        avgMonthlyIncome <= 0
          ? tr(
              "Добавете реализираните си приходи, за да може системата да изчисли какъв дял от дохода остава за спестяване.",
              "Add your completed monthly income so the engine can calculate what share of income remains unspent.",
              "Añade tus ingresos mensuales realizados para calcular qué proporción queda para ahorro."
            )
          : roundedSavingsRate >= 20
          ? tr(
              `Отличен резултат: запазвате ${roundedSavingsRate}% от приходите си всеки месец (над правилото за 20%).`,
              `Strong surplus: you retain ${roundedSavingsRate}% of income each month (exceeding the 20% rule-of-thumb).`,
              `Excelente resultado: retienes el ${roundedSavingsRate}% de tus ingresos cada mes (superando la regla del 20%).`
            )
          : roundedSavingsRate >= 10
          ? tr(
              `Умерена норма от ${roundedSavingsRate}%. Покачването към 20% ускорява двойно натрупването на резерв и цели.`,
              `Moderate surplus at ${roundedSavingsRate}%. Lifting it toward 20% builds wealth and emergency reserves twice as fast.`,
              `Superávit moderado del ${roundedSavingsRate}%. Subirlo al 20% acelera al doble tus reservas y metas.`
            )
          : tr(
              `Ниска норма на спестяване (${roundedSavingsRate}%): почти целият месечен доход се поема от текущите разходи.`,
              `Low savings rate (${roundedSavingsRate}%): almost all monthly income is absorbed by current expenses.`,
              `Tasa de ahorro baja (${roundedSavingsRate}%): casi todo el ingreso mensual se destina a gastos corrientes.`
            ),
      recommendations: [
        tr(
          `При среден доход €${avgMonthlyIncome.toFixed(2)} целта от ${savingsTargetPercent}% се равнява на €${((avgMonthlyIncome * savingsTargetPercent) / 100).toFixed(2)}/мес.`,
          `At €${avgMonthlyIncome.toFixed(2)} avg monthly income, a ${savingsTargetPercent}% target equals €${((avgMonthlyIncome * savingsTargetPercent) / 100).toFixed(2)}/mo.`,
          `Con un ingreso medio de €${avgMonthlyIncome.toFixed(2)}, una meta del ${savingsTargetPercent}% equivale a €${((avgMonthlyIncome * savingsTargetPercent) / 100).toFixed(2)}/mes.`
        ),
        tr(
          "Важно: Във формулата участват само приключените приходи и разходи по месеци.",
          "Note: Only completed income and completed expenses from your monthly records enter this formula (separate transfers to Savings do not distort income).",
          "Nota: En esta fórmula solo participan ingresos y gastos completados (las transferencias a Ahorros no distorsionan tus ingresos)."
        ),
      ],
      targetActionTab: "income",
      targetActionLabel: tr("Към Приходи", "Review Income", "Ir a Ingresos"),
    },
    runwayMonths: {
      id: "runwayMonths",
      title: tr("Авариен спестовен фонд", "Emergency Savings Buffer", "Colchón de emergencia"),
      displayValue: tr(`${runwayMonths} мес.`, `${runwayMonths} mo.`, `${runwayMonths} mes.`),
      badgeText:
        runwayMonths >= 6
          ? tr("Оптимален (6+ мес.)", "Optimal (6+ mo.)", "Óptimo (6+ mes.)")
          : runwayMonths >= 3
          ? tr("Стабилен (3+ мес.)", "Stable (3+ mo.)", "Estable (3+ mes.)")
          : tr("Нужда от попълване", "Needs buildup", "Necesita refuerzo"),
      formula: tr(
        "Текущ баланс на спестяванията ÷ Среден месечен разход",
        "Current Total Savings Balance ÷ Avg Monthly Expenses",
        "Saldo total actual de ahorros ÷ Gasto mensual medio"
      ),
      inputsUsed: [
        {
          label: tr("Текущ спестовен баланс", "Total savings balance", "Saldo total de ahorros"),
          value: `€${currentSavingsBalance.toFixed(2)}`,
        },
        {
          label: tr("Среден месечен разход", "Average monthly expenses", "Gasto mensual medio"),
          value: `€${avgMonthlyExpenses.toFixed(2)}`,
        },
        {
          label: tr("Препоръчителна 3-мес. цел", "Recommended 3-mo target", "Meta recomendada 3 meses"),
          value: `€${recommended3MoFund.toFixed(2)}`,
        },
        {
          label: tr("Оптимална 6-мес. цел", "Optimal 6-mo target", "Meta óptima 6 meses"),
          value: `€${recommended6MoFund.toFixed(2)}`,
        },
      ],
      calculationSteps: [
        {
          label: tr("Налични нето спестявания", "Net savings available", "Ahorros netos disponibles"),
          detail: tr(
            "Сума на всички вноски минус тегления в модул „Спестявания“",
            "Sum of all deposits minus withdrawals in your Savings ledger",
            "Suma de todos los ingresos menos retiros en tu historial de Ahorros"
          ),
          delta: `€${currentSavingsBalance.toFixed(2)}`,
          tone: currentSavingsBalance > 0 ? "positive" : "negative",
        },
        {
          label: tr("База месечен разход", "Monthly burn baseline", "Base de gasto mensual"),
          detail: `€${totalExpenses.toFixed(2)} ÷ ${effectiveMonthsDenominator}`,
          delta: tr(
            `€${avgMonthlyExpenses.toFixed(2)}/мес`,
            `€${avgMonthlyExpenses.toFixed(2)}/mo`,
            `€${avgMonthlyExpenses.toFixed(2)}/mes`
          ),
          tone: "neutral",
        },
        {
          label: tr("Покритие в месеци", "Coverage duration", "Duración de cobertura"),
          detail:
            avgMonthlyExpenses > 0
              ? `€${currentSavingsBalance.toFixed(2)} ÷ €${avgMonthlyExpenses.toFixed(2)}`
              : currentSavingsBalance > 0
              ? tr(
                  "При положителни спестявания и €0 разходи се приема база 12 месеца.",
                  "Positive savings with €0 expenses defaults to 12 months.",
                  "Ahorros positivos con €0 de gastos toman 12 meses por defecto."
                )
              : tr(
                  "Все още няма записани спестявания или разходи.",
                  "No savings balance or expenses recorded yet.",
                  "Aún no hay saldo de ahorros ni gastos registrados."
                ),
          delta: tr(`${runwayMonths} мес.`, `${runwayMonths} mo.`, `${runwayMonths} mes.`),
          tone: runwayMonths >= 3 ? "positive" : "negative",
        },
      ],
      interpretation:
        runwayMonths >= 6
          ? tr(
              `Натрупаните спестявания покриват ${runwayMonths} месеца обичайни разходи — пълно покритие над препоръчителния праг от 6 месеца.`,
              `Your savings cover ${runwayMonths} months of regular living expenses — meeting the full 6-month gold standard.`,
              `Tus ahorros cubren ${runwayMonths} meses de gastos habituales, cumpliendo el estándar completo de 6 meses.`
            )
          : runwayMonths >= 3
          ? tr(
              `Разполагате със стабилен буфер за ${runwayMonths} месеца. Още €${Math.max(0, recommended6MoFund - currentSavingsBalance).toFixed(0)} ще достигнат оптимума от 6 месеца.`,
              `You have a solid ${runwayMonths}-month buffer. Adding €${Math.max(0, recommended6MoFund - currentSavingsBalance).toFixed(0)} reaches the 6-month benchmark.`,
              `Tienes un colchón sólido de ${runwayMonths} meses. Con €${Math.max(0, recommended6MoFund - currentSavingsBalance).toFixed(0)} más alcanzarás los 6 meses.`
            )
          : tr(
              `Буферът ви покрива ${runwayMonths} месеца. За достигане на минималния 3-месечен резерв (€${recommended3MoFund.toFixed(0)}) са нужни още €${Math.max(0, recommended3MoFund - currentSavingsBalance).toFixed(0)}.`,
              `Your buffer covers ${runwayMonths} months. Reaching a 3-month reserve (€${recommended3MoFund.toFixed(0)}) needs €${Math.max(0, recommended3MoFund - currentSavingsBalance).toFixed(0)} more.`,
              `Tu colchón cubre ${runwayMonths} meses. Para alcanzar una reserva mínima de 3 meses (€${recommended3MoFund.toFixed(0)}) faltan €${Math.max(0, recommended3MoFund - currentSavingsBalance).toFixed(0)}.`
            ),
      recommendations: [
        tr(
          "Поддържайте поне 3 до 6 месеца основни разходи в ликвиден резерв.",
          "Keep 3–6 months of core expenses liquid before tying up extra cash in illiquid assets.",
          "Mantén entre 3 y 6 meses de gastos básicos en reserva líquida."
        ),
        ...(activeGoals.length > 0
          ? [
              tr(
                `Напредък по активни цели: заделени €${totalGoalAllocated.toFixed(2)} от общо €${totalGoalTarget.toFixed(2)}.`,
                `Active savings goals progress: €${totalGoalAllocated.toFixed(2)} allocated of €${totalGoalTarget.toFixed(2)} target.`,
                `Progreso en metas activas: €${totalGoalAllocated.toFixed(2)} asignados de €${totalGoalTarget.toFixed(2)}.`
              ),
            ]
          : []),
      ],
      targetActionTab: "savings",
      targetActionLabel: tr("Към Спестявания", "Open Savings", "Ir a Ahorros"),
    },
    monthlySavingsPotential: {
      id: "monthlySavingsPotential",
      title: tr("Потенциал за икономия", "Savings Potential", "Potencial de ahorro"),
      displayValue: `~€${finalPotentialMonthlySavings}`,
      badgeText: tr("на месец", "per month", "al mes"),
      formula: tr(
        "Сума на активните възможности за оптимизация (Водеща категория 15% + Заведения 25% + Доход 10% + Нощен ток 12% + Преразход по бюджети + Цели/Променливи)",
        "Sum of triggered optimization opportunities (Top Category 15% + Dining 25% + Low Savings Shift 10% + Night Electricity 12% + Budget Overspend + Variable/Goal Pace)",
        "Suma de oportunidades detectadas (Categoría principal 15% + Ocio 25% + Ahorro 10% + Tarifa nocturna 12% + Excesos de presupuesto + Ritmo de metas)"
      ),
      inputsUsed: [
        {
          label: tr("Водеща категория", "Top category", "Categoría principal"),
          value: topCategory
            ? `${translateCategoryName(topCategory[0], lang)} (${Math.round((topCategory[1] / Math.max(1, totalExpenses)) * 100)}%)`
            : tr("Няма", "None", "Ninguna"),
        },
        {
          label: tr("Преразход по бюджети", "Budget overspend", "Exceso de presupuestos"),
          value: `€${budgetOverspendPotential.toFixed(0)}`,
        },
        {
          label: tr("Отчети за ток", "Electricity records", "Registros de electricidad"),
          value: `${electricityHistory.length}`,
        },
        {
          label: tr("Остатък по активни цели", "Active savings goals remaining", "Restante en metas activas"),
          value: `€${totalGoalRemaining.toFixed(2)}`,
        },
      ],
      calculationSteps:
        savingsPotentialParts.length > 0
          ? savingsPotentialParts
          : [
              {
                label: tr(
                  "Няма активни сигнали за оптимизация",
                  "No active optimization triggers",
                  "Sin alertas de optimización activas"
                ),
                detail: tr(
                  "Към момента няма превишени бюджети, свръхконцентрация на разходи или неоптимизирана тарифа.",
                  "None of the spending concentration, overspend, tariff, or goal rules currently require extra monthly cuts.",
                  "Ninguna regla de concentración, exceso de presupuesto o tarifa requiere recortes adicionales actualmente."
                ),
                delta: "€0",
                tone: "neutral",
              },
            ],
      interpretation:
        finalPotentialMonthlySavings > 0
          ? tr(
              `На база реалните ви разходи, бюджети, сметки за ток и активни цели можете реалистично да освободите ~€${finalPotentialMonthlySavings}/мес.`,
              `Based on your real transactions, budgets, electricity bills, and active goals, you can realistically free up ~€${finalPotentialMonthlySavings}/mo.`,
              `Según tus gastos reales, presupuestos, facturas de luz y metas activas, puedes liberar de forma realista ~€${finalPotentialMonthlySavings}/mes.`
            )
          : tr(
              "Отчетените разходи, бюджети и тарифи в момента са добре балансирани без изявени излишни течове (€0).",
              "Your tracked expenses, budgets, and tariff ratios currently look balanced with €0 estimated excess leakage.",
              "Tus gastos, presupuestos y tarifas están equilibrados actualmente sin fugas estimadas (€0)."
            ),
      recommendations: [
        tr(
          "Всяка промяна в бюджетите, навиците за хранене навън, сметките за ток или спестовните цели преизчислява този потенциал автоматично.",
          "Adjusting category budgets, dining frequency, or shifting appliances to nighttime electricity updates this potential automatically.",
          "Ajustar presupuestos, frecuencia de comidas fuera o el horario nocturno de electrodomésticos actualiza este potencial automáticamente."
        ),
      ],
      targetActionTab: "budgets",
      targetActionLabel: tr("Настрой Бюджети", "Adjust Budgets", "Ajustar presupuestos"),
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
