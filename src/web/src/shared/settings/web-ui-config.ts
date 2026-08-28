import { cmn, dto, knowledge } from "@ast24/hmbt-v5-lib";

const DEFAULT_SESS_PARAM: dto.web_home_widget.WebHomeWidgetDailyItemParamSess =
  {
    show_subject: true,
    show_short_course_name: true,
    show_timetable_position: true,
    highlight_mismatch: true,
    show_room: true,
    show_room_floor: true,
    show_time: false,
    show_duration: false,
    show_memo: true,
    show_personal_memo: true,
    show_shared_memo: true,
  };

export const WEB_WIDGET_LABEL: Record<
  dto.web_home_widget.WebHomeWidgetType,
  string
> = {
  [dto.web_home_widget.WebHomeWidgetType.PersonalSchedule]: "個人予定",
  [dto.web_home_widget.WebHomeWidgetType.PersonalTimetable]: "個人時間割",
  [dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable]:
    "クラス共通時間割",
  [dto.web_home_widget.WebHomeWidgetType.CafeMenu]: "カフェメニュー",
  [dto.web_home_widget.WebHomeWidgetType.NextTrain]: "次の電車",
};

export const DAILY_ITEM_LABEL: Record<
  dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType,
  string
> = {
  [dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess]:
    "授業(終日)",
  [dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.MorningSess]:
    "午前授業",
  [dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
    .AfternoonSess]: "午後授業",
  [dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.DailyMemo]:
    "日メモ",
  [dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Events]:
    "イベント",
  [dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Cafe]: "食堂",
  [dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.StudyHall]:
    "自習室",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

const TRAIN_TIMETABLE_ID_SET = new Set<string>(
  Object.values(knowledge.train_timetable.TrainTimetableID),
);

function asTrainTimetableIds(
  value: unknown,
  fallback: knowledge.train_timetable.TrainTimetableID[],
): knowledge.train_timetable.TrainTimetableID[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && TRAIN_TIMETABLE_ID_SET.has(item));

  return ids as knowledge.train_timetable.TrainTimetableID[];
}

function asTimeFormat(
  value: unknown,
  fallback: "in_minutes" | "hhmm",
): "in_minutes" | "hhmm" {
  if (value === "in_minutes" || value === "hhmm") {
    return value;
  }
  return fallback;
}

function asDirection(
  value: unknown,
  fallback: "horizontal" | "vertical",
): "horizontal" | "vertical" {
  if (value === "horizontal" || value === "vertical") {
    return value;
  }
  return fallback;
}

function decodeTimeOnly(
  value: unknown,
  fallback: cmn.time.TimeOnly,
): cmn.time.TimeOnly {
  if (value instanceof cmn.time.TimeOnly) {
    return cloneTimeOnly(value);
  }

  if (
    isPlainObject(value) &&
    typeof value.h === "number" &&
    typeof value.m === "number"
  ) {
    return cmn.time.TimeOnly.new(value.h, value.m);
  }

  if (typeof value === "string") {
    const matched = value.match(/^(\d{1,2}):(\d{1,2})$/);
    if (matched) {
      return cmn.time.TimeOnly.new(
        Number.parseInt(matched[1], 10),
        Number.parseInt(matched[2], 10),
      );
    }
  }

  return cloneTimeOnly(fallback);
}

function normalizeDailyItem(
  value: unknown,
): dto.web_home_widget.WebHomeWidgetDailyItemWithParam | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const param = isPlainObject(value.param) ? value.param : {};

  switch (value.type) {
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess:
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .MorningSess:
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .AfternoonSess:
      return {
        type: value.type,
        param: {
          show_subject: asBoolean(param.show_subject, true),
          show_short_course_name: asBoolean(param.show_short_course_name, true),
          show_timetable_position: asBoolean(
            param.show_timetable_position,
            true,
          ),
          highlight_mismatch: asBoolean(param.highlight_mismatch, true),
          show_room: asBoolean(param.show_room, true),
          show_room_floor: asBoolean(param.show_room_floor, true),
          show_time: asBoolean(param.show_time, false),
          show_duration: asBoolean(param.show_duration, false),
          show_memo: asBoolean(param.show_memo, true),
          show_personal_memo: asBoolean(param.show_personal_memo, true),
          show_shared_memo: asBoolean(param.show_shared_memo, true),
        },
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Events:
      return {
        type: value.type,
        param: {},
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .DailyMemo:
      return {
        type: value.type,
        param: {},
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Cafe:
      return {
        type: value.type,
        param: {
          show_menu_button: asBoolean(param.show_menu_button, true),
        },
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .StudyHall:
      return {
        type: value.type,
        param: {},
      };

    default:
      return null;
  }
}

function normalizePersonalScheduleParam(
  rawParam: Record<string, unknown>,
): dto.web_home_widget.WebHomeWidgetParamPersonalSchedule {
  const dailyItemsRaw = Array.isArray(rawParam.daily_items)
    ? rawParam.daily_items
    : [];
  const dailyItems = dailyItemsRaw
    .map((item) => normalizeDailyItem(item))
    .filter(
      (item): item is dto.web_home_widget.WebHomeWidgetDailyItemWithParam =>
        item !== null,
    );

  return {
    direction: asDirection(rawParam.direction, "horizontal"),
    length: Math.max(1, asNumber(rawParam.length, 7)),
    past_days: Math.min(30, Math.max(0, asNumber(rawParam.past_days, 3))),
    day_switch_time: decodeTimeOnly(
      rawParam.day_switch_time,
      cmn.time.TimeOnly.new(16, 30),
    ),
    show_finished_today_items: asBoolean(
      rawParam.show_finished_today_items,
      false,
    ),
    show_period_change_button: asBoolean(
      rawParam.show_period_change_button,
      true,
    ),
    daily_items: dailyItems,
  };
}

function normalizeWidget(
  value: unknown,
): dto.web_home_widget.WebHomeWidgetWithParam | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const param = isPlainObject(value.param) ? value.param : {};

  switch (value.type) {
    case dto.web_home_widget.WebHomeWidgetType.PersonalSchedule: {
      return {
        type: dto.web_home_widget.WebHomeWidgetType.PersonalSchedule,
        param: normalizePersonalScheduleParam(param),
      };
    }

    case "schedule_picker_calendar": {
      const childWidgetRaw = isPlainObject(param.child_widget)
        ? param.child_widget
        : {};
      const childParamRaw = isPlainObject(childWidgetRaw.param)
        ? childWidgetRaw.param
        : {};

      return {
        type: dto.web_home_widget.WebHomeWidgetType.PersonalSchedule,
        param: normalizePersonalScheduleParam(childParamRaw),
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
        type: dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable,
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
          show_next_week_image: asBoolean(param.show_next_week_image, false),
          day_switch_time: decodeTimeOnly(
            param.day_switch_time,
            cmn.time.TimeOnly.new(13, 0),
          ),
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
        knowledge.train_timetable.TrainTimetableID.JrKeihinTohoku_Tsurumi_Tokyo,
      ];

      const safeShowCount = Math.min(
        10,
        Math.max(1, asNumber(param.show_count, 3)),
      );
      const safeTimeFormat = asTimeFormat(param.time_format, "in_minutes");

      if (param.mode === "always") {
        return {
          type: dto.web_home_widget.WebHomeWidgetType.NextTrain,
          param: {
            mode: "always",
            timetable_ids: asTrainTimetableIds(
              param.timetable_ids,
              defaultAfter,
            ),
            show_count: safeShowCount,
            time_format: safeTimeFormat,
          },
        };
      }

      return {
        type: dto.web_home_widget.WebHomeWidgetType.NextTrain,
        param: {
          mode: "switch",
          switch_time: decodeTimeOnly(
            param.switch_time,
            cmn.time.TimeOnly.new(12, 0),
          ),
          before_ids: asTrainTimetableIds(param.before_ids, defaultBefore),
          after_ids: asTrainTimetableIds(param.after_ids, defaultAfter),
          show_count: safeShowCount,
          time_format: safeTimeFormat,
        },
      };
    }

    default:
      return null;
  }
}

export function normalizeWebUiConfig(
  raw: unknown,
): dto.user_config.UserConfigWebUI {
  if (!isPlainObject(raw)) {
    return {
      theme: "system",
      show_ui_settings_button: true,
      widgets: [],
    };
  }

  const theme: dto.user_config.UserConfigWebUI["theme"] =
    raw.theme === "light" || raw.theme === "dark" || raw.theme === "system"
      ? raw.theme
      : "system";
  const showUiSettingsButton = asBoolean(raw.show_ui_settings_button, true);
  const widgetsRaw = Array.isArray(raw.widgets) ? raw.widgets : [];
  const widgets = widgetsRaw
    .map((widget) => normalizeWidget(widget))
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

function cloneTimeOnly(value: cmn.time.TimeOnly): cmn.time.TimeOnly {
  return cmn.time.TimeOnly.new(value.h, value.m);
}

function cloneSessParam(
  value: dto.web_home_widget.WebHomeWidgetDailyItemParamSess,
): dto.web_home_widget.WebHomeWidgetDailyItemParamSess {
  return { ...value };
}

export function cloneDailyItem(
  value: dto.web_home_widget.WebHomeWidgetDailyItemWithParam,
): dto.web_home_widget.WebHomeWidgetDailyItemWithParam {
  switch (value.type) {
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess:
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .MorningSess:
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .AfternoonSess:
      return {
        type: value.type,
        param: cloneSessParam(value.param),
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Events:
      return {
        type: value.type,
        param: {},
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .DailyMemo:
      return {
        type: value.type,
        param: {},
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Cafe:
      return {
        type: value.type,
        param: {
          show_menu_button: value.param.show_menu_button,
        },
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .StudyHall:
      return {
        type: value.type,
        param: {},
      };
  }
}

export function cloneWidget(
  value: dto.web_home_widget.WebHomeWidgetWithParam,
): dto.web_home_widget.WebHomeWidgetWithParam {
  switch (value.type) {
    case dto.web_home_widget.WebHomeWidgetType.PersonalSchedule:
      return {
        type: value.type,
        param: {
          direction: value.param.direction,
          length: value.param.length,
          past_days: value.param.past_days,
          day_switch_time: cloneTimeOnly(value.param.day_switch_time),
          show_finished_today_items: value.param.show_finished_today_items,
          show_period_change_button: value.param.show_period_change_button,
          daily_items: value.param.daily_items.map(cloneDailyItem),
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.CafeMenu:
      return {
        type: value.type,
        param: {
          show_as_image: value.param.show_as_image,
          show_as_str: value.param.show_as_str,
          display_preference: value.param.display_preference,
          str_direction: value.param.str_direction,
          str_length: value.param.str_length,
          image_direction: value.param.image_direction,
          show_next_week_image: value.param.show_next_week_image,
          day_switch_time: cloneTimeOnly(value.param.day_switch_time),
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.NextTrain:
      if (value.param.mode === "always") {
        return {
          type: value.type,
          param: {
            mode: "always",
            timetable_ids: [...value.param.timetable_ids],
            show_count: value.param.show_count,
            time_format: value.param.time_format,
          },
        };
      }
      return {
        type: value.type,
        param: {
          mode: "switch",
          switch_time: cloneTimeOnly(value.param.switch_time),
          before_ids: [...value.param.before_ids],
          after_ids: [...value.param.after_ids],
          show_count: value.param.show_count,
          time_format: value.param.time_format,
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.PersonalTimetable:
      return {
        type: value.type,
        param: {
          format: value.param.format,
          today_only: value.param.today_only,
          today_first: value.param.today_first,
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable:
      return {
        type: value.type,
        param: {
          format: value.param.format,
          today_only: value.param.today_only,
          today_first: value.param.today_first,
        },
      };
  }
}

export function cloneWebUiConfig(
  config: dto.user_config.UserConfigWebUI,
): dto.user_config.UserConfigWebUI {
  return {
    theme: config.theme,
    show_ui_settings_button: config.show_ui_settings_button,
    widgets: config.widgets.map(cloneWidget),
  };
}

function serializeTimeOnly(value: cmn.time.TimeOnly): string {
  const h = String(value.h).padStart(2, "0");
  const m = String(value.m).padStart(2, "0");
  return `${h}:${m}`;
}

function serializeDailyItem(
  item: dto.web_home_widget.WebHomeWidgetDailyItemWithParam,
) {
  switch (item.type) {
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess:
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .MorningSess:
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .AfternoonSess:
      return {
        type: item.type,
        param: {
          show_subject: item.param.show_subject,
          show_short_course_name: item.param.show_short_course_name,
          show_timetable_position: item.param.show_timetable_position,
          highlight_mismatch: item.param.highlight_mismatch,
          show_room: item.param.show_room,
          show_room_floor: item.param.show_room_floor,
          show_time: item.param.show_time,
          show_duration: item.param.show_duration,
          show_memo: item.param.show_memo,
          show_personal_memo: item.param.show_personal_memo,
          show_shared_memo: item.param.show_shared_memo,
        },
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Events:
      return {
        type: item.type,
        param: {},
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .DailyMemo:
      return {
        type: item.type,
        param: {},
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Cafe:
      return {
        type: item.type,
        param: {
          show_menu_button: item.param.show_menu_button,
        },
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .StudyHall:
      return {
        type: item.type,
        param: {},
      };
  }
}

function serializeWidget(widget: dto.web_home_widget.WebHomeWidgetWithParam) {
  switch (widget.type) {
    case dto.web_home_widget.WebHomeWidgetType.PersonalSchedule:
      return {
        type: widget.type,
        param: {
          direction: widget.param.direction,
          length: widget.param.length,
          past_days: widget.param.past_days,
          day_switch_time: serializeTimeOnly(widget.param.day_switch_time),
          show_finished_today_items: widget.param.show_finished_today_items,
          show_period_change_button: widget.param.show_period_change_button,
          daily_items: widget.param.daily_items.map(serializeDailyItem),
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.CafeMenu:
      return {
        type: widget.type,
        param: {
          show_as_image: widget.param.show_as_image,
          show_as_str: widget.param.show_as_str,
          display_preference: widget.param.display_preference,
          str_direction: widget.param.str_direction,
          str_length: widget.param.str_length,
          image_direction: widget.param.image_direction,
          show_next_week_image: widget.param.show_next_week_image,
          day_switch_time: serializeTimeOnly(widget.param.day_switch_time),
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.NextTrain:
      if (widget.param.mode === "always") {
        return {
          type: widget.type,
          param: {
            mode: "always",
            timetable_ids: widget.param.timetable_ids,
            show_count: widget.param.show_count,
            time_format: widget.param.time_format,
          },
        };
      }
      return {
        type: widget.type,
        param: {
          mode: "switch",
          switch_time: serializeTimeOnly(widget.param.switch_time),
          before_ids: widget.param.before_ids,
          after_ids: widget.param.after_ids,
          show_count: widget.param.show_count,
          time_format: widget.param.time_format,
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.PersonalTimetable:
      return {
        type: widget.type,
        param: {
          format: widget.param.format,
          today_only: widget.param.today_only,
          today_first: widget.param.today_first,
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable:
      return {
        type: widget.type,
        param: {
          format: widget.param.format,
          today_only: widget.param.today_only,
          today_first: widget.param.today_first,
        },
      };
  }
}

export function serializeWebUiConfig(
  config: dto.user_config.UserConfigWebUI,
): string {
  return JSON.stringify({
    theme: config.theme,
    show_ui_settings_button: config.show_ui_settings_button,
    widgets: config.widgets.map(serializeWidget),
  });
}

export function createDefaultDailyItem(
  type: dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType,
): dto.web_home_widget.WebHomeWidgetDailyItemWithParam {
  switch (type) {
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Sess:
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .MorningSess:
    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .AfternoonSess:
      return {
        type,
        param: cloneSessParam(DEFAULT_SESS_PARAM),
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Events:
      return {
        type,
        param: {},
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .DailyMemo:
      return {
        type,
        param: {},
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Cafe:
      return {
        type,
        param: {
          show_menu_button: true,
        },
      };

    case dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
      .StudyHall:
      return {
        type,
        param: {},
      };
  }
}

function createDefaultPersonalScheduleParam(): dto.web_home_widget.WebHomeWidgetParamPersonalSchedule {
  return {
    direction: "horizontal",
    length: 7,
    past_days: 3,
    day_switch_time: cmn.time.TimeOnly.new(16, 30),
    show_finished_today_items: false,
    show_period_change_button: true,
    daily_items: [
      createDefaultDailyItem(
        dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType.Events,
      ),
      createDefaultDailyItem(
        dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
          .DailyMemo,
      ),
      createDefaultDailyItem(
        dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
          .MorningSess,
      ),
      createDefaultDailyItem(
        dto.web_home_widget.WebHomeWidgetPersonalScheduleDailyItemType
          .AfternoonSess,
      ),
    ],
  };
}

export function createDefaultWidget(
  type: dto.web_home_widget.WebHomeWidgetType,
): dto.web_home_widget.WebHomeWidgetWithParam {
  switch (type) {
    case dto.web_home_widget.WebHomeWidgetType.PersonalSchedule:
      return {
        type,
        param: createDefaultPersonalScheduleParam(),
      };

    case dto.web_home_widget.WebHomeWidgetType.NextTrain:
      return {
        type,
        param: {
          mode: "switch",
          switch_time: cmn.time.TimeOnly.new(12, 0),
          before_ids: [
            knowledge.train_timetable.TrainTimetableID
              .JrTsurumiLine_Tsurumi_TsurumiOno,
          ],
          after_ids: [
            knowledge.train_timetable.TrainTimetableID
              .JrTsurumiLine_TsurumiOno_Tsurumi,
            knowledge.train_timetable.TrainTimetableID
              .JrKeihinTohoku_Tsurumi_Yokohama,
            knowledge.train_timetable.TrainTimetableID
              .JrKeihinTohoku_Tsurumi_Tokyo,
          ],
          show_count: 3,
          time_format: "in_minutes",
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.CafeMenu:
      return {
        type,
        param: {
          show_as_image: false,
          show_as_str: true,
          display_preference: "str",
          str_direction: "horizontal",
          str_length: 7,
          image_direction: "horizontal",
          show_next_week_image: false,
          day_switch_time: cmn.time.TimeOnly.new(13, 0),
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.PersonalTimetable:
      return {
        type,
        param: {
          format: "grid",
          today_only: false,
          today_first: true,
        },
      };

    case dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable:
      return {
        type,
        param: {
          format: "grid",
          today_only: false,
          today_first: true,
        },
      };
  }
}

export function summarizeWidgetParam(
  widget: dto.web_home_widget.WebHomeWidgetWithParam,
): string {
  switch (widget.type) {
    case dto.web_home_widget.WebHomeWidgetType.PersonalSchedule:
      return `${widget.param.direction}, ここから${widget.param.length}日 + 過去${widget.param.past_days}日, 日次要素${widget.param.daily_items.length}件`;

    case dto.web_home_widget.WebHomeWidgetType.CafeMenu:
      return `${widget.param.display_preference}, 文字${widget.param.str_length}日, 画像${widget.param.show_next_week_image ? "2週" : "1週"}`;

    case dto.web_home_widget.WebHomeWidgetType.NextTrain: {
      if (widget.param.mode === "always") {
        return `常時, ${widget.param.timetable_ids.length}路線, ${widget.param.show_count}件, ${widget.param.time_format}`;
      }
      return `切替${serializeTimeOnly(widget.param.switch_time)}, 午前${widget.param.before_ids.length}路線/午後${widget.param.after_ids.length}路線, ${widget.param.show_count}件, ${widget.param.time_format}`;
    }

    case dto.web_home_widget.WebHomeWidgetType.PersonalTimetable:
      return `${widget.param.format}, ${widget.param.today_only ? "今日のみ" : "全曜日"}`;

    case dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable:
      return `${widget.param.format}, ${widget.param.today_only ? "今日のみ" : "全曜日"}`;
  }
}
