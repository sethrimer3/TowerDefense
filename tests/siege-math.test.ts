import test from 'node:test';import assert from 'node:assert/strict';
import { ratioPow,binaryLog } from '../src/exact.ts';
import { expectedWin } from '../src/campaign/siege-rating.ts';
import { generateCastle,estimateCastle } from '../src/campaign/castles.ts';
test('Exact ratio powers and binary logarithms preserve rating precision across the full range',()=>{
 for(const base of [2,10])for(let n=-2900;n<=2900;n+=17){const value=ratioPow(base,n,400),reference=base**(n/400);assert.ok(Math.abs(value-reference)/reference<2e-14);if(base===2)assert.ok(Math.abs(binaryLog(value)-n/400)<2e-14);}
 for(let rating=100;rating<=3000;rating+=37){const c=generateCastle(45,rating);assert.ok(Math.abs(estimateCastle(c).rating-rating)<=1);assert.equal(expectedWin(rating,rating),.5);}
 for(const [a,b] of [[100,3000],[800,1200],[1900,2100]])assert.ok(Math.abs(expectedWin(a,b)+expectedWin(b,a)-1)<1e-12);
});

test('Ratio power handles bounded-work large integer exponents and rejects invalid inputs',()=>{
 assert.equal(ratioPow(1,1000000,1),1);assert.equal(ratioPow(.5,2000,1),0);assert.equal(ratioPow(.5,-2000,1),Infinity);
 assert.ok(Math.abs(ratioPow(1.00001,2000,1)-1.00001**2000)<1e-12);
 for(const args of [[0,1,2],[2,.5,1],[2,1,0],[Infinity,1,1]])assert.ok(Number.isNaN(ratioPow(...args as [number,number,number])));
});

test('Siege battle-adjacent modules contain no platform-dependent transcendental calls',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const name of ['sim','raid','battlefield','castles']){
  const source=await readFile(new URL('../src/campaign/'+name+'.ts',import.meta.url),'utf8');
  const code=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'');
  assert.doesNotMatch(code,/\*\*|Math\.(?:hypot|pow|log\w*|exp|(?:a)?(?:sin|cos|tan)\w*)\s*\(/,name);
 }
});
