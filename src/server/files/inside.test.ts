import { describe, expect, it } from "vitest";
import { isInside } from "./inside";

describe("isInside", () => {
  it.each([
    ["/data/downloads/Clip [a].mp4"],
    ["/data/downloads/Playlist/01 - Clip [a].mp4"],
    // Ein Titel darf mit zwei Punkten beginnen, das ist kein Schritt nach oben.
    ["/data/downloads/..Clip [a].mp4"],
  ])("accepts %s", (file) => {
    expect(isInside("/data/downloads", file)).toBe(true);
  });

  it.each([
    ["the folder itself", "/data/downloads"],
    ["a parent step", "/data/downloads/../db/videoloader.db"],
    ["a sibling with the same prefix", "/data/downloads2/Clip.mp4"],
    ["another folder", "/etc/passwd"],
    ["a relative path", "downloads/Clip.mp4"],
  ])("rejects %s", (_name, file) => {
    expect(isInside("/data/downloads", file)).toBe(false);
  });

  it("accepts the folder with a trailing slash", () => {
    expect(isInside("/data/downloads/", "/data/downloads/Clip.mp4")).toBe(true);
  });
});
