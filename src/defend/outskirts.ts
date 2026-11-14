/** What a city's scenery is planned from, beyond its buildings: which cells
 * are open ground, wall, wooden fence, water, gate or keep, its bridges and
 * its trails' seed. Placing or moving a building inside the city leaves all
 * of it as it was, so the forest, its boulders and the monster trails
 * (`forest.ts`, `trails.ts`) are planned once per outskirts rather than once
 * per map: the city regenerated after each edit shares them, and the art
 * kept from them (the forest floor, its grass, the trails' distance maps)
 * carries on instead of being made again. */
import { CELL_COUNT } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";

const tokens = new WeakMap<CityMap, object>();
/** The outskirts recently seen, by key, oldest first. */
const recent = new Map<string, object>();
const KEEP = 16;

/** A token standing for `map`'s outskirts: the same object for every map
 * whose outskirts are the same. Read once per map, when first asked. */
export function outskirts(map: CityMap): object {
  let token = tokens.get(map);
  if (token) return token;
  const key = outskirtsKey(map);
  token = recent.get(key);
  if (token) recent.delete(key);
  else token = {};
  recent.set(key, token);
  if (recent.size > KEEP) recent.delete(recent.keys().next().value!);
  tokens.set(map, token);
  return token;
}

/** One letter a cell for what the plans read of it, then the bridges and
 * the trails' seed. */
export function outskirtsKey(map: CityMap): string {
  const codes = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    const t = map.type[i];
    codes[i] = t === CellType.OUT ? 111 : t === CellType.WATER ? 114 : t === CellType.WALL ? (map.buildings[map.owner[i]]?.fence ? 102 : 119) : 46;
  }
  for (const b of map.buildings) if (b.kind === "keep" || b.kind === "gate") for (const c of b.cells) codes[c] = b.kind === "keep" ? 107 : 103;
  let key = "";
  for (let i = 0; i < CELL_COUNT; i += 4096) key += String.fromCharCode(...codes.subarray(i, i + 4096));
  if (map.bridges) key += "|" + Array.from(map.bridges).join("");
  return key + "|" + (map.trails ? map.trails.seed : "-");
}
