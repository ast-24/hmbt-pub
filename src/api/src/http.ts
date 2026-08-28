import { api } from "@ast24/hmbt-v5-lib";
import { type Context } from "hono";

import { reportApiErrorToAdminMessenger } from "./admin-messenger";
import { APIError, isAPIError } from "./errors";
import { serializeForJson } from "./serde";

export function okJson(c: Context, data: unknown, status = 200): Response {
  return c.json(serializeForJson(data), status as 200);
}

export function noContent(c: Context): Response {
  return c.body(null, 204);
}

type APIErrorCompatOptions = {
  code?: string;
  user_message?: string;
  field_errors?: api.errors.ApiFieldErrorMap<string>;
};

export function badRequest(
  message: string,
  options?: APIErrorCompatOptions,
): never {
  throw new APIError(400, message, options);
}

export function unauthorized(
  message = "Unauthorized",
  options?: APIErrorCompatOptions,
): never {
  throw new APIError(401, message, options);
}

export function forbidden(
  message = "Forbidden",
  options?: APIErrorCompatOptions,
): never {
  throw new APIError(403, message, options);
}

export function notFound(
  message = "Not Found",
  options?: APIErrorCompatOptions,
): never {
  throw new APIError(404, message, options);
}

export function serviceUnavailable(
  message = "Service Unavailable",
  options?: APIErrorCompatOptions,
): never {
  throw new APIError(503, message, options);
}

function intoErrorBody(error: APIError): api.errors.ApiUnknownError {
  const body: api.errors.ApiUnknownError = {
    code: error.code,
    message: error.message,
    user_message: error.user_message,
  };

  if (error.field_errors && Object.keys(error.field_errors).length > 0) {
    body.field_errors = error.field_errors;
  }

  return body;
}

export async function toErrorResponse(
  c: Context,
  error: unknown,
): Promise<Response> {
  if (isAPIError(error)) {
    const apiError = error;
    if (apiError.status >= 500) {
      console.error("API returned 5xx error", {
        method: c.req.method,
        path: c.req.path,
        status: apiError.status,
        code: apiError.code,
        message: apiError.message,
      });
      await reportApiErrorToAdminMessenger({
        c,
        summary: `API ${c.req.method} ${c.req.path} returned ${apiError.status}`,
        message: apiError.message,
        status: apiError.status,
        code: apiError.code,
        level: "fatal",
        context: {
          server_message: apiError.message,
          user_message: apiError.user_message,
          field_errors: apiError.field_errors,
        },
      });
    }
    return c.json(intoErrorBody(apiError), apiError.status as 400);
  }

  const message =
    error instanceof Error ? error.message : "Internal Server Error";
  console.error("Unhandled API error", error);

  await reportApiErrorToAdminMessenger({
    c,
    summary: `Unhandled API error on ${c.req.method} ${c.req.path}`,
    message,
    status: 500,
    code: api.errors.CommonApiErrorCode.InternalServerError,
    stack: error instanceof Error ? error.stack : undefined,
    level: "fatal",
    context: {
      server_message: message,
      error_type:
        error && typeof error === "object" && "constructor" in error
          ? String(
              (error as { constructor?: { name?: unknown } }).constructor?.name,
            )
          : typeof error,
    },
  });

  const internalError = new APIError({
    status: 500,
    code: api.errors.CommonApiErrorCode.InternalServerError,
    message,
    user_message:
      "サーバで予期しないエラーが発生しました。時間を置いて再試行してください。",
  });
  return c.json(intoErrorBody(internalError), 500);
}
