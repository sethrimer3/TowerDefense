/** Native silhouettes for the themed zone species.
 * Battle bodies and journal portraits share the same bounded sprite cache. */
import { ENEMIES, type EnemyKind, type ZoneEnemyKind } from "./catalog.ts";
import { pixels, shade, sprite } from "./damage-art.ts";
import type { Brush } from "./battle-art.ts";
import type { Enemy } from "./sim.ts";

const ROWS: Record<ZoneEnemyKind, readonly string[]> = {
  fernMantis: [
    " O      O ", " OH OO HO ", "  OHHEHO  ", "   OMMO   ",
    " OHOMMOHO ", "OMO OM OMO", " O ODDO O ", "   ODDO   ",
    "  ODOODO  ", " OO    OO ",
  ],
  mossTroll: [
    "   OOOOO   ", "  OHHHHHO  ", "  OHMEHMO  ", "  OMAAAMO  ",
    " OOMMMDDOO ", "OHOMMMMODOO", "OMOHHMMOMDO", " OOMMMDDOO ",
    "   ODDDO   ", "  ODDODDO  ", "  OOO OOO  ",
  ],
  lanternHornet: [
    "  OO  OO  ", " OAAOOAAO ", "OHAAHHAAHO", " OOHEEHOO ",
    "   OAAO   ", "   ODDO   ", "   OAAO   ", "    OO    ",
    "    O     ",
  ],
  glassJackal: [
    " O        O  ", "OHO      OHO ", " OHO   OOHMO ", "  OOOOOHMEMO ",
    "  OHMMMMMMAO ", "   ODDMMMDO  ", "   OOOOODO   ", "  ODO  ODO   ",
    "  OO    OO   ",
  ],
  duneTortoise: [
    "    OOOOO    ", "  OOHHHHHOO  ", " OHMHMMHMMDO ", "OHMMDDMDDMMDO",
    "OHMDDMMMDMMDO", " ODDDDDDDDOO ", "  OOODOOOOMAO", " ODO  ODO OOO",
    " OOO  OOO    ",
  ],
  dustDjinn: [
    "   OAAAAO  ", "    OHHO   ", "   OHEEMO  ", " OOHHMMHOO ",
    "OHOMMMMOHMO", " OOMMMMOOO ", "   OMDDO   ", "    ODDO   ",
    "   ODO     ", "    OOO    ", "      O    ",
  ],
  cinderImp: [
    " O    O ", "OHO  OHO", " OHHHHO ", " OHEEHO ",
    "  OMDO  ", " OOAMOO ", "OHOMMOHO", " OODDOO ",
    "  OO OO ", " OAO OAO",
  ],
  slagGolem: [
    "    OOOO    ", "   OHHHDO   ", "   OMAADO   ", "   OMDMDO   ",
    " OOOHHMMOOO ", "OHHOAMMDOHMO", "OMMOAMADOMDO", " OOOMDDDOOO ",
    "   ODDDDO   ", "  ODDOODDO  ", "  OAO  OAO  ", "  OOO  OOO  ",
  ],
  emberMoth: [
    " OOO      OOO ", "OHAAO OO OHAAO", "OHMMHOAAOHMMDO", " OHHMOEEOMMDO ",
    " OHMMOAAMMMDO ", "  OMMODDOMDO  ", "   OOODDOOO   ", "     OAAO     ",
    "      OO      ",
  ],
  kelpStalker: [
    " O   OO   O ", " OH OHH OHO ", "  OHHHHHHO  ", "   OHEEHO   ",
    "  OOHHMMOO  ", " OHOMMMMOMO ", " O OMMDDO O ", "   ODDDDO   ",
    "   ODOODO   ", "  ODO  ODO  ", "  OO    OO  ",
  ],
  capCrawler: [
    "   OOOO OOOO   ", " OOHHHHOMHMMOO ", "OHAAHHHHMMAMMDO",
    " OOOOOOOOOOOOO ", "  OHMMMEMMMMDO ", " OODDDDDDDDDOO ",
    "O O O O O O O O", " OO  OO  OO OO ",
  ],
  myceliumHulk: [
    "  OOO OOO OOO  ", " OHHHOHHHOHHHO ", "  OHHHHHHHHHO  ", "   OHMEEMMDO   ",
    " OOOHHMMDDOOO  ", "OHMOMHMMMDOHMO ", "OMMOMMMMMDOMMDO", " OOOMMDDDDOOO  ",
    "   ODDDDDDO    ", "   ODO ODDO    ", "  OHDO ODDHO   ", "  OOOO OOOOO   ",
  ],
  rotMite: [
    " O O O O ", "  OHHHO  ", " OHEEHMO ", "OOMMMDDOO",
    " ODDDDDO ", "  ODDDO  ", " O O O O ", "O       O",
  ],
  geodeCrab: [
    "   OO    OO   ", "  OHHO  OHHO  ", " OHHDOOOOHMDO ", "  OOOMHHMOOO  ",
    "OO OHMAAHMD OO", "OHOOHMMMMDOOHO", " OOODDDDDDOOO ", "O  OOOOOOO  O ",
    " O O     O O  ",
  ],
  prismMoth: [
    " O       O ", "OHOO   OOHO", "OHMHO OHHMO", " OMHHOHHMO ",
    "  OHMEEHO  ", " OMMMAAMMO ", "OHM ODD MHDO", " OO ODDO OO ",
    "    OOOO    ",
  ],
  shardBrood: [
    "  O   O   O  ", " OH OOHOO HO ", "OHHOHHHHOOHHO", "OMHHHMMHHMMDO",
    " OHHMMMMMMDO ", "  OMMMEMMDO  ", " OMMDDDDDMDO ", "  ODDDDDDOO  ",
    "   OO OOO    ", "  ODO ODDO   ", "  OOO OOOO   ",
  ],
  cryptHound: [
    " O         O ", "OHO       OHO", " OHHOOOOOHMO ", "  OHMMDDMEMO ",
    " OMMDDDDMMAO ", "O ODDDDDDOO  ", "   OOO ODO   ", "  OAO  OAO   ",
    "  OOO  OOO   ",
  ],
  graveWisp: [
    "    OOO    ", "   OHHHO   ", "  OHAAAHO  ", "  OHAEAHO  ",
    "   OMMMO   ", "  OMMMDDO  ", " OMDMMDDDO ", "  ODDDDDO  ",
    "   ODO O   ", "  O O  OO  ", "  O        ",
  ],
  novaMoth: [
    " OO        OO ", "OHHO  OO  OHHO", "OHAAOOAAOOAAMO", "OHMHHHAHHHMMDO",
    " OMMHOEEOHMDO ", "  OHMOAAOMDO  ", " OHHMOMMOMMDO ", "  OOOODDOOOO  ",
    "     ODDO     ", "      OO      ",
  ],
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
  brineCrab: [
    " OO      OO ", "OHHO    OHHO", "OMDO OO OMDO", " OOOHEEHOOO ",
    "  OHHHHMMO  ", " OOMMMMDDOO ", "O ODDDDDDO O", " O OOOOOO O ",
    "O O      O O",
  ],
  lanternJelly: [
    "    OOOO    ", "  OOHHHHOO  ", " OHHAHHAMMO ", "OHHHAAAMMMDO",
    "OHMMMAAMMDDO", " OOOOOOOOOO ", "  OA OA OA  ", "  OA OA OA  ",
    " OAO  OA OAO", " OO   OO  OO",
  ],
  coralGuardian: [
    " O O    O O ", " OHO OO OHO ", "  OHOHHOHO  ", "   OHEEHO   ",
    " OOHHMMHHOO ", "OHOMMMMDMOHO", " OOMMAMMDOO ", "   ODDDDO   ",
    "  ODO  ODO  ", "  OOO  OOO  ",
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
