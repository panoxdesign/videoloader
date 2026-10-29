import { eq } from "drizzle-orm";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Media } from "@/lib/media";
import { queueEntries, type QueueEntry } from "@/server/db/schema";
import { dataPaths } from "@/server/paths";
import { enqueue, findDuplicateEntry, queuePosition } from "@/server/queue";
import { AUDIO, tempDb, VIDEO } from "./helpers";

const CHECKED = { source: "Youtube", mediaId: "abc", title: "How Rockets Land", thumbnailUrl: null, duration: null };
const SAME = { source: "Youtube", mediaId: "abc", mediaType: "video" } as const;

async function setup() {
  const { dataDir, db } = await tempDb();
  const { downloads } = dataPaths(dataDir);
  await mkdir(downloads, { recursive: true });
  let now = 0;
  const add = (media: Media = VIDEO, values: Partial<QueueEntry> = {}, checked = CHECKED) => {
    const { id } = enqueue(db, `https://youtu.be/${checked.mediaId}`, media, ++now, checked);
    if (Object.keys(values).length > 0) db.update(queueEntries).set(values).where(eq(queueEntries.id, id)).run();
    return db.select().from(queueEntries).where(eq(queueEntries.id, id)).get()!;
  };
  /** Ein fertiger Eintrag, dessen Mediendatei der Test selbst anlegt. */
  const done = async (name: string) => {
    const filePath = join(downloads, name);
    await writeFile(filePath, "video");
    return add(VIDEO, { state: "done", filePath, fileName: name, finishedAt: 50 });
  };
  return { db, downloads, add, done };
}

describe("duplicate lookup", () => {
  it("finds a done entry while its file is there, and no longer once it is gone", async () => {
    const { db, downloads, done } = await setup();
    const entry = await done("How Rockets Land [abc].mp4");

    expect(await findDuplicateEntry(db, downloads, SAME)).toMatchObject({ kind: "downloaded", entry: { id: entry.id } });
    await rm(entry.filePath!);
    expect(await findDuplicateEntry(db, downloads, SAME)).toBeUndefined();
  });

  it("finds a waiting entry in any resolution, but not one of another media type", async () => {
    const { db, downloads, add } = await setup();
    add(AUDIO);
    expect(await findDuplicateEntry(db, downloads, SAME)).toBeUndefined();

    const waiting = add({ mediaType: "video", resolution: "480" });
    expect(await findDuplicateEntry(db, downloads, SAME)).toMatchObject({ kind: "queued", entry: { id: waiting.id } });
    expect(await findDuplicateEntry(db, downloads, { ...SAME, mediaType: "audio" })).toMatchObject({ kind: "queued" });
  });

  it.each(["failed", "cancelled"] as const)("ignores a %s entry", async (state) => {
    const { db, downloads, add } = await setup();
    add(VIDEO, { state });
    expect(await findDuplicateEntry(db, downloads, SAME)).toBeUndefined();
  });

  it("only matches the same source and media id", async () => {
    const { db, downloads, add } = await setup();
    add(VIDEO, {}, { ...CHECKED, mediaId: "abd" });
    add(VIDEO, {}, { ...CHECKED, source: "Vimeo" });
    expect(await findDuplicateEntry(db, downloads, SAME)).toBeUndefined();
  });
});

describe("queuePosition", () => {
  it("counts waiting entries in queue order from 1 and skips the others", async () => {
    const { db, add } = await setup();
    add(VIDEO, { state: "running" });
    const first = add();
    add(VIDEO, { state: "failed" });
    const second = add();

    expect(queuePosition(db, first)).toBe(1);
    expect(queuePosition(db, second)).toBe(2);
  });
});
