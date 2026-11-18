import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  ArrowUp,
  ArrowUpRight,
  MoreHorizontal,
  Trash2,
  BarChart3,
  ListFilter,
  GitCompareArrows,
  Receipt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { MonthlyRecord, IncomeItem } from "@/types";
import {
  answerFinancialChatQuestion,
  AiChatResponse,
  AiChatMatchedExpense,
} from "@/utils/aiChatEngine";
import {
  MONTHS_BG,
  getPreviousMonthAndYear,
  calculateMonthExpenses,
} from "@/utils/comparisonStorage";
import { isCompletedExpense } from "@/utils/expenseStatus";

interface AiChatSectionProps {
  monthlyData: Record<string, MonthlyRecord>;
  globalSavings: IncomeItem[];
  currentMonth?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  questionAsked?: string;
  title?: string;
  heroValue?: string;
  heroSubtitle?: string;
  foundIn?: string[];
  response?: AiChatResponse;
}

interface MessageUiState {
  showDetails: boolean;
  showChart: boolean;
  showAllRecords: boolean;
}

const SUGGESTED_QUESTIONS = [
  "Колко похарчих за цигари този месец?",
  "Какви са повтарящите ми се приходи?",
  "Какви предстоящи разходи имам?",
  "Какви приходи очаквам?",
  "Коя категория ми струва най-много?",
  "Покажи най-големите ми разходи",
];

function fmtEur(n: number): string {
  return `€${n.toFixed(2)}`;
}

function getAllExpensesFromRecord(record: MonthlyRecord | undefined): AiChatMatchedExpense[] {
  if (!record?.expenses) return [];
  const items: AiChatMatchedExpense[] = [];

  if (Array.isArray(record.expenses.fixed_expenses)) {
    record.expenses.fixed_expenses.forEach((exp, idx) => {
      if (!isCompletedExpense(exp)) return;
      items.push({
        id: exp.id || `fix_${idx}`,
        monthKey: "",
        date: exp.date || "",
        merchantOrCategory: exp.merchantName || exp.categoryName,
        categoryName: exp.categoryName,
        expenseAmount: Number(exp.amount) || 0,
        matchedAmount: Number(exp.amount) || 0,
        matchedKind: "fixed",
        matchedSnippet: exp.note || undefined,
      });
    });
  }

  if (Array.isArray(record.expenses.additional_expenses)) {
    record.expenses.additional_expenses.forEach((exp, idx) => {
      if (!isCompletedExpense(exp)) return;
      items.push({
        id: exp.id || `var_${idx}`,
        monthKey: "",
        date: exp.date || "",
        merchantOrCategory: exp.merchantName || exp.categoryName,
        categoryName: exp.categoryName,
        expenseAmount: Number(exp.amount) || 0,
        matchedAmount: Number(exp.amount) || 0,
        matchedKind: exp.merchantName ? "merchant" : "category",
        matchedSnippet: exp.note || undefined,
      });
    });
  }

  return items.sort((a, b) => b.matchedAmount - a.matchedAmount);
}

function resolveActiveMonthKey(
  monthlyData: Record<string, MonthlyRecord>,
  currentMonth?: string
): string {
  if (currentMonth && monthlyData[currentMonth]) return currentMonth;
  if (currentMonth) return currentMonth;
  const keys = Object.keys(monthlyData || {});
  if (keys.length === 0) {
    const now = new Date();
    return `${MONTHS_BG[now.getMonth()]} ${now.getFullYear()}`;
  }
  return keys[keys.length - 1];
}

function deriveResponsePresentation(
  question: string,
  res: AiChatResponse
): {
  title: string;
  heroValue?: string;
  heroSubtitle?: string;
  foundIn: string[];
} {
  const qLower = question.toLowerCase();

  let title = "Финансов отговор";
  if (
    /(?:(?:expect(?:ing|ed)?|upcoming|planned|pending|future)\s+(?:\w+\s+){0,2}(?:income|incomes|salary|earnings)|(?:income|incomes|salary|earnings)\s+(?:am\s+i\s+)?(?:expect(?:ing|ed)?|upcoming|planned|pending)|(?:очакван|предстоящ|планиран|бъдещ)[аио]?\s+(?:\w+\s+){0,2}(?:приход|доход|заплат)|(?:приход|доход|заплат)[аите]*\s+(?:\w+\s+){0,2}(?:очаквам|предсто|планиран))/.test(
      qLower
    )
  ) {
    title = "Очаквани приходи";
  } else if (
    /(?:колко\s+ще\s+похарча|\bще\s+похарча\b|колко\s+се\s+очаква|очаквани\s+разходи|предвидени\s+разходи|expected\s+(?:to\s+)?spend|projected\s+spend)/.test(
      qLower
    )
  ) {
    title = "Очаквани разходи";
  } else if (
    /(?:планиран|предстоящ|предстои\s+да\s+плат|planned\s+(?:expense|payment)|upcoming\s+(?:expense|payment)|pending\s+(?:expense|payment)|(?:expenses?|payments?|разходи|плащания)\s+(?:are\s+)?(?:upcoming|planned|pending))/.test(
      qLower
    )
  ) {
    title = "Предстоящи разходи";
  } else if (/цигар|cigaret|tobacco|iqos|heets|vape|тютюн/.test(qLower)) {
    title = "Разходи за цигари";
  } else if (/ток|електро|electric|kwh/.test(qLower)) {
    title = "Разходи за електроенергия";
  } else if (/спест|save|saved|savings/.test(qLower)) {
    title = "Спестявания";
  } else if (/увелич|increas|more\s+than\s+last|спрямо\s+минал/.test(qLower)) {
    title = "Увеличение по категории";
  } else if (/най-бързо|раст|fastest|growing/.test(qLower)) {
    title = "Най-бързо растящи разходи";
  } else if (
    /(?:\bincome\b|\bearn|\bsalary\b|приход|доход|заплат)/.test(qLower) &&
    /(?:fixed|recurr|regular|периодич|повтарящ|фиксиран|постоян)/.test(qLower)
  ) {
    title = "Повтарящи се приходи";
  } else if (
    /(?:\bincome\b|\bearn|\bsalary\b|приход|доход|заплат)/.test(qLower) &&
    /(?:additional|variable|extra|bonus|one-time|допълнител|променлив|извънред|еднократ)/.test(qLower)
  ) {
    title = "Допълнителни приходи";
  } else if (
    /(?:additional|variable|extra|one-time|допълнител|променлив)/.test(qLower) &&
    /(?:разход|expense)/.test(qLower)
  ) {
    title = "Допълнителни разходи";
  } else if (/повтарящ|периодич|фиксиран|recurr|subscription/.test(qLower)) {
    title = "Повтарящи се разходи";
  } else if (/среден|средно|средния|average|avg/.test(qLower)) {
    title = "Среден месечен разход";
  } else if (/коя\s+категория|категория.*най-много|which\s+category|highest\s+category/.test(qLower)) {
    title = "Най-голяма категория разходи";
  } else if (/най-голям|най-голем|largest|biggest|highest/.test(qLower)) {
    title = "Най-големи разходи";
  } else if (/бюджет|лимит|budget|limit/.test(qLower)) {
    title = "Изпълнение на бюджета";
  } else if (/приход|заплат|доход|income|salary/.test(qLower)) {
    title = "Приходи";
  } else if (/lidl|лидл/i.test(qLower)) {
    title = "Разходи в Lidl";
  } else if (/kaufland|кауфланд/i.test(qLower)) {
    title = "Разходи в Kaufland";
  } else if (/billa|билла|била/i.test(qLower)) {
    title = "Разходи в Billa";
  } else if (/кафе|coffee|starbucks/i.test(qLower)) {
    title = "Разходи за кафе";
  } else if (/горив|бензин|дизел|fuel|omv|shell|lukoil/i.test(qLower)) {
    title = "Разходи за гориво";
  } else {
    const quotedTopic = res.answer.match(/„([^„“”"]+)["“”]|"([^"]+)"/);
    const extracted = quotedTopic?.[1] || quotedTopic?.[2];
    if (extracted && extracted.length < 40) {
      title = `Разходи: ${extracted}`;
    }
  }

  let heroValue: string | undefined;
  if (typeof res.totalMatchedAmount === "number" && (res.totalMatchedAmount !== 0 || res.matchedExpenses.length > 0)) {
    if (/увелич|increas/.test(qLower) && res.totalMatchedAmount > 0) {
      heroValue = `+${fmtEur(res.totalMatchedAmount)}`;
    } else {
      heroValue = fmtEur(res.totalMatchedAmount);
    }
  }

  const uniqueSources: string[] = [];
  const seen = new Set<string>();
  for (const m of res.matchedExpenses) {
    const label = (m.merchantOrCategory || m.categoryName || "").trim();
    if (label && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      uniqueSources.push(label);
    }
    if (uniqueSources.length >= 6) break;
  }

  let heroSubtitle: string | undefined;
  if (res.matchedExpenses.length > 0 && /спест|save/.test(qLower)) {
    heroSubtitle = `${res.matchedExpenses.length} ${res.matchedExpenses.length === 1 ? "трансакция" : "трансакции"}`;
  } else if (res.matchedExpenses.length > 0) {
    heroSubtitle = `${res.matchedExpenses.length} ${res.matchedExpenses.length === 1 ? "запис" : "записа"}`;
  }

  return {
    title,
    heroValue,
    heroSubtitle,
    foundIn: uniqueSources,
  };
}

/**
 * Normalizes plural/category phrasings in the UI dispatcher so suggested prompt
 * chips always map cleanly without modifying aiChatEngine or aiAnalysisEngine.
 */
function runChatQuerySafely(
  rawQuestion: string,
  monthlyData: Record<string, MonthlyRecord>,
  globalSavings: IncomeItem[],
  currentMonth?: string
): {
  response: AiChatResponse;
  titleOverride?: string;
} {
  const qLower = rawQuestion.toLowerCase();

  // 1. Plural "най-големите" -> canonical "най-голям" so INTENT 6 triggers identically
  const normalizedForEngine = rawQuestion
    .replace(/най-голем(?:и|ите)?/gi, "най-голям")
    .replace(/най-висок(?:и|ите)?/gi, "най-висок")
    .replace(/най-скъп(?:и|ите)?/gi, "най-скъп");

  const engineResult = answerFinancialChatQuestion(
    normalizedForEngine,
    monthlyData,
    globalSavings,
    currentMonth
  );

  // 2. Category-ranking prompt support when user asks "Коя категория ми струва най-много?"
  if (
    engineResult.matchedExpenses.length === 0 &&
    /(?:коя\s+категория|категория.*най-много|най-скъпа\s+категория|which\s+category|highest\s+category|most\s+expensive\s+category)/i.test(
      qLower
    )
  ) {
    const activeKey = resolveActiveMonthKey(monthlyData, currentMonth);
    const hasAllKeyword = /(?:всички|общо|цялата|all\s*time|all\s*months)/i.test(qLower);
    const targetEntries = hasAllKeyword
      ? Object.entries(monthlyData || {})
      : monthlyData[activeKey]
      ? [[activeKey, monthlyData[activeKey]] as [string, MonthlyRecord]]
      : Object.entries(monthlyData || {}).slice(-1);

    const byCat: Record<string, number> = {};
    let grandTotal = 0;

    targetEntries.forEach(([, rec]) => {
      const items = getAllExpensesFromRecord(rec);
      items.forEach((it) => {
        const cat = it.categoryName || "Други";
        byCat[cat] = (byCat[cat] || 0) + it.matchedAmount;
        grandTotal += it.matchedAmount;
      });
    });

    const ranked = Object.entries(byCat)
      .map(([cat, sum]) => ({ cat, sum }))
      .filter((x) => x.sum > 0)
      .sort((a, b) => b.sum - a.sum);

    if (ranked.length > 0) {
      const top = ranked[0];
      const share = grandTotal > 0 ? (top.sum / grandTotal) * 100 : 0;
      const periodLabel = hasAllKeyword
        ? `Всички месеци (${targetEntries.length})`
        : targetEntries[0]?.[0] || activeKey;

      return {
        titleOverride: "Най-голяма категория разходи",
        response: {
          answer: `Най-много средства са изразходвани за „${top.cat}“ — ${fmtEur(top.sum)} (${share.toFixed(1)}% от разходите за периода).`,
          calculation: ranked
            .slice(0, 4)
            .map((r) => `${r.cat}: ${fmtEur(r.sum)}`)
            .join(" · "),
          timeRangeLabel: periodLabel,
          matchedExpenses: ranked.map((r, idx) => ({
            id: `cat_rank_${idx}_${r.cat}`,
            monthKey: periodLabel,
            date: grandTotal > 0 ? `${((r.sum / grandTotal) * 100).toFixed(1)}%` : "0%",
            merchantOrCategory: r.cat,
            categoryName: "Категория",
            expenseAmount: parseFloat(r.sum.toFixed(2)),
            matchedAmount: parseFloat(r.sum.toFixed(2)),
            matchedKind: "category",
            matchedSnippet:
              grandTotal > 0
                ? `${((r.sum / grandTotal) * 100).toFixed(1)}% от общо ${fmtEur(grandTotal)}`
                : undefined,
          })),
          totalMatchedAmount: parseFloat(top.sum.toFixed(2)),
        },
      };
    }
  }

  return { response: engineResult };
}

export const AiChatSection: React.FC<AiChatSectionProps> = ({
  monthlyData,
  globalSavings,
  currentMonth,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [uiStates, setUiStates] = useState<Record<string, MessageUiState>>({});

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Scroll chat container smoothly to bottom whenever a message is added
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el && messages.length > 0) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages.length]);

  // Close optional chat menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [menuOpen]);

  // Auto-resize textarea up to ~128px
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
  }, [input]);

  const toggleUiFlag = (msgId: string, key: keyof MessageUiState) => {
    setUiStates((prev) => {
      const cur = prev[msgId] || {
        showDetails: false,
        showChart: false,
        showAllRecords: false,
      };
      return {
        ...prev,
        [msgId]: {
          ...cur,
          [key]: !cur[key],
        },
      };
    });
  };

  const appendConversationTurn = (
    displayQuestion: string,
    response: AiChatResponse,
    titleOverride?: string
  ) => {
    const nowTime = new Date().toLocaleTimeString("bg-BG", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const presentation = deriveResponsePresentation(displayQuestion, response);
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const userMsg: ChatMessage = {
      id: `u_${uid}`,
      role: "user",
      text: displayQuestion,
      timestamp: nowTime,
    };

    const assistantMsg: ChatMessage = {
      id: `a_${uid}`,
      role: "assistant",
      text: response.answer,
      timestamp: nowTime,
      questionAsked: displayQuestion,
      title: titleOverride || presentation.title,
      heroValue: presentation.heroValue,
      heroSubtitle: presentation.heroSubtitle,
      foundIn: presentation.foundIn,
      response,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
  };

  const handleSubmitChat = (overrideText?: string) => {
    const q = (overrideText ?? input).trim();
    if (!q) return;

    const { response, titleOverride } = runChatQuerySafely(
      q,
      monthlyData,
      globalSavings,
      currentMonth
    );

    appendConversationTurn(q, response, titleOverride);

    if (!overrideText) {
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleCompareWithLastMonth = (sourceMsg: ChatMessage) => {
    const baseQuestion = sourceMsg.questionAsked || "";
    const activeKey = resolveActiveMonthKey(monthlyData, currentMonth);
    const parts = activeKey.trim().split(/\s+/);
    const activeM = parts[0] || MONTHS_BG[new Date().getMonth()];
    const activeY = parseInt(parts[1] || String(new Date().getFullYear()), 10);
    const prev = getPreviousMonthAndYear(activeM, activeY);
    const prevKey = `${prev.prevMonth} ${prev.prevYear}`;

    const qLower = baseQuestion.toLowerCase();
    const isSpecificSubject =
      /(?:цигар|cigaret|lidl|kaufland|billa|кафе|coffee|горив|fuel|ток|electric)/i.test(
        qLower
      );

    if (isSpecificSubject) {
      // Query the exact same subject in current vs previous month cleanly
      const cleanedSubject = baseQuestion
        .replace(
          /(?:този\s+месец|миналия\s+месец|тази\s+година|миналата\s+година|последните\s+\d+\s+месеца?|this\s+month|last\s+month|през\s+[а-яa-z]+|\?)/gi,
          ""
        )
        .trim();

      const curRes = answerFinancialChatQuestion(
        `${cleanedSubject} този месец`,
        monthlyData,
        globalSavings,
        activeKey
      );
      const prevRes = answerFinancialChatQuestion(
        `${cleanedSubject} миналия месец`,
        monthlyData,
        globalSavings,
        activeKey
      );

      const curVal = curRes.totalMatchedAmount || 0;
      const prevVal = prevRes.totalMatchedAmount || 0;
      const diff = curVal - prevVal;
      const pct =
        prevVal > 0 ? (diff / prevVal) * 100 : curVal > 0 ? 100 : 0;
      const sign = diff > 0 ? "+" : "";

      const summary =
        diff === 0
          ? `Без промяна спрямо ${prevKey}: ${fmtEur(curVal)} и в двата месеца.`
          : diff > 0
          ? `Разходът през ${activeKey} (${fmtEur(curVal)}) е с ${fmtEur(diff)} (+${pct.toFixed(0)}%) по-висок спрямо ${prevKey} (${fmtEur(prevVal)}).`
          : `Разходът през ${activeKey} (${fmtEur(curVal)}) е с ${fmtEur(Math.abs(diff))} (${pct.toFixed(0)}%) по-нисък спрямо ${prevKey} (${fmtEur(prevVal)}).`;

      const comparisonResponse: AiChatResponse = {
        answer: summary,
        calculation: `${prevKey}: ${fmtEur(prevVal)} → ${activeKey}: ${fmtEur(curVal)} (${sign}${fmtEur(diff)})`,
        timeRangeLabel: `${prevKey} → ${activeKey}`,
        matchedExpenses: [
          {
            id: `cmp_cur_${Date.now()}`,
            monthKey: activeKey,
            date: activeKey,
            merchantOrCategory: `${activeKey}`,
            categoryName: "Текущ период",
            expenseAmount: curVal,
            matchedAmount: curVal,
            matchedKind: "category",
            matchedSnippet: `${curRes.matchedExpenses.length} записа`,
          },
          {
            id: `cmp_prev_${Date.now()}`,
            monthKey: prevKey,
            date: prevKey,
            merchantOrCategory: `${prevKey}`,
            categoryName: "Предходен месец",
            expenseAmount: prevVal,
            matchedAmount: prevVal,
            matchedKind: "category",
            matchedSnippet: `${prevRes.matchedExpenses.length} записа`,
          },
        ],
        totalMatchedAmount: parseFloat(Math.abs(diff).toFixed(2)),
      };

      const titlePrefix = sourceMsg.title ? `${sourceMsg.title}: сравнение` : "Сравнение с миналия месец";
      appendConversationTurn(
        `Сравни „${sourceMsg.title || baseQuestion}“ с миналия месец`,
        comparisonResponse,
        titlePrefix
      );
      return;
    }

    // Otherwise run the full MoM category comparison
    handleSubmitChat("Кои категории се увеличиха спрямо миналия месец?");
  };

  const buildChartRows = (res: AiChatResponse) => {
    if (res.matchedExpenses.length >= 2) {
      const grouped: Record<string, number> = {};
      const distinctLabels = new Set(
        res.matchedExpenses.map((m) => m.merchantOrCategory || m.categoryName)
      );
      const groupByMonth = distinctLabels.size === 1;

      res.matchedExpenses.forEach((m) => {
        const key = groupByMonth
          ? m.monthKey || m.date || m.merchantOrCategory
          : m.merchantOrCategory || m.categoryName;
        grouped[key] = (grouped[key] || 0) + Math.abs(m.matchedAmount);
      });

      return Object.entries(grouped)
        .map(([label, value]) => ({ label, value }))
        .filter((x) => x.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 7);
    }

    // Fallback: show current month's category breakdown so "Покажи графика" always visualizes real data
    const activeKey = resolveActiveMonthKey(monthlyData, currentMonth);
    const items = getAllExpensesFromRecord(monthlyData[activeKey]);
    const byCat: Record<string, number> = {};
    items.forEach((it) => {
      byCat[it.categoryName] = (byCat[it.categoryName] || 0) + it.matchedAmount;
    });
    return Object.entries(byCat)
      .map(([label, value]) => ({ label, value }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  };

  const buildRecordsList = (res: AiChatResponse) => {
    if (res.matchedExpenses.length > 0) {
      return {
        label: `Всички записи (${res.matchedExpenses.length})`,
        rows: res.matchedExpenses,
      };
    }
    const activeKey = resolveActiveMonthKey(monthlyData, currentMonth);
    const monthItems = getAllExpensesFromRecord(monthlyData[activeKey]);
    return {
      label: `Разходи за ${activeKey} (${monthItems.length})`,
      rows: monthItems,
    };
  };

  const activePeriodTotal = (() => {
    const activeKey = resolveActiveMonthKey(monthlyData, currentMonth);
    return calculateMonthExpenses(monthlyData[activeKey]);
  })();

  return (
    <section
      aria-label="AI Финансов Асистент"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col overflow-hidden transition-colors"
    >
      {/* Clean Minimal Top Bar */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-100 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base truncate">
              Финансов AI Асистент
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {currentMonth ? `Активен период: ${currentMonth}` : "Разходи, приходи, бележки и спестявания"}
            </p>
          </div>
        </div>

        {/* Unobtrusive Chat Menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Опции на чата"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1.5 z-30"
            >
              <button
                type="button"
                role="menuitem"
                disabled={messages.length === 0}
                onClick={() => {
                  setMessages([]);
                  setUiStates({});
                  setMenuOpen(false);
                }}
                className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/70 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Нов разговор</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Conversation Viewport */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-[340px] max-h-[580px] overflow-y-auto px-4 sm:px-6 py-5"
      >
        {messages.length === 0 ? (
          /* Friendly Empty State */
          <div className="py-4 sm:py-8 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-100 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6" />
            </div>

            <h4 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight text-balance">
              Анализирайте финансите си с AI
            </h4>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-lg mt-2 leading-relaxed">
              Попитайте на български или английски за вашите разходи, касови бележки, категории, спестявания или сметки за ток.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-2xl mt-7 text-left">
              {SUGGESTED_QUESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSubmitChat(suggestion)}
                  className="min-h-[44px] px-4 py-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 border border-slate-200/80 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-700 text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs sm:text-sm font-medium flex items-center justify-between gap-2.5 transition-all cursor-pointer group"
                >
                  <span className="leading-snug">{suggestion}</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Continuous Multi-Turn Chat Thread */
          <div className="space-y-6 max-w-3xl mx-auto">
            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex flex-col items-end">
                    <div className="max-w-[88%] sm:max-w-[75%] bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-br-sm text-sm font-medium leading-relaxed shadow-xs">
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 px-1 tabular-nums">
                      {msg.timestamp}
                    </span>
                  </div>
                );
              }

              const res = msg.response;
              const state = uiStates[msg.id] || {
                showDetails: false,
                showChart: false,
                showAllRecords: false,
              };
              const chartRows = res ? buildChartRows(res) : [];
              const chartMax = chartRows.reduce((m, r) => Math.max(m, r.value), 0);
              const recordsBundle = res ? buildRecordsList(res) : { label: "", rows: [] };

              return (
                <div key={msg.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-100 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 rounded-2xl rounded-tl-sm p-4 sm:p-5 space-y-4">
                      {/* Answer Heading + Highlighted Total */}
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                            {msg.title || "Финансов анализ"}
                          </h4>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                            {msg.timestamp}
                          </span>
                        </div>

                        {msg.heroValue && (
                          <div className="flex items-baseline gap-2.5 mt-1.5">
                            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums">
                              {msg.heroValue}
                            </span>
                            {msg.heroSubtitle && (
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                {msg.heroSubtitle}
                              </span>
                            )}
                          </div>
                        )}

                        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mt-2">
                          {res?.answer || msg.text}
                        </p>
                      </div>

                      {/* Found In + Clean Period Metadata */}
                      {((msg.foundIn && msg.foundIn.length > 0) || res?.timeRangeLabel) && (
                        <div className="pt-3 border-t border-slate-200/70 dark:border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {msg.foundIn && msg.foundIn.length > 0 && (
                            <div>
                              <span className="block text-slate-500 dark:text-slate-400 font-medium mb-1">
                                Открити в:
                              </span>
                              <ul className="space-y-0.5 text-slate-800 dark:text-slate-100 font-medium">
                                {msg.foundIn.map((source) => (
                                  <li key={source} className="flex items-center gap-1.5">
                                    <span className="text-indigo-500 dark:text-indigo-400" aria-hidden="true">
                                      •
                                    </span>
                                    <span className="truncate">{source}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {res?.timeRangeLabel && (
                            <div>
                              <span className="block text-slate-500 dark:text-slate-400 font-medium mb-1">
                                Период:
                              </span>
                              <span className="text-slate-800 dark:text-slate-100 font-semibold">
                                {res.timeRangeLabel}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Expandable Details Breakdown */}
                      {state.showDetails && res && (
                        <div className="pt-3 border-t border-slate-200/70 dark:border-slate-700/60 space-y-2 text-xs">
                          <span className="block font-semibold text-slate-700 dark:text-slate-200">
                            Детайлно обобщение
                          </span>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed tabular-nums">
                            {res.calculation}
                          </p>
                          {res.matchedExpenses.length > 0 && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 dark:text-slate-400 pt-1 tabular-nums">
                              <span>
                                Общо намерени: <strong className="text-slate-800 dark:text-slate-200">{res.matchedExpenses.length}</strong>
                              </span>
                              {typeof res.totalMatchedAmount === "number" && res.matchedExpenses.length > 1 && (
                                <span>
                                  Средно на запис:{" "}
                                  <strong className="text-slate-800 dark:text-slate-200">
                                    {fmtEur(res.totalMatchedAmount / res.matchedExpenses.length)}
                                  </strong>
                                </span>
                              )}
                              {activePeriodTotal > 0 && typeof res.totalMatchedAmount === "number" && (
                                <span>
                                  Дял от месечните разходи:{" "}
                                  <strong className="text-slate-800 dark:text-slate-200">
                                    {Math.min(100, (res.totalMatchedAmount / activePeriodTotal) * 100).toFixed(1)}%
                                  </strong>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Expandable Inline Chart */}
                      {state.showChart && chartRows.length > 0 && (
                        <div className="pt-3 border-t border-slate-200/70 dark:border-slate-700/60 space-y-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              Разпределение по стойност
                            </span>
                            <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                              Топ {chartRows.length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {chartRows.map((row) => {
                              const pct = chartMax > 0 ? Math.max(4, (row.value / chartMax) * 100) : 0;
                              return (
                                <div key={row.label} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs gap-2">
                                    <span className="text-slate-700 dark:text-slate-200 font-medium truncate">
                                      {row.label}
                                    </span>
                                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                                      {fmtEur(row.value)}
                                    </span>
                                  </div>
                                  <div className="h-2 w-full rounded-full bg-slate-200/80 dark:bg-slate-700/70 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-300"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Expandable Complete Records List */}
                      {state.showAllRecords && res && (
                        <div className="pt-3 border-t border-slate-200/70 dark:border-slate-700/60 space-y-2">
                          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {recordsBundle.label}
                          </span>
                          {recordsBundle.rows.length === 0 ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Няма записани разходи за този период.
                            </p>
                          ) : (
                            <div className="divide-y divide-slate-200/70 dark:divide-slate-700/60 bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-700/70 max-h-60 overflow-y-auto">
                              {recordsBundle.rows.map((item) => (
                                <div
                                  key={item.id}
                                  className="px-3.5 py-2.5 flex items-start justify-between gap-3 text-xs"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                                      {item.merchantOrCategory}
                                      <span className="font-normal text-slate-500 dark:text-slate-400">
                                        {" "}· {item.categoryName}
                                        {item.date ? ` · ${item.date}` : ""}
                                      </span>
                                    </div>
                                    {item.matchedSnippet && (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                                        {item.matchedSnippet}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0 tabular-nums">
                                    <span className="font-bold text-slate-900 dark:text-white">
                                      {fmtEur(item.matchedAmount)}
                                    </span>
                                    {item.matchedKind === "item" &&
                                      Math.abs(item.expenseAmount - item.matchedAmount) > 0.01 && (
                                        <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                                          бон {fmtEur(item.expenseAmount)}
                                        </span>
                                      )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Quick Follow-Up Actions */}
                      <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/60 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleUiFlag(msg.id, "showDetails")}
                          className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer border ${
                            state.showDetails
                              ? "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          <ListFilter className="w-3.5 h-3.5" />
                          <span>Покажи детайли</span>
                          {state.showDetails ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCompareWithLastMonth(msg)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <GitCompareArrows className="w-3.5 h-3.5" />
                          <span>Сравни с миналия месец</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleUiFlag(msg.id, "showChart")}
                          className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer border ${
                            state.showChart
                              ? "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span>Покажи графика</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleUiFlag(msg.id, "showAllRecords")}
                          className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer border ${
                            state.showAllRecords
                              ? "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Покажи всички записи</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Sticky Prompt Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitChat();
        }}
        className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800"
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus-within:border-indigo-500 dark:focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/15 rounded-2xl p-1.5 sm:p-2 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSubmitChat();
                }
              }}
              placeholder="Попитайте нещо за вашите разходи, приходи, спестявания или статистики..."
              aria-label="Попитайте нещо за вашите разходи, приходи, спестявания или статистики"
              className="flex-1 resize-none bg-transparent px-2.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none max-h-32 leading-relaxed"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Изпрати въпрос"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>
          <p className="hidden sm:block text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 px-2">
            Enter за изпращане · Shift+Enter за нов ред
          </p>
        </div>
      </form>
    </section>
  );
};
