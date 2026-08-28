import { connect } from "@tidbcloud/serverless";
import { cmn, dto, knowledge } from "@ast24/hmbt-v5-lib";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
};

type Env = {
  DATABASE_URL?: string;
  DATABASE_HOST?: string;
  DATABASE_PORT?: string;
  DATABASE_USER?: string;
  DATABASE_PASSWORD?: string;
  DATABASE_NAME?: string;
};

type Args = {
  apply: boolean;
  limit: number | null;
};

function parseArgs(argv: string[]): Args {
  let apply = false;
  let limit: number | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (key === "--apply") {
      apply = true;
      continue;
    }
    if (key === "--dry-run") {
      apply = false;
      continue;
    }
    if (key === "--limit" && value) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = parsed;
      }
      i += 1;
      continue;
    }
  }

  return { apply, limit };
}

function requiredEnv(env: Env, key: keyof Env): string {
  const value = typeof env[key] === "string" ? env[key].trim() : "";
  if (!value) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value;
}

function parseDatabasePort(raw: string | undefined): number {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return 0;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDbConfig(env: Env): {
  url?: string;
  host?: string;
  username?: string;
  password?: string;
  database?: string;
} {
  const url =
    typeof env.DATABASE_URL === "string" ? env.DATABASE_URL.trim() : "";
  if (url) {
    return { url };
  }

  const hostBase = requiredEnv(env, "DATABASE_HOST");
  const port = parseDatabasePort(env.DATABASE_PORT);
  const host = port > 0 ? `${hostBase}:${port}` : hostBase;
  return {
    host,
    username: requiredEnv(env, "DATABASE_USER"),
    password:
      typeof env.DATABASE_PASSWORD === "string" ? env.DATABASE_PASSWORD : "",
    database: requiredEnv(env, "DATABASE_NAME"),
  };
}

function buildDefaultNextTrainWidget(): dto.web_home_widget.WebHomeWidgetWithParam {
  return {
    type: dto.web_home_widget.WebHomeWidgetType.NextTrain,
    param: {
      mode: "switch",
      switch_time: cmn.time.TimeOnly.new(12, 0),
      before_ids: [
        knowledge.train_timetable.TrainTimetableID
          .JrTsurumiLine_Tsurumi_TsurumiOno,
      ],
      after_ids: [
        knowledge.train_timetable.TrainTimetableID
          .JrTsurumiLine_TsurumiOno_Tsurumi,
        knowledge.train_timetable.TrainTimetableID
          .JrKeihinTohoku_Tsurumi_Yokohama,
        knowledge.train_timetable.TrainTimetableID.JrKeihinTohoku_Tsurumi_Tokyo,
      ],
      show_count: 3,
      time_format: "in_minutes",
    },
  } satisfies dto.web_home_widget.WebHomeWidgetWithParam;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureWebUiConfigShape(raw: unknown): {
  theme: unknown;
  widgets: unknown[];
} {
  if (!isPlainObject(raw)) {
    return { theme: "system", widgets: [] };
  }
  const widgets = Array.isArray(raw.widgets) ? raw.widgets : [];
  return { theme: raw.theme, widgets };
}

function hasNextTrainWidget(widgets: unknown[]): boolean {
  return widgets.some((widget) => {
    if (!isPlainObject(widget)) {
      return false;
    }
    return widget.type === dto.web_home_widget.WebHomeWidgetType.NextTrain;
  });
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = getDbConfig(process.env as Env);
  const conn = connect(config);

  const rows = (await conn.execute(
    "SELECT user_id, settings FROM users_ui_settings",
    [],
    { fullResult: true },
  )) as { rows?: Array<{ user_id: string; settings: unknown }> };

  const items = Array.isArray(rows.rows) ? rows.rows : [];
  if (items.length === 0) {
    console.log("No users_ui_settings rows found.");
    return;
  }

  const widget = buildDefaultNextTrainWidget();

  let updated = 0;
  let skipped = 0;
  let unsafeSkipped = 0;
  let wouldUpdate = 0;
  const limitedItems = args.limit !== null ? items.slice(0, args.limit) : items;

  for (const item of limitedItems) {
    const userId = item.user_id;
    let settings: unknown = item.settings;
    if (typeof settings === "string") {
      try {
        settings = JSON.parse(settings) as unknown;
      } catch {
        unsafeSkipped += 1;
        continue;
      }
    }

    if (!isPlainObject(settings)) {
      unsafeSkipped += 1;
      continue;
    }

    const shape = ensureWebUiConfigShape(settings);
    const widgets = Array.isArray(shape.widgets) ? shape.widgets : [];

    if (hasNextTrainWidget(widgets)) {
      skipped += 1;
      continue;
    }

    const nextWidgets = [
      widget,
      ...widgets,
    ] as dto.web_home_widget.WebHomeWidgetWithParam[];
    const nextSettings = {
      ...settings,
      theme:
        shape.theme === "light" ||
        shape.theme === "dark" ||
        shape.theme === "system"
          ? shape.theme
          : "system",
      show_ui_settings_button:
        settings.show_ui_settings_button === false ? false : true,
      widgets: nextWidgets,
    } satisfies dto.user_config.UserConfigWebUI;

    if (!args.apply) {
      wouldUpdate += 1;
      continue;
    }

    await conn.execute(
      "UPDATE users_ui_settings SET settings = CAST(? AS JSON), updated_at = CURRENT_TIMESTAMP(3) WHERE user_id = ?",
      [JSON.stringify(nextSettings), userId],
      { fullResult: true },
    );
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? "apply" : "dry-run",
        total: items.length,
        processed: limitedItems.length,
        updated,
        would_update: wouldUpdate,
        skipped,
        unsafe_skipped: unsafeSkipped,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
