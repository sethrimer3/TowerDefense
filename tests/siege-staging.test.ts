import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSim, SIEGE_SECONDS, infantryCopies } from '../src/campaign/sim.ts';
import { siegeField } from '../src/campaign/battlefield.ts';
import { generateCastle } from '../src/campaign/castles.ts';
import { defaults } from '../src/save.ts';
import { fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { CELLS_H, CELLS_W, cellIndex } from '../src/defend/grid.ts';
import { deployment } from '../src/defend/deployment.ts';
import { soldierCap, trainSeconds } from '../src/defend/catalog.ts';
import { TRAINS } from '../src/defend/deployment.ts';

function battle() {
  const game = defaults();
  game.defend.owned.meleeGuild = 3;
  game.defend.owned.rangedGuild = 2;
  const castle = generateCastle(45, 100);
  return { game, castle, sim: new CampaignSim('siege', 0, [], game.defend.owned, game.defend.levels, castle, game) };
}

test('Staging homes preserve the native castle and leave every entry cell open', () => {
  const { game, castle } = battle(), fit = fitLayout(castle.castle.layout);
  assert.ok(fit.ok);
  const city = generateCity(fit, castle.seed),
    field = siegeField(castle, infantryCopies(game.defend));
  assert.deepEqual(field.map.buildings.slice(0, city.buildings.length), city.buildings);
  for (const key of ['owner', 'city', 'structures'] as const) assert.deepEqual(field.map[key], city[key]);
  assert.deepEqual(field.map.type.slice(0, CELLS_W * (CELLS_H - 1)), city.type.slice(0, CELLS_W * (CELLS_H - 1)));
  assert.equal(field.attackerIds.size, 5);
  for (const id of field.attackerIds) {
    const home = field.map.buildings[id];
    assert.equal(home.hidden, true);
    assert.equal(home.rect.y, CELLS_H);
    assert.deepEqual(home.cells, []);
    assert.ok(!field.defenderIds.has(id));
  }
  const many = siegeField(castle, Array.from({ length: 300 }, (_, i) => ({ uid: 100000 + i, kind: 'barracks' as const })));
  assert.equal(many.attackerIds.size, 300, 'Crowded armies retain every copy without occupying the approach');
});

test('Native troops enter from the bottom edge, have no leash, and retrain at their own hidden home', () => {
  const { sim } = battle();
  assert.ok(sim.start());
  sim.step(1 / 30);
  assert.equal(new Set(sim.allies.map(s => s.home)).size, 5);
  for (const unit of sim.allies) {
    assert.ok(unit.y >= CELLS_H - 1 && unit.y < CELLS_H);
    assert.equal(deployment(sim.engine, unit), null);
    assert.ok(!sim.engine.ownSolid[cellIndex(Math.floor(unit.x), CELLS_H - 1)]);
  }
  for (let x = 0; x < CELLS_W; x++) assert.equal(sim.engine.solid[cellIndex(x, CELLS_H - 1)], 0);
  const first = sim.allies[0], home = first.home, firstY = first.y;
  for (let n = 0; n < 90; n++) sim.step(1 / 30);
  assert.ok(first.y < firstY - 1, 'Troops march from the edge toward the castle');
  sim.engine.hurtDefender(first, first.maxHp * 100);
  for (let n = 0; n < (trainSeconds(sim.engine.levels.barracksTraining) + 1) * 30; n++) sim.step(1 / 30);
  const replacements = sim.allies.filter(s => s.home === home);
  assert.ok(replacements.length > 0);
  assert.ok(replacements.every(s => s.id !== first.id && s.kind === first.kind && s.maxHp === first.maxHp));
  assert.ok(replacements.length <= soldierCap(sim.engine.levels.barracksCapacity));
  assert.ok(sim.raid.defense.enemies.every(e => !e.raidBuilding), 'The defense can target troops, never staging homes');
});

test('The shared Siege timer expires at exactly two minutes and victory wins a final-tick tie', () => {
  assert.equal(SIEGE_SECONDS, 120);
  for (const win of [false, true]) {
    const { sim } = battle();
    sim.raid.step = () => {}; // Isolate the lifecycle from native combat outcomes.
    sim.start();
    for (let n = 0; n < SIEGE_SECONDS * 30 - 1; n++) sim.step(1 / 30);
    assert.equal(sim.phase, 'battle');
    assert.ok(sim.elapsed < SIEGE_SECONDS);
    if (win) sim.raid.defense.hp[sim.raid.field.defenderKeep] = 0;
    sim.step(1 / 30);
    assert.equal(sim.elapsed, SIEGE_SECONDS);
    assert.equal(sim.phase, win ? 'won' : 'lost');
    sim.step(1);
    assert.equal(sim.elapsed, SIEGE_SECONDS);
  }
});

test('Every infantry family recruits from a hidden home with its native troop kind', () => {
  const game = defaults();
  for (const kind of Object.keys(TRAINS)) game.defend.owned[kind as keyof typeof game.defend.owned] = 1;
  const sim = new CampaignSim('siege', 0, [], game.defend.owned, game.defend.levels, generateCastle(45, 100), game);
  sim.start();
  sim.step(1 / 30);
  for (const id of sim.raid.field.attackerIds) {
    const home = sim.map.buildings[id], unit = sim.allies.find(s => s.home === id);
    assert.ok(unit, `${home.kind} must train from the edge`);
    assert.equal(unit.kind, TRAINS[home.kind]);
    assert.ok(unit.y >= CELLS_H - 1 && unit.y < CELLS_H);
  }
});
