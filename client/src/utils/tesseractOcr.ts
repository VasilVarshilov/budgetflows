import { createWorker, PSM } from "tesseract.js";

/**
 * Client-Side Optical Character Recognition (OCR) Engine
 * Runs locally in browser via Tesseract.js WebAssembly.
 * Configured with Bulgarian Cyrillic + English ("bul+eng") as mandatory primary language pack,
 * using SINGLE_BLOCK page segmentation to keep receipt item names and prices aligned on the same row.
 */
export interface ClientOcrResult {
  text: string;
  confidence: number;
  durationMs: number;
  languagesUsed: string;
  requestedLanguages: string;
  fallbackOccurred: boolean;
  psmMode: string;
}

export async function runClientOcr(
  imageSource: string | File | Blob,
  onProgress?: (progressPercent: number, statusText: string) => void,
  timeoutMs: number = 45000
): Promise<ClientOcrResult> {
  const startTime = Date.now();
  const requestedLanguages = "bul+eng";
  let activeWorker: any = null;
  let timedOut = false;

  console.log(
    `[Receipt OCR] Starting OCR worker | requestedLanguages="${requestedLanguages}" | OEM=1 (LSTM) | PSM=SINGLE_BLOCK | preserve_interword_spaces=1`
  );

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

  const ocrPromise = (async (): Promise<ClientOcrResult> => {
    onProgress?.(10, "Инициализиране на български + английски OCR (bul+eng)...");
    let languagesUsed = requestedLanguages;
    let fallbackOccurred = false;
    let psmMode = "SINGLE_BLOCK";

    try {
      try {
        activeWorker = await createConfiguredWorker(requestedLanguages, "BG+EN");
        console.log(`[Receipt OCR] Worker initialized with languages="${requestedLanguages}" (Bulgarian + English active)`);
      } catch (bulErr: any) {
        fallbackOccurred = true;
        languagesUsed = "eng";
        console.warn(
          `[Receipt OCR] Failed loading "${requestedLanguages}" traineddata, falling back to "eng":`,
          bulErr?.message || bulErr
        );
        activeWorker = await createConfiguredWorker("eng", "EN");
      }

      if (timedOut) {
        return {
          text: "",
          confidence: 0,
          durationMs: Date.now() - startTime,
          languagesUsed: "timeout",
          requestedLanguages,
          fallbackOccurred,
          psmMode,
        };
      }

      onProgress?.(30, "Разчитане на български и английски текст...");
      const ret = await activeWorker.recognize(imageSource);

      let text: string = ret.data?.text || "";
      let confidence: number = ret.data?.confidence || 0;

      // If SINGLE_BLOCK returns sparse text on a tall receipt, retry once with SINGLE_COLUMN
      if (!timedOut && text.trim().length < 25) {
        try {
          onProgress?.(78, "Повторно разчитане в колонен режим (SINGLE_COLUMN)...");
          await activeWorker.setParameters({
            preserve_interword_spaces: "1",
            tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
          });
          const retryRet = await activeWorker.recognize(imageSource);
          const retryText: string = retryRet.data?.text || "";
          const retryConfidence: number = retryRet.data?.confidence || 0;
          if (retryText.trim().length > text.trim().length) {
            text = retryText;
            confidence = retryConfidence;
            psmMode = "SINGLE_COLUMN";
          }
        } catch {
          // keep initial result
        }
      }

      onProgress?.(95, "Финализиране на разчетения текст...");

      console.log(
        `[Receipt OCR] Completed | requestedLanguages="${requestedLanguages}" | languagesUsed="${languagesUsed}" | fallback=${fallbackOccurred} | PSM=${psmMode} | Duration=${Date.now() - startTime}ms | Confidence=${confidence.toFixed(1)}% | Chars=${text.length}`
      );

      return {
        text,
        confidence,
        durationMs: Date.now() - startTime,
        languagesUsed,
        requestedLanguages,
        fallbackOccurred,
        psmMode,
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
  const timeoutPromise = new Promise<ClientOcrResult>((resolve) => {
    timeoutHandle = setTimeout(async () => {
      timedOut = true;
      console.warn(`[Receipt OCR] Timed out after ${timeoutMs}ms (requestedLanguages="${requestedLanguages}")`);
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
        requestedLanguages,
        fallbackOccurred: true,
        psmMode: "SINGLE_BLOCK",
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
      requestedLanguages,
      fallbackOccurred: true,
      psmMode: "SINGLE_BLOCK",
    };
  }
}
