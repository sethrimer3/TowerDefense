/** Knowledge paths. A building's paths are climbed by each building on its
 * own, rank by rank, from its upgrade panel in Defend (`specializations.ts`);
 * the Study researches only the strike spells' paths, once for the spell. */
import type { PaletteItem } from "./defend/catalog.ts";
import { cloneLayout, type PlacedKind } from "./defend/layout.ts";
import type { Save } from "./save.ts";
import { studyPathCost } from "./economy.ts";

export type PathTopic = "pyreTower" | "frostTower" | "stormTower" | "wizardTower" | "chapterHouse" | "berserkerLodge" | "halberdYard" | "barracks" | "heroHall" | "valkyriePalace" | "assassinDen" | "bloodHall" | "veilHouse" | "poisonDen" | "spearHall" | "phalanx" | "javelinCamp" | "lancerStable" | "musketHall" | "gunHall" | "gunNest" | "gatlingNest" | "rocketBattery" | "sniperLodge" | "archerTower" | "brazierTower" | "hawkTower" | "cannonTower" | "batteryTower" | "mortarTower" | "archerBarracks" | "watchTower" | "mageGuild" | "bait" | "spikes" | SpellId;
/** Strike spells: cast from the battle's Skills palette rather than built,
 * so a spell has no cards; it casts with the one path `save.spellPaths`
 * names, at its furthest researched rank. */
export type SpellId = "necromancy" | "meteor" | "frostNova" | "reinforcements";
export const SPELLS: SpellId[] = ["necromancy", "meteor", "frostNova", "reinforcements"];
export const isSpell = (topic: string): topic is SpellId => (SPELLS as string[]).includes(topic);
export type PathId =
  | "pyromancy" | "rime" | "storm" | "crusaders" | "berserkers" | "halberdiers" | "cloudborne"
  | "whirlwind" | "bladeDance" | "legend"
  | "bloodletters" | "shadowcloak" | "venom" | "headhunters"
  | "longSpears" | "setSpears" | "testudo" | "spearWall" | "barbed" | "throwingArms" | "heavyLance" | "wingedLancers"
  | "grenadiers" | "volleyFire" | "bayonets" | "sharpMuskets" | "beltFeed"
  | "quickdraw" | "duelists" | "tripod" | "gunShield" | "overdrive" | "stoppingPower" | "deadeye" | "piercing" | "clusterRockets" | "salvoRacks"
  | "marksmen" | "ricochet" | "suppressors"
  | "fireArrows" | "sharpshooters" | "gunnery" | "siegeShot" | "rangers" | "skirmishers"
  | "spotters" | "signalFires" | "pyroclasm" | "cinders" | "oilSoaked" | "fortified"
  | "blastStakes" | "springStakes" | "rimeStakes"
  | "boneArchers" | "soulWeighing" | "amalgam"
  | "starfall" | "moltenCore" | "frostComet"
  | "shatter" | "blizzard" | "rimeWard"
  | "hammerfall" | "muster" | "oathsworn";
/** The pixel icons `ui/path-icons.ts` draws, one a rank. */
export type PathIcon =
  | "flame" | "tongue" | "inferno" | "snowflake" | "shard" | "iceBlock" | "bolt" | "fork" | "thunderhead"
  | "mail" | "heart" | "cross" | "boot" | "dagger" | "skull" | "crown"
  | "arrow" | "fireArrow" | "volley" | "eye" | "crosshair" | "gear" | "grape" | "cannonball" | "blast" | "bow" | "leaf"
  | "spyglass" | "beacon" | "crate" | "fireball" | "embers" | "stake" | "spring"
  | "bone" | "scales" | "tombstone" | "hand"
  | "meteor" | "stars" | "crater"
  | "shards" | "whirl" | "frostShield"
  | "hammer" | "helm" | "oath"
  | "hood" | "vial" | "drop"
  | "cloud" | "wing" | "halo";
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
  /** Before version 7 a building at this path's last rank could evolve
   * into `item` for `cost`. Ultimates are merged now (`specializations.ts`'s
   * `ATTUNED`); kept so older saves' crowns can be undone. */
  legacyCrown?: { from: PlacedKind; item: PlacedKind; name: string; cost: number; text: string };
};

// ── What each rank does in battle ─────────────────────────────────────────
/** Pyromancy, the Pyre tower's path (flames only): hotter (by rank), longer from II, burning longer at III. */
export const PYRO = { damage: [1, 1.3, 1.3, 1.8], reach: 1.5, burn: 1.5 };
/** Rime, the Frost tower's path (ice only, twice as often): chill lasting longer; harder and further from II;
 * freezing solid at III for `freeze` seconds. */
export const RIME = { chill: 1.5, damage: 1.6, reach: 1.5, freeze: 1.2 };
/** Stormcalling, the Storm tower's path: a chain bolt in place of each
 * flame (the tower's own at rank 0), striking up to `links[rank]` enemies `jump[rank]` cells apart for `damage` times the
 * flame's damage a second, half again at III. */
export const STORM = { links: [2, 3, 5, 7], jump: [2, 2.5, 3, 3.5], damage: 1.2, surge: 1.5 };
/** Crusaders, the Chapterhouse's path: heavier (HP by rank, the
 * Chapterhouse's own at rank 0, slower), healing from II, harder hitting at III. */
export const CRUSADE = { hp: [1.25, 1.5, 1.5, 2.2], speed: 0.85, heal: 3, damage: 1.5 };
/** Berserkers, the Berserker lodge's path: strokes come in `rage` of the
 * time at the lodge, `cooldown` from I; from II every kill
 * heals the slayer `heal` of its full HP; at III each blow also cuts every
 * other enemy within `cleave` cells of its target for `share` of it. */
export const BERSERK = { rage: 0.87, cooldown: 0.75, heal: 0.3, cleave: 1, share: 0.5 };
/** Halberdiers, the Halberd yard's path: `drill` more cells of reach at
 * the yard, from I `reach` more and `damage` times the damage;
 * from II every blow slows its enemy for `chill` seconds; at III blows on
 * an enemy at least `big` cells across hit `bigDamage` times as hard. */
export const HALBERD = { drill: 0.3, reach: 0.6, damage: 1.2, chill: 1.5, big: 0.8, bigDamage: 2.5 };
/** The Hero's paths (`defend/hero.ts`). Whirlwind: every `every[rank]`th
 * strike of the combo is a spin (the Hero's own every 3rd), reaching
 * `radius[rank]` cells and hitting `damage[rank]` times as hard; at III
 * every strike is a spin. */
export const WHIRLWIND = { every: [3, 2, 2, 1], radius: [1.5, 2, 2, 2.4], damage: [1.5, 1.5, 2.2, 2.2] };
/** Blade dance: each strike is a flurry of `slashes[rank]`, the Hero
 * dashing from enemy to enemy within `jump` cells between them (stopped by
 * anything solid), each a slash of its own; from II it strikes in
 * `cooldown[rank]` of the time; at III each kill in a flurry adds another
 * slash, up to `most`. */
export const BLADE_DANCE = { slashes: [1, 3, 5, 5], jump: 2.5, cooldown: [1, 1, 0.75, 0.75], most: 12 };
/** Legend: the Hero has `hp[rank]` times its HP; from II each enemy it
 * slays heals it `heal` of its full HP; at III, the first time it falls it
 * rises at once with `rise` of its full HP, nothing able to hurt it for
 * `stand` seconds. */
export const LEGEND = { hp: [1, 2, 2, 2], heal: 0.05, rise: 0.5, stand: 3 };
/** The spearmen line's paths (`defend/spears.ts`). Long spears: spearmen
 * reach `reach[rank]` more cells; from II each thrust runs on into the
 * nearest enemy within `through` cells behind its target for `share[rank]`
 * of it; at III thrusts hit `damage` times as hard. */
export const LONG_SPEARS = { reach: [0, 0.4, 0.4, 0.8], through: 1.2, share: [0, 0, 0.6, 1], damage: 1.3 };
/** Set spears: a thrust on an enemy still at full health hits `fresh[rank]`
 * times as hard; from II every thrust staggers its enemy for `stagger`
 * seconds. */
export const SET_SPEARS = { fresh: [1, 2, 2, 3], stagger: 0.5 };
/** Testudo: hoplites take `guard[rank]` of what they would; from II each
 * comrade within `near` cells takes `ally` more off, at most `most` of
 * them; at III every enemy within a hoplite's reach is slowed for `chill`
 * seconds. */
export const TESTUDO = { guard: [1, 0.75, 0.75, 0.75], near: 1.5, ally: 0.1, most: 3, chill: 0.6 };
/** Spear wall: hoplites hit `damage[rank]` times as hard; from II each
 * thrust also strikes every other enemy within its reach for `share[rank]`
 * of it. */
export const SPEAR_WALL = { damage: [1, 1.3, 1.3, 1.3], share: [0, 0, 0.5, 1] };
/** Barbed javelins: hits slow for `chill` seconds; from II they stagger
 * for `stagger` seconds; at III a javelin at an enemy at least `big`
 * cells across hits `bigDamage` times as hard. */
export const BARBED = { chill: 1.5, stagger: 0.6, big: 0.6, bigDamage: 1.8 };
/** Throwing arms: javelineers reach `range[rank]` more cells; from II a
 * second javelin goes at the next nearest enemy in reach; at III they
 * throw in `reload[rank]` of the time. */
export const THROWING = { range: [0, 1.5, 1.5, 1.5], extra: [0, 0, 1, 1], reload: [1, 1, 1, 0.7] };
/** Heavy lance: a lancer's charge hits `charge[rank]` times the damage
 * (`LANCER.charge` off the path); from II a charge staggers its enemy for
 * `stagger` seconds; at III it tramples every other enemy within
 * `trample` cells of its target for `share` of it. */
export const HEAVY_LANCE = { charge: [2.5, 3.5, 3.5, 3.5], stagger: 1, trample: 0.9, share: 0.5 };
/** Winged lancers: lancers ride `speed[rank]` times as fast; from II they
 * range `leash[rank]` times as far from the stable; at III each charge
 * heals the rider `heal` of its full HP. */
export const WINGED = { speed: [1, 1.25, 1.25, 1.25], leash: [1, 1, 1.5, 1.5], heal: 0.15 };
/** Cloudborne: the Valkyrie palace rises onto clouds and drifts west across
 * the sky at `speed` cells a second, coming round from the east edge at
 * another height; nothing on the ground can reach it, and its valkyries
 * drop from wherever it floats (`sky-palace.ts`). From II each lands with a
 * charge at the nearest enemy within `dive` times her reach; at III the
 * palace holds `host` more valkyries and trains them in `drill` of the time. */
export const CLOUDBORNE = { speed: 0.3, dive: 2, host: 2, drill: 0.5 };
/** The Assassins' den's paths (`assassins.ts`). Bloodletters: criticals
 * hit `crit[rank]` times the damage, every `every[rank]`th strike, and the
 * assassins have `hp[rank]` of their HP (rank 0 is the plain den's; the
 * Blood hall's own, before any rank, is `hall`). */
export const BLOODLETTERS = { hall: { crit: 3, hp: 0.85 }, crit: [2, 5, 5, 10], every: [4, 4, 3, 2], hp: [1, 0.7, 0.6, 0.5] };
/** Shadowcloak, the Veil house's path (its own, before any rank, `hall`):
 * no enemy picks out a cloaked assassin; a strike unveils it
 * for `reveal[rank]` seconds, and a strike from the cloak hits `ambush[rank]`
 * times as hard; at III a kill cloaks it again at once. */
export const SHADOWCLOAK = { hall: { reveal: 4, ambush: 1.5 }, reveal: [0, 3, 2, 2], ambush: [1, 2, 4, 6] };
/** Venom, the Poison den's path (its own, before any rank, `hall`): every strike envenoms for `time[rank]` seconds: the enemy takes
 * `more[rank]` times the damage from everything, and loses `share` of the
 * striker's damage a second; at III one that dies envenomed passes it to
 * every enemy within `spread` cells. */
export const VENOM = { hall: { time: 3, more: 1.1 }, time: [0, 4, 6, 6], more: [1, 1.25, 1.5, 1.5], share: 0.5, spread: 1.5 };
/** Headhunters: assassins go for the toughest enemy (the most HP) they can
 * reach, every strike adding `bounty[rank]` of its full HP (at most `cap`
 * times the strike); from II they range `leash` times as far, and at III
 * anywhere in the city. */
export const HEADHUNT = { bounty: [0, 0.01, 0.02, 0.03], cap: 10, leash: 1.5 };
/** The Musket hall's paths (`muskets.ts`). Grenadiers: balls burst where
 * they hit (`MUSKETEER.blast` cells wide), and each burst leaves
 * burning ground for `burn[rank]` seconds at `share` of the ball's damage a
 * second; from II it throws `bomblets` smaller bursts round it, each
 * `bombShare` of the damage and `bombR` of the burst; at III the fire clings. */
export const GRENADIERS = { burn: [0, 3, 3, 5], share: 0.25, bomblets: [0, 0, 4, 4], bombShare: 0.4, bombR: 0.6 };
/** Volley fire: each shot also looses `extra[rank]` balls at the next
 * nearest enemies in reach, each `share` of the damage; at III a musketman
 * reloads `drill` faster for each comrade of its hall within `reach`
 * cells, at most `most` of them. */
export const VOLLEY = { extra: [0, 1, 2, 2], share: 0.5, drill: 0.15, most: 3, reach: 3 };
/** Sharpshooters: musketmen reach `range[rank]` more cells and hit
 * `damage[rank]` times as hard; at III they aim at the toughest enemy in
 * reach. */
export const SHARP_MUSKETS = { range: [0, 1.5, 1.5, 3], damage: [1, 1, 1.5, 1.8] };
/** Belt feed: machine gunners reload in `reload[rank]` of the time; from
 * II their bullets hit `damage` times as hard. */
export const BELT_FEED = { reload: [1, 0.8, 0.8, 0.6], damage: 1.4 };
/** Tripod: machine gunners reach `range[rank]` more cells and hit
 * `damage[rank]` times as hard. */
export const TRIPOD = { range: [0, 1, 1, 2], damage: [1, 1, 1.25, 1.25] };
/** Quickdraw: gunners reload in `reload[rank]` of the time; at III each
 * shot also fires the second pistol at the next nearest enemy in reach. */
export const QUICKDRAW = { reload: [1, 0.75, 0.6, 0.6] };
/** Duelists: gunners hit `damage[rank]` times as hard and reach
 * `range[rank]` more cells; at III every `every`th shot hits `crit` times
 * as hard (counted, never rolled). */
export const DUELISTS = { damage: [1, 1.3, 1.3, 1.3], range: [0, 0, 1.5, 1.5], every: 3, crit: 3 };
/** Gun shield: Gatling gunners have `hp[rank]` times the life; from II
 * they push the gun `speed` times as fast. */
export const GUN_SHIELD = { hp: [1, 1.5, 1.5, 2.5], speed: 2 };
/** Overdrive: all damage, no push. Gatling gunners hit `damage[rank]`
 * times as hard and reload in `reload[rank]` of the time. */
export const OVERDRIVE = { damage: [1, 1.4, 1.8, 2.4], reload: [1, 1, 1, 0.85] };
/** Stopping power: all push, little damage. Gatling gunners hit
 * `damage[rank]` times as hard and every bullet knocks its enemy `push[rank]`
 * cells straight back from the gun (not bosses, fortresses or boats). */
export const STOPPING = { damage: [1, 0.35, 0.3, 0.25], push: [0, 0.08, 0.14, 0.22] };
/** Deadeye: snipers (who, like the whole gunner line, shoot only an enemy
 * in clear sight, `gun-sight.ts`) hit `damage[rank]` times as hard; at III
 * they reach `range` cells further. */
export const DEADEYE = { damage: [1, 1.6, 2.2, 3], range: 2 };
/** Piercing rounds: every bullet flies straight on to the end of its reach
 * through every enemy within `width` of its line, each hit at `damage[rank]`
 * of the shot; at III they reach `range` cells further. */
export const PIERCING = { damage: [1, 0.4, 0.5, 0.6], width: 0.4, range: 2 };
/** Cluster rockets: rockets burst `blast[rank]` cells wider, from II throw
 * `bomblets` round the burst at `share` of the damage, and at III leave the
 * ground burning `burn` seconds at `burnShare` of the damage a second. */
export const CLUSTER = { blast: [0, 0.5, 0.5, 0.5], bomblets: [0, 0, 4, 4], burn: [0, 0, 0, 5], burnShare: 0.2 };
/** Salvo racks: rocketeers reload in `reload[rank]` of the time and loose
 * `rockets[rank]` a launch, the rest at the next nearest enemies in reach. */
export const SALVO = { reload: [1, 0.75, 0.75, 0.6], rockets: [1, 1, 2, 3] };
/** Bayonets: an enemy within `reach` cells is run through for `damage`
 * times the shot's damage every `cooldown` seconds instead of shot; from II
 * they hunt anywhere in the city at `speed` times their pace; at III a
 * thrust staggers its enemy for `stagger` seconds. */
export const BAYONET = { reach: 1, damage: 2, cooldown: 1.2, speed: 1.4, stagger: 1 };
/** The Sniper lodge's paths (`snipers.ts`). Marksmen: `range` more cells;
 * from II aimed at the toughest enemy in reach; at III every `every`th shot
 * is a headshot for `crit` times the damage. */
export const MARKSMEN = { range: 3, every: 3, crit: 4 };
/** Ricochet: a bullet that hits glances on `bounces[rank]` times, each to
 * the nearest enemy within `jump` cells of the last it struck and not
 * struck yet, for `share[rank]` of the damage before. */
export const RICOCHET = { bounces: [0, 1, 2, 4], share: [0, 0.6, 0.6, 0.8], jump: 2.5 };
/** Suppressing fire: every hit slows its enemy for `chill` seconds; from II
 * it staggers it (standing still) for `stagger`; at III snipers reload in
 * `reload` of the time. */
export const SUPPRESS = { chill: 2, stagger: 0.6, reload: 0.6 };
/** Fire arrows, the Brazier tower's path (its own, before any rank,
 * `hall`): an archer tower's arrows set what they hit burning for
 * `burn[rank]` seconds at `share[rank]` of the arrow's damage a second; at
 * III it looses `volley` arrows at once, each at another of the nearest. */
export const FIRE_ARROWS = { hall: { burn: 2, share: 0.25 }, burn: [0, 3, 4, 4], share: [0, 0.4, 0.8, 0.8], volley: 3 };
/** Sharpshooters, the Hawk tower's path: `hall` more cells at the tower,
 * `range` from I; from II every `every`th arrow is
 * critical for `crit` times the damage; at III `damage` times the damage,
 * aimed at the strongest enemy in reach. */
export const SHARP = { hall: 1, range: 2, every: 3, crit: 3, damage: 1.6 };
/** Gun crews, the Gun battery's path: it reloads in `reload[rank]` of the
 * time (the battery's own, before any rank, `hall`); from II each
 * shell bursts into `grape` bomblets round it (`grapeShare` of the damage,
 * `grapeR` of the radius). */
export const GUNNERY = { hall: 0.85, reload: [1, 0.75, 0.75, 0.5], grape: 4, grapeShare: 0.35, grapeR: 0.5 };
/** Siege shot, the Mortar tower's path (its own, before any rank, `hall`): `damage[rank]` times the damage and `reload` times the time
 * between shots; from II `radius` times the blast; at III `range` more cells. */
export const SIEGE_SHOT = { hall: { damage: 1.4, reload: 1.25 }, damage: [1, 1.8, 1.8, 3], reload: 1.5, radius: 1.5, range: 3 };
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

/** Starfall: the meteor breaks up into `count[rank]` fragments, one in the
 * middle and the rest `spread` of the reach out round it, each landing a
 * moment after the last with `damage[rank]` of the meteor's damage over
 * `radius` of its reach. */
export const STARFALL = { count: [1, 3, 5, 7], damage: [1, 0.55, 0.55, 0.7], radius: 0.55, spread: 0.7 };
/** Molten core: the crater burns for `life[rank]` seconds, `dps[rank]` a
 * second to every enemy on foot in `share[rank]` of the reach; at III the
 * fire clings to those who walk out of it. */
export const MOLTEN_CORE = { life: [0, 5, 8, 12], dps: [0, 10, 16, 16], share: [0, 0.7, 1, 1] };
/** Frost comet: everything the blast hits is chilled for `chill[rank]`
 * seconds; from II the blast reaches `reach[rank]` times as far; at III
 * it first freezes them solid for `freeze` seconds. */
export const FROST_COMET = { chill: [0, 3, 5, 5], reach: [1, 1, 1.25, 1.25], freeze: 1.5 };

/** Shatter: whatever the Frost nova freezes takes `brittle[rank]` times the
 * damage while it stays frozen; from II it bursts as it thaws, `damage[rank]`
 * to itself and every enemy within `radius[rank]` cells; at III one killed
 * while frozen (or in the rime) bursts too, and the shards freeze for `freeze`. */
export const SHATTER = { brittle: [1, 1.5, 1.5, 1.5], damage: [0, 0, 30, 50], radius: [0, 0, 1.2, 1.6], freeze: 1 };
/** Wandering blizzard: the rime lasts `life[rank]` seconds (rather than the
 * nova's own) and drifts `speed[rank]` cells a second toward the nearest
 * enemy; from II it grows by `grow` and refreezes everything inside every
 * `pulse` seconds for `pulseFreeze`; at III its cold bites `bite` times as hard. */
export const BLIZZARD = { life: [0, 10, 12, 16], speed: [0, 1, 1, 2], grow: 4 / 3, pulse: 3, pulseFreeze: 1, bite: 3 };
/** Rime ward: the city's own people in the rime take `guard` less damage;
 * from II its buildings take `walls` less; at III the troops in it heal
 * `heal` of their full health a second. */
export const RIME_WARD = { guard: 0.35, walls: 0.5, heal: 0.06 };

/** Hammerfall: each reinforcement lands with a shockwave, `damage[rank]` to
 * every enemy within `radius[rank]` cells; from II it staggers them (they
 * stand still) for `stagger` seconds; at III a champion lands in the middle
 * too, `hp` and `damage` times a soldier, cleaving `cleave` cells round its
 * blows, with a `quake`-damage shockwave over `quakeRadius` cells. */
export const HAMMERFALL = { damage: [0, 20, 35, 35], radius: [0, 1, 1.4, 1.4], stagger: 1.5, hp: 4, damage3: 2.5, cleave: 1, quake: 80, quakeRadius: 2.5 };
/** Muster the levy: `count[rank]` soldiers drop rather than the spell's
 * own; from II every `archerEvery`th is an archer shooting from `range`
 * cells; at III each who falls in battle is replaced once by a fresh one
 * dropping in at the squad's post. */
export const MUSTER = { count: [4, 7, 9, 9], archerEvery: 3, range: 4 };
/** Oathsworn: each takes `wall` less damage for every other of its squad
 * within `near` cells, up to `wallMax`; from II every enemy one slays adds
 * `time` seconds to the whole squad's stay and heals the slayer `heal` of
 * its health; at III, when its time runs out or it falls, it fights on
 * unhurtable for `stand` seconds first. */
export const OATH = { wall: 0.1, near: 2, wallMax: 0.3, time: 2, heal: 0.2, stand: 4 };

export const PATHS: KnowledgePath[] = [
  {
    id: "pyromancy", topic: "pyreTower", name: "Pyromancy", motto: "Flames only, far hotter", hue: "ember",
    ranks: [
      { name: "Kindling", icon: "flame", cost: studyPathCost(4, 0), text: "Its flames burn 30% hotter" },
      { name: "Long tongues", icon: "tongue", cost: studyPathCost(4, 1), text: "Its flames reach 1.5 cells further" },
      { name: "Inferno", icon: "inferno", cost: studyPathCost(4, 2), text: "Flames burn 80% hotter in all and half again as long" },
    ],
  },
  {
    id: "rime", topic: "frostTower", name: "Rime", motto: "Ice only, then frozen solid", hue: "frost",
    ranks: [
      { name: "Hoarfrost", icon: "snowflake", cost: studyPathCost(4, 0), text: "Its ice chills half again as long" },
      { name: "Black ice", icon: "shard", cost: studyPathCost(4, 1), text: "Ice waves hit 60% harder and run 1.5 cells further" },
      { name: "Deep freeze", icon: "iceBlock", cost: studyPathCost(4, 2), text: "Enemies the ice hits freeze solid for a moment" },
    ],
  },
  {
    id: "storm", topic: "stormTower", name: "Stormcalling", motto: "Lightning in place of flames", hue: "storm",
    ranks: [
      { name: "Stormcalling", icon: "bolt", cost: studyPathCost(5, 0), text: "Bolts leap through 3 enemies" },
      { name: "Forked bolts", icon: "fork", cost: studyPathCost(5, 1), text: "Bolts leap through 5 enemies, further apart" },
      { name: "Thunderhead", icon: "thunderhead", cost: studyPathCost(5, 2), text: "Bolts leap through 7 enemies and strike half again as hard" },
    ],
    legacyCrown: { from: "wizardTower", item: "darkKeep", name: "Dark wizard keep", cost: 150000, text: "This Wizard tower becomes a Dark wizard keep" },
  },
  {
    id: "crusaders", topic: "chapterHouse", name: "Crusaders", motto: "Immovable, armoured, enduring", hue: "steel",
    ranks: [
      { name: "Chain mail", icon: "mail", cost: studyPathCost(4, 0), text: "Crusaders have 50% more HP in all" },
      { name: "Field dressing", icon: "heart", cost: studyPathCost(4, 1), text: "They heal 3 HP a second" },
      { name: "Templars", icon: "cross", cost: studyPathCost(4, 2), text: "120% more HP in all, and 50% more damage" },
    ],
  },
  {
    id: "berserkers", topic: "berserkerLodge", name: "Berserkers", motto: "Fury, and blood for blood", hue: "ember",
    ranks: [
      { name: "Battle rage", icon: "dagger", cost: studyPathCost(4, 0), text: "Berserkers strike 33% faster in all" },
      { name: "Bloodlust", icon: "heart", cost: studyPathCost(4, 1), text: "Every enemy one slays heals it 30% of its full HP" },
      { name: "Cleave", icon: "fork", cost: studyPathCost(4, 2), text: "Each blow also cuts every other enemy within a cell of its target, for half the damage" },
    ],
  },
  {
    id: "halberdiers", topic: "halberdYard", name: "Halberdiers", motto: "Long reach, hooking blows", hue: "verdant",
    ranks: [
      { name: "Halberds", icon: "stake", cost: studyPathCost(4, 0), text: "Halberdiers reach 0.6 cells further in all and hit 20% harder" },
      { name: "Hooked blades", icon: "hand", cost: studyPathCost(4, 1), text: "Every blow slows its enemy for 1.5 seconds" },
      { name: "Set for the charge", icon: "helm", cost: studyPathCost(4, 2), text: "Blows on big enemies hit 2.5× as hard" },
    ],
  },
  {
    id: "whirlwind", topic: "heroHall", name: "Whirlwind", motto: "Spin after spin through the crowd", hue: "storm",
    ranks: [
      { name: "Whirling steel", icon: "whirl", cost: studyPathCost(10, 0), text: "Every other strike is a spin, reaching 2 cells" },
      { name: "Bladed tempest", icon: "shards", cost: studyPathCost(10, 1), text: "Spins hit 2.2× as hard" },
      { name: "Cyclone", icon: "stars", cost: studyPathCost(10, 2), text: "Every strike is a spin, reaching 2.4 cells" },
    ],
  },
  {
    id: "bladeDance", topic: "heroHall", name: "Blade dance", motto: "Slash, dash, slash again", hue: "ember",
    ranks: [
      { name: "Flurry", icon: "dagger", cost: studyPathCost(10, 0), text: "Each strike is a flurry of 3 slashes, the Hero dashing from enemy to enemy within 2.5 cells" },
      { name: "Blade dance", icon: "fork", cost: studyPathCost(10, 1), text: "5 slashes a flurry, and it strikes 33% faster" },
      { name: "Thousand cuts", icon: "volley", cost: studyPathCost(10, 2), text: "Each kill in a flurry adds another slash, up to 12" },
    ],
  },
  {
    id: "legend", topic: "heroHall", name: "Legend", motto: "A hero who will not stay down", hue: "steel",
    ranks: [
      { name: "Legendary arms", icon: "helm", cost: studyPathCost(10, 0), text: "The Hero has twice the HP" },
      { name: "Bloodied blade", icon: "heart", cost: studyPathCost(10, 1), text: "Every enemy it slays heals it 5% of its full HP" },
      { name: "Undying", icon: "crown", cost: studyPathCost(10, 2), text: "The first time it falls it rises at once with half its HP, and nothing can hurt it for 3 seconds" },
    ],
  },
  {
    id: "cloudborne", topic: "valkyriePalace", name: "Cloudborne", motto: "A palace adrift on the clouds", hue: "frost",
    ranks: [
      { name: "Cloudborne", icon: "cloud", cost: studyPathCost(10, 0), text: "The palace rises onto clouds and drifts slowly west across the sky, coming round from the east at another height. Nothing on the ground can reach it, and its valkyries drop from wherever it floats" },
      { name: "Diving descent", icon: "wing", cost: studyPathCost(10, 1), text: "Each valkyrie lands with a charge at the nearest enemy within twice her reach" },
      { name: "Heavenly host", icon: "halo", cost: studyPathCost(10, 2), text: "The palace holds 2 more valkyries and trains them twice as fast" },
    ],
  },
  {
    id: "longSpears", topic: "spearHall", name: "Long spears", motto: "Further, then two at a thrust", hue: "verdant",
    ranks: [
      { name: "Ash shafts", icon: "stake", cost: studyPathCost(4, 0), text: "Spearmen reach 0.4 cells further" },
      { name: "Run through", icon: "fork", cost: studyPathCost(4, 1), text: "Each thrust runs on into the nearest enemy behind its target, for 60% of the damage" },
      { name: "Sarissas", icon: "volley", cost: studyPathCost(4, 2), text: "They reach 0.8 cells further, thrust 30% harder, and run through at full damage" },
    ],
  },
  {
    id: "setSpears", topic: "spearHall", name: "Set spears", motto: "Braced for whatever comes", hue: "steel",
    ranks: [
      { name: "Brace", icon: "helm", cost: studyPathCost(4, 0), text: "A thrust at an enemy still at full health hits twice as hard" },
      { name: "Check", icon: "hand", cost: studyPathCost(4, 1), text: "Every thrust staggers its enemy for half a second" },
      { name: "Receive the charge", icon: "crosshair", cost: studyPathCost(4, 2), text: "A thrust at an enemy at full health hits 3× as hard" },
    ],
  },
  {
    id: "testudo", topic: "phalanx", name: "Testudo", motto: "Shields locked, side by side", hue: "steel",
    ranks: [
      { name: "Bronze shields", icon: "frostShield", cost: studyPathCost(4, 0), text: "Hoplites take 25% less from every blow" },
      { name: "Locked shields", icon: "mail", cost: studyPathCost(4, 1), text: "Each comrade within 1.5 cells takes another 10% off, up to 3 of them" },
      { name: "Hold the line", icon: "boot", cost: studyPathCost(4, 2), text: "Every enemy within a hoplite's reach is slowed" },
    ],
  },
  {
    id: "spearWall", topic: "phalanx", name: "Spear wall", motto: "A hedge of points", hue: "ember",
    ranks: [
      { name: "Drilled thrusts", icon: "stake", cost: studyPathCost(4, 0), text: "Hoplites hit 30% harder" },
      { name: "Hedge of spears", icon: "fork", cost: studyPathCost(4, 1), text: "Each thrust also strikes every other enemy within its reach, for half the damage" },
      { name: "Porcupine", icon: "shards", cost: studyPathCost(4, 2), text: "The other enemies in reach take the full damage" },
    ],
  },
  {
    id: "barbed", topic: "javelinCamp", name: "Barbed javelins", motto: "Hooks that hold fast", hue: "shadow",
    ranks: [
      { name: "Barbs", icon: "hand", cost: studyPathCost(4, 0), text: "Javelins slow what they hit for 1.5 seconds" },
      { name: "Pinning throws", icon: "stake", cost: studyPathCost(4, 1), text: "They stagger what they hit for 0.6 seconds" },
      { name: "Boar spears", icon: "skull", cost: studyPathCost(4, 2), text: "Javelins at big enemies hit 80% harder" },
    ],
  },
  {
    id: "throwingArms", topic: "javelinCamp", name: "Throwing arms", motto: "Further, and two at a time", hue: "verdant",
    ranks: [
      { name: "Throwing straps", icon: "arrow", cost: studyPathCost(4, 0), text: "Javelineers throw 1.5 cells further" },
      { name: "Second javelin", icon: "volley", cost: studyPathCost(4, 1), text: "Each throw sends a second javelin at the next nearest enemy" },
      { name: "Quick hands", icon: "gear", cost: studyPathCost(4, 2), text: "They throw 30% faster" },
    ],
  },
  {
    id: "heavyLance", topic: "lancerStable", name: "Heavy lance", motto: "Charges that break the line", hue: "ember",
    ranks: [
      { name: "Couched lance", icon: "stake", cost: studyPathCost(4, 0), text: "A charge hits 3.5× instead of 2.5×" },
      { name: "Unhorsing blow", icon: "hammer", cost: studyPathCost(4, 1), text: "A charge staggers its enemy for a second" },
      { name: "Trample", icon: "boot", cost: studyPathCost(4, 2), text: "A charge tramples every other enemy within a cell of its target, for half the damage" },
    ],
  },
  {
    id: "wingedLancers", topic: "lancerStable", name: "Winged lancers", motto: "Riders made for the sky", hue: "frost",
    ranks: [
      { name: "Swift mounts", icon: "wing", cost: studyPathCost(4, 0), text: "Lancers ride 25% faster" },
      { name: "Far patrols", icon: "spyglass", cost: studyPathCost(4, 1), text: "They range half again as far from the stable" },
      { name: "Blessed riders", icon: "halo", cost: studyPathCost(4, 2), text: "Each charge heals its rider 15% of its full HP" },
    ],
    legacyCrown: { from: "lancerStable", item: "valkyriePalace", name: "Valkyrie palace", cost: 100000, text: "This Lancer stable becomes a Valkyrie palace" },
  },
  {
    id: "bloodletters", topic: "bloodHall", name: "Bloodletters", motto: "Enormous criticals, paper-thin guard", hue: "shadow",
    ranks: [
      { name: "Heartseeker", icon: "dagger", cost: studyPathCost(4, 0), text: "Criticals hit 5×, but assassins have 30% less HP in all" },
      { name: "Opened veins", icon: "drop", cost: studyPathCost(4, 1), text: "Every 3rd strike is critical; 40% less HP" },
      { name: "Deathblow", icon: "skull", cost: studyPathCost(4, 2), text: "Every other strike is critical, for 10×; half their HP" },
    ],
  },
  {
    id: "shadowcloak", topic: "veilHouse", name: "Shadowcloak", motto: "Unseen until the blade falls", hue: "storm",
    ranks: [
      { name: "Cloak", icon: "hood", cost: studyPathCost(4, 0), text: "They vanish 3 seconds after a strike, and a strike from the cloak hits twice as hard" },
      { name: "Ambush", icon: "eye", cost: studyPathCost(4, 1), text: "They vanish 2 seconds after a strike, and strikes from the cloak hit 4× as hard" },
      { name: "Vanish", icon: "whirl", cost: studyPathCost(4, 2), text: "A kill cloaks them again at once, and strikes from the cloak hit 6× as hard" },
    ],
  },
  {
    id: "venom", topic: "poisonDen", name: "Venomblades", motto: "Poisoned enemies suffer from every blow", hue: "verdant",
    ranks: [
      { name: "Venomed blades", icon: "vial", cost: studyPathCost(4, 0), text: "Poison lasts 4 seconds, and poisoned enemies take 25% more damage" },
      { name: "Wolfsbane", icon: "drop", cost: studyPathCost(4, 1), text: "Poisoned enemies take 50% more damage, for 6 seconds" },
      { name: "Plague", icon: "skull", cost: studyPathCost(4, 2), text: "An enemy that dies poisoned passes the venom to every enemy within 1.5 cells" },
    ],
  },
  {
    id: "headhunters", topic: "assassinDen", name: "Headhunters", motto: "The toughest prey first", hue: "steel",
    ranks: [
      { name: "Quarry", icon: "crosshair", cost: studyPathCost(4, 0), text: "Assassins go for the toughest enemy they can reach, not the nearest; each strike adds 1% of its full HP" },
      { name: "Bounty", icon: "scales", cost: studyPathCost(4, 1), text: "They range half again as far, and each strike adds 2% of its full HP" },
      { name: "Kingslayer", icon: "crown", cost: studyPathCost(4, 2), text: "They hunt anywhere in the city, and each strike adds 3% of its full HP" },
    ],
  },
  {
    id: "grenadiers", topic: "musketHall", name: "Grenadiers", motto: "Bursts that burn and scatter", hue: "ember",
    ranks: [
      { name: "Fire powder", icon: "fireball", cost: studyPathCost(4, 0), text: "Balls burst where they hit, and every burst leaves the ground burning for 3 seconds, at a quarter of the ball's damage a second" },
      { name: "Grenades", icon: "grape", cost: studyPathCost(4, 1), text: "Every burst throws 4 smaller bursts round it, each 40% of the damage" },
      { name: "Wildfire", icon: "inferno", cost: studyPathCost(4, 2), text: "The ground burns for 5 seconds, and its fire clings to whatever walks out of it" },
    ],
  },
  {
    id: "volleyFire", topic: "musketHall", name: "Volley fire", motto: "Many balls, fired together", hue: "steel",
    ranks: [
      { name: "Buck and ball", icon: "volley", cost: studyPathCost(4, 0), text: "Every shot also looses a second ball, at half damage, at the next nearest enemy in reach" },
      { name: "Ranks", icon: "cannonball", cost: studyPathCost(4, 1), text: "Two extra balls a shot, each at another of the nearest" },
      { name: "Platoon fire", icon: "gear", cost: studyPathCost(4, 2), text: "Each musketman reloads 15% faster for every comrade of its hall within 3 cells, up to 45%" },
    ],
  },
  {
    id: "bayonets", topic: "musketHall", name: "Bayonets", motto: "Fix bayonets and charge", hue: "verdant",
    ranks: [
      { name: "Fix bayonets", icon: "dagger", cost: studyPathCost(4, 0), text: "An enemy within a cell is run through with the bayonet for twice the shot's damage, every 1.2 seconds" },
      { name: "Charge", icon: "boot", cost: studyPathCost(4, 1), text: "Musketmen hunt enemies anywhere in the city, running 40% faster" },
      { name: "Shock", icon: "hammer", cost: studyPathCost(4, 2), text: "Every bayonet thrust staggers its enemy for 1 second" },
    ],
  },
  {
    id: "sharpMuskets", topic: "musketHall", name: "Sharpshooters", motto: "Rifled barrels, then long rifles", hue: "verdant",
    ranks: [
      { name: "Rifled barrels", icon: "spyglass", cost: studyPathCost(4, 0), text: "Musketmen reach 1.5 cells further" },
      { name: "Steady aim", icon: "crosshair", cost: studyPathCost(4, 1), text: "Their balls hit 50% harder" },
      { name: "Sharpshooters", icon: "skull", cost: studyPathCost(4, 2), text: "They reach 3 cells further and hit 80% harder in all, aimed at the toughest enemy in reach" },
    ],
    legacyCrown: { from: "musketHall", item: "sniperLodge", name: "Sniper lodge", cost: 50000, text: "This Musket hall becomes a Sniper lodge" },
  },
  {
    id: "beltFeed", topic: "gunNest", name: "Belt feed", motto: "Faster, until it never stops", hue: "steel",
    ranks: [
      { name: "Belt feed", icon: "gear", cost: studyPathCost(4, 0), text: "Machine gunners reload 20% faster" },
      { name: "Heavy rounds", icon: "cannonball", cost: studyPathCost(4, 1), text: "Their bullets hit 40% harder" },
      { name: "Water jacket", icon: "volley", cost: studyPathCost(4, 2), text: "They reload 40% faster than at first" },
    ],
    legacyCrown: { from: "gunNest", item: "gatlingNest", name: "Gatling emplacement", cost: 50000, text: "This Machine-gun nest becomes a Gatling emplacement" },
  },
  {
    id: "tripod", topic: "gunNest", name: "Tripod", motto: "Set down, and reach further", hue: "verdant",
    ranks: [
      { name: "Tripod", icon: "spyglass", cost: studyPathCost(4, 0), text: "Machine gunners reach a cell further" },
      { name: "Traversing mount", icon: "crosshair", cost: studyPathCost(4, 1), text: "Their bullets hit 25% harder" },
      { name: "Long barrel", icon: "arrow", cost: studyPathCost(4, 2), text: "They reach 2 cells further in all" },
    ],
  },
  {
    id: "quickdraw", topic: "gunHall", name: "Quickdraw", motto: "Faster hands, then two guns", hue: "ember",
    ranks: [
      { name: "Quick hands", icon: "hand", cost: studyPathCost(4, 0), text: "Gunners reload 25% faster" },
      { name: "Fanning", icon: "volley", cost: studyPathCost(4, 1), text: "They reload 40% faster than at first" },
      { name: "Twin pistols", icon: "fork", cost: studyPathCost(4, 2), text: "Every shot also fires the second pistol at the next nearest enemy in reach" },
    ],
  },
  {
    id: "duelists", topic: "gunHall", name: "Duelists", motto: "One careful shot at a time", hue: "steel",
    ranks: [
      { name: "Powder charge", icon: "blast", cost: studyPathCost(4, 0), text: "Gunners' bullets hit 30% harder" },
      { name: "Long barrels", icon: "spyglass", cost: studyPathCost(4, 1), text: "They reach 1.5 cells further" },
      { name: "Duelist's mark", icon: "crosshair", cost: studyPathCost(4, 2), text: "Every 3rd shot hits three times as hard" },
    ],
  },
  {
    id: "gunShield", topic: "gatlingNest", name: "Gun shield", motto: "Armour the crew, wheel the gun", hue: "steel",
    ranks: [
      { name: "Gun shield", icon: "frostShield", cost: studyPathCost(4, 0), text: "Gatling gunners have 50% more life" },
      { name: "Wheeled carriage", icon: "gear", cost: studyPathCost(4, 1), text: "They push the gun twice as fast" },
      { name: "Armoured crew", icon: "helm", cost: studyPathCost(4, 2), text: "They have two and a half times the life" },
    ],
  },
  {
    id: "overdrive", topic: "gatlingNest", name: "Overdrive", motto: "All damage, no push", hue: "ember",
    ranks: [
      { name: "Hot loads", icon: "cannonball", cost: studyPathCost(4, 0), text: "Gatling gunners' bullets hit 40% harder" },
      { name: "Hollow points", icon: "blast", cost: studyPathCost(4, 1), text: "They hit 80% harder than at first" },
      { name: "Overdrive", icon: "inferno", cost: studyPathCost(4, 2), text: "They hit two and a half times as hard and crank 15% faster" },
    ],
  },
  {
    id: "stoppingPower", topic: "gatlingNest", name: "Stopping power", motto: "All push, little damage", hue: "frost",
    ranks: [
      { name: "Heavy slugs", icon: "hammer", cost: studyPathCost(4, 0), text: "Every bullet knocks its enemy back a little, but hits at only 35% of the damage" },
      { name: "Hail of lead", icon: "volley", cost: studyPathCost(4, 1), text: "Each knocks it back further, at 30% of the damage" },
      { name: "Wall of lead", icon: "frostShield", cost: studyPathCost(4, 2), text: "The stream holds back most walkers, at 25% of the damage. Bosses, fortresses and boats are not moved" },
    ],
  },
  {
    id: "clusterRockets", topic: "rocketBattery", name: "Cluster rockets", motto: "A bigger bang, then many", hue: "ember",
    ranks: [
      { name: "Big warheads", icon: "blast", cost: studyPathCost(4, 0), text: "Rockets burst half a cell wider" },
      { name: "Cluster bomblets", icon: "grape", cost: studyPathCost(4, 1), text: "Each burst throws 4 bomblets round it, each at 40% of the damage" },
      { name: "Firestorm", icon: "inferno", cost: studyPathCost(4, 2), text: "Each burst leaves the ground burning for 5 seconds" },
    ],
  },
  {
    id: "salvoRacks", topic: "rocketBattery", name: "Salvo racks", motto: "More rockets, sooner", hue: "steel",
    ranks: [
      { name: "Quick racks", icon: "gear", cost: studyPathCost(4, 0), text: "Rocketeers reload 25% faster" },
      { name: "Twin racks", icon: "volley", cost: studyPathCost(4, 1), text: "Each launch looses a second rocket at the next nearest enemy in reach" },
      { name: "Salvo", icon: "stars", cost: studyPathCost(4, 2), text: "Three rockets a launch, reloading 40% faster than at first" },
    ],
  },
  {
    id: "marksmen", topic: "sniperLodge", name: "Marksmen", motto: "Farther, and the biggest first", hue: "verdant",
    ranks: [
      { name: "Long rifles", icon: "spyglass", cost: studyPathCost(4, 0), text: "Snipers reach 3 cells further" },
      { name: "Big game", icon: "crosshair", cost: studyPathCost(4, 1), text: "They aim at the toughest enemy in reach, not the nearest" },
      { name: "Headshot", icon: "skull", cost: studyPathCost(4, 2), text: "Every 3rd shot is a headshot, 4× damage" },
    ],
  },
  {
    id: "ricochet", topic: "sniperLodge", name: "Ricochet", motto: "One bullet, many marks", hue: "steel",
    ranks: [
      { name: "Glancing shot", icon: "fork", cost: studyPathCost(4, 0), text: "A bullet that hits glances on to the nearest enemy within 2.5 cells, for 60% of the damage" },
      { name: "Hard-cast lead", icon: "cannonball", cost: studyPathCost(4, 1), text: "It glances on twice" },
      { name: "Pinball", icon: "bolt", cost: studyPathCost(4, 2), text: "It glances on four times, keeping 80% of the damage each time" },
    ],
  },
  {
    id: "suppressors", topic: "sniperLodge", name: "Suppressing fire", motto: "Pinned where they stand", hue: "frost",
    ranks: [
      { name: "Crippling shot", icon: "boot", cost: studyPathCost(4, 0), text: "Every hit slows its enemy for 2 seconds" },
      { name: "Pinning shot", icon: "stake", cost: studyPathCost(4, 1), text: "Every hit also staggers it, standing still, for 0.6 seconds" },
      { name: "Quick hands", icon: "gear", cost: studyPathCost(4, 2), text: "Snipers reload 40% faster" },
    ],
  },
  {
    id: "deadeye", topic: "sniperLodge", name: "Deadeye", motto: "One clear shot, one kill", hue: "verdant",
    ranks: [
      { name: "Clear sight", icon: "eye", cost: studyPathCost(4, 0), text: "Snipers take their time over every clear shot and hit 60% harder" },
      { name: "Patient aim", icon: "crosshair", cost: studyPathCost(4, 1), text: "They hit 120% harder" },
      { name: "Deadeye", icon: "skull", cost: studyPathCost(4, 2), text: "They hit three times as hard and reach 2 cells further" },
    ],
  },
  {
    id: "piercing", topic: "sniperLodge", name: "Piercing rounds", motto: "Through the whole file", hue: "steel",
    ranks: [
      { name: "Piercing rounds", icon: "arrow", cost: studyPathCost(4, 0), text: "Every bullet flies straight on to the end of its reach through every enemy in its line, each hit at 40% of the damage" },
      { name: "Hardened tips", icon: "shard", cost: studyPathCost(4, 1), text: "Each hit at 50% of the damage" },
      { name: "Rail rifles", icon: "spyglass", cost: studyPathCost(4, 2), text: "Each hit at 60%, reaching 2 cells further" },
    ],
  },
  {
    id: "fireArrows", topic: "brazierTower", name: "Fire arrows", motto: "Every arrow sets them alight", hue: "ember",
    ranks: [
      { name: "Pitch arrows", icon: "fireArrow", cost: studyPathCost(4, 0), text: "Burns last 3 seconds and burn hotter" },
      { name: "Wildfire", icon: "flame", cost: studyPathCost(4, 1), text: "Burns last 4 seconds and burn twice as hot" },
      { name: "Fire volley", icon: "volley", cost: studyPathCost(4, 2), text: "The tower looses 3 burning arrows at once, at the 3 nearest enemies" },
    ],
  },
  {
    id: "sharpshooters", topic: "hawkTower", name: "Sharpshooters", motto: "Far sight, deadly aim", hue: "verdant",
    ranks: [
      { name: "Hawk eyes", icon: "eye", cost: studyPathCost(4, 0), text: "The tower reaches 2 cells further in all" },
      { name: "Called shots", icon: "crosshair", cost: studyPathCost(4, 1), text: "Every 3rd arrow is critical, 3× damage" },
      { name: "Deadeye", icon: "skull", cost: studyPathCost(4, 2), text: "Arrows hit 60% harder, aimed at the strongest enemy in reach" },
    ],
  },
  {
    id: "gunnery", topic: "batteryTower", name: "Gun crews", motto: "Fast crews, scattering shot", hue: "steel",
    ranks: [
      { name: "Drilled crews", icon: "gear", cost: studyPathCost(4, 0), text: "The cannon reloads 25% faster in all" },
      { name: "Grapeshot", icon: "grape", cost: studyPathCost(4, 1), text: "Each shell bursts into 4 smaller blasts round where it lands" },
      { name: "Master gunners", icon: "mail", cost: studyPathCost(4, 2), text: "It reloads twice as fast as at first" },
    ],
  },
  {
    id: "siegeShot", topic: "mortarTower", name: "Siege shot", motto: "Slow, enormous blasts", hue: "ember",
    ranks: [
      { name: "Iron shot", icon: "cannonball", cost: studyPathCost(4, 0), text: "Shells hit 80% harder in all, and the cannon takes half again as long to reload" },
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
  {
    id: "starfall", topic: "meteor", name: "Starfall", motto: "One stone becomes a storm of them", hue: "storm",
    ranks: [
      { name: "Shattered sky", icon: "stars", cost: studyPathCost(4, 0), text: "The meteor breaks into 3 fragments over a wider area, each with 55% of its damage" },
      { name: "Meteor shower", icon: "volley", cost: studyPathCost(4, 1), text: "It breaks into 5 fragments" },
      { name: "Falling stars", icon: "meteor", cost: studyPathCost(4, 2), text: "7 fragments, each with 70% of its damage" },
    ],
  },
  {
    id: "moltenCore", topic: "meteor", name: "Molten core", motto: "The crater burns long after", hue: "ember",
    ranks: [
      { name: "Glowing crater", icon: "crater", cost: studyPathCost(4, 0), text: "The impact leaves a burning crater for 5 seconds, 10 damage a second to enemies on foot" },
      { name: "Lava pool", icon: "embers", cost: studyPathCost(4, 1), text: "The crater fills the whole blast, burning for 8 seconds at 16 damage a second" },
      { name: "Clinging magma", icon: "inferno", cost: studyPathCost(4, 2), text: "It burns for 12 seconds, and its fire clings to whoever walks out" },
    ],
  },
  {
    id: "frostComet", topic: "meteor", name: "Frost comet", motto: "A star of ice that stops them cold", hue: "frost",
    ranks: [
      { name: "Comet of ice", icon: "snowflake", cost: studyPathCost(4, 0), text: "Everything the blast hits is chilled for 3 seconds" },
      { name: "Hoarfrost wave", icon: "shard", cost: studyPathCost(4, 1), text: "Chilled for 5 seconds, and the blast reaches 25% farther" },
      { name: "Frozen heart", icon: "iceBlock", cost: studyPathCost(4, 2), text: "Everything it hits is frozen solid for 1.5 seconds first" },
    ],
  },
  {
    id: "shatter", topic: "frostNova", name: "Shatter", motto: "What freezes, breaks", hue: "frost",
    ranks: [
      { name: "Brittle", icon: "iceBlock", cost: studyPathCost(4, 0), text: "Enemies the nova freezes take 50% more damage until they thaw" },
      { name: "Shatter", icon: "shard", cost: studyPathCost(4, 1), text: "As each thaws it bursts into shards: 30 damage to it and every enemy within 1.2 cells" },
      { name: "Diamond dust", icon: "shards", cost: studyPathCost(4, 2), text: "50 damage over 1.6 cells; an enemy killed frozen or in the rime bursts too, and the shards freeze what they hit" },
    ],
  },
  {
    id: "blizzard", topic: "frostNova", name: "Wandering blizzard", motto: "A storm that hunts", hue: "storm",
    ranks: [
      { name: "Drifting snow", icon: "snowflake", cost: studyPathCost(4, 0), text: "The rime lasts 10 seconds and drifts toward the nearest enemy, a cell a second" },
      { name: "Whiteout", icon: "whirl", cost: studyPathCost(4, 1), text: "It lasts 12 seconds, grows by a third and refreezes everything inside every 3 seconds" },
      { name: "Eye of the storm", icon: "thunderhead", cost: studyPathCost(4, 2), text: "It lasts 16 seconds, hunts twice as fast, and its cold bites three times as hard" },
    ],
  },
  {
    id: "rimeWard", topic: "frostNova", name: "Rime ward", motto: "Winter shields its own", hue: "steel",
    ranks: [
      { name: "Frost mail", icon: "frostShield", cost: studyPathCost(4, 0), text: "Your troops and townsfolk in the rime take 35% less damage" },
      { name: "Hoarfrost walls", icon: "mail", cost: studyPathCost(4, 1), text: "Buildings in the rime take half damage too" },
      { name: "Winter's mercy", icon: "heart", cost: studyPathCost(4, 2), text: "Troops in the rime heal 6% of their health a second" },
    ],
  },
  {
    id: "hammerfall", topic: "reinforcements", name: "Hammerfall", motto: "They come down like thunder", hue: "ember",
    ranks: [
      { name: "Hard landing", icon: "blast", cost: studyPathCost(4, 0), text: "Each soldier lands with a shockwave: 20 damage to every enemy within a cell" },
      { name: "Earthshaker", icon: "crater", cost: studyPathCost(4, 1), text: "35 damage over 1.4 cells, and those it hits stagger, standing still for 1.5 seconds" },
      { name: "Champion's descent", icon: "hammer", cost: studyPathCost(4, 2), text: "A champion lands in the middle too: four times as tough, cleaving, with an 80-damage quake over 2.5 cells" },
    ],
  },
  {
    id: "muster", topic: "reinforcements", name: "Muster the levy", motto: "Many hands", hue: "verdant",
    ranks: [
      { name: "Levy", icon: "helm", cost: studyPathCost(4, 0), text: "Seven soldiers drop rather than four" },
      { name: "Bowmen", icon: "bow", cost: studyPathCost(4, 1), text: "Nine drop, every third an archer shooting from 4 cells" },
      { name: "Reserves", icon: "boot", cost: studyPathCost(4, 2), text: "Each who falls in battle is replaced once by a fresh one dropping in at the post" },
    ],
  },
  {
    id: "oathsworn", topic: "reinforcements", name: "Oathsworn", motto: "Bound to stand", hue: "steel",
    ranks: [
      { name: "Shield wall", icon: "mail", cost: studyPathCost(4, 0), text: "Each takes 10% less damage for every other of the squad within 2 cells, up to 30%" },
      { name: "Blood oath", icon: "dagger", cost: studyPathCost(4, 1), text: "Every enemy they slay adds 2 seconds to the whole squad's stay and heals the slayer 20%" },
      { name: "Last stand", icon: "oath", cost: studyPathCost(4, 2), text: "When its time runs out or it falls, each fights on unhurtable for 4 more seconds" },
    ],
  },
];

export const PATH_TOPICS = [...new Set(PATHS.map((p) => p.topic))];
/** The paths the wizard tower and the barracks wore before each branch
 * made a building of its own. */
const LEGACY_TOPICS: Partial<Record<PathTopic, PathId[]>> = { wizardTower: ["pyromancy", "rime", "storm"], barracks: ["crusaders", "berserkers", "halberdiers"], assassinDen: ["bloodletters", "shadowcloak", "venom"], archerTower: ["fireArrows", "sharpshooters"], cannonTower: ["gunnery", "siegeShot"] };
export const pathById = (id: PathId) => PATHS.find((p) => p.id === id)!;
export const pathsOf = (topic: string) => PATHS.filter((p) => p.topic === topic);

/** The topic whose paths a palette kind can wear: its own (the bait's and
 * the spikes' by their topic's name). Evolved kinds and everything else
 * have none. */
export function pathTopicOf(kind: string): PathTopic | undefined {
  const topic = kind === "monsterBait" ? "bait" : kind === "wallSpikes" ? "spikes" : kind;
  return !isSpell(topic) && PATHS.some((p) => p.topic === topic) ? (topic as PathTopic) : undefined;
}
/** Whether `path` is one of `kind`'s own paths. */
export const pathFits = (kind: string, path: PathId) => PATHS.some((p) => p.id === path && p.topic === pathTopicOf(kind));

/** What a building of each topic does when it wears no path, as the
 * placement choice reads it. */
export const UNSPECIALIZED: Record<PathTopic, string> = {
  wizardTower: "The original mix of fire and ice",
  pyreTower: "Flames only",
  frostTower: "Ice only, twice as often",
  stormTower: "Lightning through 2 enemies, alternating with ice",
  barracks: "Balanced swordsmen",
  chapterHouse: "Crusaders: a quarter more HP, a little slower",
  berserkerLodge: "Berserkers: strokes 15% faster",
  halberdYard: "Halberdiers: 0.3 cells more reach",
  heroHall: "One hero: two slashes, then a spin",
  valkyriePalace: "A marble palace on the ground",
  assassinDen: "Quick, frail assassins: every 4th strike critical",
  bloodHall: "Bloodletters: criticals 3×, a little frailer",
  veilHouse: "Cloaked assassins: unseen until they strike",
  poisonDen: "Poisoners: every strike envenoms for 3 seconds",
  spearHall: "Spearmen: a long reach",
  phalanx: "Hoplites: slow, shielded, hard to hurt",
  javelinCamp: "Javelineers: slow, heavy throws",
  lancerStable: "Lancers: fast riders, a charge at each new enemy",
  musketHall: "Musketmen: slow, heavy single balls",
  gunHall: "Gunners: quick pistol shots",
  gunNest: "Machine gunners: fast, light bullets",
  gatlingNest: "Gatling gunners: an enormous rate of fire and a crawl",
  rocketBattery: "Rocketeers: very slow rockets that burst",
  sniperLodge: "Snipers: slow, far, single hard shots",
  archerTower: "Steady single arrows",
  brazierTower: "Lit arrows: burns for 2 seconds",
  hawkTower: "A cell more reach",
  cannonTower: "Standard shells and blasts",
  batteryTower: "Reloads 15% faster",
  mortarTower: "Shells 40% harder, slower to reload",
  archerBarracks: "Ordinary archers",
  watchTower: "Marked enemies take double damage",
  mageGuild: "Ordinary fire mages",
  bait: "Plain stacks of bait",
  spikes: "Plain stakes that cut",
  necromancy: "One plain warrior a fallen enemy",
  meteor: "One great meteor",
  frostNova: "A burst of ice and a patch of rime",
  reinforcements: "Four soldiers who hold where they land",
};

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

/** Paths are researched once for the collection; each placed building wears one. */
export type PathResearch = Partial<Record<PathId, { rank: number; spent: number; crowned?: boolean }>>;
export function pathState(save: Save, id: PathId) {
  const p = pathById(id), research = save.pathResearch[id], rank = research?.rank ?? 0;
  const next = p.ranks[rank], affordable = !!next && (save.settings.devMode || save.knowledge >= next.cost);
  const crowned = !!research?.crowned;
  const crownAffordable = !!p.legacyCrown && (save.settings.devMode || save.knowledge >= p.legacyCrown.cost);
  // Only the spells are researched: each building is upgraded on its own
  // (`specializations.ts`).
  const sealed = !isSpell(p.topic);
  return { rank, sealed, next, maxed: !next, affordable, canLearn: !!next && affordable && !sealed,
    crowned, crownAffordable, canEvolve: !!p.legacyCrown && !next && !crowned && crownAffordable && !sealed };
}

/** The path whose crown makes `item` (base kinds stay for sale after it). */
export const evolvedBy = (item: PaletteItem): KnowledgePath | undefined => PATHS.find(p => p.legacyCrown?.item === item);

/** Unlock a crown. Evolving a copy is a separate, free choice (`evolveOne`). */
export function evolve(save: Save, id: PathId, prepaid?: number): boolean {
  const st = pathState(save, id), p = pathById(id);
  if (!p.legacyCrown || !st.maxed || st.crowned || st.sealed || (prepaid === undefined && !st.canEvolve)) return false;
  const cost = prepaid ?? (save.settings.devMode ? 0 : p.legacyCrown.cost);
  if (prepaid === undefined) save.knowledge -= cost;
  const r = save.pathResearch[id]!;
  r.crowned = true; r.spent += cost;
  return true;
}

export function learnPath(save: Save, id: PathId, prepaid?: number): boolean {
  const st = pathState(save, id);
  if (!st.next || st.sealed || (prepaid === undefined && !st.canLearn)) return false;
  const cost = prepaid ?? (save.settings.devMode ? 0 : st.next.cost);
  if (prepaid === undefined) save.knowledge -= cost;
  // Buildings wearing the path fight at its new rank from the next defense:
  // the rank is read from here when a battle starts.
  save.pathResearch[id] = { rank: st.rank + 1, spent: (save.pathResearch[id]?.spent ?? 0) + cost };
  // A spell with no path yet casts with the first one researched.
  const topic = pathById(id).topic;
  if (isSpell(topic) && !save.spellPaths[topic]) save.spellPaths[topic] = id;
  return true;
}

/** Refund this topic's research: buildings wearing its paths go back to
 * unspecialized, and every evolved copy back to its base kind (those
 * standing in the city return to the palette). */
export function unlearnPath(save: Save, topic: PathTopic): number {
  let spent = 0;
  const d = save.defend, layout = cloneLayout(d.layout);
  for (const p of pathsOf(topic)) {
    spent += save.pathResearch[p.id]?.spent ?? 0;
    delete save.pathResearch[p.id];
    for (const placed of [...layout.structures, ...layout.spikes]) if (placed.path === p.id) delete placed.path;
    if (p.legacyCrown) {
      const { from, item } = p.legacyCrown;
      d.owned[from] += d.owned[item];
      d.owned[item] = 0;
      layout.structures = layout.structures.filter((s) => s.kind !== item);
    }
  }
  d.layout = layout;
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
    out[p.id] = { rank: r.rank, spent: r.spent, ...(r.crowned === true && p.legacyCrown && r.rank === p.ranks.length ? { crowned: true } : {}) };
  }
  return out;
}

/** Keeps only well formed choices: a known topic, its own path, a rank it
 * has, and Knowledge spent as a finite count. */
export function decodePaths(raw: unknown): PathChoices {
  const out: PathChoices = {};
  if (!raw || typeof raw !== "object") return out;
  // Before each branch made a building of its own, its paths were the
  // wizard tower's or the barracks'.
  for (const topic of new Set([...PATH_TOPICS, ...(Object.keys(LEGACY_TOPICS) as PathTopic[])])) {
    const c = (raw as Record<string, unknown>)[topic] as Partial<PathChoice> | undefined;
    if (!c || typeof c !== "object") continue;
    const p = PATHS.find((p) => p.id === c.path && (p.topic === topic || !!LEGACY_TOPICS[topic]?.includes(p.id)));
    if (!p || !Number.isInteger(c.rank) || c.rank! < 1 || c.rank! > p.ranks.length) continue;
    if (typeof c.spent !== "number" || !Number.isFinite(c.spent) || c.spent < 0) continue;
    out[topic] = { path: p.id, rank: c.rank!, spent: c.spent };
    if (p.legacyCrown && c.rank === p.ranks.length && Number.isInteger(c.crowned) && c.crowned! >= 0 && c.crowned! <= 999) out[topic]!.crowned = c.crowned;
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
