import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { POLITE_CLOSE_MESSAGE } from "@openmatch/matching";
import { createApp } from "../src/app.ts";
import { Store } from "../src/store.ts";

const headers = {
  "content-type": "application/json",
  "x-demo-session": "openmatch-local-demo",
};

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
    profile: [
      "id",
      "name",
      "age",
      "city",
      "distanceKm",
      "pronouns",
      "intent",
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
    connections: ["id", "profileId", "createdAt", "closedAt", "muted"],
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
  const server = createApp({ store: new Store(":memory:") }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
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
          body: JSON.stringify({ bio: "A newly edited biography." }),
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
    const me = (await (await request("/v1/me")).json()) as { bio: string };
    assert.equal(me.bio, "A newly edited biography.");
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
        explanation: { candidateTrace: string; factorsForB: unknown };
      }>;
    };
    assert.equal(introductions.items[0].explanation.candidateTrace, "private");
    assert.equal(introductions.items[0].explanation.factorsForB, null);
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
      items: Array<{ profile: { id: string } }>;
    };
    assert.equal(
      afterSave.items.some((item) => item.profile.id === "lea"),
      false,
    );
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
      items: Array<{ id: string; muted: boolean }>;
    };
    assert.equal(connections.items.length, 1);
    assert.equal(connections.items[0].muted, false);
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
        await request(`/v1/connections/${id}/messages`, {
          method: "POST",
          body: JSON.stringify({ text: "Hello Mara" }),
        })
      ).status,
      201,
    );
    const messages = (await (
      await request(`/v1/connections/${id}/messages`)
    ).json()) as { items: Array<{ text: string }> };
    assert.equal(messages.items[0].text, "Hello Mara");
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
      preferenceObservations: unknown[];
      messages: Array<{ text: string }>;
      connections: Array<{ muted: boolean }>;
      accountStatus: string;
      deliverySettings: { batchSize: number };
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
      dataExport.messages.some(({ text }) => text === POLITE_CLOSE_MESSAGE),
      true,
    );
    assert.equal(dataExport.connections[0].muted, true);
    assert.equal(dataExport.accountStatus, "active");
    assert.equal(dataExport.deliverySettings.batchSize, 5);
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
    assert.equal((await request("/v1/me", { method: "DELETE" })).status, 204);
    assert.equal(
      (
        (await (await request("/v1/onboarding")).json()) as {
          complete: boolean;
        }
      ).complete,
      false,
    );
    assert.deepEqual(await (await request("/v1/consents/research")).json(), {
      receipt: null,
    });
  } finally {
    server.close();
  }
});

test("requires the explicit local demo session header", async () => {
  const server = createApp({ store: new Store(":memory:") }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    assert.equal(
      (await fetch(`http://127.0.0.1:${address.port}/v1/me`)).status,
      401,
    );
  } finally {
    server.close();
  }
});

test("throttles authenticated API traffic with a retry window", async () => {
  const server = createApp({
    store: new Store(":memory:"),
    rateLimit: { maximum: 2, windowMs: 60_000 },
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
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

test("limits local origins, payload size, and profile identifiers", async () => {
  const server = createApp({
    store: new Store(":memory:"),
    allowedOrigins: ["http://localhost:3000"],
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
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
