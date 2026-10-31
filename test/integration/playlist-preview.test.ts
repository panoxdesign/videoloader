import { eq } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
import type { CheckResult } from "@/server/check/parse-check";
import { queueEntries } from "@/server/db/schema";
import { dataPaths } from "@/server/paths";
import { enqueuePlaylist, loadPreview, openPreview, PREVIEW_TTL_MS, storePreview, takePreview } from "@/server/playlist-preview";
import { enqueue, listEntries } from "@/server/queue";
import { AUDIO, tempDb, VIDEO, YTDLP } from "./helpers";

const fixtureUrl = inject("fixtureUrl");

type Playlist = Extract<CheckResult, { kind: "playlist" }>;

const entry = (page: string, title: string) => ({
  url: `http://fixtures:8080/videos/${page}`,
  source: "Generic",
  mediaId: null,
  title,
  thumbnailUrl: null,
  duration: null,
  fileTitle: title,
  fileMediaId: null,
});

const PLAYLIST: Playlist = {
  kind: "playlist",
  title: "Clips: The Mix",
  fileTitle: "Clips： The Mix",
  fileId: "feed",
  entries: [entry("clip-one", "Clip One"), entry("clip-two", "Clip Two")],
};

describe("playlist preview", () => {
  it("gives back what was stored, with folder, media and numbered entries", async () => {
    const { db } = await tempDb();
    const { key, preview } = storePreview(db, VIDEO, PLAYLIST, 1_000);

    expect(preview).toEqual({
      media: VIDEO,
      title: "Clips: The Mix",
      folder: "Clips： The Mix",
      entries: [
        { number: 1, ...entry("clip-one", "Clip One") },
        { number: 2, ...entry("clip-two", "Clip Two") },
      ],
    });
    expect(takePreview(db, key, 2_000)).toEqual(preview);
  });

  it("can be taken only once, so a double click adds nothing twice", async () => {
    const { db } = await tempDb();
    const { key } = storePreview(db, VIDEO, PLAYLIST, 1_000);
    expect(takePreview(db, key, 2_000)).toBeDefined();
    expect(takePreview(db, key, 2_000)).toBeUndefined();
  });

  it("expires 15 minutes after loading", async () => {
    const { db } = await tempDb();
    const { key } = storePreview(db, VIDEO, PLAYLIST, 1_000);
    const { key: other } = storePreview(db, VIDEO, PLAYLIST, 1_000);
    expect(takePreview(db, key, 1_000 + PREVIEW_TTL_MS - 1)).toBeDefined();
    expect(takePreview(db, other, 1_000 + PREVIEW_TTL_MS)).toBeUndefined();
  });

  it("knows no key it did not hand out", async () => {
    const { db } = await tempDb();
    storePreview(db, VIDEO, PLAYLIST, 1_000);
    expect(takePreview(db, "not-a-key", 2_000)).toBeUndefined();
  });
});

describe("openPreview", () => {
  const youtube = (id: string, title: string) => ({
    url: `https://www.youtube.com/watch?v=${id}`,
    source: "Youtube",
    mediaId: id,
    title,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: 312,
    fileTitle: title,
    fileMediaId: id,
  });
  const playlist: Playlist = {
    kind: "playlist",
    title: "Space",
    fileTitle: "Space",
    fileId: "PL1",
    entries: [youtube("done", "Done One"), youtube("wait", "Waiting One"), youtube("new", "New One"), entry("clip-one", "Clip One")],
  };

  async function setup() {
    const { dataDir, db } = await tempDb();
    const { downloads } = dataPaths(dataDir);
    await mkdir(downloads, { recursive: true });
    const checked = (id: string) => ({ source: "Youtube", mediaId: id, title: id, thumbnailUrl: null, duration: null });
    const done = enqueue(db, "https://youtu.be/done", VIDEO, 1, checked("done"));
    const filePath = join(downloads, "Done One [done].mp4");
    await writeFile(filePath, "video");
    db.update(queueEntries).set({ state: "done", filePath, finishedAt: 2 }).where(eq(queueEntries.id, done.id)).run();
    enqueue(db, "https://youtu.be/wait", VIDEO, 3, checked("wait"));
    return { db, downloads };
  }

  it("marks duplicates per entry, never entries without a media id", async () => {
    const { db, downloads } = await setup();
    const view = await openPreview(db, downloads, VIDEO, playlist, 10);

    expect(view.title).toBe("Space");
    expect(view.media).toEqual(VIDEO);
    expect(view.items.map(({ number, duplicate }) => [number, duplicate])).toEqual([
      [1, "downloaded"],
      [2, "queued"],
      [3, undefined],
      [4, undefined],
    ]);
  });

  it("counts duplicates only in the same media type", async () => {
    const { db, downloads } = await setup();
    const view = await openPreview(db, downloads, AUDIO, playlist, 10);
    expect(view.items.every((item) => item.duplicate === undefined)).toBe(true);
  });

  it("shows the browser what the dialog needs, but no file names", async () => {
    const { db, downloads } = await setup();
    const view = await openPreview(db, downloads, VIDEO, playlist, 10);

    expect(view.items[2]).toEqual({
      number: 3,
      url: "https://www.youtube.com/watch?v=new",
      title: "New One",
      duration: 312,
      thumbnailUrl: "https://i.ytimg.com/vi/new/hqdefault.jpg",
    });
    expect(takePreview(db, view.key, 10)?.entries[2]).toMatchObject({ number: 3, fileTitle: "New One", fileMediaId: "new" });
  });
});

describe("enqueuePlaylist", () => {
  const three: Playlist = { ...PLAYLIST, entries: [...PLAYLIST.entries, entry("clip-three", "Clip Three")] };

  it("adds the ticked entries as waiting entries in the media type of the preview, with folder and number", async () => {
    const { db } = await tempDb();
    const { key } = storePreview(db, AUDIO, three, 1_000);

    expect(enqueuePlaylist(db, key, [3, 1], 2_000)).toEqual({ kind: "added", count: 2 });
    expect(listEntries(db).map(({ url, mediaType, resolution, state, title, fileTitle, playlistTitle, playlistFolder, playlistNumber }) => ({
      url, mediaType, resolution, state, title, fileTitle, playlistTitle, playlistFolder, playlistNumber,
    }))).toEqual([
      {
        url: "http://fixtures:8080/videos/clip-one",
        mediaType: "audio",
        resolution: null,
        state: "waiting",
        title: "Clip One",
        fileTitle: "Clip One",
        playlistTitle: "Clips: The Mix",
        playlistFolder: "Clips： The Mix",
        playlistNumber: 1,
      },
      {
        url: "http://fixtures:8080/videos/clip-three",
        mediaType: "audio",
        resolution: null,
        state: "waiting",
        title: "Clip Three",
        fileTitle: "Clip Three",
        playlistTitle: "Clips: The Mix",
        playlistFolder: "Clips： The Mix",
        playlistNumber: 3,
      },
    ]);
  });

  it("adds nothing a second time and nothing after the preview expired", async () => {
    const { db } = await tempDb();
    const { key } = storePreview(db, VIDEO, three, 1_000);
    enqueuePlaylist(db, key, [1], 2_000);
    expect(enqueuePlaylist(db, key, [1, 2], 2_000)).toEqual({ kind: "expired" });

    const { key: late } = storePreview(db, VIDEO, three, 1_000);
    expect(enqueuePlaylist(db, late, [2], 1_000 + PREVIEW_TTL_MS)).toEqual({ kind: "expired" });
    expect(listEntries(db)).toHaveLength(1);
  });

  it("ignores numbers that are not in the preview", async () => {
    const { db } = await tempDb();
    const { key } = storePreview(db, VIDEO, three, 1_000);
    expect(enqueuePlaylist(db, key, [2, 2, 7, 0, -1], 2_000)).toEqual({ kind: "added", count: 1 });
    expect(listEntries(db).map((e) => e.playlistNumber)).toEqual([2]);
  });
});

describe("loadPreview", () => {
  async function load(url: string, { signal = new AbortController().signal, timeoutMs = 30_000 } = {}) {
    const { dataDir, db } = await tempDb();
    return loadPreview({ db, ytDlpPath: YTDLP, dataDir, url, media: VIDEO, signal, timeoutMs, now: 1_000 });
  }

  it("checks the link and opens the preview", async () => {
    const result = await load(`${fixtureUrl}/feed.rss`);
    expect(result).toMatchObject({ kind: "preview", view: { title: "Clips: The Mix", media: VIDEO } });
    expect(result.kind === "preview" && result.view.items.map((item) => item.title)).toEqual(["Clip One", "Clip Two", "Clip Three"]);
  });

  it("stops yt-dlp when the browser cancels", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const started = Date.now();
    expect(await load(`${fixtureUrl}/feed.rss?delay=20000`, { signal: controller.signal })).toEqual({ kind: "cancelled" });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("gives up after the preview timeout", async () => {
    const started = Date.now();
    expect(await load(`${fixtureUrl}/feed.rss?delay=20000`, { timeoutMs: 300 })).toEqual({ kind: "timedOut" });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("finds no playlist at a single video", async () => {
    expect(await load(`${fixtureUrl}/videos/clip-one`)).toEqual({ kind: "none" });
  });
});
