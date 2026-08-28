import { randomBytes } from "node:crypto";

import { knowledge } from "@ast24/hmbt-v5-lib";
import type { Context } from "hono";
import { importPKCS8, importSPKI } from "jose";

import { loadRuntimeEnv } from "../env";

export function makeRandomToken(length: number): string {
  const need = Math.ceil((length * 3) / 4);
  let token = "";

  while (token.length < length) {
    token += randomBytes(need)
      .toString("base64url")
      .replace(/[^a-zA-Z0-9]/g, "");
  }

  return token.slice(0, length);
}

export function generateSessionId(): string {
  return (
    knowledge.auth.AUTH_ID_FORMATS.session_id_prefix +
    makeRandomToken(knowledge.auth.AUTH_ID_FORMATS.session_id_random_length)
  );
}

export function generateSessionSecret(): string {
  const hexLength = knowledge.auth.AUTH_FIXED_LENGTHS.session_secret;
  return randomBytes(Math.ceil(hexLength / 2))
    .toString("hex")
    .slice(0, hexLength);
}

type JosePrivateKey = Awaited<ReturnType<typeof importPKCS8>>;
type JosePublicKey = Awaited<ReturnType<typeof importSPKI>>;

let cachedJwtPrivateKey: Promise<JosePrivateKey> | null = null;
let cachedJwtPublicKey: Promise<JosePublicKey> | null = null;

function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, "\n").trim();
}

export function jwtAlgorithm(): "RS256" {
  return "RS256";
}

export async function jwtPrivateKey(): Promise<JosePrivateKey> {
  if (!cachedJwtPrivateKey) {
    const env = loadRuntimeEnv();
    cachedJwtPrivateKey = importPKCS8(
      normalizePem(env.jwt_private_key),
      jwtAlgorithm(),
    );
  }
  return cachedJwtPrivateKey;
}

export async function jwtPublicKey(): Promise<JosePublicKey> {
  if (!cachedJwtPublicKey) {
    const env = loadRuntimeEnv();
    cachedJwtPublicKey = importSPKI(
      normalizePem(env.jwt_public_key),
      jwtAlgorithm(),
    );
  }
  return cachedJwtPublicKey;
}

export function cookieSecure(): boolean {
  return true;
}

export function extractIpAddress(c: Context): string | null {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return null;
}

export function extractUserAgent(c: Context): string | null {
  const userAgent = c.req.header("user-agent");
  return userAgent && userAgent.length > 0 ? userAgent : null;
}
