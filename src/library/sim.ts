/** The Library: a dark cathedral the player fills with bookshelves and
 * librarians, which earns Knowledge (built shelves × professors an hour).
 *
 * Each librarian has a role the player sets. **Shelvers** keep the stacks:
 * a bookshelf bought is only an outline at first, so they go out down a
 * side hallway for a wheelbarrow of planks, bring it in and build the shelf
 * plank by plank, putting up ladders the same way; new shelves stand empty
 * until one wheels in a cart of new books and the others shelve them, each
 * colour in its own bay. They also fight fires, refill the water butts and
 * sweep up. **Professors** read: each takes a fresh book off the shelves,
 * reads it at a table (or standing, with every seat taken), and puts it on
 * the return shelf, its knowledge used up. When the return shelf fills, a
 * shelver loads its books into the cart and wheels them out, bringing back
 * fresh ones for the gaps, so the stacks are always turning over. With no
 * shelvers the professors shelve too. **Researchers** work in the alchemy
 * lab under the nave (`lab.ts`), down the stair from a trapdoor in the
 * floor; with none, the Study's Knowledge research can't be bought.
 * Every book is carried in hand.
 *
 * Once a minute there is a small chance a table's candle tips over and the
 * table catches (`accidentChance`; Fireproof Wood lowers it). The fire is
 * simulated cell by cell (`fire.ts`) and burns whatever it reaches; anyone
 * caught in it dies. Librarians drop what they are doing: most flee down
 * the hallways, while the brave shelvers (more with Fire Training) fetch
 * buckets from the water butts and throw them on the flames. The lab is
 * safe below. Purchased shelves retain their surviving pixels and books;
 * shelvers carry charred books outside and repair the holes with planks.
 *
 * Side view in pixels (`geometry.ts`). Everything random draws from the
 * library's own seeded stream. */
import { random } from "../random.ts";
import { decodeGrid, encodeGrid } from "../mine/world.ts";
import { Fire, cellAt, decodeFireSave, type FireSave, type Burnable } from "./fire.ts";
import {
  BARROW_SPOTS, BAYS, BAY_W, BAY_X0, BOOKS_PER_ROW, BUTTS, CART_HOME, EXITS, FLOOR, H, LAB, LAB_FLOOR, LAB_MAX_LEVEL, MAX_SHELVES, MAX_UNITS, RETURN, RETURN_BOOKS, RETURN_PER_ROW, ROW_H, SLOTS, STAIR_X,
  TABLES, TABLE_TOP, UNIT_H, W,
} from "./geometry.ts";
import { labErrand, leaveLab, newLab, stepLab } from "./lab.ts";

export * from "./geometry.ts";

export const MAX_LIBRARIANS = 16;
/** Book colours (index 1 up; 0 is an empty slot). */
export const BOOK_COLORS = ["", "#7a2a22", "#2f4d7a", "#2e5a3a", "#7a5a22", "#5a2e6a", "#8a7a5a", "#3a2a1a", "#9a3a2a", "#1f4a4a", "#6a6a72"];
/** Planks in a shelf unit, a table, and a ladder's segment (one unit tall). */
export const PLANKS = 4;
export const TABLE_PLANKS = 3;
/** What the carts hold. */
export const CART_BOOKS = 16;
export const BARROW_PLANKS = 6;
/** Where an indexer sits: each end of each table. */
const SEATS = TABLES.flatMap((t) => [t.x - 2, t.x + t.w + 1]);

export type Hat = "mortarboard" | "wizard" | "beret" | "hood" | "coif";
export const HATS: Hat[] = ["mortarboard", "wizard", "beret", "hood", "coif"];
export type Action =
  | "idle" | "walk" | "climb" | "build" | "grab" | "place" | "study" | "read" | "fill" | "throw" | "cower"
  | "chat" | "gaze" | "doze" | "drink" | "mourn" | "sweep" | "pour"
  // In the lab.
  | "stoke" | "stir" | "distill" | "grind" | "chant" | "observe" | "stumble" | "taste" | "float" | "hiccup" | "scroll" | "confer" | "feed"
  // In the lab's annexes.
  | "tend" | "pull" | "recite" | "cast" | "wind" | "scry";

/** What a librarian is for: keeping the stacks, reading, or the lab. */
export type Role = "shelver" | "professor" | "researcher";
export const ROLES: Role[] = ["shelver", "professor", "researcher"];
/** The hat each role wears. */
export const ROLE_HATS: Record<Role, Hat[]> = { shelver: ["coif", "hood", "beret"], professor: ["mortarboard"], researcher: ["wizard"] };

export type Step =
  | { kind: "walk"; x: number | (() => number) }
  | { kind: "climb"; y: number }
  /** Timed work, facing `face` if given. */
  | { kind: "work"; t: number; action: Action; done?: () => void; face?: number }
  /** Out of sight at the end of a hallway (for `t` seconds, or until
   * `until` holds), then `done`. */
  | { kind: "away"; t: number; until?: () => boolean; done?: () => void };

/** The book cart and the supply wheelbarrow. `here` is false while one is
 * out of the library (or burnt); `by` is the librarian using it (0 none). */
export type Cart = { kind: "cart" | "barrow"; x: number; facing: number; here: boolean; books: number[]; planks: number; by: number };

export type Librarian = {
  id: number;
  /** A name for life (saved with the library). */
  name: string;
  hat: Hat;
  /** Hat colour. */
  tint: string;
  role: Role;
  x: number;
  /** Feet row. */
  y: number;
  facing: number;
  /** The colour of the book in hand (0 for none), and whether it has been
   * read (bound for the return shelf). */
  carrying: number;
  spent: boolean;
  /** Whether the book in hand (or open on the table) is enchanted. */
  rune: boolean;
  /** Original shelf slot of a charred book being carried out, or -1. */
  burntFrom: number;
  /** A plank or a bucket in hand (a book is `carrying`); in the lab, a flask
   * of the elixir `vial`. */
  hand: "" | "plank" | "bucket" | "cup" | "broom" | "flask";
  vial: number;
  /** Soot on a researcher's face after a brew went wrong, fading (1 to 0). */
  soot: number;
  /** Water in the bucket. */
  water: number;
  /** The cart being pushed. */
  pushing: Cart | null;
  /** Out of sight beyond a hallway's end. */
  away: boolean;
  /** What a fire has made of them: at work, fleeing it, or fighting it. */
  mode: "work" | "flee" | "fight";
  /** Seconds spent in the flames' heat; too long and they die. */
  scorched: number;
  action: Action;
  steps: Step[];
  /** A professor's seat at a table, or -1. */
  seat: number;
  /** A book opened on the table before a professor (0 for none). */
  reading: number;
  /** Book slots held for this librarian's errand. */
  held: number[];
  /** The building site a plank is promised to. */
  site: string;
  /** A plank, or a book from the cart, promised but not yet taken. */
  plankClaim: boolean;
  bookClaim: boolean;
  /** Vigour, 1 fresh to 0 spent: work tires, tea and a doze restore it. */
  energy: number;
  /** Gone home for the night. */
  home: boolean;
  /** Who they are talking with (0 nobody). */
  with: number;
};

/** Where a librarian died: drawn as ash for a while. */
export type Remains = { x: number; at: number; mourners: number[] };

export type LibrarySave = {
  seed: number;
  /** Each shelf unit's planks (bay by bay, unit by unit): -1 none, 0 an
   * outline, `PLANKS` built. */
  units: number[];
  tables: number[];
  hired: number;
  slots: string;
  ladders: number[];
  /** Wall-clock ms when saved, for the Knowledge earned while away. */
  savedAt: number;
  idleMs?: number;
  time?: number;
  rngState?: number;
  minute?: number;
  firedAt?: number;
  fire?: FireSave;
  burnables?: { kind: "unit" | "ladder" | "table" | "cart" | "return"; k: number }[];
  damaged?: number[];
  burntSlots?: string;
  /** Which shelved books are enchanted (1) or not (0), as `slots`. */
  enchanted?: string;
  /** Knowledge enchanted books have given, all told. */
  runesRead?: number;
  butts?: number[];
  looseBooks?: number[];
  burntLoose?: { color: number; x: number }[];
  returnPlanks?: number;
  exportedBooks?: number[];
  crewState?: { x: number; y: number; scorched: number; energy: number }[];
  counters?: { booksIn: number; booksOut: number; booksBurnt: number; deaths: number; fires: number };

  /** Each librarian's name and role, in hiring order (absent in saves from
   * before roles: they are named and given roles afresh). */
  crew?: { name: string; role: Role }[];
  /** The books on the return shelf, read and waiting to go out. */
  returns?: number[];
  /** The alchemy lab's level (absent in saves from before it had levels:
   * it gets room for the researchers it has). */
  lab?: number;
};

export const shelfPrice = (built: number) => Math.round(40 * Math.pow(1.06, built));
export const librarianPrice = (hired: number) => Math.round(100 * Math.pow(1.5, hired));
/** Gold to raise the alchemy lab from `level` to the next. */
export const labPrice = (level: number) => 1500 * Math.pow(4, level - 1);
/** The chance a minute that a table catches fire, with Fireproof Wood's ranks. */
/** The chance a minute that one shelved book becomes enchanted, with
 * `ranks` of Enchanted ink: 1 in `ENCHANT_ODDS` a rank. */
export const ENCHANT_ODDS = 10000;
export const enchantChance = (ranks: number) => ranks / ENCHANT_ODDS;
/** Knowledge an enchanted book gives when read: two hours of the library's
 * rate at the time, and never less than 25. */
export const enchantedGift = (rate: number) => Math.max(25, rate * 2);

export const accidentChance = (fireproof: number) => 0.01 * Math.pow(0.9, fireproof);
/** What Fire Training's ranks do: the share of librarians who fight a fire,
 * how fast they move, the water each throws, and each droplet's chance of
 * dousing the flame it lands on. */
export function fireDrill(rank: number) {
  return { fight: Math.min(0.75, 0.25 + 0.1 * rank), speed: 1 + 0.2 * rank, water: 1 + 0.35 * rank, douse: Math.min(0.9, 0.3 + 0.12 * rank) };
}
/** Buckets each water butt holds when full. */
export const BUTT_FULL = 30;
/** The bay each book colour belongs in, when the librarians sort the stacks. */
export const homeBay = (color: number) => (color - 1) % BAYS;
/** How tiring each action is, a second (rest restores). */
const TIRING: Partial<Record<Action, number>> = { walk: 1 / 420, climb: 1 / 200, build: 1 / 160, grab: 1 / 300, place: 1 / 300, fill: 1 / 150, throw: 1 / 120, sweep: 1 / 240, pour: 1 / 200, study: 1 / 800, read: 1 / 900, idle: 1 / 1200,
  stoke: 1 / 200, stir: 1 / 400, distill: 1 / 600, grind: 1 / 300, chant: 1 / 500, observe: 1 / 1200, scroll: 1 / 900, confer: 1 / 1200, feed: 1 / 600,
  tend: 1 / 400, pull: 1 / 150, recite: 1 / 600, cast: 1 / 200, wind: 1 / 300, scry: 1 / 800 };
/** Knowledge an hour: built shelves times professors. */
export const knowledgeRate = (shelves: number, professors: number) => shelves * professors;
/** The role a new hire takes: the first reads, the second shelves, the third
 * goes to the lab (if it has `room` for another researcher), and after that
 * whichever of shelving and reading has fewer (reading on a tie). */
export function roleFor(counts: Record<Role, number>, room = 1): Role {
  if (!counts.professor) return "professor";
  if (!counts.shelver) return "shelver";
  if (!counts.researcher && room > 0) return "researcher";
  return counts.shelver < counts.professor ? "shelver" : "professor";
}

const GIVEN = [
  "Aldous", "Ambrose", "Anselm", "Beatrix", "Bede", "Benedict", "Cecily", "Clement", "Dunstan", "Edith", "Egbert", "Eloise", "Felix", "Gervase",
  "Godric", "Hild", "Hildegard", "Hugh", "Isolde", "Jerome", "Juliana", "Lucian", "Mathilde", "Odo", "Petra", "Quentin", "Roswitha", "Simeon",
  "Theodora", "Ursula", "Wilfrid", "Ysolde",
];
const FAMILY = [
  "Ashgrove", "Bellweather", "Bookbinder", "Candlewick", "Chapter", "Crane", "Ember", "Folio", "Gloss", "Hollow", "Inkwell", "Lamplight",
  "Lectern", "Margin", "Parchment", "Penrose", "Quill", "Quire", "Rubric", "Sage", "Scrivener", "Stacks", "Thimble", "Vellum", "Verso", "Wax",
  "Whitlock", "Wordsworth",
];
/** A name for hire `n` of the library seeded `seed`, unlike any in `taken`. */
export function librarianName(n: number, seed: number, taken: Iterable<string> = []) {
  const used = new Set(taken);
  for (let k = 0; ; k++) {
    const name = `${GIVEN[Math.floor(h01(n * 64 + k, seed ^ 0x6e61) * GIVEN.length)]} ${FAMILY[Math.floor(h01(n * 64 + k, seed ^ 0x6661) * FAMILY.length)]}`;
    if (!used.has(name) || k > 64) return name;
  }
}

const WALK = 14, CLIMB = 9, FIRE_DT = 0.1;
/** Seconds in a flame's heat that kill a librarian. */
const SCORCH = 4;
/** How high above the floor a sweeper can scrub soot off the stone. */
const SCRUB = 30;

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
/** Where a slot's book stands: its left column and bottom row. */
export function slotPixel(s: number) {
  const { bay, unit, row, i } = slotPlace(s);
  return { x: bayX(bay) + 1 + i * 2, y: unitTop(unit) + row * ROW_H + ROW_H - 2 };
}
/** The top of a slot's book row. */
const rowTop = (unit: number, row: number) => unitTop(unit) + row * ROW_H;
const unitKey = (bay: number, unit: number) => bay * MAX_UNITS + unit;
const sideOf = (x: number) => (x < W / 2 ? 0 : 1);
/** A fixed number in [0, 1) for two integers. */
function h01(a: number, b: number) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class LibrarySim {
  readonly seed: number;
  /** Each shelf unit's planks: -1 none, 0 an outline, `PLANKS` built. */
  readonly units = new Array<number>(BAYS * MAX_UNITS).fill(-1);
  /** Each table's planks (`TABLE_PLANKS` whole). */
  readonly tables = TABLES.map(() => TABLE_PLANKS);
  /** Each slot's book colour (0 empty). */
  readonly slots = new Uint8Array(SLOTS);
  readonly burntSlots = new Uint8Array(SLOTS);
  /** Enchanted books on the shelves (1 where the slot's book is). */
  readonly enchanted = new Uint8Array(SLOTS);
  /** Enchanted ink's ranks: each a 1 in `ENCHANT_ODDS` chance a minute
   * that a shelved book takes on runes (the page keeps it current). */
  enchant = 0;
  /** Knowledge an enchanted book gave when read, waiting for the page to
   * pay it (`takeBonus`), and all such Knowledge so far. */
  private bonus = 0;
  runesRead = 0;
  readonly damaged = new Set<number>();
  /** Ladder height per bay, in shelf units. */
  readonly ladders = new Array<number>(BAYS).fill(0);
  librarians: Librarian[] = [];
  readonly bookCart: Cart = { kind: "cart", x: CART_HOME, facing: 1, here: false, books: [], planks: 0, by: 0 };
  readonly barrow: Cart = { kind: "barrow", x: BARROW_SPOTS[1], facing: 1, here: false, books: [], planks: 0, by: 0 };
  readonly fire = new Fire();
  /** Fireproof Wood's and Fire Training's ranks (the page keeps them current). */
  fireproof = 0;
  fireTraining = 0;
  nightWatch = 0;
  private drill() {
    const d = fireDrill(this.fireTraining);
    const watch = 1 + (this.night >= 0.5 ? this.nightWatch * 0.15 : 0);
    return { ...d, speed: d.speed * watch, water: d.water * watch, douse: Math.min(0.95, d.douse * watch) };
  }
  /** When each shelf unit was finished (seconds of sim time), for its rise. */
  readonly builtAt = new Map<number, number>();
  time = 0;
  /** Books wheeled in, wheeled out and burnt, and librarians lost. */
  booksIn = 0;
  booksOut = 0;
  booksBurnt = 0;
  deaths = 0;
  /** Fires so far, and where the dead fell. */
  fires = 0;
  remains: Remains[] = [];
  /** How dark it is outside (0 day, 1 night; the page keeps it current). */
  night = 0;
  /** Buckets in each water butt. */
  readonly butts = [BUTT_FULL, BUTT_FULL];
  /** Books sorted into their colour's bay, and read by the professors. */
  sorted = 0;
  read = 0;
  /** The books on the return shelf (colours), read and waiting to go out. */
  returns: number[] = [];
  burntLoose: { color: number; x: number }[] = [];
  returnPlanks = TABLE_PLANKS;
  /** The alchemy lab's apparatus. */
  readonly lab = newLab();
  private rng: () => number;
  private rngState = 0;
  private reserved = new Set<number>();
  private seats = new Array<number>(SEATS.length).fill(0);
  /** Planks promised to each building site, and taken from the barrow. */
  private pending = new Map<string, number>();
  private claimed = 0;
  /** Books someone is on the way to take from the cart. */
  private cartClaims = 0;
  /** Who is loading the cart with the return shelf's books (0 nobody). */
  private exporting = 0;
  private nextId = 1;
  private minute = 0;
  private fireClock = 0;
  private fighters = new Set<number>();
  /** Who is refilling the butts, and who is sweeping (0 nobody). */
  private refiller = 0;
  private sweeper = 0;

  constructor(seed: number, saved?: LibrarySave) {
    this.seed = seed >>> 0;
    this.rngState = saved?.rngState ?? ((this.seed ^ 0x51b2a) >>> 0);
    const draw = random(this.rngState);
    this.rng = () => {
      this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
      return draw();
    };
    if (!saved) return;
    saved.units.forEach((p, k) => (this.units[k] = p));
    saved.tables.forEach((p, t) => (this.tables[t] = p));
    const slots = decodeGrid(saved.slots, SLOTS, BOOK_COLORS.length);
    if (slots) this.slots.set(slots);
    saved.ladders.forEach((h, b) => (this.ladders[b] = Math.min(h, this.bayComplete(b))));
    const researchers = saved.crew?.filter((c) => c.role === "researcher").length ?? 0;
    this.lab.level = Math.max(1, Math.min(LAB_MAX_LEVEL, saved.lab ?? researchers));
    for (let i = 0; i < saved.hired; i++) {
      const c = saved.crew?.[i];
      // A lab without room for them all sends the rest upstairs.
      const role = c?.role === "researcher" && this.count("researcher") >= this.researcherCap ? undefined : c?.role;
      const l = this.addLibrarian(4 + i * 3, role, c?.name);
      // Researchers start the day in the lab.
      if (l.role === "researcher") {
        l.x = STAIR_X + 8 + ((i * 23) % 140);
        l.y = LAB_FLOOR;
      }
    }
    this.returns = (saved.returns ?? []).slice(0, RETURN_BOOKS);
    this.hires = saved.hired;
    this.returnPlanks = saved.returnPlanks ?? TABLE_PLANKS;
    this.burntLoose = (saved.burntLoose ?? []).map((b) => ({ ...b }));
    if (saved.looseBooks?.length) {
      this.bookCart.here = true;
      this.bookCart.books = [...saved.looseBooks];
    }
    this.time = saved.time ?? 0;
    this.minute = saved.minute ?? this.time % 60;
    for (const k of saved.damaged ?? []) this.damaged.add(k);
    if (saved.burntSlots) this.burntSlots.set(decodeGrid(saved.burntSlots, SLOTS, BOOK_COLORS.length)!);
    if (saved.enchanted) this.enchanted.set(decodeGrid(saved.enchanted, SLOTS, 2)!);
    for (let s = 0; s < SLOTS; s++) if (!this.slots[s]) this.enchanted[s] = 0;
    this.runesRead = saved.runesRead ?? 0;
    if (saved.butts) saved.butts.forEach((v, i) => this.butts[i] = v);
    if (saved.counters) Object.assign(this, saved.counters);
    saved.crewState?.forEach((c, i) => Object.assign(this.librarians[i], c));
    if (saved.fire && saved.burnables) {
      this.burnables = saved.burnables;
      this.fire.restore(saved.fire, this.burnables.length);
      this.firedAt = saved.firedAt ?? this.time;
      this.before = { shelves: this.shelves, librarians: this.librarians.length, books: this.booksBurnt };
      this.chooseFighters();
    }
    // Saves from before charred books fell with their shelves.
    if (saved.fire && saved.burnables) this.dropBurnt();
    // Read books already loaded for export must go outside, not back to
    // the unread shelves, when a save interrupts the cart's trip.
    if (saved.exportedBooks?.length) {
      this.returns.push(...saved.exportedBooks.slice(0, RETURN_BOOKS - this.returns.length));
      const excess = saved.exportedBooks.slice(RETURN_BOOKS - (saved.returns?.length ?? 0));
      if (excess.length) {
        this.bookCart.here = true;
        this.bookCart.books.push(...excess);
        this.exporting = this.librarians.find((l) => this.shelving(l))?.id ?? 0;
      }
    }
  }

  // ── What stands ─────────────────────────────────────────────────────

  /** Units standing in bay `bay` (built, half built or outlined). */
  bayHeight(bay: number) {
    let h = 0;
    while (h < MAX_UNITS && this.units[unitKey(bay, h)] >= 0) h++;
    return h;
  }
  /** Units built whole from the floor up in bay `bay`. */
  bayComplete(bay: number) {
    let h = 0;
    while (h < MAX_UNITS && this.units[unitKey(bay, h)] === PLANKS) h++;
    return h;
  }
  /** Shelf units bought (outlines and half-built ones included). */
  get shelves() {
    return this.units.reduce((n, p) => n + (p >= 0 ? 1 : 0), 0);
  }
  /** Shelf units built whole. */
  get built() {
    return this.units.reduce((n, p) => n + (p === PLANKS ? 1 : 0), 0);
  }
  get hired() {
    return this.librarians.length;
  }
  /** Knowledge an hour, as things stand. */
  get rate() {
    return knowledgeRate(this.built, this.count("professor"));
  }
  /** Librarians in a role. */
  count(role: Role) {
    let n = 0;
    for (const l of this.librarians) if (l.role === role) n++;
    return n;
  }
  /** Researchers the lab has room for: one a level. */
  get researcherCap() {
    return this.lab.level;
  }
  get labLevel() {
    return this.lab.level;
  }
  /** Raises the lab a level (the page charges for it); false at the top. */
  upgradeLab() {
    if (this.lab.level >= LAB_MAX_LEVEL) return false;
    this.lab.level++;
    this.lab.glow = 1;
    return true;
  }
  get roles(): Record<Role, number> {
    return { shelver: this.count("shelver"), professor: this.count("professor"), researcher: this.count("researcher") };
  }
  /** Whether a librarian keeps the stacks: a shelver, or a professor while
   * there are no shelvers. */
  private shelving(l: Librarian) {
    return l.role === "shelver" || (l.role === "professor" && !this.count("shelver"));
  }
  isBuilt(bay: number, unit: number) {
    return this.units[unitKey(bay, unit)] === PLANKS;
  }

  // ── Buying ──────────────────────────────────────────────────────────

  /** Marks out the next shelf unit, for the librarians to build. */
  buildShelf() {
    const next = SHELF_ORDER.find(({ bay, unit }) => this.units[unitKey(bay, unit)] < 0);
    if (!next) return false;
    this.units[unitKey(next.bay, next.unit)] = 0;
    return true;
  }

  /** Hires a librarian (to `role`, or the role `roleFor` picks), who walks
   * in down the left-hand hallway. */
  hire(role?: Role) {
    if (this.librarians.length >= MAX_LIBRARIANS) return false;
    this.addLibrarian(EXITS[0], role === "researcher" && this.count("researcher") >= this.researcherCap ? undefined : role);
    return true;
  }
  private addLibrarian(x: number, role = roleFor(this.roles, this.researcherCap - this.count("researcher")), name?: string) {
    const id = this.nextId++;
    const r = random(this.seed ^ Math.imul(id, 0x9e3779b9));
    const tints = ["#1a1a22", "#3a2a6a", "#7a2222", "#2a4a3a", "#5a3a1a", "#20304a"];
    const l: Librarian = {
      id, name: name ?? librarianName(this.hires++, this.seed, this.librarians.map((o) => o.name)), hat: HATS[0], tint: tints[Math.floor(r() * tints.length)],
      role, x, y: FLOOR, facing: 1, carrying: 0, spent: false, rune: false, burntFrom: -1, hand: "", vial: 0, soot: 0, water: 0, pushing: null, away: false,
      mode: "work", scorched: 0, action: "idle", steps: [], seat: -1, reading: 0, held: [], site: "", plankClaim: false, bookClaim: false,
      energy: 0.6 + r() * 0.4, home: false, with: 0,
    };
    this.dress(l);
    this.librarians.push(l);
    return l;
  }
  /** Hires so far, for new names. */
  private hires = 0;
  /** A hat for the librarian's role, picked by their name. */
  private dress(l: Librarian) {
    const hats = ROLE_HATS[l.role];
    let h = 0;
    for (let i = 0; i < l.name.length; i++) h = (h * 31 + l.name.charCodeAt(i)) >>> 0;
    l.hat = hats[h % hats.length];
  }

  /** Puts a librarian to another role: they drop what they were doing and
   * set about it (a new researcher goes down to the lab, one leaving it comes
   * up). False if they already have it, or the lab has no room. */
  setRole(l: Librarian, role: Role) {
    if (l.role === role || !this.librarians.includes(l)) return false;
    if (role === "researcher" && this.count("researcher") >= this.researcherCap) return false;
    if (!l.away) this.interrupt(l);
    l.role = role;
    this.dress(l);
    // A fire's roles were settled when it started.
    this.fighters.delete(l.id);
    return true;
  }

  /** Builds every outline at once and fills the shelves (console helper and tests). */
  furnish(units: number, fill = 0.62) {
    for (let n = 0; n < units; n++) this.buildShelf();
    for (let k = 0; k < this.units.length; k++) {
      if (this.units[k] < 0) continue;
      if (this.units[k] < PLANKS) {
        this.units[k] = PLANKS;
        const bay = Math.floor(k / MAX_UNITS), unit = k % MAX_UNITS;
        for (let row = 0; row < 2; row++)
          for (let i = 0; i < BOOKS_PER_ROW; i++)
            if (this.rng() < fill) this.slots[slotIndex(bay, unit, row, i)] = this.newBook();
      }
    }
    for (let b = 0; b < BAYS; b++) this.ladders[b] = this.bayComplete(b);
  }
  private newBook() {
    return 1 + Math.floor(this.rng() * (BOOK_COLORS.length - 1));
  }

  // ── Reaching shelves ────────────────────────────────────────────────

  /** Whether a librarian can get at slot `s`: the ground row, or a ladder high enough. */
  private reachable(s: number) {
    const { bay, unit } = slotPlace(s);
    return unit === 0 || this.ladders[bay] >= unit + 1;
  }
  /** Slots on built shelves for which `want` holds, free of other errands. */
  private options(want: (s: number) => boolean) {
    const out: number[] = [];
    for (let bay = 0; bay < BAYS; bay++)
      for (let unit = 0; unit < MAX_UNITS; unit++) {
        const p = this.units[unitKey(bay, unit)];
        if (p < 0) break;
        if (p < PLANKS) continue;
        for (let row = 0; row < 2; row++)
          for (let i = 0; i < BOOKS_PER_ROW; i++) {
            const s = slotIndex(bay, unit, row, i);
            if (!this.reserved.has(s) && !this.burntSlots[s] && this.reachable(s) && want(s)) out.push(s);
          }
      }
    return out;
  }
  private pick(want: (s: number) => boolean) {
    const o = this.options(want);
    return o.length ? o[Math.floor(this.rng() * o.length)] : -1;
  }
  /** An empty slot for a book of `color`: in its colour's bay if there is room. */
  private pickFor(color: number) {
    const home = this.pick((s) => this.slots[s] === 0 && slotPlace(s).bay === homeBay(color));
    return home >= 0 ? home : this.pick((s) => this.slots[s] === 0);
  }
  private hold(l: Librarian, s: number) {
    this.reserved.add(s);
    l.held.push(s);
  }
  private unhold(l: Librarian, s: number) {
    this.reserved.delete(s);
    l.held = l.held.filter((h) => h !== s);
  }
  /** Empty slots on built shelves the librarians can reach. */
  get emptySlots() {
    return this.options((s) => this.slots[s] === 0).length;
  }

  /** Steps to reach slot `s` from the floor: walk to its bay's ladder and climb to the row. */
  private reach(s: number): Step[] {
    const { bay, unit, row } = slotPlace(s), lx = ladderX(bay);
    const feet = Math.min(FLOOR, rowTop(unit, row) + 8);
    const steps: Step[] = [{ kind: "walk", x: lx }];
    if (feet < FLOOR - 6) steps.push({ kind: "climb", y: feet });
    return steps;
  }
  private down(): Step {
    return { kind: "climb", y: FLOOR };
  }
  private fetch(l: Librarian, from: number): Step[] {
    this.hold(l, from);
    return [...this.reach(from), {
      kind: "work", t: 0.8, action: "grab", done: () => {
        l.carrying = this.slots[from];
        l.rune = !!this.enchanted[from];
        this.slots[from] = 0;
        this.enchanted[from] = 0;
        this.unhold(l, from);
      },
    }, this.down()];
  }
  private shelve(l: Librarian, to: number): Step[] {
    this.hold(l, to);
    return [...this.reach(to), {
      kind: "work", t: 0.8, action: "place", done: () => {
        if (l.carrying && !this.slots[to] && !this.burntSlots[to]) {
          this.slots[to] = l.carrying;
          this.enchanted[to] = l.rune ? 1 : 0;
          l.carrying = 0;
          l.rune = false;
        }
        this.unhold(l, to);
      },
    }, this.down()];
  }

  // ── Building ────────────────────────────────────────────────────────

  /** What still wants planks: ladders up to built shelves, shelf units
   * (each on a built one, with a ladder to stand on) and tables. */
  private sites() {
    const out: { key: string; x: number; y: number; want: number }[] = [];
    const room = (key: string, want: number) => want - (this.pending.get(key) ?? 0);
    for (let b = 0; b < BAYS; b++) {
      const done = this.bayComplete(b);
      if (this.ladders[b] < done) {
        const key = `l${b}`, h = this.ladders[b];
        if (room(key, 1) > 0) out.push({ key, x: ladderX(b), y: h ? FLOOR - h * UNIT_H : FLOOR, want: 1 });
        continue;
      }
      const p = done < MAX_UNITS ? this.units[unitKey(b, done)] : -1;
      if (p >= 0 && p < PLANKS && room(`u${b}`, PLANKS - p) > 0) out.push({ key: `u${b}`, x: done ? ladderX(b) : bayX(b) + BAY_W / 2, y: FLOOR - done * UNIT_H, want: PLANKS - p });
    }
    this.tables.forEach((p, t) => {
      if (p < TABLE_PLANKS && room(`t${t}`, TABLE_PLANKS - p) > 0) out.push({ key: `t${t}`, x: TABLES[t].x + TABLES[t].w / 2, y: FLOOR, want: TABLE_PLANKS - p });
    });
    if (this.returnPlanks < TABLE_PLANKS && room("r0", TABLE_PLANKS - this.returnPlanks) > 0) out.push({ key: "r0", x: RETURN.x, y: FLOOR, want: TABLE_PLANKS - this.returnPlanks });
    return out;
  }
  /** Planks still wanted everywhere, less those in the barrow. */
  private planksWanted() {
    let n = 0;
    for (let b = 0; b < BAYS; b++) {
      for (let u = 0; u < MAX_UNITS; u++) {
        const p = this.units[unitKey(b, u)];
        if (p < 0) break;
        n += PLANKS - p + 1;
      }
      n -= this.ladders[b];
    }
    for (const p of this.tables) n += TABLE_PLANKS - p;
    n += TABLE_PLANKS - this.returnPlanks;
    return Math.max(0, n - (this.barrow.here ? this.barrow.planks : 0));
  }
  private applyPlank(key: string) {
    const k = Number(key.slice(1));
    if (key[0] === "l") {
      const h = this.ladders[k];
      this.ladders[k] = Math.min(h + 1, this.bayComplete(k));
      this.clearChar(ladderX(k), unitTop(h), ladderX(k) + 3, unitTop(h) + UNIT_H);
    }
    else if (key[0] === "r") {
      this.returnPlanks = Math.min(TABLE_PLANKS, this.returnPlanks + 1);
      this.fire.repair(RETURN.x, FLOOR - 11, RETURN.x + RETURN.w, FLOOR, 1 / TABLE_PLANKS);
      if (this.returnPlanks === TABLE_PLANKS) this.clearChar(RETURN.x, FLOOR - 11, RETURN.x + RETURN.w, FLOOR);
    }
    else if (key[0] === "t") {
      this.tables[k] = Math.min(TABLE_PLANKS, this.tables[k] + 1);
      this.fire.repair(TABLES[k].x, TABLE_TOP - 3, TABLES[k].x + TABLES[k].w, FLOOR, 1 / TABLE_PLANKS);
    } else {
      const unit = this.bayComplete(k), u = unitKey(k, unit);
      if (unit >= MAX_UNITS || this.units[u] < 0) return;
      this.units[u] = Math.min(PLANKS, this.units[u] + 1);
      if (this.damaged.has(u)) {
        this.fire.repair(bayX(k), unitTop(unit), bayX(k) + BAY_W, unitTop(unit) + UNIT_H, 1 / PLANKS);
      }
      if (this.units[u] === PLANKS) {
        this.damaged.delete(u);
        this.builtAt.set(u, this.time);
        this.clearChar(bayX(k), unitTop(unit), bayX(k) + BAY_W, unitTop(unit) + UNIT_H);
      }
    }
  }
  private clearChar(x0: number, y0: number, x1: number, y1: number) {
    this.fire.repair(x0, y0, x1, y1, 1);
  }

  /** Takes a plank from the barrow to the nearest building site. */
  private buildJob(l: Librarian): Step[] | null {
    const cart = this.barrow;
    if (!cart.here || cart.by || cart.planks - this.claimed <= 0) return null;
    const sites = this.sites();
    if (!sites.length) return null;
    const site = sites.reduce((a, b) => (Math.abs(a.x - cart.x) <= Math.abs(b.x - cart.x) ? a : b));
    this.claimed++;
    l.plankClaim = true;
    this.pending.set(site.key, (this.pending.get(site.key) ?? 0) + 1);
    l.site = site.key;
    const steps: Step[] = [{ kind: "walk", x: cart.x }, {
      kind: "work", t: 0.6, action: "grab", done: () => {
        this.claimed--;
        l.plankClaim = false;
        cart.planks--;
        l.hand = "plank";
      },
    }, { kind: "walk", x: site.x }];
    if (site.y < FLOOR) steps.push({ kind: "climb", y: site.y });
    steps.push({
      kind: "work", t: 1.6, action: "build", done: () => {
        l.hand = "";
        this.releaseSite(l);
        this.applyPlank(site.key);
      },
    }, this.down());
    return steps;
  }
  private releaseSite(l: Librarian) {
    if (!l.site) return;
    const n = (this.pending.get(l.site) ?? 1) - 1;
    if (n > 0) this.pending.set(l.site, n);
    else this.pending.delete(l.site);
    l.site = "";
  }

  // ── Carts ───────────────────────────────────────────────────────────

  /** Pushes `cart` out down the nearest hallway (or walks out for it, if it
   * isn't here), stays out a while, then brings it back to `park` with
   * whatever `fill` put in it. */
  private cartRun(l: Librarian, cart: Cart, fill: () => void, park: () => number): Step[] {
    cart.by = l.id;
    const side = sideOf(cart.here ? cart.x : l.x), exit = EXITS[side];
    const steps: Step[] = [];
    if (cart.here)
      steps.push({ kind: "walk", x: cart.x + (side ? -6 : 6) }, { kind: "work", t: 0.4, action: "grab", done: () => (l.pushing = cart) });
    steps.push({ kind: "walk", x: exit }, {
      kind: "away", t: 5 + this.rng() * 4, done: () => {
        fill();
        cart.here = true;
        l.pushing = cart;
        l.facing = side ? -1 : 1;
        cart.x = exit + 6 * l.facing;
      },
    }, { kind: "walk", x: () => park() - 6 * (park() > l.x ? 1 : -1) }, {
      kind: "work", t: 0.4, action: "place", done: () => {
        l.pushing = null;
        cart.by = 0;
      },
    });
    return steps;
  }
  /** The barrow's spot nearest the next building site. */
  private barrowSpot() {
    const site = this.sites()[0], x = site ? site.x : W / 2;
    return BARROW_SPOTS.reduce((a, b) => (Math.abs(a - x) <= Math.abs(b - x) ? a : b));
  }

  private cartJob(l: Librarian): Step[] | null {
    const barrow = this.barrow, cart = this.bookCart;
    // Supplies: a barrow of planks whenever building wants more than it holds.
    if (!barrow.by) {
      const wanted = this.planksWanted();
      if (wanted > 0 && (!barrow.here || barrow.planks <= this.claimed))
        return this.cartRun(l, barrow, () => (barrow.planks = Math.min(BARROW_PLANKS, wanted)), () => this.barrowSpot());
      if (!wanted && barrow.here && barrow.planks === 0) {
        // Nothing to build: the empty barrow goes back out.
        const steps = this.cartRun(l, barrow, () => {}, () => 0);
        const away = steps.findIndex((s) => s.kind === "away");
        (steps[away] as { done?: () => void }).done = () => (barrow.by = 0);
        return steps.slice(0, away + 1);
      }
    }
    if (cart.by) return null;
    const empty = this.emptySlots, returns = this.returns.length;
    // The books read go out for new ones: once the return shelf is getting
    // full, or whenever the cart goes for new books anyway.
    const due = returns >= RETURN_BOOKS - 4 || (returns > 0 && empty >= 6);
    if (due && cart.here && cart.books.length === 0 && !this.cartClaims) {
      this.exporting = l.id;
      cart.by = l.id;
      return this.exportJob(l);
    }
    // New books for empty shelves (or the empty cart in, for the return shelf).
    if ((empty >= 6 || due) && (!cart.here || (cart.books.length === 0 && !this.cartClaims)))
      return this.cartRun(l, cart, () => this.restock(), () => CART_HOME);
    return null;
  }
  /** The cart comes back with the books it took out left behind, and full of
   * new books for the empty slots. */
  private restock() {
    const cart = this.bookCart;
    this.booksOut += cart.books.length;
    const n = Math.min(CART_BOOKS, this.emptySlots);
    cart.books = Array.from({ length: n }, () => this.newBook());
    this.booksIn += n;
  }
  /** One more book off the return shelf into the cart, or, loaded, out with
   * it for new ones. */
  private exportJob(l: Librarian): Step[] {
    const cart = this.bookCart;
    if (this.returns.length && cart.books.length < CART_BOOKS)
      return [{ kind: "walk", x: RETURN.x + RETURN.w / 2 }, {
        kind: "work", t: 0.5, action: "grab", done: () => {
          l.carrying = this.returns.pop() ?? 0;
          l.rune = false;
          l.spent = true;
        },
      }, { kind: "walk", x: cart.x + (RETURN.x < cart.x ? -5 : 5) }, {
        kind: "work", t: 0.5, action: "place", done: () => {
          if (l.carrying) cart.books.push(l.carrying);
          l.carrying = 0;
          l.spent = false;
        },
      }];
    this.exporting = 0;
    return this.cartRun(l, cart, () => this.restock(), () => CART_HOME);
  }

  // ── Planning ────────────────────────────────────────────────────────

  private plan(l: Librarian) {
    const r = this.rng, cart = this.bookCart, inLab = l.y > H;
    if (this.fire.active && !inLab) {
      if (l.mode === "work" && this.time - this.firedAt < this.noticeDelay(l)) {
        l.steps = [{ kind: "work", t: 0.1, action: "idle" }];
        return;
      }
      return this.planFire(l);
    }
    l.mode = "work";
    if (inLab) {
      // Researchers work the lab; anyone else goes back up the stair.
      if (l.role === "researcher") l.steps = labErrand(l, this.lab, r, this.night, () => this.time);
      else {
        l.hand = "";
        l.steps = [{ kind: "walk", x: STAIR_X }, { kind: "climb", y: FLOOR }];
      }
      return;
    }
    // A book in hand: a read one to the return shelf (or into the cart, if
    // loading it), any other back on a shelf.
    if (l.burntFrom >= 0) {
      l.steps = this.removeBurnt(l);
      return;
    }
    if (l.carrying) {
      if (this.exporting === l.id) {
        l.steps = [{ kind: "walk", x: cart.x }, { kind: "work", t: 0.5, action: "place", done: () => (cart.books.push(l.carrying), (l.carrying = 0), (l.spent = false)) }];
        return;
      }
      if (l.spent) {
        l.steps = this.returnJob(l);
        return;
      }
      const to = this.pickFor(l.carrying);
      if (to >= 0) {
        l.steps = this.shelve(l, to);
        return;
      }
      if (cart.here && !cart.by && cart.books.length < CART_BOOKS) {
        l.steps = [{ kind: "walk", x: cart.x }, { kind: "work", t: 0.5, action: "place", done: () => (cart.books.push(l.carrying), (l.carrying = 0)) }];
        return;
      }
      l.steps = [{ kind: "walk", x: 24 + r() * (W - 48) }, { kind: "work", t: 3 + r() * 4, action: "idle" }];
      return;
    }
    if (l.hand === "plank" || l.hand === "flask") l.hand = "";
    if (l.role === "researcher") {
      // Down the stair to the lab.
      l.steps = [{ kind: "walk", x: STAIR_X }, { kind: "climb", y: LAB_FLOOR }];
      return;
    }
    if (this.exporting === l.id) {
      l.steps = this.exportJob(l);
      return;
    }
    const shelving = this.shelving(l);
    const routine = this.goHome(l) ?? this.rest(l) ?? this.mourn(l) ?? (shelving ? (this.refill(l) ?? this.sweep(l)) : null);
    if (routine) {
      l.steps = routine;
      return;
    }
    // Now and then a moment's pause: a word with a passing colleague, or a
    // look up at the window.
    if (r() < 0.12) {
      const pause = this.chat(l) ?? (this.night < 0.5 && r() < 0.5 ? this.gaze(l) : null);
      if (pause) {
        l.steps = pause;
        return;
      }
    }
    // Building comes first, then fetching planks and books, then carrying
    // charred books out: after a big fire there can be hundreds, one a trip,
    // and the shelves mustn't wait on them all.
    const job = (shelving ? (this.buildJob(l) ?? this.cartJob(l) ?? this.burntJob(l) ?? this.unloadCart(l)) : null) ?? (l.role === "professor" ? this.readJob(l) : null);
    if (job) {
      l.steps = job;
      return;
    }
    if (shelving) {
      // Sort the stacks: a book out of its colour's bay goes home.
      const sort = r() < 0.6 ? this.sortJob(l) : null;
      if (sort) {
        l.steps = sort;
        return;
      }
      // Or tidy a book along into another bay with room.
      const from = r() < 0.3 ? this.pick((s) => this.slots[s] > 0) : -1;
      if (from >= 0) {
        const fromBay = slotPlace(from).bay, to = this.pick((s) => this.slots[s] === 0 && slotPlace(s).bay !== fromBay);
        if (to >= 0) {
          l.steps = [...this.fetch(l, from), ...this.shelve(l, to)];
          return;
        }
      }
    }
    // Nothing to do: talk with someone at a loose end, gaze up at the
    // window while it is light, or wander the nave.
    l.steps = this.chat(l) ?? (this.night < 0.5 && r() < 0.35 ? this.gaze(l)
      : [{ kind: "walk", x: 10 + r() * (W - 20) }, { kind: "work", t: 3 + r() * 5, action: "idle" }]);
  }

  /** Remove individual charred books before stocking their gaps. */
  private burntJob(l: Librarian): Step[] | null {
    for (let from = 0; from < SLOTS; from++) {
      const { bay, unit } = slotPlace(from);
      if (!this.burntSlots[from] || this.reserved.has(from) || (unit > 0 && this.ladders[bay] < unit + 1)) continue;
      this.hold(l, from);
      return [...this.reach(from), { kind: "work", t: 0.8, action: "grab", done: () => {
        l.carrying = this.burntSlots[from];
        this.burntSlots[from] = 0;
        l.burntFrom = l.carrying ? from : -1;
        l.spent = false;
        this.unhold(l, from);
      } }, this.down(), ...this.removeBurnt(l)];
    }
    if (this.burntLoose.length) {
      const debris = this.burntLoose[0];
      return [{ kind: "walk", x: debris.x }, { kind: "work", t: 0.8, action: "grab", done: () => {
        const index = this.burntLoose.indexOf(debris);
        if (index < 0) return;
        this.burntLoose.splice(index, 1);
        l.carrying = debris.color; l.burntFrom = SLOTS;
      } }, ...this.removeBurnt(l)];
    }
    return null;
  }
  private removeBurnt(l: Librarian): Step[] {
    const side = sideOf(l.x);
    return [{ kind: "walk", x: EXITS[side] }, { kind: "away", t: 2, done: () => {
      l.carrying = 0; l.burntFrom = -1;
    } }, { kind: "walk", x: side ? W - 8 : 8 }];
  }

  /** Takes a book from the cart, to shelve it. */
  private unloadCart(l: Librarian): Step[] | null {
    const cart = this.bookCart;
    if (!cart.here || cart.by || cart.books.length <= this.cartClaims || this.options((s) => this.slots[s] === 0).length <= this.cartClaims) return null;
    this.cartClaims++;
    l.bookClaim = true;
    return [{ kind: "walk", x: cart.x + (l.x < cart.x ? -4 : 4) }, {
      kind: "work", t: 0.6, action: "grab", done: () => {
        this.cartClaims--;
        l.bookClaim = false;
        l.carrying = cart.books.pop() ?? 0;
        l.rune = false;
        l.spent = false;
      },
    }];
  }

  /** A professor takes a fresh book off the shelves and reads it: at a
   * table, or standing with every seat taken. Its knowledge used up, it is
   * bound for the return shelf. */
  private readJob(l: Librarian): Step[] | null {
    const from = this.pick((s) => this.slots[s] > 0);
    if (from < 0) return null;
    const r = this.rng, finish = () => {
      if (!l.carrying) return;
      l.spent = true;
      this.read++;
      if (l.rune) {
        // An enchanted book's runes give up their knowledge at once.
        const gift = enchantedGift(this.rate);
        this.bonus += gift;
        this.runesRead += gift;
        l.rune = false;
      }
    };
    const seat = this.seats.findIndex((id, k) => id === 0 && this.tables[k >> 1] === TABLE_PLANKS);
    if (seat < 0) return [...this.fetch(l, from), { kind: "walk", x: 20 + r() * (W - 40) }, { kind: "work", t: 18 + r() * 14, action: "read", done: finish }];
    this.seats[seat] = l.id;
    l.seat = seat;
    return [...this.fetch(l, from), { kind: "walk", x: SEATS[seat] }, {
      kind: "work", t: 22 + r() * 22, action: "study", done: () => {
        finish();
        if (this.seats[seat] === l.id) this.seats[seat] = 0;
        l.seat = -1;
      },
    }];
  }
  /** A read book onto the return shelf (or, with it full, a wait by it). */
  private returnJob(l: Librarian): Step[] {
    const x = l.x < RETURN.x + RETURN.w / 2 ? RETURN.x - 2 : RETURN.x + RETURN.w + 1;
    if (this.returnPlanks < TABLE_PLANKS || this.returns.length >= RETURN_BOOKS) return [{ kind: "walk", x }, { kind: "work", t: 2 + this.rng() * 2, action: "idle" }];
    return [{ kind: "walk", x }, {
      kind: "work", t: 0.7, action: "place", face: x < RETURN.x ? 1 : -1, done: () => {
        if (!l.carrying || this.returnPlanks < TABLE_PLANKS || this.returns.length >= RETURN_BOOKS) return;
        this.returns.push(l.carrying);
        l.carrying = 0;
        l.spent = false;
      },
    }];
  }
  private gaze(l: Librarian): Step[] {
    const x = W / 2 - 12 + this.rng() * 24;
    return [{ kind: "walk", x }, { kind: "work", t: 5 + this.rng() * 5, action: "gaze", face: x < W / 2 ? 1 : -1 }];
  }

  // ── Routines ────────────────────────────────────────────────────────

  /** By night about half the shelvers and professors go home down a hallway
   * (never the last one or two), and come back in the morning. Researchers
   * work on by candlelight. */
  private goHome(l: Librarian): Step[] | null {
    if (this.night < 0.6 || h01(l.id, 99) >= 0.5) return null;
    const staff = this.librarians.filter((o) => o.role !== "researcher");
    const staying = staff.filter((o) => !o.home).length;
    if (staying <= Math.max(1, Math.ceil(staff.length / 2))) return null;
    l.home = true;
    return [{ kind: "walk", x: EXITS[sideOf(l.x)] }, {
      kind: "away", t: 0, until: () => this.night < 0.4, done: () => {
        l.home = false;
        l.energy = 1;
      },
    }];
  }

  /** Tired: a doze in a free seat at night, else out for a cup of tea,
   * brought back and drunk in the nave. */
  private rest(l: Librarian): Step[] | null {
    if (l.energy >= 0.25) return null;
    const r = this.rng;
    if (this.night >= 0.5) {
      const seat = this.seats.findIndex((id, k) => id === 0 && this.tables[Math.floor(k / 2)] === TABLE_PLANKS);
      if (seat >= 0) {
        this.seats[seat] = l.id;
        return [{ kind: "walk", x: SEATS[seat] }, {
          kind: "work", t: 20 + r() * 20, action: "doze", face: seat % 2 ? -1 : 1, done: () => {
            l.energy = 1;
            if (this.seats[seat] === l.id && l.seat !== seat) this.seats[seat] = 0;
          },
        }];
      }
    }
    return [{ kind: "walk", x: EXITS[sideOf(l.x)] }, { kind: "away", t: 8 + r() * 8, done: () => (l.hand = "cup") },
      { kind: "walk", x: 20 + r() * (W - 40) }, {
        kind: "work", t: 6 + r() * 4, action: "drink", done: () => {
          l.hand = "";
          l.energy = 1;
        },
      }];
  }

  /** After a death, each librarian stands a while at the ashes. */
  private mourn(l: Librarian): Step[] | null {
    const r = this.remains.find((m) => !m.mourners.includes(l.id) && this.time - m.at < 150);
    if (!r) return null;
    r.mourners.push(l.id);
    const spot = r.x + (l.x < r.x ? -3 : 3) - 2 + this.rng() * 4;
    return [{ kind: "walk", x: Math.max(4, Math.min(W - 4, spot)) }, { kind: "work", t: 4 + this.rng() * 3, action: "mourn", face: spot < r.x ? 1 : -1 }];
  }

  /** Buckets used on a fire are refilled, two at a trip from outside. */
  private refill(l: Librarian): Step[] | null {
    const side = this.butts.findIndex((b) => b < BUTT_FULL);
    if (side < 0 || (this.refiller && this.refiller !== l.id)) return null;
    this.refiller = l.id;
    return [{ kind: "walk", x: EXITS[side] }, { kind: "away", t: 5 + this.rng() * 3, done: () => (l.hand = "bucket") },
      { kind: "walk", x: BUTTS[side] + (side ? -2 : 2) }, {
        kind: "work", t: 1.5, action: "pour", face: side ? 1 : -1, done: () => {
          this.butts[side] = Math.min(BUTT_FULL, this.butts[side] + 2);
          l.hand = "";
          this.refiller = 0;
        },
      }];
  }

  /** One librarian sweeps up the ashes of the dead once they are mourned,
   * then scrubs the soot off the stone low enough to reach. */
  private sweep(l: Librarian): Step[] | null {
    if (this.sweeper && this.sweeper !== l.id) return null;
    const staff = this.librarians.filter((o) => o.role !== "researcher").length;
    const ash = this.remains.find((m) => m.mourners.length >= staff || this.time - m.at >= 150);
    let x = ash?.x ?? -1;
    if (!ash) {
      const soot = this.fire.soot;
      let best = 0.15;
      for (let cx = 0; cx < W / 2; cx++)
        for (let cy = Math.floor((FLOOR - SCRUB) / 2); cy < FLOOR / 2; cy++)
          if (soot[cy * (W / 2) + cx] > best) {
            best = soot[cy * (W / 2) + cx];
            x = cx * 2 + 1;
          }
    }
    if (x < 0) return null;
    this.sweeper = l.id;
    return [{ kind: "walk", x: Math.max(4, Math.min(W - 4, x - 3)) }, { kind: "work", t: 0.4, action: "grab", done: () => (l.hand = "broom") }, {
      kind: "work", t: 5 + this.rng() * 3, action: "sweep", face: 1, done: () => {
        if (ash) this.remains = this.remains.filter((m) => m !== ash);
        else this.fire.scrub(x - 10, x + 10, FLOOR - SCRUB, FLOOR);
        l.hand = "";
        this.sweeper = 0;
      },
    }];
  }

  /** Carries a book from a bay of another colour to its own colour's bay. */
  private sortJob(l: Librarian): Step[] | null {
    const empty = new Map<number, number[]>();
    for (const s of this.options((s) => this.slots[s] === 0)) {
      const bay = slotPlace(s).bay;
      if (!empty.has(bay)) empty.set(bay, []);
      empty.get(bay)!.push(s);
    }
    const from = this.pick((s) => this.slots[s] > 0 && slotPlace(s).bay !== homeBay(this.slots[s]) && empty.has(homeBay(this.slots[s])));
    if (from < 0) return null;
    const room = empty.get(homeBay(this.slots[from]))!, to = room[Math.floor(this.rng() * room.length)];
    const steps = [...this.fetch(l, from), ...this.shelve(l, to)];
    const place = steps[steps.length - 2] as { done?: () => void }, put = place.done;
    place.done = () => {
      const had = l.carrying;
      put?.();
      if (had && !l.carrying) this.sorted++;
    };
    return steps;
  }

  /** Two librarians stop and talk: one at a loose end, or walking the
   * floor empty-handed (who then goes on where they were going). */
  private chat(l: Librarian): Step[] | null {
    if (this.rng() >= 0.45) return null;
    const p = this.librarians.find((o) => o !== l && !o.away && o.mode === "work" && o.y === FLOOR && o.x > 4 && o.x < W - 4 && !o.with
      && !o.pushing && !o.hand && o.steps.length > 0 && Math.abs(o.x - l.x) < 70
      && (o.steps[0].kind === "walk" || (o.steps[0].kind === "work" && o.steps[0].action === "idle")));
    if (!p) return null;
    const t = 5 + this.rng() * 6, meet = p.x + (l.x < p.x ? -4 : 4);
    l.with = p.id;
    p.with = l.id;
    // Whoever finishes first ends the talk for both.
    const end = () => {
      for (const q of [l, p]) {
        q.with = 0;
        const next = q.steps[0];
        if (next?.kind === "work" && next.action === "chat") q.steps.shift();
      }
    };
    const talk: Step = { kind: "work", t: t + Math.abs(meet - l.x) / WALK, action: "chat", face: meet < p.x ? -1 : 1, done: end };
    if (p.steps[0].kind === "walk") p.steps.unshift(talk);
    else p.steps = [talk];
    return [{ kind: "walk", x: meet }, { kind: "work", t, action: "chat", face: meet < p.x ? 1 : -1, done: end }];
  }

  // ── Fire ────────────────────────────────────────────────────────────

  /** Sets table `t` alight (an accident; or the console's, or a test's). */
  ignite(t = Math.floor(this.rng() * TABLES.length)) {
    if (this.fire.active) return false;
    const objects: Burnable[] = [];
    const kinds: { kind: "unit" | "ladder" | "table" | "cart" | "return"; k: number }[] = [];
    const add = (kind: (typeof kinds)[number]["kind"], k: number, o: Burnable) => {
      kinds.push({ kind, k });
      objects.push(o);
    };
    this.units.forEach((p, u) => {
      if (p <= 0) return;
      const bay = Math.floor(u / MAX_UNITS), unit = u % MAX_UNITS;
      add("unit", u, { x0: bayX(bay), y0: unitTop(unit), x1: bayX(bay) + BAY_W, y1: unitTop(unit) + UNIT_H, fuel: 0.4 + (0.6 * p) / PLANKS });
    });
    for (let b = 0; b < BAYS; b++)
      for (let h = 0; h < this.ladders[b]; h++) add("ladder", b * MAX_UNITS + h, { x0: ladderX(b), y0: unitTop(h), x1: ladderX(b) + 3, y1: unitTop(h) + UNIT_H, fuel: 0.7 });
    this.tables.forEach((p, k) => {
      if (p > 0) add("table", k, { x0: TABLES[k].x, y0: TABLE_TOP - 3, x1: TABLES[k].x + TABLES[k].w, y1: FLOOR, fuel: (0.5 * p) / TABLE_PLANKS + 0.5 });
    });
    [this.bookCart, this.barrow].forEach((c, k) => {
      if (c.here) add("cart", k, { x0: Math.round(c.x) - 6, y0: FLOOR - 7, x1: Math.round(c.x) + 6, y1: FLOOR, fuel: 0.8 });
    });
    add("return", 0, { x0: RETURN.x, y0: FLOOR - 11, x1: RETURN.x + RETURN.w, y1: FLOOR, fuel: 0.8 });
    this.burnables = kinds;
    this.fire.load(objects);
    const table = TABLES[t];
    // The candle's oil runs along the tabletop: it goes up end to end.
    for (let x = table.x + 1; x < table.x + table.w - 1; x += 4) this.fire.ignite(x, TABLE_TOP - 1);
    this.fires++;
    this.firedAt = this.time;
    this.before = { shelves: this.shelves, librarians: this.librarians.length, books: this.booksBurnt };
    this.lost = null;
    // Who fights it is settled now: the bravest of those keeping the stacks,
    // more with training. The lab is safe below.
    this.chooseFighters();
    return true;
  }
  private chooseFighters() {
    const drill = this.drill();
    this.fighters = new Set(this.librarians.filter((l) => l.y <= H && (l.role === "shelver" || (this.shelving(l) && h01(l.id, this.fires) < drill.fight))).map((l) => l.id));
  }
  private noticeDelay(l: Librarian) {
    const absorbed = l.action === "study" || l.action === "read" ? 3 : 0;
    return (0.5 + absorbed + h01(l.id, this.fires + 7) * 4) / this.drill().speed;
  }
  private firedAt = 0;
  private before = { shelves: 0, librarians: 0, books: 0 };
  /** What the last fire cost, once it is out: shelves, librarians, books. */
  lost: { shelves: number; librarians: number; books: number } | null = null;
  private burnables: { kind: "unit" | "ladder" | "table" | "cart" | "return"; k: number }[] = [];

  /** Drops whatever the librarian was doing (a fire, or a fire's end). */
  private interrupt(l: Librarian) {
    for (const s of l.held) this.reserved.delete(s);
    l.held = [];
    if (l.hand === "plank") {
      if (this.barrow.here) this.barrow.planks++;
      l.hand = "";
    }
    if (l.plankClaim) this.claimed--;
    if (l.bookClaim) this.cartClaims--;
    l.plankClaim = l.bookClaim = false;
    this.releaseSite(l);
    for (const c of [this.bookCart, this.barrow]) if (c.by === l.id) c.by = 0;
    if (this.exporting === l.id) this.exporting = 0;
    if (this.refiller === l.id) this.refiller = 0;
    if (this.sweeper === l.id) this.sweeper = 0;
    this.seats.forEach((id, k) => {
      if (id === l.id) this.seats[k] = 0;
    });
    l.seat = -1;
    // A book open on the table is picked up, read or not.
    if (l.reading && !l.carrying) l.carrying = l.reading;
    l.reading = 0;
    leaveLab(this.lab, l.id);
    if (l.with) {
      const p = this.librarians.find((o) => o.id === l.with);
      if (p && p.with === l.id) {
        p.with = 0;
        if (p.steps[0]?.kind === "work" && p.steps[0].action === "chat") p.steps = [];
      }
      l.with = 0;
    }
    if (l.hand === "cup" || l.hand === "broom" || l.hand === "flask") l.hand = "";
    l.pushing = null;
    l.steps = [];
  }

  private planFire(l: Librarian): void {
    const fight = this.fighters.has(l.id), drill = this.drill();
    l.mode = fight ? "fight" : "flee";
    const steps: Step[] = [];
    if (l.y < FLOOR) steps.push(this.down());
    const fx = this.fireCentre(), side = l.x < fx ? 0 : 1;
    if (!fight) {
      // Out of the nave, down the hallway away from the flames; there they
      // fetch water from outside to keep that side's butt full.
      if (this.butts[side] <= BUTT_FULL - 2 && l.x * (side ? 1 : -1) > (side ? W : 0)) {
        steps.push({ kind: "walk", x: EXITS[side] }, { kind: "away", t: 3 + this.rng() * 2, done: () => (l.hand = "bucket") },
          { kind: "walk", x: BUTTS[side] + (side ? 3 : -3) }, {
            kind: "work", t: 1.2, action: "pour", face: side ? -1 : 1, done: () => {
              this.butts[side] = Math.min(BUTT_FULL, this.butts[side] + 2);
              l.hand = "";
            },
          });
        l.steps = steps;
        return;
      }
      steps.push({ kind: "walk", x: side ? W + 30 + (l.id % 4) * 5 : -30 - (l.id % 4) * 5 }, { kind: "work", t: 2, action: "cower" });
      l.steps = steps;
      return;
    }
    if (l.water <= 0) {
      // The nearer butt with water in it; with both dry there is nothing to fight with.
      const butt = this.butts[side] > 0 ? side : this.butts[1 - side] > 0 ? 1 - side : -1;
      if (butt < 0) {
        // Both butts dry: run out to the well for a bucket.
        steps.push({ kind: "walk", x: EXITS[side] }, {
          kind: "away", t: 4 / drill.speed, done: () => {
            l.hand = "bucket";
            l.water = drill.water;
          },
        });
        l.steps = steps;
        return;
      }
      steps.push({ kind: "walk", x: BUTTS[butt] + (butt ? -2 : 2) }, {
        kind: "work", t: 1.4 / drill.speed, action: "fill", done: () => {
          if (this.butts[butt] <= 0) return;
          this.butts[butt]--;
          l.hand = "bucket";
          l.water = drill.water;
        },
      });
      l.steps = steps;
      return;
    }
    const target = this.nearestFlame(l.x);
    if (!target) {
      steps.push({ kind: "work", t: 0.5, action: "idle" });
      l.steps = steps;
      return;
    }
    // Stand off from the flames on this side, as near as the heat allows.
    const dir = l.x < target.x ? -1 : 1;
    let stand = target.x + dir * 12;
    for (let k = 0; k < 30 && this.fire.heatAt(stand, FLOOR - 1, 6) > 0.35; k++) stand += dir * 3;
    stand = Math.max(-6, Math.min(W + 6, stand));
    steps.push({ kind: "walk", x: stand }, {
      kind: "work", t: 0.5 / drill.speed + 0.2, action: "throw", done: () => {
        const n = Math.round(5 + 3 * drill.water);
        this.fire.splash(l.x + (target.x > l.x ? 2 : -2), FLOOR - 4, target.x, target.y, n, (0.32 * l.water * 3) / n, this.rng, 0.45 + Math.abs(target.x - l.x) / 220);
        l.water = 0;
        l.hand = "";
      },
    });
    l.steps = steps;
  }
  /** The burning cells' middle, across the nave. */
  private fireCentre() {
    let sx = 0, n = 0;
    const f = this.fire;
    for (let i = 0; i < f.heat.length; i++) if (f.burningAt(i)) {
      sx += (i % (W / 2)) * 2 + 1;
      n++;
    }
    return n ? sx / n : W / 2;
  }
  /** The burning cell a thrower at `x` can best get at: near, and low. */
  private nearestFlame(x: number) {
    const f = this.fire, fw = W / 2;
    let best: { x: number; y: number } | null = null, score = Infinity;
    for (let i = 0; i < f.heat.length; i++) {
      if (!f.burningAt(i)) continue;
      const cx = (i % fw) * 2 + 1, cy = Math.floor(i / fw) * 2 + 1, s = Math.abs(cx - x) + (FLOOR - cy) * 0.6;
      if (s < score) {
        score = s;
        best = { x: cx, y: cy };
      }
    }
    return best;
  }

  /** Retain purchased shelves at every damage level and queue their repair.
   * Only books whose own cells burned are lost; debris is carried out. */
  private settleFire() {
    this.burnBooks();
    const left = this.fire.integrity();
    const ladderOk = new Set<number>();
    this.burnables.forEach(({ kind, k }, o) => {
      const v = left[o];
      if (kind === "unit") {
        if (v < 0.999) {
          this.damaged.add(k);
          this.units[k] = Math.min(this.units[k], Math.max(0, Math.floor(v * PLANKS)));
        }
      } else if (kind === "ladder") {
        if (v >= 0.5) ladderOk.add(k);
      } else if (kind === "table") {
        this.tables[k] = v >= 0.999 ? this.tables[k] : Math.min(this.tables[k], Math.max(0, Math.floor(v * TABLE_PLANKS)));
      } else if (kind === "return") {
        this.returnPlanks = v >= 0.999 ? this.returnPlanks : Math.max(0, Math.floor(v * TABLE_PLANKS));
        this.returns = this.returns.filter((color, n) => {
          const x = RETURN.x + 1 + (n % RETURN_PER_ROW) * 2, y = n < RETURN_PER_ROW ? FLOOR - 2 : FLOOR - 7;
          if (this.fire.left(x, y) >= 0.6) return true;
          this.booksBurnt++;
          this.burntLoose.push({ color, x });
          return false;
        });
      } else {
        const cart = k ? this.barrow : this.bookCart;
        if (v < 0.5) {
          this.booksBurnt += cart.books.length;
          for (const color of cart.books) this.burntLoose.push({ color, x: cart.x });
          cart.books = [];
          cart.planks = 0;
          cart.here = false;
        }
      }
    });
    for (let b = 0; b < BAYS; b++) {
      let h = 0;
      while (h < this.ladders[b] && ladderOk.has(b * MAX_UNITS + h)) h++;
      this.ladders[b] = Math.min(h, this.bayComplete(b));
    }
    // A broken table loses its professors' seats.
    this.seats.forEach((id, s) => {
      if (id && this.tables[Math.floor(s / 2)] < TABLE_PLANKS) {
        this.seats[s] = 0;
        const l = this.librarians.find((x) => x.id === id);
        if (l) l.seat = -1;
      }
    });
    for (const l of this.librarians) {
      if (!l.away) this.interrupt(l);
      l.mode = "work";
      l.water = 0;
      if (l.hand === "bucket") l.hand = "";
    }
    this.fighters.clear();
    const b = this.before;
    this.lost = { shelves: b.shelves - this.shelves, librarians: b.librarians - this.librarians.length, books: this.booksBurnt - b.books };
  }
  /** Books whose wood has burnt away go with it. */
  private burnBooks() {
    for (let s = 0; s < SLOTS; s++) {
      if (!this.slots[s]) continue;
      const p = slotPixel(s);
      if (this.fire.left(p.x, p.y) < 0.6) {
        this.burntSlots[s] = this.slots[s];
        this.slots[s] = 0;
        this.enchanted[s] = 0;
        this.booksBurnt++;
      }
    }
    this.dropBurnt();
  }
  /** Charred books whose shelf has burnt away under them fall to the floor,
   * to be swept up there, rather than hang where the shelf was. */
  private dropBurnt() {
    for (let s = 0; s < SLOTS; s++) {
      if (!this.burntSlots[s]) continue;
      const p = slotPixel(s);
      if (this.fire.left(p.x, p.y + 1) >= 0.3) continue;
      this.burntLoose.push({ color: this.burntSlots[s], x: p.x });
      this.burntSlots[s] = 0;
    }
  }

  // ── The step ────────────────────────────────────────────────────────

  /** Advances `dt` seconds. */
  step(dt: number) {
    this.time += dt;
    const wasBurning = this.fire.active;
    // Once a minute, the chance of an accident at a table.
    this.minute += dt;
    while (this.minute >= 60) {
      this.minute -= 60;
      const whole = this.tables.map((p, t) => (p === TABLE_PLANKS ? t : -1)).filter((t) => t >= 0);
      if (!this.fire.active && whole.length && this.rng() < accidentChance(this.fireproof)) this.ignite(whole[Math.floor(this.rng() * whole.length)]);
      // Now and then a shelved book takes on runes: the more books on the
      // shelves, the likelier one somewhere does.
      if (this.enchant > 0) {
        const odds = enchantChance(this.enchant);
        for (let s = 0; s < SLOTS; s++) if (this.slots[s] && !this.enchanted[s] && this.rng() < odds) this.enchanted[s] = 1;
      }
    }
    this.fireClock += dt;
    while (this.fireClock >= FIRE_DT) {
      this.fireClock -= FIRE_DT;
      this.fire.step(FIRE_DT, this.rng, this.drill().douse);
      if (this.fire.active && this.fire.version % 5 === 0) this.burnBooks();
    }
    if (wasBurning && !this.fire.active) this.settleFire();
    const burning = this.fire.active;
    stepLab(this.lab, dt, this.time);
    for (const l of [...this.librarians]) {
      // Each in the nave notices the fire after a moment of their own
      // (longer, deep in a book; shorter, drilled for it).
      const nave = l.y <= H;
      if (burning && nave && l.mode === "work" && !l.away && this.time - this.firedAt >= this.noticeDelay(l)) this.interrupt(l);
      if (burning && nave && !l.away && this.scorch(l, dt)) continue;
      if (!l.away) l.energy = Math.max(0, l.energy - dt * (TIRING[l.action] ?? 0));
      if (l.soot > 0) l.soot = Math.max(0, l.soot - dt / 40);
      let left = dt, n = 0;
      while (left > 0 && n++ < 8) {
        if (!l.steps.length) {
          this.plan(l);
          if (!l.steps.length) break;
        }
        left = this.advance(l, l.steps[0], left);
      }
    }
    this.remains = this.remains.filter((r) => this.time - r.at < 600);
  }

  /** Heat on a librarian's body; returns true if it killed them. */
  private scorch(l: Librarian, dt: number) {
    // Only heat touching the four-pixel body causes injury; distant flames
    // do not kill librarians in the hallways or in the lab.
    let heat = 0;
    for (let dx = 0; dx < 2; dx++) heat = Math.max(heat, this.fire.heatAt(l.x + dx, l.y - 1, 4));
    l.scorched = heat > 0.55 ? l.scorched + dt * (heat > 1 ? 1.5 : 1) : Math.max(0, l.scorched - dt * 0.5);
    if (l.scorched < SCORCH) return false;
    this.interrupt(l);
    this.librarians = this.librarians.filter((o) => o !== l);
    this.deaths++;
    this.booksBurnt += (l.carrying && l.burntFrom < 0 ? 1 : 0) + (l.reading ? 1 : 0);
    this.remains.push({ x: l.x, at: this.time, mourners: [] });
    return true;
  }

  /** Spends up to `dt` on a step; returns the time left over. */
  private advance(l: Librarian, s: Step, dt: number) {
    if (s.kind === "walk") {
      if (typeof s.x === "function") s.x = s.x();
      l.action = "walk";
      const speed = WALK * (l.pushing ? 0.7 : 1) * (l.mode === "flee" ? 1.5 : l.mode === "fight" ? this.drill().speed * 1.2 : 1);
      const d = s.x - l.x, go = speed * dt;
      if (d) l.facing = Math.sign(d);
      if (Math.abs(d) <= go) {
        l.x = s.x;
        l.steps.shift();
        this.drag(l);
        return dt - Math.abs(d) / speed;
      }
      l.x += go * l.facing;
      this.drag(l);
      return 0;
    }
    if (s.kind === "climb") {
      l.action = "climb";
      const d = s.y - l.y, go = CLIMB * dt * (l.mode === "work" ? 1 : 1.6);
      if (Math.abs(d) <= go) {
        l.y = s.y;
        l.steps.shift();
        return dt - Math.abs(d) / CLIMB;
      }
      l.y += go * Math.sign(d);
      return 0;
    }
    if (s.kind === "away") {
      if (!l.away && l.pushing) l.pushing.here = false;
      l.away = true;
      l.action = "idle";
      if (s.until ? !s.until() : s.t > dt) {
        s.t -= dt;
        return 0;
      }
      if (s.until) s.t = 0;
      l.away = false;
      l.steps.shift();
      s.done?.();
      return dt - s.t;
    }
    l.action = s.action;
    if (s.face) l.facing = s.face;
    if (s.action === "study") {
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
    if (s.action === "study" && l.reading) {
      // The book is picked up again, read.
      l.carrying = l.reading;
      l.reading = 0;
    }
    s.done?.();
    return dt - s.t;
  }
  /** A pushed cart rolls ahead of its librarian. */
  private drag(l: Librarian) {
    if (!l.pushing) return;
    l.pushing.x = l.x + 6 * l.facing;
    l.pushing.facing = l.facing;
  }

  /** Knowledge enchanted books have given since last asked. */
  takeBonus() {
    const b = this.bonus;
    this.bonus = 0;
    return b;
  }

  save(now: number): LibrarySave {
    // Books read and in hand go on the return shelf; the rest in hand, on the
    // tables and in the cart are put back where there's room.
    const slots = new Uint8Array(this.slots), returns = [...this.returns], burnt = new Uint8Array(this.burntSlots);
    for (const l of this.librarians) if (l.burntFrom >= 0 && l.burntFrom < SLOTS && l.carrying) burnt[l.burntFrom] = l.carrying;
    const loose: number[] = [...(this.exporting ? [] : this.bookCart.books)];
    const exportedBooks = this.exporting ? [...this.bookCart.books] : [];
    const debris = this.burntLoose.map((b) => ({ ...b }));
    for (const l of this.librarians) {
      if (l.burntFrom >= SLOTS && l.carrying) debris.push({ color: l.carrying, x: Math.max(0, Math.min(W - 1, l.x)) });
      if (l.burntFrom >= 0) continue;
      if (l.spent && l.carrying && returns.length < RETURN_BOOKS) returns.push(l.carrying);
      else if (l.spent && l.carrying) exportedBooks.push(l.carrying);
      else if (l.carrying) loose.push(l.carrying);
      if (l.reading) loose.push(l.reading);
    }
    // Enchanted books in hand, unread, go back first (they are popped first).
    const enchanted = new Uint8Array(this.enchanted);
    let runes = 0;
    for (const l of this.librarians) if (l.rune && !l.spent && l.burntFrom < 0 && (l.carrying || l.reading)) {
      const at = loose.lastIndexOf(l.reading || l.carrying);
      if (at >= 0) { loose.push(loose.splice(at, 1)[0]); runes++; }
    }
    for (let s = 0; s < SLOTS && loose.length; s++) {
      const { bay, unit } = slotPlace(s);
      if (!slots[s] && !burnt[s] && this.units[unitKey(bay, unit)] === PLANKS) {
        slots[s] = loose.pop()!;
        if (runes > 0) { enchanted[s] = 1; runes--; }
      }
    }
    // Keep active heat, consumed fuel and debris for the next catch-up.
    return {
      seed: this.seed, units: [...this.units], tables: [...this.tables], hired: this.librarians.length,
      slots: encodeGrid(slots), ladders: [...this.ladders], savedAt: now,
      crew: this.librarians.map((l) => ({ name: l.name, role: l.role })), returns, lab: this.lab.level,
      time: this.time, fire: this.fire.save(), burnables: this.burnables.map((b) => ({ ...b })),
      rngState: this.rngState, minute: this.minute, firedAt: this.firedAt,
      damaged: [...this.damaged], burntSlots: encodeGrid(burnt), butts: [...this.butts],
      enchanted: encodeGrid(enchanted), runesRead: this.runesRead,
      looseBooks: loose, burntLoose: debris, returnPlanks: this.returnPlanks,
      exportedBooks,
      crewState: this.librarians.map((l) => ({ x: l.x, y: l.y, scorched: l.scorched, energy: l.energy })),
      counters: { booksIn: this.booksIn, booksOut: this.booksOut, booksBurnt: this.booksBurnt, deaths: this.deaths, fires: this.fires },
    };
  }

  /** Books on the shelves, in hand, on the tables, in the cart and on the
   * return shelf. */
  get books() {
    let n = 0;
    for (const c of this.slots) if (c) n++;
    for (const l of this.librarians) n += (l.carrying && l.burntFrom < 0 ? 1 : 0) + (l.reading ? 1 : 0);
    return n + this.bookCart.books.length + this.returns.length;
  }
  /** Fresh books on the shelves, waiting to be read. */
  get fresh() {
    let n = 0;
    for (const c of this.slots) if (c) n++;
    return n;
  }

  /** A research bought in the Study: the circle in the lab flares. */
  researched() {
    this.lab.glow = 1;
    this.lab.puffs.push({ x: LAB.circle.x + 6, color: 2, at: this.time, big: true });
  }
}

const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const list = (v: unknown, n: number, min: number, max: number) => Array.isArray(v) && v.length === n && v.every((x) => int(x, min, max));

/** A stored library, or null unless it is well formed. A library saved
 * before shelves were built by hand (a count of `shelves`) loads with
 * those shelves standing. */
export function decodeLibrarySave(s: any): LibrarySave | null {
  if (!s || typeof s !== "object") return null;
  if (!int(s.seed, 0, 0xffffffff) || !int(s.hired, 0, MAX_LIBRARIANS)) return null;
  if (!decodeGrid(s.slots, SLOTS, BOOK_COLORS.length)) return null;
  if (!list(s.ladders, BAYS, 0, MAX_UNITS)) return null;
  let units: number[];
  if (list(s.units, BAYS * MAX_UNITS, -1, PLANKS)) units = [...s.units];
  else if (int(s.shelves, 0, MAX_SHELVES)) {
    units = new Array(BAYS * MAX_UNITS).fill(-1);
    for (let n = 0; n < s.shelves; n++) units[unitKey(SHELF_ORDER[n].bay, SHELF_ORDER[n].unit)] = PLANKS;
  } else return null;
  const tables = list(s.tables, TABLES.length, 0, TABLE_PLANKS) ? [...s.tables] : TABLES.map(() => TABLE_PLANKS);
  const savedAt = typeof s.savedAt === "number" && Number.isFinite(s.savedAt) ? s.savedAt : 0;
  const out: LibrarySave = { seed: s.seed, units, tables, hired: s.hired, slots: s.slots, ladders: [...s.ladders], savedAt };
  if (Array.isArray(s.crew) && s.crew.length === s.hired && s.crew.every((c: any) => c && typeof c.name === "string" && c.name.length <= 40 && ROLES.includes(c.role)))
    out.crew = s.crew.map((c: any) => ({ name: c.name, role: c.role }));
  if (int(s.lab, 1, LAB_MAX_LEVEL)) out.lab = s.lab;
  if (Array.isArray(s.returns) && s.returns.length <= RETURN_BOOKS && s.returns.every((c: unknown) => int(c, 1, BOOK_COLORS.length - 1))) out.returns = [...s.returns];
  if (Number.isFinite(s.idleMs) && s.idleMs >= 0 && s.idleMs <= 86400000) out.idleMs = s.idleMs;
  if (Number.isFinite(s.time) && s.time >= 0 && s.time <= 1e12) out.time = s.time;
  if (int(s.rngState, 0, 0xffffffff)) out.rngState = s.rngState;
  if (Number.isFinite(s.minute) && s.minute >= 0 && s.minute < 60) out.minute = s.minute;
  if (Number.isFinite(s.firedAt) && s.firedAt >= 0 && s.firedAt <= (out.time ?? 0)) out.firedAt = s.firedAt;
  if (Array.isArray(s.damaged) && s.damaged.length <= MAX_SHELVES && s.damaged.every((k: unknown) => int(k, 0, BAYS * MAX_UNITS - 1))) out.damaged = [...s.damaged];
  if (decodeGrid(s.burntSlots, SLOTS, BOOK_COLORS.length)) out.burntSlots = s.burntSlots;
  if (decodeGrid(s.enchanted, SLOTS, 2)) out.enchanted = s.enchanted;
  if (Number.isFinite(s.runesRead) && s.runesRead >= 0) out.runesRead = s.runesRead;
  if (int(s.returnPlanks, 0, TABLE_PLANKS)) out.returnPlanks = s.returnPlanks;
  if (Array.isArray(s.looseBooks) && s.looseBooks.length <= SLOTS && s.looseBooks.every((c: unknown) => int(c, 1, BOOK_COLORS.length - 1))) out.looseBooks = [...s.looseBooks];
  if (Array.isArray(s.exportedBooks) && s.exportedBooks.length <= CART_BOOKS + MAX_LIBRARIANS && s.exportedBooks.every((c: unknown) => int(c, 1, BOOK_COLORS.length - 1))) out.exportedBooks = [...s.exportedBooks];
  if (Array.isArray(s.burntLoose) && s.burntLoose.length <= SLOTS && s.burntLoose.every((b: any) => b && int(b.color, 1, BOOK_COLORS.length - 1) && Number.isFinite(b.x) && b.x >= 0 && b.x < W)) out.burntLoose = s.burntLoose.map((b: any) => ({ color: b.color, x: b.x }));
  if (list(s.butts, 2, 0, BUTT_FULL)) out.butts = [...s.butts];
  const fire = decodeFireSave(s.fire);
  const limits = { unit: BAYS * MAX_UNITS, ladder: BAYS * MAX_UNITS, table: TABLES.length, cart: 2, return: 1 };
  if (fire && Array.isArray(s.burnables) && s.burnables.length <= 1000 && s.burnables.every((b: any) => b && b.kind in limits && int(b.k, 0, limits[b.kind as keyof typeof limits] - 1)) && fire.cells.every((c) => c[9] < s.burnables.length)) {
    out.fire = fire;
    out.burnables = s.burnables.map((b: any) => ({ kind: b.kind, k: b.k }));
  }
  if (Array.isArray(s.crewState) && s.crewState.length === s.hired && s.crewState.every((c: any) => c && Number.isFinite(c.x) && c.x >= EXITS[0] && c.x <= EXITS[1] && Number.isFinite(c.y) && c.y >= 0 && c.y <= LAB_FLOOR && Number.isFinite(c.scorched) && c.scorched >= 0 && c.scorched < SCORCH && Number.isFinite(c.energy) && c.energy >= 0 && c.energy <= 1)) out.crewState = s.crewState.map((c: any) => ({ x: c.x, y: c.y, scorched: c.scorched, energy: c.energy }));
  if (s.counters && ["booksIn", "booksOut", "booksBurnt", "deaths", "fires"].every((k) => int(s.counters[k], 0, 1e12))) out.counters = { booksIn: s.counters.booksIn, booksOut: s.counters.booksOut, booksBurnt: s.counters.booksBurnt, deaths: s.counters.deaths, fires: s.counters.fires };
  return out;
}
