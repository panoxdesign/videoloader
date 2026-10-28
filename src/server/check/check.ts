import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { buildCheckArgs } from "../worker/args";
import { parseCheck, type CheckResult } from "./parse-check";

/**
 * Wie der Vorschau-Timeout. Eine Server Action erfährt nicht, wenn der Client trennt,
 * deshalb begrenzt nur diese Frist, wie lange yt-dlp umsonst weiterläuft.
 */
export const CHECK_TIMEOUT_MS = 120_000;

export type CheckInput = { ytDlpPath: string; url: string; cacheDir: string; signal: AbortSignal };

/** Prüft einen Link mit yt-dlp, ohne etwas herunterzuladen. Feuert `signal`, wird die Prozessgruppe beendet. */
export async function checkLink({ ytDlpPath, url, cacheDir, signal }: CheckInput): Promise<CheckResult> {
  if (signal.aborted) return { kind: "none", timedOut: true };

  const child = spawn(ytDlpPath, buildCheckArgs({ url, cacheDir }), { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const kill = () => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {
      // Schon beendet.
    }
  };
  signal.addEventListener("abort", kill, { once: true });

  const stdout: Buffer[] = [];
  let error: string | undefined;
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  createInterface({ input: child.stderr }).on("line", (line) => {
    if (!error && line.startsWith("ERROR:")) error = line;
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code));
  });
  signal.removeEventListener("abort", kill);

  if (signal.aborted) return { kind: "none", timedOut: true };
  if (exitCode !== 0) return error ? { kind: "none", error } : { kind: "none" };
  return parseCheck(Buffer.concat(stdout).toString("utf8"));
}
