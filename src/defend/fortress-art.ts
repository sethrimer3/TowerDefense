/** The walking fortresses as they are drawn, in the city's pixel art at 8
 * sprite pixels a cell, inside crisp black outlines and lit from the upper
 * left:
 *
 * - **The walker:** a castle seen from above with its front face below:
 *   crenellated walls of ashlar round a courtyard (timber decking for the
 *   Bastion, flagstones for the Fortress and Citadel, an iron grate over
 *   embers for the Colossus), a raised central tower holding the core (an
 *   iron hatch while any armor stands, a pulsing red heart once bared),
 *   a pennant in each tier's colour, arrow slits and a portcullis in the
 *   front face, moss on the older stone, cracks and soot once it is hurt,
 *   and iron spikes and glowing runes on the Colossus.
 * - **Legs:** jointed iron limbs with stone feet and claws, striding in
 *   turn as it walks (and the walker bobbing with them).
 * - **Armor plates:** riveted iron strips down the side walls, dented when hurt.
 * - **Turrets:** round crenellated gun towers whose barrels swing to what
 *   they last shot at, with a muzzle flash as they fire.
 * - **Lost parts:** charred sockets (and broken stumps for legs) trailing
 *   smoke.
 *
 * Presentation only: sprites are baked once per look; the stride, aim and
 * smoke read the sim and battle time and never draw from a random stream. */
import { ENEMIES } from "./catalog.ts";
import type { Brush } from "./battle-art.ts";
import { hash01 } from "./grid.ts";
import { pixels, shade, sprite, type Pix } from "./damage-art.ts";
import type { DefendSim, Enemy } from "./sim.ts";

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

const lookOf = (e: Enemy) => LOOKS[ENEMIES[e.kind].fortress!.tier - 1];

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

/** A ring of crenels along a rectangle's edge: merlons lit, gaps dark. */
function crenels(p: Pix, x: number, y: number, w: number, h: number, tones: readonly number[], spike: boolean) {
  const at = (i: number, j: number, n: number) => {
    const merlon = n % 4 < 2;
    p.set(i, j, merlon ? (spike ? (n % 4 === 0 ? IRON[3] : IRON[2]) : n % 4 === 0 ? tones[3] : tones[2]) : tones[0]);
  };
  for (let i = 0; i < w; i++) { at(x + i, y, i); at(x + i, y + h - 1, i + 1); }
  for (let j = 1; j < h - 1; j++) { at(x, y + j, j); at(x + w - 1, y + j, j + 1); }
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
function bodyPixels(tier: number, w: number, h: number, armored: boolean, hurt: boolean, flag: number, seed: number): Uint32Array {
  const out = new Uint32Array(w * h);
  const p = pixels(out, w, h);
  const look = LOOKS[tier - 1], s = look.stone;
  const face = 4 + (tier > 2 ? 1 : 0);
  const top = h - face;
  box(p, 0, 0, w, h, OUTLINE);
  // The walls seen from above, a crenellated ring round the courtyard.
  ashlar(p, 1, 1, w - 2, top - 1, [s[1], s[2], s[2], s[3]], seed * 7 + 1, 5);
  crenels(p, 1, 1, w - 2, top - 1, s, look.runes);
  // The courtyard, in the shadow of the walls along its top and left.
  const cx = 4, cy = 4, cw = w - 8, ch = top - 7;
  box(p, cx - 1, cy - 1, cw + 2, ch + 2, s[0]);
  deck(p, cx, cy, cw, ch, look, seed);
  for (let i = 0; i < cw; i++) p.set(cx + i, cy, shade(p.get(cx + i, cy), 0.6));
  for (let j = 1; j < ch; j++) p.set(cx, cy + j, shade(p.get(cx, cy + j), 0.6));
  // Corner bastions: round towers at the four corners of the wall.
  for (const [bx, by] of [[1, 1], [w - 6, 1], [1, top - 5], [w - 6, top - 5]]) {
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
      const edge = (i === 0 || i === 4) && (j === 0 || j === 4);
      if (edge) continue;
      const rim = i === 0 || i === 4 || j === 0 || j === 4;
      p.set(bx + i, by + j, rim ? ((i + j) % 2 ? s[0] : look.runes ? IRON[3] : s[3]) : i + j < 4 ? s[2] : s[1]);
    }
    p.set(bx + 2, by + 2, s[0]);
  }
  // The central tower over the core, casting its shadow down and right.
  const k = 8 + 2 * Math.min(2, tier - 1);
  const kx = Math.round((w - k) / 2), ky = Math.round((top - k) / 2);
  for (let j = 1; j <= 2; j++) for (let i = 0; i < k; i++) {
    p.set(kx + i + j, ky + k - 1 + j, shade(p.get(kx + i + j, ky + k - 1 + j), 0.55));
    p.set(kx + k - 1 + j, ky + i + j - 1, shade(p.get(kx + k - 1 + j, ky + i + j - 1), 0.55));
  }
  box(p, kx - 1, ky - 1, k + 2, k + 2, OUTLINE);
  ashlar(p, kx, ky, k, k, s.map(c => shade(c, 1.1)), seed * 7 + 3, 3);
  crenels(p, kx, ky, k, k, s.map(c => shade(c, 1.1)), look.runes);
  box(p, kx + 2, ky + 2, k - 4, k - 4, OUTLINE);
  const hx = kx + 3, hy = ky + 3, hk = k - 6;
  if (armored) {
    // An iron hatch, banded across, riveted at the corners.
    box(p, hx, hy, hk, hk, IRON[2]);
    for (let i = 0; i < hk; i++) { p.set(hx + i, hy, IRON[3]); p.set(hx + i, hy + hk - 1, IRON[1]); p.set(hx + hk - 1, hy + i, IRON[1]); }
    const mid = hx + (hk >> 1);
    for (let j = 0; j < hk; j++) p.set(mid, hy + j, IRON[1]);
    for (const [i, j] of [[0, 0], [hk - 1, 0], [0, hk - 1], [hk - 1, hk - 1]]) p.set(hx + i, hy + j, IRON[4]);
  } else {
    // The bared heart: a red crystal with a white glint.
    box(p, hx, hy, hk, hk, 0x2a0608);
    const c = (hk - 1) / 2;
    for (let j = 0; j < hk; j++) for (let i = 0; i < hk; i++) {
      const d = Math.abs(i - c) + Math.abs(j - c);
      if (d > c + 0.5) continue;
      p.set(hx + i, hy + j, d > c - 0.5 ? 0x7a1018 : i + j < hk - 1 ? 0xff6a5e : 0xc8242c);
    }
    p.set(hx + Math.floor(c) - 1 + (hk > 4 ? 0 : 1), hy + Math.floor(c) - 1 + (hk > 4 ? 0 : 1), 0xffe2d8);
  }
  // A pennant on the tower's corner, waving between two frames.
  const px0 = kx + k - 1, py0 = ky - 1;
  for (let j = 0; j < 4; j++) p.set(px0, py0 - j + 1, 0x3a2a1c);
  for (let j = 0; j < 2; j++) for (let i = 1; i <= 3; i++) {
    const dy = flag && i === 3 ? 1 : 0;
    p.set(px0 + i, py0 - 2 + j + dy, j === 0 ? shade(look.accent, 1.2) : look.accent);
  }
  // The front face: ashlar courses with arrow slits and a portcullis.
  ashlar(p, 1, top, w - 2, face - 1, s, seed * 7 + 5, 4);
  for (let i = 1; i < w - 1; i++) p.set(i, top, s[3]);
  for (let i = 1; i < w - 1; i++) p.set(i, h - 2, shade(p.get(i, h - 2), 0.7));
  const gw = 4 + (tier > 2 ? 2 : 0), gx = Math.round((w - gw) / 2);
  box(p, gx - 1, top + 1, gw + 2, face - 1, OUTLINE);
  for (let j = top + 2; j < h - 1; j++) for (let i = 0; i < gw; i++) p.set(gx + i, j, i % 2 ? 0x1a1418 : IRON[2]);
  for (let i = 0; i < gw; i++) p.set(gx + i, top + 2, IRON[3]);
  for (let x = 4; x < w - 4; x += 5) {
    if (x + 1 >= gx - 2 && x <= gx + gw + 1) continue;
    p.set(x, top + 1, OUTLINE); p.set(x, top + 2, look.runes ? look.accent : OUTLINE);
  }
  if (look.runes) {
    // Runes cut in the face and the wall, glowing.
    for (let i = 3; i < w - 3; i += 3) if (hash01(seed, i, 9) < 0.5 && (i < gx - 1 || i > gx + gw)) p.set(i, h - 3, i % 2 ? 0xff7a3a : 0xffb04a);
  }
  // Moss on the older stone.
  if (look.moss) for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const c = p.get(i, j);
    if ((c === s[1] || c === s[2] || c === s[0]) && hash01(seed, i, j, 3) < 0.07) p.set(i, j, hash01(i, j, seed) < 0.5 ? 0x4f6a2e : 0x6d8a3a);
  }
  // Cracks and soot once hurt.
  if (hurt) {
    for (let n = 0; n < 3 + tier; n++) {
      let x = 2 + Math.floor(hash01(seed, n, 11) * (w - 4)), y = 2 + Math.floor(hash01(seed, n, 12) * (h - 4));
      for (let step = 0; step < 4 + tier; step++) {
        p.set(x, y, OUTLINE);
        x += hash01(seed, n, step) < 0.5 ? 1 : -1;
        y += hash01(seed, step, n) < 0.6 ? 1 : 0;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) break;
      }
    }
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++)
      if (hash01(seed, i, j, 5) < 0.12) p.set(i, j, shade(p.get(i, j), 0.65));
  }
  return out;
}

/** A turret seen from above, 7 × 7: a round crenellated tower top. */
function turretPixels(tier: number, hurt: boolean, seed: number): Uint32Array {
  const out = new Uint32Array(49);
  const p = pixels(out, 7, 7);
  const s = LOOKS[tier - 1].stone;
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
    const d = (i - 3) * (i - 3) + (j - 3) * (j - 3);
    if (d > 10) continue;
    if (d > 5) { p.set(i, j, OUTLINE); continue; }
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
function armorPixels(tier: number, hurt: boolean, seed: number): Uint32Array {
  const out = new Uint32Array(40);
  const p = pixels(out, 4, 10);
  const dark = tier === 4;
  const t = dark ? [0x1c1a22, 0x34303c, 0x55506a, 0x8a84a0] : [IRON[0], IRON[1], IRON[2], IRON[3]];
  box(p, 0, 0, 4, 10, OUTLINE);
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
function legPixels(tier: number, lifted: boolean, left: boolean): Uint32Array {
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
    set(i, y - 1, OUTLINE); set(i, y, IRON[3]); set(i, y + 1, IRON[1]); set(i, y + 2, OUTLINE);
  }
  // The knee, a riveted joint.
  for (let j = 1; j < 5; j++) for (let i = 4; i < 8; i++) set(i, j - lift, (i === 4 || i === 7 || j === 1 || j === 4) ? OUTLINE : j === 2 && i === 5 ? IRON[4] : IRON[2]);
  // The foot: a block of stone with claws reaching out.
  for (let j = 3; j < 7; j++) for (let i = 6; i < 11; i++) {
    const y = j - lift;
    const rim = i === 6 || i === 10 || j === 3 || j === 6;
    set(i, y, rim ? OUTLINE : j === 4 ? s[3] : i === 9 ? s[1] : s[2]);
  }
  for (const j of [4, 5]) set(10, j - lift, IRON[3]);
  return out;
}

/** What the renderer remembers of each walker and turret. */
const walked = new WeakMap<Enemy, { x: number; y: number; d: number }>();
const aims = new WeakMap<Enemy, { x: number; y: number }>();

function draw(c: CanvasRenderingContext2D, cv: HTMLCanvasElement | null, x: number, y: number, s: number) {
  if (cv) c.drawImage(cv, Math.round(x), Math.round(y), Math.round(cv.width * s), Math.round(cv.height * s));
}

function flashOver(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number) {
  if (f <= 0) return;
  c.fillStyle = `rgba(255,244,224,${Math.min(0.75, f * 6)})`;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Smoke curling up from a lost part. */
function smoke(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, id: number) {
  for (let k = 0; k < 3; k++) {
    const age = (t * 0.6 + k / 3 + hash01(id, k)) % 1;
    const sx = x + Math.sin(t * 2 + k * 2.1 + id) * s * 1.5 * age, sy = y - age * s * 10;
    const r = Math.max(1, Math.round(s * (1 + age * 1.5)));
    c.fillStyle = `rgba(${age < 0.2 ? "70,58,52" : "120,112,108"},${(1 - age) * 0.5})`;
    c.fillRect(Math.round(sx - r / 2), Math.round(sy - r / 2), r, r);
  }
}

/** Draws a walking fortress and all its parts (the parts' own turns draw
 * nothing). */
export function drawFortress({ c, px }: Brush, e: Enemy, sim: DefendSim) {
  if (e.fortressPart) return;
  const def = ENEMIES[e.kind], fort = def.fortress!, look = lookOf(e);
  const s = px / ART, t = sim.time;
  const w = Math.round(def.size * ART), h = Math.round(fort.height * ART);
  const seed = e.id % 4;
  // How far it has walked, which drives the stride.
  let m = walked.get(e);
  if (!m) walked.set(e, (m = { x: e.x, y: e.y, d: 0 }));
  m.d += Math.sqrt((e.x - m.x) * (e.x - m.x) + (e.y - m.y) * (e.y - m.y));
  m.x = e.x; m.y = e.y;
  const phase = m.d * 4;
  const bob = Math.sin(phase * 2) > 0.6 ? s : 0;
  const parts = e.fortressParts ?? [];
  const legs = parts.filter(q => q.fortressPart!.role === "leg");
  const x0 = e.x * px - (w * s) / 2, y0 = e.y * px - (h * s) / 2 + bob;
  c.imageSmoothingEnabled = false;

  // Legs first, so the body stands over their hips.
  legs.forEach((leg, n) => {
    const left = leg.fortressPart!.dx < 0;
    const ly = (e.y + leg.fortressPart!.dy) * px - 4 * s;
    const lx = left ? x0 - 8 * s : x0 + (w - 3) * s;
    if (leg.hp <= 0) {
      // A broken stump under a wisp of smoke.
      c.fillStyle = "#120e12";
      c.fillRect(Math.round(left ? x0 - 3 * s : x0 + w * s), Math.round(ly + 2 * s), Math.round(3 * s), Math.round(3 * s));
      c.fillStyle = "#4c4a58";
      c.fillRect(Math.round(left ? x0 - 2 * s : x0 + w * s), Math.round(ly + 3 * s), Math.round(2 * s), Math.round(s));
      return;
    }
    const lifted = Math.sin(phase + (n % 2) * Math.PI + Math.floor(n / 2) * 0.9) > 0.35;
    draw(c, sprite(`fl:${fort.tier}:${lifted ? 1 : 0}:${left ? 1 : 0}`, 11, 8, () => legPixels(fort.tier, lifted, left)), lx, ly, s);
    flashOver(c, lx, ly, 11 * s, 8 * s, leg.flash);
  });

  // The body.
  const armored = parts.some(q => q.hp > 0 && q.fortressPart!.role === "armor");
  const hurt = e.hp / e.maxHp < 0.5;
  const flag = Math.floor(t * 3 + e.id) % 2;
  draw(c, sprite(`fb:${fort.tier}:${armored ? 1 : 0}:${hurt ? 1 : 0}:${flag}:${seed}`, w, h, () => bodyPixels(fort.tier, w, h, armored, hurt, flag, seed)), x0, y0, s);
  if (!armored) {
    // The bared heart throbs.
    const a = 0.25 + 0.2 * Math.sin(t * 6 + e.id);
    const r = (4 + fort.tier) * s;
    const top = h - (4 + (fort.tier > 2 ? 1 : 0));
    const hy = y0 + (top / 2) * s;
    c.fillStyle = `rgba(255,70,60,${a})`;
    // A stepped diamond of light round it.
    for (let k = 0; k < 3; k++) {
      const rw = r * (1 - k * 0.3), rh = r * (0.4 + k * 0.3);
      c.fillRect(Math.round(e.x * px - rw), Math.round(hy - rh), Math.round(rw * 2), Math.round(rh * 2));
    }
  }
  flashOver(c, x0, y0, w * s, h * s, e.flash);

  // Armor on the walls, then the turrets.
  const order = [...parts.filter(q => q.fortressPart!.role === "armor"), ...parts.filter(q => q.fortressPart!.role === "turret")];
  for (const q of order) {
    const role = q.fortressPart!.role;
    const qx = (e.x + q.fortressPart!.dx) * px, qy = (e.y + q.fortressPart!.dy) * px + bob;
    if (q.hp <= 0) {
      // A charred socket with a broken bolt or two.
      const r = 2 * s;
      c.fillStyle = "#120e12";
      c.fillRect(Math.round(qx - r), Math.round(qy - r), Math.round(r * 2), Math.round(r * 2));
      c.fillStyle = "#2a2028";
      c.fillRect(Math.round(qx - r + s), Math.round(qy - r + s), Math.round(r * 2 - 2 * s), Math.round(r * 2 - 2 * s));
      c.fillStyle = "#76748a";
      c.fillRect(Math.round(qx - r), Math.round(qy - r), Math.round(s), Math.round(s));
      c.fillRect(Math.round(qx + r - s), Math.round(qy + r - s), Math.round(s), Math.round(s));
      if (Math.sin(t * 5 + q.id) > 0) {
        c.fillStyle = "#ff8a3a";
        c.fillRect(Math.round(qx - s), Math.round(qy), Math.round(s), Math.round(s));
      }
      smoke(c, qx, qy - r, s, t, q.id);
      continue;
    }
    const qhurt = q.hp / q.maxHp < 0.5;
    if (role === "armor") {
      const ax = qx - 2 * s, ay = qy - 5 * s;
      draw(c, sprite(`fa:${fort.tier}:${qhurt ? 1 : 0}:${q.id % 3}`, 4, 10, () => armorPixels(fort.tier, qhurt, q.id % 3)), ax, ay, s);
      flashOver(c, ax, ay, 4 * s, 10 * s, q.flash);
      continue;
    }
    const tx = qx - 3.5 * s, ty = qy - 3.5 * s;
    draw(c, sprite(`ft:${fort.tier}:${qhurt ? 1 : 0}:${q.id % 3}`, 7, 7, () => turretPixels(fort.tier, qhurt, q.id % 3)), tx, ty, s);
    // The barrel swings to whatever it last shot at.
    let aim = aims.get(q);
    if (q.cd > 1.5) {
      for (let i = sim.effects.length - 1; i >= 0; i--) {
        const fx = sim.effects[i];
        if (fx.kind !== "boom" || fx.seed !== q.id) continue;
        const dx = fx.x - q.x, dy = fx.y - q.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        aims.set(q, (aim = { x: dx / d, y: dy / d }));
        break;
      }
    }
    const ax = aim?.x ?? 0, ay = aim?.y ?? 1;
    const recoil = q.cd > 1.85 ? 1 : 0;
    const cx = tx + 3 * s, cy = ty + 3 * s;
    const dot = (i: number, grow: number, color: string) => {
      c.fillStyle = color;
      c.fillRect(Math.round(cx + Math.round(ax * i) * s - grow * s), Math.round(cy + Math.round(ay * i) * s - grow * s), Math.round(s * (1 + grow * 2)), Math.round(s * (1 + grow * 2)));
    };
    for (let i = 1; i <= 4 - recoil; i++) dot(i, 0.5, "#120e12");
    for (let i = 1; i <= 3 - recoil; i++) dot(i, 0, i === 1 ? "#b4b2c4" : "#4c4a58");
    if (q.cd > 1.75) {
      dot(5, 0.5, "#ffb357");
      dot(5, 0, "#fff0cf");
      dot(6, 0, "#ff7a2a");
    }
    flashOver(c, tx, ty, 7 * s, 7 * s, q.flash);
  }
  if (hurt) smoke(c, x0 + w * s * 0.3, y0 + s * 3, s, t, e.id);
}
