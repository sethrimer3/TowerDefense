import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CityLife, CITY_LIFE } from '../src/defend/city-life.ts';
import { PERSON_TORCH_STRENGTH, TORCH_DUSK, TORCH_DAWN, torchDelay, torchLevel } from '../src/defend/city-torches.ts';
import { skyAtTime } from '../src/daylight.ts';
import { cityLights } from '../src/defend/lighting.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout, placeCityTile, placeGate } from '../src/defend/layout.ts';
import { CELLS_W, CELLS_H } from '../src/defend/grid.ts';
import { cellAt } from '../src/defend/pathing.ts';
import { heights, HEIGHT } from '../src/defend/shadow-art.ts';
import { ART } from '../src/defend/art-scale.ts';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultDefendSave } from '../src/defend/progress.ts';

function city(gate = true) {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[0,-1],[1,0],[1,-1]]) l = placeCityTile(l,tx+dx,ty+dy)!;
  if (gate) l = placeGate(l,{tx,ty:ty-1,side:'n'})!;
  const fit=fitLayout(l); assert.ok(fit.ok);
  return generateCity(fit,11);
}
function tick(life: CityLife, seconds: number, night = true, enemies: {x:number;y:number;hp:number}[] = []) {
  for(let i=0;i<seconds*30;i++) life.update(1/30,220000,night,false,enemies);
}

test('individual torches ignite around near-vanished shadows and extinguish at dawn', () => {
  assert.ok(Math.abs(skyAtTime(TORCH_DUSK).sun.strength-.035)<1e-5);
  assert.ok(TORCH_DAWN>TORCH_DUSK);
  const offsets = Array.from({length:100},(_,i)=>torchDelay(i,12,30));
  assert.ok(offsets.every(n=>n>=-5000&&n<=5000));
  assert.equal(new Set(offsets).size,100);
  for(let i=0;i<100;i++) {
    assert.equal(torchLevel(TORCH_DUSK+offsets[i]-1,i,12,30),0);
    assert.equal(torchLevel(TORCH_DUSK+offsets[i]+701,i,12,30),1);
    assert.equal(torchLevel(220000,i,12,30),1);
    assert.equal(torchLevel(60000,i,12,30),0);
    assert.equal(torchLevel(TORCH_DAWN+offsets[i]+1,i,12,30),0);
  }
});

test('wall sconces stand outside the wall and illuminate open terrain', () => {
  const map=city(), lamps=cityLights(map).filter(l=>map.buildings[l.owner].kind==='wall');
  assert.ok(lamps.length>=3);
  for(const l of lamps) {
    assert.equal(map.city[cellAt(l.x,l.y)],0);
    assert.equal(l.inside,false);assert.equal(l.radius,5.5);
    assert.equal(l.strength,PERSON_TORCH_STRENGTH*2);
  }
});

test('townsfolk make safe errands, watchmen use gates only at night, and handheld lights are half strength', () => {
  for(const gated of [true,false]) {
    const map=city(gated), life=new CityLife();life.sync(map,null,false);
    const before=life.people.map(p=>[p.x,p.y]);
    tick(life,35,false);
    assert.ok(life.people.some((p,i)=>p.role==='townsfolk'&&Math.hypot(p.x-before[i][0],p.y-before[i][1])>1));
    const guards=life.visible.filter(p=>p.role==='watchman');
    assert.ok(guards.length>0,'watchmen also patrol inside during the day');
    assert.ok(guards.every(p=>map.city[cellAt(p.x,p.y)]),'day patrols stay inside');
    let outside=false;
    for(let i=0;i<180*30;i++) {
      life.update(1/30,220000,true,false,[]);
      for(const p of life.visible) {
        assert.equal(life.solid[cellAt(p.x,p.y)],0,'never walks through buildings');
        if(!map.city[cellAt(p.x,p.y)]) {assert.equal(p.role,'watchman');outside=true;}
      }
    }
    assert.equal(outside,gated,'outside patrols need a gate');
    const lamps=life.lights(220000);assert.ok(lamps.length>0);
    assert.ok(lamps.every(l=>l.k===PERSON_TORCH_STRENGTH));
    assert.equal(life.lights(60000).length,0);
    assert.ok(life.people.length<=CITY_LIFE.townsfolk+CITY_LIFE.watchmen);
  }
});

test('an inside watchman runs to a building; an outside watchman runs off the board', () => {
  const map=city(), life=new CityLife();life.sync(map,null,false);
  const guard=life.people.find(p=>p.role==='watchman')!;
  guard.hidden=false;guard.mode='walk';guard.x+=1;
  assert.equal(life.solid[cellAt(guard.x,guard.y)],0);
  const threat={x:guard.x+.2,y:guard.y,hp:10};
  tick(life,1/30,true,[threat]);
  assert.equal(guard.mode,'shelter');assert.ok(guard.path.length>0);
  tick(life,30,true,[threat]);assert.equal(guard.hidden,true);
  // Use the open north edge, well outside the wall, so the entire escape is visible.
  guard.x=2.5;guard.y=2.5;guard.hidden=false;guard.mode='walk';guard.path=[];
  tick(life,.2,true,[{x:3,y:3,hp:10}]);
  assert.equal(guard.mode,'escape');assert.equal(guard.hidden,false);
  tick(life,10,true,[{x:3,y:3,hp:10}]);
  assert.equal(guard.mode,'gone');assert.equal(guard.hidden,true);
  assert.ok(guard.x<0||guard.y<0||guard.x>CELLS_W||guard.y>CELLS_H);
});

test('residents pause with reduced motion and never mutate native battle arrays or random state', () => {
  const map=city(), sim=new DefendSim(map,defaultDefendSave().levels,3), life=new CityLife();
  life.sync(map,sim,false);
  const own=sim.ownSolid.slice(),solid=sim.solid.slice();
  const control=new DefendSim(map,defaultDefendSave().levels,3);
  const counts=[sim.enemies.length,sim.soldiers.length,sim.civilians.length];
  tick(life,20);
  const pose=life.people.map(p=>[p.x,p.y]);
  life.update(.1,220000,true,true,[]);
  assert.deepEqual(life.people.map(p=>[p.x,p.y]),pose);
  assert.deepEqual(sim.ownSolid,own);assert.deepEqual(sim.solid,solid);
  assert.deepEqual(Array.from({length:10},()=>sim.rand()),Array.from({length:10},()=>control.rand()));
  assert.deepEqual([sim.enemies.length,sim.soldiers.length,sim.civilians.length],counts);
});

test('keep heights include padded sprite edges, trim transparent corners and retain varied roof heights', () => {
  const map=city(), keep=map.buildings.find(b=>b.kind==='keep')!;
  const x0=keep.rect.x*ART-1,y0=keep.rect.y*ART-1,w=keep.rect.w*ART+2,h=keep.rect.h*ART+2;
  const mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x>1&&x<w-2||y>1&&y<h-2)mask[y*w+x]=1;
  const field=heights(map,b=>b===keep,()=>({x0,y0,w,h,mask})),width=CELLS_W*ART;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    if(mask[y*w+x])assert.ok(field[(y0+y)*width+x0+x]>0,`edge ${x},${y} stays attached`);
    else assert.equal(field[(y0+y)*width+x0+x],0,'no rectangular corner');
  }
  assert.ok(field.some(n=>n===HEIGHT.keep.tower));
  assert.ok(field.some(n=>n===HEIGHT.keep.court));
});
