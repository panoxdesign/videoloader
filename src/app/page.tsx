import { connection } from "next/server";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { EntryView } from "@/lib/queue-view";
import { texts } from "@/lib/texts";
import { getDb } from "@/server/db";
import { findMediaFile } from "@/server/files/media-file";
import { dataDirFromEnv, dataPaths } from "@/server/paths";
import { listEntries } from "@/server/queue";
import { AddForm } from "./add-form";
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
        <AddForm />

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
  const { downloads } = dataPaths(dataDirFromEnv());
  const entries: EntryView[] = await Promise.all(
    listEntries(getDb()).map(async (entry) => ({
      id: entry.id,
      url: entry.url,
      title: entry.title,
      thumbnailUrl: entry.thumbnailUrl,
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
      fileSize: entry.fileSize,
      fileMissing: entry.state === "done" && !(await findMediaFile(downloads, entry)),
    })),
  );
  return <QueueList entries={entries} />;
}
