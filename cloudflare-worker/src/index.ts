import {
  analyzeReceiptWithGemini,
  GEMINI_RECEIPT_MODELS,
} from "../../shared/receiptOcrGemini";

export interface Env {
  GEMINI_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
}

const DEFAULT_ALLOWED_ORIGIN = "https://vasilvarshilov.github.io";

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function resolveCorsHeaders(request: Request, env: Env): Record<string, string> {
  const configuredRaw = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const allowedList = configuredRaw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  const primaryOrigin = allowedList[0] || DEFAULT_ALLOWED_ORIGIN;
  const requestOrigin = normalizeOrigin(request.headers.get("Origin") || "");

  // Allow configured GitHub Pages origin (plus localhost dev origins for wrangler dev testing)
  const isLocalDevOrigin =
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);
  const isExplicitlyAllowed =
    Boolean(requestOrigin) &&
    (allowedList.includes(requestOrigin) || isLocalDevOrigin);

  const allowOrigin = isExplicitlyAllowed ? requestOrigin : primaryOrigin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function logWorkerExchange(params: {
  requestOrigin: string;
  requestUrl: string;
  requestMethod: string;
  responseStatus: number;
  responseContentType: string;
  note?: string;
}): void {
  console.log("[Worker OCR Debug]", {
    requestOrigin: params.requestOrigin || "(none)",
    requestUrl: params.requestUrl,
    requestMethod: params.requestMethod,
    responseStatus: params.responseStatus,
    responseContentType: params.responseContentType || "(none)",
    ...(params.note ? { note: params.note } : {}),
  });
}

function jsonResponse(
  payload: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  requestMeta?: { origin: string; url: string; method: string; note?: string }
): Response {
  const contentType = "application/json; charset=utf-8";
  if (requestMeta) {
    logWorkerExchange({
      requestOrigin: requestMeta.origin,
      requestUrl: requestMeta.url,
      requestMethod: requestMeta.method,
      responseStatus: status,
      responseContentType: contentType,
      note: requestMeta.note,
    });
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": contentType,
      ...corsHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = resolveCorsHeaders(request, env);
    const requestOrigin = request.headers.get("Origin") || "";
    const requestMeta = {
      origin: requestOrigin,
      url: request.url,
      method: request.method,
    };

    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";

      // Handle CORS preflight cleanly
      if (request.method === "OPTIONS") {
        logWorkerExchange({
          requestOrigin,
          requestUrl: request.url,
          requestMethod: request.method,
          responseStatus: 204,
          responseContentType: "(preflight no-body)",
        });
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // Health check endpoint
      if (pathname === "/api/ocr/health") {
        if (request.method !== "GET") {
          return jsonResponse(
            {
              success: false,
              error: "METHOD_NOT_ALLOWED",
              errorCode: "METHOD_NOT_ALLOWED",
              httpStatus: 405,
              fallbackReason: `Method ${request.method} not allowed on /api/ocr/health (GET required)`,
              message: "Use GET /api/ocr/health.",
            },
            405,
            corsHeaders,
            requestMeta
          );
        }

        return jsonResponse(
          {
            ok: true,
            service: "receipt-ocr-gemini",
            runtime: "cloudflare-worker",
            hasApiKey: Boolean(env.GEMINI_API_KEY?.trim()),
            models: GEMINI_RECEIPT_MODELS,
          },
          200,
          corsHeaders,
          requestMeta
        );
      }

      // Gemini Receipt OCR enhancement endpoint
      if (pathname === "/api/ocr/receipt") {
        if (request.method !== "POST") {
          return jsonResponse(
            {
              success: false,
              error: "METHOD_NOT_ALLOWED",
              errorCode: "METHOD_NOT_ALLOWED",
              httpStatus: 405,
              fallbackReason: `Method ${request.method} not allowed on /api/ocr/receipt (POST required)`,
              message: "Use POST /api/ocr/receipt.",
            },
            405,
            corsHeaders,
            requestMeta
          );
        }

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse(
            {
              success: false,
              error: "INVALID_JSON",
              errorCode: "INVALID_JSON",
              httpStatus: 400,
              fallbackReason: "Request body must be valid JSON",
              message: "Invalid JSON request body.",
            },
            400,
            corsHeaders,
            { ...requestMeta, note: "invalid_json" }
          );
        }

        const result = await analyzeReceiptWithGemini({
          apiKey: env.GEMINI_API_KEY,
          imageBase64: body?.imageBase64,
          mimeType: body?.mimeType,
          ocrText: body?.ocrText,
        });

        return jsonResponse(result.body, result.status, corsHeaders, {
          ...requestMeta,
          note: `gemini_success=${Boolean((result.body as any)?.success)}`,
        });
      }

      return jsonResponse(
        {
          success: false,
          error: "ROUTE_NOT_FOUND",
          errorCode: "ROUTE_NOT_FOUND",
          httpStatus: 404,
          fallbackReason: `Route not found: ${request.method} ${url.pathname}`,
          message: `API route not found: ${request.method} ${url.pathname}`,
        },
        404,
        corsHeaders,
        requestMeta
      );
    } catch (err: any) {
      console.error("[Worker OCR Unhandled Exception]", err?.message || err);
      return jsonResponse(
        {
          success: false,
          error: "WORKER_EXCEPTION",
          errorCode: "SERVER_ERROR",
          httpStatus: 500,
          modelAttempted: null,
          fallbackReason: err?.message || "Unexpected Worker exception",
          message: "Cloudflare Worker encountered an unexpected error. Using local OCR.",
        },
        500,
        corsHeaders,
        { ...requestMeta, note: "unhandled_exception" }
      );
    }
  },
};
