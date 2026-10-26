import { afterEach, describe, expect, it } from "vitest";
import { dockerExec, logs, removeContainers, startContainer, waitForExit, waitForHealth } from "./docker";

afterEach(removeContainers);

describe("startup check", () => {
  it("aborts with a single message that names every invalid value", async () => {
    const id = await startContainer({
      env: { RETENTION_DAYS: "30d", MAX_CONCURRENT_DOWNLOADS: "0", YTDLP_UPDATE: "weekly" },
    });

    expect(await waitForExit(id)).not.toBe(0);
    const output = await logs(id);
    expect(output.match(/Invalid configuration/g)).toHaveLength(1);
    expect(output).toContain('RETENTION_DAYS must be a whole number of days, 0 or more (0 = never delete) (got "30d")');
    expect(output).toContain('MAX_CONCURRENT_DOWNLOADS must be a whole number from 1 to 10 (got "0")');
    expect(output).toContain('YTDLP_UPDATE must be one of off, stable, nightly (got "weekly")');
  });

  it("aborts when APP_PASSWORD_FILE points to a missing file", async () => {
    const id = await startContainer({ env: { APP_PASSWORD_FILE: "/run/secrets/app_password" } });

    expect(await waitForExit(id)).not.toBe(0);
    expect(await logs(id)).toContain("APP_PASSWORD_FILE /run/secrets/app_password does not exist");
  });

  it("aborts without a volume at DATA_DIR and shows how to mount one", async () => {
    const id = await startContainer({ tmpfs: null });

    expect(await waitForExit(id)).not.toBe(0);
    const output = await logs(id);
    expect(output).toContain("No volume is mounted at DATA_DIR /data");
    expect(output).toContain("-v ./data:/data");
  });

  it("aborts when DATA_DIR is not writable for UID 1000", async () => {
    const id = await startContainer({ tmpfs: "/data:uid=0,gid=0,mode=755" });

    expect(await waitForExit(id)).not.toBe(0);
    const output = await logs(id);
    expect(output).toContain("DATA_DIR /data is not writable for UID 1000 / GID 1000");
    expect(output).toContain("chown");
    expect(output).toContain("user:");
  });

  it("starts with a configuration line, becomes healthy and runs as UID 1000", async () => {
    const password = "correct horse battery staple";
    const id = await startContainer({ env: { APP_PASSWORD: password, RETENTION_DAYS: "", TZ: "Europe/Berlin" } });

    expect(await waitForHealth(id)).toBe("healthy");
    const output = await logs(id);
    const configLine = output.split("\n").find((line) => line.includes("Configuration:"));
    expect(configLine).toContain("RETENTION_DAYS=7");
    expect(configLine).toContain("TZ=Europe/Berlin");
    expect(configLine).toContain("password: set");
    expect(output).not.toContain(password);
    expect(output).not.toContain("No password set");

    expect((await dockerExec(id, "id", "-u")).output.trim()).toBe("1000");
    const dirs = await dockerExec(id, "ls", "/data");
    expect(dirs.output.split("\n").filter(Boolean).sort()).toEqual(
      ["bin", "cache", "config", "db", "downloads", "tmp"],
    );
  });
});
