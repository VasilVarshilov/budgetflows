import { ExpenseItem } from "@/types";

export const formatCurrency = (amount: number): string => {
  return amount.toFixed(2);
};

export const formatKWh = (amount: number): string => {
  return amount.toFixed(3);
};

export const getCurrentMonthBulgarian = (): string => {
  const date = new Date();
  const month = date.toLocaleDateString('bg-BG', { month: 'long' });
  const year = date.getFullYear();
  
  // Capitalize first letter of month
  const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
  
  return `${capitalizedMonth} ${year}`;
};

/**
 * Sanitizes a decimal amount string as the user types:
 * - Converts ',' to '.'
 * - Strips invalid characters while preserving digits and at most one decimal dot
 * - Preserves intermediate typing states like "10." or ".5"
 */
export const sanitizeDecimalInput = (raw: string): string => {
  if (!raw) return "";
  const normalized = raw.replace(/,/g, ".").replace(/\s+/g, "");
  let result = "";
  let hasDot = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch >= "0" && ch <= "9") {
      result += ch;
    } else if (ch === "." && !hasDot) {
      result += ".";
      hasDot = true;
    }
  }
  return result;
};

/**
 * Parses a decimal string (supporting both '.' and ',') into a finite number or NaN.
 */
export const parseDecimalInput = (raw: string | number): number => {
  if (typeof raw === "number") return raw;
  const sanitized = sanitizeDecimalInput(raw);
  if (!sanitized || sanitized === ".") return NaN;
  return parseFloat(sanitized);
};

function extractDayKeyFromDate(dateStr?: string): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return (
      Number(dateOnlyMatch[1]) * 10000 +
      Number(dateOnlyMatch[2]) * 100 +
      Number(dateOnlyMatch[3])
    );
  }
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function extractDayKeyFromMs(ms: number): number {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function hasExplicitIntradayTime(dateStr?: string): boolean {
  if (!dateStr) return false;
  const trimmed = dateStr.trim();
  if (!trimmed.includes("T")) return false;
  // Synthetic noon/midnight markers used for date-only receipts/incomes should fall back to creation timestamp
  return !/T(00:00:00|12:00:00)(\.000)?(Z|[+-]\d{2}:?\d{2})?$/i.test(trimmed);
}

export function getExpenseCreationTimestamp(item: Pick<ExpenseItem, "id" | "date" | "createdAt" | "timestamp">): number {
  if (typeof item.timestamp === "number" && Number.isFinite(item.timestamp) && item.timestamp > 0) {
    return item.timestamp;
  }
  if (item.createdAt) {
    const parsed = Date.parse(item.createdAt);
    if (!isNaN(parsed)) return parsed;
  }
  if (item.id) {
    const match = item.id.match(/(\d{13})/);
    if (match) {
      const idMs = Number(match[1]);
      if (Number.isFinite(idMs) && idMs > 0) return idMs;
    }
  }
  if (item.date) {
    const parsed = Date.parse(item.date);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

function getExpenseIntradayTimeMs(
  item: Pick<ExpenseItem, "id" | "date" | "createdAt" | "timestamp">,
  dayKey: number
): number | null {
  if (item.date && hasExplicitIntradayTime(item.date)) {
    const parsed = Date.parse(item.date);
    if (!isNaN(parsed)) return parsed;
  }
  // If date is date-only or synthetic noon, use creation timestamp when created on the same calendar day
  const createdMs = getExpenseCreationTimestamp(item);
  if (createdMs > 0 && extractDayKeyFromMs(createdMs) === dayKey) {
    return createdMs;
  }
  return null;
}

/**
 * Sorts expense/income items chronologically:
 *   Date -> Time -> Creation timestamp (createdAt / timestamp / ID), newest first by default.
 */
export function compareExpensesChronologically(
  a: Pick<ExpenseItem, "id" | "date" | "createdAt" | "timestamp">,
  b: Pick<ExpenseItem, "id" | "date" | "createdAt" | "timestamp">,
  direction: "desc" | "asc" = "desc",
  aIndex = 0,
  bIndex = 0
): number {
  const dir = direction === "desc" ? 1 : -1;

  const createdA = getExpenseCreationTimestamp(a);
  const createdB = getExpenseCreationTimestamp(b);

  const dayA =
    extractDayKeyFromDate(a.date) ??
    (createdA > 0 ? extractDayKeyFromMs(createdA) : 0);
  const dayB =
    extractDayKeyFromDate(b.date) ??
    (createdB > 0 ? extractDayKeyFromMs(createdB) : 0);

  // 1. Primary: Calendar Date
  if (dayA !== dayB) {
    return dir * (dayB - dayA);
  }

  // 2. Secondary: Intraday Time (when both entries have time on that day)
  const timeA = getExpenseIntradayTimeMs(a, dayA);
  const timeB = getExpenseIntradayTimeMs(b, dayB);
  if (timeA !== null && timeB !== null && timeA !== timeB) {
    return dir * (timeB - timeA);
  }

  // 3. Tertiary: Creation timestamp (createdAt -> timestamp -> numeric ID)
  if (createdA !== createdB) {
    return dir * (createdB - createdA);
  }

  // 4. Deterministic fallback: insertion order
  return dir * (bIndex - aIndex);
}

