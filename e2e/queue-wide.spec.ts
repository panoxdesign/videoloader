import { expect, test, type Page } from "@playwright/test";

/**
 * Pause und Sammelaktionen treffen die ganze Queue. Das Projekt „queue-wide“ startet diese Datei
 * erst nach allen anderen Tests (`playwright.config.ts`), ihre Tests laufen nacheinander.
 */
const fixtureUrl = process.env.FIXTURE_URL ?? "http://localhost:8080";

async function addLink(page: Page, path: string) {
  await page.getByRole("textbox", { name: "Link" }).fill(`${fixtureUrl}${path}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  // Nach dem Einreihen ist das Feld wieder leer.
  await expect(page.getByRole("textbox", { name: "Link" })).toHaveValue("", { timeout: 30_000 });
}

const banner = (page: Page) => page.getByRole("status").filter({ hasText: "Queue paused" });
const row = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });
const moreActions = (page: Page) => page.getByRole("button", { name: "More queue actions" });

// Kein Test hinterlässt eine pausierte Queue.
test.afterEach(async ({ page }) => {
  await page.goto("/");
  const resume = banner(page).getByRole("button", { name: "Resume queue" });
  if (await resume.isVisible()) await resume.click();
  await expect(banner(page)).toBeHidden();
});

test("pause starts nothing, survives a reload and resume starts again", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pause queue" }).click();

  await expect(banner(page)).toContainText("Queue paused – running downloads will finish.");
  await expect(page.getByRole("button", { name: "Resume queue" })).toHaveCount(2);

  await addLink(page, "/videos/pause-clip");
  const entry = row(page, "Pause Clip");
  await expect(entry).toContainText("Paused");
  await expect(entry).toContainText(/#\d+/);
  // Der Worker prüft jede Sekunde. Zwei Sekunden später wartet der Eintrag immer noch.
  await page.waitForTimeout(2000);
  await expect(entry).toContainText("Paused");

  // Die Pause liegt in der DB, nicht im Browser.
  await page.reload();
  await expect(banner(page)).toBeVisible();
  await expect(entry).toContainText("Paused");

  await banner(page).getByRole("button", { name: "Resume queue" }).click();
  await expect(banner(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Pause queue" })).toBeVisible();
  await expect(entry).toContainText("Done", { timeout: 60_000 });
});

test("on a phone, pause and resume sit in the menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Pause queue" })).toBeHidden();

  await moreActions(page).click();
  await page.getByRole("menuitem", { name: "Pause queue" }).click();
  await expect(banner(page)).toBeVisible();

  await moreActions(page).click();
  await page.getByRole("menuitem", { name: "Resume queue" }).click();
  await expect(banner(page)).toBeHidden();
});

test("clear waiting and clear failed & cancelled each remove only their group, after confirming", async ({ page }) => {
  await page.goto("/");
  const filters = page.getByRole("group", { name: "Filter" });
  const doneChip = filters.getByRole("button", { name: /^Done/ });

  // Ein fehlgeschlagener Eintrag, solange die Queue läuft.
  await addLink(page, "/videos/clear-gone");
  await expect(row(page, "Clear Gone")).toContainText("Failed", { timeout: 60_000 });

  // Zwei wartende, die die Pause festhält.
  await page.getByRole("button", { name: "Pause queue" }).click();
  await addLink(page, "/videos/clear-one");
  await addLink(page, "/videos/clear-two");
  await expect(row(page, "Clear One")).toContainText("Paused");
  await expect(row(page, "Clear Two")).toContainText("Paused");
  const doneBefore = await doneChip.textContent();

  // Abbrechen im Dialog lässt alles stehen.
  await moreActions(page).click();
  await page.getByRole("menuitem", { name: /^Clear waiting \(\d+\)$/ }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/Clear \d+ waiting entries\?/);
  await expect(dialog).toContainText("Running downloads continue.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, "Clear One")).toBeVisible();

  await moreActions(page).click();
  await page.getByRole("menuitem", { name: /^Clear waiting \(\d+\)$/ }).click();
  await dialog.getByRole("button", { name: "Clear waiting" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, "Clear One")).toHaveCount(0);
  await expect(row(page, "Clear Two")).toHaveCount(0);
  await expect(row(page, "Clear Gone")).toBeVisible();
  await expect(doneChip).toHaveText(doneBefore!);

  await moreActions(page).click();
  await expect(page.getByRole("menuitem", { name: "Clear waiting (0)" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("menuitem", { name: /^Clear failed & cancelled \(\d+\)$/ }).click();
  await expect(dialog).toContainText(/Clear \d+ failed & cancelled entr(y|ies)\?/);
  await expect(dialog).toContainText("Downloaded files are not affected.");
  await dialog.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, "Clear Gone")).toHaveCount(0);
  await expect(filters.getByRole("button", { name: /^Failed & cancelled/ })).toHaveText(/\D0$/);
  await expect(doneChip).toHaveText(doneBefore!);
});
