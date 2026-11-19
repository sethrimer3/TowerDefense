/** The building panel: an oak board that slides in at the side of the
 * battle board while a placed building is picked, in place of the square
 * menu round it (`placed-building-menu.ts`, now Settings' Controls round
 * the building). It stands on the right, or on the left when the right
 * would cover the building. Top to bottom: the building's name, its
 * portrait, its kills this battle, the targeting modes, the range slider,
 * the rally flag or crosshairs, then Upgrades and Remove. Upgrades opens
 * a small tree inside the panel: what the building has climbed, a button
 * for each next upgrade, Downgrade, and the whole tree.
 *
 * The host owns saves and battle rules, as with the square menu; this
 * controller owns no animation loop (`position` runs in the page's frame). */
import { t } from "../i18n/index.ts";
import { TARGET_MODES, MENU_RANGE, snapRange, setMenuRange, type MenuControls, type TargetMode } from "./building-menu.ts";
import { menuIconImg, type MenuIcon } from "./building-menu-icons.ts";
import { paintIcon, type IconItem } from "../defend/structure-art.ts";
import { paintPathIcons } from "./path-badge.ts";
import { iconCanvas, installCurrencyArt } from "./currency-icons.ts";
import { controlsOf, aimPoint } from "../defend/building-controls.ts";
import { center } from "../defend/pathing.ts";
import type { PlacedMenuHost } from "./placed-building-menu.ts";
import type { Building } from "../defend/citygen.ts";
import type { BuildingOrders } from "../defend/building-orders.ts";

/** One node of the panel's small tree: `face` its sprite's markup. */
export type PanelNode = { id: string; face: string; name: string; cost: number; can: boolean };
/** The panel's small tree for a building: what it has climbed (its basic
 * building first), the upgrades open to it next, and what a downgrade
 * gives back (absent at its basic building). `live` while upgrades can be
 * bought (Defend's build phase), and `have` the player's Knowledge. */
export type PanelTree = {
  climbed: Omit<PanelNode, "cost" | "can">[]; next: PanelNode[]; back?: number; live: boolean;
  /** The player's Knowledge, shown beside each cost (Infinity with unlimited money). */
  have: number;
};
/** The portrait: the palette icon and the path look it wears. */
export type PanelPortrait = { icon: IconItem; look?: string; badge?: string };

export type BuildingPanelHost = PlacedMenuHost & {
  portrait(b: Building): PanelPortrait;
  /** The building's kills this battle; undefined hides the row (no battle). */
  kills(b: Building): number | undefined;
  /** The small tree, or null when Upgrades should open the whole tree. */
  panelTree(b: Building): PanelTree | null;
  buy(b: Building, id: string): void;
  downgrade(b: Building): void;
};

/** The panel's width on screen: `phoneBelow` view widths take `phone`. */
export const PANEL_SIZE = { desktop: 200, phone: 148, phoneBelow: 560, margin: 8 };

const MODE_ICON: Record<TargetMode, MenuIcon> = { closest: "closest", first: "first", strongest: "strongest", weakest: "weakest", groups: "groups" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** A Knowledge amount, short past ten thousand. */
export const knowledgeText = (n: number) => `${n >= 10000 ? `${Number((n / 1000).toFixed(1))}k` : n.toLocaleString("en")}✦`;

export type PanelSpec = {
  controls: MenuControls;
  name: string;
  portrait: PanelPortrait;
  kills?: number;
  mode?: TargetMode;
  range?: number;
  aimSet?: boolean;
  remove: boolean;
  tree?: PanelTree | null;
  /** The small tree shows in place of the controls. */
  treeOpen?: boolean;
};

/** The small tree's markup. */
export function panelTreeHtml(tree: PanelTree, back = ""): string {
  const climbed = tree.climbed.map((n, i) =>
    `${i ? '<span class="bp-link" aria-hidden="true"></span>' : ""}<span class="bp-climbed${i === tree.climbed.length - 1 ? " bp-here" : ""}" title="${esc(n.name)}">${n.face}</span>`).join("");
  const have = `<span class="bp-have">(${iconCanvas("knowledge")}${Number.isFinite(tree.have) ? tree.have.toLocaleString("en") : "∞"})</span>`;
  const next = tree.next.map((n) =>
    `<button type="button" class="bp-next" data-bp-buy="${esc(n.id)}" ${tree.live && n.can ? "" : "disabled"} aria-label="${esc(t("panel.buy", { name: n.name, cost: knowledgeText(n.cost) }))}">` +
    `<span class="bp-next-face">${n.face}</span><span class="bp-next-name">${esc(n.name)}</span><span class="bp-costs"><span class="bp-cost${n.can ? "" : " short"}">${n.cost ? knowledgeText(n.cost) : t("panel.free")}</span>${have}</span></button>`).join("");
  const down = tree.back !== undefined
    ? `<button type="button" class="bp-down" data-bp="downgrade" ${tree.live ? "" : "disabled"}><span>${t("panel.downgrade")}</span><span class="bp-cost">+${knowledgeText(tree.back)}</span></button>`
    : "";
  return `<div class="bp-path-row">${back}<div class="bp-path">${climbed}</div></div>` +
    `<div class="bp-nexts">${next || `<span class="bp-max">${t("panel.max")}</span>`}</div>` + down +
    `<button type="button" class="bp-full" data-bp="tree">${menuIconImg("tree")}<span>${t("panel.fullTree")}</span></button>`;
}

/** The panel's markup. Hooks: `data-bp="close" | "upgrades" | "back" |
 * "remove" | "aim" | "downgrade" | "tree"`, `data-bp-mode`, `data-bp-buy`,
 * and the range slider's `data-bm="range"` (as the square menu's, so
 * `setMenuRange` updates it). */
export function buildingPanelHtml(spec: PanelSpec): string {
  const p = spec.portrait;
  let controls = "";
  if (spec.controls !== "plain") {
    const mode = spec.mode ?? "closest", range = snapRange(spec.range ?? 100), troops = spec.controls === "troops";
    const fill = ((range - MENU_RANGE.min) / (MENU_RANGE.max - MENU_RANGE.min)) * 100;
    const icon: MenuIcon = troops ? (spec.aimSet ? "flagClear" : "flag") : spec.aimSet ? "crosshairClear" : "crosshair";
    const aim = troops ? (spec.aimSet ? t("menu.flagClear") : t("menu.flag")) : spec.aimSet ? t("menu.crosshairClear") : t("menu.crosshair");
    controls =
      `<div class="bp-modes" role="radiogroup" aria-label="${esc(t("menu.targeting"))}">` +
      TARGET_MODES.map((m) => `<button type="button" class="bp-icon" data-bp-mode="${m}" role="radio" aria-checked="${m === mode}" title="${esc(t(`menu.mode.${m}`))}" aria-label="${esc(t(`menu.mode.${m}`))}">${menuIconImg(MODE_ICON[m])}</button>`).join("") +
      `</div><p class="bp-mode-name" data-bp="mode-name">${esc(t(`menu.mode.${mode}`))}</p>` +
      `<label class="bp-range"><span>${t("menu.range")}</span><input type="range" data-bm="range" min="${MENU_RANGE.min}" max="${MENU_RANGE.max}" step="${MENU_RANGE.step}" value="${range}" aria-label="${esc(t("menu.range"))}" style="--fill:${fill}%"><span data-bm="range-value">${range}%</span></label>` +
      `<button type="button" class="bp-aim" data-bp="aim" aria-pressed="${!!spec.aimSet}">${menuIconImg(icon)}<span>${esc(aim)}</span></button>`;
  }
  const actions =
    `<div class="bp-actions"><button type="button" class="bp-upgrades" data-bp="upgrades" aria-expanded="${!!spec.treeOpen}">${menuIconImg("tree")}<span>${t("panel.upgrades")}</span></button>` +
    (spec.remove ? `<button type="button" class="bp-remove danger" data-bp="remove">${menuIconImg("inventory")}<span>${t("panel.remove")}</span></button>` : "") + `</div>`;
  const body = spec.treeOpen && spec.tree
    ? `<section class="bp-tree" aria-label="${esc(t("menu.tree"))}">${panelTreeHtml(spec.tree, `<button type="button" class="bp-back" data-bp="back" aria-label="${esc(t("panel.back"))}">&lt;</button>`)}</section>`
    : controls + actions;
  return `<aside class="building-panel${spec.treeOpen ? " tree-open" : ""}" data-controls="${spec.controls}" data-side="right" role="dialog" aria-label="${esc(spec.name)}">` +
    `<header class="bp-head"><strong class="bp-name">${esc(spec.name)}</strong><button type="button" class="bp-close" data-bp="close" aria-label="${esc(t("panel.close"))}">×</button></header>` +
    `<div class="bp-portrait"><canvas width="96" height="96" data-icon="${p.icon}"${p.look ? ` data-look="${p.look}"` : ""}></canvas>${p.badge ?? ""}</div>` +
    `<p class="bp-kills" data-bp="kills-row"${spec.kills === undefined ? " hidden" : ""}><span>${t("panel.kills")}</span><b data-bp="kills">${spec.kills ?? 0}</b></p>` +
    body + `</aside>`;
}

/** Which side the panel stands on, given the building's span `x0`–`x1`
 * across a board `width` wide and the panel's own `w`: the right, unless it
 * would cover the building there and the left would not (`was` is kept
 * when both would). */
export function panelSide(x0: number, x1: number, width: number, w: number, was: "left" | "right" = "right"): "left" | "right" {
  const m = PANEL_SIZE.margin;
  if (x1 <= width - m - w) return "right";
  if (x0 >= m + w) return "left";
  return was;
}

const reducedMotion = () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;

export class BuildingPanel {
  element: HTMLElement | null = null;
  building: Building | null = null;
  placing = false;
  private controls: MenuControls = "plain";
  private side: "left" | "right" = "right";
  /** The structure whose small tree is open, kept through the redraw an upgrade brings. */
  private treeFor: number | undefined;
  private kills: number | undefined;
  constructor(private host: BuildingPanelHost) {}
  show(b: Building) {
    const same = this.building?.id === b.id || (b.structureUid !== undefined && this.building?.structureUid === b.structureUid);
    const treeOpen = same && this.treeFor !== undefined && this.treeFor === (b.structureUid ?? -1 - b.id);
    this.clear();
    if (!same) this.side = "right";
    this.building = b;
    this.placing = false;
    const source = this.host.source(), o = this.host.orders(b), spec = this.host.spec(b);
    this.controls = controlsOf(b, source);
    const tree = treeOpen ? this.host.panelTree(b) : undefined;
    this.treeFor = treeOpen && tree ? (b.structureUid ?? -1 - b.id) : undefined;
    this.kills = this.host.kills(b);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildingPanelHtml({
      controls: this.controls, name: spec.name, portrait: this.host.portrait(b), kills: this.kills,
      mode: o.targetMode, range: o.rangePercent, aimSet: !!(this.controls === "troops" ? o.rally : o.crosshair),
      remove: !!spec.remove, tree, treeOpen: !!tree,
    });
    const el = (this.element = wrapper.firstElementChild as HTMLElement);
    for (const c of Array.from(el.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]"))) paintIcon(c, c.dataset.icon as IconItem);
    paintPathIcons(el);
    installCurrencyArt(el);
    if (!same && !reducedMotion()) el.classList.add("opening");
    this.host.board().append(el);
    el.onpointerdown = (e) => e.stopPropagation();
    el.onclick = (e) => this.click(b, el, e);
    const slider = el.querySelector<HTMLInputElement>('[data-bm="range"]');
    if (slider)
      slider.oninput = () => {
        const percent = snapRange(Number(slider.value)), next = { ...this.host.orders(b) };
        if (percent === 100) delete next.rangePercent;
        else next.rangePercent = percent;
        this.host.change(b, next);
        setMenuRange(el, percent);
      };
    this.position();
  }
  private click(b: Building, el: HTMLElement, e: MouseEvent) {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    const hook = button.dataset.bp;
    if (button.dataset.bpMode) {
      const next = { ...this.host.orders(b) };
      if (button.dataset.bpMode === "closest") delete next.targetMode;
      else next.targetMode = button.dataset.bpMode as BuildingOrders["targetMode"];
      this.host.change(b, next);
      for (const radio of Array.from(el.querySelectorAll<HTMLElement>("[data-bp-mode]"))) radio.setAttribute("aria-checked", String(radio === button));
      const name = el.querySelector<HTMLElement>('[data-bp="mode-name"]');
      if (name) name.textContent = button.getAttribute("aria-label") ?? "";
      return;
    }
    if (button.dataset.bpBuy) return this.host.buy(b, button.dataset.bpBuy);
    if (hook === "close") return this.dismiss();
    if (hook === "remove") { this.dismiss(false); return this.host.remove(b); }
    if (hook === "tree") { this.dismiss(false); return this.host.tree(b); }
    if (hook === "downgrade") return this.host.downgrade(b);
    if (hook === "back") { this.treeFor = undefined; return this.show(b); }
    if (hook === "upgrades") {
      if (!this.host.panelTree(b)) { this.dismiss(false); return this.host.tree(b); }
      this.treeFor = b.structureUid ?? -1 - b.id;
      return this.show(b);
    }
    if (hook === "aim") {
      if (this.placing) return this.show(b);
      const key = this.controls === "troops" ? "rally" : "crosshair", next = { ...this.host.orders(b) };
      if (next[key]) { delete next[key]; this.host.change(b, next); this.show(b); }
      else { this.placing = true; el.classList.add("placing"); button.setAttribute("aria-pressed", "true"); }
    }
  }
  /** Returns true when the board tap was taken by placing the flag or crosshairs. */
  tap(at: { x: number; y: number }) {
    const b = this.building;
    if (!this.placing || !b) return false;
    const p = aimPoint(b, this.host.source(), this.host.map(), at), c = center(b.rect);
    this.host.change(b, { ...this.host.orders(b), [this.controls === "troops" ? "rally" : "crosshair"]: { x: p.x - c.x, y: p.y - c.y } });
    this.show(b);
    return true;
  }
  escape() {
    if (this.placing && this.building) this.show(this.building);
    else this.dismiss();
  }
  private clear() {
    this.element?.remove();
    this.element = null;
    this.building = null;
    this.placing = false;
  }
  dismiss(notify = true) {
    this.clear();
    this.treeFor = undefined;
    if (notify) this.host.closed();
  }
  /** Keeps the panel off the building (each frame) and its kills current. */
  position() {
    const el = this.element, b = this.building;
    if (!el || !b) return;
    const kills = this.host.kills(b);
    if (kills !== this.kills) {
      this.kills = kills;
      const row = el.querySelector<HTMLElement>('[data-bp="kills-row"]'), count = el.querySelector<HTMLElement>('[data-bp="kills"]');
      if (row) row.hidden = kills === undefined;
      if (count) count.textContent = String(kills ?? 0);
    }
    const renderer = this.host.renderer(), board = this.host.board().getBoundingClientRect();
    const a = renderer.toClient(b.rect.x, b.rect.y), z = renderer.toClient(b.rect.x + b.rect.w, b.rect.y + b.rect.h);
    const side = panelSide(a.x - board.left, z.x - board.left, board.width, el.offsetWidth || PANEL_SIZE.desktop, this.side);
    if (side !== this.side || el.dataset.side !== side) {
      this.side = side;
      el.dataset.side = side;
    }
  }
}

/** The page's controls for a picked building: the square menu round it or
 * the side panel, whichever Settings chose. */
export type PickedControls = {
  element: HTMLElement | null;
  building: Building | null;
  /** Waiting for a board tap to place the rally flag or crosshairs. */
  placing: boolean;
  show(b: Building): void;
  dismiss(notify?: boolean): void;
  position(): void;
  tap(at: { x: number; y: number }): boolean;
  escape(): void;
};
