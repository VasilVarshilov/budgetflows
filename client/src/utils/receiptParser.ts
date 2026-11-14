/**
 * Robust Receipt Text Parser (Bulgarian-First + English Backwards Compatible)
 * Performs deterministic local text extraction on OCR outputs without requiring Gemini.
 */

export interface ParsedReceiptData {
  merchantName: string;
  date: string;
  totalAmount: number;
  subtotal?: number;
  tax?: number;
  currency: string;
  items: Array<{ name: string; price: number; quantity?: number }>;
  notesFormatted: string;
  confidence: "high" | "medium" | "low";
  matchedRule?: string;
  merchantRule?: string;
  dateRule?: string;
  warnings: string[];
}

interface KnownMerchantRule {
  canonical: string;
  categoryHint: string;
  patterns: RegExp[];
}

const KNOWN_BG_MERCHANTS: KnownMerchantRule[] = [
  {
    canonical: "Kaufland",
    categoryHint: "храна",
    patterns: [/kaufland/i, /кауфланд/i, /kauf1and/i, /кауфлаи[дл]/i],
  },
  {
    canonical: "Lidl",
    categoryHint: "храна",
    patterns: [/\blidl\b/i, /лидл/i, /лидъл/i, /\bl1dl\b/i, /\bl[i1|]d[l1|]\b/i],
  },
  {
    canonical: "Billa",
    categoryHint: "храна",
    patterns: [
      /\bbilla\b/i,
      /билла/i,
      /(?:^|[^а-яА-Яa-zA-Z])била(?:$|[^а-яА-Яa-zA-Z])/i,
      /\bb1lla\b/i,
      /\b8illa\b/i,
    ],
  },
  {
    canonical: "Fantastico",
    categoryHint: "храна",
    patterns: [/fantastico/i, /фантастико/i, /фантастико\s*груп/i],
  },
  {
    canonical: "T Market",
    categoryHint: "храна",
    patterns: [
      /\bt[\s-]*market\b/i,
      /т[\s-]*маркет/i,
      /максима\s*българия/i,
      /maxima\s*bulgaria/i,
    ],
  },
  {
    canonical: "Metro",
    categoryHint: "храна",
    patterns: [
      /\bmetro\b/i,
      /метро\s*кеш/i,
      /(?:^|[^а-яА-Яa-zA-Z])метро(?:$|[^а-яА-Яa-zA-Z])/i,
    ],
  },
  {
    canonical: "CBA",
    categoryHint: "храна",
    patterns: [/\bcba\b/i, /(?:^|[^а-яА-Яa-zA-Z])цба(?:$|[^а-яА-Яa-zA-Z])/i],
  },
  {
    canonical: "ProMarket",
    categoryHint: "храна",
    patterns: [/promarket/i, /промаркет/i],
  },
  {
    canonical: "DM",
    categoryHint: "козметика",
    patterns: [
      /\bdm\s*дрогери/i,
      /\bdm\s*българия/i,
      /\bdm\s*drogerie/i,
      /(?:^|[^а-яА-Яa-zA-Z])дм\s*българия/i,
      /^\s*dm\s*$/i,
      /^\s*дм\s*$/i,
    ],
  },
  {
    canonical: "Lilly",
    categoryHint: "козметика",
    patterns: [
      /lilly\s*drogerie/i,
      /\blilly\b/i,
      /лили\s*дрогери/i,
      /(?:^|[^а-яА-Яa-zA-Z])лили(?:$|[^а-яА-Яa-zA-Z])/i,
    ],
  },
  {
    canonical: "Sopharmacy",
    categoryHint: "аптека",
    patterns: [/sopharmacy/i, /софармаси/i, /софарма\s*трейдинг/i],
  },
  {
    canonical: "Subra",
    categoryHint: "аптека",
    patterns: [/\bsubra\b/i, /(?:^|[^а-яА-Яa-zA-Z])субра(?:$|[^а-яА-Яa-zA-Z])/i],
  },
  {
    canonical: "Remedium",
    categoryHint: "аптека",
    patterns: [/remedium/i, /ремедиум/i],
  },
  {
    canonical: "OMV",
    categoryHint: "гориво",
    patterns: [/\bomv\b/i, /(?:^|[^а-яА-Яa-zA-Z])омв(?:$|[^а-яА-Яa-zA-Z])/i, /\b0mv\b/i],
  },
  {
    canonical: "Shell",
    categoryHint: "гориво",
    patterns: [
      /\bshell\b/i,
      /(?:^|[^а-яА-Яa-zA-Z])шел(?:$|[^а-яА-Яa-zA-Z])/i,
      /шел\s*българия/i,
    ],
  },
  {
    canonical: "Lukoil",
    categoryHint: "гориво",
    patterns: [/lukoil/i, /лукойл/i, /лукойл[\s-]*българия/i],
  },
  {
    canonical: "Rompetrol",
    categoryHint: "гориво",
    patterns: [/rompetrol/i, /ромпетрол/i],
  },
  {
    canonical: "Eko",
    categoryHint: "гориво",
    patterns: [
      /\beko\b/i,
      /еко\s*българия/i,
      /(?:^|[^а-яА-Яa-zA-Z])еко(?:$|[^а-яА-Яa-zA-Z])/i,
    ],
  },
  {
    canonical: "Petrol",
    categoryHint: "гориво",
    patterns: [
      /\bpetrol\b/i,
      /(?:^|[^а-яА-Яa-zA-Z])петрол\s*ад(?:$|[^а-яА-Яa-zA-Z])/i,
    ],
  },
  {
    canonical: "Happy",
    categoryHint: "ресторант",
    patterns: [
      /happy\s*bar/i,
      /\bhappy\b/i,
      /хепи\s*бар/i,
      /(?:^|[^а-яА-Яa-zA-Z])хепи(?:$|[^а-яА-Яa-zA-Z])/i,
    ],
  },
  {
    canonical: "Raffy",
    categoryHint: "ресторант",
    patterns: [/\braffy\b/i, /(?:^|[^а-яА-Яa-zA-Z])рафи(?:$|[^а-яА-Яa-zA-Z])/i],
  },
  {
    canonical: "McDonald's",
    categoryHint: "ресторант",
    patterns: [/mcdonald/i, /макдоналдс/i],
  },
  {
    canonical: "KFC",
    categoryHint: "ресторант",
    patterns: [/\bkfc\b/i, /(?:^|[^а-яА-Яa-zA-Z])кфс(?:$|[^а-яА-Яa-zA-Z])/i, /самекс/i],
  },
  {
    canonical: "Burger King",
    categoryHint: "ресторант",
    patterns: [/burger\s*king/i, /бъргър\s*кинг/i],
  },
  {
    canonical: "Domino's",
    categoryHint: "ресторант",
    patterns: [/domino'?s/i, /доминос/i],
  },
  {
    canonical: "Cinema City",
    categoryHint: "кино",
    patterns: [/cinema\s*city/i, /синема\s*сити/i],
  },
  {
    canonical: "Kino Arena",
    categoryHint: "кино",
    patterns: [/kino\s*arena/i, /кино\s*арена/i],
  },
];

/**
 * Converts common Latin/Cyrillic OCR homoglyph mistakes into uppercase Cyrillic
 * strictly for keyword matching (never alters final displayed item names unnecessarily).
 */
export function toCyrillicMatchForm(text: string): string {
  const map: Record<string, string> = {
    A: "А",
    B: "В",
    C: "С",
    E: "Е",
    H: "Н",
    K: "К",
    M: "М",
    O: "О",
    P: "Р",
    T: "Т",
    X: "Х",
    Y: "У",
    N: "И",
    "0": "О",
    "3": "З",
  };
  return text
    .toUpperCase()
    .split("")
    .map((ch) => map[ch] || ch)
    .join("");
}

/**
 * Converts Cyrillic lookalike characters into uppercase Latin
 * for matching brand names like LIDL, BILLA, OMV, SHELL, KFC, HAPPY.
 */
export function toLatinMatchForm(text: string): string {
  const map: Record<string, string> = {
    А: "A",
    В: "B",
    Е: "E",
    К: "K",
    М: "M",
    Н: "H",
    О: "O",
    Р: "P",
    С: "C",
    Т: "T",
    У: "Y",
    Х: "X",
    И: "I",
    "0": "O",
    "1": "I",
    "|": "L",
  };
  return text
    .toUpperCase()
    .split("")
    .map((ch) => map[ch] || ch)
    .join("");
}

/**
 * Normalizes raw OCR text before parsing:
 * - Fixes Unicode spaces, OCR broken decimal separators ("12 , 50" -> "12,50")
 * - Fixes O/О -> 0 inside monetary/decimal patterns ("5.O0" -> "5.00", "12,3О" -> "12,30")
 * - Normalizes spaced Bulgarian currency tokens ("л в ." / "лB." -> "лв.")
 */
export function normalizeBulgarianOcrText(rawText: string): string {
  if (!rawText) return "";
  return rawText
    .replace(/\u00A0/g, " ")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/[–—]/g, "-")
    // Fix OCR spaces around decimal separators in numbers: "12 . 34" -> "12.34"
    .replace(/(\d)\s+([.,])\s+(\d{2})\b/g, "$1$2$3")
    // Fix OCR letter О/O inside decimal numbers like "12.3О" or "О.50" or "5,O0"
    .replace(/\b(\d*)[ОO]([.,])(\d{1,2})\b/g, "$10$2$3")
    .replace(/\b(\d+[.,])([ОO\d])([ОO\d])\b/g, (_m, p1, d1, d2) => {
      const f1 = d1 === "О" || d1 === "O" ? "0" : d1;
      const f2 = d2 === "О" || d2 === "O" ? "0" : d2;
      return `${p1}${f1}${f2}`;
    })
    // Normalize Bulgarian currency OCR variants: "лв .", "лB.", "л8." after digits
    .replace(/(\d)\s*л\s*[вB8]\s*\.?/gi, "$1 лв.")
    .replace(/(^|\s)л\s*в\s*\.?(?=\s|$)/gi, "$1лв.");
}

// Clean and normalize price string to a valid float
export function parsePrice(val: string): number | null {
  if (!val) return null;
  if (/%/.test(val)) return null;

  let clean = val
    .replace(/[$€£]/g, "")
    .replace(/лв\.?|лева|лев|BGN|EUR|USD|GBP|[:=]/gi, "")
    // Fix O/О -> 0 if isolated inside numeric string
    .replace(/(?<=\d)[ОO]|[ОO](?=[\d.,])/g, "0")
    .trim();

  // Reject trailing non-numeric artifacts
  clean = clean.replace(/[^\d.,-]+$/, "").trim();
  if (!clean) return null;

  // Format: 1.234,56 (European)
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(clean)) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  }
  // Format: 1,234.56 (US/UK)
  else if (/^\d{1,3}(,\d{3})*\.\d{1,2}$/.test(clean)) {
    clean = clean.replace(/,/g, "");
  }
  // Single comma decimal: 31,39 -> 31.39
  else if (/^\d+,\d{1,2}$/.test(clean)) {
    clean = clean.replace(",", ".");
  }

  const num = parseFloat(clean);
  return isNaN(num) || !isFinite(num) ? null : num;
}

// Clean text lines from OCR
function cleanLines(rawText: string): string[] {
  const normalized = normalizeBulgarianOcrText(rawText);
  return normalized
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}

/**
 * Checks whether a header line is metadata (VAT/EIK/Fiscal/Address/Receipt label)
 * rather than a merchant/store/restaurant name.
 */
function isNonMerchantMetadataLine(line: string): boolean {
  const cyr = toCyrillicMatchForm(line);
  const lat = toLatinMatchForm(line);

  const rejectPatterns: RegExp[] = [
    /^(FISCAL\s*RECEIPT|RECEIPT|TAX\s*INVOICE|INVOICE|SALES\s*RECEIPT|CUSTOMER\s*RECEIPT)/i,
    /(ФИСКАЛЕН\s*БОН|СИСТЕМЕН\s*БОН|СЛУЖЕБЕН\s*БОН|КАСОВА\s*БЕЛЕЖКА|КАСОВ\s*БОН|ФАКТУРА|ОРИГИНАЛ|ДУБЛИКАТ)/,
    /^(WELCOME|THANK\s*YOU|ДОБРЕ\s*ДОШЛИ|БЛАГОДАРИМ|МЕРСИ|ПРИЯТЕН\s*ДЕН)/,
    // VAT / EIK / Bulstat / BG...
    /\bBG\s*\d{8,11}\b/i,
    /(ЕИК|EIK|БУЛСТАТ|BULSTAT|ИН\s*ПО\s*ДДС|ДДС\s*№|ДДС\s*N|VAT\s*№|VAT\s*NO|ИН:|ИД\.?\s*№)/,
    // Fiscal device / Cash register / Receipt serial / Operator
    /(?:^|\s)(ФУ|ФП|ЗД|ДТ|УНП|НРА|ТД)(?:$|[\s:№N#\-\d])/,
    /(КАСА\s*№?|КАСИЕР|ОПЕРАТОР|БОН\s*№|ЧЕК\s*№|ПОС\s*ТЕРМИНАЛ|ТЕРМИНАЛ\s*№|ОБ\.?\s*№|МАГАЗИН\s*№|ОБ\.?\s*МЯСТО)/,
    // Address & Contact lines
    /(?:^|\s)(ГР\.|С\.|УЛ\.|БУЛ\.|Ж\.К\.|КВ\.|ПЛ\.|БЛ\.|ВХ\.|ЕТ\.|АП\.|ОБЛ\.|ОБЩ\.|П\.К\.)(?:\s|$)/,
    /(?:^|[^а-яА-Яa-zA-Z])(TEL|PHONE|ТЕЛ|ФАКС|FAX|EMAIL|E-MAIL|WWW\.|HTTP|HTTPS)(?:$|[^а-яА-Яa-zA-Z])/i,
    // Date / Time / Pure numbers / Lines with trailing prices
    /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/,
    /^\d+[\s\-/.:]*$/,
    /\d+[.,]\d{2}\s*(?:[АБВГABCD]|ЛВ\.?|BGN|EUR|€)?\s*$/i,
  ];

  return (
    rejectPatterns.some((re) => re.test(line)) ||
    rejectPatterns.some((re) => re.test(cyr)) ||
    rejectPatterns.some((re) => re.test(lat))
  );
}

// Clean legal entity suffixes and decorative chars from store name
function cleanMerchantName(raw: string): string {
  return raw
    .replace(/[#*=_~•|]/g, " ")
    .replace(/[„“"«»]/g, "")
    .replace(/\b(ЕООД|ООД|ЕАД|АД|ЕТ|СД|КД|LTD|LLC|GMBH|INC)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[-:.,\s]+|[-:.,\s]+$/g, "")
    .trim();
}

// Extract Merchant Name from receipt header lines (Bulgarian-first)
export function extractMerchant(lines: string[]): {
  merchantName: string;
  matchedRule: string;
} {
  // 1. Check top 14 lines (or entire header) against known Bulgarian/international chains
  const searchSlice = lines.slice(0, Math.min(lines.length, 15));
  for (const line of searchSlice) {
    const cyr = toCyrillicMatchForm(line);
    const lat = toLatinMatchForm(line);
    for (const rule of KNOWN_BG_MERCHANTS) {
      if (
        rule.patterns.some((p) => p.test(line) || p.test(cyr) || p.test(lat))
      ) {
        return {
          merchantName: rule.canonical,
          matchedRule: `Known brand match: ${rule.canonical} ("${line}")`,
        };
      }
    }
  }

  // 2. Fallback: pick first clean header line that isn't VAT/EIK/Fiscal/Address/Receipt metadata
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const rawLine = lines[i].trim();
    if (rawLine.length < 2) continue;
    if (isNonMerchantMetadataLine(rawLine)) continue;

    const cleaned = cleanMerchantName(rawLine);
    const letterCount = (cleaned.match(/[a-zA-Zа-яА-Я]/g) || []).length;
    if (cleaned.length >= 2 && letterCount >= 2 && !/^\d+$/.test(cleaned)) {
      return {
        merchantName: cleaned,
        matchedRule: `Header line #${i + 1}: "${rawLine}"`,
      };
    }
  }

  return {
    merchantName: "Касова бележка",
    matchedRule: "Default fallback",
  };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 2018 || year > 2035) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

// Extract Transaction Date (YYYY-MM-DD), prioritizing Bulgarian DD.MM.YYYY / ДАТА lines
export function extractDate(lines: string[]): {
  date: string;
  matchedRule: string;
} {
  interface DateCandidate {
    iso: string;
    score: number;
    rule: string;
  }
  const candidates: DateCandidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cyr = toCyrillicMatchForm(line);

    const hasDateLabel = /(ДАТА|DATE|ДЕН|ЧАС)/.test(cyr);
    const hasTime = /\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.]([0-5]\d))?\b/.test(line);
    const isFiscalOrIdLine =
      /(УНП|ЕИК|БУЛСТАТ|(?:^|\s)(?:ФУ|ФП)(?:$|[\s:№N#\-\d])|BG\d|БОН\s*№|СТОРНО|КАСА)/.test(cyr) &&
      !hasDateLabel;

    // 1. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (with optional spaces around separator)
    const dmyFull = line.match(
      /(?:^|[^\d])([0-3]?\d)\s*[-/.]\s*([01]?\d)\s*[-/.]\s*(20[1-3]\d)(?:[^\d]|$)/
    );
    if (dmyFull) {
      let day = parseInt(dmyFull[1], 10);
      let month = parseInt(dmyFull[2], 10);
      const year = parseInt(dmyFull[3], 10);

      // Only treat slash-separated as MM/DD/YYYY if month > 12 and day <= 12
      if (month > 12 && day <= 12 && line.includes("/")) {
        const tmp = day;
        day = month;
        month = tmp;
      }

      if (isValidCalendarDate(year, month, day)) {
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        candidates.push({
          iso,
          score:
            80 +
            (hasDateLabel ? 30 : 0) +
            (hasTime ? 20 : 0) +
            (isFiscalOrIdLine ? -50 : 0),
          rule: `DD.MM.YYYY in "${line}"`,
        });
      }
    }

    // 2. YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    const ymdFull = line.match(
      /(?:^|[^\d])(20[1-3]\d)\s*[-/.]\s*([01]?\d)\s*[-/.]\s*([0-3]?\d)(?:[^\d]|$)/
    );
    if (ymdFull) {
      const year = parseInt(ymdFull[1], 10);
      const month = parseInt(ymdFull[2], 10);
      const day = parseInt(ymdFull[3], 10);
      if (isValidCalendarDate(year, month, day)) {
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        candidates.push({
          iso,
          score:
            75 +
            (hasDateLabel ? 30 : 0) +
            (hasTime ? 20 : 0) +
            (isFiscalOrIdLine ? -50 : 0),
          rule: `YYYY-MM-DD in "${line}"`,
        });
      }
    }

    // 3. DD.MM.YY or DD/MM/YY or DD-MM-YY
    const dmyShort = line.match(
      /(?:^|[^\d])([0-3]?\d)\s*[-/.]\s*([01]?\d)\s*[-/.]\s*(2[0-9]|1[89])(?:[^\d]|$)/
    );
    if (dmyShort && !dmyFull && !ymdFull) {
      const day = parseInt(dmyShort[1], 10);
      const month = parseInt(dmyShort[2], 10);
      const year = 2000 + parseInt(dmyShort[3], 10);
      if (isValidCalendarDate(year, month, day)) {
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        candidates.push({
          iso,
          score:
            65 +
            (hasDateLabel ? 30 : 0) +
            (hasTime ? 20 : 0) +
            (isFiscalOrIdLine ? -50 : 0),
          rule: `DD.MM.YY in "${line}"`,
        });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return {
      date: candidates[0].iso,
      matchedRule: candidates[0].rule,
    };
  }

  return {
    date: new Date().toISOString().split("T")[0],
    matchedRule: "Default today fallback",
  };
}

// Extract Currency (Bulgarian-aware, handles dual-currency receipts)
export function extractCurrency(rawText: string): string {
  const normalized = normalizeBulgarianOcrText(rawText);
  const hasBgn = /(?:лв\.?|лева|лев|\bbgn\b)/i.test(normalized);
  const hasEur = /(?:€|\beur\b|евро)/i.test(normalized);
  const hasUsd = /(?:\$|\busd\b)/i.test(normalized);
  const hasGbp = /(?:£|\bgbp\b)/i.test(normalized);

  // Check total/payment lines to identify primary receipt currency
  const lines = normalized.split(/\r?\n/);
  for (const line of lines) {
    const cyr = toCyrillicMatchForm(line);
    if (/(ОБЩО|ОБЩА\s*СУМА|КРАЙНА\s*СУМА|ЗА\s*ПЛАЩАНЕ|СУМА|TOTAL)/.test(cyr)) {
      const bgnPos = line.search(/(?:лв\.?|\bbgn\b)/i);
      const eurPos = line.search(/(?:€|\beur\b)/i);
      if (bgnPos !== -1 && (eurPos === -1 || bgnPos < eurPos)) return "лв.";
      if (eurPos !== -1 && (bgnPos === -1 || eurPos < bgnPos)) return "€";
    }
  }

  if (hasBgn && !hasEur) return "лв.";
  if (hasEur && !hasBgn) return "€";
  if (hasBgn && hasEur) return "лв."; // Primary fiscal currency in dual-display BG receipts
  if (hasUsd) return "$";
  if (hasGbp) return "£";

  // If receipt contains Cyrillic text without explicit currency symbol, default to лв.
  if (/[а-яА-Я]{3,}/.test(normalized)) return "лв.";
  return "€";
}

/**
 * Robust Total Amount Extraction Algorithm (Bulgarian-First)
 * Handles ОБЩО, ОБЩА СУМА, КРАЙНА СУМА, ЗА ПЛАЩАНЕ, СУМА, ТОТАЛ, TOTAL, GRAND TOTAL
 * and strictly ignores VAT (ДДС), discounts (ОТСТЪПКА), subtotals, and change (РЕСТО).
 */
export function extractTotal(lines: string[]): {
  total: number;
  subtotal?: number;
  tax?: number;
  matchedLine?: string;
  confidence: "high" | "medium" | "low";
} {
  let foundSubtotal: number | undefined;
  let foundTax: number | undefined;

  const subtotalRegex = /(?:SUB\s*TOTAL|МЕЖДИННА\s*СУМА)\s*[:=]?\s*[$€£]?\s*([\d,.]+)/i;
  const taxRegex = /(?:TAX|VAT|ДДС|ДАНЪК)\s*(?:\([^)]*\))?\s*(?:\d+[.,]?\d*\s*%)?\s*[:=]?\s*[$€£]?\s*([\d,.]+)/i;

  for (const line of lines) {
    const cyr = toCyrillicMatchForm(line);
    if (!foundSubtotal) {
      const subMatch = cyr.match(subtotalRegex) || line.match(subtotalRegex);
      if (subMatch) {
        const val = parsePrice(subMatch[1]);
        if (val && val > 0) foundSubtotal = val;
      }
    }
    if (!foundTax) {
      const taxMatch = cyr.match(taxRegex) || line.match(taxRegex);
      if (taxMatch) {
        const val = parsePrice(taxMatch[1]);
        if (val && val > 0 && val < 50000) foundTax = val;
      }
    }
  }

  // Ranked keyword rules (tested against both raw uppercase and Cyrillic/Latin normalized text)
  const totalKeywordRules: Array<{ regex: RegExp; basePriority: number; label: string }> = [
    {
      regex: /(?:ОБЩА\s*СУМА|КРАЙНА\s*СУМА|СУМА\s*ЗА\s*ПЛАЩАНЕ|ОБЩО\s*ЗА\s*ПЛАЩАНЕ|ДЪЛЖИМА\s*СУМА)/,
      basePriority: 105,
      label: "BG explicit final total",
    },
    {
      regex: /(?:GRAND\s*TOTAL|TOTAL\s*DUE|AMOUNT\s*DUE|BALANCE\s*DUE)/,
      basePriority: 100,
      label: "EN explicit final total",
    },
    {
      regex: /(?:^|\s)(?:ЗА\s*ПЛАЩАНЕ|ОБЩО\s*ЛВ|ОБЩО\s*EUR|ОБЩО\s*BGN)(?:$|[\s:=\d])/,
      basePriority: 96,
      label: "BG ЗА ПЛАЩАНЕ / ОБЩО",
    },
    {
      regex: /(?:^|\s)ОБЩО(?:$|[\s:=]|\s+\d)/,
      basePriority: 94,
      label: "BG ОБЩО",
    },
    {
      regex: /(?:^|\s)(?:ВСИЧКО|ТОТАЛ)(?:$|[\s:=\d])/,
      basePriority: 88,
      label: "BG ВСИЧКО / ТОТАЛ",
    },
    {
      regex: /(?:^|\s)СУМА(?:$|[\s:=]|\s+\d)/,
      basePriority: 84,
      label: "BG СУМА",
    },
    {
      regex: /\bTOTAL\b/,
      basePriority: 80,
      label: "EN TOTAL",
    },
  ];

  interface TotalCandidate {
    amount: number;
    priority: number;
    line: string;
    ruleLabel: string;
  }
  const candidates: TotalCandidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cyr = toCyrillicMatchForm(line);
    const lat = toLatinMatchForm(line);

    // Strictly exclude VAT, discount, change, subtotal, net, or taxable base lines
    const isExcludedSummaryLine =
      /(?:SUB\s*TOTAL|МЕЖДИННА\s*СУМА|НЕТО|ОБЛАГАЕМ|ДАНЪЧНА\s*ОСНОВА|ДАНЪЧНА\s*ГРУПА)/.test(cyr) ||
      /(?:^|\s)(?:ДДС|ДАНЪК|VAT|TAX)(?:\s|$|:|=)/.test(cyr) ||
      /(?:ОТСТЪПКА|НАМАЛЕНИЕ|СПЕСТЕНИ|DISCOUNT|SAVED|РЕСТО|ВЪРНАТИ|CHANGE)/.test(cyr);

    if (isExcludedSummaryLine) continue;

    // Penalize tendered-cash / card-tender lines unless paired with explicit total
    const isPaymentTenderLine =
      /(?:В\s*БРОЙ|БРОЙ|ПОС|ТЕРМИНАЛ|РЕСТО|CASH|CARD|VISA|MASTERCARD)/.test(cyr);

    for (const rule of totalKeywordRules) {
      if (rule.regex.test(cyr) || rule.regex.test(lat)) {
        // Extract non-percentage monetary decimals on this line
        const lineWithoutPct = line.replace(/\d+[.,]\d+\s*%/g, " ").replace(/\d+\s*%/g, " ");
        const numMatches =
          lineWithoutPct.match(/[$€£]?\s*\d{1,6}[.,]\d{2}(?:\s*(?:лв\.?|BGN|EUR|€))?/gi) || [];

        for (const rawNum of numMatches) {
          const val = parsePrice(rawNum);
          if (val && val > 0) {
            candidates.push({
              amount: val,
              priority: rule.basePriority + (isPaymentTenderLine ? -25 : 0),
              line,
              ruleLabel: rule.label,
            });
            // Prefer the FIRST (primary) monetary amount on dual-currency lines (e.g. "ОБЩО 31.39 лв. / 16.05 EUR")
            break;
          }
        }

        // Handle wrapped total on next line: "ОБЩО" -> "31.39 лв."
        if (numMatches.length === 0 && i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextClean = nextLine.replace(/\d+[.,]?\d*\s*%/g, " ");
          const nextMatch = nextClean.match(
            /[$€£]?\s*(\d{1,6}[.,]\d{2})(?:\s*(?:лв\.?|BGN|EUR|€))?/i
          );
          if (nextMatch) {
            const val = parsePrice(nextMatch[1]);
            if (val && val > 0) {
              candidates.push({
                amount: val,
                priority: rule.basePriority - 5,
                line: `${line} ${nextLine}`,
                ruleLabel: `${rule.label} (next line)`,
              });
            }
          }
        }
        break; // Stop after highest-ranked matching keyword on this line
      }
    }
  }

  // 1. Evaluate explicit TOTAL keyword candidates FIRST
  if (candidates.length > 0) {
    if (foundSubtotal && foundSubtotal > 0) {
      candidates.forEach((c) => {
        if (c.amount < foundSubtotal * 0.8) {
          c.priority -= 80;
        } else if (Math.abs(c.amount - (foundSubtotal + (foundTax || 0))) < 0.05) {
          c.priority += 40;
        }
      });
    }

    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.amount - a.amount;
    });

    const best = candidates[0];
    if (best.priority > 0) {
      return {
        total: best.amount,
        subtotal: foundSubtotal,
        tax: foundTax,
        matchedLine: best.line,
        confidence: best.priority >= 80 ? "high" : "medium",
      };
    }
  }

  // 2. Fallback: Subtotal + Tax
  if (foundSubtotal && foundTax) {
    const expectedTotal = parseFloat((foundSubtotal + foundTax).toFixed(2));
    if (expectedTotal > 0) {
      return {
        total: expectedTotal,
        subtotal: foundSubtotal,
        tax: foundTax,
        matchedLine: `SUBTOTAL (${foundSubtotal}) + TAX (${foundTax}) = ${expectedTotal}`,
        confidence: "high",
      };
    }
  }

  // 3. Fallback: Payment method line (e.g. КАРТА / В БРОЙ minus РЕСТО)
  for (const line of lines) {
    const cyr = toCyrillicMatchForm(line);
    if (/(?:^|\s)(?:ПЛАТЕНО|КАРТА|ПЛАЩАНЕ\s*С\s*КАРТА)(?:$|[\s:=\d])/.test(cyr)) {
      const m = line.match(/(\d{1,6}[.,]\d{2})/);
      const val = m ? parsePrice(m[1]) : null;
      if (val && val > 0) {
        return {
          total: val,
          subtotal: foundSubtotal,
          tax: foundTax,
          matchedLine: `Payment fallback: ${line}`,
          confidence: "medium",
        };
      }
    }
  }

  // 4. Last fallback: largest monetary number in bottom 50% excluding dates/VAT/change
  const bottomLines = lines.slice(Math.floor(lines.length * 0.4));
  let fallbackMax = 0;
  let fallbackLine = "";

  for (const line of bottomLines) {
    const cyr = toCyrillicMatchForm(line);
    if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(line)) continue;
    if (/(ДДС|VAT|TAX|РЕСТО|CHANGE|ОТСТЪПКА|DISCOUNT|ЕИК|УНП)/.test(cyr)) continue;
    const matches = line.match(/(\d{1,5}[.,]\d{2})\b/g) || [];
    for (const m of matches) {
      const val = parsePrice(m);
      if (val && val > fallbackMax && val < 100000) {
        fallbackMax = val;
        fallbackLine = line;
      }
    }
  }

  if (fallbackMax > 0) {
    return {
      total: fallbackMax,
      subtotal: foundSubtotal,
      tax: foundTax,
      matchedLine: fallbackLine,
      confidence: "low",
    };
  }

  return {
    total: 0,
    confidence: "low",
  };
}

/**
 * Checks if a line is a receipt summary, payment, VAT, discount, or terminal line
 * (never an item row).
 */
function isNonItemSummaryOrMetaLine(line: string): boolean {
  const cyr = toCyrillicMatchForm(line);
  const lat = toLatinMatchForm(line);

  const rejectCyr = [
    /(?:^|\s)(?:SUBTOTAL|SUB\s*TOTAL|TOTAL|GRAND\s*TOTAL|TAX|VAT|CASH|CHANGE|BALANCE|CARD|VISA|MASTERCARD|AMEX|DISCOUNT|SAVED)(?:$|[\s:=\d])/i,
    /(?:^|\s)(?:МЕЖДИННА\s*СУМА|ОБЩА\s*СУМА|КРАЙНА\s*СУМА|ЗА\s*ПЛАЩАНЕ|ОБЩО|СУМА|ВСИЧКО|ТОТАЛ|ДЪЛЖИМА)(?:$|[\s:=\d])/,
    /(?:^|\s)(?:ДДС|ДАНЪК|ДАНЪЧНА\s*ГРУПА|ДАНЪЧНА\s*ОСНОВА|НЕТО|ОБЛАГАЕМА|ГРУПА\s*[АБВГA-D])(?:$|[\s:=\d%])/,
    /(?:^|\s)(?:В\s*БРОЙ|КАРТА|ПЛАТЕНО|ПЛАЩАНЕ|ПОС\s*ТЕРМИНАЛ|ТЕРМИНАЛ|РЕСТО|ВЪРНАТИ|ОДОБРЕНИЕ|ОДОБРЕНА)(?:$|[\s:=\d])/,
    /(?:^|\s)(?:ОТСТЪПКА|НАМАЛЕНИЕ|СПЕСТЕНИ|ВАУЧЕР|КУПОН|ТОЧКИ)(?:$|[\s:=\d])/,
    /(?:^|\s)(?:ЕИК|БУЛСТАТ|ДДС\s*№|ИН\s*ПО\s*ДДС|ФУ|ФП|ЗД|УНП|КАСА|КАСИЕР|ОПЕРАТОР|БОН\s*№|АРТИКУЛА)(?:$|[\s:№N#\-\d])/,
    /(?:^|\s)(?:ТЕЛ|ФАКС|WWW\.|HTTP|БЛАГОДАРИМ|МЕРСИ|ДОБРЕ\s*ДОШЛИ|ФИСКАЛЕН\s*БОН|СЛУЖЕБЕН\s*БОН)(?:$|[\s:!.])/,
    /\b(?:AID|AUTH|PAN|RRN|STAN|TID|MID)\b/i,
    /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/,
    /^\d{1,2}:\d{2}(?::\d{2})?/,
  ];

  return (
    rejectCyr.some((re) => re.test(line)) ||
    rejectCyr.some((re) => re.test(cyr)) ||
    rejectCyr.some((re) => re.test(lat))
  );
}

/**
 * Formats ALL-CAPS item names into readable Sentence case while keeping abbreviations
 */
function formatReadableItemName(rawName: string): string {
  const cleaned = rawName
    .replace(/^[•\-*\d.)\s]+(?=[а-яА-Яa-zA-Z])/, "")
    .replace(/[.*_~=-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return cleaned;

  const letters = cleaned.replace(/[^а-яА-Яa-zA-Z]/g, "");
  const isMostlyUpper =
    letters.length > 0 && letters === letters.toUpperCase();

  if (!isMostlyUpper) return cleaned;

  // Preserve numeric/unit tokens (e.g. 500Г, 1.5Л, АИ95, Т1) while title-casing first letter
  const lower = cleaned.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Extract Item Lines from text (Bulgarian-first + 2-line quantity patterns + trailing tax groups)
export function extractItems(
  lines: string[],
  _totalAmount: number
): Array<{ name: string; price: number; quantity?: number }> {
  const items: Array<{ name: string; price: number; quantity?: number }> = [];

  // Regex for trailing price on Bulgarian/English receipts:
  // Matches: "2.39", "2,39", "2.39 Б", "2.39 B", "2.39 *Б", "2.39 лв.", "2.39 EUR", "€2.39"
  const trailingPriceRegex =
    /[$€£]?\s*(\d{1,5}[.,]\d{2})\s*(?:[*#]?\s*[АБВГA-D](?=$|\s)|лв\.?|BGN|EUR|USD|GBP|€|\$|£)?\s*$/i;

  // Two-line quantity/weight row e.g.:
  // "2 x 1.20           2.40 Б" or "0.542 кг x 12.90   6.99 Б" or "32.15 л x 2.65  85.20 Б"
  const qtyCalculationLineRegex =
    /^(\d+(?:[.,]\d+)?)\s*(?:бр\.?|кг\.?|гр\.?|г\.?|л\.?|kg|g|l|pcs)?\s*[xхX*×]\s*(\d+[.,]\d{2,3})\s+.*?(\d{1,5}[.,]\d{2})\s*(?:[*#]?\s*[АБВГA-D](?=$|\s)|лв\.?|BGN|EUR|€|\$|£)?\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isNonItemSummaryOrMetaLine(line)) continue;

    // 1. Check for two-line item pattern:
    //    Line i-1: "ХЛЯБ ДОБРУДЖА 650Г"
    //    Line i  : "2 x 1.20            2.40 Б"
    const qtyLineMatch = line.match(qtyCalculationLineRegex);
    if (qtyLineMatch && i > 0) {
      const prevLine = lines[i - 1];
      const prevHasPrice = trailingPriceRegex.test(prevLine);
      const prevHasLetters = /[а-яА-Яa-zA-Z]{2,}/.test(prevLine);
      if (
        prevHasLetters &&
        !prevHasPrice &&
        !isNonItemSummaryOrMetaLine(prevLine) &&
        !isNonMerchantMetadataLine(prevLine)
      ) {
        const rawQty = parseFloat(qtyLineMatch[1].replace(",", "."));
        const totalLinePrice = parsePrice(qtyLineMatch[3]);
        const isDiscreteCount =
          !/(?:кг|гр|л\.?|kg|g|l)/i.test(line) &&
          Number.isInteger(rawQty) &&
          rawQty >= 1 &&
          rawQty <= 99;
        const unitLabelMatch = line.match(
          /^(\d+(?:[.,]\d+)?\s*(?:кг|л|гр|kg|l|g))(?=$|[^а-яА-Яa-zA-Z])/i
        );
        const displayName = unitLabelMatch
          ? `${formatReadableItemName(prevLine)} (${unitLabelMatch[1].trim()})`
          : formatReadableItemName(prevLine);

        if (totalLinePrice && totalLinePrice > 0 && displayName.length >= 2) {
          items.push({
            name: displayName,
            price: totalLinePrice,
            quantity: isDiscreteCount ? rawQty : 1,
          });
        }
        continue;
      }
    }

    // 2. Standard single-line item with trailing price
    const hasLetters = /[а-яА-Яa-zA-Z]{2,}/.test(line);
    if (!hasLetters) continue;
    if (isNonMerchantMetadataLine(line) && !trailingPriceRegex.test(line)) {
      continue;
    }

    const priceMatch = line.match(trailingPriceRegex);
    if (priceMatch && priceMatch.index !== undefined) {
      const price = parsePrice(priceMatch[1]);
      let rawName = line.slice(0, priceMatch.index).trim();

      // Strip inline "qty x unitPrice" segment if embedded on the same line:
      // e.g. "АИ 95 БЕНЗИН 32.15 л x 2.65" or "САЛАТА ШОПСКА 2 x 7.90"
      let quantity = 1;
      const inlineQtyUnitMatch = rawName.match(
        /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:бр\.?|кг\.?|л\.?|kg|g|l)?\s*[xхX*×]\s*\d+[.,]\d{2,3}\s*$/i
      );
      if (inlineQtyUnitMatch) {
        rawName = inlineQtyUnitMatch[1].trim();
        const qVal = parseFloat(inlineQtyUnitMatch[2].replace(",", "."));
        if (
          !/(?:кг|л|гр|kg|l|g)/i.test(inlineQtyUnitMatch[0]) &&
          Number.isInteger(qVal) &&
          qVal >= 1 &&
          qVal <= 99
        ) {
          quantity = qVal;
        }
      } else {
        // Check prefix quantity like "2 x БИРА ЗАГОРКА"
        const prefixQtyMatch = rawName.match(/^(\d+)\s*[xхX*×]\s*(.+)$/);
        if (prefixQtyMatch) {
          const qVal = parseInt(prefixQtyMatch[1], 10);
          if (qVal >= 1 && qVal <= 99) {
            quantity = qVal;
            rawName = prefixQtyMatch[2].trim();
          }
        }
      }

      // Clean trailing separator dots/dashes/currency left on item name
      rawName = rawName.replace(/[.\-_=~*:\s]+$/, "").trim();
      const name = formatReadableItemName(rawName);

      // Avoid picking up EIK/VAT/address/phone fragments that happen to end with digits
      if (
        name.length >= 2 &&
        /[а-яА-Яa-zA-Z]{2,}/.test(name) &&
        !isNonItemSummaryOrMetaLine(name) &&
        !isNonMerchantMetadataLine(name) &&
        price &&
        price > 0 &&
        price < 50000
      ) {
        items.push({ name, price, quantity });
      }
    }
  }

  return items;
}

/**
 * Formats extracted receipt items into clean multi-line Bulgarian notes:
 * Example:
 * Хляб бял - 2.39 лв.
 * Прясно мляко - 3.49 лв.
 */
export function formatReceiptNotes(
  items: Array<{ name: string; price: number; quantity?: number }>,
  currency: string = "лв."
): string {
  if (!items || items.length === 0) return "";

  return items
    .map((it) => {
      const qtyStr = it.quantity && it.quantity > 1 ? `${it.quantity}x ` : "";
      if (currency === "лв." || currency === "BGN") {
        return `${qtyStr}${it.name} - ${it.price.toFixed(2)} лв.`;
      }
      return `${qtyStr}${it.name} - ${currency}${it.price.toFixed(2)}`;
    })
    .join("\n");
}

/**
 * Main Deterministic Local Receipt Parser (Bulgarian-First)
 * Operates instantly on OCR text without requiring Gemini API calls.
 */
export function parseReceiptTextLocally(rawText: string): ParsedReceiptData {
  const lines = cleanLines(rawText);
  const merchantRes = extractMerchant(lines);
  const dateRes = extractDate(lines);
  const currency = extractCurrency(rawText);
  const totalResult = extractTotal(lines);
  const items = extractItems(lines, totalResult.total);

  // If totalAmount could not be found explicitly, fall back to sum of parsed items
  let finalTotal = totalResult.total;
  let finalConfidence = totalResult.confidence;
  let finalRule = totalResult.matchedLine;

  if (finalTotal <= 0 && items.length > 0) {
    finalTotal = parseFloat(
      items.reduce((sum, item) => sum + item.price, 0).toFixed(2)
    );
    finalConfidence = "medium";
    finalRule = `Sum of ${items.length} extracted items`;
  }

  const notesFormatted = formatReceiptNotes(items, currency);

  const warnings: string[] = [];
  if (finalTotal <= 0) {
    warnings.push(
      "Не беше открита категорична обща сума. Моля, проверете полето за сума."
    );
  } else if (finalConfidence === "low") {
    warnings.push(
      `Сумата (${finalTotal.toFixed(2)} ${currency}) беше избрана автоматично. Моля, проверете дали съвпада.`
    );
  }

  // Detailed structured debug logging for Bulgarian/English receipt diagnostics
  console.log("[Receipt Parser] Diagnostics:", {
    lineCount: lines.length,
    currency,
    detectedMerchant: merchantRes.merchantName,
    merchantRule: merchantRes.matchedRule,
    detectedDate: dateRes.date,
    dateRule: dateRes.matchedRule,
    detectedTotal: finalTotal,
    totalRule: finalRule,
    confidence: finalConfidence,
    detectedItemsCount: items.length,
    detectedItems: items,
  });

  return {
    merchantName: merchantRes.merchantName,
    date: dateRes.date,
    totalAmount: finalTotal,
    subtotal: totalResult.subtotal,
    tax: totalResult.tax,
    currency,
    items,
    notesFormatted,
    confidence: finalConfidence,
    matchedRule: finalRule,
    merchantRule: merchantRes.matchedRule,
    dateRule: dateRes.matchedRule,
    warnings,
  };
}
