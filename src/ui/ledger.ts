import { evolveOne, unevolveOne } from "../specializations.ts";
import { TILE_TYPE } from "../tiles.ts";
import { play } from "../sound.ts";
import { TRAINING, addSmith, busySmiths, whole, cancelTraining, removeSmith, skillPurchase, skillRank, startTraining, trainingLeft, trainingStep, type TrainingId } from "../progression.ts";
import { BARS_PER_POINT, METALS } from "../mine/sim.ts";
import { SKILLS, TREES, type SkillId } from "../skill-trees.ts";
import { pathById, pathState, pathsOf, unlearnPath, type KnowledgePath, type PathId, type PathTopic } from "../knowledge-paths.ts";
import { cancelResearch, researchLeft, researchSeconds, startResearch } from "../research-jobs.ts";
import { addForgeSmith, cancelForge, forgeLeft, forgeSeconds, removeForgeSmith, startForge, type ForgeRequest } from "../forge-jobs.ts";
import { paintPathIcons } from "./path-badge.ts";
import { TrainingParticles } from "../training-particles.ts";
import { trainingSeconds } from "../training-jobs.ts";
import { ITEM_NAMES, SPEED3_PRICE, UPGRADES, upgradePrice, type Price, type UpgradeId } from "../defend/catalog.ts";
import { canAfford, type Wallet } from "../defend/progress.ts";
import { paintIcon, type IconItem } from "../defend/structure-art.ts";
import type { PlacedKind } from "../defend/layout.ts";
import { SUBJECTS, topicItems, type Subject, type SubjectId, type Topic } from "../upgrade-subjects.ts";
import { replay, sparksOver } from "./flourish.ts";
import type { AppContext } from "./app.ts";
import { uiSprite } from "./dom.ts";
import { holdToRepeat } from "./hold-repeat.ts";

/** Hours, minutes and seconds left, as the timers show them. */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

const TREE_OF = Object.fromEntries(TREES.flatMap((t) => t.nodes.map((n) => [n.id, t]))) as Record<SkillId, (typeof TREES)[number]>;

/** The two underground chambers that hold the upgrades: the Smithy under
 * the Mine (the Armory's levels and the Smithy's rows, paid with the mine's
 * metal and worked by its smiths) and the Study under the Library (skills
 * and Knowledge paths, bought with Knowledge while a researcher is in the
 * lab). Copies of buildings and consumables are bought in the Tiles tab. */
export type LedgerKind = "smithy" | "study";

/** Whether a topic has anything for one chamber. */
export function topicHas(t: Topic, kind: LedgerKind) {
  if (kind === "smithy") return !!(t.upgrades?.length || t.training?.length || t.extras?.includes("speed3"));
  return !!(t.skills?.length || pathsOf(t.id).length);
}
/** The subjects with something for a chamber, each with only those topics. */
export function ledgerSubjects(kind: LedgerKind): Subject[] {
  return SUBJECTS.map((s) => ({ ...s, topics: s.topics.filter((t) => topicHas(t, kind)) })).filter((s) => s.topics.length);
}

const CHAMBER = {
  smithy: { title: "The Smithy", blurb: "Below the mine, by the forge's heat: what the smiths make stronger", up: "Up to the mine" },
  study: { title: "The Study", blurb: "Beneath the library, by candle and sigil: what Knowledge changes", up: "Up to the library" },
};

/** One chamber's upgrades: a subject strip, a Tiles-style collection of
 * stacks, and the selected type's details. Smithy equipment and Study
 * research both serve every building of a type; which researched path each
 * building wears is chosen in Defend as it is placed. */
export class Ledger {
  private subjects: Subject[];
  private subject: SubjectId;
  private topics: Partial<Record<SubjectId, string>> = {};
  private trainingParticles = new TrainingParticles();
  /** The rank picked in each topic's path tree ("path:index", or "path:crown"). */
  private picked: Record<string, string> = {};
  /** The subject and topic last drawn. */
  private shown = "";
  /** Whether holding a buy button repeats it yet (bound on the first draw). */
  private holding = false;
  private researchCrew = -1;
  private smithCrew = "";

  constructor(private ctx: AppContext, readonly root: HTMLElement, readonly kind: LedgerKind, private up: () => void) {
    this.subjects = ledgerSubjects(kind);
    this.subject = kind === "study" ? "towers" : this.subjects[0].id;
  }

  private get save() {
    return this.ctx.save();
  }

  private current(): Subject {
    return this.subjects.find((s) => s.id === this.subject)!;
  }
  private topic(): Topic {
    const s = this.current();
    return s.topics.find((t) => t.id === this.topics[s.id]) ?? s.topics[0];
  }

  /** Opens at a topic (by id), when this chamber has it. */
  focus(topicId: string) {
    const s = this.subjects.find((s) => s.topics.some((t) => t.id === topicId));
    if (!s) return;
    this.subject = s.id;
    this.topics[s.id] = topicId;
  }

  render() {
    const active = document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement) ? document.activeElement : null;
    const focusAttrs = active ? Array.from(active.attributes).filter(a => a.name.startsWith("data-")).map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join("") : "";
    this.researchCrew = this.ctx.researchers();
    this.smithCrew = this.ctx.smiths().join("\n");
    const subject = this.current(), topic = this.topic(), smithy = this.kind === "smithy", c = CHAMBER[this.kind];
    // Redrawn in place (a purchase, a tapped rank): keep where the list was scrolled to.
    const same = this.shown === `${subject.id}:${topic.id}`;
    const list = this.root.querySelector(".chamber-list"), scroll = same ? (list?.scrollTop ?? 0) : 0;
    const strips = Array.from(this.root.querySelectorAll(".ledger-strip")).map((s) => s.scrollLeft);
    this.shown = `${subject.id}:${topic.id}`;
    const subjects = this.subjects.map((s) => `<button data-subject="${s.id}" aria-pressed="${s.id === subject.id}"><span>${uiSprite(s.sprite)}</span>${s.name}</button>`).join("");
    this.root.innerHTML = `<header class="chamber-head">
        <button class="chamber-up" data-up title="${c.up}"><span aria-hidden="true">⤒</span> ${smithy ? "Mine" : "Library"}</button>
        <div class="chamber-title"><h2>${c.title}</h2><small>${c.blurb}</small></div>
      </header>
      ${smithy ? this.walletHtml() : this.knowledgeHtml()}
      <div class="ledger-strip ledger-subjects" role="group" aria-label="Subjects">${subjects}</div>
      <section class="chamber-list ledger-half ${smithy ? "ledger-forge" : "ledger-study"}" aria-label="${topic.name}">${smithy ? `<canvas class="training-particles" aria-hidden="true"></canvas>` : ""}
        ${this.galleryHtml(subject)}
        ${smithy ? `<p class="ledger-scope">GLOBAL EQUIPMENT · ${topic.item ? `Every ${topic.name}, owned now or bought later` : topic.name}</p>${this.forgeHtml(topic)}` : `<p class="ledger-scope">SHARED RESEARCH · ${topic.name}</p>${this.studyHtml(topic)}`}</section>`;
    const root = this.root;
    root.querySelectorAll<HTMLButtonElement>("[data-ledger-stack]").forEach(b => b.onclick = () => {
      this.topics[this.subject] = b.dataset.ledgerStack!;
      this.render();
    });
    if (!this.holding) {
      this.holding = true;
      holdToRepeat(root, ["data-upgrade", "data-train", "data-learn", "data-learn-path"]);
    }
    root.querySelector(".chamber-list")!.scrollTop = scroll;
    root.querySelectorAll(".ledger-strip").forEach((s, i) => (s.scrollLeft = strips[i] ?? 0));
    // Scroll only the strip: scrollIntoView also scrolls the offscreen
    // chamber's ancestors, jumping the whole scene before descent starts.
    const selected = root.querySelector<HTMLElement>('.ledger-strip [aria-pressed="true"]');
    if (selected) {
      const strip = selected.parentElement!;
      const itemBox = selected.getBoundingClientRect(), stripBox = strip.getBoundingClientRect();
      if (itemBox.left < stripBox.left) strip.scrollLeft += itemBox.left - stripBox.left;
      else if (itemBox.right > stripBox.right) strip.scrollLeft += itemBox.right - stripBox.right;
    }
    root.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as IconItem));
    paintPathIcons(root);
    root.querySelector<HTMLButtonElement>("[data-up]")!.onclick = () => this.up();
    root.querySelectorAll<HTMLButtonElement>("[data-subject]").forEach((b) => (b.onclick = () => {
      this.subject = b.dataset.subject as SubjectId;
      this.render();
    }));
    root.querySelectorAll<HTMLButtonElement>("[data-topic]").forEach((b) => (b.onclick = () => {
      this.topics[this.subject] = b.dataset.topic;
      this.render();
    }));
    if (focusAttrs) root.querySelector<HTMLElement>(focusAttrs)?.focus({ preventScroll: true });
    this.bindForge(root);
    root.querySelectorAll<HTMLButtonElement>("[data-learn]").forEach((b) => (b.onclick = () => this.learn(b.dataset.learn as SkillId)));
    root.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((b) => (b.onclick = () => {
      this.picked[topic.id] = b.dataset.pick!;
      this.render();
    }));
    root.querySelectorAll<HTMLButtonElement>("[data-learn-path]").forEach((b) => (b.onclick = () => this.learnPath(b.dataset.learnPath as PathId)));
    root.querySelectorAll<HTMLButtonElement>("[data-evolve]").forEach((b) => (b.onclick = () => this.evolve(b.dataset.evolve as PathId)));
    root.querySelectorAll<HTMLButtonElement>("[data-evolve-one]").forEach((b) => (b.onclick = () => {
      if (evolveOne(this.save, b.dataset.evolveOne as PathId)) { this.ctx.update(); play("levelUp"); this.render(); }
    }));
    root.querySelectorAll<HTMLButtonElement>("[data-unevolve-one]").forEach((b) => (b.onclick = () => {
      if (unevolveOne(this.save, b.dataset.unevolveOne as PlacedKind)) { this.ctx.update(); play("stone"); this.render(); }
    }));
    root.querySelectorAll<HTMLButtonElement>("[data-unlearn]").forEach((b) => (b.onclick = () => this.unlearn(b.dataset.unlearn as PathTopic)));
    root.querySelector<HTMLButtonElement>("[data-cancel-research]")?.addEventListener("click", () => {
      if (cancelResearch(this.save)) { this.ctx.update(); this.render(); }
    });
  }

  /** How many of the topic's kinds the player owns. */
  private owned(t: Topic) {
    return topicItems(t).reduce((n, item) => n + this.save.defend.owned[item], 0);
  }

  private galleryHtml(subject: Subject) {
    const study = this.kind === "study", current = this.topic();
    const stacks = subject.topics.map(t => {
      const count = this.owned(t), type = t.item ? TILE_TYPE[t.item] : "consumables", on = t.id === current.id;
      const layers = count > 2 ? "layers-2" : count > 1 ? "layers-1" : "";
      const sub = study ? pathsOf(t.id).length ? "Research paths" : "Shared research" : "Upgrades all";
      return `<button class="tile type-${type} ${layers} ${on ? "open" : ""}" data-key="${t.id}" data-ledger-stack="${t.id}" aria-pressed="${on}" aria-label="${t.name}${t.item ? `, ${count} owned` : ""}">
        <span class="tile-face">${t.item ? `<canvas width="48" height="48" data-icon="${t.item}"></canvas>` : uiSprite(subject.sprite)}</span><span class="tile-name">${t.name}</span>${t.item ? `<b class="tile-count">×${count}</b>` : ""}<small class="tile-sub">${sub}</small></button>`;
    }).join("");
    return `<div class="ledger-collection"><p class="ledger-note">${study ? "Research unlocks a path for every building of its type. Choose which path each one wears as you place it in Defend." : "Select a type. Smithy equipment improves every building of that type."}</p><div class="tiles-grid ledger-tiles">${stacks}</div></div>`;
  }

  // ── The Smithy ──────────────────────────────────────────────────────────
  /** The Smithy's wallet: the mine's copper, silver and gold. */
  private wallet(): Wallet {
    const s = this.save;
    return { ...s.smithy, free: s.settings.devMode };
  }

  private walletHtml() {
    const s = this.save, w = this.wallet(), smiths = this.ctx.smiths(), free = this.freeSmiths();
    const job = s.forgeJob;
    const name = job ? job.kind === "speed" ? "War drums" : UPGRADES.find(u => u.id === job.id)!.name : "";
    return `<p class="ledger-note chamber-wallet">${METALS.map((k) => `<b class="metal-${k}">${bal(s, w[k])}</b> ${k}`).join(" · ")}
      <span>· smiths <b id="training-slots">${smiths.length - free.length} / ${smiths.length}</b> busy</span><small> · a point of a metal from every ${BARS_PER_POINT} bars</small></p>
      ${job ? `<div class="research-project"><div><b>${name}</b><small data-forge-timer>${this.forgeTimeLeft()}</small></div><div class="smith-count"><button data-less-forge aria-label="One smith fewer on Forge project" ${job.smiths.length <= 1 ? "disabled" : ""}>−</button><b>${job.smiths.length} smiths</b><button data-more-forge aria-label="One more smith on Forge project" ${free.length ? "" : "disabled"}>+</button></div><button data-cancel-forge>Cancel<small>Refund ${priceText(job.paid) || "0 metal"}</small></button></div>` : ""}`;
  }

  private forgeTimeLeft() {
    const left = forgeLeft(this.save);
    return Number.isFinite(left) ? `${formatDuration(left)} remaining` : "Paused: assign a smith";
  }

  private forgeHtml(t: Topic) {
    const d = this.save.defend, w = this.wallet();
    const busy = !!this.save.forgeJob, staffed = this.freeSmiths().length > 0 || this.save.settings.instantResearch;
    const extras = t.extras?.includes("speed3")
      ? [`<article class="card defend-card ledger-card"><div><small>${d.speed3 ? "UNLOCKED" : "ONE-TIME UNLOCK"}</small><h3>War drums</h3><p>Adds 3× to the battle speed button.</p></div>
      <button data-buy-speed3 ${d.speed3 || busy || !staffed || !canAfford(w, SPEED3_PRICE) ? "disabled" : ""}>${d.speed3 ? "Owned" : `Forge<small>${priceText(SPEED3_PRICE)}</small><small>One smith: ${formatDuration(forgeSeconds(0) * 1000)}</small>`}</button></article>`]
      : [];
    const levels = (t.upgrades ?? []).map((id) => {
      const u = UPGRADES.find((u) => u.id === id)!, lvl = d.levels[id], maxed = lvl >= u.maxLevel;
      const p = u.price ? u.price(lvl) : upgradePrice(lvl);
      return `<article class="card defend-card ledger-card ledger-level"><div><small>LEVEL ${lvl} / ${u.maxLevel}</small><h3>${u.name}</h3><p>${u.describe(lvl)}${maxed ? "" : `<b class="ledger-next">Next: ${u.describe(lvl + 1)}</b>`}</p></div>
        <button data-upgrade="${id}" ${maxed || busy || !staffed || !canAfford(w, p) ? "disabled" : ""}>${maxed ? "Maxed" : `Forge<small>${priceText(p)}</small><small>One smith: ${formatDuration(forgeSeconds(lvl) * 1000)}</small>`}</button></article>`;
    });
    const smithy = t.training?.length ? this.smithyHtml(t.training) : "";
    const forged = levels.length || extras.length ? `<h4 class="training-group">On the anvil</h4>` : "";
    const body = [forged, ...levels, ...extras, smithy].join("");
    return body || `<p class="ledger-empty">Nothing to forge here.</p>`;
  }

  private bindForge(root: HTMLElement) {
    const s = this.save;
    /** A purchase rings like coins and stamps its card once the page is redrawn. */
    const commit = (request: ForgeRequest, card: string) => {
      if (!startForge(s, request, this.freeSmiths()[0] ?? "", this.ctx.clock())) return;
      this.ctx.update();
      play("coin");
      this.render();
      const bought = root.querySelector(card)?.closest(".card") ?? null;
      replay(bought, "bought");
      sparksOver(bought?.querySelector("button") ?? null, "gold");
    };
    root.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach((b) => (b.onclick = () => commit({ kind: "upgrade", id: b.dataset.upgrade as UpgradeId }, `[data-upgrade="${b.dataset.upgrade}"]`)));
    root.querySelector<HTMLButtonElement>("[data-buy-speed3]")?.addEventListener("click", () => commit({ kind: "speed", id: "speed3" }, "[data-buy-speed3]"));
    root.querySelector<HTMLButtonElement>("[data-more-forge]")?.addEventListener("click", () => {
      const smith = this.freeSmiths()[0];
      if (smith && addForgeSmith(s, smith)) this.ctx.update();
      this.render();
    });
    root.querySelector<HTMLButtonElement>("[data-less-forge]")?.addEventListener("click", () => {
      if (removeForgeSmith(s)) this.ctx.update();
      this.render();
    });
    root.querySelector<HTMLButtonElement>("[data-cancel-forge]")?.addEventListener("click", () => {
      if (cancelForge(s)) this.ctx.update();
      this.render();
    });
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
    modal.innerHTML = `<small>SMITHY</small><h2>Cancel this upgrade?</h2><p>Taking the last smith off ${row.name} stops the work on it. The metal paid is returned, and the work done so far is lost.</p>
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
      const { now, next, affordable, maxed, metal, amount } = trainingStep(save, t.id);
      const price = `${amount} ${metal}`;
      const job = save.trainingJobs.find((j) => j.id === t.id);
      const takes = formatDuration(trainingSeconds(save.training[t.id]) * 1000);
      const shown = (v: number) => `+${v}%`;
      const why = !affordable ? `Needs ${price}` : !free.length && !devFree ? (smiths.length ? "Every smith is busy" : "Put a miner to the smithy in the Mine") : `One smith takes ${takes}`;
      const buy = job
        ? `<span class="training-work"><span class="training-box training-timer" title="Time left at this many smiths"><span data-training-timer="${t.id}">${this.timeLeft(t.id)}</span></span>
           <span class="smith-count" role="group" aria-label="Smiths on ${t.name}"><button class="smith-step" data-less="${t.id}" aria-label="One smith fewer on ${t.name}" title="${job.smiths.length <= 1 ? "Cancel this upgrade" : "One smith fewer"}">−</button><b title="${job.smiths.join(", ") || "No smith"}">⚒ ${job.smiths.length}</b><button class="smith-step" data-more="${t.id}" ${free.length ? "" : "disabled"} aria-label="One more smith on ${t.name}" title="${free.length ? "One more smith shares the work" : "No free smith"}">+</button></span></span>`
        : maxed
        ? `<button class="training-box training-cost" disabled aria-label="${t.name} is fully upgraded">Max</button>`
        : `<button class="training-box training-cost metal-${metal}" data-train="${t.id}" ${affordable && (free.length || devFree) ? "" : "disabled"} aria-label="Upgrade ${t.name} to ${shown(next)} for ${price}, taking one smith ${takes}" title="${why}">${price}</button>`;
      return `<div class="training-row${job ? " active" : ""}" role="listitem" data-training-row="${t.id}"><span class="training-label">${t.name}<small>+${t.per}% a rank, up to ${t.max * t.per}%${maxed ? "" : ` · one smith takes ${takes}`}</small></span><span class="training-box">${shown(now)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(next)}</span>${buy}</div>`;
    };
    return `<h4 class="training-group">At the smithy</h4><p class="ledger-note"><small>Metal costs and work grow quadratically. Assigned smiths share the time.</small></p>
      <div class="training-table" role="list" aria-label="Smithy upgrades">${ids.map((id) => row(TRAINING.find((t) => t.id === id)!)).join("")}</div>`;
  }

  // ── The Study ───────────────────────────────────────────────────────────
  private knowledgeHtml() {
    const save = this.save, researchers = this.ctx.researchers();
    const job = save.researchJob, name = job ? job.kind === "skill" ? SKILLS[job.id].name
      : job.kind === "evolution" ? pathById(job.id).evolves!.name : pathById(job.id).ranks[job.rank].name : "";
    return `<p class="ledger-note chamber-wallet">You have <b class="knowledge">${whole(save.knowledge)}</b> Knowledge${researchers ? ` · ${researchers} ${researchers === 1 ? "researcher" : "researchers"} in the lab` : " · put a librarian to the alchemy lab to research"}<small>One project at a time; all researchers share its work.</small></p>
      ${job ? `<div class="research-project"><div><b>${name}</b><small data-research-timer>${this.researchTimeLeft()}</small></div><button data-cancel-research>Cancel<small>Refund ${job.paid} Knowledge</small></button></div>` : ""}`;
  }

  private researchTimeLeft() {
    const left = researchLeft(this.save, this.ctx.researchers());
    return Number.isFinite(left) ? `${formatDuration(left)} remaining` : "Paused: assign a researcher";
  }

  private researchHint(rank: number, evolution = false) {
    if (this.save.settings.instantResearch) return "Instant";
    const count = Math.max(1, this.ctx.researchers());
    return `${formatDuration(researchSeconds(rank, evolution) * 1000 / count)} with ${count} ${count === 1 ? "researcher" : "researchers"}`;
  }

  private studyHtml(t: Topic) {
    const save = this.save, researchers = this.ctx.researchers();
    const skillCard = (id: SkillId) => {
      const skill = SKILLS[id], { level, price, maxed, available, canBuy } = skillPurchase(save, id);
      const node = TREE_OF[id].nodes.find((n) => n.id === id)!;
      const missing = node.requires.filter((r) => skillRank(save, r) < (node.full?.includes(r) ? SKILLS[r].max : 1)).map((r) => SKILLS[r].name + (node.full?.includes(r) ? " (all ranks)" : ""));
      const active = save.researchJob?.kind === "skill" && save.researchJob.id === id;
      const busy = !!save.researchJob;
      const why = maxed || active ? "" : busy ? "Researchers are working on the current project" : missing.length ? `Needs ${missing.join(" and ")} first` : !available ? "Locked" : !canBuy ? `Needs ${price} Knowledge, have ${whole(save.knowledge)}` : "";
      return `<article class="ledger-skill ${level ? "owned" : ""} ${available ? "" : "locked"}"><span class="ledger-glyph" aria-hidden="true">${skill.icon}</span><div><small>${level} / ${skill.max} RANKS</small><h3>${skill.name}</h3><p>${skill.text}.${why ? ` <em>${why}.</em>` : ""}</p></div>
        <button data-learn="${id}" ${maxed || !canBuy || busy || (!researchers && !save.settings.instantResearch) ? "disabled" : ""}>${maxed ? "Mastered" : active ? `Researching<small data-research-timer>${this.researchTimeLeft()}</small>` : `Learn<small>${price} Knowledge</small><small>${this.researchHint(level)}</small>`}</button></article>`;
    };
    if (t.id === "warBanner") {
      const shared: SkillId[] = ["warBanner", "bannerCooldown", "bannerDefense", "bannerReach"];
      const branches: { name: string; ids: SkillId[] }[] = [
        { name: "Damage", ids: ["bannerDamage"] },
        { name: "Marching speed", ids: ["bannerMarch"] },
        { name: "Life & regeneration", ids: ["bannerLife", "bannerRegen"] },
      ];
      return `<div class="banner-research"><div class="banner-research-shared"><h4>Shared upgrades</h4>${shared.map(skillCard).join("")}</div><p class="ledger-note">Master Rapid deployment, then learn Sheltering standard and Broad standard to open the three branches. Each branch can be researched.</p><div class="banner-research-branches">${branches.map(branch => `<section><h4>${branch.name}</h4>${branch.ids.map(skillCard).join("")}</section>`).join("")}</div></div>`;
    }
    const skills = (t.skills ?? []).map(skillCard);
    const tree = pathsOf(t.id).length ? this.treeHtml(t) : "";
    if (!skills.length && !tree) return `<p class="ledger-empty">Nothing to study here yet.</p>`;
    return tree + skills.join("");
  }

  /** A topic's paths as a tree: the building at the root, a branch to each
   * path, its ranks down the branch in order and, on a path that has one,
   * the evolution's crown at its tip. The chosen branch burns in its
   * colours when researched. A tapped rank is read out below; unlocking it
   * makes it a choice for every building of the type in Defend. */
  private treeHtml(t: Topic) {
    const save = this.save, paths = pathsOf(t.id), n = paths.length;
    const w = 100 * n, mid = w / 2;
    const fan = paths.map((p, i) => {
      const x = 100 * i + 50, cls = pathState(save, p.id).rank ? "lit" : "open";
      return `<path class="${cls} hue-${p.hue}" d="M ${mid} 0 C ${mid} 26, ${x} 14, ${x} 40" />`;
    }).join("");
    const cols = paths.map((p) => {
      const st = pathState(save, p.id), state = st.rank ? "chosen" : "open";
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
    const following = `<p class="ledger-scope">RESEARCH ONCE · every ${t.name} can wear what you unlock. Choose a path for each as you place it in Defend.</p>`;
    return `${following}<div class="path-tree" style="--paths:${n}">
        <div class="path-root"><span class="path-medal root"><canvas width="44" height="44" data-icon="${t.item}"></canvas></span><span>${t.name}</span></div>
        <svg class="path-fan" viewBox="0 0 ${w} 40" preserveAspectRatio="none" aria-hidden="true">${fan}</svg>
        <div class="path-cols">${cols}</div>
      </div>${this.pickedHtml(t, paths)}`;
  }

  /** What the tapped rank does, and learning it (or why not). */
  private pickedHtml(t: Topic, paths: KnowledgePath[]) {
    const [id, at] = (this.picked[t.id] ?? "").split(":");
    const p = paths.find((p) => p.id === id);
    if (!p) return `<p class="path-detail path-hint">Tap a rank to research it for your collection. Unlock any number of paths, then mix them across your city: each building wears the one you choose as you place it.</p>`;
    const save = this.save, st = pathState(save, p.id), researchers = this.ctx.researchers();
    if (at === "crown" && p.evolves) {
      const e = p.evolves;
      const active = save.researchJob?.kind === "evolution" && save.researchJob.id === p.id;
      const why = !st.maxed ? "Research all three ranks first" : save.researchJob ? "Researchers are working on the current project" : !researchers && !save.settings.instantResearch ? "Assign a researcher in the lab" : !st.crownAffordable ? `Needs ${e.cost} Knowledge` : "";
      const d = save.defend, base = d.owned[e.from], made = d.owned[e.item];
      const action = st.crowned ? `<span class="path-done">Crown unlocked</span><button data-evolve-one="${p.id}" ${base ? "" : "disabled"}>Evolve a ${ITEM_NAMES[e.from]}<small>Free · ${base} owned · it waits in the palette</small></button>${made ? `<button data-unevolve-one="${e.item}">Return a ${e.name}<small>Free · ${made} owned</small></button>` : ""}`
        : active ? `<span data-research-timer>${this.researchTimeLeft()}</span>` : `<button data-evolve="${p.id}" ${why ? "disabled" : ""}>Research crown<small>${e.cost} Knowledge</small><small>${this.researchHint(st.rank, true)}</small></button>${why ? `<em>${why}.</em>` : ""}`;
      return `<div class="path-detail hue-gold"><span class="path-medal"><canvas data-path-icon="crown:gold"></canvas></span><div><small>SHARED CROWN RESEARCH</small><h3>${e.name}</h3><p>Unlock this evolution once, then turn any ${ITEM_NAMES[e.from]} into a ${e.name} for free (one standing in the city is taken up first) and back again.</p></div><div class="path-act">${action}</div></div>`;
    }
    const i = Number(at), r = p.ranks[i];
    if (!r) return "";
    let action: string;
    if (i < st.rank) action = `<span class="path-done">Learned</span>`;
    else if (i > st.rank) action = `<em>Learn ${p.ranks[st.rank].name} first.</em>`;
    else {
      const active = save.researchJob?.kind === "path" && save.researchJob.id === p.id;
      const why = save.researchJob ? "Researchers are working on the current project" : !researchers && !save.settings.instantResearch ? "Put a librarian to the alchemy lab to research" : !st.affordable ? `Needs ${r.cost} Knowledge, have ${whole(save.knowledge)}` : "";
      action = active ? `<span data-research-timer>${this.researchTimeLeft()}</span>` : `<button data-learn-path="${p.id}" ${why ? "disabled" : ""}>Research unlock<small>${r.cost} Knowledge</small><small>${this.researchHint(st.rank)}</small></button>${why ? `<em>${why}.</em>` : i === 0 ? `<em>Unlocks this rank for every ${t.name}. Choose it as you place one in Defend.</em>` : ""}`;
    }
    return `<div class="path-detail hue-${p.hue}"><span class="path-medal"><canvas data-path-icon="${r.icon}:${p.hue}"></canvas></span>
      <div><small>${p.name.toUpperCase()} · RANK ${ROMAN[i]} OF ${ROMAN[p.ranks.length - 1]}</small><h3>${r.name}</h3><p>${r.text}.</p></div><div class="path-act">${action}</div></div>`;
  }

  private learnPath(id: PathId) {
    const p = pathById(id), first = !pathState(this.save, id).rank;
    if (!startResearch(this.save, { kind: "path", id }, this.ctx.clock(), this.ctx.researchers())) return;
    if (this.save.researchJob) { this.ctx.update(); this.render(); return; }
    this.ctx.researched();
    play(first ? "unlock" : "chime");
    this.ctx.update();
    const rank = pathState(this.save, id).rank;
    // Read on to the next rank, so the next tap learns it.
    this.picked[p.topic] = `${id}:${rank < p.ranks.length ? rank : p.evolves ? "crown" : rank - 1}`;
    this.render();
    const node = this.root.querySelector(`[data-pick="${id}:${rank - 1}"]`);
    replay(node, "bought");
    sparksOver(node as HTMLElement | null, "arcane");
  }

  private evolve(id: PathId) {
    if (!startResearch(this.save, { kind: "evolution", id }, this.ctx.clock(), this.ctx.researchers())) return;
    if (this.save.researchJob) { this.ctx.update(); this.render(); return; }
    this.ctx.researched();
    play("levelUp");
    this.ctx.update();
    this.render();
    const node = this.root.querySelector(`[data-pick="${id}:crown"]`);
    replay(node, "bought");
    sparksOver(node as HTMLElement | null, "gold");
  }

  private unlearn(topic: PathTopic) {
    if (!pathsOf(topic).some(p => this.save.pathResearch[p.id])) return;
    const job = this.save.researchJob;
    if (job && job.kind !== "skill" && pathById(job.id).topic === topic) cancelResearch(this.save);
    unlearnPath(this.save, topic);
    play("stone");
    this.ctx.update();
    delete this.picked[topic];
    this.render();
  }

  private learn(id: SkillId) {
    const level = skillRank(this.save, id);
    if (!startResearch(this.save, { kind: "skill", id }, this.ctx.clock(), this.ctx.researchers())) return;
    if (!this.save.researchJob) this.ctx.researched();
    play(level === 0 ? "unlock" : "chime");
    this.ctx.update();
    this.render();
    const card = this.root.querySelector(`[data-learn="${id}"]`)?.closest(".ledger-skill") ?? null;
    replay(card, "bought");
    sparksOver(card?.querySelector("button") ?? null, "arcane");
  }

  // ── Each frame and each second ──────────────────────────────────────────
  /** Once a second while the chamber shows: the whole chamber once a rank
   * completes, else the countdowns. */
  tick(completed: boolean) {
    if (completed || (this.kind === "study" && this.researchCrew !== this.ctx.researchers())
      || (this.kind === "smithy" && this.smithCrew !== this.ctx.smiths().join("\n"))) return this.render();
    this.root.querySelectorAll<HTMLElement>("[data-forge-timer]").forEach(span => { span.textContent = this.forgeTimeLeft(); });
    this.root.querySelectorAll<HTMLElement>("[data-research-timer]").forEach(span => { span.textContent = this.researchTimeLeft(); });
    for (const job of this.save.trainingJobs) {
      const span = this.root.querySelector<HTMLElement>(`[data-training-timer="${job.id}"]`);
      if (span) span.textContent = this.timeLeft(job.id);
    }
  }

  /** The Smithy's backdrop of drifting specks, streaming along rows in work. */
  drawParticles(time: number) {
    const canvas = this.root.querySelector<HTMLCanvasElement>(".ledger-forge .training-particles");
    if (!canvas) return;
    const top = canvas.getBoundingClientRect().top;
    const lanes = Array.from(this.root.querySelectorAll<HTMLElement>(".training-row.active")).map((row) => {
      const r = row.getBoundingClientRect();
      return r.top + r.height / 2 - top;
    });
    this.trainingParticles.draw(canvas, time, { lanes, reduced: this.save.settings.reduceMotion });
  }
}

const ROMAN = ["I", "II", "III", "IV", "V"];
const priceText = (p: Price) => METALS.filter((k) => p[k]).map((k) => `${p[k]} ${k}`).join(" · ");
const bal = (s: { settings: { devMode: boolean } }, n: number) => (s.settings.devMode ? "∞" : Math.floor(n + 1e-9));
