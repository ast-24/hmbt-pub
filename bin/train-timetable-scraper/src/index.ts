import { knowledge, models } from "@ast24/hmbt-v5-lib";

type Args = {
  url: string;
  timetableId: string;
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--url" && value) {
      args.url = value;
      i += 1;
      continue;
    }
    if ((key === "--timetable-id" || key === "--id") && value) {
      args.timetableId = value;
      i += 1;
      continue;
    }
  }

  if (!args.url || !args.timetableId) {
    throw new Error(
      'Usage: --url "https://transit.yahoo.co.jp/timetable/..." --timetable-id <TrainTimetableID>',
    );
  }

  return { url: args.url, timetableId: args.timetableId };
}

function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!/^https:\/\/transit\.yahoo\.co\.jp\/timetable\//.test(trimmed)) {
    throw new Error(`Unexpected timetable URL: ${trimmed}`);
  }
  return trimmed.replace(/\?.*$/, "").replace(/\/+$/, "");
}

function parseHourMapFromNextData(
  html: string,
): models.train_timetable.TrainTimetableHourMap | null {
  const scriptMatch = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!scriptMatch) {
    return null;
  }

  let root: unknown;
  try {
    root = JSON.parse(scriptMatch[1]) as unknown;
  } catch {
    return null;
  }

  const stack: unknown[] = [root];
  const visited = new Set<object>();
  let rows: unknown[] | null = null;

  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object") {
      continue;
    }

    if (visited.has(value)) {
      continue;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        stack.push(item);
      }
      continue;
    }

    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.timeTableByHour)) {
      rows = obj.timeTableByHour;
      break;
    }

    for (const nested of Object.values(obj)) {
      stack.push(nested);
    }
  }

  if (!rows) {
    return null;
  }

  const hourMap: models.train_timetable.TrainTimetableHourMap = {};
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const rawHour = (row as { hour?: unknown }).hour;
    const hour = Number.parseInt(String(rawHour), 10);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      continue;
    }

    const minTable = (row as { minTimeTable?: unknown }).minTimeTable;
    const minutes: number[] = [];

    if (Array.isArray(minTable)) {
      for (const item of minTable) {
        if (!item || typeof item !== "object") {
          continue;
        }
        const rawMinute = (item as { minute?: unknown }).minute;
        const minute = Number.parseInt(String(rawMinute), 10);
        if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
          continue;
        }
        minutes.push(minute);
      }
    }

    minutes.sort((a, b) => a - b);
    hourMap[String(hour)] = minutes;
  }

  return Object.keys(hourMap).length > 0 ? hourMap : null;
}

function parseHourMapFromYahooHtml(
  html: string,
): models.train_timetable.TrainTimetableHourMap {
  // New Yahoo Transit pages expose the timetable in __NEXT_DATA__.
  const nextDataParsed = parseHourMapFromNextData(html);
  if (nextDataParsed) {
    return nextDataParsed;
  }

  // Fallback for legacy markup.
  const hourMap: models.train_timetable.TrainTimetableHourMap = {};
  const rows = html.split('<tr id="hh_').slice(1);

  for (const row of rows) {
    const hourMatch = row.match(/^(\d{1,2})"/);
    if (!hourMatch) {
      continue;
    }
    const hour = Number.parseInt(hourMatch[1], 10);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      continue;
    }

    const minutes: number[] = [];
    const dtMatches = row.matchAll(/<dt[^>]*>(\d{1,2})<\/dt>/g);
    for (const match of dtMatches) {
      const minute = Number.parseInt(match[1], 10);
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
        continue;
      }
      minutes.push(minute);
    }

    minutes.sort((a, b) => a - b);
    hourMap[String(hour)] = minutes;
  }

  return hourMap;
}

async function fetchYahooTimetableHtml(
  baseUrl: string,
  kind: number,
): Promise<string> {
  const url = new URL(baseUrl);
  url.searchParams.set("kind", String(kind));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "user-agent": "hmbt-v5 train-timetable scraper",
      accept: "text/html",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url.toString()} (${response.status})`);
  }
  return await response.text();
}

function sqlEscapeString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.url);

  const timetableId = args.timetableId;
  if (
    !(
      Object.values(knowledge.train_timetable.TrainTimetableID) as string[]
    ).includes(timetableId)
  ) {
    throw new Error(`Unknown TrainTimetableID: ${timetableId}`);
  }

  const [weekdayHtml, saturdayHtml, holidayHtml] = await Promise.all([
    fetchYahooTimetableHtml(baseUrl, 1),
    fetchYahooTimetableHtml(baseUrl, 2),
    fetchYahooTimetableHtml(baseUrl, 4),
  ]);

  const payload: models.train_timetable.TrainTimetablePayload = {
    weekday: parseHourMapFromYahooHtml(weekdayHtml),
    saturday: parseHourMapFromYahooHtml(saturdayHtml),
    holiday: parseHourMapFromYahooHtml(holidayHtml),
  };

  const json = JSON.stringify(payload);
  const sql = `
INSERT INTO train_timetables (timetable_id, payload_json)
VALUES ('${sqlEscapeString(timetableId)}', CAST('${sqlEscapeString(json)}' AS JSON))
ON DUPLICATE KEY UPDATE
  payload_json = VALUES(payload_json),
  updated_at = CURRENT_TIMESTAMP(3);
`.trim();

  console.log(sql);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exitCode = 1;
});
