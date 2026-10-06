import { play } from "../sound.ts";
import { TRAINING, addSmith, busySmiths, whole, buySkill, cancelTraining, removeSmith, skillPurchase, skillRank, startTraining, trainingLeft, trainingStep, type TrainingId } from "../progression.ts";
import { BARS_PER_POINT, METALS } from "../mine/sim.ts";
import { SKILLS, TREES, type SkillId } from "../skill-trees.ts";
import { crownBought, crownedFrom, evolve, evolvedBy, learnPath, pathById, pathState, pathsOf, unlearnPath, type KnowledgePath, type PathId, type PathTopic } from "../knowledge-paths.ts";
import { paintPathIcon } from "./path-icons.ts";
import { TrainingParticles } from "../training-particles.ts";
import { trainingSeconds } from "../training-jobs.ts";
import {
  BALLISTA_DESCRIPTION, BOMB_GOLD, ITEM_NAMES, BOMB_RADIUS, GATE_DESCRIPTION, SPEED3_PRICE, SPIKES_DESCRIPTION, STRUCTURES, UPGRADES,
  footprint, purchasePrice, shareName, upgradePrice, type PaletteItem, type Price, type UpgradeId,
} from "../defend/catalog.ts";

import { available, buyBomb, buyItem, buySpeed3, buyUpgrade, canAfford, type Wallet } from "../defend/progress.ts";
import { paintIcon, type IconItem } from "../defend/structure-art.ts";
import { SUBJECTS, topicItems, type Extra, type Subject, type SubjectId, type Topic } from "../upgrade-subjects.ts";
import { replay, sparksOver } from "./flourish.ts";
import type { AppContext } from "./app.ts";
import { el, uiSprite } from "./dom.ts";

/** Hours, minutes and seconds left, as the timers show them. */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const TREE_OF = Object.fromEntries(TREES.flatMap((t) => t.nodes.map((n) => [n.id, t]))) as Record<SkillId, (typeof TREES)[number]>;

/** The Upgrades page: one ledger for every upgrade in the game, by subject
 * (Realm, City, Towers, Units, Mine, Library) and within it by topic (one
 * tower, one unit building…). Each topic has a Forge, its permanent
 * numbers (copies of the building, the Armory's levels, the Smithy's rows
 * worked by the mine's smiths), and a Study, what Knowledge buys there and
 * its paths, drawn as a tree. */
export class UpgradesPage {
  private subject: SubjectId = "realm";
  private topics: Partial<Record<SubjectId, string>> = {};
  private trainingParticles = new TrainingParticles();
  /** The rank picked in each topic's path tree ("path:index", or "path:crown"). */
  private picked: Record<string, string> = {};
  /** The subject and topic last drawn. */
  private shown = "";

  constructor(private ctx: AppContext) {}

  private get save() {
    return this.ctx.save();
  }

  private current(): Subject {
    return SUBJECTS.find((s) => s.id === this.subject)!;
  }
  private topic(): Topic {
    const s = this.current();
    return s.topics.find((t) => t.id === this.topics[s.id]) ?? s.topics[0];
  }

  render() {
    const subject = this.current(), topic = this.topic();
    // Redrawn in place (a purchase, a tapped rank): keep where each part was scrolled to.
    const same = this.shown === `${subject.id}:${topic.id}`;
    const scrolls = SCROLLERS.map((sel) => (same ? (el("upgrades").querySelector(sel)?.scrollTop ?? 0) : 0));
    this.shown = `${subject.id}:${topic.id}`;
    const subjects = SUBJECTS.map((s) => `<button data-subject="${s.id}" aria-pressed="${s.id === subject.id}"><span>${uiSprite(s.sprite)}</span>${s.name}</button>`).join("");
    const topics = subject.topics.length > 1
      ? `<div class="ledger-topics" role="group" aria-label="${subject.name}">${subject.topics.map((t) => `<button data-topic="${t.id}" aria-pressed="${t.id === topic.id}">${t.item ? `<canvas width="22" height="22" data-icon="${t.item}"></canvas>` : ""}${t.name}</button>`).join("")}</div>`
      : "";
    el("upgrades").innerHTML = `<div class="tree-tabs ledger-subjects" role="group" aria-label="Subjects">${subjects}</div>${topics}
      <div class="ledger-body">
        <section class="ledger-half ledger-forge" aria-label="Forge"><canvas class="training-particles" aria-hidden="true"></canvas>
          <header class="ledger-heading"><h3>Forge</h3><small>Permanent: more of it, and stronger</small></header>${this.forgeHtml(topic)}</section>
        <section class="ledger-half ledger-study" aria-label="Study">
          <header class="ledger-heading"><h3>Study</h3><small>Knowledge: change how it works</small></header>${this.studyHtml(topic)}</section>
      </div>`;
    const root = el("upgrades");
    SCROLLERS.forEach((sel, i) => {
      const box = root.querySelector(sel);
      if (box) box.scrollTop = scrolls[i];
    });
    root.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as IconItem));
    root.querySelectorAll<HTMLCanvasElement>("canvas[data-path-icon]").forEach((c) => {
      const [icon, hue] = c.dataset.pathIcon!.split(":");
      paintPathIcon(c, icon as never, hue as never);
    });
    root.querySelectorAll<HTMLButtonElement>("[data-subject]").forEach((b) => (b.onclick = () => {
      this.subject = b.dataset.subject as SubjectId;
      this.render();
    }));
    root.querySelectorAll<HTMLButtonElement>("[data-topic]").forEach((b) => (b.onclick = () => {
      this.topics[this.subject] = b.dataset.topic;
      this.render();
    }));
    this.bindForge(root);
    root.querySelectorAll<HTMLButtonElement>("[data-learn]").forEach((b) => (b.onclick = () => this.learn(b.dataset.learn as SkillId)));
    root.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((b) => (b.onclick = () => {
      this.picked[topic.id] = b.dataset.pick!;
      this.render();
    }));
    root.querySelectorAll<HTMLButtonElement>("[data-learn-path]").forEach((b) => (b.onclick = () => this.learnPath(b.dataset.learnPath as PathId)));
    root.querySelectorAll<HTMLButtonElement>("[data-evolve]").forEach((b) => (b.onclick = () => this.evolve(b.dataset.evolve as PathId)));
    root.querySelectorAll<HTMLButtonElement>("[data-unlearn]").forEach((b) => (b.onclick = () => this.unlearn(b.dataset.unlearn as PathTopic)));
    root.querySelectorAll<HTMLButtonElement>("[data-goto]").forEach((b) => (b.onclick = () => this.ctx.navigate(b.dataset.goto as "mine" | "library")));
  }

  // ── Forge ───────────────────────────────────────────────────────────────
  /** The Forge's wallet: the mine's copper, silver and gold. */
  private wallet(): Wallet {
    const s = this.save;
    return { ...s.smithy, free: s.settings.devMode };
  }

  private forgeHtml(t: Topic) {
    const s = this.save, d = s.defend, w = this.wallet();
    const copies = topicItems(t).map((base) => {
      // Crowned, the building's copies are its greater building, bought here.
      const crown = crownedFrom(s, base)?.evolves, item = crown?.item ?? base;
      const p = purchasePrice(item, d.owned[item]), grown = evolvedBy(item);
      const buy = grown && !crown
        ? `<em class="ledger-evolves">${crownedFrom(s, grown.evolves!.from) ? `Bought in the ${ITEM_NAMES[grown.evolves!.from]}'s Forge while crowned.` : `Not sold: ${grown.name}'s crown turns every ${ITEM_NAMES[grown.evolves!.from]} into one.`}</em>`
        : `<button data-buy="${item}" ${canAfford(w, p) ? "" : "disabled"}>Buy one<small>${priceText(p)}</small></button>`;
      const note = crown ? `<b class="ledger-next">Crowned: the ${ITEM_NAMES[base]} is now a ${crown.name}.</b>` : "";
      return `<article class="card defend-card ledger-card"><canvas width="44" height="44" data-icon="${item}"></canvas><div><small>OWNED ${d.owned[item]} · ${available(d, item)} TO PLACE</small><h3>${ITEM_NAMES[item]}</h3><p>${this.itemText(item)}${note}</p></div>
        ${buy}</article>`;
    });
    const extras = (t.extras ?? []).map((x) => this.extraHtml(x, w));
    const levels = (t.upgrades ?? []).map((id) => {
      const u = UPGRADES.find((u) => u.id === id)!, lvl = d.levels[id], maxed = lvl >= u.maxLevel;
      const p = u.price ? u.price(lvl) : upgradePrice(lvl);
      return `<article class="card defend-card ledger-card ledger-level"><div><small>LEVEL ${lvl} / ${u.maxLevel}</small><h3>${u.name}</h3><p>${u.describe(lvl)}${maxed ? "" : `<b class="ledger-next">Next: ${u.describe(lvl + 1)}</b>`}</p></div>
        <button data-upgrade="${id}" ${maxed || !canAfford(w, p) ? "disabled" : ""}>${maxed ? "Maxed" : `Upgrade<small>${priceText(p)}</small>`}</button></article>`;
    });
    const smithy = t.training?.length ? this.smithyHtml(t.training) : "";
    const elsewhere = t.elsewhere
      ? `<article class="card defend-card ledger-card"><div><small>${t.elsewhere === "mine" ? "BUILDINGS, CREW AND TRADES" : "SHELVES, STAFF AND THE LAB"}</small><h3>Raised in the ${t.name}</h3><p>${t.elsewhere === "mine" ? "Tap a building in the Mine to raise its level with Gold, and hire miners there." : "Buy shelves, hire librarians and raise the alchemy lab in the Library."}</p></div><button data-goto="${t.elsewhere}">Open the ${t.name}</button></article>`
      : "";
    const wallet = copies.length || extras.length || levels.length
      ? `<p class="ledger-note">Paid with the mine's metal: ${METALS.map((k) => `<b class="metal-${k}">${bal(s, w[k])}</b> ${k}`).join(" · ")}<small> · the smiths make a point of a metal from every ${BARS_PER_POINT} bars</small></p>`
      : "";
    const body = [wallet, ...copies, ...extras, ...levels, smithy, elsewhere].join("");
    return body || `<p class="ledger-empty">Nothing to forge here.</p>`;
  }

  private itemText(item: PaletteItem) {
    if (item === "cityTile") return "Expands the city limits. New tiles must touch the city; the wall moves out to enclose them.";
    if (item === "cityGate") return GATE_DESCRIPTION;
    if (item === "wallSpikes") return SPIKES_DESCRIPTION;
    if (item === "wallBallista") return BALLISTA_DESCRIPTION;
    const d = this.save.defend;
    return `${STRUCTURES[item].description} Takes ${shareName(footprint(item, d.layout.compact.includes(item)).size)}.`;
  }

  private extraHtml(x: Extra, w: Wallet) {
    const d = this.save.defend;
    if (x === "bomb")
      return `<article class="card defend-card ledger-card"><canvas width="44" height="44" data-icon="bomb"></canvas><div><small>OWNED ${d.bombs}</small><h3>Bomb</h3><p>Drag onto the battlefield mid-defense to blast everything within ${BOMB_RADIUS.toFixed(0)} cells, your own people too until Shaped charges.</p></div>
        <button data-buy-bomb ${this.save.settings.devMode || this.save.gold >= BOMB_GOLD ? "" : "disabled"}>Buy one<small>${BOMB_GOLD} Gold</small></button></article>`;
    return `<article class="card defend-card ledger-card"><div><small>${d.speed3 ? "UNLOCKED" : "ONE-TIME UNLOCK"}</small><h3>War drums</h3><p>Adds 3× to the battle speed button.</p></div>
      <button data-buy-speed3 ${d.speed3 || !canAfford(w, SPEED3_PRICE) ? "disabled" : ""}>${d.speed3 ? "Owned" : `Buy<small>${priceText(SPEED3_PRICE)}</small>`}</button></article>`;
  }

  private bindForge(root: HTMLElement) {
    const s = this.save, d = s.defend;
    /** A purchase rings like coins and stamps its card once the page is redrawn. */
    const commit = (buy: (w: Wallet) => boolean, card: string) => {
      const w = this.wallet();
      if (!buy(w)) return;
      if (!s.settings.devMode) for (const k of METALS) s.smithy[k] = w[k];
      this.ctx.update();
      play("coin");
      this.render();
      const bought = root.querySelector(card)?.closest(".card") ?? null;
      replay(bought, "bought");
      sparksOver(bought?.querySelector("button") ?? null, "gold");
    };
    root.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => (b.onclick = () => commit((w) => {
      const item = b.dataset.buy as PaletteItem, grown = evolvedBy(item);
      if (!buyItem(d, w, item)) return false;
      if (grown) crownBought(s, grown.evolves!.from);
      return true;
    }, `[data-buy="${b.dataset.buy}"]`)));
    root.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach((b) => (b.onclick = () => commit((w) => buyUpgrade(d, w, b.dataset.upgrade as UpgradeId), `[data-upgrade="${b.dataset.upgrade}"]`)));
    root.querySelector<HTMLButtonElement>("[data-buy-bomb]")?.addEventListener("click", () => commit(() => buyBomb(d, s.settings.devMode ? { gold: 0, free: true } : s), "[data-buy-bomb]"));
    root.querySelector<HTMLButtonElement>("[data-buy-speed3]")?.addEventListener("click", () => commit((w) => buySpeed3(d, w), "[data-buy-speed3]"));
    root.querySelectorAll<HTMLButtonElement>("[data-train]").forEach((b) => (b.onclick = () => {
      const smith = this.freeSmiths()[0];
      if ((smith || s.settings.instantResearch) && startTraining(s, b.dataset.train as TrainingId, smith ?? "")) {
        this.ctx.update();
        play("coin");
      }
      this.render();
    }));
    root.querySelectorAll<HTMLButtonElement>("[data-more]").forEach((b) => (b.onclick = () => {
      const smith = this.freeSmiths()[0];
      if (smith && addSmith(s, b.dataset.more as TrainingId, smith)) this.ctx.update();
      this.render();
    }));
    root.querySelectorAll<HTMLButtonElement>("[data-less]").forEach((b) => (b.onclick = () => {
      const id = b.dataset.less as TrainingId;
      if (removeSmith(s, id)) this.ctx.update();
      else this.askCancel(id);
      this.render();
    }));
  }

  /** The mine's smiths with no upgrade in hand. */
  private freeSmiths() {
    const busy = busySmiths(this.save);
    return this.ctx.smiths().filter((n) => !busy.has(n));
  }

  /** Asks before taking the last smith off an upgrade: that cancels it, and
   * its point comes back. */
  private askCancel(id: TrainingId) {
    const row = TRAINING.find((t) => t.id === id)!, modal = this.ctx.modal;
    modal.innerHTML = `<small>SMITHY</small><h2>Cancel this upgrade?</h2><p>Taking the last smith off ${row.name} stops the work on it. Its Smithy point is returned, and the work done so far is lost.</p>
      <div class="dialog-actions"><button id="smithy-keep">Keep working</button><button id="smithy-cancel" class="danger">Cancel upgrade</button></div>`;
    modal.showModal();
    modal.querySelector<HTMLButtonElement>("#smithy-keep")!.onclick = () => modal.close();
    modal.querySelector<HTMLButtonElement>("#smithy-cancel")!.onclick = () => {
      modal.close();
      if (cancelTraining(this.save, id)) this.ctx.update();
      this.render();
    };
  }

  /** How long the rank in work for `id` has left, as its timer shows it. */
  private timeLeft(id: TrainingId) {
    const ms = trainingLeft(this.save, id);
    return ms === Infinity ? "Needs a smith" : formatDuration(ms);
  }

  /** The Smithy's rows for this topic: each one's percent now and after one
   * more rank, and the Smithy point it costs; tap the cost to start it with
   * a free smith, and put more smiths on (or take them off) a rank in work. */
  private smithyHtml(ids: TrainingId[]) {
    const save = this.save, smiths = this.ctx.smiths(), free = this.freeSmiths(), devFree = save.settings.instantResearch;
    const row = (t: (typeof TRAINING)[number]) => {
      const { now, next, affordable, maxed, metal } = trainingStep(save, t.id);
      const price = `1 ${metal}`;
      const job = save.trainingJobs.find((j) => j.id === t.id);
      const takes = formatDuration(trainingSeconds(save.training[t.id]) * 1000);
      const shown = (v: number) => `+${v}%`;
      const why = !affordable ? `Needs a ${metal} Smithy point` : !free.length && !devFree ? (smiths.length ? "Every smith is busy" : "Put a miner to the smithy in the Mine") : `One smith takes ${takes}`;
      const buy = job
        ? `<span class="training-work"><span class="training-box training-timer" title="Time left at this many smiths"><span data-training-timer="${t.id}">${this.timeLeft(t.id)}</span></span>
           <span class="smith-count" role="group" aria-label="Smiths on ${t.name}"><button class="smith-step" data-less="${t.id}" aria-label="One smith fewer on ${t.name}" title="${job.smiths.length <= 1 ? "Cancel this upgrade" : "One smith fewer"}">−</button><b title="${job.smiths.join(", ") || "No smith"}">⚒ ${job.smiths.length}</b><button class="smith-step" data-more="${t.id}" ${free.length ? "" : "disabled"} aria-label="One more smith on ${t.name}" title="${free.length ? "One more smith shares the work" : "No free smith"}">+</button></span></span>`
        : maxed
        ? `<button class="training-box training-cost" disabled aria-label="${t.name} is fully upgraded">Max</button>`
        : `<button class="training-box training-cost metal-${metal}" data-train="${t.id}" ${affordable && (free.length || devFree) ? "" : "disabled"} aria-label="Upgrade ${t.name} to ${shown(next)} for ${price} Smithy point, taking one smith ${takes}" title="${why}">${price}</button>`;
      return `<div class="training-row${job ? " active" : ""}" role="listitem" data-training-row="${t.id}"><span class="training-label">${t.name}<small>+${t.per}% a rank, up to ${t.max * t.per}%${maxed ? "" : ` · one smith takes ${takes}`}</small></span><span class="training-box">${shown(now)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(next)}</span>${buy}</div>`;
    };
    return `<h4 class="training-group">At the smithy</h4>
      <p class="ledger-note">Smiths <b id="training-slots">${smiths.length - free.length} / ${smiths.length}</b> busy<small> · each rank costs one point and a smith's time</small></p>
      <div class="training-table" role="list" aria-label="Smithy upgrades">${ids.map((id) => row(TRAINING.find((t) => t.id === id)!)).join("")}</div>`;
  }

  // ── Study ───────────────────────────────────────────────────────────────
  private studyHtml(t: Topic) {
    const save = this.save, researchers = this.ctx.researchers();
    const skills = (t.skills ?? []).map((id) => {
      const skill = SKILLS[id], { level, price, maxed, available, canBuy } = skillPurchase(save, id);
      const node = TREE_OF[id].nodes.find((n) => n.id === id)!;
      const missing = node.requires.filter((r) => !skillRank(save, r)).map((r) => SKILLS[r].name);
      const why = maxed ? "" : missing.length ? `Needs ${missing.join(" and ")} first` : !available ? "Locked" : !canBuy ? `Needs ${price} Knowledge, have ${whole(save.knowledge)}` : "";
      return `<article class="ledger-skill ${level ? "owned" : ""} ${available ? "" : "locked"}"><span class="ledger-glyph" aria-hidden="true">${skill.icon}</span><div><small>${level} / ${skill.max} RANKS</small><h3>${skill.name}</h3><p>${skill.text}.${why ? ` <em>${why}.</em>` : ""}</p></div>
        <button data-learn="${id}" ${maxed || !canBuy || !researchers ? "disabled" : ""}>${maxed ? "Mastered" : `Learn<small>${price} Knowledge</small>`}</button></article>`;
    });
    const tree = pathsOf(t.id).length ? this.treeHtml(t) : "";
    const note = `<p class="ledger-note">You have <b class="knowledge">${whole(save.knowledge)}</b> Knowledge${researchers ? ` · ${researchers} ${researchers === 1 ? "researcher" : "researchers"} in the lab` : " · put a librarian to the alchemy lab to research"}</p>`;
    if (!skills.length && !tree) return `${note}<p class="ledger-empty">Nothing to study here yet.</p>`;
    return note + tree + skills.join("");
  }

  /** A topic's paths as a tree: the building at the root, a branch to each
   * path, its ranks down the branch in order and, on a path that has one,
   * the evolution's crown at its tip. The chosen branch burns in its
   * colours, the others are sealed in grey until it is unlearned; a tapped
   * rank is read out (and learned) below. */
  private treeHtml(t: Topic) {
    const save = this.save, paths = pathsOf(t.id), n = paths.length, topic = paths[0].topic;
    const choice = save.paths[topic];
    const w = 100 * n, mid = w / 2;
    const fan = paths.map((p, i) => {
      const x = 100 * i + 50, cls = choice?.path === p.id ? "lit" : choice ? "sealed" : "open";
      return `<path class="${cls} hue-${p.hue}" d="M ${mid} 0 C ${mid} 26, ${x} 14, ${x} 40" />`;
    }).join("");
    const cols = paths.map((p) => {
      const st = pathState(save, p.id), state = st.rank ? "chosen" : st.sealed ? "sealed" : "open";
      const ranks = p.ranks.map((r, i) => {
        const cls = i < st.rank ? "learned" : i === st.rank && !st.sealed ? "next" : "later";
        const key = `${p.id}:${i}`;
        return `${i ? `<span class="path-link ${i <= st.rank - 1 ? "lit" : ""}" aria-hidden="true"></span>` : ""}
          <button class="path-node ${cls} ${this.picked[t.id] === key ? "picked" : ""}" data-pick="${key}" aria-label="${p.name} ${ROMAN[i]}: ${r.name}${cls === "learned" ? ", learned" : ""}">
            <span class="path-medal"><canvas data-path-icon="${r.icon}:${p.hue}"></canvas></span><b>${ROMAN[i]}</b><span class="path-name">${r.name}</span></button>`;
      }).join("");
      const cstate = st.crowned ? "learned" : st.maxed && !st.sealed ? "next" : "later";
      const crown = p.evolves
        ? `<span class="path-link crown-link ${st.crowned ? "lit" : ""}" aria-hidden="true"></span>
          <button class="path-node crown ${cstate} ${this.picked[t.id] === `${p.id}:crown` ? "picked" : ""}" data-pick="${p.id}:crown" aria-label="Evolution: ${p.evolves.name}${st.crowned ? ", learned" : ""}">
            <span class="path-medal"><canvas data-path-icon="crown:gold"></canvas></span><b>♛</b><span class="path-name">${p.evolves.name}</span></button>`
        : "";
      return `<div class="path-col hue-${p.hue} ${state}"><header class="path-banner"><h4>${p.name}</h4><small>${st.sealed ? "Sealed" : p.motto}</small></header>${ranks}${crown}</div>`;
    }).join("");
    const following = choice
      ? `<div class="path-following hue-${pathById(choice.path).hue}"><span>Following <b>${pathById(choice.path).name}</b>, ${choice.rank} of ${pathById(choice.path).ranks.length}${choice.crowned !== undefined ? `, crowned` : ""}</span>
          <button data-unlearn="${topic}" class="danger">Unlearn<small>returns ${whole(choice.spent)} Knowledge${choice.crowned !== undefined ? ` · turns them back` : ""}</small></button></div>`
      : "";
    return `<div class="path-tree" style="--paths:${n}">
        <div class="path-root"><span class="path-medal root"><canvas width="44" height="44" data-icon="${t.item}"></canvas></span><span>${t.name}</span></div>
        <svg class="path-fan" viewBox="0 0 ${w} 40" preserveAspectRatio="none" aria-hidden="true">${fan}</svg>
        <div class="path-cols">${cols}</div>
      </div>${following}${this.pickedHtml(t, paths)}`;
  }

  /** What the tapped rank does, and learning it (or why not). */
  private pickedHtml(t: Topic, paths: KnowledgePath[]) {
    const [id, at] = (this.picked[t.id] ?? "").split(":");
    const p = paths.find((p) => p.id === id);
    if (!p) return `<p class="path-detail path-hint">Tap a rank to read it. Learning a path's first rank chooses that path and seals the others; unlearning returns all its Knowledge.</p>`;
    const save = this.save, st = pathState(save, p.id), researchers = this.ctx.researchers();
    if (at === "crown" && p.evolves) {
      const e = p.evolves, from = ITEM_NAMES[e.from], owned = save.defend.owned[e.from];
      let action: string;
      if (st.crowned) action = `<span class="path-done">Evolved</span><em>Unlearning ${p.name} turns them back.</em>`;
      else if (st.sealed) action = `<em>Sealed while you follow ${pathById(save.paths[p.topic]!.path).name}. Unlearn it to choose this path.</em>`;
      else if (!st.maxed) action = `<em>Learn ${p.ranks[p.ranks.length - 1].name} first.</em>`;
      else {
        const why = !researchers ? "Put a librarian to the alchemy lab to research" : !st.crownAffordable ? `Needs ${e.cost} Knowledge, have ${whole(save.knowledge)}` : "";
        action = `<button data-evolve="${p.id}" ${why ? "disabled" : ""}>Evolve<small>${e.cost} Knowledge</small></button>${why ? `<em>${why}.</em>` : ""}`;
      }
      const copies = st.crowned ? "" : ` Your ${owned} ${owned === 1 ? from : `${from}s`} go back to the palette as ${e.name}s, to place again; copies bought later are ${e.name}s too.`;
      return `<div class="path-detail hue-gold"><span class="path-medal"><canvas data-path-icon="crown:gold"></canvas></span><div><small>${p.name.toUpperCase()} · EVOLUTION</small><h3>${e.name}</h3><p>${e.text}.${copies}</p></div><div class="path-act">${action}</div></div>`;
    }
    const i = Number(at), r = p.ranks[i];
    if (!r) return "";
    let action: string;
    if (i < st.rank) action = `<span class="path-done">Learned</span>`;
    else if (st.sealed) action = `<em>Sealed while you follow ${pathById(save.paths[p.topic]!.path).name}. Unlearn it to choose this path.</em>`;
    else if (i > st.rank) action = `<em>Learn ${p.ranks[st.rank].name} first.</em>`;
    else {
      const why = !researchers ? "Put a librarian to the alchemy lab to research" : !st.affordable ? `Needs ${r.cost} Knowledge, have ${whole(save.knowledge)}` : "";
      action = `<button data-learn-path="${p.id}" ${why ? "disabled" : ""}>${i === 0 ? "Choose" : "Learn"}<small>${r.cost} Knowledge</small></button>${why ? `<em>${why}.</em>` : i === 0 ? `<em>Seals the other paths until you unlearn it.</em>` : ""}`;
    }
    return `<div class="path-detail hue-${p.hue}"><span class="path-medal"><canvas data-path-icon="${r.icon}:${p.hue}"></canvas></span>
      <div><small>${p.name.toUpperCase()} · RANK ${ROMAN[i]} OF ${ROMAN[p.ranks.length - 1]}</small><h3>${r.name}</h3><p>${r.text}.</p></div><div class="path-act">${action}</div></div>`;
  }

  private learnPath(id: PathId) {
    const p = pathById(id), first = !this.save.paths[p.topic];
    if (!this.ctx.researchers() || !learnPath(this.save, id)) return;
    this.ctx.researched();
    play(first ? "unlock" : "chime");
    this.ctx.update();
    const rank = this.save.paths[p.topic]!.rank;
    // Read on to the next rank, so the next tap learns it.
    this.picked[p.topic] = `${id}:${rank < p.ranks.length ? rank : p.evolves ? "crown" : rank - 1}`;
    this.render();
    const node = el("upgrades").querySelector(`[data-pick="${id}:${rank - 1}"]`);
    replay(node, "bought");
    sparksOver(node as HTMLElement | null, "arcane");
  }

  private evolve(id: PathId) {
    if (!this.ctx.researchers() || !evolve(this.save, id)) return;
    this.ctx.researched();
    play("levelUp");
    this.ctx.update();
    this.render();
    const node = el("upgrades").querySelector(`[data-pick="${id}:crown"]`);
    replay(node, "bought");
    sparksOver(node as HTMLElement | null, "gold");
  }

  private unlearn(topic: PathTopic) {
    if (!this.save.paths[topic]) return;
    unlearnPath(this.save, topic);
    play("stone");
    this.ctx.update();
    delete this.picked[topic];
    this.render();
  }

  private learn(id: SkillId) {
    const level = skillRank(this.save, id);
    if (!this.ctx.researchers() || !buySkill(this.save, id)) return;
    this.ctx.researched();
    play(level === 0 ? "unlock" : "chime");
    this.ctx.update();
    this.render();
    const card = el("upgrades").querySelector(`[data-learn="${id}"]`)?.closest(".ledger-skill") ?? null;
    replay(card, "bought");
    sparksOver(card?.querySelector("button") ?? null, "arcane");
  }

  // ── Each frame and each second ──────────────────────────────────────────
  /** Once a second while the page shows: the whole page once a rank
   * completes, else the countdowns. */
  tick(completed: boolean) {
    if (completed) return this.render();
    for (const job of this.save.trainingJobs) {
      const span = document.querySelector<HTMLElement>(`[data-training-timer="${job.id}"]`);
      if (span) span.textContent = this.timeLeft(job.id);
    }
  }

  /** The Forge's backdrop of drifting specks, streaming along rows in work. */
  drawParticles(time: number) {
    const canvas = document.querySelector<HTMLCanvasElement>(".ledger-forge .training-particles");
    if (!canvas) return;
    const top = canvas.getBoundingClientRect().top;
    const lanes = Array.from(document.querySelectorAll<HTMLElement>(".training-row.active")).map((row) => {
      const r = row.getBoundingClientRect();
      return r.top + r.height / 2 - top;
    });
    this.trainingParticles.draw(canvas, time, { lanes, reduced: this.save.settings.reduceMotion });
  }
}

/** The page's scrolling parts: the halves side by side, or the body when stacked. */
const SCROLLERS = [".ledger-body", ".ledger-forge", ".ledger-study"];
const ROMAN = ["I", "II", "III", "IV", "V"];
const priceText = (p: Price) => METALS.filter((k) => p[k]).map((k) => `${p[k]} ${k}`).join(" · ");
const bal = (s: { settings: { devMode: boolean } }, n: number) => (s.settings.devMode ? "∞" : Math.floor(n + 1e-9));
