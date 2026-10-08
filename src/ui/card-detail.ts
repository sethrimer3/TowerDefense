import type { Save } from "../save.ts";
import { cardLabel, cardTopic, type OwnedCard } from "../cards.ts";
import { pathsOf, pathById, pathState, FIRE_ARROWS, SHARP, GUNNERY, SIEGE_SHOT, CRUSADE, ASSASSIN, RANGERS, SKIRMISH, FORTIFY } from "../knowledge-paths.ts";
import { bonuses, TRAINING, trainingRank } from "../progression.ts";
import { archerDamage, archerCooldown, archerRange, cannonDamage, cannonCooldown, CANNON_RANGE, SOLDIER, ARCHER_UNIT, soldierScale, STRUCTURES, type PaletteItem } from "../defend/catalog.ts";
import { tileTopic } from "../tiles.ts";

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
  if (c.kind === "monsterBait") return `${STRUCTURES.monsterBait.maxHp * FORTIFY.hp[at("fortified")]} HP`;
  if (c.kind in STRUCTURES) return `${STRUCTURES[c.kind as keyof typeof STRUCTURES].maxHp} building HP`;
  return "Uses the shared city upgrades.";
}

/** One card's setup, shared between Tiles and Study. Global research is explicitly
 * labelled; equipping an unlocked rank never spends currency or starts a timer. */
export function cardDetailHtml(save: Save, c: OwnedCard, study = false) {
  const topic = cardTopic(c), paths = topic ? pathsOf(topic) : [];
  const equipped = c.path ? pathById(c.path) : undefined;
  const selected = (path: string, rank: number) => c.path === path && c.rank === rank;
  const options = paths.map(p => {
    const st = pathState(save, p.id);
    return `<div class="card-path-option hue-${p.hue}"><b>${p.name}</b><small>${p.motto}</small><div class="card-ranks">${p.ranks.map((r, i) =>
      `<button data-equip-card="${c.id}" data-equip-path="${p.id}" data-equip-rank="${i + 1}" aria-pressed="${selected(p.id, i + 1)}" ${i >= st.rank || c.evolved ? "disabled" : ""} title="${r.text}">${["I", "II", "III"][i]}<small>${i < st.rank ? "Equip free" : "Research first"}</small></button>`).join("")}</div></div>`;
  }).join("");
  const crown = equipped?.evolves, unlocked = equipped && save.pathResearch[equipped.id]?.crowned;
  const t = tileTopic(c.kind).topic;
  const training = TRAINING.filter(r => r.group === (paths.some(p => ["barracks", "archerBarracks", "mageGuild"].includes(p.topic)) ? "army" : "towers"))
    .filter(r => !["bombDamage"].includes(r.id)).map(r => `${r.name} +${r.per * trainingRank(save, r.id)}%`).join(" · ");
  const next = equipped ? pathState(save, equipped.id).next : undefined;
  return `<section class="individual-card-detail" data-card-detail="${c.id}" aria-label="Card ${c.id} specialization">
    <header><div><small>INDIVIDUAL CARD #${c.id} · ${c.placement ? "IN THE CITY" : "READY"}</small><h3>${cardLabel(c)}</h3></div></header>
    <p class="card-effective">${cardStats(save, c)}</p>
    ${equipped && !c.evolved ? `<p>${equipped.ranks[(c.rank ?? 1) - 1].text}.</p>` : ""}
    ${c.evolved ? `<p>This card is evolved. Your other cards keep their own builds.</p>` : paths.length ? `<p class="ledger-note">Equip one path on this card. Switching is free; an active defense keeps its starting setup.</p><button data-equip-card="${c.id}" aria-pressed="${!c.path}">Unspecialized</button><div class="card-path-options">${options}</div>` : ""}
    ${crown && !c.evolved ? `<button data-evolve-card="${c.id}" ${unlocked && c.rank === equipped!.ranks.length ? "" : "disabled"}>Evolve this card<small>${unlocked ? "Free · returns this card to the palette" : "Research the crown first"}</small></button>` : ""}
    ${next ? `<p class="ledger-note">Next unlock: ${next.name} · ${next.cost} Knowledge. Research once, then equip on any card.</p>` : ""}
    <p class="card-global">SHARED SMITHY BONUSES · ${training}<small>Type-specific equipment also applies to every ${t.name} card.</small></p>
    <div class="tile-actions"><button data-card-go="smithy" data-card-topic="${t.id}">Smithy<small>Upgrades all cards of this type</small></button>${!study && topic ? `<button data-card-go="study" data-card-topic="${topic}" data-focus-card="${c.id}">Study<small>Research and specialize this card</small></button>` : ""}</div>
  </section>`;
}
