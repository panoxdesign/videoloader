"use client";

import { LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { useActionState, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseMedia, type Media } from "@/lib/media";
import { isPlaylistLink } from "@/lib/playlist-link";
import { formatAge, mediaLabel } from "@/lib/queue-view";
import { texts } from "@/lib/texts";
import { addEntry, type AddState, type DuplicateWarning } from "./actions";
import type { LoadResult } from "@/server/playlist-preview";
import { MediaOptions } from "./media-options";
import { PlaylistDialog, type PlaylistDialogState } from "./playlist-dialog";

/**
 * Formular-Karte „Add a download“. Solange die Prüfung läuft, sind Feld und „Add“ gesperrt,
 * ein Doppelklick erzeugt also keinen zweiten Eintrag.
 *
 * „Add“ wählt den Weg am Link (ADR 0002): Ein erkannter Playlist-Link lädt die Vorschau über den
 * Route Handler, abbrechbar mit „Cancel“. Alles andere prüft die Server Action. Liefert sie doch
 * eine Playlist, öffnet sich der Dialog direkt mit ihrem Ergebnis. Bei einem Video in einer
 * Playlist lädt „Load whole playlist“ die Playlist über denselben Route Handler (Ticket 27).
 */
export function AddForm() {
  const [state, formAction, pending] = useActionState(addEntry, {});
  // „Cancel“ und jede Änderung am Link blenden die Warnung aus, bis die nächste Antwort kommt.
  const [dismissed, setDismissed] = useState<AddState>();
  const duplicate = state === dismissed ? undefined : state.duplicate;
  const mixed = state === dismissed ? undefined : state.mixed;
  const input = useRef<HTMLInputElement>(null);

  // Der Dialog aus dem Route Handler. Sonst zeigt er die Vorschau, die `addEntry` geliefert hat.
  const [loaded, setLoaded] = useState<PlaylistDialogState>({ kind: "closed" });
  const loading = useRef<AbortController>(undefined);
  const dialog: PlaylistDialogState =
    loaded.kind !== "closed"
      ? loaded
      : state.preview && state !== dismissed
        ? { kind: "preview", view: state.preview }
        : loaded;

  const closeDialog = () => {
    loading.current?.abort();
    loading.current = undefined;
    setLoaded({ kind: "closed" });
    setDismissed(state);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget);
    const url = String(data.get("url") ?? "").trim();
    const media = parseMedia({ mediaType: data.get("mediaType"), resolution: data.get("resolution") });
    if (!isPlaylistLink(url) || !media) return;
    event.preventDefault();
    void loadPreview(url, media);
  };

  const loadPreview = async (url: string, media: Media) => {
    const controller = new AbortController();
    loading.current = controller;
    setDismissed(state);
    setLoaded({ kind: "loading" });
    // Bleibt leer, wenn die Vorschau nicht ankommt. Am Link liegt es dann nicht, also nicht „No downloadable media“.
    let result: LoadResult | undefined;
    try {
      const response = await fetch("/api/playlist-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, ...media }),
        signal: controller.signal,
      });
      // 403/415 vom Origin-Schutz, 400, 502 eines Proxys.
      if (response.ok) result = await response.json();
    } catch {
      if (controller.signal.aborted) result = { kind: "cancelled" };
    }
    if (loading.current !== controller) return;
    loading.current = undefined;
    if (!result) setLoaded({ kind: "error", message: texts.playlist.failed });
    else if (result.kind === "preview") setLoaded({ kind: "preview", view: result.view });
    else if (result.kind === "timedOut") setLoaded({ kind: "error", message: texts.playlist.timedOut, timedOut: true });
    else if (result.kind === "none") setLoaded({ kind: "error", message: texts.addForm.noMedia });
    else setLoaded({ kind: "closed" });
  };

  return (
    // Mobil dreizeilig (Link, Optionen, „Add“), breit zweizeilig mit „Add“ neben dem Link.
    <>
    <form
      action={formAction}
      onSubmit={submit}
      aria-label={texts.addForm.title}
      className="grid gap-2 rounded-lg border border-border bg-card p-3 shadow-elevation-1 sm:grid-cols-[1fr_auto] sm:gap-3 sm:p-4"
    >
      <label htmlFor="link" className="sr-only">
        {texts.addForm.linkLabel}
      </label>
      {/* Kein type="url": Kurzlinks ohne Schema und ungültige Eingaben prüft yt-dlp, nicht der Browser. */}
      <Input
        ref={input}
        id="link"
        name="url"
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        required
        disabled={pending}
        defaultValue={state.url}
        onChange={() => duplicate && setDismissed(state)}
        placeholder={texts.addForm.linkPlaceholder}
        className="sm:h-13"
      />
      <MediaOptions className="sm:col-span-2 sm:row-start-2" />
      {/* Steht vor „Add anyway“, damit Enter im Feld normal hinzufügt. */}
      <Button type="submit" size="lg" disabled={pending} className="sm:h-13">
        {pending && <LoaderCircleIcon aria-hidden className="motion-safe:animate-spin" />}
        {pending ? texts.addForm.checking : texts.addForm.add}
      </Button>

      {state.error && (
        <p role="alert" className="rounded-md bg-error px-4 py-3 text-sm text-error-foreground sm:col-span-2">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="rounded-md bg-muted px-4 py-3 text-sm text-foreground-secondary sm:col-span-2">
          {state.notice}
        </p>
      )}
      {mixed?.added && (
        <MixedHint
          title={mixed.added}
          pending={pending}
          onLoad={() => loadPreview(mixed.link, mixed.media)}
          onDismiss={() => setDismissed(state)}
        />
      )}
      {duplicate && (
        <DuplicateAlert
          duplicate={duplicate}
          pending={pending}
          onLoadPlaylist={mixed && (() => loadPreview(mixed.link, mixed.media))}
          onCancel={() => {
            setDismissed(state);
            if (input.current) input.current.value = "";
            input.current?.focus();
          }}
        />
      )}
    </form>
    <PlaylistDialog
      state={dialog}
      onCancel={closeDialog}
      onAdded={() => {
        closeDialog();
        if (input.current) input.current.value = "";
      }}
    />
    </>
  );
}

/**
 * Inline-Warnung statt Dialog. „Add anyway“ schickt das Formular mit dem Schlüssel des
 * gewarnten Mediums noch einmal ab, „Show existing“ springt zum vorhandenen Eintrag.
 */
function DuplicateAlert({
  duplicate,
  pending,
  onLoadPlaylist,
  onCancel,
}: {
  duplicate: DuplicateWarning;
  pending: boolean;
  /** Nur bei einem Video in einer Playlist: Wer das Video schon hat, kommt so an die Playlist. */
  onLoadPlaylist?: () => void;
  onCancel: () => void;
}) {
  const { kind, title, position, ageMs } = duplicate;
  const media = mediaLabel(duplicate);
  const sentence =
    kind === "downloaded"
      ? texts.duplicate.exists(title, media, formatAge(ageMs ?? 0))
      : duplicate.state === "running" || position === undefined
        ? texts.duplicate.running(title, media)
        : texts.duplicate.waiting(title, media, position);

  return (
    <div role="alert" className="flex gap-3 rounded-md bg-warning px-4 py-3.5 text-warning-foreground sm:col-span-2">
      <TriangleAlertIcon aria-hidden strokeWidth={1.75} className="size-5 flex-none" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="[overflow-wrap:anywhere]">
          <strong className="block font-bold">{texts.duplicate[kind]}</strong>
          {sentence}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="addAnyway" value={duplicate.key} disabled={pending}>
            {texts.duplicate.addAnyway}
          </Button>
          {onLoadPlaylist && (
            <Button type="button" variant="quiet" disabled={pending} onClick={onLoadPlaylist}>
              {texts.mixed.loadPlaylist}
            </Button>
          )}
          <Button type="button" variant="quiet" disabled={pending} onClick={onCancel}>
            {texts.duplicate.cancel}
          </Button>
          {kind === "downloaded" && (
            <a
              href={`#entry-${duplicate.entryId}`}
              className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold underline underline-offset-3"
            >
              {texts.duplicate.showExisting}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** Hinweis nach dem Einreihen eines Videos aus einem gemischten Link. */
function MixedHint({
  title,
  pending,
  onLoad,
  onDismiss,
}: {
  title: string;
  pending: boolean;
  onLoad: () => void;
  onDismiss: () => void;
}) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-md bg-muted px-4 py-3.5 text-sm text-foreground sm:col-span-2">
      <p className="[overflow-wrap:anywhere]">{texts.mixed.added(title)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onLoad}>
          {texts.mixed.loadPlaylist}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onDismiss}>
          {texts.mixed.dismiss}
        </Button>
      </div>
    </div>
  );
}
