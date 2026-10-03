import { intPow } from "../exact.ts";

/** Data tables for DEFEND: what the player can place, what it costs in
 * copper, silver and Gold, the universal upgrades, the bonuses the Smithy and the
 * skill trees add, and the enemy roster. */

export type StructureKind = "keep" | "barracks" | "archerBarracks" | "archerTower" | "cannonTower" | "watchTower" | "wizardTower" | "mageGuild" | "valkyriePalace";
/** Everything that appears in the build palette (the keep is placed from the
 * start and can only be moved, so it is not a palette item). */
export type PaletteItem = "cityTile" | Exclude<StructureKind, "keep">;
export const PALETTE_ITEMS: PaletteItem[] = ["cityTile", "barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower", "wizardTower", "mageGuild", "valkyriePalace"];

export type StructureDef = {
  kind: StructureKind;
  name: string;
  /** Footprint in cells (before rotation). */
  w: number;
  h: number;
  /** How much of its tile it takes, in sixteenths: 1 (the smallest towers),
   * 2, 4, 8 or 16 (a whole tile, alone). What shares a tile must add up to
   * no more than 16, and fit. */
  size: TileShare;
  /** The smaller footprint and share a building-specific upgrade gives it. */
  compact?: { upgrade: UpgradeId; w: number; h: number; size: TileShare };
  maxHp: number;
  /** Can be placed on ground outside the city limits. */
  outsideOk: boolean;
  description: string;
};

/** Sixteenths of a tile. */
export type TileShare = 1 | 2 | 4 | 8 | 16;
/** A tile's whole room, in sixteenths. */
export const TILE_ROOM = 16;

export const STRUCTURES: Record<StructureKind, StructureDef> = {
  keep: {
    kind: "keep",
    name: "Keep",
    w: 3,
    h: 3,
    size: 16,
    maxHp: 600,
    outsideOk: false,
    description: "The heart of the city. Enemies march on it; if it falls, the defense is over.",
  },
  barracks: {
    kind: "barracks",
    name: "Barracks",
    w: 3,
    h: 4,
    size: 4,
    maxHp: 160,
    outsideOk: false,
    description: "Trains swordsmen who sally out against anything that breaches the walls.",
  },
  archerBarracks: {
    kind: "archerBarracks",
    name: "Archer barracks",
    w: 3,
    h: 3,
    size: 4,
    maxHp: 150,
    outsideOk: false,
    description: "Trains archers who wander the city streets, loosing arrows at anything that comes near.",
  },
  archerTower: {
    kind: "archerTower",
    name: "Archer tower",
    w: 2,
    h: 2,
    size: 1,
    maxHp: 120,
    outsideOk: true,
    description: "Looses arrows at the nearest enemy in range. Can stand inside or outside the walls.",
  },
  cannonTower: {
    kind: "cannonTower",
    name: "Cannon tower",
    w: 2,
    h: 2,
    size: 2,
    maxHp: 150,
    outsideOk: true,
    description: "Slow, heavy guns lobbing explosive shells that burst among the enemy. Careful — the blast hurts your own people too.",
  },
  watchTower: {
    kind: "watchTower",
    name: "Watch tower",
    w: 2,
    h: 2,
    size: 1,
    maxHp: 100,
    outsideOk: true,
    description: "Marks every enemy in its radius with a golden outline — marked enemies take double damage.",
  },
  wizardTower: {
    kind: "wizardTower",
    name: "Wizard tower",
    w: 2,
    h: 2,
    size: 2,
    maxHp: 130,
    outsideOk: true,
    description: "Alternates between a roaring flamethrower and a wave of ice shards that chills everything it crosses.",
  },
  mageGuild: {
    kind: "mageGuild",
    name: "Mage Guild",
    w: 3,
    h: 3,
    size: 4,
    maxHp: 140,
    outsideOk: false,
    description: "Trains red fire mages who roam the streets hurling explosive fireballs. Each blast leaves the ground burning, scorching whatever walks through.",
  },
  valkyriePalace: {
    kind: "valkyriePalace",
    name: "Valkyrie palace",
    w: 5,
    h: 5,
    size: 16,
    compact: { upgrade: "palaceCompact", w: 3, h: 5, size: 8 },
    maxHp: 260,
    outsideOk: false,
    description: "A heavenly marble palace that fills a whole tile. Trains armoured valkyries whose golden spear charges through every enemy in a line.",
  },
};

/** A structure's footprint and share of its tile, smaller once its
 * building-specific upgrade is owned (`compact`). */
export function footprint(kind: StructureKind, compact: boolean): { w: number; h: number; size: TileShare } {
  const def = STRUCTURES[kind];
  return compact && def.compact ? def.compact : def;
}

/** A tile share in words. */
export const shareName = (size: TileShare) => (size === TILE_ROOM ? "a whole tile" : `1/${TILE_ROOM / size} of a tile`);

/** Palette items the player owns at the very start. */
export const STARTING_OWNED: Record<PaletteItem, number> = {
  cityTile: 8,
  barracks: 1,
  archerBarracks: 0,
  archerTower: 1,
  cannonTower: 0,
  watchTower: 0,
  wizardTower: 0,
  mageGuild: 0,
  valkyriePalace: 0,
};

/** A price in Gold and metal bars (all earned in battle). */
export type Price = { gold: number; copper?: number; silver?: number };

/** Price of buying one more of a palette item, given how many are owned. */
export function purchasePrice(item: PaletteItem, owned: number): Price {
  const extra = Math.max(0, owned - STARTING_OWNED[item]);
  const base: Record<PaletteItem, Price> = {
    cityTile: { gold: 120, copper: 1 },
    barracks: { gold: 300, copper: 3 },
    archerBarracks: { gold: 330, copper: 4 },
    archerTower: { gold: 220, copper: 2 },
    cannonTower: { gold: 340, copper: 5 },
    watchTower: { gold: 180, copper: 2 },
    wizardTower: { gold: 450, copper: 6 },
    mageGuild: { gold: 520, copper: 7 },
    valkyriePalace: { gold: 800, copper: 10, silver: 1 },
  };
  const growth = item === "cityTile" ? 1.3 : 1.5;
  const m = intPow(growth, extra);
  const b = base[item];
  const price: Price = { gold: Math.round(b.gold * m), copper: Math.ceil((b.copper ?? 0) * intPow(1.25, extra)) };
  if (b.silver) price.silver = Math.ceil(b.silver * intPow(1.25, extra));
  return price;
}

export type UpgradeId =
  | "barracksCapacity"
  | "barracksTraining"
  | "soldierArms"
  | "soldierReach"
  | "archerSight"
  | "archerHunt"
  | "archerDamage"
  | "archerRange"
  | "archerRate"
  | "cannonDamage"
  | "cannonRate"
  | "cannonSafe"
  | "bombSafe"
  | "watchRadius"
  | "wizardFlame"
  | "wizardIce"
  | "mageFireball"
  | "mageEmbers"
  | "palaceCompact"
  | "valkyrieReach"
  | "wallStrength"
  | "keepStrength"
  | "civilianCount"
  | "civilianHealth"
  | "rebuildSpeed";

export type UpgradeDef = {
  id: UpgradeId;
  group: string;
  name: string;
  maxLevel: number;
  describe: (level: number) => string;
  /** Overrides the usual escalating price (for special one-offs). */
  price?: (level: number) => Price;
};

/** At the top level of Patrol routes, swordsmen answer anywhere in the city. */
const SOLDIER_REACH_MAX = 4;

export const UPGRADES: UpgradeDef[] = [
  { id: "barracksCapacity", group: "Barracks", name: "Garrison", maxLevel: 4, describe: (l) => `${2 + l} troops per barracks, guild or palace (swordsmen, archers, mages and valkyries)` },
  { id: "barracksTraining", group: "Barracks", name: "Drill yard", maxLevel: 5, describe: (l) => `Train one every ${trainSeconds(l).toFixed(1)}s` },
  { id: "soldierArms", group: "Barracks", name: "Arms & armour", maxLevel: 6, describe: (l) => `+${l * 25}% troop HP and damage` },
  {
    id: "soldierReach",
    group: "Barracks",
    name: "Patrol routes",
    maxLevel: SOLDIER_REACH_MAX,
    describe: (l) => (l >= SOLDIER_REACH_MAX ? "Swordsmen hunt anywhere in the city" : `Swordsmen hunt within ${soldierLeash(l)} cells`),
  },
  { id: "archerSight", group: "Archer barracks", name: "Keen eyes", maxLevel: 4, describe: (l) => `Archers shoot within ${archerUnitRange(l)} cells` },
  {
    id: "archerHunt",
    group: "Archer barracks",
    name: "Hunter's instinct",
    maxLevel: 1,
    describe: (l) => (l ? "Archers track enemies through the streets" : "Archers wander the streets at random"),
    price: () => ({ gold: 1500, copper: 12, silver: 4 }),
  },
  { id: "archerDamage", group: "Archer tower", name: "Bodkin points", maxLevel: 6, describe: (l) => `${archerDamage(l)} damage per arrow` },
  { id: "archerRange", group: "Archer tower", name: "Longbows", maxLevel: 4, describe: (l) => `${archerRange(l)} cell range` },
  { id: "archerRate", group: "Archer tower", name: "Quick nock", maxLevel: 5, describe: (l) => `An arrow every ${archerCooldown(l).toFixed(2)}s` },
  { id: "cannonDamage", group: "Cannon tower", name: "Heavy shot", maxLevel: 5, describe: (l) => `${cannonDamage(l)} blast damage, ${cannonSplash(l).toFixed(1)} cell burst` },
  { id: "cannonRate", group: "Cannon tower", name: "Powder monkeys", maxLevel: 4, describe: (l) => `A shell every ${cannonCooldown(l).toFixed(1)}s` },
  { id: "cannonSafe", group: "Cannon tower", name: "Gunnery drills", maxLevel: 1, describe: (l) => (l ? "Shells spare your own people" : "Shells hurt your own people too") },
  { id: "bombSafe", group: "Consumables", name: "Shaped charges", maxLevel: 1, describe: (l) => (l ? "Bombs spare your own people" : "Bombs hurt your own people too") },
  { id: "watchRadius", group: "Watch tower", name: "Lookouts", maxLevel: 4, describe: (l) => `${watchRadius(l)} cell marking radius` },
  { id: "wizardFlame", group: "Wizard tower", name: "Pyromancy", maxLevel: 5, describe: (l) => `${flameDps(l)} flame damage a second, ${flameRange(l).toFixed(1)} cell reach` },
  { id: "wizardIce", group: "Wizard tower", name: "Rime", maxLevel: 5, describe: (l) => `${iceDamage(l)} ice damage, chills for ${iceChill(l).toFixed(1)}s` },
  { id: "mageFireball", group: "Mage Guild", name: "Pyroclasm", maxLevel: 5, describe: (l) => `${fireballDamage(l)} fireball damage, ${fireballSplash(l).toFixed(1)} cell burst` },
  { id: "mageEmbers", group: "Mage Guild", name: "Lingering embers", maxLevel: 5, describe: (l) => `The ground burns for ${emberSeconds(l).toFixed(1)}s, ${emberDps(l)} damage a second` },
  {
    id: "palaceCompact",
    group: "Valkyrie palace",
    name: "Folded halls",
    maxLevel: 1,
    describe: (l) => `The palace takes ${shareName(l ? 8 : 16)}`,
    price: () => ({ gold: 1200, copper: 10, silver: 3 }),
  },
  { id: "valkyrieReach", group: "Valkyrie palace", name: "Long spears", maxLevel: 5, describe: (l) => `Valkyries charge ${stabLength(l).toFixed(1)} cells` },
  { id: "wallStrength", group: "City", name: "Masonry", maxLevel: 6, describe: (l) => `${wallHp(l)} HP per wall stone` },
  { id: "keepStrength", group: "City", name: "Keep bastions", maxLevel: 6, describe: (l) => `${keepHp(l)} keep HP` },
  { id: "civilianCount", group: "Civilians", name: "Guild of builders", maxLevel: 5, describe: (l) => `${civilianCount(l)} civilians repair the city` },
  { id: "civilianHealth", group: "Civilians", name: "Hardy folk", maxLevel: 5, describe: (l) => `${civilianHp(l)} civilian HP` },
  { id: "rebuildSpeed", group: "Civilians", name: "Master masons", maxLevel: 5, describe: (l) => `${rebuildSeconds(l).toFixed(1)}s to rebuild each section` },
];

export function upgradePrice(level: number): Price {
  return {
    gold: Math.round(200 * intPow(1.6, level)),
    copper: 2 + level * 2,
    silver: level >= 3 ? level - 2 : 0,
  };
}

export const BOMB_PRICE: Price = { gold: 60 };
/** One-off unlock of the 3× battle speed. */
export const SPEED3_PRICE: Price = { gold: 400, copper: 4 };
export const BOMB_RADIUS = 3.2;
export const BOMB_DAMAGE = 45;

// Stat curves, keyed by upgrade level.
export const soldierCap = (l: number) => 2 + l;
export const trainSeconds = (l: number) => 5 * intPow(0.85, l);
export const soldierScale = (l: number) => 1 + l * 0.25;
/** How far from their barracks swordsmen go after enemies (cells). */
export const soldierLeash = (l: number) => (l >= SOLDIER_REACH_MAX ? Infinity : SOLDIER.leash + l * 7);
export const archerDamage = (l: number) => 6 + l * 3;
export const archerRange = (l: number) => 10 + l * 2;
export const archerCooldown = (l: number) => 1.1 * intPow(0.85, l);
export const watchRadius = (l: number) => 8 + l * 2;
export const archerUnitRange = (l: number) => 3 + l;
export const cannonDamage = (l: number) => 20 + l * 9;
export const cannonSplash = (l: number) => 1.7 + l * 0.15;
export const cannonCooldown = (l: number) => 2.8 * intPow(0.86, l);
export const CANNON_RANGE = 11;
/** Share of blast damage your own units take when friendly fire is on. */
export const FRIENDLY_FIRE = 0.6;
/** The wizard tower's flamethrower: damage a second to everything in its
 * cone, its reach (cells), how long a burst lasts and the cone's half-angle. */
export const flameDps = (l: number) => 16 + l * 6;
export const flameRange = (l: number) => 4.5 + l * 0.3;
export const FLAME_SECONDS = 1.6;
/** The cone's half-width as a slope (the tangent of its half-angle, about
 * 22°), so the battle tests it with exact arithmetic. */
export const FLAME_SPREAD = 0.4;
/** The ice wave: damage to everything the front crosses, how long they stay
 * chilled (moving at `CHILL_SPEED` of their pace), its reach, speed (cells a
 * second) and spread. */
export const iceDamage = (l: number) => 14 + l * 6;
export const iceChill = (l: number) => 2 + l * 0.4;
export const CHILL_SPEED = 0.5;
export const ICE_RANGE = 6.5;
export const ICE_SPEED = 7;
/** The ice fan's half-width as a slope (about 36°). */
export const ICE_SPREAD = 0.72;
/** Seconds the tower rests after each attack before the other one. */
export const WIZARD_REST = 1.3;
/** The fire mage's fireball: its damage at the centre of the burst (40% at
 * the edge), the burst's radius, how far a mage throws and how often. It
 * spares your own people. */
export const fireballDamage = (l: number) => 16 + l * 6;
export const fireballSplash = (l: number) => 1.3 + l * 0.12;
export const FIREBALL_RANGE = 4.5;
export const FIREBALL_SPEED = 8;
/** The fire a fireball leaves on the ground: damage a second to every
 * ground enemy inside it, how long it burns, and its radius as a share of
 * the burst's. */
export const emberDps = (l: number) => 6 + l * 3;
export const emberSeconds = (l: number) => 3 + l * 0.6;
export const EMBER_SHARE = 0.85;
/** The valkyrie's charge stab: how far she charges (cells), the damage to
 * every enemy along the line, how wide the line is, and how long she can't
 * be hurt after it. */
export const stabLength = (l: number) => 3 + l * 0.8;
export const STAB_WIDTH = 0.45;
export const STAB_GUARD = 1;
export const wallHp = (l: number) => Math.round(100 * (1 + l * 0.35));
export const keepHp = (l: number) => Math.round(STRUCTURES.keep.maxHp * (1 + l * 0.3));
export const civilianCount = (l: number) => 2 + l;
export const civilianHp = (l: number) => 8 + l * 5;
export const rebuildSeconds = (l: number) => 3 * intPow(0.82, l);
export const HOUSE_HP_PER_CELL = 22;

export type EnemyKind = "roach" | "orc" | "ogre" | "bat" | "warlord" | "mother" | "broodling" | "snake" | "dragon" | "shieldBearer" | "aegis";
export type EnemyDef = {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  cooldown: number;
  /** Rendered edge length, in cells. */
  size: number;
  color: string;
  /** 0–1: how easily nearby houses lure it off the road to smash them. */
  distraction: number;
  flying: boolean;
  /** Boss appearance; spawning is determined solely by difficulty cost. */
  boss?: boolean;
  /** Only ever hatched from another enemy's death, never in a wave's mix. */
  hatched?: boolean;
  /** On death it splits into `count` of `into`, spread around where it fell. */
  splits?: { into: EnemyKind; count: number };
  /** How much of the wave budget one of these costs. */
  cost: number;
  chainLength?: number;
  shield?: { radius: number; hp: number };
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  roach: { kind: "roach", name: "Roach", hp: 10, speed: 2.6, damage: 2, cooldown: 0.6, size: 0.34, color: "#b0643a", distraction: 0.15, flying: false, cost: 1 },
  orc: { kind: "orc", name: "Orc", hp: 34, speed: 1.6, damage: 6, cooldown: 0.9, size: 0.46, color: "#6fa04a", distraction: 0.6, flying: false, cost: 4 },
  ogre: { kind: "ogre", name: "Ogre", hp: 120, speed: 1.0, damage: 18, cooldown: 1.4, size: 0.62, color: "#a08a6a", distraction: 0.35, flying: false, cost: 8 },
  warlord: { kind: "warlord", name: "Warlord", hp: 700, speed: 0.85, damage: 40, cooldown: 1.6, size: 1.05, color: "#b3372f", distraction: 0.1, flying: false, boss: true, cost: 100 },
  mother: { kind: "mother", name: "Mother", hp: 70, speed: 1.15, damage: 8, cooldown: 1.1, size: 0.58, color: "#141218", distraction: 0.3, flying: false, splits: { into: "broodling", count: 3 }, cost: 10 },
  broodling: { kind: "broodling", name: "Broodling", hp: 12, speed: 2.3, damage: 3, cooldown: 0.7, size: 0.3, color: "#1d1a22", distraction: 0.2, flying: false, hatched: true, cost: 1 },
  bat: { kind: "bat", name: "Bat", hp: 14, speed: 3.2, damage: 3, cooldown: 0.7, size: 0.3, color: "#8a5bb8", distraction: 0, flying: true, cost: 2 },
  snake: { kind: "snake", name: "Snake", hp: 24, speed: 1.8, damage: 5, cooldown: 0.8, size: 0.26, color: "#71ae48", distraction: 0, flying: false, chainLength: 12, cost: 60 },
  dragon: { kind: "dragon", name: "Dragon", hp: 160, speed: 1.3, damage: 30, cooldown: 2, size: 0.4, color: "#be4935", distraction: 0, flying: true, chainLength: 16, cost: 2500 },
  shieldBearer: { kind: "shieldBearer", name: "Shield Generator", hp: 800, speed: 0.7, damage: 16, cooldown: 1.5, size: 0.65, color: "#438dcc", distraction: 0, flying: false, shield: { radius: 4, hp: 3000 }, cost: 10000 },
  aegis: { kind: "aegis", name: "Invincible Shield Generator", hp: 6000, speed: 0.55, damage: 40, cooldown: 1.8, size: 0.85, color: "#a383ef", distraction: 0, flying: false, shield: { radius: 5, hp: Infinity }, cost: 1000000 },

};

/** Multipliers the player's Smithy and skill trees lay over a run, on top
 * of the Armory's levels. Each is 1 when nothing is owned, so a run without
 * them plays exactly as before. */
export type Bonuses = {
  /** Swordsmen's and archers' HP. */
  troopHp: number;
  /** Swordsmen's and archers' damage. */
  troopDamage: number;
  /** Seconds a barracks takes to train a recruit. */
  drill: number;
  /** Archer and cannon tower damage. */
  towerDamage: number;
  /** Seconds between tower shots. */
  towerReload: number;
  /** HP of every wall stone. */
  wallHp: number;
  /** The keep's HP. */
  keepHp: number;
  /** Seconds civilians take to rebuild a section. */
  rebuild: number;
  /** Bomb damage. */
  bombDamage: number;
};
export const NO_BONUSES: Readonly<Bonuses> = Object.freeze({
  troopHp: 1, troopDamage: 1, drill: 1, towerDamage: 1, towerReload: 1, wallHp: 1, keepHp: 1, rebuild: 1, bombDamage: 1,
});

export const SOLDIER = { hp: 40, damage: 6, cooldown: 0.8, speed: 2.4, reach: 0.75, leash: 16, size: 0.4, color: "#5b8fd9" };
export const ARCHER_UNIT = { hp: 24, damage: 5, cooldown: 1.1, speed: 2.1, size: 0.36, color: "#6cc08a" };
export const VALKYRIE = { hp: 50, damage: 16, cooldown: 1.8, speed: 2.3, size: 0.44, color: "#f2e6c4" };
export const FIRE_MAGE = { hp: 22, cooldown: 2.1, speed: 2, size: 0.38, color: "#c8372d" };
export const CIVILIAN = { speed: 1.9, size: 0.3, color: "#e6d7b4", respawnSeconds: 10 };
