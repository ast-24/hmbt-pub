import type {
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
} from "aws-lambda";
import { knowledge, logic, models } from "@ast24/hmbt-v5-lib";

import { getSqlOps, loadIcalObject, uploadIcalObject } from "./runtime";

const DEFAULT_ADMIN_MESSENGER_URL = `https://${knowledge.HOSTNAMES.ADMIN_MESSENGER}`;
const ICAL_REGENERATION_EVENT_TYPE = "ical_regeneration";

type ParsedIcalGenerationMessage = {
  event_type: typeof ICAL_REGENERATION_EVENT_TYPE;
  target: logic.ical_feed_regeneration.IcalBatchRegenerationTarget;
};

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function withHttpsScheme(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

function resolveAdminMessengerUrl(): string {
  const configured = trimToUndefined(process.env.ADMIN_MESSENGER_URL);
  if (!configured) {
    return DEFAULT_ADMIN_MESSENGER_URL;
  }
  return withHttpsScheme(configured);
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

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  const body = JSON.stringify({
    source: "batch",
    service: "ical-gen-batch",
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
  } satisfies models.admin_messenger.AdminMessengerErrorReport);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(resolveAdminMessengerUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });

      if (response.ok) {
        return;
      }

      console.error("Failed to post admin-messenger report", {
        attempt,
        status: response.status,
        body: await response.text(),
      });
      return;
    } catch (error) {
      if (isPhysicalNetworkError(error) && attempt < maxAttempts) {
        console.warn("Retrying admin-messenger report after network error", {
          attempt,
          error: toErrorMessage(error),
        });
        await waitMs(120 * attempt);
        continue;
      }

      if (isPhysicalNetworkError(error)) {
        console.error(
          "Failed to send admin-messenger report due to network error",
          {
            attempts: maxAttempts,
            error: toErrorMessage(error),
          },
        );
        return;
      }

      console.error(
        "Failed to send admin-messenger report",
        toErrorMessage(error),
      );
      return;
    }
  }
}

function parseTargetMessage(
  rawBody: string,
): ParsedIcalGenerationMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const maybeEventType = (parsed as { event_type?: unknown }).event_type;
  const maybeKind = (parsed as { kind?: unknown }).kind;
  const maybeFeedId = (parsed as { feed_id?: unknown }).feed_id;

  if (
    maybeEventType !== undefined &&
    maybeEventType !== ICAL_REGENERATION_EVENT_TYPE
  ) {
    return null;
  }

  if (maybeKind !== "personal" && maybeKind !== "grade") {
    return null;
  }

  const feedId =
    typeof maybeFeedId === "number"
      ? maybeFeedId
      : typeof maybeFeedId === "string" && /^\d+$/.test(maybeFeedId.trim())
        ? Number.parseInt(maybeFeedId.trim(), 10)
        : null;

  if (feedId === null || !Number.isInteger(feedId)) {
    return null;
  }
  if (feedId <= 0) {
    return null;
  }

  return {
    event_type: ICAL_REGENERATION_EVENT_TYPE,
    target: {
      kind: maybeKind,
      feed_id: feedId,
    },
  };
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const sqlOps = getSqlOps();
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    const parsedMessage = parseTargetMessage(record.body);
    if (!parsedMessage) {
      console.error("Invalid iCal generation queue message", {
        message_id: record.messageId,
        body: record.body,
      });
      void reportBatchError({
        summary: "Invalid iCal generation queue message",
        message: "Failed to parse SQS message for iCal generation",
        level: "error",
        context: {
          message_id: record.messageId,
          body: record.body,
        },
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
      continue;
    }

    const target = parsedMessage.target;

    try {
      await logic.ical_feed_regeneration.regenerateIcalBatchTarget(target, {
        sqlOps,
        uploadIcalObject,
        loadIcalObject,
      });
    } catch (error) {
      console.error("Failed to execute iCal generation target", {
        message_id: record.messageId,
        kind: target.kind,
        feed_id: target.feed_id,
        error,
      });
      void reportBatchError({
        summary: "Failed to execute iCal generation target",
        message: toErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
        level: "fatal",
        context: {
          event_type: parsedMessage.event_type,
          message_id: record.messageId,
          kind: target.kind,
          feed_id: target.feed_id,
        },
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return {
    batchItemFailures,
  };
}
