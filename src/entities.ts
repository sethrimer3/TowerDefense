import type { GoldItemId, KeyColor, UpgradeId } from "./config.ts";
import type { MaterialId } from "./materials.ts";
import type { CraftedEquipment, EquipmentSlot } from "./equipment.ts";
import type { ConsumableId } from "./crafting.ts";
import type { DefendSave } from "./defend/progress.ts";
import type { Settings } from "./settings.ts";
export type Kind =
  | "wall"
  | "floor"
  | "enemy"
  | "key"
  | "door"
  | "potion"
  | "attack"
  | "defense"
  | "reward"
  | "treasure"
  | "openedChest"
  | "stairs"
  | "stairsDown"
  | "oneway";
export type Enemy = {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  tier: number;
};
export type ClearTier = "silver" | "gold" | "platinum";
/** A floor's clear tiers: each one earned, and then claimed once paid. */
export type FloorRecord = Partial<Record<ClearTier, "earned" | "claimed">>;
/** Declarative lock rules. `color` remains on Tile for legacy single-key
 * doors and keys; new doors use this rule so every gameplay system shares
 * the same requirements and consumption behavior. */
export type DoorRule =
  | { type: "keys"; keys: KeyColor[]; mode: "all" | "any" }
  | { type: "fullHp" };
export type Tile = { kind: Kind; amount?: number; color?: KeyColor; door?: DoorRule; enemy?: Enemy; tier?: ClearTier };
export type Point = { x: number; y: number };
/** A stationary wall-mounted light source, anchored to a walkable floor
 * tile adjacent to a wall. Its visibility polygon is computed once (on
 * creation) and cached; rendering only clips a radial gradient to it. */
export type Torch = {
  x: number;
  y: number;
  lightRadius: number;
  baseIntensity: number;
  active: boolean;
  visibilityPolygon?: Point[];
};
export type Player = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  keys: Record<KeyColor, number>;
  /** Optional secret inventory counters stay absent from legacy saves until
   * the corresponding item has actually been found. */
  skeletonKeys?: number;
};
export type Run = {
  damaged?: boolean;
  keysSpent?: boolean;
  outside?: boolean;
  layoutVersion?: number;
  delveMilestone?: number;
  delveKnown?: Record<string, true>;
  delveVisited?: Record<string, number>;
  seed: number;
  player: Player;
  height: number;
  maxHeight?: number;
  kills: number;
  treasures: number;
  changes: Record<string, Tile>;
  floor: number;
  /** Tower only: each other visited floor's changes, keyed by height, so
   * descending and re-climbing preserves what was already done there. The
   * current floor's are `changes`; see TowerClimb. */
  floors?: Record<number, Record<string, Tile>>;
  /** The ATK/DEF/max HP the run started with (its loadout), shifted by any
   * gear change since. In the Tower, ATK/DEF return to it whenever the
   * climb crosses into a new section. */
  loadout?: { attack: number; defense: number; maxHp: number };
};
export type MoveSnapshot = { run: Run; best: number };
export type Revival = { snapshot: MoveSnapshot };
export type Mode = "tower" | "delve";
export type ModeSave = {
  history: MoveSnapshot[];
  revival: Revival | null;
  best: number;
  reached: number;
  run: Run | null;
  /** Keys of `${seed}:${x},${y}` (delve) or `${seed}:${height}:${x},${y}`
   * (tower) for every enemy kill / treasure chest that has already paid out
   * persistent rewards, kept outside `run` so it survives movement undo and
   * blocks the same physical kill/chest from paying out twice. */
  lootedTiles: Record<string, true>;
};
export type Save = {
  version: 3;
  tower: ModeSave & {
    inspiration: number;
    log: Record<string, FloorRecord>;
    /** Which 10-floor section new ascents begin in (0 = floors 1–10). */
    startSection: number;
    /** Highest HP the player has arrived at each section's first floor
     * with, keyed by section index (1+). Doubles as that section's
     * starting HP and as the record of which sections are unlocked. */
    sectionHp: Record<string, number>;
  };
  delve: ModeSave & { courage: number };
  gold: number;
  provisions: Record<GoldItemId, number>;
  xp: number;
  upgrades: Record<UpgradeId, number>;
  settings: Settings;
  /** Persistent crafting-material inventory. Never part of `Run` — must
   * survive movement undo, death, and new runs. */
  materials: Record<MaterialId, number>;
  equipmentInventory: CraftedEquipment[];
  equipped: Partial<Record<EquipmentSlot, string>>;
  consumables: Record<ConsumableId, number>;
  /** DEFEND mini-game: city layout, purchases, upgrades and best wave. A
   * defense run itself is never saved. */
  defend: DefendSave;
};
export const point = (x: number, y: number) => `${x},${y}`;
