/** Persistent DEFEND state: the city layout the player designed, what they
 * own and have upgraded, and their best wave. A run itself is never saved —
 * it always starts fresh from the layout. */
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
  SIDES,
  cloneLayout,
  cornerOk,
  defaultLayout,
  fitLayout,
  gateOk,
  placedCount,
  sameCorner,
  sameGate,
  tilesConnected,
  joinedOnly,
  type CornerSpot,
  type GateSpot,
  type Layout,
  type PlacedKind,
  type PlacedStructure,
} from "./layout.ts";

export type DefendSave = {
  layout: Layout;
  owned: Record<PaletteItem, number>;
  levels: Record<UpgradeId, number>;
  bombs: number;
  bestWave: number;
  /** The furthest wave the dev option has opened to start from, past the best (0 when never used). */
  unlockedWave: number;
  /** The wave the next defense starts on (1 unless the player picked another). */
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
};

export function defaultDefendSave(): DefendSave {
  return {
    layout: defaultLayout(),
    owned: { ...STARTING_OWNED },
    levels: Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<UpgradeId, number>,
    bombs: 0,
    bestWave: 0,
    unlockedWave: 0,
    startWave: 1,
    discovered: [],
    journalRead: [],
    paletteSide: "left",
    speed3: false,
    battleSpeed: 1,
    seed: 1 + Math.floor(defendRandom("rolls")() * 1e9),
  };
}

/** How many of a palette item are still in the palette (owned, not placed). */
export function available(save: DefendSave, item: PaletteItem): number {
  return Math.max(0, save.owned[item] - placedCount(save.layout, item));
}

/** Returns the newest placed `kind` to the palette until no more stand than
 * are owned (an evolution taking or giving back copies). */
export function trimPlaced(save: DefendSave, kind: PlacedKind) {
  const over = placedCount(save.layout, kind) - save.owned[kind];
  if (over <= 0) return;
  const next = cloneLayout(save.layout);
  const drop = new Set(next.structures.filter((s) => s.kind === kind).sort((a, b) => b.uid - a.uid).slice(0, over).map((s) => s.uid));
  next.structures = next.structures.filter((s) => !drop.has(s.uid));
  save.layout = next;
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
  if (PLACED.some((k) => STRUCTURES[k].compact?.upgrade === id)) save.layout = sized(save.layout, save.levels);
  return true;
}

/** Kinds made smaller by the building-specific upgrades in `levels`. */
export const compactKinds = (levels: Record<UpgradeId, number>): PlacedKind[] =>
  PLACED.filter((k) => {
    const up = STRUCTURES[k].compact?.upgrade;
    return !!up && levels[up] > 0;
  });

/** `layout` with its structures sized for `levels`, shuffled into fresh
 * spots on their tiles if they no longer fit where they were, and failing
 * that with the newest returned to the palette until it fits. */
export function sized(layout: Layout, levels: Record<UpgradeId, number>): Layout {
  const next = cloneLayout(layout);
  next.compact = compactKinds(levels);
  return fitted(next);
}

/** `layout` as outlying districts (`on`, the Study's skill) allow: with
 * them city tiles may stand apart from the keep's; without, any that do are
 * taken up, with whatever stood on them, and the rest made to fit. */
export function withOutskirts(layout: Layout, on: boolean): Layout {
  if (!!layout.outskirts === on) return layout;
  if (on) return { ...cloneLayout(layout), outskirts: true };
  return fitted(joinedOnly(layout).layout);
}

/** `l` if it fits; else its structures reshuffled; else with the newest
 * taken off (back to the palette) until it fits. */
function fitted(l: Layout): Layout {
  if (fitLayout(l).ok) return l;
  const next = cloneLayout(l);
  for (let r = 1; r <= 8; r++) {
    next.rolls = l.rolls + r;
    for (const s of next.structures) s.spot = hash(next.rolls, s.uid, 0x5b07);
    if (fitLayout(next).ok) return next;
  }
  next.structures.sort((a, b) => a.uid - b.uid);
  while (next.structures.length && !fitLayout(next).ok) next.structures.pop();
  while (next.gates.length && !fitLayout(next).ok) next.gates.pop();
  while (next.spikes.length && !fitLayout(next).ok) next.spikes.pop();
  while (next.ballistas.length && !fitLayout(next).ok) next.ballistas.pop();
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

/** The furthest wave a defense may start on: the best wave held, or what the dev option opened. */
export function waveReach(save: DefendSave): number {
  return Math.max(1, save.bestWave, save.unlockedWave);
}

/** The wave the next defense starts on, kept within reach. */
export function startingWave(save: DefendSave): number {
  return Math.min(Math.max(1, save.startWave), waveReach(save));
}

/** Dev: opens `UNLOCK_WAVES` more waves past the furthest the player can start on now. */
export function unlockWaves(save: DefendSave): number {
  save.unlockedWave = Math.min(MAX_START_WAVE, Math.max(save.bestWave, save.unlockedWave) + UNLOCK_WAVES);
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
const PLACED: PlacedKind[] = ["barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower", "wizardTower", "mageGuild", "valkyriePalace", "darkKeep", "monsterBait"];

export function decodeDefendSave(s: any): DefendSave {
  const d = defaultDefendSave();
  if (!isObject(s)) return d;
  for (const item of PALETTE_ITEMS) d.owned[item] = intOr(s.owned?.[item], STARTING_OWNED[item], 999, d.owned[item]);
  for (const u of UPGRADES) d.levels[u.id] = intOr(s.levels?.[u.id], 0, u.maxLevel, d.levels[u.id]);
  d.bombs = intOr(s.bombs, 0, 9999, d.bombs);
  d.bestWave = intOr(s.bestWave, 0, 1e6, d.bestWave);
  d.unlockedWave = intOr(s.unlockedWave, 0, MAX_START_WAVE, d.unlockedWave);
  d.startWave = intOr(s.startWave, 1, MAX_START_WAVE, d.startWave);
  d.paletteSide = s.paletteSide === "right" ? "right" : "left";
  d.speed3 = s.speed3 === true;
  d.battleSpeed = intOr(s.battleSpeed, 1, d.speed3 ? 3 : 2, 1) as 1 | 2 | 3;
  d.seed = intOr(s.seed, 0, 2 ** 32, d.seed);
  const kinds = Object.keys(ENEMIES) as EnemyKind[];
  d.discovered = kinds.filter(k => Array.isArray(s.discovered) && s.discovered.includes(k));
  d.journalRead = d.discovered.filter(k => Array.isArray(s.journalRead) && s.journalRead.includes(k));
  d.layout = decodeLayout(s.layout, d.owned, d.levels) ?? d.layout;
  return d;
}

const isObject = (s: unknown): s is Record<string, any> => !!s && typeof s === "object";
const intOr = (n: unknown, min: number, max: number, fallback: number) => (int(n, min, max) ? n : fallback);
const tileOk = (tx: unknown, ty: unknown) => int(tx, 0, TILES_W - 1) && int(ty, 0, TILES_H - 1) && ty !== SPAWN_ROW;

/** The saved layout, or null unless every part of it is well formed, the
 * player owns everything on it and its tiles join the keep. Structures that
 * no longer fit (a save from before the tile shares, say) are reshuffled on
 * their tiles, and failing that the newest go back to the palette. */
function decodeLayout(s: any, owned: Record<PaletteItem, number>, levels: Record<UpgradeId, number>): Layout | null {
  if (!isObject(s) || !tileOk(s.keep?.tx, s.keep?.ty) || !int(s.nextUid, 1, 1e9)) return null;
  const keep = { tx: s.keep.tx, ty: s.keep.ty };
  const cityTiles = decodeCityTiles(s.cityTiles, tileKey(keep.tx, keep.ty));
  const structures = decodeStructures(s.structures, s.nextUid);
  if (!cityTiles || !structures) return null;
  // Saves from before city gates, wall spikes and ballistas have none.
  const tiles = new Set([tileKey(keep.tx, keep.ty), ...cityTiles]);
  const gates = s.gates === undefined ? [] : decodeGates(s.gates, tiles);
  const spikes = s.spikes === undefined ? [] : decodeGates(s.spikes, tiles);
  const ballistas = s.ballistas === undefined ? [] : decodeCorners(s.ballistas, tiles);
  if (!gates || !spikes || !ballistas || spikes.some((g) => gates.some((o) => sameGate(o, g)))) return null;
  const layout: Layout = { keep, cityTiles, structures, nextUid: s.nextUid, rolls: intOr(s.rolls, 0, 1e9, 0), compact: compactKinds(levels), gates, spikes, ballistas, ...(s.outskirts === true ? { outskirts: true as const } : {}) };
  if (!legal(layout, owned)) return null;
  const out = fitted(layout);
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
 * `nextUid`, or null. */
function decodeStructures(list: unknown, nextUid: number): PlacedStructure[] | null {
  if (!Array.isArray(list)) return null;
  const out: PlacedStructure[] = [];
  const uids = new Set<number>();
  for (const p of list) {
    if (!structureOk(p, nextUid, uids)) return null;
    uids.add(p.uid);
    // Saves from before random spots have none: draw one from the uid.
    out.push({ uid: p.uid, kind: p.kind, tx: p.tx, ty: p.ty, spot: int(p.spot, 0, 2 ** 32 - 1) ? p.spot : hash(p.uid, 0x5b07) });
  }
  return out;
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

const structureOk = (p: any, nextUid: number, uids: Set<number>) =>
  PLACED.includes(p?.kind) && tileOk(p.tx, p.ty) && int(p.uid, 1, nextUid - 1) && !uids.has(p.uid);

/** The player owns everything the layout places and its tiles join the
 * keep (unless they may stand apart, with outlying districts). */
function legal(layout: Layout, owned: Record<PaletteItem, number>) {
  const tiles = new Set([tileKey(layout.keep.tx, layout.keep.ty), ...layout.cityTiles]);
  return affordable(layout, owned) && (!!layout.outskirts || tilesConnected(tiles, layout.keep));
}

function affordable(layout: Layout, owned: Record<PaletteItem, number>) {
  return (
    layout.cityTiles.length <= owned.cityTile &&
    layout.gates.length <= owned.cityGate &&
    layout.spikes.length <= owned.wallSpikes &&
    layout.ballistas.length <= owned.wallBallista &&
    PLACED.every((k) => placedCount(layout, k) <= owned[k])
  );
}
