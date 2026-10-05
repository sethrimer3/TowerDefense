import "./style.css";
import "./theme.css";
import { defaults, load, persist, type Save } from "./save.ts";
import { DefendPage } from "./defend/ui.ts";
import { bonuses, busySmiths, payKills, payWave, settleTraining, skillRank, skillTotal, whole } from "./progression.ts";
import type { AppContext } from "./ui/app.ts";
import { el, type Tab } from "./ui/dom.ts";
import { buildShell } from "./ui/shell.ts";
import { SkillTreePage } from "./ui/skill-tree-page.ts";
import { renderSettingsPage } from "./ui/settings-page.ts";
import type { Weather } from "./defend/weather.ts";
import { play, soundEnabledBy } from "./sound.ts";
import { flourishesEnabledBy, replay, sparks, sparksOver } from "./ui/flourish.ts";
import { MinePage } from "./mine/ui.ts";
import { METALS, type Weather as MineWeather } from "./mine/sim.ts";
import { LibraryPage } from "./library/ui.ts";
import { stream } from "./random.ts";
import { WelcomeBack } from "./ui/welcome.ts";
import { unlockAllTowers } from "./defend/progress.ts";

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
  smiths: () => smithNames(),
  researchers: () => libraryPage.sim.count("researcher"),
  researched: () => libraryPage.sim.researched(),
  devChanged: () => {
    if (save.settings.devTowers) unlockAllTowers(save.defend);
    update();
  },
  addIdle,
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
  wallet: () => ({ gold: save.gold, copper: save.copper, silver: save.silver, free: save.settings.devMode }),
  setWallet: (w) => {
    if (save.settings.devMode) return;
    save.gold = w.gold;
    save.copper = w.copper;
    save.silver = w.silver;
  },
  bonuses: () => bonuses(save),
  earnKills: (slain) => {
    payKills(save, slain);
    refreshCurrencies();
  },
  earnWave: (wave) => {
    const r = payWave(save, wave);
    store();
    refreshCurrencies();
    if (r.upgrade > 0) {
      play("levelUp");
      sparksOver(el("upgrade-points"), "arcane");
    }
    return r;
  },
  persist: store,
  reduceMotion: () => save.settings.reduceMotion,
  healthbars: () => save.settings.showHealthbars,
  setHealthbars: (value) => { save.settings.showHealthbars = value; store(); },
  gridLines: () => (save.settings.tileGrid ? save.settings.gridOpacity / 100 : 0),
  effects: () => !save.settings.effectsOff,
  devMode: () => save.settings.devMode,
});

const minePage = new MinePage(el("mine"), {
  gold: () => save.gold,
  free: () => save.settings.devMode,
  spendGold: (n) => {
    save.gold = Math.max(0, save.gold - n);
    update();
  },
  earn: (points) => {
    for (const k of METALS) save.smithy[k] += points[k];
    mineDirty = true;
    if (tab === "upgrades") skillTree.render();
  },
  upgrades: () => ({ coffee: skillRank(save, "coffee"), waterproof: skillRank(save, "waterproofing"), smiths: skillTotal(save, "smiths") }),
  busySmiths: () => busySmiths(save),
  effects: () => !save.settings.effectsOff,
  newSeed: () => Math.floor(stream("game")() * 4294967296),
  modal,
  store: () => store(),
});
const libraryPage = new LibraryPage(el("library"), {
  gold: () => save.gold,
  free: () => save.settings.devMode,
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
  upgrades: () => ({ fireproof: skillRank(save, "fireproofWood"), fireTraining: skillRank(save, "fireTraining"), nightWatch: skillRank(save, "nightWatch") }),
  showing: () => tab === "library",
});
/** The mine or the library has paid out since the last save. */
let mineDirty = false;
/** The mine's smiths, by name. */
const smithNames = () => minePage.sim.miners.filter((m) => m.job === "smith").map((m) => m.name);
/** Time since the Mine and the Library were last saved: the time away. */
const lastSaved = Math.max(save.mine?.savedAt ?? 0, save.library?.savedAt ?? 0);
let awayMs = lastSaved > 0 ? Math.max(0, clock() - lastSaved) : 0;
libraryPage.load(save.library, clock());
minePage.load(save.mine, clock());
const welcome = new WelcomeBack(modal, () => ({
  ms: awayMs,
  knowledge: libraryPage.awayKnowledge,
  shelves: libraryPage.sim.built,
  librarians: libraryPage.sim.librarians.length,
  library: libraryPage.away,
  mine: minePage.away,
  crew: minePage.sim.miners.length,
  owedMs: minePage.owedMs,
}));

/** Dev: `ms` of idle time, as if the game had been closed that long. The
 * Mine works through it a slice each frame (up to its two hours of catch-up,
 * the rest paid at the smithy's pace), the Library is reckoned an hour at a
 * time (it may burn down), the Smithy's smiths work on, and the welcome-back
 * screen keeps the account. */
function addIdle(ms: number) {
  awayMs = ms;
  minePage.addAway(ms);
  libraryPage.addAway(ms);
  if (save.trainingClock) save.trainingClock -= ms;
  update();
  welcome.show(true);
}

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
const shown = new Map<string, number>();
/** A count short enough to share the bar's one line: 9999, 12.4k, 1.23M. */
function compact(n: number) {
  if (n < 10000) return String(n);
  for (const [size, suffix] of [[1e9, "B"], [1e6, "M"], [1e3, "k"]] as const) {
    if (n < size) continue;
    const v = n / size;
    return `${v < 100 ? Math.floor(v * 10) / 10 : Math.floor(v)}${suffix}`;
  }
  return String(n);
}
/** The currency bar, from the save. */
function refreshCurrencies() {
  const dev = save.settings.devMode;
  document.documentElement.classList.toggle("reduce-motion", save.settings.reduceMotion);
  document.documentElement.classList.toggle("pixel-font", save.settings.pixelFont);
  const show = (id: string, n: number) => {
    const value = whole(n), before = shown.get(id);
    el(id).textContent = dev ? "∞" : compact(value);
    el(id).title = dev ? "" : value.toLocaleString();
    shown.set(id, value);
    if (!dev && before !== undefined && value > before) replay(el(id).closest(".currency"), "gain");
  };
  show("copper", save.copper);
  show("silver", save.silver);
  show("gold", save.gold);
  show("knowledge", save.knowledge);
  show("upgrade-points", save.upgradePoints);
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

/** The Smithy's upgrades are worked on the wall clock, whatever page shows; so do the
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
  welcome.refresh();
  if (tab === "upgrades") skillTree.drawParticles(time);
  if (time - lastTick >= 1000) {
    lastTick = time;
    const done = settleTraining(save, clock(), new Set(smithNames())) > 0;
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
// Console helper: raise the alchemy lab to `level` (free) and fill it with researchers.
(globalThis as { libraryLab?: unknown }).libraryLab = (level = 5) => {
  const sim = libraryPage.sim;
  while (sim.labLevel < level && sim.upgradeLab());
  for (const l of [...sim.librarians].reverse()) if (sim.count("researcher") < sim.researcherCap && l.role !== "researcher") sim.setRole(l, "researcher");
};
// Console helper: look closely at one of the mine's buildings, picked.
(globalThis as { mineLook?: unknown }).mineLook = (id: "shaft" | "barracks" | "warehouse" | "forge" | "smithy" = "forge", zoom = 4) => minePage.look(id, zoom);
// Console helper: run the mine some minutes ahead, optionally hiring miners first.
// Sets a Mine building's level at once, or (with no level) upgrades it for free, rebuild and all.
(globalThis as { mineLevel?: unknown }).mineLevel = (id: "shaft" | "barracks" | "warehouse" | "forge" | "smithy", level?: number) =>
  level === undefined ? minePage.sim.upgrade(id) : minePage.sim.setLevel(id, level);
(globalThis as { mineDebug?: unknown }).mineDebug = (minutes = 10, hire = 0, weather?: MineWeather | null) => {
  for (let i = 0; i < hire; i++) minePage.sim.hire();
  if (weather !== undefined) minePage.sim.weatherOverride = weather;
  minePage.fastForward(minutes);
};

settleTraining(save, clock(), new Set(smithNames()));
navigate("defend");
welcome.show();
requestAnimationFrame(frame);
