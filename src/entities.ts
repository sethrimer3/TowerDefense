import type { CardId } from "./cards.ts";
import type { GoldItemId, KeyColor, TrainingId, UpgradeId } from "./config.ts";
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
/** How hard a generator asked an enemy to be. Strong and elite enemies wear
 * a brighter glow and rank chevrons, so the player can tell them apart. */
export type EnemyStrength = "weak" | "normal" | "strong" | "elite";
export type Enemy = {
  name: string;
  hp: number;
  attack: number;
  defense: number;
  tier: number;
  strength: EnemyStrength;
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
/** What a run holds in either mode. */
export type RunCore = {
  outside?: boolean;
  layoutVersion?: number;
  seed: number;
  player: Player;
  height: number;
  maxHeight?: number;
  kills: number;
  treasures: number;
  changes: Record<string, Tile>;
  floor: number;
  /** The ATK/DEF/max HP the run started with (its loadout), shifted by any
   * gear change since. In the Tower, ATK/DEF return to it whenever the
   * climb crosses into a new section. */
  loadout?: { attack: number; defense: number; maxHp: number };
  /** The hand as it was ordered when the run went inside: the cards that
   * move the hero for the rest of the run. */
  hand?: CardId[];
};
/** A Tower ascent. */
export type TowerRun = RunCore & {
  /** Whether the player has taken damage, or spent keys, on this floor:
   * the clear tiers it can still earn. */
  damaged: boolean;
  keysSpent: boolean;
  /** Each other visited floor's changes, keyed by height, so descending
   * and re-climbing preserves what was already done there. The current
   * floor's are `changes`; see TowerClimb. */
  floors?: Record<number, Record<string, Tile>>;
};
/** A Delve descent. */
export type DelveRun = RunCore & {
  /** Milestone gates crossed: the area the labyrinth is sealed below. */
  milestone: number;
};
/** What Delve Automove has seen of the descent in the labyrinth, and how
 * often the player has stood on each tile. It is kept beside the run, not
 * in it, so undo never copies or rewinds it. */
export type AutomoveMemory = { known: Record<string, true>; visited: Record<string, number> };
export type Run = TowerRun | DelveRun;
/** The run and lifetime XP just before a move, so undo takes back the XP
 * (and any level) a kill paid. */
export type MoveSnapshot<R extends Run = Run> = { run: R; best: number; xp: number };
export type Revival<R extends Run = Run> = { snapshot: MoveSnapshot<R> };
export type Mode = "tower" | "delve";
export type ModeSave<R extends Run = Run> = {
  history: MoveSnapshot<R>[];
  revival: Revival<R> | null;
  best: number;
  reached: number;
  run: R | null;
  /** Keys of `${seed}:${x},${y}` (delve) or `${seed}:${height}:${x},${y}`
   * (tower) for every enemy kill / treasure chest that has already paid out
   * persistent rewards, kept outside `run` so it survives movement undo and
   * blocks the same physical kill/chest from paying out twice. */
  lootedTiles: Record<string, true>;
  /** Gold picked up during the current run, kept outside `run` like
   * `lootedTiles`, since undo never takes Gold back. */
  runGold: number;
};
export type Save = {
  version: 3;
  tower: ModeSave<TowerRun> & {
    inspiration: number;
    log: Record<string, FloorRecord>;
    /** Which 10-floor section new ascents begin in (0 = floors 1–10). */
    startSection: number;
    /** Highest HP the player has arrived at each section's first floor
     * with, keyed by section index (1+). Doubles as that section's
     * starting HP and as the record of which sections are unlocked. */
    sectionHp: Record<string, number>;
  };
  delve: ModeSave<DelveRun> & { courage: number; memory: AutomoveMemory };
  gold: number;
  provisions: Record<GoldItemId, number>;
  xp: number;
  /** Ranks of each stat bought with training points (earned per level). */
  training: Record<TrainingId, number>;
  upgrades: Record<UpgradeId, number>;
  settings: Settings;
  /** Persistent crafting-material inventory. Never part of `Run` — must
   * survive movement undo, death, and new runs. */
  materials: Record<MaterialId, number>;
  equipmentInventory: CraftedEquipment[];
  equipped: Partial<Record<EquipmentSlot, string>>;
  consumables: Record<ConsumableId, number>;
  /** The active hand: the cards that move the hero inside a run, in
   * priority order. Set up before a run; a new profile starts with the
   * base hand. */
  hand: CardId[];
  /** Tutorials the player has finished: `deck`, reordering the hand on
   * the Deck page. */
  tutorials: { deck: boolean };
  /** DEFEND mini-game: city layout, purchases, upgrades and best wave. A
   * defense run itself is never saved. */
  defend: DefendSave;
};
export const point = (x: number, y: number) => `${x},${y}`;
