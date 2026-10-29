import { expect, test, type Locator, type Page } from "@playwright/test";

const fixtureUrl = process.env.FIXTURE_URL ?? "http://localhost:8080";

async function downloadName(page: Page, row: Locator) {
  const [download] = await Promise.all([page.waitForEvent("download"), row.getByRole("link", { name: "Download" }).click()]);
  return download.suggestedFilename();
}

test("a duplicate warns inline, and Add anyway gives the second entry its own file", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("form", { name: "Add a download" });
  const link = form.getByRole("textbox", { name: "Link" });
  const add = form.getByRole("button", { name: "Add", exact: true });
  const warning = form.getByRole("alert");
  const rows = page.getByRole("listitem").filter({ hasText: "Dup Clip" });
  const videoRows = rows.filter({ hasText: "Video · Best" });

  // Gedrosselt, damit der erste Eintrag noch in der Queue ist, wenn der zweite kommt.
  await link.fill(`${fixtureUrl}/videos/dup-clip?rate=40000`);
  await add.click();
  await expect(rows).toHaveCount(1);

  // Anderer Link, dasselbe Medium.
  await link.fill(`${fixtureUrl}/videos/dup-clip`);
  await add.click();
  await expect(warning).toContainText("Already in queue.");
  await expect(warning).toContainText(/“Dup Clip” is (downloading|queued) as Video · Best/);
  await expect(warning.getByRole("link", { name: "Show existing" })).toHaveCount(0);
  await expect(rows).toHaveCount(1);

  await warning.getByRole("button", { name: "Add anyway" }).click();
  await expect(warning).toBeHidden();
  await expect(videoRows).toHaveCount(2);

  // Dasselbe Medium als MP3 ist kein Duplikat.
  await form.getByRole("button", { name: "Audio (MP3)" }).click();
  await link.fill(`${fixtureUrl}/videos/dup-clip`);
  await add.click();
  await expect(rows.filter({ hasText: "Audio · MP3" })).toHaveCount(1);
  await expect(warning).toHaveCount(0);
  await form.getByRole("button", { name: "Video", exact: true }).click();

  await expect(videoRows.filter({ hasText: "Done" })).toHaveCount(2, { timeout: 60_000 });
  const [first, second] = await videoRows.all();
  const names = [await downloadName(page, first), await downloadName(page, second)];
  expect([...names].sort()).toEqual(["Dup Clip [dup-clip] (2).mp4", "Dup Clip [dup-clip].mp4"]);

  // Jetzt liegt die Datei vor. „Show existing“ findet den Eintrag auch hinter einem Filter.
  await link.fill(`${fixtureUrl}/videos/dup-clip`);
  await add.click();
  await expect(warning).toContainText("Already downloaded.");
  await expect(warning).toContainText(/“Dup Clip” exists as Video · Best, downloaded (just now|\d+ minutes? ago)\./);
  const filters = page.getByRole("group", { name: "Filter" });
  await filters.getByRole("button", { name: /^Active/ }).click();
  await expect(videoRows).toHaveCount(0);

  await warning.getByRole("link", { name: "Show existing" }).click();
  await expect(filters.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
  const target = page.locator("li:target");
  await expect(target).toContainText("Dup Clip");
  await expect(target).toContainText("Video · Best");
  await expect(target).toBeInViewport();

  await warning.getByRole("button", { name: "Cancel" }).click();
  await expect(warning).toBeHidden();
  await expect(link).toHaveValue("");
  await expect(videoRows).toHaveCount(2);

  // Delete der ersten Datei lässt die zweite stehen.
  const plain = names[0] === "Dup Clip [dup-clip].mp4" ? first : second;
  const other = plain === first ? second : first;
  const otherHref = (await other.getByRole("link", { name: "Download" }).getAttribute("href"))!;
  await plain.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog", { name: "Delete this file?" }).getByRole("button", { name: "Delete" }).click();
  await expect(videoRows).toHaveCount(1);

  const response = await page.request.get(otherHref);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("(2).mp4");
});
