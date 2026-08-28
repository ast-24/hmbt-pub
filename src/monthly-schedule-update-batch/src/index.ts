import { database, knowledge, type models } from "@ast24/hmbt-v5-lib";
import type {
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
} from "aws-lambda";

import { getSqlOps } from "./runtime";

const DEFAULT_ADMIN_MESSENGER_URL = `https://${knowledge.HOSTNAMES.ADMIN_MESSENGER}`;
const MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE = "monthly_schedule_update";

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveAdminMessengerUrl(): string {
  return (
    trimToUndefined(process.env.ADMIN_MESSENGER_URL) ??
    DEFAULT_ADMIN_MESSENGER_URL
  );
}

function isPhysicalNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("connection")
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function reportBatchError(params: {
  summary: string;
  message: string;
  status?: number;
  code?: string;
  stack?: string;
  level?: models.admin_messenger.AdminMessengerLevel;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const response = await fetch(resolveAdminMessengerUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "batch",
        service: "monthly-schedule-update-batch",
        level: params.level ?? "error",
        summary: params.summary,
        message: params.message,
        timestamp_iso: new Date().toISOString(),
        status: params.status,
        code: params.code,
        stack: params.stack,
        environment: trimToUndefined(process.env.NODE_ENV),
        context: {
          ...(params.context ?? {}),
          error_message: params.message,
        },
      } satisfies models.admin_messenger.AdminMessengerErrorReport),
    });

    if (!response.ok) {
      console.error("Failed to post admin-messenger report", {
        status: response.status,
        body: await response.text(),
      });
    }
  } catch (error) {
    if (isPhysicalNetworkError(error)) {
      console.error(
        "Failed to send admin-messenger report due to network error",
        toErrorMessage(error),
      );
      return;
    }
    console.error(
      "Failed to send admin-messenger report",
      toErrorMessage(error),
    );
  }
}

type MonthlyScheduleUpdateMessage = {
  event_type: typeof MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE;
  year: number;
  month: number;
  skd: unknown;
  requested_at_iso: string;
};

function parseMessageBody(
  rawBody: string,
): MonthlyScheduleUpdateMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const body = parsed as {
    event_type?: unknown;
    year?: unknown;
    month?: unknown;
    skd?: unknown;
    requested_at_iso?: unknown;
  };

  if (
    body.event_type !== undefined &&
    body.event_type !== MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE
  ) {
    return null;
  }

  const year =
    typeof body.year === "number"
      ? body.year
      : typeof body.year === "string"
        ? Number.parseInt(body.year, 10)
        : Number.NaN;
  const month =
    typeof body.month === "number"
      ? body.month
      : typeof body.month === "string"
        ? Number.parseInt(body.month, 10)
        : Number.NaN;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return null;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  if (!Array.isArray(body.skd)) {
    return null;
  }

  if (typeof body.requested_at_iso !== "string") {
    return null;
  }

  const requestedAtIso = body.requested_at_iso.trim();
  if (requestedAtIso.length === 0) {
    return null;
  }
  if (Number.isNaN(Date.parse(requestedAtIso))) {
    return null;
  }

  return {
    event_type: MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE,
    year,
    month,
    skd: body.skd,
    requested_at_iso: requestedAtIso,
  };
}

function toMonthStartDateKey(year: number, month: number): string {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function resolveNextMonth(
  year: number,
  month: number,
): {
  year: number;
  month: number;
} {
  if (month >= 12) {
    return {
      year: year + 1,
      month: 1,
    };
  }

  return {
    year,
    month: month + 1,
  };
}

async function isStaleMonthlyScheduleUpdate(
  message: MonthlyScheduleUpdateMessage,
): Promise<boolean> {
  const requestedAtUnix = Date.parse(message.requested_at_iso) / 1000;
  if (!Number.isFinite(requestedAtUnix)) {
    return false;
  }

  const monthStart = toMonthStartDateKey(message.year, message.month);
  const nextMonth = resolveNextMonth(message.year, message.month);
  const nextMonthStart = toMonthStartDateKey(nextMonth.year, nextMonth.month);

  const rows = await getSqlOps().selectRows<
    Array<{
      latest_updated_at_unix: number | string | null;
    }>
  >(
    `
      SELECT UNIX_TIMESTAMP(MAX(updated_at)) AS latest_updated_at_unix
      FROM original_monthly_schedule_days
      WHERE target_date >= ?
        AND target_date < ?
    `,
    [monthStart, nextMonthStart],
  );

  const latestRaw = rows[0]?.latest_updated_at_unix;
  if (latestRaw === null || latestRaw === undefined) {
    return false;
  }

  const latestUpdatedAtUnix =
    typeof latestRaw === "number"
      ? latestRaw
      : Number.parseFloat(String(latestRaw));

  if (!Number.isFinite(latestUpdatedAtUnix)) {
    return false;
  }

  return latestUpdatedAtUnix > requestedAtUnix;
}

async function applyMonthlyScheduleUpdate(
  message: MonthlyScheduleUpdateMessage,
): Promise<void> {
  const decoded = database.decodeOriginalMonthlyScheduleInput(message.skd) as
    | Array<models.schedule.OriginalMonSkdDay | null>
    | never;

  await database.putOriginalMonthlySchedule(
    message.year,
    message.month,
    decoded,
    getSqlOps(),
  );
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    const message = parseMessageBody(record.body);
    if (!message) {
      console.error("Invalid monthly schedule update queue message", {
        message_id: record.messageId,
        body: record.body,
      });
      void reportBatchError({
        summary: "Invalid monthly schedule update queue message",
        message: "Failed to parse SQS message for monthly schedule update",
        level: "error",
        context: {
          message_id: record.messageId,
          body: record.body,
        },
      });
      failures.push({ itemIdentifier: record.messageId });
      continue;
    }

    try {
      if (await isStaleMonthlyScheduleUpdate(message)) {
        console.warn("Skipped stale monthly schedule update message", {
          message_id: record.messageId,
          year: message.year,
          month: message.month,
          requested_at_iso: message.requested_at_iso,
        });
        continue;
      }

      await applyMonthlyScheduleUpdate(message);
    } catch (error) {
      console.error("Failed to apply monthly schedule update", {
        message_id: record.messageId,
        year: message.year,
        month: message.month,
        error,
      });
      void reportBatchError({
        summary: "Failed to apply monthly schedule update",
        message: toErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
        level: "fatal",
        context: {
          event_type: message.event_type,
          message_id: record.messageId,
          year: message.year,
          month: message.month,
        },
      });
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return {
    batchItemFailures: failures,
  };
}
