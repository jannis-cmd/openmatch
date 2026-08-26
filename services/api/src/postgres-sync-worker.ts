import { parentPort, workerData } from "node:worker_threads";
import pg from "pg";

type WorkerInput = {
  connectionString: string;
  accountId: string;
  ready: SharedArrayBuffer;
};
type QueryMessage = {
  sql: string;
  parameters: unknown[];
  response: SharedArrayBuffer;
};

const input = workerData as WorkerInput;
const readyControl = new Int32Array(input.ready, 0, 2);
const readyBytes = new Uint8Array(input.ready, 8);

const finish = (
  buffer: SharedArrayBuffer,
  payload:
    | { ok: true; rows: unknown[]; rowCount: number }
    | { ok: false; error: string },
) => {
  const control = new Int32Array(buffer, 0, 2);
  const bytes = new Uint8Array(buffer, 8);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  if (encoded.length > bytes.length) {
    const fallback = new TextEncoder().encode(
      JSON.stringify({
        ok: false,
        error: "PostgreSQL response exceeded the synchronous bridge limit",
      }),
    );
    bytes.set(fallback);
    Atomics.store(control, 1, fallback.length);
  } else {
    bytes.set(encoded);
    Atomics.store(control, 1, encoded.length);
  }
  Atomics.store(control, 0, 1);
  Atomics.notify(control, 0);
};

const client = new pg.Client({ connectionString: input.connectionString });
try {
  pg.types.setTypeParser(20, (value) => Number(value));
  await client.connect();
  const encoded = new TextEncoder().encode(JSON.stringify({ ok: true }));
  readyBytes.set(encoded);
  Atomics.store(readyControl, 1, encoded.length);
  Atomics.store(readyControl, 0, 1);
  Atomics.notify(readyControl, 0);
} catch (error) {
  const encoded = new TextEncoder().encode(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  readyBytes.set(encoded);
  Atomics.store(readyControl, 1, encoded.length);
  Atomics.store(readyControl, 0, 1);
  Atomics.notify(readyControl, 0);
  parentPort?.close();
}

let queue = Promise.resolve();
let transactionOpen = false;

const setLocalAccountScope = async () => {
  await client.query("SET LOCAL search_path TO app,public");
  await client.query("SELECT set_config('openmatch.account_id',$1,true)", [
    input.accountId,
  ]);
};

parentPort?.on("message", (message: QueryMessage) => {
  queue = queue.then(async () => {
    try {
      const command = message.sql.trim().replace(/;$/, "").toUpperCase();
      let result: pg.QueryResult;
      if (command === "BEGIN") {
        result = await client.query(message.sql, message.parameters);
        try {
          await setLocalAccountScope();
          transactionOpen = true;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      } else if (command === "COMMIT" || command === "ROLLBACK") {
        result = await client.query(message.sql, message.parameters);
        transactionOpen = false;
      } else if (transactionOpen) {
        result = await client.query(message.sql, message.parameters);
      } else {
        await client.query("BEGIN");
        try {
          await setLocalAccountScope();
          result = await client.query(message.sql, message.parameters);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
      finish(message.response, {
        ok: true,
        rows: result.rows ?? [],
        rowCount: result.rowCount ?? 0,
      });
    } catch (error) {
      finish(message.response, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
});
