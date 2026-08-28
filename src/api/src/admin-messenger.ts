import { knowledge, models } from "@ast24/hmbt-v5-lib";
import { type Context } from "hono";

import { loadRuntimeEnv } from "./env";

const DEFAULT_ADMIN_MESSENGER_URL = `https://${knowledge.HOSTNAMES.ADMIN_MESSENGER}`;

let cachedAdminMessengerUrl: string | null = null;

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveAdminMessengerUrl(): string {
  if (cachedAdminMessengerUrl) {
    return cachedAdminMessengerUrl;
  }

  try {
    const env = loadRuntimeEnv({ require_jwt_keys: false });
    const configured = trimToUndefined(env.admin_messenger_url);
    cachedAdminMessengerUrl = configured ?? DEFAULT_ADMIN_MESSENGER_URL;
  } catch {
    cachedAdminMessengerUrl = DEFAULT_ADMIN_MESSENGER_URL;
  }

  return cachedAdminMessengerUrl;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isPhysicalNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("connection")
  );
}

function resolveRoutePath(c: Context): string | undefined {
  const maybeRoutePath = (
    c.req as {
      routePath?: unknown;
    }
  ).routePath;

  return trimToUndefined(maybeRoutePath);
}

function buildRequestContext(
  c: Context,
): models.admin_messenger.AdminMessengerRequestContext {
  const requestId = trimToUndefined(c.req.header("x-request-id"));
  const traceId = trimToUndefined(c.req.header("x-amzn-trace-id"));

  return {
    method: c.req.method,
    path: c.req.path,
    route: resolveRoutePath(c),
    request_id: requestId,
    trace_id: traceId,
  };
}

type ReportApiErrorParams = {
  c: Context;
  summary: string;
  message: string;
  status?: number;
  code?: string;
  stack?: string;
  level?: models.admin_messenger.AdminMessengerLevel;
  context?: Record<string, unknown>;
};

export async function reportApiErrorToAdminMessenger(
  params: ReportApiErrorParams,
): Promise<void> {
  try {
    const response = await fetch(resolveAdminMessengerUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "api",
        service: "api",
        level: params.level ?? "error",
        summary: params.summary,
        message: params.message,
        timestamp_iso: new Date().toISOString(),
        status: params.status,
        code: params.code,
        stack: params.stack,
        environment: trimToUndefined(process.env.NODE_ENV),
        request: buildRequestContext(params.c),
        context: {
          ...(params.context ?? {}),
          error_message: params.message,
        },
      } satisfies models.admin_messenger.AdminMessengerErrorReport),
    });

    if (!response.ok) {
      console.error("Failed to post admin-messenger report", {
        status: response.status,
        body: await response.text(),
      });
    }
  } catch (error) {
    if (isPhysicalNetworkError(error)) {
      console.error(
        "Failed to send admin-messenger report due to network error",
        toErrorMessage(error),
      );
      return;
    }
    console.error(
      "Failed to send admin-messenger report",
      toErrorMessage(error),
    );
  }
}
