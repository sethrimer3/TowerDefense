import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS_W, CELL_COUNT, ORTHO, SUB, cellIndex, cellX, cellY, tileKey } from '../src/defend/grid.ts';
import {
  defaultLayout,
  fitLayout,
  moveKeep,
  moveStructure,
  placeCityTile,
  placeStructure,
  removeCityTile,
  type Layout,
} from '../src/defend/layout.ts';
import { CellType, generateCity } from '../src/defend/citygen.ts';
import { buildDifficultyWave, waveDifficulty, MAX_WAVE_ENEMIES } from '../src/defend/waves.ts';
import { ENEMIES } from '../src/defend/catalog.ts';
import { DefendSim, buildWave } from '../src/defend/sim.ts';
import { stepArcher, stepSwordsman } from '../src/defend/troops.ts';
import { stepArrows } from '../src/defend/towers.ts';
import { stepBlazes, stepFireballs, stepMage } from '../src/defend/mages.ts';
import { charge, stepValkyrie } from '../src/defend/valkyries.ts';
import { UPGRADES, purchasePrice, STARTING_OWNED, STRUCTURES, TILE_ROOM, footprint, stabLength } from '../src/defend/catalog.ts';
import { available, buyItem, buyUpgrade, decodeDefendSave, defaultDefendSave } from '../src/defend/progress.ts';

const zeroLevels = () => Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as any;

/** The keep plus a 3×3 block of city tiles around it. */
function squareCity(): Layout {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const next = placeCityTile(l, tx + dx, ty + dy);
    assert.ok(next, `city tile ${tx + dx},${ty + dy} should be placeable`);
    l = next;
  }
  return l;
}

function mapOf(l: Layout, seed = 3) {
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return generateCity(fit, seed);
}

test('city tiles must touch the city orthogonally and stay off the spawn row', () => {
  const l = defaultLayout();
  const { tx, ty } = l.keep;
  assert.ok(placeCityTile(l, tx + 1, ty));
  assert.equal(placeCityTile(l, tx + 1, ty + 1), null, 'diagonal only');
  assert.equal(placeCityTile(l, tx + 3, ty), null, 'disconnected');
  let chain = l;
  for (let y = ty - 1; y >= 1; y--) chain = placeCityTile(chain, tx, y)!;
  assert.equal(placeCityTile(chain, tx, 0), null, 'spawn row');
});

test('removing a city tile may not split the city', () => {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  l = placeCityTile(l, tx, ty - 1)!;
  l = placeCityTile(l, tx, ty - 2)!;
  assert.equal(removeCityTile(l, tx, ty - 1), null);
  assert.ok(removeCityTile(l, tx, ty - 2));
});

test('barracks need the city; towers may stand outside', () => {
  const l = squareCity();
  const { tx, ty } = l.keep;
  assert.equal(placeStructure(l, 'barracks', tx, ty - 3), null);
  assert.ok(placeStructure(l, 'archerTower', tx, ty - 3));
  assert.ok(placeStructure(l, 'watchTower', tx + 3, ty));
  assert.ok(placeStructure(l, 'barracks', tx - 1, ty - 1));
});

test('several structures can share a tile until it is full', () => {
  let l = squareCity();
  const { tx, ty } = l.keep;
  l = placeStructure(l, 'barracks', tx - 1, ty - 1)!;
  const withTower = placeStructure(l, 'archerTower', tx - 1, ty - 1);
  assert.ok(withTower, 'a 3×4 barracks and a 2×2 tower share a 7×7 tile');
  const fit = fitLayout(withTower!);
  assert.ok(fit.ok);
  // Structures never touch, so a street always fits between them.
  const [a, b] = fit.structures.filter((s) => s.tx === tx - 1 && s.ty === ty - 1).map((s) => s.rect);
  const gapX = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const gapY = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  assert.ok(Math.max(gapX, gapY) >= 1);
  let full: Layout | null = withTower;
  let placed = 0;
  while (full && placed < 10) {
    const next = placeStructure(full, 'barracks', tx - 1, ty - 1);
    if (!next) break;
    full = next;
    placed++;
  }
  assert.ok(placed < 10, 'a tile eventually fills up');
});

test('the keep moves by swapping with another city tile', () => {
  const l = squareCity();
  const { tx, ty } = l.keep;
  const moved = moveKeep(l, tx + 1, ty);
  assert.ok(moved);
  assert.deepEqual(moved!.keep, { tx: tx + 1, ty });
  assert.ok(moved!.cityTiles.includes(tileKey(tx, ty)));
  assert.equal(moveKeep(l, tx + 3, ty), null, 'not onto open ground');
});

test('the wall rings the city just outside its tiles', () => {
  const map = mapOf(squareCity());
  for (let i = 0; i < CELL_COUNT; i++) {
    if (map.wall[i]) assert.equal(map.city[i], 0, 'walls never sit inside a city tile');
  }
  // Every city cell on the boundary is sealed off from open ground by wall.
  const { tx, ty } = squareCity().keep;
  const x0 = (tx - 1) * SUB;
  const y0 = (ty - 1) * SUB;
  assert.equal(map.type[cellIndex(x0 - 1, y0 + 5)], CellType.WALL);
  assert.equal(map.type[cellIndex(x0 - 2, y0 + 5)], CellType.WALL);
  assert.equal(map.type[cellIndex(x0 - 3, y0 + 5)], CellType.OUT);
});

test('every house touches a street and every street reaches the keep', () => {
  let l = squareCity();
  const { tx, ty } = l.keep;
  l = placeStructure(l, 'barracks', tx - 1, ty - 1)!;
  l = placeStructure(l, 'archerTower', tx + 1, ty - 1)!;
  for (const seed of [1, 2, 3, 4, 5]) {
    const map = mapOf(l, seed);
    const road = (i: number) => map.type[i] === CellType.ROAD;
    const neighbours = (i: number) => {
      const x = i % CELLS_W, y = Math.floor(i / CELLS_W);
      return ORTHO.map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < CELLS_W && ny < CELL_COUNT / CELLS_W).map(([nx, ny]) => cellIndex(nx, ny));
    };
    for (const b of map.buildings) {
      if (b.kind === 'wall') continue;
      assert.ok(b.cells.some((c) => neighbours(c).some(road)), `${b.kind} at ${b.rect.x},${b.rect.y} touches a road (seed ${seed})`);
    }
    const keep = map.buildings.find((b) => b.kind === 'keep')!;
    const seen = new Set<number>();
    const stack = keep.cells.flatMap(neighbours).filter(road);
    for (const s of stack) seen.add(s);
    while (stack.length) for (const n of neighbours(stack.pop()!)) if (road(n) && !seen.has(n)) (seen.add(n), stack.push(n));
    for (let i = 0; i < CELL_COUNT; i++) if (road(i)) assert.ok(seen.has(i), `road cell ${i} connects to the keep (seed ${seed})`);
  }
});

test('the same layout and seed always generate the same city', () => {
  const a = mapOf(squareCity(), 9);
  const b = mapOf(squareCity(), 9);
  assert.deepEqual([...a.type], [...b.type]);
});

test('waves spend their difficulty budget and keep fixed enemy HP', () => {
  let seed = 1;
  const rand = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  for (let wave = 1; wave <= 180; wave++) {
    const enemies = buildWave(wave, rand);
    assert.equal(enemies.reduce((sum, k) => sum + ENEMIES[k].cost, 0), waveDifficulty(wave));
    assert.ok(enemies.reduce((sum, k) => sum + (ENEMIES[k].chainLength ?? (1 + (ENEMIES[k].splits?.count ?? 0))), 0) <= MAX_WAVE_ENEMIES);
  }
  const sim = new DefendSim(mapOf(defaultLayout()), zeroLevels(), 5);
  sim.wave = 1000;
  assert.equal((sim as any).newEnemy('roach', 5, 5).hp, ENEMIES.roach.hp);
});

test('waves terminate safely with impossible budgets and invalid inputs', () => {
  assert.equal(buildDifficultyWave(1e12, () => 0).length, MAX_WAVE_ENEMIES);
  assert.ok(buildDifficultyWave(1e12, () => 0).every(k => k === 'voidSparrow'));
  for (const wave of [0, -1, NaN, Infinity]) assert.deepEqual(buildWave(wave, () => 0), []);
  assert.equal(waveDifficulty(1e100), Number.MAX_SAFE_INTEGER);
  for (const roll of [NaN, Infinity, -1, 2]) {
    const enemies = buildDifficultyWave(53, () => roll);
    assert.equal(enemies.reduce((sum, k) => sum + ENEMIES[k].cost, 0), 53);
  }
  assert.deepEqual(buildDifficultyWave(Infinity, () => 0), []);
});

test('offspring cannot push a wave past its lifetime enemy cap', () => {
  const sim = new DefendSim(mapOf(defaultLayout()), zeroLevels(), 5);
  const mother = (sim as any).newEnemy('mother', 10.5, 2.5);
  mother.hp = 0;
  sim.enemies.push(mother);
  (sim as any).waveSpawned = MAX_WAVE_ENEMIES - 1;
  (sim as any).sweepAway();
  assert.equal(sim.enemies.length, 1);
  assert.equal((sim as any).waveSpawned, MAX_WAVE_ENEMIES);
  (sim as any).spawnEnemy('roach');
  assert.equal(sim.enemies.length, 1);
});

test('unspendable remainders and invalid costs safely stop spawning', () => {
  const costs = Object.values(ENEMIES).map(d => d.cost);
  try {
    for (const d of Object.values(ENEMIES)) d.cost = 4;
    assert.equal(buildDifficultyWave(53, () => 0).length, 13);
    for (const d of Object.values(ENEMIES)) d.cost = 0;
    assert.deepEqual(buildDifficultyWave(53, () => 0), []);
  } finally {
    Object.values(ENEMIES).forEach((d, i) => d.cost = costs[i]);
  }
});

test('waves release their randomized count within five seconds', () => {
  for (const wave of [1, 10, 100]) {
    const sim = new DefendSim(mapOf(defaultLayout()), zeroLevels(), 5);
    sim.wave = wave;
    sim.spawnQueue = buildWave(wave, sim.rand);
    const count = sim.spawnQueue.reduce((sum, k) => sum + (ENEMIES[k].chainLength ?? 1), 0);
    for (let i = 0; i < 151; i++) (sim as any).runWaves(1 / 30);
    assert.equal(sim.spawnQueue.length, 0);
    assert.equal(sim.enemies.length, count);
  }
});

test('dense crowd separation is deterministic, bounded and ignores dead enemies', () => {
  const make = () => {
    const sim = new DefendSim(mapOf(defaultLayout()), zeroLevels(), 9);
    for (let i = 0; i < 10000; i++) sim.enemies.push((sim as any).newEnemy('roach', 5 + i % 10 * .01, 5));
    (sim as any).indexEnemies();
    return sim;
  };
  const a = make(), b = make();
  const push = (a as any).separation(a.enemies[0]);
  assert.deepEqual(push, (b as any).separation(b.enemies[0]));
  assert.ok(push.every(Number.isFinite));
  assert.ok(Math.abs(push[0]) <= 8 * .45);
  for (const e of a.enemies) e.hp = 0;
  assert.deepEqual((a as any).separation(a.enemies[0]), [0, 0]);
});

test('an undefended city eventually falls, and enemies breach the wall to do it', () => {
  const sim = new DefendSim(mapOf(squareCity()), zeroLevels(), 5);
  let breached = false;
  while (!sim.lost && sim.time < 600) {
    sim.step(1 / 30);
    if (!breached) breached = sim.map.buildings.some((b) => b.kind === 'wall' && !sim.intact(b));
  }
  assert.ok(sim.lost, 'keep falls');
  assert.ok(breached, 'walls were breached');
});

test('barracks keep their garrison topped up', () => {
  let l = squareCity();
  l = placeStructure(l, 'barracks', l.keep.tx - 1, l.keep.ty - 1)!;
  const sim = new DefendSim(mapOf(l), zeroLevels(), 1);
  for (let i = 0; i < 30 * 12; i++) sim.step(1 / 30);
  assert.equal(sim.soldiers.length, 2, 'two swordsmen at level 0');
  sim.soldiers[0].hp = 0;
  sim.step(1 / 30);
  assert.equal(sim.soldiers.length, 1);
  for (let i = 0; i < 30 * 6; i++) sim.step(1 / 30);
  assert.equal(sim.soldiers.length, 2, 'the fallen swordsman is replaced after the training time');
});

test('civilians rebuild ruins one section at a time', () => {
  const sim = new DefendSim(mapOf(squareCity()), zeroLevels(), 1);
  // The multi-cell house nearest the keep, where the civilians live.
  const centre = (b: { cells: number[] }) => [0, 1].map((k) => b.cells.reduce((s, c) => s + (k ? cellY(c) : cellX(c)), 0) / b.cells.length);
  const [kx, ky] = centre(sim.map.buildings.find((b) => b.kind === 'keep')!);
  const away = (b: { cells: number[] }) => { const [x, y] = centre(b); return (x - kx) * (x - kx) + (y - ky) * (y - ky); };
  const house = sim.map.buildings.filter((b) => b.kind === 'house' && b.cells.length >= 2).sort((a, b) => away(a) - away(b) || a.id - b.id)[0];
  sim.damageBuilding(house.id, 1e6);
  assert.equal(sim.intact(house), false);
  assert.ok(house.cells.every((c) => !sim.solid[c]), 'rubble is walkable');
  let partial = false;
  for (let i = 0; i < 30 * 60 && !sim.intact(house); i++) {
    sim.step(1 / 30);
    const built = house.cells.filter((c) => sim.solid[c]).length;
    if (built > 0 && built < house.cells.length) partial = true;
  }
  assert.ok(sim.intact(house), 'house fully rebuilt');
  assert.ok(partial, 'it came back piece by piece');
});

test('bombs and watch-tower marks hurt enemies', () => {
  const sim = new DefendSim(mapOf(squareCity()), zeroLevels(), 1);
  while (!sim.enemies.length) sim.step(1 / 30);
  const e = sim.enemies[0];
  const hp = e.hp;
  e.marked = true;
  sim.hurtEnemy(e, 1);
  assert.equal(e.hp, hp - 2, 'marked enemies take double damage');
  sim.dropBomb(e.x, e.y);
  assert.ok(e.hp <= 0);
});

test('shop: palette counts, purchases and upgrades use the wallet', () => {
  const save = defaultDefendSave();
  assert.equal(available(save, 'cityTile'), STARTING_OWNED.cityTile);
  const wallet = { gold: 10_000, copper: 100, silver: 100 };
  const price = purchasePrice('watchTower', save.owned.watchTower);
  assert.ok(buyItem(save, wallet, 'watchTower'));
  assert.equal(available(save, 'watchTower'), 1);
  assert.equal(wallet.gold, 10_000 - price.gold);
  assert.ok(purchasePrice('watchTower', save.owned.watchTower).gold > price.gold, 'each extra costs more');
  assert.ok(buyUpgrade(save, wallet, 'barracksCapacity'));
  assert.equal(save.levels.barracksCapacity, 1);
  const broke = { gold: 0, copper: 0, silver: 0 };
  assert.equal(buyItem(save, broke, 'barracks'), false);
});

test('saves round-trip and reject tampered layouts', () => {
  const save = defaultDefendSave();
  save.layout = squareCity();
  save.bestWave = 7;
  const back = decodeDefendSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(back.layout, save.layout);
  assert.equal(back.bestWave, 7);
  const cheat = JSON.parse(JSON.stringify(save));
  cheat.layout.structures.push({ uid: 99, kind: 'barracks', tx: 1, ty: 1 });
  cheat.layout.nextUid = 100;
  assert.equal(decodeDefendSave(cheat).layout.structures.length, 0, 'unowned / illegal structures reset the layout');
  // Saves from the old tile-grid DEFEND fall back to a fresh city.
  assert.deepEqual(decodeDefendSave({ tiles: [], keep: { x: 4, y: 6 } }).layout, defaultLayout());
});

test('city lights: tower fires with corner pillars, lanterns hung on houses', async () => {
  const { cityLights, roadStones } = await import('../src/defend/lighting.ts');
  let l = squareCity();
  l = placeStructure(l, 'archerTower', l.keep.tx, l.keep.ty - 3)!;
  const map = mapOf(l);
  const lights = cityLights(map);
  const archer = lights.find((x) => x.kind === 'archerTower')!;
  assert.equal(archer.pillars.length, 4, 'four corner pillars');
  assert.ok(archer.inside, 'the tower does not shadow its own fire');
  const lanterns = lights.filter((x) => x.kind === 'lantern');
  assert.ok(lanterns.length >= 4);
  for (const a of lanterns) {
    assert.equal(map.buildings[a.owner].kind, 'house');
    for (const b of lanterns) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 5.5, 'lanterns are spread out');
  }
  assert.ok(roadStones(map).every((s) => map.type[cellIndex(Math.floor(s.x), Math.floor(s.y))] === CellType.ROAD));
});

test('weather: 30% rainy runs; night falls on every 10th (boss) wave', async () => {
  const { rollWeather, isBossWave, ambientFor, skyLabel } = await import('../src/defend/weather.ts');
  let rain = 0;
  const r = (await import('../src/defend/grid.ts')).rng(42);
  for (let i = 0; i < 20000; i++) rain += +rollWeather(r).rain;
  assert.ok(Math.abs(rain / 20000 - 0.3) < 0.02);
  assert.deepEqual([1, 9, 10, 11, 20, 30].map(isBossWave), [false, false, true, false, true, true]);
  // Night deepens the darkness smoothly.
  const day = ambientFor({ rain: false }, 0), dusk = ambientFor({ rain: false }, 0.5), night = ambientFor({ rain: false }, 1);
  assert.ok(day.alpha < dusk.alpha && dusk.alpha < night.alpha);
  assert.equal(skyLabel({ rain: true }, 1), 'Storm');
  assert.equal(skyLabel({ rain: false }, 0), 'Cloudy');
});

test('warlords appear by affordability rather than scheduled waves', () => {
  assert.ok(!buildDifficultyWave(99, () => .999).includes('warlord'));
  assert.deepEqual(buildDifficultyWave(100, () => .5), ['warlord']);
});

test('struck buildings flash', () => {
  const sim = new DefendSim(mapOf(squareCity()), zeroLevels(), 1);
  const wall = sim.map.buildings.find((b) => b.kind === 'wall')!;
  sim.damageBuilding(wall.id, 1);
  assert.ok(sim.flash[wall.id] > 0);
  for (let i = 0; i < 10; i++) sim.step(1 / 30);
  assert.equal(sim.flash[wall.id], 0);
});

test('patrol routes: max level sends swordsmen after enemies anywhere in the city', () => {
  let l = squareCity();
  // Stretch the city so its far end is well beyond the base leash.
  for (let y = l.keep.ty + 2; y <= 12; y++) l = placeCityTile(l, l.keep.tx - 1, y) ?? l;
  l = placeStructure(l, 'barracks', l.keep.tx + 1, l.keep.ty - 1)!;
  const map = mapOf(l);
  const far = (lv: number) => {
    const levels = { ...zeroLevels(), soldierReach: lv };
    const sim = new DefendSim(map, levels, 1);
    for (let i = 0; i < 30 * 12; i++) sim.step(1 / 30);
    sim.enemies = [];
    sim.spawnQueue = [];
    // An enemy on a street at the far end of the city.
    let cell = -1;
    for (let i = CELL_COUNT - 1; i >= 0 && cell < 0; i--) if (map.city[i] && map.type[i] === CellType.ROAD) cell = i;
    const x = (cell % CELLS_W) + 0.5, y = Math.floor(cell / CELLS_W) + 0.5;
    sim.enemies.push({ id: 9999, kind: 'ogre', x, y, hp: 1e9, maxHp: 1e9, cd: 99, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 99, marked: false, flash: 0 } as any);
    for (let i = 0; i < 30; i++) {
      (sim as any).indexEnemies();
      for (const s of sim.soldiers) stepSwordsman(sim, s, 1 / 30);
    }
    return sim.soldiers.some((s) => s.target === 9999);
  };
  assert.equal(far(0), false, 'base patrols stay near the barracks');
  assert.equal(far(4), true, 'citywide patrols hunt it down');
});

test('3× speed unlock is bought once and saved', async () => {
  const { buySpeed3 } = await import('../src/defend/progress.ts');
  const save = defaultDefendSave();
  const wallet = { gold: 10_000, copper: 100, silver: 0 };
  assert.ok(buySpeed3(save, wallet));
  assert.equal(buySpeed3(save, wallet), false);
  assert.equal(decodeDefendSave(JSON.parse(JSON.stringify(save))).speed3, true);
});

test('cannon towers lob shells that burst with splash damage', () => {
  let l = squareCity();
  l = placeStructure(l, 'cannonTower', l.keep.tx, l.keep.ty - 2)!;
  assert.ok(l, 'cannon towers can stand outside the walls');
  const sim = new DefendSim(mapOf(l), zeroLevels(), 1);
  const gun = sim.map.buildings.find((b) => b.kind === 'cannonTower')!;
  const gx = gun.rect.x + 1, gy = gun.rect.y + 1;
  const mk = (id: number, dx: number) => ({ id, kind: 'orc', x: gx + dx, y: gy - 5, hp: 1000, maxHp: 1000, cd: 99, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 99, marked: false, flash: 0 }) as any;
  sim.spawnQueue = [];
  sim.breakT = 1e9;
  sim.enemies = [mk(1, 0), mk(2, 0.8)];
  let shells = 0, scorched = false;
  for (let i = 0; i < 30 * 3; i++) {
    sim.step(1 / 30);
    shells = Math.max(shells, sim.shells.length);
    scorched ||= sim.scorches.length > 0;
    for (const e of sim.enemies) { e.x = gx + (e.id === 1 ? 0 : 0.8); e.y = gy - 5; }
  }
  assert.ok(shells > 0, 'a shell was fired');
  assert.ok(sim.enemies.every((e) => e.hp < 1000), 'both enemies caught in the splash');
  assert.ok(scorched, 'the blast leaves glowing cracks');
});

test('friendly fire: blasts hurt your own people until the Armory upgrade', () => {
  const blast = (levels: any) => {
    const sim = new DefendSim(mapOf(squareCity()), levels, 1);
    const civ = { id: 1, x: 10.5, y: 10.5, hp: 10, maxHp: 10, job: -1, state: 'toJob', work: 0, path: [], home: 0, thinkT: 0, flash: 0 } as any;
    sim.civilians = [civ];
    sim.dropBomb(10.5, 11);
    return civ.hp;
  };
  assert.ok(blast(zeroLevels()) < 10, 'bombs hurt civilians by default');
  assert.equal(blast({ ...zeroLevels(), bombSafe: 1 }), 10, 'Shaped charges spare them');
});

test('archer barracks: archers roam the streets and shoot what comes near', () => {
  let l = squareCity();
  l = placeStructure(l, 'archerBarracks', l.keep.tx - 1, l.keep.ty - 1)!;
  assert.ok(l, 'archer barracks fit in a city tile');
  assert.equal(placeStructure(l, 'archerBarracks', l.keep.tx, l.keep.ty - 3), null, 'but not outside the walls');
  const map = mapOf(l);
  const sim = new DefendSim(map, zeroLevels(), 1);
  sim.spawnQueue = [];
  sim.breakT = 1e9;
  for (let i = 0; i < 30 * 12; i++) sim.step(1 / 30);
  const archers = sim.soldiers.filter((s) => s.kind === 'archer');
  assert.equal(archers.length, 2, 'a full garrison of archers');
  const home = map.buildings.find((b) => b.kind === 'archerBarracks')!;
  const hc = { x: home.rect.x + 1.5, y: home.rect.y + 1.5 };
  assert.ok(archers.some((a) => Math.hypot(a.x - hc.x, a.y - hc.y) > 3), 'they wander off into the streets');
  // An enemy right beside an archer gets shot.
  const a = archers[0];
  const foe = { id: 777, kind: 'orc', x: a.x + 1, y: a.y, hp: 100, maxHp: 100, cd: 99, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 99, marked: false, flash: 0 } as any;
  sim.enemies = [foe];
  for (let i = 0; i < 30 * 2; i++) {
    (sim as any).indexEnemies();
    stepArcher(sim, a, 1 / 30);
    stepArrows(sim, 1 / 30);
    foe.x = a.x + 1;
    foe.y = a.y;
  }
  assert.ok(foe.hp < 100, 'arrows land');
});

test('Mage Guild: fire mages hurl fireballs that burst and leave the ground burning', () => {
  let l = squareCity();
  l = placeStructure(l, 'mageGuild', l.keep.tx - 1, l.keep.ty - 1)!;
  assert.ok(l, 'a Mage Guild fits in a city tile');
  assert.equal(placeStructure(l, 'mageGuild', l.keep.tx, l.keep.ty - 3), null, 'but not outside the walls');
  const map = mapOf(l);
  const sim = new DefendSim(map, zeroLevels(), 1);
  sim.spawnQueue = [];
  sim.breakT = 1e9;
  for (let i = 0; i < 30 * 12; i++) sim.step(1 / 30);
  const mages = sim.soldiers.filter((s) => s.kind === 'mage');
  assert.equal(mages.length, 2, 'a full garrison of mages');
  const m = mages[0];
  const foe = (id: number, x: number, y: number, kind = 'ogre') =>
    ({ id, kind, x, y, hp: 1000, maxHp: 1000, cd: 99, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 99, marked: false, flash: 0 }) as any;
  // Two enemies side by side: the fireball's burst hurts both, and a bat
  // overhead too; a civilian beside them is spared.
  const a = foe(1, m.x + 2, m.y), b = foe(2, m.x + 2.6, m.y), bat = foe(3, m.x + 2.3, m.y + 0.3, 'bat');
  sim.enemies = [a, b, bat];
  sim.civilians = [{ id: 9, x: m.x + 2.2, y: m.y, hp: 10, maxHp: 10, job: -1, state: 'home', work: 0, path: [], home: 0, thinkT: 99, flash: 0 }];
  m.cd = 0;
  (sim as any).indexEnemies();
  stepMage(sim, m, 1 / 30);
  assert.equal(sim.fireballs.length, 1, 'a fireball is thrown at the nearest');
  for (let i = 0; i < 30 && sim.fireballs.length; i++) stepFireballs(sim, 1 / 30);
  assert.equal(sim.fireballs.length, 0, 'it lands');
  assert.ok(a.hp < 1000 && b.hp < 1000 && bat.hp < 1000, 'the burst splashes everyone near');
  assert.equal(sim.civilians[0].hp, 10, 'and spares your own people');
  assert.equal(sim.blazes.length, 1, 'the ground is left burning');
  // The fire burns ground enemies standing in it, over time, but not fliers.
  const [ha, hBat] = [a.hp, bat.hp];
  a.flash = 0;
  for (let i = 0; i < 30; i++) {
    (sim as any).indexEnemies();
    stepBlazes(sim, 1 / 30);
  }
  assert.ok(ha - a.hp > 5, 'the flames burn what stands in them');
  assert.equal(bat.hp, hBat, 'fliers pass over the flames');
  assert.equal(a.flash, 0, 'a burn does not flash like a blow');
  for (let i = 0; i < 30 * 10; i++) stepBlazes(sim, 1 / 30);
  assert.equal(sim.blazes.length, 0, 'and the fire dies down');
});

test("Hunter's instinct sends archers toward enemies they can't see yet", () => {
  let l = squareCity();
  l = placeStructure(l, 'archerBarracks', l.keep.tx - 1, l.keep.ty - 1)!;
  const map = mapOf(l);
  const run = (hunt: number) => {
    const sim = new DefendSim(map, { ...zeroLevels(), archerHunt: hunt }, 3);
    sim.spawnQueue = [];
    sim.breakT = 1e9;
    for (let i = 0; i < 30 * 12; i++) sim.step(1 / 30);
    let cell = -1;
    for (let i = CELL_COUNT - 1; i >= 0 && cell < 0; i--) if (map.city[i] && map.type[i] === CellType.ROAD) cell = i;
    const foe = { id: 555, kind: 'ogre', x: (cell % CELLS_W) + 0.5, y: Math.floor(cell / CELLS_W) + 0.5, hp: 1e9, maxHp: 1e9, cd: 99, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 99, marked: false, flash: 0 } as any;
    sim.enemies = [foe];
    const a = sim.soldiers.find((s) => s.kind === 'archer')!;
    a.thinkT = 0;
    a.path = [];
    (sim as any).indexEnemies();
    stepArcher(sim, a, 1 / 30);
    return a.target === 555;
  };
  assert.equal(run(0), false);
  assert.equal(run(1), true);
});

test('park fences: street-facing, with a gate; trampled or blasted into fading splinters', async () => {
  const { parkFences, Fences } = await import('../src/defend/fences.ts');
  // A big city so there are plenty of parks.
  let l = defaultLayout();
  for (let y = 4; y <= 12; y++) for (let x = 1; x <= 7; x++) l = placeCityTile(l, x, y) ?? l;
  let map = mapOf(l, 1), sections = parkFences(map);
  for (let seed = 2; !sections.length && seed < 20; seed++) sections = parkFences((map = mapOf(l, seed)));
  assert.ok(sections.length > 0, 'some parks are fenced');
  for (const s of sections) {
    // Every section runs along a park cell that borders a street.
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    assert.equal(map.type[cellIndex(Math.floor(mx), Math.floor(my))], CellType.PARK);
  }
  const fences = new Fences();
  fences.sync(map);
  const s = fences.sections[0];
  const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
  const fake: any = { time: 0, enemies: [{ kind: 'orc', x: mx, y: my }], effects: [] };
  fences.update(fake);
  assert.equal(s.broken, true, 'an enemy walking across snaps it');
  assert.ok(fences.splinters.length >= 6, 'into splinters');
  // A blast breaks every section in reach.
  const t = fences.sections.find((x) => !x.broken)!;
  fake.enemies = [];
  fake.effects = [{ kind: 'boom', x: t.x1, y: t.y1, t: 0, r: 1.5, seed: 42 }];
  fake.time = 0.1;
  fences.update(fake);
  assert.equal(t.broken, true, 'blasts break fences too');
  // Splinters fade away within 10 seconds.
  fake.effects = [];
  for (let i = 1; i <= 120; i++) {
    fake.time = 0.1 + i * 0.1;
    fences.update(fake);
  }
  assert.equal(fences.splinters.length, 0);
});

test('a Mother splits into three broodlings when she dies, and they do not split again', () => {
  const sim = new DefendSim(mapOf(squareCity()), zeroLevels(), 1);
  sim.spawnQueue = [];
  sim.breakT = 1e9;
  // On open ground in the spawn lane, so all three land around her.
  const mother = { id: 1, kind: 'mother', x: 10.5, y: 2.5, hp: 1, maxHp: 1, cd: 99, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 99, marked: false, flash: 0 } as any;
  sim.enemies = [mother];
  sim.hurtEnemy(mother, 5);
  sim.step(1 / 30);
  assert.equal(sim.slain.mother, 1);
  const brood = sim.enemies.filter((e) => e.kind === 'broodling');
  assert.equal(brood.length, 3, 'three broodlings hatch');
  assert.equal(sim.enemies.length, 3, 'and the Mother is gone');
  assert.equal(new Set(brood.map((e) => e.id)).size, 3);
  for (const e of brood) assert.ok(Math.hypot(e.x - 10.5, e.y - 2.5) < 1, 'close to where she fell');
  for (const e of brood) sim.hurtEnemy(e, 1e9);
  sim.step(1 / 30);
  assert.equal(sim.slain.broodling, 3);
  assert.equal(sim.enemies.length, 0, 'broodlings leave nothing behind');
});

test('Mothers appear by affordability; broodlings only hatch', () => {
  assert.ok(!buildDifficultyWave(9, () => .999).includes('mother'));
  assert.deepEqual(buildDifficultyWave(10, () => .7), ['mother']);
  assert.ok(!buildWave(100, () => .5).includes('broodling'));
});

test('every building takes a share of its tile, and what shares a tile fits its room', () => {
  assert.equal(STRUCTURES.archerTower.size, 1, 'the smallest towers take a sixteenth');
  assert.equal(STRUCTURES.watchTower.size, 1);
  assert.equal(STRUCTURES.valkyriePalace.size, TILE_ROOM, 'the palace takes a whole tile');
  assert.equal(footprint('valkyriePalace', true).size, TILE_ROOM / 2, 'or half, with Folded halls');
  let l = squareCity();
  const { tx, ty } = l.keep;
  l = placeStructure(l, 'valkyriePalace', tx - 1, ty - 1)!;
  assert.ok(l, 'a palace fits a city tile');
  assert.equal(placeStructure(l, 'archerTower', tx - 1, ty - 1), null, 'and nothing else fits beside it');
  assert.equal(placeStructure(l, 'valkyriePalace', tx, ty - 3), null, 'it must be inside the city');
  const small = { ...l, compact: ['valkyriePalace' as const] };
  const fit = fitLayout(small);
  assert.ok(fit.ok);
  const palace = fit.structures.find((s) => s.kind === 'valkyriePalace')!;
  assert.equal(palace.rect.w * palace.rect.h, 15, 'folded, it stands on 3 × 5 cells');
  let two = placeStructure(small, 'valkyriePalace', tx - 1, ty - 1);
  assert.ok(two, 'two folded palaces share a tile');
  assert.equal(placeStructure(two!, 'archerTower', tx - 1, ty - 1), null, 'which they fill');
});

test('buildings take a random free spot on their tile, and a drop reshuffles the tile', () => {
  let l = squareCity();
  const { tx, ty } = l.keep;
  const spots = new Set<string>();
  for (let n = 0; n < 12; n++) {
    const next = n === 0 ? placeStructure(l, 'archerTower', tx + 1, ty + 1) : moveStructureTo(l, tx + 1, ty + 1);
    l = next!;
    const r = fitLayout(l).ok && (fitLayout(l) as any).structures.find((s: any) => s.kind === 'archerTower').rect;
    spots.add(`${r.x},${r.y}`);
  }
  assert.ok(spots.size >= 4, `an archer tower lands in different spots (${spots.size})`);
  // Four towers fill a tile; every drop shuffles all of them, and they fit.
  for (const kind of ['watchTower', 'cannonTower', 'wizardTower'] as const) l = placeStructure(l, kind, tx + 1, ty + 1)!;
  assert.ok(l, 'four towers share a tile');
  const before = (fitLayout(l) as any).structures.filter((s: any) => s.tx === tx + 1).map((s: any) => `${s.rect.x},${s.rect.y}`).join(' ');
  const again = moveStructureTo(l, tx + 1, ty + 1)!;
  const after = (fitLayout(again) as any).structures.filter((s: any) => s.tx === tx + 1).map((s: any) => `${s.rect.x},${s.rect.y}`).join(' ');
  assert.notEqual(after, before, 'dropping one again rearranges the tile');
});

/** Picks up the archer tower and drops it on (tx, ty). */
const moveStructureTo = (l: Layout, tx: number, ty: number) => moveStructure(l, l.structures.find((s) => s.kind === 'archerTower')!.uid, tx, ty);

test('old saves load with their buildings in valid spots, returning what no longer fits', () => {
  const save = defaultDefendSave();
  let l = squareCity();
  const { tx, ty } = l.keep;
  l = placeStructure(l, 'barracks', tx - 1, ty - 1)!;
  l = placeStructure(l, 'archerTower', tx + 1, ty - 1)!;
  save.layout = l;
  save.owned.cityTile = 8;
  save.owned.valkyriePalace = 1;
  // A save from before spots and shares: no spot, and a palace sharing a
  // tile with the barracks (now too full).
  const old = JSON.parse(JSON.stringify(save));
  for (const s of old.layout.structures) delete s.spot;
  delete old.layout.rolls;
  delete old.layout.compact;
  old.layout.structures.push({ uid: old.layout.nextUid++, kind: 'valkyriePalace', tx: tx - 1, ty: ty - 1 });
  const back = decodeDefendSave(old);
  assert.equal(back.layout.cityTiles.length, 8, 'the city is kept');
  assert.deepEqual(back.layout.structures.map((s) => s.kind), ['barracks', 'archerTower'], 'what no longer fits goes back to the palette');
  assert.ok(fitLayout(back.layout).ok, 'and the rest fits');
  assert.equal(available(back, 'valkyriePalace'), 1);
  // Buying Folded halls shrinks the palaces on the board.
  const s2 = decodeDefendSave(JSON.parse(JSON.stringify(save)));
  s2.owned.valkyriePalace = 1;
  s2.layout = placeStructure(s2.layout, 'valkyriePalace', tx - 1, ty)!;
  assert.ok(buyUpgrade(s2, { gold: 0, copper: 0, silver: 0, free: true }, 'palaceCompact'));
  assert.deepEqual(s2.layout.compact, ['valkyriePalace']);
  assert.equal(decodeDefendSave(JSON.parse(JSON.stringify(s2))).layout.compact[0], 'valkyriePalace', 'and stays so on loading');
});

test('Valkyrie palace: valkyries charge-stab every enemy in a line, stop at walls, and are untouchable after', () => {
  let l = squareCity();
  l = placeStructure(l, 'valkyriePalace', l.keep.tx - 1, l.keep.ty - 1)!;
  const sim = new DefendSim(mapOf(l), zeroLevels(), 1);
  sim.spawnQueue = [];
  sim.breakT = 1e9;
  for (let i = 0; i < 30 * 12; i++) sim.step(1 / 30);
  const valks = sim.soldiers.filter((s) => s.kind === 'valkyrie');
  assert.equal(valks.length, 2, 'a full garrison of valkyries');
  const v = valks[0];
  const foe = (id: number, x: number, y: number, kind = 'ogre') =>
    ({ id, kind, x, y, hp: 1000, maxHp: 1000, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 99, marked: false, flash: 0 }) as any;
  // Put her on an open street with room to her east.
  const reach = stabLength(0);
  const open = sim.streets.find((i) => {
    for (let d = 0; d <= reach + 1; d += 0.25) if (sim.solid[cellIndex(Math.floor(cellX(i) + 0.5 + d), cellY(i))]) return false;
    return true;
  });
  assert.ok(open !== undefined, 'a straight street to charge down');
  v.x = cellX(open!) + 0.5;
  v.y = cellY(open!) + 0.5;
  const near = foe(1, v.x + 1, v.y), far = foe(2, v.x + 2.2, v.y + 0.1), aside = foe(3, v.x + 1.5, v.y + 2);
  sim.enemies = [near, far, aside];
  v.cd = 0;
  (sim as any).indexEnemies();
  const x0 = v.x;
  stepValkyrie(sim, v, 1 / 30);
  assert.ok(near.hp < 1000 && far.hp < 1000, 'the stab runs through everything in the line');
  assert.equal(aside.hp, 1000, 'but nothing beside it');
  assert.ok(Math.abs(v.x - x0 - reach) < 1e-9, 'she charges her whole reach down the line');
  assert.equal(sim.stabs.length, 1, 'leaving a streak');
  assert.equal(v.guard, 1, 'and nothing can hurt her for a second');
  // An ogre beside her can't hurt her while she is guarded, then can.
  const ogre = foe(4, v.x + 0.3, v.y);
  sim.enemies = [ogre];
  sim.soldiers = [v];
  const hp = v.hp;
  for (let i = 0; i < 15; i++) sim.step(1 / 30);
  assert.equal(v.hp, hp, 'untouchable just after a charge');
  for (let i = 0; i < 45; i++) sim.step(1 / 30);
  assert.ok(v.hp < hp, 'then she can be hurt again');
  // Toward the wall she stops at the last open spot before it.
  const west = sim.map.city.findIndex((c, i) => c === 1 && sim.map.wall[i - 1] === 1 && !sim.solid[i]);
  v.x = cellX(west) + 0.5;
  v.y = cellY(west) + 0.5;
  v.cd = 0;
  charge(sim, v, foe(5, v.x - 3, v.y), reach);
  assert.ok(v.x > cellX(west) - 0.5 && v.x <= cellX(west) + 0.5, 'the wall stops her charge');
});
