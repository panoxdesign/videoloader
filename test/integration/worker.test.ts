import { eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import type { Media } from "@/lib/media";
import { checkLink } from "@/server/check/check";
import { queueEntries } from "@/server/db/schema";
import { dataPaths } from "@/server/paths";
import { enqueue, getEntry, listEntries } from "@/server/queue";
import { enqueuePlaylist, storePreview } from "@/server/playlist-preview";
import { startWorker } from "@/server/worker/worker";
import { createLogger } from "@/server/log";
import { AUDIO, tempDataDir, tempDb, VIDEO, waitFor, YTDLP } from "./helpers";

const fixtureUrl = inject("fixtureUrl");
const run = promisify(execFile);

/** Fake-yt-dlp: legt die fertige Datei unter dem `-o`-Namen in den ersten `-P`-Ordner und endet mit 1. */
const MOVE_THEN_FAIL = `#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in
    -P) case "$2" in temp:*) ;; *) dir="$2" ;; esac; shift ;;
    -o) out="$2"; shift ;;
  esac
  shift
done
printf media > "$dir/$(printf '%s' "$out" | sed 's/%(ext)s$/mp4/; s/%%/%/g')"
exit 1
`;

/** Fake-yt-dlp: erst ein Fehler, dann mehr als 64 KB anderes und ein zweiter Fehler, Exit 1. */
const ERROR_THEN_CHATTER = `#!/bin/sh
echo 'ERROR: [generic] x: Private video' >&2
seq 1 5000 | sed 's/^/[debug] chatty line /' >&2
echo 'ERROR: Unable to download webpage: Connection refused' >&2
exit 1
`;

/** Fake-yt-dlp: schreibt 100 000 Zeilen (rund 5 MB) auf stderr, dann einen Fehler, und endet mit 1. */
const CHATTY_FAIL = `#!/bin/sh
seq 1 100000 | sed 's/^/[debug] chatty line /' >&2
echo 'ERROR: [generic] x: Private video' >&2
exit 1
`;

/**
 * Ein Worker auf einem frischen Datenordner. `add` prüft den Link wie „Add“ (immer mit dem
 * echten yt-dlp) und reiht ihn dann ein. `ytDlpPath` gilt nur für den Download.
 */
async function startTestWorker({ ytDlpPath = YTDLP } = {}) {
  const { dataDir, db } = await tempDb();
  const paths = dataPaths(dataDir);
  const lines: string[] = [];
  const log = createLogger({ level: "debug", timeZone: "UTC", write: (line) => lines.push(line) });
  const worker = startWorker({
    db,
    ytDlpPath,
    dataDir,
    timing: { tickMs: 50 },
    clock: { now: () => Date.now() },
    log,
  });
  onTestFinished(() => worker.stop());

  return {
    db,
    dataDir,
    paths,
    lines,
    /** Gibt das Prüfergebnis zurück. Reiht gleich danach ein, ohne `await` dazwischen. */
    async check(url: string) {
      const result = await checkLink({ ytDlpPath: YTDLP, url, cacheDir: paths.cache, signal: AbortSignal.timeout(30_000) });
      return result.kind === "video" ? result.media : undefined;
    },
    async add(url: string, media: Media) {
      return enqueue(db, url, media, Date.now(), await this.check(url)).id;
    },
    finished(id: number) {
      return waitFor(() => {
        const e = getEntry(db, id);
        return e && ["done", "failed"].includes(e.state) && e;
      });
    },
  };
}

/** Reiht einen Link ein und wartet, bis der Eintrag fertig oder fehlgeschlagen ist. */
async function download(url: string, media: Media) {
  const worker = await startTestWorker();
  const entry = await worker.finished(await worker.add(url, media));
  return { entry, dataDir: worker.dataDir, lines: worker.lines };
}

type Probe = {
  streams: { codec_type: string; codec_name: string; height?: number; bit_rate?: string; disposition: { attached_pic: number } }[];
  format: { bit_rate: string; tags?: Record<string, string> };
};

async function ffprobe(file: string): Promise<Probe> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  return JSON.parse(stdout);
}

describe("worker", () => {
  it("finishes a single page and leaves the media file in downloads/", async () => {
    const url = `${fixtureUrl}/videos/clip-one`;
    const { entry, dataDir, lines } = await download(url, VIDEO);

    const mediaFile = join(dataPaths(dataDir).downloads, "Clip One [clip-one].mp4");
    expect(entry).toMatchObject({ state: "done", title: "Clip One", fileName: "Clip One [clip-one].mp4", filePath: mediaFile });
    expect(existsSync(mediaFile)).toBe(true);
    expect(entry.fileSize).toBe(statSync(mediaFile).size);
    expect(existsSync(join(dataPaths(dataDir).tmp, String(entry.id)))).toBe(false);
    // Bei LOG_LEVEL=debug steht der vollständige Aufruf im Log.
    expect(lines.find((line) => line.includes(" DEBUG ") && line.includes(YTDLP))).toContain(`-- ${url}`);
  });

  it("gives a second download of the same media its own file with the suffix (2)", async () => {
    const worker = await startTestWorker();
    const url = `${fixtureUrl}/videos/clip-one`;
    const first = await worker.finished(await worker.add(url, VIDEO));
    const second = await worker.finished(await worker.add(url, { mediaType: "video", resolution: "480" }));

    expect(first).toMatchObject({ state: "done", filePath: join(worker.paths.downloads, "Clip One [clip-one].mp4") });
    expect(second).toMatchObject({ state: "done", filePath: join(worker.paths.downloads, "Clip One [clip-one] (2).mp4") });
    expect(existsSync(first.filePath!) && existsSync(second.filePath!)).toBe(true);
  });

  it("does not take the name of a file that is already in downloads/ and leaves that file alone", async () => {
    // Ohne Reservierung lädt yt-dlp dann nicht und meldet trotzdem Erfolg.
    const worker = await startTestWorker();
    await mkdir(worker.paths.downloads, { recursive: true });
    const foreign = join(worker.paths.downloads, "Clip One [clip-one].mp4");
    await writeFile(foreign, "not a video");

    const entry = await worker.finished(await worker.add(`${fixtureUrl}/videos/clip-one`, VIDEO));

    expect(entry).toMatchObject({ state: "done", fileName: "Clip One [clip-one] (2).mp4" });
    expect(statSync(entry.filePath!).size).toBeGreaterThan(1000);
    expect(await readFile(foreign, "utf8")).toBe("not a video");
  });

  it("writes a title with % into the file name as it is", async () => {
    const { entry, dataDir } = await download(`${fixtureUrl}/videos/percent-clip`, AUDIO);

    const name = "100% sure： 50%% off %(id)s [percent-clip].mp3";
    expect(entry).toMatchObject({ state: "done", fileName: name, filePath: join(dataPaths(dataDir).downloads, name) });
    expect(existsSync(entry.filePath!)).toBe(true);
  });

  it.each([
    ["keeps its reserved name while it is free", false, "Kept [clip-one].mp4"],
    ["takes the next free name once its own is taken", true, "Clip One [clip-one].mp4"],
  ])("a retried entry %s", async (_, taken, fileName) => {
    const worker = await startTestWorker();
    await mkdir(worker.paths.downloads, { recursive: true });
    if (taken) await writeFile(join(worker.paths.downloads, "Kept [clip-one].mp4"), "taken");

    // Wie nach einem Retry: wieder wartend, mit dem Namen vom ersten Start. Ohne `await`
    // zwischen den beiden Schritten, damit der Worker den Eintrag nicht vorher nimmt.
    const url = `${fixtureUrl}/videos/clip-one`;
    const checked = await worker.check(url);
    const { id } = enqueue(worker.db, url, VIDEO, Date.now(), checked);
    worker.db.update(queueEntries).set({ fileName: "Kept [clip-one].mp4" }).where(eq(queueEntries.id, id)).run();

    expect(await worker.finished(id)).toMatchObject({ state: "done", fileName, filePath: join(worker.paths.downloads, fileName) });
  });

  it("fails only the entry whose file name cannot be reserved and keeps taking the next ones", async () => {
    const worker = await startTestWorker();
    // Ist `downloads/` eine Datei, wirft schon die Reservierung im Claim (ENOTDIR).
    await writeFile(worker.paths.downloads, "not a directory");

    const url = `${fixtureUrl}/videos/clip-one`;
    const failed = await worker.finished(await worker.add(url, VIDEO));
    expect(failed).toMatchObject({ state: "failed", errorCategory: "other" });
    // Ohne yt-dlp-Ausgabe steht der Fehler der App im Rohlog, sonst wäre „Show details“ leer.
    expect(failed.rawLog).toContain("ENOTDIR");
    expect(worker.lines.find((line) => line.includes(" ERROR "))).toContain("could not reserve a file name");

    await rm(worker.paths.downloads);
    expect(await worker.finished(await worker.add(url, VIDEO))).toMatchObject({ state: "done", fileName: "Clip One [clip-one].mp4" });
  });

  it("removes the media file of a run that fails after yt-dlp has moved it, so a retry keeps the name", async () => {
    // Wie yt-dlp, wenn nach dem Verschieben noch etwas scheitert: Die Datei liegt schon unter
    // `downloads/`, der Exit-Code ist trotzdem 1.
    const fake = join(await tempDataDir(), "yt-dlp");
    await writeFile(fake, MOVE_THEN_FAIL, { mode: 0o755 });
    const worker = await startTestWorker({ ytDlpPath: fake });

    const entry = await worker.finished(await worker.add(`${fixtureUrl}/videos/clip-one`, VIDEO));

    expect(entry).toMatchObject({ state: "failed", fileName: "Clip One [clip-one].mp4", filePath: null });
    expect(await readdir(worker.paths.downloads)).toEqual([]);

    // Wie nach einem Retry: wieder wartend. Der Name ist frei, also bleibt er.
    worker.db.update(queueEntries).set({ state: "waiting", finishedAt: null }).where(eq(queueEntries.id, entry.id)).run();
    expect(await worker.finished(entry.id)).toMatchObject({ state: "failed", fileName: "Clip One [clip-one].mp4" });
    expect(await readdir(worker.paths.downloads)).toEqual([]);
  });

  it.each([
    ["480", 480],
    ["best", 720],
  ] as const)("merges DASH video %s into an MP4 with %i lines", async (resolution, height) => {
    const { entry } = await download(`${fixtureUrl}/videos/clip-dash`, { mediaType: "video", resolution });

    expect(entry.state).toBe("done");
    expect(entry.filePath).toMatch(/\.mp4$/);
    const { streams } = await ffprobe(entry.filePath!);
    expect(streams.filter((s) => s.codec_type === "video" && !s.disposition.attached_pic)).toMatchObject([{ height }]);
    expect(streams.filter((s) => s.codec_type === "audio")).toHaveLength(1);
  });

  it("finishes an RSS entry without id in the playlist folder with its number", async () => {
    // Flat-Einträge aus dem Feed kennen keine Medien-ID. Der Worker prüft sie vor der Reservierung.
    const worker = await startTestWorker();
    const result = await checkLink({
      ytDlpPath: YTDLP,
      url: `${fixtureUrl}/feed.rss`,
      cacheDir: worker.paths.cache,
      signal: AbortSignal.timeout(30_000),
    });
    if (result.kind !== "playlist") throw new Error(`expected a playlist, got ${result.kind}`);
    const { key } = storePreview(worker.db, VIDEO, result, Date.now());
    enqueuePlaylist(worker.db, key, [2], Date.now());

    const entry = await worker.finished(listEntries(worker.db)[0].id);
    const mediaFile = join(worker.paths.downloads, "Clips： The Mix", "002 - Mix Two [mix-two].mp4");
    expect(entry).toMatchObject({
      state: "done",
      source: "Generic",
      mediaId: "mix-two",
      fileName: "Clips： The Mix/002 - Mix Two [mix-two].mp4",
      filePath: mediaFile,
      playlistTitle: "Clips: The Mix",
    });
    expect(statSync(mediaFile).size).toBeGreaterThan(1000);
  });

  it("fails a playlist entry whose check before the start finds nothing, and goes on with the next", async () => {
    const worker = await startTestWorker();
    const flat = (page: string) => ({
      url: `${fixtureUrl}/videos/${page}`,
      source: "Generic",
      mediaId: null,
      title: page,
      thumbnailUrl: null,
      duration: null,
      liveStatus: null,
      fileTitle: page,
      fileMediaId: null,
    });
    const { key } = storePreview(
      worker.db,
      VIDEO,
      { kind: "playlist", title: "Mix", fileTitle: "Mix", fileId: null, entries: [flat("missing"), flat("clip-one")] },
      Date.now(),
    );
    enqueuePlaylist(worker.db, key, [1, 2], Date.now());
    const [broken, fine] = listEntries(worker.db);

    // Die Prüfung vor dem Start bekommt für die fehlende Seite einen 404.
    expect(await worker.finished(broken.id)).toMatchObject({ state: "failed", fileName: null, errorCategory: "unavailable" });
    expect((await worker.finished(broken.id)).rawLog).toContain("HTTP Error 404");
    expect(await worker.finished(fine.id)).toMatchObject({ state: "done", fileName: "Mix/002 - Clip One [clip-one].mp4" });
  });

  it("fails a playlist entry that turns out to be a live stream before it starts recording", async () => {
    // Flat-Einträge fremder Quellen tragen oft kein `live_status`, erst die Prüfung vor dem Start zeigt es.
    const worker = await startTestWorker();
    const stream = {
      url: `${fixtureUrl}/live/stream.m3u8`,
      source: "Generic",
      mediaId: null,
      title: "Live",
      thumbnailUrl: null,
      duration: null,
      liveStatus: null,
      fileTitle: "Live",
      fileMediaId: null,
    };
    const { key } = storePreview(
      worker.db,
      VIDEO,
      { kind: "playlist", title: "Streams", fileTitle: "Streams", fileId: null, entries: [stream] },
      Date.now(),
    );
    enqueuePlaylist(worker.db, key, [1], Date.now());

    expect(await worker.finished(listEntries(worker.db)[0].id)).toMatchObject({
      state: "failed",
      fileName: null,
      filePath: null,
      errorCategory: "live",
    });
  });

  it("extracts a 192 kbps MP3 with cover and title", async () => {
    const { entry } = await download(`${fixtureUrl}/videos/clip-two`, AUDIO);

    expect(entry).toMatchObject({ state: "done", title: "Clip Two" });
    expect(entry.filePath).toMatch(/Clip Two \[clip-two\]\.mp3$/);
    const { streams, format } = await ffprobe(entry.filePath!);
    expect(streams.find((s) => s.codec_type === "audio")).toMatchObject({ codec_name: "mp3", bit_rate: "192000" });
    expect(streams.find((s) => s.codec_type === "video")?.disposition.attached_pic).toBe(1);
    expect(format.tags?.title).toBe("Clip Two");
  });

  describe("failures", () => {
    it("classifies a 404 for the media as unavailable and keeps the yt-dlp output as raw log", async () => {
      const { entry, dataDir } = await download(`${fixtureUrl}/videos/gone-clip`, VIDEO);

      expect(entry).toMatchObject({ state: "failed", errorCategory: "unavailable", filePath: null, pgid: null });
      expect(entry.finishedAt).toBeGreaterThan(0);
      expect(entry.rawLog).toContain("ERROR: unable to download video data: HTTP Error 404");
      expect(entry.rawLog).toContain("[generic] gone-clip: Extracting information");
      expect(existsSync(join(dataPaths(dataDir).tmp, String(entry.id)))).toBe(false);
    });

    it("classifies a connection that breaks off mid-download as a network error", async () => {
      const { entry } = await download(`${fixtureUrl}/videos/cut-clip`, VIDEO);

      expect(entry).toMatchObject({ state: "failed", errorCategory: "network" });
      expect(entry.rawLog).toMatch(/^ERROR: .*Giving up after \d+ retries$/m);
    });

    it("keeps at most the last 64 KB of the output as raw log", async () => {
      const fake = join(await tempDataDir(), "yt-dlp");
      await writeFile(fake, CHATTY_FAIL, { mode: 0o755 });
      const worker = await startTestWorker({ ytDlpPath: fake });

      const entry = await worker.finished(await worker.add(`${fixtureUrl}/videos/clip-one`, VIDEO));

      expect(entry).toMatchObject({ state: "failed", errorCategory: "private" });
      expect(Buffer.byteLength(entry.rawLog!)).toBeLessThanOrEqual(64 * 1024);
      expect(Buffer.byteLength(entry.rawLog!)).toBeGreaterThan(60 * 1024);
      expect(entry.rawLog).toMatch(/chatty line 100000\nERROR: \[generic\] x: Private video$/);
      expect(entry.rawLog).not.toContain("chatty line 1\n");
    });

    it("classifies by the first ERROR: line even after it has left the raw log", async () => {
      const fake = join(await tempDataDir(), "yt-dlp");
      await writeFile(fake, ERROR_THEN_CHATTER, { mode: 0o755 });
      const worker = await startTestWorker({ ytDlpPath: fake });

      const entry = await worker.finished(await worker.add(`${fixtureUrl}/videos/clip-one`, VIDEO));

      expect(entry.rawLog).not.toContain("Private video");
      expect(entry).toMatchObject({ state: "failed", errorCategory: "private" });
    });

    it("goes on with the next entry after a failure", async () => {
      const worker = await startTestWorker();
      const failing = await worker.add(`${fixtureUrl}/videos/gone-clip`, VIDEO);
      const next = await worker.add(`${fixtureUrl}/videos/clip-three`, VIDEO);

      expect(await worker.finished(failing)).toMatchObject({ state: "failed" });
      expect(await worker.finished(next)).toMatchObject({ state: "done" });
    });
  });
});
