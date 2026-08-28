import { None, Option, Some } from "../cmn";
import { TimeOnly, TimeWindow } from "../cmn/time";
import { BellSkd, BellSkdTemplate } from "../knowledge/bell_skd";
import {
  OriginalMonSkd,
  OriginalMonSkdDay,
  OriginalMonSkdSess,
  OriginalWeeklyTimetable,
  PersonalMonSkd,
  PersonalMonSkdDay,
  PersonalMonSkdDaySess,
  PersonalDailyMemo,
  PersonalDailyMemoDay,
  PersonalSessMemo,
  PersonalSessMemoDay,
  PersonalSessMemoDaySess,
  PersonalWeeklyTimetable,
  SharedSessMemo,
  SharedSessMemoDay,
  SharedSessMemoDayPeriod,
  TimeTablePosition,
} from "../models/schedule";
import {
  BellSkdIntoSessTimeWindows,
  BellSkdIntoSessTimeWindowsPeriod,
} from "./bell_skd";

// 必要なモデルを渡して特定の月の完全月間予定表を構築
// NOTE: 日付処理はしないためoriginal_mon_skd,shared_sess_memo,personal_sess_memoは開始日と長さが同じなら月単位でなくとも、１日始まりでなくとも良い
export function buildSkd(
  grade: number,
  personal_weekly_timetable: PersonalWeeklyTimetable,
  original_weekly_timetable: OriginalWeeklyTimetable,
  original_mon_skd: OriginalMonSkd,
  shared_sess_memo: SharedSessMemo,
  personal_sess_memo: PersonalSessMemo,
  personal_daily_memo: PersonalDailyMemo,
): PersonalMonSkd {
  let personal_mon_skd: PersonalMonSkd = [];

  for (let day_i = 0; day_i < original_mon_skd.length; day_i++) {
    let original_mon_skd_day = original_mon_skd[day_i];
    let shared_sess_memo_day = shared_sess_memo[day_i];
    let personal_sess_memo_day = personal_sess_memo[day_i];
    let personal_daily_memo_day = personal_daily_memo[day_i];

    personal_mon_skd.push(
      buildSkdProcDay(
        grade,
        personal_weekly_timetable,
        original_weekly_timetable,
        original_mon_skd_day,
        shared_sess_memo_day,
        personal_sess_memo_day,
        personal_daily_memo_day,
      ),
    );
  }

  return personal_mon_skd;
}

function buildSkdProcDay(
  grade: number,
  personal_weekly_timetable: PersonalWeeklyTimetable,
  original_weekly_timetable: OriginalWeeklyTimetable,
  original_mon_skd_day: OriginalMonSkdDay,
  shared_sess_memo_day: SharedSessMemoDay | undefined,
  personal_sess_memo_day: PersonalSessMemoDay | undefined,
  personal_daily_memo_day: PersonalDailyMemoDay | undefined,
): PersonalMonSkdDay {
  let personal_mon_skd_day_sess: Option<PersonalMonSkdDaySess>[] = [];

  let original_mon_skd_day_sess =
    original_mon_skd_day.sess_by_grade[grade] ?? [];

  for (
    let period_i = 0;
    period_i < original_mon_skd_day_sess.length;
    period_i++
  ) {
    let original_mon_skd_day_period_sess = original_mon_skd_day_sess[period_i];
    let shared_sess_memo_day_period = shared_sess_memo_day?.[period_i];
    let personal_sess_memo_day_period = personal_sess_memo_day?.[period_i];

    personal_mon_skd_day_sess.push(
      buildSkdProcDaySess(
        original_mon_skd_day_period_sess,
        personal_weekly_timetable,
        original_weekly_timetable,
        shared_sess_memo_day_period,
        personal_sess_memo_day_period,
      ),
    );
  }

  let sess_time_windows: Option<TimeWindow[]> = None();
  let afternoon_start_period = 5; // 基本は4,5の間が昼休みだから

  let shortened = original_mon_skd_day.shortened;

  switch (shortened.type) {
    case "common": {
      let bell_schedule = BellSkd[shortened.bell_schedule];
      sess_time_windows = Some(
        buildSkdProcDayTimeWindows(
          bell_schedule,
          original_mon_skd_day_sess,
          original_mon_skd_day.start_time,
        ),
      );
      break;
    }
    case "special": {
      sess_time_windows = Some(shortened.windows);
      break;
    }
    case "unknown": {
      if (shortened.afternoon_start_period.isSome()) {
        afternoon_start_period = shortened.afternoon_start_period.unwrap();
      }
      break;
    }
  }

  return {
    sess: personal_mon_skd_day_sess,
    time_windows: sess_time_windows,
    events: original_mon_skd_day.events,
    daily_memo: personal_daily_memo_day?.memo ?? None(),
    cafeteria_open: original_mon_skd_day.cafeteria_open,
    study_hall_open: original_mon_skd_day.study_hall_open,
    afternoon_start_period,
  };
}

function buildSkdProcDaySess(
  original_mon_skd_day_period_sess: OriginalMonSkdSess,
  personal_weekly_timetable: PersonalWeeklyTimetable,
  original_weekly_timetable: OriginalWeeklyTimetable,
  shared_sess_memo_day_period: SharedSessMemoDayPeriod | undefined,
  personal_sess_memo_day_period: PersonalSessMemoDaySess | undefined,
): Option<PersonalMonSkdDaySess> {
  switch (original_mon_skd_day_period_sess.type) {
    case "normal": {
      let timetable_position =
        original_mon_skd_day_period_sess.timetable_position;

      let original_weekly_timetable_sess = original_weekly_timetable.get(
        timetable_position.dayofweek,
      )?.[timetable_position.period - 1];
      if (!original_weekly_timetable_sess) {
        return buildUnknownCourseMappedSession(
          timetable_position,
          personal_sess_memo_day_period,
        );
      }

      if (original_weekly_timetable_sess.type === "normal") {
        let shared_memo_entry = shared_sess_memo_day_period?.by_course.get(
          original_weekly_timetable_sess.course,
        );
        const sharedMemoWithoutRoom = shared_memo_entry?.without_room?.memo;

        return Some({
          course: {
            type: "normal",
            id: original_weekly_timetable_sess.course,
            timetable_position,
          },
          room_id: None(),
          personal_memo: personal_sess_memo_day_period?.memo ?? None(),
          shared_memo:
            sharedMemoWithoutRoom !== undefined
              ? Some(sharedMemoWithoutRoom)
              : None(),
        });
      }

      let personal_weekly_timetable_sess = personal_weekly_timetable.get(
        original_weekly_timetable_sess.selection_id,
      );

      if (
        !personal_weekly_timetable_sess ||
        personal_weekly_timetable_sess.isNone()
      ) {
        // 個人の選択未設定により空きコマ
        return None();
      }

      let { course, room_id } = personal_weekly_timetable_sess.unwrap();

      let shared_memo_entry =
        shared_sess_memo_day_period?.by_course.get(course);
      let shared_memo = room_id?.isSome?.()
        ? shared_memo_entry?.with_room.get(room_id.unwrap())?.memo
        : shared_memo_entry?.without_room?.memo;

      return Some({
        course: {
          type: "normal",
          id: course,
          timetable_position,
        },
        room_id,
        personal_memo: personal_sess_memo_day_period?.memo ?? None(),
        shared_memo: shared_memo !== undefined ? Some(shared_memo) : None(),
      });
    }
    case "special": {
      if (
        original_mon_skd_day_period_sess.name.trim().length === 0 &&
        original_mon_skd_day_period_sess.room.isNone()
      ) {
        // 空文字の特別授業はプレースホルダとして扱い、空きコマに解決する。
        return None();
      }

      let shared_memo_entry = shared_sess_memo_day_period?.by_name.get(
        original_mon_skd_day_period_sess.name,
      );
      let shared_memo = original_mon_skd_day_period_sess.room?.isSome?.()
        ? shared_memo_entry?.with_room.get(
            original_mon_skd_day_period_sess.room.unwrap(),
          )?.memo
        : shared_memo_entry?.without_room?.memo;

      return Some({
        course: {
          type: "special",
          name: original_mon_skd_day_period_sess.name,
        },
        room_id: original_mon_skd_day_period_sess.room,
        personal_memo: personal_sess_memo_day_period?.memo ?? None(),
        shared_memo: shared_memo !== undefined ? Some(shared_memo) : None(),
      });

      break; // unreachableだが明示的に
    }
  }
  throw new Error("unreachable");
}

function isLunchBoundaryPair(periodIndex: number): boolean {
  // 0-based index 3 means pair 4-5.
  return periodIndex === 3;
}

function canMergeNormalSessionPair(
  current_sess: OriginalMonSkdSess | undefined,
  next_sess: OriginalMonSkdSess | undefined,
): boolean {
  if (!current_sess || !next_sess) {
    return false;
  }

  if (current_sess.type !== "normal" || next_sess.type !== "normal") {
    return false;
  }

  const current_position = current_sess.timetable_position;
  const next_position = next_sess.timetable_position;

  if (current_position.dayofweek !== next_position.dayofweek) {
    return false;
  }

  return (
    (current_position.period === 3 && next_position.period === 4) ||
    (current_position.period === 6 && next_position.period === 7)
  );
}

function resolveSpecialSessionName(
  sess: OriginalMonSkdSess | undefined,
): string | null {
  if (!sess || sess.type !== "special") {
    return null;
  }

  const normalized = sess.name.trim();
  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function resolveSpecialMergeFlags(
  original_mon_skd_day_sess: OriginalMonSkdSess[],
): boolean[] {
  const pairCount = Math.max(0, original_mon_skd_day_sess.length - 1);
  const candidates = Array.from({ length: pairCount }, () => false);
  const flags = Array.from({ length: pairCount }, () => false);

  for (let period_i = 0; period_i < pairCount; period_i += 1) {
    if (isLunchBoundaryPair(period_i)) {
      continue;
    }

    const currentName = resolveSpecialSessionName(
      original_mon_skd_day_sess[period_i],
    );
    const nextName = resolveSpecialSessionName(
      original_mon_skd_day_sess[period_i + 1],
    );

    candidates[period_i] = currentName !== null && currentName === nextName;
  }

  // 同名specialの連続候補は末尾ペアだけを結合対象にする。
  for (let period_i = 0; period_i < pairCount; period_i += 1) {
    if (!candidates[period_i]) {
      continue;
    }

    let run_end = period_i;
    while (run_end + 1 < pairCount && candidates[run_end + 1]) {
      run_end += 1;
    }

    flags[run_end] = true;
    period_i = run_end;
  }

  return flags;
}

function buildSkdProcDayTimeWindows(
  bell_schedule: BellSkdTemplate,
  original_mon_skd_day_sess: OriginalMonSkdSess[],
  start_time: Option<TimeOnly>,
): TimeWindow[] {
  const special_merge_flags = resolveSpecialMergeFlags(
    original_mon_skd_day_sess,
  );

  let bell_skd_into_sess_time_windows_periods: BellSkdIntoSessTimeWindowsPeriod[] =
    [];

  for (
    let period_i = 0;
    period_i < original_mon_skd_day_sess.length;
    period_i++
  ) {
    const current_sess = original_mon_skd_day_sess[period_i];
    const next_sess = original_mon_skd_day_sess[period_i + 1];

    const same_as_next =
      !isLunchBoundaryPair(period_i) &&
      (canMergeNormalSessionPair(current_sess, next_sess) ||
        special_merge_flags[period_i] === true);

    bell_skd_into_sess_time_windows_periods.push({
      period_in_weekly_timetable:
        current_sess.type === "normal"
          ? Some(current_sess.timetable_position.period)
          : None(),
      same_as_next,
    });
  }

  return BellSkdIntoSessTimeWindows(
    bell_schedule,
    bell_skd_into_sess_time_windows_periods,
    start_time,
  );
}

const WEEKDAY_LABEL_BY_INDEX: Record<number, string> = {
  0: "日",
  1: "月",
  2: "火",
  3: "水",
  4: "木",
  5: "金",
  6: "土",
};

function buildUnknownCourseMappedSession(
  position: TimeTablePosition,
  personalMemo: PersonalSessMemoDaySess | undefined,
): Option<PersonalMonSkdDaySess> {
  const weekdayLabel = WEEKDAY_LABEL_BY_INDEX[position.dayofweek] ?? "?";
  const periodLabel =
    Number.isFinite(position.period) && position.period > 0
      ? String(position.period)
      : "?";

  return Some({
    course: {
      type: "special",
      name: `不明(${weekdayLabel}${periodLabel})`,
    },
    room_id: None(),
    personal_memo: personalMemo?.memo ?? None(),
    shared_memo: None(),
  });
}
