import { flagSvg, escapeText } from "../profile/model.ts";
import { newSiege, nextOpponent, settleRaid } from "./siege-progress.ts";
import { CampaignSim, LEVELS, emptyCampaigns, deployable, levelPlan, type Mode } from './sim.ts';
import { STRUCTURES, type StructureKind, type PaletteItem } from '../defend/catalog.ts';
import { paintIcon, paintStructureArt } from '../defend/structure-art.ts';
import type { Save } from '../save.ts';
import { t } from '../i18n/index.ts';

type Host = { save:()=>Save; store:()=>void; editProfile?:()=>void };
/** Canvas and DOM share one simulation, advanced only by the app's frame loop. */
export class CampaignPage {
  sim: CampaignSim;
  private level=0; private selected:StructureKind|null=null; private paused=false; private last=0; private rewarded=false; private notice='';
  private font='serif';
  private canvas!:HTMLCanvasElement; private status!:HTMLElement; private roster!:HTMLElement;
  constructor(private root:HTMLElement,readonly mode:Mode,private host:Host) {if(mode==='siege'&&host.save().siege?.raid.state==='started')settleRaid(host.save().siege!,false);this.sim=this.make();}
  private progress(){return this.host.save().campaigns?.[this.mode];}
  private make(){
    const save=this.host.save(),d=save.defend;
    if(this.mode==='siege')save.siege??=newSiege(crypto.getRandomValues(new Uint32Array(1))[0]);
    return new CampaignSim(this.mode,this.mode==='siege'?0:this.level,this.progress()?.layouts[this.mode==='siege'?0:this.level]||[],d.owned,d.levels,this.mode==='siege'?save.siege!.raid.castle:undefined);
  }
  show(){this.last=0;if(this.sim.phase==='build')this.sim=this.make();this.render();}
  pause(){this.last=0;}
  reset(){this.notice='';this.paused=false;this.rewarded=false;this.last=0;this.sim=this.make();this.render();}
  private saveLayout(){if(this.mode==='siege'){this.host.store();return;}const s=this.host.save();s.campaigns??=emptyCampaigns();s.campaigns[this.mode].layouts[this.level]=this.sim.layout.map(p=>({...p}));this.host.store();}
  private render(){
    const profile=this.host.save().profile;
    const siege=this.mode==='siege'?this.host.save().siege:undefined;
    const raid=siege?.raid;
    const finished=raid?.state==='won'||raid?.state==='lost';
    const unlocked=Math.min(LEVELS-1,this.progress()?.cleared||0);
    this.root.innerHTML=`<div class="campaign-head panel"><h1>${t(`nav.${this.mode}`)}</h1>${siege&&profile?`<div class="siege-profile">${flagSvg(profile.flag)}<div><small>YOUR PROFILE</small><strong class="siege-profile-name">${escapeText(profile.name)}</strong></div><button type="button" data-action="profile">Edit profile</button></div>`:""}<p>${this.mode==='ambush'?'Hold the road. Enemies follow the marked path; place towers and infantry buildings on the numbered spaces. Survive all three waves with lives remaining.':`Raid a generated bot castle near your MMR. Infantry fight its guards, towers and fortifications; destroy the keep to win. All your infantry buildings deploy below and release their units when you start. You have ${this.sim.reserves} recruits and four minutes. Starting commits the raid: a defeat, forfeit or reload during battle counts as a loss.`}</p>
      ${siege&&raid?`<div class="siege-opponent"><strong>${raid.castle.owner.name}</strong> <small class="siege-bot">BOT</small><p>Your attack MMR: <b>${siege.mmr}</b> · ${siege.wins}/${siege.games} wins${siege.games<10?' · Placement matches':''}</p><p>Castle defense rating: <b>${raid.defender}</b> (estimated)</p><small>Defense ratings are provisional until calibrated against raid results.</small>${finished?`<p>Last rated result: ${raid.state==='won'?'Victory':'Defeat'} · MMR ${raid.delta!>=0?'+':''}${raid.delta??0}. This target is now available for unrated practice.</p>`:''}</div>`:
      `<label>Level <select class="campaign-level" aria-label="Level">${Array.from({length:LEVELS},(_,i)=>`<option value="${i}" ${i===this.level?'selected':''} ${i>unlocked?'disabled':''}>${i+1}. ${levelPlan(this.mode,i).name}${i>unlocked?' — locked':''}</option>`).join('')}</select></label>`}
      <div class="campaign-actions"><button data-action="start">${this.sim.phase==='build'?(siege?(finished?'Start practice':'Start ranked raid'):'Start waves'):this.paused?'Resume':'Pause'}</button><button data-action="retry">${siege?(raid?.state==='started'?'Forfeit / rebuild':finished?'Practice again':'Rebuild'):'Rebuild / retry'}</button><button data-action="next" ${(siege?!finished:this.sim.phase!=='won'||this.level===LEVELS-1)?'hidden':''}>${siege?'Find next opponent':'Next level'}</button></div>
      ${this.mode==='ambush'?'<p class="ambush-wallet" aria-live="polite">Ambush gold: <b id="ambush-gold"></b></p>':''}
      <p class="campaign-status" role="status" aria-live="polite"></p></div>
      <div class="campaign-board"><canvas width="600" height="720" aria-label="${this.mode==='ambush'?'Enemy path and placement spaces':'Enemy castles and infantry muster spaces'}"></canvas></div>
      <div class="panel"><h2>${this.mode==='ambush'?'Roadside buildings':'Infantry buildings'}</h2><p>${this.mode==='ambush'?'Choose a building, then a numbered space. Tap an occupied space to remove it. Unlocked buildings can be bought repeatedly with Ambush gold, including during waves. Tap a placed building to sell it: full refund before waves, 70% (rounded down to 10) during battle. Costs reflect potential DPS and Armory upgrades. Kill enemies for gold; escaped enemies pay nothing. This gold is only for this level and resets on retry.':'Every infantry building you own is deployed automatically at the bottom, including copies placed in your Defend city. Start the raid to release their troops toward the castle above. Buy more buildings in Tiles.'} ${this.mode==='ambush'?'Layouts and completed levels are saved. Battles restart on reload.':'Your rated results are saved; each new raid uses your current infantry buildings. Reloading a rated battle counts as a loss; the target remains available for practice.'} Buildings use base attacks and Armory combat upgrades; specialty abilities from Defend do not apply here yet.</p><div class="campaign-roster"></div>${this.mode==='ambush'?'<div class="campaign-spaces" aria-label="Placement spaces"></div>':''}</div>`;
    this.canvas=this.root.querySelector('canvas')!;this.font=getComputedStyle(this.canvas).fontFamily;this.status=this.root.querySelector('.campaign-status')!;this.roster=this.root.querySelector('.campaign-roster')!;
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
    this.canvas.onclick=e=>{if(this.mode==='siege')return;const r=this.canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*20,y=(e.clientY-r.top)/r.height*24;const pad=this.sim.plan.pads.findIndex(p=>Math.hypot(p.x-x,p.y-y)<1.2);if(pad>=0)this.place(pad);};
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
    this.roster.innerHTML=available.map(k=>{const price=this.sim.price(k);return `<button data-kind="${k}" data-price="${price.cost}" title="${price.support?'Support equivalent':'Potential'} DPS: ${price.dps.toFixed(1)}; range ${price.range.toFixed(1)}" aria-pressed="${this.selected===k}"><canvas width="48" height="48" data-icon="${k}"></canvas><span>${STRUCTURES[k].name}</span><small>${price.cost} gold</small><small>${price.support?'Support':`~${price.dps.toFixed(1)} DPS`}</small></button>`;}).join('')||'<p>Unlock a tower or infantry building in Tiles to use it here.</p>';
    this.roster.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(b=>{paintIcon(b.querySelector('canvas')!,b.dataset.kind as PaletteItem);b.onclick=()=>{this.selected=b.dataset.kind as StructureKind;this.palette();};});
    this.root.querySelector('.campaign-spaces')!.innerHTML=this.sim.plan.pads.map((_,i)=>{const placed=this.sim.layout.find(p=>p.pad===i);return `<button data-pad="${i}" ${!['build','battle'].includes(this.sim.phase)?'disabled':''} aria-label="Space ${i+1}: ${placed?STRUCTURES[placed.kind].name:'empty'}">${i+1}: ${placed?`${STRUCTURES[placed.kind].name} (sell ${this.sim.refund(i)} gold)`:'Empty'}</button>`;}).join('');
    this.root.querySelectorAll<HTMLButtonElement>('[data-pad]').forEach(b=>b.onclick=()=>this.place(Number(b.dataset.pad)));
  }
  private place(pad:number){
    if(this.mode!=='ambush'||!['build','battle'].includes(this.sim.phase))return;
    if(this.sim.layout.some(p=>p.pad===pad))this.sim.remove(pad);
    else if(!this.selected||!this.sim.place(pad,this.selected)){this.status.textContent=this.notice=this.selected?`Need ${this.sim.price(this.selected).cost} gold to build this. Choose an unlocked building you can afford.`:'Choose an unlocked building first.';return;}
    this.notice='';this.saveLayout();this.palette();this.refresh();this.draw();
  }
  frame(time:number){const dt=this.last?Math.min(.1,(time-this.last)/1000):0;this.last=time;if(!this.paused)this.sim.step(dt);
    if((this.sim.phase==='won'||this.sim.phase==='lost')&&!this.rewarded){
      this.rewarded=true;const s=this.host.save();
      if(this.mode==='siege'){if(settleRaid(s.siege!,this.sim.phase==='won'))this.host.store();}
      else if(this.sim.phase==='won'){s.campaigns??=emptyCampaigns();s.campaigns.ambush.cleared=Math.max(s.campaigns.ambush.cleared,this.level+1);this.host.store();}
      this.render();
    }
    this.refresh();this.draw();
  }
  private refresh(){
    const s=this.sim;const summary=this.mode==='ambush'?`Wave ${s.wave}/3 · ${s.lives} lives · ${s.enemies.length} enemies · ${s.kills} kills`:`${s.castles.filter(c=>c.hp>0).length} defenses · ${s.reserves} recruits left · ${Math.max(0,240-Math.floor(s.elapsed))}s`;
    this.status.textContent=s.phase==='build'?(this.notice||(this.mode==='siege'?`${s.layout.length} infantry buildings deployed. Start the raid to release their troops.`:'Place your buildings, then start.')):s.phase==='won'?(this.mode==='siege'?'Victory! The keep has fallen.':(this.level<LEVELS-1?'Victory! Next level unlocked.':'Victory! Campaign complete.')):s.phase==='lost'?'Defeat. Rebuild your formation and try again.':(this.paused?'Paused · ':'')+summary;
    if(this.mode==='ambush'){
      const gold=this.root.querySelector('#ambush-gold')!;if(gold.textContent!==String(s.gold))gold.textContent=String(s.gold);
      const ended=s.phase==='won'||s.phase==='lost';
      this.roster.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button=>{button.disabled=ended||Number(button.dataset.price)>s.gold;});
      this.root.querySelectorAll<HTMLButtonElement>('[data-pad]').forEach(button=>{
        const pad=Number(button.dataset.pad),placed=s.layout.find(p=>p.pad===pad);button.disabled=ended;
        const text=`${pad+1}: ${placed?`${STRUCTURES[placed.kind].name} (sell ${s.refund(pad)} gold)`:'Empty'}`;if(button.textContent!==text)button.textContent=text;
      });
    }
    const start=this.root.querySelector<HTMLButtonElement>('[data-action="start"]')!;start.disabled=s.phase==='won'||s.phase==='lost';
  }
  private draw(){
    const c=this.canvas.getContext('2d')!,s=this.sim,k=30;c.imageSmoothingEnabled=false;c.fillStyle=this.mode==='ambush'?'#344b30':'#494a36';c.fillRect(0,0,600,720);
    // Stable ground flecks don't advance any random stream.
    for(let i=0;i<180;i++){c.fillStyle=i%2?'#ffffff09':'#00000013';c.fillRect((i*137)%600,(i*79)%720,4,3);}
    if(this.mode==='ambush'){
      c.strokeStyle='#8b7654';c.lineWidth=38;c.lineJoin='round';c.beginPath();s.plan.path.forEach((p,i)=>i?c.lineTo(p.x*k,p.y*k):c.moveTo(p.x*k,p.y*k));c.stroke();
      c.strokeStyle='#e6ce9460';c.lineWidth=2;c.setLineDash([5,12]);c.stroke();c.setLineDash([]);
      c.fillStyle='#f1d89c';c.font=`14px ${this.font}`;const end=s.plan.path.at(-1)!;c.fillText('EXIT',Math.min(550,end.x*k+5),Math.min(700,end.y*k-18));
    }else{
      c.fillStyle='#776c54';c.fillRect(25,540,550,180);c.fillStyle='#ddd0a1';c.font=`16px ${this.font}`;c.fillText('MUSTER GROUND',200,555);
      for(const castle of s.castles){
        const x=castle.x*k,y=castle.y*k;
        // Enemy buildings face the raiding army; world positions stay in the upper field.
        c.save();c.translate(x,y);c.rotate(Math.PI);
        paintStructureArt(c,castle.kind==='tower'?'archerTower':castle.kind==='barricade'?'monsterBait':'keep',{x:-30,y:-30,w:60,h:60,px:7.5},castle.hp<=0?3:castle.hp<castle.maxHp*.4?2:0);
        c.restore();this.bar(c,x,y-45,castle.hp/castle.maxHp,70,'#d37760');
      }
    }
    s.plan.pads.forEach((p,i)=>{const x=p.x*k,y=p.y*k,placed=s.layout.find(a=>a.pad===i);if(this.mode==='ambush'){c.strokeStyle='#d6ae68';c.lineWidth=2;c.strokeRect(x-24,y-24,48,48);}
      if(placed){const def=STRUCTURES[placed.kind],px=s.musterIconSize/Math.max(def.w,def.h);paintStructureArt(c,placed.kind,{x:x-def.w*px/2,y:y-def.h*px/2,w:def.w*px,h:def.h*px,px});}
      if(this.mode==='ambush'){c.fillStyle='#f5dfaa';c.font=`bold 16px ${this.font}`;c.fillText(String(i+1),x-23,y-28);}
    });
    for(const u of [...s.enemies,...s.allies]){const x=u.x*k,y=u.y*k;c.fillStyle='#15140f';c.fillRect(x-7,y-8,14,17);c.fillStyle=u.color;c.fillRect(x-5,y-5,10,12);c.fillStyle='#e6c8a3';c.fillRect(x-3,y-8,6,5);this.bar(c,x,y-13,u.hp/u.maxHp,15,u.home<0?'#db7762':'#84b8d7');}
    for(const shot of s.shots){c.strokeStyle=shot.friendly?'#f3d693':'#dd7965';c.lineWidth=2;c.beginPath();c.moveTo(shot.from.x*k,shot.from.y*k);c.lineTo(shot.to.x*k,shot.to.y*k);c.stroke();}
  }
  private bar(c:CanvasRenderingContext2D,x:number,y:number,fraction:number,width:number,color:string){c.fillStyle='#1d211e';c.fillRect(x-width/2,y,width,3);c.fillStyle=color;c.fillRect(x-width/2,y,width*Math.max(0,Math.min(1,fraction)),3);}
}
