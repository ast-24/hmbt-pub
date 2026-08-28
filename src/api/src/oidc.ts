import { api, cmn, knowledge } from "@ast24/hmbt-v5-lib";

import { loadRuntimeEnv } from "./env";
import { APIError } from "./errors";

type ProviderConfig = {
  provider: knowledge.auth.OIDCProvider;
  auth_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scopes: string[];
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildCallbackUrl(provider: knowledge.auth.OIDCProvider): string {
  const endpoint =
    provider === "google"
      ? api.endpoints.API_ENDPOINTS[
          api.endpoints.APIEndpoint.AuthUserOidcGoogleCallbackGet
        ]
      : api.endpoints.API_ENDPOINTS[
          api.endpoints.APIEndpoint.AuthUserOidcLineCallbackGet
        ];

  return api.endpoints.buildURL(endpoint, {});
}

export type GoogleOidcProfile = {
  sub: string;
  email: cmn.Option<string>;
  email_verified_as_owner: boolean;
  org: cmn.Option<string>;
};

export type LineOidcProfile = {
  sub: string;
};

function getProviderConfig(
  provider: knowledge.auth.OIDCProvider,
): ProviderConfig {
  const env = loadRuntimeEnv();

  switch (provider) {
    case "google": {
      if (!env.google_oidc_client_id || !env.google_oidc_client_secret) {
        throw new APIError({
          status: 503,
          code: api.errors.AuthOidcErrorCode.GoogleNotConfigured,
          message: "Google OIDC is not configured",
          user_message: "Google OIDCの設定が未完了です。",
        });
      }

      return {
        provider: "google",
        auth_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint: "https://oauth2.googleapis.com/token",
        userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
        client_id: env.google_oidc_client_id,
        client_secret: env.google_oidc_client_secret,
        redirect_uri: buildCallbackUrl("google"),
        scopes: ["openid", "profile", "email"],
      };
    }
    case "line": {
      if (!env.line_oidc_client_id || !env.line_oidc_client_secret) {
        throw new APIError({
          status: 503,
          code: api.errors.AuthOidcErrorCode.LineNotConfigured,
          message: "LINE OIDC is not configured",
          user_message: "LINE OIDCの設定が未完了です。",
        });
      }

      return {
        provider: "line",
        auth_endpoint: "https://access.line.me/oauth2/v2.1/authorize",
        token_endpoint: "https://api.line.me/oauth2/v2.1/token",
        userinfo_endpoint: "https://api.line.me/oauth2/v2.1/userinfo",
        client_id: env.line_oidc_client_id,
        client_secret: env.line_oidc_client_secret,
        redirect_uri: buildCallbackUrl("line"),
        scopes: ["openid", "profile", "email"],
      };
    }
    default:
      throw new APIError({
        status: 500,
        code: api.errors.AuthOidcErrorCode.UnsupportedProvider,
        message: "Unsupported OIDC provider",
        user_message: "未対応のOIDCプロバイダが指定されました。",
      });
  }
}

export function buildOidcAuthorizationUrl(
  provider: knowledge.auth.OIDCProvider,
  state: string,
  nonce: string,
): string {
  const config = getProviderConfig(provider);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.client_id,
    redirect_uri: config.redirect_uri,
    scope: config.scopes.join(" "),
    state,
    nonce,
  });

  return `${config.auth_endpoint}?${params.toString()}`;
}

async function exchangeCode(
  config: ProviderConfig,
  code: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirect_uri,
    client_id: config.client_id,
    client_secret: config.client_secret,
  });

  const response = await fetch(config.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new APIError({
      status: 401,
      code: api.errors.AuthOidcErrorCode.TokenExchangeFailed,
      message: `${config.provider} token exchange failed`,
      user_message: `${config.provider.toUpperCase()} 認証に失敗しました。再度お試しください。`,
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  const accessToken =
    isPlainRecord(json) && typeof json.access_token === "string"
      ? json.access_token
      : null;

  if (!accessToken) {
    throw new APIError({
      status: 401,
      code: api.errors.AuthOidcErrorCode.TokenExchangeResponseInvalid,
      message: `${config.provider} token exchange response invalid`,
      user_message:
        "認証プロバイダから不正なレスポンスが返されました。再試行してください。",
    });
  }

  return accessToken;
}

async function fetchUserInfo(
  config: ProviderConfig,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(config.userinfo_endpoint, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new APIError({
      status: 401,
      code: api.errors.AuthOidcErrorCode.UserInfoFetchFailed,
      message: `${config.provider} userinfo fetch failed`,
      user_message:
        "認証プロバイダからユーザ情報を取得できませんでした。再試行してください。",
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!isPlainRecord(json)) {
    throw new APIError({
      status: 401,
      code: api.errors.AuthOidcErrorCode.UserInfoFetchFailed,
      message: `${config.provider} userinfo response invalid`,
      user_message:
        "認証プロバイダから不正なユーザ情報が返されました。再試行してください。",
    });
  }

  return json;
}

export async function fetchGoogleOidcProfile(
  code: string,
): Promise<GoogleOidcProfile> {
  const config = getProviderConfig("google");
  const accessToken = await exchangeCode(config, code);
  const userInfo = await fetchUserInfo(config, accessToken);

  const sub = userInfo.sub;
  if (typeof sub !== "string") {
    throw new APIError({
      status: 401,
      code: api.errors.AuthOidcErrorCode.UserInfoMissingSub,
      message: "Google userinfo does not contain sub",
      user_message: "Google認証情報の取得に失敗しました。",
    });
  }

  const emailRaw = userInfo.email;
  const email =
    typeof emailRaw === "string"
      ? cmn.Some<string>(emailRaw)
      : cmn.None<string>();

  const emailVerified = userInfo.email_verified === true;

  const orgRaw = userInfo.hd;
  const org =
    typeof orgRaw === "string" ? cmn.Some<string>(orgRaw) : cmn.None<string>();

  return {
    sub,
    email,
    email_verified_as_owner: emailVerified,
    org,
  };
}

export async function fetchLineOidcProfile(
  code: string,
): Promise<LineOidcProfile> {
  const config = getProviderConfig("line");
  const accessToken = await exchangeCode(config, code);
  const userInfo = await fetchUserInfo(config, accessToken);

  const sub = userInfo.sub;
  if (typeof sub !== "string") {
    throw new APIError({
      status: 401,
      code: api.errors.AuthOidcErrorCode.UserInfoMissingSub,
      message: "LINE userinfo does not contain sub",
      user_message: "LINE認証情報の取得に失敗しました。",
    });
  }

  return {
    sub,
  };
}
