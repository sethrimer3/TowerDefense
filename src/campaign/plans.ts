import { decodeAmbush, type AmbushProgress } from './levels.ts';
import { dist } from '../exact.ts';
import { wearFits } from '../specializations.ts';
import type { PathId } from '../knowledge-paths.ts';
import * as C from "../defend/catalog.ts";
import { TRAINS } from "../defend/deployment.ts";
import type { DefendSave } from "../defend/progress.ts";
export type Mode = 'ambush' | 'siege';
export type Point = { x: number; y: number };
export type Placement = { pad: number; kind: C.StructureKind; path?:PathId; rank?:number };
export type CampaignProgress = { cleared: number; layouts: Placement[][] };
export type CampaignSave = { ambush: AmbushProgress; siege: CampaignProgress };
export const emptyCampaigns = (): CampaignSave => ({ ambush: { stars: {} }, siege: { cleared: 0, layouts: [] } });
export const LEVELS = 3;
const kinds = Object.keys(C.STRUCTURES) as C.StructureKind[];
export const infantry = (kind: C.StructureKind) => !!TRAINS[kind];
export const deployable = (kind: C.StructureKind, mode: Mode) => kind !== 'keep' && (infantry(kind) || mode === 'ambush' && C.ITEM_CATEGORY[kind as C.PaletteItem] === 'towers');
export function decodeCampaigns(raw: unknown): CampaignSave {
  const out = emptyCampaigns();
  if (!raw || typeof raw !== 'object') return out;
  out.ambush = decodeAmbush((raw as Record<string, unknown>).ambush);
  for (const mode of ['siege'] as const) {
    const value = (raw as Record<string, any>)[mode];
    if (!value || typeof value !== 'object') continue;
    out[mode].cleared = Number.isInteger(value.cleared) ? Math.max(0, Math.min(LEVELS, value.cleared)) : 0;
    out[mode].layouts = Array.from({ length: Math.min(LEVELS, Array.isArray(value.layouts) ? value.layouts.length : 0) }, (_, level) => {
      const pads = new Set<number>();
      const input = Array.isArray(value.layouts?.[level]) ? value.layouts[level] : [];
      return input.slice(0, 100).filter((p: any) => {
        if (!p || !Number.isInteger(p.pad) || p.pad < 0 || p.pad >= levelPlan(mode, level).pads.length || pads.has(p.pad) || !kinds.includes(p.kind) || !deployable(p.kind, mode)) return false;
        pads.add(p.pad); return true;
      }).map((p: Placement) => ({ pad: p.pad, kind: p.kind,...(p.path&&wearFits(p.kind,p.path,p.rank)?{path:p.path,rank:p.rank}:{}) }));
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
const distance = (a: Point,b: Point) => dist(a.x-b.x,a.y-b.y);
function distanceToPath(p: Point,path: Point[]) {
  return Math.min(...path.slice(1).map((b,i) => {const a=path[i], dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return distance(p,{x:a.x+t*dx,y:a.y+t*dy});}));
}
export function validLayout(mode: Mode, level: number, layout: Placement[], owned: DefendSave['owned']) {
  const used = new Map<string,number>(), pads = new Set<number>();
  return layout.filter(p => {
    const n = used.get(p.kind) || 0;
    if (!deployable(p.kind,mode) || !levelPlan(mode,level).pads[p.pad] || pads.has(p.pad) || (owned[p.kind as C.PaletteItem]||0)<=0 || mode==='siege'&&n>=(owned[p.kind as C.PaletteItem]||0)) return false;
    pads.add(p.pad); used.set(p.kind,n+1); return true;
  }).map(p=>({...p}));
}
