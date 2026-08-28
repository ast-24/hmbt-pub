import * as cmn from "../cmn";
import * as dto from "../dto";
import * as knowledge from "../knowledge";
import * as models from "../models";
import { asBoolean, asDirection, asNumber } from "./shared";

type TimetableDecodeIssue =
  | "invalid_personal_session"
  | "invalid_personal_course"
  | "invalid_personal_room"
  | "invalid_class_session"
  | "invalid_class_session_type"
  | "invalid_class_course"
  | "invalid_class_selection_id"
  | "invalid_class_room_list"
  | "invalid_weekday_key"
  | "invalid_selection_key"
  | "invalid_period_list";

type MonthlyScheduleDecodeIssue =
  | "invalid_monthly_schedule"
  | "invalid_monthly_schedule_day"
  | "invalid_monthly_grade_sessions"
  | "invalid_monthly_session"
  | "invalid_monthly_shortened"
  | "invalid_monthly_events";

export class TimetableDecodeError extends Error {
  public readonly issue: TimetableDecodeIssue;

  public constructor(issue: TimetableDecodeIssue, message: string) {
    super(message);
    this.name = "TimetableDecodeError";
    this.issue = issue;
  }
}

export class MonthlyScheduleDecodeError extends Error {
  public readonly issue: MonthlyScheduleDecodeIssue;

  public constructor(issue: MonthlyScheduleDecodeIssue, message: string) {
    super(message);
    this.name = "MonthlyScheduleDecodeError";
    this.issue = issue;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeOption<T>(
  raw: unknown,
  decodeValue: (value: unknown) => T,
): cmn.Option<T> {
  if (raw instanceof cmn.Option) {
    return raw as cmn.Option<T>;
  }

  if (raw === null || raw === undefined) {
    return cmn.None<T>();
  }

  if (isPlainObject(raw) && "_value" in raw) {
    const rawValue = (raw as { _value: unknown })._value;
    if (rawValue === null || rawValue === undefined) {
      return cmn.None<T>();
    }
    return cmn.Some(decodeValue(rawValue));
  }

  return cmn.Some(decodeValue(raw));
}

function decodeMap<K, V>(
  raw: unknown,
  decodeKey: (value: unknown) => K,
  decodeValue: (value: unknown) => V,
): Map<K, V> {
  const result = new Map<K, V>();

  if (raw instanceof Map) {
    raw.forEach((value, key) => {
      result.set(decodeKey(key), decodeValue(value));
    });
    return result;
  }

  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) {
        return;
      }
      result.set(decodeKey(entry[0]), decodeValue(entry[1]));
    });
    return result;
  }

  if (isPlainObject(raw)) {
    Object.entries(raw).forEach(([key, value]) => {
      result.set(decodeKey(key), decodeValue(value));
    });
    return result;
  }

  return result;
}

function decodeBoolean(raw: unknown): boolean {
  if (typeof raw !== "boolean") {
    throw new MonthlyScheduleDecodeError(
      "invalid_monthly_schedule_day",
      "Invalid boolean value in monthly schedule",
    );
  }
  return raw;
}

function decodeMonthlyTimeOnly(raw: unknown): cmn.time.TimeOnly {
  try {
    return decodeTimeOnly(raw);
  } catch {
    throw new MonthlyScheduleDecodeError(
      "invalid_monthly_schedule_day",
      "Invalid start_time payload in monthly schedule",
    );
  }
}

function decodeMonthlyTimeWindow(raw: unknown): cmn.time.TimeWindow {
  try {
    return decodeTimeWindow(raw);
  } catch {
    throw new MonthlyScheduleDecodeError(
      "invalid_monthly_shortened",
      "Invalid time window payload in monthly schedule",
    );
  }
}

function decodeOriginalMonSkdSess(
  raw: unknown,
): models.schedule.OriginalMonSkdSess {
  if (!isPlainObject(raw)) {
    throw new MonthlyScheduleDecodeError(
      "invalid_monthly_session",
      "Invalid monthly schedule session payload",
    );
  }

  const type = raw.type;
  if (type === "normal") {
    if (!isPlainObject(raw.timetable_position)) {
      throw new MonthlyScheduleDecodeError(
        "invalid_monthly_session",
        "Invalid normal timetable_position payload",
      );
    }

    const dayofweek = Number.parseInt(
      String(raw.timetable_position.dayofweek),
      10,
    );
    const period = Number.parseInt(String(raw.timetable_position.period), 10);
    if (
      !Number.isFinite(dayofweek) ||
      !Number.isFinite(period) ||
      dayofweek < 0 ||
      dayofweek > 6 ||
      period < 1
    ) {
      throw new MonthlyScheduleDecodeError(
        "invalid_monthly_session",
        "Invalid normal timetable position in monthly schedule",
      );
    }

    return {
      type: "normal",
      timetable_position: {
        dayofweek: dayofweek as cmn.time.DayOfWeek,
        period,
      },
    };
  }

  if (type === "special") {
    const name = typeof raw.name === "string" ? raw.name : "";
    return {
      type: "special",
      name,
      room: decodeOption(raw.room, (room) => {
        if (typeof room !== "string") {
          throw new MonthlyScheduleDecodeError(
            "invalid_monthly_session",
            "Invalid room payload in monthly special session",
          );
        }
        return room as knowledge.room.RoomID;
      }),
    };
  }

  throw new MonthlyScheduleDecodeError(
    "invalid_monthly_session",
    "Unknown monthly schedule session type",
  );
}

function decodeOriginalMonSkdShortened(
  raw: unknown,
): models.schedule.OriginalMonSkdShortened {
  if (!isPlainObject(raw) || typeof raw.type !== "string") {
    throw new MonthlyScheduleDecodeError(
      "invalid_monthly_shortened",
      "Invalid monthly shortened payload",
    );
  }

  switch (raw.type) {
    case "common": {
      const bell = raw.bell_schedule;
      if (
        bell !== knowledge.bell_skd.CommonBellSkd.Normal &&
        bell !== knowledge.bell_skd.CommonBellSkd.ShortenedA &&
        bell !== knowledge.bell_skd.CommonBellSkd.ShortenedB &&
        bell !== knowledge.bell_skd.CommonBellSkd.ShortenedC
      ) {
        throw new MonthlyScheduleDecodeError(
          "invalid_monthly_shortened",
          "Invalid bell_schedule in monthly schedule",
        );
      }
      return {
        type: "common",
        bell_schedule: bell,
      };
    }
    case "special": {
      if (!Array.isArray(raw.windows)) {
        throw new MonthlyScheduleDecodeError(
          "invalid_monthly_shortened",
          "Invalid windows in monthly schedule shortened",
        );
      }
      return {
        type: "special",
        windows: raw.windows.map((windowRaw) =>
          decodeMonthlyTimeWindow(windowRaw),
        ),
      };
    }
    case "unknown": {
      return {
        type: "unknown",
        afternoon_start_period: decodeOption(
          raw.afternoon_start_period,
          (v) => {
            const parsed = Number.parseInt(String(v), 10);
            if (!Number.isFinite(parsed) || parsed < 1) {
              throw new MonthlyScheduleDecodeError(
                "invalid_monthly_shortened",
                "Invalid afternoon_start_period in monthly schedule",
              );
            }
            return parsed;
          },
        ),
      };
    }
    default:
      throw new MonthlyScheduleDecodeError(
        "invalid_monthly_shortened",
        "Unknown shortened type in monthly schedule",
      );
  }
}

function decodeOriginalMonSkdDay(
  raw: unknown,
): models.schedule.OriginalMonSkdDay {
  if (!isPlainObject(raw)) {
    throw new MonthlyScheduleDecodeError(
      "invalid_monthly_schedule_day",
      "Invalid monthly schedule day payload",
    );
  }

  if (!Array.isArray(raw.sess_by_grade)) {
    throw new MonthlyScheduleDecodeError(
      "invalid_monthly_grade_sessions",
      "sess_by_grade must be an array",
    );
  }

  const sessByGrade: models.schedule.OriginalMonSkdSessByGrade[] =
    raw.sess_by_grade.map((sessionsRaw) => {
      if (!Array.isArray(sessionsRaw)) {
        throw new MonthlyScheduleDecodeError(
          "invalid_monthly_grade_sessions",
          "Each grade session list must be an array",
        );
      }

      return sessionsRaw.map((sessionRaw) =>
        decodeOriginalMonSkdSess(sessionRaw),
      );
    });

  if (!Array.isArray(raw.events)) {
    throw new MonthlyScheduleDecodeError(
      "invalid_monthly_events",
      "events must be an array",
    );
  }

  const events = raw.events.map((eventRaw) => {
    if (typeof eventRaw !== "string") {
      throw new MonthlyScheduleDecodeError(
        "invalid_monthly_events",
        "events must contain only strings",
      );
    }
    return eventRaw;
  });

  return {
    sess_by_grade: sessByGrade,
    start_time: decodeOption(raw.start_time, (timeRaw) =>
      decodeMonthlyTimeOnly(timeRaw),
    ),
    shortened: decodeOriginalMonSkdShortened(raw.shortened),
    events,
    cafeteria_open: decodeOption(raw.cafeteria_open, (v) => decodeBoolean(v)),
    study_hall_open: decodeOption(raw.study_hall_open, (v) => decodeBoolean(v)),
  };
}

export function decodeOriginalMonthlyScheduleInput(
  raw: unknown,
): Array<models.schedule.OriginalMonSkdDay | null> {
  if (!Array.isArray(raw)) {
    throw new MonthlyScheduleDecodeError(
      "invalid_monthly_schedule",
      "Monthly schedule payload must be an array",
    );
  }

  return raw.map((dayRaw) =>
    dayRaw === null ? null : decodeOriginalMonSkdDay(dayRaw),
  );
}

export function decodeTimeOnly(raw: unknown): cmn.time.TimeOnly {
  if (raw instanceof cmn.time.TimeOnly) {
    return raw;
  }

  if (
    isPlainObject(raw) &&
    typeof raw.h === "number" &&
    typeof raw.m === "number"
  ) {
    return cmn.time.TimeOnly.new(raw.h, raw.m);
  }

  if (typeof raw === "string") {
    const m = raw.match(/^(\d{1,2}):(\d{1,2})$/);
    if (m) {
      return cmn.time.TimeOnly.new(
        Number.parseInt(m[1], 10),
        Number.parseInt(m[2], 10),
      );
    }
  }

  throw new Error("Invalid TimeOnly payload");
}

export function decodeTimeWindow(raw: unknown): cmn.time.TimeWindow {
  if (raw instanceof cmn.time.TimeWindow) {
    return raw;
  }

  if (isPlainObject(raw) && "start" in raw && "end" in raw) {
    return cmn.time.TimeWindow.new(
      decodeTimeOnly((raw as { start: unknown }).start),
      decodeTimeOnly((raw as { end: unknown }).end),
    );
  }

  throw new Error("Invalid TimeWindow payload");
}

export function normalizeWebUiConfig(
  raw: unknown,
): dto.user_config.UserConfigWebUI {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      theme: "system",
      show_ui_settings_button: true,
      widgets: [],
    };
  }

  const input = raw as Record<string, unknown>;
  const theme: dto.user_config.UserConfigWebUI["theme"] =
    input.theme === "light" ||
    input.theme === "dark" ||
    input.theme === "system"
      ? input.theme
      : "system";
  const showUiSettingsButton = asBoolean(input.show_ui_settings_button, true);

  const widgetsRaw = Array.isArray(input.widgets) ? input.widgets : [];
  const normalizePersonalScheduleDailyItems = (
    rawDailyItems: unknown,
  ): dto.web_home_widget.WebHomeWidgetDailyItemWithParam[] => {
    const dailyItemsRaw = Array.isArray(rawDailyItems) ? rawDailyItems : [];

    return dailyItemsRaw
      .map((item) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
          return null;
        }

        const itemValue = item as Record<string, unknown>;
        const itemParam = isPlainObject(itemValue.param) ? itemValue.param : {};

        switch (itemValue.type) {
          case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
            .Sess:
          case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
            .MorningSess:
          case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
            .AfternoonSess:
            return {
              type: itemValue.type,
              param: {
                show_subject: asBoolean(itemParam.show_subject, true),
                show_short_course_name: asBoolean(
                  itemParam.show_short_course_name,
                  true,
                ),
                show_timetable_position: asBoolean(
                  itemParam.show_timetable_position,
                  true,
                ),
                highlight_mismatch: asBoolean(
                  itemParam.highlight_mismatch,
                  true,
                ),
                show_room: asBoolean(itemParam.show_room, true),
                show_room_floor: asBoolean(itemParam.show_room_floor, true),
                show_time: asBoolean(itemParam.show_time, false),
                show_duration: asBoolean(itemParam.show_duration, false),
                show_memo: asBoolean(itemParam.show_memo, true),
                show_personal_memo: asBoolean(
                  itemParam.show_personal_memo,
                  true,
                ),
                show_shared_memo: asBoolean(itemParam.show_shared_memo, true),
              },
            };

          case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
            .Events:
            return {
              type: itemValue.type,
              param: {},
            };

          case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
            .DailyMemo:
            return {
              type: itemValue.type,
              param: {},
            };

          case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
            .Cafe:
            return {
              type: itemValue.type,
              param: {
                show_menu_button: asBoolean(itemParam.show_menu_button, true),
              },
            };

          case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
            .StudyHall:
            return {
              type: itemValue.type,
              param: {},
            };

          default:
            return null;
        }
      })
      .filter(
        (item): item is dto.web_home_widget.WebHomeWidgetDailyItemWithParam =>
          item !== null,
      );
  };

  const normalizePersonalScheduleParam = (
    rawParam: Record<string, unknown>,
  ): dto.web_home_widget.WebHomeWidgetParamPersonalSchedule => {
    return {
      direction: asDirection(rawParam.direction, "horizontal"),
      length: Math.max(1, asNumber(rawParam.length, 7)),
      past_days: Math.min(30, Math.max(0, asNumber(rawParam.past_days, 3))),
      day_switch_time: decodeTimeOnly(rawParam.day_switch_time ?? "16:30"),
      show_finished_today_items: asBoolean(
        rawParam.show_finished_today_items,
        false,
      ),
      show_period_change_button: asBoolean(
        rawParam.show_period_change_button,
        true,
      ),
      daily_items: normalizePersonalScheduleDailyItems(rawParam.daily_items),
    };
  };

  const TRAIN_TIMETABLE_ID_SET = new Set<string>(
    Object.values(knowledge.train_timetable.TrainTimetableID),
  );

  const asTrainTimetableIds = (
    value: unknown,
    fallback: knowledge.train_timetable.TrainTimetableID[],
  ): knowledge.train_timetable.TrainTimetableID[] => {
    if (!Array.isArray(value)) {
      return [...fallback];
    }

    const ids = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && TRAIN_TIMETABLE_ID_SET.has(item));

    return ids as knowledge.train_timetable.TrainTimetableID[];
  };

  const widgets = widgetsRaw
    .map((widget): dto.web_home_widget.WebHomeWidgetWithParam | null => {
      if (
        typeof widget !== "object" ||
        widget === null ||
        Array.isArray(widget)
      ) {
        return null;
      }
      const value = widget as Record<string, unknown>;
      const param =
        typeof value.param === "object" &&
        value.param !== null &&
        !Array.isArray(value.param)
          ? (value.param as Record<string, unknown>)
          : {};

      switch (value.type) {
        case dto.web_home_widget.WebHomeWidgetType.PersonalSchedule: {
          return {
            type: dto.web_home_widget.WebHomeWidgetType.PersonalSchedule,
            param: normalizePersonalScheduleParam(param),
          };
        }
        case "schedule_picker_calendar": {
          const childWidget = isPlainObject(param.child_widget)
            ? param.child_widget
            : {};
          const childParam = isPlainObject(childWidget.param)
            ? childWidget.param
            : {};

          return {
            type: dto.web_home_widget.WebHomeWidgetType.PersonalSchedule,
            param: normalizePersonalScheduleParam(childParam),
          };
        }
        case dto.web_home_widget.WebHomeWidgetType.PersonalTimetable:
          return {
            type: dto.web_home_widget.WebHomeWidgetType.PersonalTimetable,
            param: {
              format: param.format === "list" ? "list" : "grid",
              today_only: asBoolean(param.today_only, false),
              today_first: asBoolean(param.today_first, true),
            },
          };
        case dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable:
          return {
            type: dto.web_home_widget.WebHomeWidgetType
              .HomeClassOriginalTimetable,
            param: {
              format: param.format === "list" ? "list" : "grid",
              today_only: asBoolean(param.today_only, false),
              today_first: asBoolean(param.today_first, true),
            },
          };
        case dto.web_home_widget.WebHomeWidgetType.CafeMenu:
          return {
            type: dto.web_home_widget.WebHomeWidgetType.CafeMenu,
            param: {
              show_as_image: asBoolean(param.show_as_image, false),
              show_as_str: asBoolean(param.show_as_str, true),
              display_preference:
                param.display_preference === "image" ? "image" : "str",
              str_direction: asDirection(param.str_direction, "horizontal"),
              str_length: Math.max(1, asNumber(param.str_length, 7)),
              image_direction: asDirection(param.image_direction, "horizontal"),
              show_next_week_image: asBoolean(
                param.show_next_week_image,
                false,
              ),
              day_switch_time: decodeTimeOnly(param.day_switch_time ?? "13:00"),
            },
          };

        case dto.web_home_widget.WebHomeWidgetType.NextTrain: {
          const defaultBefore = [
            knowledge.train_timetable.TrainTimetableID
              .JrTsurumiLine_Tsurumi_TsurumiOno,
          ];
          const defaultAfter = [
            knowledge.train_timetable.TrainTimetableID
              .JrTsurumiLine_TsurumiOno_Tsurumi,
            knowledge.train_timetable.TrainTimetableID
              .JrKeihinTohoku_Tsurumi_Yokohama,
            knowledge.train_timetable.TrainTimetableID
              .JrKeihinTohoku_Tsurumi_Tokyo,
          ];

          const showCount = Math.min(
            10,
            Math.max(1, asNumber(param.show_count, 3)),
          );
          const timeFormat =
            param.time_format === "hhmm" ? "hhmm" : "in_minutes";

          if (param.mode === "always") {
            return {
              type: dto.web_home_widget.WebHomeWidgetType.NextTrain,
              param: {
                mode: "always",
                timetable_ids: asTrainTimetableIds(
                  param.timetable_ids,
                  defaultAfter,
                ),
                show_count: showCount,
                time_format: timeFormat,
              },
            };
          }

          return {
            type: dto.web_home_widget.WebHomeWidgetType.NextTrain,
            param: {
              mode: "switch",
              switch_time: decodeTimeOnly(param.switch_time ?? "12:00"),
              before_ids: asTrainTimetableIds(param.before_ids, defaultBefore),
              after_ids: asTrainTimetableIds(param.after_ids, defaultAfter),
              show_count: showCount,
              time_format: timeFormat,
            },
          };
        }
        default:
          return null;
      }
    })
    .filter(
      (widget): widget is dto.web_home_widget.WebHomeWidgetWithParam =>
        widget !== null,
    );

  return {
    theme,
    show_ui_settings_button: showUiSettingsButton,
    widgets,
  };
}

function parsePersonalWeeklySess(
  raw: unknown,
): models.schedule.PersonalWeeklyTimetableSess {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new TimetableDecodeError(
      "invalid_personal_session",
      "Invalid personal timetable session",
    );
  }

  const value = raw as Record<string, unknown>;
  const course = value.course;
  if (typeof course !== "string") {
    throw new TimetableDecodeError(
      "invalid_personal_course",
      "Invalid personal timetable course",
    );
  }

  return {
    course: course as knowledge.course.CourseID,
    room_id: decodeOption(value.room_id, (room: unknown) => {
      if (typeof room !== "string") {
        throw new TimetableDecodeError(
          "invalid_personal_room",
          "Invalid personal timetable room",
        );
      }
      return room as knowledge.room.RoomID;
    }),
  };
}

function parseSelectionId(
  raw: unknown,
  issue: "invalid_selection_key" | "invalid_class_selection_id",
): models.schedule.TimetableSelectionID {
  if (typeof raw !== "string" || !/^[A-J]$/.test(raw)) {
    throw new TimetableDecodeError(issue, "Invalid timetable selection id");
  }

  return raw as models.schedule.TimetableSelectionID;
}

function parseOriginalWeeklySess(
  raw: unknown,
): models.schedule.OriginalWeeklyTimetableSess {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new TimetableDecodeError(
      "invalid_class_session",
      "Invalid class timetable session",
    );
  }

  const value = raw as Record<string, unknown>;
  const sessionType = value.type;
  if (sessionType !== "normal" && sessionType !== "select") {
    throw new TimetableDecodeError(
      "invalid_class_session_type",
      "Invalid class timetable session type",
    );
  }

  if (sessionType === "select") {
    return {
      type: "select",
      selection_id: parseSelectionId(
        value.selection_id,
        "invalid_class_selection_id",
      ),
    };
  }

  const course = value.course;
  if (typeof course !== "string") {
    throw new TimetableDecodeError(
      "invalid_class_course",
      "Invalid class timetable course",
    );
  }

  return {
    type: "normal",
    course: course as knowledge.course.CourseID,
    room_id: decodeOption(value.room_id, (rooms: unknown) => {
      if (!Array.isArray(rooms)) {
        throw new TimetableDecodeError(
          "invalid_class_room_list",
          "Invalid class timetable room list",
        );
      }

      const normalized: knowledge.room.RoomID[] = [];
      for (const room of rooms) {
        if (typeof room !== "string") {
          throw new TimetableDecodeError(
            "invalid_class_room_list",
            "Invalid class timetable room list",
          );
        }
        normalized.push(room as knowledge.room.RoomID);
      }

      return normalized;
    }),
  };
}

export function decodePersonalWeeklyTimetableInput(
  raw: unknown,
): models.schedule.PersonalWeeklyTimetable {
  return decodeMap(
    raw,
    (key: unknown) => {
      return parseSelectionId(key, "invalid_selection_key");
    },
    (value: unknown) =>
      decodeOption(value, (sess: unknown) => parsePersonalWeeklySess(sess)),
  );
}

export function decodeOriginalWeeklyTimetableInput(
  raw: unknown,
): models.schedule.OriginalWeeklyTimetable {
  return decodeMap(
    raw,
    (key: unknown) => {
      const value = Number.parseInt(String(key), 10);
      if (!Number.isFinite(value) || value < 0 || value > 6) {
        throw new TimetableDecodeError(
          "invalid_weekday_key",
          "Invalid weekday key",
        );
      }
      return value as cmn.time.DayOfWeek;
    },
    (value: unknown) => {
      if (!Array.isArray(value)) {
        throw new TimetableDecodeError(
          "invalid_period_list",
          "Invalid period list",
        );
      }

      const periods: models.schedule.OriginalWeeklyTimetableSess[] = [];
      value.forEach((period, index) => {
        if (period === null || period === undefined) {
          return;
        }
        periods[index] = parseOriginalWeeklySess(period);
      });

      return periods;
    },
  );
}
