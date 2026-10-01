import "./style.css";
import "./theme.css";
import { defaults, load, persist, type Save } from "./save.ts";
import { DefendPage } from "./defend/ui.ts";
import { bonuses, levelForXp, payKills, payWave, settleTraining, whole, xpForLevel } from "./progression.ts";
import type { AppContext } from "./ui/app.ts";
import { el, type Tab } from "./ui/dom.ts";
import { buildShell } from "./ui/shell.ts";
import { SkillTreePage } from "./ui/skill-tree-page.ts";
import { renderSettingsPage } from "./ui/settings-page.ts";
import type { Weather } from "./defend/weather.ts";

// Wires the pages together: builds the shell, loads the save, and routes
// navigation, the currency bar and the frame loop between the pages.

buildShell(document.querySelector<HTMLDivElement>("#app")!);
let save: Save = load();
let tab: Tab = "defend";
const clock = () => Date.now();
const modal = el("modal") as HTMLDialogElement;
const ctx: AppContext = {
  save: () => save,
  modal,
  update,
  renderPage,
  navigate,
  clock,
  eraseAll: () => {
    save = defaults();
    store();
  },
};
const skillTree = new SkillTreePage(ctx);
const defendPage = new DefendPage(el("defend"), {
  save: () => save.defend,
  wallet: () => ({ gold: save.gold, ironBar: save.ironBar, steelBar: save.steelBar, free: save.settings.freePurchases || save.settings.devMode }),
  setWallet: (w) => {
    if (save.settings.devMode) return;
    save.gold = w.gold;
    save.ironBar = w.ironBar;
    save.steelBar = w.steelBar;
  },
  bonuses: () => bonuses(save),
  earnKills: (slain) => {
    const { levelsGained } = payKills(save, slain);
    refreshCurrencies();
    return levelsGained;
  },
  earnWave: (wave) => {
    const r = payWave(save, wave);
    store();
    refreshCurrencies();
    return r;
  },
  persist: store,
  reduceMotion: () => save.settings.reduceMotion,
  effects: () => !save.settings.effectsOff,
  devMode: () => save.settings.devMode,
});

function store() {
  if (!persist(save)) console.warn("Storage unavailable — progress is only kept for this session.");
}
/** The currency bar, from the save. */
function refreshCurrencies() {
  const dev = save.settings.devMode;
  const show = (id: string, n: number) => (el(id).textContent = dev ? "∞" : String(whole(n)));
  show("gold", save.gold);
  show("iron", save.ironBar);
  show("steel", save.steelBar);
  show("valor", save.valor);
  const level = levelForXp(save.xp), from = xpForLevel(level), to = xpForLevel(level + 1);
  el("level").textContent = String(level);
  el("xp-fill").style.width = `${((save.xp - from) / (to - from)) * 100}%`;
}
/** Saves and refreshes the currency bar. */
function update() {
  store();
  refreshCurrencies();
}
function renderPage() {
  if (tab === "defend") defendPage.show();
  if (tab === "upgrades") skillTree.render();
  if (tab === "settings") renderSettingsPage(ctx);
}
function navigate(id: Tab) {
  if (id !== "defend") defendPage.pause();
  tab = id;
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === id));
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.tab === id);
    b.setAttribute("aria-current", b.dataset.tab === id ? "page" : "false");
  });
  renderPage();
  update();
}
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => (b.onclick = () => navigate(b.dataset.tab as Tab)));

/** Training completes on the wall clock, whatever page shows. */
let lastTick = 0;
function frame(time: number) {
  if (tab === "defend") defendPage.frame(time);
  if (tab === "upgrades") skillTree.drawParticles(time);
  if (time - lastTick >= 1000) {
    lastTick = time;
    const done = settleTraining(save, clock()) > 0;
    if (done) update();
    if (tab === "upgrades") skillTree.tick(done);
  }
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", store);
window.addEventListener("pagehide", store);

// Console helper: fast-forward a running defense, optionally forcing the weather.
(globalThis as { defendDebug?: unknown }).defendDebug = (seconds = 30, weather?: Weather) => defendPage.fastForward(seconds, weather);

settleTraining(save, clock());
navigate("defend");
requestAnimationFrame(frame);
