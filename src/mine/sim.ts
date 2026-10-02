/** The Mine: an idle mining operation in a falling-sand world. Miners sink a
 * laddered shaft through the dirt (shoring its walls with timber so it holds)
 * into the stone, drive a tunnel out either side at every level, lay track
 * and torches along each, hang lamps in the shaft, chase any iron or gold
 * they glimpse, and build a mine cart for each tunnel. Ore goes up in a
 * miner's pack to the forge on the surface, or rides a cart back to the
 * shaft where the hoist lifts it, onto the forge's piles.
 *
 * The crew live and work in the buildings on the surface (`buildings.ts`):
 * the player puts each miner to a trade, the face, the forge or the smithy.
 * Forge hands smelt the ore into bars; smiths work the bars into iron bars,
 * steel and Gold for the player. Miners fetch supplies from the warehouse
 * for the fittings, eat in the barracks' lounge, and sleep in its bunks at
 * night, all but the night shift.
 *
 * The work itself is a plan painted over the grid: each cell may be marked to
 * be dug out, or dug and fitted with a ladder, rail, torch or lamp. A miner
 * looks for the nearest unclaimed marked cell it can reach (a breadth-first
 * search over where it can stand), walks there, and does it. Fires and
 * floodwater in the workings are jobs too: miners douse the one and bail
 * the other.
 *
 * Above ground the days turn and the weather changes (`skyAt`): rain lies on
 * the ground, runs downhill and pours down the shaft. Below, the mine is
 * dangerous: loose ground falls, floods rise, lava waits deep down, and wood
 * catches fire. A miner can be crushed, drown, starve when trapped, be burnt
 * or be struck by lightning; deaths are spaced out (`DEATH_GAP`, which a new
 * mine also starts with), the last miner always gets out, and a catch-up
 * after time away loses at most one. */
import {
  AIR, BEDROCK, CELLS, DIG_TICKS, DIRT, GOLD, GRAVEL, H, IRON, LADDER, LAMP, LAVA, LOOSE, MATERIAL_COUNT, RAIL, ROCK, RUBBLE, STONE, TIMBER, TORCH, W, World,
  decodeGrid, encodeGrid, generate, hash01, idx, inBounds, isLoose, isOre, isPassable, isSoil, isSolid, isWood, strata, type Material, type Strata,
} from "./world.ts";
import { BUILDINGS, bays, layout, pathTicks, type BuildingId, type Layout, type Purpose, type Spot } from "./buildings.ts";

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
/** Supplies a miner fetches from the warehouse: each fitting and each
 * timber shoring uses one. */
export const KIT = 12;
/** Ticks a forge worker takes to smelt one ore, and a smith to work an iron
 * bar or a gold ingot; a stage nobody is put to works at a quarter of one
 * worker. Every `BARS_PER_STEEL` iron bars worked also folds a steel bar. */
export const SMELT_TICKS = 6 * TICK_HZ, SMITH_IRON_TICKS = 40 * TICK_HZ, SMITH_GOLD_TICKS = 4 * TICK_HZ, BARS_PER_STEEL = 20;
const IDLE_PACE = 4, STOCK_TICKS = 2 * TICK_HZ;
/** Share of the crew that works through the night (the rest sleep), and
 * what each rank of Coffee adds, up to the most. */
export const NIGHT_SHIFT = 0.2, COFFEE_STEP = 0.05, NIGHT_SHIFT_MAX = 0.8;
/** Of the water running into the shaft's mouth, the share the shaft house
 * keeps out, and what each rank of Waterproofing adds. */
export const SEAL_BASE = 0.2, SEAL_STEP = 0.15;
export type Job = "mine" | "forge" | "smith";
export const JOBS: readonly Job[] = ["mine", "forge", "smith"];

const STEP_TICKS = 8, CLIMB_TICKS = 10, FALL_TICKS = 2, CART_STEP = 5, BUCKET_STEP = 2, CART_BUILD = 240;
/** Rows between tunnel levels, and how far a tunnel reaches before the shaft
 * is sunk to the next. */
const LEVEL_GAP = 14, OPEN_REACH = 28;

/** One day and night, and how long each spell of weather lasts. */
export const DAY_TICKS = 12 * 60 * TICK_HZ;
export const WEATHER_TICKS = 4 * 60 * TICK_HZ;
/** A miner goes up to eat this long after its last meal, and starves at
 * the second; it holds its breath under water for the third. */
export const MEAL_TICKS = 9 * 60 * TICK_HZ, STARVE_TICKS = 25 * 60 * TICK_HZ, BREATH_TICKS = 15 * TICK_HZ;
/** After a miner dies, the next one to come to harm this soon gets out alive. */
export const DEATH_GAP = 20 * 60 * TICK_HZ;
const FIRE_TICKS = 240, BAIL_TICKS = 24, DOUSE_TICKS = 30, SCORCH_TICKS = 2 * TICK_HZ;

export type Weather = "clear" | "cloudy" | "rain" | "storm";
export type Sky = { weather: Weather; daylight: number; clouds: number; rain: number };
export type Cause = "crushed" | "drowned" | "starved" | "burnt" | "struck";
export const CAUSES: readonly Cause[] = ["crushed", "drowned", "starved", "burnt", "struck"];
/** Something the page or renderer may tell of: a miner lost or saved, a
 * fire, a lightning strike. */
export type MineNews = { tick: number; kind: "lost" | "saved" | "fire" | "strike"; cause?: Cause; x: number; y: number };

const WEATHER_LOOK: Record<Weather, { clouds: number; rain: number }> = {
  clear: { clouds: 0.05, rain: 0 }, cloudy: { clouds: 0.6, rain: 0 }, rain: { clouds: 0.85, rain: 0.5 }, storm: { clouds: 1, rain: 1 },
};

/** How bright the day is at `tick`: 1 in full day, 0 at night, with short
 * dawns and dusks; a new mine starts in the morning. */
export function daylight(tick: number) {
  const phase = (tick / DAY_TICKS + 0.1) % 1;
  return Math.max(0, Math.min(1, 0.5 + 1.6 * Math.sin(phase * Math.PI * 2)));
}
/** The weather of spell `n` for a seed: the first is always clear. */
export function weatherOf(seed: number, n: number): Weather {
  if (n <= 0) return "clear";
  const r = hash01(n, 91, seed);
  return r < 0.46 ? "clear" : r < 0.74 ? "cloudy" : r < 0.92 ? "rain" : "storm";
}
/** The sky at `tick`: the weather, the daylight, and the cloud and rain,
 * eased from the last spell over the first twenty seconds of each. */
export function skyAt(seed: number, tick: number, force?: Weather | null): Sky {
  const n = Math.floor(tick / WEATHER_TICKS), weather = force ?? weatherOf(seed, n);
  const now = WEATHER_LOOK[weather], before = WEATHER_LOOK[force ?? weatherOf(seed, n - 1)];
  const t = force ? 1 : Math.min(1, (tick - n * WEATHER_TICKS) / (20 * TICK_HZ));
  return { weather, daylight: daylight(tick), clouds: before.clouds + (now.clouds - before.clouds) * t, rain: before.rain + (now.rain - before.rain) * t };
}

export type Miner = {
  id: number;
  x: number;
  y: number;
  iron: number;
  gold: number;
  spoil: number;
  /** Its trade (the player's allocation), and supplies in hand. */
  job: Job;
  kit: number;
  /** What it is doing now (drawn), and toward where it faces. */
  action: "idle" | "walk" | "dig" | "build" | "bail" | "douse" | "rest" | "sleep" | "lounge" | "smelt" | "smith" | "stock";
  facing: number;
  /** The cell being dug or built, or -1. */
  work: number;
  task: Task | null;
  path: number[];
  timer: number;
  /** The timer runs down on work (`finish` follows), not a step or a rest. */
  working: boolean;
  fall: number;
  /** Ticks since its last meal; breath left; ticks spent in fire. */
  fed: number;
  breath: number;
  scorch: number;
  /** Inside a building (out of the grid, its feet left at the door): where,
   * why, at which spot, ticks since it went in (or began to leave), and
   * the tick its work is next done. */
  inside: Inside | null;
};
export type Inside = { b: BuildingId; why: Purpose; slot: number; t: number; out: boolean; until: number };
type Task =
  | { kind: "dig" | "build" | "bail" | "douse"; cell: number }
  | { kind: "escape" }
  | { kind: "deliver" }
  | { kind: "dump" }
  | { kind: "cart"; level: number; side: number }
  | { kind: "enter"; b: BuildingId; why: Purpose }
  | { kind: "rest" };
export type Cart = { level: number; side: number; x: number; y: number; iron: number; gold: number; state: "out" | "parked" | "back"; timer: number };
export type Bucket = { y: number; iron: number; gold: number };

export type MineSave = {
  seed: number;
  tick: number;
  cells: string;
  plan: string;
  miners: { x: number; y: number; iron: number; gold: number; spoil: number; fed?: number; job?: Job; kit?: number }[];
  carts: { level: number; side: number; x: number; iron: number; gold: number }[];
  buckets: Bucket[];
  shaftLevel: number;
  hired: number;
  ironOre: number;
  mined: { iron: number; gold: number };
  savedAt: number;
  /** Added with the weather (absent from older saves): the water layer,
   * burning cells as [cell, ticks left], miners lost by cause, and the
   * ticks left before another can die. */
  water?: string;
  burning?: [number, number][];
  lost?: Partial<Record<Cause, number>>;
  mercy?: number;
  /** Added with the buildings: the crew's allocation, the forge's ore
   * piles, the bars waiting at the smithy, and the iron bars worked toward
   * the next steel. */
  jobs?: { forge: number; smith: number };
  ore?: { iron: number; gold: number };
  bars?: { iron: number; gold: number };
  steelWork?: number;
};

/** The job each `jobAt` value stands for. */
const JOB_KIND = ["", "dig", "build", "bail", "douse"] as const;

/** Price in Gold of the next miner for a crew of `crew` (the first is free,
 * so a crew of one pays the base price): a smaller crew hires cheaper. */
export const hirePrice = (crew: number) => Math.round(120 * Math.pow(1.6, crew - 1));

export class MineSim {
  readonly seed: number;
  readonly world: World;
  readonly strata: Strata;
  readonly plan: Uint8Array;
  /** The shaft's column, and the spoil heap's. */
  readonly shaftX = W / 2;
  readonly heapX = W - 12;
  /** The buildings, laid out for the crew (the barracks grows with it). */
  buildings!: Layout;
  /** How many of the crew the player puts to the forge and the smithy (the
   * rest mine). */
  jobs = { forge: 0, smith: 0 };
  /** Ore waiting at the forge, bars waiting at the smithy, and iron bars
   * worked toward the next steel. */
  ore = { iron: 0, gold: 0 };
  bars = { iron: 0, gold: 0 };
  steelWork = 0;
  /** Ranks of the Mine skills: Coffee (more of the crew on the night
   * shift) and Waterproofing (the shaft house keeps more rain out). */
  coffee = 0;
  waterproof = 0;
  private idleWork = { forge: 0, smith: 0 };
  /** Fittings planned on open air (as of the last survey), waiting on
   * supplies from the warehouse. */
  private fittings = 0;
  private turn = false;
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
  /** Miners lost, by cause. */
  lost: Record<Cause, number> = { crushed: 0, drowned: 0, starved: 0, burnt: 0, struck: 0 };
  /** Ticks left in which a miner who comes to harm gets out alive. */
  mercy = 0;
  /** Set by the page while it catches up on time away: then only the first
   * miner to come to harm dies. */
  catchingUp = false;
  private lostCatchingUp = 0;
  /** Recent news, newest last (not saved). */
  news: MineNews[] = [];
  /** Fixes the weather (the console helper and tests); null follows the
   * seed's own. */
  weatherOverride: Weather | null = null;
  /** Ticks each cell has left to burn, and the burning cells. */
  readonly burn = new Uint16Array(CELLS);
  private burning: number[] = [];
  private rainOwed = 0;
  private hits: [number, number, Material][] = [];
  /** Paid out but not yet collected by the page (`collect`). */
  private owed = { gold: 0, ironBar: 0, steelBar: 0 };
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
    const water = saved?.water !== undefined && cells ? decodeGrid(saved.water, CELLS, 2) : null;
    this.world = new World(cells ?? generate(this.seed), water ?? undefined);
    this.plan = plan ?? new Uint8Array(CELLS);
    if (saved && cells && plan) {
      this.tick = saved.tick;
      this.shaftLevel = saved.shaftLevel;
      this.hired = saved.hired;
      this.ironOre = saved.ironOre;
      this.mined = { ...saved.mined };
      this.mercy = saved.mercy ?? 0;
      for (const c of CAUSES) this.lost[c] = saved.lost?.[c] ?? 0;
      for (const [c, t] of saved.burning ?? []) this.ignite(c, t);
      for (const m of saved.miners) {
        this.addMiner(m.x, m.y, m);
        const added = this.miners[this.miners.length - 1];
        added.fed = m.fed ?? 0;
        added.job = m.job ?? "mine";
        added.kit = m.kit ?? KIT;
      }
      this.jobs = { forge: saved.jobs?.forge ?? 0, smith: saved.jobs?.smith ?? 0 };
      this.ore = { ...(saved.ore ?? { iron: 0, gold: 0 }) };
      this.bars = { ...(saved.bars ?? { iron: 0, gold: 0 }) };
      this.steelWork = saved.steelWork ?? 0;
      for (const c of saved.carts) {
        const y = this.levels[c.level];
        if (y !== undefined) this.carts.push({ level: c.level, side: c.side, x: c.x, y, iron: c.iron, gold: c.gold, state: "back", timer: 0 });
      }
      this.buckets = saved.buckets.map((b) => ({ ...b }));
      this.relayout();
      this.assignJobs();
    } else {
      this.planShaft(0);
      this.relayout();
      const door = this.buildings.barracks.door;
      this.addMiner(door, this.standY(door));
      // A new mine's first crew learns the ropes before anyone can die.
      this.mercy = DEATH_GAP;
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
    // The shaft house's boards cross the shaft's mouth, ladder or none.
    return isSolid(m) || m === LADDER || m === BEDROCK || (x === this.shaftX && y === this.strata.surface[x]);
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
    return y >= this.strata.surface[x];
  }

  /** Lava touches a miner standing at (x, y). */
  private lavaBeside(x: number, y: number) {
    const c = (dx: number, dy: number) => this.cell(x + dx, y + dy) === LAVA;
    return c(-1, 0) || c(1, 0) || c(-1, -1) || c(1, -1) || c(0, 1) || c(0, -2);
  }
  /** A miner can stand at (x, y) without harm: head above water, out of the
   * fire, away from lava. */
  safe(x: number, y: number) {
    const i = idx(x, y);
    return !this.under(i) && !this.burn[i] && !this.burn[i - W] && !this.lavaBeside(x, y);
  }
  /** A miner with its feet in cell i is under water (not just in a drip). */
  private under(i: number) {
    return this.world.water[i] === 1 && this.world.water[i - W] === 1;
  }
  /** While set, searches cross unsafe ground (a miner fleeing it). */
  private daring = false;

  /** Calls `visit` with every safe position one move away from feet (x, y). */
  private moves(x: number, y: number, visit: (nx: number, ny: number) => void) {
    if (!this.daring) {
      const inner = visit;
      visit = (nx, ny) => {
        if (this.safe(nx, ny)) inner(nx, ny);
      };
    }
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

  /** The work a cell waits on: 4 to douse its fire, 1 to dig it, 2 to fit
   * it (a ladder or rail goes in under water too), 3 to bail the water out
   * of it (underground), 0 none. */
  jobAt(c: number) {
    const m = this.world.cells[c];
    if (this.burn[c]) return 4;
    const p = this.plan[c];
    if (!p) return 0;
    if (m === BEDROCK) return 0;
    if (isSolid(m)) return 1;
    if (p >= P_LADDER && m === AIR) return 2;
    if (this.world.water[c] && c >= this.strata.surface[c % W] * W + W) return 3;
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
    // A side stops where its tunnel was given up (at lava), or reaches on.
    const reach = (side: number) => {
      let n = 0;
      for (let x = this.shaftX + side; x >= 2 && x <= W - 3; x += side) {
        if (!this.passable(x, y - 1)) return this.plan[idx(x, y - 1)] ? n : W;
        n++;
      }
      return n;
    };
    const most = this.shaftX - 3;
    if (Math.min(reach(-1), most) >= Math.min(OPEN_REACH, most) && Math.min(reach(1), most) >= Math.min(OPEN_REACH, most)) this.planShaft(k + 1);
  }

  /** After digging (x, y): shore loose ground beside or above the hole
   * with timber, follow any ore it bared, and glimpse ore a few cells on. */
  private afterDig(x: number, y: number, miner: Miner) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]]) {
      const nx = x + dx, ny = y + dy, m = this.cell(nx, ny);
      if (!inBounds(nx, ny) || !isLoose(m) || this.plan[idx(nx, ny)]) continue;
      // Gravel and loose dirt run before they can all be shored.
      if ((m === GRAVEL || m === LOOSE) && hash01(nx, ny, this.seed + this.tick) < 0.3) continue;
      // Shoring uses supplies if it has them (a miner short of them makes
      // do with offcuts, sooner than let the ground run).
      this.world.set(nx, ny, TIMBER);
      miner.kit = Math.max(0, miner.kit - 1);
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
      job: "mine", kit: 0, action: "idle", facing: 1, work: -1, task: null, path: [], timer: 0, working: false, fall: 0, fed: 0, breath: BREATH_TICKS, scorch: 0, inside: null,
    });
  }
  /** Hires a miner at the barracks door (the page charges for it). The
   * second hand goes to the forge, and the fifth to the smithy, while they
   * have nobody. */
  hire() {
    if (this.miners.length >= MAX_MINERS) return false;
    this.hired++;
    const door = this.buildings.barracks.door;
    this.addMiner(door, this.standY(door));
    if (this.jobs.forge === 0) this.jobs.forge = 1;
    else if (this.jobs.smith === 0 && this.miners.length >= 5) this.jobs.smith = 1;
    this.relayout();
    this.assignJobs();
    return true;
  }

  // ── Buildings and trades ────────────────────────────────────────────

  /** Lays the buildings out again (the barracks bunks the whole crew). */
  private relayout() {
    const n = bays(this.miners.length);
    if (this.buildings && this.bayCount === n) return;
    this.bayCount = n;
    this.buildings = layout(this.strata.surface, this.shaftX, n);
  }
  private bayCount = 0;

  /** Puts `forge` and `smith` of the crew to those trades (the rest mine),
   * as far as the crew goes. */
  setJobs(forge: number, smith: number) {
    const n = this.miners.length;
    forge = Math.max(0, Math.min(n, Math.floor(forge)));
    smith = Math.max(0, Math.min(n - forge, Math.floor(smith)));
    this.jobs = { forge, smith };
    this.assignJobs();
  }
  /** Gives each miner its trade to match the allocation, changing as few as
   * it can, and those nearest the surface first. */
  private assignJobs() {
    const n = this.miners.length;
    this.jobs.forge = Math.min(this.jobs.forge, n);
    this.jobs.smith = Math.min(this.jobs.smith, n - this.jobs.forge);
    const want: Record<Job, number> = { forge: this.jobs.forge, smith: this.jobs.smith, mine: n - this.jobs.forge - this.jobs.smith };
    const count = (j: Job) => this.miners.filter((m) => m.job === j).length;
    // Too many in a trade: the deepest of them go back to the face.
    const byDepth = (a: Miner, b: Miner) => (a.inside ? 0 : a.y) - (b.inside ? 0 : b.y);
    for (const j of JOBS) {
      const over = count(j) - want[j];
      if (over > 0) for (const m of this.miners.filter((o) => o.job === j).sort(byDepth).reverse().slice(0, over)) this.changeJob(m, "mine");
    }
    for (const j of ["forge", "smith"] as Job[]) {
      const short = want[j] - count(j);
      if (short > 0) for (const m of this.miners.filter((o) => o.job === "mine").sort(byDepth).slice(0, short)) this.changeJob(m, j);
    }
  }
  private changeJob(m: Miner, job: Job) {
    if (m.job === job) return;
    m.job = job;
    if (!m.inside) this.release(m);
  }
  /** Whether it is night (most of the crew asleep). */
  get night() {
    return daylight(this.tick) < 0.15;
  }
  /** The share of the crew on the night shift. */
  get nightShift() {
    return Math.min(NIGHT_SHIFT_MAX, NIGHT_SHIFT + COFFEE_STEP * this.coffee);
  }
  /** It's night and this miner isn't on the night shift: as many as the
   * shift takes, miners at the face first, then the forge's, then the
   * smithy's, the first hired first. */
  private bedtime(m: Miner) {
    if (!this.night) return false;
    const shift = Math.floor(this.miners.length * this.nightShift);
    if (!shift) return true;
    let rank = 0;
    for (const j of JOBS)
      for (const o of this.miners) {
        if (o.job !== j) continue;
        if (o === m) return rank >= shift;
        rank++;
      }
    return true;
  }
  /** The spot a miner inside is headed for. */
  spotOf(s: Inside): Spot {
    const spots = this.buildings[s.b].spots[s.why]!;
    return spots[s.slot % spots.length];
  }
  /** The lowest spot of its kind nobody inside holds. */
  private freeSlot(b: BuildingId, why: Purpose) {
    const held = new Set(this.miners.filter((o) => o.inside?.b === b && o.inside.why === why).map((o) => o.inside!.slot));
    let k = 0;
    while (held.has(k)) k++;
    return k;
  }
  /** Takes a miner in (it stands at the door): it walks to a free spot. */
  private goIn(m: Miner, b: BuildingId, why: Purpose, arrived = false) {
    this.release(m);
    const building = this.buildings[b];
    m.x = building.door;
    m.y = this.standY(building.door);
    // What it carries is left on the way: ore at the forge, spoil tipped.
    if (m.iron + m.gold > 0) this.pay(m.iron, m.gold);
    m.iron = m.gold = m.spoil = 0;
    const s: Inside = { b, why, slot: this.freeSlot(b, why), t: 0, out: false, until: 0 };
    const walk = pathTicks(this.spotOf(s).path);
    if (arrived) s.t = walk;
    s.until = walk + (why === "lounge" ? 120 + Math.floor(hash01(m.id, this.tick, this.seed + 3) * 200) : why === "stock" ? STOCK_TICKS : 0);
    m.inside = s;
    m.action = "walk";
  }
  /** Sets a miner inside walking back out to the door. */
  private goOut(m: Miner) {
    const s = m.inside!;
    if (s.out) return;
    const walk = pathTicks(this.spotOf(s).path);
    s.out = true;
    s.t = Math.max(0, walk - Math.min(s.t, walk));
    m.action = "walk";
  }
  /** A tick inside: sleeping till morning, sitting a while in the lounge (as
   * long as a storm lasts, for those who'd be out in it), fetching supplies, or
   * working the furnace or the anvil. */
  private stepInside(m: Miner) {
    const s = m.inside!, walk = pathTicks(this.spotOf(s).path);
    s.t++;
    if (s.out) {
      if (s.t >= walk) {
        m.inside = null;
        m.action = "idle";
      }
      return;
    }
    if (s.t < walk) return;
    if (s.why === "sleep") {
      m.action = "sleep";
      m.fed = 0;
      if (!this.bedtime(m)) this.goOut(m);
    } else if (s.why === "lounge") {
      m.action = "lounge";
      m.fed = 0;
      if (this.bedtime(m)) this.goIn(m, "barracks", "sleep");
      // The face's crew sits out a thunderstorm rather than cross the yard.
      else if (s.t >= s.until && !(this.sky.weather === "storm" && m.job === "mine")) this.goOut(m);
    } else if (s.why === "stock") {
      m.action = "stock";
      if (s.t >= s.until) {
        m.kit = KIT;
        this.goOut(m);
      }
    } else {
      m.fed++;
      const trade = s.b === "forge" ? "forge" : "smith";
      if (m.job !== trade || this.bedtime(m) || m.fed > MEAL_TICKS) return this.goOut(m);
      const pace = this.craftTicks(trade);
      if (!pace) {
        m.action = "idle";
        s.until = 0;
        return;
      }
      m.action = trade === "forge" ? "smelt" : "smith";
      if (s.until === 0 || s.until <= walk) s.until = s.t + pace;
      if (s.t >= s.until) {
        this.craft(trade);
        s.until = s.t + (this.craftTicks(trade) || 1);
      }
    }
  }
  /** Ticks the next piece of work at the forge or the anvil takes, or 0 for
   * nothing to work. */
  private craftTicks(trade: "forge" | "smith") {
    if (trade === "forge") return this.ore.iron + this.ore.gold > 0 ? SMELT_TICKS : 0;
    return this.bars.gold > 0 ? SMITH_GOLD_TICKS : this.bars.iron > 0 ? SMITH_IRON_TICKS : 0;
  }
  /** One piece of work done: an ore smelted (twelve iron ore make a bar; a
   * gold ore an ingot), or a bar worked into what the player is paid (iron
   * bars, now and then a steel bar, and Gold struck from the ingots). */
  private craft(trade: "forge" | "smith") {
    if (trade === "forge") {
      // Iron and gold by turns, while both wait.
      this.turn = !this.turn;
      if (this.ore.iron > 0 && (this.turn || this.ore.gold === 0)) {
        this.ore.iron--;
        if (++this.ironOre >= ORE_PER_IRON_BAR) {
          this.ironOre -= ORE_PER_IRON_BAR;
          this.bars.iron++;
        }
      } else if (this.ore.gold > 0) {
        this.ore.gold--;
        this.bars.gold++;
      }
    } else if (this.bars.gold > 0) {
      this.bars.gold--;
      this.owed.gold += GOLD_PER_NUGGET;
    } else if (this.bars.iron > 0) {
      this.bars.iron--;
      this.owed.ironBar++;
      if (++this.steelWork >= BARS_PER_STEEL) {
        this.steelWork = 0;
        this.owed.steelBar++;
      }
    }
  }
  /** A stage nobody is put to still gets done, slowly. */
  private stepIdleTrades() {
    for (const trade of ["forge", "smith"] as const) {
      if (this.jobs[trade] > 0) continue;
      const pace = this.craftTicks(trade);
      if (!pace) {
        this.idleWork[trade] = 0;
        continue;
      }
      if (++this.idleWork[trade] >= pace * IDLE_PACE) {
        this.idleWork[trade] = 0;
        this.craft(trade);
      }
    }
  }
  /** Workers at the forge or the anvil now. */
  working(b: BuildingId) {
    return this.miners.filter((m) => m.inside?.b === b && !m.inside.out && (m.action === "smelt" || m.action === "smith")).length;
  }

  /** The shaft house keeps out a share of the water running into the
   * shaft's mouth (it lingers in the mouth about three ticks). */
  private seal() {
    const keep = Math.min(0.95, SEAL_BASE + SEAL_STEP * this.waterproof), q = 1 - Math.pow(1 - keep, 1 / 3);
    const top = this.strata.surface[this.shaftX];
    for (let y = top - 2; y <= top + 1; y++)
      for (let x = this.shaftX - 1; x <= this.shaftX + 1; x++)
        if (this.world.water[idx(x, y)] && hash01(idx(x, y), this.tick, this.seed + 71) < q) this.world.setWater(x, y, false);
  }

  private release(m: Miner) {
    const t = m.task;
    if (t && "cell" in t && this.reserved[t.cell] === m.id) this.reserved[t.cell] = 0;
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
  /** Water and fire are also reached down a step to either side (a bucket
   * dipped into a flooded hole beside one's feet). */
  private static readonly WET_REACH: readonly [number, number][] = [[-1, 1], [1, 1]];
  private reachable(x: number, y: number, c: number) {
    const cx = c % W, cy = (c - cx) / W, near = this.jobAt(c) >= 3;
    return (
      MineSim.REACH.some(([dx, dy, dig]) => x + dx === cx && y + dy === cy && (dig || near || this.world.cells[c] === AIR)) ||
      (near && MineSim.WET_REACH.some(([dx, dy]) => x + dx === cx && y + dy === cy))
    );
  }

  private chooseTask(m: Miner) {
    const start = idx(m.x, m.y), ore = m.iron + m.gold;
    const shallow = m.y < this.strata.stoneTop[this.shaftX] + 6, up = m.y < this.strata.surface[m.x] + 4;
    // Night: off to bed, unless on the night shift (or there's no way up).
    if (this.bedtime(m) && this.goEnter(m, start, "barracks", "sleep")) return;
    // Hungry: to the lounge for a meal, unless there's no way there.
    let cutOff = false;
    if (m.fed > MEAL_TICKS) {
      if (this.goEnter(m, start, "barracks", "lounge")) return;
      cutOff = true;
    }
    // The forge's and the smithy's hands go to their work; one cut off below
    // digs on till it can get there.
    if (m.job !== "mine" && this.goEnter(m, start, m.job === "forge" ? "forge" : "smithy", "work")) return;
    // Out of supplies at the surface: to the warehouse first.
    if (m.kit === 0 && (up || this.fittings > 0) && this.goEnter(m, start, "warehouse", "stock")) return;
    // A full pack goes up, if there's a way; a miner cut off works on.
    if (ore >= PACK_ORE || (m.spoil >= PACK_SPOIL && shallow)) {
      if (this.goDeliver(m, start)) return;
      cutOff = true;
    }
    // One cut off from the surface digs out the shaft before anything else.
    const cartJobs = this.cartJobs(), kit = m.kit;
    const path = this.search(start, (x, y, d) => {
      const b = this.bestAt(x, y, cartJobs, kit, cutOff);
      return b ? d + b.score : null;
    }, cutOff ? 60 : 20);
    if (path) {
      const end = path.length ? path[path.length - 1] : start, ex = end % W;
      const chosen = this.bestAt(ex, (end - ex) / W, cartJobs, kit, cutOff)!;
      if (chosen.cart) {
        m.task = { kind: "cart", ...chosen.cart };
        this.cartClaims.add(`${chosen.cart.level}:${chosen.cart.side}`);
      } else {
        m.task = { kind: JOB_KIND[this.jobAt(chosen.cell)] as "dig", cell: chosen.cell };
        this.reserved[chosen.cell] = m.id;
      }
      m.path = path;
      return;
    }
    if (ore + m.spoil > 0 && this.goDeliver(m, start)) return;
    // Nothing it can do: fetch supplies if it has none (there may be
    // fittings waiting), else rest in the lounge.
    if (kit < KIT / 2 && this.goEnter(m, start, "warehouse", "stock")) return;
    this.goRest(m, start);
  }
  /** The best work a miner standing at (x, y) could take up, scored (lower
   * first: ore before tunnelling, fitting what's dug before digging on, a
   * cart before either), or null for none; fittings only with supplies in
   * hand (`kit`), and the shaft first of all for one cut off below. */
  private bestAt(x: number, y: number, cartJobs: { level: number; side: number }[], kit: number, cutOff = false) {
    let best: { score: number; cell: number; cart: { level: number; side: number } | null } | null = null;
    for (const [dx, dy, dig] of MineSim.REACH) {
      const cx = x + dx, cy = y + dy;
      if (!inBounds(cx, cy)) continue;
      const c = idx(cx, cy), job = this.jobAt(c);
      if (!job || this.reserved[c] || (job === 1 && !dig) || (job === 2 && kit <= 0)) continue;
      const score = cutOff && cx === this.shaftX && job <= 2 ? -60 : job === 4 ? -40 : job === 1 && isOre(this.world.cells[c]) ? -30 : job === 3 ? -1 : job === 2 ? -2 : 0;
      if (!best || score < best.score) best = { score, cell: c, cart: null };
    }
    for (const [dx, dy] of MineSim.WET_REACH) {
      if (!inBounds(x + dx, y + dy)) continue;
      const c = idx(x + dx, y + dy), job = this.jobAt(c);
      if (job < 3 || this.reserved[c]) continue;
      const score = job === 4 ? -40 : -1;
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
    const top = (x: number) => this.strata.surface[x] + 4, forge = this.buildings.forge.door;
    const path = this.search(start, (x, y, d) => {
      if (Math.abs(x - forge) <= 1 && y < top(x)) return d;
      if (m.spoil < PACK_SPOIL || m.iron + m.gold > 0)
        for (const c of this.carts) if (c.state === "parked" && c.y === y && Math.abs(c.x - x) <= 1 && c.iron + c.gold < CART_LOAD) return d;
      return null;
    });
    if (!path) return false;
    m.task = { kind: "deliver" };
    m.path = path;
    return true;
  }
  /** Off to building `b`'s door to go in, if there's a way there. */
  private goEnter(m: Miner, start: number, b: BuildingId, why: Purpose, limit = 30000) {
    const door = this.buildings[b].door;
    const path = this.search(start, (x, y, d) => (Math.abs(x - door) <= 1 && y < this.strata.surface[x] + 4 ? d : null), 0, limit);
    if (!path) return false;
    m.task = { kind: "enter", b, why };
    m.path = path;
    return true;
  }
  /** Off to rest in the lounge; with no way there, a rest where it stands. */
  private goRest(m: Miner, start: number) {
    if (this.goEnter(m, start, "barracks", "lounge", 6000)) return;
    m.task = { kind: "rest" };
    m.path = [];
    m.timer = 0;
  }
  /** Out of the water, fire or lava's reach, by any way there is. */
  private goEscape(m: Miner) {
    this.release(m);
    m.timer = 0;
    this.daring = true;
    const path = this.search(idx(m.x, m.y), (x, y, d) => (d > 0 && this.safe(x, y) ? d : null), 0, 8000);
    this.daring = false;
    if (!path) return;
    m.task = { kind: "escape" };
    m.path = path;
  }

  /** It's raining (or storming) hard enough to shelter from. */
  get raining() {
    return this.sky.rain > 0.2;
  }
  get sky(): Sky {
    return skyAt(this.seed, this.tick, this.weatherOverride);
  }

  /** Harm that finds a miner where it stands: water over its head, fire,
   * lava beside it, hunger. Returns false if it died. */
  private hazards(m: Miner) {
    const head = idx(m.x, m.y - 1);
    if (this.under(head + W)) {
      if (--m.breath <= 0) return this.kill(m, "drowned");
      if (m.task?.kind !== "escape") this.goEscape(m);
    } else m.breath = Math.min(BREATH_TICKS, m.breath + 3);
    if (this.lavaBeside(m.x, m.y)) return this.kill(m, "burnt");
    if (this.burn[head + W] || this.burn[head]) {
      if (++m.scorch > SCORCH_TICKS) return this.kill(m, "burnt");
      if (m.task?.kind !== "escape") this.goEscape(m);
    } else m.scorch = 0;
    if (++m.fed > STARVE_TICKS) return this.kill(m, "starved");
    return true;
  }

  private stepMiner(m: Miner) {
    if (m.inside) return this.stepInside(m);
    if (!this.hazards(m)) return;
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
    this.daring = m.task?.kind === "escape";
    this.moves(m.x, m.y, (ax, ay) => {
      if (ax === nx && ay === ny) ok = true;
    });
    this.daring = false;
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
    if (t.kind === "escape") return this.release(m);
    if (t.kind === "dig" || t.kind === "build" || t.kind === "bail" || t.kind === "douse") {
      const job = this.jobAt(t.cell);
      if (!job || !this.reachable(m.x, m.y, t.cell) || JOB_KIND[job] !== t.kind) return this.release(m);
      // Heat through the rock: most miners feel lava before they break into
      // it, and give up the workings round about.
      if (t.kind === "dig" && this.nearLava(t.cell) && hash01(t.cell, 77, this.seed) < 0.85) {
        this.abandon(t.cell);
        return this.release(m);
      }
      const m2 = this.world.cells[t.cell];
      m.action = t.kind;
      m.work = t.cell;
      m.facing = t.cell % W > m.x ? 1 : t.cell % W < m.x ? -1 : m.facing;
      m.timer = t.kind === "dig" ? DIG_TICKS[m2] ?? 120 : t.kind === "bail" ? BAIL_TICKS : t.kind === "douse" ? DOUSE_TICKS : BUILD_TICKS[FIXTURE[this.plan[t.cell]]];
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
      if (Math.abs(m.x - this.buildings.forge.door) <= 1 && m.y < this.strata.surface[m.x] + 4) {
        this.pay(m.iron, m.gold);
        m.iron = m.gold = 0;
        // In a storm nobody goes out to the heap: spoil is tipped by the forge.
        if (this.sky.weather === "storm") m.spoil = 0;
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
    if (t.kind === "enter") return this.goIn(m, t.b, t.why);
    // Resting where it stands (cut off from the lounge).
    m.action = "rest";
    m.timer = 90 + Math.floor(hash01(m.id, this.tick, this.seed) * 120);
    m.task = null;
  }

  private nearLava(c: number) {
    const x = c % W, y = (c - x) / W;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.cell(x + dx, y + dy) === LAVA) return true;
    return false;
  }
  /** Gives up the unworked plan round cell c. */
  private abandon(c: number) {
    const x = c % W, y = (c - x) / W;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx, ny = y + dy;
        if (inBounds(nx, ny) && nx !== this.shaftX && isSolid(this.cell(nx, ny))) this.plan[idx(nx, ny)] = P_NONE;
      }
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
        this.afterDig(x, y, m);
      }
    } else if (t.kind === "build") {
      const c = t.cell, x = c % W, y = (c - x) / W;
      if (this.jobAt(c) === 2) {
        this.world.set(x, y, FIXTURE[this.plan[c]]);
        m.kit = Math.max(0, m.kit - 1);
      }
    } else if (t.kind === "bail") {
      const c = t.cell, x = c % W;
      this.world.setWater(x, (c - x) / W, false);
    } else if (t.kind === "douse") {
      this.burn[t.cell] = 0;
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

  /** Ore brought up goes onto the forge's piles. */
  private pay(iron: number, gold: number) {
    this.ore.iron += iron;
    this.ore.gold += gold;
  }
  /** Takes what the smithy has turned out since last asked: Gold, iron bars
   * and steel bars. */
  collect() {
    const out = { ...this.owed };
    this.owed = { gold: 0, ironBar: 0, steelBar: 0 };
    return out;
  }

  // ── Harm ────────────────────────────────────────────────────────────

  /** A miner comes to harm. It dies (returning false), unless it is the
   * last, or another died too lately, or one already died in this
   * catch-up: then it gets out, carried to the barracks by the crew. */
  private kill(m: Miner, cause: Cause) {
    const spared = this.miners.length <= 1 || this.mercy > 0 || (this.catchingUp && this.lostCatchingUp > 0);
    this.release(m);
    this.tell(spared ? "saved" : "lost", m.x, m.y, cause);
    if (spared) {
      m.iron = m.gold = m.spoil = 0;
      m.fed = 0;
      m.breath = BREATH_TICKS;
      m.scorch = 0;
      m.timer = 0;
      this.goIn(m, "barracks", "lounge", true);
      m.inside!.until += 10 * TICK_HZ;
      return false;
    }
    this.miners.splice(this.miners.indexOf(m), 1);
    this.relayout();
    this.assignJobs();
    this.lost[cause]++;
    this.mercy = DEATH_GAP;
    if (this.catchingUp) this.lostCatchingUp++;
    return false;
  }
  get lostTotal() {
    return CAUSES.reduce((n, c) => n + this.lost[c], 0);
  }
  private tell(kind: MineNews["kind"], x: number, y: number, cause?: Cause) {
    this.news.push({ tick: this.tick, kind, x, y, cause });
    if (this.news.length > 24) this.news.shift();
  }

  /** Something solid fell on a miner: a rock may kill it (or glance off),
   * and so may a deep fall of loose ground, now and then. */
  private struckBy(x: number, y: number, mat: Material) {
    const m = this.miners.find((o) => o.x === x && (o.y === y || o.y - 1 === y));
    if (!m) return;
    if (mat === ROCK) {
      if (hash01(x, this.tick, this.seed + 11) < 0.5) this.kill(m, "crushed");
      return;
    }
    let depth = 0;
    while (depth < 8 && isLoose(this.cell(x, y - 1 - depth))) depth++;
    if (depth >= 5 && hash01(x, this.tick, this.seed + 13) < 0.35) this.kill(m, "crushed");
  }

  /** Sets wood cell c alight for `ticks`. */
  ignite(c: number, ticks = FIRE_TICKS) {
    if (c < 0 || c >= CELLS || !isWood(this.world.cells[c]) || this.burn[c] || this.world.water[c]) return;
    this.burn[c] = ticks;
    this.burning.push(c);
  }
  /** Fire burns down, spreads to wood beside it, and goes out in water or
   * the rain; what burns through is gone (and what it held up falls). */
  private stepFire(dt: number) {
    const now = this.burning;
    this.burning = [];
    const rain = this.sky.rain;
    for (const c of now) {
      if (!this.burn[c]) continue;
      const x = c % W, y = (c - x) / W;
      if (!isWood(this.world.cells[c]) || this.world.water[c] || this.world.wet01(x, y - 1) || (rain > 0.3 && y <= this.strata.surface[x])) {
        this.burn[c] = 0;
        continue;
      }
      this.burn[c] = Math.max(0, this.burn[c] - dt);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1]])
        if (inBounds(x + dx, y + dy) && hash01(c, dx * 3 + dy, this.tick + this.seed) < 0.035) this.ignite(idx(x + dx, y + dy));
      if (this.burn[c] === 0) this.world.set(x, y, AIR);
      else this.burning.push(c);
    }
  }

  /** Every ten seconds: a torch may start a fire (rarely), wood beside lava
   * catches, and lava open to the air crusts over into stone; and the
   * fittings waiting are counted. */
  private survey() {
    const cells = this.world.cells, torches: number[] = [];
    let fittings = 0;
    for (let i = 0; i < CELLS; i++) {
      const m = cells[i];
      if (this.plan[i] >= P_LADDER && m === AIR) fittings++;
      if (m === TORCH) torches.push(i);
      if (m !== LAVA) continue;
      const x = i % W, y = (i - x) / W;
      let open = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const n = this.cell(x + dx, y + dy);
        if (isWood(n)) this.ignite(idx(x + dx, y + dy));
        if (isPassable(n) && dy <= 0) open = true;
      }
      if (open && hash01(i, this.tick, this.seed + 21) < 0.08) this.world.set(x, y, STONE);
    }
    this.fittings = fittings;
    if (torches.length && hash01(this.tick, 3, this.seed + 23) < 0.003) {
      const t = torches[Math.floor(hash01(this.tick, 4, this.seed + 23) * torches.length)];
      this.ignite(t);
      this.tell("fire", t % W, Math.floor(t / W));
    }
  }

  /** Rain falls on the ground, a few drops a tick; in a storm, lightning. */
  private weather() {
    const sky = this.sky;
    this.rainOwed += sky.rain * 0.3;
    for (let n = 0; this.rainOwed >= 1; n++, this.rainOwed--) {
      const x = Math.floor(hash01(this.tick, n, this.seed + 33) * W);
      // The shaft house's roof keeps the rain out of the shaft's mouth.
      if (Math.abs(x - this.shaftX) <= 3 || !this.passable(x, 0) || this.world.water[x]) continue;
      let y = 0;
      while (y < H - 1 && this.passable(x, y + 1) && !this.world.water[idx(x, y + 1)]) y++;
      this.world.setWater(x, y, true);
    }
    if (sky.weather !== "storm" || sky.rain < 0.8 || hash01(this.tick, 5, this.seed + 35) > 1 / (9 * TICK_HZ)) return;
    const x = Math.floor(hash01(this.tick, 6, this.seed + 35) * W);
    // A building's roof (and the lightning rod on the shaft house) takes it.
    const roof = BUILDINGS.map((b) => this.buildings[b]).find((b) => x >= b.x0 && x <= b.x1);
    if (roof) return this.tell("strike", x, roof.floor - roof.height - 1);
    let y = 0;
    while (y < H - 1 && this.cell(x, y + 1) === AIR && !this.world.water[idx(x, y + 1)]) y++;
    this.tell("strike", x, y);
    if (isWood(this.cell(x, y + 1))) this.ignite(idx(x, y + 1));
    for (const m of [...this.miners])
      if (!m.inside && m.x === x && Math.abs(m.y - y) <= 2 && m.y <= this.strata.surface[x] + 1 && hash01(m.id, this.tick, this.seed + 37) < 0.5) this.kill(m, "struck");
  }

  /** Water drains away: into soil it lies on, slowly drying where it lies
   * on rock, quicker under the open sky once the rain stops. */
  private drain() {
    const water = this.world.water, cells = this.world.cells, dry = this.sky.rain < 0.05;
    for (let i = 0; i < CELLS - W; i++) {
      if (!water[i]) continue;
      const x = i % W, y = (i - x) / W, open = y <= this.strata.surface[x];
      const p = isSoil(cells[i + W]) ? 0.12 : open ? (dry ? 0.02 : 0.002) : 0.0015;
      if (hash01(i, this.tick, this.seed + 61) < p) this.world.setWater(x, y, false);
    }
  }

  // ── The tick ────────────────────────────────────────────────────────

  step() {
    this.tick++;
    if (this.mercy > 0) this.mercy--;
    if (!this.catchingUp) this.lostCatchingUp = 0;
    this.weather();
    const occ = this.occupied;
    for (const m of this.miners) {
      occ[idx(m.x, m.y)] = 1;
      if (m.y > 0) occ[idx(m.x, m.y - 1)] = 1;
    }
    this.world.step((x, y) => occ[idx(x, y)] === 1, (x, y, mat) => this.hits.push([x, y, mat]));
    for (const m of this.miners) {
      occ[idx(m.x, m.y)] = 0;
      if (m.y > 0) occ[idx(m.x, m.y - 1)] = 0;
    }
    for (const [x, y, mat] of this.hits) this.struckBy(x, y, mat);
    this.hits.length = 0;
    if (this.world.waterCount) this.seal();
    for (const m of [...this.miners]) this.stepMiner(m);
    this.stepIdleTrades();
    for (const c of this.carts) this.stepCart(c);
    this.stepBuckets();
    if (this.tick % 30 === 0) this.replan();
    if (this.tick % 6 === 0 && this.burning.length) this.stepFire(6);
    if (this.tick % 10 === 0 && this.world.waterCount) this.drain();
    if (this.tick % 300 === 0) this.survey();
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
      miners: this.miners.map((m) => ({ x: m.x, y: m.y, iron: m.iron, gold: m.gold, spoil: m.spoil, fed: m.fed, job: m.job, kit: m.kit })),
      carts: this.carts.map((c) => ({ level: c.level, side: c.side, x: c.x, iron: c.iron, gold: c.gold })),
      buckets: this.buckets.map((b) => ({ ...b })),
      shaftLevel: this.shaftLevel,
      hired: this.hired,
      ironOre: this.ironOre,
      mined: { ...this.mined },
      savedAt: now,
      water: encodeGrid(this.world.water),
      burning: this.burning.filter((c) => this.burn[c]).map((c) => [c, this.burn[c]]),
      lost: { ...this.lost },
      mercy: this.mercy,
      jobs: { ...this.jobs },
      ore: { ...this.ore },
      bars: { ...this.bars },
      steelWork: this.steelWork,
    };
  }

  /** The next miner's price: a smaller crew hires cheaper. */
  get price() {
    return hirePrice(this.miners.length);
  }
}

const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** A stored mine kept only if it is whole and well formed; else null (the
 * page starts a fresh one). */
export function decodeMineSave(s: any): MineSave | null {
  if (!s || typeof s !== "object") return null;
  if (!int(s.seed, 0, 0xffffffff) || !int(s.tick, 0, 1e12) || !int(s.shaftLevel, 0, 100) || !int(s.hired, 0, 1e6)) return null;
  if (!int(s.ironOre, 0, 1e9) || !Number.isFinite(s.savedAt) || !s.mined || !int(s.mined.iron, 0, 1e9) || !int(s.mined.gold, 0, 1e9)) return null;
  if (!decodeGrid(s.cells, CELLS, MATERIAL_COUNT) || !decodeGrid(s.plan, CELLS, 6)) return null;
  const pack = (m: any) =>
    int(m?.iron, 0, 1000) && int(m?.gold, 0, 1000) && int(m?.spoil, 0, 1000) && (m.fed === undefined || int(m.fed, 0, 1e9)) &&
    (m.job === undefined || JOBS.includes(m.job)) && (m.kit === undefined || int(m.kit, 0, KIT));
  if (!Array.isArray(s.miners) || s.miners.length > MAX_MINERS || !s.miners.every((m: any) => int(m?.x, 0, W - 1) && int(m?.y, 1, H - 1) && pack(m))) return null;
  if (!Array.isArray(s.carts) || !s.carts.every((c: any) => int(c?.level, 0, 100) && (c.side === 1 || c.side === -1) && int(c.x, 0, W - 1) && int(c.iron, 0, 1e4) && int(c.gold, 0, 1e4))) return null;
  if (!Array.isArray(s.buckets) || !s.buckets.every((b: any) => int(b?.y, 0, H) && int(b.iron, 0, 1e4) && int(b.gold, 0, 1e4))) return null;
  // The weather's additions may be missing (an older save), never malformed.
  if (s.water !== undefined && !decodeGrid(s.water, CELLS, 2)) return null;
  if (s.burning !== undefined && !(Array.isArray(s.burning) && s.burning.every((b: any) => Array.isArray(b) && b.length === 2 && int(b[0], 0, CELLS - 1) && int(b[1], 1, 1e5)))) return null;
  if (s.lost !== undefined && !(s.lost && typeof s.lost === "object" && CAUSES.every((c) => s.lost[c] === undefined || int(s.lost[c], 0, 1e6)))) return null;
  if (s.mercy !== undefined && !int(s.mercy, 0, 1e9)) return null;
  // So may the buildings'.
  const pair = (v: any, a: string, b: string, max: number) => v && typeof v === "object" && int(v[a], 0, max) && int(v[b], 0, max);
  if (s.jobs !== undefined && !pair(s.jobs, "forge", "smith", MAX_MINERS)) return null;
  if (s.ore !== undefined && !pair(s.ore, "iron", "gold", 1e9)) return null;
  if (s.bars !== undefined && !pair(s.bars, "iron", "gold", 1e9)) return null;
  if (s.steelWork !== undefined && !int(s.steelWork, 0, BARS_PER_STEEL)) return null;
  return {
    ...(s.jobs !== undefined ? { jobs: { forge: s.jobs.forge, smith: s.jobs.smith } } : {}),
    ...(s.ore !== undefined ? { ore: { iron: s.ore.iron, gold: s.ore.gold } } : {}),
    ...(s.bars !== undefined ? { bars: { iron: s.bars.iron, gold: s.bars.gold } } : {}),
    ...(s.steelWork !== undefined ? { steelWork: s.steelWork } : {}),
    ...(s.water !== undefined ? { water: s.water } : {}),
    ...(s.burning !== undefined ? { burning: s.burning.map((b: number[]) => [b[0], b[1]] as [number, number]) } : {}),
    ...(s.lost !== undefined ? { lost: Object.fromEntries(CAUSES.filter((c) => s.lost[c] !== undefined).map((c) => [c, s.lost[c]])) } : {}),
    ...(s.mercy !== undefined ? { mercy: s.mercy } : {}),
    seed: s.seed, tick: s.tick, cells: s.cells, plan: s.plan, shaftLevel: s.shaftLevel, hired: s.hired, ironOre: s.ironOre, savedAt: s.savedAt,
    mined: { iron: s.mined.iron, gold: s.mined.gold },
    miners: s.miners.map((m: any) => ({
      x: m.x, y: m.y, iron: m.iron, gold: m.gold, spoil: m.spoil,
      ...(m.fed !== undefined ? { fed: m.fed } : {}), ...(m.job !== undefined ? { job: m.job } : {}), ...(m.kit !== undefined ? { kit: m.kit } : {}),
    })),
    carts: s.carts.map((c: any) => ({ level: c.level, side: c.side, x: c.x, iron: c.iron, gold: c.gold })),
    buckets: s.buckets.map((b: any) => ({ y: b.y, iron: b.iron, gold: b.gold })),
  };
}
