import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { dataPaths } from "@/server/paths";
import { enqueue, getEntry } from "@/server/queue";
import { startWorker } from "@/server/worker/worker";
import { createLogger } from "@/server/log";
import { tempDb, waitFor, YTDLP } from "./helpers";

const fixtureUrl = inject("fixtureUrl");

describe("worker", () => {
  it("finishes a single page and leaves the media file in downloads/", async () => {
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

    const url = `${fixtureUrl}/videos/clip-one`;
    const { id } = enqueue(db, url, Date.now());

    const entry = await waitFor(() => {
      const e = getEntry(db, id);
      return e && ["done", "failed"].includes(e.state) && e;
    });
    const mediaFile = join(dataPaths(dataDir).downloads, "Clip One [clip-one].mp4");
    expect(entry).toMatchObject({ state: "done", title: "Clip One", filePath: mediaFile });
    expect(existsSync(mediaFile)).toBe(true);
    expect(existsSync(join(dataPaths(dataDir).tmp, String(id)))).toBe(false);
    // Bei LOG_LEVEL=debug steht der vollständige Aufruf im Log.
    expect(lines.find((line) => line.includes(" DEBUG ") && line.includes(YTDLP))).toContain(`-- ${url}`);
  });
});
