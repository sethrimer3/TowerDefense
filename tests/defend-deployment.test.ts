// Deployment (src/defend/deployment.ts): troops stay within their building's
// deployment range (stronger troops further, the Smithy's Deployment range
// further still), answer the banner or a rally flag only inside it, and go
// to their building's rally point when they have nothing to fight; a rally
// point dragged near a watch tower snaps onto it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { bonuses } from "../src/progression.ts";
import { NO_BONUSES, UPGRADES } from "../src/defend/catalog.ts";
import { defaultLayout, fitLayout, placeCityTile, placeStructure, type Layout, type PlacedKind } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Soldier } from "../src/defend/sim.ts";
import { center } from "../src/defend/pathing.ts";
import { DEPLOY_RANGE, deployCircle, deployRangeOf, deployment, rallyAim, TOWER_SNAP } from "../src/defend/deployment.ts";

const zeroLevels = () => Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as DefendSim["levels"];

/** A long city: the keep's tile and a column of tiles running south of it,
 * with `kinds` placed at tile offsets from the keep. */
function city(kinds: [PlacedKind, number, number][]) {
  let l: Layout = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1]]) l = placeCityTile(l, tx + dx, ty + dy) ?? l;
  for (let y = ty + 2; y <= 12; y++) l = placeCityTile(l, tx, y) ?? l;
  for (const [kind, dx, dy] of kinds) l = placeStructure(l, kind, tx + dx, ty + dy) ?? assert.fail(`placing ${kind}`);
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return generateCity(fit, 3);
}
const quiet = (sim: DefendSim) => {
  sim.spawnQueue = [];
  sim.breakT = 1e9;
};
const run = (sim: DefendSim, seconds: number, each?: () => void) => {
  for (let i = 0; i < seconds * 30; i++) {
    sim.step(1 / 30);
    each?.();
  }
};
const away = (s: Soldier, p: { x: number; y: number }) => Math.hypot(s.x - p.x, s.y - p.y);

test("stronger troops deploy further, and the Smithy's Deployment range takes them all further", () => {
  assert.ok(DEPLOY_RANGE.brawler! < DEPLOY_RANGE.sword! && DEPLOY_RANGE.sword! < DEPLOY_RANGE.lancer! && DEPLOY_RANGE.lancer! < DEPLOY_RANGE.hero!);
  assert.ok(DEPLOY_RANGE.slinger! < DEPLOY_RANGE.musketeer! && DEPLOY_RANGE.musketeer! < DEPLOY_RANGE.railSniper!);
  assert.equal(deployRangeOf("meleeGuild", NO_BONUSES), DEPLOY_RANGE.brawler);
  assert.equal(deployRangeOf("archerTower", NO_BONUSES), 0, "a tower deploys nobody");
  const s = defaults();
  s.training.deployRange = 10;
  assert.equal(deployRangeOf("barracks", bonuses(s)), DEPLOY_RANGE.sword! * 1.5);
});

test("archers strolling the streets and swordsmen fighting never leave their deployment range", () => {
  const map = city([["archerBarracks", -1, -1], ["barracks", 1, -1]]);
  const sim = new DefendSim(map, zeroLevels(), 1);
  quiet(sim);
  let worst = 0;
  run(sim, 60, () => {
    for (const s of sim.soldiers) {
      const d = deployment(sim, s)!;
      worst = Math.max(worst, away(s, d) - d.r);
    }
  });
  assert.ok(sim.soldiers.some((s) => s.kind === "archer") && sim.soldiers.some((s) => s.kind === "sword"));
  assert.ok(worst <= 0.1, `out by ${worst.toFixed(2)} cells`);
  // An enemy far down the city, past the swordsmen's range, isn't chased.
  const far = sim.streets.reduce((a, b) => (b > a ? b : a));
  const at = { x: (far % 72) + 0.5, y: Math.floor(far / 72) + 0.5 };
  sim.enemies.push({ ...(sim as any).newEnemy("ogre", at.x, at.y), hp: 1e9, maxHp: 1e9, speed: 0 });
  const sword = sim.soldiers.find((s) => s.kind === "sword")!;
  assert.ok(away(sword, at) > deployment(sim, sword)!.r + 4, "the enemy is well out of range");
  run(sim, 5);
  assert.ok(!sim.soldiers.some((s) => s.kind === "sword" && s.target === sim.enemies[0]?.id), "no swordsman goes after it");
});

test("troops go to their building's rally point, and back to their own ways when it's cleared", () => {
  const map = city([["barracks", 1, -1]]);
  const sim = new DefendSim(map, zeroLevels(), 1);
  quiet(sim);
  run(sim, 12);
  const hall = map.buildings.find((b) => b.kind === "barracks")!, circle = deployCircle(hall, sim.bonuses)!;
  // Dragged far south, the flag stops at the range's edge.
  const flag = rallyAim(hall, { x: circle.x, y: circle.y + 40 }, circle)!;
  assert.ok(Math.abs(Math.hypot(flag.x - circle.x, flag.y - circle.y) - circle.r) < 1e-9, "pulled in to the range");
  // Dragged back onto the building, it clears.
  assert.equal(rallyAim(hall, center(hall.rect), circle), undefined);
  const post = { x: circle.x, y: circle.y + 10 };
  sim.setRally(hall.id, post);
  run(sim, 15);
  const troops = sim.soldiers.filter((s) => s.home === hall.id);
  assert.ok(troops.length > 1);
  assert.ok(troops.every((s) => away(s, post) < 4), `gathered at the rally point: ${troops.map((s) => away(s, post).toFixed(1))}`);
  sim.setRally(hall.id, null);
  run(sim, 15);
  assert.ok(troops.every((s) => away(s, post) > 4), "home again");
});

test("a rally flag out of a troop's range doesn't draw it; inside, it does", () => {
  const map = city([["barracks", 1, -1]]);
  const sim = new DefendSim(map, zeroLevels(), 1);
  quiet(sim);
  run(sim, 12);
  const hall = map.buildings.find((b) => b.kind === "barracks")!, c = center(hall.rect);
  const troops = sim.soldiers.filter((s) => s.home === hall.id);
  const far = { x: c.x, y: c.y + DEPLOY_RANGE.sword! + 12 };
  sim.plantFlag(far);
  run(sim, 15);
  assert.ok(troops.every((s) => away(s, c) < DEPLOY_RANGE.sword! + 0.1), "they stay in range");
  assert.ok(troops.every((s) => away(s, far) > 10), "and don't answer it");
  const near = { x: c.x, y: c.y + 8 };
  sim.plantFlag(near);
  run(sim, 15);
  assert.ok(troops.every((s) => away(s, near) < 3.5), "inside, they rally to it");
});

test("a rally point dragged near a watch tower in range snaps onto it, only for the gunner line", () => {
  const map = city([["gunHall", 0, -1], ["watchTower", 1, 0]]);
  const hall = map.buildings.find((b) => b.kind === "gunHall")!, tower = map.buildings.find((b) => b.kind === "watchTower")!;
  const circle = deployCircle(hall, NO_BONUSES)!, t = center(tower.rect);
  const near = { x: t.x + TOWER_SNAP * 0.6, y: t.y };
  assert.deepEqual(rallyAim(hall, near, circle, [tower]), { ...t, tower: tower.id });
  assert.equal(rallyAim(hall, near, circle, []).tower, undefined, "no towers offered: no snap");
  assert.equal(rallyAim(hall, { x: t.x + TOWER_SNAP + 1, y: t.y }, circle, [tower])!.tower, undefined, "too far to snap");
  // A tower outside the range is never snapped to.
  assert.equal(rallyAim(hall, near, { ...circle, r: 1 }, [tower])!.tower, undefined);
});
