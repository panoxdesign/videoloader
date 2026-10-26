import { LOG_LEVELS, type LogLevel } from "./config/config";

export type Logger = Record<LogLevel, (message: string) => void>;

type LoggerOptions = {
  level: LogLevel;
  timeZone: string;
  now?: () => number;
  write?: (line: string, level: LogLevel) => void;
};

function writeToStdio(line: string, level: LogLevel) {
  (level === "warn" || level === "error" ? process.stderr : process.stdout).write(line);
}

export function createLogger({ level, timeZone, now = Date.now, write = writeToStdio }: LoggerOptions): Logger {
  const timestamp = timestampFormatter(timeZone);
  const threshold = LOG_LEVELS.indexOf(level);
  const entry = (lineLevel: LogLevel) => (message: string) => {
    if (LOG_LEVELS.indexOf(lineLevel) < threshold) return;
    write(`${timestamp(now())} ${lineLevel.toUpperCase()} ${message}\n`, lineLevel);
  };
  return { debug: entry("debug"), info: entry("info"), warn: entry("warn"), error: entry("error") };
}

export function formatTimestamp(ms: number, timeZone: string) {
  return timestampFormatter(timeZone)(ms);
}

/** `YYYY-MM-DD HH:mm:ss` in der Zone aus `TZ`. */
function timestampFormatter(timeZone: string) {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return (ms: number) => {
    const part = Object.fromEntries(format.formatToParts(ms).map(({ type, value }) => [type, value]));
    return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}:${part.second}`;
  };
}
