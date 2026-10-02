/** The Library: a dark cathedral the player fills with bookshelves and
 * librarians. Shelves stand against the back wall in bays, each stacked
 * unit on unit from the floor up to just under the stained-glass window.
 * Librarians put up ladders, climb them and shuffle books from shelf to
 * shelf; some sit at the tables indexing what they fetch.
 *
 * Side view in pixels: x right, y down, the floor's top at `FLOOR`. The
 * simulation only moves people and books; it pays nothing (yet). */
import { random } from "../random.ts";
import { decodeGrid, encodeGrid } from "../mine/world.ts";

export const W = 192;
export const H = 300;
/** The floor's top row (librarians' feet stand on it). */
export const FLOOR = 288;
/** The stained-glass window: a lancet under a pointed head. */
export const WINDOW = { x0: 74, x1: 118, top: 18, bottom: 116 };
/** Shelves stop here, just short of the window's sill. */
export const SHELF_TOP = WINDOW.bottom + 5;
export const BAYS = 10;
export const BAY_W = 16;
export const BAY_X0 = (W - BAYS * BAY_W) / 2;
/** A shelf unit: two rows of books, each over its plank. */
export const UNIT_H = 14;
export const ROW_H = 7;
export const BOOKS_PER_ROW = 7;
export const MAX_UNITS = Math.floor((FLOOR - SHELF_TOP) / UNIT_H);
export const MAX_SHELVES = BAYS * MAX_UNITS;
export const MAX_LIBRARIANS = 16;
export const SLOTS = BAYS * MAX_UNITS * 2 * BOOKS_PER_ROW;
/** Book colours (index 1 up; 0 is an empty slot). */
export const BOOK_COLORS = ["", "#7a2a22", "#2f4d7a", "#2e5a3a", "#7a5a22", "#5a2e6a", "#8a7a5a", "#3a2a1a", "#9a3a2a", "#1f4a4a", "#6a6a72"];
/** The two reading tables at the foot of the nave: left edge and width. */
export const TABLES = [{ x: 38, w: 26 }, { x: 128, w: 26 }];
export const TABLE_TOP = FLOOR - 6;
/** Where an indexer sits: each end of each table. */
const SEATS = TABLES.flatMap((t) => [t.x - 2, t.x + t.w + 1]);

export type Hat = "mortarboard" | "wizard" | "beret" | "hood" | "coif";
export const HATS: Hat[] = ["mortarboard", "wizard", "beret", "hood", "coif"];
export type Action = "idle" | "walk" | "climb" | "build" | "grab" | "place" | "write" | "read";

type Step =
  | { kind: "walk"; x: number }
  | { kind: "climb"; y: number }
  | { kind: "work"; t: number; action: Action; done?: () => void };

export type Librarian = {
  id: number;
  hat: Hat;
  /** Hat colour. */
  tint: string;
  role: "shuffle" | "index";
  x: number;
  /** Feet row. */
  y: number;
  facing: number;
  /** The colour of the book in hand (0 for none). */
  carrying: number;
  action: Action;
  steps: Step[];
  /** An indexer's seat, or -1. */
  seat: number;
  /** A book opened on the table before an indexer (0 for none). */
  reading: number;
};

export type LibrarySave = { seed: number; shelves: number; hired: number; slots: string; ladders: number[] };

export const shelfPrice = (built: number) => Math.round(40 * Math.pow(1.06, built));
export const librarianPrice = (hired: number) => Math.round(100 * Math.pow(1.5, hired));

const WALK = 14, CLIMB = 9, LADDER_BUILD = 1.4;

/** The order shelf units go up in: always on the lowest bay, the most
 * central first, so the stacks rise evenly from the middle out. */
export const SHELF_ORDER: { bay: number; unit: number }[] = (() => {
  const heights = new Array(BAYS).fill(0), out: { bay: number; unit: number }[] = [];
  const centre = (BAYS - 1) / 2;
  for (let n = 0; n < MAX_SHELVES; n++) {
    let best = -1;
    for (let b = 0; b < BAYS; b++) {
      if (heights[b] >= MAX_UNITS) continue;
      if (best < 0 || heights[b] < heights[best] || (heights[b] === heights[best] && Math.abs(b - centre) < Math.abs(best - centre))) best = b;
    }
    out.push({ bay: best, unit: heights[best]++ });
  }
  return out;
})();

export const bayX = (bay: number) => BAY_X0 + bay * BAY_W;
/** Top row of shelf unit `unit` (0 at the floor). */
export const unitTop = (unit: number) => FLOOR - (unit + 1) * UNIT_H;
/** The ladder up bay `bay` stands at its right-hand edge. */
export const ladderX = (bay: number) => bayX(bay) + BAY_W - 3;
export const slotIndex = (bay: number, unit: number, row: number, i: number) => ((bay * MAX_UNITS + unit) * 2 + row) * BOOKS_PER_ROW + i;
export function slotPlace(s: number) {
  const i = s % BOOKS_PER_ROW, r = Math.floor(s / BOOKS_PER_ROW), row = r % 2, u = Math.floor(r / 2);
  return { bay: Math.floor(u / MAX_UNITS), unit: u % MAX_UNITS, row, i };
}
/** The top of a slot's book row. */
const rowTop = (unit: number, row: number) => unitTop(unit) + row * ROW_H;

export class LibrarySim {
  readonly seed: number;
  shelves = 0;
  hired = 0;
  /** Each slot's book colour (0 empty). */
  readonly slots = new Uint8Array(SLOTS);
  /** Ladder height per bay, in shelf units. */
  readonly ladders = new Array<number>(BAYS).fill(0);
  librarians: Librarian[] = [];
  /** When each shelf unit went up (seconds of sim time), for its rise. */
  readonly builtAt = new Map<number, number>();
  time = 0;
  private rng: () => number;
  private reserved = new Set<number>();
  private seats = new Array<number>(SEATS.length).fill(0);

  constructor(seed: number, saved?: LibrarySave) {
    this.seed = seed >>> 0;
    this.rng = random(this.seed ^ 0x51b2a);
    if (!saved) return;
    this.shelves = saved.shelves;
    const slots = decodeGrid(saved.slots, SLOTS, BOOK_COLORS.length);
    if (slots) this.slots.set(slots);
    saved.ladders.forEach((h, b) => (this.ladders[b] = h));
    for (let i = 0; i < saved.hired; i++) this.addLibrarian();
  }

  /** Units standing in bay `bay`. */
  bayHeight(bay: number) {
    let h = 0;
    for (let n = 0; n < this.shelves; n++) if (SHELF_ORDER[n].bay === bay) h++;
    return h;
  }

  /** Puts up the next shelf unit, mostly filled with books. */
  buildShelf() {
    if (this.shelves >= MAX_SHELVES) return false;
    const { bay, unit } = SHELF_ORDER[this.shelves++];
    this.builtAt.set(bay * MAX_UNITS + unit, this.time);
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < BOOKS_PER_ROW; i++)
        if (this.rng() < 0.62) this.slots[slotIndex(bay, unit, row, i)] = 1 + Math.floor(this.rng() * (BOOK_COLORS.length - 1));
    return true;
  }

  /** Hires a librarian, who walks in from the door at the left. */
  hire() {
    if (this.librarians.length >= MAX_LIBRARIANS) return false;
    this.hired++;
    this.addLibrarian();
    return true;
  }
  private addLibrarian() {
    const id = this.librarians.length + 1;
    const r = random(this.seed ^ Math.imul(id, 0x9e3779b9));
    const tints = ["#1a1a22", "#3a2a6a", "#7a2222", "#2a4a3a", "#5a3a1a", "#20304a"];
    this.librarians.push({
      id, hat: HATS[Math.floor(r() * HATS.length)], tint: tints[Math.floor(r() * tints.length)],
      role: id % 3 === 0 ? "index" : "shuffle", x: 4 + r() * 8, y: FLOOR, facing: 1, carrying: 0, action: "idle", steps: [], seat: -1, reading: 0,
    });
  }

  // ── Planning ────────────────────────────────────────────────────────

  private pick(want: (s: number) => boolean) {
    const options: number[] = [];
    for (let n = 0; n < this.shelves; n++) {
      const { bay, unit } = SHELF_ORDER[n];
      for (let row = 0; row < 2; row++)
        for (let i = 0; i < BOOKS_PER_ROW; i++) {
          const s = slotIndex(bay, unit, row, i);
          if (!this.reserved.has(s) && want(s)) options.push(s);
        }
    }
    return options.length ? options[Math.floor(this.rng() * options.length)] : -1;
  }

  /** Steps to reach slot `s` from the floor: walk to its bay's ladder,
   * building the ladder up as far as needed, then climb to the row. */
  private reach(s: number): Step[] {
    const { bay, unit, row } = slotPlace(s), lx = ladderX(bay);
    const feet = Math.min(FLOOR, rowTop(unit, row) + 8);
    const steps: Step[] = [{ kind: "walk", x: lx }];
    if (feet >= FLOOR - 6) return steps;
    for (let h = this.ladders[bay]; h < unit + 1; h++)
      steps.push({ kind: "work", t: LADDER_BUILD, action: "build", done: () => (this.ladders[bay] = Math.max(this.ladders[bay], h + 1)) });
    steps.push({ kind: "climb", y: feet });
    return steps;
  }
  private down(): Step {
    return { kind: "climb", y: FLOOR };
  }

  /** Fetch the book in `from` and put it in `to` (or keep it, for -1). */
  private fetch(l: Librarian, from: number): Step[] {
    return [...this.reach(from), {
      kind: "work", t: 0.8, action: "grab", done: () => {
        l.carrying = this.slots[from];
        this.slots[from] = 0;
        this.reserved.delete(from);
      },
    }, this.down()];
  }
  private shelve(l: Librarian, to: number): Step[] {
    return [...this.reach(to), {
      kind: "work", t: 0.8, action: "place", done: () => {
        if (l.carrying && !this.slots[to]) this.slots[to] = l.carrying;
        l.carrying = 0;
        this.reserved.delete(to);
      },
    }, this.down()];
  }

  private plan(l: Librarian) {
    const r = this.rng;
    // A book still in hand (an indexer done, or a shelf filled meanwhile) goes back first.
    if (l.carrying) {
      const to = this.pick((s) => this.slots[s] === 0);
      if (to >= 0) {
        this.reserved.add(to);
        l.steps = this.shelve(l, to);
        return;
      }
    }
    if (l.role === "index") {
      if (l.seat < 0) {
        const free = this.seats.findIndex((s) => s === 0);
        if (free >= 0) {
          this.seats[free] = l.id;
          l.seat = free;
        } else l.role = "shuffle";
      }
      if (l.seat >= 0) {
        const from = l.carrying ? -1 : this.pick((s) => this.slots[s] > 0);
        const steps: Step[] = [];
        if (from >= 0) {
          this.reserved.add(from);
          steps.push(...this.fetch(l, from));
        }
        steps.push({ kind: "walk", x: SEATS[l.seat] }, {
          kind: "work", t: 14 + r() * 22, action: "write", done: () => (l.reading = 0),
        });
        l.steps = steps;
        return;
      }
    }
    const from = this.pick((s) => this.slots[s] > 0);
    if (from >= 0) {
      this.reserved.add(from);
      const to = this.pick((s) => this.slots[s] === 0 && slotPlace(s).bay !== slotPlace(from).bay);
      if (to >= 0) {
        this.reserved.add(to);
        l.steps = [...this.fetch(l, from), ...this.shelve(l, to)];
        return;
      }
      this.reserved.delete(from);
    }
    // Nothing to shuffle: wander the nave and leaf through a book.
    l.steps = [{ kind: "walk", x: 10 + r() * (W - 20) }, { kind: "work", t: 3 + r() * 5, action: "read" }];
  }

  // ── The step ────────────────────────────────────────────────────────

  /** Advances `dt` seconds. */
  step(dt: number) {
    this.time += dt;
    for (const l of this.librarians) {
      let left = dt;
      while (left > 0) {
        if (!l.steps.length) {
          this.plan(l);
          if (!l.steps.length) break;
        }
        left = this.advance(l, l.steps[0], left);
      }
    }
  }

  /** Spends up to `dt` on a step; returns the time left over. */
  private advance(l: Librarian, s: Step, dt: number) {
    if (s.kind === "walk") {
      l.action = "walk";
      const d = s.x - l.x, go = WALK * dt;
      if (Math.abs(d) <= go) {
        l.x = s.x;
        l.steps.shift();
        return dt - Math.abs(d) / WALK;
      }
      l.facing = Math.sign(d);
      l.x += go * l.facing;
      return 0;
    }
    if (s.kind === "climb") {
      l.action = "climb";
      const d = s.y - l.y, go = CLIMB * dt;
      if (Math.abs(d) <= go) {
        l.y = s.y;
        l.steps.shift();
        return dt - Math.abs(d) / CLIMB;
      }
      l.y += go * Math.sign(d);
      return 0;
    }
    l.action = s.action;
    if (s.action === "write") {
      // Sit facing the table, the fetched book open on it.
      l.facing = l.seat % 2 === 0 ? 1 : -1;
      if (l.carrying) {
        l.reading = l.carrying;
        l.carrying = 0;
      }
    }
    if (s.t > dt) {
      s.t -= dt;
      return 0;
    }
    l.steps.shift();
    if (s.action === "write" && l.reading) {
      // The indexed book goes back to the shelves.
      l.carrying = l.reading;
    }
    s.done?.();
    return dt - s.t;
  }

  save(): LibrarySave {
    // Books in hand or on the tables are put back where there's room.
    const slots = new Uint8Array(this.slots);
    const loose = this.librarians.flatMap((l) => [l.carrying, l.reading]).filter((c) => c > 0);
    for (let n = 0; n < this.shelves && loose.length; n++) {
      const { bay, unit } = SHELF_ORDER[n];
      for (let k = 0; k < 2 * BOOKS_PER_ROW && loose.length; k++) {
        const s = slotIndex(bay, unit, k < BOOKS_PER_ROW ? 0 : 1, k % BOOKS_PER_ROW);
        if (!slots[s]) slots[s] = loose.pop()!;
      }
    }
    return { seed: this.seed, shelves: this.shelves, hired: this.hired, slots: encodeGrid(slots), ladders: [...this.ladders] };
  }

  /** Books on the shelves, in hand and on the tables. */
  get books() {
    let n = 0;
    for (const c of this.slots) if (c) n++;
    for (const l of this.librarians) n += (l.carrying ? 1 : 0) + (l.reading ? 1 : 0);
    return n;
  }
}

const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** A stored library, or null unless it is well formed. */
export function decodeLibrarySave(s: any): LibrarySave | null {
  if (!s || typeof s !== "object") return null;
  if (!int(s.seed, 0, 0xffffffff) || !int(s.shelves, 0, MAX_SHELVES) || !int(s.hired, 0, MAX_LIBRARIANS)) return null;
  if (!decodeGrid(s.slots, SLOTS, BOOK_COLORS.length)) return null;
  if (!Array.isArray(s.ladders) || s.ladders.length !== BAYS || !s.ladders.every((h: unknown) => int(h, 0, MAX_UNITS))) return null;
  return { seed: s.seed, shelves: s.shelves, hired: s.hired, slots: s.slots, ladders: [...s.ladders] };
}
