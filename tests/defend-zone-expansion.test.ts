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

const additions: Partial<Record<AreaId, ZoneEnemyKind[]>> = {
  moss: ['briarling', 'mossBoar', 'rootTreant'],
  desert: ['duneScorpion', 'sunScarab', 'sandVulture'],
  drowned: ['brineCrab', 'lanternJelly', 'coralGuardian'],
  fungal: ['sporeling', 'fungalBrute', 'sporeMoth'],
  crystal: ['shardling', 'crystalSentinel', 'prismRay'],
  astral: ['starWisp', 'cometHound', 'astralWarden'],
};
const kinds = Object.values(additions).flat();
function fixture() {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9;
  return sim;
}

test('six sparse zones gain three exclusive species that can appear on their first visit', () => {
  for (const area of AREAS) {
    const expected = additions[area.id];
    assert.equal(new Set(AREA_ENEMIES[area.id]).size, AREA_ENEMIES[area.id].length);
    if (!expected) continue;
    assert.ok(AREA_ENEMIES[area.id].length >= 12);
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

test('new splitting enemies reserve their entire brood and respect the runtime cap', () => {
  for (const kind of ['rootTreant', 'fungalBrute'] as const) {
    const def = ENEMIES[kind], child = def.splits!.into;
    const wave = buildDifficultyWave(def.cost * MAX_WAVE_ENEMIES, () => 0, [kind]);
    assert.equal(wave.length, MAX_WAVE_ENEMIES / 4);
    const sim = fixture(), parent = sim.spawnAuxiliary(kind, 10, 10)!;
    sim.hurtEnemy(parent, def.hp + 1, true, 'melee');
    (sim as any).sweepAway();
    assert.equal(sim.enemies.length, 3);
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
  for (const kind of ['sunScarab', 'coralGuardian', 'crystalSentinel', 'prismRay', 'astralWarden'] as const) {
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
  for (const kind of ['duneScorpion', 'lanternJelly', 'sporeling', 'sporeMoth'] as const) {
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
  for (const kind of ['sandVulture', 'lanternJelly', 'sporeMoth', 'prismRay', 'starWisp'] as const) {
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
  assert.deepEqual(decodeDefendSave(save).discovered, kinds);
  const html = journalHTML(kinds);
  for (const kind of kinds) {
    assert.ok(html.includes(ENEMIES[kind].name));
    assert.ok(html.includes(ENEMIES[kind].description!));
    const sim = fixture(), e = sim.spawnAuxiliary(kind, 10, 10)!;
    sim.hurtEnemy(e, e.maxHp + 1, true, 'melee'); (sim as any).sweepAway();
    assert.equal(sim.slain[kind], 1);
  }
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
