import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { dto, knowledge, logic } from "@ast24/hmbt-v5-lib";

const DEFAULT_ISSUER = knowledge.auth.AUTH_JWT.issuer;
const DEFAULT_AUDIENCE = knowledge.auth.AUTH_JWT.audience;
const DEFAULT_EXPIRATION_SEC = knowledge.auth.AUTH_TTL_SEC.access_token;
const PRIVATE_KEY_END_MARKER = "EOF";
type ReadlineInterface = ReturnType<typeof createInterface>;

function parseBoolean(inputValue: string, defaultValue: boolean): boolean {
  const normalized = inputValue.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  if (["y", "yes", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["n", "no", "false", "0"].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${inputValue}`);
}

const EXPIRATION_SUFFIX_TO_SECONDS = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
  w: 60 * 60 * 24 * 7,
  M: 60 * 60 * 24 * 30,
  y: 60 * 60 * 24 * 365,
} as const;

function parseExpirationSeconds(inputValue: string, fallback: number): number {
  const trimmed = inputValue.trim();
  if (!trimmed) {
    return fallback;
  }

  const matched = trimmed.match(/^(\d+)([smhdwMy])?$/);
  if (!matched) {
    throw new Error(
      `Invalid expiration: ${inputValue} (examples: 900, 15m, 2h, 1d, 3w, 1M, 1y)`,
    );
  }

  const amount = Number.parseInt(matched[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid expiration amount: ${inputValue}`);
  }

  const suffix = matched[2] as keyof typeof EXPIRATION_SUFFIX_TO_SECONDS;
  if (!suffix) {
    return amount;
  }

  const seconds = amount * EXPIRATION_SUFFIX_TO_SECONDS[suffix];
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Expiration is out of range: ${inputValue}`);
  }

  return seconds;
}

function parseAudience(inputValue: string): string | string[] {
  const values = inputValue
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (values.length === 0) {
    throw new Error("Audience must not be empty");
  }

  return values.length === 1 ? values[0] : values;
}

function parseAdditionalClaims(inputValue: string): Record<string, unknown> {
  const trimmed = inputValue.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Additional claims must be valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Additional claims must be a JSON object");
  }

  const claims = parsed as Record<string, unknown>;
  for (const reservedKey of ["typ", "role", "name", "sub", "sid"]) {
    if (reservedKey in claims) {
      throw new Error(
        `Additional claims cannot include reserved key: ${reservedKey}`,
      );
    }
  }

  return claims;
}

async function readMultilineSecret(
  rl: ReadlineInterface,
  prompt: string,
): Promise<string> {
  const lines: string[] = [];

  output.write(`${prompt}\n`);
  output.write(
    `Finish input with a line that contains only: ${PRIVATE_KEY_END_MARKER}\n`,
  );

  while (true) {
    const line = await rl.question("");
    if (line === PRIVATE_KEY_END_MARKER) {
      break;
    }
    lines.push(line);
  }

  const pem = lines.join("\n").trim();
  if (!pem) {
    throw new Error("Private key is required");
  }

  return pem;
}

async function run(): Promise<void> {
  const rl = createInterface({ input, output, terminal: true });

  try {
    output.write("System role JWT generator\n\n");

    const systemName = (await rl.question("name (system actor name): ")).trim();
    if (!systemName) {
      throw new Error("name is required");
    }

    const issuerInput = await rl.question(`issuer [${DEFAULT_ISSUER}]: `);
    const issuer = issuerInput.trim() || DEFAULT_ISSUER;

    const audienceInput = await rl.question(
      `audience (comma-separated) [${DEFAULT_AUDIENCE}]: `,
    );
    const audience = parseAudience(audienceInput.trim() || DEFAULT_AUDIENCE);

    const expirationInput = await rl.question(
      `expiration (seconds or 15m/2h/1d/3w/1M/1y) [${DEFAULT_EXPIRATION_SEC}]: `,
    );
    const expirationSeconds = parseExpirationSeconds(
      expirationInput,
      DEFAULT_EXPIRATION_SEC,
    );

    const additionalClaimsInput = await rl.question(
      "additional claims JSON (optional, object): ",
    );
    const additionalClaims = parseAdditionalClaims(additionalClaimsInput);

    const useEnvInput = await rl.question(
      "use JWT_PRIVATE_KEY from environment if available? [Y/n]: ",
    );
    const useEnv = parseBoolean(useEnvInput, true);

    let privateKeyPem = "";
    if (useEnv && process.env.JWT_PRIVATE_KEY?.trim()) {
      privateKeyPem = process.env.JWT_PRIVATE_KEY.trim();
      output.write("Using JWT_PRIVATE_KEY from environment.\n");
    } else {
      privateKeyPem = await readMultilineSecret(
        rl,
        "Paste PKCS#8 private key PEM:",
      );
    }

    const claims: dto.jwt.AccessTokenClaims = {
      typ: "access",
      role: "system",
      name: systemName,
    };

    const signedToken = await logic.jwt.signAccessToken(claims, privateKeyPem, {
      issuer,
      audience,
      tokenType: knowledge.auth.AUTH_JWT.access_token_type,
      expiresInSec: expirationSeconds,
      additionalClaims,
      algorithm: "RS256",
    });

    const payload: Record<string, unknown> = {
      ...claims,
      ...additionalClaims,
    };

    output.write("\nJWT:\n");
    output.write(`${signedToken}\n`);

    output.write("\nSummary:\n");
    output.write(
      `${JSON.stringify(
        {
          issuer,
          audience,
          expiration_seconds: expirationSeconds,
          payload,
        },
        null,
        2,
      )}\n`,
    );

    output.write("\nReal payload:\n");
    output.write(`${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    rl.close();
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exitCode = 1;
});
