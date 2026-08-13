import type { DatabaseSync } from "node:sqlite";

export type SqliteMigration = (database: DatabaseSync) => void;

export function migrateSqlite(
  database: DatabaseSync,
  label: string,
  migrations: readonly SqliteMigration[],
) {
  const current = Number(
    (
      database.prepare("PRAGMA user_version").get() as {
        user_version: number;
      }
    ).user_version,
  );
  if (!Number.isInteger(current) || current < 0)
    throw new Error(`${label} has an invalid schema version`);
  if (current > migrations.length)
    throw new Error(
      `${label} schema version ${current} is newer than supported version ${migrations.length}`,
    );
  for (let index = current; index < migrations.length; index += 1) {
    database.exec("BEGIN IMMEDIATE");
    try {
      migrations[index](database);
      database.exec(`PRAGMA user_version = ${index + 1}`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  return migrations.length;
}
