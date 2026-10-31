import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import * as schema from "./schema";

export type Db = ReturnType<typeof openDb>;
/** Eine laufende Transaktion, sie kann alles, was `Db` für Abfragen kann. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function openDb(file: string) {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema, casing: "snake_case" });
}

/** Synchron, läuft in `register` vor dem Worker-Start. */
export function migrateDb(db: Db) {
  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
}
