// Ohne Import aus dem Schema, damit der Browser kein Drizzle mitlädt.
export const MEDIA_TYPES = ["video", "audio"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** Maximale Auflösung bei Video, „best“ ohne Grenze. Bei Audio leer. */
export const RESOLUTIONS = ["best", "1080", "720", "480"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** Medienart und Auflösung eines Queue-Eintrags. Audio hat keine Auflösung. */
export type Media = { mediaType: "video"; resolution: Resolution } | { mediaType: "audio"; resolution: null };

/** Aus dem Formular oder einer DB-Zeile. Bei Audio zählt eine mitgeschickte Auflösung nicht. */
export function parseMedia({ mediaType, resolution }: { mediaType: unknown; resolution: unknown }): Media | undefined {
  if (mediaType === "audio") return { mediaType, resolution: null };
  if (mediaType === "video" && RESOLUTIONS.includes(resolution as Resolution)) {
    return { mediaType, resolution: resolution as Resolution };
  }
  return undefined;
}
