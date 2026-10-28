"use server";

import { refresh } from "next/cache";
import { parseMedia } from "@/lib/media";
import { texts } from "@/lib/texts";
import { CHECK_TIMEOUT_MS, checkLink } from "@/server/check/check";
import { getDb } from "@/server/db";
import { deleteDoneEntry } from "@/server/files/media-file";
import { BUNDLED_YTDLP, dataDirFromEnv, dataPaths } from "@/server/paths";
import { enqueue } from "@/server/queue";

/** Rückgabe an das Formular. `url` füllt das Feld nach einer Meldung wieder, damit man den Link korrigieren kann. */
export type AddState = { url?: string; error?: string; notice?: string };

/** Prüft den Link mit yt-dlp und reiht ein Einzelvideo ein. */
export async function addEntry(_previous: AddState, formData: FormData): Promise<AddState> {
  const url = String(formData.get("url") ?? "").trim();
  const media = parseMedia({ mediaType: formData.get("mediaType"), resolution: formData.get("resolution") });
  if (!url || !media) return { url, error: texts.addForm.noMedia };

  const result = await checkLink({
    ytDlpPath: BUNDLED_YTDLP,
    url,
    cacheDir: dataPaths(dataDirFromEnv()).cache,
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  // Ticket 26: Playlist-Dialog mit `result.entries`. Ticket 29: Rate-Limit als Treffer der Quelle.
  if (result.kind === "playlist") return { url, notice: texts.addForm.playlistNotYet };
  if (result.kind === "none") return { url, error: texts.addForm.noMedia };

  enqueue(getDb(), url, media, Date.now(), result.media);
  refresh();
  return {};
}

/** Löscht einen fertigen Eintrag samt Mediendatei. */
export async function deleteEntry(id: number) {
  if (!Number.isSafeInteger(id)) return;
  await deleteDoneEntry(getDb(), dataPaths(dataDirFromEnv()).downloads, id);
  refresh();
}
