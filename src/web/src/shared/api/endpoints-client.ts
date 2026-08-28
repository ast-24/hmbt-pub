import { api, cmn, knowledge, models } from "@ast24/hmbt-v5-lib";

import {
  isHttpError,
  performBatchRequest,
  performStubRequest,
  USE_STUB_API,
} from "./client";
import {
  STUB_AUTH_USER_ME,
  STUB_CAFE_MENU,
  STUB_GLOBAL_MON_SKD,
  STUB_HOME_CLASS_ORIGINAL_TIMETABLE,
  STUB_ICAL_GRADE_FEEDS,
  STUB_ICAL_PERSONAL_FEEDS,
  STUB_PERSONAL_MON_SKD,
  STUB_PERSONAL_WEEKLY_TIMETABLE,
  STUB_USER_CONFIG,
  STUB_USER_IDENTIFIERS,
  STUB_USER_INFO,
  STUB_WEB_UI_CONFIG,
} from "./stub-data";

type ApiErrorPayload = api.endpoints.ApiEndpointError;

export type ApiResult<Res, Err extends ApiErrorPayload = ApiErrorPayload> =
  | {
      type: "success";
      data: Res;
    }
  | {
      type: "network_error";
      message: string;
    }
  | {
      type: "http_error";
      status: number;
      error: Err;
      message: string;
    }
  | {
      type: "no_auth_error";
      message: string;
    };

export type ApiErrorUIType =
  | "network_error"
  | "unauthorized"
  | "forbidden"
  | "validation_error"
  | "server_error";

export interface ApiErrorInfo {
  type: ApiErrorUIType;
  message: string;
  status?: number;
  code?: string;
  userMessage?: string;
  fieldErrors?: Partial<Record<string, string>>;
}

const NO_AUTH_MESSAGE = "認証情報がありません";

let inFlightAuthRefreshPromise: Promise<
  ApiResult<
    api.endpoints.ApiAuthRefreshPostRes,
    api.endpoints.ApiAuthRefreshPostErr
  >
> | null = null;

function defaultCodeByStatus(status: number): api.errors.CommonApiErrorCode {
  switch (status) {
    case 400:
      return api.errors.CommonApiErrorCode.InvalidRequest;
    case 401:
      return api.errors.CommonApiErrorCode.Unauthorized;
    case 403:
      return api.errors.CommonApiErrorCode.Forbidden;
    case 404:
      return api.errors.CommonApiErrorCode.ResourceNotFound;
    case 503:
      return api.errors.CommonApiErrorCode.ServiceUnavailable;
    default:
      return api.errors.CommonApiErrorCode.InternalServerError;
  }
}

function makeFallbackApiErrorBody(
  status: number,
  message: string,
): api.endpoints.ApiEndpointError<api.errors.CommonApiErrorCode> {
  return {
    code: defaultCodeByStatus(status),
    message,
    user_message: message,
  };
}

function makeNetworkError<Err extends ApiErrorPayload>(
  error: unknown,
  fallbackMessage: string,
): ApiResult<never, Err> {
  const message = error instanceof Error ? error.message : fallbackMessage;
  return { type: "network_error", message };
}

function makeHttpError<Err extends ApiErrorPayload>(
  status: number,
  error: Err,
): ApiResult<never, Err> {
  return {
    type: "http_error",
    status,
    error,
    message: error.user_message,
  };
}

function makeNoAuthError<Err extends ApiErrorPayload>(): ApiResult<never, Err> {
  return {
    type: "no_auth_error",
    message: NO_AUTH_MESSAGE,
  };
}

export function isNoAuthApiResult(
  result: ApiResult<unknown, ApiErrorPayload>,
): result is { type: "no_auth_error"; message: string } {
  return result.type === "no_auth_error";
}

function isHttpUnauthorized(
  result: ApiResult<unknown, ApiErrorPayload>,
): boolean {
  return result.type === "http_error" && result.status === 401;
}

function isHttpNoAccessToken(
  result: ApiResult<unknown, ApiErrorPayload>,
): boolean {
  return (
    result.type === "http_error" &&
    result.status === 401 &&
    result.error.code === api.errors.CommonApiErrorCode.NoAccessToken
  );
}

function makeApiError<Err extends ApiErrorPayload = ApiErrorPayload>(
  error: unknown,
  fallbackMessage: string,
): ApiResult<never, Err> {
  if (isHttpError(error)) {
    const body =
      (error.apiError as Err | undefined) ??
      (makeFallbackApiErrorBody(
        error.status,
        error.message || fallbackMessage,
      ) as Err);
    return makeHttpError(error.status, body);
  }

  return makeNetworkError<Err>(error, fallbackMessage);
}

async function performAndMapResult<
  Res,
  Err extends ApiErrorPayload = ApiErrorPayload,
>(
  request: () => Promise<Res>,
  fallbackMessage: string,
): Promise<ApiResult<Res, Err>> {
  try {
    const response = await request();
    return { type: "success", data: response };
  } catch (error) {
    return makeApiError<Err>(error, fallbackMessage);
  }
}

async function performAuthRefresh(): Promise<
  ApiResult<
    api.endpoints.ApiAuthRefreshPostRes,
    api.endpoints.ApiAuthRefreshPostErr
  >
> {
  return performAndMapResult<
    api.endpoints.ApiAuthRefreshPostRes,
    api.endpoints.ApiAuthRefreshPostErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.AuthRefreshPost
          ],
        pathParams: {},
        body: {},
        response: {},
      }),
    "認証情報の更新に失敗しました",
  );
}

async function performAuthRefreshSingleFlight(): Promise<
  ApiResult<
    api.endpoints.ApiAuthRefreshPostRes,
    api.endpoints.ApiAuthRefreshPostErr
  >
> {
  if (!inFlightAuthRefreshPromise) {
    inFlightAuthRefreshPromise = performAuthRefresh().finally(() => {
      inFlightAuthRefreshPromise = null;
    });
  }

  return inFlightAuthRefreshPromise;
}

async function executeWithRefresh<
  Res,
  Err extends ApiErrorPayload = ApiErrorPayload,
>(
  request: () => Promise<Res>,
  fallbackMessage: string,
): Promise<ApiResult<Res, Err>> {
  const firstResult = await performAndMapResult<Res, Err>(
    request,
    fallbackMessage,
  );
  if (!isHttpNoAccessToken(firstResult)) {
    return firstResult;
  }

  const refreshResult = await performAuthRefreshSingleFlight();
  if (isHttpUnauthorized(refreshResult) || isNoAuthApiResult(refreshResult)) {
    return makeNoAuthError<Err>();
  }
  if (refreshResult.type === "network_error") {
    return refreshResult;
  }
  if (refreshResult.type === "http_error") {
    return {
      type: "http_error",
      status: refreshResult.status,
      error: refreshResult.error as Err,
      message: refreshResult.message,
    };
  }

  const retriedResult = await performAndMapResult<Res, Err>(
    request,
    fallbackMessage,
  );
  if (isHttpNoAccessToken(retriedResult) || isNoAuthApiResult(retriedResult)) {
    return makeNoAuthError<Err>();
  }

  return retriedResult;
}

export type ApiBatchCall = {
  key: string;
  endpoint: api.endpoints.APIEndpointDef;
  pathParams: Record<string, string | number>;
  queryParams?: Record<string, string | number>;
  body?: unknown;
  fallbackMessage: string;
  stubCall: () => Promise<ApiResult<unknown, ApiErrorPayload>>;
};

export type ApiBatchResultMap = Map<
  string,
  ApiResult<unknown, ApiErrorPayload>
>;

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    "user_message" in value &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string" &&
    typeof (value as { user_message?: unknown }).user_message === "string"
  );
}

function normalizeBatchItemResult(
  status: number,
  body: unknown,
  fallbackMessage: string,
): ApiResult<unknown, ApiErrorPayload> {
  if (status >= 200 && status < 300) {
    return {
      type: "success",
      data: body === null ? {} : body,
    };
  }

  const errorBody = isApiErrorPayload(body)
    ? body
    : makeFallbackApiErrorBody(status, fallbackMessage);
  return makeHttpError(status, errorBody);
}

function hasAnyNoAccessTokenResult(results: ApiBatchResultMap): boolean {
  for (const value of results.values()) {
    if (isHttpNoAccessToken(value)) {
      return true;
    }
  }
  return false;
}

function replaceNoAccessTokenResults(
  results: ApiBatchResultMap,
  replacement: ApiResult<unknown, ApiErrorPayload>,
): ApiBatchResultMap {
  const replaced = new Map<string, ApiResult<unknown, ApiErrorPayload>>();
  results.forEach((result, key) => {
    if (isHttpNoAccessToken(result)) {
      replaced.set(key, replacement);
      return;
    }
    replaced.set(key, result);
  });
  return replaced;
}

async function executeBatchOnce(
  calls: ApiBatchCall[],
): Promise<ApiBatchResultMap> {
  if (USE_STUB_API) {
    const entries = await Promise.all(
      calls.map(async (call) => [call.key, await call.stubCall()] as const),
    );
    return new Map(entries);
  }

  const batchRequests = calls.map((call) => {
    return {
      key: call.key,
      method: call.endpoint.method,
      target: api.endpoints.buildRequestTarget(
        call.endpoint,
        call.pathParams,
        call.queryParams,
      ),
      body: call.body,
    } as const;
  });

  let responseItems: Awaited<ReturnType<typeof performBatchRequest>>;
  try {
    responseItems = await performBatchRequest(batchRequests);
  } catch (error) {
    const failed = new Map<string, ApiResult<unknown, ApiErrorPayload>>();
    calls.forEach((call) => {
      failed.set(call.key, makeApiError(error, call.fallbackMessage));
    });
    return failed;
  }

  const responseByKey = new Map<string, (typeof responseItems)[number]>();
  responseItems.forEach((item) => {
    responseByKey.set(item.key, item);
  });

  const results = new Map<string, ApiResult<unknown, ApiErrorPayload>>();
  calls.forEach((call) => {
    const response = responseByKey.get(call.key);
    if (!response) {
      results.set(call.key, {
        type: "network_error",
        message: `${call.fallbackMessage} (batch response missing: ${call.key})`,
      });
      return;
    }

    const mapped = normalizeBatchItemResult(
      response.status,
      response.body,
      call.fallbackMessage,
    );
    results.set(call.key, mapped);
  });

  return results;
}

export async function executeBatchCalls(
  calls: ApiBatchCall[],
): Promise<ApiBatchResultMap> {
  const first = await executeBatchOnce(calls);
  if (!hasAnyNoAccessTokenResult(first)) {
    return first;
  }

  const refreshResult = await performAuthRefreshSingleFlight();
  if (isHttpUnauthorized(refreshResult) || isNoAuthApiResult(refreshResult)) {
    return replaceNoAccessTokenResults(first, makeNoAuthError());
  }

  if (refreshResult.type === "network_error") {
    return replaceNoAccessTokenResults(first, refreshResult);
  }

  if (refreshResult.type === "http_error") {
    return replaceNoAccessTokenResults(first, {
      type: "http_error",
      status: refreshResult.status,
      error: refreshResult.error,
      message: refreshResult.message,
    });
  }

  const retried = await executeBatchOnce(calls);
  return replaceNoAccessTokenResults(retried, makeNoAuthError());
}

export function pickBatchResult<
  Res,
  Err extends ApiErrorPayload = ApiErrorPayload,
>(
  results: ApiBatchResultMap,
  key: string,
  fallbackMessage: string,
): ApiResult<Res, Err> {
  const found = results.get(key);
  if (!found) {
    return {
      type: "network_error",
      message: `${fallbackMessage} (batch key not found: ${key})`,
    };
  }

  return found as ApiResult<Res, Err>;
}

export function handleApiError(
  result: ApiResult<unknown, ApiErrorPayload>,
): ApiErrorInfo | null {
  if (result.type === "success") {
    return null;
  }

  if (result.type === "no_auth_error") {
    return {
      type: "unauthorized",
      message: result.message,
      status: 401,
      code: api.errors.CommonApiErrorCode.Unauthorized,
      userMessage: result.message,
    };
  }

  if (result.type === "network_error") {
    return {
      type: "network_error",
      message: result.message,
      userMessage: result.message,
    };
  }

  const errorBody = result.error;

  if (
    errorBody.field_errors &&
    Object.keys(errorBody.field_errors).length > 0
  ) {
    return {
      type: "validation_error",
      message: errorBody.user_message,
      status: result.status,
      code: errorBody.code,
      userMessage: errorBody.user_message,
      fieldErrors: errorBody.field_errors,
    };
  }

  if (result.status === 401) {
    return {
      type: "unauthorized",
      message: errorBody.user_message,
      status: result.status,
      code: errorBody.code,
      userMessage: errorBody.user_message,
    };
  }

  if (result.status === 403) {
    return {
      type: "forbidden",
      message: errorBody.user_message,
      status: result.status,
      code: errorBody.code,
      userMessage: errorBody.user_message,
    };
  }

  return {
    type: "server_error",
    message: errorBody.user_message,
    status: result.status,
    code: errorBody.code,
    userMessage: errorBody.user_message,
    fieldErrors: errorBody.field_errors,
  };
}

export function isValidationApiError(
  error: ApiErrorInfo | null,
): error is ApiErrorInfo & {
  type: "validation_error";
  fieldErrors: Partial<Record<string, string>>;
} {
  return error?.type === "validation_error" && !!error.fieldErrors;
}

export function shouldShowFatalErrorPage(error: ApiErrorInfo | null): boolean {
  if (!error) {
    return false;
  }
  if (error.type === "network_error" || error.type === "validation_error") {
    return false;
  }
  if (error.type === "unauthorized" || error.type === "forbidden") {
    return false;
  }

  return (error.status ?? 500) >= 500;
}

export function buildFatalErrorPageHref(error: ApiErrorInfo): string {
  const params = new URLSearchParams();
  if (error.status) {
    params.set("status", String(error.status));
  }
  if (error.code) {
    params.set("code", error.code);
  }
  params.set("message", error.userMessage ?? error.message);

  if (typeof window !== "undefined") {
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (!window.location.pathname.startsWith("/fatal-error")) {
      params.set("from", currentPath);
    }
  }

  return `/fatal-error?${params.toString()}`;
}

function makeDatePath(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  return {
    // API parses path dates as UTC, so build path params in UTC as well.
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function replaceMapData<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  source.forEach((value, key) => {
    target.set(key, value);
  });
}

function cloneStubPersonalIcalFeed(
  feed: api.endpoints.ApiUsersUserIdIcalPersonalFeedsGetRes["feeds"][number],
): api.endpoints.ApiUsersUserIdIcalPersonalFeedsGetRes["feeds"][number] {
  return {
    ...feed,
    last_generated_at: feed.last_generated_at
      ? new Date(feed.last_generated_at)
      : null,
    created_at: new Date(feed.created_at),
    updated_at: new Date(feed.updated_at),
  };
}

function cloneStubGradeIcalFeed(
  feed: api.endpoints.ApiUsersUserIdIcalGradeFeedsGetRes["feeds"][number],
): api.endpoints.ApiUsersUserIdIcalGradeFeedsGetRes["feeds"][number] {
  return {
    ...feed,
    last_generated_at: feed.last_generated_at
      ? new Date(feed.last_generated_at)
      : null,
    created_at: new Date(feed.created_at),
    updated_at: new Date(feed.updated_at),
  };
}

function nextStubIcalFeedId(): number {
  const personalMax = STUB_ICAL_PERSONAL_FEEDS.reduce(
    (max, feed) => Math.max(max, feed.id),
    0,
  );
  const gradeMax = STUB_ICAL_GRADE_FEEDS.reduce(
    (max, feed) => Math.max(max, feed.id),
    0,
  );
  return Math.max(personalMax, gradeMax) + 1;
}

const STUB_GRADE_ICAL_FEED_SUBSCRIBERS = new Map<number, Set<string>>();

function ensureStubGradeFeedSubscribers(feedId: number): Set<string> {
  const subscribers = STUB_GRADE_ICAL_FEED_SUBSCRIBERS.get(feedId);
  if (subscribers) {
    return subscribers;
  }

  const next = new Set<string>();
  STUB_GRADE_ICAL_FEED_SUBSCRIBERS.set(feedId, next);
  return next;
}

function seedStubGradeFeedSubscriptions(userId: string): void {
  STUB_ICAL_GRADE_FEEDS.forEach((feed) => {
    const subscribers = ensureStubGradeFeedSubscribers(feed.id);
    if (subscribers.size === 0) {
      subscribers.add(userId);
    }
  });
}

function subscribeStubGradeFeed(feedId: number, userId: string): void {
  ensureStubGradeFeedSubscribers(feedId).add(userId);
}

function unsubscribeStubGradeFeed(feedId: number, userId: string): void {
  ensureStubGradeFeedSubscribers(feedId).delete(userId);
}

function isStubGradeFeedSubscribed(feedId: number, userId: string): boolean {
  return ensureStubGradeFeedSubscribers(feedId).has(userId);
}

function matchesIdentifierSpec(
  identifier: api.endpoints.ApiAuthUserIdentitiesGetRes["identifiers"][number],
  spec: api.endpoints.ApiAuthUserIdentitiesPostReq["identifier_spec"],
): boolean {
  if (identifier.type !== spec.type) {
    return false;
  }

  switch (spec.type) {
    case "legacy":
      return identifier.type === "legacy" && identifier.email === spec.email;
    case "google_oidc":
      return identifier.type === "google_oidc" && identifier.sub === spec.sub;
    case "line_oidc":
      return identifier.type === "line_oidc" && identifier.sub === spec.sub;
  }
}

function recomputeStubVerifiedAsStudent(): boolean {
  return STUB_USER_IDENTIFIERS.some((identifier) => {
    switch (identifier.type) {
      case "legacy":
        return knowledge.STUDENT_EMAIL_REGEX.test(identifier.email);
      case "google_oidc":
        return (
          identifier.email_verified_as_owner &&
          identifier.email.mapOr(false, (email) =>
            knowledge.STUDENT_EMAIL_REGEX.test(email),
          )
        );
      case "line_oidc":
        return identifier.verified_as_student_in_v4;
    }
  });
}

function syncStubAuthStatus(): void {
  STUB_AUTH_USER_ME.is_verified_as_student = recomputeStubVerifiedAsStudent();
}

export async function apiPostAuthUserLegacyStart(
  req: api.endpoints.ApiAuthUserLegacyStartPostReq,
  isLinking = false,
): Promise<
  ApiResult<
    api.endpoints.ApiAuthUserLegacyStartPostRes,
    api.endpoints.ApiAuthUserLegacyStartPostErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiAuthUserLegacyStartPostRes,
    api.endpoints.ApiAuthUserLegacyStartPostErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.AuthUserLegacyStartPost
          ],
        pathParams: {},
        queryParams: { is_linking: isLinking ? 1 : 0 },
        body: req,
        response: {
          requires_registration: false,
        },
      }),
    "ログイン開始に失敗しました",
  );
}

export function buildAuthUserOidcGoogleStartUrl(isLinking = false): string {
  return api.endpoints.buildURL(
    api.endpoints.API_ENDPOINTS[
      api.endpoints.APIEndpoint.AuthUserOidcGoogleStartGet
    ],
    {},
    { is_linking: isLinking ? 1 : 0 },
  );
}

export function buildAuthUserOidcLineStartUrl(isLinking = false): string {
  return api.endpoints.buildURL(
    api.endpoints.API_ENDPOINTS[
      api.endpoints.APIEndpoint.AuthUserOidcLineStartGet
    ],
    {},
    { is_linking: isLinking ? 1 : 0 },
  );
}

export async function apiPostAuthUserLegacyRegister(
  req: api.endpoints.ApiAuthUserLegacyRegisterPostReq,
): Promise<
  ApiResult<
    api.endpoints.ApiAuthUserLegacyRegisterPostRes,
    api.endpoints.ApiAuthUserLegacyRegisterPostErr
  >
> {
  const result = await executeWithRefresh<
    api.endpoints.ApiAuthUserLegacyRegisterPostRes,
    api.endpoints.ApiAuthUserLegacyRegisterPostErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.AuthUserLegacyRegisterPost
          ],
        pathParams: {},
        body: req,
        response: {},
      }),
    "ユーザ登録に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  if (
    !STUB_USER_IDENTIFIERS.some(
      (identifier) =>
        identifier.type === "legacy" && identifier.email === req.email,
    )
  ) {
    STUB_USER_IDENTIFIERS.push({
      type: "legacy",
      email: req.email,
    });
  }
  syncStubAuthStatus();

  return result;
}

export async function apiDeleteAuthUserLogout(): Promise<
  ApiResult<
    api.endpoints.ApiAuthUserLogoutDeleteRes,
    api.endpoints.ApiAuthUserLogoutDeleteErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiAuthUserLogoutDeleteRes,
    api.endpoints.ApiAuthUserLogoutDeleteErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.AuthUserLogoutDelete
          ],
        pathParams: {},
        response: {},
      }),
    "ログアウトに失敗しました",
  );
}

export async function apiPostAuthRefresh(): Promise<
  ApiResult<
    api.endpoints.ApiAuthRefreshPostRes,
    api.endpoints.ApiAuthRefreshPostErr
  >
> {
  const result = await performAuthRefreshSingleFlight();
  if (isHttpUnauthorized(result)) {
    return makeNoAuthError<api.endpoints.ApiAuthRefreshPostErr>();
  }
  return result;
}

export async function apiGetAuthUserMe(): Promise<
  ApiResult<
    api.endpoints.ApiAuthUserMeGetRes,
    api.endpoints.ApiAuthUserMeGetErr
  >
> {
  syncStubAuthStatus();

  const requestAuthUserMe = () =>
    performStubRequest({
      endpoint:
        api.endpoints.API_ENDPOINTS[api.endpoints.APIEndpoint.AuthUserMeGet],
      pathParams: {},
      response: STUB_AUTH_USER_ME,
    });

  const firstResult = await executeWithRefresh<
    api.endpoints.ApiAuthUserMeGetRes,
    api.endpoints.ApiAuthUserMeGetErr
  >(requestAuthUserMe, "認証情報の取得に失敗しました");

  if (firstResult.type !== "success") {
    return firstResult;
  }

  if (!firstResult.data.has_session || firstResult.data.has_access_token) {
    return firstResult;
  }

  // セッションが残っていてアクセストークンだけ欠落している場合は
  // 即ログイン遷移せず、先にリフレッシュを試みる。
  const refreshResult = await performAuthRefreshSingleFlight();
  if (isHttpUnauthorized(refreshResult) || isNoAuthApiResult(refreshResult)) {
    return makeNoAuthError<api.endpoints.ApiAuthUserMeGetErr>();
  }
  if (refreshResult.type === "network_error") {
    return refreshResult;
  }
  if (refreshResult.type === "http_error") {
    return {
      type: "http_error",
      status: refreshResult.status,
      error: refreshResult.error as api.endpoints.ApiAuthUserMeGetErr,
      message: refreshResult.message,
    };
  }

  const retriedResult = await performAndMapResult<
    api.endpoints.ApiAuthUserMeGetRes,
    api.endpoints.ApiAuthUserMeGetErr
  >(requestAuthUserMe, "認証情報の取得に失敗しました");
  if (isHttpUnauthorized(retriedResult)) {
    return makeNoAuthError<api.endpoints.ApiAuthUserMeGetErr>();
  }

  return retriedResult;
}

export async function apiGetAuthUserIdentities(): Promise<
  ApiResult<
    api.endpoints.ApiAuthUserIdentitiesGetRes,
    api.endpoints.ApiAuthUserIdentitiesGetErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiAuthUserIdentitiesGetRes,
    api.endpoints.ApiAuthUserIdentitiesGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.AuthUserIdentitiesGet
          ],
        pathParams: {},
        response: {
          identifiers: STUB_USER_IDENTIFIERS,
        },
      }),
    "認証方式一覧の取得に失敗しました",
  );
}

export async function apiPostAuthUserIdentities(
  req: api.endpoints.ApiAuthUserIdentitiesPostReq,
): Promise<
  ApiResult<
    api.endpoints.ApiAuthUserIdentitiesPostRes,
    api.endpoints.ApiAuthUserIdentitiesPostErr
  >
> {
  const result = await executeWithRefresh<
    api.endpoints.ApiAuthUserIdentitiesPostRes,
    api.endpoints.ApiAuthUserIdentitiesPostErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.AuthUserIdentitiesPost
          ],
        pathParams: {},
        body: req,
        response: {},
      }),
    "認証方式の解除に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  const removeAt = STUB_USER_IDENTIFIERS.findIndex((identifier) =>
    matchesIdentifierSpec(identifier, req.identifier_spec),
  );
  if (removeAt >= 0) {
    STUB_USER_IDENTIFIERS.splice(removeAt, 1);
    syncStubAuthStatus();
  }

  return result;
}

export async function apiGetUsersUserId(
  userId: string,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdGetRes,
    api.endpoints.ApiUsersUserIdGetErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiUsersUserIdGetRes,
    api.endpoints.ApiUsersUserIdGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[api.endpoints.APIEndpoint.UsersUserIdGet],
        pathParams: { userId },
        response: {
          user_info: STUB_USER_INFO,
        },
      }),
    "ユーザ情報の取得に失敗しました",
  );
}

export async function apiPutUsersUserId(
  userId: string,
  req: api.endpoints.ApiUsersUserIdPutReq,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdPutRes,
    api.endpoints.ApiUsersUserIdPutErr
  >
> {
  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdPutRes,
    api.endpoints.ApiUsersUserIdPutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[api.endpoints.APIEndpoint.UsersUserIdPut],
        pathParams: { userId },
        body: req,
        response: {},
      }),
    "ユーザ情報の更新に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  STUB_USER_INFO.name = req.user_info.name;
  STUB_USER_INFO.grade = req.user_info.grade;
  STUB_USER_INFO.homeclass = req.user_info.homeclass;

  return result;
}

export async function apiGetUsersUserIdSettings(
  userId: string,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdSettingsGetRes,
    api.endpoints.ApiUsersUserIdSettingsGetErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiUsersUserIdSettingsGetRes,
    api.endpoints.ApiUsersUserIdSettingsGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdSettingsGet
          ],
        pathParams: { userId },
        response: {
          config: STUB_USER_CONFIG,
        },
      }),
    "ユーザ設定の取得に失敗しました",
  );
}

export async function apiPutUsersUserIdSettings(
  userId: string,
  req: api.endpoints.ApiUsersUserIdSettingsPutReq,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdSettingsPutRes,
    api.endpoints.ApiUsersUserIdSettingsPutErr
  >
> {
  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdSettingsPutRes,
    api.endpoints.ApiUsersUserIdSettingsPutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdSettingsPut
          ],
        pathParams: { userId },
        body: req,
        response: {},
      }),
    "ユーザ設定の更新に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  const current = STUB_USER_CONFIG as Record<string, unknown>;
  Object.keys(current).forEach((key) => {
    delete current[key];
  });
  Object.assign(current, req.config as Record<string, unknown>);

  return result;
}

export async function apiGetUsersUserIdSettingsWebUi(
  userId: string,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdSettingsWebUiGetRes,
    api.endpoints.ApiUsersUserIdSettingsWebUiGetErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiUsersUserIdSettingsWebUiGetRes,
    api.endpoints.ApiUsersUserIdSettingsWebUiGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdSettingsWebUiGet
          ],
        pathParams: { userId },
        response: {
          config: STUB_WEB_UI_CONFIG,
        },
      }),
    "Web UI設定の取得に失敗しました",
  );
}

export async function apiPutUsersUserIdSettingsWebUi(
  userId: string,
  req: api.endpoints.ApiUsersUserIdSettingsWebUiPutReq,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdSettingsWebUiPutRes,
    api.endpoints.ApiUsersUserIdSettingsWebUiPutErr
  >
> {
  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdSettingsWebUiPutRes,
    api.endpoints.ApiUsersUserIdSettingsWebUiPutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdSettingsWebUiPut
          ],
        pathParams: { userId },
        body: req,
        response: {},
      }),
    "Web UI設定の更新に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  STUB_WEB_UI_CONFIG.theme = req.config.theme;
  STUB_WEB_UI_CONFIG.widgets = req.config.widgets;

  return result;
}

export async function apiGetUsersUserIdTimetable(
  userId: string,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdTimetableGetRes,
    api.endpoints.ApiUsersUserIdTimetableGetErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiUsersUserIdTimetableGetRes,
    api.endpoints.ApiUsersUserIdTimetableGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdTimetableGet
          ],
        pathParams: { userId },
        response: {
          timetable: STUB_PERSONAL_WEEKLY_TIMETABLE,
        },
      }),
    "タイムテーブルの取得に失敗しました",
  );
}

export async function apiPutUsersUserIdTimetable(
  userId: string,
  req: api.endpoints.ApiUsersUserIdTimetablePutReq,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdTimetablePutRes,
    api.endpoints.ApiUsersUserIdTimetablePutErr
  >
> {
  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdTimetablePutRes,
    api.endpoints.ApiUsersUserIdTimetablePutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdTimetablePut
          ],
        pathParams: { userId },
        body: req,
        response: {},
      }),
    "個人時間割の更新に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  replaceMapData(STUB_PERSONAL_WEEKLY_TIMETABLE, req.timetable);
  return result;
}

export async function apiGetUsersUserIdSchedulesYearMonthDay(
  userId: string,
  date: Date,
  rangeDays: number,
  options: {
    maxPeriod?: number;
    includeSharedMemo?: boolean;
    includePersonalSessionMemo?: boolean;
    includePersonalDailyMemo?: boolean;
  } = {},
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayGetRes,
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayGetErr
  >
> {
  const { year, month, day } = makeDatePath(date);
  const safeRange = Math.max(
    1,
    Math.min(rangeDays, STUB_PERSONAL_MON_SKD.length),
  );
  const queryParams: Record<string, string | number> = {
    range_days: rangeDays,
  };

  if (Number.isInteger(options.maxPeriod)) {
    queryParams.max_period = Math.max(
      1,
      Math.min(Number(options.maxPeriod), 31),
    );
  }

  if (options.includeSharedMemo !== undefined) {
    queryParams.include_shared_memo = options.includeSharedMemo ? 1 : 0;
  }
  if (options.includePersonalSessionMemo !== undefined) {
    queryParams.include_personal_session_memo =
      options.includePersonalSessionMemo ? 1 : 0;
  }
  if (options.includePersonalDailyMemo !== undefined) {
    queryParams.include_personal_daily_memo = options.includePersonalDailyMemo
      ? 1
      : 0;
  }

  return executeWithRefresh<
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayGetRes,
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdSchedulesYearMonthDayGet
          ],
        pathParams: { userId, year, month, day },
        queryParams,
        response: {
          skd: STUB_PERSONAL_MON_SKD.slice(0, safeRange),
        },
      }),
    "スケジュール取得に失敗しました",
  );
}

export async function apiPutUsersUserIdSchedulesYearMonthDayPeriodMemoPersonal(
  userId: string,
  date: Date,
  period: number,
  memo: string | null,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPutRes,
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPutErr
  >
> {
  const { year, month, day } = makeDatePath(date);
  const req: api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPutReq =
    {
      memo,
    };

  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPutRes,
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint
              .UsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPut
          ],
        pathParams: { userId, year, month, day, period },
        body: req,
        response: {},
      }),
    "メモ更新に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  const sess = STUB_PERSONAL_MON_SKD[0]?.sess[period - 1];
  if (sess?.isSome()) {
    sess.unwrap().personal_memo = memo === null ? cmn.None() : cmn.Some(memo);
  }

  return result;
}

export async function apiPutUsersUserIdSchedulesYearMonthDayPeriodMemoShared(
  userId: string,
  date: Date,
  period: number,
  memo: string | null,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoSharedPutRes,
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoSharedPutErr
  >
> {
  const { year, month, day } = makeDatePath(date);
  const req: api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoSharedPutReq =
    {
      memo,
    };

  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoSharedPutRes,
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoSharedPutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint
              .UsersUserIdSchedulesYearMonthDayPeriodMemoSharedPut
          ],
        pathParams: { userId, year, month, day, period },
        body: req,
        response: {},
      }),
    "メモ更新に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  const sess = STUB_PERSONAL_MON_SKD[0]?.sess[period - 1];
  if (sess?.isSome()) {
    sess.unwrap().shared_memo = memo === null ? cmn.None() : cmn.Some(memo);
  }

  return result;
}

export async function apiPutUsersUserIdSchedulesYearMonthDayMemoPersonalDaily(
  userId: string,
  date: Date,
  memo: string | null,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyPutRes,
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyPutErr
  >
> {
  const { year, month, day } = makeDatePath(date);
  const req: api.endpoints.ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyPutReq =
    {
      memo,
    };

  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyPutRes,
    api.endpoints.ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyPutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint
              .UsersUserIdSchedulesYearMonthDayMemoPersonalDailyPut
          ],
        pathParams: { userId, year, month, day },
        body: req,
        response: {},
      }),
    "デイリーメモ更新に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  const dayData = STUB_PERSONAL_MON_SKD[0];
  if (dayData) {
    dayData.daily_memo = memo === null ? cmn.None() : cmn.Some(memo);
  }

  return result;
}

export async function apiGetUsersUserIdIcalPersonalFeeds(
  userId: string,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsGetRes,
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsGetErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsGetRes,
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdIcalPersonalFeedsGet
          ],
        pathParams: { userId },
        response: {
          feeds: STUB_ICAL_PERSONAL_FEEDS.map((feed) =>
            cloneStubPersonalIcalFeed(feed),
          ),
        },
      }),
    "個人iCalフィード一覧の取得に失敗しました",
  );
}

export async function apiPostUsersUserIdIcalPersonalFeeds(
  userId: string,
  req: api.endpoints.ApiUsersUserIdIcalPersonalFeedsPostReq,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsPostRes,
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsPostErr
  >
> {
  const now = new Date();
  const nextId = nextStubIcalFeedId();
  const token = `stub-personal-ical-${nextId}-${Date.now()}`;

  const stubFeed: api.endpoints.ApiUsersUserIdIcalPersonalFeedsPostRes["feed"] =
    {
      id: nextId,
      owner_user_id: userId,
      format_type: req.format_type,
      calendar_name: req.calendar_name,
      title_template: req.title_template,
      description_template: req.description_template,
      public_path: `personal-feeds/${token}.ics`,
      public_url: `https://${knowledge.HOSTNAMES.ICAL}/personal-feeds/${token}.ics`,
      is_enabled: req.is_enabled ?? true,
      last_generated_at: req.is_enabled === false ? null : now,
      generation_error: null,
      options: req.options ?? models.ical.DEFAULT_ICAL_FEED_OPTIONS,
      created_at: now,
      updated_at: now,
    };

  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsPostRes,
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsPostErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdIcalPersonalFeedsPost
          ],
        pathParams: { userId },
        body: req,
        response: {
          feed: cloneStubPersonalIcalFeed(stubFeed),
        },
      }),
    "個人iCalフィードの作成に失敗しました",
  );

  if (result.type !== "success") {
    return result;
  }

  STUB_ICAL_PERSONAL_FEEDS.unshift(cloneStubPersonalIcalFeed(stubFeed));
  return {
    ...result,
    data: {
      feed: cloneStubPersonalIcalFeed(stubFeed),
    },
  };
}

export async function apiPutUsersUserIdIcalPersonalFeedsFeedId(
  userId: string,
  feedId: number,
  req: api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdPutReq,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdPutRes,
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdPutErr
  >
> {
  const target =
    STUB_ICAL_PERSONAL_FEEDS.find((feed) => feed.id === feedId) ?? null;
  const now = new Date();

  const nextFeed = target
    ? {
        ...target,
        calendar_name: req.calendar_name,
        title_template: req.title_template,
        description_template: req.description_template,
        options: req.options ?? target.options,
        is_enabled: req.is_enabled,
        last_generated_at: req.is_enabled ? now : target.last_generated_at,
        generation_error: null,
        updated_at: now,
      }
    : null;

  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdPutRes,
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdPutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdIcalPersonalFeedsFeedIdPut
          ],
        pathParams: { userId, feedId },
        body: req,
        response: {
          feed: nextFeed ? cloneStubPersonalIcalFeed(nextFeed) : ({} as never),
        },
      }),
    "個人iCalフィードの更新に失敗しました",
  );

  if (result.type !== "success") {
    return result;
  }

  if (nextFeed) {
    const index = STUB_ICAL_PERSONAL_FEEDS.findIndex(
      (feed) => feed.id === feedId,
    );
    if (index >= 0) {
      STUB_ICAL_PERSONAL_FEEDS[index] = cloneStubPersonalIcalFeed(nextFeed);
    }
    return {
      ...result,
      data: {
        feed: cloneStubPersonalIcalFeed(nextFeed),
      },
    };
  }

  return result;
}

export async function apiDeleteUsersUserIdIcalPersonalFeedsFeedId(
  userId: string,
  feedId: number,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdDeleteRes,
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdDeleteErr
  >
> {
  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdDeleteRes,
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdDeleteErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdIcalPersonalFeedsFeedIdDelete
          ],
        pathParams: { userId, feedId },
        body: undefined,
        response: {},
      }),
    "個人iCalフィードの削除に失敗しました",
  );

  if (result.type !== "success") {
    return result;
  }

  const index = STUB_ICAL_PERSONAL_FEEDS.findIndex(
    (feed) => feed.id === feedId,
  );
  if (index >= 0) {
    STUB_ICAL_PERSONAL_FEEDS.splice(index, 1);
  }

  return result;
}

export async function apiPostUsersUserIdIcalPersonalFeedsFeedIdRegenerate(
  userId: string,
  feedId: number,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdRegeneratePostRes,
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdRegeneratePostErr
  >
> {
  const target =
    STUB_ICAL_PERSONAL_FEEDS.find((feed) => feed.id === feedId) ?? null;
  const now = new Date();
  const nextFeed = target
    ? {
        ...target,
        last_generated_at: now,
        generation_error: null,
        updated_at: now,
      }
    : null;

  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdRegeneratePostRes,
    api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdRegeneratePostErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint
              .UsersUserIdIcalPersonalFeedsFeedIdRegeneratePost
          ],
        pathParams: { userId, feedId },
        body: {},
        response: {
          feed: nextFeed ? cloneStubPersonalIcalFeed(nextFeed) : ({} as never),
        },
      }),
    "個人iCalフィードの再生成に失敗しました",
  );

  if (result.type !== "success") {
    return result;
  }

  if (nextFeed) {
    const index = STUB_ICAL_PERSONAL_FEEDS.findIndex(
      (feed) => feed.id === feedId,
    );
    if (index >= 0) {
      STUB_ICAL_PERSONAL_FEEDS[index] = cloneStubPersonalIcalFeed(nextFeed);
    }
    return {
      ...result,
      data: {
        feed: cloneStubPersonalIcalFeed(nextFeed),
      },
    };
  }

  return result;
}

export async function apiGetUsersUserIdIcalGradeFeeds(
  userId: string,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdIcalGradeFeedsGetRes,
    api.endpoints.ApiUsersUserIdIcalGradeFeedsGetErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiUsersUserIdIcalGradeFeedsGetRes,
    api.endpoints.ApiUsersUserIdIcalGradeFeedsGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsGet
          ],
        pathParams: { userId },
        response: {
          feeds: (() => {
            seedStubGradeFeedSubscriptions(userId);
            return STUB_ICAL_GRADE_FEEDS.filter((feed) =>
              isStubGradeFeedSubscribed(feed.id, userId),
            ).map((feed) => cloneStubGradeIcalFeed(feed));
          })(),
        },
      }),
    "学年共通iCalフィード一覧の取得に失敗しました",
  );
}

export async function apiPostUsersUserIdIcalGradeFeeds(
  userId: string,
  req: api.endpoints.ApiUsersUserIdIcalGradeFeedsPostReq,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdIcalGradeFeedsPostRes,
    api.endpoints.ApiUsersUserIdIcalGradeFeedsPostErr
  >
> {
  seedStubGradeFeedSubscriptions(userId);

  const existing = STUB_ICAL_GRADE_FEEDS.find(
    (feed) =>
      feed.target_grade === req.target_grade &&
      feed.format_type === req.format_type,
  );

  if (existing) {
    subscribeStubGradeFeed(existing.id, userId);
    return executeWithRefresh<
      api.endpoints.ApiUsersUserIdIcalGradeFeedsPostRes,
      api.endpoints.ApiUsersUserIdIcalGradeFeedsPostErr
    >(
      () =>
        performStubRequest({
          endpoint:
            api.endpoints.API_ENDPOINTS[
              api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsPost
            ],
          pathParams: { userId },
          body: req,
          response: {
            feed: cloneStubGradeIcalFeed(existing),
          },
        }),
      "学年共通iCalフィードの作成に失敗しました",
    );
  }

  const now = new Date();
  const nextId = nextStubIcalFeedId();
  const token = `stub-grade-ical-${nextId}-${Date.now()}`;

  const stubFeed: api.endpoints.ApiUsersUserIdIcalGradeFeedsPostRes["feed"] = {
    id: nextId,
    target_grade: req.target_grade,
    format_type: req.format_type,
    calendar_name: req.calendar_name,
    title_template: req.title_template,
    description_template: req.description_template,
    public_path: `grade-feeds/${token}.ics`,
    public_url: `https://${knowledge.HOSTNAMES.ICAL}/grade-feeds/${token}.ics`,
    is_enabled: req.is_enabled ?? true,
    last_generated_at: req.is_enabled === false ? null : now,
    generation_error: null,
    options: req.options ?? models.ical.DEFAULT_ICAL_FEED_OPTIONS,
    created_at: now,
    updated_at: now,
  };

  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdIcalGradeFeedsPostRes,
    api.endpoints.ApiUsersUserIdIcalGradeFeedsPostErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsPost
          ],
        pathParams: { userId },
        body: req,
        response: {
          feed: cloneStubGradeIcalFeed(stubFeed),
        },
      }),
    "学年共通iCalフィードの作成に失敗しました",
  );

  if (result.type !== "success") {
    return result;
  }

  STUB_ICAL_GRADE_FEEDS.unshift(cloneStubGradeIcalFeed(stubFeed));
  subscribeStubGradeFeed(stubFeed.id, userId);
  return {
    ...result,
    data: {
      feed: cloneStubGradeIcalFeed(stubFeed),
    },
  };
}

export async function apiPutUsersUserIdIcalGradeFeedsFeedId(
  userId: string,
  feedId: number,
  req: api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdPutReq,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdPutRes,
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdPutErr
  >
> {
  seedStubGradeFeedSubscriptions(userId);

  const target =
    STUB_ICAL_GRADE_FEEDS.find(
      (feed) =>
        feed.id === feedId && isStubGradeFeedSubscribed(feed.id, userId),
    ) ?? null;
  const now = new Date();

  const nextFeed = target
    ? {
        ...target,
        calendar_name: req.calendar_name,
        title_template: req.title_template,
        description_template: req.description_template,
        options: req.options ?? target.options,
        is_enabled: req.is_enabled,
        last_generated_at: req.is_enabled ? now : target.last_generated_at,
        generation_error: null,
        updated_at: now,
      }
    : null;

  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdPutRes,
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdPutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsFeedIdPut
          ],
        pathParams: { userId, feedId },
        body: req,
        response: {
          feed: nextFeed ? cloneStubGradeIcalFeed(nextFeed) : ({} as never),
        },
      }),
    "学年共通iCalフィードの更新に失敗しました",
  );

  if (result.type !== "success") {
    return result;
  }

  if (nextFeed) {
    const index = STUB_ICAL_GRADE_FEEDS.findIndex((feed) => feed.id === feedId);
    if (index >= 0) {
      STUB_ICAL_GRADE_FEEDS[index] = cloneStubGradeIcalFeed(nextFeed);
    }
    return {
      ...result,
      data: {
        feed: cloneStubGradeIcalFeed(nextFeed),
      },
    };
  }

  return result;
}

export async function apiDeleteUsersUserIdIcalGradeFeedsFeedId(
  userId: string,
  feedId: number,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdDeleteRes,
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdDeleteErr
  >
> {
  seedStubGradeFeedSubscriptions(userId);

  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdDeleteRes,
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdDeleteErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsFeedIdDelete
          ],
        pathParams: { userId, feedId },
        body: undefined,
        response: {},
      }),
    "学年共通iCalフィードの削除に失敗しました",
  );

  if (result.type !== "success") {
    return result;
  }

  unsubscribeStubGradeFeed(feedId, userId);

  return result;
}

export async function apiPostUsersUserIdIcalGradeFeedsFeedIdRegenerate(
  userId: string,
  feedId: number,
): Promise<
  ApiResult<
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdRegeneratePostRes,
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdRegeneratePostErr
  >
> {
  seedStubGradeFeedSubscriptions(userId);

  const target =
    STUB_ICAL_GRADE_FEEDS.find(
      (feed) =>
        feed.id === feedId && isStubGradeFeedSubscribed(feed.id, userId),
    ) ?? null;
  const now = new Date();
  const nextFeed = target
    ? {
        ...target,
        last_generated_at: now,
        generation_error: null,
        updated_at: now,
      }
    : null;

  const result = await executeWithRefresh<
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdRegeneratePostRes,
    api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdRegeneratePostErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint
              .UsersUserIdIcalGradeFeedsFeedIdRegeneratePost
          ],
        pathParams: { userId, feedId },
        body: {},
        response: {
          feed: nextFeed ? cloneStubGradeIcalFeed(nextFeed) : ({} as never),
        },
      }),
    "学年共通iCalフィードの再生成に失敗しました",
  );

  if (result.type !== "success") {
    return result;
  }

  if (nextFeed) {
    const index = STUB_ICAL_GRADE_FEEDS.findIndex((feed) => feed.id === feedId);
    if (index >= 0) {
      STUB_ICAL_GRADE_FEEDS[index] = cloneStubGradeIcalFeed(nextFeed);
    }
    return {
      ...result,
      data: {
        feed: cloneStubGradeIcalFeed(nextFeed),
      },
    };
  }

  return result;
}

export async function apiGetGradesGradeHomeClassesHomeClassNumTimetable(
  grade: number,
  homeClassNum: knowledge.HomeClassNum,
): Promise<
  ApiResult<
    api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetableGetRes,
    api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetableGetErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetableGetRes,
    api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetableGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint
              .GradesGradeHomeClassesHomeClassNumTimetableGet
          ],
        pathParams: { grade, homeClassNum },
        response: {
          timetable: STUB_HOME_CLASS_ORIGINAL_TIMETABLE,
        },
      }),
    "ホームクラスタイムテーブルの取得に失敗しました",
  );
}

export async function apiPutGradesGradeHomeClassesHomeClassNumTimetable(
  grade: number,
  homeClassNum: knowledge.HomeClassNum,
  req: api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetablePutReq,
): Promise<
  ApiResult<
    api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetablePutRes,
    api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetablePutErr
  >
> {
  const result = await executeWithRefresh<
    api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetablePutRes,
    api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetablePutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint
              .GradesGradeHomeClassesHomeClassNumTimetablePut
          ],
        pathParams: { grade, homeClassNum },
        body: req,
        response: {},
      }),
    "クラス時間割の更新に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  replaceMapData(STUB_HOME_CLASS_ORIGINAL_TIMETABLE, req.timetable);
  return result;
}

export async function apiGetGlobalLineBotUrl(): Promise<
  ApiResult<
    api.endpoints.ApiGlobalLineBotUrlGetRes,
    api.endpoints.ApiGlobalLineBotUrlGetErr
  >
> {
  return executeWithRefresh<
    api.endpoints.ApiGlobalLineBotUrlGetRes,
    api.endpoints.ApiGlobalLineBotUrlGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.GlobalLineBotUrlGet
          ],
        pathParams: {},
        response: {
          line_bot_url: `https://${knowledge.HOSTNAMES.LINE_BOT}`,
        },
      }),
    "LINE BOT URLの取得に失敗しました",
  );
}

export async function apiGetGlobalSchedulesYearMonth(
  year: number,
  month: number,
): Promise<
  ApiResult<
    api.endpoints.ApiGlobalSchedulesYearMonthGetRes,
    api.endpoints.ApiGlobalSchedulesYearMonthGetErr
  >
> {
  const totalDays = daysInMonth(year, month);

  return executeWithRefresh<
    api.endpoints.ApiGlobalSchedulesYearMonthGetRes,
    api.endpoints.ApiGlobalSchedulesYearMonthGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.GlobalSchedulesYearMonthGet
          ],
        pathParams: { year, month },
        response: {
          skd: STUB_GLOBAL_MON_SKD.slice(0, totalDays),
        },
      }),
    "共通月間予定表の取得に失敗しました",
  );
}

export async function apiPutGlobalSchedulesYearMonth(
  year: number,
  month: number,
  req: api.endpoints.ApiGlobalSchedulesYearMonthPutReq,
): Promise<
  ApiResult<
    api.endpoints.ApiGlobalSchedulesYearMonthPutRes,
    api.endpoints.ApiGlobalSchedulesYearMonthPutErr
  >
> {
  const result = await executeWithRefresh<
    api.endpoints.ApiGlobalSchedulesYearMonthPutRes,
    api.endpoints.ApiGlobalSchedulesYearMonthPutErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.GlobalSchedulesYearMonthPut
          ],
        pathParams: { year, month },
        body: req,
        response: {},
      }),
    "共通月間予定表の保存に失敗しました",
  );
  if (result.type !== "success") {
    return result;
  }

  const totalDays = daysInMonth(year, month);
  STUB_GLOBAL_MON_SKD.splice(
    0,
    STUB_GLOBAL_MON_SKD.length,
    ...req.skd.slice(0, totalDays),
  );

  return result;
}

export async function apiGetGlobalCafemenuYearMonthDay(
  date: Date,
  rangeDays: number,
): Promise<
  ApiResult<
    api.endpoints.ApiGlobalCafemenuYearMonthDayGetRes,
    api.endpoints.ApiGlobalCafemenuYearMonthDayGetErr
  >
> {
  const { year, month, day } = makeDatePath(date);
  const safeRange = Math.max(1, Math.min(rangeDays, STUB_CAFE_MENU.length));

  return executeWithRefresh<
    api.endpoints.ApiGlobalCafemenuYearMonthDayGetRes,
    api.endpoints.ApiGlobalCafemenuYearMonthDayGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.GlobalCafemenuYearMonthDayGet
          ],
        pathParams: { year, month, day },
        queryParams: { range_days: rangeDays },
        response: {
          cafe_menu: STUB_CAFE_MENU.slice(0, safeRange),
        },
      }),
    "カフェメニューの取得に失敗しました",
  );
}

export async function apiPostGlobalCafemenuYearMonthDayImage(
  date: Date,
  rangeDays: number,
  req: api.endpoints.ApiGlobalCafemenuYearMonthDayImagePostReq,
): Promise<
  ApiResult<
    api.endpoints.ApiGlobalCafemenuYearMonthDayImagePostRes,
    api.endpoints.ApiGlobalCafemenuYearMonthDayImagePostErr
  >
> {
  const { year, month, day } = makeDatePath(date);
  const clampedRange = Math.max(1, Math.min(rangeDays, 31));
  const safeRange = Math.min(clampedRange, STUB_CAFE_MENU.length);

  const result = await executeWithRefresh<
    api.endpoints.ApiGlobalCafemenuYearMonthDayImagePostRes,
    api.endpoints.ApiGlobalCafemenuYearMonthDayImagePostErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.GlobalCafemenuYearMonthDayImagePost
          ],
        pathParams: { year, month, day },
        queryParams: { range_days: rangeDays },
        body: req,
        response: {
          image_url: `https://example.invalid/cafemenu/${String(year)}${String(
            month,
          ).padStart(2, "0")}${String(day).padStart(2, "0")}-${Date.now()}.png`,
          preview_image_url: `https://example.invalid/cafemenu/${String(year)}${String(
            month,
          ).padStart(
            2,
            "0",
          )}${String(day).padStart(2, "0")}-${Date.now()}-preview.jpg`,
          range_days: clampedRange,
        },
      }),
    "カフェメニュー画像のアップロードに失敗しました",
  );

  if (result.type !== "success") {
    return result;
  }

  for (let index = 0; index < safeRange; index += 1) {
    const existing = STUB_CAFE_MENU[index];
    if (!existing) {
      break;
    }

    existing.menus_as_img_url = cmn.Some(result.data.image_url);
    existing.menus_as_img_preview_url = cmn.Some(result.data.preview_image_url);
  }

  return result;
}

export async function apiGetGlobalTrainTimetableTimetableIdYearMonthDay(
  timetableId: string,
  date: Date,
): Promise<
  ApiResult<
    api.endpoints.ApiGlobalTrainTimetableTimetableIdYearMonthDayGetRes,
    api.endpoints.ApiGlobalTrainTimetableTimetableIdYearMonthDayGetErr
  >
> {
  const { year, month, day } = makeDatePath(date);

  return executeWithRefresh<
    api.endpoints.ApiGlobalTrainTimetableTimetableIdYearMonthDayGetRes,
    api.endpoints.ApiGlobalTrainTimetableTimetableIdYearMonthDayGetErr
  >(
    () =>
      performStubRequest({
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.GlobalTrainTimetableTimetableIdYearMonthDayGet
          ],
        pathParams: { timetableId, year, month, day },
        response: {
          timetable: {},
        },
      }),
    "電車時刻表の取得に失敗しました",
  );
}
