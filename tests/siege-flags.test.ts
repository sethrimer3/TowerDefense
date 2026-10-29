import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignSim } from '../src/campaign/sim.ts';
import { generateCastle } from '../src/campaign/castles.ts';
import { defaults } from '../src/save.ts';
import { SiegeFlags, flagPoles } from '../src/campaign/siege-flags.ts';
import { flagPixels } from '../src/defend/structure-art.ts';
const face={base:4,layers:[{pattern:'cross' as const,color:3}]};
function fixture(){const s=defaults();return new CampaignSim('siege',0,[],s.defend.owned,s.defend.levels,generateCastle(45,100),s);}
test('Seeded poles occupy eight separate open sites without changing the native map',()=>{
 const sim=fixture(), before=JSON.stringify(sim.map), poles=flagPoles(sim.map,45);
 assert.equal(poles.length,8);assert.deepEqual(poles,flagPoles(sim.map,45));assert.notDeepEqual(poles,flagPoles(sim.map,46));
 for(const p of poles){assert.ok(!sim.map.buildings.some(b=>!b.hidden&&p.x>=b.rect.x&&p.x<b.rect.x+b.rect.w&&p.y>=b.rect.y&&p.y<b.rect.y+b.rect.h));for(const q of poles)if(p!==q)assert.ok((p.x-q.x)**2+(p.y-q.y)**2>=36);}
 assert.equal(JSON.stringify(sim.map),before);
});
test('One blast snaps only poles in range and does not touch the simulation',()=>{
 const sim=fixture(),flags=new SiegeFlags(sim.map,45,face),p=flags.poles[0];sim.start();
 sim.engine.effects.push({kind:'boom',x:p.x,y:p.y,r:1,t:0});
 const snapshot=()=>JSON.stringify({map:sim.map,hp:[...sim.engine.hp],solid:[...sim.engine.solid],units:sim.engine.soldiers,effects:sim.engine.effects});
 const before=snapshot();flags.update(sim.engine);assert.equal(flags.poles.filter(p=>p.snapped!==undefined).length,1);assert.equal(snapshot(),before);
});
test('Custom cloth uses the owner face, waves and holds still under Reduce Motion',()=>{
 assert.notDeepEqual(flagPixels(0,true,false,face),flagPixels(0,true));
 assert.deepEqual(flagPixels(0,true,false,face),flagPixels(12,true,false,face));
 assert.notDeepEqual(flagPixels(0,false,false,face),flagPixels(.5,false,false,face));
});
