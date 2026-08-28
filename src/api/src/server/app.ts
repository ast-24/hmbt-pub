import { api } from "@ast24/hmbt-v5-lib";
import { Hono } from "hono";

import { toErrorResponse } from "../http";
import { registerAuthRoutes } from "../routes/auth";
import { registerGlobalRoutes } from "../routes/global";
import { registerGradesHomeClassRoutes } from "../routes/grades-home-classes";
import { registerIcalRoutes } from "../routes/ical";
import { registerUserRoutes } from "../routes/users";
import { createEndpointRegistrar } from "./endpoint-registrar";

type BatchRequestMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

type BatchRequestItem = {
  key: string;
  method: BatchRequestMethod;
  target: string;
  body?: unknown;
};

type BatchResponseItem = {
  key: string;
  status: number;
  body: unknown;
};

const BATCH_MAX_REQUESTS = 20;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBatchRequestMethod(value: unknown): value is BatchRequestMethod {
  return (
    value === "GET" ||
    value === "POST" ||
    value === "PUT" ||
    value === "DELETE" ||
    value === "PATCH"
  );
}

function makeBatchErrorBody(
  code: string,
  message: string,
  userMessage: string,
): api.endpoints.ApiEndpointError {
  return {
    code,
    message,
    user_message: userMessage,
  };
}

function parseBatchBody(raw: unknown): BatchRequestItem[] | null {
  if (!isPlainObject(raw) || !Array.isArray(raw.requests)) {
    return null;
  }

  const requests: BatchRequestItem[] = [];
  for (let i = 0; i < raw.requests.length; i += 1) {
    const item = raw.requests[i];
    if (!isPlainObject(item)) {
      return null;
    }

    const keyRaw = item.key;
    const methodRaw = item.method;
    const targetRaw = item.target;

    if (typeof keyRaw !== "string" || keyRaw.trim().length === 0) {
      return null;
    }

    if (!isBatchRequestMethod(methodRaw)) {
      return null;
    }

    if (typeof targetRaw !== "string" || targetRaw.length === 0) {
      return null;
    }

    requests.push({
      key: keyRaw.trim(),
      method: methodRaw,
      target: targetRaw,
      body: item.body,
    });
  }

  return requests;
}

function normalizeBatchPath(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  if (/^\/\/|:\/\//.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith("/v1/batch")) {
    return null;
  }

  return `/v1${trimmed}`;
}

function cloneBatchHeaders(rawHeaders: Headers): Headers {
  const headers = new Headers();
  rawHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "content-length" || lower === "content-type") {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

async function parseSubResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function dispatchBatchRequest(
  app: Hono,
  baseUrl: URL,
  baseHeaders: Headers,
  item: BatchRequestItem,
): Promise<BatchResponseItem> {
  const normalizedPath = normalizeBatchPath(item.target);
  if (!normalizedPath) {
    return {
      key: item.key,
      status: 400,
      body: makeBatchErrorBody(
        api.errors.CommonApiErrorCode.InvalidRequest,
        "Invalid batch request target",
        "batchリクエストのtargetが不正です。",
      ),
    };
  }

  try {
    const headers = new Headers(baseHeaders);
    let body: string | undefined;

    if (item.body !== undefined && item.method !== "GET") {
      headers.set("content-type", "application/json");
      body = JSON.stringify(item.body);
    }

    const request = new Request(new URL(normalizedPath, baseUrl), {
      method: item.method,
      headers,
      body,
    });

    const response = await app.request(request);
    const parsedBody = await parseSubResponseBody(response);

    return {
      key: item.key,
      status: response.status,
      body: parsedBody,
    };
  } catch (error) {
    console.error("Failed to dispatch batch subrequest", {
      key: item.key,
      method: item.method,
      target: item.target,
      error,
    });

    return {
      key: item.key,
      status: 500,
      body: makeBatchErrorBody(
        api.errors.CommonApiErrorCode.InternalServerError,
        error instanceof Error
          ? error.message
          : "Failed to dispatch batch subrequest",
        "バッチ実行中にサーバエラーが発生しました。",
      ),
    };
  }
}

export function createApp(): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    let caughtError: unknown = null;

    try {
      await next();
    } catch (error) {
      caughtError = error;
      throw error;
    } finally {
      const routePath = (
        c.req as {
          routePath?: unknown;
        }
      ).routePath;

      const requestId = c.req.header("x-request-id") ?? null;
      const forwardedFor = c.req.header("x-forwarded-for");
      const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? null;
      const url = new URL(c.req.url);
      const responseStatus = c.res?.status ?? (caughtError ? 500 : 0);
      const durationMs = Date.now() - startedAt;

      console.info("API request completed", {
        request: {
          method: c.req.method,
          path: c.req.path,
          route: typeof routePath === "string" ? routePath : null,
          request_id: requestId,
          ip_address: ipAddress,
          query_keys: Array.from(url.searchParams.keys()),
          content_type: c.req.header("content-type") ?? null,
          user_agent: c.req.header("user-agent") ?? null,
        },
        response: {
          status: responseStatus,
          content_type: c.res?.headers.get("content-type") ?? null,
          content_length: c.res?.headers.get("content-length") ?? null,
        },
        duration_ms: durationMs,
      });
    }
  });

  const register = createEndpointRegistrar(app);

  registerAuthRoutes(register);
  registerUserRoutes(register);
  registerIcalRoutes(register);
  registerGradesHomeClassRoutes(register);
  registerGlobalRoutes(register);

  app.post("/v1/batch", async (c) => {
    const rawBody = await c.req.json().catch(() => null);
    const requests = parseBatchBody(rawBody);

    if (
      !requests ||
      requests.length === 0 ||
      requests.length > BATCH_MAX_REQUESTS
    ) {
      return c.json(
        makeBatchErrorBody(
          api.errors.CommonApiErrorCode.InvalidRequest,
          "Invalid batch request payload",
          `batchリクエストは1件以上${BATCH_MAX_REQUESTS}件以下で指定してください。`,
        ),
        400,
      );
    }

    const baseUrl = new URL(c.req.url);
    const headers = cloneBatchHeaders(c.req.raw.headers);
    const results = await Promise.all(
      requests.map((item) => dispatchBatchRequest(app, baseUrl, headers, item)),
    );

    return c.json({ results }, 200);
  });

  app.options("*", (c) => c.body(null, 200));
  app.get("/healthz", (c) => c.json({ ok: true }, 200));
  app.onError(async (error, c) => await toErrorResponse(c, error));

  return app;
}
