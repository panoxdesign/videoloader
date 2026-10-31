import { and, eq } from "drizzle-orm";
import { open, realpath, rm, rmdir, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { Readable } from "node:stream";
import type { Db } from "../db/open";
import { queueEntries, type QueueEntry } from "../db/schema";
import { contentDisposition, contentTypeOf, parseRange } from "./http";
import { isInside } from "./inside";

type MediaEntry = Pick<QueueEntry, "state" | "filePath">;

/**
 * Der echte Pfad der Mediendatei eines fertigen Eintrags, oder `undefined`, wenn sie fehlt
 * oder nicht unter `downloads/` liegt. Geprüft wird der Pfad aus der DB und, gegen
 * Symlink-Flucht, auch der aufgelöste.
 */
export async function findMediaFile(downloadsDir: string, entry: MediaEntry | undefined) {
  if (entry?.state !== "done" || !entry.filePath || !isInside(downloadsDir, entry.filePath)) return undefined;
  try {
    const real = await realpath(entry.filePath);
    if (!isInside(await realpath(downloadsDir), real)) return undefined;
    return (await stat(real)).isFile() ? real : undefined;
  } catch {
    return undefined;
  }
}

/** Antwort für `/api/files/<id>`: die ganze Datei oder ein Bereich daraus, sonst 404. */
export async function serveMediaFile(downloadsDir: string, entry: MediaEntry | undefined, headers: Headers) {
  const file = await findMediaFile(downloadsDir, entry);
  // Über das Handle, damit Größe und Inhalt zur selben Datei gehören.
  const handle = file && (await open(file).catch(() => undefined));
  if (!handle) return new Response("Not found", { status: 404 });

  const { size, mtime } = await handle.stat();
  const etag = `W/"${size}-${mtime.getTime()}"`;
  const base = {
    "accept-ranges": "bytes",
    "cache-control": "private, no-cache",
    "content-disposition": contentDisposition(basename(entry!.filePath!)),
    "content-type": contentTypeOf(entry!.filePath!),
    etag,
    "last-modified": mtime.toUTCString(),
  };

  // Fortsetzen nur, solange die Datei dieselbe ist. Sonst kommt sie ganz.
  const ifRange = headers.get("if-range");
  const range = ifRange && ifRange !== etag && ifRange !== base["last-modified"] ? "full" : parseRange(headers.get("range"), size);
  if (range === "unsatisfiable") {
    await handle.close();
    return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${size}` } });
  }

  const { start, end } = range === "full" ? { start: 0, end: size - 1 } : range;
  const body = size === 0 ? null : (Readable.toWeb(handle.createReadStream({ start, end })) as ReadableStream);
  if (!body) await handle.close();
  return new Response(body, {
    status: range === "full" ? 200 : 206,
    headers: {
      ...base,
      "content-length": String(end - start + 1),
      ...(range !== "full" && { "content-range": `bytes ${start}-${end}/${size}` }),
    },
  });
}

/**
 * Löscht einen fertigen Eintrag samt Mediendatei. Liegt die Datei nicht unter `downloads/`,
 * bleibt sie unberührt und nur der Eintrag geht. War sie die letzte in ihrem Playlist-Ordner,
 * geht der Ordner mit. `false`, wenn es keinen fertigen Eintrag gibt.
 */
export async function deleteDoneEntry(db: Db, downloadsDir: string, id: number) {
  // Direkt statt über `getEntry`: `queue.ts` importiert diese Datei, ein Import zurück wäre ein Kreis.
  const entry = db.select().from(queueEntries).where(eq(queueEntries.id, id)).get();
  if (entry?.state !== "done") return false;
  const file = await findMediaFile(downloadsDir, entry);
  if (file) {
    await rm(file, { force: true });
    await removeEmptyFolder(downloadsDir, dirname(file));
  }
  db.delete(queueEntries).where(and(eq(queueEntries.id, id), eq(queueEntries.state, "done"))).run();
  return true;
}

/** `rmdir` scheitert an einem Ordner, in dem noch etwas liegt. `downloads/` selbst bleibt immer. */
async function removeEmptyFolder(downloadsDir: string, folder: string) {
  const root = await realpath(downloadsDir).catch(() => undefined);
  if (!root || folder === root || !isInside(root, folder)) return;
  await rmdir(folder).catch(() => undefined);
}
