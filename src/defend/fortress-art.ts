import { drawFortressLegs, drawFortressGun, fortressBodyY } from "./fortress-motion-art.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels, type ArtPiece } from "./sprite-source.ts";
/** Overhead fortress decks at eight art pixels per cell. Motion, jointed
 * legs and aiming weapons live in fortress-motion-art.ts. Legacy component
 * source names remain available to artists; no simulation RNG is consumed. */
import { ENEMIES } from "./catalog.ts";
import type { Brush } from "./battle-art.ts";
import { hash01 } from "./grid.ts";
import { pixels as rawPixels, shade, sprite, type Pix } from "./damage-art.ts";
import type { DefendSim, Enemy } from "./sim.ts";

/** Damage lines and joints may mark filled material, never grow a body. */
function pixels(out:Uint32Array,w:number,h:number):Pix {
  const p=rawPixels(out,w,h),put=p.set;
  p.set=(x,y,c)=>{if(c===OUTLINE && [p.get(x-1,y),p.get(x+1,y),p.get(x,y-1),p.get(x,y+1)].some(v=>v<0))return;put(x,y,c);};
  return p;
}
const ART = 8;
const OUTLINE = 0x120e12;
const IRON = [0x2c2a33, 0x4c4a58, 0x76748a, 0xb4b2c4, 0xe4e2ec];

type Look = {
  stone: readonly number[];
  deck: "planks" | "flags" | "grate";
  deckTones: readonly number[];
  accent: number;
  moss: boolean;
  runes: boolean;
};

/** Per tier: the Bastion, the Fortress, the Citadel, the Colossus. */
const LOOKS: readonly Look[] = [
  { stone: [0x4e3a2a, 0x7a5e44, 0xa3815c, 0xcfae80], deck: "planks", deckTones: [0x3e2818, 0x5e3e24, 0x7c5632, 0x9a6e40], accent: 0xd8a640, moss: true, runes: false },
  { stone: [0x3e3838, 0x625a58, 0x8a807a, 0xb6aa9c], deck: "flags", deckTones: [0x403a36, 0x5a524c, 0x726860, 0x8c8076], accent: 0xb8342c, moss: true, runes: false },
  { stone: [0x2e2838, 0x4c4460, 0x70688a, 0x9a92b4], deck: "flags", deckTones: [0x2c2836, 0x3e3a4c, 0x524c64, 0x6a6280], accent: 0x4a7ad0, moss: false, runes: false },
  { stone: [0x18131c, 0x2c2432, 0x443a4c, 0x62566c], deck: "grate", deckTones: [0x120e14, 0x2a2430, 0xff5a1e, 0xffb04a], accent: 0xe8402a, moss: false, runes: true },
];


/** A filled rectangle of one colour. */
function box(p: Pix, x: number, y: number, w: number, h: number, c: number) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) p.set(i, j, c);
}

/** Stone courses: bricks `bw` long and 2 rows tall, offset each course,
 * each lit along its top, shaded along its bottom, with mortar between. */
function ashlar(p: Pix, x: number, y: number, w: number, h: number, tones: readonly number[], seed: number, bw = 4) {
  for (let j = 0; j < h; j++) {
    const course = Math.floor(j / 2), top = j % 2 === 0;
    for (let i = 0; i < w; i++) {
      const k = i + (course % 2 ? bw >> 1 : 0);
      const brick = Math.floor(k / bw);
      if (k % bw === bw - 1) { p.set(x + i, y + j, tones[0]); continue; }
      const v = hash01(seed, brick, course);
      const base = v < 0.3 ? tones[1] : tones[2];
      p.set(x + i, y + j, top ? (k % bw === 0 ? tones[3] : shade(base, 1.12)) : base);
    }
  }
}

/** The courtyard floor. */
function deck(p: Pix, x: number, y: number, w: number, h: number, look: Look, seed: number) {
  const t = look.deckTones;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let c: number;
    if (look.deck === "planks") {
      const board = Math.floor(j / 2), seam = (i + board * 5) % 9 === 0;
      c = j % 2 === 1 ? t[0] : seam ? t[1] : hash01(seed, board, 1) < 0.5 ? t[2] : t[3];
      if (!seam && j % 2 === 0 && (i + board * 5) % 9 === 1 && hash01(seed, i, j) < 0.6) c = 0x2a1a10;
    } else if (look.deck === "flags") {
      const fx = Math.floor((i + (Math.floor(j / 3) % 2) * 2) / 4), fy = Math.floor(j / 3);
      const mortar = (i + (fy % 2) * 2) % 4 === 3 || j % 3 === 2;
      const v = hash01(seed, fx, fy);
      c = mortar ? t[0] : v < 0.33 ? t[1] : v < 0.8 ? t[2] : t[3];
      if (!mortar && (i + (fy % 2) * 2) % 4 === 0 && j % 3 === 0) c = shade(c, 1.15);
    } else {
      const bar = i % 3 === 0 || j % 3 === 0;
      const glow = hash01(seed, Math.floor(i / 3), Math.floor(j / 3));
      c = bar ? (i % 3 === 0 && j % 3 === 0 ? IRON[2] : t[1]) : glow < 0.1 ? t[3] : glow < 0.3 ? t[2] : glow < 0.6 ? 0x6a1c10 : 0x2a0e0c;
    }
    p.set(x + i, y + j, c);
  }
}

/** The walker's body, `w` × `h` sprite pixels (the core's footprint). */
function drawnFortressBodyPixels(tier: number, w: number, h: number, armored: boolean, hurt: boolean, flag: number, seed: number): Uint32Array {
  const out = new Uint32Array(w * h), p = pixels(out, w, h);
  const look = LOOKS[tier - 1], tones = look.stone;
  // A strict overhead stone platform: symmetric parapets, no hanging front face.
  box(p, 0, 0, w, h, tones[1]);
  ashlar(p, 1, 1, w - 2, h - 2, tones, seed, 4);
  const rim = w < 16 ? 2 : 3;
  box(p, rim, rim, w - rim * 2, h - rim * 2, tones[0]);
  deck(p, rim + 1, rim + 1, w - rim * 2 - 2, h - rim * 2 - 2, look, seed);
  for (let x = 0; x < w; x++) {
    p.set(x, 0, x % 4 < 2 ? tones[3] : tones[0]);
    p.set(x, h - 1, x % 4 < 2 ? tones[2] : tones[0]);
  }
  for (let y = 1; y < h - 1; y++) {
    p.set(0, y, y % 4 < 2 ? tones[3] : tones[0]);
    p.set(w - 1, y, y % 4 < 2 ? tones[2] : tones[0]);
  }
  // A bolted central deck plate, not an independently vulnerable heart.
  const plate = Math.max(2, Math.floor(Math.min(w, h) / 3)), cx = Math.floor((w - plate) / 2), cy = Math.floor((h - plate) / 2);
  box(p, cx, cy, plate, plate, IRON[1]);
  for (let n = 0; n < plate; n++) { p.set(cx + n, cy, IRON[2]); p.set(cx, cy + n, IRON[2]); }
  p.set(cx + 1, cy + 1, look.accent);
  if (hurt) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++)
    if (hash01(seed, x, y) < .09) p.set(x, y, shade(p.get(x, y), .55));
  return out;
}

/** A turret seen from above, 7 × 7: a round crenellated tower top. */
function drawnTurretPixels(tier: number, hurt: boolean, seed: number): Uint32Array {
  const out = new Uint32Array(49);
  const p = pixels(out, 7, 7);
  const s = LOOKS[tier - 1].stone;
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
    const d = (i - 3) * (i - 3) + (j - 3) * (j - 3);
    if (d > 10) continue;
    if (d > 5) continue;
    if (d > 1) {
      const gap = (i === 3 || j === 3) && d === 4;
      p.set(i, j, gap ? s[0] : i + j < 5 ? s[3] : i + j > 7 ? s[1] : s[2]);
      continue;
    }
    p.set(i, j, d === 1 ? 0x1c161c : IRON[3]);
  }
  if (hurt) for (let n = 0; n < 3; n++) {
    const i = 1 + Math.floor(hash01(seed, n) * 5), j = 1 + Math.floor(hash01(n, seed) * 5);
    if (p.get(i, j) >= 0 && p.get(i, j) !== OUTLINE) p.set(i, j, OUTLINE);
  }
  return out;
}

/** An armor plate, 4 × 10: a riveted iron strip down the wall's face. */
function drawnArmorPixels(tier: number, hurt: boolean, seed: number): Uint32Array {
  const out = new Uint32Array(40);
  const p = pixels(out, 4, 10);
  const dark = tier === 4;
  const t = dark ? [0x1c1a22, 0x34303c, 0x55506a, 0x8a84a0] : [IRON[0], IRON[1], IRON[2], IRON[3]];
  for (let j = 1; j < 9; j++) { p.set(1, j, t[3]); p.set(2, j, j === 5 ? t[1] : t[2]); }
  p.set(1, 8, t[1]); p.set(2, 1, t[3]);
  for (const j of [2, 7]) p.set(2, j, IRON[4]);
  if (dark) { p.set(2, 3, 0xff6a2a); p.set(1, 6, 0xffa04a); }
  if (hurt) for (let n = 0; n < 3; n++) p.set(1 + Math.floor(hash01(seed, n, 2) * 2), 1 + Math.floor(hash01(seed, n, 3) * 8), n % 2 ? t[0] : IRON[4]);
  return out;
}

/** A leg sticking out to the right, 11 × 8 (mirrored for the left):
 * the hip joint under the wall, a thigh, the knee, and a clawed stone
 * foot, planted with its shadow or lifted mid-stride. */
function drawnLegPixels(tier: number, lifted: boolean, left: boolean): Uint32Array {
  const W = 11, H = 8;
  const out = new Uint32Array(W * H);
  const p = pixels(out, W, H);
  const s = LOOKS[tier - 1].stone;
  const set = (x: number, y: number, c: number) => p.set(left ? W - 1 - x : x, y, c);
  const lift = lifted ? 1 : 0;
  // The shadow of a planted foot.
  if (!lifted) for (let i = 5; i < 11; i++) set(i, 7, 0x0a080a);
  // Thigh: an iron strut from the hip to the knee.
  for (let i = 0; i < 6; i++) {
    const y = 2 + (i >> 2) - (lifted && i > 3 ? 1 : 0);
    set(i, y, IRON[3]); set(i, y + 1, IRON[1]);
  }
  // The knee, a riveted joint.
  for (let j = 2; j < 4; j++) for (let i = 5; i < 7; i++) set(i, j - lift, j === 2 && i === 5 ? IRON[4] : IRON[2]);
  // The foot: a block of stone with claws reaching out.
  for (let j = 3; j < 7; j++) for (let i = 6; i < 11; i++) {
    const y = j - lift;
    const rim = i === 6 || i === 10 || j === 3 || j === 6;
    if (!rim) set(i, y, j === 4 ? s[3] : i === 9 ? s[1] : s[2]);
  }
  for (const j of [4, 5]) set(10, j - lift, IRON[3]);
  return out;
}

export function fortressBodyPixels(tier: number,w: number,h: number,armored: boolean,hurt: boolean,flag: number,seed: number) {
  return sourcePixels(ART_NAMES.enemy(`fortress-${tier}`,`body-${w}x${h}-${armored ? "armored" : "bare"}-${hurt ? "hurt" : "whole"}-${flag}`),w,h,()=>drawnFortressBodyPixels(tier,w,h,armored,hurt,flag,seed));
}
export function turretPixels(tier: number,hurt: boolean,seed: number) {
  return sourcePixels(ART_NAMES.enemy(`fortress-${tier}`,`turret-${hurt ? "hurt" : "whole"}-${seed}`),7,7,()=>drawnTurretPixels(tier,hurt,seed));
}
export function armorPixels(tier: number,hurt: boolean,seed: number) {
  return sourcePixels(ART_NAMES.enemy(`fortress-${tier}`,`armor-${hurt ? "hurt" : "whole"}-${seed}`),4,10,()=>drawnArmorPixels(tier,hurt,seed));
}
export function legPixels(tier: number,lifted: boolean,left: boolean) {
  return sourcePixels(ART_NAMES.enemy(`fortress-${tier}`,`leg-${lifted ? "lifted" : "planted"}-${left ? "left" : "right"}`),11,8,()=>drawnLegPixels(tier,lifted,left));
}
export function fortressPieces(): ArtPiece[] {
  const out: ArtPiece[]=[];
  for(let tier=1;tier<=4;tier++){
    for(const [w,h] of Object.values(ENEMIES).filter(d=>d.fortress?.tier===tier && !d.blightFortress).map(d=>[Math.round(d.size*ART),Math.round(d.fortress!.height*ART)]))for(const armored of [false,true])for(const hurt of [false,true])for(let flag=0;flag<2;flag++){
      const name=ART_NAMES.enemy(`fortress-${tier}`,`body-${w}x${h}-${armored ? "armored" : "bare"}-${hurt ? "hurt" : "whole"}-${flag}`);
      out.push({name,w,h,about:`Walking fortress tier ${tier}`,pixels:()=>fortressBodyPixels(tier,w,h,armored,hurt,flag,0)});
    }
    for(const hurt of [false,true])for(let seed=0;seed<3;seed++)for(const part of ["turret","armor"]){
      out.push({name:ART_NAMES.enemy(`fortress-${tier}`,`${part}-${hurt ? "hurt" : "whole"}-${seed}`),w:part==="turret"?7:4,h:part==="turret"?7:10,about:`Fortress ${part}`,pixels:()=>part==="turret"?turretPixels(tier,hurt,seed):armorPixels(tier,hurt,seed)});
    }
    for(const lifted of [false,true])for(const left of [false,true])out.push({name:ART_NAMES.enemy(`fortress-${tier}`,`leg-${lifted ? "lifted" : "planted"}-${left ? "left" : "right"}`),w:11,h:8,about:"Fortress leg",pixels:()=>legPixels(tier,lifted,left)});
  }
  return out;
}

function draw(c: CanvasRenderingContext2D, cv: HTMLCanvasElement | null, x: number, y: number, s: number) {
  if (cv) c.drawImage(cv, Math.round(x), Math.round(y), Math.round(cv.width * s), Math.round(cv.height * s));
}

/** Draws a walking fortress and all its parts (the parts' own turns draw
 * nothing). */
export function drawFortress({ c, px }: Brush, e: Enemy, _sim?: DefendSim, reduceMotion = false) {
  if (e.fortressPart) return;
  const def = ENEMIES[e.kind], fort = def.fortress!;
  const s = px / ART, scale = px * (fort.partScale ?? 1);
  const w = Math.round(def.size * ART), h = Math.round(fort.height * ART);
  const bodyY = fortressBodyY(e, px, reduceMotion), x0 = e.x * px - w * s / 2, y0 = bodyY - h * s / 2;
  c.save(); c.fillStyle = "rgba(0,0,0,.28)";
  // Shadow is translucent and stays beneath the articulated legs.
  CanvasRenderingContext2D.prototype.fillRect.call(c, x0 + scale * .1, e.y * px - h * s / 2 + scale * .15, w * s, h * s);
  drawFortressLegs({ c, px }, e, reduceMotion);
  const hurt = e.hp / e.maxHp < .5, seed = e.id % 4;
  draw(c, sprite(`fb:${fort.tier}:${w}:${h}:1:${hurt ? 1 : 0}:0:${seed}`, w, h,
    () => fortressBodyPixels(fort.tier, w, h, true, hurt, 0, seed), false), x0, y0, s);
  for (const part of e.fortressParts ?? []) if (part.fortressPart?.role === "turret") {
    if (part.hp > 0) drawFortressGun({ c, px }, part, scale);
    else {
      c.fillStyle = "#27242a"; c.fillRect(part.x * px - scale * .19, part.y * px - scale * .19, scale * .38, scale * .38);
    }
  }
  if (e.flash > 0) {
    c.fillStyle = `rgba(255,238,211,${Math.min(.18, e.flash * 1.5)})`;
    c.fillRect(x0, y0, w * s, h * s);
  }
  c.restore();
}
