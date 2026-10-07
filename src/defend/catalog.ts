import { intPow } from "../exact.ts";
import type { BattlePaths } from "../knowledge-paths.ts";

/** Data tables for DEFEND: what the player can place, what it costs in
 * copper, silver and Gold, the universal upgrades, the bonuses the Smithy and the
 * skill trees add, and the enemy roster. */

export type StructureKind = "keep" | "barracks" | "archerBarracks" | "archerTower" | "cannonTower" | "watchTower" | "wizardTower" | "mageGuild" | "valkyriePalace" | "darkKeep" | "monsterBait";
/** Everything that appears in the build palette (the keep is placed from the
 * start and can only be moved, so it is not a palette item). */
export type PaletteItem = "cityTile" | "cityGate" | "wallSpikes" | "wallBallista" | Exclude<StructureKind, "keep">;
export const PALETTE_ITEMS: PaletteItem[] = ["cityTile", "barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower", "wizardTower", "mageGuild", "valkyriePalace", "darkKeep", "monsterBait", "cityGate", "wallSpikes", "wallBallista"];

/** The build palette's categories: what each shows (All shows everything). */
export type PaletteCategory = "all" | "towers" | "units" | "city";
export const PALETTE_CATEGORIES: { id: PaletteCategory; name: string }[] = [
  { id: "all", name: "All" },
  { id: "towers", name: "Towers" },
  { id: "units", name: "Units" },
  { id: "city", name: "City" },
];
/** Which category each palette item belongs to: towers shoot, unit
 * buildings train troops, and the city's own pieces are the rest. */
export const ITEM_CATEGORY: Record<PaletteItem, Exclude<PaletteCategory, "all">> = {
  cityTile: "city",
  cityGate: "city",
  wallSpikes: "city",
  wallBallista: "city",
  monsterBait: "city",
  archerTower: "towers",
  cannonTower: "towers",
  watchTower: "towers",
  wizardTower: "towers",
  barracks: "units",
  archerBarracks: "units",
  mageGuild: "units",
  valkyriePalace: "units",
  darkKeep: "units",
};
export const inCategory = (item: PaletteItem, category: PaletteCategory) => category === "all" || ITEM_CATEGORY[item] === category;

/** The city gate: 3 cells along the wall and its 2 cells deep, worth the
 * wall stones it stands in for, and some. */
export const GATE = { long: 3, deep: 2, hpPerCell: 1.5 };
export const GATE_DESCRIPTION =
  "A gatehouse set into the city wall on the edge of a city tile. It swings open to let your soldiers, archers, mages and townsfolk out and in, and stays barred against the enemy, who must batter it down.";

/** Wall spikes: a row of iron-shod stakes along the outer face of one
 * tile's stretch of wall, pointing out of the city. Every `every` seconds
 * each ground enemy touching a standing stone's stakes takes `damage`. */
export const SPIKES = { damage: 4, every: 0.5 };
export const SPIKES_DESCRIPTION =
  "A row of iron-shod stakes set along the outside of one city tile's stretch of wall, pointing out of the city. Every enemy on foot that presses against them is cut, again and again, while the stones behind them stand.";

/** The wall ballista: a bastion of `size` × `size` cells on a corner of the
 * wall, standing in for its stones, with a great crossbow on top. Its bolt
 * flies `range` cells at `speed`, piercing up to `pierce` enemies. */
export const BALLISTA = { size: 2, hpPerCell: 2, range: 13, cooldown: 2.6, damage: 24, speed: 22, pierce: 4, width: 0.45 };
export const BALLISTA_DESCRIPTION =
  "A great crossbow on a bastion at a corner of the city wall, where the wall turns at a right angle. Its long bolts fly far and pierce a whole file of enemies, and it turns to shoot whatever comes nearest.";

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
  /** How many tiles across (and down) it spans: 2 for a structure that
   * fills a 2 × 2 block of tiles (taking all of each), else 1 (unset). */
  span?: TileSpan;
  /** The smaller footprint and share a building-specific upgrade gives it. */
  compact?: { upgrade: UpgradeId; w: number; h: number; size: TileShare; span?: TileSpan };
  maxHp: number;
  /** Can be placed on ground outside the city limits. */
  outsideOk: boolean;
  description: string;
};

/** Sixteenths of a tile. */
export type TileShare = 1 | 2 | 4 | 8 | 16;
/** Tiles across a structure's block. */
export type TileSpan = 1 | 2;
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
  darkKeep: {
    kind: "darkKeep",
    name: "Dark wizard keep",
    w: 12,
    h: 12,
    size: 16,
    span: 2,
    compact: { upgrade: "darkKeepCompact", w: 5, h: 5, size: 16, span: 1 },
    maxHp: 900,
    outsideOk: false,
    description: "A vast keep of black obsidian and rubies filling a 2 × 2 block of tiles. Its four corner turrets hurl black lightning that leaps from foe to foe, and it summons a dark wizard whose bolts chain through whole crowds.",
  },
  monsterBait: {
    kind: "monsterBait",
    name: "Monster bait",
    w: 2,
    h: 2,
    size: 1,
    maxHp: 300,
    outsideOk: true,
    description: "A stack of crates reeking of monster bait. While any stands, every enemy goes for the nearest one before the keep.",
  },
};

/** A structure's footprint and share of its tile, smaller once its
 * building-specific upgrade is owned (`compact`). */
export function footprint(kind: StructureKind, compact: boolean): { w: number; h: number; size: TileShare; span: TileSpan } {
  const def = STRUCTURES[kind];
  const f = compact && def.compact ? def.compact : def;
  return { w: f.w, h: f.h, size: f.size, span: f.span ?? 1 };
}

/** A tile share in words. */
export const shareName = (size: TileShare) => (size === TILE_ROOM ? "a whole tile" : `1/${TILE_ROOM / size} of a tile`);

/** Palette items the player owns at the very start. */
export const STARTING_OWNED: Record<PaletteItem, number> = {
  cityTile: 8,
  cityGate: 0,
  wallSpikes: 0,
  wallBallista: 0,
  barracks: 1,
  archerBarracks: 0,
  archerTower: 1,
  cannonTower: 0,
  watchTower: 0,
  wizardTower: 0,
  mageGuild: 0,
  valkyriePalace: 0,
  darkKeep: 0,
  monsterBait: 0,
};

/** A Forge price in the mine's metal: copper, silver and gold points (the
 * smithy makes one of a metal from every `BARS_PER_POINT` bars). */
export type Price = { copper?: number; silver?: number; gold?: number };

/** Price of buying one more of a palette item, given how many are owned. */
export function purchasePrice(item: PaletteItem, owned: number): Price {
  const extra = Math.max(0, owned - STARTING_OWNED[item]);
  const base: Record<PaletteItem, Price> = {
    cityTile: { copper: 2 },
    cityGate: { copper: 4 },
    wallSpikes: { copper: 3 },
    wallBallista: { copper: 6 },
    barracks: { copper: 4 },
    archerBarracks: { copper: 5 },
    archerTower: { copper: 3 },
    cannonTower: { copper: 6 },
    watchTower: { copper: 3 },
    wizardTower: { copper: 8 },
    mageGuild: { copper: 9 },
    valkyriePalace: { copper: 12, silver: 2 },
    darkKeep: { copper: 25, silver: 8, gold: 2 },
    monsterBait: { copper: 3 },
  };
  const b = base[item], up = (n = 0, growth = 1.25) => Math.ceil(n * intPow(growth, extra));
  const price: Price = { copper: up(b.copper, item === "cityTile" ? 1.2 : 1.3) };
  if (b.silver) price.silver = up(b.silver);
  if (b.gold) price.gold = up(b.gold);
  return price;
}

/** What each palette item is called on the page. */
export const ITEM_NAMES: Record<PaletteItem, string> = {
  cityTile: "City tile",
  cityGate: "City gate",
  wallSpikes: "Wall spikes",
  wallBallista: "Wall ballista",
  barracks: STRUCTURES.barracks.name,
  archerBarracks: STRUCTURES.archerBarracks.name,
  archerTower: STRUCTURES.archerTower.name,
  cannonTower: STRUCTURES.cannonTower.name,
  watchTower: STRUCTURES.watchTower.name,
  wizardTower: STRUCTURES.wizardTower.name,
  mageGuild: STRUCTURES.mageGuild.name,
  valkyriePalace: STRUCTURES.valkyriePalace.name,
  darkKeep: STRUCTURES.darkKeep.name,
  monsterBait: STRUCTURES.monsterBait.name,
};

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
  | "darkKeepCompact"
  | "chainReach"
  | "chainCount"
  | "baitRestock"
  | "baitBlast"
  | "spikeDamage"
  | "spikeRate"
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

/** Conduit of night's top level: the dark wizard's bolts reach 250 enemies. */
const CHAIN_COUNT_MAX = 20;

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
    price: () => ({ copper: 12, silver: 4 }),
  },
  { id: "archerDamage", group: "Archer tower", name: "Bodkin points", maxLevel: 6, describe: (l) => `${archerDamage(l)} damage per arrow` },
  { id: "archerRange", group: "Archer tower", name: "Longbows", maxLevel: 4, describe: (l) => `${archerRange(l)} cell range` },
  { id: "archerRate", group: "Archer tower", name: "Quick nock", maxLevel: 5, describe: (l) => `An arrow every ${archerCooldown(l).toFixed(2)}s` },
  { id: "cannonDamage", group: "Cannon tower", name: "Heavy shot", maxLevel: 5, describe: (l) => `${cannonDamage(l)} blast damage, ${cannonSplash(l).toFixed(1)} cell burst` },
  { id: "cannonRate", group: "Cannon tower", name: "Powder monkeys", maxLevel: 4, describe: (l) => `A shell every ${cannonCooldown(l).toFixed(1)}s` },
  { id: "cannonSafe", group: "Cannon tower", name: "Gunnery drills", maxLevel: 1, describe: (l) => (l ? "Shells spare your own people" : "Shells hurt your own people too") },
  { id: "bombSafe", group: "Consumables", name: "Shaped charges", maxLevel: 1, describe: (l) => (l ? "Bombs spare your own people" : "Bombs hurt your own people too") },
  { id: "watchRadius", group: "Watch tower", name: "Lookouts", maxLevel: 4, describe: (l) => `${watchRadius(l)} cell marking radius` },
  { id: "wizardFlame", group: "Wizard tower", name: "Flamethrower", maxLevel: 5, describe: (l) => `${flameDps(l)} flame damage a second, ${flameRange(l).toFixed(1)} cell reach` },
  { id: "wizardIce", group: "Wizard tower", name: "Ice wave", maxLevel: 5, describe: (l) => `${iceDamage(l)} ice damage, chills for ${iceChill(l).toFixed(1)}s` },
  { id: "mageFireball", group: "Mage Guild", name: "Pyroclasm", maxLevel: 5, describe: (l) => `${fireballDamage(l)} fireball damage, ${fireballSplash(l).toFixed(1)} cell burst` },
  { id: "mageEmbers", group: "Mage Guild", name: "Lingering embers", maxLevel: 5, describe: (l) => `The ground burns for ${emberSeconds(l).toFixed(1)}s, ${emberDps(l)} damage a second` },
  {
    id: "palaceCompact",
    group: "Valkyrie palace",
    name: "Folded halls",
    maxLevel: 1,
    describe: (l) => `The palace takes ${shareName(l ? 8 : 16)}`,
    price: () => ({ copper: 10, silver: 3 }),
  },
  { id: "valkyrieReach", group: "Valkyrie palace", name: "Long spears", maxLevel: 5, describe: (l) => `Valkyries charge ${stabLength(l).toFixed(1)} cells` },
  {
    id: "darkKeepCompact",
    group: "Dark wizard keep",
    name: "Folded sanctum",
    maxLevel: 1,
    describe: (l) => (l ? "The keep takes a single tile" : "The keep takes a 2 × 2 block of tiles"),
    price: () => ({ copper: 45, silver: 20, gold: 3 }),
  },
  { id: "chainReach", group: "Dark wizard keep", name: "Arc span", maxLevel: 5, describe: (l) => `Black lightning leaps ${chainJump(l).toFixed(2)} cells between enemies` },
  {
    id: "chainCount",
    group: "Dark wizard keep",
    name: "Conduit of night",
    maxLevel: CHAIN_COUNT_MAX,
    describe: (l) => `The dark wizard's bolts chain to ${wizardChain(l)} enemies, the turrets' to ${turretChain(l)}`,
    price: (l) => ({ copper: 4 + l, silver: 1 + Math.floor(l / 3), gold: Math.floor(l / 5) }),
  },
  {
    id: "baitRestock",
    group: "Monster bait",
    name: "Restocking",
    maxLevel: 5,
    describe: (l) => (l ? `Civilians restock fallen bait ${l === 1 ? "once" : `${l} times`} a defense` : "Fallen bait stays fallen"),
  },
  {
    id: "baitBlast",
    group: "Monster bait",
    name: "Powder kegs",
    maxLevel: 5,
    describe: (l) =>
      l ? `Fallen bait bursts for ${baitBlastDamage(l)} damage over ${baitBlastRadius(l).toFixed(1)} cells, the ground burning ${baitFireSeconds(l).toFixed(1)}s` : "Fallen bait just falls",
  },
  { id: "spikeDamage", group: "Wall spikes", name: "Iron-shod stakes", maxLevel: 6, describe: (l) => `The stakes cut for ${spikeDamage(l)} damage` },
  { id: "spikeRate", group: "Wall spikes", name: "Barbed edges", maxLevel: 4, describe: (l) => `The stakes cut every ${spikeEvery(l).toFixed(2)}s` },
  { id: "wallStrength", group: "City", name: "Masonry", maxLevel: 6, describe: (l) => `${wallHp(l)} HP per wall stone` },
  { id: "keepStrength", group: "City", name: "Keep bastions", maxLevel: 6, describe: (l) => `${keepHp(l)} keep HP` },
  { id: "civilianCount", group: "Civilians", name: "Guild of builders", maxLevel: 5, describe: (l) => `${civilianCount(l)} civilians repair the city` },
  { id: "civilianHealth", group: "Civilians", name: "Hardy folk", maxLevel: 5, describe: (l) => `${civilianHp(l)} civilian HP` },
  { id: "rebuildSpeed", group: "Civilians", name: "Master masons", maxLevel: 5, describe: (l) => `${rebuildSeconds(l).toFixed(1)}s to rebuild each section` },
];

/** A level's usual Forge price: copper, then silver from the fourth level
 * and gold from the sixth. */
export function upgradePrice(level: number): Price {
  return {
    copper: 2 + level * 2,
    silver: level >= 3 ? level - 2 : 0,
    gold: level >= 5 ? level - 4 : 0,
  };
}

/** A bomb costs battle Gold, not metal: it is spent, not kept. */
export const BOMB_GOLD = 60;
/** One-off unlock of the 3× battle speed. */
export const SPEED3_PRICE: Price = { copper: 4 };
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
/** What wall spikes cut for, and how often they cut. */
export const spikeDamage = (l: number) => SPIKES.damage + l * 3;
export const spikeEvery = (l: number) => SPIKES.every * intPow(0.85, l);
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
/** Black lightning, from the dark wizard keep's corner turrets and its dark
 * wizard: each bolt strikes its target, then leaps to the nearest enemy not
 * yet struck within `chainJump` cells (enemies must be packed close), and so
 * on, up to its chain's length. Every enemy struck takes the bolt's damage. */
export const chainJump = (l: number) => 0.7 + l * 0.2;
export const wizardChain = (l: number) => 50 + l * 10;
export const turretChain = (l: number) => 5 + l;
/** The dark keep's corner turrets: range (cells), damage and seconds
 * between bolts. */
export const TURRET = { range: 7.5, damage: 12, cooldown: 1.2 };
/** How far in from the dark keep's sides its corner turrets stand, as a
 * share of its width; `turretSpots` gives their centres. */
export const TURRET_INSET = 0.14;
export function turretSpots(r: { x: number; y: number; w: number; h: number }) {
  const ix = r.w * TURRET_INSET, iy = r.h * TURRET_INSET;
  return [
    { x: r.x + ix, y: r.y + iy },
    { x: r.x + r.w - ix, y: r.y + iy },
    { x: r.x + ix, y: r.y + r.h - iy },
    { x: r.x + r.w - ix, y: r.y + r.h - iy },
  ];
}
/** Monster bait's powder kegs: the burst when a stack falls (spares your
 * own people), its radius, and the burning ground it leaves: damage a
 * second to ground enemies, and how long it burns. */
export const baitBlastDamage = (l: number) => 30 + l * 15;
export const baitBlastRadius = (l: number) => 1.8 + l * 0.2;
export const baitFireDps = (l: number) => 8 + l * 4;
export const baitFireSeconds = (l: number) => 3 + l;
export const wallHp = (l: number) => Math.round(100 * (1 + l * 0.35));
export const keepHp = (l: number) => Math.round(STRUCTURES.keep.maxHp * (1 + l * 0.3));
export const civilianCount = (l: number) => 2 + l;
export const civilianHp = (l: number) => 8 + l * 5;
export const rebuildSeconds = (l: number) => 3 * intPow(0.82, l);
export const HOUSE_HP_PER_CELL = 22;

export type EnemyKind = "iceGolem" | "iceCube" | "roach" | "orc" | "ogre" | "bat" | "warlord" | "mother" | "broodling" | "snake" | "dragon" | "shieldBearer" | "aegis" | "darkKnight" | "bombOrc" | "bombBird" | "voidSparrow" | "shieldLesser" | "shieldGreater" | "poisonLesser" | "poisonBearer" | "poisonGreater" | "poisonSovereign" | "siegeBeetle" | "burrowingMole" | "necromancer" | "skeleton" | "bannerCaptain" | "mirrorKnight" | "leechSwarm" | "ashPhoenix" | "phoenixEgg" | "blinkImp" | "fortressHut" | "fortressOutpost" | "fortressTower" | "fortressKeep" | "fortressLesser" | "fortress" | "fortressGreater" | "fortressSovereign" | "rollingCannon" | "ballista" | "fireworkLauncher" | "trebuchet" | "bombard" | "rocketBattery" | "boatDinghy" | "boatSailboat" | "boatCutter" | "boatCog" | "boatLesser" | "boat" | "boatGreater" | "boatSovereign";
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
  /** Body width and height in the city art's eight-pixels-per-cell grid. */
  bodyPixels?: number;
  summonSlots?: number;
  fortress?: { tier: number; turrets: number; legs: number; armor: number; height: number; partHp: number; partScale?: number };
  poison?: { radius: number; damage: number; lethal?: boolean; color: string };
  unyielding?: boolean;
  chainLength?: number;
  shield?: { radius: number; hp: number };
  /** A self-driving siege engine (`siege.ts`): it rolls toward the keep and
   * stops to bombard whatever stands in its way from `range` cells. */
  siege?: SiegeDef;
  /** A magic boat (`boats.ts`): it sails straight through the ground toward
   * the keep in a pool of its own water. Small boats' water is decorative. */
  boat?: BoatDef;
};

/** A magic boat's water: its radius in cells around the hull, and what it
 * sinks besides houses and structures: wall stones (`walls`) and the keep
 * (`keep`). Small boats use `decorativeWater` for a purely visual wake.
 * Whatever it can't sink, it rams with its own damage. */
export type BoatDef = { tier: number; water: number; walls?: boolean; keep?: boolean; decorativeWater?: boolean };

/** How a siege engine shoots. `ball`: a lobbed iron ball, `stone`: a high
 * lobbed boulder, both bursting in `radius`; `bolt`: a straight bolt that
 * runs through every defender on its line; `rocket`: a volley of `volley`
 * fireworks scattered up to `spread` cells round the target, each bursting
 * in `radius`. `people` engines shoot defenders before buildings. `damage`
 * and `cooldown` are the enemy's own (per rocket, per volley). */
export type SiegeDef = { shot: "ball" | "stone" | "bolt" | "rocket"; range: number; radius: number; volley?: number; spread?: number; people?: boolean };

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  iceGolem: { kind: "iceGolem", name: "Ice Golem", hp: 240, speed: .65, damage: 16, cooldown: 1.5, size: .9, color: "#a4def1", distraction: 0, flying: false, cost: 80 },
  iceCube: { kind: "iceCube", name: "Sliding Ice Cube", hp: 45, speed: 3.6, damage: 8, cooldown: .9, size: .65, color: "#7fcae5", distraction: 0, flying: false, cost: 10 },
  roach: { kind: "roach", name: "Roach", hp: 10, speed: 2.6, damage: 2, cooldown: 0.6, size: 0.34, color: "#b0643a", distraction: 0.15, flying: false, cost: 1 },
  orc: { kind: "orc", name: "Orc", hp: 34, speed: 1.6, damage: 6, cooldown: 0.9, size: 0.46, color: "#6fa04a", distraction: 0.6, flying: false, cost: 4 },
  ogre: { kind: "ogre", name: "Ogre", hp: 120, speed: 1.0, damage: 18, cooldown: 1.4, size: 0.62, color: "#a08a6a", distraction: 0.35, flying: false, cost: 8 },
  warlord: { kind: "warlord", name: "Warlord", hp: 700, speed: 0.85, damage: 40, cooldown: 1.6, size: 1.05, color: "#b3372f", distraction: 0.1, flying: false, boss: true, cost: 100 },
  mother: { kind: "mother", name: "Mother", hp: 70, speed: 1.15, damage: 8, cooldown: 1.1, size: 0.58, color: "#141218", distraction: 0.3, flying: false, splits: { into: "broodling", count: 3 }, cost: 10 },
  broodling: { kind: "broodling", name: "Broodling", hp: 12, speed: 2.3, damage: 3, cooldown: 0.7, size: 0.3, color: "#1d1a22", distraction: 0.2, flying: false, hatched: true, cost: 1 },
  bat: { kind: "bat", name: "Bat", hp: 14, speed: 3.2, damage: 3, cooldown: 0.7, size: 0.3, color: "#8a5bb8", distraction: 0, flying: true, cost: 2 },
  snake: { kind: "snake", name: "Snake", hp: 24, speed: 1.8, damage: 5, cooldown: 0.8, size: 0.26, color: "#71ae48", distraction: 0, flying: false, chainLength: 12, cost: 60 },
  dragon: { kind: "dragon", name: "Dragon", hp: 160, speed: 1.3, damage: 30, cooldown: 2, size: 0.4, color: "#be4935", distraction: 0, flying: true, chainLength: 16, cost: 2500 },
  shieldBearer: { kind: "shieldBearer", name: "Shield Generator", hp: 800, speed: 0.7, damage: 16, cooldown: 1.5, size: 5 / 8, bodyPixels: 5, color: "#438dcc", distraction: 0, flying: false, shield: { radius: 4, hp: 3000 }, cost: 10000 },
  aegis: { kind: "aegis", name: "Invincible Shield Generator", hp: 6000, speed: 0.55, damage: 40, cooldown: 1.8, size: 9 / 8, bodyPixels: 9, color: "#a383ef", distraction: 0, flying: false, shield: { radius: 8, hp: Infinity }, cost: 1000000 },

  darkKnight: { kind: "darkKnight", name: "Dark Knight", hp: 450, speed: 1, damage: 35, cooldown: 1.5, size: 0.55, color: "#29243b", distraction: 0, flying: false, unyielding: true, cost: 500 },
  bombOrc: { kind: "bombOrc", name: "Kamikaze Orc", hp: 45, speed: 2, damage: 100, cooldown: 1, size: 0.46, color: "#74a04c", distraction: 0, flying: false, cost: 120 },
  bombBird: { kind: "bombBird", name: "Kamikaze Bird", hp: 25, speed: 3.5, damage: 150, cooldown: 1, size: 0.3, color: "#c47a3e", distraction: 0, flying: true, cost: 350 },
  voidSparrow: { kind: "voidSparrow", name: "Void Sparrow", hp: 12000, speed: 1.2, damage: 300, cooldown: 15, size: 0.45, color: "#33214f", distraction: 0, flying: true, cost: 5000000 },

  shieldLesser: { kind: "shieldLesser", name: "Lesser Shield Generator", hp: 200, speed: 0.8, damage: 8, cooldown: 1.5, size: 3 / 8, bodyPixels: 3, color: "#5aacd8", distraction: 0, flying: false, shield: { radius: 2, hp: 600 }, cost: 1000 },
  shieldGreater: { kind: "shieldGreater", name: "Greater Shield Generator", hp: 2400, speed: 0.6, damage: 28, cooldown: 1.5, size: 7 / 8, bodyPixels: 7, color: "#6865d9", distraction: 0, flying: false, shield: { radius: 6, hp: 12000 }, cost: 100000 },
  poisonLesser: { kind: "poisonLesser", name: "Lesser Poison Generator", hp: 200, speed: 0.8, damage: 8, cooldown: 1.5, size: 3 / 8, bodyPixels: 3, color: "#65bc57", distraction: 0, flying: false, poison: { radius: 2, damage: 2, color: "#65c64a" }, cost: 1000 },
  poisonBearer: { kind: "poisonBearer", name: "Poison Generator", hp: 800, speed: 0.7, damage: 16, cooldown: 1.5, size: 5 / 8, bodyPixels: 5, color: "#819d74", distraction: 0, flying: false, poison: { radius: 4, damage: 8, color: "#8aaa6a" }, cost: 10000 },
  poisonGreater: { kind: "poisonGreater", name: "Greater Poison Generator", hp: 2400, speed: 0.6, damage: 28, cooldown: 1.5, size: 7 / 8, bodyPixels: 7, color: "#a66fc6", distraction: 0, flying: false, poison: { radius: 6, damage: 32, color: "#ad70ce" }, cost: 100000 },
  poisonSovereign: { kind: "poisonSovereign", name: "Lethal Poison Generator", hp: 6000, speed: 0.55, damage: 40, cooldown: 1.5, size: 9 / 8, bodyPixels: 9, color: "#d55af0", distraction: 0, flying: false, poison: { radius: 8, damage: 0, lethal: true, color: "#d55af0" }, cost: 1000000 },

  siegeBeetle: { kind: "siegeBeetle", name: "Siege Beetle", hp: 600, speed: 0.8, damage: 25, cooldown: 1, size: 0.7, color: "#827c48", distraction: 0, flying: false,  cost: 400 },
  burrowingMole: { kind: "burrowingMole", name: "Burrowing Mole", hp: 100, speed: 1.5, damage: 10, cooldown: 1, size: 0.4, color: "#9c7653", distraction: 0, flying: false,  cost: 200 },
  necromancer: { kind: "necromancer", name: "Necromancer", hp: 160, speed: 1, damage: 8, cooldown: 1, size: 0.45, color: "#5b447f", distraction: 0, flying: false, summonSlots: 5, cost: 800 },
  skeleton: { kind: "skeleton", name: "Raised Skeleton", hp: 20, speed: 1.5, damage: 4, cooldown: 1, size: 0.3, color: "#d7ccb2", distraction: 0, flying: false, hatched: true, cost: 1 },
  bannerCaptain: { kind: "bannerCaptain", name: "Banner Captain", hp: 250, speed: 1.2, damage: 15, cooldown: 1, size: 0.5, color: "#984047", distraction: 0, flying: false,  cost: 700 },
  mirrorKnight: { kind: "mirrorKnight", name: "Mirror Knight", hp: 350, speed: 1.1, damage: 20, cooldown: 1, size: 0.55, color: "#9ba8bf", distraction: 0, flying: false,  cost: 600 },
  leechSwarm: { kind: "leechSwarm", name: "Leech Swarm", hp: 90, speed: 2.2, damage: 12, cooldown: 1, size: 0.4, color: "#80456b", distraction: 0, flying: false,  cost: 150 },
  ashPhoenix: { kind: "ashPhoenix", name: "Ash Phoenix", hp: 300, speed: 2, damage: 22, cooldown: 1, size: 0.5, color: "#d97532", distraction: 0, flying: true, summonSlots: 3, cost: 1200 },
  phoenixEgg: { kind: "phoenixEgg", name: "Phoenix Egg", hp: 60, speed: 0, damage: 0, cooldown: 1, size: 0.4, color: "#dfac6e", distraction: 0, flying: false, hatched: true, cost: 1 },
  blinkImp: { kind: "blinkImp", name: "Blink Imp", hp: 70, speed: 1.7, damage: 9, cooldown: 1, size: 0.3, color: "#9874bf", distraction: 0, flying: false,  cost: 250 },

  fortressHut: { kind: "fortressHut", name: "Walking Watchpost", hp: 16, speed: 1.1, damage: 2, cooldown: 1.6, size: 1, color: "#80634c", distraction: 0, flying: false, fortress: { tier: 1, turrets: 1, legs: 2, armor: 1, height: 1.25, partHp: 3, partScale: .5 }, cost: 5 },
  fortressOutpost: { kind: "fortressOutpost", name: "Walking Outpost", hp: 28, speed: 1, damage: 3, cooldown: 1.6, size: 1.25, color: "#80634c", distraction: 0, flying: false, fortress: { tier: 1, turrets: 1, legs: 2, armor: 1, height: 1.5, partHp: 6, partScale: .625 }, cost: 10 },
  fortressTower: { kind: "fortressTower", name: "Walking Fortlet", hp: 90, speed: .9, damage: 7, cooldown: 1.6, size: 1.75, color: "#80634c", distraction: 0, flying: false, fortress: { tier: 1, turrets: 2, legs: 4, armor: 2, height: 2, partHp: 18, partScale: .75 }, cost: 50 },
  fortressKeep: { kind: "fortressKeep", name: "Walking Stronghold", hp: 180, speed: .8, damage: 12, cooldown: 1.6, size: 2, color: "#80634c", distraction: 0, flying: false, fortress: { tier: 1, turrets: 2, legs: 4, armor: 2, height: 2.5, partHp: 35, partScale: .875 }, cost: 100 },
  fortressLesser: { kind: "fortressLesser", name: "Walking Bastion", hp: 1200, speed: .7, damage: 25, cooldown: 1.6, size: 2.5, color: "#80634c", distraction: 0, flying: false, fortress: { tier: 1, turrets: 2, legs: 4, armor: 2, height: 3, partHp: 160 }, cost: 1000 },
  fortress: { kind: "fortress", name: "Living Fortress", hp: 6000, speed: .65, damage: 70, cooldown: 1.6, size: 3.5, color: "#7e6662", distraction: 0, flying: false, fortress: { tier: 2, turrets: 4, legs: 6, armor: 4, height: 4, partHp: 700 }, cost: 10000 },
  fortressGreater: { kind: "fortressGreater", name: "Walking Citadel", hp: 30000, speed: .6, damage: 200, cooldown: 1.6, size: 4.5, color: "#625674", distraction: 0, flying: false, fortress: { tier: 3, turrets: 6, legs: 8, armor: 6, height: 5, partHp: 3000 }, cost: 100000 },
  fortressSovereign: { kind: "fortressSovereign", name: "Dread Colossus", hp: 150000, speed: .55, damage: 600, cooldown: 1.6, size: 5.5, color: "#4c3d5c", distraction: 0, flying: false, fortress: { tier: 4, turrets: 8, legs: 10, armor: 8, height: 6, partHp: 12000 }, cost: 1000000 },

  rollingCannon: { kind: "rollingCannon", name: "Rolling Cannon", hp: 90, speed: 1, damage: 22, cooldown: 3, size: 1, color: "#7e5230", distraction: 0, flying: false, siege: { shot: "ball", range: 5, radius: 0.7 }, cost: 80 },
  ballista: { kind: "ballista", name: "Ballista", hp: 70, speed: 1.1, damage: 40, cooldown: 2.6, size: 1, color: "#8a5a32", distraction: 0, flying: false, siege: { shot: "bolt", range: 7, radius: 0.35, people: true }, cost: 120 },
  fireworkLauncher: { kind: "fireworkLauncher", name: "Firework Launcher", hp: 80, speed: 1.15, damage: 9, cooldown: 4, size: 1, color: "#9a3a2a", distraction: 0, flying: false, siege: { shot: "rocket", range: 6, radius: 0.55, volley: 6, spread: 1.3 }, cost: 200 },
  trebuchet: { kind: "trebuchet", name: "Trebuchet", hp: 900, speed: 0.6, damage: 130, cooldown: 7, size: 1.55, color: "#6e4a2a", distraction: 0, flying: false, siege: { shot: "stone", range: 11, radius: 1.4 }, cost: 2500 },
  bombard: { kind: "bombard", name: "Great Bombard", hp: 2600, speed: 0.6, damage: 220, cooldown: 5, size: 1.4, color: "#4a4e57", distraction: 0, flying: false, siege: { shot: "ball", range: 9, radius: 1.9 }, cost: 12000 },
  rocketBattery: { kind: "rocketBattery", name: "Dragonfire Battery", hp: 2000, speed: 0.7, damage: 35, cooldown: 6, size: 1.4, color: "#8c2a24", distraction: 0, flying: false, siege: { shot: "rocket", range: 10, radius: 0.9, volley: 16, spread: 3 }, cost: 30000 },

  boatDinghy: { kind: "boatDinghy", name: "Runed Dinghy", hp: 20, speed: 1.3, damage: 3, cooldown: 1.2, size: .6, color: "#6d4a2c", distraction: 0, flying: false, boat: { tier: 1, water: .8, decorativeWater: true }, cost: 5 },
  boatSailboat: { kind: "boatSailboat", name: "Charmbound Sailboat", hp: 35, speed: 1.15, damage: 5, cooldown: 1.2, size: .8, color: "#5a3e28", distraction: 0, flying: false, boat: { tier: 2, water: 1, decorativeWater: true }, cost: 10 },
  boatCutter: { kind: "boatCutter", name: "Mystic Cutter", hp: 110, speed: 1, damage: 10, cooldown: 1.2, size: 1, color: "#46302a", distraction: 0, flying: false, boat: { tier: 3, water: 1.2, decorativeWater: true }, cost: 50 },
  boatCog: { kind: "boatCog", name: "Arcane Cog", hp: 210, speed: .9, damage: 16, cooldown: 1.2, size: 1.2, color: "#2a2230", distraction: 0, flying: false, boat: { tier: 4, water: 1.4, decorativeWater: true }, cost: 100 },
  boatLesser: { kind: "boatLesser", name: "Enchanted Skiff", hp: 1500, speed: 0.75, damage: 40, cooldown: 1.2, size: 1.4, color: "#6d4a2c", distraction: 0, flying: false, boat: { tier: 1, water: 1.6 }, cost: 1000 },
  boat: { kind: "boat", name: "Spellbound Sloop", hp: 7000, speed: 0.7, damage: 120, cooldown: 1.2, size: 2, color: "#5a3e28", distraction: 0, flying: false, boat: { tier: 2, water: 2.4 }, cost: 10000 },
  boatGreater: { kind: "boatGreater", name: "Arcane Galleon", hp: 35000, speed: 0.62, damage: 300, cooldown: 1.2, size: 2.8, color: "#46302a", distraction: 0, flying: false, boat: { tier: 3, water: 3.3, walls: true }, cost: 100000 },
  boatSovereign: { kind: "boatSovereign", name: "Deluge Ark", hp: 160000, speed: 0.55, damage: 800, cooldown: 1.2, size: 3.8, color: "#2a2230", distraction: 0, flying: false, boat: { tier: 4, water: 4.4, walls: true, keep: true }, cost: 1000000 },
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
  /** The Study's paths each topic follows (`knowledge-paths.ts`); absent
   * with none chosen, so such a run plays exactly as before. */
  paths?: BattlePaths;
};
export const NO_BONUSES: Readonly<Bonuses> = Object.freeze({
  troopHp: 1, troopDamage: 1, drill: 1, towerDamage: 1, towerReload: 1, wallHp: 1, keepHp: 1, rebuild: 1, bombDamage: 1,
});

export const SOLDIER = { hp: 40, damage: 6, cooldown: 0.8, speed: 2.4, reach: 0.75, leash: 16, size: 0.4, color: "#5b8fd9" };
export const ARCHER_UNIT = { hp: 24, damage: 5, cooldown: 1.1, speed: 2.1, size: 0.36, color: "#6cc08a" };
export const VALKYRIE = { hp: 50, damage: 16, cooldown: 1.8, speed: 2.3, size: 0.44, color: "#f2e6c4" };
/** The dark wizard, the keep's one ultimate unit: slow to summon (`drill`
 * times a barracks' drill), casting a bolt of black lightning within
 * `range` cells every `cooldown` seconds. */
export const DARK_WIZARD = { hp: 160, damage: 30, cooldown: 1.6, speed: 1.9, size: 0.5, range: 6, garrison: 1, drill: 3, color: "#2a1418" };
export const FIRE_MAGE = { hp: 22, cooldown: 2.1, speed: 2, size: 0.38, color: "#c8372d" };
export const CIVILIAN = { speed: 1.9, size: 0.3, color: "#e6d7b4", respawnSeconds: 10 };

/** Multipart forts share a species, but each part has its own hitbox. */
export const enemySize = (e: { kind: EnemyKind; fortressPart?: { role: string } }) =>
  e.fortressPart ? (e.fortressPart.role === "leg" ? .4 : .6) * (ENEMIES[e.kind].fortress?.partScale ?? 1) : ENEMIES[e.kind].size;
