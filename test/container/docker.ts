import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Das Runtime-Image aus `docker compose -f compose.test.yaml build`. */
export const IMAGE = process.env.IMAGE ?? "videoloader-test-videoloader";

/** Der im Dockerfile gepinnte `ARG YTDLP_VERSION`. */
export const PINNED_YTDLP = readFileSync("Dockerfile", "utf8").match(/^ARG YTDLP_VERSION=(\S+)$/m)![1];

export const DATA_TMPFS = "/data:uid=1000,gid=1000";

export async function docker(...args: string[]) {
  const { stdout } = await exec("docker", args);
  return stdout.trim();
}

/** Liefert Exit-Code und Ausgabe, ohne bei Exit ≠ 0 zu werfen. */
export async function dockerExec(id: string, ...command: string[]) {
  try {
    const { stdout, stderr } = await exec("docker", ["exec", id, ...command]);
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };
    return { code, output: stdout + stderr };
  }
}

const started: string[] = [];

/** Startet einen Container wie die Compose-Datei (`init: true`), standardmäßig mit tmpfs unter `/data`. */
export async function startContainer({
  env = {},
  tmpfs = DATA_TMPFS,
}: { env?: Record<string, string>; tmpfs?: string | null } = {}) {
  const args = ["run", "-d", "--init"];
  if (tmpfs) args.push("--tmpfs", tmpfs);
  for (const [name, value] of Object.entries(env)) args.push("-e", `${name}=${value}`);
  const id = await docker(...args, IMAGE);
  started.push(id);
  return id;
}

export async function removeContainers() {
  const ids = started.splice(0);
  if (ids.length > 0) await docker("rm", "-f", ...ids);
}

export async function logs(id: string) {
  const { stdout, stderr } = await exec("docker", ["logs", id]);
  return stdout + stderr;
}

async function poll<T>(probe: () => Promise<T | undefined>, timeoutMs: number, what: string) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export function waitForExit(id: string, timeoutMs = 30_000) {
  return poll(
    async () => {
      const [status, code] = (await docker("inspect", "-f", "{{.State.Status}} {{.State.ExitCode}}", id)).split(" ");
      return status === "exited" ? Number(code) : undefined;
    },
    timeoutMs,
    `container ${id} to exit`,
  );
}

/** Wartet, bis der HEALTHCHECK `healthy` oder `unhealthy` meldet, und liefert den Status. */
export function waitForHealth(id: string, timeoutMs = 60_000) {
  return poll(
    async () => {
      const status = await docker("inspect", "-f", "{{.State.Status}} {{.State.Health.Status}}", id);
      if (status.startsWith("exited")) return "exited";
      const health = status.split(" ")[1];
      return health === "healthy" || health === "unhealthy" ? health : undefined;
    },
    timeoutMs,
    `container ${id} to become healthy`,
  );
}
