/** A result presentation, with no combat writes or random stream access. */
import type { CityMap } from '../defend/citygen.ts';
import { flagHash } from './siege-flags.ts';
export type Collapse={id:number;at:number;x:number;y:number;kind:string};
export function collapseOrder(map:CityMap,hp:ArrayLike<number>,seed:number):Collapse[]{
 const keep=map.buildings.find(b=>b.kind==='keep'&&!b.hidden)!,origin={x:keep.rect.x+keep.rect.w/2,y:keep.rect.y+keep.rect.h/2};
 const others=map.buildings.filter(b=>!b.hidden&&b.id!==keep.id&&b.kind!=='wall'&&b.kind!=='gate'&&hp[b.id]>0).sort((a,b)=>flagHash(seed,a.id)-flagHash(seed,b.id)||a.id-b.id);
 const chosen=new Set(others.slice(0,Math.floor(others.length/3)).map(b=>b.id));
 return map.buildings.filter(b=>!b.hidden&&(b.id===keep.id||b.kind==='wall'||b.kind==='gate'||chosen.has(b.id))).map(b=>{
 const x=b.rect.x+b.rect.w/2,y=b.rect.y+b.rect.h/2;
 return {id:b.id,x,y,kind:b.kind,at:b.id===keep.id?0:Math.hypot(x-origin.x,y-origin.y)/14};
 }).sort((a,b)=>a.at-b.at||a.id-b.id);
}
export class SiegeVictory{
 elapsed=0;
 readonly order:Collapse[];
 readonly origin:{x:number;y:number};
 readonly collapsed=new Set<number>();
 readonly duration:number;
 constructor(map:CityMap,hp:ArrayLike<number>,seed:number,readonly reduced=false,points:readonly {x:number;y:number}[]=[]){
  this.order=collapseOrder(map,hp,seed);this.origin={x:this.order[0].x,y:this.order[0].y};
  this.duration=Math.max(4,(this.order.at(-1)?.at??0)+1.4,...points.map(p=>Math.hypot(p.x-this.origin.x,p.y-this.origin.y)/14+1.4));
  this.advance(0);
 }
 get done(){return this.elapsed>=this.duration;}
 advance(dt:number){this.elapsed=this.reduced?this.duration:Math.min(this.duration,this.elapsed+Math.max(0,Number.isFinite(dt)?dt:0));const fresh:Collapse[]=[];
 for(const e of this.order)if(e.at<=this.elapsed&&!this.collapsed.has(e.id)){this.collapsed.add(e.id);fresh.push(e);}return fresh;}
 skip(){this.elapsed=this.duration;this.advance(0);}
 draw(c:CanvasRenderingContext2D,px:number){
 if(this.reduced)return;
 for(const e of this.order.filter(e=>this.elapsed>=e.at&&this.elapsed-e.at<.7).slice(-32)){
  const t=(this.elapsed-e.at)/.7;c.save();c.globalAlpha=(1-t)*.6;
  for(let k=0;k<6;k++){const a=(k/6)*Math.PI*2,h=flagHash(e.id,k);const x=e.x+Math.cos(a)*t*1.8,y=e.y+Math.sin(a)*t*.7-t*(1-t)*2;
   c.fillStyle=k<3?'#afa58a':'#665d51';const size=px*(k<3?.35:.15);c.fillRect(x*px,y*px,size,size);
  }c.restore();
 }
 }
 get shake(){if(this.reduced||this.done)return {x:0,y:0};const strength=Math.max(0,1-this.elapsed/3)*1.5;return {x:Math.sin(this.elapsed*47)*strength,y:Math.cos(this.elapsed*53)*strength};}
}
