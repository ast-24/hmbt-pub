import { models } from "@ast24/hmbt-v5-lib";

type Env = {
  DISCORD_WEBHOOK_URL?: string;
};

type JsonObject = Record<string, unknown>;

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ADMIN_SOURCES: readonly models.admin_messenger.AdminMessengerSource[] = [
  "web",
  "api",
  "line-bot",
  "batch",
  "worker",
  "other",
];

const ADMIN_LEVELS: readonly models.admin_messenger.AdminMessengerLevel[] = [
  "error",
  "fatal",
];

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAdminSource(
  value: unknown,
): value is models.admin_messenger.AdminMessengerSource {
  return (
    typeof value === "string" &&
    ADMIN_SOURCES.includes(value as models.admin_messenger.AdminMessengerSource)
  );
}

function isAdminLevel(
  value: unknown,
): value is models.admin_messenger.AdminMessengerLevel {
  return (
    typeof value === "string" &&
    ADMIN_LEVELS.includes(value as models.admin_messenger.AdminMessengerLevel)
  );
}

function parseRequestContext(
  value: unknown,
): models.admin_messenger.AdminMessengerRequestContext | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const context: models.admin_messenger.AdminMessengerRequestContext = {
    method: trimToUndefined(value.method),
    path: trimToUndefined(value.path),
    route: trimToUndefined(value.route),
    trace_id: trimToUndefined(value.trace_id),
    request_id: trimToUndefined(value.request_id),
    user_id: trimToUndefined(value.user_id),
  };

  if (
    !context.method &&
    !context.path &&
    !context.route &&
    !context.trace_id &&
    !context.request_id &&
    !context.user_id
  ) {
    return undefined;
  }

  return context;
}

function parseErrorReport(
  value: unknown,
): models.admin_messenger.AdminMessengerErrorReport | null {
  if (!isObject(value)) {
    return null;
  }

  if (!isAdminSource(value.source) || !isAdminLevel(value.level)) {
    return null;
  }

  const service = trimToUndefined(value.service);
  const summary = trimToUndefined(value.summary);
  const message = trimToUndefined(value.message);
  const timestampIso = trimToUndefined(value.timestamp_iso);

  if (!service || !summary || !message || !timestampIso) {
    return null;
  }

  const status =
    typeof value.status === "number" && Number.isFinite(value.status)
      ? value.status
      : undefined;
  const code = trimToUndefined(value.code);
  const stack = trimToUndefined(value.stack);
  const environment = trimToUndefined(value.environment);
  const request = parseRequestContext(value.request);

  const context = isObject(value.context)
    ? (value.context as Record<string, unknown>)
    : undefined;

  return {
    source: value.source,
    service,
    level: value.level,
    summary,
    message,
    timestamp_iso: timestampIso,
    status,
    code,
    stack,
    environment,
    request,
    context,
  };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatContext(context: Record<string, unknown>): string {
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return "(context serialization failed)";
  }
}

function buildDiscordPayload(
  report: models.admin_messenger.AdminMessengerErrorReport,
): JsonObject {
  const levelLabel = report.level.toUpperCase();

  const descriptionParts = [report.message];
  if (report.stack) {
    descriptionParts.push(`stack:\n${report.stack}`);
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "source",
      value: truncate(report.source, 1024),
      inline: true,
    },
    {
      name: "service",
      value: truncate(report.service, 1024),
      inline: true,
    },
    {
      name: "time",
      value: truncate(report.timestamp_iso, 1024),
      inline: true,
    },
  ];

  if (report.status !== undefined) {
    fields.push({
      name: "status",
      value: String(report.status),
      inline: true,
    });
  }

  if (report.code) {
    fields.push({
      name: "code",
      value: truncate(report.code, 1024),
      inline: true,
    });
  }

  if (report.environment) {
    fields.push({
      name: "environment",
      value: truncate(report.environment, 1024),
      inline: true,
    });
  }

  if (report.request) {
    const requestSummary = [
      report.request.method,
      report.request.path,
      report.request.route,
      report.request.user_id,
      report.request.request_id,
      report.request.trace_id,
    ]
      .filter(
        (part): part is string => typeof part === "string" && part.length > 0,
      )
      .join(" | ");

    if (requestSummary.length > 0) {
      fields.push({
        name: "request",
        value: truncate(requestSummary, 1024),
      });
    }
  }

  if (report.context && Object.keys(report.context).length > 0) {
    fields.push({
      name: "context",
      value: truncate(formatContext(report.context), 1024),
    });
  }

  const normalizedTimestamp = Number.isNaN(Date.parse(report.timestamp_iso))
    ? new Date().toISOString()
    : report.timestamp_iso;

  return {
    username: "hmbt v5 admin-alert",
    embeds: [
      {
        title: truncate(`[${levelLabel}] ${report.summary}`, 256),
        description: truncate(descriptionParts.join("\n\n"), 4000),
        color: report.level === "fatal" ? 0xff0033 : 0xff9f1a,
        timestamp: normalizedTimestamp,
        fields,
      },
    ],
  };
}

function withCorsHeaders(headers: HeadersInit = {}): Headers {
  const merged = new Headers(CORS_HEADERS);
  const extra = new Headers(headers);
  extra.forEach((value, key) => {
    merged.set(key, value);
  });
  return merged;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorsHeaders({
      "Content-Type": "application/json; charset=utf-8",
    }),
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: withCorsHeaders(),
  });
}

function resolveDiscordWebhookUrl(env: Env): string | null {
  const value = trimToUndefined(env.DISCORD_WEBHOOK_URL);
  return value ?? null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return emptyResponse(204);
    }

    if (request.method === "GET") {
      return jsonResponse(200, {
        ok: true,
        service: "admin-alert",
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(405, {
        ok: false,
        message: "Method Not Allowed",
      });
    }

    const webhookUrl = resolveDiscordWebhookUrl(env);
    if (!webhookUrl) {
      return jsonResponse(503, {
        ok: false,
        message: "DISCORD_WEBHOOK_URL is not configured",
      });
    }

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return jsonResponse(400, {
        ok: false,
        message: "Invalid JSON body",
      });
    }

    const report = parseErrorReport(parsed);
    if (!report) {
      return jsonResponse(400, {
        ok: false,
        message: "Invalid admin-messenger payload",
      });
    }

    const payload = buildDiscordPayload(report);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error("Failed to post Discord webhook", {
          status: response.status,
          body: responseText,
        });
        return jsonResponse(502, {
          ok: false,
          message: "Discord webhook request failed",
        });
      }

      return jsonResponse(202, { ok: true });
    } catch (error) {
      console.error("Failed to post Discord webhook", error);
      return jsonResponse(502, {
        ok: false,
        message: "Discord webhook request failed",
      });
    }
  },
};
