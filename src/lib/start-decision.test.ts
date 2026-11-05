import { describe, expect, it } from "vitest";
import { entriesToStart } from "./start-decision";

const entry = (id: number, queuedAt: number) => ({ id, queuedAt });
const ids = (entries: readonly { id: number }[]) => entries.map(({ id }) => id);

describe("entriesToStart", () => {
  const waiting = [entry(1, 100), entry(2, 200), entry(3, 300)];

  it("starts the oldest waiting entry in a free slot", () => {
    expect(ids(entriesToStart({ waiting, running: 0, paused: false, slots: 1 }))).toEqual([1]);
  });

  it("fills every free slot, oldest first", () => {
    expect(ids(entriesToStart({ waiting, running: 1, paused: false, slots: 3 }))).toEqual([1, 2]);
  });

  it("starts nothing while the queue is paused", () => {
    expect(entriesToStart({ waiting, running: 0, paused: true, slots: 2 })).toEqual([]);
  });

  it("starts nothing when all slots are busy", () => {
    expect(entriesToStart({ waiting, running: 2, paused: false, slots: 2 })).toEqual([]);
  });

  // Etwa wenn MAX_CONCURRENT_DOWNLOADS nach einem Neustart kleiner ist.
  it("starts nothing when more entries run than there are slots", () => {
    expect(entriesToStart({ waiting, running: 3, paused: false, slots: 2 })).toEqual([]);
  });

  it("starts nothing without waiting entries", () => {
    expect(entriesToStart({ waiting: [], running: 0, paused: false, slots: 2 })).toEqual([]);
  });

  it("orders by queued-at, not by the order it gets the entries in", () => {
    const shuffled = [entry(3, 300), entry(1, 100), entry(2, 200)];
    expect(ids(entriesToStart({ waiting: shuffled, running: 0, paused: false, slots: 2 }))).toEqual([1, 2]);
  });

  // Einträge einer Playlist teilen sich einen Ordnungswert.
  it("breaks a tie on queued-at by the lower id", () => {
    const playlist = [entry(12, 100), entry(10, 100), entry(11, 100)];
    expect(ids(entriesToStart({ waiting: playlist, running: 0, paused: false, slots: 2 }))).toEqual([10, 11]);
  });

  // „Retry“ setzt den Ordnungswert hinter den letzten wartenden.
  it("starts a retried entry after the ones that were waiting before it", () => {
    const withRetry = [entry(1, 500), entry(2, 200), entry(3, 300)];
    expect(ids(entriesToStart({ waiting: withRetry, running: 0, paused: false, slots: 3 }))).toEqual([2, 3, 1]);
  });

  it("returns the entries it was given, with all their fields", () => {
    const rich = [{ id: 1, queuedAt: 100, url: "https://example.com/a" }];
    expect(entriesToStart({ waiting: rich, running: 0, paused: false, slots: 1 })).toEqual(rich);
  });
});
