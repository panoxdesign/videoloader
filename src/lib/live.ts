import { texts } from "./texts";

/** Die Werte von `live_status` bei yt-dlp. */
const LIVE_STATUSES = ["is_live", "is_upcoming", "post_live", "was_live", "not_live"] as const;
export type LiveStatus = (typeof LIVE_STATUSES)[number];

/** Warum die App ein Medium gerade nicht laden kann. */
export type LiveBlock = "live" | "upcoming" | "justEnded";

/** `live_status` aus dem JSON von yt-dlp. Fehlt das Feld oder ist es unbekannt, `null`. */
export function parseLiveStatus(value: unknown): LiveStatus | null {
  return LIVE_STATUSES.find((status) => status === value) ?? null;
}

/**
 * Lässt sich das Medium jetzt laden? Ein laufender Stream würde aufgenommen, bis er endet, und bei
 * einem 24/7-Stream den einzigen Slot für immer belegen. Ein angekündigter hat noch nichts, ein
 * gerade beendeter wird bei YouTube noch verarbeitet. `was_live` ist eine normale Aufzeichnung.
 * Ohne `live_status` (der Extractor setzt es nicht) gilt das Medium als normal (Ticket 38).
 */
export function liveBlock(status: LiveStatus | null): LiveBlock | undefined {
  if (status === "is_live") return "live";
  if (status === "is_upcoming") return "upcoming";
  if (status === "post_live") return "justEnded";
  return undefined;
}

/** Meldung unter dem Formular, wenn „Add“ das Medium deshalb ablehnt. Sonst `undefined`. */
export function liveError(status: LiveStatus | null) {
  const block = liveBlock(status);
  if (!block) return undefined;
  return block === "justEnded" ? texts.addForm.justEnded : texts.addForm.live;
}

/**
 * Einen angekündigten YouTube-Stream prüft yt-dlp nicht als JSON mit `is_upcoming`, sondern bricht ab:
 * `ERROR: [youtube] 6rDSzyhW6vw: This live event will begin in 2 days.` (geprüft am 2026-11-02, als Gast).
 * In Flat-Einträgen steht dagegen `is_upcoming`. `error` ist die erste `ERROR:`-Zeile der Prüfung.
 */
export function isUpcomingError(error: string | undefined) {
  return !!error && /^ERROR: \[youtube\] [^:]+: This live event will begin in /.test(error);
}
