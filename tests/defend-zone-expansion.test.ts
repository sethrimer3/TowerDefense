import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, areaForWave, type AreaId } from '../src/defend/areas.ts';
import { AREA_ENEMIES } from '../src/defend/area-enemies.ts';
import { ENEMIES, UPGRADES, type ZoneEnemyKind } from '../src/defend/catalog.ts';
import { buildWave, buildDifficultyWave, waveDifficulty, MAX_WAVE_ENEMIES } from '../src/defend/waves.ts';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { stepEnemy } from '../src/defend/enemies.ts';
import { stepPoison } from '../src/defend/hostile-attacks.ts';
import { defaultDefendSave, decodeDefendSave } from '../src/defend/progress.ts';
import { journalHTML } from '../src/defend/journal.ts';
import { zoneEnemyRows, zoneEnemyPixels } from '../src/defend/zone-enemy-art.ts';
import { stepAbilities } from '../src/defend/enemy-abilities.ts';
import { stepBlazes } from '../src/defend/mages.ts';

const additions: Partial<Record<AreaId, ZoneEnemyKind[]>> = {
  moss: ['briarling', 'mossBoar', 'rootTreant', 'fernMantis', 'mossTroll', 'lanternHornet'],
  desert: ['duneScorpion', 'sunScarab', 'sandVulture', 'glassJackal', 'duneTortoise', 'dustDjinn'],
  ember: ['cinderImp', 'slagGolem', 'emberMoth'],
  drowned: ['brineCrab', 'lanternJelly', 'coralGuardian', 'kelpStalker'],
  fungal: ['sporeling', 'fungalBrute', 'sporeMoth', 'capCrawler', 'myceliumHulk', 'rotMite'],
  crystal: ['shardling', 'crystalSentinel', 'prismRay', 'geodeCrab', 'prismMoth', 'shardBrood'],
  obsidian: ['cryptHound', 'graveWisp'],
  astral: ['starWisp', 'cometHound', 'astralWarden', 'novaMoth'],
};
const kinds = Object.values(additions).flat();
function fixture() {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9;
  return sim;
}

test('every themed zone has at least fifteen species and all native additions appear on their first visit', () => {
  for (const area of AREAS) {
    const expected = additions[area.id];
    assert.equal(new Set(AREA_ENEMIES[area.id]).size, AREA_ENEMIES[area.id].length);
    assert.ok(AREA_ENEMIES[area.id].length >= 15, `${area.name} roster remains sparse`);
    if (!expected) continue;
    // Costs must be affordable immediately; selection also depends on the
    // wave's exact spendable remainder, so probe the whole first zone visit.
    for (const kind of expected) {
      assert.ok(AREA_ENEMIES[area.id].includes(kind));
      assert.ok(AREA_ENEMIES.nadir.includes(kind));
      assert.ok(AREAS.filter(a => a.id !== area.id && a.id !== 'nadir').every(a => !AREA_ENEMIES[a.id].includes(kind)));
      const wave = AREAS.indexOf(area) * 20 + 1;
      assert.equal(areaForWave(wave).id, area.id);
      assert.ok(ENEMIES[kind].cost <= waveDifficulty(wave));
      let selected = false;
      const rolls = AREA_ENEMIES[area.id].length * 2;
      for (let n = wave; n < wave + 20 && !selected; n++) {
        for (let r = 0; r < rolls && !selected; r++) selected = buildWave(n, () => (r + .5) / rolls).includes(kind);
      }
      assert.ok(selected, `${kind} appears on its first zone visit`);
    }
  }
});

test('unspendable Astral remainders retain random choice instead of excluding brood enemies', () => {
  const wave = 161, budget = waveDifficulty(wave);
  assert.notEqual(budget % 50, 0);
  const affordable = AREA_ENEMIES.astral.filter(k => ENEMIES[k].cost <= budget);
  const roll = (affordable.indexOf('novaMoth') + .5) / affordable.length;
  const mix = buildWave(wave, () => roll);
  assert.equal(mix[0], 'novaMoth');
  assert.notEqual(buildWave(wave, () => 0)[0], mix[0]);
  const spent = mix.reduce((sum, k) => sum + ENEMIES[k].cost, 0);
  assert.ok(spent <= budget && budget - spent < 150);
});

test('new splitting enemies reserve their entire brood and respect the runtime cap', () => {
  for (const kind of ['rootTreant', 'fungalBrute', 'shardBrood', 'novaMoth'] as const) {
    const def = ENEMIES[kind], child = def.splits!.into;
    const wave = buildDifficultyWave(def.cost * MAX_WAVE_ENEMIES, () => 0, [kind]);
    assert.equal(wave.length, Math.floor(MAX_WAVE_ENEMIES / (1 + def.splits!.count)));
    const sim = fixture(), parent = sim.spawnAuxiliary(kind, 10, 10)!;
    sim.hurtEnemy(parent, def.hp + 1, true, 'melee');
    (sim as any).sweepAway();
    assert.equal(sim.enemies.length, def.splits!.count);
    assert.ok(sim.enemies.every(e => e.kind === child && e.hp === ENEMIES[child].hp));
    assert.equal(sim.slain[kind], 1);
    (sim as any).sweepAway(); assert.equal(sim.slain[kind], 1);
    const capped = fixture(), last = capped.spawnAuxiliary(kind, 10, 10)!;
    (capped as any).waveSpawned = MAX_WAVE_ENEMIES - 1;
    last.hp = 0; (capped as any).sweepAway();
    assert.equal(capped.enemies.length, 1);
    assert.equal((capped as any).waveSpawned, MAX_WAVE_ENEMIES);
  }
});

test('new shield supports protect only within reach and remain vulnerable to melee', () => {
  for (const kind of kinds.filter(k => ENEMIES[k].shield)) {
    const sim = fixture(), def = ENEMIES[kind];
    const shield = sim.spawnAuxiliary(kind, 10, 10)!;
    const nearby = sim.spawnAuxiliary('briarling', 10.5, 10)!;
    const outside = sim.spawnAuxiliary('briarling', 10 + def.shield!.radius + 1, 10)!;
    assert.equal(sim.hurtEnemy(nearby, 5), false); assert.equal(nearby.hp, ENEMIES.briarling.hp);
    assert.equal(shield.shieldHp, def.shield!.hp - 5);
    sim.hurtEnemy(outside, 3); assert.equal(outside.hp, ENEMIES.briarling.hp - 3);
    sim.hurtEnemy(shield, 7, true, 'melee'); assert.equal(shield.hp, def.hp - 7);
    sim.hurtEnemy(nearby, def.shield!.hp); assert.equal(shield.shieldHp, 0);
    sim.hurtEnemy(nearby, 3); assert.equal(nearby.hp, ENEMIES.briarling.hp - 3);
  }
});

test('venom and spore carriers harm nearby people while sparing distant archers and buildings', () => {
  for (const kind of kinds.filter(k => ENEMIES[k].poison)) {
    const sim = fixture(), def = ENEMIES[kind];
    sim.spawnAuxiliary(kind, 10, 10);
    sim.soldiers.push({ id: 100, x: 10.1, y: 10, hp: 100, kind: 'sword', flash: 0 } as any,
      { id: 101, x: 10 + def.poison!.radius + 1, y: 10, hp: 100, kind: 'archer', flash: 0 } as any);
    sim.civilians.push({ id: 102, x: 10, y: 10.1, hp: 100, flash: 0 } as any);
    const buildings = [...sim.hp];
    stepPoison(sim, .05);
    assert.equal(sim.soldiers[0].hp, 100 - def.poison!.damage);
    assert.equal(sim.civilians.at(-1)!.hp, 100 - def.poison!.damage);
    assert.equal(sim.soldiers[1].hp, 100);
    assert.deepEqual([...sim.hp], buildings);
  }
});

test('new fliers cross standing walls and strike the keep', () => {
  for (const kind of kinds.filter(k => ENEMIES[k].flying)) {
    const sim = fixture(); sim.soldiers.length = sim.civilians.length = 0;
    // Solid cells everywhere: flying movement must ignore this obstruction.
    sim.solid.fill(1);
    const e = sim.spawnAuxiliary(kind, sim.keep.rect.x + 1.5, sim.keep.rect.y - 4)!;
    const startY = e.y, hp = sim.hp[sim.keepId];
    for (let n = 0; n < 100; n++) stepEnemy(sim, e, 1 / 30);
    assert.ok(e.y > startY); assert.ok(sim.hp[sim.keepId] < hp, kind);
  }
});

test('every addition persists discovery and has journal counterplay and finite kill counts', () => {
  const save = defaultDefendSave(); save.discovered = kinds;
  assert.deepEqual([...decodeDefendSave(save).discovered].sort(), [...kinds].sort());
  const html = journalHTML(kinds);
  for (const kind of kinds) {
    assert.ok(html.includes(ENEMIES[kind].name));
    assert.ok(html.includes(ENEMIES[kind].description!));
    const sim = fixture(), e = sim.spawnAuxiliary(kind, 10, 10)!;
    sim.hurtEnemy(e, e.maxHp * 2 + 1, true, 'melee'); (sim as any).sweepAway();
    assert.equal(sim.slain[kind], 1, kind);
  }
});

test('regenerating species recover with battle time, cap at maximum HP, and never revive', () => {
  for (const kind of kinds.filter(k => ENEMIES[k].regeneration)) {
    const sim = fixture(), e = sim.spawnAuxiliary(kind, 10, 10)!;
    e.hp = e.maxHp - 20;
    stepAbilities(sim, e, .5);
    assert.equal(e.hp, e.maxHp - 20 + ENEMIES[kind].regeneration! * .5);
    const before = e.hp;
    for (const dt of [0, -1, NaN, Infinity]) { stepAbilities(sim, e, dt); assert.equal(e.hp, before); }
    stepAbilities(sim, e, 100); assert.equal(e.hp, e.maxHp);
    e.hp = 0; stepAbilities(sim, e, 100); assert.equal(e.hp, 0);
    assert.ok(journalHTML([kind]).includes(`Regenerates ${ENEMIES[kind].regeneration} HP per battle second`));
  }
  const sim = fixture(), normal = sim.spawnAuxiliary('orc', 10, 10)!;
  normal.hp = 10; stepAbilities(sim, normal, 1); assert.equal(normal.hp, 10);
});

test('shells and forge creatures apply only their explicit elemental resistance and weakness', () => {
  for (const kind of kinds.filter(k => ENEMIES[k].damageScale)) {
    for (const element of ['physical', 'fire', 'explosion'] as const) {
      const sim = fixture(), e = sim.spawnAuxiliary(kind, 10, 10)!;
      const scale = ENEMIES[kind].damageScale?.[element] ?? 1;
      const result = sim.hurtEnemy(e, 10, true, 'melee', undefined, false, element);
      assert.equal(e.hp, e.maxHp - 10 * scale, `${kind}/${element}`);
      assert.equal(result, scale > 0);
      assert.equal(sim.stats.current.dealt, 10 * scale);
    }
  }
});

test('elemental defenses cover real burning ground, lingering burns, explosions and shield ordering', () => {
  const sim = fixture(), golem = sim.spawnAuxiliary('slagGolem', 10, 10)!;
  sim.blazes.push({ x: 10, y: 10, r: 1, t: 0, life: 10, dps: 10, seed: 1 });
  stepBlazes(sim, 1); assert.equal(golem.hp, golem.maxHp);
  golem.burn = 1; golem.burnDps = 10; (sim as any).tick(.5);
  assert.equal(golem.hp, golem.maxHp);
  sim.explode(10, 10, { r: 1, damage: 10, friendlyFire: false });
  assert.equal(golem.hp, golem.maxHp - 15);
  const shield = sim.spawnAuxiliary('sunScarab', 10, 10)!;
  sim.hurtEnemy(golem, 10, true, 'ranged', undefined, false, 'fire');
  assert.equal(shield.shieldHp, 40); assert.equal(golem.hp, golem.maxHp - 15);
  shield.hp = 0;
  const crab = sim.spawnAuxiliary('geodeCrab', 15, 10)!;
  sim.explode(15, 10, { r: 1, damage: 10, friendlyFire: false });
  assert.equal(crab.hp, crab.maxHp - 20);
});

test('all new native sprites have distinct silhouettes and preserve coverage when damaged or hit', () => {
  const silhouettes = new Set<string>();
  for (const kind of kinds) {
    const rows = zoneEnemyRows(kind)!;
    assert.ok(rows.every(row => /^[ OHMDEA]+$/.test(row)));
    const normal = zoneEnemyPixels(kind), hurt = zoneEnemyPixels(kind, true), flash = zoneEnemyPixels(kind, false, true);
    const mask = [...normal.data].map(v => v ? 1 : 0);
    assert.ok(mask.filter(Boolean).length > 20);
    assert.deepEqual([...hurt.data].map(v => v ? 1 : 0), mask);
    assert.deepEqual([...flash.data].map(v => v ? 1 : 0), mask);
    assert.notDeepEqual(hurt.data, normal.data);
    assert.ok([...flash.data].every(v => v === 0 || v === 0xffffffff));
    silhouettes.add(`${normal.w}:${normal.h}:${mask.join('')}`);
  }
  assert.equal(silhouettes.size, kinds.length);
});
