import { journalHTML, paintJournal } from "./journal.ts";
/** The DEFEND page: a City tab (palette + board) and an Armory tab (buy
 * city elements, bombs and universal upgrades with what battles earn).
 *
 * Build phase: drag city elements from the palette (a side panel that
 * slides in beside the board's view) onto gold-outlined
 * tiles; drag placed ones around, or back to the palette to pick them up.
 * Once the defense starts, the palette becomes the consumables palette and
 * waves roll in without stopping until the keep falls. */
import {
  ENEMIES,
  BOMB_PRICE,
  BOMB_RADIUS,
  SPEED3_PRICE,
  PALETTE_ITEMS,
  STRUCTURES,
  UPGRADES,
  footprint,
  purchasePrice,
  shareName,
  upgradePrice,
  type Bonuses,
  type EnemyKind,
  type PaletteItem,
  type Price,
} from "./catalog.ts";
import { TILES_H, TILES_W, defendRandom } from "./grid.ts";
import { fitLayout, type Layout } from "./layout.ts";
import { generateCity, type CityMap } from "./citygen.ts";
import { DefendSim } from "./sim.ts";
import { DefendRenderer } from "./render.ts";
import { BattlePerformance } from "./performance.ts";
import type { Overlay } from "./edit-overlay.ts";
import { paintIcon, type IconItem } from "./structure-art.ts";
import { BoardPointers, eventCell } from "./board-pointers.ts";
import type { Drag } from "./drag-rules.ts";
import { EditSession, type Drop } from "./edit-session.ts";
import { NIGHT_FADE_SECONDS, isBossWave, rollWeather, skyLabel, type Weather } from "./weather.ts";
import { play } from "../sound.ts";
import { replay, sparksOver } from "../ui/flourish.ts";
import { available, buyBomb, buyItem, buySpeed3, buyUpgrade, canAfford, type DefendSave, type Wallet } from "./progress.ts";
import { ageWater } from "./boats.ts";

export type DefendHost = {
  save(): DefendSave;
  wallet(): Wallet;
  setWallet(w: Wallet): void;
  /** The Smithy's and the skill trees' multipliers for the next defense. */
  bonuses(): Bonuses;
  /** Pays Gold for enemies slain. */
  earnKills(slain: Partial<Record<EnemyKind, number>>): void;
  /** Pays for holding `wave` (called before the best wave is raised). */
  earnWave(wave: number): { gold: number; copper: number; silver: number; knowledge: number; upgrade: number };
  persist(): void;
  reduceMotion(): boolean;
  /** The park grass and pond effects are on. */
  effects(): boolean;
  devMode(): boolean;
  healthbars?(): boolean;
  setHealthbars?(value: boolean): void;
};

const ITEM_NAMES: Record<PaletteItem, string> = {
  cityTile: "City tile",
  barracks: STRUCTURES.barracks.name,
  archerBarracks: STRUCTURES.archerBarracks.name,
  archerTower: STRUCTURES.archerTower.name,
  cannonTower: STRUCTURES.cannonTower.name,
  watchTower: STRUCTURES.watchTower.name,
  wizardTower: STRUCTURES.wizardTower.name,
  mageGuild: STRUCTURES.mageGuild.name,
  valkyriePalace: STRUCTURES.valkyriePalace.name,
  darkKeep: STRUCTURES.darkKeep.name,
  monsterBait: STRUCTURES.monsterBait.name,
};

const plural = (name: string) => (name.endsWith("s") ? name : `${name}s`);

export class DefendPage {
  private host: DefendHost;
  private root: HTMLElement;
  private tab: "city" | "armory" = "city";
  private phase: "build" | "sim" | "over" = "build";
  private map: CityMap | null = null;
  private mapLayout: Layout | null = null;
  private sim: DefendSim | null = null;
  private renderer: DefendRenderer | null = null;
  private pointers = new BoardPointers({
    renderer: () => this.renderer,
    pickUp: (e) => this.pickUp(e),
    drop: (drop) => this.drop(drop),
  });
  private lastTime = 0;
  private performance = new BattlePerformance();
  private performanceEnd: string | null = null;
  private message = "";
  private messageT = 0;
  private newRecord = 0;
  private built = false;
  private weather: Weather | null = null;
  /** How far night has fallen (0–1); it follows boss waves. */
  private night = 0;
  /** Abandon needs a second click within a few seconds. */
  private abandonArmed = 0;
  private settingsOpen = false;
  private journal: HTMLDialogElement | null = null;
  /** Whether the side panel is open in each phase: the build palette starts
   * open, the battle's items closed so the battle has the whole view. */
  private sideOpen = { build: true, sim: false };
  /** Kills already paid for this run, by kind. */
  private paid: Record<EnemyKind, number> = { roach: 0, orc: 0, ogre: 0, bat: 0, warlord: 0, mother: 0, broodling: 0, snake: 0, dragon: 0, shieldBearer: 0, aegis: 0, darkKnight: 0, bombOrc: 0, bombBird: 0, voidSparrow: 0, shieldLesser: 0, shieldGreater: 0, poisonLesser: 0, poisonBearer: 0, poisonGreater: 0, poisonSovereign: 0, siegeBeetle: 0, burrowingMole: 0, necromancer: 0, skeleton: 0, bannerCaptain: 0, mirrorKnight: 0, leechSwarm: 0, ashPhoenix: 0, phoenixEgg: 0, blinkImp: 0, fortressLesser: 0, fortress: 0, fortressGreater: 0, fortressSovereign: 0, rollingCannon: 0, ballista: 0, fireworkLauncher: 0, trebuchet: 0, bombard: 0, rocketBattery: 0, boatLesser: 0, boat: 0, boatGreater: 0, boatSovereign: 0 };

  constructor(root: HTMLElement, host: DefendHost) {
    this.root = root;
    this.host = host;
    window.addEventListener("resize", () => this.layoutBoard());
    document.addEventListener('visibilitychange', () => { this.lastTime = 0; });
  }

  /** Called when the DEFEND tab is shown (or its data changed elsewhere). */
  show() {
    this.lastTime = 0;
    if (!this.built) this.build();
    this.renderChrome();
    this.relayout();
  }

  /** Called every animation frame while the tab is visible. */
  frame(time: number) {
    const dt = this.lastTime ? (time - this.lastTime) / 1000 : 0;
    this.lastTime = time;
    if (!this.built || this.tab !== "city") return;
    const measuring = this.sim && this.phase === "sim";
    const start = performance.now();
    if (this.sim && this.phase === "sim") {
      if (!this.journal?.open) this.sim.update(dt);
      this.handleEvents();
    } else if (this.sim && this.phase === "over" && (this.sim.floods.length || this.sim.sinkings.length)) ageWater(this.sim, Math.min(dt, 0.25));
    const updated = performance.now();
    this.fadeNight(dt);
    if (this.messageT > 0) {
      this.messageT -= dt;
      if (this.messageT <= 0) this.setMessage("");
    }
    const drawing = performance.now();
    this.draw();
    const drawn = performance.now();
    if (measuring && this.sim && !document.hidden) {
      this.performance.sample(this.sim.wave, this.sim.enemies.length, dt * 1000, updated - start, drawn - drawing);
      if (this.performanceEnd) this.performance.finish(this.performanceEnd);
      this.performanceEnd = null;
    }
    if (this.phase === "sim") this.updateHud();
  }

  /** Developer aid: advance the running defense by `seconds` at once,
   * optionally forcing the weather. */
  fastForward(seconds: number, weather?: Weather) {
    if (!this.sim || this.phase !== "sim") return;
    this.performance.finish('fast-forward');
    if (weather) this.weather = weather;
    for (let t = 0; t < seconds && this.phase === "sim"; t += 0.25) {
      this.sim.update(0.25 / this.sim.speed);
      this.handleEvents();
      this.fadeNight(0.25);
    }
    this.performanceEnd = null;
    this.draw();
    this.updateHud();
  }

  /** Night falls while a boss wave is being fought and lifts once it's won. */
  private fadeNight(dt: number) {
    const sim = this.sim;
    const fighting = !!sim && this.phase !== "build" && isBossWave(sim.wave) && (sim.spawnQueue.length > 0 || sim.enemies.length > 0 || this.phase === "over");
    const target = fighting ? 1 : 0;
    const step = dt / NIGHT_FADE_SECONDS;
    this.night = target > this.night ? Math.min(target, this.night + step) : Math.max(target, this.night - step);
  }

  /** Pause bookkeeping when the tab is hidden, so time doesn't jump. */
  pause() {
    this.lastTime = 0;
    this.pointers.end();
  }

  private get save() {
    return this.host.save();
  }

  // ── DOM ───────────────────────────────────────────────────────────────
  private build() {
    this.built = true;
    this.root.innerHTML = `
      <div class="defend-head">
        <div class="defend-left" id="defend-left"></div>
        <div class="defend-hud" id="defend-hud"></div>
        <button class="defend-journal-button" id="defend-journal" aria-label="Enemy journal" aria-haspopup="dialog"><canvas width="20" height="20"></canvas></button>
        <button class="defend-cog" id="defend-cog" aria-label="Defend settings" aria-expanded="false">⚙</button>
        <div class="defend-settings" id="defend-settings" hidden></div>
      </div>
      <div class="defend-city" id="defend-city">
        <div class="defend-stage" id="defend-stage">
          <aside class="defend-side" id="defend-side" aria-label="Palette"><div class="defend-palette" id="defend-palette"></div></aside>
          <div class="defend-board" id="defend-board"><canvas id="defend-canvas" aria-label="City defense board. Scroll or pinch to zoom, drag to pan."></canvas>
            <div class="defend-banner" id="defend-banner" hidden></div>
            <div class="defend-message" id="defend-message" aria-live="polite"></div></div>
        </div>
      </div>
      <div class="defend-armory" id="defend-armory" hidden></div>
      <dialog class="defend-journal-dialog" aria-labelledby="defend-journal-title"></dialog>`;
    this.renderer = new DefendRenderer(this.root.querySelector("#defend-canvas")!);
    const canvas = this.renderer.canvas;
    canvas.addEventListener("pointerdown", (e) => this.pointers.down(e));
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.renderer!.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
    this.journal = this.root.querySelector<HTMLDialogElement>(".defend-journal-dialog")!;
    this.journal.addEventListener("close", () => { this.lastTime = 0; this.root.querySelector<HTMLButtonElement>("#defend-journal")!.focus(); });
    this.root.querySelector<HTMLButtonElement>("#defend-journal")!.onclick = () => {
      this.journal!.innerHTML = journalHTML(this.save.discovered);
      this.journal!.querySelector<HTMLButtonElement>("[data-journal-close]")!.onclick = () => this.journal!.close();
      this.journal!.showModal();
      this.save.journalRead = [...this.save.discovered];
      this.host.persist();
      this.refreshJournal();
    };
    this.refreshJournal();
    const cog = this.root.querySelector<HTMLButtonElement>("#defend-cog")!;
    cog.onclick = (e) => {
      e.stopPropagation();
      this.settingsOpen = !this.settingsOpen;
      this.renderSettings();
    };
    document.addEventListener("click", (e) => {
      if (this.settingsOpen && !(e.target as HTMLElement).closest?.("#defend-settings, #defend-cog")) {
        this.settingsOpen = false;
        this.renderSettings();
      }
    });
  }

  private renderChrome() {
    this.root.querySelector<HTMLElement>("#defend-city")!.hidden = this.tab !== "city";
    this.root.querySelector<HTMLElement>("#defend-armory")!.hidden = this.tab !== "armory";
    this.root.querySelector("#defend-stage")!.classList.toggle("palette-right", this.save.paletteSide === "right");
    this.refreshJournal();
    this.renderControls();
    this.renderPalette();
    this.renderSide();
    this.renderSettings();
    this.updateHud();
    if (this.tab === "armory") this.renderArmory();
  }

  /** The single row of controls on the left of the header. */
  private renderControls() {
    const el = this.root.querySelector<HTMLElement>("#defend-left")!;
    if (this.phase === "build") {
      el.innerHTML = `<button data-dtab="city" aria-pressed="${this.tab === "city"}">City</button>
        <button data-dtab="armory" aria-pressed="${this.tab === "armory"}">Armory</button>
        <button class="defend-go" id="defend-start">Start the defense</button>${this.tab === "city" ? this.sideToggle("Build") : ""}`;
      el.querySelectorAll<HTMLButtonElement>("[data-dtab]").forEach((b) => {
        b.onclick = () => {
          this.tab = b.dataset.dtab as "city" | "armory";
          this.renderChrome();
          this.relayout();
        };
      });
      this.bindSideToggle(el);
      el.querySelector<HTMLButtonElement>("#defend-start")!.onclick = () => {
        this.tab = "city";
        this.startRun();
        this.relayout();
      };
    } else if (this.phase === "sim") {
      const armed = performance.now() < this.abandonArmed;
      el.innerHTML = `<button id="defend-abandon" class="defend-danger ${armed ? "armed" : ""}">${armed ? "Confirm?" : "Abandon"}</button>
        <button id="defend-speed" title="Battle speed">${this.sim?.speed ?? 1}×</button>${this.sideToggle("Items")}`;
      el.querySelector<HTMLButtonElement>("#defend-abandon")!.onclick = () => {
        if (performance.now() < this.abandonArmed) {
          this.abandonArmed = 0;
          this.performance.finish('abandoned');
          this.endRun();
          return;
        }
        this.abandonArmed = performance.now() + 3000;
        this.renderControls();
        setTimeout(() => this.phase === "sim" && this.renderControls(), 3050);
      };
      this.bindSideToggle(el);
      el.querySelector<HTMLButtonElement>("#defend-speed")!.onclick = () => {
        if (!this.sim) return;
        const top = this.save.speed3 ? 3 : 2;
        this.sim.speed = this.sim.speed >= top ? 1 : this.sim.speed + 1;
        this.renderControls();
      };
    } else {
      el.innerHTML = `<button class="defend-go" id="defend-rebuild">Rebuild the city</button>`;
      el.querySelector<HTMLButtonElement>("#defend-rebuild")!.onclick = () => {
        this.phase = "build";
        this.sim = null;
        this.map = null;
        this.weather = null;
        this.night = 0;
        this.hideBanner();
        this.renderChrome();
      };
    }
  }

  /** The button that slides the side panel (the palette) in and out. */
  private sideToggle(label: string) {
    const open = this.phase !== "over" && this.sideOpen[this.phase];
    return `<button id="defend-side-toggle" class="defend-side-toggle" aria-pressed="${open}" aria-controls="defend-side">☰ ${label}</button>`;
  }
  private bindSideToggle(el: HTMLElement) {
    const toggle = el.querySelector<HTMLButtonElement>("#defend-side-toggle");
    if (!toggle) return;
    toggle.onclick = () => {
      if (this.phase === "over") return;
      this.sideOpen[this.phase] = !this.sideOpen[this.phase];
      toggle.setAttribute("aria-pressed", String(this.sideOpen[this.phase]));
      this.renderSide();
    };
  }

  /** Opens or closes the side panel; the board's view narrows or widens
   * with it, frame by frame, as it slides. */
  private renderSide() {
    const open = this.phase !== "over" && this.sideOpen[this.phase];
    this.root.querySelector("#defend-stage")!.classList.toggle("side-open", open);
    this.root.querySelector("#defend-side")!.setAttribute("aria-hidden", String(!open));
  }

  /** DEFEND-only settings, behind the cog. */
  private renderSettings() {
    const el = this.root.querySelector<HTMLElement>("#defend-settings");
    const cog = this.root.querySelector<HTMLButtonElement>("#defend-cog");
    if (!el || !cog) return;
    el.hidden = !this.settingsOpen;
    cog.setAttribute("aria-expanded", String(this.settingsOpen));
    if (!this.settingsOpen) return;
    const side = this.save.paletteSide;
    el.innerHTML = `<small>DEFEND SETTINGS</small>
      <div class="defend-setting"><span>Palette side</span><span class="defend-seg">
        <button data-side="left" aria-pressed="${side === "left"}">Left</button><button data-side="right" aria-pressed="${side === "right"}">Right</button></span></div>
      <div class="defend-setting"><label for="defend-healthbars">Tough enemy healthbars</label><input type="checkbox" id="defend-healthbars" ${(this.host.healthbars?.() ?? true) ? "checked" : ""}></div>
      <div class="defend-setting"><span>Board view</span><button id="defend-reset-view">Reset zoom</button></div>
      <p class="hint">Scroll or pinch to zoom; drag open ground to pan.</p>`;
    el.querySelectorAll<HTMLButtonElement>("[data-side]").forEach((b) => {
      b.onclick = () => {
        this.save.paletteSide = b.dataset.side as "left" | "right";
        this.host.persist();
        this.renderChrome();
      };
    });
    el.querySelector<HTMLInputElement>("#defend-healthbars")!.onchange = (event) => this.host.setHealthbars?.((event.target as HTMLInputElement).checked);
    el.querySelector<HTMLButtonElement>("#defend-reset-view")!.onclick = () => this.renderer?.resetCam();
  }

  private renderPalette() {
    const el = this.root.querySelector<HTMLElement>("#defend-palette")!;
    const s = this.save;
    const entries: { id: string; name: string; count: number; icon: IconItem }[] =
      this.phase === "build"
        ? PALETTE_ITEMS.map((item) => ({ id: item, name: ITEM_NAMES[item], count: available(s, item), icon: item }))
        : [
            { id: "bomb", name: "Bomb", count: s.bombs, icon: "bomb" },
            { id: "banner", name: "War banner", count: Infinity, icon: "banner" },
          ];
    el.innerHTML =
      `<small class="defend-palette-title">${this.phase === "build" ? "BUILD" : "ITEMS"}</small>` +
      entries
        .map(
          (e) =>
            `<button class="defend-item ${e.count ? "" : "empty"}" data-item="${e.id}" title="${e.name}" aria-label="${e.name}, ${e.count === Infinity ? "unlimited" : `${e.count} left`}">
              <canvas width="48" height="48" data-icon="${e.icon}"></canvas><span>${e.name}</span><b>×${e.count === Infinity ? "∞" : e.count}</b></button>`,
        )
        .join("");
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as IconItem));
    el.querySelectorAll<HTMLButtonElement>("[data-item]").forEach((b) => {
      b.onpointerdown = (e) => this.pressPalette(b.dataset.item!, e);
    });
  }

  /** A press on palette entry `id` picks up one of it, if any are left. */
  private pressPalette(id: string, e: PointerEvent) {
    if (e.button !== 0) return;
    if (id === "bomb") return this.pressBomb(e);
    if (id === "banner") return this.phase === "sim" ? this.beginDrag({ from: "banner" }, e) : undefined;
    const item = id as PaletteItem;
    if (!available(this.save, item)) return this.setMessage(`No ${plural(ITEM_NAMES[item].toLowerCase())} left — buy more in the Armory.`);
    this.beginDrag({ from: "palette", item }, e);
  }

  private pressBomb(e: PointerEvent) {
    if (!this.save.bombs || this.phase !== "sim") return this.setMessage("No bombs left — buy more in the Armory.");
    this.beginDrag({ from: "bomb" }, e);
  }

  private updateHud() {
    const el = this.root.querySelector<HTMLElement>("#defend-hud");
    if (!el) return;
    const best = this.save.bestWave;
    if (this.phase === "build" || !this.sim) {
      const html = `<span data-drop="1">Best wave <b>${best}</b></span>`;
      if (el.dataset.html !== html) {
        el.dataset.html = el.innerHTML = html;
        this.fitHud();
      }
      return;
    }
    const sim = this.sim;
    const hp = Math.max(0, sim.keepHp()),
      max = sim.keepMaxHp();
    const sky = this.weather ? skyLabel(this.weather, this.night) : "";
    // data-drop: the order pieces are left out when the row gets crowded.
    const html = `${sky ? `<span class="defend-sky" data-drop="1">${sky}</span>` : ""}<span>Wave <b>${sim.wave}</b></span><span class="defend-best" data-drop="2">Best <b>${best}</b></span><span class="defend-keep" title="Keep ${Math.ceil(hp)} / ${max}"><small data-drop="3">Keep</small><i><em style="width:${(hp / max) * 100}%"></em></i></span><span class="defend-foes"><small data-drop="4">Foes </small><b>${sim.enemies.length + sim.spawnQueue.length}</b></span>`;
    if (el.dataset.html !== html) {
      el.dataset.html = el.innerHTML = html;
      this.fitHud();
    }
  }

  /** Never clip the status row: when it doesn't fit, drop whole pieces
   * (weather, best, then labels) until it does. */
  private fitHud() {
    const el = this.root.querySelector<HTMLElement>("#defend-hud");
    if (!el) return;
    const pieces = Array.from(el.querySelectorAll<HTMLElement>("[data-drop]")).sort((a, b) => Number(a.dataset.drop) - Number(b.dataset.drop));
    for (const p of pieces) p.hidden = false;
    for (const p of pieces) {
      if (el.scrollWidth <= el.clientWidth + 1) break;
      p.hidden = true;
    }
  }

  private setMessage(text: string, seconds = 3) {
    this.message = text;
    this.messageT = text ? seconds : 0;
    const el = this.root.querySelector<HTMLElement>("#defend-message");
    if (el) el.textContent = text;
  }

  /** A message worth a herald: it rises in gold (`win`) or red (`dread`). */
  private proclaim(text: string, seconds: number, mood: "win" | "dread") {
    this.setMessage(text, seconds);
    const el = this.root.querySelector<HTMLElement>("#defend-message");
    replay(el, mood === "win" ? "herald" : "dread");
    if (mood === "win") sparksOver(el, "gold");
  }

  private showBanner(html: string) {
    const b = this.root.querySelector<HTMLElement>("#defend-banner")!;
    b.innerHTML = html;
    b.hidden = false;
  }
  private hideBanner() {
    const b = this.root.querySelector<HTMLElement>("#defend-banner");
    if (b) b.hidden = true;
  }

  /** Fit the stage to the space left on screen, as tall as it can be
   * without the page ever scrolling; the board's view fills what the side
   * panel leaves of it. */
  private layoutBoard() {
    if (!this.renderer) return;
    this.fitHud();
    if (this.tab === "armory") return this.layoutArmory();
    const stage = this.root.querySelector<HTMLElement>("#defend-stage")!;
    if (!stage.offsetParent) return;
    const top = stage.getBoundingClientRect().top + window.scrollY;
    // 24 px below leaves room for the board frame's lower brackets.
    let height = Math.max(160, Math.floor(window.innerHeight - top - this.navHeight() - 24));
    stage.style.height = `${height}px`;
    // Whatever padding the page adds, shrink until nothing overflows.
    const over = document.documentElement.scrollHeight - window.innerHeight;
    if (over > 0) {
      height = Math.max(160, height - over - 1);
      stage.style.height = `${height}px`;
    }
    this.fitView();
    this.draw();
  }

  /** Matches the board's canvas to its view, which changes size as the
   * side panel slides; the board keeps the scale the whole stage gives it. */
  private fitView() {
    const stage = this.root.querySelector<HTMLElement>("#defend-stage");
    const board = this.root.querySelector<HTMLElement>("#defend-board");
    if (!this.renderer || !stage || !board || !stage.offsetParent) return;
    const frame = board.offsetWidth - board.clientWidth;
    this.renderer.resize(stage.clientWidth - frame, board.clientHeight);
  }

  /** Lay out now, and again next frame once the new DOM has settled. */
  private relayout() {
    this.layoutBoard();
    requestAnimationFrame(() => this.layoutBoard());
  }

  /** The Armory list scrolls inside its own panel, so the page doesn't. */
  private layoutArmory() {
    const el = this.root.querySelector<HTMLElement>("#defend-armory")!;
    if (!el.offsetParent) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    el.style.maxHeight = `${Math.max(120, window.innerHeight - top - this.navHeight() - 16)}px`;
  }

  private navHeight() {
    return document.querySelector("nav")?.getBoundingClientRect().height ?? 80;
  }

  // ── Map & phases ──────────────────────────────────────────────────────
  private currentMap(): CityMap {
    const layout = this.save.layout;
    if (!this.map || this.mapLayout !== layout) {
      const fit = fitLayout(layout);
      if (!fit.ok) throw new Error(fit.reason);
      this.map = generateCity(fit, this.save.seed);
      this.mapLayout = layout;
    }
    return this.map;
  }

  private startRun() {
    this.performance.finish('restarted');
    this.performance = new BattlePerformance();
    this.performanceEnd = null;
    Object.assign(window, { defendPerformance: this.performance.history });
    // A fresh city every run; upgrades bought mid-run apply next time.
    this.map = null;
    const map = this.currentMap();
    this.sim = new DefendSim(map, { ...this.save.levels }, (defendRandom("rolls")() * 2147483648) | 0, this.host.bonuses());
    this.paid = { roach: 0, orc: 0, ogre: 0, bat: 0, warlord: 0, mother: 0, broodling: 0, snake: 0, dragon: 0, shieldBearer: 0, aegis: 0, darkKnight: 0, bombOrc: 0, bombBird: 0, voidSparrow: 0, shieldLesser: 0, shieldGreater: 0, poisonLesser: 0, poisonBearer: 0, poisonGreater: 0, poisonSovereign: 0, siegeBeetle: 0, burrowingMole: 0, necromancer: 0, skeleton: 0, bannerCaptain: 0, mirrorKnight: 0, leechSwarm: 0, ashPhoenix: 0, phoenixEgg: 0, blinkImp: 0, fortressLesser: 0, fortress: 0, fortressGreater: 0, fortressSovereign: 0, rollingCannon: 0, ballista: 0, fireworkLauncher: 0, trebuchet: 0, bombard: 0, rocketBattery: 0, boatLesser: 0, boat: 0, boatGreater: 0, boatSovereign: 0 };
    this.phase = "sim";
    this.newRecord = 0;
    this.weather = rollWeather();
    this.night = 0;
    this.renderChrome();
    const sky = this.weather.rain ? "Rain rolls in. " : "";
    this.setMessage(`${sky}Here they come! ${this.sideOpen.sim ? "Drag" : "Open Items and drag"} a bomb onto the field, or plant the war banner to rally your troops.`, 4);
  }

  private endRun() {
    if (!this.sim) return;
    this.payKills();
    this.performanceEnd = this.sim.lost ? 'lost' : 'abandoned';
    this.phase = "over";
    play("fallen");
    replay(this.root.querySelector("#defend-board"), "quake");
    const wave = this.sim.wave;
    const cleared = Math.max(0, wave - 1);
    this.showBanner(
      `<strong>The keep has fallen</strong><span>Fell during wave ${wave} · best ${this.save.bestWave}</span>${
        this.newRecord ? `<em>New record this run: wave ${this.newRecord}</em>` : cleared < this.save.bestWave ? `<em>Strengthen the city in the Armory, Training and skill trees, then try again.</em>` : ""
      }`,
    );
    this.renderChrome();
  }

  private refreshJournal() {
    const button = this.root.querySelector<HTMLButtonElement>("#defend-journal");
    if (!button) return;
    const unread = this.save.discovered.some(k => !this.save.journalRead.includes(k));
    button.setAttribute("aria-label", unread ? "Enemy journal — new enemies discovered" : "Enemy journal");
    button.title = unread ? "Enemy journal — new discoveries" : "Enemy journal";
    paintJournal(button.querySelector("canvas")!, unread);
  }

  private discoverEnemies() {
    if (!this.sim) return;
    const encountered = new Set(this.sim.enemies.map(e => e.kind));
    for (const k of Object.keys(ENEMIES) as EnemyKind[]) if (this.sim.slain[k] > 0) encountered.add(k);
    let changed = false;
    for (const k of encountered) if (!this.save.discovered.includes(k)) { this.save.discovered.push(k); changed = true; }
    if (changed) { this.host.persist(); this.refreshJournal(); }
  }

  /** Pays for the kills since the last frame. */
  private payKills() {
    const sim = this.sim!;
    const fresh: Partial<Record<EnemyKind, number>> = {};
    let any = false;
    for (const kind of Object.keys(ENEMIES) as EnemyKind[]) {
      const n = sim.slain[kind] - this.paid[kind];
      if (n > 0) {
        fresh[kind] = n;
        this.paid[kind] = sim.slain[kind];
        any = true;
      }
    }
    if (!any) return;
    this.host.earnKills(fresh);
  }

  private handleEvents() {
    this.discoverEnemies();
    const sim = this.sim!;
    this.payKills();
    for (const ev of sim.events.splice(0)) {
      if (ev.type === "waveCleared") {
        this.performanceEnd = 'cleared';
        const r = this.host.earnWave(ev.wave);
        const pay = `+${Math.floor(r.gold)} gold · +${r.copper} copper${r.silver ? ` · +${r.silver} silver` : ""}${r.knowledge ? ` · +${r.knowledge} Knowledge` : ""}${r.upgrade ? ` · +${r.upgrade} upgrade point` : ""}`;
        if (ev.wave > this.save.bestWave) {
          this.save.bestWave = ev.wave;
          this.newRecord = ev.wave;
          this.host.persist();
          this.proclaim(`New record — wave ${ev.wave} survived! ${pay}`, 3, "win");
          play("record");
        } else {
          this.proclaim(`Wave ${ev.wave} cleared. ${pay}`, 2, "win");
          play("wave");
        }
      } else if (ev.type === "waveStart") {
        if (isBossWave(ev.wave)) {
          this.proclaim(`Boss wave ${ev.wave}! Night falls as ${ev.wave > 10 ? `${ev.wave / 10} warlords approach` : "a warlord approaches"}…`, 4, "dread");
          play("horn");
        }
        else if (!this.message) this.setMessage(`Wave ${ev.wave}`, 1.5);
      } else if (ev.type === "lost") this.endRun();
    }
  }

  private draw() {
    if (!this.renderer) return;
    this.fitView();
    if (!this.renderer.canvas.width) return;
    const map = this.sim ? this.sim.map : this.currentMap();
    this.renderer.draw(map, this.sim, this.overlay(), {
      grid: this.phase === "build",
      weather: this.weather,
      night: this.night,
      now: performance.now(),
      reduceMotion: this.host.reduceMotion(),
      effects: this.host.effects(),
      healthbars: this.host.healthbars?.() ?? true,
      over: this.phase === "over",
      hideBanner: this.phase === "over" || (this.pointers.session?.drag.from === "banner" && !!this.pointers.session.drag.placed),
    });
  }

  // ── Dragging ──────────────────────────────────────────────────────────
  private overlay(): Overlay | null {
    return this.pointers.session?.overlay() ?? null;
  }

  private beginDrag(d: Drag, e: PointerEvent) {
    this.pointers.begin(new EditSession(d, this.save.layout), e);
  }

  /** Start dragging whatever buildable thing is under the pointer. Only the
   * build phase picks things up; in battle a press lifts the war banner where
   * it stands (a tap takes it down), and anywhere else moves the view. */
  private pickUp(e: PointerEvent): boolean {
    if (this.phase === "sim") return this.pickUpBanner(e);
    if (this.phase !== "build") return false;
    const { cx, cy, inside } = eventCell(this.renderer!, e);
    const edit = inside ? EditSession.lift(this.currentMap(), this.save.layout, cx, cy) : null;
    if (edit) this.pointers.begin(edit, e);
    return !!edit;
  }

  /** A press on the planted war banner (its pole or cloth) lifts it. */
  private pickUpBanner(e: PointerEvent): boolean {
    const banner = this.sim?.warBanner;
    if (!banner) return false;
    const { fx, fy } = eventCell(this.renderer!, e);
    // The cloth flies to the right of the pole.
    if (fx < banner.x - 1 || fx > banner.x + 2.2 || fy < banner.y - 1.4 || fy > banner.y + 1) return false;
    this.beginDrag({ from: "banner", placed: true }, e);
    return true;
  }

  /** A released drag: a bomb goes off where it lands, the war banner is
   * planted where it lands (a tap on it, or carrying it off the board, takes
   * it down), and a city element leaves its session's next layout. */
  private drop(drop: Drop) {
    if (drop.kind === "bomb") {
      if (drop.at) this.dropBomb(drop.at);
      return;
    }
    if (drop.kind === "banner") {
      const sim = this.phase === "sim" ? this.sim : null;
      const drag = this.pointers.session?.drag;
      if (!sim) return;
      if (drop.at) sim.plantBanner(drop.at);
      else if (drop.tap || (drag?.from === "banner" && drag.placed)) sim.plantBanner(null);
      return;
    }
    const s = this.save;
    s.layout = drop.layout;
    if (drop.message) this.setMessage(drop.message);
    if (s.layout !== this.mapLayout) this.host.persist();
    this.renderPalette();
  }

  private dropBomb(at: { x: number; y: number }) {
    if (!this.bombsLive()) return;
    this.sim!.dropBomb(at.x, at.y);
    this.save.bombs--;
    this.host.persist();
    this.renderPalette();
  }

  /** Whether a bomb can go off: in battle, with one left. */
  private bombsLive() {
    return !!this.sim && this.phase === "sim" && this.save.bombs > 0;
  }

  // ── Armory ────────────────────────────────────────────────────────────
  private renderArmory() {
    const el = this.root.querySelector<HTMLElement>("#defend-armory")!;
    const s = this.save;
    const w = this.host.wallet();
    const price = (p: Price) =>
      [`${p.gold} gold`, p.copper ? `${p.copper} copper` : "", p.silver ? `${p.silver} silver` : ""].filter(Boolean).join(" · ");
    const items = PALETTE_ITEMS.map((item) => {
      const p = purchasePrice(item, s.owned[item]);
      const desc = item === "cityTile" ? "Expands the city limits. New tiles must touch the city; the wall moves out to enclose them." : `${STRUCTURES[item].description} Takes ${shareName(footprint(item, s.layout.compact.includes(item)).size)}.`;
      return `<article class="card defend-card"><canvas width="48" height="48" data-icon="${item}"></canvas><div><small>OWNED ${s.owned[item]} · IN PALETTE ${available(s, item)}</small><h3>${ITEM_NAMES[item]}</h3><p>${desc}</p></div>
        <button data-buy="${item}" ${canAfford(w, p) ? "" : "disabled"}>Buy · ${price(p)}</button></article>`;
    }).join("");
    const bomb = `<article class="card defend-card"><canvas width="48" height="48" data-icon="bomb"></canvas><div><small>OWNED ${s.bombs}</small><h3>Bomb</h3><p>Drag onto the battlefield mid-defense to blast everything within ${BOMB_RADIUS.toFixed(0)} cells — your own people too, until you buy Shaped charges.</p></div>
      <button data-buy-bomb ${canAfford(w, BOMB_PRICE) ? "" : "disabled"}>Buy · ${price(BOMB_PRICE)}</button></article>`;
    const speed = `<article class="card defend-card"><div><small>${s.speed3 ? "UNLOCKED" : "ONE-TIME UNLOCK"}</small><h3>War drums</h3><p>Adds 3× to the battle speed button.</p></div>
      <button data-buy-speed3 ${s.speed3 || !canAfford(w, SPEED3_PRICE) ? "disabled" : ""}>${s.speed3 ? "Owned" : `Buy · ${price(SPEED3_PRICE)}`}</button></article>`;
    const groups = [...new Set(UPGRADES.map((u) => u.group))];
    const upgrades = groups
      .map(
        (g) =>
          `<h4>${g}</h4>` +
          UPGRADES.filter((u) => u.group === g)
            .map((u) => {
              const lvl = s.levels[u.id];
              const maxed = lvl >= u.maxLevel;
              const p = u.price ? u.price(lvl) : upgradePrice(lvl);
              return `<article class="card defend-card defend-upgrade"><div><small>LEVEL ${lvl} / ${u.maxLevel}</small><h3>${u.name}</h3><p>${u.describe(lvl)}${maxed ? "" : ` → <b>${u.describe(lvl + 1)}</b>`}</p></div>
                <button data-upgrade="${u.id}" ${maxed || !canAfford(w, p) ? "disabled" : ""}>${maxed ? "Maxed" : `Upgrade · ${price(p)}`}</button></article>`;
            })
            .join(""),
      )
      .join("");
    const balance = (amount: number) => this.host.devMode() ? "∞" : Math.floor(amount + 1e-9);
    el.innerHTML = `<p class="hint defend-wallet">Spend what you earn in battle: kills pay Gold, every wave held pays Gold and copper, boss waves silver. <b>${balance(w.copper)}</b> copper · <b>${balance(w.silver)}</b> silver · <b>${balance(w.gold)}</b> gold${this.phase === "sim" ? " · upgrades apply from the next defense" : ""}</p>
      <h3 class="defend-section">City elements</h3>${items}
      <h3 class="defend-section">Consumables</h3>${bomb}
      <h3 class="defend-section">Battle</h3>${speed}
      <h3 class="defend-section">Upgrades</h3><p class="hint">Upgrades apply to every building of that type.</p>${upgrades}`;
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as IconItem));
    /** A purchase rings like coins and stamps its card once the list is redrawn. */
    const commit = (ok: boolean, card: string) => {
      if (!ok) return;
      this.host.setWallet(w);
      this.host.persist();
      play("coin");
      this.renderArmory();
      const bought = el.querySelector(card)?.closest(".card") ?? null;
      replay(bought, "bought");
      sparksOver(bought?.querySelector("button") ?? null, "gold");
    };
    el.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((b) => (b.onclick = () => commit(buyItem(s, w, b.dataset.buy as PaletteItem), `[data-buy="${b.dataset.buy}"]`)));
    el.querySelector<HTMLButtonElement>("[data-buy-bomb]")!.onclick = () => commit(buyBomb(s, w), "[data-buy-bomb]");
    el.querySelector<HTMLButtonElement>("[data-buy-speed3]")!.onclick = () => commit(buySpeed3(s, w), "[data-buy-speed3]");
    el.querySelectorAll<HTMLButtonElement>("[data-upgrade]").forEach((b) => (b.onclick = () => commit(buyUpgrade(s, w, b.dataset.upgrade as (typeof UPGRADES)[number]["id"]), `[data-upgrade="${b.dataset.upgrade}"]`)));
  }
}
