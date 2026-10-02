/** The houses' roofs as pixel art at `ART` pixels a cell, like the parks
 * and the keep: a crisp black outline round two slopes that meet at a dark
 * ridge along the long axis, the sunny (north or west) slope lighter, laid
 * in courses of staggered shingles, each a touch lighter or darker than its
 * neighbours. Each house is seeded from its lot, so the same house always
 * wears the same roof: some are kept up, others weathered, with missing
 * and patched shingles, moss creeping up from the eaves, rain streaks
 * below the gaps, and now and then a stone chimney.
 *
 * Presentation only; `roofPixels` is pure, and `roofSprite` caches the
 * canvases the city layer draws up to size with smoothing off. */
import { hash, hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { ROOFS } from "./structure-art.ts";

const OUTLINE = 0x0b0907;
const HOLE = 0x231c17;
const MOSS = [0x46542b, 0x5b6a35, 0x71803f];
const STONE = { lit: 0x9a9284, dark: 0x6c665c, flue: 0x2a221c };

/** Opaque little-endian RGBA for 0xRRGGBB, at `alpha`. */
const rgba = (c: number, alpha = 255) => ((alpha << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
const hex = (s: string) => parseInt(s.slice(1), 16);

/** `c` darkened (or lightened) by `f`. */
function shade(c: number, f: number) {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 0xff) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** `a` blended toward `b` by `t`. */
function mix(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** One house's roof, seeded by `seed`, as `(cw·ART) × (ch·ART)` RGBA pixels
 * filling its cells: a one-pixel gap round the edge, the roof inside its
 * outline, and a drop shadow one pixel to the lower right. */
export function roofPixels(cw: number, ch: number, variant: number, seed: number): Uint32Array {
  const W = cw * ART, H = ch * ART, out = new Uint32Array(W * H);
  const set = (x: number, y: number, c: number, a = 255) => (out[y * W + x] = rgba(c, a));
  // The house sits one pixel in from its cells; its shadow one further.
  const x0 = 1, y0 = 1, x1 = W - 3, y1 = H - 3;
  for (let y = y0 + 1; y <= y1 + 1; y++) for (let x = x0 + 1; x <= x1 + 1; x++) set(x, y, 0, 90);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, OUTLINE);

  // Work in roof coordinates: u along the ridge, v across it, over the
  // inside of the outline.
  const along = cw >= ch;
  const U = (along ? x1 - x0 : y1 - y0) - 1, V = (along ? y1 - y0 : x1 - x0) - 1;
  const put = (u: number, v: number, c: number) => (along ? set(x0 + 1 + u, y0 + 1 + v, c) : set(x0 + 1 + v, y0 + 1 + u, c));
  const ridge = Math.floor(V / 2);

  const base = hex(ROOFS[variant % ROOFS.length]);
  const slopes = [shade(base, 1.13), shade(base, 0.86)];
  // How weathered this roof is: a third are kept up, the rest wear more.
  const r = hash01(seed, 1);
  const wear = r < 0.33 ? 0 : (r - 0.33) * 1.5;
  const fresh = shade(mix(base, 0xd09060, 0.25), 1.18);

  // Shingles: courses two pixels deep counted from the ridge, three wide,
  // staggered course to course. Each pixel knows its shingle.
  const SW = 3;
  const shingle = (u: number, v: number) => {
    const d = v < ridge ? ridge - 1 - v : v - ridge - 1; // 0 next to the ridge
    const course = d >> 1;
    const side = v < ridge ? 0 : 1;
    const off = (course * 2 + side) % SW;
    return { side, course, row: d & 1, col: Math.floor((u + off) / SW), seam: (u + off) % SW === SW - 1, d };
  };
  const roll = (s: { side: number; course: number; col: number }, k: number) => hash01(seed, s.side, s.course, s.col, k);

  // Moss creeps up from the eaves of weathered roofs, mostly the shady side.
  const moss: { u: number; v: number; r: number }[] = [];
  const clumps = Math.floor(wear * 4 * hash01(seed, 2) + wear * 1.5);
  for (let k = 0; k < clumps; k++) {
    const shady = hash01(seed, 3, k) < 0.75;
    const v = shady ? V - 1 - Math.floor(hash01(seed, 4, k) * 2) : Math.floor(hash01(seed, 4, k) * 2);
    moss.push({ u: Math.floor(hash01(seed, 5, k) * U), v, r: 1.2 + hash01(seed, 6, k) * 1.6 });
  }
  const mossAt = (u: number, v: number) => {
    let best = 0;
    for (const m of moss) {
      const du = u - m.u, dv = (v - m.v) * 1.4, d = Math.sqrt(du * du + dv * dv);
      if (d < m.r) best = Math.max(best, 1 - d / m.r);
    }
    // Ragged edges: a checker dither where the clump thins.
    return best > 0.55 ? 2 : best > 0.25 ? 1 : best > 0 && (u + v) % 2 === 0 ? 1 : 0;
  };

  for (let v = 0; v < V; v++)
    for (let u = 0; u < U; u++) {
      if (v === ridge) {
        put(u, v, OUTLINE);
        continue;
      }
      const s = shingle(u, v);
      let c = slopes[s.side];
      const t = roll(s, 0);
      c = shade(c, t < 0.22 ? 0.9 : t > 0.8 ? 1.08 : 1);
      if (roll(s, 1) < wear * 0.05) c = fresh; // Patched with newer shingles.
      // A shingle's lower row sits in the shadow of the course above.
      if (s.row === 1) c = shade(c, 0.8);
      else if (s.seam) c = shade(c, 0.84);
      // The eave course, darkest where the slope meets the outline.
      if (v === 0 || v === V - 1) c = shade(c, 0.9);
      // Missing shingles show the dark battens beneath, with rain streaks
      // washed down the slope below them.
      const gone = roll(s, 2) < wear * 0.07 && s.d > 0;
      if (gone) c = s.row === 0 && !s.seam ? HOLE : shade(HOLE, 1.5);
      else {
        const above = shingle(u, s.side ? v - 2 : v + 2);
        const v2 = s.side ? v - 2 : v + 2;
        if (v2 !== ridge && v2 >= 0 && v2 < V && above.side === s.side && roll(above, 2) < wear * 0.07 && above.d > 0 && !s.seam) c = shade(c, 0.82);
      }
      const m = mossAt(u, v);
      if (m && !gone) c = mix(c, MOSS[s.row === 1 ? 0 : m], m === 2 ? 0.85 : 0.55);
      put(u, v, c);
    }

  // A chimney on some longer roofs: a stone stack in its own outline,
  // astride the ridge near a gable end, casting a pixel of shadow.
  if (U >= 12 && V >= 5 && hash01(seed, 7) < 0.3) {
    // Toward one gable end, never mid-roof.
    const end = 1 + Math.floor(hash01(seed, 8) * 2);
    const cu = hash01(seed, 10) < 0.5 ? end : U - 4 - end;
    const cv = ridge - 1 - (hash01(seed, 9) < 0.5 ? 1 : 0);
    for (let dv = 0; dv < 4; dv++)
      for (let du = 0; du < 4; du++) {
        const v = cv + dv, u = cu + du;
        if (v < 0 || v >= V) continue;
        const rim = du === 0 || dv === 0 || du === 3 || dv === 3;
        put(u, v, rim ? OUTLINE : du === 1 && dv === 1 ? STONE.lit : du === 2 && dv === 2 ? STONE.flue : STONE.dark);
      }
    // Its shadow falls one pixel to the east (or south) of the stack.
    for (let dv = 1; dv < 4; dv++) {
      const v = cv + dv, u = cu + 4;
      if (v !== ridge && v >= 0 && v < V && u < U) put(u, v, shade(slopes[v < ridge ? 0 : 1], 0.7));
    }
  }
  return out;
}

const sprites = new Map<string, HTMLCanvasElement>();

/** The roof for a house of `cw × ch` cells, seeded by `seed`, as a canvas
 * of art pixels (null outside a browser), cached by its inputs. */
export function roofSprite(cw: number, ch: number, variant: number, seed: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = `${cw},${ch},${variant},${seed}`;
  let cv = sprites.get(key);
  if (!cv) {
    if (sprites.size > 2000) sprites.clear();
    cv = document.createElement("canvas");
    cv.width = cw * ART;
    cv.height = ch * ART;
    const c = cv.getContext("2d")!;
    const img = c.createImageData(cv.width, cv.height);
    new Uint32Array(img.data.buffer).set(roofPixels(cw, ch, variant, seed));
    c.putImageData(img, 0, 0);
    sprites.set(key, cv);
  }
  return cv;
}

/** The seed a house's roof is drawn from: its lot, so it never changes. */
export const roofSeed = (x: number, y: number, w: number, h: number) => hash(x, y, w, h, 31);
