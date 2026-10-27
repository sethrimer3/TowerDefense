import test from 'node:test';
import assert from 'node:assert/strict';
import { ambushPrice, enemyBounty, startingGold } from '../src/campaign/economy.ts';
import { CampaignSim, deployable } from '../src/campaign/sim.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';
import { STRUCTURES,ENEMIES,type StructureKind } from '../src/defend/catalog.ts';

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
 assert.ok(s.allies.some(a=>a.home===2));assert.ok(s.allies.some(a=>a.home===1));
 const gold=s.gold,refund=s.refund(0);assert.equal(refund,Math.floor(s.price('meleeGuild').cost*.7/10)*10);
 s.remove(0);assert.equal(s.gold,gold+refund);assert.ok(!s.allies.some(a=>a.home===1));assert.ok(s.allies.some(a=>a.home===2));
 assert.ok(s.place(2,'rangedGuild'));s.step(.05);assert.ok(s.allies.some(a=>a.home===3));s.step(1);
 const before=s.gold;s.remove(2);assert.ok(s.gold-before<s.price('rangedGuild').cost);
 s.phase='lost';assert.equal(s.place(3,'meleeGuild'),false);const ended=s.gold;s.remove(1);assert.equal(s.gold,ended);
});
test('Native enemy deaths pay once; reaching the route exit pays nothing',()=>{
 const d=defaultDefendSave(),s=new CampaignSim('ambush',0,[],d.owned,d.levels);s.place(0,'meleeGuild');s.start();
 const p=s.plan.path[0],enemy=s.engine.spawnAuxiliary('roach',p.x,p.y)!;
 const gold=s.gold,def=ENEMIES[enemy.kind],bounty=enemyBounty({maxHp:enemy.maxHp,damage:def.damage,cooldown:def.cooldown,speed:def.speed});
 s.engine.hurtEnemy(enemy,enemy.hp*2);s.engine.step(1/30);assert.equal(s.gold,gold+bounty);assert.equal(s.kills,1);s.engine.step(1/30);assert.equal(s.kills,1);
 const end=s.plan.path.at(-1)!,leak=s.engine.spawnAuxiliary('roach',end.x,end.y)!;const after=s.gold;s.engine.step(1/30);s.engine.step(1/30);assert.ok(leak.escaped);assert.equal(s.gold,after);
});
test('Tougher enemies pay more and retries do not carry Ambush gold into other game modes',()=>{
 const weak={maxHp:12,damage:2,cooldown:1.2,speed:1.2},tough={maxHp:48,damage:6,cooldown:1,speed:2};assert.ok(enemyBounty(tough)>enemyBounty(weak));assert.equal(enemyBounty(tough)%10,0);
 const d=defaultDefendSave(),a=new CampaignSim('ambush',0,[],d.owned,d.levels);a.gold=9999;
 assert.equal(new CampaignSim('ambush',0,[],d.owned,d.levels).gold,500);const siege=new CampaignSim('siege',0,[],d.owned,d.levels);siege.start();siege.step(1);assert.equal(siege.gold,0);
});

test('Native kill gold can fund an additional building during a wave',()=>{
 const d=defaultDefendSave(),s=new CampaignSim('ambush',0,[],d.owned,d.levels);s.place(0,'meleeGuild');s.start();s.gold=0;
 for(let i=0;i<20;i++){const e=s.engine.spawnAuxiliary('ogre',s.plan.path[0].x,s.plan.path[0].y)!;s.engine.hurtEnemy(e,e.hp*2);s.engine.step(1/30);}
 assert.ok(s.gold>=s.price('rangedGuild').cost);const before=s.gold;assert.ok(s.place(1,'rangedGuild'));assert.equal(s.gold,before-s.price('rangedGuild').cost);
});
