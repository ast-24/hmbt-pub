import type { Context, ScheduledEvent } from "aws-lambda";
import { knowledge, logic, models } from "@ast24/hmbt-v5-lib";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

import { getSqlOps, requireEnv, resolveBatchLimit } from "./runtime";

const DEFAULT_ADMIN_MESSENGER_URL = `https://${knowledge.HOSTNAMES.ADMIN_MESSENGER}`;
const ICAL_REGENERATION_EVENT_TYPE = "ical_regeneration";

type IcalGenerationQueueMessage = {
  event_type: typeof ICAL_REGENERATION_EVENT_TYPE;
  kind: logic.ical_feed_regeneration.IcalBatchRegenerationTarget["kind"];
  feed_id: number;
};

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
        service: "ical-find-old-batch",
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

let cachedSqsClient: SQSClient | null = null;
let cachedQueueUrl: string | null = null;

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
    MessageDeduplicationId: `${target.kind}-${target.feed_id}-${new Date().toISOString()}`,
  };
}

function resolveQueueUrl(): string {
  if (cachedQueueUrl) {
    return cachedQueueUrl;
  }
  cachedQueueUrl = requireEnv("ICAL_BATCH_QUEUE_URL");
  return cachedQueueUrl;
}

function getSqsClient(): SQSClient {
  if (cachedSqsClient) {
    return cachedSqsClient;
  }

  cachedSqsClient = new SQSClient({
    region: process.env.AWS_REGION ?? "ap-northeast-1",
  });
  return cachedSqsClient;
}

async function enqueueTarget(
  target: logic.ical_feed_regeneration.IcalBatchRegenerationTarget,
): Promise<void> {
  const queueUrl = resolveQueueUrl();
  const client = getSqsClient();
  const message: IcalGenerationQueueMessage = {
    event_type: ICAL_REGENERATION_EVENT_TYPE,
    kind: target.kind,
    feed_id: target.feed_id,
  };

  await client.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      ...buildIcalQueueFifoFields(queueUrl, target),
    }),
  );
}

export async function handler(
  _event: ScheduledEvent,
  _context: Context,
): Promise<{
  ok: boolean;
  processed: number;
  scheduled: number;
  enqueued: number;
  skipped: number;
  failed: number;
}> {
  let listed: logic.ical_feed_regeneration.IcalBatchRegenerationListResult | null =
    null;

  try {
    listed =
      await logic.ical_feed_regeneration.listIcalBatchRegenerationTargets(
        resolveBatchLimit(),
        getSqlOps(),
      );
  } catch (error) {
    console.error("Failed to list iCal regeneration targets", error);
    await reportBatchError({
      summary: "Failed to list iCal regeneration targets",
      message: toErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      level: "fatal",
    });
    throw error;
  }

  let enqueued = 0;
  let failed = 0;

  for (const target of listed.targets) {
    try {
      await enqueueTarget(target);
      enqueued += 1;
    } catch (error) {
      failed += 1;
      console.error("Failed to enqueue iCal regeneration target", {
        kind: target.kind,
        feed_id: target.feed_id,
        error,
      });
      void reportBatchError({
        summary: "Failed to enqueue iCal regeneration target",
        message: toErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
        level: "error",
        context: {
          kind: target.kind,
          feed_id: target.feed_id,
        },
      });
    }
  }

  return {
    ok: failed === 0,
    processed: listed.processed,
    scheduled: listed.targets.length,
    enqueued,
    skipped: listed.skipped,
    failed,
  };
}
