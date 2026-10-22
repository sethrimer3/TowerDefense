import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPE, CAPE_EDGE, capePixels, newCape, stepCape } from "../src/defend/hero-cape.ts";
import { MELEE_CAPE_LENGTHS, meleeCapeLength, meleeCapeLook, meleeCapeStyle } from "../src/defend/melee-cape.ts";
import type { DefendSim, Soldier } from "../src/defend/sim.ts";
import type { PathId } from "../src/knowledge-paths.ts";

test("melee cape lengths are 60/70/80/90 percent of the unchanged Hero chain", () => {
  const hero = CAPE.link * (CAPE.points - 1);
  for (let rank = 0; rank <= 3; rank++) {
    const style = meleeCapeLook("sword", rank ? { path: "crusaders", rank } : undefined)!;
    const cape = newCape(10, 10, 0, 1.7, style.length);
    for (let frame = 1; frame <= 90; frame++) {
      stepCape(cape, 10, 10 + frame / 20, frame / 60);
      let length = 0;
      for (let i = 1; i < CAPE.points; i++) length += Math.hypot(cape.x[i] - cape.x[i-1], cape.y[i] - cape.y[i-1]);
      assert.ok(Math.abs(length / hero - MELEE_CAPE_LENGTHS[rank]) < 1e-10);
    }
    stepCape(cape, 20, 30, 10); // Long-gap reset keeps the shorter tailoring.
    assert.ok(Math.abs(cape.y[CAPE.points - 1] - 30 - meleeCapeLength(rank)) < 1e-10);
  }
  const original = newCape(10, 10, 0);
  assert.equal(original.link, CAPE.link);
});

test("each melee path has matching colour and hem tailoring, with rank trim", () => {
  for (const [kind, paths] of [
    ["sword", ["crusaders", "berserkers", "halberdiers"]],
    ["assassin", ["bloodletters", "shadowcloak", "venom", "headhunters"]],
    ["spearman", ["longSpears", "setSpears"]], ["hoplite", ["testudo", "spearWall"]],
    ["lancer", ["heavyLance", "wingedLancers"]], ["valkyrie", ["cloudborne"]],
    ["undead", ["soulWeighing", "amalgam"]], ["reinforcement", ["hammerfall", "muster", "oathsworn"]],
  ] as [Soldier["kind"], PathId[]][]) {
    const looks = paths.map(path => meleeCapeLook(kind, { path, rank: 3 })!);
    assert.equal(new Set(looks.map(s => JSON.stringify([s.colors, s.cut.fringe]))).size, paths.length);
    for (const path of paths) {
      assert.equal(meleeCapeLook(kind, { path, rank: 0 })!.cut.bands, 0);
      assert.equal(meleeCapeLook(kind, { path, rank: 1 })!.cut.bands, 1);
      assert.equal(meleeCapeLook(kind, { path, rank: 3 })!.cut.bands, 2);
    }
  }
  for (const kind of ["archer", "mage", "darkWizard", "slinger", "sniper", "musketeer", "gunner", "javelineer", "hero", "shade"] as const) assert.equal(meleeCapeLook(kind), null);
  assert.equal(meleeCapeLook("brawler")!.length, 0.6);
});

test("capes read the soldier's own building or spell, and skip summoned archers", () => {
  const sim = { bonuses: { structurePaths: { 7: { barracks: { path: "berserkers", rank: 2 } }, 8: { barracks: { path: "crusaders", rank: 1 } } },
    necromancy: { path: "soulWeighing", rank: 3 }, reinforcements: { path: "oathsworn", rank: 2 } },
    map: { buildings: [{ structureUid: 7 }, { structureUid: 8 }] } } as unknown as DefendSim;
  const u = { kind: "sword", home: 0 } as Soldier;
  assert.equal(meleeCapeStyle(sim, u)!.length, 0.8);
  assert.equal(meleeCapeStyle(sim, { ...u, home: 1 })!.length, 0.7);
  assert.notDeepEqual(meleeCapeStyle(sim, u)!.colors, meleeCapeStyle(sim, { ...u, home: 1 })!.colors);
  assert.equal(meleeCapeStyle(sim, { ...u, kind: "undead", risen: { look: "warrior", size: 0.4, range: 0 } })!.length, 0.9);
  assert.equal(meleeCapeStyle(sim, { ...u, kind: "undead", risen: { look: "archer", size: 0.4, range: 4 } }), null);
  const called = { look: "knight" as const, size: 0.4, range: 0, life: 30, post: { x: 10, y: 10 }, squad: 1 };
  assert.equal(meleeCapeStyle(sim, { ...u, kind: "reinforcement", called })!.length, 0.8);
  assert.equal(meleeCapeStyle(sim, { ...u, kind: "reinforcement", called: { ...called, look: "archer", range: 4 } }), null);
});

test("short tailored capes stay inside their cloth width when backing and reversing", () => {
  for (const path of ["crusaders", "berserkers", "halberdiers", "wingedLancers"] as const) {
    const style = meleeCapeLook("sword", { path, rank: 3 })!;
    const c = newCape(10, 10, 0, 1.7, style.length);
    for (let frame = 1; frame <= 120; frame++) {
      const y = 10 + (frame < 60 ? -frame / 20 : -3 + (frame - 60) / 20);
      stepCape(c, 10, y, frame / 60);
      const p = capePixels(c, 10, y, 8, frame / 60, style.cut);
      assert.ok(p.tone.some(t => t && t !== CAPE_EDGE));
      for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
        const tone = p.tone[j*p.w+i]; if (!tone) continue;
        const x = 10 + (p.x0+i+0.5)/8, yy = y + (p.y0+j+0.5)/8;
        let distance = Infinity;
        for (let k = 1; k < CAPE.points; k++) {
          const ax = c.x[k-1], ay = c.y[k-1], dx = c.x[k]-ax, dy = c.y[k]-ay;
          const t = Math.max(0,Math.min(1,((x-ax)*dx+(yy-ay)*dy)/(dx*dx+dy*dy)));
          distance = Math.min(distance,Math.hypot(x-ax-t*dx,yy-ay-t*dy)*8);
        }
        assert.ok(distance <= style.cut.hem + (tone === CAPE_EDGE ? 1 : 0) + 1e-8);
      }
    }
  }
});
