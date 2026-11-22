/**
 * After a deploy, a page opened earlier still asks for the old build's code files, which no longer exist: the screen
 * would stay blank. Reload once to get the new build; a second failure soon after is a real outage, so it is not retried.
 */
const KEY = 'fasal-stale-reload-at';
const WINDOW_MS = 60_000;

export interface ReloadDeps { now: () => number; get: () => string | null; set: (v: string) => void; reload: () => void }

/**
 * True when it reloaded. The guard must be saved first: with storage blocked nothing survives the reload, so a
 * missing file would reload forever. Then the page stays as it is and the person reloads by hand.
 */
export function reloadOnceForStaleBuild(d: ReloadDeps): boolean {
  try {
    const now = d.now();
    if (now - Number(d.get() ?? 0) < WINDOW_MS) return false;
    d.set(String(now));
    if (d.get() !== String(now)) return false;
  } catch {
    return false;
  }
  d.reload();
  return true;
}

const browserDeps = (): ReloadDeps => ({
  now: () => Date.now(),
  get: () => sessionStorage.getItem(KEY),
  set: (v) => sessionStorage.setItem(KEY, v),
  reload: () => location.reload(),
});

/** Wraps a lazy screen import: on a missing code file, reload once for the new build, otherwise pass the error on. */
export function importOrReload<T>(load: () => Promise<T>): () => Promise<T> {
  return () => load().catch((e: unknown) => {
    if (reloadOnceForStaleBuild(browserDeps())) return new Promise<T>(() => {}); // the page is reloading
    throw e;
  });
}

/** Vite reports a failed preload of a code file with this event; same handling. */
export function listenForStaleBuild() {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadOnceForStaleBuild(browserDeps())) e.preventDefault();
  });
}
