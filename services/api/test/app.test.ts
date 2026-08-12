import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  POLITE_CLOSE_MESSAGE,
  nextWeeklyBatchAt,
  publicWeeklySeed,
  type Profile,
} from "@openmatch/matching";
import { createApp } from "../src/app.ts";
import { Store } from "../src/store.ts";

const sessionHeaders = async (base: string) => {
  const response = await fetch(`${base}/v1/demo/session`, { method: "POST" });
  assert.equal(response.status, 201);
  const body = (await response.json()) as {
    token: string;
    expiresAt: string;
    authentication: boolean;
  };
  assert.equal(body.authentication, false);
  assert.ok(body.token.length >= 32);
  assert.ok(Date.parse(body.expiresAt) > Date.now());
  return {
    "content-type": "application/json",
    authorization: `Bearer ${body.token}`,
  };
};

test("account reset is atomic when storage rejects a deletion", () => {
  const store = new Store(":memory:");
  try {
    store.db.exec(`
      INSERT INTO decisions(profile_id,decision,created_at)
      VALUES ('mara','interested','2026-08-12T12:00:00.000Z');
      CREATE TEMP TRIGGER reject_decision_deletion
      BEFORE DELETE ON decisions
      BEGIN
        SELECT RAISE(ABORT, 'simulated storage failure');
      END;
    `);
    assert.throws(() => store.reset(), /simulated storage failure/);
    const decisionCount = store.db
      .prepare("SELECT COUNT(*) AS count FROM decisions")
      .get() as { count: number };
    const stateCount = store.db
      .prepare("SELECT COUNT(*) AS count FROM state")
      .get() as { count: number };
    assert.equal(decisionCount.count, 1);
    assert.equal(stateCount.count, 8);
  } finally {
    store.close();
  }
});

test("the public data inventory covers every current storage and export field", () => {
  const inventory = JSON.parse(
    readFileSync(
      new URL("../../../docs/DATA_INVENTORY.json", import.meta.url),
      "utf8",
    ),
  ) as {
    collections: Array<{
      id: string;
      purpose: string;
      retention: string;
      access: string[];
      fields: string[];
    }>;
  };
  const expected: Record<string, string[]> = {
    demoSessions: ["tokenHash", "expiresAt"],
    profile: [
      "id",
      "name",
      "age",
      "city",
      "distanceKm",
      "pronouns",
      "intent",
      "readiness",
      "bio",
      "prompt",
      "promptAnswer",
      "values[]",
      "lifestyle.smoking",
      "lifestyle.children",
      "lifestyle.schedule",
      "color",
    ],
    preferences: [
      "ageMin",
      "ageMax",
      "idealDistanceKm",
      "maximumDistanceKm",
      "intents[]",
      "smoking",
      "children",
      "weights.proximity",
      "weights.values",
      "weights.lifestyle",
      "weights.schedule",
    ],
    onboarding: ["complete"],
    accountStatus: ["status"],
    deliverySettings: ["batchSize"],
    introductionBatch: [
      "weeklySeed",
      "batchSize",
      "profileId",
      "selectionMode",
      "selectionProbability",
    ],
    consentReceipt: [
      "adultConfirmed",
      "prototypeDataUseAccepted",
      "noticeVersion",
      "acceptedAt",
    ],
    researchConsentReceipt: ["participating", "noticeVersion", "updatedAt"],
    decisions: ["profileId", "decision", "createdAt"],
    preferenceObservations: [
      "profileId",
      "interested",
      "factors.*",
      "selectionProbability",
      "createdAt",
    ],
    connections: [
      "id",
      "profileId",
      "createdAt",
      "closedAt",
      "muted",
      "meetingPreference",
    ],
    savedIntroductions: ["profileId", "createdAt"],
    messages: ["id", "connectionId", "senderId", "text", "createdAt"],
    blocks: ["profileId", "createdAt"],
    reports: ["id", "profileId", "reason", "details", "status", "createdAt"],
    exportMetadata: ["exportedAt"],
  };
  assert.deepEqual(
    inventory.collections.map(({ id }) => id).sort(),
    Object.keys(expected).sort(),
  );
  for (const collection of inventory.collections) {
    assert.ok(
      collection.purpose.length > 20,
      `${collection.id} needs a purpose`,
    );
    assert.ok(collection.retention, `${collection.id} needs retention`);
    assert.ok(collection.access.length, `${collection.id} needs access roles`);
    assert.deepEqual(collection.fields.sort(), expected[collection.id].sort());
  }
});

test("persists profile/preferences, creates a mutual connection, messages, and handles safety actions", async () => {
  const server = createApp({
    store: new Store(":memory:"),
    deployedCommit: null,
    demoSessionsEnabled: true,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const headers = await sessionHeaders(base);
  const request = (path: string, init: RequestInit = {}) =>
    fetch(base + path, { ...init, headers: { ...headers, ...init.headers } });
  try {
    assert.equal(
      (
        (await (await request("/v1/onboarding")).json()) as {
          complete: boolean;
        }
      ).complete,
      false,
    );
    assert.deepEqual(await (await request("/v1/transparency/version")).json(), {
      matching: "1.0.0-draft.3",
      hiddenFactors: false,
      privatePersonalInputsMayBeRedacted: true,
      status: "prototype",
      objective: "useful introductions, not engagement",
      deployedCommit: null,
      buildStatus: "development-unpinned",
    });
    assert.deepEqual(await (await request("/v1/consents")).json(), {
      receipt: null,
    });
    assert.deepEqual(await (await request("/v1/consents/research")).json(), {
      receipt: null,
    });
    assert.equal(
      (
        await request("/v1/consents/research", {
          method: "PATCH",
          body: JSON.stringify({ participating: "yes" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/v1/consents/research", {
          method: "PATCH",
          body: JSON.stringify({ participating: true }),
        })
      ).status,
      200,
    );
    await request("/v1/consents/research", {
      method: "PATCH",
      body: JSON.stringify({ participating: false }),
    });
    assert.equal(
      (
        await request("/v1/me", {
          method: "PATCH",
          body: JSON.stringify({
            bio: "A newly edited biography.",
            prompt: "Something I value",
            promptAnswer: "Making time for people.",
            values: ["Care", "Curiosity"],
            lifestyle: {
              smoking: "no",
              children: "want",
              schedule: "flexible",
            },
          }),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/v1/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "" }),
        })
      ).status,
      400,
    );
    const me = (await (await request("/v1/me")).json()) as Profile;
    assert.equal(me.bio, "A newly edited biography.");
    assert.equal(me.promptAnswer, "Making time for people.");
    assert.deepEqual(me.values, ["Care", "Curiosity"]);
    assert.equal(me.lifestyle.schedule, "flexible");
    await request("/v1/preferences", {
      method: "PATCH",
      body: JSON.stringify({ maximumDistanceKm: 35 }),
    });
    const prefs = (await (await request("/v1/preferences")).json()) as {
      maximumDistanceKm: number;
    };
    assert.equal(prefs.maximumDistanceKm, 35);
    assert.equal(
      (
        await request("/v1/preferences", {
          method: "PATCH",
          body: JSON.stringify({ ageMin: 90, ageMax: 20 }),
        })
      ).status,
      400,
    );
    const afterInvalid = (await (await request("/v1/preferences")).json()) as {
      ageMin: number;
      ageMax: number;
    };
    assert.ok(afterInvalid.ageMin < afterInvalid.ageMax);
    assert.deepEqual(await (await request("/v1/consents")).json(), {
      receipt: null,
    });
    assert.equal(
      (await request("/v1/onboarding/complete", { method: "POST" })).status,
      400,
    );
    assert.equal(
      (
        await request("/v1/consents", {
          method: "PATCH",
          body: JSON.stringify({
            adultConfirmed: true,
            prototypeDataUseAccepted: true,
          }),
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/v1/onboarding/complete", { method: "POST" })).status,
      200,
    );
    assert.equal(
      (
        (await (await request("/v1/onboarding")).json()) as {
          complete: boolean;
        }
      ).complete,
      true,
    );
    assert.deepEqual(await (await request("/v1/account/status")).json(), {
      status: "active",
    });
    assert.deepEqual(await (await request("/v1/delivery")).json(), {
      batchSize: 5,
    });
    assert.equal(
      (
        await request("/v1/delivery", {
          method: "PATCH",
          body: JSON.stringify({ batchSize: 1 }),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        (await (await request("/v1/introductions")).json()) as {
          items: unknown[];
        }
      ).items.length,
      1,
    );
    assert.equal(
      (
        await request("/v1/delivery", {
          method: "PATCH",
          body: JSON.stringify({ batchSize: 6 }),
        })
      ).status,
      400,
    );
    await request("/v1/delivery", {
      method: "PATCH",
      body: JSON.stringify({ batchSize: 5 }),
    });
    assert.equal(
      (
        await request("/v1/account/status", {
          method: "PATCH",
          body: JSON.stringify({ status: "paused" }),
        })
      ).status,
      200,
    );
    assert.deepEqual(await (await request("/v1/introductions")).json(), {
      items: [],
      finite: true,
      remaining: 0,
      weeklySeed: publicWeeklySeed(),
      nextBatchAt: nextWeeklyBatchAt(),
      explorationSlots: 0,
    });
    assert.equal(
      (
        await request("/v1/account/status", {
          method: "PATCH",
          body: JSON.stringify({ status: "unknown" }),
        })
      ).status,
      400,
    );
    await request("/v1/account/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    const introductionsResponse = await request("/v1/introductions");
    const introductionsText = await introductionsResponse.text();
    const introductions = JSON.parse(introductionsText) as {
      items: Array<{
        profile: { id: string };
        explanation: {
          candidateTrace: string;
          factorsForB: unknown;
          selectionMode: string;
          selectionProbability: number;
          weeklySeed: string;
        };
      }>;
      weeklySeed: string;
      nextBatchAt: string;
      explorationSlots: number;
    };
    assert.equal(introductions.items[0].explanation.candidateTrace, "private");
    assert.equal(introductions.items[0].explanation.factorsForB, null);
    assert.equal(introductions.weeklySeed, publicWeeklySeed());
    assert.equal(introductions.nextBatchAt, nextWeeklyBatchAt());
    assert.equal(introductions.explorationSlots, 1);
    assert.equal(
      introductions.items.filter(
        ({ explanation }) => explanation.selectionMode === "exploration",
      ).length,
      1,
    );
    assert.ok(
      introductions.items.every(
        ({ explanation }) =>
          explanation.weeklySeed === introductions.weeklySeed &&
          explanation.selectionProbability > 0 &&
          explanation.selectionProbability <= 1,
      ),
    );
    assert.doesNotMatch(introductionsText, /"preferences"/);
    assert.doesNotMatch(introductionsText, /"distanceKm"/);
    assert.match(introductionsText, /"distanceBand":"Within 5 km"/);
    assert.equal(
      (await request("/v1/introductions/lea/saved", { method: "POST" })).status,
      201,
    );
    const savedIntroductions = (await (
      await request("/v1/introductions/saved")
    ).json()) as { items: Array<{ profile: { id: string } }> };
    assert.deepEqual(
      savedIntroductions.items.map((item) => item.profile.id),
      ["lea"],
    );
    const afterSave = (await (await request("/v1/introductions")).json()) as {
      items: Array<{
        profile: { id: string };
        explanation: {
          selectionMode: string;
          selectionProbability: number;
        };
      }>;
    };
    assert.equal(
      afterSave.items.some((item) => item.profile.id === "lea"),
      false,
    );
    for (const item of afterSave.items) {
      const original = introductions.items.find(
        ({ profile }) => profile.id === item.profile.id,
      );
      assert.ok(original);
      assert.equal(
        item.explanation.selectionMode,
        original.explanation.selectionMode,
      );
      assert.equal(
        item.explanation.selectionProbability,
        original.explanation.selectionProbability,
      );
    }
    assert.equal(
      (
        await request("/v1/reports", {
          method: "POST",
          body: JSON.stringify({
            profileId: "noah",
            reason: "scam",
            details: "A pre-connection safety report",
          }),
        })
      ).status,
      201,
    );
    assert.equal(
      (await request("/v1/profiles/noah/block", { method: "POST" })).status,
      200,
    );
    const afterPreConnectionBlock = (await (
      await request("/v1/introductions")
    ).json()) as { items: Array<{ profile: { id: string } }> };
    assert.equal(
      afterPreConnectionBlock.items.some((item) => item.profile.id === "noah"),
      false,
    );
    const decision = (await (
      await request("/v1/introductions/mara/decision", {
        method: "POST",
        body: JSON.stringify({ decision: "interested" }),
      })
    ).json()) as { mutual: boolean };
    assert.equal(decision.mutual, true);
    const suggestions = (await (
      await request("/v1/preferences/suggestions")
    ).json()) as {
      items: unknown[];
      minimumObservations: number;
      automaticChanges: boolean;
    };
    assert.deepEqual(suggestions.items, []);
    assert.equal(suggestions.minimumObservations, 20);
    assert.equal(suggestions.automaticChanges, false);
    const connections = (await (await request("/v1/connections")).json()) as {
      items: Array<{
        id: string;
        muted: boolean;
        meetingPreference: string;
      }>;
    };
    assert.equal(connections.items.length, 1);
    assert.equal(connections.items[0].muted, false);
    assert.equal(connections.items[0].meetingPreference, "not_asked");
    const id = connections.items[0].id;
    assert.equal(
      (
        await request(`/v1/connections/${id}/mute`, {
          method: "PATCH",
          body: JSON.stringify({ muted: true }),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        (await (await request("/v1/connections")).json()) as {
          items: Array<{ muted: boolean }>;
        }
      ).items[0].muted,
      true,
    );
    assert.equal(
      (
        await request(`/v1/connections/${id}/mute`, {
          method: "PATCH",
          body: JSON.stringify({ muted: "yes" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(`/v1/connections/${id}/meeting-preference`, {
          method: "PATCH",
          body: JSON.stringify({ meetingPreference: "open_to_plan" }),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        (await (await request("/v1/connections")).json()) as {
          items: Array<{ meetingPreference: string }>;
        }
      ).items[0].meetingPreference,
      "open_to_plan",
    );
    assert.equal(
      (
        await request(`/v1/connections/${id}/meeting-preference`, {
          method: "PATCH",
          body: JSON.stringify({ meetingPreference: "met" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(`/v1/connections/${id}/messages`, {
          method: "POST",
          body: JSON.stringify({ text: "Hello Mara" }),
        })
      ).status,
      201,
    );
    const flaggedMessage = "Please send money at https://example.com";
    const warningResponse = await request(`/v1/connections/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: flaggedMessage }),
    });
    assert.equal(warningResponse.status, 409);
    const warning = (await warningResponse.json()) as {
      error: string;
      flags: Array<{ id: string }>;
    };
    assert.equal(warning.error, "message_safety_confirmation_required");
    assert.deepEqual(
      warning.flags.map(({ id: flagId }) => flagId),
      ["external_link", "payment_request"],
    );
    assert.equal(
      (
        await request(`/v1/connections/${id}/messages`, {
          method: "POST",
          body: JSON.stringify({
            text: flaggedMessage,
            safetyAcknowledged: true,
          }),
        })
      ).status,
      201,
    );
    const messages = (await (
      await request(`/v1/connections/${id}/messages`)
    ).json()) as { items: Array<{ text: string }> };
    assert.equal(messages.items[0].text, "Hello Mara");
    assert.equal(messages.items[1].text, flaggedMessage);
    const report = await request("/v1/reports", {
      method: "POST",
      body: JSON.stringify({
        profileId: "mara",
        reason: "other",
        details: "Testing the reporting route",
      }),
    });
    assert.equal(report.status, 201);
    const reportHistory = (await (await request("/v1/reports")).json()) as {
      items: Array<{ id: number; reason: string; status: string }>;
    };
    assert.equal(reportHistory.items.length, 2);
    assert.deepEqual(
      reportHistory.items.map(({ id, reason, status }) => ({
        id,
        reason,
        status,
      })),
      [
        { id: 2, reason: "other", status: "received" },
        { id: 1, reason: "scam", status: "received" },
      ],
    );
    const politeClose = (await (
      await request(`/v1/connections/${id}/close-politely`, { method: "POST" })
    ).json()) as { message: { text: string }; closed: boolean };
    assert.equal(politeClose.message.text, POLITE_CLOSE_MESSAGE);
    assert.equal(politeClose.closed, true);
    assert.equal(
      (
        (await (await request("/v1/connections")).json()) as {
          items: unknown[];
        }
      ).items.length,
      0,
    );
    assert.equal(
      (
        await request(`/v1/connections/${id}/close-politely`, {
          method: "POST",
        })
      ).status,
      404,
    );
    await request("/v1/profiles/mara/block", { method: "POST" });
    const after = (await (await request("/v1/connections")).json()) as {
      items: unknown[];
    };
    assert.equal(after.items.length, 0);
    const dataExport = (await (await request("/v1/me/export")).json()) as {
      profile: { id: string };
      reports: unknown[];
      blocks: unknown[];
      preferenceObservations: Array<{ selectionProbability: number }>;
      messages: Array<{ text: string }>;
      connections: Array<{ muted: boolean; meetingPreference: string }>;
      accountStatus: string;
      deliverySettings: { batchSize: number };
      introductionBatch: {
        weeklySeed: string;
        batchSize: number;
        entries: unknown[];
      };
      consentReceipt: { noticeVersion: string };
      researchConsentReceipt: {
        participating: boolean;
        noticeVersion: string;
      };
      savedIntroductions: Array<{ profileId: string }>;
    };
    assert.equal(dataExport.profile.id, "me");
    assert.equal(dataExport.reports.length, 2);
    assert.equal(dataExport.blocks.length, 2);
    assert.equal(dataExport.preferenceObservations.length, 1);
    assert.equal(
      dataExport.preferenceObservations[0].selectionProbability,
      1 / 3,
    );
    assert.equal(
      dataExport.messages.some(({ text }) => text === POLITE_CLOSE_MESSAGE),
      true,
    );
    assert.equal(dataExport.connections[0].muted, true);
    assert.equal(dataExport.connections[0].meetingPreference, "open_to_plan");
    assert.equal(dataExport.accountStatus, "active");
    assert.equal(dataExport.deliverySettings.batchSize, 5);
    assert.equal(dataExport.introductionBatch.weeklySeed, publicWeeklySeed());
    assert.equal(dataExport.introductionBatch.batchSize, 5);
    assert.ok(dataExport.introductionBatch.entries.length > 0);
    assert.equal(dataExport.consentReceipt.noticeVersion, "prototype-0.1");
    assert.deepEqual(
      {
        participating: dataExport.researchConsentReceipt.participating,
        noticeVersion: dataExport.researchConsentReceipt.noticeVersion,
      },
      {
        participating: false,
        noticeVersion: "research-prototype-0.1",
      },
    );
    assert.equal(dataExport.savedIntroductions.length, 1);
    assert.equal(dataExport.savedIntroductions[0].profileId, "lea");
    const deletionResponse = await request("/v1/me", { method: "DELETE" });
    assert.equal(deletionResponse.status, 200);
    const deletionReceipt = (await deletionResponse.json()) as {
      deleted: boolean;
      completedAt: string;
      mode: string;
      applicationBackups: string;
    };
    assert.deepEqual(
      {
        deleted: deletionReceipt.deleted,
        mode: deletionReceipt.mode,
        applicationBackups: deletionReceipt.applicationBackups,
      },
      {
        deleted: true,
        mode: "synchronous-local-prototype",
        applicationBackups: "none",
      },
    );
    assert.equal(Number.isNaN(Date.parse(deletionReceipt.completedAt)), false);
    const resetExport = (await (
      await request("/v1/me/export")
    ).json()) as Record<string, unknown> & {
      profile: { id: string };
      onboardingComplete: boolean;
      consentReceipt: unknown;
      researchConsentReceipt: unknown;
      accountStatus: string;
      deliverySettings: { batchSize: number };
      introductionBatch: unknown;
      decisions: unknown[];
      preferenceObservations: unknown[];
      connections: unknown[];
      messages: unknown[];
      blocks: unknown[];
      reports: unknown[];
      savedIntroductions: unknown[];
    };
    assert.equal(resetExport.profile.id, "me");
    assert.equal(resetExport.onboardingComplete, false);
    assert.equal(resetExport.consentReceipt, null);
    assert.equal(resetExport.researchConsentReceipt, null);
    assert.equal(resetExport.accountStatus, "active");
    assert.deepEqual(resetExport.deliverySettings, { batchSize: 5 });
    assert.equal(resetExport.introductionBatch, null);
    for (const collection of [
      "decisions",
      "preferenceObservations",
      "connections",
      "messages",
      "blocks",
      "reports",
      "savedIntroductions",
    ] as const) {
      assert.deepEqual(resetExport[collection], []);
    }
    assert.equal("deletionReceipt" in resetExport, false);
    assert.deepEqual(await (await request("/v1/consents/research")).json(), {
      receipt: null,
    });
  } finally {
    server.close();
  }
});

test("demo sessions are opt-in and opaque bearer tokens are required", async () => {
  const server = createApp({ store: new Store(":memory:") }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${address.port}/v1/demo/session`, {
          method: "POST",
        })
      ).status,
      404,
    );
    assert.equal(
      (await fetch(`http://127.0.0.1:${address.port}/v1/me`)).status,
      401,
    );
  } finally {
    server.close();
  }

  const enabledServer = createApp({
    store: new Store(":memory:"),
    demoSessionsEnabled: true,
    demoSessionTtlMs: 60_000,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) =>
    enabledServer.once("listening", resolve),
  );
  const enabledAddress = enabledServer.address();
  assert.ok(enabledAddress && typeof enabledAddress === "object");
  const base = `http://127.0.0.1:${enabledAddress.port}`;
  try {
    const first = await sessionHeaders(base);
    const second = await sessionHeaders(base);
    assert.notEqual(first.authorization, second.authorization);
    assert.equal(
      (await fetch(`${base}/v1/me`, { headers: first })).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${base}/v1/me`, {
          headers: { "x-demo-session": "openmatch-local-demo" },
        })
      ).status,
      401,
    );
  } finally {
    enabledServer.close();
  }
});

test("throttles authenticated API traffic with a retry window", async () => {
  const server = createApp({
    store: new Store(":memory:"),
    rateLimit: { maximum: 3, windowMs: 60_000 },
    demoSessionsEnabled: true,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
  const headers = await sessionHeaders(url);
  try {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal(
      (await fetch(`${url}/v1/me`, { headers })).headers.get(
        "ratelimit-remaining",
      ),
      "1",
    );
    assert.equal((await fetch(`${url}/v1/me`, { headers })).status, 200);
    const limited = await fetch(`${url}/v1/me`, { headers });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.deepEqual(await limited.json(), { error: "rate_limit_exceeded" });
  } finally {
    server.close();
  }
});

test("publishes only a validated deployed revision", async () => {
  assert.throws(
    () =>
      createApp({
        store: new Store(":memory:"),
        deployedCommit: "not-a-commit",
      }),
    /7–40 character hex hash/,
  );
  const server = createApp({
    store: new Store(":memory:"),
    deployedCommit: "ABCDEF1234567",
    demoSessionsEnabled: true,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const headers = await sessionHeaders(base);
  try {
    const result = (await (
      await fetch(`http://127.0.0.1:${address.port}/v1/transparency/version`, {
        headers,
      })
    ).json()) as { deployedCommit: string; buildStatus: string };
    assert.equal(result.deployedCommit, "abcdef1234567");
    assert.equal(result.buildStatus, "pinned");
  } finally {
    server.close();
  }
});

test("limits local origins, payload size, and profile identifiers", async () => {
  const server = createApp({
    store: new Store(":memory:"),
    allowedOrigins: ["http://localhost:3000"],
    demoSessionsEnabled: true,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const headers = await sessionHeaders(base);
  try {
    const allowed = await fetch(`${base}/v1/me`, {
      headers: { ...headers, origin: "http://localhost:3000" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(
      allowed.headers.get("access-control-allow-origin"),
      "http://localhost:3000",
    );
    assert.equal(allowed.headers.get("cache-control"), "no-store");
    assert.equal(
      (
        await fetch(`${base}/v1/me`, {
          headers: { ...headers, origin: "https://malicious.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/v1/introductions/not-a-profile/decision`, {
          method: "POST",
          headers,
          body: JSON.stringify({ decision: "interested" }),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${base}/v1/reports`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            profileId: "mara",
            reason: "other",
            details: "x".repeat(70_000),
          }),
        })
      ).status,
      400,
    );
  } finally {
    server.close();
  }
});
