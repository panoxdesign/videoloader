import type { EntryState } from "@/server/db/schema";

/** Alle UI-Texte an einer Stelle, damit sie später übersetzt werden können. */
export const texts = {
  appName: "Videoloader",
  appDescription: "Self-hosted video and audio downloads.",
  addForm: {
    title: "Add a download",
    linkLabel: "Link",
    linkPlaceholder: "Paste a link to a video or playlist",
    add: "Add",
  },
  queue: {
    title: "Queue",
    empty: "Nothing in the queue yet.",
    processing: "Processing",
  },
  states: {
    waiting: "Queued",
    running: "Downloading",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
  } satisfies Record<EntryState, string>,
  errors: {
    other: "Download failed.",
  } as Record<string, string>,
} as const;
