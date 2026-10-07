/** A tapped building on the DEFEND board: outlined in gold, with its reach
 * as faint circles when it shoots and the troops it trained outlined too.
 * Presentation only; it reads the battle (or, while building, the levels
 * and the Study's paths) and never changes it. */
import { BALLISTA, TURRET, turretSpots } from "./catalog.ts";
import type { Building, CityMap } from "./citygen.ts";
import { center } from "./pathing.ts";
import { watchReach, type DefendSim } from "./sim.ts";
import { archerTowerRange, cannonTowerRange } from "./towers.ts";
import { wizardReach } from "./wizard.ts";

/** What a reach depends on: the battle, or the levels and paths before it. */
export type Armed = Pick<DefendSim, "levels" | "bonuses">;
export type Circle = { x: number; y: number; r: number };

/** Buildings that train troops, whose troops a tap picks out. */
const TRAINS = new Set(["barracks", "archerBarracks", "mageGuild", "valkyriePalace", "darkKeep"]);

/** Whether a tap on `b` picks it: the player's structures and the wall's ballistas. */
export const inspectable = (b: Building | undefined): b is Building =>
  !!b && b.kind !== "keep" && (b.structureUid !== undefined || b.kind === "wallBallista");

/** Where building `b` reaches, as circles in cells; none for what doesn't shoot. */
export function reachOf(b: Building, armed: Armed): Circle[] {
  const c = center(b.rect);
  const at = (r: number) => [{ x: c.x, y: c.y, r }];
  switch (b.kind) {
    case "archerTower": return at(archerTowerRange(armed));
    case "cannonTower": return at(cannonTowerRange(armed));
    case "wizardTower": return at(wizardReach(armed));
    case "watchTower": return at(watchReach(armed));
    case "wallBallista": return at(BALLISTA.range);
    case "darkKeep": return turretSpots(b.rect).map((s) => ({ x: s.x, y: s.y, r: TURRET.range }));
    default: return [];
  }
}

/** The living troops building `b` trained. */
export function troopsOf(b: Building, sim: DefendSim | null) {
  return sim && TRAINS.has(b.kind) ? sim.soldiers.filter((s) => s.home === b.id && s.hp > 0) : [];
}

const GOLD = "#f2c14e";

/** Draws the pick over the board; `c` is in board space at `px` a cell. */
export function drawInspect(c: CanvasRenderingContext2D, px: number, map: CityMap, sim: DefendSim | null, id: number, armed: Armed, now: number, reduceMotion: boolean) {
  const b = map.buildings[id];
  if (!b) return;
  const scale = c.getTransform().a || 1;
  const line = (n: number) => n / scale;
  const pulse = reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(now / 260);
  c.save();
  // The reach: a faint wash, its edge in dashed gold.
  const circles = reachOf(b, armed);
  if (circles.length) {
    c.beginPath();
    for (const r of circles) {
      c.moveTo((r.x + r.r) * px, r.y * px);
      c.arc(r.x * px, r.y * px, r.r * px, 0, Math.PI * 2);
    }
    c.fillStyle = "rgba(242, 193, 78, 0.08)";
    c.fill("nonzero");
    c.setLineDash([line(6), line(4)]);
    c.lineWidth = line(1.5);
    c.strokeStyle = "rgba(242, 193, 78, 0.55)";
    c.stroke();
    c.setLineDash([]);
  }
  // The building: a black-edged gold frame round its cells.
  const pad = 0.15;
  frame(c, (b.rect.x - pad) * px, (b.rect.y - pad) * px, (b.rect.w + 2 * pad) * px, (b.rect.h + 2 * pad) * px, line, pulse);
  // Its troops: a small frame round each.
  for (const s of troopsOf(b, sim)) {
    const r = 0.55;
    frame(c, (s.x - r) * px, (s.y - r) * px, 2 * r * px, 2 * r * px, line, pulse);
  }
  c.restore();
}

/** A gold outline inside a black one, crisp at any zoom. */
function frame(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, line: (n: number) => number, alpha: number) {
  c.globalAlpha = alpha;
  c.lineWidth = line(4);
  c.strokeStyle = "#000";
  c.strokeRect(x, y, w, h);
  c.lineWidth = line(2);
  c.strokeStyle = GOLD;
  c.strokeRect(x, y, w, h);
  c.globalAlpha = 1;
}
