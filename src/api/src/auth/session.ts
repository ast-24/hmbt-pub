import { api, database, dto, knowledge, logic } from "@ast24/hmbt-v5-lib";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { makeSqlOps } from "../data/sql";
import { getPool } from "../db";
import type { RowDataPacket } from "../db";
import { APIError } from "../errors";
import {
  cookieSecure,
  extractIpAddress,
  extractUserAgent,
  generateSessionId,
  generateSessionSecret,
  jwtAlgorithm,
  jwtPrivateKey,
  jwtPublicKey,
} from "./common";
import type { AuthContext } from "./types";

type SessionRow = RowDataPacket & {
  session_id: string;
  user_id: string;
  secret: string;
  created_at: Date;
  refreshed_at: Date;
  expires_at: Date;
  ip_address: string | null;
  user_agent: string | null;
};

type SessionContext = {
  user_id: string;
  session_id: string;
};

function clearAccessTokenCookie(c: Context): void {
  deleteCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.ACCESS_TOKEN, {
    path: "/",
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "None",
  });
}

function hasSessionCookies(c: Context): boolean {
  const sessionId = getCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.SESSION);
  const sessionSecret = getCookie(
    c,
    knowledge.auth.AUTH_COOKIE_NAMES.SESSION_SECRET,
  );
  return !!sessionId && !!sessionSecret;
}

function extractAuthorizationBearerToken(c: Context): string | null {
  const headerValues = [
    c.req.header("x-authorization"),
    c.req.header("authorization"),
  ];

  for (const authorization of headerValues) {
    if (!authorization) {
      continue;
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      continue;
    }

    const token = match[1]?.trim();
    if (token && token.length > 0) {
      return token;
    }
  }

  return null;
}

function extractAccessToken(
  c: Context,
): { token: string; source: "header" | "cookie" } | null {
  const bearerToken = extractAuthorizationBearerToken(c);
  if (bearerToken) {
    return {
      token: bearerToken,
      source: "header",
    };
  }

  const cookieToken = getCookie(
    c,
    knowledge.auth.AUTH_COOKIE_NAMES.ACCESS_TOKEN,
  );
  if (!cookieToken) {
    return null;
  }

  return {
    token: cookieToken,
    source: "cookie",
  };
}

async function signAccessToken(
  claims: dto.jwt.AccessTokenClaims,
): Promise<string> {
  return logic.jwt.signAccessToken(claims, await jwtPrivateKey(), {
    issuer: knowledge.auth.AUTH_JWT.issuer,
    audience: knowledge.auth.AUTH_JWT.audience,
    tokenType: knowledge.auth.AUTH_JWT.access_token_type,
    expiresInSec: knowledge.auth.AUTH_TTL_SEC.access_token,
    algorithm: jwtAlgorithm(),
  });
}

async function verifyAccessToken(
  token: string,
): Promise<dto.jwt.AccessTokenClaims | null> {
  return logic.jwt.verifyAccessToken(token, await jwtPublicKey(), {
    issuer: knowledge.auth.AUTH_JWT.issuer,
    audience: knowledge.auth.AUTH_JWT.audience,
    tokenType: knowledge.auth.AUTH_JWT.access_token_type,
    algorithm: jwtAlgorithm(),
  });
}

async function loadValidSession(
  sessionId: string,
  sessionSecret: string,
): Promise<SessionRow | null> {
  const [rows] = await getPool().query<SessionRow[]>(
    `
      SELECT
        session_id,
        user_id,
        secret,
        created_at,
        refreshed_at,
        expires_at,
        ip_address,
        user_agent
      FROM users_sessions
      WHERE session_id = ?
        AND secret = ?
        AND expires_at > CURRENT_TIMESTAMP(3)
      LIMIT 1
    `,
    [sessionId, sessionSecret],
  );

  return rows[0] ?? null;
}

async function resolveSessionContext(
  c: Context,
): Promise<SessionContext | null> {
  const sessionId = getCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.SESSION);
  const sessionSecret = getCookie(
    c,
    knowledge.auth.AUTH_COOKIE_NAMES.SESSION_SECRET,
  );
  if (!sessionId || !sessionSecret) {
    return null;
  }

  const session = await loadValidSession(sessionId, sessionSecret);
  if (!session) {
    clearAuthCookies(c);
    return null;
  }

  return {
    user_id: session.user_id,
    session_id: session.session_id,
  };
}

export async function establishSession(
  c: Context,
  userId: string,
): Promise<AuthContext> {
  const sessionId = generateSessionId();
  const sessionSecret = generateSessionSecret();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + knowledge.auth.AUTH_TTL_SEC.session * 1000,
  );

  await getPool().execute(
    `
      INSERT INTO users_sessions
        (session_id, user_id, secret, created_at, refreshed_at, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), ?, ?, ?)
    `,
    [
      sessionId,
      userId,
      sessionSecret,
      expiresAt,
      extractIpAddress(c),
      extractUserAgent(c),
    ],
  );

  const persistedSession = await loadValidSession(sessionId, sessionSecret);
  if (!persistedSession) {
    throw new APIError({
      status: 500,
      code: api.errors.CommonApiErrorCode.InternalServerError,
      message: "Failed to persist session",
      user_message:
        "ログインセッションの保存に失敗しました。時間を置いて再試行してください。",
    });
  }

  const accessToken = await signAccessToken({
    typ: "access",
    role: "user",
    sub: persistedSession.user_id,
    sid: persistedSession.session_id,
  });

  setCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.SESSION, sessionId, {
    path: "/",
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "None",
    maxAge: knowledge.auth.AUTH_TTL_SEC.session,
  });

  setCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.SESSION_SECRET, sessionSecret, {
    path: "/",
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "None",
    maxAge: knowledge.auth.AUTH_TTL_SEC.session,
  });

  setCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.ACCESS_TOKEN, accessToken, {
    path: "/",
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "None",
    maxAge: knowledge.auth.AUTH_TTL_SEC.access_token,
  });

  return {
    role: "user",
    user_id: userId,
    session_id: sessionId,
    has_access_token: true,
  };
}

export async function refreshAccessToken(
  c: Context,
): Promise<AuthContext | null> {
  const session = await resolveSessionContext(c);
  if (!session) {
    return null;
  }

  const accessToken = await signAccessToken({
    typ: "access",
    role: "user",
    sub: session.user_id,
    sid: session.session_id,
  });

  await database.touchSession(session.session_id, (sql, params) =>
    getPool().execute(sql, params),
  );

  setCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.ACCESS_TOKEN, accessToken, {
    path: "/",
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "None",
    maxAge: knowledge.auth.AUTH_TTL_SEC.access_token,
  });

  return {
    role: "user",
    user_id: session.user_id,
    session_id: session.session_id,
    has_access_token: true,
  };
}

export async function logout(c: Context): Promise<void> {
  const sessionId = getCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.SESSION);
  if (sessionId) {
    await getPool().execute(`DELETE FROM users_sessions WHERE session_id = ?`, [
      sessionId,
    ]);
  }

  clearAuthCookies(c);
}

export function clearAuthCookies(c: Context): void {
  deleteCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.SESSION, {
    path: "/",
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "None",
  });
  deleteCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.SESSION_SECRET, {
    path: "/",
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "None",
  });
  clearAccessTokenCookie(c);
}

export async function resolveAuthContext(
  c: Context,
  requireAccessToken: boolean,
): Promise<AuthContext | null> {
  const token = extractAccessToken(c);
  if (!token) {
    if (requireAccessToken && hasSessionCookies(c)) {
      return null;
    }
    return null;
  }

  const claims = await verifyAccessToken(token.token);
  if (!claims) {
    if (token.source === "cookie") {
      clearAccessTokenCookie(c);
    }
    return null;
  }

  if (claims.role === "system") {
    return {
      role: "system",
      user_id: claims.name,
      session_id: null,
      has_access_token: true,
    };
  }

  return {
    role: "user",
    user_id: claims.sub,
    session_id: claims.sid,
    has_access_token: true,
  };
}

export async function requireAuthContext(
  c: Context,
  requireAccessToken = false,
): Promise<AuthContext> {
  const auth = await resolveAuthContext(c, true);
  if (!auth) {
    if (hasSessionCookies(c) || requireAccessToken) {
      throw new APIError({
        status: 401,
        code: api.errors.CommonApiErrorCode.NoAccessToken,
        message: "No access token",
        user_message:
          "認証情報の有効期限が切れています。再ログインしてください。",
      });
    }

    throw new APIError({
      status: 401,
      code: api.errors.CommonApiErrorCode.Unauthorized,
      message: "Unauthorized",
      user_message: "ログインが必要です。",
    });
  }
  return auth;
}

export async function requireVerifiedStudentAuthContext(
  c: Context,
  requireAccessToken = false,
): Promise<AuthContext> {
  const auth = await requireAuthContext(c, requireAccessToken);
  if (auth.role === "system") {
    return auth;
  }

  const isVerified = await database.isUserVerifiedAsStudent(
    auth.user_id,
    makeSqlOps(),
  );
  if (isVerified) {
    return auth;
  }

  throw new APIError({
    status: 403,
    code: api.errors.CommonApiErrorCode.NotVerifiedStudent,
    message: "User is not verified as student",
    user_message:
      "生徒認証が必要です。認証情報設定ページで学校向け認証情報を連携してください。",
  });
}

export function resolveTargetUserId(
  auth: AuthContext,
  rawUserId: string,
): string {
  if (auth.role === "system") {
    if (rawUserId === "me") {
      throw new APIError({
        status: 400,
        code: api.errors.CommonApiErrorCode.InvalidRequest,
        message: "system role cannot resolve userId 'me'",
        user_message:
          "systemロールでは userId=me は使用できません。明示的なuserIdを指定してください。",
      });
    }

    return rawUserId;
  }

  if (rawUserId === "me") {
    return auth.user_id;
  }

  if (rawUserId !== auth.user_id) {
    throw new APIError({
      status: 403,
      code: api.errors.CommonApiErrorCode.Forbidden,
      message: "Forbidden",
      user_message: "他のユーザの情報にはアクセスできません。",
    });
  }

  return rawUserId;
}
