/** Shorter, path-tailored versions of the Hero's flowing cape. Art only:
 * battle snapshots select tailoring; no unit/save fields or random draws. */
import { pathById, type PathHue, type PathId, type PathTopic } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { CAPE, capePixels, newCape, stepCape, type Cape, type CapeCut } from "./hero-cape.ts";
import { ART } from "./park-art.ts";
import { pixelArtOn } from "./pixel-sprites.ts";
import { liveSprite } from "./unit-outline.ts";
import type { DefendSim, Soldier } from "./sim.ts";

export const MELEE_CAPE_LENGTHS = [0.6, 0.7, 0.8, 0.9] as const;
const TOPICS: Partial<Record<Soldier["kind"], PathTopic>> = {
  sword: "barracks", assassin: "assassinDen", spearman: "spearHall",
  hoplite: "phalanx", lancer: "lancerStable", valkyrie: "valkyriePalace",
  undead: "necromancy", reinforcement: "reinforcements",
};
const HUES: Record<PathHue, readonly [string, string, string]> = {
  steel: ["#c2ccd0", "#7b8995", "#eae2c9"], ember: ["#96372e", "#581f22", "#f1d58a"],
  verdant: ["#476044", "#253d2a", "#bd925b"], frost: ["#6fa3b8", "#325b70", "#c2e5e6"],
  storm: ["#65567d", "#352943", "#a391b3"], shadow: ["#581f22", "#28251f", "#cac7b5"],
  grave: ["#476044", "#253d2a", "#cac7b5"],
};
const FRINGES: Partial<Record<PathId, CapeCut["fringe"]>> = {
  crusaders: "square", berserkers: "torn", halberdiers: "points",
  bloodletters: "points", shadowcloak: "scallop", venom: "points", headhunters: "torn",
  longSpears: "points", setSpears: "square", testudo: "square", spearWall: "points",
  heavyLance: "points", wingedLancers: "scallop", cloudborne: "scallop",
  soulWeighing: "torn", amalgam: "points", hammerfall: "square", muster: "points", oathsworn: "square",
};
type RGB = readonly [number, number, number];
export type MeleeCapeStyle = { length: number; rank: number; cut: CapeCut; colors: RGB[]; struck: RGB[] };
export type CapeWearer = Pick<Soldier, "id" | "kind" | "home" | "x" | "y" | "flash" | "risen" | "called">;
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mix = (c: RGB, to: number, t: number): RGB => [Math.round(c[0] + (to-c[0])*t), Math.round(c[1] + (to-c[1])*t), Math.round(c[2] + (to-c[2])*t)];

/** Pure tailoring lookup. Ranged troops and the existing Hero/Shadow looks
 * keep their own art; summoned archers are filtered by `meleeCapeStyle`. */
export function meleeCapeLook(kind: Soldier["kind"], path?: { path: PathId; rank: number }): MeleeCapeStyle | null {
  if (kind !== "brawler" && !TOPICS[kind]) return null;
  const rank = Math.max(0, Math.min(3, Math.floor(path?.rank ?? 0)));
  const choice = rank && path ? pathById(path.path) : null;
  const [base, shade, trim] = choice?.id === "crusaders" ? ["#cac7b5", "#929185", "#96372e"] : choice ? HUES[choice.hue] : kind === "assassin" ? ["#465260", "#252d36", "#7b8995"]
    : kind === "valkyrie" ? ["#cac7b5", "#929185", "#f1d58a"] : ["#91643c", "#60432b", "#bd925b"];
  const b = rgb(base), d = rgb(shade);
  const colors: RGB[] = [b, b, mix(b, 255, 0.25), d, mix(d, 0, 0.35), rgb(trim), rgb("#14120f")];
  return { length: MELEE_CAPE_LENGTHS[rank], rank,
    cut: { shoulder: 1.4, hem: 2.6, notch: choice ? 0.7 : 0.4, fringe: choice ? FRINGES[choice.id] : undefined, bands: rank >= 3 ? 2 : rank >= 1 ? 1 : 0 },
    colors, struck: colors.map((c, i) => i === 6 ? c : mix(c, 255, 0.65)) };
}

const styles = new Map<string, MeleeCapeStyle>();
export function meleeCapeStyle(sim: DefendSim, u: CapeWearer) {
  if (u.risen?.range || u.called?.range) return null;
  // Swordsmen wear their own hall's path: the barracks' or a branch hall's.
  const topic = u.kind === "sword" ? (sim.map.buildings[u.home]?.kind as PathTopic | undefined) ?? TOPICS.sword : TOPICS[u.kind];
  if (!topic && u.kind !== "brawler") return null;
  const path = u.risen ? sim.bonuses.necromancy : u.called ? sim.bonuses.reinforcements
    : topic ? buildingPaths(sim, sim.map.buildings[u.home])?.[topic] : undefined;
  const key = `${u.kind}:${path?.path ?? ""}:${path?.rank ?? 0}`;
  let style = styles.get(key);
  if (!style) { style = meleeCapeLook(u.kind, path)!; styles.set(key, style); }
  return style;
}

type Flowing = { cape: Cape; canvas: HTMLCanvasElement; style: MeleeCapeStyle; bucket: number; struck: boolean; reduced: boolean; x0: number; y0: number };
const capes = new WeakMap<CapeWearer, Flowing>();

/** Draw behind the body, inheriting its cloak opacity. Native eight-pixel
 * grid; per-unit buffers update at 15Hz and follow the body between updates. */
export function drawMeleeCape(ctx: CanvasRenderingContext2D, px: number, u: CapeWearer, sim: DefendSim, reduced = false, x = u.x, y = u.y) {
  if (!pixelArtOn()) return;
  const style = meleeCapeStyle(sim, u);
  if (!style) return;
  // Keep a full cape's reach beyond the viewport before culling. Offscreen
  // cloth resets normally after a long gap when its soldier comes back.
  const m = ctx.getTransform(), sx = x * px * m.a + y * px * m.c + m.e, sy = x * px * m.b + y * px * m.d + m.f;
  const pad = (CAPE.link * (CAPE.points - 1) + 0.75) * px * Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  if (sx + pad < 0 || sy + pad < 0 || sx - pad > ctx.canvas.width || sy - pad > ctx.canvas.height) return;
  // Stagger refreshes so a large garrison does not rerasterize in one frame.
  const bucket = reduced ? 0 : Math.floor(sim.time * 15 + u.id * 0.61803398875), struck = u.flash > 0;
  let f = capes.get(u);
  if (!f || f.style !== style || f.reduced !== reduced) {
    const canvas = f?.canvas ?? document.createElement("canvas");
    liveSprite(canvas);
    f = { cape: newCape(x, y, sim.time, u.id * 1.7, style.length), canvas, style, bucket: -1, struck: !struck, reduced, x0: 0, y0: 0 };
    capes.set(u, f);
  }
  if (f.bucket !== bucket || f.struck !== struck) {
    if (!reduced) stepCape(f.cape, x, y, sim.time);
    const p = capePixels(f.cape, f.cape.x[0], f.cape.y[0], ART, reduced ? 0 : sim.time, style.cut);
    f.x0 = p.x0; f.y0 = p.y0; f.bucket = bucket; f.struck = struck;
    const cv = f.canvas;
    if (cv.width !== p.w || cv.height !== p.h) { cv.width = p.w; cv.height = p.h; }
    // Like pixel-fx.bake: tiny pixel-written sprites stay in software, so
    // each cape update does not flush its own GPU drawing surface.
    const c = cv.getContext("2d", { willReadFrequently: true })!, image = c.createImageData(p.w, p.h), colors = struck ? style.struck : style.colors;
    for (let i = 0; i < p.tone.length; i++) {
      if (!p.tone[i]) continue;
      const color = colors[p.tone[i]];
      image.data[i * 4] = color[0]; image.data[i * 4 + 1] = color[1]; image.data[i * 4 + 2] = color[2]; image.data[i * 4 + 3] = 255;
    }
    c.putImageData(image, 0, 0);
  }
  ctx.save();
  const life = u.risen?.life ?? (u.called?.stood ? undefined : u.called?.life);
  if (life !== undefined && life < 1) ctx.globalAlpha *= Math.max(0, life);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(f.canvas, (x + f.x0 / ART) * px, (y + f.y0 / ART) * px, f.canvas.width * px / ART, f.canvas.height * px / ART);
  ctx.restore();
}

/** Exact centerline length, before decorative hems remove material. */
export const meleeCapeLength = (rank: number) => CAPE.link * (CAPE.points - 1) * MELEE_CAPE_LENGTHS[Math.max(0, Math.min(3, Math.floor(rank)))];
