/** Collection-wide Knowledge unlocks; persistent cards equip researched ranks independently. */
import type { PaletteItem } from "./defend/catalog.ts";
import type { PlacedKind } from "./defend/layout.ts";
import { followResearch, syncCards } from "./cards.ts";
import type { Save } from "./save.ts";
import { studyPathCost } from "./economy.ts";

export type PathTopic = "wizardTower" | "barracks" | "archerTower" | "cannonTower" | "archerBarracks" | "watchTower" | "mageGuild" | "bait" | "spikes" | SpellId;
/** Strike spells: cast from the battle's Skills palette rather than built,
 * so a spell has no cards; it casts with the one path `save.spellPaths`
 * names, at its furthest researched rank. */
export type SpellId = "necromancy";
export const SPELLS: SpellId[] = ["necromancy"];
export const isSpell = (topic: string): topic is SpellId => (SPELLS as string[]).includes(topic);
export type PathId =
  | "pyromancy" | "rime" | "storm" | "crusaders" | "assassins"
  | "fireArrows" | "sharpshooters" | "gunnery" | "siegeShot" | "rangers" | "skirmishers"
  | "spotters" | "signalFires" | "pyroclasm" | "cinders" | "oilSoaked" | "fortified"
  | "blastStakes" | "springStakes" | "rimeStakes"
  | "boneArchers" | "soulWeighing" | "amalgam";
/** The pixel icons `ui/path-icons.ts` draws, one a rank. */
export type PathIcon =
  | "flame" | "tongue" | "inferno" | "snowflake" | "shard" | "iceBlock" | "bolt" | "fork" | "thunderhead"
  | "mail" | "heart" | "cross" | "boot" | "dagger" | "skull" | "crown"
  | "arrow" | "fireArrow" | "volley" | "eye" | "crosshair" | "gear" | "grape" | "cannonball" | "blast" | "bow" | "leaf"
  | "spyglass" | "beacon" | "crate" | "fireball" | "embers" | "stake" | "spring"
  | "bone" | "scales" | "tombstone" | "hand";
/** Each path's colours, as `ui/path-icons.ts` and the page's CSS name them. */
export type PathHue = "ember" | "frost" | "storm" | "steel" | "shadow" | "verdant" | "grave";
export type PathRank = { name: string; icon: PathIcon; cost: number; text: string };
export type KnowledgePath = {
  id: PathId;
  topic: PathTopic;
  name: string;
  /** One line on what the path makes of the building. */
  motto: string;
  hue: PathHue;
  ranks: PathRank[];
  /** The evolution unlocked by this path's crown research. */
  evolves?: { from: PlacedKind; item: PlacedKind; name: string; cost: number; text: string };
};

// ── What each rank does in battle ─────────────────────────────────────────
/** Pyromancy: flames only, hotter (by rank), longer from II, burning longer at III. */
export const PYRO = { damage: [1, 1.3, 1.3, 1.8], reach: 1.5, burn: 1.5 };
/** Rime: ice only, chill lasting longer; harder and further from II;
 * freezing solid at III for `freeze` seconds. */
export const RIME = { chill: 1.5, damage: 1.6, reach: 1.5, freeze: 1.2 };
/** Stormcalling: a chain bolt in place of each flame, striking up to
 * `links[rank]` enemies `jump[rank]` cells apart for `damage` times the
 * flame's damage a second, half again at III. */
export const STORM = { links: [0, 3, 5, 7], jump: [0, 2.5, 3, 3.5], damage: 1.2, surge: 1.5 };
/** Crusaders: heavier (HP by rank, slower), healing from II, harder hitting at III. */
export const CRUSADE = { hp: [1, 1.5, 1.5, 2.2], speed: 0.85, heal: 3, damage: 1.5 };
/** Assassins: faster and frailer, every `every[rank]`th strike critical for
 * `crit` times the damage; quicker strokes from II, the whole city their
 * hunting ground at III. */
export const ASSASSIN = { speed: 1.3, hp: 0.8, every: [0, 4, 3, 2], crit: 3, cooldown: 0.75 };
/** Fire arrows: an archer tower's arrows set what they hit burning for
 * `burn[rank]` seconds at `share[rank]` of the arrow's damage a second; at
 * III it looses `volley` arrows at once, each at another of the nearest. */
export const FIRE_ARROWS = { burn: [0, 3, 4, 4], share: [0, 0.4, 0.8, 0.8], volley: 3 };
/** Sharpshooters: `range` more cells; from II every `every`th arrow is
 * critical for `crit` times the damage; at III `damage` times the damage,
 * aimed at the strongest enemy in reach. */
export const SHARP = { range: 2, every: 3, crit: 3, damage: 1.6 };
/** Gun crews: a cannon reloads in `reload[rank]` of the time; from II each
 * shell bursts into `grape` bomblets round it (`grapeShare` of the damage,
 * `grapeR` of the radius). */
export const GUNNERY = { reload: [1, 0.75, 0.75, 0.5], grape: 4, grapeShare: 0.35, grapeR: 0.5 };
/** Siege shot: `damage[rank]` times the damage and `reload` times the time
 * between shots; from II `radius` times the blast; at III `range` more cells. */
export const SIEGE_SHOT = { damage: [1, 1.8, 1.8, 3], reload: 1.5, radius: 1.5, range: 3 };
/** Rangers: archers see `sight` more cells, hit `damage` times as hard from
 * II, and at III loose a second arrow at the next nearest enemy. */
export const RANGERS = { sight: 2, damage: 1.5 };
/** Skirmishers: archers draw in `reload[rank]` of the time; from II they
 * walk `speed` times as fast and keep walking while they shoot. */
export const SKIRMISH = { reload: [1, 0.7, 0.7, 0.45], speed: 1.3 };
/** Spotters: marked enemies take `mark[rank]` times the damage (2 without);
 * from II the tower marks `radius` cells further. */
export const SPOTTERS = { mark: [2, 2.5, 2.5, 3], radius: 2 };
/** Signal fires: marked enemies move at `slow[rank]` of their pace; from II
 * the tower marks `radius` cells further; at III marked enemies burn for
 * `burn` a second. */
export const SIGNAL = { slow: [1, 0.7, 0.55, 0.55], radius: 3, burn: 6 };
/** Pyroclasm: fireballs hit `damage` times as hard; from II burst `splash`
 * times as wide; at III each throws `shards` smaller bursts beside it, at
 * `shardShare` of the damage. */
export const PYROCLASM = { damage: 1.4, splash: 1.4, shards: 2, shardShare: 0.5 };
/** Cinders: the burning ground lasts `life` times as long; from II burns
 * `dps` times as hot; at III what walks through it keeps burning `cling`
 * seconds after. */
export const CINDERS = { life: 1.6, dps: 1.8, cling: 2 };
/** Oil-soaked bait: whatever bites a stack catches fire for `burn[rank]`
 * seconds at `dps[rank]` a second. */
export const OIL = { burn: [0, 3, 4, 6], dps: [0, 8, 20, 50] };
/** Fortified crates: bait has `hp[rank]` times its HP; at III each bite
 * comes back on the biter `thorns` times over. */
export const FORTIFY = { hp: [1, 2, 3.5, 3.5], thorns: 3 };
/** Blasting stakes: a stone's stakes blow up when an enemy on foot touches
 * them, a blast `radius[rank]` cells wide for `damage[rank]` times the cut,
 * sparing your own people; that stone's stakes are ready again after
 * `rearm[rank]` seconds. */
export const BLAST_STAKES = { radius: [0, 1.2, 1.8, 1.8], damage: [0, 3, 3, 7.5], rearm: [0, 4, 3, 2] };
/** Spring stakes: when an enemy on foot touches a row, every standing
 * stone's stakes in it shoot out `reach[rank]` cells past the wall, striking
 * every enemy on foot in front of the row for `damage[rank]` times the cut;
 * the row winds back for `rearm[rank]` seconds. `show` is how long the
 * thrust is drawn. */
export const SPRING_STAKES = { reach: [0, 1.5, 2.5, 2.5], damage: [0, 3, 3, 5], rearm: [0, 3, 3, 1.5], show: 0.35 };
/** Rimed stakes: every cut chills for `chill[rank]` seconds; from II a cut
 * on an enemy already chilled bites `bite` times as hard; at III the cold
 * reaches every enemy on foot within `aura` cells of the stakes each cut. */
export const RIME_STAKES = { chill: [0, 1.5, 2.5, 2.5], bite: 2, aura: 2 };

/** Bone archers: the risen loose bone arrows from `range[rank]` cells
 * instead of closing to cut; from II they hit `damage` times as hard; at
 * III each loosing sends a second arrow at the next nearest enemy. */
export const BONE_ARCHERS = { range: [0, 4, 5, 5], damage: 1.5 };
/** Soul weighing: each warrior rises as strong as the enemy it was, its HP
 * and damage times that enemy's difficulty over a plain warrior's
 * (`NECRO.difficulty`), never less than `floor` nor more than `cap[rank]`,
 * then times `boost[rank]`. */
export const SOUL_WEIGHT = { floor: 0.25, cap: [0, 3, 6, 12], boost: [1, 1, 1.25, 1.5] };
/** Amalgam: every fallen enemy in reach fuses into one abomination, its HP
 * and damage a plain warrior's times their summed difficulty over a plain
 * warrior's, times `share[rank]`; from II each blow cleaves every enemy
 * within `cleave` cells of its target; at III it never crumbles. */
export const AMALGAM = { share: [0, 0.6, 0.8, 1], cleave: 1.2 };

export const PATHS: KnowledgePath[] = [
  {
    id: "pyromancy", topic: "wizardTower", name: "Pyromancy", motto: "Flames only, far hotter", hue: "ember",
    ranks: [
      { name: "Kindling", icon: "flame", cost: studyPathCost(4, 0), text: "The tower gives up its ice and burns 30% hotter" },
      { name: "Long tongues", icon: "tongue", cost: studyPathCost(4, 1), text: "Its flames reach 1.5 cells further" },
      { name: "Inferno", icon: "inferno", cost: studyPathCost(4, 2), text: "Flames burn 80% hotter in all and half again as long" },
    ],
  },
  {
    id: "rime", topic: "wizardTower", name: "Rime", motto: "Ice only, then frozen solid", hue: "frost",
    ranks: [
      { name: "Hoarfrost", icon: "snowflake", cost: studyPathCost(4, 0), text: "The tower gives up its flames; ice comes twice as often and chills half again as long" },
      { name: "Black ice", icon: "shard", cost: studyPathCost(4, 1), text: "Ice waves hit 60% harder and run 1.5 cells further" },
      { name: "Deep freeze", icon: "iceBlock", cost: studyPathCost(4, 2), text: "Enemies the ice hits freeze solid for a moment" },
    ],
  },
  {
    id: "storm", topic: "wizardTower", name: "Stormcalling", motto: "Lightning in place of flames", hue: "storm",
    ranks: [
      { name: "Stormcalling", icon: "bolt", cost: studyPathCost(5, 0), text: "Each flame becomes a bolt of lightning leaping through 3 enemies; the ice stays" },
      { name: "Forked bolts", icon: "fork", cost: studyPathCost(5, 1), text: "Bolts leap through 5 enemies, further apart" },
      { name: "Thunderhead", icon: "thunderhead", cost: studyPathCost(5, 2), text: "Bolts leap through 7 enemies and strike half again as hard" },
    ],
    evolves: { from: "wizardTower", item: "darkKeep", name: "Dark wizard keep", cost: 150000, text: "Unlocks the crown: evolve a selected Stormcalling card into a Dark wizard keep" },
  },
  {
    id: "crusaders", topic: "barracks", name: "Crusaders", motto: "Immovable, armoured, enduring", hue: "steel",
    ranks: [
      { name: "Chain mail", icon: "mail", cost: studyPathCost(4, 0), text: "Swordsmen have 50% more HP, and walk a little slower" },
      { name: "Field dressing", icon: "heart", cost: studyPathCost(4, 1), text: "They heal 3 HP a second" },
      { name: "Templars", icon: "cross", cost: studyPathCost(4, 2), text: "120% more HP in all, and 50% more damage" },
    ],
    evolves: { from: "barracks", item: "valkyriePalace", name: "Valkyrie palace", cost: 100000, text: "Unlocks the crown: evolve a selected Crusaders card into a Valkyrie palace" },
  },
  {
    id: "assassins", topic: "barracks", name: "Assassins", motto: "Swift, frail, deadly strikes", hue: "shadow",
    ranks: [
      { name: "Light feet", icon: "boot", cost: studyPathCost(4, 0), text: "Swordsmen run 30% faster with 20% less HP; every 4th strike is critical, 3× damage" },
      { name: "Cutthroats", icon: "dagger", cost: studyPathCost(4, 1), text: "Every 3rd strike is critical, and they strike 33% faster" },
      { name: "Shadows", icon: "skull", cost: studyPathCost(4, 2), text: "Every other strike is critical, and they hunt anywhere in the city" },
    ],
  },
  {
    id: "fireArrows", topic: "archerTower", name: "Fire arrows", motto: "Every arrow sets them alight", hue: "ember",
    ranks: [
      { name: "Pitch arrows", icon: "fireArrow", cost: studyPathCost(4, 0), text: "Arrows set what they hit burning for 3 seconds" },
      { name: "Wildfire", icon: "flame", cost: studyPathCost(4, 1), text: "Burns last 4 seconds and burn twice as hot" },
      { name: "Fire volley", icon: "volley", cost: studyPathCost(4, 2), text: "The tower looses 3 burning arrows at once, at the 3 nearest enemies" },
    ],
  },
  {
    id: "sharpshooters", topic: "archerTower", name: "Sharpshooters", motto: "Far sight, deadly aim", hue: "verdant",
    ranks: [
      { name: "Hawk eyes", icon: "eye", cost: studyPathCost(4, 0), text: "The tower reaches 2 cells further" },
      { name: "Called shots", icon: "crosshair", cost: studyPathCost(4, 1), text: "Every 3rd arrow is critical, 3× damage" },
      { name: "Deadeye", icon: "skull", cost: studyPathCost(4, 2), text: "Arrows hit 60% harder, aimed at the strongest enemy in reach" },
    ],
  },
  {
    id: "gunnery", topic: "cannonTower", name: "Gun crews", motto: "Fast crews, scattering shot", hue: "steel",
    ranks: [
      { name: "Drilled crews", icon: "gear", cost: studyPathCost(4, 0), text: "The cannon reloads 25% faster" },
      { name: "Grapeshot", icon: "grape", cost: studyPathCost(4, 1), text: "Each shell bursts into 4 smaller blasts round where it lands" },
      { name: "Master gunners", icon: "mail", cost: studyPathCost(4, 2), text: "It reloads twice as fast as at first" },
    ],
  },
  {
    id: "siegeShot", topic: "cannonTower", name: "Siege shot", motto: "Slow, enormous blasts", hue: "ember",
    ranks: [
      { name: "Iron shot", icon: "cannonball", cost: studyPathCost(4, 0), text: "Shells hit 80% harder, but the cannon takes half again as long to reload" },
      { name: "Powder charge", icon: "blast", cost: studyPathCost(4, 1), text: "Blasts are half again as wide" },
      { name: "Earthshaker", icon: "fork", cost: studyPathCost(4, 2), text: "Shells hit three times as hard in all and the cannon reaches 3 cells further" },
    ],
  },
  {
    id: "rangers", topic: "archerBarracks", name: "Rangers", motto: "Long sight, heavy arrows", hue: "verdant",
    ranks: [
      { name: "Woodcraft", icon: "leaf", cost: studyPathCost(4, 0), text: "Archers see 2 cells further" },
      { name: "Broadheads", icon: "arrow", cost: studyPathCost(4, 1), text: "Their arrows hit 50% harder" },
      { name: "Twin shot", icon: "volley", cost: studyPathCost(4, 2), text: "Each loosing sends a second arrow at the next nearest enemy" },
    ],
  },
  {
    id: "skirmishers", topic: "archerBarracks", name: "Skirmishers", motto: "Quick draws, always moving", hue: "shadow",
    ranks: [
      { name: "Quick draw", icon: "bow", cost: studyPathCost(4, 0), text: "Archers shoot 30% faster" },
      { name: "Running shots", icon: "boot", cost: studyPathCost(4, 1), text: "They walk 30% faster and keep moving while they shoot" },
      { name: "Hail of arrows", icon: "bolt", cost: studyPathCost(4, 2), text: "They shoot more than twice as fast as at first" },
    ],
  },
  {
    id: "spotters", topic: "watchTower", name: "Spotters", motto: "Marked enemies suffer more", hue: "verdant",
    ranks: [
      { name: "Spyglasses", icon: "spyglass", cost: studyPathCost(4, 0), text: "Marked enemies take 2.5× damage instead of 2×" },
      { name: "Lookout posts", icon: "eye", cost: studyPathCost(4, 1), text: "The tower marks 2 cells further" },
      { name: "Marked for death", icon: "crosshair", cost: studyPathCost(4, 2), text: "Marked enemies take 3× damage" },
    ],
  },
  {
    id: "signalFires", topic: "watchTower", name: "Signal fires", motto: "Marked enemies are hindered", hue: "ember",
    ranks: [
      { name: "Signal fires", icon: "beacon", cost: studyPathCost(4, 0), text: "Marked enemies move at 70% of their pace" },
      { name: "Beacon chain", icon: "tongue", cost: studyPathCost(4, 1), text: "The tower marks 3 cells further, and marked enemies slow to 55%" },
      { name: "Pyre signal", icon: "inferno", cost: studyPathCost(4, 2), text: "Marked enemies burn while they stay marked" },
    ],
  },
  {
    id: "pyroclasm", topic: "mageGuild", name: "Pyroclasm", motto: "Bigger, harder fireballs", hue: "ember",
    ranks: [
      { name: "White heat", icon: "fireball", cost: studyPathCost(4, 0), text: "Fireballs hit 40% harder" },
      { name: "Wide bursts", icon: "blast", cost: studyPathCost(4, 1), text: "Their bursts are 40% wider" },
      { name: "Meteor shower", icon: "volley", cost: studyPathCost(4, 2), text: "Each fireball throws two smaller bursts beside it" },
    ],
  },
  {
    id: "cinders", topic: "mageGuild", name: "Cinders", motto: "The ground burns longer and hotter", hue: "shadow",
    ranks: [
      { name: "Smoulder", icon: "embers", cost: studyPathCost(4, 0), text: "Burning ground lasts 60% longer" },
      { name: "Hot coals", icon: "flame", cost: studyPathCost(4, 1), text: "It burns 80% hotter" },
      { name: "Clinging fire", icon: "inferno", cost: studyPathCost(4, 2), text: "Whatever walks through it keeps burning for 2 seconds after" },
    ],
  },
  {
    id: "oilSoaked", topic: "bait", name: "Oil-soaked", motto: "Biters catch fire", hue: "ember",
    ranks: [
      { name: "Lamp oil", icon: "flame", cost: studyPathCost(3, 0), text: "Enemies that bite the bait catch fire for 3 seconds" },
      { name: "Pitch", icon: "tongue", cost: studyPathCost(3, 1), text: "They burn hotter, for 4 seconds" },
      { name: "Greek fire", icon: "inferno", cost: studyPathCost(3, 2), text: "They burn far hotter, for 6 seconds" },
    ],
  },
  {
    id: "fortified", topic: "bait", name: "Fortified crates", motto: "Bait that holds out", hue: "steel",
    ranks: [
      { name: "Iron bands", icon: "crate", cost: studyPathCost(3, 0), text: "Bait has twice the HP" },
      { name: "Stone cellar", icon: "mail", cost: studyPathCost(3, 1), text: "Bait has 3.5× the HP" },
      { name: "Spiked crates", icon: "dagger", cost: studyPathCost(3, 2), text: "Every bite comes back on the biter three times over" },
    ],
  },
  {
    id: "blastStakes", topic: "spikes", name: "Blasting stakes", motto: "Stakes that blow up on contact", hue: "ember",
    ranks: [
      { name: "Powder stakes", icon: "blast", cost: studyPathCost(4, 0), text: "A stone's stakes blow up when an enemy touches them, then are ready again after 4 seconds" },
      { name: "Black powder", icon: "inferno", cost: studyPathCost(4, 1), text: "The blasts are half again as wide, and ready again after 3 seconds" },
      { name: "Thunder stakes", icon: "cannonball", cost: studyPathCost(4, 2), text: "The blasts hit 2.5× as hard, and are ready again after 2 seconds" },
    ],
  },
  {
    id: "springStakes", topic: "spikes", name: "Spring stakes", motto: "The whole row shoots out at once", hue: "steel",
    ranks: [
      { name: "Spring stakes", icon: "spring", cost: studyPathCost(4, 0), text: "When an enemy touches a row, all its stakes shoot out 1.5 cells, striking every enemy in front of it" },
      { name: "Long pikes", icon: "stake", cost: studyPathCost(4, 1), text: "The stakes shoot out 2.5 cells" },
      { name: "Hair trigger", icon: "dagger", cost: studyPathCost(4, 2), text: "The row winds back twice as fast, and strikes 5× as hard as a cut" },
    ],
  },
  {
    id: "rimeStakes", topic: "spikes", name: "Rimed stakes", motto: "Cold iron that holds them fast", hue: "frost",
    ranks: [
      { name: "Cold iron", icon: "snowflake", cost: studyPathCost(4, 0), text: "Every cut chills the enemy for 1.5 seconds" },
      { name: "Frostbite", icon: "shard", cost: studyPathCost(4, 1), text: "Chills last 2.5 seconds, and the stakes cut a chilled enemy twice as hard" },
      { name: "Winter's breath", icon: "iceBlock", cost: studyPathCost(4, 2), text: "Each cut chills every enemy on foot within 2 cells of the stakes" },
    ],
  },
  {
    id: "boneArchers", topic: "necromancy", name: "Bone archers", motto: "The risen shoot from afar", hue: "grave",
    ranks: [
      { name: "Bone bows", icon: "bow", cost: studyPathCost(4, 0), text: "The risen loose bone arrows from 4 cells away instead of closing to cut" },
      { name: "Marrow shafts", icon: "bone", cost: studyPathCost(4, 1), text: "Their arrows hit 50% harder, from 5 cells away" },
      { name: "Volley of the dead", icon: "volley", cost: studyPathCost(4, 2), text: "Each loosing sends a second arrow at the next nearest enemy" },
    ],
  },
  {
    id: "soulWeighing", topic: "necromancy", name: "Soul weighing", motto: "The mighty rise mighty, the meek rise meek", hue: "grave",
    ranks: [
      { name: "Weighed souls", icon: "scales", cost: studyPathCost(4, 0), text: "Each warrior rises as strong as the enemy it was: weaker from weak enemies, up to 3× from tough ones" },
      { name: "Heavy hearts", icon: "skull", cost: studyPathCost(4, 1), text: "Tough enemies rise up to 6× as strong, and every warrior 25% stronger" },
      { name: "Fallen champions", icon: "crown", cost: studyPathCost(4, 2), text: "Tough enemies rise up to 12× as strong, and every warrior 50% stronger" },
    ],
  },
  {
    id: "amalgam", topic: "necromancy", name: "Amalgam", motto: "One giant of all the fallen", hue: "grave",
    ranks: [
      { name: "Bone heap", icon: "hand", cost: studyPathCost(5, 0), text: "All the fallen in reach fuse into one giant warrior, with 60% of their summed difficulty as its strength" },
      { name: "Grave titan", icon: "tombstone", cost: studyPathCost(5, 1), text: "80% of their strength, and each blow cleaves every enemy beside its target" },
      { name: "Undying colossus", icon: "inferno", cost: studyPathCost(5, 2), text: "All of their strength, and it never crumbles" },
    ],
  },
];

export const PATH_TOPICS = [...new Set(PATHS.map((p) => p.topic))];
export const pathById = (id: PathId) => PATHS.find((p) => p.id === id)!;
export const pathsOf = (topic: string) => PATHS.filter((p) => p.topic === topic);

/** Legacy topic-wide choices retained solely for old-save migration. */
export type PathChoice = { path: PathId; rank: number; spent: number; crowned?: number };
export type PathChoices = Partial<Record<PathTopic, PathChoice>>;
/** What the battle reads: each topic's path and rank. */
export type BattlePaths = Partial<Record<PathTopic, { path: PathId; rank: number }>>;

/** The rank of `path` the battle fights with (0 when not chosen). */
export const pathRank = (paths: BattlePaths | undefined, topic: PathTopic, path: PathId) => {
  const c = paths?.[topic];
  return c && c.path === path ? c.rank : 0;
};

/** Paths are researched once for the collection; cards equip them independently. */
export type PathResearch = Partial<Record<PathId, { rank: number; spent: number; crowned?: boolean }>>;
export function pathState(save: Save, id: PathId) {
  const p = pathById(id), research = save.pathResearch[id], rank = research?.rank ?? 0;
  const next = p.ranks[rank], affordable = !!next && (save.settings.devMode || save.knowledge >= next.cost);
  const crowned = !!research?.crowned;
  const crownAffordable = !!p.evolves && (save.settings.devMode || save.knowledge >= p.evolves.cost);
  return { rank, sealed: false, next, maxed: !next, affordable, canLearn: !!next && affordable,
    crowned, crownAffordable, canEvolve: !!p.evolves && !next && !crowned && crownAffordable };
}

/** Base cards stay for sale after a crown is researched. */
export const evolvedBy = (item: PaletteItem): KnowledgePath | undefined => PATHS.find(p => p.evolves?.item === item);

/** Unlock a crown. Transforming a specific card is a separate, free choice. */
export function evolve(save: Save, id: PathId, prepaid?: number): boolean {
  const st = pathState(save, id), p = pathById(id);
  if (!p.evolves || !st.maxed || st.crowned || (prepaid === undefined && !st.canEvolve)) return false;
  const cost = prepaid ?? (save.settings.devMode ? 0 : p.evolves.cost);
  if (prepaid === undefined) save.knowledge -= cost;
  const r = save.pathResearch[id]!;
  r.crowned = true; r.spent += cost;
  return true;
}

export function learnPath(save: Save, id: PathId, prepaid?: number): boolean {
  const st = pathState(save, id);
  if (!st.next || (prepaid === undefined && !st.canLearn)) return false;
  const cost = prepaid ?? (save.settings.devMode ? 0 : st.next.cost);
  if (prepaid === undefined) save.knowledge -= cost;
  save.pathResearch[id] = { rank: st.rank + 1, spent: (save.pathResearch[id]?.spent ?? 0) + cost };
  followResearch(save, id);
  // A spell with no path yet casts with the first one researched.
  const topic = pathById(id).topic;
  if (isSpell(topic) && !save.spellPaths[topic]) save.spellPaths[topic] = id;
  return true;
}

/** Refund this topic's research and reset its cards, including individual crowns. */
export function unlearnPath(save: Save, topic: PathTopic): number {
  syncCards(save.defend);
  let spent = 0;
  for (const p of pathsOf(topic)) {
    spent += save.pathResearch[p.id]?.spent ?? 0;
    delete save.pathResearch[p.id];
    for (const c of save.defend.cards) {
      if (c.evolved === p.id && p.evolves) {
        save.defend.owned[c.kind]--; save.defend.owned[p.evolves.from]++;
        c.kind = p.evolves.from; delete c.evolved; delete c.placement;
      }
      if (c.path === p.id) { delete c.path; delete c.rank; }
    }
    if (p.evolves) save.defend.layout = { ...save.defend.layout,
      structures: save.defend.layout.structures.filter(s => s.kind !== p.evolves!.item || save.defend.cards.some(c => c.placement === `structure:${s.uid}`)) };
  }
  delete save.paths[topic];
  if (isSpell(topic)) delete save.spellPaths[topic];
  save.knowledge += spent;
  return spent;
}

export function decodePathResearch(raw: unknown): PathResearch {
  const out: PathResearch = {};
  if (!raw || typeof raw !== "object") return out;
  for (const p of PATHS) {
    const r = (raw as Record<string, any>)[p.id];
    if (!r || !Number.isInteger(r.rank) || r.rank < 1 || r.rank > p.ranks.length || !Number.isFinite(r.spent) || r.spent < 0) continue;
    out[p.id] = { rank: r.rank, spent: r.spent, ...(r.crowned === true && p.evolves && r.rank === p.ranks.length ? { crowned: true } : {}) };
  }
  return out;
}

/** Keeps only well formed choices: a known topic, its own path, a rank it
 * has, and Knowledge spent as a finite count. */
export function decodePaths(raw: unknown): PathChoices {
  const out: PathChoices = {};
  if (!raw || typeof raw !== "object") return out;
  for (const topic of PATH_TOPICS) {
    const c = (raw as Record<string, unknown>)[topic] as Partial<PathChoice> | undefined;
    if (!c || typeof c !== "object") continue;
    const p = PATHS.find((p) => p.id === c.path && p.topic === topic);
    if (!p || !Number.isInteger(c.rank) || c.rank! < 1 || c.rank! > p.ranks.length) continue;
    if (typeof c.spent !== "number" || !Number.isFinite(c.spent) || c.spent < 0) continue;
    out[topic] = { path: p.id, rank: c.rank!, spent: c.spent };
    if (p.evolves && c.rank === p.ranks.length && Number.isInteger(c.crowned) && c.crowned! >= 0 && c.crowned! <= 999) out[topic]!.crowned = c.crowned;
  }
  return out;
}

/** The path and rank a spell casts with: the equipped path at its furthest
 * researched rank, or none. */
export function spellPath(save: Save, spell: SpellId): { path: PathId; rank: number } | undefined {
  const path = save.spellPaths[spell], rank = path ? save.pathResearch[path]?.rank ?? 0 : 0;
  return path && rank ? { path, rank } : undefined;
}

/** Equips `path` on `spell` (undefined casts it plain); only a researched path of its own. */
export function equipSpell(save: Save, spell: SpellId, path?: PathId): boolean {
  if (path && (pathById(path)?.topic !== spell || !save.pathResearch[path]?.rank)) return false;
  if (path) save.spellPaths[spell] = path;
  else delete save.spellPaths[spell];
  return true;
}

/** Keeps each spell's equipped path when it is one of its own. */
export function decodeSpellPaths(raw: unknown): Partial<Record<SpellId, PathId>> {
  const out: Partial<Record<SpellId, PathId>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const spell of SPELLS) {
    const p = PATHS.find((p) => p.id === (raw as Record<string, unknown>)[spell] && p.topic === spell);
    if (p) out[spell] = p.id;
  }
  return out;
}
