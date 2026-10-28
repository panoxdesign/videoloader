import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import type { Media } from "@/lib/media";
import { dataPaths } from "@/server/paths";
import { enqueue, getEntry } from "@/server/queue";
import { startWorker } from "@/server/worker/worker";
import { createLogger } from "@/server/log";
import { AUDIO, tempDb, VIDEO, waitFor, YTDLP } from "./helpers";

const fixtureUrl = inject("fixtureUrl");
const run = promisify(execFile);

/** Startet einen Worker, reiht einen Link ein und wartet, bis der Eintrag fertig oder fehlgeschlagen ist. */
async function download(url: string, media: Media) {
  const { dataDir, db } = await tempDb();
  const lines: string[] = [];
  const log = createLogger({ level: "debug", timeZone: "UTC", write: (line) => lines.push(line) });
  const worker = startWorker({
    db,
    ytDlpPath: YTDLP,
    dataDir,
    timing: { tickMs: 50 },
    clock: { now: () => Date.now() },
    log,
  });
  onTestFinished(() => worker.stop());

  const { id } = enqueue(db, url, media, Date.now());
  const entry = await waitFor(() => {
    const e = getEntry(db, id);
    return e && ["done", "failed"].includes(e.state) && e;
  });
  return { entry, dataDir, lines };
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
    expect(entry).toMatchObject({ state: "done", title: "Clip One", filePath: mediaFile });
    expect(existsSync(mediaFile)).toBe(true);
    expect(existsSync(join(dataPaths(dataDir).tmp, String(entry.id)))).toBe(false);
    // Bei LOG_LEVEL=debug steht der vollständige Aufruf im Log.
    expect(lines.find((line) => line.includes(" DEBUG ") && line.includes(YTDLP))).toContain(`-- ${url}`);
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
