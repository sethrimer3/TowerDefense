/** Miners' names: a given name and a family name, picked by a fixed hash of
 * the mine's seed and the hire, so a miner keeps its name for life (it is
 * saved with it) and no two of the crew share one. */
import { hash01 } from "./world.ts";

const GIVEN = [
  "Abel", "Ada", "Agnes", "Alma", "Amos", "Bess", "Bram", "Cora", "Cuthbert", "Dora", "Edda", "Edgar", "Elsie", "Enid", "Ezra", "Fen", "Gareth", "Greta",
  "Hal", "Hilda", "Ida", "Ivo", "Jory", "Kit", "Leof", "Lottie", "Mabel", "Milo", "Ned", "Nell", "Odo", "Olwen", "Osric", "Peg", "Piers", "Rhys",
  "Rowan", "Ruth", "Sam", "Silas", "Tam", "Tegan", "Tobias", "Ulric", "Vera", "Wat", "Wenna", "Wynn",
];
const FAMILY = [
  "Ashdown", "Barrow", "Blackwood", "Brindle", "Coalby", "Copper", "Crook", "Delve", "Dunmore", "Fairweather", "Flint", "Gorse", "Hale", "Hearth",
  "Hollins", "Ironside", "Kettle", "Lantern", "Marrow", "Moss", "Nailer", "Oakes", "Pickering", "Quarry", "Redhill", "Rook", "Shale", "Slate",
  "Stonebridge", "Thorne", "Tinsley", "Vane", "Wick", "Yarrow",
];

/** A name for hire number `n` of the mine seeded `seed`, unlike any in
 * `taken`. */
export function minerName(n: number, seed: number, taken: Iterable<string> = []) {
  const used = new Set(taken);
  for (let k = 0; ; k++) {
    const given = GIVEN[Math.floor(hash01(n, k, seed + 901) * GIVEN.length)];
    const family = FAMILY[Math.floor(hash01(n, k, seed + 902) * FAMILY.length)];
    const name = `${given} ${family}`;
    if (!used.has(name) || k > 64) return name;
  }
}
