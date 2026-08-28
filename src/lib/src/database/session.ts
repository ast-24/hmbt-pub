type SqlParam = string | number | boolean | Date | null;

export type SqlExecutor = (sql: string, params: SqlParam[]) => Promise<unknown>;

export async function touchSession(
  sessionId: string,
  executeSql: SqlExecutor,
): Promise<void> {
  await executeSql(
    `
      UPDATE users_sessions
      SET refreshed_at = CURRENT_TIMESTAMP(3)
      WHERE session_id = ?
    `,
    [sessionId],
  );
}
