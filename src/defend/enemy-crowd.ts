/** Ground-body packing and Blight contact transfer. A live sparse quarter-cell
 * index bounds local work by physical occupancy, never the crowd's total size.
 * Targets/links are transient; no RNG, rendering measurements or saved state. */
import { ENEMIES, enemySize } from "./catalog.ts";
import { CELLS_H, CELLS_W } from "./grid.ts";
import { blocked } from "./pathing.ts";
import type { Building } from "./citygen.ts";
import type { Civilian, DefendSim, Enemy, Soldier } from "./sim.ts";

const RES = 4, W = CELLS_W * RES, H = CELLS_H * RES, EPS = 1e-9;
export type CrowdTarget = { building: Building } | { unit: Soldier | Civilian };
type Body = { e: Enemy; hx: number; hy: number; x0: number; x1: number; y0: number; y1: number;
  ix: number; iy: number; epoch: number; stable: boolean; anchorX: number; anchorY: number; targetX: number; targetY: number; indexed: boolean; seen: number; target: CrowdTarget | null; previous: CrowdTarget | null; resolved: CrowdTarget | null; queued: boolean; planX: number; planY: number; previousSource: Body | null; source: Body | null; visited: boolean;
  waiting?: { x: number; y: number } };
type Spiral = { x: number; y: number; dx: number; dy: number; leg: number; step: number; turns: number };
export const groundBody = (e: Enemy) => e.hp > 0 && e.kind !== "blightWorm" && !e.raidProxy && !e.fortressPart && !ENEMIES[e.kind].flying && e.impaled === undefined && !(e.kind === "burrowingMole" && (e.burrow ?? 1) > 0);
const blight = (b: Body) => groundBody(b.e) && ENEMIES[b.e.kind].faction === "darkOne" && !b.waiting;

export class EnemyCrowd {
  active = false;
  readonly work = { candidates: 0, placements: 0, relayVisits: 0, waiting: 0 };
  private sim!: DefendSim;
  private bodies = new Map<Enemy, Body>();
  private cells: (Body[] | undefined)[] = new Array(W * H);
  private used: number[] = [];
  private stamps = new Uint32Array(W * H);
  private epoch = 0;
  private living = new Set<Enemy>();
  private members: Body[] = [];
  private queue: Body[] = [];
  private spills = new Map<string, Spiral>();
  private query = 0;
  private placementBudget = 0;
  private unchanged = false;

  begin(sim: DefendSim) {
    this.sim = sim; this.active = true; this.unchanged = true;
    this.work.candidates = this.work.placements = this.work.relayVisits = this.work.waiting = 0;
    for (const i of this.used) this.cells[i]!.length = 0;
    this.used.length = this.members.length = this.queue.length = 0;
    this.epoch++; this.living.clear();
    this.placementBudget = Math.max(128, sim.enemies.length * 8);
    for (const e of sim.enemies) this.living.add(e);
    for (const [e] of this.bodies) if (!groundBody(e) || !this.living.has(e)) { this.bodies.delete(e); this.unchanged = false; }
    for (const e of sim.enemies) this.add(e, true);
    // Bodies kept in place by the previous phase already satisfy packing.
    // Reserve them first; only new or externally displaced bodies need repair.
    for (const b of this.members) if (b.stable) this.insert(b);
    for (const b of this.members) if (!b.stable) this.settle(b);
  }
  add(e: Enemy, defer = false) {
    if (!this.active || !groundBody(e)) return;
    let b = this.bodies.get(e);
    if (!b) {
      b = { e, hx: 0, hy: 0, ix: e.x, iy: e.y, epoch: 0, stable: false, anchorX: 0, anchorY: 0, targetX: 0, targetY: 0, x0: 0, x1: -1, y0: 0, y1: -1, indexed: false, seen: 0, target: null, previous: null, resolved: null, queued: false, planX: NaN, planY: NaN, previousSource: null, source: null, visited: false };
      this.bodies.set(e, b);
    } else if (b.epoch === this.epoch) return;
    const hx = Math.max(1 / 16, enemySize(e) / 2), hy = Math.max(1 / 16, (ENEMIES[e.kind].fortress?.height ?? enemySize(e)) / 2);
    b.stable = b.epoch === this.epoch - 1 && b.ix === e.x && b.iy === e.y && b.hx === hx && b.hy === hy && !b.waiting;
    if (!b.stable || b.planX !== e.x || b.planY !== e.y) this.unchanged = false;
    b.epoch = this.epoch; b.hx = hx; b.hy = hy;
    b.indexed = false; b.previous = b.target; b.target = b.resolved = null; b.previousSource = b.source; b.source = null; b.queued = false; b.visited = false;
    this.members.push(b);
    if (b.waiting) { e.x = b.waiting.x; e.y = b.waiting.y; }
    if (!defer) this.settle(b);
  }
  end() { this.active = false; }
  holds(e: Enemy) { return this.active && !!this.bodies.get(e)?.waiting; }
  queued(e: Enemy) { return this.active && !!this.bodies.get(e)?.queued; }
  has(e: Enemy) { return this.active && !!this.bodies.get(e)?.indexed; }

  /** Local exact queries deduplicate bodies spanning several buckets. Valid
   * non-overlapping bodies keep each bucket small even in a 10,000-unit horde. */
  private visit(x0: number, y0: number, x1: number, y1: number, fn: (b: Body) => void) {
    const seen = ++this.query;
    const left = Math.max(0, Math.floor(x0 * RES)), right = Math.min(W - 1, Math.floor(x1 * RES));
    const top = Math.max(0, Math.floor(y0 * RES)), bottom = Math.min(H - 1, Math.floor(y1 * RES));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const list = this.cells[y * W + x]; if (!list) continue;
      for (const b of list) {
        if (b.seen === seen) continue; b.seen = seen;
        if (!groundBody(b.e)) continue;
        this.work.candidates++; fn(b);
      }
    }
  }
  private remove(b: Body) {
    if (!b.indexed) return;
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const list = this.cells[y * W + x]!, i = list.indexOf(b);
      if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); }
    }
    b.indexed = false;
  }
  private insert(b: Body) {
    const e = b.e;
    b.x0 = Math.max(0, Math.floor((e.x - b.hx + EPS) * RES)); b.x1 = Math.min(W - 1, Math.floor((e.x + b.hx - EPS) * RES));
    b.y0 = Math.max(0, Math.floor((e.y - b.hy + EPS) * RES)); b.y1 = Math.min(H - 1, Math.floor((e.y + b.hy - EPS) * RES));
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const i = y * W + x, list = this.cells[i] ??= [];
      if (this.stamps[i] !== this.epoch) { this.stamps[i] = this.epoch; this.used.push(i); }
      list.push(b);
    }
    b.ix = e.x; b.iy = e.y; b.indexed = true;
  }
  private overlaps(b: Body, x: number, y: number) {
    let collision = false;
    this.visit(x - b.hx + EPS, y - b.hy + EPS, x + b.hx - EPS, y + b.hy - EPS, o => {
      if (o !== b && Math.abs(x - o.e.x) < b.hx + o.hx - EPS && Math.abs(y - o.e.y) < b.hy + o.hy - EPS) collision = true;
    });
    return collision;
  }
  private open(b: Body, x: number, y: number) {
    return x - b.hx >= 0 && y - b.hy >= 0 && x + b.hx < CELLS_W && y + b.hy < CELLS_H &&
      !blocked(this.sim.foeSolid, x, y, Math.min(.18, b.hx) - EPS) && !this.overlaps(b, x, y);
  }
  private settle(b: Body) {
    const e = b.e;
    if (!this.overlaps(b, e.x, e.y) && (!b.waiting || this.open(b, e.x, e.y))) { delete b.waiting; this.insert(b); return; }
    const ox = e.x, oy = e.y;
    const key = `${Math.floor(ox * RES)},${Math.floor(oy * RES)}:${b.hx},${b.hy}`;
    let spiral = this.spills.get(key);
    if (!spiral) {
      if (this.spills.size >= 2048) this.spills.delete(this.spills.keys().next().value!);
      this.spills.set(key, spiral = { x: 0, y: 0, dx: 1, dy: 0, leg: 1, step: 0, turns: 0 });
    }
    // Shared cursors avoid restarting a growing search for every coincident
    // spawn. Only exceptional overlaps/spawns need this placement pass.
    for (let n = 0; n < 64 && this.placementBudget > 0; n++) {
      this.placementBudget--;
      const maxLeg = 2 * Math.max(Math.ceil(CELLS_W / (2 * b.hx)), Math.ceil(CELLS_H / (2 * b.hy))) + 4;
      if (spiral.leg > maxLeg) Object.assign(spiral, { x: 0, y: 0, dx: 1, dy: 0, leg: 1, step: 0, turns: 0 });
      spiral.x += spiral.dx; spiral.y += spiral.dy;
      if (++spiral.step === spiral.leg) {
        spiral.step = 0; const dx = spiral.dx; spiral.dx = -spiral.dy; spiral.dy = dx;
        if (++spiral.turns % 2 === 0) spiral.leg++;
      }
      this.work.placements++;
      const x = ox + spiral.x * b.hx * 2, y = oy + spiral.y * b.hy * 2;
      if (!this.open(b, x, y)) continue;
      // Never repair a spawn by teleporting through a wall.
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x - ox), Math.abs(y - oy)) / .2));
      let free = true;
      for (let i = 1; i < steps; i++) if (blocked(this.sim.foeSolid, ox + (x - ox) * i / steps, oy + (y - oy) * i / steps, Math.min(.18, b.hx) - EPS)) { free = false; break; }
      if (!free) continue;
      e.x = x; e.y = y; delete b.waiting; this.insert(b); return;
    }
    // A completely full/trapped entry waits outside the board and retries;
    // it never becomes an overlapping or untargetable body inside the army.
    b.waiting ??= { x: ox, y: oy };
    e.x = -1 - e.id * (2 * b.hx + .125); e.y = -1;
    this.work.waiting++;
  }

  /** Reconcile an intentional teleport/relocation after its ability acts. */
  sync(e: Enemy) {
    if (!this.active) return;
    const b = this.bodies.get(e); if (!b || !groundBody(e) || b.waiting || b.ix === e.x && b.iy === e.y) return;
    this.remove(b); this.settle(b);
  }

  syncMoved() { if (this.active) for (const b of this.members) this.sync(b.e); }

  /** Axis sweeps catch the first body, including large steps. Touching body
   * fills have no gap, so the existing union contours show only the exterior. */
  move(e: Enemy, dx: number, dy: number, free?: (x: number, y: number) => boolean) {
    const b = this.active ? this.bodies.get(e) : undefined;
    if (b?.waiting) return;
    if (!b?.indexed || !groundBody(e)) { if (!free || free(e.x + dx, e.y + dy)) { e.x += dx; e.y += dy; } return; }
    const axis = (d: number, horizontal: boolean) => {
      if (!d) return;
      let allowed = d;
      const left = e.x - b.hx + Math.min(0, horizontal ? d : 0), right = e.x + b.hx + Math.max(0, horizontal ? d : 0);
      const top = e.y - b.hy + Math.min(0, horizontal ? 0 : d), bottom = e.y + b.hy + Math.max(0, horizontal ? 0 : d);
      this.visit(left - EPS, top - EPS, right + EPS, bottom + EPS, o => {
        if (o === b) return;
        const cross = horizontal ? Math.abs(e.y - o.e.y) < b.hy + o.hy - EPS : Math.abs(e.x - o.e.x) < b.hx + o.hx - EPS;
        if (!cross) return;
        const distance = horizontal ? o.e.x - e.x : o.e.y - e.y, extent = horizontal ? b.hx + o.hx : b.hy + o.hy;
        if (d > 0 && distance >= extent - EPS) allowed = Math.min(allowed, Math.max(0, distance - extent));
        else if (d < 0 && distance <= -extent + EPS) allowed = Math.max(allowed, Math.min(0, distance + extent));
      });
      const x = e.x + (horizontal ? allowed : 0), y = e.y + (horizontal ? 0 : allowed);
      if (!free || free(x, y)) { e.x = x; e.y = y; }
    };
    this.remove(b); // querying needs only other bodies; reinsert after both axes.
    axis(dx, true); axis(dy, false); this.insert(b);
  }

  target(e: Enemy, target: CrowdTarget) {
    if (!this.active) return;
    const b = this.bodies.get(e); if (b?.indexed) b.target = target;
  }
  /** Geometry is validated once per source. During a transfer pass only
   * damage callbacks can change it: stop immediately on death or displacement. */
  private endpointLive(root: Body) {
    const t = root.resolved!;
    if (!groundBody(root.e) || root.e.x !== root.anchorX || root.e.y !== root.anchorY) return false;
    if ("building" in t) return this.sim.intact(t.building) && t.building.rect.x === root.targetX && t.building.rect.y === root.targetY;
    return t.unit.hp > 0 && t.unit.x === root.targetX && t.unit.y === root.targetY;
  }

  prime(valid: (e: Enemy, t: CrowdTarget) => boolean) {
    if (!this.active) return;
    // A stationary formation with the same valid seeds has exactly the same
    // connectivity. Reuse its prior ownership rather than flood it twice.
    if (this.unchanged) {
      let sameSeeds = true;
      for (const b of this.members) if (b.previous) {
        if (valid(b.e, b.previous) !== (b.previousSource === b)) { sameSeeds = false; break; }
      }
      if (sameSeeds) {
        for (const b of this.members) b.queued = !!b.previousSource && b.previousSource !== b;
        return;
      }
    }
    this.transfer(valid, undefined, true);
  }

  /** Multi-source breadth-first transfer: one visit per touching Blight body,
   * never a recursive chain walk for each rear attacker. */
  transfer(valid: (e: Enemy, t: CrowdTarget) => boolean, attack?: (e: Enemy, front: Enemy, t: CrowdTarget) => void, preview = false) {
    if (!this.active) return;
    this.queue.length = 0;
    for (const b of this.members) {
      b.visited = false; b.source = null; b.resolved = null;
      if (!preview) { b.planX = b.e.x; b.planY = b.e.y; }
    }
    for (const b of this.members) {
      const target = preview ? b.previous : b.target;
      if (blight(b) && target && valid(b.e, target)) {
        b.source = b; b.resolved = target; b.visited = true;
        b.anchorX = b.e.x; b.anchorY = b.e.y;
        b.targetX = "building" in target ? target.building.rect.x : target.unit.x;
        b.targetY = "building" in target ? target.building.rect.y : target.unit.y; this.queue.push(b);
      }
    }
    this.queue.sort((a, b) => a.e.id - b.e.id);
    for (let i = 0; i < this.queue.length; i++) {
      const b = this.queue[i], e = b.e, root = b.source!;
      if (!preview) this.work.relayVisits++;
      if (!blight(b) || !root.resolved || !this.endpointLive(root)) continue;
      if (b !== root) {
        if (preview) b.queued = true;
        else if (e.cd <= 0 && !e.freeze && !e.stagger && !e.blink) attack?.(e, root.e, root.resolved);
      }
      if (!groundBody(e) || !this.endpointLive(root)) continue;
      this.visit(e.x - b.hx - EPS * 4, e.y - b.hy - EPS * 4, e.x + b.hx + EPS * 4, e.y + b.hy + EPS * 4, o => {
        if (o.visited || !blight(o)) return;
        const dx = Math.abs(e.x - o.e.x), dy = Math.abs(e.y - o.e.y), hx = b.hx + o.hx, hy = b.hy + o.hy;
        const touching = Math.abs(dx - hx) <= EPS * 8 && dy < hy - EPS || Math.abs(dy - hy) <= EPS * 8 && dx < hx - EPS;
        if (!touching) return;
        o.visited = true; o.source = root; this.queue.push(o);
      });
    }
  }
}
