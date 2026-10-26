import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { passwordFilePath, resolveDataDir, type Env, type Facts } from "./config";

/** Sammelt die Dateisystem-Fakten für `parseConfig`. */
export function gatherFacts(env: Env): Facts {
  const file = passwordFilePath(env);
  return {
    dataDir: dataDirFact(resolveDataDir(env)),
    passwordFile: file === undefined ? undefined : passwordFileFact(file),
    mountPoints: readMountPoints(),
    uid: process.getuid?.() ?? -1,
    gid: process.getgid?.() ?? -1,
  };
}

function dataDirFact(dir: string): Facts["dataDir"] {
  try {
    if (!statSync(dir).isDirectory()) return "not-a-directory";
    accessSync(dir, constants.W_OK | constants.X_OK);
    return "ok";
  } catch (error) {
    return isMissing(error) ? "missing" : "not-writable";
  }
}

function passwordFileFact(file: string): NonNullable<Facts["passwordFile"]> {
  try {
    if (statSync(file).isDirectory()) return { kind: "directory" };
    return { kind: "read", content: readFileSync(file, "utf8") };
  } catch (error) {
    return isMissing(error) ? { kind: "missing" } : { kind: "unreadable" };
  }
}

function readMountPoints() {
  try {
    return parseMountinfo(readFileSync("/proc/self/mountinfo", "utf8"));
  } catch {
    return undefined;
  }
}

/** Das fünfte Feld jeder Zeile ist der Mount-Punkt, Leerzeichen und Co. stehen oktal maskiert. */
export function parseMountinfo(text: string) {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split(" ")[4].replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8))));
}

function isMissing(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}
