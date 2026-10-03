import { HOUR_MS } from "../away.ts";
import { SETTINGS, type SettingKey } from "../settings.ts";
import type { AppContext } from "./app.ts";
import { el } from "./dom.ts";

/** The settings on the page, in order; each control comes from its row in SETTINGS. */
const PAGE = ["reduceMotion", "effectsOff", "soundOff", "pixelFont"] as const satisfies readonly SettingKey[];
/** The dev options, under ALL ON. */
const DEV = ["devMode", "devTowers", "instantResearch"] as const satisfies readonly SettingKey[];
/** All research unlocked: one per tab of the Upgrades page. */
const RESEARCH = ["devSmithy", "devCommand", "devStewardship", "devMine", "devLibrary"] as const satisfies readonly SettingKey[];
const ALL_DEV = [...DEV, ...RESEARCH];
type PageKey = (typeof PAGE)[number] | (typeof ALL_DEV)[number];

/** One toggle's checkbox, showing its current value. */
function checkbox(key: PageKey, ctx: AppContext): string {
  const row = SETTINGS[key], value = ctx.save().settings[key];
  const checked = "invert" in row.page ? !value : value;
  return `<input type="checkbox" id="${row.page.id}" ${checked ? "checked" : ""}>`;
}
/** One toggle, labelled. */
const control = (key: PageKey, ctx: AppContext) => `<label class="setting">${SETTINGS[key].page.label}${checkbox(key, ctx)}</label>`;

/** The Settings page: display and dev options, and erasing progress. */
export function renderSettingsPage(ctx: AppContext) {
  const settings = ctx.save().settings, allOn = ALL_DEV.every((k) => settings[k]);
  el("settings").innerHTML =
    `<div class="page-title"><small>THE CITY AWAITS ITS ORDERS</small><h2>Settings</h2></div>` +
    PAGE.map((key) => control(key, ctx)).join("") +
    `<h3 class="settings-group">Dev options</h3>` +
    `<label class="setting setting-all">ALL ON<input type="checkbox" id="dev-all" ${allOn ? "checked" : ""}></label>` +
    DEV.map((key) => control(key, ctx)).join("") +
    `<div class="setting setting-research"><span>All research unlocked</span><span class="research-checks">${RESEARCH.map((key) => `<label>${SETTINGS[key].page.label}${checkbox(key, ctx)}</label>`).join("")}</span></div>` +
    `<button class="wide" id="dev-idle">Add 1 hour of idle time</button>` +
    `<p class="hint">Progress saves after each action. A defense in progress is never saved: reloading ends it.</p><button class="wide danger" id="erase">Erase all progress</button>`;
  for (const key of [...PAGE, ...ALL_DEV]) {
    const row = SETTINGS[key], input = el(row.page.id) as HTMLInputElement;
    input.onchange = () => {
      settings[key] = "invert" in row.page ? !input.checked : input.checked;
      if ((ALL_DEV as readonly SettingKey[]).includes(key)) ctx.devChanged();
      else ctx.update();
      (el("dev-all") as HTMLInputElement).checked = ALL_DEV.every((k) => settings[k]);
    };
  }
  const all = el("dev-all") as HTMLInputElement;
  all.onchange = () => {
    for (const key of ALL_DEV) {
      settings[key] = all.checked;
      (el(SETTINGS[key].page.id) as HTMLInputElement).checked = all.checked;
    }
    ctx.devChanged();
  };
  el("dev-idle").onclick = () => ctx.addIdle(HOUR_MS);
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
