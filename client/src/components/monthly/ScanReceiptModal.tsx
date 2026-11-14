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
  Bug,
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
} from "lucide-react";
import { ExpenseCategory, ExpenseItem, ReceiptItemDetail, BudgetConfig } from "@/types";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { AVAILABLE_ICONS_MAP, getCategoryBadgeClasses } from "@/utils/categoryStorage";
import {
  parseReceiptTextLocally,
  ParsedReceiptData,
  formatReceiptNotes,
  toCyrillicMatchForm,
  toLatinMatchForm,
} from "@/utils/receiptParser";
import { runClientOcr } from "@/utils/tesseractOcr";
import { parseExpenseNote } from "@/utils/expenseFormatter";
import { loadBudgets, findMatchingBudgetCategoryId } from "@/utils/budgetStorage";

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
  timestamp: string;
  step: "ocr_text" | "parsed_total" | "parsed_merchant" | "parsed_date" | "parsed_items" | "gemini_res" | "error" | "expense";
  message: string;
  data?: any;
}

interface ScanReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  currentMonth: string;
  onExpenseCreated: (expense: ExpenseItem) => void;
  initialMode?: "camera" | "upload";
}

// Timeout-safe image preprocessor for mobile and desktop (with OCR contrast enhancement for thermal paper)
async function prepareReceiptImageWithTimeout(
  file: File,
  maxDimension: number = 2000,
  timeoutMs: number = 8000
): Promise<{
  base64: string;
  previewUrl: string;
  ocrImageUrl: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  dimensions: string;
}> {
  return new Promise((resolve, reject) => {
    let hasFinished = false;
    const timer = setTimeout(() => {
      if (!hasFinished) {
        hasFinished = true;
        reject(new Error("Обработката на изображението отне твърде много време (Timeout)."));
      }
    }, timeoutMs);

    const reader = new FileReader();

    reader.onerror = () => {
      if (hasFinished) return;
      hasFinished = true;
      clearTimeout(timer);
      reject(new Error("Неуспешно четене на избрания файл от устройството."));
    };

    reader.onload = () => {
      if (hasFinished) return;
      const img = new Image();

      img.onerror = () => {
        if (hasFinished) return;
        hasFinished = true;
        clearTimeout(timer);
        reject(new Error("Невалиден или неподдържан графичен формат на касовата бележка."));
      };

      img.onload = () => {
        if (hasFinished) return;
        hasFinished = true;
        clearTimeout(timer);

        try {
          let width = img.width;
          let height = img.height;
          const origDimensions = `${width}x${height}`;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            const rawUrl = reader.result as string;
            resolve({
              base64: rawUrl,
              previewUrl: rawUrl,
              ocrImageUrl: rawUrl,
              mimeType: file.type || "image/jpeg",
              originalSize: file.size,
              compressedSize: file.size,
              dimensions: origDimensions,
            });
            return;
          }

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const mimeType = "image/jpeg";
          const base64 = canvas.toDataURL(mimeType, 0.9);

          // Build high-contrast grayscale variant specifically for Tesseract OCR on faded thermal receipts
          let ocrImageUrl = base64;
          try {
            const ocrCanvas = document.createElement("canvas");
            ocrCanvas.width = width;
            ocrCanvas.height = height;
            const ocrCtx = ocrCanvas.getContext("2d");
            if (ocrCtx) {
              ocrCtx.drawImage(canvas, 0, 0);
              const imgData = ocrCtx.getImageData(0, 0, width, height);
              const data = imgData.data;
              const contrast = 1.35;
              for (let p = 0; p < data.length; p += 4) {
                const gray = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
                const enhanced = Math.min(255, Math.max(0, (gray - 128) * contrast + 132));
                data[p] = enhanced;
                data[p + 1] = enhanced;
                data[p + 2] = enhanced;
              }
              ocrCtx.putImageData(imgData, 0, 0);
              ocrImageUrl = ocrCanvas.toDataURL("image/jpeg", 0.92);
            }
          } catch {
            ocrImageUrl = base64;
          }

          resolve({
            base64,
            previewUrl: base64,
            ocrImageUrl,
            mimeType,
            originalSize: file.size,
            compressedSize: Math.round((base64.length * 3) / 4),
            dimensions: `${width}x${height}`,
          });
        } catch {
          const rawUrl = reader.result as string;
          resolve({
            base64: rawUrl,
            previewUrl: rawUrl,
            ocrImageUrl: rawUrl,
            mimeType: file.type || "image/jpeg",
            originalSize: file.size,
            compressedSize: file.size,
            dimensions: "unknown",
          });
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
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

export const ScanReceiptModal: React.FC<ScanReceiptModalProps> = ({
  isOpen,
  onClose,
  categories,
  onExpenseCreated,
}) => {
  const [step, setStep] = useState<"upload" | "preview" | "scanning" | "review">("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{
    name: string;
    sizeFormatted: string;
    dimensions: string;
    prepared?: { base64: string; mimeType: string; previewUrl: string; ocrImageUrl?: string };
  } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState("Инициализиране на OCR скенера...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Review Form State
  const [amount, setAmount] = useState<string>("");
  const [receiptCurrency, setReceiptCurrency] = useState<string>("лв.");
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState<string>("");
  const [merchantName, setMerchantName] = useState<string>("");
  const [receiptItems, setReceiptItems] = useState<ReceiptItemDetail[]>([]);
  const [selectedItemIndices, setSelectedItemIndices] = useState<Set<number>>(new Set());
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

  // Confidence Check Details
  const [detectedTotal, setDetectedTotal] = useState<number>(0);
  const [detectedMerchant, setDetectedMerchant] = useState<string>("");
  const [detectedDate, setDetectedDate] = useState<string>("");
  const [detectedItemsCount, setDetectedItemsCount] = useState<number>(0);
  const [aiSourceBadge, setAiSourceBadge] = useState<string>("OCR Engine");

  // Debug Panel State
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);
  const [scanElapsedSeconds, setScanElapsedSeconds] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-expand notes textarea based on content without internal scrollbars
  const adjustNotesHeight = useCallback(() => {
    const el = notesTextareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
    }
  }, []);

  // Add event to debug log
  const addDebugLog = useCallback(
    (step: DebugLog["step"], message: string, data?: any) => {
      const now = new Date().toLocaleTimeString("bg-BG", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      console.log(`[Receipt OCR] [${now}] [${step.toUpperCase()}] ${message}`, data || "");
      setDebugLogs((prev) => [...prev, { timestamp: now, step, message, data }]);
    },
    []
  );

  // Cleanup on close
  const handleClose = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setStep("upload");
    setImagePreview(null);
    setImageMeta(null);
    setIsZoomed(false);
    setErrorMessage(null);
    setAmount("");
    setReceiptCurrency("лв.");
    setNotes("");
    setMerchantName("");
    setReceiptItems([]);
    setSelectedItemIndices(new Set());
    setRawText("");
    setWarnings([]);
    setShowCategoryPicker(false);
    setShowRawText(false);
    setSelectedBudgetCategoryId("");
    setDetectedTotal(0);
    setDetectedMerchant("");
    setDetectedDate("");
    setDetectedItemsCount(0);
    setScanElapsedSeconds(0);
    onClose();
  }, [onClose]);

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
    (reason = "Ръчно попълване от потребителя") => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      addDebugLog("parsed_total", "Прескачане към ръчно въвеждане: " + reason);
      setMerchantName((prev) => prev || "Касова бележка");
      setDate((prev) => prev || new Date().toISOString().split("T")[0]);
      setConfidence("low");
      setWarnings((prev) =>
        prev.length > 0 ? prev : ["Можете да попълните сумата и категорията ръчно."]
      );
      setStep("review");
    },
    [addDebugLog]
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
        const sum = selectedItems.reduce((acc, item) => acc + item.price, 0);
        setAmount(sum.toFixed(2));
      }

      // Regenerate clean multi-line notes using ONLY selected items in detected currency
      const activeCurrency = currencyOverride || receiptCurrency || "лв.";
      const generatedNotes = formatReceiptNotes(selectedItems, activeCurrency);
      setNotes(generatedNotes);
      setErrorMessage(null);
    },
    [receiptCurrency]
  );

  if (!isOpen) return null;

  // 1. Process image file and transition to Receipt Preview modal
  const processImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      const err = "Моля, изберете валиден графичен файл (JPG, PNG, WEBP).";
      setErrorMessage(err);
      addDebugLog("error", err, { fileType: file.type });
      return;
    }

    setErrorMessage(null);
    addDebugLog("ocr_text", `Файл: "${file.name}" (${Math.round(file.size / 1024)} KB)`);

    try {
      const prepared = await prepareReceiptImageWithTimeout(file, 2000, 8000);
      setImagePreview(prepared.previewUrl);
      setImageMeta({
        name: file.name,
        sizeFormatted: `${Math.round(prepared.compressedSize / 1024)} KB`,
        dimensions: prepared.dimensions,
        prepared: {
          base64: prepared.base64,
          mimeType: prepared.mimeType,
          previewUrl: prepared.previewUrl,
          ocrImageUrl: prepared.ocrImageUrl,
        },
      });

      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
      if (cleanName && cleanName.length > 2 && !cleanName.startsWith("IMG_")) {
        setMerchantName(cleanName);
      } else {
        setMerchantName("Касова бележка");
      }

      setStep("preview");
    } catch (prepErr: any) {
      addDebugLog("error", `Грешка при предварителна обработка: ${prepErr.message}`);
      setWarnings(["Неуспешна обработка на файла. Въведете данните ръчно."]);
      setMerchantName("Касова бележка");
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

  // OCR Workflow (Bulgarian-first Tesseract bul+eng -> Deterministic BG Parser -> Optional Gemini Enrichment)
  const runScanWorkflow = async (prepared: {
    base64: string;
    mimeType: string;
    previewUrl: string;
    ocrImageUrl?: string;
  }) => {
    setStep("scanning");
    setScanStatusMessage("1/3 Оптимизиране на изображението за кирилица...");
    let ocrRawText = "";
    try {
      const ocrResult = await runClientOcr(
        prepared.ocrImageUrl || prepared.previewUrl,
        (percent, status) => {
          setScanStatusMessage(`2/3 OCR разпознаване (${percent}%): ${status}`);
        },
        22000 // 22s timeout allows loading bul+eng traineddata reliably
      );
      ocrRawText = ocrResult.text;
      addDebugLog(
        "ocr_text",
        `OCR [${ocrResult.languagesUsed}] (${ocrResult.durationMs}ms, точност ${ocrResult.confidence.toFixed(0)}%, ${ocrRawText.length} символа):\n` +
          ocrRawText.slice(0, 500)
      );
    } catch (ocrErr: any) {
      addDebugLog("error", `Локалното OCR отне твърде много време или се провали: ${ocrErr?.message}`);
    }

    // 3. Deterministic Local Parsing (Bulgarian-first)
    const localParsed: ParsedReceiptData = parseReceiptTextLocally(ocrRawText);
    const localCurrency = localParsed.currency || "лв.";
    setReceiptCurrency(localCurrency);

    addDebugLog(
      "parsed_merchant",
      `Разпознат търговец: "${localParsed.merchantName}" (${localParsed.merchantRule || "—"})`
    );
    addDebugLog(
      "parsed_date",
      `Разпозната дата: "${localParsed.date}" (${localParsed.dateRule || "—"})`
    );
    addDebugLog(
      "parsed_total",
      `Разпозната обща сума: ${localParsed.totalAmount.toFixed(2)} ${localCurrency} (Увереност: ${localParsed.confidence}, Правило: ${localParsed.matchedRule || "—"})`
    );
    addDebugLog(
      "parsed_items",
      `Разпознати артикули (${localParsed.items.length}): ${
        localParsed.items.length > 0
          ? localParsed.items.map((it) => `${it.name} (${it.price.toFixed(2)} ${localCurrency})`).join(", ")
          : "няма открити редове"
      }`,
      localParsed.items
    );

    // Initial baseline state populated from OCR-first results
    const initialItems = localParsed.items || [];
    setMerchantName(localParsed.merchantName);
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
    setDetectedItemsCount(initialItems.length);
    setAiSourceBadge("Вграден BG+EN OCR модул");

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

    // 4. Gemini AI Enrichment (Optional improvement - never blocks expense creation)
    setScanStatusMessage("3/3 Интелигентен AI анализ с Gemini...");
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, 12000); // 12s timeout for Gemini

    try {
      const response = await fetch("/api/ocr/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          imageBase64: prepared.base64,
          mimeType: prepared.mimeType,
          ocrText: ocrRawText,
        }),
      });

      clearTimeout(timeoutTimer);
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const json = await response.json();
        addDebugLog("gemini_res", "Gemini API отговор получен", json);

        if (json.success && json.data) {
          const gData = json.data;
          const resolvedCurrency = gData.currency || localCurrency || "лв.";
          setReceiptCurrency(resolvedCurrency);

          let finalTotal = localParsed.totalAmount;

          if (gData.totalAmount && gData.totalAmount > 0) {
            if (localParsed.totalAmount > 0) {
              if (gData.totalAmount < localParsed.totalAmount * 0.7) {
                addDebugLog(
                  "parsed_total",
                  `⚠️ Отхвърлена подозрителна сума от Gemini (${gData.totalAmount} ${resolvedCurrency}). Запазена е правилната обща сума от OCR: ${localParsed.totalAmount} ${resolvedCurrency}`
                );
                finalTotal = localParsed.totalAmount;
              } else {
                finalTotal = gData.totalAmount;
              }
            } else {
              finalTotal = gData.totalAmount;
            }
          }

          setAmount(finalTotal > 0 ? finalTotal.toFixed(2) : "");
          setDetectedTotal(finalTotal);

          // Merchant
          if (gData.merchantName && gData.merchantName !== "Неизвестен търговец") {
            setMerchantName(gData.merchantName);
            setDetectedMerchant(gData.merchantName);
            addDebugLog("parsed_merchant", `Gemini търговец: "${gData.merchantName}"`);
          }

          // Date
          if (gData.date && /^\d{4}-\d{2}-\d{2}$/.test(gData.date)) {
            setDate(gData.date);
            setDetectedDate(gData.date);
            addDebugLog("parsed_date", `Gemini дата: "${gData.date}"`);
          }

          // Formatted Notes & Items count & structured items
          const resolvedItems: ReceiptItemDetail[] =
            gData.items && gData.items.length > 0
              ? gData.items
              : localParsed.items && localParsed.items.length > 0
              ? localParsed.items
              : [];

          setReceiptItems(resolvedItems);
          setSelectedItemIndices(new Set(resolvedItems.map((_, idx) => idx)));
          setDetectedItemsCount(resolvedItems.length);
          addDebugLog(
            "parsed_items",
            `Финални артикули (${resolvedItems.length}): ${resolvedItems.map((it) => `${it.name} (${it.price.toFixed(2)})`).join(", ")}`,
            resolvedItems
          );

          if (resolvedItems.length > 0) {
            // Always prefer consistent multi-line format or Gemini formatted notes if multiline
            if (gData.notesFormatted && gData.notesFormatted.includes("\n")) {
              setNotes(gData.notesFormatted.trim());
            } else {
              setNotes(formatReceiptNotes(resolvedItems, resolvedCurrency));
            }
          } else if (gData.notesFormatted && gData.notesFormatted.trim().length > 3) {
            setNotes(gData.notesFormatted.trim());
          } else if (localParsed.notesFormatted) {
            setNotes(localParsed.notesFormatted);
          }

          if (gData.rawText) {
            setRawText(gData.rawText);
          }

          // Smart category suggestion from Gemini + BG dictionary
          const enrichedCat = matchCategory(
            {
              merchantName: gData.merchantName || localParsed.merchantName,
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

          setAiSourceBadge("Gemini + BG OCR");
        } else {
          addDebugLog("gemini_res", "Gemini не е активен или върна грешка. Използват се данните от локалния BG OCR.");
          setWarnings([
            "AI анализът временно не е наличен. Бележката е разчетена чрез локалния OCR модул.",
          ]);
        }
      } else {
        addDebugLog("gemini_res", "Статичен хостинг. Използват се локалните BG OCR данни.");
        setWarnings([
          "AI анализът временно не е наличен. Бележката е разчетена чрез локалния OCR модул.",
        ]);
      }
    } catch (gErr: any) {
      clearTimeout(timeoutTimer);
      addDebugLog("gemini_res", `Gemini заявката не успя (${gErr?.message}). Използват се локалните BG OCR данни.`);
      setWarnings([
        "AI анализът временно не е наличен. Бележката е разчетена чрез локалния OCR модул.",
      ]);
    } finally {
      abortControllerRef.current = null;
      setStep("review");
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

  const handleToggleReceiptItem = (index: number) => {
    const next = new Set(selectedItemIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    applyItemSelection(next, receiptItems, detectedTotal);
  };

  const handleSelectAllItems = () => {
    const all = new Set(receiptItems.map((_, idx) => idx));
    applyItemSelection(all, receiptItems, detectedTotal);
  };

  const handleDeselectAllItems = () => {
    applyItemSelection(new Set(), receiptItems, detectedTotal);
  };

  const formatDisplayPrice = (val: number) =>
    receiptCurrency === "лв." || receiptCurrency === "BGN"
      ? `${val.toFixed(2)} лв.`
      : `${receiptCurrency || "€"}${val.toFixed(2)}`;

  // Computed receipt totals & counts
  const itemsFullSum = receiptItems.reduce((sum, item) => sum + item.price, 0);
  const receiptTotalDisplay = detectedTotal > 0 ? detectedTotal : itemsFullSum;
  const selectedItemsList = receiptItems.filter((_, idx) => selectedItemIndices.has(idx));
  const selectedItemsSum = selectedItemsList.reduce((sum, item) => sum + item.price, 0);
  const includedTotalDisplay =
    receiptItems.length === 0
      ? parseFloat(amount) || 0
      : selectedItemIndices.size === receiptItems.length && detectedTotal > 0
      ? detectedTotal
      : selectedItemsSum;

  // Save confirmed expense
  const handleSaveExpense = () => {
    if (receiptItems.length > 0 && selectedItemIndices.size === 0) {
      setErrorMessage("Моля, изберете поне един артикул от бележката.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage("Моля, въведете валидна сума, по-голяма от 0.");
      return;
    }

    // Determine structured items using ONLY selected items (or edited notes)
    let finalItems = selectedItemsList;
    if (notes.trim()) {
      const parsedFromNotes = parseExpenseNote(notes, merchantName);
      if (parsedFromNotes.items && parsedFromNotes.items.length > 0) {
        finalItems = parsedFromNotes.items;
      }
    } else if (receiptItems.length > 0) {
      finalItems = selectedItemsList;
    }

    const cleanMerchant =
      merchantName && merchantName !== "Неизвестен търговец"
        ? merchantName.trim()
        : undefined;

    const chosenBudget = budgetCategories.find(
      (b) => b.id === selectedBudgetCategoryId
    );

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
      date: date ? `${date}T12:00:00.000Z` : new Date().toISOString(),
      isRecurring: false,
    };

    addDebugLog(
      "expense",
      `Разходът е записан успешно: ${newExpense.categoryName} €${newExpense.amount} (${finalItems.length} избрани артикула)`,
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
                  Сканиране на касова бележка
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <Sparkles className="w-2.5 h-2.5" />
                  OCR-First Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Директно OCR извличане на сума, търговец, дата и артикули
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowDebugPanel((prev) => !prev)}
              className={`p-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 ${
                showDebugPanel
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              title="Диагностичен панел (Debug logs)"
            >
              <Bug className="w-4 h-4" />
            </button>
            <button
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title="Затвори"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hidden Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              processImageFile(e.target.files[0]);
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
            if (e.target.files && e.target.files.length > 0) {
              processImageFile(e.target.files[0]);
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
                    <span className="block font-bold text-sm sm:text-base text-white">Снимай с камера</span>
                    <span className="block text-xs text-indigo-100 font-medium">
                      Директна снимка от телефон
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
                    <span className="block font-bold text-sm sm:text-base text-slate-900 dark:text-white">Избери файл / Галерия</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-300 font-medium">
                      JPG, PNG, WEBP снимка
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
                  Плъзнете касовата бележка тук
                </h4>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 max-w-sm mx-auto mb-4">
                  или натиснете за избор на снимка
                </p>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/80 px-3.5 py-1.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Работи самостоятелно дори при отказ или натоварване на Gemini
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
                    Преглед на касовата бележка
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    Уверете се, че сумата и текстът се четат ясно
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsZoomed((prev) => !prev)}
                    className="p-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title={isZoomed ? "Стандартен изглед" : "Увеличи снимката"}
                  >
                    {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{isZoomed ? "Смали" : "Увеличи"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title="Избери друга снимка"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Смени</span>
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
                  <span className="font-bold text-base sm:text-lg">Разчитане на бележката...</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  {scanStatusMessage}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Време: {scanElapsedSeconds}s</span>
                </div>
              </div>

              {/* Skip to manual */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSkipToManual("Потребителят прескочи сканирането")}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-2xs active:scale-95"
                >
                  <span>Въведи данните ръчно</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setStep("upload")}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Отказ
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & EDIT */}
          {step === "review" && (
            <div className="space-y-4">
              {/* Status / Warnings Banner */}
              {warnings.length > 0 ? (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-2xl flex items-start gap-3 text-amber-800 dark:text-amber-200 text-xs sm:text-sm">
                  <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">Резултат от разчитането:</span>
                    <ul className="list-disc list-inside space-y-0.5">
                      {warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      Касовата бележка е разчетена успешно.
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 font-bold rounded-full text-[11px] text-emerald-700 dark:text-emerald-300">
                    {aiSourceBadge}
                  </span>
                </div>
              )}

              {/* CONFIDENCE CHECK & RECEIPT PREVIEW SUMMARY */}
              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-1.5">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Преглед на разпознатите стойности
                  </span>
                  <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                    Източник: {aiSourceBadge}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 block uppercase font-bold">Търговец</span>
                    <span className="font-bold text-slate-900 dark:text-white truncate block">
                      {detectedMerchant || merchantName || "—"}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 block uppercase font-bold">Дата</span>
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {detectedDate || date || "—"}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 block uppercase font-bold">Категория</span>
                    <span className="font-bold text-slate-900 dark:text-white truncate block">
                      {selectedCategory?.name || "—"}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 block uppercase font-bold">Общо по бележка</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      {formatDisplayPrice(receiptTotalDisplay)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl border border-indigo-200 dark:border-indigo-800 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-indigo-700 dark:text-indigo-300 block uppercase font-bold">Избрана сума</span>
                    <span className="font-black text-indigo-700 dark:text-indigo-200 block">
                      {formatDisplayPrice(parseFloat(amount) || 0)}
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
                        <span className="truncate">{merchantName || "Бележка"}</span>
                        <button
                          type="button"
                          onClick={() => setStep("upload")}
                          className="text-indigo-300 hover:text-white font-semibold underline ml-1"
                        >
                          Смени
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
                          Суров OCR текст
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
                        Крайна сума за запис ({receiptCurrency || "€"}) *
                      </label>
                      {receiptItems.length > 0 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {selectedItemIndices.size} от {receiptItems.length} артикула
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg sm:text-xl font-black text-slate-600 dark:text-slate-300">
                        {receiptCurrency === "лв." || receiptCurrency === "BGN" ? "лв." : receiptCurrency || "€"}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className={`w-full pr-4 py-2 text-2xl sm:text-3xl font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-400 ${
                          receiptCurrency === "лв." || receiptCurrency === "BGN" ? "pl-13" : "pl-9"
                        }`}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-1 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                      <span>
                        {receiptItems.length > 0 && selectedItemIndices.size < receiptItems.length
                          ? "Сумата е преизчислена автоматично според избраните артикули"
                          : "Точно разпозната крайна сума (ОБЩО / ЗА ПЛАЩАНЕ / TOTAL)"}
                      </span>
                      {receiptItems.length > 0 && selectedItemIndices.size < receiptItems.length && (
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">
                          Общо по бележка: {formatDisplayPrice(receiptTotalDisplay)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Interactive Receipt Items Selection (Partial Payment / Bill Splitting) */}
                  {receiptItems.length > 0 && (
                    <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                            <ListChecks className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <span>Избор на артикули от бележката</span>
                          </h4>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                            Изберете кои артикули да се включат в разхода (напр. при разделяне на сметка)
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={handleSelectAllItems}
                            disabled={selectedItemIndices.size === receiptItems.length}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                            <span>Избери всички</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleDeselectAllItems}
                            disabled={selectedItemIndices.size === 0}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Square className="w-3.5 h-3.5" />
                            <span>Премахни всички</span>
                          </button>
                        </div>
                      </div>

                      {/* Items Checklist */}
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                        {receiptItems.map((item, idx) => {
                          const isChecked = selectedItemIndices.has(idx);
                          return (
                            <label
                              key={`${idx}-${item.name}`}
                              className={`min-h-[48px] flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                                isChecked
                                  ? "bg-indigo-50/70 dark:bg-indigo-950/35 border-indigo-300 dark:border-indigo-700/80 text-slate-900 dark:text-white shadow-2xs"
                                  : "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 opacity-75 hover:opacity-100"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleReceiptItem(idx)}
                                  className="w-5 h-5 rounded-md border-slate-400 text-indigo-600 focus:ring-2 focus:ring-indigo-500 cursor-pointer shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <span
                                    className={`text-sm font-semibold block truncate ${
                                      !isChecked ? "line-through" : ""
                                    }`}
                                  >
                                    {item.quantity && item.quantity > 1 ? `${item.quantity}x ` : ""}
                                    {item.name}
                                  </span>
                                </div>
                              </div>
                              <span
                                className={`text-sm font-extrabold shrink-0 tabular-nums ${
                                  isChecked
                                    ? "text-indigo-700 dark:text-indigo-300"
                                    : "text-slate-500 dark:text-slate-400 line-through"
                                }`}
                              >
                                {formatDisplayPrice(item.price)}
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      {/* Live Item Counts & Totals Summary */}
                      <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                          <span className="text-[10px] text-slate-600 dark:text-slate-300 block font-semibold">
                            Избрани артикули
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {selectedItemIndices.size} от {receiptItems.length}
                          </span>
                        </div>
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-300 block font-semibold">
                            Включена сума
                          </span>
                          <span className="font-extrabold text-emerald-700 dark:text-emerald-300">
                            {formatDisplayPrice(includedTotalDisplay)}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                          <span className="text-[10px] text-slate-600 dark:text-slate-300 block font-semibold">
                            Общо по бележка
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatDisplayPrice(receiptTotalDisplay)}
                          </span>
                        </div>
                      </div>

                      {selectedItemIndices.size === 0 && (
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span>Изберете поне един артикул, за да запазите разхода.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Category Selector */}
                  <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                        Категория *
                      </label>
                      <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        Предложена категория
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
                            {selectedCategory?.name || "Изберете категория"}
                          </span>
                          <span className="text-[11px] text-slate-600 dark:text-slate-300">
                            Кликнете за ръчна смяна
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
                        Бюджетна категория (Budget Category)
                      </label>
                      <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                        Причислете разхода към месечен бюджет
                      </span>
                    </div>

                    <select
                      value={selectedBudgetCategoryId}
                      onChange={(e) => setSelectedBudgetCategoryId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">Без бюджетна категория (No Budget Category)</option>
                      {budgetCategories.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.categoryName} (Лимит: €{b.monthlyLimit.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date & Merchant Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                        Дата на покупката
                      </label>
                      <div className="relative">
                        <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-1">
                        Търговец / Обект
                      </label>
                      <input
                        type="text"
                        value={merchantName}
                        onChange={(e) => setMerchantName(e.target.value)}
                        placeholder="Напр. Lidl, Shell, Ресторант"
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-500 dark:placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* Notes & Items List (Auto-expanding without internal scrollbar) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                        Бележка / Артикули от бележката
                      </label>
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                        Всеки артикул на нов ред (автоматично разширяване)
                      </span>
                    </div>
                    <textarea
                      ref={notesTextareaRef}
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        adjustNotesHeight();
                      }}
                      placeholder={"Хляб бял - 2.39 лв.\nПрясно мляко - 3.49 лв.\nСалата Шопска - 7.90 лв."}
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono leading-relaxed placeholder:text-slate-500 dark:placeholder:text-slate-400 resize-none overflow-hidden transition-[height] shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Expandable Debug Logs Panel */}
          {showDebugPanel && (
            <div className="mt-4 p-4 bg-slate-900 rounded-2xl border border-slate-800 text-white font-mono text-xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Bug className="w-4 h-4" />
                  Диагностични логове (Debug Logs)
                </span>
                <span className="text-[11px] text-slate-400">{debugLogs.length} записа</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {debugLogs.length === 0 ? (
                  <span className="text-slate-400">Няма записани логове до момента.</span>
                ) : (
                  debugLogs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[11px] leading-relaxed">
                      <span className="text-slate-400 shrink-0">[{log.timestamp}]</span>
                      <span
                        className={`font-semibold shrink-0 uppercase text-[9px] px-1 rounded ${
                          log.step === "error"
                            ? "bg-red-950 text-red-400 border border-red-800"
                            : log.step === "parsed_total" || log.step === "expense"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : "bg-indigo-950 text-indigo-300 border border-indigo-800"
                        }`}
                      >
                        {log.step}
                      </span>
                      <span className="text-slate-300 break-all">{log.message}</span>
                    </div>
                  ))
                )}
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
                Отказ
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
                <span>Смени снимка</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSkipToManual("Прескачане от преглед")}
                  className="px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Въведи ръчно
                </button>
                <button
                  type="button"
                  onClick={handleProceedFromPreview}
                  className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <span>Продължи</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === "scanning" && (
            <div className="w-full flex justify-between items-center">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Разчитане на касовата бележка...
              </span>
              <button
                type="button"
                onClick={() => handleSkipToManual("Прекъсване от потребителя")}
                className="px-3.5 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-xl transition-colors"
              >
                Прескочи и въведи ръчно
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
                <span>Нова снимка</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Отказ
                </button>
                <button
                  type="button"
                  onClick={handleSaveExpense}
                  disabled={
                    (receiptItems.length > 0 && selectedItemIndices.size === 0) ||
                    !amount ||
                    parseFloat(amount) <= 0
                  }
                  className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold disabled:opacity-50 transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Добави към разходите</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

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
