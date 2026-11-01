import { describe, expect, it } from "vitest";
import { isMixedLink, isPlaylistLink } from "./playlist-link";

describe("isPlaylistLink", () => {
  it("recognizes a YouTube playlist page", () => {
    expect(isPlaylistLink("https://www.youtube.com/playlist?list=PLabc123")).toBe(true);
    expect(isPlaylistLink("https://youtube.com/playlist?list=PLabc123")).toBe(true);
    expect(isPlaylistLink("https://m.youtube.com/playlist?list=PLabc123")).toBe(true);
    expect(isPlaylistLink("https://music.youtube.com/playlist?list=PLabc123")).toBe(true);
  });

  it("is false for anything that is not a link, so that the check reports it", () => {
    expect(isPlaylistLink("")).toBe(false);
    expect(isPlaylistLink("youtube.com/playlist?list=PLabc123")).toBe(false);
    expect(isPlaylistLink("not a link")).toBe(false);
  });

  it("recognizes a list without a video on the watch page", () => {
    expect(isPlaylistLink("https://www.youtube.com/watch?list=PLabc123")).toBe(true);
  });

  it("does not treat a video inside a playlist as a playlist", () => {
    expect(isPlaylistLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123")).toBe(false);
    expect(isPlaylistLink("https://www.youtube.com/watch?list=PLabc123&v=dQw4w9WgXcQ&index=3")).toBe(false);
    expect(isPlaylistLink("https://youtu.be/dQw4w9WgXcQ?list=PLabc123")).toBe(false);
  });

  it("leaves links of other sources to the check, even with the same path", () => {
    expect(isPlaylistLink("https://example.com/playlist?list=PLabc123")).toBe(false);
    expect(isPlaylistLink("http://fixtures:8080/feed.rss")).toBe(false);
    expect(isPlaylistLink("https://notyoutube.com/playlist?list=PLabc123")).toBe(false);
  });
});

describe("isMixedLink", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123",
    "https://www.youtube.com/watch?list=PLabc123&v=dQw4w9WgXcQ&index=3",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=OLAK5uy_abc",
    "https://youtu.be/dQw4w9WgXcQ?list=PLabc123",
    "https://youtu.be/dQw4w9WgXcQ?list=UUSMabc&t=10",
  ])("recognizes a video inside a playlist: %s", (link) => {
    expect(isMixedLink(link)).toBe(true);
  });

  it.each([
    ["a video alone", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["a short link alone", "https://youtu.be/dQw4w9WgXcQ"],
    ["a short", "https://www.youtube.com/shorts/dQw4w9WgXcQ"],
    ["a playlist alone", "https://www.youtube.com/playlist?list=PLabc123"],
    ["a list on the watch page without a video", "https://www.youtube.com/watch?list=PLabc123"],
    ["an empty list", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list="],
    ["a short link without a video", "https://youtu.be/?list=PLabc123"],
    ["a mix", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ"],
    ["a mix as a short link", "https://youtu.be/dQw4w9WgXcQ?list=RDdQw4w9WgXcQ"],
    ["a music mix", "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ"],
    ["another source with the same path", "https://example.com/watch?v=dQw4w9WgXcQ&list=PLabc123"],
    ["a host that only ends like YouTube", "https://notyoutube.com/watch?v=dQw4w9WgXcQ&list=PLabc123"],
    ["a fixture link", "http://fixtures:8080/feed.rss"],
    ["a fixture link with a video and a list", "http://fixtures:8080/watch?v=clip-one&list=mix"],
    ["text that is not a link", "not a link"],
  ])("is false for %s", (_, link) => {
    expect(isMixedLink(link)).toBe(false);
  });
});
