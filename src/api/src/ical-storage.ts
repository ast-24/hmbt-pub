import { api } from "@ast24/hmbt-v5-lib";
import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { loadRuntimeEnv } from "./env";
import { APIError } from "./errors";

type IcalStorageConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  baseBucketUrl: string;
};

let cachedS3Client: S3Client | null = null;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveIcalStorageConfig(): IcalStorageConfig {
  const env = loadRuntimeEnv({ require_jwt_keys: false });
  if (
    !env.ical_r2_endpoint ||
    !env.ical_r2_access_key_id ||
    !env.ical_r2_secret_access_key ||
    !env.ical_r2_bucket_name ||
    !env.ical_r2_base_bucket_url
  ) {
    throw new APIError({
      status: 503,
      code: api.errors.IcalFeedErrorCode.FeedStorageNotConfigured,
      message:
        "iCal storage configuration is incomplete. Set ICAL_R2_ENDPOINT, ICAL_R2_ACCESS_KEY_ID, ICAL_R2_SECRET_ACCESS_KEY, ICAL_R2_BUCKET_NAME and ICAL_R2_BASE_BUCKET_URL.",
      user_message:
        "iCalストレージの設定が未完了です。管理者に連絡してください。",
    });
  }

  return {
    endpoint: env.ical_r2_endpoint,
    accessKeyId: env.ical_r2_access_key_id,
    secretAccessKey: env.ical_r2_secret_access_key,
    bucketName: env.ical_r2_bucket_name,
    baseBucketUrl: trimTrailingSlash(env.ical_r2_base_bucket_url),
  };
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
): Promise<string> {
  const config = resolveIcalStorageConfig();
  const client = getS3Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      Body: body,
      ContentType: "text/calendar; charset=utf-8",
      CacheControl: "public, max-age=300",
    }),
  );

  return `${config.baseBucketUrl}/${objectKey}`;
}

export async function loadIcalObject(
  objectKey: string,
): Promise<string | null> {
  const config = resolveIcalStorageConfig();
  const client = getS3Client(config);

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
      }),
    );
    return await readS3BodyAsString(response.Body);
  } catch (error) {
    if (isNotFoundS3Error(error)) {
      return null;
    }
    throw error;
  }
}

export async function deleteIcalObject(objectKey: string): Promise<void> {
  const config = resolveIcalStorageConfig();
  const client = getS3Client(config);

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
    }),
  );
}
