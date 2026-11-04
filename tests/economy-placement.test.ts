import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, decode } from '../src/save.ts';
import { realmActive } from '../src/realm.ts';
import { EditSession } from '../src/defend/edit-session.ts';
import { structureKey } from '../src/defend/drag-rules.ts';
import { fitLayout, placeCityTile, placeStructureAt, moveStructureTo, QUARTER } from '../src/defend/layout.ts';
import { SUB } from '../src/defend/grid.ts';
function fixture(){const s=defaults(),k=s.defend.layout.keep;for(const dx of [1,2,3])s.defend.layout=placeCityTile(s.defend.layout,k.tx+dx,k.ty)!;return s;}
test('economy buildings snap over every part of a tile and preview its entire reservation',()=>{
 for(const kind of ['mine','library'] as const){
  const s=fixture(),k=s.defend.layout.keep,tx=k.tx+1,ty=k.ty;
  const drag={from:'palette' as const,item:kind};
  for(const dx of [.1,2.1,4.1,7.9])for(const dy of [.1,3.2,7.9]){
   const x=tx*SUB+dx,y=ty*SUB+dy;
   assert.equal(structureKey(drag,s.defend.layout,x,y),`${tx*QUARTER},${ty*QUARTER}`);
   const edit=new EditSession(drag,s.defend.layout);edit.hover({cellX:x,cellY:y,overBoard:true,overPalette:false});
   assert.deepEqual(edit.overlay()!.quarters,{rect:{x:tx*SUB,y:ty*SUB,w:SUB,h:SUB},fits:true,clear:false});
   const drop=edit.release({cellX:x,cellY:y,overBoard:true,overPalette:false});assert.equal(drop.kind,'build');
   if(drop.kind==='build')assert.deepEqual(drop.layout.structures[0],{uid:1,kind,tx,ty,qx:tx*QUARTER,qy:ty*QUARTER});
  }
 }
});
test('a reserved economy tile refuses other structures, including bait and another economy building',()=>{
 const s=fixture(),k=s.defend.layout.keep,q={qx:(k.tx+1)*QUARTER,qy:k.ty*QUARTER};
 const l=placeStructureAt(s.defend.layout,'mine',{qx:q.qx+1,qy:q.qy+2})!;assert.ok(l);
 for(const kind of ['watchTower','monsterBait','library'] as const)for(let x=0;x<4;x++)for(let y=0;y<4;y++)
  assert.equal(placeStructureAt(l,kind,{qx:q.qx+x,qy:q.qy+y}),null);
 const moved=moveStructureTo(l,l.structures[0].uid,{qx:q.qx+4+1,qy:q.qy+2})!;
 assert.ok(moved);assert.deepEqual([moved.structures[0].qx,moved.structures[0].qy],[q.qx+4,q.qy]);
 assert.ok(placeStructureAt(moved,'watchTower',q),'lifting frees the whole old tile');
 const occupied=placeStructureAt(s.defend.layout,'monsterBait',q)!;
 assert.equal(placeStructureAt(occupied,'mine',q),null,'cannot displace an existing building during normal placement');
});
test('previous smaller, shared economy placements migrate without losing either building or crew progress',()=>{
 const s=fixture(),k=s.defend.layout.keep,tx=k.tx+1,ty=k.ty;
 s.defend.layout.structures=[{uid:1,kind:'mine',tx,ty,qx:tx*QUARTER+1,qy:ty*QUARTER},{uid:2,kind:'library',tx,ty,qx:tx*QUARTER+1,qy:ty*QUARTER+2}];s.defend.layout.nextUid=3;s.knowledge=123;
 const back=decode(JSON.stringify(s));assert.ok(realmActive(back,'mine'));assert.ok(realmActive(back,'library'));
 const [mine,library]=back.defend.layout.structures;assert.notDeepEqual([mine.tx,mine.ty],[library.tx,library.ty]);
 assert.ok(fitLayout(back.defend.layout).ok);assert.equal(back.knowledge,123);
 assert.deepEqual(decode(JSON.stringify(back)),back);
});
test('migration returns upgraded co-tenants to the collection with their Knowledge intact',()=>{
 const s=fixture(),k=s.defend.layout.keep,tx=k.tx+1,ty=k.ty;s.defend.owned.brazierTower=2;s.equipment=[{id:1,kind:'brazierTower',uid:2,hp:3,power:4},{id:2,kind:'brazierTower',slot:0,hp:5,power:6}];
 s.defend.layout.structures=[{uid:1,kind:'mine',tx,ty,qx:tx*QUARTER,qy:ty*QUARTER},{uid:2,kind:'brazierTower',tx,ty,qx:tx*QUARTER+2,qy:ty*QUARTER+2,path:'fireArrows',rank:1}];s.defend.layout.nextUid=3;
 const back=decode(JSON.stringify(s));assert.ok(realmActive(back,'mine'));assert.equal(back.defend.owned.brazierTower,2);
 assert.ok(back.defend.kept.some(k=>k.kind==='brazierTower'&&k.path==='fireArrows'&&k.rank===1));
 assert.equal(back.equipment?.[0].hp,3);assert.equal(back.equipment?.[0].power,4);assert.equal(back.equipment?.[0].uid,undefined);
 assert.equal(back.equipment?.length,2);assert.equal(back.equipment?.[1].slot,1);assert.equal(back.equipment?.[1].power,6);
 assert.deepEqual(decode(JSON.stringify(back)).equipment,back.equipment);
});
