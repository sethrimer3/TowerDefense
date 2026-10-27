import test from 'node:test';import assert from 'node:assert/strict';
import { AmbushSim } from '../src/campaign/ambush-sim.ts';
import { defaults } from '../src/save.ts';
import { ignite } from '../src/defend/towers.ts';
import { envenom,stepVenom } from '../src/defend/assassins.ts';
import { stepBleed } from '../src/defend/shadow.ts';
import { stepBlazes } from '../src/defend/mages.ts';
for(const kind of ['burn','venom','bleed','blaze'] as const)for(const side of [-1,1]){
 test(kind+' credit never changes native Siege Beetle directional armor from side '+side,()=>{
  const sim=new AmbushSim(0,defaults()),engine=sim.engine,e=engine.spawnAuxiliary('siegeBeetle',30,5)!;e.facing={x:0,y:1};engine.reindexAfterDisplacement();
  const origin={x:e.x,y:e.y+side*3,building:999},start=e.hp;
  const apply=(credit:boolean)=>{
   e.hp=start;delete e.burn;delete e.burnDps;delete e.burnOrigin;delete e.venom;delete e.bleed;
   engine.tally=credit?(id,damage)=>{assert.equal(id,999);assert.ok(damage>0);}:undefined;
   if(kind==='burn'){ignite(e,10,2,engine.tallyOrigin(origin));engine.step(.1);}
   else if(kind==='venom'){envenom(e,2,1,10,false,engine.tallyOrigin(origin));stepVenom(engine,.1);}
   else if(kind==='bleed'){e.bleed={dps:10,t:2,...(credit?{origin:engine.tallyOrigin(origin)}:{})};stepBleed(engine,.1);}
   else {engine.blazes=[{x:e.x,y:e.y,r:2,t:0,life:2,dps:10,seed:1,...(credit?{credit:engine.tallyOrigin(origin)}:{})}];stepBlazes(engine,.1);}
   return e.hp;
  };
  const native=apply(false),actual=apply(true);assert.ok(native<start);assert.equal(actual,native);
 });
}
test('Explicit attribution is separate from the physical hit position and clamps credited damage',()=>{
 const s=new AmbushSim(0,defaults()),e=s.engine.spawnAuxiliary('siegeBeetle',30,5)!;e.facing={x:0,y:1};let total=0;
 s.engine.tally=(_id,damage)=>total+=damage;
 const hp=e.hp;s.engine.hurtEnemy(e,10,false,'ranged',{x:30,y:8},false,'fire',0,{x:30,y:2,building:99});
 assert.equal(hp-e.hp,2.5);assert.equal(total,2.5);
});
