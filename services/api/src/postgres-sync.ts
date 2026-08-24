import { Worker } from "node:worker_threads";

type QueryResult =
  | { ok: true; rows: unknown[]; rowCount: number }
  | { ok: false; error: string };

const RESPONSE_BYTES = 16 * 1024 * 1024;
const WAIT_TIMEOUT_MS = 30_000;
const UPSERT_TABLES = new Set([
  "state",
  "saved_introductions",
  "decisions",
  "preference_observations",
  "connection_outcomes",
]);
const BASE_TABLES = new Set([
  ...UPSERT_TABLES,
  "connections",
  "processed_account_events",
  "blocks",
]);

const waitFor = (buffer: SharedArrayBuffer) => {
  const control = new Int32Array(buffer, 0, 2);
  const result = Atomics.wait(control, 0, 0, WAIT_TIMEOUT_MS);
  if (result === "timed-out")
    throw new Error("PostgreSQL synchronous bridge timed out");
  const length = Atomics.load(control, 1);
  const payload = new TextDecoder().decode(new Uint8Array(buffer, 8, length));
  return JSON.parse(payload) as QueryResult | { ok: true };
};

const parameterize = (sql: string) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
};

const quoteCamelCaseAliases = (sql: string) =>
  sql.replace(/\bAS\s+([a-z]+[A-Z][A-Za-z0-9]*)/g, 'AS "$1"');

const rewriteInsert = (sql: string) => {
  const ignored = sql.match(
    /^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+([a-z_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)([\s\S]*)$/i,
  );
  if (ignored && BASE_TABLES.has(ignored[1].toLowerCase()))
    return `INSERT INTO app.account_${ignored[1]}(account_id,${ignored[2]}) VALUES (app.current_account_id(),${ignored[3]}) ON CONFLICT DO NOTHING`;

  const upsert = sql.match(
    /^\s*INSERT\s+INTO\s+([a-z_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s+ON\s+CONFLICT\s*\(([^)]+)\)([\s\S]*)$/i,
  );
  if (!upsert || !UPSERT_TABLES.has(upsert[1].toLowerCase())) return sql;
  return `INSERT INTO app.account_${upsert[1]}(account_id,${upsert[2]}) VALUES (app.current_account_id(),${upsert[3]}) ON CONFLICT(account_id,${upsert[4]})${upsert[5]}`;
};

export const translatePostgresSql = (sql: string) => {
  const withoutSqliteTransaction = sql
    .replace(/^\s*BEGIN\s+IMMEDIATE\s*;?\s*$/i, "BEGIN")
    .replace(/^\s*PRAGMA[^;]*;?\s*$/i, "");
  return parameterize(
    quoteCamelCaseAliases(rewriteInsert(withoutSqliteTransaction)),
  );
};

export type DatabaseRunResult = { changes: number; lastInsertRowid: number };
export type DatabaseStatement = {
  all: (...parameters: unknown[]) => unknown[];
  get: (...parameters: unknown[]) => unknown;
  run: (...parameters: unknown[]) => DatabaseRunResult;
};
export type ApplicationDatabase = {
  exec(sql: string): void;
  prepare(sql: string): DatabaseStatement;
  close(): void;
};

export class PostgresDatabaseSync implements ApplicationDatabase {
  private readonly worker: Worker;

  constructor(connectionString: string, accountId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(accountId))
      throw new Error(
        "PostgreSQL application stores require an opaque UUID account ID",
      );
    const ready = new SharedArrayBuffer(64 * 1024);
    this.worker = new Worker(
      new URL("./postgres-sync-worker.js", import.meta.url),
      {
        workerData: { connectionString, accountId, ready },
      },
    );
    const result = waitFor(ready);
    if (!result.ok) {
      void this.worker.terminate();
      throw new Error(`PostgreSQL connection failed: ${result.error}`);
    }
  }

  private query(
    sql: string,
    parameters: unknown[] = [],
  ): { rows: unknown[]; rowCount: number } {
    if (!sql.trim()) return { rows: [], rowCount: 0 };
    const response = new SharedArrayBuffer(RESPONSE_BYTES);
    this.worker.postMessage({
      sql: translatePostgresSql(sql),
      parameters,
      response,
    });
    const result = waitFor(response);
    if (!result.ok) throw new Error(`PostgreSQL query failed: ${result.error}`);
    if (!("rows" in result))
      throw new Error("PostgreSQL worker returned an invalid query response");
    return result;
  }

  exec(sql: string) {
    this.query(sql);
  }

  prepare(sql: string): DatabaseStatement {
    return {
      all: (...parameters) => this.query(sql, parameters).rows,
      get: (...parameters) => this.query(sql, parameters).rows[0],
      run: (...parameters) => {
        let statement = sql;
        if (
          /^\s*INSERT\s+INTO\s+(messages|reports|report_updates)\b/i.test(sql)
        )
          statement += " RETURNING id";
        const result = this.query(statement, parameters);
        const first = result.rows[0] as { id?: number } | undefined;
        return {
          changes: result.rowCount,
          lastInsertRowid: Number(first?.id ?? 0),
        };
      },
    };
  }

  close() {
    void this.worker.terminate();
  }
}
