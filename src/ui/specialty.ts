/** A building's upgrades as the player meets them: what a path does to the
 * kind's numbers (`kindStats`), the read-only tree Tiles shows
 * (`upgradeTreeHtml`), and the upgrades Defend offers when a placed
 * building is tapped (`upgradeChoicesHtml`). The tree comes from
 * `specializations.ts`; paths, ranks, icons and hues from `knowledge-paths.ts`. */
import type { Save } from "../save.ts";
import { BECOMES, TROOPS, buildingPathsOf, nextSteps, stepName, type UpgradeStep, type Wear } from "../specializations.ts";
import { pathById, pathTopicOf, UNSPECIALIZED, type PathId, FIRE_ARROWS, SHARP, GUNNERY, SIEGE_SHOT, CRUSADE, ASSASSIN, RANGERS, SKIRMISH, FORTIFY, PYRO, RIME, STORM, PYROCLASM, CINDERS, SPOTTERS, SIGNAL } from "../knowledge-paths.ts";
import { bonuses } from "../progression.ts";
import { ITEM_NAMES, archerDamage, archerCooldown, archerRange, cannonDamage, cannonCooldown, CANNON_RANGE, SOLDIER, ARCHER_UNIT, soldierScale, STRUCTURES, flameDps, flameRange, iceDamage, ICE_RANGE, iceChill, watchRadius, fireballDamage, fireballSplash, emberDps, emberSeconds, FIRE_MAGE, FIREBALL_RANGE, BRAWLER, SLINGER, SNIPER, MUSKETEER, type PaletteItem } from "../defend/catalog.ts";

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
    const crusade = at("crusaders"), assassin = at("assassins"), ranger = at("rangers"), skirmish = at("skirmishers");
    const scale = soldierScale(l.soldierArms);
    return `Recruits: ${n(base.hp * scale * b.troopHp * (assassin ? ASSASSIN.hp : sword ? CRUSADE.hp[crusade] : 1))} HP · ${n(base.damage * scale * b.troopDamage * (crusade >= 3 ? CRUSADE.damage : ranger >= 2 ? RANGERS.damage : 1))} damage · ${n(base.speed * (crusade ? CRUSADE.speed : assassin ? ASSASSIN.speed : skirmish >= 2 ? SKIRMISH.speed : 1))} speed`;
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

/** A path rank's medallion: its icon in the path's colours, its numeral beneath. */
const medal = (path: PathId, rank: number) => {
  const p = pathById(path), r = p.ranks[Math.max(0, rank - 1)];
  return `<span class="path-medal"><canvas data-path-icon="${r.icon}:${p.hue}"></canvas>${rank ? `<b>${ROMAN[rank]}</b>` : ""}</span>`;
};
/** A building's medallion: its own icon. */
const buildingMedal = (kind: string) => `<span class="path-medal base"><canvas width="32" height="32" data-icon="${kind}"></canvas></span>`;

/** What a step does, in a line. */
function stepText(s: UpgradeStep): string {
  if (s.type === "become") return `${TROOPS[s.to] ? `${TROOPS[s.to]} · ` : ""}${(STRUCTURES[s.to].description.split(". ")[0] ?? "").replace(/\.$/, "")}`;
  if (s.type === "evolve") return pathById(s.path).evolves!.text;
  const p = pathById(s.path), r = p.ranks[s.rank - 1];
  return `${r.name}: ${r.text}`;
}
/** A step's hue class (a path's colours; gold for an evolution). */
const stepHue = (s: UpgradeStep) => (s.type === "path" ? ` hue-${pathById(s.path).hue}` : s.type === "evolve" ? " hue-gold" : "");

/** Defend's upgrade buttons for one placed building of `kind` wearing
 * `wear`: each step it can take next, its Knowledge price, and whether the
 * player can pay it. Each is a button with `data-upgrade-step` (its index
 * in `nextSteps`). */
export function upgradeChoicesHtml(save: Save, kind: PaletteItem, wear?: Wear): string {
  const steps = nextSteps(kind as never, wear), free = save.settings.devMode;
  if (!steps.length) return `<p class="spec-note">This building is fully upgraded.</p>`;
  return steps.map((s, i) => {
    const can = free || save.knowledge >= s.cost;
    const icon = s.type === "path" ? medal(s.path, s.rank) : buildingMedal(s.to);
    const label = s.type === "evolve" ? `Evolve: ${stepName(s)}` : s.type === "become" ? `Become: ${stepName(s)}` : stepName(s);
    return `<button class="spec-choice${stepHue(s)} ${can ? "" : "locked"}" data-upgrade-step="${i}" ${can ? "" : `disabled aria-disabled="true"`} title="${stepText(s)}">
      ${icon}<span class="spec-text"><b>${label}</b><small>${stepText(s)}</small><small class="spec-cost">${free ? "Free" : `${s.cost.toLocaleString("en")} Knowledge`}</small></span></button>`;
  }).join("");
}

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
