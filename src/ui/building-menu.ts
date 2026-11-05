/** The building menu: a square frame of oak bars opened round a placed
 * building on the board (a square take on a radial menu), the building
 * showing through its open middle. Top middle: the upgrade tree. Left: the
 * targeting modes. Right: the range slider (10% to 100% in 5% steps) and,
 * below it, the rally flag (troop buildings) or target crosshairs
 * (shooting buildings), crossed out in red once placed. Bottom middle:
 * Remove (back to the palette in Defend, sold for gold in Ambush).
 *
 * Presentation only: `buildingMenuHtml` returns markup with `data-bm`
 * hooks for the page to wire, `buildingMenuBox` says where it stands, and
 * `setMenuRange` updates the slider's readout. Nothing here reads or
 * changes a battle or save. */
import { t } from "../i18n/index.ts";
import { menuIconImg, type MenuIcon } from "./building-menu-icons.ts";

/** How a shooting building or a troop building picks its target. */
export const TARGET_MODES = ["closest", "first", "strongest", "weakest", "groups"] as const;
export type TargetMode = (typeof TARGET_MODES)[number];

/** The range slider's bounds and step, in percent. */
export const MENU_RANGE = { min: 10, max: 100, step: 5 } as const;

/** What the menu offers: a shooting building's modes, slider and
 * crosshairs; a troop building's modes, slider and rally flag; or only the
 * tree and remove for everything else. */
export type MenuControls = "shooter" | "troops" | "plain";

export type BuildingMenuSpec = {
  controls: MenuControls;
  /** The building's name, for the menu's label. */
  name: string;
  mode?: TargetMode;
  /** The range limit in percent (snapped to `MENU_RANGE`). */
  range?: number;
  /** Whether its rally flag or crosshairs are placed (the button shows them crossed out). */
  aimSet?: boolean;
  /** Whether the upgrade tree button shows (default true). */
  tree?: boolean;
  /** The building's next upgrades, shown on the top bar in place of the
   * tree button (Ambush), each with its cost above it. */
  upgrades?: MenuUpgrade[];
  /** The remove button: back to the palette, sold for gold, or none. */
  remove?: { kind: "inventory" } | { kind: "sell"; gold: number } | null;
  /** Why remove can't be pressed now, if it can't (shown as its tooltip). */
  removeBlocked?: string;
};

/** An upgrade offered on the menu's top bar: `id` its hook
 * (`data-bm-upgrade`), `face` its sprite's markup, `cost` in gold. `picked`
 * marks the one tapped once (tap again to buy); `locked` one that can't be
 * bought for another reason than gold. */
export type MenuUpgrade = { id: string; face: string; label: string; cost: number; picked?: boolean; locked?: boolean };

/** Room kept above the menu for the upgrades' costs, in CSS pixels. */
export const MENU_COST_ROOM = 18;

/** The menu's size on screen: `bar` the oak bars' thickness, `min` the
 * smallest square a menu with controls is. */
export const MENU_SIZE = {
  desktop: { bar: 52, min: 316 },
  phone: { bar: 44, min: 284 },
  /** Below this view width the phone sizes apply. */
  phoneBelow: 560,
  /** Pixels kept clear of the view's edges. */
  margin: 8,
};

/** Where the menu stands round a building at `rect` (CSS pixels in the
 * board's view, `view` its size): a square centred on it, its open middle
 * at least as big as the building, shifted inward to stay on screen. */
export function buildingMenuBox(rect: { x: number; y: number; w: number; h: number }, view: { w: number; h: number }, controls: MenuControls, headroom = 0) {
  const s = view.w < MENU_SIZE.phoneBelow ? MENU_SIZE.phone : MENU_SIZE.desktop;
  const hole = Math.ceil(Math.max(rect.w, rect.h) + 8);
  const fit = Math.min(view.w, view.h) - 2 * MENU_SIZE.margin;
  const size = Math.min(Math.max(hole + 2 * s.bar, controls === "plain" ? 0 : s.min), Math.max(fit, 3 * s.bar));
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const clamp = (v: number, span: number, low = MENU_SIZE.margin) => Math.min(Math.max(v, low), Math.max(low, span - size - MENU_SIZE.margin));
  return { left: Math.round(clamp(cx - size / 2, view.w)), top: Math.round(clamp(cy - size / 2, view.h, MENU_SIZE.margin + headroom)), size: Math.round(size), bar: s.bar };
}

/** `percent` snapped onto the slider's steps. */
export const snapRange = (percent: number) =>
  Math.min(MENU_RANGE.max, Math.max(MENU_RANGE.min, Math.round(percent / MENU_RANGE.step) * MENU_RANGE.step));

const MODE_ICON: Record<TargetMode, MenuIcon> = { closest: "closest", first: "first", strongest: "strongest", weakest: "weakest", groups: "groups" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const button = (hook: string, icon: MenuIcon, label: string, extra = "") =>
  `<button type="button" class="bm-button" ${hook} title="${esc(label)}" aria-label="${esc(label)}"${extra}>${menuIconImg(icon)}</button>`;

/** The menu's markup; place it with `buildingMenuBox` (`left`, `top`,
 * `size` and `bar` as the root's style). Hooks: `data-bm="tree"`,
 * `"remove"`, `"aim"`, `"range"` (the slider), and `data-bm-mode` on each
 * mode button. */
export function buildingMenuHtml(spec: BuildingMenuSpec): string {
  const tree = spec.upgrades
    ? `<div class="bm-upgrades">${spec.upgrades.map((u) =>
        `<span class="bm-upgrade${u.locked ? " locked" : ""}" data-cost="${u.cost}"><span class="bm-cost" aria-hidden="true">${u.cost}</span>` +
        `<button type="button" class="bm-button" data-bm-upgrade="${esc(u.id)}" title="${esc(u.label)}" aria-label="${esc(t("menu.upgrade", { name: u.label, gold: u.cost }))}" aria-pressed="${!!u.picked}">${u.face}</button></span>`).join("")}</div>`
    : spec.tree !== false ? button('data-bm="tree"', "tree", t("menu.tree")) : "";
  const remove = spec.remove
    ? button('data-bm="remove"', spec.remove.kind === "sell" ? "sell" : "inventory",
        spec.remove.kind === "sell" ? t("menu.sell", { gold: spec.remove.gold }) : t("menu.inventory"),
        spec.removeBlocked ? ` disabled data-blocked="${esc(spec.removeBlocked)}"` : "") +
      (spec.remove.kind === "sell" ? `<span class="bm-price" aria-hidden="true">${spec.remove.gold}</span>` : "")
    : "";
  let left = "", right = "", corner = "";
  if (spec.controls !== "plain") {
    const mode = spec.mode ?? "closest";
    left = `<div class="bm-modes" role="radiogroup" aria-label="${esc(t("menu.targeting"))}">` +
      TARGET_MODES.map((m) => button(`data-bm-mode="${m}"`, MODE_ICON[m], t(`menu.mode.${m}`), ` role="radio" aria-checked="${m === mode}"`)).join("") + `</div>`;
    const range = snapRange(spec.range ?? 100);
    right = `<label class="bm-range"><span class="bm-range-value" data-bm="range-value">${range}%</span>` +
      `<input type="range" data-bm="range" min="${MENU_RANGE.min}" max="${MENU_RANGE.max}" step="${MENU_RANGE.step}" value="${range}" aria-label="${esc(t("menu.range"))}" style="--fill:${rangeFill(range)}%"></label>`;
    const troops = spec.controls === "troops";
    const icon: MenuIcon = troops ? (spec.aimSet ? "flagClear" : "flag") : spec.aimSet ? "crosshairClear" : "crosshair";
    const label = troops ? (spec.aimSet ? t("menu.flagClear") : t("menu.flag")) : spec.aimSet ? t("menu.crosshairClear") : t("menu.crosshair");
    corner = button('data-bm="aim"', icon, label, ` aria-pressed="${!!spec.aimSet}"`);
  }
  return `<div class="building-menu" data-controls="${spec.controls}" role="dialog" aria-label="${esc(spec.name)}">` +
    `<div class="bm-bar bm-top"><span class="bm-name">${esc(spec.name)}</span>${tree}</div>` +
    `<div class="bm-bar bm-left">${left}</div>` +
    `<div class="bm-hole" aria-hidden="true"></div>` +
    `<div class="bm-bar bm-right">${right}${corner ? `<div class="bm-aim">${corner}</div>` : ""}</div>` +
    `<div class="bm-bar bm-bottom">${remove}</div>` +
    `</div>`;
}

/** How far up the slider's brass fill reaches, in percent of its track. */
const rangeFill = (range: number) => ((range - MENU_RANGE.min) / (MENU_RANGE.max - MENU_RANGE.min)) * 100;

/** Shows the slider's `range` (percent) in its readout and fill. */
export function setMenuRange(menu: HTMLElement, range: number) {
  const r = snapRange(range);
  const input = menu.querySelector<HTMLInputElement>('[data-bm="range"]');
  const value = menu.querySelector<HTMLElement>('[data-bm="range-value"]');
  if (input) {
    input.value = String(r);
    input.style.setProperty("--fill", `${rangeFill(r)}%`);
  }
  if (value) value.textContent = `${r}%`;
}

/** How the mode's name types out beside its button: a letter every
 * `letter` ms, held `hold` ms once whole, then faded out (CSS). */
export const MODE_NAME = { letter: 45, hold: 1100 };
const typing = new WeakMap<HTMLElement, number[]>();

/** Pops the targeting mode's `name` up to the right of its `button` in
 * gold with a black pixel outline, one letter at a time (all at once when
 * `reduced`), then fades it away. A new pick replaces the last. */
export function typeModeName(menu: HTMLElement, button: HTMLElement, name: string, reduced: boolean) {
  for (const id of typing.get(menu) ?? []) clearTimeout(id);
  const modes = button.closest<HTMLElement>(".bm-modes") ?? menu;
  modes.querySelector(".bm-mode-name")?.remove();
  const tag = document.createElement("span");
  tag.className = "bm-mode-name";
  tag.setAttribute("aria-hidden", "true");
  tag.style.top = `${button.offsetTop + button.offsetHeight / 2}px`;
  modes.append(tag);
  const timers: number[] = [];
  const letters = Array.from(name);
  if (reduced) tag.textContent = name;
  else letters.forEach((_, i) => timers.push(window.setTimeout(() => { tag.textContent = letters.slice(0, i + 1).join(""); }, i * MODE_NAME.letter)));
  const whole = reduced ? 0 : letters.length * MODE_NAME.letter;
  timers.push(window.setTimeout(() => tag.classList.add("fading"), whole + MODE_NAME.hold));
  timers.push(window.setTimeout(() => tag.remove(), whole + MODE_NAME.hold + 400));
  typing.set(menu, timers);
}

/** Marks each top bar upgrade the wallet's `gold` can't pay for (its cost shown red). */
export function setMenuGold(menu: HTMLElement, gold: number) {
  for (const u of Array.from(menu.querySelectorAll<HTMLElement>(".bm-upgrade[data-cost]"))) {
    const short = Number(u.dataset.cost) > gold;
    if (u.classList.contains("short") !== short) u.classList.toggle("short", short);
  }
}

/** Positions `menu` (the `.building-menu` element) by `box`. */
export function placeBuildingMenu(menu: HTMLElement, box: ReturnType<typeof buildingMenuBox>) {
  menu.style.left = `${box.left}px`;
  menu.style.top = `${box.top}px`;
  menu.style.width = menu.style.height = `${box.size}px`;
  menu.style.setProperty("--bm-bar", `${box.bar}px`);
}
