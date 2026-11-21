export const GEMINI_RECEIPT_MODELS = [
  "gemini-4-hydrogen",
  "gemini-3.1-flash-lite",
] as const;

const MODEL_TIMEOUT_MS: Record<string, number> = {
  "gemini-4-hydrogen": 45000,
  "gemini-3.1-flash-lite": 30000,
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GeminiReceiptItem {
  name: string;
  price: number;
  quantity: number;
  originalPrice?: number;
  discount?: number;
  finalPrice?: number;
  discountLabel?: string;
}

export interface GeminiReceiptData {
  merchantName: string;
  date: string;
  totalAmount: number;
  expectedItemsCount: number | null;
  currency: string;
  suggestedCategory: string;
  items: GeminiReceiptItem[];
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
        data: GeminiReceiptData;
      }
    | {
        success: false;
        error: string;
        errorCode: string;
        workerErrorCode?: string | null;
        geminiErrorCode?: string | null;
        timeoutReason?: string | null;
        failingStage?: "WORKER_PARSE" | "GEMINI_REQUEST" | "GEMINI_RESPONSE" | "JSON_PARSE";
        httpStatus: number | null;
        modelAttempted: string | null;
        fallbackReason: string;
        message: string;
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
  "date": "YYYY-MM-DD or empty string if unreadable",
  "totalAmount": 12.34,
  "expectedItemsCount": 17,
  "currency": "€",
  "suggestedCategory": "One of: храна, ресторант, гориво, кино, козметика, аптека, кола, дрехи, фризьор, домашни любимци, почистване, други",
  "items": [
    { "name": "Readable Item Name", "price": 2.04, "quantity": 1, "originalPrice": 3.06, "discount": 1.02, "finalPrice": 2.04, "discountLabel": "Lidl Plus" }
  ],
  "notesFormatted": "2 x Coca Cola - €4.80\\n1 x Снакс с фъстъци - €2.04 (ориг. €3.06, -€1.02 Lidl Plus)"
}
Important rules for Bulgarian & international receipts (especially long 15-30 item supermarket receipts):
- "merchantName": Extract the store/restaurant/company name. IGNORE EIK/BULSTAT (ЕИК, БУЛСТАТ), VAT numbers (BG...), fiscal device IDs (ФУ, ФП, УНП, КАСА), and street addresses (гр., ул., бул.).
- "date": Extract ONLY the transaction date printed on the receipt (e.g. 14.11.2026, 14/11/2026, 14-11-2026, 2026-11-14) and format strictly as YYYY-MM-DD. NEVER guess or substitute today's date if no date is visible — return "" when unreadable. Ignore receipt/fiscal numbers.
- "totalAmount": MUST be the final amount paid in the receipt's primary currency (ОБЩО, ОБЩА СУМА, КРАЙНА СУМА, ЗА ПЛАЩАНЕ, СУМА ЗА ПЛАЩАНЕ, TOTAL, GRAND TOTAL). NEVER pick VAT (ДДС), discount (ОТСТЪПКА), subtotal (МЕЖДИННА СУМА), or change (РЕСТО).
- "expectedItemsCount": Integer count if printed on receipt (e.g. "17 АРТИКУЛА", "ITEMS SOLD: 17"), otherwise null.
- "currency": Bulgaria uses the Euro (€, EUR). Always return "€" for Bulgarian receipts (including dual-display receipts), or "$" / "£" only if explicitly printed in USD or GBP. Never return "лв." or "BGN", and never convert prices — extract the exact EUR printed values.
- "items": CRITICAL — Do NOT truncate, sample, or skip any purchased items. Extract EVERY single item line from top to bottom until Subtotal/Total/VAT/Payment! On a 17-item receipt, return all 17 items so the sum of item "price" matches totalAmount. Fix garbled Cyrillic/Latin OCR letters using the receipt image and raw OCR text (e.g. ПРЯСНО МЛЯКО, ХЛЯБ БЯЛ, СИРЕНЕ, ДОМАТИ), merge multi-line wrapped product names into one readable item name, extract exact integer quantity ("quantity": 2 for "2 x Coca Cola", "2 x 2.40  4.80", or when "2 x 1.20" appears right above/below "ПРЯСНО МЛЯКО 2.40"; default 1) and the final line price ("price").
  * DISCOUNTS (e.g. Lidl "#Lidl Plus промоция" / "ОТСТЪПКИ 1,02-" / "-1.02" / "ОТСТЪПКА"): NEVER output a discount line as a standalone item! Instead, attach it directly to the PRECEDING item: set "originalPrice" to the item's printed pre-discount price (e.g. 3.06), "discount" to the positive discount amount (e.g. 1.02), "finalPrice" and "price" BOTH to originalPrice - discount (e.g. 2.04), and "discountLabel" (e.g. "Lidl Plus" or "Отстъпка"). If an item has no discount, omit discount fields or leave discount=0.
  * Strip trailing tax group letters (А, Б, В, Г, A, B, C, D). NEVER include ДДС/VAT, В БРОЙ, КАРТА, РЕСТО, or ОБЩО rows as items.
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
      `[Gemini OCR] Request received | apiKeyPresent=${Boolean(apiKey)} | hasImage=${Boolean(cleanBase64)} | imageBase64Chars=${cleanBase64.length} | ocrTextChars=${ocrTextStr.length}`
    );

    if (!apiKey) {
      const fallbackReason =
        "Invalid or missing API key (GEMINI_API_KEY not configured on server)";
      console.warn(
        `[Gemini OCR] Fallback -> errorCode=NO_API_KEY | reason="${fallbackReason}"`
      );
      return {
        status: 200,
        body: {
          success: false,
          error: "NO_API_KEY",
          errorCode: "NO_API_KEY",
          workerErrorCode: "MISSING_GEMINI_API_KEY",
          geminiErrorCode: "NO_API_KEY",
          timeoutReason: null,
          httpStatus: null,
          modelAttempted: null,
          fallbackReason,
          message: "Gemini API key is not configured. Falling back to local OCR.",
        },
      };
    }

    if (!cleanBase64 && !ocrTextStr) {
      return {
        status: 400,
        body: {
          success: false,
          error: "MISSING_DATA",
          errorCode: "MISSING_DATA",
          workerErrorCode: "MISSING_REQUEST_DATA",
          geminiErrorCode: "NOT_REACHED",
          timeoutReason: null,
          httpStatus: 400,
          modelAttempted: null,
          fallbackReason: "No image or OCR text provided",
          message: "No image or OCR text provided.",
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
    let lastGeminiErrorCode: string | null = null;
    let lastTimeoutReason: string | null = null;
    let lastErrorDetail = "";
    let lastModelAttempted: string = GEMINI_RECEIPT_MODELS[0];

    for (let mIdx = 0; mIdx < GEMINI_RECEIPT_MODELS.length; mIdx++) {
      const modelName = GEMINI_RECEIPT_MODELS[mIdx];
      const hasFallbackModel = mIdx < GEMINI_RECEIPT_MODELS.length - 1;
      lastModelAttempted = modelName;
      const perModelTimeoutMs = MODEL_TIMEOUT_MS[modelName] ?? 35000;
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
        const hasRetryOnSameModel = attempt < maxAttemptsForModel - 1;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), perModelTimeoutMs);

        try {
          console.log(
            `[Gemini OCR] Gemini request started | model=${modelName} | attempt=${attempt + 1}/${maxAttemptsForModel} | timeoutMs=${perModelTimeoutMs}`
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
          const elapsed = Date.now() - reqStart;
          console.log(
            `[Gemini OCR] Gemini response received | model=${modelName} | attempt=${attempt + 1} | status=${response.status} | durationMs=${elapsed}`
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
            lastTimeoutReason =
              response.status === 504 || upstreamStatus === "DEADLINE_EXCEEDED"
                ? `Gemini API returned HTTP ${response.status} (${upstreamStatus || "DEADLINE_EXCEEDED"})`
                : null;

            if (response.status === 404) {
              lastErrorCode = "MODEL_NOT_FOUND_404";
              lastGeminiErrorCode = upstreamStatus || "MODEL_NOT_FOUND_404";
              console.warn(
                `[Gemini OCR] Model ${modelName} returned 404, checking next fallback model:`,
                lastErrorDetail
              );
              break; // move immediately to fallback model
            }

            const isNonRetryableAuthOrPayload =
              response.status === 400 || response.status === 401 || response.status === 403;

            if (response.status === 429) {
              lastErrorCode = "RATE_LIMITED_429";
            } else if (isNonRetryableAuthOrPayload) {
              lastErrorCode = `AUTH_OR_REQUEST_${response.status}`;
            } else {
              lastErrorCode = `HTTP_${response.status}`;
            }
            lastGeminiErrorCode = upstreamStatus
              ? `${lastErrorCode} (${upstreamStatus})`
              : lastErrorCode;

            console.warn(
              `[Gemini OCR] API error <- model=${modelName} | attempt=${attempt + 1} | code=${lastErrorCode} | geminiStatus=${upstreamStatus || "none"} | body=${lastErrorDetail}`
            );

            if (isNonRetryableAuthOrPayload) {
              return {
                status: 200,
                body: {
                  success: false,
                  error: lastErrorCode,
                  errorCode: lastErrorCode,
                  workerErrorCode: null,
                  geminiErrorCode: lastGeminiErrorCode,
                  timeoutReason: lastTimeoutReason,
                  failingStage: "GEMINI_RESPONSE",
                  httpStatus: response.status,
                  modelAttempted: modelName,
                  fallbackReason: `Gemini rejected request (HTTP ${response.status}${upstreamStatus ? ` / ${upstreamStatus}` : ""}): ${lastErrorDetail || "Invalid API key or request payload"}`,
                  message: `Gemini returned status ${response.status} (${lastGeminiErrorCode}). Using local OCR.`,
                },
              };
            }

            // Retryable HTTP error (429 or 5xx): retry on same model with backoff, then try fallback model
            if (hasRetryOnSameModel) {
              const backoffMs = response.status === 429 ? 1600 : 1200;
              await sleepMs(backoffMs);
              continue;
            }
            if (hasFallbackModel) {
              break; // try next model
            }
            return {
              status: 200,
              body: {
                success: false,
                error: lastErrorCode,
                errorCode: lastErrorCode,
                workerErrorCode: null,
                geminiErrorCode: lastGeminiErrorCode,
                timeoutReason: lastTimeoutReason,
                failingStage: "GEMINI_RESPONSE",
                httpStatus: response.status,
                modelAttempted: modelName,
                fallbackReason: `Gemini API HTTP ${response.status}${upstreamStatus ? ` (${upstreamStatus})` : ""}: ${lastErrorDetail || "Unknown error"}`,
                message: `Gemini returned status ${response.status} (${lastGeminiErrorCode}). Using local OCR.`,
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
            console.warn(
              `[Gemini OCR] Empty response -> model=${modelName} | attempt=${attempt + 1} | reason="${emptyReason}"`
            );
            lastErrorCode = "EMPTY_RESPONSE";
            lastGeminiErrorCode = `EMPTY_RESPONSE (${finishReason})`;
            lastErrorDetail = emptyReason;
            if (hasRetryOnSameModel) {
              await sleepMs(700);
              continue;
            }
            if (hasFallbackModel) break;
            return {
              status: 200,
              body: {
                success: false,
                error: "EMPTY_RESPONSE",
                errorCode: "EMPTY_RESPONSE",
                workerErrorCode: null,
                geminiErrorCode: lastGeminiErrorCode,
                timeoutReason: null,
                failingStage: "GEMINI_RESPONSE",
                httpStatus: response.status,
                modelAttempted: modelName,
                fallbackReason: emptyReason,
                message: "No content returned from Gemini. Using local OCR.",
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
              console.warn(
                `[Gemini OCR] Failed to parse JSON (attempt ${attempt + 1}):`,
                rawContent.slice(0, 300)
              );
              lastErrorCode = "PARSE_ERROR";
              lastGeminiErrorCode = `PARSE_ERROR (${finishReason})`;
              lastErrorDetail = parseReason;
              if (hasRetryOnSameModel) {
                await sleepMs(700);
                continue;
              }
              if (hasFallbackModel) break;
              return {
                status: 200,
                body: {
                  success: false,
                  error: "PARSE_ERROR",
                  errorCode: "PARSE_ERROR",
                  workerErrorCode: null,
                  geminiErrorCode: lastGeminiErrorCode,
                  timeoutReason: null,
                  failingStage: "JSON_PARSE",
                  httpStatus: response.status,
                  modelAttempted: modelName,
                  fallbackReason: parseReason,
                  message: "Failed to parse Gemini response. Using local OCR.",
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

                  const item: GeminiReceiptItem = {
                    name: typeof it?.name === "string" ? it.name.trim() : "",
                    price: parseFloat((effectivePrice || 0).toFixed(2)),
                    quantity: Math.max(
                      1,
                      Math.round(parseGeminiNum(it?.quantity) || 1)
                    ),
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

          const normalizedData: GeminiReceiptData = {
            merchantName:
              typeof parsedData?.merchantName === "string"
                ? parsedData.merchantName.trim()
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
            notesFormatted:
              typeof parsedData?.notesFormatted === "string"
                ? parsedData.notesFormatted.trim()
                : "",
          };

          console.log(
            `[Gemini OCR] Gemini parsing completed | model=${modelName} | attempt=${attempt + 1} | durationMs=${Date.now() - reqStart} | merchant="${normalizedData.merchantName}" | date="${normalizedData.date}" | total=${normalizedData.totalAmount} | items=${normalizedItems.length} | category="${normalizedData.suggestedCategory}"`
          );

          return {
            status: 200,
            body: {
              success: true,
              modelUsed: modelName,
              httpStatus: response.status,
              durationMs: Date.now() - reqStart,
              data: normalizedData,
            },
          };
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          const isAbort = fetchErr?.name === "AbortError";
          lastErrorCode = isAbort ? "GEMINI_TIMEOUT" : "NETWORK_ERROR";
          lastGeminiErrorCode = lastErrorCode;
          lastTimeoutReason = isAbort
            ? `Server-side Gemini fetch timed out after ${perModelTimeoutMs}ms (model=${modelName})`
            : null;
          lastErrorDetail = isAbort
            ? `Gemini timeout after ${perModelTimeoutMs}ms (model=${modelName})`
            : fetchErr?.message || String(fetchErr);
          console.warn(
            `[Gemini OCR] Request exception <- model=${modelName} | attempt=${attempt + 1} | code=${lastErrorCode} | detail=${lastErrorDetail}`
          );

          // On non-timeout transient network error, retry once on same model after brief backoff
          if (!isAbort && hasRetryOnSameModel) {
            await sleepMs(1000);
            continue;
          }
          // Otherwise break to try fallback model (or finish if no fallback model left)
          if (hasFallbackModel) {
            break;
          }
          return {
            status: 200,
            body: {
              success: false,
              error: lastErrorCode,
              errorCode: lastErrorCode,
              workerErrorCode: isAbort ? null : "UPSTREAM_FETCH_ERROR",
              geminiErrorCode: lastGeminiErrorCode,
              timeoutReason: lastTimeoutReason,
              failingStage: "GEMINI_REQUEST",
              httpStatus: lastHttpStatus,
              modelAttempted: modelName,
              fallbackReason: isAbort
                ? lastTimeoutReason || "Gemini timeout"
                : `${lastErrorCode}: ${lastErrorDetail}`,
              message: "Gemini analysis timed out or failed. Using local OCR.",
            },
          };
        }
      }
    }

    const exhaustedReason = `All Gemini models failed (last=${lastModelAttempted}, status=${lastHttpStatus ?? "none"}): ${lastErrorDetail}`;
    console.warn(
      `[Gemini OCR] Fallback -> errorCode=${lastErrorCode} | reason="${exhaustedReason}"`
    );
    return {
      status: 200,
      body: {
        success: false,
        error: lastErrorCode,
        errorCode: lastErrorCode,
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
      },
    };
  } catch (err: any) {
    console.warn(
      "[Gemini OCR] Unexpected server failure:",
      err?.message || err
    );
    return {
      status: 200,
      body: {
        success: false,
        error: "SERVER_ERROR",
        errorCode: "SERVER_ERROR",
        workerErrorCode: "SERVER_ERROR",
        geminiErrorCode: "NOT_REACHED",
        timeoutReason: null,
        failingStage: "GEMINI_REQUEST",
        httpStatus: 500,
        modelAttempted: null,
        fallbackReason: err?.message || "Unexpected server error",
        message: "Gemini analysis timed out or failed. Using local OCR.",
      },
    };
  }
}
