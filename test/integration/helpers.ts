import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import { migrateDb, openDb } from "@/server/db/open";
import { dataPaths } from "@/server/paths";

export const YTDLP = process.env.YTDLP_PATH ?? "/usr/local/bin/yt-dlp";

/** Datenordner und DB in einem Temp-Ordner, nach dem Test gelöscht. */
export async function tempDataDir() {
  const dataDir = await mkdtemp(join(tmpdir(), "videoloader-"));
  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));
  return dataDir;
}

export async function tempDb() {
  const dataDir = await tempDataDir();
  const db = openDb(dataPaths(dataDir).db);
  migrateDb(db);
  return { dataDir, db };
}

export async function waitFor<T>(
  probe: () => T | undefined | false,
  { timeoutMs = 30_000, intervalMs = 50 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`waitFor timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
