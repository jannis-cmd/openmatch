import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultDatingDataSettings,
  defaultPreferences,
  demoUser,
} from "@openmatch/matching";
import {
  ApiError,
  createApiClient,
  directoryParticipationIsActive,
  securityNotificationDeliveryFallback,
} from "../src/index.ts";

test("failed security-email operations fail closed while exact status is unavailable", () => {
  for (const status of ["failed", "partial"] as const)
    assert.deepEqual(securityNotificationDeliveryFallback(status), {
      state: "retrying",
      pendingCount: 1,
      oldestCreatedAt: null,
      retryAttempts: 0,
      lastAttemptAt: null,
      automaticDiscard: false,
    });
  for (const status of ["sent", "not_configured", "unverified"] as const)
    assert.equal(securityNotificationDeliveryFallback(status), null);
});

test("directory visibility stays active until explicitly paused", () => {
  const now = Date.parse("2026-08-13T12:00:00.000Z");
  assert.equal(
    directoryParticipationIsActive(
      {
        participating: true,
        noticeVersion: "account-directory-prototype-0.2",
        updatedAt: "2026-08-01T00:00:00.000Z",
        availableUntil: "2026-08-14T00:00:00.000Z",
      },
      now,
    ),
    true,
  );
  assert.equal(
    directoryParticipationIsActive(
      {
        participating: true,
        noticeVersion: "account-directory-prototype-0.1",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      now,
    ),
    true,
  );
  assert.equal(
    directoryParticipationIsActive(
      {
        participating: true,
        noticeVersion: "account-directory-prototype-0.2",
        updatedAt: "2026-08-01T00:00:00.000Z",
        availableUntil: "2026-08-13T12:00:00.000Z",
      },
      now,
    ),
    true,
  );
  assert.equal(
    directoryParticipationIsActive({
      participating: false,
      noticeVersion: "account-directory-prototype-0.3",
      updatedAt: "2026-08-13T12:00:00.000Z",
      availableUntil: null,
    }),
    false,
  );
});

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

test("preserves operation and retry metadata from a throttled response", async () => {
  const client = createApiClient(
    "https://api.example.test",
    (async () =>
      new Response(
        JSON.stringify({
          error: "operation_rate_limit_exceeded",
          operation: "message",
        }),
        { status: 429, headers: { "retry-after": "37" } },
      )) as typeof fetch,
    { initialToken: demoToken, demoSessions: false },
  );
  await assert.rejects(
    () => client.sendMessage("connection-mara", "Hello"),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 429);
      assert.equal(error.code, "operation_rate_limit_exceeded");
      assert.equal(error.retryAfterSeconds, 37);
      assert.equal(error.operation, "message");
      return true;
    },
  );
});

test("creates an authenticated account, reuses its token, and signs out", async () => {
  const token = "a".repeat(43);
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const tokenChanges: Array<string | null> = [];
  let invalidations = 0;
  const client = createApiClient(
    "https://api.example.test",
    (async (url, init) => {
      requests.push({ url: String(url), init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
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
    {
      demoSessions: false,
      onTokenChange: (value) => tokenChanges.push(value),
      onSessionInvalidated: () => {
        invalidations += 1;
      },
    },
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
  assert.equal(invalidations, 0);
  assert.equal(requests[2].init?.method, "DELETE");
});

test("keeps a newly registered account signed out until email confirmation", async () => {
  const tokenChanges: Array<string | null> = [];
  const client = createApiClient(
    "https://api.example.test",
    (async () =>
      new Response(
        JSON.stringify({
          authentication: false,
          confirmationRequired: true,
          email: "person@example.org",
        }),
        { status: 202 },
      )) as typeof fetch,
    {
      demoSessions: false,
      onTokenChange: (value) => tokenChanges.push(value),
    },
  );
  const result = await client.createAccount(
    "person@example.org",
    "a sufficiently long password",
  );
  assert.deepEqual(result, {
    authentication: false,
    confirmationRequired: true,
    email: "person@example.org",
  });
  assert.deepEqual(tokenChanges, []);
  await assert.rejects(() => client.profile(), /session_required/);
});

test("changes a passphrase and adopts the rotated session", async () => {
  const oldToken = "o".repeat(43);
  const newToken = "n".repeat(43);
  const tokenChanges: Array<string | null> = [];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createApiClient(
    "https://api.example.test",
    (async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/v1/account/password"))
        return new Response(
          JSON.stringify({
            token: newToken,
            expiresAt: "2026-08-13T00:00:00.000Z",
            authentication: true,
            otherSessionsRevoked: true,
            securityNotification: "sent",
          }),
          { status: 200 },
        );
      return new Response(JSON.stringify({ complete: true }), { status: 200 });
    }) as typeof fetch,
    {
      initialToken: oldToken,
      demoSessions: false,
      onTokenChange: (token) => tokenChanges.push(token),
    },
  );
  const changed = await client.changePassword(
    "the current passphrase",
    "the replacement passphrase",
  );
  assert.equal(changed.otherSessionsRevoked, true);
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    currentPassword: "the current passphrase",
    newPassword: "the replacement passphrase",
  });
  assert.equal(
    new Headers(requests[0].init?.headers).get("authorization"),
    "Bearer " + oldToken,
  );
  await client.onboarding();
  assert.equal(
    new Headers(requests[1].init?.headers).get("authorization"),
    "Bearer " + newToken,
  );
  assert.deepEqual(tokenChanges, [newToken]);
});

test("creates recovery codes and adopts a recovered session", async () => {
  const oldToken = "o".repeat(43);
  const recoveredToken = "r".repeat(43);
  const tokenChanges: Array<string | null> = [];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createApiClient(
    "https://api.example.test",
    (async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/recovery-codes"))
        return new Response(
          JSON.stringify({
            codes: ["1111-2222-3333-4444-5555-6666-7777-8888"],
            createdAt: "2026-08-12T00:00:00.000Z",
            securityNotification: "sent",
          }),
          { status: 201 },
        );
      return new Response(
        JSON.stringify({
          token: recoveredToken,
          expiresAt: "2026-08-13T00:00:00.000Z",
          authentication: true,
          otherSessionsRevoked: true,
          recoveryCodesRevoked: true,
          securityNotification: "sent",
        }),
        { status: 200 },
      );
    }) as typeof fetch,
    {
      initialToken: oldToken,
      demoSessions: false,
      client: "ios",
      onTokenChange: (token) => tokenChanges.push(token),
    },
  );
  const generated = await client.generateRecoveryCodes("current passphrase");
  assert.equal(generated.codes.length, 1);
  assert.equal(
    new Headers(requests[0]?.init?.headers).get("authorization"),
    "Bearer " + oldToken,
  );
  const recovered = await client.recoverAccount(
    "person@example.org",
    generated.codes[0]!,
    "replacement passphrase",
  );
  assert.equal(recovered.recoveryCodesRevoked, true);
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    email: "person@example.org",
    recoveryCode: generated.codes[0],
    newPassword: "replacement passphrase",
    client: "ios",
  });
  assert.deepEqual(tokenChanges, [recoveredToken]);
});

test("reads, requests, and confirms email ownership without exposing a code", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createApiClient(
    "https://api.example.test",
    (async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/request"))
        return new Response(JSON.stringify({ sent: true }), { status: 202 });
      if (String(url).endsWith("/confirm"))
        return new Response(
          JSON.stringify({
            email: "person@example.org",
            verifiedAt: "2026-08-12T12:00:00.000Z",
          }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({
          email: "person@example.org",
          verifiedAt: null,
          deliveryConfigured: true,
        }),
        { status: 200 },
      );
    }) as typeof fetch,
    { initialToken: "v".repeat(43), demoSessions: false },
  );
  assert.equal((await client.emailVerification()).verifiedAt, null);
  assert.equal((await client.requestEmailVerification()).sent, true);
  const confirmed = await client.confirmEmail("12345678");
  assert.ok(confirmed.verifiedAt);
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
    code: "12345678",
  });
  assert.ok(
    requests.every(({ init }) => !String(init?.body).includes("email")),
  );
});

test("manages a separately confirmed backup notification email", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createApiClient(
    "https://api.example.test",
    (async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/request"))
        return new Response(
          JSON.stringify({ sent: true, pendingEmail: "backup@example.org" }),
          { status: 202 },
        );
      if (String(url).endsWith("/confirm"))
        return new Response(
          JSON.stringify({
            primaryEmail: "primary@example.org",
            primaryVerifiedAt: "2026-08-12T00:00:00.000Z",
            email: "backup@example.org",
            verifiedAt: "2026-08-12T01:00:00.000Z",
            pendingEmail: null,
            securityNotification: "sent",
          }),
          { status: 200 },
        );
      if (init?.method === "DELETE")
        return new Response(
          JSON.stringify({
            primaryEmail: "primary@example.org",
            primaryVerifiedAt: "2026-08-12T00:00:00.000Z",
            email: null,
            verifiedAt: null,
            pendingEmail: null,
            securityNotification: "sent",
          }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({
          primaryEmail: "primary@example.org",
          primaryVerifiedAt: "2026-08-12T00:00:00.000Z",
          email: null,
          verifiedAt: null,
          pendingEmail: null,
        }),
        { status: 200 },
      );
    }) as typeof fetch,
    { initialToken: "t".repeat(43), demoSessions: false },
  );
  assert.equal((await client.notificationEmail()).email, null);
  await client.requestNotificationEmail(
    "backup@example.org",
    "current passphrase",
  );
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    email: "backup@example.org",
    currentPassword: "current passphrase",
  });
  assert.equal(
    (await client.confirmNotificationEmail("12345678")).email,
    "backup@example.org",
  );
  assert.equal(
    (await client.removeNotificationEmail("current passphrase")).email,
    null,
  );
  assert.deepEqual(JSON.parse(String(requests[3]?.init?.body)), {
    currentPassword: "current passphrase",
  });
});

test("changes a primary email only through the dual-code flow", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createApiClient(
    "https://api.example.test",
    (async (url, init) => {
      requests.push({ url: String(url), init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(url).endsWith("/request"))
        return new Response(
          JSON.stringify({
            sent: true,
            pendingEmail: "new@example.org",
            expiresAt: "2026-08-14T00:00:00.000Z",
          }),
          { status: 202 },
        );
      if (String(url).endsWith("/confirm"))
        return new Response(
          JSON.stringify({
            email: "new@example.org",
            verifiedAt: "2026-08-13T00:00:00.000Z",
            otherSessionsRevoked: true,
            securityNotification: "sent",
          }),
          { status: 200 },
        );
      return new Response(
        JSON.stringify({
          email: "old@example.org",
          verifiedAt: "2026-08-12T00:00:00.000Z",
          pendingEmail: null,
          pendingExpiresAt: null,
          deliveryConfigured: true,
        }),
        { status: 200 },
      );
    }) as typeof fetch,
    { initialToken: "e".repeat(43), demoSessions: false },
  );
  assert.equal((await client.emailChange()).pendingEmail, null);
  await client.requestEmailChange("new@example.org", "current passphrase");
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    email: "new@example.org",
    currentPassword: "current passphrase",
  });
  const changed = await client.confirmEmailChange("11111111", "22222222");
  assert.equal(changed.otherSessionsRevoked, true);
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
    currentCode: "11111111",
    newCode: "22222222",
  });
  await client.cancelEmailChange();
  assert.equal(requests[3]?.init?.method, "DELETE");
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

test("an expired authenticated session fails closed without entering demo mode", async () => {
  let calls = 0;
  const changes: Array<string | null> = [];
  let invalidations = 0;
  const client = createApiClient(
    "https://api.example.test",
    (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "session_required" }), {
        status: 401,
      });
    }) as typeof fetch,
    {
      initialToken: "x".repeat(43),
      demoSessions: false,
      onTokenChange: (token) => changes.push(token),
      onSessionInvalidated: () => {
        invalidations += 1;
      },
    },
  );
  await assert.rejects(
    () => client.onboarding(),
    (error: unknown) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.code === "session_required",
  );
  assert.equal(calls, 1);
  assert.deepEqual(changes, [null]);
  assert.equal(invalidations, 1);
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

test("submits first-run setup as one versioned command", async () => {
  let received: { url?: string; body?: Record<string, unknown> } = {};
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (url, init) => {
      received = {
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      };
      return new Response(
        JSON.stringify({
          version: "setup-0.1",
          complete: true,
          profile: demoUser,
          preferences: defaultPreferences,
          consent: {
            adultConfirmed: true,
            prototypeDataUseAccepted: true,
            noticeVersion: "prototype-0.1",
            acceptedAt: "2026-08-12T12:00:00.000Z",
          },
          directoryConsent: null,
        }),
        { status: 200 },
      );
    }),
  );
  const receipt = await client.completeSetup(
    { name: demoUser.name },
    defaultPreferences,
    false,
  );
  assert.equal(received.url, "http://example.test/v1/setup");
  assert.deepEqual(received.body, {
    version: "setup-0.1",
    profile: { name: demoUser.name },
    preferences: defaultPreferences,
    adultConfirmed: true,
    prototypeDataUseAccepted: true,
    joinDirectory: false,
  });
  assert.equal(receipt.complete, true);
});

test("previews unsaved preferences with aggregate counts only", async () => {
  let receivedUrl = "";
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (url) => {
      receivedUrl = String(url);
      return new Response(
        JSON.stringify({
          eligibleCount: 2,
          evaluatedCount: 3,
          scope: "current-unresolved-prototype-pool",
          estimate: false,
          preferencesSaved: false,
        }),
        { status: 200 },
      );
    }),
  );
  const preview = await client.previewPreferences({ ageMin: 30 });
  assert.equal(receivedUrl, "http://example.test/v1/preferences/preview");
  assert.deepEqual(preview, {
    eligibleCount: 2,
    evaluatedCount: 3,
    scope: "current-unresolved-prototype-pool",
    estimate: false,
    preferencesSaved: false,
  });
});

test("updates separate reversible account-directory consent", async () => {
  let received: { url?: string; body?: unknown } = {};
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (url, init) => {
      received = {
        url: String(url),
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({
          participating: true,
          noticeVersion: "account-directory-prototype-0.1",
          updatedAt: "2026-08-12T12:00:00.000Z",
        }),
        { status: 200 },
      );
    }),
  );
  const receipt = await client.updateDirectoryConsent(true);
  assert.equal(received.url, "http://example.test/v1/consents/directory");
  assert.deepEqual(received.body, { participating: true });
  assert.equal(receipt.noticeVersion, "account-directory-prototype-0.1");
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

test("reauthenticates permanent account deletion with the current passphrase", async () => {
  let received: { url?: string; method?: string; body?: unknown } = {};
  const client = createApiClient(
    "https://api.example.test",
    (async (url, init) => {
      received = {
        url: String(url),
        method: init?.method,
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({
          deleted: true,
          completedAt: "2026-08-13T12:00:00.000Z",
          credentialsDeleted: true,
          sessionsRevoked: true,
          applicationBackups: "none",
        }),
        { status: 200 },
      );
    }) as typeof fetch,
    { initialToken: demoToken, demoSessions: false },
  );
  const receipt = await client.deleteAccount("the current long passphrase");
  assert.deepEqual(received, {
    url: "https://api.example.test/v1/account",
    method: "DELETE",
    body: { currentPassword: "the current long passphrase" },
  });
  assert.equal(receipt.deleted, true);
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

test("updates one private connection outcome without collapsing stages", async () => {
  let received: { url?: string; body?: unknown } = {};
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (url, init) => {
      received = {
        url: String(url),
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({
          outcomes: [
            {
              kind: "met_in_person",
              recordedAt: "2026-08-13T12:00:00.000Z",
            },
          ],
        }),
        { status: 200 },
      );
    }),
  );
  const result = await client.updateConnectionOutcome(
    "connection-1",
    "met_in_person",
    true,
  );
  assert.equal(
    received.url,
    "http://example.test/v1/connections/connection-1/outcomes/met_in_person",
  );
  assert.deepEqual(received.body, { recorded: true });
  assert.deepEqual(
    result.outcomes.map(({ kind }) => kind),
    ["met_in_person"],
  );
});

test("adds an append-only update to a safety report", async () => {
  let received: { url?: string; body?: unknown } = {};
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (url, init) => {
      received = {
        url: String(url),
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({
          id: 4,
          reportId: 7,
          kind: "correction",
          details: "Corrected context",
          createdAt: "2026-08-12T12:00:00.000Z",
        }),
        { status: 201 },
      );
    }),
  );
  const update = await client.addReportUpdate(
    7,
    "correction",
    "Corrected context",
  );
  assert.equal(received.url, "http://example.test/v1/reports/7/updates");
  assert.deepEqual(received.body, {
    kind: "correction",
    details: "Corrected context",
  });
  assert.equal(update.reportId, 7);
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
  await client.sendMessage(
    "connection-mara",
    "See https://example.com",
    true,
    "75afbb9f-60c8-49be-a8b9-4b3bb2fe6b3f",
  );
  assert.deepEqual(body, {
    text: "See https://example.com",
    safetyAcknowledged: true,
    clientRequestId: "75afbb9f-60c8-49be-a8b9-4b3bb2fe6b3f",
  });
});

test("uses the versioned consent-gated dating data endpoints", async () => {
  const requests: Array<{ path: string; method: string; body: unknown }> = [];
  const settings = defaultDatingDataSettings();
  const client = createApiClient(
    "http://example.test",
    withDemoSession(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ path, method: init?.method ?? "GET", body });
      if (path === "/v1/data-model" && (init?.method ?? "GET") === "GET")
        return new Response(
          JSON.stringify({
            version: settings.version,
            settings,
            fieldPolicies: {},
            prohibitedDerivedScores: [],
            proposedRankingPolicy: {},
          }),
        );
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  await client.datingDataModel();
  await client.replaceDatingDataSettings(settings);
  await client.recordBehaviorEvent({
    id: "00000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-20T12:00:00.000Z",
    candidateId: "mara",
    kind: "interested",
    source: "explicit_action",
    sessionSequence: 1,
    dwellTimeBucket: null,
    viewedPhotoCount: null,
    bioOpened: null,
    selectionProbability: 1,
  });
  await client.recordInteractionFeedback({
    id: "00000000-0000-4000-8000-000000000002",
    connectionId: "connection-mara",
    recordedAt: "2026-08-20T12:00:00.000Z",
    metInPerson: true,
    wantsMoreProfilesLikeThis: null,
    positiveInteraction: true,
    wantedFurtherContact: null,
    unmatchReason: null,
    freeText: "",
  });
  assert.deepEqual(
    requests.map(({ path, method }) => [method, path]),
    [
      ["GET", "/v1/data-model"],
      ["PATCH", "/v1/data-model"],
      ["POST", "/v1/data-model/behavior-events"],
      ["POST", "/v1/data-model/interaction-feedback"],
    ],
  );
});
