import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefenderIndex } from '../src/defend/defender-index.ts';
import type { Soldier, Civilian } from '../src/defend/sim.ts';
import { defenderSize } from '../src/defend/unit-bodies.ts';

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

test('body contact queries preserve team order, hidden bodies, edges and live deaths', () => {
  const index = new DefenderIndex();
  const soldiers = Array.from({length:160}, (_,i) => ({ ...unit(i, (i*137%680)/10, (i*193%1000)/10), kind: i%3 ? 'sword' : 'hero', ...(i%5 ? {} : {cloak:0}) })) as Soldier[];
  const civilians = Array.from({length:40}, (_,i) => unit(i+160, (i*173%680)/10, (i*127%1000)/10)) as unknown as Civilian[];
  index.rebuild(soldiers,civilians,true);
  for(let i=0;i<200;i++) {
    const x=(i*97%720)/10, y=(i*157%1040)/10, margin=(i%5)/8;
    const want=[...soldiers,...civilians].filter(u => { const r=margin+defenderSize(u)/2+1e-9; return u.hp>0 && Math.abs(u.x-x)<=r && Math.abs(u.y-y)<=r; });
    assert.deepEqual(index.contacts(x,y,margin),want);
  }
  const hidden={...unit(999,4,4),kind:'sword',cloak:0} as Soldier;
  index.rebuild([hidden],[],true);
  assert.equal(index.nearest(4,4,1),null);
  assert.deepEqual(index.contacts(4,4,0),[hidden]);
  hidden.hp=0; assert.deepEqual(index.contacts(4,4,0),[]);
  hidden.hp=10;
  index.rebuild([hidden],[],true);
  const margin=.2, x=4-margin-defenderSize(hidden)/2-5e-10;
  assert.deepEqual(index.contacts(x,4,margin),[hidden], 'contact epsilon must cross bucket boundaries');
  index.rebuild([hidden],[]);
  assert.equal(index.contacts(4,4,1),null,'ordinary phases do not keep stale body buckets');
});
