import { MonthlyRecord, IncomeItem, ExpenseItem, ElectricityRecord, BudgetConfig } from "@/types";
import { getStoredElectricityHistory } from "./electricityStorage";
import { loadBudgets } from "./budgetStorage";

export type InsightType =
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
  category: "spending" | "savings" | "electricity" | "trend";
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

/**
 * Intelligent Rule-Based Local Financial Analysis Engine
 * Extracts deep metrics across all stored records and generates high-fidelity insights.
 */
export function generateLocalFinancialAnalysis(
  monthlyData: Record<string, MonthlyRecord>,
  globalSavings: IncomeItem[]
): FullAnalysisResult {
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
        allExpenses.push(item);
        totalVariableExpenses += item.amount;
        totalExpenses += item.amount;
        expensesByCategory[item.categoryName] =
          (expensesByCategory[item.categoryName] || 0) + item.amount;
      });
    }
  });

  // Calculate total income
  let totalIncome = 0;
  globalSavings.forEach((tx) => {
    if (tx.type !== "expense") {
      totalIncome += tx.amount;
    }
  });
  allMonthlyRecords.forEach((r) => {
    if (r.incomes && Array.isArray(r.incomes)) {
      r.incomes.forEach((inc) => {
        totalIncome += inc.amount;
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

  // Calculate Health Score (0-100)
  let healthScoreVal = 50;
  if (savingsRate >= 20) healthScoreVal += 20;
  else if (savingsRate >= 10) healthScoreVal += 10;
  else if (savingsRate < 0) healthScoreVal -= 20;

  if (runwayMonths >= 6) healthScoreVal += 20;
  else if (runwayMonths >= 3) healthScoreVal += 10;
  else if (runwayMonths < 1) healthScoreVal -= 15;

  if (totalMonthlyBudget > 0 && avgMonthlyExpenses <= totalMonthlyBudget) {
    healthScoreVal += 10;
  } else if (totalMonthlyBudget > 0 && avgMonthlyExpenses > totalMonthlyBudget) {
    healthScoreVal -= 15;
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

    if (topCatPct >= 35) {
      const suggestReduction = Math.round(monthlyTopSpend * 0.15);
      potentialMonthlySavings += suggestReduction;

      insights.push({
        id: "spending_top_heavy",
        type: "spending",
        category: "spending",
        priority: "high",
        title: `Висока концентрация на разходи в „${topCategory[0]}“ (${topCatPct}%)`,
        description: `Категорията „${topCategory[0]}“ заема почти ${topCatPct}% от всичките ви разходи (€${monthlyTopSpend.toFixed(2)}/мес). Това е ключова област за бърза оптимизация.`,
        impact: `Спестяване: ~€${suggestReduction}/мес`,
        actionableTip: `Намаляването на харчовете за ${topCategory[0]} с едва 15% ще освободи около €${suggestReduction} допълнителни свободни парични средства всеки месец.`,
        metricLabel: "Дял от общите разходи",
        metricValue: `${topCatPct}%`,
        isTopRecommendation: true,
      });
    } else {
      insights.push({
        id: "spending_healthy_distribution",
        type: "spending",
        category: "spending",
        priority: "low",
        title: `Балансирано разпределение на разходите`,
        description: `Най-голямото перо е „${topCategory[0]}“ с ${topCatPct}%, което показва стабилна диверсификация без прекомерна зависимост от единична категория.`,
        actionableTip: `Продължавайте да следите разходите по категории, за да задържите този баланс.`,
        metricLabel: "Водеща категория",
        metricValue: `${topCategory[0]} (${topCatPct}%)`,
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
        title: `Възможност за намаляване на разходите за хранене навън и заведения`,
        description: `За ресторанти, кафе и забавления харчите средно €${diningMonthly.toFixed(2)} на месец (${diningPct.toFixed(1)}% от бюджета).`,
        impact: `Спестяване: ~€${diningSavings}/мес`,
        actionableTip: `Приготвянето на храна у дома само 2-3 пъти повече в месеца може да спести приблизително €${diningSavings} на месец, без да ограничава социалния ви живот.`,
        metricLabel: "Месечно за заведения",
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
        title: `Бюджетен съвет: Високи твърди ангажименти (${fixedRatio}%)`,
        description: `Фиксираните ви разходи (кредити, сметки, абонаменти) заемат ${fixedRatio}% от всички разходи. Препоръчителният праг по правилото 50/30/20 е до 50%.`,
        impact: `Оптимизация на дълг и договори`,
        actionableTip: `Прегледайте абонаментите за мобилни оператори, телевизия и застраховки или помислете за предоговаряне на банкови лихви и обединяване на кредити.`,
        metricLabel: "Фиксирани разходи",
        metricValue: `${fixedRatio}%`,
        isTopRecommendation: true,
      });
    } else {
      insights.push({
        id: "spending_fixed_good",
        type: "spending",
        category: "spending",
        priority: "low",
        title: `Добра структура между фиксирани и променливи разходи`,
        description: `Фиксираните ви разходи са ${fixedRatio}%, а текущите променливи са ${variableRatio}%, което оставя достатъчна гъвкавост за реакция при непредвидени обстоятелства.`,
        actionableTip: `Запазете контрола върху гъвкавите разходи чрез редовно следене на седмичните лимити.`,
        metricLabel: "Фиксирани / Променливи",
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
      insights.push({
        id: `unusual_exp_${topOutlier.id}`,
        type: "unusual",
        category: "spending",
        priority: "medium",
        title: `Открит необичайно висок единичен разход: €${topOutlier.amount.toFixed(2)}`,
        description: `Плащането в категория „${topOutlier.categoryName}“ (${topOutlier.note || "без бележка"}) надвишава обичайния размер на трансакциите повече от 2.5 пъти.`,
        impact: `Внимание: Еднократно натоварване`,
        actionableTip: `Ако това е редовно повтарящ се годишен или сезонен разход, създайте отделен целеви подфонд, за да не натоварва бюджета в рамките на един-единствен месец.`,
        metricLabel: "Сума на записа",
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
      title: `Спешна възможност: Изграждане на 3-месечен авариен фонд`,
      description: `Текущите ви спестявания покриват ${runwayMonths} месеца от месечните ви разходи. Финансовите експерти препоръчват минимум 3 до 6 месеца буфер за сигурност.`,
      impact: `Цел: €${targetFund.toFixed(0)} фонд`,
      actionableTip: `Заделянето на допълнителни €${monthlyNeeded}/мес ще ви осигури пълен 3-месечен фонд за сигурност само за следващите половин година.`,
      metricLabel: "Наличен буфер",
      metricValue: `${runwayMonths} мес.`,
      isTopRecommendation: true,
    });
  } else if (runwayMonths >= 6) {
    insights.push({
      id: "savings_runway_strong",
      type: "savings",
      category: "savings",
      priority: "opportunity",
      title: `Отличен авариен буфер (${runwayMonths} месеца издръжка)`,
      description: `Имате натрупани €${currentSavingsBalance.toFixed(2)}, които гарантират спокойствие за повече от половин година при евентуална загуба на доходи.`,
      impact: `Възможност за инвестиции`,
      actionableTip: `Тъй като аварийният ви фонд е напълно обезпечен, можете да помислите за доходно насочване на новите спестявания към дългосрочни инструменти.`,
      metricLabel: "Покритие на разходи",
      metricValue: `${runwayMonths} месеца`,
      isTopRecommendation: false,
    });
  } else {
    insights.push({
      id: "savings_runway_moderate",
      type: "savings",
      category: "savings",
      priority: "medium",
      title: `Стабилен спестовен фонд (${runwayMonths} месеца)`,
      description: `Спестовният ви фонд покрива разходите за ${runwayMonths} месеца. Придвижването към 6 месеца ще ви осигури максимална сигурност.`,
      actionableTip: `Автоматизирайте спестяването още в деня на получаване на заплата (принципът „Плати първо на себе си“).`,
      metricLabel: "Наличност",
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
      title: `Увеличете нормата на спестяване до поне 15%`,
      description: `В момента спестявате средно ${savingsRate.toFixed(1)}% от доходите си. Златният стандарт за финансова независимост е минимум 15-20%.`,
      impact: `Потенциал: +€${boostSavings}/мес`,
      actionableTip: `Пренасочете спестените пари от оптимизиране на абонаменти и ресторанти директно към спестовната сметка преди началото на месеца.`,
      metricLabel: "Текуща норма",
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
        title: `Електроенергия: Ниско използване на нощната тарифа (${nightRatio}%)`,
        description: `Само ${nightRatio}% от електроенергията ви се потребява на евтината нощна тарифа. Нощната тарифа е почти 40% по-изгодна от дневната.`,
        impact: `Спестяване: ~€${elecSavings}/мес`,
        actionableTip: `Настройвайте бойлера, пералнята и съдомиялната машина с таймер за работа в нощните часове (22:00 - 06:00 ч.), за да намалите сметката с до 15%.`,
        metricLabel: "Нощна тарифа",
        metricValue: `${nightRatio}%`,
        isTopRecommendation: true,
      });
    } else {
      insights.push({
        id: "elec_tariff_efficient",
        type: "electricity",
        category: "electricity",
        priority: "low",
        title: `Отлична оптимизация на нощната тарифа за ток (${nightRatio}%)`,
        description: `Потребявате ${nightRatio}% от енергията на по-ниската цена, което ви осигурява реални спестявания всеки месец.`,
        actionableTip: `Продължавайте да планирате енергоемките уреди през часовете с намалена цена на киловатчас.`,
        metricLabel: "Дял нощна консумация",
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
        insights.push({
          id: "elec_cost_spike",
          type: "trend",
          category: "electricity",
          priority: "high",
          title: `Ръст в сметката за ток: +${pctChange.toFixed(0)}% (€${latest.totalCost.toFixed(2)})`,
          description: `Последната ви сметка е с €${costChange.toFixed(2)} по-висока спрямо предходния отчен период (${previous.month} ${previous.year}).`,
          impact: `Консумация: +${(latest.consumption - previous.consumption).toFixed(0)} kWh`,
          actionableTip: `Проверете за увеличена работа на отоплителни или климатични уреди, или уплътнения на прозорци и врати.`,
          metricLabel: "Промяна спрямо минал месец",
          metricValue: `+${pctChange.toFixed(0)}%`,
        });
      }
    }
  }

  // ----------------------------------------------------
  // 5. TREND ANALYSIS & BUDGET OPTIMIZATION ADVICE
  // ----------------------------------------------------
  if (totalMonthlyBudget > 0) {
    const budgetPct = Math.round((avgMonthlyExpenses / totalMonthlyBudget) * 100);

    if (budgetPct > 100) {
      const overspent = Math.round(avgMonthlyExpenses - totalMonthlyBudget);
      insights.push({
        id: "budget_over_limit",
        type: "recommendation",
        category: "trend",
        priority: "high",
        title: `Превишаване на месечния бюджет с €${overspent}`,
        description: `Средният ви месечен разход (€${avgMonthlyExpenses.toFixed(2)}) надвишава определения лимит от €${totalMonthlyBudget.toFixed(2)} с ${budgetPct - 100}%.`,
        impact: `Преразход: €${overspent}/мес`,
        actionableTip: `Прегледайте индивидуалните лимити по категории в секция „Бюджет“ или коригирайте месечния лимит според реалните ви нужди.`,
        metricLabel: "Усвояване на лимита",
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
        title: `Бюджетът се спазва стриктно (€${surplus} буфер)`,
        description: `Харчите средно ${budgetPct}% от зададения месечен лимит (€${totalMonthlyBudget.toFixed(2)}), запазвайки положителен свободен остатък.`,
        actionableTip: `Прехвърляйте спестения буфер от €${surplus} автоматично към спестовния фонд в края на всеки месец.`,
        metricLabel: "Свободен марж",
        metricValue: `€${surplus}/мес`,
      });
    }
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
      monthlySavingsPotential: Math.max(50, potentialMonthlySavings),
    },
    totalExpensesAnalyzed: parseFloat(totalExpenses.toFixed(2)),
    totalIncomeAnalyzed: parseFloat(totalIncome.toFixed(2)),
    totalSavingsBalance: parseFloat(currentSavingsBalance.toFixed(2)),
    monthsAnalyzedCount: monthsCount,
    insights: sortedByPriority,
    topRecommendations,
  };
}
