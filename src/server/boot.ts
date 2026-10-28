import { describeConfig, formatProblems, isTimeZone, parseConfig } from "./config/config";
import { gatherFacts } from "./config/facts";
import { migrateDb, openDb } from "./db/open";
import { createLogger } from "./log";
import { BUNDLED_YTDLP, createDataDirs, dataPaths } from "./paths";
import { PRODUCTION_TIMING, startWorker, systemClock, type Worker } from "./worker/worker";

// Nur Start-Guard, kein Signalweg: Web-App und Worker reden ausschließlich über die DB.
const WORKER_KEY = Symbol.for("videoloader.worker");
const registry = globalThis as typeof globalThis & { [WORKER_KEY]?: Worker };

/**
 * Prüft die Konfiguration, öffnet die DB, migriert synchron und stößt den Worker an,
 * ohne auf ihn zu warten. Bei ungültiger Konfiguration endet der Prozess mit Exit 1.
 */
export function boot() {
  if (registry[WORKER_KEY]) return;

  const result = parseConfig(process.env, gatherFacts(process.env));
  if (!result.ok) {
    const zone = process.env.TZ || "UTC";
    createLogger({ level: "error", timeZone: isTimeZone(zone) ? zone : "UTC" }).error(
      formatProblems(result.problems),
    );
    process.exit(1);
  }

  const { config } = result;
  const log = createLogger({ level: config.logLevel, timeZone: config.timeZone });
  log.info(describeConfig(config));
  if (config.password === undefined) {
    log.warn("No password set: anyone who can reach the app can use it. Set APP_PASSWORD or APP_PASSWORD_FILE.");
  }

  createDataDirs(config.dataDir);
  const db = openDb(dataPaths(config.dataDir).db);
  migrateDb(db);
  registry[WORKER_KEY] = startWorker({
    db,
    ytDlpPath: BUNDLED_YTDLP,
    dataDir: config.dataDir,
    timing: PRODUCTION_TIMING,
    clock: systemClock,
    log,
  });
}
