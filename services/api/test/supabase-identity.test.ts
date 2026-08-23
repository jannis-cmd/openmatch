import assert from "node:assert/strict";
import test from "node:test";
import { Accounts } from "../src/accounts.ts";
import { createApp } from "../src/app.ts";
import { Store } from "../src/store.ts";
import { SupabaseIdentity } from "../src/supabase-identity.ts";

test("uses Supabase Auth for confirmation, login, API authorization, and sign-out", async () => {
  const token = "s".repeat(43);
  const user = {
    id: "770f2b61-9ac2-48b8-a60f-3c692a95e63d",
    email: "person@example.org",
    email_confirmed_at: "2026-08-23T20:00:00.000Z",
  };
  let signedOut = false;
  const identity = new SupabaseIdentity("http://127.0.0.1:9999", (async (
    input,
    init,
  ) => {
    const url = String(input);
    if (url.endsWith("/signup"))
      return new Response(JSON.stringify({ user, access_token: null }), {
        status: 200,
      });
    if (url.endsWith("/token?grant_type=password"))
      return new Response(
        JSON.stringify({
          user,
          access_token: token,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }),
        { status: 200 },
      );
    if (url.endsWith("/user"))
      return signedOut
        ? new Response(JSON.stringify({ error_code: "bad_jwt" }), {
            status: 401,
          })
        : new Response(JSON.stringify(user), { status: 200 });
    if (url.endsWith("/logout") && init?.method === "POST") {
      signedOut = true;
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch);
  const accounts = new Accounts(":memory:", { dataDirectory: null });
  const store = new Store(":memory:");
  const server = createApp({
    accounts,
    identity,
    store,
    demoSessionsEnabled: false,
    emailVerificationSender: null,
    securityNotificationSender: null,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const registration = await fetch(base + "/v1/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        password: "a sufficiently long password",
        client: "web",
      }),
    });
    assert.equal(registration.status, 202);
    assert.deepEqual(await registration.json(), {
      authentication: false,
      confirmationRequired: true,
      email: user.email,
    });

    const login = await fetch(base + "/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        password: "a sufficiently long password",
        client: "web",
      }),
    });
    assert.equal(login.status, 200);
    const session = (await login.json()) as { token: string };
    assert.equal(session.token, token);
    const headers = { authorization: `Bearer ${token}` };
    assert.equal((await fetch(base + "/v1/me", { headers })).status, 200);
    assert.deepEqual(accounts.emailStatus(user.id), {
      email: user.email,
      verifiedAt: user.email_confirmed_at,
    });

    assert.equal(
      (
        await fetch(base + "/v1/session", {
          method: "DELETE",
          headers,
        })
      ).status,
      204,
    );
    assert.equal((await fetch(base + "/v1/me", { headers })).status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("reauthenticates Supabase password changes and credential deletion", async () => {
  const user = {
    id: "770f2b61-9ac2-48b8-a60f-3c692a95e63d",
    email: "person@example.org",
    email_confirmed_at: "2026-08-23T20:00:00.000Z",
  };
  let password = "the original sufficiently long password";
  let deleted = false;
  const requests: string[] = [];
  const identity = new SupabaseIdentity(
    "http://127.0.0.1:9999",
    (async (input, init) => {
      const url = String(input);
      requests.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/token?grant_type=password")) {
        const body = JSON.parse(String(init?.body)) as { password: string };
        return body.password === password && !deleted
          ? new Response(
              JSON.stringify({
                user,
                access_token: `token-for-${password}`,
                expires_in: 3600,
              }),
              { status: 200 },
            )
          : new Response(
              JSON.stringify({ error_code: "invalid_credentials" }),
              { status: 400 },
            );
      }
      if (url.endsWith("/user") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { password: string };
        password = body.password;
        return new Response(JSON.stringify(user), { status: 200 });
      }
      if (url.endsWith(`/admin/users/${user.id}`)) {
        const authorization = String(
          (init?.headers as Record<string, string>).authorization,
        );
        assert.equal(
          authorization.slice("Bearer ".length).split(".").length,
          3,
        );
        deleted = true;
        return new Response(JSON.stringify(user), { status: 200 });
      }
      if (url.endsWith("/logout")) return new Response(null, { status: 204 });
      return new Response(null, { status: 404 });
    }) as typeof fetch,
    "a-development-jwt-secret-that-is-long-enough",
  );

  const changed = await identity.changePassword({
    accountId: user.id,
    email: user.email,
    currentPassword: "the original sufficiently long password",
    newPassword: "the replacement sufficiently long password",
    client: "web",
  });
  assert.equal(changed.accountId, user.id);
  assert.match(changed.token, /replacement/);

  await identity.deleteUser({
    accountId: user.id,
    email: user.email,
    password: "the replacement sufficiently long password",
    client: "web",
  });
  assert.equal(deleted, true);
  assert.ok(requests.some((request) => request.includes("DELETE ")));
});
