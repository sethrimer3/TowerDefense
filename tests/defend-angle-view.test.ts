// Angle view's south faces (`facePixels` in city-layer.ts): each column of a
// building's art hangs a face from its lowest pixel, a row left for the
// roof's outline, only in the columns kept, and nothing for empty art.
import test from "node:test";
import assert from "node:assert/strict";
import { angled, facePixels, liftOf, setAngleView, wallFaces } from "../src/defend/city-layer.ts";
import { ART, WALL_FACE_HANG } from "../src/defend/art-scale.ts";
import type { Building } from "../src/defend/citygen.ts";

/** RGBA art `w` × `h` with the given opaque pixels. */
function art(w: number, h: number, solid: (x: number, y: number) => boolean) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) a.set([150, 90, 60, 255], (y * w + x) * 4);
  return a;
}
const opaque = (out: Uint32Array, w: number, x: number, y: number) => out[y * w + x] >>> 24 === 255;

test("a face hangs below each column's lowest pixel", () => {
  // A cross: the arms end higher than the middle.
  const w = 12, h = 24, src = art(w, h, (x, y) => (x >= 4 && x < 8 && y >= 2 && y < 10) || (y >= 4 && y < 6 && x >= 1 && x < 11));
  for (const style of ["house", "keep", "tower", "hall", "wall"] as const) {
    const out = facePixels(src, w, h, 5, style, 7)!;
    // The middle hangs from row 9: row 10 is the roof's outline, 11..14 the face.
    assert.ok(!opaque(out, w, 5, 10) && opaque(out, w, 5, 11) && opaque(out, w, 5, 14) && !opaque(out, w, 5, 15), style);
    // An arm hangs from row 5.
    assert.ok(!opaque(out, w, 2, 6) && opaque(out, w, 2, 7) && opaque(out, w, 2, 10) && !opaque(out, w, 2, 11), style);
    // Nothing over the art itself, or where there is no art above.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src[(y * w + x) * 4 + 3]) assert.ok(!opaque(out, w, x, y));
    for (let y = 0; y < h; y++) assert.ok(!opaque(out, w, 0, y) && !opaque(out, w, 11, y));
  }
});

test("only kept columns hang a face, and empty art has none", () => {
  const w = 10, h = 16, src = art(w, h, (_x, y) => y >= 2 && y < 6);
  const out = facePixels(src, w, h, 4, "wall", 1, (x) => x < 3)!;
  assert.ok(opaque(out, w, 1, 7) && !opaque(out, w, 5, 7));
  assert.equal(facePixels(art(w, h, () => false), w, h, 4, "hall", 1), null);
});

test("Angle view hangs the walls' faces too", () => {
  setAngleView(false);
  assert.equal(angled(), false);
  assert.equal(wallFaces(), false);
  setAngleView(true);
  assert.equal(wallFaces(), true);
  setAngleView(false);
});

test("Angle view lifts each standing sprite by its face, and nothing while off", () => {
  const b = (kind: string, extra: Partial<Building> = {}) => ({ id: 0, kind, cells: [], rect: { x: 0, y: 0, w: 2, h: 2 }, variant: 0, ...extra }) as Building;
  setAngleView(false);
  assert.equal(liftOf(b("archerTower")), 0);
  setAngleView(true);
  assert.equal(liftOf(b("archerTower")), 9 / ART);
  assert.equal(liftOf(b("house")), 5 / ART);
  for (const kind of ["wall", "gate", "wallBallista"]) assert.equal(liftOf(b(kind)), WALL_FACE_HANG);
  assert.equal(liftOf(b("wall", { fence: { x1: 0, y1: 0, x2: 1, y2: 0 } })), 0);
  assert.equal(liftOf(b("gate", { woodGate: true })), 0);
  setAngleView(false);
});

test("the slanted keep fills its art the same at every damage stage", async () => {
  const { ANGLED_KEEP_H, ANGLED_KEEP_W, angledKeepPixels } = await import("../src/defend/keep-angle-art.ts");
  assert.equal(ANGLED_KEEP_H, ANGLED_KEEP_W + 11);
  const whole = angledKeepPixels(0), solid = (px: Uint32Array) => px.map((v) => (v >>> 24 === 255 ? 1 : 0));
  assert.equal(whole.length, ANGLED_KEEP_W * ANGLED_KEEP_H);
  // Its foot reaches the bottom row, across the middle.
  assert.ok(whole[(ANGLED_KEEP_H - 1) * ANGLED_KEEP_W + ANGLED_KEEP_W / 2] >>> 24 === 255);
  for (let s = 1; s <= 4; s++) {
    const hurt = angledKeepPixels(s);
    assert.deepEqual(solid(hurt), solid(whole), `stage ${s} only repaints`);
    assert.notDeepEqual(hurt, whole);
  }
});

test("a guild's yard lies behind its hall, and Angle view shortens only the roof", async () => {
  const { structurePixels, structureYard, KINDS } = await import("../src/defend/tower-art.ts");
  const { HALL_FACE } = await import("../src/defend/angle-view.ts");
  const w = 4 * ART;
  for (const kind of ["meleeGuild", "rangedGuild", "archerBarracks", "heroHall", "bloodHall"] as const) {
    const yard = structureYard(kind, 4, 4), dropped = structureYard(kind, 4, 4, "", HALL_FACE);
    assert.ok(yard > 0 && yard < w / 2, `${kind} has a yard on the north`);
    assert.ok(dropped > yard + 1 && dropped - HALL_FACE <= yard, `${kind}'s yard runs on under the lifted hall`);
    // The hall reaches the lot's foot in both.
    for (const drop of [0, HALL_FACE]) {
      const px = structurePixels(kind, 4, 4, 0, 1, "", drop);
      assert.ok(px[(w - 4) * w + w / 2] >>> 24 === 255, `${kind} stands on its foot (drop ${drop})`);
    }
  }
  for (const kind of ["barracks", "archerTower", "mageGuild", "wizardTower"]) assert.equal(structureYard(kind, 4, 4), 0);
  assert.ok(KINDS.filter((k) => structureYard(k, 4, 4) > 0).length >= 15);
});

test("houses' walls vary from lot to lot", async () => {
  const { houseLook } = await import("../src/defend/city-layer.ts");
  const looks = Array.from({ length: 200 }, (_, i) => houseLook(i * 7919));
  for (const material of ["plaster", "stone", "brick", "boards"]) assert.ok(looks.some((l) => l.material === material), material);
  assert.ok(new Set(looks.map((l) => `${l.material}:${l.wall}:${l.door}:${l.doorAt}:${l.windows}:${!!l.shutters}`)).size > 100);
  // Two faces of the same art differ when their seeds give different walls.
  const src = art(20, 16, (x, y) => x >= 1 && x < 19 && y >= 1 && y < 9);
  const a = facePixels(src, 20, 16, 5, "house", 1)!, faces = Array.from({ length: 12 }, (_, i) => facePixels(src, 20, 16, 5, "house", 1000 + i)!);
  assert.ok(faces.some((f) => f.some((v, i) => v !== a[i])));
});

test("every placed structure has its own art seen at a slant, a wall hung below its lot", async () => {
  const { structurePixels, structureYard, KINDS } = await import("../src/defend/tower-art.ts");
  const { kindFaceDepth, HALL_FACE } = await import("../src/defend/angle-view.ts");
  const { footprint } = await import("../src/defend/catalog.ts");
  for (const kind of KINDS) {
    const f = footprint(kind, false), w = f.w * ART, h = f.h * ART, d = kindFaceDepth(kind);
    const drop = structureYard(kind, f.w, f.h) ? HALL_FACE : 0;
    const flat = structurePixels(kind, f.w, f.h, 0, 3), slant = structurePixels(kind, f.w, f.h, 0, 3, "", drop, d);
    assert.equal(slant.length, w * (h + d), kind);
    assert.ok(slant.subarray(w * h).some((v) => v >>> 24 === 255), `${kind} hangs a wall`);
    assert.notDeepEqual(slant.subarray(0, w * h), flat, `${kind} differs from above`);
    // Damage only repaints the slanted art too.
    const hurt = structurePixels(kind, f.w, f.h, 2, 3, "", drop, d);
    assert.deepEqual(hurt.map((v) => (v >>> 24 >= 128 ? 1 : 0)).reduce((a, b) => a + b, 0) > 0, true);
  }
});

test("houses' roofs lean toward the viewer in Angle view", async () => {
  const { roofPixels } = await import("../src/defend/roof-art.ts");
  // East-west ridge: the ridge row moves north.
  const ew = roofPixels(3, 2, 0, 5), ewA = roofPixels(3, 2, 0, 5, 0xbeac88);
  assert.notDeepEqual(ew, ewA);
  // North-south ridge: a gable end in the wall's colour near the foot.
  const ns = roofPixels(2, 3, 0, 5, 0xbeac88), W = 2 * ART, H = 3 * ART;
  const rgb = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255];
  const near = (v: number) => { const [r, g, b] = rgb(v); return Math.abs(r - 0xbe * 0.92) < 12 || Math.abs(r - 0xbe * 0.78) < 12 ? g > 100 && b > 80 : false; };
  let gable = 0;
  for (let y = H - 8; y < H; y++) for (let x = 0; x < W; x++) if (near(ns[y * W + x])) gable++;
  assert.ok(gable >= 3, `gable pixels ${gable}`);
});
