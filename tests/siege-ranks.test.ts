import test from 'node:test';import assert from 'node:assert/strict';
import {rankOf,rankLabel,DIVISION_WIDTH,RANKS,DIVISIONS} from '../src/campaign/siege-ranks.ts';
import {emblemPixels} from '../src/ui/rank-emblems.ts';
test('Every MMR has one contiguous tier with inclusive floors and bounded progress',()=>{
 for(let n=100;n<=3000;n++){const r=rankOf(n);assert.ok(n>=r.floor&&n<=r.ceiling);assert.ok(r.progress>=0&&r.progress<=1);assert.equal(r.rank,RANKS[Math.floor(r.tier/5)]);assert.equal(r.division,DIVISIONS[r.tier%5]);if(n>100){const prev=rankOf(n-1);assert.ok(r.tier===prev.tier||r.tier===prev.tier+1);if(r.tier!==prev.tier){assert.equal(r.floor,n);assert.equal(prev.ceiling,n-1);assert.equal(r.progress,0);}}}
 for(let tier=0;tier<35;tier++)assert.equal(rankOf(tier*DIVISION_WIDTH).tier,tier);
 assert.equal(rankLabel(1000),'Gold III');assert.equal(rankOf(2720).rank,'grandmaster');assert.equal(rankOf(3000).division,'I');assert.equal(rankOf(3000).progress,1);assert.equal(rankOf(NaN).tier,rankOf(1000).tier);
});
test('Every rank and division has a distinct bounded procedural badge',()=>{
 const designs=new Set<string>();for(const rank of RANKS)for(const division of DIVISIONS){const pixels=emblemPixels(rank,division);assert.ok(pixels.size>100);assert.ok([...pixels.keys()].every(p=>p>=0&&p<576));assert.ok([...pixels.values()].every(c=>/^#[0-9a-f]{6}$/i.test(c)));designs.add(JSON.stringify([...pixels]));}assert.equal(designs.size,35);
});
