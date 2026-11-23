import { syncEquipment } from "./equipment.ts";
import { deferWilds, settleWilds } from "./defend/wilds.ts";
import { realmActive, realmPower } from "./realm.ts";
import { DayClock, useDayClock, sunSpeed } from "./daylight.ts";
import { ProfileEditor } from "./profile/editor.ts";
import { loadArtOverrides } from "./defend/art-overrides.ts";
import { defaults, load, persist, type Save } from "./save.ts";
import { countdown, MAX_AWAY_MS } from "./away.ts";
import { DefendPage } from "./defend/ui.ts";
import { spendMetals } from "./metals.ts";
import { bonuses, busySmiths, payWave, settleTraining, skillRank, skillTotal, whole } from "./progression.ts";
import { settleResearch } from "./research-jobs.ts";
import { settleForge } from "./forge-jobs.ts";
import type { AppContext } from "./ui/app.ts";
import { el, TAB_ICONS, type Tab } from "./ui/dom.ts";
import { paintTabIcon, tabIconHtml } from "./ui/tab-icons.ts";
import { buildShell } from "./ui/shell.ts";
import { AmbushPage } from "./campaign/ambush-ui.ts";
import { SiegePage } from "./campaign/siege-ui.ts";
import { CombatTab, nextCombatMode, type CombatMode } from "./ui/combat-tab.ts";
import { Ledger } from "./ui/ledger.ts";
import { TilesPage } from "./ui/tiles-page.ts";
import { Chamber, Descent } from "./ui/chamber.ts";
import { paintIcon, type IconItem } from "./defend/structure-art.ts";
import { onPixelArt, setPixelArt } from "./defend/pixel-sprites.ts";
import { setSceneryOutlines, setStillAir } from "./defend/scenery-looks.ts";
import { setAngleView, setLegacyWalls } from "./defend/city-layer.ts";
import { ORTHO_PARTS, setOrthogonal, type OutlinePart } from "./defend/outline-corners.ts";
import { renderSettingsPage } from "./ui/settings-page.ts";
import type { Weather } from "./defend/weather.ts";
import { play, soundEnabledBy } from "./sound.ts";
import { hear, QUIET } from "./ambience.ts";
import { flourishesEnabledBy, replay, sparks, sparksOver } from "./ui/flourish.ts";
import { MinePage } from "./mine/ui.ts";
import { METALS, type Weather as MineWeather } from "./mine/sim.ts";
import { LibraryPage } from "./library/ui.ts";
import { stream } from "./random.ts";
import { popIdle } from "./ui/idle-pop.ts";
import { bindShop, refreshShop, shopPageHtml, type ShopHost } from "./ui/shop.ts";
import { landscape } from "./ui/landscape.ts";
import { AD_IDLE_MS, adReady, adWatched, bankIdle, drawIdle, IDLE_SITES, idleLabel, POP_FROM_MS, type IdleSite } from "./idle-bank.ts";
import { unlockAllTowers } from "./defend/progress.ts";
import { ROSES, setRose, type Rose } from "./ui/hall-art.ts";
import { fitViewport } from "./ui/viewport.ts";
import { setLanguage, translateWithin } from "./i18n/index.ts";
import { installSeal } from "./ui/seal-art.ts";
import { EssenceGlob } from "./ui/currency-icons.ts";
import { installScrollArrows } from "./ui/scroll-arrows.ts";
import { Tutorial } from "./ui/tutorial.ts";
import { GameSelect, gameFromAddress, type Game } from "./ui/game-select.ts";

// Wires the pages together: builds the shell, loads the save, and routes
// navigation, the currency bar and the frame loop between the pages.

/** Each outline part's setting (`outline-corners.ts`). */
const ORTHO_SETTING = { buildings: "orthoBuildings", troops: "orthoTroops", enemies: "orthoEnemies", blight: "orthoBlight" } as const satisfies Record<OutlinePart, string>;
function applyOrthogonal() { for (const part of ORTHO_PARTS) setOrthogonal(part, save.settings[ORTHO_SETTING[part]]); }
let save: Save = load();
let equipmentLayout = save.defend.layout;
setLanguage(save.settings.language);
fitViewport();
setLegacyWalls(save.settings.legacyWalls);
setAngleView(save.settings.angleView);
applyOrthogonal();
installSeal();
buildShell(document.querySelector<HTMLDivElement>("#app")!, save.settings.legacyGraphics);
installScrollArrows();
let shownLegacyGraphics = save.settings.legacyGraphics;
document.querySelectorAll<HTMLCanvasElement>("nav canvas[data-icon]").forEach((c) => paintIcon(c, "cityTile"));
// Refresh icons after the visual setting changes, once a frame at most.
let iconsQueued = false;
onPixelArt(() => {
  if (iconsQueued) return;
  iconsQueued = true;
  requestAnimationFrame(() => {
    iconsQueued = false;
    document.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, (c.closest("nav") ? "cityTile" : c.dataset.icon) as IconItem));
  });
});
let tab: Tab = "defend";
let combatMode: CombatMode = "defend";
/** Which game is being played: the start screen chooses (`game-select.ts`). */
let game: Game = "defendSiege";
/** Whether Siege and the Shop have tabs of their own: always in landscape,
 * in portrait with the setting; never in the Ambush game. */
const splitTabs = () => game !== "ambush" && (landscape() || save.settings.extraTabs);
let split: boolean | null = null;
const clock = () => Date.now();
const dayClock = new DayClock(save.dayClock);
useDayClock(dayClock, () => save.settings);
const modal = el("modal") as HTMLDialogElement;
/** What the Shop's panels act on (`ui/shop.ts`). */
const shopHost: ShopHost = {
  save: () => save,
  clock,
  modal,
  rewardAd: (from) => {
    adWatched(save.shop, clock());
    grantIdle(AD_IDLE_MS, from);
    play("coin");
    update();
    refreshShop(document, save, clock());
  },
  // A stand-in until a store is wired in: owning the game is a flag.
  buy: () => {
    save.shop.owned = true;
    play("coin");
    update();
    refreshShop(document, save, clock());
  },
  update: () => update(),
};
const ctx: AppContext = {
  save: () => save,
  modal,
  update,
  renderPage,
  navigate,
  clock,
  smiths: () => realmActive(save,"mine") ? smithNames() : [],
  researchers: () => realmActive(save,"library") ? libraryPage.sim.count("researcher") : 0,
  researched: () => libraryPage.sim.researched(),
  openChamber,
  openTree: (target) => {
    if (game === "ambush" || !defendPage.canOpenTree()) return false;
    combatMode = "defend";
    navigate("defend");
    defendPage.openTree(target);
    return true;
  },
  devChanged: () => {
    if (save.settings.devTowers) unlockAllTowers(save.defend);
    update();
  },
  changeLanguage: language => {
    save.settings.language = language;
    setLanguage(language);
    translateWithin(document);
    update();
    renderSettingsPage(ctx);
  },
  addIdle,
  chooseGame: () => gameSelect.show(),
  shopInSettings: () => game !== "ambush" && !splitTabs(),
  shop: shopHost,
  replayTutorial: () => {
    save.tutorial = [];
    store();
    navigate("defend");
  },
  eraseAll: () => {
    tutorial.close();
    save = defaults();
    dayClock.elapsed = 0; dayClock.reset();
    awayMs = 0;
    minePage.load(null, clock());
    libraryPage.load(null, clock());
    ambushPage.reset();
    siegePage.reset();
    update();
    chooseProfile();
  },
};
const reduced = () => save.settings.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The first-time tutorial; each lesson, once read, is kept in the save. */
const tutorial = new Tutorial({
  seen: () => save.tutorial,
  finish: (id) => {
    if (!save.tutorial.includes(id)) save.tutorial.push(id);
    store();
  },
  reduceMotion: reduced,
});
const combatTab = new CombatTab(document.querySelector<HTMLButtonElement>('nav [data-tab="defend"]')!, reduced, () => save.settings.legacyGraphics);
const tilesPage = new TilesPage(ctx, el("tiles"));
/** The rooms below the Mine and the Library, and the way down to each. */
const smithyRoom = new Chamber(el("mine-chamber"), "planks"), studyRoom = new Chamber(el("library-chamber"), "vault");
const smithy = new Ledger(ctx, smithyRoom.content, "smithy", () => mineDown.go(false));
const study = new Ledger(ctx, studyRoom.content, "study", () => libraryDown.go(false));
const mineDown = new Descent(el("mine"), "mine", reduced), libraryDown = new Descent(el("library"), "library", reduced);
/** Goes to the Mine's Smithy or the Library's Study, open at a topic. */
function openChamber(where: "smithy" | "study", topic?: string) {
  if(!realmActive(save,where==="smithy"?"mine":"library")){navigate("tiles");return;}
  const ledger = where === "smithy" ? smithy : study;
  if (topic) ledger.focus(topic);
  navigate(where === "smithy" ? "mine" : "library");
  ledger.render();
  (where === "smithy" ? mineDown : libraryDown).go(true);
}
const defendPage = new DefendPage(el("defend"), {
  save: () => save.defend,
  bonuses: (game) => bonuses(game ?? save),
  game: () => save,
  spentKnowledge: () => { store(); refreshCurrencies(); },
  clock,
  researchers: () => ctx.researchers(),
  openChamber,
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
  earnEssence: (amount) => { save.essence += amount; store(); refreshCurrencies(); },
  persist: store,
  reduceMotion: () => save.settings.reduceMotion,
  tutorial,
  healthbars: () => save.settings.showHealthbars,
  simpleEnemies: () => save.settings.simpleEnemies,
  simpleTroops: () => save.settings.simpleTroops,
  mergedOutlines: () => save.settings.mergedOutlines,
  hdSand: () => save.settings.hdSand,
  pixelPortals: () => save.settings.pixelPortals,
  resolution: () => save.settings.resolution,
  ultraGraphics: () => save.settings.ultraGraphics,
  setHealthbars: (value) => { save.settings.showHealthbars = value; store(); },
  crispZoom: () => save.settings.crispZoom,
  frameTimes: () => save.settings.developerMode && save.settings.devFrameTimes,
  lighting: () => !(save.settings.developerMode && save.settings.devNoLighting),
  setCrispZoom: (value) => { save.settings.crispZoom = value; store(); },
  angleView: () => save.settings.angleView,
  setAngleView: (value) => { save.settings.angleView = value; setAngleView(value); store(); },
  orthogonal: (part) => save.settings[ORTHO_SETTING[part]],
  setOrthogonal: (part, value) => { save.settings[ORTHO_SETTING[part]] = value; setOrthogonal(part, value); store(); },
  showEmpty: () => save.settings.showEmpty,
  dragRally: () => save.settings.dragRally,
  menuSizing: () => save.settings.menuSizing,
  ringMenu: () => save.settings.ringMenu,
  dragCrosshair: () => save.settings.dragCrosshair,
  raiseDrag: () => save.settings.raiseDrag,
  magnifier: () => save.settings.magnifier,
  tripleTapFlag: () => save.settings.tripleTapFlag,
  gridLines: () => (save.settings.tileGrid ? save.settings.gridOpacity / 100 : 0),
  gridColor: () => save.settings.gridColor,
  highlight: () => save.settings.highlightBuildings ? { alpha: save.settings.highlightOpacity / 100, walls: save.settings.highlightWalls, realm: save.settings.highlightRealm } : null,
  effects: () => !save.settings.effectsOff,
  devMode: () => save.settings.developerMode,
  allJournal: () => save.settings.developerMode && save.settings.devJournal,
  openTiles: () => navigate("tiles"),
});

const ambushPage = new AmbushPage(el("ambush"), { save: () => save, store });
const siegePage = new SiegePage(el("siege"), { save: () => save, store, editProfile: () => chooseProfile() });

const minePage = new MinePage(el("mine-world"), {
  active:()=>realmActive(save,"mine"), efficiency:()=>realmPower(save,"minerEfficiency"), power:()=>realmPower(save,"minerPower"),
  metals: () => save.smithy,
  free: () => save.settings.devMode,
  spendMetals: (price) => {
    spendMetals(save.smithy, price, save.settings.devMode);
    update();
  },
  earn: (points) => {
    for (const k of METALS) save.smithy[k] += points[k];
    mineDirty = true;
    refreshCurrencies();
    if (tab === "mine" && mineDown.below) smithy.render();
    if (tab === "tiles") tilesPage.refresh();
  },
  upgrades: () => ({ coffee: skillRank(save, "coffee"), waterproof: skillRank(save, "waterproofing"), carts: skillRank(save, "mineCarts") > 0, oreSense: skillRank(save, "oreSense") > 0, smiths: skillTotal(save, "smiths") }),
  busySmiths: () => busySmiths(save),
  effects: () => !save.settings.effectsOff,
  newSeed: () => Math.floor(stream("game")() * 4294967296),
  modal,
  store: () => store(),
  descend: () => openChamber("smithy"),
});
const libraryPage = new LibraryPage(el("library-world"), {
  active:()=>realmActive(save,"library"), efficiency:()=>realmPower(save,"librarianEfficiency"), power:()=>realmPower(save,"librarianPower"),
  metals: () => save.smithy,
  free: () => save.settings.devMode,
  spendMetals: (price) => {
    spendMetals(save.smithy, price, save.settings.devMode);
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
  upgrades: () => ({ fireproof: skillRank(save, "fireproofWood"), fireTraining: skillRank(save, "fireTraining"), nightWatch: skillRank(save, "nightWatch"), enchant: skillRank(save, "enchantedInk") }),
  showing: () => tab === "library",
  descend: () => openChamber("study"),
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
/** The Mine's or the Library's page. */
const sitePage = (site: IdleSite) => site === "mine" ? minePage : libraryPage;
const siteButton = (site: IdleSite) => document.querySelector<HTMLButtonElement>(`nav [data-tab="${site}"]`)!;
// Time away while the Mine or the Library stood out of the realm is kept
// for it, to be paid when it is placed again.
for (const site of IDLE_SITES) if (!realmActive(save, site)) bankIdle(save.idleBank, site, awayMs);

/** Pays `ms` of idle time to the Mine and the Library: each one in the
 * realm spends it (anything past its own cap is banked), the others bank
 * it all. The golden figure rises from each paid tab, or from `from` when
 * neither stands in the realm. */
function grantIdle(ms: number, from: Element) {
  const paid: IdleSite[] = [];
  for (const site of IDLE_SITES) {
    if (!realmActive(save, site)) { bankIdle(save.idleBank, site, ms); continue; }
    const page = sitePage(site), give = Math.min(ms, Math.max(0, MAX_AWAY_MS - page.owedMs));
    page.addAway(give);
    bankIdle(save.idleBank, site, ms - give);
    paid.push(site);
  }
  const label = idleLabel(ms);
  if (paid.length === 0) popIdle(from, label, reduced());
  paid.forEach((site, i) => popIdle(siteButton(site), label, reduced(), i));
}
/** On entering Defend+Siege: the idle time earned while away, rising in
 * gold from the Mine's and the Library's tabs (or from Tiles, if neither
 * stands in the realm and the time went to the bank). */
function greetIdle() {
  if (awayMs < POP_FROM_MS) return;
  const label = idleLabel(Math.min(awayMs, MAX_AWAY_MS));
  const paid = IDLE_SITES.filter((site) => realmActive(save, site));
  if (paid.length === 0) popIdle(document.querySelector('nav [data-tab="tiles"]')!, idleLabel(awayMs), reduced());
  paid.forEach((site, i) => popIdle(siteButton(site), label, reduced(), i));
}
/** Keeps idle time for a workshop taken out of the realm, and pays a
 * workshop back in the realm from its bank, each frame. */
function settleBank() {
  for (const site of IDLE_SITES) {
    const page = sitePage(site);
    if (!realmActive(save, site)) {
      if (page.owedMs >= 1000) bankIdle(save.idleBank, site, page.owedMs);
      continue;
    }
    if (save.idleBank[site] < 1000) continue;
    const take = drawIdle(save.idleBank, site, page.owedMs);
    if (take === 0) continue;
    page.addAway(take);
    if (take >= POP_FROM_MS) popIdle(siteButton(site), idleLabel(take), reduced());
    mineDirty = true;
  }
}

const profileEditor = new ProfileEditor();
function chooseProfile() {
  const first = !save.profile;
  profileEditor.open(save.profile, profile => { save.profile = profile; update(); }, () => {
    renderPage();
    if (first) greetIdle();
  });
}

/** Dev: idle time for both simulations, as if the game had been closed
 * that long. Their gains appear as they fast-forward. */
function addIdle(ms: number) {
  grantIdle(ms, document.querySelector('nav [data-tab="settings"]')!);
  if (save.trainingClock) save.trainingClock -= ms;
  if (save.researchJob) save.researchClock -= ms;
  if (save.forgeJob) save.forgeClock -= ms;
  update();
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
  if(equipmentLayout!==save.defend.layout){syncEquipment(save.equipment,save.defend.layout,equipmentLayout);equipmentLayout=save.defend.layout;}
  refreshRealmAccess();
  save.dayClock = dayClock.elapsed;
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
  if (setLanguage(save.settings.language)) translateWithin(document);
  const dev = save.settings.devMode;
  document.documentElement.classList.toggle("reduce-motion", save.settings.reduceMotion);
  document.documentElement.classList.toggle("pixel-font", save.settings.pixelFont);
  document.documentElement.classList.toggle("legacy-graphics", save.settings.legacyGraphics);
  setPixelArt(save.settings.pixelArt);
  setLegacyWalls(save.settings.legacyWalls);
  setAngleView(save.settings.angleView);
  applyOrthogonal();
  setSceneryOutlines(save.settings.sceneryOutlines);
  setStillAir(save.settings.stillAir);
  const show = (id: string, n: number) => {
    const value = whole(n), before = shown.get(id);
    el(id).textContent = dev ? "∞" : compact(value);
    el(id).title = dev ? "" : value.toLocaleString();
    shown.set(id, value);
    if (!dev && before !== undefined && value > before) replay(el(id).closest(".currency"), "gain");
  };
  show("copper", save.smithy.copper);
  show("silver", save.smithy.silver);
  show("gold", save.smithy.gold);
  show("knowledge", save.knowledge);
  show("upgrade-points", save.upgradePoints);
  show("essence", save.essence);
}
/** Placement persists directly from Defend, so update access on every save. */
function refreshRealmAccess() {
  for (const id of ['mine','library'] as const) {
    const button=document.querySelector<HTMLButtonElement>(`nav [data-tab="${id}"]`)!;
    const unlocked=realmActive(save,id);button.disabled=!unlocked;
    button.title=unlocked?'':`Place the ${id==='mine'?'Mine':'Library'} tile in your city to unlock this tab.`;
  }
}
/** The start screen; picking a game opens it on its first page. */
const gameSelect = new GameSelect(pick => playGame(pick));
/** Whether the frame loop runs, and whether Defend+Siege has greeted the player yet. */
let looping = false, greeted = false;
/** Opens `next`: Ambush alone (its tab and Settings), or the realm with Defend
 * and Siege on the combat tab and the Mine, Library and Tiles beside it. */
function playGame(next: Game) {
  game = next;
  const ambush = next === "ambush";
  document.querySelector(".shell")!.classList.toggle("ambush-game", ambush);
  for (const id of ["mine", "library", "tiles"] as const)
    document.querySelector<HTMLButtonElement>(`nav [data-tab="${id}"]`)!.hidden = ambush;
  combatMode = ambush ? "ambush" : "defend";
  layoutTabs();
  navigate("defend");
  if (!looping) { looping = true; requestAnimationFrame(frame); }
  if (!ambush && !greeted) {
    greeted = true;
    if (save.profile) greetIdle();
    else chooseProfile();
  }
}
/** Saves and refreshes the currency bar. */
function update() {
  store();
  refreshCurrencies();
  layoutTabs();
  combatTab.render(split ? "defend" : combatMode, !split && tab === "defend");
  if (shownLegacyGraphics !== save.settings.legacyGraphics) {
    shownLegacyGraphics = save.settings.legacyGraphics;
    for (const id of ["siege", "settings"] as const) {
      const icon = document.querySelector<HTMLElement>(`nav [data-tab="${id}"] > span`)!;
      icon.innerHTML = shownLegacyGraphics ? tabIconHtml(id) : TAB_ICONS[id];
      if (shownLegacyGraphics) paintTabIcon(icon.querySelector("canvas")!, id);
    }
  }
}
function renderPage() {
  if (tab === "defend" && combatMode === "defend") defendPage.show();
  if (tab === "defend" && combatMode === "ambush") ambushPage.show();
  if (tab === "defend" && combatMode === "siege") siegePage.show();
  if (tab === "mine") minePage.show();
  if (tab === "library") libraryPage.show();
  if (tab === "mine" && mineDown.below) smithy.render();
  if (tab === "library" && libraryDown.below) study.render();
  if (tab === "tiles") tilesPage.render();
  if (tab === "shop") {
    el("shop").innerHTML = shopPageHtml(save, clock());
    bindShop(el("shop"), shopHost);
  }
  if (tab === "settings") renderSettingsPage(ctx);
}
/** The currency sign hangs over these tabs only. */
const signTab = (id: Tab) => id === "mine" || id === "library" || id === "tiles";
const essenceGlob = new EssenceGlob(document.querySelector<HTMLCanvasElement>('canvas[data-currency-icon="essence"]'));
function navigate(id: Tab) {
  if ((id === "mine" || id === "library") && !realmActive(save,id)) { id="tiles"; }
  if (id !== "defend" || combatMode !== "defend") defendPage.pause();
  ambushPage.pause();
  siegePage.pause();
  tab = id;
  document.querySelector(".shell")!.classList.toggle("show-currencies", signTab(id));
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === (id === "defend" ? combatMode : id)));
  markSelected();
  renderPage();
  update();
}
/** Lights the tab that is showing: Siege's own, when it has one. */
function markSelected() {
  const shown = split && tab === "defend" && combatMode === "siege" ? "siege" : tab;
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.tab === shown);
    b.setAttribute("aria-current", b.dataset.tab === shown ? "page" : "false");
  });
}
/** Shows or hides the Siege and Shop tabs as the layout and setting say;
 * with them, the Defend tab no longer cycles to Siege and the Shop leaves
 * the Settings page. */
function layoutTabs() {
  const next = splitTabs();
  if (next === split) return;
  split = next;
  for (const id of ["siege", "shop"] as const)
    document.querySelector<HTMLButtonElement>(`nav [data-tab="${id}"]`)!.hidden = !split;
  document.querySelector(".shell")!.classList.toggle("seven-tabs", split);
  if (!split && tab === "shop") { navigate("settings"); return; }
  markSelected();
  combatTab.render(split ? "defend" : combatMode, !split && tab === "defend");
  if (tab === "settings") renderSettingsPage(ctx);
}
window.addEventListener("resize", layoutTabs);
document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => (b.onclick = () => {
  // With tabs of their own, Defend and Siege each go straight to their page.
  if (split && (b.dataset.tab === "defend" || b.dataset.tab === "siege")) {
    combatMode = b.dataset.tab === "siege" ? "siege" : "defend";
    return navigate("defend");
  }
  if (b.dataset.tab === "defend" && tab === "defend") combatMode = nextCombatMode(combatMode);
  // A second tap on Tiles turns to the Shop (and another back to the collection).
  if (b.dataset.tab === "tiles" && tab === "tiles") return tilesPage.toggleShop();
  navigate(b.dataset.tab as Tab);
}));

/** A golden countdown on the Mine's and the Library's tab buttons while
 * they spend idle time, hidden on the tab that is showing. Both show the
 * longer of the two, since they run it down together. */
const idleTabs = (["mine", "library"] as const).map((id) => {
  const button = document.querySelector<HTMLElement>(`nav [data-tab="${id}"]`)!;
  const span = document.createElement("small");
  span.className = "tab-idle";
  span.hidden = true;
  button.prepend(span);
  return { id, span };
});
/** The red dot on the Shop's tab (or Settings', where the Shop is then)
 * while an ad is ready and the player asked to be told. */
const adDots = (["shop", "settings"] as const).map((id) => {
  const button = document.querySelector<HTMLElement>(`nav [data-tab="${id}"]`)!;
  const dot = document.createElement("i");
  dot.className = "tab-dot";
  dot.hidden = true;
  dot.setAttribute("aria-hidden", "true");
  button.append(dot);
  return { id, dot };
});
function adNotice() {
  const ready = game !== "ambush" && save.settings.adNotify && adReady(save.shop, clock());
  for (const { id, dot } of adDots) {
    const hide = !ready || id !== (split ? "shop" : "settings");
    if (dot.hidden !== hide) dot.hidden = hide;
  }
  if (tab === "shop" || tab === "settings") refreshShop(el(tab), save, clock());
}
function idleTimers() {
  const left = Math.max(minePage.owedMs, libraryPage.owedMs), text = left >= 1000 ? countdown(left) : "";
  for (const { id, span } of idleTabs) {
    const hide = !text || tab === id;
    if (span.hidden !== hide) span.hidden = hide;
    if (!hide && span.textContent !== text) span.textContent = text;
  }
}

/** Offers the tutorial's Realm lessons: the Mine and the Library once one
 * is first placed, and each tab's buttons the first time it is open (the
 * Defend page offers its own). */
function teach() {
  if (tutorial.open) return;
  const q = (sel: string) => document.querySelector(sel);
  if (tab === "defend" && combatMode === "defend" && defendPage.idle) {
    for (const id of ["mine", "library"] as const) {
      const lesson = id === "mine" ? "minePlaced" : "libraryPlaced";
      if (realmActive(save, id) && tutorial.wants(lesson) && tutorial.offer(lesson, { building: () => defendPage.boardBox(id), tab: () => q(`nav [data-tab="${id}"]`) })) return;
    }
  }
  if (tab === "mine" && !mineDown.below && tutorial.wants("mineTab"))
    tutorial.offer("mineTab", { hire: () => q("#mine-hire"), crew: () => q("#mine-crew-toggle"), buildings: () => q("#mine-buildings-toggle"), metal: () => q("#currencies"), smithy: () => q("#mine-smithy") });
  if (tab === "library" && !libraryDown.below && tutorial.wants("libraryTab"))
    tutorial.offer("libraryTab", { shelf: () => q("#library-shelf"), hire: () => q("#library-hire"), lab: () => q("#library-lab-up"), staff: () => q("#library-staff-toggle"), study: () => q("#library-study") });
}

/** The Smithy's upgrades are worked on the wall clock, whatever page shows; so do the
 * mine's and the library's work, saved every half minute they pay. */
let lastTick = 0, lastMineSave = 0;
function frame(time: number) {
  dayClock.advance(time, !document.hidden, save.settings.dayNightCycle, sunSpeed(save.settings.fasterSunCatchup, minePage.owedMs, libraryPage.owedMs));
  settleBank();
  minePage.advance(clock(), libraryPage.owedMs);
  libraryPage.advance(clock(), minePage.owedMs);
  idleTimers();
  if (tab === "defend" && combatMode === "defend") defendPage.frame(time);
  if (tab === "defend" && combatMode === "ambush") ambushPage.frame(time);
  if (tab === "defend" && combatMode === "siege") siegePage.frame(time);
  // The scene above is drawn only while it is in view, the room below likewise.
  if (tab === "mine" && mineDown.above) minePage.frame(time);
  if (tab === "library" && libraryDown.above) libraryPage.frame(time);
  if (tab === "mine" && mineDown.below) {
    smithyRoom.draw(clock(), reduced());
    smithy.drawParticles(time);
  }
  if (tab === "library" && libraryDown.below) {
    studyRoom.draw(clock(), reduced());
    study.drawCircle(time, reduced());
  }
  if (tab === "tiles") tilesPage.frame(clock());
  if (signTab(tab)) essenceGlob.draw(time, reduced());
  if (mineDirty && time - lastMineSave > 30000) {
    lastMineSave = time;
    store();
  }
  teach();
  hear(save.settings.ambienceOff ? QUIET : tab === "defend" ? defendPage.ambience() : tab === "mine" ? minePage.ambience() : tab === "library" ? libraryPage.ambience() : QUIET);
  if (time - lastTick >= 1000) {
    lastTick = time;
    adNotice();
    const smiths = new Set(realmActive(save,"mine") ? smithNames() : []);
    const trained = settleTraining(save, clock(), smiths) > 0;
    const forged = settleForge(save, clock(), smiths);
    const done = trained || forged;
    const researched = settleResearch(save, clock(), realmActive(save,"library") ? libraryPage.sim.count("researcher") : 0);
    if (researched) libraryPage.sim.researched();
    if (done || researched) {
      update();
      play("trained");
    }
    if (tab === "mine" && mineDown.below) smithy.tick(done);
    if (tab === "library" && libraryDown.below) study.tick(researched);
  }
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => { dayClock.reset(); store(); });
window.addEventListener("pagehide", () => { dayClock.reset(); store(); });
window.addEventListener("pageshow", () => dayClock.reset());

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
// Console helper: enchant `n` of the books on the library's shelves.
(globalThis as { libraryEnchant?: unknown }).libraryEnchant = (n = 10) => {
  const sim = libraryPage.sim, shelved = [...sim.slots.keys()].filter((s) => sim.slots[s] && !sim.enchanted[s]);
  for (let k = 0; k < n && shelved.length; k++) sim.enchanted[shelved.splice(Math.floor(shelved.length * ((k * 0.618) % 1)), 1)[0]] = 1;
};
// Console helper: set the Tiles hall's rose window to one of its glazings (`ROSES`), or none for the night's own.
(globalThis as { tilesRose?: unknown }).tilesRose = (rose?: Rose) => {
  setRose(rose && ROSES.includes(rose) ? rose : null);
  return ROSES;
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

settleTraining(save, clock(), new Set(realmActive(save,"mine") ? smithNames() : []));
settleForge(save, clock(), new Set(realmActive(save,"mine") ? smithNames() : []));
if (settleResearch(save, clock(), realmActive(save,"library") ? libraryPage.sim.count("researcher") : 0)) libraryPage.sim.researched();
// The scenery past the board is painted a slice at a time while the boot
// screen still covers the game (`warmUp`), so its wall keeps building.
deferWilds(true);
navigate("defend");
/** Paints what the first page deferred, a slice at a time, then draws it
 * whole: boot awaits it while its screen still covers the game. */
export async function warmUp() {
  while (settleWilds(10)) await new Promise((resolve) => setTimeout(resolve, 0));
  deferWilds(false);
  renderPage();
}
/** Called after boot uncovers the initialized game; native dialogs must open
 * here so they cannot appear above the loading screen's stone wall. */
export function startGame() {
  // The artist's sprites, if any are saved under `art/sprites/`.
  void import("./defend/art-files.ts").then(({ artFiles }) => loadArtOverrides(artFiles()));
  const asked = gameFromAddress(location.search, navigator.webdriver === true);
  if (asked) playGame(asked);
  else gameSelect.show();
}
