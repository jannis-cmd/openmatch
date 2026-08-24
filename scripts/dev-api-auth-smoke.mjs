import { randomUUID } from "node:crypto";

const apiUrl = process.env.OPENMATCH_API_URL;
const mailpitUrl = process.env.OPENMATCH_MAILPIT_URL;
if (!apiUrl || !mailpitUrl)
  throw new Error("Set OPENMATCH_API_URL and OPENMATCH_MAILPIT_URL.");

const email = `api-smoke-${randomUUID()}@openmatch.test`;
const password = `WhyMatch-${randomUUID()}-dev`;
const resetPassword = `WhyMatch-${randomUUID()}-reset`;
const changedPassword = `WhyMatch-${randomUUID()}-changed`;
const post = (path, body, token) =>
  fetch(apiUrl + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const registration = await post("/v1/accounts", {
  email,
  password,
  client: "web",
});
const pending = await registration.json();
if (
  registration.status !== 202 ||
  pending.confirmationRequired !== true ||
  pending.authentication !== false
)
  throw new Error(`unexpected registration response (${registration.status})`);

let message;
for (let attempt = 0; attempt < 20; attempt += 1) {
  const result = await (
    await fetch(
      `${mailpitUrl}/api/v1/search?query=to:${encodeURIComponent(email)}`,
    )
  ).json();
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
if (!confirmationUrl) throw new Error("confirmation URL missing");
const confirmation = await fetch(confirmationUrl, { redirect: "manual" });
if (![302, 303].includes(confirmation.status))
  throw new Error(`confirmation failed (${confirmation.status})`);

const login = await post("/v1/sessions", { email, password, client: "web" });
const session = await login.json();
if (!login.ok || !session.token)
  throw new Error(`login failed (${login.status})`);

const profile = await fetch(`${apiUrl}/v1/me`, {
  headers: { authorization: `Bearer ${session.token}` },
});
if (!profile.ok)
  throw new Error(`authenticated API failed (${profile.status})`);

const resetRequest = await post("/v1/account/password-reset/request", {
  email,
  client: "web",
});
if (resetRequest.status !== 202)
  throw new Error(`password reset request failed (${resetRequest.status})`);
let resetMessage;
for (let attempt = 0; attempt < 20; attempt += 1) {
  const result = await (
    await fetch(
      `${mailpitUrl}/api/v1/search?query=to:${encodeURIComponent(email)}`,
    )
  ).json();
  resetMessage = result.messages?.find(
    (candidate) => candidate.ID !== message.ID,
  );
  if (resetMessage) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!resetMessage)
  throw new Error("password reset email did not reach Mailpit");
const resetDelivered = await (
  await fetch(`${mailpitUrl}/api/v1/message/${resetMessage.ID}`)
).json();
const resetVerificationUrl = String(resetDelivered.Text).match(
  /https?:\/\/\S+/,
)?.[0];
if (!resetVerificationUrl) throw new Error("password reset URL missing");
const resetRedirect = await fetch(resetVerificationUrl, { redirect: "manual" });
if (![302, 303].includes(resetRedirect.status))
  throw new Error(
    `password reset verification failed (${resetRedirect.status})`,
  );
const resetLocation = resetRedirect.headers.get("location");
if (!resetLocation) throw new Error("password reset redirect missing");
const recoveryToken = new URLSearchParams(
  new URL(resetLocation).hash.slice(1),
).get("access_token");
if (!recoveryToken) throw new Error("password reset token missing");
const resetCompletion = await post("/v1/account/password-reset/complete", {
  recoveryToken,
  newPassword: resetPassword,
  client: "web",
});
const resetSession = await resetCompletion.json();
if (!resetCompletion.ok || !resetSession.token)
  throw new Error(`password reset failed (${resetCompletion.status})`);
const oldSessionAfterReset = await fetch(`${apiUrl}/v1/me`, {
  headers: { authorization: `Bearer ${session.token}` },
});
if (oldSessionAfterReset.status !== 401)
  throw new Error(
    `old token remained valid after password reset (${oldSessionAfterReset.status})`,
  );

const passwordChange = await fetch(`${apiUrl}/v1/account/password`, {
  method: "PATCH",
  headers: {
    authorization: `Bearer ${resetSession.token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    currentPassword: resetPassword,
    newPassword: changedPassword,
  }),
});
const changedSession = await passwordChange.json();
if (!passwordChange.ok || !changedSession.token)
  throw new Error(`password change failed (${passwordChange.status})`);
const oldSessionAfterChange = await fetch(`${apiUrl}/v1/me`, {
  headers: { authorization: `Bearer ${resetSession.token}` },
});
if (oldSessionAfterChange.status !== 401)
  throw new Error(
    `old token remained valid after password change (${oldSessionAfterChange.status})`,
  );

const signout = await fetch(`${apiUrl}/v1/session`, {
  method: "DELETE",
  headers: { authorization: `Bearer ${changedSession.token}` },
});
if (signout.status !== 204)
  throw new Error(`sign-out failed (${signout.status})`);

const afterSignout = await fetch(`${apiUrl}/v1/me`, {
  headers: { authorization: `Bearer ${changedSession.token}` },
});
if (afterSignout.status !== 401)
  throw new Error(`signed-out token remained valid (${afterSignout.status})`);

const relogin = await post("/v1/sessions", {
  email,
  password: changedPassword,
  client: "web",
});
const deletionSession = await relogin.json();
if (!relogin.ok || !deletionSession.token)
  throw new Error(`login with changed password failed (${relogin.status})`);
const deletion = await fetch(`${apiUrl}/v1/account`, {
  method: "DELETE",
  headers: {
    authorization: `Bearer ${deletionSession.token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ currentPassword: changedPassword }),
});
if (!deletion.ok)
  throw new Error(`account deletion failed (${deletion.status})`);
const loginAfterDeletion = await post("/v1/sessions", {
  email,
  password: changedPassword,
  client: "web",
});
if (loginAfterDeletion.status !== 401)
  throw new Error(
    `deleted credential still authenticated (${loginAfterDeletion.status})`,
  );

console.log(
  JSON.stringify({
    registrationPending: true,
    emailConfirmation: "ok",
    login: "ok",
    authenticatedApi: "ok",
    passwordResetAndRotation: "ok",
    passwordChangeAndRotation: "ok",
    signoutRevocation: "ok",
    permanentAccountDeletion: "ok",
  }),
);
