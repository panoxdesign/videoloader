import { randomUUID } from "node:crypto";
import { CHECK_TIMEOUT_MS, checkLink } from "./check/check";
import { eq, lte } from "drizzle-orm";
import type { Media } from "@/lib/media";
import type { PreviewView } from "@/lib/playlist-selection";
import type { CheckResult, PlaylistEntry } from "./check/parse-check";
import type { Db, Tx } from "./db/open";
import { playlistPreviews } from "./db/schema";
import { playlistFolder } from "./files/file-name";
import { startIntervalFromEnv } from "./config/config";
import { dataPaths } from "./paths";
import { enqueue, findDuplicateEntry } from "./queue";

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

/** Legt die Vorschau ab und markiert Duplikate je Eintrag. Einträge ohne Medien-ID werden nie markiert. */
export async function openPreview(
  db: Db,
  downloadsDir: string,
  media: Media,
  playlist: Extract<CheckResult, { kind: "playlist" }>,
  now: number,
  startIntervalSeconds = startIntervalFromEnv(process.env),
): Promise<PreviewView> {
  const { key, preview } = storePreview(db, media, playlist, now);
  const items = await Promise.all(
    preview.entries.map(async ({ number, url, title, duration, thumbnailUrl, source, mediaId }) => {
      const duplicate = await findDuplicateEntry(db, downloadsDir, { source, mediaId, mediaType: media.mediaType });
      return { number, url, title, duration, thumbnailUrl, ...(duplicate && { duplicate: duplicate.kind }) };
    }),
  );
  return { key, title: preview.title, media, startIntervalSeconds, items };
}

/**
 * „Add x to queue“: löst den Schlüssel ein und reiht die angehakten Nummern in Playlist-Reihenfolge
 * ein, in einer Transaktion. Titel, IDs und Ordner kommen aus dem Zwischenspeicher, nie aus dem
 * Browser. Unbekannte Nummern zählen nicht.
 */
export function enqueuePlaylist(db: Db, key: string, numbers: readonly number[], now: number) {
  return db.transaction((tx) => {
    const preview = takePreview(tx, key, now);
    if (!preview) return { kind: "expired" as const };
    const ticked = new Set(numbers);
    const chosen = preview.entries.filter((entry) => ticked.has(entry.number));
    for (const { number, url, ...checked } of chosen) {
      enqueue(tx, url, preview.media, now, {
        ...checked,
        playlistTitle: preview.title,
        playlistFolder: preview.folder,
        playlistNumber: number,
      });
    }
    return { kind: "added" as const, count: chosen.length };
  });
}

export type LoadResult =
  | { kind: "preview"; view: PreviewView }
  /** Der Browser hat abgebrochen („Cancel“ oder Seite verlassen). */
  | { kind: "cancelled" }
  /** „Playlist too large to preview (timed out)“, ohne Teil-Vorschau. */
  | { kind: "timedOut" }
  /** Keine Playlist am Link. `error` ist die erste `ERROR:`-Zeile von yt-dlp. */
  | { kind: "none"; error?: string };

/**
 * Lädt die Vorschau eines Playlist-Links für den Route Handler. `signal` feuert, wenn der Browser
 * abbricht. Dann oder nach `timeoutMs` wird yt-dlp beendet.
 */
export async function loadPreview({
  db,
  ytDlpPath,
  dataDir,
  url,
  media,
  signal,
  timeoutMs = CHECK_TIMEOUT_MS,
  now,
}: {
  db: Db;
  ytDlpPath: string;
  dataDir: string;
  url: string;
  media: Media;
  signal: AbortSignal;
  timeoutMs?: number;
  now: number;
}): Promise<LoadResult> {
  const paths = dataPaths(dataDir);
  const timeout = AbortSignal.timeout(timeoutMs);
  const result = await checkLink({ ytDlpPath, url, cacheDir: paths.cache, signal: AbortSignal.any([signal, timeout]) });
  if (signal.aborted) return { kind: "cancelled" };
  if (timeout.aborted) return { kind: "timedOut" };
  if (result.kind === "none" && result.error) return { kind: "none", error: result.error };
  if (result.kind !== "playlist") return { kind: "none" };
  return { kind: "preview", view: await openPreview(db, paths.downloads, media, result, now) };
}
