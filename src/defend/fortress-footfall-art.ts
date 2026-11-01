/** Tiny landing puffs, tracked only by the renderer and never by combat RNG. */
import { ENEMIES } from "./catalog.ts";
import { FORTRESS_GAIT } from "./fortress-motion-art.ts";
import { hash01 } from "./grid.ts";
import { ART, UNIT_CONTOUR_ART_PIXELS, PORTAL_CONTOUR_WIDTH } from "./art-scale.ts";
import type { Brush } from "./battle-art.ts";
import type { DefendSim, Enemy } from "./sim.ts";

type Puff = { x: number; y: number; time: number; seed: number };
type Footfalls = { walk: number; time: number; puffs: Puff[] };
const fields = new WeakMap<Enemy, Footfalls>();

/** Advance once per battle timestamp; feet land at the start of each stance.
 * Expiry uses battle time so dust fades after stopping and holds while paused. */
export function fortressFootfalls(core: Enemy, time: number, reduced = false): readonly Puff[] {
  const walk = core.walker?.walk ?? 0;
  let field = fields.get(core);
  if (!field || reduced || time < field.time || walk < field.walk) {
    field = { walk, time, puffs: [] }; fields.set(core, field);
    return field.puffs;
  }
  field.puffs = field.puffs.filter(p => time - p.time < FORTRESS_GAIT.dustLife);
  const distance = walk - field.walk, dt = time - field.time;
  if (core.hp > 0 && core.walker?.phase !== "falling" && distance > 0 && distance < 2 && dt > 0 && dt < 1) {
    const scale = ENEMIES[core.kind].fortress!.partScale ?? 1, stride = FORTRESS_GAIT.stride * scale;
    const facing = core.facing ?? { x: 0, y: 1 }, length = Math.hypot(facing.x, facing.y) || 1;
    const ux = facing.x / length, uy = facing.y / length, sides = [0, 0, 0, 0];
    for (const leg of core.fortressParts ?? []) {
      const part = leg.fortressPart;
      if (part?.role !== "leg") continue;
      const side = part.side ?? (part.dx < 0 ? 0 : 2), local = sides[side]++;
      if (leg.hp <= 0) continue;
      const bank = (local + (side === 1 || side === 2 ? 1 : 0)) % 2 * .5;
      const cycle = Math.floor(walk / stride + bank);
      if (cycle <= Math.floor(field.walk / stride + bank)) continue;
      const since = walk - (cycle - bank) * stride, age = dt * since / distance;
      if (age >= FORTRESS_GAIT.dustLife) continue;
      const nx = side === 0 ? -1 : side === 2 ? 1 : 0, ny = side === 1 ? -1 : side === 3 ? 1 : 0;
      const reach = scale * (FORTRESS_GAIT.reach + (core.walker?.phase === "grounded" ? .16 : 0));
      const forward = stride * FORTRESS_GAIT.stance / 2 - since;
      field.puffs.push({ x: core.x + part.dx + nx * reach + ux * forward,
        y: core.y + part.dy + ny * reach + uy * forward, time: time - age, seed: leg.id * 997 + cycle });
    }
  }
  field.walk = walk; field.time = time;
  if (field.puffs.length > 24) field.puffs.splice(0, field.puffs.length - 24);
  return field.puffs;
}

/** Ground pass, outside the unit silhouette capture: dust never gets fire rims. */
export function drawFortressFootfalls({ c, px }: Brush, sim: DefendSim, reduced = false) {
  c.save();
  for (const core of sim.enemies) {
    if (!core.walker || core.hp <= 0) continue;
    const def = ENEMIES[core.kind], scale = (def.fortress!.partScale ?? 1) * px;
    const rim = px / ART * UNIT_CONTOUR_ART_PIXELS * (def.blightFortress ? PORTAL_CONTOUR_WIDTH : 1);
    for (const puff of fortressFootfalls(core, sim.time, reduced)) {
      const age = Math.max(0, (sim.time - puff.time) / FORTRESS_GAIT.dustLife);
      c.globalAlpha = .38 * (1 - age) * (1 - age);
      for (let n = 0; n < 5; n++) {
        // Start outside the broad toe and its fiery rim, so the impact reads
        // immediately rather than being entirely hidden beneath the foot.
        const angle = hash01(puff.seed, n) * Math.PI * 2, spread = scale * (.17 + age * .2) + rim;
        const size = scale * (.07 + hash01(n, puff.seed) * .045) * (1 + age * .7);
        c.fillStyle = n % 2 ? "#c0ad88" : "#897d69";
        c.beginPath(); c.ellipse(puff.x * px + Math.cos(angle) * spread,
          puff.y * px + Math.sin(angle) * spread - age * scale * .07, size, size * .65, 0, 0, Math.PI * 2); c.fill();
      }
    }
  }
  c.restore();
}
