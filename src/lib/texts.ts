import type { EntryState } from "@/server/db/schema";
import type { Filter } from "./queue-view";
import type { Theme } from "./theme";

/** Alle UI-Texte an einer Stelle, damit sie später übersetzt werden können. */
export const texts = {
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
  errors: {
    other: "Download failed.",
  } as Record<string, string>,
} as const;
