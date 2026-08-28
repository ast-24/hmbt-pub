import { TimeOnly } from "../cmn/time";
import { TrainTimetableID } from "../knowledge/train_timetable";

export enum WebHomeWidgetType {
  PersonalSchedule = "personal_schedule",
  PersonalTimetable = "personal_timetable",
  HomeClassOriginalTimetable = "home_class_original_timetable",
  CafeMenu = "cafe_menu",
  NextTrain = "next_train",
}

export type WebHomeWidgetWithParam =
  | {
      type: WebHomeWidgetType.PersonalSchedule;
      param: WebHomeWidgetParamPersonalSchedule;
    }
  | {
      type: WebHomeWidgetType.PersonalTimetable;
      param: WebHomeWidgetParamPersonalTimetable;
    }
  | {
      type: WebHomeWidgetType.HomeClassOriginalTimetable;
      param: WebHomeWidgetParamHomeClassOriginalTimetable;
    }
  | {
      type: WebHomeWidgetType.CafeMenu;
      param: WebHomeWidgetParamCafeMenu;
    }
  | {
      type: WebHomeWidgetType.NextTrain;
      param: WebHomeWidgetParamNextTrain;
    };

export interface WebHomeWidgetParamPersonalSchedule {
  // 予定を並べる方向
  direction: "horizontal" | "vertical";

  // 予定をどれだけ先まで表示するか（先頭日を含めて何日分）
  length: number;

  // 先頭日(today/day_switch_time後はtomorrow)から何日分過去を表示するか
  past_days: number;

  // 先頭を明日に切り替える時間
  // 16:30なら、16:29までは今日から、16:30以降は明日以降を表示
  day_switch_time: TimeOnly;

  // 今日の予定の内、終わったものを表示するか
  show_finished_today_items: boolean;

  // 期間変更ボタンを表示するか
  show_period_change_button: boolean;

  // 1日分の予定のコンポーネント並び順
  // 例えば ["morning_sess", "cafe_open", "afternoon_sess"] など
  daily_items: WebHomeWidgetDailyItemWithParam[];
}

export enum WebHomeWidgetPersonalScheduleDailyItemType {
  Sess = "sess", // = morning_sess + afternoon_sess
  MorningSess = "morning_sess",
  AfternoonSess = "afternoon_sess",
  DailyMemo = "daily_memo",
  Events = "events",
  Cafe = "cafe",
  StudyHall = "study_hall",
}

export type WebHomeWidgetDailyItemWithParam =
  | {
      type: WebHomeWidgetPersonalScheduleDailyItemType.Sess;
      param: WebHomeWidgetDailyItemParamSess;
    }
  | {
      type: WebHomeWidgetPersonalScheduleDailyItemType.MorningSess;
      param: WebHomeWidgetDailyItemParamSess;
    }
  | {
      type: WebHomeWidgetPersonalScheduleDailyItemType.AfternoonSess;
      param: WebHomeWidgetDailyItemParamSess;
    }
  | {
      type: WebHomeWidgetPersonalScheduleDailyItemType.DailyMemo;
      param: WebHomeWidgetDailyItemParamDailyMemo;
    }
  | {
      type: WebHomeWidgetPersonalScheduleDailyItemType.Events;
      param: WebHomeWidgetDailyItemParamEvents;
    }
  | {
      type: WebHomeWidgetPersonalScheduleDailyItemType.Cafe;
      param: WebHomeWidgetDailyItemParamCafe;
    }
  | {
      type: WebHomeWidgetPersonalScheduleDailyItemType.StudyHall;
      param: WebHomeWidgetDailyItemParamStudyHall;
    };

export type WebHomeWidgetPersonalScheduleDailyItemWithParam =
  WebHomeWidgetDailyItemWithParam;

export interface WebHomeWidgetDailyItemParamSess {
  // 教科を表示するか(これがfalseでも 科目=course は表示)
  show_subject: boolean;

  // 科目で短縮表示名を使うか (e.g. "理数数学Ⅲγ" -> "数Ⅲ")
  show_short_course_name: boolean;

  // 教科に解決される前の時間割上での指定("月1","木5"など)を表示するか
  show_timetable_position: boolean;

  // 通常の曜日/コマと異なる授業(特別授業・空きコマ含む)をハイライト表示するか
  highlight_mismatch: boolean;

  // 部屋を表示するか
  show_room: boolean;

  // 部屋の階を表示するか(show_roomがtrueのときのみ有効)
  show_room_floor: boolean;

  // 授業の開始/終了時刻を表示するか
  show_time: boolean;

  // 授業の時間(N分間)を表示するか
  show_duration: boolean;

  // 授業メモを表示するか
  show_memo: boolean;

  // 授業メモのうち、個人メモを表示するか
  show_personal_memo: boolean;

  // 授業メモのうち、共有メモを表示するか
  show_shared_memo: boolean;
}

export type WebHomeWidgetPersonalScheduleDailyItemParamSess =
  WebHomeWidgetDailyItemParamSess;

export interface WebHomeWidgetDailyItemParamEvents {}

export type WebHomeWidgetPersonalScheduleDailyItemParamEvents =
  WebHomeWidgetDailyItemParamEvents;

export interface WebHomeWidgetDailyItemParamDailyMemo {}

export type WebHomeWidgetPersonalScheduleDailyItemParamDailyMemo =
  WebHomeWidgetDailyItemParamDailyMemo;

export interface WebHomeWidgetDailyItemParamCafe {
  // メニューボタンを表示するか
  // (メニューウィジェットへのアンカー)
  show_menu_button: boolean;
}

export type WebHomeWidgetPersonalScheduleDailyItemParamCafe =
  WebHomeWidgetDailyItemParamCafe;

export interface WebHomeWidgetDailyItemParamStudyHall {}

export type WebHomeWidgetPersonalScheduleDailyItemParamStudyHall =
  WebHomeWidgetDailyItemParamStudyHall;

export interface WebHomeWidgetParamPersonalTimetable {
  // 表示形式
  // listなら縦に全部並べ、gridなら曜日を列にする
  format: "list" | "grid";

  // 今日の曜日のみ表示するか（trueなら今日の曜日のみ、falseなら全曜日）
  today_only: boolean;

  // 今日の曜日を先頭に表示するか（falseなら月曜始まり）
  today_first: boolean;
}

export interface WebHomeWidgetParamHomeClassOriginalTimetable {
  // 表示形式
  // listなら縦に全部並べ、gridなら曜日を列にする
  format: "list" | "grid";

  // 今日の曜日のみ表示するか（trueなら今日の曜日のみ、falseなら全曜日）
  today_only: boolean;

  // 今日の曜日を先頭に表示するか（falseなら月曜始まり）
  today_first: boolean;
}

export interface WebHomeWidgetParamCafeMenu {
  // 画像で表示するか
  show_as_image: boolean;

  // 文字列で表示するか
  show_as_str: boolean;

  // どちらを優先するか
  // OCRができなければImageとして表示など
  display_preference: "image" | "str";

  // 文字列の場合に1日分づつのメニューを並べる方向
  str_direction: "horizontal" | "vertical";

  // 文字列の場合に何日分を表示するか（今日を含めて何日分）
  str_length: number;

  // 画像の場合かつ2週間分ある場合に、2枚を並べる方向
  image_direction: "horizontal" | "vertical";

  // 画像の場合に来週のがある場合に来週のも表示するか
  show_next_week_image: boolean;

  // 明日に切り替える時間
  day_switch_time: TimeOnly;
}

export interface WebHomeWidgetParamMovingClass {}

export type WebHomeWidgetParamNextTrain =
  | {
      mode: "always";
      timetable_ids: TrainTimetableID[];
      show_count: number;
      time_format: "in_minutes" | "hhmm";
    }
  | {
      mode: "switch";
      switch_time: TimeOnly;
      before_ids: TrainTimetableID[];
      after_ids: TrainTimetableID[];
      show_count: number;
      time_format: "in_minutes" | "hhmm";
    };
