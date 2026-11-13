/** The story scroll: a pixel-art scroll that unrolls over the page while a
 * quill scribbles a zone's story onto it (`zone-stories.ts`). The first tap
 * finishes the writing at once, the next fades the scroll away and calls
 * `done`. The scroll is drawn in art pixels on a canvas and scaled by a whole
 * number, so its pixels stay square at any window size; the text sits in the
 * DOM over the parchment, in the page's own font. */
import type { ZoneStory } from "../defend/zone-stories.ts";

/** Seconds per letter, and the extra pause after a sentence, a comma and a
 * paragraph: quick, but with a writer's breath at the stops. */
const LETTER_S = 1 / 115;
const STOP_S = 0.14;
const COMMA_S = 0.05;
const PARAGRAPH_S = 0.25;
const UNROLL_MS = 450;
const FADE_MS = 420;
/** The rolled ends' height, and how far the sheet sits in from the knobs. */
const ROLLER = 9;
const SHEET_INSET = 8;
/** The knobs' width past each end of the roll. */
const KNOB_W = 5;

const OUTLINE = "#2a1a0c";
const PAPER = [0xe9, 0xd4, 0xa4];
const ROLL = ["#2a1a0c", "#f6e8c4", "#f0dcae", "#e6cc96", "#dcbe84", "#cfac6e", "#bf9858", "#a37c42", "#2a1a0c"];
const KNOB = ["#2a1a0c", "#5c3418", "#8a5228", "#b0703a", "#8a5228", "#6e3e1c", "#4a2810", "#3a1e0a", "#2a1a0c"];

/** A small stable hash in 0..1, for the paper's grain and stains. */
function noise(x: number, y: number, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** One rolled end of the scroll at row `y0`: the parchment wound round its
 * rod, and the rod's turned wooden knobs past either side. */
function drawRoller(g: CanvasRenderingContext2D, w: number, y0: number) {
  const x0 = KNOB_W, x1 = w - KNOB_W;
  for (let r = 0; r < ROLLER; r++) {
    g.fillStyle = ROLL[r];
    g.fillRect(x0, y0 + r, x1 - x0, 1);
  }
  // The roll's outlined ends, the turns of paper wound on it, and its shine.
  g.fillStyle = OUTLINE;
  g.fillRect(x0, y0 + 1, 1, ROLLER - 2);
  g.fillRect(x1 - 1, y0 + 1, 1, ROLLER - 2);
  g.fillStyle = "rgba(90,60,25,.35)";
  for (const x of [x0 + 3, x1 - 4]) g.fillRect(x, y0 + 2, 1, ROLLER - 4);
  g.fillStyle = "rgba(255,250,230,.55)";
  g.fillRect(x0 + 5, y0 + 2, x1 - x0 - 10, 1);
  // Each knob: a short neck of rod, then a round turned cap.
  for (const side of [0, 1]) {
    const at = (dx: number) => side ? w - 1 - dx : dx;
    const column = (dx: number, top: number, bottom: number) => {
      const x = at(dx);
      for (let r = top; r <= bottom; r++) {
        g.fillStyle = r === top || r === bottom ? OUTLINE : KNOB[Math.round(1 + (r - top - 1) * 7 / Math.max(1, bottom - top - 2))];
        g.fillRect(x, y0 + r, 1, 1);
      }
    };
    column(0, 2, ROLLER - 3);
    column(1, 1, ROLLER - 2);
    column(2, 1, ROLLER - 2);
    column(3, 2, ROLLER - 3);
    column(4, 3, ROLLER - 4);
    g.fillStyle = OUTLINE;
    g.fillRect(at(0), y0 + 2, 1, ROLLER - 4);
    g.fillStyle = "rgba(255,225,170,.45)";
    g.fillRect(at(side ? 2 : 1), y0 + 2, 1, 2);
  }
}

/** The open sheet between the rolls, `h` rows from `y0`: grained parchment
 * darkening toward its ragged edges, a few old stains, and the top roll's
 * shadow across it. */
function drawSheet(g: CanvasRenderingContext2D, w: number, y0: number, h: number, full: number) {
  if (h <= 0) return;
  const img = g.createImageData(w, h);
  const d = img.data;
  const stains = [0, 1, 2].map((i) => ({
    x: SHEET_INSET + 10 + noise(i, 1, 7) * (w - 2 * SHEET_INSET - 20),
    y: 10 + noise(i, 2, 7) * Math.max(1, full - 20),
    r: 4 + noise(i, 3, 7) * 7,
  }));
  // The edges are torn a pixel inward here and there, outlined unbroken.
  const leftAt = (y: number) => SHEET_INSET + (noise(0, y >> 2, 3) > 0.72 ? 1 : 0);
  const rightAt = (y: number) => w - SHEET_INSET - 1 - (noise(1, y >> 2, 3) > 0.72 ? 1 : 0);
  for (let y = 0; y < h; y++) {
    const left = leftAt(y), right = rightAt(y);
    const leftEdge = Math.max(left, leftAt(y - 1), leftAt(y + 1));
    const rightEdge = Math.min(right, rightAt(y - 1), rightAt(y + 1));
    for (let x = left; x <= right; x++) {
      const i = (y * w + x) * 4;
      if (x <= leftEdge && x >= left || x >= rightEdge && x <= right) {
        d[i] = 0x2a; d[i + 1] = 0x1a; d[i + 2] = 0x0c; d[i + 3] = 255;
        continue;
      }
      const edge = Math.min(x - left, right - x);
      let shade = edge < 2 ? 0.8 : edge < 4 ? 0.88 : edge < 7 ? 0.95 : 1;
      if (y < 2) shade *= 0.72;
      else if (y < 4) shade *= 0.86;
      const grain = noise(x, y);
      if (grain > 0.93) shade *= 0.93;
      else if (grain < 0.05) shade *= 1.04;
      for (const s of stains) {
        const r = Math.hypot(x - s.x, (y - s.y) * 1.2);
        if (r < s.r) shade *= Math.abs(r - s.r + 0.8) < 1 ? 0.88 : 0.97;
      }
      d[i] = Math.min(255, PAPER[0] * shade);
      d[i + 1] = Math.min(255, PAPER[1] * shade);
      d[i + 2] = Math.min(255, PAPER[2] * shade * 0.97);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, y0);
}

/** The scroll, unrolled to `t` (0..1), on a canvas of `w`×`h` art pixels. */
export function drawScroll(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  g.clearRect(0, 0, w, h);
  const full = h - 2 * ROLLER;
  const open = Math.round(full * t);
  drawSheet(g, w, ROLLER, open, full);
  drawRoller(g, w, 0);
  drawRoller(g, w, ROLLER + open);
  // The bottom roll's shadow on the sheet just above it.
  if (open > 2) {
    g.fillStyle = "rgba(60,35,10,.18)";
    g.fillRect(SHEET_INSET + 1, ROLLER + open - 2, w - 2 * SHEET_INSET - 2, 2);
  }
}

/** The quill that writes, nib at the bottom left. */
const QUILL = [
  "........###",
  "......##ww#",
  ".....#wwww#",
  "....#wwwgw#",
  "...#wwwgw#.",
  "...#wwgww#.",
  "..#wwgww#..",
  "..#wgww#...",
  ".#wgww#....",
  ".#wgw#.....",
  ".#gw#......",
  "#gg#.......",
  "#n#........",
  "n#.........",
];
const QUILL_INK: Record<string, string> = { "#": OUTLINE, w: "#f4efe2", g: "#9c9282", n: "#1a1008" };

function paintQuill(canvas: HTMLCanvasElement) {
  canvas.width = QUILL[0].length;
  canvas.height = QUILL.length;
  const g = canvas.getContext("2d");
  if (!g) return;
  QUILL.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === ".") return;
    g.fillStyle = QUILL_INK[c];
    g.fillRect(x, y, 1, 1);
  }));
}

/** When each letter of each block is written, in seconds from the start. */
function schedule(blocks: readonly string[]) {
  let t = 0;
  return blocks.map((text) => {
    const at = [...text].map((c) => {
      t += LETTER_S + (".!?".includes(c) ? STOP_S : c === "," || c === ";" ? COMMA_S : 0);
      return t;
    });
    t += PARAGRAPH_S;
    return at;
  });
}

type Block = { el: HTMLElement; inked: Text; unwritten: Text; text: string; at: number[] };

export class StoryScroll {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private page: HTMLElement;
  private hint: HTMLElement;
  private quill: HTMLElement;
  private blocks: Block[] = [];
  private start = 0;
  private frame = 0;
  private filled = false;
  private leaving = false;
  private size = { w: 0, h: 0, scale: 1 };
  private readonly onResize = () => this.fit();
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
      e.preventDefault();
      this.advance();
    }
  };

  private done: () => void;
  private reduceMotion: boolean;

  constructor(story: ZoneStory, done: () => void, reduceMotion = false) {
    this.done = done;
    this.reduceMotion = reduceMotion;
    this.root = document.createElement("div");
    this.root.className = "story-scroll";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", story.title);
    this.root.innerHTML = `<div class="story-scroll-body"><canvas class="story-scroll-art" aria-hidden="true"></canvas><div class="story-scroll-page"></div></div><p class="story-scroll-hint"></p>`;
    this.canvas = this.root.querySelector("canvas")!;
    this.page = this.root.querySelector(".story-scroll-page")!;
    this.hint = this.root.querySelector(".story-scroll-hint")!;
    this.quill = document.createElement("i");
    this.quill.className = "story-quill";
    this.quill.setAttribute("aria-hidden", "true");
    const q = document.createElement("canvas");
    paintQuill(q);
    this.quill.append(q);

    const parts: [string, string][] = [["h2", story.title]];
    if (story.greeting) parts.push(["p class=\"story-greeting\"", story.greeting]);
    for (const p of story.paragraphs) parts.push(["p", p]);
    parts.push(["p class=\"story-signature\"", story.signature]);
    const times = schedule(parts.map(([, text]) => text));
    this.blocks = parts.map(([tag, text], i) => {
      const holder = document.createElement("div");
      holder.innerHTML = `<${tag}></${tag}>`;
      const el = holder.firstElementChild as HTMLElement;
      const inked = document.createTextNode("");
      const rest = document.createElement("span");
      rest.className = "story-unwritten";
      const unwritten = document.createTextNode(text);
      rest.append(unwritten);
      el.append(inked, rest);
      this.page.append(el);
      return { el, inked, unwritten, text, at: times[i] };
    });

    this.root.addEventListener("click", (e) => {
      e.stopPropagation();
      this.advance();
    });
    document.body.append(this.root);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKey, true);
    this.fit();
    this.setHint();
    this.root.tabIndex = -1;
    this.root.focus({ preventScroll: true });
    if (reduceMotion) {
      drawScroll(this.canvas.getContext("2d")!, this.size.w, this.size.h, 1);
      this.fill();
      return;
    }
    this.start = performance.now();
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  /** Sizes the scroll to the window in whole-number art pixels. */
  private fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const maxW = Math.min(vw - 24, 620);
    const maxH = vh - 72;
    const scale = Math.max(2, Math.min(4, Math.floor(maxW / 130)));
    const w = Math.floor(maxW / scale);
    const tallest = Math.floor(maxH / scale);
    const style = this.root.style;
    style.setProperty("--px", `${scale}px`);
    style.setProperty("--scroll-w", `${w * scale}px`);
    style.setProperty("--roller", `${ROLLER * scale}px`);
    style.setProperty("--inset", `${SHEET_INSET * scale}px`);
    // As tall as the story needs (its unwritten letters already hold their
    // place), up to the window's height; a longer story scrolls on the sheet.
    style.setProperty("--scroll-h", `${tallest * scale}px`);
    const last = this.page.lastElementChild as HTMLElement | null;
    const need = Math.ceil((last ? last.offsetTop + last.offsetHeight : 0) / scale) + (ROLLER + 4) * 2 + 4;
    const h = Math.max(60, Math.min(tallest, need));
    this.size = { w, h, scale };
    this.canvas.width = w;
    this.canvas.height = h;
    style.setProperty("--scroll-h", `${h * scale}px`);
    const quill = this.quill.querySelector("canvas")!;
    const pen = Math.max(2, scale - 1);
    quill.style.width = `${quill.width * pen}px`;
    quill.style.height = `${quill.height * pen}px`;
    const g = this.canvas.getContext("2d");
    if (g) drawScroll(g, w, h, this.unrolled());
  }

  private unrolled(now = performance.now()) {
    if (this.reduceMotion || this.filled || !this.start) return 1;
    const t = Math.min(1, (now - this.start) / UNROLL_MS);
    return t * t * (3 - 2 * t);
  }

  private tick(now: number) {
    this.frame = 0;
    if (this.filled || this.leaving) return;
    const t = this.unrolled(now);
    const g = this.canvas.getContext("2d");
    if (g) drawScroll(g, this.size.w, this.size.h, t);
    this.root.classList.toggle("unrolled", t >= 1);
    if (t >= 1) {
      const s = (now - this.start - UNROLL_MS) / 1000;
      let current: Block | null = null;
      for (const b of this.blocks) {
        let n = 0;
        while (n < b.at.length && b.at[n] <= s) n++;
        if (b.inked.data.length !== n) {
          b.inked.data = b.text.slice(0, n);
          b.unwritten.data = b.text.slice(n);
        }
        if (n > 0) current = b;
      }
      const last = this.blocks[this.blocks.length - 1];
      if (s >= last.at[last.at.length - 1]) return this.fill();
      if (current && this.quill.parentElement !== current.el) current.el.insertBefore(this.quill, current.el.lastChild);
      // Keep the quill in view when the story runs past the sheet.
      if (current) this.follow(current.el);
    }
    this.frame = requestAnimationFrame((n) => this.tick(n));
  }

  private follow(el: HTMLElement) {
    const page = this.page;
    const bottom = el.offsetTop + el.offsetHeight - page.clientHeight;
    if (bottom > page.scrollTop) page.scrollTop = bottom;
  }

  /** Writes the whole story at once. */
  private fill() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.filled = true;
    for (const b of this.blocks) {
      b.inked.data = b.text;
      b.unwritten.data = "";
    }
    this.quill.remove();
    this.root.classList.add("unrolled", "filled");
    const g = this.canvas.getContext("2d");
    if (g) drawScroll(g, this.size.w, this.size.h, 1);
    this.setHint();
  }

  private setHint() {
    this.hint.textContent = this.filled ? "Tap to begin" : "Tap to read it all";
  }

  /** The tap: finish the writing, or put the scroll away. */
  advance() {
    if (this.leaving) return;
    if (!this.filled) return this.fill();
    this.leaving = true;
    this.root.classList.add("leaving");
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKey, true);
    setTimeout(() => {
      this.root.remove();
      this.done();
    }, this.reduceMotion ? 0 : FADE_MS);
  }
}
