import { describe, expect, it } from "vitest";
import { describeConfig, formatProblems, parseConfig, startIntervalFromEnv, type Facts } from "./config";

const okFacts: Facts = { dataDir: "ok", mountPoints: ["/", "/data"], uid: 1000, gid: 1000 };
const production = { NODE_ENV: "production" };

function problemsOf(env: Record<string, string>, facts: Partial<Facts> = {}) {
  const result = parseConfig(env, { ...okFacts, ...facts });
  if (result.ok) throw new Error("expected problems, got a valid config");
  return result.problems;
}

function configOf(env: Record<string, string>, facts: Partial<Facts> = {}) {
  const result = parseConfig(env, { ...okFacts, ...facts });
  if (!result.ok) throw new Error(`expected a valid config, got:\n${result.problems.join("\n")}`);
  return result.config;
}

describe("parseConfig", () => {
  it("uses the defaults when nothing is set", () => {
    expect(configOf({})).toEqual({
      dataDir: "/data",
      maxConcurrentDownloads: 1,
      retentionDays: 7,
      startIntervalSeconds: 15,
      ytdlpUpdate: "off",
      password: undefined,
      logLevel: "info",
      port: 3000,
      timeZone: "UTC",
    });
  });

  it("treats empty values as not set", () => {
    const empty = Object.fromEntries(
      [
        "DATA_DIR",
        "MAX_CONCURRENT_DOWNLOADS",
        "RETENTION_DAYS",
        "START_INTERVAL_SECONDS",
        "YTDLP_UPDATE",
        "APP_PASSWORD",
        "APP_PASSWORD_FILE",
        "LOG_LEVEL",
        "PORT",
        "TZ",
      ].map((name) => [name, ""]),
    );
    expect(configOf(empty)).toEqual(configOf({}));
  });

  it("reads all values", () => {
    expect(
      configOf({
        DATA_DIR: "/srv/videoloader/",
        MAX_CONCURRENT_DOWNLOADS: "3",
        RETENTION_DAYS: "0",
        START_INTERVAL_SECONDS: "0",
        YTDLP_UPDATE: "nightly",
        APP_PASSWORD: "hunter2",
        LOG_LEVEL: "debug",
        PORT: "8080",
        TZ: "Europe/Berlin",
      }),
    ).toEqual({
      dataDir: "/srv/videoloader",
      maxConcurrentDownloads: 3,
      retentionDays: 0,
      startIntervalSeconds: 0,
      ytdlpUpdate: "nightly",
      password: "hunter2",
      logLevel: "debug",
      port: 8080,
      timeZone: "Europe/Berlin",
    });
  });

  it.each([
    ["MAX_CONCURRENT_DOWNLOADS", "1", 1],
    ["MAX_CONCURRENT_DOWNLOADS", "10", 10],
    ["START_INTERVAL_SECONDS", "0", 0],
    ["START_INTERVAL_SECONDS", "3600", 3600],
    ["RETENTION_DAYS", "0", 0],
    ["RETENTION_DAYS", "36500", 36500],
    ["PORT", "1", 1],
    ["PORT", "65535", 65535],
    ["MAX_CONCURRENT_DOWNLOADS", "007", 7],
  ])("accepts %s=%s", (name, value, expected) => {
    const key = {
      MAX_CONCURRENT_DOWNLOADS: "maxConcurrentDownloads",
      START_INTERVAL_SECONDS: "startIntervalSeconds",
      RETENTION_DAYS: "retentionDays",
      PORT: "port",
    }[name] as "maxConcurrentDownloads";
    expect(configOf({ [name]: value })[key]).toBe(expected);
  });

  it.each([
    ["MAX_CONCURRENT_DOWNLOADS", "0"],
    ["MAX_CONCURRENT_DOWNLOADS", "11"],
    ["START_INTERVAL_SECONDS", "-1"],
    ["START_INTERVAL_SECONDS", "3601"],
    ["RETENTION_DAYS", "-1"],
    ["PORT", "0"],
    ["PORT", "65536"],
  ])("rejects %s=%s as out of range", (name, value) => {
    const problems = problemsOf({ [name]: value });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(name);
    expect(problems[0]).toContain(`"${value}"`);
  });

  it.each(["30d", "1.5", " 7", "7 ", "1e2", "0x10", "+3", "seven", "99999999999999999999"])(
    "rejects RETENTION_DAYS=%j as not a whole number",
    (value) => {
      const problems = problemsOf({ RETENTION_DAYS: value });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("RETENTION_DAYS");
    },
  );

  it("reads enumerations case-insensitively", () => {
    expect(configOf({ YTDLP_UPDATE: "Stable", LOG_LEVEL: "WARN" })).toMatchObject({
      ytdlpUpdate: "stable",
      logLevel: "warn",
    });
  });

  it.each([
    ["YTDLP_UPDATE", "weekly", "off, stable, nightly"],
    ["LOG_LEVEL", "verbose", "debug, info, warn, error"],
  ])("rejects %s=%s and lists the allowed values", (name, value, allowed) => {
    const problems = problemsOf({ [name]: value });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(name);
    expect(problems[0]).toContain(allowed);
  });

  it("rejects a time zone that is not an IANA zone", () => {
    const problems = problemsOf({ TZ: "Mars/Olympus_Mons" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("TZ");
  });

  it("rejects a relative DATA_DIR", () => {
    const problems = problemsOf({ DATA_DIR: "data" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("DATA_DIR");
  });

  describe("password", () => {
    it("takes the password file before APP_PASSWORD and trims the end of the file", () => {
      const config = configOf(
        { APP_PASSWORD: "from-env", APP_PASSWORD_FILE: "/run/secrets/pw" },
        { passwordFile: { kind: "read", content: "  from file \r\n\n" } },
      );
      expect(config.password).toBe("  from file");
    });

    it.each([
      [{ kind: "missing" } as const, "does not exist"],
      [{ kind: "unreadable" } as const, "not readable"],
      [{ kind: "directory" } as const, "directory"],
      [{ kind: "read", content: " \n\t\n" } as const, "empty"],
    ])("fails when APP_PASSWORD_FILE gives no password (%o)", (passwordFile, reason) => {
      // Kein stiller Rückfall auf APP_PASSWORD, sonst fiele der Schutz unbemerkt weg.
      const problems = problemsOf(
        { APP_PASSWORD: "from-env", APP_PASSWORD_FILE: "/run/secrets/pw" },
        { passwordFile },
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("APP_PASSWORD_FILE");
      expect(problems[0]).toContain("/run/secrets/pw");
      expect(problems[0]).toContain(reason);
    });
  });

  describe("DATA_DIR", () => {
    it("fails when the directory is missing", () => {
      const problems = problemsOf({ ...production }, { dataDir: "missing", mountPoints: ["/"] });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("DATA_DIR /data does not exist");
    });

    it("fails when the directory is not writable and names UID, GID, user: and chown", () => {
      const problems = problemsOf({}, { dataDir: "not-writable", uid: 1000, gid: 1001 });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("UID 1000");
      expect(problems[0]).toContain("GID 1001");
      expect(problems[0]).toContain("user:");
      expect(problems[0]).toContain("chown");
    });

    it("fails when there is no volume at DATA_DIR in production and names -v ./data:/data", () => {
      const problems = problemsOf({ ...production }, { mountPoints: ["/", "/etc/hosts", "/dat"] });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("-v ./data:/data");
    });

    it("accepts a volume at a parent of DATA_DIR", () => {
      expect(configOf({ ...production, DATA_DIR: "/srv/videoloader" }, { mountPoints: ["/", "/srv"] }))
        .toMatchObject({ dataDir: "/srv/videoloader" });
    });

    it("skips the mount check without /proc and outside the production build", () => {
      expect(configOf({ ...production }, { mountPoints: undefined }).dataDir).toBe("/data");
      expect(configOf({ NODE_ENV: "development" }, { mountPoints: ["/"] }).dataDir).toBe("/data");
    });
  });

  it("reports every problem at once", () => {
    const problems = problemsOf({
      RETENTION_DAYS: "30d",
      MAX_CONCURRENT_DOWNLOADS: "0",
      YTDLP_UPDATE: "weekly",
    });
    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).toMatch(/RETENTION_DAYS[\s\S]*MAX_CONCURRENT_DOWNLOADS|MAX_CONCURRENT_DOWNLOADS[\s\S]*RETENTION_DAYS/);
    expect(problems.join("\n")).toContain("YTDLP_UPDATE");
  });

  it("reports value problems together with file system problems", () => {
    const problems = problemsOf(
      { ...production, PORT: "http", APP_PASSWORD_FILE: "/pw" },
      { dataDir: "not-writable", mountPoints: ["/"], passwordFile: { kind: "missing" } },
    );
    expect(problems).toHaveLength(4);
  });
});

describe("formatProblems", () => {
  it("puts all problems into one message", () => {
    const message = formatProblems(["first problem", "second problem"]);
    expect(message).toContain("first problem");
    expect(message).toContain("second problem");
    expect(message.split("\n")[0]).toMatch(/configuration/i);
  });
});

describe("describeConfig", () => {
  it("shows the effective configuration with the password only as set or not set", () => {
    const line = describeConfig(configOf({ APP_PASSWORD: "hunter2", RETENTION_DAYS: "" }));
    expect(line).not.toContain("hunter2");
    expect(line).toContain("password: set");
    expect(line).toContain("RETENTION_DAYS=7");
    expect(line).not.toContain("\n");
    expect(describeConfig(configOf({}))).toContain("password: not set");
  });
});

describe("startIntervalFromEnv", () => {
  it("reads the start interval for request contexts like the start does", () => {
    expect(startIntervalFromEnv({})).toBe(configOf({}).startIntervalSeconds);
    expect(startIntervalFromEnv({ START_INTERVAL_SECONDS: "0" })).toBe(0);
    expect(startIntervalFromEnv({ START_INTERVAL_SECONDS: "45" })).toBe(45);
  });
});
