import type { CityLife } from './city-life.ts';
import { ART } from './art-scale.ts';
import { hash01 } from './grid.ts';
/** A watchman's body colour (one flat square) and spear (shaft, iron head). */
export const WATCHMAN_ART = { body: '#3f5f8f', shaft: '#7a5232', head: '#c9d0d3', ink: '#152539' } as const;
/** Townsfolk's tunics, one per person by id, and the lit pixel's sheen. */
export const TOWNSFOLK_TUNICS = ['#b5523b', '#6f8f4e', '#8a6a9c', '#c9a54a', '#5f7f9f', '#a07a52'] as const;
/** Townsfolk are one art pixel, a watchman's body 2 × 2. */
export const TOWNSFOLK_PX = 1;
export const WATCHMAN_PX = 2;
/** Whole canvas pixels, so walkers glide a device pixel at a time rather than
 * jumping an art pixel at a time. */
const glide = (v: number) => Math.round(v);
/** Townsfolk are a single art pixel in their tunic, watchmen a 2 × 2 square holding a spear at their side.
 *  Neither carries a baked outline: the ring here is drawn in code round each. */
export function drawCityLife(c: CanvasRenderingContext2D, px: number, life: CityLife, time: number, now: number, reduced: boolean) {
  c.save(); c.imageSmoothingEnabled=false;
  const dot=px/ART;
  for(const p of life.visible) {
    const x=glide(p.x*px),y=glide(p.y*px);
    if(p.role==='watchman') drawWatchman(c,x,y,dot,{ring:true});
    else drawTownsfolk(c,x,y,dot,p.id);
  }
  c.restore();
}

/** One of the townsfolk at (x, y): a single art pixel in its tunic, inside a
 *  quarter-art-pixel black ring drawn here. */
export function drawTownsfolk(c: CanvasRenderingContext2D, x: number, y: number, dot: number, id: number) {
  const s=TOWNSFOLK_PX*dot, left=x-s/2, top=y-s/2, o=dot*.25;
  c.fillStyle='#0b0907';c.fillRect(left-o,top-o,s+2*o,s+2*o);
  c.fillStyle=TOWNSFOLK_TUNICS[Math.floor(hash01(id,2803)*TOWNSFOLK_TUNICS.length)];c.fillRect(left,top,s,s);
}

/** A watchman at (x, y), on the art lattice (`dot` = one art pixel): a 2 × 2 body centred on it with the
 *  spear held upright against its right side. The spear is drawn in half art pixels so it stays slight beside
 *  the small guard: a half-pixel shaft from below its middle to above its head under a half-pixel iron head;
 *  `thrust` (a unit direction) levels the spear at a foe instead, jabbed out by `jab` (0 to 1). */
export function watchmanRects(x: number, y: number, dot: number, thrust?: {x:number;y:number}, jab = 0) {
  const half=WATCHMAN_PX/2*dot, left=x-half, top=y-half, h=dot/2;
  const body={x:left,y:top,w:WATCHMAN_PX*dot,h:WATCHMAN_PX*dot};
  if(!thrust) return {
    body,
    shaft: {x:left+WATCHMAN_PX*dot,y:top-h,w:h,h:3*dot},
    head: {x:left+WATCHMAN_PX*dot,y:top-h-dot,w:h,h:dot},
  };
  // Levelled along the stronger axis of the thrust, out from the body's edge.
  const out=(WATCHMAN_PX/2+jab)*dot, len=3*dot;
  if(Math.abs(thrust.x)>=Math.abs(thrust.y)) {
    const sx=thrust.x>=0?1:-1, y0=y-h/2;
    const near=sx>0?x+out-dot:x-out-len+dot;
    return { body, shaft:{x:near,y:y0,w:len,h}, head:{x:sx>0?near+len:near-dot,y:y0,w:dot,h} };
  }
  const sy=thrust.y>=0?1:-1, x0=x+h/2;
  const near=sy>0?y+out-dot:y-out-len+dot;
  return { body, shaft:{x:x0,y:near,w:h,h:len}, head:{x:x0,y:sy>0?near+len:near-dot,w:h,h:dot} };
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
