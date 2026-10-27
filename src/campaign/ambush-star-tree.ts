/** The Ambush-only permanent tree, using the native living graph and magic circle. */
import { UpgradeGraph,type GraphNode } from '../ui/upgrade-graph.ts';
import { MagicCircle } from '../magic-circle/render.ts';
import { paintIcon,type IconItem } from '../defend/structure-art.ts';
import { paintPathIcon } from '../ui/path-icons.ts';
import type { PathIcon,PathHue } from '../knowledge-paths.ts';
import { AMBUSH_PATHS,ambushPool,ambushAllocated,buyAmbush,undoAmbush,respecAmbush,type AmbushPathId } from '../ambush-upgrades.ts';
import type { AmbushProgress } from './levels.ts';
import { t } from '../i18n/index.ts';
export class AmbushStarTree {
 private dialog=document.createElement('dialog');private graph:UpgradeGraph;private circle=new MagicCircle();private picked='root';private raf=0;private disposed=false;
 constructor(root:HTMLElement,private progress:AmbushProgress,private store:()=>void,private reduced:()=>boolean){
  this.dialog.className='ambush-star-dialog';this.dialog.setAttribute('aria-label',t('ambush.starTree'));
  this.dialog.innerHTML='<div class="ambush-star-head"><strong>'+t('ambush.starTree')+'</strong><span data-pool></span><button data-respec>'+t('ambush.respec')+'</button><button data-close>'+t('ambush.close')+'</button><label>'+t('ambush.branch')+' <select data-branch><option value="">'+t('ambush.chooseBranch')+'</option>'+AMBUSH_PATHS.map(p=>'<option value="'+p.id+'">'+p.name+'</option>').join('')+'</select></label></div><div class="ambush-star-body"><div class="ambush-star-graph"></div></div><div class="ambush-star-card"></div>';
  root.append(this.dialog);this.circle.attach(this.dialog.querySelector('.ambush-star-body')!);
  this.graph=new UpgradeGraph(this.dialog.querySelector('.ambush-star-graph')!,{reduceMotion:reduced,onPick:id=>{this.picked=id;this.paint();},paint:el=>{
   el.querySelectorAll<HTMLCanvasElement>('[data-icon]').forEach(c=>paintIcon(c,c.dataset.icon as IconItem));
   el.querySelectorAll<HTMLCanvasElement>('[data-path-icon]').forEach(c=>{const [icon,hue]=c.dataset.pathIcon!.split(':');paintPathIcon(c,icon as PathIcon,hue as PathHue);});
  }});
  this.dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>this.destroy();
  this.dialog.querySelector<HTMLButtonElement>('[data-respec]')!.onclick=()=>{respecAmbush(progress);this.changed();};
  this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.destroy();});
  this.dialog.querySelector<HTMLSelectElement>('[data-branch]')!.onchange=e=>{const id=(e.target as HTMLSelectElement).value,p=AMBUSH_PATHS.find(p=>p.id===id);if(p){this.picked=id+':'+Math.min(p.ranks.length,(this.progress.ranks?.[p.id]??0)+1);this.paint();}};
  this.paint();this.dialog.showModal();
  const frame=(now:number)=>{if(this.disposed)return;this.circle.frame(now,reduced());this.raf=requestAnimationFrame(frame);};this.raf=requestAnimationFrame(frame);
 }
 private changed(){this.store();this.circle.energize();this.paint();}
 private paint(){
  this.dialog.querySelector('[data-pool]')!.textContent=t('ambush.starPool',{stars:ambushPool(this.progress)});
  this.dialog.querySelector<HTMLButtonElement>('[data-respec]')!.disabled=!ambushAllocated(this.progress.ranks);
  const nodes:GraphNode[]=[{id:'root',state:'owned',face:'<canvas width="32" height="32" data-icon="keep"></canvas>',tag:'★'}];
  for(const p of AMBUSH_PATHS)p.ranks.forEach((r,i)=>{const have=this.progress.ranks?.[p.id]??0;nodes.push({id:p.id+':'+(i+1),parent:i?p.id+':'+i:'root',state:i<have?'owned':i===have?'next':'locked',face:'<canvas data-path-icon="'+r.icon+':'+p.hue+'"></canvas><b>'+['I','II','III'][i]+'</b>',hue:'hue-'+p.hue,tag:r.cost+' ★'});});
  this.graph.set(nodes,this.picked);this.circle.set({topic:'ambush',upgrades:AMBUSH_PATHS.map(p=>({id:p.id,rank:this.progress.ranks?.[p.id]??0}))});
  this.dialog.querySelector<HTMLSelectElement>('[data-branch]')!.value=this.picked.split(':')[0]==='root'?'':this.picked.split(':')[0];
  const [id,n]=this.picked.split(':'),p=AMBUSH_PATHS.find(p=>p.id===id),rank=Number(n),r=p?.ranks[rank-1],card=this.dialog.querySelector<HTMLElement>('.ambush-star-card')!;
  if(!p||!r){card.innerHTML='<p>'+t('ambush.starAbout')+'</p>';return;}
  const have=this.progress.ranks?.[p.id]??0,owned=rank<=have;
  card.innerHTML='<strong>'+r.name+'</strong><p>'+r.text+'</p><button data-star-action>'+t(owned?'ambush.undo':'ambush.buyStars',{stars:r.cost})+'</button>';
  const button=card.querySelector<HTMLButtonElement>('button')!;button.disabled=!owned&&(rank!==have+1||r.cost>ambushPool(this.progress));
  button.onclick=()=>{if(owned)undoAmbush(this.progress,id as AmbushPathId,rank);else buyAmbush(this.progress,id as AmbushPathId);this.changed();};
 }
 destroy(){if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.raf);this.graph.destroy();this.circle.destroy();this.dialog.close();this.dialog.remove();}
}
