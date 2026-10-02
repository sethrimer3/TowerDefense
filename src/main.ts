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
import { play, soundEnabledBy } from "./sound.ts";
import { flourishesEnabledBy, replay, sparks, sparksOver } from "./ui/flourish.ts";
import { MinePage } from "./mine/ui.ts";
import type { Weather as MineWeather } from "./mine/sim.ts";
import { LibraryPage } from "./library/ui.ts";
import { stream } from "./random.ts";

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
    minePage.load(null, clock());
    libraryPage.load(null, clock());
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
    if (levelsGained > 0) {
      play("levelUp");
      sparksOver(el("level"), "arcane");
    }
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

const minePage = new MinePage(el("mine"), {
  gold: () => save.gold,
  free: () => save.settings.freePurchases || save.settings.devMode,
  spendGold: (n) => {
    save.gold = Math.max(0, save.gold - n);
    update();
  },
  earn: (gold, ironBar, steelBar) => {
    save.gold += gold;
    save.ironBar += ironBar;
    save.steelBar += steelBar;
    refreshCurrencies();
    mineDirty = true;
  },
  upgrades: () => ({ coffee: save.skills.coffee, waterproof: save.skills.waterproofing }),
  effects: () => !save.settings.effectsOff,
  newSeed: () => Math.floor(stream("game")() * 4294967296),
});
const libraryPage = new LibraryPage(el("library"), {
  gold: () => save.gold,
  free: () => save.settings.freePurchases || save.settings.devMode,
  spendGold: (n) => {
    save.gold = Math.max(0, save.gold - n);
    update();
  },
  effects: () => !save.settings.effectsOff,
  newSeed: () => Math.floor(stream("game")() * 4294967296),
  clock,
  earnKnowledge: (n) => {
    const before = whole(save.knowledge);
    save.knowledge += n;
    if (whole(save.knowledge) !== before) {
      refreshCurrencies();
      mineDirty = true;
    }
  },
  upgrades: () => ({ fireproof: save.skills.fireproofWood, fireTraining: save.skills.fireTraining }),
  showing: () => tab === "library",
});
/** The mine or the library has paid out since the last save. */
let mineDirty = false;
libraryPage.load(save.library, clock());
minePage.load(save.mine, clock());

soundEnabledBy(() => !save.settings.soundOff);
flourishesEnabledBy(() => !save.settings.reduceMotion);
// Every button knocks like the oak board it is (the tab row's stone
// tablets grate), and strikes a few embers where it was pressed.
document.addEventListener("click", (e) => {
  const target = (e.target as Element).closest?.("button, input[type=checkbox]");
  if (!target) return;
  play(target.closest("nav") ? "stone" : "knock");
  if (e.detail > 0) sparks(e.clientX, e.clientY, "embers");
});

function store() {
  save.mine = minePage.snapshot(clock());
  save.library = libraryPage.snapshot(clock());
  mineDirty = false;
  if (!persist(save)) console.warn("Storage unavailable — progress is only kept for this session.");
}
/** What the currency bar last showed, so a rise can glint. */
const shown = new Map<string, string>();
/** The currency bar, from the save. */
function refreshCurrencies() {
  const dev = save.settings.devMode;
  document.documentElement.classList.toggle("reduce-motion", save.settings.reduceMotion);
  const show = (id: string, n: number) => {
    const text = dev ? "∞" : String(whole(n)), before = shown.get(id);
    el(id).textContent = text;
    shown.set(id, text);
    if (before !== undefined && Number(text) > Number(before)) replay(el(id).closest(".currency"), "gain");
  };
  show("gold", save.gold);
  show("iron", save.ironBar);
  show("steel", save.steelBar);
  show("knowledge", save.knowledge);
  const level = levelForXp(save.xp), from = xpForLevel(level), to = xpForLevel(level + 1);
  show("level", level);
  el("xp-fill").style.width = `${((save.xp - from) / (to - from)) * 100}%`;
}
/** Saves and refreshes the currency bar. */
function update() {
  store();
  refreshCurrencies();
}
function renderPage() {
  if (tab === "defend") defendPage.show();
  if (tab === "mine") minePage.show();
  if (tab === "library") libraryPage.show();
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

/** Training completes on the wall clock, whatever page shows; so do the
 * mine's and the library's work, saved every half minute they pay. */
let lastTick = 0, lastMineSave = 0;
function frame(time: number) {
  minePage.advance(clock());
  libraryPage.advance(clock());
  if (tab === "defend") defendPage.frame(time);
  if (tab === "mine") minePage.frame(time);
  if (tab === "library") libraryPage.frame(time);
  if (mineDirty && time - lastMineSave > 30000) {
    lastMineSave = time;
    store();
  }
  if (tab === "upgrades") skillTree.drawParticles(time);
  if (time - lastTick >= 1000) {
    lastTick = time;
    const done = settleTraining(save, clock()) > 0;
    if (done) {
      update();
      play("trained");
    }
    if (tab === "upgrades") skillTree.tick(done);
  }
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", store);
window.addEventListener("pagehide", store);

// Console helper: fast-forward a running defense, optionally forcing the weather.
(globalThis as { defendDebug?: unknown }).defendDebug = (seconds = 30, weather?: Weather) => defendPage.fastForward(seconds, weather);
// Console helper: furnish the library (shelves built and stocked at once),
// run it some seconds ahead, and optionally set a table alight.
(globalThis as { libraryDebug?: unknown }).libraryDebug = (shelves = 20, librarians = 4, seconds = 60, fire = false) => {
  libraryPage.sim.furnish(shelves);
  for (let i = 0; i < librarians; i++) libraryPage.sim.hire();
  for (let t = 0; t < seconds * 10; t++) libraryPage.sim.step(0.1);
  if (fire) libraryPage.sim.ignite();
};
// Console helper: run the mine some minutes ahead, optionally hiring miners first.
(globalThis as { mineDebug?: unknown }).mineDebug = (minutes = 10, hire = 0, weather?: MineWeather | null) => {
  for (let i = 0; i < hire; i++) minePage.sim.hire();
  if (weather !== undefined) minePage.sim.weatherOverride = weather;
  minePage.fastForward(minutes);
};

settleTraining(save, clock());
navigate("defend");
requestAnimationFrame(frame);
