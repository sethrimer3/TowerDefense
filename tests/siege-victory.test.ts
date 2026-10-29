import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSim } from '../src/campaign/sim.ts';
import { defaults } from '../src/save.ts';
import { generateCastle } from '../src/campaign/castles.ts';
import { SiegeVictory, collapseOrder } from '../src/campaign/siege-victory.ts';
import { CollapseView } from '../src/defend/collapse-view.ts';
import { flagPixels } from '../src/defend/structure-art.ts';
function fixture(){const save=defaults();return new CampaignSim('siege',0,[],save.defend.owned,save.defend.levels,generateCastle(45,100),save);}
test('Keep first, then every wall and gate by distance, with a stable third of standing structures',()=>{
 const sim=fixture(),hp=sim.raid.defense.hp,order=collapseOrder(sim.map,hp,45);
 assert.equal(order[0].id,sim.raid.field.defenderKeep);assert.equal(order[0].at,0);assert.deepEqual(order,collapseOrder(sim.map,hp,45));
 for(let k=1;k<order.length;k++)assert.ok(order[k].at>=order[k-1].at);
 const walls=sim.map.buildings.filter(b=>!b.hidden&&(b.kind==='wall'||b.kind==='gate'));assert.ok(walls.every(b=>order.some(e=>e.id===b.id)));
 const others=sim.map.buildings.filter(b=>!b.hidden&&!['keep','wall','gate'].includes(b.kind)&&hp[b.id]>0);
 assert.equal(order.filter(e=>!['keep','wall','gate'].includes(e.kind)).length,Math.floor(others.length/3));
 assert.notDeepEqual(order,collapseOrder(sim.map,hp,46));
});
test('Wave, rubble/lighting view and flag burn never write the native battle',()=>{
 const sim=fixture(),native=sim.raid.defense,snapshot=JSON.stringify({map:sim.map,hp:[...native.hp],built:[...native.built],solid:[...native.solid],changed:native.changed,stats:native.stats});
 const victory=new SiegeVictory(sim.map,native.hp,45),view=new CollapseView();
 for(const dt of [.5,1,1.5]){victory.advance(dt);const paint=view.view(native,sim.map,victory.collapsed);for(const id of victory.collapsed){assert.equal(paint.hp[id],0);assert.equal(paint.built[id],0);for(const c of sim.map.buildings[id].cells)assert.equal(paint.solid[c],0);}paint.changed.splice(0);}
 assert.equal(JSON.stringify({map:sim.map,hp:[...native.hp],built:[...native.built],solid:[...native.solid],changed:native.changed,stats:native.stats}),snapshot);
 const face={base:4,layers:[]};assert.notDeepEqual(flagPixels(0,true,false,face),flagPixels(0,true,false,face,1));
});
test('Skip completes every collapse, Reduce Motion is instant and outlying flags finish before results',()=>{
 const sim=fixture(),normal=new SiegeVictory(sim.map,sim.raid.defense.hp,45,false,[{x:0,y:100}]);assert.ok(normal.duration>4);normal.advance(.5);assert.equal(normal.done,false);normal.skip();assert.equal(normal.done,true);assert.equal(normal.collapsed.size,normal.order.length);
 const reduced=new SiegeVictory(sim.map,sim.raid.defense.hp,45,true);assert.equal(reduced.done,true);assert.equal(reduced.collapsed.size,reduced.order.length);assert.deepEqual(reduced.shake,{x:0,y:0});
});

test('The render view keeps its identity from battle through victory and reads live damage before collapse',()=>{
 const sim=fixture(),native=sim.raid.defense,model=new CollapseView(),empty=new Set<number>(),view=model.view(native,sim.map,empty),id=native.keepId;
 native.hp[id]-=1;assert.equal(model.view(native,sim.map,empty),view);assert.equal(view.hp[id],native.hp[id]);
 assert.equal(model.view(native,sim.map,new Set([id])),view);assert.equal(view.hp[id],0);assert.ok(native.hp[id]>0);
});
