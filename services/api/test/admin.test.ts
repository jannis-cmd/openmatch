import assert from "node:assert/strict";
import test from "node:test";
import { demoCandidates } from "@openmatch/matching";
import { Accounts } from "../src/accounts.ts";
import { createApp } from "../src/app.ts";
import { Store } from "../src/store.ts";

test("admin authentication is isolated and exposes aggregate data only", async () => {
  const accounts = new Accounts(":memory:", { dataDirectory: null });
  accounts.bootstrapAdmin(
    "admin@openmatch.local",
    "correct unique admin password 2026",
  );
  const server = createApp({
    accounts,
    store: new Store(":memory:"),
    demoSessionsEnabled: false,
    emailVerificationSender: null,
    securityNotificationSender: null,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const rejected = await fetch(`${base}/v1/admin/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@openmatch.local",
        password: "wrong password that is long",
      }),
    });
    assert.equal(rejected.status, 401);

    const user = await fetch(`${base}/v1/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "person@example.org",
        password: "correct unique person password 2026",
      }),
    });
    assert.equal(user.status, 201);
    const userToken = ((await user.json()) as { token: string }).token;
    assert.equal(
      (
        await fetch(`${base}/v1/admin/overview`, {
          headers: { authorization: `Bearer ${userToken}` },
        })
      ).status,
      403,
    );

    const login = await fetch(`${base}/v1/admin/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@openmatch.local",
        password: "correct unique admin password 2026",
      }),
    });
    assert.equal(login.status, 200);
    const adminToken = ((await login.json()) as { token: string }).token;
    const overviewResponse = await fetch(`${base}/v1/admin/overview`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(overviewResponse.status, 200);
    const overview = (await overviewResponse.json()) as Record<
      string,
      unknown
    > & {
      accounts: { total: number };
      fixtures: { fictionalProfiles: number };
      privacy: Record<string, boolean>;
    };
    assert.equal(overview.accounts.total, 1);
    assert.equal(overview.fixtures.fictionalProfiles, demoCandidates.length);
    assert.equal(overview.fixtures.fictionalProfiles, 20);
    assert.ok(
      Object.values(overview.privacy).every((value) => value === false),
    );
    const serialized = JSON.stringify(overview).toLowerCase();
    for (const forbidden of [
      'messagecontent":"',
      'preferences":[',
      "distancekm",
      "passwordhash",
    ])
      assert.equal(serialized.includes(forbidden), false);

    assert.equal(
      (
        await fetch(`${base}/v1/profile`, {
          headers: { authorization: `Bearer ${adminToken}` },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${base}/v1/admin/session`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${adminToken}` },
        })
      ).status,
      204,
    );
    assert.equal(
      (
        await fetch(`${base}/v1/admin/overview`, {
          headers: { authorization: `Bearer ${adminToken}` },
        })
      ).status,
      401,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
