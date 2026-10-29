import { SiegeSquads, type Squad } from './siege-squads.ts';
import { paintTroopBadge } from '../defend/garrison-icons.ts';
import { drawRallyFlag } from '../defend/structure-art.ts';
import { t } from '../i18n/index.ts';
export class SquadBar{
 readonly el=document.createElement('div');
 armed?:Squad;
 point?:{x:number;y:number};
 private buttons=new Map<Squad,HTMLButtonElement>();
 constructor(readonly squads:SiegeSquads,private onArm:()=>void){
  this.el.className='siege-squads';this.el.setAttribute('role','toolbar');this.el.setAttribute('aria-label',t('siege.squads'));
  for(const group of squads.groups){const b=document.createElement('button');b.type='button';b.dataset.squad=group.id;b.style.setProperty('--squad',group.color);
   const label=t(`siege.group.${group.id}`);b.title=t('siege.squadHelp',{name:label});b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed','false');
   const cv=document.createElement('canvas');cv.width=cv.height=32;paintTroopBadge(cv,group.kind);
   const text=document.createElement('span');text.textContent=label;const count=document.createElement('small');b.append(cv,text,count);
   b.onclick=()=>{if(this.armed===group){squads.clear(group);this.cancel();}else{this.cancel();this.armed=group;this.onArm();b.setAttribute('aria-pressed','true');}};
   this.buttons.set(group,b);this.el.append(b);
  }
 }
 cancel(){this.armed=undefined;this.point=undefined;for(const b of this.buttons.values())b.setAttribute('aria-pressed','false');}
 plant(at:{x:number;y:number}){if(!this.armed)return false;const placed=this.squads.plant(this.armed,at);if(placed)this.cancel();return placed;}
 update(active:boolean){for(const [group,b]of this.buttons){b.disabled=!active;b.querySelector('small')!.textContent=String(this.squads.count(group));b.dataset.ordered=String(!!this.squads.at(group));}if(!active)this.cancel();}
 draw(c:CanvasRenderingContext2D,px:number,now:number,reduced:boolean){
  for(const group of this.squads.groups){const at=this.squads.at(group);if(at)drawRallyFlag(c,px,at,{t:now/1000,reduceMotion:reduced,face:group.face});}
  if(this.armed&&this.point)drawRallyFlag(c,px,this.point,{t:now/1000,reduceMotion:reduced,alpha:.55,face:this.armed.face});
 }
}
