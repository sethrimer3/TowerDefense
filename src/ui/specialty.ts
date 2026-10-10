/** A building kind's Knowledge paths as the player meets them: what each
 * does to the kind's numbers (`kindStats`), the read-only list Tiles shows
 * (`specialtyListHtml`), and the choice Defend offers when a building is
 * placed or tapped (`specialtyChoicesHtml`). Paths, ranks, icons and hues
 * all come from the catalog in `knowledge-paths.ts`. */
import type { Save } from "../save.ts";
import { specialties, type Specialty } from "../specializations.ts";
import { pathTopicOf, UNSPECIALIZED, type PathId, type PathResearch, FIRE_ARROWS, SHARP, GUNNERY, SIEGE_SHOT, CRUSADE, ASSASSIN, RANGERS, SKIRMISH, FORTIFY, PYRO, RIME, STORM, PYROCLASM, CINDERS, SPOTTERS, SIGNAL } from "../knowledge-paths.ts";
import { bonuses } from "../progression.ts";
import { archerDamage, archerCooldown, archerRange, cannonDamage, cannonCooldown, CANNON_RANGE, SOLDIER, ARCHER_UNIT, soldierScale, STRUCTURES, flameDps, flameRange, iceDamage, ICE_RANGE, iceChill, watchRadius, fireballDamage, fireballSplash, emberDps, emberSeconds, FIRE_MAGE, FIREBALL_RANGE, type PaletteItem } from "../defend/catalog.ts";

/** `kind`'s effective numbers wearing `path` at its researched rank (none:
 * unspecialized), with the shared Smithy and skill bonuses. */
export function kindStats(save: Save, kind: PaletteItem, path?: PathId): string {
  const l = save.defend.levels, b = bonuses(save), rank = path ? save.pathResearch[path]?.rank ?? 0 : 0;
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
  if (kind === "monsterBait") return `${STRUCTURES.monsterBait.maxHp * FORTIFY.hp[at("fortified")]} HP`;
  if (kind in STRUCTURES) return `${STRUCTURES[kind as keyof typeof STRUCTURES].maxHp} building HP`;
  return "Uses the shared city upgrades.";
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];

/** One choice's medallion: the worn rank's icon (or the first rank's, dim,
 * while still to research) in the path's colours, its numeral beneath. */
const medal = (s: Specialty) => {
  const r = s.path.ranks[Math.max(0, s.rank - 1)];
  return `<span class="path-medal"><canvas data-path-icon="${r.icon}:${s.path.hue}"></canvas>${s.rank ? `<b>${ROMAN[s.rank]}</b>` : ""}</span>`;
};

/** Tiles' read-only preview of `kind`'s paths: each one researched so far
 * at its rank, with what it does to the numbers, the rest still to research
 * in the Study. Empty for a kind without paths. */
export function specialtyListHtml(save: Save, kind: PaletteItem): string {
  const list = specialties(save.pathResearch, kind);
  if (!list.length) return "";
  const rows = list.map((s) => {
    const r = s.path.ranks[s.rank - 1];
    return `<li class="spec-row hue-${s.path.hue} ${s.rank ? "" : "locked"}">${medal(s)}<div><b>${s.path.name}${s.rank ? ` ${ROMAN[s.rank]}` : ""}</b>
      <small>${s.rank ? `${r.name}: ${r.text}` : `${s.path.motto} · research it in the Study`}</small>${s.rank ? `<small class="spec-stats">${kindStats(save, kind, s.path.id)}</small>` : ""}</div></li>`;
  }).join("");
  return `<div class="tile-specialties"><small>SPECIALIZATIONS · CHOSEN AS YOU PLACE EACH ONE IN DEFEND</small>
    <ul><li class="spec-row base"><span class="path-medal base"><canvas width="32" height="32" data-icon="${kind}"></canvas></span><div><b>Unspecialized</b><small>${UNSPECIALIZED[pathTopicOf(kind)!]}</small><small class="spec-stats">${kindStats(save, kind)}</small></div></li>${rows}</ul></div>`;
}

/** Defend's choice for one placed building: unspecialized, then each of
 * its kind's paths at its researched rank, colours and icon from the
 * catalog. Paths still to research show dimmed and can't be chosen.
 * `current` is the path worn now (pressed). Each choice is a button with
 * `data-specialty` (the path id, or "" for none). */
export function specialtyChoicesHtml(research: PathResearch, kind: string, current?: PathId): string {
  const topic = pathTopicOf(kind);
  if (!topic) return "";
  const base = `<button class="spec-choice base" data-specialty="" aria-pressed="${!current}">
      <span class="path-medal base"><canvas width="32" height="32" data-icon="${kind}"></canvas></span>
      <span class="spec-text"><b>Unspecialized</b><small>${UNSPECIALIZED[topic]}</small></span></button>`;
  return base + specialties(research, kind).map((s) => {
    const on = current === s.path.id, r = s.path.ranks[s.rank - 1];
    return `<button class="spec-choice hue-${s.path.hue} ${s.rank ? "" : "locked"}" data-specialty="${s.path.id}" aria-pressed="${on}" ${s.rank ? "" : `disabled aria-disabled="true"`}
        title="${s.rank ? `${r.name}: ${r.text}` : "Research it in the Study to choose it"}">
      ${medal(s)}<span class="spec-text"><b>${s.path.name}${s.rank ? ` ${ROMAN[s.rank]}` : ""}</b><small>${s.rank ? s.path.motto : `Locked · research in the Study`}</small></span></button>`;
  }).join("");
}
