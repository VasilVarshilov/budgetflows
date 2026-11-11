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

  // OCR Receipt analysis endpoint using Gemini 3.8 Flash with fallback & strict timeout
app.post("/api/ocr/receipt", async (_req, res) => {
  return res.status(200).json({
    success: false,
    error: "OCR_DISABLED",
    message: "Receipt scanning is temporarily disabled.",
  });
});

  return httpServer;
}

