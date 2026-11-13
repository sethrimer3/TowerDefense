/** The first-time tutorial: short lessons that point at a part of the game
 * the first time the player meets it. Everything else dims smoothly around a
 * lit window on the target, a parchment card beside it says what it is, and a
 * pixel-art arrow points the way. A tap (or Enter) moves on, but only once
 * the step has shown for `LOCK_MS`, so a quick player can't tap through
 * unread. Each lesson shows once per player (`Save.tutorial`).
 *
 * The lessons' words live here (`LESSONS`); the pages that teach them supply
 * where each step points (`Targets`), and offer a lesson whenever it may
 * show (`Tutorial.offer`), which does nothing while another dialog or a
 * story scroll is open. Automated browsers skip it unless they set
 * `window.showTutorial`, as with the story scrolls. */

export const LESSON_IDS = ["build", "battle", "minePlaced", "libraryPlaced", "mineTab", "libraryTab"] as const;
export type LessonId = (typeof LESSON_IDS)[number];

export type LessonStep = { key: string; title: string; text: string };

/** Each lesson's steps, in order. Short and in the realm's own voice: these
 * cards are the one place the game explains itself. */
export const LESSONS: Record<LessonId, readonly LessonStep[]> = {
  build: [
    { key: "keep", title: "The Keep", text: "Your seat and your last stand. Should it fall, the city falls with it." },
    { key: "palette", title: "The Build Menu", text: "Your buildings wait here. Lay city tiles beside the Keep, then drag towers onto them." },
    { key: "tiles", title: "The Tiles Shop", text: "Trade metal for more tiles and buildings." },
    { key: "start", title: "Sound the Horn", text: "When your walls stand ready, call the first wave." },
  ],
  battle: [
    { key: "enemies", title: "The Dark Ones", text: "They march on your Keep. Towers and troops strike any who come near." },
    { key: "keep", title: "The Keep's Strength", text: "Every blow it takes wears it down. Slay them all to win the wave." },
    { key: "skills", title: "Bombs and Spells", text: "Drag one onto the field to turn the tide." },
    { key: "journal", title: "The Journal", text: "Every new foe you meet is written down here." },
  ],
  minePlaced: [
    { key: "building", title: "The Mine", text: "Miners dig ore from under your city, and its smiths beat it into copper, silver and gold." },
    { key: "tab", title: "The Mine's Hall", text: "Its doors are open. Visit it to hire your first miners." },
  ],
  libraryPlaced: [
    { key: "building", title: "The Library", text: "Librarians read its books into Knowledge, even while you are away." },
    { key: "tab", title: "The Library's Hall", text: "Its doors are open. Visit it to fill its shelves." },
  ],
  mineTab: [
    { key: "hire", title: "Hire a Miner", text: "More hands, more ore. Each one costs Copper." },
    { key: "crew", title: "The Crew", text: "Set each miner to dig, to smelt at the forge, or to smith." },
    { key: "buildings", title: "The Buildings", text: "Raise the shaft, barracks, warehouse, forge and smithy to dig deeper and work faster." },
    { key: "metal", title: "Your Metal", text: "Copper, silver and gold from the smithy, spent below and in the Tiles shop." },
    { key: "smithy", title: "The Smithy", text: "Climb down to arm your towers and troops with what the Mine has made." },
  ],
  libraryTab: [
    { key: "shelf", title: "Bookshelves", text: "Each shelf holds more books to read." },
    { key: "hire", title: "Librarians", text: "They shelve the books, read them for Knowledge, or brew in the lab." },
    { key: "lab", title: "The Alchemy Lab", text: "Dig it out further to make room for another researcher." },
    { key: "staff", title: "The Staff", text: "Choose who shelves, who reads and who researches." },
    { key: "study", title: "The Study", text: "Climb down to spend Knowledge on spells and skills." },
  ],
};

/** How long each step holds before a tap moves on. */
export const LOCK_MS = 1000;
const FADE_MS = 300;
/** Room left around the lit target, and between it and the card. */
const PAD = 6;
const GAP = 18;
const MARGIN = 10;

/** Keeps only known lessons, each once. */
export function decodeTutorial(raw: unknown): LessonId[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is LessonId => typeof id === "string" && (LESSON_IDS as readonly string[]).includes(id)))];
}

export type Box = { x: number; y: number; w: number; h: number };
export type Side = "below" | "above" | "right" | "left" | "center";

/** Where the card goes beside the lit `hole` in a `view`: below it if it
 * fits, else above, right, left, or failing all those, centred on the view.
 * The card is kept `MARGIN` inside the view and lined up with the hole. */
export function placeCard(hole: Box | null, card: { w: number; h: number }, view: { w: number; h: number }): { x: number; y: number; side: Side } {
  const clampX = (x: number) => Math.max(MARGIN, Math.min(view.w - card.w - MARGIN, x));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(view.h - card.h - MARGIN, y));
  const center = { x: clampX((view.w - card.w) / 2), y: clampY((view.h - card.h) / 2), side: "center" as Side };
  if (!hole) return center;
  const cx = hole.x + hole.w / 2, cy = hole.y + hole.h / 2;
  if (hole.y + hole.h + GAP + card.h + MARGIN <= view.h) return { x: clampX(cx - card.w / 2), y: hole.y + hole.h + GAP, side: "below" };
  if (hole.y - GAP - card.h >= MARGIN) return { x: clampX(cx - card.w / 2), y: hole.y - GAP - card.h, side: "above" };
  if (hole.x + hole.w + GAP + card.w + MARGIN <= view.w) return { x: hole.x + hole.w + GAP, y: clampY(cy - card.h / 2), side: "right" };
  if (hole.x - GAP - card.w >= MARGIN) return { x: hole.x - GAP - card.w, y: clampY(cy - card.h / 2), side: "left" };
  return center;
}

/** What a step points at: an element, a box on the screen, or nothing (the
 * card then waits in the middle of a fully dimmed page). */
export type Target = Element | Box | null | undefined;
export type Targets = Record<string, () => Target>;

function boxOf(target: Target): Box | null {
  if (!target) return null;
  if (!(target instanceof Element)) return target.w > 0 && target.h > 0 ? target : null;
  const r = target.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** The lit window: the target padded, kept on the screen. */
function holeOf(target: Target): Box | null {
  const b = boxOf(target);
  if (!b) return null;
  const vw = window.innerWidth, vh = window.innerHeight;
  const x0 = Math.max(2, b.x - PAD), y0 = Math.max(2, b.y - PAD);
  const x1 = Math.min(vw - 2, b.x + b.w + PAD), y1 = Math.min(vh - 2, b.y + b.h + PAD);
  return x1 - x0 > 4 && y1 - y0 > 4 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** The pointing arrow, tip at the bottom: brass with a dark outline. */
const ARROW = [
  "...#####...",
  "...#hgg#...",
  "...#hgg#...",
  "...#hgd#...",
  "####hgd####",
  "#hhhggggdd#",
  ".#hgggggd#.",
  "..#hgggd#..",
  "...#hgd#...",
  "....#g#....",
  ".....#.....",
];
const ARROW_INK: Record<string, string> = { "#": "#2a1a0c", h: "#ffe3a0", g: "#e2b866", d: "#b98a3e" };
const ARROW_PX = 3;

function paintArrow(canvas: HTMLCanvasElement) {
  canvas.width = ARROW[0].length;
  canvas.height = ARROW.length;
  canvas.style.width = `${canvas.width * ARROW_PX}px`;
  canvas.style.height = `${canvas.height * ARROW_PX}px`;
  const g = canvas.getContext("2d");
  if (!g) return;
  ARROW.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === ".") return;
    g.fillStyle = ARROW_INK[c];
    g.fillRect(x, y, 1, 1);
  }));
}

/** Another dialog or a story scroll owns the screen. */
const busy = () => document.hidden || !!document.querySelector("dialog[open], .story-scroll");
const enabled = () => !navigator.webdriver || !!(window as { showTutorial?: boolean }).showTutorial;

export type TutorialHost = {
  /** The lessons this player has finished. */
  seen(): readonly LessonId[];
  /** A lesson was read to its end. */
  finish(id: LessonId): void;
  reduceMotion(): boolean;
};

export class Tutorial {
  private root: HTMLElement | null = null;
  private hole!: HTMLElement;
  private card!: HTMLElement;
  private arrow!: HTMLElement;
  private lesson: LessonId | null = null;
  private targets: Targets = {};
  private step = 0;
  private shownAt = 0;
  private frame = 0;
  private readyTimer = 0;
  private last = "";
  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.root) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") this.advance();
  };

  constructor(private host: TutorialHost) {}

  /** A lesson is on the screen; the battle holds still while it is. */
  get open() {
    return !!this.root;
  }

  /** Whether `id` is still to be taught (and nothing else is being taught). */
  wants(id: LessonId) {
    return !this.root && enabled() && !this.host.seen().includes(id);
  }

  /** Shows lesson `id` if it is unread and the screen is free; true when it
   * opened. Safe to call every frame. */
  offer(id: LessonId, targets: Targets): boolean {
    if (!this.wants(id) || busy()) return false;
    this.lesson = id;
    this.targets = targets;
    this.step = 0;
    this.last = "";
    const root = document.createElement("div");
    root.className = "tutorial";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.innerHTML = `<div class="tutorial-hole"></div><i class="tutorial-arrow" aria-hidden="true"><canvas></canvas></i>
      <div class="tutorial-card" aria-live="polite"><h2></h2><p></p><footer><span class="tutorial-dots" aria-hidden="true"></span><span class="tutorial-go"></span></footer></div>`;
    this.hole = root.querySelector(".tutorial-hole")!;
    this.card = root.querySelector(".tutorial-card")!;
    this.arrow = root.querySelector(".tutorial-arrow")!;
    paintArrow(this.arrow.querySelector("canvas")!);
    root.classList.toggle("still", this.host.reduceMotion());
    // The overlay takes every press, so nothing beneath is touched by mistake.
    for (const type of ["pointerdown", "pointerup", "touchstart", "wheel", "contextmenu"] as const)
      root.addEventListener(type, (e) => { e.stopPropagation(); if (type !== "pointerdown" && type !== "touchstart") e.preventDefault(); }, { passive: false });
    root.addEventListener("click", (e) => {
      e.stopPropagation();
      this.advance();
    });
    document.body.append(root);
    this.root = root;
    window.addEventListener("keydown", this.onKey, true);
    root.tabIndex = -1;
    root.focus({ preventScroll: true });
    this.show();
    // The first window opens out from the whole screen.
    requestAnimationFrame(() => root.classList.add("shown"));
    this.frame = requestAnimationFrame(() => this.track());
    return true;
  }

  /** Taps before the step has held for `LOCK_MS` are ignored. */
  advance() {
    if (!this.root || !this.lesson || performance.now() - this.shownAt < LOCK_MS) return;
    if (this.step + 1 < LESSONS[this.lesson].length) {
      this.step++;
      this.show();
      return;
    }
    this.close(true);
  }

  /** Puts the lesson away; `finished` marks it read. */
  close(finished = false) {
    const root = this.root, id = this.lesson;
    if (!root) return;
    this.root = null;
    this.lesson = null;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.readyTimer);
    window.removeEventListener("keydown", this.onKey, true);
    root.classList.add("leaving");
    setTimeout(() => root.remove(), this.host.reduceMotion() ? 0 : FADE_MS);
    if (finished && id) this.host.finish(id);
  }

  private show() {
    const steps = LESSONS[this.lesson!], s = steps[this.step];
    this.card.querySelector("h2")!.textContent = s.title;
    this.card.querySelector("p")!.textContent = s.text;
    this.card.querySelector(".tutorial-dots")!.innerHTML = steps.length > 1 ? steps.map((_, i) => `<i class="${i === this.step ? "on" : ""}"></i>`).join("") : "";
    this.card.querySelector(".tutorial-go")!.textContent = this.step + 1 < steps.length ? "Continue" : "Onward";
    this.card.classList.remove("ready");
    this.root!.setAttribute("aria-label", s.title);
    this.shownAt = performance.now();
    clearTimeout(this.readyTimer);
    this.readyTimer = window.setTimeout(() => this.card.classList.add("ready"), LOCK_MS);
    this.last = "";
    this.place();
    if (!this.host.reduceMotion()) {
      this.card.classList.remove("turn");
      void this.card.offsetWidth;
      this.card.classList.add("turn");
    }
  }

  /** Follows the target as the page moves under it. */
  private track() {
    if (!this.root) return;
    this.place();
    this.frame = requestAnimationFrame(() => this.track());
  }

  private place() {
    const s = LESSONS[this.lesson!][this.step];
    const hole = holeOf(this.targets[s.key]?.());
    const vw = window.innerWidth, vh = window.innerHeight;
    const key = hole ? `${Math.round(hole.x)},${Math.round(hole.y)},${Math.round(hole.w)},${Math.round(hole.h)},${vw},${vh}` : `-,${vw},${vh}`;
    if (key === this.last) return;
    this.last = key;
    const h = hole ?? { x: vw / 2, y: vh / 2, w: 0, h: 0 };
    Object.assign(this.hole.style, { left: `${h.x}px`, top: `${h.y}px`, width: `${h.w}px`, height: `${h.h}px` });
    this.hole.classList.toggle("empty", !hole);
    this.card.style.width = `${Math.min(300, vw - 2 * MARGIN)}px`;
    const at = placeCard(hole, { w: this.card.offsetWidth, h: this.card.offsetHeight }, { w: vw, h: vh });
    Object.assign(this.card.style, { left: `${at.x}px`, top: `${at.y}px` });
    this.arrow.hidden = !hole || at.side === "center";
    if (!hole || at.side === "center") return;
    // The arrow sits in the gap, its tip toward the target.
    const aw = ARROW[0].length * ARROW_PX, ah = ARROW.length * ARROW_PX;
    const cx = Math.max(at.x + 16, Math.min(at.x + this.card.offsetWidth - 16, hole.x + hole.w / 2));
    const cy = Math.max(at.y + 16, Math.min(at.y + this.card.offsetHeight - 16, hole.y + hole.h / 2));
    const spot = {
      below: { x: cx, y: at.y - ah / 2 + 2, turn: 180 },
      above: { x: cx, y: at.y + this.card.offsetHeight + ah / 2 - 2, turn: 0 },
      right: { x: at.x - ah / 2 + 2, y: cy, turn: 90 },
      left: { x: at.x + this.card.offsetWidth + ah / 2 - 2, y: cy, turn: -90 },
    }[at.side];
    Object.assign(this.arrow.style, { left: `${spot.x - aw / 2}px`, top: `${spot.y - ah / 2}px` });
    this.arrow.style.setProperty("--turn", `${spot.turn}deg`);
  }
}
