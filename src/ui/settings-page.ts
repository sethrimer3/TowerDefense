import { SETTINGS, type SettingKey } from "../settings.ts";
import type { AppContext } from "./app.ts";
import { el } from "./dom.ts";

/** The settings on the page, in order; each control comes from its row in SETTINGS. */
const PAGE = ["reduceMotion", "effectsOff", "soundOff", "devMode", "freePurchases"] as const satisfies readonly SettingKey[];

/** One toggle, showing its current value. */
function control(key: (typeof PAGE)[number], ctx: AppContext): string {
  const row = SETTINGS[key], value = ctx.save().settings[key];
  const checked = "invert" in row.page ? !value : value;
  return `<label class="setting">${row.page.label}<input type="checkbox" id="${row.page.id}" ${checked ? "checked" : ""}></label>`;
}

/** The Settings page: display and dev options, and erasing progress. */
export function renderSettingsPage(ctx: AppContext) {
  el("settings").innerHTML =
    `<div class="page-title"><small>THE CITY AWAITS ITS ORDERS</small><h2>Settings</h2></div>` +
    PAGE.map((key) => control(key, ctx)).join("") +
    `<p class="hint">Progress saves after each action. A defense in progress is never saved: reloading ends it.</p><button class="wide danger" id="erase">Erase all progress</button>`;
  for (const key of PAGE) {
    const row = SETTINGS[key], input = el(row.page.id) as HTMLInputElement;
    input.onchange = () => {
      ctx.save().settings[key] = "invert" in row.page ? !input.checked : input.checked;
      ctx.update();
    };
  }
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
