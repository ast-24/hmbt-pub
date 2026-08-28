export type SqlParam = string | number | boolean | Date | null;

export type SqlParams = SqlParam[];

export type RowData = Record<string, unknown>;

export interface ResultSetHeader {
  affectedRows: number;
  insertId: number;
}

export interface SqlOps {
  selectRows<T extends RowData[]>(sql: string, params: SqlParams): Promise<T>;
  executeSql(sql: string, params: SqlParams): Promise<ResultSetHeader>;
}
