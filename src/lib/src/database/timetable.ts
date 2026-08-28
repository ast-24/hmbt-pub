import * as cmn from "../cmn";
import * as knowledge from "../knowledge";
import * as models from "../models";
import { fromOption } from "./shared";
import type { SqlOps } from "./sql";

const ALL_SELECTION_IDS = Object.values(
  models.schedule.TimetableSelectionID,
) as models.schedule.TimetableSelectionID[];

const SELECTION_ID_SET = new Set<string>(ALL_SELECTION_IDS);

function toValidDayOfWeek(value: number): cmn.time.DayOfWeek | null {
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    return null;
  }
  return value as cmn.time.DayOfWeek;
}

function toValidSelectionId(
  value: string | null | undefined,
): models.schedule.TimetableSelectionID | null {
  if (typeof value !== "string") {
    return null;
  }
  if (!SELECTION_ID_SET.has(value)) {
    return null;
  }
  return value as models.schedule.TimetableSelectionID;
}

function toValidPeriod(value: number): number | null {
  if (!Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function toValidCourseId(value: unknown): knowledge.course.CourseID | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value as knowledge.course.CourseID;
}

function toValidSessionType(value: unknown): "normal" | "select" | null {
  if (value === "normal" || value === "select") {
    return value;
  }
  return null;
}

function toRoomIdOption(
  value: string | null,
): cmn.Option<knowledge.room.RoomID> {
  if (typeof value !== "string" || value.length === 0) {
    return cmn.None();
  }
  return cmn.Some(value as knowledge.room.RoomID);
}

function toValidHomeClassNum(
  value: number | null,
): knowledge.HomeClassNum | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 6
  ) {
    return null;
  }
  return value as knowledge.HomeClassNum;
}

function createEmptyPersonalWeeklyTimetable(): models.schedule.PersonalWeeklyTimetable {
  const timetable: models.schedule.PersonalWeeklyTimetable = new Map();
  ALL_SELECTION_IDS.forEach((selectionId) => {
    timetable.set(
      selectionId,
      cmn.None<models.schedule.PersonalWeeklyTimetableSess>(),
    );
  });
  return timetable;
}

export function resolveCommonWeeklyTimetableSess(
  originalSess: models.schedule.OriginalWeeklyTimetableSess | undefined,
  personalTimetable: models.schedule.PersonalWeeklyTimetable,
): cmn.Option<models.schedule.CommonWeeklyTimetableSess> {
  if (!originalSess) {
    return cmn.None<models.schedule.CommonWeeklyTimetableSess>();
  }

  if (originalSess.type === "normal") {
    return cmn.Some({
      course: originalSess.course,
      room_id: cmn.None<knowledge.room.RoomID>(),
    });
  }

  const selected = personalTimetable.get(originalSess.selection_id);
  if (!selected || selected.isNone()) {
    return cmn.None<models.schedule.CommonWeeklyTimetableSess>();
  }

  const resolved = selected.unwrap();
  return cmn.Some({
    course: resolved.course,
    room_id: resolved.room_id,
  });
}

export function resolveCommonWeeklyTimetable(
  personalTimetable: models.schedule.PersonalWeeklyTimetable,
  originalTimetable: models.schedule.OriginalWeeklyTimetable,
): models.schedule.CommonWeeklyTimetable {
  const timetable: models.schedule.CommonWeeklyTimetable = new Map();

  originalTimetable.forEach((periods, weekday) => {
    const resolved: cmn.Option<models.schedule.CommonWeeklyTimetableSess>[] =
      [];

    for (let i = 0; i < periods.length; i += 1) {
      resolved[i] = resolveCommonWeeklyTimetableSess(
        periods[i],
        personalTimetable,
      );
    }

    timetable.set(weekday, resolved);
  });

  return timetable;
}

function toValidGrade(value: number | null): number | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 3
  ) {
    return null;
  }
  return value;
}

export type UserGradeHomeClassIssue =
  | "user_not_found"
  | "user_profile_incomplete";

export class UserGradeHomeClassError extends Error {
  public readonly issue: UserGradeHomeClassIssue;

  public constructor(issue: UserGradeHomeClassIssue, message: string) {
    super(message);
    this.name = "UserGradeHomeClassError";
    this.issue = issue;
  }
}

export async function getPersonalWeeklyTimetable(
  userId: string,
  sqlOps: SqlOps,
): Promise<models.schedule.PersonalWeeklyTimetable | null> {
  const timetableRows = await sqlOps.selectRows<Array<{ id: number }>>(
    `
      SELECT id
      FROM personal_weekly_timetables
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId],
  );

  const timetableId = timetableRows[0]?.id;
  if (!timetableId) {
    return null;
  }

  const sessionRows = await sqlOps.selectRows<
    Array<{
      selection_id: string;
      course_id: string;
      room_id: string | null;
    }>
  >(
    `
      SELECT selection_id, course_id, room_id
      FROM personal_weekly_timetable_selections
      WHERE personal_weekly_timetable_id = ?
      ORDER BY selection_id
    `,
    [timetableId],
  );

  const timetable = createEmptyPersonalWeeklyTimetable();

  sessionRows.forEach((row) => {
    const selectionId = toValidSelectionId(row.selection_id);
    const course = toValidCourseId(row.course_id);
    if (selectionId === null || course === null) {
      return;
    }

    timetable.set(
      selectionId,
      cmn.Some({
        course,
        room_id: toRoomIdOption(row.room_id),
      }),
    );
  });

  return timetable;
}

export async function upsertPersonalWeeklyTimetable(
  userId: string,
  timetable: models.schedule.PersonalWeeklyTimetable,
  sqlOps: SqlOps,
): Promise<void> {
  const rows = await sqlOps.selectRows<Array<{ id: number }>>(
    `
      SELECT id
      FROM personal_weekly_timetables
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId],
  );

  let timetableId = rows[0]?.id;
  if (!timetableId) {
    const result = await sqlOps.executeSql(
      `INSERT INTO personal_weekly_timetables (user_id) VALUES (?)`,
      [userId],
    );
    timetableId = result.insertId;
  }

  await sqlOps.executeSql(
    `DELETE FROM personal_weekly_timetable_selections WHERE personal_weekly_timetable_id = ?`,
    [timetableId],
  );

  const sessionRows: Array<[number, string, string, string | null]> = [];

  for (const [selectionId, selected] of timetable.entries()) {
    if (!selected || selected.isNone()) {
      continue;
    }

    const sess = selected.unwrap();
    sessionRows.push([
      timetableId,
      selectionId,
      sess.course,
      fromOption(sess.room_id),
    ]);
  }

  if (sessionRows.length > 0) {
    const placeholders = sessionRows.map(() => "(?, ?, ?, ?)").join(", ");
    const params = sessionRows.flat();
    await sqlOps.executeSql(
      `
        INSERT INTO personal_weekly_timetable_selections
          (personal_weekly_timetable_id, selection_id, course_id, room_id)
        VALUES ${placeholders}
      `,
      params,
    );
  }

  await sqlOps.executeSql(
    `
      UPDATE users
      SET
        has_any_timetable_selection = ?,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
    `,
    [sessionRows.length > 0, userId],
  );
}

export async function getUserGradeAndHomeClassRaw(
  userId: string,
  sqlOps: SqlOps,
): Promise<{ grade: number | null; home_class: number | null } | null> {
  const rows = await sqlOps.selectRows<
    Array<{ grade: number | null; home_class: number | null }>
  >(
    `
      SELECT grade, home_class
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] ?? null;
}

export async function getUserGradeAndHomeClass(
  userId: string,
  sqlOps: SqlOps,
): Promise<{ grade: number; home_class: knowledge.HomeClassNum }> {
  const row = await getUserGradeAndHomeClassRaw(userId, sqlOps);
  if (!row) {
    throw new UserGradeHomeClassError("user_not_found", "User not found");
  }

  if (row.grade === null || row.home_class === null) {
    throw new UserGradeHomeClassError(
      "user_profile_incomplete",
      "User profile is incomplete",
    );
  }

  const grade = toValidGrade(row.grade);
  const homeClass = toValidHomeClassNum(row.home_class);
  if (grade === null || homeClass === null) {
    throw new UserGradeHomeClassError(
      "user_profile_incomplete",
      "User profile has invalid grade/home class",
    );
  }

  return {
    grade,
    home_class: homeClass,
  };
}

export async function getOriginalWeeklyTimetable(
  grade: number,
  homeClass: knowledge.HomeClassNum,
  sqlOps: SqlOps,
): Promise<models.schedule.OriginalWeeklyTimetable | null> {
  const timetableRows = await sqlOps.selectRows<Array<{ id: number }>>(
    `
      SELECT id
      FROM original_weekly_timetables
      WHERE grade = ? AND home_class = ?
      LIMIT 1
    `,
    [grade, homeClass],
  );

  const timetableId = timetableRows[0]?.id;
  if (!timetableId) {
    return null;
  }

  const rows = await sqlOps.selectRows<
    Array<{
      weekday: number;
      period: number;
      session_type: string;
      course_id: string | null;
      selection_id: string | null;
      room_id: string | null;
    }>
  >(
    `
      SELECT
        sess.weekday,
        sess.period,
        sess.session_type,
        sess.course_id,
        sess.selection_id,
        rooms.room_id
      FROM original_weekly_timetable_sessions sess
      LEFT JOIN original_weekly_timetable_session_rooms rooms
        ON rooms.original_weekly_timetable_id = sess.original_weekly_timetable_id
       AND rooms.weekday = sess.weekday
       AND rooms.period = sess.period
      WHERE sess.original_weekly_timetable_id = ?
      ORDER BY sess.weekday, sess.period, rooms.room_order
    `,
    [timetableId],
  );

  const timetable: models.schedule.OriginalWeeklyTimetable = new Map();

  const temp = new Map<
    string,
    | {
        type: "normal";
        weekday: cmn.time.DayOfWeek;
        period: number;
        course_id: knowledge.course.CourseID;
        room_ids: knowledge.room.RoomID[];
      }
    | {
        type: "select";
        weekday: cmn.time.DayOfWeek;
        period: number;
        selection_id: models.schedule.TimetableSelectionID;
      }
  >();

  rows.forEach((row) => {
    const weekday = toValidDayOfWeek(row.weekday);
    const period = toValidPeriod(row.period);
    const sessionType = toValidSessionType(row.session_type);
    if (weekday === null || period === null || sessionType === null) {
      return;
    }

    const key = `${weekday}:${period}`;
    if (sessionType === "select") {
      const selectionId = toValidSelectionId(row.selection_id);
      if (selectionId === null) {
        return;
      }

      if (!temp.has(key)) {
        temp.set(key, {
          type: "select",
          weekday,
          period,
          selection_id: selectionId,
        });
      }
      return;
    }

    const courseId = toValidCourseId(row.course_id);
    if (courseId === null) {
      return;
    }

    const existing = temp.get(key);
    const resolved =
      !existing || existing.type === "select"
        ? {
            type: "normal" as const,
            weekday,
            period,
            course_id: courseId,
            room_ids: [] as knowledge.room.RoomID[],
          }
        : existing;

    if (typeof row.room_id === "string" && row.room_id.length > 0) {
      const roomId = row.room_id as knowledge.room.RoomID;
      if (!resolved.room_ids.includes(roomId)) {
        resolved.room_ids.push(roomId);
      }
    }

    temp.set(key, resolved);
  });

  temp.forEach((entry) => {
    const periods = timetable.get(entry.weekday) ?? [];

    if (entry.type === "select") {
      periods[entry.period - 1] = {
        type: "select",
        selection_id: entry.selection_id,
      };
      timetable.set(entry.weekday, periods);
      return;
    }

    periods[entry.period - 1] = {
      type: "normal",
      course: entry.course_id,
      room_id:
        entry.room_ids.length > 0
          ? cmn.Some(entry.room_ids)
          : cmn.None<knowledge.room.RoomID[]>(),
    };
    timetable.set(entry.weekday, periods);
  });

  return timetable;
}

export async function upsertOriginalWeeklyTimetable(
  grade: number,
  homeClass: knowledge.HomeClassNum,
  timetable: models.schedule.OriginalWeeklyTimetable,
  sqlOps: SqlOps,
): Promise<void> {
  const rows = await sqlOps.selectRows<Array<{ id: number }>>(
    `
      SELECT id
      FROM original_weekly_timetables
      WHERE grade = ? AND home_class = ?
      LIMIT 1
    `,
    [grade, homeClass],
  );

  let timetableId = rows[0]?.id;
  if (!timetableId) {
    const insert = await sqlOps.executeSql(
      `
        INSERT INTO original_weekly_timetables (grade, home_class)
        VALUES (?, ?)
      `,
      [grade, homeClass],
    );
    timetableId = insert.insertId;
  }

  const deleteStmt = `
    DELETE from original_weekly_timetable_sessions
    WHERE original_weekly_timetable_id = ?
  `;
  await sqlOps.executeSql(deleteStmt, [timetableId]);

  const sessionRows: Array<
    [number, number, number, "normal" | "select", string | null, string | null]
  > = [];
  const roomRows: Array<[number, number, number, number, string]> = [];

  for (const [weekday, periods] of timetable.entries()) {
    for (let i = 0; i < periods.length; i += 1) {
      const sess = periods[i];
      if (!sess) {
        continue;
      }
      const periodNum = i + 1;

      if (sess.type === "select") {
        sessionRows.push([
          timetableId,
          weekday,
          periodNum,
          "select",
          null,
          sess.selection_id,
        ]);
        continue;
      }

      sessionRows.push([
        timetableId,
        weekday,
        periodNum,
        "normal",
        sess.course,
        null,
      ]);

      if (sess.room_id.isSome()) {
        const roomIds = sess.room_id.unwrap();
        for (let order = 0; order < roomIds.length; order += 1) {
          roomRows.push([
            timetableId,
            weekday,
            periodNum,
            order,
            roomIds[order],
          ]);
        }
      }
    }
  }

  if (sessionRows.length > 0) {
    const sessPlaceholders = sessionRows
      .map(() => "(?, ?, ?, ?, ?, ?)")
      .join(", ");
    const sessParams = sessionRows.flat();
    await sqlOps.executeSql(
      `
        INSERT INTO original_weekly_timetable_sessions
          (
            original_weekly_timetable_id,
            weekday,
            period,
            session_type,
            course_id,
            selection_id
          )
        VALUES ${sessPlaceholders}
      `,
      sessParams,
    );
  }

  if (roomRows.length > 0) {
    const roomPlaceholders = roomRows.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const roomParams = roomRows.flat();
    await sqlOps.executeSql(
      `
        INSERT INTO original_weekly_timetable_session_rooms
          (original_weekly_timetable_id, weekday, period, room_order, room_id)
        VALUES ${roomPlaceholders}
      `,
      roomParams,
    );
  }
}
