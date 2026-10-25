import { join } from "node:path";

/** Die Prüfung von `DATA_DIR` folgt mit der Konfigurationsprüfung. */
export function dataDirFromEnv() {
  return process.env.DATA_DIR || "/data";
}

export function dataPaths(dataDir: string) {
  return {
    db: join(dataDir, "db", "videoloader.db"),
    downloads: join(dataDir, "downloads"),
    tmp: join(dataDir, "tmp"),
    cache: join(dataDir, "cache"),
  };
}
