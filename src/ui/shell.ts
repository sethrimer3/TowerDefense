import { TAB_ICONS, TAB_NAMES, uiSprite, type Tab } from "./dom.ts";

/** What the player holds, along the top: copper, silver and gold bars
 * (the mine's metal, spent in the Upgrades tab's Forge), Gold (earned in
 * battle, spent on the mine, the library and bombs), Knowledge (the Study's,
 * from the Library), upgrade points (one for each new best wave), and a slot
 * kept for a resource yet to be found. */
const CURRENCIES = `<div id="currencies" class="currencies td-currencies">
  <div class="currency copper-currency" title="Copper: worked by the mine's smiths, spent in the Forge"><i class="bar-icon copper" aria-hidden="true"></i> <b id="copper">0</b><small>COPPER</small></div>
  <div class="currency silver-currency" title="Silver: worked by the mine's smiths, spent in the Forge"><i class="bar-icon silver" aria-hidden="true"></i> <b id="silver">0</b><small>SILVER</small></div>
  <div class="currency gold-bar-currency" title="Gold bars: worked by the mine's smiths, spent in the Forge's dearest upgrades"><i class="bar-icon gold" aria-hidden="true"></i> <b id="gold-bars">0</b><small>BARS</small></div>
  <div class="currency gold-currency" title="Gold: earned in battle, spent on the mine, the library and bombs">${uiSprite("gold")} <b id="gold">0</b><small>GOLD</small></div>
  <div class="currency knowledge-currency" title="Knowledge: earned every hour by the Library (shelves × librarians) and for each wave held past your best, spent in the Study">${uiSprite("knowledge")} <b id="knowledge">0</b><small>KNOWLEDGE</small></div>
  <div class="currency upgrade-currency" title="Upgrade points: one for every new best wave you hold in Defend">${uiSprite("upgrade-point")} <b id="upgrade-points">0</b><small>UPGRADE</small></div>
  <div class="currency secret-currency" title="Not yet discovered" aria-label="An undiscovered resource"><i class="secret-mark" aria-hidden="true">?</i><small>???</small></div>
</div>`;
const NAV = `<nav aria-label="Main navigation">${(Object.keys(TAB_ICONS) as Tab[])
  .map((id) => `<button data-tab="${id}" class="${id === "defend" ? "selected" : ""}"><span>${TAB_ICONS[id]}</span>${TAB_NAMES[id]}</button>`)
  .join("")}</nav>`;

/** Builds the page skeleton into `app`: currencies, the pages, navigation
 * and the shared dialog. */
export function buildShell(app: HTMLElement) {
  app.innerHTML = `<main class="shell">${CURRENCIES}<section id="defend" class="page active"></section><section id="mine" class="page"></section><section id="library" class="page"></section><section id="upgrades" class="page"></section><section id="settings" class="page"></section>${NAV}</main><dialog id="modal"></dialog>`;
}
