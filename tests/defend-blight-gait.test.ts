import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gaitPosition, gaitPeriod, lurches, BLIGHT_GAIT } from '../src/defend/blight-gait.ts';
import { ART } from '../src/defend/art-scale.ts';
import type { Enemy } from '../src/defend/sim.ts';

const darkling = (id: number, x = 3, y = 4) => ({ id, kind: 'darkling', x, y }) as unknown as Enemy;

test('Darklings lurch on the art-pixel lattice and pause between lurches', () => {
  const e = darkling(7);
  const period = gaitPeriod(e), dt = period / 40;
  const drawn: number[] = [];
  for (let t = 0; t < period * 6; t += dt) {
    e.x = 3 + t * 1.3;
    const p = gaitPosition(e, t);
    // Corner of a three-pixel drawn body sits on a whole art pixel.
    assert.ok(Math.abs((p.x * ART - 1.5) - Math.round(p.x * ART - 1.5)) < 1e-9);
    drawn.push(p.x);
  }
  const still = drawn.filter((x, i) => i > 0 && x === drawn[i - 1]).length;
  assert.ok(still > drawn.length * (1 - BLIGHT_GAIT.lurch) * 0.8, `held ${still} of ${drawn.length} frames`);
  assert.ok(drawn.at(-1)! > drawn[0] + 0.5, 'still makes progress');
  // Never far behind the body.
  assert.ok(Math.abs(drawn.at(-1)! - e.x) < period * 1.3 * 1.2 + 1 / ART);
});

test('Without a time, and for worms, the body position is drawn', () => {
  const e = darkling(1, 2.37, 5.11);
  assert.equal(gaitPosition(e, undefined), e);
  const worm = { id: 2, kind: 'blightWorm', x: 1.23, y: 4.56 } as unknown as Enemy;
  assert.equal(lurches(worm), false);
  assert.equal(gaitPosition(worm, 3), worm);
});
