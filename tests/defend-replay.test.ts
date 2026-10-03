import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { defaultLayout, fitLayout, placeCityTile, placeStructure, type Layout } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Levels } from "../src/defend/sim.ts";
import { UPGRADES, type PaletteItem, type EnemyKind } from "../src/defend/catalog.ts";

// Characterization replay of the Defend simulation: fixed cities, upgrade
// levels, seeds and bomb drops, stepped at the fixed timestep, with the whole
// sim state hashed every few seconds. Any change to enemy steering, the flow
// field, pathfinding, soldiers, archers, civilians, towers or the order of
// random draws shows up here, along with the time it first diverged.
// Regenerate (only when a gameplay change is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/defend-replay.golden.json", import.meta.url);

/** Seconds between state hashes. */
const EVERY = 5;

const levelsAt = (over: Partial<Levels> = {}) =>
  ({ ...Object.fromEntries(UPGRADES.map((u) => [u.id, 0])), ...over }) as Levels;
const maxLevels = (over: Partial<Levels> = {}) =>
  levelsAt({ ...Object.fromEntries(UPGRADES.map((u) => [u.id, u.maxLevel])), ...over });

/** The keep, a ring of city tiles, then `extra` city tiles and structures. */
function city(ring: [number, number][], structures: [PaletteItem, number, number][], compact: Layout["compact"] = []): Layout {
  let l = { ...defaultLayout(), compact };
  const { tx, ty } = l.keep;
  for (const [dx, dy] of ring) l = placeCityTile(l, tx + dx, ty + dy) ?? assert.fail(`city tile ${dx},${dy}`);
  for (const [kind, dx, dy] of structures) l = placeStructure(l, kind as never, tx + dx, ty + dy) ?? assert.fail(`${kind} at ${dx},${dy}`);
  return l;
}

const SQUARE: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const WIDE: [number, number][] = [...SQUARE, [-2, 0], [2, 0], [-2, 1], [2, 1], [-2, -1], [2, -1], [0, -2], [-1, -2], [1, -2]];

type Scenario = {
  layout: Layout;
  citySeed: number;
  levels: Levels;
  seed: number;
  seconds: number;
  /** Bomb drops: [second, x, y]. */
  bombs?: [number, number, number][];
  /** Buildings knocked down outright: [second, kind], the first intact one. */
  smash?: [number, string][];
  speed?: number;
  opening?: EnemyKind[];
  wave?: number;
  breakSeconds?: number;
};

function scenarios(): Record<string, Scenario> {
  return {
    newEnemies: {
      layout: city(SQUARE, [["barracks", 1, 1], ["archerTower", -1, -1], ["wizardTower", 0, -2]]),
      citySeed: 13, levels: maxLevels(), seed: 6, seconds: 100, wave: 1,
      opening: ['snake', 'dragon', 'shieldBearer', 'aegis', 'darkKnight', 'bombOrc', 'bombBird', 'voidSparrow', 'shieldLesser', 'shieldGreater', 'poisonLesser', 'poisonBearer', 'poisonGreater', 'poisonSovereign', 'siegeBeetle', 'burrowingMole', 'necromancer', 'bannerCaptain', 'mirrorKnight', 'leechSwarm', 'ashPhoenix', 'blinkImp'],
    },
    // Small explicit mixed siege retains late-enemy and ice coverage even
    // as the random difficulty budgets change the natural wave mix.
    mixed: {
      layout: city(SQUARE, [["wizardTower", 0, -2], ["wizardTower", 1, 1], ["barracks", -1, 1], ["archerTower", -1, -1]]),
      citySeed: 13, levels: maxLevels(), seed: 6, seconds: 160, wave: 10,
      opening: ['warlord', ...Array<EnemyKind>(12).fill('mother'), ...Array<EnemyKind>(12).fill('bat')],
      smash: [[5, 'house']],
    },
    repairs: {
      layout: city(SQUARE, []), citySeed: 5, levels: maxLevels(), seed: 2, seconds: 100,
      breakSeconds: 70, smash: [[1, 'house']],
    },
    // Only the keep: walls breached, houses smashed, civilians rebuilding, a loss.
    bare: { layout: city([], []), citySeed: 3, levels: levelsAt(), seed: 1, seconds: 240 },
    // Every structure at level 0, with bombs that catch friendly units.
    garrison: {
      layout: city(SQUARE, [["barracks", 1, 1], ["archerBarracks", -1, -1], ["archerTower", -1, 1], ["watchTower", 1, -1], ["cannonTower", 0, -2]]),
      citySeed: 5, levels: levelsAt(), seed: 2, seconds: 300,
      bombs: [[40, 31.5, 60], [75, 28, 58.5], [110, 34, 62]],
      smash: [[20, "house"], [21, "house"], [30, "wall"], [140, "archerTower"]],
    },
    // Fully upgraded: citywide patrols, hunting archers, safe cannons, many
    // civilians, against an explicit durable siege that exercises hunting.
    fortress: {
      layout: city(WIDE, [["barracks", 1, 1], ["barracks", -2, 0], ["archerBarracks", -1, -1], ["archerBarracks", 2, 1], ["archerTower", -1, 1], ["archerTower", 0, -3], ["watchTower", 1, -1], ["cannonTower", 2, -2], ["cannonTower", -2, -2]]),
      citySeed: 8, levels: maxLevels(), seed: 9, seconds: 520, speed: 3,
      opening: Array<EnemyKind>(20).fill("warlord"),
      bombs: [[60, 31.5, 50]],
      smash: [[45, "house"], [46, "wall"], [47, "barracks"]],
    },
    // Mid levels with the patrols leashed and archers roaming without instinct.
    leashed: {
      layout: city(WIDE, [["barracks", 1, -1], ["archerBarracks", -1, -1], ["archerTower", 1, 1], ["cannonTower", 0, -3]]),
      citySeed: 11, levels: maxLevels({ soldierReach: 1, archerHunt: 0, cannonSafe: 0, bombSafe: 0, civilianCount: 2, keepStrength: 2 }), seed: 4, seconds: 300,
      bombs: [[90, 30, 55]],
      smash: [[60, "house"], [61, "wall"], [62, "wall"], [200, "cannonTower"]],
    },
    // Valkyries charging down the streets, a folded palace beside a whole one.
    valkyries: {
      layout: city(SQUARE, [["valkyriePalace", -1, 1], ["valkyriePalace", 1, -1], ["valkyriePalace", 1, -1], ["archerTower", 0, -2]], ["valkyriePalace"]),
      citySeed: 7, levels: levelsAt({ valkyrieReach: 3, palaceCompact: 1, barracksCapacity: 2 }), seed: 3, seconds: 160, wave: 4,
      opening: [...Array<EnemyKind>(30).fill('orc'), ...Array<EnemyKind>(10).fill('bat'), ...Array<EnemyKind>(4).fill('ogre')],
      smash: [[90, "valkyriePalace"]],
    },
    // The dark wizard keep on a 2 × 2 block: corner turrets and the dark
    // wizard chaining black lightning through a crowd, until it is knocked down.
    darkKeep: {
      layout: city([...SQUARE, [-1, -2], [-2, -1], [-2, -2]], [["darkKeep", -2, -2], ["archerTower", 1, 1]]),
      citySeed: 9, levels: levelsAt({ chainCount: 3, chainReach: 2 }), seed: 5, seconds: 160, wave: 4,
      opening: [...Array<EnemyKind>(60).fill('roach'), ...Array<EnemyKind>(30).fill('orc'), ...Array<EnemyKind>(12).fill('bat'), ...Array<EnemyKind>(3).fill('ogre')],
      smash: [[60, "darkKeep"]],
    },
    // Wizard towers inside and outside the walls, flame and ice in turn.
    wizards: {
      layout: city(SQUARE, [["wizardTower", 0, -2], ["wizardTower", 1, 1], ["barracks", -1, 1]]),
      citySeed: 13, levels: levelsAt({ wizardFlame: 2, wizardIce: 3 }), seed: 6, seconds: 200,
      smash: [[120, "wizardTower"]],
    },
  };
}

const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value, (_, v) => (ArrayBuffer.isView(v) ? Array.from(v as Float32Array) : v)))
    .digest("hex")
    .slice(0, 12);

/** Everything the simulation owns that later steps or the renderer read. */
function state(sim: DefendSim) {
  const s = sim as unknown as Record<string, unknown>;
  const dark = (s.darkKeeps as { cooldown: Map<number, number> }).cooldown;
  return [
    sim.time, sim.wave, sim.lost, sim.breakT, sim.spawnT, s.spawnInterval, s.waveSpawned, sim.spawnQueue, sim.mapVersion, sim.changed.length,
    sim.corpses, sim.blackHoles, sim.enemies, sim.soldiers, sim.civilians, sim.arrows, sim.shells, sim.flames, sim.frosts, sim.stabs, sim.scorches, sim.effects, sim.events,
    sim.solid, sim.hp, sim.built, sim.flash, sim.field,
    [...(s.towers as { cooldown: Map<number, number> }).cooldown], [...(s.barracks as { training: Map<number, number> }).training], (s.builders as { respawn: number[] }).respawn,
    // Only runs with a dark keep have bolts or turrets, so the others hash as before.
    ...(sim.bolts.length || dark.size ? [sim.bolts, [...dark]] : []),
  ];
}

function smash(sim: DefendSim, kind: string) {
  const b = sim.map.buildings.find((b) => b.kind === kind && sim.intact(b)) ?? assert.fail(`no intact ${kind}`);
  sim.damageBuilding(b.id, 1e9);
}

/** Runs a scenario through `update()` in quarter-second frames (a whole
 * second of sim time per loop, at any speed), dropping the scripted bombs
 * and smashes, and calls `observe` after every frame. */
function replay(sc: Scenario, observe: (sim: DefendSim) => void = () => {}) {
  const fit = fitLayout(sc.layout);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, sc.citySeed), sc.levels, sc.seed);
  if (sc.opening) sim.spawnQueue = [...sc.opening];
  if (sc.wave) sim.wave = sc.wave;
  if (sc.breakSeconds) sim.breakT = sc.breakSeconds;
  sim.speed = sc.speed ?? 1;
  const out: string[] = [];
  for (let t = 1; t <= sc.seconds && !sim.lost; t++) {
    for (let f = 0; f < 4; f++) {
      sim.update(0.25 / sim.speed);
      observe(sim);
    }
    for (const [at, x, y] of sc.bombs ?? []) if (at === t) sim.dropBomb(x, y);
    for (const [at, kind] of sc.smash ?? []) if (at === t) smash(sim, kind);
    if (t % EVERY === 0) out.push(`${t}s:${digest(state(sim))}`);
  }
  out.push(`end:${digest(state(sim))}`);
  return { wave: sim.wave, lost: sim.lost, time: sim.time.toFixed(2), digests: out };
}

test("Defend simulation replays match the recorded hashes", () => {
  const actual = Object.fromEntries(Object.entries(scenarios()).map(([name, sc]) => [name, replay(sc)]));
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  const expected = JSON.parse(readFileSync(GOLDEN, "utf8"));
  assert.deepEqual(Object.keys(actual), Object.keys(expected));
  for (const name of Object.keys(expected)) {
    const a = actual[name].digests, e: string[] = expected[name].digests;
    const first = e.find((d, i) => a[i] !== d);
    assert.deepEqual(actual[name], expected[name], `${name} first diverges at ${first ? first.split(":")[0] : "the summary"}`);
  }
});

test("the Defend replays exercise every unit and effect", () => {
  // Guards the replay above against silently covering less.
  const seen = new Set<string>();
  for (const [name, sc] of Object.entries(scenarios()))
    replay(sc, (sim) => {
      for (const e of sim.enemies) {
        seen.add(`enemy:${e.kind}`);
        if (e.distract >= 0) seen.add("distracted");
        if (e.marked) seen.add("marked");
      }
      for (const s of sim.soldiers) {
        seen.add(`soldier:${s.kind}`);
        if (s.path.length) seen.add(`path:${s.kind}`);
        if (s.kind === "archer" && s.target >= 0) seen.add("hunting");
        if (s.guard) seen.add("guarded");
      }
      for (const c of sim.civilians) seen.add(`civilian:${c.state}`);
      if (sim.arrows.length) seen.add("arrow");
      if (sim.shells.length) seen.add("shell");
      if (sim.flames.length) seen.add("flame");
      if (sim.frosts.length) seen.add("frost");
      if (sim.stabs.some((st) => st.hits.length > 1)) seen.add("stab");
      if (sim.bolts.some((b) => b.pts.length > 6)) seen.add("chained");
      if (sim.enemies.some((e) => e.chill)) seen.add("chilled");
      if (sim.lost) seen.add(`lost:${name}`);
      if (sim.built.some((b, id) => b > 0 && b < sim.map.buildings[id].cells.length)) seen.add("half-rebuilt");
    });
  const want = [
    "enemy:shieldLesser", "enemy:shieldGreater", "enemy:poisonLesser", "enemy:poisonBearer", "enemy:poisonGreater", "enemy:poisonSovereign", "enemy:darkKnight", "enemy:bombOrc", "enemy:bombBird", "enemy:voidSparrow", "enemy:snake", "enemy:dragon", "enemy:shieldBearer", "enemy:aegis", "enemy:warlord", "enemy:bat", "enemy:mother", "enemy:broodling", "distracted", "marked", "soldier:sword", "soldier:archer", "path:sword", "path:archer", "hunting",
    "civilian:toJob", "civilian:working", "civilian:home", "arrow", "shell", "flame", "frost", "chilled", "soldier:valkyrie", "stab", "guarded", "soldier:darkWizard", "chained", "lost:bare", "half-rebuilt",
  ];
  assert.deepEqual(want.filter((w) => !seen.has(w)), []);
});
