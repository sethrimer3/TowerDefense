/** Tangent circle/straight/circle routes. Every turn has the same broad radius;
 * rejecting paths outside the tower's disk avoids clipping sharp corners. */
import { WISP } from "../knowledge-paths.ts";
import type { Point } from "./pathing.ts";

export type FlightPoint = Point & { angle: number; distance: number };
export type WispFlight = { points: FlightPoint[]; length: number; distance: number; index: number };
const TAU = Math.PI * 2;
const positive = (a: number) => (a % TAU + TAU) % TAU;

export function wispFlight(from: Point & { angle: number }, aim: Point, home: Point, range: number,
  limit = range): WispFlight | undefined {
  const radius = range * WISP.turnRadius;
  const inward = Math.atan2(home.y - aim.y, home.x - aim.x);
  let best: WispFlight | undefined;
  // Inward arrival headings leave room for the next pass. The alternatives
  // also allow glancing approaches to enemies near the edge of the range.
  for (let heading = 0; heading < 16; heading++) {
    const endAngle = inward + heading * TAU / 16;
    if (Math.cos(endAngle)*(aim.x-home.x)+Math.sin(endAngle)*(aim.y-home.y)>1e-8) continue;
    for (const first of [-1, 1]) for (const last of [-1, 1]) {
      const a = { x: from.x - first * radius * Math.sin(from.angle), y: from.y + first * radius * Math.cos(from.angle) };
      const b = { x: aim.x - last * radius * Math.sin(endAngle), y: aim.y + last * radius * Math.cos(endAngle) };
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      const offset = (last - first) * radius;
      if (Math.abs(offset) > d) continue;
      let turns: number[], straight: number;
      if (d < 1e-9) {
        // Returning to the same aim can be a complete, contained circle.
        // Omitting this case strands arrows at enemies on the range edge.
        if (first !== last) continue;
        const turn = positive(first * (endAngle - from.angle));
        turns = [turn < 1e-8 ? TAU : turn, 0]; straight = 0;
      } else {
        const tangent = Math.atan2(dy, dx) - Math.asin(offset / d);
        turns = [positive(first * (tangent - from.angle)), positive(last * (endAngle - tangent))];
        straight = Math.sqrt(Math.max(0, d * d - offset * offset));
      }
      const length = radius * (turns[0] + turns[1]) + straight;
      // A pass must carry on flying rather than repeatedly nicking a nearby
      // target with tiny turns. No stationary or reversing attack paths.
      if (length < radius * 1.5 || (best && length >= best.length)) continue;
      const points: FlightPoint[] = [{ x:from.x, y:from.y, angle:from.angle, distance:0 }];
      let p = points[0], valid = true;
      const append = (distance: number, turn: number) => {
        if (distance<=1e-10) return;
        const count = Math.max(1, Math.ceil(distance / WISP.spacing)), step = distance / count;
        for (let i = 0; i < count && valid; i++) {
          const angle = p.angle + turn * step / radius;
          const x = p.x + (turn ? radius / turn * (Math.sin(angle) - Math.sin(p.angle)) : Math.cos(angle) * step);
          const y = p.y + (turn ? radius / turn * (Math.cos(p.angle) - Math.cos(angle)) : Math.sin(angle) * step);
          if (Math.hypot(x - home.x, y - home.y) > limit + 1e-8) { valid = false; break; }
          p = { x, y, angle, distance: p.distance + step }; points.push(p);
        }
      };
      append(turns[0] * radius, first); append(straight, 0); append(turns[1] * radius, last);
      if (valid) best = { points, length: p.distance, distance: 0, index: 0 };
    }
  }
  return best;
}

/** Interpolate by travelled distance, so arc speed and swept collision agree. */
export function flightPosition(flight: WispFlight, distance: number): FlightPoint {
  distance = Math.max(0, Math.min(flight.length, distance));
  let i = flight.index;
  while (i > 0 && flight.points[i].distance > distance) i--;
  while (i < flight.points.length - 2 && flight.points[i + 1].distance < distance) i++;
  flight.index = i;
  const a = flight.points[i], b = flight.points[i + 1], t = (distance - a.distance) / (b.distance - a.distance || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
    angle: a.angle + (b.angle - a.angle) * t, distance };
}
