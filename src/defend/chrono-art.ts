/** Presentation only: bounded orbit symbols and a fading gold ray, on the art lattice. */
import { CHRONO } from "../chrono-upgrades.ts";
import type { DefendSim } from "./sim.ts";
import { center } from "./pathing.ts";
import { ART } from "./park-art.ts";

export function drawChrono(c:CanvasRenderingContext2D,px:number,sim:DefendSim,reduced=false){
  if(!sim.chrono.size&&!sim.divineArrows.length)return;
  const pixel=px/ART,snap=(v:number)=>Math.round(v*ART)/ART*px;
  c.save();c.imageSmoothingEnabled=false;
  for(const[id,state]of sim.chrono){
    const b=sim.map.buildings[id];if(!b||!sim.intact(b))continue;
    const p=center(b.rect),shots=[...state.shots,...state.queue],time=reduced?0:sim.time;
    // Sparse rings leave the battlefield legible; every actual shot gets an orbit symbol.
    c.globalAlpha=.35;c.fillStyle="#b9e4ff";
    for(let j=0;j<64;j++){const a=j*Math.PI/32,r=3.4;c.fillRect(snap(p.x+Math.cos(a)*r),snap(p.y+Math.sin(a)*r),pixel,pixel);}
    c.globalAlpha=1;
    shots.forEach((payload,i)=>{
      const ring=Math.floor(i/30),angle=i*Math.PI*2/Math.min(30,shots.length)+time*(.35+ring*.09),r=3.4+ring*.8;
      const x=snap(p.x+Math.cos(angle)*r),y=snap(p.y+Math.sin(angle)*r),a=angle+Math.PI/2;
      const dx=Math.round(Math.cos(a)),dy=Math.round(Math.sin(a));
      c.fillStyle="#07151e";c.fillRect(x-2*pixel,y-2*pixel,5*pixel,5*pixel);
      if(payload.kind==="shell"||(payload.kind==="arrow"&&payload.shot.shot)){
        c.fillStyle=payload.kind==="shell"?"#a0b4c6":"#e3d8b0";c.fillRect(x-pixel,y-pixel,3*pixel,3*pixel);
        c.fillStyle="#f5f0cd";c.fillRect(x-pixel,y-pixel,pixel,pixel);
      }else{
        c.fillStyle=payload.kind==="arrow"&&payload.shot.burn?"#ffba58":"#d4efff";
        for(let k=-2;k<=2;k++)c.fillRect(x+dx*k*pixel,y+dy*k*pixel,pixel,pixel);
        c.fillStyle="#f8e6b0";c.fillRect(x+dx*2*pixel,y+dy*2*pixel,2*pixel,2*pixel);
      }
    });
    if(state.hits){
      c.fillStyle="#fff0a2";c.globalAlpha=.9;
      const x=snap(p.x),y=snap(p.y-.45);
      c.fillRect(x-pixel,y-5*pixel,2*pixel,10*pixel);c.fillRect(x-3*pixel,y-4*pixel,6*pixel,2*pixel);
      c.globalAlpha=1;
    }
  }
  for(const a of sim.divineArrows){
    for(let i=1;i<a.trail.length;i++){
      const from=a.trail[i-1],to=a.trail[i],alpha=Math.max(0,1-(a.age-to.t)/CHRONO.trailLife);
      c.globalAlpha=alpha*.7;c.strokeStyle="#dba53d";c.lineWidth=5*pixel;c.beginPath();c.moveTo(snap(from.x),snap(from.y));c.lineTo(snap(to.x),snap(to.y));c.stroke();
      c.globalAlpha=alpha;c.strokeStyle="#fff5b6";c.lineWidth=pixel;c.stroke();
      c.fillStyle="#ffe68c";
      const n=Math.min(24,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)*2));
      for(let j=0;j<n;j++){
        const k=(j+.5)/n,wave=Math.sin(i*1.7+j*2.3+(reduced?0:a.age*5))*.45;
        c.fillRect(snap(from.x+(to.x-from.x)*k-a.dy*wave),snap(from.y+(to.y-from.y)*k+a.dx*wave),pixel,pixel);
      }
    }
    if(a.left>0){c.globalAlpha=1;c.fillStyle="#fffbd8";const x=snap(a.x),y=snap(a.y);c.fillRect(x-2*pixel,y-2*pixel,5*pixel,5*pixel);}
  }
  c.restore();
}
