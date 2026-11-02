import type { CityLife } from './city-life.ts';
import { ART } from './art-scale.ts';
import { torchLevel } from './city-torches.ts';
import { getTorchFlicker } from '../lighting.ts';
import { hash01 } from './grid.ts';
/** A watchman's body colour (one flat square) and spear (shaft, iron head). */
export const WATCHMAN_ART = { body: '#3f5f8f', shaft: '#7a5232', head: '#c9d0d3', ink: '#152539' } as const;
/** Townsfolk's tunics, one per person by id, and the lit pixel's sheen. */
export const TOWNSFOLK_TUNICS = ['#b5523b', '#6f8f4e', '#8a6a9c', '#c9a54a', '#5f7f9f', '#a07a52'] as const;
/** Townsfolk are 2 × 2 art pixels, a watchman's body 3 × 3. */
export const TOWNSFOLK_PX = 2;
/** Whole canvas pixels, so walkers glide a device pixel at a time rather than
 * jumping an art pixel at a time. */
const glide = (v: number) => Math.round(v);
/** Townsfolk are a 2 × 2 square in their tunic, watchmen a 3 × 3 square holding a spear at their side.
 *  Neither carries a baked outline: the ring here is drawn in code round each. */
export function drawCityLife(c: CanvasRenderingContext2D, px: number, life: CityLife, time: number, now: number, reduced: boolean) {
  c.save(); c.imageSmoothingEnabled=false;
  const dot=px/ART;
  for(const p of life.visible) {
    const x=glide(p.x*px),y=glide(p.y*px);
    if(p.role==='watchman') drawWatchman(c,x,y,dot,{ring:true});
    else drawTownsfolk(c,x,y,dot,p.id);
    // Torch in the free hand: townsfolk's right, a watchman's left (the spear is in the right).
    const tx=p.role==='watchman'?-2.5*dot:1.5*dot;
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

/** One of the townsfolk at (x, y): a 2 × 2 art-pixel square in its tunic, the
 *  upper left pixel lit, inside a half-art-pixel black ring drawn here. */
export function drawTownsfolk(c: CanvasRenderingContext2D, x: number, y: number, dot: number, id: number) {
  const s=TOWNSFOLK_PX*dot, left=x-s/2, top=y-s/2, o=dot*.5;
  c.fillStyle='#0b0907';c.fillRect(left-o,top-o,s+2*o,s+2*o);
  c.fillStyle=TOWNSFOLK_TUNICS[Math.floor(hash01(id,2803)*TOWNSFOLK_TUNICS.length)];c.fillRect(left,top,s,s);
  c.fillStyle='rgba(255,255,255,0.28)';c.fillRect(left,top,dot,dot);
}

/** A watchman at (x, y), on the art lattice (`dot` = one art pixel): a 3 × 3 body centred on it with the
 *  spear held upright against its right side, the shaft from below its middle to above its head under a
 *  1-pixel iron head; `thrust` (a unit direction) levels the spear at a foe instead, jabbed out by `jab` (0 to 1). */
export function watchmanRects(x: number, y: number, dot: number, thrust?: {x:number;y:number}, jab = 0) {
  const left=x-1.5*dot, top=y-1.5*dot;
  const body={x:left,y:top,w:3*dot,h:3*dot};
  if(!thrust) return {
    body,
    shaft: {x:left+3*dot,y:top-1*dot,w:dot,h:4*dot},
    head: {x:left+3*dot,y:top-2*dot,w:dot,h:dot},
  };
  // Levelled along the stronger axis of the thrust, out from the body's edge.
  const out=(1.5+jab)*dot, len=3*dot;
  if(Math.abs(thrust.x)>=Math.abs(thrust.y)) {
    const sx=thrust.x>=0?1:-1, y0=y-.5*dot;
    const near=sx>0?x+out-dot:x-out-len+dot;
    return { body, shaft:{x:near,y:y0,w:len,h:dot}, head:{x:sx>0?near+len:near-dot,y:y0,w:dot,h:dot} };
  }
  const sy=thrust.y>=0?1:-1, x0=x+.5*dot;
  const near=sy>0?y+out-dot:y-out-len+dot;
  return { body, shaft:{x:x0,y:near,w:dot,h:len}, head:{x:x0,y:sy>0?near+len:near-dot,w:dot,h:dot} };
}
/** Draws a watchman; `ring` adds the navy ring round body and spear (the battle's
 *  own unit contours ring the keep's guards instead), `flash` paints them white when struck. */
export function drawWatchman(c: CanvasRenderingContext2D, x: number, y: number, dot: number, o: {ring?: boolean; flash?: boolean; thrust?: {x:number;y:number}; jab?: number} = {}) {
  const r=watchmanRects(x,y,dot,o.thrust,o.jab), h=dot*.5;
  if(o.ring) {
    // One navy ring round body and spear: their union grown by half an art pixel, under the fills.
    c.fillStyle=WATCHMAN_ART.ink;
    for(const b of [r.body,r.shaft,r.head]) c.fillRect(b.x-h,b.y-h,b.w+2*h,b.h+2*h);
  }
  c.fillStyle=o.flash?'#fff':WATCHMAN_ART.body;c.fillRect(r.body.x,r.body.y,r.body.w,r.body.h);
  if(!o.flash) {c.fillStyle='rgba(255,255,255,0.22)';c.fillRect(r.body.x,r.body.y,dot,dot);}
  c.fillStyle=o.flash?'#fff':WATCHMAN_ART.shaft;c.fillRect(r.shaft.x,r.shaft.y,r.shaft.w,r.shaft.h);
  c.fillStyle=o.flash?'#fff':WATCHMAN_ART.head;c.fillRect(r.head.x,r.head.y,r.head.w,r.head.h);
}
