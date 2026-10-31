import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_BONUSES, STRUCTURES, UPGRADES, type Bonuses } from '../src/defend/catalog.ts';
import { sideCells } from '../src/defend/grid.ts';
import { generateCity, type Building } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout, placeCityTile, placeStructure } from '../src/defend/layout.ts';
import { DefendSim, type Levels } from '../src/defend/sim.ts';
import { Builders, atHome, canRepair } from '../src/defend/civilians.ts';
import { cellCenter, rectDist } from '../src/defend/pathing.ts';
import { REPAIR, REPAIR_PATHS, decodeRepairRanks, repairCrew, respecRepair, undoRepair, upgradeRepair } from '../src/repair-upgrades.ts';
import { defaults, decode } from '../src/save.ts';
import { bonuses } from '../src/progression.ts';
import { buildingSheet, graftedGraph, treeCardHtml, REPAIR_UI } from '../src/ui/specialty.ts';
import { buyTile, shopOffer, tileMarks } from '../src/tiles.ts';

function scene(extra: Partial<Bonuses> = {}, shopCount = 1) {
  let layout = defaultLayout(); const { tx, ty } = layout.keep;
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y) layout = placeCityTile(layout, tx + x, ty + y)!;
  layout = placeStructure(layout, 'archerTower', tx - 1, ty)!;
  layout = placeStructure(layout, 'barracks', tx - 1, ty - 1)!;
  if (shopCount) layout = placeStructure(layout, 'repairShop', tx + 1, ty)!;
  if (shopCount > 1) layout = placeStructure(layout, 'repairShop', tx + 1, ty + 1)!;
  assert.ok(fitLayout(layout).ok);
  const sim = new DefendSim(generateCity(fitLayout(layout), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Levels, 4, { ...NO_BONUSES, ...extra });
  sim.breakT = 1e9;
  const builders = new Builders(sim.levels);
  const of = (kind: Building['kind']) => sim.map.buildings.find(b => b.kind === kind)!;
  return { sim, builders, of, shops: sim.map.buildings.filter(b => b.kind === 'repairShop'), houses: sim.map.buildings.filter(b => b.kind === 'house') };
}
function tick(s: ReturnType<typeof scene>, dt = .1) { s.builders.step(s.sim, dt); s.sim.civilians = s.sim.civilians.filter(c => c.hp > 0 && !atHome(s.sim, c)); }
function ruins(s: ReturnType<typeof scene>, count = 8) { for (const b of s.houses.slice(0, count)) s.sim.damageBuilding(b.id, 1e9); }
function placeAtWork(s: ReturnType<typeof scene>, c = s.sim.civilians[0]) { Object.assign(c, cellCenter(c.stand ?? c.job)); c.path = []; c.state = 'working'; return c; }

test('Repair shop is a purchasable 2 by 1 quarter-grid building; a city without it never recruits repair workers', () => {
  assert.equal(STRUCTURES.repairShop.w, 4); assert.equal(STRUCTURES.repairShop.h, 2);
  const save = defaults(); save.settings.devMode = true;
  assert.ok(!('reason' in shopOffer(save, 'repairShop'))); assert.ok(buyTile(save, 'repairShop'));
  const s = scene({}, 0); ruins(s);
  for (let i = 0; i < 100; i++) tick(s);
  assert.equal(s.sim.civilians.length, 0); assert.equal(s.sim.hp[s.houses[0].id], 0);
});

test('two workers per intact shop emerge from its door; crew skills raise that to three and four per shop', () => {
  for (const crew of [0, 1, 2]) {
    const s = scene({ repair: { crew } }, 2); ruins(s, 12); tick(s);
    assert.equal(s.sim.civilians.length, (2 + crew) * 2);
    for (const c of s.sim.civilians) { assert.equal(c.home, c.shop); assert.ok(rectDist(s.sim.map.buildings[c.shop!].rect, c.x, c.y) < 1.2); }
  }
});

test('Carpentry is innate, Advanced carpentry unlocks damaged and destroyed combat buildings, Masonry unlocks walls and gates', () => {
  const s = scene();
  for (const b of s.sim.map.buildings) s.sim.hp[b.id] /= 2;
  assert.ok(canRepair(s.sim, s.houses[0])); assert.ok(canRepair(s.sim, s.shops[0]));
  assert.equal(canRepair(s.sim, s.of('archerTower')), false); assert.equal(canRepair(s.sim, s.of('barracks')), false); assert.equal(canRepair(s.sim, s.of('wall')), false);
  s.sim.bonuses.repair = { advancedCarpentry: 1, masonry: 1 };
  for (const kind of ['archerTower', 'barracks', 'wall'] as const) { assert.ok(canRepair(s.sim, s.of(kind))); s.sim.damageBuilding(s.of(kind).id, 1e9); assert.ok(canRepair(s.sim, s.of(kind))); }
});

test('repairs restore the same HP percentage at different maximum HP and Smithy speeds apply', () => {
  for (const hp of [1, 4]) {
    const s = scene({ repair: { advancedCarpentry: 1 }, towerHp: hp }); const b = s.of('archerTower');
    s.sim.hp[b.id] = s.sim.maxHp[b.id] / 2; tick(s, 0); placeAtWork(s); tick(s, 3);
    assert.ok(Math.abs(s.sim.hp[b.id] / s.sim.maxHp[b.id] - .6) < 1e-9);
  }
  const s = scene({ repair: { advancedCarpentry: 1 }, rebuild: .5 }); const b = s.of('barracks');
  s.sim.hp[b.id] /= 2; tick(s, 0); placeAtWork(s); tick(s, 3);
  assert.ok(Math.abs(s.sim.hp[b.id] / s.sim.maxHp[b.id] - .7) < 1e-9);
});

test('destroyed buildings return cell by cell and become functional after thirty seconds of work regardless of footprint', () => {
  for (const kind of ['archerTower', 'barracks'] as const) {
    const s = scene({ repair: { advancedCarpentry: 1 } }); const b = s.of(kind); s.sim.damageBuilding(b.id, 1e9); tick(s, 0);
    const c = placeAtWork(s); tick(s, 15); assert.ok(s.sim.built[b.id] > 0 && s.sim.built[b.id] < b.cells.length);
    Object.assign(c, cellCenter(c.stand!)); tick(s, 15); assert.ok(s.sim.intact(b)); assert.equal(s.sim.hp[b.id], s.sim.maxHp[b.id]);
  }
});

test('critical repair skill prioritizes a distant breach over a nearby ruined house and reserves different buildings', () => {
  const s = scene({ repair: { masonry: 1, triage: 1 } });
  const from = cellCenter(s.sim.doorOf(s.shops[0]));
  const house = [...s.houses].sort((a,b) => rectDist(a.rect,from.x,from.y)-rectDist(b.rect,from.x,from.y))[0];
  const wall = s.sim.map.buildings.filter(b => b.kind === 'wall' && sideCells(b.rect).some(cell => s.sim.map.city[cell] && !s.sim.ownSolid[cell]))
    .sort((a,b) => rectDist(b.rect,from.x,from.y)-rectDist(a.rect,from.x,from.y))[0];
  assert.ok(rectDist(wall.rect,from.x,from.y) > rectDist(house.rect,from.x,from.y));
  s.sim.damageBuilding(house.id, 1e9); s.sim.damageBuilding(wall.id, 1e9); tick(s, 0);
  assert.equal(s.sim.map.owner[s.sim.civilians[0].job], wall.id);
  assert.equal(s.sim.map.owner[s.sim.civilians[1].job], house.id);
  const plain = scene({ repair: { masonry: 1 } });
  plain.sim.damageBuilding(house.id, 1e9); plain.sim.damageBuilding(wall.id, 1e9); tick(plain, 0);
  assert.equal(plain.sim.map.owner[plain.sim.civilians[0].job], house.id, 'untrained workers choose the nearer house');
});

test('workers shoot weak arrows while retreating; Smithy HP/damage apply, and the bow requires its skill', () => {
  for (const bow of [0, 1]) {
    const s = scene({ repair: { retreatBow: bow }, repairHp: 2, repairDamage: 3 }); ruins(s); tick(s, 0);
    const c = placeAtWork(s); assert.equal(c.hp, 2 * 8);
    const enemy = s.sim.spawnAuxiliary('orc', c.x + 1, c.y)!; (s.sim as any).indexEnemies();
    s.sim.civilians = [c]; const before = { x: c.x, y: c.y }; tick(s, .1);
    assert.ok(Math.hypot(c.x - enemy.x, c.y - enemy.y) > Math.hypot(before.x - enemy.x, before.y - enemy.y), "retreat increases distance from the threat"); assert.equal(s.sim.arrows.length, bow ? 1 : 0);
    if (bow) assert.equal(s.sim.arrows[0].damage, 6);
  }
});

test('fallen shops stop recruitment, surviving workers can rebuild the shop, and dead slots wait before replacement', () => {
  const s = scene(); ruins(s); tick(s, 0); const c = s.sim.civilians[0];
  c.hp = 0; tick(s); assert.equal(s.sim.civilians.length, 1);
  tick(s, 5); assert.equal(s.sim.civilians.length, 1);
  tick(s, 6); assert.equal(s.sim.civilians.length, 2);
  s.sim.damageBuilding(s.shops[0].id, 1e9); s.sim.civilians = []; tick(s, 20); assert.equal(s.sim.civilians.length, 0);
  assert.ok(canRepair(s.sim, s.shops[0]));
});

test('repair tree has free innate Carpentry, independent paid branches, refunds, bounded decoding and saved battle snapshots', () => {
  const save = defaults(); save.knowledge = 1e9;
  const graph = graftedGraph(save, 'repairShop'); assert.equal(graph.find(n => n.id === 'repair:carpentry')?.state, 'owned');
  assert.match(treeCardHtml(save, 'repairShop', undefined, 'repair:carpentry'), /Initial skill/);
  for (const p of REPAIR_PATHS) assert.ok(upgradeRepair(save, p.id).ok);
  assert.ok(upgradeRepair(save, 'crew').ok); assert.equal(repairCrew(save.defend.repairRanks), 4);
  const clone = decode(JSON.stringify(save)); assert.deepEqual(clone.defend.repairRanks, save.defend.repairRanks);
  const snapshot = bonuses(save); assert.deepEqual(snapshot.repair, save.defend.repairRanks); assert.notEqual(snapshot.repair, save.defend.repairRanks);
  assert.ok(REPAIR_UI.allocated(save) > 0); assert.ok(buildingSheet(save, 'repairShop').abilities.some(a => /initial/.test(a.text)));
  assert.ok(undoRepair(save, 'crew', 2).ok); assert.equal(repairCrew(save.defend.repairRanks), 3);
  assert.ok(respecRepair(save).ok); assert.equal(save.knowledge, 1e9); assert.equal(save.defend.repairRanks, undefined);
  assert.equal(decodeRepairRanks({ crew: 3, masonry: -1 }), undefined);
  save.training.rebuild = 5; save.training.repairHp = 4; save.training.repairDamage = 3; save.training.buildingHp = 2; save.training.towerHp = 1;
  const b = bonuses(save); assert.ok(b.rebuild < 1); assert.equal(b.repairHp, 1.2); assert.equal(b.repairDamage, 1.15); assert.equal(b.buildingHp, 1.1); assert.equal(b.towerHp, 1.05);
});


test('surviving carpenters rebuild their fallen shop and normal recruitment resumes', () => {
  const s = scene(); ruins(s, 1); tick(s, 0);
  const c = s.sim.civilians[0];
  s.sim.rebuildCell(s.houses[0].cells[0]);
  for (const b of s.houses) for (const cell of b.cells) s.sim.rebuildCell(cell);
  s.sim.damageBuilding(s.shops[0].id, 1e9); s.sim.civilians = [c]; c.job = -1;
  tick(s, 0); assert.equal(s.sim.map.owner[c.job], s.shops[0].id);
  placeAtWork(s, c); tick(s, REPAIR.seconds);
  assert.ok(s.sim.intact(s.shops[0]));
});


test('Mirror Knights reflect a repair worker arrow onto its shooter and preserve the shop HP', () => {
  const s = scene({ repair: { retreatBow: 1 } }); ruins(s); tick(s, 0);
  const c = placeAtWork(s); s.sim.civilians = [c];
  const enemy = s.sim.spawnAuxiliary('mirrorKnight', c.x + 1, c.y)!; (s.sim as any).indexEnemies();
  tick(s, .1); const arrow = s.sim.arrows[0]; assert.ok(arrow);
  const hp = c.hp, shopHp = s.sim.hp[s.shops[0].id];
  s.sim.hurtEnemy(enemy, arrow.damage, true, 'ranged', arrow.origin, true);
  assert.ok(Math.abs(c.hp - (hp - arrow.damage * .4)) < 1e-9);
  assert.equal(s.sim.hp[s.shops[0].id], shopHp);
});
