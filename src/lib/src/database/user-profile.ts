import * as dto from "../dto";
import { normalizeWebUiConfig } from "./decode";
import { serializeForJson } from "./serde";
import { fromOption, toOption } from "./shared";
import type { SqlOps } from "./sql";

export async function getUserInfo(
  userId: string,
  sqlOps: SqlOps,
): Promise<dto.userinfo.UserInfo | null> {
  const rows = await sqlOps.selectRows<
    Array<{
      name: string | null;
      grade: number | null;
      home_class: number | null;
      has_any_timetable_selection: number | boolean;
    }>
  >(
    `
      SELECT name, grade, home_class, has_any_timetable_selection
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    name: toOption(row.name),
    grade: row.grade,
    homeclass: row.home_class,
    has_any_timetable_selection:
      row.has_any_timetable_selection === true ||
      row.has_any_timetable_selection === 1,
  };
}

export async function updateUserInfo(
  userId: string,
  userInfo: dto.userinfo.UserInfo,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      UPDATE users
      SET
        name = ?,
        grade = ?,
        home_class = ?,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
    `,
    [fromOption(userInfo.name), userInfo.grade, userInfo.homeclass, userId],
  );
}

export async function getUserConfig(
  userId: string,
  sqlOps: SqlOps,
): Promise<dto.user_config.UserConfig | null> {
  const rows = await sqlOps.selectRows<
    Array<{ settings: string | object | null }>
  >(
    `
      SELECT settings
      FROM users_settings
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  const settings = row.settings;
  if (!settings) {
    return null;
  }

  if (typeof settings === "string") {
    try {
      return JSON.parse(settings) as dto.user_config.UserConfig;
    } catch {
      return null;
    }
  }

  return settings as dto.user_config.UserConfig;
}

export async function putUserConfig(
  userId: string,
  config: dto.user_config.UserConfig,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO users_settings (user_id, settings)
      VALUES (?, CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE
        settings = VALUES(settings),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [userId, JSON.stringify(serializeForJson(config))],
  );
}

export async function getUserWebUiConfig(
  userId: string,
  sqlOps: SqlOps,
  normalize: (
    raw: unknown,
  ) => dto.user_config.UserConfigWebUI = normalizeWebUiConfig,
): Promise<dto.user_config.UserConfigWebUI | null> {
  const rows = await sqlOps.selectRows<
    Array<{ settings: string | object | null }>
  >(
    `
      SELECT settings
      FROM users_ui_settings
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  let raw: unknown = row.settings;
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  return normalize(raw);
}

export async function putUserWebUiConfig(
  userId: string,
  config: dto.user_config.UserConfigWebUI,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO users_ui_settings (user_id, settings)
      VALUES (?, CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE
        settings = VALUES(settings),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [userId, JSON.stringify(serializeForJson(config))],
  );
}
