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
  if (trimmed === "*") return "*";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

interface ResolvedCors {
  headers: Record<string, string>;
  requestOrigin: string;
  allowedOrigin: string;
  accessControlAllowOrigin: string;
  isOriginAllowed: boolean;
}

function resolveCorsHeaders(request: Request, env: Env): ResolvedCors {
  const configuredRaw = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const allowedList = configuredRaw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  const primaryOrigin = allowedList[0] || DEFAULT_ALLOWED_ORIGIN;
  const rawOriginHeader = request.headers.get("Origin") || "";
  const requestOrigin = normalizeOrigin(rawOriginHeader);

  // Allow configured GitHub Pages origin (plus localhost dev origins for wrangler dev testing)
  const isLocalDevOrigin =
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);
  const allowsWildcard = allowedList.includes("*");
  const isExplicitlyAllowed =
    allowsWildcard ||
    (Boolean(requestOrigin) &&
      (allowedList.includes(requestOrigin) || isLocalDevOrigin));

  const allowOrigin = allowsWildcard
    ? "*"
    : isExplicitlyAllowed
    ? requestOrigin
    : primaryOrigin;

  const requestedHeaders = (
    request.headers.get("Access-Control-Request-Headers") || ""
  )
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const allowHeadersSet = new Set(["Content-Type", "Authorization", ...requestedHeaders]);

  return {
    headers: {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": Array.from(allowHeadersSet).join(", "),
      "Access-Control-Max-Age": "86400",
      Vary: "Origin, Access-Control-Request-Headers",
    },
    requestOrigin: rawOriginHeader || "(none)",
    allowedOrigin: allowedList.join(", ") || DEFAULT_ALLOWED_ORIGIN,
    accessControlAllowOrigin: allowOrigin,
    isOriginAllowed: isExplicitlyAllowed,
  };
}

function logWorkerExchange(params: {
  requestOrigin: string;
  allowedOrigin: string;
  accessControlAllowOrigin: string;
  isOriginAllowed: boolean;
  requestUrl: string;
  requestMethod: string;
  contentLength: string;
  requestBodySize: number | null;
  requestReceivedTimestamp: string;
  requestCompletedTimestamp: string;
  stage: string;
  responseStatus: number;
  responseContentType: string;
  note?: string;
}): void {
  console.log("[Worker OCR Debug]", {
    requestOrigin: params.requestOrigin,
    allowedOrigin: params.allowedOrigin,
    accessControlAllowOrigin: params.accessControlAllowOrigin,
    isOriginAllowed: params.isOriginAllowed,
    requestMethod: params.requestMethod,
    requestUrl: params.requestUrl,
    contentLength: params.contentLength,
    requestBodySize: params.requestBodySize,
    requestReceivedTimestamp: params.requestReceivedTimestamp,
    requestCompletedTimestamp: params.requestCompletedTimestamp,
    stage: params.stage,
    responseStatus: params.responseStatus,
    responseContentType: params.responseContentType || "(none)",
    ...(params.note ? { note: params.note } : {}),
  });
}

function jsonResponse(
  payload: unknown,
  status: number,
  cors: ResolvedCors,
  requestMeta?: {
    url: string;
    method: string;
    contentLength: string;
    requestBodySize: number | null;
    requestReceivedTimestamp: string;
    stage: string;
    note?: string;
  }
): Response {
  const contentType = "application/json; charset=utf-8";
  const requestCompletedTimestamp = new Date().toISOString();
  if (requestMeta) {
    logWorkerExchange({
      requestOrigin: cors.requestOrigin,
      allowedOrigin: cors.allowedOrigin,
      accessControlAllowOrigin: cors.accessControlAllowOrigin,
      isOriginAllowed: cors.isOriginAllowed,
      requestUrl: requestMeta.url,
      requestMethod: requestMeta.method,
      contentLength: requestMeta.contentLength,
      requestBodySize: requestMeta.requestBodySize,
      requestReceivedTimestamp: requestMeta.requestReceivedTimestamp,
      requestCompletedTimestamp,
      stage: requestMeta.stage,
      responseStatus: status,
      responseContentType: contentType,
      note: requestMeta.note,
    });
  }
  const enrichedPayload =
    requestMeta && payload && typeof payload === "object"
      ? {
          ...(payload as Record<string, unknown>),
          workerTiming: {
            stage: requestMeta.stage,
            contentLength: requestMeta.contentLength,
            requestBodySize: requestMeta.requestBodySize,
            requestReceivedTimestamp: requestMeta.requestReceivedTimestamp,
            requestCompletedTimestamp,
          },
        }
      : payload;
  return new Response(JSON.stringify(enrichedPayload), {
    status,
    headers: {
      "Content-Type": contentType,
      ...cors.headers,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestReceivedTimestamp = new Date().toISOString();
    const contentLengthHeader = request.headers.get("content-length") || "(not sent)";
    let requestBodySize: number | null = null;
    let currentStage = "WORKER_RECEIVED";

    let cors: ResolvedCors = {
      headers: {
        "Access-Control-Allow-Origin": DEFAULT_ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin, Access-Control-Request-Headers",
      },
      requestOrigin: request.headers.get("Origin") || "(none)",
      allowedOrigin: DEFAULT_ALLOWED_ORIGIN,
      accessControlAllowOrigin: DEFAULT_ALLOWED_ORIGIN,
      isOriginAllowed: false,
    };

    const getMeta = (note?: string) => ({
      url: request.url,
      method: request.method,
      contentLength: contentLengthHeader,
      requestBodySize,
      requestReceivedTimestamp,
      stage: currentStage,
      note,
    });

    try {
      cors = resolveCorsHeaders(request, env);
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";

      // Handle CORS preflight cleanly
      if (request.method === "OPTIONS") {
        logWorkerExchange({
          requestOrigin: cors.requestOrigin,
          allowedOrigin: cors.allowedOrigin,
          accessControlAllowOrigin: cors.accessControlAllowOrigin,
          isOriginAllowed: cors.isOriginAllowed,
          requestUrl: request.url,
          requestMethod: request.method,
          contentLength: contentLengthHeader,
          requestBodySize: 0,
          requestReceivedTimestamp,
          requestCompletedTimestamp: new Date().toISOString(),
          stage: currentStage,
          responseStatus: 204,
          responseContentType: "(preflight no-body)",
        });
        return new Response(null, { status: 204, headers: cors.headers });
      }

      // Health check endpoint
      if (pathname === "/api/ocr/health") {
        if (request.method !== "GET") {
          return jsonResponse(
            {
              success: false,
              error: "METHOD_NOT_ALLOWED",
              errorCode: "METHOD_NOT_ALLOWED",
              workerErrorCode: "METHOD_NOT_ALLOWED",
              geminiErrorCode: null,
              timeoutReason: null,
              failingStage: currentStage,
              httpStatus: 405,
              fallbackReason: `Method ${request.method} not allowed on /api/ocr/health (GET required)`,
              message: "Use GET /api/ocr/health.",
            },
            405,
            cors,
            getMeta()
          );
        }

        return jsonResponse(
          {
            ok: true,
            service: "receipt-ocr-gemini",
            runtime: "cloudflare-worker",
            hasApiKey: Boolean(env.GEMINI_API_KEY?.trim()),
            allowedOrigin: cors.allowedOrigin,
            requestOrigin: cors.requestOrigin,
            corsOriginAccepted: cors.isOriginAllowed,
            models: GEMINI_RECEIPT_MODELS,
          },
          200,
          cors,
          getMeta()
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
              workerErrorCode: "METHOD_NOT_ALLOWED",
              geminiErrorCode: null,
              timeoutReason: null,
              failingStage: currentStage,
              httpStatus: 405,
              fallbackReason: `Method ${request.method} not allowed on /api/ocr/receipt (POST required)`,
              message: "Use POST /api/ocr/receipt.",
            },
            405,
            cors,
            getMeta()
          );
        }

        currentStage = "WORKER_PARSE";
        let body: Record<string, unknown> = {};
        try {
          const rawBodyText = await request.text();
          requestBodySize = new TextEncoder().encode(rawBodyText).byteLength;
          body = (rawBodyText ? JSON.parse(rawBodyText) : {}) as Record<string, unknown>;
        } catch (parseErr: any) {
          return jsonResponse(
            {
              success: false,
              error: "INVALID_JSON",
              errorCode: "INVALID_JSON",
              workerErrorCode: "INVALID_JSON",
              geminiErrorCode: null,
              timeoutReason: null,
              failingStage: "WORKER_PARSE",
              httpStatus: 400,
              fallbackReason: `Request body must be valid JSON (${parseErr?.message || "JSON parse error"})`,
              message: "Invalid JSON request body.",
            },
            400,
            cors,
            getMeta("invalid_json")
          );
        }

        currentStage = "GEMINI_REQUEST";
        const result = await analyzeReceiptWithGemini({
          apiKey: env.GEMINI_API_KEY,
          imageBase64: body?.imageBase64,
          mimeType: body?.mimeType,
          ocrText: body?.ocrText,
        });

        currentStage = (result.body as any)?.failingStage || "GEMINI_RESPONSE";

        return jsonResponse(result.body, result.status, cors, getMeta(`gemini_success=${Boolean((result.body as any)?.success)}`));
      }

      return jsonResponse(
        {
          success: false,
          error: "ROUTE_NOT_FOUND",
          errorCode: "ROUTE_NOT_FOUND",
          workerErrorCode: "ROUTE_NOT_FOUND",
          geminiErrorCode: null,
          timeoutReason: null,
          failingStage: currentStage,
          httpStatus: 404,
          fallbackReason: `Route not found: ${request.method} ${url.pathname}`,
          message: `API route not found: ${request.method} ${url.pathname}`,
        },
        404,
        cors,
        getMeta()
      );
    } catch (err: any) {
      console.error("[Worker OCR Unhandled Exception]", err?.message || err);
      return jsonResponse(
        {
          success: false,
          error: "WORKER_EXCEPTION",
          errorCode: "WORKER_EXCEPTION",
          workerErrorCode: "WORKER_EXCEPTION",
          geminiErrorCode: null,
          timeoutReason: null,
          failingStage: currentStage,
          httpStatus: 500,
          modelAttempted: null,
          fallbackReason: err?.message || "Unexpected Worker exception",
          message: "Cloudflare Worker encountered an unexpected error. Using local OCR.",
        },
        500,
        cors,
        getMeta("unhandled_exception")
      );
    }
  },
};
