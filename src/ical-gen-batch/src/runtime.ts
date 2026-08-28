import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { database } from "@ast24/hmbt-v5-lib";
import {
  connect,
  type Config,
  type Connection,
  type FullResult,
} from "@tidbcloud/serverless";

type IcalStorageConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

let cachedDbConnection: Connection<Config> | null = null;
let cachedSqlOps: database.SqlOps | null = null;
let cachedStorageConfig: IcalStorageConfig | null = null;
let cachedS3Client: S3Client | null = null;

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requireEnv(name: string): string {
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

function resolveIcalStorageConfig(): IcalStorageConfig {
  if (cachedStorageConfig) {
    return cachedStorageConfig;
  }

  cachedStorageConfig = {
    endpoint: requireEnv("ICAL_R2_ENDPOINT"),
    accessKeyId: requireEnv("ICAL_R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("ICAL_R2_SECRET_ACCESS_KEY"),
    bucketName: requireEnv("ICAL_R2_BUCKET_NAME"),
  };

  return cachedStorageConfig;
}

function getS3Client(config: IcalStorageConfig): S3Client {
  if (cachedS3Client) {
    return cachedS3Client;
  }

  cachedS3Client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedS3Client;
}

function isNotFoundS3Error(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeName =
    "name" in error && typeof (error as { name?: unknown }).name === "string"
      ? (error as { name: string }).name
      : "";
  if (maybeName === "NoSuchKey" || maybeName === "NotFound") {
    return true;
  }

  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } })
    .$metadata;
  return metadata?.httpStatusCode === 404;
}

async function readS3BodyAsString(body: unknown): Promise<string> {
  if (!body) {
    return "";
  }

  if (typeof body === "string") {
    return body;
  }

  if (
    typeof body === "object" &&
    "transformToString" in body &&
    typeof (body as { transformToString?: unknown }).transformToString ===
      "function"
  ) {
    return (
      body as { transformToString: (encoding?: string) => Promise<string> }
    ).transformToString("utf-8");
  }

  throw new Error("Unsupported S3 body type");
}

export async function uploadIcalObject(
  objectKey: string,
  body: string,
): Promise<void> {
  const config = resolveIcalStorageConfig();
  const client = getS3Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      Body: body,
      ContentType: "text/calendar; charset=utf-8",
      CacheControl: "public, max-age=60",
    }),
  );
}

export async function loadIcalObject(
  objectKey: string,
): Promise<string | null> {
  const config = resolveIcalStorageConfig();
  const client = getS3Client(config);

  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
      }),
    );

    return readS3BodyAsString(result.Body);
  } catch (error) {
    if (isNotFoundS3Error(error)) {
      return null;
    }
    throw error;
  }
}
