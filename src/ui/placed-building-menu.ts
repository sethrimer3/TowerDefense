/** DOM lifecycle and gestures for the supplied square building menu. The
 * host owns saves and battle rules; this controller owns no animation loop. */
import { t } from "../i18n/index.ts";
import { buildingMenuHtml, buildingMenuBox, placeBuildingMenu, setMenuRange, snapRange, type MenuControls, type BuildingMenuSpec } from "./building-menu.ts";
import { controlsOf, aimPoint } from "../defend/building-controls.ts";
import { center } from "../defend/pathing.ts";
import type { Building, CityMap } from "../defend/citygen.ts";
import type { DefendRenderer } from "../defend/render.ts";
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
  remove(b:Building):void;
  closed():void;
};
export class PlacedBuildingMenu {
  element:HTMLElement|null=null;
  building:Building|null=null;
  placing=false;
  private controls:MenuControls="plain";
  constructor(private host:PlacedMenuHost) {}
  show(b:Building) {
    this.dismiss(false);
    this.building=b;this.placing=false;
    const source=this.host.source(),o=this.host.orders(b);
    this.controls=controlsOf(b,source);
    const wrapper=document.createElement("div");
    wrapper.innerHTML=buildingMenuHtml({...this.host.spec(b),controls:this.controls,mode:o.targetMode,range:o.rangePercent,aimSet:!!(this.controls==="troops"?o.rally:o.crosshair)});
    const el=this.element=wrapper.firstElementChild as HTMLElement;
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
      }
      if(button.dataset.bm==="tree") {this.dismiss(false);this.host.tree(b);}
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
  dismiss(notify=true) {
    this.element?.remove();this.element=null;this.building=null;this.placing=false;
    if(notify)this.host.closed();
  }
  position() {
    if(!this.element||!this.building)return;
    const spec=this.host.spec(this.building),button=this.element.querySelector<HTMLButtonElement>('[data-bm="remove"]');
    if(button&&spec.remove?.kind==="sell") {
      const label=t("menu.sell",{gold:spec.remove.gold});
      if(button.title!==label){button.title=label;button.setAttribute("aria-label",label);const price=this.element.querySelector(".bm-price");if(price)price.textContent=String(spec.remove.gold);}
    }
    const renderer=this.host.renderer(),r=this.building.rect,board=this.host.board().getBoundingClientRect();
    const a=renderer.toClient(r.x,r.y),z=renderer.toClient(r.x+r.w,r.y+r.h);
    placeBuildingMenu(this.element,buildingMenuBox({x:a.x-board.left,y:a.y-board.top,w:z.x-a.x,h:z.y-a.y},{w:board.width,h:board.height},this.controls));
  }
}
