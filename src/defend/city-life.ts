/** Noncombat city residents. Their paths, threats and lights never enter
 * DefendSim, its spatial indexes, targeting, casualties, saves or RNG. */
import { CellType, type Building, type CityMap } from './citygen.ts';
import { CELL_COUNT, CELLS_W, CELLS_H, cellIndex, cellInBounds, sideCells, hash01 } from './grid.ts';
import { cellAt, cellCenter, findPath } from './pathing.ts';
import type { DefendSim } from './sim.ts';
import { boulderPlan } from './forest.ts';
import { PERSON_TORCH_STRENGTH, torchLevel } from './city-torches.ts';
export type Resident = {
  id: number; role: 'townsfolk' | 'watchman'; x: number; y: number; size: number;
  mode: 'indoors' | 'walk' | 'shelter' | 'escape' | 'gone'; hidden: boolean;
  path: number[]; wait: number; turn: number; target?: number; exit?: {x:number;y:number};
};
type Door = { building: Building; cell: number; x: number; y: number };
export const CITY_LIFE = { townsfolk: 16, watchmen: 6, speed: .8, run: 2.4, threat: 6, outside: 5 } as const;
export class CityLife {
  readonly people: Resident[] = [];
  readonly solid = new Uint8Array(CELL_COUNT);
  private inside = new Uint8Array(CELL_COUNT);
  private threats = new Uint8Array(CELL_COUNT);
  private map: CityMap | null = null;
  private sim: DefendSim | null = null;
  private version = '';
  private doors: Door[] = [];
  private interior: number[] = [];
  private exterior: number[] = [];
  private clock = 0;
  private sampled = -Infinity;
  private enemyPresent = false;
  private canExit = false;
  private routeBudget = 0;

  sync(map: CityMap, sim: DefendSim | null, forest: boolean) {
    const fresh = map !== this.map;
    const key = `${sim?.mapVersion ?? -1}:${forest}`;
    if (!fresh && sim === this.sim && key === this.version) return;
    this.map = map; this.sim = sim; this.version = key;
    this.solid.fill(0); this.interior = []; this.exterior = [];
    for (let i=0;i<CELL_COUNT;i++) this.solid[i] = map.type[i] === CellType.WATER || map.type[i] === CellType.HOUSE || map.type[i] === CellType.STRUCT || map.type[i] === CellType.WALL ? 1 : 0;
    if (sim) this.solid.set(sim.ownSolid);
    for (const b of map.buildings) if (b.kind === 'gate') for (const i of b.cells) this.solid[i] = 0;
    if (forest) for (const b of boulderPlan(map)) for (const i of b.cells) this.solid[i] = 1;
    this.canExit = map.buildings.some(b => b.kind === 'gate' && !b.woodGate && (!sim || sim.intact(b)));
    this.inside.set(this.solid);
    for (let i=0;i<CELL_COUNT;i++) {
      if (!map.city[i]) this.inside[i] = 1;
      if (!this.solid[i] && map.city[i]) this.interior.push(i);
    }
    this.doors = [];
    for (const b of map.buildings) {
      if (b.hidden || b.kind === 'wall' || b.kind === 'gate' || b.kind === 'wallBallista' || (sim && !sim.intact(b))) continue;
      const cells = sideCells(b.rect).filter(i => !this.inside[i]);
      cells.sort((a,b) => (map.type[b] === CellType.ROAD ? 1 : 0) - (map.type[a] === CellType.ROAD ? 1 : 0));
      if (cells.length) this.doors.push({building:b,cell:cells[0],...cellCenter(cells[0])});
    }
    if (this.canExit) {
      const nearWall = new Uint8Array(CELL_COUNT);
      for (const b of map.buildings) if (b.kind === 'wall' && !b.fence) {
        const x=b.rect.x,y=b.rect.y;
        for(let dy=-CITY_LIFE.outside;dy<=CITY_LIFE.outside;dy++) for(let dx=-CITY_LIFE.outside;dx<=CITY_LIFE.outside;dx++)
          if(cellInBounds(x+dx,y+dy)) nearWall[cellIndex(x+dx,y+dy)]=1;
      }
      for(let i=0;i<CELL_COUNT;i++) if(nearWall[i]&&!map.city[i]&&!this.solid[i]&&map.type[i]===CellType.OUT) this.exterior.push(i);
    }
    if (fresh) {
      this.people.length = 0; this.clock = 0; this.sampled = -Infinity;
      if (!this.doors.length) return;
      const citizens = Math.min(CITY_LIFE.townsfolk, Math.max(2, Math.ceil(this.doors.length / 3)));
      const guards = Math.min(CITY_LIFE.watchmen, Math.max(2, Math.ceil(this.doors.length / 12)));
      for(let n=0;n<citizens+guards;n++) {
        const d=this.doors[n%this.doors.length];
        this.people.push({id:900000+n,role:n<citizens?'townsfolk':'watchman',x:d.x,y:d.y,size:.35,mode:'indoors',hidden:true,path:[],wait:n*.35,turn:0});
      }
    } else for(const p of this.people) { p.path=[]; p.wait=0; }
  }

  private danger(p: {x:number;y:number}) {
    const r=CITY_LIFE.threat;
    for(let y=Math.max(0,Math.floor(p.y-r));y<=Math.min(CELLS_H-1,Math.floor(p.y+r));y++)
      for(let x=Math.max(0,Math.floor(p.x-r));x<=Math.min(CELLS_W-1,Math.floor(p.x+r));x++)
        if(this.threats[cellIndex(x,y)] && (x+.5-p.x)**2+(y+.5-p.y)**2 <= r*r) return {x:x+.5,y:y+.5};
    return null;
  }

  update(dt: number, time: number, night: boolean, reduced: boolean, enemies: readonly {x:number;y:number;hp:number;raidProxy?:boolean;burrow?:number}[]) {
    if (!this.map) return;
    dt=Math.min(.15,Math.max(0,dt)); this.clock+=dt;
    if(this.clock-this.sampled>=.1 || this.sampled<0) {
      this.sampled=this.clock; this.threats.fill(0); this.enemyPresent=false;
      for(const e of enemies) if(e.hp>0&&!e.raidProxy&&!e.burrow) {
        this.enemyPresent=true;
        if(cellInBounds(e.x,e.y)) this.threats[cellAt(e.x,e.y)]=1;
      }
    }
    this.routeBudget=6;
    for(const p of this.people) {
      const outside=!this.map.city[cellAt(p.x,p.y)], danger=this.danger(p);
      if(!p.hidden && p.mode!=='escape' && p.mode!=='shelter' && (danger || (p.role==='townsfolk' && this.enemyPresent))) {
        p.path=[];
        if(reduced) {p.hidden=true;p.mode='indoors';p.wait=5;continue;}
        if (!(outside && danger ? this.escape(p,danger) : this.shelter(p))) continue;
      }
      if(reduced) continue;
      p.wait-=dt;
      if(p.mode==='gone') {
        if(!this.enemyPresent && p.wait<=0 && this.doors.length) {
          const d=this.doors[p.id%this.doors.length];p.x=d.x;p.y=d.y;p.mode='indoors';p.wait=2;
        }
        continue;
      }
      if(p.hidden) {
        if(p.wait>0 || (p.role==='townsfolk'&&this.enemyPresent) || this.danger(p)) continue;
        if(this.pick(p,night)) p.hidden=false;
        continue;
      }
      if(p.role==='watchman'&&!night&&outside&&p.mode==='walk' && !this.shelter(p)) continue;
      this.walk(p,dt);
      if(p.path.length) continue;
      if(p.mode==='escape'&&p.exit) {
        const dx=p.exit.x-p.x,dy=p.exit.y-p.y,d=Math.hypot(dx,dy),step=Math.min(d,CITY_LIFE.run*dt);
        if(d){p.x+=dx/d*step;p.y+=dy/d*step;}
        if(p.x<-.5||p.x>CELLS_W+.5||p.y<-.5||p.y>CELLS_H+.5){p.mode='gone';p.hidden=true;p.wait=20;}
      } else if(p.mode==='shelter' || (p.role==='townsfolk' && p.target!==undefined)) {
        const door=this.doors.find(d=>d.building.id===p.target);
        if(!door || Math.hypot(door.x-p.x,door.y-p.y)>.7) {this.shelter(p);continue;}
        p.hidden=true;p.mode='indoors';p.wait=2+hash01(p.id,p.turn++,2801)*7;
      } else if(p.wait<=0) this.pick(p,night);
    }
  }

  private route(p: Resident, target: {x:number;y:number}, mask: Uint8Array) {
    if(this.routeBudget--<=0) return false;
    const path=findPath(mask,p,target,{maxCost:CELL_COUNT,maxNodes:4000});
    if(!path) return false;
    p.path=path;return true;
  }
  private pick(p: Resident, night: boolean) {
    const seed=hash01(p.id,p.turn++,2802);
    if(p.role==='townsfolk') {
      for(let k=0;k<3 && this.doors.length;k++) {
        const d=this.doors[(Math.floor(seed*this.doors.length)+k)%this.doors.length];
        if(Math.hypot(d.x-p.x,d.y-p.y)<.5)continue;
        if(this.route(p,d,this.inside)){p.target=d.building.id;p.mode='walk';p.wait=1;return true;}
      }
    } else {
      const outside=night&&this.canExit&&this.exterior.length&&seed<.45;
      const cells=outside?this.exterior:this.interior;
      for(let k=0;k<3&&cells.length;k++) {
        const i=cells[(Math.floor(seed*cells.length)+k*31)%cells.length], to=cellCenter(i);
        if(this.danger(to))continue;
        if(this.route(p,to,outside||!this.map!.city[cellAt(p.x,p.y)]?this.solid:this.inside)){delete p.target;p.mode='walk';p.wait=1+seed*3;return true;}
      }
    }
    if(p.role==='townsfolk' && this.doors.length===1 && this.interior.length) {
      const to=cellCenter(this.interior[Math.floor(seed*this.interior.length)]);
      if(this.route(p,to,this.inside)){delete p.target;p.mode='walk';p.wait=1;return true;}
    }
    p.wait=1;return false;
  }
  private shelter(p: Resident) {
    const doors=this.doors.slice().sort((a,b)=>(a.x-p.x)**2+(a.y-p.y)**2-((b.x-p.x)**2+(b.y-p.y)**2));
    for(const d of doors.slice(0,4)) if(this.route(p,d,this.map!.city[cellAt(p.x,p.y)]?this.inside:this.solid)) {p.mode='shelter';p.target=d.building.id;return true;}
    p.wait=.2;return false;
  }
  private escape(p: Resident, threat: {x:number;y:number}) {
    const x=Math.max(.5,Math.min(CELLS_W-.5,p.x)),y=Math.max(.5,Math.min(CELLS_H-.5,p.y));
    const exits=[{x:.5,y,exit:{x:-2,y}},{x:CELLS_W-.5,y,exit:{x:CELLS_W+2,y}},{x,y:.5,exit:{x,y:-2}},{x,y:CELLS_H-.5,exit:{x,y:CELLS_H+2}}];
    const ax=p.x-threat.x,ay=p.y-threat.y,ad=Math.hypot(ax,ay)||1;
    const score=(e:{x:number;y:number})=>Math.hypot(e.x-p.x,e.y-p.y)-2*((e.x-p.x)*ax+(e.y-p.y)*ay)/ad;
    exits.sort((a,b)=>score(a)-score(b));
    for(const e of exits) if(this.route(p,e,this.solid)){p.mode='escape';p.exit=e.exit;return true;}
    // Retry on the next update if geometry or the per-frame route budget blocks us.
    p.wait=.1;return false;
  }
  private walk(p: Resident, dt: number) {
    let left=dt*(p.mode==='escape'||p.mode==='shelter'?CITY_LIFE.run:CITY_LIFE.speed);
    for(let n=0;n<4&&p.path.length&&left>0;n++) {
      const cell=p.path[0];if(this.solid[cell]){p.path=[];return;}
      const to=cellCenter(cell),dx=to.x-p.x,dy=to.y-p.y,d=Math.hypot(dx,dy);
      if(d<=left){p.x=to.x;p.y=to.y;p.path.shift();left-=d;}
      else {p.x+=dx/d*left;p.y+=dy/d*left;left=0;}
    }
  }
  get visible() { return this.people.filter(p=>!p.hidden); }
  nearGate(b: Building) {return this.visible.some(p=>p.x>=b.rect.x-1&&p.x<=b.rect.x+b.rect.w+1&&p.y>=b.rect.y-1&&p.y<=b.rect.y+b.rect.h+1);}
  lights(time: number) {return this.visible.map(p=>({id:p.id,x:p.x+.2,y:p.y-.15,r:4.5,k:PERSON_TORCH_STRENGTH*torchLevel(time,p.id)})).filter(l=>l.k>0);}
}
