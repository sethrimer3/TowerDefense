/** In-world rooms for the menus, and the way down to them.
 *
 * A `Chamber` is a menu set in a room: its wall baked and lit as pixel art
 * (`HallBackdrop`), a torch on each of its sides (`paintSconce`) whose light
 * plays over the wall, a dim veil so the text stays easy to read, and the
 * menu's own content over it all.
 *
 * A `Descent` takes a tab down to the chamber below it: the tab's scene
 * slides up and away, the earth under it (`paintStrata`, two layers moving
 * at different speeds for depth) rushes past, and the chamber rises into
 * place, as if the view were climbing down a ladder; going back up runs it
 * in reverse. Reduce motion makes it a cut. */
import { play } from "../sound.ts";
import { ashlar, h01 } from "../library/ashlar.ts";
import { ART, HallBackdrop, paintSconce, type HallLook } from "./hall-art.ts";

export class Chamber {
  readonly content: HTMLElement;
  private backdrop: HallBackdrop;
  private sconces: HTMLCanvasElement[];

  constructor(readonly root: HTMLElement, look: HallLook) {
    root.classList.add("chamber", `chamber-${look}`);
    root.innerHTML = `<canvas class="chamber-wall" aria-hidden="true"></canvas><div class="chamber-dim" aria-hidden="true"></div>
      <canvas class="sconce left" aria-hidden="true"></canvas><canvas class="sconce right" aria-hidden="true"></canvas>
      <div class="chamber-content"></div>`;
    this.backdrop = new HallBackdrop(root.querySelector<HTMLCanvasElement>(".chamber-wall")!, look);
    this.sconces = Array.from(root.querySelectorAll<HTMLCanvasElement>(".sconce"));
    this.content = root.querySelector<HTMLElement>(".chamber-content")!;
  }

  /** Lights the room for wall-clock `now`; `day` in [0, 1] is the daylight
   * outside (only the keep's window shows it). */
  draw(now: number, reduced: boolean, day = 1) {
    const base = this.root.getBoundingClientRect();
    if (!base.width || !base.height) return;
    const spots = this.sconces.map((s, i) => {
      paintSconce(s, now, i ? "right" : "left", reduced);
      const r = s.getBoundingClientRect();
      return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height * 0.3 };
    });
    this.backdrop.draw(now, spots, day, reduced);
  }
}

/** How long the way down takes (matching style.css's `.descent-page`). */
export const DESCENT_MS = 1100;

export class Descent {
  down = false;
  private moving = false;
  private timer = 0;
  private painted = false;

  constructor(private page: HTMLElement, private kind: "mine" | "library", private reduced: () => boolean) {
    this.world.inert = false;
    this.chamberEl.inert = true;
  }
  private get world() {
    return this.page.querySelector<HTMLElement>(".descent-world")!;
  }
  private get chamberEl() {
    return this.page.querySelector<HTMLElement>(".descent-chamber")!;
  }

  /** Goes down to the chamber, or back up to the scene. */
  go(down: boolean) {
    if (down === this.down) return;
    if (!this.painted) {
      this.painted = true;
      this.page.querySelectorAll<HTMLCanvasElement>(".descent-strata canvas").forEach((c, i) => paintStrata(c, this.kind, i === 1));
    }
    this.down = down;
    this.page.classList.toggle("descended", down);
    this.world.inert = down;
    this.chamberEl.inert = !down;
    this.moving = true;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => (this.moving = false), this.reduced() ? 0 : DESCENT_MS + 80);
    play("stone");
  }
  /** Whether the scene above is in view (wholly or passing). */
  get above() {
    return !this.down || this.moving;
  }
  /** Whether the chamber below is in view (wholly or arriving). */
  get below() {
    return this.down || this.moving;
  }
}

/** The page's skeleton for a tab with a chamber below it: the scene, the
 * earth between (a far and a near layer) and the chamber. */
export const descentHtml = (id: string) =>
  `<div class="descent-world" id="${id}-world"></div><div class="descent-strata" aria-hidden="true"><canvas class="strata-far"></canvas><canvas class="strata-near"></canvas></div><div class="descent-chamber" id="${id}-chamber"></div>`;

/** Paints the ground passed on the way down, at `ART` screen pixels a pixel.
 * The far layer: under the Mine, rock in bands with copper, silver and gold
 * glinting in it; under the Library, the foundations' ashlar giving way to
 * earth, roots and an old candle in a niche. The near layer, in black
 * outlines: the ladder climbed down, its stiles and rungs, and the timbers
 * (or the stone corbels) it is fixed to. */
export function paintStrata(canvas: HTMLCanvasElement, kind: "mine" | "library", near: boolean) {
  const w = Math.max(8, Math.ceil(canvas.clientWidth / ART)), h = Math.max(8, Math.ceil(canvas.clientHeight / ART));
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d")!, img = c.createImageData(w, h), d = img.data;
  const set = (x: number, y: number, rgb: [number, number, number], a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    d[o] = rgb[0];
    d[o + 1] = rgb[1];
    d[o + 2] = rgb[2];
    d[o + 3] = a;
  };
  if (!near) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const depth = y / h;
        if (kind === "library" && depth < 0.35) {
          const s = ashlar(x, y, true), t = 0.55;
          set(x, y, [s.rgb[0] * t, s.rgb[1] * t, s.rgb[2] * t]);
          continue;
        }
        const band = Math.floor((y + Math.sin(x * 0.05) * 6 + Math.sin(x * 0.013) * 10) / 14);
        const tone = (0.55 + h01(band, 1, 3) * 0.3) * (0.9 + h01(x, y, 4) * 0.16) * (1 - depth * 0.35);
        const earth: [number, number, number] = kind === "mine" ? [96 * tone, 88 * tone, 82 * tone] : [92 * tone, 70 * tone, 50 * tone];
        set(x, y, earth);
        const r = h01(x, y, 5);
        if (kind === "mine" && r > 0.995) set(x, y, depth < 0.4 ? [214, 128, 72] : depth < 0.75 ? [222, 226, 232] : [250, 206, 96]);
        else if (r < 0.004) set(x, y, [30, 24, 20]);
      }
    if (kind === "library") {
      // Roots reaching down out of the foundations.
      for (let k = 0; k < 7; k++) {
        let x = Math.floor(h01(k, 2, 6) * w), y = Math.floor(h * 0.35);
        for (let s = 0; s < h * 0.3; s++) {
          set(x, y, [58, 40, 26]);
          y++;
          if (h01(k, s, 7) > 0.7) x += h01(k, s, 8) > 0.5 ? 1 : -1;
        }
      }
    }
  } else {
    // The ladder: two stiles and a rung every six pixels, outlined.
    const mid = Math.floor(w / 2), half = 6;
    for (let y = 0; y < h; y++) {
      for (const sx of [mid - half, mid + half]) {
        set(sx - 1, y, [11, 9, 7]);
        set(sx, y, [122, 84, 50]);
        set(sx + 1, y, [88, 58, 34]);
        set(sx + 2, y, [11, 9, 7]);
      }
      if (y % 6 === 0) {
        for (let x = mid - half + 2; x < mid + half; x++) {
          set(x, y - 1, [11, 9, 7]);
          set(x, y, [140, 98, 58]);
          set(x, y + 1, [11, 9, 7]);
        }
      }
    }
    // What the ladder is fixed to, every so often down the way.
    for (let y = 18; y < h; y += 46) {
      const reach = kind === "mine" ? w : 22, x0 = kind === "mine" ? 0 : mid - 11;
      for (let x = x0; x < x0 + reach; x++) {
        if (kind === "library" && Math.abs(x - mid) < half + 3 && Math.abs(x - mid) > half - 3) continue;
        set(x, y - 1, [11, 9, 7]);
        for (let k = 0; k < 4; k++) set(x, y + k, kind === "mine" ? [104 - k * 10, 70 - k * 7, 40 - k * 4] : [120 - k * 12, 112 - k * 12, 104 - k * 12]);
        set(x, y + 4, [11, 9, 7]);
      }
      if (kind === "library") {
        // A candle in a niche beside the ladder.
        const nx = mid + 18;
        for (let yy = y - 6; yy < y + 4; yy++) for (let xx = nx - 3; xx <= nx + 3; xx++) set(xx, yy, Math.abs(xx - nx) === 3 || yy === y - 6 ? [11, 9, 7] : [24, 18, 16]);
        set(nx, y + 1, [230, 220, 196]);
        set(nx, y + 2, [230, 220, 196]);
        set(nx, y, [255, 200, 90]);
        set(nx, y - 1, [255, 240, 170]);
      }
    }
  }
  c.putImageData(img, 0, 0);
}
