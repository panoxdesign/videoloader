import { describe, expect, it } from "vitest";
import type { CheckResult } from "@/server/check/parse-check";
import { PREVIEW_TTL_MS, storePreview, takePreview } from "@/server/playlist-preview";
import { tempDb, VIDEO } from "./helpers";

type Playlist = Extract<CheckResult, { kind: "playlist" }>;

const entry = (page: string, title: string) => ({
  url: `http://fixtures:8080/videos/${page}`,
  source: "Generic",
  mediaId: null,
  title,
  thumbnailUrl: null,
  duration: null,
  fileTitle: title,
  fileMediaId: null,
});

const PLAYLIST: Playlist = {
  kind: "playlist",
  title: "Clips: The Mix",
  fileTitle: "Clips： The Mix",
  fileId: "feed",
  entries: [entry("clip-one", "Clip One"), entry("clip-two", "Clip Two")],
};

describe("playlist preview", () => {
  it("gives back what was stored, with folder, media and numbered entries", async () => {
    const { db } = await tempDb();
    const { key, preview } = storePreview(db, VIDEO, PLAYLIST, 1_000);

    expect(preview).toEqual({
      media: VIDEO,
      title: "Clips: The Mix",
      folder: "Clips： The Mix",
      entries: [
        { number: 1, ...entry("clip-one", "Clip One") },
        { number: 2, ...entry("clip-two", "Clip Two") },
      ],
    });
    expect(takePreview(db, key, 2_000)).toEqual(preview);
  });

  it("can be taken only once, so a double click adds nothing twice", async () => {
    const { db } = await tempDb();
    const { key } = storePreview(db, VIDEO, PLAYLIST, 1_000);
    expect(takePreview(db, key, 2_000)).toBeDefined();
    expect(takePreview(db, key, 2_000)).toBeUndefined();
  });

  it("expires 15 minutes after loading", async () => {
    const { db } = await tempDb();
    const { key } = storePreview(db, VIDEO, PLAYLIST, 1_000);
    const { key: other } = storePreview(db, VIDEO, PLAYLIST, 1_000);
    expect(takePreview(db, key, 1_000 + PREVIEW_TTL_MS - 1)).toBeDefined();
    expect(takePreview(db, other, 1_000 + PREVIEW_TTL_MS)).toBeUndefined();
  });

  it("knows no key it did not hand out", async () => {
    const { db } = await tempDb();
    storePreview(db, VIDEO, PLAYLIST, 1_000);
    expect(takePreview(db, "not-a-key", 2_000)).toBeUndefined();
  });
});
