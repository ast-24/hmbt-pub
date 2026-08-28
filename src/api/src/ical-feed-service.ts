import { randomBytes } from "node:crypto";

import { api, database, logic, models } from "@ast24/hmbt-v5-lib";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

import { makeSqlOps } from "./data/sql";
import { withTransaction } from "./db";
import { loadRuntimeEnv } from "./env";
import { APIError } from "./errors";
import {
  deleteIcalObject,
  loadIcalObject,
  uploadIcalObject,
} from "./ical-storage";

let cachedIcalGenerationQueueUrl: string | null = null;
let cachedIcalGenerationQueueClient: SQSClient | null = null;
const ICAL_REGENERATION_EVENT_TYPE = "ical_regeneration";

type IcalGenerationQueueMessage = {
  event_type: typeof ICAL_REGENERATION_EVENT_TYPE;
  kind: logic.ical_feed_regeneration.IcalBatchRegenerationTarget["kind"];
  feed_id: number;
};

function isFifoQueueUrl(queueUrl: string): boolean {
  const normalized = queueUrl.trim().toLowerCase();
  return normalized.endsWith(".fifo") || normalized.includes(".fifo?");
}

function buildIcalQueueFifoFields(
  queueUrl: string,
  target: logic.ical_feed_regeneration.IcalBatchRegenerationTarget,
): {
  MessageGroupId?: string;
  MessageDeduplicationId?: string;
} {
  if (!isFifoQueueUrl(queueUrl)) {
    return {};
  }

  return {
    MessageGroupId: `ical-feed-${target.kind}-${target.feed_id}`,
    MessageDeduplicationId: `${target.kind}-${target.feed_id}-${new Date().toISOString()}-${randomToken(12)}`,
  };
}

function resolveIcalGenerationQueueUrl(): string {
  if (cachedIcalGenerationQueueUrl) {
    return cachedIcalGenerationQueueUrl;
  }

  const env = loadRuntimeEnv({ require_jwt_keys: false });
  const queueUrl = env.ical_gen_queue_url?.trim();
  if (!queueUrl) {
    throw new APIError({
      status: 503,
      code: api.errors.CommonApiErrorCode.ServiceUnavailable,
      message: "ICAL_GEN_QUEUE_URL is not configured",
      user_message: "iCal生成キューが未設定です。管理者へ連絡してください。",
    });
  }

  cachedIcalGenerationQueueUrl = queueUrl;
  return cachedIcalGenerationQueueUrl;
}

function getIcalGenerationQueueClient(): SQSClient {
  if (cachedIcalGenerationQueueClient) {
    return cachedIcalGenerationQueueClient;
  }

  cachedIcalGenerationQueueClient = new SQSClient({
    region: process.env.AWS_REGION ?? "ap-northeast-1",
  });
  return cachedIcalGenerationQueueClient;
}

async function enqueueIcalGenerationTarget(
  target: logic.ical_feed_regeneration.IcalBatchRegenerationTarget,
): Promise<void> {
  const message: IcalGenerationQueueMessage = {
    event_type: ICAL_REGENERATION_EVENT_TYPE,
    kind: target.kind,
    feed_id: target.feed_id,
  };

  try {
    const queueUrl = resolveIcalGenerationQueueUrl();
    await getIcalGenerationQueueClient().send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        ...buildIcalQueueFifoFields(queueUrl, target),
      }),
    );
  } catch (error) {
    throw new APIError({
      status: 503,
      code: api.errors.CommonApiErrorCode.ServiceUnavailable,
      message: `Failed to enqueue iCal generation target: ${asApiErrorMessage(error)}`,
      user_message:
        "iCal生成キューへの登録に失敗しました。時間を置いて再試行してください。",
    });
  }
}

function asApiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

async function enqueueIcalGenerationTargetBestEffort(
  target: logic.ical_feed_regeneration.IcalBatchRegenerationTarget,
  sqlOps: database.SqlOps,
): Promise<boolean> {
  try {
    await enqueueIcalGenerationTarget(target);
    return true;
  } catch (error) {
    const baseMessage = asApiErrorMessage(error);
    const generationError = `Queue enqueue failed: ${baseMessage.slice(0, 400)}`;

    try {
      if (target.kind === "personal") {
        await database.updatePersonalIcalFeedGenerationState(
          target.feed_id,
          generationError,
          sqlOps,
        );
      } else {
        await database.updateGradeIcalFeedGenerationState(
          target.feed_id,
          generationError,
          sqlOps,
        );
      }
    } catch (updateError) {
      console.error(
        "Failed to persist iCal feed generation_error after queue enqueue failure",
        updateError,
      );
    }

    console.error("Failed to enqueue iCal generation target", {
      kind: target.kind,
      feed_id: target.feed_id,
      error,
    });
    return false;
  }
}

function randomToken(length: number): string {
  const neededBytes = Math.ceil((length * 3) / 4);
  let token = "";

  while (token.length < length) {
    token += randomBytes(neededBytes)
      .toString("base64url")
      .replace(/[^a-zA-Z0-9]/g, "");
  }

  return token.slice(0, length);
}

function sanitizeTemplate(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new APIError({
      status: 400,
      code: api.errors.IcalFeedErrorCode.InvalidTemplate,
      message: "Template must be a string",
      user_message: "テンプレートの形式が不正です。",
    });
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new APIError({
      status: 400,
      code: api.errors.IcalFeedErrorCode.InvalidTemplate,
      message: `Template length exceeds ${maxLength}`,
      user_message: `テンプレートは${maxLength}文字以内で入力してください。`,
    });
  }

  return trimmed;
}

function sanitizeIsEnabled(value: unknown, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  throw new APIError({
    status: 400,
    code: api.errors.IcalFeedErrorCode.InvalidTemplate,
    message: "is_enabled must be boolean",
    user_message: "有効/無効の指定が不正です。",
  });
}

function sanitizeTargetGrade(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3) {
    throw new APIError({
      status: 400,
      code: api.errors.IcalFeedErrorCode.InvalidTargetGrade,
      message: "target_grade must be integer in range 1..3",
      user_message: "学年は1から3の整数で指定してください。",
    });
  }

  return parsed;
}

function sanitizePersonalFormatType(
  value: unknown,
): models.ical.PersonalIcalFeedFormatType {
  if (
    value === models.ical.PersonalIcalFeedFormatType.PersonalSessions ||
    value === models.ical.PersonalIcalFeedFormatType.PersonalFullDay
  ) {
    return value as models.ical.PersonalIcalFeedFormatType;
  }

  throw new APIError({
    status: 400,
    code: api.errors.IcalFeedErrorCode.InvalidFormatType,
    message: "Invalid personal format_type",
    user_message: "個人向け配信フォーマットが不正です。",
  });
}

function sanitizeGradeFormatType(
  value: unknown,
): models.ical.GradeIcalFeedFormatType {
  const values = Object.values(models.ical.GradeIcalFeedFormatType);
  if (typeof value === "string" && values.includes(value as never)) {
    return value as models.ical.GradeIcalFeedFormatType;
  }

  throw new APIError({
    status: 400,
    code: api.errors.IcalFeedErrorCode.InvalidFormatType,
    message: "Invalid grade format_type",
    user_message: "学年共通配信フォーマットが不正です。",
  });
}

function sanitizeFeedOptions(
  value: unknown,
  formatType: models.ical.IcalFeedFormatType,
): models.ical.IcalFeedOptions {
  const fallback = models.ical.DEFAULT_ICAL_FEED_OPTIONS;
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new APIError({
      status: 400,
      code: api.errors.IcalFeedErrorCode.InvalidTemplate,
      message: "options must be an object",
      user_message: "iCalオプションの形式が不正です。",
    });
  }

  const scopeCandidate = (value as { schedule_scope?: unknown }).schedule_scope;
  const scheduleScope =
    scopeCandidate === models.ical.IcalFeedScheduleScopeOption.All ||
    scopeCandidate ===
      models.ical.IcalFeedScheduleScopeOption.MismatchSessionsOnly ||
    scopeCandidate ===
      models.ical.IcalFeedScheduleScopeOption.DaysWithMismatchOnly
      ? scopeCandidate
      : fallback.schedule_scope;

  if (
    formatType === models.ical.PersonalIcalFeedFormatType.PersonalFullDay &&
    scheduleScope ===
      models.ical.IcalFeedScheduleScopeOption.MismatchSessionsOnly
  ) {
    throw new APIError({
      status: 400,
      code: api.errors.IcalFeedErrorCode.InvalidTemplate,
      message:
        "Personal full-day format does not support mismatch_sessions_only",
      user_message:
        "1日単位フォーマットでは「不一致コマだけ」は選択できません。",
    });
  }

  if (
    (formatType === models.ical.GradeIcalFeedFormatType.GradeFullDay ||
      formatType === models.ical.GradeIcalFeedFormatType.GradeSchoolDay ||
      formatType === models.ical.GradeIcalFeedFormatType.GradeAfternoonDay ||
      formatType === models.ical.GradeIcalFeedFormatType.GradeEvents) &&
    scheduleScope !== models.ical.IcalFeedScheduleScopeOption.All
  ) {
    throw new APIError({
      status: 400,
      code: api.errors.IcalFeedErrorCode.InvalidTemplate,
      message: "Grade format supports only schedule_scope=all",
      user_message:
        "学年共通フォーマットではiCalオプションは「すべて」のみ指定できます。",
    });
  }

  return {
    schedule_scope: scheduleScope,
  };
}

function normalizePersonalCreateInput(
  ownerUserId: string,
  req: api.endpoints.ApiUsersUserIdIcalPersonalFeedsPostReq,
): database.CreatePersonalIcalFeedInput {
  const formatType = sanitizePersonalFormatType(req.format_type);
  const calendarName = models.ical.resolvePersonalIcalCalendarName(formatType);
  const titleTemplate = sanitizeTemplate(req.title_template, 255);
  const descriptionTemplate = sanitizeTemplate(req.description_template, 4000);
  const options = sanitizeFeedOptions(req.options, formatType);
  const isEnabled = sanitizeIsEnabled(req.is_enabled, true);

  const token = randomToken(32);

  return {
    owner_user_id: ownerUserId,
    format_type: formatType,
    calendar_name: calendarName,
    title_template: titleTemplate,
    description_template: descriptionTemplate,
    options,
    public_path: `personal-feeds/${token}.ics`,
    is_enabled: isEnabled,
  };
}

function normalizeGradeCreateInput(
  ownerGrade: number,
  req: api.endpoints.ApiUsersUserIdIcalGradeFeedsPostReq,
): database.CreateGradeIcalFeedInput {
  const targetGrade = sanitizeTargetGrade(req.target_grade);
  const formatType = sanitizeGradeFormatType(req.format_type);
  if (formatType === models.ical.GradeIcalFeedFormatType.GradeFullDay) {
    throw new APIError({
      status: 400,
      code: api.errors.IcalFeedErrorCode.InvalidFormatType,
      message: "GradeFullDay moved to personal feed formats",
      user_message:
        "「授業全体を1つの予定として登録」は個人向けフォーマットへ移行しました。",
    });
  }
  const calendarName = models.ical.resolveGradeIcalCalendarName(
    targetGrade,
    formatType,
  );
  const options = sanitizeFeedOptions(req.options, formatType);

  if (targetGrade !== ownerGrade) {
    throw new APIError({
      status: 403,
      code: api.errors.IcalFeedErrorCode.FeedForbidden,
      message: "Cannot create grade feed for different grade",
      user_message: "自分の学年以外の学年共通フィードは発行できません。",
    });
  }

  const token = randomToken(32);

  return {
    target_grade: targetGrade,
    format_type: formatType,
    calendar_name: calendarName,
    title_template: null,
    description_template: null,
    options,
    public_path: `grade-feeds/${token}.ics`,
    is_enabled: true,
  };
}

function normalizePersonalUpdateInput(
  req: api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdPutReq,
  formatType: models.ical.PersonalIcalFeedFormatType,
): database.UpdateIcalFeedConfigInput {
  return {
    calendar_name: models.ical.resolvePersonalIcalCalendarName(formatType),
    title_template: sanitizeTemplate(req.title_template, 255),
    description_template: sanitizeTemplate(req.description_template, 4000),
    options: sanitizeFeedOptions(req.options, formatType),
    is_enabled: sanitizeIsEnabled(req.is_enabled, true),
  };
}

function normalizeGradeUpdateInput(
  feed: models.ical.GradeIcalFeed,
  req: api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdPutReq,
): database.UpdateIcalFeedConfigInput {
  return {
    calendar_name: models.ical.resolveGradeIcalCalendarName(
      feed.target_grade,
      feed.format_type,
    ),
    title_template: null,
    description_template: null,
    options: sanitizeFeedOptions(req.options, feed.format_type),
    is_enabled: true,
  };
}

async function resolveUserGrade(
  userId: string,
  sqlOps: database.SqlOps,
): Promise<number> {
  const userInfo = await database.getUserInfo(userId, sqlOps);

  if (!userInfo) {
    throw new APIError({
      status: 404,
      code: api.errors.UserDataErrorCode.UserNotFound,
      message: `User not found: ${userId}`,
      user_message: "ユーザー情報が見つかりません。",
    });
  }

  if (typeof userInfo.grade !== "number") {
    throw new APIError({
      status: 400,
      code: api.errors.UserDataErrorCode.UserProfileIncomplete,
      message: `grade is not set for user: ${userId}`,
      user_message: "学年情報を登録してから学年共通iCalを利用してください。",
    });
  }

  return userInfo.grade;
}

function ensurePersonalFeedOwnership(
  feed: models.ical.PersonalIcalFeed,
  ownerUserId: string,
): void {
  if (feed.owner_user_id === ownerUserId) {
    return;
  }

  throw new APIError({
    status: 403,
    code: api.errors.IcalFeedErrorCode.FeedForbidden,
    message: "You cannot access this personal iCal feed",
    user_message: "この個人iCalフィードにはアクセスできません。",
  });
}

async function ensureGradeFeedOwnership(
  feed: models.ical.GradeIcalFeed,
  ownerUserId: string,
  sqlOps: database.SqlOps,
  requireSubscription = true,
): Promise<void> {
  const userGrade = await resolveUserGrade(ownerUserId, sqlOps);
  if (feed.target_grade !== userGrade) {
    throw new APIError({
      status: 403,
      code: api.errors.IcalFeedErrorCode.FeedForbidden,
      message: "You cannot access this grade iCal feed",
      user_message: "この学年共通iCalフィードにはアクセスできません。",
    });
  }

  if (!requireSubscription) {
    return;
  }

  const isSubscribed = await database.isGradeIcalFeedSubscribedByUser(
    feed.id,
    ownerUserId,
    sqlOps,
  );
  if (isSubscribed) {
    return;
  }

  throw new APIError({
    status: 403,
    code: api.errors.IcalFeedErrorCode.FeedForbidden,
    message: "You are not subscribed to this grade iCal feed",
    user_message: "この学年共通iCalフィードにはアクセスできません。",
  });
}

function resolvePersonalFeedNotFound(): never {
  throw new APIError({
    status: 404,
    code: api.errors.IcalFeedErrorCode.FeedNotFound,
    message: "personal iCal feed not found",
    user_message: "指定された個人iCalフィードが見つかりません。",
  });
}

function resolveGradeFeedNotFound(): never {
  throw new APIError({
    status: 404,
    code: api.errors.IcalFeedErrorCode.FeedNotFound,
    message: "grade iCal feed not found",
    user_message: "指定された学年共通iCalフィードが見つかりません。",
  });
}

async function regeneratePersonalFeedInternal(
  feed: models.ical.PersonalIcalFeed,
  sqlOps: database.SqlOps,
): Promise<models.ical.PersonalIcalFeed> {
  try {
    return await logic.ical_feed_regeneration.regeneratePersonalIcalFeed(feed, {
      sqlOps,
      uploadIcalObject,
      loadIcalObject,
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    throw new APIError({
      status: 500,
      code: api.errors.IcalFeedErrorCode.FeedGenerationFailed,
      message: `Failed to generate personal iCal feed: ${asApiErrorMessage(error)}`,
      user_message:
        "個人iCalの生成に失敗しました。時間をおいて再試行してください。",
    });
  }
}

async function regenerateGradeFeedInternal(
  feed: models.ical.GradeIcalFeed,
  sqlOps: database.SqlOps,
): Promise<models.ical.GradeIcalFeed> {
  try {
    return await logic.ical_feed_regeneration.regenerateGradeIcalFeed(feed, {
      sqlOps,
      uploadIcalObject,
      loadIcalObject,
    });
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    throw new APIError({
      status: 500,
      code: api.errors.IcalFeedErrorCode.FeedGenerationFailed,
      message: `Failed to generate grade iCal feed: ${asApiErrorMessage(error)}`,
      user_message:
        "学年共通iCalの生成に失敗しました。時間をおいて再試行してください。",
    });
  }
}

function isDuplicateEntryError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Duplicate entry");
}

export async function listPersonalIcalFeedsForOwner(
  ownerUserId: string,
): Promise<models.ical.PersonalIcalFeed[]> {
  return database.listPersonalIcalFeedsByOwner(ownerUserId, makeSqlOps());
}

export async function listGradeIcalFeedsForOwner(
  ownerUserId: string,
): Promise<models.ical.GradeIcalFeed[]> {
  const ownerGrade = await resolveUserGrade(ownerUserId, makeSqlOps());
  return database.listGradeIcalFeedsBySubscriber(
    ownerUserId,
    ownerGrade,
    makeSqlOps(),
  );
}

export async function createPersonalIcalFeedForOwner(
  ownerUserId: string,
  req: api.endpoints.ApiUsersUserIdIcalPersonalFeedsPostReq,
): Promise<models.ical.PersonalIcalFeed> {
  const sqlOps = makeSqlOps();
  const createInput = normalizePersonalCreateInput(ownerUserId, req);

  const feed = await withTransaction((tx) =>
    database.createPersonalIcalFeed(createInput, makeSqlOps(tx)),
  );

  if (!feed.is_enabled) {
    return feed;
  }

  const queued = await enqueueIcalGenerationTargetBestEffort(
    {
      kind: "personal",
      feed_id: feed.id,
    },
    sqlOps,
  );

  if (queued) {
    return feed;
  }

  const refreshed = await database.getPersonalIcalFeedById(feed.id, sqlOps);
  if (!refreshed) {
    resolvePersonalFeedNotFound();
  }
  return refreshed;
}

export async function createGradeIcalFeedForOwner(
  ownerUserId: string,
  req: api.endpoints.ApiUsersUserIdIcalGradeFeedsPostReq,
): Promise<models.ical.GradeIcalFeed> {
  const sqlOps = makeSqlOps();
  const ownerGrade = await resolveUserGrade(ownerUserId, sqlOps);
  const createInput = normalizeGradeCreateInput(ownerGrade, req);

  const existing = await database.getGradeIcalFeedByGradeFormat(
    createInput.target_grade,
    createInput.format_type,
    sqlOps,
  );

  let feed: models.ical.GradeIcalFeed;
  let createdNew = false;

  if (existing) {
    feed = existing;
  } else {
    try {
      const created = await withTransaction(async (tx) => {
        const txSqlOps = makeSqlOps(tx);
        const existingInTx = await database.getGradeIcalFeedByGradeFormat(
          createInput.target_grade,
          createInput.format_type,
          txSqlOps,
        );
        if (existingInTx) {
          return {
            feed: existingInTx,
            createdNew: false,
          };
        }

        return {
          feed: await database.createGradeIcalFeed(createInput, txSqlOps),
          createdNew: true,
        };
      });

      feed = created.feed;
      createdNew = created.createdNew;
    } catch (error) {
      if (!isDuplicateEntryError(error)) {
        throw error;
      }

      const duplicateExisting = await database.getGradeIcalFeedByGradeFormat(
        createInput.target_grade,
        createInput.format_type,
        sqlOps,
      );
      if (!duplicateExisting) {
        throw error;
      }

      feed = duplicateExisting;
      createdNew = false;
    }
  }

  await withTransaction((tx) =>
    database.subscribeGradeIcalFeed(feed.id, ownerUserId, makeSqlOps(tx)),
  );

  if (!feed.is_enabled) {
    return feed;
  }

  if (createdNew || !feed.last_generated_at || !!feed.generation_error) {
    const queued = await enqueueIcalGenerationTargetBestEffort(
      {
        kind: "grade",
        feed_id: feed.id,
      },
      sqlOps,
    );

    if (!queued) {
      const refreshed = await database.getGradeIcalFeedById(feed.id, sqlOps);
      if (!refreshed) {
        resolveGradeFeedNotFound();
      }
      return refreshed;
    }
  }

  return feed;
}

export async function updatePersonalIcalFeedForOwner(
  ownerUserId: string,
  feedId: number,
  req: api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdPutReq,
): Promise<models.ical.PersonalIcalFeed> {
  const sqlOps = makeSqlOps();
  const feed = await database.getPersonalIcalFeedById(feedId, sqlOps);
  if (!feed) {
    resolvePersonalFeedNotFound();
  }
  ensurePersonalFeedOwnership(feed, ownerUserId);

  const updateInput = normalizePersonalUpdateInput(req, feed.format_type);

  await withTransaction((tx) =>
    database.updatePersonalIcalFeedConfig(feedId, updateInput, makeSqlOps(tx)),
  );

  const updatedFeed = await database.getPersonalIcalFeedById(feedId, sqlOps);
  if (!updatedFeed) {
    resolvePersonalFeedNotFound();
  }

  if (!updatedFeed.is_enabled) {
    return updatedFeed;
  }

  const queued = await enqueueIcalGenerationTargetBestEffort(
    {
      kind: "personal",
      feed_id: updatedFeed.id,
    },
    sqlOps,
  );

  if (!queued) {
    const refreshed = await database.getPersonalIcalFeedById(feedId, sqlOps);
    if (!refreshed) {
      resolvePersonalFeedNotFound();
    }
    return refreshed;
  }

  return updatedFeed;
}

export async function updateGradeIcalFeedForOwner(
  ownerUserId: string,
  feedId: number,
  req: api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdPutReq,
): Promise<models.ical.GradeIcalFeed> {
  const sqlOps = makeSqlOps();
  const feed = await database.getGradeIcalFeedById(feedId, sqlOps);
  if (!feed) {
    resolveGradeFeedNotFound();
  }
  await ensureGradeFeedOwnership(feed, ownerUserId, sqlOps);

  const updateInput = normalizeGradeUpdateInput(feed, req);

  await withTransaction((tx) =>
    database.updateGradeIcalFeedConfig(feedId, updateInput, makeSqlOps(tx)),
  );

  const updatedFeed = await database.getGradeIcalFeedById(feedId, sqlOps);
  if (!updatedFeed) {
    resolveGradeFeedNotFound();
  }

  if (!updatedFeed.is_enabled) {
    return updatedFeed;
  }

  const queued = await enqueueIcalGenerationTargetBestEffort(
    {
      kind: "grade",
      feed_id: updatedFeed.id,
    },
    sqlOps,
  );

  if (!queued) {
    const refreshed = await database.getGradeIcalFeedById(feedId, sqlOps);
    if (!refreshed) {
      resolveGradeFeedNotFound();
    }
    return refreshed;
  }

  return updatedFeed;
}

export async function regeneratePersonalIcalFeedForOwner(
  ownerUserId: string,
  feedId: number,
): Promise<models.ical.PersonalIcalFeed> {
  const sqlOps = makeSqlOps();
  const feed = await database.getPersonalIcalFeedById(feedId, sqlOps);
  if (!feed) {
    resolvePersonalFeedNotFound();
  }
  ensurePersonalFeedOwnership(feed, ownerUserId);

  if (!feed.is_enabled) {
    throw new APIError({
      status: 400,
      code: api.errors.CommonApiErrorCode.InvalidRequest,
      message: "Disabled personal feed cannot be regenerated",
      user_message:
        "無効化された個人iCalフィードは再生成できません。先に有効化してください。",
    });
  }

  await enqueueIcalGenerationTarget({
    kind: "personal",
    feed_id: feed.id,
  });

  const refreshed = await database.getPersonalIcalFeedById(feedId, sqlOps);
  if (!refreshed) {
    resolvePersonalFeedNotFound();
  }
  return refreshed;
}

export async function regenerateGradeIcalFeedForOwner(
  ownerUserId: string,
  feedId: number,
): Promise<models.ical.GradeIcalFeed> {
  const sqlOps = makeSqlOps();
  const feed = await database.getGradeIcalFeedById(feedId, sqlOps);
  if (!feed) {
    resolveGradeFeedNotFound();
  }
  await ensureGradeFeedOwnership(feed, ownerUserId, sqlOps);

  if (!feed.is_enabled) {
    throw new APIError({
      status: 400,
      code: api.errors.CommonApiErrorCode.InvalidRequest,
      message: "Disabled grade feed cannot be regenerated",
      user_message:
        "無効化された学年共通iCalフィードは再生成できません。先に有効化してください。",
    });
  }

  await enqueueIcalGenerationTarget({
    kind: "grade",
    feed_id: feed.id,
  });

  const refreshed = await database.getGradeIcalFeedById(feedId, sqlOps);
  if (!refreshed) {
    resolveGradeFeedNotFound();
  }
  return refreshed;
}

export async function deletePersonalIcalFeedForOwner(
  ownerUserId: string,
  feedId: number,
): Promise<void> {
  const sqlOps = makeSqlOps();
  const feed = await database.getPersonalIcalFeedById(feedId, sqlOps);
  if (!feed) {
    resolvePersonalFeedNotFound();
  }
  ensurePersonalFeedOwnership(feed, ownerUserId);

  await withTransaction((tx) =>
    database.deletePersonalIcalFeed(feedId, makeSqlOps(tx)),
  );

  try {
    await deleteIcalObject(feed.public_path);
  } catch {
    // ストレージ削除失敗は管理レコード削除後の後処理として扱う。
  }
}

export async function deleteGradeIcalFeedForOwner(
  ownerUserId: string,
  feedId: number,
): Promise<void> {
  const sqlOps = makeSqlOps();
  const feed = await database.getGradeIcalFeedById(feedId, sqlOps);
  if (!feed) {
    resolveGradeFeedNotFound();
  }
  await ensureGradeFeedOwnership(feed, ownerUserId, sqlOps, false);

  await withTransaction((tx) =>
    database.unsubscribeGradeIcalFeed(feedId, ownerUserId, makeSqlOps(tx)),
  );
}

export async function runIcalBatchRegeneration(limit = 100): Promise<{
  processed: number;
  regenerated: number;
  skipped: number;
  failed: number;
}> {
  return logic.ical_feed_regeneration.runIcalBatchRegeneration(limit, {
    sqlOps: makeSqlOps(),
    uploadIcalObject,
    loadIcalObject,
    logError: (message, context) => {
      console.error(message, context);
    },
  });
}
