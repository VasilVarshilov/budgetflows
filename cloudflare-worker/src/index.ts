import {
  analyzeReceiptWithGemini,
  GEMINI_RECEIPT_MODELS,
} from "../../shared/receiptOcrGemini";

export interface Env {
  GEMINI_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
}

const DEFAULT_ALLOWED_ORIGIN = "https://vasilvarshilov.github.io";

function resolveCorsHeaders(request: Request, env: Env): Record<string, string> {
  const configuredOrigin = (env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN).trim();
  const requestOrigin = request.headers.get("Origin") || "";

  // Strictly allow GitHub Pages origin (plus localhost dev origins for wrangler dev testing)
  const isLocalDevOrigin =
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);
  const allowOrigin =
    requestOrigin === configuredOrigin || isLocalDevOrigin
      ? requestOrigin
      : configuredOrigin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(
  payload: unknown,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = resolveCorsHeaders(request, env);
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    // Handle CORS preflight cleanly
    if (request.method === "OPTIONS") {
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
          corsHeaders
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
        corsHeaders
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
          corsHeaders
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
          corsHeaders
        );
      }

      const result = await analyzeReceiptWithGemini({
        apiKey: env.GEMINI_API_KEY,
        imageBase64: body?.imageBase64,
        mimeType: body?.mimeType,
        ocrText: body?.ocrText,
      });

      return jsonResponse(result.body, result.status, corsHeaders);
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
      corsHeaders
    );
  },
};
