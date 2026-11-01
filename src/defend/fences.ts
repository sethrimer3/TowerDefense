import { enemyFlying } from "./catalog.ts";
import { enemySize } from "./catalog.ts";
/** Thin wooden fences ringing some parks. Purely
 * decorative — nothing is blocked by them — but enemies that walk across a
 * section (or a blast next to it) snap it: it splinters into pieces that
 * scatter, settle on the ground and fade away after 5–10 seconds. Fences
 * live only in the renderer and are rebuilt fresh for every city/run. */
import { CELL_COUNT, CELLS_W, ORTHO, cellInBounds, cellIndex, defendRandom, hash01 } from "./grid.ts";

const fx = defendRandom("effects");
import { CellType, type CityMap } from "./citygen.ts";
import { ENEMIES } from "./catalog.ts";
import type { DefendSim, Effect } from "./sim.ts";

/** One cell-long section of fence, in cell coordinates. */
export type FenceSection = { x1: number; y1: number; x2: number; y2: number; broken: boolean };
type Splinter = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; len: number; age: number; life: number; shade: number };

/** How far inside the park edge the fence runs (cells). */
const INSET = 0.125;
/** Share of parks that are fenced. */
const FENCED = 0.6;
/** Blasts remembered so each breaks fences once; forgotten past this many. */
const BLAST_MEMORY = 200;
const OUTLINE = "#1c140c";

const isPark = (map: CityMap, i: number) => map.type[i] === CellType.PARK || map.type[i] === CellType.WATER;

/** The in-bounds orthogonal neighbours of cell `c`, with their direction. */
function* neighbours(c: number): Generator<[number, number, number]> {
  const x = c % CELLS_W,
    y = (c - x) / CELLS_W;
  for (const [dx, dy] of ORTHO) if (cellInBounds(x + dx, y + dy)) yield [cellIndex(x + dx, y + dy), dx, dy];
}

export function parkFences(map: CityMap): FenceSection[] {
  const out: FenceSection[] = [];
  const flooded = new Uint8Array(CELL_COUNT);
  for (let start = 0; start < CELL_COUNT; start++) {
    if (!isPark(map, start) || flooded[start]) continue;
    const cells = floodPark(map, start, flooded);
    if (cells.length < 4 || hash01(start, 91) > FENCED) continue;
    const sections = cells.flatMap((c) => perimeterEdges(map, c));
    // Leave one straight section open as a gate (never a corner, so the
    // corners all keep their posts).
    const straight = sections.filter((s) => (s.x1 === s.x2 ? Math.abs(s.y2 - s.y1) : Math.abs(s.x2 - s.x1)) === 1);
    if (straight.length > 2) sections.splice(sections.indexOf(straight[Math.floor(hash01(start, 92) * straight.length)]), 1);
    out.push(...sections);
  }
  return out;
}

/** Every cell of the park holding `start`, grass and pond together. */
function floodPark(map: CityMap, start: number, flooded: Uint8Array): number[] {
  const cells = [start];
  flooded[start] = 1;
  for (let h = 0; h < cells.length; h++)
    for (const [n] of neighbours(cells[h]))
      if (isPark(map, n) && !flooded[n]) {
        flooded[n] = 1;
        cells.push(n);
      }
  return cells;
}

/** Whether (x, y) is a park cell (off the board is not). */
const parkAt = (map: CityMap, x: number, y: number) => cellInBounds(x, y) && isPark(map, cellIndex(x, y));

/** A fence section on each edge of park cell `c` that is the park's outer
 * edge, so each fenced park is ringed all round. Sections run `INSET` in
 * from the edge, and at each end are trimmed (a convex corner) or carried
 * on (a concave one) by `INSET` so the ring's sides meet exactly. */
function perimeterEdges(map: CityMap, c: number): FenceSection[] {
  const x = c % CELLS_W,
    y = (c - x) / CELLS_W;
  const out: FenceSection[] = [];
  for (const [dx, dy] of ORTHO) if (!parkAt(map, x + dx, y + dy)) out.push(edgeSection(map, x, y, dx, dy));
  return out;
}

/** How far the fence along cell (x, y)'s edge facing (dx, dy) carries past
 * the edge's end toward (sx, sy): -INSET where the ring turns outward
 * (convex), +INSET where it turns inward (concave), 0 running straight. */
function endShift(map: CityMap, x: number, y: number, dx: number, dy: number, sx: number, sy: number) {
  if (!parkAt(map, x + sx, y + sy)) return -INSET;
  return parkAt(map, x + sx + dx, y + sy + dy) ? INSET : 0;
}

/** The fence just inside cell (x, y)'s edge facing (dx, dy). */
function edgeSection(map: CityMap, x: number, y: number, dx: number, dy: number): FenceSection {
  if (dy !== 0) {
    const fy = dy < 0 ? y + INSET : y + 1 - INSET;
    return { x1: x - endShift(map, x, y, dx, dy, -1, 0), y1: fy, x2: x + 1 + endShift(map, x, y, dx, dy, 1, 0), y2: fy, broken: false };
  }
  const fx = dx < 0 ? x + INSET : x + 1 - INSET;
  return { x1: fx, y1: y - endShift(map, x, y, dx, dy, 0, -1), x2: fx, y2: y + 1 + endShift(map, x, y, dx, dy, 0, 1), broken: false };
}

/** The in-bounds cells of the 3×3 block around a section's midpoint. */
function cellsAround(s: FenceSection): number[] {
  const mx = Math.floor((s.x1 + s.x2) / 2),
    my = Math.floor((s.y1 + s.y2) / 2);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if (cellInBounds(mx + dx, my + dy)) out.push(cellIndex(mx + dx, my + dy));
  return out;
}

export class Fences {
  sections: FenceSection[] = [];
  splinters: Splinter[] = [];
  private map: CityMap | null = null;
  /** Sections indexed by every cell they touch, for cheap trampling checks. */
  private byCell = new Map<number, FenceSection[]>();
  private lastTime = -1;
  private seenBlasts = new Set<number>();

  sync(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.sections = parkFences(map);
    this.splinters = [];
    this.seenBlasts.clear();
    this.lastTime = -1;
    this.byCell.clear();
    for (const s of this.sections)
      for (const k of cellsAround(s)) {
        const list = this.byCell.get(k);
        if (list) list.push(s);
        else this.byCell.set(k, [s]);
      }
  }

  /** Trample and blast fences, and move the splinters along in sim time. */
  update(sim: DefendSim) {
    const dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(0.5, sim.time - this.lastTime));
    this.lastTime = sim.time;
    this.trample(sim);
    this.blast(sim);
    this.drift(dt);
  }

  /** Walking enemies snap the sections they touch. */
  private trample(sim: DefendSim) {
    for (const e of sim.enemies) {
      const def = ENEMIES[e.kind];
      if (enemyFlying(e)) continue;
      for (const s of this.byCell.get(cellIndex(Math.floor(e.x), Math.floor(e.y))) ?? [])
        if (!s.broken && segDist(s, e.x, e.y) < enemySize(e) / 2 + 0.06) this.snap(s, e.x, e.y);
    }
  }

  /** Each new blast snaps every section within its radius, once. */
  private blast(sim: DefendSim) {
    for (const fx of sim.effects) {
      if (!this.firstSight(fx)) continue;
      for (const s of this.sections) if (!s.broken && segDist(s, fx.x, fx.y) < fx.r) this.snap(s, fx.x, fx.y, 2.2);
    }
    if (this.seenBlasts.size > BLAST_MEMORY) this.seenBlasts.clear();
  }

  /** True the first time a blast is seen, remembering it. */
  private firstSight(fx: Effect) {
    if (fx.kind !== "boom" || fx.seed === undefined || this.seenBlasts.has(fx.seed)) return false;
    this.seenBlasts.add(fx.seed);
    return true;
  }

  /** Splinters slide, spin and slow, and are gone at the end of their life. */
  private drift(dt: number) {
    const drag = Math.exp(-5 * dt);
    for (const p of this.splinters) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.rot += p.vr * dt;
      p.vr *= drag;
    }
    this.splinters = this.splinters.filter((p) => p.age < p.life);
  }

  /** Break a section: it bursts into splinters flung away from the cause. */
  snap(s: FenceSection, fromX: number, fromY: number, force = 1) {
    s.broken = true;
    const n = 6 + Math.floor(fx() * 4);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = s.x1 + (s.x2 - s.x1) * t,
        y = s.y1 + (s.y2 - s.y1) * t;
      const d = Math.hypot(x - fromX, y - fromY) || 1;
      const speed = (0.8 + fx() * 1.6) * force;
      this.splinters.push({
        x,
        y,
        vx: ((x - fromX) / d) * speed + (fx() - 0.5) * 1.2,
        vy: ((y - fromY) / d) * speed + (fx() - 0.5) * 1.2,
        rot: fx() * Math.PI,
        vr: (fx() - 0.5) * 18,
        len: 0.12 + fx() * 0.22,
        age: 0,
        life: 5 + fx() * 5,
        shade: fx(),
      });
    }
  }

  draw(c: CanvasRenderingContext2D, px: number) {
    const intact = this.sections.filter((s) => !s.broken);
    c.save();
    drawRails(c, px, intact);
    drawPosts(c, px, intact);
    for (const p of this.splinters) drawSplinter(c, px, p);
    c.restore();
  }
}

/** An outpost's wooden fence at `ART` art pixels a cell, as stout as its
 * wooden gate: a rail `RAIL` art pixels thick along the ring's middle
 * line, and a post (`POST`, the gate's own) at every corner, at every
 * other cell and wherever the fence stops (a gate, a breach). */
const STOUT = { rail: 4, post: 5, tones: { rail: ["#6e4a2a", "#8a6038", "#a37446"], post: ["#4a2f19", "#5e3d22", "#76502e"], cap: "#87613a" } };

/** Standing fence sections drawn on their own (an Ambush outpost's fence
 * cells), all of them at once so the posts know where the fence stops. */
export function drawFenceSections(c: CanvasRenderingContext2D, px: number, sections: FenceSection[], shadow = false) {
  const intact = sections.filter((s) => !s.broken);
  const a = px / 8, snap = (v: number) => Math.round(v * a);
  // Fills art pixels [u0, u1) × [v0, v1), measured from cell point (x, y).
  const fill = (x: number, y: number, u0: number, v0: number, u1: number, v1: number, colour: string) => {
    const X0 = snap(x * 8 + u0), Y0 = snap(y * 8 + v0);
    c.fillStyle = colour;
    c.fillRect(X0, Y0, snap(x * 8 + u1) - X0, snap(y * 8 + v1) - Y0);
  };
  const { rail, post, tones } = STOUT, half = rail / 2;
  c.save();
  // With `shadow`, a shadow cast to the lower right first (where nothing
  // else casts the fence's).
  if (shadow)
    for (const s of intact) {
      const flat = s.y1 === s.y2, x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2), len = (flat ? Math.abs(s.x2 - s.x1) : Math.abs(s.y2 - s.y1)) * 8;
      if (flat) fill(x, y, -half + 2, half, len + half + 2, half + 2, "rgba(6,10,5,0.36)");
      else fill(x, y, half, -half + 2, half + 2, len + half + 2, "rgba(6,10,5,0.36)");
    }
  // The rails: outlined, lit along the top (or the left), shaded below.
  for (const s of intact) {
    const flat = s.y1 === s.y2, x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2), len = (flat ? Math.abs(s.x2 - s.x1) : Math.abs(s.y2 - s.y1)) * 8;
    const box = (o0: number, o1: number, l0: number, l1: number, colour: string) =>
      flat ? fill(x, y, l0, o0, l1, o1, colour) : fill(x, y, o0, l0, o1, l1, colour);
    box(-half, half, -half, len + half, OUTLINE);
    box(-half + 1, -half + 2, -half + 1, len + half - 1, tones.rail[2]);
    box(-half + 2, half - 1, -half + 1, len + half - 1, tones.rail[1]);
    for (let l = 3; l < len; l += 4) box(-half + 2, half - 1, l, l + 1, tones.rail[0]);
  }
  // The posts.
  const ends = new Map<string, { x: number; y: number; n: number }>();
  for (const s of intact)
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      const k = `${x * 2},${y * 2}`, e = ends.get(k);
      if (e) e.n++;
      else ends.set(k, { x, y, n: 1 });
    }
  const p0 = -Math.floor(post / 2), p1 = p0 + post;
  for (const { x, y, n } of ends.values()) {
    const corner = x % 1 !== 0 && y % 1 !== 0, along = x % 1 === 0 ? x : y;
    if (!corner && n > 1 && along % 2 !== 0) continue;
    fill(x, y, p0, p0, p1, p1, OUTLINE);
    fill(x, y, p0 + 1, p0 + 1, p1 - 1, p1 - 1, tones.post[1]);
    fill(x, y, p0 + 1, p0 + 1, p1 - 1, p0 + 3, tones.cap);
    fill(x, y, p0 + 1, p0 + 1, p0 + 2, p1 - 1, tones.post[2]);
    fill(x, y, p1 - 2, p0 + 3, p1 - 1, p1 - 1, tones.post[0]);
  }
  c.restore();
}
/** Rails: a dark outline with a lighter wooden core, filled on whole
 * device pixels about the same centres as the posts so every side is even
 * and meets its corners exactly. */
function drawRails(c: CanvasRenderingContext2D, px: number, sections: FenceSection[]) {
  const dark = Math.max(1, Math.round(px * 0.13)),
    light = Math.max(1, Math.round(px * 0.06));
  for (const [w, color] of [
    [dark, OUTLINE],
    [light, "#9a7648"],
  ] as const) {
    c.fillStyle = color;
    for (const s of sections) {
      const a0 = Math.round(Math.min(s.x1, s.x2) * px),
        a1 = Math.round(Math.max(s.x1, s.x2) * px),
        b0 = Math.round(Math.min(s.y1, s.y2) * px),
        b1 = Math.round(Math.max(s.y1, s.y2) * px);
      const off = Math.floor(w / 2);
      if (s.y1 === s.y2) c.fillRect(a0, b0 - off, a1 - a0, w);
      else c.fillRect(a0 - off, b0, w, b1 - b0);
    }
  }
}

/** Posts at each end of an intact section (one where sections meet). */
function drawPosts(c: CanvasRenderingContext2D, px: number, sections: FenceSection[]) {
  const post = Math.max(2, Math.round(px * 0.2)),
    off = Math.floor(post / 2);
  const done = new Set<number>();
  for (const s of sections)
    for (const [x, y] of [
      [s.x1, s.y1],
      [s.x2, s.y2],
    ]) {
      const X = Math.round(x * px) - off,
        Y = Math.round(y * px) - off;
      const key = X * 65536 + Y;
      if (done.has(key)) continue;
      done.add(key);
      c.fillStyle = OUTLINE;
      c.fillRect(X, Y, post, post);
      c.fillStyle = "#7a5a34";
      c.fillRect(X + 1, Y + 1, Math.max(1, post - 2), Math.max(1, post - 2));
    }
}

/** A splinter, fading out over its last couple of seconds. */
function drawSplinter(c: CanvasRenderingContext2D, px: number, p: Splinter) {
  c.globalAlpha = Math.min(1, (p.life - p.age) / 2);
  c.save();
  c.translate(p.x * px, p.y * px);
  c.rotate(p.rot);
  const L = p.len * px,
    W = Math.max(1, px * 0.06);
  c.fillStyle = OUTLINE;
  c.fillRect(-L / 2 - 0.5, -W / 2 - 0.5, L + 1, W + 1);
  c.fillStyle = p.shade < 0.5 ? "#9a7648" : "#b8925c";
  c.fillRect(-L / 2, -W / 2, L, W);
  c.restore();
}

function segDist(s: FenceSection, x: number, y: number) {
  const dx = s.x2 - s.x1,
    dy = s.y2 - s.y1;
  const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(s.x1 + dx * t - x, s.y1 + dy * t - y);
}
