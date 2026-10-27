import { pathLook, pathBadge, paintPathIcons } from "../ui/path-badge.ts";
import type { TileTree } from "../tiles.ts";
import type { Wear } from "./sim.ts";
import { DefendRenderer } from "../defend/render.ts";
import { artLook } from "../defend/tower-art.ts";
import { BoardPointers } from "../defend/board-pointers.ts";
import { flagSvg, escapeText } from "../profile/model.ts";
import { newSiege, nextOpponent, settleRaid } from "./siege-progress.ts";
import { CampaignSim, LEVELS, emptyCampaigns, deployable, levelPlan, type Mode } from './sim.ts';
import { STRUCTURES, type StructureKind, type PaletteItem } from '../defend/catalog.ts';
import { paintIcon } from '../defend/structure-art.ts';
import type { Save } from '../save.ts';
import { t } from '../i18n/index.ts';

type Host = { save:()=>Save; store:()=>void; editProfile?:()=>void; openTree?:(target:TileTree)=>boolean };
/** Canvas and DOM share one simulation, advanced only by the app's frame loop. */
export class CampaignPage {
  sim: CampaignSim;
  private level=0; private selected:StructureKind|null=null; private selectedVariant=0; private selectedPad:number|undefined; private spell:string|undefined; private paused=false; private last=0; private rewarded=false; private notice='';
  private renderer:DefendRenderer|null=null;
  private pointers:BoardPointers|null=null;
  private inspection:number|undefined;
  private now=0;
  private font='serif';
  private canvas!:HTMLCanvasElement; private status!:HTMLElement; private roster!:HTMLElement;
  constructor(private root:HTMLElement,readonly mode:Mode,private host:Host) {if(mode==='siege'&&host.save().siege?.raid.state==='started')settleRaid(host.save().siege!,false);this.sim=this.make();}
  private progress(){return this.host.save().campaigns?.[this.mode];}
  private make(){
    const save=this.host.save(),d=save.defend;
    if(this.mode==='siege')save.siege??=newSiege(crypto.getRandomValues(new Uint32Array(1))[0]);
    return new CampaignSim(this.mode,this.mode==='siege'?0:this.level,this.progress()?.layouts[this.mode==='siege'?0:this.level]||[],d.owned,d.levels,this.mode==='siege'?save.siege!.raid.castle:undefined,save);
  }
  show(){this.last=0;if(this.sim.phase==='build')this.sim=this.make();this.render();}
  pause(){this.last=0;this.pointers?.end();}
  reset(){this.spell=undefined;this.inspection=undefined;this.selectedPad=undefined;this.notice='';this.paused=false;this.rewarded=false;this.last=0;this.sim=this.make();this.render();}
  private saveLayout(){if(this.mode==='siege'){this.host.store();return;}const s=this.host.save();s.campaigns??=emptyCampaigns();s.campaigns[this.mode].layouts[this.level]=this.sim.layout.map(p=>({...p}));this.host.store();}
  private render(){
    const profile=this.host.save().profile;
    const siege=this.mode==='siege'?this.host.save().siege:undefined;
    const raid=siege?.raid;
    const finished=raid?.state==='won'||raid?.state==='lost';
    const unlocked=Math.min(LEVELS-1,this.progress()?.cleared||0);
    this.root.classList.add('native-campaign');
    this.pointers?.end();
    this.root.innerHTML=`<div class="campaign-head defend-head"><h1>${t(`nav.${this.mode}`)}</h1>${siege&&profile?`<div class="siege-profile">${flagSvg(profile.flag)}<div><small>YOUR PROFILE</small><strong class="siege-profile-name">${escapeText(profile.name)}</strong></div><button type="button" data-action="profile">Edit profile</button></div>`:""}<details class="campaign-intro"><summary>How to play</summary><p>${this.mode==='ambush'?'Hold the road. Enemies follow the marked path; place towers and infantry buildings on the numbered spaces. Survive all three waves with lives remaining.':`Raid a generated bot castle near your MMR. Infantry fight its guards, towers and fortifications; destroy the keep to win. All your infantry buildings deploy below and release their units when you start. Your buildings train and replenish their own garrisons, as in Defend. You have four minutes. Starting commits the raid: a defeat, forfeit or reload during battle counts as a loss.`}</p></details>
      ${siege&&raid?`<details class="siege-opponent"><summary><strong>${raid.castle.owner.name}</strong> <small class="siege-bot">BOT</small> · ${raid.defender} defense / ${siege.mmr} MMR</summary><p>Your attack MMR: <b>${siege.mmr}</b> · ${siege.wins}/${siege.games} wins${siege.games<10?' · Placement matches':''}</p><p>Castle defense rating: <b>${raid.defender}</b> (estimated)</p><small>Defense ratings are provisional until calibrated against raid results.</small>${finished?`<p>Last rated result: ${raid.state==='won'?'Victory':'Defeat'} · MMR ${raid.delta!>=0?'+':''}${raid.delta??0}. This target is now available for unrated practice.</p>`:''}</details>`:
      `<label>Level <select class="campaign-level" aria-label="Level">${Array.from({length:LEVELS},(_,i)=>`<option value="${i}" ${i===this.level?'selected':''} ${i>unlocked?'disabled':''}>${i+1}. ${levelPlan(this.mode,i).name}${i>unlocked?' — locked':''}</option>`).join('')}</select></label>`}
      <div class="campaign-actions"><button data-action="start">${this.sim.phase==='build'?(siege?(finished?'Start practice':'Start ranked raid'):'Start waves'):this.paused?'Resume':'Pause'}</button><button data-action="retry">${siege?(raid?.state==='started'?'Forfeit / rebuild':finished?'Practice again':'Rebuild'):'Rebuild / retry'}</button><button data-action="next" ${(siege?!finished:this.sim.phase!=='won'||this.level===LEVELS-1)?'hidden':''}>${siege?'Find next opponent':'Next level'}</button></div>
      ${this.mode==='ambush'?'<p class="ambush-wallet" aria-live="polite">Ambush gold: <b id="ambush-gold"></b></p>':''}
      <div class="campaign-spells"></div><div class="campaign-inspect-actions"><button data-action="sell" hidden>Sell selected</button><button data-action="upgrade" hidden>Open building upgrades</button></div>
      <p class="campaign-status" role="status" aria-live="polite"></p></div>
      <div class="campaign-stage defend-stage side-open"><aside class="defend-side"><div class="campaign-roster defend-palette"></div></aside><div class="campaign-board defend-board"><canvas aria-label="${this.mode==='ambush'?'Enemy path and placement spaces':'Enemy castles and infantry muster spaces'}"></canvas></div></div>
      <details class="campaign-help"><summary>Buildings and upgrades</summary><h2>${this.mode==='ambush'?'Roadside buildings':'Infantry buildings'}</h2><p>${this.mode==='ambush'?'Choose a building, then a numbered space. Tap a building to inspect its range, open its upgrades, or sell it. Unlocked buildings can be bought repeatedly with Ambush gold, including during waves. Selling refunds the full price before waves, or 70% (rounded down to 10) during battle. Costs reflect potential DPS and upgrades. Kill enemies for gold; escaped enemies pay nothing. This gold is only for this level and resets on retry.':'Every infantry building you own is deployed automatically at the bottom, including copies placed in your Defend city. Start the raid to release their troops toward the castle above. Buy more buildings in Tiles.'} ${this.mode==='ambush'?'Layouts and completed levels are saved. Battles restart on reload.':'Your rated results are saved; each new raid uses your current infantry buildings. Reloading a rated battle counts as a loss; the target remains available for practice.'} Towers, troops, projectiles, and worn upgrades use Defend’s combat engine. Scroll or pinch to zoom; drag the battlefield to pan.</p>${this.mode==='ambush'?'<div class="campaign-spaces" aria-label="Placement spaces"></div>':''}</details>`;
    this.canvas=this.root.querySelector('.campaign-board canvas')!;
    const camera=this.renderer?{...this.renderer.cam}:undefined;this.renderer=new DefendRenderer(this.canvas);
    const box=this.canvas.getBoundingClientRect();this.renderer.resize(box.width,box.height);this.renderer.resetCam();if(camera)Object.assign(this.renderer.cam,camera);
    this.pointers??=new BoardPointers({renderer:()=>this.renderer,pickUp:()=>false,drop:()=>{},tap:e=>this.tapBoard(e)});
    this.canvas.onpointerdown=e=>this.pointers!.down(e);
    this.canvas.oncontextmenu=e=>e.preventDefault();
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.renderer!.zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.0015));},{passive:false});this.font=getComputedStyle(this.canvas).fontFamily;this.status=this.root.querySelector('.campaign-status')!;this.roster=this.root.querySelector('.campaign-roster')!;
    const profileButton=this.root.querySelector<HTMLButtonElement>('[data-action="profile"]');
    if(profileButton)profileButton.onclick=()=>{if(this.sim.phase==='battle'){this.paused=true;this.render();}this.host.editProfile?.();};
    const levelSelect=this.root.querySelector<HTMLSelectElement>('.campaign-level');
    if(levelSelect)levelSelect.onchange=e=>{this.level=Number((e.target as HTMLSelectElement).value);this.reset();};
    this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!.onclick=()=>{
      if(this.sim.phase==='build'){if(!this.sim.start()){this.status.textContent=this.notice=this.mode==='siege'?'Buy an infantry building in Tiles before starting a raid.':'Place at least one fighting building first.';return;}this.saveLayout();if(raid?.state==='offered'){raid.state='started';this.host.store();}}
      else if(this.sim.phase==='battle')this.paused=!this.paused;
      this.render();
    };
    this.root.querySelector<HTMLButtonElement>('[data-action="retry"]')!.onclick=()=>{if(siege&&settleRaid(siege,false))this.host.store();this.reset();};
    this.root.querySelector<HTMLButtonElement>('[data-action="next"]')!.onclick=()=>{if(siege){if(!nextOpponent(siege))return;this.host.store();}else this.level++;this.reset();};

    const sell=this.root.querySelector<HTMLButtonElement>('[data-action="sell"]')!;sell.onclick=()=>{if(this.selectedPad===undefined)return;this.sim.remove(this.selectedPad);this.selectedPad=undefined;this.inspection=undefined;this.saveLayout();this.palette();this.refresh();};
    this.root.querySelector<HTMLButtonElement>('[data-action="upgrade"]')!.onclick=()=>{
      const p=this.sim.layout.find(p=>p.pad===this.selectedPad);if(!p)return;
      const source=this.host.save().defend.layout.structures.find(b=>b.kind===p.kind&&b.path===p.path&&b.rank===p.rank);
      const target:TileTree=source?{uid:source.uid}:{copy:p.kind as never,...(p.path&&p.rank?{wear:{path:p.path,rank:p.rank}}:{})};
      if(this.host.openTree?.(target))this.paused=true;
      else{this.notice='Finish your current Defend battle before editing building upgrades.';this.status.textContent=this.notice;}
    };
    const skills=[['meteor','Meteor',!!this.sim.engine.bonuses.meteor],['frost','Frost nova',!!this.sim.engine.bonuses.frostNova],['reinforce','Reinforcements',!!this.sim.engine.bonuses.reinforcements],['necro','Necromancy',!!this.sim.engine.bonuses.necromancy]] as const;
    this.root.querySelector('.campaign-spells')!.innerHTML=skills.filter(s=>s[2]).map(([id,name])=>`<button data-spell="${id}">${name}</button>`).join('');
    this.root.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach(b=>b.onclick=()=>{this.spell=b.dataset.spell;this.notice='Choose a point on the battlefield.';});
    this.palette();this.refresh();this.draw();
  }
  private palette(){
    const owned=this.host.save().defend.owned;
    const available=this.mode==='siege'?Array.from(new Set(this.sim.layout.map(p=>p.kind))):(Object.keys(STRUCTURES) as StructureKind[]).filter(k=>deployable(k,this.mode)&&(owned[k as PaletteItem]||0)>0);
    if(this.mode==='siege'){
      this.roster.innerHTML=available.map(kind=>`<div class="siege-building" data-kind="${kind}"><canvas width="48" height="48" data-icon="${kind}"></canvas><span>${STRUCTURES[kind].name}</span><small>${this.sim.layout.filter(p=>p.kind===kind).length} deployed</small></div>`).join('')||'<p>No infantry buildings owned. Buy a Melee Guild or Ranged Guild in Tiles.</p>';
      this.roster.querySelectorAll<HTMLCanvasElement>('canvas').forEach(canvas=>paintIcon(canvas,canvas.dataset.icon as PaletteItem));
      return;
    }
    if(!available.includes(this.selected!))this.selected=available[0]||null;
    this.roster.innerHTML=available.flatMap(k=>this.sim.variants(k).map((wear,variant)=>{const price=this.sim.price(k,wear);return `<button data-kind="${k}" data-variant="${variant}" data-price="${price.cost}" title="Estimated potential DPS: ${price.dps.toFixed(1)}" aria-pressed="${this.selected===k&&this.selectedVariant===variant}"><canvas width="48" height="48" data-icon="${k}"${pathLook(k,wear.path)}></canvas><span>${STRUCTURES[k].name}</span>${wear.path&&wear.rank?pathBadge({path:wear.path,rank:wear.rank}):''}<small>${price.cost} gold</small></button>`;})).join('')||'<p>Unlock a tower or infantry building in Tiles to use it here.</p>';
    this.roster.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b=>{paintIcon(b.querySelector('canvas')!,b.dataset.kind as PaletteItem);b.onclick=()=>{this.selected=b.dataset.kind as StructureKind;this.selectedVariant=Number(b.dataset.variant);this.palette();};b.onpointerdown=e=>this.dragPalette(e,b);});paintPathIcons(this.roster);
    this.root.querySelector('.campaign-spaces')!.innerHTML=this.sim.plan.pads.map((_,i)=>{const placed=this.sim.layout.find(p=>p.pad===i);return `<button data-pad="${i}" ${!['build','battle'].includes(this.sim.phase)?'disabled':''} aria-label="Space ${i+1}: ${placed?STRUCTURES[placed.kind].name:'empty'}">${i+1}: ${placed?`${STRUCTURES[placed.kind].name}`:'Empty'}</button>`;}).join('');
    this.root.querySelectorAll<HTMLButtonElement>('[data-pad]').forEach(b=>b.onclick=()=>this.place(Number(b.dataset.pad)));
  }
  private place(pad:number){
    if(this.mode!=='ambush'||!['build','battle'].includes(this.sim.phase))return;
    if(this.sim.layout.some(p=>p.pad===pad)){this.selectedPad=pad;this.inspection=this.sim.map.buildings.find(b=>b.structureUid===pad+1)?.id;this.refresh();this.draw();return;}
    else if(!this.selected||!this.sim.place(pad,this.selected,this.sim.variants(this.selected)[this.selectedVariant])){this.status.textContent=this.notice=this.selected?`Need ${this.sim.price(this.selected).cost} gold to build this. Choose an unlocked building you can afford.`:'Choose an unlocked building first.';return;}
    this.notice='';this.saveLayout();this.palette();this.refresh();this.draw();
  }
  frame(time:number){this.now=time;const dt=this.last?Math.min(.1,(time-this.last)/1000):0;this.last=time;if(!this.paused)this.sim.step(dt);
    if((this.sim.phase==='won'||this.sim.phase==='lost')&&!this.rewarded){
      this.rewarded=true;const s=this.host.save();
      if(this.mode==='siege'){if(settleRaid(s.siege!,this.sim.phase==='won'))this.host.store();}
      else if(this.sim.phase==='won'){s.campaigns??=emptyCampaigns();s.campaigns.ambush.cleared=Math.max(s.campaigns.ambush.cleared,this.level+1);this.host.store();}
      this.render();
    }
    this.refresh();this.draw();
  }
  private refresh(){
    const s=this.sim;const summary=this.mode==='ambush'?`Wave ${s.wave}/3 · ${s.lives} lives · ${s.enemies.length} enemies · ${s.kills} kills`:`Keep ${Math.ceil(s.raid!.defense.keepHp())}/${Math.ceil(s.raid!.defense.keepMaxHp())} · ${s.allies.length} troops · ${Math.max(0,240-Math.floor(s.elapsed))}s`;
    this.status.textContent=s.phase==='build'?(this.notice||(this.mode==='siege'?`${s.layout.length} infantry buildings deployed. Start the raid to release their troops.`:'Place your buildings, then start.')):s.phase==='won'?(this.mode==='siege'?'Victory! The keep has fallen.':(this.level<LEVELS-1?'Victory! Next level unlocked.':'Victory! Campaign complete.')):s.phase==='lost'?'Defeat. Rebuild your formation and try again.':(this.paused?'Paused · ':'')+summary;
    if(this.mode==='ambush'){
      const gold=this.root.querySelector('#ambush-gold')!;if(gold.textContent!==String(s.gold))gold.textContent=String(s.gold);
      const ended=s.phase==='won'||s.phase==='lost';
      this.roster.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button=>{button.disabled=ended||Number(button.dataset.price)>s.gold;});
      this.root.querySelectorAll<HTMLButtonElement>('[data-pad]').forEach(button=>{
        const pad=Number(button.dataset.pad),placed=s.layout.find(p=>p.pad===pad);button.disabled=ended;
        const text=`${pad+1}: ${placed?`${STRUCTURES[placed.kind].name}`:'Empty'}`;if(button.textContent!==text)button.textContent=text;
      });
    }
    const selected=s.layout.find(p=>p.pad===this.selectedPad);
    const sell=this.root.querySelector<HTMLButtonElement>('[data-action="sell"]')!,upgrade=this.root.querySelector<HTMLButtonElement>('[data-action="upgrade"]')!;
    sell.hidden=this.mode!=='ambush'||!selected;upgrade.hidden=this.mode!=='ambush'||!selected||!this.host.openTree;
    if(selected){sell.textContent=`Sell ${STRUCTURES[selected.kind].name} (${s.refund(selected.pad)} gold)`;sell.disabled=!['build','battle'].includes(s.phase);}
    const remaining:Record<string,number>={meteor:s.engine.meteorRemaining,frost:s.engine.frostRemaining,necro:s.engine.necroRemaining,reinforce:s.engine.reinforceRemaining};
    this.root.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach(b=>{b.disabled=s.phase!=='battle'||remaining[b.dataset.spell!]>0;b.setAttribute('aria-pressed',String(this.spell===b.dataset.spell));});
    const start=this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!;start.disabled=s.phase==='won'||s.phase==='lost';
  }
  private dragPalette(event:PointerEvent,button:HTMLButtonElement){
    if(button.disabled||event.button!==0)return;
    const kind=button.dataset.kind as StructureKind,variant=Number(button.dataset.variant),x=event.clientX,y=event.clientY;
    let moved=false;const ghost=document.createElement('canvas');ghost.width=48;ghost.height=48;ghost.style.cssText='position:fixed;width:48px;height:48px;pointer-events:none;z-index:10000;image-rendering:pixelated;';
    ghost.getContext('2d')!.drawImage(button.querySelector('canvas')!,0,0);
    const move=(e:PointerEvent)=>{if(e.pointerId!==event.pointerId)return;if(Math.hypot(e.clientX-x,e.clientY-y)>8&&!moved){moved=true;document.body.append(ghost);}ghost.style.left=`${e.clientX-24}px`;ghost.style.top=`${e.clientY-48}px`;};
    const end=(e:PointerEvent)=>{if(e.pointerId!==event.pointerId)return;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',cancel);ghost.remove();
      if(moved&&this.renderer){this.selected=kind;this.selectedVariant=variant;const p=this.renderer.toCell(e.clientX,e.clientY),pad=this.sim.plan.pads.findIndex(at=>Math.hypot(at.x-p.fx,at.y-p.fy)<6);if(pad>=0)this.place(pad);}
    };
    const cancel=(e:PointerEvent)=>{moved=false;end(e);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',cancel);
  }
  private tapBoard(e:PointerEvent){
    if(!this.renderer)return;const p=this.renderer.toCell(e.clientX,e.clientY);
    if(this.spell&&this.sim.phase==='battle'){const at={x:p.fx,y:p.fy},s=this.sim.engine;const cast=this.spell==='meteor'?s.castMeteor(at):this.spell==='frost'?s.castFrostNova(at):this.spell==='reinforce'?s.castReinforcements(at):s.castNecromancy(at);if(cast)this.spell=undefined;return;}
    if(this.mode==='siege'){
      this.inspection=this.sim.map.buildings.find(b=>!b.hidden&&p.fx>=b.rect.x&&p.fx<b.rect.x+b.rect.w&&p.fy>=b.rect.y&&p.fy<b.rect.y+b.rect.h)?.id;
      return;
    }
    const pad=this.sim.plan.pads.findIndex(at=>Math.hypot(at.x-p.fx,at.y-p.fy)<6);
    if(pad>=0)this.place(pad);
  }
  private draw(){
    if(!this.renderer)return;
    const rect=this.canvas.getBoundingClientRect();this.renderer.resize(rect.width,rect.height);
    const save=this.host.save(),settings=save.settings;
    const sim=this.sim.renderSim;
    const looks:Record<number,string>={};
    for(const b of this.sim.map.buildings){const paths=b.structureUid!==undefined?sim.bonuses.structurePaths?.[b.structureUid]:undefined;if(paths){const look=artLook(b.kind,Object.values(paths)[0]?.path);if(look)looks[b.structureUid!]=look;}}
    this.renderer.draw(this.sim.map,sim,null,{area:'moss',grid:0,weather:null,night:0,now:this.now,reduceMotion:settings.reduceMotion||matchMedia('(prefers-reduced-motion: reduce)').matches,effects:!settings.effectsOff,healthbars:settings.showHealthbars,simpleEnemies:settings.simpleEnemies,simpleTroops:settings.simpleTroops,mergedOutlines:settings.mergedOutlines,looks,...(this.inspection!==undefined?{inspect:{id:this.inspection,armed:sim}}:{})});
    if(this.mode==='ambush'&&['build','battle'].includes(this.sim.phase)){
      const c=this.canvas.getContext('2d')!,r=this.renderer;c.save();c.setTransform(r.cam.s,0,0,r.cam.s,r.cam.x,r.cam.y);c.strokeStyle='#d6ae68';c.lineWidth=1/r.cam.s;
      c.fillStyle='#e7c97f';c.font=`${Math.max(r.px,10/r.cam.s)}px ${this.font}`;c.textAlign='center';c.textBaseline='middle';
      this.sim.plan.pads.forEach((p,i)=>{if(this.sim.layout.some(b=>b.pad===i))return;c.strokeRect((p.x-3)*r.px,(p.y-3)*r.px,6*r.px,6*r.px);c.fillText(String(i+1),p.x*r.px,p.y*r.px);});c.restore();
    }
  }
}
