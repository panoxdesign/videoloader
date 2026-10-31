/** Was die Prüfung über ein Medium weiß. Je nach Quelle fehlen Felder, keins ist Pflicht. */
export type CheckedMedia = {
  /** Quelle, der `extractor_key` von yt-dlp. */
  source: string | null;
  mediaId: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  /** In Sekunden, kann Nachkommastellen haben. */
  duration: number | null;
};

/** Titel und Medien-ID, wie yt-dlp sie für Dateinamen bereinigt (`%(…)S` mit `--windows-filenames`). */
export type FileNaming = { fileTitle: string | null; fileMediaId: string | null };

/** Für den Queue-Eintrag gilt das `url`-Feld des Flat-Eintrags. */
export type PlaylistEntry = CheckedMedia & FileNaming & { url: string };

/** Kennung der `--print`-Zeile je Medium, sie steht vor dem JSON. */
export const FILE_LINE = "FILE";
/** Kennung der `--print playlist:`-Zeile mit dem Playlist-Namen, bereinigt wie ein Dateiname. */
export const PLAYLIST_LINE = "PLAYLIST";

export type CheckResult =
  | { kind: "video"; media: CheckedMedia & FileNaming }
  /** `fileTitle` ist der Playlist-Name für den Ordner, wie yt-dlp ihn bereinigt. */
  | { kind: "playlist"; title: string | null; fileTitle: string | null; entries: PlaylistEntry[] }
  /** `error` ist die erste `ERROR:`-Zeile von yt-dlp, `timedOut` heißt abgebrochen. */
  | { kind: "none"; error?: string; timedOut?: true };

type Raw = Record<string, unknown>;

/**
 * Übersetzt die Ausgabe der Prüfung in ein Prüfergebnis: zuerst die `FILE`-Zeilen aus
 * `--print`, eine je Medium in Playlist-Reihenfolge, bei Playlists dann die `PLAYLIST`-Zeile,
 * als letzte Zeile das JSON von `-J --flat-playlist`.
 */
export function parseCheck(stdout: string): CheckResult {
  const lines = stdout.split("\n").filter((line) => line !== "");
  let raw: unknown;
  try {
    raw = JSON.parse(lines.at(-1) ?? "");
  } catch {
    return { kind: "none" };
  }
  if (!isObject(raw)) return { kind: "none" };

  const fileLines = printed(lines, FILE_LINE).map(([fileMediaId, fileTitle]): FileNaming => ({
    fileTitle: string(fileTitle),
    fileMediaId: string(fileMediaId),
  }));
  const noNaming: FileNaming = { fileTitle: null, fileMediaId: null };

  if (raw._type === "video") {
    return { kind: "video", media: { ...media(raw, string(raw.extractor_key)), ...(fileLines[0] ?? noNaming) } };
  }

  if (raw._type === "playlist" || raw._type === "multi_video") {
    const source = string(raw.extractor_key);
    // Die `FILE`-Zeilen gehören der Reihe nach zu den Einträgen, deshalb erst zuordnen, dann aussortieren.
    const entries = (Array.isArray(raw.entries) ? raw.entries : []).flatMap((entry, i) => {
      const url = isObject(entry) ? string(entry.url) : null;
      if (!isObject(entry) || !url) return [];
      // Flat-Einträge nennen ihre Quelle `ie_key`, beim generic-Extractor fehlt sie.
      return [{ url, ...media(entry, string(entry.ie_key) ?? source), ...(fileLines[i] ?? noNaming) }];
    });
    if (entries.length === 0) return { kind: "none" };
    const [fileTitle] = printed(lines, PLAYLIST_LINE)[0] ?? [];
    return { kind: "playlist", title: string(raw.title), fileTitle: string(fileTitle), entries };
  }

  return { kind: "none" };
}

/** Die Felder der `--print`-Zeilen mit dieser Kennung, ohne die Kennung. */
function printed(lines: string[], tag: string) {
  return lines.filter((line) => line.startsWith(`${tag}\t`)).map((line) => line.split("\t").slice(1));
}

function media(raw: Raw, source: string | null): CheckedMedia {
  return {
    source,
    mediaId: string(raw.id),
    title: string(raw.title),
    thumbnailUrl: thumbnail(raw),
    duration: typeof raw.duration === "number" && raw.duration > 0 ? raw.duration : null,
  };
}

/** `thumbnail` oder sonst das letzte, laut yt-dlp beste aus `thumbnails`. Nur http(s), der Browser lädt es direkt. */
function thumbnail(raw: Raw) {
  const list = Array.isArray(raw.thumbnails) ? raw.thumbnails : [];
  const last = list.at(-1);
  const url = string(raw.thumbnail) ?? (isObject(last) ? string(last.url) : null);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown) {
  return typeof value === "string" && value !== "" ? value : null;
}
