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

test("first run through a persistent connection and safety action", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Made to help you leave." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Five understandable steps. No black box.",
    }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await expect(
    page.getByText("Account authentication is not connected yet."),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("textbox", { name: "Email" }).fill("taylor@example.com");
  await page.getByRole("button", { name: "Continue to the demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Set your boundaries." }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("textbox", { name: "Name" }).fill("Taylor");
  await page
    .getByRole("textbox", { name: "Approximate city or region" })
    .fill("Winterthur");
  await page
    .getByRole("textbox", { name: "Pronouns optional" })
    .fill("she/her");
  await page
    .getByRole("combobox", { name: "Relationship intention" })
    .selectOption({ label: "Still figuring it out" });
  await page
    .getByRole("combobox", { name: "Relationship intention" })
    .selectOption({ label: "Long-term relationship" });
  await page
    .getByRole("combobox", { name: "Meeting readiness" })
    .selectOption({ label: "Ready to meet in person" });
  await page
    .getByRole("checkbox", {
      name: "I confirm that I am at least 18 years old.",
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: /I understand this local prototype stores/,
    })
    .check();
  await page.getByRole("button", { name: "See my introductions" }).click();

  await expect(
    page.getByRole("heading", { name: "3 remaining" }),
  ).toBeVisible();
  await expect(page.getByText("Within 5 km")).toBeVisible();
  await expect(page.getByText("Ready to meet in person")).toBeVisible();
  await page.getByRole("button", { name: "Save for later" }).click();
  await expect(
    page.getByRole("heading", { name: "2 remaining" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Saved (1)" }).click();
  await expect(page.getByRole("heading", { name: "Mara, 30" })).toBeVisible();
  await page.getByRole("button", { name: "Return to batch" }).click();
  await expect(page.getByRole("heading", { name: "Mara, 30" })).toBeVisible();
  await page.getByRole("button", { name: "Safety options" }).click();
  await page.getByLabel("Reason").selectOption("other");
  await page
    .getByLabel("Details optional")
    .fill("A concern visible before matching");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Report received. Reference status: received.",
  );
  await page.getByRole("button", { name: "See the full calculation" }).click();
  await expect(page.getByText(/Your directed fit:/)).toBeVisible();
  await expect(page.getByText(/Their directed fit:/)).toBeVisible();
  await expect(
    page.getByText(/Their factor weights are private personal inputs/),
  ).toBeVisible();
  await expect(page.getByText(/Harmonic mean:/)).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Interested" }).click();
  await page.getByRole("button", { name: /Connections · 1/ }).click();
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
  await expect(page.getByRole("textbox", { name: "Message Mara" })).toHaveValue(
    /You mentioned/,
  );
  await page
    .getByRole("textbox", { name: "Message Mara" })
    .fill("Hello from the repeatable journey");
  await page.getByRole("button", { name: "Send" }).click();
  await page.reload();
  await page.getByRole("button", { name: /Connections · 1/ }).click();
  await expect(
    page.getByText("Hello from the repeatable journey"),
  ).toBeVisible();
  await expectAccessible(page);

  await page.getByText("Safety").click();
  await page.getByRole("button", { name: "Report" }).click();
  await page.getByLabel("Reason").selectOption({ label: "Offline safety" });
  await page
    .getByLabel("Details optional")
    .fill("Conversation context for the report");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Report received. Reference status: received.",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Block" }).click();
  await expect(
    page.getByRole("heading", { name: "No connections yet" }),
  ).toBeVisible();

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
  await expect(page.getByText("Report #2")).toBeVisible();
  await expect(page.getByText(/offline safety · received/i)).toBeVisible();
  await expect(page.getByText(/she\/her · Winterthur/)).toBeVisible();
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
});
