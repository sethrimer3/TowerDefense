import { ambushLevel,trackFor,pointAlong } from './levels.ts';
/** Scenario geometry assembled by Defend's city generator, on Defend's cell grid. */
import { dist } from '../exact.ts';
import { generateCity, CellType, type CityMap, type Building } from '../defend/citygen.ts';
import { CELL_COUNT,CELLS_W,CELLS_H,cellIndex,rectCells,type Rect } from '../defend/grid.ts';
import { STRUCTURES,type StructureKind } from '../defend/catalog.ts';
import type { FittedStructure } from '../defend/layout.ts';
import { levelPlan, type Point } from './plans.ts';
import type { CastleSnapshot } from './castles.ts';
export const nativePoint=(p:Point):Point=>({x:6+p.x*3,y:8+p.y*3});
const fitted=(uid:number,kind:StructureKind,rect:Rect):FittedStructure=>({uid,kind,rect,tx:Math.floor(rect.x/8),ty:Math.floor(rect.y/8),inside:true});
const centered=(p:Point,w:number,h:number):Rect=>({x:Math.max(0,Math.min(CELLS_W-w,Math.round(p.x-w/2))),y:Math.max(1,Math.min(CELLS_H-h,Math.round(p.y-h/2))),w,h});
export function footprint(kind:StructureKind,p:Point){const d=STRUCTURES[kind];return centered(p,d.w,d.h);}
function erase(map:CityMap,b:Building){b.hidden=true;for(const c of b.cells)if(map.owner[c]===b.id){map.owner[c]=-1;map.type[c]=CellType.PARK;}}
export function ambushField(level:number){
 const data=ambushLevel(level),track=trackFor(data),path=track.points,pads:Point[]=[];
 const along=(p:Point)=>{let best=Infinity;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));best=Math.min(best,dist(p.x-a.x-t*dx,p.y-a.y-t*dy));}return best;};
 for(let i=1;i<30&&pads.length<10;i++){
  const p=pointAlong(path,i/31);
  for(const [dx,dy] of [[9,0],[-9,0],[0,9],[0,-9]]){const at={x:Math.round((p.x+dx)/2)*2,y:Math.round((p.y+dy)/2)*2};
   if(at.x<7||at.x>CELLS_W-7||at.y<8||at.y>CELLS_H-8||along(at)<8||dist(at.x-track.keep.x,at.y-track.keep.y)<13||pads.some(q=>Math.abs(q.x-at.x)<13&&Math.abs(q.y-at.y)<13))continue;
   pads.push(at);if(pads.length===10)break;
  }
 }
 const keep=footprint('keep',track.keep),structures=[fitted(0,'keep',keep),...pads.map((p,i)=>fitted(i+1,'watchTower',centered(p,12,12)))];
 const city=new Uint8Array(CELL_COUNT),wall=new Uint8Array(CELL_COUNT),road=new Set<number>();
 for(const p of [...track.outposts,track.keep])for(const c of rectCells(centered(p,18,18)))city[c]=1;
 for(const s of structures)for(const c of rectCells(s.rect))city[c]=1;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],n=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
  for(let t=0;t<=n;t++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=Math.round(a.x+(b.x-a.x)*t/n)+dx,y=Math.round(a.y+(b.y-a.y)*t/n)+dy;if(x>=0&&x<CELLS_W&&y>=0&&y<CELLS_H){const c=cellIndex(x,y);road.add(c);city[c]=1;}}
 }
 for(const c of rectCells(keep))road.delete(c);
 const map=generateCity({structures,city,wall},data.seed),lots=structures.slice(1).map(s=>map.buildings.find(b=>b.structureUid===s.uid)!.id);
 const blockedBuildings=new Set([...road].map(c=>map.owner[c]).filter(id=>id>=0));
 for(const id of [...lots,...blockedBuildings])if(id!==0)erase(map,map.buildings[id]);
 for(const c of road){map.type[c]=CellType.ROAD;map.owner[c]=-1;map.city[c]=1;}
 return {map,path,pads,lots,road,name:data.name,level:data,track};
}

export type MusterCopy={kind:StructureKind;uid:number;path?:string;rank?:number};
export function siegeField(castle:CastleSnapshot,copies:MusterCopy[]){
 const city=new Uint8Array(CELL_COUNT),wall=new Uint8Array(CELL_COUNT);
 // The native castle occupies the upper half; attackers approach from below.
 for(let y=10;y<50;y++)for(let x=16;x<56;x++)city[cellIndex(x,y)]=1;
 for(let y=8;y<52;y++)for(let x=14;x<58;x++)if(x<16||x>=56||y<10||y>=50)wall[cellIndex(x,y)]=1;
 const structures:FittedStructure[]=[fitted(0,'keep',{x:34,y:20,w:4,h:4})];
 const towers=castle.defenses.filter(d=>d.kind==='tower');
 const nativeKinds:StructureKind[]=['archerTower','cannonTower','wizardTower','hawkTower','brazierTower','wispTower'];
 towers.forEach((t,i)=>{const kind=nativeKinds[(castle.seed+i)%nativeKinds.length];structures.push(fitted(10000+i,kind,footprint(kind,{x:22+i*26/Math.max(1,towers.length-1),y:38})));});
 structures.push(fitted(11000,'barracks',{x:22,y:25,w:4,h:4}),fitted(11001,'archerBarracks',{x:46,y:25,w:4,h:4}));
 // Real footprints; additional rows use the open lower half of the native board.
 let row=100,x=2,rowDepth=0;
 const pads:Point[]=[],placed:MusterCopy[]=[],previous=new Map<StructureKind,Rect>();
 for(const copy of copies){const d=STRUCTURES[copy.kind];if(x+d.w>CELLS_W-2){x=2;row-=rowDepth+2;rowDepth=0;}
  const packed=row-d.h<58;
  const rect=packed?(previous.get(copy.kind)??{x:2,y:58,w:d.w,h:d.h}):{x,y:row-d.h,w:d.w,h:d.h};previous.set(copy.kind,rect);structures.push(fitted(copy.uid,copy.kind,rect));pads.push({x:rect.x+d.w/2,y:rect.y+d.h/2});placed.push(copy);x+=d.w+2;rowDepth=Math.max(rowDepth,d.h);
 }
 // Center each actual-footprint muster row under the castle.
 const rows=new Map<number,Set<Rect>>();
 for(const s of structures.filter(s=>s.uid>=100000)){const bottom=s.rect.y+s.rect.h;let list=rows.get(bottom);if(!list)rows.set(bottom,list=new Set());list.add(s.rect);}
 for(const list of rows.values()){const all=[...list],left=Math.min(...all.map(r=>r.x)),right=Math.max(...all.map(r=>r.x+r.w)),shift=Math.floor((CELLS_W-(right-left))/2)-left;for(const r of all)r.x+=shift;}
 for(let i=0;i<placed.length;i++){const r=structures.find(s=>s.uid===placed[i].uid)!.rect;pads[i]={x:r.x+r.w/2,y:r.y+r.h/2};}
 // An invisible attacker objective gives the native sim its own keep reference.
 structures.push(fitted(200000,'keep',{x:34,y:100,w:4,h:4}));
 const gate={tx:4,ty:6,side:'s' as const,rect:{x:34,y:50,w:4,h:2},inner:{x:34,y:48,w:4,h:2}};
 const map=generateCity({structures,city,wall,gates:[gate]},castle.seed);
 const attackerIds=new Set(map.buildings.filter(b=>b.structureUid!==undefined&&copies.some(c=>c.uid===b.structureUid)).map(b=>b.id));
 const attackerKeep=map.buildings.find(b=>b.structureUid===200000)!.id;map.buildings[attackerKeep].hidden=true;
 const defenderIds=new Set(map.buildings.filter(b=>!attackerIds.has(b.id)&&b.id!==attackerKeep).map(b=>b.id));
 return {map,pads,attackerIds,defenderIds,attackerKeep,defenderKeep:0};
}
