import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { buildingPngs } from "../scripts/pixel-art/build.ts";
import { BUILDING_ART, BUILDING_ICON_SIZE, BUILDING_PALETTE, BUILDING_PIXELS_PER_CELL, BUILDING_PNGS, KEEP_FLAG, PALACE_SKY, buildingArt, buildingFrame } from "../src/defend/building-sprite-manifest.ts";
import { ART } from "../src/defend/park-art.ts";
import { STRUCTURES } from "../src/defend/catalog.ts";
import { PATH_LOOKS } from "../src/defend/tower-art.ts";
import { PIXEL_SPRITES } from "../src/defend/pixel-sprites.ts";

/** Delivery PNGs deliberately use RGBA8, noninterlaced scanlines, filter 0. */
function decode(png: Buffer) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...png.subarray(24, 29)], [8, 6, 0, 0, 0]);
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const scan = inflateSync(Buffer.concat(chunks)), data = Buffer.alloc(w * h * 4);
  assert.equal(scan.length, (w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    assert.equal(scan[y * (w * 4 + 1)], 0);
    scan.copy(data, y * w * 4, y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1));
  }
  return { w, h, data };
}

test("building PNG deliveries reproduce their editable art and use only the shared opaque palette", () => {
  const palette = new Set(Object.values(BUILDING_PALETTE).map(v => v.slice(1).toUpperCase()));
  const generated = buildingPngs();
  assert.deepEqual(new Set(generated.keys()), new Set(BUILDING_PNGS.map(id => `${id}.png`)));
  for (const [name, generatedBytes] of generated) {
    const bytes = readFileSync(new URL(`../public/assets/pixel/${name}`, import.meta.url));
    assert.ok(bytes.equals(generatedBytes), `${name}: run npm run sprites`);
    const { data } = decode(bytes);
    for (let i = 0; i < data.length; i += 4) {
      assert.ok(data[i + 3] === 0 || data[i + 3] === 255, `${name}: no antialiased alpha`);
      if (data[i + 3]) assert.ok(palette.has(data.subarray(i, i + 3).toString("hex").toUpperCase()), `${name}: shared colors only`);
    }
    assert.ok((PIXEL_SPRITES as readonly string[]).includes(name.slice(0, -4)), `${name}: registered loader/cache revision`);
  }
});

test("airborne PNGs keep two-cell cloud margins, centered anchors and matching shadow silhouettes", () => {
  for (const art of PALACE_SKY) {
    const cloud = decode(readFileSync(new URL(`../public/assets/pixel/${art.clouds}.png`, import.meta.url)));
    const shadow = decode(readFileSync(new URL(`../public/assets/pixel/${art.shadow}.png`, import.meta.url)));
    const mooring = decode(readFileSync(new URL(`../public/assets/pixel/${art.mooring}.png`, import.meta.url)));
    assert.deepEqual([cloud.w, cloud.h], art.size);
    assert.deepEqual([shadow.w, shadow.h], art.size);
    assert.deepEqual(art.anchor, art.size.map(n => n / 2));
    assert.deepEqual(art.size, art.footprint.map(n => (n + art.margin * 2) * ART));
    assert.deepEqual([mooring.w, mooring.h], art.footprint.map(n => n * ART));
    let overhang = 0;
    for (let y = 0; y < cloud.h; y++) for (let x = 0; x < cloud.w; x++) {
      const a = cloud.data[(y * cloud.w + x) * 4 + 3], sa = shadow.data[(y * cloud.w + x) * 4 + 3];
      assert.equal(sa, a && (x + y) % 2 === 0 ? 255 : 0);
      if (a && (x < art.margin * ART || y < art.margin * ART || x >= cloud.w - art.margin * ART || y >= cloud.h - art.margin * ART)) overhang++;
    }
    assert.ok(overhang > 0, "cloud bank extends beyond the building footprint");
    assert.ok(buildingArt("valkyriePalace", ...art.footprint), "flight uses an authored footprint");
  }
});

test("every building path and damage frame retains an exact catalog footprint, pivot and bounds", () => {
  assert.equal(BUILDING_PIXELS_PER_CELL, ART);
  for (const [name, art] of Object.entries(BUILDING_ART)) {
    const [w, h] = art.size, sheet = decode(readFileSync(new URL(`../public/assets/pixel/${art.sheet}.png`, import.meta.url)));
    assert.equal(sheet.w, w * art.looks.length);
    assert.equal(sheet.h, h * (art.stages + 1));
    assert.deepEqual(art.size, art.footprint.map(n => n * ART));
    assert.deepEqual(art.anchor, [w / 2, h / 2]);
    assert.deepEqual(art.overhang, [0, 0, 0, 0]);
    assert.equal(buildingArt(art.kind, ...art.footprint), art);
    assert.equal(buildingArt(art.kind, art.footprint[0] + 1, art.footprint[1]), undefined, "never stretch to a different footprint");
    if (name !== "barracksWide") {
      const def = STRUCTURES[art.kind], compact = name.endsWith("Compact") ? def.compact : undefined;
      assert.deepEqual(art.footprint, compact ? [compact.w, compact.h] : [def.w, def.h]);
    }
    if (art.kind !== "keep") assert.deepEqual(art.looks.slice(1), PATH_LOOKS[art.kind] ?? []);
    const alpha = (x: number, y: number) => sheet.data[(y * sheet.w + x) * 4 + 3];
    for (let col = 0; col < art.looks.length; col++) {
      let base = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha(col * w + x, y)) base++;
      assert.ok(base > w * h * 0.3, `${name}: readable base silhouette`);
      for (let stage = 0; stage < art.stages; stage++) {
        const colors = new Set<string>();
        assert.deepEqual(buildingFrame(art, stage, art.looks[col]), { sx: col * w, sy: stage * h, sw: w, sh: h });
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          assert.equal(alpha(col * w + x, stage * h + y), alpha(col * w + x, y), `${name}: damage cannot shift silhouette`);
          if (alpha(col * w + x, stage * h + y)) {
            const offset = ((stage * h + y) * sheet.w + col * w + x) * 4;
            colors.add(sheet.data.subarray(offset, offset + 3).toString("hex"));
            const [bx, by, bw, bh] = art.contentBounds;
            assert.ok(x >= bx && x < bx + bw && y >= by && y < by + bh, `${name}: declared content bounds`);
          }
        }
        assert.ok(colors.size <= 16, `${name}: restrained material palette (${colors.size})`);
      }
      const frame = buildingFrame(art, 0, art.looks[col], true);
      assert.equal(frame.sy + frame.sh, sheet.h, "rubble stays inside its native frame");
    }
    const icon = decode(readFileSync(new URL(`../public/assets/pixel/${art.icon}.png`, import.meta.url)));
    assert.deepEqual([icon.w, icon.h], [BUILDING_ICON_SIZE * art.looks.length, BUILDING_ICON_SIZE]);
    for (let col = 0; col < art.looks.length; col++) {
      const colors = new Set<string>();
      for (let y = 0; y < icon.h; y++) for (let x = col * BUILDING_ICON_SIZE; x < (col + 1) * BUILDING_ICON_SIZE; x++) {
        const i = (y * icon.w + x) * 4;
        if (icon.data[i + 3]) colors.add(icon.data.subarray(i, i + 3).toString("hex"));
      }
      assert.ok(colors.size <= 12, `${name}: readable UI palette (${colors.size})`);
    }
  }
  const flag = decode(readFileSync(new URL(`../public/assets/pixel/${KEEP_FLAG.sheet}.png`, import.meta.url)));
  assert.deepEqual([flag.w, flag.h], [KEEP_FLAG.size[0] * KEEP_FLAG.frames, KEEP_FLAG.size[1]]);
});
