import { and, asc, count, eq, inArray, isNull, lt, lte, max, or } from "drizzle-orm";
import { statesAllowing } from "@/lib/entry-state";
import type { Media } from "@/lib/media";
import type { CheckedMedia, FileNaming } from "./check/parse-check";
import type { Db, Tx } from "./db/open";
import { queueEntries, type QueueEntry } from "./db/schema";
import { findDuplicate, type MediaIdentity } from "./duplicate";
import { findMediaFile } from "./files/media-file";

/** Was ein Eintrag aus einer Playlist zusätzlich trägt. */
export type PlaylistPlacement = Pick<QueueEntry, "playlistTitle" | "playlistFolder" | "playlistNumber">;

/** Was ein Queue-Eintrag aus der Prüfung übernimmt. `liveStatus` zählt nur beim Hinzufügen. */
export type CheckedForQueue = Omit<CheckedMedia, "liveStatus"> & Partial<FileNaming> & Partial<PlaylistPlacement>;

/** Legt einen wartenden Queue-Eintrag an, mit dem, was die Link-Prüfung schon über das Medium weiß. */
export function enqueue(db: Db | Tx, url: string, media: Media, now: number, checked?: CheckedForQueue) {
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

/** Fortschritt und Laufzeitdaten eines Laufs, geleert für den nächsten. */
const NO_RUN = {
  phase: null,
  downloadedBytes: null,
  totalBytes: null,
  totalBytesEstimate: null,
  fragmentIndex: null,
  fragmentCount: null,
  speed: null,
  eta: null,
  postprocessor: null,
  pgid: null,
  cancelRequest: null,
} satisfies Partial<QueueEntry>;

/**
 * „Retry“ für einen fehlgeschlagenen oder abgebrochenen Eintrag: wieder wartend, hinter allen
 * anderen wartenden, mit derselben Medienart und Auflösung. Fehler, Rohlog, Fortschritt und die
 * Uhr der Aufbewahrungsfrist werden geleert. Den reservierten Namen behält er, der Start prüft,
 * ob er noch frei ist. Keine Duplikat-Prüfung. `false`, wenn der Eintrag nicht (mehr) passt.
 */
export function retryEntry(db: Db, id: number, now: number) {
  return db.transaction((tx) => {
    // Einträge einer Playlist teilen sich einen Ordnungswert, und bei Gleichstand entscheidet die
    // ID. Deshalb nicht einfach `now`, sondern mindestens eins hinter dem letzten wartenden.
    const [{ last }] = tx
      .select({ last: max(queueEntries.queuedAt) })
      .from(queueEntries)
      .where(eq(queueEntries.state, "waiting"))
      .all();
    const updated = tx
      .update(queueEntries)
      .set({
        state: "waiting",
        queuedAt: Math.max(now, (last ?? -Infinity) + 1),
        finishedAt: null,
        errorCategory: null,
        rawLog: null,
        ...NO_RUN,
      })
      .where(and(eq(queueEntries.id, id), inArray(queueEntries.state, statesAllowing("retry"))))
      .run();
    return updated.changes > 0;
  });
}

/**
 * „Remove“ ohne Rückfrage, in einer Transaktion: Wartende, fehlgeschlagene und abgebrochene
 * Einträge verschwinden sofort. Läuft der Eintrag inzwischen, bekommt er das Abbruch-Flag
 * „remove“, und der Worker löscht ihn nach dem Abbruch, ohne Umweg über abgebrochen.
 * `false`, wenn der Eintrag nicht (mehr) passt.
 */
export function removeEntry(db: Db, id: number) {
  return db.transaction((tx) => {
    const removed = tx
      .delete(queueEntries)
      .where(
        and(
          eq(queueEntries.id, id),
          inArray(
            queueEntries.state,
            statesAllowing("remove").filter((state) => state !== "running"),
          ),
        ),
      )
      .run();
    if (removed.changes > 0) return true;
    const flagged = tx
      .update(queueEntries)
      .set({ cancelRequest: "remove" })
      .where(and(eq(queueEntries.id, id), eq(queueEntries.state, "running")))
      .run();
    return flagged.changes > 0;
  });
}

/**
 * „Cancel“: setzt das Abbruch-Flag eines laufenden Eintrags. Den Prozess beendet der Worker im
 * nächsten Tick. Ein schon angefordertes Remove bleibt Remove. `false`, wenn nichts zu tun war.
 */
export function cancelEntry(db: Db, id: number) {
  const flagged = db
    .update(queueEntries)
    .set({ cancelRequest: "cancel" })
    .where(
      and(
        eq(queueEntries.id, id),
        inArray(queueEntries.state, statesAllowing("cancel")),
        isNull(queueEntries.cancelRequest),
      ),
    )
    .run();
  return flagged.changes > 0;
}
