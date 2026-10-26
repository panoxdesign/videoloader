import { expect, test } from "@playwright/test";

const fixtureUrl = process.env.FIXTURE_URL ?? "http://localhost:8080";

test("a link added in the UI finishes and shows up under the Done filter", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("textbox", { name: "Link" }).fill(`${fixtureUrl}/videos/clip-one`);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const entry = page.getByRole("listitem").filter({ hasText: "Clip One" });
  await expect(entry).toContainText("Done", { timeout: 60_000 });

  const filters = page.getByRole("group", { name: "Filter" });
  await filters.getByRole("button", { name: /^Active/ }).click();
  await expect(filters.getByRole("button", { name: /^Active/ })).toHaveAttribute("aria-pressed", "true");
  await expect(entry).toBeHidden();

  await filters.getByRole("button", { name: /^Done/ }).click();
  await expect(entry).toBeVisible();
});
