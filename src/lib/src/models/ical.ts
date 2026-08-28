export enum PersonalIcalFeedFormatType {
  PersonalSessions = "personal_sessions",
  PersonalFullDay = "personal_full_day",
}

export enum GradeIcalFeedFormatType {
  GradeFullDay = "grade_full_day",
  GradeSchoolDay = "grade_school_day",
  GradeAfternoonDay = "grade_afternoon_day",
  GradeEvents = "grade_events",
}

export type IcalFeedFormatType =
  | PersonalIcalFeedFormatType
  | GradeIcalFeedFormatType;

export enum IcalFeedScheduleScopeOption {
  All = "all",
  MismatchSessionsOnly = "mismatch_sessions_only",
  DaysWithMismatchOnly = "days_with_mismatch_only",
}

export interface IcalFeedOptions {
  schedule_scope: IcalFeedScheduleScopeOption;
}

export const DEFAULT_ICAL_FEED_OPTIONS: Readonly<IcalFeedOptions> = {
  schedule_scope: IcalFeedScheduleScopeOption.All,
};

export const PERSONAL_ICAL_CALENDAR_NAME_BY_FORMAT: Record<
  PersonalIcalFeedFormatType,
  string
> = {
  [PersonalIcalFeedFormatType.PersonalSessions]:
    "はちまきBOT 個人予定詳細(1コマ単位)",
  [PersonalIcalFeedFormatType.PersonalFullDay]:
    "はちまきBOT 個人予定概要(1日単位)",
};

export const GRADE_ICAL_CALENDAR_NAME_BY_FORMAT: Record<
  GradeIcalFeedFormatType,
  string
> = {
  [GradeIcalFeedFormatType.GradeFullDay]: "はちまきBOT 学年共通予定",
  [GradeIcalFeedFormatType.GradeSchoolDay]: "はちまきBOT 学年共通予定(登校日)",
  [GradeIcalFeedFormatType.GradeAfternoonDay]:
    "はちまきBOT 学年共通予定(午後授業日)",
  [GradeIcalFeedFormatType.GradeEvents]: "はちまきBOT 学年共通予定(行事)",
};

export const ICAL_CALENDAR_NAME_BY_FORMAT: Record<IcalFeedFormatType, string> =
  {
    ...PERSONAL_ICAL_CALENDAR_NAME_BY_FORMAT,
    ...GRADE_ICAL_CALENDAR_NAME_BY_FORMAT,
  };

export function resolvePersonalIcalCalendarName(
  formatType: PersonalIcalFeedFormatType,
): string {
  return PERSONAL_ICAL_CALENDAR_NAME_BY_FORMAT[formatType];
}

export function resolveGradeIcalCalendarName(
  targetGrade: number,
  formatType: GradeIcalFeedFormatType,
): string {
  return `${targetGrade}年 ${GRADE_ICAL_CALENDAR_NAME_BY_FORMAT[formatType]}`;
}

export const PERSONAL_ICAL_CALENDAR_NAME = resolvePersonalIcalCalendarName(
  PersonalIcalFeedFormatType.PersonalSessions,
);

export const PERSONAL_ICAL_DEFAULT_TITLE_TEMPLATE = "{period_label}: {course}";

export const PERSONAL_ICAL_DEFAULT_DESCRIPTION_TEMPLATE =
  "@{room}\n{memo_shared}\n{memo_personal}";

export const PERSONAL_ICAL_FULL_DAY_DEFAULT_TITLE_TEMPLATE = "学校";

export const PERSONAL_ICAL_FULL_DAY_DEFAULT_DESCRIPTION_TEMPLATE =
  "1限: {period_1_course} {period_1_room}\n2限: {period_2_course} {period_2_room}\n3限: {period_3_course} {period_3_room}\n4限: {period_4_course} {period_4_room}\n5限: {period_5_course} {period_5_room}\n6限: {period_6_course} {period_6_room}\n7限: {period_7_course} {period_7_room}";

export const PERSONAL_ICAL_TITLE_TEMPLATE_CANDIDATES = [
  PERSONAL_ICAL_DEFAULT_TITLE_TEMPLATE,
  "{course}",
  "{date}({weekday}) {period_label}: {course}",
] as const;

export const PERSONAL_ICAL_FULL_DAY_TITLE_TEMPLATE_CANDIDATES = [
  PERSONAL_ICAL_FULL_DAY_DEFAULT_TITLE_TEMPLATE,
  "{date}({weekday}) 学校",
  "{date}({weekday}) 授業予定",
] as const;

export const PERSONAL_ICAL_DESCRIPTION_TEMPLATE_CANDIDATES = [
  PERSONAL_ICAL_DEFAULT_DESCRIPTION_TEMPLATE,
  "@{room}\n{memo_shared}",
  "{date}({weekday}) {period_label}\n@{room}\n{memo_shared}\n{memo_personal}",
] as const;

export const PERSONAL_ICAL_FULL_DAY_DESCRIPTION_TEMPLATE_CANDIDATES = [
  PERSONAL_ICAL_FULL_DAY_DEFAULT_DESCRIPTION_TEMPLATE,
  "{date}({weekday})\n1限: {period_1_course} {period_1_room}\n2限: {period_2_course} {period_2_room}\n3限: {period_3_course} {period_3_room}\n4限: {period_4_course} {period_4_room}\n5限: {period_5_course} {period_5_room}\n6限: {period_6_course} {period_6_room}\n7限: {period_7_course} {period_7_room}",
  "不一致コマ数: {mismatch_period_count}\n1限: {period_1_course} {period_1_room}\n2限: {period_2_course} {period_2_room}\n3限: {period_3_course} {period_3_room}\n4限: {period_4_course} {period_4_room}\n5限: {period_5_course} {period_5_room}\n6限: {period_6_course} {period_6_room}\n7限: {period_7_course} {period_7_room}",
] as const;

export const PERSONAL_ICAL_TEMPLATE_VARIABLES = [
  { variable: "{date}", description: "授業日 (例: 2026-04-08)" },
  { variable: "{year}", description: "年 (例: 2026)" },
  { variable: "{month}", description: "月 (1-12)" },
  { variable: "{day}", description: "日 (1-31)" },
  { variable: "{weekday}", description: "曜日 (例: 月)" },
  { variable: "{period}", description: "授業のコマ番号 (例: 3)" },
  { variable: "{period_label}", description: "授業ラベル (例: 3限)" },
  { variable: "{course}", description: "科目名 (例: 数学III)" },
  { variable: "{course_short}", description: "ショート科目名 (例: 数III)" },
  { variable: "{subject}", description: "教科名 (例: 数学)" },
  { variable: "{room}", description: "教室名 (例: 3-4教室)" },
  {
    variable: "{memo_personal}",
    description: "個人メモ (例: 宿題プリント提出)",
  },
  {
    variable: "{memo_shared}",
    description: "共通メモ (例: 小テストあり)",
  },
  { variable: "{memo}", description: "結合メモ (例: 宿題/小テスト)" },
  { variable: "{time_start}", description: "開始時刻 (例: 08:50)" },
  { variable: "{time_end}", description: "終了時刻 (例: 09:40)" },
  {
    variable: "{is_timetable_mismatch}",
    description: "時間割と不一致のコマなら1、一致なら0",
  },
  {
    variable: "{mismatch_period_count}",
    description: "その日の不一致コマ数",
  },
  {
    variable: "{period_1_course}",
    description: "1限の科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_1_course_short}",
    description: "1限のショート科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_1_subject}",
    description: "1限の教科名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_1_room}",
    description: "1限の教室名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_2_course}",
    description: "2限の科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_2_course_short}",
    description: "2限のショート科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_2_subject}",
    description: "2限の教科名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_2_room}",
    description: "2限の教室名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_3_course}",
    description: "3限の科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_3_course_short}",
    description: "3限のショート科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_3_subject}",
    description: "3限の教科名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_3_room}",
    description: "3限の教室名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_4_course}",
    description: "4限の科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_4_course_short}",
    description: "4限のショート科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_4_subject}",
    description: "4限の教科名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_4_room}",
    description: "4限の教室名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_5_course}",
    description: "5限の科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_5_course_short}",
    description: "5限のショート科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_5_subject}",
    description: "5限の教科名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_5_room}",
    description: "5限の教室名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_6_course}",
    description: "6限の科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_6_course_short}",
    description: "6限のショート科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_6_subject}",
    description: "6限の教科名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_6_room}",
    description: "6限の教室名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_7_course}",
    description: "7限の科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_7_course_short}",
    description: "7限のショート科目名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_7_subject}",
    description: "7限の教科名 (1日単位フォーマット向け)",
  },
  {
    variable: "{period_7_room}",
    description: "7限の教室名 (1日単位フォーマット向け)",
  },
] as const;

export interface IcalFeedCommon {
  id: number;
  calendar_name: string;
  title_template: string | null;
  description_template: string | null;
  public_path: string;
  public_url: string;
  is_enabled: boolean;
  last_generated_at: Date | null;
  generation_error: string | null;
  options: IcalFeedOptions;
  created_at: Date;
  updated_at: Date;
}

export interface PersonalIcalFeed extends IcalFeedCommon {
  owner_user_id: string;
  format_type: PersonalIcalFeedFormatType;
}

export interface GradeIcalFeed extends IcalFeedCommon {
  target_grade: number;
  format_type: GradeIcalFeedFormatType;
}
