import { dto, knowledge, logic } from "@ast24/hmbt-v5-lib";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import {
  cookieSecure,
  jwtAlgorithm,
  jwtPrivateKey,
  jwtPublicKey,
  makeRandomToken,
} from "./common";

export async function issueOidcState(
  c: Context,
  provider: knowledge.auth.OIDCProvider,
  isLinking: boolean,
): Promise<{ state: string; nonce: string }> {
  const state = makeRandomToken(40);
  const nonce = makeRandomToken(40);
  const claims: dto.jwt.OidcStateClaims = {
    typ: "oidc_state",
    provider,
    state,
    nonce,
    is_linking: isLinking,
  };

  const token = await logic.jwt.signOidcStateToken(
    claims,
    await jwtPrivateKey(),
    {
      issuer: knowledge.auth.AUTH_JWT.issuer,
      audience: knowledge.auth.AUTH_JWT.audience,
      tokenType: knowledge.auth.AUTH_JWT.oidc_state_type,
      expiresInSec: knowledge.auth.AUTH_TTL_SEC.oidc_state,
      algorithm: jwtAlgorithm(),
    },
  );

  setCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.OIDC_STATE, token, {
    path: "/",
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "None",
    maxAge: knowledge.auth.AUTH_TTL_SEC.oidc_state,
  });

  return {
    state,
    nonce,
  };
}

export async function consumeOidcState(
  c: Context,
): Promise<dto.jwt.OidcStateClaims | null> {
  const token = getCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.OIDC_STATE);
  clearOidcState(c);

  if (!token) {
    return null;
  }

  return logic.jwt.verifyOidcStateToken(token, await jwtPublicKey(), {
    issuer: knowledge.auth.AUTH_JWT.issuer,
    audience: knowledge.auth.AUTH_JWT.audience,
    tokenType: knowledge.auth.AUTH_JWT.oidc_state_type,
    algorithm: jwtAlgorithm(),
  });
}

export function clearOidcState(c: Context): void {
  deleteCookie(c, knowledge.auth.AUTH_COOKIE_NAMES.OIDC_STATE, {
    path: "/",
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "None",
  });
}
