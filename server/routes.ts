import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import fs from "fs";
import path from "path";
import {
  analyzeReceiptWithGemini,
  GEMINI_RECEIPT_MODELS,
} from "../shared/receiptOcrGemini";

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
  // Enable CORS & preflight handling for all /api/* endpoints (allows external/static frontends via VITE_API_BASE_URL)
  app.use("/api", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    return next();
  });

  // Safe diagnostic endpoint to verify API reachability & GEMINI_API_KEY presence (without exposing secrets)
  app.get("/api/ocr/health", (_req, res) => {
    return res.json({
      ok: true,
      service: "receipt-ocr-gemini",
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      models: GEMINI_RECEIPT_MODELS,
    });
  });

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

  // OCR Receipt analysis endpoint using shared Gemini helper (gemini-3.1-flash-lite / gemini-4-hydrogen)
  app.post("/api/ocr/receipt", async (req, res) => {
    const { imageBase64, mimeType, ocrText } = req.body || {};
    const result = await analyzeReceiptWithGemini({
      apiKey: process.env.GEMINI_API_KEY,
      imageBase64,
      mimeType,
      ocrText,
    });
    return res.status(result.status).json(result.body);
  });

  // Ensure unsupported HTTP methods on /api/ocr/receipt return JSON 405 instead of falling through to HTML catch-all
  app.all("/api/ocr/receipt", (req, res) => {
    return res.status(405).json({
      success: false,
      error: "METHOD_NOT_ALLOWED",
      errorCode: "METHOD_NOT_ALLOWED",
      httpStatus: 405,
      fallbackReason: `Method ${req.method} not allowed on /api/ocr/receipt (POST required)`,
      message: "Use POST /api/ocr/receipt.",
    });
  });

  // Catch-all JSON 404 guard for any unmatched /api/* route so Vite/static HTML is never returned for API requests
  app.use("/api", (req, res) => {
    return res.status(404).json({
      success: false,
      error: "ROUTE_NOT_FOUND",
      errorCode: "ROUTE_NOT_FOUND",
      httpStatus: 404,
      fallbackReason: `Route not found: ${req.method} ${req.originalUrl}`,
      message: `API route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  return httpServer;
}


