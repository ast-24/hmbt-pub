import * as cmn from "../cmn";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeForJson(value: unknown): unknown {
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
