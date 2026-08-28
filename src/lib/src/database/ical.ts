import * as knowledge from "../knowledge";
import * as models from "../models";
import type { SqlOps } from "./sql";

type IcalFeedCommonRow = {
  id: number;
  calendar_name: string;
  title_template: string | null;
  description_template: string | null;
  options_json: string | object | null;
  public_path: string;
  is_enabled: number | boolean;
  last_generated_at: Date | string | null;
  generation_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type PersonalIcalFeedRow = IcalFeedCommonRow & {
  owner_user_id: string;
  format_type: string;
};

type GradeIcalFeedRow = IcalFeedCommonRow & {
  target_grade: number;
  format_type: string;
};

export interface CreatePersonalIcalFeedInput {
  owner_user_id: string;
  format_type: models.ical.PersonalIcalFeedFormatType;
  calendar_name: string;
  title_template: string | null;
  description_template: string | null;
  options: models.ical.IcalFeedOptions;
  public_path: string;
  is_enabled: boolean;
}

export interface CreateGradeIcalFeedInput {
  target_grade: number;
  format_type: models.ical.GradeIcalFeedFormatType;
  calendar_name: string;
  title_template: string | null;
  description_template: string | null;
  options: models.ical.IcalFeedOptions;
  public_path: string;
  is_enabled: boolean;
}

export interface UpdateIcalFeedConfigInput {
  calendar_name: string;
  title_template: string | null;
  description_template: string | null;
  options: models.ical.IcalFeedOptions;
  is_enabled: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function toPersonalFormatType(
  value: string,
): models.ical.PersonalIcalFeedFormatType | null {
  if (
    value === models.ical.PersonalIcalFeedFormatType.PersonalSessions ||
    value === models.ical.PersonalIcalFeedFormatType.PersonalFullDay
  ) {
    return value as models.ical.PersonalIcalFeedFormatType;
  }
  return null;
}

function toGradeFormatType(
  value: string,
): models.ical.GradeIcalFeedFormatType | null {
  switch (value) {
    case models.ical.GradeIcalFeedFormatType.GradeFullDay:
      return models.ical.GradeIcalFeedFormatType.GradeFullDay;
    case models.ical.GradeIcalFeedFormatType.GradeSchoolDay:
      return models.ical.GradeIcalFeedFormatType.GradeSchoolDay;
    case models.ical.GradeIcalFeedFormatType.GradeAfternoonDay:
      return models.ical.GradeIcalFeedFormatType.GradeAfternoonDay;
    case models.ical.GradeIcalFeedFormatType.GradeEvents:
      return models.ical.GradeIcalFeedFormatType.GradeEvents;
    default:
      return null;
  }
}

function parseIcalFeedOptions(
  raw: unknown,
  formatType: models.ical.IcalFeedFormatType,
): models.ical.IcalFeedOptions {
  let parsedRaw = raw;
  if (typeof parsedRaw === "string") {
    try {
      parsedRaw = JSON.parse(parsedRaw);
    } catch {
      parsedRaw = null;
    }
  }

  const defaultScope = models.ical.DEFAULT_ICAL_FEED_OPTIONS.schedule_scope;
  const candidate = isPlainObject(parsedRaw)
    ? parsedRaw.schedule_scope
    : undefined;

  let scheduleScope = defaultScope;
  if (
    candidate === models.ical.IcalFeedScheduleScopeOption.All ||
    candidate ===
      models.ical.IcalFeedScheduleScopeOption.MismatchSessionsOnly ||
    candidate === models.ical.IcalFeedScheduleScopeOption.DaysWithMismatchOnly
  ) {
    scheduleScope = candidate;
  }

  if (
    formatType === models.ical.PersonalIcalFeedFormatType.PersonalFullDay &&
    scheduleScope ===
      models.ical.IcalFeedScheduleScopeOption.MismatchSessionsOnly
  ) {
    scheduleScope =
      models.ical.IcalFeedScheduleScopeOption.DaysWithMismatchOnly;
  }

  return {
    schedule_scope: scheduleScope,
  };
}

function intoPersonalFeed(
  row: PersonalIcalFeedRow,
): models.ical.PersonalIcalFeed | null {
  const formatType = toPersonalFormatType(row.format_type);
  const createdAt = toDate(row.created_at);
  const updatedAt = toDate(row.updated_at);

  if (!formatType || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    format_type: formatType,
    calendar_name: row.calendar_name,
    title_template: row.title_template,
    description_template: row.description_template,
    options: parseIcalFeedOptions(row.options_json, formatType),
    public_path: row.public_path,
    public_url: `https://${knowledge.HOSTNAMES.ICAL}/${row.public_path}`,
    is_enabled: row.is_enabled === true || row.is_enabled === 1,
    last_generated_at: toDate(row.last_generated_at),
    generation_error: row.generation_error,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function intoGradeFeed(
  row: GradeIcalFeedRow,
): models.ical.GradeIcalFeed | null {
  const formatType = toGradeFormatType(row.format_type);
  const createdAt = toDate(row.created_at);
  const updatedAt = toDate(row.updated_at);

  if (!formatType || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id: row.id,
    target_grade: row.target_grade,
    format_type: formatType,
    calendar_name: row.calendar_name,
    title_template: row.title_template,
    description_template: row.description_template,
    options: parseIcalFeedOptions(row.options_json, formatType),
    public_path: row.public_path,
    public_url: `https://${knowledge.HOSTNAMES.ICAL}/${row.public_path}`,
    is_enabled: row.is_enabled === true || row.is_enabled === 1,
    last_generated_at: toDate(row.last_generated_at),
    generation_error: row.generation_error,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function selectPersonalFeedsBySql(
  sql: string,
  params: Array<string | number | boolean | null>,
  sqlOps: SqlOps,
): Promise<models.ical.PersonalIcalFeed[]> {
  const rows = await sqlOps.selectRows<PersonalIcalFeedRow[]>(sql, params);
  return rows
    .map((row) => intoPersonalFeed(row))
    .filter((row): row is models.ical.PersonalIcalFeed => row !== null);
}

async function selectGradeFeedsBySql(
  sql: string,
  params: Array<string | number | boolean | null>,
  sqlOps: SqlOps,
): Promise<models.ical.GradeIcalFeed[]> {
  const rows = await sqlOps.selectRows<GradeIcalFeedRow[]>(sql, params);
  return rows
    .map((row) => intoGradeFeed(row))
    .filter((row): row is models.ical.GradeIcalFeed => row !== null);
}

export async function listPersonalIcalFeedsByOwner(
  ownerUserId: string,
  sqlOps: SqlOps,
): Promise<models.ical.PersonalIcalFeed[]> {
  return selectPersonalFeedsBySql(
    `
      SELECT
        id,
        owner_user_id,
        format_type,
        calendar_name,
        title_template,
        description_template,
        options_json,
        public_path,
        is_enabled,
        last_generated_at,
        generation_error,
        created_at,
        updated_at
      FROM user_ical_feeds
      WHERE owner_user_id = ?
      ORDER BY id DESC
    `,
    [ownerUserId],
    sqlOps,
  );
}

export async function listGradeIcalFeedsBySubscriber(
  userId: string,
  targetGrade: number,
  sqlOps: SqlOps,
): Promise<models.ical.GradeIcalFeed[]> {
  return selectGradeFeedsBySql(
    `
      SELECT
        feed.id,
        feed.target_grade,
        feed.format_type,
        feed.calendar_name,
        feed.title_template,
        feed.description_template,
        feed.options_json,
        feed.public_path,
        feed.is_enabled,
        feed.last_generated_at,
        feed.generation_error,
        feed.created_at,
        feed.updated_at
      FROM grade_ical_feeds feed
      JOIN grade_ical_feed_subscribers subscriber
        ON subscriber.feed_id = feed.id
      WHERE subscriber.user_id = ?
        AND feed.target_grade = ?
      ORDER BY feed.id DESC
    `,
    [userId, targetGrade],
    sqlOps,
  );
}

export async function listGradeIcalFeedsByGrade(
  targetGrade: number,
  sqlOps: SqlOps,
): Promise<models.ical.GradeIcalFeed[]> {
  return selectGradeFeedsBySql(
    `
      SELECT
        id,
        target_grade,
        format_type,
        calendar_name,
        title_template,
        description_template,
        options_json,
        public_path,
        is_enabled,
        last_generated_at,
        generation_error,
        created_at,
        updated_at
      FROM grade_ical_feeds
      WHERE target_grade = ?
      ORDER BY id DESC
    `,
    [targetGrade],
    sqlOps,
  );
}

export async function getPersonalIcalFeedById(
  feedId: number,
  sqlOps: SqlOps,
): Promise<models.ical.PersonalIcalFeed | null> {
  const list = await selectPersonalFeedsBySql(
    `
      SELECT
        id,
        owner_user_id,
        format_type,
        calendar_name,
        title_template,
        description_template,
        options_json,
        public_path,
        is_enabled,
        last_generated_at,
        generation_error,
        created_at,
        updated_at
      FROM user_ical_feeds
      WHERE id = ?
      LIMIT 1
    `,
    [feedId],
    sqlOps,
  );

  return list[0] ?? null;
}

export async function getGradeIcalFeedById(
  feedId: number,
  sqlOps: SqlOps,
): Promise<models.ical.GradeIcalFeed | null> {
  const list = await selectGradeFeedsBySql(
    `
      SELECT
        id,
        target_grade,
        format_type,
        calendar_name,
        title_template,
        description_template,
        options_json,
        public_path,
        is_enabled,
        last_generated_at,
        generation_error,
        created_at,
        updated_at
      FROM grade_ical_feeds
      WHERE id = ?
      LIMIT 1
    `,
    [feedId],
    sqlOps,
  );

  return list[0] ?? null;
}

export async function getGradeIcalFeedByGradeFormat(
  targetGrade: number,
  formatType: models.ical.GradeIcalFeedFormatType,
  sqlOps: SqlOps,
): Promise<models.ical.GradeIcalFeed | null> {
  const list = await selectGradeFeedsBySql(
    `
      SELECT
        id,
        target_grade,
        format_type,
        calendar_name,
        title_template,
        description_template,
        options_json,
        public_path,
        is_enabled,
        last_generated_at,
        generation_error,
        created_at,
        updated_at
      FROM grade_ical_feeds
      WHERE target_grade = ?
        AND format_type = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [targetGrade, formatType],
    sqlOps,
  );

  return list[0] ?? null;
}

export async function subscribeGradeIcalFeed(
  feedId: number,
  userId: string,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO grade_ical_feed_subscribers (feed_id, user_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE user_id = user_id
    `,
    [feedId, userId],
  );
}

export async function unsubscribeGradeIcalFeed(
  feedId: number,
  userId: string,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      DELETE FROM grade_ical_feed_subscribers
      WHERE feed_id = ?
        AND user_id = ?
    `,
    [feedId, userId],
  );
}

export async function isGradeIcalFeedSubscribedByUser(
  feedId: number,
  userId: string,
  sqlOps: SqlOps,
): Promise<boolean> {
  const rows = await sqlOps.selectRows<Array<{ subscribed: number }>>(
    `
      SELECT 1 AS subscribed
      FROM grade_ical_feed_subscribers
      WHERE feed_id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [feedId, userId],
  );

  return !!rows[0];
}

export async function createPersonalIcalFeed(
  input: CreatePersonalIcalFeedInput,
  sqlOps: SqlOps,
): Promise<models.ical.PersonalIcalFeed> {
  const result = await sqlOps.executeSql(
    `
      INSERT INTO user_ical_feeds
        (
          owner_user_id,
          format_type,
          calendar_name,
          title_template,
          description_template,
          options_json,
          public_path,
          is_enabled
        )
      VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)
    `,
    [
      input.owner_user_id,
      input.format_type,
      input.calendar_name,
      input.title_template,
      input.description_template,
      JSON.stringify(input.options),
      input.public_path,
      input.is_enabled,
    ],
  );

  const created = await getPersonalIcalFeedById(result.insertId, sqlOps);
  if (!created) {
    throw new Error("Failed to load created personal iCal feed");
  }
  return created;
}

export async function createGradeIcalFeed(
  input: CreateGradeIcalFeedInput,
  sqlOps: SqlOps,
): Promise<models.ical.GradeIcalFeed> {
  const result = await sqlOps.executeSql(
    `
      INSERT INTO grade_ical_feeds
        (
          target_grade,
          format_type,
          calendar_name,
          title_template,
          description_template,
          options_json,
          public_path,
          is_enabled
        )
      VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)
    `,
    [
      input.target_grade,
      input.format_type,
      input.calendar_name,
      input.title_template,
      input.description_template,
      JSON.stringify(input.options),
      input.public_path,
      input.is_enabled,
    ],
  );

  const created = await getGradeIcalFeedById(result.insertId, sqlOps);
  if (!created) {
    throw new Error("Failed to load created grade iCal feed");
  }
  return created;
}

export async function updatePersonalIcalFeedConfig(
  feedId: number,
  input: UpdateIcalFeedConfigInput,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      UPDATE user_ical_feeds
      SET
        calendar_name = ?,
        title_template = ?,
        description_template = ?,
        options_json = CAST(? AS JSON),
        is_enabled = ?,
        generation_error = NULL,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
    `,
    [
      input.calendar_name,
      input.title_template,
      input.description_template,
      JSON.stringify(input.options),
      input.is_enabled,
      feedId,
    ],
  );
}

export async function updateGradeIcalFeedConfig(
  feedId: number,
  input: UpdateIcalFeedConfigInput,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      UPDATE grade_ical_feeds
      SET
        calendar_name = ?,
        title_template = ?,
        description_template = ?,
        options_json = CAST(? AS JSON),
        is_enabled = ?,
        generation_error = NULL,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
    `,
    [
      input.calendar_name,
      input.title_template,
      input.description_template,
      JSON.stringify(input.options),
      input.is_enabled,
      feedId,
    ],
  );
}

export async function deletePersonalIcalFeed(
  feedId: number,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(`DELETE FROM user_ical_feeds WHERE id = ?`, [feedId]);
}

export async function deleteGradeIcalFeed(
  feedId: number,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(`DELETE FROM grade_ical_feeds WHERE id = ?`, [
    feedId,
  ]);
}

export async function updatePersonalIcalFeedGenerationState(
  feedId: number,
  generationError: string | null,
  sqlOps: SqlOps,
): Promise<void> {
  if (generationError !== null) {
    await sqlOps.executeSql(
      `
        UPDATE user_ical_feeds
        SET
          generation_error = ?,
          updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?
      `,
      [generationError, feedId],
    );
    return;
  }

  await sqlOps.executeSql(
    `
      UPDATE user_ical_feeds
      SET
        last_generated_at = CURRENT_TIMESTAMP(3),
        generation_error = ?,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
    `,
    [generationError, feedId],
  );
}

export async function updateGradeIcalFeedGenerationState(
  feedId: number,
  generationError: string | null,
  sqlOps: SqlOps,
): Promise<void> {
  if (generationError !== null) {
    await sqlOps.executeSql(
      `
        UPDATE grade_ical_feeds
        SET
          generation_error = ?,
          updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?
      `,
      [generationError, feedId],
    );
    return;
  }

  await sqlOps.executeSql(
    `
      UPDATE grade_ical_feeds
      SET
        last_generated_at = CURRENT_TIMESTAMP(3),
        generation_error = ?,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
    `,
    [generationError, feedId],
  );
}

export async function listPersonalIcalFeedsForBatch(
  limit: number,
  sqlOps: SqlOps,
): Promise<models.ical.PersonalIcalFeed[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  return selectPersonalFeedsBySql(
    `
      SELECT
        id,
        owner_user_id,
        format_type,
        calendar_name,
        title_template,
        description_template,
        options_json,
        public_path,
        is_enabled,
        last_generated_at,
        generation_error,
        created_at,
        updated_at
      FROM user_ical_feeds
      WHERE is_enabled = TRUE
      ORDER BY
        COALESCE(last_generated_at, '1970-01-01 00:00:00') ASC,
        updated_at DESC,
        id DESC
      LIMIT ?
    `,
    [safeLimit],
    sqlOps,
  );
}

export async function listGradeIcalFeedsForBatch(
  limit: number,
  sqlOps: SqlOps,
): Promise<models.ical.GradeIcalFeed[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  return selectGradeFeedsBySql(
    `
      SELECT
        id,
        target_grade,
        format_type,
        calendar_name,
        title_template,
        description_template,
        options_json,
        public_path,
        is_enabled,
        last_generated_at,
        generation_error,
        created_at,
        updated_at
      FROM grade_ical_feeds
      WHERE is_enabled = TRUE
      ORDER BY
        COALESCE(last_generated_at, '1970-01-01 00:00:00') ASC,
        updated_at DESC,
        id DESC
      LIMIT ?
    `,
    [safeLimit],
    sqlOps,
  );
}

export async function getOriginalScheduleDateBounds(
  sqlOps: SqlOps,
): Promise<{ min_date: Date; max_date: Date } | null> {
  const rows = await sqlOps.selectRows<
    Array<{
      min_date: Date | string | null;
      max_date: Date | string | null;
    }>
  >(
    `
      SELECT
        MIN(target_date) AS min_date,
        MAX(target_date) AS max_date
      FROM original_monthly_schedule_days
    `,
    [],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  const minDate = toDate(row.min_date);
  const maxDate = toDate(row.max_date);
  if (!minDate || !maxDate) {
    return null;
  }

  return {
    min_date: minDate,
    max_date: maxDate,
  };
}

export async function resolvePersonalIcalSourceUpdatedAt(
  feed: models.ical.PersonalIcalFeed,
  sqlOps: SqlOps,
): Promise<Date | null> {
  const targetUserId = feed.owner_user_id;

  const rows = await sqlOps.selectRows<
    Array<{ source_updated_at: Date | string | null }>
  >(
    `
      SELECT MAX(ts) AS source_updated_at
      FROM (
        SELECT MAX(updated_at) AS ts
        FROM original_monthly_schedule_days

        UNION ALL

        SELECT MAX(updated_at) AS ts
        FROM personal_weekly_timetables
        WHERE user_id = ?

        UNION ALL

        SELECT MAX(updated_at) AS ts
        FROM personal_session_memos
        WHERE user_id = ?

        UNION ALL

        SELECT MAX(updated_at) AS ts
        FROM personal_daily_memos
        WHERE user_id = ?

        UNION ALL

        SELECT MAX(updated_at) AS ts
        FROM shared_session_memos

        UNION ALL

        SELECT MAX(updated_at) AS ts
        FROM users
        WHERE id = ?

        UNION ALL

        SELECT MAX(owt.updated_at) AS ts
        FROM original_weekly_timetables owt
        JOIN users u
          ON u.id = ?
         AND u.grade IS NOT NULL
         AND u.home_class IS NOT NULL
        WHERE owt.grade = u.grade
          AND owt.home_class = u.home_class
      ) source
    `,
    [targetUserId, targetUserId, targetUserId, targetUserId, targetUserId],
  );

  return toDate(rows[0]?.source_updated_at ?? null);
}

export async function resolveGradeIcalSourceUpdatedAt(
  feed: models.ical.GradeIcalFeed,
  sqlOps: SqlOps,
): Promise<Date | null> {
  const rows = await sqlOps.selectRows<
    Array<{ source_updated_at: Date | string | null }>
  >(
    `
      SELECT MAX(ts) AS source_updated_at
      FROM (
        SELECT MAX(updated_at) AS ts
        FROM original_monthly_schedule_days

        UNION ALL

        SELECT MAX(updated_at) AS ts
        FROM original_weekly_timetables
        WHERE grade = ?
      ) source
    `,
    [feed.target_grade],
  );

  return toDate(rows[0]?.source_updated_at ?? null);
}
