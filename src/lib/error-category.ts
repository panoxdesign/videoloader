/**
 * Fehlerkategorien eines fehlgeschlagenen Queue-Eintrags. Die Kurzmeldung dazu steht in
 * `texts.errors`. Die meisten ordnet `classifyError` zu, `live` und `justEnded` setzt der Worker,
 * wenn die Prüfung vor dem Start einen Stream findet.
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
  "justEnded",
  "other",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];
