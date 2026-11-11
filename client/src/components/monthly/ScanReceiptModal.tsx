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
} from "lucide-react";
import { ExpenseCategory, ExpenseItem, ReceiptItemDetail } from "@/types";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { AVAILABLE_ICONS_MAP } from "@/utils/categoryStorage";
import { parseReceiptTextLocally, ParsedReceiptData } from "@/utils/receiptParser";
import { runClientOcr } from "@/utils/tesseractOcr";
import { parseExpenseNote } from "@/utils/expenseFormatter";

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
  step: "ocr_text" | "parsed_total" | "parsed_merchant" | "parsed_items" | "gemini_res" | "error" | "expense";
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

// Timeout-safe image preprocessor for mobile and desktop
async function prepareReceiptImageWithTimeout(
  file: File,
  maxDimension: number = 1600,
  timeoutMs: number = 7000
): Promise<{ base64: string; previewUrl: string; mimeType: string; originalSize: number; compressedSize: number; dimensions: string }> {
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
            resolve({
              base64: reader.result as string,
              previewUrl: reader.result as string,
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
          const base64 = canvas.toDataURL(mimeType, 0.88);

          resolve({
            base64,
            previewUrl: base64,
            mimeType,
            originalSize: file.size,
            compressedSize: Math.round((base64.length * 3) / 4),
            dimensions: `${width}x${height}`,
          });
        } catch (canvasErr: any) {
          resolve({
            base64: reader.result as string,
            previewUrl: reader.result as string,
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

// Smart category suggestion matching
function matchCategory(
  result: { merchantName?: string; rawText?: string; suggestedCategory?: string },
  availableCategories: ExpenseCategory[]
): ExpenseCategory {
  const merchant = (result.merchantName || "").toLowerCase();
  const raw = (result.rawText || "").toLowerCase();
  const suggested = (result.suggestedCategory || "").toLowerCase();

  const rules: { keywords: string[]; targetIdOrName: string }[] = [
    {
      keywords: ["ресторант", "restaurant", "mcdonalds", "kfc", "subway", "bar", "cafe", "кафе", "механа", "дюнер", "кухня", "пица", "pizza", "bistro", "бистро", "happy", "grill"],
      targetIdOrName: "ресторант",
    },
    {
      keywords: ["лидл", "lidl", "билла", "billa", "кауфланд", "kaufland", "фантастико", "fantastico", "храна", "супермаркет", "пекарна", "t-market", "metro", "хляб", "groceries", "market", "market", "walmart", "target"],
      targetIdOrName: "храна",
    },
    {
      keywords: ["shell", "omv", "лукойл", "lukoil", "ромпетрол", "rompetrol", "петрол", "бензиностанция", "гориво", "дизел", "бензин", "eko", "газпром", "fuel", "gas"],
      targetIdOrName: "гориво",
    },
    {
      keywords: ["аптека", "pharmacy", "subra", "sopharmacy", "ремедиум", "лекарства", "хапчета", "медикаменти", "health", "cvs", "walgreens"],
      targetIdOrName: "аптека",
    },
    {
      keywords: ["кино", "cinema", "арена", "cinema city", "театър", "филм", "movie", "entertainment"],
      targetIdOrName: "кино",
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
      keywords: ["dm", "lilly", "лили", "козметика", "парфюм", "cosmetics"],
      targetIdOrName: "козметика",
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
    const matched = rule.keywords.some(
      (kw) => merchant.includes(kw) || raw.includes(kw) || suggested.includes(kw)
    );
    if (matched) {
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
    prepared?: { base64: string; mimeType: string; previewUrl: string };
  } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState("Инициализиране на OCR скенера...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Review Form State
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState<string>("");
  const [merchantName, setMerchantName] = useState<string>("");
  const [receiptItems, setReceiptItems] = useState<ReceiptItemDetail[]>([]);
  const [rawText, setRawText] = useState<string>("");
  const [confidence, setConfidence] = useState<"high" | "medium" | "low">("high");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory>(() => categories[0]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

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
    setNotes("");
    setMerchantName("");
    setReceiptItems([]);
    setRawText("");
    setWarnings([]);
    setShowCategoryPicker(false);
    setShowRawText(false);
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
      const prepared = await prepareReceiptImageWithTimeout(file, 1600, 7000);
      setImagePreview(prepared.previewUrl);
      setImageMeta({
        name: file.name,
        sizeFormatted: `${Math.round(prepared.compressedSize / 1024)} KB`,
        dimensions: prepared.dimensions,
        prepared: {
          base64: prepared.base64,
          mimeType: prepared.mimeType,
          previewUrl: prepared.previewUrl,
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

  // OCR Workflow
  const runScanWorkflow = async (prepared: { base64: string; mimeType: string; previewUrl: string }) => {
    setStep("scanning");
    setScanStatusMessage("1/3 Оптимизиране на изображението...");
    let ocrRawText = "";
    try {
      const ocrResult = await runClientOcr(
        prepared.previewUrl,
        (percent, status) => {
          setScanStatusMessage(`2/3 OCR разпознаване (${percent}%): ${status}`);
        },
        9000 // 9s timeout for client OCR
      );
      ocrRawText = ocrResult.text;
      addDebugLog(
        "ocr_text",
        `OCR текст (${ocrRawText.length} символа):\n` + ocrRawText.slice(0, 400)
      );
    } catch (ocrErr: any) {
      addDebugLog("error", `Локалното OCR отне твърде много време или се провали: ${ocrErr?.message}`);
    }

    // 3. Deterministic Local Parsing
    const localParsed: ParsedReceiptData = parseReceiptTextLocally(ocrRawText);
    addDebugLog(
      "parsed_total",
      `Локално извлечена обща сума: €${localParsed.totalAmount} (Правило: ${localParsed.matchedRule || "—"})`
    );
    addDebugLog("parsed_merchant", `Локално извлечен търговец: "${localParsed.merchantName}"`);
    addDebugLog(
      "parsed_items",
      `Локално извлечени артикули: ${localParsed.items.length}`,
      localParsed.items
    );

    // Initial baseline state populated from OCR-first results
    setMerchantName(localParsed.merchantName);
    setAmount(localParsed.totalAmount > 0 ? localParsed.totalAmount.toFixed(2) : "");
    setDate(localParsed.date);
    setNotes(localParsed.notesFormatted);
    setReceiptItems(localParsed.items || []);
    setRawText(ocrRawText);
    setConfidence(localParsed.confidence);
    setWarnings(localParsed.warnings);

    setDetectedMerchant(localParsed.merchantName);
    setDetectedDate(localParsed.date);
    setDetectedTotal(localParsed.totalAmount);
    setDetectedItemsCount(localParsed.items.length);
    setAiSourceBadge("Вграден OCR модул");

    const baseCat = matchCategory(
      {
        merchantName: localParsed.merchantName,
        rawText: ocrRawText,
      },
      categories
    );
    setSelectedCategory(baseCat);

    // 4. Gemini AI Enrichment (Optional improvement - never blocks expense creation)
    setScanStatusMessage("3/3 Интелигентен AI анализ с Gemini 3.8 Flash...");
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

          // ============================================================
          // CRITICAL FIX FOR 0.24 BUG:
          // If Gemini returned a tiny total (like 0.24) while local OCR
          // correctly found the actual total (e.g. 31.39), REJECT 0.24!
          // ============================================================
          let finalTotal = localParsed.totalAmount;

          if (gData.totalAmount && gData.totalAmount > 0) {
            if (localParsed.totalAmount > 0) {
              // If Gemini total is severely smaller than OCR total (e.g. 0.24 vs 31.39)
              if (gData.totalAmount < localParsed.totalAmount * 0.7) {
                addDebugLog(
                  "parsed_total",
                  `⚠️ Отхвърлена подозрителна сума от Gemini (€${gData.totalAmount}). Запазена е правилната обща сума от OCR: €${localParsed.totalAmount}`
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
          }

          // Date
          if (gData.date && /^\d{4}-\d{2}-\d{2}$/.test(gData.date)) {
            setDate(gData.date);
            setDetectedDate(gData.date);
          }

          // Formatted Notes
          if (gData.notesFormatted && gData.notesFormatted.trim().length > 3) {
            setNotes(gData.notesFormatted);
          } else if (localParsed.notesFormatted) {
            setNotes(localParsed.notesFormatted);
          }

          // Items count & structured items
          if (gData.items && gData.items.length > 0) {
            setReceiptItems(gData.items);
            setDetectedItemsCount(gData.items.length);
          } else if (localParsed.items && localParsed.items.length > 0) {
            setReceiptItems(localParsed.items);
            setDetectedItemsCount(localParsed.items.length);
          } else {
            setDetectedItemsCount(0);
          }

          if (gData.rawText) {
            setRawText(gData.rawText);
          }

          // Smart category suggestion from Gemini
          if (gData.suggestedCategory) {
            const enrichedCat = matchCategory(gData, categories);
            setSelectedCategory(enrichedCat);
          }

          setAiSourceBadge("Gemini 3.8 Flash + OCR");
        } else {
          // Gemini returned 503 / 429 / fallbackData
          addDebugLog("gemini_res", "Gemini върна неуспех (503/429/error). Използват се данните от OCR.");
          setWarnings([
            "AI анализът временно не е наличен. Бележката е разчетена чрез OCR.",
          ]);
        }
      } else {
        // Static hosting (GitHub Pages)
        addDebugLog("gemini_res", "Статичен хостинг (GitHub Pages). Използват се локалните OCR данни.");
        setWarnings([
          "AI анализът временно не е наличен. Бележката е разчетена чрез OCR.",
        ]);
      }
    } catch (gErr: any) {
      clearTimeout(timeoutTimer);
      addDebugLog("gemini_res", `Gemini заявката не успя (${gErr?.message}). Използват се локалните OCR данни.`);
      setWarnings([
        "AI анализът временно не е наличен. Бележката е разчетена чрез OCR.",
      ]);
    } finally {
      abortControllerRef.current = null;
      // ALWAYS proceed to review screen - never block the user
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

  // Save confirmed expense
  const handleSaveExpense = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage("Моля, въведете валидна сума, по-голяма от 0.");
      return;
    }

    // Determine structured items: check if user edited the notes box
    let finalItems = receiptItems;
    if (notes.trim()) {
      const parsedFromNotes = parseExpenseNote(
        notes,
        merchantName,
        receiptItems.length > 0 ? receiptItems : undefined
      );
      if (parsedFromNotes.items && parsedFromNotes.items.length > 0) {
        finalItems = parsedFromNotes.items;
      }
    }

    const cleanMerchant =
      merchantName && merchantName !== "Неизвестен търговец"
        ? merchantName.trim()
        : undefined;

    const newExpense: ExpenseItem = {
      id: Date.now().toString(),
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      categoryIcon: selectedCategory.iconName,
      categoryColor: selectedCategory.colorClass,
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
      `Разходът е записан успешно: ${newExpense.categoryName} €${newExpense.amount} (${finalItems.length} артикула)`,
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
              <p className="text-xs text-slate-400 dark:text-slate-400">
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
                  className="flex items-center justify-center gap-3 p-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-900 dark:text-white rounded-2xl border-2 border-slate-300 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all active:scale-[0.98] group text-left cursor-pointer"
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
                    : "border-slate-400 dark:border-slate-600 hover:border-indigo-500 dark:hover:border-indigo-400 bg-white dark:bg-slate-900 shadow-xs"
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
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 pt-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Време: {scanElapsedSeconds}s</span>
                </div>
              </div>

              {/* Skip to manual */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSkipToManual("Потребителят прескочи сканирането")}
                  className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-2xs active:scale-95"
                >
                  <span>Въведи данните ръчно</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setStep("upload")}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
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

              {/* CONFIDENCE CHECK CARD (Detected summary) */}
              <div className="p-3.5 bg-white dark:bg-slate-850 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Проверка на разпознатите стойности (Confidence Check)
                  </span>
                  <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                    Източник: {aiSourceBadge}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
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
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 block uppercase font-bold">Обща сума</span>
                    <span className="font-black text-indigo-700 dark:text-indigo-300 block">
                      €{amount || (detectedTotal > 0 ? detectedTotal.toFixed(2) : "0.00")}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 block uppercase font-bold">Артикули</span>
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {detectedItemsCount || (notes ? notes.split("\n").filter(Boolean).length : 0)} бр.
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
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-850">
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
                  <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                      Крайна сума (€ / EUR) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-600 dark:text-slate-300">
                        €
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-2xl sm:text-3xl font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        required
                        autoFocus
                      />
                    </div>
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium block">
                      Точно разпозната крайна сума (TOTAL / GRAND TOTAL)
                    </span>
                  </div>

                  {/* Category Selector */}
                  <div className="bg-white dark:bg-slate-850 p-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-1.5">
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
                      className="w-full flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 rounded-xl transition-all group text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-2xs ${selectedCategory?.colorClass}`}
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
                      <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-transform" />
                    </button>
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
                      placeholder={"Beer €5.00\nSoup €7.00\nSalad €8.50"}
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
                  <span className="text-slate-500">Няма записани логове до момента.</span>
                ) : (
                  debugLogs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[11px] leading-relaxed">
                      <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
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
              <span className="text-xs text-slate-400">
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
                  disabled={!amount || parseFloat(amount) <= 0}
                  className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold disabled:opacity-50 transition-all shadow-md active:scale-95"
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
