import type { Save } from "../save.ts";
import { cardLabel, cardTopic, type OwnedCard } from "../cards.ts";
import { cardBadge, cardLook } from "./card-badge.ts";
import { pathsOf, pathById, pathState, type KnowledgePath, FIRE_ARROWS, SHARP, GUNNERY, SIEGE_SHOT, CRUSADE, ASSASSIN, RANGERS, SKIRMISH, FORTIFY, PYRO, RIME, STORM, PYROCLASM, CINDERS, SPOTTERS, SIGNAL } from "../knowledge-paths.ts";
import { bonuses, TRAINING, trainingRank } from "../progression.ts";
import { archerDamage, archerCooldown, archerRange, cannonDamage, cannonCooldown, CANNON_RANGE, SOLDIER, ARCHER_UNIT, soldierScale, STRUCTURES, flameDps, flameRange, iceDamage, ICE_RANGE, iceChill, watchRadius, fireballDamage, fireballSplash, emberDps, emberSeconds, FIRE_MAGE, FIREBALL_RANGE, UPGRADES } from "../defend/catalog.ts";
import { SUBJECTS } from "../upgrade-subjects.ts";
import { TILE_TYPE, tileTopic } from "../tiles.ts";

/** Effective values include the selected card's path and current shared upgrades. */
export function cardStats(save: Save, c: OwnedCard): string {
  const l = save.defend.levels, b = bonuses(save), rank = c.rank ?? 0;
  const at = (id: string) => c.path === id && !c.evolved ? rank : 0;
  const n = (v: number) => Number(v.toFixed(2));
  if (c.kind === "archerTower") {
    const sharp = at("sharpshooters"), fire = at("fireArrows");
    const damage = archerDamage(l.archerDamage) * b.towerDamage * (sharp >= 3 ? SHARP.damage : 1);
    return `${n(damage)} damage · ${n(archerCooldown(l.archerRate) * b.towerReload)}s reload · ${n(archerRange(l.archerRange) + (sharp ? SHARP.range : 0))} range${fire ? ` · ${FIRE_ARROWS.burn[fire]}s burn` : ""}${fire >= 3 ? " · 3 arrows" : ""}${sharp >= 2 ? " · every third arrow 3x damage" : ""}`;
  }
  if (c.kind === "cannonTower") {
    const gun = at("gunnery"), siege = at("siegeShot");
    return `${n(cannonDamage(l.cannonDamage) * b.towerDamage * SIEGE_SHOT.damage[siege])} damage · ${n(cannonCooldown(l.cannonRate) * b.towerReload * GUNNERY.reload[gun] * (siege ? SIEGE_SHOT.reload : 1))}s reload · ${CANNON_RANGE + (siege >= 3 ? SIEGE_SHOT.range : 0)} range${gun >= 2 ? " · 4 extra blasts" : ""}`;
  }
  if (c.kind === "barracks" || c.kind === "archerBarracks") {
    const sword = c.kind === "barracks", base = sword ? SOLDIER : ARCHER_UNIT;
    const crusade = at("crusaders"), assassin = at("assassins"), ranger = at("rangers"), skirmish = at("skirmishers");
    const scale = soldierScale(l.soldierArms);
    return `Recruits: ${n(base.hp * scale * b.troopHp * (assassin ? ASSASSIN.hp : sword ? CRUSADE.hp[crusade] : 1))} HP · ${n(base.damage * scale * b.troopDamage * (crusade >= 3 ? CRUSADE.damage : ranger >= 2 ? RANGERS.damage : 1))} damage · ${n(base.speed * (crusade ? CRUSADE.speed : assassin ? ASSASSIN.speed : skirmish >= 2 ? SKIRMISH.speed : 1))} speed`;
  }
  if (c.kind === "wizardTower") {
    const pyro = at("pyromancy"), rime = at("rime"), storm = at("storm");
    if (storm) return `${n(flameDps(l.wizardFlame) * b.towerDamage * STORM.damage * (storm >= 3 ? STORM.surge : 1))} bolt damage · ${STORM.links[storm]} targets · ${n(flameRange(l.wizardFlame))} bolt range · alternating with ice`;
    const fire = `${n(flameDps(l.wizardFlame) * b.towerDamage * PYRO.damage[pyro])} fire damage/s · ${n(flameRange(l.wizardFlame) + (pyro >= 2 ? PYRO.reach : 0))} fire range`;
    const ice = `${n(iceDamage(l.wizardIce) * b.towerDamage * (rime >= 2 ? RIME.damage : 1))} ice damage · ${ICE_RANGE + (rime >= 2 ? RIME.reach : 0)} ice range · ${n(iceChill(l.wizardIce) * (rime ? RIME.chill : 1))}s chill`;
    return rime ? ice : pyro ? fire : `${fire} · ${ice}`;
  }
  if (c.kind === "watchTower") {
    const spot = at("spotters"), signal = at("signalFires");
    return `${watchRadius(l.watchRadius) + (spot >= 2 ? SPOTTERS.radius : 0) + (signal >= 2 ? SIGNAL.radius : 0)} marking range · ${SPOTTERS.mark[spot]}x marked damage${signal ? ` · enemies move at ${SIGNAL.slow[signal] * 100}% speed` : ""}`;
  }
  if (c.kind === "mageGuild") {
    const pyro = at("pyroclasm"), cinders = at("cinders");
    return `Recruits: ${n(FIRE_MAGE.hp * soldierScale(l.soldierArms) * b.troopHp)} HP · ${n(fireballDamage(l.mageFireball) * soldierScale(l.soldierArms) * b.troopDamage * (pyro ? PYROCLASM.damage : 1))} fireball damage · ${n(fireballSplash(l.mageFireball) * (pyro >= 2 ? PYROCLASM.splash : 1))} blast radius · ${n(emberDps(l.mageEmbers) * b.troopDamage * (cinders >= 2 ? CINDERS.dps : 1))} ground damage/s · ${n(emberSeconds(l.mageEmbers) * (cinders ? CINDERS.life : 1))}s burning ground`;
  }
  if (c.kind === "monsterBait") return `${STRUCTURES.monsterBait.maxHp * FORTIFY.hp[at("fortified")]} HP`;
  if (c.kind in STRUCTURES) return `${STRUCTURES[c.kind as keyof typeof STRUCTURES].maxHp} building HP`;
  return "Uses the shared city upgrades.";
}

/** The card whose circle last unfolded: it unfolds again only for another card. */
let unfolded = -1;

/** The paths as a magic circle: the card at its heart, each path a medallion
 * spaced evenly round the ring, the equipped one lit along its spoke. A path
 * is equipped at its furthest researched rank; unresearched ones stay dark.
 * The sigil draws itself and the medallions fan out the first time a card
 * shows. */
function specialtyCircle(save: Save, c: OwnedCard, paths: KnowledgePath[]) {
  const n = paths.length, start = n === 2 ? 180 : -90, R = 37;
  const unfold = unfolded !== c.id;
  unfolded = c.id;
  const at = (i: number, r: number) => {
    const a = ((start + (360 * i) / n) * Math.PI) / 180;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  };
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i * 10 * Math.PI) / 180, r0 = i % 3 ? 88 : 85;
    return `<line pathLength="1" x1="${(Math.cos(a) * r0).toFixed(1)}" y1="${(Math.sin(a) * r0).toFixed(1)}" x2="${(Math.cos(a) * 92).toFixed(1)}" y2="${(Math.sin(a) * 92).toFixed(1)}" />`;
  }).join("");
  const points = paths.map((_, i) => at(i, 74));
  const polygon = n > 2 ? `<polygon pathLength="1" class="spec-star" points="${points.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")}" />` : "";
  // A second figure turned half a step, so three paths make a hexagram.
  const turned = n > 2 ? `<polygon pathLength="1" class="spec-star faint" points="${paths.map((_, i) => at(i + 0.5, 74)).map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")}" />` : "";
  const spokes = paths.map((p, i) => {
    const q = at(i, 74), on = c.path === p.id;
    return `<line pathLength="1" class="spec-spoke hue-${p.hue} ${on ? "lit" : ""}" x1="0" y1="0" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" />`;
  }).join("");
  const nodes = paths.map((p, i) => {
    const st = pathState(save, p.id), rank = st.rank, on = c.path === p.id;
    const r = p.ranks[Math.max(0, rank - 1)], q = at(i, R);
    const label = rank ? `${p.name} ${ROMAN[rank]}` : p.name;
    const state = on ? "Equipped" : rank ? `${r.name} · Equip free` : "Research first";
    return `<button class="spec-node hue-${p.hue} ${on ? "on" : ""} ${rank ? "" : "locked"}" style="--x:${q.x.toFixed(2)}%;--y:${q.y.toFixed(2)}%;--i:${i}"
      data-equip-card="${c.id}" data-equip-path="${p.id}" aria-pressed="${on}" ${rank ? "" : "disabled"} title="${rank ? `${r.name}: ${r.text}` : p.motto}">
      <span class="path-medal"><canvas data-path-icon="${r.icon}:${p.hue}"></canvas>${rank ? `<b>${ROMAN[rank]}</b>` : ""}</span>
      <span class="spec-name">${label}</span><small>${state}</small></button>`;
  }).join("");
  return `<div class="spec-circle ${unfold ? "unfold" : ""}" style="--paths:${n}" role="group" aria-label="Specialty paths">
    <svg class="spec-sigil" viewBox="-100 -100 200 200" aria-hidden="true">
      <circle pathLength="1" class="spec-ring" r="94" /><circle pathLength="1" class="spec-ring faint" r="83" />
      <g class="spec-ticks">${ticks}</g>
      ${turned}${polygon}
      <circle pathLength="1" class="spec-ring faint" r="26" />
      ${spokes}
    </svg>
    <button class="spec-center" data-equip-card="${c.id}" aria-pressed="${!c.path}" title="Wear no path">
      <canvas width="48" height="48" data-icon="${c.kind}"${cardLook(c)}></canvas><small>${c.path ? "Unspecialize" : "Unspecialized"}</small></button>
    ${nodes}
  </div>`;
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];

/** One card's setup, shared between Tiles and Study. Global research is explicitly
 * labelled; equipping an unlocked rank never spends currency or starts a timer. */
export function cardDetailHtml(save: Save, c: OwnedCard, study = false) {
  const topic = cardTopic(c), paths = topic ? pathsOf(topic) : [];
  const equipped = c.path ? pathById(c.path) : undefined;
  const crown = equipped?.evolves, unlocked = equipped && save.pathResearch[equipped.id]?.crowned;
  const t = tileTopic(c.kind).topic;
  const type = TILE_TYPE[c.kind];
  const rows = TRAINING.filter(r => type === "units" ? r.group === "army" : type === "towers" ? r.group === "towers" && r.id !== "bombDamage" : (t.training ?? []).includes(r.id));
  const training = rows.map(r => `${r.name} +${r.per * trainingRank(save, r.id)}%`).join(" · ");
  const equipment = [...(t.upgrades ?? []), ...(type === "units" ? SUBJECTS[0].topics[0].upgrades ?? [] : [])]
    .map(id => { const u = UPGRADES.find(u => u.id === id)!; return `<li>${u.name}: ${u.describe(save.defend.levels[id])}</li>`; }).join("");
  const next = equipped ? pathState(save, equipped.id).next : undefined;
  return `<section class="individual-card-detail" data-card-detail="${c.id}" aria-label="Card ${c.id} specialization">
    <header><div><small>INDIVIDUAL CARD #${c.id} · ${c.placement ? "IN THE CITY" : "READY"}</small><h3>${cardBadge(c)}${cardLabel(c)}</h3></div></header>
    <p class="card-effective">${cardStats(save, c)}</p>
    ${equipped && !c.evolved ? `<p>${equipped.ranks[(c.rank ?? 1) - 1].text}.</p>` : ""}
    ${c.evolved ? `<p>This card is evolved. Your other cards keep their own builds.</p><button data-unevolve-card="${c.id}">Return to base card<small>Free · returns this card to the palette</small></button>` : paths.length ? `<p class="ledger-note">Choose one path for this card. It always wears the path's furthest researched rank. Switching is free; an active defense keeps its starting setup.</p>${specialtyCircle(save, c, paths)}` : ""}
    ${crown && !c.evolved ? `<button data-evolve-card="${c.id}" ${unlocked && c.rank === equipped!.ranks.length ? "" : "disabled"}>Evolve this card<small>${unlocked ? "Free · returns this card to the palette" : "Research the crown first"}</small></button>` : ""}
    ${next ? `<p class="ledger-note">Next unlock: ${next.name} · ${next.cost} Knowledge. Research once, then equip on any card.</p>` : ""}
    <div class="card-global"><small>SHARED SMITHY BONUSES</small><p>${training || "Uses its type equipment"}</p>${equipment ? `<details><summary>Equipment on all ${t.name} cards</summary><ul>${equipment}</ul></details>` : ""}</div>
    <div class="tile-actions"><button data-card-go="smithy" data-card-topic="${t.id}">Smithy<small>Upgrades all cards of this type</small></button>${!study && topic ? `<button data-card-go="study" data-card-topic="${topic}" data-focus-card="${c.id}">Study<small>Research and specialize this card</small></button>` : ""}</div>
  </section>`;
}
