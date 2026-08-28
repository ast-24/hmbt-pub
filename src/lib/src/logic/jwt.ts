import type * as dto from "../dto";

import { SignJWT, importPKCS8, importSPKI, jwtVerify } from "jose";

export type JwtAlgorithm = "RS256";

export type JwtPrivateKey = Awaited<ReturnType<typeof importPKCS8>>;
export type JwtPublicKey = Awaited<ReturnType<typeof importSPKI>>;

type PrivateKeyInput = string | JwtPrivateKey;
type PublicKeyInput = string | JwtPublicKey;

type AccessTokenJwtOptions = {
  issuer: string;
  audience: string | string[];
  tokenType: dto.jwt.AccessTokenClaims["typ"];
  expiresInSec: number;
  additionalClaims?: Record<string, unknown>;
  algorithm?: JwtAlgorithm;
};

type VerifyAccessTokenJwtOptions = {
  issuer: string;
  audience: string | string[];
  tokenType: dto.jwt.AccessTokenClaims["typ"];
  algorithm?: JwtAlgorithm;
};

type OidcStateJwtOptions = {
  issuer: string;
  audience: string | string[];
  tokenType: dto.jwt.OidcStateClaims["typ"];
  expiresInSec: number;
  algorithm?: JwtAlgorithm;
};

type VerifyOidcStateJwtOptions = {
  issuer: string;
  audience: string | string[];
  tokenType: dto.jwt.OidcStateClaims["typ"];
  algorithm?: JwtAlgorithm;
};

function resolveAlgorithm(algorithm?: JwtAlgorithm): JwtAlgorithm {
  return algorithm ?? "RS256";
}

export function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, "\n").trim();
}

function normalizeAudience(audience: string | string[]): string | string[] {
  if (Array.isArray(audience)) {
    const filtered = audience.map((value) => value.trim()).filter(Boolean);
    if (filtered.length === 1) {
      return filtered[0];
    }
    return filtered;
  }

  return audience.trim();
}

async function resolvePrivateKey(
  input: PrivateKeyInput,
  algorithm: JwtAlgorithm,
): Promise<JwtPrivateKey> {
  if (typeof input === "string") {
    return importPKCS8(normalizePem(input), algorithm);
  }
  return input;
}

async function resolvePublicKey(
  input: PublicKeyInput,
  algorithm: JwtAlgorithm,
): Promise<JwtPublicKey> {
  if (typeof input === "string") {
    return importSPKI(normalizePem(input), algorithm);
  }
  return input;
}

export async function signAccessToken(
  claims: dto.jwt.AccessTokenClaims,
  privateKeyInput: PrivateKeyInput,
  options: AccessTokenJwtOptions,
): Promise<string> {
  const algorithm = resolveAlgorithm(options.algorithm);
  const privateKey = await resolvePrivateKey(privateKeyInput, algorithm);

  const payload: Record<string, unknown> =
    claims.role === "user"
      ? {
          ...(options.additionalClaims ?? {}),
          typ: options.tokenType,
          role: "user",
          sub: claims.sub,
          sid: claims.sid,
        }
      : {
          ...(options.additionalClaims ?? {}),
          typ: options.tokenType,
          role: "system",
          name: claims.name,
        };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: algorithm, typ: "JWT" })
    .setIssuer(options.issuer)
    .setAudience(normalizeAudience(options.audience))
    .setIssuedAt()
    .setExpirationTime(`${options.expiresInSec}s`)
    .sign(privateKey);
}

export async function verifyAccessToken(
  token: string,
  publicKeyInput: PublicKeyInput,
  options: VerifyAccessTokenJwtOptions,
): Promise<dto.jwt.AccessTokenClaims | null> {
  const algorithm = resolveAlgorithm(options.algorithm);
  const publicKey = await resolvePublicKey(publicKeyInput, algorithm);

  try {
    const verified = await jwtVerify(token, publicKey, {
      issuer: options.issuer,
      audience: normalizeAudience(options.audience),
    });

    const payload = verified.payload;
    if (payload.typ !== options.tokenType) {
      return null;
    }

    if (payload.role === "system") {
      if (typeof payload.name !== "string") {
        return null;
      }

      const name = payload.name.trim();
      if (name.length === 0) {
        return null;
      }

      return {
        typ: options.tokenType,
        role: "system",
        name,
      };
    }

    if (payload.role !== undefined && payload.role !== "user") {
      return null;
    }

    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      return null;
    }

    return {
      typ: options.tokenType,
      role: "user",
      sub: payload.sub,
      sid: payload.sid,
    };
  } catch {
    return null;
  }
}

export async function signOidcStateToken(
  claims: dto.jwt.OidcStateClaims,
  privateKeyInput: PrivateKeyInput,
  options: OidcStateJwtOptions,
): Promise<string> {
  const algorithm = resolveAlgorithm(options.algorithm);
  const privateKey = await resolvePrivateKey(privateKeyInput, algorithm);

  const payload: Record<string, string | boolean> = {
    typ: options.tokenType,
    provider: claims.provider,
    state: claims.state,
    nonce: claims.nonce,
    is_linking: claims.is_linking,
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: algorithm, typ: "JWT" })
    .setIssuer(options.issuer)
    .setAudience(normalizeAudience(options.audience))
    .setIssuedAt()
    .setExpirationTime(`${options.expiresInSec}s`)
    .sign(privateKey);
}

export async function verifyOidcStateToken(
  token: string,
  publicKeyInput: PublicKeyInput,
  options: VerifyOidcStateJwtOptions,
): Promise<dto.jwt.OidcStateClaims | null> {
  const algorithm = resolveAlgorithm(options.algorithm);
  const publicKey = await resolvePublicKey(publicKeyInput, algorithm);

  try {
    const verified = await jwtVerify(token, publicKey, {
      issuer: options.issuer,
      audience: normalizeAudience(options.audience),
    });

    const payload = verified.payload;
    if (
      payload.typ !== options.tokenType ||
      (payload.provider !== "google" && payload.provider !== "line") ||
      typeof payload.state !== "string" ||
      typeof payload.nonce !== "string" ||
      typeof payload.is_linking !== "boolean"
    ) {
      return null;
    }

    return {
      typ: options.tokenType,
      provider: payload.provider,
      state: payload.state,
      nonce: payload.nonce,
      is_linking: payload.is_linking,
    };
  } catch {
    return null;
  }
}
