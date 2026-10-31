import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundary, CircleTransition, formation, growingVoronoi, mix, nestedTriangles, TESSERACT_EDGES, tesseract, voronoi, type CircleState } from '../src/magic-circle/formation.ts';
import { studyCircle } from '../src/magic-circle/progression.ts';
import { specialtyCircle } from '../src/ui/specialty.ts';
import { defaults, decode } from '../src/save.ts';
import { SUBJECTS } from '../src/upgrade-subjects.ts';

const base: CircleState = { topic: 'study:meteor', upgrades: [] };
test('completed Knowledge steadily increases every complexity layer across paths', () => {
  for (const id of ['path:crusaders', 'path:storm', 'keep:arrowLoops', 'path:starfall']) {
    let previous = formation(base);
    assert.equal(previous.knowledge, 0);
    assert.equal(previous.recursion, 0);
    for (let rank = 1; rank <= 40; rank++) {
      const next = formation({ ...base, upgrades: [{ id, rank }] });
      assert.equal(next.knowledge, rank);
      for (const key of ['rings', 'symmetry', 'detail', 'recursion', 'energy', 'siteCount', 'triangleCount'] as const)
        assert.ok(next[key] >= previous[key], `${id} rank ${rank} cannot reduce ${key}`);
      assert.ok(next.detail > previous.detail && next.rings > previous.rings);
      previous = next;
    }
  }
});
test('identity and equipped choices shape circles without granting extra Knowledge', () => {
  const equipped = [{ id: 'equipped:starfall', rank: 1, visualOnly: true }];
  const changed = formation({ ...base, upgrades: equipped });
  assert.notDeepEqual(changed, formation(base));
  assert.equal(changed.knowledge, 0);
  assert.equal(changed.rings, formation(base).rings);
  const ranks = [...equipped, { id: 'path:starfall', rank: 2 }, { id: 'path:starfall', rank: 1 }];
  assert.equal(formation({ ...base, upgrades: ranks }).knowledge, 2);
  assert.deepEqual(formation({ ...base, upgrades: ranks }), formation({ ...base, upgrades: [...ranks].reverse() }));
  const save = defaults(), topic = SUBJECTS.flatMap(s => s.topics).find(t => t.id === 'meteor')!;
  save.pathResearch.starfall = { rank: 2, spent: 10 };
  const learned = formation(studyCircle(save, topic));
  save.spellPaths.meteor = 'starfall';
  assert.equal(formation(studyCircle(save, topic)).knowledge, learned.knowledge);
});
test('buildings retain all earlier Knowledge through transformations and merges', () => {
  const mage = formation(specialtyCircle('stormTower', { path: 'storm', rank: 3 }));
  const crown = formation(specialtyCircle('darkKeep'));
  assert.equal(mage.knowledge, 5); // Two tower transformations and three path ranks.
  assert.equal(crown.knowledge, mage.knowledge + 9); // All three Wizard towers' branches, merged.
  assert.ok(crown.rings > mage.rings && crown.siteCount >= mage.siteCount);
  const early = formation(specialtyCircle('meleeGuild'));
  const barracks = formation(specialtyCircle('barracks'));
  const trained = formation(specialtyCircle('chapterHouse', { path: 'crusaders', rank: 3 }));
  assert.equal(early.knowledge, 0); assert.equal(barracks.knowledge, 1); assert.equal(trained.knowledge, 5);
  const plain = formation(specialtyCircle('revolutionary'));
  const shared = formation(specialtyCircle('revolutionary', undefined, undefined, undefined, undefined, undefined, { chain: 2, squad: 1 }));
  assert.equal(shared.knowledge, plain.knowledge + 3);
  assert.ok(shared.rings > plain.rings);
  assert.deepEqual(formation(specialtyCircle('meleeGuild')), early);
});
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
  const fire = formation(specialtyCircle('pyreTower', { path: 'pyromancy', rank: 2 }));
  assert.notDeepEqual(plain, fire);
  assert.notDeepEqual(fire, formation(specialtyCircle('frostTower', { path: 'rime', rank: 2 })));
  assert.deepEqual(plain, formation(specialtyCircle('wizardTower', undefined)));
  assert.notDeepEqual(plain, formation(specialtyCircle('barracks')));
  assert.notDeepEqual(formation(specialtyCircle('keep')), formation(specialtyCircle('keep', undefined, { arrowLoops: 2 })));
});

test('city, strike spells, infantry and towers select distinct motif families', () => {
  const save = defaults(), topics = SUBJECTS.flatMap(s => s.topics);
  for (const id of ['meteor', 'necromancy', 'frostNova', 'reinforcements'])
    assert.equal(studyCircle(save, topics.find(t => t.id === id)!).motif, 'triangles');
  for (const id of ['walls', 'spikes', 'repairShop', 'bait'])
    assert.equal(studyCircle(save, topics.find(t => t.id === id)!).motif, 'tesseract');
  for (const id of ['troops', 'towers', 'barracks', 'wizardTower'])
    assert.equal(studyCircle(save, topics.find(t => t.id === id)!).motif, 'voronoi');
  for (const kind of ['keep', 'walls', 'wallSpikes', 'monsterBait'] as const)
    assert.equal(specialtyCircle(kind).motif, 'tesseract');
  for (const kind of ['meleeGuild', 'barracks', 'assassinDen', 'rangedGuild', 'archerBarracks', 'wizardTower', 'watchTower', 'cannonTower', 'darkKeep'] as const)
    assert.equal(specialtyCircle(kind).motif, 'voronoi');
});
test('nested triangles are inscribed on parent edges and stay finite while animated', () => {
  const d = formation({ ...base, motif: 'triangles' });
  for (const time of [0, 1, 35, 5000]) {
    const triangles = nestedTriangles(d, time); assert.equal(triangles.length, d.triangleCount);
    for (let i = 1; i < triangles.length; i++) for (let j = 0; j < 3; j++) {
      const p = triangles[i][j], a = triangles[i-1][j], b = triangles[i-1][(j+1)%3];
      assert.ok(Number.isFinite(p.x + p.y));
      assert.ok(Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x)) < 1e-10);
      const dot = (p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y);
      assert.ok(dot > 0 && dot < (b.x-a.x)**2+(b.y-a.y)**2);
    }
  }
});
test('motif changes crossfade and can reverse without snapping or retaining the wrong layer', () => {
  const city = formation({ ...base, motif: 'tesseract' }), spell = formation({ ...base, motif: 'triangles' });
  const t = new CircleTransition(city); t.retarget(spell); t.step(0.8);
  assert.ok(t.current.motifs.tesseract > 0 && t.current.motifs.triangles > 0);
  assert.equal(t.current.motifs.voronoi, 0);
  const displayed = t.current; t.retarget(city); assert.deepEqual(t.step(0), displayed);
  assert.deepEqual(t.step(2).motifs, { tesseract: 1, triangles: 0, voronoi: 0 });
});

const area = (p: {x:number;y:number}[]) => Math.abs(p.reduce((sum, a, i) => {
  const b = p[(i+1)%p.length]; return sum + a.x*b.y-a.y*b.x;
}, 0))/2;
test('Knowledge ranks change Voronoi and triangle counts, shapes, and restore exact targets on undo', () => {
  const a = formation({ ...base, upgrades: [] });
  const b = formation({ ...base, upgrades: [{ id: 'path:starfall', rank: 1 }] });
  const c = formation({ ...base, upgrades: [{ id: 'path:starfall', rank: 2 }] });
  assert.ok(b.siteCount > a.siteCount && c.siteCount > b.siteCount);
  assert.ok(b.triangleCount > a.triangleCount && c.triangleCount > b.triangleCount);
  assert.notDeepEqual(a.triangleCorners, b.triangleCorners);
  assert.notDeepEqual(a.triangleInsets, b.triangleInsets);
  assert.notDeepEqual(a.sites, b.sites);
  assert.notDeepEqual(nestedTriangles(a)[0], nestedTriangles(b)[0]);
  for (const cap of [19,27,37]) assert.ok(growingVoronoi(b,cap).cells.length > growingVoronoi(a,cap).cells.length);
  const t = new CircleTransition(a); t.retarget(b); t.step(0.5);
  assert.ok(t.current.siteCount > a.siteCount && t.current.siteCount < b.siteCount);
  assert.ok(t.current.triangleCount > a.triangleCount && t.current.triangleCount < b.triangleCount);
  const displayed = t.current; t.retarget(a); assert.deepEqual(t.step(0), displayed);
  assert.deepEqual(t.step(2), a);
});
test('new Voronoi cells grow continuously from zero area and preserve the tessellated area', () => {
  const d = formation(base), n = 15;
  const before = growingVoronoi({ ...d, siteCount: n });
  const born = growingVoronoi({ ...d, siteCount: n + 0.00001 });
  assert.ok(area(born.cells[n]) < 1e-6);
  let previous = 0;
  for (let i = 1; i <= 100; i++) {
    const shape = growingVoronoi({ ...d, siteCount: n + i/100 });
    const size = area(shape.cells[n]); assert.ok(size + 1e-9 >= previous); previous = size;
    assert.ok(Math.abs(shape.cells.reduce((sum,c)=>sum+area(c),0)-area(boundary())) < 1e-6);
    for (const cell of shape.cells) for (const p of cell) assert.ok(Number.isFinite(p.x+p.y) && Math.hypot(p.x,p.y)<0.861);
  }
  assert.ok(previous > 0.001);
  assert.deepEqual(growingVoronoi({ ...d, siteCount:n+1 }).cells, voronoi(d.sites.slice(0,n+1)));
  assert.deepEqual(before.cells, voronoi(d.sites.slice(0,n)));
});
test('triangle count changes preserve layer correspondence and their corners remain inscribed during morphs', () => {
  const a = formation(base), b = formation({ ...base, upgrades:[{id:'path:moltenCore',rank:3}] });
  for (let i=0;i<=40;i++) {
    const d = mix(a,b,i/40), triangles = nestedTriangles(d);
    assert.equal(triangles.length, Math.ceil(d.triangleCount));
    for(let layer=1;layer<triangles.length;layer++) for(let corner=0;corner<3;corner++) {
      const p=triangles[layer][corner], x=triangles[layer-1][corner], y=triangles[layer-1][(corner+1)%3];
      assert.ok(Math.abs((p.x-x.x)*(y.y-x.y)-(p.y-x.y)*(y.x-x.x))<1e-10);
    }
  }
});
