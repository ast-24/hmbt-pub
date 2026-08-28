import * as cmn from "../cmn";

export type DatabaseValueErrorReason =
  | "invalid_date_value"
  | "invalid_time_string"
  | "unsupported_time_value";

export class DatabaseValueError extends Error {
  public readonly reason: DatabaseValueErrorReason;

  public constructor(reason: DatabaseValueErrorReason, message: string) {
    super(message);
    this.name = "DatabaseValueError";
    this.reason = reason;
  }
}

export function toOption<T>(value: T | null | undefined): cmn.Option<T> {
  if (value === null || value === undefined) {
    return cmn.None<T>();
  }
  return cmn.Some(value);
}

export function fromOption<T>(value: cmn.Option<T>): T | null {
  return value.isSome() ? value.unwrap() : null;
}

export function dateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(input: unknown): string {
  if (input instanceof Date) {
    return dateKey(input);
  }
  if (typeof input === "string") {
    return input.slice(0, 10);
  }
  throw new DatabaseValueError(
    "invalid_date_value",
    "Invalid date value from database",
  );
}

export function dateAtUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addUtcDays(date: Date, days: number): Date {
  const base = dateAtUtcMidnight(date);
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}

export function parseTimeOnly(value: unknown): cmn.Option<cmn.time.TimeOnly> {
  if (value === null || value === undefined) {
    return cmn.None();
  }

  if (value instanceof Date) {
    return cmn.Some(
      cmn.time.TimeOnly.new(value.getUTCHours(), value.getUTCMinutes()),
    );
  }

  if (typeof value === "string") {
    const m = value.match(/^(\d{1,2}):(\d{1,2})/);
    if (!m) {
      throw new DatabaseValueError(
        "invalid_time_string",
        "Invalid time string from database",
      );
    }
    return cmn.Some(
      cmn.time.TimeOnly.new(
        Number.parseInt(m[1], 10),
        Number.parseInt(m[2], 10),
      ),
    );
  }

  throw new DatabaseValueError(
    "unsupported_time_value",
    "Unsupported time value from database",
  );
}

export function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

export function asDirection(
  value: unknown,
  fallback: "horizontal" | "vertical",
): "horizontal" | "vertical" {
  if (value === "horizontal" || value === "vertical") {
    return value;
  }
  return fallback;
}
