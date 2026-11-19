import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile, placeStructure } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Levels } from "../src/defend/sim.ts";
import { UPGRADES } from "../src/defend/catalog.ts";

// The side panel's kill counts tally blows through `DefendSim.tally`; turning
// the tally on must leave the battle itself exactly as it was.
function battle(tally: boolean) {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) l = placeCityTile(l, tx + dx, ty + dy)!;
  for (const [kind, dx, dy] of [["barracks", 1, 1], ["archerTower", -1, -1], ["wizardTower", 1, -1], ["cannonTower", -1, 1]] as const) l = placeStructure(l, kind as never, tx + dx, ty + dy)!;
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  const levels = Object.fromEntries(UPGRADES.map((u) => [u.id, Math.min(3, u.maxLevel)])) as Levels;
  const sim = new DefendSim(generateCity(fit, 7), levels, 11);
  const kills = new Map<number, number>();
  if (tally) {
    sim.tally = (id, _damage, killed) => { if (killed) kills.set(id, (kills.get(id) ?? 0) + 1); };
    sim.tallyHomes = new Map();
  }
  sim.startAt(8);
  for (let f = 0; f < 4 * 90 && !sim.lost; f++) sim.update(0.25);
  const view = {
    time: sim.time, wave: sim.wave, lost: sim.lost, hp: [...sim.hp],
    enemies: sim.enemies.map((e) => [e.id, e.kind, e.x, e.y, e.hp]),
    soldiers: sim.soldiers.map((s) => [s.id, s.kind, s.x, s.y, s.hp]),
    slain: { ...sim.slain },
  };
  return { view, kills };
}

test("tallying kills leaves a Defend battle unchanged and credits buildings", () => {
  const plain = battle(false), tallied = battle(true);
  assert.deepEqual(tallied.view, plain.view);
  const credited = [...tallied.kills.values()].reduce((a, b) => a + b, 0);
  const slain = Object.values(plain.view.slain).reduce((a, b) => a + b, 0);
  assert.ok(credited > 0, "some kills credited");
  assert.ok(credited <= slain, `credited ${credited} of ${slain} slain`);
});
