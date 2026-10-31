/**
 * Reine Link-Erkennung: Ist der Link eine reine Playlist? Dann lädt „Add“ die Vorschau über den
 * Route Handler mit „Cancel“ (ADR 0002). Alle anderen Links prüft die Server Action.
 */
export function isPlaylistLink(link: string) {
  const url = URL.parse(link);
  if (!url || !isYouTube(url.hostname)) return false;
  const { pathname, searchParams } = url;
  if (!searchParams.has("list")) return false;
  return pathname === "/playlist" || (pathname === "/watch" && !searchParams.has("v"));
}

function isYouTube(host: string) {
  return host === "youtube.com" || host.endsWith(".youtube.com");
}
