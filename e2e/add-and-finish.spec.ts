import { expect, test } from "@playwright/test";

const fixtureUrl = process.env.FIXTURE_URL ?? "http://localhost:8080";

test("a link added in the UI finishes and shows up under the Done filter", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("textbox", { name: "Link" }).fill(`${fixtureUrl}/videos/clip-one`);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const entry = page.getByRole("listitem").filter({ hasText: "Clip One" });
  await expect(entry).toContainText("Done", { timeout: 60_000 });
  await expect(entry).toContainText("Video · Best");

  const filters = page.getByRole("group", { name: "Filter" });
  await filters.getByRole("button", { name: /^Active/ }).click();
  await expect(filters.getByRole("button", { name: /^Active/ })).toHaveAttribute("aria-pressed", "true");
  await expect(entry).toBeHidden();

  await filters.getByRole("button", { name: /^Done/ }).click();
  await expect(entry).toBeVisible();
});

test("a link added as MP3 finishes as audio", async ({ page }) => {
  await page.goto("/");

  const form = page.getByRole("form", { name: "Add a download" });
  // Video mit „Best“ ist vorgewählt, der Hinweis steht immer daneben.
  await expect(form.getByRole("button", { name: "Max resolution: Best" })).toBeVisible();
  await expect(form).toContainText("Choose 1080p for best compatibility.");

  await form.getByRole("button", { name: "Max resolution: Best" }).click();
  await page.getByRole("menuitemradio", { name: /^1080p/ }).click();
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(form.getByRole("button", { name: "Max resolution: 1080p" })).toBeVisible();
  await expect(form).not.toContainText("Choose 1080p for best compatibility.");

  await form.getByRole("button", { name: "Audio (MP3)" }).click();
  await expect(form.getByRole("button", { name: "Audio (MP3)" })).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByRole("button", { name: /^Max resolution/ })).toBeHidden();
  await expect(form).toContainText("192 kbps · with cover");

  await form.getByRole("textbox", { name: "Link" }).fill(`${fixtureUrl}/videos/clip-two`);
  await form.getByRole("button", { name: "Add", exact: true }).click();

  const entry = page.getByRole("listitem").filter({ hasText: "Clip Two" });
  await expect(entry).toContainText("Done", { timeout: 60_000 });
  await expect(entry).toContainText("Audio · MP3");
});
