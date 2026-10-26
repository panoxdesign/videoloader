import { describe, expect, it } from "vitest";
import { createLogger, formatTimestamp } from "./log";

const at = Date.UTC(2026, 9, 26, 13, 5, 9);

describe("formatTimestamp", () => {
  it("formats the time in the given time zone", () => {
    expect(formatTimestamp(at, "UTC")).toBe("2026-10-26 13:05:09");
    expect(formatTimestamp(at, "Europe/Berlin")).toBe("2026-10-26 14:05:09");
    expect(formatTimestamp(Date.UTC(2026, 6, 1, 23, 0, 0), "Europe/Berlin")).toBe("2026-07-02 01:00:00");
  });
});

describe("createLogger", () => {
  function capture(level: "debug" | "info" | "warn" | "error") {
    const lines: string[] = [];
    const log = createLogger({ level, timeZone: "UTC", now: () => at, write: (line) => lines.push(line) });
    return { log, lines };
  }

  it("writes lines with timestamp and level", () => {
    const { log, lines } = capture("debug");
    log.debug("spawning yt-dlp");
    log.error("slot failed");
    expect(lines).toEqual([
      "2026-10-26 13:05:09 DEBUG spawning yt-dlp\n",
      "2026-10-26 13:05:09 ERROR slot failed\n",
    ]);
  });

  it("drops messages below the log level", () => {
    const { log, lines } = capture("warn");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(lines.map((line) => line.split(" ")[2])).toEqual(["WARN", "ERROR"]);
  });

  it("keeps a multi-line message in one write", () => {
    const { log, lines } = capture("info");
    log.error("Invalid configuration:\n  - one\n  - two");
    expect(lines).toHaveLength(1);
  });
});
