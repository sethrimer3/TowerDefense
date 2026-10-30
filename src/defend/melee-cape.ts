import { capeSource, capeName, CAPE_BOX, CAPE_ORIGIN, CAPE_FRAMES } from "./cape-source.ts";
import { spriteCanvas } from "./damage-art.ts";
import type { ArtPiece } from "./sprite-source.ts";
/** Shorter, path-tailored versions of the Hero's flowing cape. Art only:
 * battle snapshots select tailoring; no unit/save fields or random draws. */
import { PATHS, pathById, type PathHue, type PathId, type PathTopic } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { CAPE, capePixels, newCape, stepCape, type Cape, type CapeCut } from "./hero-cape.ts";
import { ART } from "./park-art.ts";
import { pixelArtOn, pixelKey } from "./pixel-sprites.ts";
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
export type MeleeCapeStyle = { name:string; length: number; rank: number; cut: CapeCut; colors: RGB[]; struck: RGB[] };
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
  return { name:`${kind}-${choice?.id ?? "base"}-${rank}`, length: MELEE_CAPE_LENGTHS[rank], rank,
    cut: { shoulder: 1.4, hem: 2.6, notch: choice ? 0.7 : 0.4, fringe: choice ? FRINGES[choice.id] : undefined, bands: rank >= 3 ? 2 : rank >= 1 ? 1 : 0 },
    colors, struck: colors.map((c, i) => i === 6 ? c : mix(c, 255, 0.65)) };
}

const styles = new Map<string, MeleeCapeStyle>();
export function meleeCapeStyle(sim: DefendSim, u: CapeWearer) {
  if (u.risen?.range || u.called?.range) return null;
  // Swordsmen and assassins wear their own hall's path: the attuned one's or a branch hall's.
  const topic = u.kind === "sword" || u.kind === "assassin" ? (sim.map.buildings[u.home]?.kind as PathTopic | undefined) ?? TOPICS[u.kind] : TOPICS[u.kind];
  if (!topic && u.kind !== "brawler") return null;
  const path = u.risen ? sim.bonuses.necromancy : u.called ? sim.bonuses.reinforcements
    : topic ? buildingPaths(sim, sim.map.buildings[u.home])?.[topic] : undefined;
  const key = `${u.kind}:${path?.path ?? ""}:${path?.rank ?? 0}`;
  let style = styles.get(key);
  if (!style) { style = meleeCapeLook(u.kind, path)!; styles.set(key, style); }
  return style;
}

type Flowing = { cape: Cape; canvas: HTMLCanvasElement; style: MeleeCapeStyle; bucket: string; struck: boolean; reduced: boolean; x0: number; y0: number };
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
  const bucket = `${reduced ? 0 : Math.floor(sim.time * 15 + u.id * 0.61803398875)}:${pixelKey()}`, struck = u.flash > 0;
  let f = capes.get(u);
  if (!f || f.style !== style || f.reduced !== reduced) {
    const canvas = f?.canvas ?? document.createElement("canvas");
    liveSprite(canvas);
    f = { cape: newCape(x, y, sim.time, u.id * 1.7, style.length), canvas, style, bucket: "", struck: !struck, reduced, x0: 0, y0: 0 };
    capes.set(u, f);
  }
  if (f.bucket !== bucket || f.struck !== struck) {
    if (!reduced) stepCape(f.cape, x, y, sim.time);
    const p = capePixels(f.cape, f.cape.x[0], f.cape.y[0], ART, reduced ? 0 : sim.time, style.cut);
    f.x0 = f.y0 = -CAPE_ORIGIN; f.bucket=bucket;f.struck=struck;
    const frame=(reduced?0:Math.floor(sim.time*15))%CAPE_FRAMES;
    spriteCanvas(capeSource(style.name,frame,struck,p,struck?style.struck:style.colors,p.x0,p.y0,ART),CAPE_BOX,CAPE_BOX,f.canvas,false);

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

export function meleeCapePieces():ArtPiece[]{
  const topics:Record<string,string[]>={sword:['barracks','chapterHouse','berserkerLodge','halberdYard'],assassin:['assassinDen','bloodHall','veilHouse','poisonDen'],spearman:['spearHall'],hoplite:['phalanx'],lancer:['lancerStable'],valkyrie:['valkyriePalace'],undead:['necromancy'],reinforcement:['reinforcements'],brawler:[]};
  const out:ArtPiece[]=[],seen=new Set<string>();
  for(const [kind,t] of Object.entries(topics)){
    const choices=[undefined,...PATHS.filter(p=>t.includes(p.topic)).flatMap(p=>[1,2,3].map(rank=>({path:p.id,rank})))];
    for(const path of choices){
      const style=meleeCapeLook(kind as Soldier['kind'],path)!;
      if(seen.has(style.name))continue;seen.add(style.name);
      for(let frame=0;frame<CAPE_FRAMES;frame++)for(const struck of [false,true])out.push({name:capeName(style.name,frame,struck),w:CAPE_BOX,h:CAPE_BOX,about:`${style.name} cape, frame ${frame}`,pixels:()=>{
        const time=frame/15,cape=newCape(0,0,time,0,style.length),p=capePixels(cape,0,0,ART,time,style.cut);
        return capeSource(style.name,frame,struck,p,struck?style.struck:style.colors,p.x0,p.y0,ART);
      }});
    }
  }
  return out;
}
