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
/** DASH mit getrenntem Video in drei Auflösungen und einer Audiospur. */
export const DASH_DIR = "dash";
export const DASH_MANIFEST = "manifest.mpd";
export const DASH_HEIGHTS = [240, 480, 720] as const;

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
  await mkdir(join(work, DASH_DIR));
  await ffmpeg(
    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
    ...DASH_HEIGHTS.flatMap(() => ["-map", "0:v"]), "-map", "1:a",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "25",
    ...DASH_HEIGHTS.flatMap((height, i) => [`-filter:v:${i}`, `scale=-2:${height}`, `-b:v:${i}`, `${height}k`]),
    "-c:a", "aac", "-b:a", "64k",
    "-f", "dash", "-seg_duration", "1", "-adaptation_sets", "id=0,streams=v id=1,streams=a",
    join(work, DASH_DIR, DASH_MANIFEST),
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
