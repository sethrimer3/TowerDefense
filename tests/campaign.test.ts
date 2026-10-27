import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSim, decodeCampaigns, validLayout, levelPlan, siegeArmy } from '../src/campaign/sim.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';
import { defaults, decode } from '../src/save.ts';
const finish=(s:CampaignSim)=>{for(let n=0;n<6000&&s.phase==='battle';n++)s.step(.05);};
test('Ambush paths finish all levels without stalling at corners; prepared formations can win',()=>{
 for(let level=0;level<3;level++){
  const d=defaultDefendSave();d.owned.meleeGuild=4;d.owned.rangedGuild=4;const before=JSON.stringify(d),s=new CampaignSim('ambush',level,[],d.owned,d.levels);
  assert.ok(s.place(0,'meleeGuild'));assert.ok(s.place(1,'rangedGuild'));assert.ok(s.place(2,'watchTower'));for(let pad=3;pad<s.plan.pads.length;pad++)s.place(pad,pad%2?'meleeGuild':'rangedGuild');assert.ok(s.start());
  finish(s);assert.equal(s.phase,'won');assert.equal(s.wave,3);assert.equal(JSON.stringify(d),before);
 }
});
test('Ambush enemies stay on the fixed path, leaks remove lives, and build phase never runs',()=>{
 const d=defaultDefendSave();d.owned.archerTower=1;
 d.levels.archerDamage=-2;const s=new CampaignSim('ambush',2,[],d.owned,d.levels);s.step(1);assert.equal(s.elapsed,0);
 assert.ok(s.place(s.plan.pads.length-1,'archerTower'));s.start();
 // Remove attack damage, testing the entire uninterrupted leak path.
 d.levels.archerDamage=-2;
 for(let i=0;i<6000&&s.phase==='battle';i++){
  s.step(.05);
  for(const e of s.enemies){const a=s.plan.path[e.progress],b=s.plan.path[e.progress+1];if(b)assert.ok(Math.abs((e.x-a.x)*(b.y-a.y)-(e.y-a.y)*(b.x-a.x))<.0001);}
 }
 assert.equal(s.phase,'lost');assert.equal(s.lives,0);
});
test('Siege auto-deploys infantry, attacks castles and can win with a prepared army',()=>{
 for(let level=0;level<3;level++){
  const d=defaultDefendSave();d.owned.meleeGuild=4;d.owned.rangedGuild=4;const s=new CampaignSim('siege',level,[],d.owned,d.levels);
  assert.equal(s.place(0,'watchTower'),false);assert.equal(s.place(0,'archerTower'),false);
  assert.equal(s.layout.length,8);assert.ok(s.start());
  assert.equal(s.place(2,'meleeGuild'),false);finish(s);assert.equal(s.phase,'won');assert.ok(s.castles.every(c=>c.hp<=0));assert.ok(s.reserves>=0&&s.reserves<36);
 }
});
test('Siege loses once its army is exhausted; battles cannot start empty',()=>{
 const d=defaultDefendSave(),s=new CampaignSim('siege',0,[],d.owned,d.levels);
 const empty={...d.owned,meleeGuild:0,rangedGuild:0};assert.equal(new CampaignSim('siege',0,[],empty,d.levels).start(),false);s.start();s.reserves=0;s.allies=[];s.step(.05);assert.equal(s.phase,'lost');
});
test('Ambush allows repeat unlocked buildings but enforces budget, pads and locked types',()=>{
 const d=defaultDefendSave(),s=new CampaignSim('ambush',0,[],d.owned,d.levels);
 assert.ok(s.place(0,'meleeGuild'));assert.ok(s.place(1,'meleeGuild'));
 const before=JSON.stringify(s.layout),gold=s.gold;
 assert.equal(s.place(2,'meleeGuild'),false);assert.equal(s.place(-1,'rangedGuild'),false);assert.equal(s.place(500,'rangedGuild'),false);assert.equal(s.place(2,'archerTower'),false);
 assert.equal(JSON.stringify(s.layout),before);assert.equal(s.gold,gold);
 assert.equal(validLayout('siege',0,[{pad:0,kind:'watchTower'},{pad:1,kind:'meleeGuild'},{pad:1,kind:'rangedGuild'}],d.owned).length,1);
 s.remove(0);assert.ok(s.place(2,'meleeGuild'));
});
test('Campaign saves round-trip and reject malformed or out-of-bounds progress/layout data',()=>{
 const save=defaults();assert.equal(Object.hasOwn(decode(JSON.stringify(save)),'campaigns'),false);
 save.campaigns=decodeCampaigns({ambush:{cleared:999,layouts:[[{pad:0,kind:'meleeGuild'},{pad:0,kind:'rangedGuild'},{pad:999,kind:'archerTower'},{pad:1,kind:'bogus'}]]},siege:{cleared:NaN,layouts:[[{pad:0,kind:'watchTower'}]]}});
 assert.equal(save.campaigns.ambush.cleared,3);assert.deepEqual(save.campaigns.ambush.layouts[0],[{pad:0,kind:'meleeGuild'}]);assert.equal(save.campaigns.siege.cleared,0);assert.deepEqual(save.campaigns.siege.layouts[0],[]);
 assert.deepEqual(decode(JSON.stringify(save)).campaigns,save.campaigns);
 for(const value of [null,[],{ambush:null},true,'bad'])assert.equal(decodeCampaigns(value).ambush.cleared,0);
 for(const mode of ['ambush','siege'] as const)for(let level=0;level<3;level++)assert.ok(levelPlan(mode,level).pads.length>=3);
});

test('Siege automatically deploys every infantry copy at the bottom without consuming inventory',()=>{
 const d=defaultDefendSave();d.owned.meleeGuild=7;d.owned.rangedGuild=6;d.owned.barracks=2;d.owned.watchTower=3;
 const before=JSON.stringify(d);const army=siegeArmy(d.owned);
 assert.equal(army.layout.length,15);assert.equal(army.pads.length,15);assert.equal(new Set(army.pads.map(p=>`${p.x},${p.y}`)).size,15);
 for(const p of army.pads){assert.ok(p.x>0&&p.x<20);assert.ok(p.y>=18.5&&p.y<24);}
 const sim=new CampaignSim('siege',0,[{pad:0,kind:'watchTower'}],d.owned,d.levels);
 assert.equal(sim.layout.filter(p=>p.kind==='meleeGuild').length,7);assert.equal(sim.layout.filter(p=>p.kind==='rangedGuild').length,6);assert.equal(sim.layout.filter(p=>p.kind==='barracks').length,2);
 assert.equal(sim.place(0,'meleeGuild'),false);sim.remove(0);assert.equal(sim.layout.length,15);
 assert.ok(sim.start());sim.step(.05);assert.equal(new Set(sim.allies.map(a=>a.home)).size,15);assert.equal(sim.allies.length,15);
 assert.ok(sim.castles.every(c=>c.y<16));assert.ok(sim.allies.every(a=>a.y>18));assert.equal(JSON.stringify(d),before);
});
test('Large Siege rosters include every building and reserve at least a full garrison per building',()=>{
 const d=defaultDefendSave();d.owned.meleeGuild=40;d.owned.rangedGuild=10;
 const sim=new CampaignSim('siege',0,[],d.owned,d.levels);assert.equal(sim.layout.length,50);assert.ok(sim.reserves>=100);
 sim.start();sim.step(.05);assert.equal(new Set(sim.allies.map(a=>a.home)).size,50);
});
