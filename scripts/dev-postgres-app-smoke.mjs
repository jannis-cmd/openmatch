import { randomUUID } from "node:crypto";
import { demoCandidates } from "../packages/matching/dist/index.js";

const apiUrl = process.env.OPENMATCH_API_URL;
const mailpitUrl = process.env.OPENMATCH_MAILPIT_URL;
if (!apiUrl || !mailpitUrl)
  throw new Error("Set OPENMATCH_API_URL and OPENMATCH_MAILPIT_URL.");

const password = `OpenMatch-${randomUUID()}-postgres`;
const people = [0, 1].map((candidateIndex) => ({
  candidate: demoCandidates[candidateIndex],
  email: `postgres-smoke-${randomUUID()}@openmatch.test`,
  token: "",
}));
const request = (path, method, body, token) =>
  fetch(apiUrl + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const confirmation = async (email) => {
  let message;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await (
      await fetch(
        `${mailpitUrl}/api/v1/search?query=to:${encodeURIComponent(email)}`,
      )
    ).json();
    if (result.messages?.[0]) {
      message = result.messages[0];
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!message) throw new Error(`confirmation email missing for ${email}`);
  const delivered = await (
    await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`)
  ).json();
  const url = String(delivered.Text).match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error(`confirmation URL missing for ${email}`);
  const response = await fetch(url, { redirect: "manual" });
  if (![302, 303].includes(response.status))
    throw new Error(`confirmation failed (${response.status})`);
};

for (const person of people) {
  const registered = await request("/v1/accounts", "POST", {
    email: person.email,
    password,
    client: "web",
  });
  if (registered.status !== 202)
    throw new Error(`registration failed (${registered.status})`);
  await confirmation(person.email);
  const login = await request("/v1/sessions", "POST", {
    email: person.email,
    password,
    client: "web",
  });
  const session = await login.json();
  if (!login.ok || !session.token)
    throw new Error(`login failed (${login.status})`);
  person.token = session.token;
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
      profile: { ...profile, city: "PostgreSQL smoke region" },
      preferences: person.candidate.preferences,
      adultConfirmed: true,
      prototypeDataUseAccepted: true,
      joinDirectory: true,
    },
    person.token,
  );
  if (!setup.ok) throw new Error(`setup failed (${setup.status})`);
}

const batches = await Promise.all(
  people.map(async (person) => {
    const response = await request(
      "/v1/introductions",
      "GET",
      undefined,
      person.token,
    );
    if (!response.ok)
      throw new Error(
        `introductions failed (${response.status}): ${await response.text()}`,
      );
    return response.json();
  }),
);
const targets = [
  batches[0].items.find(
    (item) => item.profile.name === people[1].candidate.profile.name,
  )?.profile.id,
  batches[1].items.find(
    (item) => item.profile.name === people[0].candidate.profile.name,
  )?.profile.id,
];
if (!targets[0] || !targets[1])
  throw new Error("the temporary compatible pair was not mutually introduced");
const firstDecision = await request(
  `/v1/introductions/${targets[0]}/decision`,
  "POST",
  { decision: "interested" },
  people[0].token,
);
if (!firstDecision.ok || (await firstDecision.json()).mutual !== false)
  throw new Error("first reciprocal decision was invalid");
const secondDecision = await request(
  `/v1/introductions/${targets[1]}/decision`,
  "POST",
  { decision: "interested" },
  people[1].token,
);
if (!secondDecision.ok || (await secondDecision.json()).mutual !== true)
  throw new Error("mutual connection was not created");

const connectionResponses = await Promise.all(
  people.map((person) =>
    request("/v1/connections", "GET", undefined, person.token).then(
      (response) => response.json(),
    ),
  ),
);
const connectionId = connectionResponses[0].items[0]?.id;
if (!connectionId || connectionResponses[1].items[0]?.id !== connectionId)
  throw new Error("connection was not persisted for both accounts");
const text = `PostgreSQL round trip ${randomUUID()}`;
const sent = await request(
  `/v1/connections/${connectionId}/messages`,
  "POST",
  { text, safetyAcknowledged: false, clientRequestId: randomUUID() },
  people[0].token,
);
if (!sent.ok) throw new Error(`message failed (${sent.status})`);
for (const person of people) {
  const messages = await (
    await request(
      `/v1/connections/${connectionId}/messages`,
      "GET",
      undefined,
      person.token,
    )
  ).json();
  if (!messages.items.some((message) => message.text === text))
    throw new Error("message was not visible to both accounts");
}
const reset = await request("/v1/me", "DELETE", undefined, people[0].token);
if (!reset.ok)
  throw new Error(`application-data reset failed (${reset.status})`);
const resetProfile = await (
  await request("/v1/me", "GET", undefined, people[0].token)
).json();
if (resetProfile.name !== "Alex")
  throw new Error("application-data reset was not persisted");
for (const person of people) {
  const deleted = await request(
    "/v1/account",
    "DELETE",
    { currentPassword: password },
    person.token,
  );
  if (!deleted.ok) throw new Error(`cleanup failed (${deleted.status})`);
}

console.log(
  JSON.stringify({
    accounts: 2,
    onboarding: "ok",
    reciprocalIntroduction: "ok",
    mutualConnection: "ok",
    mirroredMessage: "ok",
    applicationDataReset: "ok",
    cascadeCleanup: "ok",
  }),
);
