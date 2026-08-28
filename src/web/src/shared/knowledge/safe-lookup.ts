import { knowledge } from "@ast24/hmbt-v5-lib";

type CourseTable = Record<string, knowledge.course.Course>;
type SubjectTable = Record<string, knowledge.course.Subject>;
type RoomTable = Record<string, knowledge.room.Room>;

const COURSE_TABLE = knowledge.course.Courses as unknown as CourseTable;
const SUBJECT_TABLE = knowledge.course.Subjects as unknown as SubjectTable;
const ROOM_TABLE = knowledge.room.Rooms as unknown as RoomTable;

function formatUnknownLabel(base: string, id: unknown): string {
  if (typeof id !== "string" || id.trim().length === 0) {
    return base;
  }

  return `${base}(${id})`;
}

export function resolveCourse(
  courseId: unknown,
): knowledge.course.Course | null {
  if (typeof courseId !== "string") {
    return null;
  }

  return COURSE_TABLE[courseId] ?? null;
}

export function resolveCourseDisplayName(
  courseId: unknown,
  fallback?: string,
): string {
  const course = resolveCourse(courseId);
  if (course) {
    return course.displayName;
  }

  return fallback ?? formatUnknownLabel("Unknown course", courseId);
}

export function resolveCourseShortDisplayName(
  courseId: unknown,
  fallback?: string,
): string {
  const course = resolveCourse(courseId);
  if (course) {
    return course.shortDisplayName;
  }

  return fallback ?? formatUnknownLabel("Unknown course", courseId);
}

export function resolveCourseSubjectDisplayName(
  courseId: unknown,
  fallback = "Unknown subject",
): string {
  const course = resolveCourse(courseId);
  if (!course) {
    return fallback;
  }

  const subject = SUBJECT_TABLE[course.subject];
  return subject?.displayName ?? fallback;
}

export function resolveRoom(roomId: unknown): knowledge.room.Room | null {
  if (typeof roomId !== "string") {
    return null;
  }

  return ROOM_TABLE[roomId] ?? null;
}

export function resolveRoomDisplayName(
  roomId: unknown,
  fallback: string | null = null,
): string | null {
  const room = resolveRoom(roomId);
  if (room) {
    return room.displayName;
  }

  return fallback;
}
