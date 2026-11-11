import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import fs from "fs";
import path from "path";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Dynamic Firebase config endpoint for client runtime fallback
  app.get("/api/firebase-config", (_req, res) => {
    try {
      // 1. Try environment variables first
      if (process.env.VITE_FIREBASE_API_KEY) {
        const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "";
        return res.json({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : ""),
          projectId,
          storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : ""),
          messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
          appId: process.env.VITE_FIREBASE_APP_ID || "",
          oAuthClientId: process.env.VITE_FIREBASE_OAUTH_CLIENT_ID || "",
        });
      }

      // 2. Fallback to local gitignored config file if present in dev
      const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        return res.json(parsed);
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

      const promptText = `Analyze this receipt. Return ONLY a valid JSON object matching this schema:
{
  "merchantName": "Store/Company Name",
  "date": "YYYY-MM-DD",
  "totalAmount": 12.34,
  "suggestedCategory": "category_name (e.g. храна, ресторант, гориво, кола, аптека, дрехи, битови сметки)",
  "items": [
    { "name": "Item Name", "price": 1.23, "quantity": 1 }
  ],
  "notesFormatted": "Item1 €1.23\\nItem2 €4.56"
}
Important:
- "totalAmount" MUST be the actual final total/grand total paid, NOT a tax, subtotal or discount.
- If raw OCR text is provided, use it to improve accuracy: ${ocrText ? JSON.stringify(ocrText.slice(0, 1000)) : "None"}
- Return ONLY pure JSON, no markdown formatting.`;

      parts.push({ text: promptText });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s strict timeout

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

