import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Media } from "@/lib/media";
import { queueEntries, type QueueEntry } from "@/server/db/schema";
import { enqueue, getEntry, listEntries, queuePosition, removeEntry, retryEntry } from "@/server/queue";
import { AUDIO, tempDb, VIDEO } from "./helpers";

async function setup() {
  const { db } = await tempDb();
  const add = (values: Partial<QueueEntry> = {}, media: Media = VIDEO, queuedAt = 100) => {
    const { id } = enqueue(db, "https://example.com/v", media, queuedAt);
    if (Object.keys(values).length > 0) db.update(queueEntries).set(values).where(eq(queueEntries.id, id)).run();
    return getEntry(db, id)!;
  };
  const FAILED = {
    state: "failed",
    errorCategory: "network",
    rawLog: "ERROR: Connection refused",
    finishedAt: 500,
    fileName: "Clip [x].mp4",
    downloadedBytes: 1234,
    totalBytes: 5000,
    phase: "download",
  } as const;
  return { db, add, FAILED };
}

describe("retryEntry", () => {
  it("puts a failed entry back to waiting behind all other waiting ones, with the error cleared", async () => {
    const { db, add, FAILED } = await setup();
    const failed = add(FAILED, AUDIO, 10);
    // Eingereiht im selben Moment wie der Retry, aber mit höherer ID: Auch dahinter muss er landen.
    const sameTime = add({}, VIDEO, 1000);
    const later = add({}, VIDEO, 2000);

    expect(retryEntry(db, failed.id, 1000)).toBe(true);

    const retried = getEntry(db, failed.id)!;
    expect(retried).toMatchObject({
      state: "waiting",
      mediaType: "audio",
      resolution: null,
      errorCategory: null,
      rawLog: null,
      finishedAt: null,
      downloadedBytes: null,
      totalBytes: null,
      phase: null,
      // Den Namen behält er, solange ihn beim Start niemand belegt.
      fileName: "Clip [x].mp4",
    });
    expect(queuePosition(db, retried)).toBe(3);
    expect(queuePosition(db, sameTime)).toBe(1);
    expect(queuePosition(db, later)).toBe(2);
  });

  it("also retries a cancelled entry and keeps its media type and resolution", async () => {
    const { db, add } = await setup();
    const cancelled = add({ state: "cancelled", finishedAt: 5 }, { mediaType: "video", resolution: "720" });

    expect(retryEntry(db, cancelled.id, 1000)).toBe(true);
    expect(getEntry(db, cancelled.id)).toMatchObject({ state: "waiting", mediaType: "video", resolution: "720", queuedAt: 1000 });
  });

  it.each(["waiting", "running", "done"] as const)("leaves a %s entry alone", async (state) => {
    const { db, add } = await setup();
    const entry = add({ state, finishedAt: state === "done" ? 5 : null });

    expect(retryEntry(db, entry.id, 1000)).toBe(false);
    expect(getEntry(db, entry.id)).toEqual(entry);
  });

  it("is false for an entry that does not exist", async () => {
    const { db } = await setup();
    expect(retryEntry(db, 42, 1000)).toBe(false);
  });
});

describe("removeEntry", () => {
  it.each(["waiting", "failed", "cancelled"] as const)("removes a %s entry", async (state) => {
    const { db, add } = await setup();
    const entry = add({ state });
    const other = add();

    expect(removeEntry(db, entry.id)).toBe(true);
    expect(listEntries(db).map(({ id }) => id)).toEqual([other.id]);
  });

  it.each(["running", "done"] as const)("leaves a %s entry alone", async (state) => {
    // Laufende entfernt erst Ticket 22, fertige löscht „Delete“ samt Datei.
    const { db, add } = await setup();
    const entry = add({ state });

    expect(removeEntry(db, entry.id)).toBe(false);
    expect(getEntry(db, entry.id)).toEqual(entry);
  });
});
