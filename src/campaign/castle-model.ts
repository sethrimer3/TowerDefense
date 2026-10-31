/** Native castle input shared by measurements, generation and the raid adapter. */
import type { DefendSave } from "../defend/progress.ts";
import { defaultDefendSave } from "../defend/progress.ts";
import type { Save } from "../save.ts";
import { defaultSettings } from "../settings.ts";
import { TRAINING_IDS, type TrainingId } from "../progression.ts";
import { SKILL_IDS, type SkillId } from "../skill-trees.ts";
import { forgeState } from "./siege-dps-catalog.ts";
export const CASTLE_TILES = Object.freeze({ x: 2, y: 1, w: 5, h: 5 });
export const CASTLE_KEEP = Object.freeze({ tx: 4, ty: 2 });
export type CastleRanks = Pick<
  DefendSave,
  "keepRanks" | "wallRanks" | "gateRanks" | "ballistaRanks" | "revolutionaryRanks" | "shadowRanks" | "nanoRanks" | "chronoRanks" | "repairRanks"
>;
export type NativeCastle = CastleRanks & {
  layout: DefendSave["layout"];
  levels: DefendSave["levels"];
  training: Save["training"];
  skills: Save["skills"];
  forgeBand: number;
};
/** Only the fields read by native upgrade and battle snapshot functions.
 * No player save or global random stream is consulted. */
export function castleGame(seed: number, castle?: NativeCastle): Save {
  const defend = defaultDefendSave(seed);
  defend.owned = Object.fromEntries(Object.keys(defend.owned).map((k) => [k, 0])) as DefendSave["owned"];
  defend.layout = {
    keep: { ...CASTLE_KEEP },
    cityTiles: [],
    structures: [],
    nextUid: 1,
    compact: [],
    gates: [{ tx: 4, ty: 5, side: "s" }],
    spikes: [],
    ballistas: [],
  };
  for (let y: number = CASTLE_TILES.y; y < CASTLE_TILES.y + CASTLE_TILES.h; y++)
    for (let x: number = CASTLE_TILES.x; x < CASTLE_TILES.x + CASTLE_TILES.w; x++)
      if (x !== CASTLE_KEEP.tx || y !== CASTLE_KEEP.ty) defend.layout.cityTiles.push(x + "," + y);
  const game = {
    defend,
    settings: { ...defaultSettings(), devMode: true },
    knowledge: Infinity,
    training: Object.fromEntries(TRAINING_IDS.map((id) => [id, 0])) as Record<TrainingId, number>,
    skills: Object.fromEntries(SKILL_IDS.map((id) => [id, 0])) as Record<SkillId, number>,
    pathResearch: {},
    spellPaths: {},
  } as Save;
  if (castle) {
    const { layout, levels, training, skills, forgeBand: _band, ...ranks } = castle;
    game.defend = { ...defend, ...ranks, layout: structuredClone(layout), levels: { ...levels } };
    game.training = { ...training };
    game.skills = { ...skills };
    for (const s of layout.structures) game.defend.owned[s.kind]++;
    game.defend.owned.cityTile = layout.cityTiles.length;
    game.defend.owned.cityGate = layout.gates.length;
    game.defend.owned.wallBallista = layout.ballistas.length;
  }

  return game;
}
export function castleAtForge(seed: number, band: number) {
  const game = castleGame(seed),
    forge = forgeState(band);
  game.defend.levels = forge.levels;
  game.training = forge.training;
  game.skills = forge.skills;
  return game;
}
export function castleSnapshot(game: Save, forgeBand: number): NativeCastle {
  const d = game.defend,
    ranks: CastleRanks = {};
  for (const key of ["keepRanks", "wallRanks", "gateRanks", "ballistaRanks", "revolutionaryRanks", "shadowRanks", "nanoRanks", "chronoRanks", "repairRanks"] as const)
    if (d[key]) (ranks as Record<string, unknown>)[key] = { ...d[key] };
  return { layout: structuredClone(d.layout), levels: { ...d.levels }, training: { ...game.training }, skills: { ...game.skills }, forgeBand, ...ranks };
}
