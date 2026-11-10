import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

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

  // OCR Receipt analysis endpoint using Gemini 3.8 Flash with fallback & strict timeout
  app.post("/api/ocr/receipt", async (req, res) => {
    const startTime = Date.now();
    console.log(`[OCR Server] 📥 [${new Date().toISOString()}] Incoming OCR receipt request`);

    try {
      const { imageBase64, mimeType = "image/jpeg" } = req.body;

      if (!imageBase64) {
        console.warn("[OCR Server] ⚠️ Missing imageBase64 in request body");
        return res.status(400).json({
          success: false,
          error: "MISSING_IMAGE",
          message: "Липсва изображение на касова бележка (imageBase64).",
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("[OCR Server] ⚠️ GEMINI_API_KEY is not defined in process.env");
        return res.status(503).json({
          success: false,
          error: "GEMINI_API_KEY_MISSING",
          message:
            "Не е конфигуриран GEMINI_API_KEY на сървъра. Можете да попълните полетата ръчно.",
        });
      }

      // Clean base64 string
      const cleanBase64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, "");
      console.log(
        `[OCR Server] 📷 Image received: ${Math.round((cleanBase64.length * 3) / 4 / 1024)} KB, MIME: ${mimeType}`
      );

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const prompt = `You are a specialized financial receipt parser and OCR engine.
Analyze this receipt image thoroughly.
Tasks:
1. Identify the Merchant/Store name (e.g. Lidl, Billa, Kaufland, Shell, OMV, Sopharmacy, local restaurant, etc.).
2. Extract the transaction date in YYYY-MM-DD format if available. If missing or unclear, return empty string "".
3. Identify the final Total amount paid (number).
4. Identify the currency symbol or code (e.g. "EUR", "€", "лв.", "BGN", "$").
5. Extract each individual purchased item name and its corresponding price.
6. Suggest the most appropriate category for this expense from:
   - "Храна" (groceries, supermarkets like Lidl, Billa, Kaufland, bakeries)
   - "Ресторант" (restaurants, fast food, cafe, drinks, meals)
   - "Гориво" (gas stations, fuel like Shell, OMV, Lukoil)
   - "Аптека" (pharmacies, medicines, vitamins, health)
   - "Кино" (cinema, movies, theater)
   - "Кола" (auto repairs, car parts, car wash)
   - "Фризьор" (hair salon, barber)
   - "Дрехи" (apparel, clothing, shoes)
   - "Козметика" (cosmetics, drugstore)
   - "Почистване" (household supplies, detergents)
   - "Домашни любимци" (pet food, pet store)
   - "Други" (other general expenses)
7. Format an itemized list into 'notesFormatted' where each item is on a new line formatted as:
   Item Name €Price
   Example:
   Beer €5.00
   Soup €7.00
   Salad €8.50
   Dessert €9.00
8. Extract the entire verbatim raw text visible across the receipt into 'rawText'.
9. Assess clarity: confidence = "high", "medium", or "low".
10. If the image is blurry, cut off, unreadable, or missing total, include descriptive warnings in 'warnings' (in Bulgarian). If clear, leave 'warnings' empty.`;

      const contents = {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || "image/jpeg",
            },
          },
          {
            text: prompt,
          },
        ],
      };

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          merchantName: { type: Type.STRING },
          date: { type: Type.STRING },
          totalAmount: { type: Type.NUMBER },
          currency: { type: Type.STRING },
          suggestedCategory: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                quantity: { type: Type.NUMBER },
              },
              required: ["name", "price"],
            },
          },
          notesFormatted: { type: Type.STRING },
          rawText: { type: Type.STRING },
          confidence: { type: Type.STRING },
          warnings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: [
          "merchantName",
          "totalAmount",
          "items",
          "notesFormatted",
          "rawText",
          "suggestedCategory",
        ],
      };

      // Helper to execute generation with a strict 14s timeout
      const executeWithTimeout = async (model: string, timeoutMs = 14000) => {
        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`AI_TIMEOUT: Gemini request to ${model} exceeded ${timeoutMs}ms`));
          }, timeoutMs);
        });

        console.log(`[OCR Server] 🚀 Calling Gemini API (${model})...`);
        const callPromise = ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: "application/json",
            responseSchema,
          },
        });

        try {
          const result = await Promise.race([callPromise, timeoutPromise]);
          clearTimeout(timer!);
          return result;
        } catch (e) {
          clearTimeout(timer!);
          throw e;
        }
      };

      let response;
      let usedModel = "gemini-3.8-flash";

      try {
        response = await executeWithTimeout("gemini-3.8-flash", 12000);
      } catch (err: any) {
        const errMsg = String(err?.message || "");
        console.warn(`[OCR Server] ⚠️ gemini-3.8-flash failed: ${errMsg}`);
        
        // If image itself is invalid (INVALID_ARGUMENT), do not retry
        if (errMsg.includes("INVALID_ARGUMENT")) {
          throw err;
        }

        // Try gemini-2.5-flash or gemini-3.1-flash-lite
        try {
          console.warn("[OCR Server] 🔄 Retrying with gemini-2.5-flash...");
          usedModel = "gemini-2.5-flash";
          response = await executeWithTimeout("gemini-2.5-flash", 10000);
        } catch (fbErr: any) {
          console.warn("[OCR Server] 🔄 Retrying with gemini-3.1-flash-lite...");
          usedModel = "gemini-3.1-flash-lite";
          response = await executeWithTimeout("gemini-3.1-flash-lite", 10000);
        }
      }

      console.log(`[OCR Server] ✅ Gemini response received in ${Date.now() - startTime}ms from ${usedModel}`);
      const responseText = response.text || "{}";
      console.log(`[OCR Server] 🔍 Response text length: ${responseText.length} chars`);

      let parsedData: any = {};
      try {
        parsedData = JSON.parse(responseText);
      } catch (jsonErr) {
        console.error("[OCR Server] ❌ Failed to parse JSON response:", jsonErr);
        parsedData = {
          merchantName: "Касова бележка",
          date: new Date().toISOString().split("T")[0],
          totalAmount: 0,
          currency: "EUR",
          suggestedCategory: "Храна",
          items: [],
          notesFormatted: "",
          rawText: responseText,
          confidence: "low",
          warnings: ["Автоматичното структуриране срещна грешка. Моля, проверете сумата."],
        };
      }

      // Safeguard against 0.24 / tax amount bug:
      // If Gemini returned a tiny total (e.g. 0.24) but rawText contains an explicit larger TOTAL (e.g. 31.39)
      const rawTextToCheck = parsedData.rawText || responseText;
      if (rawTextToCheck) {
        const totalLineMatch = rawTextToCheck.match(
          /(?:grand\s*total|total|обща\s*сума|тотал|сума\s*за\s*плащане)\s*[:=]?\s*[$€£лв]?\s*(\d{1,6}[.,]\d{2})(?!%)/i
        );
        if (totalLineMatch) {
          const extractedNum = parseFloat(totalLineMatch[1].replace(",", "."));
          if (extractedNum > 0 && parsedData.totalAmount < extractedNum * 0.7) {
            console.warn(
              `[OCR Server] ⚠️ Corrected total: ${parsedData.totalAmount} -> ${extractedNum} (from TOTAL keyword line)`
            );
            parsedData.totalAmount = extractedNum;
          }
        }
      }

      console.log(
        `[OCR Server] 🎉 OCR Success: merchant="${parsedData.merchantName}", total=${parsedData.totalAmount}, items=${parsedData.items?.length || 0}`
      );


      return res.json({
        success: true,
        data: parsedData,
        model: usedModel,
        durationMs: Date.now() - startTime,
      });
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      console.error(`[OCR Server] ❌ Receipt OCR error after ${elapsed}ms:`, err?.message || err);

      const isTimeout = String(err?.message || "").includes("AI_TIMEOUT") || String(err?.message || "").includes("timed out");
      const errorType = isTimeout ? "AI_TIMEOUT" : "OCR_PROCESSING_FAILED";
      const userMessage = isTimeout
        ? "AI заявката отне твърде много време (Timeout). Можете да въведете данните ръчно."
        : (err?.message || "Възникна грешка при OCR обработката на касовата бележка.");

      return res.status(200).json({
        success: false,
        error: errorType,
        message: userMessage,
        durationMs: elapsed,
        fallbackData: {
          merchantName: "Касова бележка",
          date: new Date().toISOString().split("T")[0],
          totalAmount: 0,
          currency: "EUR",
          suggestedCategory: "Храна",
          items: [],
          notesFormatted: "",
          rawText: "",
          confidence: "low",
          warnings: [userMessage, "Можете да въведете данните ръчно преди запис."],
        },
      });
    }
  });

  return httpServer;
}

