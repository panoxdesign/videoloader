"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  countByFilter,
  FILTERS,
  matchesFilter,
  progressFraction,
  queuePositions,
  sortForList,
  type EntryView,
  type Filter,
} from "@/lib/queue-view";
import { texts } from "@/lib/texts";
import { useHydrated } from "@/lib/use-hydrated";

export function QueueList({ entries }: { entries: EntryView[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = countByFilter(entries);
  const positions = queuePositions(entries);
  const visible = sortForList(entries).filter((entry) => matchesFilter(entry.state, filter));

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
        <ul className="rounded-lg border border-border bg-card py-1">
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

  return (
    <li className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:gap-4 sm:px-5 sm:py-3.5">
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
          <Badge variant={BADGE_VARIANT[entry.state]}>
            {entry.state === "running" && entry.phase === "postprocess" ? texts.processing : texts.states[entry.state]}
          </Badge>
          {/* Fehlgeschlagene Einträge zeigen statt der Medienart die Kurzmeldung. */}
          {entry.state !== "failed" && <MediaSummary entry={entry} />}
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
            <span className="text-error-foreground">
              {texts.errors[entry.errorCategory ?? "other"] ?? texts.errors.other}
            </span>
          )}
        </div>
        {fraction !== undefined && <Progress value={Math.round(fraction * 100)} aria-label={title} />}
      </div>
    </li>
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

function Dot() {
  return <span aria-hidden>·</span>;
}

/** Im Locale des Browsers, z. B. „42%“ oder „42 %“. */
function formatPercent(fraction: number) {
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 }).format(fraction);
}
