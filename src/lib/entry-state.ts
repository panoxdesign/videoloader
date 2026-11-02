// Nur der Typ: Die Funktion läuft auch im Browser, `schema.ts` zöge Drizzle ins Bundle.
import type { CancelRequest, EntryState } from "@/server/db/schema";

/**
 * Auslöser aus Spec „Zustandsmodell des Queue-Eintrags“. Rate-Limit (Ticket 29) kommt später dazu.
 */
export type EntryEvent = "start" | "succeed" | "fail" | "cancel" | "retry" | "remove";

/** Ein entfernter Eintrag ist kein Zustand, seine Zeile ist weg. */
export type EntryTarget = EntryState | "removed";

const TRANSITIONS: Record<EntryEvent, Partial<Record<EntryState, EntryTarget>>> = {
  start: { waiting: "running" },
  succeed: { running: "done" },
  fail: { running: "failed" },
  // Nur ein laufender Eintrag kann abgebrochen werden, ein wartender wird entfernt.
  cancel: { running: "cancelled" },
  // Für fertige Einträge gibt es kein Retry.
  retry: { failed: "waiting", cancelled: "waiting" },
  // Einen laufenden Eintrag bricht Remove erst ab und löscht ihn dann, ohne Umweg über abgebrochen.
  remove: { waiting: "removed", running: "removed", failed: "removed", cancelled: "removed" },
};

/** Der Zustand nach dem Auslöser, `undefined`, wenn der Übergang nicht erlaubt ist. */
export function transition(from: EntryState, event: EntryEvent): EntryTarget | undefined {
  return TRANSITIONS[event][from];
}

/** Die Zustände, aus denen der Auslöser wirkt, etwa für `where state in (…)`. */
export function statesAllowing(event: EntryEvent): EntryState[] {
  return Object.keys(TRANSITIONS[event]) as EntryState[];
}

/**
 * Wie ein Lauf endet. Exit 0 mit `DONE` gewinnt gegen ein Abbruch-Flag, das zu spät kam. Sonst
 * entscheidet das Flag: „Remove“ löscht den Eintrag, „Cancel“ bricht ab, ohne Flag schlägt er fehl.
 */
export function runOutcome({
  succeeded,
  cancelRequest,
}: {
  succeeded: boolean;
  cancelRequest: CancelRequest | null;
}): EntryTarget {
  if (succeeded) return "done";
  if (cancelRequest === "remove") return "removed";
  if (cancelRequest === "cancel") return "cancelled";
  return "failed";
}
