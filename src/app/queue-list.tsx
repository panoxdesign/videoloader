"use client";

import { cn } from "cn";
import { DownloadIcon, ListVideoIcon, RotateCcwIcon, Trash2Icon, XIcon, type LucideIcon } from "lucide-react";
import { useEffect, useId, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { transition } from "@/lib/entry-state";
import {
  countByFilter,
  FILTERS,
  formatSize,
  matchesFilter,
  progressFraction,
  queuePositions,
  sortForList,
  type EntryView,
  type Filter,
} from "@/lib/queue-view";
import { texts } from "@/lib/texts";
import { useHydrated } from "@/lib/use-hydrated";
import { deleteEntry, removeQueueEntry, retryQueueEntry } from "./actions";

export function QueueList({ entries }: { entries: EntryView[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = countByFilter(entries);
  const positions = queuePositions(entries);
  const visible = sortForList(entries).filter((entry) => matchesFilter(entry.state, filter));

  // „Show existing“ springt per `#entry-<id>` zur Zeile. Blendet der Filter sie aus, gilt wieder „All“.
  // Am Klick statt an `hashchange`, denn steht der Hash schon da, kommt kein `hashchange`. Der Klick
  // läuft vor dem Sprung, die Zeile steht also im DOM, wenn der Browser scrollt und `:target` setzt.
  useEffect(() => {
    const reveal = (event: MouseEvent) => {
      const href = (event.target as Element | null)?.closest("a")?.getAttribute("href") ?? "";
      const id = Number(/^#entry-(\d+)$/.exec(href)?.[1]);
      const target = entries.find((entry) => entry.id === id);
      if (target && !matchesFilter(target.state, filter)) flushSync(() => setFilter("all"));
    };
    document.addEventListener("click", reveal);
    return () => document.removeEventListener("click", reveal);
  }, [entries, filter]);

  return (
    <section aria-label={texts.queue.title} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {/* Mobil scrollen die Chips waagerecht. Das Padding hält den Fokusring sichtbar. */}
        <div
          role="group"
          aria-label={texts.filters.label}
          className="-mx-4 -my-1.5 flex flex-1 gap-2 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {FILTERS.map((option) => (
            <Button
              key={option}
              variant={option === filter ? "default" : "quiet"}
              aria-pressed={option === filter}
              onClick={() => setFilter(option)}
              className="flex-none px-4 font-medium aria-pressed:font-semibold"
            >
              {texts.filters[option]}
              <span aria-hidden className="-mx-1 max-sm:hidden">
                ·
              </span>
              <span className="tabular-nums">{counts[option]}</span>
            </Button>
          ))}
        </div>
        {/* Ticket 28: „Pause queue“ und das Menü „…“ */}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong bg-card px-6 py-10 text-center text-foreground-secondary">
          {entries.length === 0 ? texts.queue.empty : texts.queue.emptyFilter}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-card py-1">
          {visible.map((entry) => (
            <QueueRow key={entry.id} entry={entry} position={positions.get(entry.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

const BADGE_VARIANT = {
  waiting: "neutral",
  running: "info",
  done: "success",
  failed: "error",
  cancelled: "neutral",
} as const;

function QueueRow({ entry, position }: { entry: EntryView; position: number | undefined }) {
  const hydrated = useHydrated();
  const title = entry.title ?? entry.url;
  const fraction =
    entry.state === "running" && entry.phase !== "postprocess" ? progressFraction(entry) : undefined;
  const detailsId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Nach „Retry“ ist der Eintrag nicht mehr fehlgeschlagen, die Details gehen mit zu.
  const showDetails = detailsOpen && entry.state === "failed";

  return (
    <li
      id={entryAnchor(entry.id)}
      className={cn(
        "flex scroll-mt-4 flex-col gap-2.5 border-b border-border px-4 py-3 last:border-b-0 target:animate-highlight sm:px-5 sm:py-3.5",
        showDetails && "bg-accent",
      )}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Der schraffierte Platzhalter steht da, bis das Bild geladen ist, und ohne Bild. */}
        <div aria-hidden className="h-[54px] w-24 flex-none overflow-hidden rounded-sm bg-muted bg-hatch max-sm:hidden">
          {entry.thumbnailUrl && (
            // Direkt von der Quelle, ohne Next-Bildoptimierung (abgeschaltet, kein sharp im Image).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.thumbnailUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-semibold [overflow-wrap:anywhere]">{title}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs leading-4 font-medium text-foreground-secondary sm:text-[13px] sm:leading-[18px]">
            {entry.fileMissing ? (
              <Badge variant="error">{texts.fileMissing}</Badge>
            ) : (
              <Badge variant={BADGE_VARIANT[entry.state]}>
                {entry.state === "running" && entry.phase === "postprocess" ? texts.processing : texts.states[entry.state]}
              </Badge>
            )}
            {/* Fehlgeschlagene Einträge zeigen statt der Medienart die Kurzmeldung. */}
            {entry.state !== "failed" && (
              <span>
                <MediaSummary entry={entry} />
                {entry.state === "done" && !entry.fileMissing && entry.fileSize !== null && hydrated && (
                  <span className="tabular-nums"> · {formatSize(entry.fileSize)}</span>
                )}
              </span>
            )}
            {entry.playlistTitle && (
              <>
                <Dot />
                <span className="inline-flex min-w-0 items-center gap-1">
                  <ListVideoIcon aria-hidden strokeWidth={1.75} className="size-3.5 flex-none" />
                  <span className="sr-only">{texts.queue.fromPlaylist} </span>
                  <span className="[overflow-wrap:anywhere]">{entry.playlistTitle}</span>
                </span>
              </>
            )}
            {position !== undefined && (
              <>
                <Dot />
                <span>
                  #{position}
                  <span className="max-sm:hidden"> {texts.queue.inQueue}</span>
                </span>
              </>
            )}
            {fraction !== undefined && hydrated && (
              <>
                <Dot />
                <span className="tabular-nums">{formatPercent(fraction)}</span>
              </>
            )}
            {entry.state === "failed" && (
              <>
                <span className="text-error-foreground">{texts.errors[entry.errorCategory ?? "other"]}</span>
                {/* Der Link selbst bleibt klein in der Zeile, die Trefferfläche ist 44 px hoch. */}
                <button
                  type="button"
                  aria-expanded={showDetails}
                  aria-controls={detailsId}
                  onClick={() => setDetailsOpen(!showDetails)}
                  className="relative rounded-sm font-semibold text-link underline-offset-2 hover:underline after:absolute after:-inset-x-1 after:-inset-y-3.5"
                >
                  {showDetails ? texts.details.hide : texts.details.show}
                </button>
              </>
            )}
          </div>
          {fraction !== undefined && <Progress value={Math.round(fraction * 100)} aria-label={title} />}
        </div>
        {entry.state === "done" && (
          <div className="flex flex-none gap-2">
            {!entry.fileMissing && (
              // Den Dateinamen liefert `Content-Disposition`, deshalb `download` ohne Wert.
              <a
                href={`/api/files/${entry.id}`}
                download
                aria-label={texts.actions.download}
                className={cn(buttonVariants({ variant: "outline" }), "max-sm:w-11 max-sm:px-0")}
              >
                <DownloadIcon aria-hidden />
                <span className="max-sm:hidden">{texts.actions.download}</span>
              </a>
            )}
            <DeleteButton entry={entry} title={title} />
          </div>
        )}
        {/* Welche Zeile Retry und Remove zeigt, sagen die Zustandsübergänge. */}
        {(transition(entry.state, "retry") || transition(entry.state, "remove")) && (
          <div className="flex flex-none gap-2">
            {transition(entry.state, "retry") && (
              <RowActionButton variant="outline" label={texts.actions.retry} icon={RotateCcwIcon} action={() => retryQueueEntry(entry.id)} />
            )}
            {transition(entry.state, "remove") && (
              <RowActionButton variant="ghost" label={texts.actions.remove} icon={XIcon} action={() => removeQueueEntry(entry.id)} />
            )}
          </div>
        )}
      </div>
      {showDetails && <RawLogBlock id={detailsId} entryId={entry.id} title={title} />}
    </li>
  );
}

/**
 * Retry (Outline-Pille) und Remove (Text-Button) ohne Rückfrage. Mobil Icon-Buttons mit `aria-label`.
 * Gesperrt, bis die Server Action zurück ist.
 */
function RowActionButton({
  variant,
  label,
  icon: Icon,
  action,
}: {
  variant: "outline" | "ghost";
  label: string;
  icon: LucideIcon;
  action: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      aria-label={label}
      disabled={pending}
      onClick={() => startTransition(action)}
      className="max-sm:w-11 max-sm:px-0"
    >
      <Icon aria-hidden className="sm:hidden" />
      <span className="max-sm:hidden">{label}</span>
    </Button>
  );
}

type RawLogState = { kind: "loading" } | { kind: "loaded"; text: string } | { kind: "failed" };

/**
 * Der Rohlog als Monospace-Block. Er kommt erst beim Aufklappen vom Server und bleibt dann stehen,
 * denn ein fehlgeschlagener Eintrag ändert ihn nicht mehr.
 */
function RawLogBlock({ id, entryId, title }: { id: string; entryId: number; title: string }) {
  const [log, setLog] = useState<RawLogState>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/entries/${entryId}/log`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setLog({ kind: "loaded", text: await response.text() });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLog({ kind: "failed" });
      });
    return () => controller.abort();
  }, [entryId]);

  if (log.kind !== "loaded") {
    return (
      <p id={id} role="status" className={cn("text-[13px]", log.kind === "failed" ? "text-error-foreground" : "text-foreground-secondary")}>
        {log.kind === "failed" ? texts.details.failed : texts.details.loading}
      </p>
    );
  }
  return (
    // Lange Logs scrollen im Block. `tabIndex`, damit das auch per Tastatur geht.
    <pre
      id={id}
      tabIndex={0}
      aria-label={texts.details.label(title)}
      className="max-h-80 overflow-y-auto rounded-md bg-code p-3 font-mono text-[11px] leading-4 whitespace-pre-wrap text-code-foreground [overflow-wrap:anywhere] sm:text-xs sm:leading-[18px]"
    >
      {log.text || texts.details.empty}
    </pre>
  );
}

/** „Delete“ mit Bestätigung. Löscht Mediendatei und Eintrag zusammen. */
function DeleteButton({ entry, title }: { entry: EntryView; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const size = !entry.fileMissing && entry.fileSize !== null ? formatSize(entry.fileSize) : undefined;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="ghost" aria-label={texts.actions.delete} className="max-sm:w-11 max-sm:px-0" />}
      >
        <Trash2Icon aria-hidden className="sm:hidden" />
        <span className="max-sm:hidden">{texts.actions.delete}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{texts.deleteDialog.title}</AlertDialogTitle>
          <AlertDialogDescription>{texts.deleteDialog.description(title, size)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{texts.deleteDialog.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteEntry(entry.id);
                setOpen(false);
              })
            }
          >
            {texts.deleteDialog.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** „Video · 1080p“ bzw. „Audio · MP3“, mobil nur „1080p“ bzw. „MP3“. */
function MediaSummary({ entry }: { entry: Pick<EntryView, "mediaType" | "resolution"> }) {
  return (
    <span>
      <span className="max-sm:hidden">{texts.media.row[entry.mediaType]} · </span>
      {entry.resolution ? texts.media.resolutions[entry.resolution] : texts.media.row.mp3}
    </span>
  );
}

/** Sprungziel einer Zeile, auch für „Show existing“ im Formular. */
function entryAnchor(id: number) {
  return `entry-${id}`;
}

function Dot() {
  return <span aria-hidden>·</span>;
}

/** Im Locale des Browsers, z. B. „42%“ oder „42 %“. */
function formatPercent(fraction: number) {
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 }).format(fraction);
}
