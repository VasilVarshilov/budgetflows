import { createWorker } from "tesseract.js";

/**
 * Client-Side Optical Character Recognition (OCR) Engine
 * Runs locally in browser via Tesseract.js WebAssembly.
 * Fully client-side, runs without requiring Gemini or external server endpoints.
 */
export async function runClientOcr(
  imageSource: string | File | Blob,
  onProgress?: (progressPercent: number, statusText: string) => void,
  timeoutMs: number = 15000
): Promise<{ text: string; confidence: number; durationMs: number }> {
  const startTime = Date.now();

  const ocrPromise = (async () => {
    onProgress?.(10, "Инициализиране на OCR разпознаване...");
    
    let worker: any = null;
    try {
      // Initialize worker with progress logger
      worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            const pct = Math.min(95, Math.round(15 + (m.progress || 0) * 80));
            onProgress?.(pct, `Сканиране на символи и редове (${Math.round((m.progress || 0) * 100)}%)...`);
          } else if (m.status) {
            onProgress?.(15, `Подготовка (${m.status})...`);
          }
        },
      });

      onProgress?.(30, "Сканиране на символи и редове...");
      const ret = await worker.recognize(imageSource);
      
      onProgress?.(95, "Финализиране на разчетения текст...");
      const text = ret.data?.text || "";
      const confidence = ret.data?.confidence || 0;

      return {
        text,
        confidence,
        durationMs: Date.now() - startTime,
      };
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (_) {
          // ignore termination errors
        }
      }
    }
  })();

  const timeoutPromise = new Promise<{ text: string; confidence: number; durationMs: number }>((resolve) => {
    setTimeout(() => {
      resolve({
        text: "",
        confidence: 0,
        durationMs: timeoutMs,
      });
    }, timeoutMs);
  });

  try {
    return await Promise.race([ocrPromise, timeoutPromise]);
  } catch (err: any) {
    console.warn("[OCR] Error during local OCR:", err?.message || err);
    return {
      text: "",
      confidence: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

