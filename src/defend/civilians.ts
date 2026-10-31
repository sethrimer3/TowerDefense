/** Repair workers are recruited by intact Repair shops. No shop, no repairs.
 * Jobs reserve whole buildings; work restores a percentage of maximum HP. */
import { STONEWORK, wallRank } from "../wall-upgrades.ts";
import { IRONBOUND, gateRank } from "../gate-upgrades.ts";
import { dist } from "../exact.ts";
import { CIVILIAN, civilianHp, rebuildSeconds, type UpgradeId } from "./catalog.ts";
import { REPAIR, repairCrew, repairRank } from "../repair-upgrades.ts";
import { cellAt, cellCenter, center, findPath, rectDist, type Point } from "./pathing.ts";
import { CELL_COUNT, CELLS_H, CELLS_W, cellInBounds, cellIndex, cellX, cellY, sideCells } from "./grid.ts";
import { CellType, type Building } from "./citygen.ts";
import type { Civilian, DefendSim } from "./sim.ts";
import { restockable } from "./bait.ts";
import { icyCell } from "./boats.ts";
import { CLEANUP_DEPTH } from "./atmosphere.ts";

const ERRAND = { maxCost: 400 };
const AROUND = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]] as const;

export class Builders {
  /** Cooldowns belong to a shop and slot, never to a house. */
  readonly respawn: number[] = [];
  private slots = new Map<string, number>();
  private dead = new WeakSet<Civilian>();
  private refugeVersion = -1;
  private refuge = new Uint8Array(CELL_COUNT);
  private escapeChecks = new WeakMap<Civilian, number>();
  constructor(_levels: Record<UpgradeId, number>) {}

  step(sim: DefendSim, dt: number) {
    for (let i = 0; i < this.respawn.length; i++) this.respawn[i] = Math.max(0, this.respawn[i] - dt);
    for (const c of sim.civilians) if (c.hp <= 0 && !this.dead.has(c)) {
      this.dead.add(c);
      const slot = this.slots.get(`${c.shop}:${c.slot}`);
      if (slot !== undefined) this.respawn[slot] = CIVILIAN.respawnSeconds;
    }
    for (const shop of sim.map.buildings) if (shop.kind === "repairShop" && sim.intact(shop)) {
      for (let slot = 0; slot < repairCrew(sim.bonuses.repair); slot++) {
        const key = `${shop.id}:${slot}`;
        if (!this.slots.has(key)) { this.slots.set(key, this.respawn.length); this.respawn.push(0); }
        if (this.respawn[this.slots.get(key)!] > 0 || sim.civilians.some(c => c.hp > 0 && c.shop === shop.id && c.slot === slot)) continue;
        const door = sim.doorOf(shop);
        if (door < 0) continue;
        const at = cellCenter(door), job = pickJob(sim, at);
        if (job < 0) break;
        const hp = civilianHp(sim.levels.civilianHealth) * sim.bonuses.repairHp;
        const c: Civilian = { id: sim.newId(), ...at, hp, maxHp: hp, job: -1, state: "home", work: 0, path: [], home: shop.id, shop: shop.id, slot, thinkT: 0, flash: 0 };
        sim.civilians.push(c);
        assignNext(sim, c);
      }
    }
    for (const c of sim.civilians) if (c.hp > 0) {
      if (c.state !== "flee" && sim.map.type[cellAt(c.x, c.y)] === CellType.OUT && !this.canReturn(sim, c) && this.escapeChecks.get(c) !== sim.mapVersion) {
        this.escapeChecks.set(c, sim.mapVersion); panic(sim, c);
      }
      stepCivilian(sim, c, dt);
    }
  }

  private canReturn(sim: DefendSim, c: Civilian) {
    if (this.refugeVersion !== sim.mapVersion) {
      this.refugeVersion = sim.mapVersion; this.refuge.fill(0);
      const queue: number[] = [];
      for (const b of sim.map.buildings) if ((b.kind === "repairShop" || b.kind === "keep") && sim.intact(b))
        for (const cell of sideCells(b.rect)) if (!sim.ownSolid[cell] && !this.refuge[cell]) { this.refuge[cell] = 1; queue.push(cell); }
      for (let i = 0; i < queue.length; i++) {
        const x = cellX(queue[i]), y = cellY(queue[i]);
        for (const [dx, dy] of AROUND) {
          if (!cellInBounds(x + dx, y + dy)) continue;
          const n = cellIndex(x + dx, y + dy);
          if (this.refuge[n] || sim.ownSolid[n] || dx && dy && (sim.ownSolid[cellIndex(x + dx, y)] || sim.ownSolid[cellIndex(x, y + dy)])) continue;
          this.refuge[n] = 1; queue.push(n);
        }
      }
    }
    return !!this.refuge[cellAt(c.x, c.y)];
  }
}

function stepCivilian(sim: DefendSim, c: Civilian, dt: number) {
  c.bowCd = Math.max(0, (c.bowCd ?? 0) - dt);
  const danger = sim.enemiesNear(c.x, c.y, REPAIR.danger).find(e => e.hp > 0 && !e.untargetable);
  if (danger) {
    if (repairRank(sim.bonuses.repair, "retreatBow") && !c.bowCd) {
      sim.arrows.push({ x: c.x, y: c.y, target: danger.id, tx: danger.x, ty: danger.y, damage: REPAIR.bowDamage * sim.bonuses.repairDamage, life: 2, origin: { x: c.x, y: c.y, attacker: c.id, building: c.shop } });
      c.bowCd = REPAIR.bowCooldown;
    }
    if (c.state === "flee") return flee(sim, c, dt);
    // Choose a reachable escape cell away from the threat; keep moving while shooting.
    let best = -1, score = dist(c.x - danger.x, c.y - danger.y);
    for (const [dx, dy] of AROUND) {
      const x = Math.floor(c.x) + dx, y = Math.floor(c.y) + dy;
      if (!cellInBounds(x, y)) continue;
      const cell = cellIndex(x, y), p = cellCenter(cell), d = dist(p.x - danger.x, p.y - danger.y);
      if (sim.ownSolid[cell] || d <= score || dx && dy && (sim.ownSolid[cellIndex(x, Math.floor(c.y))] || sim.ownSolid[cellIndex(Math.floor(c.x), y)])) continue;
      best = cell; score = d;
    }
    if (best >= 0) { c.path = [best]; sim.followPath(c, cellCenter(best), CIVILIAN.speed * 1.8, dt); }
    c.state = "toJob"; c.thinkT = 0;
    return;
  }
  if (c.state === "flee") return flee(sim, c, dt);
  c.thinkT -= dt;
  const b = sim.map.buildings[sim.map.owner[c.job]];
  if (c.jobKind === "sand") {
    if ((sim.atmosphere?.sand[c.job] ?? 0) < CLEANUP_DEPTH || c.thinkT <= 0 && pickJob(sim, c, c.job, c, true) >= 0) assignNext(sim, c);
  } else if (!b || !canRepair(sim, b) || sim.civilians.some(o => o !== c && o.hp > 0 && o.job >= 0 && o.jobKind !== "sand" && sim.map.owner[o.job] === b.id)) assignNext(sim, c);
  // Skilled crews reconsider critical jobs in transit, without throwing away completed work.
  if (c.state === "toJob" && c.thinkT <= 0 && repairRank(sim.bonuses.repair, "triage")) assignNext(sim, c);
  if (c.state === "home") return goHome(sim, c, dt);
  const target = cellCenter(c.stand ?? c.job);
  if (dist(target.x - c.x, target.y - c.y) > .35) {
    c.state = "toJob";
    if (c.thinkT <= 0) { c.path = findPath(sim.ownSolid, c, target, ERRAND) ?? []; c.thinkT = REPAIR.rethink; }
    sim.followPath(c, target, CIVILIAN.speed, dt); return;
  }
  c.path = []; c.state = "working";
  if (c.jobKind === "sand") { sim.atmosphere?.clean(c.job, dt * .35); return; }
  const building = sim.map.buildings[sim.map.owner[c.job]];
  if (!building || !canRepair(sim, building)) return assignNext(sim, c);
  const craft = building.piece && wallRank(sim.bonuses.walls, "stonework") >= 3 ? STONEWORK.repair : building.kind === "gate" ? !sim.intact(building) && gateRank(sim.bonuses.gate, "ironbound") >= 3 ? IRONBOUND.rebuild : gateRank(sim.bonuses.gate, "ironbound") >= 2 ? IRONBOUND.repair : 1 : 1;
  const seconds = REPAIR.seconds * (rebuildSeconds(sim.levels.rebuildSpeed) / rebuildSeconds(0)) * sim.bonuses.rebuild / (1 + sim.levels.civilianCount * .1) / craft;
  if (sim.intact(building)) {
    sim.hp[building.id] = Math.min(sim.maxHp[building.id], sim.hp[building.id] + sim.maxHp[building.id] * dt / seconds);
    sim.changed.push(...building.cells);
  } else {
    c.work += dt / seconds;
    const share = 1 / building.cells.length;
    while (c.work + 1e-12 >= share) {
      const cell = building.cells.find(cell => !sim.solid[cell] && !icyCell(sim, cell));
      if (cell === undefined) break;
      sim.rebuildCell(cell); c.work = Math.max(0, c.work - share);
    }
  }
  if (!canRepair(sim, building)) assignNext(sim, c);
}

/** Take the nearest reachable board edge, then run beyond it. */
function panic(sim: DefendSim, c: Civilian) {
  const edges: { cell: number; exit: Point }[] = [];
  for (let x = 0; x < CELLS_W; x++) {
    edges.push({ cell: cellIndex(x, 0), exit: { x: x + .5, y: -2 } });
    edges.push({ cell: cellIndex(x, CELLS_H - 1), exit: { x: x + .5, y: CELLS_H + 2 } });
  }
  for (let y = 0; y < CELLS_H; y++) {
    edges.push({ cell: cellIndex(0, y), exit: { x: -2, y: y + .5 } });
    edges.push({ cell: cellIndex(CELLS_W - 1, y), exit: { x: CELLS_W + 2, y: y + .5 } });
  }
  edges.sort((a, b) => {
    const p = cellCenter(a.cell), q = cellCenter(b.cell);
    return dist(p.x - c.x, p.y - c.y) - dist(q.x - c.x, q.y - c.y);
  });
  for (const edge of edges) {
    const path = findPath(sim.ownSolid, c, cellCenter(edge.cell), { maxCost: CELL_COUNT, maxNodes: CELL_COUNT });
    if (!path) continue;
    c.state = "flee";
    c.job = -1;
    delete c.jobKind; delete c.cleanupCheck; delete c.stand;
    c.path = path;
    c.exit = edge.exit;
    return;
  }
}

function flee(sim: DefendSim, c: Civilian, dt: number) {
  if (!c.exit) return;
  if (c.path.length) {
    sim.followPath(c, null, CIVILIAN.speed * 1.8, dt);
    return;
  }
  const edge = { x: Math.max(.5, Math.min(CELLS_W - .5, c.exit.x)), y: Math.max(.5, Math.min(CELLS_H - .5, c.exit.y)) };
  const outside = c.x < .5 || c.x > CELLS_W - .5 || c.y < .5 || c.y > CELLS_H - .5;
  if (!outside && dist(edge.x - c.x, edge.y - c.y) >= .35) { panic(sim, c); return; }
  // Normal collision keeps units on the board. From the edge cell onward,
  // continue outside until the sprite has completely left the render.
  const dx = c.exit.x - c.x, dy = c.exit.y - c.y;
  const d = dist(dx, dy), step = Math.min(d, CIVILIAN.speed * 1.8 * dt);
  if (d) { c.x += dx / d * step; c.y += dy / d * step; }
}

export function escaped(c: Civilian) {
  const margin = CIVILIAN.size / 2 + .2;
  return c.state === "flee" && (c.x < -margin || c.y < -margin || c.x > CELLS_W + margin || c.y > CELLS_H + margin);
}


/** Carpentry is innate; combat buildings and stone defenses need their own skills. */
export function canRepair(sim: DefendSim, b: Building): boolean {
  if (!sim.ownsBuilding(b) || b.hidden || sim.aloft(b.id) || sim.intact(b) && sim.hp[b.id] >= sim.maxHp[b.id]) return false;
  if (b.kind === "keep") return sim.hp[b.id] > 0 && !!repairRank(sim.bonuses.repair, "advancedCarpentry");
  if (b.kind === "wall" || b.kind === "gate" || b.kind === "wallBallista") return !!repairRank(sim.bonuses.repair, "masonry");
  if (b.kind === "monsterBait") return restockable(sim, b) && !sim.intact(b);
  if (b.kind === "house" || b.kind === "repairShop") return true;
  return !!repairRank(sim.bonuses.repair, "advancedCarpentry");
}

function jobScore(sim: DefendSim, b: Building, from: Point) {
  const distance = rectDist(b.rect, from.x, from.y);
  if (!repairRank(sim.bonuses.repair, "triage")) return distance;
  const ruined = !sim.intact(b), critical = sim.hp[b.id] / sim.maxHp[b.id] < .35;
  const tier = b.kind === "keep" ? 0 : (b.kind === "gate" || b.kind === "wall") && ruined ? 1 : b.kind === "repairShop" ? 2 : b.kind !== "house" && (ruined || critical) ? 3 : critical ? 4 : 5;
  return tier * 1000 + sim.hp[b.id] / sim.maxHp[b.id] * 100 + distance;
}

function standFor(sim: DefendSim, b: Building, from: Point): number | undefined {
  const cells = sideCells(b.rect).filter(cell => !sim.ownSolid[cell] && !icyCell(sim, cell));
  cells.sort((a, b) => { const p = cellCenter(a), q = cellCenter(b); return dist(p.x - from.x, p.y - from.y) - dist(q.x - from.x, q.y - from.y); });
  for (const cell of cells) if (findPath(sim.ownSolid, from, cellCenter(cell), ERRAND)) return cell;
}

function pickJob(sim: DefendSim, from: Point, skip = -1, self?: Civilian, repairsOnly = false): number {
  const buildings = sim.map.buildings.filter(b => canRepair(sim, b) && b.cells[0] !== skip && !sim.civilians.some(c => c !== self && c.hp > 0 && c.job >= 0 && c.jobKind !== "sand" && sim.map.owner[c.job] === b.id));
  buildings.sort((a, b) => jobScore(sim, a, from) - jobScore(sim, b, from) || a.id - b.id);
  for (const b of buildings) {
    const p = center(b.rect);
    if (sim.enemiesNear(p.x, p.y, Math.max(b.rect.w, b.rect.h) / 2 + REPAIR.danger).some(e => e.hp > 0 && !e.untargetable)) continue;
    if (b.cells.every(cell => icyCell(sim, cell))) continue;
    if (standFor(sim, b, from) !== undefined) return b.cells[0];
  }
  if (repairsOnly) return -1;
  for (const cell of sim.atmosphere?.cleanup ?? []) {
    if (cell === skip || sim.ownSolid[cell] || icyCell(sim, cell) || sim.civilians.some(c => c !== self && c.hp > 0 && c.job === cell)) continue;
    const p = cellCenter(cell);
    if (!sim.enemiesNear(p.x, p.y, REPAIR.danger).length && findPath(sim.ownSolid, from, p, ERRAND)) return cell;
  }
  return -1;
}

function assignNext(sim: DefendSim, c: Civilian) {
  const job = pickJob(sim, c, -1, c), previous = c.job;
  c.path = []; delete c.stand; c.thinkT = REPAIR.rethink;
  if (job >= 0) {
    c.job = job; c.state = "toJob";
    if (previous !== job) c.work = 0;
    if (sim.map.owner[job] < 0) c.jobKind = "sand";
    else { delete c.jobKind; c.stand = standFor(sim, sim.map.buildings[sim.map.owner[job]], c); }
    c.path = findPath(sim.ownSolid, c, cellCenter(c.stand ?? c.job), ERRAND) ?? [];
  } else { delete c.jobKind; c.job = -1; c.state = "home"; c.thinkT = 0; }
}

function goHome(sim: DefendSim, c: Civilian, dt: number) {
  const original = sim.map.buildings[c.shop ?? c.home];
  const homes = [original, ...sim.map.buildings.filter(b => b.kind === "repairShop" && b.id !== original?.id)];
  for (const b of homes) if (b && sim.intact(b)) {
    const cell = standFor(sim, b, c);
    if (cell === undefined) continue;
    c.home = b.id;
    if (!c.path.length || c.thinkT <= 0) { c.path = findPath(sim.ownSolid, c, cellCenter(cell), ERRAND) ?? []; c.thinkT = 1; }
    sim.followPath(c, cellCenter(cell), CIVILIAN.speed, dt); return;
  }
  // Surviving workers may rebuild their fallen shop. Without a reachable
  // refuge they leave the board and release their slot.
  if (pickJob(sim, c, -1, c) >= 0) assignNext(sim, c);
  else { panic(sim, c); flee(sim, c, dt); }
}

export function atHome(sim: DefendSim, c: Civilian): boolean {
  const b = sim.map.buildings[c.home];
  return c.state === "home" && !!b && sim.intact(b) && rectDist(b.rect, c.x, c.y) < .7;
}
