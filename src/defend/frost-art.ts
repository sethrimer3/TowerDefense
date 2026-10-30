import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels, hexColor, type ArtPiece } from "./sprite-source.ts";
import { pixels, sprite, drawSprite } from "./damage-art.ts";
/** The Frost nova as it is drawn, in the city's pixel art (`ART` pixels a
 * cell, snapped to whole screen pixels):
 *
 * - **Rime:** a ragged disc of hoarfrost on the ground, dithered pale blue
 *   thinning toward its edge, set with ice crystals in black outlines; baked
 *   once per size and seed, faded in as it forms and out as it melts. A
 *   wandering blizzard's rime also has snow whirling round it.
 * - **Bursts:** the nova's ring of ice crystals rushing out to its reach, and
 *   a shatter's shards flung from the one that broke.
 *
 * The frozen enemies themselves are drawn in their blocks of ice by
 * `wizard-art.ts`, as Rime's deep freeze is.
 *
 * Presentation only: it reads the sim and draws from hashes of the battle's
 * time and each patch's seed, never from a random stream. */
import { hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { OUTLINE, artPen, bake, blit } from "./pixel-fx.ts";
import { BURST_SHOW, type Rime } from "./frost-nova.ts";
import type { ReliefLight } from "./ground-relief.ts";
import type { DefendSim } from "./sim.ts";

type Ctx = CanvasRenderingContext2D;

/** Ice, darkest to brightest. */
export const FROST = ["#1b3a5c", "#3f7fb8", "#8fd0f0", "#d8f4ff", "#ffffff"];
/** Seconds the rime takes to form, and to melt away at the end. */
const FORM = 0.3, MELT = 1.5;

const patches = new Map<string, HTMLCanvasElement>();
/** A patch of rime `r` cells across from its middle (to the nearest art
 * pixel), patterned by `seed`. */
function rimeSprite(r: number, seed: number) {
  const R = Math.max(2, Math.round(r * ART)), variant = seed % 5;
  const key = `${R}:${variant}`;
  let cv = patches.get(key);
  if (cv) return cv;
  const d = 2 * R + 1;
  const { cv: canvas, c } = bake(d, d);
  const img = c.createImageData(d, d), data = img.data;
  const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const tones = FROST.map(hex), ink = hex(OUTLINE);
  const set = (x: number, y: number, rgb: number[], a: number) => {
    if (x < 0 || y < 0 || x >= d || y >= d) return;
    const i = (y * d + x) * 4;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = a;
  };
  // The frost: dense in the middle, broken up and dithered toward a ragged edge.
  for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
    const dx = x - R, dy = y - R, k = Math.sqrt(dx * dx + dy * dy) / R;
    const edge = 0.82 + 0.18 * hash01(variant, Math.round(Math.atan2(dy, dx) * 6), 3);
    if (k > edge) continue;
    const n = hash01(variant, x, y);
    if (k > edge * 0.7 && ((x + y) & 1 || n < 0.35)) continue;
    const tone = n < 0.08 ? 4 : n < 0.45 ? 3 : 2;
    set(x, y, tones[tone], Math.round(255 * (0.75 - 0.35 * k)));
  }
  // Crystals: little six-armed flakes in black outlines, clear of the edge.
  const count = Math.max(3, Math.round(R * R / 36));
  for (let i = 0; i < count; i++) {
    const a = hash01(variant, i, 11) * Math.PI * 2, far = Math.sqrt(hash01(variant, i, 12)) * (R - 4);
    const cx = Math.round(R + Math.cos(a) * far), cy = Math.round(R + Math.sin(a) * far);
    const big = hash01(variant, i, 13) < 0.35;
    const arm = big ? 2 : 1;
    const cells: [number, number][] = [[0, 0]];
    for (let j = 1; j <= arm; j++) cells.push([j, 0], [-j, 0], [0, j], [0, -j]);
    if (big) cells.push([1, 1], [-1, -1], [1, -1], [-1, 1]);
    for (const [ox, oy] of cells) for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(cx + ox + ex, cy + oy + ey, ink, 255);
    for (const [ox, oy] of cells) set(cx + ox, cy + oy, ox === 0 && oy === 0 ? tones[4] : Math.abs(ox) + Math.abs(oy) > 1 ? tones[2] : tones[3], 255);
  }
  c.putImageData(img, 0, 0);
  patches.set(key, canvas);
  return canvas;
}

/** How much of a patch of rime shows: forming, whole, then melting. */
const showing = (f: Rime) => Math.max(0, Math.min(1, f.t / FORM, (f.life - f.t) / MELT));

/** Every patch of rime on the ground, under the units; a blizzard's snow over it. */
export function drawRime(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.rime.length) return;
  const blizzard = sim.bonuses.frostNova?.path === "blizzard";
  for (const f of sim.rime) {
    const sprite = rimeSprite(f.r, f.seed), R = (sprite.width - 1) / 2;
    c.save();
    c.globalAlpha = showing(f);
    blit(c, px, sprite, Math.round(f.x * ART) - R, Math.round(f.y * ART) - R);
    c.restore();
  }
  if (!blizzard) return;
  const dot = artPen(c, px);
  for (const f of sim.rime) {
    c.globalAlpha = showing(f);
    const n = Math.round(f.r * f.r * 3);
    for (let i = 0; i < n; i++) {
      // Each flake circles the middle at its own distance and pace, slipping downwind.
      const far = Math.sqrt(hash01(f.seed, i, 1)) * f.r, speed = 1.2 + hash01(f.seed, i, 2) * 1.6;
      const a = hash01(f.seed, i, 3) * Math.PI * 2 + (sim.time * speed) / Math.max(0.6, far);
      const ax = Math.round((f.x + Math.cos(a) * far) * ART), ay = Math.round((f.y + Math.sin(a) * far * 0.8 - 0.4) * ART);
      if (i % 4 === 0) {
        c.fillStyle = OUTLINE;
        dot(ax - 1, ay - 1, 3, 3);
      }
      c.fillStyle = i % 3 ? FROST[4] : FROST[3];
      dot(ax, ay);
    }
  }
  c.globalAlpha = 1;
}

/** A diamond of ice `r` art pixels from its middle, in a black outline,
 * lit from the upper left. */
export function frostDiamondPixels(r:number,variant:number){
  const n=r*2+1,data=new Uint32Array(n*n),p=pixels(data,n,n);
  for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(Math.abs(x)+Math.abs(y)<=r)p.set(x+r,y+r,hexColor(x+y<0?FROST[4]:x+y===0?FROST[3-(variant&1)]:FROST[2]));
  return sourcePixels(ART_NAMES.effect("frost-diamond",`${r}-${variant}`),n,n,()=>data);
}
function diamond(c:Ctx,px:number,x:number,y:number,r:number,i:number){
  const n=r*2+1,cv=sprite(`frost-diamond:${r}:${i&1}`,n,n,()=>frostDiamondPixels(r,i&1));
  drawSprite(c,cv,(x-r)*px/ART,(y-r)*px/ART,n*px/ART,n*px/ART);
}
export function frostDiamondPieces():ArtPiece[]{
  return [1,2].flatMap(r=>[0,1].map(v=>({name:ART_NAMES.effect("frost-diamond",`${r}-${v}`),w:r*2+1,h:r*2+1,about:`Frost diamond, radius ${r}, variant ${v}`,pixels:()=>frostDiamondPixels(r,v)})));
}
/** The nova's ring of ice rushing out, and shatters' shards flying. */
export function drawFrostBursts(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.frostBursts.length) return;
  const dot = artPen(c, px);
  for (const b of sim.frostBursts) {
    const k = b.t / BURST_SHOW, seed = Math.floor(b.x * 97 + b.y * 31);
    if (b.nova) {
      c.save();
      c.globalAlpha = 0.9 * (1 - k);
      c.strokeStyle = FROST[3];
      c.lineWidth = Math.max(1, Math.round((px / ART) * 2));
      c.beginPath();
      c.arc(b.x * px, b.y * px, b.r * px * Math.min(1, 0.2 + k * 1.8), 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    // Ice crystals (a nova's) or shards (a shatter's) flung out: little
    // diamonds of ice in black outlines.
    const n = b.nova ? 16 : 7, reach = b.nova ? Math.min(1, 0.2 + k * 1.8) : 0.3 + 0.7 * k;
    if (k > 0.75) c.globalAlpha = (1 - k) / 0.25;
    for (let i = 0; i < n; i++) {
      const a = ((i + hash01(seed, i) * 0.5) / n) * Math.PI * 2;
      const far = b.r * reach * (b.nova ? 0.85 + 0.15 * hash01(seed, i, 1) : 0.6 + 0.6 * hash01(seed, i, 1));
      const lift = b.nova ? 0 : Math.sin(Math.PI * k) * 0.5;
      const x = Math.round((b.x + Math.cos(a) * far) * ART), y = Math.round((b.y + Math.sin(a) * far - lift) * ART);
      diamond(c, px, x, y, b.nova && i % 2 ? 2 : 1, i);
    }
    c.globalAlpha = 1;
  }
}

/** The rime glows faintly cold on the ground; a burst flashes. */
export function frostLights(sim: DefendSim): ReliefLight[] {
  const relief: ReliefLight[] = [];
  for (const f of sim.rime) relief.push({ x: f.x, y: f.y, r: f.r * 1.3, k: 0.45 * showing(f), color: "#9fdcff" });
  for (const b of sim.frostBursts) relief.push({ x: b.x, y: b.y, r: b.r * 1.5, k: (b.nova ? 1.1 : 0.6) * (1 - b.t / BURST_SHOW), color: "#d8f4ff" });
  return relief;
}
