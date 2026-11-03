import { TRAINS } from "./defend/deployment.ts";
/** Individual Smithy equipment. Registry ids survive lifting, replacing and evolving a copy. */
import { STRUCTURES } from "./defend/catalog.ts";
import type { PathId } from "./knowledge-paths.ts";
import type { Save } from './save.ts';
import type { DefendSave } from './defend/progress.ts';
import type { Layout, PlacedKind } from './defend/layout.ts';
export type Equipment = { id: number; kind: PlacedKind; uid?: number; slot?: number; path?:PathId; rank?:number; hp: number; power: number };
export type EquipmentStat = 'hp'|'power';
export function equipmentCopy(save: Save, kind: PlacedKind, index: number): Equipment {
 const entries=save.equipment??=([]), placed=save.defend.layout.structures.filter(s=>s.kind===kind);
 const unit=placed[index], kept=save.defend.kept.filter(k=>k.kind===kind)[index-placed.length];
 let gear=unit?entries.find(g=>g.uid===unit.uid):entries.find(g=>g.uid===undefined&&g.kind===kind&&g.slot===index-placed.length);
 if(!gear){gear={id:Math.max(0,...entries.map(g=>g.id))+1,kind,...(unit?{uid:unit.uid}:{slot:index-placed.length}),...((unit??kept)?.path?{path:(unit??kept)!.path,rank:(unit??kept)!.rank}:{}),hp:0,power:0};entries.push(gear);}
 return gear;
}
/** Called before persisting a layout. Existing UIDs carry their gear through transformations. */
export function syncEquipment(entries: Equipment[]|undefined, next: Layout, previous?: Layout) {
 if(!entries)return;
 const previouslyPlaced=new Set(previous?.structures.map(s=>s.uid) ?? entries.filter(g=>g.uid!==undefined).map(g=>g.uid));
 for(const g of entries)if(g.uid!==undefined){const s=next.structures.find(s=>s.uid===g.uid);if(s){g.kind=s.kind;if(s.path){g.path=s.path;g.rank=s.rank;}else{delete g.path;delete g.rank;}}else {delete g.uid;g.slot=0;while(entries.some(o=>o!==g&&o.uid===undefined&&o.kind===g.kind&&o.slot===g.slot))g.slot++;}}
 for(const s of next.structures)if(!previouslyPlaced.has(s.uid)){
  const g=entries.filter(g=>g.uid===undefined&&g.kind===s.kind&&g.path===s.path&&g.rank===s.rank).sort((a,b)=>(a.slot??0)-(b.slot??0))[0];if(g){const slot=g.slot??0;g.uid=s.uid;delete g.slot;for(const o of entries)if(o.uid===undefined&&o.kind===s.kind&&(o.slot??0)>slot)o.slot!--;}
 }
}
export function decodeEquipment(raw: unknown, defend: DefendSave): Equipment[] {
 if(!Array.isArray(raw))return [];
 const out:Equipment[]=[];
 for(const g of raw.slice(0,10000)){
  if(!g||!Number.isSafeInteger(g.id)||g.id<1||out.some(o=>o.id===g.id)||!(g.kind in STRUCTURES)||g.kind==="keep")continue;
  if(!Number.isInteger(g.hp)||g.hp<0||g.hp>50||!Number.isInteger(g.power)||g.power<0||g.power>50)continue;
  const s=defend.layout.structures.find(s=>s.uid===g.uid);
  if(s&&out.some(o=>o.uid===s.uid))continue;
  if(!s&&(!Number.isInteger(g.slot)||g.slot<0||g.slot>=defend.owned[g.kind as PlacedKind]||out.some(o=>o.uid===undefined&&o.kind===g.kind&&o.slot===g.slot)))continue;
  out.push({id:g.id,kind:s?.kind??g.kind,...(s?{uid:s.uid}:{slot:Number.isInteger(g.slot)&&g.slot>=0?g.slot:0}),...(s?.path?{path:s.path,rank:s.rank}:typeof g.path==="string"?{path:g.path,rank:g.rank}:{}),hp:g.hp,power:g.power});
 }
 return out;
}
/** A palette copy changing kind/rank is inserted among kept copies before plain ones. */
export function retagEquipment(save: Save, id: number|undefined, kind: PlacedKind, keptIndex?: number, wear?: {path:PathId;rank:number}) {
 const gear=save.equipment?.find(g=>g.id===id);if(!gear)return;
 const oldKind=gear.kind, oldSlot=gear.slot??0;
 for(const g of save.equipment!)if(g!==gear&&g.uid===undefined&&g.kind===oldKind&&(g.slot??0)>oldSlot)g.slot!--;
 const slot=keptIndex??save.defend.kept.filter(k=>k.kind===kind).length;
 for(const g of save.equipment!)if(g!==gear&&g.uid===undefined&&g.kind===kind&&(g.slot??0)>=slot)g.slot!++;
 gear.kind=kind;gear.slot=slot;if(wear){gear.path=wear.path;gear.rank=wear.rank;}else{delete gear.path;delete gear.rank;}
}
/** Native Siege musters copies under its own stable 100000+ UID namespace. */
export function equipmentBonuses(save: Save) {
 const result:Record<number,{hp:number;power:number}>={};
 const values=(g:Equipment)=>({hp:1+g.hp*.05,power:1+g.power*.05});
 for(const g of save.equipment??[])if(g.uid!==undefined)result[g.uid]=values(g);
 let uid=100000;
 for(const kind of Object.keys(STRUCTURES) as (keyof typeof STRUCTURES)[])if(TRAINS[kind]){
  const placed=save.defend.layout.structures.filter(s=>s.kind===kind);
  for(let i=0;i<(save.defend.owned[kind as PlacedKind]??0);i++,uid++){
   const home=placed[i];const g=save.equipment?.find(g=>home?g.uid===home.uid:g.uid===undefined&&g.kind===kind&&g.slot===i-placed.length);
   if(g)result[uid]=values(g);
  }
 }
 return Object.keys(result).length?result:undefined;
}
