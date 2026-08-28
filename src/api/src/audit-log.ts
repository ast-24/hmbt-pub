import { randomUUID } from "node:crypto";

import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type { Context } from "hono";

import type { AuthContext } from "./auth/types";
import { loadRuntimeEnv } from "./env";

type CloudWatchAuditConfig = {
  logGroupName: string;
  region: string;
};

let cachedConfig: CloudWatchAuditConfig | null = null;
let cachedClient: CloudWatchLogsClient | null = null;
let hasLoggedAuditConfigMissing = false;
let hasLoggedAuditConfigReady = false;
const ensuredGroups = new Set<string>();
const ensuredStreams = new Set<string>();
const groupEnsureInFlight = new Map<string, Promise<void>>();
const streamEnsureInFlight = new Map<string, Promise<void>>();

function hasAwsErrorName(error: unknown, name: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === name
  );
}

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      metadata:
        typeof error === "object" && error !== null && "$metadata" in error
          ? (error as { $metadata?: unknown }).$metadata
          : undefined,
    };
  }

  return {
    value: error,
  };
}

function toJstDate(date: Date): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function format2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatAuditTimestamp(date: Date): string {
  const jst = toJstDate(date);
  const year = String(jst.getUTCFullYear());
  const month = format2(jst.getUTCMonth() + 1);
  const day = format2(jst.getUTCDate());
  const hour = format2(jst.getUTCHours());
  const minute = format2(jst.getUTCMinutes());
  const second = format2(jst.getUTCSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function buildDailyStreamName(date: Date): string {
  const jst = toJstDate(date);
  const year = String(jst.getUTCFullYear());
  const month = format2(jst.getUTCMonth() + 1);
  const day = format2(jst.getUTCDate());
  return `${year}${month}${day}`;
}

function resolveConfig(): CloudWatchAuditConfig | null {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const env = loadRuntimeEnv({ require_jwt_keys: false });
    const logGroupName = env.audit_cloudwatch_log_group?.trim();
    if (!logGroupName) {
      if (!hasLoggedAuditConfigMissing) {
        console.warn(
          "Audit log is disabled because audit_cloudwatch_log_group is not configured",
          {
            audit_cloudwatch_region: env.audit_cloudwatch_region ?? null,
          },
        );
        hasLoggedAuditConfigMissing = true;
      }
      return null;
    }

    cachedConfig = {
      logGroupName,
      region: env.audit_cloudwatch_region?.trim() || "ap-northeast-1",
    };

    if (!hasLoggedAuditConfigReady) {
      console.info("Audit log config resolved", {
        log_group: cachedConfig.logGroupName,
        region: cachedConfig.region,
      });
      hasLoggedAuditConfigReady = true;
    }

    return cachedConfig;
  } catch (error) {
    console.error("Failed to resolve audit log config", {
      error: describeError(error),
    });
    return null;
  }
}

function resolveClient(config: CloudWatchAuditConfig): CloudWatchLogsClient {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new CloudWatchLogsClient({
    region: config.region,
  });

  return cachedClient;
}

async function ensureLogStream(
  client: CloudWatchLogsClient,
  logGroupName: string,
  logStreamName: string,
): Promise<void> {
  const groupInFlight = groupEnsureInFlight.get(logGroupName);
  if (groupInFlight) {
    await groupInFlight;
  } else if (!ensuredGroups.has(logGroupName)) {
    const ensureGroupPromise = (async () => {
      try {
        await client.send(
          new CreateLogGroupCommand({
            logGroupName,
          }),
        );
      } catch (error) {
        if (!hasAwsErrorName(error, "ResourceAlreadyExistsException")) {
          throw error;
        }
      }

      ensuredGroups.add(logGroupName);
    })().finally(() => {
      groupEnsureInFlight.delete(logGroupName);
    });

    groupEnsureInFlight.set(logGroupName, ensureGroupPromise);
    await ensureGroupPromise;
  }

  const streamKey = `${logGroupName}:${logStreamName}`;
  if (ensuredStreams.has(streamKey)) {
    return;
  }

  const inFlight = streamEnsureInFlight.get(streamKey);
  if (inFlight) {
    await inFlight;
    return;
  }

  const ensureStreamPromise = (async () => {
    try {
      await client.send(
        new CreateLogStreamCommand({
          logGroupName,
          logStreamName,
        }),
      );
    } catch (error) {
      if (!hasAwsErrorName(error, "ResourceAlreadyExistsException")) {
        throw error;
      }
    }

    ensuredStreams.add(streamKey);
  })().finally(() => {
    streamEnsureInFlight.delete(streamKey);
  });

  streamEnsureInFlight.set(streamKey, ensureStreamPromise);
  await ensureStreamPromise;
}

function resolveRequestId(c: Context): string {
  const fromRequestId = c.req.header("x-request-id");
  if (fromRequestId && fromRequestId.trim().length > 0) {
    return fromRequestId.trim();
  }

  const fromTrace = c.req.header("x-amzn-trace-id");
  if (fromTrace && fromTrace.trim().length > 0) {
    return fromTrace.trim();
  }

  return randomUUID();
}

function resolveEndpointSignature(c: Context): string {
  const routePath = (
    c.req as {
      routePath?: unknown;
    }
  ).routePath;

  const path =
    typeof routePath === "string" && routePath.length > 0
      ? routePath
      : c.req.path;

  return `${c.req.method} ${path}`;
}

function resolveOperator(
  operator: AuthContext | string | null | undefined,
): string {
  if (typeof operator === "string") {
    const trimmed = operator.trim();
    return trimmed.length > 0 ? trimmed : "anonymous";
  }

  if (operator && typeof operator === "object") {
    const role = operator.role === "system" ? "system" : "user";
    const userId = operator.user_id?.trim();
    if (userId && userId.length > 0) {
      return `${role}:${userId}`;
    }
    return role;
  }

  return "anonymous";
}

export async function writeAuditLog(
  c: Context,
  action: string,
  detail: Record<string, unknown>,
  operator?: AuthContext | string | null,
): Promise<void> {
  const config = resolveConfig();
  if (!config) {
    return;
  }

  const now = new Date();
  const logStreamName = buildDailyStreamName(now);
  const client = resolveClient(config);
  const streamKey = `${config.logGroupName}:${logStreamName}`;
  const putParams = {
    logGroupName: config.logGroupName,
    logStreamName,
    logEvents: [
      {
        timestamp: now.getTime(),
        message: JSON.stringify({
          ymd_hms: formatAuditTimestamp(now),
          request_id: resolveRequestId(c),
          endpoint_signature: resolveEndpointSignature(c),
          operator: resolveOperator(operator),
          action,
          detail,
        }),
      },
    ],
  };

  try {
    await ensureLogStream(client, config.logGroupName, logStreamName);
    await client.send(new PutLogEventsCommand(putParams));
  } catch (error) {
    if (hasAwsErrorName(error, "ResourceNotFoundException")) {
      try {
        ensuredStreams.delete(streamKey);
        await ensureLogStream(client, config.logGroupName, logStreamName);
        await client.send(new PutLogEventsCommand(putParams));
        return;
      } catch (retryError) {
        console.error("Failed to write audit log after stream retry", {
          error: describeError(retryError),
          action,
          log_group: config.logGroupName,
          log_stream: logStreamName,
        });
        return;
      }
    }

    console.error("Failed to write audit log", {
      error: describeError(error),
      action,
      log_group: config.logGroupName,
      log_stream: logStreamName,
    });
    return;
  }
}
