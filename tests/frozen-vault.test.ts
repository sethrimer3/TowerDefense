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
import { frozenVaultPlan, glintAt, hasFrozenVault } from "../src/defend/frozen-vault.ts";
import { pillarPiece, relicPiece, runePiece, spirePiece } from "../src/defend/frozen-vault-art.ts";
import { zoneStory } from "../src/defend/zone-stories.ts";

function city() {
  const layout = defaultLayout();
  return generateCity(fitLayout(placeCityTile(layout, layout.keep.tx + 1, layout.keep.ty)!), 3);
}

test("the Frozen Vault comes before the Mistwood: waves 81-100, then 101-120", () => {
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
