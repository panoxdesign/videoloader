import { isAbsolute, relative, sep } from "node:path";

/**
 * Liegt `file` echt unterhalb von `dir`? Beide Pfade absolut. Symlinks löst die
 * Funktion nicht auf, dafür prüft der Aufrufer zusätzlich die `realpath`-Pfade.
 */
export function isInside(dir: string, file: string) {
  if (!isAbsolute(dir) || !isAbsolute(file)) return false;
  const rel = relative(dir, file);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
