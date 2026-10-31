/** Average DPS: a building's damage a second against a typical crowd,
 * worked out from the same numbers the battle uses (damage, reload, troops
 * in the garrison, splash, chains, crits as their average), so any change to
 * a tower changes its estimate at once. It is a rough guide for comparing
 * buildings and sizing Siege castles, never battle damage: travel time,
 * targeting, overkill, terrain and who is in reach are left out.
 *
 * The crowd: `CROWD.density` enemies to a square cell round whatever is
 * struck, so a blast of radius r hits 1 + density·πr² of them, at most
 * `CROWD.most`. Effects that grow during a fight (the Shadow's edge, the
 * Hawk tower's focus) are averaged over `FIGHT` seconds. Not battle code:
 * only + − × ÷ and `Math.PI` so every engine agrees. */
import {
  ARCHER_UNIT, ASSASSIN_UNIT, BALLISTA, BRAWLER, DARK_WIZARD, FIRE_MAGE, FLAME_SECONDS, GATLING_GUNNER, GUNNER, HERO, HOPLITE, JAVELINEER, LANCER,
  MACHINE_GUNNER, MUSKETEER, NANO_TOWER, RAIL_SNIPER, ROCKETEER, SHADE, SLINGER, SNIPER, SOLDIER, SPEARMAN, STAB_WIDTH, TURRET, VALKYRIE, WIZARD_REST,
  archerCooldown, archerDamage, archerRange, ballistaCooldown, ballistaDamage, ballistaRange, cannonCooldown, cannonDamage, cannonSplash, chainJump,
  emberDps, emberSeconds, EMBER_SHARE, fireballDamage, fireballSplash, flameDps, flameRange, iceDamage, ICE_RANGE, soldierCap, soldierScale, stabLength,
  turretChain, wizardChain, type Bonuses, type StructureKind, type UpgradeId,
} from "./catalog.ts";
import {
  BAYONET, BELT_FEED, BERSERK, BLADE_DANCE, BOW_JAVELIN, CLUSTER, CONDUCTION, CRUSADE, CRYOMANCY, DEADEYE, DUELISTS, FIRE_ARROWS, GRENADIERS, GUNNERY,
  HALBERD, HEADHUNT, HEAVY_LANCE, LONG_SPEARS, MARKSMEN, OIL, OVERDRIVE, PIERCING, PYRO, PYROCLASM, QUICKDRAW, RICOCHET, RIME, SALVO, SET_SPEARS,
  SHARP_MUSKETS, SIEGE_SHOT, SKIRMISH, SKYRANGER, SPEAR_WALL, STOPPING, STORM, SUPPRESS, THROWING, TRIPOD, VOLLEY, WHIRLWIND, WISP, WISP_FIRE,
  WISP_LIGHTNING, type PathId,
} from "../knowledge-paths.ts";
import { hawkDamage, hawkReload } from "./hawk-focus.ts";
import { denOf } from "./assassins.ts";
import { ARROW_LOOPS, BOILING_OIL, keepRank } from "../keep-upgrades.ts";
import { TRAPPED, wallRank } from "../wall-upgrades.ts";
import { GATE_TOWERS, PORTCULLIS, gateRank } from "../gate-upgrades.ts";
import { FIRE_BOLTS, HEAVY_BOLTS, WINDLASS, ballistaRank } from "../ballista-upgrades.ts";
import { CHAIN, CRIT_CHANCE, CRIT_DAMAGE, DETONATOR, SQUAD, revolutionaryRank } from "../revolutionary-upgrades.ts";
import { SHADOW_BLEED, SHADOW_EDGE, SHADOW_KNIVES, shadowRank } from "../shadow-upgrades.ts";
import { NANO_BLAST, NANO_CLOUD, NANO_REPLICATE, nanoRank } from "../nanobot-upgrades.ts";
import { CHRONO, chronoRank } from "../chrono-upgrades.ts";

/** The crowd an estimate assumes: enemies to a square cell, and the most
 * one attack can reach however wide it is. */
export const CROWD = { density: 0.35, most: 8 };
/** Seconds an enemy stays in burning ground or a trail before it walks out. */
export const DWELL = 2;
/** Seconds a fight lasts, for effects that grow as it goes on. */
export const FIGHT = 30;
/** HP of the toughest enemies, which the Hawk tower focuses on. */
export const FOCUS_HP = 1000;
/** HP of a typical enemy, for damage given as a share of its health. */
export const TYPICAL_HP = 100;
/** The share of the crowd round a wizard tower's fan of fire or ice. */
const FAN = 2 / 3;
/** Strikes a melee troop typically lands on one enemy, for first-strike bonuses. */
const STRIKES_EACH = 3;

/** Enemies a blast of radius `r` hits. */
export const inArea = (r: number) => Math.min(CROWD.most, 1 + CROWD.density * Math.PI * r * r);
/** Enemies a line `long` cells long and `wide` either side of its middle hits. */
export const alongLine = (long: number, wide: number) => Math.min(CROWD.most, 1 + CROWD.density * long * 2 * wide);
/** Enemies a chain of `links` reaches. */
export const chained = (links: number) => Math.min(CROWD.most, Math.max(1, links));
/** The average of a hit that is `times` as hard one time in `every`. */
const critEvery = (times: number, every: number) => 1 + (times - 1) / every;

/** What an estimate reads: the city's Forge levels and battle bonuses
 * (Training, skills and every shared tree, from `bonuses`), and the
 * building's own Study path. */
export type AverageInput = { levels: Partial<Record<UpgradeId, number>>; bonuses: Bonuses; path?: PathId; rank?: number };
export type EstimateKind = StructureKind | "wall" | "gate" | "wallBallista";

/** A building's average damage a second (see the top of the file). */
export function averageDps(kind: EstimateKind, input: AverageInput): number {
  const L = (id: UpgradeId) => input.levels[id] ?? 0,
    b = input.bonuses,
    rank = (id: PathId) => (input.path === id ? (input.rank ?? 0) : 0);
  // Troops: their garrison, each hitting `damage` every `every` seconds.
  const troop = soldierScale(L("soldierArms")) * b.troopDamage,
    garrison = soldierCap(L("barracksCapacity"));
  const squad = (damage: number, every: number, hits = 1, units = garrison) => (units * damage * troop * hits) / every;
  // Towers: one hit of `damage` every `every` seconds, before Training.
  const tower = (damage: number, every: number, hits = 1) => (damage * b.towerDamage * hits) / (every * b.towerReload);
  const archer = () => tower(archerDamage(L("archerDamage")), archerCooldown(L("archerRate")));
  const cannon = (damage = 1, reload = 1, r = cannonSplash(L("cannonDamage"))) => tower(cannonDamage(L("cannonDamage")) * damage, cannonCooldown(L("cannonRate")) * reload, inArea(r));
  switch (kind) {
    case "repairShop": return 0;
    case "keep": {
      const loops = keepRank(b.keep, "arrowLoops"), oil = keepRank(b.keep, "boilingOil");
      const arrows = loops ? tower(archerDamage(L("archerDamage")) * ARROW_LOOPS.damage[loops], ARROW_LOOPS.reload[loops], loops >= 3 ? chained(ARROW_LOOPS.volley) : 1) : 0;
      // Oil only reaches what stands at the walls: about half the crowd round a blast.
      const pour = oil ? (b.towerDamage * (BOILING_OIL.damage[oil] / BOILING_OIL.every[oil] + BOILING_OIL.dps[oil]) * inArea(BOILING_OIL.reach[oil])) / 2 : 0;
      return arrows + pour;
    }
    case "wall": {
      // A trapped stone bursts once when it breaks: spread over a fight.
      const trap = wallRank(b.walls, "trapped");
      return trap ? (TRAPPED.damage[trap] * inArea(TRAPPED.radius[trap])) / FIGHT : 0;
    }
    case "gate": {
      const bars = gateRank(b.gate, "portcullis"), towers = gateRank(b.gate, "gateTowers");
      const holes = PORTCULLIS.every[bars] ? (PORTCULLIS.damage[bars] * b.towerDamage * inArea(PORTCULLIS.reach)) / 2 / PORTCULLIS.every[bars] : 0;
      const bolts = towers
        ? tower(ballistaDamage(L("ballistaDamage")) * GATE_TOWERS.share[towers], GATE_TOWERS.cooldown, Math.min(GATE_TOWERS.pierce[towers], alongLine(GATE_TOWERS.range[towers], BALLISTA.width))) * (towers >= 2 ? GATE_TOWERS.twin : 1)
        : 0;
      return holes + bolts;
    }
    case "wallBallista": {
      const heavy = ballistaRank(b.ballista, "heavyBolts"), fire = ballistaRank(b.ballista, "fireBolts"), wind = ballistaRank(b.ballista, "windlass");
      const hits = Math.min(HEAVY_BOLTS.pierce[heavy] || BALLISTA.pierce, alongLine(ballistaRange(L("ballistaRange")) + WINDLASS.range[wind], BALLISTA.width));
      const bolt = tower(ballistaDamage(L("ballistaDamage")) * HEAVY_BOLTS.damage[heavy] * (1 + (fire ? FIRE_BOLTS.share * FIRE_BOLTS.burn : 0)), ballistaCooldown(L("ballistaRate")) * WINDLASS.reload[wind], hits);
      return bolt * (wind >= 3 ? 3 : 1);
    }
    case "watchTower":
      // Marks, not damage: the castle's estimate counts what marking adds.
      return 0;
    case "archerTower":
      return archer();
    case "brazierTower": {
      const fire = rank("fireArrows"),
        shot = archer() * (fire >= 3 ? chained(FIRE_ARROWS.volley) : 1);
      // A burn of `share` of a hit a second, kept lit by the next arrow.
      return shot + archerDamage(L("archerDamage")) * b.towerDamage * (fire ? FIRE_ARROWS.share[fire] : FIRE_ARROWS.hall.share);
    }
    case "hawkTower": {
      // Focus grows shot by shot on one target and starts again on the
      // next: average over the shots it takes to bring down a tough one.
      const sharp = rank("sharpshooters"),
        base = archerCooldown(L("archerRate")) * b.towerReload;
      let t = 0,
        total = 0;
      for (let shot = 1; total < FOCUS_HP && t < FIGHT; shot++) {
        total += archerDamage(L("archerDamage")) * b.towerDamage * hawkDamage(sharp, shot);
        t += hawkReload(base, sharp, shot + 1);
      }
      return total / t;
    }
    case "wispTower": {
      // A wisp sweeps the crowd, striking each enemy it passes, until its
      // contacts run out; new ones come every `refill` seconds.
      const wisp = rank("wispArrow"),
        hit = archerDamage(L("archerDamage")) * b.towerDamage,
        arrows = WISP.capacity[Math.min(1, wisp)],
        pass = alongLine(archerRange(L("archerRange")), WISP.width) / (archerCooldown(L("archerRate")) * b.towerReload);
      let dps = hit * Math.min(WISP.hits / WISP.refill, arrows * pass);
      if (wisp >= 2) dps += hit * WISP_FIRE.scale * ((WISP_FIRE.capacity * WISP_FIRE.hits) / WISP_FIRE.refill + WISP_FIRE.trailDps * inArea(WISP_FIRE.width));
      if (wisp >= 3) dps += hit * WISP_LIGHTNING.scale * WISP_LIGHTNING.trailDps * alongLine(archerRange(L("archerRange")), WISP_LIGHTNING.width) * (Math.min(DWELL, WISP_LIGHTNING.trailLife) / WISP_LIGHTNING.refill);
      return dps;
    }
    case "chronoTower": {
      // It holds shots that would miss and lets them go together; the
      // Divine Arrow's reserve is the rest of what it adds.
      const divine = chronoRank(b.chrono, "divine"),
        amplify = CHRONO.multiplier[chronoRank(b.chrono, "amplify")];
      return archer() * (1 + (divine ? amplify : 0));
    }
    case "cannonTower":
      return cannon();
    case "batteryTower": {
      const gun = rank("gunnery"),
        r = cannonSplash(L("cannonDamage"));
      const grape = 1 + (GUNNERY.grape * GUNNERY.grapeShare * inArea(r * GUNNERY.grapeR)) / inArea(r);
      return cannon(grape, gun ? GUNNERY.reload[gun] : GUNNERY.hall);
    }
    case "mortarTower": {
      const siege = rank("siegeShot"),
        damage = siege ? SIEGE_SHOT.damage[siege] : SIEGE_SHOT.hall.damage,
        r = cannonSplash(L("cannonDamage")) * (siege >= 2 ? SIEGE_SHOT.radius : 1);
      // The burning ground: `burnShare` of a hit a second while they cross it.
      return cannon(damage * (1 + SIEGE_SHOT.burnShare * Math.min(DWELL, SIEGE_SHOT.burnLife)), siege ? SIEGE_SHOT.reload : SIEGE_SHOT.hall.reload, r);
    }
    case "minelayerTower":
      // A mine a reload, bursting as a shell would under whoever treads on it.
      return cannon();
    case "nanoTower": {
      // A cloud infects a crowd; each host bursts as it dies.
      const cloud = inArea(NANO_CLOUD.radius[nanoRank(b.nano, "cloud")]) * (1 + NANO_REPLICATE.chance[nanoRank(b.nano, "replicate")]);
      const burst = cannonDamage(L("cannonDamage")) * NANO_TOWER.blast * inArea(NANO_BLAST.radius[nanoRank(b.nano, "blast")]);
      return tower(burst * cloud, NANO_TOWER.cooldown * (cannonCooldown(L("cannonRate")) / cannonCooldown(0)));
    }
    case "wizardTower":
    case "pyreTower":
    case "frostTower":
    case "stormTower": {
      // Flames and ice in turn, each followed by a rest; the fans reach
      // about two thirds of the crowd round them.
      const pyro = rank("pyromancy"), rime = rank("rime"), storm = rank("storm");
      const burn = FLAME_SECONDS * (pyro >= 3 ? PYRO.burn : 1),
        flame = flameDps(L("wizardFlame")) * b.towerDamage * PYRO.damage[pyro] * burn * Math.max(1, inArea(flameRange(L("wizardFlame"))) * FAN),
        bolt = flameDps(L("wizardFlame")) * b.towerDamage * STORM.damage * (storm >= 3 ? STORM.surge : 1) * chained(STORM.links[storm]),
        ice = iceDamage(L("wizardIce")) * b.towerDamage * (rime >= 2 ? RIME.damage : 1) * Math.max(1, inArea(ICE_RANGE) * FAN);
      if (kind === "pyreTower") return flame / (burn + WIZARD_REST);
      if (kind === "frostTower") return ice / (WIZARD_REST / 2);
      if (kind === "stormTower") return (bolt + ice) / (2 * WIZARD_REST);
      return (flame + ice) / (burn + 2 * WIZARD_REST);
    }
    case "darkKeep": {
      const jump = chainJump(L("chainReach")),
        reach = (links: number) => chained(Math.min(links, 1 + CROWD.density * Math.PI * jump * jump * links));
      return 4 * tower(TURRET.damage, TURRET.cooldown, reach(turretChain(L("chainCount")))) + squad(DARK_WIZARD.damage, DARK_WIZARD.cooldown, reach(wizardChain(L("chainCount"))), 1);
    }
    case "monsterBait": {
      // Oil-soaked crates set their biters burning; a few gnaw at once.
      const oil = rank("oilSoaked");
      return oil ? OIL.dps[oil] * chained(3) : 0;
    }
    case "meleeGuild":
      return squad(BRAWLER.damage, BRAWLER.cooldown);
    case "rangedGuild":
      return squad(SLINGER.damage, SLINGER.cooldown);
    case "barracks":
      return squad(SOLDIER.damage, SOLDIER.cooldown);
    case "chapterHouse":
      return squad(SOLDIER.damage * (rank("crusaders") >= 3 ? CRUSADE.damage : 1), SOLDIER.cooldown);
    case "berserkerLodge": {
      const rage = rank("berserkers");
      return squad(SOLDIER.damage, SOLDIER.cooldown * (rage ? BERSERK.cooldown : BERSERK.rage), rage >= 3 ? 1 + BERSERK.share * (inArea(BERSERK.cleave) - 1) : 1);
    }
    case "halberdYard":
      return squad(SOLDIER.damage * HALBERD.damage, SOLDIER.cooldown);
    case "heroHall": {
      const whirl = rank("whirlwind"), dance = rank("bladeDance");
      const spins = 1 / WHIRLWIND.every[whirl],
        spin = (whirl ? WHIRLWIND.damage[whirl] : HERO.spinDamage) * inArea(whirl ? WHIRLWIND.radius[whirl] : HERO.spin),
        slash = BLADE_DANCE.slashes[dance] * inArea(HERO.arc);
      return squad(HERO.damage, HERO.cooldown * BLADE_DANCE.cooldown[dance], spins * spin + (1 - spins) * slash, 1);
    }
    case "assassinDen":
    case "bloodHall":
    case "veilHouse":
    case "poisonDen": {
      const d = denOf(kind, rank("bloodletters"), rank("shadowcloak"), rank("venom"), rank("headhunters"));
      // From the cloak the first strike lands harder; it takes `reveal`
      // seconds to slip back in.
      const ambush = d.veiled ? 1 + ((d.ambush - 1) * ASSASSIN_UNIT.cooldown) / (ASSASSIN_UNIT.cooldown + d.reveal) : 1;
      const bounty = d.hunt ? Math.min(TYPICAL_HP * HEADHUNT.bounty[d.hunt], ASSASSIN_UNIT.damage * HEADHUNT.cap) / ASSASSIN_UNIT.damage : 0;
      return squad(ASSASSIN_UNIT.damage, ASSASSIN_UNIT.cooldown, (critEvery(d.crit, d.every) * ambush + bounty) * (d.poisons ? d.more : 1));
    }
    case "spearHall": {
      const long = rank("longSpears"), set = rank("setSpears");
      const first = 1 + (SET_SPEARS.fresh[set] - 1) / STRIKES_EACH;
      return squad(SPEARMAN.damage * (long >= 3 ? LONG_SPEARS.damage : 1) * first, SPEARMAN.cooldown, 1 + LONG_SPEARS.share[long]);
    }
    case "phalanx": {
      const wall = rank("spearWall");
      return squad(HOPLITE.damage * SPEAR_WALL.damage[wall], HOPLITE.cooldown, 1 + SPEAR_WALL.share[wall] * (inArea(HOPLITE.reach) - 1));
    }
    case "javelinCamp": {
      const arms = rank("throwingArms");
      return squad(JAVELINEER.damage, JAVELINEER.cooldown * THROWING.reload[arms], 1 + THROWING.extra[arms]);
    }
    case "lancerStable": {
      const heavy = rank("heavyLance");
      const charge = 1 + (HEAVY_LANCE.charge[heavy] - 1) / STRIKES_EACH,
        trample = heavy >= 3 ? 1 + (HEAVY_LANCE.share * (inArea(HEAVY_LANCE.trample) - 1)) / STRIKES_EACH : 1;
      return squad(LANCER.damage * charge, LANCER.cooldown, trample);
    }
    case "valkyriePalace":
      return squad(VALKYRIE.damage, VALKYRIE.cooldown, alongLine(stabLength(L("valkyrieReach")), STAB_WIDTH));
    case "gunHall": {
      const quick = rank("quickdraw"), duel = rank("duelists");
      return squad(GUNNER.damage * DUELISTS.damage[duel] * (duel >= 3 ? critEvery(DUELISTS.crit, DUELISTS.every) : 1), GUNNER.cooldown * QUICKDRAW.reload[quick], quick >= 3 ? 2 : 1);
    }
    case "musketHall": {
      const grenade = rank("grenadiers"), volley = rank("volleyFire"), sharp = rank("sharpMuskets"), bayonet = rank("bayonets");
      const reload = MUSKETEER.cooldown * (volley >= 3 ? 1 - VOLLEY.drill * Math.min(VOLLEY.most, garrison - 1) : 1);
      // A Grenadier's ball bursts, throws bomblets and leaves the ground burning.
      const burst = grenade
        ? inArea(MUSKETEER.blast) + GRENADIERS.bomblets[grenade] * GRENADIERS.bombShare * inArea(MUSKETEER.blast * GRENADIERS.bombR) + GRENADIERS.share * Math.min(DWELL, GRENADIERS.burn[grenade]) * inArea(MUSKETEER.blast)
        : 1;
      const balls = burst + VOLLEY.extra[volley] * VOLLEY.share,
        thrust = bayonet ? BAYONET.damage / BAYONET.cooldown / (1 / MUSKETEER.cooldown) / STRIKES_EACH : 0;
      return squad(MUSKETEER.damage * SHARP_MUSKETS.damage[sharp], reload, balls + thrust);
    }
    case "gunNest": {
      const belt = rank("beltFeed"), tripod = rank("tripod");
      return squad(MACHINE_GUNNER.damage * (belt >= 2 ? BELT_FEED.damage : 1) * TRIPOD.damage[tripod], MACHINE_GUNNER.cooldown * BELT_FEED.reload[belt]);
    }
    case "gatlingNest": {
      const over = rank("overdrive"), stop = rank("stoppingPower");
      return squad(GATLING_GUNNER.damage * OVERDRIVE.damage[over] * STOPPING.damage[stop], GATLING_GUNNER.cooldown * OVERDRIVE.reload[over]);
    }
    case "rocketBattery": {
      const cluster = rank("clusterRockets"), salvo = rank("salvoRacks");
      const r = ROCKETEER.blast + CLUSTER.blast[cluster];
      const burst = inArea(r) + (cluster >= 2 ? CLUSTER.bomblets[cluster] * GRENADIERS.bombShare * inArea(r * GRENADIERS.bombR) : 0) + Math.min(DWELL, CLUSTER.burn[cluster]) * CLUSTER.burnShare * inArea(r);
      return squad(ROCKETEER.damage, ROCKETEER.cooldown * SALVO.reload[salvo], burst * SALVO.rockets[salvo]);
    }
    case "sniperLodge": {
      const marks = rank("marksmen"), glance = rank("ricochet"), suppress = rank("suppressors"), deadeye = rank("deadeye"), pierce = rank("piercing");
      const range = SNIPER.range + (marks ? MARKSMEN.range : 0) + (deadeye >= 3 ? DEADEYE.range : 0) + (pierce >= 3 ? PIERCING.range : 0);
      const hits = pierce ? alongLine(range, PIERCING.width) : 1 + Math.min(CROWD.most - 1, RICOCHET.bounces[glance]) * RICOCHET.share[glance];
      const damage = SNIPER.damage * DEADEYE.damage[deadeye] * PIERCING.damage[pierce] * (marks >= 3 ? critEvery(MARKSMEN.crit, MARKSMEN.every) : 1);
      return squad(damage, SNIPER.cooldown * (suppress >= 3 ? SUPPRESS.reload : 1), hits);
    }
    case "revolutionary": {
      const r = (id: Parameters<typeof revolutionaryRank>[1]) => revolutionaryRank(b.revolutionary, id);
      const crit = 1 + CRIT_CHANCE.chance[r("critChance")] * (CRIT_DAMAGE.times[r("critDamage")] - 1),
        boom = DETONATOR.radius[r("splash")] ? DETONATOR.share * inArea(DETONATOR.radius[r("splash")]) : 0;
      return squad(RAIL_SNIPER.damage * crit, RAIL_SNIPER.cooldown, chained(CHAIN.hits[r("chain")]) + boom, SQUAD.snipers[r("squad")]);
    }
    case "shadow": {
      // Each knife's loop cuts whoever it passes; every cut sharpens the
      // edge by `rate`, averaged over a fight; a bleed adds its share.
      const knives = SHADOW_KNIVES.knives[shadowRank(b.shadow, "knives")],
        rate = SHADOW_EDGE.rate[shadowRank(b.shadow, "edge")],
        bleed = SHADOW_BLEED.share[shadowRank(b.shadow, "bleed")];
      const cuts = alongLine(2 * SHADE.reach, SHADE.width),
        perSecond = (knives * cuts) / SHADE.cooldown;
      let edge = 1,
        sum = 0;
      for (let t = 0; t < FIGHT; t++) {
        sum += edge;
        for (let n = 0; n < perSecond; n++) edge = Math.min(SHADE.cap, edge * (1 + rate * Math.min(1, perSecond - n)));
      }
      return squad(SHADE.damage * (sum / FIGHT) * (1 + bleed), SHADE.cooldown / knives, cuts, 1);
    }
    case "mageGuild":
    case "infernoHall":
    case "cinderHall":
    case "stormHall": {
      const pyro = rank("pyroclasm"), frost = rank("cinders"), storm = rank("conduction");
      const hit = fireballDamage(L("mageFireball")),
        r = fireballSplash(L("mageFireball"));
      if (kind === "stormHall") {
        // A bolt from one enemy to the next, a little weaker each link.
        let links = 0,
          share = 1;
        for (let n = 0; n < chained(CONDUCTION.targets[storm]); n++, share *= CONDUCTION.retain) links += share;
        return squad(hit * (1 + CONDUCTION.crit[storm] * (CONDUCTION.critical - 1)), FIRE_MAGE.cooldown, links);
      }
      if (kind === "cinderHall") return squad(hit * CRYOMANCY.damage, FIRE_MAGE.cooldown, inArea(r * CRYOMANCY.radius[frost]) * 0.7);
      // A fireball's blast (weaker toward its edge) and the burning ground it leaves.
      const fire = kind === "infernoHall",
        blast = hit * (fire ? PYROCLASM.damage[pyro] : 1) * inArea(fire ? r * PYROCLASM.radius[pyro] : r) * 0.7,
        ground = emberDps(L("mageEmbers")) * (fire ? PYROCLASM.damage[pyro] : 1) * Math.min(DWELL, emberSeconds(L("mageEmbers")) * (fire ? PYROCLASM.life[pyro] : 1)) * inArea(r * (fire ? PYROCLASM.radius[pyro] : EMBER_SHARE));
      return squad(blast + ground, FIRE_MAGE.cooldown);
    }
    case "archerBarracks":
    case "rangerLodge":
    case "skirmishCamp":
    case "skyrangerLodge": {
      const hit = ARCHER_UNIT.damage;
      if (kind === "rangerLodge") {
        // The bow-javelin pierces a file of them, bursting at the end from II.
        const n = rank("rangers"),
          file = Math.min(BOW_JAVELIN.hits[n], alongLine(archerRange(L("archerRange")), BOW_JAVELIN.width + 0.4));
        return squad(hit * BOW_JAVELIN.damage, BOW_JAVELIN.cooldown, file + BOW_JAVELIN.blastDamage[n] * inArea(BOW_JAVELIN.blast[n]));
      }
      if (kind === "skyrangerLodge") {
        // Every `every`th shot calls down a rain of arrows round its mark.
        const n = rank("skyranger");
        return squad(hit, ARCHER_UNIT.cooldown, 1 + (SKYRANGER.every[n] ? Math.min(SKYRANGER.arrows[n], inArea(SKYRANGER.radius[n])) / SKYRANGER.every[n] : 0));
      }
      if (kind === "skirmishCamp") {
        const n = rank("skirmishers");
        return squad(hit, ARCHER_UNIT.cooldown * (n ? SKIRMISH.reload[n] : SKIRMISH.camp), chained(SKIRMISH.arrows[n]));
      }
      return squad(hit, ARCHER_UNIT.cooldown);
    }
  }
}
