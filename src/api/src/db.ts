import {
  connect,
  type Config,
  type Connection,
  type FullResult,
  type Tx,
} from "@tidbcloud/serverless";

import { loadRuntimeEnv } from "./env";

const DB_CONNECTION_RETRY_COUNT = 2;
const RETRYABLE_DB_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_CONNECT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
]);

function extractErrorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

function extractErrorCause(error: unknown): unknown {
  if (error && typeof error === "object" && "cause" in error) {
    return error.cause;
  }

  return undefined;
}

function toLowerMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message.toLowerCase();
  }
  if (typeof value === "string") {
    return value.toLowerCase();
  }
  return "";
}

function isRetryableDbConnectionError(error: unknown): boolean {
  const directCode = extractErrorCode(error);
  if (directCode && RETRYABLE_DB_ERROR_CODES.has(directCode)) {
    return true;
  }

  const cause = extractErrorCause(error);
  const causeCode = extractErrorCode(cause);
  if (causeCode && RETRYABLE_DB_ERROR_CODES.has(causeCode)) {
    return true;
  }

  const combinedMessage = `${toLowerMessage(error)} ${toLowerMessage(cause)}`;
  return (
    combinedMessage.includes("fetch failed") ||
    combinedMessage.includes("connect timeout") ||
    combinedMessage.includes("connection timeout")
  );
}

async function runWithDbConnectionRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (
        attempt >= DB_CONNECTION_RETRY_COUNT ||
        !isRetryableDbConnectionError(error)
      ) {
        throw error;
      }

      attempt += 1;
    }
  }
}

export type SqlParam = string | number | boolean | Date | null;
export type SqlParams = SqlParam[];

export type RowDataPacket = Record<string, unknown>;

export interface ResultSetHeader {
  affectedRows: number;
  insertId: number;
}

export interface Pool {
  query<T extends RowDataPacket[]>(
    sql: string,
    params: SqlParams,
  ): Promise<[T]>;
  execute<T extends ResultSetHeader = ResultSetHeader>(
    sql: string,
    params: SqlParams,
  ): Promise<[T]>;
}

export type PoolConnection = Pool;

class TidbRunner implements Pool {
  constructor(private readonly connection: Connection<Config>) {}

  async query<T extends RowDataPacket[]>(
    sql: string,
    params: SqlParams,
  ): Promise<[T]> {
    const result = (await runWithDbConnectionRetry(async () =>
      this.connection.execute(sql, toDriverParams(params), {
        fullResult: true,
      }),
    )) as FullResult;
    return [toRows<T>(result)];
  }

  async execute<T extends ResultSetHeader = ResultSetHeader>(
    sql: string,
    params: SqlParams,
  ): Promise<[T]> {
    const result = (await runWithDbConnectionRetry(async () =>
      this.connection.execute(sql, toDriverParams(params), {
        fullResult: true,
      }),
    )) as FullResult;

    return [
      {
        affectedRows: result.rowsAffected ?? 0,
        insertId: parseInsertId(result.lastInsertId),
      } as T,
    ];
  }
}

class TidbTransactionRunner implements PoolConnection {
  constructor(private readonly tx: Tx<Config>) {}

  async query<T extends RowDataPacket[]>(
    sql: string,
    params: SqlParams,
  ): Promise<[T]> {
    const result = (await runWithDbConnectionRetry(async () =>
      this.tx.execute(sql, toDriverParams(params), {
        fullResult: true,
      }),
    )) as FullResult;
    return [toRows<T>(result)];
  }

  async execute<T extends ResultSetHeader = ResultSetHeader>(
    sql: string,
    params: SqlParams,
  ): Promise<[T]> {
    const result = (await runWithDbConnectionRetry(async () =>
      this.tx.execute(sql, toDriverParams(params), {
        fullResult: true,
      }),
    )) as FullResult;

    return [
      {
        affectedRows: result.rowsAffected ?? 0,
        insertId: parseInsertId(result.lastInsertId),
      } as T,
    ];
  }
}

let driverConnection: Connection<Config> | null = null;
let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const env = loadRuntimeEnv({ require_jwt_keys: false });

  if (env.database_url) {
    driverConnection = connect({
      url: env.database_url,
    });
    pool = new TidbRunner(driverConnection);
    return pool;
  }

  if (!env.database_host || !env.database_user || !env.database_name) {
    throw new Error(
      "Database configuration is missing. Set DATABASE_URL or DATABASE_HOST/DATABASE_USER/DATABASE_NAME.",
    );
  }

  const host =
    env.database_port > 0
      ? `${env.database_host}:${env.database_port}`
      : env.database_host;

  driverConnection = connect({
    host,
    username: env.database_user,
    password: env.database_password,
    database: env.database_name,
  });

  pool = new TidbRunner(driverConnection);
  return pool;
}

export async function withTransaction<T>(
  fn: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const base = getDriverConnection();
  const tx = await runWithDbConnectionRetry(async () => base.begin());
  const connection = new TidbTransactionRunner(tx);

  try {
    const value = await fn(connection);
    await tx.commit();
    return value;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

function getDriverConnection(): Connection<Config> {
  getPool();
  if (!driverConnection) {
    throw new Error("Database connection could not be initialized");
  }
  return driverConnection;
}

function toRows<T extends RowDataPacket[]>(result: FullResult): T {
  return (result.rows ?? []) as T;
}

function parseInsertId(lastInsertId: string | null): number {
  if (!lastInsertId) {
    return 0;
  }
  const parsed = Number.parseInt(lastInsertId, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDriverParams(
  params: SqlParams,
): Array<string | number | boolean | null> {
  return params.map((value) => {
    if (value instanceof Date) {
      return toSqlDateTime(value);
    }
    return value;
  });
}

function toSqlDateTime(value: Date): string {
  const yyyy = value.getUTCFullYear();
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(value.getUTCDate()).padStart(2, "0");
  const hh = String(value.getUTCHours()).padStart(2, "0");
  const mi = String(value.getUTCMinutes()).padStart(2, "0");
  const ss = String(value.getUTCSeconds()).padStart(2, "0");
  const mmm = String(value.getUTCMilliseconds()).padStart(3, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${mmm}`;
}
