import { database } from "@ast24/hmbt-v5-lib";
import {
  connect,
  type Config,
  type Connection,
  type FullResult,
} from "@tidbcloud/serverless";

let cachedDbConnection: Connection<Config> | null = null;
let cachedSqlOps: database.SqlOps | null = null;

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveDatabaseConnection(): Connection<Config> {
  if (cachedDbConnection) {
    return cachedDbConnection;
  }

  const databaseUrl = getEnv("DATABASE_URL");
  if (databaseUrl) {
    cachedDbConnection = connect({ url: databaseUrl });
    return cachedDbConnection;
  }

  const host = requireEnv("DATABASE_HOST");
  const user = requireEnv("DATABASE_USER");
  const databaseName = requireEnv("DATABASE_NAME");
  const password = getEnv("DATABASE_PASSWORD");
  const portRaw = getEnv("DATABASE_PORT");
  const port = portRaw ? Number.parseInt(portRaw, 10) : 0;

  const hostWithPort =
    Number.isInteger(port) && port > 0 ? `${host}:${port}` : host;

  cachedDbConnection = connect({
    host: hostWithPort,
    username: user,
    password,
    database: databaseName,
  });

  return cachedDbConnection;
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

function toDriverParams(
  params: database.SqlParams,
): Array<string | number | boolean | null> {
  return params.map((value) => {
    if (value instanceof Date) {
      return toSqlDateTime(value);
    }
    return value;
  });
}

function parseInsertId(lastInsertId: string | null): number {
  if (!lastInsertId) {
    return 0;
  }

  const parsed = Number.parseInt(lastInsertId, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSqlOps(): database.SqlOps {
  if (cachedSqlOps) {
    return cachedSqlOps;
  }

  const connection = resolveDatabaseConnection();

  cachedSqlOps = {
    selectRows: async <T extends database.RowData[]>(
      sql: string,
      params: database.SqlParams,
    ) => {
      const result = (await connection.execute(sql, toDriverParams(params), {
        fullResult: true,
      })) as FullResult;
      return (result.rows ?? []) as T;
    },
    executeSql: async (sql: string, params: database.SqlParams) => {
      const result = (await connection.execute(sql, toDriverParams(params), {
        fullResult: true,
      })) as FullResult;

      return {
        affectedRows: result.rowsAffected ?? 0,
        insertId: parseInsertId(result.lastInsertId),
      };
    },
  };

  return cachedSqlOps;
}
