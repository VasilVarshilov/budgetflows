import {
  BackupData,
  ElectricityRecord,
  ExpenseCategory,
  ExpenseItem,
  MonthlyRecord,
  SavingsGoal,
} from "@/types";
import { gatherApplicationData } from "@/utils/backupRestore";
import {
  calculateAllBudgetsStatus,
  getBudgetLinkedCategoryIds,
  loadBudgets,
} from "@/utils/budgetStorage";
import { loadStoredCategories, loadStoredIncomeCategories } from "@/utils/categoryStorage";
import { parseExpenseNote } from "@/utils/expenseFormatter";
import { isRecordCompleted } from "@/utils/expenseStatus";
import { getCurrentMonthBulgarian } from "@/utils/formatting";
import {
  formatRepeatLabel,
  isRepeatingFrequency,
  normalizeRepeatValue,
  parseMonthKeyToYearMonth,
  resolveItemRepeat,
} from "@/utils/recurrenceEngine";
import {
  computeSavingsAllocationSummary,
  getGoalProgressPercent,
  loadSavingsGoals,
} from "@/utils/savingsGoalsStorage";
import { formatLocationExportLabel } from "@/utils/locationUtils";

// =========================================================================
// Public Types & Entry Point
// =========================================================================

export const EXCEL_EXPORT_FILENAME = "BudgetForce365_Export.xlsx";

export const EXCEL_WORKSHEET_NAMES = [
  "Expenses",
  "Incomes",
  "Savings",
  "Electricity",
  "Categories",
  "Budgets",
  "Summary",
] as const;

export interface ExcelExportSummary {
  filename: string;
  sheets: string[];
  expensesCount: number;
  incomesCount: number;
  savingsCount: number;
  savingsGoalsCount: number;
  electricityCount: number;
  categoriesCount: number;
  budgetsCount: number;
}

// =========================================================================
// Zero-Dependency PKZIP Archive Builder (Store / Method 0, IEEE 802.3 CRC-32)
// =========================================================================

interface ZipBinaryEntry {
  name: string;
  content: string | Uint8Array;
}

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

export function createZipArchiveBytes(entries: ZipBinaryEntry[]): Uint8Array {
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
    const dataBytes =
      typeof entry.content === "string"
        ? encoder.encode(entry.content)
        : entry.content;
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

// =========================================================================
// Minimal OOXML (.xlsx) Builder (ECMA-376)
// =========================================================================

/** Style IDs matching `xl/styles.xml` <cellXfs> indices */
export const STYLE = {
  TEXT: 0, // General UTF-8 text
  HEADER: 1, // Bold white header on dark slate fill
  CURRENCY: 2, // #,##0.00
  INTEGER: 3, // 0
  DATE: 4, // yyyy-mm-dd
  BOLD_TEXT: 5, // Bold dark label
  BOLD_CURRENCY: 6, // Bold #,##0.00
  PRICE_5DEC: 7, // 0.00000 (Electricity kWh tariff)
  PERCENT: 8, // 0.0% (expects fraction e.g. 0.425 -> 42.5%)
  SECTION: 9, // Section title banner (bold dark on soft indigo fill)
} as const;

export type StyleIndex = (typeof STYLE)[keyof typeof STYLE];

export type CellValue =
  | { kind: "str"; value: string; style?: StyleIndex }
  | { kind: "num"; value: number; style?: StyleIndex }
  | { kind: "date"; isoDate: string; style?: StyleIndex }
  | { kind: "empty"; style?: StyleIndex };

export interface SheetSpec {
  name: string;
  rows: CellValue[][];
  freezeHeader?: boolean;
  autoFilter?: boolean;
  minColWidths?: number[];
}

export function strCell(value: unknown, style: StyleIndex = STYLE.TEXT): CellValue {
  const s = value === null || value === undefined ? "" : String(value);
  return { kind: "str", value: s, style };
}

export function headerCell(value: string): CellValue {
  return { kind: "str", value, style: STYLE.HEADER };
}

export function sectionCell(value: string): CellValue {
  return { kind: "str", value, style: STYLE.SECTION };
}

export function boldTextCell(value: unknown): CellValue {
  return strCell(value, STYLE.BOLD_TEXT);
}

export function numCell(value: unknown, style: StyleIndex = STYLE.CURRENCY): CellValue {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return { kind: "empty", style };
  }
  return { kind: "num", value: n, style };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round5(n: number): number {
  return Math.round((n + Number.EPSILON) * 100000) / 100000;
}

export function currencyCell(value: number, bold = false): CellValue {
  return numCell(round2(Number.isFinite(value) ? value : 0), bold ? STYLE.BOLD_CURRENCY : STYLE.CURRENCY);
}

export function intCell(value: number): CellValue {
  return numCell(Math.round(Number.isFinite(value) ? value : 0), STYLE.INTEGER);
}

export function percentFromRatioCell(ratio: number): CellValue {
  const safe = Number.isFinite(ratio) ? ratio : 0;
  return numCell(Math.round(safe * 10000) / 10000, STYLE.PERCENT);
}

export function dateCell(isoDate: string): CellValue {
  const trimmed = (isoDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { kind: "date", isoDate: trimmed, style: STYLE.DATE };
  }
  return strCell(trimmed, STYLE.TEXT);
}

/** Strips XML 1.0 forbidden control chars and enforces Excel's 32,767 char limit */
function sanitizeXmlText(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "");
  return cleaned.length > 32767 ? cleaned.slice(0, 32767) : cleaned;
}

function escapeXml(raw: string): string {
  return sanitizeXmlText(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Converts 0-based column index to Excel letters (0 -> A, 25 -> Z, 26 -> AA) */
function colIndexToLetters(colIndex: number): string {
  let index = colIndex;
  let letters = "";
  while (index >= 0) {
    letters = String.fromCharCode((index % 26) + 65) + letters;
    index = Math.floor(index / 26) - 1;
  }
  return letters;
}

/**
 * Converts YYYY-MM-DD into Excel's 1900 date serial number.
 * Guards dates before 1900-03-01 (Excel Lotus 1-2-3 leap-year offset) by returning null.
 */
function isoDateToExcelSerial(isoDate: string): number | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 1900 || (y === 1900 && (m < 3))) return null;

  const utcTarget = Date.UTC(y, m - 1, d);
  const excelEpoch = Date.UTC(1899, 11, 30);
  const serial = Math.round((utcTarget - excelEpoch) / 86400000);
  return serial > 0 ? serial : null;
}

class SharedStringTable {
  private readonly strings: string[] = [];
  private readonly indexByValue = new Map<string, number>();
  private totalCount = 0;

  intern(value: string): number {
    const safe = sanitizeXmlText(value);
    this.totalCount += 1;
    const existing = this.indexByValue.get(safe);
    if (existing !== undefined) {
      return existing;
    }
    const idx = this.strings.length;
    this.strings.push(safe);
    this.indexByValue.set(safe, idx);
    return idx;
  }

  toXml(): string {
    const itemsXml = this.strings
      .map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`)
      .join("");
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.totalCount}" uniqueCount="${this.strings.length}">` +
      itemsXml +
      `</sst>`
    );
  }
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="4">
    <numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>
    <numFmt numFmtId="165" formatCode="#,##0.00"/>
    <numFmt numFmtId="166" formatCode="0.00000"/>
    <numFmt numFmtId="167" formatCode="0.0%"/>
  </numFmts>
  <fonts count="3">
    <font>
      <sz val="11"/>
      <color rgb="FF0F172A"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color rgb="FFFFFFFF"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color rgb="FF0F172A"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
  </fonts>
  <fills count="4">
    <fill>
      <patternFill patternType="none"/>
    </fill>
    <fill>
      <patternFill patternType="gray125"/>
    </fill>
    <fill>
      <patternFill patternType="solid">
        <fgColor rgb="FF1E293B"/>
      </patternFill>
    </fill>
    <fill>
      <patternFill patternType="solid">
        <fgColor rgb="FFE0E7FF"/>
      </patternFill>
    </fill>
  </fills>
  <borders count="2">
    <border>
      <left/>
      <right/>
      <top/>
      <bottom/>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="165" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

function estimateCellCharWidth(cell: CellValue): number {
  if (cell.kind === "empty") return 0;
  if (cell.kind === "date") return 12;
  if (cell.kind === "num") {
    return cell.value.toFixed(2).length + 3;
  }
  // Ignore ultra-long receipt note blobs for column auto-width
  return Math.min(48, cell.value.length);
}

function buildWorksheetXml(
  spec: SheetSpec,
  sharedStrings: SharedStringTable,
  isFirstSheet: boolean
): string {
  const rowCount = Math.max(1, spec.rows.length);
  const maxCols = Math.max(
    1,
    ...spec.rows.map((r) => r.length),
    spec.minColWidths?.length || 0
  );

  // Measure column widths cleanly
  const colWidths = new Array<number>(maxCols).fill(11);
  if (spec.minColWidths) {
    spec.minColWidths.forEach((w, idx) => {
      if (idx < maxCols && Number.isFinite(w)) {
        colWidths[idx] = Math.max(colWidths[idx], w);
      }
    });
  }
  for (const row of spec.rows) {
    for (let c = 0; c < row.length; c++) {
      const est = estimateCellCharWidth(row[c]) + 3;
      if (est > colWidths[c]) {
        colWidths[c] = Math.min(54, est);
      }
    }
  }

  const colsXml =
    `<cols>` +
    colWidths
      .map(
        (width, idx) =>
          `<col min="${idx + 1}" max="${idx + 1}" width="${width.toFixed(1)}" customWidth="1"/>`
      )
      .join("") +
    `</cols>`;

  const sheetDataRows: string[] = [];
  for (let r = 0; r < spec.rows.length; r++) {
    const rowCells = spec.rows[r];
    const rowNum = r + 1;
    const isHeaderRow = r === 0 && rowCells.some((c) => c.style === STYLE.HEADER);
    const cellXmlParts: string[] = [];

    for (let c = 0; c < rowCells.length; c++) {
      const cell = rowCells[c];
      const ref = `${colIndexToLetters(c)}${rowNum}`;
      const style = cell.style ?? STYLE.TEXT;

      if (cell.kind === "empty") {
        if (style !== STYLE.TEXT) {
          cellXmlParts.push(`<c r="${ref}" s="${style}"/>`);
        }
        continue;
      }

      if (cell.kind === "num") {
        if (Number.isFinite(cell.value)) {
          cellXmlParts.push(`<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`);
        }
        continue;
      }

      if (cell.kind === "date") {
        const serial = isoDateToExcelSerial(cell.isoDate);
        if (serial !== null) {
          cellXmlParts.push(`<c r="${ref}" s="${STYLE.DATE}"><v>${serial}</v></c>`);
        } else {
          const idx = sharedStrings.intern(cell.isoDate);
          cellXmlParts.push(`<c r="${ref}" t="s" s="${STYLE.TEXT}"><v>${idx}</v></c>`);
        }
        continue;
      }

      // String cell via sharedStrings
      if (cell.value === "" && style === STYLE.TEXT) {
        continue;
      }
      const sstIndex = sharedStrings.intern(cell.value);
      cellXmlParts.push(`<c r="${ref}" t="s" s="${style}"><v>${sstIndex}</v></c>`);
    }

    const rowHeightAttr = isHeaderRow ? ` ht="22" customHeight="1"` : "";
    sheetDataRows.push(
      `<row r="${rowNum}"${rowHeightAttr}>${cellXmlParts.join("")}</row>`
    );
  }

  const lastColLetters = colIndexToLetters(maxCols - 1);
  const dimensionRef = `A1:${lastColLetters}${rowCount}`;

  const tabSelectedAttr = isFirstSheet ? ` tabSelected="1"` : "";
  const paneXml = spec.freezeHeader
    ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>`
    : "";
  const sheetViewsXml =
    `<sheetViews><sheetView${tabSelectedAttr} workbookViewId="0">${paneXml}</sheetView></sheetViews>`;

  const autoFilterXml =
    spec.autoFilter && spec.rows.length >= 1
      ? `<autoFilter ref="A1:${lastColLetters}${rowCount}"/>`
      : "";

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="${dimensionRef}"/>` +
    sheetViewsXml +
    `<sheetFormatPr defaultRowHeight="18"/>` +
    colsXml +
    `<sheetData>${sheetDataRows.join("")}</sheetData>` +
    autoFilterXml +
    `</worksheet>`
  );
}

/** Escapes sheet names for Excel XML and enforces 31-char limit without forbidden chars */
function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim() || `Sheet${index + 1}`;
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned;
}

export function buildXlsxWorkbookBytes(sheets: SheetSpec[]): Uint8Array {
  const sharedStrings = new SharedStringTable();
  const safeSheetNames = sheets.map((s, idx) => sanitizeSheetName(s.name, idx));

  const worksheetXmls = sheets.map((sheet, idx) =>
    buildWorksheetXml(sheet, sharedStrings, idx === 0)
  );
  const stylesXml = buildStylesXml();
  const sharedStringsXml = sharedStrings.toXml();

  const sheetOverridesXml = sheets
    .map(
      (_, idx) =>
        `  <Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("\n");

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
${sheetOverridesXml}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookSheetsXml = safeSheetNames
    .map(
      (name, idx) =>
        `    <sheet name="${escapeXml(name)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`
    )
    .join("\n");

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="15000"/>
  </bookViews>
  <sheets>
${workbookSheetsXml}
  </sheets>
</workbook>`;

  const sheetRelsXml = safeSheetNames
    .map(
      (_, idx) =>
        `  <Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
    )
    .join("\n");

  const stylesRelId = safeSheetNames.length + 1;
  const sstRelId = safeSheetNames.length + 2;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetRelsXml}
  <Relationship Id="rId${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId${sstRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const zipEntries: ZipBinaryEntry[] = [
    { name: "[Content_Types].xml", content: contentTypesXml },
    { name: "_rels/.rels", content: rootRelsXml },
    { name: "xl/workbook.xml", content: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
    { name: "xl/styles.xml", content: stylesXml },
    { name: "xl/sharedStrings.xml", content: sharedStringsXml },
    ...worksheetXmls.map((xml, idx) => ({
      name: `xl/worksheets/sheet${idx + 1}.xml`,
      content: xml,
    })),
  ];

  return createZipArchiveBytes(zipEntries);
}

// =========================================================================
// Date, Time & Description Extractors
// =========================================================================

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
 * Resolves YYYY-MM-DD Date and HH:mm:ss Time cleanly, honoring expectedDate first
 * (consistent with Calendar Engine for scheduled/upcoming records), then date, createdAt, timestamp.
 */
export function extractDateAndTime(
  item: Pick<ExpenseItem, "expectedDate" | "date" | "createdAt" | "timestamp">,
  fallbackMonthKey?: string
): { date: string; time: string; sortTs: number } {
  const rawExpected = typeof item.expectedDate === "string" ? item.expectedDate.trim() : "";
  const expectedMatch = rawExpected.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (expectedMatch) {
    const y = Number(expectedMatch[1]);
    const m = Number(expectedMatch[2]) - 1;
    const day = Number(expectedMatch[3]);
    const localAnchor = new Date(y, m, day, 12, 0, 0);
    return {
      date: rawExpected,
      time: extractTimeFromFallback(item.createdAt, item.timestamp),
      sortTs: localAnchor.getTime(),
    };
  }

  const rawDate = typeof item.date === "string" ? item.date.trim() : "";

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

export function flattenText(text?: string): string {
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ");
}

export function extractExpenseDescriptionAndNotes(item: ExpenseItem): {
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

function translateElectricitySource(source?: ElectricityRecord["source"]): string {
  switch (source) {
    case "calculator":
      return "Калкулатор";
    case "manual":
      return "Ръчно";
    case "receipt":
      return "Касова бележка";
    case "imported":
      return "Импортирано";
    default:
      return "Калкулатор";
  }
}

// =========================================================================
// Sheet Collectors
// =========================================================================

function buildExpensesSheet(monthlyRecords: Record<string, MonthlyRecord>): {
  spec: SheetSpec;
  count: number;
  realizedCount: number;
  upcomingCount: number;
  realizedFixedTotal: number;
  realizedAdditionalTotal: number;
  upcomingTotal: number;
} {
  interface Collected {
    sortTs: number;
    row: CellValue[];
  }

  const collected: Collected[] = [];
  let realizedCount = 0;
  let upcomingCount = 0;
  let realizedFixedTotal = 0;
  let realizedAdditionalTotal = 0;
  let upcomingTotal = 0;

  for (const [monthKey, record] of Object.entries(monthlyRecords || {})) {
    if (!record?.expenses) continue;

    const pushExpenseItem = (item: ExpenseItem, bucket: "fixed" | "additional") => {
      const { date, time, sortTs } = extractDateAndTime(item, monthKey);
      const repeat = resolveItemRepeat(item);
      const isRecurring = bucket === "fixed" || isRepeatingFrequency(repeat);
      const completed = isRecordCompleted(item);
      const amount = Number(item.amount) || 0;

      if (completed) {
        realizedCount += 1;
        if (bucket === "fixed") {
          realizedFixedTotal += amount;
        } else {
          realizedAdditionalTotal += amount;
        }
      } else {
        upcomingCount += 1;
        upcomingTotal += amount;
      }

      const typeLabel = isRecurring ? "Повтарящ се" : "Допълнителен";
      const completedLabel = completed ? "Да" : "Не";
      const recurringLabel = repeat === "never" ? "Не" : formatRepeatLabel(repeat, item);
      const { description, notes } = extractExpenseDescriptionAndNotes(item);

      collected.push({
        sortTs,
        row: [
          dateCell(date),
          strCell(time),
          strCell(monthKey),
          strCell(typeLabel),
          strCell(item.categoryName || ""),
          strCell(item.budgetCategoryName || ""),
          strCell(description),
          currencyCell(amount),
          strCell(completedLabel),
          strCell(recurringLabel),
          strCell(formatLocationExportLabel(item.location)),
          strCell(notes),
        ],
      });
    };

    const fixedRaw = record.expenses.fixed_expenses as unknown;
    if (Array.isArray(fixedRaw)) {
      fixedRaw.forEach((item) => {
        if (item) pushExpenseItem(item as ExpenseItem, "fixed");
      });
    } else if (fixedRaw && typeof fixedRaw === "object") {
      const legacy = fixedRaw as Record<string, unknown>;
      const legacyLabels: Array<[string, string]> = [
        ["credit_eur", "Кредит"],
        ["phone_eur", "Телефон"],
        ["internet_eur", "Интернет"],
      ];
      legacyLabels.forEach(([key, label]) => {
        const val = Number(legacy[key] || 0);
        if (val > 0) {
          realizedCount += 1;
          realizedFixedTotal += val;
          const { date, sortTs } = extractDateAndTime(
            { date: "", createdAt: record.meta?.generated_at },
            monthKey
          );
          collected.push({
            sortTs,
            row: [
              dateCell(date),
              strCell(""),
              strCell(monthKey),
              strCell("Повтарящ се"),
              strCell(label),
              strCell(""),
              strCell(label),
              currencyCell(val),
              strCell("Да"),
              strCell("Месечно"),
              strCell(""),
              strCell(""),
            ],
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

  const headerRow: CellValue[] = [
    headerCell("Date"),
    headerCell("Time"),
    headerCell("Month"),
    headerCell("Type"),
    headerCell("Category"),
    headerCell("Budget Category"),
    headerCell("Description"),
    headerCell("Amount (EUR)"),
    headerCell("Completed"),
    headerCell("Recurring"),
    headerCell("Location"),
    headerCell("Notes"),
  ];

  return {
    spec: {
      name: "Expenses",
      rows: [headerRow, ...collected.map((c) => c.row)],
      freezeHeader: true,
      autoFilter: true,
      minColWidths: [13, 10, 16, 15, 18, 18, 28, 15, 12, 16, 28, 36],
    },
    count: collected.length,
    realizedCount,
    upcomingCount,
    realizedFixedTotal: round2(realizedFixedTotal),
    realizedAdditionalTotal: round2(realizedAdditionalTotal),
    upcomingTotal: round2(upcomingTotal),
  };
}

function buildIncomesSheet(monthlyRecords: Record<string, MonthlyRecord>): {
  spec: SheetSpec;
  count: number;
  realizedCount: number;
  upcomingCount: number;
  realizedTotal: number;
  upcomingTotal: number;
} {
  interface Collected {
    sortTs: number;
    row: CellValue[];
  }

  const collected: Collected[] = [];
  const seenIds = new Set<string>();
  let realizedCount = 0;
  let upcomingCount = 0;
  let realizedTotal = 0;
  let upcomingTotal = 0;

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
      const isRecurring = Boolean(inc.isFixedItem || isRepeatingFrequency(repeat));
      const completed = isRecordCompleted(inc);
      const amount = Number(inc.amount) || 0;

      if (completed) {
        realizedCount += 1;
        realizedTotal += amount;
      } else {
        upcomingCount += 1;
        upcomingTotal += amount;
      }

      const typeLabel = isRecurring ? "Повтарящ се" : "Допълнителен";
      const completedLabel = completed ? "Да" : "Не";
      const recurringLabel = repeat === "never" ? "Не" : formatRepeatLabel(repeat, inc);
      const notes = flattenText(inc.note);
      const firstLineNote = inc.note
        ?.split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean);
      const description =
        firstLineNote ||
        (isRecurring ? "Повтарящ се приход" : "Допълнителен приход");

      collected.push({
        sortTs,
        row: [
          dateCell(date),
          strCell(time),
          strCell(monthKey),
          strCell(typeLabel),
          strCell(inc.categoryName || ""),
          strCell(description),
          currencyCell(amount),
          strCell(completedLabel),
          strCell(recurringLabel),
          strCell(formatLocationExportLabel(inc.location)),
          strCell(notes),
        ],
      });
    });
  }

  collected.sort((a, b) => a.sortTs - b.sortTs);

  const headerRow: CellValue[] = [
    headerCell("Date"),
    headerCell("Time"),
    headerCell("Month"),
    headerCell("Type"),
    headerCell("Category"),
    headerCell("Description"),
    headerCell("Amount (EUR)"),
    headerCell("Completed"),
    headerCell("Recurring"),
    headerCell("Location"),
    headerCell("Notes"),
  ];

  return {
    spec: {
      name: "Incomes",
      rows: [headerRow, ...collected.map((c) => c.row)],
      freezeHeader: true,
      autoFilter: true,
      minColWidths: [13, 10, 16, 15, 18, 28, 15, 12, 16, 28, 32],
    },
    count: collected.length,
    realizedCount,
    upcomingCount,
    realizedTotal: round2(realizedTotal),
    upcomingTotal: round2(upcomingTotal),
  };
}

function buildSavingsSheet(
  savings: BackupData["data"]["savings"],
  goals: SavingsGoal[],
  monthlyRecords: Record<string, MonthlyRecord>
): {
  spec: SheetSpec;
  count: number;
  goalsCount: number;
  allocationSummary: ReturnType<typeof computeSavingsAllocationSummary>;
} {
  interface Collected {
    sortTs: number;
    row: CellValue[];
  }

  const collected: Collected[] = (savings || [])
    .filter(Boolean)
    .map((item) => {
      const { date, time, sortTs } = extractDateAndTime(item);
      const isWithdrawal = item.type === "expense";
      const actionLabel = isWithdrawal ? "Теглене" : "Внасяне";
      const category = item.categoryName || "Спестявания";
      const signedAmount = isWithdrawal
        ? -Math.abs(Number(item.amount || 0))
        : Math.abs(Number(item.amount || 0));

      return {
        sortTs,
        row: [
          dateCell(date),
          strCell(time),
          strCell(actionLabel),
          strCell(category),
          strCell(`${actionLabel} - ${category}`),
          currencyCell(signedAmount),
          strCell(flattenText(item.note)),
        ],
      };
    });

  collected.sort((a, b) => a.sortTs - b.sortTs);

  const allocationSummary = computeSavingsAllocationSummary(
    savings || [],
    goals || [],
    monthlyRecords
  );

  const ledgerHeader: CellValue[] = [
    headerCell("Date"),
    headerCell("Time"),
    headerCell("Action"),
    headerCell("Category"),
    headerCell("Description"),
    headerCell("Amount (EUR)"),
    headerCell("Notes"),
  ];

  const rows: CellValue[][] = [ledgerHeader, ...collected.map((c) => c.row)];

  // Append Savings Goals ("Jars") allocation section below the ledger
  rows.push([]);
  rows.push([sectionCell("Спестовни цели (Касички) и разпределение")]);
  rows.push([
    boldTextCell("Общо спестявания (EUR)"),
    currencyCell(allocationSummary.totalSavings, true),
    boldTextCell("Разпределени в цели (EUR)"),
    currencyCell(allocationSummary.totalAllocated, true),
    boldTextCell("Неразпределени (EUR)"),
    currencyCell(allocationSummary.unallocatedSavings, true),
  ]);

  if (goals.length > 0) {
    rows.push([]);
    rows.push([
      headerCell("Goal Name"),
      headerCell("Target (EUR)"),
      headerCell("Allocated (EUR)"),
      headerCell("Remaining (EUR)"),
      headerCell("Progress (%)"),
      headerCell("Emergency Fund"),
      headerCell("Status"),
      headerCell("Description"),
    ]);

    const sortedGoals = [...goals].sort((a, b) => {
      if (Boolean(a.archived) !== Boolean(b.archived)) {
        return a.archived ? 1 : -1;
      }
      if (Boolean(a.isEmergencyFund) !== Boolean(b.isEmergencyFund)) {
        return a.isEmergencyFund ? -1 : 1;
      }
      return b.allocatedAmount - a.allocatedAmount;
    });

    for (const goal of sortedGoals) {
      const remaining = Math.max(0, round2(goal.targetAmount - goal.allocatedAmount));
      const pctRatio = getGoalProgressPercent(goal) / 100;
      rows.push([
        strCell(goal.name),
        currencyCell(goal.targetAmount),
        currencyCell(goal.allocatedAmount),
        currencyCell(remaining),
        percentFromRatioCell(pctRatio),
        strCell(goal.isEmergencyFund ? "Да" : "Не"),
        strCell(goal.archived ? "Архивирана" : "Активна"),
        strCell(flattenText(goal.description)),
      ]);
    }
  }

  return {
    spec: {
      name: "Savings",
      rows,
      freezeHeader: true,
      autoFilter: false,
      minColWidths: [18, 14, 16, 18, 28, 16, 28, 26],
    },
    count: collected.length,
    goalsCount: goals.length,
    allocationSummary,
  };
}

function buildElectricitySheet(records: ElectricityRecord[]): {
  spec: SheetSpec;
  count: number;
  totalCost: number;
  totalConsumptionKwh: number;
} {
  interface Collected {
    sortTs: number;
    row: CellValue[];
  }

  let totalCost = 0;
  let totalConsumptionKwh = 0;

  const collected: Collected[] = (records || [])
    .filter(Boolean)
    .map((rec) => {
      const { date, sortTs } = extractDateAndTime({
        date: rec.createdAt,
        createdAt: rec.createdAt,
      });
      const yearInt = parseInt(rec.year, 10);
      totalCost += Number(rec.totalCost) || 0;
      totalConsumptionKwh += Number(rec.consumption) || 0;

      return {
        sortTs,
        row: [
          dateCell(date),
          strCell(rec.periodLabel || `${rec.month} ${rec.year}`),
          strCell(rec.month || ""),
          Number.isFinite(yearInt) ? intCell(yearInt) : strCell(rec.year || ""),
          currencyCell(Number(rec.prevT1) || 0),
          currencyCell(Number(rec.currT1) || 0),
          currencyCell(Number(rec.consT1) || 0),
          currencyCell(Number(rec.prevT2) || 0),
          currencyCell(Number(rec.currT2) || 0),
          currencyCell(Number(rec.consT2) || 0),
          currencyCell(Number(rec.consumption) || 0),
          numCell(round5(Number(rec.priceT1) || 0), STYLE.PRICE_5DEC),
          numCell(round5(Number(rec.priceT2) || 0), STYLE.PRICE_5DEC),
          currencyCell(Number(rec.costEm1) || 0),
          currencyCell(Number(rec.em2Remainder) || 0),
          currencyCell(Number(rec.totalCost) || 0),
          strCell(translateElectricitySource(rec.source)),
          strCell(flattenText(rec.note)),
        ],
      };
    });

  collected.sort((a, b) => a.sortTs - b.sortTs);

  const headerRow: CellValue[] = [
    headerCell("Date"),
    headerCell("Period"),
    headerCell("Month"),
    headerCell("Year"),
    headerCell("Prev T1 (kWh)"),
    headerCell("Curr T1 (kWh)"),
    headerCell("Cons T1 (kWh)"),
    headerCell("Prev T2 (kWh)"),
    headerCell("Curr T2 (kWh)"),
    headerCell("Cons T2 (kWh)"),
    headerCell("Total Cons EM1 (kWh)"),
    headerCell("Price T1 (EUR/kWh)"),
    headerCell("Price T2 (EUR/kWh)"),
    headerCell("Cost EM1 (EUR)"),
    headerCell("EM2 Remainder (EUR)"),
    headerCell("Total Invoice (EUR)"),
    headerCell("Source"),
    headerCell("Notes"),
  ];

  return {
    spec: {
      name: "Electricity",
      rows: [headerRow, ...collected.map((c) => c.row)],
      freezeHeader: true,
      autoFilter: true,
      minColWidths: [13, 18, 13, 8, 14, 14, 14, 14, 14, 14, 19, 17, 17, 15, 18, 18, 16, 26],
    },
    count: collected.length,
    totalCost: round2(totalCost),
    totalConsumptionKwh: round2(totalConsumptionKwh),
  };
}

function buildCategoriesSheet(
  expenseCategories: ExpenseCategory[],
  incomeCategories: ExpenseCategory[]
): {
  spec: SheetSpec;
  count: number;
} {
  const rows: CellValue[][] = [
    [
      headerCell("ID"),
      headerCell("Type"),
      headerCell("Name"),
      headerCell("Icon"),
      headerCell("Origin"),
    ],
  ];

  const appendList = (list: ExpenseCategory[], typeLabel: string) => {
    for (const cat of list || []) {
      if (!cat) continue;
      rows.push([
        strCell(cat.id),
        strCell(typeLabel),
        strCell(cat.name),
        strCell(cat.iconName),
        strCell(cat.isCustom ? "Потребителска" : "Системна"),
      ]);
    }
  };

  appendList(expenseCategories, "Разход");
  appendList(incomeCategories, "Приход");

  return {
    spec: {
      name: "Categories",
      rows,
      freezeHeader: true,
      autoFilter: true,
      minColWidths: [18, 12, 24, 18, 16],
    },
    count: rows.length - 1,
  };
}

function translateBudgetStatus(status: "green" | "yellow" | "red"): string {
  switch (status) {
    case "red":
      return "Надвишен";
    case "yellow":
      return "Близо до лимита";
    default:
      return "В норма";
  }
}

function resolveEvaluatedMonthKey(monthlyRecords: Record<string, MonthlyRecord>): string {
  const currentBg = getCurrentMonthBulgarian();
  if (monthlyRecords[currentBg]) return currentBg;

  const keys = Object.keys(monthlyRecords || {});
  if (keys.length === 0) return currentBg;

  keys.sort((a, b) => {
    const pa = parseMonthKeyToYearMonth(a);
    const pb = parseMonthKeyToYearMonth(b);
    const av = pa ? pa.year * 12 + pa.monthIndex : -1;
    const bv = pb ? pb.year * 12 + pb.monthIndex : -1;
    return av - bv;
  });

  return keys[keys.length - 1];
}

function buildBudgetsSheet(monthlyRecords: Record<string, MonthlyRecord>): {
  spec: SheetSpec;
  categoryBudgetsCount: number;
  evaluatedMonthKey: string;
} {
  const { totalMonthlyBudget, categoryBudgets } = loadBudgets();
  const evaluatedMonthKey = resolveEvaluatedMonthKey(monthlyRecords);
  const calc = calculateAllBudgetsStatus(
    monthlyRecords[evaluatedMonthKey],
    totalMonthlyBudget,
    categoryBudgets
  );

  const rows: CellValue[][] = [
    [
      headerCell("Budget ID"),
      headerCell("Budget Category"),
      headerCell("Linked Category ID"),
      headerCell("Month Evaluated"),
      headerCell("Monthly Limit (EUR)"),
      headerCell("Spent Realized (EUR)"),
      headerCell("Remaining (EUR)"),
      headerCell("Used (%)"),
      headerCell("Status"),
    ],
    // Overall Monthly Budget Row
    [
      boldTextCell("total_monthly"),
      boldTextCell("Общ месечен бюджет"),
      strCell("all"),
      strCell(evaluatedMonthKey),
      currencyCell(calc.totalMonthlyLimit, true),
      currencyCell(calc.totalSpent, true),
      currencyCell(calc.totalRemaining, true),
      percentFromRatioCell(
        calc.totalMonthlyLimit > 0 ? calc.totalSpent / calc.totalMonthlyLimit : 0
      ),
      strCell(translateBudgetStatus(calc.totalStatus)),
    ],
  ];

  for (const item of calc.categoryStatuses) {
    rows.push([
      strCell(item.budget.id),
      strCell(item.budget.categoryName),
      strCell(getBudgetLinkedCategoryIds(item.budget).join(", ")),
      strCell(evaluatedMonthKey),
      currencyCell(item.limit),
      currencyCell(item.spent),
      currencyCell(item.remaining),
      percentFromRatioCell(item.limit > 0 ? item.spent / item.limit : 0),
      strCell(translateBudgetStatus(item.status)),
    ]);
  }

  return {
    spec: {
      name: "Budgets",
      rows,
      freezeHeader: true,
      autoFilter: true,
      minColWidths: [16, 26, 18, 18, 19, 20, 17, 12, 18],
    },
    categoryBudgetsCount: calc.categoryStatuses.length,
    evaluatedMonthKey,
  };
}

function buildSummarySheet(params: {
  snapshot: BackupData;
  evaluatedMonthKey: string;
  expensesMeta: {
    count: number;
    realizedCount: number;
    upcomingCount: number;
    realizedFixedTotal: number;
    realizedAdditionalTotal: number;
    upcomingTotal: number;
  };
  incomesMeta: {
    count: number;
    realizedCount: number;
    upcomingCount: number;
    realizedTotal: number;
    upcomingTotal: number;
  };
  savingsMeta: {
    count: number;
    goalsCount: number;
    allocationSummary: ReturnType<typeof computeSavingsAllocationSummary>;
  };
  electricityMeta: {
    count: number;
    totalCost: number;
    totalConsumptionKwh: number;
  };
  categoriesCount: number;
  budgetsCount: number;
}): SheetSpec {
  const {
    snapshot,
    evaluatedMonthKey,
    expensesMeta,
    incomesMeta,
    savingsMeta,
    electricityMeta,
    categoriesCount,
    budgetsCount,
  } = params;

  const monthlyRecords = snapshot.data.expenses?.monthlyRecords || {};
  const totalRealizedExpenses = round2(
    expensesMeta.realizedFixedTotal + expensesMeta.realizedAdditionalTotal
  );
  const netRealizedBalance = round2(incomesMeta.realizedTotal - totalRealizedExpenses);
  const exportIsoDate = formatLocalDate(new Date());

  const rows: CellValue[][] = [];

  // Section 1: Metadata
  rows.push([sectionCell("Обобщение на експорта — Budget Force 365")]);
  rows.push([headerCell("Показател"), headerCell("Стойност")]);
  rows.push([boldTextCell("Приложение"), strCell(snapshot.appName || "Budget Force 365")]);
  rows.push([boldTextCell("Дата на експорт"), dateCell(exportIsoDate)]);
  rows.push([
    boldTextCell("Потребителски профил"),
    strCell(snapshot.ownerEmail || "Локален профил / Гост"),
  ]);
  rows.push([boldTextCell("Оценен активен месец (Бюджети)"), strCell(evaluatedMonthKey)]);
  rows.push([
    boldTextCell("Обхванати месеци"),
    intCell(Object.keys(monthlyRecords).length),
  ]);

  // Section 2: Financial KPIs
  rows.push([]);
  rows.push([
    sectionCell(
      "Финансови показатели (Само изпълнени / реализирани операции в общите суми)"
    ),
  ]);
  rows.push([headerCell("Показател"), headerCell("Стойност"), headerCell("Мерна единица")]);
  rows.push([
    boldTextCell("Реализирани приходи (Общо)"),
    currencyCell(incomesMeta.realizedTotal, true),
    strCell("EUR"),
  ]);
  rows.push([
    strCell("Предстоящи приходи (Планирани)"),
    currencyCell(incomesMeta.upcomingTotal),
    strCell("EUR"),
  ]);
  rows.push([
    strCell("Реализирани повтарящи се разходи"),
    currencyCell(expensesMeta.realizedFixedTotal),
    strCell("EUR"),
  ]);
  rows.push([
    strCell("Реализирани допълнителни разходи"),
    currencyCell(expensesMeta.realizedAdditionalTotal),
    strCell("EUR"),
  ]);
  rows.push([
    boldTextCell("Реализирани разходи (Общо)"),
    currencyCell(totalRealizedExpenses, true),
    strCell("EUR"),
  ]);
  rows.push([
    strCell("Предстоящи разходи (Планирани)"),
    currencyCell(expensesMeta.upcomingTotal),
    strCell("EUR"),
  ]);
  rows.push([
    boldTextCell("Реализиран нетен баланс (Приходи - Разходи)"),
    currencyCell(netRealizedBalance, true),
    strCell("EUR"),
  ]);
  rows.push([
    boldTextCell("Спестявания — Общ баланс"),
    currencyCell(savingsMeta.allocationSummary.totalSavings, true),
    strCell("EUR"),
  ]);
  rows.push([
    strCell("Спестявания — Разпределени по цели (Касички)"),
    currencyCell(savingsMeta.allocationSummary.totalAllocated),
    strCell("EUR"),
  ]);
  rows.push([
    strCell("Спестявания — Неразпределен остатък"),
    currencyCell(savingsMeta.allocationSummary.unallocatedSavings),
    strCell("EUR"),
  ]);
  rows.push([
    strCell("Електроенергия — Общо фактурирано"),
    currencyCell(electricityMeta.totalCost),
    strCell("EUR"),
  ]);
  rows.push([
    strCell("Електроенергия — Обща консумация"),
    currencyCell(electricityMeta.totalConsumptionKwh),
    strCell("kWh"),
  ]);

  // Section 3: Module Record Counts
  rows.push([]);
  rows.push([sectionCell("Брой записи по работни листове")]);
  rows.push([headerCell("Модул / Лист"), headerCell("Общо записи"), headerCell("Детайли")]);
  rows.push([
    boldTextCell("Expenses (Разходи)"),
    intCell(expensesMeta.count),
    strCell(`Изпълнени: ${expensesMeta.realizedCount} | Предстоящи: ${expensesMeta.upcomingCount}`),
  ]);
  rows.push([
    boldTextCell("Incomes (Приходи)"),
    intCell(incomesMeta.count),
    strCell(`Изпълнени: ${incomesMeta.realizedCount} | Предстоящи: ${incomesMeta.upcomingCount}`),
  ]);
  rows.push([
    boldTextCell("Savings (Спестявания и цели)"),
    intCell(savingsMeta.count),
    strCell(`Спестовни цели (Касички): ${savingsMeta.goalsCount}`),
  ]);
  rows.push([
    boldTextCell("Electricity (Електроенергия)"),
    intCell(electricityMeta.count),
    strCell("История на сметки и показания"),
  ]);
  rows.push([
    boldTextCell("Categories (Категории)"),
    intCell(categoriesCount),
    strCell("Разходни и приходни категории"),
  ]);
  rows.push([
    boldTextCell("Budgets (Бюджети)"),
    intCell(budgetsCount + 1),
    strCell(`Общ месечен бюджет + ${budgetsCount} категорийни бюджета`),
  ]);

  // Section 4: Chronological Monthly Breakdown
  const sortedMonthEntries = Object.entries(monthlyRecords).sort(([a], [b]) => {
    const pa = parseMonthKeyToYearMonth(a);
    const pb = parseMonthKeyToYearMonth(b);
    const av = pa ? pa.year * 12 + pa.monthIndex : 0;
    const bv = pb ? pb.year * 12 + pb.monthIndex : 0;
    return av - bv;
  });

  if (sortedMonthEntries.length > 0) {
    rows.push([]);
    rows.push([sectionCell("Месечна финансова разбивка (Хронологично)")]);
    rows.push([
      headerCell("Month"),
      headerCell("Realized Income (EUR)"),
      headerCell("Upcoming Income (EUR)"),
      headerCell("Recurring Expenses (EUR)"),
      headerCell("Additional Expenses (EUR)"),
      headerCell("Total Realized Expenses (EUR)"),
      headerCell("Upcoming Expenses (EUR)"),
      headerCell("Net Balance (EUR)"),
    ]);

    for (const [monthKey, record] of sortedMonthEntries) {
      let mRealizedIncome = 0;
      let mUpcomingIncome = 0;
      for (const inc of record.incomes || []) {
        if (!inc || inc.type === "expense") continue;
        const amt = Number(inc.amount) || 0;
        if (isRecordCompleted(inc)) mRealizedIncome += amt;
        else mUpcomingIncome += amt;
      }

      let mFixedRealized = 0;
      let mAdditionalRealized = 0;
      let mUpcomingExp = 0;

      const fixedRaw = record.expenses?.fixed_expenses as unknown;
      if (Array.isArray(fixedRaw)) {
        for (const exp of fixedRaw as ExpenseItem[]) {
          if (!exp) continue;
          const amt = Number(exp.amount) || 0;
          if (isRecordCompleted(exp)) mFixedRealized += amt;
          else mUpcomingExp += amt;
        }
      } else if (fixedRaw && typeof fixedRaw === "object") {
        const leg = fixedRaw as Record<string, unknown>;
        mFixedRealized +=
          (Number(leg.credit_eur) || 0) +
          (Number(leg.phone_eur) || 0) +
          (Number(leg.internet_eur) || 0);
      }

      for (const exp of record.expenses?.additional_expenses || []) {
        if (!exp) continue;
        const amt = Number(exp.amount) || 0;
        if (isRecordCompleted(exp)) mAdditionalRealized += amt;
        else mUpcomingExp += amt;
      }

      const mTotalRealizedExp = round2(mFixedRealized + mAdditionalRealized);
      const mNet = round2(mRealizedIncome - mTotalRealizedExp);

      rows.push([
        boldTextCell(monthKey),
        currencyCell(mRealizedIncome),
        currencyCell(mUpcomingIncome),
        currencyCell(mFixedRealized),
        currencyCell(mAdditionalRealized),
        currencyCell(mTotalRealizedExp, true),
        currencyCell(mUpcomingExp),
        currencyCell(mNet, true),
      ]);
    }
  }

  return {
    name: "Summary",
    rows,
    freezeHeader: false,
    autoFilter: false,
    minColWidths: [42, 20, 22, 22, 22, 24, 22, 18],
  };
}

// =========================================================================
// Workbook Builder & Browser Download
// =========================================================================

export function generateExcelWorkbookData(owner?: {
  uid?: string | null;
  email?: string | null;
}): {
  bytes: Uint8Array;
  summary: ExcelExportSummary;
} {
  const snapshot = gatherApplicationData(owner);
  const monthlyRecords = snapshot.data.expenses?.monthlyRecords || {};
  const savings = snapshot.data.savings || [];
  const electricityHistory = snapshot.data.electricityHistory || [];

  const activeUid = owner?.uid ?? undefined;
  const savingsGoals = loadSavingsGoals(activeUid);
  const expenseCategories = loadStoredCategories();
  const incomeCategories = loadStoredIncomeCategories();

  const expensesSheet = buildExpensesSheet(monthlyRecords);
  const incomesSheet = buildIncomesSheet(monthlyRecords);
  const savingsSheet = buildSavingsSheet(savings, savingsGoals, monthlyRecords);
  const electricitySheet = buildElectricitySheet(electricityHistory);
  const categoriesSheet = buildCategoriesSheet(expenseCategories, incomeCategories);
  const budgetsSheet = buildBudgetsSheet(monthlyRecords);
  const summarySheet = buildSummarySheet({
    snapshot,
    evaluatedMonthKey: budgetsSheet.evaluatedMonthKey,
    expensesMeta: expensesSheet,
    incomesMeta: incomesSheet,
    savingsMeta: savingsSheet,
    electricityMeta: electricitySheet,
    categoriesCount: categoriesSheet.count,
    budgetsCount: budgetsSheet.categoryBudgetsCount,
  });

  const sheets: SheetSpec[] = [
    expensesSheet.spec,
    incomesSheet.spec,
    savingsSheet.spec,
    electricitySheet.spec,
    categoriesSheet.spec,
    budgetsSheet.spec,
    summarySheet,
  ];

  const bytes = buildXlsxWorkbookBytes(sheets);

  return {
    bytes,
    summary: {
      filename: EXCEL_EXPORT_FILENAME,
      sheets: sheets.map((s) => s.name),
      expensesCount: expensesSheet.count,
      incomesCount: incomesSheet.count,
      savingsCount: savingsSheet.count,
      savingsGoalsCount: savingsSheet.goalsCount,
      electricityCount: electricitySheet.count,
      categoriesCount: categoriesSheet.count,
      budgetsCount: budgetsSheet.categoryBudgetsCount + 1,
    },
  };
}

export function createExcelWorkbookBlob(owner?: {
  uid?: string | null;
  email?: string | null;
}): {
  blob: Blob;
  summary: ExcelExportSummary;
} {
  const { bytes, summary } = generateExcelWorkbookData(owner);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  return { blob, summary };
}

/**
 * Generates and downloads `BudgetForce365_Export.xlsx` containing 7 separate worksheets:
 * Expenses, Incomes, Savings, Electricity, Categories, Budgets, Summary.
 */
export function exportExcelWorkbook(owner?: {
  uid?: string | null;
  email?: string | null;
}): ExcelExportSummary {
  const { blob, summary } = createExcelWorkbookBlob(owner);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = summary.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return summary;
}
