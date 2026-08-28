import { knowledge, models } from "@ast24/hmbt-v5-lib";

const DEFAULT_ADMIN_MESSENGER_URL = `https://${knowledge.HOSTNAMES.ADMIN_MESSENGER}`;

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveAdminMessengerUrl(): string {
  const configured = trimToUndefined(
    process.env.NEXT_PUBLIC_ADMIN_MESSENGER_URL,
  );
  return configured ?? DEFAULT_ADMIN_MESSENGER_URL;
}

function normalizeErrorToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function isLoadFailedLikeText(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = normalizeErrorToken(value);
  return (
    normalized.includes("loadfailed") || normalized.includes("failedtoload")
  );
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isPhysicalNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const normalized = normalizeErrorToken(error.message);
  return (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("failed to fetch") ||
    normalized.includes("loadfailed") ||
    normalized.includes("failedtoload")
  );
}

type WebReportParams = {
  summary: string;
  message: string;
  status?: number;
  code?: string;
  stack?: string;
  level?: models.admin_messenger.AdminMessengerLevel;
  context?: Record<string, unknown>;
};

export async function reportWebErrorToAdminMessenger(
  params: WebReportParams,
): Promise<void> {
  if (
    isLoadFailedLikeText(params.message) ||
    isLoadFailedLikeText(params.code) ||
    isLoadFailedLikeText(params.summary)
  ) {
    return;
  }

  if (
    typeof params.status === "number" &&
    Number.isFinite(params.status) &&
    params.status < 500
  ) {
    return;
  }

  try {
    const response = await fetch(resolveAdminMessengerUrl(), {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "web",
        service: "web",
        level: params.level ?? "error",
        summary: params.summary,
        message: params.message,
        timestamp_iso: new Date().toISOString(),
        status: params.status,
        code: params.code,
        stack: params.stack,
        environment: trimToUndefined(process.env.NODE_ENV),
        context: params.context,
      } satisfies models.admin_messenger.AdminMessengerErrorReport),
      keepalive: true,
    });

    if (!response.ok) {
      console.error("Failed to post admin-messenger report", {
        status: response.status,
      });
    }
  } catch (error) {
    if (isPhysicalNetworkError(error)) {
      return;
    }
    console.error("Failed to send admin-messenger report", error);
  }
}
