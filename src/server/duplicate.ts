import type { MediaType } from "@/lib/media";
import type { QueueEntry } from "./db/schema";

/** Dasselbe Medium heißt gleiche Quelle und gleiche Medien-ID, nicht gleicher Link. */
export type MediaIdentity = Pick<QueueEntry, "source" | "mediaId"> & { mediaType: MediaType };

export type DuplicateCandidate = Pick<
  QueueEntry,
  "id" | "source" | "mediaId" | "mediaType" | "resolution" | "state" | "queuedAt" | "finishedAt"
> & {
  /** Nur bei fertigen Einträgen von Belang: Liegt die Mediendatei noch unter `downloads/`? */
  fileExists: boolean;
};

export type Duplicate<T extends DuplicateCandidate = DuplicateCandidate> = {
  /** `downloaded`: fertig mit vorhandener Datei, `queued`: wartend oder laufend. */
  kind: "downloaded" | "queued";
  entry: T;
};

/**
 * Duplikat nach Glossar: dasselbe Medium mit derselben Medienart wie ein wartender oder
 * laufender Eintrag oder ein fertiger mit vorhandener Datei, egal in welcher Auflösung.
 * Gibt es mehrere, nennt die Warnung zuerst die neueste Datei, sonst den laufenden und
 * dann den ersten wartenden Eintrag.
 */
export function findDuplicate<T extends DuplicateCandidate>(media: MediaIdentity, entries: readonly T[]): Duplicate<T> | undefined {
  if (!media.source || !media.mediaId) return undefined;
  const same = entries.filter(
    (entry) => entry.source === media.source && entry.mediaId === media.mediaId && entry.mediaType === media.mediaType,
  );

  const downloaded = same
    .filter((entry) => entry.state === "done" && entry.fileExists)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0) || b.id - a.id)[0];
  if (downloaded) return { kind: "downloaded", entry: downloaded };

  const queued = same
    .filter((entry) => entry.state === "waiting" || entry.state === "running")
    .sort((a, b) => Number(b.state === "running") - Number(a.state === "running") || a.queuedAt - b.queuedAt || a.id - b.id)[0];
  if (queued) return { kind: "queued", entry: queued };

  return undefined;
}

/** Mit diesem Wert bestätigt „Add anyway“ genau das gewarnte Medium in genau dieser Medienart. */
export function duplicateKey({ source, mediaId, mediaType }: MediaIdentity) {
  return source && mediaId ? JSON.stringify([source, mediaId, mediaType]) : undefined;
}
