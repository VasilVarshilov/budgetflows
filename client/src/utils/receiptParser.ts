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
  items: Array<{
    name: string;
    price: number;
    quantity: number;
    originalPrice?: number;
    discount?: number;
    finalPrice?: number;
    discountLabel?: string;
  }>;
  notesFormatted: string;
  confidence: "high" | "medium" | "low";
  matchedRule?: string;
  merchantRule?: string;
  dateRule?: string;
  detectedAddress?: string;
  addressRule?: string;
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
    patterns: [
      /kaufland/i,
      /кауфланд/i,
      /kauf[1l|]and/i,
      /kauf[1l|]4nd/i,
      /кауфла[ин][дл]/i,
      /кауфаанд/i,
    ],
  },
  {
    canonical: "Lidl",
    categoryHint: "храна",
    patterns: [
      /\blidl\b/i,
      /лидл/i,
      /лидъл/i,
      /дидл/i,
      /\bлида\b/i,
      /\bl1dl\b/i,
      /\bl[i1|!]d[l1|]\b/i,
      /л[иn1][дa][л1]/i,
    ],
  },
  {
    canonical: "Billa",
    categoryHint: "храна",
    patterns: [
      /\bbilla\b/i,
      /билла/i,
      /(?:^|[^а-яА-Яa-zA-Z])била(?:$|[^а-яА-Яa-zA-Z])/i,
      /\bb[1i|]ll[a4]\b/i,
      /\b8illa\b/i,
      /8илла/i,
      /б[иn]лл[аa]/i,
    ],
  },
  {
    canonical: "Fantastico",
    categoryHint: "храна",
    patterns: [
      /fantastico/i,
      /фантастико/i,
      /фантастико\s*груп/i,
      /вантастико/i,
      /фант[аa]стик[о0]/i,
    ],
  },
  {
    canonical: "T Market",
    categoryHint: "храна",
    patterns: [
      /\bt[\s-]*market\b/i,
      /т[\s-]*маркет/i,
      /т[\s-]*марке[тг]/i,
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
      /м[еe]тр[о0]\s*к[еe]ш/i,
      /m[eе]t[pр][oо0]/i,
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
export function repairCyrillicWordTokens(
  text: string,
  hasCyrillicContext: boolean = false
): string {
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
  const knownEnglishTokens = new Set([
    "LIDL", "BILLA", "KAUFLAND", "FANTASTICO", "MARKET", "METRO", "COLA", "COCA",
    "PEPSI", "FANTA", "SPRITE", "MILKA", "OREO", "DANONE", "NESTLE", "ACTIMEL",
    "ACTIVIA", "NUTELLA", "PRINGLES", "HEINEKEN", "TUBORG", "RED", "BULL",
    "WATER", "CHIPS", "ZERO", "LIGHT", "MAX", "MINI", "CLASSIC", "EXTRA", "XXL",
    "XL", "PLUS", "BIO", "FIT", "PRO", "VIP", "FRESH", "ORIGINAL", "CREAM", "CHEESE",
    "MILK", "BREAD", "EUR", "BGN", "USD", "GBP", "VISA", "MASTERCARD", "POS",
  ]);
  const lineHasCyrillic = hasCyrillicContext || /[а-яА-Я]{2,}/.test(text);

  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!token || /^\s+$/.test(token)) return token;
      if (unitOrCodeToken.test(token)) return token; // Measurements like 500г, 1.5л untouched
      if (/^АИ\d+$/i.test(token)) return token; // Fuel grade АИ95 untouched

      const hasCyrChar = /[а-яА-Я]/.test(token);
      const upperStrip = token.replace(/[^A-Za-zА-Яа-я]/g, "").toUpperCase();
      // Allow repairing ALL-CAPS homoglyph BG words (e.g. COK, TOCT, CNPEHE) when the line has Cyrillic context
      const isHomoglyphBgCandidate =
        lineHasCyrillic &&
        !hasCyrChar &&
        !knownEnglishTokens.has(upperStrip) &&
        upperStrip.length >= 2 &&
        /^[ABCEHKMOPTXN]{2,}$/.test(upperStrip) &&
        upperStrip === token.replace(/[^A-Za-z]/g, "");

      if (!hasCyrChar && !isHomoglyphBgCandidate) return token;

      let repaired = token
        .split("")
        .map((ch) => letterHomoglyphMap[ch] || ch)
        .join("");

      // Repair 0->О, 8->В, 6->Б, 3->З, 4->Ч when embedded inside an alphabetic Cyrillic word
      if (/^[а-яА-Я08634-]+$/.test(repaired) && /[а-яА-Я]{2,}/.test(repaired)) {
        const isAllLower = repaired === repaired.toLowerCase();
        repaired = repaired
          .replace(/0/g, isAllLower ? "о" : "О")
          .replace(/8/g, isAllLower ? "в" : "В")
          .replace(/6/g, isAllLower ? "б" : "Б")
          .replace(/(?<=[а-яА-Я])3|3(?=[а-яА-Я]{2,})/g, isAllLower ? "з" : "З")
          .replace(/(?<=[а-яА-Я])4|4(?=[а-яА-Я]{2,})/g, isAllLower ? "ч" : "Ч");
      }

      return repaired;
    })
    .join("");
}

/**
 * Normalizes raw OCR text before parsing:
 * - Fixes Unicode spaces, OCR broken decimal separators ("4 . 80" -> "4.80")
 * - Fixes glued OCR tax group digits ("1.296" -> "1.29 Б", "2.458" -> "2.45 В")
 * - Fixes missing decimal dots when trailing currency/VAT glyph confirms price ("1 49 Б" -> "1.49 Б")
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
      // Fix semicolon / middle-dot decimal typos in prices (e.g. "3;49" -> "3.49", "3·49" -> "3.49")
      .replace(/(^|[\s€$£-])(\d{1,5})[;·•](\d{2})(?=$|\s|[^\d])/g, "$1$2.$3")
      // Fix OCR spaces on either/both sides of decimal separators in prices (e.g. "4 . 80", "4. 80", "4 .80")
      // and 3-decimal quantities before multiplication/units (e.g. "4 . 000 x 0.15" -> "4.000 x 0.15")
      // while protecting calendar dates like "14. 11. 2026" via negative lookbehind/lookahead
      .replace(
        /(^|[^\d./-])(\d{1,5})\s*([.,])\s*(\d{2})(?!\s*[./-]\s*\d)(?=$|\s|[^\d])/g,
        "$1$2$3$4"
      )
      .replace(/(\d{1,3})\s*([.,])\s*(\d{3})(?=\s*(?:[xхХX*×@]|бр\.?|кг\.?|kg))/gi, "$1$2$3")
      // Fix missing decimal dot when trailing Bulgarian VAT letter or currency explicitly marks a price: "1 49 Б" or "400Г 1 49 Б" -> "400Г 1.49 Б"
      .replace(
        /(^|.*\s)(\d{1,3})\s(\d{2})(?=\s+(?:€|EUR|лв\.?|BGN|[АБВГA-D*])(?:\s|$|[.,|]))/gim,
        "$1$2.$3"
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
      // Fix apostrophe decimal typo in prices ("3'49" -> "3.49") and colon decimal typo before currency/tax/end
      .replace(/(^|[\s€$£-])(\d{1,4})'(\d{2})(?=$|\s|[^\d])/g, "$1$2.$3")
      .replace(
        /(^|\s)(\d{1,4}):(\d{2})(?=\s*(?:€|EUR|лв\.?|BGN|[АБВГA-DSR685*])(?:\s|$|[.,|])|\s*$)/gim,
        "$1$2.$3"
      )
      // Fix glued VAT group letter misread as trailing digit at end of priced item line: "1.296" -> "1.29 Б", "2.458" -> "2.45 В"
      // Guarded against weights/volumes/unit rates (followed by кг/kg/x/*)
      .replace(
        /(\s\d{1,4}[.,]\d{2})([568])(?=\s*[.,|*\-)]*\s*$)/gm,
        (_m, pricePart, taxDigit) => `${pricePart} ${taxDigit === "8" ? "В" : "Б"}`
      )
      // Separate glued currency/tax glyph after decimal price: "1.29Б" -> "1.29 Б", "4.80EUR" -> "4.80 EUR"
      .replace(/(\d+[.,]\d{2})([АБВГДЕабвгдеA-DSR€$£]|EUR|BGN|лв\.?)/gi, "$1 $2")
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
    /^\s*(?:ГР\.|УЛ\.|БУЛ\.|Ж\.К\.|ОБЛ\.|ОБЩ\.)(?:\s|$)/,
    /^\s*(?:С\.|КВ\.|ПЛ\.)\s+(?:[А-Я][а-я]{2,}|[^а-яА-Я]*\d)/,
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
  const searchSlice = lines.slice(0, Math.min(lines.length, 20));
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

  // Fallback check on footer lines if logo at top was purely graphic
  if (lines.length > 20) {
    const footerSlice = lines.slice(Math.max(20, lines.length - 12));
    for (const line of footerSlice) {
      const cyr = toCyrillicMatchForm(line);
      const lat = toLatinMatchForm(line);
      for (const rule of KNOWN_BG_MERCHANTS) {
        if (
          rule.patterns.some((p) => p.test(line) || p.test(cyr) || p.test(lat))
        ) {
          return {
            merchantName: rule.canonical,
            matchedRule: `Known brand match in footer: ${rule.canonical} ("${line}")`,
          };
        }
      }
    }
  }

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const rawLine = lines[i].trim();
    if (rawLine.length < 2) continue;
    if (isNonMerchantMetadataLine(rawLine)) continue;

    const cleaned = cleanMerchantName(repairCyrillicWordTokens(rawLine, true));
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

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
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
  // Replace Cyrillic/Latin OCR lookalikes (O->0, б->6, l/I/|->1) inside date segments (year first so subsequent month/day lookaheads match 20xx)
  return line
    .replace(/2[ОO]([1-3])([ОOбЗ\d])/g, (_m, d3, d4) => {
      const f4 = d4 === "О" || d4 === "O" ? "0" : d4 === "б" ? "6" : d4 === "З" ? "3" : d4;
      return `20${d3}${f4}`;
    })
    .replace(/20([1-3])[б]/g, "20$16")
    .replace(/([0-3OО]?)[ОO](?=\d?\s*[-/.,:]\s*[01ОOlI|\d]{1,2}\s*[-/.,:]\s*(?:20[1-3]\d|1[89]|[23]\d))/g, "$10")
    .replace(/(\d{1,2}\s*[-/.,:]\s*)([01OО]?)[ОO](?=\d?\s*[-/.,:]\s*(?:20[1-3]\d|1[89]|[23]\d))/g, "$1$20")
    .replace(/([01]?)[ОO](?=\s*[-/.,:]\s*20[1-3]\d)/g, "$10")
    .replace(/(?:^|[^\dA-Za-zА-Яа-я])(\d?[lI|]|[lI|]\d?)(?=\s*[-/.,:]\s*[01lI|\d]{1,2}\s*[-/.,:]\s*20[1-3]\d)/g, (m) =>
      m.replace(/[lI|]/g, "1")
    )
    .replace(/(\d{1,2}\s*[-/.,:]\s*)(\d?[lI|]|[lI|]\d?)(?=\s*[-/.,:]\s*20[1-3]\d)/g, (_m, pre, mm) =>
      `${pre}${mm.replace(/[lI|]/g, "1")}`
    )
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
    const isPromoOrExpiryLine = /(ВАЖИ|ПРОМО|КАМПАНИЯ|СРОК|ГОД\.\s*ДО|\bEXP\b)/.test(cyr);
    const isFiscalOrIdLine =
      (/(УНП|ЕИК|БУЛСТАТ|(?:^|\s)(?:ФУ|ФП)(?:$|[\s:№N#\-\d])|BG\d|БОН\s*№|СТОРНО)/.test(cyr) ||
        (/КАСА/.test(cyr) && !hasTime)) &&
      !hasDateLabel;

    // 1. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY or DD.MM:YYYY (also when glued to HH:MM)
    const dmyRegex =
      /(?:^|[^\d])([0-3]?\d)\s*[-/.,:]\s*([01]?\d)\s*[-/.,:]\s*(20[1-3]\d)(?=[^\d]|$|\d{2}:\d{2})/g;
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
            (isPromoOrExpiryLine ? -35 : 0) +
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
          score: 90 + (hasDateLabel ? 25 : 0) + (hasTime ? 15 : 0) + (isPromoOrExpiryLine ? -35 : 0),
          rule: `Named month in "${rawLine}"`,
        });
      }
    }

    // 2. YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    const ymdRegex =
      /(?:^|[^\d])(20[1-3]\d)\s*[-/.]\s*([01]?\d)\s*[-/.]\s*([0-3]?\d)(?=[^\d]|$|\d{2}:\d{2})/g;
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
            (isPromoOrExpiryLine ? -35 : 0) +
            (isFiscalOrIdLine ? -45 : 0),
          rule: `YYYY-MM-DD in "${rawLine}"`,
        });
      }
    }

    // 3. DD.MM.YY or DD/MM/YY or DD-MM-YY
    const dmyShortRegex =
      /(?:^|[^\d])([0-3]?\d)\s*[-/.]\s*([01]?\d)\s*[-/.]\s*(2[0-9]|1[89])(?=[^\d]|$|\d{2}:\d{2})/g;
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
            (isPromoOrExpiryLine ? -35 : 0) +
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

// Extract Currency (EUR-first for Bulgaria; never outputs BGN/лв.)
export function extractCurrency(rawText: string): string {
  const normalized = normalizeBulgarianOcrText(rawText);
  const hasEur = /(?:€|\beur\b|евро)/i.test(normalized);
  const hasUsd = /(?:\$|\busd\b)/i.test(normalized);
  const hasGbp = /(?:£|\bgbp\b)/i.test(normalized);

  if (hasEur) return "€";
  if (hasUsd) return "$";
  if (hasGbp) return "£";

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

        // On dual-currency lines (e.g. "ОБЩО 18.58 лв. / €9.50"), pick the preferred currency value
        const eurMatch = tokenMatches.find((m) => /(?:€|EUR)/i.test(m));
        const bgnMatch = tokenMatches.find((m) => /(?:лв|BGN)/i.test(m));
        let chosenRaw: string | undefined = tokenMatches[0];
        if (preferredCurrency === "€" && eurMatch) {
          chosenRaw = eurMatch;
        } else if (preferredCurrency === "лв." && bgnMatch) {
          chosenRaw = bgnMatch;
        } else if (
          preferredCurrency === "€" &&
          tokenMatches.length >= 2 &&
          !eurMatch
        ) {
          const m0 = tokenMatches[0];
          const m1 = tokenMatches[1];
          const pFirst = m0 ? parsePrice(m0) : null;
          const pSecond = m1 ? parsePrice(m1) : null;
          if (m0 && m1 && pFirst && pSecond && (Math.abs(pFirst / pSecond - 1.95583) < 0.04 || Math.abs(pSecond / pFirst - 1.95583) < 0.04)) {
            chosenRaw = pFirst < pSecond ? m0 : m1;
          }
        }

        // Currency alignment bonus/penalty when BGN and EUR totals appear on separate lines
        const lineHasEur = /(?:€|\bEUR\b|ЕВРО)/i.test(line) || /(?:€|\bEUR\b|ЕВРО)/i.test(cyr);
        const lineHasBgn = /(?:лв\.?|\bBGN\b)/i.test(line) || /(?:ЛВ|\bBGN\b)/i.test(cyr);
        let currencyPriorityDelta = 0;
        if (preferredCurrency === "€") {
          if (lineHasEur && !lineHasBgn) currencyPriorityDelta = 15;
          else if (lineHasBgn && !lineHasEur) currencyPriorityDelta = -15;
        } else if (preferredCurrency === "лв.") {
          if (lineHasBgn && !lineHasEur) currencyPriorityDelta = 15;
          else if (lineHasEur && !lineHasBgn) currencyPriorityDelta = -15;
        }

        if (chosenRaw) {
          const val = parsePrice(chosenRaw);
          if (val && val > 0) {
            candidates.push({
              amount: val,
              priority: rule.basePriority + currencyPriorityDelta + (isPaymentTenderLine ? -25 : 0),
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
                priority: rule.basePriority + currencyPriorityDelta - 5,
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
  if (/(?:КАРТА\s*(?:БИЛЛА|БИЛА|КЛИЕНТ|КЛУБ|LIDL|KAUFLAND|ФАНТАСТИКО|METRO|МЕТРО|ЛОЯЛ|БОНУС)|BILLA\s*CARD|KAUFLAND\s*CARD|LIDL\s*PLUS)/i.test(cyr)) {
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
  const repaired = repairCyrillicWordTokens(rawName, true);
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
 * and OCR-noisy tax letters (А, Б, В, Г, A-D, 6, 8, 5, S, R, *, brackets).
 * Never treats percentages (e.g. "3.60%") as a price.
 */
function extractTrailingItemPrice(
  line: string,
  preferredCurrency: string = "€"
): { price: number; cleanPrefix: string } | null {
  // 1. Check dual-currency ending first: e.g. "ХЛЯБ БЯЛ  €1.20 / 2.35 лв." or "КАШК.КРАВЕ  6.83 Б  3.49 EUR"
  // Never uses * or x as separator between two prices so "2 x 1.00 1.96" is not confused with BGN/EUR
  const dualMatch = line.match(
    /((?:EUR|BGN|€|лв\.?)?\s*\d{1,5}[.,]\d{2}\s*(?:EUR|BGN|€|лв\.?)?)\s*(?:[*#]?\s*[АБВГДЕабвгдеA-DSR685])?\s*(?:[/|=]|или|\s)\s*((?:EUR|BGN|€|лв\.?)?\s*\d{1,5}[.,]\d{2}\s*(?:EUR|BGN|€|лв\.?)?)\s*(?:[([]?\s*[*#]?\s*[АБВГДЕабвгдеA-DSR685]\s*[)\]]?)?\s*[-.,|*_~/'"]*$/i
  );
  if (dualMatch && dualMatch.index !== undefined) {
    const beforeDual = line.slice(0, dualMatch.index).trimEnd();
    const precededByMultiply = /[xхХX*×@]\s*$/.test(beforeDual);
    const partA = dualMatch[1];
    const partB = dualMatch[2];
    const pA = parsePrice(partA);
    const pB = parsePrice(partB);
    const hasBothEurAndBgn =
      (/(?:€|EUR)/i.test(partA) && /(?:лв|BGN)/i.test(partB)) ||
      (/(?:лв|BGN)/i.test(partA) && /(?:€|EUR)/i.test(partB));
    const isBgnEurPair =
      !precededByMultiply &&
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

  // 2. Standard single trailing price with optional currency & Bulgarian tax code (never matches %)
  const singleMatch = line.match(
    /(?:EUR|BGN|USD|GBP|[$€£])?\s*(\d{1,5}[.,]\d{2})(?!\s*%)\s*(?:лв\.?|BGN|EUR|USD|GBP|€|\$|£)?\s*(?:[([]?\s*[*#]?\s*[АБВГДЕабвгдеA-DSR685]\s*[)\]]?)?\s*[-.,|*_~/'"]*$/i
  );
  if (singleMatch && singleMatch.index !== undefined) {
    // Reject if preceded immediately by a minus sign (discount row handled separately)
    const beforeChar = singleMatch.index > 0 ? line[singleMatch.index - 1] : "";
    if (beforeChar === "-") return null;
    // Reject trailing minus right after the matched price digits (e.g. "1,02-" or "1,02 - Б")
    const afterDigits = line.slice(singleMatch.index + singleMatch[0].indexOf(singleMatch[1]) + singleMatch[1].length);
    if (/^\s*(?:€|EUR|лв\.?|BGN)?\s*-/.test(afterDigits)) return null;
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
 * Checks if a line is a standalone promo header without a price (e.g. "#Lidl Plus промоция", "ПРОМОЦИЯ")
 * that precedes a per-item discount line such as "ОТСТЪПКИ 1,02-".
 */
function extractPromoHeaderLabel(line: string): string | null {
  if (/\d{1,5}[.,]\d{2}/.test(line)) return null;
  const trimmed = line.trim();
  const cyr = toCyrillicMatchForm(trimmed);
  const lat = toLatinMatchForm(trimmed);

  if (/#?\s*l[i1l]d[l1]\s*plu[s5]/i.test(trimmed) || /#?\s*lidl\s*plus/i.test(lat) || /лидл\s*плюс/i.test(cyr)) {
    return "Lidl Plus";
  }
  if (/kaufland\s*card|кауфланд\s*карт/i.test(lat) || /кауфланд\s*карт/i.test(cyr)) {
    return "Kaufland Card";
  }
  if (/billa\s*card|била\s*карт|билла\s*карт/i.test(lat) || /билл?а\s*карт/i.test(cyr)) {
    return "Billa Card";
  }
  if (/^[#*\s]*(?:ПРОМОЦИЯ|ПРОМО|НАМАЛЕНИЕ|ОТСТЪПКИ|ОТСТЪПКА|АКЦИЯ|PROMO|DISCOUNT)[!:\s]*$/i.test(cyr) ||
      /^[#*\s]*(?:PROMO|PROMOTION|DISCOUNT)[!:\s]*$/i.test(lat)) {
    return "Промоция";
  }
  return null;
}

/**
 * Checks whether a discount/savings line is a receipt footer summary
 * (e.g. "ВИЕ СПЕСТИХТЕ: 1.86", "ОБЩА ОТСТЪПКА 1.86") that must NOT be attached to the last item.
 */
function isReceiptFooterDiscountSummary(line: string): boolean {
  const cyr = toCyrillicMatchForm(line);
  const lat = toLatinMatchForm(line);
  return (
    /(?:ВИЕ\s*СПЕСТИХТЕ|СПЕСТИХТЕ\s*ОБЩО|ОБЩА\s*ОТСТЪПКА|ОБЩО\s*ОТСТЪПКИ|ОБЩО\s*СПЕСТЕНИ|СПЕСТЕНИ\s*ОБЩО|СПЕСТЕНО\s*(?:ОБЩО|С\s*LIDL)|ОБЩО\s*НАМАЛЕНИЕ)/.test(cyr) ||
    /(?:TOTAL\s*DISCOUNT|TOTAL\s*SAVINGS|TOTAL\s*SAVED|YOU\s*SAVED)/.test(lat)
  );
}

/**
 * Checks whether a line is a discount/rebate row and extracts its positive EUR/currency value.
 * Supports:
 * - Trailing minus (Lidl Bulgaria): "ОТСТЪПКИ 1,02-", "ОТСТЪПКИ 0,84-", "1,02- Б"
 * - Leading minus: "LIDL PLUS -1.50 Б", "ОТСТЪПКА -0.80", "-1.02 €"
 * - Explicit discount keyword + positive number: "ОТСТЪПКИ 1,02", "ОТСТЪПКА 0.50"
 * - Dual-currency discount lines (picks preferred currency).
 */
function extractDiscountAmount(line: string, preferredCurrency: string = "€"): number {
  const cyr = toCyrillicMatchForm(line);
  const lat = toLatinMatchForm(line);

  // Dual-currency discount line (e.g. "ОТСТЪПКИ 2,00- лв / 1,02- EUR" or "ОТСТЪПКА -2.00 / -1.02 €")
  const dualDiscMatch = line.match(
    /(-?\s*\d{1,4}[.,]\d{2}\s*-?\s*(?:EUR|BGN|€|лв\.?)?)\s*(?:[/|=]|или|\s)\s*(-?\s*\d{1,4}[.,]\d{2}\s*-?\s*(?:EUR|BGN|€|лв\.?)?)\s*(?:[([]?\s*[*#]?\s*[АБВГДЕабвгдеA-DSR685]\s*[)\]]?)?\s*$/i
  );
  const hasExplicitMinus = /(?:^|\s|[$€£])-\s*\d{1,4}[.,]\d{2}|\d{1,4}[.,]\d{2}\s*-/.test(line);
  const hasDiscountKeyword =
    /(?:ОТСТЪПК[АИ]?|НАМАЛЕНИ[ЕЯ]|СПЕСТЕН[ИО]?|ПРОМО(?:ЦИЯ)?|LIDL\s*PLUS|КАУФЛАНД\s*КАРТ|BILLA\s*CARD)/.test(cyr) ||
    /(?:DISCOUNT|SAVED|PROMO|LIDL\s*PLUS|KAUFLAND\s*CARD|BILLA\s*CARD)/.test(lat);

  if (dualDiscMatch && (hasExplicitMinus || hasDiscountKeyword)) {
    const pA = parsePrice(dualDiscMatch[1].replace(/-/g, ""));
    const pB = parsePrice(dualDiscMatch[2].replace(/-/g, ""));
    if (pA && pB && (Math.abs(pA / pB - 1.95583) < 0.05 || Math.abs(pB / pA - 1.95583) < 0.05)) {
      if (preferredCurrency === "€") {
        if (/(?:€|EUR)/i.test(dualDiscMatch[1]) && !/(?:€|EUR)/i.test(dualDiscMatch[2])) return pA;
        if (/(?:€|EUR)/i.test(dualDiscMatch[2]) && !/(?:€|EUR)/i.test(dualDiscMatch[1])) return pB;
        return Math.min(pA, pB);
      }
      return Math.max(pA, pB);
    }
  }

  // Trailing minus (Lidl standard: "ОТСТЪПКИ 1,02-", "1,02- Б", "0.84 - EUR")
  const trailingMinusMatch = line.match(
    /(\d{1,4}[.,]\d{2})\s*-(?:\s*(?:€|EUR|лв\.?|BGN))?\s*(?:[([]?\s*[*#]?\s*[АБВГДЕабвгдеA-DSR685]\s*[)\]]?)?\s*$/i
  );
  if (trailingMinusMatch) {
    const val = parsePrice(trailingMinusMatch[1]);
    if (val && val > 0) return val;
  }

  // Leading minus ("-1.02", "- 0,84 €", "€-1.02")
  const leadingMinusMatch = line.match(
    /(?:[$€£]\s*-\s*|-\s*(?:[$€£]\s*)?)(\d{1,4}[.,]\d{2})(?:\s*(?:€|EUR|лв\.?|BGN))?\s*(?:[([]?\s*[*#]?\s*[АБВГДЕабвгдеA-DSR685]\s*[)\]]?)?\s*$/i
  );
  if (leadingMinusMatch) {
    const val = parsePrice(leadingMinusMatch[1]);
    if (val && val > 0) return val;
  }

  // Keyword discount line with positive number ("ОТСТЪПКИ 1,02", "LIDL PLUS 0.84")
  if (hasDiscountKeyword) {
    const posMatch = line.match(
      /(\d{1,4}[.,]\d{2})\s*(?:€|EUR|лв\.?|BGN)?\s*(?:[([]?\s*[*#]?\s*[АБВГДЕабвгдеA-DSR685]\s*[)\]]?)?\s*$/i
    );
    if (posMatch) {
      const val = parsePrice(posMatch[1]);
      if (val && val > 0) return val;
    }
  }

  return 0;
}

export interface ExtractedReceiptItem {
  name: string;
  price: number;
  quantity: number;
  originalPrice?: number;
  discount?: number;
  finalPrice?: number;
  discountLabel?: string;
}

// Extract Item Lines from text (Bulgarian + English + EUR + multi-line + quantity + per-item discount preservation)
export function extractItems(
  lines: string[],
  _totalAmount: number,
  preferredCurrency: string = "€"
): {
  items: ExtractedReceiptItem[];
  discountTotal: number;
  unattachedDiscountTotal: number;
} {
  const items: ExtractedReceiptItem[] = [];
  let discountTotal = 0;
  let unattachedDiscountTotal = 0;

  // Quantity x UnitPrice (+ optional currency/unit rate + optional trailing line total)
  // e.g. "2 x 2.40   €4.80", "2 x 1.20 € = 2.40", "1.250 кг x 3.29 лв/кг  4.11 Б", "2 @ 1.20  2.40"
  const unitRateSuffix =
    "(?:\\s*(?:€|EUR|лв\\.?|BGN|USD|GBP)?(?:\\s*/\\s*1?\\s*(?:бр\\.?|кг\\.?|гр\\.?|г\\.?|л\\.?|мл\\.?|шт\\.?|оп\\.?|kg|g|l|ml|pcs))?)";
  const qtyCalculationWithTotalRegex = new RegExp(
    `^[*#•\\s]*(\\d+(?:[.,]\\d+)?)\\s*(?:бр\\.?|кг\\.?|гр\\.?|г\\.?|л\\.?|мл\\.?|шт\\.?|оп\\.?|kg|g|l|ml|pcs)?\\s*[xхХX*×@]\\s*(\\d+[.,]\\d{2,3})${unitRateSuffix}\\s*(?:=|\\s)\\s*(?:EUR|BGN|[$€£])?\\s*(\\d{1,5}[.,]\\d{2})\\s*(?:лв\\.?|BGN|EUR|USD|GBP|€|\\$|£)?\\s*(?:[([]?\\s*[*#]?\\s*[АБВГДЕабвгдеA-DSR685]\\s*[)\\]]?)?\\s*[-.,|*_~/]*\\s*$`,
    "i"
  );

  // Quantity x UnitPrice WITHOUT total on the same line (allows optional currency before/after unit price and trailing =)
  const qtyCalculationOnlyRegex = new RegExp(
    `^[*#•\\s]*\\(?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:бр\\.?|кг\\.?|гр\\.?|г\\.?|л\\.?|мл\\.?|шт\\.?|оп\\.?|kg|g|l|ml|pcs)?\\s*[xхХX*×@]\\s*(?:EUR|BGN|USD|GBP|[$€£])?\\s*(\\d+[.,]\\d{2,3})${unitRateSuffix}\\s*\\)?\\s*=?\\s*$`,
    "i"
  );

  const getQtyPriceMatchError = (expectedTotal: number, itemPrice: number): number | null => {
    if (!Number.isFinite(expectedTotal) || expectedTotal <= 0 || itemPrice <= 0) return null;
    const tol = Math.max(0.02, itemPrice * 0.015);
    const directErr = Math.abs(expectedTotal - itemPrice);
    if (directErr <= tol) return directErr;
    const divErr = Math.abs(expectedTotal / 1.95583 - itemPrice);
    if (divErr <= tol) return divErr;
    const mulErr = Math.abs(expectedTotal * 1.95583 - itemPrice);
    if (mulErr <= tol) return mulErr;
    return null;
  };

  // Standalone price line (when OCR wrapped a price onto the line below the product name)
  const standalonePriceLineRegex =
    /^(?:EUR|BGN|USD|GBP|[$€£])?\s*(\d{1,5}[.,]\d{2})\s*(?:лв\.?|BGN|EUR|USD|GBP|€|\$|£)?\s*(?:[([]?\s*[*#]?\s*[АБВГДЕабвгдеA-DSR685]\s*[)\]]?)?\s*[-.,|*_~/]*\s*$/i;

  const consumedLineIndices = new Set<number>();
  const pendingLineQuantities = new Map<
    number,
    { qty: number; isDiscreteCount: boolean; unitLabel?: string }
  >();
  let pendingNameBuffer: Array<{ index: number; text: string }> = [];
  let seenItemsStart = false;
  let pendingDiscountLabel: string | undefined;
  let lastItemEligibleForDiscount = false;

  const pushExtractedItem = (item: ExtractedReceiptItem, sourceLineIdx?: number) => {
    if (sourceLineIdx !== undefined && pendingLineQuantities.has(sourceLineIdx)) {
      const pq = pendingLineQuantities.get(sourceLineIdx)!;
      pendingLineQuantities.delete(sourceLineIdx);
      if (pq.isDiscreteCount && item.quantity === 1) {
        item.quantity = pq.qty;
      } else if (!pq.isDiscreteCount && pq.unitLabel && !item.name.includes(pq.unitLabel)) {
        item.name = `${item.name} (${pq.unitLabel})`;
      }
    }
    items.push(item);
    seenItemsStart = true;
    lastItemEligibleForDiscount = true;
    pendingDiscountLabel = undefined;
  };

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
      pendingDiscountLabel = undefined;
      lastItemEligibleForDiscount = false;
      continue;
    }

    // Handle standalone promo header lines (e.g. "#Lidl Plus промоция") without polluting next item's name
    const promoHeaderLabel = extractPromoHeaderLabel(line);
    if (promoHeaderLabel) {
      pendingDiscountLabel = promoHeaderLabel;
      pendingNameBuffer = [];
      continue;
    }

    // Track discount rows & attach per-item discounts directly to the preceding item
    const disc = extractDiscountAmount(line, preferredCurrency);
    if (disc > 0) {
      pendingNameBuffer = [];
      if (isReceiptFooterDiscountSummary(line)) {
        lastItemEligibleForDiscount = false;
        pendingDiscountLabel = undefined;
        continue;
      }

      discountTotal = parseFloat((discountTotal + disc).toFixed(2));
      if (lastItemEligibleForDiscount && items.length > 0) {
        const prevItem = items[items.length - 1];
        const origPrice = prevItem.originalPrice ?? prevItem.price;
        if (disc <= origPrice) {
          const nextDiscount = parseFloat(((prevItem.discount || 0) + disc).toFixed(2));
          const nextFinal = parseFloat(Math.max(0, origPrice - nextDiscount).toFixed(2));
          prevItem.originalPrice = parseFloat(origPrice.toFixed(2));
          prevItem.discount = nextDiscount;
          prevItem.finalPrice = nextFinal;
          prevItem.price = nextFinal;
          prevItem.discountLabel =
            prevItem.discountLabel ||
            pendingDiscountLabel ||
            (/(?:lidl\s*plus|лидл\s*плюс)/i.test(toLatinMatchForm(line))
              ? "Lidl Plus"
              : "Отстъпка");
          pendingDiscountLabel = undefined;
          consumedLineIndices.add(i);
          continue;
        }
      }
      unattachedDiscountTotal = parseFloat((unattachedDiscountTotal + disc).toFixed(2));
      pendingDiscountLabel = undefined;
      continue;
    }

    // Skip explicit header/footer noise and clear buffer
    if (isSeparatorOrHeaderNoise(line) || isNonItemSummaryOrMetaLine(line)) {
      pendingNameBuffer = [];
      lastItemEligibleForDiscount = false;
      pendingDiscountLabel = undefined;
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
          pushExtractedItem({
            name: displayName,
            price: totalLinePrice,
            quantity: isDiscreteCount ? rawQty : 1,
          });
          consumedLineIndices.add(i);
          continue;
        }
      }
    }

    // 2. Standalone qty x unitPrice line ("4.000 x 0.15", "2 x 2.40" or "0.800 кг x 4.00/кг"):
    //    First compute expectedTotal = rawQty * unitVal, then search nearby products
    //    (previous parsed item(s) and upcoming item(s)) prioritizing exact mathematical price match
    //    over physical proximity. Never alter a product's quantity unless price matches.
    const qtyOnlyMatch = line.match(qtyCalculationOnlyRegex);
    if (qtyOnlyMatch) {
      const rawQty = parseFloat(qtyOnlyMatch[1].replace(",", "."));
      const unitVal = parsePrice(qtyOnlyMatch[2]);
      const isWeightOrVolume =
        /(?:^|[^а-яА-Яa-zA-Z])(?:кг|гр|г|л|мл|kg|g|l|ml)\.?(?=$|[^а-яА-Яa-zA-Z])/i.test(line);
      const isDiscreteCount =
        !isWeightOrVolume &&
        Number.isInteger(rawQty) &&
        rawQty >= 1 &&
        rawQty <= 999;

      if (unitVal && rawQty > 0) {
        const expectedTotal = rawQty * unitVal;

        // 2a. Evaluate immediately preceding parsed item(s) within 1-2 positions
        interface MatchedCandidate {
          kind: "prev" | "next";
          err: number;
          distance: number;
          prevItemIndex?: number;
          endIndex?: number;
          consumedExtraIndices?: number[];
          nextName?: string;
          nextPrice?: number;
        }
        const matchedCandidates: MatchedCandidate[] = [];

        if (items.length > 0 && pendingNameBuffer.length === 0) {
          const prevAdjacent =
            consumedLineIndices.has(i - 1) ||
            (i >= 2 && /^\d{8,14}$/.test(lines[i - 1].trim()) && consumedLineIndices.has(i - 2));
          if (prevAdjacent) {
            for (let backOffset = 0; backOffset < 2 && items.length - 1 - backOffset >= 0; backOffset++) {
              const prevIdx = items.length - 1 - backOffset;
              const prevItem = items[prevIdx];
              if (prevItem.quantity === 1) {
                const prevCheckPrice = prevItem.originalPrice ?? prevItem.price;
                const err = getQtyPriceMatchError(expectedTotal, prevCheckPrice);
                if (err !== null) {
                  matchedCandidates.push({
                    kind: "prev",
                    err,
                    distance: backOffset + 1,
                    prevItemIndex: prevIdx,
                  });
                }
              }
            }
          }
        }

        // 2b. Evaluate upcoming product(s) in lookahead lines (supports wrapped 2-line names & skipped promo headers)
        interface NextQtyCandidate {
          endIndex: number;
          consumedExtraIndices: number[];
          name: string;
          price: number;
          err: number | null;
        }
        const upcomingCandidates: NextQtyCandidate[] = [];
        let bufferedPrefixText = pendingNameBuffer.map((b) => b.text).join(" ").trim();
        let lookaheadIdx = i + 1;
        const maxLookahead = Math.min(lines.length, i + 6);

        while (lookaheadIdx < maxLookahead && upcomingCandidates.length < 2) {
          const candidateLine = lines[lookaheadIdx];
          if (
            /^\d{8,14}$/.test(candidateLine.trim()) ||
            isSeparatorOrHeaderNoise(candidateLine) ||
            extractPromoHeaderLabel(candidateLine)
          ) {
            lookaheadIdx++;
            continue;
          }
          if (
            isTotalsOrPaymentBoundaryLine(candidateLine) ||
            isNonItemSummaryOrMetaLine(candidateLine) ||
            extractDiscountAmount(candidateLine, preferredCurrency) > 0 ||
            qtyCalculationOnlyRegex.test(candidateLine) ||
            qtyCalculationWithTotalRegex.test(candidateLine)
          ) {
            break;
          }

          const nextPriceInfo = extractTrailingItemPrice(candidateLine, preferredCurrency);
          if (nextPriceInfo) {
            const rawName = `${bufferedPrefixText ? bufferedPrefixText + " " : ""}${nextPriceInfo.cleanPrefix}`
              .replace(/[.\-_=~*:\s]+$/, "")
              .trim();
            const name = formatReadableItemName(rawName);
            bufferedPrefixText = "";
            if (
              nextPriceInfo.price > 0 &&
              nextPriceInfo.price < 50000 &&
              name.length >= 2 &&
              /[а-яА-Яa-zA-Z]{2,}/.test(name) &&
              !isStrayFiscalOrAddressName(name)
            ) {
              upcomingCandidates.push({
                endIndex: lookaheadIdx,
                consumedExtraIndices: [],
                name,
                price: nextPriceInfo.price,
                err: getQtyPriceMatchError(expectedTotal, nextPriceInfo.price),
              });
            }
            lookaheadIdx++;
            continue;
          }

          // Handle 2-line wrapped product name below standalone qty line
          if (
            /[а-яА-Яa-zA-Z]{2,}/.test(candidateLine) &&
            !isReceiptHeaderLineForItems(candidateLine, preferredCurrency) &&
            lookaheadIdx + 1 < lines.length
          ) {
            const followingLine = lines[lookaheadIdx + 1];
            if (
              !isTotalsOrPaymentBoundaryLine(followingLine) &&
              !isNonItemSummaryOrMetaLine(followingLine) &&
              !extractPromoHeaderLabel(followingLine)
            ) {
              const followTrailing = extractTrailingItemPrice(followingLine, preferredCurrency);
              const followStandalone = followingLine.match(standalonePriceLineRegex);
              const followPrice = followTrailing
                ? followTrailing.price
                : followStandalone
                ? parsePrice(followStandalone[1])
                : null;
              const followPrefix = followTrailing ? followTrailing.cleanPrefix : "";
              if (followPrice && followPrice > 0 && followPrice < 50000) {
                const rawName = `${bufferedPrefixText ? bufferedPrefixText + " " : ""}${candidateLine}${followPrefix ? " " + followPrefix : ""}`
                  .replace(/[.\-_=~*:\s]+$/, "")
                  .trim();
                const name = formatReadableItemName(rawName);
                bufferedPrefixText = "";
                if (
                  name.length >= 2 &&
                  /[а-яА-Яa-zA-Z]{2,}/.test(name) &&
                  !isStrayFiscalOrAddressName(name)
                ) {
                  upcomingCandidates.push({
                    endIndex: lookaheadIdx + 1,
                    consumedExtraIndices: [lookaheadIdx],
                    name,
                    price: followPrice,
                    err: getQtyPriceMatchError(expectedTotal, followPrice),
                  });
                }
                lookaheadIdx += 2;
                continue;
              }
            }
          }
          break;
        }

        // Collect all upcoming candidates whose price matches expectedTotal so exact price matches beat proximity
        for (let uIdx = 0; uIdx < upcomingCandidates.length; uIdx++) {
          const uc = upcomingCandidates[uIdx];
          if (uc.err !== null && (uIdx === 0 || uc.err <= 0.01)) {
            matchedCandidates.push({
              kind: "next",
              err: uc.err,
              distance: uIdx + 1,
              endIndex: uc.endIndex,
              consumedExtraIndices: uc.consumedExtraIndices,
              nextName: uc.name,
              nextPrice: uc.price,
            });
          }
        }

        // Rank matched candidates: smallest price error ALWAYS beats physical proximity
        matchedCandidates.sort((a, b) => {
          const errDiff = a.err - b.err;
          if (Math.abs(errDiff) > 0.005) return errDiff;
          if (a.distance !== b.distance) return a.distance - b.distance;
          // Tie at equal distance & equal price error: check if immediate next item has its own trailing qty row
          if (a.kind !== b.kind) {
            const nextCand = a.kind === "next" ? a : b;
            const afterNextIdx = (nextCand.endIndex ?? i + 1) + 1;
            const afterNextMatch =
              afterNextIdx < lines.length ? lines[afterNextIdx].match(qtyCalculationOnlyRegex) : null;
            if (afterNextMatch && nextCand.nextPrice) {
              const afterQty = parseFloat(afterNextMatch[1].replace(",", "."));
              const afterUnit = parsePrice(afterNextMatch[2]);
              if (afterUnit && afterQty > 0 && getQtyPriceMatchError(afterQty * afterUnit, nextCand.nextPrice) !== null) {
                return a.kind === "prev" ? -1 : 1;
              }
            }
            return a.kind === "next" ? -1 : 1;
          }
          return 0;
        });

        const winner = matchedCandidates[0];
        if (winner && winner.kind === "next" && winner.endIndex !== undefined && winner.nextName && winner.nextPrice !== undefined) {
          const unitLabelMatch = isWeightOrVolume
            ? line.match(/^[*#•\s]*\(?(\d+(?:[.,]\d+)?\s*(?:кг|л|гр|мл|kg|l|g|ml))(?=$|[^а-яА-Яa-zA-Z])/i)
            : null;
          const unitLabel = unitLabelMatch ? unitLabelMatch[1].trim() : undefined;

          if (winner.distance === 1) {
            flushPendingName();
            let displayName = winner.nextName;
            if (unitLabel && !displayName.includes(unitLabel)) {
              displayName = `${displayName} (${unitLabel})`;
            }
            pushExtractedItem({
              name: displayName,
              price: winner.nextPrice,
              quantity: isDiscreteCount ? rawQty : 1,
            });
            consumedLineIndices.add(i);
            for (const extraIdx of winner.consumedExtraIndices || []) {
              consumedLineIndices.add(extraIdx);
            }
            consumedLineIndices.add(winner.endIndex);
            continue;
          } else {
            pendingLineQuantities.set(winner.endIndex, {
              qty: rawQty,
              isDiscreteCount,
              unitLabel,
            });
            consumedLineIndices.add(i);
            continue;
          }
        }

        if (winner && winner.kind === "prev" && winner.prevItemIndex !== undefined) {
          const targetPrev = items[winner.prevItemIndex];
          if (isDiscreteCount && targetPrev.quantity === 1) {
            targetPrev.quantity = rawQty;
          } else if (isWeightOrVolume) {
            const unitLabelMatch = line.match(
              /^[*#•\s]*\(?(\d+(?:[.,]\d+)?\s*(?:кг|л|гр|мл|kg|l|g|ml))(?=$|[^а-яА-Яa-zA-Z])/i
            );
            if (unitLabelMatch && !targetPrev.name.includes(unitLabelMatch[1].trim())) {
              targetPrev.name = `${targetPrev.name} (${unitLabelMatch[1].trim()})`;
            }
          }
          consumedLineIndices.add(i);
          continue;
        }

        // Price consistency did not match either nearby product -> ignore stray calc line without misassigning quantity
        consumedLineIndices.add(i);
        continue;
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
        pushExtractedItem({
          name,
          price,
          quantity: quantity >= 1 && quantity <= 999 ? quantity : 1,
        }, i);
        consumedLineIndices.add(i);
        continue;
      }
    }

    // 4. Standard single-line (or multi-line wrapped + trailing price on final line)
    // Also handles qty calculation lines ending in dual currency or unit rate when buffered name exists
    const priceInfo = extractTrailingItemPrice(line, preferredCurrency);
    const hasLetters = /[а-яА-Яa-zA-Z]{2,}/.test(line);
    const pureQtyCalcRegex = new RegExp(
      `^[*#•\\s]*\\(?\\s*(\\d+(?:[.,]\\d+)?)\\s*(бр\\.?|кг\\.?|гр\\.?|г\\.?|л\\.?|мл\\.?|шт\\.?|оп\\.?|kg|g|l|ml|pcs)?\\s*[xхХX*×@]\\s*\\d+[.,]\\d{2,3}${unitRateSuffix}\\s*\\)?\\s*=*\\s*$`,
      "i"
    );
    const standaloneQtyCalcPrefixMatch =
      priceInfo && priceInfo.cleanPrefix.match(pureQtyCalcRegex);

    if (priceInfo && (hasLetters || pendingNameBuffer.length > 0 || Boolean(standaloneQtyCalcPrefixMatch))) {
      const parseItemFromChunk = (
        rawChunkName: string,
        linePrice: number,
        includePendingBuffer: boolean
      ): { name: string; price: number; quantity: number } | null => {
        let rawName = rawChunkName.replace(/\s*=\s*$/, "").trim();
        let quantity = 1;
        const isWeightUnit = (unit?: string) =>
          Boolean(unit && /^(?:кг|гр|г|л|мл|kg|g|l|ml)\.?$/i.test(unit.trim()));

        const pureQtyCalcMatch = rawName.match(pureQtyCalcRegex);
        if (pureQtyCalcMatch && includePendingBuffer && pendingNameBuffer.length > 0) {
          const qVal = parseFloat(pureQtyCalcMatch[1].replace(",", "."));
          if (
            !isWeightUnit(pureQtyCalcMatch[2]) &&
            Number.isInteger(qVal) &&
            qVal >= 1 &&
            qVal <= 999
          ) {
            quantity = qVal;
          }
          rawName = flushPendingName();
        } else {
          // 4a. Inline trailing "qty x unitPrice [=]": e.g. "Coca Cola 2 x 2.40", "САЛАМИ (2 x 1.20)", "Вода 2 бр. x 1.20 €/бр"
          const inlineQtyUnitRegex = new RegExp(
            `^(.+?)\\s+\\(?\\s*(\\d+(?:[.,]\\d+)?)\\s*(бр\\.?|кг\\.?|гр\\.?|г\\.?|л\\.?|мл\\.?|шт\\.?|оп\\.?|kg|g|l|ml|pcs)?\\s*[xхХX*×@]\\s*\\d+[.,]\\d{2,3}${unitRateSuffix}\\s*\\)?\\s*=*\\s*$`,
            "i"
          );
          const inlineQtyUnitMatch = rawName.match(inlineQtyUnitRegex);
          if (inlineQtyUnitMatch) {
            rawName = inlineQtyUnitMatch[1].trim();
            const qVal = parseFloat(inlineQtyUnitMatch[2].replace(",", "."));
            if (
              !isWeightUnit(inlineQtyUnitMatch[3]) &&
              Number.isInteger(qVal) &&
              qVal >= 1 &&
              qVal <= 999
            ) {
              quantity = qVal;
            }
          } else {
            // 4b. Space-separated tabular "qty/weight  unitPrice" verified mathematically:
            //     "ВОДА ДЕВИН  2  0.75" before 1.50 OR "ДОМАТИ  0.840 кг  4.99" before 4.19
            const spaceQtyUnitMatch = rawName.match(
              /^(.+?)\s+(\d{1,3}(?:[.,]\d{1,3})?)\s*(бр\.?|кг\.?|kg)?\s+(\d{1,4}[.,]\d{2,3})$/i
            );
            if (spaceQtyUnitMatch) {
              const qRaw = parseFloat(spaceQtyUnitMatch[2].replace(",", "."));
              const unitStr = (spaceQtyUnitMatch[3] || "").toLowerCase();
              const uVal = parsePrice(spaceQtyUnitMatch[4]);
              if (qRaw > 0 && uVal && Math.abs(qRaw * uVal - linePrice) <= Math.max(0.02, linePrice * 0.015)) {
                const isWeight = unitStr.includes("кг") || unitStr.includes("kg") || !Number.isInteger(qRaw);
                if (!isWeight && Number.isInteger(qRaw) && qRaw >= 1 && qRaw <= 999) {
                  quantity = qRaw;
                  rawName = spaceQtyUnitMatch[1].trim();
                } else if (isWeight) {
                  rawName = `${spaceQtyUnitMatch[1].trim()} (${spaceQtyUnitMatch[2]} кг)`;
                }
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
            pushExtractedItem(item1);
            pushExtractedItem(item2);
            consumedLineIndices.add(i);
            continue;
          }
        }
      }

      const parsedItem = parseItemFromChunk(priceInfo.cleanPrefix, priceInfo.price, true);
      if (parsedItem) {
        pushExtractedItem(parsedItem, i);
        consumedLineIndices.add(i);
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

  return { items, discountTotal, unattachedDiscountTotal };
}

/**
 * Validates extracted Items Total against Receipt Total.
 * Triggers "Possible missing receipt items." whenever discrepancy is too large (>5%)
 * or detected item count is lower than receipt's printed item count with a balance difference.
 */
export function validateReceiptTotals(
  items: Array<{ name: string; price: number; finalPrice?: number; quantity?: number }>,
  receiptTotal: number,
  expectedItemsCount?: number,
  unattachedDiscountTotal: number = 0,
  currency: string = "€"
): {
  itemsTotal: number;
  receiptTotal: number;
  difference: number;
  differencePercent: number;
  isMismatch: boolean;
  warningMessage?: string;
} {
  const itemsTotal = parseFloat(
    items.reduce((sum, it) => sum + (Number(it.finalPrice ?? it.price) || 0), 0).toFixed(2)
  );
  const cleanReceiptTotal =
    receiptTotal > 0 ? parseFloat(receiptTotal.toFixed(2)) : itemsTotal;

  const rawDifference = parseFloat(
    Math.abs(cleanReceiptTotal - itemsTotal).toFixed(2)
  );
  const netAfterDiscount = parseFloat(
    Math.max(0, itemsTotal - (unattachedDiscountTotal || 0)).toFixed(2)
  );
  const netDifference = parseFloat(
    Math.abs(cleanReceiptTotal - netAfterDiscount).toFixed(2)
  );
  const effectiveDifference =
    unattachedDiscountTotal > 0 ? Math.min(rawDifference, netDifference) : rawDifference;

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

  const fmtVal = (n: number) => `${currency === "лв." || currency === "BGN" ? "€" : currency || "€"}${n.toFixed(2)}`;

  let warningMessage: string | undefined;
  if (isMismatch) {
    warningMessage =
      expectedItemsCount && hasCountMismatch
        ? `Possible missing receipt items. (Разпознати ${items.length} от ${expectedItemsCount} артикула; разлика ${fmtVal(effectiveDifference)} / ${differencePercent.toFixed(1)}%)`
        : `Possible missing receipt items. (Сумата на артикулите ${fmtVal(itemsTotal)} се различава с ${differencePercent.toFixed(1)}% от общата сума ${fmtVal(cleanReceiptTotal)})`;
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
 * Formats extracted receipt items into clean multi-line notes preserving quantity and discounts:
 * Example:
 * 2 x Coca Cola - €4.80
 * 1 x Снакс с фъстъци - €2.04 (ориг. €3.06, -€1.02 Lidl Plus)
 */
export function formatReceiptNotes(
  items: Array<{
    name: string;
    price: number;
    quantity?: number;
    originalPrice?: number;
    discount?: number;
    finalPrice?: number;
    discountLabel?: string;
  }>,
  currency: string = "€"
): string {
  if (!items || items.length === 0) return "";

  const sym = currency === "лв." || currency === "BGN" ? "€" : currency || "€";
  const fmt = (val: number) => `${sym}${val.toFixed(2)}`;

  return items
    .map((it) => {
      const qty = it.quantity && it.quantity >= 1 ? it.quantity : 1;
      const netPrice = it.finalPrice ?? it.price;
      const base = `${qty} x ${it.name} - ${fmt(netPrice)}`;
      if (it.discount && it.discount > 0 && it.originalPrice !== undefined) {
        const label = it.discountLabel ? ` ${it.discountLabel}` : "";
        return `${base} (ориг. ${fmt(it.originalPrice)}, -${fmt(it.discount)}${label})`;
      }
      return base;
    })
    .join("\n");
}

/**
 * Known Bulgarian cities/towns for pairing standalone city lines (e.g. "Пловдив")
 * with adjacent street lines (e.g. "ул. Перущица 8") and validating city-only candidates.
 */
const KNOWN_BG_CITIES = new Set<string>([
  "софия", "sofia",
  "пловдив", "plovdiv",
  "варна", "varna",
  "бургас", "burgas", "bourgas",
  "русе", "ruse", "rousse",
  "стара загора", "stara zagora",
  "плевен", "pleven",
  "сливен", "sliven",
  "добрич", "dobrich",
  "шумен", "shumen",
  "перник", "pernik",
  "хасково", "haskovo",
  "ямбол", "yambol",
  "пазарджик", "pazardzhik",
  "благоевград", "blagoevgrad",
  "велико търново", "veliko tarnovo",
  "враца", "vratsa",
  "габрово", "gabrovo",
  "асеновград", "asenovgrad",
  "видин", "vidin",
  "казанлък", "kazanlak",
  "кюстендил", "kyustendil",
  "кърджали", "kardzhali",
  "монтана", "montana",
  "димитровград", "dimitrovgrad",
  "търговище", "targovishte",
  "ловеч", "lovech",
  "силистра", "silistra",
  "дупница", "dupnitsa",
  "свищов", "svishtov",
  "разград", "razgrad",
  "горна оряховица", "gorna oryahovitsa",
  "петрич", "petrich",
  "смолян", "smolyan",
  "сандански", "sandanski",
  "самоков", "samokov",
  "севлиево", "sevlievo",
  "лом", "lom",
  "карлово", "karlovo",
  "велинград", "velingrad",
  "нова загора", "nova zagora",
  "троян", "troyan",
  "айтос", "aytos",
  "ботевград", "botevgrad",
  "гоце делчев", "gotse delchev",
  "пещера", "peshtera",
  "харманли", "harmanli",
  "карнобат", "karnobat",
  "свиленград", "svilengrad",
  "панагюрище", "panagyurishte",
  "чирпан", "chirpan",
  "попово", "popovo",
  "раковски", "rakovski",
  "първомай", "parvomay",
  "несебър", "nesebar", "nessebar",
  "поморие", "pomorie",
  "созопол", "sozopol",
  "банско", "bansko",
  "козлодуй", "kozloduy",
  "радомир", "radomir",
  "балчик", "balchik",
  "каварна", "kavarna",
  "бяла слатина", "byala slatina",
  "червен бряг", "cherven bryag",
  "ихтиман", "ihtiman",
  "стамболийски", "stamboliyski",
  "костенец", "kostenets",
  "своге", "svoge",
  "елин пелин", "elin pelin",
  "костинброд", "kostinbrod",
  "божурище", "bozhurishte",
  "равно поле", "ravno pole",
  "слънчев бряг", "sunny beach",
  "златни пясъци", "golden sands",
]);

const ADDRESS_PREFIX_LOWER_MAP: Record<string, string> = {
  "гр.": "гр.",
  "гр": "гр.",
  "с.": "с.",
  "ул.": "ул.",
  "ул": "ул.",
  "бул.": "бул.",
  "бул": "бул.",
  "ж.к.": "ж.к.",
  "ж.к": "ж.к.",
  "жк.": "ж.к.",
  "жк": "ж.к.",
  "кв.": "кв.",
  "кв": "кв.",
  "пл.": "пл.",
  "пл": "пл.",
  "бл.": "бл.",
  "бл": "бл.",
  "вх.": "вх.",
  "вх": "вх.",
  "ет.": "ет.",
  "ет": "ет.",
  "ап.": "ап.",
  "ап": "ап.",
  "обл.": "обл.",
  "обл": "обл.",
  "общ.": "общ.",
  "общ": "общ.",
  "п.к.": "п.к.",
  "п.к": "п.к.",
  "шосе": "шосе",
  "местност": "местност",
};

const ADDRESS_LOWER_PREPOSITIONS = new Set([
  "и", "в", "на", "от", "до", "за", "по", "с", "при", "над", "под", "край",
]);

function normalizeAddressOcrPrefixes(raw: string): string {
  const repaired = repairCyrillicWordTokens(raw, /[а-яА-Я]/.test(raw));
  return (
    repaired
      .replace(/[#*_~|]+/g, " ")
      .replace(/\s+/g, " ")
      // Fix common Tesseract OCR mistakes in Bulgarian address prefixes (avoid digits before гр.)
      .replace(
        /(^|[\s,;:(])(?<!\d\s*)(?<!\d)[гr][рp](?:\s*\.\s*|\s+)(?=[А-Яа-яA-Za-z]{3,})/gi,
        "$1гр. "
      )
      .replace(
        /(^|[\s,;:(])[уy]л(?:\s*\.\s*|\s+)(?=[А-Яа-яA-Za-z0-9])/gi,
        "$1ул. "
      )
      .replace(
        /(^|[\s,;:(])[б6][уy]л(?:\s*\.\s*|\s+)(?=[А-Яа-яA-Za-z0-9])/gi,
        "$1бул. "
      )
      .replace(
        /(^|[\s,;:(])ж\s*[.,]?\s*к(?:\s*\.\s*|\s+)(?=[А-Яа-яA-Za-z0-9])/gi,
        "$1ж.к. "
      )
      .replace(/(^|[\s,;:(])кв\s*\.\s*(?=[А-Яа-яA-Za-z0-9])/gi, "$1кв. ")
      .replace(/(^|[\s,;:(])пл\s*\.\s*(?=[А-Яа-яA-Za-z0-9])/gi, "$1пл. ")
      .replace(/(^|[\s,;:(])бл\s*\.\s*(?=\d)/gi, "$1бл. ")
      .replace(/(^|[\s,;:(])с\s*\.\s*(?=[А-Яа-я]{3,})/gi, "$1с. ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function formatAddressCasing(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";

  const tokens = trimmed.split(" ");
  const contentLetters: string[] = [];
  const contentUpperLetters: string[] = [];
  for (const tok of tokens) {
    const match = tok.match(/^([^а-яА-Яa-zA-Z0-9]*)(.*?)([^а-яА-Яa-zA-Z0-9]*)$/);
    const core = match ? match[2] : tok;
    const tail = match ? match[3] : "";
    const coreLower = core.toLowerCase();
    const lookupKey =
      tail.startsWith(".") && ADDRESS_PREFIX_LOWER_MAP[`${coreLower}.`]
        ? `${coreLower}.`
        : coreLower;
    if (core && ADDRESS_PREFIX_LOWER_MAP[lookupKey]) continue;
    const letters = tok.match(/[а-яА-Яa-zA-Z]/g);
    const upper = tok.match(/[А-ЯA-Z]/g);
    if (letters) contentLetters.push(...letters);
    if (upper) contentUpperLetters.push(...upper);
  }
  const isMostlyUpper =
    contentLetters.length > 0 &&
    contentUpperLetters.length / contentLetters.length >= 0.72;
  return tokens
    .map((tok, idx) => {
      const match = tok.match(/^([^а-яА-Яa-zA-Z0-9]*)(.*?)([^а-яА-Яa-zA-Z0-9]*)$/);
      if (!match) return tok;
      const [, lead, core, tail] = match;
      if (!core) return tok;
      const coreLower = core.toLowerCase();
      const lookupKey =
        tail.startsWith(".") && ADDRESS_PREFIX_LOWER_MAP[`${coreLower}.`]
          ? `${coreLower}.`
          : coreLower;

      const mappedPrefix = ADDRESS_PREFIX_LOWER_MAP[lookupKey];
      if (mappedPrefix) {
        const adjustedTail = mappedPrefix.endsWith(".")
          ? tail.replace(/^\.+/, "")
          : tail;
        return `${lead}${mappedPrefix}${adjustedTail}`;
      }

      if (!isMostlyUpper) {
        return tok;
      }

      // Preserve ordinal hyphenated tokens like "3-ТИ" -> "3-ти" or "1-ВИ" -> "1-ви"
      if (/^\d+-[А-Я]+$/i.test(core)) {
        return `${lead}${coreLower}${tail}`;
      }

      if (idx > 0 && ADDRESS_LOWER_PREPOSITIONS.has(coreLower)) {
        return `${lead}${coreLower}${tail}`;
      }

      // Capitalize hyphenated parts cleanly (e.g. "СВЕТИ-ВЛАС" -> "Свети-Влас")
      const formattedCore = core
        .split("-")
        .map((part) =>
          part.length > 0
            ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            : part
        )
        .join("-");

      return `${lead}${formattedCore}${tail}`;
    })
    .join(" ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripAddressLineWrapper(line: string): {
  cleaned: string;
  hasExplicitAddressLabel: boolean;
  hasBranchContext: boolean;
  hasHqContext: boolean;
  hasTaxIdContext: boolean;
  branchCityHint?: string;
} {
  let working = normalizeAddressOcrPrefixes(line);
  const cyr = toCyrillicMatchForm(working);
  const lat = toLatinMatchForm(working);

  const isLegalAddressLabel =
    /(?:ЮРИДИЧЕСКИ|НА\s+УПРАВЛЕНИЕ|ДАНЪЧЕН|ПО\s+РЕГИСТРАЦИЯ|СЕДАЛИЩЕ(?:\s+И\s+АДРЕС)?|HEADQUARTERS|REGISTERED\s+OFFICE)\s*(?:АДРЕС)?/i.test(
      cyr
    ) ||
    /(?:HEADQUARTERS|REGISTERED\s+OFFICE|LEGAL\s+ADDRESS)/i.test(lat);

  const hasExplicitAddressLabel =
    !isLegalAddressLabel &&
    (/(?:^|\s)(?:АДРЕС(?:\s+НА\s+(?:ОБЕКТ(?:А)?|МАГАЗИН(?:А)?|ТЪРГОВСКИ(?:Я)?\s+ОБЕКТ))?|ADDRESS|ADDR\.?)\s*[:\-–]?/i.test(
      working
    ) ||
      /(?:^|\s)АДРЕС(?:\s+НА\s+(?:ОБЕКТ(?:А)?|МАГАЗИН(?:А)?|ТЪРГОВСКИ(?:Я)?\s+ОБЕКТ))?\s*[:\-–]?/.test(
        cyr
      ));

  const hasLegalEntityForm =
    /(?:^|[^А-ЯA-Z])(?:ЕООД|ООД|ЕАД|АД|КД|СД|И\s+КО(?:\s+КД)?|ЕНД\s+КО(?:\s+КД)?|EOOD|OOD|EAD|AD|KD|LTD|LLC|GMBH)(?:$|[^А-ЯA-Z])/i.test(
      cyr
    ) ||
    /(?:^|[^A-Z])(?:EOOD|OOD|EAD|KD|LTD|LLC|GMBH|& CO)(?:$|[^A-Z])/i.test(lat);

  const hasTaxIdContext =
    /(?:ЕИК|EIK|БУЛСТАТ|BULSTAT|ИН\s*ПО\s*ДДС|ЗДДС|ДДС\s*(?:№|N)|VAT\s*(?:№|NO)|BG\s*\d{8,11})/i.test(
      cyr
    ) ||
    /(?:EIK|BULSTAT|VAT|BG\s*\d{8,11})/i.test(lat);

  const hasHqContext =
    isLegalAddressLabel ||
    hasLegalEntityForm ||
    hasTaxIdContext ||
    /(?:СЕДАЛИЩЕ|АДРЕС\s+НА\s+УПРАВЛЕНИЕ|ЮРИДИЧЕСКИ\s+АДРЕС|ДАНЪЧЕН\s+АДРЕС|ЦЕНТРАЛЕН\s+ОФИС|ЦЕНТРАЛА|УПРАВИТЕЛ|СЪДЕБНА\s+РЕГИСТРАЦИЯ)/i.test(
      cyr
    );

  // Detect store/branch identifier lines (e.g. "ТЪРГОВСКИ ОБЕКТ", "ОБ. 155", "LIDL ПЛОВДИВ 155", "LIDL PLOVDIV 155")
  const hasExplicitBranchKeyword =
    /(?:^|\s)(?:ТЪРГОВСКИ\s+ОБЕКТ|ТЪРГ\.?\s*ОБЕКТ|Т\.?\s*О\.?\s*(?:№|N|#|:)?\s*\d+|ОБЕКТ\s*(?:№|N|#|:)?\s*\d+|ОБ\.?\s*(?:№|N|#)?\s*\d+|МАГАЗИН\s*(?:№|N|#|:)?\s*\d*|ФИЛИАЛ(?:\s*(?:№|N|#|:)?\s*\d+)?|КЛОН(?:\s*(?:№|N|#|:)?\s*\d+)?|СУПЕРМАРКЕТ|ХИПЕРМАРКЕТ|БЕНЗИНОСТАНЦИЯ|АПТЕКА|РЕСТОРАНТ|МЯСТО\s+НА\s+(?:ИЗВЪРШВАНЕ|ТЪРГОВИЯ|ДЕЙНОСТ)|АДРЕС\s+НА\s+(?:ОБЕКТ(?:А)?|МАГАЗИН(?:А)?)|BRANCH\s*(?:#|NO|№)?\s*\d+|STORE\s*(?:#|NO|№)?\s*\d+)/i.test(
      cyr
    );

  const hasStoreBrandToken =
    /(?:LIDL|ЛИДЛ|KAUFLAND|КАУФЛАНД|BILLA|БИЛЛА|FANTASTICO|ФАНТАСТИКО|METRO|МЕТРО|T[\s-]*MARKET|Т[\s-]*МАРКЕТ|CBA|ЦБА|LILLY|ЛИЛИ|SOPHARMA|СОФАРМАСИ|OMV|SHELL|ШЕЛ|LUKOIL|ЛУКОЙЛ|EKO|ЕКО|HAPPY|ХЕПИ)/i.test(
      working
    ) ||
    /(?:LIDL|KAUFLAND|BILLA|FANTASTICO|METRO|T[\s-]*MARKET)/i.test(lat);

  let matchedBranchCity: string | undefined;
  const wordsAndPairs = working
    .replace(/[,:;()№#]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const toCityTitleCase = (rawCity: string) =>
    rawCity
      .split(/\s+/)
      .map((part) =>
        part
          .split("-")
          .map((seg) => (seg ? seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase() : seg))
          .join("-")
      )
      .join(" ");

  for (let w = 0; w < wordsAndPairs.length; w++) {
    const one = wordsAndPairs[w].toLowerCase();
    if (KNOWN_BG_CITIES.has(one)) {
      matchedBranchCity = toCityTitleCase(one);
      break;
    }
    if (w + 1 < wordsAndPairs.length) {
      const two = `${one} ${wordsAndPairs[w + 1].toLowerCase()}`;
      if (KNOWN_BG_CITIES.has(two)) {
        matchedBranchCity = toCityTitleCase(two);
        break;
      }
    }
  }

  const hasBranchCodeNumber = /\b\d{1,4}\b/.test(working);
  const isStoreBrandWithBranch =
    hasStoreBrandToken &&
    !hasHqContext &&
    (hasBranchCodeNumber || Boolean(matchedBranchCity));

  const hasBranchContext =
    !isLegalAddressLabel &&
    (hasExplicitBranchKeyword || isStoreBrandWithBranch || hasExplicitAddressLabel);

  // Strip leading object/store/address label prefixes
  working = working
    .replace(
      /^(?:ЮРИДИЧЕСКИ\s+АДРЕС|АДРЕС\s+НА\s+УПРАВЛЕНИЕ|ДАНЪЧЕН\s+АДРЕС|СЕДАЛИЩЕ(?:\s+И\s+АДРЕС)?|АДРЕС(?:\s+НА\s+(?:ОБЕКТ(?:А)?|МАГАЗИН(?:А)?|ТЪРГОВСКИ(?:Я)?\s+ОБЕКТ))?|ADDRESS|ADDR\.?)\s*[:\-–]?\s*/i,
      ""
    )
    .replace(
      /^(?:ТЪРГОВСКИ\s+ОБЕКТ|ТЪРГ\.?\s*ОБЕКТ|ОБЕКТ\s*(?:№|N|#|:)?\s*\d*|ОБ\.?\s*(?:№|N|#)?\s*\d+|МАГАЗИН\s*(?:№|N|#|:)?\s*\d*|ФИЛИАЛ\s*(?:№|N|#)?\s*\d*|КЛОН\s*(?:№|N|#)?\s*\d*|БЕНЗИНОСТАНЦИЯ\s*(?:№|N|#)?\s*\d*)\s*[:\-–,]?\s*/i,
      ""
    )
    .replace(
      /\s+(?:ТЕЛ\.?|PHONE|TEL|FAX|ФАКС|ЕИК|EIK|БУЛСТАТ|BULSTAT|ДДС|ЗДДС|ИН\s+ПО\s+ДДС|BG\s*\d{8,11}|ФУ|ФП|УНП|КАСА|ДАТА|DATE|WWW\.|HTTP).*$/i,
      ""
    )
    .replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, "")
    .trim();

  return {
    cleaned: working,
    hasExplicitAddressLabel,
    hasBranchContext,
    hasHqContext,
    hasTaxIdContext,
    branchCityHint: hasBranchContext ? matchedBranchCity : undefined,
  };
}

function isDisqualifiedAddressLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return true;
  if (extractTrailingItemPrice(trimmed)) return true;

  const cyr = toCyrillicMatchForm(trimmed);
  const lat = toLatinMatchForm(trimmed);

  // Reject product weights like "400 гр." / "500 г"
  if (/\d+(?:[.,]\d+)?\s*(?:гр|г|кг|мл|л)\.?(?:\s|$)/i.test(trimmed)) {
    return true;
  }

  const rejectRes: RegExp[] = [
    /\bBG\s*\d{8,11}\b/i,
    /^(?:ЕИК|EIK|БУЛСТАТ|BULSTAT|ИН\s*ПО\s*ДДС|ДДС\s*№|ДДС\s*N|VAT\s*№|VAT\s*NO|ФУ|ФП|ЗД|ДТ|УНП|НРА)\b/i,
    /(?:ФИСКАЛЕН\s*БОН|СИСТЕМЕН\s*БОН|СЛУЖЕБЕН\s*БОН|КАСОВА\s*БЕЛЕЖКА|КАСОВ\s*БОН|ФАКТУРА|ОРИГИНАЛ|ДУБЛИКАТ)/,
    /^(?:WELCOME|THANK\s*YOU|ДОБРЕ\s*ДОШЛИ|БЛАГОДАРИМ|МЕРСИ|ПРИЯТЕН\s*ДЕН)/i,
    /(?:КАСА\s*№?|КАСИЕР|ОПЕРАТОР|БОН\s*№|ЧЕК\s*№|ПОС\s*ТЕРМИНАЛ|ТЕРМИНАЛ\s*№)/,
    /^(?:TEL|PHONE|ТЕЛ|ФАКС|FAX|EMAIL|E-MAIL|WWW\.|HTTP|HTTPS|ДАТА|DATE|ЧАС|TIME)\b/i,
    /^\d{1,2}[./-]\d{1,2}[./-](?:20\d{2}|\d{2})(?:\s|$)/,
    /^\d+[\s\-/.:№#]*$/,
    /[€$£]|(?:^|\s)(?:лв\.?|BGN|EUR)(?:\s|$)/i,
  ];

  return (
    rejectRes.some((re) => re.test(trimmed)) ||
    rejectRes.some((re) => re.test(cyr)) ||
    rejectRes.some((re) => re.test(lat))
  );
}

const STREET_INDICATOR_RE =
  /(?:^|[\s,;:(])(?:ул\.|бул\.|ж\.к\.|кв\.|пл\.|местност|шосе|улица|булевард|квартал|площад|ул\s+|бул\s+|str\.?|st\.?|blvd\.?|boulevard|street|ave\.?|avenue|rd\.?|road|zh\.k\.?|ul\.?|bul\.?|ulitsa|bulevard|shose|shosse|chaussee)(?:\s|$)/i;

function hasStreetIndicator(line: string): boolean {
  if (STREET_INDICATOR_RE.test(line)) return true;
  if (/\b(?:бл\.|блок)\s*\d+/i.test(line)) return true;
  if (
    /\b\d{1,5}[a-zA-Z]?\s+[A-Za-z][A-Za-z\s.'-]{2,}\s+(?:St\.?|Str\.?|Street|Blvd\.?|Boulevard|Ave\.?|Avenue|Rd\.?|Road|Sq\.?|Lane|Dr\.?)\b/i.test(
      line
    )
  ) {
    return true;
  }
  return false;
}

interface ParsedCityLine {
  city: string;
  isVillage: boolean;
  hasExplicitPrefix: boolean;
}

function parseStandaloneCityLine(line: string): ParsedCityLine | null {
  if (!line || hasStreetIndicator(line)) return null;
  const cleaned = line
    .replace(/^(?:България|Bulgaria)\s*,?\s*/i, "")
    .replace(/,?\s*(?:България|Bulgaria)$/i, "")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
  if (!cleaned || /\d{5,}/.test(cleaned)) return null;

  // Match explicit "гр. <City>" or "с. <Village>" (optional 4-digit postal code)
  const explicitMatch = cleaned.match(
    /^(?:\d{4}\s+)?(гр\.|с\.)\s+([А-Яа-яA-Za-z][А-Яа-яA-Za-z\-]{2,}(?:\s+[А-Яа-яA-Za-z][А-Яа-яA-Za-z\-]{2,})?)(?:\s+\d{4})?$/i
  );
  if (explicitMatch) {
    const prefix = explicitMatch[1].toLowerCase();
    const rawName = explicitMatch[2].trim();
    const formattedName = formatAddressCasing(rawName);
    const isVillage = prefix === "с.";
    // Guard against random 2-letter noise or fiscal words after гр.
    const wordLower = formattedName.toLowerCase();
    if (
      /^(?:бон|ддс|еик|сума|общо|каса|тест|брой|бр)$/i.test(wordLower) ||
      formattedName.length < 3
    ) {
      return null;
    }
    return {
      city: isVillage ? `с. ${formattedName}` : formattedName,
      isVillage,
      hasExplicitPrefix: true,
    };
  }

  // Match standalone known Bulgarian city (optionally with 4-digit postcode)
  const strippedPost = cleaned.replace(/^\d{4}\s+|\s+\d{4}$/g, "").trim();
  const formattedKnown = formatAddressCasing(strippedPost);
  if (KNOWN_BG_CITIES.has(formattedKnown.toLowerCase())) {
    return {
      city: formattedKnown,
      isVillage: false,
      hasExplicitPrefix: false,
    };
  }

  return null;
}

function splitSingleLineAddress(line: string): {
  street?: string;
  city?: ParsedCityLine;
} | null {
  // Pattern 1: "гр. Пловдив, бул. България 123" or "гр. Пловдив бул. България 123"
  const cityFirstMatch = line.match(
    /^(?:\d{4}\s+)?(гр\.|с\.)\s+([А-Яа-яA-Za-z][А-Яа-яA-Za-z\-]{1,}(?:\s+[А-Яа-яA-Za-z][А-Яа-яA-Za-z\-]{1,})?)\s*[,;]?\s+((?:ул\.|бул\.|ж\.к\.|кв\.|пл\.|местност|шосе|str\.?|st\.?|blvd\.?|ave\.?).+)$/i
  );
  if (cityFirstMatch) {
    const prefix = cityFirstMatch[1].toLowerCase();
    const rawCity = formatAddressCasing(cityFirstMatch[2]);
    const street = formatAddressCasing(cityFirstMatch[3]);
    const isVillage = prefix === "с.";
    return {
      street,
      city: {
        city: isVillage ? `с. ${rawCity}` : rawCity,
        isVillage,
        hasExplicitPrefix: true,
      },
    };
  }

  // Pattern 2: "<street>, <city>" or "<city>, <street>" (comma-separated, checking lastComma then firstComma)
  const lastComma = line.lastIndexOf(",");
  if (lastComma > 3) {
    const left = line.slice(0, lastComma).trim();
    const right = line.slice(lastComma + 1).trim();
    const parsedRightCity = parseStandaloneCityLine(right);
    if (parsedRightCity && left.length >= 3) {
      return {
        street: formatAddressCasing(left),
        city: parsedRightCity,
      };
    }
    const parsedLeftCity = parseStandaloneCityLine(left);
    if (parsedLeftCity && hasStreetIndicator(right)) {
      return {
        street: formatAddressCasing(right),
        city: parsedLeftCity,
      };
    }
  }

  const firstComma = line.indexOf(",");
  if (firstComma > 2 && firstComma !== lastComma) {
    const left = line.slice(0, firstComma).trim();
    const right = line.slice(firstComma + 1).trim();
    const parsedLeftCity = parseStandaloneCityLine(left);
    if (parsedLeftCity && hasStreetIndicator(right)) {
      return {
        street: formatAddressCasing(right),
        city: parsedLeftCity,
      };
    }
  }

  // Pattern 3: "<street> гр. <City>" (no comma)
  const trailingExplicitCity = line.match(
    /^(.{4,}?)\s+(гр\.|с\.)\s+([А-Яа-яA-Za-z][А-Яа-яA-Za-z\-]{2,}(?:\s+[А-Яа-яA-Za-z][А-Яа-яA-Za-z\-]{2,})?)(?:\s+\d{4})?$/i
  );
  if (trailingExplicitCity && hasStreetIndicator(trailingExplicitCity[1])) {
    const prefix = trailingExplicitCity[2].toLowerCase();
    const rawCity = formatAddressCasing(trailingExplicitCity[3]);
    const isVillage = prefix === "с.";
    return {
      street: formatAddressCasing(trailingExplicitCity[1]),
      city: {
        city: isVillage ? `с. ${rawCity}` : rawCity,
        isVillage,
        hasExplicitPrefix: true,
      },
    };
  }

  return null;
}

/**
 * Extracts a reliable store/branch address from receipt header lines.
 * Combines split city + street lines (e.g. "гр. Пловдив" + "бул. България 123" -> "бул. България 123, Пловдив"),
 * prioritizes actual store/branch location over company HQ/legal entity/VAT registration addresses,
 * and avoids false positives on product weights ("400 гр.") or fiscal IDs.
 */
export function extractReceiptAddress(
  lines: string[],
  preferredCurrency: string = "€"
): { address?: string; matchedRule?: string } {
  if (!lines || lines.length === 0) return {};

  // Determine header boundary before items/totals start
  let headerEnd = Math.min(lines.length, 32);
  for (let i = 2; i < Math.min(lines.length, 32); i++) {
    const line = lines[i];
    if (extractTrailingItemPrice(line, preferredCurrency)) {
      headerEnd = i;
      break;
    }
    const cyr = toCyrillicMatchForm(line);
    if (
      /^(?:ОБЩО|ОБЩА\s+СУМА|ЗА\s+ПЛАЩАНЕ|МЕЖДИННА\s+СУМА|В\s+БРОЙ|TOTAL|SUBTOTAL)\b/.test(
        cyr
      )
    ) {
      headerEnd = i;
      break;
    }
  }

  interface LineInfo {
    index: number;
    cleaned: string;
    hasExplicitAddressLabel: boolean;
    hasBranchContext: boolean;
    hasHqContext: boolean;
    hasTaxIdContext: boolean;
    branchCityHint?: string;
    disqualified: boolean;
    cityOnly: ParsedCityLine | null;
    isStreet: boolean;
    singleLineSplit: { street?: string; city?: ParsedCityLine } | null;
  }

  const parsedHeader: LineInfo[] = [];
  for (let i = 0; i < headerEnd; i++) {
    const raw = lines[i];
    const {
      cleaned,
      hasExplicitAddressLabel,
      hasBranchContext,
      hasHqContext,
      hasTaxIdContext,
      branchCityHint,
    } = stripAddressLineWrapper(raw);
    const disqualified = !cleaned || isDisqualifiedAddressLine(cleaned);
    const singleLineSplit = !disqualified ? splitSingleLineAddress(cleaned) : null;
    const cityOnly =
      !disqualified && !singleLineSplit ? parseStandaloneCityLine(cleaned) : null;
    const isStreet =
      !disqualified &&
      !cityOnly &&
      (hasStreetIndicator(cleaned) ||
        (hasExplicitAddressLabel && /[а-яА-Яa-zA-Z]{3,}/.test(cleaned)));

    parsedHeader.push({
      index: i,
      cleaned,
      hasExplicitAddressLabel,
      hasBranchContext,
      hasHqContext,
      hasTaxIdContext,
      branchCityHint,
      disqualified,
      cityOnly,
      isStreet,
      singleLineSplit,
    });
  }

  // Locate tax registration line (ЕИК / БУЛСТАТ / ИН по ДДС / BG...) to distinguish HQ section above vs Store section below
  const firstTaxIdIdx = parsedHeader.findIndex((p) => p.hasTaxIdContext);

  interface AddressCandidate {
    address: string;
    score: number;
    rule: string;
  }

  const candidates: AddressCandidate[] = [];
  const usedCityIndices = new Set<number>();

  const hasNearbyBranchContext = (idx: number): boolean => {
    for (let j = idx; j >= Math.max(0, idx - 3); j--) {
      if (parsedHeader[j]?.hasHqContext && j < idx) break;
      if (parsedHeader[j]?.hasBranchContext || parsedHeader[j]?.hasExplicitAddressLabel) {
        return true;
      }
    }
    return false;
  };

  const getNearbyBranchCityHint = (idx: number): string | undefined => {
    for (let j = idx; j >= Math.max(0, idx - 3); j--) {
      if (parsedHeader[j]?.hasHqContext && j < idx) break;
      if (parsedHeader[j]?.branchCityHint) {
        return parsedHeader[j].branchCityHint;
      }
    }
    return undefined;
  };

  const hasNearbyHqContext = (idx: number): boolean => {
    if (parsedHeader[idx]?.hasHqContext) return true;
    // Check 1-3 lines above (stopping if a branch header separates them)
    for (let j = idx - 1; j >= Math.max(0, idx - 3); j--) {
      if (parsedHeader[j]?.hasBranchContext && !parsedHeader[j]?.hasHqContext) break;
      if (parsedHeader[j]?.hasHqContext) return true;
    }
    // Check 1-2 lines below for tax/EIK/BG VAT section immediately following HQ address
    for (let j = idx + 1; j <= Math.min(parsedHeader.length - 1, idx + 2); j++) {
      if (parsedHeader[j]?.hasBranchContext && !parsedHeader[j]?.hasHqContext) break;
      if (parsedHeader[j]?.hasTaxIdContext) return true;
    }
    return false;
  };

  const scoreCandidate = (
    idx: number,
    hasStreet: boolean,
    hasCity: boolean,
    streetText: string,
    explicitLabel: boolean
  ): number => {
    const branchNear = hasNearbyBranchContext(idx);
    const hqNear = hasNearbyHqContext(idx);
    const isPostTaxStoreSection =
      firstTaxIdIdx >= 0 && idx > firstTaxIdIdx && !parsedHeader[idx]?.hasHqContext;

    let score = 0;
    if (hasStreet) score += 40;
    if (hasStreet && /\d/.test(streetText)) score += 15;
    if (hasCity) score += 25;
    if (!hasStreet && hasCity) score = 20;
    if (explicitLabel) score += 15;
    if (branchNear) score += 35;
    if (isPostTaxStoreSection && !hqNear) score += 15;
    if (hqNear && !branchNear) score -= 45;
    return score;
  };

  // Pass 1: Single-line full addresses & multi-line street+city combinations
  for (let i = 0; i < parsedHeader.length; i++) {
    const cur = parsedHeader[i];
    if (cur.disqualified) continue;

    if (cur.singleLineSplit?.street && cur.singleLineSplit?.city) {
      const addr = `${cur.singleLineSplit.street}, ${cur.singleLineSplit.city.city}`;
      candidates.push({
        address: addr,
        score: scoreCandidate(
          i,
          true,
          true,
          cur.singleLineSplit.street,
          cur.hasExplicitAddressLabel
        ),
        rule: `Single-line street+city at line #${i + 1}`,
      });
      continue;
    }

    if (cur.isStreet) {
      const formattedStreet = formatAddressCasing(cur.cleaned);
      // Look for adjacent city line (check previous 1-2 lines first, then next 1-2 lines)
      let pairedCity: ParsedCityLine | null = null;
      let pairedIdx = -1;

      if (i > 0 && parsedHeader[i - 1].cityOnly && !usedCityIndices.has(i - 1)) {
        pairedCity = parsedHeader[i - 1].cityOnly;
        pairedIdx = i - 1;
      } else if (
        i + 1 < parsedHeader.length &&
        parsedHeader[i + 1].cityOnly &&
        !usedCityIndices.has(i + 1)
      ) {
        pairedCity = parsedHeader[i + 1].cityOnly;
        pairedIdx = i + 1;
      } else if (
        i > 1 &&
        parsedHeader[i - 2].cityOnly &&
        !usedCityIndices.has(i - 2) &&
        !parsedHeader[i - 1].isStreet &&
        !parsedHeader[i - 1].hasHqContext
      ) {
        pairedCity = parsedHeader[i - 2].cityOnly;
        pairedIdx = i - 2;
      } else if (
        i + 2 < parsedHeader.length &&
        parsedHeader[i + 2].cityOnly &&
        !usedCityIndices.has(i + 2) &&
        !parsedHeader[i + 1].isStreet &&
        !parsedHeader[i + 1].hasHqContext
      ) {
        pairedCity = parsedHeader[i + 2].cityOnly;
        pairedIdx = i + 2;
      }

      if (pairedCity && pairedIdx >= 0) {
        usedCityIndices.add(pairedIdx);
        const addr = `${formattedStreet}, ${pairedCity.city}`;
        candidates.push({
          address: addr,
          score: scoreCandidate(
            Math.min(i, pairedIdx),
            true,
            true,
            formattedStreet,
            cur.hasExplicitAddressLabel
          ),
          rule: `Combined street line #${i + 1} + city line #${pairedIdx + 1}`,
        });
      } else {
        const branchCity = getNearbyBranchCityHint(i);
        const addr = branchCity ? `${formattedStreet}, ${branchCity}` : formattedStreet;
        candidates.push({
          address: addr,
          score: scoreCandidate(
            i,
            true,
            Boolean(branchCity),
            formattedStreet,
            cur.hasExplicitAddressLabel
          ),
          rule: branchCity
            ? `Street line #${i + 1} + branch header city (${branchCity})`
            : `Street line #${i + 1}`,
        });
      }
    }
  }

  // Pass 2: Fallback city-only candidate ONLY when explicit "гр." / "с." was detected
  for (let i = 0; i < parsedHeader.length; i++) {
    const cur = parsedHeader[i];
    if (cur.disqualified || usedCityIndices.has(i) || !cur.cityOnly) continue;
    if (!cur.cityOnly.hasExplicitPrefix) continue;

    const label = cur.cityOnly.isVillage
      ? cur.cityOnly.city
      : `гр. ${cur.cityOnly.city}`;
    candidates.push({
      address: label,
      score: scoreCandidate(i, false, true, "", cur.hasExplicitAddressLabel),
      rule: `Explicit city indicator at line #${i + 1}`,
    });
  }

  if (candidates.length === 0) return {};

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 20) return {};

  const letterCount = (best.address.match(/[а-яА-Яa-zA-Z]/g) || []).length;
  if (best.address.length < 5 || letterCount < 3) return {};

  return {
    address: best.address,
    matchedRule: `${best.rule} (score=${best.score})`,
  };
}

export function extractReceiptAddressFromText(rawText: string): string | undefined {
  if (!rawText || !rawText.trim()) return undefined;
  const lines = cleanLines(rawText);
  const currency = extractCurrency(rawText);
  return extractReceiptAddress(lines, currency).address;
}

/**
 * Validates and reconciles item quantities (e.g. from Gemini AI output) against
 * standalone "qty x unitPrice" lines in OCR text using price consistency:
 * prevents mis-associating a standalone "4.000 x 0.15" row with an unrelated item (€2.04)
 * when the next/nearby item (€0.60) mathematically matches 4 * 0.15 = 0.60.
 */
export function reconcileReceiptItemQuantities<
  T extends { name: string; price: number; quantity?: number; originalPrice?: number; finalPrice?: number }
>(
  items: T[],
  rawOcrText: string,
  localItems: ExtractedReceiptItem[] = []
): T[] {
  if (!items || items.length === 0) return items;

  const lines = rawOcrText ? cleanLines(rawOcrText) : [];
  const standaloneQtyRegex =
    /^[*#•\s]*\(?\s*(\d+(?:[.,]\d+)?)\s*(?:бр\.?|шт\.?|оп\.?|pcs)?\s*[xхХX*×@]\s*(?:EUR|BGN|USD|GBP|[$€£])?\s*(\d+[.,]\d{2,3})(?:\s*(?:€|EUR|лв\.?|BGN|USD|GBP)?(?:\s*\/\s*1?\s*(?:бр\.?|шт\.?|оп\.?|pcs))?)?\s*\)?\s*(?:=\s*(?:[$€£]?\s*\d+[.,]\d{2})?)?\s*(?:[([]?\s*[АБВГA-D*]\s*[)\]]?)?\s*$/i;

  const standaloneQtyRows: Array<{ qty: number; unitVal: number; expectedTotal: number; used: boolean }> = [];
  for (const line of lines) {
    if (/(?:кг|гр|г|л|мл|kg|g|l|ml)\.?(?=$|[^а-яА-Яa-zA-Z])/i.test(line)) continue;
    const m = line.match(standaloneQtyRegex);
    if (!m) continue;
    const q = parseFloat(m[1].replace(",", "."));
    const u = parsePrice(m[2]);
    if (u && Number.isInteger(q) && q >= 2 && q <= 999) {
      standaloneQtyRows.push({ qty: q, unitVal: u, expectedTotal: q * u, used: false });
    }
  }

  const getPriceError = (expected: number, actual: number): number | null => {
    if (actual <= 0 || expected <= 0) return null;
    const tol = Math.max(0.02, actual * 0.015);
    const direct = Math.abs(expected - actual);
    const div = Math.abs(expected / 1.95583 - actual);
    const mul = Math.abs(expected * 1.95583 - actual);
    const best = Math.min(direct, div, mul);
    return best <= tol ? best : null;
  };

  const getItemCandidatePriceError = (expected: number, it: T): number | null => {
    const e1 = getPriceError(expected, it.originalPrice ?? it.price);
    const e2 =
      it.originalPrice !== undefined && it.price > 0 ? getPriceError(expected, it.price) : null;
    if (e1 === null) return e2;
    if (e2 === null) return e1;
    return Math.min(e1, e2);
  };

  const result = items.map((it) => ({ ...it }));
  const sameLength = localItems.length === result.length;

  // Step 1: When local OCR and AI have identical item alignment, transfer verified multi-quantities
  // and reset any AI quantity that contradicts local OCR + standalone OCR qty*unitPrice math.
  if (sameLength) {
    for (let i = 0; i < result.length; i++) {
      const gItem = result[i];
      const lItem = localItems[i];
      const gEff = gItem.finalPrice ?? gItem.price;
      const lEff = lItem.finalPrice ?? lItem.price;

      if (Math.abs(gEff - lEff) <= 0.03) {
        if ((lItem.quantity || 1) > 1 && (gItem.quantity || 1) === 1) {
          gItem.quantity = lItem.quantity;
        } else if ((gItem.quantity || 1) > 1 && (lItem.quantity || 1) === 1) {
          const matchingRow = standaloneQtyRows.some(
            (row) => row.qty === gItem.quantity && getItemCandidatePriceError(row.expectedTotal, gItem) !== null
          );
          const contradictingRow = standaloneQtyRows.some(
            (row) => row.qty === gItem.quantity && getItemCandidatePriceError(row.expectedTotal, gItem) === null
          );
          if (!matchingRow && contradictingRow) {
            gItem.quantity = 1;
          }
        }
      } else if ((gItem.quantity || 1) > 1 && (lItem.quantity || 1) === 1) {
        // Even if Gemini discounted/adjusted the price (e.g. 2.04 -> 0.64), still validate against standalone qty rows
        const matchingRow = standaloneQtyRows.some(
          (row) => row.qty === gItem.quantity && getItemCandidatePriceError(row.expectedTotal, gItem) !== null
        );
        const contradictingRow = standaloneQtyRows.some(
          (row) => row.qty === gItem.quantity && getItemCandidatePriceError(row.expectedTotal, gItem) === null
        );
        if (!matchingRow && contradictingRow) {
          gItem.quantity = 1;
        }
      }
    }
  }

  // Step 2: Enforce price-consistency for every standalone qty x unitPrice row in OCR,
  // prioritizing exact price match over proximity and never leaving a contradicting quantity attached.
  for (const row of standaloneQtyRows) {
    // 2a. Reset any item holding row.qty whose price does NOT match row.expectedTotal (unless explained by another row)
    const wrongIndices: number[] = [];
    for (let i = 0; i < result.length; i++) {
      if ((result[i].quantity || 1) !== row.qty) continue;
      const matchesThisRow = getItemCandidatePriceError(row.expectedTotal, result[i]) !== null;
      const matchesAnotherRow = standaloneQtyRows.some(
        (other) =>
          other !== row &&
          other.qty === row.qty &&
          getItemCandidatePriceError(other.expectedTotal, result[i]) !== null
      );
      if (!matchesThisRow && !matchesAnotherRow) {
        wrongIndices.push(i);
      }
    }

    // Check whether a matching item nearby already has row.qty (or needs it assigned)
    const alreadyExactMatchIdx = result.findIndex(
      (it) => (it.quantity || 1) === row.qty && getItemCandidatePriceError(row.expectedTotal, it) !== null
    );

    // Build all candidate items with quantity === 1 that match row.expectedTotal
    const exactMatchCandidates: Array<{ idx: number; err: number }> = [];
    for (let i = 0; i < result.length; i++) {
      if ((result[i].quantity || 1) !== 1) continue;
      const err = getItemCandidatePriceError(row.expectedTotal, result[i]);
      if (err !== null) {
        exactMatchCandidates.push({ idx: i, err });
      }
    }

    for (const wrongIdx of wrongIndices) {
      // Safety rule: never keep quantity when quantity * unitPrice does not match item total
      result[wrongIdx].quantity = 1;
    }

    if (alreadyExactMatchIdx !== -1) {
      row.used = true;
      continue;
    }

    if (exactMatchCandidates.length > 0) {
      const anchorIdx = wrongIndices.length > 0 ? wrongIndices[0] : -1;
      exactMatchCandidates.sort((a, b) => {
        const errDiff = a.err - b.err;
        if (Math.abs(errDiff) > 0.005) return errDiff;
        if (anchorIdx >= 0) {
          return Math.abs(a.idx - anchorIdx) - Math.abs(b.idx - anchorIdx);
        }
        return a.idx - b.idx;
      });
      const chosen = exactMatchCandidates[0];
      if (anchorIdx < 0 || Math.abs(chosen.idx - anchorIdx) <= 4) {
        result[chosen.idx].quantity = row.qty;
        row.used = true;
      }
    }
  }

  return result;
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
  const addressRes = extractReceiptAddress(lines, currency);
  const totalResult = extractTotal(lines, currency);
  const expectedItemsCount = extractExpectedItemsCount(lines);
  const extracted = extractItems(lines, totalResult.total, currency);
  let items = extracted.items;
  let discountTotal = extracted.discountTotal;
  let unattachedDiscountTotal = extracted.unattachedDiscountTotal;

  let finalTotal = totalResult.total;
  let finalConfidence = totalResult.confidence;
  let finalRule = totalResult.matchedLine;

  // Reconcile 2025/2026 Bulgarian dual-display receipts where items were printed in BGN and footer shows EUR total (ratio ≈ 1.95583)
  if (currency === "€" && finalTotal > 0 && items.length >= 2) {
    const rawItemsSum = items.reduce((sum, item) => sum + (item.finalPrice ?? item.price), 0);
    const netRawSum = Math.max(0, rawItemsSum - unattachedDiscountTotal);
    const BGN_PER_EUR = 1.95583;
    const itemsAreBgnVsEurTotal =
      Math.abs(rawItemsSum / finalTotal - BGN_PER_EUR) < 0.04 ||
      (unattachedDiscountTotal > 0 && Math.abs(netRawSum / finalTotal - BGN_PER_EUR) < 0.04);

    if (itemsAreBgnVsEurTotal) {
      items = items.map((it) => {
        const nextPrice = parseFloat((it.price / BGN_PER_EUR).toFixed(2));
        if (it.discount && it.discount > 0 && it.originalPrice !== undefined) {
          const nextOrig = parseFloat((it.originalPrice / BGN_PER_EUR).toFixed(2));
          const nextDisc = parseFloat((it.discount / BGN_PER_EUR).toFixed(2));
          const nextFinal = parseFloat(Math.max(0, nextOrig - nextDisc).toFixed(2));
          return {
            ...it,
            originalPrice: nextOrig,
            discount: nextDisc,
            finalPrice: nextFinal,
            price: nextFinal,
          };
        }
        return {
          ...it,
          price: nextPrice,
        };
      });
      if (discountTotal > 0) {
        discountTotal = parseFloat((discountTotal / BGN_PER_EUR).toFixed(2));
      }
      if (unattachedDiscountTotal > 0) {
        unattachedDiscountTotal = parseFloat((unattachedDiscountTotal / BGN_PER_EUR).toFixed(2));
      }
      finalRule = `${finalRule || "EUR Total"} (reconciled BGN item lines ÷ 1.95583)`;
    } else if (
      Math.abs(finalTotal / rawItemsSum - BGN_PER_EUR) < 0.04 ||
      (unattachedDiscountTotal > 0 && netRawSum > 0 && Math.abs(finalTotal / netRawSum - BGN_PER_EUR) < 0.04)
    ) {
      finalTotal = parseFloat((finalTotal / BGN_PER_EUR).toFixed(2));
      finalRule = `${finalRule || "Total"} (converted BGN total ÷ 1.95583 to match EUR items)`;
    }
  }

  if (finalTotal <= 0 && items.length > 0) {
    finalTotal = parseFloat(
      items.reduce((sum, item) => sum + (item.finalPrice ?? item.price), 0).toFixed(2)
    );
    finalConfidence = "medium";
    finalRule = `Sum of ${items.length} extracted items`;
  }

  const validation = validateReceiptTotals(
    items,
    finalTotal,
    expectedItemsCount,
    unattachedDiscountTotal,
    currency
  );
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
    detectedAddress: addressRes.address || null,
    addressRule: addressRes.matchedRule || null,
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
    detectedAddress: addressRes.address,
    addressRule: addressRes.matchedRule,
    warnings,
  };
}
