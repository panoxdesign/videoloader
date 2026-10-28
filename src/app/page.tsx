import { connection } from "next/server";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EntryView } from "@/lib/queue-view";
import { texts } from "@/lib/texts";
import { getDb } from "@/server/db";
import { listEntries } from "@/server/queue";
import { addEntry } from "./actions";
import { MediaOptions } from "./media-options";
import { QueueList } from "./queue-list";
import { RefreshEvery } from "./refresh-every";

export default function Home() {
  return (
    <>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1120px] items-center gap-1 py-1 pr-2 pl-4 sm:px-6 sm:py-2">
          <h1 className="flex-1 font-display text-[22px] leading-7 font-bold tracking-[-0.01em]">{texts.appName}</h1>
          {/* Ticket 32: Konto-Menü mit „Log out“ bei aktivem Passwortschutz */}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 p-4 sm:gap-4 sm:p-6">
        {/* Mobil dreizeilig (Link, Optionen, „Add“), breit zweizeilig mit „Add“ neben dem Link. */}
        <form
          action={addEntry}
          aria-label={texts.addForm.title}
          className="grid gap-2 rounded-lg border border-border bg-card p-3 shadow-elevation-1 sm:grid-cols-[1fr_auto] sm:gap-3 sm:p-4"
        >
          <label htmlFor="link" className="sr-only">
            {texts.addForm.linkLabel}
          </label>
          <Input
            id="link"
            name="url"
            type="url"
            required
            placeholder={texts.addForm.linkPlaceholder}
            className="sm:h-13"
          />
          <MediaOptions className="sm:col-span-2 sm:row-start-2" />
          <Button type="submit" size="lg" className="sm:h-13">
            {texts.addForm.add}
          </Button>
        </form>

        {/* Tickets 28 und 29: Banner für Pause und Rate-Limit */}

        <Suspense>
          <Queue />
        </Suspense>
        <RefreshEvery ms={1000} />
      </main>
    </>
  );
}

async function Queue() {
  await connection();
  const entries: EntryView[] = listEntries(getDb()).map((entry) => ({
    id: entry.id,
    url: entry.url,
    title: entry.title,
    mediaType: entry.mediaType,
    resolution: entry.resolution,
    state: entry.state,
    phase: entry.phase,
    queuedAt: entry.queuedAt,
    finishedAt: entry.finishedAt,
    downloadedBytes: entry.downloadedBytes,
    totalBytes: entry.totalBytes,
    totalBytesEstimate: entry.totalBytesEstimate,
    errorCategory: entry.errorCategory,
  }));
  return <QueueList entries={entries} />;
}
