// The Mine's effects: each kind moves its own way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Particles } from "../src/mine/particles.ts";

test("smoke rises, dust falls and settles, sparks arc down, z's float up", () => {
  const fx = new Particles();
  fx.add("smoke", 10, 10, 0, -0.04, 200, "#888");
  fx.add("dust", 20, 10, 0.05, -0.1, 200, "#864");
  fx.add("spark", 30, 10, 0.1, -0.15, 200, "#fd8", 0.25);
  fx.add("zzz", 40, 10, 0, -0.012, 200, "#fff");
  const floor = (_x: number, y: number) => y >= 14;
  const seen: { kind: string; y: number }[][] = [];
  const read = () => (fx as unknown as { list: { kind: string; y: number }[] }).list.map((p) => ({ kind: p.kind, y: p.y }));
  for (let i = 0; i < 60; i++) {
    fx.step(floor, 1);
    seen.push(read());
  }
  const at = (k: string, i: number) => seen[i].find((p) => p.kind === k)?.y;
  assert.ok(at("smoke", 59)! < 9, "smoke rose");
  assert.ok(at("zzz", 59)! < 10, "the z rose");
  const dust = seen.map((_, i) => at("dust", i)).filter((y) => y !== undefined) as number[];
  const last = dust[dust.length - 1];
  assert.ok(last > 10 && last < 14, `dust fell and lies on the floor (${last})`);
  assert.equal(dust[dust.length - 5], last, "settled");
  assert.ok(dust.length < 60, "and faded");
  assert.ok(at("spark", 5) < 10 && at("spark", 40) > at("spark", 5), "the spark flew up, then fell");
});

test("embers and notes drift up; a drop falls and is gone where it lands", () => {
  const fx = new Particles();
  fx.add("ember", 10, 10, 0, -0.03, 200, "#fb5", 0.25);
  fx.add("note", 20, 10, 0, -0.02, 200, "#fe9");
  fx.add("drop", 30, 10, 0, -0.05, 200, "#cdf", 0.25);
  const floor = (_x: number, y: number) => y >= 14;
  const read = () => (fx as unknown as { list: { kind: string; y: number }[] }).list;
  for (let i = 0; i < 60; i++) fx.step(floor, 1);
  const at = (k: string) => read().find((p) => p.kind === k)?.y;
  assert.ok(at("ember")! < 9, "the ember rose");
  assert.ok(at("note")! < 9.5, "the note rose");
  assert.equal(at("drop"), undefined, "the drop landed and was gone");
});
