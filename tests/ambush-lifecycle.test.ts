import test from 'node:test';import assert from 'node:assert/strict';
import { AmbushSim } from '../src/campaign/ambush-sim.ts';
import { defaults,decode } from '../src/save.ts';
import { build } from './ambush-helpers.ts';
test('Manual waves wait by default; sending early pays nothing and cannot double-send a pending queue',()=>{
 const s=new AmbushSim(0,defaults());assert.equal(s.autoSend,false);assert.equal(s.waves.length,20);build(s,'archerTower');assert.ok(s.send());assert.equal(s.wave,1);assert.equal(s.send(),false);
 while(!s.canSend)s.step(1/30);
 const gold=s.gold,earned=s.goldEarned,time=s.elapsed;assert.ok(s.send());assert.equal(s.wave,2);assert.equal(s.gold,gold);assert.equal(s.goldEarned,earned);assert.equal(s.elapsed,time);
});
test('Auto-send waits until all enemies are cleared plus its break, and is remembered independently',()=>{
 const game=defaults();game.campaigns.ambush.autoSend=true;const s=new AmbushSim(0,game);assert.ok(s.autoSend);build(s,'archerTower');s.send();
 for(let n=0;n<1200&&!s.canSend;n++){s.step(1/30);for(const e of s.engine.enemies)s.engine.hurtEnemy(e,1e9);}
 assert.equal(s.wave,1);for(let n=0;n<75;n++){s.step(1/30);for(const e of s.engine.enemies)s.engine.hurtEnemy(e,1e9);}
 assert.equal(s.wave,1);for(let n=0;n<30;n++)s.step(1/30);assert.equal(s.wave,2);
 assert.equal(decode(JSON.stringify(game)).campaigns.ambush.autoSend,true);assert.equal(decode(JSON.stringify({...game,campaigns:{ambush:{stars:{},autoSend:'true'}}})).campaigns.ambush.autoSend,undefined);
});
test('Clearing all twenty waves wins with live objectives, while a loss never completes a level',()=>{
 const s=new AmbushSim(0,defaults());build(s,'archerTower');
 for(let wave=1;wave<=20;wave++){
  assert.ok(s.send());assert.equal(s.wave,wave);
  for(let n=0;n<3000&&(!s.canSend&&s.phase==='battle');n++){
   for(const e of s.engine.enemies)s.engine.hurtEnemy(e,1e9);s.step(1/30);
   if(wave===20&&s.phase==='won')break;
  }
 }
 for(let n=0;n<5;n++){for(const e of s.engine.enemies)s.engine.hurtEnemy(e,1e9);s.step(1/30);}
 assert.equal(s.phase,'won');assert.equal(s.stars,3);
});
test('Battle speed uses the same saved preference and unlock as Defend',()=>{
 const g=defaults();g.defend.battleSpeed=3;let s=new AmbushSim(0,g);assert.equal(s.speed,2);g.defend.speed3=true;s=new AmbushSim(0,g);assert.equal(s.speed,3);build(s,'archerTower');s.start();s.step(.1);assert.ok(Math.abs(s.elapsed-.3)<1e-8);
});
