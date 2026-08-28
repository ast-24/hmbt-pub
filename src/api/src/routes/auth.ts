import { api, database, knowledge } from "@ast24/hmbt-v5-lib";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";

import {
  consumeOidcState,
  establishSession,
  hashPassword,
  issueOidcState,
  logout,
  refreshAccessToken,
  requireAuthContext,
  resolveAuthContext,
  verifyPassword,
} from "../auth";
import { makeSqlOps } from "../data/sql";
import type { PoolConnection } from "../db";
import { withTransaction } from "../db";
import {
  generateEmailVerificationToken,
  sendVerificationEmail,
} from "../email";
import { APIError } from "../errors";
import { okJson } from "../http";
import {
  buildOidcAuthorizationUrl,
  fetchGoogleOidcProfile,
  fetchLineOidcProfile,
} from "../oidc";
import { writeAuditLog } from "../audit-log";
import type { EndpointRegistrar } from "../server/endpoint-registrar";
import {
  normalizeEmail,
  parseBooleanQuery,
  readJsonBody,
  validateEmail,
  validatePassword,
} from "./utils";

const LEGACY_LOGIN_FAILURE_LIMIT_PER_HOUR = 5;
const EMAIL_VERIFICATION_REQUEST_LIMIT_PER_HOUR = 5;
const PASSWORD_REQUIREMENT_MESSAGE =
  knowledge.auth.PASSWORD_REQUIREMENT_MESSAGE;

function sqlOps(connection?: PoolConnection): database.SqlOps {
  return makeSqlOps(connection);
}

function hasSessionCookiePair(c: Context): boolean {
  const sessionId = getCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.SESSION);
  const sessionSecret = getCookie(
    c,
    knowledge.auth.AUTH_COOKIE_NAMES.SESSION_SECRET,
  );
  return !!sessionId && !!sessionSecret;
}

function resolveClientIpAddress(c: Context): string | null {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export function registerAuthRoutes(register: EndpointRegistrar): void {
  register(api.endpoints.APIEndpoint.AuthUserLegacyStartPost, async (c) => {
    const req =
      await readJsonBody<api.endpoints.ApiAuthUserLegacyStartPostReq>(c);
    const isLinking = parseBooleanQuery(c.req.query("is_linking"));

    const email = normalizeEmail(
      typeof req.email === "string" ? req.email : "",
    );
    const password = typeof req.password === "string" ? req.password : "";

    if (!email || !password) {
      throw new APIError({
        status: 400,
        code: api.errors.AuthUserLegacyStartErrorCode.MissingEmailOrPassword,
        message: "email and password are required",
        user_message: "メールアドレスとパスワードを入力してください。",
        field_errors: {
          email: "メールアドレスを入力してください。",
          password: "パスワードを入力してください。",
        },
      });
    }

    if (!validateEmail(email)) {
      throw new APIError({
        status: 400,
        code: api.errors.AuthUserLegacyStartErrorCode.InvalidEmailFormat,
        message: "Invalid email format",
        user_message: "メールアドレスの形式が正しくありません。",
        field_errors: {
          email: "メールアドレスの形式が正しくありません。",
        },
      });
    }
    if (!validatePassword(password)) {
      throw new APIError({
        status: 400,
        code: api.errors.AuthUserLegacyStartErrorCode.InvalidPasswordFormat,
        message:
          "Password must be at least 8 characters long and contain letters and numbers",
        user_message: `パスワードは${PASSWORD_REQUIREMENT_MESSAGE}`,
        field_errors: {
          password: `パスワードは${PASSWORD_REQUIREMENT_MESSAGE}`,
        },
      });
    }

    const ipAddress = resolveClientIpAddress(c);

    let linkingAuthUserId: string | null = null;
    if (isLinking) {
      const auth = await requireAuthContext(c, false);
      linkingAuthUserId = auth.user_id;
    }

    const existing = await database.getUserByLegacyEmail(email, sqlOps());
    if (existing) {
      const recentFailures = await database.countRecentLegacyLoginFailures(
        email,
        sqlOps(),
      );
      if (recentFailures >= LEGACY_LOGIN_FAILURE_LIMIT_PER_HOUR) {
        throw new APIError({
          status: 429,
          code: api.errors.AuthUserLegacyStartErrorCode.TooManyLoginFailures,
          message:
            "Too many failed login attempts. Please try again in about 1 hour.",
          user_message:
            "ログイン試行回数が上限に達しました。1時間ほど待ってから再試行してください。",
        });
      }

      const ok = await verifyPassword(existing.password_hash, password);
      if (!ok) {
        await database.recordLegacyLoginFailure(email, ipAddress, sqlOps());

        const failuresAfter = await database.countRecentLegacyLoginFailures(
          email,
          sqlOps(),
        );
        if (failuresAfter >= LEGACY_LOGIN_FAILURE_LIMIT_PER_HOUR) {
          throw new APIError({
            status: 429,
            code: api.errors.AuthUserLegacyStartErrorCode.TooManyLoginFailures,
            message:
              "Too many failed login attempts. Please try again in about 1 hour.",
            user_message:
              "ログイン試行回数が上限に達しました。1時間ほど待ってから再試行してください。",
          });
        }

        throw new APIError({
          status: 401,
          code: api.errors.AuthUserLegacyStartErrorCode.InvalidCredentials,
          message: "Invalid credentials",
          user_message: "メールアドレスまたはパスワードが正しくありません。",
          field_errors: {
            email: "メールアドレスまたはパスワードが正しくありません。",
            password: "メールアドレスまたはパスワードが正しくありません。",
          },
        });
      }

      await database.clearLegacyLoginFailures(email, sqlOps());

      if (
        isLinking &&
        linkingAuthUserId &&
        existing.user.id !== linkingAuthUserId
      ) {
        throw new APIError({
          status: 409,
          code: api.errors.AuthUserLegacyStartErrorCode.CredentialAlreadyLinked,
          message: "This credential is already linked to another user",
          user_message: "この認証情報は他のユーザに紐づいています。",
          field_errors: {
            email: "このメールアドレスは既に別アカウントに連携されています。",
          },
        });
      }

      const targetUserId =
        isLinking && linkingAuthUserId ? linkingAuthUserId : existing.user.id;
      await establishSession(c, targetUserId);

      if (!isLinking) {
        await writeAuditLog(
          c,
          "login",
          {
            login_method: "legacy",
            user_id: targetUserId,
            email,
            ip_address: ipAddress,
          },
          `user:${targetUserId}`,
        );
      }

      return okJson(c, {
        requires_registration: false,
      } satisfies api.endpoints.ApiAuthUserLegacyStartPostRes);
    }

    const recentByEmail =
      await database.countRecentEmailVerificationRequestsByEmail(
        email,
        sqlOps(),
      );
    if (recentByEmail >= EMAIL_VERIFICATION_REQUEST_LIMIT_PER_HOUR) {
      throw new APIError({
        status: 429,
        code: api.errors.AuthUserLegacyStartErrorCode
          .TooManyVerificationRequestsByEmail,
        message:
          "Too many verification token requests for this email. Please try again in about 1 hour.",
        user_message:
          "このメールアドレスへのトークン送信回数が上限に達しました。1時間ほど待ってください。",
      });
    }

    if (ipAddress) {
      const recentByIp =
        await database.countRecentEmailVerificationRequestsByIp(
          ipAddress,
          sqlOps(),
        );
      if (recentByIp >= EMAIL_VERIFICATION_REQUEST_LIMIT_PER_HOUR) {
        throw new APIError({
          status: 429,
          code: api.errors.AuthUserLegacyStartErrorCode
            .TooManyVerificationRequestsByIp,
          message:
            "Too many verification token requests from this IP. Please try again in about 1 hour.",
          user_message:
            "トークン送信回数が上限に達しました。1時間ほど待ってください。",
        });
      }
    }

    const token = generateEmailVerificationToken();
    const expiresAt = new Date(
      Date.now() + knowledge.auth.AUTH_TTL_SEC.email_verification_token * 1000,
    );

    await withTransaction(async (tx: PoolConnection) => {
      await database.recordEmailVerificationRequest(
        email,
        ipAddress,
        sqlOps(tx),
      );
      await database.createEmailVerificationToken(
        email,
        token,
        isLinking,
        ipAddress,
        expiresAt,
        sqlOps(tx),
      );
    });

    await sendVerificationEmail(email, token);

    return okJson(c, {
      requires_registration: true,
    } satisfies api.endpoints.ApiAuthUserLegacyStartPostRes);
  });

  register(api.endpoints.APIEndpoint.AuthUserLegacyRegisterPost, async (c) => {
    const req =
      await readJsonBody<api.endpoints.ApiAuthUserLegacyRegisterPostReq>(c);
    const ipAddress = resolveClientIpAddress(c);
    const email = normalizeEmail(
      typeof req.email === "string" ? req.email : "",
    );
    const password = typeof req.password === "string" ? req.password : "";
    const otp = typeof req.otp === "string" ? req.otp : "";

    if (!email || !password || !otp) {
      throw new APIError({
        status: 400,
        code: api.errors.AuthUserLegacyRegisterErrorCode.MissingRequiredFields,
        message: "email, password, and otp are required",
        user_message:
          "メールアドレス、パスワード、ワンタイムトークンを入力してください。",
        field_errors: {
          email: "メールアドレスを入力してください。",
          password: "パスワードを入力してください。",
          otp: "ワンタイムトークンを入力してください。",
        },
      });
    }

    if (!validateEmail(email)) {
      throw new APIError({
        status: 400,
        code: api.errors.AuthUserLegacyRegisterErrorCode.InvalidEmailFormat,
        message: "Invalid email format",
        user_message: "メールアドレスの形式が正しくありません。",
        field_errors: {
          email: "メールアドレスの形式が正しくありません。",
        },
      });
    }

    if (!validatePassword(password)) {
      throw new APIError({
        status: 400,
        code: api.errors.AuthUserLegacyRegisterErrorCode.InvalidPasswordFormat,
        message:
          "Password must be at least 8 characters long and contain letters and numbers",
        user_message: `パスワードは${PASSWORD_REQUIREMENT_MESSAGE}`,
        field_errors: {
          password: `パスワードは${PASSWORD_REQUIREMENT_MESSAGE}`,
        },
      });
    }

    if (
      otp.length !==
        knowledge.auth.AUTH_ID_FORMATS.email_verification_token_length ||
      !/^\d+$/.test(otp)
    ) {
      throw new APIError({
        status: 400,
        code: api.errors.AuthUserLegacyRegisterErrorCode
          .InvalidVerificationTokenFormat,
        message: "Invalid verification token format",
        user_message: "ワンタイムトークンの形式が正しくありません。",
        field_errors: {
          otp: "ワンタイムトークンの形式が正しくありません。",
        },
      });
    }

    const consumed = await withTransaction((tx: PoolConnection) =>
      database.consumeEmailVerificationToken(otp, email, sqlOps(tx)),
    );
    if (!consumed) {
      throw new APIError({
        status: 401,
        code: api.errors.AuthUserLegacyRegisterErrorCode
          .InvalidOrExpiredVerificationToken,
        message: "Invalid or expired verification token",
        user_message:
          "ワンタイムトークンが無効か、期限切れです。再発行してください。",
        field_errors: {
          otp: "ワンタイムトークンが無効か、期限切れです。",
        },
      });
    }

    const passwordHash = await hashPassword(password);

    let targetUserId: string;
    let createdAccount = false;

    if (consumed.is_linking) {
      const auth = await requireAuthContext(c, false);
      targetUserId = auth.user_id;

      const existing = await database.getUserByLegacyEmail(email, sqlOps());
      if (existing && existing.user.id !== targetUserId) {
        throw new APIError({
          status: 409,
          code: api.errors.AuthUserLegacyRegisterErrorCode
            .CredentialAlreadyLinked,
          message: "This credential is already linked to another user",
          user_message: "この認証情報は他のユーザに紐づいています。",
          field_errors: {
            email: "このメールアドレスは既に別アカウントに連携されています。",
          },
        });
      }

      await database.upsertLegacyIdentifier(
        targetUserId,
        email,
        passwordHash,
        sqlOps(),
      );
    } else {
      targetUserId = await withTransaction(async (tx: PoolConnection) => {
        const existing = await database.getUserByLegacyEmail(email, sqlOps(tx));
        if (existing) {
          await database.upsertLegacyIdentifier(
            existing.user.id,
            email,
            passwordHash,
            sqlOps(tx),
          );
          return existing.user.id;
        }

        const user = await database.createUserWithDefaults(sqlOps(tx));
        createdAccount = true;
        await database.upsertLegacyIdentifier(
          user.id,
          email,
          passwordHash,
          sqlOps(tx),
        );
        return user.id;
      });
    }

    await establishSession(c, targetUserId);

    if (consumed.is_linking) {
      await writeAuditLog(
        c,
        "identity_add",
        {
          identifier_type: "legacy",
          user_id: targetUserId,
          email,
          ip_address: ipAddress,
        },
        `user:${targetUserId}`,
      );
    } else {
      if (createdAccount) {
        await writeAuditLog(
          c,
          "account_create",
          {
            register_method: "legacy",
            user_id: targetUserId,
            email,
            ip_address: ipAddress,
          },
          `user:${targetUserId}`,
        );
      }

      await writeAuditLog(
        c,
        "login",
        {
          login_method: "legacy",
          user_id: targetUserId,
          email,
          ip_address: ipAddress,
          via: "otp_register",
        },
        `user:${targetUserId}`,
      );
    }

    return okJson(
      c,
      {} satisfies api.endpoints.ApiAuthUserLegacyRegisterPostRes,
    );
  });

  register(api.endpoints.APIEndpoint.AuthUserOidcGoogleStartGet, async (c) => {
    const isLinking = parseBooleanQuery(c.req.query("is_linking"));
    if (isLinking) {
      await requireAuthContext(c, false);
    }

    const oidcState = await issueOidcState(c, "google", isLinking);
    const url = buildOidcAuthorizationUrl(
      "google",
      oidcState.state,
      oidcState.nonce,
    );

    return c.redirect(url, 302);
  });

  register(api.endpoints.APIEndpoint.AuthUserOidcLineStartGet, async (c) => {
    const isLinking = parseBooleanQuery(c.req.query("is_linking"));
    if (isLinking) {
      await requireAuthContext(c, false);
    }

    const oidcState = await issueOidcState(c, "line", isLinking);
    const url = buildOidcAuthorizationUrl(
      "line",
      oidcState.state,
      oidcState.nonce,
    );

    return c.redirect(url, 302);
  });

  register(
    api.endpoints.APIEndpoint.AuthUserOidcGoogleCallbackGet,
    async (c) => {
      const state = c.req.query("state");
      const code = c.req.query("code");

      if (!state || !code) {
        throw new APIError({
          status: 400,
          code: api.errors.AuthUserOidcCallbackErrorCode.MissingStateOrCode,
          message: "state and code are required",
          user_message: "認証コールバックのパラメータが不足しています。",
        });
      }

      const oidcState = await consumeOidcState(c);
      if (
        !oidcState ||
        oidcState.provider !== "google" ||
        oidcState.state !== state
      ) {
        throw new APIError({
          status: 401,
          code: api.errors.AuthUserOidcCallbackErrorCode.InvalidState,
          message: "Invalid OIDC state",
          user_message:
            "認証セッションが無効です。もう一度やり直してください。",
        });
      }

      const ipAddress = resolveClientIpAddress(c);
      const profile = await fetchGoogleOidcProfile(code);
      const email = profile.email.mapOr<string | null>(null, (value) => value);
      const org = profile.org.mapOr<string | null>(null, (value) => value);

      let userId: string;
      let createdAccount = false;
      if (oidcState.is_linking) {
        const auth = await requireAuthContext(c, false);
        const existing = await database.getUserByGoogleSub(
          profile.sub,
          sqlOps(),
        );
        if (existing && existing.id !== auth.user_id) {
          throw new APIError({
            status: 409,
            code: api.errors.AuthUserOidcCallbackErrorCode.AccountAlreadyLinked,
            message: "This Google account is already linked to another user",
            user_message:
              "このGoogleアカウントは既に別のユーザに連携されています。",
          });
        }
        await database.upsertGoogleIdentifier(auth.user_id, profile, sqlOps());
        userId = auth.user_id;
      } else {
        userId = await withTransaction(async (tx: PoolConnection) => {
          const existing = await database.getUserByGoogleSub(
            profile.sub,
            sqlOps(tx),
          );
          if (existing) {
            await database.upsertGoogleIdentifier(
              existing.id,
              profile,
              sqlOps(tx),
            );
            return existing.id;
          }

          const user = await database.createUserWithDefaults(sqlOps(tx));
          createdAccount = true;
          await database.upsertGoogleIdentifier(user.id, profile, sqlOps(tx));
          return user.id;
        });
      }

      await establishSession(c, userId);

      if (oidcState.is_linking) {
        await writeAuditLog(
          c,
          "identity_add",
          {
            identifier_type: "google_oidc",
            user_id: userId,
            sub: profile.sub,
            email,
            org,
            ip_address: ipAddress,
          },
          `user:${userId}`,
        );
      } else {
        if (createdAccount) {
          await writeAuditLog(
            c,
            "account_create",
            {
              register_method: "google_oidc",
              user_id: userId,
              sub: profile.sub,
              email,
              org,
              ip_address: ipAddress,
            },
            `user:${userId}`,
          );
        }

        await writeAuditLog(
          c,
          "login",
          {
            login_method: "google_oidc",
            user_id: userId,
            sub: profile.sub,
            email,
            ip_address: ipAddress,
          },
          `user:${userId}`,
        );
      }

      const webBaseUrl = `https://${knowledge.HOSTNAMES.WEB}`;
      const path = oidcState.is_linking ? "/settings/auth-identities" : "/home";
      return c.redirect(`${webBaseUrl}${path}`, 302);
    },
  );

  register(api.endpoints.APIEndpoint.AuthUserOidcLineCallbackGet, async (c) => {
    const state = c.req.query("state");
    const code = c.req.query("code");

    if (!state || !code) {
      throw new APIError({
        status: 400,
        code: api.errors.AuthUserOidcCallbackErrorCode.MissingStateOrCode,
        message: "state and code are required",
        user_message: "認証コールバックのパラメータが不足しています。",
      });
    }

    const oidcState = await consumeOidcState(c);
    if (
      !oidcState ||
      oidcState.provider !== "line" ||
      oidcState.state !== state
    ) {
      throw new APIError({
        status: 401,
        code: api.errors.AuthUserOidcCallbackErrorCode.InvalidState,
        message: "Invalid OIDC state",
        user_message: "認証セッションが無効です。もう一度やり直してください。",
      });
    }

    const ipAddress = resolveClientIpAddress(c);
    const profile = await fetchLineOidcProfile(code);

    let userId: string;
    let createdAccount = false;
    if (oidcState.is_linking) {
      const auth = await requireAuthContext(c, false);
      const existing = await database.getUserByLineSub(profile.sub, sqlOps());
      if (existing && existing.id !== auth.user_id) {
        throw new APIError({
          status: 409,
          code: api.errors.AuthUserOidcCallbackErrorCode.AccountAlreadyLinked,
          message: "This LINE account is already linked to another user",
          user_message:
            "このLINEアカウントは既に別のユーザに連携されています。",
        });
      }
      await database.upsertLineIdentifier(auth.user_id, profile, sqlOps());
      userId = auth.user_id;
    } else {
      userId = await withTransaction(async (tx) => {
        const existing = await database.getUserByLineSub(
          profile.sub,
          sqlOps(tx),
        );
        if (existing) {
          await database.upsertLineIdentifier(existing.id, profile, sqlOps(tx));
          return existing.id;
        }

        const user = await database.createUserWithDefaults(sqlOps(tx));
        createdAccount = true;
        await database.upsertLineIdentifier(user.id, profile, sqlOps(tx));
        return user.id;
      });
    }

    await establishSession(c, userId);

    if (oidcState.is_linking) {
      await writeAuditLog(
        c,
        "identity_add",
        {
          identifier_type: "line_oidc",
          user_id: userId,
          sub: profile.sub,
          ip_address: ipAddress,
        },
        `user:${userId}`,
      );
    } else {
      if (createdAccount) {
        await writeAuditLog(
          c,
          "account_create",
          {
            register_method: "line_oidc",
            user_id: userId,
            sub: profile.sub,
            ip_address: ipAddress,
          },
          `user:${userId}`,
        );
      }

      await writeAuditLog(
        c,
        "login",
        {
          login_method: "line_oidc",
          user_id: userId,
          sub: profile.sub,
          ip_address: ipAddress,
        },
        `user:${userId}`,
      );
    }

    const webBaseUrl = `https://${knowledge.HOSTNAMES.WEB}`;
    const path = oidcState.is_linking ? "/settings/auth-identities" : "/home";
    return c.redirect(`${webBaseUrl}${path}`, 302);
  });

  register(api.endpoints.APIEndpoint.AuthUserLogoutDelete, async (c) => {
    await logout(c);
    return okJson(c, {} satisfies api.endpoints.ApiAuthUserLogoutDeleteRes);
  });

  register(api.endpoints.APIEndpoint.AuthUserMeGet, async (c) => {
    const hasSession = hasSessionCookiePair(c);
    const auth = await resolveAuthContext(c, false);
    if (!auth) {
      return okJson(c, {
        has_session: hasSession,
        has_access_token: false,
        is_verified_as_student: false,
      } satisfies api.endpoints.ApiAuthUserMeGetRes);
    }

    if (auth.role === "system") {
      return okJson(c, {
        has_session: false,
        has_access_token: true,
        is_verified_as_student: false,
      } satisfies api.endpoints.ApiAuthUserMeGetRes);
    }

    const isVerifiedAsStudent = await database.isUserVerifiedAsStudent(
      auth.user_id,
      sqlOps(),
    );

    return okJson(c, {
      has_session: hasSession,
      has_access_token: auth.has_access_token,
      is_verified_as_student: isVerifiedAsStudent,
    } satisfies api.endpoints.ApiAuthUserMeGetRes);
  });

  register(api.endpoints.APIEndpoint.AuthUserIdentitiesGet, async (c) => {
    const auth = await requireAuthContext(c, false);
    const user = await database.getUserById(auth.user_id, sqlOps());

    if (!user) {
      throw new APIError({
        status: 404,
        code: api.errors.UserDataErrorCode.UserNotFound,
        message: "User not found",
        user_message: "ユーザ情報が見つかりませんでした。",
      });
    }

    const identifiers = await database.getUserIdentifiers(
      auth.user_id,
      sqlOps(),
    );

    return okJson(c, {
      identifiers,
    } satisfies api.endpoints.ApiAuthUserIdentitiesGetRes);
  });

  register(api.endpoints.APIEndpoint.AuthUserIdentitiesPost, async (c) => {
    const auth = await requireAuthContext(c, false);
    const req =
      await readJsonBody<api.endpoints.ApiAuthUserIdentitiesPostReq>(c);
    const specRaw = req.identifier_spec;
    const spec =
      typeof specRaw === "object" && specRaw !== null && !Array.isArray(specRaw)
        ? specRaw
        : null;
    const specRecord = spec as Record<string, unknown> | null;
    const type = spec && "type" in spec ? spec.type : null;

    let identifierSpec: api.endpoints.ApiAuthUserIdentitiesPostReq["identifier_spec"];
    if (type === "legacy") {
      const email =
        typeof specRecord?.email === "string" ? specRecord.email : null;
      if (!email) {
        throw new APIError({
          status: 400,
          code: api.errors.CommonApiErrorCode.InvalidRequest,
          message: "Invalid identifier_spec for legacy type",
          user_message: "削除対象の認証情報の形式が不正です。",
        });
      }
      identifierSpec = { type: "legacy", email };
    } else if (type === "google_oidc" || type === "line_oidc") {
      const sub = typeof specRecord?.sub === "string" ? specRecord.sub : null;
      if (!sub) {
        throw new APIError({
          status: 400,
          code: api.errors.CommonApiErrorCode.InvalidRequest,
          message: "Invalid identifier_spec for oidc type",
          user_message: "削除対象の認証情報の形式が不正です。",
        });
      }
      identifierSpec = { type, sub };
    } else {
      throw new APIError({
        status: 400,
        code: api.errors.CommonApiErrorCode.InvalidRequest,
        message: "Invalid identifier_spec type",
        user_message: "削除対象の認証情報の形式が不正です。",
      });
    }

    await withTransaction(async (tx) => {
      const beforeCount = await database.countUserIdentifiers(
        auth.user_id,
        sqlOps(tx),
      );
      if (beforeCount <= 1) {
        throw new APIError({
          status: 400,
          code: api.errors.AuthUserIdentitiesPostErrorCode
            .LastIdentityRemovalForbidden,
          message: "At least one identity must remain linked",
          user_message: "認証情報は最低1つ残しておく必要があります。",
        });
      }

      await database.deleteUserIdentifier(
        auth.user_id,
        identifierSpec,
        sqlOps(tx),
      );
    });

    return okJson(c, {} satisfies api.endpoints.ApiAuthUserIdentitiesPostRes);
  });

  register(api.endpoints.APIEndpoint.AuthRefreshPost, async (c) => {
    const refreshed = await refreshAccessToken(c);
    if (!refreshed) {
      throw new APIError({
        status: 401,
        code: api.errors.CommonApiErrorCode.Unauthorized,
        message: "Unauthorized",
        user_message: "認証情報の更新に失敗しました。再ログインしてください。",
      });
    }

    return okJson(c, {} satisfies api.endpoints.ApiAuthRefreshPostRes);
  });
}
