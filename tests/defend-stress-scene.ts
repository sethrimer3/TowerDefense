/** Deterministic combat fixture, shared by the browser benchmark and Node tests.
 * Extra HP keeps the battle busy without bypassing attacks, AI or effects. */
import { DefendSim } from "../src/defend/sim.ts";
import { defaultLayout, placeCityTile, placeStructure, fitLayout } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { UPGRADES, type EnemyKind } from "../src/defend/catalog.ts";
import { CELLS_W } from "../src/defend/grid.ts";

export function stressScene(count = 2500) {
  let layout = defaultLayout();
  layout.compact = ["darkKeep", "valkyriePalace"];
  for (let y = 5; y <= 11; y++) for (let x = 1; x <= 7; x++)
    layout = placeCityTile(layout, x, y) ?? layout;
  const kinds = ["barracks", "archerBarracks", "mageGuild", "valkyriePalace", "darkKeep"] as const;
  for (let y = 5; y <= 11; y++) for (let x = 1; x <= 7; x++) {
    if (x === layout.keep.tx && y === layout.keep.ty) continue;
    const kind = kinds[(x + y) % kinds.length];
    layout = placeStructure(layout, kind, x, y) ?? layout;
    for (const tower of ["archerTower", "cannonTower", "wizardTower"] as const)
      layout = placeStructure(layout, tower, x, y) ?? layout;
  }
  const fit = fitLayout(layout);
  if (!fit.ok) throw new Error(fit.reason);
  const map = generateCity(fit, 5);
  const sim = new DefendSim(map, Object.fromEntries(UPGRADES.map(u => [u.id, u.maxLevel])) as DefendSim["levels"], 42);
  sim.wave = 5;
  sim.hp.fill(1e9); sim.maxHp.fill(1e9);
  // Fill real garrisons via the normal training mechanism before enemies arrive.
  for (let i = 0; i < 900; i++) sim.update(1 / 30);
  const cells = [...map.city.keys()].filter(i => map.city[i] && !sim.solid[i]);
  const mix: EnemyKind[] = ["roach", "roach", "orc", "ogre", "bat", "shieldBearer", "darkKnight", "rollingCannon", "fireworkLauncher"];
  sim.enemies.length = 0;
  for (let i = 0; i < count; i++) {
    sim.spawnEnemy(mix[i % mix.length]);
    const e = sim.enemies.at(-1)!;
    const cell = cells[(i * 37) % cells.length];
    e.x = cell % CELLS_W + .5 + e.jx; e.y = Math.floor(cell / CELLS_W) + .5 + e.jy;
    e.hp = e.maxHp = 1e6;
  }
  // Boats enter outside the city, so water coexists with working towers.
  for (let i = 0; i < 4; i++) {
    sim.spawnEnemy("boatLesser");
    const e = sim.enemies.at(-1)!; e.x = 5 + i * 15; e.y = 21;
    e.hp = e.maxHp = 1e6;
  }
  for (const s of sim.soldiers) s.hp = s.maxHp = 1e6;
  // Advance through fire into the ice phase before measuring.
  for (let i = 0; i < 120; i++) sim.update(1 / 30);
  return { map, sim, layout };
}
