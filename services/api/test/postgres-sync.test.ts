import assert from "node:assert/strict";
import test from "node:test";
import { translatePostgresSql } from "../src/postgres-sync.ts";

test("translates account-scoped SQLite upserts to PostgreSQL", () => {
  assert.equal(
    translatePostgresSql(
      "INSERT INTO state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ),
    "INSERT INTO app.account_state(account_id,key,value) VALUES (app.current_account_id(),$1,$2) ON CONFLICT(account_id,key) DO UPDATE SET value=excluded.value",
  );
  assert.equal(
    translatePostgresSql(
      "INSERT OR IGNORE INTO connections(id,profile_id,created_at) VALUES (?,?,?)",
    ),
    "INSERT INTO app.account_connections(account_id,id,profile_id,created_at) VALUES (app.current_account_id(),$1,$2,$3) ON CONFLICT DO NOTHING",
  );
});

test("preserves API field names and PostgreSQL transactions", () => {
  assert.equal(translatePostgresSql("BEGIN IMMEDIATE"), "BEGIN");
  assert.equal(
    translatePostgresSql(
      "SELECT profile_id AS profileId,created_at AS createdAt FROM decisions WHERE profile_id=?",
    ),
    'SELECT profile_id AS "profileId",created_at AS "createdAt" FROM decisions WHERE profile_id=$1',
  );
});
