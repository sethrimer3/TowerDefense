/** The Mine tab: the mine's view, the crew's tally, hiring miners, the
 * crew's list (each miner by name, dragged between the three trades: the
 * face, the forge, the smithy; tapped to follow), and moving on to a new
 * prospect when this one is worked out. A building tapped shows its stats
 * and the button that raises it a level. The mine itself runs whatever tab
 * shows (`advance`, from the app's frame loop), and works on while the game
 * is closed: on loading, the time away (up to a cap) is caught up a slice
 * each frame. */
import { play } from "../sound.ts";
import { BARS_PER_POINT, CREW_PER_LEVEL, METALS, metalSum, type Metals, DAY_TICKS, FORGE_PER_LEVEL, JOBS, KIT, MAX_MINERS, MineSim, SEAL_LEVEL, SMITHS_PER_LEVEL, STOCK_PER_LEVEL, STOCK_RATE, TICK_HZ, type Cause, type Job, type Miner, type MineNews, type MineSave, type Weather } from "./sim.ts";
import { MAX_LEVEL, type BuildingId } from "./buildings.ts";
import { MineRenderer } from "./render.ts";

/** Longest time away the mine catches up on. */
export const MAX_AWAY_MS = 2 * 60 * 60 * 1000;

const WEATHER_NAME: Record<Weather, string> = { clear: "Clear", cloudy: "Cloudy", rain: "Rain", storm: "Thunderstorm" };
const LOSS: Record<Cause, string> = {
  crushed: "crushed by falling ground", drowned: "drowned in the flood", starved: "starved, trapped below", burnt: "burnt", struck: "struck by lightning",
};
/** How a piece of the mine's news reads in the tally, if it's told there. */
function tell(n: MineNews) {
  if (n.kind === "lost") return `A miner was ${LOSS[n.cause!]}`;
  if (n.kind === "saved") return `A miner was nearly ${LOSS[n.cause!]}, and pulled out`;
  if (n.kind === "fire") return "Fire in the workings!";
  return null;
}

export interface MineHost {
  /** Gold the player holds, and whether purchases are free (Dev). */
  gold(): number;
  free(): boolean;
  spendGold(n: number): void;
  /** The smithy turned out Smithy points (copper, silver, gold). */
  earn(points: Metals): void;
  /** Ranks of the skills the mine reads: Coffee, Waterproofing, and Master
   * smith (room for another smith). */
  upgrades(): { coffee: number; waterproof: number; smiths: number };
  /** Names of the smiths working a Smithy upgrade: they stay at the smithy. */
  busySmiths(): ReadonlySet<string>;
  effects(): boolean;
  /** Fresh seeds for a new mine. */
  newSeed(): number;
  /** The shared dialog, to ask before leaving a prospect early. */
  modal: HTMLDialogElement;
  /** Saves the game (after moving to a new prospect). */
  store(): void;
}

const TRADE: Record<Job, { name: string; hint: string }> = {
  mine: { name: "Mine", hint: "Miners dig, fit out the workings and bring the ore up" },
  forge: { name: "Forge", hint: "Forge hands smelt the ore into bars" },
  smith: { name: "Smithy", hint: "Smiths work the bars into Smithy points, and the Smithy's upgrades" },
};
/** What a building's next level brings. */
function levelGain(id: BuildingId, level: number) {
  if (id === "barracks") return `Bunks for ${CREW_PER_LEVEL * level} miners`;
  if (id === "forge") return `Room for ${FORGE_PER_LEVEL * level} forge hands, and more ore`;
  if (id === "smithy") return `Room for ${SMITHS_PER_LEVEL * level} smiths`;
  if (id === "warehouse") return `Holds ${STOCK_PER_LEVEL * level} supplies, brings in ${STOCK_RATE * level} a minute; the rest rise to level ${Math.min(MAX_LEVEL, level + 1)}`;
  return `Keeps out ${Math.round(SEAL_LEVEL * 100)}% more of the rain`;
}
const METAL_NAME: Record<keyof Metals, string> = { copper: "Copper", silver: "Silver", gold: "Gold" };
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export class MinePage {
  sim!: MineSim;
  private root: HTMLElement;
  private host: MineHost;
  private renderer: MineRenderer | null = null;
  /** Ticks owed: real time not yet simulated. */
  private owed = 0;
  private last = 0;
  private built = false;
  private shownTally = "";
  private shownCrew = "";
  /** A name being dragged in the crew's list (the list holds still). */
  private dragging = false;

  constructor(root: HTMLElement, host: MineHost) {
    this.root = root;
    this.host = host;
  }

  /** Starts from a saved mine (catching up the time since it was saved), or
   * a fresh one. */
  load(saved: MineSave | null, now: number) {
    this.sim = saved ? new MineSim(saved.seed, saved) : new MineSim(this.host.newSeed());
    this.owed = saved ? (Math.min(MAX_AWAY_MS, Math.max(0, now - saved.savedAt)) * TICK_HZ) / 1000 : 0;
    this.last = now;
    if (this.renderer) this.renderer.home(this.sim);
  }
  snapshot(now: number): MineSave {
    return this.sim.save(now);
  }

  /** Runs the mine up to wall-clock time `now`, within a slice of the frame
   * (a bigger one while catching up), and pays what it earned. */
  advance(now: number) {
    const gap = Math.max(0, now - this.last);
    this.last = now;
    this.owed = Math.min((MAX_AWAY_MS * TICK_HZ) / 1000, this.owed + (gap * TICK_HZ) / 1000);
    const start = performance.now(), budget = this.owed > TICK_HZ * 2 ? 12 : 6;
    // Catching up on time away, only the first miner to come to harm dies.
    this.sim.catchingUp = this.owed > TICK_HZ * 5;
    const up = this.host.upgrades();
    this.sim.coffee = up.coffee;
    this.sim.waterproof = up.waterproof;
    this.sim.extraSmiths = up.smiths;
    let n = 0;
    while (this.owed >= 1) {
      this.sim.step();
      this.owed--;
      if (++n % 32 === 0 && performance.now() - start > budget) break;
    }
    const pay = this.sim.collect();
    if (metalSum(pay) > 0) this.host.earn(pay);
  }

  /** Runs the mine `minutes` ahead at once (console helper). */
  fastForward(minutes: number) {
    for (let t = 0; t < minutes * 60 * TICK_HZ; t++) this.sim.step();
    this.host.earn(this.sim.collect());
  }

  /** The tab is shown. */
  show() {
    if (!this.built) this.build();
    this.renderer!.resize();
    this.refresh();
  }

  private build() {
    this.built = true;
    this.root.innerHTML = `<div class="mine-head">
        <button id="mine-hire" class="mine-hire"></button>
        <p id="mine-tally" class="mine-tally"></p>
        <button id="mine-follow" class="mine-follow" aria-pressed="false" title="Follow the crew down">⤓ Follow</button>
      </div>
      <div class="mine-tools">
        <button id="mine-crew-toggle" class="mine-crew-toggle" aria-pressed="false" aria-controls="mine-crew">☰ Crew</button>
        <p id="mine-prospect" class="mine-prospect"></p>
        <button id="mine-prospect-new" class="mine-prospect-new">⚑ New Prospect</button>
      </div>
      <div class="mine-body" id="mine-body">
        <aside class="mine-crew" id="mine-crew" aria-label="The crew" aria-hidden="true">
          ${JOBS.map((j) => `<section class="crew-box" data-job="${j}" title="${TRADE[j].hint}"><h3><i class="job-mark job-${j}"></i>${TRADE[j].name} <b data-count="${j}">0</b></h3><ul></ul></section>`).join("")}
          <p class="crew-hint">Drag a name to another trade. Tap one to follow them. Smiths on a Smithy upgrade stay put.</p>
        </aside>
        <div class="mine-view"><canvas id="mine-canvas" aria-label="The mine"></canvas><div id="mine-info" class="mine-info" hidden></div><p id="mine-away" class="mine-away" hidden></p></div>
      </div>`;
    const canvas = this.root.querySelector<HTMLCanvasElement>("#mine-canvas")!;
    this.renderer = new MineRenderer(canvas);
    this.renderer.refWidth = this.root.querySelector<HTMLElement>("#mine-body")!.clientWidth;
    this.renderer.resize();
    this.renderer.home(this.sim);
    this.root.querySelector<HTMLButtonElement>("#mine-hire")!.onclick = () => this.hire();
    const follow = this.root.querySelector<HTMLButtonElement>("#mine-follow")!;
    follow.onclick = () => {
      this.renderer!.follow = !this.renderer!.follow;
      if (this.renderer!.follow) this.select(null);
      follow.setAttribute("aria-pressed", String(this.renderer!.follow));
      follow.classList.toggle("selected", this.renderer!.follow);
    };
    const toggle = this.root.querySelector<HTMLButtonElement>("#mine-crew-toggle")!;
    toggle.onclick = () => {
      const open = toggle.getAttribute("aria-pressed") !== "true";
      toggle.setAttribute("aria-pressed", String(open));
      this.root.querySelector("#mine-body")!.classList.toggle("crew-open", open);
      this.root.querySelector("#mine-crew")!.setAttribute("aria-hidden", String(!open));
    };
    this.root.querySelector<HTMLButtonElement>("#mine-prospect-new")!.onclick = () => this.askProspect();
    this.root.querySelector<HTMLElement>("#mine-info")!.onclick = (e) => {
      const up = (e.target as Element).closest<HTMLButtonElement>("[data-upgrade]");
      if (up && !up.disabled) this.upgrade(up.dataset.upgrade as BuildingId);
    };
    this.bindView(canvas);
    this.bindCrew(this.root.querySelector<HTMLElement>("#mine-crew")!);
  }

  /** Drag pans; the wheel, a pinch or a double-tap zooms; a tap on a
   * building picks it (its stats shown, its wall open), a tap elsewhere
   * lets it go. */
  private bindView(canvas: HTMLCanvasElement) {
    const r = this.renderer!, pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0, lastTap = 0, press: { x: number; y: number; moved: boolean } | null = null;
    const dpr = () => canvas.width / Math.max(1, canvas.clientWidth);
    const local = (e: { clientX: number; clientY: number }) => {
      const b = canvas.getBoundingClientRect();
      return { x: (e.clientX - b.left) * dpr(), y: (e.clientY - b.top) * dpr() };
    };
    canvas.onpointerdown = (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      press = pointers.size === 1 ? { x: e.clientX, y: e.clientY, moved: false } : null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      } else if (e.timeStamp - lastTap < 300) {
        const p = local(e);
        r.zoomBy(r.zoom >= 7.5 ? 1 / 8 : 2, p.x, p.y);
      }
      lastTap = e.timeStamp;
    };
    canvas.onpointermove = (e) => {
      const before = pointers.get(e.pointerId);
      if (!before) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) {
          const mid = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
          r.zoomBy(d / pinch, mid.x, mid.y);
          pinch = d;
        }
        return;
      }
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) press.moved = true;
      r.pan((e.clientX - before.x) * dpr(), (e.clientY - before.y) * dpr());
      if (Math.abs(e.clientX - before.x) + Math.abs(e.clientY - before.y) > 2) {
        this.unfollow();
        this.select(null);
      }
    };
    const end = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
    };
    canvas.onpointerup = (e) => {
      if (press && !press.moved && pointers.size === 1) {
        const p = local(e), id = r.buildingAt(this.sim, p.x, p.y);
        this.pick(id === r.picked ? null : id);
      }
      press = null;
      end(e);
    };
    canvas.onpointercancel = end;
    canvas.onwheel = (e) => {
      e.preventDefault();
      const p = local(e), lines = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
      r.zoomBy(Math.exp(-e.deltaY * lines * 0.0025), p.x, p.y);
    };
  }

  /** The crew's list: a name pressed and dragged goes to the trade it is
   * dropped on; one tapped is followed (tapped again, let go). A lost
   * miner's name, tapped, is put away. */
  private bindCrew(panel: HTMLElement) {
    let press: { id: number; x: number; y: number; item: HTMLElement } | null = null, ghost: HTMLElement | null = null;
    const boxAt = (x: number, y: number) => (document.elementFromPoint(x, y) as Element | null)?.closest<HTMLElement>(".crew-box") ?? null;
    const mark = (box: HTMLElement | null) => panel.querySelectorAll(".crew-box").forEach((b) => b.classList.toggle("drop", b === box));
    panel.onpointerdown = (e) => {
      const item = (e.target as Element).closest<HTMLElement>(".crew-member");
      if (!item || press) return;
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, item };
      item.setPointerCapture(e.pointerId);
    };
    panel.onpointermove = (e) => {
      if (!press || e.pointerId !== press.id) return;
      if (!ghost && press.item.dataset.id && press.item.dataset.busy === undefined && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
        this.dragging = true;
        ghost = press.item.cloneNode(true) as HTMLElement;
        ghost.classList.add("crew-ghost");
        document.body.append(ghost);
        press.item.classList.add("lifted");
      }
      if (!ghost) return;
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      mark(boxAt(e.clientX, e.clientY));
    };
    const finish = (e: PointerEvent, cancel: boolean) => {
      if (!press || e.pointerId !== press.id) return;
      const item = press.item;
      press = null;
      if (ghost) {
        ghost.remove();
        ghost = null;
        this.dragging = false;
        mark(null);
        const box = cancel ? null : boxAt(e.clientX, e.clientY), m = this.minerOf(item);
        if (box && m && box.dataset.job !== m.job && this.sim.setJob(m, box.dataset.job as Job)) play("knock");
        this.shownCrew = "";
        this.refresh();
        return;
      }
      if (cancel) return;
      if (item.dataset.fallen !== undefined) {
        this.sim.dismiss(item.dataset.fallen);
        this.refresh();
        return;
      }
      const m = this.minerOf(item);
      this.select(m && m !== this.renderer!.target ? m : null);
    };
    panel.onpointerup = (e) => finish(e, false);
    panel.onpointercancel = (e) => finish(e, true);
  }
  /** Looks at building `id`, picked and zoomed in to `zoom` (console helper). */
  look(id: BuildingId, zoom = 4) {
    if (!this.renderer) return;
    const b = this.sim.buildings[id];
    this.renderer.lookAt((b.x0 + b.x1 + 1) / 2, b.floor - 3, zoom);
    this.pick(id);
  }
  /** Picks a building (or none): outlined, its wall open, its stats shown. */
  private pick(id: BuildingId | null) {
    if (!this.renderer) return;
    this.renderer.picked = id;
    this.shownInfo = "";
    this.refreshInfo();
  }
  /** The picked building's stats, redrawn when they change. */
  private refreshInfo() {
    const box = this.root.querySelector<HTMLElement>("#mine-info");
    const id = this.renderer?.picked ?? null;
    if (!box) return;
    if (!id) {
      box.hidden = true;
      return;
    }
    const sim = this.sim, b = sim.buildings[id], inside = sim.miners.filter((m) => m.inside?.b === id);
    const bar = (label: string, n: number, max: number, note = "") =>
      `<div class="info-row"><span>${label}</span><b>${note || `${Math.floor(n)} / ${max}`}</b></div><div class="info-bar"><i style="width:${Math.min(100, (100 * n) / Math.max(1, max)).toFixed(1)}%"></i></div>`;
    const row = (label: string, value: string | number) => `<div class="info-row"><span>${label}</span><b>${value}</b></div>`;
    let title = "", body = "";
    if (id === "shaft") {
      const h = sim.hoist, where = h.state === "idle" ? "waiting at the top" : h.state === "down" ? "going down for a load" : "winding up a load";
      title = "Shaft house";
      body = row("Depth", `${sim.depth} ft`) + row("Levels open", `${sim.shaftLevel + 1} of ${sim.levels.length}`) + row("Hoist", where) + row("Loads waiting below", sim.buckets.length) +
        row("Ore in the yard", metalSum(sim.yard)) + row("Rain kept out", `${Math.round(sim.sealShare * 100)}%`);
    } else if (id === "barracks") {
      const asleep = inside.filter((m) => m.inside!.why === "sleep").length, lounge = inside.filter((m) => m.inside!.why === "lounge").length;
      title = "Barracks";
      body = row("Crew", `${sim.miners.length} of ${sim.crewCap}`) + bar("Bunks taken", asleep, b.spots.sleep?.length ?? 0) + row("Asleep", asleep) + row("In the lounge", lounge) + row("At work", sim.miners.length - asleep - lounge) +
        row("Night shift", `${Math.round(sim.nightShift * 100)}% of the crew`);
    } else if (id === "warehouse") {
      const kit = sim.miners.reduce((n, m) => n + m.kit, 0);
      title = "Warehouse";
      body = bar("Supplies", sim.stock, sim.stockCap) + row("Brought in", `${sim.stockRate} a minute`) + bar("Supplies in the crew's hands", kit, sim.miners.length * KIT) +
        row("Fittings waiting", sim.fittingsWaiting) + row("Fetching supplies", inside.length) + row("Other buildings rise to", `level ${sim.maxLevel("forge")}`);
    } else if (id === "forge") {
      const ore = metalSum(sim.ore), hands = sim.jobs.forge;
      title = "Forge";
      body = bar("Ore in the forge", ore, sim.forgeCap) + METALS.map((k) => row(`${METAL_NAME[k]} ore`, sim.ore[k])).join("") + row("Waiting in the yard", metalSum(sim.yard)) +
        row("Hands at work", `${sim.working("forge")} of ${hands} (room for ${sim.jobCap("forge")})`) + row("Smelting", hands ? `${hands * 10} ore a minute` : "slowly, with nobody here");
    } else {
      const smiths = sim.jobs.smith;
      title = "Smithy";
      const busy = sim.miners.filter((m) => m.job === "smith" && this.host.busySmiths().has(m.name)).length;
      body = METALS.map((k) => row(`${METAL_NAME[k]} bars waiting`, sim.bars[k])).join("") + row("Smiths at work", `${sim.working("smithy")} of ${smiths} (room for ${sim.jobCap("smith")})`) +
        row("On Smithy upgrades", `${busy} of ${smiths}`) + METALS.map((k) => bar(`Toward a ${k} point`, sim.worked[k], BARS_PER_POINT)).join("");
    }
    // The stats and the upgrade are redrawn apart, so a press on the button
    // isn't lost to a count changing under it.
    if (box.dataset.id !== id || box.hidden) {
      box.dataset.id = id;
      box.innerHTML = `<h3></h3><div class="info-stats"></div><div class="info-up"></div><p class="info-hint">Tap the building again, or elsewhere, to close.</p>`;
      this.shownInfo = this.shownUp = "";
      box.hidden = false;
    }
    box.querySelector("h3")!.textContent = title;
    if (body !== this.shownInfo) box.querySelector(".info-stats")!.innerHTML = this.shownInfo = body;
    const up = this.upgradeHtml(id);
    if (up !== this.shownUp) box.querySelector(".info-up")!.innerHTML = this.shownUp = up;
  }
  private shownInfo = "";
  private shownUp = "";

  /** Building `id`'s level, and the button that raises it (or why it
   * can't be raised now, or how its rebuilding goes). */
  private upgradeHtml(id: BuildingId) {
    const sim = this.sim, level = sim.buildingLevels[id], r = sim.rebuilding(id), block = sim.upgradeBlock(id);
    let html = `<div class="info-row"><span>Level</span><b>${level} of ${MAX_LEVEL}</b></div>`;
    if (r) {
      const moving = r.from !== null && r.t < r.total / 2, due = Math.ceil((r.supplies * (r.t + 1)) / r.total);
      html += `<div class="info-row"><span>${moving ? "Taking it down to move it" : "Rebuilding"}</span><b>${Math.floor((100 * r.t) / r.total)}%</b></div><div class="info-bar"><i style="width:${((100 * r.t) / r.total).toFixed(1)}%"></i></div>`;
      if (r.used < due && sim.stock < 1) html += `<p class="info-note">Waiting on supplies from the warehouse</p>`;
      return html;
    }
    if (block === "top") return html + `<p class="info-note">Built as big as it goes</p>`;
    const next = level + 1, gain = levelGain(id, next);
    if (block === "warehouse") return html + `<button class="info-upgrade" disabled>⬆ Level ${next}<small>Raise the warehouse to level ${level} first</small></button>`;
    const cost = sim.upgradeCost(id), afford = this.host.free() || this.host.gold() >= cost;
    return html + `<button class="info-upgrade" data-upgrade="${id}"${afford ? "" : " disabled"} title="${gain}">⬆ Level ${next} · ${cost} gold<small>${gain}</small></button>`;
  }
  /** Raises a building a level, if the player can pay for it. */
  private upgrade(id: BuildingId) {
    const cost = this.sim.upgradeCost(id), free = this.host.free();
    if (!free && this.host.gold() < cost) return;
    if (!this.sim.upgrade(id)) return;
    if (!free) this.host.spendGold(cost);
    play("coin");
    this.shownCrew = "";
    this.refresh();
  }

  private minerOf(item: HTMLElement) {
    return this.sim.miners.find((m) => String(m.id) === item.dataset.id) ?? null;
  }
  /** Follows a miner (or none), and marks its name in the list. */
  private select(m: Miner | null) {
    if (!this.renderer || this.renderer.target === m) return;
    this.renderer.target = m;
    if (m) this.unfollow();
    this.refresh();
  }

  /** Asks before leaving a prospect with ore still to work (a worked-out
   * one is left at once). */
  private askProspect() {
    if (this.sim.workedOut) return this.newProspect();
    const left = Math.round((100 * this.sim.oreLeft) / Math.max(1, this.sim.oreFound));
    const modal = this.host.modal;
    modal.innerHTML = `<small>MINE</small><h2>Leave this prospect?</h2><p>About ${left}% of its ore is still in the ground. The crew, the buildings and the stock at the forge and smithy go with you to fresh ground, and the workings here are left behind.</p>
      <div class="dialog-actions"><button id="prospect-stay">Stay</button><button id="prospect-go" class="danger">Move on</button></div>`;
    modal.showModal();
    modal.querySelector<HTMLButtonElement>("#prospect-stay")!.onclick = () => modal.close();
    modal.querySelector<HTMLButtonElement>("#prospect-go")!.onclick = () => {
      modal.close();
      this.newProspect();
    };
  }
  /** Moves the crew to a new prospect: a fresh world. */
  private newProspect() {
    const target = this.renderer?.target ? this.sim.miners.indexOf(this.renderer.target) : -1;
    this.sim = this.sim.prospectNext(this.host.newSeed(), Date.now());
    const pay = this.sim.collect();
    if (metalSum(pay) > 0) this.host.earn(pay);
    if (this.renderer) {
      this.renderer.target = this.sim.miners[target] ?? null;
      this.renderer.home(this.sim);
    }
    this.shownCrew = "";
    play("unlock");
    this.host.store();
    this.refresh();
  }

  private unfollow() {
    if (!this.renderer?.follow) return;
    this.renderer.follow = false;
    const b = this.root.querySelector<HTMLButtonElement>("#mine-follow");
    b?.setAttribute("aria-pressed", "false");
    b?.classList.remove("selected");
  }

  private hire() {
    const price = this.sim.price, free = this.host.free();
    if (this.sim.miners.length >= this.sim.crewCap || (!free && this.host.gold() < price)) return;
    if (!this.sim.hire()) return;
    if (!free) this.host.spendGold(price);
    play("coin");
    this.refresh();
  }

  /** Updates the hire button and the tally (cheap; called every frame). */
  refresh() {
    if (!this.built) return;
    const sim = this.sim, price = sim.price, full = sim.miners.length >= sim.crewCap;
    const afford = this.host.free() || this.host.gold() >= price;
    const crew = sim.miners.length, sky = sim.sky, lost = sim.lostTotal;
    const hour = sky.daylight > 0.6 ? "☀ Day" : sky.daylight > 0.05 ? (Math.abs(((sim.tick / DAY_TICKS + 0.1) % 1) - 0.5) < 0.25 ? "◐ Dusk" : "◐ Dawn") : "☾ Night";
    const latest = [...sim.news].reverse().find((n) => tell(n) && sim.tick - n.tick < 90 * TICK_HZ);
    const news = latest ? tell(latest) : null;
    const ore = metalSum(sim.ore), bars = metalSum(sim.bars);
    this.refreshCrew();
    this.refreshInfo();
    const left = Math.round((100 * sim.oreLeft) / Math.max(1, sim.oreFound));
    const tally = `${crew}|${sim.crewCap}|${price}|${afford}|${sim.depth}|${ore}|${bars}|${Math.ceil(this.owed / TICK_HZ / 60)}|${hour}|${sky.weather}|${lost}|${news}|${left}|${sim.workedOut}|${sim.prospect}`;
    if (tally === this.shownTally) return;
    this.shownTally = tally;
    const hire = this.root.querySelector<HTMLButtonElement>("#mine-hire")!;
    hire.innerHTML = !full ? `⛏ Hire a miner<small>${price} gold</small>` : crew >= MAX_MINERS ? `Crew full<small>${crew} miners</small>` : `Barracks full<small>upgrade it to hire more</small>`;
    hire.disabled = full || !afford;
    this.root.querySelector("#mine-tally")!.innerHTML =
      `<b>${crew}</b> ${crew === 1 ? "miner" : "miners"} · <b>${sim.depth}</b> ft deep · ${hour}, ${WEATHER_NAME[sky.weather].toLowerCase()}<br>` +
      `<b>${ore}</b> ore waiting at the forge · <b>${bars}</b> ${bars === 1 ? "bar" : "bars"} at the smithy` +
      (news || lost ? `<br><span class="mine-news">${lost ? `${lost} lost${news ? " · " : ""}` : ""}${news ?? ""}</span>` : "");
    this.root.querySelector("#mine-prospect")!.innerHTML = sim.workedOut
      ? `Prospect ${sim.prospect} is <b>worked out</b>: time to move on`
      : `Prospect ${sim.prospect} · <b>${left}%</b> of its ore left`;
    this.root.querySelector("#mine-prospect-new")!.classList.toggle("ready", sim.workedOut);
    const away = this.root.querySelector<HTMLElement>("#mine-away")!;
    const mins = Math.ceil(this.owed / TICK_HZ / 60);
    away.hidden = this.owed < TICK_HZ * 5;
    away.textContent = `The crew worked on while you were away… ${mins} min to catch up`;
  }

  /** The crew's list, rebuilt when the crew, their trades, the lost or the
 * miner followed change (not while a name is held). */
  private refreshCrew() {
    if (this.dragging) return;
    const sim = this.sim, target = this.renderer?.target ?? null;
    const busy = this.host.busySmiths();
    const key = sim.miners.map((m) => `${m.id}:${m.name}:${m.job}:${busy.has(m.name)}`).join(",") + "|" + sim.jobCap("forge") + ":" + sim.jobCap("smith") + "|" + sim.fallen.map((f) => f.name).join(",") + "|" + (target?.id ?? "");
    if (key === this.shownCrew) return;
    this.shownCrew = key;
    for (const job of JOBS) {
      const box = this.root.querySelector<HTMLElement>(`.crew-box[data-job="${job}"]`)!;
      const crew = sim.miners.filter((m) => m.job === job), lost = sim.fallen.filter((f) => f.job === job);
      const cap = sim.jobCap(job);
      box.querySelector("[data-count]")!.textContent = cap === Infinity ? String(crew.length) : `${crew.length} / ${cap}`;
      box.classList.toggle("full", crew.length >= cap);
      box.querySelector("ul")!.innerHTML =
        crew
          .map((m) => {
            const held = job === "smith" && busy.has(m.name);
            return `<li class="crew-member${m === target ? " selected" : ""}${held ? " busy" : ""}" data-id="${m.id}"${held ? ` data-busy title="Working on a Smithy upgrade: stays at the smithy until it's done"` : ""}><i class="job-mark job-${job}"></i><span>${escape(m.name)}</span>${held ? `<i class="busy-mark" aria-hidden="true">⚒</i>` : ""}</li>`;
          })
          .join("") +
        lost.map((f) => `<li class="crew-member fallen" data-fallen="${escape(f.name)}" title="Lost: ${f.cause}. Tap to let them go."><i class="skull" aria-hidden="true">☠</i><s>${escape(f.name)}</s></li>`).join("");
    }
  }

  /** Draws the mine (when the tab shows). */
  frame(time: number) {
    if (!this.renderer) return;
    this.renderer.refWidth = this.root.querySelector<HTMLElement>("#mine-body")?.clientWidth ?? 0;
    this.renderer.draw(this.sim, time, this.host.effects());
    this.refresh();
  }
}
