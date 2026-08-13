import assert from "node:assert/strict";
import test from "node:test";
import {
  PENDING_MESSAGE_ATTEMPTS_KEY,
  clearPendingMessageAttempts,
  parsePendingMessageAttempts,
  persistPendingMessageAttempts,
  restorePendingMessageAttempts,
} from "./pending-message-attempts.mjs";

const requestId = "b4aca909-c73f-44f8-8b15-bc812155bf16";

test("round-trips the exact text and retry identity in tab storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const attempts = { connection: { text: "Still the same", requestId } };
  persistPendingMessageAttempts(storage, attempts);
  assert.deepEqual(restorePendingMessageAttempts(storage), attempts);
  clearPendingMessageAttempts(storage);
  assert.equal(values.has(PENDING_MESSAGE_ATTEMPTS_KEY), false);
});

test("rejects malformed or oversized stored fields", () => {
  assert.deepEqual(parsePendingMessageAttempts("not json"), {});
  assert.deepEqual(
    parsePendingMessageAttempts(
      JSON.stringify({
        valid: { text: "keep", requestId },
        badUuid: { text: "drop", requestId: "predictable" },
        tooLong: { text: "x".repeat(1_001), requestId },
      }),
    ),
    { valid: { text: "keep", requestId } },
  );
});
