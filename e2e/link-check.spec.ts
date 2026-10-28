import { expect, test } from "@playwright/test";

const fixtureUrl = process.env.FIXTURE_URL ?? "http://localhost:8080";

test("a checked link shows title and thumbnail while the entry still waits or runs", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("form", { name: "Add a download" });

  // Gedrosselt, damit der Eintrag nicht schon fertig ist: Den Titel kennt dann nur die Prüfung.
  await form.getByRole("textbox", { name: "Link" }).fill(`${fixtureUrl}/videos/clip-three?rate=50000`);
  await form.getByRole("button", { name: "Add", exact: true }).click();

  const entry = page.getByRole("listitem").filter({ hasText: "Clip Three" });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText(/Queued|Downloading/);

  const thumbnail = entry.locator("img");
  await expect(thumbnail).toHaveAttribute("src", `${fixtureUrl}/media/clip.jpg`);
  await expect(thumbnail).toHaveAttribute("loading", "lazy");
  await expect(thumbnail).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await expect(entry).toContainText("Done", { timeout: 60_000 });
});

for (const [name, link] of [
  ["an invalid link", "notaurl"],
  ["a 404 page", `${fixtureUrl}/videos/missing`],
]) {
  test(`${name} shows the inline message and adds nothing`, async ({ page }) => {
    await page.goto("/");
    const form = page.getByRole("form", { name: "Add a download" });
    const field = form.getByRole("textbox", { name: "Link" });

    await field.fill(link);
    await form.getByRole("button", { name: "Add", exact: true }).click();

    await expect(form.getByRole("alert")).toHaveText("No downloadable media found at this link.");
    // Der Link bleibt stehen, damit man ihn korrigieren kann.
    await expect(field).toHaveValue(link);
    await expect(page.getByRole("listitem").filter({ hasText: link })).toHaveCount(0);
  });
}

test("a double click on Add creates one entry", async ({ page }) => {
  await page.goto("/");
  const form = page.getByRole("form", { name: "Add a download" });

  await form.getByRole("textbox", { name: "Link" }).fill(`${fixtureUrl}/videos/clip-four`);
  await form.getByRole("button", { name: "Add", exact: true }).dblclick();

  const entries = page.getByRole("listitem").filter({ hasText: "Clip Four" });
  await expect(entries.first()).toBeVisible();
  // Eine zweite, eingereihte Prüfung hielte das Formular weiter auf „Checking…“.
  await expect(form.getByRole("button", { name: "Add", exact: true })).toBeEnabled();
  await expect(form.getByRole("textbox", { name: "Link" })).toHaveValue("");
  await expect(entries).toHaveCount(1);
});
