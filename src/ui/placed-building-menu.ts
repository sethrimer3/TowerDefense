/** DOM lifecycle and gestures for the supplied square building menu. The
 * host owns saves and battle rules; this controller owns no animation loop. */
import { t } from "../i18n/index.ts";
import { buildingMenuHtml, buildingMenuBox, placeBuildingMenu, setMenuRange, snapRange, typeModeName, menuBars, growScale, MENU_COST_ROOM, MENU_SIZE, FRAME_MS, type MenuControls, type MenuSizing, type BuildingMenuSpec, type MenuUpgrade } from "./building-menu.ts";
import { paintIcon, type IconItem } from "../defend/structure-art.ts";
import { paintPathIcons } from "./path-badge.ts";
import { controlsOf, aimPoint, orderRange } from "../defend/building-controls.ts";
import { center } from "../defend/pathing.ts";
import { CELLS_W, CELLS_H } from "../defend/grid.ts";
import type { Building, CityMap } from "../defend/citygen.ts";
import { DefendRenderer, type CameraView } from "../defend/render.ts";
import type { Armed } from "../defend/inspect.ts";
import type { BuildingOrders } from "../defend/building-orders.ts";

export type PlacedMenuHost = {
  board(): HTMLElement;
  renderer(): DefendRenderer;
  map(): CityMap;
  source(): Armed;
  orders(b:Building):BuildingOrders;
  change(b:Building,orders:BuildingOrders):void;
  spec(b:Building):Pick<BuildingMenuSpec,"name"|"remove"|"tree"|"removeBlocked">;
  tree(b:Building):void;
  /** The building's next upgrades for the top bar, in place of the tree button (Ambush). */
  upgrades?(b:Building):MenuUpgrade[]|undefined;
  /** An upgrade on the top bar was tapped. */
  upgrade?(b:Building,id:string):void;
  remove(b:Building):void;
  closed():void;
  /** Settings' Building menu size (fixed when absent). */
  sizing?():MenuSizing;
};
/** The part of `b`'s range square on the board, which framing fits in the menu's open middle. */
function framedRange(b:Building,source:Armed) {
  const q=orderRange(b,source);
  if(!q)return null;
  const x=Math.max(0,q.x-q.r),y=Math.max(0,q.y-q.r),x1=Math.min(CELLS_W,q.x+q.r),y1=Math.min(CELLS_H,q.y+q.r);
  return {x,y,w:Math.max(0,x1-x),h:Math.max(0,y1-y)};
}
const reducedMotion=()=>document.documentElement.classList.contains("reduce-motion")||matchMedia("(prefers-reduced-motion: reduce)").matches;
export class PlacedBuildingMenu {
  element:HTMLElement|null=null;
  building:Building|null=null;
  placing=false;
  private controls:MenuControls="plain";
  private headroom=0;
  /** While the camera frames a building (`frame` sizing): the view to glide
   * back to, the player's pan/zoom count as of the framing, and whose. */
  private framed:{home:CameraView;moves:number;id:number}|null=null;
  constructor(private host:PlacedMenuHost) {}
  private sizing():MenuSizing {return this.host.sizing?.()??"fixed";}
  show(b:Building) {
    this.clear();
    this.building=b;this.placing=false;
    const source=this.host.source(),o=this.host.orders(b);
    this.controls=controlsOf(b,source);
    const wrapper=document.createElement("div");
    const upgrades=this.host.upgrades?.(b);
    this.headroom=upgrades?.length?MENU_COST_ROOM:0;
    wrapper.innerHTML=buildingMenuHtml({...this.host.spec(b),...(upgrades?{upgrades}:{}),controls:this.controls,mode:o.targetMode,range:o.rangePercent,aimSet:!!(this.controls==="troops"?o.rally:o.crosshair)});
    const el=this.element=wrapper.firstElementChild as HTMLElement;
    for(const c of Array.from(el.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]")))paintIcon(c,c.dataset.icon as IconItem);
    paintPathIcons(el);
    this.host.board().append(el);
    el.onpointerdown=e=>e.stopPropagation();
    el.onclick=e=>{
      const button=(e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if(!button)return;
      if(button.dataset.bmMode) {
        const next={...this.host.orders(b)};
        if(button.dataset.bmMode==="closest")delete next.targetMode;
        else next.targetMode=button.dataset.bmMode as BuildingOrders["targetMode"];
        this.host.change(b,next);
        for(const radio of Array.from(el.querySelectorAll<HTMLElement>("[data-bm-mode]")))radio.setAttribute("aria-checked",String(radio===button));
        typeModeName(el,button,button.getAttribute("aria-label") ?? "",reducedMotion());
      }
      if(button.dataset.bm==="tree") {this.dismiss(false);this.host.tree(b);}
      if(button.dataset.bmUpgrade)this.host.upgrade?.(b,button.dataset.bmUpgrade);
      if(button.dataset.bm==="remove") {this.dismiss(false);this.host.remove(b);}
      if(button.dataset.bm==="aim") {
        if(this.placing){this.show(b);return;}
        const key=this.controls==="troops"?"rally":"crosshair",next={...this.host.orders(b)};
        if(next[key]) {delete next[key];this.host.change(b,next);this.show(b);}
        else {this.placing=true;el.classList.add("placing");}
      }
    };
    const slider=el.querySelector<HTMLInputElement>('[data-bm="range"]');
    if(slider) {
      slider.onpointerdown=()=>el.classList.add("adjusting");
      const stop=()=>el.classList.remove("adjusting");
      slider.onpointerup=stop;slider.onpointercancel=stop;slider.onblur=stop;
      slider.oninput=()=>{
        const percent=snapRange(Number(slider.value)),next={...this.host.orders(b)};
        if(percent===100)delete next.rangePercent;else next.rangePercent=percent;
        this.host.change(b,next);setMenuRange(el,percent);
      };
    }
    this.frame(b);
    this.position();
  }
  /** `frame` sizing: glides the camera so `b` is centred and its range
   * square fills the menu's open middle (once a building; a pan or zoom by
   * the player since leaves the view where they put it). */
  private frame(b:Building) {
    const range=this.sizing()==="frame"&&this.controls!=="plain"?framedRange(b,this.host.source()):null;
    const renderer=this.host.renderer();
    if(!range){this.restore();return;}
    if(this.framed?.id===b.id)return;
    const board=this.host.board().getBoundingClientRect(),bar=menuBars({w:board.width}).bar,m=MENU_SIZE.margin;
    const hole=Math.min(board.width-2*m,board.height-2*m-this.headroom)-2*bar-8;
    const home=this.framed&&renderer.moves===this.framed.moves?this.framed.home:renderer.view();
    renderer.setOverscroll(bar+m+this.headroom);
    renderer.glideTo(renderer.framing(range.x+range.w/2,range.y+range.h/2,Math.max(range.w,range.h),hole),reducedMotion()?0:FRAME_MS);
    this.framed={home,moves:renderer.moves,id:b.id};
  }
  /** Glides the camera back to where it stood before framing, unless the player moved it since. */
  private restore() {
    const f=this.framed;
    this.framed=null;
    if(!f)return;
    const renderer=this.host.renderer();
    const ms=reducedMotion()?0:FRAME_MS;
    renderer.setOverscroll(0);
    if(renderer.moves===f.moves)renderer.glideTo(f.home,ms);
    else renderer.settle(ms);
  }
  /** Redraws only the top bar's upgrades (picked, bought, newly offered), so the menu doesn't pop open again. */
  updateUpgrades() {
    const b=this.building,el=this.element;
    if(!b||!el)return;
    const upgrades=this.host.upgrades?.(b),top=el.querySelector(".bm-top");
    if(!upgrades||!top)return this.show(b);
    const wrapper=document.createElement("div");
    wrapper.innerHTML=buildingMenuHtml({...this.host.spec(b),upgrades,controls:this.controls});
    const fresh=wrapper.querySelector(".bm-top")!;
    for(const c of Array.from(fresh.querySelectorAll<HTMLCanvasElement>("canvas[data-icon]")))paintIcon(c,c.dataset.icon as IconItem);
    paintPathIcons(fresh);
    top.replaceWith(fresh);
    this.headroom=upgrades.length?MENU_COST_ROOM:0;
    this.position();
  }
  /** Returns true when the board tap was consumed by point placement. */
  tap(at:{x:number;y:number}) {
    const b=this.building;
    if(!this.placing||!b)return false;
    const p=aimPoint(b,this.host.source(),this.host.map(),at),c=center(b.rect);
    const next={...this.host.orders(b),[this.controls==="troops"?"rally":"crosshair"]:{x:p.x-c.x,y:p.y-c.y}};
    this.host.change(b,next);this.show(b);return true;
  }
  escape() {if(this.placing&&this.building)this.show(this.building);else this.dismiss();}
  private clear() {this.element?.remove();this.element=null;this.building=null;this.placing=false;}
  dismiss(notify=true) {
    this.clear();this.restore();
    if(notify)this.host.closed();
  }
  position() {
    if(!this.element||!this.building)return;
    const spec=this.host.spec(this.building),button=this.element.querySelector<HTMLButtonElement>('[data-bm="remove"]');
    if(button&&spec.remove?.kind==="sell") {
      const label=t("menu.sell",{gold:spec.remove.gold});
      if(button.title!==label){button.title=label;button.setAttribute("aria-label",label);const price=this.element.querySelector(".bm-price");if(price)price.textContent=String(spec.remove.gold);}
    }
    const renderer=this.host.renderer(),board=this.host.board().getBoundingClientRect(),sizing=this.sizing();
    renderer.stepGlide();
    // Framed, the menu's open middle wraps the range square rather than the building.
    const r=(sizing==="frame"&&this.framed?framedRange(this.building,this.host.source()):null)??this.building.rect;
    // Opposite corners, ordered on screen (a turned board swaps them round).
    const p=renderer.toClient(r.x,r.y),q=renderer.toClient(r.x+r.w,r.y+r.h);
    const a={x:Math.min(p.x,q.x),y:Math.min(p.y,q.y)},z={x:Math.max(p.x,q.x),y:Math.max(p.y,q.y)};
    const scale=sizing==="grow"?growScale(renderer.cam.s,DefendRenderer.MAX_ZOOM):1;
    placeBuildingMenu(this.element,buildingMenuBox({x:a.x-board.left,y:a.y-board.top,w:z.x-a.x,h:z.y-a.y},{w:board.width,h:board.height},this.controls,this.headroom,scale));
  }
}
