import type { CityLife } from './city-life.ts';
import { basicUnitSprite } from './basic-unit-art.ts';
import { drawSprite } from './damage-art.ts';
import { ART } from './art-scale.ts';
import { torchLevel } from './city-torches.ts';
import { getTorchFlicker } from '../lighting.ts';
/** Native body pixels and thin outlines, with a helmet/sword for watchmen. */
export function drawCityLife(c: CanvasRenderingContext2D, px: number, life: CityLife, time: number, now: number, reduced: boolean) {
  c.save(); c.imageSmoothingEnabled=false;
  const dot=px/ART;
  for(const p of life.visible) {
    const x=Math.round(p.x*ART)/ART*px,y=Math.round(p.y*ART)/ART*px,s=p.size*px;
    c.strokeStyle=p.role==='watchman'?'#152539':'#0b0907';c.lineWidth=dot*.5;
    c.strokeRect(x-s/2,y-s/2,s,s);
    drawSprite(c,basicUnitSprite(p.role==='watchman'?'sword':'civilian'),x-s/2,y-s/2,s,s);
    if(p.role==='watchman') {
      c.fillStyle='#afb8bd';c.fillRect(x-s/2,y-s/2,s,dot);
      c.fillStyle='#d5d9d8';c.fillRect(x+s/2,y-s/2,dot*.5,s*1.2);
    }
    const on=torchLevel(time,p.id);
    if(on>0) {
      const f=getTorchFlicker({x:p.id,y:17},now,reduced);
      c.globalAlpha=on;c.fillStyle='#5c3922';c.fillRect(x+s*.55,y-dot*.3,dot*.5,dot*1.4);
      c.fillStyle='#df7931';c.fillRect(x+s*.55-dot*.3,y-dot*f,dot,dot*f);
      c.fillStyle='#ffe3a2';c.fillRect(x+s*.55,y-dot*f,dot*.5,dot*.7*f);c.globalAlpha=1;
    }
  }
  c.restore();
}
