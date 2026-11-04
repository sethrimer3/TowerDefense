import { drawPuffBody, drawPuffOutline } from "./puff-art.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { colorPixels, sourcePixels, type ArtPiece } from "./sprite-source.ts";
import { spriteCanvas } from "./damage-art.ts";
import { onPixelArt } from "./pixel-sprites.ts";
import { skyArrowView } from "./archer-attunements.ts";
/** The battle's plain projectiles as pixel art at `ART` pixels a cell inside
 * the city's black outline, like the wizard's fire and the blasts:
 *
 * - **Arrows** (archers and archer towers): an iron head, an ash shaft and
 *   red-and-white fletching, baked once per one of `ARROW_DIRS` headings
 *   and drawn on the art lattice where the sim says each flies.
 * - **Javelins** (the javelineers'): a dark ash shaft with no fletching
 *   and a long iron head, baked per heading like the arrows.
 * - **Shots** (the ranged guilds' troops): a thrown stone, grey and lit
 *   from the upper left; a grenadier's explosive ball, black with a
 *   burning fuse spark. Each is a small outlined disc baked once.
 * - **Bullets** (every gun's, musket balls too): a pale yellow pixel with a
 *   fading orange-to-dark-red trail in a thin black outline, glowing orange
 *   at night (`bulletLights`).
 * - **Cannon shells:** an outlined iron ball with a glint, lifted along its
 *   arc over a dithered shadow on the ground, trailing three puffs of smoke.
 * - **Dragon breath:** the fire a dragon pours down at the city, puffs of
 *   the shared flame palette all inside one black outline.
 * - **Sparks:** a hit's chips, single art pixels flung out and cooling.
 *
 * All of it is presentation: it reads the sim and never changes it, and
 * draws no random numbers (the breath's spread hashes the dragon's id). */
import { hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { artPen, bake, blit, FLAME, OUTLINE, puff, SMOKE } from "./pixel-fx.ts";
import type { Arrow, DefendSim, Effect, Enemy } from "./sim.ts";
import type { CarriedLight } from "./lighting.ts";
import type { ReliefLight } from "./ground-relief.ts";

type Ctx = CanvasRenderingContext2D;

/** Headings an arrow is baked at. */
export const ARROW_DIRS = 16;
/** An arrow sprite's side, in art pixels: the drawn 7 × 7 and its outline. */
const ARROW_BOX = 9;
/** How far behind its head (the sim's point) an arrow's middle is drawn, in
 * cells. */
const ARROW_BACK = 0.4;

/** The arrow drawn by hand at the first three headings (right, then a
 * sixteenth and an eighth of a turn clockwise); the rest are these turned
 * and mirrored. H/h head, S/s shaft, F/R fletching. */
const ARROW_ART = [
  [".......", ".......", "FR...h.", "sSSSShH", "FR...h.", ".......", "......."],
  [".......", ".......", "RF.....", "FsS....", "...SSh.", ".....hH", "......."],
  [".......", ".RF....", ".Fs....", "...S...", "....Sh.", "....hH.", "......."],
];

/** A javelin at the same three headings: shaft the whole way, J/j its head. */
const JAVELIN_ART = [
  [".......", ".......", ".......", "sSSSSjJ", ".......", ".......", "......."],
  [".......", ".......", "sS.....", "..SS...", "....Sj.", "......J", "......."],
  ["s......", ".S.....", "..S....", "...S...", "....j..", ".....J.", "......."],
];

/** How many puffs make a dragon's breath, and how far it reaches, in cells. */
const BREATH_PUFFS = 18;
const BREATH_REACH = 4.6;

const C = {
  head: "#d9dde2",
  headLo: "#8a9099",
  shaft: "#c79a5e",
  shaftLo: "#8c6236",
  fletch: "#f2ead2",
  fletchRed: "#c23a2a",
  iron: "#2c2a2e",
  ironLo: "#1b1a1d",
  ironHi: "#8c8c96",
  shadow: "rgba(12,8,6,0.4)",
};

/** The heading nearest a direction, 0 pointing right, turning clockwise. */
export function arrowDir(dx: number, dy: number) {
  const a = Math.atan2(dy, dx);
  return ((Math.round((a / (Math.PI * 2)) * ARROW_DIRS) % ARROW_DIRS) + ARROW_DIRS) % ARROW_DIRS;
}

/** One arrow's pixels at heading `dir`: a `ARROW_BOX`² grid of palette
 * colours, outline included ("" where clear). Pure, for tests. */
export function arrowPixels(dir: number, javelin = false): string[] {
  const n = ARROW_BOX;
  const key: Record<string, string> = javelin ? { J: C.head, j: C.headLo, S: C.shaftLo, s: "#5a3d22" } : { H: C.head, h: C.headLo, S: C.shaft, s: C.shaftLo, F: C.fletch, R: C.fletchRed };
  // Which hand-drawn heading, and how to turn its (x, y) into this one's.
  let base = dir, turn = (x: number, y: number) => [x, y];
  if (dir > 8) {
    const up = arrowTurn(16 - dir);
    base = up.base;
    turn = (x, y) => { const [tx, ty] = up.turn(x, y); return [tx, 6 - ty]; };
  } else ({ base, turn } = arrowTurn(dir));
  const px: string[] = new Array(n * n).fill("");
  const art = (javelin ? JAVELIN_ART : ARROW_ART)[base];
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const ch = art[y][x];
      if (ch === ".") continue;
      const [tx, ty] = turn(x, y);
      px[(ty + 1) * n + tx + 1] = key[ch];
    }
  return px;
}

/** Headings 0 to 8 from the three drawn ones: past an eighth of a turn the
 * drawing is transposed (mirrored in the diagonal), past a quarter also
 * mirrored left to right. */
function arrowTurn(dir: number): { base: number; turn: (x: number, y: number) => number[] } {
  if (dir <= 2) return { base: dir, turn: (x, y) => [x, y] };
  if (dir <= 4) return { base: 4 - dir, turn: (x, y) => [y, x] };
  const r = arrowTurn(8 - dir);
  return { base: r.base, turn: (x, y) => { const [tx, ty] = r.turn(x, y); return [6 - tx, ty]; } };
}

function paint(px: string[], w: number, h: number, name?: string, outline = true) {
  const data = colorPixels(px);
  return spriteCanvas(name ? sourcePixels(name,w,h,()=>data) : data,w,h,undefined,outline ? {} : false);
}

const arrowSprites: HTMLCanvasElement[] = [], javelinSprites: HTMLCanvasElement[] = [];
function arrowSprite(dir: number, javelin = false) {
  if (javelin) return (javelinSprites[dir] ??= paint(arrowPixels(dir, true), ARROW_BOX, ARROW_BOX, ART_NAMES.projectile("javelin",dir)));
  return (arrowSprites[dir] ??= paint(arrowPixels(dir), ARROW_BOX, ARROW_BOX, ART_NAMES.projectile("arrow",dir)));
}

/** Arrows in flight, pointing where they fly (from where they were loosed
 * once they reach the target). */
export function drawArrows(c: Ctx, px: number, sim: DefendSim, reduced = false) {
  if (!sim.arrows.length) return;
  c.imageSmoothingEnabled = false;
  for (const a of sim.arrows) {
    if(a.sky){
      const v=skyArrowView(a,reduced);if(!v || v.alpha<=0)continue;
      c.save();c.globalAlpha=v.alpha;
      blit(c,px,arrowSprite(v.up?12:4),Math.round(v.x*ART-ARROW_BOX/2),Math.round(v.y*ART-ARROW_BOX/2));c.restore();continue;
    }
    if (a.shot === "bullet" || (a.shot === "ball" && !a.grenade)) {
      drawBullet(c, px, a);
      continue;
    }
    if (a.shot && a.shot !== "javelin") {
      const s = shotSprite(a.shot);
      blit(c, px, s.cv, Math.round(a.x * ART - s.size / 2), Math.round(a.y * ART - s.size / 2));
      continue;
    }
    let dx = a.bowJavelin?.ux ?? a.tx - a.x, dy = a.bowJavelin?.uy ?? a.ty - a.y;
    if (dx * dx + dy * dy < 1e-4 && a.origin) (dx = a.x - a.origin.x), (dy = a.y - a.origin.y);
    const d = Math.hypot(dx, dy) || 1;
    const dir = arrowDir(dx, dy);
    const fan=a.volleyIndex===undefined?0:(a.volleyIndex%2?1:-1)*Math.ceil(a.volleyIndex/2)*.12;
    const mx = a.x - (dx / d) * ARROW_BACK - dy/d*fan, my = a.y - (dy / d) * ARROW_BACK + dx/d*fan;
    blit(c, px, arrowSprite(dir, a.shot === "javelin"), Math.round(mx * ART - ARROW_BOX / 2), Math.round(my * ART - ARROW_BOX / 2));
  }
}

/** A gun's bullet (gunners, machine and Gatling gunners, snipers, musket
 * balls but the grenadiers'): one pale yellow art pixel trailing
 * `BULLET_TRAIL` pixels back the way it came, orange through dark orange
 * to dark red, fading out, all inside a half-art-pixel black outline that
 * fades with them. Baked per heading and trail length at two pixels an art
 * pixel. */
export const BULLET_HEAD = "#fff3a6";
export const BULLET_TRAIL = ["#ffa436", "#ff8a24", "#e0661c", "#c24a16", "#902616", "#6c1610"];
const BULLET_SIDE = 2 * BULLET_TRAIL.length + 1;
const bulletSprites = new Map<number, HTMLCanvasElement>();

/** A bullet's half-art-pixel cells, `n` each way (the trail's box and the
 * outline round it), as [r, g, b, a] for heading `dir` of `ARROW_DIRS` with
 * `len` trail pixels. Pure, for tests. */
export function bulletPixels(dir: number, len: number): { data: Uint8ClampedArray<ArrayBuffer>; n: number } {
  const mid = BULLET_TRAIL.length, n = 2 * BULLET_SIDE + 2;
  const ang = (dir / ARROW_DIRS) * Math.PI * 2, ux = Math.cos(ang), uy = Math.sin(ang);
  const m = Math.max(Math.abs(ux), Math.abs(uy)), sx = ux / m, sy = uy / m;
  // Art pixels, head first; a pixel the trail rounds onto twice keeps the brighter.
  const body = new Map<number, { rgb: number[]; a: number }>();
  const put = (ax: number, ay: number, color: string, a: number) => {
    const k = ay * BULLET_SIDE + ax;
    if (!body.has(k)) body.set(k, { rgb: [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)), a });
  };
  put(mid, mid, BULLET_HEAD, 1);
  for (let i = 1; i <= len; i++) put(mid - Math.round(i * sx), mid - Math.round(i * sy), BULLET_TRAIL[i - 1], 1 - i / (BULLET_TRAIL.length + 1));
  const data = new Uint8ClampedArray(n * n * 4), ink = new Float32Array(n * n);
  for (const [k, p] of body) {
    const hx = 1 + 2 * (k % BULLET_SIDE), hy = 1 + 2 * Math.floor(k / BULLET_SIDE);
    for (let y = hy - 1; y <= hy + 2; y++) for (let x = hx - 1; x <= hx + 2; x++) ink[y * n + x] = Math.max(ink[y * n + x], p.a);
  }
  for (let i = 0; i < n * n; i++) if (ink[i] > 0) data[i * 4 + 3] = Math.round(ink[i] * 255);
  for (const [k, p] of body) {
    const hx = 1 + 2 * (k % BULLET_SIDE), hy = 1 + 2 * Math.floor(k / BULLET_SIDE);
    for (let y = hy; y < hy + 2; y++) for (let x = hx; x < hx + 2; x++) {
      const o = (y * n + x) * 4;
      data[o] = p.rgb[0]; data[o + 1] = p.rgb[1]; data[o + 2] = p.rgb[2]; data[o + 3] = Math.round(p.a * 255);
    }
  }
  return { data, n };
}

function bulletSprite(dir: number, len: number) {
  const key = dir * 16 + len;
  let cv = bulletSprites.get(key);
  if (!cv) {
    const { data, n } = bulletPixels(dir, len), b = bake(n, n);
    b.c.putImageData(new ImageData(data, n, n), 0, 0);
    bulletSprites.set(key, (cv = b.cv));
  }
  return cv;
}

/** Where a bullet came from on its current leg. */
const bulletFrom = (a: Arrow) => a.chain?.from ?? a.origin;

function drawBullet(c: Ctx, px: number, a: Arrow) {
  const from = bulletFrom(a);
  let dx = a.tx - a.x, dy = a.ty - a.y, flown = BULLET_TRAIL.length;
  if (from) {
    const fx = a.x - from.x, fy = a.y - from.y, d = Math.hypot(fx, fy);
    flown = Math.floor(d * ART);
    if (d > 1e-3) (dx = fx), (dy = fy);
  }
  if (dx * dx + dy * dy < 1e-8) dx = 1;
  const len = Math.max(0, Math.min(BULLET_TRAIL.length, flown));
  const cv = bulletSprite(arrowDir(dx, dy), len), u = px / ART;
  // The head on the art lattice; the sprite's cells are half art pixels.
  const hx = Math.round(a.x * ART - 0.5), hy = Math.round(a.y * ART - 0.5), o = BULLET_TRAIL.length + 0.5;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(cv, (hx - o) * u, (hy - o) * u, (cv.width / 2) * u, (cv.height / 2) * u);
  c.restore();
}

/** Most bullets that light the night at once. */
const BULLET_LIGHTS = 40;

/** The bullets' small orange glow, lighting the dark round them. */
export function bulletLights(sim: DefendSim): { carried: CarriedLight[]; relief: ReliefLight[] } {
  const carried: CarriedLight[] = [], relief: ReliefLight[] = [];
  for (const a of sim.arrows) {
    if (carried.length >= BULLET_LIGHTS) break;
    if (a.shot !== "bullet" && !(a.shot === "ball" && !a.grenade)) continue;
    carried.push({ x: a.x, y: a.y, id: ((a.origin?.attacker ?? 0) * 31 + a.target * 7) % 100000, r: 1.1, k: 0.55 });
    relief.push({ x: a.x, y: a.y, r: 1.3, k: 0.5, color: "#ff8a2e" });
  }
  return { carried, relief };
}

/** A shot's pixels: a disc `d` art pixels across in its outline, lit from
 * the upper left (`hi` the glint, `lo` the shaded side), and an optional
 * spark on its top right. Pure, for tests. */
export function shotPixels(shot: Shot): { px: string[]; size: number } {
  const [d, base, lo, hi] = SHOTS[shot];
  const size = d + 2, mid = (size - 1) / 2, r = d / 2;
  const px: string[] = new Array(size * size).fill("");
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const ox = x - mid, oy = y - mid;
      if (ox * ox + oy * oy > r * r + 0.01) continue;
      px[y * size + x] = ox + oy < -r * 0.5 ? hi : ox + oy > r * 0.4 ? lo : base;
    }
  const out = px;
  if (shot === "ball") out[size - 1] = "#ffd060";
  // A rocket's exhaust flaring out behind it, lower left.
  if (shot === "rocket") (out[(size - 1) * size] = "#ffd060"), (out[(size - 2) * size] = "#ff7a2e"), (out[(size - 1) * size + 1] = "#ff7a2e");
  return { px: out, size };
}
const SHOTS: Record<Shot, [number, string, string, string]> = {
  stone: [2, "#8c8577", "#5c574e", "#c9c2b2"],
  bullet: [1, "#e0c070", "#b08a3e", "#fff4c8"],
  ball: [3, "#2c2a2e", "#1b1a1d", "#8c8c96"],
  rocket: [2, "#b3372f", "#6e1c18", "#e8dcc0"],
};
type Shot = Exclude<NonNullable<Arrow["shot"]>, "javelin">;
const shotSprites = new Map<string, { cv: HTMLCanvasElement; size: number }>();
function shotSprite(shot: Shot) {
  let s = shotSprites.get(shot);
  if (!s) {
    const p = shotPixels(shot);
    shotSprites.set(shot, (s = { cv: paint(p.px, p.size, p.size,ART_NAMES.projectile(shot)), size: p.size }));
  }
  return s;
}

/** A cannon ball's pixels: an iron disc `d` art pixels across in its
 * outline, lit from the upper left. Pure, for tests. */
export function ballPixels(d: number): { px: string[]; size: number } {
  const size = d + 2, mid = (size - 1) / 2, r = d / 2;
  const px: string[] = new Array(size * size).fill("");
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const ox = x - mid, oy = y - mid;
      if (ox * ox + oy * oy > r * r) continue;
      const glint = Math.round(ox + r * 0.45) === 0 && Math.round(oy + r * 0.45) === 0;
      px[y * size + x] = glint ? C.ironHi : ox + oy > r * 0.6 ? C.ironLo : C.iron;
    }
  return { px, size };
}

/** Its dithered shadow: an ellipse, every other pixel at the rim. */
function shadowPixels(d: number) {
  const w = d + 2, h = Math.ceil(d / 2) + 2;
  const px: string[] = new Array(w * h).fill("");
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ox = (x - (w - 1) / 2) / (w / 2), oy = (y - (h - 1) / 2) / (h / 2);
      const q = ox * ox + oy * oy;
      if (q <= 0.55 || (q <= 1 && (x + y) % 2 === 0)) px[y * w + x] = C.shadow;
    }
  return { px, w, h };
}

const balls = new Map<number, { cv: HTMLCanvasElement; size: number; shadow: HTMLCanvasElement; sw: number; sh: number }>();
function ballSprite(d: number) {
  let s = balls.get(d);
  if (!s) {
    const b = ballPixels(d), sh = shadowPixels(d);
    s = { cv: paint(b.px, b.size, b.size,ART_NAMES.projectile("cannon-ball",d)), size: b.size, shadow: paint(sh.px, sh.w, sh.h,undefined,false), sw: sh.w, sh: sh.h };
    balls.set(d, s);
  }
  return s;
}

/** Where a shell is a fraction `k` of its flight: on the ground (gx, gy)
 * and lifted (lift cells up) on its arc. */
function shellAt(sh: DefendSim["shells"][number], k: number) {
  const gx = sh.x0 + (sh.x1 - sh.x0) * k, gy = sh.y0 + (sh.y1 - sh.y0) * k;
  const lift = Math.sin(Math.PI * k) * (0.8 + Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0) * 0.12);
  return { gx, gy, lift };
}

/** Cannon shells: an iron ball arcing over its shadow, trailing smoke. */
export function drawShells(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.shells.length) return;
  c.imageSmoothingEnabled = false;
  const dot = artPen(c, px);
  for (const sh of sim.shells) {
    const k = sh.t / sh.dur;
    const { gx, gy, lift } = shellAt(sh, k);
    const ball = ballSprite(sh.r > 2.1 ? 5 : 4);
    blit(c, px, ball.shadow, Math.round(gx * ART - ball.sw / 2), Math.round(gy * ART - ball.sh / 2));
    for (let n = 3; n >= 1; n--) {
      const t = shellAt(sh, Math.max(0, k - n * 0.07));
      const s = n < 3 ? 2 : 1;
      c.fillStyle = SMOKE[3];
      c.globalAlpha = 0.8 - n * 0.2;
      dot(Math.round(t.gx * ART - s / 2), Math.round((t.gy - t.lift) * ART - s / 2), s, s);
    }
    c.globalAlpha = 1;
    blit(c, px, ball.cv, Math.round(gx * ART - ball.size / 2), Math.round((gy - lift) * ART - ball.size / 2));
  }
}

/** A dragon's breath, drawn like the wizard tower's fire: puffs poured
 * along `breath`'s aim, white hot at the jaws, turning yellow, orange and
 * red as they spread, then smoke at the far end, all inside one black
 * outline, with embers flicking off; fading in as it starts. */
export function drawBreath(c: Ctx, px: number, e: Enemy, time: number) {
  if (!e.breath) return;
  const { dx, dy, t } = e.breath;
  const dot = artPen(c, px);
  const flick = Math.floor(time * 15);
  const puffs: { x: number; y: number; r: number; tone: number }[] = [];
  const embers: { x: number; y: number; tone: number }[] = [];
  for (let n = 0; n < BREATH_PUFFS; n++) {
    // Each puff slides out along the jet as the flicker turns over.
    const along = ((n + (time * 15 - flick)) / BREATH_PUFFS) * BREATH_REACH + 0.3;
    const k = along / BREATH_REACH;
    const spread = (hash01(e.id, n, flick) - 0.5) * (0.2 + k * 1.3);
    const x = e.x + dx * along - dy * spread, y = e.y + dy * along + dx * spread;
    const tone = k < 0.12 ? 4 : k < 0.3 ? 3 : k < 0.55 ? 2 : k < 0.8 ? 1 : 0;
    puffs.push({ x: Math.round(x * ART), y: Math.round(y * ART), r: Math.round(1 + k * 2.4 + hash01(e.id, n, flick, 1)), tone });
    if (hash01(e.id, n, flick, 2) < 0.3)
      embers.push({ x: Math.round((x + (hash01(e.id, n, 3) - 0.5) * 0.9) * ART), y: Math.round((y - k * 0.4) * ART), tone: k < 0.5 ? 4 : 3 });
  }
  c.save();
  c.globalAlpha = Math.min(1, t / 0.2);
  for (const p of puffs) drawPuffOutline(c,px,p.x,p.y,p.r,FLAME[p.tone]);
  // Coolest first, so the white-hot core shows through.
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    c.fillStyle = FLAME[p.tone];
    drawPuffBody(c,px,p.x,p.y,p.r,FLAME[p.tone]);
    if (p.tone < 4 && p.r > 0) {
      c.fillStyle = FLAME[p.tone + 1];
      dot(p.x - p.r + 1, p.y - p.r + 1, p.r, 1);
      dot(p.x - p.r + 1, p.y - p.r + 1, 1, p.r);
    }
  }
  for (const m of embers) {
    c.fillStyle = FLAME[m.tone];
    dot(m.x, m.y);
  }
  c.restore();
}

/** A hit's sparks: four art pixels flung out from the point, cooling from
 * white to ember as they fade. */
export function drawSparks(c: Ctx, px: number, fx: Effect) {
  const k = fx.t / 0.6;
  const dot = artPen(c, px);
  c.save();
  c.globalAlpha = Math.max(0, 1 - k);
  c.fillStyle = FLAME[Math.max(1, 4 - Math.floor(k * 4))];
  for (let n = 0; n < 4; n++) {
    const a = n * 1.57 + fx.x;
    dot(Math.round((fx.x + Math.cos(a) * k * 0.6) * ART), Math.round((fx.y + Math.sin(a) * k * 0.6 + k * k * 0.3) * ART));
  }
  c.restore();
}

export function projectilePieces(): ArtPiece[] {
  const out: ArtPiece[]=[];
  for (let dir=0;dir<ARROW_DIRS;dir++) for (const javelin of [false,true]) out.push({name:ART_NAMES.projectile(javelin ? "javelin" : "arrow",dir),w:ARROW_BOX,h:ARROW_BOX,about:`${javelin ? "Javelin" : "Arrow"}, heading ${dir}`,pixels:()=>sourcePixels(ART_NAMES.projectile(javelin ? "javelin" : "arrow",dir),ARROW_BOX,ARROW_BOX,()=>colorPixels(arrowPixels(dir,javelin)))});
  for (const shot of Object.keys(SHOTS) as Shot[]) {
    const p=shotPixels(shot),name=ART_NAMES.projectile(shot);
    out.push({name,w:p.size,h:p.size,about:`${shot} projectile`,pixels:()=>sourcePixels(name,p.size,p.size,()=>colorPixels(shotPixels(shot).px))});
  }
  for(const d of [4,5]) {const p=ballPixels(d),name=ART_NAMES.projectile("cannon-ball",d);out.push({name,w:p.size,h:p.size,about:`Cannon shell, ${d} art pixels`,pixels:()=>sourcePixels(name,p.size,p.size,()=>colorPixels(ballPixels(d).px))});}
  return out;
}
onPixelArt(()=>{arrowSprites.length=javelinSprites.length=0;shotSprites.clear();balls.clear();});
