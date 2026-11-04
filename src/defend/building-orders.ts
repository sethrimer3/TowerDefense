/** Optional per-building orders. Points are offsets, so moving a building
 * moves its orders too; inventory copies deliberately carry no orders. */
import type { TargetMode } from "../ui/building-menu.ts";
import type { Building } from "./citygen.ts";
import type { Layout } from "./layout.ts";
import type { Bonuses } from "./catalog.ts";
import { center } from "./pathing.ts";
import type { Enemy, DefendSim } from "./sim.ts";
import { enemyFlying } from "./catalog.ts";
import { cellAt } from "./pathing.ts";

export type OrderPoint = { x: number; y: number };
export type BuildingOrders = { targetMode?: TargetMode; rangePercent?: number; rally?: OrderPoint; crosshair?: OrderPoint };
const MODES: readonly string[] = ["closest", "first", "strongest", "weakest", "groups"];
export function decodeOrders(raw: any): BuildingOrders {
  const out: BuildingOrders = {};
  if (MODES.includes(raw?.targetMode) && raw.targetMode !== "closest") out.targetMode = raw.targetMode;
  if (typeof raw?.rangePercent === "number" && raw.rangePercent >= 10 && raw.rangePercent < 100 && raw.rangePercent % 5 === 0) out.rangePercent = raw.rangePercent;
  for (const key of ["rally", "crosshair"] as const) {
    const p = raw?.[key];
    if (p && typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y)) out[key] = { x: p.x, y: p.y };
  }
  return out;
}
export function orderKey(b: Pick<Building, "kind" | "structureUid" | "corner" | "gate">): string {
  if (b.kind === "keep") return "0";
  if (b.structureUid !== undefined) return String(b.structureUid);
  if (b.corner) return `ballista:${b.corner.vx},${b.corner.vy}`;
  if (b.gate) return `gate:${b.gate.tx},${b.gate.ty},${b.gate.side}`;
  return "";
}
export function layoutOrders(layout: Layout, b: Building): BuildingOrders | undefined {
  if (b.kind === "keep") return layout.keep;
  if (b.structureUid !== undefined) return layout.structures.find(s => s.uid === b.structureUid);
  if (b.corner) return layout.ballistas.find(s => s.vx === b.corner!.vx && s.vy === b.corner!.vy);
  if (b.gate) return layout.gates.find(s => s.tx === b.gate!.tx && s.ty === b.gate!.ty && s.side === b.gate!.side);
}
export function placedBattleOrders(layout: Layout): Pick<Bonuses, "buildingOrders"> {
  const orders: Record<string, BuildingOrders> = {};
  const add = (key: string, value: BuildingOrders) => { const o = decodeOrders(value); if (Object.keys(o).length) orders[key] = o; };
  add("0", layout.keep);
  for (const s of layout.structures) add(String(s.uid), s);
  for (const s of layout.ballistas) add(`ballista:${s.vx},${s.vy}`, s);
  for (const s of layout.gates) add(`gate:${s.tx},${s.ty},${s.side}`, s);
  return Object.keys(orders).length ? { buildingOrders: orders } : {};
}
export type OrderSource = { bonuses: Pick<Bonuses, "buildingOrders">; orders?: Map<number, BuildingOrders> };
export const ordersOf = (source: OrderSource, b?: Building): BuildingOrders => b ? source.orders?.get(b.id) ?? source.bonuses.buildingOrders?.[orderKey(b)] ?? {} : {};
export const rangeScale = (source: OrderSource, b?: Building) => (ordersOf(source, b).rangePercent ?? 100) / 100;

/** Comparator shared by single shots, volleys and troop acquisition. Groups
 * counts native grid neighbours, never a scan of the whole enemy array. */
export function targetComparator(sim: DefendSim, mode: TargetMode, origin: OrderPoint, pool?: readonly Enemy[]) {
  const distance = (e: Enemy) => (e.x-origin.x)*(e.x-origin.x)+(e.y-origin.y)*(e.y-origin.y);
  const keep = center(sim.map.buildings[sim.keepId].rect);
  const progress = (e: Enemy) => enemyFlying(e) ? Math.sqrt((e.x-keep.x)*(e.x-keep.x)+(e.y-keep.y)*(e.y-keep.y)) : sim.field[cellAt(e.x,e.y)];
  const counts = new Map<number, number>();
  const ids = pool ? new Set(pool.map(e=>e.id)) : null;
  const groups = (e: Enemy) => {
    let n = counts.get(e.id);
    if (n === undefined) { n = sim.enemiesInSquare(e.x,e.y,1.5).filter(o => o.id !== e.id && !o.untargetable && (!ids || ids.has(o.id))).length; counts.set(e.id,n); }
    return n;
  };
  return (a: Enemy, b: Enemy) => {
    let primary = 0;
    if (mode === "strongest") primary = b.hp-a.hp;
    if (mode === "weakest") primary = a.hp-b.hp;
    if (mode === "first") { const ap=progress(a),bp=progress(b); primary=ap<bp?-1:ap>bp?1:0; return primary || a.id-b.id; }
    if (mode === "groups") primary = groups(b)-groups(a);
    return primary || distance(a)-distance(b) || a.id-b.id;
  };
}
