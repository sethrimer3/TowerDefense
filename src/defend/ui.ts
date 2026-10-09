import { syncCards, cardLabel, spikeKey, type OwnedCard } from "../cards.ts";
import { bannerReach } from "./war-banner.ts";
import { journalHTML, paintJournal } from "./journal.ts";
import { paintPortraits } from "./journal-portrait.ts";
import { wavePickerHTML } from "./wave-picker.ts";
import { areaForWave, areaStyle, type AreaId } from "./areas.ts";
import { hasWallArt, wallCapSprite } from "./area-wall-art.ts";
import { uiSprite } from "../ui/dom.ts";
import { KeepBricks } from "./keep-bricks.ts";
/** The DEFEND page: the palette and the board (everything the palette
 * holds is bought in the Tiles tab; upgrades in the Mine's Smithy and the
 * Library's Study).
 *
 * Build phase: drag city elements from the palette (a side panel that
 * slides in beside the board's view) onto gold-outlined
 * tiles; drag placed ones around, or back to the palette to pick them up.
 * Once the defense starts, the palette becomes the consumables palette and
 * waves roll in without stopping until the keep falls. */
import {
  ENEMIES,
  PALETTE_ITEMS,
  PALETTE_CATEGORIES,
  inCategory,
  type Bonuses,
  type EnemyKind,
  ITEM_NAMES,
  type PaletteCategory,
  type PaletteItem,
} from "./catalog.ts";
import { CELLS_W, TILES_H, TILES_W, defendRandom } from "./grid.ts";
import { fitLayout, type Layout } from "./layout.ts";
import { generateCity, type CityMap } from "./citygen.ts";
import { DefendSim } from "./sim.ts";
import { DefendRenderer } from "./render.ts";
import { BattlePerformance, FrameTimeOverlay } from "./performance.ts";
import type { Overlay } from "./edit-overlay.ts";
import { paintIcon, type IconItem } from "./structure-art.ts";
import { artLook } from "./tower-art.ts";
import { cardBadge, cardLook, paintPathIcons } from "../ui/card-badge.ts";
import { BoardPointers, eventCell } from "./board-pointers.ts";
import type { Drag } from "./drag-rules.ts";
import { EditSession, type Drop } from "./edit-session.ts";
import { BattleSound } from "./battle-sound.ts";
import { QUIET, type Scene } from "../ambience.ts";
import { NIGHT_FADE_SECONDS, isBossWave, rollWeather, type Weather } from "./weather.ts";
import { play } from "../sound.ts";
import { replay, sparksOver } from "../ui/flourish.ts";
import { available, startingWave, withOutskirts, type DefendSave } from "./progress.ts";
import { ageWater } from "./boats.ts";
import { defeatHTML } from "./defeat.ts";
import { inspectable, type Armed } from "./inspect.ts";

export type DefendHost = {
  save(): DefendSave;
  /** The Smithy's and the skill trees' multipliers for the next defense. */
  bonuses(): Bonuses;
  cards?(): OwnedCard[];
  /** Whether city tiles may stand apart from the keep's (the Study's
   * Outlying districts). */
  outskirts?(): boolean;
  /** Awards an upgrade point for a new highest wave, recording it with payment. */
  earnWave(wave: number): { upgrade: number };
  persist(): void;
  reduceMotion(): boolean;
  /** The park grass and pond effects are on. */
  effects(): boolean;
  devMode(): boolean;
  healthbars?(): boolean;
  /** The tile grid's opacity while building, 0 when it's hidden. */
  gridLines?(): number;
  setHealthbars?(value: boolean): void;
  /** Whether the palette lists items the player has none of. */
  showEmpty?(): boolean;
  /** Opens the Tiles tab, where tiles (buildings and consumables) are bought. */
  openTiles?(): void;
};

const plural = (name: string) => (name.endsWith("s") ? name : `${name}s`);

export class DefendPage {
  private host: DefendHost;
  private root: HTMLElement;
  private phase: "build" | "sim" | "over" = "build";
  private map: CityMap | null = null;
  private mapLayout: Layout | null = null;
  private sim: DefendSim | null = null;
  private renderer: DefendRenderer | null = null;
  private pointers = new BoardPointers({
    renderer: () => this.renderer,
    pickUp: (e) => this.pickUp(e),
    drop: (drop) => this.drop(drop),
    tap: (e) => this.tap(e),
  });
  /** The building the player tapped (its id in the map), outlined with its
   * reach and troops, and what its reach is reckoned from before a battle. */
  private picked: { id: number; armed: Armed } | null = null;
  private lastTime = 0;
  private performance = new BattlePerformance();
  private frameTimes = new FrameTimeOverlay();
  private performanceEnd: string | null = null;
  private message = "";
  private messageT = 0;
  private newRecord = 0;
  private built = false;
  private weather: Weather | null = null;
  private weatherArea: AreaId = "moss";
  /** How far night has fallen (0–1); it follows boss waves. */
  private night = 0;
  /** The battle's sounds, cued from what each frame brings. */
  private sounds = new BattleSound();
  /** Abandon needs a second click within a few seconds. */
  private abandonArmed = 0;
  private settingsOpen = false;
  /** The build palette's category, and whether its list of categories is
   * open. */
  private category: PaletteCategory = "all";
  private categoriesOpen = false;
  private journal: HTMLDialogElement | null = null;
  /** The keep's health in the header, a wall of bricks. */
  private keepBricks: KeepBricks | null = null;
  /** Whether the side panel is open in each phase: the build palette starts
   * open, the battle's items closed so the battle has the whole view. */
  private sideOpen = { build: true, sim: false };
  private testerSelected = false;
  private summonHold: { kind: EnemyKind; button: HTMLButtonElement; pointerId: number; next: number } | null = null;

  constructor(root: HTMLElement, host: DefendHost) {
    this.root = root;
    this.host = host;
    Object.assign(window, { defendFrameTimes: (enabled?: boolean) => this.frameTimes.toggle(enabled) });
    window.addEventListener("resize", () => this.layoutBoard());
    document.addEventListener('visibilitychange', () => { this.lastTime = 0; this.stopSummoning(); });
    window.addEventListener("blur", () => this.stopSummoning());
  }

  /** Called when the DEFEND tab is shown (or its data changed elsewhere). */
  show() {
    this.lastTime = 0;
    this.stopSummoning();
    if (!this.host.devMode()) {
      this.testerSelected = false;
      if (this.sim?.unitTester) { this.phase = "build"; this.sim = null; this.map = null; this.weather = null; this.night = 0; this.hideBanner(); }
    }
    if (!this.built) this.build();
    this.renderChrome();
    this.relayout();
  }

  /** Called every animation frame while the tab is visible. */
  frame(time: number) {
    const dt = this.lastTime ? (time - this.lastTime) / 1000 : 0;
    this.lastTime = time;
    if (!this.built) return;
    const measuring = this.sim && this.phase === "sim";
    const start = performance.now();
    if (this.sim && this.phase === "sim") {
      this.repeatSummon(time);
      if (!this.journal?.open) this.sim.update(dt);
    } else if (this.sim && this.phase === "over" && (this.sim.floods.length || this.sim.sinkings.length)) ageWater(this.sim, Math.min(dt, 0.25));
    const updated = performance.now();
    if (this.sim && this.phase === 'sim') {
      this.handleEvents();
      if (dt > 0) this.sounds.hear(this.sim);
    }
    this.fadeNight(dt);
    this.keepBricks?.step(dt);
    if (this.messageT > 0) {
      this.messageT -= dt;
      if (this.messageT <= 0) this.setMessage("");
    }
    this.fitView();
    const drawing = performance.now();
    this.draw(false);
    const drawn = performance.now();
    if (measuring && this.sim && !document.hidden) {
      this.performance.sample(this.sim.wave, this.sim.enemies.length, dt * 1000, updated - start, drawn - drawing);
      if (this.performanceEnd) this.performance.finish(this.performanceEnd);
      this.performanceEnd = null;
    }
    if (this.phase === "sim") { this.updateHud(); this.updateSkillCooldowns(); }
    if (measuring && this.renderer && !document.hidden) this.frameTimes.sample({
      frameMs: dt * 1000, updateMs: updated - start, ...this.renderer.timings,
      uiMs: drawing - updated + performance.now() - drawn,
    });
  }

  /** Developer aid: advance the running defense by `seconds` at once,
   * optionally forcing the weather. */
  fastForward(seconds: number, weather?: Weather) {
    if (!this.sim || this.phase !== "sim") return;
    this.performance.finish('fast-forward');
    if (weather) { this.weather = weather; this.sim.snowOverride = !!weather.snow; }
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

  /** What can be heard over the city: the area's weather and the boss
   * waves' night outdoors, drips underground, the forge's fires, and the
   * battle's own blazes. */
  ambience(): Scene {
    if (!this.built) return QUIET;
    const area = areaForWave(Math.max(this.sim?.wave ?? 1, startingWave(this.save)));
    const w = this.weather, night = this.night, under = area.climate === "underground", cold = area.climate === "cold";
    const green = area.id === "moss" || area.id === "drowned";
    const blazes = this.phase === "sim" ? Math.min(1, (this.sim?.blazes.length ?? 0) / 10) : 0;
    return {
      rain: w?.rain ? (night > 0.5 ? 1 : 0.55) : 0,
      wind: w?.blizzard ? 0.95 : w?.snow ? 0.5 : w?.sand ? 0.75 : under ? 0.05 : w?.rain ? 0.35 : cold ? 0.4 : 0.18,
      howl: w?.blizzard ? 1 : w?.snow || (cold && !w) ? 0.25 : 0,
      sand: w?.sand || (area.id === "desert" && !w) ? 1 : 0,
      thunder: w?.rain ? (night > 0.5 ? 4 : 0.8) : 0,
      birds: green && !w?.rain ? (1 - night) * 0.9 : 0,
      night: !under && !cold ? night : 0,
      drips: under ? 0.8 : area.id === "drowned" ? 0.3 : 0,
      fire: Math.max(area.id === "ember" ? 0.4 : 0, blazes * 0.7),
      muffle: 0,
    };
  }

  /** Pause bookkeeping when the tab is hidden, so time doesn't jump. */
  pause() {
    this.lastTime = 0;
    this.stopSummoning();
    this.pointers.end();
    this.frameTimes.toggle(this.frameTimes.enabled);
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
        <div class="defend-center" id="defend-center"><div class="defend-hud" id="defend-hud"></div></div>
        <div class="defend-right"><div class="defend-left" id="defend-extra"></div>
        <button class="defend-journal-button" id="defend-journal" aria-label="Enemy journal" aria-haspopup="dialog"><canvas width="20" height="20"></canvas></button>
        <button class="defend-cog" id="defend-cog" aria-label="Defend settings" aria-expanded="false">⚙</button>
        </div><div class="defend-settings" id="defend-settings" hidden></div>
      </div>
      <div class="defend-city" id="defend-city">
        <div class="defend-stage" id="defend-stage">
          <aside class="defend-side" id="defend-side" aria-label="Palette"><div class="defend-palette" id="defend-palette"></div></aside>
          <div class="defend-board" id="defend-board"><canvas id="defend-canvas" aria-label="City defense board. Scroll or pinch to zoom, drag to pan."></canvas>
            <div class="defend-banner" id="defend-banner" role="dialog" aria-label="The keep has fallen" hidden></div>
            <div class="defend-message" id="defend-message" aria-live="polite"></div></div>
        </div>
      </div>
      <dialog class="defend-journal-dialog" aria-labelledby="defend-journal-title"></dialog>
      <dialog class="defend-wave-dialog" aria-labelledby="defend-wave-title"></dialog>`;
    this.keepBricks = new KeepBricks();
    // Only the explicit close buttons dismiss the report.
    this.root.querySelector<HTMLElement>("#defend-banner")!.addEventListener("click", (event) => {
      if ((event.target as Element).closest("[data-defeat-close]")) this.rebuild();
    });
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
      paintPortraits(this.journal!);
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
    if (this.phase === "build") {
      // Outlying districts learned or unlearned since: the layout follows.
      const next = withOutskirts(this.save.layout, !!this.host.outskirts?.());
      if (next !== this.save.layout) {
        this.save.layout = next;
        this.host.persist();
      }
    }
    this.root.querySelector("#defend-stage")!.classList.toggle("palette-right", this.save.paletteSide === "right");
    this.refreshJournal();
    this.renderControls();
    this.renderPalette();
    this.renderSide();
    this.renderSettings();
    this.updateHud();
  }

  /** Left actions, a centered start/status, and wave/speed beside the journal. */
  private renderControls() {
    const el = this.root.querySelector<HTMLElement>("#defend-left")!;
    const center = this.root.querySelector<HTMLElement>("#defend-center")!;
    const extra = this.root.querySelector<HTMLElement>("#defend-extra")!;
    center.querySelector("#defend-start")?.remove();
    extra.innerHTML = "";
    this.root.querySelector(".defend-head")!.classList.toggle("defend-building", this.phase === "build");
    if (this.phase === "build") {
      el.innerHTML = `${this.sideToggle("Build")}<button id="defend-upgrades" title="Your tiles: buy more buildings and bombs"><canvas class="ui-sprite" width="48" height="48" aria-hidden="true"></canvas>Tiles</button>
        <button class="defend-go" id="defend-start">${this.testerSelected ? "Start Tester" : "Start Defense"}</button>
        <button class="defend-wave" id="defend-wave" style="${areaStyle(areaForWave(startingWave(this.save)))}" title="Choose the starting wave · ${this.testerSelected ? "Unit tester" : areaForWave(startingWave(this.save)).name}" aria-haspopup="dialog"><canvas class="defend-wave-wall" aria-hidden="true" width="64" height="16"></canvas>${uiSprite("stage-select")}<small>Wave </small><b>${this.testerSelected ? "Tester" : startingWave(this.save)}</b></button>`;
      el.querySelector<HTMLButtonElement>("#defend-upgrades")!.onclick = () => this.host.openTiles?.();
      paintIcon(el.querySelector<HTMLCanvasElement>("#defend-upgrades canvas")!, "cityTile");
      this.bindSideToggle(el);
      el.querySelector<HTMLButtonElement>("#defend-wave")!.onclick = () => this.pickWave();
      el.querySelector<HTMLButtonElement>("#defend-start")!.onclick = () => {
        this.startRun();
        this.relayout();
      };
      center.prepend(el.querySelector("#defend-start")!);
      extra.append(el.querySelector("#defend-wave")!);
      this.paintWaveWall();
    } else if (this.phase === "sim") {
      const armed = performance.now() < this.abandonArmed;
      el.innerHTML = `${this.sideToggle(this.sim?.unitTester ? "Enemies" : "Skills")}<button id="defend-abandon" class="defend-danger ${armed ? "armed" : ""}">${armed ? "Confirm?" : "Abandon"}</button>
        <button id="defend-speed" title="Battle speed">${this.sim?.speed ?? 1}×</button>`;
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
        this.save.battleSpeed = this.sim.speed as 1 | 2 | 3;
        this.host.persist();
        this.renderControls();
      };
      extra.append(el.querySelector("#defend-speed")!);
    } else el.innerHTML = "";
  }

  /** Reuse the selected area's native city-wall cap art. */
  private paintWaveWall() {
    const canvas = this.root.querySelector<HTMLCanvasElement>(".defend-wave-wall")!;
    const c = canvas.getContext("2d")!;
    const area = areaForWave(startingWave(this.save)).id;
    c.imageSmoothingEnabled = false;
    if (hasWallArt(area)) {
      for (let x = 0; x < 4; x++) c.drawImage(wallCapSprite(area, x, 0)!, x * 16, 0);
    } else {
      const img = new Image();
      img.onload = () => {
        for (let x = 0; x < 4; x++) c.drawImage(img, 38, 1 + x * 16, 16, 16, x * 16, 0, 16, 16);
      };
      img.src = `${(import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./"}assets/defend/wall-cap.png`;
    }
  }

  /** Leaves the fallen city for the build phase: the summary closes and the
   * palette comes back. */
  private rebuild() {
    if (this.phase !== "over") return;
    this.stopSummoning();
    this.phase = "build";
    this.sim = null;
    this.map = null;
    this.weather = null;
    this.night = 0;
    this.picked = null;
    this.hideBanner();
    this.renderChrome();
    this.relayout();
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
      if (!this.sideOpen[this.phase]) this.stopSummoning();
      toggle.setAttribute("aria-pressed", String(this.sideOpen[this.phase]));
      this.renderSide();
    };
  }

  /** Opens or closes the side panel; the board's view narrows or widens
   * with it, frame by frame, as it slides. */
  private renderSide() {
    const open = this.phase !== "over" && this.sideOpen[this.phase];
    this.root.querySelector("#defend-stage")!.classList.toggle("side-open", open);
    this.root.querySelector("#defend-stage")!.classList.toggle("unit-testing", !!this.sim?.unitTester);
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
    this.stopSummoning();
    const el = this.root.querySelector<HTMLElement>("#defend-palette")!;
    if (this.sim?.unitTester && this.host.devMode()) {
      el.innerHTML = `<small class="defend-palette-title">ENEMIES</small><small class="defend-palette-none">Tap to summon one. Hold to summon more.</small>` +
        (Object.keys(ENEMIES) as EnemyKind[]).map(kind => `<button class="defend-item defend-enemy" data-enemy="${kind}" aria-label="Summon ${ENEMIES[kind].name}" title="Summon ${ENEMIES[kind].name}"><canvas data-portrait="${kind}" width="80" height="80" aria-hidden="true"></canvas><span>${ENEMIES[kind].name}</span></button>`).join("");
      paintPortraits(el);
      el.querySelectorAll<HTMLButtonElement>("[data-enemy]").forEach(button => {
        const kind = button.dataset.enemy as EnemyKind;
        button.onpointerdown = event => {
          if (event.button !== 0 || !event.isPrimary || this.phase !== "sim") return;
          event.preventDefault();
          this.stopSummoning();
          button.focus({ preventScroll: true });
          button.setPointerCapture(event.pointerId);
          this.summon(kind);
          this.summonHold = { kind, button, pointerId: event.pointerId, next: performance.now() + 350 };
        };
        button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => this.stopSummoning();
        button.onclick = event => { if (event.detail === 0) this.summon(kind); };
        button.oncontextmenu = event => event.preventDefault();
      });
      return;
    }
    const s = this.save, inventory = this.host.cards?.() ?? [];
    const all: { id: string; name: string; count: number; icon: IconItem; card?: OwnedCard }[] =
      this.phase === "build"
        ? PALETTE_ITEMS.filter((item) => inCategory(item, this.category)).flatMap((item): { id: string; name: string; count: number; icon: IconItem; card?: OwnedCard }[] => {
          const cards = inventory.filter(c => c.kind === item);
          if (!cards.some(c => c.path) || ["cityTile", "cityGate", "wallBallista"].includes(item))
            return [{ id: item, name: ITEM_NAMES[item], count: available(s, item), icon: item as IconItem }];
          const groups = new Map<string, OwnedCard[]>();
          for (const c of cards.filter(c => !c.placement)) { const name = cardLabel(c); groups.set(name, [...(groups.get(name) ?? []), c]); }
          return [...groups].map(([name, copies]) => ({ id: `${item}#${copies[0].id}`, name: `${ITEM_NAMES[item]} · ${name}`, count: copies.length, icon: item as IconItem, card: copies[0] }));
        })
        : [
            { id: "bomb", name: "Bomb", count: s.bombs, icon: "bomb" },
            { id: "banner", name: "War banner", count: Infinity, icon: "banner" },
          ];
    const entries = this.host.showEmpty?.() ? all : all.filter((e) => e.count > 0);
    el.innerHTML =
      (this.phase === "build" ? this.categoryPicker() : `<small class="defend-palette-title">SKILLS</small>`) +
      entries
        .map(
          (e) =>
            `<button class="defend-item ${e.count ? "" : "empty"}" data-item="${e.id}" title="${e.name}" aria-label="${e.name}, ${e.count === Infinity ? "unlimited" : `${e.count} left`}">
              <span class="defend-item-face"><canvas width="48" height="48" data-icon="${e.icon}"${cardLook(e.card)}></canvas>${cardBadge(e.card)}</span><span>${e.name}</span><b>×${e.count === Infinity ? "∞" : e.count}</b></button>`,
        )
        .join("") +
      (entries.length ? "" : `<small class="defend-palette-none">None owned. Buy more in the Tiles tab.</small>`);
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as IconItem));
    paintPathIcons(el);
    el.querySelectorAll<HTMLButtonElement>("[data-item]").forEach((b) => {
      b.onpointerdown = (e) => this.pressPalette(b.dataset.item!, e);
    });
    this.updateSkillCooldowns();
    const picker = el.querySelector<HTMLButtonElement>("#defend-category");
    if (picker)
      picker.onclick = () => {
        this.categoriesOpen = !this.categoriesOpen;
        this.renderPalette();
      };
    el.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((b) => {
      b.onclick = () => {
        this.category = b.dataset.category as PaletteCategory;
        this.categoriesOpen = false;
        this.renderPalette();
        el.scrollTop = 0;
      };
    });
  }

  private summon(kind: EnemyKind) {
    if (this.phase !== "sim" || !this.host.devMode() || this.journal?.open) return;
    if (!this.sim?.summonEnemy(kind)) this.setMessage("Enemy limit reached. Clear enemies before summoning more.");
  }

  private repeatSummon(now: number) {
    const hold = this.summonHold;
    if (!hold) return;
    if (!this.host.devMode() || !this.sim?.unitTester || this.sim.lost || this.journal?.open || !this.sideOpen.sim) { this.stopSummoning(); return; }
    if (now >= hold.next) { this.summon(hold.kind); hold.next = now + 100; }
  }

  private stopSummoning() {
    const hold = this.summonHold;
    this.summonHold = null;
    if (hold?.button.hasPointerCapture(hold.pointerId)) hold.button.releasePointerCapture(hold.pointerId);
  }

  private updateSkillCooldowns() {
    if (this.phase !== "sim" || !this.sim) return;
    for (const button of Array.from(this.root.querySelectorAll<HTMLButtonElement>("#defend-palette [data-item]"))) {
      const banner = button.dataset.item === "banner", left = banner ? this.sim.bannerRemaining : 0;
      const ready = left === 0 && (banner || this.save.bombs > 0);
      const fill = banner ? Math.floor((1 - left / this.sim.bannerCooldown) * 100) : ready ? 100 : 0;
      const key = `${fill}:${Math.ceil(left)}:${ready}:${this.save.bombs}`;
      if (button.dataset.cooldown === key) continue;
      button.dataset.cooldown = key;
      button.classList.toggle("skill-ready", ready);
      button.classList.toggle("skill-loading", left > 0);
      button.style.setProperty("--skill-fill", `${fill}%`);
      button.disabled = !ready;
      const name = banner ? "War banner" : "Bomb";
      const status = left > 0 ? `Ready in ${Math.ceil(left)} seconds` : ready ? banner ? "Ready" : `Ready, ${this.save.bombs} left` : "None owned";
      button.title = `${name}: ${status}`;
      button.setAttribute("aria-label", `${name}: ${status}`);
    }
  }

  /** The palette's head while building: a button naming the category on
   * show, which opens the list of them. */
  private categoryPicker() {
    const name = PALETTE_CATEGORIES.find((c) => c.id === this.category)!.name;
    const open = this.categoriesOpen;
    const list = open
      ? `<div class="defend-categories" id="defend-categories" role="menu">${PALETTE_CATEGORIES.map(
          (c) => `<button role="menuitemradio" aria-checked="${c.id === this.category}" data-category="${c.id}">${c.name}</button>`,
        ).join("")}</div>`
      : "";
    return `<button class="defend-category" id="defend-category" aria-haspopup="menu" aria-expanded="${open}" aria-controls="defend-categories" title="Show a type of building"><span aria-hidden="true">☰</span> ${name}</button>${list}`;
  }

  /** A press on palette entry `id` picks up one of it, if any are left. */
  private pressPalette(id: string, e: PointerEvent) {
    if (e.button !== 0) return;
    if (id === "bomb") return this.pressBomb(e);
    if (id === "banner" && this.sim?.bannerRemaining) return;
    if (id === "banner") return this.phase === "sim" ? this.beginDrag({ from: "banner" }, e) : undefined;
    const [kind, card] = id.split("#");
    const item = kind as PaletteItem;
    if (!available(this.save, item)) return this.setMessage(`No ${plural(ITEM_NAMES[item].toLowerCase())} left — buy more in the Tiles tab.`);
    this.beginDrag({ from: "palette", item, ...(card ? { cardId: Number(card) } : {}) }, e);
  }

  private pressBomb(e: PointerEvent) {
    if (!this.save.bombs || this.phase !== "sim") return this.setMessage("No bombs left — buy more in the Tiles tab.");
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
    const remaining = sim.spawnQueue.length + sim.enemies.reduce((n, e) => n + Number(e.hp > 0 && !e.fortressPart), 0);
    const html = `<span class="defend-wave-status"><span>${sim.unitTester ? `<b title="Unit tester">Tester</b>` : `<small>Wave </small><b>${sim.wave}</b>`}</span><span class="defend-enemies" title="${remaining} enemies remaining" aria-label="${remaining} enemies remaining"><svg viewBox="0 0 12 12" aria-hidden="true"><path fill="#ce735a" d="M1 0h2v2h6V0h2v5h-1v4H8v2H4V9H2V5H1z"/><path fill="#241915" d="M3 4h2v2H3zm4 0h2v2H7zM5 8h2v2H5z"/></svg><span>${remaining}</span></span></span><span class="defend-keep" title="Keep ${Math.ceil(hp)} / ${max}"><small>Keep</small><span class="defend-keep-meter"><i></i></span></span>`;
    this.keepBricks?.set(hp / max);
    if (el.dataset.html !== html) {
      el.dataset.html = el.innerHTML = html;
      if (this.keepBricks) el.querySelector(".defend-keep i")?.replaceWith(this.keepBricks.canvas);
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

  private showBanner(html: string, kind = "") {
    const b = this.root.querySelector<HTMLElement>("#defend-banner")!;
    b.innerHTML = html;
    b.className = `defend-banner ${kind}`.trim();
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

  /** The starting wave picker: a tap on a wave starts the next defense there. */
  private pickWave() {
    const dialog = this.root.querySelector<HTMLDialogElement>(".defend-wave-dialog")!;
    dialog.innerHTML = wavePickerHTML(this.save, this.host.devMode(), this.testerSelected);
    dialog.querySelector<HTMLButtonElement>("[data-unit-tester]")?.addEventListener("click", () => {
      this.testerSelected = true;
      dialog.close();
      this.renderControls();
    });
    dialog.querySelector<HTMLButtonElement>("[data-wave-close]")!.onclick = () => dialog.close();
    dialog.querySelectorAll<HTMLButtonElement>("[data-wave]").forEach((b) => {
      b.onclick = () => {
        this.save.startWave = Number(b.dataset.wave);
        this.testerSelected = false;
        this.host.persist();
        dialog.close();
        this.renderControls();
      };
    });
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: "center" });
  }

  private startRun() {
    this.stopSummoning();
    this.performance.finish('restarted');
    this.performance = new BattlePerformance();
    this.performanceEnd = null;
    Object.assign(window, { defendPerformance: this.performance.history });
    // A fresh city every run; upgrades bought mid-run apply next time.
    this.map = null;
    const map = this.currentMap();
    this.sim = new DefendSim(map, { ...this.save.levels }, (defendRandom("rolls")() * 2147483648) | 0, this.host.bonuses());
    this.sim.speed = Math.min(this.save.battleSpeed, this.save.speed3 ? 3 : 2);
    if (this.testerSelected && this.host.devMode()) this.sim.startUnitTester();
    else this.sim.startAt(startingWave(this.save));
    this.phase = "sim";
    this.newRecord = 0;
    const area = areaForWave(this.sim.unitTester ? 1 : startingWave(this.save));
    this.weatherArea = area.id;
    this.weather = rollWeather(undefined, area);
    this.night = 0;
    this.renderChrome();
    if (this.sim.unitTester) {
      this.setMessage("Unit tester: open Enemies, then tap or hold an enemy to summon it.", 6);
      return;
    }
    const w = this.weather, sky = w.blizzard ? "A blizzard howls in. " : w.snow ? "Snow drifts in. " : w.sand ? "A sandstorm blows in. " : w.mist ? "Mist creeps over the ground. " : w.rain ? "Rain rolls in. " : "";
    this.setMessage(`${sky}Here they come! ${this.sideOpen.sim ? "Drag" : "Open Skills and drag"} a bomb onto the field, or plant the war banner to rally your troops.`, 4);
  }

  private endRun() {
    if (!this.sim) return;
    this.stopSummoning();
    this.performanceEnd = this.sim.lost ? 'lost' : 'abandoned';
    this.phase = "over";
    play("fallen");
    replay(this.root.querySelector("#defend-board"), "quake");
    this.picked = null;
    this.showBanner(defeatHTML({ wave: this.sim.wave, best: this.save.bestWave, record: this.newRecord, stats: this.sim.stats }), "defeat");
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
    if (!this.sim || this.sim.unitTester) return;
    const encountered = new Set(this.sim.enemies.map(e => e.kind));
    for (const k of Object.keys(ENEMIES) as EnemyKind[]) if (this.sim.slain[k] > 0) encountered.add(k);
    let changed = false;
    for (const k of encountered) if (!this.save.discovered.includes(k)) { this.save.discovered.push(k); changed = true; }
    if (changed) { this.host.persist(); this.refreshJournal(); }
  }

  private handleEvents() {
    this.discoverEnemies();
    const sim = this.sim!;
    for (const ev of sim.events.splice(0)) {
      if (ev.type === "waveCleared") {
        this.performanceEnd = 'cleared';
        const record = ev.wave > this.save.bestWave;
        const r = this.host.earnWave(ev.wave);
        const pay = r.upgrade ? " +1 upgrade point" : "";
        if (record) {
          this.save.bestWave = ev.wave;
          this.newRecord = ev.wave;
          this.host.persist();
          this.proclaim(`New record — wave ${ev.wave} survived!${pay}`, 3, "win");
          play("record");
        } else {
          this.proclaim(`Wave ${ev.wave} cleared.${pay}`, 2, "win");
          play("wave");
        }
      } else if (ev.type === "waveStart") {
        if (areaForWave(ev.wave).id !== this.weatherArea) {
          const area = areaForWave(ev.wave);
          this.weatherArea = area.id;
          this.weather = rollWeather(undefined, area);
          this.sim!.snowOverride = undefined;
          this.setMessage(`${area.name} · Wave ${ev.wave}`, 3);
        }
        if (isBossWave(ev.wave)) {
          this.proclaim(`Boss wave ${ev.wave}! Night falls as ${ev.wave > 10 ? `${ev.wave / 10} warlords approach` : "a warlord approaches"}…`, 4, "dread");
          play("horn");
        }
        else if (!this.message) this.setMessage(`Wave ${ev.wave}`, 1.5);
      } else if (ev.type === "lost") this.endRun();
    }
  }

  private draw(fit = true) {
    if (!this.renderer) return;
    if (fit) this.fitView();
    if (!this.renderer.canvas.width) return;
    const map = this.sim ? this.sim.map : this.currentMap();
    this.renderer.draw(map, this.sim, this.overlay(), {
      area: areaForWave(this.sim?.unitTester ? 1 : Math.max(this.sim?.wave ?? 1, startingWave(this.save))).id,
      grid: this.phase === "build" ? (this.host.gridLines?.() ?? 0) : 0,
      timings: this.frameTimes.enabled,
      weather: this.weather,
      night: this.night,
      now: performance.now(),
      reduceMotion: this.host.reduceMotion(),
      effects: this.host.effects(),
      healthbars: this.host.healthbars?.() ?? true,
      looks: this.looks(),
      over: this.phase === "over",
      ...(this.picked ? { inspect: { id: this.picked.id, armed: this.sim ?? this.picked.armed } } : {}),
      hideBanner: this.phase === "over" || (this.pointers.session?.drag.from === "banner" && !!this.pointers.session.drag.placed),
    });
  }

  /** Each structure's path look by uid: in battle, the setup it started
   * with; while building, its card's equipped path. */
  private looks(): Record<number, string> {
    const out: Record<number, string> = {}, kinds = new Map(this.save.layout.structures.map((s) => [s.uid, s.kind]));
    if (this.sim) {
      for (const [uid, paths] of Object.entries(this.sim.bonuses.cardPaths ?? {})) {
        const kind = this.sim.map.buildings.find((b) => b.structureUid === Number(uid))?.kind;
        const look = kind ? artLook(kind, Object.values(paths)[0]?.path) : "";
        if (look) out[Number(uid)] = look;
      }
      return out;
    }
    for (const c of this.save.cards ?? []) {
      if (!c.placement?.startsWith("structure:") || c.evolved) continue;
      const uid = Number(c.placement.slice(10)), look = artLook(kinds.get(uid) ?? c.kind, c.path);
      if (look) out[uid] = look;
    }
    return out;
  }

  // ── Dragging ──────────────────────────────────────────────────────────
  private overlay(): Overlay | null {
    return this.pointers.session?.overlay() ?? null;
  }

  private beginDrag(d: Drag, e: PointerEvent) {
    this.pointers.begin(new EditSession(d, this.save.layout, this.sim ? bannerReach(this.sim) : undefined), e);
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
    if (!banner || this.sim!.bannerRemaining > 0) return false;
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
      if (drop.at) {
        if (!sim.plantBanner(drop.at)) return;
        play("banner");
      }
      else if (drop.tap || (drag?.from === "banner" && drag.placed)) sim.plantBanner(null);
      return;
    }
    if (drop.tap) return this.pickLifted();
    const s = this.save;
    if (drop.layout !== s.layout) {
      play("place");
      this.picked = null;
    }
    const drag = this.pointers.session?.drag;
    const cards = this.host.cards?.() ?? [];
    const carried = drag?.from === "palette" && drag.cardId ? cards.find(c => c.id === drag.cardId)
      : drag?.from === "spikes" ? cards.find(c => c.placement === spikeKey(drag.spikes)) : undefined;
    if (carried && drop.layout !== s.layout) {
      const added = drop.layout.structures.find(p => !s.layout.structures.some(old => old.uid === p.uid));
      const row = drop.layout.spikes.find(g => !s.layout.spikes.some(old => spikeKey(old) === spikeKey(g)));
      if (added) carried.placement = `structure:${added.uid}`;
      else if (row) carried.placement = spikeKey(row);
      else delete carried.placement;
    }
    s.layout = drop.layout;
    if (this.host.cards) syncCards(s);
    if (drop.message) this.setMessage(drop.message);
    if (s.layout !== this.mapLayout) this.host.persist();
    this.renderPalette();
  }

  /** A tap on the board: after a lost run it starts the rebuilding;
   * otherwise it picks out the tower or troop building under it (a second
   * tap, or a tap on anything else, puts it down). */
  private tap(e: PointerEvent) {
    if (this.phase === "over") return;
    const { cx, cy, inside } = eventCell(this.renderer!, e);
    const map = this.sim ? this.sim.map : this.currentMap();
    const b = inside ? map.buildings[map.owner[cy * CELLS_W + cx]] : undefined;
    this.pick(inspectable(b) && this.picked?.id !== b.id ? b.id : null);
  }

  /** A tapped structure or ballista, lifted in the build phase and let go
   * where it stood, is picked out. */
  private pickLifted() {
    const drag = this.pointers.session?.drag, map = this.currentMap();
    const b =
      drag?.from === "structure" ? map.buildings.find((o) => o.structureUid === drag.uid)
      : drag?.from === "ballista" ? map.buildings.find((o) => o.corner?.vx === drag.corner.vx && o.corner.vy === drag.corner.vy)
      : undefined;
    this.pick(inspectable(b) && this.picked?.id !== b.id ? b.id : null);
  }

  private pick(id: number | null) {
    this.picked = id === null ? null : { id, armed: { levels: { ...this.save.levels }, bonuses: this.host.bonuses() } };
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
}
