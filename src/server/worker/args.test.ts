import { describe, expect, it } from "vitest";
import { buildCheckArgs, buildDownloadArgs } from "./args";

const base = { url: "https://example.com/v", downloadsDir: "/data/downloads", tmpDir: "/data/tmp/1", cacheDir: "/data/cache" };

/** Die Werte direkt hinter einem Flag, in Reihenfolge. */
function valuesOf(args: string[], flag: string) {
  return args.flatMap((arg, i) => (arg === flag ? [args[i + 1]] : []));
}

describe("buildDownloadArgs", () => {
  it.each([
    ["best", "res,channels:2"],
    ["1080", "res:1080,channels:2"],
    ["720", "res:720,channels:2"],
    ["480", "res:480,channels:2"],
  ] as const)("limits video to %s and prefers stereo", (resolution, sort) => {
    const args = buildDownloadArgs({ ...base, media: { mediaType: "video", resolution } });
    expect(valuesOf(args, "-t")).toEqual(["mp4"]);
    expect(valuesOf(args, "-S")).toEqual([sort]);
    // Ein späteres -S hat Vorrang vor dem aus -t mp4, davor stünde es dahinter.
    expect(args.indexOf("-S")).toBeGreaterThan(args.indexOf("-t"));
    expect(args).not.toContain("-x");
  });

  it("extracts audio as 192 kbps MP3 with metadata and cover", () => {
    const args = buildDownloadArgs({ ...base, media: { mediaType: "audio", resolution: null } });
    expect(valuesOf(args, "-f")).toEqual(["ba/b"]);
    expect(args).toContain("-x");
    expect(valuesOf(args, "--audio-format")).toEqual(["mp3"]);
    expect(valuesOf(args, "--audio-quality")).toEqual(["192K"]);
    expect(args).toContain("--embed-metadata");
    expect(args).toContain("--embed-thumbnail");
    expect(args).not.toContain("-t");
    expect(args).not.toContain("-S");
  });

  it("ends with the URL after --", () => {
    const args = buildDownloadArgs({ ...base, url: "-weird", media: { mediaType: "audio", resolution: null } });
    expect(args.slice(-2)).toEqual(["--", "-weird"]);
  });
});

describe("buildCheckArgs", () => {
  const args = buildCheckArgs({ url: "-weird", cacheDir: "/data/cache" });

  it("asks for one flat JSON object of the video, not the playlist", () => {
    expect(args).toContain("-J");
    expect(args).toContain("--flat-playlist");
    expect(args).toContain("--no-playlist");
  });

  it("shares the cache with downloads but writes no files", () => {
    expect(valuesOf(args, "--cache-dir")).toEqual(["/data/cache"]);
    expect(args).not.toContain("-P");
    expect(args).not.toContain("-o");
  });

  it("ends with the URL after --", () => {
    expect(args.slice(-2)).toEqual(["--", "-weird"]);
  });
});
