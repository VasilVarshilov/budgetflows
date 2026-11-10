/**
 * Expense Formatter & Receipt Item Parser
 * Handles structured receipt items and backwards-compatible parsing of legacy single-line notes.
 */
import { ReceiptItemDetail } from "@/types";

export interface ParsedExpenseNote {
  merchantName?: string;
  items: ReceiptItemDetail[];
  plainNote?: string;
  isReceipt: boolean;
  currencySymbol?: string;
}

/**
 * Extracts numeric price and optional currency symbol from a price string
 */
function parsePriceAndCurrency(str: string): { price: number; currency?: string } {
  const clean = str.trim();
  let currency = "€";
  if (clean.includes("$")) currency = "$";
  else if (clean.includes("€")) currency = "€";
  else if (clean.includes("£")) currency = "£";
  else if (/лв|bgn/i.test(clean)) currency = "лв.";

  const numMatch = clean.match(/(\d+[.,]\d{1,2}|\d+)/);
  const price = numMatch ? parseFloat(numMatch[1].replace(",", ".")) : 0;
  return { price, currency };
}

/**
 * Parses an expense note into structured merchant name and items.
 * Supports:
 * 1. Pre-structured multiline notes (e.g. "HARBOR LANE CAFE\nBeer €5.00\nSoup €7.00")
 * 2. Legacy run-on single-line notes (e.g. "HARBOR LANE CAFE Tacos Del Mal Shrimp $14.98 Especial Salad Chicken $12.50 Fountain Beverage $1.99")
 * 3. Standard user text notes (e.g. "Обяд с колеги")
 */
export function parseExpenseNote(
  note?: string,
  existingMerchant?: string,
  existingItems?: ReceiptItemDetail[]
): ParsedExpenseNote {
  // If already structured and has items, return directly
  if (existingItems && existingItems.length > 0) {
    return {
      merchantName: existingMerchant,
      items: existingItems,
      plainNote: note,
      isReceipt: true,
      currencySymbol: "€",
    };
  }

  if (!note || !note.trim()) {
    return {
      merchantName: existingMerchant,
      items: [],
      isReceipt: false,
    };
  }

  const trimmed = note.trim();
  let detectedCurrency = "€";

  // 1. Check if note has line breaks: "Merchant\nItem 1 €5.00\nItem 2 €7.00"
  if (trimmed.includes("\n")) {
    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let merchant = existingMerchant;
    const items: ReceiptItemDetail[] = [];

    let startIndex = 0;
    // If first line doesn't look like an item with a price, treat it as the merchant name
    if (!/(\d+[.,]\d{2})\b/.test(lines[0])) {
      merchant = lines[0].replace(/^[•\-*\s]+/, "").trim();
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      // Regex matching: name ... separator ... price
      // e.g. "• Tacos Del Mar Shrimp - $14.98" or "Beer ........ 5.00" or "Salad €8.50"
      const match = line.match(
        /^[•\-*\s]*(.+?)\s*(?:[-—:=]|\.{2,}|\s{2,}|\s+)\s*([$€£лв]?\s*\d+[.,]\d{2}\s*(?:[$€£лв]|лв\.)?)$/i
      );

      if (match) {
        const name = match[1].replace(/^[•\-*\s]+/, "").trim();
        const priceInfo = parsePriceAndCurrency(match[2]);
        if (name && !isNaN(priceInfo.price) && priceInfo.price > 0) {
          items.push({ name, price: priceInfo.price });
          if (priceInfo.currency) detectedCurrency = priceInfo.currency;
        }
      } else {
        // Loose fallback: look for last price in line
        const looseMatch = line.match(
          /^[•\-*\s]*(.+?)\s+([$€£лв]?\s*\d+[.,]\d{2}\s*(?:[$€£лв]|лв\.)?)$/i
        );
        if (looseMatch) {
          const name = looseMatch[1].replace(/^[•\-*\s]+/, "").trim();
          const priceInfo = parsePriceAndCurrency(looseMatch[2]);
          if (name && !isNaN(priceInfo.price) && priceInfo.price > 0) {
            items.push({ name, price: priceInfo.price });
            if (priceInfo.currency) detectedCurrency = priceInfo.currency;
          }
        }
      }
    }

    if (items.length > 0) {
      return {
        merchantName: merchant,
        items,
        plainNote: trimmed,
        isReceipt: true,
        currencySymbol: detectedCurrency,
      };
    }
  }

  // 2. Backwards compatibility for single-line run-on string:
  // e.g. "HARBOR LANE CAFE Tacos Del Mal Shrimp $14.98 Especial Salad Chicken $12.50 Fountain Beverage $1.99"
  // Match all price occurrences: "$14.98", "€12.50", "1.99", etc.
  const priceRegex = /([$€£лв]?\s*\d+[.,]\d{2}\s*(?:[$€£лв]|лв\.)?)\b/gi;
  const matches: { index: number; length: number; priceStr: string; price: number; currency: string }[] = [];
  let m: RegExpExecArray | null;

  while ((m = priceRegex.exec(trimmed)) !== null) {
    const priceInfo = parsePriceAndCurrency(m[1]);
    if (!isNaN(priceInfo.price) && priceInfo.price > 0) {
      matches.push({
        index: m.index,
        length: m[0].length,
        priceStr: m[1],
        price: priceInfo.price,
        currency: priceInfo.currency || "€",
      });
      if (priceInfo.currency) detectedCurrency = priceInfo.currency;
    }
  }

  // If 2 or more prices found in a single line, parse it as a run-on receipt
  if (matches.length >= 2) {
    let merchant = existingMerchant;
    const items: ReceiptItemDetail[] = [];
    let lastEnd = 0;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      let chunk = trimmed.substring(lastEnd, match.index).trim();
      // Clean up punctuation at ends of chunk
      chunk = chunk.replace(/^[,;•\-*\s]+|[,;•\-*\s]+$/g, "").trim();
      lastEnd = match.index + match.length;

      if (i === 0) {
        // e.g. "HARBOR LANE CAFE Tacos Del Mal Shrimp"
        const words = chunk.split(/\s+/);
        if (!merchant && words.length > 2) {
          // Check for all-caps merchant prefix like "HARBOR LANE CAFE"
          let capCount = 0;
          for (const w of words) {
            // Words with 2+ uppercase letters, no lowercase letters (allows numbers, &, -, ')
            if (/^[A-Z0-9&'\-\/]+$/.test(w) && w.length >= 2) {
              capCount++;
            } else {
              break;
            }
          }

          if (capCount >= 1 && capCount < words.length) {
            merchant = words.slice(0, capCount).join(" ");
            const itemName = words.slice(capCount).join(" ").trim();
            if (itemName) {
              items.push({ name: itemName, price: match.price });
            }
            continue;
          }
        }
        items.push({ name: chunk || `Артикул 1`, price: match.price });
      } else {
        items.push({ name: chunk || `Артикул ${i + 1}`, price: match.price });
      }
    }

    if (items.length > 0) {
      return {
        merchantName: merchant,
        items,
        plainNote: trimmed,
        isReceipt: true,
        currencySymbol: detectedCurrency,
      };
    }
  }

  // 3. Fallback: single line without multiple prices
  // Check if merchant was provided separately
  return {
    merchantName: existingMerchant,
    items: [],
    plainNote: trimmed,
    isReceipt: false,
    currencySymbol: "€",
  };
}

/**
 * Formats an array of receipt items into a clean multiline text string.
 */
export function formatReceiptItemsToText(items: ReceiptItemDetail[], currency = "€"): string {
  return items
    .map((item) => {
      const formattedPrice = item.price.toFixed(2);
      return currency === "$" || currency === "€" || currency === "£"
        ? `• ${item.name} - ${currency}${formattedPrice}`
        : `• ${item.name} - ${formattedPrice} ${currency}`;
    })
    .join("\n");
}
