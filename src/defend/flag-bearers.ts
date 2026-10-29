/** Native, non-combat castle walkers. Choices use a private integer hash. */
import { FLAG_BEARER } from './catalog.ts';
import { CellType } from './citygen.ts';
import { cellAt, cellCenter, center, findPath } from './pathing.ts';
import type { DefendSim, Soldier } from './sim.ts';
const hash=(n:number)=>{n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;};
const routes=new WeakMap<DefendSim,{cells:number[];solid:Uint8Array;version:number}>();
function streets(sim:DefendSim){
 let entry=routes.get(sim);
 if(!entry||entry.version!==sim.mapVersion){
  const solid=sim.ownSolid.slice(),cells:number[]=[];
  for(let i=0;i<solid.length;i++){if(!sim.map.city[i])solid[i]=1;if(sim.map.city[i]&&!solid[i]&&sim.map.type[i]===CellType.ROAD)cells.push(i);}
  entry={solid,cells,version:sim.mapVersion};routes.set(sim,entry);
 }return entry;
}
export function spawnFlagBearers(sim:DefendSim){
 const at=center(sim.keep.rect),roads=streets(sim).cells.slice().sort((a,b)=>{const p=cellCenter(a),q=cellCenter(b);return (p.x-at.x)**2+(p.y-at.y)**2-((q.x-at.x)**2+(q.y-at.y)**2)||a-b;});
 for(let n=0;n<3&&n<roads.length;n++){const p=cellCenter(roads[n]);sim.soldiers.push({id:sim.newId(),kind:'flagBearer',home:-1,...p,hp:FLAG_BEARER.hp,maxHp:FLAG_BEARER.hp,damage:0,cd:0,target:-1,path:[],thinkT:0,flash:0});}
}
export function stepFlagBearer(sim:DefendSim,s:Soldier,dt:number){
 if(s.hp<=0)return;s.target=-1;s.thinkT-=dt;
 if(s.thinkT<=0||!s.path.length){
  const {cells,solid}=streets(sim),near=cells.filter(i=>{const p=cellCenter(i);return (p.x-s.x)**2+(p.y-s.y)**2<144;});
  s.thinkT=3+hash(s.id)%3;
  if(near.length){const goal=near[hash(s.id+Math.floor(sim.time/4)*197)%near.length];s.path=findPath(solid,s,cellCenter(goal),{maxCost:70})??[];}
 }
 const old={x:s.x,y:s.y};sim.followPath(s,null,FLAG_BEARER.speed,dt);
 if(!sim.map.city[cellAt(s.x,s.y)]){s.x=old.x;s.y=old.y;s.path=[];}
}

/** Their own army cannot kill the mana carriers with friendly cannon fire. */
export const friendlySafe = (unit: {kind?:string}) => unit.kind === "flagBearer";
