import { describe, expect, it } from "vitest";
import { parseMedia } from "./media";

describe("parseMedia", () => {
  it.each(["best", "1080", "720", "480"])("accepts video with resolution %s", (resolution) => {
    expect(parseMedia({ mediaType: "video", resolution })).toEqual({ mediaType: "video", resolution });
  });

  it("drops a resolution sent along with audio", () => {
    expect(parseMedia({ mediaType: "audio", resolution: "720" })).toEqual({ mediaType: "audio", resolution: null });
  });

  it.each([
    ["video without resolution", { mediaType: "video", resolution: null }],
    ["unknown resolution", { mediaType: "video", resolution: "2160" }],
    ["unknown media type", { mediaType: "mp4", resolution: "best" }],
    ["missing media type", { mediaType: null, resolution: null }],
  ])("rejects %s", (_, input) => {
    expect(parseMedia(input)).toBeUndefined();
  });
});
