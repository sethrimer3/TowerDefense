import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS } from '../src/defend/areas.ts';
import { FACE_ROWS, WALL_ART, hasWallArt, wallCapPixels, wallFacePixels, wallRubbleTones } from '../src/defend/area-wall-art.ts';
import { wallRubblePixels } from '../src/defend/damage-art.ts';

const later = AREAS.slice(1).map(a => a.id);
const hashOf = (px: Uint32Array) => px.reduce((h, v) => (Math.imul(h, 31) + v) | 0, 7);

test('every area after the first draws its own wall, Mossbound Ruins keeps its sprites', () => {
  assert.equal(hasWallArt('moss'), false);
  assert.equal(wallRubbleTones('moss'), null);
  for (const id of later) assert.ok(hasWallArt(id), id);
});

test('wall caps and faces are opaque, stable and distinct per area', () => {
  const caps = new Set<number>(), faces = new Set<number>();
  for (const id of later) {
    for (let cx = 0; cx < 8; cx++) for (let cy = 0; cy < 8; cy++) {
      const cap = wallCapPixels(id, cx, cy);
      assert.equal(cap.length, WALL_ART * WALL_ART);
      assert.ok(cap.every(v => v >>> 24 === 255), `${id} cap ${cx},${cy} opaque`);
      assert.equal(hashOf(cap), hashOf(wallCapPixels(id, cx, cy)), 'same cell, same art');
    }
    const face = wallFacePixels(id, 3);
    assert.equal(face.length, WALL_ART * FACE_ROWS);
    assert.ok(face.every(v => v >>> 24 === 255), `${id} face opaque`);
    caps.add(hashOf(wallCapPixels(id, 2, 5)));
    faces.add(hashOf(face));
  }
  assert.equal(caps.size, later.length);
  assert.equal(faces.size, later.length);
});

test('neighbouring wall cells vary in how their stones are cut and dressed', () => {
  for (const id of later) {
    const seen = new Set<number>();
    for (let cx = 0; cx < 8; cx++) seen.add(hashOf(wallCapPixels(id, cx, 0)));
    assert.equal(seen.size, 8, id);
  }
});

test('fallen wall stones take the area tones, the moss rubble is unchanged', () => {
  const tones = wallRubbleTones('frozen')!;
  assert.deepEqual(wallRubblePixels(11, 8), wallRubblePixels(11, 8, undefined, undefined));
  assert.notDeepEqual(wallRubblePixels(11, 8, tones.stone, tones.accent), wallRubblePixels(11, 8));
});
