/** Area weather for DEFEND battles. Moss starts with the original 30%
 * chance of rain; cold areas snow and dry areas never rain. Weather is
 * rerolled on entering another area. Night falls over every 10th
 * wave — the boss wave — fading in as it starts and out once it's beaten. */

import { defendRandom } from "./grid.ts";
import { AREAS, type Area } from "./areas.ts";

const fx = defendRandom("effects");

export type Weather = { rain: boolean; snow?: boolean; clear?: boolean; sand?: boolean; mist?: boolean; blizzard?: boolean };

/** How often a cold area's snow comes as a blizzard. */
export const STORM_CHANCE = .3;

export function rollWeather(rand = defendRandom("rolls"), area: Area = AREAS[0]): Weather {
  const roll = rand();
  // Where other areas would storm, the cold whips the snow into a blizzard.
  if (area.climate === "cold") return roll < STORM_CHANCE ? { rain: false, snow: true, blizzard: true } : { rain: false, snow: true };
  if (area.id === "desert") return { rain: false, sand: true, clear: true };
  if (area.id === "fungal") return { rain: false, mist: true };
  return { rain: roll < area.rainChance, clear: area.climate === "dry" };
}

/** Every 10th wave is a boss wave, fought at night. */
export const isBossWave = (wave: number) => wave > 0 && wave % 10 === 0;

/** Seconds for night to fall (or lift). */
export const NIGHT_FADE_SECONDS = 2.5;

type Ambient = { rgb: [number, number, number]; alpha: number; glow: number };
const CLOUDY: Ambient = { rgb: [28, 35, 48], alpha: 0.3, glow: 0.55 };
const RAIN: Ambient = { rgb: [28, 35, 48], alpha: 0.36, glow: 0.62 };
const NIGHT: Ambient = { rgb: [8, 12, 34], alpha: 0.66, glow: 0.9 };
const NIGHT_RAIN: Ambient = { rgb: [7, 10, 24], alpha: 0.72, glow: 0.95 };

/** Darkness overlay for the lighting pass — colour, opacity, and how strong
 * the warm glow is against it — blended by how far night has fallen (0–1). */
export function ambientFor(w: Weather, night: number, previous?: Weather | null, progress = 1): { color: string; alpha: number; glow: number } {
  const a = w.clear ? { rgb: [48, 35, 24] as [number, number, number], alpha: .14, glow: .4 } : w.rain ? RAIN : CLOUDY,
    b = w.rain ? NIGHT_RAIN : NIGHT;
  const t = Math.max(0, Math.min(1, night));
  const mix = (x: number, y: number) => x + (y - x) * t;
  const [r, g, bl] = a.rgb.map((v, i) => Math.round(mix(v, b.rgb[i])));
  const current = { color: `rgb(${r},${g},${bl})`, alpha: mix(a.alpha, b.alpha), glow: mix(a.glow, b.glow) };
  if (!previous || progress >= 1) return current;
  const old = ambientFor(previous, night);
  const rgb = old.color.match(/\d+/g)!.map(Number);
  const p = Math.max(0, progress);
  return { color: `rgb(${[r, g, bl].map((v, i) => Math.round(rgb[i] + (v - rgb[i]) * p)).join(",")})`, alpha: old.alpha + (current.alpha - old.alpha) * p, glow: old.glow + (current.glow - old.glow) * p };
}

/** Name for the HUD. */
export function skyLabel(w: Weather, night: number) {
  if (w.snow) return w.blizzard || night > .5 ? "Blizzard" : "Snow";
  if (w.sand) return night > .5 ? "Sandstorm · Night" : "Sandstorm";
  if (w.mist) return night > .5 ? "Mist · Night" : "Mist";
  if (w.clear && night <= .5) return "Clear";
  return night > 0.5 ? (w.rain ? "Storm" : "Night") : w.rain ? "Rain" : "Cloudy";
}

/** Slow drifting flakes, bounded by view size, presentation only. */
/** The most flakes a view holds, at a blizzard's height. */
export const SNOW_CAP = 1400;

export class Snow {
  private flakes: { x: number; y: number; speed: number; phase: number }[] = [];
  private w = 0;
  private h = 0;
  private time = 0;
  private intensity = 0;
  update(dt: number, w: number, h: number, intensity = 0) {
    this.intensity = Math.max(0, Math.min(1, intensity));
    const count = Math.min(SNOW_CAP, Math.round(w * h / 4500 * (1 + this.intensity * 5)));
    if (w !== this.w || h !== this.h || count !== this.flakes.length) {
      this.w = w; this.h = h;
      // Preserve existing flakes while density changes during the night fade.
      this.flakes.length = Math.min(this.flakes.length, count);
      while (this.flakes.length < count) this.flakes.push({ x: fx() * w, y: fx() * h, speed: 18 + fx() * 35, phase: fx() * Math.PI * 2 });
    }
    dt = Math.max(0, Math.min(dt, .1));
    this.time += dt;
    for (const f of this.flakes) {
      f.y = (f.y + f.speed * dt * (1 + this.intensity)) % Math.max(1, h);
      f.x = (f.x + (Math.sin(this.time + f.phase) * 9 + this.intensity * (90 + 35 * Math.sin(this.time * .25))) * dt + w) % Math.max(1, w);
    }
  }
  draw(c: CanvasRenderingContext2D, px: number) {
    // Flakes are whole pixel squares; in a blizzard each drags a fading
    // streak behind it along the wind, dense but thin enough to see through.
    const size = Math.max(2, Math.round(px * .18)), streak = Math.round(this.intensity * 3);
    if (streak) {
      c.fillStyle = "rgba(200,226,250,.35)";
      for (const f of this.flakes) c.fillRect(Math.round(f.x) - size * streak, Math.round(f.y) - Math.round(size * streak / 3), size * streak, size);
    }
    c.fillStyle = "rgba(236,246,255,.85)";
    for (const f of this.flakes) c.fillRect(Math.round(f.x), Math.round(f.y), size, size);
  }
}

type Drop = { x: number; y: number; v: number; len: number };
type Splash = { x: number; y: number; t: number };

/** Falling streaks and little splash rings, in canvas pixels. */
export class Rain {
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private w = 0;
  private h = 0;

  update(dt: number, w: number, h: number) {
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      const n = Math.round((w * h) / 5200);
      this.drops = Array.from({ length: n }, () => this.drop(true));
    }
    dt = Math.min(dt, 0.1);
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x -= d.v * 0.18 * dt;
      if (d.y > this.h + d.len) {
        if (fx() < 0.35) this.splashes.push({ x: d.x, y: fx() * this.h, t: 0 });
        Object.assign(d, this.drop(false));
      }
    }
    for (const s of this.splashes) s.t += dt;
    this.splashes = this.splashes.filter((s) => s.t < 0.3);
  }

  private drop(anywhere: boolean): Drop {
    const v = this.h * (0.9 + fx() * 0.5);
    return { x: fx() * (this.w * 1.2), y: anywhere ? fx() * this.h : -fx() * this.h * 0.2, v, len: this.h * (0.012 + fx() * 0.012) };
  }

  draw(c: CanvasRenderingContext2D, px: number) {
    c.save();
    c.strokeStyle = "rgba(190,210,235,0.32)";
    c.lineWidth = Math.max(1, px * 0.06);
    c.beginPath();
    for (const d of this.drops) {
      c.moveTo(d.x, d.y);
      c.lineTo(d.x + d.len * 0.18, d.y - d.len);
    }
    c.stroke();
    c.strokeStyle = "rgba(200,220,240,0.35)";
    for (const s of this.splashes) {
      const k = s.t / 0.3;
      c.globalAlpha = 1 - k;
      c.beginPath();
      c.ellipse(s.x, s.y, px * (0.1 + k * 0.35), px * (0.05 + k * 0.17), 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  /** The grey, washed-out look of an overcast sky (stronger in rain) over
   * a W × H board. */
  static overcast(c: CanvasRenderingContext2D, strength: number, W: number, H: number) {
    c.save();
    c.globalCompositeOperation = "saturation";
    c.fillStyle = `rgba(128,128,128,${strength})`;
    c.fillRect(0, 0, W, H);
    c.restore();
  }
}
