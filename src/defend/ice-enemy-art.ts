/** Native pixel sprites, cached by kind, damage and hit flash. */
import { pixels, sprite } from "./damage-art.ts";
import { enemySize } from "./catalog.ts";
import type { Brush } from "./battle-art.ts";
import type { Enemy } from "./sim.ts";

const GOLEM = [
  '    OOOO    ', '   OHHHHO   ', '   OHDDHO   ', '   OHEEHO   ',
  ' OOOHHHHOOO ', 'OHHOMMMMOHHO', 'OHHOHMMHOHHO', 'OHHOHMMHOHHO',
  ' OOOHMMHOOO ', '   OHMMHO   ', '   OOOOOO   ', '  OHHOOHHO  ',
  '  OHDOODHO  ', '  OOOOOOOO  ',
];
const CUBE = [
  ' OOOOOOOO ', 'OHHHHHHHHO', 'OHMMMMMDHO', 'OHMHMMDDHO', 'OHMMMDMDHO',
  'OHMMDDMDHO', 'OHMDMMMDHO', 'OHDDDDDDAO', 'OAAAAAAAAO', ' OOOOOOOO ',
];
export function drawIceEnemy({ c, px }: Brush, e: Enemy) {
  const golem = e.kind === 'iceGolem', rows = golem ? GOLEM : CUBE;
  const w = golem ? 12 : 10, h = rows.length, hurt = e.hp < e.maxHp / 2, flash = e.flash > 0;
  const cv = sprite(`ice-enemy:${e.kind}:${hurt}:${flash}`, w, h, () => {
    const p = pixels(new Uint32Array(w * h), w, h);
    const colors: Record<string, number> = { O: 0x25475d, H: 0xe0f8ff, M: 0x90d5ed, D: 0x57a7cd, A: 0x377ea8, E: 0x1e648a };
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (colors[ch] !== undefined) p.set(x, y, flash ? 0xffffff : hurt && (x + y * 2) % 9 === 0 ? colors.O : colors[ch]);
    }));
    return p.out;
  });
  if (!cv) return;
  const size = Math.max(3, Math.round(enemySize(e) * px));
  const height = Math.round(size * h / w), x = Math.round(e.x * px - size / 2), y = Math.round(e.y * px - height / 2);
  if (e.marked) { c.fillStyle = '#f2c94c'; c.fillRect(x - 1, y - 1, size + 2, height + 2); }
  c.save(); c.imageSmoothingEnabled = false;
  c.drawImage(cv, x, y, size, height); c.restore();
}
