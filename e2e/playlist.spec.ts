import { expect, test, type Locator, type Page } from "@playwright/test";
import type { LoadResult } from "@/server/playlist-preview";

const fixtureUrl = process.env.FIXTURE_URL ?? "http://localhost:8080";

/** Ein YouTube-Playlist-Link geht über den Route Handler. YouTube wird nie erreicht, `page.route` fängt ab. */
const youtubePlaylist = "https://www.youtube.com/playlist?list=PLtest";

async function downloadName(page: Page, row: Locator) {
  const [download] = await Promise.all([page.waitForEvent("download"), row.getByRole("link", { name: "Download" }).click()]);
  return download.suggestedFilename();
}

function addForm(page: Page) {
  const form = page.getByRole("form", { name: "Add a download" });
  return {
    link: form.getByRole("textbox", { name: "Link" }),
    add: form.getByRole("button", { name: "Add", exact: true }),
  };
}

/** Die Antwort des Route Handlers, ohne yt-dlp. */
function fulfillPreview(page: Page, result: LoadResult) {
  return page.route("**/api/playlist-preview", (route) => route.fulfill({ json: result }));
}

test("an RSS feed opens the preview, and the chosen entries download into the playlist folder", async ({ page }) => {
  // Zwei Downloads mit Startabstand, dazu die anderen Specs in derselben Queue.
  test.setTimeout(180_000);
  await page.goto("/");
  const { link, add } = addForm(page);
  const dialog = page.getByRole("dialog", { name: "Clips: The Mix" });
  const rows = page.getByRole("listitem").filter({ hasText: "Clips: The Mix" });

  // Kein YouTube-Link, also prüft die Action. Sie liefert eine Playlist und öffnet den Dialog direkt.
  await link.fill(`${fixtureUrl}/feed.rss`);
  await add.click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText("3 videos · will be added as Video · Best");

  const selectAll = dialog.getByRole("checkbox", { name: "Select all" });
  const entry = (title: string) => dialog.getByRole("checkbox", { name: title });
  await expect(selectAll).toBeChecked();
  for (const title of ["Mix One", "Mix Two", "Mix Three"]) await expect(entry(title)).toBeChecked();
  await expect(dialog).toContainText("3 of 3 selected");

  await entry("Mix Two").click();
  await expect(entry("Mix Two")).not.toBeChecked();
  await expect(selectAll).toHaveAttribute("aria-checked", "mixed");
  await expect(dialog).toContainText("2 of 3 selected");

  await dialog.getByRole("button", { name: "Add 2 to queue" }).click();
  await expect(dialog).toBeHidden();
  await expect(link).toHaveValue("");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Mix Two" })).toHaveCount(0);

  await expect(rows.filter({ hasText: "Done" })).toHaveCount(2, { timeout: 150_000 });
  const names: string[] = [];
  for (const row of await rows.all()) names.push(await downloadName(page, row));
  expect(names.sort()).toEqual(["001 - Mix One [mix-one].mp4", "003 - Mix Three [mix-three].mp4"]);

  // RSS-Einträge haben keine Medien-ID, die zweite Vorschau markiert deshalb nichts (Ticket 26, Kommentar).
  await link.fill(`${fixtureUrl}/feed.rss`);
  await add.click();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText("3 of 3 selected");
  await expect(dialog.getByText(/^Already (downloaded|in queue)$/)).toHaveCount(0);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(2);
});

test("duplicates in the preview carry a badge and start unchecked", async ({ page }) => {
  await fulfillPreview(page, {
    kind: "preview",
    view: {
      // Unbekannter Schlüssel: Einreihen meldet, dass die Vorschau abgelaufen ist.
      key: "e2e-unknown-key",
      title: "Mocked Mix",
      media: { mediaType: "video", resolution: "1080" },
      startIntervalSeconds: 15,
      items: [
        { number: 1, url: "https://www.youtube.com/watch?v=new", title: "New One", duration: 125, thumbnailUrl: null },
        { number: 2, url: "https://www.youtube.com/watch?v=done", title: "Done One", duration: 61, thumbnailUrl: null, duplicate: "downloaded" },
        { number: 3, url: "https://www.youtube.com/watch?v=wait", title: "Waiting One", duration: null, thumbnailUrl: null, duplicate: "queued" },
      ],
    },
  });
  await page.goto("/");
  const { link, add } = addForm(page);
  await link.fill(youtubePlaylist);
  await add.click();

  const dialog = page.getByRole("dialog", { name: "Mocked Mix" });
  await expect(dialog).toContainText("3 videos · will be added as Video · 1080p");
  const entry = (title: string) => dialog.getByRole("checkbox", { name: new RegExp(`^${title}`) });
  // Das Badge steht mobil unter dem Titel und breit daneben, sichtbar ist je eins.
  const badge = (text: string) => dialog.getByText(text, { exact: true }).filter({ visible: true });

  await expect(entry("New One")).toBeChecked();
  await expect(entry("Done One")).not.toBeChecked();
  await expect(entry("Waiting One")).not.toBeChecked();
  await expect(badge("Already downloaded")).toHaveCount(1);
  await expect(badge("Already in queue")).toHaveCount(1);
  await expect(dialog.getByRole("listitem").filter({ hasText: "Done One" })).toContainText("Already downloaded");
  await expect(dialog.getByRole("listitem").filter({ hasText: "Waiting One" })).toContainText("Already in queue");
  await expect(dialog).toContainText("1 of 3 selected");
  await expect(dialog.getByRole("checkbox", { name: "Select all" })).toHaveAttribute("aria-checked", "mixed");

  // Ein Duplikat anhaken heißt „Add anyway“.
  await entry("Done One").click();
  await expect(dialog).toContainText("2 of 3 selected");

  await dialog.getByRole("button", { name: "Add 2 to queue" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("This preview has expired. Add the playlist link again.");
  await expect(dialog.getByRole("button", { name: "Add 2 to queue" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "Mocked Mix" })).toHaveCount(0);
});

test("Cancel while loading closes the dialog and adds nothing", async ({ page }) => {
  // Die Anfrage bleibt hängen, bis der Browser sie abbricht.
  let aborted = false;
  await page.route("**/api/playlist-preview", () => {});
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/api/playlist-preview")) aborted = true;
  });
  await page.goto("/");
  const { link, add } = addForm(page);
  await link.fill(youtubePlaylist);
  await add.click();

  const dialog = page.getByRole("dialog", { name: "Loading playlist…" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveText("");
  await expect(dialog.getByRole("status")).toHaveText("Large playlist – this can take a while", { timeout: 8_000 });

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => aborted).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: "PLtest" })).toHaveCount(0);
});

test("a preview that times out shows the timeout message", async ({ page }) => {
  await fulfillPreview(page, { kind: "timedOut" });
  await page.goto("/");
  const { link, add } = addForm(page);
  await link.fill(youtubePlaylist);
  await add.click();

  const alert = page.getByRole("alertdialog", { name: "Can't preview playlist" });
  await expect(alert).toContainText("Playlist too large to preview (timed out)");
  await alert.getByRole("button", { name: "Close" }).click();
  await expect(alert).toBeHidden();
});

test("the preview endpoint refuses foreign origins and non-JSON bodies", async ({ page, request, baseURL }) => {
  const endpoint = "/api/playlist-preview";
  // Gültige Eingaben: Ohne die Prüfung würde yt-dlp die Vorschau laden.
  const data = { url: `${fixtureUrl}/feed.rss`, mediaType: "video", resolution: "best" };
  const ownOrigin = new URL(baseURL ?? "http://localhost:3000").origin;

  const foreign = await request.post(endpoint, { headers: { origin: "https://evil.example" }, data });
  expect(foreign.status()).toBe(403);
  expect(await foreign.json()).toEqual({ kind: "none" });
  // Der API-Kontext schickt von sich aus kein `Origin`.
  expect((await request.post(endpoint, { data })).status()).toBe(403);
  // So käme ein fremdes `text/plain`-fetch an, das kein Preflight braucht.
  const plain = await request.post(endpoint, {
    headers: { origin: ownOrigin, "content-type": "text/plain" },
    data: JSON.stringify(data),
  });
  expect(plain.status()).toBe(415);

  // Gegenprobe: Das fetch der eigenen Seite kommt durch und scheitert erst an der leeren Eingabe.
  await page.goto("/");
  const own = await page.evaluate(
    (url) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.status),
    endpoint,
  );
  expect(own).toBe(400);
});
