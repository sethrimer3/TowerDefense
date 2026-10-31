/** A castle's damage a second: the sum of its buildings' average DPS
 * (`defend/average-dps.ts`), plus what watch towers' marks add. A rating
 * prior for Siege offers, never battle damage. */
import { bonuses } from "../progression.ts";
import type { Bonuses } from "../defend/catalog.ts";
import { watchReach } from "../defend/sim.ts";
import type { Building } from "../defend/citygen.ts";
import { fitLayout } from "../defend/layout.ts";
import { CELLS_W } from "../defend/grid.ts";
import { averageDps } from "../defend/average-dps.ts";
import { SPOTTERS, type PathId } from "../knowledge-paths.ts";
import { dist } from "../exact.ts";
import { castleAtForge, castleGame, type NativeCastle } from "./castle-model.ts";
import { SIDE_GROUPS, type DefenderKind } from "./siege-dps-catalog.ts";
/** The reference cities the generator prices buildings at, one a Forge band. */
const BANDS = new Map<number, { levels: NativeCastle["levels"]; bonuses: Bonuses }>();
function bandCity(band: number) {
  let city = BANDS.get(band);
  if (!city) {
    const game = castleAtForge(1, band);
    city = { levels: game.defend.levels, bonuses: bonuses(game) };
    BANDS.set(band, city);
  }
  return city;
}
/** One building's average DPS in a band's reference city, wearing `side`
 * ranks of its shared tree. */
export function defenderDps(kind: DefenderKind, band: number, path?: PathId, rank = 0, side: Record<string, number> = {}) {
  const city = bandCity(band),
    group = SIDE_GROUPS.find((g) => g.kind === kind),
    sideBonus = group ? { [sideBonusKey[group.key]]: side } : {};
  return averageDps(kind, { levels: city.levels, bonuses: { ...city.bonuses, ...sideBonus }, path, rank });
}
/** Which `Bonuses` field carries each shared tree's ranks. */
const sideBonusKey = {
  keepRanks: "keep",
  wallRanks: "walls",
  gateRanks: "gate",
  ballistaRanks: "ballista",
  revolutionaryRanks: "revolutionary",
  shadowRanks: "shadow",
  nanoRanks: "nano",
  chronoRanks: "chrono",
  repairRanks: "repair",
} as const;
export type DpsBreakdown = { total: number; direct: number; watch: number };
export function castleDpsBreakdown(input: NativeCastle | { castle: NativeCastle }): DpsBreakdown {
  const castle = "castle" in input ? input.castle : input,
    bonus = bonuses(castleGame(1, castle));
  const fit = fitLayout(castle.layout);
  if (!fit.ok) throw Error("Cannot estimate an illegal native castle: " + fit.reason);
  type Component = { kind: DefenderKind; dps: number; rect: { x: number; y: number; w: number; h: number }; uid?: number; mark?: number };
  const armed: Component[] = [],
    watchers: Component[] = [];
  const rate = (kind: DefenderKind, path?: PathId, rank = 0) => averageDps(kind, { levels: castle.levels, bonuses: bonus, path, rank });
  for (const placed of fit.structures) {
    const original = castle.layout.structures.find((s) => s.uid === placed.uid),
      kind = placed.kind;
    if (kind === "watchTower")
      watchers.push({ kind, dps: 0, rect: placed.rect, uid: placed.uid, mark: SPOTTERS.mark[original?.path === "spotters" ? (original.rank ?? 0) : 0] });
    else armed.push({ kind, dps: rate(kind, original?.path, original?.rank), rect: placed.rect, uid: placed.uid });
  }
  for (const gate of fit.gates ?? []) armed.push({ kind: "gate", dps: rate("gate"), rect: gate.rect });
  for (const ballista of fit.ballistas ?? []) armed.push({ kind: "wallBallista", dps: rate("wallBallista"), rect: ballista.rect });
  const wallDps = rate("wall");
  if (wallDps > 0 && fit.pieces)
    for (let c = 0; c < fit.pieces.length; c++)
      if (fit.pieces[c]) armed.push({ kind: "wall", dps: wallDps, rect: { x: c % CELLS_W, y: Math.floor(c / CELLS_W), w: 1, h: 1 } });
  const center = (c: Component) => ({ x: c.rect.x + c.rect.w / 2, y: c.rect.y + c.rect.h / 2 });
  // Marked enemies take `mark` times the damage. Marks never stack, so each
  // defender gains from the strongest watch tower covering the ground in
  // front of it, sampled at four points round its footprint (the front,
  // where the attackers come from, counting most).
  const marked = (c: Component) => {
    if (!watchers.length || !c.dps) return 0;
    const r = c.rect,
      points = [
        { x: r.x + r.w / 2, y: r.y + r.h + 0.35, w: 0.5 },
        { x: r.x - 0.35, y: r.y + r.h / 2, w: 1 / 6 },
        { x: r.x + r.w + 0.35, y: r.y + r.h / 2, w: 1 / 6 },
        { x: r.x + r.w / 2, y: r.y - 0.35, w: 1 / 6 },
      ];
    let extra = 0;
    for (const p of points) {
      let mark = 1;
      for (const w of watchers) {
        const at = center(w),
          b = { kind: w.kind, structureUid: w.uid, rect: w.rect } as Building;
        if (dist(at.x - p.x, at.y - p.y) <= watchReach({ levels: castle.levels, bonuses: bonus }, b)) mark = Math.max(mark, w.mark!);
      }
      extra += p.w * (mark - 1);
    }
    return c.dps * extra;
  };
  const direct = armed.reduce((sum, c) => sum + c.dps, 0),
    watch = armed.reduce((sum, c) => sum + marked(c), 0);
  return { total: direct + watch, direct, watch };
}
export const castleDps = (input: NativeCastle | { castle: NativeCastle }) => castleDpsBreakdown(input).total;
