import { observePreviews } from './previews.ts';
/** Level selection owns navigation; active battles still use the native campaign page. */
import { AREAS, areaStyle } from '../defend/areas.ts';
import { type CampaignHost } from './ui.ts';
import { AmbushBattlePage } from './ambush-battle-ui.ts';
import { AMBUSH_LEVELS, levelUnlocked, totalStars } from './levels.ts';
import { t } from '../i18n/index.ts';
export class AmbushPage {
 private battle?: AmbushBattlePage;
 private running = false;
 private previews?:()=>void;
 constructor(private root: HTMLElement, private host: CampaignHost) {}
 get sim() { return this.battle?.sim; }
 show() { if (this.running) this.battle!.show(); else this.select(); }
 reset() { this.battle?.pause(); this.running = false; this.select(); }
 pause() { this.battle?.pause(); }
 frame(now: number) { if (this.running) this.battle!.frame(now); }
 private select() {
  this.previews?.();this.running = false;this.battle?.pause();
  this.root.classList.remove('native-campaign');this.root.classList.add('ambush-select');
  const progress = this.host.save().campaigns.ambush;
  this.root.innerHTML = `<div class="ambush-select-head"><strong data-i18n="ambush.levelSelect">${t('ambush.levelSelect')}</strong><span>${t('ambush.stars',{stars:totalStars(progress),total:90})}</span></div>
   <div class="ambush-level-columns">${['I','II','III'].map(level=>`<span>${t('ambush.levelColumn',{level})}</span>`).join('')}</div>
   ${AREAS.map(area=>`<section class="ambush-zone" style="${areaStyle(area)}"><h2>${area.name}</h2><div class="ambush-level-cards">${AMBUSH_LEVELS.filter(l=>l.area===area.id).map(l=>{
    const index=AMBUSH_LEVELS.indexOf(l),stars=progress.stars[l.id]??0,open=levelUnlocked(progress,index);
    return `<button class="ambush-level-card" data-level="${index}" ${open?'':'disabled'} aria-label="${l.name}, ${t('ambush.stars',{stars,total:3})}${open?'':`, ${t('ambush.locked')}`}"><div class="ambush-level-preview" aria-hidden="true"><canvas data-preview="${index}"></canvas></div><strong>${l.name}</strong><span class="ambush-card-stars" data-stars="${stars}" aria-hidden="true">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</span></button>`;
   }).join('')}</div></section>`).join('')}`;
  this.previews=observePreviews(this.root);
  this.root.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(b=>b.onclick=()=>this.open(Number(b.dataset.level)));
 }
 private open(index:number) {
  if(!levelUnlocked(this.host.save().campaigns.ambush,index))return;
  this.previews?.();this.root.classList.remove('ambush-select');this.running=true;
  if(this.battle)this.battle.selectLevel(index);
  else this.battle=new AmbushBattlePage(this.root,index,{...this.host,levelSelect:()=>this.select()});
 }
}
