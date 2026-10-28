"use client";

import { ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MEDIA_TYPES, RESOLUTIONS, type MediaType, type Resolution } from "@/lib/media";
import { texts } from "@/lib/texts";
import { cn } from "@/lib/utils";

/** Zweite Formularzeile: Medienart und Auflösung, ans Formular über versteckte Felder. */
export function MediaOptions({ className }: { className?: string }) {
  const [mediaType, setMediaType] = useState<MediaType>("video");
  const [resolution, setResolution] = useState<Resolution>("best");

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <input type="hidden" name="mediaType" value={mediaType} />
      {mediaType === "video" && <input type="hidden" name="resolution" value={resolution} />}

      <div className="flex gap-2 max-sm:w-full">
        <div role="group" aria-label={texts.media.label} className="flex h-11 rounded-full bg-muted p-1 max-sm:flex-1">
          {MEDIA_TYPES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === mediaType}
              onClick={() => setMediaType(option)}
              className="rounded-full px-4 font-medium text-foreground-secondary transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring aria-pressed:bg-primary aria-pressed:font-semibold aria-pressed:text-primary-foreground max-sm:flex-1"
            >
              {texts.media[option]}
            </button>
          ))}
        </div>
        {mediaType === "video" && <ResolutionMenu value={resolution} onChange={setResolution} />}
      </div>

      {mediaType === "audio" ? (
        <p className="text-foreground-secondary sm:flex sm:h-11 sm:items-center">{texts.media.audioInfo}</p>
      ) : (
        resolution === "best" && (
          <p className="flex flex-[1_1_280px] items-center gap-1.5 text-xs leading-4 font-medium text-warning-foreground">
            <TriangleAlertIcon aria-hidden strokeWidth={1.75} className="size-3.5 flex-none" />
            {texts.media.bestWarning}
          </p>
        )
      )}
    </div>
  );
}

function ResolutionMenu({ value, onChange }: { value: Resolution; onChange: (value: Resolution) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="quiet"
            aria-label={`${texts.media.resolutionLabel}: ${texts.media.resolutions[value]}`}
            className="rounded-md px-3.5 font-medium"
          />
        }
      >
        <span className="text-foreground-secondary max-sm:hidden">{texts.media.max}</span>
        {texts.media.resolutions[value]}
        <ChevronDownIcon aria-hidden strokeWidth={1.75} className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as Resolution)}>
          {RESOLUTIONS.map((option) => {
            const hint = texts.media.resolutionHints[option];
            return (
              <DropdownMenuRadioItem key={option} value={option} closeOnClick className="py-2">
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    {texts.media.resolutions[option]}
                    {option === "best" && (
                      <TriangleAlertIcon aria-hidden strokeWidth={1.75} className="size-3.5 text-warning-foreground" />
                    )}
                  </span>
                  {hint && (
                    <span
                      className={cn(
                        "text-xs leading-4 font-normal",
                        option === "best" ? "text-warning-foreground" : "text-foreground-secondary",
                      )}
                    >
                      {hint}
                    </span>
                  )}
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
