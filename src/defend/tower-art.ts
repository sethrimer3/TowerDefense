/** The placeable structures (all but the keep) as pixel art at `ART`
 * pixels a cell, like the keep, roofs and parks: seen from above, lit from
 * the upper left, inside a crisp black outline, with damage stages and
 * rubble from `damage-art.ts`.
 *
 * - Melee Guild: a stone hall under a straw thatch, a raised fist on the
 *   ridge, and its yard a roped sparring ring with a punching bag.
 * - Ranged Guild: a stone hall under grey slate, a heap of throwing stones
 *   in its yard and a clay pot on a post to aim at.
 * - Sniper lodge: a hall under green waxed canvas with a crosshair on the
 *   ridge, its yard a long firing lane past sandbags to a far target.
 * - Musket hall: a hall under a smoke-browned roof with a powder burst on
 *   the ridge, its yard stacked with iron-bound powder kegs and scorched.
 * - Spearmen hall: a hall under ochre tiles with a spear on the ridge, a
 *   rack of spears and a straw dummy on a pole in its yard.
 * - Phalanx: a hall under red tiles with a round bronze shield on the
 *   ridge, shields stacked against its yard's fence.
 * - Javelin camp: a hall under olive thatch with crossed javelins on the
 *   ridge, a straw butt in its yard stuck with javelins.
 * - Lancer stable: a timber stable under brown shingles with a horse's head
 *   on the ridge, its yard a tilting run past a quintain, hay and a trough.
 * - Barracks: a stone hall under a red tiled roof, the swordsmen's blue
 *   shield on its ridge.
 * - Hero: a pale stone hall under gilded tiles with a great sword on the
 *   ridge, its yard a round sand arena ringed by stone and straw dummies.
 * - Shadow: a black shrine under a violet-black roof with a hooded shade's
 *   pale eyes on the ridge, its yard a ring of six knives stuck point down
 *   round a pool of darkness.
 * - Archer barracks: a timber hall, and its yard with a straw target butt.
 * - Archer tower: a square crenellated tower over a plank floor, its hatch
 *   and a sheaf of arrows.
 * - Cannon tower: a round bastion, the gun on its carriage pointing north
 *   and a stack of shot.
 * - C4 nanobots: a squat bunker of gunmetal plates ringed by hazard
 *   stripes, a huge mortar in the middle whose bore glows with the green
 *   swarm, four nanobot tanks at its corners and a blinking red light.
 * - Watch tower: a square tower with a beacon burning in an iron brazier.
 * - Wizard tower: a round tower under an eight-sided violet roof, runes
 *   glowing round the eaves and a gold finial.
 * - Mage Guild: a stone hall under a dark wine-red roof, a fire well
 *   burning in a brass ring at its heart, ember runes on the slopes and two
 *   red swallowtail banners hung over its south wall.
 * - Valkyrie palace: a heavenly palace of white marble on a stepped
 *   plinth, ringed by a colonnade, a gilded terrace round a great ribbed
 *   dome with a golden lantern, and a pair of gold wings over its south
 *   steps. It fills a whole tile, or half once its halls are folded.
 * - Dark wizard keep: black obsidian on a stepped plinth, curtain walls of
 *   glassy black blocks set in crimson mortar, a round turret at each
 *   corner crowned with a great faceted ruby (where its black lightning
 *   leaves from), a courtyard of dark flags ringed by a glowing crimson
 *   rune circle round an eight-sided obsidian spire tipped with a ruby, and
 *   a ruby-arched gate between two crimson banners on its south wall. Its
 *   wounds glow: crimson fissures open in the obsidian as it is hurt.
 * - Monster bait: a stack of iron-bound crates, one open and heaped with
 *   raw meat, another crate stacked on top with a haunch lashed to it and
 *   green slime seeping from the seams.
 *
 * Each building's Knowledge paths dress it in their own look (`PATH_LOOKS`):
 * new roofs, emblems, guns, fires and crates, described at each painter.
 *
 * Pure; the city layer and palette draw the cached canvases. */
import { TURRET_INSET, type StructureKind } from "./catalog.ts";
import { hash, hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { OUTLINE, STONE, damage, pixels, rubblePixels, shade, type Material, type Pix, type Ruin } from "./damage-art.ts";

export type PlacedKind = Exclude<StructureKind, "keep">;

/** Stone, dark to lit, and the fills used below (0xRRGGBB). */
const C = {
  stone: [0x5c574e, 0x8c8577, 0xa8a194, 0xc9c2b2],
  pale: [0x6e6a62, 0x9a958c, 0xb8b2a6, 0xd6d0c2],
  plank: [0x5a3d22, 0x7a5230, 0x8e6238, 0xa77a48],
  iron: [0x1e1e22, 0x34343a, 0x55555c, 0x8a8a92],
  red: 0xa03a2e,
  timber: 0x6e5236,
  slate: [0x46305e, 0x5e4078, 0x7a5694, 0x9a74b4],
  /** The Pyromancy wizard tower's fired red tiles, dark to light. */
  kiln: [0x4e0f0c, 0x80201a, 0xb23a22, 0xdc6a32],
  /** The Rime wizard tower's ice, dark to light. */
  ice: [0x2c5878, 0x4f8cb8, 0x8cc8ea, 0xdcf4ff],
  /** The Stormcalling wizard tower's thundercloud slate, dark to light. */
  cloud: [0x262c46, 0x3a4466, 0x56628a, 0x7e8cb4],
  bolt: 0xffe45a,
  /** The Crusaders' lead roof and the Assassins' den's soot-black one. */
  lead: 0x6c7886,
  dusk: 0x3a3246,
  /** The Rangers' green-stained shingles and the Skirmishers' tarred ones. */
  moss: 0x46703a,
  tar: 0x4a3c34,
  /** Green waxed canvas, dark to light, and a brass spyglass. */
  canvas: [0x2a4a24, 0x3e6a32, 0x5a8a42, 0x82b05a],
  brass: [0x7a5a22, 0xb08a3e, 0xe0c070],
  /** Pyroclasm's scorched orange roof and the Cinders' charcoal. */
  scorch: 0xb04a22,
  char: [0x16120f, 0x2a2420, 0x3e3530],
  /** Black lamp oil with its rainbow sheen. */
  oil: [0x0e0c10, 0x1e1a22, 0x3a3048, 0x6a5a8a],
  straw: [0x9c7a34, 0xc9a24e, 0xe0c070],
  target: [0xe8dcc0, 0xb3372f, 0xe9c46a],
  fire: [0xc8542a, 0xf0a040, 0xf2d27a, 0xfff4c8],
  rune: 0x9fe3ff,
  gold: [0xb08a3e, 0xe9c46a, 0xfff4c8],
  shield: [0x2f5592, 0x5b8fd9, 0x9fc1f0],
  dirt: [0x5a4a36, 0x6e5c44, 0x80704f],
  wine: [0x3a1f28, 0x4e2a36, 0x6e3a48],
  banner: [0x8e2620, 0xb3372f, 0xd8553f],
  ember: 0xff7a2e,
  marble: [0x8a8c9a, 0xb9bac6, 0xdcdce4, 0xf4f3f6, 0xffffff],
  vein: 0xa7aec4,
  sky: [0x7d9cc8, 0xa9c4e6, 0xd6e6f8],
  obsidian: [0x060508, 0x0f0d13, 0x1c1922, 0x2c2834, 0x463f52],
  sheen: 0x7a7090,
  mortar: [0x2a060c, 0x4e0b16, 0x7a1222],
  ruby: [0x3d0410, 0x7e0a1c, 0xc0182e, 0xf0425a, 0xffc4cc],
  flag: [0x1e1c22, 0x2a272f, 0x34313a],
  crate: [0x4a3018, 0x6e4a26, 0x8c6232, 0xab7c42, 0xc89a5a],
  meat: [0x5e1414, 0x8e2222, 0xb83a32, 0xd8685a],
  bone: [0xb8ae94, 0xe8e0c8],
  slime: [0x3e6a1c, 0x6aa82a, 0xa8e050],
};

/** The Revolutionary's blued gunmetal, dark to light, and its laser glow. */
const TECH = [0x141a24, 0x222c3c, 0x34445a, 0x55708e];
const GLOW = [0x2ab8d8, 0x6ff2ff, 0xd8fcff];
/** The nanobots' green glow, dark to light, and the hazard stripes' yellow. */
const NANO = [0x16502c, 0x2fa45a, 0x6ff29a, 0xd4ffe2];
const HAZARD = 0xe8c03a;

/** What each structure's damage throws down and its rubble is made of. */
const MATERIAL: Record<PlacedKind, { m: Material; ruin: Pick<Ruin, "stone" | "top" | "beams" | "round"> }> = {
  meleeGuild: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.straw, beams: true } },
  rangedGuild: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x3a3c42, 0x5a5c62, 0x7a7c84], beams: true } },
  sniperLodge: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.canvas.slice(0, 3), beams: true } },
  musketHall: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.char, beams: true } },
  gunHall: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.iron.slice(1), beams: true } },
  gunNest: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.canvas.slice(0, 3), beams: true } },
  gatlingNest: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.brass, beams: true } },
  rocketBattery: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.kiln.slice(0, 3), beams: true } },
  revolutionary: { m: { tones: TECH.slice(1, 4), roofed: false }, ruin: { stone: TECH.slice(0, 3), top: [TECH[1], TECH[3], GLOW[0]], beams: false } },
  assassinDen: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x241f2c, C.dusk, 0x544a62], beams: true } },
  bloodHall: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.wine.slice(0, 3), beams: true } },
  veilHouse: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.flag.slice(0, 3), beams: true } },
  poisonDen: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x1e3220, 0x2e4a2a, 0x46703a], beams: true } },
  spearHall: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.straw, beams: true } },
  phalanx: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x6e2a22, C.red, 0xc25a48], beams: true } },
  javelinCamp: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.canvas.slice(0, 3), beams: true } },
  lancerStable: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.plank.slice(0, 3), beams: true } },
  barracks: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x6e2a22, C.red, 0xc25a48], beams: true } },
  chapterHouse: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x4a5460, C.lead, 0x93a0ac], beams: true } },
  berserkerLodge: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.kiln.slice(0, 3), beams: true } },
  halberdYard: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x2e4a26, C.moss, 0x6a9450], beams: true } },
  heroHall: { m: { tones: C.pale.slice(1, 4), roofed: true }, ruin: { stone: C.pale.slice(1, 4), top: C.gold, beams: true } },
  shadow: { m: { tones: C.char, roofed: true }, ruin: { stone: C.char, top: [C.flag[0], C.dusk, C.slate[1]], beams: true } },
  archerBarracks: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x4a3826, C.timber, 0x8e7048], beams: true } },
  archerTower: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.plank.slice(0, 3), beams: true } },
  brazierTower: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.kiln.slice(0, 3), beams: true } },
  hawkTower: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.slime.slice(0, 3), beams: true } },
  cannonTower: { m: { tones: STONE, roofed: false }, ruin: { stone: STONE, top: C.iron.slice(1), beams: false, round: true } },
  batteryTower: { m: { tones: STONE, roofed: false }, ruin: { stone: STONE, top: C.iron.slice(1), beams: false, round: true } },
  mortarTower: { m: { tones: STONE, roofed: false }, ruin: { stone: STONE, top: C.kiln.slice(0, 3), beams: false, round: true } },
  nanoTower: { m: { tones: TECH.slice(1, 4), roofed: false }, ruin: { stone: TECH.slice(0, 3), top: [TECH[1], HAZARD, NANO[1]], beams: false } },
  watchTower: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.plank.slice(0, 3), beams: true } },
  wizardTower: { m: { tones: C.pale.slice(0, 3), roofed: true }, ruin: { stone: C.pale.slice(0, 3), top: C.slate.slice(0, 3), beams: true, round: true } },
  pyreTower: { m: { tones: C.pale.slice(0, 3), roofed: true }, ruin: { stone: C.pale.slice(0, 3), top: C.kiln.slice(0, 3), beams: true, round: true } },
  frostTower: { m: { tones: C.pale.slice(0, 3), roofed: true }, ruin: { stone: C.pale.slice(0, 3), top: C.ice.slice(0, 3), beams: true, round: true } },
  stormTower: { m: { tones: C.pale.slice(0, 3), roofed: true }, ruin: { stone: C.pale.slice(0, 3), top: C.cloud.slice(0, 3), beams: true, round: true } },
  mageGuild: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.wine.slice(0, 3), beams: true } },
  valkyriePalace: { m: { tones: C.marble.slice(1, 4), roofed: true }, ruin: { stone: C.marble.slice(1, 4), top: [C.gold[0], C.marble[2], C.marble[3]], beams: false } },
  darkKeep: { m: { tones: C.obsidian.slice(2, 5), roofed: false }, ruin: { stone: C.obsidian.slice(2, 5), top: C.mortar, beams: false } },
  monsterBait: { m: { tones: [C.crate[0], C.crate[2], C.crate[3]], roofed: false }, ruin: { stone: [C.crate[0], C.crate[1], C.crate[3]], top: [C.meat[0], C.meat[1], C.slime[1]], beams: true } },
};

/** The body's corners: one pixel in from its cells, two on the lower right
 * (where its shadow falls), like the houses. */
const frame = (w: number, h: number) => ({ x0: 1, y0: 1, x1: w - 3, y1: h - 3 });

/** The Knowledge paths that give a structure its own look, by kind. A
 * building wearing one is drawn (on the board and in its specialty panel)
 * in that look; every
 * other path keeps the base art. Add a path here and handle it in the kind's
 * painter to give it a sprite. */
export const PATH_LOOKS: Partial<Record<PlacedKind, readonly string[]>> = {
  barracks: ["crusaders", "berserkers", "halberdiers"],
  chapterHouse: ["crusaders"],
  berserkerLodge: ["berserkers"],
  halberdYard: ["halberdiers"],
  heroHall: ["whirlwind", "bladeDance", "legend"],
  valkyriePalace: ["cloudborne"],
  assassinDen: ["bloodletters", "shadowcloak", "venom", "headhunters"],
  bloodHall: ["bloodletters"],
  veilHouse: ["shadowcloak"],
  poisonDen: ["venom"],
  spearHall: ["longSpears", "setSpears"],
  phalanx: ["testudo", "spearWall"],
  javelinCamp: ["barbed", "throwingArms"],
  lancerStable: ["heavyLance", "wingedLancers"],
  musketHall: ["grenadiers", "volleyFire", "bayonets", "sharpMuskets"],
  gunHall: ["quickdraw", "duelists"],
  gunNest: ["beltFeed", "tripod"],
  gatlingNest: ["gunShield", "overdrive", "stoppingPower"],
  rocketBattery: ["clusterRockets", "salvoRacks"],
  sniperLodge: ["marksmen", "ricochet", "suppressors", "deadeye", "piercing"],
  archerBarracks: ["rangers", "skirmishers"],
  archerTower: ["fireArrows", "sharpshooters"],
  cannonTower: ["gunnery", "siegeShot"],
  brazierTower: ["fireArrows"],
  hawkTower: ["sharpshooters"],
  batteryTower: ["gunnery"],
  mortarTower: ["siegeShot"],
  watchTower: ["spotters", "signalFires"],
  wizardTower: ["pyromancy", "rime", "storm"],
  pyreTower: ["pyromancy"],
  frostTower: ["rime"],
  stormTower: ["storm"],
  mageGuild: ["pyroclasm", "cinders"],
  monsterBait: ["oilSoaked", "fortified"],
};
/** The look `kind` takes on `path`: the path when it has art, else "" (the
 * base art), so cache keys stay shared between looks that draw the same. */
export const artLook = (kind: string, path?: string): string =>
  path && PATH_LOOKS[kind as PlacedKind]?.includes(path) ? path : "";

/** A structure of `cw × ch` cells at damage `stage` (0 to 3), seeded by its
 * lot, as `(cw·ART) × (ch·ART)` RGBA pixels, in its path's `look` (see
 * `PATH_LOOKS`; "" for the base art). */
export function structurePixels(kind: PlacedKind, cw: number, ch: number, stage = 0, seed = 0, look = ""): Uint32Array {
  const w = cw * ART, h = ch * ART, out = new Uint32Array(w * h), p = pixels(out, w, h);
  PAINT[kind](p, artLook(kind, look));
  damage(p, stage, hash(seed, KINDS.indexOf(kind)), MATERIAL[kind].m);
  if (kind === "darkKeep") fissures(p, stage, hash(seed, 0xd4));
  return out;
}

/** What a fallen structure leaves, as `(cw·ART) × (ch·ART)` RGBA pixels. */
export function structureRubblePixels(kind: PlacedKind, cw: number, ch: number, seed = 0): Uint32Array {
  const w = cw * ART, h = ch * ART;
  return rubblePixels(w, h, hash(seed, KINDS.indexOf(kind), 3), { ...frame(w, h), ...MATERIAL[kind].ruin });
}

const KINDS: PlacedKind[] = ["barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower", "wizardTower", "mageGuild", "valkyriePalace", "darkKeep", "monsterBait", "meleeGuild", "rangedGuild", "sniperLodge", "musketHall", "assassinDen", "gunHall", "gunNest", "gatlingNest", "rocketBattery", "revolutionary", "spearHall", "phalanx", "javelinCamp", "lancerStable", "heroHall", "shadow", "nanoTower", "pyreTower", "frostTower", "stormTower", "chapterHouse", "berserkerLodge", "halberdYard", "bloodHall", "veilHouse", "poisonDen", "brazierTower", "hawkTower", "batteryTower", "mortarTower"];

const PAINT: Record<PlacedKind, (p: Pix, look: string) => void> = {
  meleeGuild: paintMeleeGuild,
  rangedGuild: paintRangedGuild,
  sniperLodge: paintSniperLodge,
  musketHall: paintMusketHall,
  gunHall: paintGunHall,
  gunNest: paintGunNest,
  gatlingNest: paintGatlingNest,
  rocketBattery: paintRocketBattery,
  revolutionary: paintRevolutionary,
  assassinDen: paintAssassinDen,
  bloodHall: paintBloodHall,
  veilHouse: paintVeilHouse,
  poisonDen: paintPoisonDen,
  spearHall: paintSpearHall,
  phalanx: paintPhalanx,
  javelinCamp: paintJavelinCamp,
  lancerStable: paintLancerStable,
  barracks: paintBarracks,
  chapterHouse: paintChapterHouse,
  berserkerLodge: paintBerserkerLodge,
  halberdYard: paintHalberdYard,
  heroHall: paintHeroHall,
  shadow: paintShadow,
  archerBarracks: paintArcherBarracks,
  archerTower: paintArcherTower,
  cannonTower: paintCannonTower,
  brazierTower: paintBrazierTower,
  hawkTower: paintHawkTower,
  batteryTower: paintBatteryTower,
  mortarTower: paintMortarTower,
  nanoTower: paintNanoTower,
  watchTower: paintWatchTower,
  wizardTower: paintWizardTower,
  pyreTower: paintPyreTower,
  frostTower: paintFrostTower,
  stormTower: paintStormTower,
  mageGuild: paintMageGuild,
  valkyriePalace: paintValkyriePalace,
  darkKeep: paintDarkKeep,
  monsterBait: paintMonsterBait,
};

function rect(p: Pix, x0: number, y0: number, x1: number, y1: number, c: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.set(x, y, c);
}

/** A pixel disc of radius `r` about (cx, cy), painted by `f(x, y, d, dx,
 * dy)`, where d is the distance from the centre. */
function disc(p: Pix, cx: number, cy: number, r: number, f: (x: number, y: number, d: number, dx: number, dy: number) => number | null) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const c = f(x, y, d, dx, dy);
      if (c !== null) p.set(x, y, c);
    }
}

/** 0 (lower right, in shade) to 3 (upper left, in the sun) for a point
 * (dx, dy) from a centre, dithered between steps. */
function lit(x: number, y: number, dx: number, dy: number, d: number) {
  const t = (-(dx + dy) / (Math.max(d, 0.01) * Math.SQRT2)) * 1.5 + 1.5;
  return Math.max(0, Math.min(3, Math.floor(t + ((x + y) % 2 ? 0.25 : -0.25))));
}

/** A square tower's walls: outline, a parapet of merlons and crenels (lit
 * to the upper left), and an inner outline; returns the floor's corners. */
function squareTower(p: Pix, crenels: boolean) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const ring = Math.min(x - x0, y - y0, x1 - x, y1 - y);
      if (ring === 0 || ring === 3) p.set(x, y, OUTLINE);
      else if (ring > 3) continue;
      else {
        const sunny = x - x0 < 3 || y - y0 < 3;
        const tone = sunny ? 3 : 1;
        const crenel = crenels && ring === 1 && (x + y) % 3 === 0;
        p.set(x, y, crenel ? C.stone[0] : ring === 2 ? C.stone[tone - 1] : C.stone[tone]);
      }
    }
  return { x0: x0 + 4, y0: y0 + 4, x1: x1 - 4, y1: y1 - 4 };
}

/** Plank flooring over a box, boards running across, with seams. */
function planks(p: Pix, { x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number }) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const board = Math.floor((y - y0) / 2), seam = (x + board * 3) % 6 === 5;
      const tone = (y - y0) % 2 === 1 ? 0 : 1 + (hash(board, 7) % 2);
      p.set(x, y, seam ? C.plank[0] : y === y0 || x === x0 ? C.plank[0] : C.plank[tone]);
    }
}

/** A gabled roof over a box, ridge along its long axis: two slopes (the
 * sunny one lighter) in staggered courses of tiles, the ridge in outline. */
function gable(p: Pix, x0: number, y0: number, x1: number, y1: number, base: number) {
  const along = x1 - x0 >= y1 - y0;
  const U = along ? x1 - x0 + 1 : y1 - y0 + 1, V = along ? y1 - y0 + 1 : x1 - x0 + 1, ridge = Math.floor(V / 2);
  for (let v = 0; v < V; v++)
    for (let u = 0; u < U; u++) {
      const x = along ? x0 + u : x0 + v, y = along ? y0 + v : y0 + u;
      if (v === ridge) {
        p.set(x, y, OUTLINE);
        continue;
      }
      const side = v < ridge ? 0 : 1, d = side ? v - ridge - 1 : ridge - 1 - v;
      const course = d >> 1, off = (course * 2 + side) % 3;
      let c = shade(base, side ? 0.86 : 1.13);
      const t = hash(course, side, Math.floor((u + off) / 3), 41) % 9;
      c = shade(c, t < 2 ? 0.9 : t > 7 ? 1.08 : 1);
      if (d & 1) c = shade(c, 0.8);
      else if ((u + off) % 3 === 2) c = shade(c, 0.86);
      if (v === 0 || v === V - 1) c = shade(c, 0.9);
      p.set(x, y, c);
    }
  return { along, ridge: (along ? y0 : x0) + ridge };
}

/** Stone walls round the hall, two pixels thick and lit to the upper left,
 * then the roof inside; returns the roof's ridge. */
function hall(p: Pix, x0: number, y0: number, x1: number, y1: number, roof: number) {
  rect(p, x0, y0, x1, y1, OUTLINE);
  for (let y = y0 + 1; y < y1; y++)
    for (let x = x0 + 1; x < x1; x++) p.set(x, y, x === x0 + 1 || y === y0 + 1 ? C.stone[3] : x === x1 - 1 || y === y1 - 1 ? C.stone[1] : C.stone[2]);
  rect(p, x0 + 2, y0 + 2, x1 - 2, y1 - 2, OUTLINE);
  return gable(p, x0 + 3, y0 + 3, x1 - 3, y1 - 3, roof);
}

/** The Assassins' den's emblem on the ridge: a dagger, point up. */
const DAGGER = ["..0..", ".030.", ".032.", ".032.", ".032.", "00500", "05450", "00500", ".010.", ".000."];

function paintBarracks(p: Pix, look: string) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const crusaders = look === "crusaders", berserk = look === "berserkers", halberd = look === "halberdiers";
  // Crusaders hold a lead-roofed hall, Berserkers a blood-dark one,
  // Halberdiers a mossy one.
  const { along, ridge } = hall(p, x0, y0, x1, y1, crusaders ? C.lead : berserk ? C.kiln[1] : halberd ? C.moss : C.red);
  // A chimney near one gable end.
  const [chx, chy] = along ? [x0 + 5, ridge - 2] : [ridge - 2, y0 + 5];
  for (let dy = 0; dy < 4; dy++)
    for (let dx = 0; dx < 4; dx++) {
      const rim = dx === 0 || dy === 0 || dx === 3 || dy === 3;
      p.set(chx + dx, chy + dy, rim ? OUTLINE : dx === 1 && dy === 1 ? C.stone[3] : dx === 2 && dy === 2 ? 0x2a221c : C.stone[1]);
    }
  const sx = Math.round((x0 + x1) / 2) - 2, sy = Math.round((y0 + y1) / 2) - 3;
  // The shield on the ridge, mid-roof: blue with a lit upper left and a
  // gold boss, pointed at the foot; the Crusaders' white with a red cross,
  // the Berserkers' red with crossed axes, the Halberdiers' gold with a
  // halberd.
  const white = [0xa8a49c, 0xdcd8d0, 0xfaf8f2];
  const face = crusaders ? white : berserk ? C.banner : halberd ? C.gold : C.shield;
  const shape = ["0000000", "0233110", "0231110", "0114110", "0111110", "0011100", "0001000"];
  shape.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (j === 6 && i !== 3) return;
      if (j === 5 && (i < 1 || i > 5)) return;
      const cross = crusaders && ch !== "0" && (i === 3 || j === 2);
      const axes = berserk && ch !== "0" && j <= 4 && (i - 1 === j || 5 - i === j);
      const pole = halberd && ch !== "0" && (i === 3 || (j === 1 && i === 4));
      const c = ch === "0" ? OUTLINE : cross ? (i === 3 && j < 2 ? C.banner[2] : C.banner[1]) : axes ? C.iron[3] : pole ? (j <= 1 ? C.iron[3] : C.plank[1]) : ch === "4" ? C.gold[1] : face[+ch - 1];
      p.set(sx - 1 + i, sy + j, c);
    }),
  );
}

/** The barracks' branch halls: the barracks in its branch's look, with a
 * pair of the branch's standards planted either side of the door (at the
 * lot's foot), and, climbing its path, a third over the ridge. */
function paintBranchHall(p: Pix, look: string, standard: readonly string[], pal: Record<string, number>, worn: boolean) {
  paintBarracks(p, look);
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const w = standard[0].length, h = standard.length;
  glyph(p, x0 + 1, y1 - h, standard, pal);
  glyph(p, x1 - w, y1 - h, standard, pal);
  if (worn) glyph(p, Math.round((x0 + x1 - w) / 2), y0 + 1, standard, pal);
}
/** The Chapterhouse: white banners with a red cross. */
function paintChapterHouse(p: Pix, look: string) {
  paintBranchHall(p, "crusaders", ["0000", "0120", "0220", "0120", "0000", ".03.", ".03."], { 0: OUTLINE, 1: 0xfaf8f2, 2: C.banner[1], 3: C.plank[1] }, !!look);
}
/** The Berserker lodge: blood-red banners and an axe. */
function paintBerserkerLodge(p: Pix, look: string) {
  paintBranchHall(p, "berserkers", ["000.", "0110", "0210", "0110", "000.", ".03.", ".03."], { 0: OUTLINE, 1: C.banner[0], 2: C.iron[3], 3: C.plank[1] }, !!look);
}
/** The Halberd yard: halberds stood on end in a rack. */
function paintHalberdYard(p: Pix, look: string) {
  paintBranchHall(p, "halberdiers", [".00.", "0120", ".02.", ".03.", ".03.", ".03.", ".03."], { 0: OUTLINE, 1: C.iron[3], 2: C.iron[2], 3: C.plank[1] }, !!look);
}

/** A small sprite from rows of keys into `pal` ("." clear), its top left at (x, y). */
function glyph(p: Pix, x: number, y: number, rows: readonly string[], pal: Record<string, number>) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") p.set(x + i, y + j, pal[ch]); }));
}

/** A guild's hall on the north of its lot, under a roof of `roof`, with an
 * emblem centred on it, and its packed-earth yard to the south inside a
 * fence outline; returns the yard's box. */
function guild(p: Pix, roof: number, emblem: readonly string[], pal: Record<string, number>) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const split = y0 + Math.round((y1 - y0) * 0.6);
  rect(p, x0, split, x1, y1, OUTLINE);
  for (let y = split + 1; y < y1; y++)
    for (let x = x0 + 1; x < x1; x++) p.set(x, y, C.dirt[hash(x, y, 43) % 5 === 0 ? 0 : hash(x, y, 44) % 4 === 0 ? 2 : 1]);
  hall(p, x0, y0, x1, split, roof);
  const w = emblem[0].length, h = emblem.length;
  glyph(p, Math.round((x0 + x1 - w) / 2), Math.round((y0 + split - h) / 2), emblem, pal);
  return { x0: x0 + 1, y0: split + 1, x1: x1 - 1, y1: y1 - 1 };
}

/** A clenched fist, knuckles up, in outline. */
const FIST = [".0000.", "033330", "032220", "032220", "002220", ".0110.", ".0000."];
/** A sniper's crosshair. */
const CROSSHAIR = ["..0..", ".000.", "00300", ".000.", "..0.."];
/** A burst of powder, white-hot at the heart. */
const BURST = ["0.0.0", ".010.", "01210", ".010.", "0.0.0"];

function paintMeleeGuild(p: Pix) {
  const skin = { 0: OUTLINE, 1: 0x8a5a3a, 2: 0xc98e62, 3: 0xe8b88a };
  const y = guild(p, C.straw[1], FIST, skin);
  // The sparring ring: rope on corner posts round trodden earth, and a
  // leather punching bag hung from a post in the corner.
  const rx0 = y.x0 + 1, rx1 = y.x1 - 6, ry0 = y.y0 + 1, ry1 = y.y1 - 1;
  for (let x = rx0; x <= rx1; x++) { p.set(x, ry0, C.straw[2]); p.set(x, ry1, C.straw[0]); }
  for (let yy = ry0; yy <= ry1; yy++) { p.set(rx0, yy, C.straw[2]); p.set(rx1, yy, C.straw[0]); }
  for (const [x, yy] of [[rx0, ry0], [rx1, ry0], [rx0, ry1], [rx1, ry1]]) p.set(x, yy, C.plank[0]);
  const bx = y.x1 - 2.5, by = (y.y0 + y.y1) / 2 + 0.5;
  disc(p, bx, by, 2.4, (x, yy, d, dx, dy) => (d > 1.6 ? OUTLINE : [0x5e3418, 0x7e4a24, 0xa86a3a][Math.min(2, lit(x, yy, dx, dy, d))]));
  p.set(Math.round(bx) - 1, y.y0, C.plank[1]);
}

function paintRangedGuild(p: Pix) {
  const slate = [0x3a3c42, 0x5a5c62, 0x7a7c84, 0x9ea0a8];
  // A sling's stone on the ridge.
  const y = guild(p, slate[1], [".000.", "02330", "01230", "01120", ".000."], { 0: OUTLINE, 1: slate[0], 2: slate[1], 3: slate[3] });
  // A heap of throwing stones by the door, and a clay pot on a post to aim at.
  for (const [dx, dy, r] of [[2.5, 2.5, 1.6], [4.6, 3.2, 1.4], [3.4, 4.6, 1.3], [5.8, 1.8, 1.1]] as const)
    disc(p, y.x0 + dx, y.y0 + dy, r, (x, yy, d, ox, oy) => (d > r - 0.7 ? OUTLINE : slate[1 + Math.min(2, lit(x, yy, ox, oy, d))]));
  const px = y.x1 - 3.5, py = (y.y0 + y.y1) / 2 + 0.5;
  disc(p, px, py, 2.2, (x, yy, d, dx, dy) => (d > 1.4 ? OUTLINE : [0x7a3a22, 0xa65430, 0xd07a4a][Math.min(2, lit(x, yy, dx, dy, d))]));
  p.set(Math.round(px) - 1, Math.round(py) - 1, 0x2a1810);
}

/** The Marksmen's brass spyglass, lens to the right. */
const SPYGLASS = ["0000000", "0122230", "0122230", "0000000"];
/** Ricochet's bouncing track, a zigzag. */
const ZIGZAG = ["0...0..", ".0.0.0.", "..0...0"];

/** The Sniper lodge: a canvas-roofed hall with a crosshair on the ridge over
 * a firing lane, sandbags at the near end and a small far target. Its paths
 * change the roof, the emblem and the lane: the Marksmen's a second target
 * further off, Ricochet's iron plates to ring, Suppressing fire's a double
 * sandbag wall and caltrops, Deadeye's an eye and one great target, and
 * Piercing rounds' a bullet through three marks and three targets in file. */
function paintSniperLodge(p: Pix, look: string) {
  const marks = look === "marksmen", glance = look === "ricochet", supp = look === "suppressors", deadeye = look === "deadeye", pierce = look === "piercing";
  const y = deadeye ? guild(p, C.kiln[0], EYE, { 0: OUTLINE, 1: OUTLINE, 3: C.pale[3], 4: C.canvas[2] })
    : pierce ? guild(p, C.iron[1], SKEWER, { 0: OUTLINE, 3: C.iron[3], 4: C.target[1] })
    : marks ? guild(p, C.tar, SPYGLASS, { 0: OUTLINE, 1: C.brass[0], 2: C.brass[1], 3: C.ice[3] })
    : glance ? guild(p, C.lead, ZIGZAG, { 0: C.brass[2] })
    : supp ? guild(p, C.ice[1], CROSSHAIR, { 0: OUTLINE, 3: C.ice[3] })
    : guild(p, C.canvas[1], CROSSHAIR, { 0: OUTLINE, 3: C.target[1] });
  // The firing lane: sandbags across the near end (Suppressing fire's two
  // deep), a trodden lane east to a small far target.
  for (let yy = y.y0 + 1; yy < y.y1; yy++) {
    p.set(y.x0 + 2, yy, yy % 2 ? C.straw[1] : C.straw[0]);
    p.set(y.x0 + 3, yy, OUTLINE);
    if (supp) {
      p.set(y.x0 + 4, yy, yy % 2 ? C.straw[0] : C.straw[1]);
      p.set(y.x0 + 5, yy, OUTLINE);
    }
  }
  const ly = Math.round((y.y0 + y.y1) / 2);
  for (let x = y.x0 + (supp ? 7 : 5); x < y.x1 - 3; x++) if (x % 2) p.set(x, ly, C.dirt[0]);
  if (deadeye) {
    // One great target at the lane's end, its heart gilded.
    disc(p, y.x1 - 2, ly + 0.5, 2.4, (_x, _y, d) => (d > 1.8 ? OUTLINE : d > 1.2 ? C.target[0] : d > 0.6 ? C.target[1] : C.target[2]));
    return;
  }
  if (pierce) {
    // Three small targets in file down the lane, shot through.
    for (const dx of [-1.5, -4.5, -7.5]) disc(p, y.x1 + dx, ly + 0.5, 1.2, (_x, _y, d) => (d > 0.7 ? OUTLINE : C.target[1]));
    for (let x = y.x1 - 9; x < y.x1; x++) if (x % 3 === 0) p.set(x, ly, C.iron[3]);
    return;
  }
  if (glance) {
    // Iron plates hung to ring when struck, one high, one low.
    for (const [dx, dy] of [[-1.5, -1.5], [-4.5, 1.5]] as const)
      disc(p, y.x1 + dx, ly + 0.5 + dy, 1.6, (x, yy, d, ox, oy) => (d > 1 ? OUTLINE : C.iron[1 + Math.min(2, lit(x, yy, ox, oy, d))]));
    return;
  }
  disc(p, y.x1 - 1.5, ly + 0.5, 1.7, (_x, _y, d) => (d > 1.1 ? OUTLINE : d > 0.5 ? C.target[0] : C.target[1]));
  // The Marksmen's second target, further and smaller, in the far corner.
  if (marks) disc(p, y.x1 - 1.5, y.y0 + 1.5, 1.2, (_x, _y, d) => (d > 0.7 ? OUTLINE : C.target[1]));
  // Suppressing fire's caltrops scattered across the lane.
  if (supp) for (const [dx, dy] of [[9, -1], [11, 1], [13, -2], [12, 2]] as const) p.set(y.x0 + dx, ly + dy, C.iron[3]);
}

/** Deadeye's open eye, a green iris. */
const EYE = ["..000..", ".03330.", "0334330", "0341430", "0334330", ".03330.", "..000.."];
/** Piercing rounds' bullet through three marks in file. */
const SKEWER = [".0.0.0.", ".4.4.4.", "0333333", ".4.4.4.", ".0.0.0."];

/** The Grenadiers' grenade: a black iron ball with a lit fuse. */
const GRENADE = ["...4.", "..3..", ".000.", "01220", "01120", "01110", ".000."];
/** Volley fire's crossed muskets, brass at the locks. */
const MUSKETS = ["0...0", ".0.0.", "..2..", ".1.1.", "1...1"];
/** The Bayonets' blade, point up, on a musket's muzzle. */
const BAYONET_BLADE = ["..0..", ".030.", ".032.", ".032.", ".010.", "00100", ".010."];

/** The Musket hall: a hall with a powder burst on the ridge over a yard of
 * powder kegs, scorched where shot has burst. Its paths change the roof,
 * the emblem and the yard: the Grenadiers' a heap of grenades and wider
 * scorching, Volley fire's a rack of muskets, the Bayonets' a straw dummy. */
function paintMusketHall(p: Pix, look: string) {
  const grenade = look === "grenadiers", volley = look === "volleyFire", bayonet = look === "bayonets", sharp = look === "sharpMuskets";
  const y = grenade ? guild(p, C.kiln[1], GRENADE, { 0: OUTLINE, 1: C.iron[1], 2: C.iron[2], 3: C.straw[1], 4: C.ember })
    : volley ? guild(p, C.lead, MUSKETS, { 0: C.plank[0], 1: C.plank[2], 2: C.brass[2] })
    : bayonet ? guild(p, C.moss, BAYONET_BLADE, { 0: OUTLINE, 1: C.plank[1], 2: C.iron[2], 3: C.iron[3] })
    : sharp ? guild(p, C.canvas[0], CROSSHAIR, { 0: OUTLINE, 3: C.brass[2] })
    : guild(p, 0x5a3a2a, BURST, { 0: C.ember, 1: C.fire[2], 2: C.fire[3] });
  if (sharp) {
    // A long firing lane to a far target, with a rest for the barrel.
    const ly = Math.round((y.y0 + y.y1) / 2);
    for (let yy = y.y0 + 1; yy < y.y1; yy++) p.set(y.x0 + 2, yy, yy % 2 ? C.plank[2] : C.plank[0]);
    for (let x = y.x0 + 4; x < y.x1 - 3; x++) if (x % 2) p.set(x, ly, C.dirt[0]);
    disc(p, y.x1 - 1.5, ly + 0.5, 1.7, (_x, _y, d) => (d > 1.1 ? OUTLINE : d > 0.5 ? C.target[0] : C.target[1]));
    return;
  }
  // Powder kegs stacked by the door, iron-banded and black-topped; the
  // Grenadiers' a heap of black grenades instead.
  for (const [dx, dy] of [[2.5, 2.5], [5.3, 2.5], [3.9, 5]] as const)
    disc(p, y.x0 + dx, y.y0 + dy, 1.9, (x, yy, d, ox, oy) => (d > 1.3 ? OUTLINE : grenade ? C.iron[1 + Math.min(2, lit(x, yy, ox, oy, d))] : d < 0.6 ? C.char[0] : d > 0.95 ? C.iron[2] : C.crate[1 + Math.min(2, lit(x, yy, ox, oy, d))]));
  const sx = y.x1 - 4, sy = Math.round((y.y0 + y.y1) / 2);
  if (volley) {
    // A rack of muskets leaning on a rail, barrels up.
    for (let x = sx - 1; x <= sx + 3; x++) p.set(x, sy + 1, C.plank[0]);
    for (let x = sx - 1; x <= sx + 3; x += 2)
      for (let yy = y.y0 + 1; yy <= y.y1 - 1; yy++) p.set(x, yy, yy < sy ? C.iron[3] : C.plank[2]);
    return;
  }
  if (bayonet) {
    // A straw dummy on a post, run through.
    const dx = sx + 1.5, dy = sy + 0.5;
    disc(p, dx, dy, 2.6, (x, yy, d, ox, oy) => (d > 1.8 ? OUTLINE : C.straw[Math.min(2, lit(x, yy, ox, oy, d))]));
    p.set(Math.round(dx) - 1, Math.round(dy), C.iron[3]);
    p.set(Math.round(dx), Math.round(dy), C.iron[3]);
    p.set(Math.round(dx) + 1, Math.round(dy), C.plank[0]);
    return;
  }
  // The yard scorched where shot has burst; the Grenadiers' burnt wider,
  // still smouldering.
  const scorch = [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [0, 2], [1, -1]];
  if (grenade) scorch.push([-1, 0], [2, 0], [-1, 2], [1, 2], [2, 2], [0, -1], [-2, 1], [3, 1]);
  for (const [ox, oy] of scorch) p.set(sx + ox, sy + oy, ox === 0 && oy === 1 ? (grenade ? C.ember : C.char[2]) : C.char[0]);
  if (grenade) p.set(sx + 2, sy + 2, C.fire[1]);
}

/** The Gunner hall's pistol, barrel to the right. */
const PISTOL = ["0000000", "0333330", "0002000", "..0110.", "..010..", "..000.."];
/** The machine gun on its tripod, barrel to the right. */
const MACHINE_GUN = ["00000000", "02333330", "00000000", ".0.0....", "0...0..."];
/** The Gatling's ring of barrels, end on. */
const BARRELS = [".000.", "03030", "00200", "03030", ".000."];
/** A rocket, nose up: a red cone on a fat pale body banded red, wide fins
 * and a flame under it. */
const ROCKET = ["...0...", "..020..", ".02220.", ".03330.", ".02220.", ".03330.", "0033300", "00.4.00", "...4..."];
/** Quickdraw's two pistols, one over the other, barrels to the right. */
const TWIN_PISTOLS = ["0000000.", "0333330.", "00020...", ".0000000", ".0333330", "..00020."];
/** Cluster rockets' three small rockets in a bundle. */
const CLUSTER_ROCKETS = [".0.0.0.", "0202020", "0303030", "0303030", "0000000", ".4.4.4."];

/** Sandbags round the edge of a yard box, two courses on the near side. */
function sandbags(p: Pix, y: { x0: number; y0: number; x1: number; y1: number }) {
  for (let x = y.x0; x <= y.x1; x++) {
    p.set(x, y.y1, x % 2 ? C.straw[0] : C.straw[1]);
    p.set(x, y.y0, x % 2 ? C.straw[1] : C.straw[0]);
  }
  for (let yy = y.y0; yy <= y.y1; yy++) {
    p.set(y.x0, yy, yy % 2 ? C.straw[0] : C.straw[1]);
    p.set(y.x1, yy, yy % 2 ? C.straw[1] : C.straw[0]);
  }
}

/** The Gunner hall: an iron-roofed hall with a pistol on the ridge over a
 * yard with a bench of pistols and a row of bottles on a fence to shoot at.
 * Quickdraw roofs it in red with two pistols and sets a second row of
 * bottles; the Duelists roof it in lead with a brass pistol and pace out a
 * lane between two posts. */
function paintGunHall(p: Pix, look: string) {
  const quick = look === "quickdraw", duel = look === "duelists";
  const y = quick ? guild(p, C.kiln[1], TWIN_PISTOLS, { 0: OUTLINE, 2: C.plank[1], 3: C.iron[3] })
    : guild(p, duel ? C.lead : C.iron[2], PISTOL, { 0: OUTLINE, 1: C.plank[1], 2: duel ? C.brass[0] : C.iron[1], 3: duel ? C.brass[2] : C.iron[3] });
  for (let x = y.x0 + 1; x <= y.x0 + 6; x++) { p.set(x, y.y0 + 2, C.plank[2]); p.set(x, y.y0 + 3, C.plank[0]); }
  for (const x of [y.x0 + 2, y.x0 + 5]) p.set(x, y.y0 + 1, C.iron[3]);
  if (duel) {
    // Two posts at either end of a paced-out lane, its paces scuffed.
    const ly = y.y1 - 2;
    for (const x of [y.x1 - 8, y.x1 - 1]) for (let yy = ly - 2; yy <= ly; yy++) p.set(x, yy, yy === ly - 2 ? C.target[1] : C.plank[0]);
    for (let x = y.x1 - 7; x < y.x1 - 1; x += 2) p.set(x, ly, C.dirt[0]);
    return;
  }
  for (let x = y.x1 - 6; x <= y.x1 - 1; x++) p.set(x, y.y1 - 1, C.plank[1]);
  for (let x = y.x1 - 6; x <= y.x1 - 1; x += 2) { p.set(x, y.y1 - 2, C.canvas[2]); p.set(x, y.y1 - 3, C.canvas[1]); }
  if (quick) {
    // A second, higher fence of bottles, these brown.
    for (let x = y.x1 - 6; x <= y.x1 - 1; x++) p.set(x, y.y1 - 4, C.plank[1]);
    for (let x = y.x1 - 5; x <= y.x1 - 1; x += 2) { p.set(x, y.y1 - 5, C.crate[3]); p.set(x, y.y1 - 6, C.crate[2]); }
  }
}

/** The Machine-gun nest: a canvas-roofed hall with a machine gun on the
 * ridge over a sandbagged yard holding ammunition boxes; on Belt feed the
 * roof is tarred and the yard strewn with spent brass, on Tripod the roof
 * shingled in wood and a gun stands on its tripod in the yard with range stakes. */
function paintGunNest(p: Pix, look: string) {
  const belt = look === "beltFeed", tripod = look === "tripod";
  const y = guild(p, belt ? C.tar : tripod ? C.plank[1] : C.canvas[1], MACHINE_GUN, { 0: OUTLINE, 2: C.plank[1], 3: belt ? C.brass[1] : C.iron[2] });
  sandbags(p, y);
  for (const [dx, dy] of [[2, 2], [5, 2], [2, 4]] as const) {
    rect(p, y.x0 + dx, y.y0 + dy, y.x0 + dx + 2, y.y0 + dy + 1, OUTLINE);
    p.set(y.x0 + dx + 1, y.y0 + dy, C.canvas[2]);
    p.set(y.x0 + dx + 1, y.y0 + dy + 1, C.canvas[0]);
  }
  if (belt) for (const [dx, dy] of [[9, 2], [11, 3], [10, 4], [13, 2], [12, 5], [14, 4]] as const) p.set(y.x0 + dx, y.y0 + dy, C.brass[2]);
  if (tripod) {
    // The gun on its splayed legs, outlined in black, and white-topped
    // stakes paced out beyond.
    const gx = y.x0 + 9, gy = y.y0 + 1;
    for (let x = gx - 1; x <= gx + 6; x++) { p.set(x, gy - 1, OUTLINE); p.set(x, gy + 1, OUTLINE); }
    for (let x = gx; x <= gx + 5; x++) p.set(x, gy, x === gx + 5 ? C.iron[3] : x < gx + 2 ? C.iron[2] : C.iron[1]);
    p.set(gx - 1, gy, OUTLINE); p.set(gx + 6, gy, OUTLINE);
    for (const [dx, dy] of [[1, 2], [0, 3], [2, 2], [3, 3], [1, 3]] as const) p.set(gx + dx, gy + dy, C.plank[0]);
    for (const dx of [7, 10, 13]) if (y.x0 + dx < y.x1) { p.set(y.x0 + dx, y.y1 - 2, C.target[0]); p.set(y.x0 + dx, y.y1 - 1, C.plank[0]); }
  }
}

/** The Gatling emplacement: a brass-roofed hall with the gun's barrels on
 * the ridge over a sandbagged yard where the great gun stands on its
 * carriage. Gun shield roofs it in iron and stands a riveted plate before
 * the gun; Overdrive roofs it in red tiles, the barrels' ends glowing hot;
 * Stopping power roofs it in pale blue, a flared muzzle over scraped furrows. */
function paintGatlingNest(p: Pix, look: string) {
  const shield = look === "gunShield", over = look === "overdrive", stop = look === "stoppingPower";
  const y = guild(p, shield ? C.iron[1] : over ? C.kiln[1] : stop ? C.ice[1] : C.brass[0], BARRELS, { 0: OUTLINE, 2: over ? C.ember : C.brass[2], 3: over ? C.fire[1] : C.iron[2] });
  sandbags(p, y);
  const cy = Math.round((y.y0 + y.y1) / 2), cx = Math.round((y.x0 + y.x1) / 2) - 3;
  for (const dx of [-1, 4]) disc(p, cx + dx + 0.5, cy + 1.5, 1.6, (x, yy, d, ox, oy) => (d > 1 ? OUTLINE : C.plank[Math.min(3, lit(x, yy, ox, oy, d))]));
  for (let x = cx; x <= cx + 7; x++) for (let r = -1; r <= 1; r++) p.set(x, cy + r, r === 0 ? OUTLINE : C.iron[x % 2 ? 2 : 3]);
  p.set(cx + 8, cy, over ? C.ember : C.iron[3]);
  if (over) for (const [dx, dy] of [[6, -1], [7, 1], [8, -1], [8, 1], [9, 0]] as const) p.set(cx + dx, cy + dy, dx > 7 ? C.fire[2] : C.ember);
  if (stop) {
    // A flared muzzle, and furrows scraped back in the dirt beyond.
    for (let r = -2; r <= 2; r++) p.set(cx + 9, cy + r, Math.abs(r) === 2 ? OUTLINE : C.iron[3]);
    for (const r of [-1, 1]) p.set(cx + 10, cy + r * 2, OUTLINE);
    for (const [dx, dy] of [[12, -2], [13, -2], [14, -2], [12, 2], [13, 2], [15, 0], [16, 0]] as const) if (cx + dx < y.x1) p.set(cx + dx, cy + dy, C.dirt[0]);
  }
  if (shield) {
    // The shield: a tall pale steel plate across the barrels in a black
    // outline, riveted in brass, a slot to aim through.
    const x0 = cx + 4, x1 = cx + 7, y0 = cy - 4, y1 = cy + 3;
    for (let yy = y0; yy <= y1; yy++)
      for (let x = x0; x <= x1; x++) p.set(x, yy, x === x0 || x === x1 || yy === y0 || yy === y1 ? OUTLINE : yy === cy ? OUTLINE : x === x0 + 1 ? C.pale[3] : C.pale[1]);
    for (const [x, yy] of [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]]) p.set(x, yy, C.brass[2]);
  }
}

/** The Revolutionary: a flat-roofed hall of blued gunmetal panels, a glowing
 * conduit round its roof, a sensor dome in the middle with a laser lens and
 * crosshairs, a sniper's perch on three corners, each with its long rail
 * rifle turned outward, and a mast with a red light on the fourth. */
function paintRevolutionary(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  rect(p, x0, y0, x1, y1, OUTLINE);
  for (let y = y0 + 1; y < y1; y++)
    for (let x = x0 + 1; x < x1; x++) {
      const edge = x === x0 + 1 || y === y0 + 1 ? TECH[3] : x === x1 - 1 || y === y1 - 1 ? TECH[0] : null;
      // Roof panels: seams every four pixels, every other panel a shade lighter.
      const seam = (x - x0) % 4 === 0 || (y - y0) % 4 === 0;
      p.set(x, y, edge ?? (seam ? TECH[0] : ((x - x0) >> 2) % 2 === ((y - y0) >> 2) % 2 ? TECH[2] : TECH[1]));
    }
  // The conduit: a dashed glowing line inset round the roof.
  for (let x = x0 + 3; x <= x1 - 3; x++) for (const y of [y0 + 3, y1 - 3]) p.set(x, y, x % 3 ? GLOW[0] : GLOW[1]);
  for (let y = y0 + 3; y <= y1 - 3; y++) for (const x of [x0 + 3, x1 - 3]) p.set(x, y, y % 3 ? GLOW[0] : GLOW[1]);
  // The sensor dome, lit from the upper left, its lens glowing.
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  disc(p, cx, cy, 5.4, (x, y, d, dx, dy) => (d > 4.6 ? OUTLINE : TECH[Math.min(3, lit(x, y, dx, dy, d))]));
  for (let i = -4; i <= 4; i++) if (Math.abs(i) > 1) { p.set(Math.floor(cx) + i, Math.floor(cy), GLOW[0]); p.set(Math.floor(cx), Math.floor(cy) + i, GLOW[0]); }
  disc(p, cx, cy, 1.8, (_x, _y, d) => (d > 1.2 ? GLOW[1] : GLOW[2]));
  // Three perches, each a pad with a rail rifle reaching outward.
  const perch = (px: number, py: number, ux: number, uy: number) => {
    rect(p, px - 2, py - 2, px + 2, py + 2, OUTLINE);
    rect(p, px - 1, py - 1, px + 1, py + 1, TECH[3]);
    p.set(px, py, GLOW[1]);
    for (let i = 1; i <= 5; i++) {
      p.set(px + ux * (i + 1), py + uy * (i + 1), i === 5 ? GLOW[2] : TECH[3]);
      if (ux && uy) p.set(px + ux * (i + 1) - ux, py + uy * (i + 1), OUTLINE);
    }
  };
  perch(x0 + 6, y0 + 6, -1, -1);
  perch(x1 - 6, y0 + 6, 1, -1);
  perch(x1 - 6, y1 - 6, 1, 1);
  // The mast: a thin pole and its red light.
  const mx = x0 + 6, my = y1 - 6;
  for (let y = my - 3; y <= my + 2; y++) { p.set(mx, y, TECH[3]); p.set(mx + 1, y, OUTLINE); }
  disc(p, mx + 0.5, my - 3.5, 1.5, (_x, _y, d) => (d > 1 ? OUTLINE : 0xff4a3a));
}

/** The Rocket battery: a red-tiled hall with a rocket on the ridge over a
 * yard with a rack of rockets slanted up and a scorched launch pad. Cluster
 * rockets roof it in soot with a bundle of rockets, the pad a crater ringed
 * by bomblet scorches; Salvo racks roof it in lead and fill a second rack. */
function paintRocketBattery(p: Pix, look: string) {
  const cluster = look === "clusterRockets", salvo = look === "salvoRacks";
  const y = cluster ? guild(p, C.char[2], CLUSTER_ROCKETS, { 0: OUTLINE, 2: C.banner[2], 3: C.pale[2], 4: C.ember })
    : guild(p, salvo ? C.lead : C.kiln[2], ROCKET, { 0: OUTLINE, 2: C.banner[2], 3: C.pale[2], 4: C.ember });
  // The rack: a rail with three rockets leaning on it, noses up and right;
  // Salvo racks' a second rail behind with three more.
  const rack = (ry: number) => {
    for (let x = y.x0 + 1; x <= y.x0 + 8; x++) p.set(x, ry, C.plank[0]);
    for (let i = 0; i < 3; i++) {
      const bx = y.x0 + 1 + i * 3;
      for (let k = 0; k < 4; k++) p.set(bx + k, ry - 1 - k, k === 3 ? C.banner[2] : C.pale[2]);
    }
  };
  rack(y.y1 - 1);
  if (salvo) rack(y.y1 - 5);
  // Scorched pad; the cluster's crater wider, ringed by bomblets' marks.
  const sx = y.x1 - 4, sy = Math.round((y.y0 + y.y1) / 2);
  for (const [ox, oy] of [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [0, 2], [1, -1], [-1, 0], [2, 0]]) p.set(sx + ox, sy + oy, C.char[ox === 0 && oy === 1 ? 2 : 0]);
  if (cluster) for (const [ox, oy] of [[-3, 1], [4, 1], [1, -3], [1, 4], [-2, -2], [3, 3]]) p.set(sx + ox, sy + oy, oy === 4 ? C.ember : C.char[0]);
}

/** The Shadowcloak's hood with two eyes glinting in it. */
const HOOD = ["..000..", ".01110.", "0122210", "0200020", "0204020", "0200020", "0122210", "0011100"];
/** The Venomblades' green vial, stoppered. */
const VIAL = ["..0..", ".030.", "00000", "02220", "21112", "21112", "02220", ".000."];
/** The Headhunters' skull. */
const SKULL = [".000.", "02220", "20202", "02220", ".202.", ".000."];

/** The Assassins' den: a soot-black hall with a dagger on the ridge over a
 * yard with a knife-scarred straw dummy and a rack of blades. Its paths
 * change the roof, the emblem and what lies in the yard. */
function paintAssassinDen(p: Pix, look: string) {
  const steel = { 0: OUTLINE, 1: C.iron[1], 2: C.iron[2], 3: C.iron[3], 4: C.ruby[3], 5: C.gold[1] };
  const blood = { ...steel, 2: C.ruby[2], 3: C.ruby[3], 4: C.ruby[4] };
  const roof = look === "bloodletters" ? C.wine[1] : look === "shadowcloak" ? C.flag[1] : look === "venom" ? 0x2e4a2a : look === "headhunters" ? C.tar : C.dusk;
  const y = look === "shadowcloak" ? guild(p, roof, HOOD, { 0: OUTLINE, 1: C.slate[1], 2: C.flag[0], 4: 0xc8f0ff })
    : look === "venom" ? guild(p, roof, VIAL, { 0: OUTLINE, 1: C.slime[1], 2: C.slime[2], 3: C.bone[1] })
    : look === "headhunters" ? guild(p, roof, SKULL, { 0: OUTLINE, 2: C.bone[1] })
    : guild(p, roof, DAGGER, look === "bloodletters" ? blood : steel);
  // A straw dummy on a post, scored by knives.
  const dx = y.x0 + 3.5, dy = (y.y0 + y.y1) / 2 + 0.5;
  disc(p, dx, dy, 2.6, (x, yy, d, ox, oy) => (d > 1.8 ? OUTLINE : C.straw[Math.min(2, lit(x, yy, ox, oy, d))]));
  p.set(Math.round(dx) - 1, Math.round(dy) - 1, C.plank[0]);
  p.set(Math.round(dx), Math.round(dy), C.plank[0]);
  if (look === "bloodletters") {
    // Blood soaked into the yard round the dummy.
    for (const [ox, oy] of [[-2, 2], [-1, 3], [2, 2], [3, 1], [1, -3], [-3, -1], [0, 3]]) p.set(Math.round(dx) + ox, Math.round(dy) + oy, C.ruby[ox & 1 ? 1 : 0]);
  }
  const rx = y.x1 - 4, ry0 = y.y0 + 1, ry1 = y.y1 - 1;
  if (look === "venom") {
    // A bubbling green pot where the blades are dipped.
    disc(p, rx + 1.5, (ry0 + ry1) / 2 + 0.5, 2.4, (x, yy, d, ox, oy) => (d > 1.7 ? OUTLINE : d < 1 ? C.slime[1 + Math.min(1, lit(x, yy, ox, oy, d))] : C.iron[1]));
    return;
  }
  if (look === "headhunters") {
    // A bounty board, its notices pinned up.
    rect(p, rx - 1, ry0, rx + 3, ry1, OUTLINE);
    rect(p, rx, ry0 + 1, rx + 2, ry1 - 1, C.plank[2]);
    for (let yy = ry0 + 1; yy < ry1; yy += 2) p.set(rx + 1, yy, C.target[0]);
    return;
  }
  // A rack of blades against the fence; the Shadowcloak's draped in black.
  for (let yy = ry0; yy <= ry1; yy++) p.set(rx, yy, C.plank[0]);
  for (let yy = ry0 + 1; yy < ry1; yy += 2) {
    p.set(rx + 1, yy, look === "shadowcloak" ? C.flag[2] : C.iron[3]);
    p.set(rx + 2, yy, look === "shadowcloak" ? C.flag[0] : C.iron[2]);
  }
}

/** The Assassins' den's branch dens: the den in its branch's look, a pair
 * of the branch's tokens at the hall's top corners, and, climbing its path,
 * a third at the yard's foot. */
function paintBranchDen(p: Pix, look: string, token: readonly string[], pal: Record<string, number>, worn: boolean) {
  paintAssassinDen(p, look);
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const w = token[0].length, h = token.length;
  glyph(p, x0 + 1, y0 + 1, token, pal);
  glyph(p, x1 - w, y0 + 1, token, pal);
  if (worn) glyph(p, Math.round((x0 + x1 - w) / 2), y1 - h, token, pal);
}
/** The Blood hall: red candles burning. */
function paintBloodHall(p: Pix, look: string) {
  paintBranchDen(p, "bloodletters", [".2.", "000", "010", "010", "000"], { 0: OUTLINE, 1: C.ruby[2], 2: C.fire[2] }, !!look);
}
/** The Veil house: black veils hung on hooks. */
function paintVeilHouse(p: Pix, look: string) {
  paintBranchDen(p, "shadowcloak", ["000", "010", "121", "010", "0.0"], { 0: OUTLINE, 1: C.flag[0], 2: 0xc8f0ff }, !!look);
}
/** The Poison den: stoppered green flasks. */
function paintPoisonDen(p: Pix, look: string) {
  paintBranchDen(p, "venom", [".0.", "030", "010", "121", "000"], { 0: OUTLINE, 1: C.slime[1], 2: C.slime[2], 3: C.bone[1] }, !!look);
}

/** A spear point up, its shaft below. */
const SPEAR = ["..0..", ".030.", "03330", ".030.", "..0..", ".010.", ".010.", ".010.", ".010.", ".000."];
/** A round shield with a boss. */
const ROUND_SHIELD = ["..0000..", ".033330.", "03322220", "03224220", "03222220", "02222220", ".022220.", "..0000.."];
/** Two javelins crossed. */
const CROSSED = ["30...3", "01..10", ".0110.", ".0110.", "01..10", "0....0"];
/** A horse's head, facing right. */
const HORSE = [
  "..0.0....",
  ".02020...",
  ".0222200.",
  "0222422200",
  "02222222220",
  ".0220002220",
  "02220...00.",
  "0220.......",
];
/** A white wing. */
const WING = ["00.......", "0300.....", "033300...", "0333330..", ".03333330", "..0222220", "...00000."];

/** Spears leaning in a rack across `x0`..`x1`, `n` of them, `tall` pixels
 * long, their iron points up, rising from `y`. */
function spearRack(p: Pix, x0: number, x1: number, y: number, tall: number) {
  for (let x = x0; x <= x1; x++) p.set(x, y, OUTLINE);
  for (let x = x0 + 1; x < x1; x += 2) {
    for (let yy = y - tall + 1; yy < y; yy++) p.set(x, yy, C.plank[1]);
    p.set(x, y - tall, C.iron[3]);
    p.set(x, y - tall - 1, OUTLINE);
  }
}

/** The Spearmen hall: ochre tiles and a spear on the ridge, a rack of
 * spears and a straw dummy on a pole in the yard. Long spears re-roof it
 * in green and rack spears twice as long across the yard; Set spears roof
 * it in iron grey and plant a row of braced stakes along the fence. */
function paintSpearHall(p: Pix, look: string) {
  const long = look === "longSpears", set = look === "setSpears";
  const y = guild(p, long ? C.moss : set ? C.iron[2] : 0xb08040, SPEAR, { 0: OUTLINE, 1: C.plank[2], 3: C.iron[3] });
  const dx = y.x1 - 4.5, dy = (y.y0 + y.y1) / 2 + 0.5;
  disc(p, dx, dy, 2.4, (x, yy, d, ox, oy) => (d > 1.6 ? OUTLINE : C.straw[Math.min(2, lit(x, yy, ox, oy, d))]));
  p.set(Math.round(dx) - 1, Math.round(dy), C.plank[0]);
  if (long) {
    spearRack(p, y.x0 + 1, y.x0 + 14, y.y1 - 1, 7);
    return;
  }
  spearRack(p, y.x0 + 1, y.x0 + 8, y.y1 - 1, 4);
  if (set) {
    // Stakes braced at a slant along the fence, points out.
    for (let x = y.x0 + 10; x < y.x1 - 7; x += 3) {
      p.set(x, y.y1 - 1, C.plank[0]);
      p.set(x + 1, y.y1 - 2, C.plank[1]);
      p.set(x + 2, y.y1 - 3, C.iron[3]);
    }
  }
}

/** The Phalanx: red tiles and a bronze shield on the ridge, round shields
 * leaning in a row along its yard. Testudo roofs it in lead and locks the
 * shields in a tight block, rim to rim; Spear wall roofs it in bronze and
 * bristles the fence with spear points. */
function paintPhalanx(p: Pix, look: string) {
  const testudo = look === "testudo", wall = look === "spearWall";
  const y = guild(p, testudo ? C.lead : wall ? C.brass[0] : C.red, ROUND_SHIELD, { 0: OUTLINE, 2: C.brass[1], 3: C.gold[1], 4: C.red });
  const shield = (cx: number, cy: number) => disc(p, cx, cy, 2.1, (x, yy, d, ox, oy) => (d > 1.4 ? OUTLINE : d < 0.6 ? C.red : C.brass[Math.min(2, lit(x, yy, ox, oy, d))]));
  if (testudo) {
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) shield(y.x0 + 3.5 + i * 3.5, y.y0 + 2.5 + r * 3.5);
  } else for (let i = 0; i < 4; i++) shield(y.x0 + 3.5 + i * 4, (y.y0 + y.y1) / 2 + 0.5);
  if (wall) {
    // A hedge of spear points along the fence.
    for (let x = y.x0 + 1; x < y.x1; x += 2) p.set(x, y.y0, C.iron[3]);
    for (let x = y.x1 - 9; x < y.x1; x += 2) { p.set(x, y.y1 - 1, C.plank[1]); p.set(x, y.y1 - 2, C.plank[1]); p.set(x, y.y1 - 3, C.iron[3]); }
  }
}

/** The Javelin camp: olive thatch and crossed javelins on the ridge, a straw
 * butt in its yard stuck with javelins. Barbed javelins roof it in wine and
 * hang a boar's hide with hooks by the butt; Throwing arms roof it in canvas
 * and pace out a second, further butt. */
function paintJavelinCamp(p: Pix, look: string) {
  const barbed = look === "barbed", arms = look === "throwingArms";
  const y = guild(p, barbed ? C.wine[1] : arms ? C.shield[0] : C.moss, CROSSED, { 0: OUTLINE, 1: C.plank[2], 3: C.iron[3] });
  const butt = (cx: number, cy: number, stuck: number) => {
    disc(p, cx, cy, 2.6, (x, yy, d, ox, oy) => (d > 1.8 ? OUTLINE : d < 0.8 ? C.target[1] : C.straw[Math.min(2, lit(x, yy, ox, oy, d))]));
    for (let i = 0; i < stuck; i++) { p.set(Math.round(cx) - 2 + i * 2, Math.round(cy) - 3, C.plank[1]); p.set(Math.round(cx) - 2 + i * 2, Math.round(cy) - 4, C.plank[2]); }
  };
  butt(y.x1 - 4.5, (y.y0 + y.y1) / 2 + 0.5, 3);
  if (arms) butt(y.x1 - 11.5, (y.y0 + y.y1) / 2 + 1.5, 2);
  // Javelins waiting in the ground by the door.
  for (let x = y.x0 + 2; x <= y.x0 + 6; x += 2) for (let yy = y.y0 + 1; yy <= y.y1 - 1; yy++) p.set(x, yy, yy === y.y0 + 1 ? C.iron[3] : C.plank[1]);
  if (barbed) {
    // A boar's hide pegged out, red barbs hung beside it.
    const hx = y.x0 + 9, hy = y.y0 + 2;
    rect(p, hx, hy, hx + 5, hy + 4, OUTLINE);
    rect(p, hx + 1, hy + 1, hx + 4, hy + 3, C.plank[0]);
    for (let i = 0; i < 3; i++) p.set(hx + 7 + i, hy + 1 + (i & 1), C.ruby[2]);
  }
}

/** The Lancer stable: a timber stable under brown shingles with a horse's
 * head on the ridge, its yard a tilting run past a quintain, hay bales and
 * a trough. Heavy lance roofs it in iron and racks heavy lances, the
 * quintain shield red; Winged lancers roof it in white marble with a wing
 * on the ridge and scatter white feathers. */
function paintLancerStable(p: Pix, look: string) {
  const heavy = look === "heavyLance", winged = look === "wingedLancers";
  const y = winged ? guild(p, C.marble[2], WING, { 0: OUTLINE, 2: C.gold[1], 3: C.marble[4] })
    : guild(p, heavy ? C.iron[1] : C.plank[1], HORSE, { 0: OUTLINE, 2: 0x9c6a3a, 4: OUTLINE });
  // The tilting run: a rail down the yard, the quintain at its end.
  const ry = Math.round((y.y0 + y.y1) / 2);
  for (let x = y.x0 + 1; x < y.x1 - 6; x++) p.set(x, ry, (x & 1) ? C.plank[2] : C.plank[0]);
  const qx = y.x1 - 4;
  for (let yy = y.y0 + 1; yy <= y.y1 - 1; yy++) p.set(qx, yy, C.plank[0]);
  rect(p, qx - 2, y.y0 + 1, qx + 2, y.y0 + 1, C.plank[1]);
  rect(p, qx + 1, y.y0 + 2, qx + 2, y.y0 + 4, heavy ? C.banner[1] : C.shield[1]);
  // Hay bales and a trough.
  rect(p, y.x0 + 1, y.y1 - 2, y.x0 + 3, y.y1 - 1, C.straw[1]);
  rect(p, y.x0 + 5, y.y1 - 2, y.x0 + 9, y.y1 - 1, OUTLINE);
  for (let x = y.x0 + 6; x <= y.x0 + 8; x++) p.set(x, y.y1 - 2, C.ice[1]);
  if (heavy) for (let x = y.x0 + 12; x <= y.x0 + 16; x += 2) for (let yy = y.y1 - 3; yy <= y.y1 - 1; yy++) p.set(x, yy, yy === y.y1 - 3 ? C.iron[3] : C.iron[1]);
  if (winged) for (const [dx, dy] of [[2, 1], [7, 2], [11, 1], [14, 3], [9, 4]] as const) { p.set(y.x0 + dx, y.y0 + dy, C.marble[4]); p.set(y.x0 + dx + 1, y.y0 + dy, C.marble[2]); }
}

/** A longsword point up: its blade (3 lit, 2 shaded), a gold guard and pommel, a leather grip. */
const LONGSWORD = ["...0...", "..030..", "..032..", "..032..", "..032..", "..032..", "..032..", "0000000", "0555550", "0000000", "..040..", "..050..", "..000.."];
/** A laurel wreath round a gold star, Legend's emblem. */
const LAUREL = [".00.00.", "0300030", "03.5.30", "0355530", "03.5.30", "0300030", ".03030.", "..000.."];

/** Three blades whirling about a gold hub, Whirlwind's emblem, `r` pixels round (cx, cy). */
function pinwheel(p: Pix, cx: number, cy: number, r: number) {
  disc(p, cx, cy, r, (x, y, d, dx, dy) => {
    if (d < 1.4) return d < 0.9 ? C.gold[2] : C.gold[1];
    // Each arm curls back with distance: steel in a black edge.
    const a = Math.atan2(dy, dx) - d * 0.7, arm = ((a % (Math.PI * 2 / 3)) + Math.PI * 2) % (Math.PI * 2 / 3);
    if (arm > 1.25) return null;
    return arm < 0.25 || arm > 1.0 || d > r - 0.8 ? OUTLINE : arm < 0.55 ? C.marble[4] : C.ice[2];
  });
}

/** The Hero's hall: pale stone under gilded tiles, a great sword on the
 * ridge, its yard a round sand arena ringed by stone, straw dummies round
 * it. Whirlwind roofs it in storm slate under whirling blades, a double
 * spiral swept through the sand and its dummies knocked flat round it;
 * Blade dance roofs it in black-crimson under a red-edged sword, crossed
 * swords racked by the door and a row of dummies across the arena, each
 * cut through; Legend roofs it in white marble under a laurel, a gilded
 * statue of the hero, sword raised, on a plinth in the arena's heart. */
function paintHeroHall(p: Pix, look: string) {
  const whirl = look === "whirlwind", dance = look === "bladeDance", legend = look === "legend";
  const { x0, y0, x1 } = frame(p.w, p.h);
  const y = whirl ? guild(p, C.cloud[2], ["."], {})
    : legend ? guild(p, C.marble[2], LAUREL, { 0: OUTLINE, 3: C.moss, 5: C.gold[1] })
    : guild(p, dance ? 0x4a141c : C.gold[0], LONGSWORD, { 0: OUTLINE, 2: dance ? C.banner[1] : C.iron[2], 3: C.marble[3], 4: C.plank[1], 5: C.gold[1] });
  if (whirl) pinwheel(p, (x0 + x1 + 1) / 2, (y0 + y.y0) / 2, 5.2);
  // The arena: sand inside a ring of stone, lit from the upper left.
  const cx = (y.x0 + y.x1 + 1) / 2, cy = (y.y0 + y.y1 + 1) / 2, r = Math.min(y.x1 - y.x0, y.y1 - y.y0) / 2;
  const sand = [0x9a7c4c, 0xc8a86e, 0xe0c890];
  disc(p, cx, cy, r, (x, yy, d, dx, dy) => (d > r - 1 ? OUTLINE : d > r - 2.2 ? C.stone[1 + Math.min(2, lit(x, yy, dx, dy, d))] : sand[hash(x, yy, 61) % 5 === 0 ? 0 : 1 + (hash(x, yy, 62) % 2)]));
  const dummy = (dx: number, dy: number, down = false) => {
    const x = Math.round(dx), yy = Math.round(dy);
    if (down) {
      // Knocked flat: the straw body lying across, its post snapped.
      rect(p, x - 2, yy - 1, x + 2, yy + 1, OUTLINE);
      rect(p, x - 1, yy, x + 1, yy, C.straw[1]);
      p.set(x + 2, yy, C.plank[0]);
      return;
    }
    rect(p, x - 1, yy - 2, x + 1, yy + 1, OUTLINE);
    p.set(x, yy - 1, C.straw[2]);
    p.set(x, yy, C.straw[1]);
    p.set(x, yy + 2, C.plank[0]);
  };
  if (dance) {
    // A row of dummies across the arena, each cut through with a red gash,
    // and crossed swords racked either side of the door.
    for (let i = -1; i <= 1; i++) {
      const dx = Math.round(cx + i * 4), dy = Math.round(cy);
      dummy(dx, dy);
      p.set(dx - 1, dy - 2, C.banner[2]);
      p.set(dx, dy - 1, C.banner[1]);
      p.set(dx + 1, dy, C.banner[2]);
    }
    glyph(p, y.x0 + 1, y.y0 + 1, CROSSED, { 0: OUTLINE, 1: C.gold[1], 3: C.marble[3] });
    glyph(p, y.x1 - 6, y.y0 + 1, CROSSED, { 0: OUTLINE, 1: C.gold[1], 3: C.marble[3] });
    return;
  }
  if (whirl) {
    // A double spiral swept through the sand.
    for (let t = 0; t < 40; t++)
      for (const arm of [0, Math.PI]) {
        const a = t * 0.3 + arm, rr = 0.6 + t * 0.14;
        if (rr < r - 2.4) p.set(Math.floor(cx + Math.cos(a) * rr), Math.floor(cy + Math.sin(a) * rr), C.dirt[0]);
      }
  }
  if (legend) {
    // The statue: a gold figure, its sword raised, on a stone plinth.
    const sx = Math.round(cx), sy = Math.round(cy);
    rect(p, sx - 4, sy + 1, sx + 3, sy + 4, OUTLINE);
    rect(p, sx - 3, sy + 2, sx + 2, sy + 3, C.stone[2]);
    for (let x = sx - 3; x <= sx + 2; x++) p.set(x, sy + 2, C.stone[3]);
    rect(p, sx - 3, sy - 4, sx + 1, sy + 1, OUTLINE);
    rect(p, sx - 2, sy - 3, sx, sy, C.gold[1]);
    p.set(sx - 2, sy - 3, C.gold[2]);
    p.set(sx - 1, sy - 4, C.gold[1]);
    // The raised sword, up past its head.
    for (let i = 0; i <= 5; i++) { p.set(sx + 1, sy - 2 - i, i === 0 ? C.gold[1] : C.marble[4]); p.set(sx + 2, sy - 2 - i, OUTLINE); }
    p.set(sx + 1, sy - 8, OUTLINE);
  }
  // Dummies round the ring (flat for Whirlwind's).
  for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) dummy(cx + ox * (r + 0.2) * 0.62, cy + oy * (r - 1) * 0.62, whirl);
}

/** A hooded shade's face: a black cowl round pale eyes. */
const SHADE_FACE = ["..000..", ".01110.", "0122210", "0244420", "0214120", "0122210", ".01110.", "0.0.0.0"];

/** The Shadow: a black shrine, and in its yard six knives stuck point down
 * in a ring round a pool of darkness, wisps rising off it. */
function paintShadow(p: Pix) {
  const y = guild(p, C.flag[1], SHADE_FACE, { 0: OUTLINE, 1: C.flag[2], 2: C.dusk, 4: 0xd8e4ff });
  for (let yy = y.y0; yy <= y.y1; yy++)
    for (let x = y.x0; x <= y.x1; x++) p.set(x, yy, C.char[hash(x, yy, 71) % 6 === 0 ? 0 : hash(x, yy, 72) % 5 === 0 ? 2 : 1]);
  const cx = (y.x0 + y.x1 + 1) / 2, cy = (y.y0 + y.y1 + 1) / 2, r = Math.min(y.x1 - y.x0, y.y1 - y.y0) / 2;
  // The pool: black at its heart, a violet sheen at its lit edge.
  disc(p, cx, cy, r * 0.55, (x, yy, d, dx, dy) => (d > r * 0.55 - 0.8 ? OUTLINE : lit(x, yy, dx, dy, d) > 1 ? C.slate[1] : d < r * 0.3 ? 0x07060a : C.flag[0]));
  // Six knives round it, each a little steel triangle pointing in.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3, kx = Math.round(cx + Math.cos(a) * (r - 1.2)), ky = Math.round(cy + Math.sin(a) * (r - 1.2));
    p.set(kx, ky, C.iron[3]);
    p.set(kx + (Math.cos(a) > 0 ? 1 : -1), ky, OUTLINE);
    p.set(kx, ky + (Math.sin(a) > 0 ? 1 : -1), C.iron[2]);
  }
  // Wisps of darkness rising off the pool.
  for (const [ox, oy] of [[-1, -2], [1, -3], [0, -4]]) p.set(Math.round(cx) + ox, Math.round(cy) + oy, C.slate[2]);
}

function paintArcherBarracks(p: Pix, look: string) {
  const rangers = look === "rangers", skirmishers = look === "skirmishers";
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const split = y0 + Math.round((y1 - y0) * 0.62);
  // The yard: packed earth inside a fence outline.
  rect(p, x0, split, x1, y1, OUTLINE);
  for (let y = split + 1; y < y1; y++)
    for (let x = x0 + 1; x < x1; x++) p.set(x, y, C.dirt[hash(x, y, 43) % 5 === 0 ? 0 : hash(x, y, 44) % 4 === 0 ? 2 : 1]);
  for (let x = x0 + 1; x < x1; x += 3) p.set(x, y1 - 1, C.plank[2]);
  hall(p, x0, y0, x1, split, rangers ? C.moss : skirmishers ? C.tar : C.timber);
  for (let x = x0 + 2; x < x0 + 7; x++) p.set(x, split + 2, x % 2 ? C.plank[3] : C.plank[1]);
  const ty = (split + y1) / 2 + 0.5;
  if (skirmishers) {
    // Straw dummies on posts scattered over the yard, a trail of scuffed
    // footprints weaving between them.
    for (let x = x0 + 2; x < x1 - 1; x++) if ((x + Math.round(Math.sin(x * 0.9) * 1.5)) % 3 === 0) p.set(x, Math.round(ty + Math.sin(x * 0.9) * 1.5), C.dirt[0]);
    for (const [dx, dy] of [[x0 + 5, ty - 1], [x1 - 9, ty + 1], [x1 - 4, ty - 1]]) {
      const x = Math.round(dx), y = Math.round(dy);
      for (const [ox, oy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) {
        p.set(x + ox - 1, y + oy, OUTLINE);
        p.set(x + ox + 1, y + oy, OUTLINE);
        p.set(x + ox, y + oy - 1, OUTLINE);
        p.set(x + ox, y + oy + 1, OUTLINE);
      }
      for (const [ox, oy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) p.set(x + ox, y + oy, ox < 0 || oy < 0 ? C.straw[2] : C.straw[1]);
      p.set(x, y, C.target[1]);
    }
    return;
  }
  // The butt: straw bale under a painted target, toward the yard's east
  // (the Rangers' set further off, a green-ringed one beside it).
  if (rangers) {
    const gx = x0 + 6.5;
    disc(p, gx, ty, 2.6, (x, y, d, dx, dy) => (d > 1.8 ? OUTLINE : d > 0.9 ? C.canvas[1 + Math.min(2, lit(x, y, dx, dy, d))] : C.target[2]));
  }
  const tx = x1 - 4.5;
  disc(p, tx, ty, 3.4, (x, y, d, dx, dy) => (d > 2.5 ? OUTLINE : d > 1.6 ? C.straw[Math.min(2, lit(x, y, dx, dy, d))] : d > 0.9 ? C.target[1] : C.target[2]));
  // Two arrows in it, and a bow rack by the door.
  p.set(Math.round(tx) - 1, Math.round(ty) - 2, C.plank[3]);
  p.set(Math.round(tx), Math.round(ty) + 1, C.plank[3]);
}

/** A pyramid roof over a box: four slopes meeting at a point, the sunny
 * north and west lighter, dark seams down the hips, inside an outline. */
function pyramid(p: Pix, x0: number, y0: number, x1: number, y1: number, tones: readonly number[]) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (x === x0 || y === y0 || x === x1 || y === y1) {
        p.set(x, y, OUTLINE);
        continue;
      }
      const dx = x - cx, dy = y - cy;
      if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.6 && (dx || dy)) p.set(x, y, tones[0]);
      else if (Math.abs(dy) >= Math.abs(dx)) p.set(x, y, dy < 0 ? tones[3] : tones[1]);
      else p.set(x, y, dx < 0 ? tones[2] : tones[1]);
    }
}

function paintArcherTower(p: Pix, look: string) {
  const f = squareTower(p, true);
  if (look === "sharpshooters") {
    // A hide of green waxed canvas pitched over the parapet, a brass
    // finial at its peak and a long arrow laid along its foot.
    pyramid(p, f.x0 - 2, f.y0 - 2, f.x1 + 2, f.y1 + 2, C.canvas);
    const cx = Math.floor((f.x0 + f.x1 + 1) / 2), cy = Math.floor((f.y0 + f.y1 + 1) / 2);
    p.set(cx - 1, cy - 1, C.brass[2]);
    p.set(cx, cy - 1, C.brass[1]);
    p.set(cx - 1, cy, C.brass[1]);
    p.set(cx, cy, C.brass[0]);
    return;
  }
  planks(p, f);
  // The hatch in the floor's corner, and a sheaf of arrows.
  rect(p, f.x0, f.y0, f.x0 + 2, f.y0 + 2, OUTLINE);
  p.set(f.x0 + 1, f.y0 + 1, C.plank[0]);
  const fire = look === "fireArrows";
  for (let k = 0; k < 3; k++) {
    p.set(f.x1 - k, f.y1 - 2 + (k % 2), C.plank[3]);
    p.set(f.x1 - k, f.y1 - 3 + (k % 2), fire ? C.fire[2 - (k % 2)] : 0xd04030);
  }
  if (!fire) return;
  // Fire arrows: a pot of embers in the floor's far corner to light them
  // at, and the parapet blackened round the merlons.
  rect(p, f.x1 - 2, f.y0, f.x1, f.y0 + 2, OUTLINE);
  p.set(f.x1 - 1, f.y0 + 1, C.fire[3]);
  p.set(f.x1 - 2, f.y0 + 1, C.iron[2]);
  p.set(f.x1 - 1, f.y0, C.fire[1]);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) if (p.get(x, y) === C.stone[0] && hash(x, y, 47) % 2 === 0) p.set(x, y, C.ember);
}

/** C4 nanobots: a gunmetal bunker ringed by hazard stripes, a huge mortar
 * whose bore glows with the swarm, a tank of nanobots at each corner. */
function paintNanoTower(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  // The bunker's chamfered body: plates lit from the upper left.
  const cut = 5;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const c = Math.min(x - x0, x1 - x) + Math.min(y - y0, y1 - y);
      if (c < cut) continue;
      const ring = Math.min(x - x0, y - y0, x1 - x, y1 - y, c - cut);
      if (ring === 0) p.set(x, y, OUTLINE);
      else if (ring <= 2) p.set(x, y, Math.floor((x + y) / 3) % 2 ? HAZARD : OUTLINE);
      else if (ring === 3) p.set(x, y, OUTLINE);
      else {
        const seam = (x - x0) % 6 === 0 || (y - y0) % 6 === 0;
        const sunny = x - x0 < y1 - y && y - y0 < x1 - x;
        p.set(x, y, seam ? TECH[0] : sunny ? TECH[2] : TECH[1]);
      }
    }
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  // Pipes from each tank to the mortar's ring, two pixels wide.
  for (let i = 6; i <= 10; i++)
    for (const [ux, uy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = Math.floor(cx + ux * i), y = Math.floor(cy + uy * i);
      p.set(x, y, TECH[3]);
      p.set(x + 1, y, OUTLINE);
      p.set(x, y + 1, i % 2 ? NANO[1] : TECH[0]);
    }
  // The tanks at the corners: glass cylinders seen from above, swirling green.
  for (const [ux, uy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tx = cx + ux * 13, ty = cy + uy * 13;
    disc(p, tx, ty, 4, (x, y, d, dx, dy) => (d > 3.2 ? OUTLINE : d > 2.4 ? TECH[Math.min(3, 1 + lit(x, y, dx, dy, d))] : hash(x, y, 77) % 3 ? NANO[1] : NANO[2]));
    p.set(Math.floor(tx) - 1, Math.floor(ty) - 1, NANO[3]);
  }
  // The mortar: a heavy lit iron ring round a bore glowing with the swarm.
  disc(p, cx, cy, 8.5, (x, y, d, dx, dy) => {
    if (d > 7.7) return OUTLINE;
    if (d > 5.2) return C.iron[1 + Math.min(2, lit(x, y, dx, dy, d))];
    if (d > 4.4) return OUTLINE;
    if (d > 3) return NANO[0];
    return hash(x, y, 91) % 4 === 0 ? NANO[3] : d > 1.6 ? NANO[1] : NANO[2];
  });
  // A stack of shells by the south wall: grey canisters with green bands.
  for (let i = 0; i < 3; i++) {
    const sx = Math.floor(cx) - 4 + i * 3, sy = y1 - 8;
    rect(p, sx - 1, sy - 1, sx + 1, sy + 3, OUTLINE);
    p.set(sx, sy, C.iron[3]);
    p.set(sx, sy + 1, NANO[2]);
    p.set(sx, sy + 2, C.iron[2]);
  }
  // The blinking red light on its mast, to the north-west of the mortar.
  const mx = Math.floor(cx) - 7, my = y0 + 6;
  for (let y = my; y <= my + 3; y++) p.set(mx, y, TECH[3]);
  disc(p, mx + 0.5, my - 0.5, 1.5, (_x, _y, d) => (d > 1 ? OUTLINE : 0xff4a3a));
}

function paintCannonTower(p: Pix, look: string) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, r = (x1 - x0 + 1) / 2;
  disc(p, cx, cy, r, (x, y, d, dx, dy) => {
    if (d > r - 1) return OUTLINE;
    if (d > r - 2.6) {
      const sector = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 14);
      return sector % 2 ? C.stone[1] : C.stone[Math.min(3, 2 + (lit(x, y, dx, dy, d) >> 1))];
    }
    if (d > r - 3.4) return OUTLINE;
    return hash(x, y, 45) % 6 === 0 ? C.stone[1] : hash(x, y, 46) % 5 === 0 ? C.stone[3] : C.stone[2];
  });
  const gx = Math.round(cx), gy = Math.round(cy);
  if (look === "siegeShot") {
    // Siege shot: a squat mortar, its great black bore staring up out of a
    // lit iron ring, and two huge balls beside it.
    disc(p, gx - 1, gy - 1, 3.4, (x, y, d, dx, dy) => (d > 2.6 ? OUTLINE : d > 1.4 ? C.iron[1 + Math.min(2, lit(x, y, dx, dy, d))] : C.iron[0]));
    disc(p, gx + 2.5, gy + 2.5, 2, (x, y, d, dx, dy) => (d > 1.3 ? OUTLINE : C.iron[1 + Math.min(2, lit(x, y, dx, dy, d))]));
    return;
  }
  if (look === "gunnery") {
    // Gun crews: twin light barrels side by side on one carriage, a powder
    // keg and a heap of grapeshot beside them.
    rect(p, gx - 3, gy - 1, gx + 2, gy + 3, OUTLINE);
    rect(p, gx - 2, gy, gx + 1, gy + 2, C.plank[1]);
    for (const [bx, top, tone] of [[gx - 3, gy - 6, 3], [gx + 1, gy - 5, 2]]) {
      rect(p, bx - 1, top, bx + 1, gy + 1, OUTLINE);
      for (let y = top + 1; y <= gy; y++) p.set(bx, y, y === top + 1 ? C.iron[0] : C.iron[tone]);
    }
    disc(p, gx - 3.5, gy + 4, 1.8, (x, y, d) => (d > 1.2 ? OUTLINE : (y % 2 ? C.plank[1] : C.plank[3])));
    for (const [bx, by] of [[gx + 3, gy + 3], [gx + 4, gy + 3], [gx + 3, gy + 4], [gx + 4, gy + 2]]) p.set(bx, by, (bx + by) % 2 ? C.iron[3] : C.iron[1]);
    return;
  }
  // The carriage, then the barrel to the north over it: outlined iron with
  // a lit line down its west side and a dark muzzle.
  rect(p, gx - 3, gy - 1, gx + 2, gy + 3, OUTLINE);
  rect(p, gx - 2, gy, gx + 1, gy + 2, C.plank[1]);
  p.set(gx - 2, gy, C.plank[3]);
  rect(p, gx - 2, gy - 5, gx + 1, gy + 2, OUTLINE);
  for (let y = gy - 4; y <= gy + 1; y++) {
    p.set(gx - 1, y, C.iron[3]);
    p.set(gx, y, C.iron[2]);
  }
  p.set(gx - 1, gy - 4, C.iron[0]);
  p.set(gx, gy - 4, C.iron[0]);
  // Shot stacked to the south-east.
  for (const [bx, by] of [[gx + 3, gy + 3], [gx + 4, gy + 2], [gx + 4, gy + 4]]) {
    p.set(bx, by, C.iron[1]);
    if (C.stone.includes(p.get(bx - 1, by - 1))) p.set(bx - 1, by - 1, OUTLINE);
  }
  p.set(gx + 4, gy + 2, C.iron[3]);
}

function paintWatchTower(p: Pix, look: string) {
  const f = squareTower(p, false);
  planks(p, f);
  const cx = (f.x0 + f.x1 + 1) / 2, cy = (f.y0 + f.y1 + 1) / 2;
  if (look === "spotters") {
    // Spotters: a brass spyglass on its stand, trained north-east, its lens
    // catching the sky, and a green pennant on the parapet's corner.
    const sx = Math.floor(cx) - 2, sy = Math.floor(cy) + 1;
    for (let k = 0; k < 4; k++) {
      p.set(sx + k + 1, sy - k + 1, OUTLINE);
      p.set(sx + k, sy - k, k === 3 ? C.sky[2] : C.brass[k === 0 ? 0 : k === 1 ? 1 : 2]);
    }
    p.set(sx + 4, sy - 3, OUTLINE);
    p.set(sx + 3, sy - 4, OUTLINE);
    p.set(sx + 1, sy + 1, C.plank[0]);
    for (const [x, y, c] of [[f.x1 + 2, f.y0 - 3, OUTLINE], [f.x1 + 1, f.y0 - 2, C.canvas[3]], [f.x1, f.y0 - 2, C.canvas[2]], [f.x1 + 1, f.y0 - 1, C.canvas[1]], [f.x1 - 1, f.y0 - 2, C.canvas[1]]] as const) p.set(x, y, c);
  } else {
    // The brazier: an iron bowl in an outline, the beacon burning in it,
    // hottest at the heart; the signal fire's is a great one filling the
    // floor, sparks blown out over the parapet.
    const big = look === "signalFires", br = big ? 3.9 : 2.9, fr = big ? 2.5 : 1.5;
    disc(p, cx, cy, br, (x, y, d, dx, dy) => (d > br - 0.8 ? OUTLINE : d > fr ? C.iron[1 + Math.min(2, lit(x, y, dx, dy, d))] : null));
    disc(p, cx, cy, fr, (x, y, d) => (d < fr * 0.5 ? C.fire[3] : (x + y) % 2 ? C.fire[2] : C.fire[1]));
    if (big) for (const [x, y, c] of [[f.x1 + 2, f.y0 - 2, C.fire[2]], [f.x1 + 1, f.y0 - 3, C.ember], [f.x0 - 2, f.y0 - 1, C.fire[1]], [f.x1 + 2, f.y1, C.ember]] as const) p.set(x, y, c);
  }
  // Posts at the floor's corners.
  for (const [x, y] of [[f.x0, f.y0], [f.x1, f.y0], [f.x0, f.y1], [f.x1, f.y1]]) p.set(x, y, C.plank[0]);
}

function paintWizardTower(p: Pix, look: string) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, r = (x1 - x0 + 1) / 2;
  const roof = r - 2.2;
  // Pyromancy fires the roof red and cuts it to six slopes, a hexagon, with
  // ember runes in the rim; Rime glazes it in ice as a four-pointed
  // diamond; Stormcalling roofs it in thundercloud slate as a square, its
  // hips and runes crackling with yellow lightning; otherwise eight
  // slate slopes, nearly round.
  const pyro = look === "pyromancy", rime = look === "rime", storm = look === "storm";
  const sides = pyro ? 6 : rime || storm ? 4 : 8, turn = rime ? Math.PI / 4 : 0;
  const tiles = pyro ? C.kiln : rime ? C.ice : storm ? C.cloud : C.slate;
  const rune = pyro ? C.ember : rime ? C.ice[3] : storm ? C.bolt : C.rune;
  // How far out a point is in the roof's own shape: its distance on the
  // round roof, its furthest reach toward a face on a polygon.
  const reach = (d: number, dx: number, dy: number) => {
    if (sides === 8) return d;
    let m = 0;
    for (let k = 0; k < sides; k++) {
      const a = turn + (k / sides) * 2 * Math.PI - Math.PI;
      m = Math.max(m, dx * Math.cos(a) + dy * Math.sin(a));
    }
    return m / Math.cos(Math.PI / sides);
  };
  disc(p, cx, cy, r, (x, y, d, dx, dy) => {
    if (d > r - 1) return OUTLINE;
    const e = reach(d, dx, dy);
    if (e > roof + 1) {
      // The rim of pale stone, a rune glowing every so often round it.
      const a = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 24);
      return a % 4 === 1 ? rune : C.pale[1 + Math.min(2, lit(x, y, dx, dy, d))];
    }
    if (e > roof) return OUTLINE;
    // The slopes rising to the finial, shaded by which way they face, the
    // seams between them dark.
    const ang = Math.atan2(dy, dx) + Math.PI, f = (((ang - turn) / (2 * Math.PI)) * sides + 0.5 + sides) % sides, k = Math.floor(f);
    const mid = (k / sides) * 2 * Math.PI - Math.PI + turn;
    const seam = Math.abs((f % 1) - 0.5) > (storm ? 0.4 : 0.44) && d > 1.2;
    if (seam) return storm ? (hash(x, y, 48) % 3 ? C.bolt : 0xfff4c8) : tiles[0];
    const t = (-(Math.cos(mid) + Math.sin(mid)) / Math.SQRT2) * 1.5 + 1.5;
    return tiles[Math.max(0, Math.min(3, Math.floor(t + ((x + y) % 2 ? 0.25 : -0.25))))];
  });
  // The finial: gold, lit at its upper left (a flame's colours on Pyromancy,
  // an ice crystal on Rime, a lightning rod's spark on Stormcalling). The
  // roof is an odd number of pixels across, so the finial is a cross three
  // pixels wide on its middle pixel, never two that sit half a pixel aside.
  const fx = Math.floor(cx), fy = Math.floor(cy);
  const tip = pyro ? [C.fire[1], C.fire[2], C.fire[3]] : rime ? [C.ice[1], C.ice[2], 0xffffff] : storm ? [C.iron[2], C.bolt, 0xfffbe0] : C.gold;
  p.set(fx, fy - 1, tip[2]);
  p.set(fx - 1, fy, tip[2]);
  p.set(fx, fy, tip[1]);
  p.set(fx + 1, fy, tip[0]);
  p.set(fx, fy + 1, tip[0]);
}

/** The wizard tower's branch towers: its roof in the branch's look, and at
 * each corner of the lot outside the round wall a little piece of what the
 * tower has given itself to. */
function paintBranchTower(p: Pix, look: string, corner: (x: number, y: number, right: boolean, low: boolean) => void, worn: boolean, base = paintWizardTower) {
  base(p, look);
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  for (const [x, y] of [[x0, y0], [x1 - 2, y0], [x0, y1 - 2], [x1 - 2, y1 - 2]]) corner(x, y, x > x0, y > y0);
  // Climbing its path, the tower's rim glows all the way round.
  if (worn) {
    const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, r = (x1 - x0 + 1) / 2;
    const glow = look === "pyromancy" || look === "fireArrows" ? C.ember : look === "rime" ? C.ice[3] : look === "sharpshooters" ? C.slime[2] : look === "gunnery" ? C.iron[3] : look === "siegeShot" ? C.fire[2] : C.bolt;
    disc(p, cx, cy, r - 1, (x, y, d) => (d > r - 2 && (x + y) % 2 === 0 ? glow : null));
  }
}
/** The archer and cannon towers' branch towers, the wizard tower's way:
 * each corner a 3 × 3 token of the branch, from rows of keys into `pal`. */
const cornerToken = (p: Pix, rows: readonly string[], pal: Record<string, number>) => (x: number, y: number) => glyph(p, x, y, rows, pal);
/** The Brazier tower: a brazier burning at each corner. */
function paintBrazierTower(p: Pix, look: string) {
  paintBranchTower(p, "fireArrows", cornerToken(p, ["121", "010", "000"], { 0: OUTLINE, 1: C.fire[2], 2: C.fire[3] }), !!look, paintArcherTower);
}
/** The Hawk tower: a hawk's perch at each corner, green pennants flying. */
function paintHawkTower(p: Pix, look: string) {
  paintBranchTower(p, "sharpshooters", cornerToken(p, ["000", "021", "010"], { 0: OUTLINE, 1: C.plank[1], 2: C.slime[1] }), !!look, paintArcherTower);
}
/** The Gun battery: stacked shot at each corner. */
function paintBatteryTower(p: Pix, look: string) {
  paintBranchTower(p, "gunnery", cornerToken(p, ["000", "121", "000"], { 0: OUTLINE, 1: C.iron[1], 2: C.iron[3] }), !!look, paintCannonTower);
}
/** The Mortar tower: powder kegs at each corner. */
function paintMortarTower(p: Pix, look: string) {
  paintBranchTower(p, "siegeShot", cornerToken(p, ["000", "121", "010"], { 0: OUTLINE, 1: C.plank[1], 2: C.fire[1] }), !!look, paintCannonTower);
}
/** The Pyre tower: a fire bowl burning at each corner. */
function paintPyreTower(p: Pix, look: string) {
  paintBranchTower(p, "pyromancy", (x, y) => {
    rect(p, x, y, x + 2, y + 2, OUTLINE);
    p.set(x + 1, y + 1, C.fire[0]);
    p.set(x + 1, y, C.fire[2]);
    p.set(x, y + 1, C.ember);
    p.set(x + 2, y + 1, C.kiln[2]);
    p.set(x + 1, y + 2, C.iron[2]);
  }, !!look);
}
/** The Frost tower: an ice crystal rising from each corner. */
function paintFrostTower(p: Pix, look: string) {
  paintBranchTower(p, "rime", (x, y) => {
    rect(p, x, y, x + 2, y + 2, OUTLINE);
    p.set(x + 1, y, C.ice[3]);
    p.set(x + 1, y + 1, C.ice[2]);
    p.set(x, y + 1, C.ice[1]);
    p.set(x + 2, y + 1, C.ice[1]);
    p.set(x + 1, y + 2, C.ice[0]);
  }, !!look);
}
/** The Storm tower: an iron lightning rod at each corner, sparking at the tip. */
function paintStormTower(p: Pix, look: string) {
  paintBranchTower(p, "storm", (x, y, right) => {
    rect(p, x, y, x + 2, y + 2, OUTLINE);
    const rx = x + 1;
    p.set(rx, y + 2, C.iron[2]);
    p.set(rx, y + 1, C.iron[3]);
    p.set(rx, y, C.bolt);
    p.set(right ? x : x + 2, y, 0xfffbe0);
  }, !!look);
}

function paintMageGuild(p: Pix, look: string) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  // Pyroclasm roofs the hall in scorched orange round a greater fire well;
  // the Cinders' is charcoal over a well of smouldering coals, their
  // banners black.
  const pyro = look === "pyroclasm", cinders = look === "cinders";
  hall(p, x0, y0, x1, y1, pyro ? C.scorch : cinders ? C.char[2] : C.wine[1]);
  // Ember runes glowing on the four slopes, each a lit pixel and its dimmer
  // tail.
  for (const [rx, ry, tx] of [[x0 + 6, y0 + 6, 1], [x1 - 6, y0 + 6, -1], [x0 + 6, y1 - 6, 1], [x1 - 6, y1 - 6, -1]]) {
    p.set(rx, ry, C.ember);
    p.set(rx + tx, ry + 1, C.fire[0]);
  }
  // The fire well at the hall's heart: an outlined brass ring lit to the
  // upper left round a fire white-hot in the middle.
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, wr = pyro ? 5.4 : 4.2, fr = wr - 2.2;
  disc(p, cx, cy, wr, (x, y, d, dx, dy) => {
    if (d > wr - 0.8) return OUTLINE;
    if (d > fr + 0.4) return C.gold[Math.min(2, lit(x, y, dx, dy, d) >> 1)];
    if (d > fr) return OUTLINE;
    if (cinders) return hash(x, y, 93) % 3 === 0 ? (d < 1 ? C.fire[1] : C.ember) : C.char[hash(x, y, 94) % 3];
    return d < fr * 0.4 ? C.fire[3] : d < fr * 0.75 ? C.fire[2] : (x + y) % 2 ? C.fire[1] : C.fire[0];
  });
  // The Cinders' roof glows through cracks, embers working into it.
  if (cinders)
    for (let k = 0; k < 6; k++) {
      let x = x0 + 4 + (hash(k, 95) % (x1 - x0 - 8)), y = y0 + 4 + (hash(k, 96) % (y1 - y0 - 8));
      for (let i = 0; i < 3; i++) {
        const dx = x - cx, dy = y - cy;
        if (p.get(x, y) !== OUTLINE && dx * dx + dy * dy > (wr + 1) * (wr + 1)) p.set(x, y, i ? C.fire[0] : C.ember);
        x += hash(k, i, 97) % 2 ? 1 : -1;
        y += 1;
      }
    }
  const banner = cinders ? C.char : C.banner;
  // Two swallowtail banners hung over the south wall, red (lit on the west)
  // with a gold flame, their tails notched.
  for (const bx of [x0 + 4, x1 - 6]) {
    for (let y = y1 - 4; y <= y1 + 1; y++) {
      p.set(bx - 1, y, OUTLINE);
      p.set(bx + 3, y, OUTLINE);
      for (let x = bx; x <= bx + 2; x++) p.set(x, y, y === y1 - 4 ? OUTLINE : banner[x === bx ? 2 : x === bx + 2 ? 0 : 1]);
    }
    p.set(bx + 1, y1 - 2, cinders ? C.ember : C.gold[1]);
    p.set(bx + 1, y1 - 1, C.fire[cinders ? 1 : 2]);
    p.set(bx + 1, y1 + 1, OUTLINE);
    for (let x = bx - 1; x <= bx + 3; x++) p.set(x, y1 + 2, OUTLINE);
  }
}

/** Gold wings spread over the palace's south steps: `Y` gold, `y` lit. */
const WINGS = ["00.......00", "0yY0...0Yy0", ".0yYY0YYy0.", "..00yYy00..", "....000...."];

function paintValkyriePalace(p: Pix, look: string) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const short = Math.min(x1 - x0, y1 - y0) + 1;
  const marble = (x: number, y: number, tone: number) => (hash(x, y, 51) % 13 === 0 ? C.vein : C.marble[tone]);
  // Rings in from the outline: the marble steps (two on a whole palace,
  // one on a folded one), the edge of the porch, the colonnade, then the
  // cella's wall.
  const steps = short >= 32 ? 2 : 1, edge = steps + 1, cols = edge + 1, wall = cols + 2;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const ring = Math.min(x - x0, y - y0, x1 - x, y1 - y);
      if (ring > wall) continue;
      // Lit on the faces toward the upper left, shaded on the others.
      const sunny = x - x0 === ring || y - y0 === ring;
      if (ring === 0 || ring === wall) p.set(x, y, OUTLINE);
      else if (ring <= steps) p.set(x, y, marble(x, y, sunny ? 4 - (ring - 1) : 2 - (ring - 1)));
      else if (ring === edge) p.set(x, y, sunny ? C.marble[2] : C.marble[0]);
      else {
        // Columns two pixels square in a row round the porch, a shadowed
        // gap between each, lit on their upper left pixel.
        const along = y - y0 === ring || y1 - y === ring ? x : y;
        const k = (along - (x0 + y0)) % 3;
        const top = ring === cols;
        p.set(x, y, k === 2 ? C.marble[0] : top && k === 0 ? C.marble[4] : top || k === 0 ? C.marble[3] : C.marble[2]);
      }
    }
  // The cella inside, edged in gold.
  const tx0 = x0 + wall + 1, ty0 = y0 + wall + 1, tx1 = x1 - wall - 1, ty1 = y1 - wall - 1;
  for (let y = ty0; y <= ty1; y++)
    for (let x = tx0; x <= tx1; x++) {
      const rim = x === tx0 || y === ty0 || x === tx1 || y === ty1;
      p.set(x, y, rim ? (x === tx0 || y === ty0 ? C.gold[2] : C.gold[0]) : marble(x, y, 3));
    }
  const cw = tx1 - tx0 + 1, ch = ty1 - ty0 + 1;
  const dcx = (tx0 + tx1 + 1) / 2, dcy = (ty0 + ty1 + 1) / 2;
  let r = Math.min(cw, ch) / 2 - 0.5;
  if (Math.max(cw, ch) > Math.min(cw, ch) * 1.4) {
    // A folded palace: a long marble roof with a gold ridge over the
    // cella, and a small dome at its heart.
    gable(p, tx0 + 1, ty0 + 1, tx1 - 1, ty1 - 1, C.marble[3]);
    const along = cw >= ch;
    for (let k = along ? tx0 + 1 : ty0 + 1; k <= (along ? tx1 - 1 : ty1 - 1); k++)
      if (along) p.set(k, Math.floor(dcy), k % 2 ? C.gold[1] : C.gold[0]);
      else p.set(Math.floor(dcx), k, k % 2 ? C.gold[1] : C.gold[0]);
    r = Math.min(cw, ch) / 2 + 0.5;
  }
  // The dome: white marble shaded as a sphere, gold ribs, and a gold
  // lantern at its crown.
  disc(p, dcx, dcy, r, (x, y, d, dx, dy) => {
    if (d > r - 1) return OUTLINE;
    const ang = Math.atan2(dy, dx) + Math.PI;
    if (r > 6 && Math.abs(((ang / (2 * Math.PI)) * 8) % 1 - 0.5) > 0.42 && d > 1.6) return d < r * 0.6 ? C.gold[1] : C.gold[0];
    return C.marble[Math.min(4, 1 + lit(x, y, dx, dy, d) + (d < r * 0.45 ? 1 : 0))];
  });
  disc(p, dcx, dcy, 1.6, (x, y, d) => (d > 1.1 ? C.gold[0] : (x + y) % 2 ? C.gold[2] : C.gold[1]));
  // Gold wings over the south steps.
  const wx = Math.round((x0 + x1) / 2) - 5, wy = y1 - WINGS.length + 1;
  WINGS.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch !== ".") p.set(wx + i, wy + j, ch === "0" ? OUTLINE : ch === "y" ? C.gold[2] : C.gold[1]);
    }),
  );
  // Cloudborne: tufts of cloud billowing up round its corners.
  if (look === "cloudborne") {
    const r = Math.max(2.5, short * 0.13);
    const puffs: [number, number, number][] = [];
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1 + 1, y0, -1, 1], [x0, y1 + 1, 1, -1], [x1 + 1, y1 + 1, -1, -1]])
      puffs.push([cx + sx * r, cy + sy * r * 1.6, r], [cx + sx * r * 1.7, cy + sy * r, r * 0.85]);
    cloudPuffs(p, puffs);
  }
}

/** Cloud, shaded to the dark lower right (0xRRGGBB). */
export const CLOUD = [0x7d88a8, 0xaab6d0, 0xd6deee, 0xf6f8fc, 0xffffff];
/** Puffs of cloud (x, y, radius in pixels) as one billow: their outline
 * round the whole, each shaded as a ball lit from the upper left. */
export function cloudPuffs(p: Pix, puffs: readonly (readonly [number, number, number])[]) {
  for (const [x, y, r] of puffs) disc(p, x, y, r, () => OUTLINE);
  for (const [x, y, r] of puffs) disc(p, x, y, r - 1, (px, py, d, dx, dy) => CLOUD[Math.min(4, lit(px, py, dx, dy, d) + (d < (r - 1) * 0.4 ? 1 : 0))]);
}

/** The dark wizard keep. Its parts scale with its size, so the folded keep
 * (5 cells) is the great one (12) in small. */
function paintDarkKeep(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const S = Math.min(x1 - x0, y1 - y0) + 1;
  const ob = (x: number, y: number, tone: number) => (hash(x, y, 61) % 23 === 0 && tone >= 2 ? C.sheen : C.obsidian[tone]);
  // Rings in from the outline: the plinth's steps, the curtain wall (its
  // outer and inner faces outlined) and the courtyard inside.
  const steps = S >= 60 ? 2 : 1, wa = steps + 1, wb = wa + Math.max(2, Math.round(S * 0.07)) + 1;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const ring = Math.min(x - x0, y - y0, x1 - x, y1 - y);
      const sunny = x - x0 === ring || y - y0 === ring;
      if (ring === 0 || ring === wa || ring === wb) p.set(x, y, OUTLINE);
      else if (ring < wa) p.set(x, y, ob(x, y, sunny ? 4 - ring : 2 - ring + 1));
      else if (ring < wb) {
        // Glassy black blocks in crimson mortar, merlons along the outer edge.
        const along = y - y0 === ring || y1 - y === ring ? x : y;
        const depth = ring - wa - 1;
        const seam = (along + depth * 2) % 5 === 0 || (depth > 0 && depth % 3 === 0);
        const merlon = depth === 0 && Math.floor(along / 2) % 2 === 0;
        p.set(x, y, seam ? C.mortar[sunny ? 2 : 1] : ob(x, y, merlon ? (sunny ? 4 : 2) : sunny ? 3 : 1));
      } else {
        // Dark flagstones in a grid, each its own shade.
        const fx = Math.floor((x - x0) / 4), fy = Math.floor((y - y0) / 4);
        const edge = (x - x0) % 4 === 0 || (y - y0) % 4 === 0;
        p.set(x, y, edge ? C.obsidian[1] : C.flag[hash(fx, fy, 62) % 3]);
      }
    }
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  // The rune circle round the spire: a glowing crimson ring, a rune mark
  // every so often, dithered embers just inside it.
  const rr = S * 0.31;
  disc(p, cx, cy, rr, (x, y, d, dx, dy) => {
    if (d < rr - 1.2) return d > rr - 2.2 && (x + y) % 3 === 0 ? C.ruby[1] : null;
    const a = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 16);
    return a % 2 ? C.ruby[2] : C.ruby[3];
  });
  // The spire: eight obsidian slopes rising to a ruby, shaded by which way
  // they face, crimson seams between them.
  const sr = Math.max(4, S * 0.21);
  disc(p, cx, cy, sr, (x, y, d, dx, dy) => {
    if (d > sr - 1) return OUTLINE;
    const ang = Math.atan2(dy, dx) + Math.PI, f = (ang / (2 * Math.PI)) * 8 + 0.5;
    if (Math.abs((f % 1) - 0.5) > 0.42 && d > 1.5) return C.mortar[2];
    const mid = (Math.floor(f) % 8 / 8) * 2 * Math.PI - Math.PI;
    const t = (-(Math.cos(mid) + Math.sin(mid)) / Math.SQRT2) * 1.6 + 2;
    return ob(x, y, Math.max(1, Math.min(4, Math.floor(t + ((x + y) % 2 ? 0.25 : -0.25)))));
  });
  ruby(p, cx, cy, Math.max(1.6, S * 0.075));
  // The gate in the south wall: a black arch edged in rubies, between two
  // crimson banners.
  const gw = Math.max(2, Math.round(S * 0.08)), gx = Math.round(cx) - gw;
  for (let y = y1 - wb + 1; y <= y1 - 1; y++)
    for (let x = gx - 1; x <= gx + gw * 2; x++) {
      const rim = x === gx - 1 || x === gx + gw * 2;
      p.set(x, y, rim ? (y % 2 ? C.ruby[2] : C.ruby[1]) : y === y1 - wb + 1 ? C.ruby[3] : C.obsidian[0]);
    }
  if (S >= 30)
    for (const bx of [gx - Math.max(4, Math.round(S * 0.12)), gx + gw * 2 + Math.max(2, Math.round(S * 0.12)) - 1]) {
      const len = Math.max(4, Math.round(S * 0.09));
      for (let y = y1 - wb + 1; y <= y1 - wb + len; y++) {
        p.set(bx - 1, y, OUTLINE);
        p.set(bx + 3, y, OUTLINE);
        for (let x = bx; x <= bx + 2; x++) p.set(x, y, y === y1 - wb + 1 ? OUTLINE : C.mortar[x === bx ? 2 : x === bx + 2 ? 0 : 1]);
      }
      p.set(bx + 1, y1 - wb + 3, C.ruby[3]);
      p.set(bx + 1, y1 - wb + len, OUTLINE);
      p.set(bx + 1, y1 - wb + len + 1, OUTLINE);
    }
  // Rubies set in the wall tops, midway along each side.
  const wm = Math.round((wa + wb) / 2);
  for (const [x, y] of [[cx, y0 + wm], [x0 + wm, cy], [x1 - wm, cy]]) if (S >= 30) ruby(p, x, y, 1.6);
  // The corner turrets, where the lightning leaves from: obsidian drums,
  // crenellated round the rim, a great ruby at the heart of each.
  const ix = p.w * TURRET_INSET, iy = p.h * TURRET_INSET, tr = Math.max(3.4, Math.min(p.w, p.h) * 0.115);
  for (const [tx, ty] of [[ix, iy], [p.w - ix, iy], [ix, p.h - iy], [p.w - ix, p.h - iy]]) {
    disc(p, tx, ty, tr, (x, y, d, dx, dy) => {
      if (d > tr - 1) return OUTLINE;
      if (d > tr * 0.62) {
        const a = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 12);
        return ob(x, y, a % 2 ? 1 : 1 + lit(x, y, dx, dy, d));
      }
      return d > tr * 0.62 - 1 ? OUTLINE : C.obsidian[0];
    });
    ruby(p, tx, ty, Math.max(1.4, tr * 0.5));
  }
}

/** A faceted ruby of radius `r` at (cx, cy): dark at the rim, its facets
 * lit to the upper left, a white-hot glint. */
function ruby(p: Pix, cx: number, cy: number, r: number) {
  disc(p, cx, cy, r + 1, (x, y, d, dx, dy) => {
    if (d > r) return OUTLINE;
    const facet = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 6);
    const t = lit(x, y, dx, dy, d) + (d < r * 0.5 ? 1 : 0) - (facet % 2 ? 1 : 0);
    return C.ruby[Math.max(0, Math.min(3, t))];
  });
  p.set(Math.floor(cx - r * 0.4), Math.floor(cy - r * 0.4), C.ruby[4]);
}

/** Crimson fissures glowing through the hurt obsidian: more and longer at
 * each stage, only over what is drawn. */
function fissures(p: Pix, stage: number, seed: number) {
  const many = Math.max(1, Math.round((p.w * p.h) / 900));
  for (let s = 1; s <= stage; s++)
    for (let k = 0; k < many * s; k++) {
      let x = Math.floor(hash01(seed, s, k, 1) * p.w), y = Math.floor(hash01(seed, s, k, 2) * p.h);
      const dx = hash01(seed, s, k, 3) < 0.5 ? 1 : -1, dy = hash01(seed, s, k, 4) < 0.5 ? 1 : -1;
      for (let i = 0; i < 3 + s * 2; i++) {
        const c = p.get(x, y);
        if (c < 0 || c === OUTLINE) break;
        p.set(x, y, i % 3 === 1 ? C.ruby[3] : C.ruby[2]);
        if (hash01(seed, s, k, i) < 0.5) x += dx;
        else y += dy;
      }
    }
}

/** One crate seen from above in `x0..x1, y0..y1` (outline included): boards
 * running `across` or down, lit to the upper left, the seams between them
 * a shade darker, an iron corner catching the sun; `lift` lightens a crate
 * stacked higher. */
function crate(p: Pix, x0: number, y0: number, x1: number, y1: number, across: boolean, lift = 0, tones: readonly number[] = C.crate, bound = false) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (x === x0 || y === y0 || x === x1 || y === y1) {
        p.set(x, y, OUTLINE);
        continue;
      }
      const u = across ? y - y0 - 1 : x - x0 - 1;
      const edge = x === x0 + 1 || y === y0 + 1 ? 1 : x === x1 - 1 || y === y1 - 1 ? -1 : 0;
      const seam = u % 3 === 2 && edge === 0;
      const grain = hash(x, y, 77) % 9 === 0 ? -1 : 0;
      // Iron bands strapped across the boards, riveted where they cross.
      const v = across ? x - x0 : y - y0;
      if (bound && (v % 5 === 2 || v % 5 === 3)) {
        p.set(x, y, v % 5 === 2 ? (u % 2 ? C.iron[3] : C.iron[2]) : C.iron[1]);
        continue;
      }
      p.set(x, y, tones[Math.max(0, Math.min(4, 2 + lift + edge + grain - (seam ? 1 : 0)))]);
    }
  p.set(x0 + 1, y0 + 1, C.iron[3]);
  p.set(x1 - 1, y1 - 1, C.iron[1]);
}

/** Darkens the drawn, non-outline pixels in a box: a shadow cast by
 * what is stacked above. */
function shadow(p: Pix, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const c = p.get(x, y);
      if (c >= 0 && c !== OUTLINE) p.set(x, y, shade(c, 0.6));
    }
}

/** Oil-soaked crates' boards, blackened with lamp oil. */
const OILED = [0x24180e, 0x382616, 0x4c341e, 0x624628, 0x7a5a36];

function paintMonsterBait(p: Pix, look: string) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  // Oil-soaked bait is stacked in crates blackened with oil, a black pool
  // shining under them; fortified crates are strapped in riveted iron.
  const oiled = look === "oilSoaked", bound = look === "fortified", tones = oiled ? OILED : C.crate;
  // On the ground: a long crate along the south, boards across, and an open
  // one to the north-east heaped with raw meat.
  crate(p, x0, y0 + 6, x1, y1, true, 0, tones, bound);
  crate(p, x0 + 5, y0, x1, y0 + 6, false, 0, tones, bound);
  for (let y = y0 + 2; y <= y0 + 4; y++)
    for (let x = x0 + 8; x <= x1 - 2; x++) {
      const k = hash(x, y, 91) % 4;
      p.set(x, y, k === 0 ? C.meat[3] : (x + y) % 2 ? C.meat[2] : C.meat[1]);
    }
  p.set(x1 - 2, y0 + 2, C.bone[1]);
  p.set(x1 - 1, y0 + 1, C.bone[1]);
  // Slime seeping from the long crate's seams and pooling below (oil, its
  // sheen catching the light, on oil-soaked bait).
  const ooze = oiled ? C.oil.slice(1) : C.slime;
  for (const [x, y, t] of [[x1 - 3, y1 - 1, 2], [x1 - 3, y1, 1], [x1 - 2, y1 + 1, 0], [x1 - 4, y1 + 1, 1], [x1 - 1, y0 + 9, 1]] as const) p.set(x, y, ooze[t]);
  if (oiled) for (const [x, y, c] of [[x0 + 2, y1 + 1, C.oil[0]], [x0 + 3, y1 + 1, C.oil[3]], [x0 + 4, y1 + 1, C.oil[1]], [x1 - 5, y1 + 1, C.oil[0]], [x1 - 2, y1 + 1, C.oil[3]]] as const) p.set(x, y, c);
  // A crate stacked on top to the west, throwing its shadow to the lower
  // right, a haunch of meat lashed across it with rope.
  const tx0 = x0, ty0 = y0 + 1, tx1 = x0 + 7, ty1 = y0 + 8;
  shadow(p, tx1 + 1, ty0 + 1, tx1 + 2, ty1 + 1);
  shadow(p, tx0 + 1, ty1 + 1, tx1 + 2, ty1 + 2);
  crate(p, tx0, ty0, tx1, ty1, false, 1, tones, bound);
  for (let y = ty0 + 1; y < ty1; y++) p.set(tx0 + 5, y, C.straw[0]);
  for (const [dx, dy, c] of [
    [1, 3, C.meat[3]], [2, 3, C.meat[3]], [3, 3, C.meat[2]], [4, 3, C.meat[2]],
    [1, 4, C.meat[2]], [2, 4, C.meat[2]], [3, 4, C.meat[1]], [4, 4, C.meat[1]],
    [2, 5, C.meat[1]], [3, 5, C.meat[0]],
    [5, 3, C.bone[1]], [6, 2, C.bone[1]], [6, 1, C.bone[0]],
  ] as const) p.set(tx0 + dx, ty0 + dy, c);
  // Slime dribbling down the top crate's side.
  p.set(tx0 + 1, ty1 - 1, ooze[2]);
  p.set(tx0 + 1, ty1, ooze[1]);
}
