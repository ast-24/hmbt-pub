import { cmn, knowledge, models } from "@ast24/hmbt-v5-lib";

const FIXED_PERIODS = 7;
const ROOM_SET = new Set<string>(Object.values(knowledge.room.RoomID));

export type GradeKey = 1 | 2 | 3;

export type OptionalBooleanDraft = "unset" | "true" | "false";

export type ShortenedWindowDraft = {
  start: string;
  end: string;
};

export type SessionDraft = {
  kind: "empty" | "normal" | "special";
  normalDayofweek: cmn.time.DayOfWeek;
  normalPeriod: number;
  specialName: string;
  specialRoomId: string;
};

export type DayDraft = {
  enabled: boolean;
  startTime: string;
  shortenedType: "common" | "special" | "unknown";
  commonBellSchedule: knowledge.bell_skd.CommonBellSkd;
  specialWindows: ShortenedWindowDraft[];
  unknownAfternoonStartPeriod: string;
  eventsText: string;
  cafeteriaOpen: OptionalBooleanDraft;
  studyHallOpen: OptionalBooleanDraft;
  grades: {
    1: SessionDraft[];
    2: SessionDraft[];
    3: SessionDraft[];
  };
};

export type MonthlyScheduleDraft = DayDraft[];

export const GRADE_KEYS: GradeKey[] = [1, 2, 3];

export const WEEKDAY_OPTIONS: Array<{
  value: cmn.time.DayOfWeek;
  label: string;
}> = [
  { value: 0, label: "日" },
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
];

export const COMMON_BELL_OPTIONS: knowledge.bell_skd.CommonBellSkd[] = [
  knowledge.bell_skd.CommonBellSkd.Normal,
  knowledge.bell_skd.CommonBellSkd.ShortenedA,
  knowledge.bell_skd.CommonBellSkd.ShortenedB,
  knowledge.bell_skd.CommonBellSkd.ShortenedC,
];

export function createEmptySessionDraft(): SessionDraft {
  return {
    kind: "empty",
    normalDayofweek: 1,
    normalPeriod: 1,
    specialName: "",
    specialRoomId: "",
  };
}

function createFixedSessions(): SessionDraft[] {
  const periods: SessionDraft[] = [];
  for (let i = 0; i < FIXED_PERIODS; i += 1) {
    periods.push(createEmptySessionDraft());
  }
  return periods;
}

export function createEmptyDayDraft(): DayDraft {
  return {
    enabled: false,
    startTime: "",
    shortenedType: "common",
    commonBellSchedule: knowledge.bell_skd.CommonBellSkd.Normal,
    specialWindows: [{ start: "", end: "" }],
    unknownAfternoonStartPeriod: "",
    eventsText: "",
    cafeteriaOpen: "unset",
    studyHallOpen: "unset",
    grades: {
      1: createFixedSessions(),
      2: createFixedSessions(),
      3: createFixedSessions(),
    },
  };
}

function readOptionValue<T>(value: unknown): T | null {
  if (value instanceof cmn.Option) {
    return value.isSome() ? (value.unwrap() as T) : null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && value !== null && "_value" in value) {
    const inner = (value as { _value?: unknown })._value;
    if (inner === null || inner === undefined) {
      return null;
    }
    return inner as T;
  }

  return value as T;
}

function normalizeRoomId(value: string): string {
  const trimmed = value.trim();
  if (!ROOM_SET.has(trimmed)) {
    return "";
  }
  return trimmed;
}

function toTimeInputValue(raw: unknown): string {
  if (!raw || typeof raw !== "object") {
    return "";
  }

  const h = Number((raw as { h?: unknown }).h);
  const m = Number((raw as { m?: unknown }).m);

  if (!Number.isInteger(h) || !Number.isInteger(m)) {
    return "";
  }
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    return "";
  }

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseTimeInput(value: string, label: string): cmn.time.TimeOnly {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`${label}の形式が不正です。HH:MM 形式で入力してください。`);
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`${label}の値が不正です。`);
  }

  return cmn.time.TimeOnly.new(hour, minute);
}

function toOptionalBoolean(value: OptionalBooleanDraft): cmn.Option<boolean> {
  if (value === "true") {
    return cmn.Some(true);
  }
  if (value === "false") {
    return cmn.Some(false);
  }
  return cmn.None<boolean>();
}

function fromOptionalBoolean(value: unknown): OptionalBooleanDraft {
  const resolved = readOptionValue<boolean>(value);
  if (resolved === true) {
    return "true";
  }
  if (resolved === false) {
    return "false";
  }
  return "unset";
}

function normalizeCommonBell(value: unknown): knowledge.bell_skd.CommonBellSkd {
  if (
    value === knowledge.bell_skd.CommonBellSkd.Normal ||
    value === knowledge.bell_skd.CommonBellSkd.ShortenedA ||
    value === knowledge.bell_skd.CommonBellSkd.ShortenedB ||
    value === knowledge.bell_skd.CommonBellSkd.ShortenedC
  ) {
    return value;
  }
  return knowledge.bell_skd.CommonBellSkd.Normal;
}

function parseShortenedWindows(
  windows: ShortenedWindowDraft[],
): cmn.time.TimeWindow[] {
  const parsed: cmn.time.TimeWindow[] = [];

  windows.forEach((windowDraft, index) => {
    const start = windowDraft.start.trim();
    const end = windowDraft.end.trim();

    if (!start && !end) {
      return;
    }

    if (!start || !end) {
      throw new Error(
        `特別時程${index + 1}件目は開始時刻と終了時刻の両方を入力してください。`,
      );
    }

    const startTime = parseTimeInput(
      start,
      `特別時程${index + 1}件目の開始時刻`,
    );
    const endTime = parseTimeInput(end, `特別時程${index + 1}件目の終了時刻`);

    const startMinutes = startTime.h * 60 + startTime.m;
    const endMinutes = endTime.h * 60 + endTime.m;
    if (endMinutes <= startMinutes) {
      throw new Error(
        `特別時程${index + 1}件目は終了時刻を開始時刻より後にしてください。`,
      );
    }

    parsed.push(cmn.time.TimeWindow.new(startTime, endTime));
  });

  return parsed;
}

function parseSessionDraft(
  session: SessionDraft,
): models.schedule.OriginalMonSkdSess | null {
  if (session.kind === "empty") {
    return null;
  }

  if (session.kind === "normal") {
    const dayofweek = Number(session.normalDayofweek);
    const period = Number(session.normalPeriod);

    if (!Number.isInteger(dayofweek) || dayofweek < 0 || dayofweek > 6) {
      throw new Error("通常授業の曜日指定が不正です。");
    }
    if (!Number.isInteger(period) || period < 1 || period > 7) {
      throw new Error("通常授業の時限指定が不正です。");
    }

    return {
      type: "normal",
      timetable_position: {
        dayofweek: dayofweek as cmn.time.DayOfWeek,
        period,
      },
    };
  }

  const roomId = normalizeRoomId(session.specialRoomId);

  return {
    type: "special",
    name: session.specialName.trim(),
    room: roomId
      ? cmn.Some(roomId as knowledge.room.RoomID)
      : cmn.None<knowledge.room.RoomID>(),
  };
}

function draftGradeToSessions(
  periods: SessionDraft[],
): models.schedule.OriginalMonSkdSessByGrade {
  const normalizedPeriods = periods.slice(0, FIXED_PERIODS);
  while (normalizedPeriods.length < FIXED_PERIODS) {
    normalizedPeriods.push(createEmptySessionDraft());
  }

  const values: Array<models.schedule.OriginalMonSkdSess | null> =
    normalizedPeriods.map((periodDraft) => parseSessionDraft(periodDraft));

  while (values.length > 0 && values[values.length - 1] === null) {
    values.pop();
  }

  return values.map((value) => {
    if (value !== null) {
      return value;
    }
    return {
      type: "special",
      name: "",
      room: cmn.None<knowledge.room.RoomID>(),
    };
  });
}

function sessionToDraft(
  session: models.schedule.OriginalMonSkdSess | undefined,
): SessionDraft {
  if (!session) {
    return createEmptySessionDraft();
  }

  if (session.type === "normal") {
    return {
      kind: "normal",
      normalDayofweek: session.timetable_position.dayofweek,
      normalPeriod: session.timetable_position.period,
      specialName: "",
      specialRoomId: "",
    };
  }

  const roomId = readOptionValue<string>(session.room as unknown) ?? "";
  const specialName = typeof session.name === "string" ? session.name : "";

  if (specialName.trim().length === 0 && !roomId) {
    return createEmptySessionDraft();
  }

  return {
    kind: "special",
    normalDayofweek: 1,
    normalPeriod: 1,
    specialName,
    specialRoomId: roomId,
  };
}

function sessionsToDraft(
  gradeSessions: models.schedule.OriginalMonSkdSessByGrade | undefined,
): SessionDraft[] {
  const draft: SessionDraft[] = [];
  for (let i = 0; i < FIXED_PERIODS; i += 1) {
    draft.push(sessionToDraft(gradeSessions?.[i]));
  }
  return draft;
}

function shortenedToDraft(
  shortened: models.schedule.OriginalMonSkdShortened,
): Pick<
  DayDraft,
  | "shortenedType"
  | "commonBellSchedule"
  | "specialWindows"
  | "unknownAfternoonStartPeriod"
> {
  if (shortened.type === "common") {
    return {
      shortenedType: "common",
      commonBellSchedule: normalizeCommonBell(shortened.bell_schedule),
      specialWindows: [{ start: "", end: "" }],
      unknownAfternoonStartPeriod: "",
    };
  }

  if (shortened.type === "special") {
    const specialWindows = shortened.windows
      .map((window) => {
        const start = toTimeInputValue(window.start as unknown);
        const end = toTimeInputValue(window.end as unknown);
        if (!start && !end) {
          return null;
        }
        return { start, end };
      })
      .filter((window): window is ShortenedWindowDraft => window !== null);

    return {
      shortenedType: "special",
      commonBellSchedule: knowledge.bell_skd.CommonBellSkd.Normal,
      specialWindows:
        specialWindows.length > 0 ? specialWindows : [{ start: "", end: "" }],
      unknownAfternoonStartPeriod: "",
    };
  }

  return {
    shortenedType: "unknown",
    commonBellSchedule: knowledge.bell_skd.CommonBellSkd.Normal,
    specialWindows: [{ start: "", end: "" }],
    unknownAfternoonStartPeriod:
      readOptionValue<number>(
        shortened.afternoon_start_period as unknown,
      )?.toString() ?? "",
  };
}

function draftToShortened(
  draft: DayDraft,
): models.schedule.OriginalMonSkdShortened {
  if (draft.shortenedType === "common") {
    return {
      type: "common",
      bell_schedule: normalizeCommonBell(draft.commonBellSchedule),
    };
  }

  if (draft.shortenedType === "special") {
    return {
      type: "special",
      windows: parseShortenedWindows(draft.specialWindows),
    };
  }

  const trimmed = draft.unknownAfternoonStartPeriod.trim();
  if (!trimmed) {
    return {
      type: "unknown",
      afternoon_start_period: cmn.None<number>(),
    };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 7) {
    throw new Error("午後開始時限は1から7の整数で入力してください。");
  }

  return {
    type: "unknown",
    afternoon_start_period: cmn.Some(parsed),
  };
}

function splitEventLines(eventsText: string): string[] {
  return eventsText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function monthlyScheduleToDraft(
  days: Array<models.schedule.OriginalMonSkdDay | null>,
): MonthlyScheduleDraft {
  return days.map((day) => {
    if (day === null) {
      return createEmptyDayDraft();
    }

    const startTimeRaw = readOptionValue<unknown>(day.start_time as unknown);
    const shortened = shortenedToDraft(day.shortened);

    return {
      enabled: true,
      startTime: toTimeInputValue(startTimeRaw),
      shortenedType: shortened.shortenedType,
      commonBellSchedule: shortened.commonBellSchedule,
      specialWindows: shortened.specialWindows,
      unknownAfternoonStartPeriod: shortened.unknownAfternoonStartPeriod,
      eventsText: Array.isArray(day.events) ? day.events.join("\n") : "",
      cafeteriaOpen: fromOptionalBoolean(day.cafeteria_open as unknown),
      studyHallOpen: fromOptionalBoolean(day.study_hall_open as unknown),
      grades: {
        1: sessionsToDraft(day.sess_by_grade[1]),
        2: sessionsToDraft(day.sess_by_grade[2]),
        3: sessionsToDraft(day.sess_by_grade[3]),
      },
    };
  });
}

export function draftToMonthlySchedule(
  draft: MonthlyScheduleDraft,
): Array<models.schedule.OriginalMonSkdDay | null> {
  return draft.map((dayDraft) => {
    if (!dayDraft.enabled) {
      return null;
    }

    const startTime = dayDraft.startTime.trim();

    return {
      sess_by_grade: [
        [],
        draftGradeToSessions(dayDraft.grades[1]),
        draftGradeToSessions(dayDraft.grades[2]),
        draftGradeToSessions(dayDraft.grades[3]),
      ],
      start_time: startTime
        ? cmn.Some(parseTimeInput(startTime, "開始時刻"))
        : cmn.None<cmn.time.TimeOnly>(),
      shortened: draftToShortened(dayDraft),
      events: splitEventLines(dayDraft.eventsText),
      cafeteria_open: toOptionalBoolean(dayDraft.cafeteriaOpen),
      study_hall_open: toOptionalBoolean(dayDraft.studyHallOpen),
    };
  });
}

function normalizeSessionDraftForSerialize(session: SessionDraft): object {
  if (session.kind === "empty") {
    return {
      kind: "empty",
    };
  }

  if (session.kind === "normal") {
    return {
      kind: "normal",
      normalDayofweek: session.normalDayofweek,
      normalPeriod: session.normalPeriod,
    };
  }

  return {
    kind: "special",
    specialName: session.specialName.trim(),
    specialRoomId: normalizeRoomId(session.specialRoomId),
  };
}

export function serializeMonthlyScheduleDraft(
  draft: MonthlyScheduleDraft,
): string {
  return JSON.stringify(
    draft.map((day) => {
      if (!day.enabled) {
        return {
          enabled: false,
        };
      }

      return {
        enabled: true,
        startTime: day.startTime.trim(),
        shortenedType: day.shortenedType,
        commonBellSchedule: normalizeCommonBell(day.commonBellSchedule),
        specialWindows: day.specialWindows
          .map((window) => ({
            start: window.start.trim(),
            end: window.end.trim(),
          }))
          .filter((window) => window.start.length > 0 || window.end.length > 0),
        unknownAfternoonStartPeriod: day.unknownAfternoonStartPeriod.trim(),
        events: splitEventLines(day.eventsText),
        cafeteriaOpen: day.cafeteriaOpen,
        studyHallOpen: day.studyHallOpen,
        grades: {
          1: day.grades[1].map((session) =>
            normalizeSessionDraftForSerialize(session),
          ),
          2: day.grades[2].map((session) =>
            normalizeSessionDraftForSerialize(session),
          ),
          3: day.grades[3].map((session) =>
            normalizeSessionDraftForSerialize(session),
          ),
        },
      };
    }),
  );
}
