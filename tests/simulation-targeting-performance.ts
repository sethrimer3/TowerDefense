/** Frozen-reference simulation comparisons. No renderer or player saves. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { DefendSim } from '../src/defend/sim.ts';
import { blocked, firstSorted, nearest } from '../src/defend/pathing.ts';
import { CELL_COUNT } from '../src/defend/grid.ts';
import { stressScene } from './defend-stress-scene.ts';

const reference = '6707b9f445a7454f4b1a70e243bd80e00b83feda';
const root = `test-results/targeting-reference-${reference}`;
mkdirSync(root, {recursive: true});
const archive = execFileSync('git', ['archive', reference, 'src'], {maxBuffer: 64 * 1024 * 1024});
execFileSync('tar', ['-x', '-C', root], {input: archive});
const {DefendSim: ReferenceSim} = await import(new URL(`../${root}/src/defend/sim.ts`, import.meta.url).href);
const {blocked: originalBlocked} = await import(new URL(`../${root}/src/defend/pathing.ts`, import.meta.url).href);

function compare(a: DefendSim, b: DefendSim) {
  // Clone normalizes distinct class prototypes while retaining Maps, typed
  // arrays, undefined properties and non-finite numbers for exact comparison.
  for (const key of ['time', 'wave', 'enemies', 'soldiers', 'civilians', 'hp', 'maxHp', 'built', 'solid', 'ownSolid', 'foeSolid', 'field',
    'stats', 'slain', 'effects', 'arrows', 'divineArrows', 'wisps', 'shells', 'siegeShots', 'blightLasers', 'plasmaShots', 'plasmaSpheres',
    'flames', 'frosts', 'fireballs', 'mageBolts', 'blazes', 'stabs', 'swings', 'blades', 'nanoShells', 'nanoClouds', 'nanoBursts', 'skyPalaces',
    'bolts', 'ballistaBolts', 'graves', 'corpses', 'floods', 'scorches', 'fortressRubble', 'changed'] as const)
    assert.deepEqual(structuredClone(a[key]), structuredClone(b[key]), key);
  assert.deepEqual(a.blight.exposure, b.blight.exposure);
  for (const key of ['towers', 'barracks', 'wizards', 'darkKeeps'])
    assert.deepEqual(structuredClone((a as any)[key]), structuredClone((b as any)[key]), key);
}
function paired(before: () => void, after: () => void, verify = () => {}, batch = 10) {
  const samples = {before: [] as number[], after: [] as number[]}, tasks = {before, after};
  for (let i = 0; i < 3; i++) { before(); after(); } verify();
  for (let round = 0; round < 9; round++) {
    for (const key of (round % 2 ? ['after', 'before'] : ['before', 'after']) as ('before' | 'after')[]) {
      const start = performance.now();
      for (let i = 0; i < batch; i++) tasks[key]();
      samples[key].push((performance.now() - start) / batch);
    }
    verify();
  }
  return Object.fromEntries(Object.entries(samples).map(([k, values]) => [k, +values.sort((a, b) => a - b)[4].toFixed(4)]));
}
const rows: object[] = [];
for (const [count, heavy] of [[1500, false], [1000, true]] as const) {
  const before = stressScene(count, heavy, ReferenceSim).sim, after = stressScene(count, heavy).sim;
  compare(before, after);
  const ms = paired(() => before.update(1/30), () => after.update(1/30), () => compare(before, after));
  assert.equal(before.rand(), after.rand(), 'next simulation RNG draw');
  rows.push({workload: heavy ? 'mixed siege combat' : 'mixed city combat', enemies: count, soldiers: after.soldiers.length, fixedStepMs: ms});
}
{
  const sim = stressScene(1500).sim, units = sim.soldiers;
  let before: number[] = [], after: number[] = [];
  const ms = paired(() => { before = units.map(s => nearest(sim.enemiesNear(s.x, s.y, 12), s, 144, true)?.id ?? -1); },
    () => { after = units.map(s => sim.nearestEnemy(s.x, s.y, 12)?.id ?? -1); }, () => assert.deepEqual(after, before));
  rows.push({workload: `${units.length} nearest-target queries`, batchMs: ms});
}
{
  const items = Array.from({length: 5000}, (_, id) => ({id, d: id * 137 % 1700}));
  const order = (a: typeof items[number], b: typeof items[number]) => a.d - b.d;
  let before: typeof items = [], after: typeof items = [];
  const ms = paired(() => { before = [...items].sort(order).slice(0, 3); },
    () => { after = firstSorted(items, order, 3); }, () => assert.deepEqual(after, before), 100);
  rows.push({workload: 'choose three from 5000 enemies', selectionMs: ms});
}
{
  const solid = Uint8Array.from({length: CELL_COUNT}, (_, i) => i * 137 % 17 === 0 ? 1 : 0);
  let before = 0, after = 0;
  const ms = paired(() => { before = 0; for (let i = 0; i < 100000; i++) before += +originalBlocked(solid, i * 137 % 6400 / 100, i * 193 % 9200 / 100); },
    () => { after = 0; for (let i = 0; i < 100000; i++) after += +blocked(solid, i * 137 % 6400 / 100, i * 193 % 9200 / 100); },
    () => assert.equal(after, before), 5);
  rows.push({workload: '100000 terrain collision checks', batchMs: ms});
}
const result = {note: `Node warm medians in ms, nine alternating samples; fixed-step native combat with all AI/effects enabled, state comparison after each batch and next RNG draw. Frozen entire src from ${reference}. Component timings are separate from complete-step timings. No drawing or FPS claim.`, rows};
writeFileSync('test-results/simulation-targeting-performance.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
