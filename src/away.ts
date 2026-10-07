/** Time away from the game: how much of it the Mine and the Library work
 * through, and how it reads on the welcome-back screen. */

/** Longest unused idle-time bank for each simulation. */
export const MAX_AWAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
/** Maximum simulation speed while spending banked idle time. */
export const IDLE_SPEED = 120;
/** How far ahead (ms of idle time) the Mine or the Library may spend its
 * idle time before waiting for the other, so the two run down together. */
export const IDLE_LEAD = 1000;
export const countdown = (ms: number) => {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

/** A stretch of time in words: "3 h 12 min", "45 min", "under a minute". */
export function span(ms: number) {
  const mins = Math.floor(Math.max(0, ms) / 60000), h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return mins === 0 ? "under a minute" : `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
