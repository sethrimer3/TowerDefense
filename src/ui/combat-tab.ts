import { uiSprite } from "./dom.ts";
import { t } from "../i18n/index.ts";

export const COMBAT_MODES = ["defend", "ambush", "siege"] as const;
export type CombatMode = typeof COMBAT_MODES[number];
export const nextCombatMode = (mode: CombatMode): CombatMode => COMBAT_MODES[(COMBAT_MODES.indexOf(mode) + 1) % COMBAT_MODES.length];
export const combatLabel = (mode: CombatMode, active: boolean) =>
  `${t(`nav.${mode}`)}${active ? ` --> ${t(`nav.${nextCombatMode(mode)}`)}` : ""}`;

/** Distinct silhouettes: the existing shield, crossed ambush blades, a siege engine. */
export function combatIcon(mode: CombatMode) {
  if (mode === "defend") return uiSprite("defend");
  const drawing = mode === "ambush"
    ? '<path d="M10 6 30 26 26 30 6 10ZM38 6 18 26 22 30 42 10Z" fill="#dce4e9"/><path d="m17 26 5 5-9 10-5-5Zm14 0-5 5 9 10 5-5Z" fill="#b58a45"/><path d="m10 23 15 15m13-15L23 38" stroke="#efd496" stroke-width="4"/>'
    : '<path d="M10 34h27v5H10Zm9-3 8-20 5 2-8 20Z" fill="#b58a45"/><path d="m12 9 27 12-2 5L10 14Z" fill="#dfbd76"/><path d="m8 6 8 3-3 9-8-3Z" fill="#93a3b2"/><path d="M12 34 23 20l12 14" fill="none" stroke="#8f613b" stroke-width="5"/><circle cx="13" cy="39" r="6" fill="#44352c" stroke="#d6ae68" stroke-width="3"/><circle cx="35" cy="39" r="6" fill="#44352c" stroke="#d6ae68" stroke-width="3"/>';
  return `<svg class="ui-sprite" viewBox="0 0 48 48" aria-hidden="true">${drawing}</svg>`;
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
