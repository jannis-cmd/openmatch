import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { migrateSqlite } from "../src/migrations.ts";

test("records successful versions and rolls a failed migration back", () => {
  const database = new DatabaseSync(":memory:");
  assert.throws(
    () =>
      migrateSqlite(database, "test data", [
        (db) => db.exec("CREATE TABLE example (id INTEGER PRIMARY KEY)"),
        (db) => {
          db.exec("ALTER TABLE example ADD COLUMN label TEXT");
          throw new Error("simulated migration failure");
        },
      ]),
    /simulated migration failure/,
  );
  assert.equal(
    (
      database.prepare("PRAGMA user_version").get() as {
        user_version: number;
      }
    ).user_version,
    1,
  );
  assert.deepEqual(
    (
      database.prepare("PRAGMA table_info(example)").all() as Array<{
        name: string;
      }>
    ).map(({ name }) => name),
    ["id"],
  );
  database.close();
});

test("refuses to open a schema created by newer code", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA user_version = 2");
  assert.throws(
    () => migrateSqlite(database, "test data", [() => undefined]),
    /newer than supported version 1/,
  );
  database.close();
});
