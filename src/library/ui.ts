/** The Library tab: the cathedral's view (panning down to the alchemy lab
 * under it), buying bookshelves and librarians, and the staff's list (each
 * librarian by name, dragged between the three roles: shelvers, professors,
 * researchers; tapped to follow). The library works whatever tab shows (`advance`, from
 * the app's frame loop). Time away is banked, then spent in ordinary
 * simulation steps at up to 120 times speed. Knowledge, fires, deaths,
 * firefighting and repairs happen as those steps run. */
import { play } from "../sound.ts";
import type { Scene } from "../ambience.ts";
import { countdown, HOUR_MS, IDLE_LEAD, IDLE_SPEED, idleDrain, MAX_AWAY_MS } from "../away.ts";
import { H, LAB_FLOOR, LAB_MAX_LEVEL, MAX_LIBRARIANS, labPrice, MAX_SHELVES, LibrarySim, ROLES, RETURN_BOOKS, librarianPrice, shelfPrice, type Librarian, type LibrarySave, type Role } from "./sim.ts";

import { LibraryRenderer, daylight } from "./render.ts";

/** What became of the library over time away, for the welcome-back screen. */
export interface LibraryAway {
  ms: number;
  owedMs: number;
  catchingUp: boolean;
  knowledge: number;
  librarians: number;
  books: number;
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
  /** Fireproof Wood's, Fire Training's, Night watch's and Enchanted ink's ranks. */
  upgrades(): { fireproof: number; fireTraining: number; nightWatch: number; enchant: number };
  /** Whether the Library tab shows. */
  showing(): boolean;
  /** Climbs down to the Study beneath the library, where Knowledge is spent. */
  descend?(): void;
}

const ROLE: Record<Role, { name: string; one: string; hint: string }> = {
  shelver: { name: "Shelvers", one: "shelver", hint: "Shelvers build shelves and ladders, wheel the carts, shelve and sort the books, and fight fires" },
  professor: { name: "Professors", one: "professor", hint: "Professors read the books, a book once each, for Knowledge: built shelves times professors an hour" },
  researcher: { name: "Researchers", one: "researcher", hint: "Researchers work the alchemy lab below, one a lab level; with none, the Study's Knowledge research can't be bought" },
};
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const plural = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;

export class LibraryPage {
  sim!: LibrarySim;
  private root: HTMLElement;
  private host: LibraryHost;
  private renderer: LibraryRenderer | null = null;
  private built = false;
  private shown = "";
  /** Last frame clock and simulation time still owed. */
  private ranTo = 0;
  private owed = 0;
  private deathsBefore = 0;
  private booksBefore = 0;
  private burning = false;
  private shownStaff = "";
  /** A name being dragged in the staff's list (the list holds still). */
  private dragging = false;
  /** Gains actually made so far while spending the idle-time bank. */
  awayKnowledge = 0;
  away: LibraryAway | null = null;

  constructor(root: HTMLElement, host: LibraryHost) {
    this.root = root;
    this.host = host;
  }

  load(saved: LibrarySave | null, now: number) {
    this.sim = saved ? new LibrarySim(saved.seed, saved) : new LibrarySim(this.host.newSeed());
    this.ranTo = now;
    this.owed = 0;
    this.awayKnowledge = 0;
    this.away = null;
    this.burning = this.sim.fire.active;
    if (saved) this.addAway(Math.min(MAX_AWAY_MS, Math.max(0, now - saved.savedAt) + (saved.idleMs ?? 0)));
  }
  snapshot(now: number): LibrarySave {
    return { ...this.sim.save(now), idleMs: Math.min(MAX_AWAY_MS, this.owed + Math.max(0, now - this.ranTo)) };
  }
  get owedMs() { return this.owed; }

  /** Spend queued time in ordinary simulation steps, within a frame budget.
   * Knowledge is paid for those steps only, at the rate they actually had. */
  advance(now: number, keepWith = 0) {
    const gap = Math.max(0, now - this.ranTo);
    this.ranTo = now;
    this.owed = Math.min(MAX_AWAY_MS, this.owed + gap);
    const up = this.host.upgrades();
    this.sim.fireproof = up.fireproof;
    this.sim.fireTraining = up.fireTraining;
    this.sim.nightWatch = up.nightWatch;
    this.sim.enchant = up.enchant;
    const start = performance.now();
    const limit = Math.max(100, Math.min(1000, gap) * IDLE_SPEED);
    let spent = 0, earned = 0, n = 0;
    // Keep pace with the mine's idle time (`keepWith`), never more than
    // IDLE_LEAD ahead of it, so both spend it together.
    while (this.owed >= 100 - 1e-6 && spent + 100 <= limit + 1e-6 && this.owed - idleDrain(this.owed, 100) >= keepWith - IDLE_LEAD) {
      this.sim.night = 1 - daylight(this.host.clock() - this.owed);
      const rate = this.sim.rate;
      // Catching up, a step spends (and pays for) ten steps of idle time.
      const drain = Math.min(this.owed, idleDrain(this.owed, 100)), boost = drain / 100;
      this.sim.step(0.1);
      this.owed = Math.max(0, this.owed - drain);
      spent += 100;
      // Enchanted books read pay their gift on top.
      const pay = (rate * 100 / HOUR_MS + this.sim.takeBonus()) * boost;
      earned += pay;
      if (this.away?.catchingUp) {
        this.awayKnowledge += pay;
        this.away.knowledge += pay;
      }
      if (++n % 8 === 0 && performance.now() - start > 6) break;
    }
    if (earned > 0) this.host.earnKnowledge(earned);
    if (this.away?.catchingUp) {
      this.away.owedMs = this.owed;
      this.away.librarians = this.sim.deaths - this.deathsBefore;
      this.away.books = this.sim.booksBurnt - this.booksBefore;
      this.away.catchingUp = this.owed >= 100;
    }
    if (this.sim.fire.active !== this.burning) {
      this.burning = this.sim.fire.active;
      if (this.burning && this.host.showing()) play("horn");
    }
  }

  /** Bank time; earnings and hazards happen as it is simulated. */
  addAway(ms: number) {
    this.owed = Math.min(MAX_AWAY_MS, this.owed + Math.max(0, ms));
    this.awayKnowledge = 0;
    this.deathsBefore = this.sim.deaths;
    this.booksBefore = this.sim.booksBurnt;
    this.away = { ms: this.owed, owedMs: this.owed, catchingUp: this.owed >= 100, knowledge: 0, librarians: 0, books: 0 };
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
        <button id="library-lab-up" class="mine-hire" title="Dig the alchemy lab out further: each level makes room for another researcher"></button>
        <p id="library-tally" class="mine-tally"></p>
      </div>
      <div class="mine-tools">
        <button id="library-staff-toggle" class="mine-crew-toggle" aria-pressed="false" aria-controls="library-staff">☰ Staff</button>
        <p id="library-roles" class="mine-prospect"></p>
        <button id="library-lab" class="library-lab" title="Pan down to the alchemy lab, or back up">⤓ Lab</button>
        <button id="library-study" class="chamber-door study-door" title="Climb down beneath the library to the Study, where Knowledge is spent">✦ Study</button>
      </div>
      <div class="mine-body" id="library-body">
        <aside class="mine-crew" id="library-staff" aria-label="The staff" aria-hidden="true">
          ${ROLES.map((r) => `<section class="crew-box" data-role="${r}" title="${ROLE[r].hint}"><h3><i class="job-mark job-${r}"></i>${ROLE[r].name} <b data-count="${r}">0</b></h3><ul></ul></section>`).join("")}
          <p class="crew-hint">Drag a name to another role. Tap one to follow them. Researchers work the lab below the nave: with none, Knowledge research in the Study can't be bought. The lab has room for one researcher a level: expand it for more.</p>
        </aside>
        <div class="mine-view library-view"><canvas id="library-canvas" aria-label="The library"></canvas><p id="library-away" class="mine-away" role="status" hidden></p><p id="library-alert" class="mine-away library-alert" role="status" hidden></p></div>
      </div>`;
    const canvas = this.root.querySelector<HTMLCanvasElement>("#library-canvas")!;
    this.renderer = new LibraryRenderer(canvas);
    this.root.querySelector<HTMLButtonElement>("#library-shelf")!.onclick = () => this.buy(shelfPrice(this.sim.shelves), () => this.sim.buildShelf());
    // Tapping the notice of what a fire cost puts it away.
    this.root.querySelector<HTMLElement>("#library-alert")!.onclick = () => {
      if (!this.sim.fire.active) this.sim.lost = null;
    };
    this.root.querySelector<HTMLButtonElement>("#library-hire")!.onclick = () => this.buy(librarianPrice(this.sim.hired), () => this.sim.hire());
    this.root.querySelector<HTMLButtonElement>("#library-lab-up")!.onclick = () => this.buy(labPrice(this.sim.labLevel), () => this.sim.upgradeLab());
    const toggle = this.root.querySelector<HTMLButtonElement>("#library-staff-toggle")!;
    toggle.onclick = () => {
      const open = toggle.getAttribute("aria-pressed") !== "true";
      toggle.setAttribute("aria-pressed", String(open));
      this.root.querySelector("#library-body")!.classList.toggle("crew-open", open);
      this.root.querySelector("#library-staff")!.setAttribute("aria-hidden", String(!open));
    };
    this.root.querySelector<HTMLButtonElement>("#library-lab")!.onclick = () => {
      const r = this.renderer!;
      r.target = null;
      r.goal = r.inLab ? H / 2 : LAB_FLOOR - 52;
      this.shownStaff = "";
    };
    this.root.querySelector<HTMLButtonElement>("#library-study")!.onclick = () => this.host.descend?.();
    this.bindView(canvas);
    this.bindStaff(this.root.querySelector<HTMLElement>("#library-staff")!);
  }

  /** The staff's list: a name pressed and dragged goes to the role it is
   * dropped on; one tapped is followed (tapped again, let go). */
  private bindStaff(panel: HTMLElement) {
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
      if (!ghost && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
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
      const item = press.item, l = this.librarianOf(item);
      press = null;
      if (ghost) {
        ghost.remove();
        ghost = null;
        this.dragging = false;
        mark(null);
        const box = cancel ? null : boxAt(e.clientX, e.clientY);
        if (box && l && this.sim.setRole(l, box.dataset.role as Role)) play("knock");
        this.shownStaff = this.shown = "";
        this.refresh();
        return;
      }
      if (cancel || !this.renderer) return;
      this.renderer.target = l && l !== this.renderer.target ? l : null;
      this.renderer.goal = null;
      this.refresh();
    };
    panel.onpointerup = (e) => finish(e, false);
    panel.onpointercancel = (e) => finish(e, true);
  }
  private librarianOf(item: HTMLElement): Librarian | null {
    return this.sim.librarians.find((l) => String(l.id) === item.dataset.id) ?? null;
  }

  /** The staff's list, rebuilt when the staff, their roles or the librarian
   * followed change (not while a name is held). */
  private refreshStaff() {
    if (this.dragging) return;
    const sim = this.sim, target = this.renderer?.target ?? null;
    const key = sim.librarians.map((l) => `${l.id}:${l.role}:${l.home}`).join(",") + "|" + (target?.id ?? "") + "|" + sim.researcherCap;
    if (key === this.shownStaff) return;
    this.shownStaff = key;
    for (const role of ROLES) {
      const box = this.root.querySelector<HTMLElement>(`.crew-box[data-role="${role}"]`)!;
      const staff = sim.librarians.filter((l) => l.role === role);
      box.querySelector("[data-count]")!.textContent = role === "researcher" ? `${staff.length}/${sim.researcherCap}` : String(staff.length);
      box.classList.toggle("full", role === "researcher" && staff.length >= sim.researcherCap);
      box.querySelector("ul")!.innerHTML = staff
        .map((l) => `<li class="crew-member${l === target ? " selected" : ""}" data-id="${l.id}"${l.home ? ` title="Home for the night"` : ""}><i class="job-mark job-${role}"></i><span>${escape(l.name)}</span>${l.home ? `<i class="busy-mark" aria-hidden="true">☾</i>` : ""}</li>`)
        .join("");
    }
  }

  /** Drag pans; the wheel, a pinch or a double-tap zooms smoothly about
   * the pointer, as in the Mine. */
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
        r.zoomBy(r.zoom >= 5.5 ? 1 / 8 : 2, p.x, p.y);
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
      const p = local(e), lines = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
      r.zoomBy(Math.exp(-e.deltaY * lines * 0.0025), p.x, p.y);
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
    const idle = this.root.querySelector<HTMLElement>("#library-away")!;
    idle.hidden = this.owed < 5000;
    idle.textContent = `Fast-forwarding · ${countdown(this.owed)} idle time remaining`;
    const sim = this.sim, free = this.host.free(), gold = this.host.gold();
    const sp = shelfPrice(sim.shelves), lp = librarianPrice(sim.hired), level = sim.labLevel, up = labPrice(level), labFull = level >= LAB_MAX_LEVEL;
    const shelvesFull = sim.shelves >= MAX_SHELVES, crewFull = sim.librarians.length >= MAX_LIBRARIANS;
    const fire = sim.fire.active, lost = sim.lost;
    const home = sim.librarians.filter((l) => l.home).length, roles = sim.roles;
    this.refreshStaff();
    const lab = this.root.querySelector<HTMLButtonElement>("#library-lab")!, inLab = this.renderer ? (this.renderer.goal ?? this.renderer.focus.y) > H : false;
    lab.textContent = inLab ? "⤒ Nave" : "⤓ Lab";
    const key = `${home}|${sim.shelves}|${sim.built}|${sim.librarians.length}|${ROLES.map((r) => roles[r]).join(",")}|${free || gold >= sp}|${free || gold >= lp}|${level}|${free || gold >= up}|${sim.fresh}|${sim.returns.length}|${fire}|${lost ? `${lost.shelves},${lost.librarians},${lost.books}` : ""}`;
    if (key === this.shown) return;
    this.shown = key;
    const shelf = this.root.querySelector<HTMLButtonElement>("#library-shelf")!, hire = this.root.querySelector<HTMLButtonElement>("#library-hire")!;
    shelf.innerHTML = shelvesFull ? `Shelves full<small>${sim.shelves} shelves</small>` : `Bookshelf<small>${sp} gold</small>`;
    shelf.disabled = shelvesFull || !(free || gold >= sp);
    hire.innerHTML = crewFull ? `Librarians full<small>${sim.librarians.length}</small>` : `Librarian<small>${lp} gold</small>`;
    hire.disabled = crewFull || !(free || gold >= lp);
    const labUp = this.root.querySelector<HTMLButtonElement>("#library-lab-up")!;
    labUp.innerHTML = labFull ? `Lab complete<small>level ${level}</small>` : `Expand lab ${level + 1}<small>${up} gold</small>`;
    labUp.disabled = labFull || !(free || gold >= up);
    const n = sim.librarians.length, planned = sim.shelves - sim.built;
    // One stat to a cell, each kept to its line, so the numbers changing
    // never reflow the header and shift the view below it.
    this.root.querySelector("#library-tally")!.innerHTML = [
      [`<b>${sim.built}</b>/${MAX_SHELVES} shelves${planned ? ` (+${planned})` : ""}`, planned ? `${planned} more to build` : ""],
      [`<b>${n}</b> ${n === 1 ? "librarian" : "librarians"}${home ? ` (${home} home)` : ""}`, home ? `${home} home for the night` : ""],
      [`<b>${sim.fresh}</b> books to read`, ""],
      [`<b>${sim.returns.length}</b>/${RETURN_BOOKS} read`, "Read books on the return shelf"],
      [`<b>${sim.rate}</b> Knowledge/hr`, "Knowledge an hour"],
    ].map(([html, title]) => `<span${title ? ` title="${title}"` : ""}>${html}</span>`).join("");
    this.root.querySelector("#library-roles")!.innerHTML = ROLES.map((r) => `<b>${roles[r]}</b> ${roles[r] === 1 ? ROLE[r].one : ROLE[r].name.toLowerCase()}`).join(" · ");
    const alert = this.root.querySelector<HTMLElement>("#library-alert")!;
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

  /** What can be heard in the nave: birdsong by day and crickets by night
   * through the stone, and a fire, when one burns, right there. */
  ambience(): Scene {
    const night = this.sim.night;
    return { rain: 0, wind: 0.1, howl: 0, sand: 0, thunder: 0, birds: (1 - night) * 0.7, night, drips: 0, fire: this.sim.fire.active ? 1 : 0, muffle: 0.75 };
  }

  /** Draws the nave (while the tab shows). */
  frame(_time: number) {
    if (!this.renderer) return;
    this.renderer.draw(this.sim, this.host.clock() - this.owed, this.sim.time, this.host.effects());
    this.refresh();
  }
}
