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

for (const link of [
  "https://www.youtube.com/watch?list=RDdQw4w9WgXcQ",
  "https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ",
  "https://music.youtube.com/watch?list=RDAMVMdQw4w9WgXcQ",
]) {
  test(`a whole Mix is refused without a preview: ${link}`, async ({ page }) => {
    // Ein Mix darf weder die Vorschau laden noch yt-dlp erreichen. yt-dlp hieße „No downloadable media“.
    const previews: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/playlist-preview")) previews.push(request.url());
    });
    await page.goto("/");
    const form = page.getByRole("form", { name: "Add a download" });
    const field = form.getByRole("textbox", { name: "Link" });

    await field.fill(link);
    await form.getByRole("button", { name: "Add", exact: true }).click();

    await expect(form.getByRole("alert")).toHaveText(
      "YouTube Mixes can't be downloaded. Add a single video from the Mix instead.",
    );
    await expect(field).toHaveValue(link);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(previews).toEqual([]);
  });
}

test("a running live stream is refused and adds nothing", async ({ page }) => {
  // HLS ohne Ende: yt-dlp meldet `is_live` und nähme auf, bis der Stream endet.
  const link = `${fixtureUrl}/live/stream.m3u8`;
  await page.goto("/");
  const form = page.getByRole("form", { name: "Add a download" });
  const field = form.getByRole("textbox", { name: "Link" });

  await field.fill(link);
  await form.getByRole("button", { name: "Add", exact: true }).click();

  await expect(form.getByRole("alert")).toHaveText("Live streams can't be downloaded.");
  await expect(field).toHaveValue(link);
  await expect(page.getByRole("listitem").filter({ hasText: "stream" })).toHaveCount(0);
});

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
