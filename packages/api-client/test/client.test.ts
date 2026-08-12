import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApiClient } from "../src/index.ts";

test("sends the explicit demo session and JSON body", async () => {
  let received: { url?: string; init?: RequestInit } = {};
  const client = createApiClient("http://example.test/", async (url, init) => {
    received = { url: String(url), init };
    return new Response(
      JSON.stringify({
        profileId: "mara",
        decision: "interested",
        mutual: true,
      }),
      { status: 200 },
    );
  });
  const result = await client.decide("mara", "interested");
  assert.equal(
    received.url,
    "http://example.test/v1/introductions/mara/decision",
  );
  assert.equal(
    new Headers(received.init?.headers).get("x-demo-session"),
    "openmatch-local-demo",
  );
  assert.deepEqual(JSON.parse(String(received.init?.body)), {
    decision: "interested",
  });
  assert.equal(result.mutual, true);
});

test("turns API failures into inspectable errors", async () => {
  const client = createApiClient(
    "http://example.test",
    async () =>
      new Response(JSON.stringify({ error: "invalid_message" }), {
        status: 400,
      }),
  );
  await assert.rejects(
    () => client.sendMessage("connection-mara", ""),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 400 &&
      error.code === "invalid_message",
  );
});

test("updates account visibility with an explicit state", async () => {
  let received: { url?: string; init?: RequestInit } = {};
  const client = createApiClient("http://example.test", async (url, init) => {
    received = { url: String(url), init };
    return new Response(JSON.stringify({ status: "hidden" }), { status: 200 });
  });
  const result = await client.updateAccountStatus("hidden");
  assert.equal(received.url, "http://example.test/v1/account/status");
  assert.equal(received.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(received.init?.body)), {
    status: "hidden",
  });
  assert.equal(result.status, "hidden");
});
