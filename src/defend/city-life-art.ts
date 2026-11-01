import type { CityLife } from './city-life.ts';
import { basicUnitSprite } from './basic-unit-art.ts';
import { drawSprite } from './damage-art.ts';
import { ART } from './art-scale.ts';
import { torchLevel } from './city-torches.ts';
import { getTorchFlicker } from '../lighting.ts';
/** A watchman's body colour (one flat square) and spear (shaft, iron head). */
export const WATCHMAN_ART = { body: '#3f5f8f', shaft: '#7a5232', head: '#c9d0d3', ink: '#152539' } as const;
/** Townsfolk keep their native body pixels; watchmen are a single square holding a spear at their side.
 *  Neither carries a baked outline: the ring here is drawn in code round the body and spear together. */
export function drawCityLife(c: CanvasRenderingContext2D, px: number, life: CityLife, time: number, now: number, reduced: boolean) {
  c.save(); c.imageSmoothingEnabled=false;
  const dot=px/ART;
  for(const p of life.visible) {
    const x=Math.round(p.x*ART)/ART*px,y=Math.round(p.y*ART)/ART*px;
    if(p.role==='watchman') drawWatchman(c,x,y,dot);
    else {
      const s=p.size*px;
      c.strokeStyle='#0b0907';c.lineWidth=dot*.5;
      c.strokeRect(x-s/2,y-s/2,s,s);
      drawSprite(c,basicUnitSprite('civilian'),x-s/2,y-s/2,s,s);
    }
    // Torch in the free hand: townsfolk's right, a watchman's left (the spear is in the right).
    const s=p.size*px, tx=p.role==='watchman'?-3*dot:s*.55;
    const on=torchLevel(time,p.id);
    if(on>0) {
      const f=getTorchFlicker({x:p.id,y:17},now,reduced);
      c.globalAlpha=on;c.fillStyle='#5c3922';c.fillRect(x+tx,y-dot*.3,dot*.5,dot*1.4);
      c.fillStyle='#df7931';c.fillRect(x+tx-dot*.3,y-dot*f,dot,dot*f);
      c.fillStyle='#ffe3a2';c.fillRect(x+tx,y-dot*f,dot*.5,dot*.7*f);c.globalAlpha=1;
    }
  }
  c.restore();
}

/** A watchman at (x, y), on the art lattice (`dot` = one art pixel): a 3 × 3 body with the spear held
 *  upright against its right side, the shaft from below its feet to above its head under a 2-pixel iron head. */
export function watchmanRects(x: number, y: number, dot: number) {
  const left=x-2*dot, top=y-2*dot;
  return {
    body: {x:left,y:top,w:3*dot,h:3*dot},
    shaft: {x:left+3*dot,y:top-1*dot,w:dot,h:5*dot},
    head: {x:left+3*dot,y:top-3*dot,w:dot,h:2*dot},
  };
}
function drawWatchman(c: CanvasRenderingContext2D, x: number, y: number, dot: number) {
  const r=watchmanRects(x,y,dot), o=dot*.5;
  // One navy ring round body and spear: their union grown by half an art pixel, under the fills.
  c.fillStyle=WATCHMAN_ART.ink;
  for(const b of [r.body,r.shaft,r.head]) c.fillRect(b.x-o,b.y-o,b.w+2*o,b.h+2*o);
  c.fillStyle=WATCHMAN_ART.body;c.fillRect(r.body.x,r.body.y,r.body.w,r.body.h);
  c.fillStyle=WATCHMAN_ART.shaft;c.fillRect(r.shaft.x,r.shaft.y,r.shaft.w,r.shaft.h);
  c.fillStyle=WATCHMAN_ART.head;c.fillRect(r.head.x,r.head.y,r.head.w,r.head.h);
}
