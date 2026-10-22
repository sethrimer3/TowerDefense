/** C4 nanobots' battle art (`nanobots.ts`), as pixel art at `ART` pixels a
 * cell: each shell a grey canister banded in glowing green, arcing high
 * over its dithered shadow with a trail of loose motes; each cloud a swarm
 * of single-pixel nanobots whirling round where it burst, spreading out as
 * it opens and thinning as it goes; and on every infected enemy a few green
 * motes crawling round it, blinking. Animated on battle time, seeded by
 * each cloud's seed and each enemy's id. Presentation only. */
import { enemySize } from "./catalog.ts";
import { hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { OUTLINE, artPen } from "./pixel-fx.ts";
import type { DefendSim } from "./sim.ts";
import type { NanoShell } from "./nanobots.ts";

type Ctx = CanvasRenderingContext2D;

/** The swarm's green, dark to light, and the canister's steel. */
const GREEN = ["#1e6a3a", "#3fd07a", "#8cffb4", "#e4fff0"];
const STEEL = ["#3a4250", "#7a8698", "#c4ccd8"];
/** Most motes a cloud is drawn with. */
const MOTES = 140;

/** Where a shell is a fraction `k` of its flight: on the ground and lifted on its arc. */
function shellAt(s: NanoShell, k: number) {
  const gx = s.x0 + (s.x1 - s.x0) * k, gy = s.y0 + (s.y1 - s.y0) * k;
  const lift = Math.sin(Math.PI * k) * (1.5 + Math.hypot(s.x1 - s.x0, s.y1 - s.y0) * 0.18);
  return { gx, gy, lift };
}

/** The shells, clouds and infected enemies, over the units. */
export function drawNano(c: Ctx, px: number, sim: DefendSim) {
  const infected = sim.enemies.some((e) => e.nano && e.hp > 0);
  if (!sim.nanoShells.length && !sim.nanoClouds.length && !infected) return;
  const dot = artPen(c, px), t = sim.time;
  for (const cl of sim.nanoClouds) {
    // Opening over its first half second, thinning over its last.
    const open = Math.min(1, cl.t / 0.5), left = Math.min(1, (cl.life - cl.t) / 1.2);
    const n = Math.min(MOTES, Math.round(cl.r * cl.r * 9));
    for (let i = 0; i < n; i++) {
      if (hash01(cl.seed, i, 3) > left) continue;
      const spin = (hash01(cl.seed, i, 4) - 0.5) * 2.4;
      const a = hash01(cl.seed, i, 1) * Math.PI * 2 + t * spin;
      const d = Math.sqrt(hash01(cl.seed, i, 2)) * cl.r * open;
      const wob = Math.sin(t * 7 + i) * 0.12;
      const x = Math.round((cl.x + Math.cos(a) * (d + wob)) * ART), y = Math.round((cl.y + Math.sin(a) * (d + wob)) * ART);
      c.fillStyle = GREEN[1 + Math.floor(hash01(cl.seed, i, Math.floor(t * 8)) * 3)];
      dot(x, y);
    }
  }
  for (const s of sim.nanoShells) {
    const k = s.t / s.dur, { gx, gy, lift } = shellAt(s, k);
    // Its shadow, dithered.
    c.fillStyle = "rgba(0,0,0,0.35)";
    const sx = Math.round(gx * ART), sy = Math.round(gy * ART);
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, 0], [0, 1], [-2, 1], [2, 1]]) dot(sx + ox, sy + oy);
    // A trail of loose motes.
    for (let n = 1; n <= 4; n++) {
      const p = shellAt(s, Math.max(0, k - n * 0.05));
      c.fillStyle = GREEN[n < 3 ? 2 : 1];
      dot(Math.round(p.gx * ART + Math.sin(n * 2.3 + t * 9)), Math.round((p.gy - p.lift) * ART));
    }
    // The canister: 3 × 5 inside its outline, a green band round its middle.
    const x = Math.round(gx * ART) - 2, y = Math.round((gy - lift) * ART) - 3;
    c.fillStyle = OUTLINE;
    dot(x, y, 5, 7);
    c.fillStyle = STEEL[1];
    dot(x + 1, y + 1, 3, 5);
    c.fillStyle = STEEL[2];
    dot(x + 1, y + 1, 1, 5);
    c.fillStyle = STEEL[0];
    dot(x + 3, y + 1, 1, 5);
    c.fillStyle = GREEN[2];
    dot(x + 1, y + 3, 3, 1);
  }
  if (!infected) return;
  // Three motes crawling round each host, blinking in turn.
  for (const e of sim.enemies) {
    if (!e.nano || e.hp <= 0) continue;
    const r = enemySize(e) * 0.6;
    for (let i = 0; i < 3; i++) {
      if ((Math.floor(t * 6) + i + e.id) % 4 === 0) continue;
      const a = t * (2 + (e.id % 3)) + (i * Math.PI * 2) / 3;
      c.fillStyle = GREEN[i === 0 ? 3 : 2];
      dot(Math.round((e.x + Math.cos(a) * r) * ART), Math.round((e.y + Math.sin(a) * r * 0.8) * ART));
    }
  }
}
