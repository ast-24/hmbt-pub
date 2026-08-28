"use client";

import { api, cmn, dto, knowledge, models } from "@ast24/hmbt-v5-lib";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type ApiBatchCall,
  executeBatchCalls,
  apiGetGlobalCafemenuYearMonthDay,
  apiGetGlobalTrainTimetableTimetableIdYearMonthDay,
  apiGetGlobalSchedulesYearMonth,
  apiGetGradesGradeHomeClassesHomeClassNumTimetable,
  apiGetUsersUserIdSchedulesYearMonthDay,
  apiGetUsersUserIdSettingsWebUi,
  apiGetUsersUserIdTimetable,
  apiPutUsersUserIdSchedulesYearMonthDayMemoPersonalDaily,
  apiPutUsersUserIdSchedulesYearMonthDayPeriodMemoPersonal,
  apiPutUsersUserIdSchedulesYearMonthDayPeriodMemoShared,
  buildFatalErrorPageHref,
  handleApiError,
  isNoAuthApiResult,
  pickBatchResult,
  shouldShowFatalErrorPage,
  type ApiErrorInfo,
} from "@/shared/api/endpoints-client";
import { ErrorDialog } from "@/shared/components/error-dialog";
import { FormFieldLabel } from "@/shared/components/form-field-label";
import {
  resolveCourse,
  resolveCourseDisplayName,
  resolveCourseShortDisplayName,
  resolveCourseSubjectDisplayName,
  resolveRoom,
  resolveRoomDisplayName as lookupRoomDisplayName,
} from "@/shared/knowledge/safe-lookup";
import { normalizeWebUiConfig } from "@/shared/settings/web-ui-config";
import { applyThemeFromWebUiConfig } from "@/shared/theme/web-theme";

function dayLabel(offset: number, baseDate?: Date | null): string {
  const date = baseDate ? new Date(baseDate) : new Date();
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

type HomeWidgetListProps = {
  authUser: HomeAuthUser;
  onLoadingStateChange?: (isLoading: boolean) => void;
  onUiSettingsButtonVisibilityChange?: (isVisible: boolean) => void;
};

export type HomeAuthUser = {
  id: string;
  grade: number | null;
  homeclass: knowledge.HomeClassNum | null;
};

type HomeWidgetState = {
  config: dto.user_config.UserConfigWebUI | null;
  scheduleStartDate: Date | null;
  personalSchedule: models.schedule.PersonalMonSkd;
  personalTimetable: models.schedule.PersonalWeeklyTimetable;
  homeClassTimetable: models.schedule.OriginalWeeklyTimetable;
  cafeMenu: models.cafemenu.DailyCafeMenu[];
  trainTimetables: Map<
    knowledge.train_timetable.TrainTimetableID,
    models.train_timetable.TrainTimetableHourMap
  >;
};

type WidgetApiRequirements = {
  needPersonalSchedule: boolean;
  personalSchedulePastDays: number;
  personalScheduleRangeDays: number;
  includeSharedMemo: boolean;
  includePersonalSessionMemo: boolean;
  includePersonalDailyMemo: boolean;
  needPersonalTimetable: boolean;
  needHomeClassTimetable: boolean;
  needCafeMenu: boolean;
  cafeMenuRangeDays: number;
  needTrainTimetables: boolean;
  trainTimetableIds: knowledge.train_timetable.TrainTimetableID[];
};

type SessionMemoEditTarget = {
  dayIndex: number;
  periodIndex: number;
  title: string;
  personalMemo: string;
  sharedMemo: string;
};

type DailyMemoEditTarget = {
  dayIndex: number;
  title: string;
  memo: string;
};

const WIDGET_TITLE: Record<dto.web_home_widget.WebHomeWidgetType, string> = {
  [dto.web_home_widget.WebHomeWidgetType.PersonalSchedule]: "個人予定",
  [dto.web_home_widget.WebHomeWidgetType.PersonalTimetable]: "個人時間割",
  [dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable]:
    "クラス共通時間割",
  [dto.web_home_widget.WebHomeWidgetType.CafeMenu]: "カフェメニュー",
  [dto.web_home_widget.WebHomeWidgetType.NextTrain]: "次の電車",
};

function widgetDomId(type: dto.web_home_widget.WebHomeWidgetType): string {
  switch (type) {
    case dto.web_home_widget.WebHomeWidgetType.PersonalSchedule:
      return "widget-personal-schedule";
    case dto.web_home_widget.WebHomeWidgetType.PersonalTimetable:
      return "widget-personal-timetable";
    case dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable:
      return "widget-home-class-original-timetable";
    case dto.web_home_widget.WebHomeWidgetType.CafeMenu:
      return "widget-cafe-menu";
    case dto.web_home_widget.WebHomeWidgetType.NextTrain:
      return "widget-next-train";
  }
}

const DAY_LABEL_BY_WEEKDAY: Record<cmn.time.DayOfWeek, string> = {
  0: "日",
  1: "月",
  2: "火",
  3: "水",
  4: "木",
  5: "金",
  6: "土",
};

const REQUIRED_WEEKDAYS: cmn.time.DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
const HOME_WIDGET_FETCH_MAX_DAYS = 32;
const TIME_DISPLAY_ACCURACY_NOTE =
  "※短縮時程などの影響で、表示時刻が実際とずれる場合があります。";
const CALENDAR_WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type PersonalScheduleRequestOptions = {
  includeSharedMemo: boolean;
  includePersonalSessionMemo: boolean;
  includePersonalDailyMemo: boolean;
};

type PersonalScheduleRangeLoadResult =
  | {
      type: "success";
      schedule: models.schedule.PersonalMonSkd;
    }
  | {
      type: "no-auth";
    }
  | {
      type: "fatal";
      href: string;
    }
  | {
      type: "error";
      message: string;
    };

function todayAtMorning(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
}

function dateAtMorning(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    9,
    0,
    0,
    0,
  );
}

function dateFromCalendarParts(
  year: number,
  monthIndex: number,
  day: number,
): Date {
  return new Date(year, monthIndex, day, 9, 0, 0, 0);
}

function monthStartAtMorning(base: Date): Date {
  return dateFromCalendarParts(base.getFullYear(), base.getMonth(), 1);
}

function addMonthsAtMorning(base: Date, amount: number): Date {
  return dateFromCalendarParts(base.getFullYear(), base.getMonth() + amount, 1);
}

function daysInCalendarMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatCalendarMonth(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatDateYmd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

function isSameCalendarDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function diffCalendarDays(start: Date, end: Date): number {
  const startMs = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  ).getTime();
  const endMs = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
  ).getTime();
  return Math.trunc((endMs - startMs) / (24 * 60 * 60 * 1000));
}

function resolvePersonalScheduleRequestOptions(
  param: dto.web_home_widget.WebHomeWidgetParamPersonalSchedule,
): PersonalScheduleRequestOptions {
  let includeSharedMemo = false;
  let includePersonalSessionMemo = false;
  let includePersonalDailyMemo = false;

  asArray<dto.web_home_widget.WebHomeWidgetDailyItemWithParam>(
    param.daily_items,
  ).forEach((item) => {
    switch (item.type) {
      case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess:
      case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
        .MorningSess:
      case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
        .AfternoonSess:
        includeSharedMemo = true;
        includePersonalSessionMemo = true;
        break;

      case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
        .DailyMemo:
        includePersonalDailyMemo = true;
        break;

      default:
        break;
    }
  });

  return {
    includeSharedMemo,
    includePersonalSessionMemo,
    includePersonalDailyMemo,
  };
}

async function loadPersonalScheduleRange(
  userId: string,
  startDate: Date,
  rangeDays: number,
  options: PersonalScheduleRequestOptions,
): Promise<PersonalScheduleRangeLoadResult> {
  const result = await apiGetUsersUserIdSchedulesYearMonthDay(
    userId,
    startDate,
    rangeDays,
    options,
  );

  if (isNoAuthApiResult(result)) {
    return {
      type: "no-auth",
    };
  }

  const error = handleApiError(result);
  if (error || result.type !== "success") {
    if (error && shouldShowFatalErrorPage(error)) {
      return {
        type: "fatal",
        href: buildFatalErrorPageHref(error),
      };
    }

    return {
      type: "error",
      message: resolvePersonalScheduleLoadErrorMessage(
        result,
        error?.message ?? "個人予定の取得に失敗しました",
      ),
    };
  }

  return {
    type: "success",
    schedule: asArray<models.schedule.PersonalMonSkdDay | null>(
      result.data.skd,
    ),
  };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asMap<K, V>(value: unknown): Map<K, V> {
  return value instanceof Map ? (value as Map<K, V>) : new Map<K, V>();
}

function resolveRoomDisplayName(
  roomId: unknown,
  showFloor = false,
): string | null {
  const room = resolveRoom(roomId);
  if (!room) {
    return lookupRoomDisplayName(roomId, null);
  }

  if (!showFloor || typeof room.floor !== "number") {
    return room.displayName;
  }

  return `${room.displayName}(${room.floor}F)`;
}

function normalizeCafeImageUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("/")) {
    return `https://${knowledge.HOSTNAMES.CAFEMENU_IMAGE}${trimmed}`;
  }

  if (trimmed.startsWith(`${knowledge.HOSTNAMES.CAFEMENU_IMAGE}/`)) {
    return `https://${trimmed}`;
  }

  return /^\w[\w.-]*\.[a-z]{2,}\/./i.test(trimmed)
    ? `https://${trimmed}`
    : null;
}

function resolveRoomListDisplay(roomIds: unknown): string {
  const names = asArray<unknown>(roomIds)
    .map((roomId) => resolveRoomDisplayName(roomId))
    .filter((name): name is string => name !== null);
  return names.length > 0 ? `@${names.join("/")}` : "";
}

type NormalizedTimeOnly = {
  h: number;
  m: number;
};

type NormalizedTimeWindow = {
  start: NormalizedTimeOnly;
  end: NormalizedTimeOnly;
};

function normalizeTimeOnly(value: unknown): NormalizedTimeOnly | null {
  if (value instanceof cmn.time.TimeOnly) {
    return {
      h: value.h,
      m: value.m,
    };
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const raw = value as { h?: unknown; m?: unknown };
  if (typeof raw.h !== "number" || typeof raw.m !== "number") {
    return null;
  }

  if (!Number.isFinite(raw.h) || !Number.isFinite(raw.m)) {
    return null;
  }

  return {
    h: raw.h,
    m: raw.m,
  };
}

function normalizeTimeWindow(value: unknown): NormalizedTimeWindow | null {
  if (value instanceof cmn.time.TimeWindow) {
    return {
      start: {
        h: value.start.h,
        m: value.start.m,
      },
      end: {
        h: value.end.h,
        m: value.end.m,
      },
    };
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const raw = value as { start?: unknown; end?: unknown };
  const start = normalizeTimeOnly(raw.start);
  const end = normalizeTimeOnly(raw.end);
  if (start === null || end === null) {
    return null;
  }

  return {
    start,
    end,
  };
}

function resolveSessionTimeWindow(
  day: models.schedule.PersonalMonSkdDay,
  period: number,
): NormalizedTimeWindow | null {
  const windows = day.time_windows.mapOr<unknown[] | null>(null, (value) =>
    asArray<unknown>(value),
  );
  if (windows === null) {
    return null;
  }

  return normalizeTimeWindow(windows[period] ?? null);
}

function formatTimeOnly(time: NormalizedTimeOnly): string {
  return `${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}`;
}

function resolveDaySwitchOffset(daySwitchTime: unknown): number {
  const normalized = normalizeTimeOnly(daySwitchTime);
  if (!normalized) {
    return 0;
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const switchMinutes = normalized.h * 60 + normalized.m;
  return nowMinutes >= switchMinutes ? 1 : 0;
}

function resolveSessionTimeLabel(
  day: models.schedule.PersonalMonSkdDay,
  period: number,
  param: dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemParamSess,
): string | null {
  if (!param.show_time && !param.show_duration) {
    return null;
  }

  const window = resolveSessionTimeWindow(day, period);
  if (window === null) {
    return null;
  }

  const labels: string[] = [];

  if (param.show_time) {
    labels.push(
      `${formatTimeOnly(window.start)}-${formatTimeOnly(window.end)}`,
    );
  }

  if (param.show_duration) {
    const durationMinutes =
      window.end.h * 60 + window.end.m - (window.start.h * 60 + window.start.m);
    if (durationMinutes > 0) {
      labels.push(`${durationMinutes}分`);
    }
  }

  return labels.length > 0 ? labels.join(" / ") : null;
}

function resolveActualWeekdayForDayIndex(
  dayIndex: number,
  scheduleStartDate: Date | null,
): cmn.time.DayOfWeek {
  const date = scheduleStartDate ? new Date(scheduleStartDate) : new Date();
  date.setDate(date.getDate() + dayIndex);
  return date.getDay() as cmn.time.DayOfWeek;
}

function resolveActualTimetablePositionLabel(
  dayIndex: number,
  period: number,
  scheduleStartDate: Date | null,
): string {
  const weekday = resolveActualWeekdayForDayIndex(dayIndex, scheduleStartDate);
  return `${DAY_LABEL_BY_WEEKDAY[weekday]}${period + 1}`;
}

function isExpectedSelectionEmptyAtActualPosition(
  dayIndex: number,
  period: number,
  scheduleStartDate: Date | null,
  personalTimetable: models.schedule.CommonWeeklyTimetable,
  homeClassTimetable: models.schedule.OriginalWeeklyTimetable,
): boolean {
  const actualWeekday = resolveActualWeekdayForDayIndex(
    dayIndex,
    scheduleStartDate,
  );
  const classSess = homeClassTimetable.get(actualWeekday)?.[period];

  if (!classSess || classSess.type !== "select") {
    return false;
  }

  const resolved = personalTimetable.get(actualWeekday)?.[period];
  return !resolved || resolved.isNone();
}

function isSessionMismatchForHighlight(
  day: models.schedule.PersonalMonSkdDay,
  dayIndex: number,
  period: number,
  scheduleStartDate: Date | null,
  personalTimetable: models.schedule.CommonWeeklyTimetable,
  homeClassTimetable: models.schedule.OriginalWeeklyTimetable,
): boolean {
  const sess = day.sess[period];
  if (!sess || sess.isNone()) {
    // 選択科目未設定による「時間割通りの空きコマ」はミスマッチ扱いにしない。
    return !isExpectedSelectionEmptyAtActualPosition(
      dayIndex,
      period,
      scheduleStartDate,
      personalTimetable,
      homeClassTimetable,
    );
  }

  const value = sess.unwrap();
  if (value.course.type !== "normal") {
    return true;
  }

  const actualWeekday = resolveActualWeekdayForDayIndex(
    dayIndex,
    scheduleStartDate,
  );
  const actualPeriod = period + 1;

  return (
    value.course.timetable_position.dayofweek !== actualWeekday ||
    value.course.timetable_position.period !== actualPeriod
  );
}

function resolveBreakMinutesBetweenPeriods(
  day: models.schedule.PersonalMonSkdDay,
  previousPeriod: number,
  nextPeriod: number,
): number | null {
  const previousWindow = resolveSessionTimeWindow(day, previousPeriod);
  const nextWindow = resolveSessionTimeWindow(day, nextPeriod);

  if (!previousWindow || !nextWindow) {
    return null;
  }

  const previousEndMinutes = previousWindow.end.h * 60 + previousWindow.end.m;
  const nextStartMinutes = nextWindow.start.h * 60 + nextWindow.start.m;
  return nextStartMinutes - previousEndMinutes;
}

function shouldVisuallyMergePeriods(
  day: models.schedule.PersonalMonSkdDay,
  previousPeriod: number,
  nextPeriod: number,
): boolean {
  const previousSession = day.sess[previousPeriod];
  const nextSession = day.sess[nextPeriod];

  if (!previousSession || previousSession.isNone()) {
    return false;
  }
  if (!nextSession || nextSession.isNone()) {
    return false;
  }

  return (
    resolveBreakMinutesBetweenPeriods(day, previousPeriod, nextPeriod) === 0
  );
}

function groupSessionPeriodsByZeroBreak(
  day: models.schedule.PersonalMonSkdDay,
  periods: number[],
): number[][] {
  if (periods.length === 0) {
    return [];
  }

  const grouped: number[][] = [[periods[0]]];

  for (let index = 1; index < periods.length; index += 1) {
    const previousPeriod = periods[index - 1];
    const currentPeriod = periods[index];

    if (shouldVisuallyMergePeriods(day, previousPeriod, currentPeriod)) {
      grouped[grouped.length - 1].push(currentPeriod);
      continue;
    }

    grouped.push([currentPeriod]);
  }

  return grouped;
}

function isUnknownCourseName(name: string): boolean {
  return name.startsWith("不明");
}

function hasUnknownCourseInDay(
  day: models.schedule.PersonalMonSkdDay,
): boolean {
  return day.sess.some((sess) => {
    if (sess.isNone()) {
      return false;
    }

    const course = sess.unwrap().course;
    if (course.type === "normal") {
      return resolveCourse(course.id) === null;
    }

    return isUnknownCourseName(course.name);
  });
}

function isWeeklyTimetableConfigured(
  timetable: Map<cmn.time.DayOfWeek, unknown>,
): boolean {
  return REQUIRED_WEEKDAYS.some((weekday) => {
    const periods = timetable.get(weekday);
    return (
      Array.isArray(periods) && periods.some((period) => period !== undefined)
    );
  });
}

function resolveWidgetApiRequirements(
  widgets: dto.web_home_widget.WebHomeWidgetWithParam[],
): WidgetApiRequirements {
  let personalSchedulePastDays = 0;
  let personalScheduleRangeDays = 0;
  let includeSharedMemo = false;
  let includePersonalSessionMemo = false;
  let includePersonalDailyMemo = false;
  let cafeMenuRangeDays = 0;
  let needPersonalTimetable = false;
  let needHomeClassTimetable = false;
  const trainTimetableIds =
    new Set<knowledge.train_timetable.TrainTimetableID>();

  widgets.forEach((widget) => {
    switch (widget.type) {
      case dto.web_home_widget.WebHomeWidgetType.PersonalSchedule:
        personalSchedulePastDays = Math.max(
          personalSchedulePastDays,
          Math.max(0, widget.param.past_days),
        );
        personalScheduleRangeDays = Math.max(
          personalScheduleRangeDays,
          Math.max(1, widget.param.length) + 1,
        );
        asArray<dto.web_home_widget.WebHomeWidgetDailyItemWithParam>(
          widget.param.daily_items,
        ).forEach((item) => {
          switch (item.type) {
            case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
              .Sess:
            case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
              .MorningSess:
            case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
              .AfternoonSess:
              includeSharedMemo = true;
              includePersonalSessionMemo = true;
              if (item.param.highlight_mismatch) {
                needPersonalTimetable = true;
                needHomeClassTimetable = true;
              }
              break;
            case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
              .DailyMemo:
              includePersonalDailyMemo = true;
              break;
            default:
              break;
          }
        });
        break;

      case dto.web_home_widget.WebHomeWidgetType.PersonalTimetable:
        needPersonalTimetable = true;
        needHomeClassTimetable = true;
        break;

      case dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable:
        needHomeClassTimetable = true;
        break;

      case dto.web_home_widget.WebHomeWidgetType.CafeMenu:
        cafeMenuRangeDays = Math.max(
          cafeMenuRangeDays,
          widget.param.show_next_week_image
            ? Math.max(widget.param.str_length, 14) + 1
            : Math.max(widget.param.str_length, 7) + 1,
        );
        break;

      case dto.web_home_widget.WebHomeWidgetType.NextTrain:
        if (widget.param.mode === "always") {
          widget.param.timetable_ids.forEach((id) => trainTimetableIds.add(id));
        } else {
          widget.param.before_ids.forEach((id) => trainTimetableIds.add(id));
          widget.param.after_ids.forEach((id) => trainTimetableIds.add(id));
        }
        break;
    }
  });

  return {
    needPersonalSchedule: personalScheduleRangeDays > 0,
    personalSchedulePastDays,
    personalScheduleRangeDays,
    includeSharedMemo,
    includePersonalSessionMemo,
    includePersonalDailyMemo,
    needPersonalTimetable,
    needHomeClassTimetable,
    needCafeMenu: cafeMenuRangeDays > 0,
    cafeMenuRangeDays,
    needTrainTimetables: trainTimetableIds.size > 0,
    trainTimetableIds: Array.from(trainTimetableIds),
  };
}

function resolveCommonWidgetErrorMessage(
  code: string | undefined,
  fallbackMessage: string,
): string {
  switch (code) {
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.ResourceNotFound:
      return "対象データが見つかりませんでした。画面を再読み込みして再試行してください。";
    case api.errors.CommonApiErrorCode.InvalidRequest:
    case api.errors.CommonApiErrorCode.InvalidJsonBody:
    case api.errors.CommonApiErrorCode.MissingPathParameter:
      return "リクエスト内容が不正です。画面を再読み込みして再試行してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolveWebUiConfigLoadErrorMessage(
  result: Awaited<ReturnType<typeof apiGetUsersUserIdSettingsWebUi>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  return resolveCommonWidgetErrorMessage(result.error.code, fallbackMessage);
}

function resolvePersonalScheduleLoadErrorMessage(
  result: Awaited<ReturnType<typeof apiGetUsersUserIdSchedulesYearMonthDay>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.UserDataErrorCode.UserProfileIncomplete:
      return "プロフィールの学年・クラス設定が不足しています。プロフィール設定を確認してください。";
    case api.errors.UserDataErrorCode.UserNotFound:
      return "ユーザ情報が見つかりませんでした。再ログインして再試行してください。";
    case api.errors.InternalDataErrorCode.InvalidDateValue:
    case api.errors.InternalDataErrorCode.InvalidTimeString:
    case api.errors.InternalDataErrorCode.UnsupportedTimeValue:
      return "日付・時刻データの解釈に失敗しました。時間をおいて再試行してください。";
    default:
      return resolveCommonWidgetErrorMessage(
        result.error.code,
        fallbackMessage,
      );
  }
}

function resolvePersonalTimetableLoadErrorMessage(
  result: Awaited<ReturnType<typeof apiGetUsersUserIdTimetable>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  return resolveCommonWidgetErrorMessage(result.error.code, fallbackMessage);
}

function resolveHomeClassTimetableLoadErrorMessage(
  result: Awaited<
    ReturnType<typeof apiGetGradesGradeHomeClassesHomeClassNumTimetable>
  >,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
      .InvalidGrade:
      return "学年の指定が不正です。プロフィール設定を確認してください。";
    case api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
      .InvalidHomeClassNum:
      return "クラス番号が不正です。プロフィール設定を確認してください。";
    case api.errors.UserDataErrorCode.UserProfileIncomplete:
      return "プロフィールの学年・クラス設定が不足しています。プロフィール設定を確認してください。";
    case api.errors.UserDataErrorCode.UserNotFound:
      return "ユーザ情報が見つかりませんでした。再ログインして再試行してください。";
    case api.errors.TimetableDecodeErrorCode.InvalidClassSession:
    case api.errors.TimetableDecodeErrorCode.InvalidClassSessionType:
    case api.errors.TimetableDecodeErrorCode.InvalidClassCourse:
    case api.errors.TimetableDecodeErrorCode.InvalidClassSelectionId:
    case api.errors.TimetableDecodeErrorCode.InvalidClassRoomList:
    case api.errors.TimetableDecodeErrorCode.InvalidSelectionKey:
    case api.errors.TimetableDecodeErrorCode.InvalidWeekdayKey:
    case api.errors.TimetableDecodeErrorCode.InvalidPeriodList:
      return "クラス時間割データが不正です。管理者に問い合わせてください。";
    default:
      return resolveCommonWidgetErrorMessage(
        result.error.code,
        fallbackMessage,
      );
  }
}

function resolveCafeMenuLoadErrorMessage(
  result: Awaited<ReturnType<typeof apiGetGlobalCafemenuYearMonthDay>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  return resolveCommonWidgetErrorMessage(result.error.code, fallbackMessage);
}

function resolvePersonalMemoSaveErrorMessage(
  result: Awaited<
    ReturnType<typeof apiPutUsersUserIdSchedulesYearMonthDayPeriodMemoPersonal>
  >,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  return resolveCommonWidgetErrorMessage(result.error.code, fallbackMessage);
}

function resolveSharedMemoSaveErrorMessage(
  result: Awaited<
    ReturnType<typeof apiPutUsersUserIdSchedulesYearMonthDayPeriodMemoShared>
  >,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.SharedMemoResolutionErrorCode.ScheduleSessionNotFound:
      return "対象日の授業情報が見つかりませんでした。最新状態を読み直して再試行してください。";
    case api.errors.SharedMemoResolutionErrorCode.PersonalSessionNotFound:
      return "この時限に対応する個人時間割が見つかりません。先に個人時間割を設定してください。";
    case api.errors.SharedMemoResolutionErrorCode.InvalidNormalSessionPosition:
    case api.errors.SharedMemoResolutionErrorCode.InvalidSpecialSessionName:
      return "授業情報の解決に失敗しました。ページを再読み込みして再試行してください。";
    case api.errors.UserDataErrorCode.UserProfileIncomplete:
      return "プロフィールの学年・クラス設定が不足しています。プロフィール設定を確認してください。";
    case api.errors.UserDataErrorCode.UserNotFound:
      return "ユーザ情報が見つかりませんでした。再ログインして再試行してください。";
    default:
      return resolveCommonWidgetErrorMessage(
        result.error.code,
        fallbackMessage,
      );
  }
}

// 時間割のキーが月-金固定だから定数に近いし月-金だから始まりが日でも月でも変わらないが、一応汎用性を持たせるための実装
function sortWeekdaysMonFirst(
  weekdays: cmn.time.DayOfWeek[],
): cmn.time.DayOfWeek[] {
  const rank: Record<cmn.time.DayOfWeek, number> = {
    1: 0,
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    0: 6,
  };
  return [...weekdays].sort((a, b) => rank[a] - rank[b]);
}

function resolveTimetableDays(
  timetable: Map<cmn.time.DayOfWeek, unknown>,
  todayOnly: boolean,
  todayFirst: boolean,
): cmn.time.DayOfWeek[] {
  const sorted = sortWeekdaysMonFirst(
    Array.from(timetable.keys()) as cmn.time.DayOfWeek[],
  );
  if (sorted.length === 0) {
    return [];
  }

  const today = new Date().getDay() as cmn.time.DayOfWeek;
  if (todayOnly) {
    return sorted.includes(today) ? [today] : [];
  }

  if (!todayFirst || !sorted.includes(today)) {
    return sorted;
  }

  const pivot = sorted.indexOf(today);
  return [...sorted.slice(pivot), ...sorted.slice(0, pivot)];
}

function resolveCommonWeeklyTimetable(
  personalTimetable: models.schedule.PersonalWeeklyTimetable,
  homeClassTimetable: models.schedule.OriginalWeeklyTimetable,
): models.schedule.CommonWeeklyTimetable {
  const resolved: models.schedule.CommonWeeklyTimetable = new Map();

  homeClassTimetable.forEach((periods, weekday) => {
    const dayResolved: cmn.Option<models.schedule.CommonWeeklyTimetableSess>[] =
      [];

    for (let index = 0; index < periods.length; index += 1) {
      const classSess = periods[index];

      if (!classSess) {
        dayResolved[index] =
          cmn.None<models.schedule.CommonWeeklyTimetableSess>();
        continue;
      }

      if (classSess.type === "normal") {
        dayResolved[index] = cmn.Some({
          course: classSess.course,
          room_id: cmn.None<knowledge.room.RoomID>(),
        });
        continue;
      }

      const selected = personalTimetable.get(classSess.selection_id);
      if (!selected || selected.isNone()) {
        dayResolved[index] =
          cmn.None<models.schedule.CommonWeeklyTimetableSess>();
        continue;
      }

      const sess = selected.unwrap();
      dayResolved[index] = cmn.Some({
        course: sess.course,
        room_id: sess.room_id,
      });
    }

    resolved.set(weekday, dayResolved);
  });

  return resolved;
}

function courseDisplayName(courseId: knowledge.course.CourseID): string {
  return resolveCourseDisplayName(courseId, "不明科目");
}

type SessionDailyItemType =
  | dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess
  | dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.MorningSess
  | dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.AfternoonSess;

function resolveSessionRangeForDay(
  day: models.schedule.PersonalMonSkdDay,
  itemType: SessionDailyItemType,
): { start: number; end: number } {
  const sessLength = day.sess.length;
  const afternoonStart = Math.max(
    0,
    Math.min(sessLength, day.afternoon_start_period - 1),
  );

  switch (itemType) {
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess:
      return { start: 0, end: sessLength };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .MorningSess:
      return { start: 0, end: afternoonStart };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .AfternoonSess:
      return { start: afternoonStart, end: sessLength };
  }
}

function resolveSessionPeriodIndexesForDay(
  day: models.schedule.PersonalMonSkdDay,
  itemType: SessionDailyItemType,
): number[] {
  const range = resolveSessionRangeForDay(day, itemType);
  if (
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.end <= range.start
  ) {
    return [];
  }

  return Array.from(
    { length: range.end - range.start },
    (_, index) => range.start + index,
  );
}

function scheduleDailyItemSectionClassName(
  itemType: dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType,
): string {
  switch (itemType) {
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess:
      return "schedule-day__section--sess";
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .MorningSess:
      return "schedule-day__section--morning-sess";
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .AfternoonSess:
      return "schedule-day__section--afternoon-sess";
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .DailyMemo:
      return "schedule-day__section--daily-memo";
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Events:
      return "schedule-day__section--events";
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Cafe:
      return "schedule-day__section--cafe";
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .StudyHall:
      return "schedule-day__section--study-hall";
  }
}

function renderSessionSummary(
  day: models.schedule.PersonalMonSkdDay,
  period: number,
  param: dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemParamSess,
  dayIndex: number,
  scheduleStartDate: Date | null,
  personalTimetable: models.schedule.CommonWeeklyTimetable,
  homeClassTimetable: models.schedule.OriginalWeeklyTimetable,
  onOpenSessionMemoEdit?: (target: SessionMemoEditTarget) => void,
  sessionStyle?: React.CSSProperties,
): React.ReactNode {
  const timeLabel = resolveSessionTimeLabel(day, period, param);
  const actualTimetablePosition = resolveActualTimetablePositionLabel(
    dayIndex,
    period,
    scheduleStartDate,
  );
  const shouldHighlightMismatch =
    param.highlight_mismatch &&
    isSessionMismatchForHighlight(
      day,
      dayIndex,
      period,
      scheduleStartDate,
      personalTimetable,
      homeClassTimetable,
    );
  const sess = day.sess[period];
  if (!sess || sess.isNone()) {
    const className = shouldHighlightMismatch
      ? "widget-session widget-session--placeholder widget-session--mismatch"
      : "widget-session widget-session--placeholder";

    return (
      <li
        className={className}
        key={`period-${period}`}
        data-period-index={period}
        style={sessionStyle}
      >
        <p className="widget-session__title">
          <span>{period + 1}限</span>
          <span>空きコマ</span>
          {param.show_timetable_position && (
            <span className="widget-session__sub">
              ({actualTimetablePosition})
            </span>
          )}
        </p>
        {timeLabel && (
          <p className="widget-session__sub">
            <span className="widget-session__sub-line">{timeLabel}</span>
          </p>
        )}
      </li>
    );
  }

  const value = sess.unwrap();

  const heading =
    value.course.type === "normal"
      ? param.show_short_course_name
        ? resolveCourseShortDisplayName(value.course.id, "不明科目")
        : resolveCourseDisplayName(value.course.id, "不明科目")
      : value.course.name;

  const subject =
    value.course.type === "normal"
      ? resolveCourseSubjectDisplayName(value.course.id, heading)
      : heading;

  const room = value.room_id.mapOr<string | null>(null, (roomId) => {
    const roomName = resolveRoomDisplayName(roomId, param.show_room_floor);
    return roomName;
  });
  const roomLabel = param.show_room && room ? `@${room}` : null;

  const timetablePosition =
    value.course.type === "normal"
      ? `${DAY_LABEL_BY_WEEKDAY[value.course.timetable_position.dayofweek]}${value.course.timetable_position.period}`
      : "";

  const memo_personal =
    param.show_personal_memo && value.personal_memo.isSome()
      ? `個人: ${value.personal_memo.unwrap()}`
      : null;
  const memo_shared =
    param.show_shared_memo && value.shared_memo.isSome()
      ? `共有: ${value.shared_memo.unwrap()}`
      : null;

  const personalMemo = value.personal_memo.mapOr("", (memo) => memo);
  const sharedMemo = value.shared_memo.mapOr("", (memo) => memo);

  const className = shouldHighlightMismatch
    ? "widget-session widget-session--mismatch"
    : "widget-session";

  return (
    <li
      className={className}
      key={`period-${period}`}
      data-period-index={period}
      style={sessionStyle}
    >
      {onOpenSessionMemoEdit && (
        <button
          type="button"
          className="widget-session__memo-edit-button"
          onClick={() => {
            onOpenSessionMemoEdit({
              dayIndex,
              periodIndex: period,
              title: `${dayLabel(dayIndex, scheduleStartDate)} ${period + 1}限 ${heading}`,
              personalMemo,
              sharedMemo,
            });
          }}
          aria-label={`${period + 1}限の授業メモを編集`}
        >
          <span aria-hidden>✎</span>
        </button>
      )}
      <p className="widget-session__title">
        <span> {period + 1}限 </span>
        {param.show_subject && subject !== heading && (
          <span>
            {subject}
            {"/"}
          </span>
        )}
        <span>{heading}</span>
        {param.show_timetable_position && timetablePosition && (
          <span className="widget-session__sub">
            {" ("}
            {timetablePosition}
            {")"}
          </span>
        )}
      </p>
      {(timeLabel || roomLabel) && (
        <p className="widget-session__sub">
          {timeLabel && (
            <span className="widget-session__sub-line">{timeLabel}</span>
          )}
          {roomLabel && (
            <span className="widget-session__sub-line">{roomLabel}</span>
          )}
        </p>
      )}
      {param.show_memo && memo_personal && (
        <p className="widget-session__memo">{memo_personal}</p>
      )}
      {param.show_memo && memo_shared && (
        <p className="widget-session__memo">{memo_shared}</p>
      )}
    </li>
  );
}

function renderAvailabilitySymbol(value: boolean | null): string {
  if (value === null) {
    return "-";
  }
  return value ? "○" : "×";
}

function renderDailyItem(
  day: models.schedule.PersonalMonSkdDay,
  item: dto.web_home_widget.WebHomeWidgetDailyItemWithParam,
  dayIndex: number,
  itemIndex: number,
  sessionRowHeights: Record<string, number>,
  scheduleStartDate: Date | null,
  personalTimetable: models.schedule.CommonWeeklyTimetable,
  homeClassTimetable: models.schedule.OriginalWeeklyTimetable,
  onOpenSessionMemoEdit?: (target: SessionMemoEditTarget) => void,
  onOpenDailyMemoEdit?: (target: DailyMemoEditTarget) => void,
): React.ReactNode {
  switch (item.type) {
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess:
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .MorningSess:
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .AfternoonSess: {
      const periods = resolveSessionPeriodIndexesForDay(day, item.type);
      if (periods.length === 0) {
        return <p className="widget-empty">該当コマなし</p>;
      }

      const groupedPeriods = groupSessionPeriodsByZeroBreak(day, periods);

      const resolveSessionStyle = (
        period: number,
      ): React.CSSProperties | undefined => {
        const height = sessionRowHeights[`${itemIndex}-${period}`];
        if (!height || height <= 0) {
          return undefined;
        }
        return {
          minHeight: `${height}px`,
        };
      };

      return (
        <ul className="widget-session-list widget-session-list--aligned">
          {groupedPeriods.map((group, groupIndex) => {
            if (group.length === 1) {
              const period = group[0];
              return renderSessionSummary(
                day,
                period,
                item.param,
                dayIndex,
                scheduleStartDate,
                personalTimetable,
                homeClassTimetable,
                onOpenSessionMemoEdit,
                resolveSessionStyle(period),
              );
            }

            return (
              <li
                className="widget-session-merged-group"
                key={`merged-${itemIndex}-${groupIndex}-${group[0]}`}
              >
                <ul className="widget-session-merged-group__list">
                  {group.map((period) =>
                    renderSessionSummary(
                      day,
                      period,
                      item.param,
                      dayIndex,
                      scheduleStartDate,
                      personalTimetable,
                      homeClassTimetable,
                      onOpenSessionMemoEdit,
                      resolveSessionStyle(period),
                    ),
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      );
    }

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .Events: {
      const events = asArray<unknown>(day.events).filter(
        (event): event is string => typeof event === "string",
      );
      if (events.length === 0) {
        return <p className="widget-empty">イベントなし</p>;
      }
      return (
        <ul className="widget-tag-list">
          {events.map((event) => (
            <li key={event}>{event}</li>
          ))}
        </ul>
      );
    }

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .DailyMemo: {
      const rawDailyMemo = day.daily_memo.mapOr("", (memo) => memo);
      const dailyMemo = rawDailyMemo.trim();

      return (
        <div className="widget-daily-memo">
          {onOpenDailyMemoEdit && (
            <button
              type="button"
              className="widget-session__memo-edit-button"
              onClick={() => {
                onOpenDailyMemoEdit({
                  dayIndex,
                  title: `${dayLabel(dayIndex, scheduleStartDate)} デイリーメモ`,
                  memo: rawDailyMemo,
                });
              }}
              aria-label="デイリーメモを編集"
            >
              <span aria-hidden>✎</span>
            </button>
          )}
          {dailyMemo.length === 0 ? (
            <p className="widget-empty">メモなし</p>
          ) : (
            <p className="widget-session__memo">{dailyMemo}</p>
          )}
        </div>
      );
    }

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Cafe:
      return (
        <div className="widget-inline-actions">
          <p className="widget-inline-meta">
            食堂:{" "}
            {renderAvailabilitySymbol(
              day.cafeteria_open.mapOr<boolean | null>(
                null,
                (isOpen) => isOpen,
              ),
            )}
          </p>
          {item.param.show_menu_button && (
            <a href="#widget-cafe-menu" className="widget-inline-link">
              メニューを見る
            </a>
          )}
        </div>
      );

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .StudyHall:
      return (
        <p className="widget-inline-meta">
          自習室:{" "}
          {renderAvailabilitySymbol(
            day.study_hall_open.mapOr<boolean | null>(null, (isOpen) => isOpen),
          )}
        </p>
      );
  }
}

function renderPersonalScheduleWidget(
  param: dto.web_home_widget.WebHomeWidgetParamPersonalSchedule,
  personalSchedule: models.schedule.PersonalMonSkd,
  scheduleStartDate: Date | null,
  personalTimetable: models.schedule.CommonWeeklyTimetable,
  homeClassTimetable: models.schedule.OriginalWeeklyTimetable,
  options?: {
    startIndex?: number;
    displayStartDate?: Date | null;
    onOpenSessionMemoEdit?: (target: SessionMemoEditTarget) => void;
    onOpenDailyMemoEdit?: (target: DailyMemoEditTarget) => void;
  },
): React.ReactNode {
  return (
    <PersonalScheduleWidget
      param={param}
      personalSchedule={personalSchedule}
      scheduleStartDate={scheduleStartDate}
      personalTimetable={personalTimetable}
      homeClassTimetable={homeClassTimetable}
      startIndex={options?.startIndex}
      displayStartDate={options?.displayStartDate}
      onOpenSessionMemoEdit={options?.onOpenSessionMemoEdit}
      onOpenDailyMemoEdit={options?.onOpenDailyMemoEdit}
    />
  );
}

type PersonalScheduleWidgetProps = {
  param: dto.web_home_widget.WebHomeWidgetParamPersonalSchedule;
  personalSchedule: models.schedule.PersonalMonSkd;
  scheduleStartDate: Date | null;
  personalTimetable: models.schedule.CommonWeeklyTimetable;
  homeClassTimetable: models.schedule.OriginalWeeklyTimetable;
  startIndex?: number;
  displayStartDate?: Date | null;
  onOpenSessionMemoEdit?: (target: SessionMemoEditTarget) => void;
  onOpenDailyMemoEdit?: (target: DailyMemoEditTarget) => void;
};

function PersonalScheduleWidget({
  param,
  personalSchedule,
  scheduleStartDate,
  personalTimetable,
  homeClassTimetable,
  startIndex,
  displayStartDate,
  onOpenSessionMemoEdit,
  onOpenDailyMemoEdit,
}: PersonalScheduleWidgetProps): React.ReactNode {
  const scheduleDaysRef = useRef<HTMLDivElement | null>(null);
  const initialAnchorScrollKeyRef = useRef<string | null>(null);
  const [rowHeights, setRowHeights] = useState<number[]>([]);
  const [sessionRowHeights, setSessionRowHeights] = useState<
    Record<string, number>
  >({});

  const futureDays = Math.max(1, param.length);
  const pastDays = Math.max(0, param.past_days);
  const baseCurrentDayIndex = scheduleStartDate
    ? Math.max(0, diffCalendarDays(scheduleStartDate, todayAtMorning()))
    : 0;
  const defaultAnchorIndex =
    baseCurrentDayIndex + resolveDaySwitchOffset(param.day_switch_time);
  const anchorIndex = startIndex ?? defaultAnchorIndex;
  const visibleStartDate = displayStartDate ?? scheduleStartDate;

  const scheduleToShow = useMemo(() => {
    const schedule = asArray<models.schedule.PersonalMonSkdDay | null>(
      personalSchedule,
    );

    const pastEntries = Array.from({ length: pastDays }, (_, index) => {
      const absoluteDayIndex = anchorIndex - pastDays + index;
      return {
        day: schedule[absoluteDayIndex] ?? null,
        absoluteDayIndex,
        isPast: true,
      };
    });

    const futureEntries = Array.from({ length: futureDays }, (_, index) => {
      const absoluteDayIndex = anchorIndex + index;
      return {
        day: schedule[absoluteDayIndex] ?? null,
        absoluteDayIndex,
        isPast: false,
      };
    });

    return [...pastEntries, ...futureEntries];
  }, [anchorIndex, futureDays, pastDays, personalSchedule]);
  const dailyItems = useMemo(
    () =>
      asArray<dto.web_home_widget.WebHomeWidgetDailyItemWithParam>(
        param.daily_items,
      ),
    [param.daily_items],
  );
  const hasUnknownCourse = scheduleToShow.some(
    (entry) => entry.day !== null && hasUnknownCourseInDay(entry.day),
  );
  const hasMissingDayData = scheduleToShow.some((entry) => entry.day === null);
  const shouldShowTimeAccuracyNote = dailyItems.some(
    (item) =>
      (item.type ===
        dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess ||
        item.type ===
          dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
            .MorningSess ||
        item.type ===
          dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
            .AfternoonSess) &&
      item.param.show_time,
  );

  useEffect(() => {
    if (param.direction !== "horizontal") {
      return;
    }

    const root = scheduleDaysRef.current;
    if (!root) {
      return;
    }

    let cancelled = false;
    let animationFrameId: number | null = null;

    const measure = () => {
      if (cancelled) {
        return;
      }

      const next = Array.from({ length: dailyItems.length }, () => 0);
      const nextSessionHeights: Record<string, number> = {};
      const sections = root.querySelectorAll<HTMLElement>(
        ".schedule-day__section[data-item-index]",
      );

      sections.forEach((section) => {
        const itemIndex = Number.parseInt(section.dataset.itemIndex ?? "", 10);
        if (
          !Number.isFinite(itemIndex) ||
          itemIndex < 0 ||
          itemIndex >= next.length
        ) {
          return;
        }

        // 行高揃えは、section自体の伸長後サイズではなく実コンテンツ高さを基準にする。
        const contentElement = section.firstElementChild as HTMLElement | null;
        const measuredSectionHeight = Math.ceil(
          (contentElement ?? section).getBoundingClientRect().height,
        );
        next[itemIndex] = Math.max(next[itemIndex], measuredSectionHeight);

        const periodRows = section.querySelectorAll<HTMLElement>(
          ".widget-session[data-period-index]",
        );
        periodRows.forEach((periodRow) => {
          const periodIndex = Number.parseInt(
            periodRow.dataset.periodIndex ?? "",
            10,
          );
          if (!Number.isFinite(periodIndex) || periodIndex < 0) {
            return;
          }

          const key = `${itemIndex}-${periodIndex}`;
          nextSessionHeights[key] = Math.max(
            nextSessionHeights[key] ?? 0,
            Math.ceil(periodRow.getBoundingClientRect().height),
          );
        });
      });

      setRowHeights((prev) => {
        if (
          prev.length === next.length &&
          prev.every((height, index) => height === next[index])
        ) {
          return prev;
        }
        return next;
      });

      setSessionRowHeights((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(nextSessionHeights);
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((key) => prev[key] === nextSessionHeights[key])
        ) {
          return prev;
        }
        return nextSessionHeights;
      });
    };

    animationFrameId = window.requestAnimationFrame(() => {
      measure();
    });

    const onResize = () => {
      measure();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("resize", onResize);
    };
  }, [dailyItems, param.direction, scheduleToShow]);

  useEffect(() => {
    if (param.direction !== "horizontal") {
      return;
    }

    const root = scheduleDaysRef.current;
    if (!root) {
      return;
    }

    const anchorCard = root.querySelector<HTMLElement>(
      '[data-schedule-anchor="true"]',
    );
    if (!anchorCard) {
      return;
    }

    const scrollKey = `${anchorIndex}-${pastDays}-${futureDays}`;
    if (initialAnchorScrollKeyRef.current === scrollKey) {
      return;
    }

    initialAnchorScrollKeyRef.current = scrollKey;
    const nextLeft = Math.max(0, anchorCard.offsetLeft - root.offsetLeft);
    root.scrollTo({
      left: nextLeft,
      behavior: "auto",
    });
  }, [anchorIndex, futureDays, param.direction, pastDays, scheduleToShow]);

  const scheduleDaysStyle = useMemo(() => {
    if (param.direction !== "horizontal") {
      return undefined;
    }

    if (rowHeights.length === 0) {
      return undefined;
    }

    const cssVars: Record<string, string> = {};
    rowHeights.forEach((height, index) => {
      cssVars[`--schedule-row-${index}`] = `${height}px`;
    });

    return cssVars as React.CSSProperties;
  }, [param.direction, rowHeights]);

  const scheduleDayStyle = (() => {
    if (param.direction !== "horizontal" || dailyItems.length === 0) {
      return undefined;
    }

    const rows = dailyItems
      .map((_, index) => `minmax(var(--schedule-row-${index}, auto), auto)`)
      .join(" ");
    return {
      ["--schedule-day-rows" as string]: `auto ${rows}`,
    } as React.CSSProperties;
  })();

  if (scheduleToShow.length === 0) {
    return <p className="widget-empty">月間予定表未入力</p>;
  }

  return (
    <div className="schedule-widget-body">
      {hasMissingDayData && (
        <p className="widget-warning">
          月間予定表が未入力の日があります。未入力日は「データなし」として表示しています。
        </p>
      )}
      {hasUnknownCourse && (
        <p className="widget-warning">
          クラス共通時間割が未設定のため、一部授業を不明として表示しています。
        </p>
      )}

      <div
        ref={scheduleDaysRef}
        className={`schedule-days ${
          param.direction === "horizontal" ? "is-horizontal" : "is-vertical"
        }`}
        style={scheduleDaysStyle}
      >
        {scheduleToShow.map(({ day, absoluteDayIndex, isPast }, idx) => {
          const isFutureStart = idx === pastDays;
          const dayClassName = `schedule-day schedule-day--aligned ${
            !isPast && pastDays > 0 && isFutureStart
              ? "schedule-day--past-separator"
              : ""
          }`;

          if (day === null) {
            return (
              <article
                className={dayClassName}
                key={`day-${idx}`}
                style={scheduleDayStyle}
                data-schedule-anchor={isFutureStart ? "true" : undefined}
              >
                <h4>{dayLabel(absoluteDayIndex, visibleStartDate)}</h4>
                {dailyItems.map((item, itemIndex) => (
                  <section
                    key={`missing-${item.type}-${itemIndex}`}
                    data-item-index={itemIndex}
                    className={`schedule-day__section ${scheduleDailyItemSectionClassName(item.type)}`}
                  >
                    <p className="widget-empty">データなし</p>
                  </section>
                ))}
              </article>
            );
          }

          return (
            <article
              className={dayClassName}
              key={`day-${idx}`}
              style={scheduleDayStyle}
              data-schedule-anchor={isFutureStart ? "true" : undefined}
            >
              <h4>{dayLabel(absoluteDayIndex, visibleStartDate)}</h4>
              {dailyItems.map((item, itemIndex) => (
                <section
                  key={`${item.type}-${itemIndex}`}
                  data-item-index={itemIndex}
                  className={`schedule-day__section ${scheduleDailyItemSectionClassName(item.type)}`}
                >
                  {renderDailyItem(
                    day,
                    item,
                    absoluteDayIndex,
                    itemIndex,
                    param.direction === "horizontal" ? sessionRowHeights : {},
                    visibleStartDate,
                    personalTimetable,
                    homeClassTimetable,
                    onOpenSessionMemoEdit,
                    onOpenDailyMemoEdit,
                  )}
                </section>
              ))}
            </article>
          );
        })}
      </div>

      {shouldShowTimeAccuracyNote && (
        <p className="widget-caution-note">{TIME_DISPLAY_ACCURACY_NOTE}</p>
      )}
    </div>
  );
}

function renderCafeMenuWidget(
  param: dto.web_home_widget.WebHomeWidgetParamCafeMenu,
  cafeMenu: models.cafemenu.DailyCafeMenu[],
): React.ReactNode {
  if (!param.show_as_str && !param.show_as_image) {
    return <p className="widget-empty">表示モードが無効です。</p>;
  }

  const safeCafeMenu = asArray<models.cafemenu.DailyCafeMenu>(cafeMenu);
  const dayOffset = resolveDaySwitchOffset(param.day_switch_time);
  const days = safeCafeMenu.slice(dayOffset, dayOffset + param.str_length);
  const imageUrls = safeCafeMenu
    .map((menu) => {
      const originalUrl = menu.menus_as_img_url.mapOr<string | null>(
        null,
        (url) => url,
      );
      const previewUrl = menu.menus_as_img_preview_url.mapOr<string | null>(
        null,
        (url) => url,
      );
      return normalizeCafeImageUrl(previewUrl ?? originalUrl);
    })
    .filter((url): url is string => url !== null);

  const imageDays = imageUrls.slice(0, param.show_next_week_image ? 2 : 1);
  const canShowImage = param.show_as_image && imageDays.length > 0;
  const canShowStr = param.show_as_str;
  const resolveMenuAsStr = (menu: models.cafemenu.DailyCafeMenu): string[] =>
    menu.menus_as_str.mapOr<string[]>([], (value) =>
      asArray<unknown>(value).filter(
        (item): item is string => typeof item === "string",
      ),
    );
  const hasAnyMenuAsStr = days.some(
    (menu) => resolveMenuAsStr(menu).length > 0,
  );
  const shouldShowImage =
    canShowImage &&
    ((param.display_preference === "image" && canShowImage) ||
      !canShowStr ||
      (param.display_preference === "str" && !hasAnyMenuAsStr));

  if (shouldShowImage) {
    return (
      <div
        className={`cafe-menu-images ${
          param.image_direction === "horizontal"
            ? "is-horizontal"
            : "is-vertical"
        }`}
      >
        {imageDays
          .filter((item, idx, self) => self.indexOf(item) === idx) // 重複URLの除去(同じ週は同じ画像のため)
          .map((url, idx) => (
            <figure
              className="cafe-menu-image-card"
              key={`cafemenu-image-${idx}`}
            >
              <Image
                className="cafe-menu-image"
                src={url}
                alt={`カフェメニュー画像 ${idx + 1}`}
                width={1200}
                height={1600}
                loading="lazy"
                unoptimized
              />
            </figure>
          ))}
      </div>
    );
  }

  if (!canShowStr) {
    return (
      <p className="widget-empty">表示可能なカフェメニュー画像がありません。</p>
    );
  }

  return (
    <div
      className={`cafe-menu-days ${
        param.str_direction === "horizontal" ? "is-horizontal" : "is-vertical"
      }`}
    >
      {days.map((menu, idx) => {
        const menuAsStr = resolveMenuAsStr(menu);

        return (
          <article className="cafe-menu-day" key={`cafemenu-${idx}`}>
            <h4>{dayLabel(dayOffset + idx)}</h4>
            {menuAsStr.length > 0 ? (
              <ul className="widget-tag-list">
                {menuAsStr.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="widget-empty">メニュー未登録</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function renderPersonalTimetableWidget(
  param: dto.web_home_widget.WebHomeWidgetParamPersonalTimetable,
  timetable: models.schedule.CommonWeeklyTimetable,
): React.ReactNode {
  if (!isWeeklyTimetableConfigured(timetable)) {
    return <p className="widget-empty">未設定</p>;
  }

  const days = resolveTimetableDays(
    timetable,
    param.today_only,
    param.today_first,
  );
  if (days.length === 0) {
    return <p className="widget-empty">表示対象の曜日データがありません。</p>;
  }

  if (param.format === "list") {
    return (
      <div className="widget-timetable-flat-list">
        {days.map((weekday) => {
          const periods = asArray<
            cmn.Option<models.schedule.CommonWeeklyTimetableSess>
          >(timetable.get(weekday));
          const periodValues = Array.from(
            { length: periods.length },
            (_, i) => periods[i],
          );

          return (
            <article
              className="widget-timetable-day"
              key={`personal-${weekday}`}
            >
              <h4>{DAY_LABEL_BY_WEEKDAY[weekday]}曜</h4>
              <ul className="widget-timetable-period-list">
                {periodValues.map((sess, index) => {
                  if (!sess || sess.isNone()) {
                    return (
                      <li
                        className="widget-timetable-flat-item"
                        key={`personal-${weekday}-${index}`}
                      >
                        <p className="widget-timetable-period__title">
                          {index + 1}限 空きコマ
                        </p>
                        <p className="widget-timetable-period__sub">
                          {"\u00A0"}
                        </p>
                      </li>
                    );
                  }

                  const value = sess.unwrap();
                  const roomLabel = value.room_id.mapOr("", (roomId) => {
                    const roomName = resolveRoomDisplayName(roomId);
                    return roomName ? `@${roomName}` : "";
                  });
                  return (
                    <li
                      className="widget-timetable-flat-item"
                      key={`personal-${weekday}-${index}`}
                    >
                      <p className="widget-timetable-period__title">
                        {index + 1}限 {courseDisplayName(value.course)}
                      </p>
                      <p className="widget-timetable-period__sub">
                        {roomLabel || "\u00A0"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    );
  } else if (param.format === "grid") {
    return (
      <div className={`widget-timetable widget-timetable--${param.format}`}>
        {days.map((weekday) => {
          const periods = asArray<
            cmn.Option<models.schedule.CommonWeeklyTimetableSess>
          >(timetable.get(weekday));
          const periodValues = Array.from(
            { length: periods.length },
            (_, i) => periods[i],
          );

          return (
            <article
              className="widget-timetable-day"
              key={`personal-${weekday}`}
            >
              <h4>{DAY_LABEL_BY_WEEKDAY[weekday]}曜</h4>
              <ul className="widget-timetable-period-list">
                {periodValues.map((sess, index) => {
                  if (!sess || sess.isNone()) {
                    return (
                      <li
                        className="widget-timetable-period"
                        key={`personal-${weekday}-${index}`}
                      >
                        <p className="widget-timetable-period__title">
                          {index + 1}限 空きコマ
                        </p>
                        <p className="widget-timetable-period__sub">
                          {"\u00A0"}
                        </p>
                      </li>
                    );
                  }

                  const value = sess.unwrap();
                  const roomLabel = value.room_id.mapOr("", (roomId) => {
                    const roomName = resolveRoomDisplayName(roomId);
                    return roomName ? `@${roomName}` : "";
                  });
                  return (
                    <li
                      className="widget-timetable-period"
                      key={`personal-${weekday}-${index}`}
                    >
                      <p className="widget-timetable-period__title">
                        {index + 1}限 {courseDisplayName(value.course)}
                      </p>
                      <p className="widget-timetable-period__sub">
                        {roomLabel || "\u00A0"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    );
  }
}

function renderHomeClassTimetableWidget(
  param: dto.web_home_widget.WebHomeWidgetParamHomeClassOriginalTimetable,
  timetable: models.schedule.OriginalWeeklyTimetable,
): React.ReactNode {
  if (!isWeeklyTimetableConfigured(timetable)) {
    return <p className="widget-empty">未設定</p>;
  }

  const days = resolveTimetableDays(
    timetable,
    param.today_only,
    param.today_first,
  );
  if (days.length === 0) {
    return <p className="widget-empty">表示対象の曜日データがありません。</p>;
  }

  if (param.format === "list") {
    return (
      <div className="widget-timetable-flat-list">
        {days.map((weekday) => {
          const periods = asArray<models.schedule.OriginalWeeklyTimetableSess>(
            timetable.get(weekday),
          );
          const periodValues = Array.from(
            { length: periods.length },
            (_, i) => periods[i],
          );

          return (
            <article className="widget-timetable-day" key={`class-${weekday}`}>
              <h4>{DAY_LABEL_BY_WEEKDAY[weekday]}曜</h4>
              <ul className="widget-timetable-period-list">
                {periodValues.map((sess, index) => {
                  if (!sess) {
                    return (
                      <li
                        className="widget-timetable-flat-item"
                        key={`class-${weekday}-${index}`}
                      >
                        <p className="widget-timetable-period__title">
                          {index + 1}限 未設定
                        </p>
                        <p className="widget-timetable-period__sub">
                          {"\u00A0"}
                        </p>
                      </li>
                    );
                  }

                  if (sess.type === "select") {
                    return (
                      <li
                        className="widget-timetable-flat-item"
                        key={`class-${weekday}-${index}`}
                      >
                        <p className="widget-timetable-period__title">
                          {index + 1}限 選択 {sess.selection_id}
                        </p>
                        <p className="widget-timetable-period__sub">
                          {"\u00A0"}
                        </p>
                      </li>
                    );
                  }

                  return (
                    <li
                      className="widget-timetable-flat-item"
                      key={`class-${weekday}-${index}`}
                    >
                      <p className="widget-timetable-period__title">
                        {index + 1}限 {courseDisplayName(sess.course)}
                      </p>
                      <p className="widget-timetable-period__sub">
                        {(sess.room_id.isSome()
                          ? resolveRoomListDisplay(sess.room_id.unwrap())
                          : "") || "\u00A0"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`widget-timetable widget-timetable--${param.format}`}>
      {days.map((weekday) => {
        const periods = asArray<models.schedule.OriginalWeeklyTimetableSess>(
          timetable.get(weekday),
        );
        const periodValues = Array.from(
          { length: periods.length },
          (_, i) => periods[i],
        );

        return (
          <article className="widget-timetable-day" key={`class-${weekday}`}>
            <h4>{DAY_LABEL_BY_WEEKDAY[weekday]}曜</h4>
            <ul className="widget-timetable-period-list">
              {periodValues.map((sess, index) => {
                if (!sess) {
                  return (
                    <li
                      className="widget-timetable-period"
                      key={`class-${weekday}-${index}`}
                    >
                      <p className="widget-timetable-period__title">
                        {index + 1}限 未設定
                      </p>
                      <p className="widget-timetable-period__sub">{"\u00A0"}</p>
                    </li>
                  );
                }

                if (sess.type === "select") {
                  return (
                    <li
                      className="widget-timetable-period"
                      key={`class-${weekday}-${index}`}
                    >
                      <p className="widget-timetable-period__title">
                        {index + 1}限 選択 {sess.selection_id}
                      </p>
                      <p className="widget-timetable-period__sub">{"\u00A0"}</p>
                    </li>
                  );
                }

                return (
                  <li
                    className="widget-timetable-period"
                    key={`class-${weekday}-${index}`}
                  >
                    <p className="widget-timetable-period__title">
                      {index + 1}限 {courseDisplayName(sess.course)}
                    </p>
                    <p className="widget-timetable-period__sub">
                      {(sess.room_id.isSome()
                        ? resolveRoomListDisplay(sess.room_id.unwrap())
                        : "") || "\u00A0"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

type MonthlyScheduleAvailabilityState = {
  loading: boolean;
  error: string | null;
  availableDays: boolean[];
};

type PersonalScheduleRangeState = {
  loading: boolean;
  error: string | null;
  schedule: models.schedule.PersonalMonSkd;
};

function useMonthlyScheduleAvailability(
  viewMonth: Date,
): MonthlyScheduleAvailabilityState {
  const router = useRouter();
  const year = viewMonth.getFullYear();
  const monthIndex = viewMonth.getMonth();
  const [state, setState] = useState<MonthlyScheduleAvailabilityState>({
    loading: true,
    error: null,
    availableDays: [],
  });

  useEffect(() => {
    let cancelled = false;

    const loadAvailability = async () => {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));

      const result = await apiGetGlobalSchedulesYearMonth(year, monthIndex + 1);

      if (isNoAuthApiResult(result)) {
        if (!cancelled) {
          router.replace("/login");
        }
        return;
      }

      const error = handleApiError(result);
      if (error || result.type !== "success") {
        if (!cancelled) {
          if (error && shouldShowFatalErrorPage(error)) {
            router.push(buildFatalErrorPageHref(error));
            return;
          }

          setState({
            loading: false,
            error: error?.message ?? "月間予定表の取得に失敗しました",
            availableDays: [],
          });
        }
        return;
      }

      if (cancelled) {
        return;
      }

      const totalDays = daysInCalendarMonth(year, monthIndex);
      const schedule = asArray<models.schedule.OriginalMonSkdDay | null>(
        result.data.skd,
      );
      const availableDays = Array.from({ length: totalDays }, (_, index) => {
        const day = schedule[index] ?? null;
        return day !== null;
      });

      setState({
        loading: false,
        error: null,
        availableDays,
      });
    };

    void loadAvailability();

    return () => {
      cancelled = true;
    };
  }, [monthIndex, router, year]);

  return state;
}

function MonthlyScheduleCalendar({
  month,
  selectedDate,
  availability,
  onChangeMonth,
  onSelectDate,
}: {
  month: Date;
  selectedDate: Date | null;
  availability: MonthlyScheduleAvailabilityState;
  onChangeMonth: (nextMonth: Date) => void;
  onSelectDate: (date: Date) => void;
}): React.ReactNode {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const totalDays = daysInCalendarMonth(year, monthIndex);
  const firstWeekday = dateFromCalendarParts(year, monthIndex, 1).getDay();
  const today = todayAtMorning();

  const calendarCells: React.ReactNode[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    calendarCells.push(
      <div
        key={`empty-${index}`}
        className="schedule-calendar__cell schedule-calendar__cell--empty"
        aria-hidden
      />,
    );
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = dateFromCalendarParts(year, monthIndex, day);
    const isSelected = selectedDate
      ? isSameCalendarDate(selectedDate, date)
      : false;
    const isToday = isSameCalendarDate(today, date);
    const isAvailable = availability.availableDays[day - 1] ?? false;
    const isDisabled = availability.loading || !isAvailable;

    const className = ["schedule-calendar__day"];
    if (isSelected) {
      className.push("is-selected");
    }
    if (isToday) {
      className.push("is-today");
    }
    if (!isAvailable) {
      className.push("is-unavailable");
    }

    calendarCells.push(
      <button
        type="button"
        key={`day-${day}`}
        className={className.join(" ")}
        onClick={() => {
          onSelectDate(date);
        }}
        disabled={isDisabled}
        aria-label={`${year}年${monthIndex + 1}月${day}日`}
        aria-pressed={isSelected}
      >
        {day}
      </button>,
    );
  }

  return (
    <div className="schedule-calendar">
      <header className="schedule-calendar__header">
        <button
          type="button"
          className="schedule-calendar__month-nav"
          onClick={() => {
            onChangeMonth(addMonthsAtMorning(month, -1));
          }}
          aria-label="前の月を表示"
        >
          {"<"}
        </button>
        <h5>{formatCalendarMonth(month)}</h5>
        <button
          type="button"
          className="schedule-calendar__month-nav"
          onClick={() => {
            onChangeMonth(addMonthsAtMorning(month, 1));
          }}
          aria-label="次の月を表示"
        >
          {">"}
        </button>
      </header>

      <div className="schedule-calendar__weekdays" aria-hidden>
        {CALENDAR_WEEKDAY_LABELS.map((label) => (
          <span key={`weekday-${label}`}>{label}</span>
        ))}
      </div>

      <div className="schedule-calendar__grid">{calendarCells}</div>

      {availability.loading && (
        <p className="schedule-calendar__loading">
          月間予定表を読み込み中です。
        </p>
      )}

      {availability.error && (
        <p className="widget-warning schedule-calendar__error">
          {availability.error}
        </p>
      )}
    </div>
  );
}

function PersonalScheduleWithPeriodControl({
  authUserId,
  param,
  baseSchedule,
  baseScheduleStartDate,
  personalTimetable,
  homeClassTimetable,
  onOpenSessionMemoEdit,
  onOpenDailyMemoEdit,
}: {
  authUserId: string;
  param: dto.web_home_widget.WebHomeWidgetParamPersonalSchedule;
  baseSchedule: models.schedule.PersonalMonSkd;
  baseScheduleStartDate: Date | null;
  personalTimetable: models.schedule.CommonWeeklyTimetable;
  homeClassTimetable: models.schedule.OriginalWeeklyTimetable;
  onOpenSessionMemoEdit: (target: SessionMemoEditTarget) => void;
  onOpenDailyMemoEdit: (target: DailyMemoEditTarget) => void;
}): React.ReactNode {
  const router = useRouter();
  const [displayMode, setDisplayMode] = useState<"current" | "custom">(
    "current",
  );
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() =>
    monthStartAtMorning(baseScheduleStartDate ?? todayAtMorning()),
  );
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customRange, setCustomRange] = useState<PersonalScheduleRangeState>({
    loading: false,
    error: null,
    schedule: [],
  });
  const monthlyAvailability = useMonthlyScheduleAvailability(calendarMonth);
  const requestOptions = useMemo(
    () => resolvePersonalScheduleRequestOptions(param),
    [param],
  );
  const pastDays = Math.max(0, param.past_days);
  const rangeDays = Math.max(1, pastDays + Math.max(1, param.length));
  const customStartDateKey = customStartDate?.getTime() ?? null;
  const isCustomMode = displayMode === "custom" && customStartDate !== null;

  const customScheduleStartDate = useMemo(() => {
    if (customStartDate === null) {
      return null;
    }

    const start = new Date(customStartDate);
    start.setDate(start.getDate() - pastDays);
    return dateAtMorning(start);
  }, [customStartDate, pastDays]);

  useEffect(() => {
    if (!isCustomMode || customScheduleStartDate === null) {
      return;
    }

    let cancelled = false;

    void loadPersonalScheduleRange(
      authUserId,
      customScheduleStartDate,
      rangeDays,
      requestOptions,
    ).then((result) => {
      if (cancelled) {
        return;
      }

      switch (result.type) {
        case "no-auth":
          router.replace("/login");
          return;

        case "fatal":
          router.push(result.href);
          return;

        case "error":
          setCustomRange({
            loading: false,
            error: result.message,
            schedule: [],
          });
          return;

        case "success":
          setCustomRange({
            loading: false,
            error: null,
            schedule: result.schedule,
          });
          return;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    authUserId,
    customScheduleStartDate,
    customStartDate,
    customStartDateKey,
    isCustomMode,
    rangeDays,
    requestOptions,
    router,
  ]);

  const customRangeLabel = useMemo(() => {
    if (!isCustomMode || customStartDate === null) {
      return null;
    }

    const end = new Date(customStartDate);
    end.setDate(end.getDate() + param.length - 1);
    return `${formatDateYmd(customStartDate)} - ${formatDateYmd(end)}`;
  }, [customStartDate, isCustomMode, param.length]);

  const widgetBody = (() => {
    if (isCustomMode) {
      if (customRange.loading) {
        return <p className="widget-empty">指定期間の予定を読み込み中です。</p>;
      }

      if (customRange.error) {
        return <p className="widget-warning">{customRange.error}</p>;
      }

      return renderPersonalScheduleWidget(
        param,
        customRange.schedule,
        customScheduleStartDate,
        personalTimetable,
        homeClassTimetable,
        {
          startIndex: pastDays,
          displayStartDate: customScheduleStartDate,
        },
      );
    }

    return renderPersonalScheduleWidget(
      param,
      baseSchedule,
      baseScheduleStartDate,
      personalTimetable,
      homeClassTimetable,
      {
        onOpenSessionMemoEdit,
        onOpenDailyMemoEdit,
      },
    );
  })();

  return (
    <div className="schedule-period-widget">
      {param.show_period_change_button && (
        <div className="schedule-period-widget__controls">
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              setCalendarMonth(
                monthStartAtMorning(
                  customStartDate ?? baseScheduleStartDate ?? todayAtMorning(),
                ),
              );
              setIsPickerOpen((prev) => !prev);
            }}
          >
            表示期間変更
          </button>

          {isCustomMode && (
            <button
              type="button"
              className="schedule-period-widget__reset"
              aria-label="現在表示に戻す"
              onClick={() => {
                setDisplayMode("current");
                setCustomStartDate(null);
                setCustomRange({
                  loading: false,
                  error: null,
                  schedule: [],
                });
                setIsPickerOpen(false);
              }}
            >
              <span aria-hidden>↻</span>
            </button>
          )}
        </div>
      )}

      {customRangeLabel && (
        <p className="schedule-period-widget__status">
          表示期間: {customRangeLabel}
        </p>
      )}

      {param.show_period_change_button && isPickerOpen && (
        <div className="schedule-period-widget__picker" role="dialog">
          <p className="schedule-period-widget__picker-title">
            開始日を選択してください
          </p>
          <MonthlyScheduleCalendar
            month={calendarMonth}
            selectedDate={customStartDate}
            availability={monthlyAvailability}
            onChangeMonth={setCalendarMonth}
            onSelectDate={(date) => {
              const normalized = dateAtMorning(date);
              setCustomRange({
                loading: true,
                error: null,
                schedule: [],
              });
              setCustomStartDate(normalized);
              setDisplayMode("custom");
              setIsPickerOpen(false);
            }}
          />
        </div>
      )}

      {widgetBody}
    </div>
  );
}

function hourMapToMinuteList(
  map: models.train_timetable.TrainTimetableHourMap,
): number[] {
  const minutes: number[] = [];
  Object.entries(map).forEach(([hourKey, mins]) => {
    const hour = Number.parseInt(hourKey, 10);
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      return;
    }
    if (!Array.isArray(mins)) {
      return;
    }
    mins.forEach((m) => {
      if (typeof m !== "number" || !Number.isFinite(m) || m < 0 || m > 59) {
        return;
      }
      minutes.push(hour * 60 + m);
    });
  });
  minutes.sort((a, b) => a - b);
  return minutes;
}

function formatHmFromMinutes(total: number): string {
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function nowMinutesLocal(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function timeOnlyToMinutes(value: cmn.time.TimeOnly): number {
  return value.h * 60 + value.m;
}

function resolveNextTrainIds(
  param: dto.web_home_widget.WebHomeWidgetParamNextTrain,
): knowledge.train_timetable.TrainTimetableID[] {
  if (param.mode === "always") {
    return param.timetable_ids;
  }

  const now = nowMinutesLocal();
  return now < timeOnlyToMinutes(param.switch_time)
    ? param.before_ids
    : param.after_ids;
}

function renderTimetablePopup(
  timetable: models.train_timetable.TrainTimetableHourMap,
  onClose: () => void,
): React.ReactNode {
  const hours = Object.keys(timetable)
    .map((h) => Number.parseInt(h, 10))
    .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23)
    .sort((a, b) => a - b);

  return (
    <div className="widget-popup-backdrop" role="dialog" aria-modal="true">
      <div className="widget-popup">
        <div className="widget-popup__header">
          <h3>時刻表</h3>
          <button type="button" className="button ghost" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="widget-popup__body">
          <table className="timetable-table">
            <tbody>
              {hours.map((h) => {
                const mins = Array.isArray(timetable[String(h)])
                  ? (timetable[String(h)] as number[])
                  : [];
                const safe = mins
                  .filter((m) => Number.isFinite(m) && m >= 0 && m <= 59)
                  .sort((a, b) => a - b);
                return (
                  <tr key={`h-${h}`}>
                    <th>{String(h).padStart(2, "0")}</th>
                    <td>
                      {safe.length > 0
                        ? safe.map((m) => String(m).padStart(2, "0")).join(" ")
                        : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NextTrainWidget({
  param,
  trainTimetables,
}: {
  param: dto.web_home_widget.WebHomeWidgetParamNextTrain;
  trainTimetables: Map<
    knowledge.train_timetable.TrainTimetableID,
    models.train_timetable.TrainTimetableHourMap
  >;
}): React.ReactNode {
  const ids = resolveNextTrainIds(param);
  const now = nowMinutesLocal();
  const [openTimetableId, setOpenTimetableId] =
    useState<knowledge.train_timetable.TrainTimetableID | null>(null);

  if (ids.length === 0) {
    return <p className="widget-empty">表示対象の時刻表が未設定です。</p>;
  }

  return (
    <div className="next-train-widget">
      <div className="next-train-widget__list">
        {ids.map((id) => {
          const meta = knowledge.train_timetable.TrainTimetables[id];
          const timetable = trainTimetables.get(id) ?? null;
          const minuteList = timetable ? hourMapToMinuteList(timetable) : [];
          const nextList = minuteList
            .filter((m) => m >= now)
            .slice(0, param.show_count);

          return (
            <button
              key={id}
              type="button"
              className="panel widget-next-train__card"
              onClick={() => {
                if (timetable) {
                  setOpenTimetableId(id);
                }
              }}
            >
              <h4 className="widget-next-train__title">
                {meta.line} {meta.station} → {meta.direction}方面
              </h4>
              {!timetable && (
                <p className="widget-empty">時刻表を取得できませんでした。</p>
              )}
              {timetable && nextList.length === 0 && (
                <p className="widget-empty">終電後か、以降の便がありません。</p>
              )}
              {timetable && nextList.length > 0 && (
                <ul className="widget-next-train__times">
                  {nextList.map((t) => {
                    const diff = t - now;
                    const label =
                      param.time_format === "in_minutes"
                        ? `あと${diff}分`
                        : formatHmFromMinutes(t);
                    const sub =
                      param.time_format === "in_minutes"
                        ? `(${formatHmFromMinutes(t)})`
                        : `(${diff}分後)`;
                    return (
                      <li key={`${id}-${t}`}>
                        <strong>{label}</strong> <span>{sub}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {timetable && <p className="widget-hint">タップで時刻表を表示</p>}
            </button>
          );
        })}
      </div>

      {openTimetableId &&
        renderTimetablePopup(trainTimetables.get(openTimetableId) ?? {}, () =>
          setOpenTimetableId(null),
        )}
    </div>
  );
}

function renderWidgetBody(
  authUserId: string,
  widget: dto.web_home_widget.WebHomeWidgetWithParam,
  personalSchedule: models.schedule.PersonalMonSkd,
  scheduleStartDate: Date | null,
  personalTimetable: models.schedule.CommonWeeklyTimetable,
  homeClassTimetable: models.schedule.OriginalWeeklyTimetable,
  cafeMenu: models.cafemenu.DailyCafeMenu[],
  trainTimetables: Map<
    knowledge.train_timetable.TrainTimetableID,
    models.train_timetable.TrainTimetableHourMap
  >,
  onOpenSessionMemoEdit: (target: SessionMemoEditTarget) => void,
  onOpenDailyMemoEdit: (target: DailyMemoEditTarget) => void,
): React.ReactNode {
  switch (widget.type) {
    case dto.web_home_widget.WebHomeWidgetType.PersonalSchedule:
      return (
        <PersonalScheduleWithPeriodControl
          authUserId={authUserId}
          param={widget.param}
          baseSchedule={personalSchedule}
          baseScheduleStartDate={scheduleStartDate}
          personalTimetable={personalTimetable}
          homeClassTimetable={homeClassTimetable}
          onOpenSessionMemoEdit={onOpenSessionMemoEdit}
          onOpenDailyMemoEdit={onOpenDailyMemoEdit}
        />
      );

    case dto.web_home_widget.WebHomeWidgetType.CafeMenu:
      return renderCafeMenuWidget(widget.param, cafeMenu);

    case dto.web_home_widget.WebHomeWidgetType.NextTrain:
      return (
        <NextTrainWidget
          param={widget.param}
          trainTimetables={trainTimetables}
        />
      );

    case dto.web_home_widget.WebHomeWidgetType.PersonalTimetable:
      return renderPersonalTimetableWidget(widget.param, personalTimetable);

    case dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable:
      return renderHomeClassTimetableWidget(widget.param, homeClassTimetable);
  }
}

export function HomeWidgetList({
  authUser,
  onLoadingStateChange,
  onUiSettingsButtonVisibilityChange,
}: HomeWidgetListProps) {
  const router = useRouter();
  const [state, setState] = useState<HomeWidgetState>({
    config: null,
    scheduleStartDate: null,
    personalSchedule: [],
    personalTimetable: new Map(),
    homeClassTimetable: new Map(),
    cafeMenu: [],
    trainTimetables: new Map(),
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [memoEditTarget, setMemoEditTarget] =
    useState<SessionMemoEditTarget | null>(null);
  const [personalMemoDraft, setPersonalMemoDraft] = useState<string>("");
  const [sharedMemoDraft, setSharedMemoDraft] = useState<string>("");
  const [isSavingMemo, setIsSavingMemo] = useState<boolean>(false);
  const [memoSaveError, setMemoSaveError] = useState<string | null>(null);
  const [dailyMemoEditTarget, setDailyMemoEditTarget] =
    useState<DailyMemoEditTarget | null>(null);
  const [dailyMemoDraft, setDailyMemoDraft] = useState<string>("");
  const [isSavingDailyMemo, setIsSavingDailyMemo] = useState<boolean>(false);
  const [dailyMemoSaveError, setDailyMemoSaveError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    onLoadingStateChange?.(isLoading);
  }, [isLoading, onLoadingStateChange]);

  useEffect(() => {
    if (state.config === null) {
      return;
    }

    onUiSettingsButtonVisibilityChange?.(state.config.show_ui_settings_button);
  }, [onUiSettingsButtonVisibilityChange, state.config]);

  const widgets = useMemo(
    () =>
      asArray<dto.web_home_widget.WebHomeWidgetWithParam>(
        state.config?.widgets,
      ),
    [state.config],
  );

  const resolvedPersonalTimetable = useMemo(
    () =>
      resolveCommonWeeklyTimetable(
        state.personalTimetable,
        state.homeClassTimetable,
      ),
    [state.personalTimetable, state.homeClassTimetable],
  );

  useEffect(() => {
    let cancelled = false;

    const loadWidgets = async () => {
      setIsLoading(true);
      setError(null);
      setMemoSaveError(null);
      setDailyMemoSaveError(null);

      const currentDate = todayAtMorning();
      const currentDatePath = {
        year: currentDate.getUTCFullYear(),
        month: currentDate.getUTCMonth() + 1,
        day: currentDate.getUTCDate(),
      };

      const batchCalls: ApiBatchCall[] = [
        {
          key: "web-ui",
          endpoint:
            api.endpoints.API_ENDPOINTS[
              api.endpoints.APIEndpoint.UsersUserIdSettingsWebUiGet
            ],
          pathParams: {
            userId: authUser.id,
          },
          fallbackMessage: "Web UI設定の取得に失敗しました",
          stubCall: () => apiGetUsersUserIdSettingsWebUi(authUser.id),
        },
        {
          key: "personal-timetable",
          endpoint:
            api.endpoints.API_ENDPOINTS[
              api.endpoints.APIEndpoint.UsersUserIdTimetableGet
            ],
          pathParams: {
            userId: authUser.id,
          },
          fallbackMessage: "個人時間割の取得に失敗しました",
          stubCall: () => apiGetUsersUserIdTimetable(authUser.id),
        },
        {
          key: "cafe-menu",
          endpoint:
            api.endpoints.API_ENDPOINTS[
              api.endpoints.APIEndpoint.GlobalCafemenuYearMonthDayGet
            ],
          pathParams: {
            ...currentDatePath,
          },
          queryParams: {
            range_days: HOME_WIDGET_FETCH_MAX_DAYS,
          },
          fallbackMessage: "カフェメニューの取得に失敗しました",
          stubCall: () =>
            apiGetGlobalCafemenuYearMonthDay(
              currentDate,
              HOME_WIDGET_FETCH_MAX_DAYS,
            ),
        },
      ];

      if (authUser.grade !== null && authUser.homeclass !== null) {
        batchCalls.push({
          key: "homeclass-timetable",
          endpoint:
            api.endpoints.API_ENDPOINTS[
              api.endpoints.APIEndpoint
                .GradesGradeHomeClassesHomeClassNumTimetableGet
            ],
          pathParams: {
            grade: authUser.grade,
            homeClassNum: authUser.homeclass,
          },
          fallbackMessage: "クラス共通時間割の取得に失敗しました",
          stubCall: () =>
            apiGetGradesGradeHomeClassesHomeClassNumTimetable(
              authUser.grade as number,
              authUser.homeclass as knowledge.HomeClassNum,
            ),
        });
      }

      const batchResults = await executeBatchCalls(batchCalls);

      const webUiRes = pickBatchResult<
        api.endpoints.ApiUsersUserIdSettingsWebUiGetRes,
        api.endpoints.ApiUsersUserIdSettingsWebUiGetErr
      >(batchResults, "web-ui", "Web UI設定の取得に失敗しました");

      if (isNoAuthApiResult(webUiRes)) {
        if (!cancelled) {
          setIsLoading(false);
          router.replace("/login");
        }
        return;
      }

      const webUiError = handleApiError(webUiRes);
      if (webUiError || webUiRes.type !== "success") {
        if (!cancelled) {
          if (webUiError && shouldShowFatalErrorPage(webUiError)) {
            setIsLoading(false);
            router.replace(buildFatalErrorPageHref(webUiError));
            return;
          }

          const message = resolveWebUiConfigLoadErrorMessage(
            webUiRes,
            webUiError?.message ?? "Web UI設定の取得に失敗しました",
          );
          setError(
            webUiError
              ? {
                  ...webUiError,
                  message,
                }
              : {
                  type: "network_error",
                  message,
                },
          );
          setIsLoading(false);
        }
        return;
      }

      const config = normalizeWebUiConfig(webUiRes.data.config);
      applyThemeFromWebUiConfig(config);
      const requirements = resolveWidgetApiRequirements(config.widgets);

      const emptyScheduleRes: Awaited<
        ReturnType<typeof apiGetUsersUserIdSchedulesYearMonthDay>
      > = {
        type: "success",
        data: { skd: [] },
      };
      const emptyPersonalTimetableRes: Awaited<
        ReturnType<typeof apiGetUsersUserIdTimetable>
      > = {
        type: "success",
        data: { timetable: new Map() },
      };
      const emptyHomeClassTimetableRes: Awaited<
        ReturnType<typeof apiGetGradesGradeHomeClassesHomeClassNumTimetable>
      > = {
        type: "success",
        data: { timetable: new Map() },
      };
      const emptyCafeMenuRes: Awaited<
        ReturnType<typeof apiGetGlobalCafemenuYearMonthDay>
      > = {
        type: "success",
        data: { cafe_menu: [] },
      };

      let personalScheduleBaseDate: Date | null = null;
      let personalScheduleRes: Awaited<
        ReturnType<typeof apiGetUsersUserIdSchedulesYearMonthDay>
      > = emptyScheduleRes;

      if (requirements.needPersonalSchedule) {
        personalScheduleBaseDate = new Date(currentDate);
        personalScheduleBaseDate.setDate(
          personalScheduleBaseDate.getDate() -
            requirements.personalSchedulePastDays,
        );
        personalScheduleBaseDate = dateAtMorning(personalScheduleBaseDate);

        const personalScheduleRangeDays = Math.max(
          1,
          requirements.personalSchedulePastDays +
            requirements.personalScheduleRangeDays,
        );

        personalScheduleRes = await apiGetUsersUserIdSchedulesYearMonthDay(
          authUser.id,
          personalScheduleBaseDate,
          personalScheduleRangeDays,
          {
            includeSharedMemo: requirements.includeSharedMemo,
            includePersonalSessionMemo: requirements.includePersonalSessionMemo,
            includePersonalDailyMemo: requirements.includePersonalDailyMemo,
          },
        );
      }

      const personalTimetableRes = requirements.needPersonalTimetable
        ? pickBatchResult<
            api.endpoints.ApiUsersUserIdTimetableGetRes,
            api.endpoints.ApiUsersUserIdTimetableGetErr
          >(
            batchResults,
            "personal-timetable",
            "個人時間割の取得に失敗しました",
          )
        : emptyPersonalTimetableRes;

      const homeClassTimetableRes =
        requirements.needHomeClassTimetable &&
        authUser.grade !== null &&
        authUser.homeclass !== null
          ? pickBatchResult<
              api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetableGetRes,
              api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetableGetErr
            >(
              batchResults,
              "homeclass-timetable",
              "クラス共通時間割の取得に失敗しました",
            )
          : emptyHomeClassTimetableRes;

      const cafeMenuRes = requirements.needCafeMenu
        ? pickBatchResult<
            api.endpoints.ApiGlobalCafemenuYearMonthDayGetRes,
            api.endpoints.ApiGlobalCafemenuYearMonthDayGetErr
          >(batchResults, "cafe-menu", "カフェメニューの取得に失敗しました")
        : emptyCafeMenuRes;

      const trainTimetables = new Map<
        knowledge.train_timetable.TrainTimetableID,
        models.train_timetable.TrainTimetableHourMap
      >();
      const trainResults: Array<
        Awaited<
          ReturnType<typeof apiGetGlobalTrainTimetableTimetableIdYearMonthDay>
        >
      > = [];

      if (requirements.needTrainTimetables) {
        const trainCalls: ApiBatchCall[] = requirements.trainTimetableIds.map(
          (timetableId) => ({
            key: `train-${timetableId}`,
            endpoint:
              api.endpoints.API_ENDPOINTS[
                api.endpoints.APIEndpoint
                  .GlobalTrainTimetableTimetableIdYearMonthDayGet
              ],
            pathParams: {
              timetableId,
              ...currentDatePath,
            },
            fallbackMessage: "電車時刻表の取得に失敗しました",
            stubCall: () =>
              apiGetGlobalTrainTimetableTimetableIdYearMonthDay(
                timetableId,
                currentDate,
              ),
          }),
        );

        const trainBatchResults = await executeBatchCalls(trainCalls);
        requirements.trainTimetableIds.forEach((timetableId) => {
          const res = pickBatchResult<
            api.endpoints.ApiGlobalTrainTimetableTimetableIdYearMonthDayGetRes,
            api.endpoints.ApiGlobalTrainTimetableTimetableIdYearMonthDayGetErr
          >(
            trainBatchResults,
            `train-${timetableId}`,
            "電車時刻表の取得に失敗しました",
          );
          trainResults.push(res);
          if (res.type === "success") {
            trainTimetables.set(timetableId, res.data.timetable);
          }
        });
      }

      const dataResults = [
        personalScheduleRes,
        personalTimetableRes,
        homeClassTimetableRes,
        cafeMenuRes,
        ...trainResults,
      ] as const;

      if (dataResults.some((result) => isNoAuthApiResult(result))) {
        if (!cancelled) {
          setIsLoading(false);
          router.replace("/login");
        }
        return;
      }

      const personalScheduleError = handleApiError(personalScheduleRes);
      if (personalScheduleError || personalScheduleRes.type !== "success") {
        if (!cancelled) {
          if (
            personalScheduleRes.type === "http_error" &&
            personalScheduleRes.error.code ===
              api.errors.UserDataErrorCode.UserProfileIncomplete
          ) {
            setIsLoading(false);
            router.replace("/setup");
            return;
          }

          if (
            personalScheduleError &&
            shouldShowFatalErrorPage(personalScheduleError)
          ) {
            setIsLoading(false);
            router.replace(buildFatalErrorPageHref(personalScheduleError));
            return;
          }

          const message = resolvePersonalScheduleLoadErrorMessage(
            personalScheduleRes,
            personalScheduleError?.message ?? "個人予定の取得に失敗しました",
          );
          setError(
            personalScheduleError
              ? {
                  ...personalScheduleError,
                  message,
                }
              : {
                  type: "network_error",
                  message,
                },
          );
          setIsLoading(false);
        }
        return;
      }

      const personalTimetableError = handleApiError(personalTimetableRes);
      if (personalTimetableError || personalTimetableRes.type !== "success") {
        if (!cancelled) {
          if (
            personalTimetableError &&
            shouldShowFatalErrorPage(personalTimetableError)
          ) {
            setIsLoading(false);
            router.replace(buildFatalErrorPageHref(personalTimetableError));
            return;
          }

          const message = resolvePersonalTimetableLoadErrorMessage(
            personalTimetableRes,
            personalTimetableError?.message ?? "個人時間割の取得に失敗しました",
          );
          setError(
            personalTimetableError
              ? {
                  ...personalTimetableError,
                  message,
                }
              : {
                  type: "network_error",
                  message,
                },
          );
          setIsLoading(false);
        }
        return;
      }

      const homeClassTimetableError = handleApiError(homeClassTimetableRes);
      if (homeClassTimetableError || homeClassTimetableRes.type !== "success") {
        if (!cancelled) {
          if (
            homeClassTimetableRes.type === "http_error" &&
            homeClassTimetableRes.error.code ===
              api.errors.UserDataErrorCode.UserProfileIncomplete
          ) {
            setIsLoading(false);
            router.replace("/setup");
            return;
          }

          if (
            homeClassTimetableError &&
            shouldShowFatalErrorPage(homeClassTimetableError)
          ) {
            setIsLoading(false);
            router.replace(buildFatalErrorPageHref(homeClassTimetableError));
            return;
          }

          const message = resolveHomeClassTimetableLoadErrorMessage(
            homeClassTimetableRes,
            homeClassTimetableError?.message ??
              "クラス共通時間割の取得に失敗しました",
          );
          setError(
            homeClassTimetableError
              ? {
                  ...homeClassTimetableError,
                  message,
                }
              : {
                  type: "network_error",
                  message,
                },
          );
          setIsLoading(false);
        }
        return;
      }

      const cafeMenuError = handleApiError(cafeMenuRes);
      if (cafeMenuError || cafeMenuRes.type !== "success") {
        if (!cancelled) {
          if (cafeMenuError && shouldShowFatalErrorPage(cafeMenuError)) {
            setIsLoading(false);
            router.replace(buildFatalErrorPageHref(cafeMenuError));
            return;
          }

          const message = resolveCafeMenuLoadErrorMessage(
            cafeMenuRes,
            cafeMenuError?.message ?? "カフェメニューの取得に失敗しました",
          );
          setError(
            cafeMenuError
              ? {
                  ...cafeMenuError,
                  message,
                }
              : {
                  type: "network_error",
                  message,
                },
          );
          setIsLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setState({
          config,
          scheduleStartDate: personalScheduleBaseDate,
          personalSchedule: asArray<models.schedule.PersonalMonSkdDay | null>(
            personalScheduleRes.data.skd,
          ),
          personalTimetable: asMap<
            models.schedule.TimetableSelectionID,
            cmn.Option<models.schedule.PersonalWeeklyTimetableSess>
          >(personalTimetableRes.data.timetable),
          homeClassTimetable: asMap<
            cmn.time.DayOfWeek,
            models.schedule.OriginalWeeklyTimetableSess[]
          >(homeClassTimetableRes.data.timetable),
          cafeMenu: asArray<models.cafemenu.DailyCafeMenu>(
            cafeMenuRes.data.cafe_menu,
          ),
          trainTimetables,
        });
        setIsLoading(false);
      }
    };

    void loadWidgets();

    return () => {
      cancelled = true;
    };
  }, [authUser, router]);

  const openSessionMemoEditor = (target: SessionMemoEditTarget) => {
    setDailyMemoEditTarget(null);
    setMemoEditTarget(target);
    setPersonalMemoDraft(target.personalMemo);
    setSharedMemoDraft(target.sharedMemo);
    setMemoSaveError(null);
  };

  const openDailyMemoEditor = (target: DailyMemoEditTarget) => {
    setMemoEditTarget(null);
    setDailyMemoEditTarget(target);
    setDailyMemoDraft(target.memo);
    setDailyMemoSaveError(null);
  };

  const closeSessionMemoEditor = () => {
    if (isSavingMemo) {
      return;
    }
    setMemoEditTarget(null);
    setMemoSaveError(null);
  };

  const closeDailyMemoEditor = () => {
    if (isSavingDailyMemo) {
      return;
    }
    setDailyMemoEditTarget(null);
    setDailyMemoSaveError(null);
  };

  const saveSessionMemo = async () => {
    if (!memoEditTarget) {
      return;
    }

    if (!state.scheduleStartDate) {
      setMemoSaveError("スケジュール基準日が未取得です");
      return;
    }

    const day = state.personalSchedule[memoEditTarget.dayIndex];
    const sess = day?.sess[memoEditTarget.periodIndex];
    if (!sess || sess.isNone()) {
      setMemoSaveError("編集対象の授業が見つかりませんでした");
      return;
    }

    const current = sess.unwrap();
    const nextPersonal = personalMemoDraft.trim();
    const nextShared = sharedMemoDraft.trim();
    const currentPersonal = current.personal_memo.mapOr("", (value) => value);
    const currentShared = current.shared_memo.mapOr("", (value) => value);

    const isPersonalChanged = currentPersonal !== nextPersonal;
    const isSharedChanged = currentShared !== nextShared;

    if (!isPersonalChanged && !isSharedChanged) {
      setMemoEditTarget(null);
      setMemoSaveError(null);
      return;
    }

    const targetDate = new Date(state.scheduleStartDate);
    targetDate.setDate(targetDate.getDate() + memoEditTarget.dayIndex);
    const period = memoEditTarget.periodIndex + 1;

    const applyMemoPatchToState = (
      applyPersonal: boolean,
      applyShared: boolean,
    ) => {
      setState((prev) => {
        const updatedSchedule =
          asArray<models.schedule.PersonalMonSkdDay | null>(
            prev.personalSchedule,
          ).map((scheduleDay, dayIndex) => {
            if (dayIndex !== memoEditTarget.dayIndex) {
              return scheduleDay;
            }

            if (scheduleDay === null) {
              return scheduleDay;
            }

            const sessions = asArray<
              cmn.Option<models.schedule.PersonalMonSkdDaySess>
            >(scheduleDay.sess);

            return {
              ...scheduleDay,
              sess: sessions.map((session, sessionIndex) => {
                if (
                  sessionIndex !== memoEditTarget.periodIndex ||
                  session.isNone()
                ) {
                  return session;
                }

                const value = session.unwrap();
                return cmn.Some({
                  ...value,
                  personal_memo: applyPersonal
                    ? nextPersonal
                      ? cmn.Some(nextPersonal)
                      : cmn.None<string>()
                    : value.personal_memo,
                  shared_memo: applyShared
                    ? nextShared
                      ? cmn.Some(nextShared)
                      : cmn.None<string>()
                    : value.shared_memo,
                });
              }),
            };
          });

        return {
          ...prev,
          personalSchedule: updatedSchedule,
        };
      });
    };

    setIsSavingMemo(true);
    setMemoSaveError(null);

    let personalSaved = false;

    if (isPersonalChanged) {
      const result =
        await apiPutUsersUserIdSchedulesYearMonthDayPeriodMemoPersonal(
          authUser.id,
          targetDate,
          period,
          nextPersonal.length > 0 ? nextPersonal : null,
        );
      if (isNoAuthApiResult(result)) {
        setIsSavingMemo(false);
        router.replace("/login");
        return;
      }

      const error = handleApiError(result);
      if (error || result.type !== "success") {
        setIsSavingMemo(false);

        if (error && shouldShowFatalErrorPage(error)) {
          router.push(buildFatalErrorPageHref(error));
          return;
        }

        setMemoSaveError(
          resolvePersonalMemoSaveErrorMessage(
            result,
            error?.message ?? "個人メモの保存に失敗しました",
          ),
        );
        return;
      }

      personalSaved = true;
    }

    if (isSharedChanged) {
      const result =
        await apiPutUsersUserIdSchedulesYearMonthDayPeriodMemoShared(
          authUser.id,
          targetDate,
          period,
          nextShared.length > 0 ? nextShared : null,
        );
      if (isNoAuthApiResult(result)) {
        setIsSavingMemo(false);
        router.replace("/login");
        return;
      }

      const error = handleApiError(result);
      if (error || result.type !== "success") {
        setIsSavingMemo(false);

        if (error && shouldShowFatalErrorPage(error)) {
          router.push(buildFatalErrorPageHref(error));
          return;
        }

        if (personalSaved) {
          applyMemoPatchToState(true, false);
        }

        const baseMessage = resolveSharedMemoSaveErrorMessage(
          result,
          error?.message ?? "共通メモの保存に失敗しました",
        );
        setMemoSaveError(
          personalSaved
            ? `${baseMessage}（個人メモは保存済みです）`
            : baseMessage,
        );
        return;
      }
    }

    applyMemoPatchToState(isPersonalChanged, isSharedChanged);

    setIsSavingMemo(false);

    setMemoEditTarget(null);
    setMemoSaveError(null);
  };

  const saveDailyMemo = async () => {
    if (!dailyMemoEditTarget) {
      return;
    }

    if (!state.scheduleStartDate) {
      setDailyMemoSaveError("スケジュール基準日が未取得です");
      return;
    }

    const nextDailyMemo = dailyMemoDraft.trim();
    const currentDailyMemo =
      state.personalSchedule[dailyMemoEditTarget.dayIndex]?.daily_memo.mapOr(
        "",
        (memo) => memo.trim(),
      ) ?? "";

    if (nextDailyMemo === currentDailyMemo) {
      setDailyMemoEditTarget(null);
      setDailyMemoSaveError(null);
      return;
    }

    const targetDate = new Date(state.scheduleStartDate);
    targetDate.setDate(targetDate.getDate() + dailyMemoEditTarget.dayIndex);

    setIsSavingDailyMemo(true);
    setDailyMemoSaveError(null);

    const result =
      await apiPutUsersUserIdSchedulesYearMonthDayMemoPersonalDaily(
        authUser.id,
        targetDate,
        nextDailyMemo.length > 0 ? nextDailyMemo : null,
      );
    if (isNoAuthApiResult(result)) {
      setIsSavingDailyMemo(false);
      router.replace("/login");
      return;
    }

    const error = handleApiError(result);
    if (error || result.type !== "success") {
      setIsSavingDailyMemo(false);

      if (error && shouldShowFatalErrorPage(error)) {
        router.push(buildFatalErrorPageHref(error));
        return;
      }

      setDailyMemoSaveError(
        error?.message ?? "デイリーメモの保存に失敗しました",
      );
      return;
    }

    setState((prev) => {
      const updatedSchedule = asArray<models.schedule.PersonalMonSkdDay | null>(
        prev.personalSchedule,
      ).map((scheduleDay, dayIndex) => {
        if (dayIndex !== dailyMemoEditTarget.dayIndex || scheduleDay === null) {
          return scheduleDay;
        }

        return {
          ...scheduleDay,
          daily_memo: nextDailyMemo
            ? cmn.Some(nextDailyMemo)
            : cmn.None<string>(),
        };
      });

      return {
        ...prev,
        personalSchedule: updatedSchedule,
      };
    });

    setIsSavingDailyMemo(false);
    setDailyMemoEditTarget(null);
    setDailyMemoSaveError(null);
  };

  if (isLoading) {
    return null;
  }

  if (error) {
    return (
      <section className="panel panel-error">
        <h2>ウィジェットの読み込みに失敗しました</h2>
        <p>{error.message}</p>
      </section>
    );
  }

  if (widgets.length === 0) {
    return (
      <section className="panel">
        <p>表示するウィジェットが設定されていません。</p>
      </section>
    );
  }

  return (
    <>
      {(authUser.grade === null || authUser.homeclass === null) && (
        <section className="panel panel-error">
          <h2>プロフィール未設定の項目があります</h2>
          <p>
            学年またはクラスが未設定のため、クラス時間割の表示に制限がかかる場合があります。
          </p>
        </section>
      )}

      <div className="widget-grid">
        {widgets.map((widget, idx) => (
          <section
            id={widgetDomId(widget.type)}
            className="widget-frame widget-frame--guided"
            key={`${widget.type}-${idx}`}
          >
            <header className="widget-frame__header">
              <h3>{WIDGET_TITLE[widget.type]}</h3>
            </header>
            <div className="widget-frame__body">
              {renderWidgetBody(
                authUser.id,
                widget,
                state.personalSchedule,
                state.scheduleStartDate,
                resolvedPersonalTimetable,
                state.homeClassTimetable,
                state.cafeMenu,
                state.trainTimetables,
                openSessionMemoEditor,
                openDailyMemoEditor,
              )}
            </div>
          </section>
        ))}
      </div>

      {memoEditTarget && (
        <div
          className="memo-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-label="授業メモの編集"
        >
          <div className="memo-edit-modal__backdrop" />
          <section className="memo-edit-modal__panel">
            <header className="memo-edit-modal__header">
              <h4>授業メモを編集</h4>
              <p>{memoEditTarget.title}</p>
            </header>
            <label className="memo-edit-modal__field">
              <FormFieldLabel>個人メモ</FormFieldLabel>
              <p className="memo-edit-modal__scope-note">
                ※このメモは自分だけに表示されます。
              </p>
              <textarea
                value={personalMemoDraft}
                onChange={(event) => {
                  setPersonalMemoDraft(event.target.value);
                }}
                rows={4}
                disabled={isSavingMemo}
              />
            </label>
            <label className="memo-edit-modal__field">
              <FormFieldLabel>共通メモ</FormFieldLabel>
              <p className="memo-edit-modal__scope-note">
                ※このメモは同じ授業を受ける人全員に共有されます。
              </p>
              <textarea
                value={sharedMemoDraft}
                onChange={(event) => {
                  setSharedMemoDraft(event.target.value);
                }}
                rows={4}
                disabled={isSavingMemo}
              />
            </label>
            <div className="memo-edit-modal__actions">
              <button
                type="button"
                className="button ghost"
                onClick={closeSessionMemoEditor}
                disabled={isSavingMemo}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  void saveSessionMemo();
                }}
                disabled={isSavingMemo}
              >
                {isSavingMemo ? "保存中..." : "保存"}
              </button>
            </div>
          </section>
        </div>
      )}

      {memoSaveError && (
        <ErrorDialog
          title="保存に失敗しました"
          message={memoSaveError}
          onClose={() => {
            setMemoSaveError(null);
          }}
        />
      )}

      {dailyMemoEditTarget && (
        <div
          className="memo-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-label="デイリーメモの編集"
        >
          <div className="memo-edit-modal__backdrop" />
          <section className="memo-edit-modal__panel">
            <header className="memo-edit-modal__header">
              <h4>デイリーメモを編集</h4>
              <p>{dailyMemoEditTarget.title}</p>
            </header>
            <label className="memo-edit-modal__field">
              <FormFieldLabel>デイリーメモ</FormFieldLabel>
              <p className="memo-edit-modal__scope-note">
                ※このメモは自分だけに表示されます。
              </p>
              <textarea
                value={dailyMemoDraft}
                onChange={(event) => {
                  setDailyMemoDraft(event.target.value);
                }}
                rows={6}
                disabled={isSavingDailyMemo}
              />
            </label>
            <div className="memo-edit-modal__actions">
              <button
                type="button"
                className="button ghost"
                onClick={closeDailyMemoEditor}
                disabled={isSavingDailyMemo}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  void saveDailyMemo();
                }}
                disabled={isSavingDailyMemo}
              >
                {isSavingDailyMemo ? "保存中..." : "保存"}
              </button>
            </div>
          </section>
        </div>
      )}

      {dailyMemoSaveError && (
        <ErrorDialog
          title="保存に失敗しました"
          message={dailyMemoSaveError}
          onClose={() => {
            setDailyMemoSaveError(null);
          }}
        />
      )}
    </>
  );
}
