/** The Mine: an idle mining operation in a falling-sand world. Miners sink a
 * laddered shaft through the dirt (shoring its walls with timber so it holds)
 * into the stone, drive a tunnel out either side at every level, lay track
 * and torches along each, hang lamps in the shaft, chase any copper, silver
 * or gold
 * they glimpse, and build a mine cart for each tunnel. Ore goes up in a
 * miner's pack to the yard by the shaft house, or rides a cart back to the
 * shaft where the hoist's bucket is let down for it and wound up again; the
 * forge's hands carry it from the yard to the forge's piles.
 *
 * The crew live and work in the buildings on the surface (`buildings.ts`):
 * the player puts each miner to a trade, the face, the forge or the smithy.
 * Forge hands smelt the ore into copper, silver and gold bars; smiths work
 * the bars, and every hundred of a metal make a Smithy point of it for the
 * player. Miners fetch supplies from the warehouse
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
 * after time away loses at most one.
 *
 * Each building has five levels, bought with Gold: the barracks bunks five
 * more of the crew a level, the forge makes room for two more hands, the
 * smithy for another smith, the shaft house keeps out more rain, and the
 * warehouse holds and brings in more supplies (`stock`) and lets the others
 * rise a level past it. Fittings and rebuilding use supplies, so a short
 * warehouse holds the workings back. An upgraded building is rebuilt
 * (`rebuilds`), and so is any it pushes along: taken down where it stood and
 * raised in its new place, shut while the work goes on.
 *
 * A prospect's ore runs out: once the shaft is at the bottom and the work
 * planned is done (`workedOut`), the player takes the crew, the buildings
 * and the stock to a new prospect (`prospectNext`), a fresh world. */
import {
  AIR, BEDROCK, CELLS, COPPER, DIG_TICKS, DIRT, GOLD, GRAVEL, H, LADDER, LAMP, LAVA, LOOSE, MATERIAL_COUNT, RAIL, ROCK, RUBBLE, SILVER, STONE, TIMBER, TORCH, W, World,
  decodeGrid, encodeGrid, generate, hash01, idx, inBounds, isLoose, isOre, isPassable, isSoil, isSolid, isWood, strata, type Material, type Strata,
} from "./world.ts";
import { BUILDINGS, FIRST_LEVELS, MAX_LEVEL, layout, pathTicks, type BuildingId, type Layout, type Levels, type Purpose, type Spot } from "./buildings.ts";
import { minerName } from "./names.ts";

export const TICK_HZ = 30;
/** Plan marks: dig out, or dig out and fit; a beam is timber laid into
 * open air under a track crossing a cave, a trestle to carry it. */
export const P_NONE = 0, P_DIG = 1, P_LADDER = 2, P_RAIL = 3, P_TORCH = 4, P_LAMP = 5, P_BEAM = 6;
/** Plan marks there are (for decoding saves). */
const PLAN_MARKS = 7;
const FIXTURE: Record<number, Material> = { [P_LADDER]: LADDER, [P_RAIL]: RAIL, [P_TORCH]: TORCH, [P_LAMP]: LAMP, [P_BEAM]: TIMBER };
const BUILD_TICKS: Record<number, number> = { [LADDER]: 24, [RAIL]: 30, [TORCH]: 45, [LAMP]: 75, [TIMBER]: 40 };

/** Ore a miner carries before heading out with it; spoil likewise. */
export const PACK_ORE = 6;
const PACK_SPOIL = 10;
export const CART_LOAD = 18;
/** The three metals: their ore in the ground, their bars, and the Smithy
 * points they make. */
export type Metal = "copper" | "silver" | "gold";
export const METALS: readonly Metal[] = ["copper", "silver", "gold"];
export type Metals = Record<Metal, number>;
export const noMetals = (): Metals => ({ copper: 0, silver: 0, gold: 0 });
export const metalSum = (m: Metals) => m.copper + m.silver + m.gold;
/** The metal of an ore cell. */
export const oreMetal = (m: Material): Metal | null => (m === COPPER ? "copper" : m === SILVER ? "silver" : m === GOLD ? "gold" : null);
/** Ore smelted into one bar, and bars worked into one Smithy point. */
export const ORE_PER_BAR: Metals = { copper: 4, silver: 2, gold: 1 };
export const BARS_PER_POINT = 10;
/** What a point took before saves version 2, which a saved mine's bars
 * toward the next point may still be counted in. */
const OLD_BARS_PER_POINT = 100;
/** Minutes the smithy's `pace` takes to follow its work. */
export const PACE_MINUTES = 30;
const MINUTE_TICKS = 60 * TICK_HZ;
/** Each level of the barracks bunks this many more of the crew; of the
 * forge, makes room for this many more hands; of the smithy, more smiths. */
export const CREW_PER_LEVEL = 5, FORGE_PER_LEVEL = 2, SMITHS_PER_LEVEL = 1;
export const MAX_MINERS = CREW_PER_LEVEL * MAX_LEVEL;
/** Supplies the warehouse holds a level, and brings in a minute a level. */
export const STOCK_PER_LEVEL = 120, STOCK_RATE = 30;
/** Rebuilding: ticks a level of the building upgraded, ticks to move one
 * pushed along, and the supplies each uses (a level, or to move). */
export const REBUILD_TICKS = 40 * TICK_HZ, MOVE_TICKS = 25 * TICK_HZ, REBUILD_SUPPLIES = 15, MOVE_SUPPLIES = 5;
/** Each level of the shaft house keeps out this much more of the rain. */
export const SEAL_LEVEL = 0.1;
const UPGRADE_BASE: Record<BuildingId, number> = { shaft: 250, barracks: 300, warehouse: 400, forge: 350, smithy: 350 };
/** Price in Gold of raising building `id` from `level` to the next. */
export const upgradePrice = (id: BuildingId, level: number) => Math.round(UPGRADE_BASE[id] * Math.pow(2.5, level - 1));
/** Supplies a miner fetches from the warehouse: each fitting and each
 * timber shoring uses one. */
export const KIT = 12;
/** Ticks a forge worker takes to smelt one ore, and a smith to work a bar;
 * a stage nobody is put to works at a quarter of one worker. */
export const SMELT_TICKS = 6 * TICK_HZ, SMITH_TICKS = 3 * TICK_HZ;
const IDLE_PACE = 4, STOCK_TICKS = 2 * TICK_HZ;
/** Ore a forge hand carries in from the yard at a time, and the most the
 * forge's piles and shelves hold at its first level (each more holds half
 * as much again). */
export const CARRY = 8, FORGE_CAP = 160;
/** Share of the crew that works through the night (the rest sleep), and
 * what each rank of Coffee adds, up to the most. */
export const NIGHT_SHIFT = 0.2, COFFEE_STEP = 0.05, NIGHT_SHIFT_MAX = 0.8;
/** Of the water running into the shaft's mouth, the share the shaft house
 * keeps out, and what each rank of Waterproofing adds. */
export const SEAL_BASE = 0.2, SEAL_STEP = 0.15;
export type Job = "mine" | "forge" | "smith";
export const JOBS: readonly Job[] = ["mine", "forge", "smith"];
/** The world's width before it was widened (older saves). */
const NARROW_W = 128;

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

export type Miner = Metals & {
  id: number;
  /** Its name, for life. */
  name: string;
  x: number;
  y: number;
  /** Ore in its pack (by metal), and spoil. */
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
  | { kind: "fetch" }
  | { kind: "dump" }
  | { kind: "cart"; level: number; side: number }
  | { kind: "enter"; b: BuildingId; why: Purpose }
  | { kind: "rest" };
export type Cart = Metals & { level: number; side: number; x: number; y: number; state: "out" | "parked" | "back"; timer: number };
/** A load waiting at a level's foot of the shaft for the hoist. */
export type Bucket = Metals & { y: number };
/** The hoist's bucket: waiting at the top, let down to a load, or wound up
 * with it. */
export type Hoist = Metals & { y: number; state: "idle" | "down" | "up" };
/** Where a building stood before it was moved. */
export type Footprint = { x0: number; x1: number; floor: number; height: number };
/** A building being rebuilt: ticks done of `total`, supplies used of those
 * it needs, and where it stood if it is moving (taken down there in the
 * first half, raised in its new place in the second). */
export type Rebuild = { b: BuildingId; t: number; total: number; used: number; supplies: number; from: Footprint | null };

export type MineSave = {
  seed: number;
  tick: number;
  /** The grid and its plan; absent for a prospect not yet broken (a fresh
   * world from the seed, the crew at the barracks). */
  cells?: string;
  plan?: string;
  miners: (Metals & { x: number; y: number; spoil: number; fed?: number; job?: Job; kit?: number; name?: string })[];
  carts: (Metals & { level: number; side: number; x: number })[];
  buckets: Bucket[];
  shaftLevel: number;
  hired: number;
  /** Ore smelted toward the next bar of each metal, and ore dug. */
  smelted: Metals;
  mined: Metals;
  savedAt: number;
  /** Unused simulation time; awarded only when stepped after loading. */
  idleMs?: number;
  /** Added with the weather (absent from older saves): the water layer,
   * burning cells as [cell, ticks left], miners lost by cause, and the
   * ticks left before another can die. */
  water?: string;
  burning?: [number, number][];
  lost?: Partial<Record<Cause, number>>;
  mercy?: number;
  /** Added with the buildings: the crew's allocation, the forge's ore
   * piles, the bars waiting at the smithy, and the bars worked toward the
   * next Smithy point of each metal. */
  jobs?: { forge: number; smith: number };
  ore?: Metals;
  bars?: Metals;
  worked?: Metals;
  /** Ore tipped in the yard, waiting for the forge's hands. */
  yard?: Metals;
  /** Added with prospects: which prospect this is (the first is 1), and
   * the miners lost whom the crew's list still remembers. */
  prospect?: number;
  fallen?: Fallen[];
  workedOut?: boolean;
  /** Added with building levels: each building's level, the warehouse's
   * supplies, and the buildings being rebuilt. */
  buildingLevels?: Levels;
  stock?: number;
  rebuilds?: Rebuild[];
  /** Added with the welcome-back screen: the Smithy points an hour the
   * smithy has lately made (`pace`). */
  pace?: Metals;
};

/** A miner lost, remembered in the crew's list until the player lets it go
 * (or hires another). */
export type Fallen = { name: string; job: Job; cause: Cause };

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
  readonly heapX = W / 2 + 50;
  /** The buildings, laid out at their levels. */
  buildings!: Layout;
  /** Each building's level, the warehouse's supplies, and the buildings
   * being rebuilt. */
  buildingLevels: Levels = { ...FIRST_LEVELS };
  stock = STOCK_PER_LEVEL;
  rebuilds: Rebuild[] = [];
  /** Which prospect this is, the ore its world held when it was found, the
   * ore still in the ground (as of the last survey), and whether the work
   * here is done. */
  prospect = 1;
  readonly oreFound: number;
  oreLeft: number;
  workedOut = false;
  /** Surveys since the work planned last shrank, with the shaft at the
   * bottom (a few cells out of reach don't keep a prospect open). */
  private stalled = 0;
  private workLeft = Infinity;
  /** Miners lost, oldest first, until the player lets them go. */
  fallen: Fallen[] = [];
  /** Ore waiting at the forge, bars waiting at the smithy, and bars worked
   * toward the next Smithy point of each metal. */
  ore = noMetals();
  bars = noMetals();
  worked = noMetals();
  /** Smithy points an hour the smithy has lately made, fractions and all:
   * each minute's work eased in over `PACE_MINUTES`. Retained as a
   * historical output measurement; catch-up pays actual simulated work. */
  pace = noMetals();
  private paceBars = noMetals();
  /** Ranks of the Mine skills: Coffee (more of the crew on the night
   * shift) and Waterproofing (the shaft house keeps more rain out). */
  coffee = 0;
  waterproof = 0;
  /** Room for more smiths than the smithy's level gives (Master smith). */
  extraSmiths = 0;
  private idleWork = { forge: 0, smith: 0 };
  /** Fittings planned on open air (as of the last survey), waiting on
   * supplies from the warehouse. */
  private fittings = 0;
  private turn = 0;
  /** Each tunnel level's floor row (the row its rails run along). */
  readonly levels: number[] = [];
  miners: Miner[] = [];
  carts: Cart[] = [];
  buckets: Bucket[] = [];
  hoist!: Hoist;
  /** Ore brought up, tipped in the yard by the shaft house until the forge's
   * hands carry it in; and the yard's column. */
  yard = noMetals();
  readonly yardX = W / 2 - 5;
  tick = 0;
  /** Deepest level the shaft has been planned down to. */
  shaftLevel = 0;
  hired = 0;
  smelted = noMetals();
  mined = noMetals();
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
  private owed = noMetals();
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
    const cells = saved?.cells !== undefined ? decodeGrid(saved.cells, CELLS, MATERIAL_COUNT) : null;
    const plan = cells && saved?.plan !== undefined ? decodeGrid(saved.plan, CELLS, PLAN_MARKS) : null;
    const water = saved?.water !== undefined && cells ? decodeGrid(saved.water, CELLS, 2) : null;
    const found = generate(this.seed);
    this.oreFound = countOre(found);
    this.world = new World(cells && plan ? cells : found, (cells && plan && water) || undefined);
    this.oreLeft = countOre(this.world.cells);
    this.plan = (cells && plan) || new Uint8Array(CELLS);
    if (saved) {
      // What goes with the crew from prospect to prospect.
      this.tick = saved.tick;
      this.hired = saved.hired;
      this.smelted = { ...saved.smelted };
      this.mined = { ...saved.mined };
      for (const c of CAUSES) this.lost[c] = saved.lost?.[c] ?? 0;
      this.ore = { ...(saved.ore ?? noMetals()) };
      this.bars = { ...(saved.bars ?? noMetals()) };
      this.pace = { ...(saved.pace ?? noMetals()) };
      this.worked = { ...(saved.worked ?? noMetals()) };
      this.yard = { ...(saved.yard ?? noMetals()) };
      this.prospect = saved.prospect ?? 1;
      if (cells && plan) this.workedOut = saved.workedOut ?? false;
      this.fallen = (saved.fallen ?? []).map((f) => ({ ...f }));
      this.buildingLevels = saved.buildingLevels ? { ...saved.buildingLevels } : migrateLevels(saved);
      this.stock = Math.min(saved.stock ?? Infinity, this.stockCap);
    }
    if (saved && cells && plan) {
      this.shaftLevel = saved.shaftLevel;
      this.mercy = saved.mercy ?? 0;
      for (const [c, t] of saved.burning ?? []) this.ignite(c, t);
      for (const m of saved.miners) this.addMiner(m.x, m.y, m);
      for (const c of saved.carts) {
        const y = this.levels[c.level];
        if (y !== undefined) this.carts.push({ level: c.level, side: c.side, x: c.x, y, copper: c.copper, silver: c.silver, gold: c.gold, state: "back", timer: 0 });
      }
      this.buckets = saved.buckets.map((b) => ({ ...b }));
      this.rebuilds = (saved.rebuilds ?? []).map((r) => ({ ...r, from: r.from && { ...r.from } }));
      this.relayout();
    } else {
      // A fresh prospect: the crew (or the first miner) at the barracks.
      this.planShaft(0);
      this.relayout();
      const door = this.buildings.barracks.door, crew = saved?.miners.length ? saved.miners : [null];
      for (const m of crew) this.addMiner(door, this.standY(door), m ? { ...m, ...noMetals(), spoil: 0, fed: 0 } : undefined);
      this.relayout();
      // A new mine's first crew learns the ropes before anyone can die.
      this.mercy = DEATH_GAP;
    }
    this.hoist = { y: this.strata.surface[this.shaftX] - 1, state: "idle", ...noMetals() };
    // Saves from before each miner kept its trade held only the counts.
    if (saved?.jobs && saved.miners.every((m) => m.job === undefined)) this.setJobs(saved.jobs.forge, saved.jobs.smith);
    // No trade holds more than its building has room for.
    const { forge, smith } = this.jobs;
    if (forge > this.jobCap("forge") || smith > this.jobCap("smith")) this.setJobs(forge, smith);
  }

  /** The crew, the buildings and the stock moved to a new prospect: a fresh
   * world from `seed`. Ore in packs, carts and the hoist goes along to the
   * forge's piles. */
  prospectNext(seed: number, now: number) {
    const carried = this.save(now);
    const ore = { ...this.ore };
    for (const c of [...this.miners, ...this.carts, ...this.buckets, this.hoist, this.yard]) for (const k of METALS) ore[k] += c[k];
    const { cells, plan, water, burning, ...rest } = carried;
    // The buildings go up whole on the new ground.
    const next = new MineSim(seed, { ...rest, carts: [], buckets: [], yard: noMetals(), shaftLevel: 0, mercy: 0, ore, prospect: this.prospect + 1, rebuilds: [] });
    next.coffee = this.coffee;
    next.waterproof = this.waterproof;
    next.extraSmiths = this.extraSmiths;
    next.weatherOverride = this.weatherOverride;
    const owed = this.collect();
    next.owed = owed;
    return next;
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
    if (p === P_BEAM) return m === AIR ? 2 : 0;
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
        // Across a cave the track runs on a trestle of beams.
        if (this.passable(x, to) && this.passable(x, to + 1)) this.mark(x, to + 1, P_BEAM);
      }
    // Off the tunnels, now and then, a drift slanting up or down after
    // whatever lies there, reached by a few rungs of ladder through the
    // tunnel's roof or floor; and from the second level down, a winze
    // laddered down from the level above.
    for (const side of [-1, 1]) {
      let x = x0 + side * (10 + Math.floor(hash01(k, side, this.seed + 21) * 14));
      for (let n = 0; Math.abs(x - x0) < W / 2 - 12; n++) {
        const r = hash01(k * 7 + n, side, this.seed + 23), down = r < 0.5, len = 6 + Math.floor(hash01(n, k, this.seed + 25) * 8);
        if ((x - x0) % 8 !== 4 * side) {
          const rungs: number[] = down ? [to + 1, to + 2, to + 3, to + 4] : [to - 1, to - 2, to - 3, to - 4];
          if (rungs.every((y) => (!this.plan[idx(x, y)] || this.plan[idx(x, y)] === P_DIG) && !this.unsound(idx(x, y))) && this.planDrift(x, down ? to + 4 : to - 4, side, down ? "down" : "up", len))
            for (const y of rungs) this.mark(x, y, P_LADDER);
        }
        x += side * (26 + Math.floor(hash01(n, k * 3 + side, this.seed + 27) * 30));
      }
      if (k > 0) {
        let wx = x0 + side * (24 + Math.floor(hash01(k, side, this.seed + 29) * 80));
        if ((wx - x0) % 8 === 4 * side) wx += side;
        const above = this.levels[k - 1];
        if (wx >= 4 && wx <= W - 5) for (let y = above + 1; y <= to - 3; y++) if (!this.plan[idx(wx, y)] || this.plan[idx(wx, y)] === P_DIG) this.mark(wx, y, P_LADDER);
      }
    }
    this.shaftLevel = k;
  }

  /** Cell c is ground a drift shouldn't open: soil, a boulder or loose
   * ground, which would slide or drop into it. */
  private unsound(c: number) {
    const m = this.world.cells[c];
    return isSoil(m) || isLoose(m) || m === ROCK;
  }

  /** Plans a drift with its feet starting at (x, y), heading `dir`: level
   * ("flat", two tall), or slanting a row every two cells ("down" or "up",
   * three tall so a miner keeps its head), lit as it goes and at its end,
   * which opens into a small chamber. It stops short of the dirt, the
   * bedrock, lava, the shaft and other work; returns whether it was
   * planned (too short a drift isn't). */
  private planDrift(x: number, y: number, dir: number, kind: "flat" | "down" | "up", len: number) {
    const marks: [number, number, number][] = [];
    let fx = x, fy = y;
    for (let i = 1; i <= len; i++) {
      fx += dir;
      if (kind !== "flat" && i % 2 === 0) fy += kind === "down" ? 1 : -1;
      if (fx < 3 || fx > W - 4 || Math.abs(fx - this.shaftX) <= 2 || fy >= H - 14 || fy - 3 < this.strata.stoneTop[fx] + 2) break;
      const rows = kind === "flat" ? 2 : 3;
      let stop = false;
      for (let r = 0; r <= rows; r++) {
        const c = idx(fx, fy - r);
        if (this.unsound(c)) stop = true;
        if (r === rows) continue;
        if (this.nearLava(c)) stop = true;
        if (this.plan[c] && isSolid(this.world.cells[c])) stop = true;
      }
      if (stop) break;
      for (let r = 0; r < rows; r++) marks.push([fx, fy - r, r === 1 && i % 8 === 0 ? P_TORCH : P_DIG]);
    }
    if (marks.length < 6) return false;
    // The end: a chamber a little wider and taller, with a torch.
    for (let r = 0; r < 3; r++) marks.push([fx + dir, fy - r, r === 1 ? P_TORCH : P_DIG]);
    marks.push([fx, fy - (kind === "flat" ? 2 : 3), P_DIG]);
    for (const [mx, my, p] of marks) if (inBounds(mx, my) && (!this.plan[idx(mx, my)] || this.plan[idx(mx, my)] === P_DIG) && this.cell(mx, my) !== BEDROCK) this.plan[idx(mx, my)] = p;
    return true;
  }

  /** After a dig opens (x, y): if it broke into open ground nobody has
   * worked (a natural cave), the crew learn its extent and plan its work:
   * torches along its floors, the ore showing on its walls, and drifts
   * driven on from its far ends and its lowest point. */
  private discover(x: number, y: number) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny) || ny <= this.strata.surface[nx] + 2 || !this.passable(nx, ny) || this.plan[idx(nx, ny)]) continue;
      const region: number[] = [idx(nx, ny)];
      this.plan[region[0]] = P_DIG;
      for (let h = 0; h < region.length && region.length < 6000; h++) {
        const c = region[h], cx = c % W, cy = (c - cx) / W;
        for (const [ex, ey] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const qx = cx + ex, qy = cy + ey;
          if (!inBounds(qx, qy) || qy <= this.strata.surface[qx] + 2 || !this.passable(qx, qy)) continue;
          const q = idx(qx, qy);
          if (this.plan[q]) continue;
          this.plan[q] = P_DIG;
          region.push(q);
        }
      }
      if (region.length >= 16) this.planCave(region);
    }
  }

  private planCave(region: number[]) {
    const floors: [number, number][] = [];
    let sx = 0;
    for (const c of region) {
      const cx = c % W, cy = (c - cx) / W;
      sx += cx;
      if (this.passable(cx, cy - 1) && this.supports(cx, cy + 1)) floors.push([cx, cy]);
      // The ore showing on its walls, and the vein behind it.
      for (const [ex, ey] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (isOre(this.cell(cx + ex, cy + ey)) && !this.plan[idx(cx + ex, cy + ey)]) this.markVein(cx + ex, cy + ey);
    }
    if (!floors.length) return;
    // Torches along the floors, spaced out, at head height.
    const lit: [number, number][] = [];
    floors.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [fx, fy] of floors) {
      if (lit.some(([lx, ly]) => Math.abs(lx - fx) + Math.abs(ly - fy) < 7)) continue;
      if (this.cell(fx, fy - 1) !== AIR) continue;
      lit.push([fx, fy]);
      this.plan[idx(fx, fy - 1)] = P_TORCH;
    }
    // Drifts on from its far ends and its lowest floor.
    const mid = sx / region.length, ends = [floors[0], floors[floors.length - 1]];
    const lowest = floors.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (region.length > 60) ends.push(lowest);
    ends.forEach(([fx, fy], i) => {
      const dir = Math.sign(fx - mid) || (i % 2 ? 1 : -1), r = hash01(fx, fy, this.seed + 31);
      this.planDrift(fx, fy, dir, r < 0.35 ? "down" : r < 0.6 ? "up" : "flat", 7 + Math.floor(r * 12));
    });
  }

  /** Marks the ore vein at (x, y) to be dug, up to a dozen cells of it. */
  private markVein(x: number, y: number) {
    const todo = [idx(x, y)];
    this.plan[todo[0]] = P_DIG;
    for (let h = 0; h < todo.length && todo.length < 12; h++) {
      const c = todo[h], cx = c % W, cy = (c - cx) / W;
      for (const [ex, ey] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const q = idx(cx + ex, cy + ey);
        if (inBounds(cx + ex, cy + ey) && isOre(this.world.cells[q]) && !this.plan[q]) {
          this.plan[q] = P_DIG;
          todo.push(q);
        }
      }
    }
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

  addMiner(x: number, y: number, from?: Metals & { spoil: number; fed?: number; job?: Job; kit?: number; name?: string }) {
    const name = from?.name ?? minerName(this.hired, this.seed, [...this.miners.map((m) => m.name), ...this.fallen.map((f) => f.name)]);
    this.miners.push({
      id: this.nextId++, name, x, y, copper: from?.copper ?? 0, silver: from?.silver ?? 0, gold: from?.gold ?? 0, spoil: from?.spoil ?? 0,
      job: from?.job ?? "mine", kit: from ? from.kit ?? KIT : 0, action: "idle", facing: 1, work: -1, task: null, path: [], timer: 0, working: false, fall: 0, fed: from?.fed ?? 0, breath: BREATH_TICKS, scorch: 0, inside: null,
    });
  }
  /** Hires a miner at the barracks door (the page charges for it): the
   * replacement for the longest lost, if any are remembered. The second
   * hand goes to the forge, and the fifth to the smithy, while they have
   * nobody. */
  hire() {
    if (this.miners.length >= this.crewCap) return false;
    this.hired++;
    this.fallen.shift();
    const door = this.buildings.barracks.door, { forge, smith } = this.jobs;
    this.addMiner(door, this.standY(door));
    const m = this.miners[this.miners.length - 1];
    m.job = forge === 0 && this.jobCap("forge") > 0 ? "forge" : smith === 0 && this.jobCap("smith") > 0 && this.miners.length >= 5 ? "smith" : "mine";
    this.relayout();
    return true;
  }
  /** Lets a lost miner go from the crew's list. */
  dismiss(name: string) {
    this.fallen = this.fallen.filter((f) => f.name !== name);
  }

  // ── Buildings and trades ────────────────────────────────────────────

  /** Lays the buildings out at their levels. */
  private relayout() {
    const key = BUILDINGS.map((b) => this.buildingLevels[b]).join();
    if (this.buildings && this.laidOut === key) return;
    this.laidOut = key;
    this.buildings = layout(this.strata.surface, this.shaftX, this.buildingLevels);
  }
  private laidOut = "";

  /** The most of the crew the barracks bunks, and the most a trade's
   * building has room for (the face takes any number). */
  get crewCap() {
    return CREW_PER_LEVEL * this.buildingLevels.barracks;
  }
  jobCap(job: Job) {
    return job === "forge" ? FORGE_PER_LEVEL * this.buildingLevels.forge : job === "smith" ? SMITHS_PER_LEVEL * this.buildingLevels.smithy + this.extraSmiths : Infinity;
  }
  /** The highest level building `id` may rise to: the warehouse to the top,
   * the rest one past the warehouse. */
  maxLevel(id: BuildingId) {
    return id === "warehouse" ? MAX_LEVEL : Math.min(MAX_LEVEL, this.buildingLevels.warehouse + 1);
  }
  /** Why building `id` can't be upgraded now, or null if it can (the page
   * charges `upgradePrice`). */
  upgradeBlock(id: BuildingId): "top" | "warehouse" | "rebuilding" | null {
    const level = this.buildingLevels[id];
    if (level >= MAX_LEVEL) return "top";
    if (level >= this.maxLevel(id)) return "warehouse";
    return this.rebuilding(id) ? "rebuilding" : null;
  }
  /** The Gold the next level of building `id` costs. */
  upgradeCost(id: BuildingId) {
    return upgradePrice(id, this.buildingLevels[id]);
  }
  /** Raises building `id` a level: it is rebuilt where it now stands, and
   * every building it pushes along is taken down and raised again in its
   * new place. Returns false if it can't be. */
  upgrade(id: BuildingId) {
    if (this.upgradeBlock(id)) return false;
    const before = this.buildings;
    this.buildingLevels[id]++;
    this.relayout();
    for (const b of BUILDINGS) {
      const was = before[b], now = this.buildings[b], moved = was.x0 !== now.x0 || was.x1 !== now.x1 || was.floor !== now.floor;
      if (b !== id && !moved) continue;
      const level = this.buildingLevels[b], old = this.rebuilding(b);
      const total = b === id ? REBUILD_TICKS * level : MOVE_TICKS, supplies = b === id ? REBUILD_SUPPLIES * level : MOVE_SUPPLIES;
      const from = old ? old.from : moved ? { x0: was.x0, x1: was.x1, floor: was.floor, height: was.height } : null;
      if (old) Object.assign(old, { t: 0, used: 0, total: Math.max(old.total, total), supplies: Math.max(old.supplies, supplies), from });
      else this.rebuilds.push({ b, t: 0, total, used: 0, supplies, from });
      this.evict(b);
    }
    return true;
  }
  /** Sets building `id` to `level` at once, unbuilt work and all (tests and
   * the console helper). */
  setLevel(id: BuildingId, level: number) {
    this.buildingLevels[id] = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
    this.rebuilds = this.rebuilds.filter((r) => r.b !== id);
    this.relayout();
    this.evict(id);
    this.stock = Math.min(this.stock, this.stockCap);
  }
  /** The rebuild under way on building `id`, if any. */
  rebuilding(id: BuildingId) {
    return this.rebuilds.find((r) => r.b === id);
  }
  /** Sends everyone inside building `id` out of its door. */
  private evict(id: BuildingId) {
    const door = this.buildings[id].door;
    for (const m of this.miners) {
      if (m.inside?.b !== id) continue;
      m.inside = null;
      m.x = door;
      m.y = this.standY(door);
      this.release(m);
    }
  }
  /** The supplies the warehouse holds at most, and brings in a minute. */
  get stockCap() {
    return STOCK_PER_LEVEL * this.buildingLevels.warehouse;
  }
  get stockRate() {
    return STOCK_RATE * this.buildingLevels.warehouse;
  }
  /** The most ore the forge's piles and shelves hold. */
  get forgeCap() {
    return FORGE_CAP + (FORGE_CAP / 2) * (this.buildingLevels.forge - 1);
  }
  /** Supplies to fetch: the warehouse is standing and not empty. */
  private get stocked() {
    return this.stock >= 1 && !this.rebuilding("warehouse");
  }
  /** The warehouse brings in supplies; each rebuild goes on while there are
   * supplies for it (and waits while there are none). */
  private stepBuildings() {
    this.stock = Math.min(this.stockCap, this.stock + this.stockRate / (60 * TICK_HZ));
    for (const r of [...this.rebuilds]) {
      const due = Math.ceil((r.supplies * (r.t + 1)) / r.total);
      if (r.used < due) {
        if (this.stock < 1) continue;
        this.stock--;
        r.used++;
      }
      if (++r.t >= r.total) this.rebuilds.splice(this.rebuilds.indexOf(r), 1);
    }
  }

  /** How many of the crew are at the forge and the smithy (the rest mine). */
  get jobs() {
    let forge = 0, smith = 0;
    for (const m of this.miners) m.job === "forge" ? forge++ : m.job === "smith" ? smith++ : 0;
    return { forge, smith };
  }
  /** Puts one miner to a trade (the player's choice in the crew's list). */
  setJob(m: Miner, job: Job) {
    if (!this.miners.includes(m) || (m.job !== job && this.jobs[job as "forge" | "smith"] >= this.jobCap(job))) return false;
    this.changeJob(m, job);
    return true;
  }
  /** Puts `forge` and `smith` of the crew to those trades (the rest mine),
   * as far as the crew goes, changing as few as it can, and those nearest
   * the surface first. */
  setJobs(forge: number, smith: number) {
    const n = this.miners.length;
    forge = Math.max(0, Math.min(n, this.jobCap("forge"), Math.floor(forge)));
    smith = Math.max(0, Math.min(n - forge, this.jobCap("smith"), Math.floor(smith)));
    const want: Record<Job, number> = { forge, smith, mine: n - forge - smith };
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
    if (metalSum(m) > 0) b === "forge" ? this.toForge(m) : this.toYard(m);
    m.copper = m.silver = m.gold = m.spoil = 0;
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
        const take = Math.max(0, Math.min(KIT - m.kit, Math.floor(this.stock)));
        m.kit += take;
        this.stock -= take;
        this.goOut(m);
      }
    } else {
      m.fed++;
      const trade = s.b === "forge" ? "forge" : "smith";
      if (m.job !== trade || this.bedtime(m) || m.fed > MEAL_TICKS) return this.goOut(m);
      const pace = this.craftTicks(trade);
      // Ore piling up in the yard and room for it here (or nothing left to
      // smelt): out to fetch it.
      const yard = metalSum(this.yard), forge = metalSum(this.ore);
      if (trade === "forge" && yard > 0 && (yard >= CARRY || !pace) && forge <= this.forgeCap - CARRY) return this.goOut(m);
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
    if (trade === "forge") return metalSum(this.ore) > 0 ? SMELT_TICKS : 0;
    return metalSum(this.bars) > 0 ? SMITH_TICKS : 0;
  }
  /** One piece of work done: an ore smelted (`ORE_PER_BAR` of a metal make
   * its bar), the metals by turns while more than one waits; or a bar worked
   * (gold first, then silver, then copper), every `BARS_PER_POINT` of a
   * metal making a Smithy point of it for the player. */
  private craft(trade: "forge" | "smith") {
    if (trade === "forge") {
      for (let k = 0; k < METALS.length; k++) {
        this.turn = (this.turn + 1) % METALS.length;
        const metal = METALS[this.turn];
        if (this.ore[metal] <= 0) continue;
        this.ore[metal]--;
        if (++this.smelted[metal] >= ORE_PER_BAR[metal]) {
          this.smelted[metal] -= ORE_PER_BAR[metal];
          this.bars[metal]++;
        }
        return;
      }
      return;
    }
    const metal = [...METALS].reverse().find((k) => this.bars[k] > 0);
    if (!metal) return;
    this.bars[metal]--;
    this.paceBars[metal]++;
    // A save from when a point took more bars may hold several points' worth.
    for (this.worked[metal]++; this.worked[metal] >= BARS_PER_POINT; this.worked[metal] -= BARS_PER_POINT) this.owed[metal]++;
  }
  /** A stage nobody is put to still gets done, slowly. */
  private stepIdleTrades() {
    const jobs = this.jobs;
    // With nobody at the forge, its ore still finds its way in, slowly.
    if (jobs.forge === 0 && this.tick % SMELT_TICKS === 0 && metalSum(this.yard) > 0) {
      const metal = [...METALS].reverse().find((k) => this.yard[k] > 0)!;
      this.yard[metal]--;
      this.ore[metal]++;
    }
    for (const trade of ["forge", "smith"] as const) {
      if (jobs[trade] > 0 || this.rebuilding(trade === "forge" ? "forge" : "smithy")) continue;
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

  /** Fittings planned and waiting on supplies (as of the last survey). */
  get fittingsWaiting() {
    return this.fittings;
  }
  /** The share of the runoff the shaft house keeps out of the shaft. */
  get sealShare() {
    return Math.min(0.95, SEAL_BASE + SEAL_STEP * this.waterproof + SEAL_LEVEL * (this.buildingLevels.shaft - 1));
  }

  /** The shaft house keeps out a share of the water running into the
   * shaft's mouth (it lingers in the mouth about three ticks). */
  private seal() {
    const keep = this.sealShare, q = 1 - Math.pow(1 - keep, 1 / 3);
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
   * dipped into a flooded hole beside one's feet), and so is a beam laid
   * out ahead under the track. */
  private static readonly WET_REACH: readonly [number, number][] = [[-1, 1], [1, 1]];
  private reachable(x: number, y: number, c: number) {
    const cx = c % W, cy = (c - cx) / W, job = this.jobAt(c), near = job >= 3, beam = job === 2 && this.plan[c] === P_BEAM;
    return (
      MineSim.REACH.some(([dx, dy, dig]) => x + dx === cx && y + dy === cy && (dig || near || this.world.cells[c] === AIR)) ||
      ((near || beam) && MineSim.WET_REACH.some(([dx, dy]) => x + dx === cx && y + dy === cy))
    );
  }

  private chooseTask(m: Miner) {
    const start = idx(m.x, m.y), ore = metalSum(m);
    const shallow = m.y < this.strata.stoneTop[this.shaftX] + 6, up = m.y < this.strata.surface[m.x] + 4;
    // Night: off to bed, unless on the night shift (or there's no way up).
    if (this.bedtime(m) && this.goEnter(m, start, "barracks", "sleep")) return;
    // Hungry: to the lounge for a meal, unless there's no way there.
    let cutOff = false;
    if (m.fed > MEAL_TICKS) {
      if (this.goEnter(m, start, "barracks", "lounge")) return;
      cutOff = true;
    }
    // The forge's hands fetch the ore from the yard, while there's room for it.
    const shop = m.job === "forge" ? "forge" : "smithy", shut = m.job !== "mine" && !!this.rebuilding(shop);
    if (m.job === "forge" && !shut && ore === 0 && metalSum(this.yard) > 0 && metalSum(this.ore) < this.forgeCap && this.goFetch(m, start)) return;
    // The forge's and the smithy's hands go to their work; one cut off below
    // (or whose building is being rebuilt) digs on till it can get there.
    if (m.job !== "mine" && !shut && this.goEnter(m, start, shop, "work")) return;
    // Out of supplies at the surface: to the warehouse first, if it has any.
    if (m.kit === 0 && (up || this.fittings > 0) && this.stocked && this.goEnter(m, start, "warehouse", "stock")) return;
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
    if (kit < KIT / 2 && this.stocked && this.goEnter(m, start, "warehouse", "stock")) return;
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
      // Sinking the shaft wants supplies to ladder and shore it (one cut off
      // below digs out regardless).
      if (job === 1 && cx === this.shaftX && cy > this.strata.surface[cx] && kit <= 0 && !cutOff) continue;
      const score = cutOff && cx === this.shaftX && job <= 2 ? -60 : job === 4 ? -40 : job === 1 && isOre(this.world.cells[c]) ? -30 : job === 3 ? -1 : job === 2 ? -2 : 0;
      if (!best || score < best.score) best = { score, cell: c, cart: null };
    }
    for (const [dx, dy] of MineSim.WET_REACH) {
      if (!inBounds(x + dx, y + dy)) continue;
      const c = idx(x + dx, y + dy), job = this.jobAt(c);
      const beam = job === 2 && this.plan[c] === P_BEAM && kit > 0;
      if ((job < 3 && !beam) || this.reserved[c]) continue;
      const score = job === 4 ? -40 : beam ? -2 : -1;
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
    const top = (x: number) => this.strata.surface[x] + 4, forge = this.yardX;
    const path = this.search(start, (x, y, d) => {
      if (Math.abs(x - forge) <= 1 && y < top(x)) return d;
      if (m.spoil < PACK_SPOIL || metalSum(m) > 0)
        for (const c of this.carts) if (c.state === "parked" && c.y === y && Math.abs(c.x - x) <= 1 && metalSum(c) < CART_LOAD) return d;
      return null;
    });
    if (!path) return false;
    m.task = { kind: "deliver" };
    m.path = path;
    return true;
  }
  /** Off to the yard for a load of ore for the forge. */
  private goFetch(m: Miner, start: number) {
    const path = this.search(start, (x, y, d) => (Math.abs(x - this.yardX) <= 1 && y < this.strata.surface[x] + 4 ? d : null), 0, 8000);
    if (!path) return false;
    m.task = { kind: "fetch" };
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
      if (this.cell(m.x, m.y) === AIR && this.ladderOk(idx(m.x, m.y)) && !this.supports(m.x, m.y + 1)) {
        this.world.set(m.x, m.y, LADDER);
        m.kit = Math.max(0, m.kit - 1);
      }
      if (this.cell(m.x, ny) === AIR && this.ladderOk(next)) {
        this.world.set(m.x, ny, LADDER);
        m.kit = Math.max(0, m.kit - 1);
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
        for (const k of METALS) (cart[k] += m[k]), (m[k] = 0);
        m.spoil = 0;
        this.release(m);
        return;
      }
      if (Math.abs(m.x - this.yardX) <= 1 && m.y < this.strata.surface[m.x] + 4) {
        this.toYard(m);
        m.copper = m.silver = m.gold = 0;
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
    if (t.kind === "fetch") {
      // A load from the yard for the forge: gold first, then silver, then copper.
      let room = CARRY;
      for (const k of ["gold", "silver", "copper"] as const) {
        const n = Math.min(this.yard[k], room);
        this.yard[k] -= n;
        m[k] += n;
        room -= n;
      }
      m.action = "stock";
      m.timer = STOCK_TICKS / 2;
      m.task = null;
      return;
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
    if (t.kind === "enter") {
      if (!this.rebuilding(t.b)) return this.goIn(m, t.b, t.why);
      // Shut for rebuilding: a meal handed out at the barracks door, a rest
      // outside it, or a wait at another's.
      if (t.b === "barracks") m.fed = 0;
      m.action = "rest";
      m.timer = 120 + Math.floor(hash01(m.id, this.tick, this.seed + 5) * 120);
      m.task = null;
      return;
    }
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
        const metal = oreMetal(mat);
        if (metal) m[metal]++;
        else if (y < this.strata.stoneTop[x] + 6 && hash01(x, y, this.seed + 9) < (mat === STONE ? 0.3 : 0.5)) m.spoil = Math.min(PACK_SPOIL, m.spoil + 1);
        if (metal) this.mined[metal]++;
        // A hole dug under one's feet gets a ladder, so there's a way back.
        if (y === m.y + 1 && x === m.x && this.plan[c] === P_DIG) this.plan[c] = P_LADDER;
        this.afterDig(x, y, m);
        this.discover(x, y);
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
      this.carts.push({ level: t.level, side: t.side, x: this.shaftX + t.side * 2, y, ...noMetals(), state: "out", timer: 0 });
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
      const load = metalSum(c);
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
        if (metalSum(c) > 0) this.buckets.push({ y: c.y, copper: c.copper, silver: c.silver, gold: c.gold });
        c.copper = c.silver = c.gold = 0;
        c.state = "out";
      }
    }
  }

  /** The hoist works one load at a time: its bucket is let down the shaft
   * to the oldest load waiting, takes it on, and is wound up to tip it in
   * the yard. */
  private stepHoist() {
    if (this.tick % BUCKET_STEP) return;
    const h = this.hoist, top = this.strata.surface[this.shaftX] - 1;
    if (h.state === "idle") {
      if (this.buckets.length) h.state = "down";
    } else if (h.state === "down") {
      const load = this.buckets[0];
      if (!load) h.state = "up";
      else if (h.y < load.y) h.y++;
      else {
        this.buckets.shift();
        for (const k of METALS) h[k] += load[k];
        h.state = "up";
      }
    } else if (h.y > top) h.y--;
    else {
      this.toYard(h);
      h.copper = h.silver = h.gold = 0;
      h.state = "idle";
    }
  }

  /** Ore brought up is tipped in the yard; the forge's hands carry it in. */
  private toYard(load: Metals) {
    for (const k of METALS) this.yard[k] += load[k];
  }
  private toForge(load: Metals) {
    for (const k of METALS) this.ore[k] += load[k];
  }
  /** Takes the Smithy points the smithy has turned out since last asked. */
  collect() {
    const out = { ...this.owed };
    this.owed = noMetals();
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
      m.copper = m.silver = m.gold = m.spoil = 0;
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
    this.lost[cause]++;
    this.fallen.push({ name: m.name, job: m.job, cause });
    if (this.fallen.length > MAX_MINERS) this.fallen.shift();
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
    let fittings = 0, work = 0, ore = 0;
    for (let i = 0; i < CELLS; i++) {
      const m = cells[i];
      if (this.plan[i] >= P_LADDER && m === AIR) fittings++;
      if (isOre(m)) ore++;
      if (this.plan[i] && (isSolid(m) ? m !== BEDROCK && this.plan[i] !== P_BEAM : this.plan[i] >= P_LADDER && m === AIR)) work++;
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
    this.oreLeft = ore;
    this.checkWorkedOut(work);
    if (torches.length && hash01(this.tick, 3, this.seed + 23) < 0.003) {
      const t = torches[Math.floor(hash01(this.tick, 4, this.seed + 23) * torches.length)];
      this.ignite(t);
      this.tell("fire", t % W, Math.floor(t / W));
    }
  }

  /** The prospect is worked out once the shaft is at the bottom and the
   * work planned is done, or has stopped shrinking for five minutes (what's
   * left is out of reach). */
  private checkWorkedOut(work: number) {
    if (this.workedOut) return;
    const bottom = this.shaftLevel >= this.levels.length - 1;
    if (!bottom) return void (this.workLeft = Infinity);
    this.stalled = work < this.workLeft ? 0 : this.stalled + 1;
    this.workLeft = Math.min(this.workLeft, work);
    if (work === 0 || this.stalled >= 30) this.workedOut = true;
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
    this.stepBuildings();
    for (const c of this.carts) this.stepCart(c);
    this.stepHoist();
    if (this.tick % 30 === 0) this.replan();
    if (this.tick % 6 === 0 && this.burning.length) this.stepFire(6);
    if (this.tick % 10 === 0 && this.world.waterCount) this.drain();
    if (this.tick % 300 === 0) this.survey();
    if (this.tick % MINUTE_TICKS === 0) this.timePace();
  }

  /** A minute's work at the anvils eased into the smithy's `pace`. */
  private timePace() {
    for (const k of METALS) {
      const hourly = (this.paceBars[k] / BARS_PER_POINT) * 60;
      this.pace[k] += (hourly - this.pace[k]) / PACE_MINUTES;
    }
    this.paceBars = noMetals();
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
      miners: this.miners.map((m) => ({ x: m.x, y: m.y, copper: m.copper, silver: m.silver, gold: m.gold, spoil: m.spoil, fed: m.fed, job: m.job, kit: m.kit, name: m.name })),
      carts: this.carts.map((c) => ({ level: c.level, side: c.side, x: c.x, copper: c.copper, silver: c.silver, gold: c.gold })),
      buckets: [...(metalSum(this.hoist) > 0 ? [{ y: this.hoist.y, copper: this.hoist.copper, silver: this.hoist.silver, gold: this.hoist.gold }] : []), ...this.buckets.map((b) => ({ ...b }))],
      yard: { ...this.yard },
      shaftLevel: this.shaftLevel,
      hired: this.hired,
      smelted: { ...this.smelted },
      mined: { ...this.mined },
      savedAt: now,
      water: encodeGrid(this.world.water),
      burning: this.burning.filter((c) => this.burn[c]).map((c) => [c, this.burn[c]]),
      lost: { ...this.lost },
      mercy: this.mercy,
      jobs: { ...this.jobs },
      ore: { ...this.ore },
      bars: { ...this.bars },
      worked: { ...this.worked },
      prospect: this.prospect,
      fallen: this.fallen.map((f) => ({ ...f })),
      workedOut: this.workedOut,
      buildingLevels: { ...this.buildingLevels },
      stock: this.stock,
      rebuilds: this.rebuilds.map((r) => ({ ...r, from: r.from && { ...r.from } })),
      pace: { ...this.pace },
    };
  }

  /** The next miner's price: a smaller crew hires cheaper. */
  get price() {
    return hirePrice(this.miners.length);
  }
}

/** Levels for a mine saved before buildings had them: room for the crew
 * and its trades as they were, and a warehouse to match. */
function migrateLevels(saved: MineSave): Levels {
  const count = (j: Job) => saved.miners.filter((m) => m.job === j).length || (j !== "mine" ? saved.jobs?.[j] ?? 0 : 0);
  const clamp = (n: number) => Math.max(1, Math.min(MAX_LEVEL, Math.ceil(n)));
  const barracks = clamp(saved.miners.length / CREW_PER_LEVEL), forge = clamp(count("forge") / FORGE_PER_LEVEL), smithy = clamp(count("smith") / SMITHS_PER_LEVEL);
  return { shaft: 1, barracks, forge, smithy, warehouse: clamp(Math.max(barracks, forge, smithy) - 1) };
}

/** Ore cells in a grid. */
function countOre(cells: Uint8Array) {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (isOre(cells[i])) n++;
  return n;
}

const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** A stored mine kept only if it is whole and well formed; else null (the
 * page starts a fresh one). */
export function decodeMineSave(s: any): MineSave | null {
  if (!s || typeof s !== "object") return null;
  if (!int(s.seed, 0, 0xffffffff) || !int(s.tick, 0, 1e12) || !int(s.shaftLevel, 0, 100) || !int(s.hired, 0, 1e6) || !Number.isFinite(s.savedAt)) return null;
  // Metals: copper, silver and gold; a save from before silver held iron
  // (now copper) and gold. Null when malformed.
  const metals = (v: any, max: number): Metals | null => {
    if (!v || typeof v !== "object") return null;
    const m = { copper: v.copper ?? v.iron, silver: v.silver ?? 0, gold: v.gold };
    return METALS.every((k) => int(m[k], 0, max)) ? m : null;
  };
  const mined = metals(s.mined, 1e9);
  const smelted = s.smelted !== undefined ? metals(s.smelted, 1e3) : int(s.ironOre, 0, 1e9) ? { copper: Math.min(s.ironOre, ORE_PER_BAR.copper - 1), silver: 0, gold: 0 } : null;
  if (!mined || !smelted) return null;
  // A mine from before the world was widened moves its crew to a fresh
  // prospect from the same seed (its grid is dropped).
  const narrow = !decodeGrid(s.cells, CELLS, MATERIAL_COUNT) && decodeGrid(s.cells, NARROW_W * H, MATERIAL_COUNT) && decodeGrid(s.plan, NARROW_W * H, PLAN_MARKS);
  if (!narrow && (!decodeGrid(s.cells, CELLS, MATERIAL_COUNT) || !decodeGrid(s.plan, CELLS, PLAN_MARKS))) return null;
  const name = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 32;
  const pack = (m: any) =>
    metals(m, 1000) && int(m?.spoil, 0, 1000) && (m.fed === undefined || int(m.fed, 0, 1e9)) &&
    (m.job === undefined || JOBS.includes(m.job)) && (m.kit === undefined || int(m.kit, 0, KIT)) && (m.name === undefined || name(m.name));
  if (!Array.isArray(s.miners) || s.miners.length > MAX_MINERS || !s.miners.every((m: any) => int(m?.x, 0, W - 1) && int(m?.y, 1, H - 1) && pack(m))) return null;
  if (!Array.isArray(s.carts) || !s.carts.every((c: any) => int(c?.level, 0, 100) && (c.side === 1 || c.side === -1) && int(c.x, 0, W - 1) && metals(c, 1e4))) return null;
  if (!Array.isArray(s.buckets) || !s.buckets.every((b: any) => int(b?.y, 0, H) && metals(b, 1e4))) return null;
  // The weather's additions may be missing (an older save), never malformed.
  if (s.water !== undefined && !narrow && !decodeGrid(s.water, CELLS, 2)) return null;
  if (s.burning !== undefined && !(Array.isArray(s.burning) && s.burning.every((b: any) => Array.isArray(b) && b.length === 2 && int(b[0], 0, CELLS - 1) && int(b[1], 1, 1e5)))) return null;
  if (s.lost !== undefined && !(s.lost && typeof s.lost === "object" && CAUSES.every((c) => s.lost[c] === undefined || int(s.lost[c], 0, 1e6)))) return null;
  if (s.mercy !== undefined && !int(s.mercy, 0, 1e9)) return null;
  // So may the buildings'.
  const pair = (v: any, a: string, b: string, max: number) => v && typeof v === "object" && int(v[a], 0, max) && int(v[b], 0, max);
  if (s.jobs !== undefined && !pair(s.jobs, "forge", "smith", MAX_MINERS)) return null;
  for (const k of ["ore", "bars", "yard"]) if (s[k] !== undefined && !metals(s[k], 1e9)) return null;
  if (s.worked !== undefined && !metals(s.worked, OLD_BARS_PER_POINT)) return null;
  // And the prospects'.
  if (s.prospect !== undefined && !int(s.prospect, 1, 1e6)) return null;
  if (s.fallen !== undefined && !(Array.isArray(s.fallen) && s.fallen.length <= MAX_MINERS && s.fallen.every((f: any) => name(f?.name) && JOBS.includes(f.job) && CAUSES.includes(f.cause)))) return null;
  if (s.workedOut !== undefined && typeof s.workedOut !== "boolean") return null;
  // And the building levels'.
  if (s.buildingLevels !== undefined && !(s.buildingLevels && typeof s.buildingLevels === "object" && BUILDINGS.every((b) => int(s.buildingLevels[b], 1, MAX_LEVEL)))) return null;
  if (s.stock !== undefined && !(Number.isFinite(s.stock) && s.stock >= 0 && s.stock <= 1e6)) return null;
  const foot = (f: any) => f === null || (f && typeof f === "object" && int(f.x0, 0, W - 1) && int(f.x1, 0, W - 1) && int(f.floor, 0, H - 1) && int(f.height, 1, 64));
  const rebuild = (r: any) => r && BUILDINGS.includes(r.b) && int(r.total, 1, 1e7) && int(r.t, 0, r.total) && int(r.supplies, 0, 1e5) && int(r.used, 0, r.supplies) && foot(r.from);
  if (s.rebuilds !== undefined && !(Array.isArray(s.rebuilds) && s.rebuilds.length <= BUILDINGS.length && s.rebuilds.every(rebuild))) return null;
  const out: MineSave = {
    ...(s.jobs !== undefined ? { jobs: { forge: s.jobs.forge, smith: s.jobs.smith } } : {}),
    ...(s.ore !== undefined ? { ore: metals(s.ore, 1e9)! } : {}),
    ...(s.bars !== undefined ? { bars: metals(s.bars, 1e9)! } : {}),
    ...(s.worked !== undefined ? { worked: metals(s.worked, OLD_BARS_PER_POINT)! } : {}),
    ...(s.yard !== undefined ? { yard: metals(s.yard, 1e9)! } : {}),
    ...(s.water !== undefined ? { water: s.water } : {}),
    ...(s.burning !== undefined ? { burning: s.burning.map((b: number[]) => [b[0], b[1]] as [number, number]) } : {}),
    ...(s.lost !== undefined ? { lost: Object.fromEntries(CAUSES.filter((c) => s.lost[c] !== undefined).map((c) => [c, s.lost[c]])) } : {}),
    ...(s.mercy !== undefined ? { mercy: s.mercy } : {}),
    seed: s.seed, tick: s.tick, cells: s.cells, plan: s.plan, shaftLevel: s.shaftLevel, hired: s.hired, smelted, savedAt: s.savedAt, mined,
    ...(Number.isFinite(s.idleMs) && s.idleMs >= 0 && s.idleMs <= 86400000 ? { idleMs: s.idleMs } : {}),
    miners: s.miners.map((m: any) => ({
      x: m.x, y: m.y, ...metals(m, 1000)!, spoil: m.spoil, ...(m.name !== undefined ? { name: m.name } : {}),
      ...(m.fed !== undefined ? { fed: m.fed } : {}), ...(m.job !== undefined ? { job: m.job } : {}), ...(m.kit !== undefined ? { kit: m.kit } : {}),
    })),
    carts: s.carts.map((c: any) => ({ level: c.level, side: c.side, x: c.x, ...metals(c, 1e4)! })),
    buckets: s.buckets.map((b: any) => ({ y: b.y, ...metals(b, 1e4)! })),
    ...(s.prospect !== undefined ? { prospect: s.prospect } : {}),
    ...(s.fallen !== undefined ? { fallen: s.fallen.map((f: any) => ({ name: f.name, job: f.job, cause: f.cause })) } : {}),
    ...(s.workedOut !== undefined ? { workedOut: s.workedOut } : {}),
    ...(s.buildingLevels !== undefined ? { buildingLevels: Object.fromEntries(BUILDINGS.map((b) => [b, s.buildingLevels[b]])) as Levels } : {}),
    ...(s.stock !== undefined ? { stock: s.stock } : {}),
    // A pace out of reason is forgotten, not the mine.
    ...(s.pace && METALS.every((k) => Number.isFinite(s.pace[k]) && s.pace[k] >= 0 && s.pace[k] <= 1e6) ? { pace: { copper: s.pace.copper, silver: s.pace.silver, gold: s.pace.gold } } : {}),
    ...(s.rebuilds !== undefined
      ? { rebuilds: s.rebuilds.map((r: any) => ({ b: r.b, t: r.t, total: r.total, used: r.used, supplies: r.supplies, from: r.from && { x0: r.from.x0, x1: r.from.x1, floor: r.from.floor, height: r.from.height } })) }
      : {}),
  };
  if (narrow) {
    const { cells, plan, water, burning, ...rest } = out;
    return { ...rest, carts: [], buckets: [], shaftLevel: 0 };
  }
  return out;
}
