import type { EntryState } from "@/server/db/schema";
import type { Resolution } from "./media";
import type { Filter } from "./queue-view";
import type { Theme } from "./theme";

/** Alle UI-Texte an einer Stelle, damit sie später übersetzt werden können. */
export const texts = {
  /** Sprache der Texte. Gilt auch für Wörter, die `Intl` liefert, etwa „yesterday“. */
  language: "en",
  appName: "Videoloader",
  appDescription: "Self-hosted video and audio downloads.",
  theme: {
    label: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
  } satisfies Record<Theme | "label", string>,
  addForm: {
    title: "Add a download",
    linkLabel: "Link",
    linkPlaceholder: "Paste a link to a video or playlist",
    add: "Add",
    checking: "Checking…",
    noMedia: "No downloadable media found at this link.",
    // Vorläufig, bis Ticket 26 den Playlist-Dialog bringt.
    playlistNotYet: "This link is a playlist. Playlists can't be added yet – paste a link to a single video.",
  },
  playlist: {
    /** Ab 100 ausgewählten Einträgen über dem Fuß. `duration` etwa „~2 h“. */
    largeSelection: (duration: string) =>
      `Large selection – downloads are spaced out to avoid rate limits, this will take at least ${duration}`,
  },
  media: {
    label: "Media type",
    video: "Video",
    audio: "Audio (MP3)",
    resolutionLabel: "Max resolution",
    /** Steht im Auslöser vor der Stufe, z. B. „Max Best“. */
    max: "Max",
    resolutions: { best: "Best", "1080": "1080p", "720": "720p", "480": "480p" } satisfies Record<Resolution, string>,
    /** Zweite Zeile im Auflösungsmenü. */
    resolutionHints: { best: "Up to 4K – may not play on older devices", "1080": "Plays everywhere" } as Partial<
      Record<Resolution, string>
    >,
    bestWarning: "Up to 4K – may not play on older devices. Choose 1080p for best compatibility.",
    audioInfo: "192 kbps · with cover",
    /** In der Listenzeile „Video · 1080p“ bzw. „Audio · MP3“, mobil ohne Medienart. */
    row: { video: "Video", audio: "Audio", mp3: "MP3" },
  },
  queue: {
    title: "Queue",
    empty: "Nothing in the queue yet. Paste a link above to add the first download.",
    emptyFilter: "No entries match this filter.",
    /** Mobil steht nur „#n“, auf breiten Schirmen „#n in queue“. */
    inQueue: "in queue",
  },
  filters: {
    label: "Filter",
    all: "All",
    active: "Active",
    done: "Done",
    failedCancelled: "Failed & cancelled",
  } satisfies Record<Filter | "label", string>,
  states: {
    waiting: "Queued",
    running: "Downloading",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
  } satisfies Record<EntryState, string>,
  processing: "Processing",
  /** Fertig, aber die Mediendatei fehlt. Kein eigener Zustand. */
  fileMissing: "File missing",
  actions: {
    download: "Download",
    delete: "Delete",
  },
  deleteDialog: {
    title: "Delete this file?",
    /** Ohne Größe, wenn die Datei schon fehlt. */
    description: (title: string, size?: string) =>
      `“${title}”${size ? ` (${size})` : ""} will be removed from the server. This can't be undone.`,
    cancel: "Cancel",
    confirm: "Delete",
  },
  duplicate: {
    downloaded: "Already downloaded.",
    queued: "Already in queue.",
    /** `media` ist z. B. „Video · 1080p“, `age` z. B. „2 days ago“. */
    exists: (title: string, media: string, age: string) => `“${title}” exists as ${media}, downloaded ${age}.`,
    waiting: (title: string, media: string, position: number) => `“${title}” is queued as ${media} (#${position}).`,
    running: (title: string, media: string) => `“${title}” is downloading as ${media}.`,
    addAnyway: "Add anyway",
    cancel: "Cancel",
    showExisting: "Show existing",
  },
  time: {
    justNow: "just now",
  },
  errors: {
    other: "Download failed.",
  } as Record<string, string>,
} as const;
