import { expect, test } from "@playwright/test";

const fixtureUrl = process.env.FIXTURE_URL ?? "http://localhost:8080";

test("a link added in the UI finishes", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("textbox", { name: "Link" }).fill(`${fixtureUrl}/videos/clip-one`);
  await page.getByRole("button", { name: "Add" }).click();

  const entry = page.getByRole("listitem").filter({ hasText: "Clip One" });
  await expect(entry).toContainText("Done", { timeout: 60_000 });
});
