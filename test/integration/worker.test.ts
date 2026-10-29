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
import { enqueue, getEntry } from "@/server/queue";
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
    expect(await worker.finished(await worker.add(url, VIDEO))).toMatchObject({ state: "failed", errorCategory: "other" });
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

  it("extracts a 192 kbps MP3 with cover and title", async () => {
    const { entry } = await download(`${fixtureUrl}/videos/clip-two`, AUDIO);

    expect(entry).toMatchObject({ state: "done", title: "Clip Two" });
    expect(entry.filePath).toMatch(/Clip Two \[clip-two\]\.mp3$/);
    const { streams, format } = await ffprobe(entry.filePath!);
    expect(streams.find((s) => s.codec_type === "audio")).toMatchObject({ codec_name: "mp3", bit_rate: "192000" });
    expect(streams.find((s) => s.codec_type === "video")?.disposition.attached_pic).toBe(1);
    expect(format.tags?.title).toBe("Clip Two");
  });
});
