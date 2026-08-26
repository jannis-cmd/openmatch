import { randomUUID } from "node:crypto";

import { demoCandidates } from "../packages/matching/dist/index.js";

const apiUrl = process.env.OPENMATCH_API_URL?.replace(/\/$/, "");
const authUrl = process.env.OPENMATCH_SUPABASE_AUTH_URL?.replace(/\/$/, "");
const secretKey = process.env.OPENMATCH_SUPABASE_SECRET_KEY;
const baseEmail = process.env.OPENMATCH_SMOKE_EMAIL;

if (!apiUrl || !authUrl || !secretKey || !baseEmail) {
  throw new Error(
    "Set OPENMATCH_API_URL, OPENMATCH_SUPABASE_AUTH_URL, " +
      "OPENMATCH_SUPABASE_SECRET_KEY, and OPENMATCH_SMOKE_EMAIL.",
  );
}
if (!apiUrl.startsWith("https://") || !authUrl.startsWith("https://")) {
  throw new Error("Hosted smoke-test origins must use HTTPS.");
}

const [mailboxLocal, mailboxDomain] = baseEmail.toLowerCase().split("@");
if (!mailboxLocal || !mailboxDomain) {
  throw new Error("OPENMATCH_SMOKE_EMAIL must be a valid mailbox.");
}

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const password = `WhyMatch-${randomUUID()}-hosted`;
const region = `Hosted smoke ${runId}`;
const people = [0, 1].map((candidateIndex) => ({
  candidate: demoCandidates[candidateIndex],
  email: `${mailboxLocal}+whymatch-${runId}-${candidateIndex + 1}@${mailboxDomain}`,
  password,
  token: "",
  userId: "",
  created: false,
  deleted: false,
}));

const json = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${response.url} (${response.status}).`);
  }
};

const request = async (path, method = "GET", body, token) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await json(response);
  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed (${response.status}): ${String(result.error ?? "unknown_error")}${result.message ? ` (${String(result.message)})` : ""}`,
    );
  }
  return { response, result };
};

const adminRequest = async (path, method = "GET", body) => {
  const response = await fetch(`${authUrl}${path}`, {
    method,
    headers: {
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await json(response);
  if (!response.ok) {
    throw new Error(
      `Supabase admin ${method} ${path} failed (${response.status}).`,
    );
  }
  return result;
};

const findUser = async (email) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const page = await adminRequest("/admin/users?per_page=1000");
    const user = page.users?.find(
      (candidate) => String(candidate.email).toLowerCase() === email,
    );
    if (user) return user;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    "A newly registered hosted user was not visible to Auth admin.",
  );
};

const cleanup = async () => {
  for (const person of people) {
    if (!person.created || person.deleted) continue;
    if (person.token) {
      try {
        await request(
          "/v1/account",
          "DELETE",
          { currentPassword: person.password },
          person.token,
        );
        person.deleted = true;
        continue;
      } catch (error) {
        console.error(
          `Application cleanup failed for ${person.email}: ${error instanceof Error ? error.message : error}`,
        );
        // Keep Auth and the local routing record together for diagnosis. An
        // Auth-only deletion would strand the local account and poison peers.
        continue;
      }
    }
    if (person.userId) {
      try {
        await adminRequest(
          `/admin/users/${encodeURIComponent(person.userId)}`,
          "DELETE",
        );
        person.deleted = true;
      } catch {
        // Report the incomplete cleanup after every account has been attempted.
      }
    }
  }
  const remaining = people.filter(
    (person) => person.created && !person.deleted,
  ).length;
  if (remaining)
    throw new Error(`${remaining} hosted smoke account(s) remain.`);
};

try {
  const health = await request("/health");
  if (health.result.status !== "ok")
    throw new Error("Hosted API is unhealthy.");

  for (const [index, person] of people.entries()) {
    const registration = await request("/v1/accounts", "POST", {
      email: person.email,
      password: person.password,
      client: "web",
    });
    if (
      registration.response.status !== 202 ||
      registration.result.confirmationRequired !== true ||
      registration.result.authentication !== false
    ) {
      throw new Error(
        "Hosted registration did not require email confirmation.",
      );
    }
    person.created = true;

    const authUser = await findUser(person.email);
    person.userId = String(authUser.id);
    const confirmed = await adminRequest(
      `/admin/users/${encodeURIComponent(person.userId)}`,
      "PUT",
      { email_confirm: true },
    );
    if (!confirmed.email_confirmed_at) {
      throw new Error("Hosted Auth did not confirm the smoke account.");
    }

    const session = await request("/v1/sessions", "POST", {
      email: person.email,
      password: person.password,
      client: "web",
    });
    person.token = String(session.result.token ?? "");
    if (person.token.length < 32)
      throw new Error("Hosted login returned no token.");

    const {
      id: _id,
      distanceKm: _distanceKm,
      ...profile
    } = person.candidate.profile;
    const setup = await request(
      "/v1/setup",
      "POST",
      {
        version: "setup-0.1",
        profile: {
          ...profile,
          name: `Smoke ${index + 1} ${runId.slice(0, 5)}`,
          city: region,
          photo: null,
        },
        preferences: person.candidate.preferences,
        adultConfirmed: true,
        prototypeDataUseAccepted: true,
        joinDirectory: true,
      },
      person.token,
    );
    if (
      setup.result.complete !== true ||
      setup.result.directoryConsent?.participating !== true
    ) {
      throw new Error("Hosted first-run setup was incomplete.");
    }
  }

  await request("/v1/session", "DELETE", undefined, people[1].token);
  const signedOut = await fetch(`${apiUrl}/v1/me`, {
    headers: { authorization: `Bearer ${people[1].token}` },
  });
  if (signedOut.status !== 401)
    throw new Error("Hosted sign-out did not revoke.");
  const signedBackIn = await request("/v1/sessions", "POST", {
    email: people[1].email,
    password: people[1].password,
    client: "web",
  });
  people[1].token = String(signedBackIn.result.token ?? "");

  const batches = await Promise.all(
    people.map((person) =>
      request("/v1/introductions", "GET", undefined, person.token).then(
        ({ result }) => result,
      ),
    ),
  );
  const names = people.map(
    (_person, index) => `Smoke ${index + 1} ${runId.slice(0, 5)}`,
  );
  const targets = [
    batches[0].items?.find((item) => item.profile.name === names[1])?.profile
      .id,
    batches[1].items?.find((item) => item.profile.name === names[0])?.profile
      .id,
  ];
  if (!targets[0] || !targets[1]) {
    throw new Error(
      `The hosted pair was not mutually introduced: ${JSON.stringify(
        batches.map((batch) =>
          (batch.items ?? []).map((item) => ({
            id: item.profile.id,
            name: item.profile.name,
          })),
        ),
      )}`,
    );
  }

  await request(
    `/v1/introductions/${encodeURIComponent(targets[0])}/saved`,
    "POST",
    {},
    people[0].token,
  );
  const saved = await request(
    "/v1/introductions/saved",
    "GET",
    undefined,
    people[0].token,
  );
  if (!saved.result.items?.some((item) => item.profile.id === targets[0])) {
    throw new Error("Hosted saved introductions did not persist.");
  }
  await request(
    `/v1/introductions/${encodeURIComponent(targets[0])}/saved`,
    "DELETE",
    undefined,
    people[0].token,
  );

  const firstDecision = await request(
    `/v1/introductions/${encodeURIComponent(targets[0])}/decision`,
    "POST",
    { decision: "interested" },
    people[0].token,
  );
  const secondDecision = await request(
    `/v1/introductions/${encodeURIComponent(targets[1])}/decision`,
    "POST",
    { decision: "interested" },
    people[1].token,
  );
  if (
    firstDecision.result.mutual !== false ||
    secondDecision.result.mutual !== true
  ) {
    throw new Error("Hosted reciprocal matching did not create a connection.");
  }

  const connections = await Promise.all(
    people.map((person) =>
      request("/v1/connections", "GET", undefined, person.token).then(
        ({ result }) => result,
      ),
    ),
  );
  const connectionId = connections[0].items?.[0]?.id;
  if (!connectionId || connections[1].items?.[0]?.id !== connectionId) {
    throw new Error("The hosted connection was not mirrored to both accounts.");
  }

  const messageText = `Hosted round trip ${runId}`;
  await request(
    `/v1/connections/${encodeURIComponent(connectionId)}/messages`,
    "POST",
    {
      text: messageText,
      safetyAcknowledged: false,
      clientRequestId: randomUUID(),
    },
    people[0].token,
  );
  for (const person of people) {
    const messages = await request(
      `/v1/connections/${encodeURIComponent(connectionId)}/messages`,
      "GET",
      undefined,
      person.token,
    );
    if (!messages.result.items?.some((item) => item.text === messageText)) {
      throw new Error("The hosted message was not visible to both accounts.");
    }
  }

  await request(
    `/v1/connections/${encodeURIComponent(connectionId)}/mute`,
    "PATCH",
    { muted: true },
    people[0].token,
  );
  await request(
    `/v1/connections/${encodeURIComponent(connectionId)}/meeting-preference`,
    "PATCH",
    { meetingPreference: "open_to_plan" },
    people[0].token,
  );
  await request("/v1/delivery", "PATCH", { batchSize: 3 }, people[0].token);
  await request(
    "/v1/account/status",
    "PATCH",
    { status: "paused" },
    people[0].token,
  );
  await request(
    "/v1/account/status",
    "PATCH",
    { status: "active" },
    people[0].token,
  );
  const profile = await request("/v1/me", "GET", undefined, people[0].token);
  await request(
    "/v1/me",
    "PATCH",
    { bio: `${profile.result.bio} Hosted settings verified.` },
    people[0].token,
  );

  const report = await request(
    "/v1/reports",
    "POST",
    {
      profileId: targets[0],
      reason: "other",
      details: "Automated hosted smoke test using fictional accounts.",
    },
    people[0].token,
  );
  if (report.result.status !== "received") {
    throw new Error("Hosted safety reporting returned no receipt.");
  }

  const exportResult = await request(
    "/v1/me/export",
    "GET",
    undefined,
    people[0].token,
  );
  if (!exportResult.result.profile || !exportResult.result.preferences) {
    throw new Error("Hosted personal-data export was incomplete.");
  }

  const changedPassword = `WhyMatch-${randomUUID()}-changed`;
  const changed = await request(
    "/v1/account/password",
    "PATCH",
    { currentPassword: people[0].password, newPassword: changedPassword },
    people[0].token,
  );
  if (
    typeof changed.result.token !== "string" ||
    changed.result.securityNotification !== "sent"
  ) {
    throw new Error("Hosted password rotation or its email notice failed.");
  }
  people[0].token = changed.result.token;
  people[0].password = changedPassword;

  await cleanup();
  console.log(
    JSON.stringify({
      publicFunnel: "ok",
      freshRegistrations: 2,
      emailConfirmationRequired: true,
      loginAndSignOut: "ok",
      onboardingAndDirectory: "ok",
      reciprocalIntroductions: "ok",
      savedIntroduction: "ok",
      mutualConnection: "ok",
      mirroredTextChat: "ok",
      accountAndConnectionSettings: "ok",
      safetyReport: "ok",
      personalExport: "ok",
      passwordRotationNotification: "sent",
      cleanup: "ok",
    }),
  );
} catch (error) {
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error(
      cleanupError instanceof Error ? cleanupError.message : cleanupError,
    );
  }
  throw error;
}
