/**
 * Reine Link-Erkennung: Ist der Link eine reine Playlist? Dann lädt „Add“ die Vorschau über den
 * Route Handler mit „Cancel“ (ADR 0002). Alle anderen Links prüft die Server Action. Ein ganzer
 * Mix zählt nicht, ihn lehnt die Server Action ab (`isMixLink`).
 */
export function isPlaylistLink(link: string) {
  const list = listOnly(link);
  return !!list && !isMix(list);
}

/**
 * Reine Link-Erkennung: Ist der Link ein ganzer YouTube-Mix (`list=RD…` ohne Video)? Den lehnt
 * „Add“ ohne yt-dlp ab: yt-dlp meldet nur „This playlist type is unviewable“ (Ticket 38). Ein
 * Video aus einem Mix (`v` dazu) bleibt ein Einzelvideo. Darunter fallen auch YouTube-Music-Alben
 * (`RDCLAK…`), die V1 nicht unterstützt.
 */
export function isMixLink(link: string) {
  const list = listOnly(link);
  return !!list && isMix(list);
}

/** Die `list` eines YouTube-Links ohne Video, auf der Playlist- oder der Watch-Seite. */
function listOnly(link: string) {
  const url = URL.parse(link);
  if (!url || !isYouTube(url.hostname)) return undefined;
  const { pathname, searchParams } = url;
  const list = searchParams.get("list");
  if (!list) return undefined;
  return pathname === "/playlist" || (pathname === "/watch" && !searchParams.has("v")) ? list : undefined;
}

function isMix(list: string) {
  return list.startsWith("RD");
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
  if (!list || isMix(list)) return false;
  if (url.hostname === "youtu.be") return url.pathname.length > 1;
  return isYouTube(url.hostname) && url.pathname === "/watch" && !!url.searchParams.get("v");
}

function isYouTube(host: string) {
  return host === "youtube.com" || host.endsWith(".youtube.com");
}
