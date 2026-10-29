/** Presentation driven only by time left in the raid. */
const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
export const SIEGE_CLEAR = Object.freeze({ rain: false, clear: true });
export function siegeSky(left: number) {
  left = Number.isFinite(left) ? Math.max(0, Math.min(120, left)) : 120;
  const sunset = smooth((70 - left) / 3), dusk = smooth((48 - left) / 6), night = smooth((45 - left) / 25);
  const rgb = [224, 128, 58].map((v, i) => Math.round(v + ([87, 91, 153][i] - v) * dusk));
  const phase = left <= 20 ? 'night' : left <= 45 ? 'dusk' : left <= 70 ? 'sunset' : 'day';
  return {
    phase, night,
    tint: { color: `rgb(${rgb.join(',')})`, strength: 0.24 * sunset * (1 - night * 0.35) },
    sun: { x: 0.4 + sunset * 1.5, y: 0.5 + sunset * 1.4, strength: 0.24 * (1 - night) },
  };
}
