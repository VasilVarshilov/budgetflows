import { MonthlyRecord, IncomeItem, ExpenseItem, ExpenseStatus, ReceiptItemDetail, RepeatFrequency } from "@/types";
import { parseExpenseNote } from "./expenseFormatter";
import { loadBudgets, calculateAllBudgetsStatus } from "./budgetStorage";
import { loadStoredCategories, loadStoredIncomeCategories } from "./categoryStorage";
import { getStoredElectricityHistory } from "./electricityStorage";
import { getExpenseStatus, isRecordCompleted } from "./expenseStatus";
import { isRepeatingFrequency, normalizeRepeatValue } from "./recurrenceEngine";
import {
  computeSavingsAllocationSummary,
  getGoalProgressPercent,
  loadSavingsGoals,
} from "./savingsGoalsStorage";
import { getCalendarEventsForRange, parseLocalDateKey } from "./calendarEngine";
import {
  MONTHS_BG,
  getPreviousMonthAndYear,
  calculateMonthExpenses,
  calculateMonthIncome,
  calculateMonthSavings,
  calculateMonthElectricity,
} from "./comparisonStorage";
import {
  formatLocalizedMonthYear,
  getCurrentLanguage,
  getIntlLocale,
  translateBudgetName,
  translateCategoryName,
  translateGoalName,
} from "@/i18n/helpers";
import type { SupportedLanguage } from "@/i18n/types";

export interface AiChatMatchedExpense {
  id: string;
  monthKey: string;
  date: string;
  merchantOrCategory: string;
  categoryName: string;
  expenseAmount: number;
  matchedAmount: number;
  matchedKind:
    | "item"
    | "note"
    | "merchant"
    | "category"
    | "fixed"
    | "saving"
    | "income"
    | "electricity";
  matchedSnippet?: string;
}

export interface AiChatResponse {
  answer: string;
  calculation: string;
  timeRangeLabel: string;
  matchedExpenses: AiChatMatchedExpense[];
  totalMatchedAmount?: number;
  followUpSuggestions?: string[];
}

interface MonthEntry {
  key: string;
  month: string;
  year: number;
  monthIndex: number;
  record: MonthlyRecord;
}

interface IndexedExpense {
  id: string;
  monthKey: string;
  month: string;
  year: number;
  monthIndex: number;
  date: string;
  isFixed: boolean;
  isRecurring: boolean;
  status: ExpenseStatus;
  categoryId: string;
  categoryName: string;
  merchantName: string;
  note: string;
  amount: number;
  parsedItems: ReceiptItemDetail[];
  unpricedNoteLines: string[];
  rawSearchText: string;
}

interface IndexedIncome {
  id: string;
  monthKey: string;
  month: string;
  year: number;
  monthIndex: number;
  date: string;
  completed: boolean;
  isFixed: boolean;
  isRecurring: boolean;
  repeat: RepeatFrequency;
  categoryId: string;
  categoryName: string;
  note: string;
  amount: number;
}

interface SynonymGroup {
  id: string;
  labelBg: string;
  labelEn: string;
  terms: string[];
}

const SYNONYM_GROUPS: SynonymGroup[] = [
  {
    id: "cigarettes",
    labelBg: "цигари / тютюневи изделия",
    labelEn: "cigarettes / tobacco",
    terms: [
      "цигар",
      "сигар",
      "cigaret",
      "cigar",
      "tobacco",
      "тютюн",
      "iqos",
      "икос",
      "heets",
      "хийтс",
      "terea",
      "тереа",
      "vape",
      "вейп",
      "glo",
      "гло",
      "marlboro",
      "марлборо",
      "karelia",
      "карелия",
      "parliament",
      "парламент",
      "dunhill",
      "дънхил",
      "kent",
      "кент",
      "winston",
      "уинстън",
      "sobranie",
      "собрание",
      "davidoff",
      "давидоф",
      "rothmans",
      "ротманс",
      "camel",
      "lucky strike",
      "victory",
      "виктори",
      "никотин",
      "nicotine",
    ],
  },
  {
    id: "coffee",
    labelBg: "кафе и кафе напитки",
    labelEn: "coffee",
    terms: [
      "кафе",
      "coffee",
      "espresso",
      "еспресо",
      "cappuccino",
      "капучино",
      "latte",
      "лате",
      "nescafe",
      "нескафе",
      "lavazza",
      "лаваца",
      "jacobs",
      "якобс",
      "illy",
      "starbucks",
      "costa",
      "macchiato",
      "макиато",
      "americano",
      "американо",
      "кафене",
      "café",
    ],
  },
  {
    id: "fuel",
    labelBg: "гориво",
    labelEn: "fuel",
    terms: [
      "горив",
      "fuel",
      "бензин",
      "дизел",
      "газ",
      "petrol",
      "diesel",
      "gasoline",
      "lpg",
      "cng",
      "shell",
      "шел",
      "omv",
      "омв",
      "lukoil",
      "лукойл",
      "eko",
      "еко",
      "rompetrol",
      "ромпетрол",
      "gazprom",
      "газпром",
      "бензиностанц",
      "зареждане",
    ],
  },
  {
    id: "food",
    labelBg: "храна и хранителни стоки",
    labelEn: "food / groceries",
    terms: [
      "храна",
      "хранител",
      "food",
      "grocer",
      "супермаркет",
      "supermarket",
    ],
  },
  {
    id: "alcohol",
    labelBg: "алкохол / напитки",
    labelEn: "alcohol / beer / wine",
    terms: [
      "алкохол",
      "alcohol",
      "бира",
      "beer",
      "вино",
      "wine",
      "уиски",
      "whisky",
      "whiskey",
      "водка",
      "vodka",
      "ракия",
      "rakia",
    ],
  },
  {
    id: "restaurant",
    labelBg: "ресторанти и заведения",
    labelEn: "restaurants / dining",
    terms: [
      "ресторант",
      "restaurant",
      "dining",
      "обяд",
      "вечеря",
      "lunch",
      "dinner",
      "pizza",
      "пица",
      "happy",
      "хепи",
      "kfc",
      "mcdonald",
      "макдоналдс",
      "дюнер",
      "бургер",
      "burger",
    ],
  },
  {
    id: "pharmacy",
    labelBg: "аптека и лекарства",
    labelEn: "pharmacy / medicine",
    terms: [
      "аптека",
      "pharmacy",
      "лекарств",
      "медикамент",
      "medicine",
      "хапчет",
      "витамин",
      "sopharmacy",
      "софармаси",
      "subra",
      "субра",
      "remedium",
      "ремедиум",
    ],
  },
  {
    id: "electricity",
    labelBg: "ток / електроенергия",
    labelEn: "electricity",
    terms: [
      "ток",
      "електроенерг",
      "електро",
      "electric",
      "evn",
      "евн",
      "energo",
      "енерго",
      "kwh",
      "квт",
    ],
  },
  {
    id: "lidl",
    labelBg: "Lidl",
    labelEn: "Lidl",
    terms: ["lidl", "лидл", "лидъл"],
  },
  {
    id: "kaufland",
    labelBg: "Kaufland",
    labelEn: "Kaufland",
    terms: ["kaufland", "кауфланд"],
  },
  {
    id: "billa",
    labelBg: "Billa",
    labelEn: "Billa",
    terms: ["billa", "билла", "била"],
  },
  {
    id: "fantastico",
    labelBg: "Fantastico",
    labelEn: "Fantastico",
    terms: ["fantastico", "фантастико"],
  },
];

const MONTHS_EN_TO_IDX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const MONTHS_BG_LOWER_TO_IDX: Record<string, number> = {
  януари: 0,
  яну: 0,
  февруари: 1,
  фев: 1,
  март: 2,
  мар: 2,
  април: 3,
  апр: 3,
  май: 4,
  юни: 5,
  юли: 6,
  август: 7,
  авг: 7,
  септември: 8,
  сеп: 8,
  октомври: 9,
  окт: 9,
  ноември: 10,
  ное: 10,
  декември: 11,
  дек: 11,
};

const MONTHS_ES_TO_IDX: Record<string, number> = {
  enero: 0,
  ene: 0,
  febrero: 1,
  feb: 1,
  marzo: 2,
  mar: 2,
  abril: 3,
  abr: 3,
  mayo: 4,
  junio: 5,
  jun: 5,
  julio: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  septiembre: 8,
  setiembre: 8,
  sep: 8,
  octubre: 9,
  oct: 9,
  noviembre: 10,
  nov: 10,
  diciembre: 11,
  dic: 11,
};

const STOP_WORDS = new Set([
  // English question/filler words
  "how",
  "much",
  "many",
  "did",
  "do",
  "does",
  "was",
  "were",
  "is",
  "are",
  "have",
  "has",
  "i",
  "me",
  "my",
  "money",
  "spent",
  "spend",
  "spending",
  "pay",
  "paid",
  "cost",
  "on",
  "in",
  "at",
  "for",
  "from",
  "to",
  "of",
  "the",
  "a",
  "an",
  "about",
  "what",
  "which",
  "when",
  "where",
  "show",
  "tell",
  "find",
  "total",
  "this",
  "last",
  "current",
  "selected",
  "month",
  "months",
  "year",
  "years",
  "all",
  "time",
  "compared",
  "compare",
  "during",
  "past",
  "with",
  "and",
  "or",
  // Bulgarian question/filler words
  "колко",
  "каква",
  "какъв",
  "какво",
  "какви",
  "кои",
  "кой",
  "коя",
  "кое",
  "пари",
  "похарчих",
  "похарчил",
  "похарчила",
  "похарчи",
  "похарча",
  "харча",
  "похарчено",
  "похарчени",
  "платих",
  "платил",
  "платила",
  "платя",
  "съм",
  "ще",
  "струва",
  "за",
  "в",
  "във",
  "на",
  "от",
  "до",
  "с",
  "със",
  "по",
  "през",
  "този",
  "тази",
  "тези",
  "миналия",
  "миналата",
  "предходния",
  "текущия",
  "избрания",
  "месец",
  "месеца",
  "месеци",
  "година",
  "годината",
  "общо",
  "всички",
  "спрямо",
  "има",
  "имам",
  "имаме",
  "ми",
  "си",
  "са",
  "е",
  "ли",
  "се",
  "покажи",
  "намери",
  "кажи",
  "дай",
  "разход",
  "разходи",
  "разходите",
  "сума",
  "цената",
  // Month words
  ...Object.keys(MONTHS_EN_TO_IDX),
  ...Object.keys(MONTHS_BG_LOWER_TO_IDX),
  ...Object.keys(MONTHS_ES_TO_IDX),
  // Spanish question/filler words
  "cuánto",
  "cuanto",
  "qué",
  "que",
  "cuál",
  "cual",
  "gasté",
  "gaste",
  "gasto",
  "gastos",
  "ingreso",
  "ingresos",
  "ahorro",
  "ahorros",
  "este",
  "esta",
  "mes",
  "meses",
  "año",
  "años",
  "pasado",
  "último",
  "ultimo",
  "últimos",
  "ultimos",
  "próxima",
  "proxima",
  "próximo",
  "proximo",
  "próximos",
  "proximos",
  "semana",
  "todos",
  "todas",
  "mostrar",
  "tengo",
  "de",
  "del",
  "en",
  "el",
  "la",
  "los",
  "las",
  "por",
  "para",
  "mi",
  "mis",
  "se",
  "me",
  "con",
  "sin",
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[?!¡¿.,;:"'()[\]{}«»„“]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEnglishQuery(question: string, preferredLang?: SupportedLanguage): boolean {
  const latCount = (question.match(/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g) || []).length;
  const cyrCount = (question.match(/[а-яА-Я]/g) || []).length;
  if (latCount !== cyrCount) return latCount > cyrCount;
  return (preferredLang ?? getCurrentLanguage()) !== "bg";
}

function parseMonthEntries(monthlyData: Record<string, MonthlyRecord>): MonthEntry[] {
  const entries: MonthEntry[] = [];
  Object.entries(monthlyData || {}).forEach(([key, record]) => {
    const parts = key.trim().split(/\s+/);
    if (parts.length < 2) return;
    const month = parts[0];
    const year = parseInt(parts[1], 10);
    const monthIndex = MONTHS_BG.indexOf(month);
    if (isNaN(year) || monthIndex === -1 || !record) return;
    entries.push({ key, month, year, monthIndex, record });
  });
  entries.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex));
  return entries;
}

function parseSelectedMonthFallback(
  selectedMonth: string | undefined,
  entries: MonthEntry[]
): { month: string; year: number; monthIndex: number; key: string } {
  if (selectedMonth) {
    const parts = selectedMonth.trim().split(/\s+/);
    const m = parts[0];
    const y = parseInt(parts[1], 10);
    const idx = MONTHS_BG.indexOf(m);
    if (!isNaN(y) && idx !== -1) {
      return { month: m, year: y, monthIndex: idx, key: `${m} ${y}` };
    }
  }
  const now = new Date();
  const curIdx = now.getMonth();
  const curMonth = MONTHS_BG[curIdx];
  const curYear = now.getFullYear();
  const curKey = `${curMonth} ${curYear}`;
  if (entries.some((e) => e.key === curKey) || entries.length === 0) {
    return { month: curMonth, year: curYear, monthIndex: curIdx, key: curKey };
  }
  const latest = entries[entries.length - 1];
  return {
    month: latest.month,
    year: latest.year,
    monthIndex: latest.monthIndex,
    key: latest.key,
  };
}

function buildIndexedExpenses(entries: MonthEntry[]): IndexedExpense[] {
  const result: IndexedExpense[] = [];

  const pushItem = (
    entry: MonthEntry,
    item: ExpenseItem,
    isFixed: boolean,
    idxFallback: number
  ) => {
    const parsed = parseExpenseNote(item.note, item.merchantName, item.receiptItems);
    const noteText = (item.note || "").trim();
    const merchant = (parsed.merchantName || item.merchantName || "").trim();

    // Extract unpriced lines from multi-line notes (e.g. "Lidl €42\nBread\nWater\nCigarettes")
    const unpricedNoteLines: string[] = [];
    if (noteText) {
      noteText.split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) return;
        const alreadyPriced = /\d+[.,]\d{2}/.test(line);
        if (!alreadyPriced) {
          unpricedNoteLines.push(line);
        }
      });
    }

    const itemsSearchParts = parsed.items.map((it) => it.name);
    const rawSearchText = [
      item.categoryName,
      merchant,
      noteText,
      ...itemsSearchParts,
    ]
      .filter(Boolean)
      .join(" | ");

    result.push({
      id: item.id || `${entry.key}_${isFixed ? "fix" : "var"}_${idxFallback}`,
      monthKey: entry.key,
      month: entry.month,
      year: entry.year,
      monthIndex: entry.monthIndex,
      date: item.date || `${entry.year}-${String(entry.monthIndex + 1).padStart(2, "0")}-01`,
      isFixed: isFixed || isRepeatingFrequency(item.repeat),
      isRecurring: isRepeatingFrequency(item.repeat) || isFixed,
      status: getExpenseStatus(item),
      categoryId: item.categoryId || "",
      categoryName: item.categoryName || "Други",
      merchantName: merchant,
      note: noteText,
      amount: Number(item.amount) || 0,
      parsedItems: parsed.items.map((it) => ({
        ...it,
        price: Number(it.finalPrice ?? it.price) || 0,
      })),
      unpricedNoteLines,
      rawSearchText,
    });
  };

  entries.forEach((entry) => {
    const exp = entry.record.expenses;
    if (!exp) return;

    if (Array.isArray(exp.fixed_expenses)) {
      exp.fixed_expenses.forEach((item, idx) => pushItem(entry, item, true, idx));
    } else if (exp.fixed_expenses) {
      const leg = exp.fixed_expenses as any;
      if (leg.credit_eur > 0) {
        pushItem(
          entry,
          {
            id: `${entry.key}_leg_credit`,
            categoryId: "credit",
            categoryName: "Кредит",
            categoryIcon: "CreditCard",
            categoryColor: "",
            amount: Number(leg.credit_eur),
            date: `${entry.year}-${String(entry.monthIndex + 1).padStart(2, "0")}-01`,
            isRecurring: true,
          },
          true,
          0
        );
      }
      if (leg.phone_eur > 0) {
        pushItem(
          entry,
          {
            id: `${entry.key}_leg_phone`,
            categoryId: "phone",
            categoryName: "Телефон",
            categoryIcon: "Smartphone",
            categoryColor: "",
            amount: Number(leg.phone_eur),
            date: `${entry.year}-${String(entry.monthIndex + 1).padStart(2, "0")}-01`,
            isRecurring: true,
          },
          true,
          1
        );
      }
      if (leg.internet_eur > 0) {
        pushItem(
          entry,
          {
            id: `${entry.key}_leg_net`,
            categoryId: "internet",
            categoryName: "Интернет",
            categoryIcon: "Wifi",
            categoryColor: "",
            amount: Number(leg.internet_eur),
            date: `${entry.year}-${String(entry.monthIndex + 1).padStart(2, "0")}-01`,
            isRecurring: true,
          },
          true,
          2
        );
      }
    }

    if (Array.isArray(exp.additional_expenses)) {
      exp.additional_expenses.forEach((item, idx) => pushItem(entry, item, false, idx));
    }
  });

  return result;
}

function buildIndexedIncomes(entries: MonthEntry[]): IndexedIncome[] {
  const result: IndexedIncome[] = [];
  const seen = new Set<string>();

  entries.forEach((entry) => {
    const incomes = entry.record.incomes;
    if (!Array.isArray(incomes)) return;
    incomes.forEach((inc, idx) => {
      if (!inc || inc.type === "expense") return;
      const id = inc.id || `${entry.key}_inc_${idx}`;
      if (seen.has(id)) return;
      seen.add(id);
      const repeat = normalizeRepeatValue(inc.repeat);
      const isFixed = isRepeatingFrequency(repeat);
      result.push({
        id,
        monthKey: entry.key,
        month: entry.month,
        year: entry.year,
        monthIndex: entry.monthIndex,
        date: inc.date || `${entry.year}-${String(entry.monthIndex + 1).padStart(2, "0")}-01`,
        completed: isRecordCompleted(inc),
        isFixed,
        isRecurring: isFixed,
        repeat,
        categoryId: inc.categoryId || "",
        categoryName: inc.categoryName || "Приход",
        note: (inc.note || "").trim(),
        amount: Number(inc.amount) || 0,
      });
    });
  });

  return result;
}

interface ResolvedTimeRange {
  kind: "single_month" | "last_n_months" | "year" | "all_months";
  label: string;
  entries: MonthEntry[];
  targetMonth?: { month: string; year: number; monthIndex: number; key: string };
  lastNCount?: number;
}

function parseQueryTimeRange(
  question: string,
  entries: MonthEntry[],
  activeMonth: { month: string; year: number; monthIndex: number; key: string },
  defaultToAll: boolean,
  en = false,
  preferredLang?: SupportedLanguage
): ResolvedTimeRange {
  const norm = normalizeText(question);
  const tokens = norm.split(" ");
  const lang: SupportedLanguage = !en ? "bg" : preferredLang === "es" ? "es" : "en";

  // Explicit year check (e.g. 2025, 2026)
  const yearMatch = norm.match(/\b(20\d{2})\b/);
  const explicitYear = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  // 1. "last N months" / "последните N месеца" / "últimos N meses"
  const lastNMatch =
    norm.match(/(?:last|past)\s+(\d{1,2})\s+months?/) ||
    norm.match(/(?:ultimos|últimos|pasados)\s+(\d{1,2})\s+mes(?:es)?/) ||
    norm.match(/(?:последните|миналите)\s+(\d{1,2})\s+(?:месец|месеца|месеци)/);
  if (lastNMatch) {
    const n = Math.max(1, Math.min(36, parseInt(lastNMatch[1], 10)));
    const anchor = activeMonth;
    const anchorAbs = anchor.year * 12 + anchor.monthIndex;
    const minAbs = anchorAbs - (n - 1);
    const matchingEntries = entries.filter((e) => {
      const abs = e.year * 12 + e.monthIndex;
      return abs >= minAbs && abs <= anchorAbs;
    });
    const startYear = Math.floor(minAbs / 12);
    const startIdx = ((minAbs % 12) + 12) % 12;
    const startLabel = formatLocalizedMonthYear(`${MONTHS_BG[startIdx]} ${startYear}`, lang);
    const anchorLabel = formatLocalizedMonthYear(`${anchor.month} ${anchor.year}`, lang);
    return {
      kind: "last_n_months",
      label:
        lang === "es"
          ? `Últimos ${n} meses (${startLabel} – ${anchorLabel})`
          : en
          ? `Last ${n} months (${startLabel} – ${anchorLabel})`
          : `Последните ${n} месеца (${startLabel} – ${anchorLabel})`,
      entries: matchingEntries,
      lastNCount: n,
    };
  }

  // 2. "all time" / "all months" / "всички месеци" / "todos los meses"
  if (
    /\b(?:all\s*time|all\s*months|overall|ever|total\s*history|todos\s+los\s+meses|todo\s+el\s+tiempo|всички\s*месеци|от\s*началото|цялата\s*история)\b/.test(
      norm
    )
  ) {
    return {
      kind: "all_months",
      label:
        lang === "es"
          ? `Todos los meses (${entries.length})`
          : en
          ? `All months (${entries.length})`
          : `Всички месеци (${entries.length})`,
      entries,
    };
  }

  // 3. Specific month name (EN, BG or ES)
  let detectedMonthIdx: number | undefined;
  for (const t of tokens) {
    if (t in MONTHS_EN_TO_IDX) {
      detectedMonthIdx = MONTHS_EN_TO_IDX[t];
      break;
    }
    if (t in MONTHS_BG_LOWER_TO_IDX) {
      detectedMonthIdx = MONTHS_BG_LOWER_TO_IDX[t];
      break;
    }
    if (t in MONTHS_ES_TO_IDX) {
      detectedMonthIdx = MONTHS_ES_TO_IDX[t];
      break;
    }
  }
  if (detectedMonthIdx !== undefined) {
    const mName = MONTHS_BG[detectedMonthIdx];
    let targetYear = explicitYear ?? activeMonth.year;
    if (!explicitYear) {
      const matchingYears = entries
        .filter((e) => e.monthIndex === detectedMonthIdx)
        .sort((a, b) => b.year - a.year);
      if (
        !entries.some((e) => e.monthIndex === detectedMonthIdx && e.year === targetYear) &&
        matchingYears.length > 0
      ) {
        targetYear = matchingYears[0].year;
      }
    }
    const key = `${mName} ${targetYear}`;
    return {
      kind: "single_month",
      label: formatLocalizedMonthYear(key, lang),
      entries: entries.filter((e) => e.key === key),
      targetMonth: { month: mName, year: targetYear, monthIndex: detectedMonthIdx, key },
    };
  }

  // 4. "last month" / "previous month" / "миналия месец" / "mes pasado"
  const isComparedToLastMonth =
    /(?:compar|more\s+than|vs|спрямо|от\s+миналия|frente\s+al|respecto\s+al)/.test(norm);
  if (
    !isComparedToLastMonth &&
    /(?:\b(?:last|previous)\s+month\b|\bmes\s+pasado\b|\bmes\s+anterior\b|миналия\s+месец|предходния\s+месец)/.test(
      norm
    )
  ) {
    const prev = getPreviousMonthAndYear(activeMonth.month, activeMonth.year);
    const key = `${prev.prevMonth} ${prev.prevYear}`;
    return {
      kind: "single_month",
      label: formatLocalizedMonthYear(key, lang),
      entries: entries.filter((e) => e.key === key),
      targetMonth: {
        month: prev.prevMonth,
        year: prev.prevYear,
        monthIndex: MONTHS_BG.indexOf(prev.prevMonth),
        key,
      },
    };
  }

  // 5. "this month" / "current month" / "selected month" / "este mes" / "този месец"
  if (
    /(?:\b(?:this|current|selected)\s+month\b|\beste\s+mes\b|\bmes\s+actual\b|този\s+месец|текущия\s+месец|настоящия\s+месец|избрания\s+месец)/.test(
      norm
    )
  ) {
    return {
      kind: "single_month",
      label: formatLocalizedMonthYear(activeMonth.key, lang),
      entries: entries.filter((e) => e.key === activeMonth.key),
      targetMonth: activeMonth,
    };
  }

  // 6. "this year" / "last year" / explicit year
  if (/(?:\bthis\s+year\b|\beste\s+a[nñ]o\b|тази\s+година|текущата\s+година)/.test(norm)) {
    const y = new Date().getFullYear();
    const yearEntries = entries.filter((e) => e.year === y);
    return {
      kind: "year",
      label: en ? `${y}` : `${y} г.`,
      entries: yearEntries,
    };
  }
  if (/(?:\blast\s+year\b|\ba[nñ]o\s+pasado\b|миналата\s+година)/.test(norm)) {
    const y = new Date().getFullYear() - 1;
    const yearEntries = entries.filter((e) => e.year === y);
    return {
      kind: "year",
      label: en ? `${y}` : `${y} г.`,
      entries: yearEntries,
    };
  }
  if (explicitYear) {
    const yearEntries = entries.filter((e) => e.year === explicitYear);
    return {
      kind: "year",
      label: en ? `${explicitYear}` : `${explicitYear} г.`,
      entries: yearEntries,
    };
  }

  // 7. Default fallback
  if (defaultToAll) {
    return {
      kind: "all_months",
      label:
        entries.length > 0
          ? lang === "es"
            ? `Todos los meses (${entries.length})`
            : en
            ? `All months (${entries.length})`
            : `Всички месеци (${entries.length})`
          : formatLocalizedMonthYear(activeMonth.key, lang),
      entries,
    };
  }
  return {
    kind: "single_month",
    label: formatLocalizedMonthYear(activeMonth.key, lang),
    entries: entries.filter((e) => e.key === activeMonth.key),
    targetMonth: activeMonth,
  };
}

function extractSearchTermsFromQuestion(question: string, en = false): {
  terms: string[];
  matchedGroups: SynonymGroup[];
  displayTopic: string;
} {
  const norm = normalizeText(question);
  const rawTokens = norm.split(" ").filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  const matchedGroups: SynonymGroup[] = [];
  const expandedTerms = new Set<string>();

  for (const group of SYNONYM_GROUPS) {
    const hit =
      group.terms.some((term) => norm.includes(term)) ||
      rawTokens.some((tok) =>
        group.terms.some((term) => tok.includes(term) || term.includes(tok))
      );
    if (hit) {
      matchedGroups.push(group);
      group.terms.forEach((t) => expandedTerms.add(t));
    }
  }

  rawTokens.forEach((tok) => {
    expandedTerms.add(tok);
    // Light plural/stem helper for English & Bulgarian suffixes
    if (tok.length > 4 && tok.endsWith("s")) {
      expandedTerms.add(tok.slice(0, -1));
    }
    if (tok.length > 5 && (tok.endsWith("ове") || tok.endsWith("еве"))) {
      expandedTerms.add(tok.slice(0, -3));
    } else if (tok.length > 4 && (tok.endsWith("ов") || tok.endsWith("ев"))) {
      expandedTerms.add(tok.slice(0, -2));
    } else if (tok.length > 4 && tok.endsWith("и")) {
      expandedTerms.add(tok.slice(0, -1));
    }
  });

  const displayTopic =
    matchedGroups.length > 0
      ? matchedGroups.map((g) => (en ? g.labelEn : g.labelBg)).join(", ")
      : rawTokens.join(" ");

  return {
    terms: Array.from(expandedTerms),
    matchedGroups,
    displayTopic: displayTopic || question.trim(),
  };
}

function textMatchesAnyTerm(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => {
    if (!term) return false;
    if (term.length <= 3) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?:^|[^а-яА-Яa-zA-Z0-9])${escaped}`, "i");
      return re.test(lower);
    }
    return lower.includes(term);
  });
}

function fmtEur(n: number): string {
  return `€${n.toFixed(2)}`;
}

function formatDateShort(iso: string, en = false, langOverride?: SupportedLanguage): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const locLang: SupportedLanguage = langOverride ?? (en ? "en" : "bg");
  return d.toLocaleDateString(getIntlLocale(locLang));
}

function buildSuggestions(en: boolean, langOverride?: SupportedLanguage): string[] {
  if (langOverride === "es") {
    return [
      "¿Qué pagos vencen la próxima semana?",
      "¿Qué ingresos se esperan este mes?",
      "Mostrar próximos gastos recurrentes.",
      "¿Cuánto ahorro sin asignar tengo?",
      "¿Qué porcentaje de mi fondo de emergencia está completo?",
      "¿Qué categoría me cuesta más?",
    ];
  }
  return en
    ? [
        "What payments are coming next week?",
        "What income is expected this month?",
        "Show upcoming recurring expenses.",
        "How much unallocated savings do I have?",
        "What percentage of my Emergency Fund goal is completed?",
        "How much have I spent this month?",
      ]
    : [
        "Какви плащания предстоят следващата седмица?",
        "Какви приходи се очакват този месец?",
        "Покажи предстоящите повтарящи се разходи.",
        "Колко неразпределени спестявания имам?",
        "Колко процента от аварийния фонд е изпълнен?",
        "Колко съм похарчил този месец?",
      ];
}

export function answerFinancialChatQuestion(
  question: string,
  monthlyData: Record<string, MonthlyRecord>,
  globalSavings: IncomeItem[],
  selectedMonth?: string,
  preferredLang?: SupportedLanguage
): AiChatResponse {
  const trimmed = question.trim();
  const en = isEnglishQuery(trimmed, preferredLang);
  const lang: SupportedLanguage = !en ? "bg" : preferredLang === "es" ? "es" : "en";
  const tr = (bgText: string, enText: string, esText: string) =>
    lang === "bg" ? bgText : lang === "es" ? esText : enText;
  const tCat = (name: string) => translateCategoryName(name, lang);
  const norm = normalizeText(trimmed);

  const entries = parseMonthEntries(monthlyData);
  const activeMonth = parseSelectedMonthFallback(selectedMonth, entries);
  const allExpenses = buildIndexedExpenses(entries);
  const completedExpenses = allExpenses.filter((e) => e.status === "completed");
  const plannedExpenses = allExpenses.filter((e) => e.status === "planned");
  const allIncomes = buildIndexedIncomes(entries);
  const completedIncomes = allIncomes.filter((i) => i.completed);
  const upcomingIncomes = allIncomes.filter((i) => !i.completed);
  const storedCategories = loadStoredCategories();
  const storedIncomeCategories = loadStoredIncomeCategories();
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
  const electricityHistory = getStoredElectricityHistory();

  if (!trimmed) {
    return {
      answer: tr(
        "Моля, въведете въпрос за вашите разходи, касови бележки, спестявания, бюджети или приходи.",
        "Please enter a question about your expenses, receipts, savings, budgets, or income.",
        "Por favor, introduce una pregunta sobre tus gastos, recibos, ahorros, presupuestos o ingresos."
      ),
      calculation: "—",
      timeRangeLabel: formatLocalizedMonthYear(activeMonth.key, lang),
      matchedExpenses: [],
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 00A: Savings Goals ("Jars"), Emergency Fund & Unallocated Savings
  // ------------------------------------------------------------------
  const savingsGoals = loadSavingsGoals();
  const activeGoals = savingsGoals.filter((g) => !g.archived);
  const normalizedGoalLookup = activeGoals.map((g) => ({
    goal: g,
    normName: normalizeText(g.name),
  }));
  const matchedGoalByName = normalizedGoalLookup.find(
    ({ normName }) => normName.length >= 3 && norm.includes(normName)
  )?.goal;

  const isEmergencyFundQuery =
    /(?:emergency\s*fund|fondo\s+de\s+emergencia|авариен\s*фонд|аварийния\s*фонд|авариен\s*резерв|буфер|months?\s+(?:does|can|will).*cover|месеца\s+покрива)/.test(
      norm
    );
  const isUnallocatedSavingsQuery =
    /(?:unallocated|free\s*savings|sin\s+asignar|неразпределен|свободн[иа]\s+спестявани)/.test(
      norm
    );
  const isGoalsGenericQuery =
    /(?:savings\s*goals?|jars?|metas?\s+de\s+ahorro|huchas?|цел[иа]?\s*(?:за\s+)?спестяван|касичк)/.test(
      norm
    );

  if (
    isEmergencyFundQuery ||
    isUnallocatedSavingsQuery ||
    isGoalsGenericQuery ||
    Boolean(matchedGoalByName)
  ) {
    const summary = computeSavingsAllocationSummary(globalSavings, savingsGoals, monthlyData);
    const goalMatchedEntries = (goalList = activeGoals): AiChatMatchedExpense[] =>
      goalList.map((g) => {
        const pct = getGoalProgressPercent(g);
        const goalDisplay = translateGoalName(g.name, g.isEmergencyFund, lang);
        return {
          id: g.id,
          monthKey: tr("Цели за спестяване", "Savings goals", "Metas de ahorro"),
          date: formatDateShort(g.updatedAt, en, lang),
          merchantOrCategory: goalDisplay,
          categoryName: g.isEmergencyFund
            ? translateGoalName("Авариен фонд", true, lang)
            : tr("Спестовна цел", "Savings goal", "Meta de ahorro"),
          expenseAmount: g.targetAmount,
          matchedAmount: g.allocatedAmount,
          matchedKind: "saving",
          matchedSnippet: `${tr("Цел", "Target", "Objetivo")}: ${fmtEur(g.targetAmount)} · ${pct.toFixed(1)}%${
            g.description ? ` · ${g.description}` : ""
          }`,
        };
      });

    if (isEmergencyFundQuery && (!matchedGoalByName || matchedGoalByName.isEmergencyFund)) {
      const ef = summary.emergencyFundGoal;
      if (!ef) {
        return {
          answer: tr(
            `Все още нямате създаден активен „Авариен фонд“. Имате ${fmtEur(summary.unallocatedSavings)} неразпределени спестявания (ср. месечни разходи: ${fmtEur(summary.averageMonthlyExpenses)}).`,
            `You do not have an active Emergency Fund goal yet. You have ${fmtEur(summary.unallocatedSavings)} in unallocated savings (Average Monthly Expenses: ${fmtEur(summary.averageMonthlyExpenses)}).`,
            `Todavía no tienes un Fondo de emergencia activo. Tienes ${fmtEur(summary.unallocatedSavings)} en ahorros sin asignar (gasto mensual medio: ${fmtEur(summary.averageMonthlyExpenses)}).`
          ),
          calculation: tr(
            `Авариен фонд: €0.00 | Ср. месечни разходи: ${fmtEur(summary.averageMonthlyExpenses)}`,
            `Emergency Fund: €0.00 | Avg. monthly expenses: ${fmtEur(summary.averageMonthlyExpenses)}`,
            `Fondo de emergencia: €0.00 | Gasto mensual medio: ${fmtEur(summary.averageMonthlyExpenses)}`
          ),
          timeRangeLabel: tr("Спестовни цели", "Savings goals", "Metas de ahorro"),
          matchedExpenses: [],
          totalMatchedAmount: 0,
          followUpSuggestions: buildSuggestions(en, lang),
        };
      }

      const pct = getGoalProgressPercent(ef);
      const efDisplay = translateGoalName(ef.name, ef.isEmergencyFund, lang);
      const coverageStr =
        summary.emergencyCoverageMonths !== null
          ? tr(
              `${summary.emergencyCoverageMonths.toFixed(1)} месеца разходи`,
              `${summary.emergencyCoverageMonths.toFixed(1)} months of expenses`,
              `${summary.emergencyCoverageMonths.toFixed(1)} meses de gastos`
            )
          : tr(
              "няма записани изпълнени разходи",
              "N/A (no completed expenses recorded)",
              "N/D (sin gastos completados registrados)"
            );

      return {
        answer: tr(
          `Вашият „${efDisplay}“ е изпълнен на ${pct.toFixed(1)}% (${fmtEur(ef.allocatedAmount)} от цел ${fmtEur(ef.targetAmount)}). Покрива ${coverageStr} (при средни месечни разходи ${fmtEur(summary.averageMonthlyExpenses)}).`,
          `Your Emergency Fund ("${efDisplay}") is ${pct.toFixed(1)}% completed (${fmtEur(ef.allocatedAmount)} of ${fmtEur(ef.targetAmount)}). It currently covers ${coverageStr} (avg. monthly expenses: ${fmtEur(summary.averageMonthlyExpenses)}).`,
          `Tu Fondo de emergencia ("${efDisplay}") está completado al ${pct.toFixed(1)}% (${fmtEur(ef.allocatedAmount)} de ${fmtEur(ef.targetAmount)}). Actualmente cubre ${coverageStr} (gasto mensual medio: ${fmtEur(summary.averageMonthlyExpenses)}).`
        ),
        calculation: tr(
          `${fmtEur(ef.allocatedAmount)} ÷ ${fmtEur(ef.targetAmount)} = ${pct.toFixed(1)}% | Покритие: ${coverageStr}`,
          `${fmtEur(ef.allocatedAmount)} ÷ ${fmtEur(ef.targetAmount)} = ${pct.toFixed(1)}% | Coverage: ${coverageStr}`,
          `${fmtEur(ef.allocatedAmount)} ÷ ${fmtEur(ef.targetAmount)} = ${pct.toFixed(1)}% | Cobertura: ${coverageStr}`
        ),
        timeRangeLabel: efDisplay,
        matchedExpenses: goalMatchedEntries([ef]),
        totalMatchedAmount: ef.allocatedAmount,
        followUpSuggestions: buildSuggestions(en, lang),
      };
    }

    if (isUnallocatedSavingsQuery) {
      return {
        answer: tr(
          `Имате ${fmtEur(summary.unallocatedSavings)} неразпределени спестявания от общо ${fmtEur(summary.totalSavings)} (${fmtEur(summary.totalAllocated)} разпределени в ${activeGoals.length} цели).`,
          `You have ${fmtEur(summary.unallocatedSavings)} in unallocated savings out of ${fmtEur(summary.totalSavings)} total savings (${fmtEur(summary.totalAllocated)} allocated across ${activeGoals.length} goals).`,
          `Tienes ${fmtEur(summary.unallocatedSavings)} en ahorros sin asignar de un total de ${fmtEur(summary.totalSavings)} (${fmtEur(summary.totalAllocated)} asignados en ${activeGoals.length} metas).`
        ),
        calculation: tr(
          `Общо ${fmtEur(summary.totalSavings)} - Разпределени ${fmtEur(summary.totalAllocated)} = Неразпределени ${fmtEur(summary.unallocatedSavings)}`,
          `Total ${fmtEur(summary.totalSavings)} − Allocated ${fmtEur(summary.totalAllocated)} = Unallocated ${fmtEur(summary.unallocatedSavings)}`,
          `Total ${fmtEur(summary.totalSavings)} − Asignado ${fmtEur(summary.totalAllocated)} = Sin asignar ${fmtEur(summary.unallocatedSavings)}`
        ),
        timeRangeLabel: tr("Спестявания и цели", "Savings & goals", "Ahorros y metas"),
        matchedExpenses: goalMatchedEntries(),
        totalMatchedAmount: summary.unallocatedSavings,
        followUpSuggestions: buildSuggestions(en, lang),
      };
    }

    if (matchedGoalByName) {
      const pct = getGoalProgressPercent(matchedGoalByName);
      const remaining = Math.max(
        0,
        matchedGoalByName.targetAmount - matchedGoalByName.allocatedAmount
      );
      const goalDisplay = translateGoalName(
        matchedGoalByName.name,
        matchedGoalByName.isEmergencyFund,
        lang
      );
      return {
        answer: tr(
          `Заделили сте ${fmtEur(matchedGoalByName.allocatedAmount)} за „${goalDisplay}“ от цел ${fmtEur(matchedGoalByName.targetAmount)} (${pct.toFixed(1)}% изпълнение, остават ${fmtEur(remaining)}).`,
          `You have saved ${fmtEur(matchedGoalByName.allocatedAmount)} for "${goalDisplay}" out of a ${fmtEur(matchedGoalByName.targetAmount)} target (${pct.toFixed(1)}% completed, ${fmtEur(remaining)} remaining).`,
          `Has ahorrado ${fmtEur(matchedGoalByName.allocatedAmount)} para "${goalDisplay}" de un objetivo de ${fmtEur(matchedGoalByName.targetAmount)} (${pct.toFixed(1)}% completado, faltan ${fmtEur(remaining)}).`
        ),
        calculation: `${fmtEur(matchedGoalByName.allocatedAmount)} / ${fmtEur(matchedGoalByName.targetAmount)} = ${pct.toFixed(1)}% (${tr("остават", "remaining", "restante")} ${fmtEur(remaining)})`,
        timeRangeLabel: `${tr("Цел", "Goal", "Meta")}: ${goalDisplay}`,
        matchedExpenses: goalMatchedEntries([matchedGoalByName]),
        totalMatchedAmount: matchedGoalByName.allocatedAmount,
        followUpSuggestions: buildSuggestions(en, lang),
      };
    }

    return {
      answer:
        activeGoals.length > 0
          ? tr(
              `В ${activeGoals.length} активни цели сте разпределили ${fmtEur(summary.totalAllocated)} от общо ${fmtEur(summary.totalSavings)} спестявания (неразпределени: ${fmtEur(summary.unallocatedSavings)}).`,
              `Across ${activeGoals.length} savings goals you have allocated ${fmtEur(summary.totalAllocated)} out of ${fmtEur(summary.totalSavings)} total savings (${fmtEur(summary.unallocatedSavings)} unallocated).`,
              `En ${activeGoals.length} metas de ahorro has asignado ${fmtEur(summary.totalAllocated)} de un total de ${fmtEur(summary.totalSavings)} en ahorros (${fmtEur(summary.unallocatedSavings)} sin asignar).`
            )
          : tr(
              `Имате ${fmtEur(summary.totalSavings)} общи спестявания и все още нямате активни цели за спестяване.`,
              `You have ${fmtEur(summary.totalSavings)} in savings and no active savings goals yet.`,
              `Tienes ${fmtEur(summary.totalSavings)} en ahorros y aún no tienes metas de ahorro activas.`
            ),
      calculation: tr(
        `Общо ${fmtEur(summary.totalSavings)} | Разпределени ${fmtEur(summary.totalAllocated)} | Неразпределени ${fmtEur(summary.unallocatedSavings)}`,
        `Total ${fmtEur(summary.totalSavings)} | Allocated ${fmtEur(summary.totalAllocated)} | Unallocated ${fmtEur(summary.unallocatedSavings)}`,
        `Total ${fmtEur(summary.totalSavings)} | Asignado ${fmtEur(summary.totalAllocated)} | Sin asignar ${fmtEur(summary.unallocatedSavings)}`
      ),
      timeRangeLabel: tr("Цели за спестяване", "Savings goals", "Metas de ahorro"),
      matchedExpenses: goalMatchedEntries(),
      totalMatchedAmount: summary.totalAllocated,
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 00B: Calendar & Future Scheduled Payments / Expected Income
  // ------------------------------------------------------------------
  const isNextWeekFutureQuery =
    /(?:next\s*week|coming\s*week|within\s*7\s*days|próxima\s*semana|proxima\s*semana|следващата\s*седмица|през\s*следващата\s*седмица|идната\s*седмица|тази\s*седмица)/.test(
      norm
    );
  const isNextMonthFutureQuery =
    /(?:next\s*month|coming\s*month|próximo\s*mes|proximo\s*mes|следващия\s*месец|идния\s*месец)/.test(
      norm
    );
  const isUpcomingRecurringQuery =
    /(?:upcoming|planned|scheduled|próximos|proximos|предстоящ|планиран|очакван)/.test(norm) &&
    /(?:recurring|repeating|recurr|povtar|повтарящ|периодич|абонамент)/.test(norm);
  const isComingPaymentsQuery =
    /(?:what\s+(?:payments?|bills?|expenses?)\s+(?:are\s+)?(?:coming|due|scheduled)|qu[eé]\s+(?:pagos?|gastos?|facturas?)\s+(?:vencen|vienen)|какви\s+(?:плащания|разходи|сметки)\s+(?:предсто|идват|имам)|какво\s+предстои\s+да\s+плат)/.test(
      norm
    );
  const isExpectedIncomeThisMonthCalendarQuery =
    /(?:(?:expect(?:ing|ed)?|upcoming|planned|pending|future|scheduled)\s+(?:\w+\s+){0,2}(?:income|incomes|salary|earnings)|(?:income|incomes|salary|earnings)\s+(?:am\s+i\s+|is\s+|are\s+|will\s+be\s+)?(?:expect(?:ing|ed)?|upcoming|planned|pending|scheduled|coming)|(?:ingresos?|salarios?)\s+(?:esperados?|próximos?|proximos?|programados?)|se\s+esperan.*ingresos?|(?:очакван|предстоящ|планиран|бъдещ)[аио]?\s+(?:\w+\s+){0,2}(?:приход|доход|заплат)|(?:приход|доход|заплат)[аите]*\s+(?:\w+\s+){0,2}(?:очаквам|се\s+очаква|предсто|планиран))/.test(
      norm
    );

  if (
    isNextWeekFutureQuery ||
    isNextMonthFutureQuery ||
    isUpcomingRecurringQuery ||
    isComingPaymentsQuery ||
    isExpectedIncomeThisMonthCalendarQuery
  ) {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
    let rangeStart = todayStart;
    let rangeEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 30, 12, 0, 0, 0);
    let windowLabel = tr("Следващите 30 дни", "Next 30 days", "Próximos 30 días");

    if (isNextWeekFutureQuery) {
      rangeStart = todayStart;
      rangeEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 7, 12, 0, 0, 0);
      windowLabel = tr(
        `Следващата седмица (${formatDateShort(rangeStart.toISOString(), en, lang)} – ${formatDateShort(rangeEnd.toISOString(), en, lang)})`,
        `Next 7 days (${formatDateShort(rangeStart.toISOString(), en, lang)} – ${formatDateShort(rangeEnd.toISOString(), en, lang)})`,
        `Próximos 7 días (${formatDateShort(rangeStart.toISOString(), en, lang)} – ${formatDateShort(rangeEnd.toISOString(), en, lang)})`
      );
    } else if (isNextMonthFutureQuery) {
      rangeStart = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1, 12, 0, 0, 0);
      rangeEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 2, 0, 12, 0, 0, 0);
      windowLabel = formatLocalizedMonthYear(`${MONTHS_BG[rangeStart.getMonth()]} ${rangeStart.getFullYear()}`, lang);
    } else if (
      /(?:this\s*month|este\s*mes|този\s*месец|текущ)/.test(norm) ||
      isExpectedIncomeThisMonthCalendarQuery
    ) {
      // Check if an explicit historical month/last-N range was asked; if not, inspect current month (or activeMonth)
      const explicitPastMonth =
        /(?:last|past|previous|pasado|anterior|минал|предход)/.test(norm) ||
        Object.keys(MONTHS_EN_TO_IDX).some((m) => norm.includes(m)) ||
        Object.keys(MONTHS_ES_TO_IDX).some((m) => norm.includes(m)) ||
        Object.keys(MONTHS_BG_LOWER_TO_IDX).some((m) => norm.includes(m));
      if (!explicitPastMonth) {
        rangeStart = new Date(activeMonth.year, activeMonth.monthIndex, 1, 12, 0, 0, 0);
        rangeEnd = new Date(activeMonth.year, activeMonth.monthIndex + 1, 0, 12, 0, 0, 0);
        windowLabel = formatLocalizedMonthYear(activeMonth.key, lang);
      }
    } else if (isUpcomingRecurringQuery) {
      rangeStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1, 12, 0, 0, 0);
      rangeEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 2, 0, 12, 0, 0, 0);
      windowLabel = tr(
        "Предстоящи повтарящи се (текущ и следващ месец)",
        "Upcoming recurring schedule (next 60 days)",
        "Próximos gastos recurrentes (próximos 60 días)"
      );
    }

    const calendarEvents = getCalendarEventsForRange(monthlyData, rangeStart, rangeEnd);

    const wantsIncome =
      isExpectedIncomeThisMonthCalendarQuery ||
      /(?:\bincome\b|\bsalary\b|\bearnings\b|ingreso|salario|приход|доход|заплат)/.test(norm);
    const wantsExpensesOnly = !wantsIncome;

    const matchingCalendarEvents = calendarEvents.filter((ev) => {
      if (!ev.isUpcoming) return false;
      if (wantsIncome && ev.kind !== "income") return false;
      if (wantsExpensesOnly && ev.kind !== "expense") return false;
      if (isUpcomingRecurringQuery && !ev.isRecurring) return false;
      return true;
    });

    const totalCalAmount = matchingCalendarEvents.reduce((s, ev) => s + ev.amount, 0);

    return {
      answer:
        matchingCalendarEvents.length > 0
          ? wantsIncome
            ? tr(
                `Очаквани приходи за ${windowLabel}: ${fmtEur(totalCalAmount)} от ${matchingCalendarEvents.length} ${matchingCalendarEvents.length === 1 ? "запис" : "записа"} (${matchingCalendarEvents
                  .slice(0, 5)
                  .map((e) => `${tCat(e.categoryName)} ${fmtEur(e.amount)} (${parseLocalDateKey(e.dateKey).toLocaleDateString("bg-BG")})`)
                  .join(", ")}).`,
                `Expected income in ${windowLabel}: ${fmtEur(totalCalAmount)} across ${matchingCalendarEvents.length} scheduled/upcoming ${matchingCalendarEvents.length === 1 ? "entry" : "entries"} (${matchingCalendarEvents
                  .slice(0, 5)
                  .map((e) => `${tCat(e.categoryName)} ${fmtEur(e.amount)} on ${parseLocalDateKey(e.dateKey).toLocaleDateString("en-GB")}`)
                  .join(", ")}).`,
                `Ingresos esperados en ${windowLabel}: ${fmtEur(totalCalAmount)} en ${matchingCalendarEvents.length} ${matchingCalendarEvents.length === 1 ? "registro programado" : "registros programados"} (${matchingCalendarEvents
                  .slice(0, 5)
                  .map((e) => `${tCat(e.categoryName)} ${fmtEur(e.amount)} (${parseLocalDateKey(e.dateKey).toLocaleDateString("es-ES")})`)
                  .join(", ")}).`
              )
            : tr(
                `Имате ${matchingCalendarEvents.length} предстоящи ${isUpcomingRecurringQuery ? "повтарящи се " : ""}${matchingCalendarEvents.length === 1 ? "плащане" : "плащания"} за ${windowLabel} на обща стойност ${fmtEur(totalCalAmount)}: ${matchingCalendarEvents
                  .slice(0, 5)
                  .map((e) => `${e.merchantName || tCat(e.categoryName)} ${fmtEur(e.amount)} (${parseLocalDateKey(e.dateKey).toLocaleDateString("bg-BG")})`)
                  .join(", ")}.`,
                `You have ${matchingCalendarEvents.length} upcoming ${isUpcomingRecurringQuery ? "recurring " : ""}${matchingCalendarEvents.length === 1 ? "payment" : "payments"} in ${windowLabel} totaling ${fmtEur(totalCalAmount)}: ${matchingCalendarEvents
                  .slice(0, 5)
                  .map((e) => `${e.merchantName || tCat(e.categoryName)} ${fmtEur(e.amount)} on ${parseLocalDateKey(e.dateKey).toLocaleDateString("en-GB")}`)
                  .join(", ")}.`,
                `Tienes ${matchingCalendarEvents.length} ${matchingCalendarEvents.length === 1 ? "pago próximo" : "pagos próximos"}${isUpcomingRecurringQuery ? " recurrentes" : ""} en ${windowLabel} por un total de ${fmtEur(totalCalAmount)}: ${matchingCalendarEvents
                  .slice(0, 5)
                  .map((e) => `${e.merchantName || tCat(e.categoryName)} ${fmtEur(e.amount)} (${parseLocalDateKey(e.dateKey).toLocaleDateString("es-ES")})`)
                  .join(", ")}.`
              )
          : wantsIncome
          ? tr(
              `Няма очаквани приходи за ${windowLabel}.`,
              `No upcoming or scheduled income found for ${windowLabel}.`,
              `No hay ingresos próximos ni programados para ${windowLabel}.`
            )
          : tr(
              `Няма предстоящи${isUpcomingRecurringQuery ? " повтарящи се" : ""} плащания за ${windowLabel}.`,
              `No upcoming${isUpcomingRecurringQuery ? " recurring" : ""} payments scheduled for ${windowLabel}.`,
              `No hay pagos próximos${isUpcomingRecurringQuery ? " recurrentes" : ""} programados para ${windowLabel}.`
            ),
      calculation:
        matchingCalendarEvents.length > 0
          ? matchingCalendarEvents
              .slice(0, 6)
              .map((e) => `${e.merchantName || tCat(e.categoryName)}: ${fmtEur(e.amount)}`)
              .join(" + ") + ` = ${fmtEur(totalCalAmount)}`
          : tr(
              "0 предстоящи записа = €0.00",
              "0 upcoming entries = €0.00",
              "0 registros próximos = €0.00"
            ),
      timeRangeLabel: windowLabel,
      matchedExpenses: matchingCalendarEvents.map((ev) => ({
        id: ev.id,
        monthKey: ev.monthKey,
        date: parseLocalDateKey(ev.dateKey).toLocaleDateString(getIntlLocale(lang)),
        merchantOrCategory: ev.merchantName || tCat(ev.categoryName),
        categoryName:
          ev.kind === "income"
            ? tr("Очакван приход", "Expected income", "Ingreso esperado")
            : tCat(ev.categoryName),
        expenseAmount: ev.amount,
        matchedAmount: ev.amount,
        matchedKind:
          ev.kind === "income" ? "income" : ev.isRecurring ? "fixed" : "category",
        matchedSnippet: `${
          ev.isProjected
            ? tr("По график", "Scheduled", "Programado")
            : tr("Предстоящ", "Upcoming", "Próximo")
        }${ev.note ? ` · ${ev.note}` : ""}`,
      })),
      totalMatchedAmount: parseFloat(totalCalAmount.toFixed(2)),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 0A: Upcoming / Expected Income (completed = false incomes)
  // ------------------------------------------------------------------
  const isExpectedIncomeQuery =
    /(?:(?:expect(?:ing|ed)?|upcoming|planned|pending|future)\s+(?:\w+\s+){0,2}(?:income|incomes|salary|earnings)|(?:income|incomes|salary|earnings)\s+(?:am\s+i\s+)?(?:expect(?:ing|ed)?|upcoming|planned|pending)|(?:ingresos?|salarios?)\s+(?:esperados?|pr[oó]ximos?|pendientes?|programados?)|(?:очакван|предстоящ|планиран|бъдещ)[аио]?\s+(?:\w+\s+){0,2}(?:приход|доход|заплат)|(?:приход|доход|заплат)[аите]*\s+(?:\w+\s+){0,2}(?:очаквам|предсто|планиран))/.test(
      norm
    );

  if (isExpectedIncomeQuery) {
    const hasExplicitRange =
      /(?:last|past|this|year|month|all|selected|este|pasado|mes|a[nñ]o|todos|ultimos|últimos|последн|този|минал|предход|текущ|избран|годин|всички)/.test(
        norm
      ) ||
      Object.keys(MONTHS_EN_TO_IDX).some((m) => norm.includes(m)) ||
      Object.keys(MONTHS_ES_TO_IDX).some((m) => norm.includes(m)) ||
      Object.keys(MONTHS_BG_LOWER_TO_IDX).some((m) => norm.includes(m)) ||
      /\b20\d{2}\b/.test(norm);

    const range = parseQueryTimeRange(trimmed, entries, activeMonth, false, en, lang);
    const scopedKeys = new Set(range.entries.map((e) => e.key));
    let scopedUpcoming = upcomingIncomes.filter((inc) =>
      range.kind === "all_months"
        ? true
        : scopedKeys.size > 0
        ? scopedKeys.has(inc.monthKey)
        : inc.monthKey === range.targetMonth?.key
    );
    let effectiveLabel = range.label;

    if (!hasExplicitRange && scopedUpcoming.length === 0 && upcomingIncomes.length > 0) {
      scopedUpcoming = upcomingIncomes;
      effectiveLabel =
        entries.length > 0
          ? en
            ? `All months (${entries.length})`
            : `Всички месеци (${entries.length})`
          : range.label;
    }

    const expectedSum = scopedUpcoming.reduce((s, inc) => s + inc.amount, 0);

    return {
      answer:
        scopedUpcoming.length > 0
          ? en
            ? `You are expecting ${scopedUpcoming.length} upcoming ${scopedUpcoming.length === 1 ? "income" : "incomes"} in ${effectiveLabel} totaling ${fmtEur(expectedSum)}: ${scopedUpcoming
                .slice(0, 5)
                .map((i) => `${tCat(i.categoryName)} (${fmtEur(i.amount)})`)
                .join(", ")}.`
            : `Очаквате ${scopedUpcoming.length} ${scopedUpcoming.length === 1 ? "предстоящ приход" : "предстоящи прихода"} за ${effectiveLabel} на обща стойност ${fmtEur(expectedSum)}: ${scopedUpcoming
                .slice(0, 5)
                .map((i) => `${tCat(i.categoryName)} (${fmtEur(i.amount)})`)
                .join(", ")}.`
          : en
          ? `You have no upcoming or expected income in ${effectiveLabel}.`
          : `Нямате очаквани или предстоящи приходи за ${effectiveLabel}.`,
      calculation:
        scopedUpcoming.length > 0
          ? scopedUpcoming
              .slice(0, 6)
              .map((i) => `${tCat(i.categoryName)}: ${fmtEur(i.amount)}`)
              .join(" + ") + ` = ${fmtEur(expectedSum)}`
          : en
          ? "0 expected incomes = €0.00"
          : "0 очаквани прихода = €0.00",
      timeRangeLabel: effectiveLabel,
      matchedExpenses: scopedUpcoming.map((inc) => ({
        id: inc.id,
        monthKey: inc.monthKey,
        date: formatDateShort(inc.date, en, lang),
        merchantOrCategory: tCat(inc.categoryName),
        categoryName: en ? "Expected income" : "Очакван приход",
        expenseAmount: inc.amount,
        matchedAmount: inc.amount,
        matchedKind: "income",
        matchedSnippet: inc.note
          ? `${en ? "Upcoming" : "Предстоящ"} · ${inc.note}`
          : en
          ? "Upcoming income"
          : "Предстоящ приход",
      })),
      totalMatchedAmount: parseFloat(expectedSum.toFixed(2)),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 0B: Upcoming / Planned Expenses & Expected Spending
  // ------------------------------------------------------------------
  const isExpectedSpendQuery =
    /(?:колко\s+ще\s+похарча|\bще\s+похарча\b|колко\s+се\s+очаква|очаквани\s+разходи|предвидени\s+разходи|how\s+much\s+(?:will|am\s+i\s+(?:going|expected)\s+to)\s+spend|expected\s+(?:to\s+)?spend|projected\s+spend|cu[aá]nto\s+voy\s+a\s+gastar|gastos?\s+esperados?)/.test(
      norm
    );

  const isPlannedOnlyQuery =
    !isExpectedSpendQuery &&
    /(?:планиран|предстоящ|предстои\s+да\s+плат|очаква\s+се\s+да\s+плат|planned\s+(?:expense|payment)|upcoming\s+(?:expense|payment)|pending\s+(?:expense|payment)|scheduled\s+(?:expense|payment)|what\s+(?:payments|expenses)\s+(?:are|do\s+i\s+have)\s+(?:planned|pending|upcoming)|(?:expenses?|payments?|разходи|плащания)\s+(?:are\s+)?(?:upcoming|planned|pending)|how\s+much\s+(?:is\s+)?(?:planned|pending|upcoming)|(?:gastos?|pagos?)\s+(?:pr[oó]ximos?|pendientes?|programados?|planificados?)|pr[oó]ximos?\s+(?:gastos?|pagos?))/.test(
      norm
    );

  if (isExpectedSpendQuery) {
    const range = parseQueryTimeRange(trimmed, entries, activeMonth, false, en, lang);
    const scopedKeys = new Set(range.entries.map((e) => e.key));
    const inScope = (e: IndexedExpense) =>
      range.kind === "all_months"
        ? true
        : scopedKeys.size > 0
        ? scopedKeys.has(e.monthKey)
        : e.monthKey === range.targetMonth?.key;

    const scopedCompleted = completedExpenses.filter(inScope);
    const scopedPlanned = plannedExpenses.filter(inScope);

    const completedSum = scopedCompleted.reduce((s, e) => s + e.amount, 0);
    const plannedSum = scopedPlanned.reduce((s, e) => s + e.amount, 0);
    const expectedTotal = completedSum + plannedSum;

    const matched: AiChatMatchedExpense[] = [
      ...scopedPlanned.map((e) => ({
        id: e.id,
        monthKey: e.monthKey,
        date: formatDateShort(e.date, en, lang),
        merchantOrCategory: e.merchantName || tCat(e.categoryName),
        categoryName: tCat(e.categoryName),
        expenseAmount: e.amount,
        matchedAmount: e.amount,
        matchedKind: (e.isFixed ? "fixed" : "category") as AiChatMatchedExpense["matchedKind"],
        matchedSnippet: `${en ? "Upcoming" : "Предстоящ"}${e.note ? ` · ${e.note}` : ""}`,
      })),
      ...scopedCompleted
        .slice()
        .sort((a, b) => b.amount - a.amount)
        .map((e) => ({
          id: e.id,
          monthKey: e.monthKey,
          date: formatDateShort(e.date, en, lang),
          merchantOrCategory: e.merchantName || tCat(e.categoryName),
          categoryName: tCat(e.categoryName),
          expenseAmount: e.amount,
          matchedAmount: e.amount,
          matchedKind: (e.isFixed ? "fixed" : "category") as AiChatMatchedExpense["matchedKind"],
          matchedSnippet: `${en ? "Completed" : "Изпълнен"}${e.note ? ` · ${e.note}` : ""}`,
        })),
    ];

    return {
      answer: en
        ? `Expected total spending for ${range.label}: ${fmtEur(expectedTotal)} (Completed: ${fmtEur(completedSum)} + Upcoming: ${fmtEur(plannedSum)} across ${scopedPlanned.length} upcoming items).`
        : `Очаквани общи разходи за ${range.label}: ${fmtEur(expectedTotal)} — Изпълнени ${fmtEur(completedSum)} (${scopedCompleted.length} бр.) + Предстоящи ${fmtEur(plannedSum)} (${scopedPlanned.length} бр.).`,
      calculation: en
        ? `Completed expenses ${fmtEur(completedSum)} + Upcoming expenses ${fmtEur(plannedSum)} = Expected ${fmtEur(expectedTotal)}`
        : `Реализирани разходи ${fmtEur(completedSum)} + Предстоящи разходи ${fmtEur(plannedSum)} = Очаквани разходи ${fmtEur(expectedTotal)}`,
      timeRangeLabel: range.label,
      matchedExpenses: matched,
      totalMatchedAmount: parseFloat(expectedTotal.toFixed(2)),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  if (isPlannedOnlyQuery) {
    const hasExplicitRange =
      /(?:last|past|this|year|month|all|selected|последн|този|минал|предход|текущ|избран|годин|всички)/.test(
        norm
      ) ||
      Object.keys(MONTHS_EN_TO_IDX).some((m) => norm.includes(m)) ||
      Object.keys(MONTHS_BG_LOWER_TO_IDX).some((m) => norm.includes(m)) ||
      /\b20\d{2}\b/.test(norm);

    const range = parseQueryTimeRange(trimmed, entries, activeMonth, false, en, lang);
    const scopedKeys = new Set(range.entries.map((e) => e.key));
    let scopedPlanned = plannedExpenses.filter((e) =>
      range.kind === "all_months"
        ? true
        : scopedKeys.size > 0
        ? scopedKeys.has(e.monthKey)
        : e.monthKey === range.targetMonth?.key
    );
    let effectiveLabel = range.label;

    if (!hasExplicitRange && scopedPlanned.length === 0 && plannedExpenses.length > 0) {
      scopedPlanned = plannedExpenses;
      effectiveLabel =
        entries.length > 0
          ? en
            ? `All months (${entries.length})`
            : `Всички месеци (${entries.length})`
          : range.label;
    }

    const plannedSum = scopedPlanned.reduce((s, e) => s + e.amount, 0);

    return {
      answer:
        scopedPlanned.length > 0
          ? en
            ? `You have ${scopedPlanned.length} upcoming ${scopedPlanned.length === 1 ? "expense" : "expenses"} in ${effectiveLabel} totaling ${fmtEur(plannedSum)}: ${scopedPlanned
                .slice(0, 5)
                .map((e) => `${tCat(e.categoryName)} (${fmtEur(e.amount)})`)
                .join(", ")}.`
            : `Имате ${scopedPlanned.length} ${scopedPlanned.length === 1 ? "предстоящ разход" : "предстоящи разхода"} за ${effectiveLabel} на обща стойност ${fmtEur(plannedSum)}: ${scopedPlanned
                .slice(0, 5)
                .map((e) => `${tCat(e.categoryName)} (${fmtEur(e.amount)})`)
                .join(", ")}.`
          : en
          ? `You have no upcoming expenses in ${effectiveLabel}.`
          : `Нямате предстоящи разходи за ${effectiveLabel}.`,
      calculation:
        scopedPlanned.length > 0
          ? scopedPlanned
              .slice(0, 6)
              .map((e) => `${tCat(e.categoryName)}: ${fmtEur(e.amount)}`)
              .join(" + ") + ` = ${fmtEur(plannedSum)}`
          : en
          ? "0 upcoming expenses = €0.00"
          : "0 предстоящи разхода = €0.00",
      timeRangeLabel: effectiveLabel,
      matchedExpenses: scopedPlanned.map((e) => ({
        id: e.id,
        monthKey: e.monthKey,
        date: formatDateShort(e.date, en, lang),
        merchantOrCategory: e.merchantName || tCat(e.categoryName),
        categoryName: tCat(e.categoryName),
        expenseAmount: e.amount,
        matchedAmount: e.amount,
        matchedKind: e.isFixed ? "fixed" : "category",
        matchedSnippet: e.note
          ? `${en ? "Upcoming" : "Предстоящ"} · ${e.note}`
          : en
          ? "Upcoming expense"
          : "Предстоящ разход",
      })),
      totalMatchedAmount: parseFloat(plannedSum.toFixed(2)),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 1: Savings over period / total savings balance
  // ------------------------------------------------------------------
  if (
    /(?:\bsave|\bsaved|\bsavings\b|\bahorro|\bahorros\b|\bahorrado|спест|спестяван|спестих|налични\s*средства)/.test(norm)
  ) {
    const hasExplicitRange =
      /(?:last|past|this|year|month|all|este|pasado|mes|a[nñ]o|todos|ultimos|últimos|последн|този|минал|годин|всички)/.test(norm) ||
      Object.keys(MONTHS_EN_TO_IDX).some((m) => norm.includes(m)) ||
      Object.keys(MONTHS_ES_TO_IDX).some((m) => norm.includes(m)) ||
      Object.keys(MONTHS_BG_LOWER_TO_IDX).some((m) => norm.includes(m));
    const range = parseQueryTimeRange(trimmed, entries, activeMonth, !hasExplicitRange, en, lang);

    const lifetimeNet = globalSavings.reduce(
      (s, tx) => s + (tx.type === "expense" ? -Number(tx.amount) : Number(tx.amount)),
      0
    );

    let filteredTx = globalSavings;
    if (range.kind === "single_month" && range.targetMonth) {
      const { year, monthIndex } = range.targetMonth;
      filteredTx = globalSavings.filter((tx) => {
        const d = new Date(tx.date);
        return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === monthIndex;
      });
    } else if (range.kind === "last_n_months" && range.lastNCount) {
      const anchor = activeMonth;
      const anchorAbs = anchor.year * 12 + anchor.monthIndex;
      const minAbs = anchorAbs - (range.lastNCount - 1);
      filteredTx = globalSavings.filter((tx) => {
        const d = new Date(tx.date);
        if (isNaN(d.getTime())) return false;
        const abs = d.getFullYear() * 12 + d.getMonth();
        return abs >= minAbs && abs <= anchorAbs;
      });
    } else if (range.kind === "year") {
      const yMatch = range.label.match(/\d{4}/);
      const y = yMatch ? parseInt(yMatch[0], 10) : activeMonth.year;
      filteredTx = globalSavings.filter((tx) => {
        const d = new Date(tx.date);
        return !isNaN(d.getTime()) && d.getFullYear() === y;
      });
    }

    const deposits = filteredTx
      .filter((t) => t.type !== "expense")
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const withdrawals = filteredTx
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const netInRange = deposits - withdrawals;

    // Also calculate cashflow surplus (Income - Expenses) across the entries in range
    const periodIncome = range.entries.reduce(
      (s, e) => s + calculateMonthIncome(e.month, e.year, e.record),
      0
    );
    const periodExp = range.entries.reduce((s, e) => s + calculateMonthExpenses(e.record), 0);

    const matched: AiChatMatchedExpense[] = filteredTx.slice(0, 12).map((tx) => ({
      id: tx.id,
      monthKey: range.label,
      date: formatDateShort(tx.date, en, lang),
      merchantOrCategory: tCat(tx.categoryName || "Спестяване"),
      categoryName:
        tx.type === "expense"
          ? en
            ? "Withdrawal"
            : "Теглене"
          : en
          ? "Deposit"
          : "Вноска",
      expenseAmount: Number(tx.amount) || 0,
      matchedAmount: tx.type === "expense" ? -Number(tx.amount) : Number(tx.amount),
      matchedKind: "saving",
      matchedSnippet: tx.note || undefined,
    }));

    return {
      answer: en
        ? `Net savings recorded in ${range.label}: ${fmtEur(netInRange)} (${filteredTx.length} transactions). Total lifetime savings balance: ${fmtEur(lifetimeNet)}.`
        : `Нетни спестявания за ${range.label}: ${fmtEur(netInRange)} (${filteredTx.length} трансакции). Общ баланс в „Спестявания“: ${fmtEur(lifetimeNet)}.`,
      calculation: en
        ? `${fmtEur(deposits)} (deposits) − ${fmtEur(withdrawals)} (withdrawals) = ${fmtEur(netInRange)} | Net cashflow (Income ${fmtEur(periodIncome)} − Expenses ${fmtEur(periodExp)} = ${fmtEur(periodIncome - periodExp)})`
        : `${fmtEur(deposits)} (вноски) − ${fmtEur(withdrawals)} (тегления) = ${fmtEur(netInRange)} | Нетен паричен поток (Приходи ${fmtEur(periodIncome)} − Разходи ${fmtEur(periodExp)} = ${fmtEur(periodIncome - periodExp)})`,
      timeRangeLabel: range.label,
      matchedExpenses: matched,
      totalMatchedAmount: parseFloat(netInRange.toFixed(2)),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 2: Categories increased compared to last month
  // ------------------------------------------------------------------
  if (
    /(?:increas|more\s+than\s+last|grew\s+compared|увелич|нарасн|повече\s+от\s+минал|спрямо\s+минал)/.test(
      norm
    )
  ) {
    const range = parseQueryTimeRange(trimmed, entries, activeMonth, false, en, lang);
    const target = range.targetMonth || activeMonth;
    const prev = getPreviousMonthAndYear(target.month, target.year);
    const prevKey = `${prev.prevMonth} ${prev.prevYear}`;
    const targetLabel = formatLocalizedMonthYear(target.key, lang);
    const prevLabel = formatLocalizedMonthYear(prevKey, lang);

    const curItems = completedExpenses.filter((e) => e.monthKey === target.key);
    const prevItems = completedExpenses.filter((e) => e.monthKey === prevKey);

    const curByCat: Record<string, number> = {};
    const prevByCat: Record<string, number> = {};
    curItems.forEach((e) => {
      curByCat[e.categoryName] = (curByCat[e.categoryName] || 0) + e.amount;
    });
    prevItems.forEach((e) => {
      prevByCat[e.categoryName] = (prevByCat[e.categoryName] || 0) + e.amount;
    });

    const allCats = new Set([...Object.keys(curByCat), ...Object.keys(prevByCat)]);
    const increased = Array.from(allCats)
      .map((cat) => {
        const curVal = curByCat[cat] || 0;
        const prevVal = prevByCat[cat] || 0;
        const diff = curVal - prevVal;
        const pct = prevVal > 0 ? (diff / prevVal) * 100 : curVal > 0 ? 100 : 0;
        return { cat, displayCat: tCat(cat), curVal, prevVal, diff, pct };
      })
      .filter((x) => x.diff > 0.01)
      .sort((a, b) => b.diff - a.diff);

    const matched: AiChatMatchedExpense[] = increased.map((row, idx) => ({
      id: `inc_${idx}_${row.cat}`,
      monthKey: target.key,
      date: targetLabel,
      merchantOrCategory: row.displayCat,
      categoryName: `${fmtEur(row.prevVal)} → ${fmtEur(row.curVal)}`,
      expenseAmount: row.curVal,
      matchedAmount: parseFloat(row.diff.toFixed(2)),
      matchedKind: "category",
      matchedSnippet: `+${fmtEur(row.diff)} (${row.prevVal > 0 ? `+${row.pct.toFixed(0)}%` : en ? "new category" : "нова категория"})`,
    }));

    return {
      answer:
        increased.length > 0
          ? en
            ? `${increased.length} ${increased.length === 1 ? "category" : "categories"} increased in ${targetLabel} compared to ${prevLabel}: ${increased
                .slice(0, 4)
                .map((x) => `${x.displayCat} (+${fmtEur(x.diff)})`)
                .join(", ")}.`
            : `${increased.length} категории са с по-висок разход през ${targetLabel} спрямо ${prevLabel}: ${increased
                .slice(0, 4)
                .map((x) => `${x.displayCat} (+${fmtEur(x.diff)})`)
                .join(", ")}.`
          : en
          ? `No categories increased in ${targetLabel} compared to ${prevLabel}.`
          : `Няма категории с увеличение през ${targetLabel} спрямо ${prevLabel}.`,
      calculation:
        increased.length > 0
          ? increased
              .slice(0, 5)
              .map(
                (x) =>
                  `${x.displayCat}: ${fmtEur(x.curVal)} − ${fmtEur(x.prevVal)} = +${fmtEur(x.diff)} (${x.prevVal > 0 ? `+${x.pct.toFixed(0)}%` : en ? "new" : "нов"})`
              )
              .join(" · ")
          : en
          ? `Compared ${curItems.length} entries (${targetLabel}) vs ${prevItems.length} entries (${prevLabel})`
          : `Сравнени ${curItems.length} записа (${targetLabel}) спрямо ${prevItems.length} записа (${prevLabel})`,
      timeRangeLabel: `${prevLabel} → ${targetLabel}`,
      matchedExpenses: matched,
      totalMatchedAmount: parseFloat(
        increased.reduce((s, r) => s + r.diff, 0).toFixed(2)
      ),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 3: Which expenses / categories are growing the fastest?
  // ------------------------------------------------------------------
  if (/(?:fastest|grow|growing|раст|най-бързо|поскъп)/.test(norm)) {
    const activeEntries = entries.filter((e) => calculateMonthExpenses(e.record) > 0);
    if (activeEntries.length < 2) {
      return {
        answer: en
          ? `At least 2 months with expense data are needed to measure spending growth (currently ${activeEntries.length} month recorded).`
          : `Необходими са данни за поне 2 месеца, за да се изчисли темпът на растеж на разходите (текущо: ${activeEntries.length} месец).`,
        calculation: en
          ? `Active months: ${activeEntries.map((e) => formatLocalizedMonthYear(e.key, lang)).join(", ") || "none"}`
          : `Налични активни месеци: ${activeEntries.map((e) => e.key).join(", ") || "няма"}`,
        timeRangeLabel: en ? `All months (${entries.length})` : `Всички месеци (${entries.length})`,
        matchedExpenses: [],
        followUpSuggestions: buildSuggestions(en, lang),
      };
    }

    const latestEntry = activeEntries[activeEntries.length - 1];
    const latestLabel = formatLocalizedMonthYear(latestEntry.key, lang);
    const firstLabel = formatLocalizedMonthYear(activeEntries[0].key, lang);
    const baselineEntries = activeEntries.slice(0, -1);
    const catStats: Record<string, { prevSum: number; prevMonths: number; latest: number }> = {};

    baselineEntries.forEach((entry) => {
      const items = completedExpenses.filter((e) => e.monthKey === entry.key);
      const perMonth: Record<string, number> = {};
      items.forEach((it) => {
        perMonth[it.categoryName] = (perMonth[it.categoryName] || 0) + it.amount;
      });
      Object.entries(perMonth).forEach(([cat, val]) => {
        if (!catStats[cat]) catStats[cat] = { prevSum: 0, prevMonths: 0, latest: 0 };
        catStats[cat].prevSum += val;
        catStats[cat].prevMonths += 1;
      });
    });

    completedExpenses
      .filter((e) => e.monthKey === latestEntry.key)
      .forEach((it) => {
        if (!catStats[it.categoryName]) {
          catStats[it.categoryName] = { prevSum: 0, prevMonths: 0, latest: 0 };
        }
        catStats[it.categoryName].latest += it.amount;
      });

    const growthRows = Object.entries(catStats)
      .map(([cat, st]) => {
        const avgPrev = st.prevMonths > 0 ? st.prevSum / st.prevMonths : 0;
        const diff = st.latest - avgPrev;
        const pct = avgPrev > 0 ? (diff / avgPrev) * 100 : st.latest > 0 ? 100 : 0;
        return { cat, displayCat: tCat(cat), avgPrev, latest: st.latest, diff, pct };
      })
      .filter((r) => r.diff > 0.01)
      .sort((a, b) => b.pct - a.pct || b.diff - a.diff);

    return {
      answer:
        growthRows.length > 0
          ? en
            ? `Fastest growing expense category in ${latestLabel}: ${growthRows[0].displayCat} (+${growthRows[0].pct.toFixed(0)}%, +${fmtEur(growthRows[0].diff)} vs prior monthly average).`
            : `Най-бързо растяща категория през ${latestLabel}: „${growthRows[0].displayCat}“ (+${growthRows[0].pct.toFixed(0)}%, +${fmtEur(growthRows[0].diff)} спрямо средното за предходните месеци).`
          : en
          ? `No expense categories showed upward growth in ${latestLabel} compared to previous months.`
          : `Няма категории с ръст през ${latestLabel} спрямо предходните месеци.`,
      calculation: growthRows
        .slice(0, 4)
        .map(
          (r) =>
            `${r.displayCat}: ${en ? "avg" : "ср."} ${fmtEur(r.avgPrev)} → ${fmtEur(r.latest)} (+${fmtEur(r.diff)} / +${r.pct.toFixed(0)}%)`
        )
        .join(" · "),
      timeRangeLabel: en
        ? `${firstLabel} – ${latestLabel} (${activeEntries.length} months)`
        : `${firstLabel} – ${latestLabel} (${activeEntries.length} месеца)`,
      matchedExpenses: growthRows.slice(0, 8).map((r, i) => ({
        id: `grow_${i}_${r.cat}`,
        monthKey: latestEntry.key,
        date: latestLabel,
        merchantOrCategory: r.displayCat,
        categoryName: `${en ? "Avg" : "Ср."} ${fmtEur(r.avgPrev)} → ${fmtEur(r.latest)}`,
        expenseAmount: r.latest,
        matchedAmount: parseFloat(r.diff.toFixed(2)),
        matchedKind: "category",
        matchedSnippet: `+${r.pct.toFixed(0)}% (+${fmtEur(r.diff)})`,
      })),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 4: Fixed/Recurring & Additional Expenses (guarded against income queries)
  // ------------------------------------------------------------------
  const mentionsIncomeKeyword =
    /(?:\bincome\b|\bincomes\b|\bearn|\bsalary\b|\bsalaries\b|\bingreso|\bingresos|\bsalario|\bsueldo|приход|доход|заплат)/.test(norm);
  const asksAdditionalExpenses =
    !mentionsIncomeKeyword &&
    /(?:(?:additional|variable|extra|one-time)\s+(?:\S+\s+){0,2}expense|gastos?\s+(?:adicionales?|variables?|extra|puntuales?)|(?:допълнител|променлив)[а-я]*\s+(?:\S+\s+){0,2}разход)/.test(
      norm
    );
  const asksFixedOrRecurringExpenses =
    !mentionsIncomeKeyword &&
    /(?:recurr|subscription|suscripcion|(?:fixed|regular)\s+(?:\S+\s+){0,2}expense|gastos?\s+(?:recurrentes?|fijos?)|периодич|повтарящ|фиксиран|абонамент)/.test(
      norm
    );

  if (asksAdditionalExpenses || asksFixedOrRecurringExpenses) {
    const range = parseQueryTimeRange(trimmed, entries, activeMonth, false, en, lang);
    const targetEntries = range.entries.length > 0 ? range.entries : entries;
    const scopedKeys = new Set(targetEntries.map((te) => te.key));

    if (asksAdditionalExpenses && !asksFixedOrRecurringExpenses) {
      const additionalInRange = completedExpenses.filter(
        (e) => scopedKeys.has(e.monthKey) && !e.isFixed
      );
      const totalAdd = additionalInRange.reduce((s, e) => s + e.amount, 0);
      return {
        answer:
          additionalInRange.length > 0
            ? en
              ? `Found ${additionalInRange.length} additional (one-time) expenses in ${range.label} totaling ${fmtEur(totalAdd)}.`
              : `Открити са ${additionalInRange.length} допълнителни разхода за ${range.label} на обща стойност ${fmtEur(totalAdd)}.`
            : en
            ? `No additional expenses recorded in ${range.label}.`
            : `Няма записани допълнителни разходи за ${range.label}.`,
        calculation:
          additionalInRange.length > 0
            ? additionalInRange
                .slice(0, 8)
                .map((e) => `${tCat(e.categoryName)}: ${fmtEur(e.amount)}`)
                .join(" + ") + ` = ${fmtEur(totalAdd)}`
            : en
            ? "0 entries"
            : "0 записа",
        timeRangeLabel: range.label,
        matchedExpenses: additionalInRange.map((e) => ({
          id: e.id,
          monthKey: e.monthKey,
          date: formatDateShort(e.date, en, lang),
          merchantOrCategory: e.merchantName || tCat(e.categoryName),
          categoryName: tCat(e.categoryName),
          expenseAmount: e.amount,
          matchedAmount: e.amount,
          matchedKind: e.merchantName ? "merchant" : "category",
          matchedSnippet: e.note || (en ? "Additional expense" : "Допълнителен разход"),
        })),
        totalMatchedAmount: parseFloat(totalAdd.toFixed(2)),
        followUpSuggestions: buildSuggestions(en, lang),
      };
    }

    const recurringInRange = completedExpenses.filter(
      (e) => scopedKeys.has(e.monthKey) && (e.isFixed || e.isRecurring)
    );

    const totalRec = recurringInRange.reduce((s, e) => s + e.amount, 0);
    return {
      answer:
        recurringInRange.length > 0
          ? en
            ? `Found ${recurringInRange.length} recurring expenses in ${range.label} totaling ${fmtEur(totalRec)}.`
            : `Открити са ${recurringInRange.length} повтарящи се разхода за ${range.label} на обща стойност ${fmtEur(totalRec)}.`
          : en
          ? `No recurring expenses recorded in ${range.label}.`
          : `Няма записани повтарящи се разходи за ${range.label}.`,
      calculation:
        recurringInRange.length > 0
          ? recurringInRange
              .slice(0, 8)
              .map((e) => `${tCat(e.categoryName)}: ${fmtEur(e.amount)}`)
              .join(" + ") + ` = ${fmtEur(totalRec)}`
          : en
          ? "0 entries"
          : "0 записа",
      timeRangeLabel: range.label,
      matchedExpenses: recurringInRange.map((e) => ({
        id: e.id,
        monthKey: e.monthKey,
        date: formatDateShort(e.date, en, lang),
        merchantOrCategory: e.merchantName || tCat(e.categoryName),
        categoryName: tCat(e.categoryName),
        expenseAmount: e.amount,
        matchedAmount: e.amount,
        matchedKind: "fixed",
        matchedSnippet: e.note || (en ? "Recurring expense" : "Повтарящ се разход"),
      })),
      totalMatchedAmount: parseFloat(totalRec.toFixed(2)),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 5: Average monthly spending
  // ------------------------------------------------------------------
  if (/(?:average|avg|mean|promedio|media|среден|средно\s*месеч|средния\s*разход)/.test(norm)) {
    const range = parseQueryTimeRange(trimmed, entries, activeMonth, true, en, lang);
    const activeInRange = range.entries.filter((e) => calculateMonthExpenses(e.record) > 0);
    const calcSet = activeInRange.length > 0 ? activeInRange : range.entries;

    const perMonthTotals = calcSet.map((e) => ({
      key: e.key,
      displayKey: formatLocalizedMonthYear(e.key, lang),
      total: calculateMonthExpenses(e.record),
    }));
    const grandTotal = perMonthTotals.reduce((s, m) => s + m.total, 0);
    const avg = calcSet.length > 0 ? grandTotal / calcSet.length : 0;

    return {
      answer:
        calcSet.length > 0
          ? en
            ? `Your average monthly spending is ${fmtEur(avg)} across ${calcSet.length} active ${calcSet.length === 1 ? "month" : "months"} (total ${fmtEur(grandTotal)}).`
            : `Средният ви месечен разход е ${fmtEur(avg)} за ${calcSet.length} ${calcSet.length === 1 ? "активен месец" : "активни месеца"} (общо ${fmtEur(grandTotal)}).`
          : en
          ? "No monthly expense records found yet."
          : "Все още няма въведени месечни разходи.",
      calculation:
        calcSet.length > 0
          ? en
            ? `${fmtEur(grandTotal)} ÷ ${calcSet.length} mo. = ${fmtEur(avg)}/mo.`
            : `${fmtEur(grandTotal)} ÷ ${calcSet.length} мес. = ${fmtEur(avg)}/мес.`
          : "0.00 ÷ 0 = €0.00",
      timeRangeLabel: range.label,
      matchedExpenses: perMonthTotals.map((m, idx) => ({
        id: `avg_${idx}_${m.key}`,
        monthKey: m.key,
        date: m.displayKey,
        merchantOrCategory: m.displayKey,
        categoryName: en ? "Monthly spending" : "Месечен разход",
        expenseAmount: m.total,
        matchedAmount: m.total,
        matchedKind: "category",
      })),
      totalMatchedAmount: parseFloat(avg.toFixed(2)),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 6: Largest / Biggest expense
  // ------------------------------------------------------------------
  if (/(?:largest|biggest|highest|most\s+expensive|max\s+expense|mayor\s+gasto|gasto\s+m[aá]s\s+(?:alto|grande|caro)|най-голям|най-висок|най-скъп)/.test(norm)) {
    const range = parseQueryTimeRange(trimmed, entries, activeMonth, false, en, lang);
    const scopedKeys = new Set(range.entries.map((e) => e.key));
    const scopedExpenses = completedExpenses
      .filter((e) => (scopedKeys.size > 0 ? scopedKeys.has(e.monthKey) : e.monthKey === range.targetMonth?.key))
      .sort((a, b) => b.amount - a.amount);

    if (scopedExpenses.length === 0) {
      return {
        answer: en
          ? `No expenses recorded in ${range.label}.`
          : `Няма записани разходи за ${range.label}.`,
        calculation: en ? "0 expenses" : "0 разхода",
        timeRangeLabel: range.label,
        matchedExpenses: [],
        followUpSuggestions: buildSuggestions(en, lang),
      };
    }

    const top = scopedExpenses[0];
    return {
      answer: en
        ? `Your largest expense in ${range.label} was ${fmtEur(top.amount)} (${top.merchantName || tCat(top.categoryName)}, ${formatDateShort(top.date, en, lang)}).`
        : `Най-големият ви разход за ${range.label} е ${fmtEur(top.amount)} (${top.merchantName ? `${top.merchantName} · ` : ""}${tCat(top.categoryName)}, ${formatDateShort(top.date, en, lang)}).`,
      calculation: en
        ? `Max of ${scopedExpenses.length} expenses: ${fmtEur(top.amount)} (${tCat(top.categoryName)}${top.merchantName ? ` — ${top.merchantName}` : ""})`
        : `Максимум от ${scopedExpenses.length} разхода: ${fmtEur(top.amount)} (${tCat(top.categoryName)}${top.merchantName ? ` — ${top.merchantName}` : ""})`,
      timeRangeLabel: range.label,
      matchedExpenses: scopedExpenses.slice(0, 5).map((e) => ({
        id: e.id,
        monthKey: e.monthKey,
        date: formatDateShort(e.date, en, lang),
        merchantOrCategory: e.merchantName || tCat(e.categoryName),
        categoryName: tCat(e.categoryName),
        expenseAmount: e.amount,
        matchedAmount: e.amount,
        matchedKind: e.merchantName ? "merchant" : "category",
        matchedSnippet: e.note ? e.note.split("\n").slice(0, 3).join(", ") : undefined,
      })),
      totalMatchedAmount: top.amount,
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 7: Budget utilization & limits
  // ------------------------------------------------------------------
  if (/(?:budget|limit|utilization|overspent|presupuesto|l[ií]mite|excedido|бюджет|лимит|усвояван|надвиш)/.test(norm)) {
    const range = parseQueryTimeRange(trimmed, entries, activeMonth, false, en, lang);
    const target = range.targetMonth || activeMonth;
    const targetLabel = formatLocalizedMonthYear(target.key, lang);
    const record = monthlyData[target.key];
    const status = calculateAllBudgetsStatus(record, totalMonthlyBudget, categoryBudgets);

    const exceeded = status.categoryStatuses.filter((c) => c.isExceeded);
    return {
      answer: en
        ? `Budget utilization for ${targetLabel}: ${fmtEur(status.totalSpent)} of ${fmtEur(status.totalMonthlyLimit)} (${status.totalPercentage.toFixed(1)}%). ${exceeded.length > 0 ? `Exceeded: ${exceeded.map((e) => translateBudgetName(e.budget.categoryName, lang)).join(", ")}.` : "All category budgets are within limits."}`
        : `Усвояване на бюджета за ${targetLabel}: ${fmtEur(status.totalSpent)} от ${fmtEur(status.totalMonthlyLimit)} (${status.totalPercentage.toFixed(1)}%). ${exceeded.length > 0 ? `Надвишени категории: ${exceeded.map((e) => translateBudgetName(e.budget.categoryName, lang)).join(", ")}.` : "Всички категорийни бюджети са в рамките на лимита."}`,
      calculation: `${fmtEur(status.totalSpent)} / ${fmtEur(status.totalMonthlyLimit)} = ${status.totalPercentage.toFixed(1)}% · ${en ? "Remaining" : "Остатък"}: ${fmtEur(status.totalRemaining)}`,
      timeRangeLabel: targetLabel,
      matchedExpenses: status.categoryStatuses.map((cs) => ({
        id: cs.budget.id,
        monthKey: target.key,
        date: `${cs.percentage.toFixed(0)}%`,
        merchantOrCategory: translateBudgetName(cs.budget.categoryName, lang),
        categoryName: `${en ? "Limit" : "Лимит"} ${fmtEur(cs.limit)}`,
        expenseAmount: cs.spent,
        matchedAmount: cs.spent,
        matchedKind: "category",
        matchedSnippet: cs.isExceeded
          ? en
            ? `Exceeded by ${fmtEur(cs.overspentAmount)}`
            : `Надвишен с ${fmtEur(cs.overspentAmount)}`
          : en
          ? `Remaining ${fmtEur(cs.remaining)}`
          : `Остават ${fmtEur(cs.remaining)}`,
      })),
      totalMatchedAmount: status.totalSpent,
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 8: Income queries (Completed / Realized incomes with Fixed vs Additional)
  // ------------------------------------------------------------------
  if (mentionsIncomeKeyword) {
    const range = parseQueryTimeRange(trimmed, entries, activeMonth, false, en, lang);
    const scopedKeys = new Set(range.entries.map((e) => e.key));
    const inScopeCompleted = completedIncomes.filter((inc) =>
      range.kind === "all_months" ? true : scopedKeys.has(inc.monthKey)
    );
    const inScopeUpcoming = upcomingIncomes.filter((inc) =>
      range.kind === "all_months" ? true : scopedKeys.has(inc.monthKey)
    );

    const wantsFixedIncome =
      /(?:fixed|recurr|regular|периодич|повтарящ|фиксиран|постоян)/.test(norm);
    const wantsAdditionalIncome =
      /(?:additional|variable|extra|bonus|one-time|допълнител|променлив|извънред|еднократ)/.test(
        norm
      );

    if (wantsFixedIncome && !wantsAdditionalIncome) {
      const fixedIncomes = inScopeCompleted.filter((inc) => inc.isFixed);
      const upcomingFixed = inScopeUpcoming.filter((inc) => inc.isFixed);
      const fixedSum = fixedIncomes.reduce((s, inc) => s + inc.amount, 0);
      const upcomingFixedSum = upcomingFixed.reduce((s, inc) => s + inc.amount, 0);

      const matchedFixed: AiChatMatchedExpense[] = fixedIncomes.map((inc) => ({
        id: inc.id,
        monthKey: inc.monthKey,
        date: formatDateShort(inc.date, en, lang),
        merchantOrCategory: tCat(inc.categoryName || "Приход"),
        categoryName: en ? "Recurring income" : "Повтарящ се приход",
        expenseAmount: inc.amount,
        matchedAmount: inc.amount,
        matchedKind: "income",
        matchedSnippet: inc.note || (en ? "Recurring income" : "Повтарящ се приход"),
      }));

      const upcomingSuffixEn =
        upcomingFixed.length > 0
          ? ` Plus ${upcomingFixed.length} upcoming recurring (${fmtEur(upcomingFixedSum)}).`
          : "";
      const upcomingSuffixBg =
        upcomingFixed.length > 0
          ? ` Очакват се и ${upcomingFixed.length} предстоящи повтарящи се (${fmtEur(upcomingFixedSum)}).`
          : "";

      return {
        answer:
          fixedIncomes.length > 0
            ? en
              ? `Recurring income in ${range.label}: ${fmtEur(fixedSum)} across ${fixedIncomes.length} completed entries.${upcomingSuffixEn}`
              : `Повтарящи се приходи за ${range.label}: ${fmtEur(fixedSum)} (${fixedIncomes.length} реализирани записа).${upcomingSuffixBg}`
            : en
            ? `No completed recurring income recorded in ${range.label}.${upcomingSuffixEn}`
            : `Няма реализирани повтарящи се приходи за ${range.label}.${upcomingSuffixBg}`,
        calculation:
          fixedIncomes.length > 0
            ? fixedIncomes
                .slice(0, 6)
                .map((i) => `${tCat(i.categoryName)}: ${fmtEur(i.amount)}`)
                .join(" + ") + ` = ${fmtEur(fixedSum)}`
            : en
            ? "0 recurring incomes = €0.00"
            : "0 повтарящи се прихода = €0.00",
        timeRangeLabel: range.label,
        matchedExpenses: matchedFixed,
        totalMatchedAmount: parseFloat(fixedSum.toFixed(2)),
        followUpSuggestions: buildSuggestions(en, lang),
      };
    }

    if (wantsAdditionalIncome && !wantsFixedIncome) {
      const additionalIncomes = inScopeCompleted.filter((inc) => !inc.isFixed);
      const additionalSum = additionalIncomes.reduce((s, inc) => s + inc.amount, 0);

      const matchedAdditional: AiChatMatchedExpense[] = additionalIncomes.map((inc) => ({
        id: inc.id,
        monthKey: inc.monthKey,
        date: formatDateShort(inc.date, en, lang),
        merchantOrCategory: tCat(inc.categoryName || "Приход"),
        categoryName: en ? "Additional income" : "Допълнителен приход",
        expenseAmount: inc.amount,
        matchedAmount: inc.amount,
        matchedKind: "income",
        matchedSnippet: inc.note || (en ? "One-time income" : "Еднократен приход"),
      }));

      return {
        answer:
          additionalIncomes.length > 0
            ? en
              ? `Additional (one-time) income in ${range.label}: ${fmtEur(additionalSum)} across ${additionalIncomes.length} completed entries.`
              : `Допълнителни приходи за ${range.label}: ${fmtEur(additionalSum)} (${additionalIncomes.length} реализирани записа).`
            : en
            ? `No completed additional income recorded in ${range.label}.`
            : `Няма реализирани допълнителни приходи за ${range.label}.`,
        calculation:
          additionalIncomes.length > 0
            ? additionalIncomes
                .slice(0, 6)
                .map((i) => `${tCat(i.categoryName)}: ${fmtEur(i.amount)}`)
                .join(" + ") + ` = ${fmtEur(additionalSum)}`
            : en
            ? "0 additional incomes = €0.00"
            : "0 допълнителни прихода = €0.00",
        timeRangeLabel: range.label,
        matchedExpenses: matchedAdditional,
        totalMatchedAmount: parseFloat(additionalSum.toFixed(2)),
        followUpSuggestions: buildSuggestions(en, lang),
      };
    }

    const totalInc = inScopeCompleted.reduce((s, inc) => s + inc.amount, 0);
    const fixedIncSum = inScopeCompleted
      .filter((inc) => inc.isFixed)
      .reduce((s, inc) => s + inc.amount, 0);
    const additionalIncSum = inScopeCompleted
      .filter((inc) => !inc.isFixed)
      .reduce((s, inc) => s + inc.amount, 0);

    const matchedIncomes: AiChatMatchedExpense[] = inScopeCompleted.map((inc) => ({
      id: inc.id,
      monthKey: inc.monthKey,
      date: formatDateShort(inc.date, en, lang),
      merchantOrCategory: tCat(inc.categoryName || "Приход"),
      categoryName: inc.isFixed
        ? en
          ? "Recurring income"
          : "Повтарящ се приход"
        : en
        ? "Additional income"
        : "Допълнителен приход",
      expenseAmount: inc.amount,
      matchedAmount: inc.amount,
      matchedKind: "income",
      matchedSnippet: inc.note || (inc.isFixed ? (en ? "Recurring" : "Повтарящ се") : (en ? "Additional" : "Допълнителен")),
    }));

    return {
      answer: en
        ? `Total completed income in ${range.label}: ${fmtEur(totalInc)} across ${matchedIncomes.length} entries (Recurring: ${fmtEur(fixedIncSum)}, Additional: ${fmtEur(additionalIncSum)}).`
        : `Общи реализирани приходи за ${range.label}: ${fmtEur(totalInc)} (${matchedIncomes.length} записа) — Повтарящи се: ${fmtEur(fixedIncSum)} · Допълнителни: ${fmtEur(additionalIncSum)}.`,
      calculation:
        matchedIncomes.length > 0
          ? en
            ? `Recurring ${fmtEur(fixedIncSum)} + Additional ${fmtEur(additionalIncSum)} = ${fmtEur(totalInc)}`
            : `Повтарящи се ${fmtEur(fixedIncSum)} + Допълнителни ${fmtEur(additionalIncSum)} = ${fmtEur(totalInc)}`
          : "0.00",
      timeRangeLabel: range.label,
      matchedExpenses: matchedIncomes,
      totalMatchedAmount: parseFloat(totalInc.toFixed(2)),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // ------------------------------------------------------------------
  // INTENT 9: Deep Search across Expenses, Categories, Merchants, Notes, Receipt Items, Electricity
  // ------------------------------------------------------------------
  const hasExplicitRange =
    /(?:last|past|this|year|month|all|selected|este|pasado|mes|a[nñ]o|todos|ultimos|últimos|последн|този|минал|предход|текущ|избран|годин|всички)/.test(
      norm
    ) ||
    Object.keys(MONTHS_EN_TO_IDX).some((m) => norm.includes(m)) ||
    Object.keys(MONTHS_ES_TO_IDX).some((m) => norm.includes(m)) ||
    Object.keys(MONTHS_BG_LOWER_TO_IDX).some((m) => norm.includes(m)) ||
    /\b20\d{2}\b/.test(norm);

  const range = parseQueryTimeRange(trimmed, entries, activeMonth, !hasExplicitRange, en, lang);
  const scopedKeys = new Set(range.entries.map((e) => e.key));
  const scopedExpenses =
    range.kind === "all_months"
      ? completedExpenses
      : completedExpenses.filter((e) => scopedKeys.has(e.monthKey));

  const { terms, matchedGroups, displayTopic } = extractSearchTermsFromQuestion(trimmed, en);

  // Special Electricity check if user asks specifically about electricity/power
  if (matchedGroups.some((g) => g.id === "electricity") && electricityHistory.length > 0) {
    const scopedElec = range.entries.map((e) => ({
      key: e.key,
      displayKey: formatLocalizedMonthYear(e.key, lang),
      cost: calculateMonthElectricity(e.month, e.year, e.record),
    }));
    const elecTotal = scopedElec.reduce((s, x) => s + x.cost, 0);
    if (elecTotal > 0) {
      return {
        answer: en
          ? `Electricity cost in ${range.label}: ${fmtEur(elecTotal)}.`
          : `Разходи за електроенергия за ${range.label}: ${fmtEur(elecTotal)}.`,
        calculation: scopedElec.map((x) => `${x.displayKey}: ${fmtEur(x.cost)}`).join(" + ") + ` = ${fmtEur(elecTotal)}`,
        timeRangeLabel: range.label,
        matchedExpenses: scopedElec
          .filter((x) => x.cost > 0)
          .map((x, idx) => ({
            id: `elec_${idx}_${x.key}`,
            monthKey: x.key,
            date: x.displayKey,
            merchantOrCategory: en ? "Electricity Bill" : "Сметка ТОК",
            categoryName: en ? "Electricity" : "Електроенергия",
            expenseAmount: x.cost,
            matchedAmount: x.cost,
            matchedKind: "electricity",
          })),
        totalMatchedAmount: parseFloat(elecTotal.toFixed(2)),
        followUpSuggestions: buildSuggestions(en, lang),
      };
    }
  }

  // If no meaningful search terms (e.g. "total spending this month" / "колко похарчих общо")
  if (terms.length === 0) {
    const totalExp = scopedExpenses.reduce((s, e) => s + e.amount, 0);
    const totalInc = range.entries.reduce(
      (s, e) => s + calculateMonthIncome(e.month, e.year, e.record),
      0
    );
    return {
      answer: tr(
        `Общи разходи за ${range.label}: ${fmtEur(totalExp)} (${scopedExpenses.length} записа). Приходи: ${fmtEur(totalInc)}.`,
        `Total spending in ${range.label}: ${fmtEur(totalExp)} (${scopedExpenses.length} expenses). Income: ${fmtEur(totalInc)}.`,
        `Gasto total en ${range.label}: ${fmtEur(totalExp)} (${scopedExpenses.length} gastos). Ingresos: ${fmtEur(totalInc)}.`
      ),
      calculation: tr(
        `Разходи (${scopedExpenses.length} записа) = ${fmtEur(totalExp)} | Нетен баланс = ${fmtEur(totalInc - totalExp)}`,
        `Expenses (${scopedExpenses.length} entries) = ${fmtEur(totalExp)} | Net balance = ${fmtEur(totalInc - totalExp)}`,
        `Gastos (${scopedExpenses.length} registros) = ${fmtEur(totalExp)} | Balance neto = ${fmtEur(totalInc - totalExp)}`
      ),
      timeRangeLabel: range.label,
      matchedExpenses: scopedExpenses
        .slice()
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map((e) => ({
          id: e.id,
          monthKey: e.monthKey,
          date: formatDateShort(e.date, en, lang),
          merchantOrCategory: e.merchantName || tCat(e.categoryName),
          categoryName: tCat(e.categoryName),
          expenseAmount: e.amount,
          matchedAmount: e.amount,
          matchedKind: e.isFixed ? "fixed" : "category",
          matchedSnippet: e.note ? e.note.split("\n").slice(0, 2).join(", ") : undefined,
        })),
      totalMatchedAmount: parseFloat(totalExp.toFixed(2)),
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  // Deep Match across category, merchant, priced receiptItems (using finalPrice), and unpriced note lines
  const matchedList: AiChatMatchedExpense[] = [];
  let itemizedSum = 0;
  let merchantOrCatSum = 0;
  let unitemizedNoteSum = 0;
  const calculationParts: string[] = [];

  for (const exp of scopedExpenses) {
    const merchantMatch = Boolean(exp.merchantName && textMatchesAnyTerm(exp.merchantName, terms));
    const categoryMatch = textMatchesAnyTerm(exp.categoryName, terms);

    // Check itemized receipt lines first (using finalPrice ?? price after discount!)
    const matchedReceiptItems = exp.parsedItems.filter((it) =>
      textMatchesAnyTerm(it.name, terms)
    );

    // If user asked directly for a merchant (e.g. "Lidl") or category (e.g. "Fuel"), sum full expense once
    if (merchantMatch || categoryMatch) {
      merchantOrCatSum += exp.amount;
      calculationParts.push(`${exp.merchantName || tCat(exp.categoryName)} (${fmtEur(exp.amount)})`);
      matchedList.push({
        id: exp.id,
        monthKey: exp.monthKey,
        date: formatDateShort(exp.date, en),
        merchantOrCategory: exp.merchantName || tCat(exp.categoryName),
        categoryName: tCat(exp.categoryName),
        expenseAmount: exp.amount,
        matchedAmount: exp.amount,
        matchedKind: merchantMatch ? "merchant" : "category",
        matchedSnippet:
          exp.parsedItems.length > 0
            ? `${exp.parsedItems.length} ${en ? "items" : "артикула"}`
            : exp.note || undefined,
      });
      continue;
    }

    if (matchedReceiptItems.length > 0) {
      const itemsSubtotal = matchedReceiptItems.reduce(
        (s, it) => s + (Number(it.finalPrice ?? it.price) || 0),
        0
      );
      itemizedSum += itemsSubtotal;
      const snippet = matchedReceiptItems
        .map((it) => {
          const p = it.finalPrice ?? it.price;
          const q = it.quantity && it.quantity >= 1 ? `${it.quantity} x ` : "";
          return `${q}${it.name} (${fmtEur(p)})`;
        })
        .join(", ");
      calculationParts.push(`${snippet} [${exp.merchantName || tCat(exp.categoryName)}]`);
      matchedList.push({
        id: exp.id,
        monthKey: exp.monthKey,
        date: formatDateShort(exp.date, en),
        merchantOrCategory: exp.merchantName || tCat(exp.categoryName),
        categoryName: tCat(exp.categoryName),
        expenseAmount: exp.amount,
        matchedAmount: parseFloat(itemsSubtotal.toFixed(2)),
        matchedKind: "item",
        matchedSnippet: snippet,
      });
      continue;
    }

    // Check unpriced plain text lines in notes (e.g. "Lidl €42\nBread\nWater\nCigarettes")
    const matchedPlainLines = exp.unpricedNoteLines.filter((line) =>
      textMatchesAnyTerm(line, terms)
    );
    const noteWholeMatch =
      matchedPlainLines.length === 0 && exp.note && textMatchesAnyTerm(exp.note, terms);

    if (matchedPlainLines.length > 0 || noteWholeMatch) {
      unitemizedNoteSum += exp.amount;
      const snippetText =
        matchedPlainLines.length > 0 ? matchedPlainLines.join(", ") : exp.note;
      calculationParts.push(
        `${exp.merchantName || tCat(exp.categoryName)} (${fmtEur(exp.amount)} — ${en ? "note" : "бележка"}: „${snippetText}“)`
      );
      matchedList.push({
        id: exp.id,
        monthKey: exp.monthKey,
        date: formatDateShort(exp.date, en),
        merchantOrCategory: exp.merchantName || tCat(exp.categoryName),
        categoryName: tCat(exp.categoryName),
        expenseAmount: exp.amount,
        matchedAmount: exp.amount,
        matchedKind: "note",
        matchedSnippet: snippetText,
      });
    }
  }

  const totalMatched = parseFloat(
    (itemizedSum + merchantOrCatSum + unitemizedNoteSum).toFixed(2)
  );

  if (matchedList.length === 0) {
    // Also check completed incomes by custom category name or note (e.g. custom income categories)
    const scopedIncomeMatches = completedIncomes.filter(
      (inc) =>
        (scopedKeys.size > 0 ? scopedKeys.has(inc.monthKey) : true) &&
        (textMatchesAnyTerm(inc.categoryName, terms) ||
          (inc.note && textMatchesAnyTerm(inc.note, terms)))
    );

    if (scopedIncomeMatches.length > 0) {
      const totalIncMatch = parseFloat(
        scopedIncomeMatches.reduce((s, inc) => s + inc.amount, 0).toFixed(2)
      );
      const calcStr =
        scopedIncomeMatches
          .slice(0, 6)
          .map((i) => `${tCat(i.categoryName)}: ${fmtEur(i.amount)}`)
          .join(" + ") + ` = ${fmtEur(totalIncMatch)}`;

      return {
        answer: en
          ? `Found ${scopedIncomeMatches.length} income ${scopedIncomeMatches.length === 1 ? "entry" : "entries"} matching "${displayTopic}" in ${range.label} totaling ${fmtEur(totalIncMatch)}.`
          : `Открити са ${scopedIncomeMatches.length} прихода за „${displayTopic}“ през ${range.label} на обща стойност ${fmtEur(totalIncMatch)}.`,
        calculation: calcStr,
        timeRangeLabel: range.label,
        matchedExpenses: scopedIncomeMatches.map((inc) => ({
          id: inc.id,
          monthKey: inc.monthKey,
          date: formatDateShort(inc.date, en, lang),
          merchantOrCategory: tCat(inc.categoryName),
          categoryName: tCat(inc.categoryName),
          expenseAmount: inc.amount,
          matchedAmount: inc.amount,
          matchedKind: "income",
          matchedSnippet: inc.note || undefined,
        })),
        totalMatchedAmount: totalIncMatch,
        followUpSuggestions: buildSuggestions(en, lang),
      };
    }

    const knownCatMatch =
      storedCategories.find((c) => textMatchesAnyTerm(c.name, terms)) ||
      storedIncomeCategories.find((c) => textMatchesAnyTerm(c.name, terms));
    const knownCatDisplay = knownCatMatch ? tCat(knownCatMatch.name) : "";
    return {
      answer: en
        ? `No expenses, receipt items, or notes matching "${displayTopic}" were found in ${range.label}.`
        : `Не бяха открити разходи, артикули от касови бележки или бележки за „${displayTopic}“ през ${range.label}.`,
      calculation: en
        ? `Checked ${scopedExpenses.length} expenses (categories, merchants, items, and notes)${knownCatMatch ? ` · Category "${knownCatDisplay}" has €0.00 in this period` : ""}.`
        : `Проверени ${scopedExpenses.length} разхода (категории, търговци, артикули и бележки)${knownCatMatch ? ` · Категория „${knownCatDisplay}“ има €0.00 за периода` : ""}.`,
      timeRangeLabel: range.label,
      matchedExpenses: [],
      totalMatchedAmount: 0,
      followUpSuggestions: buildSuggestions(en, lang),
    };
  }

  const hasMixedUnitemizedNote = unitemizedNoteSum > 0 && matchedList.some((m) => m.matchedKind === "note");
  let answerText = "";
  if (en) {
    answerText = hasMixedUnitemizedNote && itemizedSum === 0 && merchantOrCatSum === 0
      ? `Found ${matchedList.length} ${matchedList.length === 1 ? "expense" : "expenses"} mentioning "${displayTopic}" in notes during ${range.label} (note total: ${fmtEur(totalMatched)}, since no per-item price was listed in the note).`
      : `Total spent on "${displayTopic}" in ${range.label}: ${fmtEur(totalMatched)} across ${matchedList.length} ${matchedList.length === 1 ? "match" : "matches"}.`;
  } else {
    answerText = hasMixedUnitemizedNote && itemizedSum === 0 && merchantOrCatSum === 0
      ? `Открити са ${matchedList.length} разхода с „${displayTopic}“ в бележката за ${range.label} (обща стойност на бележките: ${fmtEur(totalMatched)}, тъй като в бележката няма единична цена на артикула).`
      : `Общо похарчено за „${displayTopic}“ за ${range.label}: ${fmtEur(totalMatched)} (${matchedList.length} ${matchedList.length === 1 ? "съвпадение" : "съвпадения"}).`;
  }

  const calcFormula =
    calculationParts.length <= 6
      ? `${calculationParts.join(" + ")} = ${fmtEur(totalMatched)}`
      : `${calculationParts.slice(0, 5).join(" + ")} + ${en ? `${calculationParts.length - 5} more` : `още ${calculationParts.length - 5}`} = ${fmtEur(totalMatched)}`;

  return {
    answer: answerText,
    calculation: calcFormula,
    timeRangeLabel: range.label,
    matchedExpenses: matchedList,
    totalMatchedAmount: totalMatched,
    followUpSuggestions: buildSuggestions(en, lang),
  };
}
