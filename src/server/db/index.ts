import { dataDirFromEnv, dataPaths } from "../paths";
import { openDb, type Db } from "./open";

let db: Db | undefined;

/**
 * DB-Verbindung für Route Handler und Server Actions. Lazy, weil `next build`
 * Code auf Modulebene ausführt. Die Migrationen hat `register` schon ausgeführt.
 */
export function getDb(): Db {
  db ??= openDb(dataPaths(dataDirFromEnv()).db);
  return db;
}
