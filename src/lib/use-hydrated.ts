import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` beim Server-Rendern und während der Hydration, danach `true`. Für Ausgaben
 * per `Intl` im Locale des Browsers, die sonst nicht zum Server-HTML passen.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
