import { paintTabIcon, tabIconHtml } from "./tab-icons.ts";
import { uiSprite } from "./dom.ts";
import { t } from "../i18n/index.ts";
import { modeIconUrl } from "./mode-icons.ts";

export const COMBAT_MODES = ["defend", "ambush", "siege"] as const;
export type CombatMode = typeof COMBAT_MODES[number];
export const nextCombatMode = (mode: CombatMode): CombatMode => COMBAT_MODES[(COMBAT_MODES.indexOf(mode) + 1) % COMBAT_MODES.length];
export const combatLabel = (mode: CombatMode, active: boolean) =>
  `${t(`nav.${mode}`)}${active ? ` --> ${t(`nav.${nextCombatMode(mode)}`)}` : ""}`;

/** Current art by default; the chosen legacy set is an explicit preference. */
export function combatIcon(mode: CombatMode, legacy = false) {
  if (legacy) return tabIconHtml(mode);
  if (mode === "defend") return uiSprite("defend");
  return `<img class="ui-sprite" src="${modeIconUrl(mode)}" alt="" aria-hidden="true">`;
}

/** Owns only presentation; navigation decides when a click cycles the mode. */
export class CombatTab {
  private icon: HTMLElement;
  private label: HTMLElement;
  private shown: CombatMode = "defend";
  private shownLegacy: boolean;
  constructor(private button: HTMLButtonElement, private reduced: () => boolean, private legacy: () => boolean = () => false) {
    this.icon = button.querySelector<HTMLElement>(":scope > span")!;
    this.icon.classList.add("combat-tab-icon");
    this.label = button.querySelector<HTMLElement>(".tab-label")!;
    this.label.removeAttribute("data-i18n");
    this.shownLegacy = legacy();
    this.icon.replaceChildren(this.layer(this.shown, this.shownLegacy));
  }
  private layer(mode: CombatMode, legacy: boolean) {
    const layer = document.createElement("span");
    layer.className = "combat-icon-layer";
    layer.innerHTML = combatIcon(mode, legacy);
    if (legacy) paintTabIcon(layer.querySelector("canvas")!, mode);
    return layer;
  }
  render(mode: CombatMode, active: boolean) {
    this.label.textContent = combatLabel(mode, active);
    this.button.dataset.mode = mode;
    const legacy = this.legacy(), artChanged = legacy !== this.shownLegacy;
    if (mode === this.shown && !artChanged) return;
    this.shown = mode;
    this.shownLegacy = legacy;
    // Cancel older transitions on rapid clicks, keeping at most two layers.
    this.icon.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    const outgoing = this.icon.lastElementChild as HTMLElement;
    this.icon.replaceChildren(outgoing);
    const incoming = this.layer(mode, legacy);
    this.icon.append(incoming);
    if (artChanged || this.reduced()) { outgoing.remove(); return; }
    const timing = { duration: 280, easing: "cubic-bezier(.22,.61,.36,1)", fill: "both" as const };
    outgoing.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(-100%)", opacity: 0 }], timing);
    const animation = incoming.animate([{ transform: "translateX(100%)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], timing);
    animation.onfinish = () => { outgoing.remove(); animation.cancel(); };
  }
}
