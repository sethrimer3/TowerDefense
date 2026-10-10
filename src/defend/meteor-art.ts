/** The Meteor strike as it is drawn, in the city's pixel art (`ART` pixels a
 * cell, snapped to whole screen pixels):
 *
 * - **Falling:** a cracked rock (or, as a Frost comet, a ball of ice) in a
 *   black outline, glowing hot on its leading edge, coming down from the
 *   upper right on a trail of fire puffs that cool to smoke (or of frost
 *   cooling to mist); below it, where it will land, a shadow growing darker
 *   and a dashed ring of its reach.
 * - **Landing:** the battle's usual blast and scorch (`blast-art.ts`), and
 *   over them a ring of dust (or frost) rushing out to the reach with rocks
 *   (or shards) flung from the middle.
 *
 * Presentation only: it reads the sim and draws from hashes of the battle's
 * time and each meteor's seed, never from a random stream. */
import { hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { FLAME, OUTLINE, SMOKE, artPen, bake, blit, puff } from "./pixel-fx.ts";
import { IMPACT_SHOW, type Impact, type Meteor, type MeteorLook } from "./meteor.ts";
import type { CarriedLight } from "./lighting.ts";
import type { ReliefLight } from "./ground-relief.ts";
import type { DefendSim } from "./sim.ts";

type Ctx = CanvasRenderingContext2D;

/** Ice, darkest to brightest. */
const ICE = ["#1b3a5c", "#3f7fb8", "#8fd0f0", "#d8f4ff", "#ffffff"];
const MIST = ["#5a7890", "#7d9bb0", "#a6c2d4", "#cfe2ec"];
const ROCK = ["#2a1e1a", "#4a3328", "#6b4e3c", "#9a7a5a"];
/** Cells a meteor starts above where it lands, and how far right of it. */
const HEIGHT = 9, SLANT = 0.55;

/** Where a falling meteor is drawn: its spot on the ground, and how high
 * over it (in cells) it still is. */
export function meteorAt(m: Meteor) {
  const h = HEIGHT * Math.max(0, 1 - m.t / m.fall);
  return { gx: m.x, gy: m.y, h, x: m.x + h * SLANT, y: m.y - h };
}

const bodies = new Map<string, HTMLCanvasElement>();
/** A meteor's body, `d` art pixels across: lit from its leading (lower
 * left) edge, with seams of fire (or a glint) in one of three patterns. */
function body(look: MeteorLook, d: number, variant: number) {
  const key = `${look}:${d}:${variant}`;
  let cv = bodies.get(key);
  if (cv) return cv;
  const { cv: canvas, c } = bake(d, d);
  const mid = (d - 1) / 2, r = d / 2;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < d && y < d && (x - mid) * (x - mid) + (y - mid) * (y - mid) <= r * r - 0.3;
  for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    // Leading edge: down and to the left, the way it falls.
    const lead = ((mid - x) + (y - mid)) / (2 * r);
    let colour: string;
    if (edge) colour = OUTLINE;
    else if (look === "ice") colour = lead > 0.3 ? ICE[4] : lead > 0.05 ? ICE[3] : lead > -0.25 ? ICE[2] : ICE[1];
    else {
      const seam = hash01(variant, x, y) < 0.16 && lead > -0.35;
      colour = lead > 0.32 ? FLAME[3] : lead > 0.18 ? FLAME[2] : seam ? FLAME[1] : lead > -0.1 ? ROCK[3] : lead > -0.3 ? ROCK[2] : ROCK[1];
    }
    c.fillStyle = colour;
    c.fillRect(x, y, 1, 1);
  }
  // A glint at the upper left of the ice; a white-hot heart in the rock's lead.
  c.fillStyle = look === "ice" ? ICE[4] : FLAME[4];
  if (look === "ice") c.fillRect(Math.round(mid - r / 2), Math.round(mid - r / 2), 1, 1);
  else c.fillRect(Math.round(mid - r / 3), Math.round(mid + r / 3), 1, 1);
  bodies.set(key, canvas);
  return canvas;
}

/** Every meteor still falling: the shadow and ring where it will land, its
 * trail and its body. */
export function drawMeteors(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.meteors.length) return;
  const dot = artPen(c, px);
  // Shadows and rings first, under every meteor.
  for (const m of sim.meteors) {
    const p = Math.min(1, m.t / m.fall), gx = Math.round(m.x * ART), gy = Math.round(m.y * ART);
    const s = Math.max(1, Math.round(m.size * 5 * (0.3 + 0.7 * p)));
    c.fillStyle = `rgba(0,0,0,${(0.15 + 0.35 * p).toFixed(3)})`;
    for (let y = -s; y <= s; y++) for (let x = -s * 2; x <= s * 2; x++) {
      if (x * x + 4 * y * y > 4 * s * s || (x + y) & 1 && p < 0.7) continue;
      dot(gx + x, gy + y);
    }
    c.save();
    c.globalAlpha = 0.25 + 0.5 * p;
    c.strokeStyle = m.look === "ice" ? ICE[2] : FLAME[2];
    c.lineWidth = Math.max(1, Math.round(px / ART));
    c.setLineDash([px * 0.3, px * 0.3]);
    c.lineDashOffset = -m.t * px * 2;
    c.beginPath();
    c.arc(m.x * px, m.y * px, m.r * px, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  for (const m of sim.meteors) {
    const at = meteorAt(m), d = m.size >= 1 ? 11 : 6, tick = Math.floor(sim.time * 30);
    const hot = m.look === "ice" ? ICE : FLAME, cool = m.look === "ice" ? MIST : SMOKE;
    // The trail, back up the way it came: hot puffs near it, cooling behind.
    // One outline round the whole trail, then the puffs inside it.
    const n = m.size >= 1 ? 14 : 9, puffs: { ax: number; ay: number; r: number; colour: string }[] = [];
    for (let i = n; i >= 1; i--) {
      const back = i * 0.3 * m.size;
      const jx = (hash01(m.seed, i, tick) - 0.5) * 2.5, jy = (hash01(m.seed, i, tick, 1) - 0.5) * 2.5;
      const ax = Math.round((at.x + back * SLANT) * ART + jx), ay = Math.round((at.y - back) * ART + jy);
      const k = i / n, r = Math.max(0, Math.round((1 - k * 0.85) * (m.size >= 1 ? 3 : 2)));
      const colour = k > 0.7 ? cool[Math.min(cool.length - 1, Math.floor((1 - k) * 10))] : hot[k < 0.15 ? 3 : k < 0.35 ? 2 : k < 0.55 ? 1 : 0];
      puffs.push({ ax, ay, r, colour });
    }
    c.fillStyle = OUTLINE;
    for (const p of puffs) if (p.colour !== cool[0]) puff(dot, p.ax, p.ay, p.r + 1);
    for (const p of puffs) {
      c.fillStyle = p.colour;
      puff(dot, p.ax, p.ay, p.r);
    }
    blit(c, px, body(m.look, d, m.seed % 3), Math.round(at.x * ART - d / 2), Math.round(at.y * ART - d / 2));
  }
}

/** Each landing still spreading: a ring rushing out, and rocks (or
 * shards) flung from the middle, falling back. */
export function drawImpacts(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.impacts.length) return;
  const dot = artPen(c, px);
  for (const m of sim.impacts) {
    const k = m.t / IMPACT_SHOW, ice = m.look === "ice";
    c.save();
    c.globalAlpha = 0.85 * (1 - k);
    c.strokeStyle = ice ? ICE[3] : "#c8a87a";
    c.lineWidth = Math.max(1, Math.round((px / ART) * 2));
    c.beginPath();
    c.arc(m.x * px, m.y * px, m.r * px * (0.35 + 0.75 * Math.min(1, k * 1.6)), 0, Math.PI * 2);
    c.stroke();
    c.restore();
    const n = m.size >= 1 ? 10 : 6, seed = Math.floor(m.x * 97 + m.y * 31);
    for (let i = 0; i < n; i++) {
      const a = ((i + hash01(seed, i) * 0.6) / n) * Math.PI * 2, far = m.r * (0.5 + 0.6 * hash01(seed, i, 1)) * k;
      const lift = Math.sin(Math.PI * Math.min(1, k * 1.2)) * (0.6 + hash01(seed, i, 2) * 0.6);
      const ax = Math.round((m.x + Math.cos(a) * far) * ART), ay = Math.round((m.y + Math.sin(a) * far * 0.7 - lift) * ART);
      if (k > 0.85) c.globalAlpha = (1 - k) / 0.15;
      c.fillStyle = OUTLINE;
      dot(ax - 1, ay - 1, 4, 4);
      c.fillStyle = ice ? ICE[i % 2 ? 3 : 2] : i % 3 ? ROCK[2] : FLAME[2];
      dot(ax, ay, 2, 2);
      c.globalAlpha = 1;
    }
  }
}

/** Falling meteors light the ground under them and the air round them; a
 * landing flashes. */
export function meteorLights(sim: DefendSim): { carried: CarriedLight[]; relief: ReliefLight[] } {
  const carried: CarriedLight[] = [], relief: ReliefLight[] = [];
  for (const m of sim.meteors) {
    const at = meteorAt(m), p = Math.min(1, m.t / m.fall), ice = m.look === "ice";
    carried.push({ x: at.x, y: at.y, id: m.seed % 100000, r: 2 + 1.2 * m.size, k: 1 });
    relief.push({ x: m.x, y: m.y, r: 1 + m.r * p, k: 0.9 * p, color: ice ? "#9fdcff" : "#ffa45a" });
  }
  for (const m of sim.impacts) {
    const k = 1 - m.t / IMPACT_SHOW;
    relief.push({ x: m.x, y: m.y, r: m.r * 1.6, k: 1.1 * k, color: m.look === "ice" ? "#bfe8ff" : "#ffb36b" });
  }
  return { carried, relief };
}
