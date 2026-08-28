import * as cmn from "../cmn";
import * as database from "../database";
import * as knowledge from "../knowledge";
import * as models from "../models";
import { BellSkdIntoSessTimeWindows } from "./bell_skd";
import { applyIcalTemplate, buildIcalText, type IcalEventInput } from "./ical";

const DEFAULT_TIMEZONE = "Asia/Tokyo";

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

const ROOM_NAME_BY_ID = new Map<string, string>(
  Object.values(knowledge.room.Rooms).map((room) => [
    room.id,
    room.displayName,
  ]),
);

const SUBJECT_NAME_BY_ID = new Map<string, string>(
  Object.values(knowledge.course.Subjects).map((subject) => [
    subject.id,
    subject.displayName,
  ]),
);

type IcalFeedFormatType =
  | models.ical.PersonalIcalFeedFormatType
  | models.ical.GradeIcalFeedFormatType;

type IcalFeedTemplateSource = {
  format_type: IcalFeedFormatType;
  title_template: string | null;
  description_template: string | null;
};

export type RegeneratableIcalFeed = Pick<
  models.ical.IcalFeedCommon,
  "is_enabled" | "last_generated_at" | "generation_error" | "updated_at"
>;

export interface IcalRegenerationDeps {
  sqlOps: database.SqlOps;
  uploadIcalObject: (objectKey: string, body: string) => Promise<unknown>;
  loadIcalObject?: (objectKey: string) => Promise<string | null>;
}

export interface IcalBatchRegenerationDeps extends IcalRegenerationDeps {
  logError?: (message: string, context: Record<string, unknown>) => void;
}

export type IcalBatchRegenerationTarget = {
  kind: "personal" | "grade";
  feed_id: number;
};

export type IcalBatchRegenerationListResult = {
  processed: number;
  targets: IcalBatchRegenerationTarget[];
  skipped: number;
};

type OriginalDayWithDate = {
  date: Date;
  day: models.schedule.OriginalMonSkdDay | null;
};

const DEFAULT_SUMMARY_TEMPLATE: Record<IcalFeedFormatType, string> = {
  [models.ical.PersonalIcalFeedFormatType.PersonalSessions]:
    models.ical.PERSONAL_ICAL_DEFAULT_TITLE_TEMPLATE,
  [models.ical.PersonalIcalFeedFormatType.PersonalFullDay]:
    models.ical.PERSONAL_ICAL_FULL_DAY_DEFAULT_TITLE_TEMPLATE,
  [models.ical.GradeIcalFeedFormatType.GradeFullDay]: "{grade}年 登校",
  [models.ical.GradeIcalFeedFormatType.GradeSchoolDay]: "{grade}年 登校日",
  [models.ical.GradeIcalFeedFormatType.GradeAfternoonDay]:
    "{grade}年 午後授業あり",
  [models.ical.GradeIcalFeedFormatType.GradeEvents]: "{event}",
};

const DEFAULT_DESCRIPTION_TEMPLATE: Record<IcalFeedFormatType, string> = {
  [models.ical.PersonalIcalFeedFormatType.PersonalSessions]:
    models.ical.PERSONAL_ICAL_DEFAULT_DESCRIPTION_TEMPLATE,
  [models.ical.PersonalIcalFeedFormatType.PersonalFullDay]:
    models.ical.PERSONAL_ICAL_FULL_DAY_DEFAULT_DESCRIPTION_TEMPLATE,
  [models.ical.GradeIcalFeedFormatType.GradeFullDay]: "{date}",
  [models.ical.GradeIcalFeedFormatType.GradeSchoolDay]: "{date}",
  [models.ical.GradeIcalFeedFormatType.GradeAfternoonDay]: "{date}",
  [models.ical.GradeIcalFeedFormatType.GradeEvents]: "{date}",
};

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function toUtcDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcDays(date: Date, days: number): Date {
  const base = toUtcDateOnly(date);
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function diffDaysInclusive(start: Date, end: Date): number {
  const ms = toUtcDateOnly(end).getTime() - toUtcDateOnly(start).getTime();
  return Math.floor(ms / 86400000) + 1;
}

function formatDateIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateToken(date: Date): string {
  return formatDateIso(date).replace(/-/g, "");
}

function formatTime(time: cmn.time.TimeOnly): string {
  return `${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}`;
}

function combineDateAndTime(date: Date, time: cmn.time.TimeOnly): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      time.h,
      time.m,
      0,
    ),
  );
}

type PersonalSessionCourseTexts = {
  courseName: string;
  courseShortName: string;
  subjectName: string;
};

function resolveNormalCourseTexts(
  courseId: knowledge.course.CourseID,
): PersonalSessionCourseTexts {
  const entry =
    knowledge.course.Courses[courseId as keyof typeof knowledge.course.Courses];
  if (!entry) {
    return {
      courseName: courseId,
      courseShortName: courseId,
      subjectName: "",
    };
  }

  return {
    courseName: entry.displayName,
    courseShortName: entry.shortDisplayName,
    subjectName: SUBJECT_NAME_BY_ID.get(entry.subject) ?? "",
  };
}

function resolvePersonalSessionCourseTexts(
  session: models.schedule.PersonalMonSkdDaySess,
): PersonalSessionCourseTexts {
  if (session.course.type === "normal") {
    return resolveNormalCourseTexts(session.course.id);
  }

  const specialName = session.course.name.trim() || "特別授業";
  return {
    courseName: specialName,
    courseShortName: specialName,
    subjectName: "特別授業",
  };
}

function roomDisplayName(roomId: knowledge.room.RoomID | null): string {
  if (!roomId) {
    return "";
  }
  return ROOM_NAME_BY_ID.get(roomId) ?? roomId;
}

function joinDistinctTemplateValues(
  values: string[],
  separator: string,
): string {
  const joined: string[] = [];

  values.forEach((value) => {
    const normalized = value.trim();
    if (normalized.length === 0 || joined.includes(normalized)) {
      return;
    }
    joined.push(normalized);
  });

  if (joined.length === 0) {
    return "";
  }
  if (joined.length === 1) {
    return joined[0];
  }
  return joined.join(separator);
}

function hasZeroBreakBetweenWindows(
  previous: cmn.time.TimeWindow,
  next: cmn.time.TimeWindow,
): boolean {
  return previous.end.h === next.start.h && previous.end.m === next.start.m;
}

function resolvePersonalScheduleScope(
  feed: models.ical.PersonalIcalFeed,
): models.ical.IcalFeedScheduleScopeOption {
  const scope = feed.options.schedule_scope;

  if (
    scope === models.ical.IcalFeedScheduleScopeOption.All ||
    scope === models.ical.IcalFeedScheduleScopeOption.MismatchSessionsOnly ||
    scope === models.ical.IcalFeedScheduleScopeOption.DaysWithMismatchOnly
  ) {
    return scope;
  }

  return models.ical.IcalFeedScheduleScopeOption.All;
}

function isPersonalSessionMismatch(
  session: models.schedule.PersonalMonSkdDaySess,
  date: Date,
  period: number,
): boolean {
  if (session.course.type !== "normal") {
    return true;
  }

  return (
    session.course.timetable_position.dayofweek !== date.getUTCDay() ||
    session.course.timetable_position.period !== period
  );
}

function resolvePersonalDaySpan(
  day: models.schedule.PersonalMonSkdDay,
  date: Date,
): { start: Date; end: Date } | null {
  const windows = day.time_windows.mapOr<cmn.time.TimeWindow[] | null>(
    null,
    (value) => value,
  );

  if (windows && windows.length > 0) {
    const first = windows[0];
    const last = windows[windows.length - 1];
    return {
      start: combineDateAndTime(date, first.start),
      end: combineDateAndTime(date, last.end),
    };
  }

  const sessions = day.sess.filter(
    (item): item is cmn.Option<models.schedule.PersonalMonSkdDaySess> =>
      Boolean(item) && item.isSome(),
  );
  if (sessions.length === 0) {
    return null;
  }

  const start = combineDateAndTime(
    date,
    knowledge.bell_skd.START_TIME_OF_MORNING_SHR,
  );
  const approxMinutes =
    sessions.length * 50 + Math.max(0, sessions.length - 1) * 10;

  return {
    start,
    end: new Date(start.getTime() + approxMinutes * 60 * 1000),
  };
}

function buildPersonalPeriodTemplateValues(
  day: models.schedule.PersonalMonSkdDay,
): Record<string, string> {
  const values: Record<string, string> = {};

  for (let period = 1; period <= 7; period += 1) {
    const session = day.sess[period - 1];
    if (!session || session.isNone()) {
      values[`period_${period}_course`] = "";
      values[`period_${period}_course_short`] = "";
      values[`period_${period}_subject`] = "";
      values[`period_${period}_room`] = "";
      continue;
    }

    const unwrapped = session.unwrap();
    const courseTexts = resolvePersonalSessionCourseTexts(unwrapped);
    const room = unwrapped.room_id.mapOr("", (roomId) =>
      roomDisplayName(roomId),
    );

    values[`period_${period}_course`] = courseTexts.courseName;
    values[`period_${period}_course_short`] = courseTexts.courseShortName;
    values[`period_${period}_subject`] = courseTexts.subjectName;
    values[`period_${period}_room`] = room;
  }

  return values;
}

function getSummaryTemplate(feed: IcalFeedTemplateSource): string {
  return feed.title_template ?? DEFAULT_SUMMARY_TEMPLATE[feed.format_type];
}

function getDescriptionTemplate(feed: IcalFeedTemplateSource): string {
  return (
    feed.description_template ?? DEFAULT_DESCRIPTION_TEMPLATE[feed.format_type]
  );
}

function applyTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return applyIcalTemplate(template, values).trim();
}

function formatLocalDateTimeToken(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${formatDateToken(date)}T${hh}${mm}${ss}`;
}

function hashStringToBase36(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

type IcalDateValueSignature =
  | {
      type: "all_day";
      date_token: string;
    }
  | {
      type: "timed";
      tzid: string;
      local_datetime_token: string;
    };

function serializeDateSignature(value: IcalDateValueSignature): string {
  if (value.type === "all_day") {
    return `all_day:${value.date_token}`;
  }
  return `timed:${value.tzid}:${value.local_datetime_token}`;
}

function serializeEventSignature(
  startSig: string,
  endSig: string,
  summary: string,
  description: string,
  location: string,
): string {
  return JSON.stringify([startSig, endSig, summary, description, location]);
}

function buildDateSignatureFromEvent(
  value: IcalEventInput["start"],
): IcalDateValueSignature {
  if (value.type === "all_day") {
    return {
      type: "all_day",
      date_token: formatDateToken(value.date),
    };
  }

  return {
    type: "timed",
    tzid: value.tzid,
    local_datetime_token: formatLocalDateTimeToken(value.date),
  };
}

function buildEventSignature(event: IcalEventInput): string {
  const start = buildDateSignatureFromEvent(event.start);
  const end = buildDateSignatureFromEvent(event.end);
  return serializeEventSignature(
    serializeDateSignature(start),
    serializeDateSignature(end),
    event.summary,
    event.description ?? "",
    event.location ?? "",
  );
}

function unfoldIcalLines(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded: string[] = [];

  rawLines.forEach((line) => {
    if (
      (line.startsWith(" ") || line.startsWith("\t")) &&
      unfolded.length > 0
    ) {
      unfolded[unfolded.length - 1] += line.slice(1);
      return;
    }
    unfolded.push(line);
  });

  return unfolded;
}

function unescapeIcalText(value: string): string {
  return value
    .replace(/\\[nN]/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcalContentLine(
  line: string,
): { raw_name: string; name: string; value: string } | null {
  const colonIndex = line.indexOf(":");
  if (colonIndex < 0) {
    return null;
  }

  const rawName = line.slice(0, colonIndex);
  const name = rawName.split(";")[0]?.trim().toUpperCase();
  if (!name) {
    return null;
  }

  return {
    raw_name: rawName,
    name,
    value: line.slice(colonIndex + 1),
  };
}

function parseIcalPropertyParams(rawName: string): Record<string, string> {
  const parts = rawName.split(";").slice(1);
  const params: Record<string, string> = {};

  parts.forEach((part) => {
    const eqIndex = part.indexOf("=");
    if (eqIndex < 0) {
      return;
    }

    const key = part.slice(0, eqIndex).trim().toUpperCase();
    const value = part.slice(eqIndex + 1).trim();
    if (!key) {
      return;
    }

    params[key] = value.replace(/^"(.*)"$/, "$1");
  });

  return params;
}

function parseIcalDateSignature(
  rawName: string,
  rawValue: string,
): IcalDateValueSignature {
  const params = parseIcalPropertyParams(rawName);
  const normalizedValue = rawValue.trim().toUpperCase();

  if (params.VALUE === "DATE") {
    return {
      type: "all_day",
      date_token: normalizedValue,
    };
  }

  return {
    type: "timed",
    tzid: params.TZID ?? "UTC",
    local_datetime_token: normalizedValue,
  };
}

function parseExistingEventSignatures(
  icalText: string | null,
): Map<string, { uid: string; signature: string }> {
  if (!icalText) {
    return new Map();
  }

  const signatures = new Map<string, { uid: string; signature: string }>();
  const lines = unfoldIcalLines(icalText);

  let inEvent = false;
  let uid: string | null = null;
  let key: string | null = null;
  let start: IcalDateValueSignature | null = null;
  let end: IcalDateValueSignature | null = null;
  let summary = "";
  let description = "";
  let location = "";

  const flushCurrentEvent = () => {
    if (!uid || !key || !start || !end) {
      return;
    }

    const signature = serializeEventSignature(
      serializeDateSignature(start),
      serializeDateSignature(end),
      summary,
      description,
      location,
    );

    signatures.set(key, {
      uid,
      signature,
    });
  };

  lines.forEach((line) => {
    const upper = line.toUpperCase();

    if (upper === "BEGIN:VEVENT") {
      inEvent = true;
      uid = null;
      key = null;
      start = null;
      end = null;
      summary = "";
      description = "";
      location = "";
      return;
    }

    if (upper === "END:VEVENT") {
      if (inEvent) {
        flushCurrentEvent();
      }
      inEvent = false;
      return;
    }

    if (!inEvent) {
      return;
    }

    const parsed = parseIcalContentLine(line);
    if (!parsed) {
      return;
    }

    switch (parsed.name) {
      case "UID":
        uid = unescapeIcalText(parsed.value).trim();
        return;
      case "X-HMBT-KEY":
        key = unescapeIcalText(parsed.value).trim();
        return;
      case "DTSTART":
        start = parseIcalDateSignature(parsed.raw_name, parsed.value);
        return;
      case "DTEND":
        end = parseIcalDateSignature(parsed.raw_name, parsed.value);
        return;
      case "SUMMARY":
        summary = unescapeIcalText(parsed.value);
        return;
      case "DESCRIPTION":
        description = unescapeIcalText(parsed.value);
        return;
      case "LOCATION":
        location = unescapeIcalText(parsed.value);
        return;
      default:
        return;
    }
  });

  return signatures;
}

function buildRotatedUid(
  feedId: number,
  stableKey: string,
  signature: string,
  generationToken: string,
): string {
  const digest = hashStringToBase36(
    `${stableKey}\u0000${signature}\u0000${generationToken}`,
  );
  return `${feedId}-${generationToken}-${digest}@${knowledge.HOSTNAMES.ICAL}`;
}

function keepStableUidsFromPreviousIcal(
  feedId: number,
  events: IcalEventInput[],
  previousIcalText: string | null,
): IcalEventInput[] {
  if (events.length === 0) {
    return events;
  }

  const previousSignatures = parseExistingEventSignatures(previousIcalText);
  if (previousSignatures.size === 0) {
    return events;
  }

  const generationToken = Date.now().toString(36);
  let rotationCounter = 0;

  return events.map((event) => {
    const stableKey =
      typeof event.x_hmbt_key === "string" ? event.x_hmbt_key.trim() : "";
    if (!stableKey) {
      return event;
    }

    const previous = previousSignatures.get(stableKey);
    if (!previous) {
      return event;
    }

    const nextSignature = buildEventSignature(event);
    if (
      previous.signature === nextSignature &&
      previous.uid.trim().length > 0
    ) {
      if (previous.uid === event.uid) {
        return event;
      }
      return {
        ...event,
        uid: previous.uid,
      };
    }

    const nextUid = buildRotatedUid(
      feedId,
      stableKey,
      nextSignature,
      `${generationToken}-${rotationCounter}`,
    );
    rotationCounter += 1;

    return {
      ...event,
      uid: nextUid,
    };
  });
}

async function loadPreviousIcalText(
  objectKey: string,
  deps: IcalRegenerationDeps,
): Promise<string | null> {
  if (!deps.loadIcalObject) {
    return null;
  }

  try {
    return await deps.loadIcalObject(objectKey);
  } catch {
    return null;
  }
}

function isMeaningfulOriginalSession(
  sess: models.schedule.OriginalMonSkdSess | undefined,
): boolean {
  if (!sess) {
    return false;
  }

  if (sess.type === "normal") {
    return true;
  }

  return sess.name.trim().length > 0 || sess.room.isSome();
}

function resolveAfternoonStartPeriod(
  day: models.schedule.OriginalMonSkdDay,
): number {
  if (day.shortened.type === "unknown") {
    const value = day.shortened.afternoon_start_period.mapOr(5, (v) => v);
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
  }
  return 5;
}

function resolveUnknownDaySpan(
  day: models.schedule.OriginalMonSkdDay,
  date: Date,
  sessionCount: number,
): { start: Date; end: Date } | null {
  if (sessionCount <= 0) {
    return null;
  }

  const startTime = day.start_time.unwrapOr(
    knowledge.bell_skd.START_TIME_OF_MORNING_SHR,
  );
  let totalMinutes = 0;

  for (let index = 0; index < sessionCount; index += 1) {
    if (index > 0) {
      totalMinutes += index === 4 ? 45 : 10;
    }
    totalMinutes += 50;
  }

  const endTime = startTime.addMinutes(totalMinutes);
  return {
    start: combineDateAndTime(date, startTime),
    end: combineDateAndTime(date, endTime),
  };
}

function resolveGradeDaySpan(
  day: models.schedule.OriginalMonSkdDay,
  date: Date,
  periods: number[],
): { start: Date; end: Date } | null {
  if (periods.length === 0) {
    return null;
  }

  if (day.shortened.type === "special") {
    const windows = day.shortened.windows;
    if (windows.length === 0) {
      return null;
    }
    const first = windows[0];
    const last = windows[windows.length - 1];
    return {
      start: combineDateAndTime(date, first.start),
      end: combineDateAndTime(date, last.end),
    };
  }

  if (day.shortened.type === "common") {
    const template = knowledge.bell_skd.BellSkd[day.shortened.bell_schedule];
    const windows = BellSkdIntoSessTimeWindows(
      template,
      periods.map((period) => ({
        period_in_weekly_timetable: cmn.Some(period),
        same_as_next: false,
      })),
      day.start_time,
    );

    if (windows.length > 0) {
      return {
        start: combineDateAndTime(date, windows[0].start),
        end: combineDateAndTime(date, windows[windows.length - 1].end),
      };
    }
  }

  return resolveUnknownDaySpan(day, date, periods.length);
}

async function loadOriginalDays(
  sqlOps: database.SqlOps,
): Promise<OriginalDayWithDate[]> {
  const bounds = await database.getOriginalScheduleDateBounds(sqlOps);
  if (!bounds) {
    return [];
  }

  const start = toUtcDateOnly(bounds.min_date);
  const end = toUtcDateOnly(bounds.max_date);

  const result: OriginalDayWithDate[] = [];
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;

  while (
    year < end.getUTCFullYear() ||
    (year === end.getUTCFullYear() && month <= end.getUTCMonth() + 1)
  ) {
    const monthDays = await database.getOriginalMonthlySchedule(
      year,
      month,
      sqlOps,
    );
    const totalDays = daysInMonth(year, month);

    for (let day = 1; day <= totalDays; day += 1) {
      const date = utcDate(year, month, day);
      if (date.getTime() < start.getTime() || date.getTime() > end.getTime()) {
        continue;
      }

      result.push({
        date,
        day: monthDays[day - 1] ?? null,
      });
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return result;
}

async function buildPersonalEvents(
  feed: models.ical.PersonalIcalFeed,
  sqlOps: database.SqlOps,
): Promise<IcalEventInput[]> {
  type PersonalPeriodEventSeed = {
    period: number;
    courseName: string;
    courseShortName: string;
    subjectName: string;
    room: string;
    personalMemo: string;
    sharedMemo: string;
    mergedMemo: string;
    isMismatch: boolean;
    timeWindow: cmn.time.TimeWindow | null;
  };

  const targetUserId = feed.owner_user_id;

  const bounds = await database.getOriginalScheduleDateBounds(sqlOps);
  if (!bounds) {
    return [];
  }

  const start = toUtcDateOnly(bounds.min_date);
  const end = toUtcDateOnly(bounds.max_date);
  const rangeDays = diffDaysInclusive(start, end);

  const schedule = await database.buildPersonalScheduleRange(
    targetUserId,
    start,
    rangeDays,
    sqlOps,
  );

  const summaryTemplate = getSummaryTemplate(feed);
  const descriptionTemplate = getDescriptionTemplate(feed);
  const scheduleScope = resolvePersonalScheduleScope(feed);

  const events: IcalEventInput[] = [];

  for (let index = 0; index < schedule.length; index += 1) {
    const day = schedule[index];
    if (!day) {
      continue;
    }

    const date = addUtcDays(start, index);
    const dateText = formatDateIso(date);
    const weekday = WEEKDAY_JA[date.getUTCDay()];
    const windows = day.time_windows.mapOr<cmn.time.TimeWindow[] | null>(
      null,
      (w) => w,
    );

    const periodTemplateValues = buildPersonalPeriodTemplateValues(day);
    const mismatchFlags = day.sess.map((maybeSession, periodIndex) => {
      if (!maybeSession) {
        return false;
      }

      // A slot resolved to None means the day has an unresolved/missing class slot.
      // Treat it as mismatch so days_with_mismatch_only can include the entire day.
      if (maybeSession.isNone()) {
        return true;
      }

      return isPersonalSessionMismatch(
        maybeSession.unwrap(),
        date,
        periodIndex + 1,
      );
    });
    const mismatchPeriodCount = mismatchFlags.filter((flag) => flag).length;
    const hasMismatch = mismatchPeriodCount > 0;

    if (
      scheduleScope ===
        models.ical.IcalFeedScheduleScopeOption.DaysWithMismatchOnly &&
      !hasMismatch
    ) {
      continue;
    }

    if (
      feed.format_type ===
      models.ical.PersonalIcalFeedFormatType.PersonalFullDay
    ) {
      const hasAnySession = day.sess.some(
        (maybeSession) => maybeSession && maybeSession.isSome(),
      );
      if (!hasAnySession) {
        continue;
      }

      const span = resolvePersonalDaySpan(day, date);
      if (!span) {
        continue;
      }

      const values = {
        date: dateText,
        year: String(date.getUTCFullYear()),
        month: String(date.getUTCMonth() + 1),
        day: String(date.getUTCDate()),
        weekday,
        mismatch_period_count: String(mismatchPeriodCount),
        is_timetable_mismatch: hasMismatch ? "1" : "0",
        ...periodTemplateValues,
      };

      const summary =
        applyTemplate(summaryTemplate, values) ||
        applyTemplate(DEFAULT_SUMMARY_TEMPLATE[feed.format_type], values) ||
        models.ical.PERSONAL_ICAL_FULL_DAY_DEFAULT_TITLE_TEMPLATE;

      const description =
        applyTemplate(descriptionTemplate, values) ||
        applyTemplate(DEFAULT_DESCRIPTION_TEMPLATE[feed.format_type], values) ||
        models.ical.PERSONAL_ICAL_FULL_DAY_DEFAULT_DESCRIPTION_TEMPLATE;

      events.push({
        uid: `${feed.id}-personal-${formatDateToken(date)}-full@${knowledge.HOSTNAMES.ICAL}`,
        x_hmbt_key: `personal-${formatDateToken(date)}-full`,
        start: {
          type: "timed",
          date: span.start,
          tzid: DEFAULT_TIMEZONE,
        },
        end: {
          type: "timed",
          date: span.end,
          tzid: DEFAULT_TIMEZONE,
        },
        summary,
        description,
      });

      continue;
    }

    const periodEventSeeds: PersonalPeriodEventSeed[] = [];

    for (let periodIndex = 0; periodIndex < day.sess.length; periodIndex += 1) {
      const maybeSession = day.sess[periodIndex];
      if (!maybeSession) {
        continue;
      }

      const period = periodIndex + 1;
      const isMismatch = mismatchFlags[periodIndex] ?? false;

      if (
        scheduleScope ===
          models.ical.IcalFeedScheduleScopeOption.MismatchSessionsOnly &&
        !isMismatch
      ) {
        continue;
      }

      const timeWindow = windows?.[periodIndex] ?? null;

      if (maybeSession.isNone()) {
        periodEventSeeds.push({
          period,
          courseName: "空きコマ",
          courseShortName: "空き",
          subjectName: "空きコマ",
          room: "",
          personalMemo: "",
          sharedMemo: "",
          mergedMemo: "",
          isMismatch,
          timeWindow,
        });
        continue;
      }

      const session = maybeSession.unwrap();
      const courseTexts = resolvePersonalSessionCourseTexts(session);

      const roomId = session.room_id.mapOr<knowledge.room.RoomID | null>(
        null,
        (room) => room,
      );
      const room = roomDisplayName(roomId);

      const personalMemo = session.personal_memo.mapOr("", (memo) => memo);
      const sharedMemo = session.shared_memo.mapOr("", (memo) => memo);
      const mergedMemo = joinDistinctTemplateValues(
        [personalMemo, sharedMemo],
        " / ",
      );

      periodEventSeeds.push({
        period,
        courseName: courseTexts.courseName,
        courseShortName: courseTexts.courseShortName,
        subjectName: courseTexts.subjectName,
        room,
        personalMemo,
        sharedMemo,
        mergedMemo,
        isMismatch,
        timeWindow,
      });
    }

    const mergedPeriodGroups: PersonalPeriodEventSeed[][] = [];
    periodEventSeeds.forEach((seed) => {
      const previousGroup =
        mergedPeriodGroups.length > 0
          ? mergedPeriodGroups[mergedPeriodGroups.length - 1]
          : null;
      const previousSeed =
        previousGroup && previousGroup.length > 0
          ? previousGroup[previousGroup.length - 1]
          : null;

      if (
        previousGroup &&
        previousSeed &&
        seed.period === previousSeed.period + 1 &&
        previousSeed.timeWindow &&
        seed.timeWindow &&
        hasZeroBreakBetweenWindows(previousSeed.timeWindow, seed.timeWindow)
      ) {
        previousGroup.push(seed);
        return;
      }

      mergedPeriodGroups.push([seed]);
    });

    mergedPeriodGroups.forEach((group) => {
      const first = group[0];
      const last = group[group.length - 1];

      const periodText =
        first.period === last.period
          ? String(first.period)
          : `${first.period}-${last.period}`;
      const periodLabel =
        first.period === last.period
          ? `${first.period}限`
          : `${first.period}-${last.period}限`;

      const courseName = joinDistinctTemplateValues(
        group.map((item) => item.courseName),
        " / ",
      );
      const courseShortName = joinDistinctTemplateValues(
        group.map((item) => item.courseShortName),
        " / ",
      );
      const subjectName = joinDistinctTemplateValues(
        group.map((item) => item.subjectName),
        " / ",
      );
      const room = joinDistinctTemplateValues(
        group.map((item) => item.room),
        " / ",
      );
      const personalMemo = joinDistinctTemplateValues(
        group.map((item) => item.personalMemo),
        "\n",
      );
      const sharedMemo = joinDistinctTemplateValues(
        group.map((item) => item.sharedMemo),
        "\n",
      );
      const mergedMemo = joinDistinctTemplateValues(
        group.map((item) => item.mergedMemo),
        "\n",
      );
      const isMismatch = group.some((item) => item.isMismatch);

      const firstWindow = first.timeWindow;
      const lastWindow = last.timeWindow;

      const year = String(date.getUTCFullYear());
      const month = String(date.getUTCMonth() + 1);
      const dayOfMonth = String(date.getUTCDate());
      const values = {
        date: dateText,
        year,
        month,
        day: dayOfMonth,
        weekday,
        period: periodText,
        period_label: periodLabel,
        course: courseName,
        course_short: courseShortName,
        subject: subjectName,
        room,
        memo_personal: personalMemo,
        memo_shared: sharedMemo,
        memo: mergedMemo,
        mismatch_period_count: String(mismatchPeriodCount),
        is_timetable_mismatch: isMismatch ? "1" : "0",
        time_start: firstWindow ? formatTime(firstWindow.start) : "",
        time_end: lastWindow ? formatTime(lastWindow.end) : "",
        ...periodTemplateValues,
      };

      const summary =
        applyTemplate(summaryTemplate, values) ||
        applyTemplate(DEFAULT_SUMMARY_TEMPLATE[feed.format_type], values) ||
        courseName ||
        "空きコマ";

      const description =
        applyTemplate(descriptionTemplate, values) ||
        applyTemplate(DEFAULT_DESCRIPTION_TEMPLATE[feed.format_type], values) ||
        `${dateText} ${periodLabel}`;

      const periodToken = `p${periodText}`;
      const uid = `${feed.id}-personal-${formatDateToken(date)}-${periodToken}@${knowledge.HOSTNAMES.ICAL}`;
      const stableKey = `personal-${formatDateToken(date)}-${periodToken}`;

      if (firstWindow && lastWindow) {
        events.push({
          uid,
          x_hmbt_key: stableKey,
          start: {
            type: "timed",
            date: combineDateAndTime(date, firstWindow.start),
            tzid: DEFAULT_TIMEZONE,
          },
          end: {
            type: "timed",
            date: combineDateAndTime(date, lastWindow.end),
            tzid: DEFAULT_TIMEZONE,
          },
          summary,
          description,
          location: room,
        });
      } else {
        events.push({
          uid,
          x_hmbt_key: stableKey,
          start: {
            type: "all_day",
            date,
          },
          end: {
            type: "all_day",
            date: addUtcDays(date, 1),
          },
          summary,
          description,
          location: room,
        });
      }
    });
  }

  return events;
}

function buildGradeAllDayEvent(
  feed: models.ical.GradeIcalFeed,
  date: Date,
  values: Record<string, string>,
  uniqueSuffix: string,
): IcalEventInput {
  const summaryTemplate = getSummaryTemplate(feed);
  const descriptionTemplate = getDescriptionTemplate(feed);

  return {
    uid: `${feed.id}-${feed.format_type}-${formatDateToken(date)}-${uniqueSuffix}@${knowledge.HOSTNAMES.ICAL}`,
    x_hmbt_key: `grade-${feed.format_type}-${formatDateToken(date)}-${uniqueSuffix}`,
    start: {
      type: "all_day",
      date,
    },
    end: {
      type: "all_day",
      date: addUtcDays(date, 1),
    },
    summary:
      applyTemplate(summaryTemplate, values) ||
      applyTemplate(DEFAULT_SUMMARY_TEMPLATE[feed.format_type], values) ||
      "学校予定",
    description:
      applyTemplate(descriptionTemplate, values) ||
      applyTemplate(DEFAULT_DESCRIPTION_TEMPLATE[feed.format_type], values) ||
      formatDateIso(date),
  };
}

async function buildGradeEvents(
  feed: models.ical.GradeIcalFeed,
  sqlOps: database.SqlOps,
): Promise<IcalEventInput[]> {
  const targetGrade = feed.target_grade;

  const originalDays = await loadOriginalDays(sqlOps);
  const summaryTemplate = getSummaryTemplate(feed);
  const descriptionTemplate = getDescriptionTemplate(feed);
  const events: IcalEventInput[] = [];

  originalDays.forEach(({ date, day }) => {
    if (!day) {
      return;
    }

    const gradeSessions = day.sess_by_grade[targetGrade] ?? [];
    const meaningfulPeriods = gradeSessions
      .map((sess, index) => ({ sess, period: index + 1 }))
      .filter(({ sess }) => isMeaningfulOriginalSession(sess))
      .map(({ period }) => period);

    const hasSchool = meaningfulPeriods.length > 0;
    const afternoonStartPeriod = resolveAfternoonStartPeriod(day);
    const hasAfternoon = meaningfulPeriods.some(
      (period) => period >= afternoonStartPeriod,
    );

    const commonValues = {
      date: formatDateIso(date),
      year: String(date.getUTCFullYear()),
      month: String(date.getUTCMonth() + 1),
      day: String(date.getUTCDate()),
      weekday: WEEKDAY_JA[date.getUTCDay()],
      grade: String(targetGrade),
      session_count: String(meaningfulPeriods.length),
      afternoon_start_period: String(afternoonStartPeriod),
      event: "",
    };

    switch (feed.format_type) {
      case models.ical.GradeIcalFeedFormatType.GradeFullDay: {
        if (!hasSchool) {
          return;
        }

        const span = resolveGradeDaySpan(day, date, meaningfulPeriods);
        if (!span) {
          return;
        }

        const values = {
          ...commonValues,
          time_start: formatTime(
            cmn.time.TimeOnly.new(
              span.start.getUTCHours(),
              span.start.getUTCMinutes(),
            ),
          ),
          time_end: formatTime(
            cmn.time.TimeOnly.new(
              span.end.getUTCHours(),
              span.end.getUTCMinutes(),
            ),
          ),
        };

        events.push({
          uid: `${feed.id}-${feed.format_type}-${formatDateToken(date)}@${knowledge.HOSTNAMES.ICAL}`,
          x_hmbt_key: `grade-${feed.format_type}-${formatDateToken(date)}-full`,
          start: {
            type: "timed",
            date: span.start,
            tzid: DEFAULT_TIMEZONE,
          },
          end: {
            type: "timed",
            date: span.end,
            tzid: DEFAULT_TIMEZONE,
          },
          summary:
            applyTemplate(summaryTemplate, values) ||
            applyTemplate(DEFAULT_SUMMARY_TEMPLATE[feed.format_type], values) ||
            `${targetGrade}年 登校`,
          description:
            applyTemplate(descriptionTemplate, values) ||
            applyTemplate(
              DEFAULT_DESCRIPTION_TEMPLATE[feed.format_type],
              values,
            ) ||
            formatDateIso(date),
        });
        return;
      }

      case models.ical.GradeIcalFeedFormatType.GradeSchoolDay: {
        if (!hasSchool) {
          return;
        }
        events.push(buildGradeAllDayEvent(feed, date, commonValues, "school"));
        return;
      }

      case models.ical.GradeIcalFeedFormatType.GradeAfternoonDay: {
        if (!hasAfternoon) {
          return;
        }
        events.push(
          buildGradeAllDayEvent(feed, date, commonValues, "afternoon"),
        );
        return;
      }

      case models.ical.GradeIcalFeedFormatType.GradeEvents: {
        const eventsOfDay = day.events
          .map((event) => event.trim())
          .filter((event) => event.length > 0);
        eventsOfDay.forEach((eventText, eventIndex) => {
          const values = {
            ...commonValues,
            event: eventText,
          };
          const eventItem = buildGradeAllDayEvent(
            feed,
            date,
            values,
            `event${eventIndex + 1}`,
          );
          eventItem.summary =
            applyTemplate(summaryTemplate, values) ||
            applyTemplate(DEFAULT_SUMMARY_TEMPLATE[feed.format_type], values) ||
            eventText;
          eventItem.description =
            applyTemplate(descriptionTemplate, values) ||
            applyTemplate(
              DEFAULT_DESCRIPTION_TEMPLATE[feed.format_type],
              values,
            ) ||
            formatDateIso(date);
          events.push(eventItem);
        });
      }
    }
  });

  return events;
}

export async function regeneratePersonalIcalFeed(
  feed: models.ical.PersonalIcalFeed,
  deps: IcalRegenerationDeps,
): Promise<models.ical.PersonalIcalFeed> {
  try {
    const previousIcalText = await loadPreviousIcalText(feed.public_path, deps);
    const events = keepStableUidsFromPreviousIcal(
      feed.id,
      await buildPersonalEvents(feed, deps.sqlOps),
      previousIcalText,
    );
    const calendarName = models.ical.resolvePersonalIcalCalendarName(
      feed.format_type,
    );
    const icalText = buildIcalText(calendarName, events, {
      timezone: DEFAULT_TIMEZONE,
    });

    await deps.uploadIcalObject(feed.public_path, icalText);
    await database.updatePersonalIcalFeedGenerationState(
      feed.id,
      null,
      deps.sqlOps,
    );
  } catch (error) {
    await database.updatePersonalIcalFeedGenerationState(
      feed.id,
      asErrorMessage(error).slice(0, 1000),
      deps.sqlOps,
    );

    throw error instanceof Error
      ? error
      : new Error(`Failed to generate personal iCal feed: ${String(error)}`);
  }

  const refreshed = await database.getPersonalIcalFeedById(
    feed.id,
    deps.sqlOps,
  );
  if (!refreshed) {
    throw new Error("Failed to reload personal iCal feed after regeneration");
  }
  return refreshed;
}

export async function regenerateGradeIcalFeed(
  feed: models.ical.GradeIcalFeed,
  deps: IcalRegenerationDeps,
): Promise<models.ical.GradeIcalFeed> {
  try {
    const previousIcalText = await loadPreviousIcalText(feed.public_path, deps);
    const events = keepStableUidsFromPreviousIcal(
      feed.id,
      await buildGradeEvents(feed, deps.sqlOps),
      previousIcalText,
    );
    const calendarName = models.ical.resolveGradeIcalCalendarName(
      feed.target_grade,
      feed.format_type,
    );
    const icalText = buildIcalText(calendarName, events, {
      timezone: DEFAULT_TIMEZONE,
    });

    await deps.uploadIcalObject(feed.public_path, icalText);
    await database.updateGradeIcalFeedGenerationState(
      feed.id,
      null,
      deps.sqlOps,
    );
  } catch (error) {
    await database.updateGradeIcalFeedGenerationState(
      feed.id,
      asErrorMessage(error).slice(0, 1000),
      deps.sqlOps,
    );

    throw error instanceof Error
      ? error
      : new Error(`Failed to generate grade iCal feed: ${String(error)}`);
  }

  const refreshed = await database.getGradeIcalFeedById(feed.id, deps.sqlOps);
  if (!refreshed) {
    throw new Error("Failed to reload grade iCal feed after regeneration");
  }
  return refreshed;
}

export function shouldRegenerateBySource(
  feed: RegeneratableIcalFeed,
  currentSourceUpdatedAt: Date | null,
): boolean {
  if (!feed.is_enabled) {
    return false;
  }
  if (!feed.last_generated_at) {
    return true;
  }
  if (feed.generation_error && feed.generation_error.trim().length > 0) {
    return true;
  }
  if (feed.updated_at.getTime() > feed.last_generated_at.getTime()) {
    return true;
  }
  if (
    currentSourceUpdatedAt &&
    currentSourceUpdatedAt.getTime() > feed.last_generated_at.getTime()
  ) {
    return true;
  }
  return false;
}

type BatchQueueItem =
  | {
      kind: "personal";
      feed: models.ical.PersonalIcalFeed;
      sort_generated_at: number;
    }
  | {
      kind: "grade";
      feed: models.ical.GradeIcalFeed;
      sort_generated_at: number;
    };

async function buildBatchQueue(
  limit: number,
  sqlOps: database.SqlOps,
): Promise<BatchQueueItem[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));

  const [personalFeeds, gradeFeeds] = await Promise.all([
    database.listPersonalIcalFeedsForBatch(safeLimit, sqlOps),
    database.listGradeIcalFeedsForBatch(safeLimit, sqlOps),
  ]);

  return [
    ...personalFeeds.map((feed) => ({
      kind: "personal" as const,
      feed,
      sort_generated_at: feed.last_generated_at?.getTime() ?? 0,
    })),
    ...gradeFeeds.map((feed) => ({
      kind: "grade" as const,
      feed,
      sort_generated_at: feed.last_generated_at?.getTime() ?? 0,
    })),
  ]
    .sort((a, b) => {
      if (a.sort_generated_at !== b.sort_generated_at) {
        return a.sort_generated_at - b.sort_generated_at;
      }
      if (a.feed.updated_at.getTime() !== b.feed.updated_at.getTime()) {
        return b.feed.updated_at.getTime() - a.feed.updated_at.getTime();
      }
      return b.feed.id - a.feed.id;
    })
    .slice(0, safeLimit);
}

export async function listIcalBatchRegenerationTargets(
  limit: number,
  sqlOps: database.SqlOps,
): Promise<IcalBatchRegenerationListResult> {
  const queue = await buildBatchQueue(limit, sqlOps);
  const targets: IcalBatchRegenerationTarget[] = [];
  let skipped = 0;

  for (const item of queue) {
    if (item.kind === "personal") {
      const currentSourceUpdatedAt =
        await database.resolvePersonalIcalSourceUpdatedAt(item.feed, sqlOps);
      if (!shouldRegenerateBySource(item.feed, currentSourceUpdatedAt)) {
        skipped += 1;
        continue;
      }

      targets.push({
        kind: "personal",
        feed_id: item.feed.id,
      });
      continue;
    }

    const currentSourceUpdatedAt =
      await database.resolveGradeIcalSourceUpdatedAt(item.feed, sqlOps);
    if (!shouldRegenerateBySource(item.feed, currentSourceUpdatedAt)) {
      skipped += 1;
      continue;
    }

    targets.push({
      kind: "grade",
      feed_id: item.feed.id,
    });
  }

  return {
    processed: queue.length,
    targets,
    skipped,
  };
}

export async function regenerateIcalBatchTarget(
  target: IcalBatchRegenerationTarget,
  deps: IcalRegenerationDeps,
): Promise<"regenerated" | "skipped"> {
  if (target.kind === "personal") {
    const feed = await database.getPersonalIcalFeedById(
      target.feed_id,
      deps.sqlOps,
    );
    if (!feed) {
      return "skipped";
    }

    const currentSourceUpdatedAt =
      await database.resolvePersonalIcalSourceUpdatedAt(feed, deps.sqlOps);
    if (!shouldRegenerateBySource(feed, currentSourceUpdatedAt)) {
      return "skipped";
    }

    await regeneratePersonalIcalFeed(feed, deps);
    return "regenerated";
  }

  const feed = await database.getGradeIcalFeedById(target.feed_id, deps.sqlOps);
  if (!feed) {
    return "skipped";
  }

  const currentSourceUpdatedAt = await database.resolveGradeIcalSourceUpdatedAt(
    feed,
    deps.sqlOps,
  );
  if (!shouldRegenerateBySource(feed, currentSourceUpdatedAt)) {
    return "skipped";
  }

  await regenerateGradeIcalFeed(feed, deps);
  return "regenerated";
}

export async function runIcalBatchRegeneration(
  limit: number,
  deps: IcalBatchRegenerationDeps,
): Promise<{
  processed: number;
  regenerated: number;
  skipped: number;
  failed: number;
}> {
  const listed = await listIcalBatchRegenerationTargets(limit, deps.sqlOps);

  let regenerated = 0;
  let skipped = listed.skipped;
  let failed = 0;

  for (const target of listed.targets) {
    try {
      const result = await regenerateIcalBatchTarget(target, deps);
      if (result === "regenerated") {
        regenerated += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      deps.logError?.("Failed to regenerate iCal feed", {
        kind: target.kind,
        feed_id: target.feed_id,
        error,
      });
      failed += 1;
    }
  }

  return {
    processed: listed.processed,
    regenerated,
    skipped,
    failed,
  };
}
