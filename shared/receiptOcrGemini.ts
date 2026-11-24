export const GEMINI_RECEIPT_MODELS = [
  "gemini-4-hydrogen",
  "gemini-3.1-flash-lite",
] as const;

const MODEL_TIMEOUT_MS: Record<string, number> = {
  "gemini-4-hydrogen": 60000,
  "gemini-3.1-flash-lite": 45000,
};

const SERVER_TOTAL_BUDGET_MS = 135000;

export type GeminiFailureCategory =
  | "timeout"
  | "quota_limit"
  | "network_error"
  | "gemini_response_error"
  | "parsing_error"
  | "configuration_error"
  | "client_error";

export interface GeminiAttemptDiagnostic {
  model: string;
  attempt: number;
  timeoutMs: number;
  startedAt: string;
  durationMs: number;
  httpStatus: number | null;
  upstreamStatus: string | null;
  errorCode: string | null;
  finishReason: string | null;
  outcome: "success" | "timeout" | "http_error" | "empty_response" | "parse_error" | "network_error";
  detail: string;
}

export interface GeminiDiagnosticsSummary {
  requestId: string;
  startedAt: string;
  totalDurationMs: number;
  errorCategory?: GeminiFailureCategory;
  fallbackTriggerReason?: string | null;
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
  imageBase64?: unknown;
  mimeType?: unknown;
  ocrText?: unknown;
}): Promise<GeminiReceiptAnalysisResponse> {
  const reqStart = Date.now();
  const startedAtIso = new Date(reqStart).toISOString();
  const requestId = createRequestId();
  const attempts: GeminiAttemptDiagnostic[] = [];

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
      `[Gemini OCR] Gemini request start | requestId=${requestId} | apiKeyPresent=${Boolean(apiKey)} | hasImage=${Boolean(cleanBase64)} | imageBase64Chars=${cleanBase64.length} | ocrTextChars=${ocrTextStr.length}`
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
    let lastModelAttempted: string = GEMINI_RECEIPT_MODELS[0];

    for (let mIdx = 0; mIdx < GEMINI_RECEIPT_MODELS.length; mIdx++) {
      const modelName = GEMINI_RECEIPT_MODELS[mIdx];
      const hasFallbackModel = mIdx < GEMINI_RECEIPT_MODELS.length - 1;
      lastModelAttempted = modelName;
      const baseModelTimeoutMs = MODEL_TIMEOUT_MS[modelName] ?? 45000;
      const maxAttemptsForModel = 2;

      const generationConfig: Record<string, any> =
        modelName === "gemini-4-hydrogen"
          ? {
              responseMimeType: "application/json",
              thinkingConfig: { thinkingLevel: "LOW" },
            }
          : {
              responseMimeType: "application/json",
            };

      for (let attempt = 0; attempt < maxAttemptsForModel; attempt++) {
        const remainingServerBudgetMs = SERVER_TOTAL_BUDGET_MS - (Date.now() - reqStart);
        if (remainingServerBudgetMs < 5000) {
          console.warn(
            `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=timeout | reason="Server total budget (${SERVER_TOTAL_BUDGET_MS}ms) exhausted before attempt ${attempt + 1} of ${modelName}"`
          );
          break;
        }
        const perModelTimeoutMs = Math.min(baseModelTimeoutMs, Math.max(5000, remainingServerBudgetMs - 1000));
        const hasRetryOnSameModel =
          attempt < maxAttemptsForModel - 1 && remainingServerBudgetMs - perModelTimeoutMs > 10000;
        const attemptStart = Date.now();
        const attemptStartedAt = new Date(attemptStart).toISOString();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), perModelTimeoutMs);

        try {
          console.log(
            `[Gemini OCR] Gemini request start | requestId=${requestId} | model=${modelName} | attempt=${attempt + 1}/${maxAttemptsForModel} | timeoutMs=${perModelTimeoutMs} | remainingBudgetMs=${remainingServerBudgetMs}`
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
          lastHttpStatus = response.status;
          const attemptDurationMs = Date.now() - attemptStart;
          const elapsed = Date.now() - reqStart;
          console.log(
            `[Gemini OCR] Gemini response received | requestId=${requestId} | model=${modelName} | attempt=${attempt + 1} | status=${response.status} | attemptDurationMs=${attemptDurationMs} | totalElapsedMs=${elapsed}`
          );

          if (!response.ok) {
            const errText = await response.text();
            let upstreamStatus: string | null = null;
            let upstreamMessage: string | null = null;
            try {
              const parsedErr = JSON.parse(errText);
              upstreamStatus = parsedErr?.error?.status || null;
              upstreamMessage = parsedErr?.error?.message || null;
            } catch {
              // Raw text fallback
            }
            lastErrorDetail = (upstreamMessage || errText).slice(0, 300);
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
                attempt: attempt + 1,
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
                `[Gemini OCR] Gemini error response | requestId=${requestId} | model=${modelName} | attempt=${attempt + 1} | httpStatus=404 | code=${lastErrorCode} | upstreamStatus=${upstreamStatus || "none"} | detail=${lastErrorDetail}`
              );
              if (hasFallbackModel) {
                console.warn(
                  `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | fromModel=${modelName} | toModel=${GEMINI_RECEIPT_MODELS[mIdx + 1]} | reason="HTTP 404 (${lastErrorDetail})"`
                );
              }
              break; // move immediately to fallback model
            }

            const isAuthError =
              response.status === 401 ||
              response.status === 403 ||
              upstreamStatus === "PERMISSION_DENIED" ||
              upstreamStatus === "UNAUTHENTICATED" ||
              /API_KEY_INVALID|API key not valid/i.test(lastErrorDetail);
            const isNonRetryableAuthOrPayload =
              response.status === 400 || response.status === 401 || response.status === 403;

            if (response.status === 429 || upstreamStatus === "RESOURCE_EXHAUSTED") {
              lastErrorCode = "RATE_LIMITED_429";
              lastErrorCategory = "quota_limit";
            } else if (isUpstreamTimeout) {
              lastErrorCode = `HTTP_${response.status}`;
              lastErrorCategory = "timeout";
            } else if (isAuthError) {
              lastErrorCode = `AUTH_OR_REQUEST_${response.status}`;
              lastErrorCategory = "configuration_error";
            } else if (isNonRetryableAuthOrPayload) {
              lastErrorCode = `AUTH_OR_REQUEST_${response.status}`;
              lastErrorCategory = "gemini_response_error";
            } else {
              lastErrorCode = `HTTP_${response.status}`;
              lastErrorCategory = "gemini_response_error";
            }
            lastGeminiErrorCode = upstreamStatus
              ? `${lastErrorCode} (${upstreamStatus})`
              : lastErrorCode;

            attempts.push({
              model: modelName,
              attempt: attempt + 1,
              timeoutMs: perModelTimeoutMs,
              startedAt: attemptStartedAt,
              durationMs: attemptDurationMs,
              httpStatus: response.status,
              upstreamStatus,
              errorCode: lastErrorCode,
              finishReason: null,
              outcome: isUpstreamTimeout ? "timeout" : "http_error",
              detail: lastErrorDetail,
            });

            console.warn(
              `[Gemini OCR] Gemini error response | requestId=${requestId} | model=${modelName} | attempt=${attempt + 1} | httpStatus=${response.status} | category=${lastErrorCategory} | code=${lastErrorCode} | geminiStatus=${upstreamStatus || "none"} | body=${lastErrorDetail}`
            );

            if (isNonRetryableAuthOrPayload) {
              const reason = `Gemini rejected request (HTTP ${response.status}${upstreamStatus ? ` / ${upstreamStatus}` : ""}): ${lastErrorDetail || "Invalid API key or request payload"}`;
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
                    errorCategory: lastErrorCategory,
                    fallbackTriggerReason: reason,
                    attempts,
                  },
                },
              };
            }

            // Retryable HTTP error (429 or 5xx): retry on same model with backoff, then try fallback model
            if (hasRetryOnSameModel) {
              const backoffMs = response.status === 429 ? 2000 : 1500;
              await sleepMs(backoffMs);
              continue;
            }
            if (hasFallbackModel) {
              console.warn(
                `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | fromModel=${modelName} | toModel=${GEMINI_RECEIPT_MODELS[mIdx + 1]} | reason="HTTP ${response.status} (${lastErrorDetail})"`
              );
              break; // try next model
            }
            const reason = `Gemini API HTTP ${response.status}${upstreamStatus ? ` (${upstreamStatus})` : ""}: ${lastErrorDetail || "Unknown error"}`;
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
                  errorCategory: lastErrorCategory,
                  fallbackTriggerReason: reason,
                  attempts,
                },
              },
            };
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
            attempts.push({
              model: modelName,
              attempt: attempt + 1,
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
              `[Gemini OCR] Gemini error response | requestId=${requestId} | model=${modelName} | attempt=${attempt + 1} | code=EMPTY_RESPONSE | finishReason=${finishReason}`
            );
            if (hasRetryOnSameModel) {
              await sleepMs(700);
              continue;
            }
            if (hasFallbackModel) {
              console.warn(
                `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | fromModel=${modelName} | toModel=${GEMINI_RECEIPT_MODELS[mIdx + 1]} | reason="${emptyReason}"`
              );
              break;
            }
            console.warn(
              `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=${lastErrorCategory} | model=${modelName} | reason="${emptyReason}"`
            );
            return {
              status: 200,
              body: {
                success: false,
                error: "EMPTY_RESPONSE",
                errorCode: "EMPTY_RESPONSE",
                errorCategory: "gemini_response_error",
                workerErrorCode: null,
                geminiErrorCode: lastGeminiErrorCode,
                timeoutReason: null,
                failingStage: "GEMINI_RESPONSE",
                httpStatus: response.status,
                modelAttempted: modelName,
                fallbackReason: emptyReason,
                message: "No content returned from Gemini. Using local OCR.",
                diagnostics: {
                  requestId,
                  startedAt: startedAtIso,
                  totalDurationMs: Date.now() - reqStart,
                  errorCategory: "gemini_response_error",
                  fallbackTriggerReason: emptyReason,
                  attempts,
                },
              },
            };
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
              attempts.push({
                model: modelName,
                attempt: attempt + 1,
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
                `[Gemini OCR] Gemini error response | requestId=${requestId} | model=${modelName} | attempt=${attempt + 1} | code=PARSE_ERROR | finishReason=${finishReason} | preview=${rawContent.slice(0, 300)}`
              );
              if (hasRetryOnSameModel) {
                await sleepMs(700);
                continue;
              }
              if (hasFallbackModel) {
                console.warn(
                  `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | fromModel=${modelName} | toModel=${GEMINI_RECEIPT_MODELS[mIdx + 1]} | reason="${parseReason}"`
                );
                break;
              }
              console.warn(
                `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=${lastErrorCategory} | model=${modelName} | reason="${parseReason}"`
              );
              return {
                status: 200,
                body: {
                  success: false,
                  error: "PARSE_ERROR",
                  errorCode: "PARSE_ERROR",
                  errorCategory: "parsing_error",
                  workerErrorCode: null,
                  geminiErrorCode: lastGeminiErrorCode,
                  timeoutReason: null,
                  failingStage: "JSON_PARSE",
                  httpStatus: response.status,
                  modelAttempted: modelName,
                  fallbackReason: parseReason,
                  message: "Failed to parse Gemini response. Using local OCR.",
                  diagnostics: {
                    requestId,
                    startedAt: startedAtIso,
                    totalDurationMs: Date.now() - reqStart,
                    errorCategory: "parsing_error",
                    fallbackTriggerReason: parseReason,
                    attempts,
                  },
                },
              };
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
            attempt: attempt + 1,
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
            `[Gemini OCR] Gemini request completed | requestId=${requestId} | model=${modelName} | attempt=${attempt + 1} | status=${response.status} | durationMs=${totalDurationMs} | finishReason=${finishReason} | merchant="${normalizedData.merchantName}" | address="${normalizedData.address || ""}" | date="${normalizedData.date}" | total=${normalizedData.totalAmount} | items=${normalizedItems.length} | category="${normalizedData.suggestedCategory}"`
          );

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
                attempts,
              },
              data: normalizedData,
            },
          };
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          const attemptDurationMs = Date.now() - attemptStart;
          const isAbort = fetchErr?.name === "AbortError";
          lastErrorCode = isAbort ? "GEMINI_TIMEOUT" : "NETWORK_ERROR";
          lastErrorCategory = isAbort ? "timeout" : "network_error";
          lastGeminiErrorCode = lastErrorCode;
          lastTimeoutReason = isAbort
            ? `Server-side Gemini fetch timed out after ${perModelTimeoutMs}ms (model=${modelName}, attempt=${attempt + 1})`
            : null;
          lastErrorDetail = isAbort
            ? `Gemini timeout after ${perModelTimeoutMs}ms (model=${modelName})`
            : fetchErr?.message || String(fetchErr);

          attempts.push({
            model: modelName,
            attempt: attempt + 1,
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
              `[Gemini OCR] Gemini timeout | requestId=${requestId} | model=${modelName} | attempt=${attempt + 1} | timeoutMs=${perModelTimeoutMs} | elapsedMs=${Date.now() - reqStart}`
            );
          } else {
            console.warn(
              `[Gemini OCR] Gemini error response | requestId=${requestId} | model=${modelName} | attempt=${attempt + 1} | code=${lastErrorCode} | detail=${lastErrorDetail}`
            );
          }

          // On non-timeout transient network error, retry once on same model after brief backoff
          if (!isAbort && hasRetryOnSameModel) {
            await sleepMs(1000);
            continue;
          }
          // Otherwise break to try fallback model (or finish if no fallback model left)
          if (hasFallbackModel) {
            console.warn(
              `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | fromModel=${modelName} | toModel=${GEMINI_RECEIPT_MODELS[mIdx + 1]} | reason="${lastErrorDetail}"`
            );
            break;
          }
          const finalReason = isAbort
            ? lastTimeoutReason || "Gemini timeout"
            : `${lastErrorCode}: ${lastErrorDetail}`;
          console.warn(
            `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=${lastErrorCategory} | model=${modelName} | reason="${finalReason}"`
          );
          return {
            status: 200,
            body: {
              success: false,
              error: lastErrorCode,
              errorCode: lastErrorCode,
              errorCategory: lastErrorCategory,
              workerErrorCode: isAbort ? null : "UPSTREAM_FETCH_ERROR",
              geminiErrorCode: lastGeminiErrorCode,
              timeoutReason: lastTimeoutReason,
              failingStage: "GEMINI_REQUEST",
              httpStatus: lastHttpStatus,
              modelAttempted: modelName,
              fallbackReason: finalReason,
              message: "Gemini analysis timed out or failed. Using local OCR.",
              diagnostics: {
                requestId,
                startedAt: startedAtIso,
                totalDurationMs: Date.now() - reqStart,
                errorCategory: lastErrorCategory,
                fallbackTriggerReason: finalReason,
                attempts,
              },
            },
          };
        }
      }
    }

    const exhaustedReason = `All Gemini models failed (last=${lastModelAttempted}, status=${lastHttpStatus ?? "none"}): ${lastErrorDetail}`;
    console.warn(
      `[Gemini OCR] Gemini fallback triggered | requestId=${requestId} | category=${lastErrorCategory} | errorCode=${lastErrorCode} | reason="${exhaustedReason}"`
    );
    return {
      status: 200,
      body: {
        success: false,
        error: lastErrorCode,
        errorCode: lastErrorCode,
        errorCategory: lastErrorCategory,
        workerErrorCode: null,
        geminiErrorCode: lastGeminiErrorCode || lastErrorCode,
        timeoutReason: lastTimeoutReason,
        failingStage:
          lastErrorCode === "GEMINI_TIMEOUT" || lastErrorCode === "NETWORK_ERROR"
            ? "GEMINI_REQUEST"
            : lastErrorCode === "PARSE_ERROR"
            ? "JSON_PARSE"
            : "GEMINI_RESPONSE",
        httpStatus: lastHttpStatus,
        modelAttempted: lastModelAttempted,
        fallbackReason: exhaustedReason,
        message: `Gemini returned status ${lastHttpStatus ?? "error"}. Using local OCR.`,
        diagnostics: {
          requestId,
          startedAt: startedAtIso,
          totalDurationMs: Date.now() - reqStart,
          errorCategory: lastErrorCategory,
          fallbackTriggerReason: exhaustedReason,
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
          errorCategory: "gemini_response_error",
          fallbackTriggerReason: unexpectedReason,
          attempts,
        },
      },
    };
  }
}
