import type { CircleState } from "../magic-circle/formation.ts";
/** A building's upgrades as the player meets them: what a path does to the
 * kind's numbers (`kindStats`), the stats and abilities Tiles shows
 * (`buildingSheet`), and the living tree Defend shows when a placed
 * building is tapped (`treeGraph`, its nodes for `upgrade-graph.ts`, and
 * `treeCardHtml`, the card of the node picked in it). The tree comes from
 * `specializations.ts`; paths, ranks, icons and hues from `knowledge-paths.ts`. */
import type { Save } from "../save.ts";
import { TROOPS, allocated, attunedOf, mergePartners, rootOf, hasTree, buildingTree, fullTree, undoRefund, undoTo, type Partner, type TreeNode, type UpgradeStep, type Wear } from "../specializations.ts";
import type { GraphNode } from "./upgrade-graph.ts";
import { ARROW_LOOPS, BASTIONS, BOILING_OIL, KEEP_PATHS, keepAllocated, keepRank, respecKeep, undoKeep, upgradeKeep, type KeepPathId, type KeepRanks } from "../keep-upgrades.ts";
import { STONEWORK, TOWN_WALLS, TRAPPED, WALL_PATHS, respecWalls, undoWalls, upgradeWalls, wallAllocated, wallRank, type WallPathId, type WallRanks } from "../wall-upgrades.ts";
import { sideRank, type SidePath, type SideRanks } from "../side-ranks.ts";
import { GATE_PATHS, GATE_TOWERS, IRONBOUND, PORTCULLIS, gateAllocated, gateBarred, gateRank, respecGate, undoGate, upgradeGate, type GatePathId, type GateRanks } from "../gate-upgrades.ts";
import { SHADOW_BLEED, SHADOW_EDGE, SHADOW_KNIVES, SHADOW_PATHS, SHADOW_PIERCE, respecShadow, shadowAllocated, shadowRank, undoShadow, upgradeShadow, type ShadowPathId, type ShadowRanks } from "../shadow-upgrades.ts";
import { NANO_BLAST, NANO_CLOUD, NANO_PATHS, NANO_REPLICATE, nanoAllocated, nanoRank, respecNano, undoNano, upgradeNano, type NanoPathId, type NanoRanks } from "../nanobot-upgrades.ts";
import { CHAIN, CRIT_CHANCE, CRIT_DAMAGE, DETONATOR, REVOLUTIONARY_PATHS, SQUAD, respecRevolutionary, revolutionaryAllocated, revolutionaryRank, undoRevolutionary, upgradeRevolutionary, type RevolutionaryPathId, type RevolutionaryRanks } from "../revolutionary-upgrades.ts";
import { BALLISTA_PATHS, FIRE_BOLTS, HEAVY_BOLTS, WINDLASS, ballistaAllocated, ballistaRank, respecBallistas, undoBallistas, upgradeBallistas, type BallistaPathId, type BallistaRanks } from "../ballista-upgrades.ts";
import { pathById, type PathId, WHIRLWIND, BLADE_DANCE, LEGEND, FIRE_ARROWS, SHARP, GUNNERY, SIEGE_SHOT, CRUSADE, BLOODLETTERS, SHADOWCLOAK, VENOM, HEADHUNT, GRENADIERS, VOLLEY, BAYONET, SHARP_MUSKETS, BELT_FEED, LONG_SPEARS, SET_SPEARS, TESTUDO, SPEAR_WALL, BARBED, THROWING, HEAVY_LANCE, WINGED, TRIPOD, QUICKDRAW, DUELISTS, GUN_SHIELD, OVERDRIVE, STOPPING, DEADEYE, PIERCING, CLUSTER, SALVO, MARKSMEN, RICOCHET, SUPPRESS, BERSERK, HALBERD, RANGERS, SKIRMISH, FORTIFY, PYRO, RIME, STORM, PYROCLASM, CINDERS, SPOTTERS, SIGNAL } from "../knowledge-paths.ts";
import { bonuses } from "../progression.ts";
import { ITEM_NAMES, archerDamage, archerCooldown, archerRange, cannonDamage, cannonCooldown, CANNON_RANGE, NANO_TOWER, SOLDIER, ARCHER_UNIT, soldierScale, STRUCTURES, flameDps, flameRange, iceDamage, ICE_RANGE, iceChill, watchRadius, fireballDamage, fireballSplash, emberDps, emberSeconds, FIRE_MAGE, FIREBALL_RANGE, keepHp, BRAWLER, ASSASSIN_UNIT, SLINGER, SNIPER, MUSKETEER, GUNNER, MACHINE_GUNNER, GATLING_GUNNER, RAIL_SNIPER, ROCKETEER, SPEARMAN, HOPLITE, LANCER, JAVELINEER, HERO, SHADE, WALL_BLOCK_DESCRIPTION, wallHp, GATE, GATE_DESCRIPTION, BALLISTA, BALLISTA_DESCRIPTION, ballistaCooldown, ballistaDamage, ballistaRange, gateHpScale, gateShut, spikeDamage, spikeEvery, isWizardTower, type PaletteItem } from "../defend/catalog.ts";

/** `kind`'s effective numbers wearing `path` at `rank` (none: plain), with
 * the shared Smithy and skill bonuses. */
export function kindStats(save: Save, kind: PaletteItem, path?: PathId, rank = 0): string {
  const l = save.defend.levels, b = bonuses(save);
  const at = (id: string) => path === id ? rank : 0;
  const n = (v: number) => Number(v.toFixed(2));
  if (kind === "archerTower") {
    const sharp = at("sharpshooters"), fire = at("fireArrows");
    const damage = archerDamage(l.archerDamage) * b.towerDamage * (sharp >= 3 ? SHARP.damage : 1);
    return `${n(damage)} damage · ${n(archerCooldown(l.archerRate) * b.towerReload)}s reload · ${n(archerRange(l.archerRange) + (sharp ? SHARP.range : 0))} range${fire ? ` · ${FIRE_ARROWS.burn[fire]}s burn` : ""}${fire >= 3 ? " · 3 arrows" : ""}${sharp >= 2 ? " · every third arrow 3x damage" : ""}`;
  }
  if (kind === "cannonTower") {
    const gun = at("gunnery"), siege = at("siegeShot");
    return `${n(cannonDamage(l.cannonDamage) * b.towerDamage * SIEGE_SHOT.damage[siege])} damage · ${n(cannonCooldown(l.cannonRate) * b.towerReload * GUNNERY.reload[gun] * (siege ? SIEGE_SHOT.reload : 1))}s reload · ${CANNON_RANGE + (siege >= 3 ? SIEGE_SHOT.range : 0)} range${gun >= 2 ? " · 4 extra blasts" : ""}`;
  }
  if (kind === "barracks" || kind === "archerBarracks") {
    const sword = kind === "barracks", base = sword ? SOLDIER : ARCHER_UNIT;
    const crusade = at("crusaders"), berserk = at("berserkers"), halberd = at("halberdiers"), ranger = at("rangers"), skirmish = at("skirmishers");
    const scale = soldierScale(l.soldierArms);
    const extra = [
      berserk ? `strikes every ${n(SOLDIER.cooldown * BERSERK.cooldown)}s${berserk >= 2 ? ` · kills heal ${BERSERK.heal * 100}%` : ""}${berserk >= 3 ? " · cleaving" : ""}` : "",
      halberd ? `${n(SOLDIER.reach + HALBERD.reach)} reach${halberd >= 2 ? ` · blows slow ${HALBERD.chill}s` : ""}${halberd >= 3 ? ` · ${HALBERD.bigDamage}x on big enemies` : ""}` : "",
    ].filter(Boolean).map((t) => ` · ${t}`).join("");
    return `Recruits: ${n(base.hp * scale * b.troopHp * (sword ? CRUSADE.hp[crusade] : 1))} HP · ${n(base.damage * scale * b.troopDamage * (crusade >= 3 ? CRUSADE.damage : halberd ? HALBERD.damage : ranger >= 2 ? RANGERS.damage : 1))} damage · ${n(base.speed * (crusade ? CRUSADE.speed : skirmish >= 2 ? SKIRMISH.speed : 1))} speed${extra}`;
  }
  if (kind === "heroHall") {
    const whirl = at("whirlwind"), dance = at("bladeDance"), legend = at("legend"), scale = soldierScale(l.soldierArms);
    const every = WHIRLWIND.every[whirl], spin = whirl ? WHIRLWIND.radius[whirl] : HERO.spin, times = whirl ? WHIRLWIND.damage[whirl] : HERO.spinDamage;
    const extra = [
      BLADE_DANCE.slashes[dance] > 1 ? `slashes in flurries of ${BLADE_DANCE.slashes[dance]}${dance >= 3 ? `, kills adding more up to ${BLADE_DANCE.most}` : ""}` : "",
      legend >= 2 ? `kills heal ${LEGEND.heal * 100}%` : "",
      legend >= 3 ? "rises once when it falls" : "",
    ].filter(Boolean).map((t) => ` · ${t}`).join("");
    const combo = every === 1 ? `every strike a spin ${spin} cells round, ${times}x` : `every ${ordinal(every)} strike a spin ${spin} cells round, ${times}x`;
    return `One hero: ${n(HERO.hp * scale * b.troopHp * LEGEND.hp[legend])} HP · ${n(HERO.damage * scale * b.troopDamage)} damage every ${n(HERO.cooldown * BLADE_DANCE.cooldown[dance])}s · slashes cut all within ${HERO.arc} cells in front · ${combo}${extra}`;
  }
  if (kind === "assassinDen") {
    const blood = at("bloodletters"), cloak = at("shadowcloak"), venom = at("venom"), hunt = at("headhunters");
    const u = ASSASSIN_UNIT, scale = soldierScale(l.soldierArms);
    const extra = [
      cloak ? `cloaked · ${SHADOWCLOAK.ambush[cloak]}x from the cloak` : "",
      venom ? `poison: ${VENOM.more[venom]}x damage taken for ${VENOM.time[venom]}s` : "",
      hunt ? `toughest first · +${HEADHUNT.bounty[hunt] * 100}% of its HP a strike` : "",
    ].filter(Boolean).map((t) => ` · ${t}`).join("");
    return `Recruits: ${n(u.hp * scale * b.troopHp * BLOODLETTERS.hp[blood])} HP · ${n(u.damage * scale * b.troopDamage)} damage every ${u.cooldown}s · every ${ordinal(BLOODLETTERS.every[blood])} strike ${BLOODLETTERS.crit[blood]}x${extra}`;
  }
  if (kind === "spearHall" || kind === "phalanx" || kind === "lancerStable" || kind === "javelinCamp") {
    const scale = soldierScale(l.soldierArms), life = (u: { hp: number }) => `Recruits: ${n(u.hp * scale * b.troopHp)} HP`;
    const hit = (u: { damage: number }, m = 1) => n(u.damage * scale * b.troopDamage * m);
    const more = (parts: string[]) => parts.filter(Boolean).map((t) => ` · ${t}`).join("");
    if (kind === "spearHall") {
      const long = at("longSpears"), set = at("setSpears");
      return `${life(SPEARMAN)} · ${hit(SPEARMAN, long >= 3 ? LONG_SPEARS.damage : 1)} damage every ${SPEARMAN.cooldown}s · ${n(SPEARMAN.reach + LONG_SPEARS.reach[long])} reach${more([
        LONG_SPEARS.share[long] ? `runs through for ${LONG_SPEARS.share[long] * 100}%` : "",
        set ? `${SET_SPEARS.fresh[set]}x on the unhurt` : "",
        set >= 2 ? `staggers ${SET_SPEARS.stagger}s` : "",
      ])}`;
    }
    if (kind === "phalanx") {
      const testudo = at("testudo"), wall = at("spearWall");
      return `${life(HOPLITE)} · takes ${n(HOPLITE.guard * TESTUDO.guard[testudo] * 100)}% of every blow · ${hit(HOPLITE, SPEAR_WALL.damage[wall])} damage every ${HOPLITE.cooldown}s · ${HOPLITE.speed} speed${more([
        testudo >= 2 ? `${TESTUDO.ally * 100}% less for each comrade beside it` : "",
        testudo >= 3 ? "slows every enemy in reach" : "",
        SPEAR_WALL.share[wall] ? `strikes all in reach for ${SPEAR_WALL.share[wall] * 100}%` : "",
      ])}`;
    }
    if (kind === "lancerStable") {
      const heavy = at("heavyLance"), winged = at("wingedLancers");
      return `${life(LANCER)} · ${hit(LANCER)} damage every ${LANCER.cooldown}s, ${HEAVY_LANCE.charge[heavy]}x on a charge · ${n(LANCER.speed * WINGED.speed[winged])} speed${more([
        heavy >= 2 ? `charges stagger ${HEAVY_LANCE.stagger}s` : "",
        heavy >= 3 ? "charges trample" : "",
        winged >= 2 ? `ranges ${WINGED.leash[winged]}x as far` : "",
        winged >= 3 ? `charges heal ${WINGED.heal * 100}%` : "",
      ])}`;
    }
    const barbed = at("barbed"), arms = at("throwingArms");
    return `${life(JAVELINEER)} · ${hit(JAVELINEER)} damage every ${n(JAVELINEER.cooldown * THROWING.reload[arms])}s · ${JAVELINEER.range + THROWING.range[arms]} range${more([
      THROWING.extra[arms] ? "a second javelin a throw" : "",
      barbed ? `hits slow ${BARBED.chill}s` : "",
      barbed >= 2 ? `stagger ${BARBED.stagger}s` : "",
      barbed >= 3 ? `${BARBED.bigDamage}x on big enemies` : "",
    ])}`;
  }
  if (isWizardTower(kind)) {
    const pyro = at("pyromancy"), rime = at("rime"), storm = at("storm");
    if (kind === "stormTower") return `${n(flameDps(l.wizardFlame) * b.towerDamage * STORM.damage * (storm >= 3 ? STORM.surge : 1))} bolt damage · ${STORM.links[storm]} targets · ${n(flameRange(l.wizardFlame))} bolt range · alternating with ice`;
    const fire = `${n(flameDps(l.wizardFlame) * b.towerDamage * PYRO.damage[pyro])} fire damage/s · ${n(flameRange(l.wizardFlame) + (pyro >= 2 ? PYRO.reach : 0))} fire range`;
    const ice = `${n(iceDamage(l.wizardIce) * b.towerDamage * (rime >= 2 ? RIME.damage : 1))} ice damage · ${ICE_RANGE + (rime >= 2 ? RIME.reach : 0)} ice range · ${n(iceChill(l.wizardIce) * (rime ? RIME.chill : 1))}s chill`;
    return kind === "frostTower" ? `${ice} · twice as often` : kind === "pyreTower" ? fire : `${fire} · ${ice}`;
  }
  if (kind === "watchTower") {
    const spot = at("spotters"), signal = at("signalFires");
    return `${watchRadius(l.watchRadius) + (spot >= 2 ? SPOTTERS.radius : 0) + (signal >= 2 ? SIGNAL.radius : 0)} marking range · ${SPOTTERS.mark[spot]}x marked damage${signal ? ` · enemies move at ${SIGNAL.slow[signal] * 100}% speed` : ""}`;
  }
  if (kind === "mageGuild") {
    const pyro = at("pyroclasm"), cinders = at("cinders");
    return `Recruits: ${n(FIRE_MAGE.hp * soldierScale(l.soldierArms) * b.troopHp)} HP · ${n(fireballDamage(l.mageFireball) * soldierScale(l.soldierArms) * b.troopDamage * (pyro ? PYROCLASM.damage : 1))} fireball damage · ${n(fireballSplash(l.mageFireball) * (pyro >= 2 ? PYROCLASM.splash : 1))} blast radius · ${n(emberDps(l.mageEmbers) * b.troopDamage * (cinders >= 2 ? CINDERS.dps : 1))} ground damage/s · ${n(emberSeconds(l.mageEmbers) * (cinders ? CINDERS.life : 1))}s burning ground`;
  }
  if (kind === "revolutionary") return revolutionaryStats(save, save.defend.revolutionaryRanks);
  if (kind === "shadow") return shadowStats(save, save.defend.shadowRanks);
  if (kind === "nanoTower") return nanoStats(save, save.defend.nanoRanks);
  const GUNS = { meleeGuild: BRAWLER, rangedGuild: SLINGER, sniperLodge: SNIPER, musketHall: MUSKETEER, gunHall: GUNNER, gunNest: MACHINE_GUNNER, gatlingNest: GATLING_GUNNER, rocketBattery: ROCKETEER } as const;
  if (kind in GUNS) {
    const u: { hp: number; damage: number; cooldown: number; range?: number } = GUNS[kind as keyof typeof GUNS], scale = soldierScale(l.soldierArms);
    const range = u.range !== undefined ? ` · ${u.range} range` : "";
    const life = (m = 1) => `Recruits: ${n(u.hp * scale * b.troopHp * m)} HP`;
    if (kind === "rocketBattery") {
      const cluster = at("clusterRockets"), salvo = at("salvoRacks");
      const extra = [
        SALVO.rockets[salvo] > 1 ? `${SALVO.rockets[salvo]} rockets a launch` : "",
        CLUSTER.bomblets[cluster] ? `${CLUSTER.bomblets[cluster]} bomblets` : "",
        CLUSTER.burn[cluster] ? `burning ground ${CLUSTER.burn[cluster]}s` : "",
      ].filter(Boolean).map((t) => ` · ${t}`).join("");
      return `${life()} · ${n(u.damage * scale * b.troopDamage)} damage every ${n(u.cooldown * SALVO.reload[salvo])}s${range} · bursts ${ROCKETEER.blast + CLUSTER.blast[cluster]} cells wide${extra}`;
    }
    if (kind === "gatlingNest") {
      const shield = at("gunShield"), over = at("overdrive"), stop = at("stoppingPower");
      return `${life(GUN_SHIELD.hp[shield])} · ${n(u.damage * scale * b.troopDamage * OVERDRIVE.damage[over] * STOPPING.damage[stop])} damage every ${n(u.cooldown * OVERDRIVE.reload[over])}s · ${GATLING_GUNNER.range} range · walks at ${n(GATLING_GUNNER.speed * (shield >= 2 ? GUN_SHIELD.speed : 1))} cells/s${stop ? ` · knocks back ${STOPPING.push[stop]} cells a hit` : ""}`;
    }
    if (kind === "gunNest") {
      const belt = at("beltFeed"), tripod = at("tripod");
      return `${life()} · ${n(u.damage * scale * b.troopDamage * (belt >= 2 ? BELT_FEED.damage : 1) * TRIPOD.damage[tripod])} damage every ${n(u.cooldown * BELT_FEED.reload[belt])}s · ${MACHINE_GUNNER.range + TRIPOD.range[tripod]} range`;
    }
    if (kind === "gunHall") {
      const quick = at("quickdraw"), duel = at("duelists");
      const extra = [quick >= 3 ? "second pistol at the next nearest" : "", duel >= 3 ? `every ${ordinal(DUELISTS.every)} shot ${DUELISTS.crit}x` : ""].filter(Boolean).map((t) => ` · ${t}`).join("");
      return `${life()} · ${n(u.damage * scale * b.troopDamage * DUELISTS.damage[duel])} damage every ${n(u.cooldown * QUICKDRAW.reload[quick])}s · ${GUNNER.range + DUELISTS.range[duel]} range${extra}`;
    }
    if (kind === "musketHall") {
      const grenade = at("grenadiers"), volley = at("volleyFire"), bayonet = at("bayonets"), sharp = at("sharpMuskets");
      const extra = [
        grenade ? `bursts ${MUSKETEER.blast} cells wide · burning ground ${GRENADIERS.burn[grenade]}s${GRENADIERS.bomblets[grenade] ? ` · ${GRENADIERS.bomblets[grenade]} bomblets` : ""}${grenade >= 3 ? " · clinging fire" : ""}` : "",
        volley ? `${VOLLEY.extra[volley]} extra ball${VOLLEY.extra[volley] > 1 ? "s" : ""} a shot${volley >= 3 ? ` · up to ${Math.round(VOLLEY.drill * VOLLEY.most * 100)}% quicker reload in ranks` : ""}` : "",
        bayonet ? `bayonet ${BAYONET.damage}x up close${bayonet >= 2 ? " · hunts the city" : ""}${bayonet >= 3 ? ` · staggers ${BAYONET.stagger}s` : ""}` : "",
        sharp >= 3 ? "toughest first" : "",
      ].filter(Boolean).map((t) => ` · ${t}`).join("");
      return `Recruits: ${n(u.hp * scale * b.troopHp)} HP · ${n(u.damage * scale * b.troopDamage * SHARP_MUSKETS.damage[sharp])} damage every ${u.cooldown}s · ${MUSKETEER.range + SHARP_MUSKETS.range[sharp]} range${extra}`;
    }
    if (kind === "sniperLodge") {
      const marks = at("marksmen"), glance = at("ricochet"), supp = at("suppressors"), deadeye = at("deadeye"), pierce = at("piercing");
      const extra = [
        marks >= 2 ? "toughest first" : "",
        marks >= 3 ? `every ${ordinal(MARKSMEN.every)} shot ${MARKSMEN.crit}x` : "",
        glance ? `glances on ${RICOCHET.bounces[glance]}x at ${RICOCHET.share[glance] * 100}%` : "",
        supp ? `hits slow ${SUPPRESS.chill}s${supp >= 2 ? ` · stagger ${SUPPRESS.stagger}s` : ""}` : "",
        pierce ? "pierces every enemy in line" : "",
      ].filter(Boolean).map((t) => ` · ${t}`).join("");
      const reach = SNIPER.range + (marks ? MARKSMEN.range : 0) + (deadeye >= 3 ? DEADEYE.range : 0) + (pierce >= 3 ? PIERCING.range : 0);
      return `Recruits: ${n(u.hp * scale * b.troopHp)} HP · ${n(u.damage * scale * b.troopDamage * DEADEYE.damage[deadeye] * PIERCING.damage[pierce])} damage every ${n(u.cooldown * (supp >= 3 ? SUPPRESS.reload : 1))}s · ${reach} range${extra}`;
    }
    return `Recruits: ${n(u.hp * scale * b.troopHp)} HP · ${n(u.damage * scale * b.troopDamage)} damage every ${u.cooldown}s${range}`;
  }
  if (kind === "monsterBait") return `${STRUCTURES.monsterBait.maxHp * FORTIFY.hp[at("fortified")]} HP`;
  if (kind in STRUCTURES) return `${STRUCTURES[kind as keyof typeof STRUCTURES].maxHp} building HP`;
  return "Uses the shared city upgrades.";
}

/** A tile's numbers and what its Knowledge upgrades let it do, as Tiles
 * shows them: the basic stats (the kind's own numbers, with its path's and
 * the Smithy's bonuses), then each rank it carries in its path's colour. */
export type Ability = { text: string; hue: string };
export type StatSheet = { stats: string[]; abilities: Ability[] };
/** The ranks `have` holds of shared `paths`, each as an ability. */
const sharedAbilities = <Id extends string>(paths: SidePath<Id>[], have: SideRanks<Id> | undefined): Ability[] =>
  paths.flatMap((p) => p.ranks.slice(0, sideRank(have, p.id)).map((r) => ({ text: r.text, hue: p.hue })));
/** The first `core` parts of a stats line: the numbers every copy has, before what upgrades add. */
const coreStats = (line: string, core: number) => line.split(" · ").slice(0, core);

/** A building of `kind` wearing `wear`: its basic stats and its upgrades' abilities. */
export function buildingSheet(save: Save, kind: PaletteItem | "wallSpikes", wear?: Wear): StatSheet {
  const d = save.defend;
  if (kind === "revolutionary") return { stats: coreStats(revolutionaryStats(save, d.revolutionaryRanks), 3), abilities: sharedAbilities(REVOLUTIONARY_PATHS, d.revolutionaryRanks) };
  if (kind === "shadow") return { stats: coreStats(shadowStats(save, d.shadowRanks), 4), abilities: sharedAbilities(SHADOW_PATHS, d.shadowRanks) };
  if (kind === "nanoTower") return { stats: coreStats(nanoStats(save, d.nanoRanks), 3), abilities: sharedAbilities(NANO_PATHS, d.nanoRanks) };
  if (kind === "wallBlock") return { stats: coreStats(wallStats(save, d.wallRanks), 1), abilities: sharedAbilities(WALL_PATHS, d.wallRanks) };
  if (kind === "cityGate") return { stats: coreStats(gateStats(save, d.gateRanks), 2), abilities: sharedAbilities(GATE_PATHS, d.gateRanks) };
  if (kind === "wallBallista") return { stats: coreStats(ballistaStats(save, d.ballistaRanks), 4), abilities: sharedAbilities(BALLISTA_PATHS, d.ballistaRanks) };
  if (kind === "wallSpikes") {
    const l = d.levels, p = wear && pathById(wear.path);
    return { stats: [`${spikeDamage(l.spikeDamage ?? 0)} damage`, `cuts every ${Number(spikeEvery(l.spikeRate ?? 0).toFixed(2))}s`], abilities: p ? p.ranks.slice(0, wear.rank).map((r) => ({ text: r.text, hue: p.hue })) : [] };
  }
  // Whatever a path adds is listed after the numbers a plain one has.
  const item = kind as PaletteItem, plain = kindStats(save, item).split(" · ").length;
  const stats = coreStats(kindStats(save, item, wear?.path, wear?.rank ?? 0), plain);
  const p = wear && pathById(wear.path);
  return { stats, abilities: p ? p.ranks.slice(0, wear.rank).map((r) => ({ text: r.text, hue: p.hue })) : [] };
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];
const ordinal = (n: number) => (n === 2 ? "other" : n === 3 ? "3rd" : `${n}th`);


/** How a line's ultimate is made, in words. */
const mergeText = (attuned: PaletteItem, ultimate?: PaletteItem) => ultimate
  ? `Three ${ITEM_NAMES[attuned]} buildings, each at the last rank of a different branch, merge into one ${ITEM_NAMES[ultimate]}.`
  : `This line's ultimate is still to come: three ${ITEM_NAMES[attuned]} buildings, each at the last rank of a different branch, will merge into it.`;

/** A merge's partners on its card: each building it uses up, found or not. */
const partnersHtml = (partners: Partner[]) => `<ul class="ug-partners">${partners.map((p) =>
  `<li class="${p.found ? "ug-found" : "ug-locked"}">${ITEM_NAMES[p.kind]} · ${pathById(p.branch.path).name} ${ROMAN[pathById(p.branch.path).ranks.length]}: ${!p.found ? "none yet" : "kept" in p.found ? "waiting in the palette" : "standing in the city"}</li>`).join("")}</ul>`;

/** What a building node is and does, for its card's head and text. */
function nodeText(save: Save, n: TreeNode): { title: string; text: string } {
  const kind = n.kind as PaletteItem;
  const about = (k: PaletteItem) => `${TROOPS[k as keyof typeof TROOPS] ? `${TROOPS[k as keyof typeof TROOPS]} · ` : ""}${STRUCTURES[k as keyof typeof STRUCTURES]?.description ?? ""}`;
  if (n.soon) return { title: "Ultimate", text: mergeText(n.soon) };
  if (n.step?.type === "merge") return { title: ITEM_NAMES[kind], text: `${mergeText(attunedOf(kind as never)!.kind, kind)} The building whose tree it is bought in becomes it; the other two are used up. ${about(kind)}` };
  return { title: ITEM_NAMES[kind] ?? "Wall spikes", text: n.kind === "wallSpikes" ? "Stakes along the wall's outer face." : about(kind) };
}

// ── The living tree ───────────────────────────────────────────────────────
const knowledgeTag = (n: number) => `${n >= 10000 ? `${Number((n / 1000).toFixed(1))}k` : n.toLocaleString("en")}✦`;

/** One building's tree as the graph draws it. */
export function treeGraph(kind: PaletteItem | "wallSpikes", wear?: Wear): GraphNode[] {
  return buildingTree(kind as never, wear).map((n): GraphNode => (
    { id: n.id, parent: n.parent, state: n.state, face: nodeFace(n), tag: n.state === "owned" || n.soon ? undefined : knowledgeTag(n.cost), hue: nodeHue(n), side: n.side, hidden: n.hidden, closed: n.closed, took: n.took }));
}
/** A node's colours: its path's, or gold for an ultimate. */
const nodeHue = (n: TreeNode) => (n.path ? `hue-${pathById(n.path).hue}` : n.step?.type === "merge" || n.soon ? "hue-gold" : undefined);
/** A node's face: a building's icon, or a path rank's with its numeral. */
const nodeFace = (n: TreeNode) => n.soon
  ? `<b class="ug-soon">?</b>`
  : n.kind
  ? `<canvas width="32" height="32" data-icon="${n.kind}"></canvas>`
  : `<canvas data-path-icon="${pathById(n.path!).ranks[n.rank! - 1].icon}:${pathById(n.path!).hue}"></canvas><b>${ROMAN[n.rank!]}</b>`;

// ── The upgrade map ───────────────────────────────────────────────────────
/** The map of `kind`'s whole line (from its basic building) as a web: every
 * upgrade in `found` (discovered by any building of the line), or every one
 * with `all` (Developer mode). `here` is what this building has: gold; the
 * rest discovered: blue; never discovered (shown only with `all`): dim.
 * A shown node with undiscovered branches beyond it trails them off. */
export function mapGraph(kind: PaletteItem | "wallSpikes", found: ReadonlySet<string>, here: ReadonlySet<string>, all: boolean): GraphNode[] {
  const web = fullTree(kind === "wallSpikes" ? kind : rootOf(kind as never));
  const shown = web.filter((n) => all || found.has(n.id) || here.has(n.id) || !n.parent);
  const ids = new Set(shown.map((n) => n.id));
  return shown.map((n): GraphNode => {
    const unseen = web.filter((o) => o.parent === n.id && !ids.has(o.id)).length;
    const state = here.has(n.id) ? "owned" : found.has(n.id) ? "next" : "locked";
    return { id: n.id, parent: n.parent, state, face: nodeFace(n), tag: state === "owned" ? undefined : knowledgeTag(n.cost), hue: nodeHue(n),
      ...(unseen ? { hidden: Array.from({ length: unseen }, (_, i) => ({ side: false, i, n: unseen })) } : {}) };
  });
}
/** The whole web of `kind`'s line, discovered or not: where the map's nodes stand. */
export const mapWeb = (kind: PaletteItem | "wallSpikes") => fullTree(kind === "wallSpikes" ? kind : rootOf(kind as never));
/** How many of the line's upgrades are discovered, of how many. */
export function mapCount(kind: PaletteItem | "wallSpikes", found: ReadonlySet<string>): { found: number; total: number } {
  const web = fullTree(kind === "wallSpikes" ? kind : rootOf(kind as never));
  return { found: web.filter((n) => found.has(n.id) || !n.parent).length, total: web.length };
}

/** The map's card for node `id`: what it is and does, its price, and
 * whether this building has it, another found it, or none has yet. Read
 * only: upgrades are bought in the tree. */
export function mapCardHtml(save: Save, kind: PaletteItem | "wallSpikes", found: ReadonlySet<string>, here: ReadonlySet<string>, id: string): string {
  const n = fullTree(kind === "wallSpikes" ? kind : rootOf(kind as never)).find((o) => o.id === id);
  if (!n) return `<p class="ug-hint">Tap an upgrade to see what it does.</p>`;
  let title: string, text: string, level = "", stats = "";
  if (n.kind && !n.path) {
    ({ title, text } = nodeText(save, n));
    if (n.kind !== "wallSpikes") stats = kindStats(save, n.kind as PaletteItem);
  } else {
    const p = pathById(n.path!), r = p.ranks[n.rank! - 1];
    title = `${n.kind ? `${ITEM_NAMES[n.kind as PaletteItem]}: ` : ""}${p.name} ${ROMAN[n.rank!]}: ${r.name}`;
    text = `${n.kind ? `Becomes a ${ITEM_NAMES[n.kind as PaletteItem]} (${TROOPS[n.kind as keyof typeof TROOPS] ?? "a tower"}). ` : ""}${p.motto}. ${r.text}`;
    level = `Level ${n.rank} / ${p.ranks.length}`;
  }
  const price = n.parent ? ` · ${n.cost.toLocaleString("en")} Knowledge` : "";
  const state = here.has(id) ? `<b class="ug-owned">This building has it</b>`
    : found.has(id) || !n.parent ? `<b class="ug-found">Discovered${price}</b><small class="ug-again">Another building of its line reached it</small>`
    : `<span class="ug-locked">Not yet discovered${price} · shown in Developer mode</span>`;
  return `<div class="ug-card-head"><b>${title}</b>${level ? `<small>${level}</small>` : ""}</div><p>${text}</p>${stats ? `<p class="ug-stats">${stats}</p>` : ""}<div class="ug-card-foot" data-ug-ignore>${state}</div>`;
}

/** The card for node `id` of a building of `kind` wearing `wear`: what it
 * is, what it does, its level and price, and Buy when it can be bought. */
export function treeCardHtml(save: Save, kind: PaletteItem | "wallSpikes", wear: Wear | undefined, id: string): string {
  const n = buildingTree(kind as never, wear).find((o) => o.id === id);
  if (!n) return `<p class="ug-hint">Tap a node to see what it does.</p>`;
  const free = save.settings.devMode;
  let can = free || save.knowledge >= n.cost;
  let title: string, text: string, level = "", stats = "", partners = "";
  if (n.kind && !n.path || n.soon) {
    ({ title, text } = nodeText(save, n));
    if (n.kind && n.kind !== "wallSpikes") stats = kindStats(save, n.kind as PaletteItem, n.kind === kind ? wear?.path : undefined, n.kind === kind ? wear?.rank : 0);
    if (n.step?.type === "merge" && n.state !== "owned") {
      const found = mergePartners(save.defend, kind as never, wear);
      if (found.length) {
        partners = partnersHtml(found);
        can &&= found.every((p) => p.found);
      }
    }
  } else {
    const p = pathById(n.path!), r = p.ranks[n.rank! - 1], becomes = n.kind && n.kind !== kind ? n.kind as PaletteItem : undefined;
    title = `${n.kind ? `${ITEM_NAMES[n.kind as PaletteItem]}: ` : ""}${p.name} ${ROMAN[n.rank!]}: ${r.name}`;
    text = `${becomes ? `Becomes a ${ITEM_NAMES[becomes]} (${TROOPS[becomes as keyof typeof TROOPS] ?? "a tower"}). ` : ""}${p.motto}. ${r.text}`;
    level = `Level ${n.rank} / ${p.ranks.length}`;
    if (kind !== "wallSpikes") stats = `At this rank: ${kindStats(save, (becomes ?? kind) as PaletteItem, p.id, n.rank)}`;
  }
  const undoable = n.state === "owned" && !!undoTo(kind as never, wear, n.id);
  const back = undoable ? undoRefund(kind as never, wear, n.id) : 0;
  const beyond = n.state === "owned" && !!treeBeyond(kind, wear, n.id);
  const here = (n.kind === kind && !n.path && !wear) || (n.path && n.path === wear?.path && n.rank === wear?.rank);
  const state = n.soon ? `<span class="ug-locked">Still to come</span>`
    : n.state === "owned" ? `<b class="ug-owned">${here ? "Where it is now" : n.merged ? "Merged into it" : "Owned"}</b>${undoable ? undoButton(n.id, back) : ""}${beyond ? AGAIN_SELL : ""}`
    : n.state === "next" ? `<button class="ug-buy" data-ug-buy="${n.id}" ${can ? "" : "disabled"}>${n.step?.type === "merge" ? "Merge" : "Buy"} · ${free || !n.cost ? "Free" : `${n.cost.toLocaleString("en")} Knowledge`}</button>${can ? AGAIN_BUY : ""}`
    : `<span class="ug-locked">Locked: ${n.step?.type === "merge" ? "max out this branch first" : "buy the one before it"}${n.cost ? ` · ${n.cost.toLocaleString("en")} Knowledge` : ""}</span>`;
  return `<div class="ug-card-head"><b>${title}</b>${level ? `<small>${level}</small>` : ""}</div><p>${text}</p>${stats ? `<p class="ug-stats">${stats}</p>` : ""}${partners}<div class="ug-card-foot" data-ug-ignore>${state}</div>`;
}

/** What tapping the picked node again does, said on its card. */
const AGAIN_BUY = `<small class="ug-again">or tap it again to buy</small>`;
const AGAIN_SELL = `<small class="ug-again">Tap it again to sell everything after it</small>`;

/** The owned node grown from owned node `id`: undoing it sells everything
 * after `id` (a second tap on a picked node). None when `id` is the tip. */
export const treeBeyond = (kind: PaletteItem | "wallSpikes", wear: Wear | undefined, id: string): string | undefined => {
  const after = buildingTree(kind as never, wear).find((o) => o.parent === id && o.state === "owned")?.id;
  return after && undoTo(kind as never, wear, after) ? after : undefined;
};

/** Undo for an owned node: it and everything after it, their Knowledge back. */
const undoButton = (id: string, back: number) =>
  `<button class="ug-undo" data-ug-undo="${id}" title="Undo this and every upgrade after it">Undo · ${back.toLocaleString("en")} Knowledge back</button>`;

/** The step that buys node `id`, if it can be bought now. */
export const treeStep = (kind: PaletteItem | "wallSpikes", wear: Wear | undefined, id: string): UpgradeStep | undefined =>
  buildingTree(kind as never, wear).find((n) => n.id === id && n.state === "next")?.step;

/** The Knowledge allocated to a building, for the tree's corner box. */
export const treeAllocated = (kind: PaletteItem | "wallSpikes", wear?: Wear) => allocated(kind as never, wear);
export type { TreeNode };

// ── Trees climbed side by side: the keep's, walls', gates' and ballistas' ─
/** A tree whose branches climb side by side from one root (`side-ranks.ts`),
 * as the graph and the card show it. */
type SideTree<Id extends string> = { root: string; icon: string; every: string; paths: SidePath<Id>[] };
type Ranks<Id extends string> = SideRanks<Id> | undefined;

/** The tree as the graph draws it: the root, and each branch climbing from
 * it on its own. Rank nodes are `q:<branch>:<rank>`. */
function sideGraph<Id extends string>(tree: SideTree<Id>, ranks: Ranks<Id>): GraphNode[] {
  const nodes: GraphNode[] = [{ id: tree.root, state: "owned", face: `<canvas width="32" height="32" data-icon="${tree.icon}"></canvas>` }];
  for (const p of tree.paths) {
    const have = sideRank(ranks, p.id);
    p.ranks.forEach((r, i) => {
      const rank = i + 1, state = rank <= have ? "owned" : rank === have + 1 ? "next" : "locked";
      nodes.push({
        id: `q:${p.id}:${rank}`, parent: rank === 1 ? tree.root : `q:${p.id}:${i}`, state,
        face: `<canvas data-path-icon="${r.icon}:${p.hue}"></canvas><b>${ROMAN[rank]}</b>`,
        tag: state === "owned" ? undefined : knowledgeTag(r.cost), hue: `hue-${p.hue}`,
      });
    });
  }
  return nodes;
}

/** The branch and rank undoing node `id` takes back, if it is owned. */
function sideUndo<Id extends string>(tree: SideTree<Id>, ranks: Ranks<Id>, id: string): { id: Id; rank: number } | undefined {
  const [q, path, rank] = id.split(":");
  const p = tree.paths.find((o) => o.id === path);
  return q === "q" && p && Number(rank) >= 1 && Number(rank) <= sideRank(ranks, p.id) ? { id: p.id, rank: Number(rank) } : undefined;
}

/** What a second tap on owned node `id` sells: the rank above it on its
 * branch (`undo` it), or, on the root, every rank (`all`, a respec). */
function sideBeyond<Id extends string>(tree: SideTree<Id>, ranks: Ranks<Id>, id: string): { undo: string } | { all: true } | undefined {
  if (id === tree.root) return tree.paths.some((p) => sideRank(ranks, p.id) > 0) ? { all: true } : undefined;
  const [q, path, rank] = id.split(":"), p = tree.paths.find((o) => o.id === path);
  return q === "q" && p && Number(rank) >= 1 && Number(rank) < sideRank(ranks, p.id) ? { undo: `q:${p.id}:${Number(rank) + 1}` } : undefined;
}

/** What node `id` buys, if it can be bought now. */
function sideStep<Id extends string>(tree: SideTree<Id>, ranks: Ranks<Id>, id: string): Id | undefined {
  const [q, path, rank] = id.split(":");
  const p = tree.paths.find((o) => o.id === path);
  return q === "q" && p && Number(rank) === sideRank(ranks, p.id) + 1 && Number(rank) <= p.ranks.length ? p.id : undefined;
}

/** The card for node `id`: the root's (`name`, `about`) or a rank's, with
 * the numbers `stats` gives at it. */
function sideCardHtml<Id extends string>(save: Save, tree: SideTree<Id>, ranks: Ranks<Id>, id: string, name: string, about: string, stats: (ranks: Ranks<Id>) => string): string {
  const free = save.settings.devMode;
  if (id === tree.root)
    return `<div class="ug-card-head"><b>${name}</b></div><p>${about} Its branches climb side by side: buy a rank of any of them.</p><p class="ug-stats">${stats(ranks)}</p><div class="ug-card-foot" data-ug-ignore><b class="ug-owned">${tree.every}</b>${sideBeyond(tree, ranks, id) ? AGAIN_SELL : ""}</div>`;
  const [, path, r] = id.split(":"), p = tree.paths.find((o) => o.id === path), rank = Number(r);
  const step = p?.ranks[rank - 1];
  if (!p || !step) return `<p class="ug-hint">Tap a node to see what it does.</p>`;
  const have = sideRank(ranks, p.id), cost = step.cost, can = free || save.knowledge >= cost;
  let back = 0;
  for (let i = rank; i <= have; i++) back += p.ranks[i - 1].cost;
  const state = rank <= have ? `<b class="ug-owned">Owned</b>${undoButton(id, back)}${rank < have ? AGAIN_SELL : ""}`
    : rank === have + 1 ? `<button class="ug-buy" data-ug-buy="${id}" ${can ? "" : "disabled"}>Buy · ${free ? "Free" : `${cost.toLocaleString("en")} Knowledge`}</button>${can ? AGAIN_BUY : ""}`
    : `<span class="ug-locked">Locked: buy the one before it · ${cost.toLocaleString("en")} Knowledge</span>`;
  const at = { ...ranks, [p.id]: rank } as Ranks<Id>;
  return `<div class="ug-card-head"><b>${p.name} ${ROMAN[rank]}: ${step.name}</b><small>Level ${rank} / ${p.ranks.length}</small></div><p>${p.motto}. ${step.text}</p><p class="ug-stats">At this rank: ${stats(at)}</p><div class="ug-card-foot" data-ug-ignore>${state}</div>`;
}

const KEEP_TREE: SideTree<KeepPathId> = { root: "k:keep", icon: "keep", every: "This building", paths: KEEP_PATHS };
const WALL_TREE: SideTree<WallPathId> = { root: "k:wallBlock", icon: "wallBlock", every: "Every wall you place", paths: WALL_PATHS };
const GATE_TREE: SideTree<GatePathId> = { root: "k:cityGate", icon: "cityGate", every: "Every city gate", paths: GATE_PATHS };
const BALLISTA_TREE: SideTree<BallistaPathId> = { root: "k:wallBallista", icon: "wallBallista", every: "Every wall ballista", paths: BALLISTA_PATHS };

/** The keep's tree as the graph draws it. */
export const keepGraph = (ranks: KeepRanks | undefined) => sideGraph(KEEP_TREE, ranks);
/** What node `id` of the keep's tree buys, if it can be bought now. */
export const keepStep = (ranks: KeepRanks | undefined, id: string) => sideStep(KEEP_TREE, ranks, id);

/** The keep's numbers with `ranks`, and the shared Smithy and skill bonuses. */
export function keepStats(save: Save, ranks: KeepRanks | undefined): string {
  const l = save.defend.levels, b = bonuses(save), n = (v: number) => Number(v.toFixed(2));
  const loops = keepRank(ranks, "arrowLoops"), oil = keepRank(ranks, "boilingOil");
  const parts = [`${Math.round(keepHp(l.keepStrength) * b.keepHp * BASTIONS.hp[keepRank(ranks, "bastions")]).toLocaleString("en")} HP`];
  if (loops) parts.push(`${n(archerDamage(l.archerDamage) * b.towerDamage * ARROW_LOOPS.damage[loops])} arrow damage every ${n(ARROW_LOOPS.reload[loops] * b.towerReload)}s · ${ARROW_LOOPS.range[loops]} range${loops >= 3 ? ` · ${ARROW_LOOPS.volley} arrows` : ""}`);
  if (oil) parts.push(`${n(BOILING_OIL.damage[oil] * b.towerDamage)} oil damage every ${BOILING_OIL.every[oil]}s · ${BOILING_OIL.reach[oil]} cells out${BOILING_OIL.burn[oil] ? ` · ${BOILING_OIL.burn[oil]}s burn` : ""}`);
  return parts.join(" · ");
}

/** The card for node `id` of the keep's tree. */
export const keepCardHtml = (save: Save, ranks: KeepRanks | undefined, id: string) =>
  sideCardHtml(save, KEEP_TREE, ranks, id, STRUCTURES.keep.name, STRUCTURES.keep.description, (r) => keepStats(save, r));

/** The walls' tree as the graph draws it. */
export const wallGraph = (ranks: WallRanks | undefined) => sideGraph(WALL_TREE, ranks);
/** What node `id` of the walls' tree buys, if it can be bought now. */
export const wallStep = (ranks: WallRanks | undefined, id: string) => sideStep(WALL_TREE, ranks, id);

/** A placed wall stone's numbers with `ranks`, and the shared Smithy and
 * skill bonuses. */
export function wallStats(save: Save, ranks: WallRanks | undefined): string {
  const b = bonuses(save), stone = wallRank(ranks, "stonework"), trap = wallRank(ranks, "trapped"), town = wallRank(ranks, "townWalls");
  const parts = [`${Math.round(wallHp(save.defend.levels.wallStrength) * b.wallHp * STONEWORK.hp[stone]).toLocaleString("en")} HP a stone`];
  if (stone >= 3) parts.push(`mends ${STONEWORK.mend * 100}% a second`);
  if (trap) parts.push(`bursts as it breaks: ${TRAPPED.damage[trap]} damage over ${TRAPPED.radius[trap]} cells${trap >= 3 ? ` · burns ${TRAPPED.fire}s` : ""}`);
  parts.push(town >= TOWN_WALLS.posterns ? "inside or outside the city · your people pass through" : town >= TOWN_WALLS.inside ? "inside or outside the city" : "outside the city");
  return parts.join(" · ");
}

/** The card for node `id` of the walls' tree. */
export const wallCardHtml = (save: Save, ranks: WallRanks | undefined, id: string) =>
  sideCardHtml(save, WALL_TREE, ranks, id, "Walls", WALL_BLOCK_DESCRIPTION, (r) => wallStats(save, r));

/** A city gate's numbers with `ranks`, and the shared Smithy and skill bonuses. */
export function gateStats(save: Save, ranks: GateRanks | undefined): string {
  const l = save.defend.levels, b = bonuses(save), n = (v: number) => Number(v.toFixed(2));
  const holes = gateRank(ranks, "portcullis"), towers = gateRank(ranks, "gateTowers"), iron = gateRank(ranks, "ironbound");
  const hp = wallHp(l.wallStrength) * b.wallHp * GATE.hpPerCell * GATE.long * GATE.deep * gateHpScale(l.gateStrength ?? 0) * IRONBOUND.hp[iron];
  const parts = [`${Math.round(hp).toLocaleString("en")} HP`, `shuts ${n(gateShut(l.gateHinges ?? 0))}s after your people pass`,
    gateBarred(ranks) ? "enemies can't slip in" : "enemies may slip in while it is open"];
  if (holes >= 2) parts.push(`murder holes: ${n(PORTCULLIS.damage[holes] * b.towerDamage)} damage every ${PORTCULLIS.every[holes]}s${holes >= 3 ? ` · ${PORTCULLIS.burn}s burn` : ""}`);
  if (towers) parts.push(`${towers >= GATE_TOWERS.twin ? "2 small ballistas" : "a small ballista"}: ${n(ballistaDamage(l.ballistaDamage ?? 0) * b.towerDamage * GATE_TOWERS.share[towers])} damage every ${n(GATE_TOWERS.cooldown * b.towerReload)}s · ${GATE_TOWERS.range[towers]} range · pierces ${GATE_TOWERS.pierce[towers]}`);
  if (iron >= 2) parts.push(`mends ${IRONBOUND.mend * 100}% a second`);
  if (iron >= 3) parts.push(`rises again ${IRONBOUND.rise}s after it falls`);
  return parts.join(" · ");
}

/** A wall ballista's numbers with `ranks`, and the shared Smithy and skill bonuses. */
export function ballistaStats(save: Save, ranks: BallistaRanks | undefined): string {
  const l = save.defend.levels, b = bonuses(save), n = (v: number) => Number(v.toFixed(2));
  const heavy = ballistaRank(ranks, "heavyBolts"), fire = ballistaRank(ranks, "fireBolts"), wind = ballistaRank(ranks, "windlass");
  const damage = ballistaDamage(l.ballistaDamage ?? 0) * b.towerDamage * HEAVY_BOLTS.damage[heavy];
  const parts = [`${n(damage)} damage`, `${n(ballistaCooldown(l.ballistaRate ?? 0) * b.towerReload * WINDLASS.reload[wind])}s reload`,
    `${n(ballistaRange(l.ballistaRange ?? 0) + WINDLASS.range[wind])} range`, `pierces ${HEAVY_BOLTS.pierce[heavy] || BALLISTA.pierce}`];
  if (heavy >= 2) parts.push(`staggers ${HEAVY_BOLTS.stagger}s`);
  if (fire) parts.push(`${n(damage * FIRE_BOLTS.share)} burn a second for ${FIRE_BOLTS.burn}s`);
  if (fire >= 2) parts.push(`burning ground ${FIRE_BOLTS.blaze.life}s`);
  if (fire >= 3) parts.push(`bursts for ${n(damage * FIRE_BOLTS.burst.share)}`);
  if (wind >= 3) parts.push(`${WINDLASS.fan} bolts a shot`);
  return parts.join(" · ");
}

/** A Revolutionary's numbers with `ranks`, and the shared Smithy and skill bonuses. */
export function revolutionaryStats(save: Save, ranks: RevolutionaryRanks | undefined): string {
  const b = bonuses(save), n = (v: number) => Number(v.toFixed(2)), scale = soldierScale(save.defend.levels.soldierArms), u = RAIL_SNIPER;
  const squad = SQUAD.snipers[revolutionaryRank(ranks, "squad")], hits = CHAIN.hits[revolutionaryRank(ranks, "chain")];
  const chance = CRIT_CHANCE.chance[revolutionaryRank(ranks, "critChance")], times = CRIT_DAMAGE.times[revolutionaryRank(ranks, "critDamage")], burst = DETONATOR.radius[revolutionaryRank(ranks, "splash")];
  const parts = [`${squad} laser sniper${squad > 1 ? "s" : ""}: ${n(u.hp * scale * b.troopHp)} HP`, `${n(u.damage * scale * b.troopDamage)} damage every ${u.cooldown}s`, `${u.range} range`];
  if (hits > 1) parts.push(`each bullet strikes ${hits} enemies`);
  parts.push(chance ? `${n(chance * 100)}% critical chance for ${times}x` : `no criticals (${times}x once they come)`);
  if (burst) parts.push(`bursts ${burst} cell${burst > 1 ? "s" : ""} round the last at ${DETONATOR.share * 100}%`);
  return parts.join(" · ");
}

/** A Shadow's numbers with `ranks`, and the shared Smithy and skill bonuses. */
export function shadowStats(save: Save, ranks: ShadowRanks | undefined): string {
  const b = bonuses(save), n = (v: number) => Number(v.toFixed(2)), scale = soldierScale(save.defend.levels.soldierArms), u = SHADE;
  const knives = SHADOW_KNIVES.knives[shadowRank(ranks, "knives")], pierce = SHADOW_PIERCE.pierce[shadowRank(ranks, "pierce")];
  const bleed = shadowRank(ranks, "bleed"), rate = SHADOW_EDGE.rate[shadowRank(ranks, "edge")];
  const parts = [`One shade: ${n(u.hp * scale * b.troopHp)} HP`, `${knives} knives, one out every ${n(u.cooldown / knives)}s within ${u.reach} cells`, `${n(u.damage * scale * b.troopDamage)} damage a cut`, `each hit +${n(rate * 100)}% to the next, compounding`];
  if (pierce) parts.push(`pierces ${n(pierce * 100)}% of armor`);
  if (bleed) parts.push(`bleeds ${n(SHADOW_BLEED.share[bleed] * 100)}% of a hit a second for ${SHADOW_BLEED.time[bleed]}s`);
  return parts.join(" · ");
}

/** C4 nanobots' numbers with `ranks`, and the shared Smithy and skill bonuses. */
export function nanoStats(save: Save, ranks: NanoRanks | undefined): string {
  const l = save.defend.levels, b = bonuses(save), n = (v: number) => Number(v.toFixed(2));
  const chance = NANO_REPLICATE.chance[nanoRank(ranks, "replicate")];
  const reload = NANO_TOWER.cooldown * (cannonCooldown(l.cannonRate) / cannonCooldown(0)) * b.towerReload;
  const parts = [`A harmless shell every ${n(reload)}s`, `${NANO_TOWER.range} range`, `infected enemies burst for ${n(cannonDamage(l.cannonDamage) * b.towerDamage * NANO_TOWER.blast)} as they die`,
    `cloud ${NANO_CLOUD.radius[nanoRank(ranks, "cloud")]} cells round for ${NANO_TOWER.life}s`, `blast ${NANO_BLAST.radius[nanoRank(ranks, "blast")]} cells round`];
  parts.push(chance ? `${n(chance * 100)}% chance a dying host sets free a new cloud` : "no new clouds from the dying");
  return parts.join(" · ");
}

/** The trees climbed side by side, as the Defend page drives them: the
 * keep's, the walls', the gates' and the ballistas'. */
export type SideKind = "keep" | "walls" | "gate" | "ballistas";
type Back = { id: string; rank: number };
type Done = { ok: true } | { ok: false; reason: string };
export type SideUi = {
  /** The root node's id, the panel's title and whom it upgrades. */
  root: string; name: string; whom: string; plain: string;
  graph: (save: Save) => GraphNode[];
  card: (save: Save, id: string) => string;
  step: (save: Save, id: string) => string | undefined;
  undo: (save: Save, id: string) => Back | undefined;
  beyond: (save: Save, id: string) => { undo: string } | { all: true } | undefined;
  buy: (save: Save, branch: string) => Done;
  undoRank: (save: Save, back: Back) => Done;
  respec: (save: Save) => Done;
  allocated: (save: Save) => number;
  owned: (save: Save) => boolean;
};

function sideUi<Id extends string>(tree: SideTree<Id>, ranks: (save: Save) => Ranks<Id>, o: {
  name: string; whom: string; plain: string; about: string; stats: (save: Save, r: Ranks<Id>) => string;
  buy: (save: Save, id: Id) => Done; undo: (save: Save, id: Id, rank: number) => Done; respec: (save: Save) => Done; allocated: (r: Ranks<Id>) => number;
}): SideUi {
  return {
    root: tree.root, name: o.name, whom: o.whom, plain: o.plain,
    graph: (save) => sideGraph(tree, ranks(save)),
    card: (save, id) => sideCardHtml(save, tree, ranks(save), id, o.name, o.about, (r) => o.stats(save, r)),
    step: (save, id) => sideStep(tree, ranks(save), id),
    undo: (save, id) => sideUndo(tree, ranks(save), id),
    beyond: (save, id) => sideBeyond(tree, ranks(save), id),
    buy: (save, branch) => o.buy(save, branch as Id),
    undoRank: (save, back) => o.undo(save, back.id as Id, back.rank),
    respec: o.respec,
    allocated: (save) => o.allocated(ranks(save)),
    owned: (save) => !!ranks(save),
  };
}

export const SIDE_UI: Record<SideKind, SideUi> = {
  keep: sideUi(KEEP_TREE, (s) => s.defend.keepRanks, {
    name: "Keep", whom: "this building", plain: "turn it back into a plain keep", about: STRUCTURES.keep.description, stats: keepStats,
    buy: upgradeKeep, undo: undoKeep, respec: respecKeep, allocated: keepAllocated,
  }),
  walls: sideUi(WALL_TREE, (s) => s.defend.wallRanks, {
    name: "Walls", whom: "the walls", plain: "turn every wall back into plain stone (walls inside the city go back to the palette)", about: WALL_BLOCK_DESCRIPTION, stats: wallStats,
    buy: upgradeWalls, undo: undoWalls, respec: respecWalls, allocated: wallAllocated,
  }),
  gate: sideUi(GATE_TREE, (s) => s.defend.gateRanks, {
    name: "City gate", whom: "the gates", plain: "turn every gate back into a plain one", about: GATE_DESCRIPTION, stats: gateStats,
    buy: upgradeGate, undo: undoGate, respec: respecGate, allocated: gateAllocated,
  }),
  ballistas: sideUi(BALLISTA_TREE, (s) => s.defend.ballistaRanks, {
    name: "Wall ballista", whom: "the ballistas", plain: "turn every wall ballista back into a plain one", about: BALLISTA_DESCRIPTION, stats: ballistaStats,
    buy: upgradeBallistas, undo: undoBallistas, respec: respecBallistas, allocated: ballistaAllocated,
  }),
};

const REVOLUTIONARY_TREE: SideTree<RevolutionaryPathId> = { root: "k:revolutionary", icon: "revolutionary", every: "Every Revolutionary", paths: REVOLUTIONARY_PATHS };
/** The Revolutionary's shared tree, whose branches grow off its node in its
 * own building tree (rank nodes `q:<branch>:<rank>`, its root its node). */
export const REVOLUTIONARY_UI: SideUi = sideUi(REVOLUTIONARY_TREE, (s) => s.defend.revolutionaryRanks, {
  name: "Revolutionary", whom: "the Revolutionaries", plain: "take every upgrade off the Revolutionaries", about: STRUCTURES.revolutionary.description, stats: revolutionaryStats,
  buy: upgradeRevolutionary, undo: undoRevolutionary, respec: respecRevolutionary, allocated: revolutionaryAllocated,
});
const SHADOW_TREE: SideTree<ShadowPathId> = { root: "k:shadow", icon: "shadow", every: "Every Shadow", paths: SHADOW_PATHS };
/** The Shadow's shared tree, grafted onto its node like the Revolutionary's. */
export const SHADOW_UI: SideUi = sideUi(SHADOW_TREE, (s) => s.defend.shadowRanks, {
  name: "Shadow", whom: "the Shadows", plain: "take every upgrade off the Shadows", about: STRUCTURES.shadow.description, stats: shadowStats,
  buy: upgradeShadow, undo: undoShadow, respec: respecShadow, allocated: shadowAllocated,
});
const NANO_TREE: SideTree<NanoPathId> = { root: "k:nanoTower", icon: "nanoTower", every: "Every C4 nanobots", paths: NANO_PATHS };
/** C4 nanobots' shared tree, grafted onto its node like the Shadow's. */
export const NANO_UI: SideUi = sideUi(NANO_TREE, (s) => s.defend.nanoRanks, {
  name: "C4 nanobots", whom: "the C4 nanobots", plain: "take every upgrade off the C4 nanobots", about: STRUCTURES.nanoTower.description, stats: nanoStats,
  buy: upgradeNano, undo: undoNano, respec: respecNano, allocated: nanoAllocated,
});
/** The shared branches growing off a building of `kind`'s own node, if it has any. */
export const sharedBranches = (kind: string): SideUi | undefined => (kind === "revolutionary" ? REVOLUTIONARY_UI : kind === "shadow" ? SHADOW_UI : kind === "nanoTower" ? NANO_UI : undefined);
/** A building's tree with its shared branches grafted onto its node. */
export function graftedGraph(save: Save, kind: PaletteItem | "wallSpikes", wear?: Wear): GraphNode[] {
  const own = treeGraph(kind, wear), shared = sharedBranches(kind);
  return shared ? [...own, ...shared.graph(save).filter((n) => n.id !== shared.root)] : own;
}

/** A family keeps its base identity through kind changes and respecs.
 * Placement UIDs intentionally do not affect the visual identity. */
export function specialtyCircle(kind: PaletteItem | "wallSpikes" | SideKind, wear?: Wear, ranks?: KeepRanks, wallRanks?: WallRanks, gateRanks?: GateRanks, ballistaRanks?: BallistaRanks, revolutionaryRanks?: RevolutionaryRanks, shadowRanks?: ShadowRanks, nanoRanks?: NanoRanks): CircleState {
  const root = kind === "keep" || kind === "walls" || kind === "wallSpikes" || kind === "gate" || kind === "ballistas" ? kind : rootOf(kind as never);
  const upgrades: Array<CircleState['upgrades'][number]> = [{ id: `kind:${kind}`, rank: 1, visualOnly: true }];
  // The actual owned tree includes every earlier transformation and crowned
  // path. Evolving must retain its learned complexity instead of starting over.
  if (hasTree(kind)) for (const n of buildingTree(kind, wear))
    if (n.state === "owned" && n.parent) upgrades.push({ id: `step:${n.id}`, rank: 1 });
  if (kind === "keep") for (const p of KEEP_PATHS) upgrades.push({ id: `keep:${p.id}`, rank: keepRank(ranks, p.id) });
  if (kind === "walls") for (const p of WALL_PATHS) upgrades.push({ id: `wall:${p.id}`, rank: wallRank(wallRanks, p.id) });
  if (kind === "gate") for (const p of GATE_PATHS) upgrades.push({ id: `gate:${p.id}`, rank: gateRank(gateRanks, p.id) });
  if (kind === "ballistas") for (const p of BALLISTA_PATHS) upgrades.push({ id: `ballista:${p.id}`, rank: ballistaRank(ballistaRanks, p.id) });
  if (kind === "revolutionary") for (const p of REVOLUTIONARY_PATHS) upgrades.push({ id: `revolutionary:${p.id}`, rank: revolutionaryRank(revolutionaryRanks, p.id) });
  if (kind === "shadow") for (const p of SHADOW_PATHS) upgrades.push({ id: `shadow:${p.id}`, rank: shadowRank(shadowRanks, p.id) });
  if (kind === "nanoTower") for (const p of NANO_PATHS) upgrades.push({ id: `nano:${p.id}`, rank: nanoRank(nanoRanks, p.id) });
  const city = ["keep", "walls", "gate", "ballistas", "wallBlock", "wallSpikes", "cityTile", "cityGate", "wallBallista", "monsterBait"].includes(kind);
  return { topic: `building:${root}`, upgrades, motif: city ? "tesseract" : "voronoi" };
}
