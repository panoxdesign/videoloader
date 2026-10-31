import { randomUUID } from "node:crypto";
import { eq, lte } from "drizzle-orm";
import type { Media } from "@/lib/media";
import type { CheckResult, PlaylistEntry } from "./check/parse-check";
import type { Db, Tx } from "./db/open";
import { playlistPreviews } from "./db/schema";
import { playlistFolder } from "./files/file-name";

/** So lange lässt sich eine Vorschau einreihen. */
export const PREVIEW_TTL_MS = 15 * 60_000;

/** Was „Add x to queue“ braucht, festgehalten beim Laden der Vorschau. */
export type PlaylistPreview = {
  /** Wie im Kopf des Dialogs angezeigt, nicht der spätere Stand des Formulars. */
  media: Media;
  title: string | null;
  /** Ordner unter `downloads/`, bereinigt. */
  folder: string;
  /** `number` ist die Position laut Vorschau, ab 1. */
  entries: (PlaylistEntry & { number: number })[];
};

/** Legt die Vorschau ab und gibt den Schlüssel für den Browser zurück. Räumt dabei abgelaufene weg. */
export function storePreview(
  db: Db,
  media: Media,
  playlist: Extract<CheckResult, { kind: "playlist" }>,
  now: number,
) {
  const preview: PlaylistPreview = {
    media,
    title: playlist.title,
    folder: playlistFolder(playlist),
    entries: playlist.entries.map((entry, i) => ({ number: i + 1, ...entry })),
  };
  const key = randomUUID();
  db.delete(playlistPreviews).where(lte(playlistPreviews.expiresAt, now)).run();
  db.insert(playlistPreviews).values({ key, expiresAt: now + PREVIEW_TTL_MS, data: preview }).run();
  return { key, preview };
}

/**
 * Löst den Schlüssel ein: die abgelegte Vorschau oder `undefined`, wenn er unbekannt oder
 * abgelaufen ist. Die Zeile ist danach weg. In der Transaktion, die einreiht, damit ein
 * Doppelklick nicht zweimal einreiht.
 */
export function takePreview(db: Db | Tx, key: string, now: number) {
  const row = db.delete(playlistPreviews).where(eq(playlistPreviews.key, key)).returning().get();
  return row && row.expiresAt > now ? (row.data as PlaylistPreview) : undefined;
}
