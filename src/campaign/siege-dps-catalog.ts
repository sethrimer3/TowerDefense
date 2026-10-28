import { STRUCTURES, UPGRADES, type StructureKind, type UpgradeId } from "../defend/catalog.ts";
import { buildingPathsOf } from "../specializations.ts";
import { TRAINING, type TrainingId } from "../progression.ts";
import { SKILLS, SKILL_IDS, type SkillId } from "../skill-trees.ts";
import { KEEP_PATHS } from "../keep-upgrades.ts";
import { WALL_PATHS } from "../wall-upgrades.ts";
import { GATE_PATHS } from "../gate-upgrades.ts";
import { BALLISTA_PATHS } from "../ballista-upgrades.ts";
import { REVOLUTIONARY_PATHS } from "../revolutionary-upgrades.ts";
import { SHADOW_PATHS } from "../shadow-upgrades.ts";
import { NANO_PATHS } from "../nanobot-upgrades.ts";
import { CHRONO_PATHS } from "../chrono-upgrades.ts";
import type { SideKey, SidePath } from "../side-ranks.ts";
import type { PathId } from "../knowledge-paths.ts";
export type DefenderKind = StructureKind | "wall" | "gate" | "wallBallista";
export type DpsProfile = { key: string; kind: DefenderKind; path?: PathId; rank?: number; sideKey?: SideKey; side?: Record<string, number> };
export const FORGE_BANDS = [0, 0.25, 0.5, 0.75, 1] as const;
export const SIDE_GROUPS: { kind: DefenderKind; key: SideKey; paths: SidePath<string>[] }[] = [
  { kind: "keep", key: "keepRanks", paths: KEEP_PATHS },
  { kind: "wall", key: "wallRanks", paths: WALL_PATHS },
  { kind: "gate", key: "gateRanks", paths: GATE_PATHS },
  { kind: "wallBallista", key: "ballistaRanks", paths: BALLISTA_PATHS },
  { kind: "revolutionary", key: "revolutionaryRanks", paths: REVOLUTIONARY_PATHS },
  { kind: "shadow", key: "shadowRanks", paths: SHADOW_PATHS },
  { kind: "nanoTower", key: "nanoRanks", paths: NANO_PATHS },
  { kind: "chronoTower", key: "chronoRanks", paths: CHRONO_PATHS },
];
export function profileKey(kind: DefenderKind, path?: PathId, rank = 0, side: Record<string, number> = {}) {
  return (
    kind +
    "/" +
    (path ?? "plain") +
    "/" +
    rank +
    "/" +
    Object.keys(side)
      .sort()
      .filter((k) => side[k] > 0)
      .map((k) => k + ":" + side[k])
      .join(",")
  );
}
export function dpsProfiles(): DpsProfile[] {
  const profiles: DpsProfile[] = [];
  for (const kind of [...Object.keys(STRUCTURES), "wall", "gate", "wallBallista"] as DefenderKind[]) {
    const group = SIDE_GROUPS.find((g) => g.kind === kind);
    if (group) {
      // Shadow's knife count and hit-by-hit compounding interact too strongly
      // for branch interpolation. Measure every legal combination directly.
      if (kind === "shadow") {
        const cap = (id: string) => group.paths.find((p) => p.id === id)!.ranks.length;
        for (let knives = 0; knives <= cap("knives"); knives++)
          for (let pierce = 0; pierce <= cap("pierce"); pierce++)
            for (let bleed = 0; bleed <= cap("bleed"); bleed++)
              for (let edge = 0; edge <= cap("edge"); edge++) {
                const side = { knives, pierce, bleed, edge };
                profiles.push({ key: profileKey(kind, undefined, 0, side), kind, sideKey: group.key, side });
              }
        continue;
      }
      profiles.push({ key: profileKey(kind), kind, sideKey: group.key, side: {} });
      for (const path of group.paths)
        for (let rank = 1; rank <= path.ranks.length; rank++) {
          const side = { [path.id]: rank };
          profiles.push({ key: profileKey(kind, undefined, 0, side), kind, sideKey: group.key, side });
        }
      const side = Object.fromEntries(group.paths.map((p) => [p.id, p.ranks.length]));
      profiles.push({ key: profileKey(kind, undefined, 0, side), kind, sideKey: group.key, side });
    } else {
      profiles.push({ key: profileKey(kind), kind });
      for (const path of buildingPathsOf(kind))
        for (let rank = 1; rank <= path.ranks.length; rank++) profiles.push({ key: profileKey(kind, path.id, rank), kind, path: path.id, rank });
    }
  }
  return profiles;
}
export function forgeState(band: number) {
  const fraction = FORGE_BANDS[band];
  return {
    levels: Object.fromEntries(UPGRADES.map((u) => [u.id, Math.round(u.maxLevel * fraction)])) as Record<UpgradeId, number>,
    training: Object.fromEntries(TRAINING.map((t) => [t.id, Math.round(t.max * fraction)])) as Record<TrainingId, number>,
    skills: Object.fromEntries(SKILL_IDS.map((id) => [id, Math.round(SKILLS[id].max * fraction)])) as Record<SkillId, number>,
  };
}
