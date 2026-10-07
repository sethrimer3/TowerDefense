import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { ENEMIES, UPGRADES, enemySize, type EnemyKind } from '../src/defend/catalog.ts';
import { enemySpeed } from '../src/defend/enemy-abilities.ts';
import { stepEnemy } from '../src/defend/enemies.ts';
import { syncFortress } from '../src/defend/fortress.ts';
import { buildDifficultyWave, MAX_WAVE_ENEMIES } from '../src/defend/waves.ts';
import { fortressBodyPixels } from '../src/defend/fortress-art.ts';
import { journalHTML } from '../src/defend/journal.ts';
import { decodeDefendSave, defaultDefendSave } from '../src/defend/progress.ts';

function simulation() {
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  return new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
}
const kinds: EnemyKind[] = ['fortressLesser', 'fortress', 'fortressGreater', 'fortressSovereign'];
const smallKinds: EnemyKind[] = ['fortressHut', 'fortressOutpost', 'fortressTower', 'fortressKeep'];

test('small walkers cost exactly 5, 10, 50 and 100, with progressively smaller-than-bastion bodies and parts', () => {
  for (const [n, kind] of smallKinds.entries()) {
    const def = ENEMIES[kind], fort = def.fortress!;
    assert.equal(def.cost, [5, 10, 50, 100][n]);
    assert.ok(def.size < ENEMIES.fortressLesser.size && fort.height < ENEMIES.fortressLesser.fortress!.height);
    if (n) {
      const previous = ENEMIES[smallKinds[n - 1]];
      assert.ok(def.size > previous.size && def.hp > previous.hp && fort.partScale! > previous.fortress!.partScale!);
    }
    // Select each variant through the actual affordable wave roster.
    const roster = Object.values(ENEMIES).filter(d => !d.hatched && d.cost <= def.cost);
    const roll = (roster.findIndex(d => d.kind === kind) + .5) / roster.length;
    assert.deepEqual(buildDifficultyWave(def.cost, () => roll), [kind]);
    const sim = simulation(); (sim as any).spawnEnemy(kind);
    const core = sim.enemies[0], parts = core.fortressParts!;
    assert.equal(parts.length, fort.legs + fort.armor + fort.turrets);
    assert.ok(parts.every(p => enemySize(p) < enemySize(core)));
    assert.equal(new Set(sim.enemies.map(e => e.id)).size, parts.length + 1);
    for (const part of parts) {
      assert.ok(Math.abs(part.fortressPart!.dy) < fort.height / 2);
      assert.equal(part.hp, fort.partHp * (part.fortressPart!.role === 'armor' ? 1.5 : 1));
    }
  }
});

test('each small walker retains armor, leg damage, independent guns and a single rewarded core', () => {
  for (const kind of smallKinds) {
    const sim = simulation(); (sim as any).spawnEnemy(kind);
    const core = sim.enemies[0], parts = core.fortressParts!, speed = enemySpeed(sim, core);
    assert.equal(sim.hurtEnemy(core, 1), false);
    core.x = 10; core.y = 10; syncFortress(core);
    const turret = parts.find(p => p.fortressPart!.role === 'turret')!;
    sim.soldiers.push({ id: 100, x: turret.x, y: turret.y + 1, hp: 1000, flash: 0, kind: 'sword' } as any);
    turret.cd = 0; stepEnemy(sim, turret, 1 / 30);
    assert.ok(sim.soldiers[0].hp < 1000);
    const hp = sim.soldiers[0].hp;
    sim.hurtEnemy(turret, 1e9, true, 'melee'); stepEnemy(sim, turret, 10);
    assert.equal(sim.soldiers[0].hp, hp);
    for (const part of parts.filter(p => p.fortressPart!.role === 'leg')) sim.hurtEnemy(part, 1e9, true, 'melee');
    assert.equal(enemySpeed(sim, core), speed * .25);
    assert.equal(sim.hurtEnemy(core, 1), false);
    for (const part of parts.filter(p => p.fortressPart!.role === 'armor')) sim.hurtEnemy(part, 1e9, true, 'melee');
    assert.equal(sim.hurtEnemy(core, 1), true);
    sim.hurtEnemy(core, 1e9, true, 'melee'); (sim as any).sweepAway();
    assert.equal(sim.enemies.length, 0);
    assert.equal(sim.slain[kind], 1);
  }
});

test('small walkers spawn atomically at the cap and round-trip journal discovery', () => {
  for (const kind of smallKinds) {
    const sim = simulation(), f = ENEMIES[kind].fortress!, count = 1 + f.legs + f.armor + f.turrets;
    (sim as any).waveSpawned = MAX_WAVE_ENEMIES - count + 1;
    (sim as any).spawnEnemy(kind); assert.equal(sim.enemies.length, 0);
    (sim as any).waveSpawned = MAX_WAVE_ENEMIES - count;
    (sim as any).spawnEnemy(kind);
    assert.equal(sim.enemies.length, count);
    assert.equal((sim as any).waveSpawned, MAX_WAVE_ENEMIES);
  }
  const saved = defaultDefendSave(); saved.discovered = [...smallKinds]; saved.journalRead = [...smallKinds];
  const decoded = decodeDefendSave(saved)!;
  assert.deepEqual(decoded.discovered, smallKinds);
  assert.deepEqual(decoded.journalRead, smallKinds);
  const html = journalHTML(decoded.discovered);
  for (const kind of smallKinds) assert.ok(html.includes(ENEMIES[kind].name));
});

test('compact fortress art fits each native footprint and shows armor loss, damage and pennants', () => {
  for (const kind of smallKinds) {
    const def = ENEMIES[kind], f = def.fortress!, w = def.size * 8, h = f.height * 8;
    const art = (armor = true, hurt = false, flag = 0) => fortressBodyPixels(f.tier, w, h, armor, hurt, flag, 1);
    const whole = art();
    assert.equal(whole.length, w * h);
    assert.ok(whole.filter(p => p !== 0).length > w * h / 2);
    assert.notDeepEqual(art(false), whole);
    assert.notDeepEqual(art(true, true), whole);
    assert.notDeepEqual(art(true, false, 1), whole);
    assert.deepEqual(art(), whole);
  }
});

test('fortress tiers have growing bodies and independent parts, with one shared species', () => {
  for (const [n, kind] of kinds.entries()) {
    const sim = simulation(); (sim as any).spawnEnemy(kind);
    const core = sim.enemies.find(e => !e.fortressPart)!;
    assert.equal(sim.enemies.length, [9, 15, 21, 27][n]);
    assert.equal(core.fortressParts!.filter(p => p.fortressPart?.role === 'turret').length, 2 + n * 2);
    assert.ok(core.fortressParts!.every(p => p.id !== core.id && p.hp > 0 && enemySize(p) < enemySize(core)));
    assert.equal(new Set(sim.enemies.map(e => e.id)).size, sim.enemies.length);
    assert.equal(ENEMIES[kind].cost, [1000, 10000, 100000, 1000000][n]);
    if (n) assert.ok(enemySize(core) > ENEMIES[kinds[n - 1]].size);
  }
});

test('plates block core damage; destroying legs slows it; breaking parts never harms siblings', () => {
  const sim = simulation(); (sim as any).spawnEnemy('fortressLesser');
  const core = sim.enemies[0], parts = core.fortressParts!, hp = core.hp;
  assert.equal(sim.hurtEnemy(core, 100), false); assert.equal(core.hp, hp);
  const legs = parts.filter(p => p.fortressPart?.role === 'leg');
  const base = enemySpeed(sim, core);
  sim.hurtEnemy(legs[0], 1e9, true, 'melee');
  assert.ok(enemySpeed(sim, core) < base);
  assert.equal(legs[1].hp, legs[1].maxHp);
  for (const leg of legs.slice(1)) sim.hurtEnemy(leg, 1e9, true, 'melee');
  assert.equal(enemySpeed(sim, core), base * .25);
  const armor = parts.filter(p => p.fortressPart?.role === 'armor');
  sim.hurtEnemy(armor[0], 1e9, true, 'melee'); assert.equal(sim.hurtEnemy(core, 100), false);
  sim.hurtEnemy(armor[1], 1e9, true, 'melee'); assert.equal(sim.hurtEnemy(core, 100), true);
  assert.equal(core.hp, hp - 100);
});

test('turrets attack independently, stop when destroyed, and stay attached to movement', () => {
  const sim = simulation(); (sim as any).spawnEnemy('fortressLesser');
  const core = sim.enemies[0], turret = core.fortressParts!.find(p => p.fortressPart?.role === 'turret')!;
  core.x = 10; core.y = 10; syncFortress(core);
  sim.soldiers.push({ id: 100, x: turret.x, y: turret.y + 1, hp: 1000, flash: 0, kind: 'sword' } as any);
  turret.cd = 0; stepEnemy(sim, turret, 1 / 30);
  assert.ok(sim.soldiers[0].hp < 1000);
  const hp = sim.soldiers[0].hp; turret.hp = 0; stepEnemy(sim, turret, 10);
  assert.equal(sim.soldiers[0].hp, hp);
  core.x += 2; core.y += 1; syncFortress(core);
  const alive = core.fortressParts!.find(p => p.hp > 0)!;
  assert.equal(alive.x, core.x + alive.fortressPart!.dx);
  assert.equal(alive.y, core.y + alive.fortressPart!.dy);
});

test('core death cleans up parts and rewards exactly one enemy', () => {
  const sim = simulation(); (sim as any).spawnEnemy('fortressLesser'); const core = sim.enemies[0];
  for (const p of core.fortressParts!) if (p.fortressPart?.role === 'armor') p.hp = 0;
  sim.hurtEnemy(core, 1e9, true, 'melee'); (sim as any).sweepAway();
  assert.equal(sim.enemies.length, 0); assert.equal(sim.slain.fortressLesser, 1);
  assert.equal(sim.corpses.length, 0);
});

test('fortress spawning is atomic at the lifetime cap, and wave reservations include all parts', () => {
  const sim = simulation(); (sim as any).waveSpawned = 4995;
  (sim as any).spawnEnemy('fortressLesser'); assert.equal(sim.enemies.length, 0);
  for (const budget of [1000, 100000, 1000000000000]) {
    const queue = buildDifficultyWave(budget, () => .99);
    const count = queue.reduce((sum, k) => {
      const d = ENEMIES[k], f = d.fortress;
      return sum + (f ? 1 + f.turrets + f.legs + f.armor : d.chainLength ?? d.summonSlots ?? 1 + (d.splits?.count ?? 0));
    }, 0);
    assert.ok(count <= 5000);
  }
});
