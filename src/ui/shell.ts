import { descentHtml } from "./chamber.ts";
import { TAB_ICONS, TAB_NAMES, uiSprite, type Tab } from "./dom.ts";

/** The Mine's Copper, Silver and Gold, the Library's Knowledge, DEFEND's
 * upgrade points, and a slot kept for a resource yet to be found. */
const CURRENCIES = `<div id="currencies" class="currencies td-currencies">
  <div class="currency copper-currency" title="Copper: worked by the mine's smiths, spent in the Smithy and the Tiles shop"><i class="bar-icon copper" aria-hidden="true"></i> <b id="copper">0</b><small>COPPER</small></div>
  <div class="currency silver-currency" title="Silver: worked by the mine's smiths, spent in the Smithy and the Tiles shop"><i class="bar-icon silver" aria-hidden="true"></i> <b id="silver">0</b><small>SILVER</small></div>
  <div class="currency gold-currency" title="Gold: worked by the mine's smiths, spent on advanced purchases and upgrades"><i class="bar-icon gold" aria-hidden="true"></i> <b id="gold">0</b><small>GOLD</small></div>
  <div class="currency knowledge-currency" title="Knowledge: earned every hour by the Library (shelves × librarians), spent in the Study below the Library">${uiSprite("knowledge")} <b id="knowledge">0</b><small>KNOWLEDGE</small></div>
  <div class="currency upgrade-currency" title="Upgrade points: one for every new best wave you hold in Defend">${uiSprite("upgrade-point")} <b id="upgrade-points">0</b><small>UPGRADE</small></div>
  <div class="currency secret-currency" title="Not yet discovered" aria-label="An undiscovered resource"><i class="secret-mark" aria-hidden="true">?</i><small>???</small></div>
</div>`;
const NAV = `<nav aria-label="Main navigation">${(Object.keys(TAB_ICONS) as Tab[])
  .map((id) => `<button data-tab="${id}" class="${id === "defend" ? "selected" : ""}"><span>${TAB_ICONS[id]}</span>${TAB_NAMES[id]}</button>`)
  .join("")}</nav>`;

/** Builds the page skeleton into `app`: currencies, the pages, navigation
 * and the shared dialog. */
export function buildShell(app: HTMLElement) {
  app.innerHTML = `<main class="shell">${CURRENCIES}<section id="defend" class="page active"></section><section id="mine" class="page descent-page">${descentHtml("mine")}</section><section id="library" class="page descent-page">${descentHtml("library")}</section><section id="tiles" class="page"></section><section id="settings" class="page"></section>${NAV}</main><dialog id="modal"></dialog>`;
}
