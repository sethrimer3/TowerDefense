/** Shared board quick bar; casting and spell geometry remain native. */
import { paintIcon } from '../defend/structure-art.ts';
import type { DefendSim } from '../defend/sim.ts';
import type { Overlay } from '../defend/edit-overlay.ts';
import { meteorReach } from '../defend/meteor.ts';
import { frostReach } from '../defend/frost-nova.ts';
import { dropSpots } from '../defend/reinforcements.ts';
import { NECRO,gravesNear } from '../defend/necromancy.ts';
import { play } from '../sound.ts';
export const STRIKE_SPELLS=['meteor','frostNova','reinforcements','necromancy'] as const;
export type StrikeSpell=typeof STRIKE_SPELLS[number];
const names={meteor:'Meteor strike',frostNova:'Frost nova',reinforcements:'Reinforcements',necromancy:'Necromancy'};
export function spellClocks(sim:DefendSim){
 return {meteor:{left:sim.meteorRemaining,total:sim.meteorCooldown},frostNova:{left:sim.frostRemaining,total:sim.frostCooldown},reinforcements:{left:sim.reinforceRemaining,total:sim.reinforceCooldown},necromancy:{left:sim.necroRemaining,total:sim.necroCooldown}};
}
export function castStrike(sim:DefendSim,spell:StrikeSpell,at:{x:number;y:number}){
 return spell==='meteor'?sim.castMeteor(at):spell==='frostNova'?sim.castFrostNova(at):spell==='reinforcements'?sim.castReinforcements(at):sim.castNecromancy(at)>=0;
}
export class SpellBar {
 readonly el=document.createElement('div');armed?:StrikeSpell;point?:{x:number;y:number};
 private previous=new Map<StrikeSpell,number>();
 constructor(spells:readonly StrikeSpell[]){
  this.el.className='strike-bar';this.el.setAttribute('aria-label','Strike spells');
  for(const spell of spells){const b=document.createElement('button');b.type='button';b.dataset.spell=spell;b.title=names[spell];b.setAttribute('aria-label',names[spell]);b.innerHTML='<canvas width="48" height="48"></canvas><small></small>';paintIcon(b.querySelector('canvas')!,spell);b.onclick=()=>{this.armed=this.armed===spell?undefined:spell;this.el.querySelectorAll('button').forEach(el=>el.setAttribute('aria-pressed',String(el===b&&this.armed===spell)));};this.el.append(b);}
  this.el.onkeydown=e=>{if(e.key==='Escape')this.cancel();};
 }
 cancel(){this.armed=undefined;this.point=undefined;this.el.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));}
 update(sim:DefendSim,active:boolean,reduced=false){
  const clocks=spellClocks(sim);
  for(const b of Array.from(this.el.querySelectorAll<HTMLButtonElement>('[data-spell]'))){
   const spell=b.dataset.spell as StrikeSpell,{left,total}=clocks[spell],old=this.previous.get(spell);
   if(active&&old!==undefined&&old>0&&left===0){if(!reduced){b.classList.remove('strike-ready');void b.offsetWidth;b.classList.add('strike-ready');}play('spellReady');}
   this.previous.set(spell,left);b.disabled=!active||left>0;b.style.setProperty('--fill',(100*(1-left/total))+'%');b.querySelector('small')!.textContent=left>0?String(Math.ceil(left)):'';
   b.setAttribute('aria-pressed',String(this.armed===spell));b.setAttribute('aria-label',names[spell]+(left>0?' · '+Math.ceil(left)+'s':''));
  }
  if(!active)this.cancel();
 }
 overlay(sim:DefendSim):Overlay|null{
  const at=this.point,key=this.armed;if(!at||!key)return null;
  const spell=key==='meteor'?{...at,r:meteorReach(sim),look:'meteor' as const}:key==='frostNova'?{...at,r:frostReach(sim),look:'frost' as const}:key==='reinforcements'?{...at,r:2,look:'reinforce' as const,spots:dropSpots(sim,at)}:{...at,r:NECRO.radius,souls:gravesNear(sim,at)};
  return {legal:new Set(),hover:null,ghost:null,spell,...(key==='necromancy'?{graves:sim.graves}:{})};
 }
}
