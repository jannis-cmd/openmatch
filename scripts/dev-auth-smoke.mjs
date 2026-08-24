import { randomUUID } from "node:crypto";

const authUrl = process.env.OPENMATCH_AUTH_URL;
const mailpitUrl = process.env.OPENMATCH_MAILPIT_URL;

if (!authUrl || !mailpitUrl) {
  throw new Error(
    "Set OPENMATCH_AUTH_URL and OPENMATCH_MAILPIT_URL before running this test.",
  );
}

const email = `smoke-${randomUUID()}@openmatch.test`;
const password = `WhyMatch-${randomUUID()}-dev`;
const post = (path, body) =>
  fetch(authUrl + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const weak = await post("/signup", {
  email: `weak-${email}`,
  password: "too-short",
});
if (weak.status < 400)
  throw new Error(`weak password accepted (${weak.status})`);

const signup = await post("/signup", { email, password });
if (!signup.ok) {
  throw new Error(`signup failed (${signup.status}): ${await signup.text()}`);
}

let message;
for (let attempt = 0; attempt < 20; attempt += 1) {
  const response = await fetch(
    `${mailpitUrl}/api/v1/search?query=to:${encodeURIComponent(email)}`,
  );
  const result = await response.json();
  if (result.messages?.[0]) {
    message = result.messages[0];
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!message) throw new Error("confirmation email did not reach Mailpit");

const delivered = await (
  await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`)
).json();
const confirmationUrl = String(delivered.Text).match(/https?:\/\/\S+/)?.[0];
if (!confirmationUrl) throw new Error("confirmation URL missing from email");

const confirmation = await fetch(confirmationUrl, { redirect: "manual" });
if (![302, 303].includes(confirmation.status)) {
  throw new Error(`confirmation failed (${confirmation.status})`);
}

const login = await post("/token?grant_type=password", { email, password });
const session = await login.json();
if (!login.ok || !session.access_token || !session.refresh_token) {
  throw new Error(`login failed (${login.status})`);
}

const refresh = await post("/token?grant_type=refresh_token", {
  refresh_token: session.refresh_token,
});
const refreshed = await refresh.json();
if (!refresh.ok || !refreshed.access_token) {
  throw new Error(`refresh failed (${refresh.status})`);
}

console.log(
  JSON.stringify({
    weakPasswordRejected: true,
    signup: "ok",
    emailCaptured: true,
    confirmation: "ok",
    login: "ok",
    refresh: "ok",
  }),
);
