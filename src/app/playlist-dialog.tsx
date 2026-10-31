"use client";

import { CircleAlertIcon, ClockIcon, InfoIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import {
  initialSelection,
  largeSelectionHint,
  selectAllState,
  toggleAll,
  toggleItem,
  type PreviewView,
} from "@/lib/playlist-selection";
import { formatDuration, mediaLabel } from "@/lib/queue-view";
import { texts } from "@/lib/texts";
import { addPlaylistEntries } from "./actions";

/** Was der Playlist-Dialog gerade zeigt. */
export type PlaylistDialogState =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "error"; message: string; timedOut?: boolean }
  | { kind: "preview"; view: PreviewView };

/** Ab so vielen Millisekunden Laden erscheint „Large playlist – this can take a while“. */
const LARGE_AFTER_MS = 5_000;

export function PlaylistDialog({
  state,
  onCancel,
  onAdded,
}: {
  state: PlaylistDialogState;
  /** „Cancel“, „Close“ oder Escape. Beim Laden bricht das den yt-dlp-Aufruf ab. */
  onCancel: () => void;
  onAdded: () => void;
}) {
  const close = (open: boolean) => !open && onCancel();
  if (state.kind === "loading") return <LoadingDialog onOpenChange={close} onCancel={onCancel} />;
  if (state.kind === "error") return <ErrorDialog state={state} onOpenChange={close} onClose={onCancel} />;
  if (state.kind === "preview") {
    return (
      <PreviewDialog
        // Neue Vorschau, neue Auswahl.
        key={state.view.key}
        view={state.view}
        onOpenChange={close}
        onCancel={onCancel}
        onAdded={onAdded}
      />
    );
  }
  return null;
}

function LoadingDialog({ onOpenChange, onCancel }: { onOpenChange: (open: boolean) => void; onCancel: () => void }) {
  const [large, setLarge] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLarge(true), LARGE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{texts.playlist.loading}</DialogTitle>
        <div className="flex min-h-32 flex-col items-center justify-center gap-3">
          <LoaderCircleIcon aria-hidden className="size-8 text-primary motion-safe:animate-spin" />
          {/* Die Statuszeile steht immer da, damit Screenreader den späteren Text ansagen. */}
          <p role="status" className="text-center text-foreground-secondary">
            {large ? texts.playlist.large : ""}
          </p>
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={onCancel}>
            {texts.playlist.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErrorDialog({
  state,
  onOpenChange,
  onClose,
}: {
  state: Extract<PlaylistDialogState, { kind: "error" }>;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
}) {
  const Icon = state.timedOut ? ClockIcon : CircleAlertIcon;
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>{texts.playlist.errorTitle}</AlertDialogTitle>
        <div className="flex flex-col items-center gap-3 px-2 text-center">
          <Icon aria-hidden strokeWidth={1.75} className="size-8 text-error-foreground" />
          <AlertDialogDescription className="font-medium text-error-foreground">{state.message}</AlertDialogDescription>
        </div>
        <AlertDialogFooter>
          <Button onClick={onClose}>{texts.playlist.close}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PreviewDialog({
  view,
  onOpenChange,
  onCancel,
  onAdded,
}: {
  view: PreviewView;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onAdded: () => void;
}) {
  const [selection, setSelection] = useState(() => initialSelection(view.items));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const all = selectAllState(selection, view.items);
  const count = view.items.filter((item) => selection.has(item.number)).length;
  const hint = largeSelectionHint(count, view.startIntervalSeconds);

  const add = () =>
    startTransition(async () => {
      const result = await addPlaylistEntries(view.key, [...selection]);
      if (result.error) setError(result.error);
      else onAdded();
    });

  return (
    <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col gap-0 p-0">
        <div className="flex flex-col gap-1 px-6 pt-6 pb-4">
          <DialogTitle className="[overflow-wrap:anywhere]">{view.title ?? texts.playlist.untitled}</DialogTitle>
          <DialogDescription>
            {texts.playlist.summary(view.items.length)}
            <strong className="font-semibold text-foreground">{mediaLabel(view.media)}</strong>
          </DialogDescription>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 border-y border-border px-6 font-semibold">
          <Checkbox
            checked={all === "all"}
            indeterminate={all === "mixed"}
            onCheckedChange={() => setSelection((current) => toggleAll(current, view.items))}
          />
          {texts.playlist.selectAll}
        </label>

        <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-1" aria-label={texts.playlist.entries}>
          {view.items.map((item) => (
            <li key={item.number}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted">
                <Checkbox
                  checked={selection.has(item.number)}
                  onCheckedChange={() => setSelection((current) => toggleItem(current, item.number))}
                />
                {/* Der schraffierte Platzhalter steht da, bis das Bild geladen ist, und ohne Bild. */}
                <span aria-hidden className="h-9 w-16 flex-none overflow-hidden rounded-sm bg-muted bg-hatch">
                  {item.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="size-full object-cover"
                    />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span className="font-medium [overflow-wrap:anywhere]">{item.title ?? item.url}</span>
                  {item.duration !== null && (
                    <span className="text-xs text-foreground-secondary tabular-nums">{formatDuration(item.duration)}</span>
                  )}
                  {/* Mobil unter dem Titel, sonst bliebe für ihn kaum Platz. */}
                  {item.duplicate && <DuplicateBadge kind={item.duplicate} className="sm:hidden" />}
                </span>
                {item.duplicate && <DuplicateBadge kind={item.duplicate} className="flex-none max-sm:hidden" />}
              </label>
            </li>
          ))}
        </ul>

        {hint && (
          <p role="note" className="mx-6 mt-3 flex gap-2.5 rounded-md bg-info px-4 py-3 text-info-foreground">
            <InfoIcon aria-hidden strokeWidth={1.75} className="mt-px size-[18px] flex-none" />
            {hint}
          </p>
        )}
        {error && (
          <p role="alert" className="mx-6 mt-3 rounded-md bg-error px-4 py-3 text-error-foreground">
            {error}
          </p>
        )}

        <DialogFooter className="flex-row flex-wrap items-center justify-end border-t border-border px-6 py-4">
          <span className="basis-full text-foreground-secondary tabular-nums sm:flex-1 sm:basis-auto">
            {texts.playlist.selected(count, view.items.length)}
          </span>
          <Button variant="quiet" disabled={pending} onClick={onCancel}>
            {texts.playlist.cancel}
          </Button>
          <Button disabled={pending || count === 0 || error !== undefined} onClick={add}>
            {pending && <LoaderCircleIcon aria-hidden className="motion-safe:animate-spin" />}
            {texts.playlist.add(count)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuplicateBadge({ kind, className }: { kind: "downloaded" | "queued"; className?: string }) {
  return (
    <Badge variant={kind === "downloaded" ? "success" : "info"} className={className}>
      {kind === "downloaded" ? texts.playlist.alreadyDownloaded : texts.playlist.alreadyInQueue}
    </Badge>
  );
}
