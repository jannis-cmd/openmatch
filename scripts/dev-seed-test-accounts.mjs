import { demoCandidates } from "../packages/matching/dist/index.js";

const apiUrl = process.env.OPENMATCH_API_URL;
const mailpitUrl = process.env.OPENMATCH_MAILPIT_URL;
const password = process.env.OPENMATCH_TEST_PASSWORD;
if (!apiUrl || !mailpitUrl || !password || password.length < 15)
  throw new Error(
    "Set OPENMATCH_API_URL, OPENMATCH_MAILPIT_URL, and an OPENMATCH_TEST_PASSWORD of at least 15 characters.",
  );

const post = (path, body, token) =>
  fetch(apiUrl + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const confirmLatestEmail = async (email) => {
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
  const confirmed = await fetch(url, { redirect: "manual" });
  if (![302, 303].includes(confirmed.status))
    throw new Error(`confirmation failed for ${email}`);
};

for (const [index, candidate] of demoCandidates.entries()) {
  const email = `test-profile-${String(index + 1).padStart(2, "0")}@openmatch.test`;
  const registration = await post("/v1/accounts", {
    email,
    password,
    client: "web",
  });
  if (registration.status === 202) await confirmLatestEmail(email);
  else if (registration.status !== 409)
    throw new Error(
      `registration ${index + 1} failed (${registration.status})`,
    );

  const login = await post("/v1/sessions", { email, password, client: "web" });
  const session = await login.json();
  if (!login.ok || !session.token)
    throw new Error(`login ${index + 1} failed (${login.status})`);

  const {
    id: _id,
    distanceKm: _distanceKm,
    ...sourceProfile
  } = candidate.profile;
  const setup = await post(
    "/v1/setup",
    {
      version: "setup-0.1",
      profile: { ...sourceProfile, city: "Zürich" },
      preferences: candidate.preferences,
      adultConfirmed: true,
      prototypeDataUseAccepted: true,
      joinDirectory: true,
    },
    session.token,
  );
  if (!setup.ok)
    throw new Error(
      `setup ${index + 1} failed (${setup.status}): ${await setup.text()}`,
    );
  process.stdout.write(".");
}

process.stdout.write("\n");
console.log(
  JSON.stringify({ seeded: demoCandidates.length, region: "Zürich" }),
);
