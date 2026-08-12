import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApiClient } from "../src/index.ts";

const demoToken = "t".repeat(43);
const withDemoSession = (
  handler: (
    url: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof fetch =>
  (async (url, init) =>
    String(url).endsWith("/v1/demo/session")
      ? new Response(
          JSON.stringify({
            token: demoToken,
            expiresAt: "2026-08-13T00:00:00.000Z",
            authentication: false,
          }),
          { status: 201 },
        )
      : handler(url, init)) as typeof fetch;

test("bootstraps an opaque demo session and sends a bearer token", async () => {
  let received: { url?: string; init?: RequestInit } = {};
  const client = createApiClient(
    "http://example.test/",
    withDemoSession(async (url, init) => {
      received = { url: String(url), init };
      return new Response(
        JSON.stringify({
          profileId: "mara",
          decision: "interested",
          mutual: true,
        }),
        { status: 200 },
      );
    }),
  );
  const result = await client.decide("mara", "interested");
  assert.equal(
    received.url,
    "http://example.test/v1/introductions/mara/decision",
  );
  assert.equal(
    new Headers(received.init?.headers).get("authorization"),
    `Bearer ${demoToken}`,
  );
  assert.deepEqual(JSON.parse(String(received.init?.body)), {
    decision: "interested",
  });
  assert.equal(result.mutual, true);
});

test("creates an authenticated account, reuses its token, and signs out", async () => {
  const token = "a".repeat(43);
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const tokenChanges: Array<string | null> = [];
  const client = createApiClient(
    "https://api.example.test",
    (async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/v1/accounts"))
        return new Response(
          JSON.stringify({
            token,
            expiresAt: "2026-08-13T00:00:00.000Z",
            authentication: true,
          }),
          { status: 201 },
        );
      if (String(url).endsWith("/v1/session"))
        return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ complete: false }), { status: 200 });
    }) as typeof fetch,
    { demoSessions: false, onTokenChange: (value) => tokenChanges.push(value) },
  );
  const session = await client.createAccount(
    "person@example.org",
    "a sufficiently long passphrase",
  );
  assert.equal(session.authentication, true);
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    email: "person@example.org",
    password: "a sufficiently long passphrase",
  });
  await client.onboarding();
  assert.equal(
    new Headers(requests[1].init?.headers).get("authorization"),
    `Bearer ${token}`,
  );
  await client.signOut();
  assert.deepEqual(tokenChanges, [token, null]);
  assert.equal(requests[2].init?.method, "DELETE");
});

test("turns API failures into inspectable errors", async () => {
  const client = createApiClient(
    "http://example.test",
    withDemoSession(
      async () =>
        new Response(JSON.stringify({ error: "invalid_message" }), {
          status: 400,
        }),
    ),
  );
  await assert.rejects(
    () => client.sendMessage("connection-mara", ""),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 400 &&
      error.code === "invalid_message",
  );
});

test("shares one bootstrap across concurrent requests and renews after 401", async () => {
  let bootstraps = 0;
  let protectedCalls = 0;
  const client = createApiClient("http://example.test", (async (url) => {
    if (String(url).endsWith("/v1/demo/session")) {
      bootstraps += 1;
      return new Response(
        JSON.stringify({ token: String(bootstraps).repeat(43) }),
        { status: 201 },
      );
    }
    protectedCalls += 1;
    if (protectedCalls === 1)
      return new Response(JSON.stringify({ error: "demo_session_required" }), {
        status: 401,
      });
    return new Response(JSON.stringify({ complete: false }), { status: 200 });
  }) as typeof fetch);

  const [first, second] = await Promise.all([
    client.onboarding(),
    client.onboarding(),
  ]);
  assert.equal(first.complete, false);
  assert.equal(second.complete, false);
  assert.equal(bootstraps, 2);
  assert.equal(protectedCalls, 3);
});

test("updates account visibility with an explicit state", async () => {
  let received: { url?: string; init?: RequestInit } = {};
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (url, init) => {
      received = { url: String(url), init };
      return new Response(JSON.stringify({ status: "hidden" }), {
        status: 200,
      });
    }),
  );
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
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (_url, init) => {
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
    }),
  );
  const receipt = await client.acceptPrototypeConsent();
  assert.deepEqual(body, {
    adultConfirmed: true,
    prototypeDataUseAccepted: true,
  });
  assert.equal(receipt.noticeVersion, "prototype-0.1");
});

test("returns the server-confirmed deletion receipt", async () => {
  let receivedMethod: string | undefined;
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (_url, init) => {
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
    }),
  );
  const receipt = await client.deleteAccountData();
  assert.equal(receivedMethod, "DELETE");
  assert.equal(receipt.deleted, true);
  assert.equal(receipt.mode, "synchronous-local-prototype");
  assert.equal(receipt.applicationBackups, "none");
});

test("updates a reversible meeting-planning preference", async () => {
  let received: { url?: string; body?: unknown } = {};
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (url, init) => {
      received = {
        url: String(url),
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({ meetingPreference: "open_to_plan" }),
        { status: 200 },
      );
    }),
  );
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
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (_url, init) => {
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
    }),
  );
  await client.sendMessage("connection-mara", "See https://example.com", true);
  assert.deepEqual(body, {
    text: "See https://example.com",
    safetyAcknowledged: true,
  });
});
