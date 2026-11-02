import type { LiveBlock } from "./live";
import type { Media } from "./media";
import { texts } from "./texts";

/** Ein Eintrag der Playlist-Vorschau, soweit die Auswahl ihn braucht. */
export type PreviewItem = {
  /** Nummer in der Playlist laut Vorschau, ab 1. */
  number: number;
  /** Duplikat-Badge: „Already downloaded“ bzw. „Already in queue“. */
  duplicate?: "downloaded" | "queued";
  /** Laufender, angekündigter oder gerade beendeter Stream: mit Badge, nicht auswählbar (Ticket 38). */
  live?: LiveBlock;
};

/** Was der Playlist-Dialog im Browser bekommt. Titel und IDs für Dateinamen bleiben auf dem Server. */
export type PreviewView = {
  /** Schlüssel des Zwischenspeichers, geht mit den angehakten Nummern zurück. */
  key: string;
  title: string | null;
  media: Media;
  /** Für den Hinweis zur Mindestdauer. Kommt mit der Vorschau, weil die Seite beim Build vorgerendert wird. */
  startIntervalSeconds: number;
  items: (PreviewItem & { url: string; title: string | null; duration: number | null; thumbnailUrl: string | null })[];
};

/** Die angehakten Nummern. */
export type Selection = ReadonlySet<number>;

/** Streams lassen sich nicht anhaken, weder einzeln noch über „Select all“. Duplikate schon. */
export function isSelectable(item: PreviewItem) {
  return !item.live;
}

/** Alle sind angehakt, außer Duplikaten und Streams. Wer ein Duplikat anhakt, wählt damit „Add anyway“. */
export function initialSelection(items: readonly PreviewItem[]): Selection {
  return new Set(items.filter((item) => isSelectable(item) && !item.duplicate).map((item) => item.number));
}

/** Zustand der Checkbox „Select all“. Gezählt werden nur auswählbare Einträge. */
export function selectAllState(selection: Selection, items: readonly PreviewItem[]): "all" | "none" | "mixed" {
  const selectable = items.filter(isSelectable);
  const selected = selectable.filter((item) => selection.has(item.number)).length;
  if (selected === 0) return "none";
  return selected === selectable.length ? "all" : "mixed";
}

/** Klick auf „Select all“: Aus „alle“ wird „keine“, sonst werden alle auswählbaren angehakt, auch Duplikate. */
export function toggleAll(selection: Selection, items: readonly PreviewItem[]): Selection {
  return selectAllState(selection, items) === "all"
    ? new Set()
    : new Set(items.filter(isSelectable).map((item) => item.number));
}

/** Klick auf die Checkbox eines Eintrags. */
export function toggleItem(selection: Selection, number: number): Selection {
  const next = new Set(selection);
  if (!next.delete(number)) next.add(number);
  return next;
}

/** Ab so vielen ausgewählten Einträgen zeigt der Dialog die Mindestdauer. */
export const LARGE_SELECTION = 100;

/**
 * Hinweis auf die Mindestdauer (Anzahl × Startabstand) bei großer Auswahl. Abgerundet,
 * weil der Text „at least“ sagt: unter einer Stunde in Minuten, sonst in Stunden.
 */
export function largeSelectionHint(count: number, startIntervalSeconds: number) {
  if (count < LARGE_SELECTION || startIntervalSeconds <= 0) return undefined;
  const minutes = Math.floor((count * startIntervalSeconds) / 60);
  return texts.playlist.largeSelection(minutes < 60 ? `~${minutes} min` : `~${Math.floor(minutes / 60)} h`);
}
