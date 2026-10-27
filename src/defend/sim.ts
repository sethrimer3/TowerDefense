import type { ChronoState, DivineArrow, ReleasedArrow } from "./chrono.ts";
import { ageMageChill, type MageChill, type MageBolt } from "./mage-attunements.ts";
import { stepMines, type Mine } from "./mines.ts";
import { BASTIONS, keepRank } from "../keep-upgrades.ts";
import { buildingPaths } from "../specializations.ts";
import { DefenderIndex } from "./defender-index.ts";
import { Atmosphere, groundWeather } from "./atmosphere.ts";
import { areaForWave } from "./areas.ts";
import { boulderPlan, hasForest } from "./forest.ts";
import { IceMotion } from "./ice-motion.ts";
import { icyCell } from "./boats.ts";
import { enemySize } from "./catalog.ts";
import { assembleFortress, syncFortress } from "./fortress.ts";
import { damageModifier } from "./enemy-abilities.ts";
import { stepBlackHoles, stepPoison } from "./hostile-attacks.ts";
import { stepSiegeShots, type SiegeAim, type SiegeShot } from "./siege.ts";
/** Real-time DEFEND simulation. Units move freely in continuous cell
 * coordinates (1 unit = 1 cell); the procedural city supplies the solid
 * obstacles. Enemies follow a flow field toward the keep in which buildings
 * and walls are passable at a cost (they must be smashed first), so enemies
 * prefer the streets but will break through when that is much shorter.
 *
 * A run starts from a freshly generated city and never resets between
 * waves: whatever is destroyed stays destroyed unless civilians rebuild it.
 *
 * `DefendSim` owns the world (buildings, crowds, waves, the enemy index)
 * and what happens to it (damage, rebuilding, blasts, movement). What each
 * kind of unit decides to do lives beside it: `enemies.ts`, `troops.ts`,
 * `mages.ts`, `valkyries.ts`, `dark-wizards.ts`, `civilians.ts` and
 * `towers.ts`, with grid pathing in `pathing.ts`. */
import { MAX_WAVE_ENEMIES, buildWave, waveDifficulty } from "./waves.ts";
import { BattleStats } from "./battle-stats.ts";
export { buildWave } from "./waves.ts";
import { dist, sq } from "../exact.ts";
import { CELL_COUNT, CELLS_H, CELLS_W, cellIndex, cellX, cellY, rng, sideCells } from "./grid.ts";
import {
  BOMB_DAMAGE,
  BOMB_RADIUS,
  ENEMIES,
  FRIENDLY_FIRE,
  HOUSE_HP_PER_CELL,
  STRUCTURES,
  GATE,
  BALLISTA,
  gateHpScale,
  SPIKES,
  keepHp,
  wallHp,
  watchRadius,
  NO_BONUSES,
  type Bonuses,
  type EnemyKind,
  type UpgradeId,
} from "./catalog.ts";
import { CellType, type Building, type CityMap } from "./citygen.ts";
import { atHome, escaped, Builders } from "./civilians.ts";
import { stepEnemy } from "./enemies.ts";
import { blocked, cellAt, cellCenter, center, fillFlowField, nearestOpen, type FieldTerrain, type Point } from "./pathing.ts";
import { ignite, stepArrows, stepShells, Towers } from "./towers.ts";
import type { WispArrow, WispTowerState } from "./wisp-arrow.ts";
import type { WispTrail } from "./wisp-trail.ts";
import type { WispFireTrail } from "./wisp-fire.ts";
import { FORTIFY, SHATTER, SIGNAL, SPOTTERS, pathRank } from "../knowledge-paths.ts";
import { Barracks, stepArcher, stepSwordsman } from "./troops.ts";
import { cloaked, spreadVenom, stepVenom } from "./assassins.ts";
import { nanoDeath, stepNano, type Infection, type NanoBurst, type NanoCloud, type NanoShell } from "./nanobots.ts";
import { perched } from "./gun-sight.ts";
import { fence, type Rally } from "./deployment.ts";
import { hopliteGuard } from "./spears.ts";
import { heroRises, stepHero, stepSwings, type Swing } from "./hero.ts";
import { stepBlades, stepBleed, stepShade, type Blade } from "./shadow.ts";
import { stepBlazes, stepFireballs, stepMage, type Blaze, type Fireball } from "./mages.ts";
import { stepStabs, stepValkyrie, type Stab } from "./valkyries.ts";
import { launchPalaces, stepSkyPalaces, type SkyPalace } from "./sky-palace.ts";
import { Wizards, stepFlames, stepFrosts, type Flame, type Frost } from "./wizard.ts";
import { DarkKeeps, stepBolts, stepDarkWizard, type Bolt } from "./dark-wizards.ts";
import { WarBanner, bannerInfluence, stepBannerLife } from "./war-banner.ts";
import { castMeteor, METEOR, stepMeteors, type Impact, type Meteor } from "./meteor.ts";
import { quench } from "./fire-ice.ts";
import { castFrostNova, FROST_NOVA, frostDeath, stepFrostNova, wardBuilding, wardDefender, type FrostBurst, type Rime } from "./frost-nova.ts";
import { calledFell, castReinforcements, REINFORCE, shieldWall, stepReinforcement, stepReinforcements, type Called, type Drop as Descent, type Landing } from "./reinforcements.ts";
import { ageGraves, bury, castNecromancy, NECRO, stepUndead, type Grave, type Raising, type Risen } from "./necromancy.ts";
import { sheltered, fizzles, stepFloods, type Flood, type Sinking } from "./boats.ts";
import { baitFell, baitStanding } from "./bait.ts";
import { stepGates } from "./gates.ts";
import { IRONBOUND, gateBarred, gateRank } from "../gate-upgrades.ts";
import { stepBallistaBolts, stepPlacedWalls, stepSpikes, trappedWallFell, type BallistaBolt, type SpikeThrust } from "./wall-defenses.ts";
import { STONEWORK, TOWN_WALLS, wallRank } from "../wall-upgrades.ts";

export type Levels = Record<UpgradeId, number>;

export type DamageOrigin=Point&{attacker?:number;building?:number;home?:number};
export type Enemy = {
  /** Javelin carrying this enemy; absent outside an active impalement. */
  impaled?: number;
  /** Target adapter for an opposing native troop/building in a raid. Not a rendered monster. */
  raidProxy?: boolean;
  raidBuilding?: boolean;
  escaped?: boolean;
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cd: number;
  /** Personal offset inside each cell so a crowd spreads across the street. */
  jx: number;
  jy: number;
  distract: number;
  distractT: number;
  rollT: number;
  marked: boolean;
  markDamage?: number;
  flash: number;
  /** Seconds left chilled by a wizard's ice (slowed); absent when not, so
   * a run without ice keeps its state exactly as before. */
  chill?: number;
  mageChills?: MageChill[];
  /** Seconds left frozen solid by Rime's deep freeze (stopped); absent when not. */
  freeze?: number;
  /** Frozen by a Frost nova under Shatter: harder hit until it thaws; absent when not. */
  brittle?: true;
  /** Seconds left staggered by a Hammerfall landing (standing still); absent when not. */
  stagger?: number;
  /** Seconds left burning from a fire arrow, and the burn's damage a
   * second; absent when not burning. */
  burn?: number;
  burnDps?: number;
  burnOrigin?:DamageOrigin;
  /** The share of its pace a signal fire leaves it while marked; absent otherwise. */
  slowed?: number;
  fortressPart?: { core: number; role: "turret" | "leg" | "armor"; dx: number; dy: number };
  fortressParts?: Enemy[];
  facing?: { x: number; y: number };
  /** Locked, axis-aligned destination for a sliding cube. */
  iceSlide?: { x: number; y: number; cell: number };
  burrow?: number;
  blink?: { x: number; y: number; t: number };
  abilityT?: number;
  raised?: number;
  raisedDamage?: number;
  reborn?: boolean;
  slash?: { dx: number; dy: number; t: number };
  dive?: number;
  leader?: number;
  shieldHp?: number;
  poisonT?: number;
  /** An assassin's venom: seconds left, the share more damage it takes,
   * its bite a second and whether it spreads on death; absent when not
   * poisoned, so runs without Venomblades keep their state as before. */
  venom?: { t: number; more: number; dps: number; spread?: true; origin?:DamageOrigin };
  /** A Hemorrhage knife's cut: damage a second and seconds left; absent
   * when not bleeding (`shadow.ts`). */
  bleed?: { dps: number; t: number; origin?:DamageOrigin };
  /** C4 nanobots in it: the blast it makes as it dies (`nanobots.ts`);
   * absent when not infected. */
  nano?: Infection;
  breath?: { dx: number; dy: number; t: number };
  /** What a siege engine is shooting at; absent while it rolls on. */
  aim?: SiegeAim;
};

export type Soldier = {
  /** Presentation marker for the opposing native army in Siege. */
  raidEnemy?: boolean;
  /** Ordinary Skyranger attacks; rain arrows never advance this counter. */
  skyShots?: number;
  id: number;
  /** Swordsmen chase and hack; archers roam and shoot; fire mages roam
   * and hurl fireballs; valkyries hunt and charge-stab; the dark wizard
   * hunts and casts chain lightning; the spearmen line's spearmen,
   * hoplites and lancers chase like swordsmen, its javelineers roam and
   * throw like archers; the Hero hunts the city with its sword combos; the Shadow's shade
   * hunts it with knives that loop out through crowds. */
  kind: "sword" | "archer" | "mage" | "valkyrie" | "darkWizard" | "undead" | "reinforcement" | "brawler" | "slinger" | "sniper" | "musketeer" | "gunner" | "machineGunner" | "gatlingGunner" | "rocketeer" | "railSniper" | "assassin"
    | "spearman" | "hoplite" | "javelineer" | "lancer" | "hero" | "shade";
  home: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  cd: number;
  target: number;
  path: number[];
  thinkT: number;
  flash: number;
  /** Seconds left that nothing can hurt her (a valkyrie after a charge);
   * absent otherwise, so runs without valkyries keep their state as before. */
  guard?: number;
  bannerLife?: number;
  /** Strikes an assassin (or a Marksmen sniper, shots) has made, every few
   * critical; absent for everyone else. */
  strikes?: number;
  /** A Shadowcloak assassin's seconds until it is cloaked again (0: cloaked,
   * and no enemy picks it out); absent for everyone else. */
  cloak?: number;
  /** The enemy a lancer last struck: its next thrust at any other is a
   * charge; absent for everyone else. */
  lanced?: number;
  /** An Undying Hero that has already risen once; absent for everyone else. */
  rallied?: true;
  /** What a shade's next knife multiplies its damage by, gathered hit by
   * hit (`shadow.ts`); absent for everyone else. */
  edge?: number;
  /** A warrior the Necromancy spell raised (`home` -1); absent for everyone else. */
  risen?: Risen;
  /** A soldier the Reinforcements spell dropped (`home` -1); absent for everyone else. */
  called?: Called;
  /** A gunner's watch tower (building id): bound for it, or `up` in it
   * (`gun-sight.ts`); absent for everyone else. */
  perch?: { tower: number; up?: true };
};

export type Civilian = {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  job: number;
  /** Absent for ordinary rebuilding. Sand is always the lowest priority. */
  jobKind?: "sand";
  cleanupCheck?: number;
  state: "toJob" | "working" | "home" | "flee";
  /** Off-board destination once a stranded builder panics. */
  exit?: Point;
  work: number;
  path: number[];
  home: number;
  thinkT: number;
  flash: number;
  /** The open cell beside its job it works from, when the job is walled in
   * (by its building's own rebuilt cells); absent otherwise, so runs where
   * every job can be stood in keep their state exactly as before. */
  stand?: number;
};

export type Arrow = {
  chronoReleased?: true;
  release?: ReleasedArrow;
  bowJavelin?: import("./archer-attunements.ts").BowJavelin;
  volleyIndex?: number;
  sky?: import("./archer-attunements.ts").SkyArrow;
  x: number; y: number; target: number; damage: number; tx: number; ty: number; life: number; origin?: Point & { attacker?: number; building?: number };
  /** A fire arrow's burn: damage a second, and for how long; absent otherwise. */
  burn?: number; burnFor?: number;
  /** What flies, when not an arrow: a thrown stone, a sniper's bullet or a
   * musketman's ball; absent for arrows. */
  shot?: "stone" | "bullet" | "ball" | "rocket" | "javelin";
  /** An explosive ball's burst radius where it hits (sparing your own
   * people); absent otherwise. */
  blast?: number;
  /** A Grenadier's ball: the ground it leaves burning (for `life` seconds at
   * `dps`, clinging at III) and the bomblets it throws; absent otherwise. */
  grenade?: { life: number; dps: number; bomblets: number; cling?: true };
  /** Stopping power: how far each hit knocks its enemy straight back from
   * `origin`; absent otherwise. */
  knock?: number;
  /** A piercing bullet: it flies straight to (`tx`, `ty`) (its `target` is
   * -1), striking every enemy within `width` of its line once (`hits`);
   * absent otherwise. */
  pierce?: { width: number; hits: number[] };
  /** A Ricochet bullet: the glances it has left, the share of the damage
   * each keeps and the enemies already struck; absent otherwise. */
  glance?: { left: number; share: number; struck: number[] };
  /** Suppressing fire: how long a hit slows (and from II staggers) its
   * enemy; absent otherwise. */
  pin?: { chill: number; stagger?: number };
  /** A Revolutionary's bullet: the enemies (by id) it flies on to after this
   * one, and where this leg of its flight began; absent otherwise. */
  chain?: { next: number[]; from: Point };
};
export type Effect = { kind: "boom" | "dust" | "spark" | "firework" | "steam"; x: number; y: number; t: number; r: number; seed?: number };
/** A cannon shell in flight: lobbed from the tower to where the target was. */
export type Shell = {
  chronoReleased?: true;
  chronoAim?: number;
  x0: number; y0: number; x1: number; y1: number; t: number; dur: number; damage: number; r: number; origin?: Arrow["origin"];
  /** Gun crews (a Study path): bursting into grapeshot; absent otherwise. */
  grape?: boolean;
  mortar?: { dps: number; life: number };
  mine?: { smart: boolean };
};
/** Glowing cracks left where something exploded; they cool and fade. */
export type Scorch = { x: number; y: number; r: number; seed: number; t: number; life: number };
export type SimEvent = { type: "waveStart" | "waveCleared" | "lost"; wave: number };

/** How a unit moves this step. Flying units ignore buildings. */
/** `own`: one of the city's people, whom its gates let through. */
export type Stride = { speed: number; dt: number; flying?: boolean; own?: boolean };
/** A blast's radius and centre damage (40% at the edge); with friendly fire
 * it also hurts your own people. */
export type Blast = { r: number; damage: number; friendlyFire: boolean; origin?: Arrow["origin"] };

const STEP = 1 / 30;
const STEP_SOLDIER: Record<Soldier["kind"], (sim: DefendSim, s: Soldier, dt: number) => void> = {
  sword: stepSwordsman,
  archer: stepArcher,
  mage: stepMage,
  valkyrie: stepValkyrie,
  darkWizard: stepDarkWizard,
  undead: stepUndead,
  reinforcement: stepReinforcement,
  brawler: stepSwordsman,
  slinger: stepArcher,
  sniper: stepArcher,
  musketeer: stepArcher,
  gunner: stepArcher,
  machineGunner: stepArcher,
  gatlingGunner: stepArcher,
  railSniper: stepArcher,
  rocketeer: stepArcher,
  assassin: stepSwordsman,
  spearman: stepSwordsman,
  hoplite: stepSwordsman,
  lancer: stepSwordsman,
  javelineer: stepArcher,
  hero: stepHero,
  shade: stepShade,
};
/** How long a struck building flashes, in seconds. */
export const BUILDING_FLASH = 0.14;
const BREAK_SECONDS = 3;
/** Where a Mother's young land around her, as fractions of her half-size:
 * the corners of a triangle (exact constants, so every engine agrees). */
const HATCH_SPOTS = [
  { x: 0, y: -1 },
  { x: -0.866, y: 0.5 },
  { x: 0.866, y: 0.5 },
];

/** Optional mode rules. Absent in ordinary Defend, including all replay fixtures. */
export type ScenarioRules = {
  manualWaves?: boolean;
  passiveEnemies?: boolean;
  noCivilians?: boolean;
  unrestricted?: boolean;
  ignoreKeepLoss?: boolean;
  owns?: (building: Building) => boolean;
  routeEnemy?: (enemy: Enemy, dt: number) => boolean;
  died?: (enemy: Enemy) => void;
  soldierDt?: (soldier: Soldier, dt: number) => number;
  fieldFor?: (enemy: Point) => Float64Array | undefined;
};

export class DefendSim {
  /** Optional scenario statistics; ordinary Defend allocates no attribution table. */
  tally?:(building:number,damage:number,killed:boolean)=>void;
  tallyHomes?:Map<number,number>;
  tallyOrigin(origin?:DamageOrigin):DamageOrigin|undefined{
    if(!this.tally||!origin)return undefined;
    const building=origin.building??origin.home??(origin.attacker!==undefined?this.tallyHomes?.get(origin.attacker)??this.soldiers.find(s=>s.id===origin.attacker)?.home:undefined);
    return building===undefined?undefined:{x:origin.x,y:origin.y,building};
  }

  scenario?: ScenarioRules;
  readonly map: CityMap;
  readonly levels: Levels;
  /** Training and skill-tree multipliers (all 1 without them). */
  readonly bonuses: Readonly<Bonuses>;
  /** How many times the damage a marked enemy takes (Spotters raise it). */

  /** Enemies slain this run, by kind: what the run pays out. Not part of
   * the replayed state. */
  /** The run's tally for the summary when the keep falls; not part of the
   * replayed state. */
  readonly stats = new BattleStats();
  readonly slain: Record<EnemyKind, number> = { roach: 0, orc: 0, ogre: 0, bat: 0, warlord: 0, mother: 0, broodling: 0, snake: 0, dragon: 0, shieldBearer: 0, aegis: 0, darkKnight: 0, bombOrc: 0, bombBird: 0, voidSparrow: 0, shieldLesser: 0, shieldGreater: 0, poisonLesser: 0, poisonBearer: 0, poisonGreater: 0, poisonSovereign: 0, siegeBeetle: 0, burrowingMole: 0, necromancer: 0, skeleton: 0, bannerCaptain: 0, mirrorKnight: 0, leechSwarm: 0, ashPhoenix: 0, phoenixEgg: 0, blinkImp: 0, fortressHut: 0, fortressOutpost: 0, fortressTower: 0, fortressKeep: 0, fortressLesser: 0, fortress: 0, fortressGreater: 0, fortressSovereign: 0, rollingCannon: 0, ballista: 0, fireworkLauncher: 0, trebuchet: 0, bombard: 0, rocketBattery: 0, boatDinghy: 0, boatSailboat: 0, boatCutter: 0, boatCog: 0, boatLesser: 0, boat: 0, boatGreater: 0, boatSovereign: 0, iceGolem: 0, iceCube: 0, briarling: 0, mossBoar: 0, rootTreant: 0, duneScorpion: 0, sunScarab: 0, sandVulture: 0, sporeling: 0, fungalBrute: 0, sporeMoth: 0, shardling: 0, crystalSentinel: 0, prismRay: 0, starWisp: 0, cometHound: 0, astralWarden: 0, brineCrab: 0, lanternJelly: 0, coralGuardian: 0, fernMantis: 0, mossTroll: 0, lanternHornet: 0, glassJackal: 0, duneTortoise: 0, dustDjinn: 0, cinderImp: 0, slagGolem: 0, emberMoth: 0, kelpStalker: 0, capCrawler: 0, myceliumHulk: 0, rotMite: 0, geodeCrab: 0, prismMoth: 0, shardBrood: 0, cryptHound: 0, graveWisp: 0, novaMoth: 0 };
  /** 1 while a cell is part of a standing (built) building. */
  readonly solid: Uint8Array;
  /** What blocks the city's own people: `solid`, but for the standing city
   * gates, which open for them. The same array when there are no gates. */
  readonly ownSolid: Uint8Array;
  /** `solid` as the enemy walks it: open gates open. The same array when
   * there are no gates, or Portcullis bars them all. */
  readonly foeSolid: Uint8Array;
  readonly hp: Float32Array;
  readonly maxHp: Float32Array;
  /** Built cells per building; == cells.length when intact. */
  readonly built: Int32Array;
  readonly field = new Float64Array(CELL_COUNT);
  /** The monster bait on the board, and the flow field toward the nearest
   * standing stack (empty when there is none on the board). */
  readonly baits: Building[];
  readonly baitField: Float64Array;
  /** How often each stack of bait has fallen this run. */
  readonly baitFalls = new Map<number, number>();
  /** Seconds left on each building's hit flash. */
  readonly flash: Float32Array;
  /** Cells whose solidity changed since the renderer last drained this. */
  changed: number[] = [];
  /** 1 on the forest's boulders while the battle is in an area with a
   * forest (`syncBoulders`): solid like ponds, owned by no building. */
  readonly rocks = new Uint8Array(CELL_COUNT);
  private rocky = false;
  enemies: Enemy[] = [];
  soldiers: Soldier[] = [];
  civilians: Civilian[] = [];
  arrows: Arrow[] = [];
  readonly chrono = new Map<number, ChronoState>();
  divineArrows: DivineArrow[] = [];
  wisps: WispArrow[] = [];
  wispFireTrails: WispFireTrail[] = [];
  wispLightningTrails: WispTrail[] = [];
  wispFireTime = 0;
  readonly wispOwners = new Map<number, WispTowerState>();
  shells: Shell[] = [];
  /** Proximity mines and directed aim, reset with each battle. */
  mines: Mine[] = [];
  mineAims = new Map<number, { x: number; y: number }>();
  /** Troop buildings' rally points by building id, as the player aimed
   * them this battle (`deployment.ts`); not part of the replayed state. */
  readonly rallies = new Map<number, Rally>();
  /** Siege engines' balls, bolts, stones and rockets in flight. */
  siegeShots: SiegeShot[] = [];
  /** Wizard towers' fire and ice. */
  flames: Flame[] = [];
  frosts: Frost[] = [];
  /** Fire mages' fireballs in flight, and the ground they set burning. */
  fireballs: Fireball[] = [];
  mageBolts: MageBolt[] = [];
  blazes: Blaze[] = [];
  /** Valkyries' charge stabs, fading. */
  stabs: Stab[] = [];
  /** The Hero's slashes, spins and dashes, fading (presentation; not replayed). */
  swings: Swing[] = [];
  /** The shades' knives looping out and back (presentation; not replayed). */
  blades: Blade[] = [];
  /** C4 nanobots' shells in flight, their clouds, and infected enemies just
   * dead waiting to burst (`nanobots.ts`); empty without the tower. */
  nanoShells: NanoShell[] = [];
  nanoClouds: NanoCloud[] = [];
  nanoBursts: NanoBurst[] = [];
  /** Cloudborne Valkyrie palaces drifting across the sky (`sky-palace.ts`); empty without any. */
  skyPalaces: SkyPalace[] = [];
  /** Black lightning from dark keeps' turrets and dark wizards, fading. */
  bolts: Bolt[] = [];
  /** Wall ballistas' bolts in flight, and which way each ballista last
   * shot (a unit vector, by building id). */
  ballistaBolts: BallistaBolt[] = [];
  readonly ballistaAim = new Map<number, { x: number; y: number }>();
  /** Seconds until the wall spikes next cut whoever is against them. */
  spikeT = SPIKES.every;
  /** Seconds until spikes that went off are ready again, keyed by wall stone
   * (blasting stakes) or row (spring stakes); and the rows' thrusts being
   * drawn. Both empty without those Study paths. */
  readonly spikeArm = new Map<number, number>();
  spikeThrusts: SpikeThrust[] = [];
  /** The stones of the walls the player placed on their own (empty without
   * any), and whether the city's own people pass through them (Town walls'
   * posterns). */
  readonly pieces: Building[];
  /** The city's gates; and while one stands open to the enemy too (until
   * Portcullis bars it), the seconds until it shuts, by building id. */
  readonly gates: Building[];
  readonly gateOpen = new Map<number, number>();
  /** Gate upgrades (`gates.ts`): seconds until the murder holes next drop,
   * until each fallen gate rises again (Ironbound III), and until each gate
   * ballista may shoot again (keyed `gateTower`). All empty without them. */
  gateHoleT = 0;
  readonly gateRise = new Map<number, number>();
  readonly gateTowerT = new Map<number, number>();
  readonly posterns: boolean;
  scorches: Scorch[] = [];
  effects: Effect[] = [];
  /** The war banner the player planted, rallying the troops; null when none
   * stands (and so in every run without one). */
  warBanner: WarBanner | null = null;
  bannerReadyAt = 0;
  get bannerCooldown() { return this.bonuses.banner?.cooldown ?? 10; }
  get bannerRemaining() { return Math.max(0, this.bannerReadyAt - this.time); }
  /** Where enemies fell, which the Necromancy spell can raise (`necromancy.ts`),
   * the casts still flaring, and when it can be cast again. */
  graves: Grave[] = [];
  raisings: Raising[] = [];
  necroReadyAt = 0;
  get necroCooldown() { return NECRO.cooldown; }
  get necroRemaining() { return Math.max(0, this.necroReadyAt - this.time); }
  /** Meteors falling from a Meteor strike (`meteor.ts`), their landings'
   * rings, and when it can be cast again; both lists empty without a cast. */
  meteors: Meteor[] = [];
  impacts: Impact[] = [];
  meteorReadyAt = 0;
  get meteorCooldown() { return METEOR.cooldown; }
  get meteorRemaining() { return Math.max(0, this.meteorReadyAt - this.time); }
  /** The Frost nova's rime (`frost-nova.ts`), its bursts, the enemies Shatter
   * made brittle, and when it can be cast again; all empty without a cast. */
  rime: Rime[] = [];
  frostBursts: FrostBurst[] = [];
  brittle: Enemy[] = [];
  frostReadyAt = 0;
  get frostCooldown() { return FROST_NOVA.cooldown; }
  get frostRemaining() { return Math.max(0, this.frostReadyAt - this.time); }
  /** The Reinforcements (`reinforcements.ts`) on their way down, the rings
   * their landings and departures leave, how many squads have been called,
   * and when it can be cast again; all empty without a cast. */
  drops: Descent[] = [];
  landings: Landing[] = [];
  squads = 0;
  reinforceReadyAt = 0;
  get reinforceCooldown() { return REINFORCE.cooldown; }
  get reinforceRemaining() { return Math.max(0, this.reinforceReadyAt - this.time); }
  /** Magic boats' water, drying up behind them, and the buildings it sank
   * going under; both empty in every run without boats. */
  floods: Flood[] = [];
  /** Local, transient mist and sand. Allocated only in the affected areas. */
  atmosphere: Atmosphere | null = null;
  /** Explicit debug weather, otherwise the current area's climate. */
  snowOverride?: boolean;
  get cold() { return this.snowOverride ?? areaForWave(this.wave).climate === "cold"; }
  readonly iceMotion = new IceMotion();
  readonly thawedPonds = new Set<number>();
  iceBlast(x: number, y: number, r: number) { if (this.cold || this.floods.some(f => f.frozen)) this.iceMotion.blast(this, x, y, r); }
  sinkings: Sinking[] = [];
  events: SimEvent[] = [];
  wave = 0;
  /** Manual enemy testing: no automatic waves or wave-clear rewards. */
  private tester = false;
  get unitTester() { return this.tester; }
  time = 0;
  lost = false;
  breakT = 1.5;
  spawnQueue: EnemyKind[] = [];
  private spawnInterval = 0;
  blackHoles: { x: number; y: number; r: number; damage: number; life: number; pulse: number; seed: number }[] = [];
  corpses: { x: number; y: number; life: number; hp?: number; damage?: number }[] = [];
  bannerCarriers: Enemy[] = [];
  private waveSpawned = 0;
  private shieldGenerators: Enemy[] = [];
  private enemyLookup = new Map<number, Enemy>();
  private enemyLookupActive = false;
  private stationaryAttacks = false;
  private blastIndexReady = false;
  spawnT = 0;
  /** Bumped whenever a building is destroyed or rebuilt (static art changes). */
  mapVersion = 0;
  speed = 1;
  /** The run's random stream. Units draw from it in step order, so a run
   * replays exactly from its seed. */
  readonly rand: () => number;
  readonly keepId: number;
  /** Open city streets, for archers to wander between. */
  readonly streets: number[];
  private fieldDirty = true;
  private fieldT = 0;
  private acc = 0;
  private nextId = 1;
  private terrain: FieldTerrain;
  private towers = new Towers();
  private barracks = new Barracks();
  private wizards = new Wizards();
  private darkKeeps = new DarkKeeps();
  private builders: Builders;
  private grid: Enemy[][] = Array.from({ length: CELL_COUNT }, () => []);
  private gridUsed: number[] = [];
  private defenders = new DefenderIndex();
  private defenderIndexActive = false;

  constructor(map: CityMap, levels: Levels, seed = 1, bonuses: Readonly<Bonuses> = NO_BONUSES, keepId?: number) {
    this.map = map;
    this.levels = levels;
    this.bonuses = bonuses;
    this.rand = rng(seed);
    const n = map.buildings.length;
    this.solid = new Uint8Array(CELL_COUNT);
    this.hp = new Float32Array(n);
    this.maxHp = new Float32Array(n);
    this.built = new Int32Array(n);
    this.flash = new Float32Array(n);
    for (const b of map.buildings) {
      if (b.hidden) continue;
      this.hp[b.id] = this.maxHp[b.id] = maxHpOf(b, levels, bonuses);
      this.built[b.id] = b.cells.length;
      for (const c of b.cells) this.solid[c] = 1;
    }
    // Ponds block movement like buildings do, but belong to no building.
    for (let i = 0; i < CELL_COUNT; i++) if (map.type[i] === CellType.WATER) this.solid[i] = 1;
    this.pieces = map.buildings.filter((b) => b.piece);
    this.posterns = !!this.pieces.length && wallRank(bonuses.walls, "townWalls") >= TOWN_WALLS.posterns;
    const gates = map.buildings.filter((b) => b.kind === "gate" || (this.posterns && b.piece));
    this.ownSolid = gates.length ? this.solid.slice() : this.solid;
    for (const b of gates) for (const c of b.cells) this.ownSolid[c] = 0;
    this.gates = map.buildings.filter((b) => b.kind === "gate");
    this.foeSolid = this.gates.length && !gateBarred(bonuses.gate) ? this.solid.slice() : this.solid;
    this.keepId = keepId ?? map.buildings.find((b) => b.kind === "keep")!.id;
    this.baits = map.buildings.filter((b) => b.kind === "monsterBait");
    this.baitField = new Float64Array(this.baits.length ? CELL_COUNT : 0);
    this.builders = new Builders(levels);
    this.skyPalaces = launchPalaces(this);
    this.streets = streetCells(map);
    this.terrain = {
      solid: this.foeSolid,
      impassable: (i) => map.type[i] === CellType.WATER || this.rocks[i] === 1,
      cost: (i) => this.enterCost(i),
    };
  }

  /** Reconfigure a preallocated scenario lot using native HP, collision and art state. */
  configureLot(id: number, kind: Exclude<Building["kind"], "wall" | "gate" | "wallBallista">, rect: Building["rect"], active: boolean, health=1) {
    const b = this.map.buildings[id];
    for (const cell of b.cells) if (this.map.owner[cell] === id) {
      this.map.owner[cell] = -1; this.map.type[cell] = CellType.PARK;
      this.solid[cell] = this.ownSolid[cell] = this.foeSolid[cell] = 0;
    }
    this.soldiers = this.soldiers.filter(s => s.home !== id);
    this.skyPalaces = this.skyPalaces.filter(p => p.id !== id);
    this.towers.cooldown.delete(id); this.towers.focus.delete(id); this.barracks.training.delete(id);
    this.wizards.next.delete(id); this.wizards.rest.delete(id);
    for(let corner=0;corner<4;corner++)this.darkKeeps.cooldown.delete(id*4+corner);
    this.rallies.delete(id);this.mineAims.delete(id);
    this.chrono.delete(id); this.wispOwners.delete(id);
    b.kind = kind; b.rect = { ...rect }; b.hidden = !active;
    b.cells = [];
    for (let y=rect.y;y<rect.y+rect.h;y++) for (let x=rect.x;x<rect.x+rect.w;x++) b.cells.push(cellIndex(x,y));
    this.maxHp[id] = active ? maxHpOf(b,this.levels,this.bonuses) : 0;
    this.hp[id] = this.maxHp[id]*health;
    this.built[id] = active && health>0 ? b.cells.length : 0;
    if (active) for (const cell of b.cells) {
      this.map.owner[cell]=id; this.map.type[cell]=kind==='house'?CellType.HOUSE:CellType.STRUCT;
      this.solid[cell]=this.ownSolid[cell]=this.foeSolid[cell]=health>0?1:0;
    }
    const structure=this.map.structures.find(s=>s.uid===b.structureUid);
    if (structure && kind!=='house') { structure.kind=kind; structure.rect={...rect}; }
    const old=this.skyPalaces;
    this.skyPalaces=launchPalaces(this).filter(p=>p.id===id && active || old.some(o=>o.id===p.id)).map(p=>old.find(o=>o.id===p.id)??p);
    this.changed.push(...b.cells); this.mapVersion++; this.fieldDirty=true; this.fieldT=0;
  }

  get keep(): Building {
    return this.map.buildings[this.keepId];
  }
  keepHp() {
    return this.hp[this.keepId];
  }
  keepMaxHp() {
    return this.maxHp[this.keepId];
  }
  /** Whether building `id` is a palace floating in the sky, out of reach. */
  aloft(id: number) {
    return this.skyPalaces.length > 0 && this.skyPalaces.some((p) => p.id === id);
  }
  ownsBuilding(b: Building) { return this.scenario?.owns?.(b) ?? true; }
  intact(b: Building) {
    return !b.hidden && this.ownsBuilding(b) && this.built[b.id] === b.cells.length;
  }
  newId() {
    return this.nextId++;
  }

  /** Advance by real elapsed seconds (fixed internal timestep). */
  update(seconds: number) {
    if (this.lost) return;
    this.acc += Math.min(seconds, 0.25) * this.speed;
    while (this.acc >= STEP && !this.lost) {
      this.acc -= STEP;
      this.step(STEP);
    }
  }

  step(dt: number) {
    this.time += dt;
    if (this.wave > 0) this.stats.current.seconds += dt;
    this.fieldT -= dt;
    this.syncBoulders();
    if (this.fieldDirty && this.fieldT <= 0) this.computeField();
    this.runWaves(dt);
    if (this.skyPalaces.length) stepSkyPalaces(this, dt);
    if (!this.atmosphere && groundWeather(areaForWave(this.wave).id)) this.atmosphere = new Atmosphere();
    this.atmosphere?.step(this, dt);
    this.indexEnemies();
    this.markEnemies();
    this.stepUnits(dt);
    stepBlackHoles(this, dt);
    stepPoison(this, dt);
    this.sweepAway();
    this.tick(dt);
    if (!this.scenario?.ignoreKeepLoss && this.hp[this.keepId] <= 0 && !this.lost) {
      this.lost = true;
      this.events.push({ type: "lost", wave: this.wave });
    }
  }

  /** Everyone acts, in a fixed order (it decides the random draws). */
  private stepUnits(dt: number) {
    this.bannerCarriers = this.enemies.filter(e => e.hp > 0 && e.kind === "bannerCaptain");
    ageGraves(this, dt);
    for (const corpse of this.corpses) corpse.life -= dt;
    this.corpses = this.corpses.filter(c => c.life > 0);
    // Defenders do not move or spawn until after all enemies have acted.
    // Outside this phase, direct callers retain the live linear lookup.
    this.defenderIndexActive = this.enemies.length >= 32 && this.soldiers.length + this.civilians.length >= 16;
    if (this.defenderIndexActive) this.defenders.rebuild(this.soldiers, this.civilians);
    try {
      this.enemyLookup.clear();
      this.enemyLookupActive = this.enemies.some(e => e.fortressPart);
      if (this.enemyLookupActive) for (const e of this.enemies) this.enemyLookup.set(e.id, e);
      if (!this.scenario?.passiveEnemies) for (const e of this.enemies) if (e.hp > 0) stepEnemy(this, e, dt);
    } finally {
      this.defenderIndexActive = false;
      this.enemyLookupActive = false;
      this.enemyLookup.clear();
    }
    for (const e of this.enemies) if (e.fortressParts) syncFortress(e);
    // Projectiles and friendly attacks do not move/spawn enemies. Preserve
    // the first blast's reindex timing, then share that snapshot until
    // builders push enemies out or ice slides them at the end of the tick.
    this.stationaryAttacks = true;
    this.blastIndexReady = false;
    try {
      this.stepAttacks(dt);
    } finally {
      this.stationaryAttacks = false;
      this.blastIndexReady = false;
    }
    if (!this.scenario?.noCivilians) this.builders.step(this, dt);
    this.iceMotion.step(this, dt);
  }

  private stepAttacks(dt: number) {
    this.towers.step(this, dt);
    stepArrows(this, dt);
    stepBallistaBolts(this, dt);
    stepSpikes(this, dt);
    stepPlacedWalls(this, dt);
    stepGates(this, dt);
    stepShells(this, dt);
    stepMines(this, dt);
    stepNano(this, dt);
    stepSiegeShots(this, dt);
    this.wizards.step(this, dt);
    stepFlames(this, this.wizards, dt);
    stepFrosts(this, dt);
    this.darkKeeps.step(this, dt);
    this.barracks.step(this, dt);
    this.warBanner?.refresh(this);
    for (const s of this.soldiers) {
      stepBannerLife(this, s, dt);
      const x0 = s.x, y0 = s.y;
      const soldierDt = this.scenario?.soldierDt?.(s, dt) ?? dt;
      if (soldierDt > 0) STEP_SOLDIER[s.kind](this, s, soldierDt);
      fence(this, s, x0, y0);
      stepBannerLife(this, s, 0);
    }
    stepMeteors(this, dt);
    stepFrostNova(this, dt);
    stepReinforcements(this, dt);
    stepFireballs(this, dt);
    stepBlazes(this, dt);
    quench(this);
    stepFloods(this, dt);
  }

  /** The dead, and civilians who made it indoors, leave the board; a
   * Mother's brood bursts out where she fell. */
  private sweepAway() {
    const hatched: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.hp > 0) continue;
      if (e.escaped || e.raidBuilding) continue;
      this.scenario?.died?.(e);
      if (!e.fortressPart) {
        this.slain[e.kind]++;
        this.stats.current.slain++;
      }
      if (e.fortressParts) for (const part of e.fortressParts) part.hp = 0;
      bury(this, e);
      frostDeath(this, e);
      nanoDeath(this, e);
      if (!e.fortressPart && !ENEMIES[e.kind].fortress && !ENEMIES[e.kind].hatched && e.kind !== "ashPhoenix" && this.corpses.length < MAX_WAVE_ENEMIES) this.corpses.push({ x: e.x, y: e.y, life: 10, hp: Math.max(1, e.maxHp * .4), damage: ENEMIES[e.kind].damage * .4 });
      if (e.kind === "ashPhoenix" && !e.reborn) {
        const egg = this.spawnAuxiliary("phoenixEgg", e.x, e.y);
        if (egg) egg.abilityT = 5;
      }
      const splits = ENEMIES[e.kind].splits;
      if (splits) for (let n = 0; n < splits.count && this.waveSpawned < MAX_WAVE_ENEMIES; n++, this.waveSpawned++) hatched.push(this.hatch(splits.into, e, n, splits.count));
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.shieldGenerators = this.shieldGenerators.filter(e => e.hp > 0);
    this.enemies.push(...hatched);
    for (const s of this.soldiers) if (s.hp <= 0 && s.called) calledFell(this, s);
    for (const s of this.soldiers) if (s.hp <= 0 && !s.risen && !s.called) this.stats.current.troopsLost++;
    for (const c of this.civilians) if (c.hp <= 0) this.stats.current.civiliansLost++;
    this.soldiers = this.soldiers.filter((s) => s.hp > 0);
    this.civilians = this.civilians.filter((c) => c.hp > 0 && !atHome(this, c) && !escaped(c));
  }

  /** Effects age, scorches cool, hit flashes fade. */
  private tick(dt: number) {
    if (this.mageBolts.length) {
      for (const b of this.mageBolts) b.t += dt;
      this.mageBolts = this.mageBolts.filter(b => b.t < b.life);
    }
    for (const e of this.enemies) ageMageChill(e, dt);
    for (const fx of this.effects) fx.t += dt;
    this.effects = this.effects.filter((fx) => fx.t < 0.6);
    for (const s of this.scorches) s.t += dt;
    this.scorches = this.scorches.filter((s) => s.t < s.life);
    for (const units of [this.enemies, this.soldiers, this.civilians]) for (const u of units) u.flash = Math.max(0, u.flash - dt);
    for (const e of this.enemies) if (e.slash && (e.slash.t -= dt) <= 0) delete e.slash;
    for (const e of this.enemies) if (e.breath && (e.breath.t -= dt) <= 0) delete e.breath;
    for (const e of this.enemies)
      if (e.chill !== undefined && (e.chill -= dt) <= 0) delete e.chill;
    for (const e of this.enemies)
      if (e.freeze !== undefined && (e.freeze -= dt) <= 0) delete e.freeze;
    for (const e of this.enemies)
      if (e.stagger !== undefined && (e.stagger -= dt) <= 0) delete e.stagger;
    for (const e of this.enemies) {
      if (e.burn === undefined) continue;
      if (e.hp > 0 && !sheltered(this, e.x, e.y)) this.hurtEnemy(e, e.burnDps! * Math.min(dt, e.burn), false, "ranged", e.burnOrigin, false, "fire");
      if ((e.burn -= dt) <= 0) {
        delete e.burn;
        delete e.burnDps;
        if(e.burnOrigin)delete e.burnOrigin;
      }
    }
    stepVenom(this, dt);
    stepBleed(this, dt);
    for (const s of this.soldiers)
      if (s.guard !== undefined && (s.guard -= dt) <= 0) delete s.guard;
    stepStabs(this, dt);
    stepSwings(this, dt);
    stepBlades(this, dt);
    stepBolts(this, dt);
    for (let i = 0; i < this.flash.length; i++) if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - dt);
  }

  // ── Waves ─────────────────────────────────────────────────────────────
  /** Starts the defense on `wave` rather than the first, before the first
   * step. The opening break is shorter than a wave's, so the wave before is
   * never counted as cleared. */
  startAt(wave: number) {
    if (this.time === 0 && this.wave === 0) this.wave = Math.max(1, Math.floor(wave)) - 1;
  }

  startUnitTester() {
    if (this.time !== 0 || this.wave !== 0) return;
    this.tester = true;
    this.wave = 1;
    this.stats.begin(1, 0, 0);
  }

  /** Uses ordinary enemy assembly, including chain segments and fortress parts. */
  summonEnemy(kind: EnemyKind): boolean {
    if (!this.tester || this.lost || !ENEMIES[kind]) return false;
    this.waveSpawned = this.enemies.length;
    const def = ENEMIES[kind], fort = def.fortress;
    const slots = fort ? 1 + fort.turrets + fort.legs + fort.armor : def.chainLength ?? 1;
    if (this.waveSpawned + slots > MAX_WAVE_ENEMIES) return false;
    const before = this.enemies.length;
    this.spawnEnemy(kind);
    if (this.enemies.length === before) return false;
    this.stats.current.spawned++;
    return true;
  }

  private runWaves(dt: number) {
    if (this.scenario?.manualWaves) return;
    if (this.tester) { this.waveSpawned = this.enemies.length; return; }
    if (this.spawnQueue.length) {
      this.spawnT -= dt;
      while (this.spawnT <= 0 && this.spawnQueue.length) {
        // Release every wave over five seconds, including at the fixed 30 Hz step.
        if (!this.spawnInterval) this.spawnInterval = 5 / this.spawnQueue.length;
        this.spawnT += this.spawnInterval;
        this.spawnEnemy(this.spawnQueue.pop()!);
      }
      return;
    }
    if (this.enemies.length) return;
    if (this.wave > 0 && this.breakT === BREAK_SECONDS) this.events.push({ type: "waveCleared", wave: this.wave });
    this.breakT -= dt;
    if (this.breakT <= 0) {
      this.wave++;
      this.breakT = BREAK_SECONDS;
      this.spawnQueue = buildWave(this.wave, this.rand);
      this.spawnInterval = 0;
      this.waveSpawned = 0;
      this.spawnT = 0;
      this.stats.begin(this.wave, waveDifficulty(this.wave), this.spawnQueue.length);
      this.events.push({ type: "waveStart", wave: this.wave });
    }
  }

  /** A scenario wave shares native spawning limits and battle statistics. */
  beginManualWave(wave: number, budget: number, count: number) {
    this.wave=wave;this.waveSpawned=0;this.stats.begin(wave,budget,count);
  }

  releaseEnemy(kind: EnemyKind, at: Point) { const before=this.enemies.length; this.spawnEnemy(kind,at); return this.enemies.length>before; }

  private spawnEnemy(kind: EnemyKind, at?: Point) {
    const fort = ENEMIES[kind].fortress;
    if (this.waveSpawned + (fort ? 1 + fort.turrets + fort.legs + fort.armor : 1) > MAX_WAVE_ENEMIES) return;
    for (let tries = 0; tries < 20; tries++) {
      const margin = fort ? ENEMIES[kind].size / 2 + 1 : 1;
      const x = at?.x ?? margin + this.rand() * (CELLS_W - 2 * margin);
      const y = at?.y ?? (fort ? fort.height / 2 + .5 : .5) + this.rand() * 2;
      if (blocked(this.solid, x, y)) continue;
      this.enemies.push(this.newEnemy(kind, x, y));
      this.waveSpawned++;
      let leader = this.enemies[this.enemies.length - 1];
      if (fort) assembleFortress(this, leader);
      const length = ENEMIES[kind].chainLength ?? 1;
      for (let n = 1; n < length && this.waveSpawned < MAX_WAVE_ENEMIES; n++) {
        const segment = this.newEnemy(kind, x, Math.max(0.25, y - n * 0.3));
        segment.leader = leader.id;
        this.enemies.push(segment);
        this.waveSpawned++;
        leader = segment;
      }
      return;
    }
  }

  /** The `n`th of `count` young of `kind` bursting from `mother`: spread
   * evenly around where she fell, or on the spot if that is inside a wall. */
  private hatch(kind: EnemyKind, mother: Enemy, n: number, count: number): Enemy {
    const k = HATCH_SPOTS[n % HATCH_SPOTS.length];
    const r = enemySize(mother) * 0.5;
    const x = mother.x + k.x * r,
      y = mother.y + k.y * r;
    const free = x > 0 && y > 0 && x < CELLS_W && y < CELLS_H && !blocked(this.solid, x, y);
    const young = free ? this.newEnemy(kind, x, y) : this.newEnemy(kind, mother.x, mother.y);
    // They burst out at a run, then scatter before they think to fight.
    young.cd = 0.4 + (n / count) * 0.2;
    return young;
  }

  spawnAuxiliary(kind: EnemyKind, x: number, y: number): Enemy | null {
    if (this.waveSpawned >= MAX_WAVE_ENEMIES) return null;
    const enemy = this.newEnemy(kind, x, y);
    this.enemies.push(enemy);
    this.waveSpawned++;
    return enemy;
  }

  private newEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const hp = ENEMIES[kind].hp;
    const enemy: Enemy = {
      id: this.newId(),
      kind,
      x,
      y,
      hp,
      maxHp: hp,
      cd: 0,
      jx: (this.rand() - 0.5) * 0.5,
      jy: (this.rand() - 0.5) * 0.5,
      distract: -1,
      distractT: 0,
      rollT: this.rand() * 0.5,
      marked: false,
      flash: 0,
      ...(kind === "burrowingMole" ? { burrow: 1 } : {}),
      ...(ENEMIES[kind].shield ? { shieldHp: ENEMIES[kind].shield!.hp } : {}),
    };
    if (ENEMIES[kind].shield) this.shieldGenerators.push(enemy);
    if (this.enemyLookupActive) this.enemyLookup.set(enemy.id, enemy);
    return enemy;
  }

  // ── Flow field ────────────────────────────────────────────────────────
  /** Cost of stepping out of a cell for a ground enemy. */
  private enterCost(i: number): number {
    if (this.foeSolid[i]) {
      const b = this.map.owner[i];
      return 3 + this.hp[b] / 6;
    }
    return this.map.type[i] === CellType.ROAD ? 1 : 1.25;
  }

  computeField() {
    this.fieldDirty = false;
    this.fieldT = 0.25;
    fillFlowField(this.field, this.keep.cells, this.terrain);
    if (this.baits.length) fillFlowField(this.baitField, this.baits.filter((b) => this.intact(b)).flatMap((b) => b.cells), this.terrain);
  }

  /** The field enemies on foot walk: toward the nearest standing bait while
   * any stands, else the keep. */
  marchField(enemy?: Point): Float64Array {
    if(enemy){const field=this.scenario?.fieldFor?.(enemy);if(field)return field;}
    return this.baits.length && baitStanding(this) ? this.baitField : this.field;
  }
  /** Native weighted routing toward a scenario's current objective. */
  targetField(goals: readonly number[]) {
    const field=new Float64Array(CELL_COUNT);fillFlowField(field,goals,this.terrain);return field;
  }

  // ── Enemy index ───────────────────────────────────────────────────────
  /** During enemy movement, IDs are stable but positions are not. Direct
   * callers outside that phase still see the current enemy array. */
  livingEnemy(id: number): Enemy | undefined {
    const e = this.enemyLookupActive ? this.enemyLookup.get(id) : this.enemies.find(e => e.id === id);
    return e && e.hp > 0 ? e : undefined;
  }

  /** Same cell-order ties as enemiesNear, without a candidate array per
   * lightning hop. Only test the struck set for improving candidates. */
  chainTarget(x: number, y: number, r: number, struck: Set<number>): Enemy | null {
    let best: Enemy | null = null, bd = r * r;
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(CELLS_W - 1, Math.floor(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(CELLS_H - 1, Math.floor(y + r));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++)
      for (const e of this.grid[cellIndex(cx, cy)]) {
        if (e.hp <= 0) continue;
        const d = sq(e.x - x) + sq(e.y - y);
        if ((d < bd || (d === bd && !best)) && !struck.has(e.id)) { best = e; bd = d; }
      }
    return best;
  }

  private indexEnemies() {
    for (const i of this.gridUsed) this.grid[i].length = 0;
    this.gridUsed.length = 0;
    for (const e of this.enemies) {
      const i = cellAt(e.x, e.y);
      if (!this.grid[i].length) this.gridUsed.push(i);
      this.grid[i].push(e);
    }
  }

  /** Friendly projectiles that move enemies invalidate the shared blast snapshot. */
  reindexAfterDisplacement() {
    this.indexEnemies();
    this.blastIndexReady = this.stationaryAttacks;
  }

  /** Enemies within `r` of a point (uses the cell index). */
  enemiesNear(x: number, y: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    const x0 = Math.max(0, Math.floor(x - r)),
      x1 = Math.min(CELLS_W - 1, Math.floor(x + r));
    const y0 = Math.max(0, Math.floor(y - r)),
      y1 = Math.min(CELLS_H - 1, Math.floor(y + r));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++)
        for (const e of this.grid[cellIndex(cx, cy)]) if (e.hp > 0 && sq(e.x - x) + sq(e.y - y) <= r * r) out.push(e);
    return out;
  }

  private markEnemies() {
    for (const e of this.enemies) { e.marked = false; delete e.slowed; delete e.markDamage; }
    for (const b of this.map.buildings) {
      if (b.kind !== "watchTower" || !this.intact(b)) continue;
      const p = buildingPaths(this, b), signal = pathRank(p, "watchTower", "signalFires"), spot = pathRank(p, "watchTower", "spotters");
      const c = center(b.rect), r = watchReach(this, b);
      for (const e of this.enemiesNear(c.x, c.y, r)) {
        e.marked = true;
        if (this.bonuses.structurePaths) e.markDamage = Math.max(e.markDamage ?? 2, SPOTTERS.mark[spot]);
        if (!signal) continue;
        e.slowed = Math.min(e.slowed ?? 1, SIGNAL.slow[signal]);
        if (signal >= 3) ignite(e, SIGNAL.burn, 0.5);
      }
    }
  }

  /** The living soldier or civilian nearest (x, y) within `r`. */
  nearestDefender(x: number, y: number, r: number): Soldier | Civilian | null {
    if (this.defenderIndexActive && Number.isFinite(x + y + r)) return this.defenders.nearest(x, y, r);
    let best: Soldier | Civilian | null = null, bd = r * r;
    // Keep the original last-wins tie order without allocating a list per enemy.
    for (let team = 0; team < 2; team++) {
      const units = team === 0 ? this.soldiers : this.civilians;
      for (const u of units) {
        if (u.hp <= 0 || cloaked(u) || perched(u)) continue;
        const d = sq(u.x - x) + sq(u.y - y);
        if (d <= bd) { best = u; bd = d; }
      }
    }
    return best;
  }

  // ── Damage and rebuilding ─────────────────────────────────────────────
  /** Hurts `e` (double when marked); a steady burn hurts it without the
   * flash of a blow. */
  hurtEnemy(e: Enemy, amount: number, flash = true, source: "ranged" | "melee" = "ranged", origin?: DamageOrigin, projectile = false, element: "physical" | "fire" | "explosion" = "physical", pierce = 0) {
    if (e.hp <= 0 || !Number.isFinite(amount) || amount <= 0) return false;
    if (source === "ranged") {
      let shield: Enemy | undefined;
      for (const g of this.shieldGenerators) {
        if (g.hp <= 0 || !((g.shieldHp ?? 0) > 0) ||
          sq(g.x - e.x) + sq(g.y - e.y) > sq(ENEMIES[g.kind].shield!.radius)) continue;
        if (!shield || g.shieldHp === Infinity) shield = g;
        if (g.shieldHp === Infinity) break;
      }
      if (shield) {
        if (shield.shieldHp !== Infinity) shield.shieldHp = Math.max(0, shield.shieldHp! - amount);
        return false;
      }
    }
    if (e.kind === "mirrorKnight" && projectile && source === "ranged" && origin) {
      const reflected = amount * .4;
      if (origin.attacker !== undefined) {
        const shooter = this.soldiers.find(s => s.id === origin.attacker && s.hp > 0);
        if (shooter && !shooter.guard) { this.hurtDefender(shooter, reflected); shooter.flash = .12; }
      } else if (origin.building !== undefined) this.damageBuilding(origin.building, reflected);
    }
    // Armor piercing cuts through `pierce` of whatever armor holds a blow
    // back (never a burrowed mole's ground).
    const through = (m: number) => (pierce && m < 1 ? m + (1 - m) * pierce : m);
    const guard = damageModifier(this, e, origin, source, projectile);
    amount *= e.kind === "burrowingMole" ? guard : through(guard);
    if (e.kind === "iceGolem" && element !== "physical") amount *= 2;
    amount *= through(ENEMIES[e.kind].damageScale?.[element] ?? 1);
    if (e.brittle && e.freeze) amount *= SHATTER.brittle[1];
    if (e.venom) amount *= e.venom.more;
    if (amount <= 0) return false;
    const hit = e.marked ? amount * (e.markDamage ?? SPOTTERS.mark[pathRank(this.bonuses.paths, "watchTower", "spotters")]) : amount;
    this.stats.current.dealt += Math.min(e.hp, hit);
    if(this.tally){const from=this.tallyOrigin(origin);if(from?.building!==undefined)this.tally(from.building,Math.min(e.hp,hit),e.hp-hit<=0&&!e.fortressPart);}
    e.hp -= hit;
    if (flash) e.flash = 0.12;
    if (e.hp <= 0) {
      this.effects.push({ kind: "spark", x: e.x, y: e.y, t: 0, r: enemySize(e) });
      if (e.venom) spreadVenom(this, e);
    }
    return true;
  }

  hurtDefender(unit: Soldier | Civilian, amount: number) {
    if (unit.hp <= 0 || ("guard" in unit && unit.guard)) return 0;
    if ("kind" in unit) stepBannerLife(this, unit, 0);
    const damage = amount * (this.bonuses.banner?.defense && "kind" in unit && bannerInfluence(this, unit) ? 1 - this.bonuses.banner.defense : 1) * wardDefender(this, unit) * shieldWall(this, unit) * hopliteGuard(this, unit);
    const dealt = Math.min(unit.hp, damage);
    unit.hp -= damage;
    if (unit.hp <= 0 && "kind" in unit && unit.kind === "hero") heroRises(this, unit);
    return dealt;
  }

  damageBuilding(id: number, amount: number) {
    if (this.hp[id] <= 0 || this.aloft(id)) return;
    amount *= wardBuilding(this, id);
    if (Number.isFinite(amount) && amount > 0) this.stats.current[id === this.keepId ? "keep" : "city"] += Math.min(this.hp[id], amount);
    this.hp[id] -= amount;
    this.flash[id] = BUILDING_FLASH;
    if (this.hp[id] <= 0) this.collapse(this.map.buildings[id]);
  }

  /** A magic boat's water sinks building `id` whole: it goes under and
   * leaves its rubble when the water dries. */
  sink(id: number) {
    if (this.aloft(id)) return;
    this.sinkings.push({ building: id, t: 0 });
    this.collapse(this.map.buildings[id], false);
  }

  private collapse(b: Building, dust = true) {
    const whole = this.intact(b);
    if (this.built[b.id] > 0) this.stats.current.fell++;
    this.hp[b.id] = 0;
    this.built[b.id] = 0;
    for (const c of b.cells) this.solid[c] = this.ownSolid[c] = this.foeSolid[c] = 0;
    if (this.gateOpen.delete(b.id)) this.fieldDirty = true;
    this.changed.push(...b.cells);
    const p = center(b.rect);
    if (dust) this.effects.push({ kind: "dust", x: p.x, y: p.y, t: 0, r: Math.max(b.rect.w, b.rect.h) * 0.7 });
    this.fieldDirty = true;
    this.mapVersion++;
    if (b.kind === "monsterBait" && whole) {
      // Every enemy turns at once for the next stack (or the keep).
      this.fieldT = 0;
      baitFell(this, b, dust);
    }
    // A trapped wall stone bursts as it breaks (not as it sinks).
    if (b.piece && whole && dust) trappedWallFell(this, b);
  }

  /** Civilians restore a building one cell at a time; it regains its
   * function once the last cell is back. */
  rebuildCell(cell: number) {
    const id = this.map.owner[cell];
    if (id < 0 || this.solid[cell] || icyCell(this, cell) || this.aloft(id)) return;
    const b = this.map.buildings[id];
    this.solid[cell] = 1;
    if (b.kind !== "gate" && !(b.piece && this.posterns)) this.ownSolid[cell] = 1;
    this.foeSolid[cell] = 1;
    this.changed.push(cell);
    this.built[id]++;
    this.hp[id] = Math.min(this.maxHp[id], this.hp[id] + this.maxHp[id] / b.cells.length);
    this.pushOut(cell);
    this.fieldDirty = true;
    if (b.kind === "monsterBait" && this.intact(b)) this.fieldT = 0;
    this.mapVersion++;
  }

  /** Raises the forest's boulders on entering an area with a forest and
   * clears them on leaving it: they block everyone on foot, like ponds. */
  private syncBoulders() {
    const rocky = hasForest(areaForWave(this.wave).id);
    if (rocky === this.rocky) return;
    this.rocky = rocky;
    for (const b of boulderPlan(this.map))
      for (const c of b.cells) {
        if (rocky && this.solid[c]) continue;
        if (!rocky && !this.rocks[c]) continue;
        const v = rocky ? 1 : 0;
        this.rocks[c] = this.solid[c] = this.ownSolid[c] = this.foeSolid[c] = v;
        if (rocky) this.pushOut(c);
      }
    this.fieldDirty = true;
    this.fieldT = 0;
    this.mapVersion++;
  }

  /** Nudge any unit on foot standing in a cell that just became solid. */
  private pushOut(cell: number) {
    const cx = cellX(cell),
      cy = cellY(cell);
    const units: Point[] = [...this.enemies.filter((e) => !ENEMIES[e.kind].flying), ...this.soldiers, ...this.civilians];
    for (const u of units) {
      if (Math.floor(u.x) !== cx || Math.floor(u.y) !== cy) continue;
      const to = nearestOpen(this.solid, cx, cy, u);
      if (to) [u.x, u.y] = to;
    }
  }

  /** A blast: full damage at the centre falling to 40% at the edge. Returns
   * the seed its fireball and scorch are drawn from. */
  explode(x: number, y: number, { r, damage, friendlyFire, origin }: Blast): number {
    this.atmosphere?.disturb(x, y, r * 1.6 + .5, 0, 0, true);
    // A blast in a magic boat's water fizzles.
    if (fizzles(this, x, y, r)) return 0;
    if (!this.stationaryAttacks || !this.blastIndexReady) {
      this.indexEnemies();
      this.blastIndexReady = this.stationaryAttacks;
    }
    const hit = (d: number) => damage * (1 - 0.6 * Math.min(1, d / r));
    for (const e of this.enemiesNear(x, y, r)) if (!sheltered(this, e.x, e.y)) this.hurtEnemy(e, hit(dist(e.x - x, e.y - y)), true, "ranged", origin ?? { x, y }, !!origin, "explosion");
    if (friendlyFire)
      for (const u of [...this.soldiers, ...this.civilians]) {
        const d = dist(u.x - x, u.y - y);
        if (d > r || u.hp <= 0 || ("guard" in u && u.guard) || sheltered(this, u.x, u.y)) continue;
        this.hurtDefender(u, hit(d) * FRIENDLY_FIRE);
        u.flash = 0.12;
      }
    const seed = (this.rand() * 1e9) | 0;
    this.effects.push({ kind: "boom", x, y, t: 0, r, seed });
    this.scorches.push({ x, y, r, seed, t: 0, life: 1 + Math.min(2, r * 0.45) + this.rand() * 0.5 });
    return seed;
  }

  // ── Movement ──────────────────────────────────────────────────────────
  /** An open cell beside a building, preferring streets. */
  /** Opens gate `b` to the enemy as well (or shuts it again), for the
   * gates' own step (`gates.ts`) to call. */
  openToFoes(b: Building, open: boolean) {
    for (const c of b.cells) this.foeSolid[c] = open ? 0 : this.solid[c];
    this.fieldDirty = true;
  }

  doorOf(b: Building): number {
    const sides = sideCells(b.rect).filter((i) => !this.solid[i]);
    return sides.find((i) => this.map.type[i] === CellType.ROAD) ?? sides[0] ?? -1;
  }

  /** Steer a unit toward a point with light crowd separation; returns false
   * if it made no headway (stuck against something). */
  moveToward(u: Point, to: Point, { speed, dt, flying = false, own = false }: Stride): boolean {
    let dx = to.x - u.x,
      dy = to.y - u.y;
    const len = dist(dx, dy);
    if (len < 0.02) return true;
    dx /= len;
    dy /= len;
    const [sx, sy] = "kind" in u && ENEMIES[(u as Enemy).kind]?.unyielding ? [0, 0] : this.separation(u);
    if ("kind" in u && ((u as Enemy).kind === "siegeBeetle" || ENEMIES[(u as Enemy).kind]?.siege)) (u as Enemy).facing = { x: dx, y: dy };
    const step = Math.min(len, speed * dt);
    const mx = dx * step + sx * 0.5 * speed * dt * 4;
    const my = dy * step + sy * 0.5 * speed * dt * 4;
    if (flying) {
      u.x += mx;
      u.y += my;
      return true;
    }
    const ox = u.x,
      oy = u.y;
    const [ix, iy] = this.iceMotion.move(this, u, mx, my, dt, own);
    this.iceMotion.slide(this, u, ix, iy, own);
    return Math.abs(u.x - ox) + Math.abs(u.y - oy) > step * 0.1;
  }

  /** A push away from enemies crowding within 0.45 cells. */
  private separation(u: Point): [number, number] {
    let sx = 0,
      sy = 0;
    const x0 = Math.max(0, Math.floor(u.x - .45)), x1 = Math.min(CELLS_W - 1, Math.floor(u.x + .45));
    const y0 = Math.max(0, Math.floor(u.y - .45)), y1 = Math.min(CELLS_H - 1, Math.floor(u.y + .45));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const list = this.grid[cellIndex(x, y)];
      // Dense crowds use at most 8 representatives per cell. Ordinary crowds
      // keep exact separation; bounded work avoids quadratic pile-ups at walls.
      const stride = Math.max(1, Math.ceil(list.length / 8));
      const offset = ('id' in u ? (u.id as number) : 0) % stride;
      for (let i = offset; i < list.length; i += stride) {
        const o = list[i];
        if (o === u) continue;
        const ox = u.x - o.x,
          oy = u.y - o.y;
        if (o.hp <= 0 || sq(ox) + sq(oy) > .45 * .45) continue;
        const d = dist(ox, oy) || 0.01;
        sx += (ox / d) * (0.45 - d);
        sy += (oy / d) * (0.45 - d);
      }
    }
    return [sx, sy];
  }

  /** Walk a planned route cell by cell, dropping it when something was
   * (re)built across it or the unit is wedged; with no route, head straight
   * for `chase` if given. */
  followPath(u: Point & { path: number[] }, chase: Point | null, speed: number, dt: number) {
    while (u.path.length) {
      const c = u.path[0];
      const p = cellCenter(c);
      if (dist(p.x - u.x, p.y - u.y) < 0.3) {
        u.path.shift();
        continue;
      }
      if (this.ownSolid[c] || !this.moveToward(u, p, { speed, dt, own: true })) u.path = [];
      return;
    }
    if (chase) this.moveToward(u, chase, { speed, dt, own: true });
  }

  // ── Consumables ───────────────────────────────────────────────────────
  dropBomb(x: number, y: number) {
    this.explode(x, y, { r: BOMB_RADIUS, damage: BOMB_DAMAGE * this.bonuses.bombDamage, friendlyFire: !this.levels.bombSafe });
  }

  /** Casts the Meteor strike at `at`: how many meteors fall, or 0 while it cools down. */
  castMeteor(at: Point) {
    return castMeteor(this, at);
  }

  /** Casts the Frost nova at `at`; false while it cools down. */
  castFrostNova(at: Point) {
    return castFrostNova(this, at);
  }

  /** Casts the Reinforcements at `at`; false while it cools down. */
  castReinforcements(at: Point) {
    return castReinforcements(this, at);
  }

  /** Casts the Necromancy spell at `at`: how many warriors rose, or -1 while it cools down. */
  castNecromancy(at: Point) {
    return castNecromancy(this, at);
  }

  /** Plants the war banner at (x, y), taking down any other, or with null
   * takes it down. Every troop rethinks at once. */
  plantBanner(at: Point | null) {
    if (at && this.bannerRemaining > 0) return false;
    if (at) this.bannerReadyAt = this.time + this.bannerCooldown;
    this.warBanner = at ? new WarBanner(at.x, at.y) : null;
    this.rethink();
    return true;
  }

  /** Plants a rally flag at `at`, free and with no cooldown, in place of the
   * war banner or any other flag: troops march to it as to the banner, but
   * it lends them nothing. */
  plantFlag(at: Point) {
    this.warBanner = new WarBanner(at.x, at.y, true);
    this.rethink();
  }

  /** Takes the rally flag away, leaving troops to their own reach. True
   * when there was one; the war banner stays where it stands. */
  liftFlag(): boolean {
    if (!this.warBanner?.flag) return false;
    this.warBanner = null;
    this.rethink();
    return true;
  }

  /** Sets troop building `id`'s rally point (`deployment.ts`'s `rallyAim`),
   * or with null clears it; its troops rethink at once. */
  setRally(id: number, at: Rally | null) {
    if (at) this.rallies.set(id, at);
    else this.rallies.delete(id);
    for (const s of this.soldiers) {
      if (s.home !== id) continue;
      s.thinkT = 0;
      s.path = [];
      s.target = -1;
    }
  }

  /** Every troop rethinks at once, after the banner moves. */
  private rethink() {
    for (const s of this.soldiers) {
      stepBannerLife(this, s, 0);
      s.thinkT = 0;
      s.path = [];
      s.target = -1;
    }
  }
}

/** How far a watch tower marks enemies. */
export function watchReach(sim: Pick<DefendSim, "levels" | "bonuses">, b?: Building) {
  const p = buildingPaths(sim, b);
  const spot = pathRank(p, "watchTower", "spotters"), signal = pathRank(p, "watchTower", "signalFires");
  return watchRadius(sim.levels.watchRadius) + (spot >= 2 ? SPOTTERS.radius : 0) + (signal >= 2 ? SIGNAL.radius : 0);
}

function maxHpOf(b: Building, levels: Levels, bonuses: Readonly<Bonuses>) {
  if (b.kind === "wall" && b.piece) return wallHp(levels.wallStrength) * bonuses.wallHp * STONEWORK.hp[wallRank(bonuses.walls, "stonework")];
  if (b.kind === "wall") return wallHp(levels.wallStrength) * bonuses.wallHp;
  if (b.kind === "gate") return wallHp(levels.wallStrength) * bonuses.wallHp * GATE.hpPerCell * b.cells.length * gateHpScale(levels.gateStrength ?? 0) * IRONBOUND.hp[gateRank(bonuses.gate, "ironbound")];
  if (b.kind === "wallBallista") return wallHp(levels.wallStrength) * bonuses.wallHp * BALLISTA.hpPerCell * b.cells.length;
  if (b.kind === "house") return HOUSE_HP_PER_CELL * b.cells.length;
  if (b.kind === "keep") return keepHp(levels.keepStrength) * bonuses.keepHp * BASTIONS.hp[keepRank(bonuses.keep, "bastions")];
  if (b.kind === "monsterBait") return STRUCTURES[b.kind].maxHp * FORTIFY.hp[pathRank(buildingPaths({ bonuses }, b), "bait", "fortified")];
  return STRUCTURES[b.kind].maxHp;
}

/** Road cells inside the city. */
function streetCells(map: CityMap) {
  const out: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++) if (map.city[i] && map.type[i] === CellType.ROAD) out.push(i);
  return out;
}
