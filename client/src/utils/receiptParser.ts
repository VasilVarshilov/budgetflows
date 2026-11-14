/**
 * Robust Receipt Text Parser (Bulgarian-First + Euro-First + English Backwards Compatible)
 * Performs deterministic local text extraction on OCR outputs without requiring Gemini.
 */

export interface ParsedReceiptData {
  merchantName: string;
  date: string;
  dateDetected: boolean;
  dateFallbackReason?: string;
  totalAmount: number;
  itemsTotal: number;
  totalDifference: number;
  totalDifferencePercent: number;
  totalMismatchWarning?: string;
  expectedItemsCount?: number;
  discountTotal?: number;
  subtotal?: number;
  tax?: number;
  currency: string;
  items: Array<{ name: string; price: number; quantity: number }>;
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
 * strictly for keyword matching.
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
    "8": "В",
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
    "8": "B",
    "|": "L",
  };
  return text
    .toUpperCase()
    .split("")
    .map((ch) => map[ch] || ch)
    .join("");
}

/**
 * Repairs OCR homoglyphs inside words that are clearly Bulgarian/Cyrillic
 * (contain at least one Cyrillic character), leaving pure English words (Coca Cola, Water) untouched.
 * Handles: О↔0, В↔B, С↔C, И↔N, 8↔В, 6↔Б, A↔А, E↔Е, K↔К, M↔М, H↔Н, P↔Р, T↔Т, X↔Х.
 */
export function repairCyrillicWordTokens(text: string): string {
  const letterHomoglyphMap: Record<string, string> = {
    A: "А",
    a: "а",
    B: "В",
    C: "С",
    c: "с",
    E: "Е",
    e: "е",
    H: "Н",
    K: "К",
    k: "к",
    M: "М",
    O: "О",
    o: "о",
    P: "Р",
    p: "р",
    T: "Т",
    X: "Х",
    x: "х",
    N: "И",
  };

  const unitOrCodeToken =
    /^\d+(?:[.,]\d+)?(?:г|гр|кг|мл|л|см|мм|бр|шт|g|gr|kg|ml|l|pcs)\.?$/i;

  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!token || /^\s+$/.test(token)) return token;
      if (!/[а-яА-Я]/.test(token)) return token; // Pure English / numbers untouched
      if (unitOrCodeToken.test(token)) return token; // Measurements like 500г, 1.5л untouched
      if (/^АИ\d+$/i.test(token)) return token; // Fuel grade АИ95 untouched

      let repaired = token
        .split("")
        .map((ch) => letterHomoglyphMap[ch] || ch)
        .join("");

      // Repair 0->О, 8->В, 6->Б only when part of an alphabetic Cyrillic word (not numbers like 500г or 95)
      if (/^[а-яА-Я086-]+$/.test(repaired) && /[а-яА-Я]{2,}/.test(repaired)) {
        const isAllLower = repaired === repaired.toLowerCase();
        repaired = repaired
          .replace(/0/g, isAllLower ? "о" : "О")
          .replace(/8/g, isAllLower ? "в" : "В")
          .replace(/6/g, isAllLower ? "б" : "Б");
      }

      return repaired;
    })
    .join("");
}

/**
 * Normalizes raw OCR text before parsing:
 * - Fixes Unicode spaces, OCR broken decimal separators ("4 . 80" -> "4.80")
 * - Fixes О/O -> 0 inside monetary/decimal patterns & years ("€4.8O" -> "€4.80", "14.11.2O26" -> "14.11.2026")
 * - Normalizes EUR / € / лв. / бр. / × variants
 */
export function normalizeBulgarianOcrText(rawText: string): string {
  if (!rawText) return "";
  return (
    rawText
      .replace(/\u00A0/g, " ")
      .replace(/[“”„‟]/g, '"')
      .replace(/[‘’`]/g, "'")
      .replace(/[–—]/g, "-")
      // Normalize spaced EUR / BGN tokens
      .replace(/\bE\s*U\s*R\b/gi, "EUR")
      // Fix OCR spaces on either/both sides of decimal separators in prices (e.g. "4 . 80", "4. 80", "4 .80")
      // while protecting calendar dates like "14. 11. 2026" via negative lookbehind/lookahead
      .replace(
        /(^|[^\d./-])(\d{1,5})\s*([.,])\s*(\d{2})(?!\s*[./-]\s*\d)(?=$|\s|[^\d])/g,
        "$1$2$3$4"
      )
      // Fix OCR letter О/O inside 4-digit years like "2O26" or "2О26" -> "2026"
      .replace(/(^|[^\dа-яА-Яa-zA-Z])2[ОO]([1-3])([ОO\d])(?=$|[^\d])/g, (_m, pre, d3, d4) => {
        const f4 = d4 === "О" || d4 === "O" ? "0" : d4;
        return `${pre}20${d3}${f4}`;
      })
      // Fix OCR letter О/O inside decimal numbers like "€4.8O", "O.50", "12,3О", "5,O0"
      .replace(/(^|[\s€$£:/-])(\d*)[ОO]([.,])(\d{1,2})(?=$|\s|[^\d])/g, "$1$20$3$4")
      .replace(/(^|[\s€$£:/-])(\d+[.,])([ОO\d])([ОO\d])(?=$|\s|[^\d])/g, (_m, pre, p1, d1, d2) => {
        const f1 = d1 === "О" || d1 === "O" ? "0" : d1;
        const f2 = d2 === "О" || d2 === "O" ? "0" : d2;
        return `${pre}${p1}${f1}${f2}`;
      })
      // Fix apostrophe decimal typo in prices ("3'49" -> "3.49") and colon decimal typo immediately before currency/tax ("3:49 Б" -> "3.49 Б")
      .replace(/(^|[\s€$£-])(\d{1,4})'(\d{2})(?=$|\s|[^\d])/g, "$1$2.$3")
      .replace(/(^|\s)(\d{1,4}):(\d{2})(?=\s*(?:€|EUR|лв\.?|BGN|[АБВГA-D*])(?:\s|$))/gi, "$1$2.$3")
      // Separate glued currency/tax glyph after decimal price: "1.29Б" -> "1.29 Б", "4.80EUR" -> "4.80 EUR"
      .replace(/(\d+[.,]\d{2})([АБВГДЕабвгдеA-D€$£]|EUR|BGN|лв\.?)/gi, "$1 $2")
      // Normalize Bulgarian currency OCR variants: "лв .", "лB.", "л8." after digits
      .replace(/(\d)\s*л\s*[вB8]\s*\.?/gi, "$1 лв.")
      .replace(/(^|\s)л\s*в\s*\.?(?=\s|$)/gi, "$1лв.")
      // Normalize Cyrillic/symbol multiplication & Bulgarian unit бр.
      .replace(/(\d)\s*б\s*р\s*\./gi, "$1 бр.")
  );
}

// Clean and normalize price string to a valid float
export function parsePrice(val: string): number | null {
  if (!val) return null;
  if (/%/.test(val)) return null;

  let clean = val
    .replace(/[$€£]/g, "")
    .replace(/лв\.?|лева|лев|BGN|EUR|ЕВРО|USD|GBP|[:=]/gi, "")
    .replace(/(?<=\d)[ОO]|[ОO](?=[\d.,])/g, "0")
    .trim();

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
  // Single comma decimal: 4,80 -> 4.80
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
    /\bBG\s*\d{8,11}\b/i,
    /(ЕИК|EIK|БУЛСТАТ|BULSTAT|ИН\s*ПО\s*ДДС|ДДС\s*№|ДДС\s*N|VAT\s*№|VAT\s*NO|ИН:|ИД\.?\s*№)/,
    /(?:^|\s)(ФУ|ФП|ЗД|ДТ|УНП|НРА|ТД)(?:$|[\s:№N#\-\d])/,
    /(КАСА\s*№?|КАСИЕР|ОПЕРАТОР|БОН\s*№|ЧЕК\s*№|ПОС\s*ТЕРМИНАЛ|ТЕРМИНАЛ\s*№|ОБ\.?\s*№|МАГАЗИН\s*№|ОБ\.?\s*МЯСТО)/,
    /(?:^|\s)(ГР\.|С\.|УЛ\.|БУЛ\.|Ж\.К\.|КВ\.|ПЛ\.|БЛ\.|ВХ\.|ЕТ\.|АП\.|ОБЛ\.|ОБЩ\.|П\.К\.)(?:\s|$)/,
    /(?:^|[^а-яА-Яa-zA-Z])(TEL|PHONE|ТЕЛ|ФАКС|FAX|EMAIL|E-MAIL|WWW\.|HTTP|HTTPS)(?:$|[^а-яА-Яa-zA-Z])/i,
    /^\s*(?:ДАТА|DATE|ЧАС|TIME)\s*[:=]/i,
    /\d{1,2}\s*[./,-]\s*\d{1,2}\s*[./,-]\s*(?:20\d{2}|\d{2})(?:\s|$)/,
    /^\d+[\s\-/.:]*$/,
    /\d+[.,]\d{2}\s*(?:[АБВГA-D8]|ЛВ\.?|BGN|EUR|€)?\s*$/i,
  ];

  return (
    rejectPatterns.some((re) => re.test(line)) ||
    rejectPatterns.some((re) => re.test(cyr)) ||
    rejectPatterns.some((re) => re.test(lat))
  );
}

/**
 * Checks if a parsed product name is actually a stray EIK/VAT/address/fiscal header line
 * (never blocks legitimate product weights like "400 гр." or "500 г").
 */
function isStrayFiscalOrAddressName(name: string): boolean {
  const cyr = toCyrillicMatchForm(name);
  return (
    /\bBG\s*\d{8,11}\b/i.test(name) ||
    /(ЕИК|EIK|БУЛСТАТ|BULSTAT|ИН\s*ПО\s*ДДС|ДДС\s*№|УНП|ФИСКАЛЕН\s*БОН|КАСОВА\s*БЕЛЕЖКА)/.test(cyr) ||
    /(?:^|\s)(?:УЛ\.|БУЛ\.|Ж\.К\.|ТЕЛ:|WWW\.|HTTP)/.test(cyr)
  );
}

/**
 * Checks whether a line in the receipt header/body is store metadata (VAT/EIK/Fiscal/Address/Receipt label)
 * Safe for use in extractItems(): NEVER treats priced item lines or product weight strings ("500 ГР.") as metadata.
 */
function isReceiptHeaderLineForItems(line: string, preferredCurrency: string = "€"): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  // Never discard a line that clearly has a trailing item price (e.g. "С. МЛЯКО 1.80 Б", "ПЛ. СИРЕНЕ 2.50 Б")
  if (extractTrailingItemPrice(trimmed, preferredCurrency)) {
    return false;
  }

  const cyr = toCyrillicMatchForm(trimmed);
  const lat = toLatinMatchForm(trimmed);

  const headerPatterns: RegExp[] = [
    /^(?:FISCAL\s*RECEIPT|RECEIPT|TAX\s*INVOICE|INVOICE|SALES\s*RECEIPT|CUSTOMER\s*RECEIPT)(?:$|[^a-zA-Z])/i,
    /(ФИСКАЛЕН\s*БОН|СИСТЕМЕН\s*БОН|СЛУЖЕБЕН\s*БОН|КАСОВА\s*БЕЛЕЖКА|КАСОВ\s*БОН|ФАКТУРА|ОРИГИНАЛ|ДУБЛИКАТ)/,
    /^(?:WELCOME|THANK\s*YOU|ДОБРЕ\s*ДОШЛИ|БЛАГОДАРИМ|МЕРСИ|ПРИЯТЕН\s*ДЕН)/,
    /\bBG\s*\d{8,11}\b/i,
    /(ЕИК|EIK|БУЛСТАТ|BULSTAT|ИН\s*ПО\s*ДДС|ДДС\s*№|ДДС\s*N|VAT\s*№|VAT\s*NO|ИН:|ИД\.?\s*№)/,
    /(?:^|\s)(?:ФУ|ФП|ЗД|ДТ|УНП|НРА|ТД)(?:$|[\s:№N#\-\d])/,
    /(КАСА\s*№?|КАСИЕР|ОПЕРАТОР|БОН\s*№|ЧЕК\s*№|ПОС\s*ТЕРМИНАЛ|ТЕРМИНАЛ\s*№|ОБ\.?\s*№|МАГАЗИН\s*№|ОБ\.?\s*МЯСТО)/,
    /^\s*(?:ГР\.|С\.|УЛ\.|БУЛ\.|Ж\.К\.|КВ\.|ПЛ\.|ОБЛ\.|ОБЩ\.)(?:\s|$)/,
    /(?:^|\s)(?:УЛ\.|БУЛ\.|Ж\.К\.|П\.К\.)(?:\s|$)/,
    /(?:^|[^а-яА-Яa-zA-Z])(?:TEL|PHONE|ТЕЛ\.?\s*[:№]|ТЕЛ\.?\s*(?:\+?\d[\d\s\-()]{4,})|ТЕЛЕФОН|ФАКС|FAX|EMAIL|E-MAIL|WWW\.|HTTP|HTTPS)(?:$|[^а-яА-Яa-zA-Z])/i,
    /^\s*(?:ДАТА|DATE|ЧАС|TIME)\s*[:=]/i,
    /(?:^|\s)\d{1,2}\s*[./,-]\s*\d{1,2}\s*[./,-]\s*(?:20\d{2}|\d{2})(?:\s|$)/,
    /^\d{1,2}:\d{2}(?::\d{2})?(?:\s|$)/,
    /^\d+[\s\-/.:]*$/,
  ];

  return (
    headerPatterns.some((re) => re.test(trimmed)) ||
    headerPatterns.some((re) => re.test(cyr)) ||
    headerPatterns.some((re) => re.test(lat))
  );
}

// Clean legal entity suffixes and decorative chars from store name
function cleanMerchantName(raw: string): string {
  return raw
    .replace(/[#*=_~•|]/g, " ")
    .replace(/[„“"«»]/g, "")
    .replace(
      /(?:^|[^а-яА-Яa-zA-Z])(ЕООД|ООД|ЕАД|АД|ЕТ|СД|КД|LTD|LLC|GMBH|INC)\.?(?=$|[^а-яА-Яa-zA-Z])/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .replace(/^[-:.,\s]+|[-:.,\s]+$/g, "")
    .trim();
}

// Extract Merchant Name from receipt header lines (Bulgarian-first)
export function extractMerchant(lines: string[]): {
  merchantName: string;
  matchedRule: string;
} {
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

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const rawLine = lines[i].trim();
    if (rawLine.length < 2) continue;
    if (isNonMerchantMetadataLine(rawLine)) continue;

    const cleaned = cleanMerchantName(repairCyrillicWordTokens(rawLine));
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

function normalizeDateCandidateLine(line: string): string {
  // Replace Cyrillic/Latin O -> 0 inside day/month/year date segments like "O4.O5.2026", "14.O5.2O26", "14.11:2026"
  return line
    .replace(/([0-3OО]?)[ОO](?=\d?\s*[-/.,:]\s*[01ОO\d]{1,2}\s*[-/.,:]\s*(?:2|1[89]|[23]\d))/g, "$10")
    .replace(/(\d{1,2}\s*[-/.,:]\s*)([01OО]?)[ОO](?=\d?\s*[-/.,:]\s*(?:2|1[89]|[23]\d))/g, "$1$20")
    .replace(/([01]?)[ОO](?=\s*[-/.,:]\s*20[1-3]\d)/g, "$10")
    .replace(/2[ОO]([1-3])([ОO\d])/g, (_m, d3, d4) => `20${d3}${d4 === "О" || d4 === "O" ? "0" : d4}`)
    .replace(/(\d{1,2}\s*[-/.,]\s*\d{1,2}\s*[-/.,]\s*\d{2,4})\s*г\.?/gi, "$1");
}

const BG_EN_MONTH_MAP: Array<{ pattern: RegExp; month: number }> = [
  { pattern: /^(?:ян|яну|януари|jan|january)\.?$/i, month: 1 },
  { pattern: /^(?:фев|февр|февруари|feb|february)\.?$/i, month: 2 },
  { pattern: /^(?:мар|март|mar|march)\.?$/i, month: 3 },
  { pattern: /^(?:апр|април|apr|april)\.?$/i, month: 4 },
  { pattern: /^(?:май|may)\.?$/i, month: 5 },
  { pattern: /^(?:юн|юни|jun|june)\.?$/i, month: 6 },
  { pattern: /^(?:юл|юли|jul|july)\.?$/i, month: 7 },
  { pattern: /^(?:авг|август|aug|august)\.?$/i, month: 8 },
  { pattern: /^(?:сеп|септ|септември|sep|sept|september)\.?$/i, month: 9 },
  { pattern: /^(?:окт|октомври|oct|october)\.?$/i, month: 10 },
  { pattern: /^(?:ное|ноем|ноември|nov|november)\.?$/i, month: 11 },
  { pattern: /^(?:дек|декември|dec|december)\.?$/i, month: 12 },
];

// Extract Transaction Date (YYYY-MM-DD), prioritizing Bulgarian DD.MM.YYYY / ДАТА lines
export function extractDate(lines: string[]): {
  date: string;
  dateDetected: boolean;
  matchedRule: string;
  fallbackReason?: string;
} {
  interface DateCandidate {
    iso: string;
    score: number;
    rule: string;
  }
  const candidates: DateCandidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = normalizeDateCandidateLine(rawLine);
    const cyr = toCyrillicMatchForm(rawLine);
    const prevCyr = i > 0 ? toCyrillicMatchForm(lines[i - 1]) : "";

    const hasDateLabel = /(ДАТА|DATE|ДЕН|ЧАС)/.test(cyr) || /\b(?:ДАТА|DATE)\s*[:=]?\s*$/.test(prevCyr);
    const hasTime = /\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.]([0-5]\d))?\b/.test(line);
    const isFiscalOrIdLine =
      /(УНП|ЕИК|БУЛСТАТ|(?:^|\s)(?:ФУ|ФП)(?:$|[\s:№N#\-\d])|BG\d|БОН\s*№|СТОРНО|КАСА)/.test(cyr) &&
      !hasDateLabel;

    // 1. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY or DD.MM:YYYY
    const dmyRegex =
      /(?:^|[^\d])([0-3]?\d)\s*[-/.,:]\s*([01]?\d)\s*[-/.,:]\s*(20[1-3]\d)(?=[^\d]|$)/g;
    let dmyFull: RegExpExecArray | null;
    while ((dmyFull = dmyRegex.exec(line)) !== null) {
      let day = parseInt(dmyFull[1], 10);
      let month = parseInt(dmyFull[2], 10);
      const year = parseInt(dmyFull[3], 10);

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
            85 +
            (hasDateLabel ? 30 : 0) +
            (hasTime ? 20 : 0) +
            (isFiscalOrIdLine ? -45 : 0),
          rule: `DD.MM.YYYY in "${rawLine}"`,
        });
      }
    }

    // 1b. Space-separated DD MM YYYY when explicit DATE/ДАТА label is present
    if (hasDateLabel) {
      const spacedDmy = line.match(/(?:^|[^\d])([0-3]?\d)\s+([01]?\d)\s+(20[1-3]\d)(?=[^\d]|$)/);
      if (spacedDmy) {
        const day = parseInt(spacedDmy[1], 10);
        const month = parseInt(spacedDmy[2], 10);
        const year = parseInt(spacedDmy[3], 10);
        if (isValidCalendarDate(year, month, day)) {
          const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          candidates.push({
            iso,
            score: 105 + (hasTime ? 15 : 0),
            rule: `Spaced DD MM YYYY in "${rawLine}"`,
          });
        }
      }
    }

    // 1c. Named Bulgarian / English months: "14 ноември 2026" or "14 ноем. 2026 г."
    const namedMonthRegex = /(?:^|[^\d])([0-3]?\d)\s+([а-яА-Яa-zA-Z]{3,12}\.?)\s+(20[1-3]\d)(?=[^\d]|$)/g;
    let namedMatch: RegExpExecArray | null;
    while ((namedMatch = namedMonthRegex.exec(line)) !== null) {
      const day = parseInt(namedMatch[1], 10);
      const monthToken = namedMatch[2].trim();
      const year = parseInt(namedMatch[3], 10);
      const foundMonth = BG_EN_MONTH_MAP.find((m) => m.pattern.test(monthToken))?.month;
      if (foundMonth && isValidCalendarDate(year, foundMonth, day)) {
        const iso = `${year}-${String(foundMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        candidates.push({
          iso,
          score: 90 + (hasDateLabel ? 25 : 0) + (hasTime ? 15 : 0),
          rule: `Named month in "${rawLine}"`,
        });
      }
    }

    // 2. YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    const ymdRegex =
      /(?:^|[^\d])(20[1-3]\d)\s*[-/.]\s*([01]?\d)\s*[-/.]\s*([0-3]?\d)(?=[^\d]|$)/g;
    let ymdFull: RegExpExecArray | null;
    while ((ymdFull = ymdRegex.exec(line)) !== null) {
      const year = parseInt(ymdFull[1], 10);
      const month = parseInt(ymdFull[2], 10);
      const day = parseInt(ymdFull[3], 10);
      if (isValidCalendarDate(year, month, day)) {
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        candidates.push({
          iso,
          score:
            80 +
            (hasDateLabel ? 30 : 0) +
            (hasTime ? 20 : 0) +
            (isFiscalOrIdLine ? -45 : 0),
          rule: `YYYY-MM-DD in "${rawLine}"`,
        });
      }
    }

    // 3. DD.MM.YY or DD/MM/YY or DD-MM-YY
    const dmyShortRegex =
      /(?:^|[^\d])([0-3]?\d)\s*[-/.]\s*([01]?\d)\s*[-/.]\s*(2[0-9]|1[89])(?=[^\d]|$)/g;
    let dmyShort: RegExpExecArray | null;
    while ((dmyShort = dmyShortRegex.exec(line)) !== null) {
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
            (isFiscalOrIdLine ? -45 : 0),
          rule: `DD.MM.YY in "${rawLine}"`,
        });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return {
      date: candidates[0].iso,
      dateDetected: true,
      matchedRule: candidates[0].rule,
    };
  }

  const fallbackReason =
    lines.length === 0
      ? "OCR returned empty text"
      : "No valid calendar date pattern (DD.MM.YYYY / YYYY-MM-DD) found in OCR lines";

  return {
    date: new Date().toISOString().split("T")[0],
    dateDetected: false,
    matchedRule: "Today fallback",
    fallbackReason,
  };
}

// Extract Currency (Euro-first for Bulgaria, never assumes BGN unless explicitly BGN-only)
export function extractCurrency(rawText: string): string {
  const normalized = normalizeBulgarianOcrText(rawText);
  const hasEur = /(?:€|\beur\b|евро)/i.test(normalized);
  const hasBgn = /(?:лв\.?|лева|лев|\bbgn\b)/i.test(normalized);
  const hasUsd = /(?:\$|\busd\b)/i.test(normalized);
  const hasGbp = /(?:£|\bgbp\b)/i.test(normalized);

  // Bulgaria uses EUR: whenever € / EUR appears (even alongside legacy BGN info), use €
  if (hasEur) return "€";
  if (hasBgn) return "лв.";
  if (hasUsd) return "$";
  if (hasGbp) return "£";

  // Default to € (never assume BGN)
  return "€";
}

/**
 * Robust Total Amount Extraction Algorithm (Bulgarian + Euro-First)
 * Handles ОБЩО, ОБЩА СУМА, КРАЙНА СУМА, ЗА ПЛАЩАНЕ, СУМА, ТОТАЛ, TOTAL, GRAND TOTAL
 * and strictly ignores VAT (ДДС), discounts (ОТСТЪПКА), subtotals, and change (РЕСТО).
 */
export function extractTotal(lines: string[], preferredCurrency: string = "€"): {
  total: number;
  subtotal?: number;
  tax?: number;
  matchedLine?: string;
  confidence: "high" | "medium" | "low";
} {
  let foundSubtotal: number | undefined;
  let foundTax: number | undefined;

  const subtotalRegex =
    /(?:SUB\s*TOTAL|МЕЖДИННА\s*СУМА)\s*[:=]?\s*(?:EUR|BGN|[$€£])?\s*([\d,.]+)/i;
  const taxRegex =
    /(?:TAX|VAT|ДДС|ДАНЪК)\s*(?:\([^)]*\))?\s*(?:\d+[.,]?\d*\s*%)?\s*[:=]?\s*(?:EUR|BGN|[$€£])?\s*([\d,.]+)/i;

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
      regex: /(?:^|\s)(?:ЗА\s*ПЛАЩАНЕ|ОБЩО\s*EUR|ОБЩО\s*ЕВРО|ОБЩО\s*ЛВ|ОБЩО\s*BGN)(?:$|[\s:=\d€])/,
      basePriority: 96,
      label: "BG ЗА ПЛАЩАНЕ / ОБЩО",
    },
    {
      regex: /(?:^|\s)ОБЩО(?:$|[\s:=€]|\s+\d|\s+EUR)/,
      basePriority: 94,
      label: "BG ОБЩО",
    },
    {
      regex: /(?:^|\s)(?:ВСИЧКО|ТОТАЛ)(?:$|[\s:=€\d])/,
      basePriority: 88,
      label: "BG ВСИЧКО / ТОТАЛ",
    },
    {
      regex: /(?:^|\s)СУМА(?:$|[\s:=€]|\s+\d|\s+EUR)/,
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

    const isExcludedSummaryLine =
      /(?:SUB\s*TOTAL|МЕЖДИННА\s*СУМА|НЕТО|ОБЛАГАЕМ|ДАНЪЧНА\s*ОСНОВА|ДАНЪЧНА\s*ГРУПА)/.test(cyr) ||
      /(?:^|\s)(?:ДДС|ДАНЪК|VAT|TAX)(?:\s|$|:|=)/.test(cyr) ||
      /(?:ОТСТЪПКА|НАМАЛЕНИЕ|СПЕСТЕНИ|DISCOUNT|SAVED|РЕСТО|ВЪРНАТИ|CHANGE)/.test(cyr);

    if (isExcludedSummaryLine) continue;

    const isPaymentTenderLine =
      /(?:В\s*БРОЙ|БРОЙ|ПОС|ТЕРМИНАЛ|РЕСТО|CASH|CARD|VISA|MASTERCARD)/.test(cyr);

    for (const rule of totalKeywordRules) {
      if (rule.regex.test(cyr) || rule.regex.test(lat)) {
        const lineWithoutPct = line.replace(/\d+[.,]\d+\s*%/g, " ").replace(/\d+\s*%/g, " ");
        const tokenMatches =
          lineWithoutPct.match(
            /(?:EUR|BGN|[$€£])?\s*\d{1,6}[.,]\d{2}(?:\s*(?:лв\.?|BGN|EUR|€))?/gi
          ) || [];

        // On dual-currency lines (e.g. "ОБЩО 18.58 лв. / €9.50"), pick the EUR value when preferredCurrency is €
        const eurMatch = tokenMatches.find((m) => /(?:€|EUR)/i.test(m));
        const chosenRaw =
          preferredCurrency === "€" && eurMatch ? eurMatch : tokenMatches[0];

        if (chosenRaw) {
          const val = parsePrice(chosenRaw);
          if (val && val > 0) {
            candidates.push({
              amount: val,
              priority: rule.basePriority + (isPaymentTenderLine ? -25 : 0),
              line,
              ruleLabel: rule.label,
            });
          }
        }

        // Handle wrapped total on next line: "ОБЩО" -> "€9.50"
        if (tokenMatches.length === 0 && i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextClean = nextLine.replace(/\d+[.,]?\d*\s*%/g, " ");
          const nextMatch = nextClean.match(
            /(?:EUR|BGN|[$€£])?\s*(\d{1,6}[.,]\d{2})(?:\s*(?:лв\.?|BGN|EUR|€))?/i
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
        break;
      }
    }
  }

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

  const bottomLines = lines.slice(Math.floor(lines.length * 0.4));
  let fallbackMax = 0;
  let fallbackLine = "";

  for (const line of bottomLines) {
    const cyr = toCyrillicMatchForm(line);
    if (/\d{1,2}[./,-]\d{1,2}[./,-]\d{2,4}/.test(line)) continue;
    if (/(ДДС|VAT|TAX|РЕСТО|CHANGE|ОТСТЪПКА|DISCOUNT|ЕИК|УНП)/.test(cyr)) continue;
    const matches = line.match(/(\d{1,5}[.,]\d{2})(?=$|\s|[^\d])/g) || [];
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
 * Checks if a line marks the end of the item list (Subtotal / Total / VAT / Payment section)
 * so item parsing continues until that boundary and stops cleanly there.
 */
function isTotalsOrPaymentBoundaryLine(line: string): boolean {
  const cyr = toCyrillicMatchForm(line);
  const lat = toLatinMatchForm(line);

  // Loyalty card lines printed mid-receipt (e.g. "КАРТА БИЛЛА 1234", "КАРТА КЛИЕНТ") must NOT break item scanning
  if (/(?:КАРТА\s*(?:БИЛЛА|БИЛА|КЛИЕНТ|LIDL|KAUFLAND|ФАНТАСТИКО|METRO|МЕТРО|ЛОЯЛ|БОНУС)|BILLA\s*CARD|KAUFLAND\s*CARD)/i.test(cyr)) {
    return false;
  }

  const endOrPriceOrColon =
    "(?:$|\\s*[:=€$£]|\\s+(?:EUR|ЕВРО|ЛВ\\.?|BGN|€|\\$|£)?\\s*\\d{1,6}[.,]\\d{2}(?:\\s|$|€|EUR|лв|BGN|[АБВГA-D*]))";

  const boundaryPatterns: RegExp[] = [
    new RegExp(`^\\s*(?:МЕЖДИННА\\s*СУМА|ОБЩА\\s*СУМА|КРАЙНА\\s*СУМА|СУМА\\s*ЗА\\s*ПЛАЩАНЕ|ОБЩО\\s*ЗА\\s*ПЛАЩАНЕ|ДЪЛЖИМА\\s*СУМА|ЗА\\s*ПЛАЩАНЕ)(?:\\s+(?:EUR|ЕВРО|ЛВ\\.?|BGN))?${endOrPriceOrColon}`, "i"),
    new RegExp(`^\\s*(?:ОБЩО|ВСИЧКО|ТОТАЛ)(?:\\s+(?:EUR|ЕВРО|ЛВ\\.?|BGN|СУМА|АРТИКУЛ[АИ]?))?${endOrPriceOrColon}`, "i"),
    new RegExp(`^\\s*(?:СУМА)(?:\\s+(?:EUR|ЕВРО|ЛВ\\.?|BGN))?${endOrPriceOrColon}`, "i"),
    new RegExp(`^\\s*(?:SUB\\s*TOTAL|SUBTOTAL|GRAND\\s*TOTAL|TOTAL\\s*DUE|AMOUNT\\s*DUE|BALANCE\\s*DUE|TOTAL)(?:\\s+(?:EUR|USD|GBP|BGN))?${endOrPriceOrColon}`, "i"),
    /^\s*(?:ДДС|ДАНЪЧНА\s*(?:ГРУПА|ОСНОВА)|ОБЛАГАЕМА|ДАНЪК|VAT|TAX)(?:\s+\d+(?:[.,]\d+)?\s*%)?(?:$|\s*[:=(%]|\s+\d+[.,]\d{2})/i,
    /^\s*(?:ГРУПА\s*[АБВГA-D]|ДАН\.\s*ГРУПА)(?=$|[^а-яА-Яa-zA-Z0-9])/,
    new RegExp(`^\\s*(?:В\\s*БРОЙ|БАНКОВА\\s*КАРТА|ДЕБИТНА\\s*КАРТА|КРЕДИТНА\\s*КАРТА|ПЛАЩАНЕ\\s*С\\s*КАРТА|ПЛАТЕНО|ПЛАЩАНЕ|ПОС\\s*ТЕРМИНАЛ|ТЕРМИНАЛ|РЕСТО|ВЪРНАТИ|ОДОБРЕНИЕ|CASH|CHANGE|PAID|VISA|MASTERCARD|AMEX)${endOrPriceOrColon}`, "i"),
    /^\s*(?:КАРТА|CARD)\s*(?:$|[:=]|(?:EUR|BGN|€)?\s*\d+[.,]\d{2})/i,
    /^\s*\d+\s*(?:АРТИКУЛА|АРТИКУЛИ|АРТИКУЛ|ПРОДУКТА|ITEMS?\s*SOLD|ITEMS?)(?=$|[\s:])/i,
    /^\s*(?:БР\.?\s*АРТИКУЛИ|БРОЙ\s*АРТИКУЛИ|ОБЩО\s*АРТИКУЛИ|ITEMS\s*COUNT)(?=$|[^а-яА-Яa-zA-Z0-9])/i,
  ];

  return (
    boundaryPatterns.some((re) => re.test(line)) ||
    boundaryPatterns.some((re) => re.test(cyr)) ||
    boundaryPatterns.some((re) => re.test(lat))
  );
}

/**
 * Checks if a line is a receipt summary, payment, VAT, discount, or fiscal header/footer line.
 */
function isNonItemSummaryOrMetaLine(line: string): boolean {
  if (isTotalsOrPaymentBoundaryLine(line)) return true;

  const cyr = toCyrillicMatchForm(line);
  const lat = toLatinMatchForm(line);

  const rejectPatterns = [
    /(?:^|\s)(?:SUBTOTAL|SUB\s*TOTAL|GRAND\s*TOTAL|BALANCE\s*DUE|CASH|CHANGE|VISA|MASTERCARD|AMEX)(?:$|\s*[:=€$£]|\s+\d+[.,]\d{2})/i,
    /(?:^|\s)(?:МЕЖДИННА\s*СУМА|ОБЩА\s*СУМА|КРАЙНА\s*СУМА|ЗА\s*ПЛАЩАНЕ|ДЪЛЖИМА\s*СУМА)(?:$|\s*[:=€]|\s+\d+[.,]\d{2})/,
    /(?:^|\s)(?:ДДС|ДАНЪЧНА\s*ГРУПА|ДАНЪЧНА\s*ОСНОВА|ОБЛАГАЕМА|ГРУПА\s*[АБВГA-D]|VAT|TAX)(?:\s+\d+(?:[.,]\d+)?\s*%)?(?:$|\s*[:=%]|\s+\d+[.,]\d{2})/i,
    /(?:^|\s)(?:В\s*БРОЙ|ПЛАТЕНО|ПЛАЩАНЕ|ПОС\s*ТЕРМИНАЛ|ТЕРМИНАЛ|РЕСТО|ВЪРНАТИ|ОДОБРЕНИЕ|ОДОБРЕНА)(?:$|\s*[:=€]|\s+\d+[.,]\d{2})/,
    /(?:^|\s)(?:ОТСТЪПКА|НАМАЛЕНИЕ|СПЕСТЕНИ|LIDL\s*PLUS\s*(?:ОТСТЪПКА|СПЕСТ)|КАУФЛАНД\s*КАРТ|BILLA\s*CARD|КАРТА\s*(?:КЛИЕНТ|БИЛЛА|БИЛА|ЛИДЛ|LIDL|KAUFLAND|ФАНТАСТИКО|METRO|МЕТРО|ЛОЯЛ|БОНУС)|НАТРУПАНИ\s*ТОЧКИ|БОНУС\s*ТОЧКИ|ТОЧКИ\s*[:=\d]|DISCOUNT|SAVED)(?:$|[\s:=\-\d])/i,
    /(?:^|\s)(?:ЕИК|БУЛСТАТ|ДДС\s*№|ИН\s*ПО\s*ДДС|ФУ|ФП|УНП|КАСИЕР|ОПЕРАТОР|БОН\s*№)(?:$|[\s:№N#\-\d])/,
    /(?:^|\s)(?:ТЕЛ\.?\s*[:№]|ТЕЛ\.?\s*(?:\+?\d[\d\s\-()]{4,})|ТЕЛЕФОН|ФАКС|WWW\.|HTTP|БЛАГОДАРИМ|МЕРСИ|ДОБРЕ\s*ДОШЛИ|ФИСКАЛЕН\s*БОН|СЛУЖЕБЕН\s*БОН)(?:$|[\s:!.])/i,
    /\b(?:AID|AUTH|PAN|RRN|STAN|TID|MID)\b/i,
    /^\d{1,2}[./,-]\d{1,2}[./,-]\d{2,4}/,
    /^\d{1,2}:\d{2}(?::\d{2})?/,
  ];

  return (
    rejectPatterns.some((re) => re.test(line)) ||
    rejectPatterns.some((re) => re.test(cyr)) ||
    rejectPatterns.some((re) => re.test(lat))
  );
}

/**
 * Checks whether a text line inside the items section is purely a separator or metadata
 * rather than a wrapped continuation line of a product name.
 */
function isSeparatorOrHeaderNoise(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^[-=*_.~#|+\\/]{2,}$/.test(trimmed)) return true;
  const cyr = toCyrillicMatchForm(trimmed);
  if (
    /^(?:КАСОВ\s*БОН|ФИСКАЛЕН\s*БОН|СИСТЕМЕН\s*БОН|ЕИК|БУЛСТАТ|ИН\s*ПО\s*ДДС|ДДС\s*№|УНП|ФУ|ФП|КАСА|КАСИЕР|ОПЕРАТОР|БОН\s*№|АРТИКУЛ|СТОКА|НАИМЕНОВАНИЕ|ЦЕНА|К-ВО|КОЛИЧЕСТВО)(?=$|[^а-яА-Яa-zA-Z0-9])/.test(
      cyr
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Extracts explicit expected item count if printed on the receipt (e.g. "17 АРТИКУЛА", "ITEMS SOLD: 17").
 */
export function extractExpectedItemsCount(lines: string[]): number | undefined {
  for (const line of lines) {
    const cleanUpper = repairCyrillicWordTokens(line).toUpperCase();
    const m1 =
      cleanUpper.match(
        /(?:^|\s)(\d{1,3})\s*(?:АРТИКУЛА|АРТИКУЛИ|АРТИКУЛ|ПРОДУКТА)(?=$|[^а-яА-Яa-zA-Z0-9])/
      ) ||
      cleanUpper.match(
        /(?:^|\s)(\d{1,3})\s*(?:ITEMS?\s*(?:SOLD)?|ARTICLES?)(?=$|[^a-zA-Z0-9])/i
      );
    if (m1) {
      const n = parseInt(m1[1], 10);
      if (n >= 1 && n <= 300) return n;
    }
    const m2 =
      cleanUpper.match(
        /(?:БР\.?\s*АРТИКУЛИ|БРОЙ\s*АРТИКУЛИ|ОБЩО\s*АРТИКУЛИ|АРТИКУЛИ|ПОЗИЦИИ)\s*[:=]?\s*(\d{1,3})(?=$|[^\d])/
      ) ||
      cleanUpper.match(/(?:ITEM\s*COUNT|ITEMS\s*COUNT|ITEMS)\s*[:=]\s*(\d{1,3})(?=$|[^\d])/i);
    if (m2) {
      const n = parseInt(m2[1], 10);
      if (n >= 1 && n <= 300) return n;
    }
  }
  return undefined;
}

/**
 * Formats ALL-CAPS item names into readable Sentence case and repairs Cyrillic OCR homoglyphs.
 */
function formatReadableItemName(rawName: string): string {
  const repaired = repairCyrillicWordTokens(rawName);
  const cleaned = repaired
    .replace(/^[•\-*]+\s*/, "")
    .replace(/^(?:\d{8,14}|0\d|\d{1,3}[.)]|\d{4,8})\s+(?=[а-яА-Яa-zA-Z0-9])/, "")
    .replace(/[.*_~=|:;\-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return cleaned;

  const letters = cleaned.replace(/[^а-яА-Яa-zA-Z]/g, "");
  const upperCount = (letters.match(/[А-ЯA-Z]/g) || []).length;
  const isMostlyUpper =
    letters.length > 0 && upperCount / letters.length >= 0.75;

  if (!isMostlyUpper) return cleaned;

  const lower = cleaned.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Extracts the trailing item price from a line, supporting dual-currency displays (EUR + BGN)
 * and OCR-noisy tax letters (А, Б, В, Г, A-D, 6, 8, 5, *).
 */
function extractTrailingItemPrice(
  line: string,
  preferredCurrency: string = "€"
): { price: number; cleanPrefix: string } | null {
  // 1. Check dual-currency ending first: e.g. "ХЛЯБ БЯЛ  €1.20 / 2.35 лв." or "КАШК.КРАВЕ  6.83 Б  3.49 EUR"
  const dualMatch = line.match(
    /((?:EUR|BGN|€|лв\.?)?\s*\d{1,5}[.,]\d{2}\s*(?:EUR|BGN|€|лв\.?)?)\s*(?:[*#]?\s*[АБВГДЕабвгдеA-D685])?\s*(?:[/*|]|или)?\s*((?:EUR|BGN|€|лв\.?)?\s*\d{1,5}[.,]\d{2}\s*(?:EUR|BGN|€|лв\.?)?)\s*(?:[*#]?\s*[АБВГДЕабвгдеA-D685])?\s*[.,|*\]]*\s*$/i
  );
  if (dualMatch && dualMatch.index !== undefined) {
    const partA = dualMatch[1];
    const partB = dualMatch[2];
    const pA = parsePrice(partA);
    const pB = parsePrice(partB);
    const hasBothEurAndBgn =
      (/(?:€|EUR)/i.test(partA) && /(?:лв|BGN)/i.test(partB)) ||
      (/(?:лв|BGN)/i.test(partA) && /(?:€|EUR)/i.test(partB));
    const isBgnEurPair =
      pA &&
      pB &&
      (Math.abs(pB / pA - 1.95583) < 0.04 || Math.abs(pA / pB - 1.95583) < 0.04);

    if (pA && pB && (hasBothEurAndBgn || isBgnEurPair)) {
      let chosen = pB;
      if (preferredCurrency === "€") {
        if (/(?:€|EUR)/i.test(partA) && !/(?:€|EUR)/i.test(partB)) chosen = pA;
        else if (/(?:€|EUR)/i.test(partB) && !/(?:€|EUR)/i.test(partA)) chosen = pB;
        else if (isBgnEurPair) chosen = Math.min(pA, pB); // EUR is smaller than BGN
      } else if (preferredCurrency === "лв.") {
        if (/(?:лв|BGN)/i.test(partA) && !/(?:лв|BGN)/i.test(partB)) chosen = pA;
        else if (/(?:лв|BGN)/i.test(partB) && !/(?:лв|BGN)/i.test(partA)) chosen = pB;
        else if (isBgnEurPair) chosen = Math.max(pA, pB);
      }
      return {
        price: chosen,
        cleanPrefix: line.slice(0, dualMatch.index).trim(),
      };
    }
  }

  // 2. Standard single trailing price with optional currency & Bulgarian tax code
  const singleMatch = line.match(
    /(?:EUR|BGN|USD|GBP|[$€£])?\s*(\d{1,5}[.,]\d{2})\s*(?:лв\.?|BGN|EUR|USD|GBP|€|\$|£)?\s*(?:[*#]?\s*[АБВГДЕабвгдеA-D685%])?\s*[.,|*\]]*\s*$/i
  );
  if (singleMatch && singleMatch.index !== undefined) {
    // Reject if preceded immediately by a minus sign (discount row handled separately)
    const beforeChar = singleMatch.index > 0 ? line[singleMatch.index - 1] : "";
    if (beforeChar === "-") return null;
    const price = parsePrice(singleMatch[1]);
    if (price && price > 0 && price < 50000) {
      return {
        price,
        cleanPrefix: line.slice(0, singleMatch.index).trim(),
      };
    }
  }

  return null;
}

/**
 * Checks whether a line is a negative discount/rebate row (e.g. "LIDL PLUS -1.50 Б" or "ОТСТЪПКА -0.80").
 */
function extractDiscountAmount(line: string): number {
  const cyr = toCyrillicMatchForm(line);
  const negMatch = line.match(/-\s*(\d{1,4}[.,]\d{2})\s*(?:€|EUR|лв\.?|BGN)?\s*[АБВГA-D68*]?\s*$/i);
  if (negMatch) {
    const val = parsePrice(negMatch[1]);
    if (val && val > 0) return val;
  }
  if (/(?:ОТСТЪПКА|НАМАЛЕНИЕ|СПЕСТЕНИ|DISCOUNT|SAVED|LIDL\s*PLUS)/.test(cyr)) {
    const posMatch = line.match(/(\d{1,4}[.,]\d{2})\s*(?:€|EUR|лв\.?|BGN)?\s*[АБВГA-D68*]?\s*$/i);
    if (posMatch) {
      const val = parsePrice(posMatch[1]);
      if (val && val > 0) return val;
    }
  }
  return 0;
}

// Extract Item Lines from text (Bulgarian + English + EUR + multi-line + quantity preservation)
export function extractItems(
  lines: string[],
  _totalAmount: number,
  preferredCurrency: string = "€"
): { items: Array<{ name: string; price: number; quantity: number }>; discountTotal: number } {
  const items: Array<{ name: string; price: number; quantity: number }> = [];
  let discountTotal = 0;

  // Quantity x UnitPrice (+ optional currency/unit rate + optional trailing line total)
  // e.g. "2 x 2.40   €4.80", "2 x 1.20 € = 2.40", "1.250 кг x 3.29 лв/кг  4.11 Б", "2 @ 1.20  2.40"
  const unitRateSuffix =
    "(?:\\s*(?:€|EUR|лв\\.?|BGN|USD|GBP)?(?:\\s*/\\s*(?:бр\\.?|кг\\.?|гр\\.?|г\\.?|л\\.?|мл\\.?|шт\\.?|оп\\.?|kg|g|l|ml|pcs))?)";
  const qtyCalculationWithTotalRegex = new RegExp(
    `^[*#•\\s]*(\\d+(?:[.,]\\d+)?)\\s*(?:бр\\.?|кг\\.?|гр\\.?|г\\.?|л\\.?|мл\\.?|шт\\.?|оп\\.?|kg|g|l|ml|pcs)?\\s*[xхХX*×@]\\s*(\\d+[.,]\\d{2,3})${unitRateSuffix}\\s*(?:=|\\s)\\s*(?:EUR|BGN|[$€£])?\\s*(\\d{1,5}[.,]\\d{2})\\s*(?:лв\\.?|BGN|EUR|USD|GBP|€|\\$|£)?\\s*(?:[*#]?\\s*[АБВГДЕабвгдеA-D685])?\\s*[.,|*\\]]*\\s*$`,
    "i"
  );

  // Quantity x UnitPrice WITHOUT total on the same line
  const qtyCalculationOnlyRegex = new RegExp(
    `^[*#•\\s]*(\\d+(?:[.,]\\d+)?)\\s*(?:бр\\.?|кг\\.?|гр\\.?|г\\.?|л\\.?|мл\\.?|шт\\.?|оп\\.?|kg|g|l|ml|pcs)?\\s*[xхХX*×@]\\s*(\\d+[.,]\\d{2,3})${unitRateSuffix}\\s*$`,
    "i"
  );

  // Standalone price line (when OCR wrapped a price onto the line below the product name)
  const standalonePriceLineRegex =
    /^(?:EUR|BGN|USD|GBP|[$€£])?\s*(\d{1,5}[.,]\d{2})\s*(?:лв\.?|BGN|EUR|USD|GBP|€|\$|£)?\s*(?:[*#]?\s*[АБВГДЕабвгдеA-D685])?\s*[.,|*\]]*\s*$/i;

  const consumedLineIndices = new Set<number>();
  let pendingNameBuffer: Array<{ index: number; text: string }> = [];
  let seenItemsStart = false;

  const flushPendingName = (): string => {
    const joined = pendingNameBuffer.map((b) => b.text).join(" ").trim();
    pendingNameBuffer = [];
    return joined;
  };

  for (let i = 0; i < lines.length; i++) {
    if (consumedLineIndices.has(i)) continue;
    const line = lines[i];

    // Stop cleanly once we reach Subtotal / Total / VAT / Payment section
    if (isTotalsOrPaymentBoundaryLine(line)) {
      if (items.length > 0) {
        break;
      }
      pendingNameBuffer = [];
      continue;
    }

    // Track negative discount rows without adding them as positive items
    const disc = extractDiscountAmount(line);
    if (disc > 0) {
      discountTotal = parseFloat((discountTotal + disc).toFixed(2));
      pendingNameBuffer = [];
      continue;
    }

    // Skip explicit header/footer noise and clear buffer
    if (isSeparatorOrHeaderNoise(line) || isNonItemSummaryOrMetaLine(line)) {
      pendingNameBuffer = [];
      continue;
    }
    if (!seenItemsStart && isReceiptHeaderLineForItems(line, preferredCurrency)) {
      pendingNameBuffer = [];
      continue;
    }

    // Skip standalone barcode numbers (8-14 digits) without disturbing buffer
    if (/^\d{8,14}$/.test(line.trim())) {
      continue;
    }

    // 1. Two/Three-line Pattern A:
    //    Line(s) in buffer: "ПИЛЕШКО ФИЛЕ ОХЛАДЕНО" + "ТАРЕЛКА 650Г"
    //    Line i           : "2 x 2.40            €4.80" or "2 x 1.20 € = 2.40 Б"
    const qtyLineMatch = line.match(qtyCalculationWithTotalRegex);
    if (qtyLineMatch) {
      let candidateName = "";
      if (pendingNameBuffer.length > 0) {
        candidateName = flushPendingName();
      } else if (i > 0 && !consumedLineIndices.has(i - 1)) {
        const prevLine = lines[i - 1];
        if (
          /[а-яА-Яa-zA-Z]{2,}/.test(prevLine) &&
          !extractTrailingItemPrice(prevLine, preferredCurrency) &&
          !isNonItemSummaryOrMetaLine(prevLine) &&
          !isReceiptHeaderLineForItems(prevLine, preferredCurrency)
        ) {
          candidateName = prevLine;
          consumedLineIndices.add(i - 1);
        }
      }

      if (candidateName) {
        const rawQty = parseFloat(qtyLineMatch[1].replace(",", "."));
        const totalLinePrice = parsePrice(qtyLineMatch[3]);
        const isWeightOrVolume =
          /(?:^|[^а-яА-Яa-zA-Z])(?:кг|гр|г|л|мл|kg|g|l|ml)\.?(?=$|[^а-яА-Яa-zA-Z])/i.test(line);
        const isDiscreteCount =
          !isWeightOrVolume &&
          Number.isInteger(rawQty) &&
          rawQty >= 1 &&
          rawQty <= 999;

        const unitLabelMatch = line.match(
          /^[*#•\s]*(\d+(?:[.,]\d+)?\s*(?:кг|л|гр|мл|kg|l|g|ml))(?=$|[^а-яА-Яa-zA-Z])/i
        );
        const displayName = unitLabelMatch
          ? `${formatReadableItemName(candidateName)} (${unitLabelMatch[1].trim()})`
          : formatReadableItemName(candidateName);

        if (
          totalLinePrice &&
          totalLinePrice > 0 &&
          displayName.length >= 2 &&
          !isStrayFiscalOrAddressName(displayName)
        ) {
          items.push({
            name: displayName,
            price: totalLinePrice,
            quantity: isDiscreteCount ? rawQty : 1,
          });
          consumedLineIndices.add(i);
          seenItemsStart = true;
          continue;
        }
      }
    }

    // 2. Two-line Pattern B (qty x unitPrice ABOVE the product line):
    //    Line i  : "2 x 2.40"
    //    Line i+1: "COCA COLA 2L       €4.80"
    const qtyOnlyMatch = line.match(qtyCalculationOnlyRegex);
    if (qtyOnlyMatch && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const nextPriceInfo = extractTrailingItemPrice(nextLine, preferredCurrency);
      if (nextPriceInfo && !isTotalsOrPaymentBoundaryLine(nextLine) && !isNonItemSummaryOrMetaLine(nextLine)) {
        const rawQty = parseFloat(qtyOnlyMatch[1].replace(",", "."));
        const isDiscreteCount =
          !/(?:^|[^а-яА-Яa-zA-Z])(?:кг|гр|г|л|мл|kg|g|l|ml)\.?(?=$|[^а-яА-Яa-zA-Z])/i.test(line) &&
          Number.isInteger(rawQty) &&
          rawQty >= 1 &&
          rawQty <= 999;
        const bufferedPrefix = flushPendingName();
        const rawName = `${bufferedPrefix ? bufferedPrefix + " " : ""}${nextPriceInfo.cleanPrefix}`
          .replace(/[.\-_=~*:\s]+$/, "")
          .trim();
        const name = formatReadableItemName(rawName);
        if (
          nextPriceInfo.price > 0 &&
          name.length >= 2 &&
          /[а-яА-Яa-zA-Z]{2,}/.test(name) &&
          !isStrayFiscalOrAddressName(name)
        ) {
          items.push({
            name,
            price: nextPriceInfo.price,
            quantity: isDiscreteCount ? rawQty : 1,
          });
          consumedLineIndices.add(i);
          consumedLineIndices.add(i + 1);
          seenItemsStart = true;
          continue;
        }
      }
    }

    // 3. Standalone price line wrapped onto line below product name (e.g. "ХЛЯБ БЯЛ" \n "1.29 Б")
    const standalonePriceMatch = line.match(standalonePriceLineRegex);
    if (standalonePriceMatch && pendingNameBuffer.length > 0) {
      const price = parsePrice(standalonePriceMatch[1]);
      const rawName = flushPendingName().replace(/[.\-_=~*:\s]+$/, "").trim();
      const parsedPrefix = rawName.match(
        /^(\d+)\s*(?:(?:бр\.?|шт\.?|оп\.?|pcs)\s*(?:[xхХX]\s+|[*×]\s*)?|(?:[xхХX]\s+|[*×]\s*))(.+)$/i
      );
      const quantity = parsedPrefix ? parseInt(parsedPrefix[1], 10) : 1;
      const name = formatReadableItemName(parsedPrefix ? parsedPrefix[2] : rawName);
      if (
        price &&
        price > 0 &&
        price < 50000 &&
        name.length >= 2 &&
        /[а-яА-Яa-zA-Z]{2,}/.test(name) &&
        !isStrayFiscalOrAddressName(name)
      ) {
        items.push({
          name,
          price,
          quantity: quantity >= 1 && quantity <= 999 ? quantity : 1,
        });
        consumedLineIndices.add(i);
        seenItemsStart = true;
        continue;
      }
    }

    // 4. Standard single-line (or multi-line wrapped + trailing price on final line)
    // Also handles qty calculation lines ending in dual currency or unit rate when buffered name exists
    const priceInfo = extractTrailingItemPrice(line, preferredCurrency);
    const hasLetters = /[а-яА-Яa-zA-Z]{2,}/.test(line);
    const pureQtyCalcRegex = new RegExp(
      `^[*#•\\s]*(\\d+(?:[.,]\\d+)?)\\s*(?:бр\\.?|кг\\.?|гр\\.?|г\\.?|л\\.?|мл\\.?|шт\\.?|оп\\.?|kg|g|l|ml|pcs)?\\s*[xхХX*×@]\\s*\\d+[.,]\\d{2,3}${unitRateSuffix}\\s*=*\\s*$`,
      "i"
    );
    const standaloneQtyCalcPrefixMatch =
      priceInfo && priceInfo.cleanPrefix.match(pureQtyCalcRegex);

    if (priceInfo && (hasLetters || (standaloneQtyCalcPrefixMatch && pendingNameBuffer.length > 0))) {
      const parseItemFromChunk = (
        rawChunkName: string,
        linePrice: number,
        includePendingBuffer: boolean
      ): { name: string; price: number; quantity: number } | null => {
        let rawName = rawChunkName.replace(/\s*=\s*$/, "").trim();
        let quantity = 1;

        const pureQtyCalcMatch = rawName.match(pureQtyCalcRegex);
        if (pureQtyCalcMatch && includePendingBuffer && pendingNameBuffer.length > 0) {
          const qVal = parseFloat(pureQtyCalcMatch[1].replace(",", "."));
          if (
            !/(?:^|[^а-яА-Яa-zA-Z])(?:кг|гр|г|л|мл|kg|g|l|ml)\.?(?=$|[^а-яА-Яa-zA-Z])/i.test(pureQtyCalcMatch[0]) &&
            Number.isInteger(qVal) &&
            qVal >= 1 &&
            qVal <= 999
          ) {
            quantity = qVal;
          }
          rawName = flushPendingName();
        } else {
          // 4a. Inline trailing "qty x unitPrice [=]": e.g. "Coca Cola 2 x 2.40", "САЛАМИ 2 x 1.20 =", "Вода 2 бр. x 1.20 €/бр"
          const inlineQtyUnitRegex = new RegExp(
            `^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:бр\\.?|кг\\.?|гр\\.?|г\\.?|л\\.?|мл\\.?|шт\\.?|оп\\.?|kg|g|l|ml|pcs)?\\s*[xхХX*×@]\\s*\\d+[.,]\\d{2,3}${unitRateSuffix}\\s*=*\\s*$`,
            "i"
          );
          const inlineQtyUnitMatch = rawName.match(inlineQtyUnitRegex);
          if (inlineQtyUnitMatch) {
            rawName = inlineQtyUnitMatch[1].trim();
            const qVal = parseFloat(inlineQtyUnitMatch[2].replace(",", "."));
            if (
              !/(?:^|[^а-яА-Яa-zA-Z])(?:кг|гр|г|л|мл|kg|g|l|ml)\.?(?=$|[^а-яА-Яa-zA-Z])/i.test(inlineQtyUnitMatch[0]) &&
              Number.isInteger(qVal) &&
              qVal >= 1 &&
              qVal <= 999
            ) {
              quantity = qVal;
            }
          } else {
            // 4b. Space-separated "qty  unitPrice" verified mathematically: e.g. "ВОДА ДЕВИН  2  0.75" before 1.50
            const spaceQtyUnitMatch = rawName.match(/^(.+?)\s+(\d{1,3})\s+(\d{1,4}[.,]\d{2})$/);
            if (spaceQtyUnitMatch) {
              const qVal = parseInt(spaceQtyUnitMatch[2], 10);
              const uVal = parsePrice(spaceQtyUnitMatch[3]);
              if (qVal >= 1 && qVal <= 999 && uVal && Math.abs(qVal * uVal - linePrice) <= 0.03) {
                rawName = spaceQtyUnitMatch[1].trim();
                quantity = qVal;
              }
            }

            // 4c. Prefix quantity: "2 x Coca Cola", "2x Coca Cola", "2 х Вода", "2 бр. x Вода", "2 * Бира"
            // Never matches indexed lines like "01 ХЛЯБ" where "Х" starts a word
            const prefixQtyMatch = rawName.match(
              /^(\d+)\s*(?:(?:бр\.?|шт\.?|оп\.?|pcs)\s*(?:[xхХX]\s+|[*×]\s*)?|(?:[xхХX]\s+|[*×]\s*))(.+)$/i
            );
            if (prefixQtyMatch) {
              const qVal = parseInt(prefixQtyMatch[1], 10);
              if (qVal >= 1 && qVal <= 999) {
                quantity = qVal;
                rawName = prefixQtyMatch[2].trim();
              }
            }
          }

          if (includePendingBuffer && pendingNameBuffer.length > 0) {
            const prefix = flushPendingName();
            const bufQtyMatch = prefix.match(
              /^(\d+)\s*(?:(?:бр\.?|шт\.?|оп\.?|pcs)\s*(?:[xхХX]\s+|[*×]\s*)?|(?:[xхХX]\s+|[*×]\s*))(.+)$/i
            );
            if (bufQtyMatch && quantity === 1) {
              const qVal = parseInt(bufQtyMatch[1], 10);
              if (qVal >= 1 && qVal <= 999) {
                quantity = qVal;
                rawName = `${bufQtyMatch[2].trim()} ${rawName}`.trim();
              } else {
                rawName = `${prefix} ${rawName}`.trim();
              }
            } else {
              rawName = `${prefix} ${rawName}`.trim();
            }
          }
        }

        rawName = rawName.replace(/[.\-_=~*:\s]+$/, "").trim();
        const name = formatReadableItemName(rawName);

        if (
          name.length >= 2 &&
          /[а-яА-Яa-zA-Z]{2,}/.test(name) &&
          !isNonItemSummaryOrMetaLine(name) &&
          !isStrayFiscalOrAddressName(name) &&
          linePrice > 0 &&
          linePrice < 50000
        ) {
          return { name, price: linePrice, quantity };
        }
        return null;
      };

      // Check if OCR accidentally merged two items on one line (e.g. "ХЛЯБ БЯЛ 1.20 Б  МЛЯКО 2.10 Б")
      // Guard carefully against splitting Bulgarian decimal weights/fat% like "КАШК.КРАВЕ 0.40 КГ БДС 5.40 Б" or "ПР.МЛЯКО 3.60 % ВЕРЕЯ 1.59 Б"
      const earlierPriceMatch = priceInfo.cleanPrefix.match(
        /^(.+?[а-яА-Яa-zA-Z]{2,}.*?)\s+(\d{1,4}[.,]\d{2})\s*(?:€|EUR|лв\.?|BGN|[АБВГA-D68*])?\s+([а-яА-Яa-zA-Z%]{1,}.*)$/i
      );
      if (earlierPriceMatch) {
        const p1 = parsePrice(earlierPriceMatch[2]);
        const p2 = priceInfo.price;
        const looksLikeQtyOrUnit =
          /\d+\s*(?:[xхХX@]\s+\d+|[*×]\s*\d+|бр\.?|кг|л\.?|гр)/i.test(earlierPriceMatch[1]) ||
          /^(?:%|кг|гр|г|л|мл|шт|оп|бр|kg|g|l|ml|pcs)(?:$|\s|\.)/i.test(earlierPriceMatch[3].trim());
        const looksLikeDualCurrency =
          p1 && (Math.abs(p2 / p1 - 1.95583) < 0.04 || Math.abs(p1 / p2 - 1.95583) < 0.04);

        if (p1 && p1 > 0 && !looksLikeQtyOrUnit && !looksLikeDualCurrency) {
          const item1 = parseItemFromChunk(earlierPriceMatch[1], p1, true);
          const item2 = parseItemFromChunk(earlierPriceMatch[3], p2, false);
          if (item1 && item2) {
            items.push(item1, item2);
            seenItemsStart = true;
            continue;
          }
        }
      }

      const parsedItem = parseItemFromChunk(priceInfo.cleanPrefix, priceInfo.price, true);
      if (parsedItem) {
        items.push(parsedItem);
        seenItemsStart = true;
      } else {
        pendingNameBuffer = [];
      }
      continue;
    }

    // 5. Unpriced text line -> potential multi-line wrapped product name!
    // Buffer only if we've started seeing items OR the line looks like a valid product description (not store header)
    if (
      hasLetters &&
      !isReceiptHeaderLineForItems(line, preferredCurrency) &&
      (seenItemsStart || !KNOWN_BG_MERCHANTS.some((m) => m.patterns.some((p) => p.test(line))))
    ) {
      pendingNameBuffer.push({ index: i, text: line });
      // Cap wrapped product name buffer at 2 preceding lines so distant header text cannot bleed into an item
      if (pendingNameBuffer.length > 2) {
        pendingNameBuffer.shift();
      }
    } else {
      pendingNameBuffer = [];
    }
  }

  return { items, discountTotal };
}

/**
 * Validates extracted Items Total against Receipt Total.
 * Triggers "Possible missing receipt items." whenever discrepancy is too large (>5%)
 * or detected item count is lower than receipt's printed item count with a balance difference.
 */
export function validateReceiptTotals(
  items: Array<{ name: string; price: number; quantity?: number }>,
  receiptTotal: number,
  expectedItemsCount?: number,
  discountTotal: number = 0
): {
  itemsTotal: number;
  receiptTotal: number;
  difference: number;
  differencePercent: number;
  isMismatch: boolean;
  warningMessage?: string;
} {
  const itemsTotal = parseFloat(
    items.reduce((sum, it) => sum + (Number(it.price) || 0), 0).toFixed(2)
  );
  const cleanReceiptTotal =
    receiptTotal > 0 ? parseFloat(receiptTotal.toFixed(2)) : itemsTotal;

  const rawDifference = parseFloat(
    Math.abs(cleanReceiptTotal - itemsTotal).toFixed(2)
  );
  const netAfterDiscount = parseFloat(Math.max(0, itemsTotal - (discountTotal || 0)).toFixed(2));
  const netDifference = parseFloat(
    Math.abs(cleanReceiptTotal - netAfterDiscount).toFixed(2)
  );
  const effectiveDifference = discountTotal > 0 ? Math.min(rawDifference, netDifference) : rawDifference;

  const differencePercent =
    cleanReceiptTotal > 0
      ? parseFloat(((effectiveDifference / cleanReceiptTotal) * 100).toFixed(1))
      : 0;

  const hasCountMismatch =
    typeof expectedItemsCount === "number" &&
    expectedItemsCount > 0 &&
    items.length < expectedItemsCount;

  const isMismatch =
    cleanReceiptTotal > 0 &&
    ((items.length > 0 && (differencePercent > 5 || (hasCountMismatch && effectiveDifference > 0.05))) ||
      (items.length === 0 && cleanReceiptTotal > 0));

  let warningMessage: string | undefined;
  if (isMismatch) {
    warningMessage =
      expectedItemsCount && hasCountMismatch
        ? `Possible missing receipt items. (Разпознати ${items.length} от ${expectedItemsCount} артикула; разлика €${effectiveDifference.toFixed(2)} / ${differencePercent.toFixed(1)}%)`
        : `Possible missing receipt items. (Сумата на артикулите €${itemsTotal.toFixed(2)} се различава с ${differencePercent.toFixed(1)}% от общата сума €${cleanReceiptTotal.toFixed(2)})`;
  }

  return {
    itemsTotal,
    receiptTotal: cleanReceiptTotal,
    difference: effectiveDifference,
    differencePercent,
    isMismatch,
    warningMessage,
  };
}

/**
 * Formats extracted receipt items into clean multi-line notes preserving quantity:
 * Example:
 * 2 x Coca Cola - €4.80
 * 1 x Water - €1.20
 * 1 x Chips - €3.50
 */
export function formatReceiptNotes(
  items: Array<{ name: string; price: number; quantity?: number }>,
  currency: string = "€"
): string {
  if (!items || items.length === 0) return "";

  return items
    .map((it) => {
      const qty = it.quantity && it.quantity >= 1 ? it.quantity : 1;
      if (currency === "лв." || currency === "BGN") {
        return `${qty} x ${it.name} - ${it.price.toFixed(2)} лв.`;
      }
      const sym = currency || "€";
      return `${qty} x ${it.name} - ${sym}${it.price.toFixed(2)}`;
    })
    .join("\n");
}

/**
 * Main Deterministic Local Receipt Parser (Bulgarian-First + Euro-First)
 * Operates instantly on OCR text without requiring Gemini API calls.
 */
export function parseReceiptTextLocally(rawText: string): ParsedReceiptData {
  const lines = cleanLines(rawText);
  const merchantRes = extractMerchant(lines);
  const dateRes = extractDate(lines);
  const currency = extractCurrency(rawText);
  const totalResult = extractTotal(lines, currency);
  const expectedItemsCount = extractExpectedItemsCount(lines);
  const { items, discountTotal } = extractItems(lines, totalResult.total, currency);

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

  const validation = validateReceiptTotals(items, finalTotal, expectedItemsCount, discountTotal);
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
  if (validation.isMismatch && validation.warningMessage) {
    warnings.push(validation.warningMessage);
  }
  if (!dateRes.dateDetected && dateRes.fallbackReason) {
    warnings.push(
      "Датата от касовата бележка не беше разчетена — временно е зададена днешната дата."
    );
  }

  console.log("[Receipt Parser] Diagnostics:", {
    lineCount: lines.length,
    currency,
    detectedMerchant: merchantRes.merchantName,
    merchantRule: merchantRes.matchedRule,
    ocrDetectedDate: dateRes.dateDetected ? dateRes.date : null,
    finalDate: dateRes.date,
    dateRule: dateRes.matchedRule,
    dateFallbackReason: dateRes.fallbackReason || null,
    receiptTotal: finalTotal,
    itemsTotal: validation.itemsTotal,
    difference: validation.difference,
    differencePercent: `${validation.differencePercent}%`,
    discountTotal,
    detectedItemsCount: items.length,
    expectedItemsCount: expectedItemsCount ?? null,
    totalRule: finalRule,
    confidence: finalConfidence,
    detectedQuantities: items.map((it) => `${it.quantity} x ${it.name}`),
    detectedItems: items,
  });

  return {
    merchantName: merchantRes.merchantName,
    date: dateRes.date,
    dateDetected: dateRes.dateDetected,
    dateFallbackReason: dateRes.fallbackReason,
    totalAmount: finalTotal,
    itemsTotal: validation.itemsTotal,
    totalDifference: validation.difference,
    totalDifferencePercent: validation.differencePercent,
    totalMismatchWarning: validation.warningMessage,
    expectedItemsCount,
    discountTotal: discountTotal > 0 ? discountTotal : undefined,
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
