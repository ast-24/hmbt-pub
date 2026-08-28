import * as cmn from "../cmn";
import * as knowledge from "../knowledge";
import * as logic from "../logic";
import * as models from "../models";
import { decodeTimeWindow } from "./decode";
import {
  addUtcDays,
  asNumber,
  dateAtUtcMidnight,
  dateKey,
  parseDateKey,
  parseTimeOnly,
} from "./shared";
import type { SqlOps } from "./sql";
import {
  getOriginalWeeklyTimetable,
  getPersonalWeeklyTimetable,
  getUserGradeAndHomeClass,
  resolveCommonWeeklyTimetableSess,
} from "./timetable";

export type OriginalDayRow = {
  id: number;
  target_date: Date | string;
  start_time: Date | string | null;
  cafeteria_open: number | null;
  study_hall_open: number | null;
  shortened_type: string;
  shortened_details: string | object | null;
};

export type OriginalSessionRow = {
  schedule_day_id: number;
  grade: number;
  period: number;
  session_type: "normal" | "special";
  timetable_pos_dayofweek: number | null;
  timetable_pos_period: number | null;
  special_name: string | null;
  room_id: string | null;
};

export type OriginalEventRow = {
  schedule_day_id: number;
  event_order: number;
  event_text: string;
};

export type SharedSessionMemoRow = {
  memo_date: Date | string;
  period: number;
  target_type: "course" | "special_name";
  target_id: string;
  room_id: string;
  memo: string;
};

export type PersonalSessionMemoRow = {
  memo_date: Date | string;
  period: number;
  memo: string;
};

export type PersonalDailyMemoRow = {
  memo_date: Date | string;
  memo: string;
};

export type ScheduleSessionTargetRow = {
  session_type: "normal" | "special";
  timetable_pos_dayofweek: number | null;
  timetable_pos_period: number | null;
  special_name: string | null;
  room_id: string | null;
};

export type SharedMemoTargetResolutionIssue =
  | "schedule_session_not_found"
  | "invalid_special_session_name"
  | "invalid_normal_session_position"
  | "personal_session_not_found";

export class SharedMemoTargetResolutionError extends Error {
  public readonly issue: SharedMemoTargetResolutionIssue;

  public constructor(issue: SharedMemoTargetResolutionIssue, message: string) {
    super(message);
    this.name = "SharedMemoTargetResolutionError";
    this.issue = issue;
  }
}

export async function selectOriginalDayRows(
  startDateKey: string,
  endDateKey: string,
  sqlOps: SqlOps,
): Promise<OriginalDayRow[]> {
  return sqlOps.selectRows<OriginalDayRow[]>(
    `
      SELECT
        id,
        target_date,
        start_time,
        cafeteria_open,
        study_hall_open,
        shortened_type,
        shortened_details
      FROM original_monthly_schedule_days
      WHERE target_date BETWEEN ? AND ?
      ORDER BY target_date
    `,
    [startDateKey, endDateKey],
  );
}

export async function selectOriginalSessionRows(
  dayIdList: number[],
  grade: number | null,
  sqlOps: SqlOps,
  maxPeriod?: number,
): Promise<OriginalSessionRow[]> {
  if (dayIdList.length === 0) {
    return [];
  }

  const gradeClause = grade === null ? "" : " AND grade = ?";
  const periodClause =
    Number.isInteger(maxPeriod) && (maxPeriod as number) > 0
      ? " AND period <= ?"
      : "";
  const params = [...dayIdList];
  if (grade !== null) {
    params.push(grade);
  }
  if (periodClause) {
    params.push(maxPeriod as number);
  }

  return sqlOps.selectRows<OriginalSessionRow[]>(
    `
      SELECT
        schedule_day_id,
        grade,
        period,
        session_type,
        timetable_pos_dayofweek,
        timetable_pos_period,
        special_name,
        room_id
      FROM original_monthly_schedule_sessions
      WHERE schedule_day_id IN (${dayIdList.map(() => "?").join(",")})
      ${gradeClause}
      ${periodClause}
      ORDER BY schedule_day_id, grade, period
    `,
    params,
  );
}

export async function selectOriginalEventRows(
  dayIdList: number[],
  sqlOps: SqlOps,
): Promise<OriginalEventRow[]> {
  if (dayIdList.length === 0) {
    return [];
  }

  return sqlOps.selectRows<OriginalEventRow[]>(
    `
      SELECT schedule_day_id, event_order, event_text
      FROM original_monthly_schedule_events
      WHERE schedule_day_id IN (${dayIdList.map(() => "?").join(",")})
      ORDER BY schedule_day_id, event_order
    `,
    dayIdList,
  );
}

export async function selectSharedSessionMemoRows(
  startDateKey: string,
  endDateKey: string,
  targetFilter: {
    course_ids: string[];
    special_names: string[];
  } | null,
  sqlOps: SqlOps,
  maxPeriod?: number,
): Promise<SharedSessionMemoRow[]> {
  if (
    targetFilter &&
    targetFilter.course_ids.length === 0 &&
    targetFilter.special_names.length === 0
  ) {
    return [];
  }

  const whereParts: string[] = ["memo_date BETWEEN ? AND ?"];
  const params: Array<string | number> = [startDateKey, endDateKey];

  if (Number.isInteger(maxPeriod) && (maxPeriod as number) > 0) {
    whereParts.push("period <= ?");
    params.push(maxPeriod as number);
  }

  if (targetFilter) {
    const subParts: string[] = [];

    if (targetFilter.course_ids.length > 0) {
      subParts.push(
        `(target_type = 'course' AND target_id IN (${targetFilter.course_ids
          .map(() => "?")
          .join(",")}))`,
      );
      params.push(...targetFilter.course_ids);
    }

    if (targetFilter.special_names.length > 0) {
      subParts.push(
        `(target_type = 'special_name' AND target_id IN (${targetFilter.special_names
          .map(() => "?")
          .join(",")}))`,
      );
      params.push(...targetFilter.special_names);
    }

    if (subParts.length > 0) {
      whereParts.push(`(${subParts.join(" OR ")})`);
    }
  }

  return sqlOps.selectRows<SharedSessionMemoRow[]>(
    `
      SELECT memo_date, period, target_type, target_id, room_id, memo
      FROM shared_session_memos
      WHERE ${whereParts.join(" AND ")}
      ORDER BY memo_date, period
    `,
    params,
  );
}

export async function selectPersonalSessionMemoRows(
  userId: string,
  startDateKey: string,
  endDateKey: string,
  sqlOps: SqlOps,
  maxPeriod?: number,
): Promise<PersonalSessionMemoRow[]> {
  const periodClause =
    Number.isInteger(maxPeriod) && (maxPeriod as number) > 0
      ? "\n        AND period <= ?"
      : "";

  const params: Array<string | number> = [userId, startDateKey, endDateKey];
  if (periodClause) {
    params.push(maxPeriod as number);
  }

  return sqlOps.selectRows<PersonalSessionMemoRow[]>(
    `
      SELECT memo_date, period, memo
      FROM personal_session_memos
      WHERE user_id = ?
        AND memo_date BETWEEN ? AND ?
        ${periodClause}
      ORDER BY memo_date, period
    `,
    params,
  );
}

export interface BuildPersonalScheduleRangeOptions {
  max_period?: number;
  include_shared_memo?: boolean;
  include_personal_session_memo?: boolean;
  include_personal_daily_memo?: boolean;
}

export async function selectPersonalDailyMemoRows(
  userId: string,
  startDateKey: string,
  endDateKey: string,
  sqlOps: SqlOps,
): Promise<PersonalDailyMemoRow[]> {
  return sqlOps.selectRows<PersonalDailyMemoRow[]>(
    `
      SELECT memo_date, memo
      FROM personal_daily_memos
      WHERE user_id = ?
        AND memo_date BETWEEN ? AND ?
      ORDER BY memo_date
    `,
    [userId, startDateKey, endDateKey],
  );
}

export async function upsertPersonalSessionMemo(
  userId: string,
  memoDate: string,
  period: number,
  memo: string,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO personal_session_memos (user_id, memo_date, period, memo)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        memo = VALUES(memo),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [userId, memoDate, period, memo],
  );
}

export async function deletePersonalSessionMemo(
  userId: string,
  memoDate: string,
  period: number,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      DELETE FROM personal_session_memos
      WHERE user_id = ?
        AND memo_date = ?
        AND period = ?
    `,
    [userId, memoDate, period],
  );
}

export async function upsertPersonalDailyMemo(
  userId: string,
  memoDate: string,
  memo: string,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO personal_daily_memos (user_id, memo_date, memo)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        memo = VALUES(memo),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [userId, memoDate, memo],
  );
}

export async function deletePersonalDailyMemo(
  userId: string,
  memoDate: string,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      DELETE FROM personal_daily_memos
      WHERE user_id = ?
        AND memo_date = ?
    `,
    [userId, memoDate],
  );
}

export async function getPersonalDailyMemoByDate(
  userId: string,
  memoDate: string,
  sqlOps: SqlOps,
): Promise<string | null> {
  const rows = await sqlOps.selectRows<Array<{ memo: string }>>(
    `
      SELECT memo
      FROM personal_daily_memos
      WHERE user_id = ?
        AND memo_date = ?
      LIMIT 1
    `,
    [userId, memoDate],
  );

  return rows[0]?.memo ?? null;
}

export async function selectScheduleSessionTarget(
  memoDate: string,
  grade: number,
  period: number,
  sqlOps: SqlOps,
): Promise<ScheduleSessionTargetRow | null> {
  const rows = await sqlOps.selectRows<ScheduleSessionTargetRow[]>(
    `
      SELECT
        sess.session_type,
        sess.timetable_pos_dayofweek,
        sess.timetable_pos_period,
        sess.special_name,
        sess.room_id
      FROM original_monthly_schedule_days day
      JOIN original_monthly_schedule_sessions sess
        ON sess.schedule_day_id = day.id
      WHERE day.target_date = ?
        AND sess.grade = ?
        AND sess.period = ?
      LIMIT 1
    `,
    [memoDate, grade, period],
  );

  return rows[0] ?? null;
}

export async function upsertSharedSessionMemo(
  memoDate: string,
  period: number,
  targetType: "course" | "special_name",
  targetId: string,
  roomId: string,
  memo: string,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO shared_session_memos
        (memo_date, period, target_type, target_id, room_id, memo)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        memo = VALUES(memo),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [memoDate, period, targetType, targetId, roomId, memo],
  );
}

export async function deleteSharedSessionMemo(
  memoDate: string,
  period: number,
  targetType: "course" | "special_name",
  targetId: string,
  roomId: string,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      DELETE FROM shared_session_memos
      WHERE memo_date = ?
        AND period = ?
        AND target_type = ?
        AND target_id = ?
        AND room_id = ?
    `,
    [memoDate, period, targetType, targetId, roomId],
  );
}

function buildUnknownShortened(
  detailsRaw: unknown,
): models.schedule.OriginalMonSkdShortened {
  if (
    typeof detailsRaw === "object" &&
    detailsRaw !== null &&
    !Array.isArray(detailsRaw) &&
    "afternoon_start_period" in detailsRaw
  ) {
    const rawValue = (detailsRaw as { afternoon_start_period: unknown })
      .afternoon_start_period;
    if (rawValue === null || rawValue === undefined) {
      return {
        type: "unknown",
        afternoon_start_period: cmn.None(),
      };
    }
    return {
      type: "unknown",
      afternoon_start_period: cmn.Some(asNumber(rawValue, 5)),
    };
  }

  return {
    type: "unknown",
    afternoon_start_period: cmn.None(),
  };
}

function parseShortened(
  shortenedType: string,
  shortenedDetails: unknown,
): models.schedule.OriginalMonSkdShortened {
  switch (shortenedType) {
    case "common": {
      let bell = knowledge.bell_skd.CommonBellSkd.Normal;
      if (
        typeof shortenedDetails === "object" &&
        shortenedDetails !== null &&
        !Array.isArray(shortenedDetails) &&
        "bell_schedule" in shortenedDetails
      ) {
        const value = String(
          (shortenedDetails as { bell_schedule: unknown }).bell_schedule,
        );
        if (
          value === knowledge.bell_skd.CommonBellSkd.Normal ||
          value === knowledge.bell_skd.CommonBellSkd.ShortenedA ||
          value === knowledge.bell_skd.CommonBellSkd.ShortenedB ||
          value === knowledge.bell_skd.CommonBellSkd.ShortenedC
        ) {
          bell = value;
        }
      }
      return {
        type: "common",
        bell_schedule: bell,
      };
    }
    case "special": {
      let windows: cmn.time.TimeWindow[] = [];
      if (
        typeof shortenedDetails === "object" &&
        shortenedDetails !== null &&
        !Array.isArray(shortenedDetails) &&
        "windows" in shortenedDetails
      ) {
        const rawWindows = (shortenedDetails as { windows: unknown }).windows;
        if (Array.isArray(rawWindows)) {
          windows = rawWindows.map((windowRaw) => decodeTimeWindow(windowRaw));
        }
      }
      return {
        type: "special",
        windows,
      };
    }
    case "unknown":
    default:
      return buildUnknownShortened(shortenedDetails);
  }
}

function makeSharedMemoPeriod(): models.schedule.SharedSessMemoDayPeriod {
  return {
    by_course: new Map(),
    by_name: new Map(),
  };
}

function ensureByCourseEntry(
  bucket: models.schedule.SharedSessMemoDayPeriod["by_course"],
  key: knowledge.course.CourseID,
): {
  with_room: Map<
    knowledge.room.RoomID,
    models.schedule.SharedSessMemoDayPeriodSess
  >;
  without_room: models.schedule.SharedSessMemoDayPeriodSess;
} {
  const existing = bucket.get(key);
  if (existing) {
    return existing;
  }

  const created = {
    with_room: new Map<
      knowledge.room.RoomID,
      models.schedule.SharedSessMemoDayPeriodSess
    >(),
    without_room: { memo: "" },
  };
  bucket.set(key, created);
  return created;
}

function ensureByNameEntry(
  bucket: models.schedule.SharedSessMemoDayPeriod["by_name"],
  key: string,
): {
  with_room: Map<
    knowledge.room.RoomID,
    models.schedule.SharedSessMemoDayPeriodSess
  >;
  without_room: models.schedule.SharedSessMemoDayPeriodSess;
} {
  const existing = bucket.get(key);
  if (existing) {
    return existing;
  }

  const created = {
    with_room: new Map<
      knowledge.room.RoomID,
      models.schedule.SharedSessMemoDayPeriodSess
    >(),
    without_room: { memo: "" },
  };
  bucket.set(key, created);
  return created;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toValidGradeIndex(value: number): number | null {
  if (!Number.isInteger(value) || value < 0 || value > 12) {
    return null;
  }
  return value;
}

function toValidPeriod(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function toValidDayOfWeek(
  value: number | null | undefined,
): cmn.time.DayOfWeek | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 6
  ) {
    return null;
  }
  return value as cmn.time.DayOfWeek;
}

function toDayOfWeek(
  value: number | null | undefined,
  fallback: cmn.time.DayOfWeek = 0,
): cmn.time.DayOfWeek {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  ) {
    return value as cmn.time.DayOfWeek;
  }
  return fallback;
}

function collectSharedMemoTargetFilter(
  sessionRows: OriginalSessionRow[],
  originalWeeklyTimetable: models.schedule.OriginalWeeklyTimetable,
  personalWeeklyTimetable: models.schedule.PersonalWeeklyTimetable,
): {
  course_ids: string[];
  special_names: string[];
} {
  const courseIds = new Set<string>();
  const specialNames = new Set<string>();

  sessionRows.forEach((row) => {
    if (row.session_type === "special") {
      const name = (row.special_name ?? "").trim();
      if (name.length > 0) {
        specialNames.add(name);
      }
      return;
    }

    const weekday = toValidDayOfWeek(row.timetable_pos_dayofweek);
    const period = toValidPeriod(row.timetable_pos_period);
    if (weekday === null || period === null) {
      return;
    }

    const classSess = originalWeeklyTimetable.get(weekday)?.[period - 1];
    const resolved = resolveCommonWeeklyTimetableSess(
      classSess,
      personalWeeklyTimetable,
    );
    if (resolved.isSome()) {
      courseIds.add(resolved.unwrap().course);
    }
  });

  return {
    course_ids: [...courseIds],
    special_names: [...specialNames],
  };
}

function toRoomIdOption(
  roomId: string | null | undefined,
): cmn.Option<knowledge.room.RoomID> {
  if (typeof roomId !== "string" || roomId.length === 0) {
    return cmn.None();
  }
  return cmn.Some(roomId as knowledge.room.RoomID);
}

function monthDateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function encodeShortened(shortened: models.schedule.OriginalMonSkdShortened): {
  type: "common" | "special" | "unknown";
  details: object;
} {
  switch (shortened.type) {
    case "common":
      return {
        type: "common",
        details: {
          bell_schedule: shortened.bell_schedule,
        },
      };
    case "special":
      return {
        type: "special",
        details: {
          windows: shortened.windows,
        },
      };
    case "unknown":
      return {
        type: "unknown",
        details: {
          afternoon_start_period: shortened.afternoon_start_period.mapOr(
            null,
            (value) => value,
          ),
        },
      };
  }
}

function timeOnlyOptionToSql(
  value: cmn.Option<cmn.time.TimeOnly>,
): string | null {
  return value.mapOr<string | null>(null, (time) => {
    const hh = String(time.h).padStart(2, "0");
    const mm = String(time.m).padStart(2, "0");
    return `${hh}:${mm}:00`;
  });
}

export async function getOriginalMonthlySchedule(
  year: number,
  month: number,
  sqlOps: SqlOps,
): Promise<Array<models.schedule.OriginalMonSkdDay | null>> {
  const totalDays = daysInMonth(year, month);
  const startKey = monthDateKey(year, month, 1);
  const endKey = monthDateKey(year, month, totalDays);

  const dayRows = await selectOriginalDayRows(startKey, endKey, sqlOps);
  const dayIdList = dayRows.map((row) => row.id);
  const sessionRows = await selectOriginalSessionRows(dayIdList, null, sqlOps);
  const eventRows = await selectOriginalEventRows(dayIdList, sqlOps);

  const dayByKey = new Map<string, OriginalDayRow>();
  const dayIdToKey = new Map<number, string>();

  dayRows.forEach((row) => {
    const key = parseDateKey(row.target_date);
    dayByKey.set(key, row);
    dayIdToKey.set(row.id, key);
  });

  const sessionsByDate = new Map<string, OriginalSessionRow[]>();
  sessionRows.forEach((row) => {
    const key = dayIdToKey.get(row.schedule_day_id);
    if (!key) {
      return;
    }
    const list = sessionsByDate.get(key) ?? [];
    list.push(row);
    sessionsByDate.set(key, list);
  });

  const eventsByDate = new Map<string, string[]>();
  eventRows.forEach((row) => {
    const key = dayIdToKey.get(row.schedule_day_id);
    if (!key) {
      return;
    }
    const list = eventsByDate.get(key) ?? [];
    list.push(row.event_text);
    eventsByDate.set(key, list);
  });

  const result: Array<models.schedule.OriginalMonSkdDay | null> = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const key = monthDateKey(year, month, day);
    const dayRow = dayByKey.get(key);
    if (!dayRow) {
      result.push(null);
      continue;
    }

    const daySessions = sessionsByDate.get(key) ?? [];
    const sessByGrade: models.schedule.OriginalMonSkdSessByGrade[] = [];
    for (let grade = 0; grade <= 12; grade += 1) {
      sessByGrade[grade] = [];
    }

    daySessions.forEach((session) => {
      const gradeIndex = toValidGradeIndex(session.grade);
      const period = toValidPeriod(session.period);
      if (gradeIndex === null || period === null) {
        return;
      }

      const target = sessByGrade[gradeIndex] ?? [];
      while (target.length < period) {
        target.push({
          type: "special",
          name: "",
          room: cmn.None(),
        });
      }

      if (session.session_type === "normal") {
        target[period - 1] = {
          type: "normal",
          timetable_position: {
            dayofweek: toDayOfWeek(session.timetable_pos_dayofweek),
            period: toValidPeriod(session.timetable_pos_period) ?? period,
          },
        };
      } else {
        target[period - 1] = {
          type: "special",
          name: session.special_name ?? "",
          room: toRoomIdOption(session.room_id),
        };
      }

      sessByGrade[gradeIndex] = target;
    });

    let shortenedDetails: unknown = dayRow.shortened_details;
    if (typeof shortenedDetails === "string") {
      try {
        shortenedDetails = JSON.parse(shortenedDetails);
      } catch {
        shortenedDetails = {};
      }
    }

    result.push({
      sess_by_grade: sessByGrade,
      start_time: parseTimeOnly(dayRow.start_time),
      shortened: parseShortened(dayRow.shortened_type, shortenedDetails),
      events: eventsByDate.get(key) ?? [],
      cafeteria_open:
        dayRow.cafeteria_open !== null
          ? cmn.Some(!!dayRow.cafeteria_open)
          : cmn.None(),
      study_hall_open:
        dayRow.study_hall_open !== null
          ? cmn.Some(!!dayRow.study_hall_open)
          : cmn.None(),
    });
  }

  return result;
}

export async function putOriginalMonthlySchedule(
  year: number,
  month: number,
  skd: Array<models.schedule.OriginalMonSkdDay | null>,
  sqlOps: SqlOps,
): Promise<void> {
  const totalDays = daysInMonth(year, month);

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
    const day = skd[dayIndex] ?? null;
    const targetDate = monthDateKey(year, month, dayIndex + 1);

    if (day === null) {
      await sqlOps.executeSql(
        `DELETE FROM original_monthly_schedule_days WHERE target_date = ?`,
        [targetDate],
      );
      continue;
    }

    const shortened = encodeShortened(day.shortened);
    await sqlOps.executeSql(
      `
        INSERT INTO original_monthly_schedule_days
          (
            target_date,
            start_time,
            cafeteria_open,
            study_hall_open,
            shortened_type,
            shortened_details
          )
        VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))
        ON DUPLICATE KEY UPDATE
          start_time = VALUES(start_time),
          cafeteria_open = VALUES(cafeteria_open),
          study_hall_open = VALUES(study_hall_open),
          shortened_type = VALUES(shortened_type),
          shortened_details = VALUES(shortened_details),
          updated_at = CURRENT_TIMESTAMP(3)
      `,
      [
        targetDate,
        timeOnlyOptionToSql(day.start_time),
        day.cafeteria_open.mapOr<boolean | null>(null, (value) => value),
        day.study_hall_open.mapOr<boolean | null>(null, (value) => value),
        shortened.type,
        JSON.stringify(shortened.details),
      ],
    );

    const dayRows = await sqlOps.selectRows<Array<{ id: number }>>(
      `
        SELECT id
        FROM original_monthly_schedule_days
        WHERE target_date = ?
        LIMIT 1
      `,
      [targetDate],
    );
    const scheduleDayId = dayRows[0]?.id;
    if (!scheduleDayId) {
      continue;
    }

    await sqlOps.executeSql(
      `DELETE FROM original_monthly_schedule_sessions WHERE schedule_day_id = ?`,
      [scheduleDayId],
    );
    await sqlOps.executeSql(
      `DELETE FROM original_monthly_schedule_events WHERE schedule_day_id = ?`,
      [scheduleDayId],
    );

    for (let grade = 1; grade <= 3; grade += 1) {
      const sessions = day.sess_by_grade[grade] ?? [];
      for (
        let periodIndex = 0;
        periodIndex < sessions.length;
        periodIndex += 1
      ) {
        const session = sessions[periodIndex];
        if (!session) {
          continue;
        }

        const period = periodIndex + 1;
        if (session.type === "normal") {
          await sqlOps.executeSql(
            `
              INSERT INTO original_monthly_schedule_sessions
                (
                  schedule_day_id,
                  grade,
                  period,
                  session_type,
                  timetable_pos_dayofweek,
                  timetable_pos_period,
                  special_name,
                  room_id
                )
              VALUES (?, ?, ?, 'normal', ?, ?, NULL, NULL)
            `,
            [
              scheduleDayId,
              grade,
              period,
              session.timetable_position.dayofweek,
              session.timetable_position.period,
            ],
          );
        } else {
          await sqlOps.executeSql(
            `
              INSERT INTO original_monthly_schedule_sessions
                (
                  schedule_day_id,
                  grade,
                  period,
                  session_type,
                  timetable_pos_dayofweek,
                  timetable_pos_period,
                  special_name,
                  room_id
                )
              VALUES (?, ?, ?, 'special', NULL, NULL, ?, ?)
            `,
            [
              scheduleDayId,
              grade,
              period,
              session.name,
              session.room.mapOr<string | null>(null, (room) => room),
            ],
          );
        }
      }
    }

    const eventList = day.events.filter((event) => event.trim().length > 0);
    for (let eventIndex = 0; eventIndex < eventList.length; eventIndex += 1) {
      await sqlOps.executeSql(
        `
          INSERT INTO original_monthly_schedule_events
            (schedule_day_id, event_order, event_text)
          VALUES (?, ?, ?)
        `,
        [scheduleDayId, eventIndex + 1, eventList[eventIndex]],
      );
    }
  }
}

export async function buildPersonalScheduleRange(
  userId: string,
  startDate: Date,
  rangeDays: number,
  sqlOps: SqlOps,
  options: BuildPersonalScheduleRangeOptions = {},
): Promise<models.schedule.PersonalMonSkd> {
  if (rangeDays <= 0) {
    return [];
  }

  const start = dateAtUtcMidnight(startDate);
  const end = addUtcDays(start, rangeDays - 1);
  const startKey = dateKey(start);
  const endKey = dateKey(end);

  const includeSharedMemo = options.include_shared_memo ?? true;
  const includePersonalSessionMemo =
    options.include_personal_session_memo ?? true;
  const includePersonalDailyMemo = options.include_personal_daily_memo ?? true;
  const maxPeriod =
    Number.isInteger(options.max_period) && (options.max_period as number) > 0
      ? Math.min(options.max_period as number, 31)
      : undefined;

  const [
    gradeAndHomeClass,
    personalWeeklyTimetableRaw,
    dayRows,
    personalRows,
    personalDailyRows,
  ] = await Promise.all([
    getUserGradeAndHomeClass(userId, sqlOps),
    getPersonalWeeklyTimetable(userId, sqlOps),
    selectOriginalDayRows(startKey, endKey, sqlOps),
    includePersonalSessionMemo
      ? selectPersonalSessionMemoRows(
          userId,
          startKey,
          endKey,
          sqlOps,
          maxPeriod,
        )
      : Promise.resolve([]),
    includePersonalDailyMemo
      ? selectPersonalDailyMemoRows(userId, startKey, endKey, sqlOps)
      : Promise.resolve([]),
  ]);

  const { grade, home_class } = gradeAndHomeClass;
  const personalWeeklyTimetable = personalWeeklyTimetableRaw ?? new Map();

  const dayIdList = dayRows.map((row) => row.id);

  const [originalWeeklyTimetableRaw, sessionRows, eventRows] =
    await Promise.all([
      getOriginalWeeklyTimetable(grade, home_class, sqlOps),
      selectOriginalSessionRows(dayIdList, grade, sqlOps, maxPeriod),
      selectOriginalEventRows(dayIdList, sqlOps),
    ]);
  const originalWeeklyTimetable = originalWeeklyTimetableRaw ?? new Map();

  const sharedRows = includeSharedMemo
    ? await selectSharedSessionMemoRows(
        startKey,
        endKey,
        collectSharedMemoTargetFilter(
          sessionRows,
          originalWeeklyTimetable,
          personalWeeklyTimetable,
        ),
        sqlOps,
        maxPeriod,
      )
    : [];

  const dayByKey = new Map<string, OriginalDayRow>();
  const dayIdToKey = new Map<number, string>();

  dayRows.forEach((row) => {
    const key = parseDateKey(row.target_date);
    dayByKey.set(key, row);
    dayIdToKey.set(row.id, key);
  });

  const sessionsByDate = new Map<string, OriginalSessionRow[]>();
  sessionRows.forEach((row) => {
    const key = dayIdToKey.get(row.schedule_day_id);
    if (!key) {
      return;
    }
    const list = sessionsByDate.get(key) ?? [];
    list.push(row);
    sessionsByDate.set(key, list);
  });

  const eventsByDate = new Map<string, string[]>();
  eventRows.forEach((row) => {
    const key = dayIdToKey.get(row.schedule_day_id);
    if (!key) {
      return;
    }
    const list = eventsByDate.get(key) ?? [];
    list.push(row.event_text);
    eventsByDate.set(key, list);
  });

  const originalMonSkd: models.schedule.OriginalMonSkd = [];
  const hasOriginalDay: boolean[] = [];

  for (let offset = 0; offset < rangeDays; offset += 1) {
    const currentDate = addUtcDays(start, offset);
    const key = dateKey(currentDate);
    const day = dayByKey.get(key);
    const daySessions = sessionsByDate.get(key) ?? [];
    hasOriginalDay.push(day !== undefined);

    const sessByGrade: models.schedule.OriginalMonSkdSessByGrade[] = [];
    for (let g = 0; g <= 12; g += 1) {
      sessByGrade[g] = [];
    }

    daySessions.forEach((session) => {
      const gradeIndex = toValidGradeIndex(session.grade);
      const period = toValidPeriod(session.period);
      if (gradeIndex === null || period === null) {
        return;
      }

      const target = sessByGrade[gradeIndex] ?? [];
      while (target.length < period) {
        target.push({
          type: "special",
          name: "",
          room: cmn.None(),
        });
      }

      if (session.session_type === "normal") {
        target[period - 1] = {
          type: "normal",
          timetable_position: {
            dayofweek: toDayOfWeek(session.timetable_pos_dayofweek),
            period: toValidPeriod(session.timetable_pos_period) ?? period,
          },
        };
      } else {
        target[period - 1] = {
          type: "special",
          name: session.special_name ?? "",
          room: toRoomIdOption(session.room_id),
        };
      }

      sessByGrade[gradeIndex] = target;
    });

    if (!sessByGrade[grade]) {
      sessByGrade[grade] = [];
    }

    let shortened: models.schedule.OriginalMonSkdShortened = {
      type: "unknown",
      afternoon_start_period: cmn.None(),
    };

    if (day) {
      let rawDetails: unknown = day.shortened_details;
      if (typeof rawDetails === "string") {
        try {
          rawDetails = JSON.parse(rawDetails);
        } catch {
          rawDetails = {};
        }
      }
      shortened = parseShortened(day.shortened_type, rawDetails);
    }

    originalMonSkd.push({
      sess_by_grade: sessByGrade,
      start_time: day ? parseTimeOnly(day.start_time) : cmn.None(),
      shortened,
      events: eventsByDate.get(key) ?? [],
      cafeteria_open:
        day && day.cafeteria_open !== null
          ? cmn.Some(!!day.cafeteria_open)
          : cmn.None(),
      study_hall_open:
        day && day.study_hall_open !== null
          ? cmn.Some(!!day.study_hall_open)
          : cmn.None(),
    });
  }

  const sharedByDate = new Map<string, models.schedule.SharedSessMemoDay>();

  sharedRows.forEach((row) => {
    const key = parseDateKey(row.memo_date);
    const periodNum = toValidPeriod(row.period);
    if (periodNum === null) {
      return;
    }

    const day = sharedByDate.get(key) ?? [];
    while (day.length < periodNum) {
      day.push(makeSharedMemoPeriod());
    }

    const period = day[periodNum - 1];
    const roomId = row.room_id ?? "";

    if (row.target_type === "course") {
      const target = ensureByCourseEntry(
        period.by_course,
        row.target_id as knowledge.course.CourseID,
      );
      if (roomId.length > 0) {
        target.with_room.set(roomId as knowledge.room.RoomID, {
          memo: row.memo,
        });
      } else {
        target.without_room = { memo: row.memo };
      }
    } else {
      const target = ensureByNameEntry(period.by_name, row.target_id);
      if (roomId.length > 0) {
        target.with_room.set(roomId as knowledge.room.RoomID, {
          memo: row.memo,
        });
      } else {
        target.without_room = { memo: row.memo };
      }
    }

    sharedByDate.set(key, day);
  });

  const personalByDate = new Map<string, models.schedule.PersonalSessMemoDay>();
  const personalDailyByDate = new Map<
    string,
    models.schedule.PersonalDailyMemoDay
  >();

  personalRows.forEach((row) => {
    const key = parseDateKey(row.memo_date);
    const periodNum = toValidPeriod(row.period);
    if (periodNum === null) {
      return;
    }

    const day = personalByDate.get(key) ?? [];
    while (day.length < periodNum) {
      day.push({ memo: cmn.None() });
    }
    day[periodNum - 1] = {
      memo: cmn.Some(row.memo),
    };
    personalByDate.set(key, day);
  });

  personalDailyRows.forEach((row) => {
    const key = parseDateKey(row.memo_date);
    personalDailyByDate.set(key, {
      memo: cmn.Some(row.memo),
    });
  });

  const sharedMemo: models.schedule.SharedSessMemo = [];
  const personalMemo: models.schedule.PersonalSessMemo = [];
  const personalDailyMemo: models.schedule.PersonalDailyMemo = [];

  for (let offset = 0; offset < rangeDays; offset += 1) {
    const currentDate = addUtcDays(start, offset);
    const key = dateKey(currentDate);
    sharedMemo.push(sharedByDate.get(key) ?? []);
    personalMemo.push(personalByDate.get(key) ?? []);
    personalDailyMemo.push(
      personalDailyByDate.get(key) ?? { memo: cmn.None() },
    );
  }

  const resolvedSkd = logic.build_mon_skd.buildSkd(
    grade,
    personalWeeklyTimetable,
    originalWeeklyTimetable,
    originalMonSkd,
    sharedMemo,
    personalMemo,
    personalDailyMemo,
  );

  return resolvedSkd.map((day, index) => (hasOriginalDay[index] ? day : null));
}

export async function putPersonalMemo(
  userId: string,
  date: Date,
  period: number,
  memo: string | null,
  sqlOps: SqlOps,
): Promise<void> {
  const memoDate = dateKey(date);
  if (memo === null) {
    await deletePersonalSessionMemo(userId, memoDate, period, sqlOps);
    return;
  }

  await upsertPersonalSessionMemo(userId, memoDate, period, memo, sqlOps);
}

export async function getPersonalDailyMemo(
  userId: string,
  date: Date,
  sqlOps: SqlOps,
): Promise<string | null> {
  return getPersonalDailyMemoByDate(userId, dateKey(date), sqlOps);
}

export async function putPersonalDailyMemo(
  userId: string,
  date: Date,
  memo: string | null,
  sqlOps: SqlOps,
): Promise<void> {
  const memoDate = dateKey(date);
  if (memo === null) {
    await deletePersonalDailyMemo(userId, memoDate, sqlOps);
    return;
  }

  await upsertPersonalDailyMemo(userId, memoDate, memo, sqlOps);
}

function mapSharedMemoTargetFromSession(
  userId: string,
  session: ScheduleSessionTargetRow,
  period: number,
  originalWeeklyTimetable?: models.schedule.OriginalWeeklyTimetable,
  personalWeeklyTimetable?: models.schedule.PersonalWeeklyTimetable,
): { targetType: "course" | "special_name"; targetId: string; roomId: string } {
  if (session.session_type === "special") {
    const targetId = session.special_name ?? "";
    if (!targetId) {
      throw new SharedMemoTargetResolutionError(
        "invalid_special_session_name",
        "Invalid special session name",
      );
    }
    return {
      targetType: "special_name",
      targetId,
      roomId: session.room_id ?? "",
    };
  }

  const weekday = session.timetable_pos_dayofweek;
  const timetablePeriod = session.timetable_pos_period;
  const weekdayResolved = toValidDayOfWeek(weekday);
  const timetablePeriodResolved = toValidPeriod(timetablePeriod);
  if (weekdayResolved === null || timetablePeriodResolved === null) {
    throw new SharedMemoTargetResolutionError(
      "invalid_normal_session_position",
      "Invalid normal session timetable position",
    );
  }

  const classSess =
    originalWeeklyTimetable?.get(weekdayResolved)?.[
      timetablePeriodResolved - 1
    ];
  const resolved = resolveCommonWeeklyTimetableSess(
    classSess,
    personalWeeklyTimetable ?? new Map(),
  );

  if (resolved.isNone()) {
    throw new SharedMemoTargetResolutionError(
      "personal_session_not_found",
      `No resolved personal timetable session found for user ${userId} at period ${period}`,
    );
  }

  const sess = resolved.unwrap();
  return {
    targetType: "course",
    targetId: sess.course,
    roomId: sess.room_id.mapOr("", (room: string) => room),
  };
}

export async function putSharedMemoForUser(
  userId: string,
  date: Date,
  period: number,
  memo: string | null,
  sqlOps: SqlOps,
): Promise<void> {
  const { grade, home_class } = await getUserGradeAndHomeClass(userId, sqlOps);

  const session = await selectScheduleSessionTarget(
    dateKey(date),
    grade,
    period,
    sqlOps,
  );

  if (!session) {
    throw new SharedMemoTargetResolutionError(
      "schedule_session_not_found",
      "Schedule session not found",
    );
  }

  const [originalWeeklyTimetable, personalWeeklyTimetable] =
    session.session_type === "normal"
      ? await Promise.all([
          getOriginalWeeklyTimetable(grade, home_class, sqlOps),
          getPersonalWeeklyTimetable(userId, sqlOps),
        ])
      : [undefined, undefined];

  const { targetType, targetId, roomId } = mapSharedMemoTargetFromSession(
    userId,
    session,
    period,
    originalWeeklyTimetable ?? undefined,
    personalWeeklyTimetable ?? undefined,
  );

  const memoDate = dateKey(date);
  if (memo === null) {
    await deleteSharedSessionMemo(
      memoDate,
      period,
      targetType,
      targetId,
      roomId,
      sqlOps,
    );
    return;
  }

  await upsertSharedSessionMemo(
    memoDate,
    period,
    targetType,
    targetId,
    roomId,
    memo,
    sqlOps,
  );
}
