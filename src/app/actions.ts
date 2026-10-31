"use server";

import { refresh } from "next/cache";
import { parseMedia, type MediaType, type Resolution } from "@/lib/media";
import type { PreviewView } from "@/lib/playlist-selection";
import { texts } from "@/lib/texts";
import { CHECK_TIMEOUT_MS, checkLink } from "@/server/check/check";
import { getDb } from "@/server/db";
import type { EntryState } from "@/server/db/schema";
import { duplicateKey, type Duplicate } from "@/server/duplicate";
import { deleteDoneEntry } from "@/server/files/media-file";
import { BUNDLED_YTDLP, dataDirFromEnv, dataPaths } from "@/server/paths";
import { enqueuePlaylist, openPreview } from "@/server/playlist-preview";
import { enqueue, findDuplicateEntry, queuePosition } from "@/server/queue";

/** Die Duplikat-Warnung, mit dem vorhandenen Eintrag. */
export type DuplicateWarning = {
  /** Geht mit „Add anyway“ zurück und bestätigt genau dieses Medium in dieser Medienart. */
  key: string;
  kind: Duplicate["kind"];
  entryId: number;
  state: EntryState;
  title: string;
  mediaType: MediaType;
  resolution: Resolution | null;
  /** Nur bei wartenden Einträgen. */
  position?: number;
  /** Nur bei vorhandener Datei: wie lange die Fertigstellung her ist, in ms. */
  ageMs?: number;
};

/**
 * Rückgabe an das Formular. `url` füllt das Feld nach einer Meldung wieder, damit man den Link korrigieren kann.
 * `preview` öffnet den Playlist-Dialog, wenn ein nicht erkannter Link doch eine Playlist war (Variante B).
 */
export type AddState = { url?: string; error?: string; notice?: string; duplicate?: DuplicateWarning; preview?: PreviewView };

/**
 * Prüft den Link mit yt-dlp und reiht ein Einzelvideo ein. Ein Duplikat ergibt erst eine Warnung.
 * Ist der Link doch eine Playlist (Quelle unbekannt, etwa ein RSS-Feed), öffnet sich der Dialog
 * direkt, ohne abbrechbares Laden.
 */
export async function addEntry(_previous: AddState, formData: FormData): Promise<AddState> {
  const url = String(formData.get("url") ?? "").trim();
  const media = parseMedia({ mediaType: formData.get("mediaType"), resolution: formData.get("resolution") });
  if (!url || !media) return { url, error: texts.addForm.noMedia };

  const paths = dataPaths(dataDirFromEnv());
  const result = await checkLink({
    ytDlpPath: BUNDLED_YTDLP,
    url,
    cacheDir: paths.cache,
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  // Ticket 29: Rate-Limit als Treffer der Quelle.
  if (result.kind === "playlist") {
    return { url, preview: await openPreview(getDb(), paths.downloads, media, result, Date.now()) };
  }
  if (result.kind === "none") return { url, error: texts.addForm.noMedia };

  const db = getDb();
  const identity = { ...result.media, mediaType: media.mediaType };
  const key = duplicateKey(identity);
  if (key && formData.get("addAnyway") !== key) {
    const duplicate = await findDuplicateEntry(db, paths.downloads, identity);
    if (duplicate) {
      const { kind, entry } = duplicate;
      return {
        url,
        duplicate: {
          key,
          kind,
          entryId: entry.id,
          state: entry.state,
          title: entry.title ?? entry.url,
          mediaType: entry.mediaType,
          resolution: entry.resolution,
          position: entry.state === "waiting" ? queuePosition(db, entry) : undefined,
          ageMs: kind === "downloaded" && entry.finishedAt !== null ? Date.now() - entry.finishedAt : undefined,
        },
      };
    }
  }

  enqueue(db, url, media, Date.now(), result.media);
  refresh();
  return {};
}

/**
 * „Add x to queue“ im Playlist-Dialog. Der Browser schickt nur den Schlüssel der Vorschau und
 * die angehakten Nummern. `error`, wenn die Vorschau abgelaufen oder schon eingereiht ist.
 */
export async function addPlaylistEntries(key: string, numbers: number[]): Promise<{ error?: string }> {
  if (typeof key !== "string" || !Array.isArray(numbers)) return { error: texts.playlist.expired };
  const valid = numbers.filter((n) => Number.isSafeInteger(n));
  const result = enqueuePlaylist(getDb(), key, valid, Date.now());
  if (result.kind === "expired") return { error: texts.playlist.expired };
  refresh();
  return {};
}

/** Löscht einen fertigen Eintrag samt Mediendatei. */
export async function deleteEntry(id: number) {
  if (!Number.isSafeInteger(id)) return;
  await deleteDoneEntry(getDb(), dataPaths(dataDirFromEnv()).downloads, id);
  refresh();
}
