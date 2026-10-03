/** The Library tab: the cathedral's view, and buying bookshelves and
 * librarians for it. The library works whatever tab shows (`advance`, from
 * the app's frame loop) and earns Knowledge on the wall clock. While the game
 * is closed (on loading, the time away up to `MAX_AWAY_MS`, or time added by
 * the dev option, `addAway`) it is reckoned an hour at a time (`idleHours`):
 * each hour it earns at its rate unless it burns down (`idleFireChance`, less
 * with Night watch), after which it is a new, empty library. The librarians
 * themselves only move while the game is open. */
import { play } from "../sound.ts";
import { HOUR_MS, MAX_AWAY_MS } from "../away.ts";
import { random } from "../random.ts";
import { MAX_LIBRARIANS, MAX_SHELVES, LibrarySim, idleFireChance, idleHours, librarianPrice, shelfPrice, type LibrarySave } from "./sim.ts";

import { LibraryRenderer, daylight } from "./render.ts";

/** What became of the library over time away, for the welcome-back screen. */
export interface LibraryAway {
  /** Ms into the time away at which the hour it burnt down in began (null
   * when it stood), and the shelves and librarians lost with it. */
  burntAt: number | null;
  shelves: number;
  librarians: number;
}

export interface LibraryHost {
  gold(): number;
  free(): boolean;
  spendGold(n: number): void;
  effects(): boolean;
  /** A fresh seed for a new library. */
  newSeed(): number;
  /** Wall-clock time in ms (the day and night follow it). */
  clock(): number;
  /** The library earned Knowledge (fractions included). */
  earnKnowledge(n: number): void;
  /** Fireproof Wood's, Fire Training's and Night watch's ranks. */
  upgrades(): { fireproof: number; fireTraining: number; nightWatch: number };
  /** Whether the Library tab shows. */
  showing(): boolean;
}

export class LibraryPage {
  sim!: LibrarySim;
  private root: HTMLElement;
  private host: LibraryHost;
  private renderer: LibraryRenderer | null = null;
  private built = false;
  private shown = "";
  /** Wall-clock ms the library last advanced to, and paid Knowledge up to. */
  private ranTo = 0;
  private paidTo = 0;
  private burning = false;
  /** Knowledge earned over the time away (paid by the next `advance`), and
   * what became of the library, for the welcome-back screen. */
  awayKnowledge = 0;
  private owedKnowledge = 0;
  away: LibraryAway | null = null;

  constructor(root: HTMLElement, host: LibraryHost) {
    this.root = root;
    this.host = host;
  }

  load(saved: LibrarySave | null, now: number) {
    this.sim = saved ? new LibrarySim(saved.seed, saved) : new LibrarySim(this.host.newSeed());
    this.ranTo = this.paidTo = now;
    this.awayKnowledge = this.owedKnowledge = 0;
    this.away = null;
    if (saved?.savedAt) this.idle(Math.min(MAX_AWAY_MS, Math.max(0, now - saved.savedAt)), saved.savedAt);
  }
  snapshot(now: number): LibrarySave {
    return this.sim.save(now);
  }

  /** Reckons `ms` of time away an hour at a time (rolls drawn from the
   * library's seed and `stamp`): Knowledge for the hours it stood, and a new
   * library if it burnt down. An empty library has nothing to burn. */
  private idle(ms: number, stamp: number) {
    const sim = this.sim, chance = sim.shelves > 0 ? idleFireChance(this.host.upgrades().nightWatch) : 0;
    const r = idleHours(ms, sim.rate, chance, random(sim.seed ^ (stamp >>> 0) ^ 0x1d1e));
    this.awayKnowledge += r.knowledge;
    this.owedKnowledge += r.knowledge;
    this.away = { burntAt: r.burntAt, shelves: 0, librarians: 0 };
    if (r.burntAt !== null) {
      this.away.shelves = sim.shelves;
      this.away.librarians = sim.librarians.length;
      this.sim = new LibrarySim(this.host.newSeed());
      this.burning = false;
    }
  }

  /** Runs the library up to wall-clock time `now` (a second at most: time
   * the page was hidden isn't simulated) and pays its Knowledge. */
  advance(now: number) {
    const up = this.host.upgrades();
    this.sim.fireproof = up.fireproof;
    this.sim.fireTraining = up.fireTraining;
    this.sim.night = 1 - daylight(this.host.clock());
    let left = Math.min(1, Math.max(0, now - this.ranTo) / 1000);
    this.ranTo = now;
    while (left > 1e-6) {
      const dt = Math.min(0.1, left);
      this.sim.step(dt);
      left -= dt;
    }
    const gap = Math.min(MAX_AWAY_MS, Math.max(0, now - this.paidTo));
    this.paidTo = now;
    const earned = (this.sim.rate * gap) / HOUR_MS + this.owedKnowledge;
    this.owedKnowledge = 0;
    if (earned > 0) this.host.earnKnowledge(earned);
    if (this.sim.fire.active !== this.burning) {
      this.burning = this.sim.fire.active;
      if (this.burning && this.host.showing()) play("horn");
    }
  }

  /** Dev: adds `ms` of time away, reckoned as if the game had been closed
   * that long. */
  addAway(ms: number) {
    this.awayKnowledge = 0;
    this.idle(ms, this.host.clock());
  }

  show() {
    if (!this.built) this.build();
    this.refresh();
  }

  private build() {
    this.built = true;
    this.root.innerHTML = `<div class="mine-head library-head">
        <button id="library-shelf" class="mine-hire"></button>
        <button id="library-hire" class="mine-hire"></button>
        <p id="library-tally" class="mine-tally"></p>
      </div>
      <div class="mine-view library-view"><canvas id="library-canvas" aria-label="The library"></canvas><p id="library-alert" class="mine-away library-alert" role="status" hidden></p></div>`;
    const canvas = this.root.querySelector<HTMLCanvasElement>("#library-canvas")!;
    this.renderer = new LibraryRenderer(canvas);
    this.root.querySelector<HTMLButtonElement>("#library-shelf")!.onclick = () => this.buy(shelfPrice(this.sim.shelves), () => this.sim.buildShelf());
    // Tapping the notice of what a fire cost puts it away.
    this.root.querySelector<HTMLElement>("#library-alert")!.onclick = () => {
      if (!this.sim.fire.active) this.sim.lost = null;
    };
    this.root.querySelector<HTMLButtonElement>("#library-hire")!.onclick = () => this.buy(librarianPrice(this.sim.hired), () => this.sim.hire());
    this.bindView(canvas);
  }

  /** Drag pans a zoomed view; double-tap, pinch or Ctrl-wheel zooms. */
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
        r.zoomTo(r.zoom >= 3 ? 1 : r.zoom + 1, p.x, p.y);
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
          r.zoomTo(r.zoom + (d > pinch ? 1 : -1), mid.x, mid.y);
          pinch = d;
        }
        return;
      }
      r.pan((e.clientX - before.x) * dpr(), (e.clientY - before.y) * dpr());
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
      if (e.ctrlKey) r.zoomTo(r.zoom + (e.deltaY < 0 ? 1 : -1), p.x, p.y);
      else r.pan(0, -e.deltaY * dpr());
    };
  }

  private buy(price: number, act: () => boolean) {
    const free = this.host.free();
    if (!free && this.host.gold() < price) return;
    if (!act()) return;
    if (!free) this.host.spendGold(price);
    play("coin");
    this.refresh();
  }

  refresh() {
    if (!this.built) return;
    const sim = this.sim, free = this.host.free(), gold = this.host.gold();
    const sp = shelfPrice(sim.shelves), lp = librarianPrice(sim.hired);
    const shelvesFull = sim.shelves >= MAX_SHELVES, crewFull = sim.librarians.length >= MAX_LIBRARIANS;
    const fire = sim.fire.active, lost = sim.lost;
    const home = sim.librarians.filter((l) => l.home).length;
    const key = `${home}|${sim.shelves}|${sim.built}|${sim.librarians.length}|${free || gold >= sp}|${free || gold >= lp}|${sim.books}|${fire}|${lost ? `${lost.shelves},${lost.librarians},${lost.books}` : ""}`;
    if (key === this.shown) return;
    this.shown = key;
    const shelf = this.root.querySelector<HTMLButtonElement>("#library-shelf")!, hire = this.root.querySelector<HTMLButtonElement>("#library-hire")!;
    shelf.innerHTML = shelvesFull ? `Shelves full<small>${sim.shelves} shelves</small>` : `Bookshelf<small>${sp} gold</small>`;
    shelf.disabled = shelvesFull || !(free || gold >= sp);
    hire.innerHTML = crewFull ? `Librarians full<small>${sim.librarians.length}</small>` : `Librarian<small>${lp} gold</small>`;
    hire.disabled = crewFull || !(free || gold >= lp);
    const n = sim.librarians.length, planned = sim.shelves - sim.built;
    this.root.querySelector("#library-tally")!.innerHTML =
      `<b>${sim.built}</b>/${MAX_SHELVES} shelves${planned ? ` (+${planned} to build)` : ""} · <b>${n}</b> ${n === 1 ? "librarian" : "librarians"}${home ? ` (${home} home for the night)` : ""}<br><b>${sim.books}</b> books · <b>${sim.rate}</b> Knowledge an hour`;
    const alert = this.root.querySelector<HTMLElement>("#library-alert")!;
    const plural = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
    if (fire) alert.textContent = "Fire! A candle has caught a table. The librarians are fighting it with buckets from the water butts.";
    else if (lost) {
      const losses = [lost.shelves && plural(lost.shelves, "shelf").replace("shelfs", "shelves"), lost.librarians && plural(lost.librarians, "librarian"), lost.books && plural(lost.books, "book")].filter(Boolean);
      alert.textContent = losses.length
        ? `The fire is out. Lost: ${losses.join(", ")}. What survived is being rebuilt with new planks.`
        : "The fire is out, and nothing was lost.";
    }
    alert.hidden = !fire && !lost;
    alert.classList.toggle("burning", fire);
  }

  /** Draws the nave (while the tab shows). */
  frame(time: number) {
    if (!this.renderer) return;
    this.renderer.draw(this.sim, this.host.clock(), time / 1000, this.host.effects());
    this.refresh();
  }
}
