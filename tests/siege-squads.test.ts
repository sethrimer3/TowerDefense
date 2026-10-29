import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSim } from '../src/campaign/sim.ts';
import { defaults } from '../src/save.ts';
import { generateCastle } from '../src/campaign/castles.ts';
import { SiegeSquads, squadRole } from '../src/campaign/siege-squads.ts';
import { bannerFor } from '../src/defend/deployment.ts';
function fixture(){const save=defaults();Object.assign(save.defend.owned,{barracks:2,archerBarracks:2,mageGuild:1,lancerStable:1,heroHall:1,shadow:1,valkyriePalace:1,darkKeep:1,revolutionary:1,gatlingNest:1});const sim=new CampaignSim('siege',0,[],save.defend.owned,save.defend.levels,generateCastle(45,100),save);sim.start();sim.step(1/30);return {sim,squads:new SiegeSquads(sim.engine,sim.raid.field.attackerIds)};}
test('Homes group by native troop role with separate heroes and ultimates',()=>{
 const {sim,squads}=fixture(),all=squads.groups.flatMap(g=>g.homes);assert.equal(all.length,sim.raid.field.attackerIds.size);assert.equal(new Set(all).size,all.length);
 for(const id of ['melee','ranged','magic','mounted','hero','shade','valkyrie','darkWizard','railSniper'])assert.ok(squads.groups.some(g=>g.id===id),id);
 assert.equal(squadRole('gatlingGunner'),'gatlingGunner');assert.equal(squadRole('sniper'),'ranged');
 for(const g of squads.groups)assert.equal(squads.count(g),sim.allies.filter(s=>g.homes.includes(s.home)&&s.hp>0).length);
});
test('A group rally replaces only its homes’ native banner and clearing restores the keep assault',()=>{
 const {sim,squads}=fixture(),melee=squads.groups.find(g=>g.id==='melee')!,hero=squads.groups.find(g=>g.id==='hero')!,a=sim.engine;
 const ordinary=a.soldiers.find(s=>melee.homes.includes(s.home))!,elite=a.soldiers.find(s=>hero.homes.includes(s.home))!;
 const keep=bannerFor(a,ordinary);assert.equal(keep,a.warBanner);assert.ok(squads.plant(melee,{x:12,y:90}));
 assert.equal(bannerFor(a,ordinary)!.x,12);assert.equal(bannerFor(a,ordinary)!.y,90);assert.equal(bannerFor(a,elite),a.warBanner);
 assert.equal(ordinary.thinkT,0);assert.equal(ordinary.target,-1);assert.deepEqual(ordinary.path,[]);
 const before=(ordinary.x-12)**2+(ordinary.y-90)**2;sim.raid.step(.2);assert.ok((ordinary.x-12)**2+(ordinary.y-90)**2<before,'Native movement turns toward the group destination');
 squads.clear(melee);assert.equal(bannerFor(a,ordinary),keep);assert.ok(melee.homes.every(id=>!a.rallies.has(id)));
 squads.plant(hero,{x:-20,y:1000});assert.deepEqual(squads.at(hero),{x:.5,y:103.5});assert.equal(squads.plant(hero,{x:NaN,y:2}),false);
});
