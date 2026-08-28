#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function usage() {
  console.log(`Usage:
  node convert.mjs [options]
  bash convert.sh [options]

Options:
  --table <name>           DynamoDB table name (default: i5system_ddb_lineUsrs)
  --region <region>        AWS region (default: $AWS_REGION or ap-northeast-1)
  --target-table <name>    Target TiDB table (default: verified_as_student_in_v4_oidc_line)
  --email-prefix <prefix>  School mail local-part prefix (default: y15274)
  --email-domain <domain>  School mail domain (default: edu.city.yokohama.jp)
  --min-stnum <num>        Minimum stNum to accept (default: 1)
  --max-stnum <num>        Maximum stNum to accept (default: 238)
  --output <path>          Output SQL path (default: stdout)
  -h, --help               Show this help

Behavior:
  - Scan all items from DynamoDB table (with pagination)
  - Keep only users with auth=true and valid usrId/stNum
  - Convert each user to:
      INSERT INTO verified_as_student_in_v4_oidc_line (sub, linked_email)
  - linked_email format:
      <email-prefix><stNum padded 3 digits>@<email-domain>`);
}

function die(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function requireCommand(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    die(`Required command not found: ${command}`);
  }
}

function parseArgs(argv) {
  const config = {
    tableName: "i5system_ddb_lineUsrs",
    targetTable: "verified_as_student_in_v4_oidc_line",
    region: process.env.AWS_REGION || "ap-northeast-1",
    emailPrefix: "y15274",
    emailDomain: "edu.city.yokohama.jp",
    minStnum: "1",
    maxStnum: "238",
    outputPath: "-",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      die(`Unknown argument: ${arg}`);
    }

    const value = argv[i + 1];
    if (typeof value === "undefined") {
      die(`${arg} requires a value`);
    }

    switch (arg) {
      case "--table":
        config.tableName = value;
        break;
      case "--region":
        config.region = value;
        break;
      case "--target-table":
        config.targetTable = value;
        break;
      case "--email-prefix":
        config.emailPrefix = value;
        break;
      case "--email-domain":
        config.emailDomain = value;
        break;
      case "--min-stnum":
        config.minStnum = value;
        break;
      case "--max-stnum":
        config.maxStnum = value;
        break;
      case "--output":
        config.outputPath = value;
        break;
      default:
        die(`Unknown argument: ${arg}`);
    }

    i += 1;
  }

  if (!/^\d+$/.test(config.minStnum)) {
    die("--min-stnum must be integer");
  }
  if (!/^\d+$/.test(config.maxStnum)) {
    die("--max-stnum must be integer");
  }

  const minStnum = Number(config.minStnum);
  const maxStnum = Number(config.maxStnum);
  if (minStnum > maxStnum) {
    die("--min-stnum must be <= --max-stnum");
  }

  return {
    ...config,
    minStnum,
    maxStnum,
  };
}

function runAwsScan(tableName, region, nextKey) {
  const args = [
    "dynamodb",
    "scan",
    "--table-name",
    tableName,
    "--region",
    region,
    "--output",
    "json",
  ];

  if (nextKey) {
    args.push("--exclusive-start-key", JSON.stringify(nextKey));
  }

  const result = spawnSync("aws", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) {
    die(`Failed to execute aws: ${result.error.message}`);
  }
  if (result.status !== 0) {
    die((result.stderr || result.stdout || "aws command failed").trim());
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    die(`Failed to parse aws output as JSON: ${error.message}`);
  }
}

function escapeSql(value) {
  return value.replace(/'/g, "''");
}

function formatLinkedEmail(prefix, domain, stNum) {
  return `${prefix}${String(stNum).padStart(3, "0")}@${domain}`;
}

function buildRows(items, config) {
  const bySub = new Map();

  for (const item of items) {
    const sub = item?.usrId?.S || "";
    const auth = item?.auth?.BOOL === true;
    const stNumRaw = item?.stNum?.N || "";

    if (!auth || sub.length === 0 || stNumRaw.length === 0) {
      continue;
    }

    const stNum = Number(stNumRaw);
    if (!Number.isFinite(stNum)) {
      continue;
    }
    if (stNum < config.minStnum || stNum > config.maxStnum) {
      continue;
    }

    if (!bySub.has(sub)) {
      bySub.set(sub, {
        sub,
        linkedEmail: formatLinkedEmail(
          config.emailPrefix,
          config.emailDomain,
          stNum,
        ),
      });
    }
  }

  return [...bySub.values()].sort((a, b) => a.sub.localeCompare(b.sub));
}

function buildSql(rows, targetTable, generatedAt) {
  if (rows.length === 0) {
    return `-- generated_at: ${generatedAt}\n-- no verified LINE users found in source table`;
  }

  const values = rows
    .map(
      ({ sub, linkedEmail }) =>
        `  ('${escapeSql(sub)}', '${escapeSql(linkedEmail)}')`,
    )
    .join(",\n");

  return [
    `-- generated_at: ${generatedAt}`,
    `-- source_count: ${rows.length}`,
    "BEGIN;",
    `INSERT INTO ${targetTable} (sub, linked_email)`,
    "VALUES",
    values,
    "ON DUPLICATE KEY UPDATE linked_email = VALUES(linked_email);",
    "COMMIT;",
  ].join("\n");
}

function main() {
  const config = parseArgs(process.argv.slice(2));

  requireCommand("aws");

  const allItems = [];
  let nextKey = null;

  while (true) {
    const scan = runAwsScan(config.tableName, config.region, nextKey);
    if (Array.isArray(scan.Items)) {
      allItems.push(...scan.Items);
    }

    nextKey = scan.LastEvaluatedKey || null;
    if (!nextKey) {
      break;
    }
  }

  const rows = buildRows(allItems, config);
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const sql = buildSql(rows, config.targetTable, generatedAt);

  if (config.outputPath === "-") {
    process.stdout.write(`${sql}\n`);
  } else {
    writeFileSync(config.outputPath, `${sql}\n`, "utf8");
    console.error(`Wrote SQL: ${config.outputPath}`);
  }

  console.error(`Matched verified LINE users: ${rows.length}`);
}

main();
