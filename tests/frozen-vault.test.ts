import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS, areaForWave } from "../src/defend/areas.ts";
import { Atmosphere, drifting, groundWeather } from "../src/defend/atmosphere.ts";
import { DefendSim } from "../src/defend/sim.ts";
import { defaultLayout, fitLayout, placeCityTile } from "../src/defend/layout.ts";
import { CellType, generateCity } from "../src/defend/citygen.ts";
import { UPGRADES } from "../src/defend/catalog.ts";
import { CELLS_W, cellIndex } from "../src/defend/grid.ts";
import { trailStyle } from "../src/defend/trails.ts";
import { dunePixels, setDuneLight, setDuneLook, setDuneStyle, duneLightKey, SAND_TONES } from "../src/defend/atmosphere-art.ts";
import { HD_SNOW_TONES, SNOW_TONES, driftLook, driftLookFor } from "../src/defend/drift-look.ts";
import { FROZEN_VAULT, HutRuins, frozenVaultPlan, glintAt, hasFrozenVault } from "../src/defend/frozen-vault.ts";
import { hutPiece, pillarPiece, relicPiece, runePiece, spirePiece } from "../src/defend/frozen-vault-art.ts";
import { zoneStory } from "../src/defend/zone-stories.ts";

function city() {
  const layout = defaultLayout();
  return generateCity(fitLayout(placeCityTile(layout, layout.keep.tx + 1, layout.keep.ty)!), 3);
}

test("the Highlands comes before the Mistwood: waves 81-100, then 101-120", () => {
  const ids = AREAS.map((a) => a.id);
  assert.equal(ids.indexOf("frozen"), 4);
  assert.equal(ids.indexOf("fungal"), 5);
  assert.equal(areaForWave(81).id, "frozen");
  assert.equal(areaForWave(100).id, "frozen");
  assert.equal(areaForWave(101).id, "fungal");
  assert.equal(zoneStory(81)?.signature, "Warden Halvard of the Northern March");
  assert.equal(zoneStory(101)?.signature, "Master Alchemist Orrin");
});

test("the Vault's ground drifts as the desert's does, in snow, with the desert's trails", () => {
  assert.equal(groundWeather("frozen"), "snow");
  assert.ok(drifting("snow") && drifting("sand") && !drifting("mist") && !drifting(null));
  assert.equal(trailStyle("frozen"), "sand");
  assert.equal(driftLookFor("frozen"), "snow");
  assert.equal(driftLookFor("desert"), "sand");
  const sim = new DefendSim(city(), Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as any, 4);
  sim.wave = 81; sim.breakT = 1e9;
  const env = sim.atmosphere = new Atmosphere();
  env.step(sim, 0.1);
  assert.equal(env.mode, "snow");
  assert.ok(env.sand.some((v) => v > 0), "snow lies in dunes outside the walls");
  assert.ok(env.weeds.length > 0, "the wind rolls snowballs over it");
  sim.wave = 101; env.step(sim, 0.1);
  assert.equal(env.mode, "mist");
  assert.ok(env.sand.every((v) => v === 0), "the snow is gone past the Vault");
});

test("the snow look draws the same dunes in blue-white snow tones, relit under its own key", () => {
  setDuneStyle(false); setDuneLight();
  setDuneLook("sand");
  const sandKey = duneLightKey(), sand = dunePixels().data;
  assert.ok(setDuneLook("snow"));
  assert.equal(driftLook(), "snow");
  assert.notEqual(duneLightKey(), sandKey);
  const { size, data } = dunePixels();
  const snow = new Set(SNOW_TONES.map((t) => t.join(","))), seen = new Set<string>();
  for (let i = 0; i < size * size; i++) seen.add(`${data[i * 4]},${data[i * 4 + 1]},${data[i * 4 + 2]}`);
  for (const t of seen) assert.ok(snow.has(t), `${t} is a snow tone`);
  assert.ok(seen.size >= 5);
  // Tone for tone the same shapes as the sand.
  const index = (tones: readonly (readonly number[])[], d: Uint8ClampedArray, i: number) => tones.findIndex((t) => t[0] === d[i * 4] && t[1] === d[i * 4 + 1] && t[2] === d[i * 4 + 2]);
  for (let i = 0; i < size * size; i += 97) assert.equal(index(SNOW_TONES, data, i), index(SAND_TONES, sand, i));
  // Snow is cool: blue at least as strong as red in every tone.
  for (const t of [...SNOW_TONES, ...HD_SNOW_TONES]) assert.ok(t[2] >= t[0]);
  setDuneLook("sand");
});

test("the Vault's pieces stand on open ground, off the trails, the same every time", () => {
  assert.ok(hasFrozenVault("frozen") && !hasFrozenVault("desert") && !hasFrozenVault("fungal"));
  const map = city(), plan = frozenVaultPlan(map);
  assert.equal(frozenVaultPlan(map), plan);
  const again = frozenVaultPlan(city());
  assert.deepEqual(again.spires, plan.spires);
  const pieces = [...plan.spires, ...plan.pillars, ...plan.runes, ...plan.relics, ...plan.sheets];
  assert.ok(plan.spires.length > 3 && plan.pillars.length > 2 && plan.runes.length > 1, "the vault's ruins show");
  for (const p of pieces) {
    assert.equal(map.type[cellIndex(Math.floor(p.x), Math.floor(p.y))], CellType.OUT);
    if (plan.trails) assert.ok(plan.trails.wear[cellIndex(Math.floor(p.x), Math.floor(p.y))] <= 0.1, "not on a trail");
  }
  for (let a = 0; a < pieces.length; a++) for (let b = a + 1; b < pieces.length; b++)
    assert.ok(Math.hypot(pieces[a].x - pieces[b].x, pieces[a].y - pieces[b].y) >= pieces[a].r + pieces[b].r, "pieces keep apart");
  assert.ok(plan.open.length === map.type.length && plan.open[0] <= 1 && CELLS_W > 0);
});

test("each piece is drawn bare, the runes and ice glowing, and the glints flash briefly", () => {
  const map = city(), plan = frozenVaultPlan(map);
  for (const p of [spirePiece(plan.spires[0]), runePiece(plan.runes[0]), relicPiece({ x: 5, y: 5, r: 0.7, seed: 3, kind: "crown" }), pillarPiece({ x: 5, y: 5, r: 0.8, seed: 9, fallen: false }), pillarPiece({ x: 5, y: 5, r: 0.8, seed: 9, fallen: true })]) {
    const solid = [...p.px].filter((v) => v);
    assert.ok(solid.length > 20, "it shows");
    // No baked black outline: nothing near black is painted.
    for (const v of solid) assert.ok((v & 0xff) + ((v >> 8) & 0xff) + ((v >> 16) & 0xff) > 40);
  }
  assert.ok([...runePiece(plan.runes[0]).glow!].some((v) => v), "the runes glow");
  let lit = 0;
  for (let t = 0; t < 30; t += 0.05) for (let k = 0; k < 10; k++) if ((glintAt(plan, k, t)?.show ?? 0) > 0) lit++;
  assert.ok(lit > 0 && lit < 30 / 0.05 * 10 * 0.2, "glints come and go");
});

test("little huts stand in the snow, some beside the trails, clear of the vault's pieces", () => {
  const map = city(), plan = frozenVaultPlan(map);
  assert.ok(plan.huts.length >= 3 && plan.huts.length <= FROZEN_VAULT.huts, "huts show");
  assert.ok(plan.huts.some((h) => h.round) || plan.huts.some((h) => !h.round));
  const others = [...plan.spires, ...plan.pillars, ...plan.runes, ...plan.relics, ...plan.sheets];
  for (const h of plan.huts) {
    assert.equal(map.type[cellIndex(Math.floor(h.x), Math.floor(h.y))], CellType.OUT);
    for (const o of others) assert.ok(Math.hypot(h.x - o.x, h.y - o.y) >= h.r + o.r, "huts keep clear of the ruins");
  }
  if (plan.trails) {
    const trails = plan.trails;
    const beside = plan.huts.filter((h) => {
      const cx = Math.floor(h.x), cy = Math.floor(h.y);
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (x >= 0 && y >= 0 && x < CELLS_W && y < 12 && trails.wear[cellIndex(x, y)] > 0.1) return true;
      return false;
    });
    assert.ok(beside.length >= 1, "some stand where the Blight walks");
  }
  for (const h of plan.huts.slice(0, 3)) for (const down of [false, true]) {
    const solid = [...hutPiece(h, down).px].filter((v) => v);
    assert.ok(solid.length > 10, "it shows");
    for (const v of solid) assert.ok((v & 0xff) + ((v >> 8) & 0xff) + ((v >> 16) & 0xff) > 40, "no baked outline");
  }
});

test("a hut falls when someone walks through it or a blast hits it, and stands again next wave", () => {
  const huts = [{ x: 3, y: 3, r: 0.6, seed: 1, round: false, turned: false }, { x: 8, y: 8, r: 0.6, seed: 2, round: true, turned: false }];
  const ruins = new HutRuins(), battle = {};
  ruins.update(huts, null, 0, 0, [{ x: 3, y: 3, size: 0.4 }], []);
  assert.ok(!ruins.down(0), "nothing falls outside a battle");
  ruins.update(huts, battle, 81, 1, [{ x: 5, y: 5, size: 0.4 }], []);
  assert.ok(!ruins.down(0) && !ruins.down(1), "passing by leaves it standing");
  ruins.update(huts, battle, 81, 2, [{ x: 3.2, y: 3.1, size: 0.4 }], []);
  assert.ok(ruins.down(0) && !ruins.down(1), "walked through, it falls");
  assert.equal(ruins.fell[0], 2);
  const boom = { kind: "boom", x: 9, y: 9, r: 1 };
  ruins.update(huts, battle, 81, 3, [], [boom]);
  assert.ok(ruins.down(1), "a blast knocks it down");
  ruins.update(huts, battle, 81, 4, [], [{ kind: "firework", x: 3, y: 3, r: 2 }]);
  assert.equal(ruins.fell[0], 2, "a fallen hut stays fallen");
  ruins.update(huts, battle, 82, 5, [], [boom]);
  assert.ok(!ruins.down(0) && !ruins.down(1), "rebuilt by the next wave; an old blast is not counted again");
  ruins.update(huts, {}, 82, 0, [], []);
  assert.ok(!ruins.down(0), "a new battle starts with every hut standing");
});
