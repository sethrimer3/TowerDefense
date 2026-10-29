/** Troops up in a watch tower (`Soldier.perch`, `gun-sight.ts`) aren't drawn
 * as themselves standing on its roof: each shows as a small badge over the
 * tower instead, in a black outline and a brass rim, with a little figure in
 * its troop's colour holding its weapon, flashing white when hurt. Badges sit
 * side by side, centred over the tower, a notch under each pointing down.
 * Presentation only. */
import { ART } from "./park-art.ts";
import { artPen, OUTLINE } from "./pixel-fx.ts";
import { TROOPS } from "./simple-units.ts";
import type { Rect } from "./grid.ts";
import type { DefendSim, Soldier } from "./sim.ts";
import type { UnitInks } from "./unit-outline.ts";

type Brush = { c: CanvasRenderingContext2D; px: number };

/** A badge's side and the gap between two, in art pixels. */
export const BADGE = { size: 9, gap: 1, lift: 2 };

/** Up in a tower: drawn as a badge, not on the board. */
export const garrisoned = (u: Soldier) => u.hp > 0 && !!u.perch?.up;

/** Each standing tower with troops up in it, its rect and those troops in
 * the order they climbed. */
export function garrisons(sim: DefendSim): { rect: Rect; units: Soldier[] }[] {
  const by = new Map<number, Soldier[]>();
  for (const u of sim.soldiers) {
    if (!garrisoned(u)) continue;
    const list = by.get(u.perch!.tower);
    if (list) list.push(u);
    else by.set(u.perch!.tower, [u]);
  }
  const out: { rect: Rect; units: Soldier[] }[] = [];
  for (const [id, units] of by) {
    const b = sim.map.buildings[id];
    if (b) out.push({ rect: b.rect, units });
  }
  return out;
}

/** The top left of each badge over a tower, in art pixels: a row centred on
 * the tower, its notches just above the tower's top edge. */
export function badgeSpots(rect: Rect, n: number): { ax: number; ay: number }[] {
  const w = n * BADGE.size + (n - 1) * BADGE.gap;
  const x0 = Math.round((rect.x + rect.w / 2) * ART - w / 2);
  const ay = Math.round(rect.y * ART) - BADGE.size - BADGE.lift;
  return Array.from({ length: n }, (_, i) => ({ ax: x0 + i * (BADGE.size + BADGE.gap), ay }));
}

/** The weapon's colour across each badge: steel, a musket's wood, a
 * rocket's red tip or a laser rifle's glow. */
const WEAPON: Partial<Record<Soldier["kind"], string>> = {
  musketeer: "#8c6232",
  rocketeer: "#e0503a",
  railSniper: "#6fe3ff",
  sniper: "#3a4a2c",
  gatlingGunner: "#d0a446",
  slinger: "#9a9488",
  archer: "#b58a4f",
  javelineer: "#b58a4f",
  mage: "#f08a34",
};
const STEEL = "#aab3bc";
const RIM = "#c9a24a", FACE = "#2a1f16", SKIN = "#e2b98c", BOOTS = "#1c140e";

/** Every garrison's badges, over the units. */
export function drawGarrisons({ c, px }: Brush, sim: DefendSim, sides?: UnitInks) {
  const pen = artPen(c, px);
  const fill = (color: string, x: number, y: number, w: number, h: number) => {
    c.fillStyle = color;
    pen(x, y, w, h);
  };
  for (const { rect, units } of garrisons(sim))
    badgeSpots(rect, units.length).forEach(({ ax, ay }, i) => drawBadge(fill, ax, ay, units[i].kind, units[i].flash > 0, true, sides?.ink(units[i].id)));
}

/** One troop kind's badge, without its notch, on a canvas `BADGE.size`
 * pixels square: the Siege page's remaining troops use it as their icon. */
export function paintTroopBadge(canvas: HTMLCanvasElement, kind: Soldier["kind"]) {
  canvas.width = canvas.height = BADGE.size;
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, BADGE.size, BADGE.size);
  drawBadge(
    (color, x, y, w, h) => {
      c.fillStyle = color;
      c.fillRect(x, y, w, h);
    },
    0,
    0,
    kind,
    false,
    false,
  );
}

type Fill = (color: string, x: number, y: number, w: number, h: number) => void;

function drawBadge(fill: Fill, x: number, y: number, kind: Soldier["kind"], white: boolean, notch = true, ink = OUTLINE) {
  const n = BADGE.size;
  // The outline, corners cut, and its notch pointing down at the tower.
  fill(ink, x + 1, y, n - 2, n);
  fill(ink, x, y + 1, n, n - 2);
  if (notch) {
    fill(ink, x + (n >> 1) - 1, y + n, 3, 1);
    fill(ink, x + (n >> 1), y + n + 1, 1, 1);
  }
  // The brass rim and the dark face inside it.
  fill(RIM, x + 1, y + 1, n - 2, n - 2);
  fill(white ? "#ffffff" : FACE, x + 2, y + 2, n - 4, n - 4);
  if (white) return;
  // The figure: a head, shoulders and body in its colour, legs below, its
  // weapon held across the body out to the rim.
  const body = TROOPS[kind]?.color ?? "#8a8a8a";
  const mx = x + (n >> 1);
  fill(SKIN, mx, y + 2, 1, 1);
  fill(body, mx - 1, y + 3, 3, 1);
  fill(body, mx - 2, y + 4, 5, 1);
  fill(body, mx - 1, y + 5, 3, 1);
  fill(BOOTS, mx - 1, y + 6, 1, 1);
  fill(BOOTS, mx + 1, y + 6, 1, 1);
  fill(WEAPON[kind] ?? STEEL, mx + 1, y + 4, 3, 1);
}
