import { describe, expect, it } from "vitest";
import { contentDisposition, contentTypeOf, parseRange } from "./http";

describe("parseRange", () => {
  it.each([
    ["bytes=0-99", { start: 0, end: 99 }],
    ["bytes=100-", { start: 100, end: 999 }],
    ["bytes=-100", { start: 900, end: 999 }],
    // Ein Ende hinter der Datei wird auf das letzte Byte gekürzt.
    ["bytes=900-5000", { start: 900, end: 999 }],
    ["bytes=-5000", { start: 0, end: 999 }],
    ["bytes = 10 - 19", { start: 10, end: 19 }],
  ])("reads %s of 1000 bytes", (header, range) => {
    expect(parseRange(header, 1000)).toEqual(range);
  });

  it.each([
    ["no header", null],
    ["another unit", "items=0-1"],
    ["several ranges", "bytes=0-1,5-6"],
    ["garbage", "bytes=abc"],
    ["an empty range", "bytes=-"],
  ])("serves the whole file for %s", (_name, header) => {
    expect(parseRange(header, 1000)).toBe("full");
  });

  it.each([
    ["a start behind the file", "bytes=1000-"],
    ["an end before the start", "bytes=50-10"],
    ["a zero suffix", "bytes=-0"],
  ])("rejects %s", (_name, header) => {
    expect(parseRange(header, 1000)).toBe("unsatisfiable");
  });

  it("rejects every range of an empty file", () => {
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
  });
});

describe("contentDisposition", () => {
  it("keeps a plain name", () => {
    expect(contentDisposition("Clip One [clip-one].mp4")).toBe(
      `attachment; filename="Clip One [clip-one].mp4"; filename*=UTF-8''Clip%20One%20%5Bclip-one%5D.mp4`,
    );
  });

  it("encodes umlauts and special characters for filename* and replaces them in the fallback", () => {
    expect(contentDisposition(`Grüße "Köln" 100%.mp3`)).toBe(
      `attachment; filename="Gr__e _K_ln_ 100%.mp3"; filename*=UTF-8''Gr%C3%BC%C3%9Fe%20%22K%C3%B6ln%22%20100%25.mp3`,
    );
  });

  it("encodes the characters RFC 5987 excludes from attr-char", () => {
    expect(contentDisposition("a'b(c)*.mp4")).toContain(`filename*=UTF-8''a%27b%28c%29%2A.mp4`);
  });

  it("drops a backslash from the fallback", () => {
    expect(contentDisposition("a\\b.mp4")).toContain(`filename="a_b.mp4"`);
  });
});

describe("contentTypeOf", () => {
  it.each([
    ["Clip.mp4", "video/mp4"],
    ["Clip.MP3", "audio/mpeg"],
    ["Clip.webm", "application/octet-stream"],
    ["Clip", "application/octet-stream"],
  ])("maps %s to %s", (file, type) => {
    expect(contentTypeOf(file)).toBe(type);
  });
});
