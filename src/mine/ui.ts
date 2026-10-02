/** The Mine tab: the mine's view, the crew's tally, and hiring miners. The
 * mine itself runs whatever tab shows (`advance`, from the app's frame
 * loop), and works on while the game is closed: on loading, the time away
 * (up to a cap) is caught up a slice each frame. */
import { play } from "../sound.ts";
import { MAX_MINERS, MineSim, ORE_PER_IRON_BAR, TICK_HZ, hirePrice, type MineSave } from "./sim.ts";
import { MineRenderer } from "./render.ts";

/** Longest time away the mine catches up on. */
export const MAX_AWAY_MS = 2 * 60 * 60 * 1000;

export interface MineHost {
  /** Gold the player holds, and whether purchases are free (Dev). */
  gold(): number;
  free(): boolean;
  spendGold(n: number): void;
  /** The mine paid out: Gold, and iron bars smelted from its ore. */
  earn(gold: number, ironBar: number): void;
  effects(): boolean;
  /** Fresh seeds for a new mine. */
  newSeed(): number;
}

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
    let n = 0;
    while (this.owed >= 1) {
      this.sim.step();
      this.owed--;
      if (++n % 32 === 0 && performance.now() - start > budget) break;
    }
    const pay = this.sim.collect();
    if (pay.gold > 0 || pay.ironBar > 0) this.host.earn(pay.gold, pay.ironBar);
  }

  /** Runs the mine `minutes` ahead at once (console helper). */
  fastForward(minutes: number) {
    for (let t = 0; t < minutes * 60 * TICK_HZ; t++) this.sim.step();
    const pay = this.sim.collect();
    this.host.earn(pay.gold, pay.ironBar);
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
      <div class="mine-view"><canvas id="mine-canvas" aria-label="The mine"></canvas><p id="mine-away" class="mine-away" hidden></p></div>`;
    const canvas = this.root.querySelector<HTMLCanvasElement>("#mine-canvas")!;
    this.renderer = new MineRenderer(canvas);
    this.renderer.resize();
    this.renderer.home(this.sim);
    this.root.querySelector<HTMLButtonElement>("#mine-hire")!.onclick = () => this.hire();
    const follow = this.root.querySelector<HTMLButtonElement>("#mine-follow")!;
    follow.onclick = () => {
      this.renderer!.follow = !this.renderer!.follow;
      follow.setAttribute("aria-pressed", String(this.renderer!.follow));
      follow.classList.toggle("selected", this.renderer!.follow);
    };
    this.bindView(canvas);
  }

  /** Drag pans; pinch, Ctrl-wheel or double-tap zooms; the wheel scrolls. */
  private bindView(canvas: HTMLCanvasElement) {
    const r = this.renderer!, pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0, lastTap = 0;
    const dpr = () => canvas.width / Math.max(1, canvas.clientWidth);
    const local = (e: { clientX: number; clientY: number }) => {
      const b = canvas.getBoundingClientRect();
      return { x: (e.clientX - b.left) * dpr(), y: (e.clientY - b.top) * dpr() };
    };
    canvas.onpointerdown = (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      } else if (e.timeStamp - lastTap < 300) {
        const p = local(e);
        r.zoomBy(r.zoom >= 4 ? -3 : 1, p.x, p.y);
      }
      lastTap = e.timeStamp;
    };
    canvas.onpointermove = (e) => {
      const before = pointers.get(e.pointerId);
      if (!before) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && Math.abs(d - pinch) > 40) {
          const mid = local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
          r.zoomBy(d > pinch ? 1 : -1, mid.x, mid.y);
          pinch = d;
        }
        return;
      }
      r.pan((e.clientX - before.x) * dpr(), (e.clientY - before.y) * dpr());
      if (Math.abs(e.clientY - before.y) > 2) this.unfollow();
    };
    const end = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
    };
    canvas.onpointerup = end;
    canvas.onpointercancel = end;
    canvas.onwheel = (e) => {
      e.preventDefault();
      const p = local(e);
      if (e.ctrlKey) r.zoomBy(e.deltaY < 0 ? 1 : -1, p.x, p.y);
      else {
        r.pan(0, -e.deltaY * dpr());
        this.unfollow();
      }
    };
  }
  private unfollow() {
    if (!this.renderer?.follow) return;
    this.renderer.follow = false;
    const b = this.root.querySelector<HTMLButtonElement>("#mine-follow");
    b?.setAttribute("aria-pressed", "false");
    b?.classList.remove("selected");
  }

  private hire() {
    const price = hirePrice(this.sim.hired), free = this.host.free();
    if (this.sim.miners.length >= MAX_MINERS || (!free && this.host.gold() < price)) return;
    if (!this.sim.hire()) return;
    if (!free) this.host.spendGold(price);
    play("coin");
    this.refresh();
  }

  /** Updates the hire button and the tally (cheap; called every frame). */
  refresh() {
    if (!this.built) return;
    const sim = this.sim, price = hirePrice(sim.hired), full = sim.miners.length >= MAX_MINERS;
    const afford = this.host.free() || this.host.gold() >= price;
    const crew = sim.miners.length;
    const tally = `${crew}|${price}|${afford}|${sim.depth}|${sim.ironOre}|${sim.mined.iron}|${sim.mined.gold}|${Math.ceil(this.owed / TICK_HZ / 60)}`;
    if (tally === this.shownTally) return;
    this.shownTally = tally;
    const hire = this.root.querySelector<HTMLButtonElement>("#mine-hire")!;
    hire.innerHTML = full ? `Crew full<small>${crew} miners</small>` : `⛏ Hire a miner<small>${price} gold</small>`;
    hire.disabled = full || !afford;
    this.root.querySelector("#mine-tally")!.innerHTML =
      `<b>${crew}</b> ${crew === 1 ? "miner" : "miners"} · <b>${sim.depth}</b> ft deep<br>` +
      `Iron ore <b>${sim.ironOre}</b>/${ORE_PER_IRON_BAR} to the next bar · mined <b>${sim.mined.iron}</b> iron, <b>${sim.mined.gold}</b> gold`;
    const away = this.root.querySelector<HTMLElement>("#mine-away")!;
    const mins = Math.ceil(this.owed / TICK_HZ / 60);
    away.hidden = this.owed < TICK_HZ * 5;
    away.textContent = `The crew worked on while you were away… ${mins} min to catch up`;
  }

  /** Draws the mine (when the tab shows). */
  frame(time: number) {
    if (!this.renderer) return;
    this.renderer.draw(this.sim, time, this.host.effects());
    this.refresh();
  }
}
