export type IcalDateValue =
  | {
      type: "all_day";
      date: Date;
    }
  | {
      type: "timed";
      date: Date;
      tzid: string;
    };

export interface IcalEventInput {
  uid: string;
  x_hmbt_key?: string | null;
  start: IcalDateValue;
  end: IcalDateValue;
  summary: string;
  description?: string | null;
  location?: string | null;
}

export interface BuildIcalOptions {
  prodId?: string;
  timezone?: string;
  generatedAt?: Date;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatUtcTimestamp(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    "T",
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
    "Z",
  ].join("");
}

function formatDate(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join("");
}

function formatLocalDateTime(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    "T",
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
  ].join("");
}

export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string): string[] {
  const limit = 74;
  if (line.length <= limit) {
    return [line];
  }

  const folded: string[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const part = line.slice(cursor, cursor + limit);
    if (cursor === 0) {
      folded.push(part);
    } else {
      folded.push(` ${part}`);
    }
    cursor += limit;
  }
  return folded;
}

function pushProperty(lines: string[], key: string, rawValue: string): void {
  const escaped = escapeIcalText(rawValue);
  foldLine(`${key}:${escaped}`).forEach((line) => lines.push(line));
}

function pushDateValue(
  lines: string[],
  key: string,
  value: IcalDateValue,
): void {
  if (value.type === "all_day") {
    lines.push(`${key};VALUE=DATE:${formatDate(value.date)}`);
    return;
  }

  lines.push(`${key};TZID=${value.tzid}:${formatLocalDateTime(value.date)}`);
}

export function applyIcalTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{([^{}]+)\}/g, (_matched, rawKey: string) => {
    const key = rawKey.trim();
    const value = values[key];
    return value ?? "";
  });
}

export function buildIcalText(
  calendarName: string,
  events: IcalEventInput[],
  options?: BuildIcalOptions,
): string {
  const generatedAt = options?.generatedAt ?? new Date();
  const prodId = options?.prodId ?? "-//ast24//hmbt-v5//JA";
  const timezone = options?.timezone ?? "Asia/Tokyo";

  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`PRODID:${prodId}`);
  pushProperty(lines, "X-WR-CALNAME", calendarName);
  pushProperty(lines, "X-WR-TIMEZONE", timezone);

  const orderedEvents = [...events].sort((a, b) => {
    const aTs = a.start.date.getTime();
    const bTs = b.start.date.getTime();
    if (aTs !== bTs) {
      return aTs - bTs;
    }
    return a.uid.localeCompare(b.uid);
  });

  orderedEvents.forEach((event) => {
    lines.push("BEGIN:VEVENT");
    pushProperty(lines, "UID", event.uid);
    if (typeof event.x_hmbt_key === "string" && event.x_hmbt_key.length > 0) {
      pushProperty(lines, "X-HMBT-KEY", event.x_hmbt_key);
    }
    lines.push(`DTSTAMP:${formatUtcTimestamp(generatedAt)}`);
    pushDateValue(lines, "DTSTART", event.start);
    pushDateValue(lines, "DTEND", event.end);
    pushProperty(lines, "SUMMARY", event.summary);

    if (typeof event.description === "string" && event.description.length > 0) {
      pushProperty(lines, "DESCRIPTION", event.description);
    }
    if (typeof event.location === "string" && event.location.length > 0) {
      pushProperty(lines, "LOCATION", event.location);
    }

    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
