import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera,
  Upload,
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  FileText,
  Calendar,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
  Clock,
  ArrowRight,
  Info,
  Layers,
  Store,
  ZoomIn,
  ZoomOut,
  ListChecks,
  CheckSquare,
  Square,
  Plus,
  Pencil,
  Trash2,
  Save,
} from "lucide-react";
import {
  ExpenseCategory,
  ExpenseItem,
  ReceiptItemDetail,
  BudgetConfig,
  TransactionLocation,
} from "@/types";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { LocationPickerField } from "@/components/common/LocationPickerField";
import { normalizeLocation } from "@/utils/locationUtils";
import { AVAILABLE_ICONS_MAP, getCategoryBadgeClasses } from "@/utils/categoryStorage";
import {
  parseReceiptTextLocally,
  ParsedReceiptData,
  formatReceiptNotes,
  validateReceiptTotals,
  toCyrillicMatchForm,
  toLatinMatchForm,
  isValidCalendarDate,
  extractReceiptAddressFromText,
  reconcileReceiptItemQuantities,
} from "@/utils/receiptParser";
import { runClientOcr } from "@/utils/tesseractOcr";
import {
  parseExpenseNote,
  splitReceiptItemsWithSelection,
  mergeAdjacentSplitReceiptItems,
} from "@/utils/expenseFormatter";
import { loadBudgets, findMatchingBudgetCategoryId } from "@/utils/budgetStorage";
import { useI18n } from "@/i18n";
import { translateBudgetName, translateCategoryName } from "@/i18n/helpers";
import {
  GEMINI_RECEIPT_MODELS,
  type GeminiProgressEvent,
} from "@shared/receiptOcrGemini";

export interface OCRReceiptResult {
  merchantName: string;
  date: string;
  totalAmount: number;
  currency?: string;
  suggestedCategory?: string;
  items?: Array<{ name: string; price: number; quantity?: number }>;
  notesFormatted?: string;
  rawText: string;
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
}

interface DebugLog {
  step: "ocr_text" | "parsed_total" | "parsed_merchant" | "parsed_date" | "parsed_items" | "gemini_res" | "error" | "expense";
}

type OcrPipelineStage =
  | "IMAGE_LOAD"
  | "IMAGE_CONVERSION"
  | "IMAGE_RESIZE"
  | "BASE64_ENCODING"
  | "REQUEST_CREATION"
  | "REQUEST_SEND"
  | "WORKER_RECEIVED"
  | "WORKER_PARSE"
  | "GEMINI_REQUEST"
  | "GEMINI_RESPONSE"
  | "JSON_PARSE"
  | "CLIENT_RESPONSE";

interface ScanReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  currentMonth: string;
  onExpenseCreated: (expense: ExpenseItem) => void;
  initialMode?: "camera" | "upload";
}

interface ImageQualityDiagnostics {
  platform: "Mobile" | "Desktop";
  originalFormat: string;
  originalMimeType: string;
  originalWidth: number;
  originalHeight: number;
  originalSizeBytes: number;
  exifOrientation: number;
  ocrFormat: string;
  ocrWidth: number;
  ocrHeight: number;
  ocrSizeBytes: number;
  aiTransportWidth: number;
  aiTransportHeight: number;
  aiCompressedSizeBytes: number;
  base64SizeChars: number;
  lastCompletedStage: OcrPipelineStage;
  usedOriginalFile: boolean;
  wasResized: boolean;
  wasRecompressed: boolean;
  canvasConversionMethod: string;
}

interface PreparedReceiptImage {
  ocrSource: File | Blob;
  base64: string;
  previewUrl: string;
  previewObjectUrl?: string;
  mimeType: string;
  originalSize: number;
  ocrSizeBytes: number;
  compressedSizeBytes: number;
  base64SizeChars: number;
  aiWidth: number;
  aiHeight: number;
  dimensions: string;
  diagnostics: ImageQualityDiagnostics;
}

function detectPlatformType(): "Mobile" | "Desktop" {
  if (typeof navigator === "undefined") return "Desktop";
  const ua = navigator.userAgent || "";
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  return isMobileUa ? "Mobile" : "Desktop";
}

function detectImageFormatLabel(file: File): string {
  const mime = (file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (mime.includes("heic") || ext === "heic") return "HEIC";
  if (mime.includes("heif") || ext === "heif") return "HEIF";
  if (mime.includes("jpeg") || mime.includes("jpg") || ext === "jpg" || ext === "jpeg") return "JPEG";
  if (mime.includes("png") || ext === "png") return "PNG";
  if (mime.includes("webp") || ext === "webp") return "WEBP";
  if (mime.includes("bmp") || ext === "bmp") return "BMP";
  if (mime.includes("gif") || ext === "gif") return "GIF";
  return mime ? mime.replace("image/", "").toUpperCase() : ext.toUpperCase() || "UNKNOWN";
}

// Read JPEG EXIF Orientation tag (1..8) from the first 128 KB without loading/altering the whole file
async function readJpegExifOrientation(file: File): Promise<number> {
  try {
    const buffer = await file.slice(0, 131072).arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 12 || view.getUint16(0, false) !== 0xffd8) {
      return 1;
    }
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xffe1) {
        if (offset + 8 > view.byteLength) return 1;
        // Skip APP1 length (2 bytes) and check "Exif\0\0"
        if (view.getUint32(offset + 2, false) !== 0x45786966) {
          return 1;
        }
        const tiffStart = offset + 8;
        if (tiffStart + 8 > view.byteLength) return 1;
        const little = view.getUint16(tiffStart, false) === 0x4949;
        const firstIfdOffset = view.getUint32(tiffStart + 4, little);
        const ifdStart = tiffStart + firstIfdOffset;
        if (ifdStart + 2 > view.byteLength) return 1;
        const entries = view.getUint16(ifdStart, little);
        for (let i = 0; i < entries; i++) {
          const entryOffset = ifdStart + 2 + i * 12;
          if (entryOffset + 12 > view.byteLength) break;
          if (view.getUint16(entryOffset, little) === 0x0112) {
            const val = view.getUint16(entryOffset + 8, little);
            return val >= 1 && val <= 8 ? val : 1;
          }
        }
        return 1;
      } else if ((marker & 0xff00) !== 0xff00) {
        break;
      } else {
        if (offset + 2 > view.byteLength) break;
        const segLen = view.getUint16(offset, false);
        if (segLen < 2) break;
        offset += segLen;
      }
    }
  } catch {
    // Ignore EXIF read failures cleanly
  }
  return 1;
}

function readFileAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Неуспешно четене на файла от устройството."));
    reader.readAsDataURL(blob);
  });
}

function canvasToLosslessPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

// Preserve original uploaded image & resolution for OCR (never downscale or lossy-recompress before OCR)
async function prepareReceiptImageWithTimeout(
  file: File,
  timeoutMs: number = 10000
): Promise<PreparedReceiptImage> {
  const platform = detectPlatformType();
  const originalFormat = detectImageFormatLabel(file);
  const exifOrientation =
    originalFormat === "JPEG" ? await readJpegExifOrientation(file) : 1;
  const isTesseractNativeFormat = ["JPEG", "PNG", "WEBP", "BMP", "GIF"].includes(originalFormat);

  return new Promise((resolve, reject) => {
    let hasFinished = false;
    let prepStage: OcrPipelineStage = "IMAGE_LOAD";
    const objectUrl = URL.createObjectURL(file);
    const timer = setTimeout(() => {
      if (!hasFinished) {
        hasFinished = true;
        URL.revokeObjectURL(objectUrl);
        const timeoutErr: any = new Error(`[${prepStage}] Обработката на изображението отне твърде много време (Timeout).`);
        timeoutErr.stage = prepStage;
        reject(timeoutErr);
      }
    }, timeoutMs);

    const img = new Image();

    img.onerror = () => {
      if (hasFinished) return;
      hasFinished = true;
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      if (originalFormat === "HEIC" || originalFormat === "HEIF") {
        const heicErr: any = new Error(
          "Форматът HEIC/HEIF не се поддържа директно от този браузър. Моля, изберете JPG/PNG снимка или снимайте директно с камерата."
        );
        heicErr.stage = "IMAGE_LOAD";
        reject(heicErr);
        return;
      }
      const loadErr: any = new Error("Невалиден или неподдържан графичен формат на касовата бележка.");
      loadErr.stage = "IMAGE_LOAD";
      reject(loadErr);
    };

    img.onload = async () => {
      if (hasFinished) return;
      try {
        // Note: Modern browsers decode <img> naturalWidth/naturalHeight AFTER honoring EXIF rotation
        const originalWidth = img.naturalWidth || img.width;
        const originalHeight = img.naturalHeight || img.height;

        // 1. Determine OCR input source: prefer exact original File at full resolution without canvas conversion
        let ocrSource: File | Blob = file;
        let ocrWidth = originalWidth;
        let ocrHeight = originalHeight;
        let ocrFormat = originalFormat;
        let usedOriginalFile = true;
        let wasResized = false;
        let wasRecompressed = false;
        let canvasConversionMethod = "none (original File passed directly to Tesseract)";

        // Only use lossless PNG canvas export if:
        // - format is non-Tesseract (e.g. HEIC/HEIF decoded by iOS Safari) OR
        // - mobile camera JPEG carries rotated EXIF orientation (> 1), which Leptonica WASM does not auto-rotate
        const needsLosslessCanvasRender = !isTesseractNativeFormat || exifOrientation > 1;
        let previewUrl = objectUrl;
        let previewObjectUrl: string | undefined = objectUrl;

        if (needsLosslessCanvasRender) {
          prepStage = "IMAGE_CONVERSION";
          usedOriginalFile = false;
          // Respect mobile browser 16MP canvas pixel safety cap ONLY if an ultra-high-res sensor photo requires rotation/HEIC conversion
          const MAX_CANVAS_PIXELS = 16_000_000;
          const totalPixels = originalWidth * originalHeight;
          let targetWidth = originalWidth;
          let targetHeight = originalHeight;
          if (totalPixels > MAX_CANVAS_PIXELS) {
            const scale = Math.sqrt(MAX_CANVAS_PIXELS / totalPixels);
            targetWidth = Math.max(1, Math.floor(originalWidth * scale));
            targetHeight = Math.max(1, Math.floor(originalHeight * scale));
            wasResized = true;
          }

          const ocrCanvas = document.createElement("canvas");
          ocrCanvas.width = targetWidth;
          ocrCanvas.height = targetHeight;
          const ocrCtx = ocrCanvas.getContext("2d");
          if (ocrCtx) {
            ocrCtx.fillStyle = "#ffffff";
            ocrCtx.fillRect(0, 0, targetWidth, targetHeight);
            ocrCtx.drawImage(img, 0, 0, targetWidth, targetHeight);
            const pngBlob = await canvasToLosslessPngBlob(ocrCanvas);
            if (pngBlob) {
              ocrSource = pngBlob;
              ocrWidth = targetWidth;
              ocrHeight = targetHeight;
              ocrFormat = "PNG (lossless)";
              wasRecompressed = false;
              canvasConversionMethod =
                exifOrientation > 1
                  ? `drawImage() + canvas.toBlob('image/png') lossless (EXIF orientation ${exifOrientation})`
                  : `drawImage() + canvas.toBlob('image/png') lossless (${originalFormat} -> PNG)`;
              if (!isTesseractNativeFormat) {
                const convertedPreviewUrl = URL.createObjectURL(pngBlob);
                URL.revokeObjectURL(objectUrl);
                previewUrl = convertedPreviewUrl;
                previewObjectUrl = convertedPreviewUrl;
              }
            } else {
              ocrSource = file;
              canvasConversionMethod = "canvas.toBlob returned null -> fallback to original File";
              usedOriginalFile = true;
            }
          }
        }

        // 2. Prepare base64 payload for optional Gemini API enhancement (separate from OCR input!)
        // Keep Gemini JSON transport compact (~300-800KB) so Cloudflare Worker & mobile networks don't fail on multi-MB POST bodies.
        let base64 = "";
        let geminiMimeType = file.type || "image/jpeg";
        let aiTransportWidth = originalWidth;
        let aiTransportHeight = originalHeight;
        let aiCompressedSizeBytes = file.size;
        const MAX_DIRECT_GEMINI_BYTES = 1.2 * 1024 * 1024;
        if (
          file.size <= MAX_DIRECT_GEMINI_BYTES &&
          exifOrientation <= 1 &&
          ["JPEG", "PNG", "WEBP"].includes(originalFormat)
        ) {
          prepStage = "BASE64_ENCODING";
          base64 = await readFileAsDataUrl(file);
        } else {
          prepStage = "IMAGE_RESIZE";
          // Only create a separate JPEG copy for Gemini JSON transport if file > 1.2MB or rotated/HEIC
          const maxGeminiWidth = 1600;
          const maxGeminiHeight = 4000;
          let gWidth = originalWidth;
          let gHeight = originalHeight;
          if (gWidth > maxGeminiWidth) {
            gHeight = Math.round((gHeight * maxGeminiWidth) / gWidth);
            gWidth = maxGeminiWidth;
          }
          if (gHeight > maxGeminiHeight) {
            gWidth = Math.round((gWidth * maxGeminiHeight) / gHeight);
            gHeight = maxGeminiHeight;
          }
          aiTransportWidth = gWidth;
          aiTransportHeight = gHeight;
          const gCanvas = document.createElement("canvas");
          gCanvas.width = gWidth;
          gCanvas.height = gHeight;
          const gCtx = gCanvas.getContext("2d");
          prepStage = "BASE64_ENCODING";
          if (gCtx) {
            gCtx.fillStyle = "#ffffff";
            gCtx.fillRect(0, 0, gWidth, gHeight);
            gCtx.drawImage(img, 0, 0, gWidth, gHeight);
            base64 = gCanvas.toDataURL("image/jpeg", 0.92);
            geminiMimeType = "image/jpeg";
          } else {
            base64 = await readFileAsDataUrl(ocrSource);
          }
        }

        // Calculate exact decoded binary size of the compressed image sent in JSON
        const commaIdx = base64.indexOf(",");
        const pureB64 = commaIdx !== -1 ? base64.slice(commaIdx + 1) : base64;
        if (pureB64.length > 0) {
          const padding = pureB64.endsWith("==") ? 2 : pureB64.endsWith("=") ? 1 : 0;
          aiCompressedSizeBytes = Math.max(0, Math.floor((pureB64.length * 3) / 4) - padding);
        }

        if (hasFinished) return;
        hasFinished = true;
        clearTimeout(timer);

        const diagnostics: ImageQualityDiagnostics = {
          platform,
          originalFormat,
          originalMimeType: file.type || "unknown",
          originalWidth,
          originalHeight,
          originalSizeBytes: file.size,
          exifOrientation,
          ocrFormat,
          ocrWidth,
          ocrHeight,
          ocrSizeBytes: ocrSource.size,
          aiTransportWidth,
          aiTransportHeight,
          aiCompressedSizeBytes,
          base64SizeChars: base64.length,
          lastCompletedStage: prepStage,
          usedOriginalFile,
          wasResized,
          wasRecompressed,
          canvasConversionMethod,
        };

        console.log("[Receipt OCR] Image Pipeline Diagnostics:", diagnostics);

        resolve({
          ocrSource,
          base64,
          previewUrl,
          previewObjectUrl,
          mimeType: geminiMimeType,
          originalSize: file.size,
          ocrSizeBytes: ocrSource.size,
          compressedSizeBytes: aiCompressedSizeBytes,
          base64SizeChars: base64.length,
          aiWidth: aiTransportWidth,
          aiHeight: aiTransportHeight,
          dimensions: `${originalWidth}x${originalHeight}`,
          diagnostics,
        });
      } catch (err: any) {
        if (hasFinished) return;
        hasFinished = true;
        clearTimeout(timer);
        URL.revokeObjectURL(objectUrl);
        const stageErr: any = new Error(
          `[${prepStage}] ${err?.message || "Неуспешна подготовка на изображението."}`
        );
        stageErr.stage = prepStage;
        reject(stageErr);
      }
    };

    img.src = objectUrl;
  });
}

// Pick whichever item list (local OCR vs Gemini) best matches the Receipt Total & Expected Item Count
function chooseBestItemSet(
  localItems: ReceiptItemDetail[],
  geminiItems: ReceiptItemDetail[],
  receiptTotal: number,
  expectedCount?: number | null
): { items: ReceiptItemDetail[]; source: "gemini" | "local" | "none"; reason: string } {
  if (geminiItems.length === 0 && localItems.length === 0) {
    return { items: [], source: "none", reason: "No items extracted by either OCR or AI" };
  }
  if (geminiItems.length === 0) {
    return { items: localItems, source: "local", reason: "Using local OCR items (AI returned 0 items)" };
  }
  if (localItems.length === 0) {
    return { items: geminiItems, source: "gemini", reason: "Using AI items (local OCR returned 0 items)" };
  }

  const localSum = localItems.reduce((s, i) => s + (i.finalPrice ?? i.price), 0);
  const geminiSum = geminiItems.reduce((s, i) => s + (i.finalPrice ?? i.price), 0);

  if (receiptTotal > 0) {
    const localErr = Math.abs(localSum - receiptTotal) / receiptTotal;
    const geminiErr = Math.abs(geminiSum - receiptTotal) / receiptTotal;

    // If local OCR matches within 5% and Gemini is truncated (>5% off), keep local OCR items
    if (localErr <= 0.05 && geminiErr > 0.05 && localItems.length >= geminiItems.length) {
      return {
        items: localItems,
        source: "local",
        reason: `Kept local OCR (${localItems.length} items, sum €${localSum.toFixed(2)}) over truncated AI (${geminiItems.length} items, sum €${geminiSum.toFixed(2)})`,
      };
    }

    // If Gemini matches within 5% and local OCR missed items, pick Gemini
    if (geminiErr <= 0.05 && localErr > 0.05) {
      return {
        items: geminiItems,
        source: "gemini",
        reason: `Selected AI items (${geminiItems.length} items, sum €${geminiSum.toFixed(2)}) matching receipt total €${receiptTotal.toFixed(2)}`,
      };
    }

    // If expectedCount is known, prefer whichever is closer to expectedCount without overcounting total
    if (expectedCount && expectedCount > 0) {
      const localCountDiff = Math.abs(localItems.length - expectedCount);
      const geminiCountDiff = Math.abs(geminiItems.length - expectedCount);
      if (localCountDiff < geminiCountDiff && localErr <= geminiErr + 0.05) {
        return {
          items: localItems,
          source: "local",
          reason: `Kept local OCR (${localItems.length}/${expectedCount} items vs AI ${geminiItems.length}/${expectedCount})`,
        };
      }
      if (geminiCountDiff < localCountDiff && geminiErr <= localErr + 0.05) {
        return {
          items: geminiItems,
          source: "gemini",
          reason: `Selected AI items (${geminiItems.length}/${expectedCount} items vs local ${localItems.length}/${expectedCount})`,
        };
      }
    }

    if (Math.abs(localErr - geminiErr) <= 0.03) {
      return localItems.length > geminiItems.length
        ? { items: localItems, source: "local", reason: `Kept local OCR (${localItems.length} items >= AI ${geminiItems.length})` }
        : { items: geminiItems, source: "gemini", reason: `Selected AI items (${geminiItems.length} items, cleaner names)` };
    }

    return localErr < geminiErr
      ? { items: localItems, source: "local", reason: `Kept local OCR (lower error ${(localErr * 100).toFixed(1)}% vs AI ${(geminiErr * 100).toFixed(1)}%)` }
      : { items: geminiItems, source: "gemini", reason: `Selected AI items (lower error ${(geminiErr * 100).toFixed(1)}% vs local ${(localErr * 100).toFixed(1)}%)` };
  }

  return geminiItems.length >= localItems.length
    ? { items: geminiItems, source: "gemini", reason: `Selected AI items (${geminiItems.length} items)` }
    : { items: localItems, source: "local", reason: `Kept local OCR (${localItems.length} items)` };
}

function hasKeywordMatch(haystacks: string[], keyword: string): boolean {
  const kw = keyword.toLowerCase();
  // Require word boundaries for short 2-4 letter tokens so "dm" or "bar" don't false-match inside unrelated words
  if (kw.length <= 3) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^а-яА-Яa-zA-Z0-9])${escaped}(?:$|[^а-яА-Яa-zA-Z0-9])`, "i");
    return haystacks.some((h) => re.test(h));
  }
  return haystacks.some((h) => h.toLowerCase().includes(kw));
}

// Smart category suggestion matching (Bulgarian-first + OCR homoglyph tolerant)
function matchCategory(
  result: { merchantName?: string; rawText?: string; suggestedCategory?: string },
  availableCategories: ExpenseCategory[]
): ExpenseCategory {
  const merchantRaw = result.merchantName || "";
  const rawText = result.rawText || "";
  const suggested = (result.suggestedCategory || "").toLowerCase();

  const haystacks = [
    merchantRaw.toLowerCase(),
    toCyrillicMatchForm(merchantRaw).toLowerCase(),
    toLatinMatchForm(merchantRaw).toLowerCase(),
    rawText.toLowerCase(),
    toCyrillicMatchForm(rawText).toLowerCase(),
    toLatinMatchForm(rawText).toLowerCase(),
    suggested,
  ];

  const rules: { keywords: string[]; targetIdOrName: string }[] = [
    {
      keywords: [
        "sopharmacy",
        "софармаси",
        "софарма",
        "subra",
        "субра",
        "remedium",
        "ремедиум",
        "аптека",
        "pharmacy",
        "лекарства",
        "хапчета",
        "медикаменти",
        "cvs",
        "walgreens",
      ],
      targetIdOrName: "аптека",
    },
    {
      keywords: [
        "dm",
        "дм",
        "dm дрогери",
        "dm българия",
        "lilly",
        "лили",
        "козметика",
        "парфюм",
        "cosmetics",
      ],
      targetIdOrName: "козметика",
    },
    {
      keywords: [
        "cinema city",
        "синема сити",
        "kino arena",
        "кино арена",
        "кино",
        "cinema",
        "арена",
        "театър",
        "филм",
        "movie",
        "entertainment",
      ],
      targetIdOrName: "кино",
    },
    {
      keywords: [
        "shell",
        "шел",
        "omv",
        "омв",
        "lukoil",
        "лукойл",
        "rompetrol",
        "ромпетрол",
        "petrol",
        "петрол",
        "eko",
        "еко",
        "газпром",
        "бензиностанция",
        "гориво",
        "дизел",
        "бензин",
        "fuel",
        "gas",
      ],
      targetIdOrName: "гориво",
    },
    {
      keywords: [
        "happy",
        "хепи",
        "raffy",
        "рафи",
        "mcdonald",
        "макдоналдс",
        "kfc",
        "кфс",
        "burger king",
        "domino",
        "subway",
        "ресторант",
        "restaurant",
        "механа",
        "дюнер",
        "пица",
        "pizza",
        "bistro",
        "бистро",
        "grill",
        "кафе",
        "cafe",
        "bar",
        "бар",
      ],
      targetIdOrName: "ресторант",
    },
    {
      keywords: [
        "lidl",
        "лидл",
        "лидъл",
        "billa",
        "билла",
        "била",
        "kaufland",
        "кауфланд",
        "fantastico",
        "фантастико",
        "t-market",
        "t market",
        "т-маркет",
        "т маркет",
        "максима българия",
        "metro",
        "метро",
        "promarket",
        "промаркет",
        "cba",
        "цба",
        "храна",
        "супермаркет",
        "пекарна",
        "хляб",
        "groceries",
        "market",
        "walmart",
        "target",
      ],
      targetIdOrName: "храна",
    },
    {
      keywords: ["автомивка", "гуми", "сервиз", "масла", "авточасти", "кола", "car"],
      targetIdOrName: "кола",
    },
    {
      keywords: ["фризьор", "бръснар", "barber", "коса", "салон", "hair"],
      targetIdOrName: "фризьор",
    },
    {
      keywords: ["zara", "h&m", "lc waikiki", "reserved", "дрехи", "обувки", "clothes", "fashion"],
      targetIdOrName: "дрехи",
    },
    {
      keywords: ["зоомагазин", "ветеринар", "куче", "котка", "pets", "любимци"],
      targetIdOrName: "домашни любимци",
    },
    {
      keywords: ["почистване", "препарати", "химическо", "cleaning"],
      targetIdOrName: "почистване",
    },
  ];

  if (suggested) {
    const directMatch = availableCategories.find(
      (c) =>
        c.name.toLowerCase() === suggested ||
        c.id.toLowerCase() === suggested
    );
    if (directMatch) return directMatch;
  }

  for (const rule of rules) {
    if (rule.keywords.some((kw) => hasKeywordMatch(haystacks, kw))) {
      const cat = availableCategories.find(
        (c) =>
          c.name.toLowerCase().includes(rule.targetIdOrName) ||
          c.id.toLowerCase().includes(rule.targetIdOrName)
      );
      if (cat) return cat;
    }
  }

  const foodCat = availableCategories.find(
    (c) => c.name.toLowerCase().includes("храна") || c.id === "food"
  );
  return foodCat || availableCategories[0];
}

const TIP_ITEM_NAME = "Бакшиш";

function isTipReceiptItem(item: Pick<ReceiptItemDetail, "name">): boolean {
  return item.name.trim().toLowerCase() === "бакшиш";
}

export const ScanReceiptModal: React.FC<ScanReceiptModalProps> = ({
  isOpen,
  onClose,
  categories,
  onExpenseCreated,
}) => {
  const { language, t } = useI18n();
  const [step, setStep] = useState<"upload" | "preview" | "scanning" | "review">("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{
    name: string;
    sizeFormatted: string;
    dimensions: string;
    prepared?: PreparedReceiptImage;
  } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState(() => t("ocr.initScannerStatus"));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Review Form State
  const [amount, setAmount] = useState<string>("");
  const [receiptCurrency, setReceiptCurrency] = useState<string>("€");
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState<string>("");
  const [merchantName, setMerchantName] = useState<string>("");
  const [location, setLocation] = useState<TransactionLocation | undefined>(undefined);
  const [receiptItems, setReceiptItems] = useState<ReceiptItemDetail[]>([]);
  const [selectedItemIndices, setSelectedItemIndices] = useState<Set<number>>(new Set());
  const [splitBillEnabled, setSplitBillEnabled] = useState<boolean>(false);
  const [rawText, setRawText] = useState<string>("");
  const [confidence, setConfidence] = useState<"high" | "medium" | "low">("high");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory>(() => categories[0]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

  // Budget Category Assignment State
  const [budgetCategories, setBudgetCategories] = useState<BudgetConfig[]>(
    () => loadBudgets().categoryBudgets
  );
  const [selectedBudgetCategoryId, setSelectedBudgetCategoryId] = useState<string>(() => {
    const loaded = loadBudgets().categoryBudgets;
    return categories[0] ? findMatchingBudgetCategoryId(categories[0].id, categories[0].name, loaded) : "";
  });

  // Confidence Check Details & Date/Validation Diagnostics
  const [detectedTotal, setDetectedTotal] = useState<number>(0);
  const [detectedMerchant, setDetectedMerchant] = useState<string>("");
  const [detectedDate, setDetectedDate] = useState<string>("");
  const [ocrDetectedDate, setOcrDetectedDate] = useState<string | null>(null);
  const [dateFallbackReason, setDateFallbackReason] = useState<string | null>(null);
  const [dateEditedByUser, setDateEditedByUser] = useState<boolean>(false);
  const [detectedItemsCount, setDetectedItemsCount] = useState<number>(0);
  const [detectedDiscount, setDetectedDiscount] = useState<number>(0);
  const [expectedItemsCount, setExpectedItemsCount] = useState<number | null>(null);
  const [confirmMismatchOverride, setConfirmMismatchOverride] = useState<boolean>(false);
  const [aiSourceBadge, setAiSourceBadge] = useState<string>(() => t("ocr.ocrAnalysisBadge"));
  const [aiUnavailable, setAiUnavailable] = useState<boolean>(false);
  const [aiFallbackMode, setAiFallbackMode] = useState<"quota_limit" | "temporary" | "general">("general");
  const [aiFallbackReason, setAiFallbackReason] = useState<string | null>(null);
  const [aiFallbackDetail, setAiFallbackDetail] = useState<string | null>(null);
  const [aiSucceeded, setAiSucceeded] = useState<boolean>(false);
  const [aiProgress, setAiProgress] = useState<{
    active: boolean;
    pass: number;
    attempt: number;
    total: number;
  } | null>(null);
  const [processingWarning, setProcessingWarning] = useState<string | null>(null);
  const [ocrLanguageInfo, setOcrLanguageInfo] = useState<{
    requested: string;
    used: string;
    fallbackOccurred: boolean;
    psmMode: string;
  } | null>(null);

  // Manual Item Addition & Inline Editing State
  const [showAddItemForm, setShowAddItemForm] = useState<boolean>(false);
  const [newItemName, setNewItemName] = useState<string>("");
  const [newItemQuantity, setNewItemQuantity] = useState<string>("1");
  const [newItemPrice, setNewItemPrice] = useState<string>("");
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState<string>("");
  const [editItemQuantity, setEditItemQuantity] = useState<string>("1");
  const [editItemPrice, setEditItemPrice] = useState<string>("");

  // Tip Modal State
  const [showTipModal, setShowTipModal] = useState<boolean>(false);
  const [tipInputAmount, setTipInputAmount] = useState<string>("");
  const [tipError, setTipError] = useState<string | null>(null);

  const [scanElapsedSeconds, setScanElapsedSeconds] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scanRunIdRef = useRef<number>(0);
  const aiStageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const preSplitSnapshotRef = useRef<{
    items: ReceiptItemDetail[];
    selectedIndices: Set<number>;
  } | null>(null);
  const modifiedAfterSplitRef = useRef<boolean>(false);
  const locationEditedByUserRef = useRef<boolean>(false);

  const clearAiStageTimers = useCallback(() => {
    if (aiStageTimersRef.current.length > 0) {
      aiStageTimersRef.current.forEach((t) => clearTimeout(t));
      aiStageTimersRef.current = [];
    }
  }, []);

  const abortActiveAiRequest = useCallback(() => {
    clearAiStageTimers();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, [clearAiStageTimers]);

  // Auto-expand notes textarea based on content without internal scrollbars
  const adjustNotesHeight = useCallback(() => {
    const el = notesTextareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
    }
  }, []);

  // Internal developer logging (console only)
  const addDebugLog = useCallback(
    (step: DebugLog["step"], message: string, data?: any) => {
      const now = new Date().toLocaleTimeString("bg-BG", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      console.log(`[Receipt OCR] [${now}] [${step.toUpperCase()}] ${message}`, data || "");
    },
    []
  );

  // Cleanup on close
  const handleClose = useCallback(() => {
    scanRunIdRef.current += 1;
    abortActiveAiRequest();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (imageMeta?.prepared?.previewObjectUrl) {
      URL.revokeObjectURL(imageMeta.prepared.previewObjectUrl);
    }
    setStep("upload");
    setImagePreview(null);
    setImageMeta(null);
    setIsZoomed(false);
    setErrorMessage(null);
    setAmount("");
    setReceiptCurrency("€");
    setNotes("");
    setMerchantName("");
    locationEditedByUserRef.current = false;
    setLocation(undefined);
    setReceiptItems([]);
    setSelectedItemIndices(new Set());
    setSplitBillEnabled(false);
    preSplitSnapshotRef.current = null;
    modifiedAfterSplitRef.current = false;
    setRawText("");
    setWarnings([]);
    setShowCategoryPicker(false);
    setShowRawText(false);
    setSelectedBudgetCategoryId("");
    setDetectedTotal(0);
    setDetectedMerchant("");
    setDetectedDate("");
    setOcrDetectedDate(null);
    setDateFallbackReason(null);
    setDateEditedByUser(false);
    setDetectedItemsCount(0);
    setDetectedDiscount(0);
    setExpectedItemsCount(null);
    setConfirmMismatchOverride(false);
    setAiSourceBadge(t("ocr.ocrAnalysisBadge"));
    setAiUnavailable(false);
    setAiFallbackMode("general");
    setAiFallbackReason(null);
    setAiFallbackDetail(null);
    setAiSucceeded(false);
    setAiProgress(null);
    setProcessingWarning(null);
    setOcrLanguageInfo(null);
    setShowAddItemForm(false);
    setNewItemName("");
    setNewItemQuantity("1");
    setNewItemPrice("");
    setEditingItemIndex(null);
    setShowTipModal(false);
    setTipInputAmount("");
    setTipError(null);
    setScanElapsedSeconds(0);
    onClose();
  }, [abortActiveAiRequest, imageMeta, onClose, t]);

  // Cancel scanning cleanly so in-flight requests never hijack the UI
  const handleCancelScan = useCallback(() => {
    scanRunIdRef.current += 1;
    abortActiveAiRequest();
    setAiProgress(null);
    setErrorMessage(null);
    setScanStatusMessage(t("ocr.initScannerStatus"));
    setStep("upload");
  }, [abortActiveAiRequest, t]);

  // Elapsed timer while scanning
  useEffect(() => {
    if (step === "scanning") {
      setScanElapsedSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setScanElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [step]);

  // Adjust notes textarea height whenever review step is entered or notes update
  useEffect(() => {
    if (step === "review") {
      requestAnimationFrame(() => {
        adjustNotesHeight();
      });
    }
  }, [step, notes, adjustNotesHeight]);

  // Skip directly to manual review
  const handleSkipToManual = useCallback(
    (reason = "Manual entry by user") => {
      scanRunIdRef.current += 1;
      abortActiveAiRequest();
      addDebugLog("parsed_total", "Прескачане към ръчно въвеждане: " + reason);
      setMerchantName((prev) => prev || t("ocr.receiptDefaultName"));
      setDate((prev) => prev || new Date().toISOString().split("T")[0]);
      setConfidence("low");
      setAiUnavailable(false);
      setAiFallbackMode("general");
      setAiFallbackReason(null);
      setAiFallbackDetail(null);
      setAiSucceeded(false);
      setAiProgress(null);
      setAiSourceBadge(t("ocr.manualModeBadge"));
      setProcessingWarning(t("ocr.manualModeWarning"));
      setStep("review");
    },
    [abortActiveAiRequest, addDebugLog, t]
  );

  // Apply item selection changes: recalculate amount and regenerate notes with ONLY selected items
  const applyItemSelection = useCallback(
    (
      nextSelected: Set<number>,
      itemsList: ReceiptItemDetail[],
      fullReceiptTotal: number,
      currencyOverride?: string
    ) => {
      setSelectedItemIndices(nextSelected);

      if (itemsList.length === 0) return;

      const selectedItems = itemsList.filter((_, idx) => nextSelected.has(idx));
      const allSelected = selectedItems.length === itemsList.length;

      // Recalculate live total
      if (selectedItems.length === 0) {
        setAmount("0.00");
      } else if (allSelected && fullReceiptTotal > 0) {
        setAmount(fullReceiptTotal.toFixed(2));
      } else {
        const sum = selectedItems.reduce((acc, item) => acc + (item.finalPrice ?? item.price), 0);
        setAmount(sum.toFixed(2));
      }

      // Regenerate clean multi-line notes using ONLY selected items in detected currency
      const activeCurrency = currencyOverride || receiptCurrency || "€";
      const generatedNotes = formatReceiptNotes(selectedItems, activeCurrency);
      setNotes(generatedNotes);
      setErrorMessage(null);
    },
    [receiptCurrency]
  );

  if (!isOpen) return null;

  // 1. Process image file and transition to Receipt Preview modal
  const processImageFile = async (file: File) => {
    const isImageMime = file.type.startsWith("image/");
    const isImageExtension = /\.(jpe?g|png|webp|heic|heif|bmp|gif|avif)$/i.test(file.name);
    if (!isImageMime && !isImageExtension) {
      const err = t("ocr.invalidFileErr");
      setErrorMessage(err);
      addDebugLog("error", err, { fileType: file.type, fileName: file.name });
      return;
    }

    if (imageMeta?.prepared?.previewObjectUrl) {
      URL.revokeObjectURL(imageMeta.prepared.previewObjectUrl);
    }

    setErrorMessage(null);
    addDebugLog(
      "ocr_text",
      `Upload received -> file="${file.name}" | type="${file.type || "unknown"}" | originalSize=${file.size} bytes (${Math.round(file.size / 1024)} KB)`
    );

    try {
      const prepared = await prepareReceiptImageWithTimeout(file, 10000);
      const diag = prepared.diagnostics;
      addDebugLog(
        "ocr_text",
        `Image Quality Check (${diag.platform}) | Original: ${diag.originalWidth}x${diag.originalHeight}, ${diag.originalSizeBytes} bytes (${Math.round(diag.originalSizeBytes / 1024)} KB), format=${diag.originalFormat}, EXIF=${diag.exifOrientation} | OCR Input: ${diag.ocrWidth}x${diag.ocrHeight}, ${diag.ocrSizeBytes} bytes (${Math.round(diag.ocrSizeBytes / 1024)} KB), format=${diag.ocrFormat} | originalPreserved=${diag.usedOriginalFile} | resized=${diag.wasResized} | recompressed=${diag.wasRecompressed} | canvas=${diag.canvasConversionMethod}`,
        diag
      );

      setImagePreview(prepared.previewUrl);
      setImageMeta({
        name: file.name,
        sizeFormatted: `${Math.round(prepared.originalSize / 1024)} KB`,
        dimensions: prepared.dimensions,
        prepared,
      });

      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
      if (cleanName && cleanName.length > 2 && !cleanName.startsWith("IMG_")) {
        setMerchantName(cleanName);
      } else {
        setMerchantName(t("ocr.receiptDefaultName"));
      }

      setStep("preview");
    } catch (prepErr: any) {
      const failedPrepStage = prepErr?.stage || "IMAGE_LOAD";
      addDebugLog("error", `Провал на етап ${failedPrepStage}: ${prepErr.message}`);
      setProcessingWarning(t("ocr.imagePrepWarning"));
      setMerchantName(t("ocr.receiptDefaultName"));
      setStep("review");
    }
  };

  const handleProceedFromPreview = () => {
    if (!imageMeta?.prepared) {
      setStep("review");
      return;
    }
    runScanWorkflow(imageMeta.prepared);
  };

  // OCR Workflow (Original-resolution Tesseract bul+eng -> Deterministic BG Parser -> Gemini AI Enrichment)
  const runScanWorkflow = async (prepared: PreparedReceiptImage) => {
    scanRunIdRef.current += 1;
    const runId = scanRunIdRef.current;
    abortActiveAiRequest();

    setStep("scanning");
    setAiUnavailable(false);
    setAiFallbackMode("general");
    setAiFallbackReason(null);
    setAiFallbackDetail(null);
    setAiSucceeded(false);
    setAiProgress(null);
    setProcessingWarning(null);
    setDateEditedByUser(false);
    setShowAddItemForm(false);
    setEditingItemIndex(null);
    setShowTipModal(false);
    setTipInputAmount("");
    setTipError(null);
    setSplitBillEnabled(false);
    locationEditedByUserRef.current = false;
    setLocation(undefined);
    preSplitSnapshotRef.current = null;
    modifiedAfterSplitRef.current = false;
    setScanStatusMessage(t("ocr.preparingImageStatus"));
    let ocrRawText = "";
    let ocrConfidence = 0;
    try {
      const diag = prepared.diagnostics;
      const ocrResult = await runClientOcr(
        prepared.ocrSource,
        (percent, status) => {
          if (scanRunIdRef.current === runId) {
            setScanStatusMessage(t("ocr.ocrProgressStatus", { percent, status }));
          }
        },
        45000 // 45s timeout allows cold-downloading bul.traineddata.gz + eng.traineddata.gz reliably
      );
      if (scanRunIdRef.current !== runId) return;
      ocrRawText = ocrResult.text;
      ocrConfidence = ocrResult.confidence;
      setOcrLanguageInfo({
        requested: ocrResult.requestedLanguages,
        used: ocrResult.languagesUsed,
        fallbackOccurred: ocrResult.fallbackOccurred,
        psmMode: ocrResult.psmMode,
      });
      addDebugLog(
        "ocr_text",
        `OCR Config (${diag.platform}): requested="${ocrResult.requestedLanguages}" | active="${ocrResult.languagesUsed}" | fallback=${ocrResult.fallbackOccurred} | PSM=${ocrResult.psmMode} | ${ocrResult.durationMs}ms | OCR Input=${diag.ocrWidth}x${diag.ocrHeight} (${Math.round(diag.ocrSizeBytes / 1024)} KB) | confidence=${ocrConfidence.toFixed(1)}% | textLength=${ocrRawText.length} chars\n` +
          ocrRawText.slice(0, 600)
      );
    } catch (ocrErr: any) {
      if (scanRunIdRef.current !== runId) return;
      addDebugLog("error", `Локалното OCR отне твърде много време или се провали: ${ocrErr?.message}`);
    }
    if (scanRunIdRef.current !== runId) return;

    // 3. Deterministic Local Parsing (Bulgarian-first + Euro-first)
    const localParsed: ParsedReceiptData = parseReceiptTextLocally(ocrRawText);
    const localCurrency =
      localParsed.currency === "лв." || localParsed.currency === "BGN"
        ? "€"
        : localParsed.currency || "€";
    setReceiptCurrency(localCurrency);

    const ocrDateValue = localParsed.dateDetected ? localParsed.date : null;
    setOcrDetectedDate(ocrDateValue);
    setDateFallbackReason(localParsed.dateDetected ? null : localParsed.dateFallbackReason || "Не е открита валидна дата в OCR текста.");
    setExpectedItemsCount(localParsed.expectedItemsCount ?? null);
    setConfirmMismatchOverride(false);

    addDebugLog(
      "ocr_text",
      `OCR Input Quality (${prepared.diagnostics.platform}) | Original=${prepared.diagnostics.originalWidth}x${prepared.diagnostics.originalHeight} (${Math.round(prepared.diagnostics.originalSizeBytes / 1024)} KB) | OCR=${prepared.diagnostics.ocrWidth}x${prepared.diagnostics.ocrHeight} (${Math.round(prepared.diagnostics.ocrSizeBytes / 1024)} KB) | Detected item count=${localParsed.items.length} | Detected confidence=${ocrConfidence.toFixed(1)}% | Detected text length=${ocrRawText.length} chars`
    );

    addDebugLog(
      "parsed_merchant",
      `OCR detected merchant: "${localParsed.merchantName}" (${localParsed.merchantRule || "—"})`
    );
    addDebugLog(
      "parsed_date",
      localParsed.dateDetected
        ? `OCR detected date: "${localParsed.date}" (${localParsed.dateRule || "—"}) | Final saved date: "${localParsed.date}"`
        : `OCR detected date: НЕ Е ОТКРИТА | Fallback date: "${localParsed.date}" | Reason for fallback: ${localParsed.dateFallbackReason || "Липсва дата в OCR текста"}`
    );
    addDebugLog(
      "parsed_total",
      `OCR Validation | Receipt Total: ${localParsed.totalAmount.toFixed(2)} ${localCurrency} | Items Total: ${localParsed.itemsTotal.toFixed(2)} ${localCurrency} | Difference: ${localParsed.totalDifference.toFixed(2)} ${localCurrency} (${localParsed.totalDifferencePercent.toFixed(1)}%) | Detected items: ${localParsed.items.length} | Expected items: ${localParsed.expectedItemsCount ?? "неизвестно"}`
    );
    addDebugLog(
      "parsed_items",
      `OCR detected quantities & items (${localParsed.items.length}): ${
        localParsed.items.length > 0
          ? localParsed.items
              .map((it) => `${it.quantity || 1} x ${it.name} - ${localCurrency === "€" ? `€${it.price.toFixed(2)}` : `${it.price.toFixed(2)} ${localCurrency}`}`)
              .join(" | ")
          : "няма открити редове"
      }`,
      localParsed.items
    );

    // Initial baseline state populated from OCR-first results
    const initialItems: ReceiptItemDetail[] = (localParsed.items || []).map((it) => ({
      name: it.name,
      price: it.finalPrice ?? it.price,
      quantity: it.quantity && it.quantity >= 1 ? it.quantity : 1,
      ...(it.discount && it.discount > 0 && it.originalPrice !== undefined
        ? {
            originalPrice: it.originalPrice,
            discount: it.discount,
            finalPrice: it.finalPrice ?? it.price,
            ...(it.discountLabel ? { discountLabel: it.discountLabel } : {}),
          }
        : {}),
    }));
    const prefilledOcrLocation = localParsed.detectedAddress
      ? normalizeLocation({ address: localParsed.detectedAddress })
      : undefined;
    if (prefilledOcrLocation) {
      addDebugLog(
        "parsed_merchant",
        `OCR detected address: "${prefilledOcrLocation.address}" (${localParsed.addressRule || "—"})`
      );
    }

    setMerchantName(
      localParsed.merchantName === "Касова бележка"
        ? t("ocr.receiptDefaultName")
        : localParsed.merchantName
    );
    setLocation(prefilledOcrLocation);
    setAmount(localParsed.totalAmount > 0 ? localParsed.totalAmount.toFixed(2) : "");
    setDate(localParsed.date);
    setNotes(localParsed.notesFormatted);
    setReceiptItems(initialItems);
    setSelectedItemIndices(new Set(initialItems.map((_, idx) => idx)));
    setRawText(ocrRawText);
    setConfidence(localParsed.confidence);
    setWarnings(localParsed.warnings);

    setDetectedMerchant(localParsed.merchantName);
    setDetectedDate(localParsed.date);
    setDetectedTotal(localParsed.totalAmount);
    setDetectedDiscount(localParsed.discountTotal || 0);
    setDetectedItemsCount(initialItems.length);
    setAiSourceBadge(t("ocr.ocrAnalysisBadge"));

    const baseCat = matchCategory(
      {
        merchantName: localParsed.merchantName,
        rawText: ocrRawText,
      },
      categories
    );
    setSelectedCategory(baseCat);
    const matchingBudgetId = findMatchingBudgetCategoryId(baseCat.id, baseCat.name, budgetCategories);
    if (matchingBudgetId) {
      setSelectedBudgetCategoryId(matchingBudgetId);
    }

    // 4. Gemini AI Enrichment (Prioritized for accuracy - waits patiently while AI processes)
    const CLIENT_AI_TIMEOUT_MS = 195000; // 195s client ceiling (> 180s server multi-model fallback budget)
    let hasStreamedProgress = false;
    setAiProgress({
      active: true,
      pass: 1,
      attempt: 1,
      total: GEMINI_RECEIPT_MODELS.length,
    });
    setScanStatusMessage(t("ocr.aiAnalyzingStatus"));
    clearAiStageTimers();
    aiStageTimersRef.current = [
      setTimeout(() => {
        if (scanRunIdRef.current === runId && !hasStreamedProgress) {
          setScanStatusMessage(t("ocr.aiWaitingAccuracyStatus"));
        }
      }, 6000),
      setTimeout(() => {
        if (scanRunIdRef.current === runId && !hasStreamedProgress) {
          setScanStatusMessage(t("ocr.aiProcessingDetailsStatus"));
        }
      }, 22000),
      setTimeout(() => {
        if (scanRunIdRef.current === runId && !hasStreamedProgress) {
          setScanStatusMessage(t("ocr.aiContinuingStatus"));
        }
      }, 50000),
    ];

    const rawConfiguredApiUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim();
    const configuredApiBase = rawConfiguredApiUrl.replace(/\/+$/, "");
    const ocrEndpoint = configuredApiBase
      ? `${configuredApiBase}/api/ocr/receipt`
      : "/api/ocr/receipt";

    const resolveAiFailureDetails = (params: {
      errorCategory?: string | null;
      errorCode?: string | null;
      geminiErrorCode?: string | null;
      workerErrorCode?: string | null;
      httpStatus?: number | null;
      modelAttempted?: string | null;
      fallbackReason?: string | null;
      timeoutReason?: string | null;
      isTimeout?: boolean;
      isOffline?: boolean;
      quotaDiagnostics?: Array<{
        model?: string;
        quotaMetric?: string | null;
        quotaId?: string | null;
        quotaValue?: string | null;
        message?: string;
      }>;
      attempts?: Array<{
        model?: string;
        attempt?: number;
        httpStatus?: number | null;
        upstreamStatus?: string | null;
        errorCode?: string | null;
        outcome?: string;
        durationMs?: number;
        detail?: string;
      }>;
    }): {
      category: string;
      fallbackMode: "quota_limit" | "temporary" | "general";
      friendlyMessage: string;
      technicalDetail: string;
    } => {
      const {
        errorCategory,
        errorCode,
        geminiErrorCode,
        workerErrorCode,
        httpStatus,
        modelAttempted,
        fallbackReason,
        timeoutReason,
        isTimeout,
        isOffline,
        quotaDiagnostics,
        attempts,
      } = params;

      const attemptsSummary =
        Array.isArray(attempts) && attempts.length > 0
          ? attempts
              .map(
                (a) =>
                  `${a.model || "?"}#${a.attempt ?? "?"}:${a.outcome || a.errorCode || "?"}(${a.httpStatus ?? "-"}${a.durationMs ? `,${a.durationMs}ms` : ""})`
              )
              .join(" -> ")
          : null;

      const detailParts: string[] = [];
      if (modelAttempted) detailParts.push(modelAttempted);
      if (httpStatus) detailParts.push(`HTTP ${httpStatus}`);
      if (geminiErrorCode && geminiErrorCode !== "NONE") {
        detailParts.push(geminiErrorCode);
      } else if (workerErrorCode && workerErrorCode !== "NONE") {
        detailParts.push(workerErrorCode);
      } else if (errorCode && errorCode !== "NONE") {
        detailParts.push(errorCode);
      }

      const shortCodeLabel = detailParts.join(" · ") || "Unknown error";
      const rawReason = timeoutReason || fallbackReason || "";
      const technicalDetail = [rawReason || shortCodeLabel, attemptsSummary ? `[${attemptsSummary}]` : ""]
        .filter(Boolean)
        .join(" ");

      const has429Attempt =
        Array.isArray(attempts) &&
        attempts.some(
          (a) =>
            a.httpStatus === 429 ||
            a.errorCode === "RATE_LIMITED_429" ||
            a.upstreamStatus === "RESOURCE_EXHAUSTED"
        );
      const hasQuotaDiagnostic =
        Array.isArray(quotaDiagnostics) &&
        quotaDiagnostics.some(
          (q) =>
            Boolean(q.quotaId || q.quotaMetric) ||
            /RESOURCE_EXHAUSTED|quota|limit/i.test(q.message || "")
        );
      const matchesQuotaText =
        /\b429\b|RESOURCE_EXHAUSTED|RATE_LIMITED_429|Daily quota reached|Request limit reached|GenerateRequestsPerDay|GenerateContentInputTokensPerModelPerDay|quota_limit|Quota exceeded/i.test(
          `${rawReason} ${geminiErrorCode || ""} ${errorCode || ""}`
        );

      if (
        errorCategory === "quota_limit" ||
        errorCode === "RATE_LIMITED_429" ||
        httpStatus === 429 ||
        hasQuotaDiagnostic ||
        matchesQuotaText ||
        has429Attempt
      ) {
        return {
          category: "quota_limit",
          fallbackMode: "quota_limit",
          friendlyMessage: t("ocr.aiQuotaErr"),
          technicalDetail: technicalDetail || shortCodeLabel,
        };
      }

      if (isOffline) {
        return {
          category: "network_error",
          fallbackMode: "temporary",
          friendlyMessage: t("ocr.offlineAiErr"),
          technicalDetail: technicalDetail || "navigator.onLine === false",
        };
      }

      if (
        errorCategory === "timeout" ||
        isTimeout ||
        errorCode === "GEMINI_TIMEOUT" ||
        errorCode === "CLIENT_TIMEOUT" ||
        errorCode === "CLIENT_ABORT_TIMEOUT" ||
        errorCode === "CLIENT_ABORT_40S_TIMEOUT" ||
        httpStatus === 504 ||
        httpStatus === 524
      ) {
        return {
          category: "timeout",
          fallbackMode: "temporary",
          friendlyMessage: t("ocr.aiTimeoutErr"),
          technicalDetail: technicalDetail || `Timeout (${shortCodeLabel})`,
        };
      }

      if (
        errorCategory === "network_error" ||
        errorCode === "NETWORK_ERROR" ||
        workerErrorCode === "UPSTREAM_FETCH_ERROR"
      ) {
        return {
          category: "network_error",
          fallbackMode: "temporary",
          friendlyMessage: t("ocr.aiNetworkErr"),
          technicalDetail: technicalDetail || shortCodeLabel,
        };
      }

      if (
        errorCategory === "parsing_error" ||
        errorCode === "PARSE_ERROR" ||
        errorCode === "INVALID_JSON" ||
        errorCode === "NON_JSON_RESPONSE" ||
        errorCode === "CLIENT_JSON_PARSE_ERROR" ||
        errorCode === "REQUEST_SERIALIZATION_ERROR"
      ) {
        return {
          category: "parsing_error",
          fallbackMode: "general",
          friendlyMessage: t("ocr.aiParseErr"),
          technicalDetail: technicalDetail || shortCodeLabel,
        };
      }

      if (
        errorCategory === "configuration_error" ||
        errorCode === "NO_API_KEY" ||
        errorCode === "AUTH_OR_REQUEST_401" ||
        errorCode === "AUTH_OR_REQUEST_403" ||
        httpStatus === 401 ||
        httpStatus === 403
      ) {
        return {
          category: "configuration_error",
          fallbackMode: "general",
          friendlyMessage: t("ocr.aiConfigErr"),
          technicalDetail: technicalDetail || shortCodeLabel,
        };
      }

      if (errorCode === "EMPTY_RESPONSE") {
        return {
          category: "gemini_response_error",
          fallbackMode: "temporary",
          friendlyMessage: t("ocr.aiEmptyResponseErr"),
          technicalDetail: technicalDetail || shortCodeLabel,
        };
      }

      if (
        errorCategory === "gemini_response_error" ||
        errorCode?.startsWith("HTTP_") ||
        errorCode?.startsWith("AUTH_OR_REQUEST_") ||
        errorCode === "MODEL_NOT_FOUND_404" ||
        errorCode === "WORKER_EXCEPTION" ||
        errorCode === "SERVER_ERROR" ||
        (geminiErrorCode && geminiErrorCode !== "NONE") ||
        (typeof httpStatus === "number" && httpStatus >= 500)
      ) {
        return {
          category: "gemini_response_error",
          fallbackMode: "temporary",
          friendlyMessage: t("ocr.aiServerErr"),
          technicalDetail: technicalDetail || shortCodeLabel,
        };
      }

      return {
        category: errorCategory || "gemini_response_error",
        fallbackMode: "general",
        friendlyMessage: t("ocr.aiResponseErr"),
        technicalDetail: technicalDetail || shortCodeLabel,
      };
    };

    let currentStage: OcrPipelineStage = "REQUEST_CREATION";
    const geminiStart = Date.now();
    const requestOrigin = typeof window !== "undefined" ? window.location.origin : "";
    const clientPlatform = detectPlatformType();
    const requestMethod = "POST";

    let requestBodyStr = "";
    let jsonPayloadBytes = 0;
    try {
      requestBodyStr = JSON.stringify({
        imageBase64: prepared.base64,
        mimeType: prepared.mimeType,
        ocrText: ocrRawText,
        stream: true,
      });
      jsonPayloadBytes = new TextEncoder().encode(requestBodyStr).byteLength;
    } catch (serialErr: any) {
      clearAiStageTimers();
      const failure = resolveAiFailureDetails({
        errorCategory: "parsing_error",
        errorCode: "REQUEST_SERIALIZATION_ERROR",
        fallbackReason: serialErr?.message || "Failed to serialize receipt payload",
      });
      console.warn("[Gemini OCR] Gemini fallback triggered", {
        stage: "REQUEST_CREATION",
        category: failure.category,
        reason: failure.technicalDetail,
      });
      addDebugLog(
        "gemini_res",
        `[Gemini OCR] Gemini fallback triggered | category=${failure.category} | reason=${failure.technicalDetail}`
      );
      if (scanRunIdRef.current !== runId) return;
      setAiUnavailable(true);
      setAiFallbackMode(failure.fallbackMode);
      setAiFallbackReason(failure.friendlyMessage);
      setAiFallbackDetail(failure.technicalDetail);
      setAiSucceeded(false);
      setAiSourceBadge(t("ocr.localOcrFallbackBadge"));
      abortControllerRef.current = null;
      setStep("review");
      return;
    }

    console.info("[Gemini OCR] Gemini request start", {
      stage: "REQUEST_SEND",
      clientPlatform,
      requestOrigin,
      configuredApiUrl: rawConfiguredApiUrl || "(empty)",
      resolvedOcrUrl: ocrEndpoint,
      requestMethod,
      timeoutBudgetMs: CLIENT_AI_TIMEOUT_MS,
      imageWidth: prepared.diagnostics.originalWidth,
      imageHeight: prepared.diagnostics.originalHeight,
      aiTransportWidth: prepared.aiWidth,
      aiTransportHeight: prepared.aiHeight,
      originalMimeType: prepared.diagnostics.originalMimeType,
      mimeType: prepared.mimeType,
      originalFileSizeBytes: prepared.originalSize,
      compressedFileSizeBytes: prepared.compressedSizeBytes,
      base64SizeChars: prepared.base64SizeChars,
      jsonPayloadBytes,
    });
    addDebugLog(
      "gemini_res",
      `[Gemini OCR] Gemini request start (${clientPlatform}) | URL=${ocrEndpoint} | timeoutBudget=${CLIENT_AI_TIMEOUT_MS}ms | Image=${prepared.diagnostics.originalWidth}x${prepared.diagnostics.originalHeight} (AI=${prepared.aiWidth}x${prepared.aiHeight}) | JSON=${(jsonPayloadBytes / 1024).toFixed(1)} KB`
    );

    const sleepClient = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const overallDeadlineMs = Date.now() + CLIENT_AI_TIMEOUT_MS;
    const maxClientAttempts = 2;
    let shouldMoveToReview = true;

    try {
      for (let clientAttempt = 0; clientAttempt < maxClientAttempts; clientAttempt++) {
        if (scanRunIdRef.current !== runId) {
          shouldMoveToReview = false;
          return;
        }
        const remainingBudgetMs = overallDeadlineMs - Date.now();
        if (remainingBudgetMs <= 2000) {
          const timeoutFailure = resolveAiFailureDetails({
            errorCategory: "timeout",
            errorCode: "CLIENT_TIMEOUT",
            isTimeout: true,
            fallbackReason: `Client AI waiting budget (${CLIENT_AI_TIMEOUT_MS}ms) exhausted after ${Date.now() - geminiStart}ms`,
          });
          console.warn("[Gemini OCR] Gemini timeout", {
            source: "client_budget",
            elapsedMs: Date.now() - geminiStart,
            timeoutLimitMs: CLIENT_AI_TIMEOUT_MS,
          });
          console.warn("[Gemini OCR] Gemini fallback triggered", {
            category: timeoutFailure.category,
            reason: timeoutFailure.technicalDetail,
          });
          addDebugLog(
            "gemini_res",
            `[Gemini OCR] Gemini timeout | elapsed=${Date.now() - geminiStart}ms | limit=${CLIENT_AI_TIMEOUT_MS}ms`
          );
          addDebugLog(
            "gemini_res",
            `[Gemini OCR] Gemini fallback triggered | category=${timeoutFailure.category} | reason=${timeoutFailure.technicalDetail}`
          );
          setAiUnavailable(true);
          setAiFallbackMode(timeoutFailure.fallbackMode);
          setAiFallbackReason(timeoutFailure.friendlyMessage);
          setAiFallbackDetail(timeoutFailure.technicalDetail);
          setAiSucceeded(false);
          setAiSourceBadge(t("ocr.localOcrFallbackBadge"));
          break;
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;
        let didClientTimeout = false;
        const timeoutTimer = setTimeout(() => {
          didClientTimeout = true;
          controller.abort();
        }, remainingBudgetMs);

        let uploadStartMs = performance.now();
        let uploadDurationMs = 0;

        try {
          currentStage = "REQUEST_SEND";
          uploadStartMs = performance.now();
          const response = await fetch(ocrEndpoint, {
            method: requestMethod,
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream, application/json",
            },
            signal: controller.signal,
            body: requestBodyStr,
          });

          uploadDurationMs = Math.round(performance.now() - uploadStartMs);
          if (scanRunIdRef.current !== runId) {
            clearTimeout(timeoutTimer);
            shouldMoveToReview = false;
            return;
          }

          const contentType = response.headers.get("content-type") || "";
          const finalRequestUrl = response.url || ocrEndpoint;

          const isEventStream = contentType.includes("text/event-stream") && Boolean(response.body);
          const isJsonResponse = contentType.includes("application/json");

          if (isEventStream || isJsonResponse) {
            currentStage = "JSON_PARSE";
            let json: any = null;
            if (isEventStream && response.body) {
              try {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let sseBuffer = "";
                const processSseFrame = (rawFrame: string) => {
                  const normalized = rawFrame.replace(/\r\n/g, "\n");
                  const lines = normalized.split("\n");
                  let eventName = "message";
                  const dataLines: string[] = [];
                  for (const line of lines) {
                    if (!line || line.startsWith(":")) continue;
                    if (line.startsWith("event:")) {
                      eventName = line.slice(6).trim();
                    } else if (line.startsWith("data:")) {
                      dataLines.push(line.slice(5).trimStart());
                    }
                  }
                  if (dataLines.length === 0) return;
                  const payload = JSON.parse(dataLines.join("\n"));
                  if (eventName === "progress") {
                    const ev = payload as GeminiProgressEvent;
                    hasStreamedProgress = true;
                    clearAiStageTimers();
                    if (scanRunIdRef.current !== runId) return;
                    const totalModels = Math.max(
                      1,
                      ev.totalModels || GEMINI_RECEIPT_MODELS.length
                    );
                    const currentAttempt = Math.max(1, ev.attemptIndex || 1);
                    const passNum = Math.max(1, ev.pass || 1);
                    if (
                      ev.type === "start" ||
                      (ev.type === "attempt" && passNum === 1 && currentAttempt <= 1)
                    ) {
                      setAiProgress({
                        active: true,
                        pass: 1,
                        attempt: 1,
                        total: totalModels,
                      });
                      setScanStatusMessage(t("ocr.aiAnalyzingStatus"));
                    } else if (ev.type === "attempt") {
                      setAiProgress({
                        active: true,
                        pass: passNum,
                        attempt: currentAttempt,
                        total: totalModels,
                      });
                      setScanStatusMessage(t("ocr.aiInProgressStatus"));
                      addDebugLog(
                        "gemini_res",
                        `[Gemini OCR] Attempting model ${ev.model} (pass=${passNum}, attempt ${currentAttempt}/${totalModels})`
                      );
                    } else if (ev.type === "attempt_failed") {
                      addDebugLog(
                        "gemini_res",
                        `[Gemini OCR] Model ${ev.model} failed (pass=${passNum}, attempt ${currentAttempt}/${totalModels}) -> ${ev.errorCode || `HTTP_${ev.httpStatus ?? "?"}`}`
                      );
                    }
                  } else if (eventName === "result") {
                    json = payload;
                  }
                };

                while (true) {
                  const { value, done } = await reader.read();
                  if (scanRunIdRef.current !== runId) {
                    try {
                      await reader.cancel();
                    } catch {
                      // ignore
                    }
                    clearTimeout(timeoutTimer);
                    shouldMoveToReview = false;
                    return;
                  }
                  if (value) {
                    sseBuffer += decoder.decode(value, { stream: true });
                    let sepIdx: number;
                    while ((sepIdx = sseBuffer.search(/\r?\n\r?\n/)) !== -1) {
                      const frame = sseBuffer.slice(0, sepIdx);
                      const sepLen = sseBuffer.slice(sepIdx).startsWith("\r\n\r\n") ? 4 : 2;
                      sseBuffer = sseBuffer.slice(sepIdx + sepLen);
                      if (frame.trim()) {
                        processSseFrame(frame);
                      }
                    }
                  }
                  if (done) {
                    sseBuffer += decoder.decode();
                    if (sseBuffer.trim()) {
                      processSseFrame(sseBuffer);
                    }
                    break;
                  }
                }
              } catch (sseErr: any) {
                clearTimeout(timeoutTimer);
                if (sseErr?.name === "AbortError" || didClientTimeout) {
                  throw sseErr;
                }
                const streamParseFailure = resolveAiFailureDetails({
                  errorCategory: "parsing_error",
                  errorCode: "CLIENT_JSON_PARSE_ERROR",
                  httpStatus: response.status,
                  fallbackReason: `Failed to read SSE progress stream: ${sseErr?.message || "Invalid stream"}`,
                });
                console.warn("[Gemini OCR] Gemini fallback triggered", {
                  category: streamParseFailure.category,
                  reason: streamParseFailure.technicalDetail,
                });
                setAiUnavailable(true);
                setAiFallbackMode(streamParseFailure.fallbackMode);
                setAiFallbackReason(streamParseFailure.friendlyMessage);
                setAiFallbackDetail(streamParseFailure.technicalDetail);
                setAiSucceeded(false);
                setAiSourceBadge(t("ocr.localOcrFallbackBadge"));
                break;
              }
              if (!json) {
                clearTimeout(timeoutTimer);
                const missingResultFailure = resolveAiFailureDetails({
                  errorCategory: "network_error",
                  errorCode: "NETWORK_ERROR",
                  httpStatus: response.status,
                  fallbackReason: "SSE stream ended without a final result event",
                });
                setAiUnavailable(true);
                setAiFallbackMode(missingResultFailure.fallbackMode);
                setAiFallbackReason(missingResultFailure.friendlyMessage);
                setAiFallbackDetail(missingResultFailure.technicalDetail);
                setAiSucceeded(false);
                setAiSourceBadge(t("ocr.localOcrFallbackBadge"));
                break;
              }
            } else {
              try {
                json = await response.json();
              } catch (jsonParseErr: any) {
                clearTimeout(timeoutTimer);
                const parseFailure = resolveAiFailureDetails({
                  errorCategory: "parsing_error",
                  errorCode: "CLIENT_JSON_PARSE_ERROR",
                  httpStatus: response.status,
                  fallbackReason: `Failed to decode JSON response body: ${jsonParseErr?.message || "Invalid JSON"}`,
                });
                console.warn("[Gemini OCR] Gemini error response", {
                  stage: "JSON_PARSE",
                  httpStatus: response.status,
                  errorCategory: parseFailure.category,
                  detail: parseFailure.technicalDetail,
                });
                console.warn("[Gemini OCR] Gemini fallback triggered", {
                  category: parseFailure.category,
                  reason: parseFailure.technicalDetail,
                });
                addDebugLog(
                  "gemini_res",
                  `[Gemini OCR] Gemini error response | stage=JSON_PARSE | HTTP=${response.status} | reason=${parseFailure.technicalDetail}`
                );
                addDebugLog(
                  "gemini_res",
                  `[Gemini OCR] Gemini fallback triggered | category=${parseFailure.category} | reason=${parseFailure.technicalDetail}`
                );
                setAiUnavailable(true);
                setAiFallbackMode(parseFailure.fallbackMode);
                setAiFallbackReason(parseFailure.friendlyMessage);
                setAiFallbackDetail(parseFailure.technicalDetail);
                setAiSucceeded(false);
                setAiSourceBadge(t("ocr.localOcrFallbackBadge"));
                break;
              }
            }

            clearTimeout(timeoutTimer);
            const geminiElapsed = Date.now() - geminiStart;
            console.info("[Gemini OCR] HTTP response received", {
              stage: "JSON_PARSE",
              clientPlatform,
              clientAttempt: clientAttempt + 1,
              requestOrigin,
              requestUrl: finalRequestUrl,
              requestMethod,
              responseStatus: response.status,
              responseContentType: contentType || "(empty)",
              uploadDurationMs,
              durationMs: geminiElapsed,
            });
            if (scanRunIdRef.current !== runId) {
              shouldMoveToReview = false;
              return;
            }
            currentStage = "CLIENT_RESPONSE";
            const serverErrorCode = String(json.errorCode || json.error || "NONE");
            const resolvedWorkerErrorCode =
              json.workerErrorCode ||
              (!json.success &&
              !json.modelAttempted &&
              ["METHOD_NOT_ALLOWED", "INVALID_JSON", "ROUTE_NOT_FOUND", "WORKER_EXCEPTION", "MISSING_DATA", "SERVER_ERROR"].includes(
                serverErrorCode
              )
                ? serverErrorCode
                : "NONE");
            const resolvedGeminiErrorCode =
              json.geminiErrorCode ||
              (!json.success && resolvedWorkerErrorCode === "NONE" ? serverErrorCode : "NONE");
            const workerTimingSummary = json.workerTiming
              ? `stage=${json.workerTiming.stage}, contentLength=${json.workerTiming.contentLength}, bodySize=${json.workerTiming.requestBodySize ?? "?"}B, rx=${json.workerTiming.requestReceivedTimestamp}, done=${json.workerTiming.requestCompletedTimestamp}`
              : "not reported";

            addDebugLog(
              "gemini_res",
              `[Gemini OCR] Response (${clientPlatform}, attempt=${clientAttempt + 1}) | Stage=${json.failingStage || json.workerTiming?.stage || "CLIENT_RESPONSE"} | HTTP=${json.httpStatus ?? response.status} | WorkerCode=${resolvedWorkerErrorCode} | GeminiCode=${resolvedGeminiErrorCode} | Elapsed=${geminiElapsed}ms | WorkerTiming=(${workerTimingSummary})`,
              json
            );

        if (json.success && json.data) {
          const gData = json.data;
          const rawAiCurrency = gData.currency || localCurrency || "€";
          const resolvedCurrency =
            rawAiCurrency === "лв." || rawAiCurrency === "лв" || rawAiCurrency.toUpperCase() === "BGN"
              ? "€"
              : rawAiCurrency;
          setReceiptCurrency(resolvedCurrency);

          let finalTotal = localParsed.totalAmount;
          const aiTotalNum =
            typeof gData.totalAmount === "number"
              ? gData.totalAmount
              : parseFloat(String(gData.totalAmount || "").replace(",", "."));

          if (Number.isFinite(aiTotalNum) && aiTotalNum > 0) {
            if (localParsed.totalAmount > 0) {
              if (aiTotalNum < localParsed.totalAmount * 0.7) {
                addDebugLog(
                  "parsed_total",
                  `⚠️ Отхвърлена подозрителна сума от Gemini (${aiTotalNum} ${resolvedCurrency}). Запазена е правилната обща сума от OCR: ${localParsed.totalAmount} ${resolvedCurrency}`
                );
                finalTotal = localParsed.totalAmount;
              } else {
                finalTotal = aiTotalNum;
              }
            } else {
              finalTotal = aiTotalNum;
            }
          }

          setAmount(finalTotal > 0 ? finalTotal.toFixed(2) : "");
          setDetectedTotal(finalTotal);

          // Merchant
          const cleanAiMerchant = typeof gData.merchantName === "string" ? gData.merchantName.trim() : "";
          const isPlaceholderMerchant = /^(?:неизвестен търговец|неразпознат търговец|unknown(?:\s+merchant)?|n\/a)$/i.test(
            cleanAiMerchant
          );
          if (cleanAiMerchant && !isPlaceholderMerchant) {
            setMerchantName(cleanAiMerchant);
            setDetectedMerchant(cleanAiMerchant);
            addDebugLog("parsed_merchant", `Gemini търговец: "${cleanAiMerchant}"`);
          }

          // Date Priority: 1. OCR detected date -> 2. AI calendar-valid date -> 3. User correction -> 4. Today fallback
          const rawAiDate = typeof gData.date === "string" ? gData.date.trim() : "";
          const aiDateParts = rawAiDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          const isValidGeminiDate = Boolean(
            aiDateParts &&
              isValidCalendarDate(
                parseInt(aiDateParts[1], 10),
                parseInt(aiDateParts[2], 10),
                parseInt(aiDateParts[3], 10)
              )
          );
          if (localParsed.dateDetected) {
            addDebugLog(
              "parsed_date",
              `Запазена дата от OCR: "${localParsed.date}" (Приоритет 1: OCR датата не се презаписва от AI${isValidGeminiDate && rawAiDate !== localParsed.date ? `, AI предложи "${rawAiDate}"` : ""})`
            );
          } else if (isValidGeminiDate) {
            setDate(rawAiDate);
            setDetectedDate(rawAiDate);
            setDateFallbackReason(null);
            setWarnings((prev) =>
              prev.filter(
                (w) =>
                  !w.includes("Датата") &&
                  !w.includes("Не е открита дата") &&
                  !w.toLowerCase().includes("receipt date was not detected")
              )
            );
            addDebugLog("parsed_date", `AI (Gemini) detected date: "${rawAiDate}" | Final date: "${rawAiDate}"`);
          } else {
            addDebugLog(
              "parsed_date",
              `Нито OCR, нито AI откриха валидна дата. Final fallback date: "${localParsed.date}" | Reason: ${localParsed.dateFallbackReason || "Липсва четима дата на бележката"}`
            );
          }

          const resolvedExpectedCount =
            typeof gData.expectedItemsCount === "number" && gData.expectedItemsCount > 0
              ? gData.expectedItemsCount
              : localParsed.expectedItemsCount ?? null;
          setExpectedItemsCount(resolvedExpectedCount);

          // Normalize Gemini items & compare against local OCR items to prevent truncation
          type ReconcileItemInput = ReceiptItemDetail & { unitPrice?: number };
          const geminiNormalizedItems: ReconcileItemInput[] = Array.isArray(gData.items)
            ? gData.items
                .map((it: any) => {
                  const rawPrice =
                    typeof it?.price === "number"
                      ? it.price
                      : parseFloat(String(it?.price || "").replace(/[^\d.,-]/g, "").replace(",", "."));
                  const rawOrig =
                    typeof it?.originalPrice === "number"
                      ? it.originalPrice
                      : parseFloat(String(it?.originalPrice || "").replace(/[^\d.,-]/g, "").replace(",", "."));
                  const rawDisc =
                    typeof it?.discount === "number"
                      ? Math.abs(it.discount)
                      : Math.abs(parseFloat(String(it?.discount || "").replace(/[^\d.,-]/g, "").replace(",", ".")));
                  const rawFinal =
                    typeof it?.finalPrice === "number"
                      ? it.finalPrice
                      : parseFloat(String(it?.finalPrice || "").replace(/[^\d.,-]/g, "").replace(",", "."));
                  const discLabel =
                    typeof it?.discountLabel === "string" && it.discountLabel.trim()
                      ? it.discountLabel.trim()
                      : undefined;
                  const hasDiscount = Number.isFinite(rawDisc) && rawDisc > 0;
                  const origPrice = hasDiscount
                    ? Number.isFinite(rawOrig) && rawOrig > 0
                      ? parseFloat(rawOrig.toFixed(2))
                      : parseFloat(((Number.isFinite(rawFinal) && rawFinal > 0 ? rawFinal : rawPrice) + rawDisc).toFixed(2))
                    : undefined;
                  const finalPriceVal = hasDiscount
                    ? Number.isFinite(rawFinal) && rawFinal >= 0
                      ? parseFloat(rawFinal.toFixed(2))
                      : origPrice !== undefined
                      ? parseFloat(Math.max(0, origPrice - rawDisc).toFixed(2))
                      : parseFloat((rawPrice || 0).toFixed(2))
                    : undefined;
                  const effectivePrice =
                    finalPriceVal !== undefined
                      ? finalPriceVal
                      : Number.isFinite(rawPrice)
                      ? parseFloat(rawPrice.toFixed(2))
                      : 0;
                  const rawQty =
                    typeof it?.quantity === "number"
                      ? it.quantity
                      : parseFloat(String(it?.quantity || "").replace(",", "."));
                  const rawUnitPrice =
                    typeof it?.unitPrice === "number"
                      ? it.unitPrice
                      : parseFloat(String(it?.unitPrice || "").replace(/[^\d.,-]/g, "").replace(",", "."));
                  const res: ReconcileItemInput = {
                    name: typeof it?.name === "string" ? it.name.trim() : "",
                    price: effectivePrice,
                    quantity: Number.isFinite(rawQty) && rawQty >= 1 ? Math.round(rawQty) : 1,
                    ...(Number.isFinite(rawUnitPrice) && rawUnitPrice > 0
                      ? { unitPrice: parseFloat(rawUnitPrice.toFixed(3)) }
                      : {}),
                    ...(hasDiscount && origPrice !== undefined && finalPriceVal !== undefined
                      ? {
                          originalPrice: origPrice,
                          discount: parseFloat(rawDisc.toFixed(2)),
                          finalPrice: finalPriceVal,
                          ...(discLabel ? { discountLabel: discLabel } : {}),
                        }
                      : {}),
                  };
                  return res;
                })
                .filter((it: ReconcileItemInput) => it.name.length > 0 && it.price >= 0 && (it.price > 0 || (it.discount ?? 0) > 0))
            : [];

          const bestChoice = chooseBestItemSet(
            initialItems,
            geminiNormalizedItems,
            finalTotal,
            resolvedExpectedCount
          );
          const mergedGeminiItems: ReconcileItemInput[] =
            bestChoice.source === "gemini" && initialItems.length === bestChoice.items.length
              ? (bestChoice.items as ReconcileItemInput[]).map((gItem, idx) => {
                  const localMatch = initialItems[idx];
                  let merged: ReconcileItemInput = gItem;
                  if (
                    localMatch &&
                    (localMatch.quantity || 1) > 1 &&
                    (merged.quantity || 1) === 1 &&
                    Math.abs(localMatch.price - merged.price) <= 0.02
                  ) {
                    merged = { ...merged, quantity: localMatch.quantity };
                  }
                  if (
                    localMatch &&
                    localMatch.discount &&
                    localMatch.discount > 0 &&
                    !merged.discount &&
                    Math.abs((localMatch.finalPrice ?? localMatch.price) - merged.price) <= 0.03
                  ) {
                    merged = {
                      ...merged,
                      originalPrice: localMatch.originalPrice,
                      discount: localMatch.discount,
                      finalPrice: merged.price,
                      discountLabel: localMatch.discountLabel,
                    };
                  }
                  return merged;
                })
              : (bestChoice.items as ReconcileItemInput[]);
          const resolvedItems: ReceiptItemDetail[] = (
            bestChoice.source === "gemini"
              ? reconcileReceiptItemQuantities(
                  mergedGeminiItems,
                  gData.rawText || ocrRawText,
                  localParsed.items,
                  Array.isArray(gData.quantityLines) ? gData.quantityLines : []
                )
              : mergedGeminiItems
          ).map(({ unitPrice: _unitPrice, ...rest }) => rest);
          const totalAttachedDisc = parseFloat(
            resolvedItems.reduce((s, it) => s + (it.discount || 0), 0).toFixed(2)
          );
          const unattachedDisc = Math.max(
            0,
            parseFloat(((localParsed.discountTotal || 0) - totalAttachedDisc).toFixed(2))
          );
          if (totalAttachedDisc > 0) {
            setDetectedDiscount(Math.max(localParsed.discountTotal || 0, totalAttachedDisc));
          }
          const validation = validateReceiptTotals(
            resolvedItems,
            finalTotal,
            resolvedExpectedCount ?? undefined,
            unattachedDisc,
            resolvedCurrency
          );

          setReceiptItems(resolvedItems);
          setSelectedItemIndices(new Set(resolvedItems.map((_, idx) => idx)));
          setDetectedItemsCount(resolvedItems.length);
          setConfirmMismatchOverride(false);

          addDebugLog(
            "parsed_total",
            `Final Validation (${bestChoice.reason}) | Receipt Total: ${validation.receiptTotal.toFixed(2)} ${resolvedCurrency} | Items Total: ${validation.itemsTotal.toFixed(2)} ${resolvedCurrency} | Difference: ${validation.difference.toFixed(2)} ${resolvedCurrency} (${validation.differencePercent.toFixed(1)}%) | Detected items: ${resolvedItems.length} | Expected items: ${resolvedExpectedCount ?? "неизвестно"}`
          );

          addDebugLog(
            "parsed_items",
            `Финални артикули и количества (${resolvedItems.length}): ${resolvedItems
              .map((it) => `${it.quantity || 1} x ${it.name} - ${it.price.toFixed(2)}`)
              .join(" | ")}`,
            resolvedItems
          );

          if (validation.isMismatch && validation.warningMessage) {
            setWarnings((prev) => {
              const filtered = prev.filter((w) => !w.includes("Possible missing receipt items"));
              return [...filtered, validation.warningMessage!];
            });
          } else {
            setWarnings((prev) => prev.filter((w) => !w.includes("Possible missing receipt items")));
          }

          if (resolvedItems.length > 0) {
            setNotes(formatReceiptNotes(resolvedItems, resolvedCurrency));
          } else if (gData.notesFormatted && gData.notesFormatted.trim().length > 3) {
            setNotes(gData.notesFormatted.trim());
          } else if (localParsed.notesFormatted) {
            setNotes(localParsed.notesFormatted);
          }

          if (gData.rawText) {
            setRawText(gData.rawText);
          }

          const aiRawAddress =
            typeof gData.address === "string" ? gData.address.trim() : "";
          const isValidDirectAiAddress = (rawAddr: string): boolean => {
            if (!rawAddr || rawAddr.length < 5) return false;
            const letters = rawAddr.match(/[а-яА-Яa-zA-Z]/g) || [];
            if (letters.length < 3) return false;
            if (/(?:ЕООД|ООД|ЕАД|ЕИК|БУЛСТАТ|BG\s*\d{8,11}|СЕДАЛИЩЕ|ЮРИДИЧЕСКИ\s+АДРЕС)/i.test(rawAddr)) {
              return false;
            }
            return true;
          };
          const aiAddressCandidate =
            (aiRawAddress
              ? extractReceiptAddressFromText(aiRawAddress) ||
                (isValidDirectAiAddress(aiRawAddress) ? aiRawAddress : undefined)
              : undefined) ||
            (typeof gData.rawText === "string"
              ? extractReceiptAddressFromText(gData.rawText)
              : undefined);

          if (aiAddressCandidate && !locationEditedByUserRef.current) {
            const nextAiLocation = normalizeLocation({
              address: aiAddressCandidate,
            });
            if (nextAiLocation) {
              const ocrHasStreet = Boolean(
                prefilledOcrLocation?.address &&
                  /(?:ул\.|бул\.|ж\.к\.|кв\.|пл\.|шосе|местност|str\.?|blvd\.?|\d)/i.test(
                    prefilledOcrLocation.address
                  )
              );
              const aiHasStreet = /(?:ул\.|бул\.|ж\.к\.|кв\.|пл\.|шосе|местност|str\.?|blvd\.?|\d)/i.test(
                nextAiLocation.address
              );
              if (!prefilledOcrLocation || (!ocrHasStreet && aiHasStreet)) {
                setLocation((prev) => (!prev || !ocrHasStreet ? nextAiLocation : prev));
                addDebugLog(
                  "parsed_merchant",
                  `AI detected store address: "${nextAiLocation.address}"`
                );
              }
            }
          }

          // Smart category suggestion from Gemini + BG dictionary
          const enrichedCat = matchCategory(
            {
              merchantName: cleanAiMerchant && !isPlaceholderMerchant ? cleanAiMerchant : localParsed.merchantName,
              rawText: gData.rawText || ocrRawText,
              suggestedCategory: gData.suggestedCategory,
            },
            categories
          );
          setSelectedCategory(enrichedCat);
          const matchingBudgetId = findMatchingBudgetCategoryId(enrichedCat.id, enrichedCat.name, budgetCategories);
          if (matchingBudgetId) {
            setSelectedBudgetCategoryId(matchingBudgetId);
          }

          console.info("[Gemini OCR] Gemini request completed", {
            modelUsed: json.modelUsed || "unknown",
            durationMs: Date.now() - geminiStart,
            httpStatus: json.httpStatus ?? response.status,
            itemsCount: resolvedItems.length,
            attempts: json.diagnostics?.attempts || [],
          });
          addDebugLog(
            "gemini_res",
            `[Gemini OCR] Gemini request completed -> model="${json.modelUsed || "unknown"}" | durationMs=${Date.now() - geminiStart} | merchant="${cleanAiMerchant || localParsed.merchantName}" | items=${resolvedItems.length} | category="${enrichedCat.name}"`
          );

              setAiSucceeded(true);
              setAiUnavailable(false);
              setAiFallbackReason(null);
              setAiFallbackDetail(null);
              setAiSourceBadge(json.modelUsed ? `AI (${json.modelUsed}) + OCR` : t("ocr.aiOcrAnalysisBadge"));
              break;
            } else {
              const serverStage: OcrPipelineStage =
                json.failingStage ||
                json.workerTiming?.stage ||
                (resolvedWorkerErrorCode !== "NONE" ? "WORKER_PARSE" : "GEMINI_RESPONSE");
              const effectiveStatus = json.httpStatus ?? response.status;
              const technicalReason = json.fallbackReason || json.message || serverErrorCode;
              const isServerTimeout =
                json.errorCategory === "timeout" ||
                serverErrorCode === "GEMINI_TIMEOUT" ||
                effectiveStatus === 504 ||
                effectiveStatus === 524;
              const isTransientWorkerFailure =
                ["WORKER_EXCEPTION", "SERVER_ERROR", "HTTP_500", "HTTP_502", "HTTP_503", "HTTP_504"].includes(
                  resolvedWorkerErrorCode
                ) ||
                ["WORKER_EXCEPTION", "SERVER_ERROR"].includes(serverErrorCode) ||
                (typeof effectiveStatus === "number" &&
                  effectiveStatus >= 500 &&
                  !isServerTimeout);

              if (isServerTimeout) {
                console.warn("[Gemini OCR] Gemini timeout", {
                  source: "server",
                  modelAttempted: json.modelAttempted,
                  timeoutReason: json.timeoutReason || technicalReason,
                  elapsedMs: Date.now() - geminiStart,
                  attempts: json.diagnostics?.attempts || [],
                });
                addDebugLog(
                  "gemini_res",
                  `[Gemini OCR] Gemini timeout (server) | model=${json.modelAttempted || "?"} | reason=${json.timeoutReason || technicalReason}`
                );
              } else {
                console.warn("[Gemini OCR] Gemini error response", {
                  failingStage: serverStage,
                  clientAttempt: clientAttempt + 1,
                  requestUrl: finalRequestUrl,
                  httpStatus: effectiveStatus,
                  errorCategory: json.errorCategory || "gemini_response_error",
                  workerErrorCode: resolvedWorkerErrorCode,
                  geminiErrorCode: resolvedGeminiErrorCode,
                  modelAttempted: json.modelAttempted || null,
                  technicalReason,
                  attempts: json.diagnostics?.attempts || [],
                });
                addDebugLog(
                  "gemini_res",
                  `[Gemini OCR] Gemini error response (attempt=${clientAttempt + 1}) | Stage=${serverStage} | Category=${json.errorCategory || "gemini_response_error"} | HTTP=${effectiveStatus} | Model=${json.modelAttempted || "?"} | WorkerCode=${resolvedWorkerErrorCode} | GeminiCode=${resolvedGeminiErrorCode} | reason=${technicalReason}`
                );
              }

              const serverAlreadyTriedModels =
                Array.isArray(json.diagnostics?.attempts) && json.diagnostics.attempts.length > 0;
              if (
                isTransientWorkerFailure &&
                !serverAlreadyTriedModels &&
                clientAttempt < maxClientAttempts - 1 &&
                overallDeadlineMs - Date.now() > 35000
              ) {
                abortControllerRef.current = null;
                setScanStatusMessage(t("ocr.aiRetryStatus"));
                await sleepClient(1800);
                continue;
              }

              const failure = resolveAiFailureDetails({
                errorCategory: json.errorCategory,
                errorCode:
                  resolvedWorkerErrorCode !== "NONE"
                    ? resolvedWorkerErrorCode
                    : serverErrorCode,
                geminiErrorCode: resolvedGeminiErrorCode,
                workerErrorCode: resolvedWorkerErrorCode,
                httpStatus: effectiveStatus,
                modelAttempted: json.modelAttempted,
                fallbackReason: json.fallbackReason || json.message,
                timeoutReason: json.timeoutReason,
                isTimeout: isServerTimeout,
                quotaDiagnostics: json.diagnostics?.quotaDiagnostics,
                attempts: json.diagnostics?.attempts,
              });

              console.warn("[Gemini OCR] Gemini fallback triggered", {
                category: failure.category,
                fallbackMode: failure.fallbackMode,
                friendlyMessage: failure.friendlyMessage,
                technicalDetail: failure.technicalDetail,
              });
              addDebugLog(
                "gemini_res",
                `[Gemini OCR] Gemini fallback triggered | category=${failure.category} | mode=${failure.fallbackMode} | reason=${failure.technicalDetail}`
              );

              setAiUnavailable(true);
              setAiFallbackMode(failure.fallbackMode);
              setAiFallbackReason(failure.friendlyMessage);
              setAiFallbackDetail(failure.technicalDetail);
              setAiSucceeded(false);
              setAiSourceBadge(t("ocr.localOcrFallbackBadge"));
              break;
            }
          } else {
            clearTimeout(timeoutTimer);
            console.warn("[Gemini OCR] Gemini error response (Non-JSON)", {
              failingStage: "JSON_PARSE",
              clientAttempt: clientAttempt + 1,
              requestOrigin,
              requestUrl: finalRequestUrl,
              httpStatus: response.status,
              contentType: contentType || "(empty)",
            });
            addDebugLog(
              "gemini_res",
              `[Gemini OCR] Gemini error response (attempt=${clientAttempt + 1}) | Stage=JSON_PARSE | HTTP=${response.status} | Non-JSON ContentType=${contentType || "(empty)"}`
            );

            if (
              response.status >= 500 &&
              clientAttempt < maxClientAttempts - 1 &&
              overallDeadlineMs - Date.now() > 35000
            ) {
              abortControllerRef.current = null;
              setScanStatusMessage(t("ocr.aiRetryStatus"));
              await sleepClient(1800);
              continue;
            }

            const nonJsonFailure = resolveAiFailureDetails({
              errorCategory: "parsing_error",
              errorCode: "NON_JSON_RESPONSE",
              httpStatus: response.status,
              fallbackReason: `Expected application/json from ${finalRequestUrl} but received ${contentType || "empty content-type"} (HTTP ${response.status})`,
            });
            console.warn("[Gemini OCR] Gemini fallback triggered", {
              category: nonJsonFailure.category,
              reason: nonJsonFailure.technicalDetail,
            });
            addDebugLog(
              "gemini_res",
              `[Gemini OCR] Gemini fallback triggered | category=${nonJsonFailure.category} | reason=${nonJsonFailure.technicalDetail}`
            );

            setAiUnavailable(true);
            setAiFallbackMode(nonJsonFailure.fallbackMode);
            setAiFallbackReason(nonJsonFailure.friendlyMessage);
            setAiFallbackDetail(nonJsonFailure.technicalDetail);
            setAiSucceeded(false);
            setAiSourceBadge(t("ocr.localOcrFallbackBadge"));
            break;
          }
        } catch (gErr: any) {
          uploadDurationMs = Math.round(performance.now() - uploadStartMs);
          clearTimeout(timeoutTimer);

          if (scanRunIdRef.current !== runId) {
            shouldMoveToReview = false;
            return;
          }

          const isAbort = gErr?.name === "AbortError";
          if (isAbort && !didClientTimeout) {
            // Cancelled or skipped explicitly by user
            shouldMoveToReview = false;
            return;
          }

          const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
          const failedClientStage: OcrPipelineStage =
            currentStage === "JSON_PARSE" ? "JSON_PARSE" : "REQUEST_SEND";
          const totalElapsedMs = Date.now() - geminiStart;

          if (didClientTimeout || isAbort) {
            console.warn("[Gemini OCR] Gemini timeout", {
              source: "client_abort",
              clientPlatform,
              clientAttempt: clientAttempt + 1,
              elapsedMs: totalElapsedMs,
              timeoutLimitMs: CLIENT_AI_TIMEOUT_MS,
              requestUrl: ocrEndpoint,
            });
            addDebugLog(
              "gemini_res",
              `[Gemini OCR] Gemini timeout (client) | elapsed=${totalElapsedMs}ms | limit=${CLIENT_AI_TIMEOUT_MS}ms | URL=${ocrEndpoint}`
            );
          } else {
            console.warn("[Gemini OCR] Gemini error response (Network/Fetch Exception)", {
              clientPlatform,
              clientAttempt: clientAttempt + 1,
              failingStage: failedClientStage,
              requestOrigin,
              requestUrl: ocrEndpoint,
              requestMethod,
              jsonPayloadBytes,
              uploadDurationMs,
              isOffline,
              errorName: gErr?.name,
              errorMessage: gErr?.message,
            });
            addDebugLog(
              "gemini_res",
              `[Gemini OCR] Gemini error response (${clientPlatform}, attempt=${clientAttempt + 1}) | Stage=${failedClientStage} | Upload=${uploadDurationMs}ms | offline=${isOffline} | reason=${gErr?.message || "Network error"}`
            );
          }

          if (
            !isAbort &&
            !isOffline &&
            clientAttempt < maxClientAttempts - 1 &&
            overallDeadlineMs - Date.now() > 35000
          ) {
            abortControllerRef.current = null;
            setScanStatusMessage(t("ocr.aiRetryStatus"));
            await sleepClient(1800);
            continue;
          }

          const netFailure = resolveAiFailureDetails({
            errorCategory: didClientTimeout || isAbort ? "timeout" : "network_error",
            errorCode: didClientTimeout || isAbort ? "CLIENT_TIMEOUT" : "NETWORK_ERROR",
            isTimeout: didClientTimeout || isAbort,
            isOffline,
            fallbackReason:
              didClientTimeout || isAbort
                ? `Client request aborted after ${totalElapsedMs}ms (limit ${CLIENT_AI_TIMEOUT_MS}ms)`
                : gErr?.message || "Network fetch failed",
          });

          console.warn("[Gemini OCR] Gemini fallback triggered", {
            category: netFailure.category,
            friendlyMessage: netFailure.friendlyMessage,
            technicalDetail: netFailure.technicalDetail,
          });
          addDebugLog(
            "gemini_res",
            `[Gemini OCR] Gemini fallback triggered | category=${netFailure.category} | reason=${netFailure.technicalDetail}`
          );

          setAiUnavailable(true);
          setAiFallbackMode(netFailure.fallbackMode);
          setAiFallbackReason(netFailure.friendlyMessage);
          setAiFallbackDetail(netFailure.technicalDetail);
          setAiSucceeded(false);
          setAiSourceBadge(t("ocr.localOcrFallbackBadge"));
          break;
        }
      }
    } finally {
      clearAiStageTimers();
      abortControllerRef.current = null;
      setAiProgress(null);
      if (shouldMoveToReview && scanRunIdRef.current === runId) {
        setStep("review");
      }
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const getEffectiveReceiptTotal = (
    itemsList: ReceiptItemDetail[],
    baseDetectedTotal: number
  ): number => {
    if (baseDetectedTotal <= 0) return 0;
    const tipSum = itemsList
      .filter(isTipReceiptItem)
      .reduce((sum, it) => sum + (it.finalPrice ?? it.price), 0);
    return parseFloat((baseDetectedTotal + tipSum).toFixed(2));
  };

  const handleToggleReceiptItem = (index: number) => {
    if (splitBillEnabled) {
      modifiedAfterSplitRef.current = true;
    }
    const next = new Set(selectedItemIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    applyItemSelection(next, receiptItems, getEffectiveReceiptTotal(receiptItems, detectedTotal));
  };

  const handleSelectAllItems = () => {
    if (splitBillEnabled) {
      modifiedAfterSplitRef.current = true;
    }
    const all = new Set(receiptItems.map((_, idx) => idx));
    applyItemSelection(all, receiptItems, getEffectiveReceiptTotal(receiptItems, detectedTotal));
  };

  const handleDeselectAllItems = () => {
    if (splitBillEnabled) {
      modifiedAfterSplitRef.current = true;
    }
    applyItemSelection(new Set(), receiptItems, getEffectiveReceiptTotal(receiptItems, detectedTotal));
  };

  const buildUpdatedNotesWithSelection = (
    prevNotes: string,
    prevSelectedItems: ReceiptItemDetail[],
    nextSelectedItems: ReceiptItemDetail[],
    activeCurrency: string
  ): string => {
    const existingPlainNote = parseExpenseNote(
      prevNotes,
      merchantName,
      prevSelectedItems
    ).plainNote;
    const formattedItems = formatReceiptNotes(nextSelectedItems, activeCurrency);
    if (existingPlainNote && formattedItems) {
      return `${existingPlainNote}\n${formattedItems}`;
    }
    return existingPlainNote || formattedItems;
  };

  const handleToggleSplitBill = (nextEnabled: boolean) => {
    setSplitBillEnabled(nextEnabled);
    if (receiptItems.length === 0) {
      preSplitSnapshotRef.current = null;
      modifiedAfterSplitRef.current = false;
      return;
    }

    const activeCurrency = receiptCurrency || "€";
    const prevSelectedItems = receiptItems.filter((_, idx) => selectedItemIndices.has(idx));

    if (nextEnabled) {
      preSplitSnapshotRef.current = {
        items: receiptItems.map((it) => ({ ...it })),
        selectedIndices: new Set(selectedItemIndices),
      };
      modifiedAfterSplitRef.current = false;

      const { items: splitItems, selectedIndices: nextSelected } =
        splitReceiptItemsWithSelection(receiptItems, selectedItemIndices);

      setReceiptItems(splitItems);
      setSelectedItemIndices(nextSelected);
      setDetectedItemsCount(splitItems.length);
      setEditingItemIndex(null);
      setErrorMessage(null);

      const nextSelectedItems = splitItems.filter((_, idx) => nextSelected.has(idx));
      setNotes(
        buildUpdatedNotesWithSelection(
          notes,
          prevSelectedItems,
          nextSelectedItems,
          activeCurrency
        )
      );
    } else {
      let restoredItems: ReceiptItemDetail[];
      let restoredSelected: Set<number>;

      if (preSplitSnapshotRef.current && !modifiedAfterSplitRef.current) {
        restoredItems = preSplitSnapshotRef.current.items.map((it) => ({ ...it }));
        restoredSelected = new Set(preSplitSnapshotRef.current.selectedIndices);
      } else {
        const merged = mergeAdjacentSplitReceiptItems(
          receiptItems,
          selectedItemIndices
        );
        restoredItems = merged.items;
        restoredSelected = merged.selectedIndices;
      }

      setReceiptItems(restoredItems);
      setSelectedItemIndices(restoredSelected);
      setDetectedItemsCount(restoredItems.length);
      setEditingItemIndex(null);
      setErrorMessage(null);

      const nextSelectedItems = restoredItems.filter((_, idx) => restoredSelected.has(idx));
      setNotes(
        buildUpdatedNotesWithSelection(
          notes,
          prevSelectedItems,
          nextSelectedItems,
          activeCurrency
        )
      );

      preSplitSnapshotRef.current = null;
      modifiedAfterSplitRef.current = false;
    }
  };

  // Sync items list after manual addition, inline edit, or removal
  const commitItemsMutation = (
    nextItems: ReceiptItemDetail[],
    nextSelected: Set<number>
  ) => {
    if (splitBillEnabled) {
      modifiedAfterSplitRef.current = true;
    }
    setReceiptItems(nextItems);
    setSelectedItemIndices(nextSelected);
    setDetectedItemsCount(nextItems.length);
    setConfirmMismatchOverride(false);
    setErrorMessage(null);

    const selectedItems = nextItems.filter((_, idx) => nextSelected.has(idx));
    const selectedSum = parseFloat(
      selectedItems.reduce((sum, it) => sum + it.price, 0).toFixed(2)
    );
    const activeCurrency = receiptCurrency || "€";
    setNotes(formatReceiptNotes(selectedItems, activeCurrency));

    const effectiveTotal = getEffectiveReceiptTotal(nextItems, detectedTotal);
    if (nextItems.length === 0) {
      return;
    }
    if (selectedItems.length === 0) {
      setAmount("0.00");
    } else if (
      effectiveTotal > 0 &&
      selectedItems.length === nextItems.length &&
      Math.abs(selectedSum - effectiveTotal) <= 0.05
    ) {
      setAmount(effectiveTotal.toFixed(2));
    } else {
      setAmount(selectedSum.toFixed(2));
    }
  };

  const existingTipIndex = receiptItems.findIndex(isTipReceiptItem);
  const existingTipItem = existingTipIndex !== -1 ? receiptItems[existingTipIndex] : null;

  const handleOpenTipModal = () => {
    setTipError(null);
    setTipInputAmount(
      existingTipItem ? (existingTipItem.finalPrice ?? existingTipItem.price).toFixed(2) : ""
    );
    setShowTipModal(true);
  };

  const handleSaveTip = () => {
    const parsedTip = parseFloat(tipInputAmount.replace(",", "."));
    if (isNaN(parsedTip) || parsedTip <= 0) {
      setTipError(t("ocr.tipInvalidError"));
      return;
    }

    const cleanTip = parseFloat(parsedTip.toFixed(2));
    const hadItemsBeforeTip = receiptItems.length > 0;
    const prevAmountNum = parseFloat(amount) || 0;
    const existingIdx = receiptItems.findIndex(isTipReceiptItem);

    let nextItems: ReceiptItemDetail[];
    const nextSelected = new Set(selectedItemIndices);

    if (existingIdx !== -1) {
      nextItems = receiptItems.map((it, idx) =>
        idx === existingIdx ? { name: TIP_ITEM_NAME, quantity: 1, price: cleanTip } : it
      );
      nextSelected.add(existingIdx);
    } else {
      nextItems = [
        ...receiptItems,
        { name: TIP_ITEM_NAME, quantity: 1, price: cleanTip },
      ];
      nextSelected.add(nextItems.length - 1);
    }

    commitItemsMutation(nextItems, nextSelected);

    if (!hadItemsBeforeTip && prevAmountNum > 0) {
      setAmount((prevAmountNum + cleanTip).toFixed(2));
    }

    setShowTipModal(false);
    setTipInputAmount("");
    setTipError(null);
  };

  // Step 4: Add manual item
  const handleAddManualItem = () => {
    const cleanName = newItemName.trim();
    const parsedQty = Math.max(1, Math.round(parseFloat(newItemQuantity.replace(",", ".")) || 1));
    const parsedPrice = parseFloat(newItemPrice.replace(",", "."));
    if (!cleanName) {
      setErrorMessage(t("ocr.errEmptyItemName"));
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setErrorMessage(t("ocr.errInvalidItemPrice"));
      return;
    }

    const nextItems: ReceiptItemDetail[] = [
      ...receiptItems,
      { name: cleanName, quantity: parsedQty, price: parseFloat(parsedPrice.toFixed(2)) },
    ];
    const nextSelected = new Set(selectedItemIndices);
    nextSelected.add(nextItems.length - 1);
    commitItemsMutation(nextItems, nextSelected);

    setNewItemName("");
    setNewItemQuantity("1");
    setNewItemPrice("");
    setShowAddItemForm(false);
  };

  // Step 5: Start / Save / Delete inline edited item
  const handleStartEditItem = (idx: number) => {
    const target = receiptItems[idx];
    if (!target) return;
    setEditingItemIndex(idx);
    setEditItemName(target.name);
    setEditItemQuantity(String(target.quantity && target.quantity >= 1 ? target.quantity : 1));
    setEditItemPrice(target.price.toFixed(2));
    setErrorMessage(null);
  };

  const handleSaveEditItem = (idx: number) => {
    const cleanName = editItemName.trim();
    const parsedQty = Math.max(1, Math.round(parseFloat(editItemQuantity.replace(",", ".")) || 1));
    const parsedPrice = parseFloat(editItemPrice.replace(",", "."));
    if (!cleanName) {
      setErrorMessage(t("ocr.errEmptyItemName"));
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setErrorMessage(t("ocr.errInvalidItemPrice"));
      return;
    }

    const nextItems = receiptItems.map((it, i) => {
      if (i !== idx) return it;
      const nextPrice = parseFloat(parsedPrice.toFixed(2));
      if (it.originalPrice && it.originalPrice > nextPrice) {
        return {
          ...it,
          name: cleanName,
          quantity: parsedQty,
          price: nextPrice,
          finalPrice: nextPrice,
          discount: parseFloat((it.originalPrice - nextPrice).toFixed(2)),
        };
      }
      return {
        name: cleanName,
        quantity: parsedQty,
        price: nextPrice,
      };
    });
    commitItemsMutation(nextItems, new Set(selectedItemIndices));
    setEditingItemIndex(null);
  };

  const handleDeleteItem = (idx: number) => {
    const nextItems = receiptItems.filter((_, i) => i !== idx);
    const nextSelected = new Set<number>();
    selectedItemIndices.forEach((selectedIdx) => {
      if (selectedIdx < idx) nextSelected.add(selectedIdx);
      else if (selectedIdx > idx) nextSelected.add(selectedIdx - 1);
    });
    if (editingItemIndex === idx) {
      setEditingItemIndex(null);
    } else if (editingItemIndex !== null && editingItemIndex > idx) {
      setEditingItemIndex(editingItemIndex - 1);
    }
    commitItemsMutation(nextItems, nextSelected);
  };

  const formatDisplayPrice = (val: number) =>
    `${receiptCurrency || "€"}${val.toFixed(2)}`;

  // Computed receipt totals, Selection Mode total, and >5% consistency validation
  const itemsFullSum = parseFloat(
    receiptItems.reduce((sum, item) => sum + (item.finalPrice ?? item.price), 0).toFixed(2)
  );
  const attachedDiscountSum = parseFloat(
    receiptItems.reduce((sum, item) => sum + (item.discount || 0), 0).toFixed(2)
  );
  const activeTipSum = parseFloat(
    receiptItems
      .filter(isTipReceiptItem)
      .reduce((sum, item) => sum + (item.finalPrice ?? item.price), 0)
      .toFixed(2)
  );
  const effectiveDetectedTotal =
    detectedTotal > 0 ? parseFloat((detectedTotal + activeTipSum).toFixed(2)) : 0;
  const receiptTotalDisplay = effectiveDetectedTotal > 0 ? effectiveDetectedTotal : itemsFullSum;
  const selectedItemsList = receiptItems.filter((_, idx) => selectedItemIndices.has(idx));
  const isPartialSelection =
    receiptItems.length > 0 && selectedItemIndices.size < receiptItems.length;
  const selectedItemsSum = parseFloat(
    selectedItemsList.reduce((sum, item) => sum + (item.finalPrice ?? item.price), 0).toFixed(2)
  );

  const liveAmountNum = parseFloat(amount) || 0;
  const liveUnattachedDiscount = Math.max(
    0,
    parseFloat((detectedDiscount - attachedDiscountSum).toFixed(2))
  );
  const liveValidation = validateReceiptTotals(
    isPartialSelection ? selectedItemsList : receiptItems,
    isPartialSelection ? liveAmountNum : (liveAmountNum > 0 ? liveAmountNum : receiptTotalDisplay),
    isPartialSelection ? undefined : expectedItemsCount ?? undefined,
    isPartialSelection ? 0 : liveUnattachedDiscount,
    receiptCurrency || "€"
  );
  // Verify Sum of items ≈ Receipt total (within 5% or expected item count deficit) when saving full receipt
  const hasFullReceiptMismatch =
    !isPartialSelection &&
    receiptItems.length > 0 &&
    receiptTotalDisplay > 0 &&
    liveValidation.isMismatch;
  const hasSevereMismatch =
    !isPartialSelection &&
    receiptTotalDisplay > 0 &&
    (liveValidation.differencePercent > 10 ||
      (receiptItems.length === 0 && aiUnavailable && !aiSucceeded));

  // Scanner Quality Indicators & Data-Only Warnings (independent from AI availability)
  const cleanMerchantStr = merchantName.trim();
  const isMerchantDetected =
    cleanMerchantStr.length >= 2 &&
    cleanMerchantStr !== "Касова бележка" &&
    cleanMerchantStr !== "Receipt" &&
    cleanMerchantStr !== "Неизвестен търговец";
  const isDateDetected = Boolean(ocrDetectedDate || dateEditedByUser || (!dateFallbackReason && date));
  const isTotalDetected = liveAmountNum > 0 || detectedTotal > 0;
  const isItemsDetected = receiptItems.length > 0;

  const dataWarnings: string[] = [];
  if (processingWarning) {
    dataWarnings.push(processingWarning);
  }
  if (!isTotalDetected) {
    dataWarnings.push(t("ocr.errMissingTotalWarn"));
  }
  if (!isDateDetected) {
    dataWarnings.push(t("ocr.errMissingDateWarn"));
  }
  if (!isMerchantDetected) {
    dataWarnings.push(t("ocr.errMissingMerchantWarn"));
  }
  if (!isItemsDetected) {
    dataWarnings.push(t("ocr.errMissingItemsWarn"));
  }
  if (hasFullReceiptMismatch) {
    const mismatchHeadline = hasSevereMismatch
      ? aiUnavailable && !aiSucceeded
        ? t("ocr.severeMismatchAiUnavailableTitle")
        : t("ocr.severeMismatchTitle")
      : t("ocr.mismatchTitle");
    dataWarnings.push(
      `${mismatchHeadline} ${t("ocr.mismatchDetails", {
        receiptTotal: formatDisplayPrice(receiptTotalDisplay),
        itemsTotal: formatDisplayPrice(itemsFullSum),
        diff: formatDisplayPrice(liveValidation.difference),
        pct: liveValidation.differencePercent.toFixed(1),
      })}`
    );
  }
  const hasAllKeyFields =
    isMerchantDetected &&
    isDateDetected &&
    isTotalDetected &&
    isItemsDetected &&
    !hasFullReceiptMismatch &&
    !hasSevereMismatch &&
    !processingWarning;

  // Save confirmed expense
  const handleSaveExpense = () => {
    if (receiptItems.length > 0 && selectedItemIndices.size === 0) {
      setErrorMessage(t("ocr.errSelectOneItem"));
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage(t("ocr.errInvalidTotal"));
      return;
    }

    if (hasFullReceiptMismatch && !confirmMismatchOverride) {
      setErrorMessage(t("ocr.errMismatchOverride"));
      return;
    }

    // Determine structured items using ONLY selected items (or edited notes), preserving quantities and discounts
    let finalItems: ReceiptItemDetail[] = selectedItemsList.map((it) => ({
      name: it.name,
      price: it.finalPrice ?? it.price,
      quantity: it.quantity && it.quantity >= 1 ? it.quantity : 1,
      ...(it.discount && it.discount > 0 && it.originalPrice !== undefined
        ? {
            originalPrice: it.originalPrice,
            discount: it.discount,
            finalPrice: it.finalPrice ?? it.price,
            ...(it.discountLabel ? { discountLabel: it.discountLabel } : {}),
          }
        : {}),
    }));
    if (notes.trim()) {
      const parsedFromNotes = parseExpenseNote(notes, merchantName);
      if (parsedFromNotes.items && parsedFromNotes.items.length > 0) {
        finalItems = parsedFromNotes.items.map((it, idx) => {
          const prevMeta = selectedItemsList[idx];
          const hasDisc = Boolean(it.discount && it.discount > 0);
          const fallbackDisc =
            !hasDisc &&
            prevMeta?.discount &&
            prevMeta.discount > 0 &&
            Math.abs((prevMeta.finalPrice ?? prevMeta.price) - it.price) <= 0.01;
          return {
            name: it.name,
            price: it.finalPrice ?? it.price,
            quantity:
              it.quantity && it.quantity >= 1
                ? it.quantity
                : prevMeta?.quantity || 1,
            ...(hasDisc
              ? {
                  originalPrice: it.originalPrice,
                  discount: it.discount,
                  finalPrice: it.finalPrice ?? it.price,
                  ...(it.discountLabel ? { discountLabel: it.discountLabel } : {}),
                }
              : fallbackDisc
              ? {
                  originalPrice: prevMeta.originalPrice,
                  discount: prevMeta.discount,
                  finalPrice: it.price,
                  ...(prevMeta.discountLabel ? { discountLabel: prevMeta.discountLabel } : {}),
                }
              : {}),
          };
        });
      }
    }

    const cleanMerchant =
      merchantName && merchantName !== "Неизвестен търговец"
        ? merchantName.trim()
        : undefined;

    const chosenBudget = budgetCategories.find(
      (b) => b.id === selectedBudgetCategoryId
    );

    const normalizedLocation = normalizeLocation(location);
    const savedDateStr = date || new Date().toISOString().split("T")[0];
    const newExpense: ExpenseItem = {
      id: Date.now().toString(),
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      categoryIcon: selectedCategory.iconName,
      categoryColor: selectedCategory.colorClass,
      budgetCategoryId: selectedBudgetCategoryId || undefined,
      budgetCategoryName: chosenBudget ? chosenBudget.categoryName : undefined,
      amount: parsedAmount,
      merchantName: cleanMerchant,
      receiptItems: finalItems.length > 0 ? finalItems : undefined,
      note: notes.trim()
        ? cleanMerchant
          ? `${cleanMerchant}\n${notes.trim()}`
          : notes.trim()
        : cleanMerchant || undefined,
      ...(normalizedLocation ? { location: normalizedLocation } : {}),
      date: `${savedDateStr}T12:00:00.000Z`,
      isRecurring: false,
    };

    addDebugLog(
      "expense",
      `Записан разход: ${newExpense.categoryName} | Обект: "${cleanMerchant || "—"}" | Сума: €${newExpense.amount.toFixed(2)} | OCR дата: ${ocrDetectedDate || "неоткрита"} | Крайна дата: ${savedDateStr}${dateFallbackReason ? ` (Fallback: ${dateFallbackReason})` : ""} | Артикули: ${finalItems.map((i) => `${i.quantity || 1} x ${i.name}`).join(", ")}`,
      newExpense
    );
    onExpenseCreated(newExpense);
    handleClose();
  };

  const SelectedIconComp =
    AVAILABLE_ICONS_MAP[selectedCategory?.iconName] || AVAILABLE_ICONS_MAP.Tag;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 dark:bg-black/85 backdrop-blur-sm p-3 sm:p-5 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200/80 dark:border-slate-800 animate-in slide-in-from-bottom-4 duration-300 transition-colors"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shadow-2xs">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {t("ocr.modalTitle")}
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <Sparkles className="w-2.5 h-2.5" />
                  {t("ocr.engineBadge")}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("ocr.modalSubtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title={t("common.close")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hidden Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (picked) {
              processImageFile(picked);
            }
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const captured = e.target.files?.[0];
            e.target.value = "";
            if (captured) {
              processImageFile(captured);
            }
          }}
        />

        {/* Modal Body */}
        <div className="overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-950/50 space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-center gap-2.5 text-red-700 dark:text-red-300 text-xs sm:text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: UPLOAD */}
          {step === "upload" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center justify-center gap-3 p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] group text-left cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <span className="block font-bold text-sm sm:text-base text-white">{t("ocr.cameraTitle")}</span>
                    <span className="block text-xs text-indigo-100 font-medium">
                      {t("ocr.cameraSubtitle")}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-3 p-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-2xl border-2 border-slate-300 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all active:scale-[0.98] group text-left cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="block font-bold text-sm sm:text-base text-slate-900 dark:text-white">{t("ocr.galleryTitle")}</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-300 font-medium">
                      {t("ocr.gallerySubtitle")}
                    </span>
                  </div>
                </button>
              </div>

              {/* Drag & Drop */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-indigo-600 bg-indigo-100/70 dark:bg-indigo-950/70 scale-[1.01]"
                    : "border-slate-400 dark:border-slate-600 hover:border-indigo-500 dark:hover:border-indigo-400 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70 shadow-xs"
                }`}
              >
                <div className="w-16 h-16 rounded-3xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4 shadow-xs">
                  <Receipt className="w-8 h-8" />
                </div>
                <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-1.5">
                  {t("ocr.dragTitle")}
                </h4>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 max-w-sm mx-auto mb-4">
                  {t("ocr.dragSubtitle")}
                </p>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/80 px-3.5 py-1.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  {t("ocr.offlineGuarantee")}
                </div>
              </div>
            </div>
          )}

          {/* STEP 1 & 2: RECEIPT PREVIEW MODAL */}
          {step === "preview" && imagePreview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    {t("ocr.previewTitle")}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    {t("ocr.previewSubtitle")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsZoomed((prev) => !prev)}
                    className="p-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title={isZoomed ? t("ocr.zoomOutTitle") : t("ocr.zoomInTitle")}
                  >
                    {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{isZoomed ? t("ocr.zoomOut") : t("ocr.zoomIn")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title={t("ocr.changePhotoTitle")}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t("ocr.changePhoto")}</span>
                  </button>
                </div>
              </div>

              {/* Main Receipt Preview Container */}
              <div className="relative rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-slate-950 flex items-center justify-center min-h-[280px] max-h-[460px]">
                <div className="overflow-auto w-full h-full max-h-[460px] flex items-center justify-center p-2">
                  <img
                    src={imagePreview}
                    alt="Receipt preview"
                    className={`transition-transform duration-200 object-contain max-h-[440px] rounded-lg ${
                      isZoomed ? "scale-150 cursor-zoom-out" : "scale-100 cursor-zoom-in"
                    }`}
                    onClick={() => setIsZoomed((prev) => !prev)}
                  />
                </div>

                {/* Metadata overlay */}
                {imageMeta && (
                  <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 backdrop-blur-md text-white text-[11px] px-3.5 py-2 rounded-xl flex items-center justify-between border border-white/20 shadow-lg">
                    <span className="truncate max-w-[200px] font-medium">{imageMeta.name}</span>
                    <div className="flex items-center gap-3 shrink-0 text-slate-200 font-mono text-[10px]">
                      <span>{imageMeta.dimensions}</span>
                      <span>{imageMeta.sizeFormatted}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: SCANNING PROGRESS */}
          {step === "scanning" && (
            <div className="py-6 sm:py-10 flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative w-44 sm:w-56 h-60 sm:h-72 rounded-2xl overflow-hidden shadow-2xl border-4 border-white dark:border-slate-800 bg-slate-900">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Receipt preview"
                    className="w-full h-full object-cover filter brightness-90"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">
                    <Receipt className="w-16 h-16" />
                  </div>
                )}
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#10b981] animate-[pulse_1.5s_infinite] top-1/2 -translate-y-1/2" />
                <div className="absolute inset-0 bg-indigo-500/10 pointer-events-none" />
              </div>

              <div className="space-y-2 max-w-md">
                <div className="flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="font-bold text-base sm:text-lg">{t("ocr.scanningTitle")}</span>
                </div>
                <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">
                  {scanStatusMessage}
                </p>
                {aiProgress?.active && (aiProgress.attempt > 1 || aiProgress.pass > 1) && (
                  <p className="text-xs sm:text-sm font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {aiProgress.pass > 1
                      ? t("ocr.aiRetryAttemptProgress", {
                          current: aiProgress.attempt,
                          total: aiProgress.total,
                        })
                      : t("ocr.aiAttemptProgress", {
                          current: aiProgress.attempt,
                          total: aiProgress.total,
                        })}
                  </p>
                )}
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t("ocr.timeElapsed", { seconds: scanElapsedSeconds })}</span>
                </div>
              </div>

              {/* Skip to manual */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSkipToManual("User skipped scanning")}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-2xs active:scale-95"
                >
                  <span>{t("ocr.enterManuallyBtn")}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelScan}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & EDIT */}
          {step === "review" && (
            <div className="space-y-4">
              {/* Status / Warnings Banner */}
              {hasAllKeyFields && dataWarnings.length === 0 ? (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl flex items-center justify-between flex-wrap gap-2 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-bold">
                      {t("ocr.successBanner")}
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 font-bold rounded-full text-[11px] text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {t("ocr.sourceLabel")} {aiSourceBadge}
                  </span>
                </div>
              ) : (
                <div
                  className={`p-3.5 rounded-2xl flex items-start gap-3 text-xs sm:text-sm border ${
                    hasSevereMismatch
                      ? "bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                      : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-200"
                  }`}
                >
                  <AlertTriangle
                    className={`w-5 h-5 shrink-0 mt-0.5 ${
                      hasSevereMismatch
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <span className="font-bold">{t("ocr.warningBannerTitle")}</span>
                      <span
                        className={`px-2 py-0.5 font-semibold rounded-full text-[10px] ${
                          hasSevereMismatch
                            ? "bg-rose-100 dark:bg-rose-900/70 text-rose-900 dark:text-rose-200"
                            : "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200"
                        }`}
                      >
                        {t("ocr.sourceLabel")} {aiSourceBadge}
                      </span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-xs">
                      {dataWarnings.map((w, idx) => (
                        <li key={idx} className={hasSevereMismatch ? "font-semibold" : undefined}>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Clear Distinction: AI Analysis Success vs Fallback to OCR */}
              {aiSucceeded && (
                <div className="p-3 bg-emerald-50/90 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl flex items-center justify-between flex-wrap gap-2 text-xs text-emerald-900 dark:text-emerald-200">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <strong className="font-bold">{t("ocr.aiSuccessTitle")}</strong>
                      <span className="ml-1.5 text-emerald-800 dark:text-emerald-300">
                        {t("ocr.aiSuccessDesc")}
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 font-semibold rounded-full text-[11px] text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
                    {aiSourceBadge}
                  </span>
                </div>
              )}

              {aiUnavailable && !aiSucceeded && (
                <div className="p-3.5 bg-amber-50/80 dark:bg-slate-800/90 border border-amber-300 dark:border-amber-700/70 rounded-2xl flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-slate-900 dark:text-white">
                        {aiFallbackMode === "quota_limit"
                          ? t("ocr.quotaFallbackLine1")
                          : aiFallbackMode === "temporary"
                          ? t("ocr.tempFallbackLine1")
                          : t("ocr.generalFallbackLine1")}
                      </strong>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                        {t("ocr.ocrFallbackBadge")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                      {aiFallbackMode === "quota_limit"
                        ? t("ocr.quotaFallbackLine2")
                        : aiFallbackMode === "temporary"
                        ? t("ocr.tempFallbackLine2")
                        : t("ocr.generalFallbackLine2")}
                    </p>
                    <p className="text-[11px] font-medium text-amber-900 dark:text-amber-200">
                      {aiFallbackMode === "quota_limit"
                        ? t("ocr.quotaFallbackLine3")
                        : t("ocr.generalFallbackLine3")}
                    </p>
                  </div>
                </div>
              )}

              {/* Scanner Quality Indicators + Quality Meter */}
              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-1.5">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    {t("ocr.qualityHeader")}
                  </span>
                  <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                    {t("ocr.sourceLabel")} {aiSourceBadge}
                    {ocrLanguageInfo ? ` (${ocrLanguageInfo.used})` : ""}
                  </span>
                </div>

                {/* 4 Clear Quality Status Indicators */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div
                    className={`p-2 rounded-xl border flex items-center gap-2 ${
                      isMerchantDetected
                        ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200"
                        : "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200"
                    }`}
                  >
                    <span className="text-sm shrink-0">{isMerchantDetected ? "✅" : "⚠️"}</span>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold block opacity-75">{t("ocr.merchantTitle")}</span>
                      <span className="font-bold truncate block">
                        {isMerchantDetected ? merchantName : t("ocr.merchantUnknown")}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`p-2 rounded-xl border flex items-center gap-2 ${
                      isDateDetected
                        ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200"
                        : "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200"
                    }`}
                  >
                    <span className="text-sm shrink-0">{isDateDetected ? "✅" : "⚠️"}</span>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold block opacity-75">{t("ocr.dateTitle")}</span>
                      <span className="font-bold truncate block">
                        {date || t("ocr.dateMissing")}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`p-2 rounded-xl border flex items-center gap-2 ${
                      isTotalDetected
                        ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200"
                        : "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200"
                    }`}
                  >
                    <span className="text-sm shrink-0">{isTotalDetected ? "✅" : "⚠️"}</span>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold block opacity-75">{t("ocr.totalTitle")}</span>
                      <span className="font-bold truncate block">
                        {isTotalDetected ? formatDisplayPrice(receiptTotalDisplay) : t("ocr.totalMissing")}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`p-2 rounded-xl border flex items-center gap-2 ${
                      isItemsDetected && !hasSevereMismatch
                        ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200"
                        : hasSevereMismatch
                        ? "bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800/80 text-rose-900 dark:text-rose-200"
                        : "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200"
                    }`}
                  >
                    <span className="text-sm shrink-0">
                      {isItemsDetected && !hasSevereMismatch ? "✅" : "⚠️"}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold block opacity-75">{t("ocr.itemsTitle")}</span>
                      <span className="font-bold truncate block">
                        {isItemsDetected ? t("ocr.itemsRecognized", { count: receiptItems.length }) : t("ocr.itemsZero")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quality Meter Strip (Detected Items | Receipt Total | Items Total | Difference) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 block font-semibold">
                      {t("ocr.meterDetectedItems")}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {receiptItems.length}
                      {expectedItemsCount ? ` / ${expectedItemsCount}` : ""}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 block font-semibold">
                      {t("ocr.meterReceiptTotal")}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatDisplayPrice(receiptTotalDisplay)}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 block font-semibold">
                      {t("ocr.meterItemsTotal")}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatDisplayPrice(itemsFullSum)}
                    </span>
                  </div>
                  <div
                    className={`p-2 rounded-xl border ${
                      liveValidation.differencePercent <= 5
                        ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                        : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
                    }`}
                  >
                    <span className="text-[10px] block font-semibold opacity-80">
                      {t("ocr.meterDifference")}
                    </span>
                    <span className="font-extrabold">
                      {formatDisplayPrice(liveValidation.difference)} (
                      {liveValidation.differencePercent.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Two Column Layout: Preview & Editable Form */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Left: Thumbnail & Raw Text */}
                <div className="md:col-span-4 space-y-3">
                  {imagePreview && (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-2xs bg-slate-900 max-h-56 flex items-center justify-center">
                      <img
                        src={imagePreview}
                        alt="Receipt"
                        className="w-full h-auto object-cover max-h-56"
                      />
                      <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-xs text-white text-[11px] px-2.5 py-1 rounded-lg flex items-center justify-between">
                        <span className="truncate">{merchantName || t("ocr.receiptDefaultName")}</span>
                        <button
                          type="button"
                          onClick={() => setStep("upload")}
                          className="text-indigo-300 hover:text-white font-semibold underline ml-1"
                        >
                          {t("ocr.changePhoto")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Raw OCR Text Accordion */}
                  {rawText && (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                      <button
                        type="button"
                        onClick={() => setShowRawText((prev) => !prev)}
                        className="w-full px-3 py-2 text-left flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-500" />
                          {t("ocr.rawOcrText")}
                        </span>
                        {showRawText ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {showRawText && (
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-400 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                          {rawText}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: Editable Form Fields */}
                <div className="md:col-span-8 space-y-3.5">
                  {/* Amount Field (Hero) */}
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                        {t("ocr.finalAmountLabel", { currency: receiptCurrency || "€" })}
                      </label>
                      {receiptItems.length > 0 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {t("ocr.selectedOfTotalItems", {
                            selected: selectedItemIndices.size,
                            total: receiptItems.length,
                          })}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg sm:text-xl font-black text-slate-600 dark:text-slate-300">
                        {receiptCurrency || "€"}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full pr-4 pl-9 py-2 text-2xl sm:text-3xl font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-400"
                        required
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-1 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                      <span>
                        {receiptItems.length > 0 && selectedItemIndices.size < receiptItems.length
                          ? t("ocr.recalculatedHint")
                          : t("ocr.detectedTotalHint")}
                      </span>
                      {receiptItems.length > 0 && selectedItemIndices.size < receiptItems.length && (
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">
                          {t("ocr.receiptTotalNote", { total: formatDisplayPrice(receiptTotalDisplay) })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Interactive Receipt Items Selection, Inline Editing & Manual Item Addition */}
                  <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                          <ListChecks className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>{t("ocr.receiptItemsHeader", { count: receiptItems.length })}</span>
                        </h4>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                          {t("ocr.receiptItemsSub")}
                        </p>
                      </div>
                      <div className="flex items-center flex-wrap gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddItemForm((prev) => !prev);
                            setEditingItemIndex(null);
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t("ocr.addManualItemBtn")}</span>
                        </button>
                        {receiptItems.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={handleSelectAllItems}
                              disabled={selectedItemIndices.size === receiptItems.length}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                              <span>{t("ocr.selectAllBtn")}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleDeselectAllItems}
                              disabled={selectedItemIndices.size === 0}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Square className="w-3.5 h-3.5" />
                              <span>{t("ocr.clearAllBtn")}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Item-List Operations: Split Bill + Add Tip */}
                    <div className="space-y-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                      {receiptItems.length > 0 && (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={splitBillEnabled}
                          onClick={() => handleToggleSplitBill(!splitBillEnabled)}
                          className="inline-flex items-center justify-between gap-4 px-3.5 py-2 rounded-xl bg-slate-50/90 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-colors cursor-pointer select-none min-h-[40px]"
                        >
                          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {t("ocr.splitBillLabel")}
                          </span>
                          <span
                            aria-hidden="true"
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                              splitBillEnabled
                                ? "bg-indigo-600"
                                : "bg-slate-300 dark:bg-slate-700"
                            }`}
                          >
                            <span
                              className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-xs transition-transform ${
                                splitBillEnabled ? "translate-x-5.5" : "translate-x-1"
                              }`}
                            />
                          </span>
                        </button>
                      )}

                      <div className={receiptItems.length > 0 ? "pt-1.5 border-t border-slate-100 dark:border-slate-800/80" : ""}>
                        <button
                          type="button"
                          onClick={handleOpenTipModal}
                          className="min-h-[38px] w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80 transition-colors flex items-center justify-center sm:justify-start gap-2 cursor-pointer shadow-2xs active:scale-[0.99]"
                        >
                          <span aria-hidden="true">💰</span>
                          <span>{t("ocr.addTipLabel")}</span>
                          {existingTipItem && (
                            <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-200/80 dark:bg-amber-800/80 text-amber-950 dark:text-amber-100 tabular-nums">
                              {formatDisplayPrice(existingTipItem.finalPrice ?? existingTipItem.price)}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Step 4: Manual Add Item Inline Form */}
                    {showAddItemForm && (
                      <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2.5">
                        <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">
                          {t("ocr.newItemHeader")}
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-6">
                            <input
                              type="text"
                              value={newItemName}
                              onChange={(e) => setNewItemName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddManualItem();
                                }
                              }}
                              placeholder={t("ocr.newItemNamePlaceholder")}
                              className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                              autoFocus
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={newItemQuantity}
                              onChange={(e) => setNewItemQuantity(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddManualItem();
                                }
                              }}
                              placeholder={t("ocr.qtyPlaceholder")}
                              className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={newItemPrice}
                              onChange={(e) => setNewItemPrice(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddManualItem();
                                }
                              }}
                              placeholder={t("ocr.pricePlaceholder", { currency: receiptCurrency || "€" })}
                              className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAddItemForm(false)}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          >
                            {t("common.cancel")}
                          </button>
                          <button
                            type="button"
                            onClick={handleAddManualItem}
                            className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{t("common.add")}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Items Checklist + Step 5 Inline Editing */}
                    {receiptItems.length === 0 ? (
                      <div className="py-4 px-3 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center text-xs text-slate-600 dark:text-slate-300">
                        {t("ocr.noItemsAutoHint")}
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                        {receiptItems.map((item, idx) => {
                          const isChecked = selectedItemIndices.has(idx);
                          const isEditing = editingItemIndex === idx;

                          if (isEditing) {
                            return (
                              <div
                                key={`edit-${idx}`}
                                className="p-2.5 rounded-xl border-2 border-indigo-400 dark:border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 space-y-2"
                              >
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                  <input
                                    type="text"
                                    value={editItemName}
                                    onChange={(e) => setEditItemName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleSaveEditItem(idx);
                                      }
                                    }}
                                    placeholder={t("ocr.editItemNamePlaceholder")}
                                    className="sm:col-span-6 px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                    autoFocus
                                  />
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={editItemQuantity}
                                    onChange={(e) => setEditItemQuantity(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleSaveEditItem(idx);
                                      }
                                    }}
                                    placeholder={t("ocr.qtyPlaceholder")}
                                    className="sm:col-span-3 px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={editItemPrice}
                                    onChange={(e) => setEditItemPrice(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleSaveEditItem(idx);
                                      }
                                    }}
                                    placeholder={t("ocr.editPricePlaceholder")}
                                    className="sm:col-span-3 px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                </div>
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingItemIndex(null)}
                                    className="px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                  >
                                    {t("common.cancel")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEditItem(idx)}
                                    className="px-3 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    <Save className="w-3 h-3" />
                                    <span>{t("common.save")}</span>
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`${idx}-${item.name}`}
                              className={`min-h-[46px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-all ${
                                isChecked
                                  ? "bg-indigo-50/70 dark:bg-indigo-950/35 border-indigo-300 dark:border-indigo-700/80 text-slate-900 dark:text-white shadow-2xs"
                                  : "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 opacity-75 hover:opacity-100"
                              }`}
                            >
                              <label className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleReceiptItem(idx)}
                                  className="w-4.5 h-4.5 mt-0.5 rounded-md border-slate-400 text-indigo-600 focus:ring-2 focus:ring-indigo-500 cursor-pointer shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <span
                                    className={`block text-xs sm:text-sm font-semibold truncate ${
                                      !isChecked ? "line-through" : ""
                                    }`}
                                  >
                                    {isTipReceiptItem(item) ? (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-xs font-bold">
                                        <span aria-hidden="true">💰</span>
                                        <span>{language === "bg" ? item.name : t("expenses.tipLabel").replace(/:$/, "")}</span>
                                      </span>
                                    ) : (
                                      <>
                                        {item.quantity && item.quantity >= 1 ? `${item.quantity} x ` : "1 x "}
                                        {item.name}
                                      </>
                                    )}
                                  </span>
                                  {item.discount && item.discount > 0 && item.originalPrice !== undefined && (
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
                                      <span className="text-slate-500 dark:text-slate-400 line-through">
                                        {formatDisplayPrice(item.originalPrice)}
                                      </span>
                                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                        -{formatDisplayPrice(item.discount)} {item.discountLabel || t("ocr.discountWord")}
                                      </span>
                                      <span className="text-slate-600 dark:text-slate-300 font-medium">
                                        {t("ocr.finalItemPrice", { price: formatDisplayPrice(item.finalPrice ?? item.price) })}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </label>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <div className="text-right mr-1">
                                  {item.discount && item.discount > 0 && item.originalPrice !== undefined && (
                                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 line-through tabular-nums leading-none mb-0.5">
                                      {formatDisplayPrice(item.originalPrice)}
                                    </span>
                                  )}
                                  <span
                                    className={`text-xs sm:text-sm font-extrabold tabular-nums ${
                                      isChecked
                                        ? "text-indigo-700 dark:text-indigo-300"
                                        : "text-slate-500 dark:text-slate-400 line-through"
                                    }`}
                                  >
                                    {formatDisplayPrice(item.finalPrice ?? item.price)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditItem(idx)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
                                  title={t("ocr.editItemTooltip")}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(idx)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-100/70 dark:hover:bg-rose-900/40 transition-colors cursor-pointer"
                                  title={t("ocr.removeItemTooltip")}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Live Item Counts & Selected/Items Totals */}
                    {receiptItems.length > 0 && (
                      <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                          <span className="text-[10px] text-slate-600 dark:text-slate-300 block font-semibold">
                            {expectedItemsCount
                              ? t("ocr.expectedItemsCountLabel", { count: expectedItemsCount })
                              : t("ocr.selectedItemsLabel")}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {t("ocr.selectedOfTotalItems", {
                              selected: selectedItemIndices.size,
                              total: receiptItems.length,
                            })}
                          </span>
                        </div>
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-300 block font-semibold">
                            {isPartialSelection ? t("ocr.selectedTotalLabel") : t("ocr.itemsTotalLabel")}
                          </span>
                          <span className="font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                            {formatDisplayPrice(isPartialSelection ? selectedItemsSum : itemsFullSum)}
                          </span>
                          {!isPartialSelection && attachedDiscountSum > 0 && (
                            <span className="block text-[10px] font-semibold text-emerald-700/90 dark:text-emerald-300/90 tabular-nums">
                              {t("ocr.discountsPrefix")} -{formatDisplayPrice(attachedDiscountSum)}
                            </span>
                          )}
                        </div>
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                          <span className="text-[10px] text-slate-600 dark:text-slate-300 block font-semibold">
                            {t("ocr.meterReceiptTotal")}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatDisplayPrice(receiptTotalDisplay)}
                          </span>
                        </div>
                      </div>
                    )}

                    {hasFullReceiptMismatch && (
                      <div className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-300 dark:border-rose-700 rounded-xl text-xs text-rose-900 dark:text-rose-200 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                          <div className="space-y-1">
                            {hasSevereMismatch ? (
                              <div className="font-bold space-y-0.5">
                                {aiUnavailable && !aiSucceeded && (
                                  <span className="block">
                                    {t("ocr.severeMismatchAiUnavailableLine1")}
                                  </span>
                                )}
                                <span className="block">{t("ocr.severeMismatchLine2")}</span>
                                <span className="block">{t("ocr.severeMismatchLine3")}</span>
                              </div>
                            ) : (
                              <span className="font-bold block">
                                {t("ocr.mismatchTitle")}
                              </span>
                            )}
                            <p className="text-[11px] leading-relaxed">
                              {t("ocr.mismatchDetails", {
                                receiptTotal: formatDisplayPrice(receiptTotalDisplay),
                                itemsTotal: formatDisplayPrice(itemsFullSum),
                                diff: formatDisplayPrice(liveValidation.difference),
                                pct: liveValidation.differencePercent.toFixed(1),
                              })}
                              {expectedItemsCount
                                ? t("ocr.mismatchItemsCount", {
                                    detected: receiptItems.length,
                                    expected: expectedItemsCount,
                                  })
                                : ""}
                            </p>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 pt-1.5 border-t border-rose-200 dark:border-rose-800/60 cursor-pointer select-none font-semibold text-[11px]">
                          <input
                            type="checkbox"
                            checked={confirmMismatchOverride}
                            onChange={(e) => setConfirmMismatchOverride(e.target.checked)}
                            className="w-4 h-4 rounded border-rose-400 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                          <span>
                            {t("ocr.mismatchConfirmLabel")}
                          </span>
                        </label>
                      </div>
                    )}

                    {receiptItems.length > 0 && selectedItemIndices.size === 0 && (
                      <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>{t("ocr.selectOneItemWarning")}</span>
                      </div>
                    )}
                  </div>

                  {/* Category Selector */}
                  <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                        {t("ocr.categoryStarLabel")}
                      </label>
                      <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        {t("ocr.suggestedCategoryBadge")}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCategoryPicker(true)}
                      className="w-full flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl transition-all group text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-2xs ${getCategoryBadgeClasses(selectedCategory?.colorClass)}`}
                        >
                          <SelectedIconComp className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block font-bold text-sm text-slate-900 dark:text-white">
                            {selectedCategory
                              ? translateCategoryName(selectedCategory.name, language)
                              : t("ocr.chooseCategoryFallback")}
                          </span>
                          <span className="text-[11px] text-slate-600 dark:text-slate-300">
                            {t("ocr.clickToChangeCategory")}
                          </span>
                        </div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-transform" />
                    </button>
                  </div>

                  {/* Budget Category Selector */}
                  <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                        {t("ocr.budgetCategoryLabel")}
                      </label>
                      <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                        {t("ocr.budgetCategoryHint")}
                      </span>
                    </div>

                    <select
                      value={selectedBudgetCategoryId}
                      onChange={(e) => setSelectedBudgetCategoryId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">{t("ocr.noBudgetCategoryOption")}</option>
                      {budgetCategories.map((b) => (
                        <option key={b.id} value={b.id}>
                          {t("ocr.budgetLimitFormat", {
                            name: translateBudgetName(b.categoryName, language),
                            limit: b.monthlyLimit.toFixed(2),
                          })}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date & Merchant Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                        {t("ocr.purchaseDateLabel")}
                      </label>
                      <div className="relative">
                        <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => {
                            setDate(e.target.value);
                            setDateEditedByUser(true);
                          }}
                          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                        {t("ocr.merchantFieldLabel")}
                      </label>
                      <input
                        type="text"
                        value={merchantName}
                        onChange={(e) => setMerchantName(e.target.value)}
                        placeholder={t("ocr.merchantFieldPlaceholder")}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-500 dark:placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* Location Section (Same implementation as Add / Edit Expense) */}
                  <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs">
                    <LocationPickerField
                      value={location}
                      onChange={(nextLoc) => {
                        locationEditedByUserRef.current = true;
                        setLocation(nextLoc);
                      }}
                      compact
                    />
                  </div>

                  {/* Notes & Items List (Auto-expanding without internal scrollbar) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1.5">
                      {t("ocr.notesAndItemsLabel")}
                    </label>
                    <textarea
                      ref={notesTextareaRef}
                      value={notes}
                      onChange={(e) => {
                        if (splitBillEnabled) {
                          modifiedAfterSplitRef.current = true;
                        }
                        setNotes(e.target.value);
                        adjustNotesHeight();
                      }}
                      placeholder={"2 x Coca Cola - €4.80\n1 x Water - €1.20\n1 x Chips - €3.50"}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono leading-relaxed placeholder:text-slate-500 dark:placeholder:text-slate-400 resize-none overflow-hidden transition-[height] shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          {step === "upload" && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                {t("common.cancel")}
              </button>
            </div>
          )}

          {step === "preview" && (
            <div className="w-full flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors border border-slate-300 dark:border-slate-700 cursor-pointer shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                <span>{t("ocr.changePhotoLong")}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSkipToManual("Skipped from preview")}
                  className="px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  {t("ocr.manualBtnShort")}
                </button>
                <button
                  type="button"
                  onClick={handleProceedFromPreview}
                  className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <span>{t("common.continueBtn")}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === "scanning" && (
            <div className="w-full flex justify-between items-center">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t("ocr.scanningTitle")}
              </span>
              <button
                type="button"
                onClick={() => handleSkipToManual("Interrupted by user")}
                className="px-3.5 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-xl transition-colors"
              >
                {t("ocr.skipAndManualBtn")}
              </button>
            </div>
          )}

          {step === "review" && (
            <div className="w-full flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t("ocr.newPhotoBtn")}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleSaveExpense}
                  disabled={
                    (receiptItems.length > 0 && selectedItemIndices.size === 0) ||
                    (hasFullReceiptMismatch && !confirmMismatchOverride) ||
                    !amount ||
                    parseFloat(amount) <= 0
                  }
                  className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold disabled:opacity-50 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{t("ocr.addToExpensesBtn")}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tip Input Sub-Modal */}
      {showTipModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tip-modal-title"
          onClick={() => setShowTipModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h4
                id="tip-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"
              >
                <span aria-hidden="true">💰</span>
                <span>{t("ocr.tipModalTitle")}</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowTipModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
                aria-label={t("common.close")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t("ocr.tipAmountLabel", { currency: receiptCurrency || "€" })}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-600 dark:text-slate-300">
                  {receiptCurrency || "€"}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={tipInputAmount}
                  onChange={(e) => {
                    setTipInputAmount(e.target.value);
                    if (tipError) setTipError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveTip();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setShowTipModal(false);
                    }
                  }}
                  className="w-full pl-9 pr-3.5 py-3 text-lg font-extrabold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-amber-500 outline-none transition-all placeholder:text-slate-400"
                  autoFocus
                />
              </div>
              {tipError && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {tipError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowTipModal(false)}
                className="min-h-[42px] px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleSaveTip}
                className="min-h-[42px] px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors shadow-sm cursor-pointer active:scale-95"
              >
                {t("common.add")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Picker Sub-Modal */}
      {showCategoryPicker && (
        <CategoryPicker
          categories={categories}
          onSelect={(cat) => {
            setSelectedCategory(cat);
            setShowCategoryPicker(false);
          }}
          onClose={() => setShowCategoryPicker(false)}
        />
      )}
    </div>
  );
};
