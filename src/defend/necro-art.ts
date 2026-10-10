/** The Necromancy spell as it is drawn, in the city's pixel art:
 *
 * - **The risen:** bone warriors in a black outline with grave-green eyes,
 *   a notched sword (or, as Bone archers, a bow), and the Amalgam's giant,
 *   a heap of skulls and ribs; each a cached sprite, struck ones flashing
 *   white, fading out over their last second before they crumble.
 * - **A cast:** a green ring bursting out to the spell's reach, and a wisp
 *   rising pixel by pixel from every grave a warrior climbs out of.
 *
 * Presentation only: it reads the sim and never draws from a random stream. */
import { ART } from "./park-art.ts";
import { NECRO, RAISE_SHOW } from "./necromancy.ts";
import type { DefendSim, Soldier } from "./sim.ts";

type Ctx = CanvasRenderingContext2D;

const OUTLINE = "#0b0907";
const GREEN = ["#1d3326", "#3f9a5c", "#8dffa6", "#e8fff0"];
const COLORS: Record<string, string> = { o: OUTLINE, w: "#e8e2cf", l: "#a39a82", g: GREEN[2], s: "#a7b0b8", h: "#6b4a2a", b: "#7a5a34" };

/** A bone warrior with a sword, an archer with a bow, and the giant. */
const SPRITES = {
  warrior: [
    "..ooo..o.",
    ".owwwooso",
    ".ogwgooso",
    "..owo.oso",
    ".owlwooso",
    "owlwlwhhh",
    ".owlwo.h.",
    "..owo....",
    ".ow.wo...",
    ".oo.oo...",
  ],
  archer: [
    ".o..ooo..",
    "ob.owwwo.",
    "ob.ogwgo.",
    "ob..owo..",
    "ob.owlwo.",
    "obowlwlwo",
    "ob.owlwo.",
    "ob..owo..",
    ".o.ow.wo.",
    "...oo.oo.",
  ],
  amalgam: [
    "....ooooooo....",
    "...owwwwwwlo...",
    "..owwwwwwwwlo..",
    "..owggwwwggwlo.",
    "..owgowwwgowlo.",
    ".ooowwwoowwlooo",
    "owwwolwlwlwowwo",
    "owgwolwlwlwogwo",
    "owwwowlwlwlowwo",
    ".ooowlwlwlwooo.",
    "...owlwlwlwo...",
    "..owwwolowwwo..",
    ".owlwo...owlwo.",
    ".owwo.....owwo.",
    ".ooo.......ooo.",
  ],
} as const;
type Look = keyof typeof SPRITES;

const sprites = new Map<string, HTMLCanvasElement>();
function sprite(look: Look, struck: boolean) {
  const key = `${look}:${struck}`;
  let cv = sprites.get(key);
  if (cv) return cv;
  const rows = SPRITES[look];
  cv = document.createElement("canvas");
  cv.width = rows[0].length;
  cv.height = rows.length;
  const c = cv.getContext("2d")!;
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    c.fillStyle = struck && ch !== "o" ? "#fff" : COLORS[ch];
    c.fillRect(i, j, 1, 1);
  }));
  sprites.set(key, cv);
  return cv;
}

/** A risen warrior where it stands, sized to its body. */
export function drawRisen(c: Ctx, px: number, u: Soldier) {
  const r = u.risen!, img = sprite(r.look, u.flash > 0);
  const k = Math.max(1, Math.round((px * r.size * 1.9) / img.height));
  const w = img.width * k, h = img.height * k;
  const fade = r.life !== undefined && r.life < 1 ? Math.max(0, r.life) : 1;
  c.save();
  if (fade < 1) c.globalAlpha = fade;
  c.imageSmoothingEnabled = false;
  c.drawImage(img, Math.round(u.x * px - w / 2), Math.round(u.y * px - h * 0.6), w, h);
  c.restore();
}

/** Each cast still flaring: the ring, then the wisps over the risen. */
export function drawRaisings(c: Ctx, px: number, sim: DefendSim) {
  const p = Math.max(1, Math.round(px / ART));
  for (const ring of sim.raisings) {
    const k = ring.t / RAISE_SHOW, fade = 1 - k;
    c.save();
    c.globalAlpha = 0.8 * fade;
    c.strokeStyle = GREEN[2];
    c.lineWidth = Math.max(1, p * 2);
    c.beginPath();
    c.arc(ring.x * px, ring.y * px, ring.r * px * Math.min(1, k * 2.5), 0, Math.PI * 2);
    c.stroke();
    // Wisps: a short column of green pixels climbing out of each grave.
    for (const at of ring.risen) {
      const x = Math.round(at.x * px), y = Math.round(at.y * px);
      const rise = Math.round(k * px * 1.2);
      for (let i = 0; i < 5; i++) {
        c.globalAlpha = fade * (1 - i / 5);
        c.fillStyle = OUTLINE;
        c.fillRect(x - p * 2, y - rise + i * p * 2 - p, p * 4, p * 3);
      }
      for (let i = 0; i < 5; i++) {
        c.globalAlpha = fade * (1 - i / 5);
        c.fillStyle = GREEN[i ? 2 : 3];
        const sway = Math.round(Math.sin(ring.t * 9 + i + at.x) * p);
        c.fillRect(x - p + sway, y - rise + i * p * 2, p * 2, p * 2);
      }
    }
    c.restore();
  }
}

/** The spell's ring and glow light the streets green while it flares. */
export function raisingLights(sim: DefendSim) {
  return sim.raisings.map((r) => ({ x: r.x, y: r.y, r: NECRO.radius * 1.2, k: 0.8 * (1 - r.t / RAISE_SHOW), color: GREEN[2] }));
}
