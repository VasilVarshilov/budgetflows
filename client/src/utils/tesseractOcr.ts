import { createWorker, PSM } from "tesseract.js";

/**
 * Client-Side Optical Character Recognition (OCR) Engine
 * Runs locally in browser via Tesseract.js WebAssembly.
 * Configured with Bulgarian Cyrillic + English ("bul+eng") as mandatory primary language pack,
 * using SINGLE_BLOCK page segmentation to keep receipt item names and prices aligned on the same row.
 */
export async function runClientOcr(
  imageSource: string | File | Blob,
  onProgress?: (progressPercent: number, statusText: string) => void,
  timeoutMs: number = 45000
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
    langs: string,
    langLabel: string
  ) => {
    const worker = await createWorker(langs, 1, {
      logger: (m) => {
        if (timedOut) return;
        if (m.status === "recognizing text") {
          const pct = Math.min(95, Math.round(25 + (m.progress || 0) * 70));
          onProgress?.(
            pct,
            `Сканиране на кирилица и числа (${Math.round((m.progress || 0) * 100)}%)...`
          );
        } else if (m.status) {
          onProgress?.(18, `Зареждане (${langLabel}: ${m.status})...`);
        }
      },
    });

    try {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
    } catch (paramErr) {
      console.warn("[OCR] Could not apply optional Tesseract parameters:", paramErr);
    }

    return worker;
  };

  const ocrPromise = (async () => {
    onProgress?.(10, "Инициализиране на български + английски OCR (bul+eng)...");
    let languagesUsed = "bul+eng";

    try {
      try {
        activeWorker = await createConfiguredWorker("bul+eng", "BG+EN");
      } catch (bulErr: any) {
        console.warn(
          "[OCR] Failed loading 'bul+eng' traineddata, falling back to 'eng':",
          bulErr?.message || bulErr
        );
        languagesUsed = "eng";
        activeWorker = await createConfiguredWorker("eng", "EN");
      }

      if (timedOut) {
        return {
          text: "",
          confidence: 0,
          durationMs: Date.now() - startTime,
          languagesUsed: "timeout",
        };
      }

      onProgress?.(30, "Разчитане на български и английски текст...");
      const ret = await activeWorker.recognize(imageSource);

      onProgress?.(95, "Финализиране на разчетения текст...");
      const text = ret.data?.text || "";
      const confidence = ret.data?.confidence || 0;

      console.log(
        `[Receipt OCR] Worker=${languagesUsed} | PSM=SINGLE_BLOCK | Duration=${Date.now() - startTime}ms | Confidence=${confidence.toFixed(1)}% | Chars=${text.length}`
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

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<{
    text: string;
    confidence: number;
    durationMs: number;
    languagesUsed: string;
  }>((resolve) => {
    timeoutHandle = setTimeout(async () => {
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
    const result = await Promise.race([ocrPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    return result;
  } catch (err: any) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    console.warn("[OCR] Error during local OCR:", err?.message || err);
    return {
      text: "",
      confidence: 0,
      durationMs: Date.now() - startTime,
      languagesUsed: "error",
    };
  }
}
