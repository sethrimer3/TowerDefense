/** Paired microbenchmarks; include rebuilding the defender index each batch. */
import assert from 'node:assert/strict';
import { DefenderIndex } from '../src/defend/defender-index.ts';
import { healthbarEnemies } from '../src/defend/healthbars.ts';
import { ENEMIES } from '../src/defend/catalog.ts';
import type { Soldier, Civilian, Enemy, DefendSim } from '../src/defend/sim.ts';
const soldiers=Array.from({length:88},(_,i)=>({id:i,x:4+(i*137%550)/10,y:8+(i*193%750)/10,hp:100})) as Soldier[];
const civilians:Civilian[]=[];
const queries=Array.from({length:2500},(_,i)=>({x:(i*97%630)/10,y:(i*157%910)/10,r:i%10 ? .9 : 5}));
const index=new DefenderIndex();
function linear(x:number,y:number,r:number) {
  let best:Soldier|Civilian|null=null,distance=r*r;
  for(let team=0;team<2;team++)for(const u of team===0?soldiers:civilians){
    if(u.hp<=0)continue;
    const d=(u.x-x)*(u.x-x)+(u.y-y)*(u.y-y);
    if(d<=distance){best=u;distance=d;}
  }
  return best;
}
index.rebuild(soldiers,civilians);
for(const q of queries)assert.equal(index.nearest(q.x,q.y,q.r),linear(q.x,q.y,q.r));
const sim={wave:1,spawnQueue:[],enemies:Array.from({length:2500},(_,i)=>({id:i,kind:'dragon',hp:1+(i*97%1000),maxHp:1000}))} as unknown as DefendSim;
function originalBars(){
  let cost=0;
  for(const kind of sim.spawnQueue)cost=Math.max(cost,ENEMIES[kind].cost);
  for(const e of sim.enemies)cost=Math.max(cost,ENEMIES[e.kind].cost);
  const threshold=Math.max(100,cost/4);
  return sim.enemies.filter(e=>e.hp>0 && !(e.burrow && e.burrow>0) && e.leader===undefined && ENEMIES[e.kind].cost>=threshold)
    .sort((a,b)=>ENEMIES[b.kind].cost-ENEMIES[a.kind].cost || a.hp/a.maxHp-b.hp/b.maxHp || a.id-b.id).slice(0,8);
}
assert.deepEqual(healthbarEnemies(sim),originalBars());
let checksum=0;
const tasks={
  targetingBefore:()=>{for(const q of queries)checksum+=linear(q.x,q.y,q.r)?.id ?? 0;},
  targetingAfter:()=>{index.rebuild(soldiers,civilians);for(const q of queries)checksum+=index.nearest(q.x,q.y,q.r)?.id ?? 0;},
  healthbarsBefore:()=>{originalBars();checksum+=originalBars()[0]?.id ?? 0;},
  healthbarsAfter:()=>{checksum+=healthbarEnemies(sim)[0]?.id ?? 0;},
};
const times:Record<string,number[]>={};
for(const [name,fn] of Object.entries(tasks)){times[name]=[];for(let i=0;i<100;i++)fn();}
for(let round=0;round<7;round++){
  const order=Object.entries(tasks);if(round%2)order.reverse();
  for(const [name,fn] of order){const start=performance.now();for(let i=0;i<200;i++)fn();times[name].push((performance.now()-start)/200);}
}
const median=(a:number[])=>a.toSorted((a,b)=>a-b)[Math.floor(a.length/2)];
console.log(JSON.stringify({units:88,queries:2500,healthbarCandidates:2500,medianMs:Object.fromEntries(Object.entries(times).map(([k,v])=>[k,median(v)])),samples:times,checksum},null,2));
