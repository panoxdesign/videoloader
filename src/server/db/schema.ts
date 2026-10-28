import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { MEDIA_TYPES, RESOLUTIONS } from "../../lib/media";

/** wartend, läuft, fertig, fehlgeschlagen, abgebrochen */
export const ENTRY_STATES = ["waiting", "running", "done", "failed", "cancelled"] as const;
export type EntryState = (typeof ENTRY_STATES)[number];

export const PHASES = ["download", "postprocess"] as const;

export const queueEntries = sqliteTable(
  "queue_entries",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    url: text().notNull(),
    // Quelle bis Dauer kommen aus der Prüfung bei „Add“. Je nach Quelle fehlen sie.
    /** Quelle, der `extractor_key` von yt-dlp. */
    source: text(),
    mediaId: text(),
    title: text(),
    thumbnailUrl: text(),
    /** In Sekunden. */
    duration: real(),
    mediaType: text({ enum: MEDIA_TYPES }).notNull(),
    resolution: text({ enum: RESOLUTIONS }),
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
    /** In Bytes, gemessen bei Fertigstellung. */
    fileSize: integer(),
    errorCategory: text(),
  },
  (t) => [
    check(
      "queue_entries_state_check",
      sql`${t.state} in (${sql.raw(ENTRY_STATES.map((s) => `'${s}'`).join(", "))})`,
    ),
    // „is not null“ ist nötig: `null in (…)` ergibt null, und das lässt ein CHECK durch.
    check(
      "queue_entries_media_check",
      sql`(${t.mediaType} = 'video' and ${t.resolution} is not null and ${t.resolution} in (${sql.raw(RESOLUTIONS.map((r) => `'${r}'`).join(", "))})) or (${t.mediaType} = 'audio' and ${t.resolution} is null)`,
    ),
    index("queue_entries_state_queued_at_idx").on(t.state, t.queuedAt),
  ],
);

export type QueueEntry = typeof queueEntries.$inferSelect;
