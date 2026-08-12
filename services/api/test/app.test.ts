import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { Store } from "../src/store.ts";

const headers = {
  "content-type": "application/json",
  "x-demo-session": "openmatch-local-demo",
};

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
      items: Array<{ id: string }>;
    };
    assert.equal(connections.items.length, 1);
    const id = connections.items[0].id;
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
      accountStatus: string;
    };
    assert.equal(dataExport.profile.id, "me");
    assert.equal(dataExport.reports.length, 1);
    assert.equal(dataExport.blocks.length, 1);
    assert.equal(dataExport.preferenceObservations.length, 1);
    assert.equal(dataExport.accountStatus, "active");
    assert.equal((await request("/v1/me", { method: "DELETE" })).status, 204);
    assert.equal(
      (
        (await (await request("/v1/onboarding")).json()) as {
          complete: boolean;
        }
      ).complete,
      false,
    );
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
