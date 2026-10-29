/** Groups native staging homes; commands use Defend's existing rally API. */
import { TRAINS } from '../defend/deployment.ts';
import type { DefendSim, Soldier } from '../defend/sim.ts';
import { CELLS_H, CELLS_W } from '../defend/grid.ts';
import type { Flag } from '../profile/model.ts';
export type SquadId='melee'|'ranged'|'magic'|'mounted'|'hero'|'shade'|'valkyrie'|'darkWizard'|'railSniper'|'gatlingGunner';
export type Squad={id:SquadId;kind:Soldier['kind'];homes:number[];color:string;face:Flag};
const ORDER:SquadId[]=['melee','ranged','mounted','magic','hero','shade','valkyrie','darkWizard','railSniper','gatlingGunner'];
const ELITES=new Set(['hero','shade','valkyrie','darkWizard','railSniper','gatlingGunner']);
export const squadRole=(kind:Soldier['kind']):SquadId=>ELITES.has(kind)?kind as SquadId:kind==='mage'?'magic':kind==='lancer'?'mounted':['sword','brawler','assassin','spearman','hoplite'].includes(kind)?'melee':'ranged';
const PAINTS=[{color:'#4682d8',base:4},{color:'#68a669',base:5},{color:'#cd9554',base:8},{color:'#bd8bda',base:6},{color:'#e7b54a',base:3},{color:'#d88491',base:9},{color:'#77bccc',base:10},{color:'#94949a',base:14},{color:'#df8240',base:15},{color:'#a83240',base:2}];
export class SiegeSquads{
 readonly groups:Squad[]=[];
 constructor(readonly sim:DefendSim,ids:ReadonlySet<number>){
  for(const id of ids){const b=sim.map.buildings[id],kind=TRAINS[b.kind];if(!kind)continue;const role=squadRole(kind);let group=this.groups.find(g=>g.id===role);
   if(!group){const paint=PAINTS[ORDER.indexOf(role)];group={id:role,kind,homes:[],color:paint.color,face:{base:paint.base,layers:[]}};this.groups.push(group);}group.homes.push(id);
  }
  this.groups.sort((a,b)=>ORDER.indexOf(a.id)-ORDER.indexOf(b.id));
 }
 count(group:Squad){const homes=new Set(group.homes);return this.sim.soldiers.filter(u=>u.hp>0&&homes.has(u.home)).length;}
 at(group:Squad){return this.sim.rallies.get(group.homes[0]);}
 plant(group:Squad,p:{x:number;y:number}){
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
  const at={x:Math.max(.5,Math.min(CELLS_W-.5,p.x)),y:Math.max(.5,Math.min(CELLS_H-.5,p.y))};for(const id of group.homes)this.sim.setRally(id,at);return true;
 }
 clear(group:Squad){for(const id of group.homes)this.sim.setRally(id,null);}
}
