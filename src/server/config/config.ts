import { isAbsolute, posix } from "node:path";

export type Env = Record<string, string | undefined>;

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const YTDLP_UPDATES = ["off", "stable", "nightly"] as const;
export type YtdlpUpdate = (typeof YTDLP_UPDATES)[number];

export type Config = {
  dataDir: string;
  maxConcurrentDownloads: number;
  retentionDays: number;
  startIntervalSeconds: number;
  ytdlpUpdate: YtdlpUpdate;
  password: string | undefined;
  logLevel: LogLevel;
  port: number;
  timeZone: string;
};

/** Dateisystem-Fakten, die `gatherFacts` vor der Prüfung einsammelt. */
export type Facts = {
  dataDir: "ok" | "missing" | "not-a-directory" | "not-writable";
  /** Nur gesetzt, wenn `APP_PASSWORD_FILE` gesetzt ist. */
  passwordFile?:
    | { kind: "read"; content: string }
    | { kind: "missing" }
    | { kind: "unreadable" }
    | { kind: "directory" };
  /** Mount-Punkte laut `/proc/self/mountinfo`, `undefined` ohne `/proc`. */
  mountPoints?: readonly string[];
  uid: number;
  gid: number;
};

export type ConfigResult = { ok: true; config: Config } | { ok: false; problems: string[] };

export const DEFAULT_DATA_DIR = "/data";

/** Ein gesetzter, aber leerer Wert gilt als nicht gesetzt. */
function value(env: Env, name: string) {
  return env[name] || undefined;
}

export function resolveDataDir(env: Env) {
  const raw = value(env, "DATA_DIR") ?? DEFAULT_DATA_DIR;
  const normalized = posix.normalize(raw);
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

export function passwordFilePath(env: Env) {
  return value(env, "APP_PASSWORD_FILE");
}

export function isTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Prüft Env-Werte und Dateisystem-Fakten und liefert entweder eine gültige
 * Konfiguration oder alle Probleme auf einmal.
 */
export function parseConfig(env: Env, facts: Facts): ConfigResult {
  const problems: string[] = [];

  const integer = (name: string, fallback: number, min: number, max: number, range: string) => {
    const raw = value(env, name);
    if (raw === undefined) return fallback;
    const parsed = /^-?\d+$/.test(raw) ? Number(raw) : NaN;
    if (Number.isSafeInteger(parsed) && parsed >= min && parsed <= max) return parsed;
    problems.push(`${name} must be ${range} (got "${raw}").`);
    return fallback;
  };

  const oneOf = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const raw = value(env, name);
    if (raw === undefined) return fallback;
    const match = allowed.find((option) => option === raw.toLowerCase());
    if (match) return match;
    problems.push(`${name} must be one of ${allowed.join(", ")} (got "${raw}").`);
    return fallback;
  };

  const maxConcurrentDownloads = integer(
    "MAX_CONCURRENT_DOWNLOADS", 1, 1, 10, "a whole number from 1 to 10",
  );
  const retentionDays = integer(
    "RETENTION_DAYS", 7, 0, Number.MAX_SAFE_INTEGER, "a whole number of days, 0 or more (0 = never delete)",
  );
  const startIntervalSeconds = integer(
    "START_INTERVAL_SECONDS", 15, 0, 3600, "a whole number of seconds from 0 to 3600 (0 = off)",
  );
  const ytdlpUpdate = oneOf("YTDLP_UPDATE", YTDLP_UPDATES, "off");
  const logLevel = oneOf("LOG_LEVEL", LOG_LEVELS, "info");
  // Next schreibt PORT vor `register` auf den tatsächlich genutzten Port um: Ungültiges fällt
  // dort auf 3000 zurück, ein Wert außerhalb des Bereichs lässt Next selbst abbrechen.
  const port = integer("PORT", 3000, 1, 65535, "a port number from 1 to 65535");

  const timeZone = value(env, "TZ") ?? "UTC";
  if (!isTimeZone(timeZone)) {
    problems.push(`TZ must be an IANA time zone such as Europe/Berlin (got "${timeZone}").`);
  }

  const password = readPassword(env, facts, problems);
  const dataDir = resolveDataDir(env);
  checkDataDir(env, facts, dataDir, problems);

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    config: {
      dataDir,
      maxConcurrentDownloads,
      retentionDays,
      startIntervalSeconds,
      ytdlpUpdate,
      password,
      logLevel,
      port,
      timeZone,
    },
  };
}

/** Die Datei hat Vorrang. Ergibt sie kein Passwort, gibt es keinen Rückfall auf `APP_PASSWORD`. */
function readPassword(env: Env, facts: Facts, problems: string[]) {
  const file = passwordFilePath(env);
  if (file === undefined) return value(env, "APP_PASSWORD");

  const fact = facts.passwordFile ?? { kind: "missing" };
  const fail = (reason: string) => {
    problems.push(`APP_PASSWORD_FILE ${file} ${reason}, so the password protection would be off.`);
    return undefined;
  };
  switch (fact.kind) {
    case "missing":
      return fail("does not exist");
    case "unreadable":
      return fail(`is not readable for UID ${facts.uid}`);
    case "directory":
      return fail("is a directory, not a file");
    case "read": {
      const password = fact.content.trimEnd();
      return password === "" ? fail("is empty or contains only whitespace") : password;
    }
  }
}

function checkDataDir(env: Env, facts: Facts, dataDir: string, problems: string[]) {
  if (!isAbsolute(dataDir)) {
    problems.push(`DATA_DIR must be an absolute path (got "${env.DATA_DIR}").`);
    return;
  }
  if (facts.dataDir === "missing" || facts.dataDir === "not-a-directory") {
    const what = facts.dataDir === "missing" ? "does not exist" : "is not a directory";
    problems.push(`DATA_DIR ${dataDir} ${what}. Mount a volume there, e.g. -v ./data:${dataDir}.`);
    return;
  }
  if (facts.dataDir === "not-writable") {
    problems.push(
      `DATA_DIR ${dataDir} is not writable for UID ${facts.uid} / GID ${facts.gid}. ` +
        `Give the directory to that user (chown -R ${facts.uid}:${facts.gid} <host directory>) ` +
        `or run the container as the owner of the directory with user: "<uid>:<gid>".`,
    );
  }
  // Unter `next dev` und in Tests liegt der Datenordner absichtlich nicht auf einem Volume.
  if (env.NODE_ENV === "production" && facts.mountPoints && !isOnVolume(dataDir, facts.mountPoints)) {
    problems.push(
      `No volume is mounted at DATA_DIR ${dataDir}, so the queue and all downloads would be lost ` +
        `when the container is recreated. Mount one, e.g. -v ./data:${dataDir}.`,
    );
  }
}

/** Der Datenordner oder einer seiner Elternordner ist ein Mount-Punkt, aber nicht `/`. */
function isOnVolume(dataDir: string, mountPoints: readonly string[]) {
  return mountPoints.some(
    (mount) => mount !== "/" && (dataDir === mount || dataDir.startsWith(`${mount}/`)),
  );
}

export function formatProblems(problems: string[]) {
  return [
    "Invalid configuration, the app does not start:",
    ...problems.map((problem) => `  - ${problem}`),
  ].join("\n");
}

/** Die wirksame Konfiguration als eine Log-Zeile, das Passwort nur als „set“ oder „not set“. */
export function describeConfig(config: Config) {
  const fields = [
    `DATA_DIR=${config.dataDir}`,
    `MAX_CONCURRENT_DOWNLOADS=${config.maxConcurrentDownloads}`,
    `RETENTION_DAYS=${config.retentionDays}`,
    `START_INTERVAL_SECONDS=${config.startIntervalSeconds}`,
    `YTDLP_UPDATE=${config.ytdlpUpdate}`,
    `LOG_LEVEL=${config.logLevel}`,
    `PORT=${config.port}`,
    `TZ=${config.timeZone}`,
    `password: ${config.password === undefined ? "not set" : "set"}`,
  ];
  return `Configuration: ${fields.join(", ")}`;
}
