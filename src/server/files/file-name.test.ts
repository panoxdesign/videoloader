import { describe, expect, it } from "vitest";
import { baseName, chooseFileName, extensionOf, MAX_NAME_BYTES, nameKey, outputTemplate, playlistFolder } from "./file-name";

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

describe("chooseFileName for a playlist entry", () => {
  const media = { title: "Clip One", mediaId: "clip-one", ext: "mp4" };

  it("puts the entry into the playlist folder with its number, at least three digits", () => {
    expect(chooseFileName({ ...media, playlist: { folder: "My Mix", number: 1 } }, () => false)).toBe(
      "My Mix/001 - Clip One [clip-one].mp4",
    );
    expect(chooseFileName({ ...media, playlist: { folder: "My Mix", number: 42 } }, () => false)).toBe(
      "My Mix/042 - Clip One [clip-one].mp4",
    );
    expect(chooseFileName({ ...media, playlist: { folder: "My Mix", number: 1234 } }, () => false)).toBe(
      "My Mix/1234 - Clip One [clip-one].mp4",
    );
  });

  it("counts up inside the folder", () => {
    const taken = new Set(["My Mix/001 - Clip One [clip-one].mp4"]);
    expect(chooseFileName({ ...media, playlist: { folder: "My Mix", number: 1 } }, (name) => taken.has(name))).toBe(
      "My Mix/001 - Clip One [clip-one] (2).mp4",
    );
  });

  it("keeps number and title within the limit and takes the folder from playlistFolder as it is", () => {
    const long = "日本語のタイトル".repeat(20); // 480 Bytes
    const folder = playlistFolder({ fileTitle: long, fileId: "PL123" });
    const name = chooseFileName({ ...media, title: long, playlist: { folder, number: 7 } }, () => false);
    const [dir, file] = name.split("/");
    expect(dir).toBe(folder);
    expect(bytes(file.replace(/\.mp4$/, ""))).toBeLessThanOrEqual(MAX_NAME_BYTES);
    expect(file).toMatch(/^007 - 日本語.* \[clip-one\]\.mp4$/);
  });

  it("keeps the playlist id of a folder without a name whole", () => {
    const folder = playlistFolder({ fileTitle: null, fileId: `https：⧸⧸example.com⧸${"f".repeat(150)}` });
    const name = chooseFileName({ ...media, playlist: { folder, number: 1 } }, () => false);
    expect(name).toBe(`${folder}/001 - Clip One [clip-one].mp4`);
    expect(name).toMatch(/^Playlist \[https.*f\]\//);
  });
});

describe("playlistFolder", () => {
  it("is the playlist name as yt-dlp cleaned it", () => {
    expect(playlistFolder({ fileTitle: "Clips： The Mix", fileId: "PL123" })).toBe("Clips： The Mix");
  });

  it("falls back to the playlist id, then to a plain word", () => {
    expect(playlistFolder({ fileTitle: null, fileId: "PL123" })).toBe("Playlist [PL123]");
    expect(playlistFolder({ fileTitle: null, fileId: null })).toBe("Playlist");
  });

  it("shortens a long name to the limit, between graphemes and without trailing spaces", () => {
    const long = "日本語のタイトル".repeat(20); // 480 Bytes
    const folder = playlistFolder({ fileTitle: long, fileId: "PL123" });
    expect(bytes(folder)).toBeLessThanOrEqual(MAX_NAME_BYTES);
    expect(long.startsWith(folder)).toBe(true);
    expect(bytes(folder)).toBeGreaterThan(MAX_NAME_BYTES - 3);

    const family = "👨‍👩‍👧"; // 18 Bytes, ein Graphem
    const name = `${"a".repeat(MAX_NAME_BYTES - 10)} ${family.repeat(5)}`;
    expect(playlistFolder({ fileTitle: name, fileId: "PL123" })).toBe("a".repeat(MAX_NAME_BYTES - 10));
  });

  it("falls back to the id when nothing of the name fits", () => {
    const zalgo = `a${"\u0301".repeat(150)}`; // ein Graphem, 301 Bytes
    expect(playlistFolder({ fileTitle: zalgo, fileId: "PL123" })).toBe("Playlist [PL123]");
  });

  it("never cuts a long playlist id", () => {
    // Beim generischen Extraktor (RSS) ist die ID die bereinigte Feed-URL.
    const id = `https：⧸⧸example.com⧸feeds⧸${"ä".repeat(70)}`;
    const folder = playlistFolder({ fileTitle: null, fileId: id });
    expect(folder).toBe(`Playlist [${id}]`);
    expect(bytes(folder)).toBeLessThanOrEqual(MAX_NAME_BYTES);
  });

  it("keeps an id that fills the limit exactly", () => {
    const id = "x".repeat(MAX_NAME_BYTES - bytes("Playlist []"));
    expect(playlistFolder({ fileTitle: null, fileId: id })).toBe(`Playlist [${id}]`);
  });

  it("falls back to a plain word when the id alone does not fit", () => {
    const id = "x".repeat(MAX_NAME_BYTES - bytes("Playlist []") + 1);
    expect(playlistFolder({ fileTitle: null, fileId: id })).toBe("Playlist");
    // Mehrbyte-Zeichen zählen in Bytes, nicht in Zeichen: 100 × „ä“ sind 200 Bytes.
    expect(playlistFolder({ fileTitle: null, fileId: "ä".repeat(100) })).toBe("Playlist");
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
