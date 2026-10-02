/** The Mine: an idle mining operation in a falling-sand world. Miners sink a
 * laddered shaft through the dirt (shoring its walls with timber so it holds)
 * into the stone, drive a tunnel out either side at every level, lay track
 * and torches along each, hang lamps in the shaft, chase any iron or gold
 * they glimpse, and build a mine cart for each tunnel. Ore goes up in a
 * miner's pack to the hut on the surface, or rides a cart back to the shaft
 * where the hoist lifts it. Gold pays straight into the player's Gold; iron
 * ore is smelted into iron bars.
 *
 * The work itself is a plan painted over the grid: each cell may be marked to
 * be dug out, or dug and fitted with a ladder, rail, torch or lamp. A miner
 * looks for the nearest unclaimed marked cell it can reach (a breadth-first
 * search over where it can stand), walks there, and does it. */
import {
  AIR, BEDROCK, CELLS, DIG_TICKS, DIRT, GOLD, H, IRON, LADDER, LAMP, MATERIAL_COUNT, RAIL, RUBBLE, STONE, TIMBER, TORCH, W, World,
  decodeGrid, encodeGrid, generate, hash01, idx, inBounds, isLoose, isOre, isPassable, isSolid, strata, type Material, type Strata,
} from "./world.ts";

export const TICK_HZ = 30;
/** Plan marks: dig out, or dig out and fit. */
export const P_NONE = 0, P_DIG = 1, P_LADDER = 2, P_RAIL = 3, P_TORCH = 4, P_LAMP = 5;
const FIXTURE: Record<number, Material> = { [P_LADDER]: LADDER, [P_RAIL]: RAIL, [P_TORCH]: TORCH, [P_LAMP]: LAMP };
const BUILD_TICKS: Record<number, number> = { [LADDER]: 24, [RAIL]: 30, [TORCH]: 45, [LAMP]: 75 };

/** Ore a miner carries before heading out with it; spoil likewise. */
export const PACK_ORE = 6;
const PACK_SPOIL = 10;
export const CART_LOAD = 18;
/** What the mine pays. */
export const GOLD_PER_NUGGET = 10;
export const ORE_PER_IRON_BAR = 12;
export const MAX_MINERS = 24;

const STEP_TICKS = 8, CLIMB_TICKS = 10, FALL_TICKS = 2, CART_STEP = 5, BUCKET_STEP = 2, CART_BUILD = 240;
/** Rows between tunnel levels, and how far a tunnel reaches before the shaft
 * is sunk to the next. */
const LEVEL_GAP = 14, OPEN_REACH = 28;

export type Miner = {
  id: number;
  x: number;
  y: number;
  iron: number;
  gold: number;
  spoil: number;
  /** What it is doing now (drawn), and toward where it faces. */
  action: "idle" | "walk" | "dig" | "build" | "rest";
  facing: number;
  /** The cell being dug or built, or -1. */
  work: number;
  task: Task | null;
  path: number[];
  timer: number;
  /** The timer runs down on work (`finish` follows), not a step or a rest. */
  working: boolean;
  fall: number;
};
type Task =
  | { kind: "dig" | "build"; cell: number }
  | { kind: "deliver" }
  | { kind: "dump" }
  | { kind: "cart"; level: number; side: number }
  | { kind: "rest" };
export type Cart = { level: number; side: number; x: number; y: number; iron: number; gold: number; state: "out" | "parked" | "back"; timer: number };
export type Bucket = { y: number; iron: number; gold: number };

export type MineSave = {
  seed: number;
  tick: number;
  cells: string;
  plan: string;
  miners: { x: number; y: number; iron: number; gold: number; spoil: number }[];
  carts: { level: number; side: number; x: number; iron: number; gold: number }[];
  buckets: Bucket[];
  shaftLevel: number;
  hired: number;
  ironOre: number;
  mined: { iron: number; gold: number };
  savedAt: number;
};

/** Price in Gold of hiring the next miner, after `hired` hires. */
export const hirePrice = (hired: number) => Math.round(120 * Math.pow(1.6, hired));

export class MineSim {
  readonly seed: number;
  readonly world: World;
  readonly strata: Strata;
  readonly plan: Uint8Array;
  /** The shaft's column, the hut's (ore drop), and the spoil heap's. */
  readonly shaftX = W / 2;
  readonly hutX = W / 2 + 9;
  readonly heapX = 26;
  /** Each tunnel level's floor row (the row its rails run along). */
  readonly levels: number[] = [];
  miners: Miner[] = [];
  carts: Cart[] = [];
  buckets: Bucket[] = [];
  tick = 0;
  /** Deepest level the shaft has been planned down to. */
  shaftLevel = 0;
  hired = 0;
  ironOre = 0;
  mined = { iron: 0, gold: 0 };
  /** Paid out but not yet collected by the page (`collect`). */
  private owed = { gold: 0, ironOre: 0 };
  private reserved = new Int32Array(CELLS);
  private occupied = new Uint8Array(CELLS);
  private nextId = 1;
  // Breadth-first search scratch, reused.
  private seen = new Uint32Array(CELLS);
  private stamp = 0;
  private prev = new Int32Array(CELLS);
  private dist = new Uint16Array(CELLS);
  private queue = new Int32Array(CELLS);

  constructor(seed: number, saved?: MineSave) {
    this.seed = seed >>> 0;
    this.strata = strata(this.seed);
    const maxStone = Math.max(...this.strata.stoneTop);
    for (let y = maxStone + 5; y < H - 12; y += LEVEL_GAP) this.levels.push(y);
    const cells = saved ? decodeGrid(saved.cells, CELLS, MATERIAL_COUNT) : null;
    const plan = saved ? decodeGrid(saved.plan, CELLS, 6) : null;
    this.world = new World(cells ?? generate(this.seed));
    this.plan = plan ?? new Uint8Array(CELLS);
    if (saved && cells && plan) {
      this.tick = saved.tick;
      this.shaftLevel = saved.shaftLevel;
      this.hired = saved.hired;
      this.ironOre = saved.ironOre;
      this.mined = { ...saved.mined };
      for (const m of saved.miners) this.addMiner(m.x, m.y, m);
      for (const c of saved.carts) {
        const y = this.levels[c.level];
        if (y !== undefined) this.carts.push({ level: c.level, side: c.side, x: c.x, y, iron: c.iron, gold: c.gold, state: "back", timer: 0 });
      }
      this.buckets = saved.buckets.map((b) => ({ ...b }));
    } else {
      this.planShaft(0);
      this.addMiner(this.hutX, this.standY(this.hutX));
    }
  }

  // ── Geometry ────────────────────────────────────────────────────────

  private cell(x: number, y: number) {
    return this.world.get(x, y);
  }
  private passable(x: number, y: number) {
    return inBounds(x, y) && isPassable(this.world.cells[idx(x, y)]);
  }
  /** Something to stand on: solid ground or the top of a ladder. */
  private supports(x: number, y: number) {
    if (y >= H) return true;
    const m = this.cell(x, y);
    return isSolid(m) || m === LADDER || m === BEDROCK;
  }
  /** A miner (two cells tall) can stand with its feet at (x, y). */
  standable(x: number, y: number) {
    return y >= 1 && this.passable(x, y) && this.passable(x, y - 1) && (this.cell(x, y) === LADDER || this.supports(x, y + 1));
  }
  /** The row a miner dropped at column x comes to rest on. */
  standY(x: number) {
    for (let y = 1; y < H - 1; y++) if (this.standable(x, y)) return y;
    return 1;
  }
  /** Where a miner stepping into (x, y) lands, or -1 past a long drop. */
  private landing(x: number, y: number) {
    for (let k = 0; k < 80 && y < H - 1; k++, y++) {
      if (!this.passable(x, y) || !this.passable(x, y - 1)) return -1;
      if (this.standable(x, y)) return y;
    }
    return -1;
  }

  /** A ladder may go in cell c (its plan doesn't want another fitting). */
  private ladderOk(c: number) {
    const p = this.plan[c];
    return p === P_NONE || p === P_DIG || p === P_LADDER;
  }

  /** Scaffolding goes up underground, never into the sky. */
  private wallBeside(x: number, y: number) {
    return y > this.strata.surface[x];
  }

  /** Calls `visit` with every position one move away from feet (x, y). */
  private moves(x: number, y: number, visit: (nx: number, ny: number) => void) {
    for (const d of [-1, 1]) {
      const nx = x + d;
      if (nx < 0 || nx >= W) continue;
      if (this.passable(nx, y) && this.passable(nx, y - 1)) {
        const ly = this.landing(nx, y);
        if (ly >= 0) visit(nx, ly);
      } else if (this.passable(nx, y - 1) && this.passable(nx, y - 2) && this.passable(x, y - 2)) {
        if (this.standable(nx, y - 1)) visit(nx, y - 1);
      } else if (this.passable(nx, y - 2) && this.passable(nx, y - 3) && this.passable(x, y - 2) && this.passable(x, y - 3)) {
        if (this.standable(nx, y - 2)) visit(nx, y - 2);
      }
    }
    // Up: a ladder already there, or open air to put one in.
    if (y >= 3 && this.passable(x, y - 2)) {
      const up = this.cell(x, y - 1);
      if (up === LADDER || (up === AIR && this.ladderOk(idx(x, y - 1)) && this.wallBeside(x, y - 1)) || (this.passable(x, y - 1) && this.standable(x, y - 1))) visit(x, y - 1);
    }
    // Down: a ladder, or let go and drop.
    const below = this.cell(x, y + 1);
    if (below === LADDER) visit(x, y + 1);
    else if (below === AIR || (isPassable(below) && y + 1 < H)) {
      const ly = this.landing(x, y + 1);
      if (ly >= 0) visit(x, ly);
    }
  }

  /** Breadth-first from feet `start`: returns the path (feet cells, start
   * excluded) to the best goal, where `score` rates a position (lower is
   * better, null for no goal) and the search stops `slack` steps past the
   * first goal found. */
  private search(start: number, score: (x: number, y: number, dist: number) => number | null, slack = 0, limit = 30000) {
    if (++this.stamp === 0xffffffff) {
      this.seen.fill(0);
      this.stamp = 1;
    }
    const { seen, prev, dist, queue } = this;
    let head = 0, tail = 0, best = -1, bestScore = Infinity, stopAt = Infinity;
    seen[start] = this.stamp;
    dist[start] = 0;
    prev[start] = -1;
    queue[tail++] = start;
    while (head < tail && tail < limit) {
      const p = queue[head++], d = dist[p];
      if (d > stopAt) break;
      const x = p % W, y = (p - x) / W;
      const s = score(x, y, d);
      if (s !== null && s < bestScore) {
        bestScore = s;
        best = p;
        if (stopAt === Infinity) stopAt = d + slack;
      }
      this.moves(x, y, (nx, ny) => {
        const q = idx(nx, ny);
        if (seen[q] === this.stamp) return;
        seen[q] = this.stamp;
        dist[q] = d + 1;
        prev[q] = p;
        queue[tail++] = q;
      });
    }
    if (best < 0) return null;
    const path: number[] = [];
    for (let p = best; p !== start; p = prev[p]) path.push(p);
    return path.reverse();
  }

  // ── The plan ────────────────────────────────────────────────────────

  /** The work a cell waits on: 1 to dig it, 2 to fit it, 0 none. */
  jobAt(c: number) {
    const p = this.plan[c];
    if (!p) return 0;
    const m = this.world.cells[c];
    if (m === BEDROCK) return 0;
    if (isSolid(m)) return 1;
    if (p >= P_LADDER && m === AIR) return 2;
    return 0;
  }
  private mark(x: number, y: number, p: number) {
    if (inBounds(x, y) && this.cell(x, y) !== BEDROCK) this.plan[idx(x, y)] = p;
  }

  /** Sinks the shaft (laddered all the way) to level `k`'s floor, opens that
   * level's tunnels, and hangs a lamp in the shaft above it. */
  private planShaft(k: number) {
    const x0 = this.shaftX, to = this.levels[k], from = k === 0 ? this.strata.surface[x0] : this.levels[k - 1];
    for (let y = from; y <= to; y++) this.mark(x0, y, P_LADDER);
    const lampY = k === 0 ? Math.max(this.strata.stoneTop[x0] + 3, to - 8) : to - 7;
    if (lampY > this.strata.stoneTop[x0]) this.mark(x0 + 1, lampY, P_LAMP);
    for (const side of [-1, 1])
      for (let x = x0 + side; x >= 2 && x <= W - 3; x += side) {
        this.mark(x, to - 2, P_DIG);
        this.mark(x, to - 1, (x - x0) % 8 === 4 * side ? P_TORCH : P_DIG);
        this.mark(x, to, P_RAIL);
      }
    this.shaftLevel = k;
  }

  /** Cells of track laid outward from the shaft along level `k` on `side`. */
  railReach(k: number, side: number) {
    const y = this.levels[k];
    let n = 0;
    for (let x = this.shaftX + side; x >= 0 && x < W && this.cell(x, y) === RAIL; x += side) n++;
    return n;
  }

  /** Once the deepest open level reaches far enough both ways, sink the
   * shaft to the next. */
  private replan() {
    const k = this.shaftLevel;
    if (k + 1 >= this.levels.length) return;
    const y = this.levels[k];
    if (this.cell(this.shaftX, y) !== LADDER) return;
    const reach = (side: number) => {
      let n = 0;
      for (let x = this.shaftX + side; x >= 2 && x <= W - 3 && this.passable(x, y - 1); x += side) n++;
      return n;
    };
    const most = this.shaftX - 3;
    if (Math.min(reach(-1), most) >= Math.min(OPEN_REACH, most) && Math.min(reach(1), most) >= Math.min(OPEN_REACH, most)) this.planShaft(k + 1);
  }

  /** After digging (x, y): shore loose ground beside or above the hole
   * with timber, follow any ore it bared, and glimpse ore a few cells on. */
  private afterDig(x: number, y: number) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(nx, ny) && isLoose(this.cell(nx, ny)) && !this.plan[idx(nx, ny)]) this.world.set(nx, ny, TIMBER);
    }
    if (y < this.strata.stoneTop[x]) return;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (inBounds(x + dx, y + dy) && isOre(this.cell(x + dx, y + dy)) && !this.plan[idx(x + dx, y + dy)]) this.mark(x + dx, y + dy, P_DIG);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      for (let d = 2; d <= 4; d++) {
        const tx = x + dx * d, ty = y + dy * d;
        if (!inBounds(tx, ty)) break;
        const m = this.cell(tx, ty);
        if (isOre(m)) {
          if (this.plan[idx(tx, ty)]) break;
          for (let k = 1; k <= d; k++) {
            const cx = x + dx * k, cy = y + dy * k;
            if (!this.plan[idx(cx, cy)]) this.mark(cx, cy, P_DIG);
            // A side drift is dug two tall, so a miner fits along it.
            if (dy === 0 && k < d && !this.plan[idx(cx, cy - 1)] && this.cell(cx, cy - 1) === STONE) this.mark(cx, cy - 1, P_DIG);
          }
          break;
        }
        if (m !== STONE) break;
      }
    }
  }

  // ── Miners ──────────────────────────────────────────────────────────

  addMiner(x: number, y: number, pack?: { iron: number; gold: number; spoil: number }) {
    this.miners.push({
      id: this.nextId++, x, y, iron: pack?.iron ?? 0, gold: pack?.gold ?? 0, spoil: pack?.spoil ?? 0,
      action: "idle", facing: 1, work: -1, task: null, path: [], timer: 0, working: false, fall: 0,
    });
  }
  /** Hires a miner at the hut (the page charges for it). */
  hire() {
    if (this.miners.length >= MAX_MINERS) return false;
    this.hired++;
    this.addMiner(this.hutX, this.standY(this.hutX));
    return true;
  }

  private release(m: Miner) {
    const t = m.task;
    if (t && (t.kind === "dig" || t.kind === "build") && this.reserved[t.cell] === m.id) this.reserved[t.cell] = 0;
    if (t?.kind === "cart") this.cartClaims.delete(`${t.level}:${t.side}`);
    m.task = null;
    m.working = false;
    m.path = [];
    m.work = -1;
    m.action = "idle";
  }

  /** Cells a miner standing at (x, y) can work on, with how they're reached. */
  private static readonly REACH: readonly [number, number, boolean][] = [
    [-1, 0, true], [1, 0, true], [-1, -1, true], [1, -1, true], [-1, -2, true], [1, -2, true], [0, 1, true], [0, -2, true], [0, 0, false], [0, -1, false],
  ];
  private reachable(x: number, y: number, c: number) {
    const cx = c % W, cy = (c - cx) / W;
    return MineSim.REACH.some(([dx, dy, dig]) => x + dx === cx && y + dy === cy && (dig || this.world.cells[c] === AIR));
  }

  private chooseTask(m: Miner) {
    const start = idx(m.x, m.y), ore = m.iron + m.gold;
    const shallow = m.y < this.strata.stoneTop[this.shaftX] + 6;
    if (ore >= PACK_ORE || (m.spoil >= PACK_SPOIL && shallow)) return this.goDeliver(m, start);
    const cartJobs = this.cartJobs();
    const path = this.search(start, (x, y, d) => {
      const b = this.bestAt(x, y, cartJobs);
      return b ? d + b.score : null;
    }, 20);
    if (path) {
      const end = path.length ? path[path.length - 1] : start, ex = end % W;
      const chosen = this.bestAt(ex, (end - ex) / W, cartJobs)!;
      if (chosen.cart) {
        m.task = { kind: "cart", ...chosen.cart };
        this.cartClaims.add(`${chosen.cart.level}:${chosen.cart.side}`);
      } else {
        m.task = { kind: this.jobAt(chosen.cell) === 1 ? "dig" : "build", cell: chosen.cell };
        this.reserved[chosen.cell] = m.id;
      }
      m.path = path;
      return;
    }
    if (ore + m.spoil > 0) return this.goDeliver(m, start);
    this.goRest(m, start);
  }
  /** The best work a miner standing at (x, y) could take up, scored (lower
   * first: ore before tunnelling, fitting what's dug before digging on, a
   * cart before either), or null for none. */
  private bestAt(x: number, y: number, cartJobs: { level: number; side: number }[]) {
    let best: { score: number; cell: number; cart: { level: number; side: number } | null } | null = null;
    for (const [dx, dy, dig] of MineSim.REACH) {
      const cx = x + dx, cy = y + dy;
      if (!inBounds(cx, cy)) continue;
      const c = idx(cx, cy), job = this.jobAt(c);
      if (!job || this.reserved[c] || (job === 1 && !dig)) continue;
      const score = job === 1 && isOre(this.world.cells[c]) ? -30 : job === 2 ? -2 : 0;
      if (!best || score < best.score) best = { score, cell: c, cart: null };
    }
    for (const j of cartJobs)
      if (y === this.levels[j.level] && x === this.shaftX + j.side * 2 && (!best || -10 < best.score)) best = { score: -10, cell: -1, cart: j };
    return best;
  }

  private cartClaims = new Set<string>();
  /** Levels whose track is long enough for a cart and that have none yet. */
  private cartJobs() {
    const out: { level: number; side: number }[] = [];
    for (let k = 0; k <= this.shaftLevel; k++)
      for (const side of [-1, 1])
        if (!this.cartClaims.has(`${k}:${side}`) && !this.carts.some((c) => c.level === k && c.side === side) && this.railReach(k, side) >= 16) out.push({ level: k, side });
    return out;
  }

  private goDeliver(m: Miner, start: number) {
    const top = (x: number) => this.strata.surface[x] + 4;
    const path = this.search(start, (x, y, d) => {
      if (Math.abs(x - this.hutX) <= 1 && y < top(x)) return d;
      if (m.spoil < PACK_SPOIL || m.iron + m.gold > 0)
        for (const c of this.carts) if (c.state === "parked" && c.y === y && Math.abs(c.x - x) <= 1 && c.iron + c.gold < CART_LOAD) return d;
      return null;
    });
    if (!path) return this.goRest(m, start);
    m.task = { kind: "deliver" };
    m.path = path;
  }
  private goRest(m: Miner, start: number) {
    const tx = this.hutX - 6 + Math.floor(hash01(this.tick, m.id, this.seed) * 12);
    const path = this.search(start, (x, y, d) => (Math.abs(x - tx) <= 1 && y < this.strata.surface[x] + 4 ? d : null), 0, 6000);
    m.task = { kind: "rest" };
    m.path = path ?? [];
    m.timer = 0;
  }

  private stepMiner(m: Miner) {
    // Buried by a fall of dirt: shoulder it aside.
    for (const yy of [m.y, m.y - 1])
      if (!this.passable(m.x, yy) && this.cell(m.x, yy) !== BEDROCK && inBounds(m.x, yy)) {
        this.world.set(m.x, yy, AIR);
        m.spoil = Math.min(PACK_SPOIL, m.spoil + 1);
      }
    if (!this.standable(m.x, m.y)) {
      if (++m.fall >= FALL_TICKS) {
        m.fall = 0;
        if (m.y < H - 2) m.y++;
      }
      m.action = "walk";
      return;
    }
    m.fall = 0;
    if (m.timer > 0) {
      if (--m.timer === 0 && m.working) {
        m.working = false;
        this.finish(m);
      }
      return;
    }
    if (!m.task) {
      // Don't search every tick when there is nothing to do.
      if ((this.tick + m.id) % 6 === 0) this.chooseTask(m);
      return;
    }
    if (m.path.length) return this.walk(m);
    this.arrive(m);
  }

  private walk(m: Miner) {
    const next = m.path[0], nx = next % W, ny = (next - nx) / W;
    if (nx === m.x && ny === m.y) {
      m.path.shift();
      return;
    }
    let ok = false;
    this.moves(m.x, m.y, (ax, ay) => {
      if (ax === nx && ay === ny) ok = true;
    });
    if (!ok) return this.release(m);
    m.action = "walk";
    if (nx !== m.x) {
      m.facing = nx > m.x ? 1 : -1;
      m.x = nx;
      if (ny < m.y) m.y = ny; // stepping up; a drop is left to gravity
      m.timer = STEP_TICKS;
    } else if (ny < m.y) {
      // Climbing: put a ladder in first if there isn't one.
      if (this.cell(m.x, m.y) === AIR && this.ladderOk(idx(m.x, m.y)) && !this.supports(m.x, m.y + 1)) this.world.set(m.x, m.y, LADDER);
      if (this.cell(m.x, ny) === AIR && this.ladderOk(next)) {
        this.world.set(m.x, ny, LADDER);
        m.action = "build";
        m.work = next;
        m.timer = BUILD_TICKS[LADDER];
        return;
      }
      m.y = ny;
      m.timer = CLIMB_TICKS;
    } else if (this.cell(m.x, m.y + 1) === LADDER) {
      m.y = ny;
      m.timer = CLIMB_TICKS;
    } else {
      // Letting go: gravity carries it down to where the path resumes.
      m.y++;
      return;
    }
    m.path.shift();
  }

  private arrive(m: Miner) {
    const t = m.task!;
    if (t.kind === "dig" || t.kind === "build") {
      const job = this.jobAt(t.cell);
      if (!job || !this.reachable(m.x, m.y, t.cell) || (job === 1) !== (t.kind === "dig")) return this.release(m);
      const m2 = this.world.cells[t.cell];
      m.action = t.kind;
      m.work = t.cell;
      m.facing = t.cell % W > m.x ? 1 : t.cell % W < m.x ? -1 : m.facing;
      m.timer = t.kind === "dig" ? DIG_TICKS[m2] ?? 120 : BUILD_TICKS[FIXTURE[this.plan[t.cell]]];
      m.working = true;
      return;
    }
    if (t.kind === "cart") {
      m.action = "build";
      m.work = idx(this.shaftX + t.side * 2, this.levels[t.level]);
      m.timer = CART_BUILD;
      m.working = true;
      return;
    }
    if (t.kind === "deliver") {
      const cart = this.carts.find((c) => c.state === "parked" && c.y === m.y && Math.abs(c.x - m.x) <= 1);
      if (cart) {
        cart.iron += m.iron;
        cart.gold += m.gold;
        m.iron = m.gold = 0;
        m.spoil = 0;
        this.release(m);
        return;
      }
      if (Math.abs(m.x - this.hutX) <= 1 && m.y < this.strata.surface[m.x] + 4) {
        this.pay(m.iron, m.gold);
        m.iron = m.gold = 0;
        if (m.spoil > 0) {
          const path = this.search(idx(m.x, m.y), (x, y, d) => (Math.abs(x - this.heapX) <= 2 && y < this.strata.surface[x] + 4 ? d : null), 0, 8000);
          if (path) {
            m.task = { kind: "dump" };
            m.path = path;
            return;
          }
          m.spoil = 0;
        }
      }
      return this.release(m);
    }
    if (t.kind === "dump") {
      m.action = "build";
      m.work = -1;
      m.timer = 6;
      m.working = true;
      if (m.spoil > 0) {
        this.dropSpoil();
        m.spoil--;
        return;
      }
      return this.release(m);
    }
    // Resting by the hut.
    m.action = "rest";
    m.timer = 90 + Math.floor(hash01(m.id, this.tick, this.seed) * 120);
    m.task = null;
  }

  /** A miner's timed work is done. */
  private finish(m: Miner) {
    const t = m.task;
    if (!t) return;
    if (t.kind === "dig") {
      const c = t.cell, x = c % W, y = (c - x) / W, mat = this.world.cells[c];
      if (this.jobAt(c) === 1) {
        this.world.set(x, y, AIR);
        if (mat === IRON) m.iron++;
        else if (mat === GOLD) m.gold++;
        else if (y < this.strata.stoneTop[x] + 6 && hash01(x, y, this.seed + 9) < (mat === STONE ? 0.3 : 0.5)) m.spoil = Math.min(PACK_SPOIL, m.spoil + 1);
        if (isOre(mat)) this.mined[mat === IRON ? "iron" : "gold"]++;
        // A hole dug under one's feet gets a ladder, so there's a way back.
        if (y === m.y + 1 && x === m.x && this.plan[c] === P_DIG) this.plan[c] = P_LADDER;
        this.afterDig(x, y);
      }
    } else if (t.kind === "build") {
      const c = t.cell, x = c % W, y = (c - x) / W;
      if (this.jobAt(c) === 2) this.world.set(x, y, FIXTURE[this.plan[c]]);
    } else if (t.kind === "cart") {
      this.cartClaims.delete(`${t.level}:${t.side}`);
      const y = this.levels[t.level];
      this.carts.push({ level: t.level, side: t.side, x: this.shaftX + t.side * 2, y, iron: 0, gold: 0, state: "out", timer: 0 });
    } else if (t.kind === "dump") {
      return this.arrive(m);
    }
    this.release(m);
  }

  private dropSpoil() {
    for (const dx of [0, -1, 1, -2, 2]) {
      const x = this.heapX + dx;
      let y = 0;
      while (y < H - 1 && this.cell(x, y + 1) === AIR) y++;
      if (y > 12 && this.cell(x, y) === AIR) {
        this.world.set(x, y, hash01(x, this.tick, this.seed) < 0.4 ? RUBBLE : DIRT);
        return;
      }
    }
  }

  // ── Carts and the hoist ─────────────────────────────────────────────

  private stepCart(c: Cart) {
    if (++c.timer < CART_STEP && c.state !== "parked") return;
    if (c.state !== "parked") c.timer = 0;
    const home = this.shaftX + c.side * 2, railAt = (x: number) => this.cell(x, c.y) === RAIL;
    if (c.state === "out") {
      const ahead = c.x + c.side * 2;
      if (railAt(ahead) && railAt(c.x + c.side)) c.x += c.side;
      else {
        c.state = "parked";
        c.timer = 0;
      }
    } else if (c.state === "parked") {
      const load = c.iron + c.gold;
      if (load >= CART_LOAD || (load > 0 && c.timer > 45 * TICK_HZ)) {
        c.state = "back";
        c.timer = 0;
      } else if (load === 0 && c.timer > 10 * TICK_HZ && railAt(c.x + c.side * 3)) {
        c.state = "out";
        c.timer = 0;
      }
    } else {
      if (c.x !== home) c.x -= c.side;
      else {
        if (c.iron + c.gold > 0) this.buckets.push({ y: c.y, iron: c.iron, gold: c.gold });
        c.iron = c.gold = 0;
        c.state = "out";
      }
    }
  }

  private stepBuckets() {
    if (this.tick % BUCKET_STEP) return;
    const top = this.strata.surface[this.shaftX] - 1;
    this.buckets = this.buckets.filter((b) => {
      b.y--;
      if (b.y > top) return true;
      this.pay(b.iron, b.gold);
      return false;
    });
  }

  private pay(iron: number, gold: number) {
    this.owed.gold += gold * GOLD_PER_NUGGET;
    this.owed.ironOre += iron;
  }
  /** Takes what the mine has paid since last asked: Gold, and iron bars
   * smelted from the ore (leftover ore waits for the next bar). */
  collect() {
    this.ironOre += this.owed.ironOre;
    const bars = Math.floor(this.ironOre / ORE_PER_IRON_BAR);
    this.ironOre -= bars * ORE_PER_IRON_BAR;
    const out = { gold: this.owed.gold, ironBar: bars };
    this.owed = { gold: 0, ironOre: 0 };
    return out;
  }

  // ── The tick ────────────────────────────────────────────────────────

  step() {
    this.tick++;
    const occ = this.occupied;
    for (const m of this.miners) {
      occ[idx(m.x, m.y)] = 1;
      if (m.y > 0) occ[idx(m.x, m.y - 1)] = 1;
    }
    this.world.step((x, y) => occ[idx(x, y)] === 1);
    for (const m of this.miners) {
      occ[idx(m.x, m.y)] = 0;
      if (m.y > 0) occ[idx(m.x, m.y - 1)] = 0;
    }
    for (const m of this.miners) this.stepMiner(m);
    for (const c of this.carts) this.stepCart(c);
    this.stepBuckets();
    if (this.tick % 30 === 0) this.replan();
  }

  /** Deepest the shaft's ladder reaches, in rows below the surface. */
  get depth() {
    let y = this.strata.surface[this.shaftX];
    while (y < H - 1 && this.cell(this.shaftX, y + 1) === LADDER) y++;
    return Math.max(0, y - this.strata.surface[this.shaftX]);
  }

  save(now: number): MineSave {
    return {
      seed: this.seed,
      tick: this.tick,
      cells: encodeGrid(this.world.cells),
      plan: encodeGrid(this.plan),
      miners: this.miners.map((m) => ({ x: m.x, y: m.y, iron: m.iron, gold: m.gold, spoil: m.spoil })),
      carts: this.carts.map((c) => ({ level: c.level, side: c.side, x: c.x, iron: c.iron, gold: c.gold })),
      buckets: this.buckets.map((b) => ({ ...b })),
      shaftLevel: this.shaftLevel,
      hired: this.hired,
      ironOre: this.ironOre + this.owed.ironOre,
      mined: { ...this.mined },
      savedAt: now,
    };
  }
}

const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** A stored mine kept only if it is whole and well formed; else null (the
 * page starts a fresh one). */
export function decodeMineSave(s: any): MineSave | null {
  if (!s || typeof s !== "object") return null;
  if (!int(s.seed, 0, 0xffffffff) || !int(s.tick, 0, 1e12) || !int(s.shaftLevel, 0, 100) || !int(s.hired, 0, MAX_MINERS)) return null;
  if (!int(s.ironOre, 0, 1e9) || !Number.isFinite(s.savedAt) || !s.mined || !int(s.mined.iron, 0, 1e9) || !int(s.mined.gold, 0, 1e9)) return null;
  if (!decodeGrid(s.cells, CELLS, MATERIAL_COUNT) || !decodeGrid(s.plan, CELLS, 6)) return null;
  const pack = (m: any) => int(m?.iron, 0, 1000) && int(m?.gold, 0, 1000) && int(m?.spoil, 0, 1000);
  if (!Array.isArray(s.miners) || s.miners.length > MAX_MINERS || !s.miners.every((m: any) => int(m?.x, 0, W - 1) && int(m?.y, 1, H - 1) && pack(m))) return null;
  if (!Array.isArray(s.carts) || !s.carts.every((c: any) => int(c?.level, 0, 100) && (c.side === 1 || c.side === -1) && int(c.x, 0, W - 1) && int(c.iron, 0, 1e4) && int(c.gold, 0, 1e4))) return null;
  if (!Array.isArray(s.buckets) || !s.buckets.every((b: any) => int(b?.y, 0, H) && int(b.iron, 0, 1e4) && int(b.gold, 0, 1e4))) return null;
  return {
    seed: s.seed, tick: s.tick, cells: s.cells, plan: s.plan, shaftLevel: s.shaftLevel, hired: s.hired, ironOre: s.ironOre, savedAt: s.savedAt,
    mined: { iron: s.mined.iron, gold: s.mined.gold },
    miners: s.miners.map((m: any) => ({ x: m.x, y: m.y, iron: m.iron, gold: m.gold, spoil: m.spoil })),
    carts: s.carts.map((c: any) => ({ level: c.level, side: c.side, x: c.x, iron: c.iron, gold: c.gold })),
    buckets: s.buckets.map((b: any) => ({ y: b.y, iron: b.iron, gold: b.gold })),
  };
}
