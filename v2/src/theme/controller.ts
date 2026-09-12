import { resolveAutoTheme } from "./auto";
import { resolveTimeZone } from "./timezones";
import { readPreference, THEME_STORAGE_KEY, type ThemePreference } from "./preference";

export type { ThemePreference } from "./preference";
export { THEME_STORAGE_KEY } from "./preference";
export interface ThemeState {
  readonly preference: ThemePreference;
  readonly effective: "light" | "dark";
}
export interface ThemeController {
  getState(): ThemeState;
  setPreference(preference: ThemePreference): void;
  subscribe(listener: (state: ThemeState) => void): () => void;
  destroy(): void;
}

// A sparse clock/timezone watchdog also covers midnight and polar seasons.
const CLOCK_CHECK_INTERVAL = 60 * 60 * 1000;

export function createThemeController(host: Window = window, page: Document = document): ThemeController {
  let preference = readPreference(host);
  let state: ThemeState;
  let timer: number | undefined;
  let destroyed = false;
  const listeners = new Set<(state: ThemeState) => void>();
  const update = () => {
    if (destroyed) return;
    host.clearTimeout(timer);
    timer = undefined;
    const now = Date.now();
    const resolved = preference === "auto"
      ? resolveAutoTheme(now, resolveTimeZone())
      : { effective: preference };
    const changed = !state || state.preference !== preference || state.effective !== resolved.effective;
    state = Object.freeze({ preference, effective: resolved.effective });
    page.documentElement.dataset.theme = state.effective;
    if (preference === "auto" && !page.hidden) {
      const transition = "nextTransition" in resolved ? resolved.nextTransition : undefined;
      const delay = transition !== undefined && Number.isFinite(transition) && transition > now
        ? Math.min(CLOCK_CHECK_INTERVAL, transition - now)
        : CLOCK_CHECK_INTERVAL;
      timer = host.setTimeout(update, Math.max(1, delay));
    }
    if (changed) for (const listener of listeners) listener(state);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    try { if (event.storageArea !== host.localStorage) return; }
    catch { return; }
    preference = readPreference(host);
    update();
  };
  host.addEventListener("storage", onStorage);
  host.addEventListener("focus", update);
  host.addEventListener("pageshow", update);
  page.addEventListener("visibilitychange", update);
  // Synchronous initialization precedes application DOM creation.
  update();
  return {
    getState: () => state,
    setPreference(value) {
      if (destroyed) return;
      preference = value;
      try { host.localStorage.setItem(THEME_STORAGE_KEY, preference); }
      catch { /* A blocked/full storage still allows an in-memory manual choice. */ }
      update();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
    destroy() {
      destroyed = true;
      host.clearTimeout(timer);
      host.removeEventListener("storage", onStorage);
      host.removeEventListener("focus", update);
      host.removeEventListener("pageshow", update);
      page.removeEventListener("visibilitychange", update);
      listeners.clear();
    },
  };
}
