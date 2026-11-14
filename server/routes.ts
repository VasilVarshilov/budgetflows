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

  // OCR Receipt analysis endpoint using Gemini 2.5 Flash with fallback & strict timeout
  app.post("/api/ocr/receipt", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({
          success: false,
          error: "NO_API_KEY",
          message: "Gemini API key is not configured. Falling back to local OCR.",
        });
      }

      const { imageBase64, mimeType, ocrText } = req.body || {};
      if (!imageBase64 && !ocrText) {
        return res.status(400).json({ success: false, error: "MISSING_DATA", message: "No image or OCR text provided." });
      }

      const parts: any[] = [];
      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
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
- "items": CRITICAL — Do NOT truncate, sample, or skip any purchased items. Extract EVERY single item line from top to bottom until Subtotal/Total/VAT/Payment! On a 17-item receipt, return all 17 items so the sum of item prices matches totalAmount. Merge multi-line wrapped product names into a single clean item name. Preserve Bulgarian Cyrillic names accurately (e.g. ХЛЯБ БЯЛ, ПРЯСНО МЛЯКО, СИРЕНЕ). Extract exact quantity as integer ("quantity": 2 for "2 x Coca Cola" or "2 x 2.40  4.80"; default 1) and the line total price ("price"). Strip trailing tax group letters (А, Б, В, Г, A, B, C, D). NEVER include ДДС/VAT, В БРОЙ, КАРТА, РЕСТО, or ОБЩО rows as items.
- "notesFormatted": Multi-line list, one item per line strictly formatted as "<quantity> x <Item Name> - <currency><price>" (e.g. "2 x Coca Cola - €4.80\\n1 x Хляб бял - €1.20"). Never put all items on a single line.
- "suggestedCategory": Lidl/Kaufland/Billa/Fantastico/T Market/Metro -> "храна"; Shell/OMV/Lukoil/Eko/Rompetrol -> "гориво"; Happy/Raffy/KFC/McDonald's -> "ресторант"; Cinema City/Kino Arena -> "кино"; Lilly/DM -> "козметика"; Sopharmacy/Subra -> "аптека".
- Raw OCR text hint (may contain Cyrillic/Latin OCR artifacts): ${ocrText ? JSON.stringify(ocrText.slice(0, 4500)) : "None"}
- Return ONLY pure JSON, no markdown code blocks.`;

      parts.push({ text: promptText });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout for 15-30 item receipts

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Gemini OCR] API returned status ${response.status}:`, errText.slice(0, 200));
        return res.json({
          success: false,
          error: "API_ERROR",
          message: `Gemini returned status ${response.status}. Using local OCR.`,
        });
      }

      const result = await response.json();
      const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawContent) {
        return res.json({
          success: false,
          error: "EMPTY_RESPONSE",
          message: "No content returned from Gemini. Using local OCR.",
        });
      }

      let parsedData;
      try {
        const cleaned = rawContent.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
        parsedData = JSON.parse(cleaned);
      } catch (jsonErr) {
        console.warn("[Gemini OCR] Failed to parse JSON:", rawContent.slice(0, 200));
        return res.json({
          success: false,
          error: "PARSE_ERROR",
          message: "Failed to parse Gemini response. Using local OCR.",
        });
      }

      return res.json({
        success: true,
        data: parsedData,
      });
    } catch (err: any) {
      console.warn("[Gemini OCR] Request failed or timed out:", err?.message || err);
      return res.json({
        success: false,
        error: "TIMEOUT_OR_NETWORK",
        message: "Gemini analysis timed out or failed. Using local OCR.",
      });
    }
  });

  return httpServer;
}

