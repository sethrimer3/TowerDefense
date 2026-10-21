/** Ground weather drawn as pixel art beneath every combat silhouette. The
 * desert's dunes are one tiling sprite (`dunePixels`, baked once at `ART`
 * pixels a cell: terraced sand in a black outline) laid over the open ground
 * outside the city at the field's drift, recomposed only when the drift
 * moves a whole art pixel or the ground changes; sand blown into the city
 * and the Fungal Hollow's mist are painted at `RES` art pixels a cell, the
 * city's only over the cells holding any. Then the blowing grains and the
 * tumbleweeds, black-outlined sprites, over it. Presentation only: it reads
 * `sim.atmosphere` and changes nothing. */
import { CELLS_W, CELLS_H, CELL_COUNT, cellIndex, hash } from "./grid.ts";
import { DUNE_CREST, DUNE_PERIOD, duneAt, weatherNoise, type Atmosphere } from "./atmosphere.ts";
import { ART } from "./park-art.ts";
import { OUTLINE, artPen, bake, blit } from "./pixel-fx.ts";
import type { DefendSim } from "./sim.ts";

/** Art pixels a cell in the weather image. */
const RES = 4;
const W = CELLS_W * RES, H = CELLS_H * RES;
/** A tiling noise texture, so the image never calls the noise per pixel. */
const TEX = 64;
/** Ordered dither thresholds, for the thin edges of dunes and mist. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
/** Sand, shadowed to lit. */
const SAND = [[138, 92, 46], [176, 126, 66], [204, 158, 88], [226, 188, 116], [242, 214, 150]];
const OUTLINE_RGB = [OUTLINE.slice(1, 3), OUTLINE.slice(3, 5), OUTLINE.slice(5, 7)].map(h => parseInt(h, 16));
/** Dunes lower than this leave the floor bare between them. */
const BARE = .15;

/** The tiling dune sprite, `DUNE_PERIOD * ART` pixels square, RGBA: each
 * dune's windward rise shaded from its trough up to a lit band under the
 * crest, a black line along the crest, the slip face below it in shadow,
 * ripples running along the rise, sparse grain specks, and a black outline
 * where the sand gives way to bare floor. Tiles seamlessly; pure. */
export function dunePixels() {
  const n = DUNE_PERIOD * ART, kind = new Uint8Array(n * n), waves = new Float32Array(n * n);
  // 0 bare, 1 windward, 2 slip face.
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = duneAt((x + .5) / ART, (y + .5) / ART), i = y * n + x;
    waves[i] = d.wave;
    kind[i] = d.height < BARE ? 0 : d.wave < DUNE_CREST ? 1 : 2;
  }
  const at = (x: number, y: number) => kind[((y + n) % n) * n + ((x + n) % n)];
  // A slip-face pixel just over the crest (not one at the foot, by the trough).
  const over = (x: number, y: number) => {
    const j = ((y + n) % n) * n + ((x + n) % n);
    return kind[j] === 2 && waves[j] < DUNE_CREST + (1 - DUNE_CREST) * .5;
  };
  const out = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, k = i * 4, here = kind[i];
    if (!here) continue;
    const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
    let col: number[];
    if (!l || !r || !u || !d) col = OUTLINE_RGB;
    // The crest: the windward side's last pixel before the slip face.
    else if (here === 1 && (over(x - 1, y) || over(x + 1, y) || over(x, y + 1))) col = OUTLINE_RGB;
    else {
      const w = waves[i], grain = (hash(x, y, 77) % 100) / 100;
      let tone: number;
      if (here === 2) tone = w > DUNE_CREST + (1 - DUNE_CREST) * .75 + grain * .06 ? 1 : 0;
      else {
        const up = w / DUNE_CREST + (grain - .5) * .05;
        tone = up < .3 ? 1 : up < .62 ? 2 : up < .9 ? 3 : 4;
        // Ripples along the rise, broken here and there.
        if (tone > 1 && tone < 4 && Math.floor(up * 40) % 4 === 0 && hash(x >> 3, Math.floor(up * 10), 78) % 3) tone--;
      }
      const speck = hash(x, y, 79) % 29;
      if (speck === 0) tone++; else if (speck === 1) tone--;
      col = SAND[Math.max(0, Math.min(4, tone))];
    }
    out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = 255;
  }
  return { size: n, data: out };
}
let duneSprite: HTMLCanvasElement | null = null;
function dunes() {
  if (duneSprite) return duneSprite;
  const { size, data } = dunePixels(), cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d")!, image = c.createImageData(size, size);
  image.data.set(data);
  c.putImageData(image, 0, 0);
  return duneSprite = cv;
}

/** The mist's tint, and the brightest swirl in it. */
const MIST = [206, 214, 222], SPORE = [232, 196, 220];

let texture: Float32Array | null = null;
function noiseTexture() {
  if (texture) return texture;
  texture = new Float32Array(TEX * TEX);
  // Wrapping value noise: the lattice repeats every 8 texels.
  const period = 8, cell = TEX / period;
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const n = weatherNoise(x / cell, y / cell), wx = weatherNoise((x - TEX) / cell, y / cell);
    const ny = weatherNoise(x / cell, (y - TEX) / cell), wxy = weatherNoise((x - TEX) / cell, (y - TEX) / cell);
    const u = x / TEX, v = y / TEX;
    texture[y * TEX + x] = (n * (1 - u) + wx * u) * (1 - v) + (ny * (1 - u) + wxy * u) * v;
  }
  return texture;
}
const tex = (t: Float32Array, x: number, y: number) => t[((y & (TEX - 1)) * TEX) + (x & (TEX - 1))];

/** Bilinear weights between cell centres for each art pixel column (and,
 * the same way, row): the two cells either side and the share of the second. */
function axis(n: number, cells: number) {
  const a = new Int32Array(n), b = new Int32Array(n), w = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const f = (p + .5) / RES - .5, c0 = Math.max(0, Math.min(cells - 1, Math.floor(f)));
    a[p] = c0; b[p] = Math.min(cells - 1, c0 + 1); w[p] = Math.max(0, Math.min(1, f - c0));
  }
  return { a, b, w };
}
const XS = axis(W, CELLS_W), YS = axis(H, CELLS_H);

/** A field's value at art pixel (x, y), bilinear between cell centres. */
function sample(field: Float32Array, x: number, y: number) {
  const u = XS.w[x], v = YS.w[y], r0 = YS.a[y] * CELLS_W, r1 = YS.b[y] * CELLS_W, x0 = XS.a[x], x1 = XS.b[x];
  const top = field[r0 + x0] + (field[r0 + x1] - field[r0 + x0]) * u;
  const bottom = field[r1 + x0] + (field[r1 + x1] - field[r1 + x0]) * u;
  return top + (bottom - top) * v;
}

/** One tumbleweed frame, `size` art pixels across: a scraggly ring of twigs
 * with spokes turned by `angle`, in a black outline. */
export function tumbleweedPixels(angle: number, size = 11) {
  const r = (size - 3) / 2, c = (size - 1) / 2, px: (string | null)[] = new Array(size * size).fill(null);
  const spokes = 5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - c, dy = (y - c) / .9, d = Math.sqrt(dx * dx + dy * dy);
    if (d > r + .4) continue;
    const a = Math.atan2(dy, dx) - angle;
    const ring = d > r - 1.1 && ((Math.floor((a + 7) * 3) + x * 3 + y) % 4 !== 0);
    let spoke = false;
    for (let k = 0; k < spokes && !spoke; k++) {
      const s = angle + k * Math.PI * 2 / spokes + (k % 2) * .5;
      spoke = Math.abs(dx * Math.sin(s) - dy * Math.cos(s)) < .55 && dx * Math.cos(s) + dy * Math.sin(s) > -r * .3;
    }
    if (ring || spoke) px[y * size + x] = (x + y * 2) % 3 ? "#b08850" : "#d6b474";
  }
  // Outline every twig where it meets the air.
  const out = px.slice();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (px[y * size + x]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
      const nx = x + ox, ny = y + oy;
      return nx >= 0 && ny >= 0 && nx < size && ny < size && px[ny * size + nx];
    });
    if (near) out[y * size + x] = OUTLINE;
  }
  return { size, px: out };
}

/** Frames over a fifth of a turn, after which the five spokes repeat. */
const WEED_FRAMES = 6;
/** A tumbleweed's size in art pixels, about two cells. */
const WEED = 15;
let weedSprites: HTMLCanvasElement[] | null = null;
function weeds() {
  if (weedSprites) return weedSprites;
  weedSprites = [];
  for (let f = 0; f < WEED_FRAMES; f++) {
    const { size, px } = tumbleweedPixels(f * Math.PI * 2 / (WEED_FRAMES * 5), WEED);
    const { cv, c } = bake(size, size);
    for (let i = 0; i < px.length; i++) if (px[i]) { c.fillStyle = px[i]!; c.fillRect(i % size, Math.floor(i / size), 1, 1); }
    weedSprites.push(cv);
  }
  return weedSprites;
}

export class AtmosphereArt {
  /** City sand and mist, `RES` art pixels a cell. */
  private canvas: HTMLCanvasElement | null = null;
  private data: ImageData | null = null;
  private sim: DefendSim | null = null;
  private key = "";
  /** Art pixels of the city sand last painted, cleared before the next. */
  private painted: number[] = [];
  private shown = false;
  private misty = false;
  private slope = new Float32Array(CELL_COUNT);
  /** The dunes laid over the open ground, `ART` pixels a cell. */
  private dunes: HTMLCanvasElement | null = null;
  private duneKey = "";
  /** Which cells the dunes may cover, one pixel a cell, and what it was built from. */
  private mask: HTMLCanvasElement | null = null;
  private ground = new Uint8Array(CELL_COUNT);

  draw(c: CanvasRenderingContext2D, px: number, sim: DefendSim, reduceMotion: boolean, effects: boolean) {
    const env = sim.atmosphere;
    if (!env) return;
    c.save();
    c.imageSmoothingEnabled = false;
    if (env.mode === "sand") c.drawImage(this.composeDunes(env, sim, reduceMotion), 0, 0, CELLS_W * px, CELLS_H * px);
    const layer = this.layer(env, sim, reduceMotion, effects);
    if (layer) c.drawImage(layer, 0, 0, CELLS_W * px, CELLS_H * px);
    if (effects && env.mode === "sand") this.drawBlowing(c, px, env, reduceMotion);
    if (effects && env.mode === "mist" && !reduceMotion) this.drawSpores(c, px, env);
    c.restore();
  }

  /** The dune sprite tiled at the field's drift and cut to the open ground
   * outside the city: a handful of image copies, and only when the drift
   * has moved a whole art pixel (every couple of seconds) or the ground has
   * changed under it. */
  private composeDunes(env: Atmosphere, sim: DefendSim, reduceMotion: boolean) {
    const w = CELLS_W * ART, h = CELLS_H * ART;
    if (!this.dunes) {
      this.dunes = document.createElement("canvas");
      this.dunes.width = w; this.dunes.height = h;
      this.mask = document.createElement("canvas");
      this.mask.width = CELLS_W; this.mask.height = CELLS_H;
      this.ground.fill(2);
    }
    let changed = false;
    for (let i = 0; i < CELL_COUNT; i++) {
      const open = env.passage[i] === 1 && !sim.map.city[i] ? 1 : 0;
      if (open !== this.ground[i]) { this.ground[i] = open; changed = true; }
    }
    if (changed) {
      const m = this.mask!.getContext("2d")!, image = m.createImageData(CELLS_W, CELLS_H);
      for (let i = 0; i < CELL_COUNT; i++) image.data[i * 4 + 3] = this.ground[i] * 255;
      m.putImageData(image, 0, 0);
    }
    const tile = dunes(), size = tile.width;
    const ox = reduceMotion ? 0 : Math.round(env.drift.x * ART), oy = reduceMotion ? 0 : Math.round(env.drift.y * ART);
    const key = `${ox}:${oy}`;
    if (!changed && key === this.duneKey) return this.dunes;
    this.duneKey = key;
    const d = this.dunes.getContext("2d")!;
    d.globalCompositeOperation = "source-over";
    d.clearRect(0, 0, w, h);
    const sx = ((ox % size) + size) % size, sy = ((oy % size) + size) % size;
    for (let y = sy - size; y < h; y += size) for (let x = sx - size; x < w; x += size) d.drawImage(tile, x, y);
    d.globalCompositeOperation = "destination-in";
    d.imageSmoothingEnabled = false;
    d.drawImage(this.mask!, 0, 0, w, h);
    d.globalCompositeOperation = "source-over";
    return this.dunes;
  }

  /** Sand blown into the city and the mist, repainted at most four times a
   * simulated second; null while there is neither. */
  private layer(env: Atmosphere, sim: DefendSim, reduceMotion: boolean, effects: boolean) {
    const mist = env.mode === "mist" && effects;
    const key = mist ? `m${env.time.toFixed(2)}:${reduceMotion}` : `s${Math.floor(env.time * 4)}:${env.version > 0}`;
    if (sim === this.sim && key === this.key) return this.shown ? this.canvas : null;
    this.sim = sim; this.key = key;
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = W; this.canvas.height = H;
      this.data = this.canvas.getContext("2d")!.createImageData(W, H);
    }
    const out = this.data!.data;
    if (mist) { out.fill(0); this.painted.length = 0; this.paintMist(env, reduceMotion); this.shown = true; this.misty = true; }
    else {
      // Leaving the mist: clear it all, and upload the cleared image once.
      if (this.misty) { out.fill(0); this.misty = false; }
      const had = this.painted.length || this.shown;
      for (const k of this.painted) out[k + 3] = 0;
      this.painted.length = 0;
      this.paintCitySand(env, sim);
      this.shown = this.painted.length > 0;
      // Nothing was there and nothing is: the upload can be skipped.
      if (!had && !this.shown) return null;
    }
    this.canvas.getContext("2d")!.putImageData(this.data!, 0, 0);
    return this.shown ? this.canvas : null;
  }

  /** Sand inside the city, a pixel at a time but only over the cells near
   * any: thin sand breaks up into dithered drifts, deep sand covers the street. */
  private paintCitySand(env: Atmosphere, sim: DefendSim) {
    const out = this.data!.data, t = noiseTexture(), s = env.sand, slope = this.slope, wind = env.wind;
    const wl = Math.sqrt(wind.x * wind.x + wind.y * wind.y) || 1, rx = wind.x / wl, ry = wind.y / wl;
    const at = (x: number, y: number) => s[cellIndex(Math.max(0, Math.min(CELLS_W - 1, x)), Math.max(0, Math.min(CELLS_H - 1, y)))];
    for (let cy = 0; cy < CELLS_H; cy++) for (let cx = 0; cx < CELLS_W; cx++) {
      const i = cellIndex(cx, cy);
      if (!sim.map.city[i] || env.passage[i] !== 1) continue;
      if (Math.max(at(cx, cy), at(cx + 1, cy), at(cx - 1, cy), at(cx, cy + 1), at(cx, cy - 1)) <= .06) continue;
      slope[i] = (at(cx + 1, cy) - at(cx - 1, cy) + at(cx, cy + 1) - at(cx, cy - 1)) * .5;
      for (let y = cy * RES; y < cy * RES + RES; y++) for (let x = cx * RES; x < cx * RES + RES; x++) {
        const depth = sample(s, x, y);
        if (depth <= .06) continue;
        const dither = BAYER[(y & 3) * 4 + (x & 3)], grain = tex(t, x, y);
        const cover = (depth - .12) / .3 + (grain - .5) * .6;
        if (cover < dither) continue;
        const ripple = depth > .3 ? (((x * rx + y * ry) * .45 + grain * 2.2) % 3 + 3) % 3 : 1.5;
        let tone = 2 + Math.round(slope[i] * 6 + (grain - .5) * .8);
        if (ripple < .7) tone += 1; else if (ripple < 1.2) tone -= 1;
        if (cover < dither + .15) tone = Math.min(tone, 1);
        const col = SAND[Math.max(0, Math.min(4, tone))], k = (y * W + x) * 4;
        out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = 255;
        this.painted.push(k);
      }
    }
  }

  /** The mist, a pixel at a time. */
  private paintMist(env: Atmosphere, reduceMotion: boolean) {
    const out = this.data!.data, t = noiseTexture(), wind = env.wind;
    const drift = reduceMotion ? 0 : env.time;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = cellIndex((x / RES) | 0, (y / RES) | 0), k = (y * W + x) * 4;
      if (!env.passage[i]) continue;
      const air = sample(env.air, x, y);
      if (air < .02) continue;
      const dither = BAYER[(y & 3) * 4 + (x & 3)];
      // The swirl shifts the texture under it, so vortices visibly turn it.
      const ox = env.vx[i] * 6 + drift * (wind.x * 3 + 1.5), oy = env.vy[i] * 6 + drift * (wind.y * 3 + .6);
      const n = tex(t, Math.floor(x * .5 + ox), Math.floor(y * .5 + oy)) * .6 + tex(t, Math.floor(x * .25 - ox * .5 + 17), Math.floor(y * .25 - oy * .4 + 5)) * .4;
      const density = air * (.35 + n * 1.1);
      const level = Math.min(3, Math.floor(density * 3.2 + dither * .9));
      if (level <= 0) continue;
      const col = level === 3 ? SPORE : MIST;
      out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = [0, 34, 58, 84][level];
    }
  }

  /** Grains streaking along the wind, and the tumbleweeds bouncing past. */
  private drawBlowing(c: CanvasRenderingContext2D, px: number, env: Atmosphere, reduceMotion: boolean) {
    const dot = artPen(c, px), wind = env.wind;
    if (!reduceMotion) {
      for (let n = 0; n < env.grains.length; n++) {
        const p = env.grains[n];
        // Each simulated grain draws three: itself and two following it.
        for (let g = 0; g < 3; g++) {
          const ox = g ? ((n * 7 + g * 13) % 9) / 3 - 1.5 : 0, oy = g ? ((n * 5 + g * 11) % 9) / 3 - 1.5 : 0;
          const x = (p.x + ox) * ART, y = (p.y + oy) * ART;
          if (x < 0 || y < 0 || x >= CELLS_W * ART || y >= CELLS_H * ART) continue;
          c.fillStyle = (n + g) % 3 ? "rgba(236,204,140,.75)" : "rgba(196,150,86,.8)";
          dot(Math.round(x), Math.round(y));
          dot(Math.round(x - wind.x * 2), Math.round(y - wind.y * 2));
          if ((n + g) % 2) dot(Math.round(x - wind.x * 4), Math.round(y - wind.y * 4));
        }
      }
    }
    const frames = weeds();
    for (const p of env.weeds) {
      const turn = reduceMotion ? 0 : p.turn;
      const frame = frames[((Math.floor(turn * 2) % WEED_FRAMES) + WEED_FRAMES) % WEED_FRAMES];
      const hop = reduceMotion ? 0 : Math.abs(Math.sin(turn * 1.3)) * 3;
      const ax = Math.round(p.x * ART) - (WEED >> 1), ay = Math.round(p.y * ART) - WEED + 3;
      c.fillStyle = "rgba(40,24,10,.28)";
      dot(ax + 3, ay + WEED - 2, WEED - 6, 2);
      blit(c, px, frame, ax, ay - Math.round(hop));
    }
  }

  /** A few pink spores floating in the thickest mist. */
  private drawSpores(c: CanvasRenderingContext2D, px: number, env: Atmosphere) {
    const dot = artPen(c, px);
    c.fillStyle = "rgba(240,190,222,.7)";
    for (let n = 0; n < 90; n++) {
      const bx = ((n * 37) % CELLS_W) + .5, by = ((n * 53) % CELLS_H) + .5;
      const x = bx + Math.sin(env.time * .4 + n) * 1.5 + env.time * env.wind.x * .15, y = by + Math.cos(env.time * .3 + n * 1.7) * 1.5 + env.time * env.wind.y * .15;
      const wx = ((x % CELLS_W) + CELLS_W) % CELLS_W, wy = ((y % CELLS_H) + CELLS_H) % CELLS_H;
      if (env.air[cellIndex(wx | 0, wy | 0)] < .25) continue;
      dot(Math.round(wx * ART), Math.round(wy * ART));
    }
  }
}
