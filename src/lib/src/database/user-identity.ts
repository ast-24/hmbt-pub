import * as cmn from "../cmn";
import * as knowledge from "../knowledge";
import * as models from "../models";
import { serializeForJson } from "./serde";
import { fromOption, toOption } from "./shared";
import type { SqlOps } from "./sql";

function toNullableGrade(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < 1 || value > 3) {
    return null;
  }
  return value;
}

function toNullableHomeClass(
  value: number | null,
): knowledge.HomeClassNum | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < 1 || value > 6) {
    return null;
  }
  return value as knowledge.HomeClassNum;
}

export async function createUserWithDefaults(
  sqlOps: SqlOps,
): Promise<models.user.User> {
  const defaultUserConfig = knowledge.auth.createDefaultUserConfig();
  const defaultWebUiConfig = knowledge.auth.createDefaultWebUiConfig();

  const user = models.user.User.create(cmn.None(), null, null);

  await sqlOps.executeSql(
    `
      INSERT INTO users (id, name, grade, home_class)
      VALUES (?, NULL, NULL, NULL)
    `,
    [user.id],
  );

  await sqlOps.executeSql(
    `
      INSERT INTO users_settings (user_id, settings)
      VALUES (?, CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE user_id = user_id
    `,
    [user.id, JSON.stringify(serializeForJson(defaultUserConfig))],
  );

  await sqlOps.executeSql(
    `
      INSERT INTO users_ui_settings (user_id, settings)
      VALUES (?, CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE user_id = user_id
    `,
    [user.id, JSON.stringify(serializeForJson(defaultWebUiConfig))],
  );

  return user;
}

export async function getUserById(
  userId: string,
  sqlOps: SqlOps,
): Promise<models.user.User | null> {
  const rows = await sqlOps.selectRows<
    Array<{
      id: string;
      name: string | null;
      grade: number | null;
      home_class: number | null;
      is_verified_as_student: number | boolean;
      has_any_timetable_selection: number | boolean;
    }>
  >(
    `
      SELECT
        id,
        name,
        grade,
        home_class,
        is_verified_as_student,
        has_any_timetable_selection
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return models.user.User.load(
    row.id,
    toOption(row.name),
    toNullableGrade(row.grade),
    toNullableHomeClass(row.home_class),
    row.is_verified_as_student === true || row.is_verified_as_student === 1,
    row.has_any_timetable_selection === true ||
      row.has_any_timetable_selection === 1,
  );
}

function isVerifiedAsStudentByIdentifier(
  identifier: models.user.UserIdentifier,
): boolean {
  switch (identifier.type) {
    case "legacy":
      return knowledge.STUDENT_EMAIL_REGEX.test(identifier.email);
    case "google_oidc":
      return (
        identifier.email_verified_as_owner &&
        identifier.email.mapOr(false, (email) =>
          knowledge.STUDENT_EMAIL_REGEX.test(email),
        )
      );
    case "line_oidc":
      return identifier.verified_as_student_in_v4;
  }
}

export async function refreshUserVerifiedAsStudent(
  userId: string,
  sqlOps: SqlOps,
): Promise<boolean> {
  const identifiers = await getUserIdentifiers(userId, sqlOps);
  const isVerified = identifiers.some((identifier) =>
    isVerifiedAsStudentByIdentifier(identifier),
  );

  await sqlOps.executeSql(
    `
      UPDATE users
      SET
        is_verified_as_student = ?,
        updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ?
    `,
    [isVerified, userId],
  );

  return isVerified;
}

export async function isUserVerifiedAsStudent(
  userId: string,
  sqlOps: SqlOps,
): Promise<boolean> {
  const rows = await sqlOps.selectRows<
    Array<{ is_verified: number | boolean }>
  >(
    `
      SELECT is_verified_as_student AS is_verified
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  );

  const row = rows[0];
  if (!row) {
    return false;
  }

  if (row.is_verified === true || row.is_verified === 1) {
    return true;
  }

  // Keep compatibility with legacy v4 LINE verified users by refreshing
  // from current identifiers when cached flag is still false.
  return refreshUserVerifiedAsStudent(userId, sqlOps);
}

export async function getUserByLegacyEmail(
  email: string,
  sqlOps: SqlOps,
): Promise<{ user: models.user.User; password_hash: string } | null> {
  const rows = await sqlOps.selectRows<
    Array<{ user_id: string; password_hash: string }>
  >(
    `
      SELECT user_id, password_hash
      FROM users_identifiers_legacy
      WHERE email = ?
      LIMIT 1
    `,
    [email],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  const user = await getUserById(row.user_id, sqlOps);
  if (!user) {
    return null;
  }

  return {
    user,
    password_hash: row.password_hash,
  };
}

export async function getUserByGoogleSub(
  sub: string,
  sqlOps: SqlOps,
): Promise<models.user.User | null> {
  const rows = await sqlOps.selectRows<Array<{ user_id: string }>>(
    `
      SELECT user_id
      FROM users_identifiers_oidc_google
      WHERE sub = ?
      LIMIT 1
    `,
    [sub],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return getUserById(row.user_id, sqlOps);
}

export async function getUserByLineSub(
  sub: string,
  sqlOps: SqlOps,
): Promise<models.user.User | null> {
  const rows = await sqlOps.selectRows<Array<{ user_id: string }>>(
    `
      SELECT user_id
      FROM users_identifiers_oidc_line
      WHERE sub = ?
      LIMIT 1
    `,
    [sub],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return getUserById(row.user_id, sqlOps);
}

export async function upsertLegacyIdentifier(
  userId: string,
  email: string,
  passwordHash: string,
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO users_identifiers_legacy (email, user_id, password_hash)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        password_hash = VALUES(password_hash),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [email, userId, passwordHash],
  );

  await refreshUserVerifiedAsStudent(userId, sqlOps);
}

export async function upsertGoogleIdentifier(
  userId: string,
  profile: {
    sub: string;
    email: cmn.Option<string>;
    email_verified_as_owner: boolean;
    org: cmn.Option<string>;
  },
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO users_identifiers_oidc_google
        (sub, user_id, email, email_verified_as_owner, org)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        email = VALUES(email),
        email_verified_as_owner = VALUES(email_verified_as_owner),
        org = VALUES(org),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [
      profile.sub,
      userId,
      fromOption(profile.email),
      profile.email_verified_as_owner,
      fromOption(profile.org),
    ],
  );

  await refreshUserVerifiedAsStudent(userId, sqlOps);
}

export async function upsertLineIdentifier(
  userId: string,
  profile: {
    sub: string;
  },
  sqlOps: SqlOps,
): Promise<void> {
  await sqlOps.executeSql(
    `
      INSERT INTO users_identifiers_oidc_line
        (sub, user_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        updated_at = CURRENT_TIMESTAMP(3)
    `,
    [profile.sub, userId],
  );

  await refreshUserVerifiedAsStudent(userId, sqlOps);
}

export async function getUserIdentifiers(
  userId: string,
  sqlOps: SqlOps,
): Promise<models.user.UserIdentifier[]> {
  const legacyRows = await sqlOps.selectRows<Array<{ email: string }>>(
    `
      SELECT email
      FROM users_identifiers_legacy
      WHERE user_id = ?
      ORDER BY email
    `,
    [userId],
  );

  const googleRows = await sqlOps.selectRows<
    Array<{
      sub: string;
      email: string | null;
      email_verified_as_owner: number;
      org: string | null;
    }>
  >(
    `
      SELECT sub, email, email_verified_as_owner, org
      FROM users_identifiers_oidc_google
      WHERE user_id = ?
      ORDER BY sub
    `,
    [userId],
  );

  const lineRows = await sqlOps.selectRows<
    Array<{
      sub: string;
      linked_email: string | null;
    }>
  >(
    `
      SELECT line.sub, verified.linked_email
      FROM users_identifiers_oidc_line line
      LEFT JOIN verified_as_student_in_v4_oidc_line verified
        ON verified.sub = line.sub
      WHERE line.user_id = ?
      ORDER BY line.sub
    `,
    [userId],
  );

  const identifiers: models.user.UserIdentifier[] = [];

  legacyRows.forEach((row) => {
    identifiers.push({
      type: "legacy",
      email: row.email,
    });
  });

  googleRows.forEach((row) => {
    identifiers.push({
      type: "google_oidc",
      sub: row.sub,
      email_verified_as_owner: !!row.email_verified_as_owner,
      email: toOption(row.email),
      org: toOption(row.org),
    });
  });

  lineRows.forEach((row) => {
    identifiers.push({
      type: "line_oidc",
      sub: row.sub,
      verified_as_student_in_v4: row.linked_email !== null,
      linked_email_in_v4: toOption(row.linked_email),
    });
  });

  return identifiers;
}

export async function countUserIdentifiers(
  userId: string,
  sqlOps: SqlOps,
): Promise<number> {
  const rows = await sqlOps.selectRows<Array<{ total: number }>>(
    `
      SELECT (
        (SELECT COUNT(*) FROM users_identifiers_legacy WHERE user_id = ?)
        +
        (SELECT COUNT(*) FROM users_identifiers_oidc_google WHERE user_id = ?)
        +
        (SELECT COUNT(*) FROM users_identifiers_oidc_line WHERE user_id = ?)
      ) AS total
    `,
    [userId, userId, userId],
  );

  return rows[0]?.total ?? 0;
}

export async function deleteUserIdentifier(
  userId: string,
  spec: models.user.UserIdentifierSpec,
  sqlOps: SqlOps,
): Promise<void> {
  switch (spec.type) {
    case "legacy":
      await sqlOps.executeSql(
        `DELETE FROM users_identifiers_legacy WHERE user_id = ? AND email = ?`,
        [userId, spec.email],
      );
      break;
    case "google_oidc":
      await sqlOps.executeSql(
        `DELETE FROM users_identifiers_oidc_google WHERE user_id = ? AND sub = ?`,
        [userId, spec.sub],
      );
      break;
    case "line_oidc":
      await sqlOps.executeSql(
        `DELETE FROM users_identifiers_oidc_line WHERE user_id = ? AND sub = ?`,
        [userId, spec.sub],
      );
      break;
  }

  await refreshUserVerifiedAsStudent(userId, sqlOps);
}
