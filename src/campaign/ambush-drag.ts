/** Native pointer/ghost/loupe handling, with Ambush's free-grid transaction. */
import { EditSession,type DragAt,type Drop } from '../defend/edit-session.ts';
import { defaultLayout,type PlacedKind } from '../defend/layout.ts';
import type { Overlay } from '../defend/edit-overlay.ts';
import { footprint } from '../defend/catalog.ts';
import type { AmbushGrid,GridBuilding } from './ambush-grid.ts';
export class AmbushDrag extends EditSession {
 private point:DragAt|null=null;private first:DragAt|null=null;
 constructor(readonly kind:PlacedKind,private grid:AmbushGrid,private buildings:readonly GridBuilding[],readonly moving=-1){
  super(moving<0?{from:'palette',item:kind}:{from:'structure',uid:moving,kind},defaultLayout());
 }
 override hover(at:DragAt){this.point=at;this.first??=at;}
 private choice(at:DragAt){const f=footprint(this.kind,false),qx=Math.round((at.cellX-f.w/2)/2),qy=Math.round((at.cellY-f.h/2)/2);return {qx,qy,...this.grid.check(this.kind,qx,qy,this.buildings,this.moving)};}
 override overlay():Overlay|null {
  if(!this.point?.overBoard)return null;const c=this.choice(this.point);
  return {legal:new Set(),hover:null,ghost:{rect:c.rect,kind:this.kind},quarters:{rect:c.rect,fits:c.fits,clear:true}};
 }
 override release(at:DragAt):Drop {
  const c=this.choice(at),layout=defaultLayout();
  if(this.moving>=0&&this.first&&Math.sqrt((at.cellX-this.first.cellX)*(at.cellX-this.first.cellX)+(at.cellY-this.first.cellY)*(at.cellY-this.first.cellY))<.75)return {kind:'build',layout,message:null,tap:true};
  if(at.overBoard&&c.fits)layout.structures.push({uid:this.moving,kind:this.kind,qx:c.qx,qy:c.qy,tx:Math.floor(c.rect.x/8),ty:Math.floor(c.rect.y/8)});
  return {kind:'build',layout,message:at.overBoard&&!c.fits?'Choose open ground with a clear quarter between buildings.':null};
 }
}
