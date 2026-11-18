import { ExpenseItem, IncomeItem, MonthlyRecord } from "@/types";
import { gatherApplicationData } from "@/utils/backupRestore";
import { parseExpenseNote } from "@/utils/expenseFormatter";
import { isRecordCompleted } from "@/utils/expenseStatus";
import {
  formatRepeatLabel,
  isRepeatingFrequency,
  normalizeRepeatValue,
  parseMonthKeyToYearMonth,
  resolveItemRepeat,
} from "@/utils/recurrenceEngine";

const UTF8_BOM = "\uFEFF";

export interface CsvZipEntry {
  name: string;
  content: string;
}

export interface CsvExportSummary {
  filename: string;
  expensesCount: number;
  incomesCount: number;
  savingsCount: number;
}

/**
 * Escapes a single CSV cell according to RFC 4180 for Excel, Google Sheets, and LibreOffice Calc.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvDocument(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const rowLines = rows.map((row) => row.map(escapeCsvCell).join(","));
  return UTF8_BOM + [headerLine, ...rowLines].join("\r\n") + "\r\n";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatLocalTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function extractTimeFromFallback(createdAt?: string, timestamp?: number): string {
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) {
      return formatLocalTime(parsed);
    }
  }
  if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0) {
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) {
      return formatLocalTime(parsed);
    }
  }
  return "";
}

/**
 * Extracts consistent YYYY-MM-DD Date and HH:mm:ss Time strings from a record.
 */
export function extractDateAndTime(
  item: Pick<ExpenseItem, "date" | "createdAt" | "timestamp">,
  fallbackMonthKey?: string
): { date: string; time: string; sortTs: number } {
  const rawDate = typeof item.date === "string" ? item.date.trim() : "";

  // Exact YYYY-MM-DD (avoid UTC midnight timezone shift)
  const isoDateOnlyMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnlyMatch) {
    const y = Number(isoDateOnlyMatch[1]);
    const m = Number(isoDateOnlyMatch[2]) - 1;
    const day = Number(isoDateOnlyMatch[3]);
    const localAnchor = new Date(y, m, day, 12, 0, 0);
    return {
      date: rawDate,
      time: extractTimeFromFallback(item.createdAt, item.timestamp),
      sortTs: item.timestamp || localAnchor.getTime(),
    };
  }

  // Legacy DD.MM.YYYY
  const bgDateMatch = rawDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (bgDateMatch) {
    const day = Number(bgDateMatch[1]);
    const m = Number(bgDateMatch[2]) - 1;
    const y = Number(bgDateMatch[3]);
    const localAnchor = new Date(y, m, day, 12, 0, 0);
    return {
      date: `${y}-${pad2(m + 1)}-${pad2(day)}`,
      time: extractTimeFromFallback(item.createdAt, item.timestamp),
      sortTs: item.timestamp || localAnchor.getTime(),
    };
  }

  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      return {
        date: formatLocalDate(parsed),
        time: formatLocalTime(parsed),
        sortTs: item.timestamp || parsed.getTime(),
      };
    }
  }

  if (item.createdAt) {
    const parsed = new Date(item.createdAt);
    if (!isNaN(parsed.getTime())) {
      return {
        date: formatLocalDate(parsed),
        time: formatLocalTime(parsed),
        sortTs: item.timestamp || parsed.getTime(),
      };
    }
  }

  if (typeof item.timestamp === "number" && Number.isFinite(item.timestamp) && item.timestamp > 0) {
    const parsed = new Date(item.timestamp);
    if (!isNaN(parsed.getTime())) {
      return {
        date: formatLocalDate(parsed),
        time: formatLocalTime(parsed),
        sortTs: item.timestamp,
      };
    }
  }

  const monthMeta = parseMonthKeyToYearMonth(fallbackMonthKey);
  if (monthMeta) {
    const fallback = new Date(monthMeta.year, monthMeta.monthIndex, 1, 12, 0, 0);
    return {
      date: formatLocalDate(fallback),
      time: "",
      sortTs: fallback.getTime(),
    };
  }

  return { date: "", time: "", sortTs: 0 };
}

function flattenText(text?: string): string {
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ");
}

function extractExpenseDescriptionAndNotes(item: ExpenseItem): {
  description: string;
  notes: string;
} {
  const parsed = parseExpenseNote(item.note, item.merchantName, item.receiptItems);
  const merchant = (item.merchantName || parsed.merchantName || "").trim();

  let notes = "";
  if (item.receiptItems && item.receiptItems.length > 0) {
    notes = item.receiptItems
      .map((r) => {
        const qty = r.quantity && r.quantity > 1 ? `${r.quantity} x ` : "";
        const price = Number(r.finalPrice ?? r.price ?? 0).toFixed(2);
        return `${qty}${r.name} (€${price})`;
      })
      .join("; ");
  } else {
    notes = flattenText(item.note);
  }

  let description = merchant;
  if (!description) {
    if (parsed.isReceipt && parsed.items.length > 0) {
      description =
        parsed.items.length === 1
          ? parsed.items[0].name
          : `${parsed.items[0].name} (+${parsed.items.length - 1})`;
    } else if (item.note) {
      const firstLine = item.note
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean);
      description = firstLine || "";
    }
  }

  if (!description) {
    description = item.categoryName || "";
  }

  return { description, notes };
}

function collectExpenseRows(monthlyRecords: Record<string, MonthlyRecord>): {
  rows: unknown[][];
  count: number;
} {
  interface CollectedExpense {
    sortTs: number;
    row: unknown[];
  }

  const collected: CollectedExpense[] = [];

  for (const [monthKey, record] of Object.entries(monthlyRecords || {})) {
    if (!record?.expenses) continue;

    const pushExpenseItem = (item: ExpenseItem, bucket: "fixed" | "additional") => {
      const { date, time, sortTs } = extractDateAndTime(item, monthKey);
      const repeat = resolveItemRepeat(item);
      const isRecurring = bucket === "fixed" || isRepeatingFrequency(repeat);
      const typeLabel = isRecurring ? "Повтарящ се" : "Допълнителен";
      const completedLabel = isRecordCompleted(item) ? "Да" : "Не";
      const recurringLabel = repeat === "never" ? "Не" : formatRepeatLabel(repeat);
      const { description, notes } = extractExpenseDescriptionAndNotes(item);

      collected.push({
        sortTs,
        row: [
          date,
          time,
          typeLabel,
          item.categoryName || "",
          description,
          Number(item.amount || 0).toFixed(2),
          completedLabel,
          recurringLabel,
          notes,
        ],
      });
    };

    const fixedRaw = record.expenses.fixed_expenses as unknown;
    if (Array.isArray(fixedRaw)) {
      fixedRaw.forEach((item) => {
        if (item) pushExpenseItem(item as ExpenseItem, "fixed");
      });
    } else if (fixedRaw && typeof fixedRaw === "object") {
      // Legacy object fallback ({ credit_eur, phone_eur, internet_eur })
      const legacy = fixedRaw as Record<string, unknown>;
      const legacyLabels: Array<[string, string]> = [
        ["credit_eur", "Кредит"],
        ["phone_eur", "Телефон"],
        ["internet_eur", "Интернет"],
      ];
      legacyLabels.forEach(([key, label]) => {
        const val = Number(legacy[key] || 0);
        if (val > 0) {
          const { date, sortTs } = extractDateAndTime({ date: "", createdAt: record.meta?.generated_at }, monthKey);
          collected.push({
            sortTs,
            row: [date, "", "Повтарящ се", label, label, val.toFixed(2), "Да", "Месечно", ""],
          });
        }
      });
    }

    if (Array.isArray(record.expenses.additional_expenses)) {
      record.expenses.additional_expenses.forEach((item) => {
        if (item) pushExpenseItem(item, "additional");
      });
    }
  }

  collected.sort((a, b) => a.sortTs - b.sortTs);
  return {
    rows: collected.map((c) => c.row),
    count: collected.length,
  };
}

function collectIncomeRows(monthlyRecords: Record<string, MonthlyRecord>): {
  rows: unknown[][];
  count: number;
} {
  interface CollectedIncome {
    sortTs: number;
    row: unknown[];
  }

  const collected: CollectedIncome[] = [];
  const seenIds = new Set<string>();

  for (const [monthKey, record] of Object.entries(monthlyRecords || {})) {
    if (!Array.isArray(record?.incomes)) continue;

    record.incomes.forEach((inc) => {
      if (!inc || inc.type === "expense") return;
      if (inc.id) {
        if (seenIds.has(inc.id)) return;
        seenIds.add(inc.id);
      }

      const { date, time, sortTs } = extractDateAndTime(inc, monthKey);
      const repeat = normalizeRepeatValue(inc.repeat);
      const completedLabel = isRecordCompleted(inc) ? "Да" : "Не";
      const recurringLabel = repeat === "never" ? "Не" : formatRepeatLabel(repeat);
      const notes = flattenText(inc.note);
      const firstLineNote = inc.note
        ?.split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean);
      const description =
        firstLineNote ||
        (inc.isFixedItem || isRepeatingFrequency(repeat)
          ? "Повтарящ се приход"
          : "Допълнителен приход");

      collected.push({
        sortTs,
        row: [
          date,
          time,
          inc.categoryName || "",
          description,
          Number(inc.amount || 0).toFixed(2),
          completedLabel,
          recurringLabel,
          notes,
        ],
      });
    });
  }

  collected.sort((a, b) => a.sortTs - b.sortTs);
  return {
    rows: collected.map((c) => c.row),
    count: collected.length,
  };
}

function collectSavingsRows(savings: IncomeItem[]): {
  rows: unknown[][];
  count: number;
} {
  interface CollectedSaving {
    sortTs: number;
    row: unknown[];
  }

  const collected: CollectedSaving[] = (savings || [])
    .filter(Boolean)
    .map((item) => {
      const { date, sortTs } = extractDateAndTime(item);
      const isWithdrawal = item.type === "expense";
      const actionLabel = isWithdrawal ? "Теглене" : "Внасяне";
      const category = item.categoryName || "Спестявания";
      const signedAmount = isWithdrawal
        ? -Math.abs(Number(item.amount || 0))
        : Math.abs(Number(item.amount || 0));

      return {
        sortTs,
        row: [
          date,
          `${actionLabel} - ${category}`,
          signedAmount.toFixed(2),
          flattenText(item.note),
        ],
      };
    });

  collected.sort((a, b) => a.sortTs - b.sortTs);
  return {
    rows: collected.map((c) => c.row),
    count: collected.length,
  };
}

export function buildExpensesCsv(monthlyRecords: Record<string, MonthlyRecord>): {
  csv: string;
  count: number;
} {
  const { rows, count } = collectExpenseRows(monthlyRecords);
  const csv = buildCsvDocument(
    [
      "Date",
      "Time",
      "Type",
      "Category",
      "Description",
      "Amount",
      "Completed",
      "Recurring",
      "Notes",
    ],
    rows
  );
  return { csv, count };
}

export function buildIncomesCsv(monthlyRecords: Record<string, MonthlyRecord>): {
  csv: string;
  count: number;
} {
  const { rows, count } = collectIncomeRows(monthlyRecords);
  const csv = buildCsvDocument(
    [
      "Date",
      "Time",
      "Category",
      "Description",
      "Amount",
      "Completed",
      "Recurring",
      "Notes",
    ],
    rows
  );
  return { csv, count };
}

export function buildSavingsCsv(savings: IncomeItem[]): {
  csv: string;
  count: number;
} {
  const { rows, count } = collectSavingsRows(savings);
  const csv = buildCsvDocument(["Date", "Description", "Amount", "Notes"], rows);
  return { csv, count };
}

// =========================================================================
// Zero-Dependency PKZIP Archive Builder (Store / Method 0, IEEE 802.3 CRC-32)
// =========================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

/**
 * Packages UTF-8 string files into a standards-compliant ZIP byte buffer (Store method 0).
 */
export function createZipArchiveBytes(entries: CsvZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const now = new Date();
  const { dosTime, dosDate } = getDosDateTime(now);
  const utf8Flag = 0x0800;

  interface PreparedEntry {
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    offset: number;
  }

  const localParts: Uint8Array[] = [];
  const prepared: PreparedEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.content);
    const crc = crc32(dataBytes);

    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed to extract (2.0)
    view.setUint16(6, utf8Flag, true); // General purpose bit flag (UTF-8)
    view.setUint16(8, 0, true); // Compression method: 0 = Store
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, dataBytes.length, true);
    view.setUint32(22, dataBytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true); // Extra field length
    header.set(nameBytes, 30);

    prepared.push({ nameBytes, dataBytes, crc, offset });
    localParts.push(header, dataBytes);
    offset += header.length + dataBytes.length;
  }

  const centralDirectoryStart = offset;
  const centralParts: Uint8Array[] = [];
  let centralSize = 0;

  for (const item of prepared) {
    const cd = new Uint8Array(46 + item.nameBytes.length);
    const view = new DataView(cd.buffer);
    view.setUint32(0, 0x02014b50, true); // Central directory file header signature
    view.setUint16(4, 20, true); // Version made by
    view.setUint16(6, 20, true); // Version needed to extract
    view.setUint16(8, utf8Flag, true); // UTF-8 filename encoding
    view.setUint16(10, 0, true); // Compression method: Store
    view.setUint16(12, dosTime, true);
    view.setUint16(14, dosDate, true);
    view.setUint32(16, item.crc, true);
    view.setUint32(20, item.dataBytes.length, true);
    view.setUint32(24, item.dataBytes.length, true);
    view.setUint16(28, item.nameBytes.length, true);
    view.setUint16(30, 0, true); // Extra field length
    view.setUint16(32, 0, true); // File comment length
    view.setUint16(34, 0, true); // Disk number start
    view.setUint16(36, 0, true); // Internal file attributes
    view.setUint32(38, 0, true); // External file attributes
    view.setUint32(42, item.offset, true); // Relative offset of local header
    cd.set(item.nameBytes, 46);

    centralParts.push(cd);
    centralSize += cd.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // End of central directory signature
  eocdView.setUint16(4, 0, true); // Disk number
  eocdView.setUint16(6, 0, true); // Start disk
  eocdView.setUint16(8, prepared.length, true); // Entries on disk
  eocdView.setUint16(10, prepared.length, true); // Total entries
  eocdView.setUint32(12, centralSize, true); // Size of central directory
  eocdView.setUint32(16, centralDirectoryStart, true); // Offset of central directory
  eocdView.setUint16(20, 0, true); // Comment length

  const totalSize = centralDirectoryStart + centralSize + eocd.length;
  const result = new Uint8Array(totalSize);
  let cursor = 0;

  for (const part of localParts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  result.set(eocd, cursor);

  return result;
}

export function createCsvZipBlob(entries: CsvZipEntry[]): Blob {
  const archiveBytes = createZipArchiveBytes(entries);
  const buffer = archiveBytes.buffer.slice(
    archiveBytes.byteOffset,
    archiveBytes.byteOffset + archiveBytes.byteLength
  ) as ArrayBuffer;
  return new Blob([buffer], { type: "application/zip" });
}

/**
 * Exports Expenses, Incomes, and Savings as UTF-8 BOM CSV files packaged in a single ZIP download.
 */
export function exportCsvZipBackup(owner?: {
  uid?: string | null;
  email?: string | null;
}): CsvExportSummary {
  const snapshot = gatherApplicationData(owner);
  const monthlyRecords = snapshot.data.expenses?.monthlyRecords || {};
  const savings = snapshot.data.savings || [];

  const expensesCsv = buildExpensesCsv(monthlyRecords);
  const incomesCsv = buildIncomesCsv(monthlyRecords);
  const savingsCsv = buildSavingsCsv(savings);

  const zipBlob = createCsvZipBlob([
    { name: "expenses.csv", content: expensesCsv.csv },
    { name: "incomes.csv", content: incomesCsv.csv },
    { name: "savings.csv", content: savingsCsv.csv },
  ]);

  const now = new Date();
  const datePart = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const filename = `BudgetFlows_CSV_${datePart}.zip`;

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return {
    filename,
    expensesCount: expensesCsv.count,
    incomesCount: incomesCsv.count,
    savingsCount: savingsCsv.count,
  };
}
