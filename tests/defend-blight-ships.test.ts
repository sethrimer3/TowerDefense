import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLIGHT_SHIPS, ENEMIES, UPGRADES, type EnemyKind, type BlightShipKind } from '../src/defend/catalog.ts';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { stepBoat, stepFloods, wetAt } from '../src/defend/boats.ts';
import { buildingContactPoint } from '../src/defend/contact.ts';
import { boatPixels } from '../src/defend/boat-art.ts';
import { defaultDefendSave, decodeDefendSave } from '../src/defend/progress.ts';
import { journalHTML } from '../src/defend/journal.ts';
import { buildDifficultyWave } from '../src/defend/waves.ts';

const kinds = Object.keys(BLIGHT_SHIPS) as BlightShipKind[];
function scene(kind: EnemyKind) {
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
  const enemy = (sim as any).newEnemy(kind, 10, 10); sim.enemies.push(enemy);
  return { sim, enemy };
}

test('all eight Blight ships directly inherit their original statistics and water rules', () => {
  assert.equal(kinds.length, 8);
  for (const kind of kinds) {
    const { kind: _kind, name: _name, color: _color, faction, scriptedOnly, description, ...copy } = ENEMIES[kind];
    const { kind: _baseKind, name: _baseName, color: _baseColor, ...source } = ENEMIES[BLIGHT_SHIPS[kind]];
    assert.deepEqual(copy, source);
    assert.notEqual(copy.boat, source.boat, 'copy does not alias mutable water settings');
    assert.equal(faction, 'darkOne'); assert.equal(scriptedOnly, true);
    assert.equal(ENEMIES[kind].color, '#000000'); assert.match(description!, /orange sails/);
  }
  assert.ok(buildDifficultyWave(1e6, () => .6).every(k => !kinds.includes(k as BlightShipKind)));
});

test('Blight movement, wakes, ramming, sinking and winter ice match the original ships', () => {
  for (const kind of kinds) for (const location of ['open', 'house', 'wall', 'keep', 'winter'] as const) {
    const results = [BLIGHT_SHIPS[kind], kind].map(k => {
      const { sim, enemy } = scene(k);
      if (location === 'winter') sim.wave = 101;
      if (location === 'house' || location === 'wall' || location === 'keep') {
        const building = location === 'keep' ? sim.keep : sim.map.buildings.find(b => b.kind === location)!;
        enemy.x = building.rect.x + building.rect.w / 2;
        enemy.y = building.rect.y - ENEMIES[k].size / 2 - .3;
        Object.assign(enemy, buildingContactPoint(sim, enemy, building));
      }
      for (let n = 0; n < 15; n++) { enemy.cd -= 1 / 30; stepBoat(sim, enemy, 1 / 30); stepFloods(sim, 1 / 30); }
      return { x: enemy.x, y: enemy.y, facing: enemy.facing, hp: [...sim.hp], built: [...sim.built], floods: sim.floods,
        sinkings: sim.sinkings, wet: wetAt(sim, enemy.x, enemy.y), frozen: sim.floods.some(f => f.frozen) };
    });
    assert.deepEqual(results[1], results[0], `${kind}: ${location}`);
    if (location === 'winter') assert.ok(results[1].frozen, `${kind} leaves winter ice`);
  }
});

test('every ship heading and rune frame retains the native silhouette with black, orange and red material', () => {
  for (const kind of kinds) {
    let black = 0, orange = 0, red = 0;
    for (let dir = 0; dir < 16; dir++) for (let frame = 0; frame < 4; frame++) {
      const copy = boatPixels(kind, dir, frame), source = boatPixels(BLIGHT_SHIPS[kind], dir, frame);
      assert.equal(copy.w, source.w); assert.equal(copy.h, source.h);
      for (let n = 0; n < copy.data.length; n++) {
        const pixel = copy.data[n]; assert.equal(pixel >>> 24, source.data[n] >>> 24, `${kind}/${dir}/${frame} pixel ${n}`);
        if (!(pixel >>> 24)) continue;
        const r = pixel & 255, g = (pixel >>> 8) & 255, b = (pixel >>> 16) & 255;
        if (r === 0 && g === 0 && b === 0) black++;
        if (r > 150 && g > 50 && g < r * .8 && b < 60) orange++;
        if (r > 100 && g < 110 && r > g * 2 && b > g) red++;
      }
    }
    assert.ok(black > 0 && orange > 0 && red > 0, `${kind}: black ${black}, orange ${orange}, red ${red}`);
  }
});

test('Blight ship kills count once and journal discovery/read state persists with native water descriptions', () => {
  for (const kind of kinds) {
    const { sim, enemy } = scene(kind);
    sim.hurtEnemy(enemy, 1e9, true, 'melee'); (sim as any).sweepAway();
    assert.equal(sim.slain[kind], 1); assert.equal(sim.enemies.length, 0);
    const html = journalHTML([kind]); assert.match(html, new RegExp(ENEMIES[kind].name));
    assert.match(html, ENEMIES[kind].boat!.decorativeWater ? /water is purely visual/ : /Its water sinks/);
  }
  const saved = defaultDefendSave(); saved.discovered = [...kinds]; saved.journalRead = [...kinds];
  const decoded = decodeDefendSave(saved);
  assert.deepEqual(decoded.discovered, kinds); assert.deepEqual(decoded.journalRead, kinds);
});
