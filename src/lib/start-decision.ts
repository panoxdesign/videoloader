/** Was die Startentscheidung von einem wartenden Eintrag braucht. Ticket 29 ergänzt die Quelle. */
export type StartCandidate = { id: number; queuedAt: number };

/**
 * Welche wartenden Einträge jetzt starten (Spec „Startentscheidung“): keine während der Pause,
 * sonst so viele, wie Slots frei sind, der kleinste Ordnungswert zuerst, bei Gleichstand die
 * kleinere ID (Einträge einer Playlist teilen sich den Ordnungswert). Laufende Einträge über der
 * Slotzahl, etwa nach einem kleineren `MAX_CONCURRENT_DOWNLOADS`, laden zu Ende, es startet nichts.
 * Ticket 29 erweitert sie um Startabstand und Abkühlphase je Quelle.
 */
export function entriesToStart<T extends StartCandidate>({
  waiting,
  running,
  paused,
  slots,
}: {
  waiting: readonly T[];
  running: number;
  paused: boolean;
  slots: number;
}): T[] {
  const free = slots - running;
  if (paused || free <= 0) return [];
  return [...waiting].sort((a, b) => a.queuedAt - b.queuedAt || a.id - b.id).slice(0, free);
}
