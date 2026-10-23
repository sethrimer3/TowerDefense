import { MagicCircle } from "../magic-circle/render.ts";
import { buildingTree, foundNodes, hasTree, mergedFrom, respecBuilding, undoUpgrade, rootOf, specialtyLabel, specialtyOf, stepName, targetKind, upgradeBuilding, type PaletteKind, type SpecialtyTarget } from "../specializations.ts";
import { pathById, type PathId } from "../knowledge-paths.ts";
import { SIDE_UI, graftedGraph, mapCardHtml, mapCount, mapGraph, mapWeb, sharedBranches, specialtyCircle, treeAllocated, treeBeyond, treeCardHtml, treeStep, type SideKind, type SideUi } from "../ui/specialty.ts";
import { UpgradeGraph } from "../ui/upgrade-graph.ts";
import type { Save } from "../save.ts";
import { bannerReach, onFlag } from "./war-banner.ts";
import { gravesNear } from "./necromancy.ts";
import { meteorReach } from "./meteor.ts";
import { frostReach } from "./frost-nova.ts";
import { dropSpots } from "./reinforcements.ts";
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
 * Tapping a placed building while building opens its upgrade panel
 * (`#defend-specialty`): what it can become or climb next, paid with
 * Knowledge, one building at a time (`specializations.ts`).
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
import { fitLayout, sameGate, spikesRect, type Layout } from "./layout.ts";
import { generateCity, type CityMap } from "./citygen.ts";
import { DefendSim } from "./sim.ts";
import { DefendRenderer } from "./render.ts";
import { BattlePerformance, FrameTimeOverlay } from "./performance.ts";
import type { Overlay } from "./edit-overlay.ts";
import { paintIcon, type IconItem } from "./structure-art.ts";
import { artLook } from "./tower-art.ts";
import { pathBadge, pathLook, paintPathIcons } from "../ui/path-badge.ts";
import { BoardPointers, eventCell, type BoardAim } from "./board-pointers.ts";
import { mineAim, mineRank } from "./mines.ts";
import type { Drag } from "./drag-rules.ts";
import { EditSession, type Drop } from "./edit-session.ts";
import { BattleSound } from "./battle-sound.ts";
import { QUIET, type Scene } from "../ambience.ts";
import { NIGHT_FADE_SECONDS, isBossWave, rollWeather, type Weather } from "./weather.ts";
import { play } from "../sound.ts";
import { replay, sparksOver } from "../ui/flourish.ts";
import { available, keptGroups, plainAvailable, setLayout, startingWave, type DefendSave } from "./progress.ts";
import { ageWater } from "./boats.ts";
import { defeatHTML } from "./defeat.ts";
import { inspectable, type Armed } from "./inspect.ts";

export type DefendHost = {
  save(): DefendSave;
  /** The Smithy's and the skill trees' multipliers for the next defense. */
  bonuses(): Bonuses;
  /** The whole save: the Knowledge a building's upgrade spends. */
  game?(): Save;
  /** Knowledge was spent on an upgrade: store it and show the new count. */
  spentKnowledge?(): void;
  /** Awards an upgrade point for a new highest wave, recording it with payment. */
  earnWave(wave: number): { upgrade: number };
  persist(): void;
  reduceMotion(): boolean;
  /** The park grass and pond effects are on. */
  effects(): boolean;
  devMode(): boolean;
  healthbars?(): boolean;
  /** Enemies, and your troops, drawn as plain squares. */
  simpleEnemies?(): boolean;
  simpleTroops?(): boolean;
  mergedOutlines?(): boolean;
  /** The tile grid's opacity while building, 0 when it's hidden. */
  gridLines?(): number;
  setHealthbars?(value: boolean): void;
  /** Whether the palette lists items the player has none of. */
  showEmpty?(): boolean;
  /** Whether dragged items ride above the pointer. */
  raiseDrag?(): boolean;
  /** Whether a magnifying glass shows the board zoomed in above a drag. */
  magnifier?(): boolean;
  /** Whether the rally flag takes a triple tap rather than a double. */
  tripleTapFlag?(): boolean;
  /** Opens the Tiles tab, where tiles (buildings and consumables) are bought. */
  openTiles?(): void;
};

/** How soon (ms) and how near (CSS pixels) a second tap must come to make a double tap. */
const DOUBLE_TAP_MS = 350, DOUBLE_TAP_SLOP = 30;
const plural = (name: string) => (name.endsWith("s") ? name : `${name}s`);
/** A building whose upgrade tree shows: one with paths, or one of the
 * trees climbed side by side (`SIDE_UI`): the keep's, or the one every
 * placed wall, every gate or every wall ballista shares. */
export type TreeTarget = SpecialtyTarget | { side: SideKind };
/** Whether two specialty targets name the same building. */
const sameTarget = (a: TreeTarget, b: TreeTarget): boolean =>
  "side" in a || "side" in b ? "side" in a && "side" in b && a.side === b.side
  : "uid" in a ? "uid" in b && a.uid === b.uid
  : "spikes" in a ? "spikes" in b && sameGate(a.spikes, b.spikes)
  : "copy" in b && a.copy === b.copy && a.wear?.path === b.wear?.path && a.wear?.rank === b.wear?.rank;

/** The side tree a drag's press opens when held (or tapped where it stood):
 * the keep, a placed wall, a gate or a wall ballista, on the board or in
 * the palette. */
function sideOfDrag(drag: Drag): SideKind | undefined {
  const item = drag.from === "palette" ? drag.item : undefined;
  if (drag.from === "keep") return "keep";
  if (drag.from === "wallBlock" || item === "wallBlock") return "walls";
  if (drag.from === "gate" || item === "cityGate") return "gate";
  if (drag.from === "ballista" || item === "wallBallista") return "ballistas";
  return undefined;
}

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
    aim: (e) => this.aimMine(e),
    pickUp: (e) => this.pickUp(e),
    drop: (drop) => this.drop(drop),
    tap: (e) => this.tap(e),
    hold: (edit) => this.hold(edit.drag),
    raise: () => !!this.host.raiseDrag?.(),
    magnify: () => !!this.host.magnifier?.(),
  });
  /** The building the player tapped (its id in the map), outlined with its
   * reach and troops, and what its reach is reckoned from before a battle. */
  private picked: { id: number; armed: Armed } | null = null;
  private minePreview: { id: number; point?: { x: number; y: number }; since: number } | null = null;
  /** The last tap in battle, for telling a double tap: where (client
   * pixels), when, and what was picked out before it. */
  private lastTap: { x: number; y: number; at: number; taps: number; picked: { id: number; armed: Armed } | null } | null = null;
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
  /** The upgrade tree's building and the node picked in it. */
  /** The open upgrade tree; `map` while it shows its line's upgrade map
   * instead, with the node picked there. */
  private specialty: { target: TreeTarget; picked: string; map?: { picked: string } } | null = null;
  private tree: UpgradeGraph | null = null;
  private treeCircle: MagicCircle | null = null;
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
    this.placeSpecialty();
    if (this.specialty && !this.pointers.session?.overlay()) this.treeCircle?.frame(time, this.host.reduceMotion() || matchMedia("(prefers-reduced-motion: reduce)").matches);
    const drawing = performance.now();
    this.draw(false);
    if (this.renderer) this.pointers.drawLoupe(this.renderer);
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
            <div class="defend-specialty" id="defend-specialty" role="dialog" aria-label="Specialization" hidden></div>
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
    this.bindSpecialty();
    this.renderer = new DefendRenderer(this.root.querySelector("#defend-canvas")!);
    const canvas = this.renderer.canvas;
    canvas.addEventListener("pointerdown", (e) => this.pointers.down(e));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
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
    const s = this.save;
    // One entry a kind for its plain copies, and one for each path and
    // rank its upgraded copies waiting here keep.
    const all: { id: string; name: string; count: number; icon: IconItem; look?: string; badge?: string }[] =
      this.phase === "build"
        ? PALETTE_ITEMS.filter((item) => inCategory(item, this.category)).flatMap((item) => [
            { id: item, name: ITEM_NAMES[item], count: plainAvailable(s, item), icon: item as IconItem },
            ...keptGroups(s, item).map((g) => ({ id: `${item}~${g.path}~${g.rank}`, name: `${ITEM_NAMES[item]} · ${specialtyLabel(g)}`, count: g.count, icon: item as IconItem, look: pathLook(item, g.path), badge: pathBadge(g) })),
          ])
        : [
            { id: "bomb", name: "Bomb", count: s.bombs, icon: "bomb" },
            { id: "banner", name: "War banner", count: Infinity, icon: "banner" },
            { id: "necromancy", name: "Necromancy", count: Infinity, icon: "necromancy" },
            { id: "meteor", name: "Meteor strike", count: Infinity, icon: "meteor" },
            { id: "frostNova", name: "Frost nova", count: Infinity, icon: "frostNova" },
            { id: "reinforcements", name: "Reinforcements", count: Infinity, icon: "reinforcements" },
          ];
    const entries = this.host.showEmpty?.() ? all : all.filter((e) => e.count > 0);
    el.innerHTML =
      (this.phase === "build" ? this.categoryPicker() : `<small class="defend-palette-title">SKILLS</small>`) +
      entries
        .map(
          (e) =>
            `<button class="defend-item ${e.count ? "" : "empty"}" data-item="${e.id}" title="${e.name}" aria-label="${e.name}, ${e.count === Infinity ? "unlimited" : `${e.count} left`}">
              <span class="defend-item-face"><canvas width="48" height="48" data-icon="${e.icon}"${e.look ?? ""}></canvas>${e.badge ?? ""}</span><span>${e.name}</span><b>×${e.count === Infinity ? "∞" : e.count}</b></button>`,
        )
        .join("") +
      (entries.length ? "" : `<small class="defend-palette-none">None owned. Buy more in the Tiles tab.</small>`);
    el.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as IconItem));
    paintPathIcons(el);
    el.querySelectorAll<HTMLButtonElement>("[data-item]").forEach((b) => {
      b.onpointerdown = (e) => this.pressPalette(b.dataset.item!, e);
      // A long press opens the tile's upgrade tree, not the browser's menu.
      b.oncontextmenu = (e) => e.preventDefault();
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
      const item = button.dataset.item, banner = item === "banner", necro = item === "necromancy", meteor = item === "meteor", frost = item === "frostNova", called = item === "reinforcements", spell = necro || meteor || frost || called;
      const left = banner ? this.sim.bannerRemaining : necro ? this.sim.necroRemaining : meteor ? this.sim.meteorRemaining : frost ? this.sim.frostRemaining : called ? this.sim.reinforceRemaining : 0;
      const cooldown = banner ? this.sim.bannerCooldown : necro ? this.sim.necroCooldown : meteor ? this.sim.meteorCooldown : frost ? this.sim.frostCooldown : called ? this.sim.reinforceCooldown : 0;
      const ready = left === 0 && (banner || spell || this.save.bombs > 0);
      const fill = cooldown ? Math.floor((1 - left / cooldown) * 100) : ready ? 100 : 0;
      const key = `${fill}:${Math.ceil(left)}:${ready}:${this.save.bombs}`;
      if (button.dataset.cooldown === key) continue;
      button.dataset.cooldown = key;
      button.classList.toggle("skill-ready", ready);
      button.classList.toggle("skill-loading", left > 0);
      button.style.setProperty("--skill-fill", `${fill}%`);
      button.disabled = !ready;
      const name = banner ? "War banner" : necro ? "Necromancy" : meteor ? "Meteor strike" : frost ? "Frost nova" : called ? "Reinforcements" : "Bomb";
      const status = left > 0 ? `Ready in ${Math.ceil(left)} seconds` : ready ? banner || spell ? "Ready" : `Ready, ${this.save.bombs} left` : "None owned";
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
    if (id === "necromancy") return this.phase === "sim" && !this.sim?.necroRemaining ? this.beginDrag({ from: "necromancy" }, e) : undefined;
    if (id === "meteor") return this.phase === "sim" && !this.sim?.meteorRemaining ? this.beginDrag({ from: "meteor" }, e) : undefined;
    if (id === "frostNova") return this.phase === "sim" && !this.sim?.frostRemaining ? this.beginDrag({ from: "frostNova" }, e) : undefined;
    if (id === "reinforcements") return this.phase === "sim" && !this.sim?.reinforceRemaining ? this.beginDrag({ from: "reinforcements" }, e) : undefined;
    // A kept copy's entry is "kind~path~rank".
    const [item, path, rank] = id.split("~") as [PaletteItem, PathId | undefined, string | undefined];
    if (path) {
      if (!keptGroups(this.save, item).some((g) => g.path === path && g.rank === Number(rank))) return;
      return this.beginDrag({ from: "palette", item, wear: { path, rank: Number(rank) } }, e);
    }
    if (!plainAvailable(this.save, item)) return this.setMessage(`No ${plural(ITEM_NAMES[item].toLowerCase())} left — buy more in the Tiles tab.`);
    this.beginDrag({ from: "palette", item }, e);
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
    this.closeSpecialty();
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
    this.setMessage(`${sky}Here they come! ${this.sideOpen.sim ? "Drag" : "Open Skills and drag"} a bomb onto the field, plant the war banner to rally your troops, raise the fallen with Necromancy, call down a meteor, freeze them with a Frost nova, or drop in reinforcements.`, 4);
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
    const lifting = this.phase === "build" ? this.pointers.liftProgress() : null;
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
      simpleEnemies: this.host.simpleEnemies?.() ?? false,
      simpleTroops: this.host.simpleTroops?.() ?? false,
      mergedOutlines: this.host.mergedOutlines?.() ?? true,
      looks: this.looks(),
      gate: this.save.gateRanks,
      over: this.phase === "over",
      shimmer: this.phase === "build" && !this.sim,
      ...(lifting ? { lifting } : {}),
      ...(this.picked ? { inspect: { id: this.picked.id, armed: this.sim ?? this.picked.armed, ...(this.minePreview?.id === this.picked.id ? { minePreview: this.minePreview } : {}) } } : {}),
      hideBanner: this.phase === "over" || (this.pointers.session?.drag.from === "banner" && !!this.pointers.session.drag.placed),
    });
  }

  /** Each structure's path look by uid: in battle, the setup it started
   * with; while building, the path it wears. */
  private looks(): Record<number, string> {
    const out: Record<number, string> = {};
    if (this.sim) {
      for (const [uid, paths] of Object.entries(this.sim.bonuses.structurePaths ?? {})) {
        const kind = this.sim.map.buildings.find((b) => b.structureUid === Number(uid))?.kind;
        const look = kind ? artLook(kind, Object.values(paths)[0]?.path) : "";
        if (look) out[Number(uid)] = look;
      }
      return out;
    }
    for (const st of this.save.layout.structures) {
      const look = artLook(st.kind, st.path);
      if (look) out[st.uid] = look;
    }
    return out;
  }

  // ── Dragging ──────────────────────────────────────────────────────────
  private overlay(): Overlay | null {
    const o = this.pointers.session?.overlay() ?? null;
    // An aimed meteor or nova shows its researched reach; Necromancy marks the fallen it would raise.
    if (o?.spell?.look === "meteor" && this.sim) o.spell.r = meteorReach(this.sim);
    else if (o?.spell?.look === "frost" && this.sim) o.spell.r = frostReach(this.sim);
    else if (o?.spell?.look === "reinforce" && this.sim) o.spell.spots = dropSpots(this.sim, o.spell);
    else if (o?.spell && this.sim) o.spell.souls = gravesNear(this.sim, o.spell, o.spell.r);
    // Held Necromancy shows a skull on every grave, over the board or not.
    if (this.sim?.graves.length && this.pointers.session?.drag.from === "necromancy")
      return { ...(o ?? { legal: new Set(), hover: null, ghost: null }), graves: this.sim.graves };
    return o;
  }

  private beginDrag(d: Drag, e: PointerEvent) {
    this.closeSpecialty();
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
    if (!edit) return false;
    // A city tile lifts only once held; until then the press moves the view.
    if (edit.byTile) {
      this.pointers.pend(edit, edit.byTile, e);
      return false;
    }
    this.pointers.begin(edit, e);
    return true;
  }

  /** Battle aiming owns a tower-origin drag; setup keeps normal building movement. */
  private aimMine(e: PointerEvent): BoardAim | null {
    const sim = this.phase === "sim" ? this.sim : null;
    if (!sim || !this.renderer) return null;
    const p = eventCell(this.renderer, e);
    if (!p.inside) return null;
    const banner = sim.warBanner;
    if (banner && !banner.flag && sim.bannerRemaining <= 0 && p.fx >= banner.x - 1 && p.fx <= banner.x + 2.2 && p.fy >= banner.y - 1.4 && p.fy <= banner.y + 1) return null;
    let b = sim.map.buildings[sim.map.owner[p.cy * CELLS_W + p.cx]];
    // The selected crosshair is also a handle, so dragging it home resets aim.
    const selected = this.picked && sim.map.buildings[this.picked.id];
    const handle = selected && sim.mineAims.get(selected.id);
    if (selected?.kind === "minelayerTower" && handle && Math.hypot(p.fx - handle.x, p.fy - handle.y) < .8) b = selected;
    if (b?.kind !== "minelayerTower" || !sim.intact(b) || mineRank(sim, b) < 1) return null;
    const wasSelected = this.picked?.id === b.id;
    this.pick(b.id);
    this.lastTap = null;
    const preview = (ev: PointerEvent) => {
      const p = eventCell(this.renderer!, ev), point = mineAim(b, { x: p.fx, y: p.fy });
      const old = this.minePreview;
      this.minePreview = { id: b.id, point, since: old?.id === b.id && !old.point && !point ? old.since : performance.now() };
    };
    return {
      move: preview,
      end: (ev, commit, moved) => {
        if (commit && moved && this.sim === sim && sim.intact(b)) {
          preview(ev);
          const point = this.minePreview?.point;
          if (point) sim.mineAims.set(b.id, point);
          else sim.mineAims.delete(b.id);
          this.setMessage(point ? "Minelayer aimed. Drag the crosshair back onto its tower for random coverage." : "Minelayer: random coverage across its full range.", 4);
        } else {
          this.minePreview = null;
          if (commit && !moved && wasSelected) this.pick(null);
        }
      },
    };
  }

  /** A press on the planted war banner (its pole or cloth) lifts it. */
  private pickUpBanner(e: PointerEvent): boolean {
    const banner = this.sim?.warBanner;
    // A rally flag isn't lifted: a double tap elsewhere moves it.
    if (!banner || banner.flag || this.sim!.bannerRemaining > 0) return false;
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
    if (drop.kind === "spell") {
      const sim = this.phase === "sim" ? this.sim : null;
      if (!sim || !drop.at) return;
      if (drop.spell === "reinforcements") {
        if (!sim.castReinforcements(drop.at)) return;
        play("muster");
        this.updateSkillCooldowns();
        return;
      }
      if (drop.spell === "frostNova") {
        if (!sim.castFrostNova(drop.at)) return;
        play("nova");
        this.updateSkillCooldowns();
        return;
      }
      if (drop.spell === "meteor") {
        if (!sim.castMeteor(drop.at)) return;
        play("meteor");
        this.updateSkillCooldowns();
        return;
      }
      const raised = sim.castNecromancy(drop.at);
      if (raised < 0) return;
      play(raised ? "raise" : "hiss");
      this.setMessage(raised ? `${raised} of the fallen ${raised === 1 ? "rises" : "rise"} to fight for you.` : "No enemy fell there lately: nothing rises.", 3);
      this.updateSkillCooldowns();
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
    this.closeSpecialty();
    const s = this.save;
    if (drop.layout !== s.layout) {
      play("place");
      this.picked = null;
    }
    // Moving keeps a building's upgrades; taking one up keeps them in the
    // palette (`setLayout`).
    const changed = drop.layout !== s.layout;
    setLayout(s, drop.layout);
    if (drop.message) this.setMessage(drop.message);
    if (changed) this.host.persist();
    this.renderPalette();
  }

  /** A tap on the board: after a lost run it starts the rebuilding;
   * otherwise it picks out the tower or troop building under it (a second
   * tap, or a tap on anything else, puts it down). */
  private tap(e: PointerEvent) {
    if (this.phase === "over") return;
    if (this.phase === "sim" && this.rallyTap(e)) return;
    this.closeSpecialty();
    const { cx, cy, inside } = eventCell(this.renderer!, e);
    const map = this.sim ? this.sim.map : this.currentMap();
    const b = inside ? map.buildings[map.owner[cy * CELLS_W + cx]] : undefined;
    this.pick(inspectable(b) && this.picked?.id !== b.id ? b.id : null);
  }

  /** In battle, a second tap (a third with the triple tap setting) close to
   * the one before and soon after it plants a rally flag there (free, any
   * number of times), or takes the flag away when made on it, putting back
   * whatever the first tap picked out. True when it did. */
  private rallyTap(e: PointerEvent): boolean {
    const last = this.lastTap, now = performance.now();
    const chained = !!last && now - last.at <= DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= DOUBLE_TAP_SLOP;
    // Each tap of a run is measured from the one before, and keeps what the
    // run's first tap found picked out.
    this.lastTap = { x: e.clientX, y: e.clientY, at: now, taps: chained ? last.taps + 1 : 1, picked: chained ? last.picked : this.picked };
    if (this.lastTap.taps < (this.host.tripleTapFlag?.() ? 3 : 2)) return false;
    const { fx, fy, inside } = eventCell(this.renderer!, e);
    if (!inside || !this.sim) return false;
    this.picked = this.lastTap.picked;
    this.lastTap = null;
    if (onFlag(this.sim.warBanner, fx, fy)) this.sim.liftFlag();
    else this.sim.plantFlag({ x: fx, y: fy });
    play("banner");
    return true;
  }

  /** A tapped structure or ballista, lifted in the build phase and let go
   * where it stood, is picked out. */
  private pickLifted() {
    const drag = this.pointers.session?.drag, map = this.currentMap();
    const side = drag && sideOfDrag(drag);
    const target: TreeTarget | null = drag?.from === "structure" ? { uid: drag.uid } : drag?.from === "spikes" ? { spikes: drag.spikes } : side ? { side } : null;
    const b =
      drag?.from === "structure" ? map.buildings.find((o) => o.structureUid === drag.uid)
      : drag?.from === "ballista" ? map.buildings.find((o) => o.corner?.vx === drag.corner.vx && o.corner.vy === drag.corner.vy)
      : undefined;
    // A second tap on the same building puts it down.
    const open = this.specialty?.target, same = !!target && !!open && sameTarget(open, target);
    if (same || (inspectable(b) && this.picked?.id === b.id)) {
      this.closeSpecialty();
      return this.pick(null);
    }
    this.pick(inspectable(b) ? b.id : null);
    if (target) this.openSpecialty(target);
    else this.closeSpecialty();
  }

  /** A press held still on a palette tile or a placed building opens its
   * upgrade tree (only while building, and only for kinds that have one). */
  private hold(drag: Drag): boolean {
    if (this.phase !== "build") return false;
    const side = sideOfDrag(drag);
    if (side) {
      this.openSpecialty({ side });
      play("knock");
      return true;
    }
    const target: SpecialtyTarget | null =
      drag.from === "structure" ? { uid: drag.uid }
      : drag.from === "spikes" ? { spikes: drag.spikes }
      : drag.from === "palette" && hasTree(drag.item) ? { copy: drag.item, ...(drag.wear ? { wear: drag.wear } : {}) }
      : null;
    const kind = target && targetKind(this.save, target);
    if (!target || !kind || !hasTree(kind)) return false;
    this.openSpecialty(target);
    play("knock");
    return true;
  }

  /** Whether a building's upgrade tree can be opened from another tab
   * (Tiles' press and hold): only between battles, while building. */
  canOpenTree() {
    return this.phase === "build";
  }
  /** Opens `target`'s upgrade tree, as a press held on it here would
   * (Tiles' press and hold, once the tab has turned to Defend). */
  openTree(target: TreeTarget) {
    if (this.phase === "build") this.openSpecialty(target);
  }

  private pick(id: number | null) {
    if (id !== this.picked?.id) this.minePreview = null;
    this.picked = id === null ? null : { id, armed: { levels: { ...this.save.levels }, bonuses: this.host.bonuses() } };
  }

  // ── Each building's upgrades ──────────────────────────────────────────
  /** Shows `target`'s upgrade tree: what it has been, and every branch
   * still open to it. Only while building. */
  private openSpecialty(target: TreeTarget) {
    if ("side" in target) {
      if (this.phase !== "build") return this.closeSpecialty();
      this.specialty = { target, picked: SIDE_UI[target.side].root };
      // The keep and a tapped ballista stay picked out; the shared trees pick nothing else.
      if (target.side === "keep") this.pick(this.currentMap().buildings.find((o) => o.kind === "keep")?.id ?? null);
      else if (target.side !== "ballistas") this.pick(null);
      return this.renderSpecialty(true);
    }
    const kind = targetKind(this.save, target);
    if (this.phase !== "build" || !kind) return this.closeSpecialty();
    const wear = specialtyOf(this.save, target);
    this.specialty = { target, picked: wear ? `p:${wear.path}:${wear.rank}` : `k:${kind}` };
    if ("uid" in target) {
      const b = this.currentMap().buildings.find((o) => o.structureUid === target.uid);
      if (b && inspectable(b)) this.pick(b.id);
    }
    this.renderSpecialty(true);
  }

  private closeSpecialty() {
    if (!this.specialty) return;
    this.specialty = null;
    this.renderSpecialty();
  }

  /** The panel's one set of listeners: buy, respec, close, and Escape. */
  private bindSpecialty() {
    const el = this.root.querySelector<HTMLElement>("#defend-specialty")!;
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => {
      const t = e.target as Element;
      if (t.closest("[data-specialty-close]")) return this.closeSpecialty();
      const buy = t.closest<HTMLButtonElement>("[data-ug-buy]");
      if (buy && !buy.disabled) return this.upgrade(buy.dataset.ugBuy!);
      const undo = t.closest<HTMLButtonElement>("[data-ug-undo]");
      if (undo && !undo.disabled) return this.undo(undo.dataset.ugUndo!);
      const respec = t.closest<HTMLButtonElement>("[data-ug-respec]");
      if (respec && !respec.disabled) return this.respec();
      if (t.closest("[data-ug-map]")) return this.toggleMap();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.closeSpecialty();
      }
    });
  }

  /** Swaps the tree for its line's upgrade map, or back, standing on the
   * building's own node. */
  private toggleMap() {
    const sp = this.specialty;
    if (!sp || "side" in sp.target) return;
    sp.map = sp.map ? undefined : { picked: sp.picked };
    this.renderSpecialty();
  }

  /** The player bought tree node `id` for the panel's building. */
  private upgrade(id: string) {
    const sp = this.specialty, game = this.host.game?.();
    if (!sp || !game || this.phase !== "build") return;
    if ("side" in sp.target) {
      const tree = SIDE_UI[sp.target.side], branch = tree.step(game, id);
      if (!branch) return;
      const r = tree.buy(game, branch);
      if (!r.ok) return this.setMessage(r.reason, 2);
      this.afterChange("chime");
      return this.bought(id);
    }
    const shared = this.shared(id);
    if (shared) {
      const branch = shared.step(game, id);
      if (!branch) return;
      const r = shared.buy(game, branch);
      if (!r.ok) return this.setMessage(r.reason, 2);
      this.afterChange("chime");
      return this.bought(id);
    }
    const kind = targetKind(this.save, sp.target);
    const step = kind && treeStep(kind, specialtyOf(this.save, sp.target), id);
    if (!step) return;
    const r = upgradeBuilding(game, sp.target, step);
    if (!r.ok) return this.setMessage(r.reason, 2);
    // A palette copy is now another copy (kept on its new rank, or a new kind).
    if (r.copy) sp.target = r.copy;
    this.afterChange(step.type === "path" ? "chime" : "unlock");
    if (r.waiting) {
      // Too big for where it stood: it waits in the palette.
      this.closeSpecialty();
      this.picked = null;
      this.setMessage(`${stepName(step)}: its size changed, so it waits in the palette to be placed again.`, 3);
      return;
    }
    if (step.type === "merge") this.setMessage(`Merged into a ${stepName(step)}: the other two buildings were used up.`, 3);
    this.bought(id);
  }

  /** Node `id` was just bought: pick it and celebrate. */
  private bought(id: string) {
    const sp = this.specialty!;
    sp.picked = id;
    this.renderSpecialty();
    const node = this.root.querySelector<HTMLElement>(`#defend-specialty [data-node="${id}"]`);
    replay(node, "bought");
    sparksOver(node, "arcane");
  }

  /** Respec, free: every Knowledge point back, the building back to its root. */
  private respec() {
    const sp = this.specialty, game = this.host.game?.();
    if (!sp || !game || this.phase !== "build") return;
    const tree = "side" in sp.target ? SIDE_UI[sp.target.side] : undefined;
    const r = tree ? tree.respec(game) : respecBuilding(game, sp.target as SpecialtyTarget);
    this.wentBack(r, "Respecced", tree?.root);
  }

  /** Undoes tree node `id` and every upgrade after it, free, their Knowledge back. */
  private undo(id: string) {
    const sp = this.specialty, game = this.host.game?.();
    if (!sp || !game || this.phase !== "build") return;
    if ("side" in sp.target) {
      const tree = SIDE_UI[sp.target.side], back = tree.undo(game, id);
      if (!back) return;
      // Stand on the rank below it, or the root.
      return this.wentBack(tree.undoRank(game, back), "Undone", back.rank > 1 ? `q:${back.id}:${back.rank - 1}` : tree.root);
    }
    const shared = this.shared(id);
    if (shared) {
      const back = shared.undo(game, id);
      if (!back) return;
      return this.wentBack(shared.undoRank(game, back), "Undone", back.rank > 1 ? `q:${back.id}:${back.rank - 1}` : shared.root);
    }
    this.wentBack(undoUpgrade(game, sp.target, id), "Undone");
  }

  /** The shared branches node `id` of the panel's building is on (the
   * Revolutionary's), if it is one of theirs. */
  private shared(id: string): SideUi | undefined {
    const sp = this.specialty;
    if (!sp || "side" in sp.target || !id.startsWith("q:")) return undefined;
    const kind = targetKind(this.save, sp.target);
    return kind ? sharedBranches(kind) : undefined;
  }

  /** The picked node `id` was tapped again: buy it when it is next, or,
   * when it is owned, sell everything after it (undo the one grown from
   * it; on a side tree's root, every rank), staying on it. */
  private again(id: string) {
    const sp = this.specialty, game = this.host.game?.();
    if (!sp || !game || this.phase !== "build") return;
    if ("side" in sp.target) {
      const tree = SIDE_UI[sp.target.side];
      if (tree.step(game, id)) return this.upgrade(id);
      const beyond = tree.beyond(game, id);
      if (!beyond) return;
      if ("all" in beyond) return this.respec();
      const back = tree.undo(game, beyond.undo);
      if (!back) return;
      return this.wentBack(tree.undoRank(game, back), "Sold", id);
    }
    const shared = this.shared(id);
    if (shared) {
      if (shared.step(game, id)) return this.upgrade(id);
      const beyond = shared.beyond(game, id), back = beyond && "undo" in beyond ? shared.undo(game, beyond.undo) : undefined;
      if (back) this.wentBack(shared.undoRank(game, back), "Sold", id);
      return;
    }
    const kind = targetKind(this.save, sp.target);
    if (!kind) return;
    const wear = specialtyOf(this.save, sp.target);
    if (treeStep(kind, wear, id)) return this.upgrade(id);
    const beyond = treeBeyond(kind, wear, id);
    if (beyond) this.wentBack(undoUpgrade(game, sp.target, beyond), "Sold", id);
  }

  /** After a respec or an undo: save, redraw, and stand on where it went back to. */
  private wentBack(r: { ok: true; kind?: string; waiting?: boolean; copy?: unknown } | { ok: false; reason: string }, what: string, at?: string) {
    const sp = this.specialty!;
    if (!r.ok) {
      this.setMessage(r.reason, 2);
      return this.renderSpecialty();
    }
    if ("copy" in r && r.copy) sp.target = r.copy as SpecialtyTarget;
    this.afterChange("coin");
    if ("waiting" in r && r.waiting) {
      this.closeSpecialty();
      this.picked = null;
      this.setMessage(`${what}: no room where it stood, so it waits in the palette.`, 3);
      return;
    }
    const wear = "side" in sp.target ? undefined : specialtyOf(this.save, sp.target);
    sp.picked = at ?? (wear ? `p:${wear.path}:${wear.rank}` : `k:${r.kind}`);
    this.renderSpecialty();
    sparksOver(this.root.querySelector<HTMLElement>("#defend-specialty .ug-alloc"), "gold");
  }

  /** After the building changed: save, pay, play, and redraw the palette and pick. */
  private afterChange(cue: "chime" | "unlock" | "coin") {
    const sp = this.specialty!;
    this.host.spentKnowledge?.();
    this.host.persist();
    play(cue);
    this.renderPalette();
    if (this.picked) this.pick(this.currentMap().buildings.find((o) => "uid" in sp.target && o.structureUid === sp.target.uid)?.id ?? this.picked.id);
  }

  /** Draws the upgrade tree (`focus`: move the keyboard into it). */
  private renderSpecialty(focus = false) {
    const el = this.root.querySelector<HTMLElement>("#defend-specialty");
    if (!el) return;
    const sp = this.specialty, game = this.host.game?.();
    const kind = !sp ? undefined : "side" in sp.target ? sp.target.side : targetKind(this.save, sp.target);
    if (!sp || !kind || !game || this.phase !== "build") {
      if (sp) this.specialty = null;
      this.treeCircle?.destroy();
      this.treeCircle = null;
      this.tree?.destroy();
      this.tree = null;
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const side = "side" in sp.target ? SIDE_UI[sp.target.side] : undefined;
    const wear = side ? undefined : specialtyOf(this.save, sp.target as SpecialtyTarget);
    const name = side ? side.name : kind === "wallSpikes" ? "Wall spikes" : ITEM_NAMES[kind as PaletteItem];
    if (!this.tree) {
      el.className = "defend-specialty upgrade-tree";
      el.innerHTML = `<header class="ug-top">
          <div class="ug-alloc" data-ug-ignore><small>ALLOCATED</small><b></b><button class="ug-respec" data-ug-respec></button></div>
          <div class="ug-title"><small>UPGRADE TREE</small><b></b></div>
          <button class="ug-map-toggle" data-ug-map data-ug-ignore></button>
          <button class="spec-close" data-specialty-close aria-label="Close" data-ug-ignore>×</button></header>
        <div class="ug-host"></div>
        <div class="ug-card" data-ug-ignore aria-live="polite"></div>`;
      el.hidden = false;
      this.tree = new UpgradeGraph(el.querySelector<HTMLElement>(".ug-host")!, {
        reduceMotion: () => this.host.reduceMotion(),
        paint: (n) => {
          n.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]").forEach((c) => paintIcon(c, c.dataset.icon as IconItem));
          paintPathIcons(n);
        },
        onPick: (id) => {
          if (!this.specialty) return;
          // The map is read only: a tap only picks.
          if (this.specialty.map) {
            this.specialty.map.picked = id;
            return this.renderSpecialty();
          }
          // A second tap on the picked node buys it, or sells everything after it.
          if (this.specialty.picked === id) return this.again(id);
          this.specialty.picked = id;
          this.renderSpecialty();
        },
      });
      if (!this.host.reduceMotion()) replay(el, "spec-open");
    }
    this.treeCircle ??= new MagicCircle();
    this.treeCircle.attach(el.querySelector<HTMLElement>(".ug-host")!);
    this.treeCircle.set(specialtyCircle(kind, wear, this.save.keepRanks, this.save.wallRanks, this.save.gateRanks, this.save.ballistaRanks, this.save.revolutionaryRanks, this.save.shadowRanks, this.save.nanoRanks));
    const plainKind = kind as PaletteKind;
    const spent = side ? side.allocated(game) : treeAllocated(plainKind, wear);
    const plain = side ? !side.owned(game) : spent === 0 && (plainKind === "wallSpikes" || rootOf(plainKind) === plainKind);
    el.setAttribute("aria-label", `Upgrade tree: ${name}`);
    el.querySelector(".ug-title b")!.textContent = name;
    el.querySelector(".ug-alloc b")!.textContent = `✦ ${spent.toLocaleString("en")}`;
    el.querySelector(".ug-alloc")!.setAttribute("title", `${spent.toLocaleString("en")} Knowledge spent on ${side ? side.whom : "this building"}: all of it comes back with a respec`);
    const respec = el.querySelector<HTMLButtonElement>(".ug-respec")!;
    respec.disabled = plain;
    respec.textContent = "Respec · free";
    respec.title = plain ? "Nothing allocated yet" : side ? `Get all ${spent.toLocaleString("en")} Knowledge back and ${side.plain}` : `Get all ${spent.toLocaleString("en")} Knowledge back and turn it back into ${plainKind === "wallSpikes" ? "a plain row of spikes" : `${mergedFrom(plainKind) ? "three" : "a"} ${ITEM_NAMES[rootOf(plainKind)]}${mergedFrom(plainKind) ? "s, two of them waiting in the palette" : ""}`}`;
    const mapBtn = el.querySelector<HTMLButtonElement>(".ug-map-toggle")!;
    mapBtn.hidden = !!side;
    mapBtn.textContent = sp.map ? "Tree" : "Map";
    mapBtn.title = sp.map ? "Back to this building's upgrade tree" : "Every upgrade discovered by buildings of its line";
    el.classList.toggle("mapping", !!sp.map && !side);
    el.querySelector(".ug-title small")!.textContent = sp.map && !side ? "UPGRADE MAP" : "UPGRADE TREE";
    el.querySelector(".ug-alloc small")!.textContent = sp.map && !side ? "DISCOVERED" : "ALLOCATED";
    respec.hidden = !!sp.map && !side;
    if (sp.map && !side) return this.renderMap(el, plainKind, wear);
    const shared = side ? undefined : this.shared(sp.picked);
    el.querySelector(".ug-card")!.innerHTML = side ? side.card(game, sp.picked) : shared ? shared.card(game, sp.picked) : treeCardHtml(game, plainKind, wear, sp.picked);
    this.tree.set(side ? side.graph(game) : graftedGraph(game, plainKind, wear), sp.picked);
    if (focus) el.querySelector<HTMLElement>(".ug-buy:not(:disabled), [data-specialty-close]")?.focus({ preventScroll: true });
  }

  /** The upgrade map of the building's whole line: every upgrade any
   * building of it has reached (every one in Developer mode), what this one
   * has in gold. */
  private renderMap(el: HTMLElement, kind: PaletteKind, wear: ReturnType<typeof specialtyOf>) {
    const sp = this.specialty!, game = this.host.game!()!;
    const found = foundNodes(this.save), all = this.host.devMode();
    const here = new Set(buildingTree(kind, wear).filter((n) => n.state === "owned").map((n) => n.id));
    const line = kind === "wallSpikes" ? "Wall spikes" : ITEM_NAMES[rootOf(kind)];
    const count = mapCount(kind, found);
    el.setAttribute("aria-label", `Upgrade map: ${line}`);
    el.querySelector(".ug-title b")!.textContent = `${line} line`;
    el.querySelector(".ug-alloc b")!.textContent = `${count.found} / ${count.total}`;
    el.querySelector(".ug-alloc")!.setAttribute("title", `${count.found} of the ${count.total} upgrades of the ${line} line discovered${all ? " (Developer mode shows them all)" : ""}`);
    el.querySelector(".ug-card")!.innerHTML = mapCardHtml(game, kind, found, here, sp.map!.picked);
    this.tree!.set(mapGraph(kind, found, here, all), sp.map!.picked, mapWeb(kind));
  }

  private placeSpecialty() {
    // The tree fills the board; it only steps aside while something is carried.
    const el = this.root.querySelector<HTMLElement>("#defend-specialty");
    if (el && !el.hidden) el.classList.toggle("carrying", !!this.pointers.session?.overlay());
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
