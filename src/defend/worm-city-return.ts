/** Worm surface steering toward the actual city footprint, independent of
 * keep position and flow fields. City geometry is fixed during a Defend run. */
import { CELLS_H, CELLS_W, SUB, type Rect } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import type { Point } from "./pathing.ts";
import { WORM_CITY_RETURN } from "./blight-worm-tuning.ts";

const cities = new WeakMap<CityMap, { mask: Uint8Array; spans: Rect[] }>();
function citySpans(map: CityMap) {
  let city = cities.get(map);
  if (city?.mask === map.city) return city.spans;
  const spans: Rect[] = [];
  for (let y = 0; y < CELLS_H; y++) {
    let x = 0;
    while (x < CELLS_W) {
      if (!map.city[y * CELLS_W + x]) { x++; continue; }
      const start = x;
      while (x < CELLS_W && map.city[y * CELLS_W + x]) x++;
      spans.push({ x: start, y, w: x - start, h: 1 });
    }
  }
  cities.set(map, (city = { mask: map.city, spans }));
  return city.spans;
}

export function wormReturnChance(distance: number) {
  const start = WORM_CITY_RETURN.startTiles * SUB, end = WORM_CITY_RETURN.fullTiles * SUB;
  if (distance <= start) return 0;
  if (distance >= end) return WORM_CITY_RETURN.maxChance;
  return (distance - start) / (end - start) * WORM_CITY_RETURN.maxChance;
}

/** Nearest point on city land, including its boundary. Row spans preserve
 * concave layouts and holes without a full-board scan on every head turn. */
export function wormCityReturn(map: CityMap, from: Point) {
  let dx = 0, dy = 0, best = Infinity;
  for (const r of citySpans(map)) {
    const x = from.x < r.x ? r.x : from.x > r.x + r.w ? r.x + r.w : from.x;
    const y = from.y < r.y ? r.y : from.y > r.y + r.h ? r.y + r.h : from.y;
    const ox = x - from.x, oy = y - from.y, squared = ox * ox + oy * oy;
    if (squared < best) { dx = ox; dy = oy; best = squared; }
    if (best === 0) break;
  }
  if (best === Infinity) return undefined;
  const distance = Math.sqrt(best);
  return { dx: distance > 0 ? dx / distance : 0, dy: distance > 0 ? dy / distance : 0,
    distance, chance: wormReturnChance(distance) };
}
