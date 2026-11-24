export const GEMINI_RECEIPT_MODELS = [
  "gemini-4-hydrogen",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.1-pro-preview",
] as const;

const DEPRECATED_PROHIBITED_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-2.0-flash",
  "gemini-2.0-pro",
  "gemini-2.0-flash-thinking",
]);

const MODEL_TIMEOUT_MS: Record<string, number> = {
  "gemini-4-hydrogen": 35000,
  "gemini-3.1-flash-lite": 25000,
  "gemini-flash-lite-latest": 25000,
  "gemini-3.8-flash": 30000,
  "gemini-3.7-flash": 30000,
  "gemini-3.6-flash": 30000,
  "gemini-3.5-flash": 30000,
  "gemini-3-flash-preview": 30000,
  "gemini-3.5-flash-lite": 25000,
  "gemini-flash-latest": 30000,
  "gemini-3.1-pro-preview": 40000,
};

const DEFAULT_BACKUP_MODEL_TIMEOUT_MS = 30000;
const SERVER_TOTAL_BUDGET_MS = 180000;

export function resolveGeminiReceiptModels(backupModels?: unknown): string[] {
  const extra: string[] = [];
  if (typeof backupModels === "string") {
    backupModels
      .split(/[\s,;]+/)
      .map((m) => m.trim().replace(/^models\//i, ""))
      .filter(Boolean)
      .forEach((m) => extra.push(m));
  } else if (Array.isArray(backupModels)) {
    backupModels
      .map((m) => (typeof m === "string" ? m.trim().replace(/^models\//i, "") : ""))
      .filter(Boolean)
      .forEach((m) => extra.push(m));
  }

  const combined = [...GEMINI_RECEIPT_MODELS, ...extra];
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const model of combined) {
    const normalized = model.toLowerCase();
    if (!normalized || DEPRECATED_PROHIBITED_MODELS.has(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    resolved.push(model);
  }
  return resolved;
}

export type GeminiFailureCategory =
  | "timeout"
  | "quota_limit"
  | "network_error"
  | "gemini_response_error"
  | "parsing_error"
  | "configuration_error"
  | "client_error";

export interface GeminiQuotaViolationDiagnostic {
  model: string;
  quotaMetric: string | null;
  quotaId: string | null;
  quotaValue: string | null;
  quotaDimensions?: Record<string, string>;
  retryDelay?: string | null;
  message?: string;
}

export interface GeminiAttemptDiagnostic {
  model: string;
  attempt: number;
  timeoutMs: number;
  startedAt: string;
  durationMs: number;
  httpStatus: number | null;
  upstreamStatus: string | null;
  errorCode: string | null;
  quotaMetric?: string | null;
  quotaId?: string | null;
  quotaValue?: string | null;
  retryDelay?: string | null;
  finishReason: string | null;
  outcome: "success" | "timeout" | "http_error" | "empty_response" | "parse_error" | "network_error";
  detail: string;
}

export interface GeminiDiagnosticsSummary {
  requestId: string;
  startedAt: string;
  totalDurationMs: number;
  modelsConfigured?: string[];
  errorCategory?: GeminiFailureCategory;
  fallbackTriggerReason?: string | null;
  quotaDiagnostics?: GeminiQuotaViolationDiagnostic[];
  attempts: GeminiAttemptDiagnostic[];
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRequestId(): string {
  return `ocr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface GeminiReceiptItem {
  name: string;
  price: number;
  quantity: number;
  unitPrice?: number;
  originalPrice?: number;
  discount?: number;
  finalPrice?: number;
  discountLabel?: string;
}

export interface GeminiReceiptData {
  merchantName: string;
  address?: string;
  date: string;
  totalAmount: number;
  expectedItemsCount: number | null;
  currency: string;
  suggestedCategory: string;
  items: GeminiReceiptItem[];
  quantityLines?: string[];
  notesFormatted: string;
}

export interface GeminiProgressEvent {
  type: "start" | "attempt" | "attempt_failed" | "complete";
  pass: number;
  model: string;
  attemptIndex: number;
  totalModels: number;
  globalAttempt: number;
  httpStatus?: number | null;
  errorCode?: string | null;
}

export interface GeminiReceiptAnalysisResponse {
  status: number;
  body:
    | {
        success: true;
        modelUsed: string;
        httpStatus: number;
        durationMs: number;
        diagnostics: GeminiDiagnosticsSummary;
        data: GeminiReceiptData;
      }
    | {
        success: false;
        error: string;
        errorCode: string;
        errorCategory: GeminiFailureCategory;
        workerErrorCode?: string | null;
        geminiErrorCode?: string | null;
        timeoutReason?: string | null;
        failingStage?: "WORKER_PARSE" | "GEMINI_REQUEST" | "GEMINI_RESPONSE" | "JSON_PARSE";
        httpStatus: number | null;
        modelAttempted: string | null;
        fallbackReason: string;
        message: string;
        diagnostics?: GeminiDiagnosticsSummary;
      };
}

export function parseGeminiNum(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") {
    const cleaned = val.replace(/[^\d.,-]/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function buildBulgarianReceiptPrompt(ocrText?: string): string {
  return `Analyze this receipt (primarily Bulgarian supermarket receipts in Cyrillic/Latin: Lidl, Billa, Kaufland, Fantastico, T Market, Metro, or English receipts). Return ONLY a valid JSON object matching this exact schema:
{
  "merchantName": "Clean Store/Brand Name (e.g. Kaufland, Lidl, Billa, Fantastico, T Market, Metro, OMV, Shell, Happy, Lilly, Sopharmacy)",
  "address": "Store/branch street address and city printed on the receipt (e.g. 'гр. Пловдив, ул. Пещерско шосе №34'), or empty string",
  "date": "YYYY-MM-DD or empty string if unreadable",
  "totalAmount": 12.34,
  "expectedItemsCount": 17,
  "currency": "€",
  "suggestedCategory": "One of: храна, ресторант, гориво, кино, козметика, аптека, кола, дрехи, фризьор, домашни любимци, почистване, други",
  "items": [
    { "name": "Readable Item Name", "price": 2.04, "quantity": 1, "unitPrice": 2.04, "originalPrice": 3.06, "discount": 1.02, "finalPrice": 2.04, "discountLabel": "Lidl Plus" }
  ],
  "quantityLines": ["4.000 x 0.15", "3.000 x 0.79"],
  "notesFormatted": "2 x Coca Cola - €4.80\\n1 x Снакс с фъстъци - €2.04 (ориг. €3.06, -€1.02 Lidl Plus)"
}
Important rules for Bulgarian & international receipts (especially long 15-30 item supermarket receipts):
- "merchantName": Extract ONLY the store/restaurant/brand name. IGNORE EIK/BULSTAT (ЕИК, БУЛСТАТ), VAT numbers (BG...), fiscal device IDs (ФУ, ФП, УНП, КАСА), and street addresses (гр., ул., бул.).
- "address": Extract the STORE/BRANCH physical street address and city printed on the receipt (e.g. "гр. Пловдив, ул. Пещерско шосе №34" or "бул. България 115А, Пловдив"). If city and street are on separate lines (e.g. "ЛИДЛ ПЛОВДИВ 155" / "гр. Пловдив" / "ул. Пещерско шосе №34"), combine them as "гр. Пловдив, ул. Пещерско шосе №34". If both a company HQ address (near ЕООД, ЕИК, СЕДАЛИЩЕ, с. Равно поле) and a store/branch address exist, ALWAYS pick the store/branch address. Return "" if no address is printed.
- "date": Extract ONLY the transaction date printed on the receipt (e.g. 14.11.2026, 14/11/2026, 14-11-2026, 2026-11-14) and format strictly as YYYY-MM-DD. NEVER guess or substitute today's date if no date is visible — return "" when unreadable. Ignore receipt/fiscal numbers.
- "totalAmount": MUST be the final amount paid in the receipt's primary currency (ОБЩО, ОБЩА СУМА, КРАЙНА СУМА, ЗА ПЛАЩАНЕ, СУМА ЗА ПЛАЩАНЕ, TOTAL, GRAND TOTAL). NEVER pick VAT (ДДС), discount (ОТСТЪПКА), subtotal (МЕЖДИННА СУМА), or change (РЕСТО).
- "expectedItemsCount": Integer count if printed on receipt (e.g. "17 АРТИКУЛА", "ITEMS SOLD: 17"), otherwise null.
- "currency": Bulgaria uses the Euro (€, EUR). Always return "€" for Bulgarian receipts (including dual-display receipts), or "$" / "£" only if explicitly printed in USD or GBP. Never return "лв." or "BGN", and never convert prices — extract the exact EUR printed values.
- "items": CRITICAL — Do NOT truncate, sample, or skip any purchased items. Extract EVERY single item line from top to bottom until Subtotal/Total/VAT/Payment! On a 17-item receipt, return all 17 items so the sum of item "price" matches totalAmount. Fix garbled Cyrillic/Latin OCR letters using the receipt image and raw OCR text (e.g. ПРЯСНО МЛЯКО, ХЛЯБ БЯЛ, СИРЕНЕ, ДОМАТИ), merge multi-line wrapped product names into one readable item name, extract exact integer quantity ("quantity": 2 for "2 x Coca Cola" or "2 x 2.40  4.80"; default 1), optional "unitPrice" when printed (e.g. 0.15 for "4.000 x 0.15"), and the final line price ("price").
  * GENERIC QUANTITY CALCULATION & PRICE-LOCK RULE (CRITICAL): Different stores place standalone calculation rows "QTY x UNIT_PRICE" (e.g. "4.000 x 0.15", "3.000 x 0.79", "2 x 0.40") either BEFORE (above) or AFTER (below) the product they belong to. NEVER guess by fixed direction ("always previous" or "always next") and NEVER move or swap product line totals ("price") between adjacent items! Keep every product's printed line total strictly paired with its own product name. For every standalone "QTY x UNIT_PRICE" row:
      1) Compute EXPECTED_TOTAL = QTY * UNIT_PRICE.
      2) Inspect nearby products (both above and below) and assign "quantity" and "unitPrice" ONLY to the product whose printed total (or pre-discount originalPrice) equals EXPECTED_TOTAL (within ±0.02).
      Example A (calculation line BEFORE its product):
        Item 1 name + 2.04  --> price=2.04, quantity=1
        4.000 x 0.15        --> 4 * 0.15 = 0.60, matches Item 2!
        Item 2 name + 0.60  --> price=0.60, quantity=4, unitPrice=0.15
      Example B (calculation line AFTER its product):
        Item 1 name + 0.80  --> price=0.80, quantity=2, unitPrice=0.40
        2 x 0.40            --> 2 * 0.40 = 0.80, matches Item 1!
        Item 2 name + 0.95  --> price=0.95, quantity=1
  * DISCOUNTS (e.g. "#Lidl Plus промоция" / "ОТСТЪПКИ 1,02-" / "-1.02" / "ОТСТЪПКА"): NEVER output a discount line as a standalone item! Instead, attach it directly to the PRECEDING item: set "originalPrice" to the item's printed pre-discount price (e.g. 3.06), "discount" to the positive discount amount (e.g. 1.02), "finalPrice" and "price" BOTH to originalPrice - discount (e.g. 2.04), and "discountLabel" (e.g. "Lidl Plus" or "Отстъпка"). If an item has no discount, omit discount fields or leave discount=0.
  * Strip trailing tax group letters (А, Б, В, Г, A, B, C, D). NEVER include ДДС/VAT, В БРОЙ, КАРТА, РЕСТО, or ОБЩО rows as items.
- "quantityLines": List EVERY standalone "qty x unitPrice" calculation row visible on the receipt in top-to-bottom order (e.g. ["4.000 x 0.15", "2 x 0.40"]), or [] if none.
- "notesFormatted": Multi-line list, one item per line strictly formatted as "<quantity> x <Item Name> - <currency><price>" (e.g. "2 x Coca Cola - €4.80\\n1 x Хляб бял - €1.20"). Never put all items on a single line.
- "suggestedCategory": Lidl/Kaufland/Billa/Fantastico/T Market/Metro -> "храна"; Shell/OMV/Lukoil/Eko/Rompetrol -> "гориво"; Happy/Raffy/KFC/McDonald's -> "ресторант"; Cinema City/Kino Arena -> "кино"; Lilly/DM -> "козметика"; Sopharmacy/Subra -> "аптека".
- Raw OCR text hint (may contain Cyrillic/Latin OCR artifacts): ${ocrText ? JSON.stringify(ocrText.slice(0, 6000)) : "None"}
- Return ONLY pure JSON, no markdown code blocks.`;
}

export async function analyzeReceiptWithGemini(input: {
  apiKey?: string;
  backupModels?: unknown;
  imageBase64?: unknown;
  mimeType?: unknown;
  ocrText?: unknown;
  onProgress?: (event: GeminiProgressEvent) => void;
  abortSignal?: AbortSignal;
}): Promise<GeminiReceiptAnalysisResponse> {
  const reqStart = Date.now();
  const startedAtIso = new Date(reqStart).toISOString();
  const requestId = createRequestId();
  const attempts: GeminiAttemptDiagnostic[] = [];
  const modelsToTry = resolveGeminiReceiptModels(input.backupModels);
  const emitProgress = (event: GeminiProgressEvent) => {
    try {
      input.onProgress?.(event);
    } catch {
      // Ignore progress listener errors
    }
  };
  let globalAttemptCounter = 0;

  try {
    const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    const rawBase64 = typeof input.imageBase64 === "string" ? input.imageBase64 : "";
    const dataPrefixComma = rawBase64.startsWith("data:") ? rawBase64.indexOf(",") : -1;
    const cleanBase64 =
      dataPrefixComma !== -1 ? rawBase64.slice(dataPrefixComma + 1) : rawBase64;
    const ocrTextStr = typeof input.ocrText === "string" ? input.ocrText : "";
    const mimeTypeStr =
      typeof input.mimeType === "string" && input.mimeType.trim()
        ? input.mimeType.trim()
        : "image/jpeg";

    console.log(
      `[Gemini OCR] Gemini request start | requestId=${requestId} | apiKeyPresent=${Boolean(apiKey)} | models=[${modelsToTry.join(", ")}] | hasImage=${Boolean(cleanBase64)} | imageBase64Chars=${cleanBase64.length} | ocrTextChars=${ocrTextStr.length}`
    );

    if (!apiKey) {
      const fallbackReason =
        "Invalid or missing API key (GEMINI_API_KEY not configured on server)";
      console.warn(
        `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=configuration_error | errorCode=NO_API_KEY | reason="${fallbackReason}"`
      );
      return {
        status: 200,
        body: {
          success: false,
          error: "NO_API_KEY",
          errorCode: "NO_API_KEY",
          errorCategory: "configuration_error",
          workerErrorCode: "MISSING_GEMINI_API_KEY",
          geminiErrorCode: "NO_API_KEY",
          timeoutReason: null,
          failingStage: "GEMINI_REQUEST",
          httpStatus: null,
          modelAttempted: null,
          fallbackReason,
          message: "Gemini API key is not configured. Falling back to local OCR.",
          diagnostics: {
            requestId,
            startedAt: startedAtIso,
            totalDurationMs: Date.now() - reqStart,
            modelsConfigured: modelsToTry,
            errorCategory: "configuration_error",
            fallbackTriggerReason: fallbackReason,
            attempts,
          },
        },
      };
    }

    if (!cleanBase64 && !ocrTextStr) {
      const missingReason = "No image or OCR text provided";
      console.warn(
        `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=client_error | errorCode=MISSING_DATA | reason="${missingReason}"`
      );
      return {
        status: 400,
        body: {
          success: false,
          error: "MISSING_DATA",
          errorCode: "MISSING_DATA",
          errorCategory: "client_error",
          workerErrorCode: "MISSING_REQUEST_DATA",
          geminiErrorCode: "NOT_REACHED",
          timeoutReason: null,
          failingStage: "WORKER_PARSE",
          httpStatus: 400,
          modelAttempted: null,
          fallbackReason: missingReason,
          message: "No image or OCR text provided.",
          diagnostics: {
            requestId,
            startedAt: startedAtIso,
            totalDurationMs: Date.now() - reqStart,
            modelsConfigured: modelsToTry,
            errorCategory: "client_error",
            fallbackTriggerReason: missingReason,
            attempts,
          },
        },
      };
    }

    const parts: any[] = [];
    if (cleanBase64) {
      parts.push({
        inlineData: {
          mimeType: mimeTypeStr,
          data: cleanBase64,
        },
      });
    }
    parts.push({ text: buildBulgarianReceiptPrompt(ocrTextStr) });

    let lastHttpStatus: number | null = null;
    let lastErrorCode = "API_ERROR";
    let lastErrorCategory: GeminiFailureCategory = "gemini_response_error";
    let lastGeminiErrorCode: string | null = null;
    let lastTimeoutReason: string | null = null;
    let lastErrorDetail = "";
    let lastModelAttempted: string = modelsToTry[0];

    // Track per-model eligibility for Pass 2 transient recovery:
    // - Pass 1 sweeps ALL models once each (no duplicate 429 hits, fast discovery of healthy backups).
    // - Pass 2 only retries models that failed with transient 503/504/network/timeout (never 429 daily/zero quota or 404/403).
    const transientRetryCandidates = new Set<string>();
    const modelAttemptCount = new Map<string, number>();

    emitProgress({
      type: "start",
      pass: 1,
      model: modelsToTry[0] || "",
      attemptIndex: 1,
      totalModels: modelsToTry.length,
      globalAttempt: 0,
    });

    for (let pass = 1; pass <= 2; pass++) {
      if (input.abortSignal?.aborted) break;
      const passModels =
        pass === 1
          ? modelsToTry
          : modelsToTry.filter((m) => transientRetryCandidates.has(m));
      if (passModels.length === 0) break;

      if (pass === 2) {
        const remainingBeforePass2 = SERVER_TOTAL_BUDGET_MS - (Date.now() - reqStart);
        if (remainingBeforePass2 < 20000) {
          console.warn(
            `[Gemini OCR] Skipping Pass 2 transient recovery | requestId=${requestId} | remainingBudgetMs=${remainingBeforePass2}`
          );
          break;
        }
        console.log(
          `[Gemini OCR] Starting Pass 2 transient recovery | requestId=${requestId} | models=[${passModels.join(", ")}] | remainingBudgetMs=${remainingBeforePass2}`
        );
        await sleepMs(2200);
      }

      for (let mIdx = 0; mIdx < passModels.length; mIdx++) {
        if (input.abortSignal?.aborted) break;
        const modelName = passModels[mIdx];
        const remainingModelsAfterThis =
          pass === 1 ? passModels.length - 1 - mIdx : passModels.length - 1 - mIdx;
        const nextModelName =
          mIdx + 1 < passModels.length ? passModels[mIdx + 1] : null;
        lastModelAttempted = modelName;
        const baseModelTimeoutMs =
          MODEL_TIMEOUT_MS[modelName] ?? DEFAULT_BACKUP_MODEL_TIMEOUT_MS;
        const attemptNum = (modelAttemptCount.get(modelName) || 0) + 1;
        modelAttemptCount.set(modelName, attemptNum);

        const generationConfig: Record<string, any> =
          modelName === "gemini-4-hydrogen"
            ? {
                responseMimeType: "application/json",
                thinkingConfig: { thinkingLevel: "LOW" },
              }
            : {
                responseMimeType: "application/json",
              };

        const remainingServerBudgetMs = SERVER_TOTAL_BUDGET_MS - (Date.now() - reqStart);
        if (remainingServerBudgetMs < 5000) {
          console.warn(
            `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=timeout | reason="Server total budget (${SERVER_TOTAL_BUDGET_MS}ms) exhausted before ${modelName} (pass ${pass})"`
          );
          break;
        }

        const reserveForRemainingModelsMs =
          pass === 1 ? Math.min(remainingModelsAfterThis * 8000, Math.max(0, remainingServerBudgetMs - 15000)) : 2000;
        const perModelTimeoutMs = Math.min(
          baseModelTimeoutMs,
          Math.max(10000, remainingServerBudgetMs - reserveForRemainingModelsMs)
        );
        const attemptStart = Date.now();
        const attemptStartedAt = new Date(attemptStart).toISOString();
        const controller = new AbortController();
        let didTimeoutAbort = false;
        const timeoutId = setTimeout(() => {
          didTimeoutAbort = true;
          controller.abort();
        }, perModelTimeoutMs);
        const onParentAbort = () => controller.abort();
        input.abortSignal?.addEventListener("abort", onParentAbort, { once: true });

        globalAttemptCounter += 1;
        emitProgress({
          type: "attempt",
          pass,
          model: modelName,
          attemptIndex: mIdx + 1,
          totalModels: passModels.length,
          globalAttempt: globalAttemptCounter,
        });

        try {
          console.log(
            `[Gemini OCR] Gemini request start | requestId=${requestId} | pass=${pass} | model=${modelName} | attempt=${attemptNum} | timeoutMs=${perModelTimeoutMs} | remainingBudgetMs=${remainingServerBudgetMs}`
          );
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "aistudio-build",
              },
              signal: controller.signal,
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig,
              }),
            }
          );

          clearTimeout(timeoutId);
          input.abortSignal?.removeEventListener("abort", onParentAbort);
          lastHttpStatus = response.status;
          const attemptDurationMs = Date.now() - attemptStart;
          const elapsed = Date.now() - reqStart;
          console.log(
            `[Gemini OCR] Gemini response received | requestId=${requestId} | pass=${pass} | model=${modelName} | attempt=${attemptNum} | status=${response.status} | attemptDurationMs=${attemptDurationMs} | totalElapsedMs=${elapsed}`
          );

          if (!response.ok) {
            const errText = await response.text();
            let upstreamStatus: string | null = null;
            let upstreamMessage: string | null = null;
            let quotaMetric: string | null = null;
            let quotaId: string | null = null;
            let quotaValue: string | null = null;
            let retryDelay: string | null = response.headers.get("retry-after");
            try {
              const parsedErr = JSON.parse(errText);
              upstreamStatus = parsedErr?.error?.status || null;
              upstreamMessage = parsedErr?.error?.message || null;
              const detailsArr = Array.isArray(parsedErr?.error?.details)
                ? parsedErr.error.details
                : [];
              for (const d of detailsArr) {
                if (Array.isArray(d?.violations) && d.violations.length > 0 && !quotaMetric) {
                  const v = d.violations[0];
                  quotaMetric = v?.quotaMetric ? String(v.quotaMetric) : null;
                  quotaId = v?.quotaId ? String(v.quotaId) : null;
                  quotaValue =
                    v?.quotaValue !== undefined && v?.quotaValue !== null
                      ? String(v.quotaValue)
                      : null;
                }
                if (d?.retryDelay && !retryDelay) {
                  retryDelay = String(d.retryDelay);
                }
              }
            } catch {
              // Raw text fallback
            }
            if (!quotaValue && upstreamMessage) {
              const limitMatch = upstreamMessage.match(/limit:\s*(\d+)/i);
              if (limitMatch) quotaValue = limitMatch[1];
            }
            if (!quotaMetric && upstreamMessage) {
              const metricMatch = upstreamMessage.match(/metric:\s*([^\s,\n]+)/i);
              if (metricMatch) quotaMetric = metricMatch[1];
            }
            if (!quotaId && upstreamMessage) {
              const idMatch = upstreamMessage.match(/id:\s*([^\s,\n]+)/i);
              if (idMatch) quotaId = idMatch[1];
            }
            lastErrorDetail = (upstreamMessage || errText).slice(0, 900);
            const isUpstreamTimeout =
              response.status === 504 || upstreamStatus === "DEADLINE_EXCEEDED";
            lastTimeoutReason = isUpstreamTimeout
              ? `Gemini API returned HTTP ${response.status} (${upstreamStatus || "DEADLINE_EXCEEDED"}) after ${attemptDurationMs}ms on ${modelName}`
              : null;

            if (response.status === 404) {
              lastErrorCode = "MODEL_NOT_FOUND_404";
              lastErrorCategory = "gemini_response_error";
              lastGeminiErrorCode = upstreamStatus || "MODEL_NOT_FOUND_404";
              attempts.push({
                model: modelName,
                attempt: attemptNum,
                timeoutMs: perModelTimeoutMs,
                startedAt: attemptStartedAt,
                durationMs: attemptDurationMs,
                httpStatus: response.status,
                upstreamStatus,
                errorCode: lastErrorCode,
                finishReason: null,
                outcome: "http_error",
                detail: lastErrorDetail,
              });
              console.warn(
                `[Gemini OCR] Gemini error response | requestId=${requestId} | model=${modelName} | attempt=${attemptNum} | httpStatus=404 | code=${lastErrorCode} | upstreamStatus=${upstreamStatus || "none"} | detail=${lastErrorDetail}`
              );
              if (nextModelName) {
                console.warn(
                  `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | fromModel=${modelName} | toModel=${nextModelName} | reason="HTTP 404 (${lastErrorDetail})"`
                );
              }
              emitProgress({
                type: "attempt_failed",
                pass,
                model: modelName,
                attemptIndex: mIdx + 1,
                totalModels: passModels.length,
                globalAttempt: globalAttemptCounter,
                httpStatus: response.status,
                errorCode: lastErrorCode,
              });
              continue;
            }

            const isInvalidKeyGlobal =
              response.status === 401 ||
              upstreamStatus === "UNAUTHENTICATED" ||
              /API_KEY_INVALID|API key not valid/i.test(lastErrorDetail);
            const isAuthError =
              isInvalidKeyGlobal ||
              response.status === 403 ||
              upstreamStatus === "PERMISSION_DENIED";
            const isNonRetryableOnSameModel =
              response.status === 400 || response.status === 401 || response.status === 403;
            const isQuota429 = response.status === 429 || upstreamStatus === "RESOURCE_EXHAUSTED";

            if (isQuota429) {
              lastErrorCode = "RATE_LIMITED_429";
              lastErrorCategory = "quota_limit";
            } else if (isUpstreamTimeout) {
              lastErrorCode = `HTTP_${response.status}`;
              lastErrorCategory = "timeout";
            } else if (isAuthError) {
              lastErrorCode = `AUTH_OR_REQUEST_${response.status}`;
              lastErrorCategory = "configuration_error";
            } else if (isNonRetryableOnSameModel) {
              lastErrorCode = `AUTH_OR_REQUEST_${response.status}`;
              lastErrorCategory = "gemini_response_error";
            } else {
              lastErrorCode = `HTTP_${response.status}`;
              lastErrorCategory = "gemini_response_error";
              if (pass === 1 && (response.status >= 500 || response.status === 408)) {
                transientRetryCandidates.add(modelName);
              }
            }
            lastGeminiErrorCode = upstreamStatus
              ? `${lastErrorCode} (${upstreamStatus})`
              : lastErrorCode;

            attempts.push({
              model: modelName,
              attempt: attemptNum,
              timeoutMs: perModelTimeoutMs,
              startedAt: attemptStartedAt,
              durationMs: attemptDurationMs,
              httpStatus: response.status,
              upstreamStatus,
              errorCode: lastErrorCode,
              ...(quotaMetric ? { quotaMetric } : {}),
              ...(quotaId ? { quotaId } : {}),
              ...(quotaValue !== null ? { quotaValue } : {}),
              ...(retryDelay ? { retryDelay } : {}),
              finishReason: null,
              outcome: isUpstreamTimeout ? "timeout" : "http_error",
              detail: lastErrorDetail,
            });

            console.warn(
              `[Gemini OCR] Gemini error response | requestId=${requestId} | model=${modelName} | attempt=${attemptNum} | httpStatus=${response.status} | category=${lastErrorCategory} | code=${lastErrorCode} | geminiStatus=${upstreamStatus || "none"} | quotaMetric=${quotaMetric || "none"} | quotaId=${quotaId || "none"} | quotaValue=${quotaValue ?? "none"} | retryDelay=${retryDelay || "none"} | body=${lastErrorDetail}`
            );

            if (isInvalidKeyGlobal) {
              const reason = `Gemini rejected API key (HTTP ${response.status}${upstreamStatus ? ` / ${upstreamStatus}` : ""}): ${lastErrorDetail || "Invalid API key"}`;
              console.warn(
                `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=${lastErrorCategory} | model=${modelName} | reason="${reason}"`
              );
              return {
                status: 200,
                body: {
                  success: false,
                  error: lastErrorCode,
                  errorCode: lastErrorCode,
                  errorCategory: lastErrorCategory,
                  workerErrorCode: null,
                  geminiErrorCode: lastGeminiErrorCode,
                  timeoutReason: lastTimeoutReason,
                  failingStage: "GEMINI_RESPONSE",
                  httpStatus: response.status,
                  modelAttempted: modelName,
                  fallbackReason: reason,
                  message: `Gemini returned status ${response.status} (${lastGeminiErrorCode}). Using local OCR.`,
                  diagnostics: {
                    requestId,
                    startedAt: startedAtIso,
                    totalDurationMs: Date.now() - reqStart,
                    modelsConfigured: modelsToTry,
                    errorCategory: lastErrorCategory,
                    fallbackTriggerReason: reason,
                    attempts,
                  },
                },
              };
            }

            if (nextModelName) {
              console.warn(
                `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | fromModel=${modelName} | toModel=${nextModelName} | reason="HTTP ${response.status} (${lastErrorDetail.slice(0, 180)})"`
              );
            }
            emitProgress({
              type: "attempt_failed",
              pass,
              model: modelName,
              attemptIndex: mIdx + 1,
              totalModels: passModels.length,
              globalAttempt: globalAttemptCounter,
              httpStatus: response.status,
              errorCode: lastErrorCode,
            });
            continue;
          }

          const result: any = await response.json();
          const candidateParts: any[] = result.candidates?.[0]?.content?.parts || [];
          const nonThoughtText = candidateParts
            .filter((p) => typeof p?.text === "string" && !p?.thought)
            .map((p) => p.text)
            .join("")
            .trim();
          const rawContent =
            nonThoughtText ||
            (typeof candidateParts[0]?.text === "string"
              ? candidateParts[0].text
              : "");
          const finishReason = result.candidates?.[0]?.finishReason || "UNKNOWN";
          if (!rawContent) {
            const emptyReason = `Empty response text from ${modelName} (finishReason=${finishReason})`;
            lastErrorCode = "EMPTY_RESPONSE";
            lastErrorCategory = "gemini_response_error";
            lastGeminiErrorCode = `EMPTY_RESPONSE (${finishReason})`;
            lastErrorDetail = emptyReason;
            if (pass === 1) transientRetryCandidates.add(modelName);
            attempts.push({
              model: modelName,
              attempt: attemptNum,
              timeoutMs: perModelTimeoutMs,
              startedAt: attemptStartedAt,
              durationMs: attemptDurationMs,
              httpStatus: response.status,
              upstreamStatus: null,
              errorCode: lastErrorCode,
              finishReason,
              outcome: "empty_response",
              detail: emptyReason,
            });
            console.warn(
              `[Gemini OCR] Gemini error response | requestId=${requestId} | model=${modelName} | attempt=${attemptNum} | code=EMPTY_RESPONSE | finishReason=${finishReason}`
            );
            if (nextModelName) {
              console.warn(
                `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | fromModel=${modelName} | toModel=${nextModelName} | reason="${emptyReason}"`
              );
            }
            emitProgress({
              type: "attempt_failed",
              pass,
              model: modelName,
              attemptIndex: mIdx + 1,
              totalModels: passModels.length,
              globalAttempt: globalAttemptCounter,
              httpStatus: response.status,
              errorCode: lastErrorCode,
            });
            continue;
          }

          let parsedData: any;
          try {
            const cleaned = rawContent
              .replace(/^```json\s*/i, "")
              .replace(/^```\s*/i, "")
              .replace(/\s*```$/, "")
              .trim();
            parsedData = JSON.parse(cleaned);
          } catch {
            const firstBrace = rawContent.indexOf("{");
            const lastBrace = rawContent.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              try {
                parsedData = JSON.parse(rawContent.slice(firstBrace, lastBrace + 1));
              } catch {
                parsedData = null;
              }
            }
            if (!parsedData) {
              const parseReason = `Invalid JSON returned by ${modelName} (finishReason=${finishReason}, len=${rawContent.length})`;
              lastErrorCode = "PARSE_ERROR";
              lastErrorCategory = "parsing_error";
              lastGeminiErrorCode = `PARSE_ERROR (${finishReason})`;
              lastErrorDetail = parseReason;
              if (pass === 1) transientRetryCandidates.add(modelName);
              attempts.push({
                model: modelName,
                attempt: attemptNum,
                timeoutMs: perModelTimeoutMs,
                startedAt: attemptStartedAt,
                durationMs: attemptDurationMs,
                httpStatus: response.status,
                upstreamStatus: null,
                errorCode: lastErrorCode,
                finishReason,
                outcome: "parse_error",
                detail: parseReason,
              });
              console.warn(
                `[Gemini OCR] Gemini error response | requestId=${requestId} | model=${modelName} | attempt=${attemptNum} | code=PARSE_ERROR | finishReason=${finishReason} | preview=${rawContent.slice(0, 300)}`
              );
              if (nextModelName) {
                console.warn(
                  `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | fromModel=${modelName} | toModel=${nextModelName} | reason="${parseReason}"`
                );
              }
              emitProgress({
                type: "attempt_failed",
                pass,
                model: modelName,
                attemptIndex: mIdx + 1,
                totalModels: passModels.length,
                globalAttempt: globalAttemptCounter,
                httpStatus: response.status,
                errorCode: lastErrorCode,
              });
              continue;
            }
          }

          const normalizedItems: GeminiReceiptItem[] = Array.isArray(parsedData?.items)
            ? parsedData.items
                .map((it: any) => {
                  const rawPrice = parseFloat(parseGeminiNum(it?.price).toFixed(2));
                  const rawOrig = parseFloat(parseGeminiNum(it?.originalPrice).toFixed(2));
                  const rawDisc = parseFloat(Math.abs(parseGeminiNum(it?.discount)).toFixed(2));
                  const rawFinal = parseFloat(parseGeminiNum(it?.finalPrice).toFixed(2));
                  const discLabel =
                    typeof it?.discountLabel === "string" && it.discountLabel.trim()
                      ? it.discountLabel.trim()
                      : undefined;

                  const hasDiscount = rawDisc > 0 && (rawOrig > rawDisc || rawPrice > 0);
                  const originalPrice = hasDiscount
                    ? rawOrig > 0
                      ? rawOrig
                      : parseFloat(((rawFinal || rawPrice) + rawDisc).toFixed(2))
                    : undefined;
                  const finalPrice = hasDiscount
                    ? rawFinal > 0
                      ? rawFinal
                      : originalPrice !== undefined
                      ? parseFloat(Math.max(0, originalPrice - rawDisc).toFixed(2))
                      : rawPrice
                    : undefined;
                  const effectivePrice =
                    finalPrice !== undefined
                      ? finalPrice
                      : rawPrice > 0
                      ? rawPrice
                      : rawOrig;

                  const rawUnitPrice = parseFloat(parseGeminiNum(it?.unitPrice).toFixed(3));
                  const item: GeminiReceiptItem = {
                    name: typeof it?.name === "string" ? it.name.trim() : "",
                    price: parseFloat((effectivePrice || 0).toFixed(2)),
                    quantity: Math.max(
                      1,
                      Math.round(parseGeminiNum(it?.quantity) || 1)
                    ),
                    ...(rawUnitPrice > 0 ? { unitPrice: rawUnitPrice } : {}),
                  };
                  if (hasDiscount && originalPrice !== undefined && finalPrice !== undefined) {
                    item.originalPrice = originalPrice;
                    item.discount = rawDisc;
                    item.finalPrice = finalPrice;
                    if (discLabel) item.discountLabel = discLabel;
                  }
                  return item;
                })
                .filter((it: GeminiReceiptItem) => it.name.length > 0 && it.price >= 0 && (it.price > 0 || (it.originalPrice ?? 0) > 0))
            : [];

          const normalizedQuantityLines: string[] = Array.isArray(parsedData?.quantityLines)
            ? parsedData.quantityLines
                .map((q: unknown) => (typeof q === "string" ? q.trim() : ""))
                .filter((q: string) => q.length > 0)
            : [];

          const normalizedData: GeminiReceiptData = {
            merchantName:
              typeof parsedData?.merchantName === "string"
                ? parsedData.merchantName.trim()
                : "",
            address:
              typeof parsedData?.address === "string"
                ? parsedData.address.trim()
                : "",
            date:
              typeof parsedData?.date === "string" ? parsedData.date.trim() : "",
            totalAmount: parseFloat(parseGeminiNum(parsedData?.totalAmount).toFixed(2)),
            expectedItemsCount:
              typeof parsedData?.expectedItemsCount === "number" &&
              Number.isFinite(parsedData.expectedItemsCount)
                ? Math.round(parsedData.expectedItemsCount)
                : null,
            currency:
              typeof parsedData?.currency === "string" && parsedData.currency.trim()
                ? parsedData.currency.trim()
                : "€",
            suggestedCategory:
              typeof parsedData?.suggestedCategory === "string"
                ? parsedData.suggestedCategory.trim()
                : "",
            items: normalizedItems,
            ...(normalizedQuantityLines.length > 0
              ? { quantityLines: normalizedQuantityLines }
              : {}),
            notesFormatted:
              typeof parsedData?.notesFormatted === "string"
                ? parsedData.notesFormatted.trim()
                : "",
          };

          const totalDurationMs = Date.now() - reqStart;
          const completedAttemptDurationMs = Date.now() - attemptStart;
          attempts.push({
            model: modelName,
            attempt: attemptNum,
            timeoutMs: perModelTimeoutMs,
            startedAt: attemptStartedAt,
            durationMs: completedAttemptDurationMs,
            httpStatus: response.status,
            upstreamStatus: null,
            errorCode: null,
            finishReason,
            outcome: "success",
            detail: `Extracted ${normalizedItems.length} items, total=${normalizedData.totalAmount}`,
          });

          console.log(
            `[Gemini OCR] Gemini request completed | requestId=${requestId} | pass=${pass} | model=${modelName} | attempt=${attemptNum} | status=${response.status} | durationMs=${totalDurationMs} | finishReason=${finishReason} | merchant="${normalizedData.merchantName}" | address="${normalizedData.address || ""}" | date="${normalizedData.date}" | total=${normalizedData.totalAmount} | items=${normalizedItems.length} | category="${normalizedData.suggestedCategory}"`
          );

          emitProgress({
            type: "complete",
            pass,
            model: modelName,
            attemptIndex: mIdx + 1,
            totalModels: passModels.length,
            globalAttempt: globalAttemptCounter,
            httpStatus: response.status,
            errorCode: null,
          });

          return {
            status: 200,
            body: {
              success: true,
              modelUsed: modelName,
              httpStatus: response.status,
              durationMs: totalDurationMs,
              diagnostics: {
                requestId,
                startedAt: startedAtIso,
                totalDurationMs,
                modelsConfigured: modelsToTry,
                attempts,
              },
              data: normalizedData,
            },
          };
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          input.abortSignal?.removeEventListener("abort", onParentAbort);
          if (input.abortSignal?.aborted && !didTimeoutAbort) {
            break;
          }
          const attemptDurationMs = Date.now() - attemptStart;
          const isAbort = didTimeoutAbort || fetchErr?.name === "AbortError";
          lastErrorCode = isAbort ? "GEMINI_TIMEOUT" : "NETWORK_ERROR";
          lastErrorCategory = isAbort ? "timeout" : "network_error";
          lastGeminiErrorCode = lastErrorCode;
          lastTimeoutReason = isAbort
            ? `Server-side Gemini fetch timed out after ${perModelTimeoutMs}ms (model=${modelName}, attempt=${attemptNum})`
            : null;
          lastErrorDetail = isAbort
            ? `Gemini timeout after ${perModelTimeoutMs}ms (model=${modelName})`
            : fetchErr?.message || String(fetchErr);
          if (pass === 1) transientRetryCandidates.add(modelName);

          attempts.push({
            model: modelName,
            attempt: attemptNum,
            timeoutMs: perModelTimeoutMs,
            startedAt: attemptStartedAt,
            durationMs: attemptDurationMs,
            httpStatus: lastHttpStatus,
            upstreamStatus: null,
            errorCode: lastErrorCode,
            finishReason: null,
            outcome: isAbort ? "timeout" : "network_error",
            detail: lastErrorDetail,
          });

          if (isAbort) {
            console.warn(
              `[Gemini OCR] Gemini timeout | requestId=${requestId} | model=${modelName} | attempt=${attemptNum} | timeoutMs=${perModelTimeoutMs} | elapsedMs=${Date.now() - reqStart}`
            );
          } else {
            console.warn(
              `[Gemini OCR] Gemini error response | requestId=${requestId} | model=${modelName} | attempt=${attemptNum} | code=${lastErrorCode} | detail=${lastErrorDetail}`
            );
          }

          if (nextModelName) {
            console.warn(
              `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | fromModel=${modelName} | toModel=${nextModelName} | reason="${lastErrorDetail}"`
            );
          }
          emitProgress({
            type: "attempt_failed",
            pass,
            model: modelName,
            attemptIndex: mIdx + 1,
            totalModels: passModels.length,
            globalAttempt: globalAttemptCounter,
            httpStatus: lastHttpStatus,
            errorCode: lastErrorCode,
          });
          continue;
        }
      }
    }

    // All configured Gemini models failed — aggregate across ALL attempts without letting a secondary 404 mask primary 503/429/timeout failures.
    const perModelSummary = modelsToTry
      .map((m) => {
        const mAttempts = attempts.filter((a) => a.model === m);
        if (mAttempts.length === 0) return `${m}: skipped (budget)`;
        const codes = mAttempts.map((a) =>
          a.httpStatus ? `HTTP ${a.httpStatus}${a.upstreamStatus ? ` ${a.upstreamStatus}` : ""}` : a.errorCode || a.outcome
        );
        const uniqueCodes = Array.from(new Set(codes));
        const formatted =
          uniqueCodes.length === 1 && codes.length > 1
            ? `${uniqueCodes[0]} (x${codes.length})`
            : codes.join(" -> ");
        return `${m}: ${formatted}`;
      })
      .join(" | ");

    const non404Attempts = attempts.filter(
      (a) => a.httpStatus !== 404 && a.errorCode !== "MODEL_NOT_FOUND_404"
    );
    const preferredAttempts = non404Attempts.length > 0 ? non404Attempts : attempts;
    const representativeAttempt =
      preferredAttempts.find((a) => a.errorCode === "RATE_LIMITED_429" || a.httpStatus === 429) ||
      preferredAttempts.find((a) => a.outcome === "timeout" || a.errorCode === "GEMINI_TIMEOUT") ||
      preferredAttempts.find((a) => a.httpStatus === 503 || a.httpStatus === 500 || a.httpStatus === 502) ||
      preferredAttempts[0];

    let summaryErrorCode = lastErrorCode;
    let summaryErrorCategory: GeminiFailureCategory = lastErrorCategory;
    let summaryHttpStatus = lastHttpStatus;
    let summaryGeminiCode = lastGeminiErrorCode || lastErrorCode;
    let summaryModelAttempted = lastModelAttempted;
    let summaryTimeoutReason = lastTimeoutReason;

    if (representativeAttempt) {
      summaryModelAttempted = representativeAttempt.model;
      summaryHttpStatus = representativeAttempt.httpStatus;
      summaryErrorCode = representativeAttempt.errorCode || lastErrorCode;
      summaryGeminiCode = representativeAttempt.upstreamStatus
        ? `${summaryErrorCode} (${representativeAttempt.upstreamStatus})`
        : summaryErrorCode;

      if (representativeAttempt.outcome === "timeout" || summaryErrorCode === "GEMINI_TIMEOUT") {
        summaryErrorCategory = "timeout";
        summaryTimeoutReason = representativeAttempt.detail;
      } else if (summaryErrorCode === "RATE_LIMITED_429" || representativeAttempt.httpStatus === 429) {
        summaryErrorCategory = "quota_limit";
      } else if (representativeAttempt.outcome === "network_error") {
        summaryErrorCategory = "network_error";
      } else if (representativeAttempt.outcome === "parse_error") {
        summaryErrorCategory = "parsing_error";
      } else if (
        summaryErrorCode === "AUTH_OR_REQUEST_401" ||
        summaryErrorCode === "AUTH_OR_REQUEST_403"
      ) {
        summaryErrorCategory = "configuration_error";
      } else {
        summaryErrorCategory = "gemini_response_error";
      }
    }

    const exhaustedReason = `All ${modelsToTry.length} AI models failed -> ${perModelSummary}`;
    console.warn(
      `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=${summaryErrorCategory} | errorCode=${summaryErrorCode} | reason="${exhaustedReason}"`
    );
    const quotaDiagnostics: GeminiQuotaViolationDiagnostic[] = attempts
      .filter((a) => a.httpStatus === 429 || a.quotaMetric || a.quotaId)
      .map((a) => ({
        model: a.model,
        quotaMetric: a.quotaMetric ?? null,
        quotaId: a.quotaId ?? null,
        quotaValue: a.quotaValue ?? null,
        retryDelay: a.retryDelay ?? null,
        message: a.detail,
      }));

    return {
      status: 200,
      body: {
        success: false,
        error: summaryErrorCode,
        errorCode: summaryErrorCode,
        errorCategory: summaryErrorCategory,
        workerErrorCode: null,
        geminiErrorCode: summaryGeminiCode,
        timeoutReason: summaryTimeoutReason,
        failingStage:
          summaryErrorCode === "GEMINI_TIMEOUT" || summaryErrorCode === "NETWORK_ERROR"
            ? "GEMINI_REQUEST"
            : summaryErrorCode === "PARSE_ERROR"
            ? "JSON_PARSE"
            : "GEMINI_RESPONSE",
        httpStatus: summaryHttpStatus,
        modelAttempted: summaryModelAttempted,
        fallbackReason: exhaustedReason,
        message: `All configured Gemini models failed (${summaryGeminiCode}). Using local OCR.`,
        diagnostics: {
          requestId,
          startedAt: startedAtIso,
          totalDurationMs: Date.now() - reqStart,
          modelsConfigured: modelsToTry,
          errorCategory: summaryErrorCategory,
          fallbackTriggerReason: exhaustedReason,
          ...(quotaDiagnostics.length > 0 ? { quotaDiagnostics } : {}),
          attempts,
        },
      },
    };
  } catch (err: any) {
    const unexpectedReason = err?.message || "Unexpected server error";
    console.warn(
      `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=gemini_response_error | errorCode=SERVER_ERROR | reason="${unexpectedReason}"`
    );
    return {
      status: 200,
      body: {
        success: false,
        error: "SERVER_ERROR",
        errorCode: "SERVER_ERROR",
        errorCategory: "gemini_response_error",
        workerErrorCode: "SERVER_ERROR",
        geminiErrorCode: "NOT_REACHED",
        timeoutReason: null,
        failingStage: "GEMINI_REQUEST",
        httpStatus: 500,
        modelAttempted: null,
        fallbackReason: unexpectedReason,
        message: "Gemini analysis timed out or failed. Using local OCR.",
        diagnostics: {
          requestId,
          startedAt: startedAtIso,
          totalDurationMs: Date.now() - reqStart,
          modelsConfigured: modelsToTry,
          errorCategory: "gemini_response_error",
          fallbackTriggerReason: unexpectedReason,
          attempts,
        },
      },
    };
  }
}
