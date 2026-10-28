import type { EntryState, QueueEntry } from "@/server/db/schema";

/** Was die Liste im Browser von einem Queue-Eintrag braucht. Zeitstempel formatiert der Browser. */
export type EntryView = Pick<
  QueueEntry,
  | "id"
  | "url"
  | "title"
  | "thumbnailUrl"
  | "mediaType"
  | "resolution"
  | "state"
  | "phase"
  | "queuedAt"
  | "finishedAt"
  | "downloadedBytes"
  | "totalBytes"
  | "totalBytesEstimate"
  | "errorCategory"
  | "fileSize"
> & {
  /** Fertig, aber die Mediendatei fehlt auf der Platte. Kein eigener Zustand. */
  fileMissing: boolean;
};

export const FILTERS = ["all", "active", "done", "failedCancelled"] as const;
export type Filter = (typeof FILTERS)[number];

const FILTER_OF_STATE: Record<EntryState, Exclude<Filter, "all">> = {
  waiting: "active",
  running: "active",
  done: "done",
  failed: "failedCancelled",
  cancelled: "failedCancelled",
};

/** Reihenfolge der Gruppen in der Liste. */
const GROUP: Record<EntryState, number> = { waiting: 0, running: 0, failed: 1, cancelled: 1, done: 2 };

export function matchesFilter(state: EntryState, filter: Filter) {
  return filter === "all" || FILTER_OF_STATE[state] === filter;
}

export function countByFilter(entries: readonly Pick<EntryView, "state">[]): Record<Filter, number> {
  const counts = { all: entries.length, active: 0, done: 0, failedCancelled: 0 };
  for (const { state } of entries) counts[FILTER_OF_STATE[state]]++;
  return counts;
}

/**
 * Laufende und wartende nach Position, dann fehlgeschlagene und abgebrochene,
 * dann fertige. Innerhalb der beiden letzten Gruppen die neuesten zuerst.
 */
export function sortForList<T extends EntryView>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const group = GROUP[a.state] - GROUP[b.state];
    if (group !== 0) return group;
    if (GROUP[a.state] === 0) return a.queuedAt - b.queuedAt || a.id - b.id;
    return (b.finishedAt ?? 0) - (a.finishedAt ?? 0) || b.id - a.id;
  });
}

/** Position „#n" der wartenden Einträge, gezählt in Queue-Reihenfolge ab 1. */
export function queuePositions(entries: readonly EntryView[]) {
  const waiting = entries
    .filter((entry) => entry.state === "waiting")
    .sort((a, b) => a.queuedAt - b.queuedAt || a.id - b.id);
  return new Map(waiting.map((entry, index) => [entry.id, index + 1]));
}

export function progressFraction({
  downloadedBytes,
  totalBytes,
  totalBytesEstimate,
}: Pick<EntryView, "downloadedBytes" | "totalBytes" | "totalBytesEstimate">) {
  const total = totalBytes ?? totalBytesEstimate;
  if (!total || downloadedBytes === null) return undefined;
  return Math.min(1, downloadedBytes / total);
}

const SIZE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/** Dezimale Einheiten wie im Design, z. B. „286 MB“ und „1.9 GB“. Unter 10 mit einer Nachkommastelle. */
export function formatSize(bytes: number, locale?: string) {
  let value = bytes;
  let unit = 0;
  while (unit < SIZE_UNITS.length - 1 && Math.round(value * 10) / 10 >= 1000) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: SIZE_UNITS[unit],
    maximumFractionDigits: unit > 0 && value < 10 ? 1 : 0,
  }).format(value);
}
