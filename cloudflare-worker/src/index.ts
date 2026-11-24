import {
  analyzeReceiptWithGemini,
  GEMINI_RECEIPT_MODELS,
} from "../../shared/receiptOcrGemini";

export interface Env {
  GEMINI_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
}

const DEFAULT_ALLOWED_ORIGIN = "https://vasilvarshilov.github.io";

interface HeaderDiagnosticSnapshot {
  timestamp: string;
  method: string;
  pathname: string;
  deviceHint: "Mobile" | "Desktop" | "CLI/Other";
  origin: string;
  isOriginAllowed: boolean;
  allowedOrigin: string;
  accessControlAllowOrigin: string;
  accessControlRequestMethod: string;
  accessControlRequestHeaders: string;
  accessControlRequestPrivateNetwork: string;
  contentType: string;
  contentLength: string;
  requestBodySize: number | null;
  secFetchHeaders: Record<string, string>;
  userAgent: string;
  responseStatus: number;
  workerResponseHeaders: Record<string, string>;
}

const MAX_RECENT_REQUEST_LOGS = 15;
const recentRequestLogs: HeaderDiagnosticSnapshot[] = [];

function recordRecentSnapshot(entry: HeaderDiagnosticSnapshot): void {
  recentRequestLogs.unshift(entry);
  if (recentRequestLogs.length > MAX_RECENT_REQUEST_LOGS) {
    recentRequestLogs.length = MAX_RECENT_REQUEST_LOGS;
  }
}

function detectDeviceHint(userAgent: string): "Mobile" | "Desktop" | "CLI/Other" {
  if (!userAgent) return "CLI/Other";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return "Mobile";
  if (/Mozilla|Chrome|Safari|Firefox|Edg/i.test(userAgent)) return "Desktop";
  return "CLI/Other";
}

function extractSecFetchHeaders(request: Request): Record<string, string> {
  const secFetch: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith("sec-fetch-")) {
      secFetch[key] = value;
    }
  });
  return secFetch;
}

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
  accessControlRequestMethod: string;
  accessControlRequestHeaders: string;
  accessControlRequestPrivateNetwork: string;
  contentType: string;
  secFetchHeaders: Record<string, string>;
  userAgent: string;
  deviceHint: "Mobile" | "Desktop" | "CLI/Other";
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

  // Allow configured GitHub Pages origin (plus localhost/127.0.0.1/[::1] dev origins)
  const isLocalDevOrigin =
    /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(requestOrigin);
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

  const accessControlRequestMethod =
    request.headers.get("Access-Control-Request-Method") || "(none)";
  const accessControlRequestHeaders =
    request.headers.get("Access-Control-Request-Headers") || "(none)";
  const accessControlRequestPrivateNetwork =
    request.headers.get("Access-Control-Request-Private-Network") || "(none)";
  const contentType = request.headers.get("Content-Type") || "(none)";
  const secFetchHeaders = extractSecFetchHeaders(request);
  const userAgent = request.headers.get("User-Agent") || "(none)";
  const deviceHint = detectDeviceHint(userAgent);

  // Diagnostic wildcard header allowance to isolate Desktop vs Mobile CORS preflight header rejections
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin, Access-Control-Request-Headers, Access-Control-Request-Method, Access-Control-Request-Private-Network",
  };

  if (accessControlRequestPrivateNetwork.toLowerCase() === "true") {
    headers["Access-Control-Allow-Private-Network"] = "true";
  }

  return {
    headers,
    requestOrigin: rawOriginHeader || "(none)",
    allowedOrigin: allowedList.join(", ") || DEFAULT_ALLOWED_ORIGIN,
    accessControlAllowOrigin: allowOrigin,
    isOriginAllowed: isExplicitlyAllowed,
    accessControlRequestMethod,
    accessControlRequestHeaders,
    accessControlRequestPrivateNetwork,
    contentType,
    secFetchHeaders,
    userAgent,
    deviceHint,
  };
}

function logWorkerExchange(params: {
  cors: ResolvedCors;
  requestUrl: string;
  pathname: string;
  requestMethod: string;
  contentLength: string;
  requestBodySize: number | null;
  requestReceivedTimestamp: string;
  requestCompletedTimestamp: string;
  stage: string;
  responseStatus: number;
  responseContentType: string;
  workerResponseHeaders: Record<string, string>;
  note?: string;
}): void {
  const { cors } = params;
  console.log("[Worker OCR Debug]", {
    deviceHint: cors.deviceHint,
    requestOrigin: cors.requestOrigin,
    allowedOrigin: cors.allowedOrigin,
    accessControlAllowOrigin: cors.accessControlAllowOrigin,
    isOriginAllowed: cors.isOriginAllowed,
    requestMethod: params.requestMethod,
    requestUrl: params.requestUrl,
    accessControlRequestMethod: cors.accessControlRequestMethod,
    accessControlRequestHeaders: cors.accessControlRequestHeaders,
    accessControlRequestPrivateNetwork: cors.accessControlRequestPrivateNetwork,
    requestContentType: cors.contentType,
    secFetchHeaders: cors.secFetchHeaders,
    contentLength: params.contentLength,
    requestBodySize: params.requestBodySize,
    userAgent: cors.userAgent,
    requestReceivedTimestamp: params.requestReceivedTimestamp,
    requestCompletedTimestamp: params.requestCompletedTimestamp,
    stage: params.stage,
    responseStatus: params.responseStatus,
    responseContentType: params.responseContentType || "(none)",
    workerResponseHeaders: params.workerResponseHeaders,
    ...(params.note ? { note: params.note } : {}),
  });

  recordRecentSnapshot({
    timestamp: params.requestReceivedTimestamp,
    method: params.requestMethod,
    pathname: params.pathname,
    deviceHint: cors.deviceHint,
    origin: cors.requestOrigin,
    isOriginAllowed: cors.isOriginAllowed,
    allowedOrigin: cors.allowedOrigin,
    accessControlAllowOrigin: cors.accessControlAllowOrigin,
    accessControlRequestMethod: cors.accessControlRequestMethod,
    accessControlRequestHeaders: cors.accessControlRequestHeaders,
    accessControlRequestPrivateNetwork: cors.accessControlRequestPrivateNetwork,
    contentType: cors.contentType,
    contentLength: params.contentLength,
    requestBodySize: params.requestBodySize,
    secFetchHeaders: cors.secFetchHeaders,
    userAgent: cors.userAgent,
    responseStatus: params.responseStatus,
    workerResponseHeaders: params.workerResponseHeaders,
  });
}

function jsonResponse(
  payload: unknown,
  status: number,
  cors: ResolvedCors,
  requestMeta?: {
    url: string;
    pathname: string;
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
  const responseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    ...cors.headers,
  };

  if (requestMeta) {
    logWorkerExchange({
      cors,
      requestUrl: requestMeta.url,
      pathname: requestMeta.pathname,
      requestMethod: requestMeta.method,
      contentLength: requestMeta.contentLength,
      requestBodySize: requestMeta.requestBodySize,
      requestReceivedTimestamp: requestMeta.requestReceivedTimestamp,
      requestCompletedTimestamp,
      stage: requestMeta.stage,
      responseStatus: status,
      responseContentType: contentType,
      workerResponseHeaders: responseHeaders,
      note: requestMeta.note,
    });
  }
  const enrichedPayload =
    requestMeta && payload && typeof payload === "object"
      ? {
          ...(payload as Record<string, unknown>),
          requestHeadersSeen: {
            deviceHint: cors.deviceHint,
            origin: cors.requestOrigin,
            method: requestMeta.method,
            contentType: cors.contentType,
            accessControlRequestMethod: cors.accessControlRequestMethod,
            accessControlRequestHeaders: cors.accessControlRequestHeaders,
            accessControlRequestPrivateNetwork: cors.accessControlRequestPrivateNetwork,
            secFetchHeaders: cors.secFetchHeaders,
            contentLength: requestMeta.contentLength,
            requestBodySize: requestMeta.requestBodySize,
          },
          workerResponseHeaders: responseHeaders,
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
    headers: responseHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestReceivedTimestamp = new Date().toISOString();
    const contentLengthHeader = request.headers.get("content-length") || "(not sent)";
    let requestBodySize: number | null = null;
    let currentStage = "WORKER_RECEIVED";
    const parsedUrl = new URL(request.url);
    const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

    let cors: ResolvedCors = {
      headers: {
        "Access-Control-Allow-Origin": DEFAULT_ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "*",
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "no-store",
        Vary: "Origin, Access-Control-Request-Headers, Access-Control-Request-Method, Access-Control-Request-Private-Network",
      },
      requestOrigin: request.headers.get("Origin") || "(none)",
      allowedOrigin: DEFAULT_ALLOWED_ORIGIN,
      accessControlAllowOrigin: DEFAULT_ALLOWED_ORIGIN,
      isOriginAllowed: false,
      accessControlRequestMethod:
        request.headers.get("Access-Control-Request-Method") || "(none)",
      accessControlRequestHeaders:
        request.headers.get("Access-Control-Request-Headers") || "(none)",
      accessControlRequestPrivateNetwork:
        request.headers.get("Access-Control-Request-Private-Network") || "(none)",
      contentType: request.headers.get("Content-Type") || "(none)",
      secFetchHeaders: extractSecFetchHeaders(request),
      userAgent: request.headers.get("User-Agent") || "(none)",
      deviceHint: detectDeviceHint(request.headers.get("User-Agent") || ""),
    };

    const getMeta = (note?: string) => ({
      url: request.url,
      pathname,
      method: request.method,
      contentLength: contentLengthHeader,
      requestBodySize,
      requestReceivedTimestamp,
      stage: currentStage,
      note,
    });

    try {
      cors = resolveCorsHeaders(request, env);

      // Handle CORS preflight cleanly and log every OPTIONS preflight reaching the Worker
      if (request.method === "OPTIONS") {
        logWorkerExchange({
          cors,
          requestUrl: request.url,
          pathname,
          requestMethod: request.method,
          contentLength: contentLengthHeader,
          requestBodySize: 0,
          requestReceivedTimestamp,
          requestCompletedTimestamp: new Date().toISOString(),
          stage: currentStage,
          responseStatus: 204,
          responseContentType: "(preflight no-body)",
          workerResponseHeaders: cors.headers,
          note: "OPTIONS preflight",
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
              errorCategory: "client_error",
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

        const recentPreflights = recentRequestLogs.filter(
          (entry) => entry.method === "OPTIONS"
        );

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
            recentPreflights,
            recentRequests: recentRequestLogs,
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
              errorCategory: "client_error",
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
              errorCategory: "parsing_error",
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
          errorCategory: "client_error",
          workerErrorCode: "ROUTE_NOT_FOUND",
          geminiErrorCode: null,
          timeoutReason: null,
          failingStage: currentStage,
          httpStatus: 404,
          fallbackReason: `Route not found: ${request.method} ${parsedUrl.pathname}`,
          message: `API route not found: ${request.method} ${parsedUrl.pathname}`,
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
          errorCategory: "gemini_response_error",
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
