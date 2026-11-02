import { describe, expect, it } from "vitest";
import { runOutcome, statesAllowing, transition, type EntryEvent } from "./entry-state";

describe("transition", () => {
  // Die Zeilen aus Spec „Zustandsmodell des Queue-Eintrags“, soweit Ticket 22 sie baut.
  it.each([
    ["running", "cancel", "cancelled"],
    // Remove auf einen laufenden Eintrag bricht ihn ab und löscht ihn, ohne Umweg über abgebrochen.
    ["running", "remove", "removed"],
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
    // Nur ein laufender Eintrag kann abgebrochen werden.
    ["waiting", "cancel"],
    ["done", "cancel"],
    ["failed", "cancel"],
    ["cancelled", "cancel"],
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
    ["remove", ["waiting", "running", "failed", "cancelled"]],
    ["cancel", ["running"]],
    ["start", ["waiting"]],
  ] as const)("%s from %j", (event: EntryEvent, states) => {
    expect(statesAllowing(event)).toEqual(states);
  });
});

describe("runOutcome", () => {
  it.each([
    // Endet yt-dlp mit Exit 0 und `DONE`, bevor das Flag wirkt, gewinnt fertig.
    [true, null, "done"],
    [true, "cancel", "done"],
    [true, "remove", "done"],
    [false, null, "failed"],
    [false, "cancel", "cancelled"],
    [false, "remove", "removed"],
  ] as const)("succeeded %s with flag %s ends as %s", (succeeded, cancelRequest, outcome) => {
    expect(runOutcome({ succeeded, cancelRequest })).toBe(outcome);
  });
});
