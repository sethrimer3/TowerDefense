import { ENEMIES } from "./catalog.ts";
import { hostileBurst } from "./hostile-attacks.ts";
import { enemyDamage } from "./enemy-abilities.ts";
import { nearestPoint, rectDist } from "./pathing.ts";
import type { DefendSim, Enemy } from "./sim.ts";

export function assembleFortress(sim: DefendSim, core: Enemy) {
  const def = ENEMIES[core.kind], fort = def.fortress!;
  core.fortressParts = [];
  for (const role of ["leg", "armor", "turret"] as const) {
    const count = role === "leg" ? fort.legs : role === "armor" ? fort.armor : fort.turrets;
    for (let n = 0; n < count; n++) {
      const side = n % 2 ? 1 : -1, row = Math.floor(n / 2), rows = count / 2;
      const dx = side * (def.size / 2 + (role === "leg" ? .2 : role === "armor" ? -.2 : -.65));
      const dy = (row - (rows - 1) / 2) * (fort.height - .8) / Math.max(1, rows - 1);
      const part = sim.spawnAuxiliary(core.kind, core.x + dx, core.y + dy);
      if (!part) continue;
      part.fortressPart = { core: core.id, role, dx, dy };
      part.hp = part.maxHp = fort.partHp * (role === "armor" ? 1.5 : 1);
      part.raisedDamage = def.damage * .5;
      part.cd = n * .15;
      core.fortressParts.push(part);
    }
  }
}

export function syncFortress(core: Enemy) {
  for (const p of core.fortressParts ?? []) {
    p.x = core.x + p.fortressPart!.dx;
    p.y = core.y + p.fortressPart!.dy;
  }
}

export function stepFortress(sim: DefendSim, part: Enemy, _dt: number): boolean {
  const data = part.fortressPart!;
  const core = sim.enemies.find(e => e.id === data.core && e.hp > 0);
  if (!core) { part.hp = 0; return true; }
  part.x = core.x + data.dx; part.y = core.y + data.dy;
  if (data.role !== "turret" || part.cd > 0) return true;
  const range = 4 + ENEMIES[core.kind].fortress!.tier;
  const foe = sim.nearestDefender(part.x, part.y, range);
  const building = sim.map.buildings.find(b => sim.intact(b) && rectDist(b.rect, part.x, part.y) <= range);
  const target = foe ?? (building ? nearestPoint(building.rect, part.x, part.y) : null);
  if (!target) return true;
  part.cd = 2;
  hostileBurst(sim, target.x, target.y, .7, enemyDamage(sim, part));
  sim.effects.push({ kind: "boom", x: target.x, y: target.y, r: .7, t: 0, seed: part.id });
  return true;
}
