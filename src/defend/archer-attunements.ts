/** Archer Barracks attunements. Only attuned archers create this state;
 * ordinary arrows, towers and the spear line retain their existing behavior. */
import { BOW_JAVELIN, SKYRANGER, SKIRMISH, pathRank } from "../knowledge-paths.ts";
import { buildingPaths } from "../specializations.ts";
import { ENEMIES, enemySize } from "./catalog.ts";
import { damageModifier } from "./enemy-abilities.ts";
import { CELLS_H, CELLS_W, SUB, cellInBounds, hash01 } from "./grid.ts";
import { blocked } from "./pathing.ts";
import type { Arrow, DefendSim, Enemy, Soldier } from "./sim.ts";

export type BowJavelin = {
  id: number; ux: number; uy: number; left: number; push: number;
  maxHits: number; rank: number; hits: number[]; pierced: number;
  carried: { enemy: Enemy; along: number; across: number }[];
  impacted: boolean; ended?: true;
};
export type SkyArrow = { t: number; delay: number; rain: boolean };

export function archerAttunement(sim: DefendSim, home: number) {
  const b = sim.map.buildings[home], p = buildingPaths(sim, b);
  const javelin = pathRank(p, "rangerLodge", "rangers"), skirmish = pathRank(p, "skirmishCamp", "skirmishers"), sky = pathRank(p, "skyrangerLodge", "skyranger");
  return { javelin, skirmish, sky, bowman: b?.kind === "rangerLodge" || javelin > 0,
    skirmisher: b?.kind === "skirmishCamp" || skirmish > 0, skyranger: b?.kind === "skyrangerLodge" || sky > 0 };
}

/** Stable order, with full volleys even against one enemy. */
export function skirmishTargets(sim: DefendSim, s: Soldier, first: Enemy, range: number, rank: number) {
  const pool = sim.enemiesNear(s.x,s.y,range).filter(e=>!e.untargetable&&e.hp>0 && e!==first)
    .sort((a,b)=>(a.x-s.x)**2+(a.y-s.y)**2-((b.x-s.x)**2+(b.y-s.y)**2) || a.id-b.id);
  pool.unshift(first);
  return Array.from({length:SKIRMISH.arrows[rank]},(_,i)=>pool[i%pool.length]);
}

export function looseBowJavelin(sim: DefendSim, s: Soldier, e: Enemy, damage: number, range: number, rank: number) {
  const d = Math.hypot(e.x-s.x,e.y-s.y) || 1;
  sim.arrows.push({x:s.x,y:s.y,origin:{x:s.x,y:s.y,attacker:s.id},target:-1,tx:e.x,ty:e.y,
    damage:damage*BOW_JAVELIN.damage,life:10,shot:"javelin",bowJavelin:{
      id:sim.newId(),ux:(e.x-s.x)/d,uy:(e.y-s.y)/d,left:range+1,push:BOW_JAVELIN.push[rank]*SUB,
      maxHits:BOW_JAVELIN.hits[rank],rank,hits:[],pierced:0,carried:[],impacted:false,
    }});
}

/** Map existing protection to impalement resistance, independently of damage. */
export function resistsJavelin(sim: DefendSim, a: Arrow, e: Enemy) {
  const def=ENEMIES[e.kind];
  return !!(def.boss || def.fortress || e.fortressPart || def.boat || def.unyielding || e.impaled !== undefined ||
    (def.damageScale?.physical ?? 1)<1 || damageModifier(sim,e,a.origin,"ranged",true)<1);
}

function endJavelin(sim: DefendSim, a: Arrow) {
  const j=a.bowJavelin!;
  if(j.ended)return;
  j.ended=true;a.life=0;
  for(const {enemy} of j.carried)if(enemy.impaled===j.id)delete enemy.impaled;
  j.carried.length=0;
  if(j.impacted && BOW_JAVELIN.blast[j.rank]) {
    sim.reindexAfterDisplacement();
    const radius=(BOW_JAVELIN.blast[j.rank]+BOW_JAVELIN.growth[j.rank]*j.pierced)*SUB;
    sim.explode(a.x,a.y,{r:Math.min(Math.hypot(CELLS_W,CELLS_H),radius),damage:a.damage*BOW_JAVELIN.blastDamage[j.rank],friendlyFire:false,origin:a.origin});
  }
}

/** Swept collision candidates once per tick, then short movement steps so
 * neither the shaft nor any carried body can tunnel through a wall. */
export function stepBowJavelin(sim: DefendSim, a: Arrow, dt: number) {
  const j=a.bowJavelin!;
  if(a.life<=0){endJavelin(sim,a);return;}
  const travel=BOW_JAVELIN.speed*dt,x0=a.x,y0=a.y;
  const along=(e:Enemy)=>(e.x-x0)*j.ux+(e.y-y0)*j.uy;
  const candidates=sim.enemies.filter(e=>{
    if(e.hp<=0 || j.hits.includes(e.id))return false;
    const w=BOW_JAVELIN.width+enemySize(e)/2,t=along(e);
    return t>=-w && t<=travel+w && Math.abs((e.x-x0)*j.uy-(e.y-y0)*j.ux)<=w;
  }).sort((a,b)=>along(a)-along(b)||a.id-b.id);
  let moved=false,remaining=travel;
  while(remaining>1e-8 && a.life>0){
    const step=Math.min(.1,remaining,j.left),nx=a.x+j.ux*step,ny=a.y+j.uy*step;
    if(step<=1e-8){endJavelin(sim,a);break;}
    // A shaft can fly over terrain before impact. Once carrying a ground
    // enemy, every transported position must be passable.
    const collision=blocked(sim.foeSolid,nx,ny) || j.carried.some(({enemy,along,across})=>{
      if(enemy.hp<=0)return false;
      const x=nx+j.ux*along-j.uy*across,y=ny+j.uy*along+j.ux*across;
      return ENEMIES[enemy.kind].flying?!cellInBounds(x,y):blocked(sim.foeSolid,x,y);
    });
    if(collision){endJavelin(sim,a);break;}
    a.x=nx;a.y=ny;j.left-=step;remaining-=step;
    for(const c of j.carried){
      if(c.enemy.hp<=0){if(c.enemy.impaled===j.id)delete c.enemy.impaled;continue;}
      c.enemy.x=nx+j.ux*c.along-j.uy*c.across;c.enemy.y=ny+j.uy*c.along+j.ux*c.across;moved=true;
    }
    for(const e of candidates){
      if(e.hp<=0 || j.hits.includes(e.id) || Math.hypot(e.x-nx,e.y-ny)>BOW_JAVELIN.width+enemySize(e)/2)continue;
      if(j.hits.length>=j.maxHits){endJavelin(sim,a);break;}
      const resistant=resistsJavelin(sim,a,e);
      const landed=sim.hurtEnemy(e,a.damage,true,"ranged",a.origin,true);
      j.hits.push(e.id);
      if(!j.impacted){j.impacted=true;j.left=j.push;}
      if(!landed || resistant){endJavelin(sim,a);break;}
      j.pierced++;
      if(e.hp>0){
        e.impaled=j.id;
        j.carried.push({enemy:e,along:(e.x-nx)*j.ux+(e.y-ny)*j.uy,across:-(e.x-nx)*j.uy+(e.y-ny)*j.ux});
      }
    }
    if(j.left<=1e-8 && a.life>0)endJavelin(sim,a);
  }
  // Rebuild once after the group moves. Later tower/troop queries and
  // explosions must see transported positions, including in the same tick.
  if(moved)sim.reindexAfterDisplacement();
}

function skyShot(sim: DefendSim,s:Soldier,x:number,y:number,target:number,damage:number,rain:boolean,delay=0) {
  sim.arrows.push({x:s.x,y:s.y,origin:{x:s.x,y:s.y,attacker:s.id},target,tx:x,ty:y,damage,
    life:delay+SKYRANGER.rise+SKYRANGER.hidden+SKYRANGER.fall+1,sky:{t:0,delay,rain}});
}

export function looseSkyArrow(sim:DefendSim,s:Soldier,e:Enemy,damage:number,rank:number) {
  skyShot(sim,s,e.x,e.y,e.id,damage,false);
  const every=SKYRANGER.every[rank];
  if(!every)return;
  s.skyShots=(s.skyShots??0)+1;
  if(s.skyShots%every)return;
  const count=SKYRANGER.arrows[rank],r=SKYRANGER.radius[rank]*SUB;
  const targets=rank===3?sim.enemiesNear(e.x,e.y,r).filter(o=>!o.untargetable&&o.hp>0).sort((a,b)=>a.id-b.id):[];
  for(let i=0;i<count;i++){
    const target=targets.length?targets[i%targets.length]:undefined;
    const angle=hash01(s.id,s.skyShots,i,1)*Math.PI*2,rad=Math.sqrt(hash01(s.id,s.skyShots,i,2))*r;
    const x=target?.x??Math.max(0,Math.min(CELLS_W-.001,e.x+Math.cos(angle)*rad));
    const y=target?.y??Math.max(0,Math.min(CELLS_H-.001,e.y+Math.sin(angle)*rad));
    skyShot(sim,s,x,y,target?.id??-1,damage,true,(i%7)*.035);
  }
}

export function stepSkyArrow(sim:DefendSim,a:Arrow,dt:number) {
  const sky=a.sky!;sky.t+=dt;
  const target=sim.livingEnemy(a.target);
  if(target){a.tx=target.x;a.ty=target.y;}
  if(sky.t<sky.delay+SKYRANGER.rise+SKYRANGER.hidden+SKYRANGER.fall)return;
  if(target)sim.hurtEnemy(target,a.damage,true,"ranged",a.origin,true);
  else if(a.target<0){
    const ground=sim.enemiesNear(a.tx,a.ty,2).filter(e=>Math.hypot(e.x-a.tx,e.y-a.ty)<=enemySize(e)/2+.18)
      .sort((x,y)=>Math.hypot(x.x-a.tx,x.y-a.ty)-Math.hypot(y.x-a.tx,y.y-a.ty)||x.id-y.id)[0];
    if(ground)sim.hurtEnemy(ground,a.damage,true,"ranged",a.origin,true);
  }
  a.x=a.tx;a.y=a.ty;a.life=0;
}

/** Pure presentation path: vertical rise, invisible crossing, vertical fall. */
export function skyArrowView(a:Arrow,reduced=false) {
  const s=a.sky!,t=s.t-s.delay;
  if(t<0)return null;
  if(t<SKYRANGER.rise){
    const k=t/SKYRANGER.rise;
    return {x:a.origin?.x??a.x,y:(a.origin?.y??a.y)-(reduced?0:k*SKYRANGER.height),alpha:Math.max(0,1-k*2),up:true};
  }
  if(t<SKYRANGER.rise+SKYRANGER.hidden)return null;
  const k=Math.min(1,(t-SKYRANGER.rise-SKYRANGER.hidden)/SKYRANGER.fall);
  return {x:a.tx,y:a.ty-(reduced?0:(1-k)*SKYRANGER.height),alpha:Math.min(1,k*4),up:false};
}
