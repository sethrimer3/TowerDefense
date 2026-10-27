import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCastle, castlePower, estimateCastle, decodeCastle } from '../src/campaign/castles.ts';
import { expectedWin, raidRating } from '../src/campaign/siege-rating.ts';
import { newSiege, nextOpponent, settleRaid, decodeSiege } from '../src/campaign/siege-progress.ts';
import { defaults, decode } from '../src/save.ts';
import { CampaignSim } from '../src/campaign/sim.ts';

test('Generated castles are seeded, varied, bounded, and rate themselves near the target',()=>{
 const names=new Set<string>(),layouts=new Set<string>();
 for(let seed=1;seed<=50;seed++)for(const target of [100,600,1000,1800,3000]){
  const c=generateCastle(seed,target);assert.deepEqual(c,generateCastle(seed,target));
  assert.ok(decodeCastle(c));assert.ok(Math.abs(estimateCastle(c).rating-target)<=1);
  names.add(c.owner.name);layouts.add(JSON.stringify(c.defenses.map(d=>[d.x,d.y])));
 }
 assert.ok(names.size>25);assert.ok(layouts.size>40);
});
test('Defense difficulty increases with HP, firepower, guards, and supporting coverage',()=>{
 const c=generateCastle(42,1000),base=castlePower(c);
 const stronger=structuredClone(c);stronger.defenses[0].hp*=2;assert.ok(castlePower(stronger)>base);
 stronger.defenses[0].damage*=2;assert.ok(estimateCastle(stronger).rating>estimateCastle(c).rating);
 const guard=structuredClone(c);guard.guards.count++;assert.ok(castlePower(guard)>base);
 const support=structuredClone(c);const towers=support.defenses.filter(d=>d.kind==='tower');
 if(towers.length>1){towers[1].x=towers[0].x+2;towers[1].y=towers[0].y;assert.ok(castlePower(support)>=base);}
});
test('Elo results are symmetric, favor upsets, and reduce K after placements',()=>{
 assert.equal(expectedWin(1000,1000),.5);assert.ok(Math.abs(expectedWin(800,1200)+expectedWin(1200,800)-1)<1e-12);
 assert.equal(raidRating(1000,1000,0,true).delta,24);assert.equal(raidRating(1000,1000,10,true).delta,12);
 assert.ok(raidRating(1000,1300,0,true).delta>24);assert.ok(raidRating(1000,700,0,true).delta<24);
 assert.ok(raidRating(1000,700,0,false).delta < -24);
});
test('A ranked result settles once; practice and preview cannot farm ratings; new opponents follow MMR',()=>{
 const s=newSiege(123);assert.equal(settleRaid(s,true),false);assert.equal(nextOpponent(s),false);
 const snapshot=JSON.stringify(s.raid.castle);s.raid.state='started';assert.ok(settleRaid(s,true));
 assert.equal(s.games,1);assert.equal(s.wins,1);assert.equal(s.mmr,1024);
 assert.equal(settleRaid(s,true),false);assert.equal(settleRaid(s,false),false);assert.equal(s.games,1);
 assert.equal(JSON.stringify(s.raid.castle),snapshot);assert.ok(nextOpponent(s));assert.equal(s.raid.state,'offered');
 assert.notEqual(JSON.stringify(s.raid.castle),snapshot);assert.ok(Math.abs(s.raid.defender-s.mmr)<=80);
 s.raid.state='started';assert.ok(settleRaid(s,false));assert.equal(s.games,2);assert.equal(s.wins,1);
});
test('Siege saves round-trip immutable targets, sanitize counters, and reject invalid snapshots',()=>{
 const d=defaults();assert.equal(decode(JSON.stringify(d)).siege,undefined);
 d.siege=newSiege(883);d.siege.raid.state='started';assert.deepEqual(decode(JSON.stringify(d)).siege,d.siege);
 const corrupt=structuredClone(d.siege);corrupt.mmr=Infinity;corrupt.games=-5;corrupt.wins=NaN;
 assert.equal(decodeSiege(corrupt)?.mmr,1000);assert.equal(decodeSiege(corrupt)?.games,0);
 for(const raw of [null,{},[],{raid:{castle:null}}])assert.equal(decodeSiege(raw),undefined);
 const bad=structuredClone(d.siege);bad.raid.castle.defenses[0].hp=NaN;assert.equal(decodeSiege(bad),undefined);
 const nullDefense=structuredClone(d.siege.raid.castle);nullDefense.defenses.push(null as any);assert.equal(decodeCastle(nullDefense),null);
 const html=structuredClone(d.siege.raid.castle);html.owner.name='<img onerror=alert(1)>';assert.equal(decodeCastle(html),null);
});
test('Generated raids instantiate a native castle without mutating their saved target',()=>{
 const d=defaults(),c=generateCastle(7907,600),before=JSON.stringify(c);
 const sim=new CampaignSim('siege',0,[],d.defend.owned,d.defend.levels,c,d);
 assert.ok(sim.raid);assert.ok(sim.map.buildings.some(b=>b.kind==='keep'));assert.ok(sim.map.buildings.some(b=>b.kind==='wall'));assert.ok(sim.map.buildings.some(b=>b.kind==='archerTower'||b.kind==='cannonTower'||b.kind==='wizardTower'||b.kind==='wispTower'||b.kind==='brazierTower'||b.kind==='hawkTower'));
 sim.start();for(let i=0;i<30;i++)sim.step(1/30);assert.equal(JSON.stringify(c),before);
});
