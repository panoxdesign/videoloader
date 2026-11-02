import type { EntryState } from "@/server/db/schema";
import type { ErrorCategory } from "./error-category";
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
    /** Ganzer YouTube-Mix, ohne yt-dlp abgelehnt. */
    mix: "YouTube Mixes can't be downloaded. Add a single video from the Mix instead.",
    /** Laufender oder angekündigter Stream (`is_live`, `is_upcoming`). */
    live: "Live streams can't be downloaded.",
    /** `post_live`: Der Stream ist vorbei, YouTube verarbeitet die Aufzeichnung noch. */
    justEnded: "This stream just ended. Try again later.",
  },
  playlist: {
    loading: "Loading playlist…",
    /** Nach 5 s unter „Loading playlist…“. */
    large: "Large playlist – this can take a while",
    cancel: "Cancel",
    /** Kopf: „12 videos · will be added as “, dahinter fett die Medienart wie „Video · 1080p“. */
    summary: (count: number) => `${count} ${count === 1 ? "video" : "videos"} · will be added as `,
    /** Titel, wenn die Quelle keinen Playlist-Namen liefert. */
    untitled: "Playlist",
    entries: "Playlist entries",
    selectAll: "Select all",
    selected: (selected: number, total: number) => `${selected} of ${total} selected`,
    add: (count: number) => `Add ${count} to queue`,
    alreadyDownloaded: "Already downloaded",
    alreadyInQueue: "Already in queue",
    /** Badges für Einträge, die sich nicht auswählen lassen (Ticket 38). */
    live: "Live",
    upcoming: "Upcoming",
    justEnded: "Just ended",
    errorTitle: "Can't preview playlist",
    timedOut: "Playlist too large to preview (timed out)",
    /** Server lehnt ab (etwa 403 hinter falsch eingerichtetem Proxy), Netzfehler, keine JSON-Antwort. */
    failed: "Couldn't load the playlist. Please try again.",
    // Erscheint erst mit Ticket 29 (Rate-Limit in der Vorschau).
    rateLimited: "Source is rate-limiting requests, try again later",
    close: "Close",
    expired: "This preview has expired. Add the playlist link again.",
    /** Ab 100 ausgewählten Einträgen über dem Fuß. `duration` etwa „~2 h“. */
    largeSelection: (duration: string) =>
      `Large selection – downloads are spaced out to avoid rate limits, this will take at least ${duration}`,
  },
  /** Frage bei einem Video in einer Playlist (gemischter Link), vor jeder Prüfung. Den Playlist-Namen kennt die App erst mit der Vorschau. */
  mixed: {
    question: "This video is part of a playlist.",
    addVideo: "Add this video",
    loadPlaylist: "Load whole playlist",
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
    /** Vor dem Playlist-Namen in der Zeile, nur für Screenreader. */
    fromPlaylist: "Playlist:",
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
  /** Laufend mit Abbruch-Flag, bis der Prozess wirklich beendet ist. Kein eigener Zustand. */
  cancelling: "Cancelling…",
  /** Fertig, aber die Mediendatei fehlt. Kein eigener Zustand. */
  fileMissing: "File missing",
  actions: {
    download: "Download",
    delete: "Delete",
    retry: "Retry",
    remove: "Remove",
    cancel: "Cancel",
  },
  /** „Show details“ an fehlgeschlagenen Einträgen, mit dem Rohlog von yt-dlp. */
  details: {
    show: "Show details",
    hide: "Hide details",
    label: (title: string) => `yt-dlp output for “${title}”`,
    loading: "Loading details…",
    failed: "Couldn't load the details.",
    empty: "yt-dlp wrote nothing.",
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
  /** Kurzmeldungen fehlgeschlagener Einträge je Fehlerkategorie. */
  errors: {
    // Bis Ticket 29 verhält sich ein Rate-Limit wie jeder andere Fehler.
    rateLimit: "The source is rate-limiting downloads. Try again later.",
    private: "This video is private.",
    unavailable: "This video is unavailable or has been removed.",
    geoBlocked: "This video isn't available in the server's country.",
    ageRestricted: "This video is age-restricted and requires sign-in.",
    botCheck: "The source is blocking this server (bot check).",
    loginRequired: "This source requires sign-in.",
    network: "Network error – check the server's connection.",
    unsupportedLink: "This link isn't supported.",
    noFormat: "No matching format available.",
    drm: "DRM-protected media can't be downloaded.",
    jsChallenge: "Couldn't process this video – yt-dlp may need an update.",
    live: "Live streams can't be downloaded.",
    justEnded: "This stream just ended. Try again later.",
    other: "Download failed.",
  } satisfies Record<ErrorCategory, string>,
} as const;
