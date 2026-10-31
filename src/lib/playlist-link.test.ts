import { describe, expect, it } from "vitest";
import { isPlaylistLink } from "./playlist-link";

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
