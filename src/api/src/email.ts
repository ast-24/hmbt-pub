import { api, knowledge } from "@ast24/hmbt-v5-lib";

import { loadRuntimeEnv } from "./env";
import { APIError } from "./errors";

export function generateEmailVerificationToken(): string {
  const digits = knowledge.auth.AUTH_ID_FORMATS.email_verification_token_length;
  let token = "";
  for (let i = 0; i < digits; i += 1) {
    token += Math.floor(Math.random() * 10).toString();
  }
  return token;
}

type ZohoOAuthTokenResponse = {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
};

let cachedZohoAccessToken: { token: string; expiresAtEpochMs: number } | null =
  null;

export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<void> {
  const env = loadRuntimeEnv();

  if (!env.email_from) {
    throw new APIError({
      status: 503,
      code: api.errors.AuthEmailErrorCode.EmailFromNotConfigured,
      message: "EMAIL_FROM is not configured",
      user_message: "送信元メールアドレス設定が未完了です。",
    });
  }

  if (
    !env.zoho_oauth_client_id ||
    !env.zoho_oauth_client_secret ||
    !env.zoho_oauth_refresh_token ||
    !env.zoho_account_id
  ) {
    throw new APIError({
      status: 503,
      code: api.errors.AuthEmailErrorCode.MailConfigIncomplete,
      message:
        "Zoho mail configuration is incomplete. Set ZOHO_OAUTH_CLIENT_ID, ZOHO_OAUTH_CLIENT_SECRET, ZOHO_OAUTH_REFRESH_TOKEN, and ZOHO_ACCOUNT_ID.",
      user_message:
        "メール送信設定が未完了のため、認証メールを送信できません。",
    });
  }

  const accessToken = await fetchZohoAccessToken();

  const subject = "hmbt-v5 verification token";
  const content = [
    "Your verification token is:",
    token,
    "",
    "This token expires in 10 minutes.",
    "If you did not request this email, please ignore it.",
  ].join("\n");

  const response = await fetch(
    `${trimTrailingSlash(env.zoho_mail_base_url)}/api/accounts/${encodeURIComponent(env.zoho_account_id)}/messages`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Zoho-oauthtoken ${accessToken}`,
      },
      body: JSON.stringify({
        fromAddress: env.email_from,
        toAddress: email,
        subject,
        content,
        mailFormat: "plaintext",
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new APIError({
      status: 503,
      code: api.errors.AuthEmailErrorCode.SendFailed,
      message: `Failed to send verification email via Zoho (${response.status}): ${body}`,
      user_message:
        "認証メールの送信に失敗しました。時間を置いて再試行してください。",
    });
  }
}

async function fetchZohoAccessToken(): Promise<string> {
  const cached = cachedZohoAccessToken;
  const now = Date.now();
  if (cached && now < cached.expiresAtEpochMs - 30_000) {
    return cached.token;
  }

  const env = loadRuntimeEnv();
  if (
    !env.zoho_oauth_client_id ||
    !env.zoho_oauth_client_secret ||
    !env.zoho_oauth_refresh_token
  ) {
    throw new APIError({
      status: 503,
      code: api.errors.AuthEmailErrorCode.OAuthCredentialsMissing,
      message: "Zoho OAuth credentials are missing",
      user_message: "メール送信用の認証情報設定が不足しています。",
    });
  }

  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.zoho_oauth_client_id,
    client_secret: env.zoho_oauth_client_secret,
    refresh_token: env.zoho_oauth_refresh_token,
  });

  const response = await fetch(
    `${trimTrailingSlash(env.zoho_accounts_base_url)}/oauth/v2/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );

  const text = await response.text();
  let payload: ZohoOAuthTokenResponse | null = null;
  try {
    payload = JSON.parse(text) as ZohoOAuthTokenResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.access_token) {
    const detail = payload?.error_description ?? payload?.error ?? text;
    throw new APIError({
      status: 503,
      code: api.errors.AuthEmailErrorCode.OAuthTokenRefreshFailed,
      message: `Zoho OAuth token refresh failed (${response.status}): ${detail}`,
      user_message:
        "メール送信用トークンの更新に失敗しました。時間を置いて再試行してください。",
    });
  }

  const expiresInSecRaw = payload.expires_in;
  const expiresInSec =
    typeof expiresInSecRaw === "number"
      ? expiresInSecRaw
      : typeof expiresInSecRaw === "string"
        ? Number.parseInt(expiresInSecRaw, 10)
        : 3600;

  cachedZohoAccessToken = {
    token: payload.access_token,
    expiresAtEpochMs:
      now + (Number.isFinite(expiresInSec) ? expiresInSec : 3600) * 1000,
  };

  return payload.access_token;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
