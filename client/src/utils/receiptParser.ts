/**
 * Robust Receipt Text Parser
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
  warnings: string[];
}

// Clean and normalize price string to a valid float
export function parsePrice(val: string): number | null {
  if (!val) return null;
  // Reject percentages immediately (e.g. "20%", "0.24%")
  if (/%/.test(val)) return null;

  // Remove currency signs, colons, equals, and whitespace
  let clean = val.replace(/[$€£лвBGN:=]/gi, "").trim();

  // If format is 1.234,56 (European)
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(clean)) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  }
  // If format is 1,234.56 (US/UK)
  else if (/^\d{1,3}(,\d{3})*\.\d{2}$/.test(clean)) {
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
  return rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// Extract Merchant Name from receipt header lines
export function extractMerchant(lines: string[]): string {
  const genericHeaders = [
    /^(fiscal\s*receipt|receipt|tax\s*invoice|invoice|sales\s*receipt|customer\s*receipt)/i,
    /^(касова\s*бележка|касов\s*бон|фискален\s*бон|фактура|служебен\s*бон)/i,
    /^(welcome|thank\s*you|добре\s*дошли|благодарим|мерси)/i,
    /^(tel|phone|тел|факс|fax|email|www\.|http|vat|dds|eik|еик|ин|булстат)/i,
    /^\d+[\s\-/.:]+/,
  ];

  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i].trim();
    if (line.length < 2) continue;

    const isGeneric = genericHeaders.some((regex) => regex.test(line));
    if (!isGeneric) {
      // Clean up punctuation
      const cleaned = line.replace(/[#*=_~]/g, "").trim();
      if (cleaned.length >= 2 && !/^\d+$/.test(cleaned)) {
        return cleaned;
      }
    }
  }

  return "Касова бележка";
}

// Extract Transaction Date (YYYY-MM-DD)
export function extractDate(lines: string[]): string {
  const datePatterns = [
    // YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
    /\b(202\d)[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/,
    // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
    /\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](202\d)\b/,
    // MM/DD/YYYY
    /\b(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(202\d)\b/,
    // DD.MM.YY
    /\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](2[4-9])\b/,
  ];

  for (const line of lines) {
    for (const pattern of datePatterns) {
      const match = line.match(pattern);
      if (match) {
        // Format to YYYY-MM-DD
        if (match[1].length === 4) {
          return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
        } else if (match[3].length === 4) {
          return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
        } else if (match[3].length === 2) {
          return `20${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
        }
      }
    }
  }

  return new Date().toISOString().split("T")[0];
}

// Extract Currency
export function extractCurrency(rawText: string): string {
  if (/\b(bgn|лв|лева|лев)\b/i.test(rawText)) return "лв.";
  if (/\b(eur|евро|€)\b/i.test(rawText)) return "€";
  if (/\b(usd|дол|[$])\b/i.test(rawText)) return "$";
  if (/\b(gbp|лири|[£])\b/i.test(rawText)) return "£";
  return "€";
}

/**
 * Robust Total Amount Extraction Algorithm
 * Solves the issue where tax, line items or small values (e.g. 0.24) were selected instead of TOTAL (e.g. 31.39).
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

  // Patterns for subtotal and tax
  const subtotalRegex = /(?:sub\s*total|междинна\s*сума)\s*[:=]?\s*[$€£лв]?\s*([\d,.]+)/i;
  const taxRegex = /(?:tax|vat|ддс|данък)\s*(?:\([^)]*\))?\s*[:=]?\s*[$€£лв]?\s*([\d,.]+)/i;

  for (const line of lines) {
    if (!foundSubtotal) {
      const subMatch = line.match(subtotalRegex);
      if (subMatch) {
        const val = parsePrice(subMatch[1]);
        if (val && val > 0) foundSubtotal = val;
      }
    }
    if (!foundTax) {
      const taxMatch = line.match(taxRegex);
      if (taxMatch) {
        const val = parsePrice(taxMatch[1]);
        if (val && val > 0) foundTax = val;
      }
    }
  }

  // High priority keywords for final total
  const primaryTotalKeywords = [
    /^(?:grand\s*total|total\s*due|amount\s*due|balance\s*due)\b/i,
    /^(?:обща\s*сума|тотал|всичко|крайна\s*сума|сума\s*за\s*плащане|сума)\b/i,
    /\b(?:grand\s*total|balance\s*due|amount\s*due)\b/i,
    /\b(?:обща\s*сума|сума\s*за\s*плащане)\b/i,
    /\btotal\b/i,
    /\bтотал\b/i,
  ];

  // Candidates extracted from lines with explicit keywords
  interface TotalCandidate {
    amount: number;
    priority: number;
    line: string;
    isExplicitTotal?: boolean;
  }
  const candidates: TotalCandidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Exclude subtotal and tax lines from total consideration
    const isSubtotalLine = /sub\s*total|междинна/i.test(line);
    const isTaxOnlyLine = /^(?:tax|vat|ддс|данък)\b/i.test(line);
    const isChangeOrCash = /change|cash|в\s*брой|ресто|върнати|card|карта|credit|debit/i.test(line);

    if (isSubtotalLine || isTaxOnlyLine) continue;

    // Check against priority keywords
    for (let pIdx = 0; pIdx < primaryTotalKeywords.length; pIdx++) {
      const regex = primaryTotalKeywords[pIdx];
      if (regex.test(line)) {
        // Extract all decimal numbers on this line or the immediate next line
        const numMatches = line.match(/[$€£лв]?\s*(\d{1,6}[.,]\d{2})\b/g) || [];
        for (const rawNum of numMatches) {
          const val = parsePrice(rawNum);
          if (val && val > 0) {
            candidates.push({
              amount: val,
              priority: 100 - pIdx * 10 + (isChangeOrCash ? -40 : 0),
              line,
              isExplicitTotal: true,
            });
          }
        }

        // If the number is on the next line (common in receipts: "TOTAL" on line 1, "$31.39" on line 2)
        if (numMatches.length === 0 && i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextMatch = nextLine.match(/[$€£лв]?\s*(\d{1,6}[.,]\d{2})\b/);
          if (nextMatch) {
            const val = parsePrice(nextMatch[1]);
            if (val && val > 0) {
              candidates.push({
                amount: val,
                priority: 95 - pIdx * 10,
                line: `${line} ${nextLine}`,
                isExplicitTotal: true,
              });
            }
          }
        }
      }
    }
  }

  // 1. Evaluate explicit TOTAL keyword candidates FIRST
  if (candidates.length > 0) {
    // If a subtotal is known (e.g. 29.47), heavily penalize any number smaller than subtotal (e.g. 0.24)
    if (foundSubtotal && foundSubtotal > 0) {
      candidates.forEach((c) => {
        if (c.amount < foundSubtotal * 0.8) {
          c.priority -= 80; // Definitively reject 0.24 when subtotal is 29.47
        } else if (Math.abs(c.amount - (foundSubtotal + (foundTax || 0))) < 0.05) {
          c.priority += 50; // Boost exact subtotal + tax match
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
        confidence: best.priority >= 70 ? "high" : "medium",
      };
    }
  }

  // 2. Cross-validation fallback with Subtotal + Tax: e.g. 29.47 + 1.92 = 31.39
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


  // Fallback: look for the largest valid monetary value in the bottom 40% of the receipt
  const bottomLines = lines.slice(Math.floor(lines.length * 0.4));
  let fallbackMax = 0;
  let fallbackLine = "";

  for (const line of bottomLines) {
    // Skip dates or barcode-like numbers
    if (/\d{4}[-/. ]\d{2}[-/. ]\d{2}/.test(line)) continue;
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

// Extract Item Lines from text
export function extractItems(
  lines: string[],
  totalAmount: number
): Array<{ name: string; price: number; quantity?: number }> {
  const items: Array<{ name: string; price: number; quantity?: number }> = [];

  const ignoreWords = [
    /^(subtotal|total|tax|vat|cash|change|balance|card|visa|mastercard|amex|discount)/i,
    /^(междинна|сума|обща|тотал|ддс|данък|карта|в брой|ресто|отстъпка)/i,
    /^(tel|phone|www|http|благодарим|мерси|добре дошли)/i,
  ];

  for (const line of lines) {
    // Must contain some letters and a price at the end
    const hasLetters = /[a-zA-Zа-яА-Я]/.test(line);
    if (!hasLetters) continue;

    const isIgnored = ignoreWords.some((re) => re.test(line));
    if (isIgnored) continue;

    // Pattern: Item description followed by price (e.g., "Beer 5.00" or "Beer ........ 5.00")
    const itemMatch = line.match(/^(.*?)[.\s]+[$€£лв]?\s*(\d{1,4}[.,]\d{2})\s*$/);
    if (itemMatch) {
      let name = itemMatch[1].replace(/[.*_~=-]+$/, "").trim();
      const price = parsePrice(itemMatch[2]);

      // Check for quantity prefix like "2 x Beer" or "2 Beer"
      let quantity = 1;
      const qtyMatch = name.match(/^(\d+)\s*[xX*]\s*(.+)$/);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10);
        name = qtyMatch[2].trim();
      }

      if (name.length >= 2 && price && price > 0 && price !== totalAmount) {
        items.push({ name, price, quantity });
      }
    }
  }

  return items;
}

/**
 * Main Deterministic Local Receipt Parser
 * Operates instantly on OCR text without requiring Gemini API calls.
 */
export function parseReceiptTextLocally(rawText: string): ParsedReceiptData {
  const lines = cleanLines(rawText);
  const merchantName = extractMerchant(lines);
  const date = extractDate(lines);
  const currency = extractCurrency(rawText);
  const totalResult = extractTotal(lines);
  const items = extractItems(lines, totalResult.total);

  // Format notes as requested:
  // Beer €5.00
  // Soup €7.00
  // Salad €8.50
  let notesFormatted = "";
  if (items.length > 0) {
    notesFormatted = items
      .map((it) => {
        const qtyStr = it.quantity && it.quantity > 1 ? `${it.quantity}x ` : "";
        return `${qtyStr}${it.name} ${currency}${it.price.toFixed(2)}`;
      })
      .join("\n");
  }

  const warnings: string[] = [];
  if (totalResult.total <= 0) {
    warnings.push("Не беше открита категорична обща сума. Моля, проверете полето за сума.");
  } else if (totalResult.confidence === "low") {
    warnings.push(`Сумата (€${totalResult.total.toFixed(2)}) беше избрана автоматично. Моля, проверете дали съвпада.`);
  }

  return {
    merchantName,
    date,
    totalAmount: totalResult.total,
    subtotal: totalResult.subtotal,
    tax: totalResult.tax,
    currency,
    items,
    notesFormatted,
    confidence: totalResult.confidence,
    matchedRule: totalResult.matchedLine,
    warnings,
  };
}
