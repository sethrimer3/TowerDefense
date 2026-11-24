import test from "node:test";
import assert from "node:assert/strict";
import { AMBUSH_LEVELS, decodeAmbush, type AmbushProgress } from "../src/campaign/levels.ts";
import { dots, mapZones, pathShown, visibleLevels, worldLayout, type Axis } from "../src/campaign/world-map.ts";
import { INK, fingerprint, markerSprite, paintWorld, zoneAt } from "../src/campaign/world-map-art.ts";

const alongOf = (axis: Axis, length: number, p: { x: number; y: number }) => (axis === "y" ? length - 1 - p.y : p.x);

test("The map's zones come from the level list, in order, each holding its own three levels", () => {
  const zones = mapZones();
  assert.equal(zones.length, 10);
  assert.deepEqual(
    zones.map((z) => z.area),
    [...new Set(AMBUSH_LEVELS.map((l) => l.area))],
  );
  for (const zone of zones) {
    assert.equal(zone.levels.length, 3);
    for (const i of zone.levels) assert.equal(AMBUSH_LEVELS[i].area, zone.area);
  }
});

test("Every level sits inside its own zone on the sheet, on either axis, however the zones are ordered", () => {
  const reordered = [...AMBUSH_LEVELS.slice(12), ...AMBUSH_LEVELS.slice(0, 12)],
    fewer = AMBUSH_LEVELS.filter((l) => l.area !== "ember");
  for (const levels of [AMBUSH_LEVELS, reordered, fewer]) {
    const zones = mapZones(levels);
    assert.deepEqual(
      zones.map((z) => z.area),
      [...new Set(levels.map((l) => l.area))],
    );
    for (const axis of ["x", "y"] as const) {
      const layout = worldLayout(zones, axis, 180, 175);
      assert.equal(layout.nodes.length, levels.length);
      assert.equal(layout.paths.length, levels.length - 1);
      for (const node of layout.nodes) {
        const zone = layout.zones[node.zone],
          along = alongOf(axis, layout.length, node);
        assert.ok(zone.levels.includes(node.level));
        assert.ok(along > zone.from + 10 && along < zone.to - 10, `${axis} ${node.level} at ${along} in ${zone.from}-${zone.to}`);
        assert.ok(node.x >= 20 && node.y >= 20 && node.x < layout.w - 20 && node.y < layout.h - 20);
      }
      layout.paths.forEach((path, i) => {
        assert.deepEqual(path[0], { x: layout.nodes[i].x, y: layout.nodes[i].y });
        const end = path[path.length - 1];
        assert.ok(Math.abs(end.x - layout.nodes[i + 1].x) < 1e-9 && Math.abs(end.y - layout.nodes[i + 1].y) < 1e-9);
        const d = dots(path, 6, 9);
        assert.ok(d.length > 3);
        for (const p of d) assert.ok(p.x >= 0 && p.y >= 0 && p.x < layout.w && p.y < layout.h);
      });
    }
  }
});

test("A level and the dotted way to it appear only once the level before has a star", () => {
  const progress: AmbushProgress = { stars: { "moss-1": 3, "moss-2": 1 } };
  assert.deepEqual(visibleLevels(progress), [0, 1, 2]);
  assert.deepEqual(
    AMBUSH_LEVELS.map((_, i) => pathShown(progress, i)).flatMap((shown, i) => (shown ? [i] : [])),
    [0, 1],
  );
  assert.deepEqual(visibleLevels({ stars: {} }), [0]);
  assert.equal(pathShown({ stars: {} }, 0), false);
  assert.equal(pathShown({ stars: { "nadir-3": 3 } }, AMBUSH_LEVELS.length - 1), false);
});

test("The map remembers how many levels it has shown, within the campaign", () => {
  assert.equal(decodeAmbush({ stars: {}, seen: 4 }).seen, 4);
  for (const bad of [0, 31, 2.5, "3", -1]) assert.equal(decodeAmbush({ stars: {}, seen: bad }).seen, undefined);
});

test("The painted map is deterministic, opaque inside, and each zone paints in its own colours", () => {
  const zones = mapZones(),
    layout = worldLayout(zones, "y", 160, 150),
    a = new Uint32Array(layout.w * layout.h),
    b = new Uint32Array(layout.w * layout.h);
  paintWorld(layout, a, [{ x: 40, y: 40, w: 50, h: 12 }], { x: 100, y: layout.h - 60 });
  paintWorld(layout, b, [{ x: 40, y: 40, w: 50, h: 12 }], { x: 100, y: layout.h - 60 });
  assert.equal(fingerprint(a), fingerprint(b));
  for (let y = 10; y < layout.h - 10; y += 7) for (let x = 10; x < layout.w - 10; x += 7) assert.ok(a[y * layout.w + x] >>> 24 === 255);
  // The most common colour (other than the landmarks' ink) across the middle of each zone differs from its neighbours'.
  const common = layout.zones.map((zone) => {
    const counts = new Map<number, number>(),
      y0 = layout.length - 1 - Math.round((zone.from + zone.to) / 2);
    for (let y = y0 - 20; y < y0 + 20; y++) for (let x = 15; x < layout.w - 15; x++) if (a[y * layout.w + x] !== INK) counts.set(a[y * layout.w + x], (counts.get(a[y * layout.w + x]) ?? 0) + 1);
    return [...counts].sort((p, q) => q[1] - p[1])[0][0];
  });
  for (let k = 1; k < common.length; k++) assert.notEqual(common[k], common[k - 1]);
  // Borders blend: across a border's band both zones appear.
  const border = layout.zones[1].from,
    seen = new Set<number>();
  for (let x = 0; x < layout.w; x++) seen.add(zoneAt(layout, border, x * 0.5 + 40, x, 3));
  assert.deepEqual([...seen].sort(), [0, 1]);
});

test("Level markers are outlined plinths, flagged once won and marked with an X while waiting", () => {
  const won = markerSprite("won", "#a9c878"),
    next = markerSprite("next", "#a9c878");
  assert.equal(won.w, next.w);
  assert.notDeepEqual(won.px, next.px);
  for (const s of [won, next]) {
    for (let x = 0; x < s.w; x++) assert.equal(s.px[x] === 0 || s.px[x] === INK, true);
    assert.ok(s.px.some((c) => c === INK));
  }
});
