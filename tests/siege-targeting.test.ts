import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/save.ts';
import { generateCastle } from '../src/campaign/castles.ts';
import { CampaignSim } from '../src/campaign/sim.ts';
import { cellIndex } from '../src/defend/grid.ts';

test('A native wall breach exposes the inner row to flanking infantry',()=>{
 const g=defaults(),s=new CampaignSim('siege',0,[],g.defend.owned,g.defend.levels,generateCastle(45,1000),g),r=s.raid;
 const outer=s.map.buildings.find(b=>b.kind==='wall'&&b.rect.x===30&&b.rect.y===8)!;
 const inner=s.map.buildings.find(b=>b.kind==='wall'&&b.cells.includes(cellIndex(30,9)))!;
 const target=r.attack.enemies.find(e=>e.id===10000000+inner.id)!,before={x:target.x,y:target.y};
 r.defense.damageBuilding(outer.id,r.defense.maxHp[outer.id]*2);r.synchronize();
 assert.notDeepEqual({x:target.x,y:target.y},before);assert.equal(target.y,8.5);
 assert.equal(r.attack.ownSolid[cellIndex(Math.floor(target.x),Math.floor(target.y))],0);
 assert.equal(r.attack.enemies.filter(e=>e.id===target.id).length,1,'Multiple exposed faces must not multiply native blast damage.');
});
test('A native brawler on a northern flank can strike the reachable wall face',()=>{
 const g=defaults();g.defend.owned.meleeGuild=2;g.defend.owned.rangedGuild=0;
 const s=new CampaignSim('siege',0,[],g.defend.owned,g.defend.levels,generateCastle(7907,1000),g),r=s.raid;s.start();s.step(1/30);
 const outer=s.map.buildings.find(b=>b.kind==='wall'&&b.rect.x===47&&b.rect.y===8)!;
 const inner=s.map.buildings.find(b=>b.kind==='wall'&&b.rect.x===47&&b.rect.y===9)!;
 r.defense.damageBuilding(outer.id,r.defense.maxHp[outer.id]*2);r.synchronize();
 const brawler=r.attack.soldiers[0];brawler.x=47.5;brawler.y=8.5;brawler.path=[];
 const before=r.defense.hp[inner.id];
 for(let tick=0;tick<1200&&r.defense.hp[inner.id]===before;tick++)s.step(1/30);
 assert.ok(r.defense.hp[inner.id]<before,'The flanking brawler must damage the inner wall through its reachable face.');assert.ok(brawler.hp>0);
});
