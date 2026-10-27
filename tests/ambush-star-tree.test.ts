import test from 'node:test';import assert from 'node:assert/strict';
import { AMBUSH_PATHS,ambushPool,ambushAllocated,buyAmbush,undoAmbush,respecAmbush,decodeAmbushRanks } from '../src/ambush-upgrades.ts';
import { AMBUSH_LEVELS,totalStars,recordStars } from '../src/campaign/levels.ts';
import { defaults,decode } from '../src/save.ts';
import { AmbushSim } from '../src/campaign/ambush-sim.ts';
import { build } from './ambush-helpers.ts';
function full(){const g=defaults();for(const l of AMBUSH_LEVELS)g.campaigns.ambush.stars[l.id]=3;return g;}
test('The star pool uses best stars only; buying, undo and respec conserve all ninety stars',()=>{
 const g=full(),p=g.campaigns.ambush;assert.equal(ambushPool(p),90);
 for(const branch of AMBUSH_PATHS)for(const rank of branch.ranks)assert.ok(buyAmbush(p,branch.id));
 assert.equal(ambushAllocated(p.ranks),90);assert.equal(ambushPool(p),0);assert.equal(buyAmbush(p,'warChest'),false);
 assert.ok(undoAmbush(p,'warChest',2));assert.equal(p.ranks?.warChest,1);assert.equal(ambushPool(p),8);
 respecAmbush(p);assert.equal(p.ranks,undefined);assert.equal(ambushPool(p),90);
 const low=defaults().campaigns.ambush;recordStars(low,AMBUSH_LEVELS[0],1);assert.equal(buyAmbush(low,'warChest'),false);
 recordStars(low,AMBUSH_LEVELS[0],3);assert.ok(buyAmbush(low,'warChest'));recordStars(low,AMBUSH_LEVELS[0],1);assert.equal(ambushPool(low),1);assert.equal(totalStars(low),3);
});
test('Star ranks and attempts round trip, reject unknown/fractional fields, and cannot overspend best stars',()=>{
 const g=full();buyAmbush(g.campaigns.ambush,'bounty');g.campaigns.ambush.attempts={'moss-1':4};
 assert.deepEqual(decode(JSON.stringify(g)).campaigns.ambush,g.campaigns.ambush);
 assert.equal(decodeAmbushRanks({warChest:1.5,cheat:5},90),undefined);
 const ranks=Object.fromEntries(AMBUSH_PATHS.map(p=>[p.id,p.ranks.length]));
 assert.ok(ambushAllocated(decodeAmbushRanks(ranks,3))<=3);assert.equal(decodeAmbushRanks(ranks,0),undefined);
});
test('All economic branches affect only the Ambush battle, including free buildings with no resale windfall',()=>{
 const g=full();g.campaigns.ambush.ranks={warChest:1,bounty:1,masons:1,quartermaster:1,headStart:2};
 const before=JSON.stringify(g),s=new AmbushSim(0,g),base=new AmbushSim(0,defaults());
 assert.equal(s.gold,base.gold+50);assert.equal(s.price('archerTower')%10,0);assert.ok(s.price('archerTower')<base.price('archerTower'));
 assert.equal(s.buildings.length,2);assert.ok(s.buildings.every(b=>b.paid===0&&s.refund(b.id)===0));
 const b=build(s,'meleeGuild');s.wave=2;assert.equal(s.refund(b.id),Math.floor(b.paid*.75/10)*10);
 const e=s.engine.spawnAuxiliary('ogre',30,5)!,f=base.engine.spawnAuxiliary('ogre',30,5)!;const wallet=s.gold,plain=base.gold;
 s.engine.hurtEnemy(e,1e9);base.engine.hurtEnemy(f,1e9);s.engine.step(1/30);base.engine.step(1/30);
 assert.equal(s.gold-wallet,(base.gold-plain)*1.05);assert.equal(JSON.stringify(g),before);
});
test('Drillmasters, palisades, keep walls and battle magic change native stats without crossing modes',()=>{
 const g=full();g.campaigns.ambush.ranks={drillmasters:2,palisades:1,keepWalls:1,battleMagic:2};
 g.spellPaths.meteor='starfall';g.pathResearch.starfall={rank:3,spent:1};
 const s=new AmbushSim(0,g),base=new AmbushSim(0,defaults());assert.equal(s.engine.bonuses.towerDamage,1.1);assert.equal(s.engine.bonuses.troopHp,1.1);
 assert.equal(s.engine.keepMaxHp(),base.engine.keepMaxHp()*1.2);
 const id=s.field.outposts[0].houses[0],fence=s.map.buildings.find(b=>b.fence)!.id;
 assert.ok(Math.abs(s.engine.maxHp[id]-base.engine.maxHp[id]*1.15)<.0001);assert.ok(Math.abs(s.engine.maxHp[fence]-base.engine.maxHp[fence]*1.15)<.0001);
 build(s,'meleeGuild');s.start();s.step(1/30);assert.ok(s.engine.soldiers.every(u=>u.maxHp>0));
 assert.ok(s.cast('meteor',{x:30,y:5}));assert.ok(Math.abs(s.engine.meteorRemaining-s.engine.meteorCooldown*.8)<1e-9);assert.equal(s.engine.meteors.length,1);
 // Placing in an outpost must keep its HP multiplier through native re-planning.
 const post=s.outposts.posts[0];for(let qy=1;qy<50;qy++)for(let qx=1;qx<35;qx++){const c=s.grid.check('archerTower',qx,qy,s.buildings);if(c.fits&&c.rect.x>post.rect.x&&c.rect.x+c.rect.w<post.rect.x+post.rect.w&&c.rect.y>post.rect.y&&c.rect.y+c.rect.h<post.rect.y+post.rect.h){s.gold=10000;s.placeAt('archerTower',qx,qy);const house=post.houses.find(id=>!s.map.buildings[id].hidden)!;assert.ok(Math.abs(s.engine.maxHp[house]/s.map.buildings[house].cells.length-base.engine.maxHp[id]/base.map.buildings[id].cells.length*1.15)<.0001);return;}}
 assert.fail('Expected an open outpost placement');
});
