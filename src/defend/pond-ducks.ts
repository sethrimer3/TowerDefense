/** A few pixel ducks on the city's ponds, out whenever it isn't raining: a
 * mallard pair on the biggest pond, and a hen with her ducklings on the
 * next. Presentation only, drawn on the ponds' pixel grid.
 *
 * Duck behaviour, one state at a time:
 * - **drift:** sit on the water, bobbing, slowing to a stop;
 * - **paddle:** swim to a spot a little way off, turning to face the way it
 *   goes, now and then leaving a faint ring behind;
 * - **dabble:** tip up, tail in the air, head under water, a ring where it
 *   went under and another as it comes back up;
 * - **preen:** turn its head back to its feathers;
 * - **follow:** the hen keeps near the drake, and ducklings trail their
 *   mother nose to tail;
 * - **flee:** anyone walking close to the bank sends them paddling hard to
 *   the far side, rippling as they go;
 * - **sleep:** at night they rest, heads tucked, ducklings huddled close. */
import { ART, openAt, type ParkArt } from "./park-art.ts";
import type { Pond } from "./pond-water.ts";

export type Walker = { x: number; y: number; id?: number };
type Kind = "drake" | "hen" | "duckling";
type State = "drift" | "paddle" | "dabble" | "preen" | "follow" | "flee" | "sleep";
type Duck = {
  kind: Kind;
  /** Position in cells, and velocity in cells a second. */
  x: number; y: number; vx: number; vy: number;
  face: 1 | -1;
  state: State;
  /** Seconds left in the state. */
  left: number;
  /** Where it is paddling to. */
  tx: number; ty: number;
  /** Who it follows: the drake for the hen, the one ahead for a duckling. */
  leader: Duck | null;
  /** Seconds to its next wake ring while swimming. */
  wake: number;
  phase: number;
  /** Open-water pixels of its pond far enough from the bank to swim on. */
  water: number[];
};

/** Sprites facing right, bottom row at the waterline. */
/** Duck pixels a cell: twice the parks' art scale. */
const DUCK = ART * 2;

const SPRITES: Record<"swim" | "dabble" | "preen" | "duckling" | "sleepling", string[]> = {
  swim: [".....hh.", ".....hhb", "tsssscc.", ".dddddd."],
  dabble: ["..t.....", ".tss....", "wsssw...", ".wwww..."],
  preen: ["........", "..hh....", "thhsscc.", ".dddddd."],
  duckling: ["..yo", "yyy.", ".dd."],
  sleepling: ["....", "yyy.", ".dd."],
};
const COLORS: Record<"drake" | "hen" | "duckling", Record<string, string>> = {
  drake: { h: "#2f7a3e", b: "#e8b13a", t: "#1e1e22", s: "#bdb8aa", c: "#6b3f26", d: "#7d786c", w: "#bfe0ec" },
  hen: { h: "#7a5a3a", b: "#c68a3a", t: "#4a3824", s: "#9a7650", c: "#82603e", d: "#664e34", w: "#bfe0ec" },
  duckling: { y: "#e8d36a", o: "#e09a30", d: "#b49c42" },
};
const SPEED = { paddle: 0.32, follow: 0.42, flee: 1.05, duckling: 0.5 };
/** How close a walker may come before the ducks swim off (cells). */
const SHY = 2.2;

export class Ducks {
  private ducks: Duck[] = [];
  private art: ParkArt | null = null;
  private rand: () => number = () => 0.5;

  /** Places the ducks on `ponds` (biggest first). */
  sync(ponds: readonly Pond[], art: ParkArt, rand: () => number) {
    this.art = art;
    this.rand = rand;
    this.ducks = [];
    const sorted = [...ponds].sort((a, b) => b.cells.length - a.cells.length);
    const [first, second] = sorted.map((p) => swimmable(p, art)).filter((w) => w.length > 6);
    if (first) {
      const drake = this.duck("drake", first, null);
      this.duck("hen", first, drake);
    }
    if (second) {
      const hen = this.duck("hen", second, null);
      let ahead = hen;
      for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) ahead = this.duck("duckling", second, ahead);
    }
  }

  /** How many ducks are about (tests, tuning). */
  get count() {
    return this.ducks.length;
  }

  private duck(kind: Kind, water: number[], leader: Duck | null): Duck {
    const at = leader ? { x: leader.x - 0.3, y: leader.y } : this.pick(water);
    const d: Duck = {
      kind, x: at.x, y: at.y, vx: 0, vy: 0, face: this.rand() < 0.5 ? 1 : -1, state: "drift", left: this.rand() * 2,
      tx: at.x, ty: at.y, leader, wake: 2 + this.rand() * 3, phase: this.rand() * 6.28, water,
    };
    if (!this.swims(d.x, d.y)) Object.assign(d, this.pick(water));
    this.ducks.push(d);
    return d;
  }

  /** A random open-water spot of the pond, in cells. */
  private pick(water: number[]) {
    const i = water[Math.floor(this.rand() * water.length)];
    const W = this.art!.width;
    return { x: ((i % W) + 0.5) / ART, y: (Math.floor(i / W) + 0.5) / ART };
  }

  /** Whether a duck fits at (x, y): open water under it and a pixel round it. */
  private swims(x: number, y: number) {
    const ax = Math.floor(x * ART), ay = Math.floor(y * ART), a = this.art!;
    return openAt(a, ax, ay) && openAt(a, ax - 2, ay) && openAt(a, ax + 2, ay) && openAt(a, ax, ay - 1) && openAt(a, ax, ay + 1);
  }

  update(dt: number, f: { night: number; walkers: readonly Walker[]; reduceMotion: boolean }, ring: (x: number, y: number, k: number) => void) {
    if (!this.art || dt <= 0) return;
    for (const d of this.ducks) {
      d.left -= dt;
      const threat = nearestWalker(d, f.walkers);
      if (f.night > 0.5) this.enter(d, "sleep", 1);
      else if (threat && threat.d < SHY) this.flee(d, threat.w);
      else if (d.kind === "duckling") this.trail(d);
      else if (d.kind === "hen" && d.leader && d.state !== "dabble" && Math.hypot(d.leader.x - d.x, d.leader.y - d.y) > 1.4) this.follow(d);
      else if (d.left <= 0) this.next(d, ring);
      this.move(d, dt, f.reduceMotion, ring);
    }
  }

  /** Switches to `state` for `seconds`; staying in it keeps its clock. */
  private enter(d: Duck, state: State, seconds: number) {
    if (d.state !== state) d.left = seconds;
    d.state = state;
  }

  /** Starts `state` afresh for `seconds`. */
  private begin(d: Duck, state: State, seconds: number) {
    d.state = state;
    d.left = seconds;
  }

  /** What a grown duck does next once a state runs out. */
  private next(d: Duck, ring: (x: number, y: number, k: number) => void) {
    const r = this.rand();
    if (d.state === "dabble") ring(d.x, d.y, 0.7);
    if (r < 0.45) {
      const to = this.nearby(d, 2.4);
      d.tx = to.x;
      d.ty = to.y;
      this.begin(d, "paddle", 6);
    } else if (r < 0.62) {
      this.begin(d, "dabble", 1.1 + this.rand() * 1.2);
      ring(d.x, d.y, 0.8);
    } else if (r < 0.8) this.begin(d, "preen", 0.9 + this.rand() * 1.4);
    else this.begin(d, "drift", 1.5 + this.rand() * 3);
  }

  /** A swimmable spot within `reach` cells, or anywhere on the pond. */
  private nearby(d: Duck, reach: number) {
    for (let k = 0; k < 12; k++) {
      const p = this.pick(d.water);
      if (Math.hypot(p.x - d.x, p.y - d.y) <= reach) return p;
    }
    return this.pick(d.water);
  }

  private follow(d: Duck) {
    const l = d.leader!;
    d.tx = l.x - l.face * 0.45;
    d.ty = l.y + 0.12;
    this.enter(d, "follow", 1);
  }

  /** Ducklings keep a little way behind whoever leads them. */
  private trail(d: Duck) {
    const l = d.leader!;
    if (l.state === "sleep") return this.enter(d, "sleep", 1);
    const gap = Math.hypot(l.x - d.x, l.y - d.y);
    if (gap > 0.42) {
      d.tx = l.x - l.face * 0.32;
      d.ty = l.y + 0.05;
      this.enter(d, "follow", 1);
    } else this.enter(d, l.state === "flee" ? "flee" : "drift", 0.5);
  }

  /** Away from `w`: the farthest of a few spots on the pond. */
  private flee(d: Duck, w: Walker) {
    if (d.state !== "flee" || d.left <= 0) {
      let best = this.pick(d.water), far = 0;
      for (let k = 0; k < 10; k++) {
        const p = this.pick(d.water), dist = Math.hypot(p.x - w.x, p.y - w.y);
        if (dist > far) [far, best] = [dist, p];
      }
      d.tx = best.x;
      d.ty = best.y;
      d.state = "flee";
      d.left = 2.5;
      d.wake = Math.min(d.wake, 0.2);
    }
  }

  private move(d: Duck, dt: number, still: boolean, ring: (x: number, y: number, k: number) => void) {
    const swimming = d.state === "paddle" || d.state === "follow" || d.state === "flee";
    const speed = d.state === "flee" ? SPEED.flee : d.kind === "duckling" ? SPEED.duckling : d.state === "follow" ? SPEED.follow : SPEED.paddle;
    const dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.hypot(dx, dy);
    // Paddling eases toward its target speed; drifting glides to a stop.
    const want = swimming && dist > 0.05 ? { x: (dx / dist) * speed, y: (dy / dist) * speed } : { x: 0, y: 0 };
    const ease = 1 - Math.exp(-dt * (swimming ? 3 : 1.5));
    d.vx += (want.x - d.vx) * ease;
    d.vy += (want.y - d.vy) * ease;
    if (still) d.vx = d.vy = 0;
    const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
    if (this.swims(nx, ny)) {
      d.x = nx;
      d.y = ny;
    } else {
      // The bank: stop and think again.
      d.vx = d.vy = 0;
      if (d.state === "paddle") d.left = 0;
      d.tx = d.x;
      d.ty = d.y;
    }
    if (Math.abs(d.vx) > 0.03) d.face = d.vx > 0 ? 1 : -1;
    if (d.state === "paddle" && dist < 0.08) {
      d.state = "drift";
      d.left = 1 + this.rand() * 2.5;
    }
    // Swimming leaves a ring now and then, more often in a hurry.
    const fast = Math.hypot(d.vx, d.vy);
    if (fast > 0.12 && !still) {
      d.wake -= dt;
      if (d.wake <= 0) {
        ring(d.x - d.face * 0.13, d.y + 0.03, d.state === "flee" ? 0.8 : 0.45);
        d.wake = d.state === "flee" ? 0.45 : 2.5 + this.rand() * 4;
      }
    }
  }

  /** Each duck and its faint reflection, on a grid twice as fine as the
   * ponds' pixels (`DUCK` a cell), so the ducks are half their art's size. */
  draw(c: CanvasRenderingContext2D, px: number, now: number, art: ParkArt) {
    const s = px / DUCK, t = now / 1000, k = DUCK / ART;
    c.save();
    for (const d of [...this.ducks].sort((a, b) => a.y - b.y)) {
      const sprite = SPRITES[spriteOf(d)], colors = COLORS[d.kind === "duckling" ? "duckling" : d.kind];
      const w = sprite[0].length, h = sprite.length;
      // Bobbing: a pixel up and down while sitting still.
      const bob = d.state === "drift" || d.state === "preen" || d.state === "sleep" ? (Math.sin(t * 2.2 + d.phase) > 0.5 ? -1 : 0) : 0;
      const ax = Math.round(d.x * DUCK - w / 2), ay = Math.round(d.y * DUCK) - h + 1 + bob;
      for (let row = 0; row < h; row++)
        for (let col = 0; col < w; col++) {
          const ch = sprite[row][d.face === 1 ? col : w - 1 - col];
          const color = colors[ch];
          if (!color) continue;
          const x = ax + col, y = ay + row;
          c.globalAlpha = ch === "w" ? 0.55 : 1;
          c.fillStyle = color;
          c.fillRect(x * s, y * s, s, s);
          // The reflection: the same pixel mirrored below the waterline, faint.
          const ry = ay + h + (h - 1 - row);
          if (ch !== "w" && ch !== "d" && openAt(art, Math.floor(x / k), Math.floor(ry / k))) {
            c.globalAlpha = 0.22;
            c.fillRect(x * s, ry * s, s, s);
          }
        }
    }
    c.restore();
  }
}

function spriteOf(d: Duck): keyof typeof SPRITES {
  if (d.kind === "duckling") return d.state === "sleep" ? "sleepling" : "duckling";
  if (d.state === "dabble") return "dabble";
  if (d.state === "preen" || d.state === "sleep") return "preen";
  return "swim";
}

function nearestWalker(d: Duck, walkers: readonly Walker[]) {
  let best: { w: Walker; d: number } | null = null;
  for (const w of walkers) {
    const dist = Math.hypot(w.x - d.x, w.y - d.y);
    if (dist < SHY * 1.5 && (!best || dist < best.d)) best = { w, d: dist };
  }
  return best;
}

/** Open-water pixels of `pond` with water all round (a duck's width). */
function swimmable(pond: Pond, art: ParkArt): number[] {
  const out: number[] = [];
  const x0 = pond.x0 * ART - 2, x1 = (pond.x1 + 1) * ART + 2, y0 = pond.y0 * ART - 2, y1 = (pond.y1 + 1) * ART + 2;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (openAt(art, x, y) && openAt(art, x - 3, y) && openAt(art, x + 3, y) && openAt(art, x, y - 2) && openAt(art, x, y + 2)) out.push(y * art.width + x);
  return out;
}
