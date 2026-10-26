export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "theme";

/** Setzt `.dark` und `color-scheme` am Wurzelelement. Läuft auch als Inline-Script, darf also nichts von außen nutzen. */
export function applyTheme(theme: string | null) {
  const dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Läuft im `<head>` vor dem ersten Zeichnen, damit der Dark Mode nicht hell aufblitzt. */
export const themeScript = `try{(${applyTheme.toString()})(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}))}catch(e){}`;
