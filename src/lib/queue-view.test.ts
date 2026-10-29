import { describe, expect, it } from "vitest";
import type { EntryState } from "@/server/db/schema";
import {
  countByFilter,
  formatAge,
  formatSize,
  matchesFilter,
  progressFraction,
  queuePositions,
  sortForList,
  type EntryView,
} from "./queue-view";

function entry(id: number, state: EntryState, queuedAt: number, finishedAt: number | null = null): EntryView {
  return {
    id,
    url: `https://example.com/${id}`,
    title: null,
    thumbnailUrl: null,
    mediaType: "video",
    resolution: "best",
    state,
    phase: state === "running" ? "download" : null,
    queuedAt,
    finishedAt,
    downloadedBytes: null,
    totalBytes: null,
    totalBytesEstimate: null,
    errorCategory: null,
    fileSize: null,
    fileMissing: false,
  };
}

describe("sortForList", () => {
  it("lists running and waiting by position, then failed and cancelled, then done, newest first", () => {
    const entries = [
      entry(1, "done", 10, 100),
      entry(2, "failed", 20, 200),
      entry(3, "waiting", 30),
      entry(4, "done", 40, 400),
      entry(5, "running", 25),
      entry(6, "cancelled", 50, 300),
      entry(7, "waiting", 5),
    ];
    expect(sortForList(entries).map((e) => e.id)).toEqual([7, 5, 3, 6, 2, 4, 1]);
  });

  it("breaks ties by id", () => {
    const entries = [entry(2, "waiting", 10), entry(1, "waiting", 10), entry(3, "done", 1, 50), entry(4, "done", 1, 50)];
    expect(sortForList(entries).map((e) => e.id)).toEqual([1, 2, 4, 3]);
  });

  it("does not change the input", () => {
    const entries = [entry(1, "done", 1, 1), entry(2, "waiting", 2)];
    sortForList(entries);
    expect(entries.map((e) => e.id)).toEqual([1, 2]);
  });
});

describe("filters", () => {
  it.each([
    ["waiting", ["all", "active"]],
    ["running", ["all", "active"]],
    ["done", ["all", "done"]],
    ["failed", ["all", "failedCancelled"]],
    ["cancelled", ["all", "failedCancelled"]],
  ] as const)("puts %s into %j", (state, filters) => {
    const matching = (["all", "active", "done", "failedCancelled"] as const).filter((f) => matchesFilter(state, f));
    expect(matching).toEqual(filters);
  });

  it("counts the entries of every filter", () => {
    const entries = [
      entry(1, "waiting", 1),
      entry(2, "running", 2),
      entry(3, "waiting", 3),
      entry(4, "done", 4, 4),
      entry(5, "failed", 5, 5),
      entry(6, "cancelled", 6, 6),
    ];
    expect(countByFilter(entries)).toEqual({ all: 6, active: 3, done: 1, failedCancelled: 2 });
  });
});

describe("queuePositions", () => {
  it("numbers only waiting entries, in queue order", () => {
    const entries = [entry(1, "waiting", 30), entry(2, "running", 10), entry(3, "waiting", 20), entry(4, "done", 5, 5)];
    expect(queuePositions(entries)).toEqual(new Map([[3, 1], [1, 2]]));
  });
});

describe("progressFraction", () => {
  it("uses total bytes, falls back to the estimate and caps at 1", () => {
    expect(progressFraction({ downloadedBytes: 25, totalBytes: 100, totalBytesEstimate: null })).toBe(0.25);
    expect(progressFraction({ downloadedBytes: 50, totalBytes: null, totalBytesEstimate: 200 })).toBe(0.25);
    expect(progressFraction({ downloadedBytes: 300, totalBytes: null, totalBytesEstimate: 200 })).toBe(1);
  });

  it("is undefined without a known size", () => {
    expect(progressFraction({ downloadedBytes: 50, totalBytes: null, totalBytesEstimate: null })).toBeUndefined();
    expect(progressFraction({ downloadedBytes: null, totalBytes: 100, totalBytesEstimate: null })).toBeUndefined();
  });
});

describe("formatSize", () => {
  it.each([
    [512, "512 byte"],
    [212_480, "212 kB"],
    [6_100_000, "6.1 MB"],
    [286_000_000, "286 MB"],
    [1_940_000_000, "1.9 GB"],
    [12_400_000_000, "12 GB"],
  ])("formats %i bytes as %s", (bytes, text) => {
    expect(formatSize(bytes, "en")).toBe(text);
  });

  it("follows the locale", () => {
    // Mit geschütztem Leerzeichen vor der Einheit.
    expect(formatSize(1_940_000_000, "de")).toBe("1,9\u00a0GB");
  });
});

describe("formatAge", () => {
  const MINUTE = 60_000;
  const DAY = 24 * 60 * MINUTE;

  it.each([
    [10_000, "just now"],
    [5 * MINUTE, "5 minutes ago"],
    [3 * 60 * MINUTE, "3 hours ago"],
    [DAY + MINUTE, "yesterday"],
    [2 * DAY, "2 days ago"],
    [45 * DAY, "last month"],
    [400 * DAY, "last year"],
  ])("formats an age of %i ms as %s", (ms, text) => {
    expect(formatAge(ms)).toBe(text);
  });
});
