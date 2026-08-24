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
  await client.query("SET search_path TO app,public");
  await client.query("SELECT set_config('openmatch.account_id',$1,false)", [
    input.accountId,
  ]);
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
parentPort?.on("message", (message: QueryMessage) => {
  queue = queue.then(async () => {
    try {
      const result = await client.query(message.sql, message.parameters);
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
