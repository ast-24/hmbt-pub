import { api, database, models } from "@ast24/hmbt-v5-lib";
import type { PoolConnection } from "../db";

import { APIError } from "../errors";
import { makeSqlOps } from "./sql";

function throwMappedScheduleError(error: unknown): never {
  if (error instanceof database.UserGradeHomeClassError) {
    if (error.issue === "user_not_found") {
      throw new APIError({
        status: 404,
        code: api.errors.UserDataErrorCode.UserNotFound,
        message: "User not found",
        user_message: "ユーザ情報が見つかりませんでした。",
      });
    }

    throw new APIError({
      status: 403,
      code: api.errors.UserDataErrorCode.UserProfileIncomplete,
      message: "User profile is incomplete",
      user_message:
        "プロフィールの学年またはクラスが未設定です。プロフィール設定を完了してください。",
    });
  }

  if (error instanceof database.SharedMemoTargetResolutionError) {
    switch (error.issue) {
      case "schedule_session_not_found":
        throw new APIError({
          status: 404,
          code: api.errors.SharedMemoResolutionErrorCode
            .ScheduleSessionNotFound,
          message: "Schedule session not found",
          user_message: "指定日の授業情報が見つかりませんでした。",
        });
      case "invalid_special_session_name":
        throw new APIError({
          status: 400,
          code: api.errors.SharedMemoResolutionErrorCode
            .InvalidSpecialSessionName,
          message: "Invalid special session name",
          user_message: "特別授業の識別情報が不正です。",
        });
      case "invalid_normal_session_position":
        throw new APIError({
          status: 400,
          code: api.errors.SharedMemoResolutionErrorCode
            .InvalidNormalSessionPosition,
          message: "Invalid normal session timetable position",
          user_message: "通常授業の時限情報が不正です。",
        });
      case "personal_session_not_found":
        throw new APIError({
          status: 400,
          code: api.errors.SharedMemoResolutionErrorCode
            .PersonalSessionNotFound,
          message: "No personal timetable session found for this slot",
          user_message:
            "この時限に対応する個人時間割が見つかりませんでした。時間割設定を確認してください。",
        });
    }
  }

  if (error instanceof database.DatabaseValueError) {
    switch (error.reason) {
      case "invalid_date_value":
        throw new APIError({
          status: 500,
          code: api.errors.InternalDataErrorCode.InvalidDateValue,
          message: "Invalid date value from database",
          user_message:
            "サーバ内部データの解析に失敗しました。時間を置いて再試行してください。",
        });
      case "invalid_time_string":
        throw new APIError({
          status: 500,
          code: api.errors.InternalDataErrorCode.InvalidTimeString,
          message: "Invalid time string from database",
          user_message:
            "サーバ内部データの解析に失敗しました。時間を置いて再試行してください。",
        });
      case "unsupported_time_value":
        throw new APIError({
          status: 500,
          code: api.errors.InternalDataErrorCode.UnsupportedTimeValue,
          message: "Unsupported time value from database",
          user_message:
            "サーバ内部データの解析に失敗しました。時間を置いて再試行してください。",
        });
    }
  }

  throw error;
}

export async function buildPersonalScheduleRange(
  userId: string,
  startDate: Date,
  rangeDays: number,
  options: database.BuildPersonalScheduleRangeOptions = {},
  connection?: PoolConnection,
): Promise<models.schedule.PersonalMonSkd> {
  try {
    return await database.buildPersonalScheduleRange(
      userId,
      startDate,
      rangeDays,
      makeSqlOps(connection),
      options,
    );
  } catch (error) {
    return throwMappedScheduleError(error);
  }
}

export async function getOriginalMonthlySchedule(
  year: number,
  month: number,
  connection?: PoolConnection,
): Promise<Array<models.schedule.OriginalMonSkdDay | null>> {
  try {
    return await database.getOriginalMonthlySchedule(
      year,
      month,
      makeSqlOps(connection),
    );
  } catch (error) {
    return throwMappedScheduleError(error);
  }
}

export async function putOriginalMonthlySchedule(
  year: number,
  month: number,
  skd: Array<models.schedule.OriginalMonSkdDay | null>,
  connection?: PoolConnection,
): Promise<void> {
  try {
    await database.putOriginalMonthlySchedule(
      year,
      month,
      skd,
      makeSqlOps(connection),
    );
  } catch (error) {
    throwMappedScheduleError(error);
  }
}

export async function putPersonalMemo(
  userId: string,
  date: Date,
  period: number,
  memo: string | null,
  connection?: PoolConnection,
): Promise<void> {
  try {
    await database.putPersonalMemo(
      userId,
      date,
      period,
      memo,
      makeSqlOps(connection),
    );
  } catch (error) {
    throwMappedScheduleError(error);
  }
}

export async function getPersonalDailyMemo(
  userId: string,
  date: Date,
  connection?: PoolConnection,
): Promise<string | null> {
  try {
    return await database.getPersonalDailyMemo(
      userId,
      date,
      makeSqlOps(connection),
    );
  } catch (error) {
    return throwMappedScheduleError(error);
  }
}

export async function putPersonalDailyMemo(
  userId: string,
  date: Date,
  memo: string | null,
  connection?: PoolConnection,
): Promise<void> {
  try {
    await database.putPersonalDailyMemo(
      userId,
      date,
      memo,
      makeSqlOps(connection),
    );
  } catch (error) {
    throwMappedScheduleError(error);
  }
}

export async function putSharedMemoForUser(
  userId: string,
  date: Date,
  period: number,
  memo: string | null,
  connection?: PoolConnection,
): Promise<void> {
  try {
    await database.putSharedMemoForUser(
      userId,
      date,
      period,
      memo,
      makeSqlOps(connection),
    );
  } catch (error) {
    throwMappedScheduleError(error);
  }
}
