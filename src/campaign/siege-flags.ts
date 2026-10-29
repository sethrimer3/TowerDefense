import { isMelee } from "../defend/melee-facing.ts";
/** Decorative scenery: never enters collision, targeting or the battle RNG. */
import type { CityMap } from '../defend/citygen.ts';
import type { DefendSim } from '../defend/sim.ts';
import { CELLS_W, CELLS_H, cellIndex } from '../defend/grid.ts';
import { drawFlag } from '../defend/structure-art.ts';
import type { Flag } from '../profile/model.ts';
import { ART } from '../defend/park-art.ts';
export type Pole = { id:number; x:number; y:number; snapped?:number; dx?:number; dy?:number };
export const flagHash = (seed:number,id:number) => { let x=(seed^Math.imul(id+1,0x9e3779b1))>>>0; x=Math.imul(x^(x>>>16),0x85ebca6b); return (x^(x>>>13))>>>0; };
export function flagPoles(map:CityMap, seed:number):Pole[] {
  const poles:Pole[]=[], keep=map.buildings.find(b=>b.kind==='keep'&&!b.hidden)!;
  const cx=keep.rect.x+keep.rect.w/2, cy=keep.rect.y+keep.rect.h/2;
  const candidates=[];
  for(let y=3;y<Math.min(CELLS_H-4,cy+35);y+=2)for(let x=3;x<CELLS_W-3;x+=2){
    if(map.owner[cellIndex(x,y)]>=0||map.buildings.some(b=>!b.hidden&&x>=b.rect.x&&x<b.rect.x+b.rect.w&&y>=b.rect.y&&y<b.rect.y+b.rect.h))continue;
    candidates.push({x:x+.5,y:y+.5,key:flagHash(seed,cellIndex(x,y))});
  }
  candidates.sort((a,b)=>a.key-b.key);
  const walls=map.buildings.filter(b=>b.kind==='wall'||b.kind==='gate');
  if(walls.length){
    const left=Math.min(...walls.map(b=>b.rect.x)),right=Math.max(...walls.map(b=>b.rect.x+b.rect.w));
    const top=Math.min(...walls.map(b=>b.rect.y)),bottom=Math.max(...walls.map(b=>b.rect.y+b.rect.h));
    const anchors=[{x:left-2,y:top-2},{x:right+2,y:top-2},{x:left-2,y:bottom+2},{x:right+2,y:bottom+2},...walls.filter(b=>b.kind==='gate').map(b=>({x:b.rect.x+b.rect.w/2+3,y:b.rect.y+b.rect.h/2+3}))];
    for(const a of anchors){const p=[...candidates].sort((p,q)=>(p.x-a.x)**2+(p.y-a.y)**2-((q.x-a.x)**2+(q.y-a.y)**2))[0];if(p&&poles.length<8&&poles.every(q=>(p.x-q.x)**2+(p.y-q.y)**2>=36))poles.push({id:poles.length,x:p.x,y:p.y});}
  }
  // Seeded open sites span the castle and its approach, without obstructing it.
  for(const p of candidates){if(poles.every(q=>(p.x-q.x)**2+(p.y-q.y)**2>=36))poles.push({id:poles.length,x:p.x,y:p.y}); if(poles.length===8)break;}
  return poles;
}
export class SiegeFlags {
  readonly poles:Pole[];
  readonly dropped: {id:number;x:number;y:number;time:number}[]=[];
  private bearers=new Map<number,{id:number;x:number;y:number;hp:number}>();
  private seen=new WeakSet<object>();
  private flying=new Map<object,{x:number;y:number}>();
  private cooldowns=new Map<number,number>();
  constructor(readonly map:CityMap,seed:number,readonly face:Flag){ this.poles=flagPoles(map,seed); }
  hit(x:number,y:number,r:number,time:number){
    for(const p of this.poles)if(p.snapped===undefined&&(p.x-x)**2+(p.y-y)**2<=r*r){const d=Math.hypot(p.x-x,p.y-y)||1;p.snapped=time;p.dx=(p.x-x)/d;p.dy=(p.y-y)/d;}
  }
  update(sim:DefendSim){
    const live=new Map(sim.soldiers.filter(u=>u.kind==='flagBearer'&&u.hp>0).map(u=>[u.id,u]));
    for(const [id,u]of this.bearers)if(!live.has(id)&&u.hp<=0&&!this.dropped.some(f=>f.id===id))this.dropped.push({id,x:u.x,y:u.y,time:sim.time});
    this.bearers=live;
    const first=(o:object)=>{if(this.seen.has(o))return false;this.seen.add(o);return true;};
    for(const e of sim.effects)if(e.kind==='boom'&&first(e))this.hit(e.x,e.y,e.r,sim.time);
    for(const e of sim.impacts)if(first(e))this.hit(e.x,e.y,e.r,sim.time);
    for(const b of sim.bolts)if(first(b))for(let k=0;k+1<b.pts.length;k+=2)this.hit(b.pts[k],b.pts[k+1],.75,sim.time);
    for(const b of sim.mageBolts)if(first(b))for(const p of b.pts)this.hit(p.x,p.y,.75,sim.time);
    const flying=new Map<object,{x:number;y:number}>();
    for(const a of [...sim.arrows,...sim.ballistaBolts])flying.set(a,{x:a.x,y:a.y});
    for(const [a,p]of this.flying)if(!flying.has(a))this.hit(p.x,p.y,.8,sim.time);
    this.flying=flying;
    const cds=new Map<number,number>();
    for(const u of sim.soldiers){const before=this.cooldowns.get(u.id);if(isMelee(u)&&before!==undefined&&u.cd>before+.05)this.hit(u.x,u.y,1,sim.time);cds.set(u.id,u.cd);}
    this.cooldowns=cds;
  }
  draw(c:CanvasRenderingContext2D,px:number,sim:DefendSim,now:number,reduced:boolean){
    for(const u of sim.soldiers)if(u.kind==='flagBearer'&&u.hp>0){
      c.save();c.strokeStyle='#100f14';c.lineWidth=Math.max(1,px/5);c.beginPath();c.moveTo(u.x*px,u.y*px);c.lineTo((u.x+.3)*px,(u.y-1.7)*px);c.stroke();
      drawFlag(c,px*.8,{x:(u.x+.3)*px,y:(u.y-1.7)*px,t:now/1000,reduceMotion:reduced},false,this.face);c.restore();
    }
    for(const f of this.dropped){
      c.save();c.translate(f.x*px,f.y*px);c.rotate(1.2);drawFlag(c,px*.8,{x:0,y:0,t:0,reduceMotion:true},false,this.face);c.restore();
      const age=sim.time-f.time;
      if(age<.8){c.save();c.globalAlpha=1-age/.8;c.fillStyle='#8be7ff';const a=Math.max(1,px/8),y=(f.y-(reduced?.5:age*2))*px;c.fillRect(f.x*px-a,y-2*a,2*a,4*a);c.fillRect(f.x*px-2*a,y-a,4*a,2*a);c.restore();}
    }
    for(const p of this.poles){
      c.save();c.globalAlpha=sim.soldiers.some(u=>(u.x-p.x)**2+(u.y-p.y)**2<1.5)?.5:1;
      const a=px/ART, x=p.x*px, y=p.y*px;
      const height=p.snapped===undefined?14:6;
      c.fillStyle='#100f14';c.fillRect(x-a,y-height*a,3*a,(height+1)*a);c.fillStyle='#ac8255';c.fillRect(x,y-(height-1)*a,a,(height-1)*a);
      if(p.snapped===undefined)drawFlag(c,px,{x,y:y-13*a,t:now/1000,reduceMotion:reduced},false,this.face);
      else{
        const t=reduced?1:Math.min(1,(sim.time-p.snapped)/.6);
        c.save();c.translate(x,y-6*a);c.rotate(t*(p.dx!>=0?1:-1)*1.5);
        c.fillStyle='#100f14';c.fillRect(-a,-8*a,3*a,8*a);c.fillStyle='#ac8255';c.fillRect(0,-7*a,a,7*a);
        drawFlag(c,px,{x:0,y:-7*a,t:now/1000,reduceMotion:reduced},false,this.face);c.restore();
        if(!reduced&&t<1){c.fillStyle='#d2ad70';for(let k=0;k<5;k++)c.fillRect(x+(k-2)*a*t*4,y-6*a+((k%2)*3+t*5)*a,a,a);}
      }c.restore();
    }
  }
}
