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
  else if (/лв|bgn/i.test(clean)) currency = "€";

  const numMatch = clean.match(/(\d+[.,]\d{1,2}|\d+)/);
  const price = numMatch ? parseFloat(numMatch[1].replace(",", ".")) : 0;
  return { price, currency };
}

function splitQuantityAndName(rawName: string): { name: string; quantity?: number } {
  const cleaned = rawName.replace(/^[•\-*\s]+/, "").trim();
  const qtyMatch =
    cleaned.match(/^(\d+)\s*(?:(?:бр\.?|pcs)\s*[xхХX*×]?|[xхХX*×])\s+(.+)$/i) ||
    cleaned.match(/^(\d+)\s*[xхХX*×]\s*(.+)$/i);
  if (qtyMatch) {
    const qty = parseInt(qtyMatch[1], 10);
    const name = qtyMatch[2].trim();
    if (qty >= 1 && qty <= 999 && name.length >= 1) {
      return { name, quantity: qty };
    }
  }
  return { name: cleaned };
}

function isLineFormattedReceiptItem(
  line: string,
  existingItems?: ReceiptItemDetail[]
): boolean {
  const clean = line.replace(/^[•\-*\s]+/, "").trim();
  if (!clean) return true;

  // Matches formatted bullet/price line like "1 x Beer - €3.00" or "Beer - €3.00 (ориг. €4.00, -€1.00)"
  const strippedDiscount = clean
    .replace(
      /\s*\((?:ориг\.|orig\.?)\s*[$€£лв.]?\s*\d+[.,]\d{2}.*?\)\s*$/i,
      ""
    )
    .trim();

  if (
    /^.+?\s*(?:[-—:=]|\.{2,}|\s{2,})\s*[$€£лв]?\s*\d+[.,]\d{2}\s*(?:[$€£лв]|лв\.|EUR|BGN)?$/i.test(
      strippedDiscount
    )
  ) {
    return true;
  }

  if (existingItems && existingItems.length > 0) {
    const lowerClean = strippedDiscount.toLowerCase();
    for (const item of existingItems) {
      const itemNameLower = (item.name || "").trim().toLowerCase();
      if (
        itemNameLower &&
        lowerClean.includes(itemNameLower) &&
        /\d+[.,]\d{2}/.test(lowerClean)
      ) {
        return true;
      }
    }
  }

  return false;
}

function extractManualNoteLines(
  note?: string,
  merchantName?: string,
  existingItems?: ReceiptItemDetail[]
): string | undefined {
  if (!note || !note.trim()) return undefined;
  const trimmed = note.trim();

  // If this is a legacy single-line run-on receipt blob (2+ inline prices), don't treat it as a manual note
  if (!trimmed.includes("\n")) {
    const normalizedMerchant = (merchantName || "").trim().toLowerCase();
    if (
      normalizedMerchant &&
      trimmed.replace(/^[•\-*\s]+/, "").trim().toLowerCase() === normalizedMerchant
    ) {
      return undefined;
    }
    if (isLineFormattedReceiptItem(trimmed, existingItems)) {
      return undefined;
    }
    const priceMatches = trimmed.match(/([$€£лв]?\s*\d+[.,]\d{2}\s*(?:[$€£лв]|лв\.|EUR|BGN)?)\b/gi);
    if (priceMatches && priceMatches.length >= 2) {
      return undefined;
    }
    return trimmed;
  }

  const normalizedMerchant = (merchantName || "").trim().toLowerCase();
  const manualLines: string[] = [];

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const stripped = line.replace(/^[•\-*\s]+/, "").trim();
    if (normalizedMerchant && stripped.toLowerCase() === normalizedMerchant) {
      continue;
    }
    if (isLineFormattedReceiptItem(line, existingItems)) {
      continue;
    }
    manualLines.push(line);
  }

  return manualLines.length > 0 ? manualLines.join("\n") : undefined;
}

/**
 * Parses an expense note into structured merchant name, items, and genuine manual user comment.
 * Supports:
 * 1. Pre-structured multiline notes (e.g. "Lidl\n2 x Coca Cola - €4.80\n1 x Water - €1.20")
 * 2. Single-line formatted receipt item (e.g. "2 x Coca Cola - €4.80")
 * 3. Legacy run-on single-line notes (e.g. "HARBOR LANE CAFE Tacos Del Mal Shrimp $14.98 Especial Salad Chicken $12.50")
 * 4. Standard user text notes (e.g. "Обяд с колеги")
 */
export function parseExpenseNote(
  note?: string,
  existingMerchant?: string,
  existingItems?: ReceiptItemDetail[]
): ParsedExpenseNote {
  // If already structured and has items, preserve any genuine manual comment lines separately
  if (existingItems && existingItems.length > 0) {
    return {
      merchantName: existingMerchant,
      items: existingItems,
      plainNote: extractManualNoteLines(note, existingMerchant, existingItems),
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

  // 1. Check if note has line breaks OR is a single formatted item line like "2 x Coca Cola - €4.80"
  const looksLikeFormattedSingleLine =
    /^[•\-*\s]*.+?\s+[-—:=]\s+[$€£лв]?\s*\d+[.,]\d{2}\s*(?:[$€£лв]|лв\.|EUR|BGN)?$/i.test(trimmed);

  if (trimmed.includes("\n") || looksLikeFormattedSingleLine) {
    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let merchant = existingMerchant;
    const items: ReceiptItemDetail[] = [];
    const manualLines: string[] = [];

    let startIndex = 0;
    // If first line doesn't look like an item with a price, treat it as merchant name only if no explicit merchant exists
    if (lines.length > 1 && !/(\d+[.,]\d{2})\b/.test(lines[0])) {
      const firstLineClean = lines[0].replace(/^[•\-*\s]+/, "").trim();
      if (!merchant) {
        merchant = firstLineClean;
      } else if (firstLineClean.toLowerCase() !== merchant.trim().toLowerCase()) {
        manualLines.push(lines[0]);
      }
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      let line = lines[i];
      let discountMeta:
        | { originalPrice?: number; discount?: number; finalPrice?: number; discountLabel?: string }
        | undefined;

      // Extract optional discount annotation e.g. "(ориг. €3.06, -€1.02 Lidl Plus)"
      const discSuffixMatch = line.match(
        /\s*\((?:ориг\.|orig\.?)\s*[$€£лв.]?\s*(\d+[.,]\d{2})\s*(?:лв\.?|€|\$|£)?\s*,\s*-\s*[$€£лв.]?\s*(\d+[.,]\d{2})\s*(?:лв\.?|€|\$|£)?(?:\s+([^)]+))?\)\s*$/i
      );
      if (discSuffixMatch) {
        const orig = parseFloat(discSuffixMatch[1].replace(",", "."));
        const disc = parseFloat(discSuffixMatch[2].replace(",", "."));
        const label = discSuffixMatch[3]?.trim();
        if (!isNaN(orig) && !isNaN(disc) && disc > 0) {
          discountMeta = {
            originalPrice: parseFloat(orig.toFixed(2)),
            discount: parseFloat(disc.toFixed(2)),
            ...(label ? { discountLabel: label } : {}),
          };
        }
        line = line.slice(0, discSuffixMatch.index).trim();
      }

      // Regex matching: name ... separator ... price
      // e.g. "2 x Coca Cola - €4.80", "1 x Хляб бял - €1.20", "Beer €5.00"
      const match = line.match(
        /^[•\-*\s]*(.+?)\s*(?:[-—:=]|\.{2,}|\s{2,}|\s+)\s*([$€£лв]?\s*\d+[.,]\d{2}\s*(?:[$€£лв]|лв\.|EUR|BGN)?)$/i
      );

      if (match) {
        const parsedName = splitQuantityAndName(match[1]);
        const priceInfo = parsePriceAndCurrency(match[2]);
        if (parsedName.name && !isNaN(priceInfo.price) && priceInfo.price >= 0 && (priceInfo.price > 0 || discountMeta)) {
          items.push({
            name: parsedName.name,
            price: priceInfo.price,
            ...(parsedName.quantity ? { quantity: parsedName.quantity } : {}),
            ...(discountMeta
              ? {
                  ...discountMeta,
                  finalPrice: priceInfo.price,
                }
              : {}),
          });
          if (priceInfo.currency) detectedCurrency = priceInfo.currency;
        }
      } else {
        // Loose fallback: look for last price in line
        const looseMatch = line.match(
          /^[•\-*\s]*(.+?)\s+([$€£лв]?\s*\d+[.,]\d{2}\s*(?:[$€£лв]|лв\.|EUR|BGN)?)$/i
        );
        if (looseMatch) {
          const parsedName = splitQuantityAndName(looseMatch[1]);
          const priceInfo = parsePriceAndCurrency(looseMatch[2]);
          if (parsedName.name && !isNaN(priceInfo.price) && priceInfo.price >= 0 && (priceInfo.price > 0 || discountMeta)) {
            items.push({
              name: parsedName.name,
              price: priceInfo.price,
              ...(parsedName.quantity ? { quantity: parsedName.quantity } : {}),
              ...(discountMeta
                ? {
                    ...discountMeta,
                    finalPrice: priceInfo.price,
                  }
                : {}),
            });
            if (priceInfo.currency) detectedCurrency = priceInfo.currency;
          }
        } else {
          // Non-item line (user comment)
          manualLines.push(lines[i]);
        }
      }
    }

    if (items.length > 0) {
      return {
        merchantName: merchant,
        items,
        plainNote: manualLines.length > 0 ? manualLines.join("\n") : undefined,
        isReceipt: true,
        currencySymbol: detectedCurrency,
      };
    }
  }

  // 2. Backwards compatibility for single-line run-on string:
  // e.g. "HARBOR LANE CAFE Tacos Del Mal Shrimp $14.98 Especial Salad Chicken $12.50 Fountain Beverage $1.99"
  // Match all price occurrences: "$14.98", "€12.50", "1.99", etc.
  const priceRegex = /([$€£лв]?\s*\d+[.,]\d{2}\s*(?:[$€£лв]|лв\.|EUR|BGN)?)\b/gi;
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
              const parsed = splitQuantityAndName(itemName);
              items.push({
                name: parsed.name,
                price: match.price,
                ...(parsed.quantity ? { quantity: parsed.quantity } : {}),
              });
            }
            continue;
          }
        }
        const parsed = splitQuantityAndName(chunk || `Артикул 1`);
        items.push({
          name: parsed.name,
          price: match.price,
          ...(parsed.quantity ? { quantity: parsed.quantity } : {}),
        });
      } else {
        const parsed = splitQuantityAndName(chunk || `Артикул ${i + 1}`);
        items.push({
          name: parsed.name,
          price: match.price,
          ...(parsed.quantity ? { quantity: parsed.quantity } : {}),
        });
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
  const sym = currency === "лв." || currency === "BGN" ? "€" : currency || "€";
  const fmt = (val: number) =>
    sym === "$" || sym === "€" || sym === "£"
      ? `${sym}${val.toFixed(2)}`
      : `${val.toFixed(2)} ${sym}`;

  return items
    .map((item) => {
      const netPrice = item.finalPrice ?? item.price;
      const qty = item.quantity && item.quantity >= 1 ? item.quantity : 1;
      const base = `• ${qty} x ${item.name} - ${fmt(netPrice)}`;
      if (item.discount && item.discount > 0 && item.originalPrice !== undefined) {
        const label = item.discountLabel ? ` ${item.discountLabel}` : "";
        return `${base} (ориг. ${fmt(item.originalPrice)}, -${fmt(item.discount)}${label})`;
      }
      return base;
    })
    .join("\n");
}

/**
 * Splits a monetary total into `count` cent-rounded unit prices whose sum equals `totalAmount` exactly.
 * Any rounding remainder is absorbed by the final item.
 */
export function splitAmountByCents(totalAmount: number, count: number): number[] {
  const safeCount = Math.max(1, Math.round(count));
  const totalCents = Math.max(0, Math.round(totalAmount * 100));
  if (safeCount === 1) {
    return [parseFloat((totalCents / 100).toFixed(2))];
  }

  let unitCents = Math.round(totalCents / safeCount);
  if (unitCents * (safeCount - 1) > totalCents) {
    unitCents = Math.floor(totalCents / safeCount);
  }
  const finalCents = totalCents - unitCents * (safeCount - 1);

  const parts: number[] = [];
  for (let i = 0; i < safeCount - 1; i++) {
    parts.push(parseFloat((unitCents / 100).toFixed(2)));
  }
  parts.push(parseFloat((finalCents / 100).toFixed(2)));
  return parts;
}

/**
 * Expands any multi-quantity receipt item (quantity > 1) into individual `1 x` items,
 * preserving exact line totals (cents-rounded with final-item adjustment) and selection state.
 */
export function splitReceiptItemsWithSelection(
  items: ReceiptItemDetail[],
  selectedIndices: Set<number>
): { items: ReceiptItemDetail[]; selectedIndices: Set<number> } {
  const expanded: ReceiptItemDetail[] = [];
  const nextSelected = new Set<number>();

  items.forEach((item, idx) => {
    const qty = item.quantity && item.quantity > 1 ? Math.round(item.quantity) : 1;
    const isSelected = selectedIndices.has(idx);

    if (qty <= 1) {
      const targetIdx = expanded.length;
      expanded.push({
        ...item,
        quantity: 1,
      });
      if (isSelected) {
        nextSelected.add(targetIdx);
      }
      return;
    }

    const netTotal = item.finalPrice ?? item.price;
    const netParts = splitAmountByCents(netTotal, qty);
    const hasDiscount =
      Boolean(item.discount && item.discount > 0 && item.originalPrice !== undefined);
    const origParts = hasDiscount
      ? splitAmountByCents(item.originalPrice!, qty)
      : undefined;

    for (let u = 0; u < qty; u++) {
      const targetIdx = expanded.length;
      const unitNet = netParts[u];
      if (hasDiscount && origParts) {
        const unitOrig = origParts[u];
        expanded.push({
          name: item.name,
          quantity: 1,
          price: unitNet,
          originalPrice: unitOrig,
          discount: parseFloat(Math.max(0, unitOrig - unitNet).toFixed(2)),
          finalPrice: unitNet,
          ...(item.discountLabel ? { discountLabel: item.discountLabel } : {}),
        });
      } else {
        expanded.push({
          name: item.name,
          quantity: 1,
          price: unitNet,
        });
      }
      if (isSelected) {
        nextSelected.add(targetIdx);
      }
    }
  });

  return { items: expanded, selectedIndices: nextSelected };
}

export function splitReceiptItemsByQuantity(
  items: ReceiptItemDetail[]
): ReceiptItemDetail[] {
  return splitReceiptItemsWithSelection(
    items,
    new Set(items.map((_, idx) => idx))
  ).items;
}

/**
 * Collapses adjacent identical items that share selection state back into grouped multi-quantity lines.
 */
export function mergeAdjacentSplitReceiptItems(
  items: ReceiptItemDetail[],
  selectedIndices: Set<number>
): { items: ReceiptItemDetail[]; selectedIndices: Set<number> } {
  const merged: ReceiptItemDetail[] = [];
  const nextSelected = new Set<number>();

  items.forEach((item, idx) => {
    const isSelected = selectedIndices.has(idx);
    const qty = item.quantity && item.quantity >= 1 ? Math.round(item.quantity) : 1;
    const prev = merged[merged.length - 1];
    const prevIdx = merged.length - 1;
    const prevSelected = prevIdx >= 0 && nextSelected.has(prevIdx);

    const canMergeWithPrev =
      prev &&
      prevSelected === isSelected &&
      prev.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
      !prev.discount &&
      !item.discount;

    if (canMergeWithPrev) {
      const nextQty = (prev.quantity || 1) + qty;
      const nextPrice = parseFloat((prev.price + (item.finalPrice ?? item.price)).toFixed(2));
      merged[prevIdx] = {
        ...prev,
        quantity: nextQty,
        price: nextPrice,
      };
    } else {
      const targetIdx = merged.length;
      merged.push({ ...item, quantity: qty });
      if (isSelected) {
        nextSelected.add(targetIdx);
      }
    }
  });

  return { items: merged, selectedIndices: nextSelected };
}

