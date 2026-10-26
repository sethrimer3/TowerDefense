import {captureShot,shotField,chronoTarget} from "./chrono.ts";
import { spikeKey } from "../specializations.ts";
/** The city wall's own defenses. Wall spikes cut every enemy on foot that
 * presses against the stones they stand on, in pulses; wall ballistas on
 * the wall's corners shoot long bolts at the nearest enemy, each piercing a
 * file of enemies along its line. Neither exists in a city without them,
 * so such runs replay exactly as before. */
import { dist, sq } from "../exact.ts";
import { BLAST_STAKES, RIME_STAKES, SPRING_STAKES, pathRank } from "../knowledge-paths.ts";
import { STONEWORK, TRAPPED, wallRank } from "../wall-upgrades.ts";
import { BALLISTA, ENEMIES, ballistaCooldown, ballistaDamage, ballistaRange, enemySize, spikeDamage, spikeEvery } from "./catalog.ts";
import { FIRE_BOLTS, HEAVY_BOLTS, WINDLASS, ballistaRank } from "../ballista-upgrades.ts";
import { fizzles } from "./boats.ts";
import { ignite } from "./towers.ts";
import type { Building } from "./citygen.ts";
import { cellX, cellY } from "./grid.ts";
import { center, nearest, type Point } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

/** A ballista's bolt in flight: where it is, its heading (a unit vector),
 * how far it flies in all (`range`) and has left to fly, how many enemies
 * it may pierce and whom it has struck; `building` is the building it came
 * from and `aim` the key its ballista turns under (its building's id, or a
 * gate ballista's `gateTowerKey`). The ballistas' Study ranks
 * (`ballista-upgrades.ts`) add what each strike does; a gate ballista's
 * bolt is `small`. All absent without them. */
export type BallistaBolt = {
  chronoReleased?: true;
  x: number;
  y: number;
  dx: number;
  dy: number;
  left: number;
  range: number;
  pierce: number;
  damage: number;
  hits: number[];
  building: number;
  aim: number;
  small?: true;
  stagger?: number;
  burn?: number;
  blaze?: true;
  burst?: true;
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

/** The walls the player placed on their own, with the walls' upgrades:
 * standing stones mend (Stonework III). Nothing happens in a run without
 * placed walls or that rank. */
export function stepPlacedWalls(sim: DefendSim, dt: number) {
  const ranks = sim.bonuses.walls;
  if (!ranks || !sim.pieces.length) return;
  if (wallRank(ranks, "stonework") >= 3)
    for (const b of sim.pieces)
      if (sim.solid[b.cells[0]] && sim.hp[b.id] < sim.maxHp[b.id]) sim.hp[b.id] = Math.min(sim.maxHp[b.id], sim.hp[b.id] + sim.maxHp[b.id] * STONEWORK.mend * dt);
}

/** A placed wall stone has broken (Trapped walls): its charge bursts,
 * sparing your own people, and from III leaves the ground burning. */
export function trappedWallFell(sim: DefendSim, b: Building) {
  const rank = wallRank(sim.bonuses.walls, "trapped");
  if (!rank) return;
  const c = center(b.rect), r = TRAPPED.radius[rank];
  // A charge under a magic boat's water only hisses.
  if (fizzles(sim, c.x, c.y, r)) return;
  const seed = sim.explode(c.x, c.y, { r, damage: TRAPPED.damage[rank], friendlyFire: false });
  if (rank >= 3) sim.blazes.push({ x: c.x, y: c.y, r, t: 0, life: TRAPPED.fire, dps: TRAPPED.dps, seed });
}

/** Fliers pass over the stakes, boats sail through the wall and a mole
 * under the ground never touches them. */
export const onFoot = (e: Enemy) => !ENEMIES[e.kind].flying && !ENEMIES[e.kind].boat && !e.burrow;

/** How far a wall ballista shoots, with the Smithy's levels and Windlass II. */
export const wallBallistaRange = (sim: Pick<DefendSim, "levels" | "bonuses">) =>
  ballistaRange(sim.levels.ballistaRange ?? 0) + WINDLASS.range[ballistaRank(sim.bonuses.ballista, "windlass")];

/** Seconds between a wall ballista's shots. */
export const wallBallistaReload = (sim: Pick<DefendSim, "levels" | "bonuses">) =>
  ballistaCooldown(sim.levels.ballistaRate ?? 0) * sim.bonuses.towerReload * WINDLASS.reload[ballistaRank(sim.bonuses.ballista, "windlass")];

/** A standing ballista shoots the nearest enemy in range, turning to it:
 * one bolt, or with Windlass III a fan of three. */
export function shootBallista(sim: DefendSim, b: Building): boolean {
  const c = center(b.rect), range = wallBallistaRange(sim);
  const target = nearest(sim.enemiesNear(c.x, c.y, range), c, sq(range)) ?? chronoTarget(sim,c,range,true,b.id);
  if (!target) return false;
  const ranks = sim.bonuses.ballista;
  const heavy = ballistaRank(ranks, "heavyBolts"), fire = ballistaRank(ranks, "fireBolts"), fan = ballistaRank(ranks, "windlass") >= 3;
  const damage = ballistaDamage(sim.levels.ballistaDamage ?? 0) * sim.bonuses.towerDamage * HEAVY_BOLTS.damage[heavy];
  const extra: Partial<BallistaBolt> = {
    ...(heavy >= 2 ? { stagger: HEAVY_BOLTS.stagger } : {}),
    ...(fire ? { burn: damage * FIRE_BOLTS.share } : {}),
    ...(fire >= 2 ? { blaze: true } : {}),
    ...(fire >= 3 ? { burst: true } : {}),
  };
  fireBolt(sim, c, target, b.id, b.id, { damage, range, pierce: HEAVY_BOLTS.pierce[heavy] || BALLISTA.pierce, extra, fan });
  return true;
}

/** Looses a bolt from `from` at `target` (or, `fan`, three spread about it),
 * turning the ballista under `aim` to it. */
export function fireBolt(sim: DefendSim, from: Point, target: Point, aim: number, building: number,
  o: { damage: number; range: number; pierce: number; small?: boolean; extra?: Partial<BallistaBolt>; fan?: boolean }) {
  const d = dist(target.x - from.x, target.y - from.y) || 1;
  const dx = (target.x - from.x) / d, dy = (target.y - from.y) / d;
  sim.ballistaAim.set(aim, { x: dx, y: dy });
  const { cos, sin } = WINDLASS;
  const heads = o.fan ? [[dx, dy], [dx * cos - dy * sin, dx * sin + dy * cos], [dx * cos + dy * sin, -dx * sin + dy * cos]] : [[dx, dy]];
  for (const [hx, hy] of heads)
    sim.ballistaBolts.push({
      x: from.x, y: from.y, dx: hx, dy: hy, left: o.range + 1, range: o.range + 1, pierce: o.pierce, damage: o.damage, hits: [], building, aim,
      ...(o.small ? { small: true } : {}), ...o.extra,
    });
}

/** Bolts fly straight on, striking every enemy they pass within reach of
 * (each once) until they have pierced `BALLISTA.pierce` or flown their
 * range. */
export function stepBallistaBolts(sim: DefendSim, dt: number) {
  if (!sim.ballistaBolts.length) return;
  for (const bolt of sim.ballistaBolts) {
    if (bolt.left <= 0) continue;
    let step = Math.min(bolt.left, BALLISTA.speed * dt);
    const x0 = bolt.x, y0 = bolt.y;
    bolt.x += bolt.dx * step;
    bolt.y += bolt.dy * step;
    bolt.left -= step;
    const end={x:bolt.x,y:bolt.y},field=shotField(sim,{kind:"ballista",shot:bolt},{x:x0,y:y0},end);
    if(field){step*=field.t;bolt.x=x0+bolt.dx*step;bolt.y=y0+bolt.dy*step;}

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
      if (bolt.hits.length >= bolt.pierce) break;
      bolt.hits.push(e.id);
      if (bolt.burst) {
        // Thunderbolts: the first strike bursts, sparing your own people.
        delete bolt.burst;
        sim.explode(e.x, e.y, { r: FIRE_BOLTS.burst.r, damage: bolt.damage * FIRE_BOLTS.burst.share, friendlyFire: false, origin: { x: x0, y: y0, building: bolt.building } });
      }
      sim.hurtEnemy(e, bolt.damage, true, "ranged", { x: x0, y: y0, building: bolt.building }, true);
      if (e.hp <= 0) continue;
      if (bolt.stagger && !ENEMIES[e.kind].unyielding) e.stagger = Math.max(e.stagger ?? 0, bolt.stagger);
      if (bolt.burn) ignite(e, bolt.burn, FIRE_BOLTS.burn);
    }
    if (bolt.hits.length >= bolt.pierce) bolt.left = 0;
    if(field&&bolt.hits.length<bolt.pierce&&captureShot(sim,{kind:"ballista",shot:bolt},{x:x0,y:y0},end)){bolt.left=0;continue;}
    // Firebrands: where the bolt stops, the ground burns (not in water).
    if (bolt.left <= 0 && bolt.blaze && !fizzles(sim, bolt.x, bolt.y, FIRE_BOLTS.blaze.r)) {
      const { r, life, dps } = FIRE_BOLTS.blaze;
      sim.blazes.push({ x: bolt.x, y: bolt.y, r, t: 0, life, dps: dps * sim.bonuses.towerDamage, seed: (bolt.building * 7919 + bolt.hits.length * 31 + Math.floor(bolt.x * 8) * 131 + Math.floor(bolt.y * 8)) >>> 0 });
    }
  }
  sim.ballistaBolts = sim.ballistaBolts.filter((b) => b.left > 0);
}
