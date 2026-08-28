import { Option } from "../cmn";
import { DayOfWeek, TimeOnly, TimeWindow } from "../cmn/time";
import { CommonBellSkd } from "../knowledge/bell_skd";
import { CourseID } from "../knowledge/course";
import { RoomID } from "../knowledge/room";

export enum TimetableSelectionID {
  A = "A",
  B = "B",
  C = "C",
  D = "D",
  E = "E",
  F = "F",
  G = "G",
  H = "H",
  I = "I",
  J = "J",
}

export interface TimeTablePosition {
  dayofweek: DayOfWeek;
  period: number;
}

// 配信時の原本の月間授業予定表のデータモデル
// 全員共通の情報のみを保持する
// 月ごとで、index0=N月1日 の配列
export type OriginalMonSkd = OriginalMonSkdDay[];

export type OriginalMonSkdDay = {
  sess_by_grade: OriginalMonSkdSessByGrade[];
  start_time: Option<TimeOnly>;
  shortened: OriginalMonSkdShortened;
  events: string[];
  cafeteria_open: Option<boolean>;
  study_hall_open: Option<boolean>;
};

export type OriginalMonSkdSessByGrade = OriginalMonSkdSess[];

export type OriginalMonSkdSess =
  | {
      type: "normal";
      timetable_position: TimeTablePosition;
    }
  | {
      type: "special";
      name: string;
      room: Option<RoomID>;
    };

export type OriginalMonSkdShortened =
  | {
      type: "common";
      bell_schedule: CommonBellSkd;
    }
  | {
      type: "special";
      windows: TimeWindow[];
    }
  | {
      type: "unknown";
      afternoon_start_period: Option<number>;
    };

// 配信時の原本の週間時間割のデータモデル
// クラスごとで共通の情報のみを保持する
export type OriginalWeeklyTimetable = Map<
  DayOfWeek,
  OriginalWeeklyTimetableSess[]
>;

export type OriginalWeeklyTimetableSess =
  | {
      type: "normal";
      course: CourseID;
      room_id: Option<RoomID[]>;
    }
  | {
      type: "select";
      selection_id: TimetableSelectionID;
    };

// 個人用の週間時間割のデータモデル
// ユーザごとの選択科目スロットの入力値
// None=空きコマ
export type PersonalWeeklyTimetable = Map<
  TimetableSelectionID,
  Option<PersonalWeeklyTimetableSess>
>;

export type PersonalWeeklyTimetableSess = {
  course: CourseID;
  room_id: Option<RoomID>;
};

// 個人向け完全週間時間割
// OriginalWeeklyTimetable + PersonalWeeklyTimetable を解決した結果
export type CommonWeeklyTimetable = Map<
  DayOfWeek,
  Option<CommonWeeklyTimetableSess>[]
>;

export type CommonWeeklyTimetableSess = PersonalWeeklyTimetableSess;

// 個人用の授業メモのデータモデル
// ユーザごとに特定の授業に対して付けられるメモ
// 小テスト予定等の記録用
// 月ごとに管理する(このデータモデルは1月分のもの)
export type PersonalSessMemo = PersonalSessMemoDay[];

export type PersonalSessMemoDay = PersonalSessMemoDaySess[];

export type PersonalSessMemoDaySess = {
  memo: Option<string>;
};

// 個人用の日単位メモ
// ユーザごとに特定の日付へ付けるメモ
// 月ごとに管理する(このデータモデルは1月分のもの)
export type PersonalDailyMemo = PersonalDailyMemoDay[];

export type PersonalDailyMemoDay = {
  memo: Option<string>;
};

// 授業メンバ用の授業メモのデータモデル
// 同じ授業を受けるユーザ同士で共有されるメモ
// 小テスト予定等の記録用
// 月ごとに管理する(このデータモデルは1月分のもの)
export type SharedSessMemo = SharedSessMemoDay[];

export type SharedSessMemoDay = SharedSessMemoDayPeriod[];

// ユニオンやタプルにするとオブジェクトになりハッシュが一致しなくなるため分離
export type SharedSessMemoDayPeriod = {
  by_course: Map<
    CourseID,
    {
      with_room: Map<RoomID, SharedSessMemoDayPeriodSess>;
      without_room: SharedSessMemoDayPeriodSess;
    }
  >;
  by_name: Map<
    string,
    {
      with_room: Map<RoomID, SharedSessMemoDayPeriodSess>;
      without_room: SharedSessMemoDayPeriodSess;
    }
  >;
};

export type SharedSessMemoDayPeriodSess = {
  memo: string;
};

// ユーザごとの完全月間予定表のデータモデル
// 月間予定表を個人用週間時間割で解決し授業メモ等を反映したもの
// ここで短縮授業も解決する(週間予定マッピングのように時限順が必要なため)
export type PersonalMonSkd = Array<PersonalMonSkdDay | null>;

// sess=Noneは空きコマ
export type PersonalMonSkdDay = {
  sess: Option<PersonalMonSkdDaySess>[];
  time_windows: Option<TimeWindow[]>;
  events: string[];
  daily_memo: Option<string>;
  cafeteria_open: Option<boolean>;
  study_hall_open: Option<boolean>;
  afternoon_start_period: number;
};

export type PersonalMonSkdDaySess = {
  course:
    | {
        type: "normal";
        id: CourseID;
        timetable_position: TimeTablePosition;
      }
    | { type: "special"; name: string };
  room_id: Option<RoomID>;
  personal_memo: Option<string>;
  shared_memo: Option<string>;
};
