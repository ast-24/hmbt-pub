import { cmn, knowledge, models } from "@ast24/hmbt-v5-lib";

const TARGET_GRADES = [1, 2, 3] as const;
const TIMETABLE_PERIOD_COUNT = 7;

const BASE_HEADERS = [
  "date.mon",
  "date.day",
  "event_hs",
  "change",
  "cafe",
  "study_room",
] as const;

const TIMETABLE_HEADERS = TARGET_GRADES.flatMap((grade) =>
  Array.from(
    { length: TIMETABLE_PERIOD_COUNT },
    (_value, index) => `grade${grade}_timetable_${index + 1}`,
  ),
);

const EXPECTED_HEADERS = [...BASE_HEADERS, ...TIMETABLE_HEADERS];
const EXPECTED_COLUMN_COUNT = EXPECTED_HEADERS.length;

type TargetGrade = (typeof TARGET_GRADES)[number];

type GradeTimetableCells = Record<TargetGrade, string[]>;

type ParsedCsvRow = {
  month: number;
  day: number;
  eventHs: string;
  change: string;
  cafe: boolean;
  studyRoom: boolean;
  gradeTimetables: GradeTimetableCells;
};

export type ImportedCsvDay = {
  dayOfMonth: number;
  day: models.schedule.OriginalMonSkdDay;
};

export type ImportedCsvMonth = {
  month: number;
  days: ImportedCsvDay[];
};

export function buildDaysByMonthFromOldParserCsv(
  csvText: string,
): ImportedCsvMonth[] {
  const parsedRows = parseParsedCsvRows(csvText);
  const rowsByMonth = new Map<number, ParsedCsvRow[]>();

  parsedRows.forEach((row) => {
    const values = rowsByMonth.get(row.month);
    if (values) {
      values.push(row);
      return;
    }
    rowsByMonth.set(row.month, [row]);
  });

  return Array.from(rowsByMonth.keys())
    .sort((a, b) => a - b)
    .map((month) => {
      const targetRows = rowsByMonth.get(month) ?? [];
      const sortedRows = [...targetRows].sort((a, b) => a.day - b.day);
      const seenDays = new Set<number>();

      const days = sortedRows.map((row) => {
        if (seenDays.has(row.day)) {
          throw new Error(
            `CSV内で${month}月${row.day}日のデータが重複しています。`,
          );
        }
        seenDays.add(row.day);

        return {
          dayOfMonth: row.day,
          day: rowToOriginalDay(row),
        };
      });

      return {
        month,
        days,
      };
    });
}

export function buildDaysFromOldParserCsv(
  csvText: string,
  targetMonth: number,
): ImportedCsvDay[] {
  if (!Number.isInteger(targetMonth) || targetMonth < 1 || targetMonth > 12) {
    throw new Error("対象月が不正です。1から12の範囲で指定してください。");
  }

  const parsedMonths = buildDaysByMonthFromOldParserCsv(csvText);
  const target = parsedMonths.find((entry) => entry.month === targetMonth);

  if (!target) {
    const months = parsedMonths.map((entry) => entry.month);
    throw new Error(
      `CSV内に対象月(${targetMonth}月)のデータがありません。含まれている月: ${months.join(", ")}月`,
    );
  }

  return target.days;
}

function parseParsedCsvRows(csvText: string): ParsedCsvRow[] {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    throw new Error("CSVにデータ行がありません。");
  }

  const resolvedRows = resolveDataRows(rows);
  if (resolvedRows.rows.length === 0) {
    throw new Error("CSVにデータ行がありません。");
  }

  return resolvedRows.rows.map((row, index) =>
    parseCsvRow(row, resolvedRows.startLineNumber + index),
  );
}

function resolveDataRows(rows: string[][]): {
  rows: string[][];
  startLineNumber: number;
} {
  const firstRow = rows[0].map((cell) => cell.trim());
  const hasHeader = isExpectedHeaderRow(firstRow);

  if (hasHeader) {
    return {
      rows: rows.slice(1),
      startLineNumber: 2,
    };
  }

  return {
    rows,
    startLineNumber: 1,
  };
}

function isExpectedHeaderRow(headerRow: string[]): boolean {
  if (headerRow.length !== EXPECTED_COLUMN_COUNT) {
    return false;
  }

  for (let index = 0; index < EXPECTED_HEADERS.length; index += 1) {
    if (headerRow[index] !== EXPECTED_HEADERS[index]) {
      return false;
    }
  }

  return true;
}

function parseCsvRows(csvText: string): string[][] {
  const text = csvText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    if (char === "\r") {
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new Error("CSVの引用符が閉じられていません。");
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function parseCsvRow(rawRow: string[], lineNumber: number): ParsedCsvRow {
  if (rawRow.length !== EXPECTED_COLUMN_COUNT) {
    throw new Error(
      `CSV ${lineNumber}行目の列数が不正です。${EXPECTED_COLUMN_COUNT}列必要ですが、${rawRow.length}列でした。`,
    );
  }

  const month = parseIntegerCell(rawRow[0], "month", lineNumber);
  const day = parseIntegerCell(rawRow[1], "day", lineNumber);

  if (month < 1 || month > 12) {
    throw new Error(
      `CSV ${lineNumber}行目: month は1から12で指定してください。`,
    );
  }
  if (day < 1 || day > 31) {
    throw new Error(`CSV ${lineNumber}行目: day は1から31で指定してください。`);
  }

  const gradeTimetables = {} as GradeTimetableCells;
  let offset = BASE_HEADERS.length;
  TARGET_GRADES.forEach((grade) => {
    gradeTimetables[grade] = rawRow.slice(
      offset,
      offset + TIMETABLE_PERIOD_COUNT,
    );
    offset += TIMETABLE_PERIOD_COUNT;
  });

  return {
    month,
    day,
    eventHs: rawRow[2],
    change: rawRow[3],
    cafe: parseBooleanCell(rawRow[4], "cafe", lineNumber),
    studyRoom: parseBooleanCell(rawRow[5], "study_room", lineNumber),
    gradeTimetables,
  };
}

function parseIntegerCell(
  raw: string,
  label: string,
  lineNumber: number,
): number {
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(value)) {
    throw new Error(
      `CSV ${lineNumber}行目: ${label} は整数で指定してください。`,
    );
  }
  return value;
}

function parseBooleanCell(
  raw: string,
  label: string,
  lineNumber: number,
): boolean {
  const normalized = raw.trim().toUpperCase();
  if (
    normalized === "TRUE" ||
    normalized === "1" ||
    normalized === "〇" ||
    normalized === "○"
  ) {
    return true;
  }
  if (
    normalized === "FALSE" ||
    normalized === "0" ||
    normalized === "✕" ||
    normalized === "×" ||
    normalized === "X"
  ) {
    return false;
  }
  throw new Error(
    `CSV ${lineNumber}行目: ${label} は TRUE/FALSE で指定してください。`,
  );
}

function rowToOriginalDay(
  row: ParsedCsvRow,
): models.schedule.OriginalMonSkdDay {
  const day = createEmptyOriginalDay();
  day.shortened = parseShortened(row.change);
  day.events = collectUniqueLines([row.eventHs]);
  day.cafeteria_open = cmn.Some(row.cafe);
  day.study_hall_open = cmn.Some(row.studyRoom);

  TARGET_GRADES.forEach((grade) => {
    day.sess_by_grade[grade] = parseTimetableCells(row.gradeTimetables[grade]);
  });

  return day;
}

function createEmptyOriginalDay(): models.schedule.OriginalMonSkdDay {
  const sessByGrade: models.schedule.OriginalMonSkdSessByGrade[] = [];
  for (let grade = 0; grade <= 12; grade += 1) {
    sessByGrade[grade] = [];
  }

  return {
    sess_by_grade: sessByGrade,
    start_time: cmn.None<cmn.time.TimeOnly>(),
    shortened: {
      type: "unknown",
      afternoon_start_period: cmn.None<number>(),
    },
    events: [],
    cafeteria_open: cmn.None<boolean>(),
    study_hall_open: cmn.None<boolean>(),
  };
}

function parseTimetableCells(
  cells: string[],
): models.schedule.OriginalMonSkdSessByGrade {
  let lastNonEmptyPeriod = 0;

  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index].trim().length > 0) {
      lastNonEmptyPeriod = index + 1;
    }
  }

  if (lastNonEmptyPeriod === 0) {
    return [];
  }

  const sessions: models.schedule.OriginalMonSkdSess[] = [];
  for (let index = 0; index < lastNonEmptyPeriod; index += 1) {
    sessions.push(parseTimetableCell(cells[index]));
  }

  return sessions;
}

function parseTimetableCell(raw: string): models.schedule.OriginalMonSkdSess {
  const text = raw.trim();
  if (text.length === 0) {
    return {
      type: "special",
      name: "",
      room: cmn.None<knowledge.room.RoomID>(),
    };
  }

  const normalized = text.replace(/\s+/g, "");
  const match = normalized.match(/^([月火水木金])([1-7])$/u);
  if (match) {
    const dayOfWeek = parseDayOfWeek(match[1]);
    const period = parsePeriod(match[2]);
    if (dayOfWeek !== null && period !== null) {
      return {
        type: "normal",
        timetable_position: {
          dayofweek: dayOfWeek,
          period,
        },
      };
    }
  }

  return {
    type: "special",
    name: text,
    room: cmn.None<knowledge.room.RoomID>(),
  };
}

function parseDayOfWeek(token: string): cmn.time.DayOfWeek | null {
  switch (token) {
    case "日":
      return 0;
    case "月":
      return 1;
    case "火":
      return 2;
    case "水":
      return 3;
    case "木":
      return 4;
    case "金":
      return 5;
    case "土":
      return 6;
    default:
      return null;
  }
}

function parsePeriod(token: string): number | null {
  switch (token) {
    case "1":
    case "①":
      return 1;
    case "2":
    case "②":
      return 2;
    case "3":
    case "③":
      return 3;
    case "4":
    case "④":
      return 4;
    case "5":
    case "⑤":
      return 5;
    case "6":
    case "⑥":
      return 6;
    case "7":
    case "⑦":
      return 7;
    default:
      return null;
  }
}

function parseShortened(
  change: string,
): models.schedule.OriginalMonSkdShortened {
  const tokens = collectUniqueLines([change]);
  if (tokens.length === 0) {
    return {
      type: "common",
      bell_schedule: knowledge.bell_skd.CommonBellSkd.Normal,
    };
  }

  let bell: knowledge.bell_skd.CommonBellSkd | null = null;
  for (const token of tokens) {
    const parsed = parseChangeToken(token);
    if (parsed === null) {
      return {
        type: "unknown",
        afternoon_start_period: cmn.None<number>(),
      };
    }

    if (bell === null) {
      bell = parsed;
      continue;
    }

    if (bell !== parsed) {
      return {
        type: "unknown",
        afternoon_start_period: cmn.None<number>(),
      };
    }
  }

  return {
    type: "common",
    bell_schedule: bell ?? knowledge.bell_skd.CommonBellSkd.Normal,
  };
}

function parseChangeToken(
  token: string,
): knowledge.bell_skd.CommonBellSkd | null {
  const normalized = token.replace(/\s+/g, "").replace(/^短縮/u, "");
  const upper = normalized.toUpperCase();

  if (
    normalized.length === 0 ||
    normalized === "通常" ||
    normalized === "平常" ||
    normalized === "通常時程" ||
    upper === "NORMAL"
  ) {
    return knowledge.bell_skd.CommonBellSkd.Normal;
  }

  if (upper === "A" || normalized === "A時程") {
    return knowledge.bell_skd.CommonBellSkd.ShortenedA;
  }

  if (upper === "B" || normalized === "B時程") {
    return knowledge.bell_skd.CommonBellSkd.ShortenedB;
  }

  if (upper === "C" || normalized === "C時程") {
    return knowledge.bell_skd.CommonBellSkd.ShortenedC;
  }

  return null;
}

function collectUniqueLines(values: string[]): string[] {
  const uniq = new Set<string>();

  values.forEach((value) => {
    value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .forEach((line) => {
        uniq.add(line);
      });
  });

  return Array.from(uniq.values());
}
