import { and, asc, eq } from "drizzle-orm";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { createInterface } from "node:readline";
import { parseMedia } from "@/lib/media";
import type { Db } from "../db/open";
import { queueEntries, type QueueEntry } from "../db/schema";
import type { Logger } from "../log";
import { dataPaths } from "../paths";
import { buildDownloadArgs } from "./args";
import { parseLine, type DoneLine } from "./parse-line";

/** Feste Werte im Code, für Tests injizierbar. */
export type Timing = { tickMs: number };
export const PRODUCTION_TIMING: Timing = { tickMs: 1000 };

export type Clock = { now(): number };
export const systemClock: Clock = { now: () => Date.now() };

export type WorkerDeps = {
  db: Db;
  ytDlpPath: string;
  dataDir: string;
  timing: Timing;
  clock: Clock;
  log: Logger;
};

export type Worker = { stop(): Promise<void> };

const SLOTS = 1;
const PROGRESS_WRITE_INTERVAL_MS = 1000;

export function startWorker(deps: WorkerDeps): Worker {
  const running = new Set<Promise<void>>();
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = () => {
    if (stopped) return;
    while (running.size < SLOTS) {
      const entry = claimNext(deps.db);
      if (!entry) break;
      // Ein Fehler im Slot darf den Next-Prozess nicht als unhandled rejection beenden.
      const slot = runSlot(deps, entry)
        .catch((error) => deps.log.error(`queue entry ${entry.id}: slot failed: ${error?.stack ?? error}`))
        .finally(() => running.delete(slot));
      running.add(slot);
    }
    timer = setTimeout(tick, deps.timing.tickMs);
    timer.unref();
  };
  tick();

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await Promise.all(running);
    },
  };
}

/** Setzt den ältesten wartenden Eintrag in einer Transaktion auf läuft. */
function claimNext(db: Db): QueueEntry | undefined {
  return db.transaction((tx) => {
    const next = tx
      .select()
      .from(queueEntries)
      .where(eq(queueEntries.state, "waiting"))
      .orderBy(asc(queueEntries.queuedAt), asc(queueEntries.id))
      .limit(1)
      .get();
    if (!next) return undefined;
    return tx
      .update(queueEntries)
      .set({ state: "running", phase: "download" })
      .where(and(eq(queueEntries.id, next.id), eq(queueEntries.state, "waiting")))
      .returning()
      .get();
  });
}

async function runSlot({ db, ytDlpPath, dataDir, clock, log }: WorkerDeps, entry: QueueEntry) {
  const paths = dataPaths(dataDir);
  const tmpDir = join(paths.tmp, String(entry.id));
  const update = (values: Partial<QueueEntry>) =>
    db.update(queueEntries).set(values).where(eq(queueEntries.id, entry.id)).run();

  let done: DoneLine | undefined;
  let exitCode: number | null = null;
  try {
    await mkdir(tmpDir, { recursive: true });
    await mkdir(paths.downloads, { recursive: true });

    const media = parseMedia(entry);
    if (!media) throw new Error(`invalid media type ${entry.mediaType} / ${entry.resolution}`);
    const args = buildDownloadArgs({
      url: entry.url,
      media,
      downloadsDir: paths.downloads,
      tmpDir,
      cacheDir: paths.cache,
    });
    log.debug(`queue entry ${entry.id}: ${[ytDlpPath, ...args].map(shellQuote).join(" ")}`);
    const child = spawn(ytDlpPath, args, { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    if (child.pid) update({ pgid: child.pid });

    let lastProgressWrite = -Infinity;
    const onLine = (line: string) => {
      const parsed = parseLine(line);
      if (parsed.kind === "done") {
        done = parsed;
      } else if (parsed.kind === "postprocess") {
        update({ phase: "postprocess", postprocessor: parsed.postprocessor });
      } else if (parsed.kind === "progress") {
        const now = clock.now();
        if (now - lastProgressWrite < PROGRESS_WRITE_INTERVAL_MS && parsed.status !== "finished") return;
        lastProgressWrite = now;
        update({
          phase: "download",
          downloadedBytes: parsed.downloadedBytes ?? null,
          totalBytes: parsed.totalBytes ?? null,
          totalBytesEstimate: parsed.totalBytesEstimate ?? null,
          fragmentIndex: parsed.fragmentIndex ?? null,
          fragmentCount: parsed.fragmentCount ?? null,
          speed: parsed.speed ?? null,
          eta: parsed.eta ?? null,
        });
      }
    };
    createInterface({ input: child.stdout }).on("line", onLine);
    createInterface({ input: child.stderr }).on("line", onLine);

    exitCode = await new Promise<number | null>((resolve) => {
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code));
    });
  } finally {
    if (exitCode === 0 && done && isInside(paths.downloads, done.filepath)) {
      update({
        state: "done",
        title: done.title,
        filePath: done.filepath,
        finishedAt: clock.now(),
        pgid: null,
      });
    } else {
      // Die Fehlerklassifikation folgt in einem späteren Ticket.
      update({ state: "failed", errorCategory: "other", finishedAt: clock.now(), pgid: null });
    }
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function isInside(dir: string, file: string) {
  const rel = relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Für die Debug-Zeile: der Aufruf lässt sich so in eine Shell kopieren. */
function shellQuote(arg: string) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}
