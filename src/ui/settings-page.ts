import { SETTINGS, type SettingKey, type Settings } from "../settings.ts";
import type { AppContext } from "./app.ts";
import type { BoardOverlay } from "./board-overlay.ts";
import { capitalized, displayedProgress, el } from "./dom.ts";
import { MODES } from "../modes.ts";

/** The settings on the page, in order; each control comes from its row in
 * SETTINGS. */
const PAGE = [
  "speed", "transition", "fightAnimation", "brightness", "spritesOff", "decorOff", "batterySaver", "showArrows", "reduceMotion", "weatherSound",
  "infoDisplay", "oneTapMove", "devMode",
] as const satisfies readonly SettingKey[];
type PageKey = (typeof PAGE)[number];

/** What a change does once written, beyond saving. */
const AFTER: Partial<Record<PageKey, (ctx: AppContext, overlay: BoardOverlay, s: Settings) => void>> = {
  showArrows: (ctx) => ctx.update(),
  // The board silences the weather itself once sound is off.
  weatherSound: (ctx) => ctx.update(),
  infoDisplay: (ctx, overlay, s) => {
    if (s.infoDisplay === "status" || s.infoDisplay === "none") overlay.hideInspect();
    ctx.save();
    ctx.update();
  },
  // Turning it on also grants everything it unlocks.
  devMode: (ctx, _, s) => {
    ctx.game.setDevMode(s.devMode);
    ctx.save();
    ctx.update();
    ctx.renderPage();
  },
};

const options = (choices: readonly (readonly [string | number, string])[], selected: string | number) =>
  choices.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");

/** One setting's control, showing its current value. */
function control(key: PageKey, s: Settings): string {
  const row = SETTINGS[key], value = s[key];
  switch (row.kind) {
    case "toggle": {
      const checked = "invert" in row.page ? !value : value;
      return `<label class="setting">${row.page.label}<input type="checkbox" id="${row.page.id}" ${checked ? "checked" : ""}></label>`;
    }
    case "choice":
      return `<label class="setting">${row.page.label}<select id="${row.page.id}">${options(row.choices, value as string | number)}</select></label>`;
    case "range":
      return `<label class="setting">${row.page.label}<span class="range-setting"><input type="range" id="${row.page.id}" min="${row.min}" max="${row.max}" step="${row.step}" value="${value}" aria-label="${row.page.aria}"><output id="${row.page.id}-value">${value}</output></span></label>`;
  }
}

/** The Settings page: display and control options, retire, and erase. */
export function renderSettingsPage(ctx: AppContext, overlay: BoardOverlay) {
  const { game } = ctx, s = game.save.settings;
  const words = MODES[game.mode].words;
  el("settings").innerHTML =
    `<div class="page-title"><small>MAKE THE ASCENT YOUR OWN</small><h2>Settings</h2></div>` +
    PAGE.map((key) => control(key, s)).join("") +
    `<p class="hint">Automation pauses outside the board tabs and while the browser is hidden. Progress saves after each action.</p><button class="wide" id="retire">Retire this ${words.run}</button><p class="hint">Keep your milestone rewards and enter a freshly generated ${words.fresh}.</p><button class="wide danger" id="erase">Erase all progress</button><p class="seed">RUN SEED · ${game.run.seed}</p>`;
  bindSettings(ctx, overlay);
}

function bindSettings(ctx: AppContext, overlay: BoardOverlay) {
  const { game } = ctx;
  // Read live: erasing progress replaces the whole save.
  const s = () => game.save.settings;
  for (const key of PAGE) {
    const row = SETTINGS[key], input = el(row.page.id) as HTMLInputElement & HTMLSelectElement;
    const changed = () => (AFTER[key] ?? (() => ctx.save()))(ctx, overlay, s());
    const set = (value: unknown) => { (s() as Record<SettingKey, unknown>)[key] = value; };
    switch (row.kind) {
      case "toggle":
        input.onchange = () => {
          const on = "invert" in row.page ? !input.checked : input.checked;
          set(on);
          changed();
        };
        break;
      case "choice":
        input.onchange = () => {
          set(row.choices.find(([c]) => String(c) === input.value)?.[0]);
          changed();
        };
        break;
      case "range":
        // Live preview while dragging; the renderer reads the setting each frame.
        input.oninput = () => {
          set(Number(input.value));
          el(`${row.page.id}-value`).textContent = String(s()[key]);
        };
        input.onchange = changed;
        break;
    }
  }
  el("retire").onclick = () =>
    ctx.confirm(
      {
        title: "Leave your mark?",
        body: `Retire at ${MODES[game.mode].words.progress} ${displayedProgress(game.run.height, !!game.run.outside)}. Milestone rewards are already yours. Uncollected clear chests will be claimed.`,
        label: `Retire ${MODES[game.mode].words.run}`,
        cancel: MODES[game.mode].words.keepGoing,
      },
      () => {
        game.finish(`${capitalized(MODES[game.mode].words.run)} retired`);
        ctx.update();
      },
    );
  el("erase").onclick = () =>
    ctx.confirm(
      {
        title: "Erase your legacy?",
        body: "All currencies, upgrades, records, and both current runs will be permanently erased.",
        label: "Erase everything",
        cancel: "Keep everything",
      },
      () => {
        game.eraseAll();
        ctx.save();
        ctx.navigate("tower");
      },
    );
}
