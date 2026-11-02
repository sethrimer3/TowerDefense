import { test } from "node:test";
import assert from "node:assert/strict";
import { ENEMIES, type EnemyKind } from "../src/defend/catalog.ts";
import { bossLuck, essenceFor } from "../src/defend/essence.ts";

const KINDS = Object.keys(ENEMIES) as EnemyKind[];

test("only Dark One kills leave Essence", () => {
  for (const kind of KINDS) {
    const e = essenceFor(kind, 7, 3);
    if (ENEMIES[kind].faction === "darkOne") assert.ok(e >= 1, kind);
    else assert.equal(e, 0, kind);
  }
});

test("small Blight gives 1 to 3, bigger Blight more, the same for the same kill", () => {
  for (const kind of ["miniDarkling", "darkling", "largeDarkling", "majorDarkling", "significantDarkling", "blightDart", "blightPrism"] as EnemyKind[])
    for (let id = 0; id < 200; id++) {
      const e = essenceFor(kind, id, 11);
      assert.ok(e >= 1 && e <= 3, `${kind} ${e}`);
      assert.equal(e, essenceFor(kind, id, 11));
    }
  assert.equal(essenceFor("miniDarkling", 1, 1), 1);
  const mean = (kind: EnemyKind) => { let s = 0; for (let id = 0; id < 500; id++) s += essenceFor(kind, id, 5); return s / 500; };
  assert.ok(mean("significantDarkling") > mean("darkling"));
  assert.ok(mean("blightArk") > mean("blightDinghy"));
  assert.ok(mean("blightPlasmaFortress") > mean("blightFortress"));
});

test("a small worm gives about 10, a medium about 30, a boss 50 to 1000", () => {
  const worm = (kind: EnemyKind, seed: number) => {
    let s = 0;
    for (let n = 0; n < ENEMIES[kind].chainLength!; n++) s += essenceFor(kind, 1000 + n, seed, kind === "blightWorm" ? bossLuck(seed, 1000) : 1);
    return s;
  };
  let small = 0, medium = 0, lo = Infinity, hi = 0;
  for (let seed = 1; seed <= 400; seed++) {
    small += worm("smallBlightWorm", seed); medium += worm("mediumBlightWorm", seed);
    const boss = worm("blightWorm", seed);
    assert.ok(boss >= 50 && boss <= 1000, `${boss}`);
    lo = Math.min(lo, boss); hi = Math.max(hi, boss);
  }
  assert.ok(Math.abs(small / 400 - 10) < 1.5, `${small / 400}`);
  assert.ok(Math.abs(medium / 400 - 30) < 3, `${medium / 400}`);
  // A big range for grinding.
  assert.ok(lo <= 100 && hi >= 800, `${lo}..${hi}`);
});

test("the battle counts Essence for each Dark One killed, a boss worm's pieces sharing one luck", async () => {
  const { UPGRADES } = await import("../src/defend/catalog.ts");
  const { DefendSim } = await import("../src/defend/sim.ts");
  const { generateCity } = await import("../src/defend/citygen.ts");
  const { defaultLayout, fitLayout } = await import("../src/defend/layout.ts");
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 9);
  sim.beginManualWave(40, 4800, 3); sim.scenario = { manualWaves: true, noCivilians: true, ignoreKeepLoss: true };
  const before = sim.enemies.length;
  assert.ok(sim.releaseEnemy("blightWorm", { x: 20.5, y: 40 }));
  assert.ok(sim.releaseEnemy("orc", { x: 10.5, y: 10 }));
  const added = sim.enemies.slice(before);
  for (const e of added) e.hp = 0;
  (sim as any).sweepAway();
  const head = added[0];
  assert.equal(sim.essence, 50 * bossLuck(9, head.id));
});
