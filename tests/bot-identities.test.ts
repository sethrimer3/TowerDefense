import test from 'node:test';import assert from 'node:assert/strict';
import {botName,allowedBotName} from '../src/campaign/bot-names.ts';
import {botFlag,flagContrast} from '../src/campaign/bot-identity.ts';
import {cleanName,decodeFlag} from '../src/profile/model.ts';
import {generateCastle,decodeCastle} from '../src/campaign/castles.ts';
import {defaults,decode} from '../src/save.ts';import {newSiege} from '../src/campaign/siege-progress.ts';
test('100,000 seeded handles are deterministic, valid, diverse and clear of prohibited combinations',()=>{
 const names=new Set<string>();for(let seed=0;seed<100000;seed++){const name=botName(seed);assert.equal(name,botName(seed));assert.equal(cleanName(name),name);assert.ok(allowedBotName(name));assert.match(name,/^[A-Za-z0-9_]{2,24}$/);names.add(name);}assert.ok(names.size>10000);
});
test('Seeded flags are bounded, use readable contrasting layers and decode independently',()=>{
 const designs=new Set<string>();for(let seed=0;seed<10000;seed++){const f=botFlag(seed);assert.deepEqual(f,botFlag(seed));assert.deepEqual(decodeFlag(f),f);assert.ok(f.layers.length<=4);let previous=f.base;for(const layer of f.layers){assert.ok(flagContrast(previous,layer.color)>=85);previous=layer.color;}if(f.layers.length)assert.equal(f.layers[0].opacity,100);designs.add(JSON.stringify(f));}assert.ok(designs.size>5000);
});
test('Offers save their identities; legacy and malformed optional flags preserve the rest of the castle',()=>{
 const c=generateCastle(45,1000);assert.equal(c.owner.name,botName(45));assert.deepEqual(c.owner.flag,botFlag(45));assert.deepEqual(decodeCastle(c),c);
 const old=structuredClone(c);delete old.owner.flag;assert.deepEqual(decodeCastle(old),old);
 const bad=structuredClone(c);bad.owner.flag={base:999,layers:[]};assert.deepEqual(decodeCastle(bad),old);
 const g=defaults();g.siege=newSiege(45);assert.deepEqual(decode(JSON.stringify(g)).siege,g.siege);
});

test('Revision-1 identity changes preserve the existing castle geometry and combat budgets',async()=>{
 const {createHash}=await import('node:crypto');
 for(const [seed,expected] of [[1,'7e41ed3686a21cb719b2ea7eeedf85241023b3ed820f467022f6476de0f2eefb'],[45,'d7c41908e5a5f85dbcd948283a93ff4ab4708e95557abf528cbf5666936f7fe1'],[7907,'5a24bedd703a276206fb398539285306a112b9da51ce85fca26f82750f3fea18']] as const){const {defenses,guards}=generateCastle(seed,1000);assert.equal(createHash('sha256').update(JSON.stringify({defenses,guards})).digest('hex'),expected);}
});
