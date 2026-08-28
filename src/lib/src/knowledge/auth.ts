import * as cmn from "../cmn";
import * as dto from "../dto";
import * as knowledge from ".";

export const AUTH_COOKIE_NAMES = {
  SESSION: "hmbt_v5_sid",
  SESSION_SECRET: "hmbt_v5_ssec",
  ACCESS_TOKEN: "hmbt_v5_at",
  OIDC_STATE: "hmbt_v5_oidc_state",
} as const;

export const AUTH_ID_FORMATS = {
  user_id_prefix: "u_",
  user_id_random_length: 21,
  session_id_prefix: "s_",
  session_id_random_length: 30,
  session_secret_length: 64,
  email_verification_token_length: 6,
} as const;

export const AUTH_FIXED_LENGTHS = {
  user_id:
    AUTH_ID_FORMATS.user_id_prefix.length +
    AUTH_ID_FORMATS.user_id_random_length,
  session_id:
    AUTH_ID_FORMATS.session_id_prefix.length +
    AUTH_ID_FORMATS.session_id_random_length,
  session_secret: AUTH_ID_FORMATS.session_secret_length,
  email_verification_token: AUTH_ID_FORMATS.email_verification_token_length,
} as const;

export const AUTH_TTL_SEC = {
  session: 60 * 60 * 24 * 30 * 13,
  access_token: 60 * 60 * 24 * 3,
  email_verification_token: 60 * 10,
  oidc_state: 60 * 10,
} as const;

export const AUTH_JWT = {
  issuer: "api-hmbt.ast24.dev",
  audience: "hmbt.ast24.dev",
  access_token_type: "access",
  oidc_state_type: "oidc_state",
} as const;

export const PASSWORD_POLICY = {
  minLength: 8,
} as const;

export const PASSWORD_REQUIREMENT_MESSAGE =
  "8文字以上で、英字と数字の両方を含めてください。";

export function isValidPassword(password: string): boolean {
  return /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/.test(password);
}

export function createDefaultUserConfig(): dto.user_config.UserConfig {
  return {};
}

export function createDefaultWebUiConfig(): dto.user_config.UserConfigWebUI {
  return {
    theme: "system",
    show_ui_settings_button: true,
    widgets: [
      {
        type: dto.web_home_widget.WebHomeWidgetType.NextTrain,
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
      },
      {
        type: dto.web_home_widget.WebHomeWidgetType.PersonalSchedule,
        param: {
          direction: "horizontal",
          length: 7,
          past_days: 3,
          day_switch_time: cmn.time.TimeOnly.new(18, 0),
          show_finished_today_items: false,
          show_period_change_button: true,
          daily_items: [
            {
              type: dto.web_home_widget
                .WebHomeWidgetPersonalScheduleDailyItemType.Events,
              param: {},
            },
            {
              type: dto.web_home_widget
                .WebHomeWidgetPersonalScheduleDailyItemType.DailyMemo,
              param: {},
            },
            {
              type: dto.web_home_widget
                .WebHomeWidgetPersonalScheduleDailyItemType.MorningSess,
              param: {
                show_subject: true,
                show_short_course_name: true,
                show_timetable_position: true,
                highlight_mismatch: true,
                show_room: true,
                show_room_floor: true,
                show_time: true,
                show_duration: true,
                show_memo: true,
                show_personal_memo: true,
                show_shared_memo: true,
              },
            },
            {
              type: dto.web_home_widget
                .WebHomeWidgetPersonalScheduleDailyItemType.Cafe,
              param: {
                show_menu_button: true,
              },
            },
            {
              type: dto.web_home_widget
                .WebHomeWidgetPersonalScheduleDailyItemType.AfternoonSess,
              param: {
                show_subject: true,
                show_short_course_name: true,
                show_timetable_position: true,
                highlight_mismatch: true,
                show_room: true,
                show_room_floor: true,
                show_time: true,
                show_duration: true,
                show_memo: true,
                show_personal_memo: true,
                show_shared_memo: true,
              },
            },
            {
              type: dto.web_home_widget
                .WebHomeWidgetPersonalScheduleDailyItemType.StudyHall,
              param: {},
            },
          ],
        },
      },
      {
        type: dto.web_home_widget.WebHomeWidgetType.CafeMenu,
        param: {
          show_as_image: true,
          show_as_str: true,
          display_preference: "str",
          str_direction: "horizontal",
          str_length: 3,
          image_direction: "horizontal",
          show_next_week_image: false,
          day_switch_time: cmn.time.TimeOnly.new(15, 0),
        },
      },
      {
        type: dto.web_home_widget.WebHomeWidgetType.PersonalTimetable,
        param: {
          format: "grid",
          today_only: false,
          today_first: true,
        },
      },
      {
        type: dto.web_home_widget.WebHomeWidgetType.HomeClassOriginalTimetable,
        param: {
          format: "grid",
          today_only: false,
          today_first: true,
        },
      },
    ],
  };
}

export type OIDCProvider = "google" | "line";
