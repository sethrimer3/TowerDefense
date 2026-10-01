import { TAB_ICONS, TAB_NAMES, uiSprite, type Tab } from "./dom.ts";

/** What the player holds, along the top: Gold, iron and steel bars (the
 * Armory's currencies), Valor (the skill trees'), and the Commander's level
 * with its experience bar. */
const CURRENCIES = `<div id="currencies" class="currencies td-currencies">
  <div class="currency gold-currency" title="Gold: earned in battle, spent in the Armory">${uiSprite("gold")} <b id="gold">0</b><small>GOLD</small></div>
  <div class="currency iron-currency" title="Iron bars: one for every wave held"><i class="bar-icon iron" aria-hidden="true"></i> <b id="iron">0</b><small>IRON</small></div>
  <div class="currency steel-currency" title="Steel bars: from boss waves"><i class="bar-icon steel" aria-hidden="true"></i> <b id="steel">0</b><small>STEEL</small></div>
  <div class="currency valor-currency" title="Valor: earned for each wave held past your best, spent on the skill trees">✦ <b id="valor">0</b><small>VALOR</small></div>
  <div class="currency level-currency" title="Commander level: kills earn experience; each level gives a training point">${uiSprite("upgrades")} <b id="level">0</b><small>LEVEL</small><span class="xp-track"><i id="xp-fill"></i></span></div>
</div>`;
const NAV = `<nav aria-label="Main navigation">${(Object.keys(TAB_ICONS) as Tab[])
  .map((id) => `<button data-tab="${id}" class="${id === "defend" ? "selected" : ""}"><span>${TAB_ICONS[id]}</span>${TAB_NAMES[id]}</button>`)
  .join("")}</nav>`;

/** Builds the page skeleton into `app`: currencies, the pages, navigation
 * and the shared dialog. */
export function buildShell(app: HTMLElement) {
  app.innerHTML = `<main class="shell">${CURRENCIES}<section id="defend" class="page active"></section><section id="upgrades" class="page"></section><section id="settings" class="page"></section>${NAV}</main><dialog id="modal"></dialog>`;
}
