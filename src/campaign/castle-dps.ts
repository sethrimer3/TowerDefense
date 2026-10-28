/** Measured potential damage is a rating prior, never battle damage. */
import { bonuses } from "../progression.ts";
import { UPGRADES, ITEM_CATEGORY, archerRange, NANO_TOWER } from "../defend/catalog.ts";
import { watchReach } from "../defend/sim.ts";
import type { Building } from "../defend/citygen.ts";
import { fitLayout } from "../defend/layout.ts";
import { CELLS_W } from "../defend/grid.ts";
import { dist } from "../exact.ts";
import { castleGame, type NativeCastle } from "./castle-model.ts";
import { FORGE_BANDS, SIDE_GROUPS, forgeState, profileKey, type DefenderKind } from "./siege-dps-catalog.ts";
import { SIEGE_DPS_TABLE, SIEGE_DPS_PROTOCOL } from "./siege-dps-table.ts";
import type { PathId } from "../knowledge-paths.ts";
const weight = (row: { single: readonly number[]; crowd: readonly number[] } | undefined, band: number) =>
  row ? row.single[band] * SIEGE_DPS_PROTOCOL.weights.single + row.crowd[band] * SIEGE_DPS_PROTOCOL.weights.crowd : 0;
export function forgeBandOf(levels: NativeCastle["levels"]) {
  let best = 0,
    distance = Infinity;
  for (let band = 0; band < FORGE_BANDS.length; band++) {
    const reference = forgeState(band).levels,
      score = UPGRADES.reduce((sum, u) => {
        const d = ((levels[u.id] ?? 0) - reference[u.id]) / Math.max(1, u.maxLevel);
        return sum + d * d;
      }, 0);
    if (score < distance) {
      distance = score;
      best = band;
    }
  }
  return best;
}
/** Shared-tree combinations use measured branch effects and their measured
 * all-max interaction anchor. The positive envelope is monotone in each rank. */
export function defenderDps(kind: DefenderKind, band: number, path?: PathId, rank = 0, side: Record<string, number> = {}) {
  const group = SIDE_GROUPS.find((g) => g.kind === kind);
  if (!group) return weight(SIEGE_DPS_TABLE[profileKey(kind, path, rank)] ?? SIEGE_DPS_TABLE[profileKey(kind)], band);
  const base = weight(SIEGE_DPS_TABLE[profileKey(kind)], band),
    allMax = Object.fromEntries(group.paths.map((p) => [p.id, p.ranks.length]));
  const joint = weight(SIEGE_DPS_TABLE[profileKey(kind, undefined, 0, allMax)], band);
  let value = base,
    full = base,
    blend = 1,
    highest = base;
  for (const branch of group.paths) {
    const n = Math.max(0, Math.min(branch.ranks.length, Math.floor(side[branch.id] ?? 0)));
    const actual = weight(SIEGE_DPS_TABLE[profileKey(kind, undefined, 0, { [branch.id]: n })], band),
      max = weight(SIEGE_DPS_TABLE[profileKey(kind, undefined, 0, { [branch.id]: branch.ranks.length })], band);
    highest = Math.max(highest, max);
    blend *= n / Math.max(1, branch.ranks.length);
    if (base > 0) {
      value *= Math.max(1, actual / base);
      full *= Math.max(1, max / base);
    } else {
      value += actual;
      full += max;
    }
  }
  const ceiling = Math.max(joint, highest);
  return Math.min(ceiling, value + Math.max(0, ceiling - full) * blend);
}
export type DpsBreakdown = { total: number; direct: number; watch: number; chrono: number; nano: number };
export function castleDpsBreakdown(input: NativeCastle | { castle: NativeCastle }): DpsBreakdown {
  const castle = "castle" in input ? input.castle : input,
    band = forgeBandOf(castle.levels),
    game = castleGame(1, castle),
    bonus = bonuses(game),
    reference = bonuses(castleGame(1, { ...castle, ...forgeState(band) }));
  const fit = fitLayout(castle.layout);
  if (!fit.ok) throw Error("Cannot estimate an illegal native castle: " + fit.reason);
  type Component = { kind: DefenderKind; dps: number; rect: { x: number; y: number; w: number; h: number }; uid?: number };
  const direct: Component[] = [],
    supports: Component[] = [];
  const rate = (kind: DefenderKind, path?: PathId, rank = 0) => {
    const group = SIDE_GROUPS.find((g) => g.kind === kind),
      side = group ? ((castle[group.key] as Record<string, number> | undefined) ?? {}) : {};
    const native = defenderDps(kind, band, path, rank, side);
    if (kind === "wall") return native;
    const unit = kind in ITEM_CATEGORY && ITEM_CATEGORY[kind as keyof typeof ITEM_CATEGORY] === "units";
    return native * (unit ? bonus.troopDamage / reference.troopDamage : bonus.towerDamage / reference.towerDamage);
  };
  for (const placed of fit.structures) {
    const original = castle.layout.structures.find((s) => s.uid === placed.uid),
      kind = placed.kind;
    const c: Component = { kind, dps: rate(kind, original?.path, original?.rank), rect: placed.rect, uid: placed.uid };
    if (["watchTower", "chronoTower", "nanoTower"].includes(kind)) supports.push(c);
    else if (c.dps > 0) direct.push(c);
  }
  for (const gate of fit.gates ?? []) direct.push({ kind: "gate", dps: rate("gate"), rect: gate.rect });
  for (const ballista of fit.ballistas ?? []) direct.push({ kind: "wallBallista", dps: rate("wallBallista"), rect: ballista.rect });
  const wallDps = rate("wall");
  if (wallDps > 0)
    for (let c = 0; c < fit.wall.length; c++)
      if (fit.wall[c]) direct.push({ kind: "wall", dps: wallDps, rect: { x: c % CELLS_W, y: Math.floor(c / CELLS_W), w: 1, h: 1 } });
  const armed = direct.filter((c) => c.dps > 0),
    center = (c: Component) => ({ x: c.rect.x + c.rect.w / 2, y: c.rect.y + c.rect.h / 2 });
  const watchers = supports.filter((c) => c.kind === "watchTower");
  // Marking never stacks. Sample the same four near-footprint fronts for every
  // defender; this is coverage in the rating model, not a combat target picker.
  const markReference = weight(SIEGE_DPS_TABLE[profileKey("meleeGuild")], 0) + weight(SIEGE_DPS_TABLE[profileKey("archerTower")], 0);
  const markShare = Math.min(1, weight(SIEGE_DPS_TABLE[profileKey("watchTower")], 0) / Math.max(0.001, markReference));
  const marked = (c: Component) => {
    if (!watchers.length || !c.dps) return 0;
    const r = c.rect,
      points = [
        { x: r.x + r.w / 2, y: r.y + r.h + 0.35, w: 0.5 },
        { x: r.x - 0.35, y: r.y + r.h / 2, w: 1 / 6 },
        { x: r.x + r.w + 0.35, y: r.y + r.h / 2, w: 1 / 6 },
        { x: r.x + r.w / 2, y: r.y - 0.35, w: 1 / 6 },
      ];
    let covered = 0;
    for (const p of points)
      if (
        watchers.some((w) => {
          const at = center(w),
            b = { kind: w.kind, structureUid: w.uid, rect: w.rect } as Building;
          return dist(at.x - p.x, at.y - p.y) <= watchReach({ levels: castle.levels, bonuses: bonus }, b);
        })
      )
        covered += p.w;
    return c.dps * covered * markShare;
  };
  const base = armed.reduce((sum, c) => sum + c.dps, 0),
    watch = armed.reduce((sum, c) => sum + marked(c), 0);
  let chrono = 0,
    nano = 0;
  // Context rates need real feeding/killing buildings. The common target-pool
  // model takes the strongest contribution per support family, avoiding double
  // counting one infection or one helper's shots across many support towers.
  for (const c of supports) {
    if (c.kind === "watchTower") continue;
    const range = c.kind === "chronoTower" ? archerRange(castle.levels.archerRange) : NANO_TOWER.range,
      at = center(c);
    const sources = armed.filter((a) => {
      const p = center(a);
      return dist(at.x - p.x, at.y - p.y) <= range;
    }).length;
    const supported = { ...c, dps: c.dps * Math.min(1, sources / 2) },
      value = supported.dps + marked(supported);
    if (c.kind === "chronoTower") chrono = Math.max(chrono, value);
    else nano = Math.max(nano, value);
  }
  return { total: base + watch + chrono + nano, direct: base, watch, chrono, nano };
}
export const castleDps = (input: NativeCastle | { castle: NativeCastle }) => castleDpsBreakdown(input).total;
