import { CASTLE_KEEP, castleGame, type NativeCastle } from "./castle-model.ts";
import { SIDE_GROUPS } from "./siege-dps-catalog.ts";
import { decodeSideRanks } from "../side-ranks.ts";
import { STRUCTURES, UPGRADES } from "../defend/catalog.ts";
import { compactKinds } from "../defend/progress.ts";
import { fitLayout } from "../defend/layout.ts";
import { wearFits } from "../specializations.ts";
import { TRAINING } from "../progression.ts";
import { SKILLS, SKILL_IDS } from "../skill-trees.ts";
import { QUARTERS_W, QUARTERS_H } from "../defend/layout.ts";
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
export function decodeNativeCastle(raw: unknown): NativeCastle | null {
  try {
    if (!object(raw) || !object(raw.layout) || !object(raw.levels)) return null;
    const base = castleGame(0),
      l = raw.layout,
      expected = base.defend.layout;
    if (
      l.keep?.tx !== CASTLE_KEEP.tx ||
      l.keep?.ty !== CASTLE_KEEP.ty ||
      !Array.isArray(l.cityTiles) ||
      l.cityTiles.length !== 24 ||
      new Set(l.cityTiles).size !== 24 ||
      !l.cityTiles.every((t: unknown) => typeof t === "string" && expected.cityTiles.includes(t))
    )
      return null;
    if (
      !Array.isArray(l.structures) ||
      l.structures.length > 64 ||
      !int(l.nextUid, 1, 1e9) ||
      !Array.isArray(l.gates) ||
      l.gates.length > 8 ||
      !Array.isArray(l.spikes) ||
      l.spikes.length > 8 ||
      !Array.isArray(l.ballistas) ||
      l.ballistas.length > 4 ||
      (l.walls !== undefined && (!Array.isArray(l.walls) || l.walls.length > 256))
    )
      return null;
    for (const u of UPGRADES) {
      if (!int(raw.levels[u.id], 0, u.maxLevel)) return null;
      base.defend.levels[u.id] = raw.levels[u.id];
    }
    const ids = new Set<number>();
    for (const s of l.structures) {
      if (
        !object(s) ||
        !Object.hasOwn(STRUCTURES, s.kind) ||
        s.kind === "keep" ||
        !int(s.uid, 1, l.nextUid - 1) ||
        ids.has(s.uid) ||
        !int(s.qx, 0, QUARTERS_W - 1) ||
        !int(s.qy, 0, QUARTERS_H - 1) ||
        s.tx !== Math.floor(s.qx / 4) ||
        s.ty !== Math.floor(s.qy / 4)
      )
        return null;
      if ((s.path !== undefined || s.rank !== undefined) && !wearFits(s.kind, s.path, s.rank)) return null;
      ids.add(s.uid);
    }
    for (const g of [...l.gates, ...l.spikes])
      if (
        !object(g) ||
        !int(g.tx, 0, 8) ||
        !int(g.ty, 0, 12) ||
        !["n", "e", "s", "w"].includes(g.side) ||
        ((g.path !== undefined || g.rank !== undefined) && !wearFits("wallSpikes", g.path, g.rank))
      )
        return null;
    for (const b of l.ballistas) if (!object(b) || !int(b.vx, 0, 9) || !int(b.vy, 0, 13)) return null;
    for (const w of l.walls ?? []) if (!object(w) || !int(w.qx, 0, QUARTERS_W - 1) || !int(w.qy, 0, QUARTERS_H - 1)) return null;
    for (const group of SIDE_GROUPS) {
      const ranks = decodeSideRanks(group.paths, raw[group.key]);
      if (ranks) (base.defend as any)[group.key] = ranks;
    }
    base.defend.layout = {
      keep: { ...CASTLE_KEEP },
      cityTiles: [...l.cityTiles],
      structures: l.structures.map((s: any) => ({
        uid: s.uid,
        kind: s.kind,
        tx: s.tx,
        ty: s.ty,
        qx: s.qx,
        qy: s.qy,
        ...(s.path ? { path: s.path, rank: s.rank } : {}),
      })),
      nextUid: l.nextUid,
      compact: compactKinds(base.defend.levels),
      gates: l.gates.map(({ tx, ty, side }: any) => ({ tx, ty, side })),
      spikes: l.spikes.map(({ tx, ty, side, path, rank }: any) => ({ tx, ty, side, ...(path ? { path, rank } : {}) })),
      ballistas: l.ballistas.map(({ vx, vy }: any) => ({ vx, vy })),
      ...(l.walls?.length ? { walls: l.walls.map(({ qx, qy }: any) => ({ qx, qy })) } : {}),
      ...(l.innerWalls === true ? { innerWalls: true as const } : {}),
    };
    if (!fitLayout(base.defend.layout).ok) return null;
    for (const t of TRAINING) base.training[t.id] = object(raw.training) && int(raw.training[t.id], 0, t.max) ? raw.training[t.id] : 0;
    for (const id of SKILL_IDS) base.skills[id] = object(raw.skills) && int(raw.skills[id], 0, SKILLS[id].max) ? raw.skills[id] : 0;
    const ranks = Object.fromEntries(SIDE_GROUPS.filter((g) => base.defend[g.key]).map((g) => [g.key, base.defend[g.key]]));
    return {
      layout: base.defend.layout,
      levels: base.defend.levels,
      training: base.training,
      skills: base.skills,
      forgeBand: int(raw.forgeBand, 0, 4) ? raw.forgeBand : 0,
      ...ranks,
    };
  } catch {
    return null;
  }
}
