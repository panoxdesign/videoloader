import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { migrateDb, openDb } from "@/server/db/open";
import { getEntry } from "@/server/queue";
import { tempDataDir } from "./helpers";

/** Kopie des Migrationsordners, in der das Journal nur die ersten `count` Migrationen kennt. */
async function migrationsUpTo(dir: string, count: number) {
  await cp(join(process.cwd(), "drizzle"), dir, { recursive: true });
  const journalFile = join(dir, "meta/_journal.json");
  const journal = JSON.parse(await readFile(journalFile, "utf8"));
  journal.entries = journal.entries.slice(0, count);
  await writeFile(journalFile, JSON.stringify(journal));
  return dir;
}

describe("migrations", () => {
  it("keeps entries from before media types as video up to 1080p", async () => {
    const dataDir = await tempDataDir();
    const db = openDb(join(dataDir, "db/videoloader.db"));
    migrate(db, { migrationsFolder: await migrationsUpTo(join(dataDir, "drizzle"), 1) });
    db.$client
      .prepare("insert into queue_entries (url, title, state, queued_at, file_path) values (?, ?, ?, ?, ?)")
      .run("https://example.com/v", "Old", "done", 1, "/data/downloads/Old [v].mp4");

    migrateDb(db);

    expect(getEntry(db, 1)).toMatchObject({ title: "Old", state: "done", mediaType: "video", resolution: "1080" });
  });

  it("rejects audio with a resolution and video without one", async () => {
    const dataDir = await tempDataDir();
    const db = openDb(join(dataDir, "db/videoloader.db"));
    migrateDb(db);
    const insert = db.$client.prepare(
      "insert into queue_entries (url, media_type, resolution, state, queued_at) values ('u', ?, ?, 'waiting', 1)",
    );

    expect(() => insert.run("audio", "720")).toThrow(/CHECK constraint failed: queue_entries_media_check/);
    expect(() => insert.run("video", null)).toThrow(/CHECK constraint failed: queue_entries_media_check/);
    expect(() => insert.run("video", "2160")).toThrow(/CHECK constraint failed/);
  });
});
