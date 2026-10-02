/** The miners as little figures two pixels wide and four tall, each pixel a
 * half cell of the world: a hat, mask or hair over a face, a shirt, coat or
 * apron, and legs. Each miner's outfit is picked from its name, so it keeps
 * its look for life, and varies within its trade: skin, hair, shirt and
 * trousers, the shade of a hat or mask, a lamp on the hat, a bare head. */
import type { Job } from "./sim.ts";

/** Fills a rectangle in cells (fractions allowed), snapped to whole screen
 * pixels. */
export type Fine = (x: number, y: number, w: number, h: number, color: string) => void;

export type Outfit = { job: Job; top: string; lamp: boolean; face: string; back: string; body: string; arm: string; legs: string; boots: string };

const SKIN = ["#f1c9a5", "#e2b086", "#c68e62", "#9a6440", "#6e4428"];
const HAIR = ["#2a1c12", "#5a3a1e", "#8a5a2a", "#c8a060", "#1c1a1c", "#9a3a1a", "#d4ccbc"];
const SHIRT = ["#ece6d8", "#c4503c", "#3e6aa8", "#5a8a4a", "#8a6a3a", "#b4a272", "#7a4a7a"];
const TROUSERS = ["#3a3a48", "#4a3a2a", "#2c3c58", "#5a4a3a", "#424a3a"];
const BOOTS = ["#1c1612", "#2e2218", "#3a2a1c"];
const HAT = ["#f2c230", "#e6a822", "#f6d850", "#e8b838"];
const MASK = ["#8d929c", "#7a7f88", "#a2a6ae", "#868070"];
const COAT = ["#6a5a4a", "#4a4a52", "#7a6a50", "#5a4a3c"];
const APRON = ["#7a4a26", "#6a3e1e", "#8a5630", "#5e3a20"];
const VISOR = "#20242c", LAMP = "#fff4b8";

/** A fixed number for a name. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const cache = new Map<string, Outfit>();
/** What the miner named `name` wears in trade `job`. */
export function outfit(name: string, job: Job): Outfit {
  const key = `${job}:${name}`;
  let o = cache.get(key);
  if (o) return o;
  const h = hash(name), pick = <T>(list: T[], salt: number) => list[Math.floor(((h >>> salt) % 997) / 997 * list.length)];
  const skin = pick(SKIN, 1), hair = pick(HAIR, 4), shirt = pick(SHIRT, 7), legs = pick(TROUSERS, 10), boots = pick(BOOTS, 13);
  if (job === "mine") o = { job, top: pick(HAT, 16), lamp: (h >>> 19) % 3 === 0, face: skin, back: hair, body: shirt, arm: shirt, legs, boots };
  else if (job === "forge") {
    const mask = pick(MASK, 16);
    o = { job, top: mask, lamp: false, face: VISOR, back: mask, body: pick(COAT, 19), arm: pick(COAT, 19), legs, boots };
  } else {
    // A smith: bare-headed (now and then bald), a leather apron over the shirt.
    const bald = (h >>> 16) % 5 === 0;
    o = { job, top: bald ? skin : hair, lamp: false, face: skin, back: bald ? skin : hair, body: pick(APRON, 19), arm: shirt, legs, boots };
  }
  cache.set(key, o);
  return o;
}

export type Pose = "stand" | "walk" | "climb" | "work";

/** A miner standing with its feet in cell (x, y), facing right (1) or left
 * (-1): 2 × 4 half cells over the cells (x, y - 1) and (x, y). `step`
 * swings the legs while it walks or climbs. */
export function drawFigure(fine: Fine, o: Outfit, x: number, y: number, facing: number, pose: Pose, step: number) {
  const top = y - 1, front = facing > 0 ? x + 0.5 : x, back = facing > 0 ? x : x + 0.5;
  fine(x, top, 1, 0.5, o.top);
  if (o.lamp) fine(front, top, 0.5, 0.5, LAMP);
  fine(front, top + 0.5, 0.5, 0.5, o.face);
  fine(back, top + 0.5, 0.5, 0.5, o.back);
  fine(x, y, 1, 0.5, o.body);
  // A smith's shirt sleeve shows behind the apron.
  if (o.arm !== o.body) fine(back, y, 0.5, 0.5, o.arm);
  const moving = pose === "walk" || pose === "climb";
  fine(x, y + 0.5, 0.5, 0.5, moving && step % 2 ? o.boots : o.legs);
  fine(x + 0.5, y + 0.5, 0.5, 0.5, moving && step % 2 === 0 ? o.boots : o.legs);
}

/** A miner asleep in its bunk: its head at cell (x, y) on the pillow, under
 * a blanket toward `facing`. */
export function drawSleeper(fine: Fine, o: Outfit, x: number, y: number, facing: number, blanket: string) {
  const headX = facing > 0 ? x + 0.5 : x;
  fine(headX, y + 0.5, 0.5, 0.5, o.face === VISOR ? o.back : o.face);
  fine(facing > 0 ? x : x + 0.5, y + 0.5, 0.5, 0.5, o.job === "forge" ? HAIR[1] : o.back);
  fine(Math.min(x, x + facing) + (facing > 0 ? 1 : 0), y + 0.5, 1, 0.5, blanket);
  fine(Math.min(x, x + facing) + (facing > 0 ? 1 : 0), y + 0.25, 1, 0.25, "rgba(255,255,255,0.12)");
}
