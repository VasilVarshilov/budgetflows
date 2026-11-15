import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import fs from "fs";
import path from "path";

function normalizeFirebaseConfig(raw: Record<string, string | undefined>) {
  const candidates = [
    raw.apiKey,
    raw.authDomain,
    raw.projectId,
    raw.storageBucket,
    raw.messagingSenderId,
    raw.appId,
    raw.oAuthClientId,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  const apiKey =
    candidates.find((v) => v.startsWith("AIza")) || raw.apiKey || "";
  const appId =
    candidates.find((v) => /^\d+:\d+:(web|ios|android):[a-zA-Z0-9]+$/.test(v)) ||
    raw.appId ||
    "";
  const authDomainCandidate =
    candidates.find((v) => v.endsWith(".firebaseapp.com") || v.endsWith(".web.app")) ||
    "";
  const storageBucketCandidate =
    candidates.find(
      (v) => v.endsWith(".firebasestorage.app") || v.endsWith(".appspot.com")
    ) || "";
  const messagingSenderId =
    candidates.find((v) => /^\d{6,20}$/.test(v)) || raw.messagingSenderId || "";
  const oAuthClientId =
    candidates.find((v) => v.endsWith(".apps.googleusercontent.com")) ||
    raw.oAuthClientId ||
    "";

  const knownSpecials = new Set(
    [
      apiKey,
      appId,
      authDomainCandidate,
      storageBucketCandidate,
      messagingSenderId,
      oAuthClientId,
    ].filter(Boolean)
  );

  const projectIdFromDomain = authDomainCandidate
    ? authDomainCandidate.replace(/\.(firebaseapp\.com|web\.app)$/, "")
    : "";
  const projectIdFromBucket = storageBucketCandidate
    ? storageBucketCandidate.replace(/\.(firebasestorage\.app|appspot\.com)$/, "")
    : "";

  const projectId =
    candidates.find((v) => !knownSpecials.has(v) && !v.includes(".")) ||
    projectIdFromDomain ||
    projectIdFromBucket ||
    raw.projectId ||
    "";

  const authDomain =
    authDomainCandidate ||
    (raw.authDomain && raw.authDomain.includes(".") ? raw.authDomain : "") ||
    (projectId ? `${projectId}.firebaseapp.com` : "");

  const storageBucket =
    storageBucketCandidate ||
    (raw.storageBucket && raw.storageBucket.includes(".")
      ? raw.storageBucket
      : "") ||
    (projectId ? `${projectId}.firebasestorage.app` : "");

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    oAuthClientId,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Dynamic Firebase config endpoint for client runtime fallback
  app.get("/api/firebase-config", (_req, res) => {
    try {
      // 1. Try environment variables first
      if (process.env.VITE_FIREBASE_API_KEY) {
        return res.json(
          normalizeFirebaseConfig({
            apiKey: process.env.VITE_FIREBASE_API_KEY,
            authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.VITE_FIREBASE_APP_ID,
            oAuthClientId: process.env.VITE_FIREBASE_OAUTH_CLIENT_ID,
          })
        );
      }

      // 2. Fallback to local gitignored config file if present in dev
      const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        return res.json(normalizeFirebaseConfig(parsed));
      }

      return res.status(404).json({ message: "Firebase configuration not found" });
    } catch (e: any) {
      return res.status(500).json({ message: "Failed to load Firebase configuration", error: e?.message });
    }
  });

  // OCR Receipt analysis endpoint using Gemini (gemini-4-hydrogen) with fallback & full diagnostics
  app.post("/api/ocr/receipt", async (req, res) => {
    const reqStart = Date.now();
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      const { imageBase64, mimeType, ocrText } = req.body || {};
      const cleanBase64 = typeof imageBase64 === "string"
        ? imageBase64.replace(/^data:[^;]+;base64,/, "")
        : "";
      const ocrChars = typeof ocrText === "string" ? ocrText.length : 0;

      console.log(
        `[Gemini OCR] Request received | apiKeyPresent=${Boolean(apiKey)} | hasImage=${Boolean(cleanBase64)} | imageBase64Chars=${cleanBase64.length} | ocrTextChars=${ocrChars}`
      );

      if (!apiKey) {
        const fallbackReason = "Missing GEMINI_API_KEY in server environment";
        console.warn(`[Gemini OCR] Fallback -> errorCode=NO_API_KEY | reason="${fallbackReason}"`);
        return res.json({
          success: false,
          error: "NO_API_KEY",
          errorCode: "NO_API_KEY",
          httpStatus: null,
          modelAttempted: null,
          fallbackReason,
          message: "Gemini API key is not configured. Falling back to local OCR.",
        });
      }

      if (!cleanBase64 && !ocrText) {
        return res.status(400).json({
          success: false,
          error: "MISSING_DATA",
          errorCode: "MISSING_DATA",
          httpStatus: 400,
          fallbackReason: "No image or OCR text provided",
          message: "No image or OCR text provided.",
        });
      }

      const parts: any[] = [];
      if (cleanBase64) {
        parts.push({
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: cleanBase64,
          },
        });
      }

      const promptText = `Analyze this receipt (primarily Bulgarian supermarket receipts in Cyrillic/Latin: Lidl, Billa, Kaufland, Fantastico, T Market, Metro, or English receipts). Return ONLY a valid JSON object matching this exact schema:
{
  "merchantName": "Clean Store/Brand Name (e.g. Kaufland, Lidl, Billa, Fantastico, T Market, Metro, OMV, Shell, Happy, Lilly, Sopharmacy)",
  "date": "YYYY-MM-DD or empty string if unreadable",
  "totalAmount": 12.34,
  "expectedItemsCount": 17,
  "currency": "€",
  "suggestedCategory": "One of: храна, ресторант, гориво, кино, козметика, аптека, кола, дрехи, фризьор, домашни любимци, почистване, други",
  "items": [
    { "name": "Readable Item Name", "price": 4.80, "quantity": 2 }
  ],
  "notesFormatted": "2 x Coca Cola - €4.80\\n1 x Хляб бял - €1.20"
}
Important rules for Bulgarian & international receipts (especially long 15-30 item supermarket receipts):
- "merchantName": Extract the store/restaurant/company name. IGNORE EIK/BULSTAT (ЕИК, БУЛСТАТ), VAT numbers (BG...), fiscal device IDs (ФУ, ФП, УНП, КАСА), and street addresses (гр., ул., бул.).
- "date": Extract ONLY the transaction date printed on the receipt (e.g. 14.11.2026, 14/11/2026, 14-11-2026, 2026-11-14) and format strictly as YYYY-MM-DD. NEVER guess or substitute today's date if no date is visible — return "" when unreadable. Ignore receipt/fiscal numbers.
- "totalAmount": MUST be the final amount paid in the receipt's primary currency (ОБЩО, ОБЩА СУМА, КРАЙНА СУМА, ЗА ПЛАЩАНЕ, СУМА ЗА ПЛАЩАНЕ, TOTAL, GRAND TOTAL). NEVER pick VAT (ДДС), discount (ОТСТЪПКА), subtotal (МЕЖДИННА СУМА), or change (РЕСТО).
- "expectedItemsCount": Integer count if printed on receipt (e.g. "17 АРТИКУЛА", "ITEMS SOLD: 17"), otherwise null.
- "currency": Bulgaria uses the Euro (€, EUR). Prefer "€" whenever € or EUR appears (including dual-display receipts). Do NOT assume BGN and NEVER convert currencies — use the exact printed price values. Only return "лв." if the receipt is exclusively in BGN/лв. with no € or EUR values, or "$" / "£" if explicitly shown.
- "items": CRITICAL — Do NOT truncate, sample, or skip any purchased items. Extract EVERY single item line from top to bottom until Subtotal/Total/VAT/Payment! On a 17-item receipt, return all 17 items so the sum of item prices matches totalAmount. Merge multi-line wrapped product names into a single clean item name and expand common Bulgarian abbreviations cleanly where obvious while preserving Cyrillic names (e.g. ХЛЯБ БЯЛ, ПРЯСНО МЛЯКО, СИРЕНЕ). Extract exact quantity as integer ("quantity": 2 for "2 x Coca Cola", "2 x 2.40  4.80", or when "2 x 1.20" appears right above/below "ПРЯСНО МЛЯКО 2.40"; default 1) and the line total price ("price"). Strip trailing tax group letters (А, Б, В, Г, A, B, C, D). NEVER include ДДС/VAT, В БРОЙ, КАРТА, РЕСТО, or ОБЩО rows as items.
- "notesFormatted": Multi-line list, one item per line strictly formatted as "<quantity> x <Item Name> - <currency><price>" (e.g. "2 x Coca Cola - €4.80\\n1 x Хляб бял - €1.20"). Never put all items on a single line.
- "suggestedCategory": Lidl/Kaufland/Billa/Fantastico/T Market/Metro -> "храна"; Shell/OMV/Lukoil/Eko/Rompetrol -> "гориво"; Happy/Raffy/KFC/McDonald's -> "ресторант"; Cinema City/Kino Arena -> "кино"; Lilly/DM -> "козметика"; Sopharmacy/Subra -> "аптека".
- Raw OCR text hint (may contain Cyrillic/Latin OCR artifacts): ${ocrText ? JSON.stringify(ocrText.slice(0, 6000)) : "None"}
- Return ONLY pure JSON, no markdown code blocks.`;

      parts.push({ text: promptText });

      const candidateModels = ["gemini-3.1-flash-lite", "gemini-4-hydrogen"];
      let lastHttpStatus: number | null = null;
      let lastErrorCode = "API_ERROR";
      let lastErrorDetail = "";
      let lastModelAttempted = candidateModels[0];

      for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
        const modelName = candidateModels[mIdx];
        const hasFallbackModel = mIdx < candidateModels.length - 1;
        lastModelAttempted = modelName;
        const perModelTimeoutMs = 14000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), perModelTimeoutMs);

        const generationConfig: Record<string, any> =
          modelName === "gemini-4-hydrogen"
            ? {
                responseMimeType: "application/json",
                thinkingConfig: { thinkingLevel: "LOW" },
              }
            : {
                responseMimeType: "application/json",
                temperature: 0.1,
              };

        try {
          console.log(`[Gemini OCR] Request sent -> model=${modelName} | timeoutMs=${perModelTimeoutMs}`);
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
          console.log(`[Gemini OCR] Response received <- model=${modelName} | status=${response.status} | durationMs=${elapsed}`);

          if (!response.ok) {
            const errText = await response.text();
            lastErrorDetail = errText.slice(0, 300);
            if (response.status === 404) {
              lastErrorCode = "MODEL_NOT_FOUND_404";
              console.warn(`[Gemini OCR] Model ${modelName} returned 404, checking next fallback model:`, lastErrorDetail);
              continue;
            }
            if (response.status === 400 || response.status === 403) {
              lastErrorCode = `AUTH_OR_REQUEST_${response.status}`;
            } else if (response.status === 429) {
              lastErrorCode = "RATE_LIMITED_429";
            } else {
              lastErrorCode = `HTTP_${response.status}`;
            }
            console.warn(`[Gemini OCR] API error <- model=${modelName} | code=${lastErrorCode} | body=${lastErrorDetail}`);
            if (hasFallbackModel && response.status >= 500) {
              continue;
            }
            return res.json({
              success: false,
              error: lastErrorCode,
              errorCode: lastErrorCode,
              httpStatus: response.status,
              modelAttempted: modelName,
              fallbackReason: `Gemini API HTTP ${response.status}: ${lastErrorDetail || "Unknown error"}`,
              message: `Gemini returned status ${response.status} (${lastErrorCode}). Using local OCR.`,
            });
          }

          const result = await response.json();
          const candidateParts: any[] = result.candidates?.[0]?.content?.parts || [];
          const nonThoughtText = candidateParts
            .filter((p) => typeof p?.text === "string" && !p?.thought)
            .map((p) => p.text)
            .join("")
            .trim();
          const rawContent =
            nonThoughtText ||
            (typeof candidateParts[0]?.text === "string" ? candidateParts[0].text : "");
          const finishReason = result.candidates?.[0]?.finishReason || "UNKNOWN";
          if (!rawContent) {
            const emptyReason = `Empty response text from ${modelName} (finishReason=${finishReason})`;
            console.warn(`[Gemini OCR] Fallback -> errorCode=EMPTY_RESPONSE | reason="${emptyReason}"`);
            if (hasFallbackModel) continue;
            return res.json({
              success: false,
              error: "EMPTY_RESPONSE",
              errorCode: "EMPTY_RESPONSE",
              httpStatus: response.status,
              modelAttempted: modelName,
              fallbackReason: emptyReason,
              message: "No content returned from Gemini. Using local OCR.",
            });
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
            // Attempt extracting first complete JSON object if stray text wrapped it
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
              console.warn(`[Gemini OCR] Failed to parse JSON:`, rawContent.slice(0, 300));
              if (hasFallbackModel) continue;
              return res.json({
                success: false,
                error: "PARSE_ERROR",
                errorCode: "PARSE_ERROR",
                httpStatus: response.status,
                modelAttempted: modelName,
                fallbackReason: parseReason,
                message: "Failed to parse Gemini response. Using local OCR.",
              });
            }
          }

          const itemCount = Array.isArray(parsedData?.items) ? parsedData.items.length : 0;
          console.log(
            `[Gemini OCR] Success <- model=${modelName} | durationMs=${Date.now() - reqStart} | merchant="${parsedData?.merchantName || ""}" | total=${parsedData?.totalAmount ?? 0} | items=${itemCount}`
          );

          return res.json({
            success: true,
            modelUsed: modelName,
            httpStatus: response.status,
            durationMs: Date.now() - reqStart,
            data: parsedData,
          });
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          const isAbort = fetchErr?.name === "AbortError";
          lastErrorCode = isAbort ? "GEMINI_TIMEOUT" : "NETWORK_ERROR";
          lastErrorDetail = fetchErr?.message || String(fetchErr);
          console.warn(`[Gemini OCR] Request exception <- model=${modelName} | code=${lastErrorCode} | detail=${lastErrorDetail}`);
          if (hasFallbackModel) {
            continue;
          }
          return res.json({
            success: false,
            error: lastErrorCode,
            errorCode: lastErrorCode,
            httpStatus: lastHttpStatus,
            modelAttempted: modelName,
            fallbackReason: `${lastErrorCode}: ${lastErrorDetail}`,
            message: "Gemini analysis timed out or failed. Using local OCR.",
          });
        }
      }

      const exhaustedReason = `All models failed (last=${lastModelAttempted}, status=${lastHttpStatus}): ${lastErrorDetail}`;
      console.warn(`[Gemini OCR] Fallback -> errorCode=${lastErrorCode} | reason="${exhaustedReason}"`);
      return res.json({
        success: false,
        error: lastErrorCode,
        errorCode: lastErrorCode,
        httpStatus: lastHttpStatus,
        modelAttempted: lastModelAttempted,
        fallbackReason: exhaustedReason,
        message: `Gemini returned status ${lastHttpStatus ?? "error"}. Using local OCR.`,
      });
    } catch (err: any) {
      console.warn("[Gemini OCR] Unexpected server failure:", err?.message || err);
      return res.json({
        success: false,
        error: "SERVER_ERROR",
        errorCode: "SERVER_ERROR",
        httpStatus: 500,
        modelAttempted: null,
        fallbackReason: err?.message || "Unexpected server error",
        message: "Gemini analysis timed out or failed. Using local OCR.",
      });
    }
  });

  return httpServer;
}

