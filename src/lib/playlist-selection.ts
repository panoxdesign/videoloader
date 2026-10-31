import { texts } from "./texts";

/** Ein Eintrag der Playlist-Vorschau, soweit die Auswahl ihn braucht. */
export type PreviewItem = {
  /** Position in der Playlist laut Vorschau, ab 1. */
  number: number;
  /** Duplikat-Badge: „Already downloaded“ bzw. „Already in queue“. */
  duplicate?: "downloaded" | "queued";
};

/** Die angehakten Nummern. */
export type Selection = ReadonlySet<number>;

/** Alle sind angehakt, außer Duplikaten. Wer ein Duplikat anhakt, wählt damit „Add anyway“. */
export function initialSelection(items: readonly PreviewItem[]): Selection {
  return new Set(items.filter((item) => !item.duplicate).map((item) => item.number));
}

/** Zustand der Checkbox „Select all“. */
export function selectAllState(selection: Selection, items: readonly PreviewItem[]): "all" | "none" | "mixed" {
  const selected = items.filter((item) => selection.has(item.number)).length;
  if (selected === 0) return "none";
  return selected === items.length ? "all" : "mixed";
}

/** Klick auf „Select all“: Aus „alle“ wird „keine“, sonst werden alle angehakt, auch Duplikate. */
export function toggleAll(selection: Selection, items: readonly PreviewItem[]): Selection {
  return selectAllState(selection, items) === "all" ? new Set() : new Set(items.map((item) => item.number));
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
