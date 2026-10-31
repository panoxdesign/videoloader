import { describe, expect, it } from "vitest";
import { parseCheck } from "./parse-check";

const json = (value: unknown) => JSON.stringify(value);
/** Die Zeile aus `--print` vor dem JSON, mit ID und Titel wie für Dateinamen bereinigt. */
const fileLine = (id: string, title: string) => `FILE\t${id}\t${title}\n`;
/** Die Zeile aus `--print playlist:…` mit Playlist-ID und -Namen, bereinigt für den Ordner. */
const playlistLine = (id: string, title: string) => `PLAYLIST\t${id}\t${title}\n`;

describe("parseCheck", () => {
  it("reads a single video", () => {
    // Auszug aus der Prüfung gegen die Fixture-Seite `clip-one`.
    const stdout = fileLine("clip-one", "Clip One") + json({
      id: "clip-one",
      title: "Clip One",
      url: "http://fixtures:8080/media/clip-one.mp4",
      thumbnail: "http://fixtures:8080/media/clip.jpg",
      thumbnails: [{ url: "http://fixtures:8080/media/clip.jpg", id: "0" }],
      webpage_url: "http://fixtures:8080/videos/clip-one",
      extractor: "generic",
      extractor_key: "Generic",
      _type: "video",
    });

    expect(parseCheck(stdout)).toEqual({
      kind: "video",
      media: {
        source: "Generic",
        mediaId: "clip-one",
        title: "Clip One",
        thumbnailUrl: "http://fixtures:8080/media/clip.jpg",
        duration: null,
        fileTitle: "Clip One",
        fileMediaId: "clip-one",
      },
    });
  });

  it("takes title and media id for the file name from the print line, as yt-dlp cleaned them", () => {
    const stdout =
      fileLine("umlaut-clip", "Grüße aus Köln⧸Zürich： Café？") +
      json({ _type: "video", extractor_key: "Generic", id: "umlaut-clip", title: "Grüße aus Köln/Zürich: Café?" });
    expect(parseCheck(stdout)).toMatchObject({
      kind: "video",
      media: { title: "Grüße aus Köln/Zürich: Café?", fileTitle: "Grüße aus Köln⧸Zürich： Café？", fileMediaId: "umlaut-clip" },
    });
  });

  it("keeps percent signs in the file title as they are", () => {
    // yt-dlp entfernt Tabs und Zeilenumbrüche aus `%(title)S`, deshalb trennt der Tab sicher.
    const stdout = fileLine("p", "100% sure： 50%% off %(id)s") + json({ _type: "video", extractor_key: "Generic", id: "p" });
    expect(parseCheck(stdout)).toMatchObject({ kind: "video", media: { fileTitle: "100% sure： 50%% off %(id)s", fileMediaId: "p" } });
  });

  it("reads the duration of a video", () => {
    const stdout = json({ _type: "video", extractor_key: "Youtube", id: "aqz-KE-bpKQ", title: "Big Buck Bunny", duration: 635.5 });
    expect(parseCheck(stdout)).toMatchObject({ kind: "video", media: { duration: 635.5 } });
  });

  it("takes the last of the thumbnails without a thumbnail field", () => {
    const stdout = json({
      _type: "video",
      extractor_key: "Youtube",
      id: "x",
      thumbnails: [{ url: "https://i.ytimg.com/vi/x/default.jpg" }, { url: "https://i.ytimg.com/vi/x/hqdefault.jpg" }],
    });
    expect(parseCheck(stdout)).toMatchObject({ kind: "video", media: { thumbnailUrl: "https://i.ytimg.com/vi/x/hqdefault.jpg" } });
  });

  it("ignores thumbnails that are not http or https", () => {
    const stdout = json({ _type: "video", extractor_key: "Generic", id: "x", thumbnail: "javascript:alert(1)" });
    expect(parseCheck(stdout)).toMatchObject({ kind: "video", media: { thumbnailUrl: null } });
  });

  it("allows a video without id, title and thumbnail", () => {
    expect(parseCheck(json({ _type: "video" }))).toEqual({
      kind: "video",
      media: { source: null, mediaId: null, title: null, thumbnailUrl: null, duration: null, fileTitle: null, fileMediaId: null },
    });
  });

  it("reads a playlist with flat entries", () => {
    const stdout = fileLine("abc", "How Rockets Land Themselves") + playlistLine("PL123", "Space Engineering Explained") + json({
      _type: "playlist",
      extractor_key: "YoutubeTab",
      id: "PL123",
      title: "Space Engineering Explained",
      entries: [
        {
          _type: "url",
          ie_key: "Youtube",
          id: "abc",
          url: "https://www.youtube.com/watch?v=abc",
          title: "How Rockets Land Themselves",
          duration: 312,
          thumbnails: [{ url: "https://i.ytimg.com/vi/abc/hqdefault.jpg" }],
        },
      ],
    });

    expect(parseCheck(stdout)).toEqual({
      kind: "playlist",
      title: "Space Engineering Explained",
      fileTitle: "Space Engineering Explained",
      fileId: "PL123",
      entries: [
        {
          url: "https://www.youtube.com/watch?v=abc",
          source: "Youtube",
          mediaId: "abc",
          title: "How Rockets Land Themselves",
          thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
          duration: 312,
          fileTitle: "How Rockets Land Themselves",
          fileMediaId: "abc",
        },
      ],
    });
  });

  it("allows flat entries without id, duration and thumbnail and gives them the source of the playlist", () => {
    // So liefert der generic-Extractor die Einträge eines RSS-Feeds.
    const stdout = json({
      _type: "playlist",
      extractor_key: "Generic",
      id: "feed",
      title: "Feed",
      entries: [
        { _type: "url", url: "http://fixtures:8080/videos/clip-one", title: "Clip One" },
        { _type: "url", url: "http://fixtures:8080/videos/clip-two" },
      ],
    });

    expect(parseCheck(stdout)).toMatchObject({
      kind: "playlist",
      entries: [
        { url: "http://fixtures:8080/videos/clip-one", source: "Generic", mediaId: null, title: "Clip One", thumbnailUrl: null, duration: null },
        { url: "http://fixtures:8080/videos/clip-two", source: "Generic", mediaId: null, title: null, thumbnailUrl: null, duration: null },
      ],
    });
  });

  it("takes the folder name and the file names of the entries from the print lines, in playlist order", () => {
    // Auszug aus der Prüfung gegen einen RSS-Feed: je Flat-Eintrag eine `FILE`-Zeile, danach der Playlist-Name.
    const stdout =
      fileLine("", "Clip One") +
      fileLine("", "Clip⧸Two？") +
      playlistLine("http：⧸⧸fixtures：8080⧸feed.rss", "Fixture Feed： Clips⧸Mix？") +
      json({
        _type: "playlist",
        extractor_key: "Generic",
        title: "Fixture Feed: Clips/Mix?",
        entries: [
          { _type: "url", url: "http://fixtures:8080/videos/clip-one", title: "Clip One" },
          { _type: "url", url: "http://fixtures:8080/videos/clip-two", title: "Clip/Two?" },
        ],
      });

    expect(parseCheck(stdout)).toMatchObject({
      kind: "playlist",
      title: "Fixture Feed: Clips/Mix?",
      fileTitle: "Fixture Feed： Clips⧸Mix？",
      fileId: "http：⧸⧸fixtures：8080⧸feed.rss",
      entries: [
        { url: "http://fixtures:8080/videos/clip-one", fileTitle: "Clip One", fileMediaId: null },
        { url: "http://fixtures:8080/videos/clip-two", fileTitle: "Clip⧸Two？", fileMediaId: null },
      ],
    });
  });

  it("drops playlist entries without a url", () => {
    const stdout = json({
      _type: "playlist",
      extractor_key: "Generic",
      entries: [null, { _type: "url", title: "No link" }, { _type: "url", url: "http://fixtures:8080/videos/clip-one" }],
    });
    expect(parseCheck(stdout)).toMatchObject({ kind: "playlist", entries: [{ url: "http://fixtures:8080/videos/clip-one" }] });
  });

  it("treats a multi_video result like a playlist", () => {
    const stdout = json({ _type: "multi_video", extractor_key: "Generic", title: "Parts", entries: [{ url: "https://example.com/1" }] });
    expect(parseCheck(stdout)).toMatchObject({ kind: "playlist", title: "Parts", entries: [{ url: "https://example.com/1" }] });
  });

  it("finds nothing in an empty playlist", () => {
    expect(parseCheck(json({ _type: "playlist", extractor_key: "Generic", entries: [] }))).toEqual({ kind: "none" });
  });

  it.each([
    ["null", "null"],
    ["empty output", ""],
    ["broken JSON", '{"_type": "vid'],
    ["an unknown type", json({ _type: "url", url: "https://example.com" })],
  ])("finds nothing in %s", (_, stdout) => {
    expect(parseCheck(stdout)).toEqual({ kind: "none" });
  });
});
