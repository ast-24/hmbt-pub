import { cmn, knowledge, models } from "@ast24/hmbt-v5-lib";

import { resolveCourse } from "@/shared/knowledge/safe-lookup";

export const EDITABLE_WEEKDAYS: cmn.time.DayOfWeek[] = [1, 2, 3, 4, 5];

export const WEEKDAY_LABEL: Record<cmn.time.DayOfWeek, string> = {
  0: "日",
  1: "月",
  2: "火",
  3: "水",
  4: "木",
  5: "金",
  6: "土",
};

export const SELECTION_OPTIONS = Object.values(
  models.schedule.TimetableSelectionID,
) as models.schedule.TimetableSelectionID[];

export const COURSE_OPTIONS = Object.values(
  knowledge.course.CourseID,
) as knowledge.course.CourseID[];

export const ROOM_OPTIONS = Object.values(
  knowledge.room.RoomID,
) as knowledge.room.RoomID[];

const COURSE_SET = new Set<string>(COURSE_OPTIONS);
const ROOM_SET = new Set<string>(ROOM_OPTIONS);
const FIXED_PERIODS = 7;

const DEFAULT_SELECTION_ID = models.schedule.TimetableSelectionID
  .A as models.schedule.TimetableSelectionID;

function normalizeSelectionId(
  value: unknown,
): models.schedule.TimetableSelectionID {
  if (typeof value === "string" && /^[A-J]$/.test(value)) {
    return value as models.schedule.TimetableSelectionID;
  }
  return DEFAULT_SELECTION_ID;
}

function normalizeCourseId(value: unknown): knowledge.course.CourseID | null {
  if (typeof value !== "string") {
    return null;
  }

  if (!COURSE_SET.has(value)) {
    return null;
  }

  if (!resolveCourse(value)) {
    return null;
  }

  return value as knowledge.course.CourseID;
}

export type PersonalSelectionDraft = {
  selectionId: models.schedule.TimetableSelectionID;
  course: knowledge.course.CourseID | null;
  roomId: string;
};

export type PersonalTimetableDraft = PersonalSelectionDraft[];

export type ClassPeriodDraft = {
  mode: "unset" | "normal" | "select";
  course: knowledge.course.CourseID | null;
  roomIds: string[];
  selectionId: models.schedule.TimetableSelectionID;
};

export type ClassDayDraft = {
  weekday: cmn.time.DayOfWeek;
  periods: ClassPeriodDraft[];
};

export type ClassTimetableDraft = ClassDayDraft[];

export function createEmptyPersonalSelection(
  selectionId: models.schedule.TimetableSelectionID,
): PersonalSelectionDraft {
  return {
    selectionId,
    course: null,
    roomId: "",
  };
}

export function createEmptyClassPeriod(): ClassPeriodDraft {
  return {
    mode: "unset",
    course: null,
    roomIds: [""],
    selectionId: DEFAULT_SELECTION_ID,
  };
}

function normalizeSingleRoomId(value: string): string {
  const trimmed = value.trim();
  if (!ROOM_SET.has(trimmed)) {
    return "";
  }
  return trimmed;
}

function normalizeRoomIds(values: string[]): knowledge.room.RoomID[] {
  const normalized: string[] = [];
  values.forEach((value) => {
    const token = value.trim();
    if (!token) {
      return;
    }
    if (!ROOM_SET.has(token)) {
      return;
    }
    if (normalized.includes(token)) {
      return;
    }
    normalized.push(token);
  });

  return normalized as knowledge.room.RoomID[];
}

function ensureFixedPeriods<T>(periods: T[], createEmpty: () => T): T[] {
  const next = periods.slice(0, FIXED_PERIODS);
  while (next.length < FIXED_PERIODS) {
    next.push(createEmpty());
  }
  return next;
}

export function personalTimetableToDraft(
  timetable: models.schedule.PersonalWeeklyTimetable,
): PersonalTimetableDraft {
  return SELECTION_OPTIONS.map((selectionId) => {
    const selected = timetable.get(selectionId);

    if (!selected || selected.isNone()) {
      return createEmptyPersonalSelection(selectionId);
    }

    const sess = selected.unwrap();
    return {
      selectionId,
      course: normalizeCourseId(sess.course),
      roomId: sess.room_id.mapOr<string>("", (roomId) => roomId),
    };
  });
}

export function classTimetableToDraft(
  timetable: models.schedule.OriginalWeeklyTimetable,
): ClassTimetableDraft {
  return EDITABLE_WEEKDAYS.map((weekday) => {
    const periods = timetable.get(weekday) ?? [];

    const draftPeriods = ensureFixedPeriods<ClassPeriodDraft>(
      [],
      createEmptyClassPeriod,
    );
    for (let index = 0; index < FIXED_PERIODS; index += 1) {
      const value = periods[index];

      if (!value) {
        continue;
      }

      if (value.type === "select") {
        draftPeriods[index] = {
          mode: "select",
          course: null,
          roomIds: [""],
          selectionId: value.selection_id,
        };
        continue;
      }

      draftPeriods[index] = {
        mode: "normal",
        course: normalizeCourseId(value.course),
        roomIds: value.room_id.mapOr([""], (roomIds) => [...roomIds]),
        selectionId: DEFAULT_SELECTION_ID,
      };
    }

    return {
      weekday,
      periods: draftPeriods,
    };
  });
}

export function draftToPersonalTimetable(
  draft: PersonalTimetableDraft,
): models.schedule.PersonalWeeklyTimetable {
  const timetable = new Map<
    models.schedule.TimetableSelectionID,
    cmn.Option<models.schedule.PersonalWeeklyTimetableSess>
  >();

  SELECTION_OPTIONS.forEach((selectionId) => {
    timetable.set(
      selectionId,
      cmn.None<models.schedule.PersonalWeeklyTimetableSess>(),
    );
  });

  draft.forEach((selection) => {
    const selectionId = normalizeSelectionId(selection.selectionId);
    const normalizedCourse = normalizeCourseId(selection.course);
    if (normalizedCourse === null) {
      timetable.set(
        selectionId,
        cmn.None<models.schedule.PersonalWeeklyTimetableSess>(),
      );
      return;
    }

    const normalizedRoom = normalizeSingleRoomId(selection.roomId);
    timetable.set(
      selectionId,
      cmn.Some({
        course: normalizedCourse,
        room_id: normalizedRoom
          ? cmn.Some(normalizedRoom as knowledge.room.RoomID)
          : cmn.None<knowledge.room.RoomID>(),
      }),
    );
  });

  return timetable;
}

export function draftToClassTimetable(
  draft: ClassTimetableDraft,
): models.schedule.OriginalWeeklyTimetable {
  const timetable = new Map<
    cmn.time.DayOfWeek,
    models.schedule.OriginalWeeklyTimetableSess[]
  >();

  draft.forEach((day) => {
    const periods: models.schedule.OriginalWeeklyTimetableSess[] = [];

    day.periods.forEach((period, index) => {
      if (period.mode === "unset") {
        return;
      }

      if (period.mode === "select") {
        periods[index] = {
          type: "select",
          selection_id: normalizeSelectionId(period.selectionId),
        };
        return;
      }

      const normalizedCourse = normalizeCourseId(period.course);
      if (normalizedCourse === null) {
        return;
      }

      const normalizedRoomIds = normalizeRoomIds(period.roomIds);

      periods[index] = {
        type: "normal",
        course: normalizedCourse,
        room_id:
          normalizedRoomIds.length > 0
            ? cmn.Some(normalizedRoomIds)
            : cmn.None<knowledge.room.RoomID[]>(),
      };
    });

    timetable.set(day.weekday, periods);
  });

  return timetable;
}

export function serializePersonalDraft(draft: PersonalTimetableDraft): string {
  return JSON.stringify(
    draft.map((selection) => ({
      selectionId: normalizeSelectionId(selection.selectionId),
      course: normalizeCourseId(selection.course),
      roomId: normalizeSingleRoomId(selection.roomId),
    })),
  );
}

export function serializeClassDraft(draft: ClassTimetableDraft): string {
  return JSON.stringify(
    draft.map((day) => ({
      weekday: day.weekday,
      periods: day.periods.map((period) => ({
        mode: period.mode,
        course: normalizeCourseId(period.course),
        selectionId: normalizeSelectionId(period.selectionId),
        roomIds: normalizeRoomIds(period.roomIds),
      })),
    })),
  );
}
