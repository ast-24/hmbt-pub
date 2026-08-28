import { cmn } from "@ast24/hmbt-v5-lib";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeForJson(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, item]) => [
      serializeForJson(key),
      serializeForJson(item),
    ]);
  }

  if (value instanceof cmn.Option) {
    const option = value as cmn.Option<unknown>;
    if (option.isNone()) {
      return { _value: null };
    }
    return { _value: serializeForJson(option.unwrap()) };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeForJson(item));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, item]) => {
      result[key] = serializeForJson(item);
    });
    return result;
  }

  return value;
}

export function decodeOption<T>(
  raw: unknown,
  decodeValue: (value: unknown) => T,
): cmn.Option<T> {
  if (raw instanceof cmn.Option) {
    return raw as cmn.Option<T>;
  }

  if (raw === null || raw === undefined) {
    return cmn.None<T>();
  }

  if (isPlainObject(raw) && "_value" in raw) {
    const rawValue = (raw as { _value: unknown })._value;
    if (rawValue === null || rawValue === undefined) {
      return cmn.None<T>();
    }
    return cmn.Some(decodeValue(rawValue));
  }

  return cmn.Some(decodeValue(raw));
}

export function decodeMap<K, V>(
  raw: unknown,
  decodeKey: (value: unknown) => K,
  decodeValue: (value: unknown) => V,
): Map<K, V> {
  const result = new Map<K, V>();

  if (raw instanceof Map) {
    raw.forEach((value, key) => {
      result.set(decodeKey(key), decodeValue(value));
    });
    return result;
  }

  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) {
        return;
      }
      result.set(decodeKey(entry[0]), decodeValue(entry[1]));
    });
    return result;
  }

  if (isPlainObject(raw)) {
    Object.entries(raw).forEach(([key, value]) => {
      result.set(decodeKey(key), decodeValue(value));
    });
    return result;
  }

  return result;
}

export function decodeTimeOnly(raw: unknown): cmn.time.TimeOnly {
  if (raw instanceof cmn.time.TimeOnly) {
    return raw;
  }

  if (
    isPlainObject(raw) &&
    typeof raw.h === "number" &&
    typeof raw.m === "number"
  ) {
    return cmn.time.TimeOnly.new(raw.h, raw.m);
  }

  if (typeof raw === "string") {
    const m = raw.match(/^(\d{1,2}):(\d{1,2})$/);
    if (m) {
      return cmn.time.TimeOnly.new(
        Number.parseInt(m[1], 10),
        Number.parseInt(m[2], 10),
      );
    }
  }

  throw new Error("Invalid TimeOnly payload");
}

export function decodeTimeWindow(raw: unknown): cmn.time.TimeWindow {
  if (raw instanceof cmn.time.TimeWindow) {
    return raw;
  }

  if (isPlainObject(raw) && "start" in raw && "end" in raw) {
    return cmn.time.TimeWindow.new(
      decodeTimeOnly((raw as { start: unknown }).start),
      decodeTimeOnly((raw as { end: unknown }).end),
    );
  }

  throw new Error("Invalid TimeWindow payload");
}
