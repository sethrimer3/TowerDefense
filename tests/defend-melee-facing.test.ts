import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { FACINGS, facingOf, isMelee, meleeFacing, updateFacing } from "../src/defend/melee-facing.ts";
import { BODY_CELL, BODY_DIRECTIONS, BODY_FRAMES, bodyKey } from "../src/defend/melee-body-data.ts";
import { CELLS_W } from "../src/defend/grid.ts";
import type { DefendSim, Enemy, Soldier } from "../src/defend/sim.ts";

const troop = (kind: Soldier["kind"] = "hero"): Soldier => ({id:1,kind,home:-1,x:5,y:5,hp:100,maxHp:100,damage:5,cd:1,target:2,path:[],thinkT:0,flash:0});
const scene = (enemyX=5,enemyY=4.4) => ({time:0,enemies:[{id:2,kind:"roach",x:enemyX,y:enemyY,hp:10}],levels:{},bonuses:{},map:{buildings:[]}} as unknown as DefendSim);

test("melee facing follows actual travel around corners, retains idle and never mutates the unit", () => {
  const u=troop(), sim=scene();
  meleeFacing(sim,u);
  for(const [dx,dy,dir] of [[.1,0,"east"],[0,.1,"south"],[-.1,0,"west"],[0,-.1,"north"]] as const){
    u.x+=dx;u.y+=dy;sim.time+=.1;
    const before=JSON.stringify(u);
    assert.equal(meleeFacing(sim,u).direction,dir);
    // A second paint in one simulation tick must not let the nearby chase
    // target steal facing from movement (swords call the helper twice).
    assert.equal(meleeFacing(sim,u).direction,dir);
    assert.equal(JSON.stringify(u),before);
  }
  sim.enemies=[];sim.time+=.1;
  assert.equal(meleeFacing(sim,u).direction,"north");
  u.path=[8*CELLS_W+8];sim.time+=.1;
  assert.equal(meleeFacing(sim,u).direction,"north","a future path must not turn an idle unit");
});

test("stationary melee troops face live targets in reach, while distant/dead targets leave idle facing alone", () => {
  for(const kind of ["hero","valkyrie","sword","brawler","assassin","spearman","hoplite","lancer"] as const){
    const u=troop(kind),sim=scene(5.5,5);
    assert.equal(meleeFacing(sim,u).direction,"east",kind);
    sim.enemies[0].x=4.5;sim.time++;
    assert.equal(meleeFacing(sim,u).direction,"west",kind);
    sim.enemies[0].hp=0;sim.enemies[0].x=5;sim.enemies[0].y=4.5;sim.time++;
    assert.equal(meleeFacing(sim,u).direction,"west","dead target");
    sim.enemies[0].hp=10;sim.enemies[0].y=-100;sim.time++;
    assert.equal(meleeFacing(sim,u).direction,"west","distant target");
    sim.enemies=[];sim.time++;
    assert.equal(meleeFacing(sim,u).direction,"west","target removed");
  }
});

test("facing handles attack overrides, spawn path intent, replay reset and diagonal hysteresis", () => {
  const u=troop();u.x=u.y=5.5;u.path=[5*CELLS_W+6];
  assert.equal(updateFacing(u,1).direction,"east");
  u.x-=.1;
  assert.equal(updateFacing(u,2,-Math.PI/2).direction,"north","active attack wins over displacement");
  assert.equal(updateFacing(u,3).direction,"north");
  u.path=[6*CELLS_W+5];
  assert.equal(updateFacing(u,0).direction,"south","backwards clock seeds a fresh heading");
  assert.equal(facingOf(Math.PI/4+.05,"east"),"east");
  assert.equal(facingOf(Math.PI/4+.2,"east"),"south");
  assert.equal(facingOf(Math.PI/4-.05,"south"),"south");
  assert.equal(facingOf(Math.PI/4-.2,"south"),"east");
  for(const [angle,dir] of [[0,"east"],[Math.PI/2,"south"],[Math.PI,"west"],[-Math.PI/2,"north"]] as const)
    assert.equal(facingOf(angle+Math.PI*8),dir);
});

test("melee classification includes every melee summon and excludes ranged families", () => {
  for(const kind of ["hero","valkyrie","sword","brawler","assassin","spearman","hoplite","lancer"] as const)assert.ok(isMelee(troop(kind)));
  for(const kind of ["archer","mage","darkWizard","slinger","sniper","musketeer","gunner","machineGunner","gatlingGunner","rocketeer","railSniper","javelineer","shade"] as const)assert.equal(isMelee(troop(kind)),false);
  for(const look of ["warrior","amalgam"] as const)assert.ok(isMelee({...troop("undead"),risen:{look,size:.4,range:0}}));
  assert.equal(isMelee({...troop("undead"),risen:{look:"archer",size:.4,range:4}}),false);
  const called={look:"knight" as const,size:.4,range:0,life:30,post:{x:5,y:5},squad:1};
  assert.ok(isMelee({...troop("reinforcement"),called}));
  assert.equal(isMelee({...troop("reinforcement"),called:{...called,look:"archer",range:4}}),false);
});

test("path-extended spears and Halberdiers use their combat reach for facing", () => {
  const sim=scene(6.5,5);sim.map.buildings=[{structureUid:7}] as typeof sim.map.buildings;
  sim.bonuses={structurePaths:{7:{barracks:{path:"halberdiers",rank:1},spearHall:{path:"longSpears",rank:3}}}};
  for(const kind of ["sword","spearman"] as const){
    const u={...troop(kind),home:0};
    assert.equal(meleeFacing(sim,u).direction,"east",kind);
  }
});

test("directional PNG reproduces its glyph source, with opaque native pixels and padded independent frames", () => {
  execFileSync(process.execPath,["--experimental-transform-types","scripts/pixel-art/melee-facing.ts","--check"]);
  const png=readFileSync(new URL("../public/assets/pixel/v2/units/melee-facing.png",import.meta.url));
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const w=png.readUInt32BE(16),h=png.readUInt32BE(20),chunks:Buffer[]=[];
  assert.equal(w,4*BODY_CELL);assert.equal(h,BODY_FRAMES.length*BODY_CELL);
  for(let offset=8;offset<png.length;){const n=png.readUInt32BE(offset);if(png.toString("ascii",offset+4,offset+8)==="IDAT")chunks.push(png.subarray(offset+8,offset+8+n));offset+=n+12;}
  const data=inflateSync(Buffer.concat(chunks)),stride=w*4+1;
  assert.equal(new Set(BODY_FRAMES.map(f=>f.key)).size,BODY_FRAMES.length);
  BODY_FRAMES.forEach((f,row)=>{
    const front=f.views.south;
    for(const dir of FACINGS){
      const rows=f.views[dir],col=BODY_DIRECTIONS.indexOf(dir);
      assert.equal(rows.length,front.length);assert.ok(rows.length<BODY_CELL-1);
      for(let y=0;y<BODY_CELL;y++)for(let x=0;x<BODY_CELL;x++){
        assert.equal(data[(row*BODY_CELL+y)*stride],0);
        const ch=rows[y-1]?.[x-1]??".",hex=ch==="."?null:f.palette[ch];
        assert.ok(ch==="."||/^#[0-9a-f]{6}$/i.test(hex),`${f.key}/${dir}/${ch}`);
        const at=(row*BODY_CELL+y)*stride+1+(col*BODY_CELL+x)*4;
        assert.equal(data[at+3],hex?255:0);
        if(hex)assert.deepEqual([...data.subarray(at,at+3)],[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
      }
      assert.ok(rows.every(r=>r.length===front[0].length));
    }
  });
  for(const kind of ["hero","valkyrie","warrior","amalgam","knight","champion","sword"] as const){
    const f=BODY_FRAMES.find(f=>f.key===bodyKey(kind))!;
    assert.equal(new Set(FACINGS.map(dir=>f.views[dir].join("\n"))).size,4,`${kind}: distinct upright views`);
  }
});
