/** The Reinforcements spell as it is drawn, in the city's pixel art:
 *
 * - **The soldiers:** knights in steel helms and blue tabards with a gold
 *   cross, a shield and sword; the levy's archers in green hoods with a bow;
 *   Hammerfall's champion in gold plate and a red cloak, with a warhammer. Each is a cached
 *   sprite in a black outline, struck ones flashing white, fading over their
 *   last second; on a last stand the outline burns gold.
 * - **Coming down:** a shaft of gold light over the spot, the soldier
 *   dropping down it, and its shadow on the ground darkening as it nears.
 * - **On the ground:** a ring of dust where each lands (wider, with flung
 *   grit, for a shockwave; cracked and glowing for the champion's quake),
 *   a column of light rising where one marches off, and stars circling over
 *   the heads of the staggered.
 *
 * Presentation only: it reads the sim and draws from hashes and the
 * battle's time, never from a random stream. */
import { hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { OUTLINE, artPen } from "./pixel-fx.ts";
import { LAND_SHOW, type CalledLook, type Drop } from "./reinforcements.ts";
import { drawMeleeCape, type CapeWearer } from "./melee-cape.ts";
import type { ReliefLight } from "./ground-relief.ts";
import type { DefendSim, Soldier } from "./sim.ts";

type Ctx = CanvasRenderingContext2D;

const GOLD = ["#8a5a1c", "#c8902e", "#f6c75a", "#fff4c8"];
const DUST = ["#5a4a3a", "#8a7660", "#b8a68a"];
const COLORS: Record<string, string> = {
  o: OUTLINE, l: "#d8dee6", s: "#a7b0b8", d: "#4a5466", b: "#3d6fc4", y: GOLD[2], h: "#6b4a2a",
  g: "#4f8a3a", k: "#e0b48a", w: "#7a5a34", r: "#b8302a",
};

/** A knight, a levy archer and the champion. */
const SPRITES: Record<CalledLook, readonly string[]> = {
  knight: [
    "..ooo..o.",
    ".ollloolo",
    ".odddoolo",
    "..olo.olo",
    "oobbbooso",
    "osbybyhhh",
    "osbbbo.h.",
    ".obbbo...",
    ".os.so...",
    ".oo.oo...",
  ],
  archer: [
    ".o..ooo..",
    "ow.ogggo.",
    "ow.okkko.",
    "ow..oko..",
    "ow.ogggo.",
    "owogggggo",
    "ow.ogggo.",
    "ow..ogo..",
    ".o.os.so.",
    "...oo.oo.",
  ],
  champion: [
    "....ooooo...ooo",
    "...oyyyyyo..oso",
    "...oyldlyo..oso",
    "...odddddo..ooo",
    "....oyyyo...oho",
    ".ooooyyyoooooho",
    "orrylllllyrroho",
    "orrylyyylyrroho",
    "orrylyyylyrroho",
    ".orylllllyrooho",
    ".ooylllllyoooho",
    "...oyyoyyo..oho",
    "...olloollo.ooo",
    "...oooooooo....",
  ],
};

const sprites = new Map<string, HTMLCanvasElement>();
/** A soldier's sprite: struck (white), on a last stand (gold outline), or plain. */
function sprite(look: CalledLook, struck: boolean, stood: boolean) {
  const key = `${look}:${struck}:${stood}`;
  let cv = sprites.get(key);
  if (cv) return cv;
  const rows = SPRITES[look];
  cv = document.createElement("canvas");
  cv.width = rows[0].length;
  cv.height = rows.length;
  const c = cv.getContext("2d")!;
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    c.fillStyle = ch === "o" ? (stood ? GOLD[2] : OUTLINE) : struck ? "#fff" : COLORS[ch];
    c.fillRect(i, j, 1, 1);
  }));
  sprites.set(key, cv);
  return cv;
}

/** Draws `look` standing at (x, y), `size` cells tall-ish, `h` cells up off the ground. */
function body(c: Ctx, px: number, look: CalledLook, size: number, x: number, y: number, struck = false, stood = false) {
  const img = sprite(look, struck, stood);
  const k = Math.max(1, Math.round((px * size * 1.9) / img.height));
  const w = img.width * k, h = img.height * k;
  c.drawImage(img, Math.round(x * px - w / 2), Math.round(y * px - h * 0.6), w, h);
}

/** A reinforcement where it stands. */
export function drawCalled(c: Ctx, px: number, u: Soldier) {
  const r = u.called!;
  const fade = !r.stood && r.life < 1 ? Math.max(0, r.life) : 1;
  c.save();
  if (fade < 1) c.globalAlpha = fade;
  c.imageSmoothingEnabled = false;
  body(c, px, r.look, r.size, u.x, u.y, u.flash > 0, !!r.stood);
  c.restore();
}

/** Cells over the ground a soldier starts its drop from. */
const HEIGHT = 7;

/** Those coming down: the shaft of light, the shadow, the soldier. */
const dropCapes = new WeakMap<Drop, CapeWearer>();
export function drawDrops(c: Ctx, px: number, sim: DefendSim, reduced = false, capes = true) {
  if (!sim.drops.length) return;
  const dot = artPen(c, px);
  c.save();
  c.imageSmoothingEnabled = false;
  for (const d of sim.drops) {
    const k = Math.min(1, d.t / d.fall), h = HEIGHT * (1 - k * k);
    const ax = Math.round(d.x * ART), ay = Math.round(d.y * ART), top = Math.round((d.y - HEIGHT - 1) * ART);
    // The shaft: a column of gold, brightest down its middle, growing as it nears.
    const half = 2 + Math.round(k * 2);
    c.globalAlpha = 0.18 + 0.2 * k;
    c.fillStyle = GOLD[2];
    dot(ax - half, top, 2 * half + 1, ay - top);
    c.globalAlpha = 0.3 + 0.3 * k;
    c.fillStyle = GOLD[3];
    dot(ax - 1, top, 3, ay - top);
    // The shadow, darker the nearer it is.
    const sw = Math.round(2 + 4 * k);
    c.globalAlpha = 0.25 + 0.4 * k;
    c.fillStyle = OUTLINE;
    dot(ax - sw, ay + 1, 2 * sw + 1, 2);
    dot(ax - sw + 1, ay, 2 * sw - 1, 4);
    c.globalAlpha = Math.min(1, 0.4 + k);
    if (capes && d.called.range === 0) {
      let wearer = dropCapes.get(d);
      if (!wearer) {
        wearer = { id: Math.round(d.x * 31 + d.y * 17), kind: "reinforcement", home: -1, x: d.x, y: d.y - h, flash: 0, called: d.called };
        dropCapes.set(d, wearer);
      }
      drawMeleeCape(c, px, wearer, sim, reduced, d.x, d.y - h);
    }
    body(c, px, d.called.look, d.called.size, d.x, d.y - h);
  }
  c.restore();
}

/** Rings on the ground: dust where they land, a quake's cracks, light where one leaves. */
export function drawLandings(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.landings.length) return;
  const dot = artPen(c, px);
  c.save();
  for (const l of sim.landings) {
    const k = l.t / LAND_SHOW, fade = 1 - k, ax = Math.round(l.x * ART), ay = Math.round(l.y * ART);
    const seed = Math.round(l.x * 97 + l.y * 31);
    if (l.kind === "leave") {
      // A column of light, pixels rising out of it and thinning.
      c.globalAlpha = 0.5 * fade;
      c.fillStyle = GOLD[3];
      dot(ax - 1, ay - Math.round(ART * (0.5 + 2 * k)), 3, Math.round(ART * (0.6 + 2 * k)));
      for (let i = 0; i < 8; i++) {
        c.globalAlpha = fade * (1 - i / 10);
        c.fillStyle = i % 2 ? GOLD[2] : GOLD[3];
        dot(ax - 3 + Math.round(hash01(seed, i, 1) * 7), ay - Math.round((hash01(seed, i, 2) + k * 2.5) * ART), 1, 1);
      }
      continue;
    }
    const r = l.r * ART * Math.min(1, 0.3 + k * 1.6), n = Math.max(8, Math.round(r * 0.9));
    // The ring of dust, in pixels round the landing.
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, wob = 1 + (hash01(seed, i, 3) - 0.5) * 0.25;
      const x = ax + Math.round(Math.cos(a) * r * wob), y = ay + Math.round(Math.sin(a) * r * wob * 0.85);
      c.globalAlpha = 0.85 * fade;
      c.fillStyle = OUTLINE;
      dot(x - 1, y - 1, 4, 4);
      c.fillStyle = l.kind === "quake" ? (i % 3 ? GOLD[1] : GOLD[2]) : DUST[1 + (i % 2)];
      dot(x, y, 2, 2);
      c.fillStyle = l.kind === "quake" ? GOLD[3] : DUST[2];
      dot(x, y, 1, 1);
    }
    if (l.kind === "quake") {
      // Cracks out from the middle, glowing as they open.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + hash01(seed, i, 4), len = r * (0.5 + 0.4 * hash01(seed, i, 5));
        for (let s = 2; s < len; s++) {
          c.globalAlpha = fade;
          c.fillStyle = s % 3 ? OUTLINE : GOLD[2];
          dot(ax + Math.round(Math.cos(a) * s), ay + Math.round(Math.sin(a) * s), 1, 1);
        }
      }
    } else if (l.r > 0.8) {
      // A shockwave flings grit.
      for (let i = 0; i < 6; i++) {
        const a = hash01(seed, i, 6) * Math.PI * 2, s = r * (0.4 + 0.5 * k);
        c.globalAlpha = fade;
        c.fillStyle = DUST[2];
        dot(ax + Math.round(Math.cos(a) * s), ay - Math.round(Math.abs(Math.sin(a)) * s * 0.8 + k * 3), 1, 1);
      }
    }
  }
  c.restore();
}

/** Two little stars circling over each staggered enemy's head. */
export function drawStaggered(c: Ctx, px: number, sim: DefendSim) {
  if (!sim.squads) return;
  const dot = artPen(c, px);
  c.save();
  for (const e of sim.enemies) {
    if (!e.stagger || e.hp <= 0) continue;
    const ax = e.x * ART, ay = (e.y - 0.6) * ART;
    for (let i = 0; i < 2; i++) {
      const a = sim.time * 6 + i * Math.PI + e.id;
      const x = Math.round(ax + Math.cos(a) * 3), y = Math.round(ay + Math.sin(a) * 1.2);
      c.fillStyle = OUTLINE;
      dot(x - 1, y, 3, 1);
      dot(x, y - 1, 1, 3);
      c.fillStyle = GOLD[3];
      dot(x, y, 1, 1);
    }
  }
  c.restore();
}

/** The shafts of light and the landings light the streets gold. */
export function reinforceLights(sim: DefendSim): ReliefLight[] {
  const out: ReliefLight[] = [];
  for (const d of sim.drops) out.push({ x: d.x, y: d.y, r: 1.6, k: 0.4 + 0.5 * Math.min(1, d.t / d.fall), color: GOLD[2] });
  for (const l of sim.landings) if (l.kind !== "land") out.push({ x: l.x, y: l.y, r: Math.max(1.2, l.r * 1.2), k: 0.8 * (1 - l.t / LAND_SHOW), color: GOLD[2] });
  return out;
}
