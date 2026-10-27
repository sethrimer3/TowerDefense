import test from 'node:test';import assert from 'node:assert/strict';
import { AmbushGrid } from '../src/campaign/ambush-grid.ts';
import { AmbushSim,AMBUSH_PALETTE } from '../src/campaign/ambush-sim.ts';
import { generateCity,CellType } from '../src/defend/citygen.ts';
import { CELL_COUNT,CELLS_W,cellIndex } from '../src/defend/grid.ts';
import { defaults } from '../src/save.ts';import { forestPlan } from '../src/defend/forest.ts';
import { freeSpot,build } from './ambush-helpers.ts';
test('Native quarter-grid blocks water, road, walls, spawn edge, towns and the keep while preserving a clear ring',()=>{
 const city=new Uint8Array(CELL_COUNT),wall=new Uint8Array(CELL_COUNT),map=generateCity({city,wall,structures:[{uid:0,kind:'keep',rect:{x:50,y:90,w:4,h:4},tx:6,ty:11,inside:false}]},45);
 map.type[cellIndex(12,12)]=CellType.WATER;map.type[cellIndex(16,12)]=CellType.WALL;
 const grid=new AmbushGrid(map,'desert',new Set([cellIndex(20,12)]),{x:40,y:80,w:24,h:20},[{x:20,y:40,w:16,h:16}]);
 for(const [qx,qy] of [[6,6],[8,6],[10,6],[0,10],[10,0],[25,45],[12,21]])assert.equal(grid.check('archerTower',qx,qy,[]).fits,false);
 assert.ok(grid.check('archerTower',2,2,[]).fits);
 const b={id:1,kind:'archerTower' as const,qx:2,qy:2};
 assert.equal(grid.check('archerTower',3,2,[b]).fits,false,'Touching footprints must retain a clear quarter.');
 assert.ok(grid.check('archerTower',4,2,[b]).fits);assert.ok(grid.check('archerTower',2,2,[b],1).fits);
});
test('Actual Mossbound water and boulder geometry is unbuildable',()=>{
 const s=new AmbushSim(0,defaults()),forest=forestPlan(s.map);
 assert.ok(forest.boulders.length>0);for(const b of forest.boulders)assert.ok(b.cells.every(c=>s.grid.blocked[c]===1));
 for(const lake of forest.lakes)for(const d of lake.discs)assert.equal(s.grid.blocked[Math.floor(d.y)*CELLS_W+Math.floor(d.x)],1);
});
test('Free placements, moves and in-wave sales keep native garrisons stable without modifying Defend',()=>{
 const save=defaults(),before=JSON.stringify(save.defend),s=new AmbushSim(0,save);s.gold=10000;
 const a=build(s,'meleeGuild'),b=build(s,'rangedGuild'),move=freeSpot(s,'meleeGuild');
 assert.equal(s.moveTo(a.id,0,0),false);assert.ok(s.moveTo(a.id,move.qx,move.qy));s.start();s.step(1/30);
 assert.ok(s.engine.soldiers.some(u=>u.home===a.id));assert.ok(s.engine.soldiers.some(u=>u.home===b.id));
 assert.ok(s.remove(a.id));assert.ok(!s.engine.soldiers.some(u=>u.home===a.id));assert.ok(s.engine.soldiers.some(u=>u.home===b.id));
 assert.ok(build(s,'archerTower'));assert.equal(JSON.stringify(save.defend),before);assert.equal(AMBUSH_PALETTE.length,5);
});
test('Ambush starts from native base combat rather than borrowing Smithy or Knowledge power',()=>{
 const save=defaults();save.defend.levels.archerDamage=6;save.training.towerDamage=5;save.knowledge=1234;
 const before=JSON.stringify(save),s=new AmbushSim(0,save);assert.equal(s.engine.levels.archerDamage,0);assert.equal(s.engine.bonuses.towerDamage,1);
 assert.equal(s.placeAt('watchTower',2,2),false);assert.equal(s.placeAt('keep',2,2),false);assert.equal(JSON.stringify(save),before);
});
