import test from 'node:test';
import assert from 'node:assert/strict';
import {CampaignSim,decodeCampaigns} from '../src/campaign/sim.ts';
import {defaults,decode} from '../src/save.ts';
import {generateCastle} from '../src/campaign/castles.ts';

test('Native Siege refuses manual placement and an empty army cannot start',()=>{
 const save=defaults(),s=new CampaignSim('siege',0,[],save.defend.owned,save.defend.levels,generateCastle(45,600),save);
 assert.equal(s.layout.length,2);assert.equal(s.place(0,'watchTower'),false);const before=JSON.stringify(s.layout);s.remove(0);assert.equal(JSON.stringify(s.layout),before);
 save.defend.owned.meleeGuild=0;save.defend.owned.rangedGuild=0;assert.equal(new CampaignSim('siege',0,[],save.defend.owned,save.defend.levels,generateCastle(45,600),save).start(),false);
});
test('Native Siege includes more than eight infantry copies without consuming them',()=>{
 const save=defaults();save.defend.owned.meleeGuild=40;save.defend.owned.rangedGuild=10;const before=JSON.stringify(save.defend);
 const s=new CampaignSim('siege',0,[],save.defend.owned,save.defend.levels,generateCastle(45,600),save);
 assert.equal(s.layout.length,50);s.start();s.step(1/30);assert.equal(new Set(s.allies.map(a=>a.home)).size,50);assert.ok(s.allies.every(a=>a.y>=58));assert.equal(JSON.stringify(save.defend),before);
});
test('Ambush saves migrate clears to best stars and discard obsolete pad layouts; Siege decoding remains bounded',()=>{
 const save=defaults();assert.deepEqual(decode(JSON.stringify(save)).campaigns.ambush,{stars:{}});
 save.campaigns=decodeCampaigns({ambush:{cleared:999,layouts:[[{pad:0,kind:'brazierTower',path:'fireArrows',rank:3},{pad:0,kind:'rangedGuild'},{pad:999,kind:'archerTower'},{pad:1,kind:'bogus'}]]},siege:{cleared:NaN,layouts:[[{pad:0,kind:'watchTower'}]]}});
 assert.deepEqual(save.campaigns.ambush,{stars:{'moss-1':1,'moss-2':1,'moss-3':1}});assert.equal(save.campaigns.siege.cleared,0);assert.deepEqual(save.campaigns.siege.layouts[0],[]);
 assert.deepEqual(decode(JSON.stringify(save)).campaigns,save.campaigns);
 for(const raw of [null,[],{ambush:null},true,'bad'])assert.equal(Object.keys(decodeCampaigns(raw).ambush.stars).length,0);
});
