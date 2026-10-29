"use server";

import { refresh } from "next/cache";
import { parseMedia, type MediaType, type Resolution } from "@/lib/media";
import { texts } from "@/lib/texts";
import { CHECK_TIMEOUT_MS, checkLink } from "@/server/check/check";
import { getDb } from "@/server/db";
import type { EntryState } from "@/server/db/schema";
import { duplicateKey, type Duplicate } from "@/server/duplicate";
import { deleteDoneEntry } from "@/server/files/media-file";
import { BUNDLED_YTDLP, dataDirFromEnv, dataPaths } from "@/server/paths";
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

/** Rückgabe an das Formular. `url` füllt das Feld nach einer Meldung wieder, damit man den Link korrigieren kann. */
export type AddState = { url?: string; error?: string; notice?: string; duplicate?: DuplicateWarning };

/** Prüft den Link mit yt-dlp und reiht ein Einzelvideo ein. Ein Duplikat ergibt erst eine Warnung. */
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
  // Ticket 26: Playlist-Dialog mit `result.entries`. Ticket 29: Rate-Limit als Treffer der Quelle.
  if (result.kind === "playlist") return { url, notice: texts.addForm.playlistNotYet };
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

/** Löscht einen fertigen Eintrag samt Mediendatei. */
export async function deleteEntry(id: number) {
  if (!Number.isSafeInteger(id)) return;
  await deleteDoneEntry(getDb(), dataPaths(dataDirFromEnv()).downloads, id);
  refresh();
}
