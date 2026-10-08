/** Native silhouettes for the forest, desert, fungal, crystal and astral species.
 * Battle bodies and journal portraits share the same bounded sprite cache. */
import { ENEMIES, type EnemyKind, type ZoneEnemyKind } from "./catalog.ts";
import { pixels, shade, sprite } from "./damage-art.ts";
import type { Brush } from "./battle-art.ts";
import type { Enemy } from "./sim.ts";

const ROWS: Record<ZoneEnemyKind, readonly string[]> = {
  briarling: [
    " O   O   O ", "  OHOHOHO  ", "   OHHHO   ", "  OHMEMHO  ",
    "   OMMMO   ", " OOOMMMOOO ", "OH OMMMO HO", " O ODDDO O ",
    "   OO OO   ", "  OMO OMO  ",
  ],
  mossBoar: [
    "   OO  OO   ", "  OHHOOHHO  ", " OHHHHHMMMO ", "OHMHHMMMMDMO",
    "OHMMMMMMEMMO", " ODDDDMMMMAO", "  ODDDDDDAO ", "   OO OOO   ",
    "  ODO ODO   ", "  OOO OOO   ",
  ],
  rootTreant: [
    " OO  OOO OO ", "OHHOOHHHOHHO", " OHHHHHHHHO ", "  OHMHHMHO  ",
    "   OMEMEO   ", " OOODMMDOOO ", "OD ODMMDO DO", "OD ODMMDO DO",
    " O ODMMDO O ", "   ODDDDO   ", "  ODO  ODO  ", " ODDO  ODDO ",
  ],
  duneScorpion: [
    "       OOO  ", "      OHMDO ", "      OMD O ", "       OD   ",
    "OO   OOODO  ", "OHO OHMMMO  ", " OOOHMEMMOO ", "  OOMMMMOOHO",
    " O ODDDO OOO", "O O O O O   ",
  ],
  sunScarab: [
    "  OO  OO  ", "   OOOO   ", "  OHAAHO  ", " OHHAAHMO ",
    "OOMHAAMMOO", "O OMAMMO O", " OOMAMMOO ", "O ODDDDO O",
    "   OOOO   ", "  OO  OO  ",
  ],
  sandVulture: [
    "OO        OO", "OHOO    OOMO", "OHMMO  OMMDO", " OMMOOOO MDO",
    "  OMMMAMMDO ", "   OMAEMDO  ", "    OMMDO   ", "    ODDO    ",
    "   ODOODO   ", "   OO  OO   ",
  ],
  sporeling: [
    "    OOOO    ", "  OOHHHHOO  ", " OHHAHHAMMO ", "OHHHMMHMMMDO",
    " OOOOOOOOOO ", "    OAEO    ", "    OAAO    ", "   OOAAOO   ",
    "  ODO  ODO  ", "  OOO  OOO  ",
  ],
  fungalBrute: [
    "    OOOOO   ", "  OOHHHHHOO ", " OHHAHHAHMDO", " OHHHMMHMMDO",
    "  OOOMMMOOO ", "   OAEEAO   ", " OOADMMDAOO ", "OADADMMDAADO",
    " OODMMMDDOO ", "   ODDDDO   ", "  ODDOODDO  ", "  OOO  OOO  ",
  ],
  sporeMoth: [
    "OO    OO    OO", "OHOO   OO OOMO", "OHAHO OAAOMADO", "OHMMHOOAAOMMDO",
    " OMMMAOEEAMDO ", " OHMMMOAAOMDO ", "  OHHOODDOOO  ", "   OO ODDO    ",
    "      OOOO    ",
  ],
  shardling: [
    "    O    ", "   OHO   ", "  OHHMO  ", " OHHMMDO ",
    "OHHEMMDDO", " OMMMDDO ", "  OMDDO  ", "  ODDO   ",
    " ODOODO  ", " OO  OO  ",
  ],
  crystalSentinel: [
    "    OO    ", "   OHHO   ", "  OHHMMO  ", "  OHEEMO  ",
    " OOHHMMOO ", "OHOMMMMOHO", "OMOMMMMODMO", " OOMDDMOO ",
    "  ODDDDO  ", "  OO OOO  ", " ODO ODDO ", " OOO OOOO ",
  ],
  prismRay: [
    "O          O", "OHO  OO  OHMO", "OHMOOHHOOHMD O", " OHHHHHHMMMDO ",
    "  OMMMEE MDO  ", "   OMMMMDDO   ", "    ODDDDO    ", "     ODDO     ",
    "      OD      ", "       O      ",
  ],
  starWisp: [
    "    O    ", "   OHO   ", " OOH HOO ", "OHHAHAHMO",
    " OHAEAMO ", "  OAAAO  ", " OMOMOMO ", " OO O OO ",
    "    O    ",
  ],
  cometHound: [
    " OO       OO  ", "OHHOO    OHHO ", " OHMMOOOOMMMO ", "  OHHHHMMEMMO ",
    "   OMMMMMMMAO ", "    ODDDDDDO  ", "    OO  OOO   ", "   ODO  ODO   ",
    "   OO    OO   ",
  ],
  astralWarden: [
    "  O  OO  O  ", "  OOOAAOOO  ", "   OHHHHO   ", "   OAEEAO   ",
    " OOOHHHHOOO ", "OHHOAMMAOHHO", "OHHOAMMAOHHO", " OOOAMMAOOO ",
    "   ODDDDO   ", "   OO OOO   ", "  OAO OAAO  ", "  OOO OOOO  ",
  ],
};

const SHAPES = Object.fromEntries(Object.entries(ROWS).map(([kind, rows]) =>
  [kind, { rows, w: Math.max(...rows.map(row => row.length)), h: rows.length }]
)) as Record<ZoneEnemyKind, { rows: readonly string[]; w: number; h: number }>;

export function zoneEnemyRows(kind: EnemyKind): readonly string[] | undefined {
  return SHAPES[kind as ZoneEnemyKind]?.rows;
}

/** Pure art pixels also used by the sprite checks; no canvas or random stream. */
export function zoneEnemyPixels(kind: ZoneEnemyKind, hurt = false, flash = false) {
  const { rows, w, h } = SHAPES[kind];
  const p = pixels(new Uint32Array(w * h), w, h), base = Number.parseInt(ENEMIES[kind].color.slice(1), 16);
  const colors: Record<string, number> = { O: 0x201b2b, H: shade(base, 1.35), M: base, D: shade(base, .65), E: 0x171322, A: 0xf3dc9a };
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (colors[ch] !== undefined) p.set(x, y, flash ? 0xffffff : hurt && ch !== "O" && (x + y * 2) % 9 === 0 ? colors.O : colors[ch]);
  }));
  return { w, h, data: p.out };
}

/** Replace only the body; the ordinary renderer retains marks and shields. */
export function drawZoneEnemyBody({ c }: Brush, e: Enemy, x: number, y: number, size: number): boolean {
  const shape = SHAPES[e.kind as ZoneEnemyKind];
  if (!shape) return false;
  const { w, h } = shape, hurt = e.hp < e.maxHp / 2, flash = e.flash > 0;
  const cv = sprite(`zone-enemy:${e.kind}:${hurt}:${flash}`, w, h, () => zoneEnemyPixels(e.kind as ZoneEnemyKind, hurt, flash).data);
  if (!cv) return false;
  c.save(); c.imageSmoothingEnabled = false;
  const height = Math.max(2, Math.round(size * h / w));
  c.drawImage(cv, x, y + Math.round((size - height) / 2), size, height); c.restore();
  return true;
}
