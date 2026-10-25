import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** wartend, läuft, fertig, fehlgeschlagen, abgebrochen */
export const ENTRY_STATES = ["waiting", "running", "done", "failed", "cancelled"] as const;
export type EntryState = (typeof ENTRY_STATES)[number];

export const PHASES = ["download", "postprocess"] as const;

export const queueEntries = sqliteTable(
  "queue_entries",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    url: text().notNull(),
    title: text(),
    state: text({ enum: ENTRY_STATES }).notNull(),
    /** Ordnungswert „eingereiht am", bestimmt die Position. */
    queuedAt: integer().notNull(),
    finishedAt: integer(),

    phase: text({ enum: PHASES }),
    downloadedBytes: integer(),
    totalBytes: integer(),
    totalBytesEstimate: integer(),
    fragmentIndex: integer(),
    fragmentCount: integer(),
    speed: real(),
    eta: integer(),
    postprocessor: text(),

    pgid: integer(),
    filePath: text(),
    errorCategory: text(),
  },
  (t) => [
    check(
      "queue_entries_state_check",
      sql`${t.state} in (${sql.raw(ENTRY_STATES.map((s) => `'${s}'`).join(", "))})`,
    ),
    index("queue_entries_state_queued_at_idx").on(t.state, t.queuedAt),
  ],
);

export type QueueEntry = typeof queueEntries.$inferSelect;
