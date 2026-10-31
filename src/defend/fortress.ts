import { fireBlightTurret } from "./blight-fortress.ts";
import { dist } from "../exact.ts";
import { ENEMIES } from "./catalog.ts";
import { hostileBurst } from "./hostile-attacks.ts";
import { enemyDamage } from "./enemy-abilities.ts";
import { nearestPoint, rectDist } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

export function assembleFortress(sim: DefendSim, core: Enemy) {
  const def = ENEMIES[core.kind], fort = def.fortress!;
  core.fortressParts = [];
  core.walker = { phase: "raised", fall: 0, walk: 0, x: core.x, y: core.y, scrape: 0 };
  core.untargetable = true;
  for (const role of ["leg", "armor", "turret"] as const) {
    const count = role === "leg" ? fort.legs : role === "armor" ? fort.armor : fort.turrets;
    for (let n = 0; n < count; n++) {
      const side = n % 2 ? 1 : -1, row = Math.floor(n / 2), rows = Math.ceil(count / 2);
      const scale = fort.partScale ?? 1;
      let dx = count === 1 && role === "turret" ? 0 : side * (def.size / 2 + (role === "leg" ? .2 : role === "armor" ? -.2 : -.65) * scale);
      let dy = count === 1 && role === "turret" ? -fort.height / 4 : (row - (rows - 1) / 2) * (fort.height - .8 * scale) / Math.max(1, rows - 1);
      let legSide: number | undefined;
      if (role === "leg") {
        const perSide = count === 6 ? [2, 1, 2, 1] : [count / 4, count / 4, count / 4, count / 4];
        let local = n; legSide = 0;
        while (local >= perSide[legSide]) { local -= perSide[legSide]; legSide++; }
        const along = (local + 1) / (perSide[legSide] + 1) - .5;
        dx = legSide === 0 ? -def.size / 2 - .2 * scale : legSide === 2 ? def.size / 2 + .2 * scale : along * def.size;
        dy = legSide === 1 ? -fort.height / 2 - .2 * scale : legSide === 3 ? fort.height / 2 + .2 * scale : along * fort.height;
      }
      if (def.blightFortress && role === "turret") dy = -fort.height / 2 + .12 * scale;
      const part = sim.spawnAuxiliary(core.kind, core.x + dx, core.y + dy);
      if (!part) continue;
      part.fortressPart = { core: core.id, role, dx, dy, ...(legSide !== undefined ? { side: legSide } : {}) };
      if (role === "turret" && def.blightFortress) part.fortressPart.weapon = def.blightFortress === "dual" ? (n === 0 ? "cannon" : "laser") : def.blightFortress;
      if (role === "armor") part.untargetable = true;
      part.hp = part.maxHp = fort.partHp * (role === "armor" ? 1.5 : 1);
      part.raisedDamage = def.damage * .5;
      part.cd = n * .15;
      core.fortressParts.push(part);
    }
  }
  refreshFortress(sim, core);
  core.maxHp = core.hp;
  syncFortress(core);
}

export function syncFortress(core: Enemy) {
  for (const p of core.fortressParts ?? []) {
    p.x = core.x + p.fortressPart!.dx;
    p.y = core.y + p.fortressPart!.dy - (p.fortressPart!.role === "turret" ? fortressLift(core) : 0);
  }
}

export function stepFortress(sim: DefendSim, part: Enemy, _dt: number): boolean {
  const data = part.fortressPart!;
  const core = sim.livingEnemy(data.core);
  if (!core) { part.hp = 0; return true; }
  part.x = core.x + data.dx; part.y = core.y + data.dy - (data.role === "turret" ? fortressLift(core) : 0);
  if (data.role !== "turret") return true;
  const range = 4 + ENEMIES[core.kind].fortress!.tier;
  const foe = sim.nearestDefender(part.x, part.y, range);
  const building = sim.map.buildings.find(b => sim.intact(b) && rectDist(b.rect, part.x, part.y) <= range);
  const target = foe ?? (building ? nearestPoint(building.rect, part.x, part.y) : null);
  if (!target) return true;
  part.aim = { x: target.x, y: target.y };
  if (part.cd > 0) return true;
  if (data.weapon) {
    fireBlightTurret(sim, part, target, range);
    return true;
  }
  part.cd = 2;
  hostileBurst(sim, target.x, target.y, .7, enemyDamage(sim, part));
  sim.effects.push({ kind: "boom", x: target.x, y: target.y, r: .7, t: 0, seed: part.id });
  return true;
}


export const FORTRESS_FALL = .65;
export const fortressLegs = (core: Enemy) => core.fortressParts?.filter(p => p.hp > 0 && p.fortressPart?.role === "leg").length ?? 0;
export const fortressLift = (core: Enemy) => {
  const state = core.walker;
  const k = state?.phase === "grounded" ? 1 : state?.phase === "falling" ? Math.min(1, state.fall / FORTRESS_FALL) : 0;
  return .18 * (ENEMIES[core.kind].fortress?.partScale ?? 1) * (1 - k * k);
};

/** The chassis has no health of its own: turret health controls its lifetime. */
export function refreshFortress(sim: DefendSim, core: Enemy) {
  if (!core.walker || core.hp <= 0) return;
  const turrets = core.fortressParts!.filter(p => p.fortressPart?.role === "turret");
  const hp = turrets.reduce((sum, p) => sum + Math.max(0, p.hp), 0);
  if (hp <= 0) {
    core.hp = 0;
    for (const p of core.fortressParts!) p.hp = 0;
    sim.effects.push({ kind: "boom", x: core.x, y: core.y, r: ENEMIES[core.kind].size * .7, t: 0, seed: core.id });
    return;
  }
  core.hp = hp;
  if (core.walker.phase === "raised" && fortressLegs(core) <= 2) {
    core.walker.phase = "falling"; core.walker.fall = 0; core.untargetable = true;
  }
}

export function stepFortressCore(sim: DefendSim, core: Enemy, dt: number) {
  refreshFortress(sim, core);
  if (core.hp <= 0) return true;
  const state = core.walker!;
  if (state.phase === "falling") {
    state.fall += dt;
    if (state.fall >= FORTRESS_FALL) {
      state.phase = "grounded"; delete core.untargetable;
      sim.effects.push({ kind: "dust", x: core.x, y: core.y, r: ENEMIES[core.kind].size * .9, t: 0, seed: core.id });
    }
    syncFortress(core);
    return true;
  }
  return fortressLegs(core) === 0;
}

/** Called after native movement: animation and rubble follow actual distance. */
export function finishFortressStep(sim: DefendSim, core: Enemy) {
  syncFortress(core);
  const state = core.walker;
  if (!state || core.hp <= 0) return;
  const distance = dist(core.x - state.x, core.y - state.y);
  if (distance > 0 && distance < 2) {
    core.facing = { x: (core.x - state.x) / distance, y: (core.y - state.y) / distance };
    state.walk += distance;
    if (state.phase === "grounded") {
      state.scrape += distance;
      if (state.scrape >= .18) {
        state.scrape %= .18;
        if (sim.fortressRubble.length < 256) sim.fortressRubble.push({ x: state.x, y: state.y,
          r: ENEMIES[core.kind].size * .48, life: 5, seed: core.id + Math.floor(state.walk * 20) });
      }
    }
  }
  state.x = core.x; state.y = core.y;
}

/** A single area hit can reach a grounded chassis or its mounts, never both. */
export function fortressAreaTargets(enemies: readonly Enemy[], groundOnly = false) {
  if (!enemies.some(e => e.walker || e.fortressPart)) return enemies;
  const bodies = new Set(enemies.filter(e => e.hp > 0 && e.walker?.phase === "grounded").map(e => e.id));
  return enemies.filter(e => {
    const part = e.fortressPart;
    if (e.walker && e.walker.phase !== "grounded" || part?.role === "armor") return false;
    return !(part?.role === "turret" && (groundOnly || bodies.has(part.core)));
  });
}
