import { api, cmn, dto, knowledge, models } from "@ast24/hmbt-v5-lib";

export const STUB_USER_ID = "u_demo_001";
export const STUB_HOME_CLASS_NUM: knowledge.HomeClassNum = 3;
export const STUB_USER_IDENTIFIERS: models.user.UserIdentifier[] = [
  {
    type: "legacy",
    email: "y15274241@edu.city.yokohama.jp",
  },
];

export const STUB_USER = models.user.User.load(
  STUB_USER_ID,
  cmn.Some("hoge_user"),
  3,
  STUB_HOME_CLASS_NUM,
  true,
  true,
);

export const STUB_AUTH_USER_ME: api.endpoints.ApiAuthUserMeGetRes = {
  has_session: true,
  has_access_token: true,
  is_verified_as_student: STUB_USER.is_verified_as_student,
};

export const STUB_USER_INFO: dto.userinfo.UserInfo = {
  name: STUB_USER.name,
  grade: STUB_USER.grade,
  homeclass: STUB_USER.homeclass,
  has_any_timetable_selection: STUB_USER.has_any_timetable_selection,
};

export const STUB_USER_CONFIG: dto.user_config.UserConfig =
  knowledge.auth.createDefaultUserConfig();

export const STUB_ICAL_PERSONAL_FEEDS: models.ical.PersonalIcalFeed[] = [
  {
    id: 1,
    owner_user_id: STUB_USER_ID,
    format_type: models.ical.PersonalIcalFeedFormatType.PersonalSessions,
    calendar_name: models.ical.resolvePersonalIcalCalendarName(
      models.ical.PersonalIcalFeedFormatType.PersonalSessions,
    ),
    title_template: "{course}",
    description_template: "{date} {period_label} {room}",
    public_path: "personal-feeds/stub-personal-ical-token-0001.ics",
    public_url:
      "https://ical-hmbt.ast24.dev/personal-feeds/stub-personal-ical-token-0001.ics",
    is_enabled: true,
    last_generated_at: new Date("2026-04-08T00:00:00.000Z"),
    generation_error: null,
    options: {
      schedule_scope: models.ical.IcalFeedScheduleScopeOption.All,
    },
    created_at: new Date("2026-04-07T12:00:00.000Z"),
    updated_at: new Date("2026-04-08T00:00:00.000Z"),
  },
];

export const STUB_ICAL_GRADE_FEEDS: models.ical.GradeIcalFeed[] = [
  {
    id: 2,
    target_grade: 3,
    format_type: models.ical.GradeIcalFeedFormatType.GradeEvents,
    calendar_name: models.ical.resolveGradeIcalCalendarName(
      3,
      models.ical.GradeIcalFeedFormatType.GradeEvents,
    ),
    title_template: null,
    description_template: null,
    public_path: "grade-feeds/stub-grade-ical-token-0002.ics",
    public_url:
      "https://ical-hmbt.ast24.dev/grade-feeds/stub-grade-ical-token-0002.ics",
    is_enabled: true,
    last_generated_at: new Date("2026-04-08T00:00:00.000Z"),
    generation_error: null,
    options: {
      schedule_scope: models.ical.IcalFeedScheduleScopeOption.All,
    },
    created_at: new Date("2026-04-07T12:30:00.000Z"),
    updated_at: new Date("2026-04-08T00:00:00.000Z"),
  },
];

function buildSess(
  courseId: knowledge.course.CourseID,
  dayofweek: cmn.time.DayOfWeek,
  period: number,
  roomId: knowledge.room.RoomID,
  personalMemo?: string,
  sharedMemo?: string,
): cmn.Option<models.schedule.PersonalMonSkdDaySess> {
  return cmn.Some({
    course: {
      type: "normal",
      id: courseId,
      timetable_position: { dayofweek, period },
    },
    room_id: cmn.Some(roomId),
    personal_memo: personalMemo ? cmn.Some(personalMemo) : cmn.None(),
    shared_memo: sharedMemo ? cmn.Some(sharedMemo) : cmn.None(),
  });
}

function buildPersonalWeeklySess(
  courseId: knowledge.course.CourseID,
  roomId: knowledge.room.RoomID,
): cmn.Option<models.schedule.PersonalWeeklyTimetableSess> {
  return cmn.Some({
    course: courseId,
    room_id: cmn.Some(roomId),
  });
}

function buildOriginalWeeklySess(
  courseId: knowledge.course.CourseID,
  roomIds: knowledge.room.RoomID[],
): models.schedule.OriginalWeeklyTimetableSess {
  return {
    type: "normal",
    course: courseId,
    room_id: cmn.Some(roomIds),
  };
}

function buildOriginalWeeklySelectSess(
  selectionId: models.schedule.TimetableSelectionID,
): models.schedule.OriginalWeeklyTimetableSess {
  return {
    type: "select",
    selection_id: selectionId,
  };
}

export const STUB_WEB_UI_CONFIG: dto.user_config.UserConfigWebUI =
  knowledge.auth.createDefaultWebUiConfig();

export const STUB_PERSONAL_MON_SKD: models.schedule.PersonalMonSkd = [
  {
    sess: [
      buildSess(
        knowledge.course.CourseID.MathExploration,
        1,
        1,
        knowledge.room.RoomID.S33,
        "演習ノートを復習",
        "次回は確認テスト",
      ),
      buildSess(
        knowledge.course.CourseID.EnglishSyntaxExploration,
        1,
        2,
        knowledge.room.RoomID.Call1,
      ),
      cmn.None(),
      buildSess(
        knowledge.course.CourseID.Chemistry,
        1,
        4,
        knowledge.room.RoomID.ChemistryLab1,
      ),
      buildSess(
        knowledge.course.CourseID.LongHomeRoom,
        1,
        5,
        knowledge.room.RoomID.S33,
      ),
      cmn.None(),
      cmn.None(),
    ],
    time_windows: cmn.None<cmn.time.TimeWindow[]>(),
    daily_memo: cmn.Some("放課後は進路ガイダンスの資料確認"),
    events: ["放課後: 進路ガイダンス"],
    cafeteria_open: cmn.Some(true),
    study_hall_open: cmn.Some(true),
    afternoon_start_period: 5,
  },
  {
    sess: [
      buildSess(
        knowledge.course.CourseID.LogicalJapanese,
        2,
        1,
        knowledge.room.RoomID.S34,
      ),
      buildSess(
        knowledge.course.CourseID.Physics,
        2,
        2,
        knowledge.room.RoomID.PhysicsLab,
      ),
      buildSess(
        knowledge.course.CourseID.Math3,
        2,
        3,
        knowledge.room.RoomID.S34,
        "宿題の未解答を確認",
      ),
      cmn.None(),
      buildSess(
        knowledge.course.CourseID.PracticalEnglish,
        2,
        5,
        knowledge.room.RoomID.Call2,
      ),
      cmn.None(),
      cmn.None(),
    ],
    time_windows: cmn.None<cmn.time.TimeWindow[]>(),
    daily_memo: cmn.None(),
    events: ["6限後: 委員会"],
    cafeteria_open: cmn.Some(false),
    study_hall_open: cmn.Some(true),
    afternoon_start_period: 5,
  },
  {
    sess: [
      buildSess(
        knowledge.course.CourseID.Biology,
        3,
        1,
        knowledge.room.RoomID.BiologyLab1,
      ),
      buildSess(
        knowledge.course.CourseID.InformationResearch,
        3,
        2,
        knowledge.room.RoomID.ProgrammingLab1,
      ),
      buildSess(
        knowledge.course.CourseID.WorldHistoryExploration,
        3,
        3,
        knowledge.room.RoomID.S35,
      ),
      cmn.None(),
      cmn.None(),
      cmn.None(),
      cmn.None(),
    ],
    time_windows: cmn.None<cmn.time.TimeWindow[]>(),
    daily_memo: cmn.Some("午前授業のみ"),
    events: ["午前放課"],
    cafeteria_open: cmn.Some(false),
    study_hall_open: cmn.Some(false),
    afternoon_start_period: 5,
  },
];

export const STUB_GLOBAL_MON_SKD: Array<models.schedule.OriginalMonSkdDay | null> =
  Array.from({ length: 31 }, () => null);

export const STUB_CAFE_MENU: models.cafemenu.DailyCafeMenu[] = [
  {
    menus_as_str: cmn.Some([
      "鶏のからあげ定食",
      "野菜たっぷりカレー",
      "きつねうどん",
    ]),
    menus_as_img_url: cmn.None<string>(),
    menus_as_img_preview_url: cmn.None<string>(),
  },
  {
    menus_as_str: cmn.Some(["白身魚フライ定食", "豚汁セット", "ミニサラダ"]),
    menus_as_img_url: cmn.None<string>(),
    menus_as_img_preview_url: cmn.None<string>(),
  },
  {
    menus_as_str: cmn.Some([
      "ハヤシライス",
      "ハムカツバーガー",
      "フルーツヨーグルト",
    ]),
    menus_as_img_url: cmn.None<string>(),
    menus_as_img_preview_url: cmn.None<string>(),
  },
];

export const STUB_PERSONAL_WEEKLY_TIMETABLE: models.schedule.PersonalWeeklyTimetable =
  new Map<
    models.schedule.TimetableSelectionID,
    cmn.Option<models.schedule.PersonalWeeklyTimetableSess>
  >([
    [
      models.schedule.TimetableSelectionID.A,
      buildPersonalWeeklySess(
        knowledge.course.CourseID.Chemistry,
        knowledge.room.RoomID.ChemistryLab1,
      ),
    ],
    [
      models.schedule.TimetableSelectionID.B,
      buildPersonalWeeklySess(
        knowledge.course.CourseID.Math3,
        knowledge.room.RoomID.S34,
      ),
    ],
    [models.schedule.TimetableSelectionID.C, cmn.None()],
    [models.schedule.TimetableSelectionID.D, cmn.None()],
    [models.schedule.TimetableSelectionID.E, cmn.None()],
    [models.schedule.TimetableSelectionID.F, cmn.None()],
    [models.schedule.TimetableSelectionID.G, cmn.None()],
    [models.schedule.TimetableSelectionID.H, cmn.None()],
    [models.schedule.TimetableSelectionID.I, cmn.None()],
    [models.schedule.TimetableSelectionID.J, cmn.None()],
  ]);

export const STUB_HOME_CLASS_ORIGINAL_TIMETABLE: models.schedule.OriginalWeeklyTimetable =
  new Map<cmn.time.DayOfWeek, models.schedule.OriginalWeeklyTimetableSess[]>([
    [
      1,
      [
        buildOriginalWeeklySess(knowledge.course.CourseID.MathExploration, [
          knowledge.room.RoomID.S33,
        ]),
        buildOriginalWeeklySess(
          knowledge.course.CourseID.EnglishSyntaxExploration,
          [knowledge.room.RoomID.Call1],
        ),
        buildOriginalWeeklySelectSess(models.schedule.TimetableSelectionID.A),
      ],
    ],
    [
      2,
      [
        buildOriginalWeeklySess(knowledge.course.CourseID.LogicalJapanese, [
          knowledge.room.RoomID.S34,
        ]),
        buildOriginalWeeklySess(knowledge.course.CourseID.Physics, [
          knowledge.room.RoomID.PhysicsLab,
        ]),
        buildOriginalWeeklySelectSess(models.schedule.TimetableSelectionID.B),
        buildOriginalWeeklySelectSess(models.schedule.TimetableSelectionID.C),
        buildOriginalWeeklySess(knowledge.course.CourseID.PracticalEnglish, [
          knowledge.room.RoomID.Call2,
        ]),
      ],
    ],
    [
      3,
      [
        buildOriginalWeeklySess(knowledge.course.CourseID.Biology, [
          knowledge.room.RoomID.BiologyLab1,
        ]),
        buildOriginalWeeklySess(knowledge.course.CourseID.InformationResearch, [
          knowledge.room.RoomID.ProgrammingLab1,
        ]),
      ],
    ],
    [4, []],
    [5, []],
  ]);
