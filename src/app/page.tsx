import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { texts } from "@/lib/texts";
import { getDb } from "@/server/db";
import type { QueueEntry } from "@/server/db/schema";
import { listEntries } from "@/server/queue";
import { addEntry } from "./actions";
import { RefreshEvery } from "./refresh-every";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <h1 className="text-2xl font-semibold">{texts.appName}</h1>

      <section aria-labelledby="add-title" className="flex flex-col gap-3">
        <h2 id="add-title" className="text-lg font-medium">
          {texts.addForm.title}
        </h2>
        <form action={addEntry} className="flex gap-2">
          <Input
            name="url"
            type="url"
            required
            aria-label={texts.addForm.linkLabel}
            placeholder={texts.addForm.linkPlaceholder}
          />
          <Button type="submit">{texts.addForm.add}</Button>
        </form>
      </section>

      <section aria-labelledby="queue-title" className="flex flex-col gap-3">
        <h2 id="queue-title" className="text-lg font-medium">
          {texts.queue.title}
        </h2>
        <Suspense>
          <QueueList />
        </Suspense>
        <RefreshEvery ms={1000} />
      </section>
    </main>
  );
}

async function QueueList() {
  await connection();
  const entries = listEntries(getDb());
  if (entries.length === 0) {
    return <p className="text-muted-foreground">{texts.queue.empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <QueueRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

function QueueRow({ entry }: { entry: QueueEntry }) {
  const percent = progressPercent(entry);
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">{entry.title ?? entry.url}</span>
        <Badge variant="secondary">{texts.states[entry.state]}</Badge>
      </div>
      {entry.state === "running" &&
        (entry.phase === "postprocess" ? (
          <span className="text-sm text-muted-foreground">{texts.queue.processing}</span>
        ) : (
          percent !== undefined && (
            <div className="flex items-center gap-3">
              <Progress value={percent} className="flex-1" />
              <span className="text-sm tabular-nums">{percent} %</span>
            </div>
          )
        ))}
      {entry.state === "failed" && (
        <span className="text-sm text-destructive">
          {texts.errors[entry.errorCategory ?? "other"] ?? texts.errors.other}
        </span>
      )}
    </li>
  );
}

function progressPercent(entry: QueueEntry) {
  const total = entry.totalBytes ?? entry.totalBytesEstimate;
  if (!total || entry.downloadedBytes === null) return undefined;
  return Math.min(100, Math.round((entry.downloadedBytes / total) * 100));
}
