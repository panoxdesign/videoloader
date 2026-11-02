import { expect, test, type Page } from "@playwright/test";

const fixtureUrl = process.env.FIXTURE_URL ?? "http://localhost:8080";

/**
 * Die Fixture-Seiten „gone-clip“, „cut-clip“ und „flaky-clip“ bestehen die Prüfung bei „Add“, erst
 * der Download scheitert. Jeder Test hat seine eigene Seite, denn E2E läuft parallel.
 */
async function addLink(page: Page, path: string) {
  await page.getByRole("textbox", { name: "Link" }).fill(`${fixtureUrl}${path}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

test("a 404 fails with a short message, the raw log opens and closes, and remove takes the entry out", async ({ page }) => {
  await page.goto("/");
  await addLink(page, "/videos/gone-clip");

  const entry = page.getByRole("listitem").filter({ hasText: "Gone Clip" });
  await expect(entry).toContainText("Failed", { timeout: 60_000 });
  await expect(entry).toContainText("This video is unavailable or has been removed.");

  const show = entry.getByRole("button", { name: "Show details" });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();

  const log = entry.getByLabel("yt-dlp output for “Gone Clip”");
  await expect(log).toContainText("ERROR: unable to download video data: HTTP Error 404");
  await expect(log).toContainText("[generic] gone-clip: Extracting information");
  const hide = entry.getByRole("button", { name: "Hide details" });
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  // Die Liste lädt jede Sekunde neu, der Block bleibt dabei offen.
  await page.waitForTimeout(1500);
  await expect(log).toBeVisible();

  await hide.click();
  await expect(log).toBeHidden();

  const filters = page.getByRole("group", { name: "Filter" });
  await filters.getByRole("button", { name: /^Active/ }).click();
  await expect(entry).toBeHidden();
  await filters.getByRole("button", { name: /^Failed & cancelled/ }).click();
  await expect(entry).toBeVisible();

  // „Remove“ fragt nicht nach.
  await entry.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(entry).toHaveCount(0);
});

test("a connection that breaks off mid-download shows the network message", async ({ page }) => {
  await page.goto("/");
  await addLink(page, "/videos/cut-clip");

  const entry = page.getByRole("listitem").filter({ hasText: "Cut Clip" });
  await expect(entry).toContainText("Network error – check the server's connection.", { timeout: 60_000 });
});

test("retry puts a failed entry back into the queue and it finishes", async ({ page }) => {
  await page.goto("/");
  // Das Medium antwortet beim ersten Abruf mit 404, danach liefert es.
  await addLink(page, "/videos/flaky-clip");

  const entry = page.getByRole("listitem").filter({ hasText: "Flaky Clip" });
  await expect(entry).toContainText("Failed", { timeout: 60_000 });

  await entry.getByRole("button", { name: "Retry" }).click();
  await expect(entry).toContainText("Done", { timeout: 60_000 });
  await expect(entry).not.toContainText("This video is unavailable");
  await expect(entry.getByRole("button", { name: "Retry" })).toHaveCount(0);
});
