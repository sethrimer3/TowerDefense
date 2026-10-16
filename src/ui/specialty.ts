/** A building's upgrades as the player meets them: what a path does to the
 * kind's numbers (`kindStats`), the read-only tree Tiles shows
 * (`upgradeTreeHtml`), and the living tree Defend shows when a placed
 * building is tapped (`treeGraph`, its nodes for `upgrade-graph.ts`, and
 * `treeCardHtml`, the card of the node picked in it). The tree comes from
 * `specializations.ts`; paths, ranks, icons and hues from `knowledge-paths.ts`. */
import type { Save } from "../save.ts";
import { BECOMES, TROOPS, allocated, buildingPathsOf, buildingTree, undoRefund, type TreeNode, type UpgradeStep, type Wear } from "../specializations.ts";
import type { GraphNode } from "./upgrade-graph.ts";
import { ARROW_LOOPS, BASTIONS, BOILING_OIL, KEEP_PATHS, keepRank, type KeepPathId, type KeepRanks } from "../keep-upgrades.ts";
import { STONEWORK, THORNWORK, TOWN_WALLS, WALL_PATHS, wallRank, type WallPathId, type WallRanks } from "../wall-upgrades.ts";
import { pathById, pathTopicOf, UNSPECIALIZED, type PathId, FIRE_ARROWS, SHARP, GUNNERY, SIEGE_SHOT, CRUSADE, BLOODLETTERS, SHADOWCLOAK, VENOM, HEADHUNT, RANGERS, SKIRMISH, FORTIFY, PYRO, RIME, STORM, PYROCLASM, CINDERS, SPOTTERS, SIGNAL } from "../knowledge-paths.ts";
import { bonuses } from "../progression.ts";
import { ITEM_NAMES, archerDamage, archerCooldown, archerRange, cannonDamage, cannonCooldown, CANNON_RANGE, SOLDIER, ARCHER_UNIT, soldierScale, STRUCTURES, flameDps, flameRange, iceDamage, ICE_RANGE, iceChill, watchRadius, fireballDamage, fireballSplash, emberDps, emberSeconds, FIRE_MAGE, FIREBALL_RANGE, keepHp, BRAWLER, ASSASSIN_UNIT, SLINGER, SNIPER, MUSKETEER, WALL_BLOCK_DESCRIPTION, wallHp, type PaletteItem } from "../defend/catalog.ts";

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
    const crusade = at("crusaders"), ranger = at("rangers"), skirmish = at("skirmishers");
    const scale = soldierScale(l.soldierArms);
    return `Recruits: ${n(base.hp * scale * b.troopHp * (sword ? CRUSADE.hp[crusade] : 1))} HP · ${n(base.damage * scale * b.troopDamage * (crusade >= 3 ? CRUSADE.damage : ranger >= 2 ? RANGERS.damage : 1))} damage · ${n(base.speed * (crusade ? CRUSADE.speed : skirmish >= 2 ? SKIRMISH.speed : 1))} speed`;
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
  if (kind === "meleeGuild" || kind === "rangedGuild" || kind === "sniperLodge" || kind === "musketHall") {
    const u = kind === "meleeGuild" ? BRAWLER : kind === "rangedGuild" ? SLINGER : kind === "sniperLodge" ? SNIPER : MUSKETEER, scale = soldierScale(l.soldierArms);
    const range = "range" in u ? ` · ${u.range} range` : "";
    return `Recruits: ${n(u.hp * scale * b.troopHp)} HP · ${n(u.damage * scale * b.troopDamage)} damage every ${u.cooldown}s${range}${kind === "musketHall" ? ` · bursts ${MUSKETEER.blast} cells wide` : ""}`;
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
    return { id: n.id, parent: n.parent, state: n.state, face, tag: n.state === "owned" ? undefined : knowledgeTag(n.cost), hue, side: n.side, hidden: n.hidden, closed: n.closed };
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

// ── Trees climbed side by side: the keep's and the walls' ────────────────
/** A tree whose branches climb side by side from one root (`keep-upgrades.ts`,
 * `wall-upgrades.ts`), as the graph and the card show it. */
type SideTree<Id extends string> = { root: string; icon: string; paths: { id: Id; name: string; motto: string; hue: string; ranks: { name: string; icon: string; cost: number; text: string }[] }[] };
type Ranks<Id extends string> = Partial<Record<Id, number>> | undefined;
const sideRank = <Id extends string>(ranks: Ranks<Id>, id: Id) => ranks?.[id] ?? 0;

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
    return `<div class="ug-card-head"><b>${name}</b></div><p>${about} Its branches climb side by side: buy a rank of any of them.</p><p class="ug-stats">${stats(ranks)}</p><div class="ug-card-foot" data-ug-ignore><b class="ug-owned">${tree.root === "k:keep" ? "This building" : "Every wall you place"}</b>${sideBeyond(tree, ranks, id) ? AGAIN_SELL : ""}</div>`;
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

const KEEP_TREE: SideTree<KeepPathId> = { root: "k:keep", icon: "keep", paths: KEEP_PATHS };
const WALL_TREE: SideTree<WallPathId> = { root: "k:wallBlock", icon: "wallBlock", paths: WALL_PATHS };

/** The keep's tree as the graph draws it. */
export const keepGraph = (ranks: KeepRanks | undefined) => sideGraph(KEEP_TREE, ranks);
/** What node `id` of the keep's tree buys, if it can be bought now. */
export const keepStep = (ranks: KeepRanks | undefined, id: string) => sideStep(KEEP_TREE, ranks, id);
/** What undoing node `id` of the keep's tree takes back, if it is owned. */
export const keepUndo = (ranks: KeepRanks | undefined, id: string) => sideUndo(KEEP_TREE, ranks, id);
/** What a second tap on owned node `id` of the keep's tree sells. */
export const keepBeyond = (ranks: KeepRanks | undefined, id: string) => sideBeyond(KEEP_TREE, ranks, id);

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
/** What undoing node `id` of the walls' tree takes back, if it is owned. */
export const wallUndo = (ranks: WallRanks | undefined, id: string) => sideUndo(WALL_TREE, ranks, id);
/** What a second tap on owned node `id` of the walls' tree sells. */
export const wallBeyond = (ranks: WallRanks | undefined, id: string) => sideBeyond(WALL_TREE, ranks, id);

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

/** Tiles' read-only list of the walls' branches. */
export function wallTreeHtml(): string {
  const rows = WALL_PATHS.map((p) => `<li class="spec-row hue-${p.hue}"><span class="path-medal"><canvas data-path-icon="${p.ranks[0].icon}:${p.hue}"></canvas></span><div><b>${p.name}</b><small>${p.motto}: ${p.ranks.map((r, i) => `${ROMAN[i + 1]} ${r.name} (${r.cost.toLocaleString("en")})`).join(" · ")}</small></div></li>`).join("");
  return `<div class="tile-specialties"><small>UPGRADES · KNOWLEDGE, SHARED BY EVERY WALL: PRESS AND HOLD ONE IN DEFEND WHILE BUILDING</small><ul>${rows}</ul></div>`;
}
