import { migrateDb, openDb } from "./db/open";
import { dataDirFromEnv, dataPaths } from "./paths";
import { PRODUCTION_TIMING, startWorker, systemClock, type Worker } from "./worker/worker";

export const BUNDLED_YTDLP = "/usr/local/bin/yt-dlp";

// Nur Start-Guard, kein Signalweg: Web-App und Worker reden ausschließlich über die DB.
const WORKER_KEY = Symbol.for("videoloader.worker");
const registry = globalThis as typeof globalThis & { [WORKER_KEY]?: Worker };

/** Öffnet die DB, migriert synchron und stößt den Worker an, ohne auf ihn zu warten. */
export function boot() {
  if (registry[WORKER_KEY]) return;

  const dataDir = dataDirFromEnv();
  const db = openDb(dataPaths(dataDir).db);
  migrateDb(db);
  registry[WORKER_KEY] = startWorker({
    db,
    ytDlpPath: BUNDLED_YTDLP,
    dataDir,
    timing: PRODUCTION_TIMING,
    clock: systemClock,
  });
}
