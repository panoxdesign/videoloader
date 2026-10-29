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
export type PlaylistEntry = CheckedMedia & { url: string };

/** Kennung der `--print`-Zeile, die vor dem JSON steht. */
export const FILE_LINE = "FILE";

export type CheckResult =
  | { kind: "video"; media: CheckedMedia & FileNaming }
  | { kind: "playlist"; title: string | null; entries: PlaylistEntry[] }
  /** `error` ist die erste `ERROR:`-Zeile von yt-dlp, `timedOut` heißt abgebrochen. */
  | { kind: "none"; error?: string; timedOut?: true };

type Raw = Record<string, unknown>;

/**
 * Übersetzt die Ausgabe der Prüfung in ein Prüfergebnis: zuerst die `FILE`-Zeilen aus
 * `--print`, als letzte Zeile das JSON von `-J --flat-playlist`.
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

  if (raw._type === "video") {
    // Ticket 26: Bei Playlists gibt es eine Zeile je Flat-Eintrag, die nutzt erst der Vorschau-Dialog.
    const [, fileMediaId, fileTitle] = lines.find((line) => line.startsWith(`${FILE_LINE}\t`))?.split("\t") ?? [];
    return {
      kind: "video",
      media: { ...media(raw, string(raw.extractor_key)), fileTitle: string(fileTitle), fileMediaId: string(fileMediaId) },
    };
  }

  if (raw._type === "playlist" || raw._type === "multi_video") {
    const source = string(raw.extractor_key);
    const entries = (Array.isArray(raw.entries) ? raw.entries : []).filter(isObject).flatMap((entry) => {
      const url = string(entry.url);
      // Flat-Einträge nennen ihre Quelle `ie_key`, beim generic-Extractor fehlt sie.
      return url ? [{ url, ...media(entry, string(entry.ie_key) ?? source) }] : [];
    });
    if (entries.length === 0) return { kind: "none" };
    return { kind: "playlist", title: string(raw.title), entries };
  }

  return { kind: "none" };
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
