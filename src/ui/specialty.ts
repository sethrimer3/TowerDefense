import type { CircleState } from "../magic-circle/formation.ts";
/** A building's upgrades as the player meets them: what a path does to the
 * kind's numbers (`kindStats`), the read-only tree Tiles shows
 * (`upgradeTreeHtml`), and the living tree Defend shows when a placed
 * building is tapped (`treeGraph`, its nodes for `upgrade-graph.ts`, and
 * `treeCardHtml`, the card of the node picked in it). The tree comes from
 * `specializations.ts`; paths, ranks, icons and hues from `knowledge-paths.ts`. */
import type { Save } from "../save.ts";
import { BECOMES, TROOPS, allocated, rootOf, buildingPathsOf, buildingTree, undoRefund, type TreeNode, type UpgradeStep, type Wear } from "../specializations.ts";
import type { GraphNode } from "./upgrade-graph.ts";
import { ARROW_LOOPS, BASTIONS, BOILING_OIL, KEEP_PATHS, keepAllocated, keepRank, respecKeep, undoKeep, upgradeKeep, type KeepPathId, type KeepRanks } from "../keep-upgrades.ts";
import { STONEWORK, THORNWORK, TOWN_WALLS, WALL_PATHS, respecWalls, undoWalls, upgradeWalls, wallAllocated, wallRank, type WallPathId, type WallRanks } from "../wall-upgrades.ts";
import { sideRank, type SidePath, type SideRanks } from "../side-ranks.ts";
import { GATE_PATHS, GATE_TOWERS, IRONBOUND, PORTCULLIS, gateAllocated, gateBarred, gateRank, respecGate, undoGate, upgradeGate, type GatePathId, type GateRanks } from "../gate-upgrades.ts";
import { BALLISTA_PATHS, FIRE_BOLTS, HEAVY_BOLTS, WINDLASS, ballistaAllocated, ballistaRank, respecBallistas, undoBallistas, upgradeBallistas, type BallistaPathId, type BallistaRanks } from "../ballista-upgrades.ts";
import { pathById, pathTopicOf, UNSPECIALIZED, type PathId, FIRE_ARROWS, SHARP, GUNNERY, SIEGE_SHOT, CRUSADE, BLOODLETTERS, SHADOWCLOAK, VENOM, HEADHUNT, GRENADIERS, VOLLEY, BAYONET, SHARP_MUSKETS, BELT_FEED, TRIPOD, QUICKDRAW, DUELISTS, GUN_SHIELD, OVERDRIVE, STOPPING, DEADEYE, PIERCING, CLUSTER, SALVO, MARKSMEN, RICOCHET, SUPPRESS, BERSERK, HALBERD, RANGERS, SKIRMISH, FORTIFY, PYRO, RIME, STORM, PYROCLASM, CINDERS, SPOTTERS, SIGNAL } from "../knowledge-paths.ts";
import { bonuses } from "../progression.ts";
import { ITEM_NAMES, archerDamage, archerCooldown, archerRange, cannonDamage, cannonCooldown, CANNON_RANGE, SOLDIER, ARCHER_UNIT, soldierScale, STRUCTURES, flameDps, flameRange, iceDamage, ICE_RANGE, iceChill, watchRadius, fireballDamage, fireballSplash, emberDps, emberSeconds, FIRE_MAGE, FIREBALL_RANGE, keepHp, BRAWLER, ASSASSIN_UNIT, SLINGER, SNIPER, MUSKETEER, GUNNER, MACHINE_GUNNER, GATLING_GUNNER, ROCKETEER, WALL_BLOCK_DESCRIPTION, wallHp, GATE, GATE_DESCRIPTION, BALLISTA, BALLISTA_DESCRIPTION, ballistaCooldown, ballistaDamage, ballistaRange, gateHpScale, gateShut, type PaletteItem } from "../defend/catalog.ts";

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
  if (kind === "wizardTower") {
    const pyro = at("pyromancy"), rime = at("rime"), storm = at("storm");
    if (storm) return `${n(flameDps(l.wizardFlame) * b.towerDamage * STORM.damage * (storm >= 3 ? STORM.surge : 1))} bolt damage · ${STORM.links[storm]} targets · ${n(flameRange(l.wizardFlame))} bolt range · alternating with ice`;
    const fire = `${n(flameDps(l.wizardFlame) * b.towerDamage * PYRO.damage[pyro])} fire damage/s · ${n(flameRange(l.wizardFlame) + (pyro >= 2 ? PYRO.reach : 0))} fire range`;
    const ice = `${n(iceDamage(l.wizardIce) * b.towerDamage * (rime >= 2 ? RIME.damage : 1))} ice damage · ${ICE_RANGE + (rime >= 2 ? RIME.reach : 0)} ice range · ${n(iceChill(l.wizardIce) * (rime ? RIME.chill : 1))}s chill`;
    return rime ? ice : pyro ? fire : `${fire} · ${ice}`;
  }
  if (kind === "watchTower") {
    const spot = at("spotters"), signal = at("signalFires");
    return `${watchRadius(l.watchRadius) + (spot >= 2 ? SPOTTERS.radius : 0) + (signal >= 2 ? SIGNAL.radius : 0)} marking range · ${SPOTTERS.mark[spot]}x marked damage${signal ? ` · enemies move at ${SIGNAL.slow[signal] * 100}% speed` : ""}`;
  }
  if (kind === "mageGuild") {
    const pyro = at("pyroclasm"), cinders = at("cinders");
    return `Recruits: ${n(FIRE_MAGE.hp * soldierScale(l.soldierArms) * b.troopHp)} HP · ${n(fireballDamage(l.mageFireball) * soldierScale(l.soldierArms) * b.troopDamage * (pyro ? PYROCLASM.damage : 1))} fireball damage · ${n(fireballSplash(l.mageFireball) * (pyro >= 2 ? PYROCLASM.splash : 1))} blast radius · ${n(emberDps(l.mageEmbers) * b.troopDamage * (cinders >= 2 ? CINDERS.dps : 1))} ground damage/s · ${n(emberSeconds(l.mageEmbers) * (cinders ? CINDERS.life : 1))}s burning ground`;
  }
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
        deadeye ? "clear sight only" : "",
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

const ROMAN = ["", "I", "II", "III", "IV", "V"];
const ordinal = (n: number) => (n === 2 ? "other" : n === 3 ? "3rd" : `${n}th`);

/** A path rank's medallion: its icon in the path's colours, its numeral beneath. */
const medal = (path: PathId, rank: number) => {
  const p = pathById(path), r = p.ranks[Math.max(0, rank - 1)];
  return `<span class="path-medal"><canvas data-path-icon="${r.icon}:${p.hue}"></canvas>${rank ? `<b>${ROMAN[rank]}</b>` : ""}</span>`;
};
/** A building's medallion: its own icon. */
const buildingMedal = (kind: string) => `<span class="path-medal base"><canvas width="32" height="32" data-icon="${kind}"></canvas></span>`;

/** Tiles' read-only tree for `kind`: what a plain one can become, and the
 * paths it can climb, each rank with what it does (empty for a kind with
 * neither). Upgrades are bought on each building in Defend. */
export function upgradeTreeHtml(save: Save, kind: PaletteItem): string {
  const becomes = BECOMES[kind as keyof typeof BECOMES] ?? [], paths = buildingPathsOf(kind);
  if (!becomes.length && !paths.length) return "";
  const topic = pathTopicOf(kind);
  const base = `<li class="spec-row base">${buildingMedal(kind)}<div><b>${ITEM_NAMES[kind]}</b><small>${topic ? UNSPECIALIZED[topic] : TROOPS[kind as keyof typeof TROOPS] ?? ""}</small><small class="spec-stats">${kindStats(save, kind)}</small></div></li>`;
  const grow = becomes.map((b) => `<li class="spec-row">${buildingMedal(b.to)}<div><b>Becomes ${ITEM_NAMES[b.to]}</b><small>${b.cost} Knowledge · ${TROOPS[b.to] ?? "a tower"}</small></div></li>`).join("");
  const climb = paths.map((p) => `<li class="spec-row hue-${p.hue}">${medal(p.id, 1)}<div><b>${p.name}</b><small>${p.motto}: ${p.ranks.map((r, i) => `${ROMAN[i + 1]} ${r.name} (${r.cost.toLocaleString("en")})`).join(" · ")}${p.evolves ? ` · then ${p.evolves.name} (${p.evolves.cost.toLocaleString("en")})` : ""}</small></div></li>`).join("");
  return `<div class="tile-specialties"><small>UPGRADES · KNOWLEDGE, ONE BUILDING AT A TIME: TAP IT IN DEFEND WHILE BUILDING</small><ul>${base}${grow}${climb}</ul></div>`;
}

// ── The living tree ───────────────────────────────────────────────────────
const knowledgeTag = (n: number) => `${n >= 10000 ? `${Number((n / 1000).toFixed(1))}k` : n.toLocaleString("en")}✦`;

/** One building's tree as the graph draws it. */
export function treeGraph(kind: PaletteItem | "wallSpikes", wear?: Wear): GraphNode[] {
  return buildingTree(kind as never, wear).map((n): GraphNode => {
    const hue = n.path ? `hue-${pathById(n.path).hue}` : n.step?.type === "evolve" ? "hue-gold" : undefined;
    const face = n.kind
      ? `<canvas width="32" height="32" data-icon="${n.kind}"></canvas>`
      : `<canvas data-path-icon="${pathById(n.path!).ranks[n.rank! - 1].icon}:${pathById(n.path!).hue}"></canvas><b>${ROMAN[n.rank!]}</b>`;
    return { id: n.id, parent: n.parent, state: n.state, face, tag: n.state === "owned" ? undefined : knowledgeTag(n.cost), hue, side: n.side, hidden: n.hidden, closed: n.closed, took: n.took };
  });
}

/** The card for node `id` of a building of `kind` wearing `wear`: what it
 * is, what it does, its level and price, and Buy when it can be bought. */
export function treeCardHtml(save: Save, kind: PaletteItem | "wallSpikes", wear: Wear | undefined, id: string): string {
  const n = buildingTree(kind as never, wear).find((o) => o.id === id);
  if (!n) return `<p class="ug-hint">Tap a node to see what it does.</p>`;
  const free = save.settings.devMode, can = free || save.knowledge >= n.cost;
  let title: string, text: string, level = "", stats = "";
  if (n.kind) {
    title = ITEM_NAMES[n.kind as PaletteItem] ?? "Wall spikes";
    text = n.step?.type === "evolve" ? pathById(n.step.path).evolves!.text : n.kind === "wallSpikes" ? "Stakes along the wall's outer face." : `${TROOPS[n.kind as keyof typeof TROOPS] ? `${TROOPS[n.kind as keyof typeof TROOPS]} · ` : ""}${STRUCTURES[n.kind as keyof typeof STRUCTURES]?.description ?? ""}`;
    if (n.kind !== "wallSpikes") stats = kindStats(save, n.kind as PaletteItem, n.kind === kind ? wear?.path : undefined, n.kind === kind ? wear?.rank : 0);
  } else {
    const p = pathById(n.path!), r = p.ranks[n.rank! - 1];
    title = `${p.name} ${ROMAN[n.rank!]}: ${r.name}`;
    text = `${p.motto}. ${r.text}`;
    level = `Level ${n.rank} / ${p.ranks.length}`;
    if (kind !== "wallSpikes") stats = `At this rank: ${kindStats(save, kind as PaletteItem, p.id, n.rank)}`;
  }
  const back = n.state === "owned" ? undoRefund(kind as never, wear, n.id) : 0;
  const beyond = n.state === "owned" && !!treeBeyond(kind, wear, n.id);
  const state = n.state === "owned" ? `<b class="ug-owned">${(n.kind === kind && !wear) || (n.path && n.path === wear?.path && n.rank === wear?.rank) ? "Where it is now" : "Owned"}</b>${n.parent ? undoButton(n.id, back) : ""}${beyond ? AGAIN_SELL : ""}`
    : n.state === "next" ? `<button class="ug-buy" data-ug-buy="${n.id}" ${can ? "" : "disabled"}>Buy · ${free ? "Free" : `${n.cost.toLocaleString("en")} Knowledge`}</button>${can ? AGAIN_BUY : ""}`
    : `<span class="ug-locked">Locked: buy the one before it · ${n.cost.toLocaleString("en")} Knowledge</span>`;
  return `<div class="ug-card-head"><b>${title}</b>${level ? `<small>${level}</small>` : ""}</div><p>${text}</p>${stats ? `<p class="ug-stats">${stats}</p>` : ""}<div class="ug-card-foot" data-ug-ignore>${state}</div>`;
}

/** What tapping the picked node again does, said on its card. */
const AGAIN_BUY = `<small class="ug-again">or tap it again to buy</small>`;
const AGAIN_SELL = `<small class="ug-again">Tap it again to sell everything after it</small>`;

/** The owned node grown from owned node `id`: undoing it sells everything
 * after `id` (a second tap on a picked node). None when `id` is the tip. */
export const treeBeyond = (kind: PaletteItem | "wallSpikes", wear: Wear | undefined, id: string): string | undefined =>
  buildingTree(kind as never, wear).find((o) => o.parent === id && o.state === "owned")?.id;

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
  const b = bonuses(save), stone = wallRank(ranks, "stonework"), thorns = wallRank(ranks, "thornwork"), town = wallRank(ranks, "townWalls");
  const parts = [`${Math.round(wallHp(save.defend.levels.wallStrength) * b.wallHp * STONEWORK.hp[stone]).toLocaleString("en")} HP a stone`];
  if (stone >= 3) parts.push(`mends ${STONEWORK.mend * 100}% a second`);
  if (thorns) parts.push(`${THORNWORK.damage[thorns]} thorn damage every ${THORNWORK.every[thorns]}s${thorns >= 3 ? ` · ${THORNWORK.chill}s slow` : ""}`);
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

/** Tiles' read-only list of a side tree's branches, shared by every one of `whose`. */
function sideTreeHtml(paths: { name: string; motto: string; hue: string; ranks: { name: string; icon: string; cost: number }[] }[], whose: string): string {
  const rows = paths.map((p) => `<li class="spec-row hue-${p.hue}"><span class="path-medal"><canvas data-path-icon="${p.ranks[0].icon}:${p.hue}"></canvas></span><div><b>${p.name}</b><small>${p.motto}: ${p.ranks.map((r, i) => `${ROMAN[i + 1]} ${r.name} (${r.cost.toLocaleString("en")})`).join(" · ")}</small></div></li>`).join("");
  return `<div class="tile-specialties"><small>UPGRADES · KNOWLEDGE, SHARED BY EVERY ${whose}: PRESS AND HOLD ONE IN DEFEND WHILE BUILDING</small><ul>${rows}</ul></div>`;
}
/** Tiles' read-only lists of the gates' and the ballistas' branches. */
export const gateTreeHtml = () => sideTreeHtml(GATE_PATHS, "GATE");
export const ballistaTreeHtml = () => sideTreeHtml(BALLISTA_PATHS, "BALLISTA");

/** Tiles' read-only list of the walls' branches. */
export function wallTreeHtml(): string {
  const rows = WALL_PATHS.map((p) => `<li class="spec-row hue-${p.hue}"><span class="path-medal"><canvas data-path-icon="${p.ranks[0].icon}:${p.hue}"></canvas></span><div><b>${p.name}</b><small>${p.motto}: ${p.ranks.map((r, i) => `${ROMAN[i + 1]} ${r.name} (${r.cost.toLocaleString("en")})`).join(" · ")}</small></div></li>`).join("");
  return `<div class="tile-specialties"><small>UPGRADES · KNOWLEDGE, SHARED BY EVERY WALL: PRESS AND HOLD ONE IN DEFEND WHILE BUILDING</small><ul>${rows}</ul></div>`;
}

/** A family keeps its base identity through kind changes and respecs.
 * Placement UIDs intentionally do not affect the visual identity. */
export function specialtyCircle(kind: PaletteItem | "wallSpikes" | SideKind, wear?: Wear, ranks?: KeepRanks, wallRanks?: WallRanks, gateRanks?: GateRanks, ballistaRanks?: BallistaRanks): CircleState {
  const root = kind === "keep" || kind === "walls" || kind === "wallSpikes" || kind === "gate" || kind === "ballistas" ? kind : rootOf(kind as never);
  const upgrades = [{ id: `kind:${kind}`, rank: 1 }];
  if (wear) upgrades.push({ id: `path:${wear.path}`, rank: wear.rank });
  if (kind === "keep") for (const p of KEEP_PATHS) upgrades.push({ id: `keep:${p.id}`, rank: keepRank(ranks, p.id) });
  if (kind === "walls") for (const p of WALL_PATHS) upgrades.push({ id: `wall:${p.id}`, rank: wallRank(wallRanks, p.id) });
  if (kind === "gate") for (const p of GATE_PATHS) upgrades.push({ id: `gate:${p.id}`, rank: gateRank(gateRanks, p.id) });
  if (kind === "ballistas") for (const p of BALLISTA_PATHS) upgrades.push({ id: `ballista:${p.id}`, rank: ballistaRank(ballistaRanks, p.id) });
  const city = ["keep", "walls", "gate", "ballistas", "wallBlock", "wallSpikes", "cityTile", "cityGate", "wallBallista", "monsterBait"].includes(kind);
  return { topic: `building:${root}`, upgrades, motif: city ? "tesseract" : "voronoi" };
}
