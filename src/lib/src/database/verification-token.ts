import type { SqlOps } from "./sql";

export type EmailVerificationTokenRow = {
  token: string;
  email: string;
  is_linking: number;
  expires_at: Date | string;
};

export async function createEmailVerificationToken(
  email: string,
  token: string,
  isLinking: boolean,
  ipAddress: string | null,
  expiresAt: Date,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO email_verification_tokens
        (token, email, is_linking, ip_address, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        email = VALUES(email),
        is_linking = VALUES(is_linking),
        ip_address = VALUES(ip_address),
        expires_at = VALUES(expires_at),
        created_at = CURRENT_TIMESTAMP(3)
    `,
    [token, email, isLinking ? 1 : 0, ipAddress, expiresAt],
  );
}

export async function getEmailVerificationToken(
  token: string,
  email: string,
  sqlOps: SqlOps,
): Promise<EmailVerificationTokenRow | null> {
  const rows = await sqlOps.selectRows<EmailVerificationTokenRow[]>(
    `
      SELECT token, email, is_linking, expires_at
      FROM email_verification_tokens
      WHERE token = ? AND email = ?
      LIMIT 1
    `,
    [token, email],
  );

  return rows[0] ?? null;
}

export async function deleteEmailVerificationToken(
  token: string,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `DELETE FROM email_verification_tokens WHERE token = ?`,
    [token],
  );
}

export async function consumeEmailVerificationToken(
  token: string,
  email: string,
  sqlOps: SqlOps,
): Promise<{ is_linking: boolean } | null> {
  const row = await getEmailVerificationToken(token, email, sqlOps);
  if (!row) {
    return null;
  }

  const expiresAt =
    row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  if (expiresAt.getTime() < Date.now()) {
    await deleteEmailVerificationToken(token, sqlOps);
    return null;
  }

  await deleteEmailVerificationToken(token, sqlOps);

  return {
    is_linking: !!row.is_linking,
  };
}
