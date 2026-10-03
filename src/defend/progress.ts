/** Persistent DEFEND state: the city layout the player designed, what they
 * own and have upgraded, and their best wave. A run itself is never saved —
 * it always starts fresh from the layout. */
import {
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
import { cloneLayout, defaultLayout, fitLayout, placedCount, tilesConnected, type Layout, type PlacedKind, type PlacedStructure } from "./layout.ts";

export type DefendSave = {
  layout: Layout;
  owned: Record<PaletteItem, number>;
  levels: Record<UpgradeId, number>;
  bombs: number;
  bestWave: number;
  paletteSide: "left" | "right";
  /** 3× battle speed has been bought in the Armory. */
  speed3: boolean;
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
    paletteSide: "left",
    speed3: false,
    seed: 1 + Math.floor(defendRandom("rolls")() * 1e9),
  };
}

/** How many of a palette item are still in the palette (owned, not placed). */
export function available(save: DefendSave, item: PaletteItem): number {
  return Math.max(0, save.owned[item] - placedCount(save.layout, item as PlacedKind | "cityTile"));
}

/** The wallet DEFEND spends from: main-game gold and metal bars; `free`
 * (Dev free purchases) buys anything for nothing. */
export type Wallet = { gold: number; copper: number; silver: number; free?: boolean };

export const canAfford = (w: Wallet, p: Price) =>
  !!w.free || (w.gold >= p.gold && w.copper >= (p.copper ?? 0) && w.silver >= (p.silver ?? 0));

export function pay(w: Wallet, p: Price) {
  if (w.free) return;
  w.gold -= p.gold;
  w.copper -= p.copper ?? 0;
  w.silver -= p.silver ?? 0;
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
  return next;
}

export function buySpeed3(save: DefendSave, w: Wallet): boolean {
  if (save.speed3 || !canAfford(w, SPEED3_PRICE)) return false;
  pay(w, SPEED3_PRICE);
  save.speed3 = true;
  return true;
}

export function buyBomb(save: DefendSave, w: Wallet): boolean {
  if (!canAfford(w, BOMB_PRICE)) return false;
  pay(w, BOMB_PRICE);
  save.bombs++;
  return true;
}

// ── Decoding untrusted saves ─────────────────────────────────────────────
const int = (n: unknown, min: number, max: number): n is number => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const PLACED: PlacedKind[] = ["barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower", "wizardTower", "mageGuild", "valkyriePalace", "darkKeep"];

export function decodeDefendSave(s: any): DefendSave {
  const d = defaultDefendSave();
  if (!isObject(s)) return d;
  for (const item of PALETTE_ITEMS) d.owned[item] = intOr(s.owned?.[item], STARTING_OWNED[item], 999, d.owned[item]);
  for (const u of UPGRADES) d.levels[u.id] = intOr(s.levels?.[u.id], 0, u.maxLevel, d.levels[u.id]);
  d.bombs = intOr(s.bombs, 0, 9999, d.bombs);
  d.bestWave = intOr(s.bestWave, 0, 1e6, d.bestWave);
  d.paletteSide = s.paletteSide === "right" ? "right" : "left";
  d.speed3 = s.speed3 === true;
  d.seed = intOr(s.seed, 0, 2 ** 32, d.seed);
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
  const layout: Layout = { keep, cityTiles, structures, nextUid: s.nextUid, rolls: intOr(s.rolls, 0, 1e9, 0), compact: compactKinds(levels) };
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

const structureOk = (p: any, nextUid: number, uids: Set<number>) =>
  PLACED.includes(p?.kind) && tileOk(p.tx, p.ty) && int(p.uid, 1, nextUid - 1) && !uids.has(p.uid);

/** The player owns everything the layout places and its tiles join the
 * keep. */
function legal(layout: Layout, owned: Record<PaletteItem, number>) {
  const tiles = new Set([tileKey(layout.keep.tx, layout.keep.ty), ...layout.cityTiles]);
  return affordable(layout, owned) && tilesConnected(tiles, layout.keep);
}

function affordable(layout: Layout, owned: Record<PaletteItem, number>) {
  return layout.cityTiles.length <= owned.cityTile && PLACED.every((k) => placedCount(layout, k) <= owned[k]);
}
