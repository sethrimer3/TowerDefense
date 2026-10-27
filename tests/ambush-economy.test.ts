import test from 'node:test';
import assert from 'node:assert/strict';
import { ambushPrice, enemyBounty, startingGold } from '../src/campaign/economy.ts';
import { CampaignSim, deployable } from '../src/campaign/sim.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';
import { STRUCTURES,type StructureKind } from '../src/defend/catalog.ts';

test('All deployable buildings have positive prices rounded to tens and actual upgrades increase prices',()=>{
 const d=defaultDefendSave();
 for(const kind of Object.keys(STRUCTURES) as StructureKind[])if(deployable(kind,'ambush')){const p=ambushPrice(kind,d.levels);assert.ok(p.cost>0);assert.equal(p.cost%10,0);assert.ok(Number.isFinite(p.dps));}
 assert.deepEqual([0,1,2].map(startingGold),[500,600,700]);
 for(const [kind,upgrades] of [['archerTower',{archerDamage:3,archerRate:2,archerRange:2}],['cannonTower',{cannonDamage:3,cannonRate:2}],['wizardTower',{wizardFlame:3}],['meleeGuild',{soldierArms:3,barracksCapacity:2,barracksTraining:2}],['watchTower',{watchRadius:2}]] as const){
  assert.ok(ambushPrice(kind,{...d.levels,...upgrades}).cost>ambushPrice(kind,d.levels).cost,kind);
 }
 assert.ok(ambushPrice('heroHall',d.levels).cost>ambushPrice('barracks',d.levels).cost);
});
test('Purchases debit level gold, respect affordability, and saved layouts cannot provide free towers',()=>{
 const d=defaultDefendSave(),s=new CampaignSim('ambush',0,[],d.owned,d.levels),price=s.price('meleeGuild').cost;
 s.place(0,'meleeGuild');assert.equal(s.gold,500-price);s.remove(0);assert.equal(s.gold,500);s.remove(0);assert.equal(s.gold,500);
 const loaded=new CampaignSim('ambush',0,Array.from({length:8},(_,pad)=>({pad,kind:'meleeGuild' as const})),d.owned,d.levels);
 assert.equal(loaded.layout.length,Math.floor(500/price));assert.equal(loaded.gold,500-loaded.layout.length*price);
 const before=JSON.stringify(d);s.place(0,'meleeGuild');s.start();s.step(.05);assert.equal(JSON.stringify(d),before);
});
test('Battle building and selling use stable pad homes; reselling never creates profit or orphan troops',()=>{
 const d=defaultDefendSave(),s=new CampaignSim('ambush',0,[],d.owned,d.levels);s.place(0,'meleeGuild');s.place(1,'rangedGuild');s.start();s.step(.05);
 assert.ok(s.allies.some(a=>a.home===0));assert.ok(s.allies.some(a=>a.home===1));
 const gold=s.gold,refund=s.refund(0);assert.equal(refund,Math.floor(s.price('meleeGuild').cost*.7/10)*10);
 s.remove(0);assert.equal(s.gold,gold+refund);assert.ok(!s.allies.some(a=>a.home===0));assert.ok(s.allies.some(a=>a.home===1));
 assert.ok(s.place(2,'rangedGuild'));s.step(.05);assert.ok(s.allies.some(a=>a.home===2));s.step(1);
 const before=s.gold;s.remove(2);assert.ok(s.gold-before<s.price('rangedGuild').cost);
 s.phase='lost';assert.equal(s.place(3,'meleeGuild'),false);const ended=s.gold;s.remove(1);assert.equal(s.gold,ended);
});
test('Killing hits pay the spawned bounty exactly once, and leaks pay nothing',()=>{
 const d=defaultDefendSave();d.owned.archerTower=1;
 const s=new CampaignSim('ambush',0,[],d.owned,d.levels);s.place(0,'archerTower');s.start();s.step(1);assert.equal(s.enemies.length,1);
 const enemy=s.enemies[0];enemy.x=s.plan.pads[0].x;enemy.y=s.plan.pads[0].y;enemy.hp=1;
 const gold=s.gold,bounty=enemy.bounty!;s.step(.05);assert.equal(s.gold,gold+bounty);assert.equal(s.kills,1);
 s.step(.05);assert.equal(s.gold,gold+bounty);assert.equal(s.kills,1);
 const leak=new CampaignSim('ambush',0,[],d.owned,d.levels);leak.place(0,'archerTower');leak.start();leak.step(1);
 const e=leak.enemies[0];e.progress=leak.plan.path.length-1;e.x=19;e.y=23;
 const leakGold=leak.gold;leak.step(.05);assert.equal(leak.lives,4);assert.equal(leak.gold,leakGold);assert.equal(leak.kills,0);
});
test('Tougher enemies pay more and retries do not carry Ambush gold into other game modes',()=>{
 const weak={maxHp:12,damage:2,cooldown:1.2,speed:1.2},tough={maxHp:48,damage:6,cooldown:1,speed:2};assert.ok(enemyBounty(tough)>enemyBounty(weak));assert.equal(enemyBounty(tough)%10,0);
 const d=defaultDefendSave(),a=new CampaignSim('ambush',0,[],d.owned,d.levels);a.gold=9999;
 assert.equal(new CampaignSim('ambush',0,[],d.owned,d.levels).gold,500);const siege=new CampaignSim('siege',0,[],d.owned,d.levels);siege.start();siege.step(1);assert.equal(siege.gold,0);
});

test('Spending kill rewards on reinforcements can clear all three levels with starter unlocks',()=>{
 for(let level=0;level<3;level++){
  const d=defaultDefendSave(),s=new CampaignSim('ambush',level,[],d.owned,d.levels);
  s.place(0,'meleeGuild');s.place(1,'rangedGuild');s.place(2,'watchTower');s.start();
  for(let t=0;t<6000&&s.phase==='battle';t++){
   const pad=s.plan.pads.findIndex((_,i)=>!s.layout.some(p=>p.pad===i));if(pad>=0)s.place(pad,'rangedGuild');s.step(.05);
  }
  assert.equal(s.phase,'won');assert.ok(s.layout.length>3);assert.ok(s.kills>0);assert.ok(s.gold>=0);
 }
});
