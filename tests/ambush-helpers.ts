import type { AmbushSim } from '../src/campaign/ambush-sim.ts';
import type { StructureKind } from '../src/defend/catalog.ts';
export function freeSpot(sim:AmbushSim,kind:StructureKind,nearRoad=false){
 for(let qy=1;qy<50;qy++)for(let qx=1;qx<35;qx++){
  if(!sim.grid.check(kind,qx,qy,sim.buildings).fits)continue;
  if(nearRoad&&!sim.field.path.some(p=>Math.abs(p.x-qx*2)<12&&Math.abs(p.y-qy*2)<12))continue;
  return {qx,qy};
 }
 throw new Error('No free grid spot for '+kind);
}
export function build(sim:AmbushSim,kind:StructureKind){const p=freeSpot(sim,kind);if(!sim.placeAt(kind,p.qx,p.qy))throw new Error('Purchase failed');return sim.buildings.at(-1)!;}
