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

test("accepts only an explicit versioned prototype consent request", async () => {
  let body: unknown;
  const client = createApiClient("http://example.test", async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        adultConfirmed: true,
        prototypeDataUseAccepted: true,
        noticeVersion: "prototype-0.1",
        acceptedAt: "2026-08-12T12:00:00.000Z",
      }),
      { status: 200 },
    );
  });
  const receipt = await client.acceptPrototypeConsent();
  assert.deepEqual(body, {
    adultConfirmed: true,
    prototypeDataUseAccepted: true,
  });
  assert.equal(receipt.noticeVersion, "prototype-0.1");
});

test("returns the server-confirmed deletion receipt", async () => {
  let receivedMethod: string | undefined;
  const client = createApiClient("http://example.test", async (_url, init) => {
    receivedMethod = init?.method;
    return new Response(
      JSON.stringify({
        deleted: true,
        completedAt: "2026-08-12T12:00:00.000Z",
        mode: "synchronous-local-prototype",
        applicationBackups: "none",
      }),
      { status: 200 },
    );
  });
  const receipt = await client.deleteAccountData();
  assert.equal(receivedMethod, "DELETE");
  assert.equal(receipt.deleted, true);
  assert.equal(receipt.mode, "synchronous-local-prototype");
  assert.equal(receipt.applicationBackups, "none");
});

test("updates a reversible meeting-planning preference", async () => {
  let received: { url?: string; body?: unknown } = {};
  const client = createApiClient("http://example.test", async (url, init) => {
    received = {
      url: String(url),
      body: JSON.parse(String(init?.body)),
    };
    return new Response(JSON.stringify({ meetingPreference: "open_to_plan" }), {
      status: 200,
    });
  });
  const result = await client.updateMeetingPreference(
    "connection-mara",
    "open_to_plan",
  );
  assert.equal(
    received.url,
    "http://example.test/v1/connections/connection-mara/meeting-preference",
  );
  assert.deepEqual(received.body, { meetingPreference: "open_to_plan" });
  assert.equal(result.meetingPreference, "open_to_plan");
});

test("sends message safety acknowledgement only after client confirmation", async () => {
  let body: unknown;
  const client = createApiClient("http://example.test", async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        id: 1,
        connectionId: "connection-mara",
        senderId: "me",
        text: "See https://example.com",
        createdAt: "2026-08-12T12:00:00.000Z",
      }),
      { status: 201 },
    );
  });
  await client.sendMessage("connection-mara", "See https://example.com", true);
  assert.deepEqual(body, {
    text: "See https://example.com",
    safetyAcknowledged: true,
  });
});
