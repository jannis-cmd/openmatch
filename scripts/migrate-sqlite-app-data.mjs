import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const requireFromApi = createRequire(
  new URL("../services/api/package.json", import.meta.url),
);
const pg = requireFromApi("pg");

const connectionString = process.env.OPENMATCH_POSTGRES_URL;
const directory =
  process.env.OPENMATCH_SQLITE_ACCOUNT_DATA_DIR ??
  "/data/openmatch-account-data";
const apply = process.env.OPENMATCH_MIGRATION_APPLY === "true";
if (!connectionString) throw new Error("Set OPENMATCH_POSTGRES_URL.");
if (!apply)
  throw new Error(
    "Refusing to change PostgreSQL without OPENMATCH_MIGRATION_APPLY=true.",
  );

const tables = [
  ["state", "account_state", ["key", "value"]],
  ["decisions", "account_decisions", ["profile_id", "decision", "created_at"]],
  [
    "connections",
    "account_connections",
    [
      "id",
      "profile_id",
      "created_at",
      "closed_at",
      "muted",
      "meeting_preference",
    ],
  ],
  [
    "messages",
    "account_messages",
    [
      "id",
      "connection_id",
      "sender_id",
      "text",
      "created_at",
      "delivery_event_id",
    ],
  ],
  ["blocks", "account_blocks", ["profile_id", "created_at"]],
  [
    "reports",
    "account_reports",
    ["id", "profile_id", "reason", "details", "status", "created_at"],
  ],
  [
    "report_updates",
    "account_report_updates",
    ["id", "report_id", "kind", "details", "created_at"],
  ],
  [
    "saved_introductions",
    "account_saved_introductions",
    ["profile_id", "created_at"],
  ],
  [
    "preference_observations",
    "account_preference_observations",
    [
      "profile_id",
      "interested",
      "factors_json",
      "selection_probability",
      "created_at",
    ],
  ],
  [
    "processed_account_events",
    "account_processed_account_events",
    ["event_id", "processed_at"],
  ],
  [
    "connection_outcomes",
    "account_connection_outcomes",
    ["connection_id", "kind", "recorded_at"],
  ],
  [
    "data_model_records",
    "account_data_model_records",
    [
      "id",
      "family",
      "subject_id",
      "occurred_at",
      "consent_notice_version",
      "payload_json",
    ],
  ],
];
const deletionOrder = [
  "account_report_updates",
  "account_messages",
  "account_connection_outcomes",
  "account_connections",
  "account_decisions",
  "account_blocks",
  "account_reports",
  "account_saved_introductions",
  "account_preference_observations",
  "account_processed_account_events",
  "account_data_model_records",
  "account_state",
];
const files = readdirSync(directory)
  .filter((name) => /^[0-9a-f-]{36}\.sqlite$/i.test(name))
  .sort();
if (!files.length)
  throw new Error(`No account SQLite files found in ${directory}.`);

const client = new pg.Client({ connectionString });
await client.connect();
const summary = [];
const canonicalRows = (records) =>
  JSON.stringify(
    records.map(({ source, columns, rows }) => ({
      source,
      rows: rows
        .map((row) => columns.map((column) => row[column]))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        ),
    })),
  );
try {
  for (const file of files) {
    const accountId = basename(file, ".sqlite");
    const sourcePath = join(directory, file);
    const sqlite = new DatabaseSync(sourcePath, { readOnly: true });
    const user = await client.query("SELECT 1 FROM auth.users WHERE id=$1", [
      accountId,
    ]);
    if (!user.rowCount)
      throw new Error(
        `SQLite account ${accountId} has no matching auth.users row.`,
      );
    const records = tables.map(([source, target, columns]) => ({
      source,
      target,
      columns,
      rows: sqlite.prepare(`SELECT ${columns.join(",")} FROM ${source}`).all(),
    }));
    sqlite.close();
    const counts = Object.fromEntries(
      records.map(({ source, rows }) => [source, rows.length]),
    );
    const sourceHash = createHash("sha256")
      .update(canonicalRows(records))
      .digest("hex");
    if (!records[0].rows.some((row) => row.key === "profile"))
      throw new Error(`SQLite account ${accountId} has no profile state.`);

    await client.query("BEGIN");
    try {
      for (const target of deletionOrder)
        await client.query(`DELETE FROM app.${target} WHERE account_id=$1`, [
          accountId,
        ]);
      for (const { target, columns, rows } of records) {
        for (const row of rows) {
          const values = columns.map((column) => row[column]);
          const placeholders = values.map((_, index) => `$${index + 2}`);
          await client.query(
            `INSERT INTO app.${target}(account_id,${columns.join(",")}) VALUES ($1,${placeholders.join(",")})`,
            [accountId, ...values],
          );
        }
      }
      const migratedRecords = [];
      for (const { source, target, columns } of records) {
        const result = await client.query(
          `SELECT ${columns.join(",")} FROM app.${target} WHERE account_id=$1`,
          [accountId],
        );
        migratedRecords.push({ source, columns, rows: result.rows });
      }
      const migratedHash = createHash("sha256")
        .update(canonicalRows(migratedRecords))
        .digest("hex");
      if (migratedHash !== sourceHash)
        throw new Error(
          `PostgreSQL verification hash mismatch for account ${accountId}.`,
        );
      await client.query(
        `INSERT INTO app.sqlite_migration_audit(account_id,source_sha256,row_counts,migrated_at)
         VALUES ($1,$2,$3::jsonb,now())
         ON CONFLICT(account_id) DO UPDATE SET
           source_sha256=excluded.source_sha256,
           row_counts=excluded.row_counts,
           migrated_at=excluded.migrated_at`,
        [accountId, sourceHash, JSON.stringify(counts)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    summary.push({
      accountId,
      canonicalSha256: sourceHash,
      verified: true,
      counts,
    });
  }
  for (const table of [
    "account_messages",
    "account_reports",
    "account_report_updates",
  ])
    await client.query(
      `SELECT setval(pg_get_serial_sequence('app.${table}','id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM app.${table}),0)+1,1),false)`,
    );
} finally {
  await client.end();
}

console.log(
  JSON.stringify({ migratedAccounts: summary.length, accounts: summary }),
);
