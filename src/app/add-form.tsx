"use client";

import { LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAge } from "@/lib/queue-view";
import { texts } from "@/lib/texts";
import { addEntry, type AddState, type DuplicateWarning } from "./actions";
import { MediaOptions } from "./media-options";

/**
 * Formular-Karte „Add a download“. Solange die Prüfung läuft, sind Feld und „Add“ gesperrt,
 * ein Doppelklick erzeugt also keinen zweiten Eintrag.
 */
export function AddForm() {
  const [state, formAction, pending] = useActionState(addEntry, {});
  // „Cancel“ und jede Änderung am Link blenden die Warnung aus, bis die nächste Antwort kommt.
  const [dismissed, setDismissed] = useState<AddState>();
  const duplicate = state === dismissed ? undefined : state.duplicate;
  const input = useRef<HTMLInputElement>(null);

  return (
    // Mobil dreizeilig (Link, Optionen, „Add“), breit zweizeilig mit „Add“ neben dem Link.
    <form
      action={formAction}
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
      {duplicate && (
        <DuplicateAlert
          duplicate={duplicate}
          pending={pending}
          onCancel={() => {
            setDismissed(state);
            if (input.current) input.current.value = "";
            input.current?.focus();
          }}
        />
      )}
    </form>
  );
}

/**
 * Inline-Warnung statt Dialog. „Add anyway“ schickt das Formular mit dem Schlüssel des
 * gewarnten Mediums noch einmal ab, „Show existing“ springt zum vorhandenen Eintrag.
 */
function DuplicateAlert({
  duplicate,
  pending,
  onCancel,
}: {
  duplicate: DuplicateWarning;
  pending: boolean;
  onCancel: () => void;
}) {
  const { kind, title, position, ageMs } = duplicate;
  const media = `${texts.media.row[duplicate.mediaType]} · ${
    duplicate.resolution ? texts.media.resolutions[duplicate.resolution] : texts.media.row.mp3
  }`;
  const sentence =
    kind === "downloaded"
      ? texts.duplicate.exists(title, media, formatAge(ageMs ?? 0, texts.language))
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
