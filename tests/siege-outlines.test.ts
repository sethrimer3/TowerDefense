import test from 'node:test';
import assert from 'node:assert/strict';
import { siegeSides, ENEMY_INK, FRIEND_INK } from '../src/campaign/siege-colors.ts';
test('Side outline channels include only their own original native unit ids', () => {
  const sides = siegeSides([{ id: 1 }, { id: 7 }, { id: 9 }], [{ id: 2 }, { id: 8 }]);
  const red = [], blue = [], plain = [];
  for (const id of [1, 2, 3, 7, 8, 9, 10000001]) {
    const ink = sides.ink(id);
    (ink === ENEMY_INK ? red : ink === FRIEND_INK ? blue : plain).push(id);
  }
  assert.deepEqual(red, [2, 8]); assert.deepEqual(blue, [1, 7, 9]);
  assert.deepEqual(plain, [3, 10000001], 'Civilians and buildings keep their ordinary ink');
});
