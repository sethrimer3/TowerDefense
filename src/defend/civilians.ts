/** DEFEND civilians rebuild rubble one cell at a time. A fixed pool of slots
 * (the Guild of builders level) sends a civilian out of the house nearest
 * the best job whenever a slot is free; each walks to its job, works it
 * until rebuilt (backing off when enemies come close), takes the next job,
 * and goes indoors when there's nothing left. A killed civilian's slot
 * refills after a delay. */
import { dist } from "../exact.ts";
import { CIVILIAN, civilianCount, civilianHp, rebuildSeconds, type UpgradeId } from "./catalog.ts";
import { cellAt, cellCenter, center, findPath, rectDist, type Point } from "./pathing.ts";
import { CELL_COUNT, CELLS_H, CELLS_W, cellInBounds, cellIndex, cellX, cellY, sideCells } from "./grid.ts";
import { CellType } from "./citygen.ts";
import type { Civilian, DefendSim } from "./sim.ts";
import { restockable } from "./bait.ts";
import { icyCell } from "./boats.ts";
import { CLEANUP_DEPTH } from "./atmosphere.ts";

/** Paths for civilians give up beyond this many cells. */
const ERRAND = { maxCost: 400 };

export class Builders {
  /** Per slot: seconds until it can send out a civilian again (0 = ready). */
  readonly respawn: number[];
  private refugeVersion = -1;
  private refuge = new Uint8Array(CELL_COUNT);
  private escapeChecks = new WeakMap<Civilian, number>();

  constructor(levels: Record<UpgradeId, number>) {
    this.respawn = Array(civilianCount(levels.civilianCount)).fill(0);
  }

  step(sim: DefendSim, dt: number) {
    if (this.freeSlots(sim, dt) > 0) {
      const job = pickJob(sim, center(sim.keep.rect));
      if (job >= 0) spawnCivilian(sim, job);
    }
    for (const c of sim.civilians) if (c.hp > 0) {
      if (c.state !== "flee" && sim.map.type[cellAt(c.x, c.y)] === CellType.OUT && !this.canReturn(sim, c) && this.escapeChecks.get(c) !== sim.mapVersion) {
        this.escapeChecks.set(c, sim.mapVersion);
        panic(sim, c);
      }
      stepCivilian(sim, c, dt);
    }
    // Civilians who died free their slot after a delay.
    for (const c of sim.civilians) if (c.hp <= 0) this.startRespawn();
  }

  /** Flood from intact homes once per city change. Use the citizens' gate
   * access and the same corner rules as their walking paths. */
  private canReturn(sim: DefendSim, c: Civilian) {
    if (this.refugeVersion !== sim.mapVersion) {
      this.refugeVersion = sim.mapVersion;
      this.refuge.fill(0);
      const queue: number[] = [];
      for (const b of sim.map.buildings) if ((b.kind === "house" || b.kind === "keep") && sim.intact(b))
        for (const cell of sideCells(b.rect)) if (!sim.ownSolid[cell] && !this.refuge[cell]) {
          this.refuge[cell] = 1;
          queue.push(cell);
        }
      for (let i = 0; i < queue.length; i++) {
        const x = cellX(queue[i]), y = cellY(queue[i]);
        for (const [dx, dy] of AROUND) {
          if (!cellInBounds(x + dx, y + dy)) continue;
          const next = cellIndex(x + dx, y + dy);
          if (this.refuge[next] || sim.ownSolid[next]) continue;
          if (dx && dy && (sim.ownSolid[cellIndex(x + dx, y)] || sim.ownSolid[cellIndex(x, y + dy)])) continue;
          this.refuge[next] = 1;
          queue.push(next);
        }
      }
    }
    return !!this.refuge[cellAt(c.x, c.y)];
  }

  /** Counts slots down; how many are ready beyond the civilians already out. */
  private freeSlots(sim: DefendSim, dt: number) {
    let free = 0;
    for (let i = 0; i < this.respawn.length; i++) {
      if (this.respawn[i] > 0) this.respawn[i] -= dt;
      else free++;
    }
    return free - sim.civilians.length;
  }

  private startRespawn() {
    const slot = this.respawn.findIndex((t) => t <= 0);
    if (slot >= 0) this.respawn[slot] = CIVILIAN.respawnSeconds;
  }
}

function stepCivilian(sim: DefendSim, c: Civilian, dt: number) {
  if (c.state === "flee") return flee(sim, c, dt);
  if (c.jobKind === "sand") {
    c.cleanupCheck = (c.cleanupCheck ?? 0) - dt;
    if (c.cleanupCheck <= 0) {
      c.cleanupCheck = .5;
      if (!openRepairs(sim, -1).next().done) assignNext(sim, c);
    }
  }
  c.thinkT -= dt;
  if (c.state === "toJob") goToJob(sim, c, dt);
  else if (c.state === "working") work(sim, c, dt);
  else goHome(sim, c, dt);
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

function goToJob(sim: DefendSim, c: Civilian, dt: number) {
  if (c.jobKind === "sand" && (sim.atmosphere?.sand[c.job] ?? 0) < CLEANUP_DEPTH) return assignNext(sim, c);
  if (sim.solid[c.job] || !jobOpen(sim, c.job, c)) return assignNext(sim, c);
  const j = cellCenter(c.stand ?? c.job);
  if (dist(j.x - c.x, j.y - c.y) < 0.35) {
    c.state = "working";
    c.work = 0;
    return;
  }
  if (!c.path.length && c.thinkT <= 0) {
    c.thinkT = 1;
    c.path = findPath(sim.ownSolid, c, j, ERRAND) ?? [];
    // Walled in: work it from an open cell beside it instead.
    if (!c.path.length && c.stand === undefined && standBeside(sim, c)) return;
    // Unreachable: try another job next time (but still step toward this one now).
    if (!c.path.length && dist(j.x - c.x, j.y - c.y) > 1.5) assignNext(sim, c, c.job);
  }
  sim.followPath(c, j, CIVILIAN.speed, dt);
}

/** The eight cells round a job, sides first. */
const AROUND = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]] as const;

/** A job no one can stand in (the last cell of a building rebuilt round
 * it): the civilian takes the first open cell beside it they can reach as
 * where to work from (a corner will do). False if there is none. */
function standBeside(sim: DefendSim, c: Civilian): boolean {
  const jx = cellX(c.job), jy = cellY(c.job);
  for (const [dx, dy] of AROUND) {
    if (!cellInBounds(jx + dx, jy + dy)) continue;
    const n = cellIndex(jx + dx, jy + dy);
    if (sim.solid[n]) continue;
    const path = findPath(sim.ownSolid, c, cellCenter(n), ERRAND);
    if (!path) continue;
    c.stand = n;
    c.path = path;
    return true;
  }
  return false;
}

function work(sim: DefendSim, c: Civilian, dt: number) {
  if (sim.solid[c.job] || icyCell(sim, c.job)) return assignNext(sim, c);
  // Too dangerous: come back to it later.
  if (sim.enemiesNear(c.x, c.y, 2.5).length) return assignNext(sim, c, c.job);
  if (c.jobKind === "sand") {
    sim.atmosphere?.clean(c.job, dt * .35);
    c.work += dt;
    if ((sim.atmosphere?.sand[c.job] ?? 0) < CLEANUP_DEPTH) assignNext(sim, c);
    return;
  }
  c.work += dt;
  if (c.work < rebuildSeconds(sim.levels.rebuildSpeed) * sim.bonuses.rebuild) return;
  sim.rebuildCell(c.job);
  assignNext(sim, c);
}

function goHome(sim: DefendSim, c: Civilian, dt: number) {
  const home = sim.map.buildings[c.home];
  const hx = center(home.rect);
  if (!c.path.length && c.thinkT <= 0) {
    c.thinkT = 1;
    const homes = [home, ...sim.map.buildings.filter(b => b.id !== home.id && (b.kind === "house" || b.kind === "keep") && sim.intact(b))];
    for (const b of homes) {
      if (!sim.intact(b)) continue;
      const preferred = sim.doorOf(b);
      for (const door of [preferred, ...sideCells(b.rect).filter(cell => cell !== preferred)]) {
        if (door < 0) continue;
        const path = findPath(sim.ownSolid, c, cellCenter(door), { maxCost: CELL_COUNT, maxNodes: CELL_COUNT });
        if (!path) continue;
        c.home = b.id;
        c.path = path;
        sim.followPath(c, center(b.rect), CIVILIAN.speed, dt);
        return;
      }
    }
  }
  sim.followPath(c, hx, CIVILIAN.speed, dt);
}

/** Home and standing beside an intact house: it goes indoors. */
export function atHome(sim: DefendSim, c: Civilian): boolean {
  if (c.state !== "home") return false;
  const b = sim.map.buildings[c.home];
  return sim.intact(b) && rectDist(b.rect, c.x, c.y) < 0.7;
}

/** No other civilian out and about has already taken this cell. */
function jobOpen(sim: DefendSim, cell: number, self?: Civilian): boolean {
  if (icyCell(sim, cell)) return false;
  return !sim.civilians.some((o) => o !== self && o.hp > 0 && o.state !== "home" && o.job === cell);
}

/** Rubble most worth rebuilding: structures, then walls, then houses —
 * nearest first, skipping anything with enemies close by. */
function pickJob(sim: DefendSim, from: Point, skip = -1): number {
  let best = -1,
    bestScore = Infinity;
  for (const { cell, tier } of openJobs(sim, skip)) {
    const p = cellCenter(cell);
    const score = tier * 1000 + dist(p.x - from.x, p.y - from.y);
    if (score < bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return best;
}

/** Every rubble cell a civilian could take, with its building's tier. */
function* openJobs(sim: DefendSim, skip: number) {
  yield* openRepairs(sim, skip);
  for (const cell of sim.atmosphere?.cleanup ?? [])
    if (jobAvailable(sim, cell, skip)) yield { cell, tier: 3 };
}

function* openRepairs(sim: DefendSim, skip: number) {
  for (const b of sim.map.buildings) {
    if (sim.intact(b) || b.kind === "keep") continue;
    // Fallen bait waits for Restocking.
    if (b.kind === "monsterBait" && !restockable(sim, b)) continue;
    const tier = b.kind === "house" ? 2 : b.kind === "wall" || b.kind === "gate" ? 1 : 0;
    for (const cell of b.cells) if (jobAvailable(sim, cell, skip)) yield { cell, tier };
  }
}

/** Rubble nobody else has taken, with no enemy within 3 cells. */
function jobAvailable(sim: DefendSim, cell: number, skip: number) {
  if (cell === skip || sim.solid[cell]) return false;
  if (!jobOpen(sim, cell)) return false;
  const p = cellCenter(cell);
  return !sim.enemiesNear(p.x, p.y, 3).length;
}

/** The next job, or home to the nearest house when there is none. */
function assignNext(sim: DefendSim, c: Civilian, skip = -1) {
  c.path = [];
  delete c.stand;
  c.thinkT = 0;
  const job = pickJob(sim, c, skip);
  if (job >= 0) {
    c.job = job;
    if (sim.map.owner[job] < 0) c.jobKind = "sand";
    else { delete c.jobKind; delete c.cleanupCheck; }
    c.state = "toJob";
  } else {
    delete c.jobKind; delete c.cleanupCheck;
    c.job = -1;
    c.state = "home";
    c.home = nearestHouse(sim, c);
  }
}

/** The intact house nearest `p`, or the keep if none stands. */
function nearestHouse(sim: DefendSim, p: Point): number {
  let best = sim.keepId,
    bd = Infinity;
  for (const b of sim.map.buildings) {
    if (b.kind !== "house" || !sim.intact(b)) continue;
    const d = rectDist(b.rect, p.x, p.y);
    if (d < bd) {
      bd = d;
      best = b.id;
    }
  }
  return best;
}

/** A civilian comes out of the house nearest the job. */
function spawnCivilian(sim: DefendSim, job: number) {
  const house = sim.map.buildings[nearestHouse(sim, cellCenter(job))];
  const door = sim.doorOf(house);
  if (door < 0) return;
  const hp = civilianHp(sim.levels.civilianHealth);
  const at = cellCenter(door);
  sim.civilians.push({
    id: sim.newId(),
    x: at.x,
    y: at.y,
    hp,
    maxHp: hp,
    job,
    ...(sim.map.owner[job] < 0 ? { jobKind: "sand" as const } : {}),
    state: "toJob",
    work: 0,
    path: [],
    home: house.id,
    thinkT: 0,
    flash: 0,
  });
}
