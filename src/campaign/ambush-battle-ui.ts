import { drawFlierWarning } from './flier-warning.ts';
/** Native board, pointer transactions and controls; rules live in AmbushSim. */
import { DefendRenderer } from '../defend/render.ts';
import { BoardPointers } from '../defend/board-pointers.ts';
import { paintIcon } from '../defend/structure-art.ts';
import { STRUCTURES,type StructureKind } from '../defend/catalog.ts';
import { hasForest } from '../defend/forest.ts';
import type { PlacedKind } from '../defend/layout.ts';
import type { Drop } from '../defend/edit-session.ts';
import type { CampaignHost } from './ui.ts';
import { AmbushSim,AMBUSH_PALETTE,type AmbushSpell } from './ambush-sim.ts';
import { AmbushDrag } from './ambush-drag.ts';
import { buildingRect } from './ambush-grid.ts';
import { drawEntryArrow } from './entry-arrow.ts';
import { recordStars } from './levels.ts';
import { t } from '../i18n/index.ts';
export class AmbushBattlePage {
 sim:AmbushSim;readonly canvas=document.createElement('canvas');readonly renderer:DefendRenderer;
 private pointers:BoardPointers;private last=0;private paused=false;private picked:number|undefined;private selected:PlacedKind='archerTower';
 private notice='';private now=0;private settled=false;private resetCamera=true;private cleared=new Map<number,string>();
 private spell:AmbushSpell|undefined;
 constructor(private root:HTMLElement,private index:number,private host:CampaignHost){
  this.sim=new AmbushSim(index,host.save());this.renderer=new DefendRenderer(this.canvas);
  this.canvas.setAttribute('aria-label','Ambush battlefield');
  this.pointers=new BoardPointers({renderer:()=>this.renderer,paletteSelector:'#ambush-palette',
   raise:()=>host.save().settings.raiseDrag,magnify:()=>host.save().settings.magnifier,
   pickUp:e=>this.lift(e),drop:d=>this.drop(d),tap:e=>this.tap(e)});
  this.canvas.onpointerdown=e=>this.pointers.down(e);this.canvas.oncontextmenu=e=>e.preventDefault();
  this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.renderer.zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.0015));},{passive:false});
  this.render();
 }
 selectLevel(index:number){this.index=index;this.reset();}
 show(){this.last=0;this.render();}
 pause(){this.last=0;this.pointers.end();}
 reset(){this.pause();this.sim=new AmbushSim(this.index,this.host.save());this.paused=false;this.picked=undefined;this.spell=undefined;this.notice='';this.settled=false;this.resetCamera=true;this.cleared.clear();this.render();}
 private render(){
  this.pointers.end();this.root.classList.add('native-campaign');
  this.root.innerHTML='<div class="campaign-head defend-head"><span class="ambush-level-name">'+this.sim.level.name+'</span>'+
   '<button data-action="level-select" data-i18n="ambush.levelSelect">'+t('ambush.levelSelect')+'</button>'+
   '<div class="campaign-actions"><button data-action="start">'+(this.sim.phase==='build'?'Start waves':this.paused?t('ambush.resume'):t('ambush.pause'))+'</button>'+
   '<button data-action="retry" data-i18n="ambush.retry">'+t('ambush.retry')+'</button></div>'+
   '<p class="ambush-wallet">Ambush gold: <b id="ambush-gold"></b></p>'+
   '<div class="campaign-inspect-actions"><button data-action="sell" hidden></button><button data-action="close" hidden>'+t('ambush.close')+'</button></div>'+
   '<div class="campaign-spells"></div><p class="campaign-status" role="status" aria-live="polite"></p></div>'+
   '<div class="campaign-stage defend-stage side-open"><aside class="defend-side"><div class="campaign-roster defend-palette" id="ambush-palette"></div></aside>'+
   '<div class="campaign-board defend-board"></div></div>';
  this.root.querySelector('.campaign-board')!.append(this.canvas);
  this.root.querySelector<HTMLButtonElement>('[data-action="level-select"]')!.onclick=()=>this.host.levelSelect?.();
  this.root.querySelector<HTMLButtonElement>('[data-action="retry"]')!.onclick=()=>this.reset();
  this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!.onclick=()=>{if(this.sim.phase==='build'){if(!this.sim.start())this.notice='Place a building beside the road first.';}else this.paused=!this.paused;this.render();};
  this.root.querySelector<HTMLButtonElement>('[data-action="sell"]')!.onclick=()=>{if(this.picked!==undefined)this.sim.remove(this.picked);this.picked=undefined;this.refresh();};
  this.root.querySelector<HTMLButtonElement>('[data-action="close"]')!.onclick=()=>{this.picked=undefined;this.refresh();};
  const spellNames={meteor:'Meteor',frostNova:'Frost nova',reinforcements:'Reinforcements',necromancy:'Necromancy'};
  this.root.querySelector('.campaign-spells')!.innerHTML=this.sim.spells.map(spell=>'<button data-spell="'+spell+'">'+spellNames[spell]+'</button>').join('');
  this.root.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach(b=>b.onclick=()=>{const spell=b.dataset.spell as AmbushSpell;this.spell=this.spell===spell?undefined:spell;this.refresh();});
  this.palette();this.refresh();this.draw();
 }
 private palette(){
  const roster=this.root.querySelector<HTMLElement>('.campaign-roster')!;
  roster.innerHTML=AMBUSH_PALETTE.map(kind=>'<button class="defend-item" data-kind="'+kind+'" aria-pressed="'+String(this.selected===kind)+'"><canvas width="48" height="48"></canvas><span>'+STRUCTURES[kind].name+'</span><small>'+this.sim.price(kind)+' gold</small></button>').join('');
  roster.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b=>{
   const kind=b.dataset.kind as PlacedKind;paintIcon(b.querySelector('canvas')!,kind);
   b.onclick=()=>{this.selected=kind;this.picked=undefined;this.palette();this.refresh();};
   b.onpointerdown=e=>{if(b.disabled||e.button!==0)return;this.selected=kind;this.picked=undefined;this.pointers.begin(new AmbushDrag(kind,this.sim.grid,this.sim.buildings),e,false);};
  });
 }
 private lift(e:PointerEvent){
  if(this.spell||this.sim.phase!=='build')return false;const p=this.renderer.toCell(e.clientX,e.clientY);
  const b=this.at(p.fx,p.fy);if(!b)return false;this.picked=b.id;
  this.pointers.begin(new AmbushDrag(b.kind as PlacedKind,this.sim.grid,this.sim.buildings,b.id),e,false);return true;
 }
 private drop(drop:Drop){
  if(drop.kind!=='build')return;const p=drop.layout.structures[0];
  if(p){const ok=p.uid<0?this.sim.placeAt(p.kind,p.qx,p.qy):this.sim.moveTo(p.uid,p.qx,p.qy);this.notice=ok?'':'That building cannot be placed here.';}
  else if(drop.message)this.notice=drop.message;
  this.refresh();
 }
 private at(x:number,y:number){return this.sim.buildings.find(b=>{const r=buildingRect(b);return x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;});}
 private tap(e:PointerEvent){
  const p=this.renderer.toCell(e.clientX,e.clientY),b=this.at(p.fx,p.fy);
  if(this.spell){if(this.sim.cast(this.spell,{x:p.fx,y:p.fy}))this.spell=undefined;this.refresh();return;}
  if(b)this.picked=b.id;
  else if(this.picked!==undefined)this.picked=undefined;
  else if(['build','battle'].includes(this.sim.phase)){
   const f=STRUCTURES[this.selected];
   this.notice=this.sim.placeAt(this.selected,Math.round((p.fx-f.w/2)/2),Math.round((p.fy-f.h/2)/2))?'':'Choose open ground beside the road.';
  }
  this.refresh();
 }
 frame(now:number){
  this.now=now;const dt=this.last?Math.min(.1,(now-this.last)/1000):0;this.last=now;
  if(!this.paused)this.sim.step(dt);
  if(!this.settled&&(this.sim.phase==='won'||this.sim.phase==='lost')){this.settled=true;if(this.sim.phase==='won'){recordStars(this.host.save().campaigns.ambush,this.sim.level,this.sim.stars);this.host.store();}this.render();}
  this.refresh();this.draw();
 }
 private refresh(){
  const s=this.sim,b=s.buildings.find(b=>b.id===this.picked),ended=s.phase==='won'||s.phase==='lost';
  this.root.querySelector('#ambush-gold')!.textContent=String(Math.floor(s.gold));
  this.root.querySelector('.campaign-status')!.textContent=ended?(s.phase==='won'?t('ambush.victory'):t('ambush.defeat')):this.notice||('Wave '+s.wave+'/3 · Keep '+Math.ceil(s.engine.keepHp())+' · '+s.enemiesLeft+' enemies · '+s.kills+' kills');
  const sell=this.root.querySelector<HTMLButtonElement>('[data-action="sell"]')!,close=this.root.querySelector<HTMLButtonElement>('[data-action="close"]')!;
  sell.hidden=close.hidden=!b;if(b){sell.textContent=t('ambush.sell',{gold:s.refund(b.id)});sell.disabled=ended;}
  this.root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button=>button.disabled=ended||s.price(button.dataset.kind as StructureKind)>s.gold);
  this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!.disabled=ended;
  const e=s.engine,remaining={meteor:e.meteorRemaining,frostNova:e.frostRemaining,reinforcements:e.reinforceRemaining,necromancy:e.necroRemaining};
  this.root.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach(b=>{const spell=b.dataset.spell as AmbushSpell;b.disabled=s.phase!=='battle'||remaining[spell]>0;b.setAttribute('aria-pressed',String(this.spell===spell));});
 }
 private draw(){
  const r=this.renderer,box=this.canvas.getBoundingClientRect();r.resize(box.width,box.height);if(this.resetCamera){r.resetCam();this.resetCamera=false;}
  const s=this.sim,settings=this.host.save().settings,reduced=settings.reduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(hasForest(s.level.area)){r.forest.sync(s.map,s.engine);for(const b of s.buildings){const rect=buildingRect(b),key=[rect.x,rect.y,rect.w,rect.h].join(',');if(this.cleared.get(b.id)!==key){r.forest.clearBuilding(rect);this.cleared.set(b.id,key);}}}
  r.draw(s.map,s.engine,this.pointers.session?.overlay()??null,{area:s.level.area,grid:0,weather:null,night:0,now:this.now,reduceMotion:reduced,effects:!settings.effectsOff,healthbars:settings.showHealthbars,simpleEnemies:settings.simpleEnemies,simpleTroops:settings.simpleTroops,mergedOutlines:settings.mergedOutlines,...(this.picked!==undefined?{inspect:{id:this.picked,armed:s.engine}}:{})});
  const c=this.canvas.getContext('2d')!;c.save();c.setTransform(r.cam.s,0,0,r.cam.s,r.cam.x,r.cam.y);drawEntryArrow(c,s.field.path[0],s.field.path[1],r.px,this.now,reduced);if(s.warning)drawFlierWarning(c,s.field.path[0],s.field.track.keep,r.px,this.now,reduced);c.restore();this.pointers.drawLoupe(r);
 }
}
