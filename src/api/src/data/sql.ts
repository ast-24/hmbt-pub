import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
  SqlParam,
} from "../db";
import { database } from "@ast24/hmbt-v5-lib";
import { getPool, withTransaction } from "../db";

export type QueryRunner = Pool | PoolConnection;
export type SqlParams = SqlParam[];

function runner(connection?: PoolConnection): QueryRunner {
  return connection ?? getPool();
}

export async function selectRows<T extends RowDataPacket[]>(
  sql: string,
  params: SqlParams,
  connection?: PoolConnection,
): Promise<T> {
  const [rows] = await runner(connection).query<T>(sql, params);
  return rows;
}

export async function executeSql(
  sql: string,
  params: SqlParams,
  connection?: PoolConnection,
): Promise<ResultSetHeader> {
  const [result] = await runner(connection).execute<ResultSetHeader>(
    sql,
    params,
  );
  return result;
}

export function makeSqlOps(connection?: PoolConnection): database.SqlOps {
  return {
    selectRows: <T extends database.RowData[]>(
      sql: string,
      params: database.SqlParams,
    ) => selectRows<T>(sql, params, connection),
    executeSql: (sql: string, params: database.SqlParams) =>
      executeSql(sql, params, connection),
  };
}

export { withTransaction };
