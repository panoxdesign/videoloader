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

/** Kennung der `--print`-Zeile je Medium mit `url` als JSON, Medien-ID und Titel. Sie steht vor dem JSON. */
export const FILE_LINE = "FILE";
/** Kennung der `--print playlist:`-Zeile mit Playlist-ID und -Namen, bereinigt wie ein Dateiname. */
export const PLAYLIST_LINE = "PLAYLIST";

export type CheckResult =
  | { kind: "video"; media: CheckedMedia & FileNaming }
  /** `fileTitle` und `fileId` sind Playlist-Name und -ID für den Ordner, wie yt-dlp sie bereinigt. */
  | { kind: "playlist"; title: string | null; fileTitle: string | null; fileId: string | null; entries: PlaylistEntry[] }
  /** `error` ist die erste `ERROR:`-Zeile von yt-dlp, `timedOut` heißt abgebrochen. */
  | { kind: "none"; error?: string; timedOut?: true };

type Raw = Record<string, unknown>;

/**
 * Übersetzt die Ausgabe der Prüfung in ein Prüfergebnis: zuerst die `FILE`-Zeilen aus
 * `--print`, eine je Medium, bei Playlists dann die `PLAYLIST`-Zeile, als letzte Zeile das
 * JSON von `-J --flat-playlist`.
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

  const fileLines = printed(lines, FILE_LINE).map(([url, fileMediaId, fileTitle]) => ({
    url: jsonString(url),
    naming: { fileTitle: string(fileTitle), fileMediaId: string(fileMediaId) } satisfies FileNaming,
  }));
  const noNaming: FileNaming = { fileTitle: null, fileMediaId: null };

  if (raw._type === "video") {
    return { kind: "video", media: { ...media(raw, string(raw.extractor_key)), ...(fileLines[0]?.naming ?? noNaming) } };
  }

  if (raw._type === "playlist" || raw._type === "multi_video") {
    const source = string(raw.extractor_key);
    const entries = (Array.isArray(raw.entries) ? raw.entries : []).flatMap((entry) => {
      const url = isObject(entry) ? string(entry.url) : null;
      if (!isObject(entry) || !url) return [];
      // Zuordnung über die `url`, nicht über die Reihenfolge: Fehlt eine Zeile oder ist eine zu viel,
      // bekäme sonst jeder folgende Eintrag den Dateinamen eines anderen Mediums. Gleiche Links
      // nehmen ihre Zeilen der Reihe nach. Ohne Zeile prüft der Worker den Eintrag vor dem Start.
      const line = fileLines.findIndex((fileLine) => fileLine.url === url);
      const naming = line === -1 ? noNaming : fileLines.splice(line, 1)[0].naming;
      // Flat-Einträge nennen ihre Quelle `ie_key`, beim generic-Extractor fehlt sie.
      return [{ url, ...media(entry, string(entry.ie_key) ?? source), ...naming }];
    });
    if (entries.length === 0) return { kind: "none" };
    const [fileId, fileTitle] = printed(lines, PLAYLIST_LINE)[0] ?? [];
    return { kind: "playlist", title: string(raw.title), fileTitle: string(fileTitle), fileId: string(fileId), entries };
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

/** Ein Feld aus `%(…)j`, sonst `null`. */
function jsonString(value: string | undefined) {
  try {
    return string(JSON.parse(value ?? ""));
  } catch {
    return null;
  }
}

function string(value: unknown) {
  return typeof value === "string" && value !== "" ? value : null;
}
