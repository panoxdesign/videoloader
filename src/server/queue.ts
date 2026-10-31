import { and, asc, count, eq, lt, lte, or } from "drizzle-orm";
import type { Media } from "@/lib/media";
import type { CheckedMedia, FileNaming } from "./check/parse-check";
import type { Db, Tx } from "./db/open";
import { queueEntries, type QueueEntry } from "./db/schema";
import { findDuplicate, type MediaIdentity } from "./duplicate";
import { findMediaFile } from "./files/media-file";

/** Was ein Eintrag aus einer Playlist zusätzlich trägt. */
export type PlaylistPlacement = Pick<QueueEntry, "playlistTitle" | "playlistFolder" | "playlistNumber">;

/** Legt einen wartenden Queue-Eintrag an, mit dem, was die Link-Prüfung schon über das Medium weiß. */
export function enqueue(
  db: Db | Tx,
  url: string,
  media: Media,
  now: number,
  checked?: CheckedMedia & Partial<FileNaming> & Partial<PlaylistPlacement>,
) {
  return db
    .insert(queueEntries)
    .values({ url, ...checked, ...media, state: "waiting", queuedAt: now })
    .returning()
    .get();
}

export function listEntries(db: Db) {
  return db.select().from(queueEntries).orderBy(asc(queueEntries.queuedAt), asc(queueEntries.id)).all();
}

export function getEntry(db: Db, id: number) {
  return db.select().from(queueEntries).where(eq(queueEntries.id, id)).get();
}

/** Ein vorhandener Eintrag, gegen den ein neuer ein Duplikat wäre, oder `undefined`. */
export async function findDuplicateEntry(db: Db, downloadsDir: string, media: MediaIdentity) {
  if (!media.source || !media.mediaId) return undefined;
  const same = db
    .select()
    .from(queueEntries)
    .where(and(eq(queueEntries.source, media.source), eq(queueEntries.mediaId, media.mediaId)))
    .all();
  const candidates = await Promise.all(
    same.map(async (entry) => ({
      ...entry,
      fileExists: entry.state === "done" && (await findMediaFile(downloadsDir, entry)) !== undefined,
    })),
  );
  return findDuplicate(media, candidates);
}

/** Position „#n“ eines wartenden Eintrags, wie in der Liste ab 1 gezählt. */
export function queuePosition(db: Db, entry: Pick<QueueEntry, "id" | "queuedAt">) {
  const [{ ahead }] = db
    .select({ ahead: count() })
    .from(queueEntries)
    .where(
      and(
        eq(queueEntries.state, "waiting"),
        or(
          lt(queueEntries.queuedAt, entry.queuedAt),
          and(eq(queueEntries.queuedAt, entry.queuedAt), lte(queueEntries.id, entry.id)),
        ),
      ),
    )
    .all();
  return ahead;
}
