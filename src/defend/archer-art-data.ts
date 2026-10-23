/** Gated PNG delivery metadata; legacy procedural building painters remain. */
import type { StructureKind } from "./catalog.ts";
export const ARCHER_PNGS = ["v2/defend/javelin-bow-lodge", "v2/ui/javelin-bow-lodge", "v2/defend/skirmish-camp", "v2/ui/skirmish-camp", "v2/defend/skyranger-lodge", "v2/ui/skyranger-lodge", "v2/effects/bow-javelin"] as const;
export const ARCHER_ART = [
  {kind:"rangerLodge",name:"javelin-bow-lodge",path:"rangers"},
  {kind:"skirmishCamp",name:"skirmish-camp",path:"skirmishers"},
  {kind:"skyrangerLodge",name:"skyranger-lodge",path:"skyranger"},
] as const;
export const archerBuildingArt = (kind: StructureKind) => ARCHER_ART.find(a=>a.kind===kind);
export const JAVELIN_SIZE=25;
/** Native shaft and broad iron head. All sixteen headings use one lattice. */
export function bowJavelinPixels(dir:number) {
  const n=JAVELIN_SIZE,out=new Uint32Array(n*n),mid=(n-1)/2,angle=dir*Math.PI/8;
  const set=(x:number,y:number,col:number)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<n&&y<n)out[y*n+x]=col;};
  const ink=0xff0f1214,wood=0xff3c6491,steel=0xffd0ccc2;
  // Coordinates along/across the shaft; the head is a solid broad triangle.
  for(let a=-10;a<=10;a++)for(let b=-3;b<=3;b++){
    const head=a>=5 && Math.abs(b)<=Math.floor((10-a)*.6),shaft=a<7&&Math.abs(b)<=.5;
    if(head||shaft)set(mid+Math.cos(angle)*a-Math.sin(angle)*b,mid+Math.sin(angle)*a+Math.cos(angle)*b,head?steel:wood);
  }
  const src=out.slice();
  for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++)if(!src[y*n+x]&&(src[y*n+x-1]||src[y*n+x+1]||src[(y-1)*n+x]||src[(y+1)*n+x]))out[y*n+x]=ink;
  return out;
}
