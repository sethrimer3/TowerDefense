// The upgrade map (src/specializations.ts's `fullTree` and discoveries,
// src/ui/specialty.ts's `mapGraph`): every basic building's whole line as a
// web, showing what any building of the line has ever reached, shared by
// them all and kept in the save, everything in Developer mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { BECOMES, MAP_ROOTS, buildingPathsOf, foundNodes, fullTree, nextSteps, respecBuilding, rootOf, upgradeBuilding, type PaletteKind, type SpecialtyTarget, type UpgradeStep } from "../src/specializations.ts";
import { mapCount, mapGraph } from "../src/ui/specialty.ts";
import { webLayout } from "../src/ui/upgrade-graph.ts";
import { PATHS } from "../src/knowledge-paths.ts";

function fixture() {
  const s = defaults(); s.knowledge = 1e6;
  s.defend.owned.rangedGuild = 2;
  return s;
}
/** Buys `pick` for a palette copy `copy`, returning the copy it became. */
const step = (s: ReturnType<typeof defaults>, copy: SpecialtyTarget & { copy: PaletteKind }, pick: (st: UpgradeStep) => boolean) => {
  const next = nextSteps(copy.copy, copy.wear).find(pick) ?? assert.fail("no such step");
  const r = upgradeBuilding(s, copy, next);
  assert.ok(r.ok && r.copy, !r.ok ? r.reason : "");
  return r.copy as SpecialtyTarget & { copy: PaletteKind };
};

test("every line's web holds each building, path rank and crown once", () => {
  const all = MAP_ROOTS.flatMap((r) => fullTree(r).map((n) => n.id));
  assert.equal(new Set(all).size, all.length, "ids are unique across the maps");
  for (const r of MAP_ROOTS) {
    const web = fullTree(r), ids = new Set(web.map((n) => n.id));
    assert.equal(web.filter((n) => !n.parent).length, 1);
    for (const n of web) if (n.parent) assert.ok(ids.has(n.parent), `${n.id}'s parent is on the map`);
    for (const n of web) if (n.kind && n.kind !== "wallSpikes") {
      assert.equal(rootOf(n.kind), r);
      for (const b of BECOMES[n.kind] ?? []) assert.ok(ids.has(`k:${b.to}`));
      for (const p of buildingPathsOf(n.kind)) p.ranks.forEach((_, i) => assert.ok(ids.has(`p:${p.id}:${i + 1}`)));
    }
  }
  // Every building path is on some map, crowns' evolutions too.
  const every = new Set(all);
  for (const p of PATHS) if (p.topic !== "necromancy" && buildingPathsOf(p.topic === "bait" ? "monsterBait" : p.topic === "spikes" ? "wallSpikes" : p.topic).length) {
    assert.ok(every.has(`p:${p.id}:1`), p.id);
    if (p.evolves) assert.ok(every.has(`k:${p.evolves.item}`));
  }
});

test("discoveries are shared by the line, survive undoing and the save", () => {
  const s = fixture();
  assert.equal(foundNodes(s.defend).has("k:mageGuild"), false);
  let a = step(s, { copy: "rangedGuild" }, (st) => st.type === "become" && st.to === "mageGuild");
  a = step(s, a, (st) => st.type === "path");
  const path = a.wear!.path;
  assert.ok(s.defend.upgradesFound?.includes("k:mageGuild"));
  assert.ok(s.defend.upgradesFound?.includes(`p:${path}:1`));
  // Respecced, it no longer holds them, but the line remembers.
  assert.ok(respecBuilding(s, a).ok);
  const found = foundNodes(s.defend);
  assert.ok(found.has("k:mageGuild") && found.has(`p:${path}:1`));
  // The other guild, never upgraded, sees them on its map.
  const here = new Set(["k:rangedGuild"]);
  const map = mapGraph("rangedGuild", found, here, false);
  assert.deepEqual(map.map((n) => n.id).sort(), ["k:mageGuild", "k:rangedGuild", `p:${path}:1`].sort());
  assert.equal(map.find((n) => n.id === "k:rangedGuild")!.state, "owned");
  assert.equal(map.find((n) => n.id === "k:mageGuild")!.state, "next");
  // What lies beyond trails off, unseen.
  assert.ok((map.find((n) => n.id === "k:rangedGuild")!.hidden?.length ?? 0) > 0);
  // Saved and loaded.
  const back = decode(JSON.stringify(s));
  assert.deepEqual(back.defend.upgradesFound, s.defend.upgradesFound);
  assert.equal(mapCount("mageGuild", foundNodes(back.defend)).found, 3);
});

test("the save keeps only real map nodes, and none when there are none", () => {
  const s = defaults();
  assert.equal(s.defend.upgradesFound, undefined);
  const raw = JSON.parse(JSON.stringify(s));
  raw.defend.upgradesFound = ["k:archerTower", "p:nope:1", 7, "k:archerTower"];
  assert.deepEqual(decode(JSON.stringify(raw)).defend.upgradesFound, ["k:archerTower"]);
  raw.defend.upgradesFound = ["bogus"];
  assert.equal(decode(JSON.stringify(raw)).defend.upgradesFound, undefined);
});

test("Developer mode shows the whole web, laid out round its root", () => {
  for (const r of MAP_ROOTS) {
    const map = mapGraph(r, new Set(), new Set([`k:${r}`]), true), web = fullTree(r);
    assert.equal(map.length, web.length);
    assert.ok(map.every((n) => !n.hidden));
    const at = webLayout(web);
    assert.deepEqual(at.get(`k:${r}`), [0, 0]);
    // Nobody stands on anybody.
    const spots = [...at.values()];
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++)
      assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) > 30, `${r}: nodes ${i} and ${j} overlap`);
  }
});
