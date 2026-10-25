import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

export const CLIP = "clip.mp4";
export const THUMBNAIL = "clip.jpg";

/**
 * Erzeugt die Fixture-Medien mit ffmpeg. Der Cache-Schlüssel ist der Hash dieser
 * Datei, eine Änderung am Generator erzeugt die Medien also neu.
 */
export async function ensureMedia(cacheRoot: string): Promise<string> {
  const script = await readFile(fileURLToPath(import.meta.url));
  const key = createHash("sha256").update(script).digest("hex").slice(0, 16);
  const dir = join(cacheRoot, key);
  if (existsSync(dir)) return dir;

  await mkdir(cacheRoot, { recursive: true });
  const work = await mkdtemp(join(cacheRoot, ".tmp-"));
  await ffmpeg(
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
    "-movflags", "+faststart", join(work, CLIP),
  );
  await ffmpeg(
    "-f", "lavfi", "-i", "testsrc2=size=640x360",
    "-frames:v", "1", join(work, THUMBNAIL),
  );
  try {
    await rename(work, dir);
  } catch (error) {
    // Ein paralleler Lauf war schneller.
    await rm(work, { recursive: true, force: true });
    if (!existsSync(dir)) throw error;
  }
  return dir;
}

async function ffmpeg(...args: string[]) {
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
}
