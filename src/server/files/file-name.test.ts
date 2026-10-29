import { describe, expect, it } from "vitest";
import { baseName, chooseFileName, extensionOf, MAX_NAME_BYTES, nameKey, outputTemplate } from "./file-name";

const bytes = (text: string) => Buffer.byteLength(text, "utf8");

describe("baseName", () => {
  it("is title and media id", () => {
    expect(baseName("Clip One", "clip-one")).toBe("Clip One [clip-one]");
  });

  it("appends a suffix from the second name on, like a file manager", () => {
    expect(baseName("Clip One", "clip-one", 1)).toBe("Clip One [clip-one]");
    expect(baseName("Clip One", "clip-one", 2)).toBe("Clip One [clip-one] (2)");
    expect(baseName("Clip One", "clip-one", 13)).toBe("Clip One [clip-one] (13)");
  });

  it("shortens a long title so that the name stays within the limit in UTF-8, suffix included", () => {
    // 3 Bytes je Zeichen: 180 Zeichen von yt-dlp wären 540 Bytes, mehr als ext4 erlaubt.
    const title = "日本語のタイトル".repeat(20);
    for (const n of [1, 2, 100]) {
      const name = baseName(title, "abc", n);
      expect(bytes(name)).toBeLessThanOrEqual(MAX_NAME_BYTES);
      expect(name).toMatch(n === 1 ? /^日本語.* \[abc\]$/ : new RegExp(` \\[abc\\] \\(${n}\\)$`));
    }
  });

  it("cuts between graphemes and drops trailing spaces of the cut title", () => {
    const family = "👨‍👩‍👧"; // 18 Bytes, ein Graphem
    const name = baseName(`${"a".repeat(MAX_NAME_BYTES - 20)} ${family.repeat(5)}`, "id");
    expect(name).toBe(`${"a".repeat(MAX_NAME_BYTES - 20)} [id]`);
  });

  it("shortens an overlong media id as well", () => {
    const name = baseName("Title", "x".repeat(400), 2);
    expect(bytes(name)).toBeLessThanOrEqual(MAX_NAME_BYTES);
    expect(name).toMatch(/^Title \[x+\] \(2\)$/);
  });
});

describe("chooseFileName", () => {
  const media = { title: "Clip One", mediaId: "clip-one", ext: "mp4" };

  it("takes the plain name while it is free", () => {
    expect(chooseFileName(media, () => false)).toBe("Clip One [clip-one].mp4");
  });

  it("counts up past taken names", () => {
    const taken = new Set(["Clip One [clip-one].mp4", "Clip One [clip-one] (2).mp4"]);
    expect(chooseFileName(media, (name) => taken.has(name))).toBe("Clip One [clip-one] (3).mp4");
  });

  it("fills a gap left by a deleted file", () => {
    const taken = new Set(["Clip One [clip-one].mp4", "Clip One [clip-one] (3).mp4"]);
    expect(chooseFileName(media, (name) => taken.has(name))).toBe("Clip One [clip-one] (2).mp4");
  });
});

describe("nameKey", () => {
  it("treats names as equal regardless of case and Unicode normalization", () => {
    expect(nameKey("Café [x].mp4")).toBe(nameKey("CAFÉ [X].MP4"));
    expect(nameKey("Clip [a].mp4")).not.toBe(nameKey("Clip [a] (2).mp4"));
  });
});

describe("outputTemplate", () => {
  it("passes the name literally and lets yt-dlp fill in only the extension", () => {
    expect(outputTemplate("Clip One [clip-one] (2).mp4")).toBe("Clip One [clip-one] (2).%(ext)s");
  });

  it("masks every % of the name", () => {
    expect(outputTemplate("100% sure： 50%% off %(id)s [p].mp3")).toBe("100%% sure： 50%%%% off %%(id)s [p].%(ext)s");
  });
});

describe("extensionOf", () => {
  it("is mp4 for video and mp3 for audio", () => {
    expect(extensionOf("video")).toBe("mp4");
    expect(extensionOf("audio")).toBe("mp3");
  });
});
