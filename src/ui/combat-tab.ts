import { uiSprite } from "./dom.ts";
import { t } from "../i18n/index.ts";
import { modeIconUrl } from "./mode-icons.ts";

export const COMBAT_MODES = ["defend", "ambush", "siege"] as const;
export type CombatMode = typeof COMBAT_MODES[number];
export const nextCombatMode = (mode: CombatMode): CombatMode => COMBAT_MODES[(COMBAT_MODES.indexOf(mode) + 1) % COMBAT_MODES.length];
export const combatLabel = (mode: CombatMode, active: boolean) =>
  `${t(`nav.${mode}`)}${active ? ` --> ${t(`nav.${nextCombatMode(mode)}`)}` : ""}`;

/** Distinct silhouettes: the existing shield, a bow drawn from a bush, a
 * trebuchet, the last two pixel art from `mode-icons.ts`. */
export function combatIcon(mode: CombatMode) {
  if (mode === "defend") return uiSprite("defend");
  return `<img class="ui-sprite" src="${modeIconUrl(mode)}" alt="" aria-hidden="true">`;
}

/** Owns only presentation; navigation decides when a click cycles the mode. */
export class CombatTab {
  private icon: HTMLElement;
  private label: HTMLElement;
  private shown: CombatMode = "defend";
  constructor(private button: HTMLButtonElement, private reduced: () => boolean) {
    this.icon = button.querySelector<HTMLElement>(":scope > span")!;
    this.icon.classList.add("combat-tab-icon");
    this.label = button.querySelector<HTMLElement>(".tab-label")!;
    this.label.removeAttribute("data-i18n");
    this.icon.innerHTML = `<span class="combat-icon-layer">${combatIcon(this.shown)}</span>`;
  }
  render(mode: CombatMode, active: boolean) {
    this.label.textContent = combatLabel(mode, active);
    this.button.dataset.mode = mode;
    if (mode === this.shown) return;
    this.shown = mode;
    // Cancel older transitions on rapid clicks, keeping at most two layers.
    this.icon.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    const outgoing = this.icon.lastElementChild as HTMLElement;
    this.icon.replaceChildren(outgoing);
    const incoming = document.createElement("span");
    incoming.className = "combat-icon-layer";
    incoming.innerHTML = combatIcon(mode);
    this.icon.append(incoming);
    if (this.reduced()) { outgoing.remove(); return; }
    const timing = { duration: 280, easing: "cubic-bezier(.22,.61,.36,1)", fill: "both" as const };
    outgoing.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(-100%)", opacity: 0 }], timing);
    const animation = incoming.animate([{ transform: "translateX(100%)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], timing);
    animation.onfinish = () => { outgoing.remove(); animation.cancel(); };
  }
}
