import { describe, expect, inject, it } from "vitest";
import { checkLink } from "@/server/check/check";
import { dataPaths } from "@/server/paths";
import { tempDataDir, YTDLP } from "./helpers";

const fixtureUrl = inject("fixtureUrl");

async function check(url: string, signal = AbortSignal.timeout(30_000)) {
  const { cache } = dataPaths(await tempDataDir());
  return checkLink({ ytDlpPath: YTDLP, url, cacheDir: cache, signal });
}

describe("link check", () => {
  it("knows source, media id, title and thumbnail of a single page before the download", async () => {
    expect(await check(`${fixtureUrl}/videos/clip-one`)).toEqual({
      kind: "video",
      media: {
        source: "Generic",
        mediaId: "clip-one",
        title: "Clip One",
        thumbnailUrl: `${fixtureUrl}/media/clip.jpg`,
        duration: null,
        fileTitle: "Clip One",
        fileMediaId: "clip-one",
      },
    });
  });

  it.each([
    ["umlaut-clip", "Grüße aus Köln/Zürich: Café & Crème brûlée?", "Grüße aus Köln⧸Zürich： Café & Crème brûlée？"],
    ["percent-clip", "100% sure: 50%% off %(id)s", "100% sure： 50%% off %(id)s"],
  ])("knows the title of %s as yt-dlp cleans it for file names", async (page, title, fileTitle) => {
    expect(await check(`${fixtureUrl}/videos/${page}`)).toMatchObject({
      kind: "video",
      media: { title, fileTitle, fileMediaId: page },
    });
  });

  it("reads an RSS feed as a playlist with flat entries and the folder name as yt-dlp cleans it", async () => {
    const entry = (page: string, title: string) => ({
      url: `${fixtureUrl}/videos/${page}`,
      source: "Generic",
      mediaId: null,
      title,
      thumbnailUrl: null,
      duration: null,
      fileTitle: title,
      fileMediaId: null,
    });
    expect(await check(`${fixtureUrl}/feed.rss`)).toEqual({
      kind: "playlist",
      title: "Clips: The Mix",
      fileTitle: "Clips： The Mix",
      // Der generic-Extractor nimmt die URL als ID, `--windows-filenames` ersetzt `:` und `/`.
      fileId: expect.stringMatching(/^http：⧸⧸.+⧸feed\.rss$/),
      entries: [entry("clip-one", "Clip One"), entry("clip-two", "Clip Two"), entry("clip-three", "Clip Three")],
    });
  });

  it.each([
    ["a 404 page", `${fixtureUrl}/videos/missing`, /HTTP Error 404/],
    ["something that is not a link", "notaurl", /is not a valid URL/],
  ])("finds nothing at %s and keeps the error line", async (_, url, error) => {
    const result = await check(url);
    expect(result).toMatchObject({ kind: "none" });
    expect(result.kind === "none" && result.error).toMatch(error);
  });

  it("gives up when the signal fires", async () => {
    const started = Date.now();
    expect(await check(`${fixtureUrl}/videos/clip-one`, AbortSignal.timeout(50))).toEqual({ kind: "none", timedOut: true });
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
