import { describe, expect, it } from "vitest";
import { classifyError } from "./classify-error";

const COOKIE_HINT =
  "Use --cookies-from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies. Also see  https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies  for tips on effectively exporting YouTube cookies";

describe("classifyError", () => {
  // Echte Zeilen aus dem YouTube-Smoke-Test (assets/youtube-live-smoke-test.md) und dem Research.
  it.each([
    ["private (with login hint)", `ERROR: [youtube] yZIXLfi8CZQ: Private video. If the owner of this video has granted you access, please sign in. ${COOKIE_HINT}`, "private"],
    ["removed for hate speech", "ERROR: [youtube] 6SJNVb0GnPI: This video has been removed for violating YouTube's policy on hate speech. Learn more about combating hate speech in your country.", "unavailable"],
    ["removed for ToS", "ERROR: [youtube] Cr381pDsSsA: This video has been removed for violating YouTube's Terms of Service", "unavailable"],
    ["this video is unavailable", "ERROR: [youtube] DJztXj2GPfl: This video is unavailable", "unavailable"],
    ["video unavailable", "ERROR: [youtube] xxxxxxxxxxx: Video unavailable", "unavailable"],
    ["account terminated", "ERROR: [youtube] abc: This video is no longer available because the YouTube account associated with this video has been terminated.", "unavailable"],
    ["HTTP 404", "ERROR: unable to download video data: HTTP Error 404: Not Found", "unavailable"],
    ["age-restricted (with login hint)", `ERROR: [youtube] Tq92D6wQ1mg: Sign in to confirm your age. This video may be inappropriate for some users. ${COOKIE_HINT}`, "ageRestricted"],
    ["geo-blocked", "ERROR: [youtube] sJL6WA-aGkQ: The uploader has not made this video available in your country", "geoBlocked"],
    ["geo-blocked, generic", "ERROR: [generic] x: This video is not available from your location due to geo restriction", "geoBlocked"],
    ["bot check (with login hint)", `ERROR: [youtube] abc: Sign in to confirm you’re not a bot. ${COOKIE_HINT}`, "botCheck"],
    ["login hint only", `ERROR: [vimeo] 123: This video is only available for registered users. ${COOKIE_HINT}`, "loginRequired"],
    ["protected tweet", "ERROR: [twitter] 1: You are not authorized to view this protected tweet", "loginRequired"],
    ["NSFW tweet", "ERROR: [twitter] 1: NSFW tweet requires authentication", "loginRequired"],
    ["rate limit", "ERROR: [youtube] abc: This content isn't available, try again later.", "rateLimit"],
    ["HTTP 429", "ERROR: unable to download video data: HTTP Error 429: Too Many Requests", "rateLimit"],
    ["connection refused", "ERROR: [generic] Unable to download webpage: <urlopen error [Errno 111] Connection refused> (caused by TransportError('<urlopen error [Errno 111] Connection refused>'))", "network"],
    ["timed out", "ERROR: [download] Got error: The read operation timed out. Giving up after 10 retries", "network"],
    ["name resolution", "ERROR: [generic] Unable to download webpage: [Errno -3] Temporary failure in name resolution", "network"],
    ["unsupported URL", "ERROR: Unsupported URL: https://example.com/", "unsupportedLink"],
    ["not a valid URL", "ERROR: [generic] 'notaurl' is not a valid URL. Set --default-search \"ytsearch\" (or run  yt-dlp \"ytsearch:notaurl\" ) to search YouTube", "unsupportedLink"],
    ["no matching format", "ERROR: [youtube] abc: Requested format is not available. Use --list-formats for a list of available formats", "noFormat"],
    ["DRM", "ERROR: [generic] x: This video is DRM protected", "drm"],
    ["JS runtime", "ERROR: [youtube] abc: Signature solving failed: Some formats may be missing. Ensure you have a supported JavaScript runtime", "jsChallenge"],
    ["anything else", "ERROR: Postprocessing: Conversion failed!", "other"],
  ])("%s", (_, line, category) => {
    expect(classifyError(line)).toBe(category);
  });

  it("matches case-insensitively", () => {
    expect(classifyError("ERROR: [youtube] abc: PRIVATE VIDEO")).toBe("private");
  });

  it("uses the first ERROR: line, continuation lines belong to it", () => {
    const log = [
      "[youtube] sJL6WA-aGkQ: Downloading webpage",
      "ERROR: [youtube] sJL6WA-aGkQ: The uploader has not made this video available in your country",
      "This video is available in Japan.",
      "You might want to use a VPN or a proxy server (with --proxy) to workaround.",
      "ERROR: Unable to download webpage: Connection refused",
    ].join("\n");
    expect(classifyError(log)).toBe("geoBlocked");
  });

  it("never treats WARNING: lines as the error", () => {
    const log = [
      "WARNING: [youtube] abc: Sign in to confirm you're not a bot",
      "WARNING: No supported JavaScript runtime could be found",
      "ERROR: [youtube] abc: This video is unavailable",
    ].join("\n");
    expect(classifyError(log)).toBe("unavailable");
  });

  it.each([
    ["an empty log", ""],
    ["only warnings", "WARNING: [generic] Falling back on generic information extractor"],
    ["ERROR: not at the start of a line", "[info] title contains ERROR: Private video"],
  ])("is other for %s", (_, log) => {
    expect(classifyError(log)).toBe("other");
  });
});
