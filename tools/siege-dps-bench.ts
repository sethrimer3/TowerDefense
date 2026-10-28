/** Controlled native battle fixtures for the generated Siege rating table.
 * These fixtures measure real attacks; they never implement attack formulas. */
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { CELL_COUNT, CELLS_W, cellIndex, type Rect } from "../src/defend/grid.ts";
import { STRUCTURES, footprint } from "../src/defend/catalog.ts";
import { compactKinds } from "../src/defend/progress.ts";
import { bonuses } from "../src/progression.ts";
import { castleAtForge } from "../src/campaign/castle-model.ts";
import type { DpsProfile } from "../src/campaign/siege-dps-catalog.ts";
import type { FittedStructure } from "../src/defend/layout.ts";
export const DPS_BENCH = {
  version: 1,
  seconds: 40,
  warmup: 20,
  chronoWarmup: 120,
  crowd: 12,
  seed: 20261028,
  weights: { single: 0.6, crowd: 0.4 },
  hostEvery: 2,
} as const;
export type TargetSet = "single" | "crowd";
export type DpsMeasurement = { single: number; crowd: number };
const fitted = (uid: number, kind: FittedStructure["kind"], rect: Rect): FittedStructure => ({
  uid,
  kind,
  rect,
  tx: Math.floor(rect.x / 8),
  ty: Math.floor(rect.y / 8),
  inside: true,
});
function run(profile: DpsProfile, band: number, target: TargetSet, withoutChrono = false) {
  const game = castleAtForge(DPS_BENCH.seed, band),
    kind = profile.kind,
    keep = kind === "keep";
  const d =
    kind in STRUCTURES
      ? footprint(
          kind as keyof typeof STRUCTURES,
          compactKinds(game.defend.levels).some((k) => k === kind),
        )
      : { w: kind === "wall" ? 1 : 2, h: kind === "gate" ? 4 : kind === "wall" ? 1 : 2 };
  const rect = { x: 30, y: 44, w: d.w, h: d.h };
  if (profile.sideKey) (game.defend as unknown as Record<string, unknown>)[profile.sideKey] = profile.side;
  if (profile.path)
    game.defend.layout.structures = [
      { uid: 1, kind: kind as Exclude<FittedStructure["kind"], "keep">, tx: 3, ty: 5, qx: 15, qy: 22, path: profile.path, rank: profile.rank },
    ];
  const structures = [fitted(0, "keep", keep ? rect : { x: 30, y: 65, w: 4, h: 4 })];
  if (!keep && kind in STRUCTURES && !withoutChrono) structures.push(fitted(1, kind as FittedStructure["kind"], rect));
  const chrono = kind === "chronoTower",
    support = chrono || kind === "watchTower";
  if (support) {
    structures.push(fitted(900, "archerTower", { x: 24, y: 44, w: 2, h: 2 }), fitted(901, "meleeGuild", { x: 22, y: 50, w: 4, h: 4 }));
  }
  const wall = new Uint8Array(CELL_COUNT),
    pieces = new Uint8Array(CELL_COUNT);
  if (kind === "wall") wall[cellIndex(30, 44)] = pieces[cellIndex(30, 44)] = 1;
  const map = generateCity(
    {
      structures,
      city: new Uint8Array(CELL_COUNT),
      wall,
      pieces,
      ...(kind === "gate" ? { gates: [{ tx: 3, ty: 5, side: "e" as const, rect, inner: { ...rect, x: rect.x - 2 } }] } : {}),
      ...(kind === "wallBallista" ? { ballistas: [{ vx: 4, vy: 5, rect, out: { x: 1, y: 0 } }] } : {}),
    },
    DPS_BENCH.seed,
  );
  for (let c = 0; c < CELL_COUNT; c++) {
    const x = c % CELLS_W,
      y = Math.floor(c / CELLS_W),
      arena = x >= 20 && x < 55 && y >= 35 && y < 72;
    map.type[c] = arena ? CellType.ROAD : CellType.WATER;
    map.city[c] = arena ? 1 : 0;
  }
  for (const b of map.buildings) for (const c of b.cells) map.type[c] = b.kind === "wall" ? CellType.WALL : CellType.STRUCT;
  const measured = map.buildings.find((b) =>
    keep ? b.kind === "keep" : kind === "wall" || kind === "gate" || kind === "wallBallista" ? b.kind === kind : b.structureUid === 1,
  );
  const sim = new DefendSim(map, { ...game.defend.levels }, DPS_BENCH.seed, bonuses(game));
  sim.scenario = {
    manualWaves: true,
    passiveEnemies: true,
    noCivilians: true,
    unrestricted: true,
    ignoreKeepLoss: true,
    owns: (b) => b.id === measured?.id || !!(support && b.structureUid && b.structureUid >= 900),
  };
  const warmup = chrono ? DPS_BENCH.chronoWarmup : DPS_BENCH.warmup;
  for (let tick = 0; tick < warmup * 30; tick++) {
    if (chrono)
      for (const soldier of sim.soldiers)
        if (map.buildings[soldier.home].structureUid === 901) {
          soldier.x = rect.x + rect.w + 0.2;
          soldier.y = rect.y + rect.h / 2;
          soldier.path = [];
          soldier.thinkT = 1e9;
        }
    sim.step(1 / 30);
  }
  if (!chrono)
    for (const [i, soldier] of sim.soldiers.entries()) {
      soldier.x = rect.x + rect.w + 0.25;
      soldier.y = rect.y + rect.h / 2 + i * 0.08;
      soldier.path = [];
      soldier.thinkT = 0;
    }
  const points: { enemy: Enemy; x: number; y: number }[] = [];
  const count = target === "single" ? 1 : DPS_BENCH.crowd;
  for (let i = 0; i < count; i++) {
    const x = rect.x + rect.w + 0.35 + (target === "crowd" ? (i % 3) * 0.42 : 0),
      y = rect.y + rect.h / 2 + (target === "crowd" ? (Math.floor(i / 3) - 1.5) * 0.42 : 0),
      enemy = sim.spawnAuxiliary("ogre", x, y)!;
    enemy.hp = enemy.maxHp = 1e9;
    points.push({ enemy, x, y });
  }
  let host: Enemy | undefined;
  const spawnHost = () => {
    host = sim.spawnAuxiliary("roach", rect.x + rect.w + 0.4, rect.y + rect.h / 2 + 0.15)!;
    host.hp = host.maxHp = 1e9;
  };
  if (kind === "nanoTower") spawnHost();
  let total = 0;
  const loss = (before: number[]) => points.reduce((sum, p, i) => sum + Math.max(0, before[i] - Math.max(0, p.enemy.hp)), 0);
  // A wall's one native collapse blast is averaged over the same window.
  if ((kind === "wall" || kind === "monsterBait") && measured) {
    const before = points.map((p) => p.enemy.hp);
    sim.damageBuilding(measured.id, sim.maxHp[measured.id]);
    total += loss(before);
  }
  for (let tick = 0; tick < DPS_BENCH.seconds * 30; tick++) {
    const before = points.map((p) => p.enemy.hp);
    if (host && tick && tick % (DPS_BENCH.hostEvery * 30) === 0) sim.hurtEnemy(host, host.hp * 2, false, "ranged", { x: host.x, y: host.y, building: -1 });
    sim.step(1 / 30);
    total += loss(before);
    for (const p of points) {
      p.enemy.hp = 1e9;
      p.enemy.x = p.x;
      p.enemy.y = p.y;
    }
    if (host && host.hp <= 0) spawnHost();
  }
  return total / DPS_BENCH.seconds;
}
export function measureDps(profile: DpsProfile, band: number): DpsMeasurement {
  const result = {} as DpsMeasurement;
  for (const target of ["single", "crowd"] as const) {
    const raw = run(profile, band, target),
      baseline = profile.kind === "chronoTower" || profile.kind === "watchTower" ? run(profile, band, target, true) : 0;
    result[target] = Math.max(0, raw - baseline);
  }
  return result;
}
