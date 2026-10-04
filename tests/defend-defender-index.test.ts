import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefenderIndex } from '../src/defend/defender-index.ts';
import type { Soldier, Civilian } from '../src/defend/sim.ts';

const unit = (id: number, x: number, y: number, hp = 10) => ({ id, x, y, hp }) as Soldier;
const linear = (soldiers: Soldier[], civilians: Civilian[], x: number, y: number, r: number) => {
  let best: Soldier | Civilian | null = null, distance = r * r;
  for (const u of [...soldiers, ...civilians]) {
    const d = (u.x - x) ** 2 + (u.y - y) ** 2;
    if (u.hp > 0 && d <= distance) { best = u; distance = d; }
  }
  return best;
};

test('defender index preserves distance boundaries and last-wins ties across buckets and teams', () => {
  const index = new DefenderIndex();
  const soldiers = [unit(99, 3, 4), unit(1, 5, 4), unit(2, 4, 3, 0)];
  const civilians = [unit(0, 4, 5)] as unknown as Civilian[];
  index.rebuild(soldiers, civilians);
  assert.equal(index.nearest(4, 4, 1), civilians[0]);
  civilians[0].hp = 0;
  assert.equal(index.nearest(4, 4, 1), soldiers[1], 'same-phase deaths are live');
  soldiers[1].hp = 0;
  assert.equal(index.nearest(4, 4, 1), soldiers[0]);
  assert.equal(index.nearest(4, 4, .999), null);
  assert.equal(index.nearest(3, 4, 0), soldiers[0]);
  soldiers[0].x = 30;
  index.rebuild(soldiers, civilians);
  assert.equal(index.nearest(3, 4, 1), null, 'old buckets are cleared');
  assert.equal(index.nearest(30, 4, 0), soldiers[0]);
  index.rebuild([], []);
  assert.equal(index.nearest(30, 4, 200), null);
});

test('defender index matches a linear scan across dense, sparse and off-board queries', () => {
  const index = new DefenderIndex();
  for (let count of [0, 1, 16, 88, 500]) {
    const soldiers = Array.from({length:count}, (_,i)=>unit(i, ((i*137)%680)/10-2, ((i*193)%940)/10-2, i%11 ? 10 : 0));
    const civilians = soldiers.splice(Math.floor(count*.7)) as unknown as Civilian[];
    index.rebuild(soldiers, civilians);
    for (let i=0;i<300;i++) {
      const x=((i*97)%800)/10-5, y=((i*157)%1050)/10-5;
      for (const r of [0,.9,1.6,5,12,100,-2]) assert.equal(index.nearest(x,y,r),linear(soldiers,civilians,x,y,r));
    }
  }
});
