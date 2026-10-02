/** The Library tab: the cathedral's view, and buying bookshelves and
 * librarians for it. The library only moves while its tab shows. */
import { play } from "../sound.ts";
import { MAX_LIBRARIANS, MAX_SHELVES, LibrarySim, librarianPrice, shelfPrice, type LibrarySave } from "./sim.ts";
import { LibraryRenderer } from "./render.ts";

export interface LibraryHost {
  gold(): number;
  free(): boolean;
  spendGold(n: number): void;
  effects(): boolean;
  /** A fresh seed for a new library. */
  newSeed(): number;
  /** Wall-clock time in ms (the day and night follow it). */
  clock(): number;
}

export class LibraryPage {
  sim!: LibrarySim;
  private root: HTMLElement;
  private host: LibraryHost;
  private renderer: LibraryRenderer | null = null;
  private built = false;
  private last = -1;
  private shown = "";

  constructor(root: HTMLElement, host: LibraryHost) {
    this.root = root;
    this.host = host;
  }

  load(saved: LibrarySave | null) {
    this.sim = saved ? new LibrarySim(saved.seed, saved) : new LibrarySim(this.host.newSeed());
  }
  snapshot(): LibrarySave {
    return this.sim.save();
  }

  show() {
    if (!this.built) this.build();
    this.last = -1;
    this.refresh();
  }

  private build() {
    this.built = true;
    this.root.innerHTML = `<div class="mine-head library-head">
        <button id="library-shelf" class="mine-hire"></button>
        <button id="library-hire" class="mine-hire"></button>
        <p id="library-tally" class="mine-tally"></p>
      </div>
      <div class="mine-view library-view"><canvas id="library-canvas" aria-label="The library"></canvas></div>`;
    const canvas = this.root.querySelector<HTMLCanvasElement>("#library-canvas")!;
    this.renderer = new LibraryRenderer(canvas);
    this.root.querySelector<HTMLButtonElement>("#library-shelf")!.onclick = () => this.buy(shelfPrice(this.sim.shelves), () => this.sim.buildShelf());
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
    const key = `${sim.shelves}|${sim.librarians.length}|${free || gold >= sp}|${free || gold >= lp}|${sim.books}`;
    if (key === this.shown) return;
    this.shown = key;
    const shelf = this.root.querySelector<HTMLButtonElement>("#library-shelf")!, hire = this.root.querySelector<HTMLButtonElement>("#library-hire")!;
    shelf.innerHTML = shelvesFull ? `Shelves full<small>${sim.shelves} shelves</small>` : `Bookshelf<small>${sp} gold</small>`;
    shelf.disabled = shelvesFull || !(free || gold >= sp);
    hire.innerHTML = crewFull ? `Librarians full<small>${sim.librarians.length}</small>` : `Librarian<small>${lp} gold</small>`;
    hire.disabled = crewFull || !(free || gold >= lp);
    const n = sim.librarians.length;
    this.root.querySelector("#library-tally")!.innerHTML =
      `<b>${sim.shelves}</b>/${MAX_SHELVES} shelves · <b>${n}</b> ${n === 1 ? "librarian" : "librarians"}<br><b>${sim.books}</b> books in the stacks`;
  }

  /** Steps the librarians and draws the nave (while the tab shows). */
  frame(time: number) {
    if (!this.renderer) return;
    const t = time / 1000, dt = this.last < 0 ? 0 : Math.min(0.1, t - this.last);
    this.last = t;
    this.sim.step(dt);
    this.renderer.draw(this.sim, this.host.clock(), t, this.host.effects());
    this.refresh();
  }
}
