import { castleAtForge, castleSnapshot, type NativeCastle } from "./castle-model.ts";
import { castleDps, defenderDps } from "./castle-dps.ts";
import { dpsProfiles, SIDE_GROUPS, type DpsProfile } from "./siege-dps-catalog.ts";
import { CEILING_CASTLE } from "./siege-ceiling.ts";
import { buildNativeCopy } from "./native-build.ts";
import { compactKinds } from "../defend/progress.ts";
import { arrange, type PlacedKind } from "../defend/layout.ts";
import { buySide } from "../side-ranks.ts";
import { placeOf, nextSteps, upgradeBuilding } from "../specializations.ts";
import { bonuses } from "../progression.ts";
import { ITEM_CATEGORY } from "../defend/catalog.ts";
import type { Save } from "../save.ts";
function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function tuneTraining(castle: NativeCastle, budget: number) {
  castle.training.troopDamage = castle.training.towerDamage = 0;
  const base = castleDps(castle);
  castle.training.troopDamage = 1;
  const troop = castleDps(castle) - base;
  castle.training.troopDamage = 0;
  castle.training.towerDamage = 1;
  const tower = castleDps(castle) - base;
  castle.training.towerDamage = 0;
  let best = base,
    a = 0,
    b = 0;
  for (let t = 0; t <= 50; t++)
    for (let w = 0; w <= 50; w++) {
      const n = base + t * troop + w * tower;
      if (n <= budget && n > best) {
        best = n;
        a = t;
        b = w;
      }
    }
  castle.training.troopDamage = a;
  castle.training.towerDamage = b;
  return castleDps(castle);
}
function place(game: Save, p: DpsProfile, rand: () => number) {
  const tiles = game.defend.layout.cityTiles
    .map((key) => ({ key, tie: rand(), count: game.defend.layout.structures.filter((s) => s.tx + "," + s.ty === key).length }))
    .sort((a, b) => a.count - b.count || a.tie - b.tie);
  for (const tile of tiles) {
    const [tx, ty] = tile.key.split(",").map(Number),
      old = game.defend.layout,
      uid = old.nextUid,
      s = { uid, kind: p.kind as PlacedKind, tx, ty, qx: tx * 4 + 1, qy: ty * 4 + 1, ...(p.path ? { path: p.path, rank: p.rank } : {}) },
      next = { ...old, structures: [...old.structures, s], nextUid: uid + 1 };
    const fitted = arrange(
      next,
      next.structures.filter((s) => s.tx === tx && s.ty === ty).map((s) => s.uid),
    );
    if (!fitted) continue;
    buildNativeCopy(game, s.kind, p.path ? { path: p.path, rank: p.rank! } : undefined);
    if (p.path) {
      const i = game.defend.kept.findIndex((k) => k.kind === p.kind && k.path === p.path && k.rank === p.rank);
      if (i >= 0) game.defend.kept.splice(i, 1);
    }
    game.defend.layout = fitted;
    return true;
  }
  return false;
}
const profiles = dpsProfiles().filter((p) => !["keep", "wall", "gate", "wallBallista"].includes(p.kind) && !p.side?.[Object.keys(p.side)[0]]);
export function generateNative(seed: number, mmr: number, budget: number): NativeCastle {
  const rand = random(seed),
    personality = Math.floor(rand() * 5),
    targetHomes = 4 + Math.floor(rand() * 7) + Math.floor(mmr / 400);
  const peak = structuredClone(CEILING_CASTLE);
  let peakValue = tuneTraining(peak, budget);
  while (peakValue > budget && peak.layout.structures.some((s) => s.kind === "shadow")) {
    const shadows = peak.layout.structures.filter((s) => s.kind === "shadow"),
      remove = shadows[Math.floor(rand() * shadows.length)];
    peak.layout.structures = peak.layout.structures.filter((s) => s.uid !== remove.uid);
    peakValue = tuneTraining(peak, budget);
  }
  if (mmr >= 2000 && peak.layout.structures.some(s => s.kind === "shadow") && peakValue <= budget && peakValue >= budget * 0.95) return peak;
  let best: NativeCastle | undefined,
    bestError = Infinity;
  for (let band = Math.min(4, Math.floor(mmr / 600)); band >= 0; band--) {
    const game = castleAtForge(seed, band);
    game.defend.layout.compact = compactKinds(game.defend.levels);
    game.training.troopDamage = game.training.towerDamage = 0;
    const reference = bonuses(castleAtForge(seed, band)),
      current = bonuses(game);
    const sides = SIDE_GROUPS.find((g) => g.kind === "shadow")!;
    if (mmr >= 2000) {
      let sideBest: Record<string, number> = {},
        valueBest = 0;
      for (let k = 0; k <= 4; k++)
        for (let p = 0; p <= 3; p++)
          for (let b = 0; b <= 3; b++)
            for (let e = 0; e <= 3; e++) {
              const ranks = { knives: k, pierce: p, bleed: b, edge: e },
                value = (defenderDps("shadow", band, undefined, 0, ranks) * current.troopDamage) / reference.troopDamage;
              if (value <= budget / Math.max(2, targetHomes / 2) && value > valueBest) {
                sideBest = ranks;
                valueBest = value;
              }
            }
      for (const p of sides.paths) for (let n = 0; n < (sideBest[p.id] ?? 0); n++) buySide(game, sides.key, sides.paths, p.id);
    }
    place(game, { key: "basic", kind: "rangedGuild" }, rand);
    place(game, { key: "basic", kind: "rangedGuild" }, rand);
    let value = castleDps(castleSnapshot(game, band));
    if (value > budget) continue;
    for (const group of SIDE_GROUPS.filter((g) => g.kind !== "shadow"))
      for (const path of [...group.paths].sort((a, b) => (a.id < b.id ? -1 : 1)))
        for (let n = 0; n < Math.min(path.ranks.length, Math.floor(mmr / 800)); n++) {
          const trial = structuredClone(game);
          if (!buySide(trial, group.key, group.paths, path.id).ok) break;
          const next = castleDps(castleSnapshot(trial, band));
          if (next > Math.max(value, budget * 0.35)) break;
          game.defend = trial.defend;
          value = next;
        }
    const allowed = profiles.filter((p) => {
      const place = placeOf(p.kind as PlacedKind);
      if ((place.tier === "ultimate" || place.tier === "beyond") && mmr < 2000) return false;
      if (mmr < 300 && place.tier !== "basic") return false;
      return (p.rank ?? 0) <= Math.min(3, 1 + Math.floor(Math.max(0, mmr - 600) / 500));
    });
    for (let n = 0; n < 60; n++) {
      const c = castleSnapshot(game, band),
        tuned = structuredClone(c),
        dps = tuneTraining(tuned, budget),
        error = Math.abs(dps - budget) / budget;
      if (error < bestError || (error <= 0.045 && c.layout.structures.length > (best?.layout.structures.length ?? 0))) {
        best = tuned;
        bestError = error;
      }
      if (error <= 0.045 && (mmr >= 2000 || game.defend.layout.structures.length >= Math.min(10, 2 + Math.floor(mmr / 300)) || value >= budget * 0.85)) break;
      const remaining = budget - value,
        ideal = remaining / Math.max(1, targetHomes - game.defend.layout.structures.length);
      const options = allowed
        .map((p) => {
          const group = SIDE_GROUPS.find((g) => g.kind === p.kind),
            side = group ? ((game.defend[group.key] as Record<string, number> | undefined) ?? {}) : {},
            unit = ITEM_CATEGORY[p.kind as PlacedKind] === "units",
            rate =
              defenderDps(p.kind, band, p.path, p.rank, side) *
              (unit ? current.troopDamage / reference.troopDamage : current.towerDamage / reference.towerDamage);
          const preferred =
            personality === 0
              ? !unit
              : personality === 1
                ? unit
                : personality === 2
                  ? /mage|wizard|inferno|storm|pyre|frost/i.test(p.kind)
                  : personality === 3
                    ? /gun|rocket|cannon|mortar|battery/i.test(p.kind)
                    : true;
          return { p, rate, score: (4 * Math.abs(rate - ideal)) / Math.max(1, ideal) + (preferred ? 0 : 0.3) + rand() * 0.2 };
        })
        .filter((o) => o.rate > 0 && o.rate <= remaining)
        .sort((a, b) => a.score - b.score);
      // Native Watch marking can fill capacity without inventing a multiplier.
      if (n % 3 === 2 && game.defend.layout.structures.some((s) => s.kind !== "watchTower"))
        options.unshift({ p: { key: "watch", kind: "watchTower" }, rate: 0, score: 0 });
      let accepted = false;
      for (const o of options.slice(0, 12)) {
        const candidate = structuredClone(game);
        if (!place(candidate, o.p, rand)) continue;
        const next = castleDps(castleSnapshot(candidate, band));
        if (next > budget || next <= value + 1e-6) continue;
        game.defend = candidate.defend;
        value = next;
        accepted = true;
        break;
      }
      if (!accepted) {
        const moves = game.defend.layout.structures
          .flatMap((home) => nextSteps(home.kind, home.path ? { path: home.path, rank: home.rank! } : undefined).map((step) => ({ home, step, tie: rand() })))
          .sort((a, b) => a.tie - b.tie);
        for (const { home, step } of moves) {
          const trial = structuredClone(game),
            result = upgradeBuilding(trial, { uid: home.uid }, step);
          if (!result.ok) continue;
          if (result.waiting) {
            const {path: _path, rank: _rank, ...bare} = home;
            const proposed = {
              ...trial.defend.layout,
              structures: [...trial.defend.layout.structures, { ...bare, kind: result.kind as PlacedKind }],
            };
            const fitted = arrange(proposed, [home.uid]);
            if (!fitted) continue;
            trial.defend.layout = fitted;
          }
          const next = castleDps(castleSnapshot(trial, band));
          if (next <= value || next > budget) continue;
          game.defend = trial.defend;
          value = next;
          accepted = true;
          break;
        }
      }
      if (!accepted) break;
    }
    if (bestError <= 0.045) break;
  }
  if (!best || bestError > 0.05) throw Error("Unfilled budget " + JSON.stringify({ seed, mmr, budget, bestError, best: best && castleDps(best) }));
  return best;
}
