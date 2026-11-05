import { ordersOf, rangeScale } from "./building-orders.ts";
import { drawSquareRange, drawFullReach, drawNearbySquare, drawCrosshairs, drawAimLine } from "./square-range-art.ts";
import { mineRange } from "./mines.ts";
import { MINELAYER } from "../knowledge-paths.ts";
/** A tapped building on the DEFEND board: outlined in gold, with its reach
 * as faint squares when it shoots and the troops it trained outlined too;
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
  !!b && (b.kind === "keep" || b.structureUid !== undefined || b.kind === "wallBallista" || b.kind === "gate" || !!b.piece);

/** Where building `b` reaches, as squares in cells; none for what doesn't shoot. */
export function reachOf(b: Building, armed: Armed): Circle[] {
  const c = center(b.rect);
  const at = (r: number) => [{ x: c.x, y: c.y, r }];
  switch (b.kind) {
    case "archerTower": case "brazierTower": case "hawkTower": case "wispTower": case "chronoTower": return at(archerTowerRange(armed, b));
    case "cannonTower": case "batteryTower": case "mortarTower": case "minelayerTower": return at(cannonTowerRange(armed, b));
    case "nanoTower": return at(nanoRange()*rangeScale(armed,b));
    case "wizardTower": case "pyreTower": case "frostTower": case "stormTower": return at(wizardReach(armed, b));
    case "watchTower": return at(watchReach(armed, b));
    case "wallBallista": return at(wallBallistaRange(armed)*rangeScale(armed,b));
    case "keep": {
      // Its arrow loops' reach, and how far out its boiling oil pours.
      const out: Circle[] = [], arrows = keepArrowRange(armed), oil = keepOilReach(armed);
      if (arrows) out.push({ x: c.x, y: c.y, r: arrows*rangeScale(armed,b) });
      if (oil) out.push({ x: c.x, y: c.y, r: (Math.max(b.rect.w, b.rect.h) / 2 + oil)*rangeScale(armed,b) });
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
  // Turned down from 100%, the full reach shows as a faint dotted ghost.
  const scaled=rangeScale(armed,b),ghost=scaled<1&&b.kind!=="darkKeep";
  for(const square of reachOf(b,armed)) {
    if(ghost)drawFullReach(c,px,{...square,r:square.r/scaled},"reach");
    drawSquareRange(c,px,square,"reach");
  }
  const deploy=deployCircle(b,armed.bonuses,armed);
  if(deploy) {
    if(scaled<1)drawFullReach(c,px,{...deploy,r:deploy.r/scaled},"deploy");
    drawSquareRange(c,px,deploy,"deploy");
    const saved=ordersOf(armed,b).rally,home=center(b.rect);
    const rally = aim ? aim.point : sim?.rallies.get(id) ?? (saved?{x:home.x+saved.x,y:home.y+saved.y}:undefined);
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
  if(aim&&!deploy&&aim.point) {
    const range=reachOf(b,armed)[0];
    if(range){drawNearbySquare(c,px,{...aim.point,r:2},range,now,reduceMotion);drawCrosshairs(c,px,aim.point,now,reduceMotion,true);drawAimLine(c,px,center(b.rect),aim.point);}
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

/** Persistent crosshair areas are visible without selecting their building. */
export function drawBuildingOrders(c:CanvasRenderingContext2D,px:number,map:CityMap,armed:Armed,now:number,reduceMotion:boolean) {
  for(const b of map.buildings) {
    if(b.hidden)continue;
    const o=ordersOf(armed,b),point=o.crosshair,range=reachOf(b,armed)[0];
    if(!point||!range)continue;
    const home=center(b.rect),at={x:home.x+point.x,y:home.y+point.y};
    drawNearbySquare(c,px,{...at,r:2},range,now,reduceMotion);
    drawCrosshairs(c,px,at,now,reduceMotion);
  }
}
