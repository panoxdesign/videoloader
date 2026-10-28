import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveDataDir } from "./config/config";

export const BUNDLED_YTDLP = "/usr/local/bin/yt-dlp";

/** Für Request-Kontexte. Geprüft hat `register` den Wert schon beim Start. */
export function dataDirFromEnv() {
  return resolveDataDir(process.env);
}

export function dataPaths(dataDir: string) {
  return {
    db: join(dataDir, "db", "videoloader.db"),
    downloads: join(dataDir, "downloads"),
    tmp: join(dataDir, "tmp"),
    cache: join(dataDir, "cache"),
    bin: join(dataDir, "bin"),
    config: join(dataDir, "config"),
  };
}

/** Die Unterordner legt die App selbst an, `downloads/` darf schon separat gemountet sein. */
export function createDataDirs(dataDir: string) {
  const paths = dataPaths(dataDir);
  for (const dir of [dirname(paths.db), paths.downloads, paths.tmp, paths.cache, paths.bin, paths.config]) {
    mkdirSync(dir, { recursive: true });
  }
}
