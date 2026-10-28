import { asc, eq } from "drizzle-orm";
import type { Media } from "@/lib/media";
import type { CheckedMedia } from "./check/parse-check";
import type { Db } from "./db/open";
import { queueEntries } from "./db/schema";

/** Legt einen wartenden Queue-Eintrag an, mit dem, was die Link-Prüfung schon über das Medium weiß. */
export function enqueue(db: Db, url: string, media: Media, now: number, checked?: CheckedMedia) {
  return db
    .insert(queueEntries)
    .values({ url, ...checked, ...media, state: "waiting", queuedAt: now })
    .returning()
    .get();
}

export function listEntries(db: Db) {
  return db.select().from(queueEntries).orderBy(asc(queueEntries.queuedAt), asc(queueEntries.id)).all();
}

export function getEntry(db: Db, id: number) {
  return db.select().from(queueEntries).where(eq(queueEntries.id, id)).get();
}
