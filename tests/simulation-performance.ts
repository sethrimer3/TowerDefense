/** Paired simulation-only benchmarks. No renderer, browser or player saves. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { DefendSim, type Soldier } from '../src/defend/sim.ts';
import { generateCity, CellType } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { UPGRADES } from '../src/defend/catalog.ts';

const files=['sim.ts','enemies.ts','enemy-crowd.ts','ice-motion.ts','blight-worm.ts','defender-index.ts'];
const sources=files.map(file => [file,execFileSync('git',['show',`801e46c:src/defend/${file}`],{encoding:'utf8'})
  .replace(/from "\.\.\/(.*?)"/g,'from "../../src/$1"')
  .replace(/from "\.\/(.*?)"/g,(_,path)=>`from "${files.includes(path)?'./':'../../src/defend/'}${path}"`)]);
const root=`test-results/simulation-reference-${createHash('sha256').update(JSON.stringify(sources)).digest('hex').slice(0,16)}`;
mkdirSync(root,{recursive:true});
for(const [file,source] of sources)writeFileSync(`${root}/${file}`,source);
const { DefendSim: ReferenceSim }=await import(new URL(`../${root}/sim.ts`,import.meta.url).href);

function fixture(Sim:typeof DefendSim, n:number, worms=false, defenders=0) {
  const fit=fitLayout(defaultLayout());assert.ok(fit.ok);
  const sim=new Sim(generateCity(fit,3),Object.fromEntries(UPGRADES.map(u=>[u.id,0])) as any,42);
  sim.scenario={manualWaves:true,ignoreKeepLoss:true,noCivilians:true,soldierDt:()=>0};
  sim.beginManualWave(40,4800,3);
  sim.solid.fill(0);sim.foeSolid.fill(0);sim.ownSolid.fill(0);sim.rocks.fill(0);sim.map.wall.fill(0);
  sim.map.type.fill(CellType.OUT);sim.map.owner.fill(-1);sim.hp.fill(0);sim.built.fill(0);
  sim.soldiers=[];sim.civilians=[];
  if(worms)for(let i=0;i<n/7;i++)sim.releaseEnemy('smallBlightWorm',{x:5+i%50*1.2,y:20+Math.floor(i/50)*4});
  else for(let i=0;i<n;i++)sim.spawnAuxiliary('miniDarkling',5+i%100*.125,10+Math.floor(i/100)*.125);
  for(const e of sim.enemies)if(e.worm?.head)e.worm.head.surfaceT=e.worm.head.turnT=1e6;
  sim.soldiers=Array.from({length:defenders},(_,i)=>({id:900000+i,kind:'sword',home:sim.keepId,x:5+(i*137%620)/10,y:10+(i*197%800)/10,
    hp:1e6,maxHp:1e6,damage:0,cd:99,target:-1,path:[],thinkT:99,flash:0,...(i%11?{}:{cloak:0})})) as Soldier[];
  return sim;
}
function compare(a:DefendSim,b:DefendSim) {
  for(const key of ['time','enemies','soldiers','civilians','hp','stats','slain','effects','arrows','shells','graves','corpses','floods'] as const)assert.deepEqual(a[key],b[key],key);
  assert.deepEqual(a.blight.exposure,b.blight.exposure);
}
function paired(before:()=>void,after:()=>void,verify:()=>void,batch=5) {
  const samples={before:[] as number[],after:[] as number[]},tasks={before,after};
  for(let i=0;i<3;i++){before();after();}verify();
  for(let round=0;round<9;round++){
    for(const name of (round%2?['after','before']:['before','after']) as ('before'|'after')[]){
      const start=performance.now();for(let i=0;i<batch;i++)tasks[name]();samples[name].push((performance.now()-start)/batch);
    }
    verify();
  }
  return Object.fromEntries(Object.entries(samples).map(([key,a])=>[key,+a.sort((a,b)=>a-b)[4].toFixed(3)]));
}
const rows=[];
for(const [n,worms,defenders] of [[1000,false,0],[5000,false,0],[20000,false,0],[2800,true,300]] as const){
  const before=fixture(ReferenceSim,n,worms,defenders),after=fixture(DefendSim,n,worms,defenders);
  for(let i=0;i<20;i++){before.step(1/30);after.step(1/30);}compare(before,after);
  const ms=paired(()=>before.step(1/30),()=>after.step(1/30),()=>compare(before,after));
  assert.equal(before.rand(),after.rand());
  rows.push({workload:worms?'moving worms with defenders':'moving packed Darklings',n,defenders,stepMs:ms});
}
{
  const before=fixture(ReferenceSim,2800,true),after=fixture(DefendSim,2800,true);
  const ms=paired(()=>(before as any).sweepAway(),()=>(after as any).sweepAway(),()=>compare(before,after),10);
  rows.push({workload:'living worm cleanup',n:2800,defenders:0,cleanupMs:ms});
}
const result={note:'Node simulation-only warm medians (ms), nine alternating samples; complete moving fixed steps at 1/30 s, no drawing. Exact state parity checked after each batch; RNG checked after moving scenarios. Frozen reference: 801e46c. Synthetic flat fields isolate crowd movement and contact queries; not a complete city/frame benchmark.',rows};
writeFileSync('test-results/simulation-performance.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
