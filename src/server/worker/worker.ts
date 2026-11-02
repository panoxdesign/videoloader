import { and, asc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { spawn } from "node:child_process";
import { lstatSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Readable } from "node:stream";
import { runOutcome } from "@/lib/entry-state";
import type { ErrorCategory } from "@/lib/error-category";
import { liveCategory } from "@/lib/live";
import { parseMedia } from "@/lib/media";
import { CHECK_TIMEOUT_MS, checkLink } from "../check/check";
import type { Db, Tx } from "../db/open";
import { NAME_HOLDING_STATES, queueEntries, type QueueEntry } from "../db/schema";
import { chooseFileName, extensionOf, nameKey } from "../files/file-name";
import { isInside } from "../files/inside";
import type { Logger } from "../log";
import { dataPaths } from "../paths";
import { buildDownloadArgs } from "./args";
import { classifyError } from "./classify-error";
import { parseLine, type DoneLine } from "./parse-line";
import { RawLog } from "./raw-log";

/** Feste Werte im Code, für Tests injizierbar. `sigkillMs` ist die Frist zwischen SIGTERM und SIGKILL. */
export type Timing = { tickMs: number; sigkillMs: number };
export const PRODUCTION_TIMING: Timing = { tickMs: 1000, sigkillMs: 5000 };

export type Clock = { now(): number };
export const systemClock: Clock = { now: () => Date.now() };

export type WorkerDeps = {
  db: Db;
  ytDlpPath: string;
  dataDir: string;
  timing: Timing;
  clock: Clock;
  log: Logger;
};

export type Worker = { stop(): Promise<void> };

const SLOTS = 1;
const PROGRESS_WRITE_INTERVAL_MS = 1000;

/**
 * Ein Fehlschlag, den die App vor dem Download selbst erkennt, mit Kategorie. `message` landet im
 * Rohlog, denn yt-dlp hat dann nichts geschrieben.
 */
class EntryFailure extends Error {
  constructor(
    readonly category: ErrorCategory,
    message: string,
  ) {
    super(message);
  }
}

/** Ein laufender Slot. `abort` bricht Prüfung und Download ab, sobald das Abbruch-Flag gesetzt ist. */
type Slot = { done: Promise<void>; abort: AbortController };

export function startWorker(deps: WorkerDeps): Worker {
  const slots = new Map<number, Slot>();
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = () => {
    if (stopped) return;
    try {
      while (slots.size < SLOTS) {
        const entry = claimNext(deps);
        if (!entry) break;
        const abort = new AbortController();
        // Ein Fehler im Slot darf den Next-Prozess nicht als unhandled rejection beenden.
        const done = runSlot(deps, entry, abort.signal)
          .catch((error) => deps.log.error(`queue entry ${entry.id}: slot failed: ${errorText(error)}`))
          .finally(() => slots.delete(entry.id));
        slots.set(entry.id, { done, abort });
      }
    } catch (error) {
      // Sonst plant sich der Worker nicht neu ein und die Queue steht still.
      deps.log.error(`claiming the next queue entry failed: ${errorText(error)}`);
    }
    try {
      for (const id of flaggedForCancel(deps.db)) slots.get(id)?.abort.abort();
    } catch (error) {
      deps.log.error(`checking cancel flags failed: ${errorText(error)}`);
    }
    timer = setTimeout(tick, deps.timing.tickMs);
    timer.unref();
  };
  tick();

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await Promise.all([...slots.values()].map((slot) => slot.done));
    },
  };
}

/** Laufende Einträge mit Abbruch-Flag („Cancel“ oder „Remove“). */
function flaggedForCancel(db: Db) {
  return db
    .select({ id: queueEntries.id })
    .from(queueEntries)
    .where(and(eq(queueEntries.state, "running"), isNotNull(queueEntries.cancelRequest)))
    .all()
    .map(({ id }) => id);
}


/**
 * Setzt den ältesten wartenden Eintrag in einer Transaktion auf läuft und reserviert dabei
 * seinen Dateinamen. So bekommen auch mehrere Slots nie denselben Namen. Scheitert die
 * Reservierung, schlägt nur dieser Eintrag fehl und der nächste wartende kommt dran.
 * Einem Playlist-Eintrag ohne Medien-ID oder Titel reserviert erst der Slot den Namen, nach der Prüfung.
 */
function claimNext({ db, dataDir, clock, log }: WorkerDeps): QueueEntry | undefined {
  const downloadsDir = dataPaths(dataDir).downloads;
  return db.transaction((tx) => {
    for (;;) {
      const next = tx
        .select()
        .from(queueEntries)
        .where(eq(queueEntries.state, "waiting"))
        .orderBy(asc(queueEntries.queuedAt), asc(queueEntries.id))
        .limit(1)
        .get();
      if (!next) return undefined;
      if (needsNaming(next)) {
        return tx
          .update(queueEntries)
          .set({ state: "running", phase: "download", fileName: null, cancelRequest: null })
          .where(and(eq(queueEntries.id, next.id), eq(queueEntries.state, "waiting")))
          .returning()
          .get();
      }
      try {
        return tx
          .update(queueEntries)
          .set({
            state: "running",
            phase: "download",
            fileName: reserveFileName(tx, downloadsDir, next),
            cancelRequest: null,
          })
          .where(and(eq(queueEntries.id, next.id), eq(queueEntries.state, "waiting")))
          .returning()
          .get();
      } catch (error) {
        log.error(`queue entry ${next.id}: could not reserve a file name: ${errorText(error)}`);
        tx.update(queueEntries)
          .set({
            state: "failed",
            errorCategory: "other",
            rawLog: `could not reserve a file name: ${errorMessage(error)}`,
            finishedAt: clock.now(),
          })
          .where(eq(queueEntries.id, next.id))
          .run();
      }
    }
  });
}

/**
 * Belegt sind die Namen der anderen laufenden und fertigen Einträge, auch wenn deren Datei
 * fehlt (sonst träfe ein Delete dort die neue Datei), und alles, was schon unter `downloads/`
 * liegt: Existiert die Zieldatei, lädt yt-dlp nicht neu und meldet trotzdem Erfolg.
 * Ein Retry behält seinen Namen, solange er frei ist.
 */
function reserveFileName(tx: Tx, downloadsDir: string, entry: QueueEntry) {
  const others = tx
    .select({ fileName: queueEntries.fileName, filePath: queueEntries.filePath })
    .from(queueEntries)
    .where(and(inArray(queueEntries.state, [...NAME_HOLDING_STATES]), ne(queueEntries.id, entry.id)))
    .all();
  const reserved = new Set(
    others.flatMap(({ fileName, filePath }) => [
      ...(fileName ? [nameKey(fileName)] : []),
      ...(filePath ? [nameKey(relative(downloadsDir, filePath))] : []),
    ]),
  );
  const isTaken = (fileName: string) =>
    reserved.has(nameKey(fileName)) || lstatSync(join(downloadsDir, fileName), { throwIfNoEntry: false }) !== undefined;

  if (entry.fileName && !isTaken(entry.fileName)) return entry.fileName;
  // Ohne bereinigten Titel nur bei Einträgen, die nicht über die Prüfung kamen.
  const name =
    entry.fileTitle && entry.fileMediaId
      ? { title: entry.fileTitle, mediaId: entry.fileMediaId }
      : { title: "Queue entry", mediaId: String(entry.id) };
  const playlist =
    entry.playlistFolder && entry.playlistNumber !== null
      ? { folder: entry.playlistFolder, number: entry.playlistNumber }
      : undefined;
  return chooseFileName({ ...name, ext: extensionOf(entry.mediaType), playlist }, isTaken);
}

/** Flat-Einträge einer Playlist kennen Medien-ID und Titel je nach Quelle nicht. */
function needsNaming(entry: QueueEntry) {
  return entry.playlistFolder !== null && (!entry.fileMediaId || !entry.fileTitle);
}

/**
 * Prüft den Link eines Playlist-Eintrags wie „Add“, übernimmt Quelle, Medien-ID, Titel und
 * Dateinamen-Teile und reserviert dann den Namen. Scheitert die Prüfung, wirft es. Auch bei einem
 * Stream: Flat-Einträge fremder Quellen tragen oft kein `live_status`, erst diese Prüfung zeigt ihn.
 * Ohne den Abbruch nähme yt-dlp auf, bis der Stream endet (Ticket 38).
 */
async function completeNaming({ db, ytDlpPath, dataDir }: WorkerDeps, entry: QueueEntry, cancel: AbortSignal) {
  const paths = dataPaths(dataDir);
  const result = await checkLink({
    ytDlpPath,
    url: entry.url,
    cacheDir: paths.cache,
    signal: AbortSignal.any([AbortSignal.timeout(CHECK_TIMEOUT_MS), cancel]),
  });
  if (result.kind === "none") {
    // Die `ERROR:`-Zeile der Prüfung sagt, warum, etwa ein privates oder gelöschtes Video.
    if (result.error) throw new EntryFailure(classifyError(result.error), result.error);
    throw new EntryFailure("other", `check before start found nothing${result.timedOut ? " (timed out)" : ""}`);
  }
  if (result.kind === "playlist") throw new EntryFailure("other", "check before start found a playlist");
  const { media } = result;
  const streamCategory = liveCategory(media.liveStatus);
  if (streamCategory) throw new EntryFailure(streamCategory, `check before start found a stream (${media.liveStatus})`);
  return db.transaction((tx) => {
    const checked = {
      source: media.source ?? entry.source,
      mediaId: media.mediaId ?? entry.mediaId,
      title: entry.title ?? media.title,
      thumbnailUrl: entry.thumbnailUrl ?? media.thumbnailUrl,
      duration: entry.duration ?? media.duration,
      fileTitle: media.fileTitle ?? entry.fileTitle,
      fileMediaId: media.fileMediaId ?? entry.fileMediaId,
    };
    const fileName = reserveFileName(tx, paths.downloads, { ...entry, ...checked });
    return tx.update(queueEntries).set({ ...checked, fileName }).where(eq(queueEntries.id, entry.id)).returning().get();
  });
}

/**
 * Ein Lauf von yt-dlp für einen Eintrag. `cancel` kommt vom Abbruch-Flag: Es bricht die Prüfung vor
 * dem Start ab bzw. beendet die Prozessgruppe. Wie der Lauf endet, entscheidet `runOutcome`.
 */
async function runSlot(deps: WorkerDeps, claimed: QueueEntry, cancel: AbortSignal) {
  const { db, ytDlpPath, dataDir, clock, log } = deps;
  let entry = claimed;
  const paths = dataPaths(dataDir);
  const tmpDir = join(paths.tmp, String(entry.id));
  const update = (values: Partial<QueueEntry>) =>
    db.update(queueEntries).set(values).where(eq(queueEntries.id, entry.id)).run();

  let done: DoneLine | undefined;
  let exitCode: number | null = null;
  let thrown: unknown;
  // Alles, was der Zeilen-Parser nicht auswertet, aus stdout und stderr in der Reihenfolge des Eintreffens.
  const rawLog = new RawLog();
  // Die Klassifikation gilt der ersten `ERROR:`-Zeile, auch wenn der Ringpuffer sie schon verdrängt hat.
  let firstError: string | undefined;
  // Läuft, sobald das Abbruch-Flag wirkt. Erst danach wird aufgeräumt.
  let stopping: Promise<void> | undefined;
  try {
    await mkdir(tmpDir, { recursive: true });
    await mkdir(paths.downloads, { recursive: true });

    if (!entry.fileName) entry = await completeNaming(deps, entry, cancel);
    if (cancel.aborted) throw new Error("cancelled before start");
    const media = parseMedia(entry);
    if (!media) throw new Error(`invalid media type ${entry.mediaType} / ${entry.resolution}`);
    if (!entry.fileName) throw new Error("no reserved file name");
    const args = buildDownloadArgs({
      url: entry.url,
      media,
      fileName: entry.fileName,
      downloadsDir: paths.downloads,
      tmpDir,
      cacheDir: paths.cache,
    });
    log.debug(`queue entry ${entry.id}: ${[ytDlpPath, ...args].map(shellQuote).join(" ")}`);
    const child = spawn(ytDlpPath, args, { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const exited = new Promise<number | null>((resolve) => {
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code));
    });
    const pgid = child.pid;
    if (pgid) {
      update({ pgid });
      // `detached` macht yt-dlp zum Leiter einer eigenen Gruppe, ffmpeg gehört mit dazu.
      cancel.addEventListener(
        "abort",
        () => {
          log.info(`queue entry ${entry.id}: cancelling`);
          stopping = stopGroup(pgid, deps.timing.sigkillMs, exited, () =>
            log.warn(`queue entry ${entry.id}: yt-dlp ignored SIGTERM, sent SIGKILL`),
          ).catch((error) => log.error(`queue entry ${entry.id}: could not stop yt-dlp: ${errorText(error)}`));
        },
        { once: true },
      );
    }

    let lastProgressWrite = -Infinity;
    const onLine = (line: string) => {
      const parsed = parseLine(line);
      if (parsed.kind === "log") {
        rawLog.push(parsed.line);
        if (firstError === undefined && parsed.line.startsWith("ERROR:")) firstError = parsed.line;
      } else if (parsed.kind === "done") {
        done = parsed;
      } else if (parsed.kind === "postprocess") {
        update({ phase: "postprocess", postprocessor: parsed.postprocessor });
      } else if (parsed.kind === "progress") {
        const now = clock.now();
        if (now - lastProgressWrite < PROGRESS_WRITE_INTERVAL_MS && parsed.status !== "finished") return;
        lastProgressWrite = now;
        update({
          phase: "download",
          downloadedBytes: parsed.downloadedBytes ?? null,
          totalBytes: parsed.totalBytes ?? null,
          totalBytesEstimate: parsed.totalBytesEstimate ?? null,
          fragmentIndex: parsed.fragmentIndex ?? null,
          fragmentCount: parsed.fragmentCount ?? null,
          speed: parsed.speed ?? null,
          eta: parsed.eta ?? null,
        });
      }
    };
    readLines(child.stdout, onLine);
    readLines(child.stderr, onLine);

    exitCode = await exited;
  } catch (error) {
    thrown = error;
  }

  // Erst die ganze Gruppe beenden und aufräumen, dann den Zustand schreiben: Wer „fertig“,
  // „fehlgeschlagen“ oder „abgebrochen“ sieht, findet keine Prozesse und Reste mehr.
  await stopping;
  await rm(tmpDir, { recursive: true, force: true }).catch((error) =>
    log.warn(`queue entry ${entry.id}: could not remove ${tmpDir}: ${error}`),
  );
  const finished = exitCode === 0 && done && isInside(paths.downloads, done.filepath) ? done : undefined;
  if (!finished) {
    // Ein fehlgeschlagener oder abgebrochener Eintrag gibt seinen Namen frei. Hat yt-dlp die Datei
    // schon verschoben, gehörte sie sonst keinem Eintrag, und ein Retry wiche auf ` (2)` aus.
    // Seit dem Claim hält nur dieser Eintrag den Namen, die Datei ist also seine.
    const leftovers = new Set([
      ...(entry.fileName ? [join(paths.downloads, entry.fileName)] : []),
      ...(done && isInside(paths.downloads, done.filepath) ? [done.filepath] : []),
    ]);
    for (const file of leftovers) {
      await rm(file, { force: true }).catch((error) =>
        log.warn(`queue entry ${entry.id}: could not remove ${file}: ${error}`),
      );
    }
  }
  const fileSize = finished ? await stat(finished.filepath).then((s) => s.size, () => null) : null;
  if (thrown !== undefined) rawLog.push(errorMessage(thrown));

  // Das Flag erst hier lesen, in derselben Transaktion wie das Ergebnis: Ein „Remove“, das nach dem
  // Ende von yt-dlp kommt, findet den Eintrag so entweder noch laufend oder schon im Endzustand.
  const outcome = db.transaction((tx) => {
    const current = tx
      .select({ cancelRequest: queueEntries.cancelRequest })
      .from(queueEntries)
      .where(eq(queueEntries.id, entry.id))
      .get();
    const outcome = runOutcome({ succeeded: finished !== undefined, cancelRequest: current?.cancelRequest ?? null });
    const where = eq(queueEntries.id, entry.id);
    const ended = { finishedAt: clock.now(), pgid: null, cancelRequest: null };
    if (outcome === "removed") {
      tx.delete(queueEntries).where(where).run();
    } else if (outcome === "done" && finished) {
      tx.update(queueEntries)
        .set({ ...ended, state: "done", title: finished.title, filePath: finished.filepath, fileSize })
        .where(where)
        .run();
    } else if (outcome === "cancelled") {
      tx.update(queueEntries).set({ ...ended, state: "cancelled" }).where(where).run();
    } else {
      // Rate-Limit wird schon erkannt, verhält sich aber bis Ticket 29 wie jeder andere Fehler.
      tx.update(queueEntries)
        .set({
          ...ended,
          state: "failed",
          errorCategory: thrown instanceof EntryFailure ? thrown.category : classifyError(firstError ?? ""),
          rawLog: rawLog.text(),
        })
        .where(where)
        .run();
    }
    return outcome;
  });
  if (outcome !== "failed") log.info(`queue entry ${entry.id}: ${outcome}`);
  // Ein Fehler der App (nicht von yt-dlp) gehört ins Log, ein Abbruch nicht.
  if (outcome === "failed" && thrown !== undefined) throw thrown;
}

/**
 * Beendet die Prozessgruppe: SIGTERM, nach `graceMs` SIGKILL, falls dann noch etwas lebt. Wartet auf
 * die Frist auch, wenn yt-dlp schon weg ist, ffmpeg aber nicht, denn Kinder können den Leiter überleben.
 */
async function stopGroup(pgid: number, graceMs: number, exited: Promise<unknown>, onKill: () => void) {
  if (!signalGroup(pgid, "SIGTERM")) return;
  let timer: NodeJS.Timeout | undefined;
  const graceOver = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, graceMs);
  });
  try {
    await Promise.race([exited, graceOver]);
    if (!signalGroup(pgid, 0)) return;
    await graceOver;
    if (signalGroup(pgid, "SIGKILL")) onKill();
  } finally {
    clearTimeout(timer);
  }
}

/** `false`, wenn es die Gruppe nicht (mehr) gibt. Signal `0` prüft nur. */
function signalGroup(pgid: number, signal: NodeJS.Signals | 0) {
  try {
    process.kill(-pgid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

/**
 * Zeilen nur an `\n` trennen und `\r` entfernen. yt-dlp schreibt `\r` auch mitten in eine Zeile,
 * etwa `ERROR: \r[download] Got error: …`, und `readline` trennte dort die Meldung vom Präfix.
 * `close` des Kindprozesses kommt erst nach `end` beider Streams, es geht also keine Zeile verloren.
 */
function readLines(stream: Readable, onLine: (line: string) => void) {
  let rest = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) onLine(line.replaceAll("\r", ""));
  });
  stream.on("end", () => {
    if (rest) onLine(rest.replaceAll("\r", ""));
  });
}

/** Für den Rohlog: ohne Stack, den liest dort niemand. */
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorText(error: unknown) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

/** Für die Debug-Zeile: der Aufruf lässt sich so in eine Shell kopieren. */
function shellQuote(arg: string) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}
