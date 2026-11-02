/**
 * Fehlerkategorien eines fehlgeschlagenen Queue-Eintrags. Die Kurzmeldung dazu steht in
 * `texts.errors`. `live` setzt der Worker selbst, wenn die Prüfung vor dem Start einen Stream findet.
 */
export const ERROR_CATEGORIES = [
  "rateLimit",
  "private",
  "unavailable",
  "geoBlocked",
  "ageRestricted",
  "botCheck",
  "loginRequired",
  "network",
  "unsupportedLink",
  "noFormat",
  "drm",
  "jsChallenge",
  "live",
  "other",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/**
 * Regex-Tabelle aus Spec „Fehlerklassifikation“, in dieser Reihenfolge geprüft. Die spezifischen
 * Kategorien stehen vor „Login nötig“, weil yt-dlp Login-Hinweise an viele Meldungen anhängt.
 * Rate-Limit erkennt Ticket 21 schon, es verhält sich aber bis Ticket 29 wie ein normaler Fehler.
 */
const PATTERNS: [Exclude<ErrorCategory, "live" | "other">, RegExp][] = [
  ["rateLimit", /This content isn't available, try again later|HTTP Error 429/i],
  ["private", /Private video/i],
  [
    "unavailable",
    /video is unavailable|Video unavailable|has been removed|account associated with this video has been terminated|no longer available|HTTP Error 404/i,
  ],
  ["geoBlocked", /not made this video available in your country|not available from your location/i],
  ["ageRestricted", /confirm your age|age-restricted|inappropriate/i],
  ["botCheck", /confirm you.re not a bot|captcha/i],
  [
    "loginRequired",
    /Use --cookies-from-browser or --cookies for the authentication|Login details are needed|not authorized|requires authentication|protected tweet/i,
  ],
  [
    "network",
    /Unable to download webpage|Connection refused|timed out|Temporary failure in name resolution|Giving up after|TransportError|A network error has occurred/i,
  ],
  ["unsupportedLink", /Unsupported URL|is not a valid URL/i],
  ["noFormat", /Requested format is not available/i],
  ["drm", /DRM protected/i],
  ["jsChallenge", /challenge|JavaScript runtime/i],
];

/**
 * Ordnet die Ausgabe von yt-dlp einer Kategorie zu, anhand der ersten Zeile, die mit `ERROR:`
 * beginnt. Folgezeilen ohne Präfix gehören zur Meldung, zählen aber nicht. `WARNING:`-Zeilen sind
 * nie ein Fehler. Ohne `ERROR:`-Zeile ist es „other“.
 */
export function classifyError(log: string): ErrorCategory {
  const line = log.split("\n").find((l) => l.startsWith("ERROR:"));
  if (!line) return "other";
  return PATTERNS.find(([, pattern]) => pattern.test(line))?.[0] ?? "other";
}
