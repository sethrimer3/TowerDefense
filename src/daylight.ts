/** One day and night, in ms of wall-clock time, shared by the rooms. */
export const DAY_MS = 8 * 60 * 1000;

/** Daylight in [0, 1]: a long day, a long night, dawn and dusk between. */
export function daylight(now: number) {
  const s = Math.sin(((now % DAY_MS) / DAY_MS) * Math.PI * 2);
  return Math.min(1, Math.max(0, 0.5 + s * 1.4));
}
