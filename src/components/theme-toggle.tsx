"use client";

import { ContrastIcon, MoonIcon, SunIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { texts } from "@/lib/texts";
import { applyTheme, THEME_STORAGE_KEY, THEMES, type Theme } from "@/lib/theme";

const CHANGE_EVENT = "videoloader:theme";
const ICONS = { system: ContrastIcon, light: SunIcon, dark: MoonIcon } satisfies Record<Theme, unknown>;

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ohne localStorage gilt die Wahl nur bis zum Neuladen.
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Folgt der Systemeinstellung und Änderungen aus anderen Tabs. */
function subscribe(onChange: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const reapply = () => {
    applyTheme(readTheme());
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) reapply();
  };
  media.addEventListener("change", reapply);
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", reapply);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as const);
  const Icon = ICONS[theme];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={`${texts.theme.label}: ${texts.theme[theme]}`} />}
      >
        <Icon strokeWidth={1.75} className="size-5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          {THEMES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {texts.theme[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
