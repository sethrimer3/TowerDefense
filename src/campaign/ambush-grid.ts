/** Ambush placement is a pure quarter-grid transaction over native terrain. */
import { CellType, type CityMap } from '../defend/citygen.ts';
import { CELLS_W,CELLS_H,CELL_COUNT,rectCells,type Rect } from '../defend/grid.ts';
import { QC, structureClearance } from '../defend/layout.ts';
import { footprint, type StructureKind } from '../defend/catalog.ts';
import { forestPlan, hasForest } from '../defend/forest.ts';
import type { AreaId } from '../defend/areas.ts';
export type GridBuilding={id:number;kind:StructureKind;qx:number;qy:number};
export const buildingRect=(b:Pick<GridBuilding,'kind'|'qx'|'qy'>):Rect=>{const f=footprint(b.kind,false);return{x:b.qx*QC,y:b.qy*QC,w:f.w,h:f.h};};
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export class AmbushGrid {
 readonly blocked=new Uint8Array(CELL_COUNT);
 constructor(readonly map:CityMap,area:AreaId,road:ReadonlySet<number>,castle:Rect,outposts:Rect[]=[],allowOutposts=false){
  for(let i=0;i<CELL_COUNT;i++)if(map.type[i]===CellType.WATER||map.type[i]===CellType.WALL||road.has(i)||i<CELLS_W||i%CELLS_W===0)this.blocked[i]=1;
  for(const c of rectCells(castle))this.blocked[c]=1;
  if(!allowOutposts)for(const r of outposts)for(const c of rectCells(r))this.blocked[c]=1;
  for(const b of map.buildings)if(!b.hidden&&(b.kind==='keep'||b.kind==='house'&&!allowOutposts))for(const c of b.cells)this.blocked[c]=1;
  if(hasForest(area)){
   const plan=forestPlan(map);
   for(const b of plan.boulders)for(const c of b.cells)this.blocked[c]=1;
   const discs=[...plan.lakes.flatMap(l=>l.discs),...plan.rocks.map(r=>({x:r.x,y:r.y,r:r.size*.5+.5}))];
   for(const d of discs)for(let y=Math.max(0,Math.floor(d.y-d.r));y<Math.min(CELLS_H,Math.ceil(d.y+d.r));y++)for(let x=Math.max(0,Math.floor(d.x-d.r));x<Math.min(CELLS_W,Math.ceil(d.x+d.r));x++)if((x+.5-d.x)*(x+.5-d.x)+(y+.5-d.y)*(y+.5-d.y)<d.r*d.r)this.blocked[y*CELLS_W+x]=1;
  }
 }
 check(kind:StructureKind,qx:number,qy:number,buildings:readonly GridBuilding[],ignore=-1){
  const rect=buildingRect({kind,qx,qy}),ring=structureClearance(rect);
  const fits=Number.isInteger(qx)&&Number.isInteger(qy)&&rect.x>=0&&rect.y>=1&&rect.x+rect.w<=CELLS_W&&rect.y+rect.h<=CELLS_H&&
   !rectCells(rect).some(c=>this.blocked[c])&&!buildings.some(b=>b.id!==ignore&&overlaps(ring,buildingRect(b)));
  return {rect,fits};
 }
}
