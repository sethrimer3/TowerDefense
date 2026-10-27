import type { CastleSnapshot, DefenseKind } from "./castles.ts";
/** Small deterministic campaigns. No writes to Defend's layout or combat RNG. */
import * as C from '../defend/catalog.ts';
import { TRAINS } from '../defend/deployment.ts';
import type { DefendSave } from '../defend/progress.ts';
export type Mode = 'ambush' | 'siege';
export type Point = { x: number; y: number };
export type Placement = { pad: number; kind: C.StructureKind };
export type CampaignProgress = { cleared: number; layouts: Placement[][] };
export type CampaignSave = Record<Mode, CampaignProgress>;
export const emptyCampaigns = (): CampaignSave => ({ ambush: { cleared: 0, layouts: [] }, siege: { cleared: 0, layouts: [] } });
export const LEVELS = 3;
const kinds = Object.keys(C.STRUCTURES) as C.StructureKind[];
export const infantry = (kind: C.StructureKind) => !!TRAINS[kind];
export const deployable = (kind: C.StructureKind, mode: Mode) => kind !== 'keep' && (infantry(kind) || mode === 'ambush' && C.ITEM_CATEGORY[kind as C.PaletteItem] === 'towers');
export function decodeCampaigns(raw: unknown): CampaignSave {
  const out = emptyCampaigns();
  if (!raw || typeof raw !== 'object') return out;
  for (const mode of ['ambush', 'siege'] as const) {
    const value = (raw as Record<string, any>)[mode];
    if (!value || typeof value !== 'object') continue;
    out[mode].cleared = Number.isInteger(value.cleared) ? Math.max(0, Math.min(LEVELS, value.cleared)) : 0;
    out[mode].layouts = Array.from({ length: LEVELS }, (_, level) => {
      const pads = new Set<number>();
      const input = Array.isArray(value.layouts?.[level]) ? value.layouts[level] : [];
      return input.slice(0, 100).filter((p: any) => {
        if (!p || !Number.isInteger(p.pad) || p.pad < 0 || p.pad >= levelPlan(mode, level).pads.length || pads.has(p.pad) || !kinds.includes(p.kind) || !deployable(p.kind, mode)) return false;
        pads.add(p.pad); return true;
      }).map((p: Placement) => ({ pad: p.pad, kind: p.kind }));
    });
  }
  return out;
}
export function levelPlan(mode: Mode, level: number) {
  const path: Point[] = level === 0 ? [{x:0,y:5},{x:16,y:5},{x:16,y:12},{x:4,y:12},{x:4,y:20},{x:20,y:20}]
    : level === 1 ? [{x:0,y:4},{x:7,y:4},{x:7,y:10},{x:16,y:10},{x:16,y:18},{x:3,y:18},{x:3,y:24}]
    : [{x:0,y:4},{x:16,y:4},{x:16,y:9},{x:4,y:9},{x:4,y:15},{x:16,y:15},{x:16,y:21},{x:0,y:21}];
  const pads: Point[] = mode === 'siege' ? [3,7,11,15].flatMap(x => [{x,y:20},{x,y:23}])
    : [{x:4,y:7},{x:9,y:7},{x:13,y:7},{x:18,y:9},{x:13,y:14},{x:8,y:14},{x:2,y:16},{x:7,y:18},{x:12,y:22},{x:17,y:22}].filter(p => distanceToPath(p,path) >= 1.4);
  return { name: (mode === 'ambush' ? ['Old Road','River Bend','Serpentine Pass'] : ['Border Keep','Twin Bastions','Crown Citadel'])[level], path, pads };
}
const distance = (a: Point,b: Point) => Math.hypot(a.x-b.x,a.y-b.y);
function distanceToPath(p: Point,path: Point[]) {
  return Math.min(...path.slice(1).map((b,i) => {const a=path[i], dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return distance(p,{x:a.x+t*dx,y:a.y+t*dy});}));
}
export function validLayout(mode: Mode, level: number, layout: Placement[], owned: DefendSave['owned']) {
  const used = new Map<string,number>(), pads = new Set<number>();
  return layout.filter(p => {
    const n = used.get(p.kind) || 0;
    if (!deployable(p.kind,mode) || !levelPlan(mode,level).pads[p.pad] || pads.has(p.pad) || n >= (owned[p.kind as C.PaletteItem] || 0)) return false;
    pads.add(p.pad); used.set(p.kind,n+1); return true;
  }).map(p=>({...p}));
}
/** Inventory is the source of truth: include placed and palette copies alike. */
export function siegeArmy(owned:DefendSave['owned']) {
  const layout:Placement[]=[];
  for(const kind of kinds)if(infantry(kind)){
    const count=owned[kind as C.PaletteItem];
    if(!Number.isSafeInteger(count)||count<=0)continue;
    for(let copy=0;copy<count;copy++)layout.push({pad:layout.length,kind});
  }
  const count=layout.length;
  if(count<=8){
    const columns=Math.min(4,count),rows=Math.ceil(count/4);
    const pads=layout.map((_,i)=>({x:(i%columns+.5)*20/columns,y:rows===1?21.5:20+Math.floor(i/columns)*3}));
    return {layout,pads,iconSize:42};
  }
  // Fit every copy into the bottom muster ground rather than dropping extras.
  const columns=Math.ceil(Math.sqrt(count*3)),rows=Math.ceil(count/columns);
  const cellWidth=18/columns,cellHeight=5/rows;
  const pads=layout.map((_,i)=>({x:1+cellWidth*(Math.floor(i/rows)+.5),y:18.5+cellHeight*(i%rows+.5)}));
  return {layout,pads,iconSize:Math.min(42,cellWidth*24,cellHeight*24)};
}
type Profile = {hp:number;damage:number;cooldown:number;speed:number;range?:number;reach?:number;color:string};
const PROFILES: Record<string,Profile> = { brawler:C.BRAWLER,slinger:C.SLINGER,sword:C.SOLDIER,archer:C.ARCHER_UNIT,assassin:C.ASSASSIN_UNIT,spearman:C.SPEARMAN,hoplite:C.HOPLITE,lancer:C.LANCER,javelineer:C.JAVELINEER,sniper:C.SNIPER,musketeer:C.MUSKETEER,gunner:C.GUNNER,machineGunner:C.MACHINE_GUNNER,gatlingGunner:C.GATLING_GUNNER,rocketeer:C.ROCKETEER,railSniper:C.RAIL_SNIPER,hero:C.HERO,shade:C.SHADE,
  mage:{hp:24,damage:12,cooldown:2,speed:2,range:5,color:'#be7460'},valkyrie:C.VALKYRIE,darkWizard:{hp:100,damage:30,cooldown:2,speed:2,range:6,color:'#956abd'} };
export type Unit = Point & { id:number; hp:number; maxHp:number; damage:number; range:number; speed:number; cooldown:number; cd:number; color:string; home:number; progress:number };
export type Castle = Point & { hp:number; maxHp:number; cd:number; kind?:DefenseKind; damage?:number; cooldown?:number; range?:number };
export type Shot = { from:Point; to:Point; life:number; friendly:boolean };
export class CampaignSim {
  phase: 'build'|'battle'|'won'|'lost' = 'build';
  readonly plan;
  readonly layout: Placement[];
  readonly musterIconSize:number;
  allies: Unit[] = []; enemies: Unit[] = []; castles: Castle[] = []; shots: Shot[] = [];
  lives = 5; reserves = 36; elapsed = 0; wave = 0; spawned = 0;
  private spawnClock=0; private recruit:number[]=[]; private towerCd:number[]=[]; private nextId=0;
  private pending = 0;
  constructor(readonly mode: Mode, readonly level: number, layout: Placement[], private owned: DefendSave['owned'], private levels: DefendSave['levels'], readonly opponent?:CastleSnapshot) {
    if(opponent)this.levels={...levels};
    const army=mode==='siege'?siegeArmy(owned):undefined;
    this.plan={...levelPlan(mode,level),...(army?{pads:army.pads}:{})};
    this.layout=army?army.layout:validLayout(mode,level,layout,owned);
    this.musterIconSize=army?.iconSize??42;
    if(army)this.reserves=Math.max(36,army.layout.length*C.soldierCap(this.levels.barracksCapacity));
    if(mode==='siege'&&opponent)this.castles=opponent.defenses.map(d=>({...d,maxHp:d.hp,cd:d.cooldown}));
    else if(mode==='siege') this.castles=Array.from({length:level+1},(_,i)=>({x:5+i*5,y:4+(i%2)*3,hp:100+level*45,maxHp:100+level*45,cd:2+i}));
  }
  place(pad:number,kind:C.StructureKind) {
    if(this.mode==='siege'||this.phase!=='build') return false;
    const layout=[...this.layout.filter(p=>p.pad!==pad),{pad,kind}];
    const valid=validLayout(this.mode,this.level,layout,this.owned);
    if(valid.length!==layout.length) return false;
    this.layout.splice(0,this.layout.length,...valid); return true;
  }
  remove(pad:number) {if(this.mode==='ambush'&&this.phase==='build') this.layout.splice(0,this.layout.length,...this.layout.filter(p=>p.pad!==pad));}
  start() {if(this.phase!=='build'||!this.layout.some(p=>infantry(p.kind)||p.kind!=='watchTower'))return false;this.phase='battle';this.nextWave();return true;}
  private nextWave() {this.wave++;this.pending=this.mode==='ambush'?5+this.level*2+this.wave*2:this.opponent?.guards.count??3+this.level;this.spawnClock=1;}
  private unit(p:Point,profile:Profile,home:number,scale=1):Unit {return {...p,id:this.nextId++,hp:profile.hp*scale,maxHp:profile.hp*scale,damage:profile.damage*scale,range:profile.range??profile.reach??3,speed:profile.speed,cooldown:profile.cooldown,cd:0,color:profile.color,home,progress:0};}
  step(dt:number) {
    if(this.phase!=='battle'||!Number.isFinite(dt)||dt<=0)return;
    // Fixed substeps prevent tab stalls or speed changes skipping path corners.
    let left=Math.min(dt,1);while(left>1e-8&&this.phase==='battle'){const h=Math.min(left,0.05);this.tick(h);left-=h;}
  }
  private tick(dt:number) {
    this.elapsed+=dt;this.shots=this.shots.filter(s=>(s.life-=dt)>0);
    const garrisons=new Map<number,number>();
    for(const ally of this.allies)if(ally.hp>0)garrisons.set(ally.home,(garrisons.get(ally.home)??0)+1);
    this.layout.forEach((p,i)=>{
      const pos=this.plan.pads[p.pad];
      if(infantry(p.kind)) {
        this.recruit[i]=(this.recruit[i]??0)-dt;
        if(this.recruit[i]<=0&&(garrisons.get(i)??0)<C.soldierCap(this.levels.barracksCapacity)&&(this.mode==='ambush'||this.reserves>0)) {
          const profile=PROFILES[TRAINS[p.kind]!]||C.SOLDIER;
          const recruit=this.unit(pos,profile,i,C.soldierScale(this.levels.soldierArms));
          if(profile.range!==undefined)recruit.range+=this.levels.archerSight;
          this.allies.push(recruit);
          this.recruit[i]=C.trainSeconds(this.levels.barracksTraining);if(this.mode==='siege')this.reserves--;
        }
      } else {
        this.towerCd[i]=(this.towerCd[i]??0)-dt;
        if(p.kind==='watchTower')return;
        const cannon=(C.CANNON_TOWERS as readonly string[]).includes(p.kind)||p.kind==='nanoTower';
        const wizard=C.isWizardTower(p.kind);
        const range=cannon?C.CANNON_RANGE*.55:wizard?C.flameRange(this.levels.wizardFlame):C.archerRange(this.levels.archerRange)*.55;
        const target=this.enemies.find(e=>e.hp>0&&distance(e,pos)<=range);
        if(target&&this.towerCd[i]<=0){
          const damage=cannon?C.cannonDamage(this.levels.cannonDamage):wizard?C.flameDps(this.levels.wizardFlame):C.archerDamage(this.levels.archerDamage);
          const splash=cannon?C.cannonSplash(this.levels.cannonDamage):wizard?1:0;
          for(const enemy of this.enemies)if(enemy.hp>0&&(enemy===target||splash>0&&distance(enemy,target)<=splash))this.hit(pos,enemy,damage,true);
          this.towerCd[i]=cannon?C.cannonCooldown(this.levels.cannonRate):wizard?1.6:C.archerCooldown(this.levels.archerRate);
        }
      }
    });
    this.spawnClock-=dt;
    if(this.pending>0&&this.spawnClock<=0){
      const keep=this.castles.find(c=>c.kind==='keep'&&c.hp>0);
      const p=this.mode==='ambush'?this.plan.path[0]:keep??{x:5+(this.spawned%3)*5,y:5};
      const profile=this.opponent ? {...this.opponent.guards,reach:.8,color:'#ca715a'} : {hp:9+this.level*5+this.wave*2,damage:2+this.level,cooldown:1.2,speed:1.15+this.level*.1,reach:.8,color:'#ca715a'};
      if(this.mode==='ambush'||!this.opponent||keep)this.enemies.push(this.unit(p,profile,-1));
      this.spawned++;this.pending--;this.spawnClock=.95;
    }
    for(const a of this.allies){
      if(a.hp<=0)continue;a.cd-=dt;
      const candidates=this.enemies.filter(e=>e.hp>0&&(this.mode==='siege'||distance(e,this.plan.pads[this.layout[a.home].pad])<5));
      const target=candidates.sort((b,c)=>distance(a,b)-distance(a,c))[0] || (this.mode==='siege'?this.castles.filter(c=>c.hp>0).sort((b,c)=>distance(a,b)-distance(a,c))[0]:undefined);
      if(target){if(distance(a,target)<=a.range+.3){if(a.cd<=0){this.hit(a,target,a.damage,true);a.cd=a.cooldown;}}else this.move(a,target,dt);}
      else if(this.mode==='ambush')this.move(a,this.plan.pads[this.layout[a.home].pad],dt);
    }
    for(const e of this.enemies){
      if(e.hp<=0)continue;e.cd-=dt;
      const target=this.allies.filter(a=>a.hp>0).sort((a,b)=>distance(e,a)-distance(e,b))[0];
      if(target&&distance(e,target)<1.1){if(e.cd<=0){this.hit(e,target,e.damage,false);e.cd=e.cooldown;}}
      else if(this.mode==='siege'){if(target)this.move(e,target,dt);}
      else {const p=this.plan.path[e.progress+1];if(!p){e.hp=0;this.lives=Math.max(0,this.lives-1);continue;}if(distance(e,p)<=e.speed*dt){e.x=p.x;e.y=p.y;e.progress++;}else this.move(e,p,dt);}
    }
    if(this.mode==='siege')for(const c of this.castles){if(c.hp<=0)continue;c.cd-=dt;const target=this.allies.find(a=>a.hp>0&&distance(a,c)<(c.range??7));if(target&&c.cd<=0){this.hit(c,target,c.damage??4+this.level,false);c.cd=c.cooldown??1.4;}}
    this.allies=this.allies.filter(a=>a.hp>0);this.enemies=this.enemies.filter(e=>e.hp>0);
    if(this.mode==='ambush'){
      if(this.lives<=0)this.phase='lost';
      else if(!this.pending&&!this.enemies.length){if(this.wave===3)this.phase='won';else this.nextWave();}
    }else if(this.castles.filter(c=>!c.kind||c.kind==='keep').every(c=>c.hp<=0))this.phase='won';
    else if(!this.reserves&&!this.allies.length||this.elapsed>=240)this.phase='lost';
  }
  private move(a:Unit,b:Point,dt:number){const d=distance(a,b);if(d<.0001)return;const k=Math.min(1,a.speed*dt/d);a.x+=(b.x-a.x)*k;a.y+=(b.y-a.y)*k;}
  private hit(from:Point,to:Point&{hp:number},damage:number,friendly:boolean){
    const marked=friendly&&this.mode==='ambush'&&this.layout.some(p=>p.kind==='watchTower'&&distance(this.plan.pads[p.pad],to)<5);
    to.hp-=damage*(marked?2:1);this.shots.push({from:{x:from.x,y:from.y},to:{x:to.x,y:to.y},life:.16,friendly});
  }
}
