import { HOUR_MS } from "../away.ts";
import { UNLOCK_WAVES, unlockWaves, waveReach } from "../defend/progress.ts";
import { SETTINGS, type SettingKey } from "../settings.ts";
import type { AppContext } from "./app.ts";
import { el } from "./dom.ts";

/** The settings on the page, in order; each control comes from its row in SETTINGS. */
/** Gameplay settings, under their own heading first. */
const GAMEPLAY = ["showEmpty"] as const satisfies readonly SettingKey[];
const PAGE = ["reduceMotion", "effectsOff", "tileGrid", "soundOff", "ambienceOff", "pixelFont"] as const satisfies readonly SettingKey[];
/** The dev options, under ALL ON. */
const DEV = ["devMode", "devTowers", "instantResearch"] as const satisfies readonly SettingKey[];
/** All research unlocked: the Smithy's rows and each skill tree. */
const RESEARCH = ["devSmithy", "devCommand", "devStewardship", "devMine", "devLibrary"] as const satisfies readonly SettingKey[];
const ALL_DEV = [...DEV, ...RESEARCH];
type PageKey = (typeof GAMEPLAY)[number] | (typeof PAGE)[number] | (typeof ALL_DEV)[number];

/** One toggle's checkbox, showing its current value. */
function checkbox(key: PageKey, ctx: AppContext): string {
  const row = SETTINGS[key], value = ctx.save().settings[key];
  const checked = "invert" in row.page ? !value : value;
  return `<input type="checkbox" id="${row.page.id}" ${checked ? "checked" : ""}>`;
}
/** One toggle, labelled. */
const control = (key: PageKey, ctx: AppContext) => `<label class="setting">${SETTINGS[key].page.label}${checkbox(key, ctx)}</label>`;

/** The tile grid's opacity slider, shown only while the grid is on. */
function gridOpacity(ctx: AppContext): string {
  const row = SETTINGS.gridOpacity, settings = ctx.save().settings;
  return `<label class="setting setting-range" id="grid-opacity-row" ${settings.tileGrid ? "" : "hidden"}>${row.page.label}` +
    `<span class="range-control"><input type="range" id="${row.page.id}" min="${row.min}" max="${row.max}" step="${row.step}" value="${settings.gridOpacity}" aria-label="${row.page.aria}">` +
    `<output id="grid-opacity-value">${settings.gridOpacity}%</output></span></label>`;
}

/** The Settings page: display and dev options, and erasing progress. */
export function renderSettingsPage(ctx: AppContext) {
  const settings = ctx.save().settings, allOn = ALL_DEV.every((k) => settings[k]);
  el("settings").innerHTML =
    `<div class="page-title"><small>THE CITY AWAITS ITS ORDERS</small><h2>Settings</h2></div>` +
    `<h3 class="settings-group">Gameplay</h3>` +
    GAMEPLAY.map((key) => control(key, ctx)).join("") +
    `<h3 class="settings-group">Display and sound</h3>` +
    PAGE.map((key) => control(key, ctx) + (key === "tileGrid" ? gridOpacity(ctx) : "")).join("") +
    `<h3 class="settings-group">Dev options</h3>` +
    `<label class="setting setting-all">ALL ON<input type="checkbox" id="dev-all" ${allOn ? "checked" : ""}></label>` +
    DEV.map((key) => control(key, ctx)).join("") +
    `<div class="setting setting-research"><span>All research unlocked</span><span class="research-checks">${RESEARCH.map((key) => `<label>${SETTINGS[key].page.label}${checkbox(key, ctx)}</label>`).join("")}</span></div>` +
    `<button class="wide" id="dev-idle">Add 1 hour of idle time</button>` +
    `<button class="wide" id="dev-waves">Unlock ${UNLOCK_WAVES} more waves</button>` +
    `<p class="hint" id="dev-waves-reach">Defenses can start on any wave up to ${waveReach(ctx.save().defend)}; choose it with the Wave button on the Defend tab.</p>` +
    `<p class="hint">Progress saves after each action. A defense in progress is never saved: reloading ends it.</p><button class="wide danger" id="erase">Erase all progress</button>`;
  for (const key of [...GAMEPLAY, ...PAGE, ...ALL_DEV]) {
    const row = SETTINGS[key], input = el(row.page.id) as HTMLInputElement;
    input.onchange = () => {
      settings[key] = "invert" in row.page ? !input.checked : input.checked;
      if ((ALL_DEV as readonly SettingKey[]).includes(key)) ctx.devChanged();
      else ctx.update();
      if (key === "tileGrid") el("grid-opacity-row").hidden = !input.checked;
      (el("dev-all") as HTMLInputElement).checked = ALL_DEV.every((k) => settings[k]);
    };
  }
  const opacity = el(SETTINGS.gridOpacity.page.id) as HTMLInputElement;
  opacity.oninput = () => {
    settings.gridOpacity = Number(opacity.value);
    el("grid-opacity-value").textContent = `${opacity.value}%`;
  };
  opacity.onchange = () => ctx.update();
  const all = el("dev-all") as HTMLInputElement;
  all.onchange = () => {
    for (const key of ALL_DEV) {
      settings[key] = all.checked;
      (el(SETTINGS[key].page.id) as HTMLInputElement).checked = all.checked;
    }
    ctx.devChanged();
  };
  el("dev-idle").onclick = () => ctx.addIdle(HOUR_MS);
  el("dev-waves").onclick = () => {
    const defend = ctx.save().defend;
    unlockWaves(defend);
    el("dev-waves-reach").textContent = `Defenses can start on any wave up to ${waveReach(defend)}; choose it with the Wave button on the Defend tab.`;
    ctx.update();
  };
  el("erase").onclick = () => confirmErase(ctx);
}

function confirmErase(ctx: AppContext) {
  const { modal } = ctx;
  modal.innerHTML = `<small>SETTINGS</small><h2>Erase your city?</h2><p>All currencies, Training, skills, the city layout and your best wave will be permanently erased.</p>
    <div class="dialog-actions"><button id="cancel">Keep everything</button><button id="confirm" class="danger">Erase everything</button></div>`;
  modal.showModal();
  el("cancel").onclick = () => modal.close();
  el("confirm").onclick = () => {
    modal.close();
    ctx.eraseAll();
    ctx.navigate("defend");
  };
}
