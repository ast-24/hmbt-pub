import { api, cmn, database } from "@ast24/hmbt-v5-lib";

import {
  requireAuthContext,
  requireVerifiedStudentAuthContext,
  resolveTargetUserId,
} from "../auth";
import * as data from "../data";
import { withTransaction } from "../db";
import { makeSqlOps } from "../data/sql";
import { APIError } from "../errors";
import { okJson } from "../http";
import { writeAuditLog } from "../audit-log";
import type { EndpointRegistrar } from "../server/endpoint-registrar";
import {
  parseBooleanQuery,
  parseDatePath,
  parsePeriod,
  parseRangeDays,
  readJsonBody,
  requireParam,
} from "./utils";

function parseOptionalMaxPeriod(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 31) {
    throw new APIError({
      status: 400,
      code: api.errors.CommonApiErrorCode.InvalidRequest,
      message: "max_period must be an integer in range 1..31",
      user_message: "max_period の指定が不正です。",
    });
  }

  return parsed;
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value instanceof cmn.Option) {
    return value.isSome() ? String(value.unwrap()) : null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && value !== null && "_value" in value) {
    const inner = (value as { _value: unknown })._value;
    if (inner === null || inner === undefined) {
      return null;
    }
    if (typeof inner === "string") {
      return inner;
    }
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function registerUserRoutes(register: EndpointRegistrar): void {
  register(api.endpoints.APIEndpoint.UsersGet, async (c) => {
    const auth = await requireAuthContext(c, true);
    if (auth.role !== "system") {
      throw new APIError({
        status: 403,
        code: api.errors.CommonApiErrorCode.Forbidden,
        message: "Only system role can access this endpoint",
        user_message: "このエンドポイントにはアクセスできません。",
      });
    }

    const lineSub = c.req.query("line_sub")?.trim();
    if (!lineSub) {
      throw new APIError({
        status: 400,
        code: api.errors.CommonApiErrorCode.InvalidRequest,
        message: "line_sub query parameter is required",
        user_message: "検索条件の指定が不正です。",
      });
    }

    const user = await database.getUserByLineSub(lineSub, makeSqlOps());

    return okJson(c, {
      users: user ? [{ user_id: user.id }] : [],
    } satisfies api.endpoints.ApiUsersGetRes);
  });

  register(api.endpoints.APIEndpoint.UsersUserIdGet, async (c) => {
    const auth = await requireAuthContext(c, false);
    const userId = resolveTargetUserId(auth, requireParam(c, "userId"));

    const userInfo = await database.getUserInfo(userId, makeSqlOps());
    if (!userInfo) {
      throw new APIError({
        status: 404,
        code: api.errors.UserDataErrorCode.UserNotFound,
        message: "User not found",
        user_message: "ユーザ情報が見つかりませんでした。",
      });
    }

    return okJson(c, {
      user_info: userInfo,
    } satisfies api.endpoints.ApiUsersUserIdGetRes);
  });

  register(api.endpoints.APIEndpoint.UsersUserIdPut, async (c) => {
    const auth = await requireAuthContext(c, false);
    const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
    const req = await readJsonBody<api.endpoints.ApiUsersUserIdPutReq>(c);
    const userInfoRaw = isPlainObject(req.user_info) ? req.user_info : null;

    if (!userInfoRaw) {
      throw new APIError({
        status: 400,
        code: api.errors.CommonApiErrorCode.InvalidRequest,
        message: "Invalid user_info payload",
        user_message: "入力内容に誤りがあります。",
      });
    }

    const fieldErrors: api.errors.ApiFieldErrorMap<
      "name" | "grade" | "homeclass"
    > = {};
    const name = parseOptionalString(userInfoRaw.name);
    if (name === undefined) {
      fieldErrors.name = "表示名の形式が不正です。";
    } else if (name !== null && name.trim().length > 64) {
      fieldErrors.name = "表示名は64文字以内で入力してください。";
    }

    const grade = userInfoRaw.grade;
    if (
      grade !== undefined &&
      grade !== null &&
      (!Number.isInteger(grade) || grade < 1 || grade > 3)
    ) {
      fieldErrors.grade = "学年は1から3の整数で指定してください。";
    }

    const homeclass = userInfoRaw.homeclass;
    if (
      homeclass !== undefined &&
      homeclass !== null &&
      (!Number.isInteger(homeclass) || homeclass < 1 || homeclass > 6)
    ) {
      fieldErrors.homeclass = "クラスは1から6の整数で指定してください。";
    }

    if (Object.keys(fieldErrors).length > 0) {
      const code = fieldErrors.name
        ? api.errors.UsersUserIdPutErrorCode.InvalidName
        : fieldErrors.grade
          ? api.errors.UsersUserIdPutErrorCode.InvalidGrade
          : api.errors.UsersUserIdPutErrorCode.InvalidHomeclass;

      throw new APIError({
        status: 400,
        code,
        message: "Invalid user profile payload",
        user_message: "入力内容に誤りがあります。",
        field_errors: fieldErrors,
      });
    }

    const normalizedUserInfo = {
      name:
        typeof name === "string" ? cmn.Some<string>(name) : cmn.None<string>(),
      grade: Number.isInteger(grade) ? grade : null,
      homeclass: Number.isInteger(homeclass) ? homeclass : null,
    };

    await database.updateUserInfo(userId, normalizedUserInfo, makeSqlOps());

    return okJson(c, {} satisfies api.endpoints.ApiUsersUserIdPutRes);
  });

  register(api.endpoints.APIEndpoint.UsersUserIdSettingsGet, async (c) => {
    const auth = await requireAuthContext(c, false);
    const userId = resolveTargetUserId(auth, requireParam(c, "userId"));

    const config = await database.getUserConfig(userId, makeSqlOps());

    return okJson(c, {
      config,
    } satisfies api.endpoints.ApiUsersUserIdSettingsGetRes);
  });

  register(api.endpoints.APIEndpoint.UsersUserIdSettingsPut, async (c) => {
    const auth = await requireAuthContext(c, false);
    const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
    const req =
      await readJsonBody<api.endpoints.ApiUsersUserIdSettingsPutReq>(c);

    if (!isPlainObject(req.config)) {
      throw new APIError({
        status: 400,
        code: api.errors.CommonApiErrorCode.InvalidRequest,
        message: "Invalid settings config payload",
        user_message: "設定データの形式が不正です。",
      });
    }

    await database.putUserConfig(userId, req.config, makeSqlOps());

    return okJson(c, {} satisfies api.endpoints.ApiUsersUserIdSettingsPutRes);
  });

  register(api.endpoints.APIEndpoint.UsersUserIdSettingsWebUiGet, async (c) => {
    const auth = await requireAuthContext(c, false);
    const userId = resolveTargetUserId(auth, requireParam(c, "userId"));

    const config = await database.getUserWebUiConfig(userId, makeSqlOps());

    return okJson(c, {
      config,
    } satisfies api.endpoints.ApiUsersUserIdSettingsWebUiGetRes);
  });

  register(api.endpoints.APIEndpoint.UsersUserIdSettingsWebUiPut, async (c) => {
    const auth = await requireAuthContext(c, false);
    const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
    const req =
      await readJsonBody<api.endpoints.ApiUsersUserIdSettingsWebUiPutReq>(c);

    const normalized = data.normalizeWebUiConfig(req.config);

    await database.putUserWebUiConfig(userId, normalized, makeSqlOps());

    return okJson(
      c,
      {} satisfies api.endpoints.ApiUsersUserIdSettingsWebUiPutRes,
    );
  });

  register(api.endpoints.APIEndpoint.UsersUserIdTimetableGet, async (c) => {
    const auth = await requireAuthContext(c, false);
    const userId = resolveTargetUserId(auth, requireParam(c, "userId"));

    const timetable = await database.getPersonalWeeklyTimetable(
      userId,
      makeSqlOps(),
    );

    return okJson(c, {
      timetable,
    } satisfies api.endpoints.ApiUsersUserIdTimetableGetRes);
  });

  register(api.endpoints.APIEndpoint.UsersUserIdTimetablePut, async (c) => {
    const auth = await requireAuthContext(c, false);
    const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
    const req =
      await readJsonBody<api.endpoints.ApiUsersUserIdTimetablePutReq>(c);

    const decoded = data.decodePersonalWeeklyTimetableInput(req.timetable);
    await withTransaction((tx) =>
      database.upsertPersonalWeeklyTimetable(userId, decoded, makeSqlOps(tx)),
    );

    return okJson(c, {} satisfies api.endpoints.ApiUsersUserIdTimetablePutRes);
  });

  register(
    api.endpoints.APIEndpoint.UsersUserIdSchedulesYearMonthDayGet,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));

      const date = parseDatePath(c);
      const rangeDays = parseRangeDays(c);
      const maxPeriod = parseOptionalMaxPeriod(c.req.query("max_period"));
      const includeSharedMemoRaw = c.req.query("include_shared_memo");
      const includePersonalSessionMemoRaw =
        c.req.query("include_personal_session_memo") ??
        c.req.query("include_personal_memo");
      const includePersonalDailyMemoRaw = c.req.query(
        "include_personal_daily_memo",
      );

      const includeSharedMemo =
        includeSharedMemoRaw === undefined
          ? true
          : parseBooleanQuery(includeSharedMemoRaw);
      const includePersonalSessionMemo =
        includePersonalSessionMemoRaw === undefined
          ? true
          : parseBooleanQuery(includePersonalSessionMemoRaw);
      const includePersonalDailyMemo =
        includePersonalDailyMemoRaw === undefined
          ? true
          : parseBooleanQuery(includePersonalDailyMemoRaw);

      const skd = await data.buildPersonalScheduleRange(
        userId,
        date,
        rangeDays,
        {
          max_period: maxPeriod,
          include_shared_memo: includeSharedMemo,
          include_personal_session_memo: includePersonalSessionMemo,
          include_personal_daily_memo: includePersonalDailyMemo,
        },
      );

      return okJson(c, {
        skd,
      } satisfies api.endpoints.ApiUsersUserIdSchedulesYearMonthDayGetRes);
    },
  );

  register(
    api.endpoints.APIEndpoint
      .UsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPut,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));

      const date = parseDatePath(c);
      const period = parsePeriod(c);
      const req =
        await readJsonBody<api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPutReq>(
          c,
        );

      if (req.memo !== null && typeof req.memo !== "string") {
        throw new APIError({
          status: 400,
          code: api.errors.CommonApiErrorCode.InvalidRequest,
          message: "Invalid personal memo payload",
          user_message: "メモの形式が不正です。",
        });
      }

      await data.putPersonalMemo(userId, date, period, req.memo);

      return okJson(
        c,
        {} satisfies api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoPersonalPutRes,
      );
    },
  );

  register(
    api.endpoints.APIEndpoint
      .UsersUserIdSchedulesYearMonthDayPeriodMemoSharedPut,
    async (c) => {
      const auth = await requireVerifiedStudentAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));

      const date = parseDatePath(c);
      const period = parsePeriod(c);
      const req =
        await readJsonBody<api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoSharedPutReq>(
          c,
        );

      if (req.memo !== null && typeof req.memo !== "string") {
        throw new APIError({
          status: 400,
          code: api.errors.CommonApiErrorCode.InvalidRequest,
          message: "Invalid shared memo payload",
          user_message: "メモの形式が不正です。",
        });
      }

      await data.putSharedMemoForUser(userId, date, period, req.memo);

      await writeAuditLog(
        c,
        "shared_memo_update",
        {
          user_id: userId,
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1,
          day: date.getUTCDate(),
          period,
          memo: req.memo,
        },
        auth,
      );

      return okJson(
        c,
        {} satisfies api.endpoints.ApiUsersUserIdSchedulesYearMonthDayPeriodMemoSharedPutRes,
      );
    },
  );

  register(
    api.endpoints.APIEndpoint
      .UsersUserIdSchedulesYearMonthDayMemoPersonalDailyGet,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
      const date = parseDatePath(c);

      const memo = await data.getPersonalDailyMemo(userId, date);

      return okJson(c, {
        memo,
      } satisfies api.endpoints.ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyGetRes);
    },
  );

  register(
    api.endpoints.APIEndpoint
      .UsersUserIdSchedulesYearMonthDayMemoPersonalDailyPut,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
      const date = parseDatePath(c);
      const req =
        await readJsonBody<api.endpoints.ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyPutReq>(
          c,
        );

      if (req.memo !== null && typeof req.memo !== "string") {
        throw new APIError({
          status: 400,
          code: api.errors.CommonApiErrorCode.InvalidRequest,
          message: "Invalid personal daily memo payload",
          user_message: "メモの形式が不正です。",
        });
      }

      await data.putPersonalDailyMemo(userId, date, req.memo);

      return okJson(
        c,
        {} satisfies api.endpoints.ApiUsersUserIdSchedulesYearMonthDayMemoPersonalDailyPutRes,
      );
    },
  );
}
