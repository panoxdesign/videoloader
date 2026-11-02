import { describe, expect, it } from "vitest";
import { RawLog } from "./raw-log";

const bytes = (text: string) => new TextEncoder().encode(text).length;

describe("RawLog", () => {
  it("joins the lines in the order they came", () => {
    const log = new RawLog(100);
    log.push("[generic] Extracting URL");
    log.push("ERROR: Unsupported URL");
    expect(log.text()).toBe("[generic] Extracting URL\nERROR: Unsupported URL");
  });

  it("is empty without lines", () => {
    expect(new RawLog(100).text()).toBe("");
  });

  it("drops the oldest whole lines once it is full", () => {
    const log = new RawLog(10);
    for (const line of ["aaaa", "bbbb", "cccc"]) log.push(line);
    // „bbbb\ncccc“ sind 9 Bytes, mit „aaaa\n“ wären es 14.
    expect(log.text()).toBe("bbbb\ncccc");
  });

  it("counts bytes, not characters", () => {
    const log = new RawLog(10);
    log.push("äää"); // 6 Bytes
    log.push("ööö"); // 6 Bytes, zusammen mit \n 13
    expect(log.text()).toBe("ööö");
  });

  it("keeps the end of a single line that is longer than the limit", () => {
    const log = new RawLog(8);
    log.push("old");
    log.push("0123456789abcdef");
    expect(log.text()).toBe("89abcdef");
  });

  it("never cuts a character in half", () => {
    const log = new RawLog(5);
    log.push("xäöü"); // 7 Bytes
    expect(log.text()).toBe("öü");
  });

  it("stays within 64 KB by default", () => {
    const log = new RawLog();
    for (let i = 0; i < 5000; i++) log.push(`[download] line ${i} ${"x".repeat(40)}`);
    const text = log.text();
    expect(bytes(text)).toBeLessThanOrEqual(64 * 1024);
    expect(bytes(text)).toBeGreaterThan(63 * 1024);
    expect(text.endsWith(`line 4999 ${"x".repeat(40)}`)).toBe(true);
  });
});
