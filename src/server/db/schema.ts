import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { MEDIA_TYPES, RESOLUTIONS } from "../../lib/media";

/** wartend, läuft, fertig, fehlgeschlagen, abgebrochen */
export const ENTRY_STATES = ["waiting", "running", "done", "failed", "cancelled"] as const;
export type EntryState = (typeof ENTRY_STATES)[number];

/** Laufende und fertige Einträge halten ihren Dateinamen, auch wenn die Datei fehlt. */
export const NAME_HOLDING_STATES = ["running", "done"] as const satisfies readonly EntryState[];

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
    /** Titel und Medien-ID, wie yt-dlp sie für Dateinamen bereinigt. Aus der Prüfung. */
    fileTitle: text(),
    fileMediaId: text(),
    // Nur bei Einträgen aus einer Playlist, aus dem Zwischenspeicher der Vorschau.
    /** Playlist-Name für die Listenzeile. */
    playlistTitle: text(),
    /** Ordner unter `downloads/`, bereinigt. */
    playlistFolder: text(),
    /** Position laut Vorschau, ab 1. */
    playlistNumber: integer(),
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
    /**
     * Reservierter Name unter `downloads/`, mit Endung. Gesetzt beim Start. Laufende und
     * fertige Einträge halten ihn, ein Retry behält ihn, solange ihn niemand sonst belegt.
     */
    fileName: text(),
    /** Der echte Pfad aus der `DONE`-Zeile. */
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
    // Sicherheitsnetz: Den Namen wählt der Worker schon so, dass er frei ist.
    uniqueIndex("queue_entries_file_name_idx")
      .on(t.fileName)
      .where(sql`${t.state} in (${sql.raw(NAME_HOLDING_STATES.map((s) => `'${s}'`).join(", "))})`),
  ],
);

export type QueueEntry = typeof queueEntries.$inferSelect;

/**
 * Zwischenspeicher der Playlist-Vorschau, bis „Add x to queue“ einreiht. Der Browser kennt nur
 * den Schlüssel, Titel, Medien-IDs und Dateinamen kommen nie aus dem Browser. Eine Zeile gilt
 * etwa 15 min und wird beim Einreihen gelöscht.
 */
export const playlistPreviews = sqliteTable("playlist_previews", {
  key: text().primaryKey(),
  expiresAt: integer().notNull(),
  /** Die Vorschau als JSON, sie wird nur als Ganzes geschrieben und gelesen. */
  data: text({ mode: "json" }).notNull(),
});
