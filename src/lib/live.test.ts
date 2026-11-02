import { describe, expect, it } from "vitest";
import { isUpcomingError, liveBlock, liveError, parseLiveStatus } from "./live";

describe("parseLiveStatus", () => {
  it.each(["is_live", "is_upcoming", "post_live", "was_live", "not_live"])("keeps %s", (status) => {
    expect(parseLiveStatus(status)).toBe(status);
  });

  it.each([
    ["a missing field", undefined],
    ["null", null],
    ["an unknown value", "is_premiere"],
    ["a boolean", true],
  ])("is null for %s", (_, value) => {
    expect(parseLiveStatus(value)).toBeNull();
  });
});

describe("liveBlock", () => {
  it.each([
    ["is_live", "live"],
    ["is_upcoming", "upcoming"],
    ["post_live", "justEnded"],
  ] as const)("blocks %s as %s", (status, block) => {
    expect(liveBlock(status)).toBe(block);
  });

  it.each([["was_live"], ["not_live"], [null]] as const)("lets %s through", (status) => {
    expect(liveBlock(status)).toBeUndefined();
  });
});

describe("liveError", () => {
  it.each([
    ["is_live", "Live streams can't be downloaded."],
    ["is_upcoming", "Live streams can't be downloaded."],
    ["post_live", "This stream just ended. Try again later."],
    ["was_live", undefined],
    ["not_live", undefined],
    [null, undefined],
  ] as const)("%s gives %s", (status, message) => {
    expect(liveError(status)).toBe(message);
  });
});

describe("isUpcomingError", () => {
  it("recognizes the error yt-dlp gives for a scheduled YouTube stream", () => {
    expect(isUpcomingError("ERROR: [youtube] 6rDSzyhW6vw: This live event will begin in 2 days.")).toBe(true);
    expect(isUpcomingError("ERROR: [youtube] 6rDSzyhW6vw: This live event will begin in a few moments.")).toBe(true);
  });

  it.each([
    ["no error", undefined],
    ["another error", "ERROR: [youtube] abc: Video unavailable"],
    ["the text from another source", "ERROR: [generic] x: This live event will begin in 2 days."],
    ["the text in the middle of a line", "WARNING: ERROR: [youtube] x: This live event will begin in 2 days."],
  ])("is false for %s", (_, error) => {
    expect(isUpcomingError(error)).toBe(false);
  });
});
