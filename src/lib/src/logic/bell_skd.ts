import { Option } from "../cmn";
import { TimeOnly, TimeWindow } from "../cmn/time";
import {
  BellSkdTemplate,
  START_TIME_OF_MORNING_SHR,
} from "../knowledge/bell_skd";

const DEFAULT_SESSION_LENGTH_MIN = 50;

function getSessionByPeriod(
  bell_schedule: BellSkdTemplate,
  periodInDailySchedule: number,
): { length_min: number } | null {
  if (!Number.isInteger(periodInDailySchedule) || periodInDailySchedule < 1) {
    return null;
  }
  const index = periodInDailySchedule - 1;
  const sess = bell_schedule.sess[index];
  return sess ?? null;
}

function getFallbackSessionLength(bell_schedule: BellSkdTemplate): number {
  for (const sess of bell_schedule.sess) {
    if (Number.isFinite(sess.length_min) && sess.length_min > 0) {
      return sess.length_min;
    }
  }
  return DEFAULT_SESSION_LENGTH_MIN;
}

function getSessionLengthOrFallback(
  bell_schedule: BellSkdTemplate,
  periodInDailySchedule: number,
): number {
  const session = getSessionByPeriod(bell_schedule, periodInDailySchedule);
  if (
    session &&
    Number.isFinite(session.length_min) &&
    session.length_min > 0
  ) {
    return session.length_min;
  }
  return getFallbackSessionLength(bell_schedule);
}

// 間隔ベースのテンプレートから、実際の授業時間を算出する
// 週間時間割に対応しないコマはNoneにすることで、インデックスにより自動解決させる
// そもそもSHRが無いなどの特殊なケースは、そもそも間隔ベースで生成せず最初からTimeWindow[]で直接指定される
export function BellSkdIntoSessTimeWindows(
  bell_schedule: BellSkdTemplate,
  periods: BellSkdIntoSessTimeWindowsPeriod[],
  start_time: Option<TimeOnly>,
): TimeWindow[] {
  let time_windows: TimeWindow[] = [];
  let atomic_periods_count = 0;
  let inserted_break_for_lunch = false;
  let isMergedFromPrevious = false;
  let current_time = start_time.unwrapOr(START_TIME_OF_MORNING_SHR);
  current_time = current_time.addMinutes(bell_schedule.morning_shr);
  current_time = current_time.addMinutes(bell_schedule.af_morning_shr_break);

  for (let period of periods) {
    const period_in_daily_schedule = atomic_periods_count + 1;

    if (time_windows.length > 0 && !isMergedFromPrevious) {
      // 2コマ目以降は授業と授業の間の休み時間を足す
      if (period_in_daily_schedule === 5 && !inserted_break_for_lunch) {
        // 4コマ目と5コマ目の間は昼休み
        current_time = current_time.addMinutes(bell_schedule.lunch_break);
        inserted_break_for_lunch = true;
      } else {
        current_time = current_time.addMinutes(bell_schedule.inter_sess_break);
      }
    }

    // 結合時も各コマは独立した時間幅を維持し、休み時間だけ省略する。
    let length_min = getSessionLengthOrFallback(
      bell_schedule,
      period_in_daily_schedule,
    );
    time_windows.push(
      TimeWindow.new(current_time, current_time.addMinutes(length_min)),
    );
    current_time = current_time.addMinutes(length_min);
    atomic_periods_count += 1;

    isMergedFromPrevious = period.same_as_next;
  }

  return time_windows;
}

export type BellSkdIntoSessTimeWindowsPeriod = {
  // 特殊時間割の場合はNoneになる
  period_in_weekly_timetable: Option<number>;
  same_as_next: boolean;
};
