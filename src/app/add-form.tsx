"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { texts } from "@/lib/texts";
import { addEntry } from "./actions";
import { MediaOptions } from "./media-options";

/**
 * Formular-Karte „Add a download“. Solange die Prüfung läuft, sind Feld und „Add“ gesperrt,
 * ein Doppelklick erzeugt also keinen zweiten Eintrag.
 */
export function AddForm() {
  const [state, formAction, pending] = useActionState(addEntry, {});

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
        placeholder={texts.addForm.linkPlaceholder}
        className="sm:h-13"
      />
      <MediaOptions className="sm:col-span-2 sm:row-start-2" />
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
    </form>
  );
}
