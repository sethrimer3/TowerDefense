import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundary, CircleTransition, formation, TESSERACT_EDGES, tesseract, voronoi, type CircleState } from '../src/magic-circle/formation.ts';
import { studyCircle } from '../src/magic-circle/progression.ts';
import { specialtyCircle } from '../src/ui/specialty.ts';
import { defaults, decode } from '../src/save.ts';
import { SUBJECTS } from '../src/upgrade-subjects.ts';

const base: CircleState = { topic: 'study:meteor', upgrades: [] };
test('formations are deterministic, order independent, and undo restores exact geometry', () => {
  const initial = formation(base);
  const upgrades = [{ id: 'starfall', rank: 2 }, { id: 'moltenCore', rank: 1 }];
  const changed = formation({ ...base, upgrades });
  assert.notDeepEqual(initial, changed);
  assert.deepEqual(changed, formation({ ...base, upgrades: [...upgrades].reverse() }));
  assert.deepEqual(initial, formation({ ...base, upgrades: [{ id: 'starfall', rank: 0 }] }));
  assert.deepEqual(changed, formation(JSON.parse(JSON.stringify({ ...base, upgrades }))));
  assert.notDeepEqual(formation({ ...base, upgrades: [{ id: 'starfall', rank: 1 }] }), formation({ ...base, upgrades: [{ id: 'moltenCore', rank: 1 }] }));
  assert.notDeepEqual(initial, formation({ ...base, topic: 'study:frostNova' }));
});
test('a rank evolves persistent sites rather than replacing their seed', () => {
  const a = formation(base), b = formation({ ...base, upgrades: [{ id: 'starfall', rank: 1 }] });
  a.sites.forEach((p, i) => assert.ok(Math.hypot(p.x - b.sites[i].x, p.y - b.sites[i].y) < 0.12));
});
test('Voronoi cells are clipped to their region and every vertex is nearest its own site', () => {
  const sites = formation(base).sites.slice(0, 27), cells = voronoi(sites);
  assert.equal(cells.length, sites.length);
  cells.forEach((cell, i) => {
    assert.ok(cell.length >= 3);
    for (const p of cell) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Math.hypot(p.x, p.y) < 0.861);
      const own = Math.hypot(p.x - sites[i].x, p.y - sites[i].y);
      for (const s of sites) assert.ok(own <= Math.hypot(p.x - s.x, p.y - s.y) + 1e-7);
    }
    const inset = cell.map(p => ({ x: p.x * 0.8 + sites[i].x * 0.2, y: p.y * 0.8 + sites[i].y * 0.2 }));
    assert.ok(voronoi([sites[i]], inset)[0].length >= 3);
  });
  assert.deepEqual(voronoi([]), []);
  assert.equal(boundary().length, 48);
});
test('tesseract has exactly 16 finite projected vertices and 32 unique hypercube edges', () => {
  assert.equal(TESSERACT_EDGES.length, 32);
  assert.equal(new Set(TESSERACT_EDGES.map(e => e.join(':'))).size, 32);
  for (const [a, b] of TESSERACT_EDGES) assert.ok([1, 2, 4, 8].includes(a ^ b));
  const d = formation(base);
  for (let time = 0; time < 300; time += 0.73) {
    const v = tesseract(time, d); assert.equal(v.length, 16);
    for (const p of v) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Math.hypot(p.x, p.y) < 1);
  }
});
test('interrupted transitions start at the currently displayed formation and settle exactly', () => {
  const a = formation(base), b = formation({ ...base, upgrades: [{ id: 'starfall', rank: 3 }] });
  const t = new CircleTransition(a); t.retarget(b); t.step(0.6);
  const before = t.current; t.retarget(a);
  assert.deepEqual(t.step(0), before);
  for (let i = 0; i < 80; i++) for (const p of t.step(0.03).sites) assert.ok(Number.isFinite(p.x + p.y));
  assert.equal(t.active, false); assert.deepEqual(t.current, a);
  t.retarget(b); assert.deepEqual(t.step(0, true), b); assert.equal(t.pulse, 0);
});
test('large, malformed and unusual ranks remain bounded without exceptions', () => {
  const d = formation({ topic: 'unusual', upgrades: Array.from({ length: 2000 }, (_, i) => ({ id: String(i), rank: i % 9 === 0 ? Infinity : i ** 4 })) });
  assert.ok(d.rings >= 3 && d.rings <= 7 && d.symmetry >= 4 && d.symmetry <= 12);
  for (const p of d.sites) assert.ok(Number.isFinite(p.x + p.y) && Math.hypot(p.x, p.y) < 0.881);
  for (const poly of voronoi(d.sites)) for (const p of poly) assert.ok(Number.isFinite(p.x + p.y));
});
test('Study adapter uses only displayed completed Knowledge; save format is unchanged', () => {
  const save = defaults(), topic = SUBJECTS.flatMap(s => s.topics).find(t => t.id === 'meteor')!;
  const before = formation(studyCircle(save, topic));
  save.knowledge = 999999; save.skills.masonry = 2;
  assert.deepEqual(formation(studyCircle(save, topic)), before);
  save.pathResearch.starfall = { rank: 2, spent: 10 };
  const changed = formation(studyCircle(save, topic)); assert.notDeepEqual(changed, before);
  assert.deepEqual(formation(studyCircle(decode(JSON.stringify(save)), topic)), changed);
  delete save.pathResearch.starfall;
  assert.deepEqual(formation(studyCircle(save, topic)), before);
});
test('building and keep identity reflects its own paths, reverses respec, and separates families', () => {
  const plain = formation(specialtyCircle('wizardTower'));
  const fire = formation(specialtyCircle('wizardTower', { path: 'pyromancy', rank: 2 }));
  assert.notDeepEqual(plain, fire);
  assert.notDeepEqual(fire, formation(specialtyCircle('wizardTower', { path: 'rime', rank: 2 })));
  assert.deepEqual(plain, formation(specialtyCircle('wizardTower', undefined)));
  assert.notDeepEqual(plain, formation(specialtyCircle('barracks')));
  assert.notDeepEqual(formation(specialtyCircle('keep')), formation(specialtyCircle('keep', undefined, { arrowLoops: 2 })));
});
