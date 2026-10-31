/** A full visible day takes five minutes of foreground play. Offline work
 * keeps its own simulation clocks; scenery never catches up while away. */
import type { Settings } from "./settings.ts";
export const DAY_MS = 5 * 60 * 1000;
export const TIMES_OF_DAY = ["day", "sunset", "dusk", "twilight", "night", "dawn"] as const;
export type TimeOfDay = typeof TIMES_OF_DAY[number];
export type Sun = { x: number; y: number; strength: number };
type RGB = readonly [number, number, number];
export type DaySky = { phase: TimeOfDay; daylight: number; night: number; tint: { color: string; strength: number }; rgb: RGB; warmth: number; sun: Sun; sunX: number; altitude: number; time: number };
const FIXED: Record<TimeOfDay, number> = { day: 0, sunset: .42, dusk: .5, twilight: .57, night: .73, dawn: .91 };
const KEYS: readonly (readonly [number, number, RGB, number, number, number])[] = [
  [0, 1, [255, 244, 218], 0, 0, 1],
  [.28, 1, [255, 230, 182], .04, .65, .7],
  [.42, .65, [244, 149, 77], .38, .95, .16],
  [.5, .28, [177, 105, 148], .3, 1, -.02],
  [.57, .1, [103, 105, 174], .23, .8, -.25],
  [.65, 0, [49, 63, 108], .12, .3, -.8],
  [.83, 0, [49, 63, 108], .12, -.6, -.6],
  [.91, .4, [245, 169, 108], .22, -.96, .12],
  [1, 1, [255, 244, 218], 0, 0, 1],
];
const WARMTH = [0, .08, .8, .3, 0, 0, 0, .75, 0];
export const dayTime = (ms: number) => Number.isFinite(ms) ? ((ms % DAY_MS) + DAY_MS) % DAY_MS : 0;
export function skyAtTime(ms: number, fixed?: TimeOfDay): DaySky {
  const time = fixed ? FIXED[fixed] * DAY_MS : dayTime(ms), p = time / DAY_MS;
  let i = 0;
  while (i + 1 < KEYS.length - 1 && KEYS[i + 1][0] <= p) i++;
  const a = KEYS[i], b = KEYS[i + 1], u = (p - a[0]) / (b[0] - a[0]), t = u * u * (3 - 2 * u);
  const mix = (x: number, y: number) => x + (y - x) * t;
  const light = mix(a[1], b[1]), rgb = a[2].map((v, k) => Math.round(mix(v, b[2][k]))) as unknown as RGB;
  const sunX = mix(a[4], b[4]), altitude = mix(a[5], b[5]), length = .35 + 2 * (1 - Math.max(0, altitude));
  const phase: TimeOfDay = fixed ?? (p < .35 || p >= .97 ? "day" : p < .46 ? "sunset" : p < .535 ? "dusk" : p < .62 ? "twilight" : p < .87 ? "night" : "dawn");
  return { phase, daylight: light, night: 1 - light, rgb, time, warmth: mix(WARMTH[i], WARMTH[i + 1]),
    tint: { color: `rgb(${rgb.join(',')})`, strength: mix(a[3], b[3]) }, sunX, altitude,
    sun: { x: -sunX * length, y: length * .6, strength: altitude <= 0 ? 0 : Math.min(.27, altitude * 1.7) } };
}

export class DayClock {
  elapsed: number;
  private last: number | null = null;
  constructor(elapsed = 0) { this.elapsed = dayTime(elapsed); }
  reset() { this.last = null; }
  advance(now: number, visible: boolean, running: boolean) {
    if (!Number.isFinite(now)) { this.reset(); return; }
    if (this.last !== null && visible && running) this.elapsed = dayTime(this.elapsed + Math.max(0, now - this.last));
    this.last = visible ? now : null;
  }
}

let runtime: { clock: DayClock; settings: () => Pick<Settings, "dayNightCycle" | "timeOfDay"> } | null = null;
export function useDayClock(clock: DayClock, settings: () => Pick<Settings, "dayNightCycle" | "timeOfDay">) { runtime = { clock, settings }; }
export function worldSky(): DaySky | null {
  if (!runtime) return null;
  const settings = runtime.settings();
  return skyAtTime(runtime.clock.elapsed, settings.dayNightCycle ? undefined : settings.timeOfDay);
}
export const visualTime = (fallback: number) => worldSky()?.time ?? dayTime(fallback);
export const daylight = (now: number) => (worldSky() ?? skyAtTime(now)).daylight;
/** Legacy economic day: visual settings never rewrite idle production. */
export function simulationDaylight(now: number) {
  return Math.min(1, Math.max(0, .5 + Math.sin(((now % (8 * 60 * 1000)) / (8 * 60 * 1000)) * Math.PI * 2) * 1.4));
}
