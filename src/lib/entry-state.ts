// Nur der Typ: Die Funktion läuft auch im Browser, `schema.ts` zöge Drizzle ins Bundle.
import type { EntryState } from "@/server/db/schema";

/**
 * Auslöser aus Spec „Zustandsmodell des Queue-Eintrags“. Abbruch (Ticket 22) und Rate-Limit
 * (Ticket 29) kommen später dazu.
 */
export type EntryEvent = "start" | "succeed" | "fail" | "retry" | "remove";

/** Ein entfernter Eintrag ist kein Zustand, seine Zeile ist weg. */
export type EntryTarget = EntryState | "removed";

const TRANSITIONS: Record<EntryEvent, Partial<Record<EntryState, EntryTarget>>> = {
  start: { waiting: "running" },
  succeed: { running: "done" },
  fail: { running: "failed" },
  // Für fertige Einträge gibt es kein Retry.
  retry: { failed: "waiting", cancelled: "waiting" },
  // Laufende Einträge entfernt erst Ticket 22, über den Abbruch.
  remove: { waiting: "removed", failed: "removed", cancelled: "removed" },
};

/** Der Zustand nach dem Auslöser, `undefined`, wenn der Übergang nicht erlaubt ist. */
export function transition(from: EntryState, event: EntryEvent): EntryTarget | undefined {
  return TRANSITIONS[event][from];
}

/** Die Zustände, aus denen der Auslöser wirkt, etwa für `where state in (…)`. */
export function statesAllowing(event: EntryEvent): EntryState[] {
  return Object.keys(TRANSITIONS[event]) as EntryState[];
}
