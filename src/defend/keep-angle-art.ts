/** The keep seen at a slant from the south, for Angle view (`angle-view.ts`):
 * `ANGLED_KEEP_W × ANGLED_KEEP_H` RGBA pixels at `ART` a cell, as tall as the
 * keep's lot plus its face (`faceDepth`), drawn lifted so its foot is the
 * lot's foot. The back curtain shows its wall walk and its inner face, the
 * side curtains their walks, the courtyard lies foreshortened between them,
 * the great tower rises in the middle under a hipped slate roof whose long
 * south slope faces the viewer below a short ridge, and the front curtain
 * shows its merlons and its whole south face with the gate, between two
 * round corner towers under conical caps. Lit from the upper left like the
 * rest; outline-free at its edge (the outline is drawn round it), with the
 * keep's own dark lines inside. At damage `stage` 1 to 4 soot, cracks, holes
 * and embers spread over it; damage only repaints, never clears. Pure. */
import { ART } from "./art-scale.ts";
import { hash } from "./grid.ts";

export const ANGLED_KEEP_W = 3 * ART;
/** The lot's three cells and the face below them (`faceDepth` of the keep). */
export const ANGLED_KEEP_H = 3 * ART + 11;

const C = {
  outline: 0x0b0907,
  merlon: 0xc9c2b2, crenel: 0x5c574e, walk: 0x9d968a, walkLit: 0xb0a99b, walkShade: 0x847e72,
  face: 0x6e685d, faceLit: 0x8b8578, faceDark: 0x58534b, mortar: 0x534f47, foot: 0x45413b,
  court: 0x6f6a60, courtLit: 0x7d786c, courtDark: 0x5f5a51, courtShade: 0x4d4942,
  roof: { n: 0x8f96a1, w: 0x7c838e, s: 0x5d636c, e: 0x494e57 }, ridge: 0x2a2d33, ridgeLit: 0xa3aab4,
  tower: 0x8a8478, towerLit: 0x9b9588, towerDark: 0x6d685e,
  cap: [0x3a3e45, 0x50555e, 0x6c727c, 0x8b929d], finial: 0xd8b572,
  door: 0x6b4a2c, doorDark: 0x4a321e, slit: 0x1c1712,
  soot: 0x2e2925, hole: 0x15110e, ember: 0xc8542a, emberHot: 0xf0a040,
};

const rgba = (c: number) => ((255 << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
const shade = (c: number, f: number) => {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 0xff) * f)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export function angledKeepPixels(stage = 0): Uint32Array {
  const W = ANGLED_KEEP_W, H = ANGLED_KEEP_H, out = new Uint32Array(W * H);
  const col = new Int32Array(W * H).fill(-1);
  const set = (x: number, y: number, c: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    col[y * W + x] = c;
  };
  // Masonry: courses every three rows, joints staggered every four pixels.
  const masonry = (x: number, y: number, base: number, top: number) => {
    const k = y - top;
    if (k % 3 === 2) return C.mortar;
    if ((x + (Math.floor(k / 3) & 1) * 2) % 4 === 0) return shade(base, 0.9);
    return base;
  };

  // Back curtain: merlons, its walk, then its inner face looking south.
  for (let x = 1; x < W - 1; x++) {
    set(x, 1, x % 3 === 0 ? C.crenel : C.merlon);
    set(x, 2, C.walkLit);
    set(x, 3, C.walk);
    set(x, 4, C.outline);
    for (let y = 5; y <= 7; y++) set(x, y, masonry(x, y, y === 5 ? C.faceDark : C.face, 5));
  }
  // The courtyard, foreshortened, shaded under the back wall.
  for (let y = 8; y <= 21; y++)
    for (let x = 4; x < W - 4; x++) {
      const r = hash(x, y, 431) % 7;
      set(x, y, y === 8 || x === 4 ? C.courtShade : r === 0 ? C.courtLit : r === 1 ? C.courtDark : C.court);
    }
  // Side curtains: their walks run down to the front.
  for (let y = 1; y <= 22; y++) {
    set(1, y, y % 3 === 0 ? C.crenel : C.merlon);
    set(2, y, C.walkLit);
    set(3, y, C.walk);
    set(W - 4, y, C.walkShade);
    set(W - 3, y, C.walk);
    set(W - 2, y, y % 3 === 0 ? C.crenel : C.merlon);
  }
  // The great tower's south face, below its eaves.
  for (let y = 15; y <= 21; y++)
    for (let x = 7; x <= 16; x++) {
      if (x === 7 || x === 16) set(x, y, C.outline);
      else if (y === 15) set(x, y, C.ridge);
      else if ((x === 11 || x === 12) && y >= 17 && y <= 19) set(x, y, C.slit);
      else set(x, y, masonry(x, y, x <= 9 ? C.towerLit : x >= 14 ? C.towerDark : C.tower, 16));
    }
  // Its hipped roof from the south: a short north slope up to the ridge, a
  // long south slope down to the eaves facing the viewer, hips to the corners.
  const RT = 3, RB = 14, RL = 6, RR = 17, ridgeY = 6, ridgeL = 10, ridgeR = 13;
  const hipL = (y: number) => (y <= ridgeY ? RL + ((y - RT) * (ridgeL - RL)) / (ridgeY - RT) : ridgeL - ((y - ridgeY) * (ridgeL - RL)) / (RB - ridgeY));
  const hipR = (y: number) => (y <= ridgeY ? RR - ((y - RT) * (RR - ridgeR)) / (ridgeY - RT) : ridgeR + ((y - ridgeY) * (RR - ridgeR)) / (RB - ridgeY));
  for (let y = RT; y <= RB; y++)
    for (let x = RL; x <= RR; x++) {
      if (y === RT || y === RB || x === RL || x === RR) { set(x, y, C.outline); continue; }
      const l = hipL(y), r = hipR(y);
      if (Math.abs(x - l) < 0.55) { set(x, y, y < ridgeY ? C.ridgeLit : C.ridge); continue; }
      if (Math.abs(x - r) < 0.55) { set(x, y, C.ridge); continue; }
      if (y === ridgeY && x > l && x < r) { set(x, y, C.ridgeLit); continue; }
      const face = x < l ? C.roof.w : x > r ? C.roof.e : y < ridgeY ? C.roof.n : C.roof.s;
      // Tile courses across the south slope, down the side slopes.
      const course = face === C.roof.s ? y % 2 === 0 : face === C.roof.n ? false : x % 2 === 0;
      set(x, y, course ? shade(face, 0.86) : face);
    }
  set(ridgeL, ridgeY - 1, C.finial);
  set(ridgeR, ridgeY - 1, C.finial);
  // Front curtain: its walk, merlons along its outer edge, then its south
  // face down to the ground with the gate in the middle.
  for (let x = 1; x < W - 1; x++) {
    set(x, 22, C.walkShade);
    set(x, 23, C.walk);
    set(x, 24, x % 3 === 0 ? C.crenel : C.merlon);
    set(x, 25, C.outline);
    for (let y = 26; y < H - 1; y++) set(x, y, masonry(x, y, y === 26 ? C.faceDark : C.face, 26));
    set(x, H - 1, C.foot);
  }
  // The gate: a dark arch with oak doors.
  for (let y = 28; y < H - 1; y++)
    for (let x = 9; x <= 14; x++) {
      const arch = y === 28 ? x >= 11 && x <= 12 : y === 29 ? x >= 10 && x <= 13 : true;
      if (!arch) continue;
      const edge = y === 28 || (y === 29 && (x === 10 || x === 13)) || x === 9 || x === 14;
      set(x, y, edge ? C.outline : x === 11 ? C.doorDark : x === 12 ? C.outline : C.door);
    }
  // Corner towers: the back pair's caps over the back corners, the front
  // pair standing whole, their round bodies down to the ground.
  const cap = (cx: number, cy: number, rx: number, ry: number, apex: number) => {
    // A cone: its base an ellipse round (cx, cy), its point `apex` rows up.
    for (let y = apex; y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = x + 0.5 - cx;
        const inBase = (dx / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
        const half = y < cy ? (rx * (y - apex + 0.5)) / (cy - apex) : rx;
        const inCone = y <= cy && Math.abs(dx) <= half;
        if (!inBase && !inCone) continue;
        const edge = (inBase && (dx / rx) ** 2 + ((y + 1.5 - cy) / ry) ** 2 > 1) || Math.abs(Math.abs(dx) - half) < 0.6 && y < cy && !inBase;
        if (edge) { set(x, y, C.outline); continue; }
        const lit = 1.5 - (dx / rx) * 1.5 + (y < cy ? 0.3 : 0);
        const k = Math.max(0, Math.min(3, Math.floor(lit + ((x + y) % 2 ? 0.25 : -0.25))));
        set(x, y, C.cap[k]);
      }
    set(Math.floor(cx - 0.5), apex, C.finial);
  };
  const body = (cx: number, top: number) => {
    for (let y = top; y < H - 1; y++)
      for (let x = cx - 4; x < cx + 4; x++) {
        if (x < 0 || x >= W) continue;
        if (x === cx - 4 || x === cx + 3) { set(x, y, C.outline); continue; }
        const i = x - (cx - 3), base = i <= 1 ? C.towerLit : i >= 5 ? C.towerDark : C.tower;
        set(x, y, masonry(x, y, base, top));
      }
    for (let x = cx - 3; x < cx + 3; x++) set(x, H - 1, C.foot);
  };
  cap(4, 4.5, 3.9, 2.2, 0);
  cap(W - 4, 4.5, 3.9, 2.2, 0);
  body(4, 23);
  body(W - 4, 23);
  set(4, 27, C.slit); set(4, 28, C.slit);
  set(W - 4, 27, C.slit); set(W - 4, 28, C.slit);
  cap(4, 22.5, 4, 2.4, 13);
  cap(W - 4, 22.5, 4, 2.4, 13);

  // Damage: soot first, then cracks, holes through roof and walls, embers.
  if (stage > 0)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = col[y * W + x];
        if (c < 0 || c === C.outline) continue;
        const h = hash(x, y, 433) % 100;
        if (stage >= 3 && h < (stage - 2) * 6 && hash(x >> 1, y >> 1, 434) % 3 === 0) col[y * W + x] = h % 3 ? C.hole : stage >= 4 && h % 2 ? C.emberHot : C.ember;
        else if (h < stage * 9) col[y * W + x] = shade(c, 0.6);
        else if (stage >= 2 && h < stage * 9 + 4) col[y * W + x] = C.soot;
      }
  for (let i = 0; i < W * H; i++) if (col[i] >= 0) out[i] = rgba(col[i]);
  return out;
}
