import { api, knowledge } from "@ast24/hmbt-v5-lib";
import { type Context } from "hono";

import { APIError } from "../errors";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireParam(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value) {
    throw new APIError({
      status: 400,
      code: api.errors.CommonApiErrorCode.MissingPathParameter,
      message: `Missing path parameter: ${name}`,
      user_message: "リクエストURLが不正です。",
    });
  }
  return value;
}

export function parseBooleanQuery(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return value === "1" || value.toLowerCase() === "true";
}

export function parseDatePath(c: Context): Date {
  const year = Number.parseInt(requireParam(c, "year"), 10);
  const month = Number.parseInt(requireParam(c, "month"), 10);
  const day = Number.parseInt(requireParam(c, "day"), 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new APIError({
      status: 400,
      code: api.errors.CommonApiErrorCode.InvalidRequest,
      message: "Invalid date path parameters",
      user_message: "指定された日付が不正です。",
    });
  }

  return new Date(Date.UTC(year, month - 1, day));
}

export function parseYearMonthPath(c: Context): {
  year: number;
  month: number;
} {
  const year = Number.parseInt(requireParam(c, "year"), 10);
  const month = Number.parseInt(requireParam(c, "month"), 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new APIError({
      status: 400,
      code: api.errors.CommonApiErrorCode.InvalidRequest,
      message: "Invalid year/month path parameters",
      user_message: "指定された年月が不正です。",
    });
  }

  return {
    year,
    month,
  };
}

export function parseRangeDays(c: Context): number {
  const raw = c.req.query("range_days");
  if (!raw) {
    return 1;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new APIError({
      status: 400,
      code: api.errors.CommonApiErrorCode.InvalidRequest,
      message: "range_days must be a positive integer",
      user_message: "表示範囲の指定が不正です。",
    });
  }

  return Math.min(parsed, 31);
}

export function parsePeriod(c: Context): number {
  const value = Number.parseInt(requireParam(c, "period"), 10);
  if (!Number.isFinite(value) || value < 1 || value > 31) {
    throw new APIError({
      status: 400,
      code: api.errors.CommonApiErrorCode.InvalidRequest,
      message: "Invalid period path parameter",
      user_message: "時限の指定が不正です。",
    });
  }
  return value;
}

export async function readJsonBody<T>(c: Context): Promise<T> {
  try {
    const raw = await c.req.json();
    if (!isPlainObject(raw)) {
      throw new APIError({
        status: 400,
        code: api.errors.CommonApiErrorCode.InvalidJsonBody,
        message: "JSON request body must be an object",
        user_message: "リクエスト本文の形式が不正です。",
      });
    }
    return raw as T;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError({
      status: 400,
      code: api.errors.CommonApiErrorCode.InvalidJsonBody,
      message: "Invalid JSON request body",
      user_message: "リクエスト本文の形式が不正です。",
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): boolean {
  // 簡易的なメールアドレスのバリデーション
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password: string): boolean {
  return knowledge.auth.isValidPassword(password);
}
