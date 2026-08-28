import { api, models } from "@ast24/hmbt-v5-lib";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

import { loadRuntimeEnv } from "./env";
import { APIError } from "./errors";
import { serializeForJson } from "./serde";

const MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE = "monthly_schedule_update";

type MonthlyScheduleUpdateQueueMessage = {
  event_type: typeof MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE;
  year: number;
  month: number;
  skd: unknown;
  requested_at_iso: string;
};

let cachedQueueUrl: string | null = null;
let cachedSqsClient: SQSClient | null = null;

function isFifoQueueUrl(queueUrl: string): boolean {
  const normalized = queueUrl.trim().toLowerCase();
  return normalized.endsWith(".fifo") || normalized.includes(".fifo?");
}

function buildFifoFields(
  queueUrl: string,
  message: MonthlyScheduleUpdateQueueMessage,
): {
  MessageGroupId?: string;
  MessageDeduplicationId?: string;
} {
  if (!isFifoQueueUrl(queueUrl)) {
    return {};
  }

  return {
    MessageGroupId: `monthly-schedule-${message.year}-${message.month}`,
    MessageDeduplicationId: `${message.year}-${message.month}-${message.requested_at_iso}`,
  };
}

function resolveQueueUrl(): string {
  if (cachedQueueUrl) {
    return cachedQueueUrl;
  }

  const env = loadRuntimeEnv({ require_jwt_keys: false });
  const queueUrl = env.monthly_schedule_update_queue_url?.trim();
  if (!queueUrl) {
    throw new APIError({
      status: 503,
      code: api.errors.CommonApiErrorCode.ServiceUnavailable,
      message: "MONTHLY_SCHEDULE_UPDATE_QUEUE_URL is not configured",
      user_message:
        "月間予定更新キューが未設定です。管理者へ連絡してください。",
    });
  }

  cachedQueueUrl = queueUrl;
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

export async function enqueueMonthlyScheduleUpdate(
  year: number,
  month: number,
  skd: Array<models.schedule.OriginalMonSkdDay | null>,
): Promise<void> {
  const message: MonthlyScheduleUpdateQueueMessage = {
    event_type: MONTHLY_SCHEDULE_UPDATE_EVENT_TYPE,
    year,
    month,
    skd: serializeForJson(skd),
    requested_at_iso: new Date().toISOString(),
  };

  try {
    const queueUrl = resolveQueueUrl();
    await getSqsClient().send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        ...buildFifoFields(queueUrl, message),
      }),
    );
  } catch (error) {
    console.error("Failed to enqueue monthly schedule update", {
      year,
      month,
      error,
    });
    throw new APIError({
      status: 503,
      code: api.errors.CommonApiErrorCode.ServiceUnavailable,
      message:
        error instanceof Error
          ? error.message
          : "Failed to enqueue monthly schedule update",
      user_message:
        "月間予定更新キューへの登録に失敗しました。時間を置いて再試行してください。",
    });
  }
}
