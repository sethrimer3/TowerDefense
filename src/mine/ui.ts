/** The Mine tab: the mine's view, the crew's tally, hiring miners, and
 * putting them to the three trades (the face, the forge, the smithy). The
 * mine itself runs whatever tab shows (`advance`, from the app's frame
 * loop), and works on while the game is closed: on loading, the time away
 * (up to a cap) is caught up a slice each frame. */
import { play } from "../sound.ts";
import { DAY_TICKS, MAX_MINERS, MineSim, TICK_HZ, type Cause, type MineNews, type MineSave, type Weather } from "./sim.ts";
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
  /** The smithy turned out Gold, iron bars and steel bars. */
  earn(gold: number, ironBar: number, steelBar: number): void;
  /** Ranks of the Mine skills: Coffee and Waterproofing. */
  upgrades(): { coffee: number; waterproof: number };
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
    // Catching up on time away, only the first miner to come to harm dies.
    this.sim.catchingUp = this.owed > TICK_HZ * 5;
    const up = this.host.upgrades();
    this.sim.coffee = up.coffee;
    this.sim.waterproof = up.waterproof;
    let n = 0;
    while (this.owed >= 1) {
      this.sim.step();
      this.owed--;
      if (++n % 32 === 0 && performance.now() - start > budget) break;
    }
    const pay = this.sim.collect();
    if (pay.gold > 0 || pay.ironBar > 0 || pay.steelBar > 0) this.host.earn(pay.gold, pay.ironBar, pay.steelBar);
  }

  /** Runs the mine `minutes` ahead at once (console helper). */
  fastForward(minutes: number) {
    for (let t = 0; t < minutes * 60 * TICK_HZ; t++) this.sim.step();
    const pay = this.sim.collect();
    this.host.earn(pay.gold, pay.ironBar, pay.steelBar);
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
      <div class="mine-jobs" id="mine-jobs">
        <span class="mine-job" title="Miners dig, fit out the workings and bring the ore up"><i class="job-mark job-mine"></i>Mine <b id="job-mine">0</b></span>
        <span class="mine-job" title="Forge hands smelt the ore into bars"><button data-job="forge" data-step="-1" aria-label="One fewer at the forge">−</button><i class="job-mark job-forge"></i>Forge <b id="job-forge">0</b><button data-job="forge" data-step="1" aria-label="One more at the forge">+</button></span>
        <span class="mine-job" title="Smiths work the bars into iron, steel and Gold"><button data-job="smith" data-step="-1" aria-label="One fewer at the smithy">−</button><i class="job-mark job-smith"></i>Smithy <b id="job-smith">0</b><button data-job="smith" data-step="1" aria-label="One more at the smithy">+</button></span>
      </div>
      <div class="mine-view"><canvas id="mine-canvas" aria-label="The mine"></canvas><p id="mine-away" class="mine-away" hidden></p></div>`;
    const canvas = this.root.querySelector<HTMLCanvasElement>("#mine-canvas")!;
    this.renderer = new MineRenderer(canvas);
    this.renderer.resize();
    this.renderer.home(this.sim);
    this.root.querySelector<HTMLButtonElement>("#mine-hire")!.onclick = () => this.hire();
    this.root.querySelectorAll<HTMLButtonElement>("#mine-jobs button").forEach((b) => {
      b.onclick = () => {
        const { forge, smith } = this.sim.jobs, step = Number(b.dataset.step), free = this.sim.miners.length - forge - smith;
        if (step > 0 && free <= 0) return;
        if (b.dataset.job === "forge") this.sim.setJobs(forge + step, smith);
        else this.sim.setJobs(forge, smith + step);
        this.refresh();
      };
    });
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
    const price = this.sim.price, free = this.host.free();
    if (this.sim.miners.length >= MAX_MINERS || (!free && this.host.gold() < price)) return;
    if (!this.sim.hire()) return;
    if (!free) this.host.spendGold(price);
    play("coin");
    this.refresh();
  }

  /** Updates the hire button and the tally (cheap; called every frame). */
  refresh() {
    if (!this.built) return;
    const sim = this.sim, price = sim.price, full = sim.miners.length >= MAX_MINERS;
    const afford = this.host.free() || this.host.gold() >= price;
    const crew = sim.miners.length, sky = sim.sky, lost = sim.lostTotal;
    const hour = sky.daylight > 0.6 ? "☀ Day" : sky.daylight > 0.05 ? (Math.abs(((sim.tick / DAY_TICKS + 0.1) % 1) - 0.5) < 0.25 ? "◐ Dusk" : "◐ Dawn") : "☾ Night";
    const latest = [...sim.news].reverse().find((n) => tell(n) && sim.tick - n.tick < 90 * TICK_HZ);
    const news = latest ? tell(latest) : null;
    const { forge, smith } = sim.jobs, mine = crew - forge - smith;
    const ore = sim.ore.iron + sim.ore.gold, bars = sim.bars.iron + sim.bars.gold;
    const tally = `${crew}|${price}|${afford}|${sim.depth}|${ore}|${bars}|${forge}|${smith}|${Math.ceil(this.owed / TICK_HZ / 60)}|${hour}|${sky.weather}|${lost}|${news}`;
    if (tally === this.shownTally) return;
    this.shownTally = tally;
    const hire = this.root.querySelector<HTMLButtonElement>("#mine-hire")!;
    hire.innerHTML = full ? `Crew full<small>${crew} miners</small>` : `⛏ Hire a miner<small>${price} gold</small>`;
    hire.disabled = full || !afford;
    this.root.querySelector("#mine-tally")!.innerHTML =
      `<b>${crew}</b> ${crew === 1 ? "miner" : "miners"} · <b>${sim.depth}</b> ft deep · ${hour}, ${WEATHER_NAME[sky.weather].toLowerCase()}<br>` +
      `<b>${ore}</b> ore waiting at the forge · <b>${bars}</b> ${bars === 1 ? "bar" : "bars"} at the smithy` +
      (news || lost ? `<br><span class="mine-news">${lost ? `${lost} lost${news ? " · " : ""}` : ""}${news ?? ""}</span>` : "");
    this.root.querySelector("#job-mine")!.textContent = String(mine);
    this.root.querySelector("#job-forge")!.textContent = String(forge);
    this.root.querySelector("#job-smith")!.textContent = String(smith);
    this.root.querySelectorAll<HTMLButtonElement>("#mine-jobs button").forEach((b) => {
      const have = b.dataset.job === "forge" ? forge : smith;
      b.disabled = Number(b.dataset.step) > 0 ? mine <= 0 : have <= 0;
    });
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
