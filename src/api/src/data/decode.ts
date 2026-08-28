import { api, database, dto, models } from "@ast24/hmbt-v5-lib";

import { APIError } from "../errors";

function mapTimetableDecodeError(error: unknown): never {
  if (error instanceof database.TimetableDecodeError) {
    switch (error.issue) {
      case "invalid_personal_session":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidPersonalSession,
          message: "Invalid personal timetable session",
          user_message: "個人時間割のコマ情報が不正です。",
        });
      case "invalid_personal_course":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidPersonalCourse,
          message: "Invalid personal timetable course",
          user_message: "個人時間割の科目情報が不正です。",
        });
      case "invalid_personal_room":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidPersonalRoom,
          message: "Invalid personal timetable room",
          user_message: "個人時間割の教室情報が不正です。",
        });
      case "invalid_class_session":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidClassSession,
          message: "Invalid class timetable session",
          user_message: "クラス時間割のコマ情報が不正です。",
        });
      case "invalid_class_session_type":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidClassSessionType,
          message: "Invalid class timetable session type",
          user_message: "クラス時間割の種別情報が不正です。",
        });
      case "invalid_class_course":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidClassCourse,
          message: "Invalid class timetable course",
          user_message: "クラス時間割の科目情報が不正です。",
        });
      case "invalid_class_selection_id":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidClassSelectionId,
          message: "Invalid class timetable selection id",
          user_message: "クラス時間割の選択IDが不正です。",
        });
      case "invalid_class_room_list":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidClassRoomList,
          message: "Invalid class timetable room list",
          user_message: "クラス時間割の教室一覧が不正です。",
        });
      case "invalid_weekday_key":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidWeekdayKey,
          message: "Invalid weekday key",
          user_message: "曜日キーが不正です。",
        });
      case "invalid_selection_key":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidSelectionKey,
          message: "Invalid selection key",
          user_message: "選択IDキーが不正です。",
        });
      case "invalid_period_list":
        throw new APIError({
          status: 400,
          code: api.errors.TimetableDecodeErrorCode.InvalidPeriodList,
          message: "Invalid period list",
          user_message: "時限データが不正です。",
        });
    }
  }

  throw error;
}

function mapMonthlyScheduleDecodeError(error: unknown): never {
  if (error instanceof database.MonthlyScheduleDecodeError) {
    throw new APIError({
      status: 400,
      code: api.errors.CommonApiErrorCode.InvalidRequest,
      message: "Invalid monthly schedule payload",
      user_message:
        "月間予定表データの形式が不正です。入力内容を確認して再試行してください。",
    });
  }

  throw error;
}

export function normalizeWebUiConfig(
  raw: unknown,
): dto.user_config.UserConfigWebUI {
  return database.normalizeWebUiConfig(raw);
}

export function decodePersonalWeeklyTimetableInput(
  raw: unknown,
): models.schedule.PersonalWeeklyTimetable {
  try {
    return database.decodePersonalWeeklyTimetableInput(raw);
  } catch (error) {
    return mapTimetableDecodeError(error);
  }
}

export function decodeOriginalWeeklyTimetableInput(
  raw: unknown,
): models.schedule.OriginalWeeklyTimetable {
  try {
    return database.decodeOriginalWeeklyTimetableInput(raw);
  } catch (error) {
    return mapTimetableDecodeError(error);
  }
}

export function decodeOriginalMonthlyScheduleInput(
  raw: unknown,
): Array<models.schedule.OriginalMonSkdDay | null> {
  try {
    return database.decodeOriginalMonthlyScheduleInput(raw);
  } catch (error) {
    return mapMonthlyScheduleDecodeError(error);
  }
}
