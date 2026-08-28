import { UserConfig, UserConfigWebUI } from "../dto/user_config";
import { UserInfo } from "../dto/userinfo";
import { HOSTNAMES } from "../knowledge";
import { DailyCafeMenu } from "../models/cafemenu";
import { TrainTimetableHourMap } from "../models/train-timetable";
import {
  GradeIcalFeed,
  GradeIcalFeedFormatType,
  IcalFeedOptions,
  PersonalIcalFeed,
  PersonalIcalFeedFormatType,
} from "../models/ical";
import {
  OriginalMonSkdDay,
  OriginalWeeklyTimetable,
  PersonalMonSkd,
  PersonalWeeklyTimetable,
} from "../models/schedule";
import { User, UserIdentifier, UserIdentifierSpec } from "../models/user";
import type * as api_errors from "./errors";

export enum APIEndpoint {
  AuthUserLegacyStartPost = "AuthUserLegacyStartPost",
  AuthUserLegacyRegisterPost = "AuthUserLegacyRegisterPost",
  AuthUserOidcGoogleStartGet = "AuthUserOidcGoogleStartGet",
  AuthUserOidcGoogleCallbackGet = "AuthUserOidcGoogleCallbackGet",
  AuthUserOidcLineStartGet = "AuthUserOidcLineStartGet",
  AuthUserOidcLineCallbackGet = "AuthUserOidcLineCallbackGet",
  AuthUserLogoutDelete = "AuthUserLogoutDelete",
  AuthUserMeGet = "AuthUserMeGet",
  AuthUserIdentitiesGet = "AuthUserIdentitiesGet",
  AuthUserIdentitiesPost = "AuthUserIdentitiesPost",
  AuthRefreshPost = "AuthRefreshPost",
  UsersGet = "UsersGet",
  UsersUserIdGet = "UsersUserIdGet",
  UsersUserIdPut = "UsersUserIdPut",
  UsersUserIdSettingsGet = "UsersUserIdSettingsGet",
  UsersUserIdSettingsPut = "UsersUserIdSettingsPut",
  UsersUserIdSettingsWebUiGet = "UsersUserIdSettingsWebUiGet",
  UsersUserIdSettingsWebUiPut = "UsersUserIdSettingsWebUiPut",
  UsersUserIdTimetableGet = "UsersUserIdTimetableGet",
  UsersUserIdTimetablePut = "UsersUserIdTimetablePut",
  UsersUserIdSchedulesYearMonthDayGet = "UsersUserIdSchedulesYearMonthDayGet",
  UsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPut = "UsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPut",
  UsersUserIdSchedulesYearMonthDayPeriodMemoSharedPut = "UsersUserIdSchedulesYearMonthDayPeriodMemoSharedPut",
  UsersUserIdSchedulesYearMonthDayMemoPersonalDailyGet = "UsersUserIdSchedulesYearMonthDayMemoPersonalDailyGet",
  UsersUserIdSchedulesYearMonthDayMemoPersonalDailyPut = "UsersUserIdSchedulesYearMonthDayMemoPersonalDailyPut",
  UsersUserIdIcalPersonalFeedsGet = "UsersUserIdIcalPersonalFeedsGet",
  UsersUserIdIcalPersonalFeedsPost = "UsersUserIdIcalPersonalFeedsPost",
  UsersUserIdIcalPersonalFeedsFeedIdPut = "UsersUserIdIcalPersonalFeedsFeedIdPut",
  UsersUserIdIcalPersonalFeedsFeedIdDelete = "UsersUserIdIcalPersonalFeedsFeedIdDelete",
  UsersUserIdIcalPersonalFeedsFeedIdRegeneratePost = "UsersUserIdIcalPersonalFeedsFeedIdRegeneratePost",
  UsersUserIdIcalGradeFeedsGet = "UsersUserIdIcalGradeFeedsGet",
  UsersUserIdIcalGradeFeedsPost = "UsersUserIdIcalGradeFeedsPost",
  UsersUserIdIcalGradeFeedsFeedIdPut = "UsersUserIdIcalGradeFeedsFeedIdPut",
  UsersUserIdIcalGradeFeedsFeedIdDelete = "UsersUserIdIcalGradeFeedsFeedIdDelete",
  UsersUserIdIcalGradeFeedsFeedIdRegeneratePost = "UsersUserIdIcalGradeFeedsFeedIdRegeneratePost",
  GradesGradeHomeClassesHomeClassNumTimetableGet = "GradesGradeHomeClassesHomeClassNumTimetableGet",
  GradesGradeHomeClassesHomeClassNumTimetablePut = "GradesGradeHomeClassesHomeClassNumTimetablePut",
  GlobalSchedulesYearMonthGet = "GlobalSchedulesYearMonthGet",
  GlobalSchedulesYearMonthPut = "GlobalSchedulesYearMonthPut",
  GlobalCafemenuYearMonthDayGet = "GlobalCafemenuYearMonthDayGet",
  GlobalCafemenuYearMonthDayImagePost = "GlobalCafemenuYearMonthDayImagePost",
  GlobalTrainTimetableTimetableIdYearMonthDayGet = "GlobalTrainTimetableTimetableIdYearMonthDayGet",
  GlobalLineBotUrlGet = "GlobalLineBotUrlGet",
}

export type APIEndpointDef = {
  version: number;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string; // e.g. "/users/{userId}/schedules/{year}/{month}/{day}"
  query_params: string[]; // e.g. ["length"]
};

// NOTE: パスパラメータの{userId}は"me"を許容

export const API_ENDPOINTS = {
  [APIEndpoint.AuthUserLegacyStartPost]: {
    version: 1,
    method: "POST",
    path: "/auth/user/legacy/start",
    query_params: ["is_linking"],
  },
  [APIEndpoint.AuthUserLegacyRegisterPost]: {
    version: 1,
    method: "POST",
    path: "/auth/user/legacy/register",
    query_params: [],
  },
  [APIEndpoint.AuthUserOidcGoogleStartGet]: {
    version: 1,
    method: "GET",
    path: "/auth/user/oidc/google/start",
    query_params: ["is_linking"],
  },
  [APIEndpoint.AuthUserOidcGoogleCallbackGet]: {
    version: 1,
    method: "GET",
    path: "/auth/user/oidc/google/callback",
    query_params: [], // OIDC標準手順に従うため割愛
  },
  [APIEndpoint.AuthUserOidcLineStartGet]: {
    version: 1,
    method: "GET",
    path: "/auth/user/oidc/line/start",
    query_params: ["is_linking"],
  },
  [APIEndpoint.AuthUserOidcLineCallbackGet]: {
    version: 1,
    method: "GET",
    path: "/auth/user/oidc/line/callback",
    query_params: [], // OIDC標準手順に従うため割愛
  },
  [APIEndpoint.AuthUserLogoutDelete]: {
    version: 1,
    method: "DELETE",
    path: "/auth/user/logout",
    query_params: [],
  },
  [APIEndpoint.AuthUserMeGet]: {
    version: 1,
    method: "GET",
    path: "/auth/user/me",
    query_params: [],
  },
  [APIEndpoint.AuthUserIdentitiesGet]: {
    version: 1,
    method: "GET",
    path: "/auth/user/identities",
    query_params: [],
  },
  [APIEndpoint.AuthUserIdentitiesPost]: {
    version: 1,
    method: "POST",
    path: "/auth/user/identities",
    query_params: [],
  },
  [APIEndpoint.AuthRefreshPost]: {
    version: 1,
    method: "POST",
    path: "/auth/user/refresh",
    query_params: [],
  },
  [APIEndpoint.UsersGet]: {
    version: 1,
    method: "GET",
    path: "/users",
    query_params: ["line_sub"],
  },
  [APIEndpoint.UsersUserIdGet]: {
    version: 1,
    method: "GET",
    path: "/users/{userId}",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdPut]: {
    version: 1,
    method: "PUT",
    path: "/users/{userId}",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdSettingsGet]: {
    version: 1,
    method: "GET",
    path: "/users/{userId}/settings",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdSettingsPut]: {
    version: 1,
    method: "PUT",
    path: "/users/{userId}/settings",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdSettingsWebUiGet]: {
    version: 1,
    method: "GET",
    path: "/users/{userId}/settings/webui",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdSettingsWebUiPut]: {
    version: 1,
    method: "PUT",
    path: "/users/{userId}/settings/webui",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdTimetableGet]: {
    version: 1,
    method: "GET",
    path: "/users/{userId}/timetable",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdTimetablePut]: {
    version: 1,
    method: "PUT",
    path: "/users/{userId}/timetable",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdSchedulesYearMonthDayGet]: {
    version: 1,
    method: "GET",
    path: "/users/{userId}/schedules/{year}/{month}/{day}",
    query_params: [
      "range_days",
      "max_period",
      "include_shared_memo",
      "include_personal_memo",
      "include_personal_session_memo",
      "include_personal_daily_memo",
    ],
  },
  [APIEndpoint.UsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPut]: {
    version: 1,
    method: "PUT",
    path: "/users/{userId}/schedules/{year}/{month}/{day}/{period}/memo/personal",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdSchedulesYearMonthDayPeriodMemoSharedPut]: {
    version: 1,
    method: "PUT",
    path: "/users/{userId}/schedules/{year}/{month}/{day}/{period}/memo/shared",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdSchedulesYearMonthDayMemoPersonalDailyGet]: {
    version: 1,
    method: "GET",
    path: "/users/{userId}/schedules/{year}/{month}/{day}/memo/personal_daily",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdSchedulesYearMonthDayMemoPersonalDailyPut]: {
    version: 1,
    method: "PUT",
    path: "/users/{userId}/schedules/{year}/{month}/{day}/memo/personal_daily",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdIcalPersonalFeedsGet]: {
    version: 1,
    method: "GET",
    path: "/users/{userId}/ical/personal/feeds",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdIcalPersonalFeedsPost]: {
    version: 1,
    method: "POST",
    path: "/users/{userId}/ical/personal/feeds",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdIcalPersonalFeedsFeedIdPut]: {
    version: 1,
    method: "PUT",
    path: "/users/{userId}/ical/personal/feeds/{feedId}",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdIcalPersonalFeedsFeedIdDelete]: {
    version: 1,
    method: "DELETE",
    path: "/users/{userId}/ical/personal/feeds/{feedId}",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdIcalPersonalFeedsFeedIdRegeneratePost]: {
    version: 1,
    method: "POST",
    path: "/users/{userId}/ical/personal/feeds/{feedId}/regenerate",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdIcalGradeFeedsGet]: {
    version: 1,
    method: "GET",
    path: "/users/{userId}/ical/grade/feeds",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdIcalGradeFeedsPost]: {
    version: 1,
    method: "POST",
    path: "/users/{userId}/ical/grade/feeds",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdIcalGradeFeedsFeedIdPut]: {
    version: 1,
    method: "PUT",
    path: "/users/{userId}/ical/grade/feeds/{feedId}",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdIcalGradeFeedsFeedIdDelete]: {
    version: 1,
    method: "DELETE",
    path: "/users/{userId}/ical/grade/feeds/{feedId}",
    query_params: [],
  },
  [APIEndpoint.UsersUserIdIcalGradeFeedsFeedIdRegeneratePost]: {
    version: 1,
    method: "POST",
    path: "/users/{userId}/ical/grade/feeds/{feedId}/regenerate",
    query_params: [],
  },
  [APIEndpoint.GradesGradeHomeClassesHomeClassNumTimetableGet]: {
    version: 1,
    method: "GET",
    path: "/grades/{grade}/homeClasses/{homeClassNum}/timetable",
    query_params: [],
  },
  [APIEndpoint.GradesGradeHomeClassesHomeClassNumTimetablePut]: {
    version: 1,
    method: "PUT",
    path: "/grades/{grade}/homeClasses/{homeClassNum}/timetable",
    query_params: [],
  },
  [APIEndpoint.GlobalSchedulesYearMonthGet]: {
    version: 1,
    method: "GET",
    path: "/global/schedules/{year}/{month}",
    query_params: [],
  },
  [APIEndpoint.GlobalSchedulesYearMonthPut]: {
    version: 1,
    method: "PUT",
    path: "/global/schedules/{year}/{month}",
    query_params: [],
  },
  [APIEndpoint.GlobalCafemenuYearMonthDayGet]: {
    version: 1,
    method: "GET",
    path: "/global/cafemenu/{year}/{month}/{day}",
    query_params: ["range_days"],
  },
  [APIEndpoint.GlobalCafemenuYearMonthDayImagePost]: {
    version: 1,
    method: "POST",
    path: "/global/cafemenu/{year}/{month}/{day}/image",
    query_params: ["range_days"],
  },
  [APIEndpoint.GlobalTrainTimetableTimetableIdYearMonthDayGet]: {
    version: 1,
    method: "GET",
    path: "/global/train-timetable/{timetableId}/{year}/{month}/{day}",
    query_params: [],
  },
  [APIEndpoint.GlobalLineBotUrlGet]: {
    version: 1,
    method: "GET",
    path: "/global/line-bot/url",
    query_params: [],
  },
} as const satisfies Record<APIEndpoint, APIEndpointDef>;

export interface ApiAuthUserLegacyStartPostReq {
  email: string;
  password: string;
}

export interface ApiAuthUserLegacyStartPostRes {
  requires_registration: boolean;
}

export interface ApiAuthUserLegacyRegisterPostReq {
  email: string;
  password: string;
  otp: string;
}

export interface ApiAuthUserLegacyRegisterPostRes {}

// oidc系はajaxではないためIO型定義なし

export interface ApiAuthUserLogoutDeleteReq {}

export interface ApiAuthUserLogoutDeleteRes {}

export interface ApiAuthUserMeGetRes {
  has_session: boolean;
  has_access_token: boolean;
  is_verified_as_student: boolean;
}

export interface ApiAuthUserIdentitiesGetRes {
  identifiers: UserIdentifier[];
}

export interface ApiAuthUserIdentitiesPostReq {
  // 連携解除する認証方式を指定
  // ここからは連携することはできない
  identifier_spec: UserIdentifierSpec;
}

export interface ApiAuthUserIdentitiesPostRes {}

export interface ApiAuthRefreshPostReq {}

export interface ApiAuthRefreshPostRes {}

export interface ApiUsersGetRes {
  users: Array<{
    user_id: string;
  }>;
}

export interface ApiUsersUserIdGetRes {
  user_info: UserInfo;
}

export interface ApiUsersUserIdPutReq {
  user_info: UserInfo;
}

export interface ApiUsersUserIdPutRes {}

export interface ApiUsersUserIdSettingsGetRes {
  config: UserConfig | null;
}

export interface ApiUsersUserIdSettingsPutReq {
  config: UserConfig;
}

export interface ApiUsersUserIdSettingsPutRes {}

export interface ApiUsersUserIdSettingsWebUiGetRes {
  config: UserConfigWebUI | null;
}

export interface ApiUsersUserIdSettingsWebUiPutReq {
  config: UserConfigWebUI;
}

export interface ApiUsersUserIdSettingsWebUiPutRes {}

export interface ApiUsersUserIdTimetableGetRes {
  timetable: PersonalWeeklyTimetable | null;
}

export interface ApiUsersUserIdTimetablePutReq {
  timetable: PersonalWeeklyTimetable;
}

export interface ApiUsersUserIdTimetablePutRes {}

export interface ApiUsersUserIdSchedulesYearMonthDayGetRes {
  skd: PersonalMonSkd;
}

export interface ApiUsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPutReq {
  memo: string | null;
}

export interface ApiUsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPutRes {}

export interface ApiUsersUserIdSchedulesYearMonthDayPeriodMemoSharedPutReq {
  memo: string | null;
}

export interface ApiUsersUserIdSchedulesYearMonthDayPeriodMemoSharedPutRes {}

export interface ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyGetRes {
  memo: string | null;
}

export interface ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyPutReq {
  memo: string | null;
}

export interface ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyPutRes {}

export interface ApiUsersUserIdIcalPersonalFeedsGetRes {
  feeds: PersonalIcalFeed[];
}

export interface ApiUsersUserIdIcalPersonalFeedsPostReq {
  format_type: PersonalIcalFeedFormatType;
  calendar_name: string;
  title_template: string | null;
  description_template: string | null;
  options?: IcalFeedOptions;
  is_enabled?: boolean;
}

export interface ApiUsersUserIdIcalPersonalFeedsPostRes {
  feed: PersonalIcalFeed;
}

export interface ApiUsersUserIdIcalPersonalFeedsFeedIdPutReq {
  calendar_name: string;
  title_template: string | null;
  description_template: string | null;
  options?: IcalFeedOptions;
  is_enabled: boolean;
}

export interface ApiUsersUserIdIcalPersonalFeedsFeedIdPutRes {
  feed: PersonalIcalFeed;
}

export interface ApiUsersUserIdIcalPersonalFeedsFeedIdDeleteRes {}

export interface ApiUsersUserIdIcalPersonalFeedsFeedIdRegeneratePostRes {
  feed: PersonalIcalFeed;
}

export interface ApiUsersUserIdIcalGradeFeedsGetRes {
  feeds: GradeIcalFeed[];
}

export interface ApiUsersUserIdIcalGradeFeedsPostReq {
  target_grade: number;
  format_type: GradeIcalFeedFormatType;
  calendar_name: string;
  title_template: string | null;
  description_template: string | null;
  options?: IcalFeedOptions;
  is_enabled?: boolean;
}

export interface ApiUsersUserIdIcalGradeFeedsPostRes {
  feed: GradeIcalFeed;
}

export interface ApiUsersUserIdIcalGradeFeedsFeedIdPutReq {
  calendar_name: string;
  title_template: string | null;
  description_template: string | null;
  options?: IcalFeedOptions;
  is_enabled: boolean;
}

export interface ApiUsersUserIdIcalGradeFeedsFeedIdPutRes {
  feed: GradeIcalFeed;
}

export interface ApiUsersUserIdIcalGradeFeedsFeedIdDeleteRes {}

export interface ApiUsersUserIdIcalGradeFeedsFeedIdRegeneratePostRes {
  feed: GradeIcalFeed;
}

export interface ApiGradesGradeHomeClassesHomeClassNumTimetableGetRes {
  timetable: OriginalWeeklyTimetable | null;
}

export interface ApiGradesGradeHomeClassesHomeClassNumTimetablePutReq {
  timetable: OriginalWeeklyTimetable;
}

export interface ApiGradesGradeHomeClassesHomeClassNumTimetablePutRes {}

export interface ApiGlobalSchedulesYearMonthGetRes {
  skd: Array<OriginalMonSkdDay | null>;
}

export interface ApiGlobalSchedulesYearMonthPutReq {
  skd: Array<OriginalMonSkdDay | null>;
}

export interface ApiGlobalSchedulesYearMonthPutRes {}

export interface ApiGlobalCafemenuYearMonthDayGetRes {
  cafe_menu: DailyCafeMenu[];
}

export interface ApiGlobalCafemenuYearMonthDayImagePostReq {
  image_data_url: string;
}

export interface ApiGlobalCafemenuYearMonthDayImagePostRes {
  image_url: string;
  preview_image_url: string;
  range_days: number;
}

export interface ApiGlobalLineBotUrlGetRes {
  line_bot_url: string | null;
}

export interface ApiGlobalTrainTimetableTimetableIdYearMonthDayGetRes {
  timetable: TrainTimetableHourMap;
}

export type ApiEndpointError<
  Code extends string = string,
  Field extends string = string,
> = api_errors.ApiErrorBody<Code, Field>;

export type ApiCommonErr = ApiEndpointError<api_errors.CommonApiErrorCode>;

export type ApiAuthUserLegacyStartPostErr = ApiEndpointError<
  api_errors.ApiAuthUserLegacyStartErrorCode,
  "email" | "password"
>;

export type ApiAuthUserLegacyRegisterPostErr = ApiEndpointError<
  api_errors.ApiAuthUserLegacyRegisterErrorCode,
  "email" | "password" | "otp"
>;

export type ApiAuthUserOidcGoogleCallbackGetErr =
  ApiEndpointError<api_errors.ApiAuthUserOidcCallbackErrorCode>;

export type ApiAuthUserOidcLineCallbackGetErr =
  ApiEndpointError<api_errors.ApiAuthUserOidcCallbackErrorCode>;

export type ApiAuthUserLogoutDeleteErr = ApiCommonErr;

export type ApiAuthUserMeGetErr = ApiCommonErr;

export type ApiAuthRefreshPostErr = ApiCommonErr;

export type ApiAuthUserIdentitiesGetErr =
  ApiEndpointError<api_errors.ApiUserDataErrorCode>;

export type ApiAuthUserIdentitiesPostErr =
  ApiEndpointError<api_errors.ApiAuthUserIdentitiesPostErrorCode>;

export type ApiUsersGetErr = ApiCommonErr;

export type ApiUsersUserIdGetErr =
  ApiEndpointError<api_errors.ApiUserDataErrorCode>;

export type ApiUsersUserIdPutErr = ApiEndpointError<
  api_errors.ApiUsersUserIdPutErrorCode,
  "name" | "grade" | "homeclass"
>;

export type ApiUsersUserIdSettingsGetErr = ApiCommonErr;

export type ApiUsersUserIdSettingsPutErr = ApiCommonErr;

export type ApiUsersUserIdSettingsWebUiGetErr = ApiCommonErr;

export type ApiUsersUserIdSettingsWebUiPutErr = ApiCommonErr;

export type ApiUsersUserIdTimetableGetErr = ApiCommonErr;

export type ApiUsersUserIdTimetablePutErr =
  ApiEndpointError<api_errors.ApiUsersUserIdTimetableErrorCode>;

export type ApiUsersUserIdSchedulesYearMonthDayGetErr =
  ApiEndpointError<api_errors.ApiUsersUserIdSchedulesYearMonthDayGetErrorCode>;

export type ApiUsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPutErr =
  ApiCommonErr;

export type ApiUsersUserIdSchedulesYearMonthDayPeriodMemoSharedPutErr =
  ApiEndpointError<api_errors.ApiUsersUserIdScheduleMemoSharedErrorCode>;

export type ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyGetErr =
  ApiCommonErr;

export type ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyPutErr =
  ApiCommonErr;

export type ApiUsersUserIdIcalPersonalFeedsGetErr =
  ApiEndpointError<api_errors.ApiUsersUserIdIcalPersonalFeedErrorCode>;

export type ApiUsersUserIdIcalPersonalFeedsPostErr =
  ApiEndpointError<api_errors.ApiUsersUserIdIcalPersonalFeedErrorCode>;

export type ApiUsersUserIdIcalPersonalFeedsFeedIdPutErr =
  ApiEndpointError<api_errors.ApiUsersUserIdIcalPersonalFeedErrorCode>;

export type ApiUsersUserIdIcalPersonalFeedsFeedIdDeleteErr =
  ApiEndpointError<api_errors.ApiUsersUserIdIcalPersonalFeedErrorCode>;

export type ApiUsersUserIdIcalPersonalFeedsFeedIdRegeneratePostErr =
  ApiEndpointError<api_errors.ApiUsersUserIdIcalPersonalFeedErrorCode>;

export type ApiUsersUserIdIcalGradeFeedsGetErr =
  ApiEndpointError<api_errors.ApiUsersUserIdIcalGradeFeedErrorCode>;

export type ApiUsersUserIdIcalGradeFeedsPostErr =
  ApiEndpointError<api_errors.ApiUsersUserIdIcalGradeFeedErrorCode>;

export type ApiUsersUserIdIcalGradeFeedsFeedIdPutErr =
  ApiEndpointError<api_errors.ApiUsersUserIdIcalGradeFeedErrorCode>;

export type ApiUsersUserIdIcalGradeFeedsFeedIdDeleteErr =
  ApiEndpointError<api_errors.ApiUsersUserIdIcalGradeFeedErrorCode>;

export type ApiUsersUserIdIcalGradeFeedsFeedIdRegeneratePostErr =
  ApiEndpointError<api_errors.ApiUsersUserIdIcalGradeFeedErrorCode>;

export type ApiGradesGradeHomeClassesHomeClassNumTimetableGetErr =
  ApiEndpointError<api_errors.ApiGradesGradeHomeClassesHomeClassNumTimetableErrorCode>;

export type ApiGradesGradeHomeClassesHomeClassNumTimetablePutErr =
  ApiEndpointError<api_errors.ApiGradesGradeHomeClassesHomeClassNumTimetableErrorCode>;

export type ApiGlobalSchedulesYearMonthGetErr = ApiCommonErr;

export type ApiGlobalSchedulesYearMonthPutErr = ApiCommonErr;

export type ApiGlobalCafemenuYearMonthDayGetErr = ApiCommonErr;

export type ApiGlobalCafemenuYearMonthDayImagePostErr = ApiCommonErr;

export type ApiGlobalTrainTimetableTimetableIdYearMonthDayGetErr = ApiCommonErr;

export type ApiGlobalLineBotUrlGetErr = ApiCommonErr;

export function intoHonoPath(endpoint: APIEndpointDef): string {
  let path = endpoint.path;
  for (const param of endpoint.path.match(/{(\w+)}/g) || []) {
    const paramName = param.slice(1, -1);
    path = path.replace(param, `:${paramName}`);
  }
  return `/v${endpoint.version}${path}`;
}

// ※ 先頭に/を含んで返すため二重付加しないように注意
export function buildRequestTarget(
  endpoint: APIEndpointDef,
  pathParams: Record<string, string | number>,
  queryParams?: Record<string, string | number>,
): string {
  let url = endpoint.path;
  for (const param of endpoint.path.match(/{(\w+)}/g) || []) {
    const paramName = param.slice(1, -1);
    if (!(paramName in pathParams)) {
      throw new Error(`Missing path parameter: ${paramName}`);
    }
    url = url.replace(param, encodeURIComponent(String(pathParams[paramName])));
  }
  if (queryParams) {
    const queryString = Object.entries(queryParams)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      )
      .join("&");
    url += `?${queryString}`;
  }
  return url;
}

export function buildURL(
  endpoint: APIEndpointDef,
  pathParams: Record<string, string | number>,
  queryParams?: Record<string, string | number>,
): string {
  let protocol = "https";
  let hostname = HOSTNAMES.API;
  let requestTarget = buildRequestTarget(endpoint, pathParams, queryParams);
  return `${protocol}://${hostname}/v${endpoint.version}${requestTarget}`;
}
