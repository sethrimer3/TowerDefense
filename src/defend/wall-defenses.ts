import { spikeKey } from "../cards.ts";
/** The city wall's own defenses. Wall spikes cut every enemy on foot that
 * presses against the stones they stand on, in pulses; wall ballistas on
 * the wall's corners shoot long bolts at the nearest enemy, each piercing a
 * file of enemies along its line. Neither exists in a city without them,
 * so such runs replay exactly as before. */
import { dist, sq } from "../exact.ts";
import { BLAST_STAKES, RIME_STAKES, SPRING_STAKES, pathRank } from "../knowledge-paths.ts";
import { BALLISTA, ENEMIES, enemySize, spikeDamage, spikeEvery } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { cellX, cellY } from "./grid.ts";
import { center, nearest } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

/** A ballista's bolt in flight: where it is, its heading (a unit vector),
 * how far it has left to fly, and whom it has struck. */
export type BallistaBolt = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  left: number;
  damage: number;
  hits: number[];
  building: number;
};

const SIDE_STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;

/** A row of spring stakes shooting out: which row (its index in
 * `map.spikes`), how far, and how long ago. */
export type SpikeThrust = { row: number; reach: number; t: number };

/** Every `spikeEvery` seconds, each ground enemy touching the stakes on a
 * standing wall stone takes `spikeDamage` (once a pulse, however many
 * stakes it touches). The Study's paths add to the cut: blasting stakes
 * blow up the stone's stakes, spring stakes shoot the whole row out, and
 * rimed stakes chill. */
export function stepSpikes(sim: DefendSim, dt: number) {
  const rows = sim.map.spikes;
  if (!rows) return;
  if (sim.spikeArm.size)
    for (const [k, t] of sim.spikeArm) if (t - dt <= 0) sim.spikeArm.delete(k); else sim.spikeArm.set(k, t - dt);
  if (sim.spikeThrusts.length) {
    for (const t of sim.spikeThrusts) t.t += dt;
    sim.spikeThrusts = sim.spikeThrusts.filter((t) => t.t < SPRING_STAKES.show);
  }
  sim.spikeT -= dt;
  if (sim.spikeT > 0) return;
  sim.spikeT += spikeEvery(sim.levels.spikeRate ?? 0);
  const cut = spikeDamage(sim.levels.spikeDamage ?? 0);
  const struck = new Set<number>();
  const sprung: number[] = [];
  rows.forEach((row, r) => {
    const paths = sim.bonuses.spikePaths?.[spikeKey(row)] ?? sim.bonuses.paths;
    const blast = pathRank(paths, "spikes", "blastStakes"), spring = pathRank(paths, "spikes", "springStakes"), rime = pathRank(paths, "spikes", "rimeStakes");
    const [dx, dy] = SIDE_STEP[row.side];
    for (const cell of row.cells) {
      if (!sim.solid[cell]) continue;
      // The stakes reach half a cell out from the stone's outer face.
      const cx = cellX(cell) + 0.5 + dx * 0.75, cy = cellY(cell) + 0.5 + dy * 0.75;
      let touched = false;
      for (const e of sim.enemiesNear(cx, cy, 1.5)) {
        if (!onFoot(e) || e.hp <= 0) continue;
        const rad = enemySize(e) / 2;
        const hx = dx ? 0.25 : 0.5, hy = dy ? 0.25 : 0.5;
        if (Math.abs(e.x - cx) > hx + rad || Math.abs(e.y - cy) > hy + rad) continue;
        touched = true;
        if (struck.has(e.id)) continue;
        struck.add(e.id);
        const bite = rime >= 2 && e.chill ? RIME_STAKES.bite : 1;
        if (rime) e.chill = Math.max(e.chill ?? 0, RIME_STAKES.chill[rime]);
        sim.hurtEnemy(e, cut * bite, true, "melee");
      }
      if (!touched) continue;
      if (blast && !sim.spikeArm.has(cell)) {
        sim.spikeArm.set(cell, BLAST_STAKES.rearm[blast]);
        sim.explode(cx, cy, { r: BLAST_STAKES.radius[blast], damage: cut * BLAST_STAKES.damage[blast], friendlyFire: false });
      }
      if (spring && !sprung.includes(r) && !sim.spikeArm.has(-1 - r)) sprung.push(r);
      if (rime >= 3) {
        for (const e of sim.enemiesNear(cx, cy, RIME_STAKES.aura + 1)) {
          if (!onFoot(e) || e.hp <= 0 || sq(e.x - cx) + sq(e.y - cy) > sq(RIME_STAKES.aura + enemySize(e) / 2)) continue;
          e.chill = Math.max(e.chill ?? 0, RIME_STAKES.chill[rime]);
        }
      }
    }
  });
  for (const r of sprung) springRow(sim, r, pathRank(sim.bonuses.spikePaths?.[spikeKey(rows[r])] ?? sim.bonuses.paths, "spikes", "springStakes"), cut);
}

/** Every standing stone's stakes in row `r` shoot out, striking each enemy
 * on foot in front of the row (once, however many stones reach it). Spring
 * rows are armed under negative keys, so they never meet a stone's. */
function springRow(sim: DefendSim, r: number, rank: number, cut: number) {
  const row = sim.map.spikes![r];
  const [dx, dy] = SIDE_STEP[row.side];
  const reach = SPRING_STAKES.reach[rank];
  sim.spikeArm.set(-1 - r, SPRING_STAKES.rearm[rank]);
  sim.spikeThrusts.push({ row: r, reach, t: 0 });
  const hit = new Set<number>();
  for (const cell of row.cells) {
    if (!sim.solid[cell]) continue;
    // The zone in front of this stone: its width along the wall, and from
    // its outer face out to the stakes' reach.
    const cx = cellX(cell) + 0.5 + dx * (0.5 + reach / 2), cy = cellY(cell) + 0.5 + dy * (0.5 + reach / 2);
    const hx = dx ? reach / 2 : 0.5, hy = dy ? reach / 2 : 0.5;
    for (const e of sim.enemiesNear(cx, cy, reach / 2 + 1.5)) {
      if (hit.has(e.id) || !onFoot(e) || e.hp <= 0) continue;
      const rad = enemySize(e) / 2;
      if (Math.abs(e.x - cx) > hx + rad || Math.abs(e.y - cy) > hy + rad) continue;
      hit.add(e.id);
      sim.hurtEnemy(e, cut * SPRING_STAKES.damage[rank], true, "melee");
    }
  }
}

/** Fliers pass over the stakes, boats sail through the wall and a mole
 * under the ground never touches them. */
const onFoot = (e: Enemy) => !ENEMIES[e.kind].flying && !ENEMIES[e.kind].boat && !e.burrow;

/** A standing ballista shoots the nearest enemy in range, turning to it. */
export function shootBallista(sim: DefendSim, b: Building): boolean {
  const c = center(b.rect);
  const target = nearest(sim.enemiesNear(c.x, c.y, BALLISTA.range), c);
  if (!target) return false;
  const d = dist(target.x - c.x, target.y - c.y) || 1;
  const dx = (target.x - c.x) / d, dy = (target.y - c.y) / d;
  sim.ballistaAim.set(b.id, { x: dx, y: dy });
  sim.ballistaBolts.push({ x: c.x, y: c.y, dx, dy, left: BALLISTA.range + 1, damage: BALLISTA.damage * sim.bonuses.towerDamage, hits: [], building: b.id });
  return true;
}

/** Bolts fly straight on, striking every enemy they pass within reach of
 * (each once) until they have pierced `BALLISTA.pierce` or flown their
 * range. */
export function stepBallistaBolts(sim: DefendSim, dt: number) {
  if (!sim.ballistaBolts.length) return;
  for (const bolt of sim.ballistaBolts) {
    const step = Math.min(bolt.left, BALLISTA.speed * dt);
    const x0 = bolt.x, y0 = bolt.y;
    bolt.x += bolt.dx * step;
    bolt.y += bolt.dy * step;
    bolt.left -= step;
    const mx = (x0 + bolt.x) / 2, my = (y0 + bolt.y) / 2;
    const hit: Enemy[] = [];
    for (const e of sim.enemiesNear(mx, my, step / 2 + 1.5)) {
      if (e.hp <= 0 || bolt.hits.includes(e.id)) continue;
      // Distance from the enemy to this step of the bolt's line.
      const ex = e.x - x0, ey = e.y - y0;
      const along = Math.max(0, Math.min(step, ex * bolt.dx + ey * bolt.dy));
      const off = sq(ex - bolt.dx * along) + sq(ey - bolt.dy * along);
      const reach = BALLISTA.width + enemySize(e) / 2;
      if (off <= reach * reach) hit.push(e);
    }
    // Nearest first along the line, so a full bolt stops in the file's front.
    hit.sort((a, b) => (a.x - x0) * bolt.dx + (a.y - y0) * bolt.dy - ((b.x - x0) * bolt.dx + (b.y - y0) * bolt.dy) || a.id - b.id);
    for (const e of hit) {
      if (bolt.hits.length >= BALLISTA.pierce) break;
      bolt.hits.push(e.id);
      sim.hurtEnemy(e, bolt.damage, true, "ranged", { x: x0, y: y0, building: bolt.building }, true);
    }
    if (bolt.hits.length >= BALLISTA.pierce) bolt.left = 0;
  }
  sim.ballistaBolts = sim.ballistaBolts.filter((b) => b.left > 0);
}
