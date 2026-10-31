import type { MediaType } from "@/lib/media";

/**
 * Obergrenze für den Namen ohne Endung, in Bytes UTF-8. ext4 erlaubt 255 Bytes, der Rest
 * bleibt für die Endung und die Zwischendateien von yt-dlp (`.f137.mp4.part` usw.).
 */
export const MAX_NAME_BYTES = 200;
const MAX_ID_BYTES = 100;
const MAX_SUFFIX = 10_000;

/** Die Endung der fertigen Mediendatei: `-t mp4` remuxt nach MP4, `-x` wandelt in MP3. */
export function extensionOf(mediaType: MediaType) {
  return mediaType === "audio" ? "mp3" : "mp4";
}

/**
 * Ordner und Nummer eines Playlist-Eintrags. Der Ordnername kommt schon bereinigt von yt-dlp,
 * ein zu langer wird wie der Titel auf `MAX_NAME_BYTES` gekürzt.
 */
export type PlaylistPlace = { folder: string; number: number };

/**
 * `<Titel> [<Medien-ID>]`, ab `n = 2` mit Suffix ` (n)`, ohne Endung. Titel und ID kommen schon
 * bereinigt von yt-dlp. Ein zu langer Titel wird gekürzt, nie der Suffix. `prefix` steht vor
 * dem Titel und zählt zur Länge, etwa die Nummer eines Playlist-Eintrags.
 */
export function baseName(title: string, mediaId: string, n = 1, prefix = "") {
  const id = `[${truncateUtf8(mediaId, MAX_ID_BYTES)}]`;
  const suffix = n > 1 ? ` (${n})` : "";
  const budget = MAX_NAME_BYTES - byteLength(prefix) - byteLength(id) - byteLength(suffix) - 1;
  const short = truncateUtf8(title, Math.max(0, budget));
  const head = short === title ? title : short.trimEnd();
  return `${prefix}${head ? `${head} ` : ""}${id}${suffix}`;
}

/**
 * Der erste freie Name mit Endung, wie ein Dateimanager: ohne Suffix, dann ` (2)`, ` (3)` usw.
 * Ein Playlist-Eintrag heißt `<Ordner>/<Nr> - <Titel> [<Medien-ID>]`, die Nummer mindestens dreistellig.
 */
export function chooseFileName(
  { title, mediaId, ext, playlist }: { title: string; mediaId: string; ext: string; playlist?: PlaylistPlace },
  isTaken: (fileName: string) => boolean,
) {
  const folder = playlist ? `${truncateUtf8(playlist.folder, MAX_NAME_BYTES).trimEnd()}/` : "";
  const prefix = playlist ? `${String(playlist.number).padStart(3, "0")} - ` : "";
  for (let n = 1; n < MAX_SUFFIX; n++) {
    const fileName = `${folder}${baseName(title, mediaId, n, prefix)}.${ext}`;
    if (!isTaken(fileName)) return fileName;
  }
  throw new Error(`no free file name for ${title} [${mediaId}]`);
}

/** Vergleichswert für belegte Namen. `downloads/` kann auf einem Dateisystem ohne Groß-/Kleinschreibung liegen. */
export function nameKey(fileName: string) {
  return fileName.normalize("NFC").toLowerCase();
}

/** Für `-o`: der Name wörtlich, mit `%` als `%%`. Nur die Endung setzt yt-dlp ein. */
export function outputTemplate(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return `${fileName.slice(0, dot).replaceAll("%", "%%")}.%(ext)s`;
}

function byteLength(text: string) {
  return Buffer.byteLength(text, "utf8");
}

/** Kürzt an Graphem-Grenzen, damit kein Emoji und kein Akzent halb stehen bleibt. */
function truncateUtf8(text: string, maxBytes: number) {
  if (byteLength(text) <= maxBytes) return text;
  let result = "";
  let used = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    used += byteLength(segment);
    if (used > maxBytes) break;
    result += segment;
  }
  return result;
}
