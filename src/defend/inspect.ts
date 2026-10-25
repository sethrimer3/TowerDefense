import { mineRange } from "./mines.ts";
import { MINELAYER } from "../knowledge-paths.ts";
/** A tapped building on the DEFEND board: outlined in gold, with its reach
 * as faint circles when it shoots and the troops it trained outlined too;
 * a troop building also shows its deployment range and rally point.
 * Presentation only; it reads the battle (or, while building, the levels
 * and the Study's paths) and never changes it. */
import { TURRET, turretSpots } from "./catalog.ts";
import { wallBallistaRange } from "./wall-defenses.ts";
import type { Building, CityMap } from "./citygen.ts";
import { center } from "./pathing.ts";
import { watchReach, type DefendSim } from "./sim.ts";
import { nanoRange } from "./nanobots.ts";
import { archerTowerRange, cannonTowerRange, keepArrowRange, keepOilReach } from "./towers.ts";
import { wizardReach } from "./wizard.ts";
import { deployCircle, type Rally } from "./deployment.ts";
import { drawRallyFlag } from "./structure-art.ts";

/** What a reach depends on: the battle, or the levels and paths before it. */
export type Armed = Pick<DefendSim, "levels" | "bonuses">;
export type Circle = { x: number; y: number; r: number };

/** Buildings that train troops, whose troops a tap picks out. */
const TRAINS = new Set(["meleeGuild", "rangedGuild", "barracks", "chapterHouse", "berserkerLodge", "halberdYard", "heroHall", "shadow", "bloodHall", "veilHouse", "poisonDen", "archerBarracks", "rangerLodge", "skirmishCamp", "skyrangerLodge", "sniperLodge", "musketHall", "gunHall", "gunNest", "gatlingNest", "rocketBattery", "revolutionary", "assassinDen", "spearHall", "phalanx", "javelinCamp", "lancerStable", "mageGuild", "infernoHall", "cinderHall", "stormHall", "valkyriePalace", "darkKeep"]);

/** Whether a tap on `b` picks it: the keep, the player's structures and the wall's ballistas. */
export const inspectable = (b: Building | undefined): b is Building =>
  !!b && (b.kind === "keep" || b.structureUid !== undefined || b.kind === "wallBallista");

/** Where building `b` reaches, as circles in cells; none for what doesn't shoot. */
export function reachOf(b: Building, armed: Armed): Circle[] {
  const c = center(b.rect);
  const at = (r: number) => [{ x: c.x, y: c.y, r }];
  switch (b.kind) {
    case "archerTower": case "brazierTower": case "hawkTower": case "wispTower": return at(archerTowerRange(armed, b));
    case "cannonTower": case "batteryTower": case "mortarTower": case "minelayerTower": return at(cannonTowerRange(armed, b));
    case "nanoTower": return at(nanoRange());
    case "wizardTower": case "pyreTower": case "frostTower": case "stormTower": return at(wizardReach(armed, b));
    case "watchTower": return at(watchReach(armed, b));
    case "wallBallista": return at(wallBallistaRange(armed));
    case "keep": {
      // Its arrow loops' reach, and how far out its boiling oil pours.
      const out: Circle[] = [], arrows = keepArrowRange(armed), oil = keepOilReach(armed);
      if (arrows) out.push({ x: c.x, y: c.y, r: arrows });
      if (oil) out.push({ x: c.x, y: c.y, r: Math.max(b.rect.w, b.rect.h) / 2 + oil });
      return out;
    }
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
export function drawInspect(c: CanvasRenderingContext2D, px: number, map: CityMap, sim: DefendSim | null, id: number, armed: Armed, now: number, reduceMotion: boolean, aim?: { point?: Rally; since: number }) {
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
  // A troop building's deployment range, in dashed pale blue, and its
  // rally point: a blue flag at the end of a dotted line from it.
  const deploy = deployCircle(b, armed.bonuses);
  if (deploy) {
    c.beginPath();
    c.arc(deploy.x * px, deploy.y * px, deploy.r * px, 0, Math.PI * 2);
    c.fillStyle = "rgba(140, 190, 255, 0.06)";
    c.fill();
    c.setLineDash([line(4), line(5)]);
    c.lineWidth = line(1.5);
    c.strokeStyle = "rgba(160, 205, 255, 0.6)";
    c.stroke();
    c.setLineDash([]);
    const rally = aim ? aim.point : sim?.rallies.get(id);
    if (rally) {
      const o = center(b.rect);
      c.setLineDash([line(2), line(4)]);
      c.lineWidth = line(1.5);
      c.strokeStyle = "rgba(0, 0, 0, 0.6)";
      c.beginPath(); c.moveTo(o.x * px, o.y * px); c.lineTo(rally.x * px, rally.y * px); c.stroke();
      c.lineWidth = line(1);
      c.strokeStyle = "#cfe3ff";
      c.stroke();
      c.setLineDash([]);
      const tower = rally.tower !== undefined ? map.buildings[rally.tower] : undefined;
      if (tower) frame(c, (tower.rect.x - 0.15) * px, (tower.rect.y - 0.15) * px, (tower.rect.w + 0.3) * px, (tower.rect.h + 0.3) * px, line, pulse, "#9cc8ff");
      drawRallyFlag(c, px, rally, { t: now / 1000, reduceMotion });
    }
  }
  if (b.kind === "minelayerTower") {
    const origin = center(b.rect), point = aim ? aim.point : sim?.mineAims.get(id);
    const target = point ?? origin;
    const t = reduceMotion || !aim ? 1 : Math.min(1, Math.max(0, (now - aim.since) / 350));
    const radius = point ? MINELAYER.scatter : MINELAYER.scatter + (mineRange() - MINELAYER.scatter) * (1 - (1 - t) ** 3);
    c.save();
    // Clip the target area to actual range, including crosshairs dragged to its edge.
    c.beginPath(); c.arc(origin.x * px, origin.y * px, mineRange() * px, 0, Math.PI * 2); c.clip();
    c.strokeStyle = "#ffc96a"; c.lineWidth = line(2);
    c.beginPath(); c.arc(target.x * px, target.y * px, radius * px, 0, Math.PI * 2); c.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c.beginPath();
      c.moveTo((target.x + dx * (radius - .45)) * px, (target.y + dy * (radius - .45)) * px);
      c.lineTo((target.x + dx * radius) * px, (target.y + dy * radius) * px);
      c.stroke();
    }
    if (point) {
      c.setLineDash([line(3), line(4)]); c.lineWidth = line(1);
      c.beginPath(); c.moveTo(origin.x * px, origin.y * px); c.lineTo(point.x * px, point.y * px); c.stroke();
    }
    c.restore();
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
function frame(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, line: (n: number) => number, alpha: number, colour = GOLD) {
  c.globalAlpha = alpha;
  c.lineWidth = line(4);
  c.strokeStyle = "#000";
  c.strokeRect(x, y, w, h);
  c.lineWidth = line(2);
  c.strokeStyle = colour;
  c.strokeRect(x, y, w, h);
  c.globalAlpha = 1;
}
