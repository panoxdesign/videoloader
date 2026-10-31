/**
 * CSRF-Schutz für Route Handler, die etwas anstoßen (ADR 0002). Server Actions bringen ihn
 * mit, Route Handler nicht. Gleiche Regel wie bei Next für Server Actions (Doku
 * `next-config-js/serverActions.md`, „allowedOrigins“): der Host aus `Origin` muss dem
 * eigenen Host gleichen, und der kommt aus `x-forwarded-host` oder sonst `host`. Strenger
 * als Next: Fehlt `Origin`, wird abgelehnt. Browser schicken ihn bei jedem POST mit.
 * `serverActions.allowedOrigins` ist nicht gesetzt, deshalb gibt es hier keine Liste.
 */
export function isSameOrigin(headers: Headers) {
  const origin = headers.get("origin");
  // Sandbox-iframes und `data:`-Seiten schicken „null“.
  if (!origin || origin === "null") return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  // Wie Next: bei mehreren Proxys zählt der erste Eintrag.
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
  return !!host && originHost === host.toLowerCase();
}

/**
 * Nur `application/json` kommt durch. Ein fremdes Formular oder ein `text/plain`-fetch
 * kommt ohne Preflight an, `application/json` von fremder Seite nicht.
 */
export function isJsonRequest(headers: Headers) {
  const type = headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return type === "application/json";
}
