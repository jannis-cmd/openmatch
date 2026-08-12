import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  POLITE_CLOSE_MESSAGE,
  nextWeeklyBatchAt,
  publicWeeklySeed,
  type Profile,
} from "@openmatch/matching";
import { createApp } from "../src/app.ts";
import { Accounts } from "../src/accounts.ts";
import { smtpEmailVerificationSender } from "../src/email-verification.ts";
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

const accountSession = async (
  base: string,
  path: "/v1/accounts" | "/v1/sessions",
  email: string,
  password: string,
  client?: "web" | "ios" | "android",
) => {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, client }),
  });
  const body = (await response.json()) as {
    token?: string;
    authentication?: boolean;
    error?: string;
    emailVerification?: {
      email: string;
      verifiedAt: string | null;
      deliveryConfigured: boolean;
      delivery?: string;
    };
  };
  return { response, body };
};

test("SMTP confirmation delivery is explicit and rejects unsafe configuration", () => {
  assert.equal(smtpEmailVerificationSender(undefined, undefined), null);
  assert.throws(
    () =>
      smtpEmailVerificationSender(
        "https://mail.example.org",
        "from@example.org",
      ),
    /smtp: or smtps:/,
  );
  assert.throws(
    () =>
      smtpEmailVerificationSender("smtps://mail.example.org", "not a mailbox"),
    /plain OPENMATCH_EMAIL_FROM mailbox/,
  );
});

test("account storage migrates existing sessions to public opaque identifiers", () => {
  const directory = mkdtempSync(join(tmpdir(), "openmatch-accounts-"));
  const path = join(directory, "accounts.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE account_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO accounts VALUES ('account-1','person@example.org','hash','salt','2026-08-12T00:00:00.000Z');
    INSERT INTO account_sessions VALUES ('private-token-hash','account-1',4102444800000,'2026-08-12T00:00:00.000Z');
  `);
  legacy.close();
  const accounts = new Accounts(path, { dataDirectory: null });
  try {
    const session = accounts.db
      .prepare("SELECT id,client FROM account_sessions")
      .get() as { id: string; client: string };
    assert.match(session.id, /^[0-9a-f-]{36}$/);
    assert.equal(session.client, "unknown");
    assert.ok(
      (
        accounts.db.prepare("PRAGMA table_info(accounts)").all() as Array<{
          name: string;
        }>
      ).some(({ name }) => name === "email_verified_at"),
    );
  } finally {
    accounts.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("replays interrupted cross-account delivery exactly once after restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "openmatch-delivery-"));
  const path = join(directory, "accounts.sqlite");
  const dataDirectory = join(directory, "account-data");
  let interruptSecondDelivery = true;
  let accounts = new Accounts(path, {
    dataDirectory,
    beforeDelivery: (_eventId, _accountId, position) => {
      if (position === 2 && interruptSecondDelivery) {
        interruptSecondDelivery = false;
        throw new Error("simulated_process_interruption");
      }
    },
  });
  try {
    const first = accounts.register(
      "delivery-first@example.org",
      "a sufficiently long first passphrase",
    );
    const second = accounts.register(
      "delivery-second@example.org",
      "a sufficiently long second passphrase",
    );
    const connectionId = "connection-delivery-test";
    const createdAt = "2026-08-12T20:00:00.000Z";
    first.store.ensureConnection(connectionId, second.accountId, createdAt);
    second.store.ensureConnection(connectionId, first.accountId, createdAt);
    assert.throws(
      () =>
        accounts.deliverPairEvent(
          first.accountId,
          {
            kind: "message",
            connectionId,
            text: "Durably delivered",
            senderId: "me",
            createdAt,
          },
          second.accountId,
          {
            kind: "message",
            connectionId,
            text: "Durably delivered",
            senderId: first.accountId,
            createdAt,
          },
        ),
      /simulated_process_interruption/,
    );
    assert.equal(first.store.messages(connectionId).length, 1);
    assert.equal(second.store.messages(connectionId).length, 0);
    assert.equal(accounts.pendingDeliveryCount(), 1);
    const firstAccountId = first.accountId;
    const secondAccountId = second.accountId;
    accounts.close();

    accounts = new Accounts(path, { dataDirectory });
    const restoredFirst = accounts.accountStore(firstAccountId);
    const restoredSecond = accounts.accountStore(secondAccountId);
    assert.ok(restoredFirst && restoredSecond);
    assert.equal(restoredFirst.messages(connectionId).length, 1);
    assert.equal(restoredSecond.messages(connectionId).length, 1);
    assert.equal(accounts.pendingDeliveryCount(), 0);
    accounts.flushDeliveryEvents();
    assert.equal(restoredFirst.messages(connectionId).length, 1);
    assert.equal(restoredSecond.messages(connectionId).length, 1);
    const closeEventId = "delivery-test-polite-close";
    const closeAction = {
      kind: "polite_close" as const,
      connectionId,
      text: POLITE_CLOSE_MESSAGE,
      createdAt: "2026-08-12T20:01:00.000Z",
    };
    accounts.deliverPairEvent(
      firstAccountId,
      { ...closeAction, senderId: "me" },
      secondAccountId,
      { ...closeAction, senderId: firstAccountId },
      closeEventId,
    );
    accounts.deliverPairEvent(
      firstAccountId,
      { ...closeAction, senderId: "me" },
      secondAccountId,
      { ...closeAction, senderId: firstAccountId },
      closeEventId,
    );
    assert.equal(restoredFirst.messages(connectionId).length, 2);
    assert.equal(restoredSecond.messages(connectionId).length, 2);
    assert.equal(restoredFirst.connection(connectionId), undefined);
    assert.equal(restoredSecond.connection(connectionId), undefined);
  } finally {
    accounts.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("email confirmation is delivered out of band, hashed, expiring, and single use", async () => {
  const accounts = new Accounts(":memory:", { dataDirectory: null });
  const deliveries: Array<{
    email: string;
    code: string;
    expiresAt: string;
  }> = [];
  const securityNotifications: Array<{
    email: string;
    event: string;
    occurredAt: string;
  }> = [];
  const server = createApp({
    store: new Store(":memory:"),
    accounts,
    demoSessionsEnabled: false,
    authRateLimit: { maximum: 20, windowMs: 60_000 },
    emailVerificationSender: async (message) => {
      deliveries.push(message);
    },
    securityNotificationSender: async (message) => {
      securityNotifications.push(message);
    },
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const created = await accountSession(
      base,
      "/v1/accounts",
      "verify@example.org",
      "a verification test passphrase",
      "web",
    );
    assert.equal(created.response.status, 201);
    assert.ok(created.body.token);
    assert.deepEqual(created.body.emailVerification, {
      email: "verify@example.org",
      verifiedAt: null,
      deliveryConfigured: true,
      delivery: "sent",
    });
    assert.equal("code" in (created.body.emailVerification ?? {}), false);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]?.email, "verify@example.org");
    assert.match(deliveries[0]?.code ?? "", /^\d{8}$/);
    assert.ok(Date.parse(deliveries[0]?.expiresAt ?? "") > Date.now());
    const stored = accounts.db
      .prepare(
        "SELECT code_hash AS codeHash,code_salt AS codeSalt,failed_attempts AS failedAttempts FROM account_email_verifications",
      )
      .get() as { codeHash: string; codeSalt: string; failedAttempts: number };
    assert.notEqual(stored.codeHash, deliveries[0]?.code);
    assert.ok(stored.codeSalt.length >= 20);
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${created.body.token}`,
    };
    const pending = await fetch(base + "/v1/account/email-verification", {
      headers,
    });
    assert.deepEqual(await pending.json(), {
      email: "verify@example.org",
      verifiedAt: null,
      deliveryConfigured: true,
    });
    assert.equal(
      (
        await fetch(base + "/v1/consents/directory", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ participating: true }),
        })
      ).status,
      409,
    );
    const unverifiedDecision = await fetch(
      base + "/v1/introductions/unknown/decision",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ decision: "interested" }),
      },
    );
    assert.equal(unverifiedDecision.status, 409);
    assert.deepEqual(await unverifiedDecision.json(), {
      error: "email_verification_required",
    });
    const tooSoon = await fetch(
      base + "/v1/account/email-verification/request",
      { method: "POST", headers },
    );
    assert.equal(tooSoon.status, 429);
    assert.equal(
      ((await tooSoon.json()) as { error: string }).error,
      "verification_resend_too_soon",
    );
    accounts.db
      .prepare("UPDATE account_email_verifications SET expires_at=0")
      .run();
    assert.equal(
      (
        await fetch(base + "/v1/account/email-verification/confirm", {
          method: "POST",
          headers,
          body: JSON.stringify({ code: deliveries[0]!.code }),
        })
      ).status,
      400,
    );
    accounts.db
      .prepare("UPDATE account_email_verifications SET expires_at=?")
      .run(Date.parse(deliveries[0]!.expiresAt));
    const wrong = await fetch(base + "/v1/account/email-verification/confirm", {
      method: "POST",
      headers,
      body: JSON.stringify({ code: "00000000" }),
    });
    assert.equal(wrong.status, 400);
    assert.equal(
      (
        accounts.db
          .prepare(
            "SELECT failed_attempts AS failedAttempts FROM account_email_verifications",
          )
          .get() as { failedAttempts: number }
      ).failedAttempts,
      2,
    );
    const confirmed = await fetch(
      base + "/v1/account/email-verification/confirm",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ code: deliveries[0]!.code }),
      },
    );
    assert.equal(confirmed.status, 200);
    const confirmedBody = (await confirmed.json()) as {
      email: string;
      verifiedAt: string;
    };
    assert.equal(confirmedBody.email, "verify@example.org");
    assert.ok(Date.parse(confirmedBody.verifiedAt));
    assert.equal(
      (
        await fetch(base + "/v1/consents/directory", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ participating: true }),
        })
      ).status,
      200,
    );
    assert.equal(
      accounts.db
        .prepare("SELECT count(*) AS count FROM account_email_verifications")
        .get()?.count,
      0,
    );
    assert.equal(
      (
        await fetch(base + "/v1/account/email-verification/confirm", {
          method: "POST",
          headers,
          body: JSON.stringify({ code: deliveries[0]!.code }),
        })
      ).status,
      400,
    );
    const status = (await (
      await fetch(base + "/v1/account/email-verification", { headers })
    ).json()) as { verifiedAt: string | null };
    assert.equal(status.verifiedAt, confirmedBody.verifiedAt);
    assert.deepEqual(
      await (
        await fetch(base + "/v1/account/notification-email", { headers })
      ).json(),
      {
        primaryEmail: "verify@example.org",
        primaryVerifiedAt: confirmedBody.verifiedAt,
        email: null,
        verifiedAt: null,
        pendingEmail: null,
      },
    );
    assert.equal(
      (
        await fetch(base + "/v1/account/notification-email/request", {
          method: "POST",
          headers,
          body: JSON.stringify({
            email: "backup@example.org",
            currentPassword: "not the current passphrase",
          }),
        })
      ).status,
      400,
    );
    const backupRequest = await fetch(
      base + "/v1/account/notification-email/request",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: "backup@example.org",
          currentPassword: "a verification test passphrase",
        }),
      },
    );
    assert.equal(backupRequest.status, 202);
    assert.equal(deliveries.length, 2);
    assert.equal(deliveries[1]?.email, "backup@example.org");
    assert.match(deliveries[1]?.code ?? "", /^\d{8}$/);
    assert.deepEqual(
      await (
        await fetch(base + "/v1/account/notification-email", { headers })
      ).json(),
      {
        primaryEmail: "verify@example.org",
        primaryVerifiedAt: confirmedBody.verifiedAt,
        email: null,
        verifiedAt: null,
        pendingEmail: "backup@example.org",
      },
    );
    assert.equal(
      (
        await fetch(base + "/v1/account/notification-email/confirm", {
          method: "POST",
          headers,
          body: JSON.stringify({ code: "00000000" }),
        })
      ).status,
      400,
    );
    const backupConfirmed = await fetch(
      base + "/v1/account/notification-email/confirm",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ code: deliveries[1]!.code }),
      },
    );
    assert.equal(backupConfirmed.status, 200);
    const backupStatus = (await backupConfirmed.json()) as {
      email: string;
      verifiedAt: string;
      pendingEmail: null;
      securityNotification: string;
    };
    assert.equal(backupStatus.email, "backup@example.org");
    assert.ok(Date.parse(backupStatus.verifiedAt));
    assert.equal(backupStatus.pendingEmail, null);
    assert.equal(backupStatus.securityNotification, "sent");
    const recoveryCodesResponse = await fetch(
      base + "/v1/account/recovery-codes",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          currentPassword: "a verification test passphrase",
        }),
      },
    );
    const recoveryCodes = (await recoveryCodesResponse.json()) as {
      codes: string[];
      securityNotification: string;
    };
    assert.equal(recoveryCodes.securityNotification, "sent");
    const changedResponse = await fetch(base + "/v1/account/password", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        currentPassword: "a verification test passphrase",
        newPassword: "a different verification test passphrase",
      }),
    });
    const changed = (await changedResponse.json()) as {
      token: string;
      securityNotification: string;
    };
    assert.equal(changed.securityNotification, "sent");
    const recoveredResponse = await fetch(base + "/v1/account/recover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "verify@example.org",
        recoveryCode: recoveryCodes.codes[0],
        newPassword: "a recovered verification test passphrase",
        client: "web",
      }),
    });
    assert.equal(recoveredResponse.status, 200);
    const recoveredSession = (await recoveredResponse.json()) as {
      token: string;
      securityNotification: string;
    };
    assert.equal(recoveredSession.securityNotification, "sent");
    const removedBackup = await fetch(base + "/v1/account/notification-email", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${recoveredSession.token}`,
      },
      body: JSON.stringify({
        currentPassword: "a recovered verification test passphrase",
      }),
    });
    assert.equal(removedBackup.status, 200);
    assert.equal(
      ((await removedBackup.json()) as { securityNotification: string })
        .securityNotification,
      "sent",
    );
    assert.deepEqual(
      securityNotifications.map(({ email, event }) => ({ email, event })),
      [
        {
          email: "verify@example.org",
          event: "notification_address_added",
        },
        {
          email: "backup@example.org",
          event: "notification_address_added",
        },
        { email: "verify@example.org", event: "recovery_codes_replaced" },
        { email: "backup@example.org", event: "recovery_codes_replaced" },
        { email: "verify@example.org", event: "password_changed" },
        { email: "backup@example.org", event: "password_changed" },
        { email: "verify@example.org", event: "account_recovered" },
        { email: "backup@example.org", event: "account_recovered" },
        {
          email: "verify@example.org",
          event: "notification_address_removed",
        },
      ],
    );
    assert.ok(
      securityNotifications.every(({ occurredAt }) =>
        Number.isFinite(Date.parse(occurredAt)),
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("authenticated accounts have hashed credentials and isolated application data", async () => {
  const accounts = new Accounts(":memory:", { dataDirectory: null });
  const server = createApp({
    store: new Store(":memory:"),
    accounts,
    demoSessionsEnabled: false,
    authRateLimit: { maximum: 5, windowMs: 60_000 },
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const password = "a-correct-horse-battery-staple";
  try {
    const first = await accountSession(
      base,
      "/v1/accounts",
      " First@Example.org ",
      password,
      "web",
    );
    assert.equal(first.response.status, 201);
    assert.equal(first.body.authentication, true);
    assert.ok(first.body.token);
    const second = await accountSession(
      base,
      "/v1/accounts",
      "second@example.org",
      "another-secure-passphrase",
      "android",
    );
    assert.equal(second.response.status, 201);
    assert.ok(second.body.token);
    const stored = accounts.db
      .prepare(
        "SELECT email,password_hash AS passwordHash,password_salt AS passwordSalt FROM accounts WHERE email=?",
      )
      .get("first@example.org") as {
      email: string;
      passwordHash: string;
      passwordSalt: string;
    };
    assert.equal(stored.email, "first@example.org");
    assert.notEqual(stored.passwordHash, password);
    assert.ok(stored.passwordHash.length >= 80);
    assert.ok(stored.passwordSalt.length >= 20);

    const auth = (token: string) => ({
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    });
    const incompleteIntroductions = (await (
      await fetch(base + "/v1/introductions", {
        headers: auth(first.body.token!),
      })
    ).json()) as { items: unknown[] };
    assert.equal(incompleteIntroductions.items.length, 0);
    const completeAccount = async (token: string, name: string) => {
      await fetch(base + "/v1/me", {
        method: "PATCH",
        headers: auth(token),
        body: JSON.stringify({ name, city: "Zürich" }),
      });
      assert.equal(
        (
          await fetch(base + "/v1/consents", {
            method: "PATCH",
            headers: auth(token),
            body: JSON.stringify({
              adultConfirmed: true,
              prototypeDataUseAccepted: true,
            }),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(base + "/v1/onboarding/complete", {
            method: "POST",
            headers: auth(token),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(base + "/v1/consents/directory", {
            method: "PATCH",
            headers: auth(token),
            body: JSON.stringify({ participating: true }),
          })
        ).status,
        200,
      );
    };
    await completeAccount(first.body.token!, "First account");
    await completeAccount(second.body.token!, "Second account");
    const firstProfile = (await (
      await fetch(base + "/v1/me", { headers: auth(first.body.token!) })
    ).json()) as Profile;
    const secondProfile = (await (
      await fetch(base + "/v1/me", { headers: auth(second.body.token!) })
    ).json()) as Profile;
    assert.equal(firstProfile.name, "First account");
    assert.equal(secondProfile.name, "Second account");
    const accountRows = accounts.db
      .prepare("SELECT id,email FROM accounts")
      .all() as Array<{ id: string; email: string }>;
    const firstId = accountRows.find(
      ({ email }) => email === "first@example.org",
    )?.id;
    const secondId = accountRows.find(
      ({ email }) => email === "second@example.org",
    )?.id;
    assert.ok(firstId && secondId);
    await fetch(base + "/v1/consents/directory", {
      method: "PATCH",
      headers: auth(second.body.token!),
      body: JSON.stringify({ participating: false }),
    });
    const withdrawnIntroductions = (await (
      await fetch(base + "/v1/introductions", {
        headers: auth(first.body.token!),
      })
    ).json()) as { items: unknown[] };
    assert.equal(withdrawnIntroductions.items.length, 0);
    await fetch(base + "/v1/consents/directory", {
      method: "PATCH",
      headers: auth(second.body.token!),
      body: JSON.stringify({ participating: true }),
    });
    await fetch(base + "/v1/preferences", {
      method: "PATCH",
      headers: auth(first.body.token!),
      body: JSON.stringify({ idealDistanceKm: 13 }),
    });
    const introductions = (await (
      await fetch(base + "/v1/introductions", {
        headers: auth(first.body.token!),
      })
    ).json()) as { items: Array<{ profile: { id: string } }> };
    assert.deepEqual(
      introductions.items.map(({ profile }) => profile.id),
      [secondId],
    );
    const firstDecision = await fetch(
      base + `/v1/introductions/${secondId}/decision`,
      {
        method: "POST",
        headers: auth(first.body.token!),
        body: JSON.stringify({ decision: "interested" }),
      },
    );
    assert.equal(firstDecision.status, 200);
    assert.equal(
      ((await firstDecision.json()) as { mutual: boolean }).mutual,
      false,
    );
    const secondIntroductions = (await (
      await fetch(base + "/v1/introductions", {
        headers: auth(second.body.token!),
      })
    ).json()) as {
      items: Array<{ profile: { id: string; distanceBand: string } }>;
    };
    assert.equal(secondIntroductions.items[0]?.profile.id, firstId);
    assert.equal(
      secondIntroductions.items[0]?.profile.distanceBand,
      "Same approximate region",
    );
    const secondDecision = await fetch(
      base + `/v1/introductions/${firstId}/decision`,
      {
        method: "POST",
        headers: auth(second.body.token!),
        body: JSON.stringify({ decision: "interested" }),
      },
    );
    assert.equal(
      ((await secondDecision.json()) as { mutual: boolean }).mutual,
      true,
    );
    const firstConnections = (await (
      await fetch(base + "/v1/connections", {
        headers: auth(first.body.token!),
      })
    ).json()) as {
      items: Array<{ id: string; profile: { id: string; name: string } }>;
    };
    const secondConnections = (await (
      await fetch(base + "/v1/connections", {
        headers: auth(second.body.token!),
      })
    ).json()) as {
      items: Array<{ id: string; profile: { id: string; name: string } }>;
    };
    assert.equal(firstConnections.items[0]?.profile.id, secondId);
    assert.equal(firstConnections.items[0]?.profile.name, "Second account");
    assert.equal(secondConnections.items[0]?.profile.id, firstId);
    assert.equal(firstConnections.items[0]?.id, secondConnections.items[0]?.id);
    const connectionId = firstConnections.items[0].id;
    await fetch(base + "/v1/consents/directory", {
      method: "PATCH",
      headers: auth(second.body.token!),
      body: JSON.stringify({ participating: false }),
    });
    const connectionAfterWithdrawal = (await (
      await fetch(base + "/v1/connections", {
        headers: auth(first.body.token!),
      })
    ).json()) as { items: Array<{ profile?: { name: string } }> };
    assert.equal(
      connectionAfterWithdrawal.items[0]?.profile?.name,
      "Second account",
    );
    const sent = await fetch(
      base + `/v1/connections/${connectionId}/messages`,
      {
        method: "POST",
        headers: auth(first.body.token!),
        body: JSON.stringify({
          text: "A real account-to-account hello.",
          clientRequestId: "75afbb9f-60c8-49be-a8b9-4b3bb2fe6b3f",
        }),
      },
    );
    assert.equal(sent.status, 201);
    const repeated = await fetch(
      base + `/v1/connections/${connectionId}/messages`,
      {
        method: "POST",
        headers: auth(first.body.token!),
        body: JSON.stringify({
          text: "A real account-to-account hello.",
          clientRequestId: "75afbb9f-60c8-49be-a8b9-4b3bb2fe6b3f",
        }),
      },
    );
    assert.equal(repeated.status, 200);
    assert.equal(
      (
        (await repeated.json()) as {
          id: number;
        }
      ).id,
      ((await sent.json()) as { id: number }).id,
    );
    const reusedForDifferentMessage = await fetch(
      base + `/v1/connections/${connectionId}/messages`,
      {
        method: "POST",
        headers: auth(first.body.token!),
        body: JSON.stringify({
          text: "A different message",
          clientRequestId: "75afbb9f-60c8-49be-a8b9-4b3bb2fe6b3f",
        }),
      },
    );
    assert.equal(reusedForDifferentMessage.status, 409);
    assert.deepEqual(await reusedForDifferentMessage.json(), {
      error: "client_request_id_reused",
    });
    const receivedMessages = (await (
      await fetch(base + `/v1/connections/${connectionId}/messages`, {
        headers: auth(second.body.token!),
      })
    ).json()) as { items: Array<{ senderId: string; text: string }> };
    assert.equal(receivedMessages.items.length, 1);
    assert.equal(receivedMessages.items[0].senderId, firstId);
    assert.equal(
      receivedMessages.items[0].text,
      "A real account-to-account hello.",
    );
    assert.equal(accounts.pendingDeliveryCount(), 0);
    await fetch(base + `/v1/connections/${connectionId}`, {
      method: "DELETE",
      headers: auth(second.body.token!),
    });
    assert.equal(
      (
        (await (
          await fetch(base + "/v1/connections", {
            headers: auth(first.body.token!),
          })
        ).json()) as { items: unknown[] }
      ).items.length,
      0,
    );
    assert.equal(accounts.pendingDeliveryCount(), 0);

    const wrong = await accountSession(
      base,
      "/v1/sessions",
      "first@example.org",
      "not-the-password",
    );
    assert.equal(wrong.response.status, 401);
    assert.equal(wrong.body.error, "invalid_credentials");
    const signedIn = await accountSession(
      base,
      "/v1/sessions",
      "FIRST@example.org",
      password,
      "ios",
    );
    assert.equal(signedIn.response.status, 200);
    assert.ok(signedIn.body.token);
    assert.notEqual(signedIn.body.token, first.body.token);
    const sessions = (await (
      await fetch(base + "/v1/sessions", {
        headers: auth(first.body.token!),
      })
    ).json()) as {
      items: Array<{
        id: string;
        client: string;
        current: boolean;
        createdAt: string;
        expiresAt: string;
      }>;
    };
    assert.equal(sessions.items.length, 2);
    assert.deepEqual(sessions.items.map(({ client }) => client).sort(), [
      "ios",
      "web",
    ]);
    const currentSession = sessions.items.find(({ current }) => current);
    const otherSession = sessions.items.find(({ current }) => !current);
    assert.ok(currentSession && otherSession);
    assert.ok(Date.parse(currentSession.createdAt));
    assert.ok(Date.parse(currentSession.expiresAt) > Date.now());
    assert.equal(
      (
        await fetch(base + `/v1/sessions/${currentSession.id}`, {
          method: "DELETE",
          headers: auth(first.body.token!),
        })
      ).status,
      409,
    );
    const secondSessions = (await (
      await fetch(base + "/v1/sessions", {
        headers: auth(second.body.token!),
      })
    ).json()) as { items: Array<{ id: string }> };
    assert.equal(secondSessions.items.length, 1);
    assert.equal(
      (
        await fetch(base + `/v1/sessions/${secondSessions.items[0].id}`, {
          method: "DELETE",
          headers: auth(first.body.token!),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(base + `/v1/sessions/${otherSession.id}`, {
          method: "DELETE",
          headers: auth(first.body.token!),
        })
      ).status,
      204,
    );
    assert.equal(
      (
        await fetch(base + "/v1/me", {
          headers: auth(signedIn.body.token!),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(base + "/v1/me", {
          headers: auth(second.body.token!),
        })
      ).status,
      200,
    );
    await fetch(base + "/v1/session", {
      method: "DELETE",
      headers: auth(second.body.token!),
    });
    assert.equal(
      (
        await fetch(base + "/v1/me", {
          headers: auth(second.body.token!),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await accountSession(
          base,
          "/v1/accounts",
          "first@example.org",
          password,
        )
      ).response.status,
      409,
    );
    const throttled = await accountSession(
      base,
      "/v1/sessions",
      "first@example.org",
      password,
    );
    assert.equal(throttled.response.status, 429);
    assert.equal(throttled.body.error, "authentication_rate_limit_exceeded");
    assert.equal(throttled.response.headers.get("retry-after"), "60");
    const deletion = await fetch(base + "/v1/account", {
      method: "DELETE",
      headers: auth(first.body.token!),
    });
    assert.equal(deletion.status, 200);
    const deletionReceipt = (await deletion.json()) as {
      deleted: boolean;
      completedAt: string;
      credentialsDeleted: boolean;
      sessionsRevoked: boolean;
      applicationBackups: string;
    };
    assert.equal(deletionReceipt.deleted, true);
    assert.ok(Date.parse(deletionReceipt.completedAt));
    assert.equal(deletionReceipt.credentialsDeleted, true);
    assert.equal(deletionReceipt.sessionsRevoked, true);
    assert.equal(deletionReceipt.applicationBackups, "none");
    assert.equal(
      (await fetch(base + "/v1/me", { headers: auth(first.body.token!) }))
        .status,
      401,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("changing a passphrase verifies the current secret and atomically rotates every session", async () => {
  const accounts = new Accounts(":memory:", { dataDirectory: null });
  const server = createApp({
    store: new Store(":memory:"),
    accounts,
    demoSessionsEnabled: false,
    authRateLimit: { maximum: 20, windowMs: 60_000 },
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port;
  const oldPassword = "an original secure passphrase";
  const newPassword = "a distinct replacement passphrase";
  const auth = (token: string) => ({
    "content-type": "application/json",
    authorization: "Bearer " + token,
  });
  try {
    assert.equal(
      (
        await accountSession(
          base,
          "/v1/accounts",
          "blocked@example.org",
          "passwordpassword",
        )
      ).body.error,
      "common_password",
    );
    const created = await accountSession(
      base,
      "/v1/accounts",
      "change@example.org",
      oldPassword,
      "web",
    );
    const second = await accountSession(
      base,
      "/v1/sessions",
      "change@example.org",
      oldPassword,
      "ios",
    );
    assert.ok(created.body.token && second.body.token);
    const change = (token: string, currentPassword: string, newValue: string) =>
      fetch(base + "/v1/account/password", {
        method: "PATCH",
        headers: auth(token),
        body: JSON.stringify({
          currentPassword,
          newPassword: newValue,
        }),
      });
    assert.equal(
      (
        await change(
          created.body.token,
          "the wrong current secret",
          newPassword,
        )
      ).status,
      400,
    );
    assert.equal(
      (await change(created.body.token, oldPassword, oldPassword)).status,
      400,
    );
    assert.equal(
      (await change(created.body.token, oldPassword, "passwordpassword"))
        .status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/v1/me", {
          headers: auth(created.body.token),
        })
      ).status,
      200,
    );
    const changed = await change(created.body.token, oldPassword, newPassword);
    assert.equal(changed.status, 200);
    const changedBody = (await changed.json()) as {
      token: string;
      authentication: boolean;
      otherSessionsRevoked: boolean;
    };
    assert.equal(changedBody.authentication, true);
    assert.equal(changedBody.otherSessionsRevoked, true);
    assert.notEqual(changedBody.token, created.body.token);
    for (const revoked of [created.body.token, second.body.token])
      assert.equal(
        (
          await fetch(base + "/v1/me", {
            headers: auth(revoked),
          })
        ).status,
        401,
      );
    assert.equal(
      (
        await fetch(base + "/v1/me", {
          headers: auth(changedBody.token),
        })
      ).status,
      200,
    );
    const sessions = (await (
      await fetch(base + "/v1/sessions", {
        headers: auth(changedBody.token),
      })
    ).json()) as {
      items: Array<{ client: string; current: boolean }>;
    };
    assert.equal(sessions.items.length, 1);
    assert.equal(sessions.items[0]?.client, "web");
    assert.equal(sessions.items[0]?.current, true);
    assert.equal(
      (
        await accountSession(
          base,
          "/v1/sessions",
          "change@example.org",
          oldPassword,
        )
      ).response.status,
      401,
    );
    assert.equal(
      (
        await accountSession(
          base,
          "/v1/sessions",
          "change@example.org",
          newPassword,
        )
      ).response.status,
      200,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("one-time recovery codes replace credentials and revoke every session and code", async () => {
  const accounts = new Accounts(":memory:", { dataDirectory: null });
  const server = createApp({
    store: new Store(":memory:"),
    accounts,
    demoSessionsEnabled: false,
    authRateLimit: { maximum: 20, windowMs: 60_000 },
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port;
  const oldPassword = "the original recovery passphrase";
  const newPassword = "the recovered account passphrase";
  const auth = (token: string) => ({
    "content-type": "application/json",
    authorization: "Bearer " + token,
  });
  try {
    const created = await accountSession(
      base,
      "/v1/accounts",
      "recover@example.org",
      oldPassword,
      "android",
    );
    const second = await accountSession(
      base,
      "/v1/sessions",
      "recover@example.org",
      oldPassword,
      "ios",
    );
    assert.ok(created.body.token && second.body.token);
    assert.equal(
      (
        await fetch(base + "/v1/account/recovery-codes", {
          method: "POST",
          headers: auth(created.body.token),
          body: JSON.stringify({ currentPassword: "wrong current value" }),
        })
      ).status,
      400,
    );
    const generated = await fetch(base + "/v1/account/recovery-codes", {
      method: "POST",
      headers: auth(created.body.token),
      body: JSON.stringify({ currentPassword: oldPassword }),
    });
    assert.equal(generated.status, 201);
    const firstCodeSet = (await generated.json()) as {
      codes: string[];
      createdAt: string;
    };
    assert.equal(firstCodeSet.codes.length, 8);
    assert.ok(Date.parse(firstCodeSet.createdAt));
    for (const code of firstCodeSet.codes)
      assert.match(code, /^(?:[0-9a-f]{4}-){7}[0-9a-f]{4}$/);
    const stored = accounts.db
      .prepare(
        "SELECT code_hash AS codeHash FROM account_recovery_codes ORDER BY code_hash",
      )
      .all() as Array<{ codeHash: string }>;
    assert.equal(stored.length, 8);
    assert.ok(
      stored.every(({ codeHash }) => !firstCodeSet.codes.includes(codeHash)),
    );
    const recover = (code: string, password = newPassword) =>
      fetch(base + "/v1/account/recover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "recover@example.org",
          recoveryCode: code,
          newPassword: password,
          client: "web",
        }),
      });
    const replacementSetResponse = await fetch(
      base + "/v1/account/recovery-codes",
      {
        method: "POST",
        headers: auth(created.body.token),
        body: JSON.stringify({ currentPassword: oldPassword }),
      },
    );
    const codeSet = (await replacementSetResponse.json()) as {
      codes: string[];
    };
    assert.equal((await recover(firstCodeSet.codes[0]!)).status, 400);
    assert.equal((await recover("not-a-code")).status, 400);
    const unchanged = await recover(codeSet.codes[0]!, oldPassword);
    assert.equal(unchanged.status, 400);
    assert.equal(
      ((await unchanged.json()) as { error: string }).error,
      "password_unchanged",
    );
    const recovered = await recover(codeSet.codes[0]!);
    assert.equal(recovered.status, 200);
    const recoveredBody = (await recovered.json()) as {
      token: string;
      otherSessionsRevoked: boolean;
      recoveryCodesRevoked: boolean;
    };
    assert.equal(recoveredBody.otherSessionsRevoked, true);
    assert.equal(recoveredBody.recoveryCodesRevoked, true);
    const remainingCodes = accounts.db
      .prepare("SELECT count(*) AS count FROM account_recovery_codes")
      .get() as { count: number };
    assert.equal(remainingCodes.count, 0);
    for (const token of [created.body.token, second.body.token])
      assert.equal(
        (await fetch(base + "/v1/me", { headers: auth(token) })).status,
        401,
      );
    assert.equal(
      (await fetch(base + "/v1/me", { headers: auth(recoveredBody.token) }))
        .status,
      200,
    );
    assert.equal((await recover(codeSet.codes[1]!)).status, 400);
    assert.equal(
      (
        await accountSession(
          base,
          "/v1/sessions",
          "recover@example.org",
          oldPassword,
        )
      ).response.status,
      401,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

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
    assert.equal(stateCount.count, 9);
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
    accounts: [
      "id",
      "email",
      "passwordHash",
      "passwordSalt",
      "createdAt",
      "emailVerifiedAt",
    ],
    accountEmailVerifications: [
      "accountId",
      "codeHash",
      "codeSalt",
      "expiresAt",
      "failedAttempts",
      "sentAt",
    ],
    accountNotificationAddresses: ["accountId", "email", "verifiedAt"],
    accountNotificationVerifications: [
      "accountId",
      "email",
      "codeHash",
      "codeSalt",
      "expiresAt",
      "failedAttempts",
      "sentAt",
    ],
    accountSessions: [
      "id",
      "tokenHash",
      "accountId",
      "client",
      "expiresAt",
      "createdAt",
    ],
    accountDeliveryEvents: [
      "sequence",
      "id",
      "firstAccountId",
      "secondAccountId",
      "firstActionJson",
      "secondActionJson",
      "createdAt",
    ],
    processedAccountEvents: ["eventId", "processedAt"],
    accountRecoveryCodes: ["codeHash", "accountId", "createdAt"],
    mobileSession: ["rawSessionToken"],
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
    directoryConsentReceipt: ["participating", "noticeVersion", "updatedAt"],
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
    messages: [
      "id",
      "connectionId",
      "senderId",
      "text",
      "createdAt",
      "deliveryEventId",
    ],
    blocks: ["profileId", "createdAt"],
    reports: ["id", "profileId", "reason", "details", "status", "createdAt"],
    reportUpdates: ["id", "reportId", "kind", "details", "createdAt"],
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
    const reportUpdate = await request("/v1/reports/2/updates", {
      method: "POST",
      body: JSON.stringify({
        kind: "correction",
        details: "The concern happened after the match, not before it.",
      }),
    });
    assert.equal(reportUpdate.status, 201);
    const reportUpdateBody = (await reportUpdate.json()) as {
      id: number;
      reportId: number;
      kind: string;
      details: string;
      createdAt: string;
    };
    assert.deepEqual(
      {
        id: reportUpdateBody.id,
        reportId: reportUpdateBody.reportId,
        kind: reportUpdateBody.kind,
        details: reportUpdateBody.details,
      },
      {
        id: 1,
        reportId: 2,
        kind: "correction",
        details: "The concern happened after the match, not before it.",
      },
    );
    assert.equal(Number.isNaN(Date.parse(reportUpdateBody.createdAt)), false);
    assert.equal(
      (
        await request("/v1/reports/999/updates", {
          method: "POST",
          body: JSON.stringify({ kind: "correction", details: "Context" }),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request("/v1/reports/2/updates", {
          method: "POST",
          body: JSON.stringify({ kind: "correction", details: "   " }),
        })
      ).status,
      400,
    );
    const updatedReportHistory = (await (
      await request("/v1/reports")
    ).json()) as {
      items: Array<{ id: number; updates: Array<{ details: string }> }>;
    };
    assert.deepEqual(updatedReportHistory.items[0].updates, [
      {
        id: 1,
        reportId: 2,
        kind: "correction",
        details: "The concern happened after the match, not before it.",
        createdAt: reportUpdateBody.createdAt,
      },
    ]);
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
      reportUpdates: unknown[];
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
    assert.equal(dataExport.reportUpdates.length, 1);
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
      reportUpdates: unknown[];
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
      "reportUpdates",
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

test("applies stricter per-operation limits to one authenticated client", async () => {
  const server = createApp({
    store: new Store(":memory:"),
    rateLimit: { maximum: 100, windowMs: 60_000 },
    operationRateLimits: {
      report: { maximum: 2, windowMs: 60_000 },
    },
    demoSessionsEnabled: true,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
  const headers = await sessionHeaders(url);
  const submitReport = () =>
    fetch(`${url}/v1/reports`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        profileId: "mara",
        reason: "other",
        details: "Operation limiter test",
      }),
    });
  try {
    const first = await submitReport();
    assert.equal(first.status, 201);
    assert.equal(first.headers.get("operation-ratelimit-limit"), "2");
    assert.equal(first.headers.get("operation-ratelimit-remaining"), "1");
    const second = await submitReport();
    assert.equal(second.status, 201);
    assert.equal(second.headers.get("operation-ratelimit-remaining"), "0");
    const limited = await submitReport();
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.deepEqual(await limited.json(), {
      error: "operation_rate_limit_exceeded",
      operation: "report",
    });
    assert.equal(
      (await fetch(`${url}/v1/me`, { headers })).status,
      200,
      "the operation limit must not consume the general request budget",
    );
  } finally {
    server.close();
  }
});

test("rejects invalid per-operation rate-limit configuration", () => {
  assert.throws(
    () =>
      createApp({
        operationRateLimits: {
          message: { maximum: 0, windowMs: 60_000 },
        },
      }),
    /invalid operation rate limit configuration/,
  );
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
