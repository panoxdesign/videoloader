import { extname } from "node:path";

/** Erstes bis letztes Byte, beide eingeschlossen. */
export type ByteRange = { start: number; end: number };

/**
 * Liest einen `Range`-Header. Fehlt er oder ist er nicht lesbar, geht die ganze
 * Datei raus. Mehrere Bereiche bedient der Handler nicht, das erlaubt RFC 9110.
 */
export function parseRange(header: string | null, size: number): ByteRange | "full" | "unsatisfiable" {
  const match = header?.match(/^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/);
  if (!match) return "full";
  const [, first, last] = match;
  if (first === "" && last === "") return "full";

  if (first === "") {
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(first);
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}

/**
 * `attachment` mit dem Dateinamen der Mediendatei: `filename*` trägt ihn UTF-8-kodiert
 * (RFC 6266/8187), `filename` ist der ASCII-Ersatz für alte Clients.
 */
export function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

export function contentTypeOf(fileName: string) {
  return CONTENT_TYPES[extname(fileName).toLowerCase()] ?? "application/octet-stream";
}
