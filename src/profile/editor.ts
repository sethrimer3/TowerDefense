import { PALETTE, OPACITIES, PATTERNS, PATTERN_NAMES, MAX_LAYERS, defaultFlag, cleanName, drawFlag, type Flag, type Opacity, type Pattern, type PlayerProfile } from './model.ts';
/** Separate from the shared gameplay dialog, so first-entry setup cannot be replaced by idle rewards. */
export class ProfileEditor {
  private history:Flag[]=[];
  private dialog=document.createElement('dialog');
  private flag:Flag=defaultFlag();private chosenColor=3;private chosenOpacity:Opacity=100;private pattern:Pattern='cross';private picked=-1;
  constructor(){this.dialog.id='profile-editor';this.dialog.setAttribute('aria-labelledby','profile-editor-title');document.body.append(this.dialog);}
  open(profile:PlayerProfile|undefined,save:(profile:PlayerProfile)=>void,done:()=>void=()=>{}) {
    if(this.dialog.open)return;
    const required=!profile;this.history=[];this.flag=profile?structuredClone(profile.flag):defaultFlag();this.picked=-1;
    this.dialog.innerHTML=`<form class="profile-editor"><header><h2 id="profile-editor-title">${required?'Choose your name and banner':'Your name and banner'}</h2><p>Make your mark. Choose colors and stamp patterns over one another to build your flag.</p></header>
      <label class="profile-name-label">Player name<input name="playerName" autocomplete="nickname" required minlength="2" maxlength="48" aria-describedby="profile-name-help" /></label><small id="profile-name-help">2–24 characters: letters, numbers, spaces, periods, apostrophes, hyphens or underscores. Saved on this device.</small>
      <div class="flag-workbench"><div class="flag-preview"><canvas role="img" aria-label="Your pixel flag preview"></canvas><small>16 × 24 pixels</small></div><div class="flag-tools"><fieldset><legend>1. Choose a color</legend><div class="flag-colors">${PALETTE.map((c,i)=>`<button type="button" data-color="${i}" aria-label="${c.name}" title="${c.name}" style="--swatch:${c.hex}"></button>`).join('')}</div><button type="button" data-action="base">Use color as background</button></fieldset>
      <fieldset><legend>2. Pick a pattern</legend><div class="flag-patterns">${PATTERNS.map(pattern=>`<button type="button" data-pattern="${pattern}"><canvas width="16" height="24" aria-hidden="true"></canvas><span>${PATTERN_NAMES[pattern]}</span></button>`).join('')}</div></fieldset>
      <fieldset><legend>3. Stamp opacity</legend><div class="flag-opacity">${OPACITIES.map(opacity=>`<button type="button" data-opacity="${opacity}" aria-pressed="${opacity===this.chosenOpacity}">${opacity}%</button>`).join('')}</div></fieldset>
      <div class="flag-stamp"><button type="button" data-action="stamp">Stamp pattern</button><button type="button" data-action="undo">Undo last change</button></div>
      <section><h3>Pattern layers <small data-layer-count></small></h3><p>New stamps go on top. Select a layer to recolor, move or remove it.</p><ol class="flag-layers"></ol><div class="flag-layer-actions"><button type="button" data-action="recolor">Recolor selected</button><button type="button" data-action="opacity">Set selected opacity</button><button type="button" data-action="up">Move forward</button><button type="button" data-action="down">Move backward</button><button type="button" data-action="remove">Remove selected</button></div></section></div></div>
      <p class="profile-error" role="alert"></p><footer><button type="submit">${required?'Enter the game':'Save profile'}</button>${required?'':'<button type="button" data-action="cancel">Cancel</button>'}</footer></form>`;
    const input=this.dialog.querySelector<HTMLInputElement>('input')!;input.value=profile?.name||'';
    const error=this.dialog.querySelector<HTMLElement>('.profile-error')!;input.oninput=()=>{error.textContent='';};
    const action=(id:string,fn:()=>void)=>this.dialog.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!.onclick=fn;
    const refresh=()=>{
      drawFlag(this.dialog.querySelector<HTMLCanvasElement>('.flag-preview canvas')!,this.flag);
      this.dialog.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.color)===this.chosenColor)));
      this.dialog.querySelectorAll<HTMLButtonElement>('[data-pattern]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.pattern===this.pattern));drawFlag(b.querySelector('canvas')!,{base:[0,3,7,9,10,11,15].includes(this.chosenColor)?12:0,layers:[{pattern:b.dataset.pattern as Pattern,color:this.chosenColor,opacity:this.chosenOpacity}]});});
      this.dialog.querySelectorAll<HTMLButtonElement>('[data-opacity]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.opacity)===this.chosenOpacity)));
      this.dialog.querySelector('[data-layer-count]')!.textContent=`${this.flag.layers.length}/${MAX_LAYERS}`;
      this.dialog.querySelector('.flag-layers')!.innerHTML=this.flag.layers.map((layer,i)=>`<li><button type="button" data-layer="${i}" aria-pressed="${this.picked===i}"><i style="--swatch:${PALETTE[layer.color].hex}"></i>${i+1}. ${PATTERN_NAMES[layer.pattern]} — ${PALETTE[layer.color].name} · ${layer.opacity??100}%${i===this.flag.layers.length-1?' (top)':''}</button></li>`).join('')||'<li>No stamps yet. Pick a color and pattern, then stamp it.</li>';
      this.dialog.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach(b=>b.onclick=()=>{this.picked=Number(b.dataset.layer);this.chosenOpacity=this.flag.layers[this.picked].opacity??100;refresh();});
      for(const id of ['recolor','opacity','remove','up','down'])this.dialog.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!.disabled=this.picked<0||(id==='up'&&this.picked>=this.flag.layers.length-1)||(id==='down'&&this.picked===0);
      this.dialog.querySelector<HTMLButtonElement>('[data-action="stamp"]')!.disabled=this.flag.layers.length>=MAX_LAYERS;
      this.dialog.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled=!this.history.length;
    };
    const change=(fn:()=>void)=>{this.history.push(structuredClone(this.flag));if(this.history.length>64)this.history.shift();fn();refresh();};
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(b=>b.onclick=()=>{this.chosenColor=Number(b.dataset.color);refresh();});
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-pattern]').forEach(b=>b.onclick=()=>{this.pattern=b.dataset.pattern as Pattern;refresh();});
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-opacity]').forEach(b=>b.onclick=()=>{this.chosenOpacity=Number(b.dataset.opacity) as Opacity;refresh();});
    action('opacity',()=>{if(this.flag.layers[this.picked])change(()=>{this.flag.layers[this.picked].opacity=this.chosenOpacity;});});
    action('base',()=>change(()=>{this.flag.base=this.chosenColor;}));
    action('stamp',()=>{if(this.flag.layers.length>=MAX_LAYERS)return;change(()=>{this.flag.layers.push({pattern:this.pattern,color:this.chosenColor,opacity:this.chosenOpacity});this.picked=this.flag.layers.length-1;});});
    action('undo',()=>{const flag=this.history.pop();if(flag)this.flag=flag;this.picked=Math.min(this.picked,this.flag.layers.length-1);refresh();});
    action('recolor',()=>{if(this.flag.layers[this.picked])change(()=>{this.flag.layers[this.picked].color=this.chosenColor;});});
    const move=(offset:number)=>{const next=this.picked+offset;if(this.picked<0||next<0||next>=this.flag.layers.length)return;change(()=>{[this.flag.layers[this.picked],this.flag.layers[next]]=[this.flag.layers[next],this.flag.layers[this.picked]];this.picked=next;});};
    action('up',()=>move(1));action('down',()=>move(-1));
    action('remove',()=>{if(this.picked>=0)change(()=>{this.flag.layers.splice(this.picked,1);this.picked=Math.min(this.picked,this.flag.layers.length-1);});});
    if(!required)action('cancel',()=>{this.dialog.close();done();});
    this.dialog.oncancel=e=>{if(required)e.preventDefault();else done();};
    this.dialog.querySelector('form')!.onsubmit=e=>{e.preventDefault();const name=cleanName(input.value);if(!name){error.textContent='Enter a name of 2–24 characters using the characters listed above.';input.focus();return;}save({name,flag:structuredClone(this.flag)});this.dialog.close();done();};
    refresh();this.dialog.showModal();input.focus();
  }
}
