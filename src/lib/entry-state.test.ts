import { describe, expect, it } from "vitest";
import { statesAllowing, transition, type EntryEvent } from "./entry-state";

describe("transition", () => {
  // Die Zeilen aus Spec „Zustandsmodell des Queue-Eintrags“, soweit Ticket 21 sie baut.
  it.each([
    ["waiting", "start", "running"],
    ["waiting", "remove", "removed"],
    ["running", "succeed", "done"],
    ["running", "fail", "failed"],
    ["failed", "retry", "waiting"],
    ["cancelled", "retry", "waiting"],
    ["failed", "remove", "removed"],
    ["cancelled", "remove", "removed"],
  ] as const)("%s --%s--> %s", (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });

  it.each([
    // Für fertige Einträge gibt es kein Retry, gelöscht werden sie per Delete.
    ["done", "retry"],
    ["done", "remove"],
    // Ein wartender oder laufender Eintrag lässt sich nicht erneut versuchen.
    ["waiting", "retry"],
    ["running", "retry"],
    // Laufende entfernt erst Ticket 22 (Abbruch, dann löschen).
    ["running", "remove"],
    ["failed", "start"],
    ["done", "fail"],
    ["waiting", "succeed"],
  ] as const)("does not allow %s --%s-->", (from, event) => {
    expect(transition(from, event)).toBeUndefined();
  });
});

describe("statesAllowing", () => {
  it.each([
    ["retry", ["failed", "cancelled"]],
    ["remove", ["waiting", "failed", "cancelled"]],
    ["start", ["waiting"]],
  ] as const)("%s from %j", (event: EntryEvent, states) => {
    expect(statesAllowing(event)).toEqual(states);
  });
});
