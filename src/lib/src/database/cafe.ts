import * as cmn from "../cmn";
import * as models from "../models";
import {
  addUtcDays,
  dateAtUtcMidnight,
  dateKey,
  parseDateKey,
  toOption,
} from "./shared";
import type { SqlOps } from "./sql";

export type CafeMenuRow = {
  target_date: Date | string;
  menus_as_str: string | object | null;
  menus_as_img_url: string | null;
  menus_as_img_preview_url: string | null;
};

export async function selectCafeMenuRows(
  startDateKey: string,
  endDateKey: string,
  sqlOps: SqlOps,
): Promise<CafeMenuRow[]> {
  return sqlOps.selectRows<CafeMenuRow[]>(
    `
      SELECT target_date, menus_as_str, menus_as_img_url, menus_as_img_preview_url
      FROM global_cafemenu_days
      WHERE target_date BETWEEN ? AND ?
      ORDER BY target_date
    `,
    [startDateKey, endDateKey],
  );
}

export async function getCafeMenuRange(
  startDate: Date,
  rangeDays: number,
  sqlOps: SqlOps,
): Promise<models.cafemenu.DailyCafeMenu[]> {
  if (rangeDays <= 0) {
    return [];
  }

  const start = dateAtUtcMidnight(startDate);
  const end = addUtcDays(start, rangeDays - 1);

  const rows = await selectCafeMenuRows(dateKey(start), dateKey(end), sqlOps);

  const byDate = new Map<
    string,
    {
      menus_as_str: unknown;
      menus_as_img_url: string | null;
      menus_as_img_preview_url: string | null;
    }
  >();
  rows.forEach((row) => {
    byDate.set(parseDateKey(row.target_date), {
      menus_as_str: row.menus_as_str,
      menus_as_img_url: row.menus_as_img_url,
      menus_as_img_preview_url: row.menus_as_img_preview_url,
    });
  });

  const result: models.cafemenu.DailyCafeMenu[] = [];

  for (let offset = 0; offset < rangeDays; offset += 1) {
    const date = addUtcDays(start, offset);
    const row = byDate.get(dateKey(date));

    if (!row) {
      result.push({
        menus_as_str: cmn.None(),
        menus_as_img_url: cmn.None(),
        menus_as_img_preview_url: cmn.None(),
      });
      continue;
    }

    let menus: string[] = [];
    if (row.menus_as_str) {
      let raw = row.menus_as_str;
      if (typeof raw === "string") {
        raw = JSON.parse(raw);
      }
      if (Array.isArray(raw)) {
        menus = raw.filter((item): item is string => typeof item === "string");
      }
    }

    result.push({
      menus_as_str: menus.length > 0 ? cmn.Some(menus) : cmn.None(),
      menus_as_img_url: toOption(row.menus_as_img_url),
      menus_as_img_preview_url: toOption(row.menus_as_img_preview_url),
    });
  }

  return result;
}

export async function upsertCafeMenuImageRange(
  startDate: Date,
  rangeDays: number,
  imageUrl: string,
  previewImageUrl: string,
  sqlOps: SqlOps,
): Promise<void> {
  if (rangeDays <= 0) {
    return;
  }

  const start = dateAtUtcMidnight(startDate);
  const params: Array<string> = [];
  const placeholders: string[] = [];

  for (let offset = 0; offset < rangeDays; offset += 1) {
    const date = addUtcDays(start, offset);
    placeholders.push("(?, ?, ?)");
    params.push(dateKey(date), imageUrl, previewImageUrl);
  }

  await sqlOps.executeSql(
    `
      INSERT INTO global_cafemenu_days
        (target_date, menus_as_img_url, menus_as_img_preview_url)
      VALUES ${placeholders.join(", ")}
      ON DUPLICATE KEY UPDATE
        menus_as_img_url = VALUES(menus_as_img_url),
        menus_as_img_preview_url = VALUES(menus_as_img_preview_url),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    params,
  );
}
