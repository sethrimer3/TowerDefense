/** Startup safeguards: nothing the boot screen waits on may hold it forever. */

/** Resolves with the promise's value, or with `fallback` once `ms` pass first.
 * A rejection still rejects, so a real failure is never mistaken for slowness. */
export function within<T>(promise: Promise<T>, ms: number, fallback: T, timer = setTimeout): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = timer(() => resolve(fallback), ms);
    promise.then(value => { clearTimeout(id); resolve(value); }, error => { clearTimeout(id); reject(error); });
  });
}

const RETRY_KEY = "towerdefense.bootRetry";
/** At most one automatic reload in this long, so a lasting fault shows the button instead of looping. */
export const RETRY_GAP_MS = 60_000;

/** Whether a stalled or failed start may reload by itself now; records the attempt. */
export function mayAutoReload(storage: Pick<Storage, "getItem" | "setItem"> | null, now: number): boolean {
  try {
    if (!storage) return false;
    const last = Number(storage.getItem(RETRY_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < RETRY_GAP_MS) return false;
    storage.setItem(RETRY_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
