import { decodeAmbush, type AmbushProgress } from "./levels.ts";
import { wearFits } from "../specializations.ts";
import type { PathId } from "../knowledge-paths.ts";
import * as C from "../defend/catalog.ts";
import { TRAINS } from "../defend/deployment.ts";
export type Mode = "ambush" | "siege";
export type Point = { x: number; y: number };
export type Placement = { pad: number; kind: C.StructureKind; path?: PathId; rank?: number };
export type CampaignProgress = { cleared: number; layouts: Placement[][] };
export type CampaignSave = { ambush: AmbushProgress; siege: CampaignProgress };
export const emptyCampaigns = (): CampaignSave => ({ ambush: { stars: {} }, siege: { cleared: 0, layouts: [] } });
export const LEVELS = 3;
const kinds = Object.keys(C.STRUCTURES) as C.StructureKind[];
export const infantry = (kind: C.StructureKind) => !!TRAINS[kind];
export const AMBUSH_PALETTE = ["meleeGuild", "rangedGuild", "archerTower", "cannonTower", "wizardTower"] as const;
export const deployable = (kind: C.StructureKind, mode: Mode) => (mode === "siege" ? infantry(kind) : (AMBUSH_PALETTE as readonly string[]).includes(kind));
export function decodeCampaigns(raw: unknown): CampaignSave {
  const out = emptyCampaigns();
  if (!raw || typeof raw !== "object") return out;
  out.ambush = decodeAmbush((raw as Record<string, unknown>).ambush);
  for (const mode of ["siege"] as const) {
    const value = (raw as Record<string, any>)[mode];
    if (!value || typeof value !== "object") continue;
    out[mode].cleared = Number.isInteger(value.cleared) ? Math.max(0, Math.min(LEVELS, value.cleared)) : 0;
    out[mode].layouts = Array.from({ length: Math.min(LEVELS, Array.isArray(value.layouts) ? value.layouts.length : 0) }, (_, level) => {
      const pads = new Set<number>();
      const input = Array.isArray(value.layouts?.[level]) ? value.layouts[level] : [];
      return input
        .slice(0, 100)
        .filter((p: any) => {
          if (!p || !Number.isInteger(p.pad) || p.pad < 0 || p.pad >= 8 || pads.has(p.pad) || !kinds.includes(p.kind) || !deployable(p.kind, mode))
            return false;
          pads.add(p.pad);
          return true;
        })
        .map((p: Placement) => ({ pad: p.pad, kind: p.kind, ...(p.path && wearFits(p.kind, p.path, p.rank) ? { path: p.path, rank: p.rank } : {}) }));
    });
  }
  return out;
}
