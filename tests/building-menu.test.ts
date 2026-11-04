// The building menu's pieces (presentation only, not wired in yet): its
// icons, where it stands, the slider's steps, the square ranges' geometry
// and the build palette's opening flash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MENU_ICONS, MENU_ICON_SIZE, menuIconPixels } from '../src/ui/building-menu-icons.ts';
import { MENU_SIZE, buildingMenuBox, snapRange, TARGET_MODES } from '../src/ui/building-menu.ts';
import { clampToSquare, clipSquare, inSquare } from '../src/defend/square-range-art.ts';
import { SHIMMER_FLASH, closeFade, flashAlpha } from '../src/defend/placed-shimmer.ts';
import { t } from '../src/i18n/index.ts';

test('every menu icon is opaque pixel art, outlined, and distinct', () => {
  const seen = new Set<string>();
  for (const icon of MENU_ICONS) {
    const px = menuIconPixels(icon);
    assert.equal(px.length, MENU_ICON_SIZE * MENU_ICON_SIZE);
    assert.ok([...px].every((v) => v === 0 || v >>> 24 === 255), `${icon} has only clear or opaque pixels`);
    assert.ok([...px].some((v) => v === 0xff0c0a0a), `${icon} has its black outline`);
    assert.ok(px.filter((v) => v !== 0).length > 30, `${icon} draws something`);
    const key = [...px].join(',');
    assert.ok(!seen.has(key), `${icon} differs from the others`);
    seen.add(key);
  }
});

test('the menu is labelled for every targeting mode', () => {
  for (const m of TARGET_MODES) assert.notEqual(t(`menu.mode.${m}`), `menu.mode.${m}`);
});

test('the menu centres on its building and stays on screen', () => {
  const view = { w: 1280, h: 800 };
  const box = buildingMenuBox({ x: 600, y: 380, w: 40, h: 40 }, view, 'shooter');
  assert.equal(box.size, MENU_SIZE.desktop.min);
  assert.equal(box.left + box.size / 2, 620);
  assert.equal(box.top + box.size / 2, 400);
  const corner = buildingMenuBox({ x: 0, y: 0, w: 30, h: 30 }, view, 'troops');
  assert.equal(corner.left, MENU_SIZE.margin);
  assert.equal(corner.top, MENU_SIZE.margin);
  const big = buildingMenuBox({ x: 100, y: 100, w: 400, h: 300 }, view, 'plain');
  assert.ok(big.size >= 400 + 2 * big.bar, 'its middle opens round a big building');
  const phone = buildingMenuBox({ x: 180, y: 400, w: 30, h: 30 }, { w: 390, h: 844 }, 'shooter');
  assert.equal(phone.bar, MENU_SIZE.phone.bar);
  assert.ok(phone.left >= MENU_SIZE.margin && phone.left + phone.size <= 390 - MENU_SIZE.margin);
});

test('the range slider steps by 5% from 10% to 100%', () => {
  assert.equal(snapRange(3), 10);
  assert.equal(snapRange(47), 45);
  assert.equal(snapRange(48), 50);
  assert.equal(snapRange(140), 100);
});

test('square ranges include their edges and corners, and clamp along the ray', () => {
  const s = { x: 10, y: 10, r: 4 };
  assert.ok(inSquare(s, 14, 14), 'corner');
  assert.ok(inSquare(s, 6, 10), 'edge');
  assert.ok(!inSquare(s, 14.01, 10));
  assert.deepEqual(clampToSquare(s, { x: 12, y: 9 }), { x: 12, y: 9 });
  assert.deepEqual(clampToSquare(s, { x: 30, y: 10 }), { x: 14, y: 10 });
  assert.deepEqual(clampToSquare(s, { x: 18, y: 14 }), { x: 14, y: 12 });
  assert.deepEqual(clipSquare({ x: 13, y: 10, r: 2 }, s), { x0: 11, y0: 8, x1: 14, y1: 12 });
  assert.equal(clipSquare({ x: 30, y: 30, r: 2 }, s), null);
});

test('the palette flash holds, then fades out; closing fades the traces', () => {
  assert.equal(flashAlpha(-1), 0);
  assert.equal(flashAlpha(0), 1);
  assert.equal(flashAlpha(SHIMMER_FLASH.hold), 1);
  const mid = flashAlpha(SHIMMER_FLASH.hold + SHIMMER_FLASH.fade / 2);
  assert.ok(mid > 0 && mid < 1);
  assert.equal(flashAlpha(SHIMMER_FLASH.hold + SHIMMER_FLASH.fade), 0);
  assert.equal(closeFade(0), 1);
  assert.equal(closeFade(SHIMMER_FLASH.close), 0);
});
