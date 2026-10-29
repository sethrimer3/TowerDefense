/** Render-only rubble and lighting masks. The native battle remains frozen. */
import type { CityMap, Building } from './citygen.ts';
import type { DefendSim } from './sim.ts';
export class CollapseView{
 private source?:DefendSim;
 private proxy?:DefendSim;
 private key='';
 private revision=0;
 private fallen=new Set<number>();
 private hp!:DefendSim['hp'];
 private built!:DefendSim['built'];
 private solid!:Uint8Array;
 private changed:number[]=[];
 view(sim:DefendSim,map:CityMap,fallen:ReadonlySet<number>):DefendSim{
  const key=[...fallen].sort((a,b)=>a-b).join(',')+':'+sim.mapVersion;
  if(this.source!==sim||this.key!==key){
   this.hp=sim.hp.slice();this.built=sim.built.slice();this.solid=sim.solid.slice();this.changed=[...sim.changed];this.fallen=new Set(fallen);
   for(const id of fallen){const b=map.buildings[id];if(!b)continue;this.hp[id]=0;this.built[id]=0;for(const cell of b.cells){this.solid[cell]=0;this.changed.push(cell);}}
   this.key=key;this.revision++;
  }
  if(this.source!==sim){this.source=sim;this.proxy=new Proxy(sim,{get:(_target,key)=>{
   if(key==='hp')return this.fallen.size?this.hp:sim.hp;if(key==='built')return this.fallen.size?this.built:sim.built;
   if(key==='solid'||key==='ownSolid'||key==='foeSolid')return this.fallen.size?this.solid:sim[key];
   if(key==='changed')return this.fallen.size?this.changed:sim.changed;if(key==='mapVersion')return sim.mapVersion+this.revision;
   if(key==='intact')return (b:Building)=>!this.fallen.has(b.id)&&sim.intact(b);
   if(key==='keepHp')return ()=>this.fallen.has(sim.keepId)?0:sim.keepHp();
   if(key==='skyPalaces')return sim.skyPalaces.filter(p=>!this.fallen.has(p.id));
   const value=Reflect.get(sim,key,sim);return typeof value==='function'?value.bind(sim):value;
  }});}
  return this.proxy!;
 }
}
