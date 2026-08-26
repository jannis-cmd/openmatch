import assert from "node:assert/strict";
import test from "node:test";
import { AccountError, Accounts } from "../src/accounts.ts";
import { createApp } from "../src/app.ts";
import { Store } from "../src/store.ts";
import { SupabaseIdentity } from "../src/supabase-identity.ts";

test("preserves hosted authentication rate limits", async () => {
  const identity = new SupabaseIdentity(
    "http://127.0.0.1:9999",
    (async () =>
      new Response(JSON.stringify({ error_code: "over_request_rate_limit" }), {
        status: 429,
      })) as typeof fetch,
  );
  await assert.rejects(
    () => identity.signIn("person@example.org", "valid password", "web"),
    (error: unknown) =>
      error instanceof AccountError &&
      error.code === "authentication_rate_limit_exceeded" &&
      error.status === 429,
  );
});

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

    accounts.candidatesFor = () => {
      throw new Error("an unavailable peer must not block sign-out");
    };
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
        const body = JSON.parse(String(init.body)) as {
          password: string;
          current_password: string;
        };
        assert.equal(body.current_password, password);
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

test("requests and completes a standard Supabase email password reset", async () => {
  const recoveryToken = "r".repeat(43);
  const replacementToken = "n".repeat(43);
  const user = {
    id: "770f2b61-9ac2-48b8-a60f-3c692a95e63d",
    email: "person@example.org",
    email_confirmed_at: "2026-08-23T20:00:00.000Z",
  };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const identity = new SupabaseIdentity("http://127.0.0.1:9999", (async (
    input,
    init,
  ) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("/recover?redirect_to="))
      return new Response(JSON.stringify({}), { status: 200 });
    if (url.endsWith("/user") && (!init?.method || init.method === "GET"))
      return new Response(JSON.stringify(user), { status: 200 });
    if (url.endsWith("/user") && init?.method === "PUT")
      return new Response(JSON.stringify(user), { status: 200 });
    if (url.endsWith("/logout")) return new Response(null, { status: 204 });
    if (url.endsWith("/token?grant_type=password"))
      return new Response(
        JSON.stringify({
          user,
          access_token: replacementToken,
          expires_in: 3600,
        }),
        { status: 200 },
      );
    return new Response(null, { status: 404 });
  }) as typeof fetch);

  assert.deepEqual(
    await identity.requestPasswordReset(
      " Person@Example.org ",
      "https://why.example/reset",
    ),
    { sent: true },
  );
  assert.match(
    requests[0]!.url,
    /redirect_to=https%3A%2F%2Fwhy\.example%2Freset/,
  );
  assert.deepEqual(JSON.parse(String(requests[0]!.init?.body)), {
    email: "person@example.org",
  });

  const session = await identity.completePasswordReset({
    recoveryToken,
    newPassword: "a replacement sufficiently long password",
    client: "ios",
  });
  assert.equal(session.token, replacementToken);
  assert.equal(session.client, "ios");
  const update = requests.find(
    ({ url, init }) => url.endsWith("/user") && init?.method === "PUT",
  );
  assert.equal(
    new Headers(update?.init?.headers).get("authorization"),
    `Bearer ${recoveryToken}`,
  );
  assert.deepEqual(JSON.parse(String(update?.init?.body)), {
    password: "a replacement sufficiently long password",
  });
});

test("uses a hosted Supabase secret only as the admin apikey", async () => {
  const apiKey = "publishable-key";
  const secretKey = "sb_secret_dedicated-backend-key";
  const user = {
    id: "770f2b61-9ac2-48b8-a60f-3c692a95e63d",
    email: "person@example.org",
    email_confirmed_at: "2026-08-23T20:00:00.000Z",
  };
  const requests: Array<{ url: string; headers: Headers }> = [];
  const identity = new SupabaseIdentity(
    "https://project.supabase.co/auth/v1",
    (async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, headers });
      if (url.endsWith("/token?grant_type=password"))
        return new Response(
          JSON.stringify({
            user,
            access_token: "user-token",
            expires_in: 3600,
          }),
          { status: 200 },
        );
      if (url.endsWith(`/admin/users/${user.id}`))
        return new Response(JSON.stringify(user), { status: 200 });
      if (url.endsWith("/logout")) return new Response(null, { status: 204 });
      return new Response(null, { status: 404 });
    }) as typeof fetch,
    "",
    apiKey,
    "",
    secretKey,
  );

  await identity.deleteUser({
    accountId: user.id,
    email: user.email,
    password: "a sufficiently long password",
    client: "web",
  });

  assert.ok(requests.length >= 2);
  for (const request of requests.filter(
    ({ url }) => !url.includes("/admin/users/"),
  ))
    assert.equal(request.headers.get("apikey"), apiKey);
  const deletion = requests.find(({ url }) => url.includes("/admin/users/"));
  assert.equal(deletion?.headers.get("apikey"), secretKey);
  assert.equal(deletion?.headers.get("authorization"), null);
});

test("cleans application references before deleting hosted credentials", async () => {
  const user = {
    id: "770f2b61-9ac2-48b8-a60f-3c692a95e63d",
    email: "person@example.org",
    email_confirmed_at: "2026-08-23T20:00:00.000Z",
  };
  const password = "a sufficiently long password";
  let applicationDeleted = false;
  let credentialsDeleted = false;
  const identity = new SupabaseIdentity(
    "http://127.0.0.1:9999",
    (async (input, init) => {
      const url = String(input);
      if (url.endsWith("/token?grant_type=password"))
        return new Response(
          JSON.stringify({
            user,
            access_token: "user-token",
            expires_in: 3600,
          }),
          { status: 200 },
        );
      if (url.endsWith("/user") && (!init?.method || init.method === "GET"))
        return new Response(JSON.stringify(user), { status: 200 });
      if (url.endsWith(`/admin/users/${user.id}`)) {
        assert.equal(applicationDeleted, true);
        credentialsDeleted = true;
        return new Response(JSON.stringify(user), { status: 200 });
      }
      if (url.endsWith("/logout")) return new Response(null, { status: 204 });
      return new Response(null, { status: 404 });
    }) as typeof fetch,
    "a-development-jwt-secret-that-is-long-enough",
  );
  const accounts = new Accounts(":memory:", { dataDirectory: null });
  const originalDelete = accounts.deleteExternalAccount.bind(accounts);
  accounts.deleteExternalAccount = (accountId) => {
    applicationDeleted = true;
    return originalDelete(accountId);
  };
  const server = createApp({
    accounts,
    identity,
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
    const login = await fetch(base + "/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password, client: "web" }),
    });
    assert.equal(login.status, 200);
    const session = (await login.json()) as { token: string };
    const deletion = await fetch(base + "/v1/account", {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ currentPassword: password }),
    });
    assert.equal(deletion.status, 200);
    assert.equal(credentialsDeleted, true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
