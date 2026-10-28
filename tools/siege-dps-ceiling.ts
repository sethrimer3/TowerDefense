/** Bounded native placement search; the saved witness is a playable blueprint. */
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { castleAtForge, castleSnapshot, type NativeCastle } from "../src/campaign/castle-model.ts";
import { buildNativeCopy } from "../src/campaign/native-build.ts";
import { castleDps } from "../src/campaign/castle-dps.ts";
import { dpsProfiles, SIDE_GROUPS } from "../src/campaign/siege-dps-catalog.ts";
import { compactKinds } from "../src/defend/progress.ts";
import { arrange, fitLayout, type PlacedKind } from "../src/defend/layout.ts";
import { buySide } from "../src/side-ranks.ts";
import { SIEGE_DPS_INPUT_HASH } from "../src/campaign/siege-dps-table.ts";
import type { Save } from "../src/save.ts";
import type { DpsProfile } from "../src/campaign/siege-dps-catalog.ts";
export const CEILING_INPUTS = ["src/campaign/castle-dps.ts", "src/campaign/castle-model.ts", "src/campaign/native-build.ts", "tools/siege-dps-ceiling.ts"];
export function ceilingInputHash() {
  const h = createHash("sha256").update(SIEGE_DPS_INPUT_HASH);
  for (const p of CEILING_INPUTS) h.update(p + "\0").update(readFileSync(new URL("../" + p, import.meta.url)));
  return h.digest("hex");
}
function place(game: Save, p: DpsProfile, tx: number, ty: number) {
  const old = game.defend.layout,
    uid = old.nextUid;
  const s = { uid, kind: p.kind as PlacedKind, tx, ty, qx: tx * 4 + 1, qy: ty * 4 + 1, ...(p.path ? { path: p.path, rank: p.rank } : {}) };
  const next = { ...old, structures: [...old.structures, s], nextUid: uid + 1 };
  const layout = arrange(
    next,
    next.structures.filter((s) => s.tx === tx && s.ty === ty).map((s) => s.uid),
  );
  if (!layout) return false;
  buildNativeCopy(game, s.kind, p.path ? { path: p.path, rank: p.rank! } : undefined);
  if (p.path) {
    const i = game.defend.kept.findIndex((k) => k.kind === p.kind && k.path === p.path && k.rank === p.rank);
    if (i >= 0) game.defend.kept.splice(i, 1);
  }
  game.defend.layout = layout;
  return true;
}
const basic = (kind: PlacedKind): DpsProfile => ({ key: kind, kind });
export function searchCeiling() {
  const floor = castleAtForge(20261028, 0);
  place(floor, basic("rangedGuild"), 2, 1);
  place(floor, basic("rangedGuild"), 3, 1);
  const profiles = dpsProfiles(),
    max = profiles.filter((p) => p.kind !== "keep" && !["wall", "gate", "wallBallista", "watchTower", "chronoTower", "nanoTower"].includes(p.kind));
  // Every single-kind maximum is compared before the mixed support search.
  const bestByKind = new Map<string, DpsProfile>();
  for (const p of max) {
    const prior = bestByKind.get(p.kind);
    if (!prior || score(p) > score(prior)) bestByKind.set(p.kind, p);
  }
  function score(p: DpsProfile) {
    const g = castleAtForge(1, 4);
    for (const group of SIDE_GROUPS) for (const path of group.paths) for (let n = 0; n < path.ranks.length; n++) buySide(g, group.key, group.paths, path.id);
    if (!place(g, p, 2, 1)) return -1;
    return castleDps(castleSnapshot(g, 4));
  }
  const sorted = [...bestByKind.values()].sort((a, b) => score(b) - score(a)),
    candidates: NativeCastle[] = [];
  let attempts = 0;
  for (const profile of sorted) {
    const game = full();
    for (const key of game.defend.layout.cityTiles) {
      const [x, y] = key.split(",").map(Number);
      place(game, profile, x, y);
    }
    candidates.push(castleSnapshot(game, 4));
    attempts++;
  }
  // Offset support groups across the footprint. arrange uses native quarter
  // clearance and road access, including the gate approach and keep tile.
  const watchTiles = [
    [3, 2],
    [5, 2],
    [3, 4],
    [5, 4],
    [2, 1],
    [6, 1],
    [2, 5],
    [6, 5],
  ];
  for (let count = 0; count <= watchTiles.length; count++)
    for (let order = 0; order < 2; order++) {
      const game = full();
      for (const [x, y] of watchTiles.slice(0, count)) place(game, basic("watchTower"), x, y);
      const tiles = [...game.defend.layout.cityTiles];
      if (order) tiles.reverse();
      for (const key of tiles) {
        const [x, y] = key.split(",").map(Number);
        place(game, sorted[0], x, y);
      }
      // Fill remaining small slots with the strongest measured native tiny tower.
      for (const key of tiles) {
        const [x, y] = key.split(",").map(Number);
        place(game, basic("watchTower"), x, y);
      }
      candidates.push(castleSnapshot(game, 4));
      attempts++;
    }
  candidates.sort((a, b) => castleDps(b) - castleDps(a));
  const ceiling = candidates[0];
  return { floor: castleSnapshot(floor, 0), ceiling, attempts, min: castleDps(castleSnapshot(floor, 0)), max: castleDps(ceiling) };
}
function full() {
  const game = castleAtForge(20261028, 4);
  game.defend.layout.compact = compactKinds(game.defend.levels);
  for (const group of SIDE_GROUPS)
    for (const path of group.paths)
      for (let n = 0; n < path.ranks.length; n++) {
        if (!buySide(game, group.key, group.paths, path.id).ok) throw Error("Invalid side rank");
      }
  game.defend.layout.ballistas = [
    { vx: 2, vy: 1 },
    { vx: 7, vy: 1 },
    { vx: 2, vy: 6 },
    { vx: 7, vy: 6 },
  ];
  if (!fitLayout(game.defend.layout).ok) throw Error("Invalid max base");
  return game;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = searchCeiling(),
    hash = ceilingInputHash();
  writeFileSync(
    "src/campaign/siege-ceiling.ts",
    '// Generated by tools/siege-dps-ceiling.ts; do not edit.\n// node --experimental-transform-types --import ./tests/pin-random.ts tools/siege-dps-ceiling.ts\nimport type {NativeCastle} from "./castle-model.ts";\nexport const CEILING_INPUT_HASH=' +
      JSON.stringify(hash) +
      ";\nexport const DPS_MIN=" +
      result.min +
      ";\nexport const DPS_MAX=" +
      result.max +
      ";\nexport const FLOOR_CASTLE:NativeCastle=" +
      JSON.stringify(result.floor, null, 2) +
      ";\nexport const CEILING_CASTLE:NativeCastle=" +
      JSON.stringify(result.ceiling, null, 2) +
      ";\n",
  );
  console.log(JSON.stringify({ ...result, hash }, null, 2));
}
