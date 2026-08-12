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
  await page.getByRole("button", { name: "See my introductions" }).click();

  await expect(
    page.getByRole("heading", { name: "3 remaining" }),
  ).toBeVisible();
  await expect(page.getByText("Within 5 km")).toBeVisible();
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
  await expect(page.getByRole("status")).toHaveText(
    "Report received. Reference status: received.",
  );
  await page.getByRole("button", { name: "Block" }).click();
  await expect(
    page.getByRole("heading", { name: "No connections yet" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByText(/Nothing suggested yet/)).toBeVisible();
  await expect(page.getByText(/Nothing changes automatically/)).toBeVisible();

  await page.getByRole("button", { name: "Your profile" }).click();
  await expectAccessible(page);
  await expect(page.getByText(/she\/her · Winterthur/)).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Display name" }).fill("Taylor Two");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("heading", { name: "Taylor Two, 31" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause introductions" }).click();
  await expect(page.getByRole("status")).toContainText("Introductions paused");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByRole("status")).not.toBeVisible();
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
