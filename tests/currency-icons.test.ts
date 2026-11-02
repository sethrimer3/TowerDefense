import { test } from "node:test";
import assert from "node:assert/strict";
import { ICON_SIZE, OUTLINE_INK, essencePixels, iconPixels, knotPixels, outlined, perlin, ropePixels } from "../src/ui/currency-icons.ts";

const NAMES = ["copper", "silver", "gold", "knowledge", "upgrade"] as const;

test("every currency icon is the same size and ringed in ink drawn after its art", () => {
  for (const name of NAMES) {
    const p = iconPixels(name);
    assert.equal(p.w, ICON_SIZE);
    assert.equal(p.h, ICON_SIZE);
    assert.ok(p.px.includes(OUTLINE_INK), name);
    // The ring is outermost: the picture's edge holds only ink or nothing.
    for (let i = 0; i < p.w; i++)
      for (const j of [i, (p.h - 1) * p.w + i, i * p.w, i * p.w + p.w - 1]) assert.ok(p.px[j] === -1 || p.px[j] === OUTLINE_INK, name);
  }
  assert.notDeepEqual(iconPixels("copper").px, iconPixels("gold").px);
});

test("the metals count up in bars: Copper one, Silver two stacked, Gold three in a triangle", () => {
  // Bars are the painted pixels' four-connected pieces, the ink between them aside.
  const bars = (name: "copper" | "silver" | "gold") => {
    const p = iconPixels(name), seen = new Set<number>(), found: { x: number; y: number }[] = [];
    for (let i = 0; i < p.px.length; i++) {
      if (seen.has(i) || p.px[i] < 0 || p.px[i] === OUTLINE_INK) continue;
      const stack = [i]; let sx = 0, sy = 0, n = 0; seen.add(i);
      while (stack.length) {
        const j = stack.pop()!, x = j % p.w, y = Math.floor(j / p.w); sx += x; sy += y; n++;
        for (const k of [j - 1, j + 1, j - p.w, j + p.w]) {
          if (k < 0 || k >= p.px.length || seen.has(k) || p.px[k] < 0 || p.px[k] === OUTLINE_INK) continue;
          if (Math.abs((k % p.w) - x) > 1) continue;
          seen.add(k); stack.push(k);
        }
      }
      found.push({ x: sx / n, y: sy / n });
    }
    return found;
  };
  assert.equal(bars("copper").length, 1);
  const silver = bars("silver");
  assert.equal(silver.length, 2);
  assert.equal(silver[0].x, silver[1].x, "stacked straight");
  const gold = bars("gold").sort((a, b) => a.y - b.y);
  assert.equal(gold.length, 3);
  assert.ok(gold[0].y < gold[1].y && gold[1].y === gold[2].y, "one on two");
  assert.equal(gold[0].x, (gold[1].x + gold[2].x) / 2, "the top bar centred");
});

test("outlined grows a picture by one pixel each way, corners cut", () => {
  const o = outlined({ w: 1, h: 1, px: [0xffffff] });
  assert.deepEqual(o.px, [-1, OUTLINE_INK, -1, OUTLINE_INK, 0xffffff, OUTLINE_INK, -1, OUTLINE_INK, -1]);
});

test("Essence's glob wobbles over time, repeatably, ringed in fire", () => {
  const a = essencePixels(0), b = essencePixels(2.5);
  assert.equal(a.w, ICON_SIZE);
  assert.notDeepEqual(a.px, b.px);
  assert.deepEqual(essencePixels(2.5).px, b.px);
  assert.ok(!a.px.includes(OUTLINE_INK));
  for (let t = 0; t < 20; t += 0.7) {
    const p = essencePixels(t);
    assert.ok(p.px.filter((c) => c === 0x050407).length > 20, `a body at ${t}`);
  }
  for (let i = 0; i < 50; i++) assert.ok(Math.abs(perlin(i * 0.37, i * 0.11, i * 0.53)) <= 1.01);
});

test("the rope tiles seamlessly and its knot is wider than it", () => {
  const rope = ropePixels(), knot = knotPixels();
  assert.equal(rope.px.length, rope.w * rope.h);
  for (let y = 0; y < rope.h; y++) {
    assert.equal(rope.px[y * rope.w], OUTLINE_INK);
    assert.equal(rope.px[y * rope.w + rope.w - 1], OUTLINE_INK);
  }
  assert.ok(knot.w > rope.w);
});
