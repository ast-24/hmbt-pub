import { api, cmn, knowledge } from "@ast24/hmbt-v5-lib";

import {
  isPhysicalNetworkError,
  reportWebErrorToAdminMessenger,
  toErrorMessage,
} from "@/shared/admin-messenger";

// 環境変数から取得(しょっちゅうtrueのままpushしてしまうため)
export const USE_STUB_API = process.env.NEXT_PUBLIC_USE_STUB_API === "true";

const INFLIGHT_GET_REQUESTS = new Map<string, Promise<unknown>>();
const WEB_API_RETRY_COUNT = 2;

export class HttpError extends Error {
  public readonly status: number;

  public readonly apiError?: api.endpoints.ApiEndpointError;

  public constructor(
    status: number,
    message = `HTTP ${status}`,
    apiError?: api.endpoints.ApiEndpointError,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.apiError = apiError;
  }
}

export class UnauthorizedError extends HttpError {
  public constructor(
    message = "Unauthorized",
    apiError?: api.endpoints.ApiEndpointError,
  ) {
    super(401, message, apiError);
    this.name = "UnauthorizedError";
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

type StubRequestArgs<Req, Res> = {
  endpoint: api.endpoints.APIEndpointDef;
  pathParams: Record<string, string | number>;
  queryParams?: Record<string, string | number>;
  body?: Req;
  response: Res;
};

export type BatchRequestArgs = {
  key: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  target: string;
  body?: unknown;
};

export type BatchResponseItem = {
  key: string;
  status: number;
  body: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeForJson(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, item]) => [
      serializeForJson(key),
      serializeForJson(item),
    ]);
  }

  if (value instanceof cmn.Option) {
    if (value.isNone()) {
      return { _value: null };
    }
    return { _value: serializeForJson(value.unwrap()) };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeForJson(item));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, item]) => {
      result[key] = serializeForJson(item);
    });
    return result;
  }

  return value;
}

function isMapEntryList(value: unknown[]): value is Array<[unknown, unknown]> {
  return (
    value.length > 0 &&
    value.every((entry) => Array.isArray(entry) && entry.length === 2)
  );
}

const EMPTY_MAP_FIELD_KEYS = new Set([
  "timetable",
  "by_course",
  "by_name",
  "with_room",
]);

function shouldDeserializeAsMap(
  value: unknown[],
  parentKey: string | undefined,
): boolean {
  if (isMapEntryList(value)) {
    return true;
  }

  if (
    value.length === 0 &&
    parentKey !== undefined &&
    EMPTY_MAP_FIELD_KEYS.has(parentKey)
  ) {
    return true;
  }

  return false;
}

function deserializeFromJson(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    const decoded = value.map((item) => deserializeFromJson(item));
    if (shouldDeserializeAsMap(decoded, parentKey)) {
      return new Map(decoded as Array<[unknown, unknown]>);
    }
    return decoded;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "_value") {
      const inner = deserializeFromJson(value._value);
      return inner === null || inner === undefined
        ? cmn.None<unknown>()
        : cmn.Some(inner);
    }

    if (
      keys.length === 2 &&
      typeof value.h === "number" &&
      typeof value.m === "number"
    ) {
      return cmn.time.TimeOnly.new(value.h, value.m);
    }

    const result: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, item]) => {
      result[key] = deserializeFromJson(item, key);
    });
    return result;
  }

  if (
    typeof value === "string" &&
    parentKey !== undefined &&
    parentKey.endsWith("_at")
  ) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return value;
}

function toApiErrorPayload(
  value: unknown,
): api.endpoints.ApiEndpointError | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  if (
    typeof value.code !== "string" ||
    typeof value.message !== "string" ||
    typeof value.user_message !== "string"
  ) {
    return undefined;
  }

  const fieldErrors = value.field_errors;
  if (fieldErrors && !isPlainObject(fieldErrors)) {
    return {
      code: value.code,
      message: value.message,
      user_message: value.user_message,
    };
  }

  return {
    code: value.code,
    message: value.message,
    user_message: value.user_message,
    field_errors:
      fieldErrors && isPlainObject(fieldErrors)
        ? (fieldErrors as Partial<Record<string, string>>)
        : undefined,
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return JSON.parse(text) as unknown;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function shouldRetryHttpStatus(status: number): boolean {
  return status >= 500;
}

function shouldRetryApiError(error: unknown): boolean {
  if (error instanceof HttpError) {
    return shouldRetryHttpStatus(error.status);
  }

  return isPhysicalNetworkError(error);
}

async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= WEB_API_RETRY_COUNT || !shouldRetryApiError(error)) {
        throw error;
      }

      attempt += 1;
    }
  }
}

async function performRealRequest<Req, Res>(
  args: StubRequestArgs<Req, Res>,
): Promise<Res> {
  const url = api.endpoints.buildURL(
    args.endpoint,
    args.pathParams,
    args.queryParams,
  );
  const requestTarget = api.endpoints.buildRequestTarget(
    args.endpoint,
    args.pathParams,
    args.queryParams,
  );

  const hasBody = args.body !== undefined;
  const fetchAndDecode = async (attempt: number): Promise<Res> => {
    try {
      const body = hasBody
        ? JSON.stringify(serializeForJson(args.body))
        : undefined;
      const response = await fetch(url, {
        method: args.endpoint.method,
        credentials: "include",
        cache: "no-store",
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
        body,
      });

      const parsedBody = await parseResponseBody(response);

      if (!response.ok) {
        const apiError = toApiErrorPayload(parsedBody);
        const message =
          apiError?.user_message ??
          response.statusText ??
          `HTTP ${response.status}`;

        const shouldRetry = shouldRetryHttpStatus(response.status);
        const shouldReport = !shouldRetry || attempt >= WEB_API_RETRY_COUNT;
        if (shouldReport) {
          void reportWebErrorToAdminMessenger({
            summary: `Web API ${args.endpoint.method} ${requestTarget} returned ${response.status}`,
            message,
            status: response.status,
            code: apiError?.code,
            level: response.status >= 500 ? "fatal" : "error",
            context: {
              request_target: requestTarget,
              method: args.endpoint.method,
              url,
            },
          });
        }

        if (response.status === 401) {
          throw new UnauthorizedError(message, apiError);
        }
        throw new HttpError(response.status, message, apiError);
      }

      if (parsedBody === null) {
        return {} as Res;
      }

      return deserializeFromJson(parsedBody) as Res;
    } catch (error) {
      if (error instanceof HttpError || isPhysicalNetworkError(error)) {
        throw error;
      }

      void reportWebErrorToAdminMessenger({
        summary: `Web API request failed: ${args.endpoint.method} ${requestTarget}`,
        message: toErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
        level: "fatal",
        context: {
          request_target: requestTarget,
          method: args.endpoint.method,
          url,
        },
      });

      throw error;
    }
  };

  const shouldDedupeInFlight = args.endpoint.method === "GET" && !hasBody;
  if (!shouldDedupeInFlight) {
    return executeWithRetry(fetchAndDecode);
  }

  const requestKey = `${args.endpoint.method} ${url}`;
  const inFlight = INFLIGHT_GET_REQUESTS.get(requestKey);
  if (inFlight) {
    return inFlight as Promise<Res>;
  }

  const requestPromise = executeWithRetry(fetchAndDecode).finally(() => {
    INFLIGHT_GET_REQUESTS.delete(requestKey);
  });
  INFLIGHT_GET_REQUESTS.set(requestKey, requestPromise as Promise<unknown>);

  return requestPromise;
}

function parseBatchResponseItems(rawBody: unknown): BatchResponseItem[] {
  if (!isPlainObject(rawBody) || !Array.isArray(rawBody.results)) {
    throw new HttpError(502, "Batch API response format is invalid", {
      code: api.errors.CommonApiErrorCode.InternalServerError,
      message: "Invalid batch response payload",
      user_message: "サーバ応答の形式が不正です。",
    });
  }

  const items: BatchResponseItem[] = [];
  rawBody.results.forEach((rawItem, index) => {
    if (!isPlainObject(rawItem)) {
      return;
    }

    const key =
      typeof rawItem.key === "string" && rawItem.key.trim().length > 0
        ? rawItem.key.trim()
        : `item_${index}`;
    const status =
      typeof rawItem.status === "number" && Number.isInteger(rawItem.status)
        ? rawItem.status
        : 500;

    items.push({
      key,
      status,
      body: deserializeFromJson(rawItem.body),
    });
  });

  return items;
}

export async function performBatchRequest(
  requests: BatchRequestArgs[],
): Promise<BatchResponseItem[]> {
  if (USE_STUB_API) {
    throw new Error("Batch API is not available in stub mode");
  }

  const url = `https://${knowledge.HOSTNAMES.API}/v1/batch`;

  return executeWithRetry(async (attempt) => {
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: requests.map((request) => ({
            key: request.key,
            method: request.method,
            target: request.target,
            body:
              request.body === undefined
                ? undefined
                : serializeForJson(request.body),
          })),
        }),
      });

      const parsedBody = await parseResponseBody(response);
      if (!response.ok) {
        const apiError = toApiErrorPayload(parsedBody);
        const message =
          apiError?.user_message ??
          response.statusText ??
          `HTTP ${response.status}`;

        const shouldRetry = shouldRetryHttpStatus(response.status);
        const shouldReport = !shouldRetry || attempt >= WEB_API_RETRY_COUNT;
        if (shouldReport) {
          void reportWebErrorToAdminMessenger({
            summary: `Web API batch request failed with ${response.status}`,
            message,
            status: response.status,
            code: apiError?.code,
            level: response.status >= 500 ? "fatal" : "error",
            context: {
              request_count: requests.length,
              url,
            },
          });
        }

        if (response.status === 401) {
          throw new UnauthorizedError(message, apiError);
        }
        throw new HttpError(response.status, message, apiError);
      }

      return parseBatchResponseItems(parsedBody);
    } catch (error) {
      if (error instanceof HttpError || isPhysicalNetworkError(error)) {
        throw error;
      }

      void reportWebErrorToAdminMessenger({
        summary: "Web API batch request crashed",
        message: toErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
        level: "fatal",
        context: {
          request_count: requests.length,
          url,
        },
      });

      throw error;
    }
  });
}

export async function performStubRequest<Req, Res>(
  args: StubRequestArgs<Req, Res>,
): Promise<Res> {
  if (!USE_STUB_API) {
    return performRealRequest(args);
  }

  const requestTarget = api.endpoints.buildRequestTarget(
    args.endpoint,
    args.pathParams,
    args.queryParams,
  );

  // Keep body access so that request typing is exercised even in stub mode.
  void args.body;
  void requestTarget;

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 120);
  });

  return args.response;
}
