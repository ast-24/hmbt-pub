import { randomUUID } from "node:crypto";

import { api } from "@ast24/hmbt-v5-lib";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { loadRuntimeEnv } from "./env";
import { APIError } from "./errors";

const MAX_UPLOAD_IMAGE_BYTES = 30 * 1024 * 1024;
const LINE_ORIGINAL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const LINE_PREVIEW_IMAGE_MAX_BYTES = 1 * 1024 * 1024;
const PREVIEW_MAX_EDGE_PX = 1280;

const JPEG_QUALITY_START = 90;
const JPEG_QUALITY_MIN = 52;
const JPEG_QUALITY_STEP = 6;
const MAX_JPEG_FIT_ATTEMPTS = 7;

type DecodedImage = {
  bytes: Uint8Array;
  contentType: string;
};

type LineImageAsset = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
};

type UploadedCafeMenuImage = {
  imageUrl: string;
  previewImageUrl: string;
};

type R2UploadConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  baseBucketUrl: string;
};

type ImageSize = {
  width: number;
  height: number;
};

let cachedS3Client: S3Client | null = null;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizePublicBaseUrl(value: string): string {
  const trimmed = trimTrailingSlash(value.trim());
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function asApiInvalidRequestError(
  message: string,
  userMessage: string,
): APIError {
  return new APIError({
    status: 400,
    code: api.errors.CommonApiErrorCode.InvalidRequest,
    message,
    user_message: userMessage,
  });
}

function decodeImageDataUrl(imageDataUrl: string): DecodedImage {
  const raw = imageDataUrl.trim();
  const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    throw asApiInvalidRequestError(
      "image_data_url must be a valid data URL",
      "画像データの形式が不正です。",
    );
  }

  const contentType = match[1].toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw asApiInvalidRequestError(
      `Unsupported content type: ${contentType}`,
      "画像ファイルを指定してください。",
    );
  }

  const normalizedBase64 = match[2].replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+=*$/.test(normalizedBase64)) {
    throw asApiInvalidRequestError(
      "image_data_url contains invalid base64 payload",
      "画像データの形式が不正です。",
    );
  }

  const bytes = Buffer.from(normalizedBase64, "base64");
  if (bytes.length === 0) {
    throw asApiInvalidRequestError(
      "Decoded image is empty",
      "画像データが空です。",
    );
  }

  if (bytes.length > MAX_UPLOAD_IMAGE_BYTES) {
    throw asApiInvalidRequestError(
      `Image size exceeds ${MAX_UPLOAD_IMAGE_BYTES} bytes`,
      "画像サイズが大きすぎます。30MB以下の画像を使用してください。",
    );
  }

  return {
    bytes,
    contentType,
  };
}

async function readImageSize(bytes: Uint8Array): Promise<ImageSize> {
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.width <= 0 || metadata.height <= 0) {
      throw new Error("Invalid image dimensions");
    }
    return {
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    throw asApiInvalidRequestError(
      error instanceof Error
        ? `Failed to read image metadata: ${error.message}`
        : "Failed to read image metadata",
      "画像を読み取れませんでした。一般的な画像形式で再試行してください。",
    );
  }
}

function scaledDimensions(size: ImageSize, percent: number): ImageSize {
  return {
    width: Math.max(1, Math.floor((size.width * percent) / 100)),
    height: Math.max(1, Math.floor((size.height * percent) / 100)),
  };
}

function limitMaxEdge(size: ImageSize, maxEdgePx: number): ImageSize {
  const currentMaxEdge = Math.max(size.width, size.height);
  if (currentMaxEdge <= maxEdgePx) {
    return size;
  }

  const percent = Math.max(1, Math.floor((maxEdgePx / currentMaxEdge) * 100));
  return scaledDimensions(size, percent);
}

async function encodePngLineAsset(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<LineImageAsset> {
  const transformed = await sharp(bytes)
    .resize({
      width,
      height,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  return {
    bytes: new Uint8Array(transformed),
    contentType: "image/png",
    extension: "png",
  };
}

async function encodeJpegLineAsset(
  bytes: Uint8Array,
  width: number,
  height: number,
  quality: number,
): Promise<LineImageAsset> {
  const transformed = await sharp(bytes)
    .resize({
      width,
      height,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: true,
    })
    .jpeg({ quality })
    .toBuffer();

  return {
    bytes: new Uint8Array(transformed),
    contentType: "image/jpeg",
    extension: "jpg",
  };
}

async function buildOriginalLineImage(
  image: DecodedImage,
): Promise<LineImageAsset> {
  const size = await readImageSize(image.bytes);
  if (image.contentType === "image/png") {
    const pngCandidate = await encodePngLineAsset(
      image.bytes,
      size.width,
      size.height,
    );
    if (pngCandidate.bytes.length <= LINE_ORIGINAL_IMAGE_MAX_BYTES) {
      return pngCandidate;
    }
  }

  let currentSize = { ...size };
  let quality = JPEG_QUALITY_START;

  for (let attempt = 0; attempt < MAX_JPEG_FIT_ATTEMPTS; attempt += 1) {
    const candidate = await encodeJpegLineAsset(
      image.bytes,
      currentSize.width,
      currentSize.height,
      quality,
    );
    if (candidate.bytes.length <= LINE_ORIGINAL_IMAGE_MAX_BYTES) {
      return candidate;
    }

    const nextScaleFactor = Math.max(
      0.1,
      Math.min(
        0.95,
        Math.sqrt(LINE_ORIGINAL_IMAGE_MAX_BYTES / candidate.bytes.length) *
          0.92,
      ),
    );

    currentSize = {
      width: Math.max(1, Math.floor(currentSize.width * nextScaleFactor)),
      height: Math.max(1, Math.floor(currentSize.height * nextScaleFactor)),
    };
    quality = Math.max(JPEG_QUALITY_MIN, quality - JPEG_QUALITY_STEP);
  }

  throw asApiInvalidRequestError(
    `Failed to fit original image within ${LINE_ORIGINAL_IMAGE_MAX_BYTES} bytes`,
    "画像をLINE送信用(10MB以下)に変換できませんでした。解像度を下げて再試行してください。",
  );
}

async function buildPreviewLineImage(
  image: DecodedImage,
): Promise<LineImageAsset> {
  const size = limitMaxEdge(
    await readImageSize(image.bytes),
    PREVIEW_MAX_EDGE_PX,
  );
  let currentSize = { ...size };
  let quality = JPEG_QUALITY_START;

  for (let attempt = 0; attempt < MAX_JPEG_FIT_ATTEMPTS; attempt += 1) {
    const candidate = await encodeJpegLineAsset(
      image.bytes,
      currentSize.width,
      currentSize.height,
      quality,
    );
    if (candidate.bytes.length <= LINE_PREVIEW_IMAGE_MAX_BYTES) {
      return candidate;
    }

    const nextScaleFactor = Math.max(
      0.1,
      Math.min(
        0.95,
        Math.sqrt(LINE_PREVIEW_IMAGE_MAX_BYTES / candidate.bytes.length) * 0.9,
      ),
    );

    currentSize = limitMaxEdge(
      {
        width: Math.max(1, Math.floor(currentSize.width * nextScaleFactor)),
        height: Math.max(1, Math.floor(currentSize.height * nextScaleFactor)),
      },
      PREVIEW_MAX_EDGE_PX,
    );
    quality = Math.max(JPEG_QUALITY_MIN, quality - JPEG_QUALITY_STEP);
  }

  throw asApiInvalidRequestError(
    `Failed to fit preview image within ${LINE_PREVIEW_IMAGE_MAX_BYTES} bytes`,
    "プレビュー画像をLINE送信用(1MB以下)に変換できませんでした。解像度を下げて再試行してください。",
  );
}

async function prepareLineImages(
  imageDataUrl: string,
): Promise<{ original: LineImageAsset; preview: LineImageAsset }> {
  const decoded = decodeImageDataUrl(imageDataUrl);
  const startedAt = Date.now();
  const [original, preview] = await Promise.all([
    buildOriginalLineImage(decoded),
    buildPreviewLineImage(decoded),
  ]);

  console.info("Cafe menu image conversion completed", {
    input_bytes: decoded.bytes.length,
    original_bytes: original.bytes.length,
    preview_bytes: preview.bytes.length,
    duration_ms: Date.now() - startedAt,
  });

  return {
    original,
    preview,
  };
}

function resolveR2UploadConfig(): R2UploadConfig {
  const env = loadRuntimeEnv();
  if (
    !env.cafe_menu_r2_endpoint ||
    !env.cafe_menu_r2_access_key_id ||
    !env.cafe_menu_r2_secret_access_key ||
    !env.cafe_menu_r2_bucket_name ||
    !env.cafe_menu_r2_base_bucket_url
  ) {
    throw new APIError({
      status: 503,
      code: api.errors.CommonApiErrorCode.ServiceUnavailable,
      message:
        "R2 upload configuration is incomplete. Set CAFE_MENU_R2_ENDPOINT, CAFE_MENU_R2_ACCESS_KEY_ID, CAFE_MENU_R2_SECRET_ACCESS_KEY, CAFE_MENU_R2_BUCKET_NAME and CAFE_MENU_R2_BASE_BUCKET_URL.",
      user_message:
        "画像アップロード機能の設定が未完了です。管理者に連絡してください。",
    });
  }

  return {
    endpoint: env.cafe_menu_r2_endpoint,
    accessKeyId: env.cafe_menu_r2_access_key_id,
    secretAccessKey: env.cafe_menu_r2_secret_access_key,
    bucketName: env.cafe_menu_r2_bucket_name,
    baseBucketUrl: normalizePublicBaseUrl(env.cafe_menu_r2_base_bucket_url),
  };
}

function getS3Client(config: R2UploadConfig): S3Client {
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

function toDateKey(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function uploadCafeMenuImageToR2(
  imageDataUrl: string,
  startDate: Date,
  rangeDays: number,
): Promise<UploadedCafeMenuImage> {
  const config = resolveR2UploadConfig();

  let lineImages: { original: LineImageAsset; preview: LineImageAsset };
  try {
    lineImages = await prepareLineImages(imageDataUrl);
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    throw asApiInvalidRequestError(
      error instanceof Error
        ? `Failed to convert image: ${error.message}`
        : "Failed to convert image",
      "画像変換に失敗しました。別の画像で再試行してください。",
    );
  }

  const startDateKey = toDateKey(startDate);
  const objectBase = `cafemenu/${startDateKey}/${startDateKey}-${rangeDays}d-${Date.now()}-${randomUUID()}`;
  const originalKey = `${objectBase}-orig.${lineImages.original.extension}`;
  const previewKey = `${objectBase}-preview.${lineImages.preview.extension}`;

  try {
    const client = getS3Client(config);
    await Promise.all([
      client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: originalKey,
          Body: lineImages.original.bytes,
          ContentType: lineImages.original.contentType,
          CacheControl: "public, max-age=604800",
        }),
      ),
      client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: previewKey,
          Body: lineImages.preview.bytes,
          ContentType: lineImages.preview.contentType,
          CacheControl: "public, max-age=604800",
        }),
      ),
    ]);
  } catch (error) {
    throw new APIError({
      status: 503,
      code: api.errors.CommonApiErrorCode.ServiceUnavailable,
      message:
        error instanceof Error
          ? `Failed to upload cafe menu image: ${error.message}`
          : "Failed to upload cafe menu image",
      user_message:
        "画像アップロードに失敗しました。時間をおいて再試行してください。",
    });
  }

  return {
    imageUrl: `${config.baseBucketUrl}/${originalKey}`,
    previewImageUrl: `${config.baseBucketUrl}/${previewKey}`,
  };
}
