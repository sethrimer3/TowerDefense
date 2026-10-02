import { play } from "../sound.ts";
import { TRAINING, TRAINING_GROUPS, TRAINING_PER_LEVEL, whole, buySkill, cancelTraining, levelForXp, skillPurchase, startTraining, trainingPoints, trainingSlots, trainingStep, type TrainingId } from "../progression.ts";
import { SKILLS, TREES, mapNodes, treeHeight, type SkillId, type SkillNode, type TreeId } from "../skill-trees.ts";
import { TreeParticles } from "../tree-particles.ts";
import { TrainingParticles } from "../training-particles.ts";
import { trainingJob, trainingSeconds } from "../training-jobs.ts";
import type { AppContext } from "./app.ts";
import { clamp, el, uiSprite, type UiSprite } from "./dom.ts";
import { bindPanZoom, type View } from "./pan-zoom.ts";

type Tree = (typeof TREES)[number];
const TREE_ICONS: Record<TreeId, UiSprite> = { command: "attack", stewardship: "defense", mine: "mine", library: "library" };
type PageTab = TreeId | "training";

/** Hours, minutes and seconds left, as the timers show them. */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** The Upgrades page: the Training table, or one skill tree at a time
 * (pannable and zoomable; tap a node to see its tooltip, tap it again to
 * buy a rank). Everything here strengthens the next defense. */
export class SkillTreePage {
  private tree: PageTab = "training";
  private skill: SkillId = "drillSergeant";
  private tooltipVisible = false;
  private views: Partial<Record<TreeId, View>> = {};
  private particles = new TreeParticles();
  private trainingParticles = new TrainingParticles();

  constructor(private ctx: AppContext) {}

  private get save() {
    return this.ctx.save();
  }

  render() {
    const save = this.save;
    const tabs = `<button data-tree="training" aria-pressed="${this.tree === "training"}"><span>${uiSprite("upgrades")}</span>Training<small>${trainingPoints(save).left} POINTS</small></button>` +
      TREES.map((t) => `<button data-tree="${t.id}" aria-pressed="${t.id === this.tree}"><span>${uiSprite(TREE_ICONS[t.id])}</span>${t.name}<small>${t.nodes.reduce((n, node) => n + save.skills[node.id], 0)} RANKS</small></button>`).join("");
    const head = `<div class="tree-tabs" role="group" aria-label="Skill trees">${tabs}</div>`;
    const bindTabs = () => document.querySelectorAll<HTMLButtonElement>("[data-tree]").forEach((b) => (b.onclick = () => {
      this.tree = b.dataset.tree as PageTab;
      this.tooltipVisible = false;
      this.render();
    }));
    if (this.tree === "training") {
      el("upgrades").innerHTML = head + this.trainingHtml();
      bindTabs();
      document.querySelectorAll<HTMLButtonElement>("[data-train]").forEach((b) => (b.onclick = () => {
        if (startTraining(this.save, b.dataset.train as TrainingId, this.ctx.clock())) {
          this.ctx.update();
          play("coin");
        }
        this.render();
      }));
      document.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((b) => (b.onclick = () => {
        if (cancelTraining(this.save, b.dataset.cancel as TrainingId)) this.ctx.update();
        this.render();
      }));
      return;
    }
    const tree = this.current(), view = this.view(tree.id), nodes = mapNodes(tree);
    const lines = nodes.flatMap((n) => n.requires.map((id) => {
      const parent = nodes.find((p) => p.id === id);
      return parent ? `<line x1="${parent.x}" y1="${parent.y}" x2="${n.x}" y2="${n.y}" class="${save.skills[id] ? "lit" : ""}"/>` : "";
    })).join("");
    el("upgrades").innerHTML = `${head}
      <section class="skill-tree ${tree.id}"><header class="tree-heading"><h3>${tree.name}</h3><small>${tree.description}</small></header>
      <div class="tree-viewport" id="tree-viewport"><div class="tree-map" id="tree-map" style="${treeHeight(tree) === 100 ? "" : `height:${treeHeight(tree)}%;`}transform:translate(${view.x}px,${view.y}px) scale(${view.scale})"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      <canvas class="tree-particles" aria-hidden="true"></canvas>
      ${nodes.map((n) => this.nodeHtml(n)).join("")}</div>${nodes.length ? "" : `<p class="tree-empty">No skills to learn here yet.</p>`}<div class="inspect-box tree-tooltip" id="tree-tooltip" hidden></div></div></section>`;
    bindTabs();
    bindPanZoom(el("tree-viewport"), el("tree-map"), view, {
      tap: (target) => this.tapped(target),
      pan: () => this.hideTooltip(),
      zoom: () => { if (this.tooltipVisible) this.showTooltip(); },
    });
    if (this.tooltipVisible && tree.nodes.some((n) => n.id === this.skill)) this.showTooltip();
  }

  /** Each row's percent now and after one more rank, and what that costs;
   * tap the cost to train it. */
  private trainingHtml() {
    const save = this.save, points = trainingPoints(save), slots = trainingSlots(save);
    const row = (t: (typeof TRAINING)[number]) => {
      const { now, next, affordable, maxed } = trainingStep(save, t.id);
      const price = `${t.cost} ${t.cost === 1 ? "point" : "points"}`;
      const job = trainingJob(save.trainingJobs, t.id), full = save.trainingJobs.length >= slots;
      const takes = formatDuration(trainingSeconds(save.training[t.id]) * 1000);
      const shown = (v: number) => `+${v}%`;
      const buy = job
        ? `<button class="training-box training-timer" data-cancel="${t.id}" aria-label="Training ${t.name}: tap to cancel and get the points back" title="Tap to cancel and get the points back"><span data-training-timer="${t.id}">${formatDuration(job.completesAt - this.ctx.clock())}</span></button>`
        : maxed
        ? `<button class="training-box training-cost" disabled aria-label="${t.name} is fully trained">Max</button>`
        : `<button class="training-box training-cost" data-train="${t.id}" ${affordable && !full ? "" : "disabled"} aria-label="Train ${t.name} to ${shown(next)} for ${price}, taking ${takes}" title="${full ? "Every training slot is busy" : `Takes ${takes}`}">${price}</button>`;
      return `<div class="training-row${job ? " active" : ""}" role="listitem" data-training-row="${t.id}"><span class="training-label">${t.name}<small>+${t.per}% a rank, up to ${t.max * t.per}%${maxed ? "" : ` · takes ${takes}`}</small></span><span class="training-box">${shown(now)}</span><span class="training-arrow" aria-hidden="true">→</span><span class="training-box next">${shown(next)}</span>${buy}</div>`;
    };
    const rows = (Object.entries(TRAINING_GROUPS) as [keyof typeof TRAINING_GROUPS, string][])
      .map(([group, name]) => `<h4 class="training-group">${name}</h4>${TRAINING.filter((t) => t.group === group).map(row).join("")}`)
      .join("");
    return `<section class="training"><canvas class="training-particles" aria-hidden="true"></canvas><header class="tree-heading"><h3>Training</h3></header>
      <p class="training-points">Training points: <b id="training-points">${points.left}</b> <small>· ${TRAINING_PER_LEVEL} each Commander level (level ${levelForXp(save.xp)}) · kills earn experience</small></p>
      <p class="training-points training-slots">Training slots: <b id="training-slots">${save.trainingJobs.length} / ${slots}</b> <small>· each rank trained takes 50% longer than the last</small></p>
      <div class="training-table" role="list" aria-label="Training">${rows}</div></section>`;
  }

  /** Once a second while the page shows: the whole page once a rank
   * completes, else the countdowns. */
  tick(completed: boolean) {
    if (completed) return this.render();
    if (this.tree !== "training") return;
    const now = this.ctx.clock();
    for (const job of this.save.trainingJobs) {
      const span = document.querySelector<HTMLElement>(`[data-training-timer="${job.id}"]`);
      if (span) span.textContent = formatDuration(job.completesAt - now);
    }
  }

  /** Purchase sparkles and node glow on the particle canvas, if showing. */
  drawParticles(time: number) {
    const reduced = this.save.settings.reduceMotion;
    if (this.tree === "training") {
      const canvas = document.querySelector<HTMLCanvasElement>(".training-particles");
      if (!canvas) return;
      const top = canvas.getBoundingClientRect().top;
      const lanes = Array.from(document.querySelectorAll<HTMLElement>(".training-row.active")).map((row) => {
        const r = row.getBoundingClientRect();
        return r.top + r.height / 2 - top;
      });
      return this.trainingParticles.draw(canvas, time, { lanes, reduced });
    }
    const canvas = document.querySelector<HTMLCanvasElement>(".tree-particles");
    if (!canvas) return;
    const tree = this.current();
    this.particles.draw(canvas, time, { tree: tree.id, nodes: mapNodes(tree), selected: this.tooltipVisible ? this.skill : null, reduced });
  }

  private current(): Tree {
    return TREES.find((t) => t.id === this.tree) ?? TREES[0];
  }
  private view(id: TreeId) {
    return (this.views[id] ??= { x: 0, y: 0, scale: 1 });
  }

  private nodeHtml(n: SkillNode) {
    const skill = SKILLS[n.id], { level, available } = skillPurchase(this.save, n.id);
    const chosen = n.id === this.skill && this.tooltipVisible;
    return `<button class="skill-node ${level ? "owned" : ""} ${available ? "available" : "locked"} ${chosen ? "chosen" : ""}" data-skill="${n.id}" style="left:${n.x}%;top:${n.y}%" aria-label="${skill.name}, ${level} of ${skill.max}${available ? "" : ", locked"}" aria-pressed="${chosen}"><span class="node-icon">${skill.icon}</span><span class="node-name">${skill.name}</span><small>${level} / ${skill.max}</small></button>`;
  }

  private tapped(target: HTMLElement | null) {
    const node = target?.closest<HTMLElement>("[data-skill]");
    if (node) this.tapSkill(node.dataset.skill as SkillId);
    else this.hideTooltip();
  }

  private tapSkill(id: SkillId) {
    if (!(this.skill === id && this.tooltipVisible)) {
      this.skill = id;
      this.tooltipVisible = true;
      this.render();
      return;
    }
    const level = this.save.skills[id];
    if (buySkill(this.save, id)) {
      play(level === 0 ? "unlock" : "chime");
      if (!this.save.settings.reduceMotion) {
        // The first rank unlocks the node: it shines as well as bursting.
        const node = mapNodes(this.current()).find((n) => n.id === id)!;
        if (level === 0) this.particles.unlock(node);
        else this.particles.purchase(node);
      }
      this.ctx.update();
    }
    this.render();
  }

  private tooltipHtml(id: SkillId): string {
    const node = this.current().nodes.find((n) => n.id === id)!, skill = SKILLS[id], save = this.save;
    const { level, price, maxed, available, canBuy } = skillPurchase(save, id);
    const requirements = node.requires.filter((rid) => !save.skills[rid]).map((rid) => SKILLS[rid].name);
    let hint: string;
    if (maxed) hint = "Mastered.";
    else if (requirements.length) hint = `Requires: ${requirements.join(" + ")} (one rank each).`;
    else if (!available) hint = "Locked.";
    else if (!canBuy) hint = `Need ${price} Knowledge · have ${whole(save.knowledge)}.`;
    else hint = "Tap again to purchase.";
    return `<b style="color:var(--tree-color)">${skill.name}</b><div>${level} / ${skill.max} ranks</div><div>${skill.text}.</div><div class="${canBuy ? "safe" : ""}">${hint}</div>${maxed ? "" : `<div>Cost: ${price} Knowledge</div>`}`;
  }

  /** Above the selected node, or below it when there is no room above. */
  private showTooltip() {
    const nodeEl = document.querySelector<HTMLElement>(`[data-skill="${this.skill}"]`);
    if (!nodeEl) return;
    const tooltip = el("tree-tooltip");
    tooltip.innerHTML = this.tooltipHtml(this.skill);
    tooltip.hidden = false;
    const viewportRect = el("tree-viewport").getBoundingClientRect(),
      nodeRect = nodeEl.getBoundingClientRect(),
      tooltipRect = tooltip.getBoundingClientRect();
    const left = clamp(nodeRect.left - viewportRect.left + nodeRect.width / 2 - tooltipRect.width / 2, 4, viewportRect.width - tooltipRect.width - 4);
    let top = nodeRect.top - viewportRect.top - tooltipRect.height - 8;
    if (top < 4) top = nodeRect.bottom - viewportRect.top + 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  private hideTooltip() {
    if (!this.tooltipVisible) return;
    this.tooltipVisible = false;
    const tooltip = document.getElementById("tree-tooltip");
    if (tooltip) tooltip.hidden = true;
  }
}
