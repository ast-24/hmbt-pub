import type {
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
} from "aws-lambda";
import { knowledge, models } from "@ast24/hmbt-v5-lib";

const DEFAULT_ADMIN_MESSENGER_URL = `https://${knowledge.HOSTNAMES.ADMIN_MESSENGER}`;
const MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE = "monthly_schedule_update";
const ICAL_REGENERATION_EVENT_TYPE = "ical_regeneration";

type QueueEventType =
  | typeof MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE
  | typeof ICAL_REGENERATION_EVENT_TYPE
  | "unknown";

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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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

function parseEventType(rawBody: string): QueueEventType {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return "unknown";
  }

  if (typeof parsed !== "object" || parsed === null) {
    return "unknown";
  }

  const eventType = (parsed as { event_type?: unknown }).event_type;
  if (eventType === MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE) {
    return MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE;
  }
  if (eventType === ICAL_REGENERATION_EVENT_TYPE) {
    return ICAL_REGENERATION_EVENT_TYPE;
  }
  return "unknown";
}

function summarizeBody(body: string): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 800) {
    return normalized;
  }
  return `${normalized.slice(0, 800)}...(truncated)`;
}

async function sendDlqAlert(params: {
  summary: string;
  message: string;
  level?: models.admin_messenger.AdminMessengerLevel;
  context?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const response = await fetch(resolveAdminMessengerUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "batch",
        service: "dlq-alert-batch",
        level: params.level ?? "fatal",
        summary: params.summary,
        message: params.message,
        timestamp_iso: new Date().toISOString(),
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
      return false;
    }

    return true;
  } catch (error) {
    if (isPhysicalNetworkError(error)) {
      console.error(
        "Failed to send admin-messenger report due to network error",
        toErrorMessage(error),
      );
      return false;
    }

    console.error(
      "Failed to send admin-messenger report",
      toErrorMessage(error),
    );
    return false;
  }
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    const eventType = parseEventType(record.body);

    const ok = await sendDlqAlert({
      summary: "Queue message moved to DLQ",
      message:
        "A queue consumer failed repeatedly and the message was moved to a dead-letter queue.",
      level: "fatal",
      context: {
        event_type: eventType,
        message_id: record.messageId,
        dlq_queue_arn: record.eventSourceARN ?? null,
        approximate_receive_count:
          record.attributes?.ApproximateReceiveCount ?? null,
        sent_timestamp: record.attributes?.SentTimestamp ?? null,
        first_receive_timestamp:
          record.attributes?.ApproximateFirstReceiveTimestamp ?? null,
        body_excerpt: summarizeBody(record.body),
      },
    });

    if (!ok) {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return {
    batchItemFailures,
  };
}
