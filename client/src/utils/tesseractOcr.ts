import { createWorker } from "tesseract.js";

/**
 * Client-Side Optical Character Recognition (OCR) Engine
 * Runs locally in browser via Tesseract.js WebAssembly.
 * Configured with Bulgarian Cyrillic + English ("bul+eng") as primary language pack,
 * with automatic fallback to "eng" only if Bulgarian language data cannot be fetched offline.
 */
export async function runClientOcr(
  imageSource: string | File | Blob,
  onProgress?: (progressPercent: number, statusText: string) => void,
  timeoutMs: number = 22000
): Promise<{
  text: string;
  confidence: number;
  durationMs: number;
  languagesUsed: string;
}> {
  const startTime = Date.now();
  let activeWorker: any = null;
  let timedOut = false;

  const createConfiguredWorker = async (
    langs: string[],
    langLabel: string
  ) => {
    const worker = await createWorker(langs, 1, {
      logger: (m) => {
        if (timedOut) return;
        if (m.status === "recognizing text") {
          const pct = Math.min(95, Math.round(20 + (m.progress || 0) * 75));
          onProgress?.(
            pct,
            `Сканиране на кирилица и числа (${Math.round((m.progress || 0) * 100)}%)...`
          );
        } else if (m.status) {
          onProgress?.(15, `Подготовка (${langLabel}: ${m.status})...`);
        }
      },
    });

    try {
      await worker.setParameters({
        preserve_interword_spaces: "1",
      });
    } catch {
      // Ignore optional parameter warning on older builds
    }

    return worker;
  };

  const ocrPromise = (async () => {
    onProgress?.(10, "Инициализиране на български + английски OCR...");
    let languagesUsed = "bul+eng";

    try {
      try {
        activeWorker = await createConfiguredWorker(["bul", "eng"], "BG+EN");
      } catch (bulErr: any) {
        console.warn(
          "[OCR] Could not load 'bul+eng' traineddata, falling back to 'eng':",
          bulErr?.message || bulErr
        );
        languagesUsed = "eng";
        activeWorker = await createConfiguredWorker(["eng"], "EN");
      }

      if (timedOut) {
        return {
          text: "",
          confidence: 0,
          durationMs: Date.now() - startTime,
          languagesUsed,
        };
      }

      onProgress?.(30, "Сканиране на символи и цени...");
      const ret = await activeWorker.recognize(imageSource);

      onProgress?.(95, "Финализиране на разчетения текст...");
      const text = ret.data?.text || "";
      const confidence = ret.data?.confidence || 0;

      console.log(
        `[Receipt OCR] Completed with ${languagesUsed} in ${Date.now() - startTime}ms (confidence: ${confidence.toFixed(1)}%, chars: ${text.length})`
      );

      return {
        text,
        confidence,
        durationMs: Date.now() - startTime,
        languagesUsed,
      };
    } finally {
      if (activeWorker) {
        try {
          await activeWorker.terminate();
        } catch {
          // ignore termination errors
        }
        activeWorker = null;
      }
    }
  })();

  const timeoutPromise = new Promise<{
    text: string;
    confidence: number;
    durationMs: number;
    languagesUsed: string;
  }>((resolve) => {
    setTimeout(async () => {
      timedOut = true;
      console.warn(`[Receipt OCR] Timed out after ${timeoutMs}ms`);
      if (activeWorker) {
        try {
          await activeWorker.terminate();
        } catch {
          // ignore
        }
        activeWorker = null;
      }
      resolve({
        text: "",
        confidence: 0,
        durationMs: timeoutMs,
        languagesUsed: "timeout",
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
      languagesUsed: "error",
    };
  }
}
