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

test("a done entry downloads under its file name and is deleted after confirmation", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("textbox", { name: "Link" }).fill(`${fixtureUrl}/videos/umlaut-clip`);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const title = "Grüße aus Köln/Zürich: Café & Crème brûlée?";
  const entry = page.getByRole("listitem").filter({ hasText: title });
  await expect(entry).toContainText("Done", { timeout: 60_000 });
  await expect(entry).toContainText(/Video · Best · [\d.]+ (kB|MB)/);

  const link = entry.getByRole("link", { name: "Download" });
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  // yt-dlp ersetzt mit `--windows-filenames` „/“, „:“ und „?“ durch Vollbreiten-Zeichen.
  expect(download.suggestedFilename()).toBe("Grüße aus Köln⧸Zürich： Café & Crème brûlée？ [umlaut-clip].mp4");

  const href = (await link.getAttribute("href"))!;
  const whole = await page.request.get(href);
  expect(whole.status()).toBe(200);
  const size = Number(whole.headers()["content-length"]);
  const part = await page.request.get(href, { headers: { range: "bytes=10-19" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toBe(`bytes 10-19/${size}`);
  expect(await part.body()).toEqual((await whole.body()).subarray(10, 20));

  await entry.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this file?" });
  await expect(dialog).toContainText(`“${title}” (`);
  await expect(dialog).toContainText("This can't be undone.");
  // Abbrechen lässt alles stehen.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(entry).toBeVisible();

  await entry.getByRole("button", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(entry).toHaveCount(0);
  expect((await page.request.get(href)).status()).toBe(404);
});
