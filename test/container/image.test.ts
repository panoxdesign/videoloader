import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  dockerExec,
  logs,
  PINNED_YTDLP,
  removeContainers,
  startContainer,
  waitForHealth,
} from "./docker";

let id: string;

beforeAll(async () => {
  id = await startContainer();
  const health = await waitForHealth(id);
  if (health !== "healthy") throw new Error(`container is ${health}:\n${await logs(id)}`);
});

afterAll(removeContainers);

describe("runtime image", () => {
  it("bundles the pinned yt-dlp", async () => {
    expect((await dockerExec(id, "yt-dlp", "--version")).output.trim()).toBe(PINNED_YTDLP);
  });

  it("has ffmpeg and ffprobe", async () => {
    expect((await dockerExec(id, "ffmpeg", "-version")).code).toBe(0);
    expect((await dockerExec(id, "ffprobe", "-version")).code).toBe(0);
  });

  it("has no Python", async () => {
    expect((await dockerExec(id, "sh", "-c", "command -v python3 || command -v python")).code).not.toBe(0);
  });

  it("has no sharp or @img in the standalone output", async () => {
    expect((await dockerExec(id, "sh", "-c", "test -e node_modules/sharp || test -e node_modules/@img")).code)
      .not.toBe(0);
  });

  it("loads better-sqlite3 from the standalone output", async () => {
    // register hat die DB beim Start geöffnet, das Addon ist also schon geladen.
    const maps = await dockerExec(id, "sh", "-c", 'grep -qs "/app/node_modules/better-sqlite3/prebuilds/" /proc/[0-9]*/maps');
    expect(maps.code).toBe(0);
  });

  it("warns in one line that the app is open without a password", async () => {
    const warnings = (await logs(id)).split("\n").filter((line) => line.includes("No password set"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(" WARN ");
  });
});
