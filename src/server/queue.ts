import { asc, eq } from "drizzle-orm";
import type { Db } from "./db/open";
import { queueEntries } from "./db/schema";

/** Legt einen wartenden Queue-Eintrag an. Die Link-Prüfung folgt in einem späteren Ticket. */
export function enqueue(db: Db, url: string, now: number) {
  return db
    .insert(queueEntries)
    .values({ url, state: "waiting", queuedAt: now })
    .returning()
    .get();
}

export function listEntries(db: Db) {
  return db.select().from(queueEntries).orderBy(asc(queueEntries.queuedAt), asc(queueEntries.id)).all();
}

export function getEntry(db: Db, id: number) {
  return db.select().from(queueEntries).where(eq(queueEntries.id, id)).get();
}
