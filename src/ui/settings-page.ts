import { HOUR_MS } from "../away.ts";
import { UNLOCK_WAVES, unlockWaves, waveReach } from "../defend/progress.ts";
import { DEV_OPTIONS, SETTINGS, type SettingKey } from "../settings.ts";
import type { AppContext } from "./app.ts";
import { el } from "./dom.ts";
import { LANGUAGES, isLanguage, t } from "../i18n/index.ts";

/** The settings on the page, in order; each control comes from its row in SETTINGS. */
/** Gameplay settings, under their own heading first. */
const GAMEPLAY = ["showEmpty", "raiseDrag", "magnifier", "tripleTapFlag"] as const satisfies readonly SettingKey[];
const PAGE = ["pixelArt", "reduceMotion", "effectsOff", "simpleEnemies", "simpleTroops", "mergedOutlines", "tileGrid", "soundOff", "ambienceOff", "pixelFont"] as const satisfies readonly SettingKey[];
/** The dev options, under ALL ON. */
const DEV = ["devMode", "devTowers", "instantResearch"] as const satisfies readonly SettingKey[];
/** All research unlocked: the Smithy's rows and each skill tree. */
const RESEARCH = ["devSmithy", "devCommand", "devStewardship", "devMine", "devLibrary"] as const satisfies readonly SettingKey[];
const ALL_DEV = DEV_OPTIONS;
type PageKey = (typeof GAMEPLAY)[number] | (typeof PAGE)[number] | (typeof ALL_DEV)[number] | "developerMode";

/** One toggle's checkbox, showing its current value. */
function checkbox(key: PageKey, ctx: AppContext): string {
  const row = SETTINGS[key], value = ctx.save().settings[key];
  const checked = "invert" in row.page ? !value : value;
  return `<input type="checkbox" id="${row.page.id}" ${checked ? "checked" : ""}>`;
}
/** One toggle, labelled. */
const control = (key: PageKey, ctx: AppContext) => `<label class="setting">${t(`setting.${key}`)}${checkbox(key, ctx)}</label>`;

/** The tile grid's opacity slider, shown only while the grid is on. */
function gridOpacity(ctx: AppContext): string {
  const row = SETTINGS.gridOpacity, settings = ctx.save().settings;
  return `<label class="setting setting-range" id="grid-opacity-row" ${settings.tileGrid ? "" : "hidden"}>${t("setting.gridOpacity")}` +
    `<span class="range-control"><input type="range" id="${row.page.id}" min="${row.min}" max="${row.max}" step="${row.step}" value="${settings.gridOpacity}" aria-label="${t("settings.opacityAria")}">` +
    `<output id="grid-opacity-value">${settings.gridOpacity}%</output></span></label>`;
}

/** The Settings page: display and dev options, and erasing progress. */
export function renderSettingsPage(ctx: AppContext) {
  const settings = ctx.save().settings, allOn = ALL_DEV.every((k) => settings[k]);
  el("settings").innerHTML =
    `<div class="page-title"><small>${t("settings.tagline")}</small><h2>${t("nav.settings")}</h2></div>` +
    `<div class="setting language-setting"><span>${t("settings.language")}</span><button id="language" class="language-current" aria-haspopup="dialog" aria-label="${t("settings.chooseLanguage")}">${LANGUAGES.find(l => l.code === settings.language)!.name} ▾</button></div><p class="hint language-note">${t("settings.languageNote")}</p>` +
    `<h3 class="settings-group">${t("settings.gameplay")}</h3>` +
    GAMEPLAY.map((key) => control(key, ctx)).join("") +
    `<h3 class="settings-group">${t("settings.display")}</h3>` +
    PAGE.map((key) => control(key, ctx) + (key === "tileGrid" ? gridOpacity(ctx) : "")).join("") +
    control("developerMode", ctx) +
    (settings.developerMode ? `<h3 class="settings-group">${t("settings.dev")}</h3>` +
    `<label class="setting setting-all">${t("settings.allOn")}<input type="checkbox" id="dev-all" ${allOn ? "checked" : ""}></label>` +
    DEV.map((key) => control(key, ctx)).join("") +
    `<div class="setting setting-research"><span>${t("settings.allResearch")}</span><span class="research-checks">${RESEARCH.map((key) => `<label>${t(`setting.${key}`)}${checkbox(key, ctx)}</label>`).join("")}</span></div>` +
    `<button class="wide" id="dev-idle">${t("settings.idleHour")}</button>` +
    `<button class="wide" id="dev-idle-day">${t("settings.idleDay")}</button>` +
    `<button class="wide" id="dev-waves">${t("settings.unlockWaves", {count: UNLOCK_WAVES})}</button>` +
    `<p class="hint" id="dev-waves-reach">${t("settings.waveHint", {wave: waveReach(ctx.save().defend)})}</p>` : "") +
    `<p class="hint">${t("settings.saveHint")}</p><button class="wide danger" id="erase">${t("settings.erase")}</button>`;
  el("language").onclick = () => languageMenu(ctx);
  el("developer-mode").onchange = (event) => {
    settings.developerMode = (event.target as HTMLInputElement).checked;
    if (!settings.developerMode) for (const key of ALL_DEV) settings[key] = false;
    ctx.devChanged();
    renderSettingsPage(ctx);
  };
  for (const key of [...GAMEPLAY, ...PAGE, ...(settings.developerMode ? ALL_DEV : [])]) {
    const row = SETTINGS[key], input = el(row.page.id) as HTMLInputElement;
    input.onchange = () => {
      settings[key] = "invert" in row.page ? !input.checked : input.checked;
      if ((ALL_DEV as readonly SettingKey[]).includes(key)) ctx.devChanged();
      else ctx.update();
      if (key === "tileGrid") el("grid-opacity-row").hidden = !input.checked;
      const all = document.getElementById("dev-all") as HTMLInputElement | null;
      if (all) all.checked = ALL_DEV.every((k) => settings[k]);
    };
  }
  const opacity = el(SETTINGS.gridOpacity.page.id) as HTMLInputElement;
  opacity.oninput = () => {
    settings.gridOpacity = Number(opacity.value);
    el("grid-opacity-value").textContent = `${opacity.value}%`;
  };
  opacity.onchange = () => ctx.update();
  el("erase").onclick = () => confirmErase(ctx);
  if (!settings.developerMode) return;
  const all = el("dev-all") as HTMLInputElement;
  all.onchange = () => {
    for (const key of ALL_DEV) {
      settings[key] = all.checked;
      (el(SETTINGS[key].page.id) as HTMLInputElement).checked = all.checked;
    }
    ctx.devChanged();
  };
  el("dev-idle").onclick = () => ctx.addIdle(HOUR_MS);
  el("dev-idle-day").onclick = () => ctx.addIdle(24 * HOUR_MS);
  el("dev-waves").onclick = () => {
    const defend = ctx.save().defend;
    unlockWaves(defend);
    el("dev-waves-reach").textContent = t("settings.waveHint", {wave: waveReach(defend)});
    ctx.update();
  };
}

function languageMenu(ctx: AppContext) {
  const {modal} = ctx;
  if (modal.open) return;
  modal.classList.add("language-dialog");
  modal.setAttribute("aria-labelledby", "language-title");
  modal.setAttribute("aria-describedby", "language-description");
  modal.innerHTML = `<small>${t("nav.settings")}</small><h2 id="language-title">${t("settings.chooseLanguage")}</h2>
    <p id="language-description">${t("settings.languageNote")}</p>
    <div class="language-grid" role="group" aria-label="${t("settings.language")}">${LANGUAGES.map(l => `<button class="language-option" data-language="${l.code}" lang="${l.code}" aria-pressed="${l.code === ctx.save().settings.language}">${l.name}</button>`).join("")}</div>
    <div class="dialog-actions"><button data-language-close>${t("common.close")}</button></div>`;
  modal.querySelectorAll<HTMLButtonElement>("[data-language]").forEach(button => button.onclick = () => {
    const language = button.dataset.language;
    if (!isLanguage(language)) return;
    modal.close();
    ctx.changeLanguage(language);
  });
  modal.querySelector<HTMLButtonElement>("[data-language-close]")!.onclick = () => modal.close();
  modal.addEventListener("close", () => {
    modal.classList.remove("language-dialog");
    modal.removeAttribute("aria-labelledby"); modal.removeAttribute("aria-describedby");
    document.getElementById("language")?.focus({preventScroll: true});
  }, {once: true});
  modal.showModal();
  modal.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({preventScroll: true});
}

function confirmErase(ctx: AppContext) {
  const { modal } = ctx;
  modal.innerHTML = `<small>${t("nav.settings")}</small><h2>${t("settings.eraseTitle")}</h2><p>${t("settings.eraseWarning")}</p>
    <div class="dialog-actions"><button id="cancel">${t("settings.keepEverything")}</button><button id="confirm" class="danger">${t("settings.eraseEverything")}</button></div>`;
  modal.showModal();
  el("cancel").onclick = () => modal.close();
  el("confirm").onclick = () => {
    modal.close();
    ctx.eraseAll();
    ctx.navigate("defend");
  };
}
