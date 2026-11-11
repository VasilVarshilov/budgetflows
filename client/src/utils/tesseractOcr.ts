/**
* Temporary OCR stub.
* Receipt scanning is temporarily disabled.
import { createWorker } from "tesseract.js";

export async function runClientOcr(
  imageSource: string | File | Blob,
  onProgress?: (progressPercent: number, statusText: string) => void,
  timeoutMs: number = 10000
): Promise<{ text: string; confidence: number; durationMs: number }> {
  const startTime = Date.now();

  const ocrPromise = (async () => {
    onProgress?.(10, "Инициализиране на OCR разпознаване...");
    
    // Create worker with English & Bulgarian support if available, or English default
    const worker = await createWorker("eng");

    try {
      onProgress?.(30, "Сканиране на символи и редове...");
      const ret = await worker.recognize(imageSource);
      
      onProgress?.(90, "Финализиране на разчетения текст...");
      const text = ret.data.text || "";
      const confidence = ret.data.confidence || 0;

      await worker.terminate();
      return {
        text,
        confidence,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      try {
        await worker.terminate();
      } catch (_) {}
      throw err;
    }
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`OCR_TIMEOUT: Локалното OCR разпознаване надвиши ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  return Promise.race([ocrPromise, timeoutPromise]);
}
 * Client-Side Optical Character Recognition (OCR) Engine
 * Runs locally in browser via Tesseract.js WebAssembly.
 * Fully offline-capable, runs without backend or Gemini dependencies.
 */
export async function runClientOcr(
  imageSource: string | File | Blob,
  onProgress?: (progressPercent: number, statusText: string) => void,
  timeoutMs: number = 10000
): Promise<{ text: string; confidence: number; durationMs: number }> {
  onProgress?.(100, "OCR временно е деактивирано.");

  return {
    text: "",
    confidence: 0,
    durationMs: 0,
  };
}

