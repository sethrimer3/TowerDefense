/** Shared geometry and application of the menu's orders in Defend/Ambush. */
import { keepArrowRange } from "./towers.ts";
import { deployCircle, rallyAim, climbsTowers } from "./deployment.ts";
import { shootsFlat } from "./gun-sight.ts";
import { reachOf, type Armed } from "./inspect.ts";
import { center, type Point } from "./pathing.ts";
import { clampToSquare, type Square } from "./square-range-art.ts";
import { ordersOf, type BuildingOrders } from "./building-orders.ts";
import type { Building, CityMap } from "./citygen.ts";
import type { DefendSim } from "./sim.ts";
import type { MenuControls } from "../ui/building-menu.ts";

export function controlsOf(b: Building, source: Armed): MenuControls {
  if (deployCircle(b,source.bonuses,source)) return "troops";
  return reachOf(b,source).length && (b.kind!=="keep" || keepArrowRange(source)>0) ? "shooter" : "plain";
}
export function orderRange(b: Building, source: Armed): Square | null {
  return deployCircle(b,source.bonuses,source) ?? reachOf(b,source)[0] ?? null;
}
export function aimPoint(b:Building,source:Armed,map:CityMap,at:Point):Point & {tower?:number} {
  const range=orderRange(b,source)!;
  if(controlsOf(b,source)==="troops") {
    const towers=climbsTowers(b.kind,shootsFlat)?map.buildings.filter(t=>t.kind==="watchTower"):[];
    // A deliberate placement can stand on its home; quick-drag still clears
    // when brought home before reaching this helper.
    return rallyAim(b,at,range,towers) ?? clampToSquare(range,at);
  }
  return clampToSquare(range,at);
}
export function clampOrders(b:Building,source:Armed,orders:BuildingOrders) {
  const range=orderRange(b,source);
  if(!range)return;
  const c=center(b.rect);
  for(const key of ["rally","crosshair"] as const) if(orders[key]) {
    const p=clampToSquare(range,{x:c.x+orders[key]!.x,y:c.y+orders[key]!.y});
    orders[key]={x:p.x-c.x,y:p.y-c.y};
  }
}
/** Refresh live handles and invalidate walking lists/routes after a slider change. */
export function applyOrders(sim:DefendSim,b:Building,orders:BuildingOrders) {
  sim.orders.set(b.id,orders);
  clampOrders(b,sim,orders);
  const c=center(b.rect);
  if(orders.rally)sim.setRally(b.id,aimPoint(b,sim,sim.map,{x:c.x+orders.rally.x,y:c.y+orders.rally.y}));
  else sim.setRally(b.id,null);
  if(orders.crosshair) {
    const p={x:c.x+orders.crosshair.x,y:c.y+orders.crosshair.y};
    sim.crosshairs.set(b.id,p);
    if(b.kind==="minelayerTower")sim.mineAims.set(b.id,p);
  } else {sim.crosshairs.delete(b.id);sim.mineAims.delete(b.id);}
  for(const s of sim.soldiers)if(s.home===b.id){s.thinkT=0;s.path=[];s.target=-1;}
}
export function restoreOrders(sim:DefendSim) {
  for(const b of sim.map.buildings) {
    const o=ordersOf(sim,b);
    if(Object.keys(o).length)applyOrders(sim,b,o);
  }
}
