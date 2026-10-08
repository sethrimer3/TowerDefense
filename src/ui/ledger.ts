import { play } from "../sound.ts";
import { TRAINING, addSmith, busySmiths, whole, cancelTraining, removeSmith, skillPurchase, skillRank, startTraining, trainingLeft, trainingStep, type TrainingId } from "../progression.ts";
import { BARS_PER_POINT, METALS } from "../mine/sim.ts";
import { SKILLS, TREES, type SkillId } from "../skill-trees.ts";
import { pathById, pathState, pathsOf, unlearnPath, type KnowledgePath, type PathId, type PathTopic } from "../knowledge-paths.ts";
import { cancelResearch, researchLeft, researchSeconds, startResearch } from "../research-jobs.ts";
import { paintPathIcon } from "./path-icons.ts";
import { TrainingParticles } from "../training-particles.ts";
import { trainingSeconds } from "../training-jobs.ts";
import { ITEM_NAMES, SPEED3_PRICE, UPGRADES, upgradePrice, type Price, type UpgradeId } from "../defend/catalog.ts";
import { buySpeed3, buyUpgrade, canAfford, type Wallet } from "../defend/progress.ts";
import { paintIcon, type IconItem } from "../defend/structure-art.ts";
import { SUBJECTS, type Subject, type SubjectId, type Topic } from "../upgrade-subjects.ts";
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

/** One chamber's ledger: its subjects and their topics along two strips
 * (each scrolling sideways, so the page never grows long), and the chosen
 * topic's upgrades below. The Smithy's are the Armory's levels and the
 * Smithy's rows; the Study's are the skills and the paths, drawn as a tree. */
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

  constructor(private ctx: AppContext, readonly root: HTMLElement, readonly kind: LedgerKind, private up: () => void) {
    this.subjects = ledgerSubjects(kind);
    this.subject = this.subjects[0].id;
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
    const subject = this.current(), topic = this.topic(), smithy = this.kind === "smithy", c = CHAMBER[this.kind];
    // Redrawn in place (a purchase, a tapped rank): keep where the list was scrolled to.
    const same = this.shown === `${subject.id}:${topic.id}`;
    const list = this.root.querySelector(".chamber-list"), scroll = same ? (list?.scrollTop ?? 0) : 0;
    const strips = Array.from(this.root.querySelectorAll(".ledger-strip")).map((s) => s.scrollLeft);
    this.shown = `${subject.id}:${topic.id}`;
    const subjects = this.subjects.map((s) => `<button data-subject="${s.id}" aria-pressed="${s.id === subject.id}"><span>${uiSprite(s.sprite)}</span>${s.name}</button>`).join("");
    const topics = subject.topics.length > 1
      ? `<div class="ledger-strip ledger-topics" role="group" aria-label="${subject.name}">${subject.topics.map((t) => `<button data-topic="${t.id}" aria-pressed="${t.id === topic.id}">${t.item ? `<canvas width="22" height="22" data-icon="${t.item}"></canvas>` : ""}${t.name}</button>`).join("")}</div>`
      : "";
    this.root.innerHTML = `<header class="chamber-head">
        <button class="chamber-up" data-up title="${c.up}"><span aria-hidden="true">⤒</span> ${smithy ? "Mine" : "Library"}</button>
        <div class="chamber-title"><h2>${c.title}</h2><small>${c.blurb}</small></div>
      </header>
      ${smithy ? this.walletHtml() : this.knowledgeHtml()}
      <div class="ledger-strip ledger-subjects" role="group" aria-label="Subjects">${subjects}</div>${topics}
      <section class="chamber-list ledger-half ${smithy ? "ledger-forge" : "ledger-study"}" aria-label="${topic.name}">${smithy ? `<canvas class="training-particles" aria-hidden="true"></canvas>` : ""}
        ${smithy ? this.forgeHtml(topic) : this.studyHtml(topic)}</section>`;
    const root = this.root;
    if (!this.holding) {
      this.holding = true;
      holdToRepeat(root, ["data-upgrade"]);
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
    root.querySelectorAll<HTMLCanvasElement>("canvas[data-path-icon]").forEach((c) => {
      const [icon, hue] = c.dataset.pathIcon!.split(":");
      paintPathIcon(c, icon as never, hue as never);
    });
    root.querySelector<HTMLButtonElement>("[data-up]")!.onclick = () => this.up();
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
    root.querySelector<HTMLButtonElement>("[data-cancel-research]")?.addEventListener("click", () => {
      if (cancelResearch(this.save)) { this.ctx.update(); this.render(); }
    });
  }

  // ── The Smithy ──────────────────────────────────────────────────────────
  /** The Smithy's wallet: the mine's copper, silver and gold. */
  private wallet(): Wallet {
    const s = this.save;
    return { ...s.smithy, free: s.settings.devMode };
  }

  private walletHtml() {
    const s = this.save, w = this.wallet(), smiths = this.ctx.smiths(), free = this.freeSmiths();
    return `<p class="ledger-note chamber-wallet">${METALS.map((k) => `<b class="metal-${k}">${bal(s, w[k])}</b> ${k}`).join(" · ")}
      <span>· smiths <b id="training-slots">${smiths.length - free.length} / ${smiths.length}</b> busy</span><small> · a point of a metal from every ${BARS_PER_POINT} bars</small></p>`;
  }

  private forgeHtml(t: Topic) {
    const d = this.save.defend, w = this.wallet();
    const extras = t.extras?.includes("speed3")
      ? [`<article class="card defend-card ledger-card"><div><small>${d.speed3 ? "UNLOCKED" : "ONE-TIME UNLOCK"}</small><h3>War drums</h3><p>Adds 3× to the battle speed button.</p></div>
      <button data-buy-speed3 ${d.speed3 || !canAfford(w, SPEED3_PRICE) ? "disabled" : ""}>${d.speed3 ? "Owned" : `Buy<small>${priceText(SPEED3_PRICE)}</small>`}</button></article>`]
      : [];
    const levels = (t.upgrades ?? []).map((id) => {
      const u = UPGRADES.find((u) => u.id === id)!, lvl = d.levels[id], maxed = lvl >= u.maxLevel;
      const p = u.price ? u.price(lvl) : upgradePrice(lvl);
      return `<article class="card defend-card ledger-card ledger-level"><div><small>LEVEL ${lvl} / ${u.maxLevel}</small><h3>${u.name}</h3><p>${u.describe(lvl)}${maxed ? "" : `<b class="ledger-next">Next: ${u.describe(lvl + 1)}</b>`}</p></div>
        <button data-upgrade="${id}" ${maxed || !canAfford(w, p) ? "disabled" : ""}>${maxed ? "Maxed" : `Upgrade<small>${priceText(p)}</small>`}</button></article>`;
    });
    const smithy = t.training?.length ? this.smithyHtml(t.training) : "";
    const forged = levels.length || extras.length ? `<h4 class="training-group">On the anvil</h4>` : "";
    const body = [forged, ...levels, ...extras, smithy].join("");
    return body || `<p class="ledger-empty">Nothing to forge here.</p>`;
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
    root.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach((b) => (b.onclick = () => commit((w) => buyUpgrade(d, w, b.dataset.upgrade as UpgradeId), `[data-upgrade="${b.dataset.upgrade}"]`)));
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
      const why = maxed ? "" : busy && !active ? "Researchers are working on the current project" : missing.length ? `Needs ${missing.join(" and ")} first` : !available ? "Locked" : !canBuy ? `Needs ${price} Knowledge, have ${whole(save.knowledge)}` : "";
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
        const active = save.researchJob?.kind === "evolution" && save.researchJob.id === p.id;
        const why = save.researchJob ? "Researchers are working on the current project" : !researchers && !save.settings.instantResearch ? "Put a librarian to the alchemy lab to research" : !st.crownAffordable ? `Needs ${e.cost} Knowledge, have ${whole(save.knowledge)}` : "";
        action = active ? `<span data-research-timer>${this.researchTimeLeft()}</span>` : `<button data-evolve="${p.id}" ${why ? "disabled" : ""}>Evolve<small>${e.cost} Knowledge</small><small>${this.researchHint(st.rank, true)}</small></button>${why ? `<em>${why}.</em>` : ""}`;
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
      const active = save.researchJob?.kind === "path" && save.researchJob.id === p.id;
      const why = save.researchJob ? "Researchers are working on the current project" : !researchers && !save.settings.instantResearch ? "Put a librarian to the alchemy lab to research" : !st.affordable ? `Needs ${r.cost} Knowledge, have ${whole(save.knowledge)}` : "";
      action = active ? `<span data-research-timer>${this.researchTimeLeft()}</span>` : `<button data-learn-path="${p.id}" ${why ? "disabled" : ""}>${i === 0 ? "Choose" : "Learn"}<small>${r.cost} Knowledge</small><small>${this.researchHint(st.rank)}</small></button>${why ? `<em>${why}.</em>` : i === 0 ? `<em>Seals the other paths when this research completes.</em>` : ""}`;
    }
    return `<div class="path-detail hue-${p.hue}"><span class="path-medal"><canvas data-path-icon="${r.icon}:${p.hue}"></canvas></span>
      <div><small>${p.name.toUpperCase()} · RANK ${ROMAN[i]} OF ${ROMAN[p.ranks.length - 1]}</small><h3>${r.name}</h3><p>${r.text}.</p></div><div class="path-act">${action}</div></div>`;
  }

  private learnPath(id: PathId) {
    const p = pathById(id), first = !this.save.paths[p.topic];
    if (!startResearch(this.save, { kind: "path", id }, this.ctx.clock(), this.ctx.researchers())) return;
    if (this.save.researchJob) { this.ctx.update(); this.render(); return; }
    this.ctx.researched();
    play(first ? "unlock" : "chime");
    this.ctx.update();
    const rank = this.save.paths[p.topic]!.rank;
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
    if (!this.save.paths[topic]) return;
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
    if (completed) return this.render();
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
