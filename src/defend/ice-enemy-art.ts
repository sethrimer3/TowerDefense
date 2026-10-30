import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels, type ArtPiece } from "./sprite-source.ts";
/** Native pixel sprites, cached by kind, damage and hit flash. */
import { pixels, sprite } from "./damage-art.ts";
import { enemySize } from "./catalog.ts";
import type { Brush } from "./battle-art.ts";
import type { Enemy } from "./sim.ts";

const GOLEM = [
  "    ....    ",
  "   .HHHH.   ",
  "   .HDDH.   ",
  "   .HEEH.   ",
  " ...HHHH... ",
  ".HH.MMMM.HH.",
  ".HH.HMMH.HH.",
  ".HH.HMMH.HH.",
  " ...HMMH... ",
  "   .HMMH.   ",
  "   ......   ",
  "  .HH..HH.  ",
  "  .HD..DH.  ",
  "  ........  ",
];
const CUBE = [
  " ........ ",
  ".HHHHHHHH.",
  ".HMMMMMDH.",
  ".HMHMMDDH.",
  ".HMMMDMDH.",
  ".HMMDDMDH.",
  ".HMDMMMDH.",
  ".HDDDDDDA.",
  ".AAAAAAAA.",
  " ........ ",
];
export function drawIceEnemy({ c, px }: Brush, e: Enemy) {
  const golem = e.kind === 'iceGolem', rows = golem ? GOLEM : CUBE;
  const w = golem ? 12 : 10, h = rows.length, hurt = e.hp < e.maxHp / 2, flash = e.flash > 0;
  const cv = sprite(`ice-enemy:${e.kind}:${hurt}:${flash}`, w, h, () => iceEnemyPixels(golem, hurt, flash), false);
  if (!cv) return;
  const size = Math.max(3, Math.round(enemySize(e) * px));
  const height = Math.round(size * h / w), x = Math.round(e.x * px - size / 2), y = Math.round(e.y * px - height / 2);
  if (e.marked) { c.fillStyle = '#f2c94c'; c.fillRect(x - 1, y - 1, size + 2, height + 2); }
  c.save(); c.imageSmoothingEnabled = false;
  c.drawImage(cv, x, y, size, height); c.restore();
}

export function iceEnemyPixels(golem: boolean, hurt = false, flash = false) {
  const rows = golem ? GOLEM : CUBE, w = golem ? 12 : 10, h = rows.length;
    const p = pixels(new Uint32Array(w * h), w, h);
    const colors: Record<string, number> = { O: 0x25475d, H: 0xe0f8ff, M: 0x90d5ed, D: 0x57a7cd, A: 0x377ea8, E: 0x1e648a };
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (colors[ch] !== undefined) p.set(x, y, flash ? 0xffffff : hurt && (x + y * 2) % 9 === 0 ? colors.O : colors[ch]);
    }));
  return sourcePixels(ART_NAMES.enemy(golem ? "iceGolem" : "iceCube",`${hurt ? "hurt" : "whole"}-${flash ? "struck" : "plain"}`),w,h,()=>p.out);
}
export function iceEnemyPieces(): ArtPiece[] {
  return [false,true].flatMap(golem=>[false,true].flatMap(hurt=>[false,true].map(flash=>({name:ART_NAMES.enemy(golem ? "iceGolem" : "iceCube",`${hurt ? "hurt" : "whole"}-${flash ? "struck" : "plain"}`),w:golem?12:10,h:golem?GOLEM.length:CUBE.length,about:"Ice enemy",pixels:()=>iceEnemyPixels(golem,hurt,flash)}))));
}
