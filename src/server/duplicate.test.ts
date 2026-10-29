import { describe, expect, it } from "vitest";
import { duplicateKey, findDuplicate, type DuplicateCandidate } from "./duplicate";

const media = { source: "Youtube", mediaId: "abc", mediaType: "video" } as const;

function entry(overrides: Partial<DuplicateCandidate>): DuplicateCandidate {
  return {
    id: 1,
    source: "Youtube",
    mediaId: "abc",
    mediaType: "video",
    resolution: "1080",
    state: "waiting",
    queuedAt: 100,
    finishedAt: null,
    fileExists: false,
    ...overrides,
  };
}

describe("findDuplicate", () => {
  it.each([
    ["waiting", false, "queued"],
    ["running", false, "queued"],
    ["done", true, "downloaded"],
    ["done", false, undefined],
    ["failed", false, undefined],
    ["cancelled", false, undefined],
  ] as const)("a %s entry (file there: %s) counts as %s", (state, fileExists, kind) => {
    const existing = entry({ state, fileExists, finishedAt: state === "done" ? 200 : null });
    expect(findDuplicate(media, [existing])).toEqual(kind && { kind, entry: existing });
  });

  it("matches regardless of resolution", () => {
    expect(findDuplicate(media, [entry({ resolution: "480" })])).toMatchObject({ kind: "queued" });
    expect(findDuplicate(media, [entry({ resolution: "best" })])).toMatchObject({ kind: "queued" });
  });

  it("does not match another media type", () => {
    expect(findDuplicate(media, [entry({ mediaType: "audio", resolution: null })])).toBeUndefined();
    expect(
      findDuplicate({ ...media, mediaType: "audio" }, [entry({ state: "done", fileExists: true })]),
    ).toBeUndefined();
  });

  it("needs the same source and the same media id", () => {
    expect(findDuplicate(media, [entry({ source: "Vimeo" })])).toBeUndefined();
    expect(findDuplicate(media, [entry({ mediaId: "abd" })])).toBeUndefined();
  });

  it("never matches without source or media id", () => {
    expect(findDuplicate({ ...media, mediaId: null }, [entry({ mediaId: null })])).toBeUndefined();
    expect(findDuplicate({ ...media, source: null }, [entry({ source: null })])).toBeUndefined();
  });

  it("prefers an existing file, the newest first", () => {
    const queued = entry({ id: 1 });
    const older = entry({ id: 2, state: "done", fileExists: true, finishedAt: 200 });
    const newer = entry({ id: 3, state: "done", fileExists: true, finishedAt: 300 });
    expect(findDuplicate(media, [queued, older, newer])).toEqual({ kind: "downloaded", entry: newer });
  });

  it("otherwise names the running entry before waiting ones, then the first in the queue", () => {
    const later = entry({ id: 1, queuedAt: 300 });
    const first = entry({ id: 2, queuedAt: 100 });
    const running = entry({ id: 3, state: "running", queuedAt: 200 });
    expect(findDuplicate(media, [later, first, running])).toEqual({ kind: "queued", entry: running });
    expect(findDuplicate(media, [later, first])).toEqual({ kind: "queued", entry: first });
  });
});

describe("duplicateKey", () => {
  it("is the same for the same media and media type, whatever the link", () => {
    expect(duplicateKey(media)).toBe(duplicateKey({ ...media }));
    expect(duplicateKey(media)).not.toBe(duplicateKey({ ...media, mediaType: "audio" }));
    expect(duplicateKey(media)).not.toBe(duplicateKey({ ...media, mediaId: "abd" }));
  });

  it("does not exist without source or media id", () => {
    expect(duplicateKey({ ...media, source: null })).toBeUndefined();
    expect(duplicateKey({ ...media, mediaId: null })).toBeUndefined();
  });
});
