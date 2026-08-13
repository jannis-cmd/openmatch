import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const expectAccessible = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
};

test("public privacy and support pages describe the real prototype", async ({
  page,
  request,
}) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  await expect(manifestResponse.json()).resolves.toMatchObject({
    name: "OpenMatch",
    display: "standalone",
    start_url: "/",
    icons: [{ src: "/openmatch-icon.svg", purpose: "maskable" }],
  });
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", {
      name: "Your private life is not the product.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/no staffed privacy office yet/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Open the data inventory/ }),
  ).toHaveAttribute("href", /DATA_INVENTORY\.json/);
  await expectAccessible(page);

  await page.getByRole("link", { name: "Support" }).first().click();
  await expect(
    page.getByRole("heading", {
      name: "Help, without pretending we are ready.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Victim Support Switzerland · 142/ }),
  ).toHaveAttribute("href", "tel:142");
  await expect(page.getByText(/no staffed customer-support/i)).toBeVisible();
  await expectAccessible(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", {
      name: "Help, without pretending we are ready.",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expectAccessible(page);
});

test("first run through a persistent connection and safety action", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const apiBase = "http://127.0.0.1:4000";
  const seedAccount = async (
    name: string,
    age: number,
    readiness: "Prefer to chat first" | "Ready to meet in person",
  ) => {
    const created = await request.post(apiBase + "/v1/accounts", {
      data: {
        email: name.toLowerCase() + "@peer.example.org",
        password: "a browser peer passphrase",
        client: "web",
      },
    });
    expect(created.status()).toBe(201);
    const token = ((await created.json()) as { token: string }).token;
    const headers = { authorization: "Bearer " + token };
    const gender =
      name === "Noah"
        ? { gender: "Man", genderGroups: ["men"] }
        : name === "Mara"
          ? { gender: "Woman", genderGroups: ["women"] }
          : { gender: "Nonbinary", genderGroups: ["nonbinary_people"] };
    expect(
      (
        await request.patch(apiBase + "/v1/me", {
          headers,
          data: { name, age, city: "Winterthur", readiness, ...gender },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.patch(apiBase + "/v1/preferences", {
          headers,
          data: { genderGroups: ["women", "men", "nonbinary_people"] },
        })
      ).status(),
    ).toBe(200);
    await request.patch(apiBase + "/v1/consents", {
      headers,
      data: {
        adultConfirmed: true,
        prototypeDataUseAccepted: true,
      },
    });
    await request.patch(apiBase + "/v1/consents/directory", {
      headers,
      data: { participating: true },
    });
    await request.post(apiBase + "/v1/onboarding/complete", { headers });
    return { token, headers };
  };
  const maraAccount = await seedAccount("Mara", 30, "Ready to meet in person");
  const noahAccount = await seedAccount("Noah", 34, "Prefer to chat first");
  await seedAccount("Imani", 31, "Prefer to chat first");
  const landingResponse = await page.goto("/");
  expect(landingResponse).not.toBeNull();
  const landingHeaders = landingResponse?.headers() ?? {};
  expect(landingHeaders["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(landingHeaders["permissions-policy"]).toBe(
    "camera=(), microphone=(), geolocation=()",
  );
  expect(landingHeaders["referrer-policy"]).toBe("no-referrer");
  expect(landingHeaders["x-content-type-options"]).toBe("nosniff");
  expect(landingHeaders["x-frame-options"]).toBe("DENY");
  expect(landingHeaders["x-powered-by"]).toBeUndefined();
  await expect(
    page.getByRole("heading", { name: "Made to help you leave." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Five understandable steps. No black box.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Transparency before an account." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Data inventory/ }),
  ).toHaveAttribute("href", /DATA_INVENTORY\.json/);
  await expect(
    page.getByRole("heading", {
      name: "Independent support in Switzerland",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Immediate danger · Police 117/ }),
  ).toHaveAttribute("href", "tel:117");
  await expect(
    page.getByRole("link", { name: /Victim support · 142/ }),
  ).toHaveAttribute("href", "tel:142");
  await expect(
    page.getByRole("heading", {
      name: "Real native builds. Private beta limits.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download Android APK" }),
  ).toHaveAttribute("href", /QgNIPOR4gCsrI0iGhB8Y3wMNZeAWC5hjzdqQyXstxto\.apk/);
  await expect(page.getByText("Waiting for Apple enrollment")).toBeVisible();
  const publicApiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v1/")) publicApiRequests.push(request.url());
  });
  const publicCalculator = page
    .getByRole("heading", { name: "Reciprocal score calculator" })
    .locator("..");
  await page.getByLabel(/Your directed fit/).fill("20");
  await expect(
    publicCalculator.locator(".calculator-result > div").nth(1),
  ).toContainText("Final score30%");
  expect(publicApiRequests).toEqual([]);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await expect(
    page.getByText(/private data and conversations stay isolated/),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill("taylor@example.com");
  await page
    .getByLabel("Passphrase")
    .fill("a repeatable browser test passphrase");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Set your boundaries." }),
  ).toBeVisible();
  const onboardingCard = await page
    .locator(".settings-card")
    .first()
    .boundingBox();
  expect(onboardingCard?.width).toBeGreaterThan(500);
  await expectAccessible(page);
  await page.getByRole("textbox", { name: "Name" }).fill("Taylor");
  await page
    .getByRole("textbox", { name: "Approximate city or region" })
    .fill("Winterthur");
  await page
    .getByRole("textbox", { name: "Pronouns optional" })
    .fill("she/her");
  await page
    .getByRole("textbox", { name: "How you describe your gender" })
    .fill("Woman");
  await page
    .getByRole("checkbox", { name: "Include me in discovery for women" })
    .check();
  await page
    .getByRole("combobox", { name: "Relationship intention" })
    .selectOption({ label: "Still figuring it out" });
  await page
    .getByRole("combobox", { name: "Relationship intention" })
    .selectOption({ label: "Long-term relationship" });
  await page
    .getByRole("combobox", { name: "Meeting readiness" })
    .selectOption({ label: "Ready to meet in person" });
  await page.getByLabel("Your answer").fill("Building a welcoming table.");
  await page.getByLabel(/Values 1–5/).fill("Care, Curiosity");
  const genderPreferences = page.getByRole("group", {
    name: "People you are open to meeting",
  });
  for (const group of ["Women", "Men", "Nonbinary people"])
    await genderPreferences
      .getByRole("checkbox", { name: group, exact: true })
      .check();
  await page
    .getByRole("checkbox", {
      name: "I confirm that I am at least 18 years old.",
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: /I understand this prototype stores/,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: /I separately choose to join account matching/,
    })
    .check();
  await page.getByRole("button", { name: "See my introductions" }).click();

  await expect(
    page.getByRole("heading", { name: "3 remaining" }),
  ).toBeVisible();
  for (const peer of [maraAccount, noahAccount]) {
    const peerIntroductions = (await (
      await request.get(apiBase + "/v1/introductions", {
        headers: peer.headers,
      })
    ).json()) as {
      items: Array<{ profile: { id: string; name: string } }>;
    };
    const browserAccountId = peerIntroductions.items.find(
      ({ profile }) => profile.name === "Taylor",
    )?.profile.id;
    expect(browserAccountId).toBeTruthy();
    expect(
      (
        await request.post(
          apiBase + "/v1/introductions/" + browserAccountId + "/decision",
          {
            headers: peer.headers,
            data: { decision: "interested" },
          },
        )
      ).status(),
    ).toBe(200);
  }
  expect(
    publicApiRequests.filter((url) => url.endsWith("/v1/demo/session")),
  ).toHaveLength(0);
  expect(
    publicApiRequests.filter((url) => url.endsWith("/v1/accounts")),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Your profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Account matching" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Enabled under account-directory-prototype-0.1/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Active sessions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Email for account messages" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Email delivery is not configured on this development service/,
    ),
  ).toBeVisible();
  await expect(page.getByText("Web browser · This session")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Revoke Web browser session/ }),
  ).toHaveCount(0);
  const passphraseCard = page
    .getByRole("heading", { name: "Change passphrase" })
    .locator("..");
  await passphraseCard
    .getByLabel("Current passphrase")
    .fill("a repeatable browser test passphrase");
  await page
    .getByLabel("New passphrase", { exact: true })
    .fill("a replacement browser test passphrase");
  await page
    .getByLabel("Confirm new passphrase")
    .fill("a replacement browser test passphrase");
  await page.getByRole("button", { name: "Change passphrase" }).click();
  await expect(
    page.getByText(/Passphrase changed. Every other session was signed out/),
  ).toBeVisible();
  await expect(page.getByText("Web browser · This session")).toBeVisible();
  const recoveryCard = page
    .getByRole("heading", { name: "Recovery codes" })
    .locator("..");
  await recoveryCard
    .getByLabel("Current passphrase")
    .fill("a replacement browser test passphrase");
  await recoveryCard
    .getByRole("button", { name: "Create new recovery codes" })
    .click();
  await expect(
    recoveryCard.getByText("Copy these now. They will not be shown again."),
  ).toBeVisible();
  await expect(recoveryCard.locator("li")).toHaveCount(8);
  await recoveryCard
    .getByRole("button", { name: "I saved them—hide codes" })
    .click();
  await expect(recoveryCard.locator("li")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Profile prompt")).toBeVisible();
  await expect(page.getByLabel(/Values 1–5/)).toBeVisible();
  await page.getByRole("button", { name: "Today" }).click();
  const firstIntroduction = await page
    .locator(".profile-card h2")
    .textContent();
  expect(firstIntroduction).toBeTruthy();
  await page.getByRole("button", { name: "Save for later" }).click();
  await expect(
    page.getByRole("heading", { name: "2 remaining" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Saved (1)" }).click();
  await expect(
    page.getByRole("heading", { name: firstIntroduction ?? "" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to batch" }).click();
  await expect(page.locator(".profile-card")).toBeVisible();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await expect(
      page
        .locator(".profile-card h2")
        .or(page.getByRole("heading", { name: "That’s the whole set." })),
    ).toBeVisible();
    if (await page.getByRole("heading", { name: "Mara, 30" }).isVisible())
      break;
    if (
      await page
        .getByRole("heading", { name: "That’s the whole set." })
        .isVisible()
    )
      break;
    if (await page.getByRole("heading", { name: "Noah, 34" }).isVisible()) {
      await page.getByRole("button", { name: "Save for later" }).click();
      await expect(
        page.getByRole("heading", { name: "Noah, 34" }),
      ).not.toBeVisible();
      continue;
    }
    const previousIntroduction = await page
      .locator(".profile-card h2")
      .textContent();
    await page.getByRole("button", { name: "Pass" }).click();
    if (previousIntroduction)
      await expect(
        page.getByRole("heading", { name: previousIntroduction }),
      ).not.toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Mara, 30" })).toBeVisible();
  await expect(page.getByText("Same approximate region")).toBeVisible();
  await expect(page.getByText("Ready to meet in person")).toBeVisible();
  await page.getByRole("button", { name: "See the full calculation" }).click();
  await expect(page.getByText(/Your directed fit:/)).toBeVisible();
  await expect(page.getByText(/Their directed fit:/)).toBeVisible();
  await expect(
    page.getByText(/Their factor weights are private personal inputs/),
  ).toBeVisible();
  await expect(page.getByText(/Harmonic mean:/)).toBeVisible();
  await expect(page.getByText(/Selection: (score|exploration)/)).toBeVisible();
  if (await page.getByText(/Selection: exploration/).isVisible())
    await expect(page.getByText(/public seed \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Interested" }).click();
  await page.getByRole("button", { name: /Connections · 1/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Would you like to plan a first meeting?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open to planning" }).click();
  await expect(
    page.getByText("Saved privately: open to planning."),
  ).toBeVisible();
  await expect(page.getByText("Choose a busy public place.")).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message Mara" });
  await composer.fill("See https://example.com before we meet");
  let safetyWarning = "";
  page.once("dialog", async (dialog) => {
    safetyWarning = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  expect(safetyWarning).toContain("External link");
  expect(safetyWarning).toContain("These simple rules can be wrong");
  await expect(composer).toHaveValue("See https://example.com before we meet");
  await expect(
    page.getByRole("button", {
      name: "Close politely with a standard message",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mute conversation" }).click();
  await expect(
    page.getByRole("button", { name: "Unmute conversation" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Start from their profile" }).click();
  await expect(composer).toHaveValue(/You mentioned/);
  await composer.fill("Hello from the repeatable journey");
  const messageClientRequestIds: string[] = [];
  let interruptFirstSend = true;
  await page.route("**/v1/connections/*/messages", async (route) => {
    if (interruptFirstSend) {
      interruptFirstSend = false;
      await route.abort("connectionfailed");
      return;
    }
    await route.continue();
  });
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/v1\/connections\/[^/]+\/messages$/.test(request.url())
    )
      messageClientRequestIds.push(
        String(
          (request.postDataJSON() as { clientRequestId?: unknown })
            .clientRequestId ?? "",
        ),
      );
  });
  await page.getByRole("button", { name: "Send" }).click();
  await expect
    .poll(() => messageClientRequestIds[0] ?? "")
    .toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.sessionStorage.getItem("openmatch.pending-message-attempts.v1"),
      ),
    )
    .toContain("Hello from the repeatable journey");
  await page.reload();
  await page.getByRole("button", { name: /Connections · 1/ }).click();
  await expect(composer).toHaveValue("Hello from the repeatable journey");
  await page.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => messageClientRequestIds.length).toBe(2);
  expect(messageClientRequestIds[1]).toBe(messageClientRequestIds[0]);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.sessionStorage.getItem("openmatch.pending-message-attempts.v1"),
      ),
    )
    .toBeNull();
  const maraConnections = (await (
    await request.get(apiBase + "/v1/connections", {
      headers: maraAccount.headers,
    })
  ).json()) as { items: Array<{ id: string }> };
  expect(maraConnections.items).toHaveLength(1);
  expect(
    (
      await request.post(
        apiBase +
          "/v1/connections/" +
          maraConnections.items[0].id +
          "/messages",
        {
          headers: maraAccount.headers,
          data: { text: "Hello back from Mara" },
        },
      )
    ).status(),
  ).toBe(201);
  await expect(
    page.getByLabel("You: Hello from the repeatable journey"),
  ).toBeVisible();
  await expect(page.getByLabel("Mara: Hello back from Mara")).toBeVisible({
    timeout: 7_000,
  });
  await expectAccessible(page);

  await page.getByText("Safety").click();
  await page.getByRole("button", { name: "Report" }).click();
  await page.getByLabel("Reason").selectOption({ label: "Offline safety" });
  await page
    .getByLabel("Details optional")
    .fill("Conversation context for the report");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report received" }),
  ).toHaveText(
    "Report received. This profile is concealed from future introductions; this conversation remains available until you unmatch or block. Reference status: received.",
  );
  expect(
    (
      await request.delete(
        apiBase + "/v1/connections/" + maraConnections.items[0].id,
        { headers: maraAccount.headers },
      )
    ).status(),
  ).toBe(204);
  await expect(
    page.getByRole("heading", { name: "No connections yet" }),
  ).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: "Today" }).click();
  const caughtUp = page.getByRole("heading", {
    name: "That’s the whole set.",
  });
  for (let remaining = 0; remaining < 50; remaining += 1) {
    if (await caughtUp.isVisible()) break;
    const visibleCard = page.locator(".profile-card h2");
    await expect(visibleCard).toBeVisible();
    const previousName = await visibleCard.textContent();
    await page.getByRole("button", { name: "Pass" }).click();
    if (previousName)
      await expect(
        page.getByRole("heading", { name: previousName }),
      ).not.toBeVisible();
  }
  await expect(caughtUp).toBeVisible();
  await expect(page.getByText(/no recycling decisions/i)).toBeVisible();
  await expect(
    page.getByText(/Only newly eligible profiles may appear/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start over" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Preferences" }).click();
  const batchSettings = page
    .getByRole("heading", { name: "Finite batch size" })
    .locator("..");
  await batchSettings.getByRole("button", { name: "1", exact: true }).click();
  await expect(
    batchSettings.getByRole("button", { name: "1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Nothing suggested yet/)).toBeVisible();
  await expect(page.getByText(/Nothing changes automatically/)).toBeVisible();
  await expect(
    page.getByText(/decision examples are currently stored/),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear learning examples" }).click();
  await expect(
    page.getByText(/0 decision examples are currently stored/),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Smoking boundary" })
    .selectOption("any");
  await expect(
    page.getByRole("combobox", { name: "Smoking boundary" }),
  ).toHaveValue("any");

  await page.getByRole("button", { name: "Your profile" }).click();
  await expectAccessible(page);
  await expect(page.getByText(/Not enrolled/)).toBeVisible();
  await page
    .getByRole("button", { name: "Opt in to future prototype research" })
    .click();
  await expect(
    page.getByText(/Opted in under research-prototype-0.1/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Withdraw research consent" }).click();
  await expect(
    page.getByText(/Opted out under research-prototype-0.1/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your safety reports" }),
  ).toBeVisible();
  await expect(page.getByText("Report #1")).toBeVisible();
  await expect(page.getByText(/offline safety · received/i)).toBeVisible();
  const reportCard = page.locator(".report-history > div").filter({
    hasText: "Report #1",
  });
  await reportCard
    .getByRole("button", { name: "Add context or correction" })
    .click();
  await reportCard.getByLabel("Update type").selectOption("correction");
  await reportCard
    .getByLabel("What should be added to the record?")
    .fill("The timing in my original report was imprecise.");
  await reportCard.getByRole("button", { name: "Add to report" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Update added to report #1" }),
  ).toBeVisible();
  await expect(
    reportCard.getByText(/correction.*The timing in my original report/i),
  ).toBeVisible();
  await expect(page.getByText(/she\/her · Woman · Winterthur/)).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Display name" }).fill("Taylor Two");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: "Taylor Two, 31" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause introductions" }).click();
  await expect(
    page.locator(".account-status").getByText("Introductions paused"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator(".account-status")).not.toBeVisible();
  await page.getByRole("button", { name: "How it works" }).click();
  const calculator = page
    .getByRole("heading", {
      name: "Reciprocal score calculator",
    })
    .locator("..");
  const calculatorApiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v1/"))
      calculatorApiRequests.push(request.url());
  });
  await expect(
    calculator.locator(".calculator-result > div").nth(1),
  ).toContainText("Final score69%");
  await page.getByLabel(/Your directed fit/).fill("20");
  await expect(
    calculator.locator(".calculator-result > div").nth(1),
  ).toContainText("Final score30%");
  await page.getByLabel("Mutual boundaries are satisfied").uncheck();
  await expect(
    calculator.locator(".calculator-result > div").nth(1),
  ).toContainText("Final score0%");
  expect(calculatorApiRequests).toEqual([]);
  await expect(
    page.getByRole("heading", { name: "Known limits" }),
  ).toBeVisible();
  await expect(
    page.getByText(/This account uses an isolated application-data store/),
  ).toBeVisible();
  await expect(
    page.getByText("Deployed code: unpinned development build"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Safer dating" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "FTC romance-scam guidance ↗" }),
  ).toHaveAttribute("href", /consumer\.ftc\.gov/);
  await expect(
    page.getByRole("link", { name: "Matching source code ↗" }),
  ).toHaveAttribute("href", /packages\/matching\/src\/index\.ts/);
  await expect(
    page.getByRole("link", { name: "Machine-readable data inventory ↗" }),
  ).toHaveAttribute("href", /DATA_INVENTORY\.json/);
  await expect(
    page.getByRole("heading", {
      name: "Independent support in Switzerland",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/You do not need to file an OpenMatch report/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Your profile" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my data" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "openmatch-data.json",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete local data" }).click();
  await expect(
    page.getByRole("heading", { name: "Set your boundaries." }),
  ).toBeVisible();
  await expect(page.getByText("Local data deletion completed")).toBeVisible();
  await expect(
    page.getByText(/No application-managed backups exist/),
  ).toBeVisible();
  const replacementSession = await request.post(apiBase + "/v1/sessions", {
    data: {
      email: "taylor@example.com",
      password: "a replacement browser test passphrase",
      client: "web",
    },
  });
  expect(replacementSession.status()).toBe(200);
  const replacementToken = (
    (await replacementSession.json()) as { token: string }
  ).token;
  const replacementHeaders = {
    authorization: "Bearer " + replacementToken,
  };
  const sessions = (await (
    await request.get(apiBase + "/v1/sessions", {
      headers: replacementHeaders,
    })
  ).json()) as {
    items: Array<{ id: string; current: boolean }>;
  };
  const browserSession = sessions.items.find(({ current }) => !current);
  expect(browserSession).toBeTruthy();
  expect(
    (
      await request.delete(apiBase + "/v1/sessions/" + browserSession!.id, {
        headers: replacementHeaders,
      })
    ).status(),
  ).toBe(204);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible({ timeout: 12_000 });
  await expect(
    page.getByRole("status").filter({ hasText: "Your session ended" }),
  ).toHaveText("Your session ended. Sign in again.");
  expect(
    await page.evaluate(() =>
      window.sessionStorage.getItem("openmatch-auth-token"),
    ),
  ).toBeNull();
});
