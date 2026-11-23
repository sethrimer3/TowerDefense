/** The game's clock, which the device's clock cannot move forward.
 *
 * Idle time (the Mine's and the Library's catch-up, the idle bank), timed
 * upgrade work and the Shop's ad cooldown all read `GameClock.now()`. It
 * runs on the page's monotonic timer (`performance.now()`), so setting the
 * device's clock while the game is open changes nothing, and it moves
 * forward past that only to a time a server vouches for: the `Date` header
 * of an HTTPS response (`fetchTrustedTime`). The time the game last saw is
 * saved, and the clock never runs back behind it, so a clock set forward
 * once and back again pays nothing until real time catches up.
 *
 * Closed or asleep, the game earns its idle time as before, but it is paid
 * when a server confirms the time: at once when online, otherwise held and
 * paid in full the next time the game reaches one. Time zones and daylight
 * saving never matter (all times are UTC milliseconds), and a device clock
 * that is merely wrong costs an honest player nothing. */

/** Device and monotonic time disagreeing by more than this (the device
 * slept, or its clock was changed) asks a server again. */
export const DRIFT_MS = 60 * 1000;
/** Shortest wait between two asks of a server. */
export const RETRY_MS = 30 * 1000;
/** Longest wait between retries while no server answers. */
export const MAX_RETRY_MS = 10 * 60 * 1000;

export type ClockSource = {
  /** Monotonic ms (`performance.now()`): unaffected by the device clock. */
  mono: () => number;
  /** The device's clock (`Date.now()`): only for noticing it jump. */
  device: () => number;
};

export class GameClock {
  /** Game ms at `anchorMono`. */
  private base: number;
  private anchorMono: number;
  private anchorDevice: number;
  /** Whether a server has vouched for the time this session. */
  verified = false;

  /** Starts at `seen`, the latest time the game saw (saved), held there
   * until a server says how much time has passed since. A `provisional`
   * start (a new game, which has earned nothing yet, starting from the
   * device clock) may be set back by the server, once. */
  constructor(seen: number, private readonly src: ClockSource, private provisional = false) {
    this.base = seen;
    this.anchorMono = src.mono();
    this.anchorDevice = src.device();
  }

  now() {
    return this.base + Math.max(0, this.src.mono() - this.anchorMono);
  }

  /** A server says it is `serverMs`: the clock moves forward to it, never
   * back. Returns how far it moved (the time to pay as idle time). */
  trust(serverMs: number) {
    if (!Number.isFinite(serverMs)) return 0;
    const now = this.now();
    this.verified = true;
    this.anchorMono = this.src.mono();
    this.anchorDevice = this.src.device();
    this.base = this.provisional ? serverMs : Math.max(now, serverMs);
    this.provisional = false;
    return Math.max(0, this.base - now);
  }

  /** How far the device clock ran ahead of the monotonic one since the last
   * anchor: the device slept, or its clock was set forward. Either way, only
   * a server can say how much of it was real. */
  drift() {
    return (this.src.device() - this.anchorDevice) - (this.src.mono() - this.anchorMono);
  }
}

/** The time to start the clock from: the latest time the save saw, or for a
 * save from before this clock, its last save time; `fallback` (the device
 * clock) for a new game, which has no idle time to claim. */
export function startTime(seen: number, lastSaved: number, fallback: number) {
  if (seen > 0) return seen;
  if (lastSaved > 0) return lastSaved;
  return fallback;
}

/** Reads an HTTP `Date` header ("Mon, 23 Nov 2026 21:38:16 GMT") as ms,
 * moved half a second on for its whole-second rounding and `rttMs / 2` for
 * the trip back. NaN when missing or malformed. */
export function headerTime(date: string | null | undefined, rttMs = 0) {
  if (!date) return NaN;
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? ms + 500 + Math.max(0, rttMs) / 2 : NaN;
}

/** Where the app asks the time: the game's own site. */
export const TIME_URL = "https://sethrimer3.github.io/TowerDefense/";

type NativeHttp = { request(o: { url: string; method: string; headers?: Record<string, string> }): Promise<{ headers: Record<string, string> }> };

/** Asks a server the time: the page's own site in a browser (same origin,
 * so its `Date` header can be read), the game's site through the native
 * HTTP plugin inside the Android app (whose page is served from the device
 * itself). NaN when offline or unreachable. */
export async function fetchTrustedTime(native: boolean, timeoutMs = 8000): Promise<number> {
  const start = performance.now();
  try {
    if (native) {
      const { CapacitorHttp } = await import("@capacitor/core") as unknown as { CapacitorHttp: NativeHttp };
      const res = await Promise.race([
        CapacitorHttp.request({ url: `${TIME_URL}?t=${Date.now()}`, method: "HEAD", headers: { "Cache-Control": "no-store" } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
      ]);
      const date = Object.entries(res.headers ?? {}).find(([k]) => k.toLowerCase() === "date")?.[1];
      return headerTime(date, performance.now() - start);
    }
    if (!/^https?:$/.test(location.protocol)) return NaN;
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const res = await fetch(`./?t=${Date.now()}`, { method: "HEAD", cache: "no-store", signal: abort.signal });
      return headerTime(res.headers.get("date"), performance.now() - start);
    } finally { clearTimeout(timer); }
  } catch {
    return NaN;
  }
}
