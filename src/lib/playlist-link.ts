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

/**
 * Reine Link-Erkennung: Trägt der Link ein Video und dazu eine Playlist? Dann fragt „Add“ erst,
 * ob nur das Video oder die ganze Playlist gemeint ist. Mixe (`list=RD…`) zählen nicht: yt-dlp
 * liefert sie bei jedem Aufruf anders, mit Wiederholungen und Hunderten Einträgen (Ticket 27).
 * Andere Quellen erkennt die Funktion in V1 nicht.
 */
export function isMixedLink(link: string) {
  const url = URL.parse(link);
  if (!url) return false;
  const list = url.searchParams.get("list");
  if (!list || list.startsWith("RD")) return false;
  if (url.hostname === "youtu.be") return url.pathname.length > 1;
  return isYouTube(url.hostname) && url.pathname === "/watch" && !!url.searchParams.get("v");
}

function isYouTube(host: string) {
  return host === "youtube.com" || host.endsWith(".youtube.com");
}
