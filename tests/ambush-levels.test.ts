import test from 'node:test';
import assert from 'node:assert/strict';
import { AMBUSH_LEVELS, trackFor, pointAlong, decodeAmbush, totalStars, levelUnlocked, recordStars } from '../src/campaign/levels.ts';
import { CELLS_W, CELLS_H } from '../src/defend/grid.ts';
import { dist } from '../src/exact.ts';
test('Thirty seeded levels span all zones and make bounded non-crossing edge-to-keep tracks', () => {
 assert.equal(AMBUSH_LEVELS.length, 30);assert.equal(new Set(AMBUSH_LEVELS.map(l => l.seed)).size, 30);
 for (const level of AMBUSH_LEVELS) {
  const track=trackFor(level);assert.deepEqual(track,trackFor(level));assert.equal(track.entry.x,0);assert.deepEqual(track.points.at(-1),track.keep);
  assert.ok(track.points.length>=5&&track.points.length<=8);
  for(const p of track.points)assert.ok(p.x>=0&&p.x<CELLS_W&&p.y>0&&p.y<CELLS_H);
  const segments=track.points.slice(1).map((b,i)=>({a:track.points[i],b}));
  for(let i=0;i<segments.length;i++)for(let j=i+2;j<segments.length;j++){
   const a=segments[i],b=segments[j],horizontal=a.a.y===a.b.y;
   if(horizontal===(b.a.y===b.b.y))continue;
   const h=horizontal?a:b,v=horizontal?b:a;
   assert.ok(!(v.a.x>=Math.min(h.a.x,h.b.x)&&v.a.x<=Math.max(h.a.x,h.b.x)&&h.a.y>=Math.min(v.a.y,v.b.y)&&h.a.y<=Math.max(v.a.y,v.b.y)),'Track must not cross itself');
  }
  const length=segments.reduce((n,s)=>n+dist(s.b.x-s.a.x,s.b.y-s.a.y),0);assert.ok(length>180&&length<260);
  assert.deepEqual(track.outposts,[pointAlong(track.points,1/3),pointAlong(track.points,2/3)]);
  assert.ok(track.outposts.every(p=>p.x>8&&p.x<CELLS_W-8&&p.y>8&&p.y<CELLS_H-8));
 }
});
test('Best stars preserve improvements, unlock the next level and migrate old clears without pad layouts',()=>{
 const p=decodeAmbush({cleared:2,layouts:[[{pad:0,kind:'archerTower'}]]});assert.equal(totalStars(p),2);assert.ok(levelUnlocked(p,2));assert.equal(levelUnlocked(p,3),false);assert.equal('layouts' in p,false);
 assert.equal(recordStars(p,AMBUSH_LEVELS[0],3),2);assert.equal(recordStars(p,AMBUSH_LEVELS[0],1),0);assert.equal(totalStars(p),4);
 recordStars(p,AMBUSH_LEVELS[2],1);assert.ok(levelUnlocked(p,3));assert.equal(levelUnlocked(p,4),false);
 assert.deepEqual(decodeAmbush(p),p);
 assert.deepEqual(decodeAmbush({stars:{'moss-1':3,'moss-2':4,'desert-1':NaN,bogus:3}}),{stars:{'moss-1':3}});
 for(const raw of [null,[],{},false])assert.equal(totalStars(decodeAmbush(raw)),0);
});
