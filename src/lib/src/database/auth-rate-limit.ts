import type { SqlOps } from "./sql";

export async function countRecentLegacyLoginFailures(
  email: string,
  sqlOps: SqlOps,
): Promise<number> {
  const rows = await sqlOps.selectRows<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM legacy_login_failures
      WHERE email = ?
        AND created_at >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 HOUR)
    `,
    [email],
  );

  return rows[0]?.total ?? 0;
}

export async function recordLegacyLoginFailure(
  email: string,
  ipAddress: string | null,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO legacy_login_failures
        (email, ip_address)
      VALUES (?, ?)
    `,
    [email, ipAddress],
  );
}

export async function clearLegacyLoginFailures(
  email: string,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(`DELETE FROM legacy_login_failures WHERE email = ?`, [
    email,
  ]);
}

export async function countRecentEmailVerificationRequestsByEmail(
  email: string,
  sqlOps: SqlOps,
): Promise<number> {
  const rows = await sqlOps.selectRows<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM email_verification_request_logs
      WHERE email = ?
        AND created_at >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 HOUR)
    `,
    [email],
  );

  return rows[0]?.total ?? 0;
}

export async function countRecentEmailVerificationRequestsByIp(
  ipAddress: string,
  sqlOps: SqlOps,
): Promise<number> {
  const rows = await sqlOps.selectRows<Array<{ total: number }>>(
    `
      SELECT COUNT(*) AS total
      FROM email_verification_request_logs
      WHERE ip_address = ?
        AND created_at >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 HOUR)
    `,
    [ipAddress],
  );

  return rows[0]?.total ?? 0;
}

export async function recordEmailVerificationRequest(
  email: string,
  ipAddress: string | null,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO email_verification_request_logs
        (email, ip_address)
      VALUES (?, ?)
    `,
    [email, ipAddress],
  );
}
