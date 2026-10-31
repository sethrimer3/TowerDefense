import { decodeRepairRanks, type RepairRanks } from "../repair-upgrades.ts";
import { decodeChronoRanks, type ChronoRanks } from "../chrono-upgrades.ts";
/** Persistent DEFEND state: the city layout the player designed, what they
 * own and have upgraded, and their best wave. A run itself is never saved —
 * it always starts fresh from the layout. */
import { decodeGateRanks, type GateRanks } from "../gate-upgrades.ts";
import { decodeBallistaRanks, type BallistaRanks } from "../ballista-upgrades.ts";
import { decodeRevolutionaryRanks, type RevolutionaryRanks } from "../revolutionary-upgrades.ts";
import { decodeShadowRanks, type ShadowRanks } from "../shadow-upgrades.ts";
import { decodeNanoRanks, type NanoRanks } from "../nanobot-upgrades.ts";
import { decodeKeepRanks, type KeepRanks } from "../keep-upgrades.ts";
import { decodeWallRanks, innerWalls, type WallRanks } from "../wall-upgrades.ts";
import {
  ENEMIES,
  type EnemyKind,
  BOMB_PRICE,
  STRUCTURES,
  SPEED3_PRICE,
  PALETTE_ITEMS,
  STARTING_OWNED,
  UPGRADES,
  purchasePrice,
  upgradePrice,
  type PaletteItem,
  type Price,
  type UpgradeId,
} from "./catalog.ts";
import { SPAWN_ROW, TILES_H, TILES_W, defendRandom, hash, parseTileKey, tileKey } from "./grid.ts";
import {
  QUARTER,
  QUARTERS_H,
  QUARTERS_W,
  settle,
  SIDES,
  cloneLayout,
  cornerOk,
  defaultLayout,
  fitLayout,
  gateOk,
  placedCount,
  sameCorner,
  sameGate,
  sameWall,
  wallSpotOk,
  type CornerSpot,
  type WallSpot,
  type GateSpot,
  type Layout,
  type PlacedKind,
  type PlacedStructure,
  type SpikeSpot,
} from "./layout.ts";
import type { PathId } from "../knowledge-paths.ts";
import { settleKept, wearFits } from "../specializations.ts";

/** A building on a path waiting in the palette: taken up from the city
 * after it was upgraded, it keeps its path and rank for when it is placed
 * again (`specializations.ts`). */
export type Kept = { kind: PlacedKind | "wallSpikes"; path: PathId; rank: number };

export type DefendSave = {
  /** The city as built, each placed building with its chosen path. */
  layout: Layout;
  owned: Record<PaletteItem, number>;
  /** Copies in the palette that keep the path and rank they were upgraded
   * to; never more of a kind than wait in the palette. */
  kept: Kept[];
  levels: Record<UpgradeId, number>;
  bombs: number;
  /** Highest wave cleared; used only for records and first-clear rewards. */
  bestWave: number;
  /** Highest wave actually entered, separate from clearing it. */
  furthestWave: number;
  /** The furthest wave the dev option has opened to start from, past the best (0 when never used). */
  unlockedWave: number;
  /** Next starting wave; new reached records select furthestWave - 1. */
  startWave: number;
  discovered: EnemyKind[];
  journalRead: EnemyKind[];
  paletteSide: "left" | "right";
  /** 3× battle speed has been bought in the Armory. */
  speed3: boolean;
  /** Preferred battle speed, restored for each run and after reopening. */
  battleSpeed: 1 | 2 | 3;
  /** Seed for the filler city, so the same layout always looks the same. */
  seed: number;
  /** The keep's own upgrades (`keep-upgrades.ts`); absent while it has none. */
  keepRanks?: KeepRanks;
  /** The placed walls' upgrades (`wall-upgrades.ts`); absent while they have none. */
  wallRanks?: WallRanks;
  /** The city gates' upgrades (`gate-upgrades.ts`); absent while they have none. */
  gateRanks?: GateRanks;
  /** The wall ballistas' upgrades (`ballista-upgrades.ts`); absent while they have none. */
  ballistaRanks?: BallistaRanks;
  /** The Revolutionaries' upgrades (`revolutionary-upgrades.ts`); absent while they have none. */
  revolutionaryRanks?: RevolutionaryRanks;
  /** The Shadows' upgrades (`shadow-upgrades.ts`); absent while they have none. */
  shadowRanks?: ShadowRanks;
  /** The C4 nanobots' upgrades (`nanobot-upgrades.ts`); absent while they have none. */
  nanoRanks?: NanoRanks;
  chronoRanks?: ChronoRanks;
  repairRanks?: RepairRanks;
  /** Every building upgrade (`k:<kind>`, `p:<path>:<rank>`) any building has
   * ever reached, shared by its whole line for the upgrade map
   * (`specializations.ts`'s `foundNodes`); absent while none. */
  upgradesFound?: string[];
};

export function defaultDefendSave(seed?: number): DefendSave {
  return {
    layout: defaultLayout(),
    owned: { ...STARTING_OWNED },
    kept: [],
    levels: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<UpgradeId, number>,
    bombs: 0,
    bestWave: 0,
    furthestWave: 0,
    unlockedWave: 0,
    startWave: 1,
    discovered: [],
    journalRead: [],
    paletteSide: "left",
    speed3: false,
    battleSpeed: 1,
    seed: seed ?? (1 + Math.floor(defendRandom("rolls")() * 1e9)),
  };
}

/** How many of a palette item are still in the palette (owned, not placed). */
export function available(save: DefendSave, item: PaletteItem): number {
  return Math.max(0, save.owned[item] - placedCount(save.layout, item));
}
/** How many of those are plain copies (not kept on a path). */
export function plainAvailable(save: DefendSave, item: PaletteItem): number {
  return Math.max(0, available(save, item) - save.kept.filter((k) => k.kind === item).length);
}
/** The kept copies of `item`, grouped by path and rank. */
export function keptGroups(save: DefendSave, item: PaletteItem): { path: PathId; rank: number; count: number }[] {
  const out: { path: PathId; rank: number; count: number }[] = [];
  for (const k of save.kept) {
    if (k.kind !== item) continue;
    const g = out.find((o) => o.path === k.path && o.rank === k.rank);
    if (g) g.count++;
    else out.push({ path: k.path, rank: k.rank, count: 1 });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || b.rank - a.rank);
}

/** Changes the city to `next`, keeping the palette's kept copies in step:
 * a building on a path taken up waits there with it, one placed from them
 * no longer waits. */
export function setLayout(save: DefendSave, next: Layout) {
  if (next === save.layout) return;
  settleKept(save, save.layout, next);
  save.layout = next;
  trimKept(save);
}

/** Never more kept copies of a kind than wait in the palette (the newest kept go first). */
export function trimKept(save: DefendSave) {
  for (const item of new Set(save.kept.map((k) => k.kind))) {
    let over = save.kept.filter((k) => k.kind === item).length - available(save, item);
    for (let i = save.kept.length - 1; i >= 0 && over > 0; i--) if (save.kept[i].kind === item) { save.kept.splice(i, 1); over--; }
  }
}

/** Dev (All towers unlocked): at least one of every structure owned. */
export function unlockAllTowers(save: DefendSave) {
  for (const item of PALETTE_ITEMS) if (item !== "cityTile") save.owned[item] = Math.max(save.owned[item], 1);
}

/** The wallet the Forge spends from: the mine's copper, silver and gold
 * points; `free` (Dev free purchases) buys anything for nothing. */
export type Wallet = { copper: number; silver: number; gold: number; free?: boolean };

export const canAfford = (w: Wallet, p: Price) =>
  !!w.free || (w.copper >= (p.copper ?? 0) && w.silver >= (p.silver ?? 0) && w.gold >= (p.gold ?? 0));

export function pay(w: Wallet, p: Price) {
  if (w.free) return;
  w.copper -= p.copper ?? 0;
  w.silver -= p.silver ?? 0;
  w.gold -= p.gold ?? 0;
}

export function buyItem(save: DefendSave, w: Wallet, item: PaletteItem): boolean {
  const price = purchasePrice(item, save.owned[item]);
  if (!canAfford(w, price)) return false;
  pay(w, price);
  save.owned[item]++;
  return true;
}

export function buyUpgrade(save: DefendSave, w: Wallet, id: UpgradeId): boolean {
  const def = UPGRADES.find((u) => u.id === id)!;
  const level = save.levels[id];
  if (level >= def.maxLevel) return false;
  const price = def.price ? def.price(level) : upgradePrice(level);
  if (!canAfford(w, price)) return false;
  pay(w, price);
  save.levels[id]++;
  if (PLACED.some((k) => STRUCTURES[k].compact?.upgrade === id)) setLayout(save, sized(save.layout, save.levels));
  return true;
}

/** Kinds made smaller by the building-specific upgrades in `levels`. */
export const compactKinds = (levels: Record<UpgradeId, number>): PlacedKind[] =>
  PLACED.filter((k) => {
    const up = STRUCTURES[k].compact?.upgrade;
    return !!up && levels[up] > 0;
  });

/** `layout` with its structures sized for `levels`: those whose size
 * changed are taken up, back to the palette (the player places them again),
 * and failing that the newest are until it fits. */
export function sized(layout: Layout, levels: Record<UpgradeId, number>): Layout {
  const next = cloneLayout(layout);
  next.compact = compactKinds(levels);
  const was = new Set(layout.compact), now = new Set(next.compact);
  next.structures = next.structures.filter((s) => was.has(s.kind) === now.has(s.kind));
  return fitted(next);
}


/** `l` if it fits; else with the structures `unplaced` (saved before they
 * had spots) set out on their tiles; else with the newest taken off (back
 * to the palette) until it fits. */
function fitted(l: Layout, unplaced: number[] = []): Layout {
  if (!unplaced.length && fitLayout(l).ok) return l;
  const next = unplaced.length ? settle(l, unplaced) : cloneLayout(l);
  if (fitLayout(next).ok) return next;
  next.structures.sort((a, b) => a.uid - b.uid);
  while (next.structures.length && !fitLayout(next).ok) next.structures.pop();
  while (next.gates.length && !fitLayout(next).ok) next.gates.pop();
  while (next.spikes.length && !fitLayout(next).ok) next.spikes.pop();
  while (next.ballistas.length && !fitLayout(next).ok) next.ballistas.pop();
  while (next.walls?.length && !fitLayout(next).ok) next.walls.pop();
  if (next.walls && !next.walls.length) delete next.walls;
  return next;
}

export function buySpeed3(save: DefendSave, w: Wallet): boolean {
  if (save.speed3 || !canAfford(w, SPEED3_PRICE)) return false;
  pay(w, SPEED3_PRICE);
  save.speed3 = true;
  return true;
}

// ── The starting wave ─────────────────────────────────────────────────────
/** The furthest wave a save may open to start from. */
export const MAX_START_WAVE = 1e6;
/** Waves the dev option opens at a time. */
export const UNLOCK_WAVES = 100;

/** Highest entered wave, with cleared progress as a consistency floor. */
export const furthestWave = (save: DefendSave) => Math.max(save.furthestWave, save.bestWave);

/** A new reached record advances the next start; retries preserve manual choices. */
export function recordWaveReached(save: DefendSave, wave: number): boolean {
  if (!Number.isInteger(wave) || wave < 1 || wave > MAX_START_WAVE + 1 || wave <= furthestWave(save)) return false;
  save.furthestWave = wave;
  save.startWave = Math.max(1, wave - 1);
  return true;
}

/** Start up to the previous reached wave, or what the dev option opened. */
export function waveReach(save: DefendSave): number {
  return Math.max(1, furthestWave(save) - 1, save.unlockedWave);
}

/** The wave the next defense starts on, kept within reach. */
export function startingWave(save: DefendSave): number {
  return Math.min(Math.max(1, save.startWave), waveReach(save));
}

/** Dev: opens `UNLOCK_WAVES` more waves past the furthest the player can start on now. */
export function unlockWaves(save: DefendSave): number {
  save.unlockedWave = Math.min(MAX_START_WAVE, Math.max(0, furthestWave(save) - 1, save.unlockedWave) + UNLOCK_WAVES);
  return save.unlockedWave;
}

/** Buys a bomb from the same metal wallet as every other tile. */
export function buyBomb(save: DefendSave, wallet: Wallet): boolean {
  if (!canAfford(wallet, BOMB_PRICE)) return false;
  pay(wallet, BOMB_PRICE);
  save.bombs++;
  return true;
}

// ── Decoding untrusted saves ─────────────────────────────────────────────
const int = (n: unknown, min: number, max: number): n is number => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const PLACED: PlacedKind[] = ["repairShop", "meleeGuild", "rangedGuild", "barracks", "chapterHouse", "berserkerLodge", "halberdYard", "heroHall", "shadow", "bloodHall", "veilHouse", "poisonDen", "assassinDen", "spearHall", "phalanx", "javelinCamp", "lancerStable", "archerBarracks", "rangerLodge", "skirmishCamp", "skyrangerLodge", "sniperLodge", "gunHall", "musketHall", "gunNest", "gatlingNest", "rocketBattery", "revolutionary", "archerTower", "cannonTower", "nanoTower", "watchTower", "brazierTower", "hawkTower", "wispTower", "chronoTower", "batteryTower", "mortarTower", "minelayerTower", "wizardTower", "pyreTower", "frostTower", "stormTower", "mageGuild", "infernoHall", "cinderHall", "stormHall", "valkyriePalace", "darkKeep", "monsterBait"];

/** Attuned buildings saved wearing a branch's path, from before
 * each branch made a building of its own: each becomes that building,
 * keeping its rank. */
const BRANCHES: Record<string, Record<string, PlacedKind>> = {
  wizardTower: { pyromancy: "pyreTower", rime: "frostTower", storm: "stormTower" },
  barracks: { crusaders: "chapterHouse", berserkers: "berserkerLodge", halberdiers: "halberdYard" },
  assassinDen: { bloodletters: "bloodHall", shadowcloak: "veilHouse", venom: "poisonDen" },
  archerTower: { fireArrows: "brazierTower", sharpshooters: "hawkTower", wispArrow: "wispTower" },
  cannonTower: { gunnery: "batteryTower", siegeShot: "mortarTower", minelaying: "minelayerTower" },
  archerBarracks: { rangers: "rangerLodge", skirmishers: "skirmishCamp" },
  mageGuild: { pyroclasm: "infernoHall", cinders: "cinderHall", conduction: "stormHall" },
};
function splitBranches(s: any): any {
  // Paths saved without a rank (before version 5) are refunded and dropped instead.
  const branch = (o: any): PlacedKind | undefined => isObject(o) && Number.isInteger(o.rank) && o.rank >= 1 && Object.hasOwn(BRANCHES, o.kind) && Object.hasOwn(BRANCHES[o.kind], o.path) ? BRANCHES[o.kind][o.path] : undefined;
  const moved = (list: unknown) => (Array.isArray(list) ? list : []).filter(branch);
  const all = [...moved(s.layout?.structures), ...moved(s.kept)];
  if (!all.length) return s;
  const owned = { ...(isObject(s.owned) ? s.owned : {}) };
  const rekind = (o: any) => (branch(o) ? { ...o, kind: branch(o) } : o);
  for (const o of all) {
    const to = branch(o)!;
    owned[o.kind] = Math.max(0, (Number.isInteger(owned[o.kind]) ? owned[o.kind] : 0) - 1);
    owned[to] = (Number.isInteger(owned[to]) ? owned[to] : 0) + 1;
  }
  return { ...s, owned, kept: Array.isArray(s.kept) ? s.kept.map(rekind) : s.kept,
    layout: isObject(s.layout) && Array.isArray(s.layout.structures) ? { ...s.layout, structures: s.layout.structures.map(rekind) } : s.layout };
}

export function decodeDefendSave(raw: any): DefendSave {
  const d = defaultDefendSave();
  if (!isObject(raw)) return d;
  const s = splitBranches(raw);
  for (const item of PALETTE_ITEMS) d.owned[item] = intOr(s.owned?.[item], STARTING_OWNED[item], 999, d.owned[item]);
  for (const u of UPGRADES) d.levels[u.id] = intOr(s.levels?.[u.id], 0, u.maxLevel, d.levels[u.id]);
  d.bombs = intOr(s.bombs, 0, 9999, d.bombs);
  d.bestWave = intOr(s.bestWave, 0, 1e6, d.bestWave);
  // Old saves tracked cleared waves only; keep their existing starting-wave reach.
  const legacyReached = d.bestWave > 0 ? d.bestWave + 1 : 0;
  d.furthestWave = Math.max(d.bestWave, intOr(s.furthestWave, 0, MAX_START_WAVE + 1, legacyReached));
  d.unlockedWave = intOr(s.unlockedWave, 0, MAX_START_WAVE, d.unlockedWave);
  // Before reached-wave tracking, every save kept wave 1 as its default even
  // after progressing. Move that old default forward once; current saves and
  // other explicit earlier choices keep the player's selection.
  const oldDefault = s.furthestWave === undefined && s.startWave === 1;
  d.startWave = intOr(oldDefault ? undefined : s.startWave, 1, MAX_START_WAVE, Math.max(1, d.furthestWave - 1));
  d.paletteSide = s.paletteSide === "right" ? "right" : "left";
  d.speed3 = s.speed3 === true;
  d.battleSpeed = intOr(s.battleSpeed, 1, d.speed3 ? 3 : 2, 1) as 1 | 2 | 3;
  d.seed = intOr(s.seed, 0, 2 ** 32, d.seed);
  const kinds = Object.keys(ENEMIES) as EnemyKind[];
  d.discovered = kinds.filter(k => Array.isArray(s.discovered) && s.discovered.includes(k));
  d.journalRead = d.discovered.filter(k => Array.isArray(s.journalRead) && s.journalRead.includes(k));
  const wallRanks = decodeWallRanks(s.wallRanks);
  if (wallRanks) d.wallRanks = wallRanks;
  d.layout = decodeLayout(s.layout, d.owned, d.levels, innerWalls(wallRanks)) ?? d.layout;
  d.kept = Array.isArray(s.kept) ? s.kept.filter((k: any) => isObject(k) && (PLACED.includes(k.kind) || k.kind === "wallSpikes") && wearFits(k.kind, k.path, k.rank))
    .slice(0, 9999).map((k: any): Kept => ({ kind: k.kind, path: k.path, rank: k.rank })) : [];
  trimKept(d);
  const keepRanks = decodeKeepRanks(s.keepRanks);
  if (keepRanks) d.keepRanks = keepRanks;
  const gateRanks = decodeGateRanks(s.gateRanks);
  if (gateRanks) d.gateRanks = gateRanks;
  const ballistaRanks = decodeBallistaRanks(s.ballistaRanks);
  if (ballistaRanks) d.ballistaRanks = ballistaRanks;
  const revolutionaryRanks = decodeRevolutionaryRanks(s.revolutionaryRanks);
  if (revolutionaryRanks) d.revolutionaryRanks = revolutionaryRanks;
  const shadowRanks = decodeShadowRanks(s.shadowRanks);
  if (shadowRanks) d.shadowRanks = shadowRanks;
  const repairRanks = decodeRepairRanks(s.repairRanks);
  if (repairRanks) d.repairRanks = repairRanks;
  const chronoRanks = decodeChronoRanks(s.chronoRanks);
  if (chronoRanks) d.chronoRanks = chronoRanks;
  const nanoRanks = decodeNanoRanks(s.nanoRanks);
  if (nanoRanks) d.nanoRanks = nanoRanks;
  return d;
}

/** A placement's saved path and rank, when they are its own. Saves from
 * before version 5 kept a path without a rank (the Study's researched rank
 * then; `migrateResearch` settles it): the path is kept for that. */
function wearOn(kind: string, p: any): { path?: PathId; rank?: number } {
  if (wearFits(kind, p?.path, p?.rank)) return { path: p.path, rank: p.rank };
  return p?.rank === undefined && wearFits(kind, p?.path, 1) ? { path: p.path } : {};
}

const isObject = (s: unknown): s is Record<string, any> => !!s && typeof s === "object";
const intOr = (n: unknown, min: number, max: number, fallback: number) => (int(n, min, max) ? n : fallback);
const tileOk = (tx: unknown, ty: unknown) => int(tx, 0, TILES_W - 1) && int(ty, 0, TILES_H - 1) && ty !== SPAWN_ROW;

/** The saved layout, or null unless every part of it is well formed, the
 * player owns everything on it and its tiles join the keep. Structures that
 * no longer fit (a save from before the tile shares, say) are reshuffled on
 * their tiles, and failing that the newest go back to the palette. */
function decodeLayout(s: any, owned: Record<PaletteItem, number>, levels: Record<UpgradeId, number>, inner: boolean): Layout | null {
  if (!isObject(s) || !tileOk(s.keep?.tx, s.keep?.ty) || !int(s.nextUid, 1, 1e9)) return null;
  const keep = { tx: s.keep.tx, ty: s.keep.ty };
  const cityTiles = decodeCityTiles(s.cityTiles, tileKey(keep.tx, keep.ty));
  const decoded = decodeStructures(s.structures, s.nextUid);
  if (!cityTiles || !decoded) return null;
  const { structures, unplaced } = decoded;
  // Saves from before city gates, wall spikes and ballistas have none.
  const tiles = new Set([tileKey(keep.tx, keep.ty), ...cityTiles]);
  const gates = s.gates === undefined ? [] : decodeGates(s.gates, tiles);
  const spikes = s.spikes === undefined ? [] : decodeGates(s.spikes, tiles)?.map((g, i): SpikeSpot => ({ ...g, ...wearOn("wallSpikes", s.spikes[i]) })) ?? null;
  const ballistas = s.ballistas === undefined ? [] : decodeCorners(s.ballistas, tiles);
  if (!gates || !spikes || !ballistas || spikes.some((g) => gates.some((o) => sameGate(o, g)))) return null;
  // Saves from before placed walls have none.
  const walls = s.walls === undefined ? [] : decodeWalls(s.walls);
  if (!walls) return null;
  const layout: Layout = { keep, cityTiles, structures, nextUid: s.nextUid, compact: compactKinds(levels), gates, spikes, ballistas, ...(walls.length ? { walls } : {}), ...(inner ? { innerWalls: true as const } : {}) };
  if (!legal(layout, owned)) return null;
  const out = fitted(layout, unplaced);
  return fitLayout(out).ok ? out : null;
}

/** Distinct on-board tile keys other than the keep's, or null. */
function decodeCityTiles(list: unknown, keepKey: string): string[] | null {
  if (!Array.isArray(list)) return null;
  const out: string[] = [];
  for (const k of list) {
    if (!cityTileOk(k, keepKey, out)) return null;
    out.push(k);
  }
  return out;
}

/** A well-formed tile key on the board, not the keep's, not yet listed. */
function cityTileOk(k: unknown, keepKey: string, listed: string[]): k is string {
  if (typeof k !== "string" || !/^\d+,\d+$/.test(k)) return false;
  const { tx, ty } = parseTileKey(k);
  return tileOk(tx, ty) && k !== keepKey && !listed.includes(k);
}

/** Placed structures on the board with distinct uids issued before
 * `nextUid`, or null; and the uids of those saved before structures were
 * placed on quarter tiles (`unplaced`), which `fitted` sets out. */
function decodeStructures(list: unknown, nextUid: number): { structures: PlacedStructure[]; unplaced: number[] } | null {
  if (!Array.isArray(list)) return null;
  const structures: PlacedStructure[] = [], unplaced: number[] = [];
  const uids = new Set<number>();
  for (const p of list) {
    if (!structureOk(p, nextUid, uids)) return null;
    uids.add(p.uid);
    const placed = int(p.qx, 0, QUARTERS_W - 1) && int(p.qy, 0, QUARTERS_H - 1) && Math.floor(p.qx / QUARTER) === p.tx && Math.floor(p.qy / QUARTER) === p.ty;
    if (!placed) unplaced.push(p.uid);
    // A path is kept only if it is the structure's own.
    structures.push({ uid: p.uid, kind: p.kind, tx: p.tx, ty: p.ty, qx: placed ? p.qx : p.tx * QUARTER, qy: placed ? p.qy : p.ty * QUARTER, ...wearOn(p.kind, p) });
  }
  return { structures, unplaced };
}

/** Distinct gates, each in the wall of a city tile, or null. */
function decodeGates(list: unknown, cityTiles: Set<string>): GateSpot[] | null {
  if (!Array.isArray(list)) return null;
  const out: GateSpot[] = [];
  for (const g of list) {
    if (!isObject(g) || !tileOk(g.tx, g.ty) || !SIDES.includes(g.side)) return null;
    const spot: GateSpot = { tx: g.tx, ty: g.ty, side: g.side };
    if (!gateOk(cityTiles, spot) || out.some((o) => sameGate(o, spot))) return null;
    out.push(spot);
  }
  return out;
}

/** Distinct wall corners, each where the wall turns, or null. */
function decodeCorners(list: unknown, cityTiles: Set<string>): CornerSpot[] | null {
  if (!Array.isArray(list)) return null;
  const out: CornerSpot[] = [];
  for (const v of list) {
    if (!isObject(v) || !int(v.vx, 1, TILES_W - 1) || !int(v.vy, 1, TILES_H - 1)) return null;
    const spot: CornerSpot = { vx: v.vx, vy: v.vy };
    if (!cornerOk(cityTiles, spot) || out.some((o) => sameCorner(o, spot))) return null;
    out.push(spot);
  }
  return out;
}

/** Distinct wall sections, each on the board off the spawn row, or null. */
function decodeWalls(list: unknown): WallSpot[] | null {
  if (!Array.isArray(list)) return null;
  const out: WallSpot[] = [];
  for (const w of list) {
    if (!isObject(w) || !Number.isInteger(w.qx) || !Number.isInteger(w.qy)) return null;
    const spot: WallSpot = { qx: w.qx, qy: w.qy };
    if (!wallSpotOk(spot) || out.some((o) => sameWall(o, spot))) return null;
    out.push(spot);
  }
  return out;
}

const structureOk = (p: any, nextUid: number, uids: Set<number>) =>
  PLACED.includes(p?.kind) && tileOk(p.tx, p.ty) && int(p.uid, 1, nextUid - 1) && !uids.has(p.uid);

/** The player owns everything the layout places. City tiles may stand
 * anywhere, apart from the keep's or not. */
function legal(layout: Layout, owned: Record<PaletteItem, number>) {
  return affordable(layout, owned);
}

function affordable(layout: Layout, owned: Record<PaletteItem, number>) {
  return (
    layout.cityTiles.length <= owned.cityTile &&
    layout.gates.length <= owned.cityGate &&
    layout.spikes.length <= owned.wallSpikes &&
    layout.ballistas.length <= owned.wallBallista &&
    (layout.walls?.length ?? 0) <= owned.wallBlock &&
    PLACED.every((k) => placedCount(layout, k) <= owned[k])
  );
}
