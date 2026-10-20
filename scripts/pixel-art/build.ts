/** Editable, native-resolution pixel drawings. Emits real RGBA PNGs without
 * image tools, fonts, resampling or runtime drawing dependencies.
 * Run: node --experimental-transform-types scripts/pixel-art/build.ts
 * --check verifies the committed delivery files byte for byte. */
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILDING_ART, BUILDING_ICON_SIZE, BUILDING_PALETTE, KEEP_FLAG } from "../../src/defend/building-sprite-manifest.ts";

const P = BUILDING_PALETTE;
type Color = keyof typeof P;

class Drawing {
  data: Uint8Array;
  constructor(readonly w: number, readonly h: number, data?: Uint8Array) {
    this.data = data ?? new Uint8Array(w * h * 4);
  }
  dot(x: number, y: number, color: Color) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, rgb = Number.parseInt(P[color].slice(1), 16);
    this.data.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255], i);
  }
  rect(x: number, y: number, w: number, h: number, color: Color) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.dot(xx, yy, color);
  }
  line(x: number, y: number, x1: number, y1: number, color: Color) {
    const dx = Math.abs(x1 - x), sx = x < x1 ? 1 : -1, dy = -Math.abs(y1 - y), sy = y < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.dot(x, y, color);
      if (x === x1 && y === y1) break;
      const e = err * 2;
      if (e >= dy) { err += dy; x += sx; }
      if (e <= dx) { err += dx; y += sy; }
    }
  }
  stamp(rows: readonly string[], x: number, y: number, colors: Record<string, Color>) {
    rows.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch !== ".") this.dot(x + xx, y + yy, colors[ch]); }));
  }
  copy(source: Drawing, x: number, y: number) {
    for (let yy = 0; yy < source.h; yy++) for (let xx = 0; xx < source.w; xx++) {
      const i = (yy * source.w + xx) * 4;
      this.data.set(source.data.subarray(i, i + 4), ((yy + y) * this.w + xx + x) * 4);
    }
  }
}

/** One-pixel silhouette; large quiet stone planes, lit consistently NW. */
function stoneBox(p: Drawing, x: number, y: number, w: number, h: number) {
  p.rect(x, y, w, h, "ink");
  p.rect(x + 1, y + 1, w - 2, h - 2, "stone");
  p.rect(x + 1, y + 1, w - 2, 1, "stoneBright");
  p.rect(x + 1, y + 2, 1, h - 3, "stoneLight");
  p.rect(x + 2, y + h - 3, w - 3, 2, "stoneDark");
  p.rect(x + w - 2, y + 2, 1, h - 3, "stoneDark");
}

function turret(p: Drawing, x: number, y: number) {
  p.stamp([
    "..ooooo..", ".ollllso.", "olbbblsso", "olbbddsso", "olbdddsso", "olddddsso", "osddddsso", ".ossssso.", "..ooooo..",
  ], x, y, { o: "ink", s: "stone", l: "stoneLight", b: "stoneBright", d: "steel" });
}

function keep() {
  const p = new Drawing(32, 32);
  stoneBox(p, 3, 4, 26, 25);
  p.rect(6, 7, 20, 18, "ink");
  p.rect(7, 8, 18, 16, "stoneDark");
  // Curtain walk: a few orderly joints, not per-pixel masonry noise.
  for (const x of [11, 19]) p.dot(x, 5, "stone");
  p.rect(4, 12, 1, 8, "stoneBright");
  p.rect(27, 12, 1, 8, "stone");
  stoneBox(p, 9, 10, 14, 14);
  p.rect(10, 11, 12, 11, "steelDark");
  p.rect(11, 12, 10, 9, "steel");
  p.line(11, 12, 15, 16, "steelBright");
  p.rect(12, 12, 8, 1, "steelLight");
  p.rect(11, 13, 1, 7, "steelLight");
  p.rect(15, 16, 5, 4, "steelDark");
  // South gate, centered on the same axis as the great tower.
  p.rect(12, 25, 8, 5, "ink");
  p.rect(13, 26, 6, 3, "wood");
  p.rect(13, 26, 6, 1, "woodBright");
  p.rect(16, 27, 1, 2, "woodDark");
  for (const [x, y] of [[1, 1], [22, 1], [1, 22], [22, 22]]) turret(p, x, y);
  return p;
}

function shield(p: Drawing, x: number, y: number, crusader: boolean) {
  p.stamp([".oooooo.", "obbbbbbo", "obmmmmbo", "obmmmmbo", "obmmmmbo", ".bmmmmb.", "..bmmb..", "...oo..."], x, y,
    { o: "ink", b: crusader ? "gold" : "steelLight", m: crusader ? "stoneBright" : "steel", });
  if (crusader) {
    p.rect(x + 3, y + 2, 2, 4, "red"); p.rect(x + 2, y + 3, 4, 1, "red");
  } else {
    p.rect(x + 3, y + 2, 1, 4, "steelBright"); p.rect(x + 2, y + 4, 3, 1, "gold");
  }
}

function badge(p: Drawing, cx: number, cy: number, look: string) {
  if (look === "berserkers") {
    p.line(cx - 4, cy - 3, cx + 4, cy + 5, "ink");
    p.line(cx + 4, cy - 3, cx - 4, cy + 5, "ink");
    p.line(cx - 3, cy - 2, cx + 3, cy + 4, "woodBright");
    p.line(cx + 3, cy - 2, cx - 3, cy + 4, "woodBright");
    p.rect(cx - 5, cy - 4, 4, 3, "steelLight"); p.rect(cx + 2, cy - 4, 4, 3, "steel");
    p.rect(cx - 5, cy - 4, 3, 1, "steelBright"); p.rect(cx + 2, cy - 4, 3, 1, "steelBright");
  } else if (look === "halberdiers") {
    p.rect(cx - 1, cy - 6, 3, 13, "ink"); p.rect(cx, cy - 5, 1, 11, "woodBright");
    p.rect(cx - 3, cy - 3, 3, 4, "steel"); p.rect(cx - 3, cy - 3, 3, 1, "steelBright");
    p.line(cx, cy - 6, cx, cy - 3, "steelBright"); p.rect(cx + 1, cy - 2, 2, 1, "steelLight");
  } else shield(p, cx - 4, cy - 3, look === "crusaders");
}

function barracks(wide: boolean, look: string) {
  const p = new Drawing(wide ? 48 : 32, wide ? 32 : 48);
  const x = 3, y = 3, w = p.w - 6, roofH = wide ? 17 : 33, bottom = y + roofH;
  stoneBox(p, x + 1, y + 2, w - 2, roofH + 7);
  p.rect(x, y, w, roofH, "ink");
  p.rect(x + 1, y + 1, w - 2, roofH - 2, "red");
  if (wide) {
    p.rect(x + 1, y + 1, w - 2, 5, "redLight");
    p.rect(x + 1, y + 7, w - 2, 1, "redDark");
    p.rect(x + 1, y + 8, w - 2, roofH - 9, "redDark");
    p.rect(x + 2, y + 1, w - 4, 1, "redLight");
    p.rect(x + 1, y + roofH - 2, w - 2, 1, "woodDark");
  } else {
    p.rect(x + 1, y + 1, 10, roofH - 2, "redLight");
    p.rect(x + 12, y + 1, 1, roofH - 2, "redDark");
    p.rect(x + 13, y + 1, w - 14, roofH - 2, "redDark");
    p.rect(x + 1, y + 1, 1, roofH - 2, "redLight");
  }
  // Sparse straight tile courses, shared material colors and native pixels.
  if (wide) for (const xx of [11, 35]) p.rect(xx, y + 3, 1, 3, "red");
  else for (const yy of [10, 26]) p.rect(x + 3, yy, 6, 1, "red");
  p.rect(x + 2, bottom + 1, w - 4, 1, "stoneLight");
  const doorX = p.w / 2 - 3;
  p.rect(doorX - 1, bottom + 2, 8, 5, "ink");
  p.rect(doorX, bottom + 2, 6, 4, "wood");
  p.rect(doorX, bottom + 2, 6, 1, "woodLight");
  p.rect(doorX + 3, bottom + 3, 1, 3, "woodDark");
  p.rect(doorX - 1, bottom + 7, 8, 1, "stoneLight");
  // Both front windows stay symmetric, even on the separately composed wide hall.
  for (const wx of [x + 4, x + w - 7]) {
    p.rect(wx, bottom + 2, 3, 3, "ink"); p.rect(wx + 1, bottom + 2, 1, 2, "gold");
  }
  badge(p, p.w / 2, wide ? 10 : 18, look);
  return p;
}

function watchTower(look: string) {
  const p = new Drawing(16, 16);
  stoneBox(p, 1, 2, 14, 13);
  p.rect(4, 5, 8, 6, "ink"); p.rect(5, 6, 6, 4, "wood");
  p.rect(5, 6, 6, 1, "woodLight");
  for (const x of [2, 6, 10]) p.rect(x, 1, 3, 2, "ink"), p.rect(x, 2, 2, 1, "stoneBright");
  if (look === "spotters") {
    p.line(6, 9, 10, 5, "ink"); p.line(7, 9, 11, 5, "steelLight");
    p.rect(9, 4, 3, 2, "gold"); p.dot(10, 4, "goldLight");
    p.rect(7, 10, 1, 2, "woodDark");
  } else {
    p.rect(6, 8, 4, 3, "steelDark"); p.rect(6, 10, 4, 1, "steelLight");
    p.stamp(look === "signalFires" ? ["..r.", ".rr.", "rryr", "ryyr", ".yy."] : [".r.", "rrr", "ryr", ".y."], 6, look === "signalFires" ? 3 : 4,
      { r: "redLight", y: "goldLight" });
  }
  return p;
}

/** Progressive, designed damage marks use the same palette, with fixed
 * footprints. No random soot, photographic noise or new shades per stage. */
function damaged(base: Drawing, stage: number, keep: boolean) {
  const p = new Drawing(base.w, base.h, base.data.slice());
  const marks = [
    [[4, 9], [5, 10], [5, 11]],
    [[p.w - 7, p.h - 10], [p.w - 8, p.h - 9], [p.w - 8, p.h - 8]],
  ];
  if (stage) for (const points of marks) for (const [x, y] of points) {
    if (base.data[(y * p.w + x) * 4 + 3]) p.dot(x, y, "ink");
  }
  if (stage >= 2) {
    const x = Math.floor(p.w * 0.62), y = Math.floor(p.h * 0.45);
    p.rect(x, y, 4, 4, "ink"); p.rect(x + 1, y + 1, 3, 2, "recess");
    p.rect(x, y - 1, 3, 1, "stoneDark");
  }
  if (stage >= 3) {
    const x = Math.floor(p.w * 0.25), y = Math.floor(p.h * 0.55);
    p.rect(x, y, keep ? 7 : 5, keep ? 5 : 4, "ink");
    p.rect(x + 1, y + 1, keep ? 5 : 3, 2, "recess");
    p.line(x + 1, y + 1, x + 3, y + 3, "wood");
    p.rect(p.w - 6, p.h - 5, 3, 2, "stoneDark"); p.dot(p.w - 6, p.h - 5, "stoneLight");
  }
  if (stage >= 4) {
    p.rect(11, 22, 10, 5, "ink"); p.rect(12, 23, 8, 3, "recess");
    p.rect(13, 24, 4, 1, "wood"); p.rect(14, 23, 2, 1, "redLight");
  }
  // Damage never adds an unrelated silhouette outside the base sprite.
  for (let i = 0; i < p.data.length; i += 4) if (!base.data[i + 3]) p.data.fill(0, i, i + 4);
  return p;
}

function rubble(w: number, h: number, roofed: boolean) {
  const p = new Drawing(w, h);
  // A low, centered broken foundation plus a few legible clusters.
  p.rect(3, h - 7, w - 6, 3, "ink"); p.rect(4, h - 6, w - 8, 1, "stoneDark");
  for (const [x, y, ww, hh] of [[3, h - 12, 5, 6], [w - 9, h - 11, 6, 5], [w / 2 - 4, h - 14, 7, 8]]) {
    stoneBox(p, x, y, ww, hh);
  }
  p.rect(w / 2 - 5, h - 5, 5, 2, roofed ? "redDark" : "steelDark");
  if (roofed) {
    p.line(w / 2 - 6, h - 11, w / 2 + 4, h - 4, "ink");
    p.line(w / 2 - 5, h - 11, w / 2 + 4, h - 5, "wood");
  }
  return p;
}

/** Purpose-drawn 24px UI compositions rather than squashed world frames. */
function icon(kind: string, look: string) {
  const p = new Drawing(24, 24);
  if (kind === "keep") {
    stoneBox(p, 3, 4, 18, 17); stoneBox(p, 8, 8, 8, 10);
    p.rect(9, 9, 6, 6, "steel"); p.rect(9, 9, 5, 1, "steelLight");
    for (const [x, y] of [[2, 2], [17, 2], [2, 17], [17, 17]]) p.stamp([".ooo.", "olbso", "olsso", "osdso", ".ooo."], x, y, { o: "ink", l: "stoneLight", b: "stoneBright", s: "stone", d: "stoneDark" });
    p.rect(10, 19, 4, 2, "wood"); p.rect(12, 8, 1, 8, "gold");
    p.rect(13, 9, 6, 4, "red"); p.rect(13, 9, 5, 1, "redLight");
  } else if (kind === "barracks") {
    stoneBox(p, 3, 12, 18, 9);
    p.rect(2, 3, 20, 12, "ink"); p.rect(3, 4, 18, 10, "redDark");
    p.rect(3, 4, 18, 4, "redLight"); p.rect(3, 8, 18, 1, "red");
    p.rect(10, 17, 4, 4, "ink"); p.rect(11, 18, 2, 3, "woodLight");
    badge(p, 12, 8, look);
  } else {
    stoneBox(p, 4, 7, 16, 14);
    p.rect(7, 10, 10, 7, "ink"); p.rect(8, 11, 8, 5, "wood");
    for (const x of [4, 10, 16]) { p.rect(x, 5, 4, 3, "ink"); p.rect(x + 1, 6, 2, 1, "stoneBright"); }
    if (look === "spotters") {
      p.line(8, 16, 15, 9, "ink"); p.line(9, 16, 16, 9, "steelLight");
      p.rect(14, 8, 4, 3, "gold"); p.rect(14, 8, 3, 1, "goldLight");
    } else {
      p.rect(9, 14, 6, 3, "steelDark"); p.rect(9, 16, 6, 1, "steelLight");
      p.stamp(["..r..", ".rr..", "rryrr", "ryyyr", ".yyy."], 10, look === "signalFires" ? 6 : 8, { r: "redLight", y: "goldLight" });
    }
  }
  return p;
}

function flag(frame: number) {
  const p = new Drawing(...KEEP_FLAG.size);
  p.rect(3, 4, 2, 11, "ink"); p.rect(4, 5, 1, 9, "goldDark");
  const offsets = [[0, 0, 1, 1, 1, 0, 0, -1, -1], [0, 1, 1, 1, 0, 0, -1, -1, 0], [0, 1, 1, 0, 0, -1, -1, 0, 0], [0, 0, 0, -1, -1, -1, 0, 0, 1]][frame];
  for (let x = 5; x < 14; x++) {
    const y = 6 + offsets[x - 5];
    p.rect(x, y - 1, 1, 7, "ink"); p.rect(x, y, 1, 5, "red");
    p.dot(x, y, "redLight"); p.dot(x, y + 3, "gold");
  }
  p.rect(3, 6, 3, 3, "ink"); p.dot(4, 7, "goldLight");
  return p;
}

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const name = Buffer.from(type), out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); name.copy(out, 4); out.set(data, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), out.length - 4);
  return out;
}
function png(p: Drawing) {
  const header = Buffer.alloc(13); header.writeUInt32BE(p.w); header.writeUInt32BE(p.h, 4); header[8] = 8; header[9] = 6;
  const scan = Buffer.alloc((p.w * 4 + 1) * p.h);
  for (let y = 0; y < p.h; y++) scan.set(p.data.subarray(y * p.w * 4, (y + 1) * p.w * 4), y * (p.w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(scan, { level: 9 })), chunk("IEND", new Uint8Array())]);
}

export function buildingPngs() {
  const files = new Map<string, Buffer>();
  for (const [id, art] of Object.entries(BUILDING_ART)) {
    const [w, h] = art.size, sheet = new Drawing(w * art.looks.length, h * (art.stages + 1));
    const icons = new Drawing(BUILDING_ICON_SIZE * art.looks.length, BUILDING_ICON_SIZE);
    art.looks.forEach((look, col) => {
      const base = id === "keep" ? keep() : id === "watchTower" ? watchTower(look) : barracks(id === "barracksWide", look);
      for (let stage = 0; stage < art.stages; stage++) sheet.copy(damaged(base, stage, id === "keep"), col * w, stage * h);
      sheet.copy(rubble(w, h, art.kind === "barracks"), col * w, art.stages * h);
      icons.copy(icon(art.kind, look), col * BUILDING_ICON_SIZE, 0);
    });
    files.set(`${art.sheet}.png`, png(sheet));
    if (id !== "barracksWide") files.set(`${art.icon}.png`, png(icons));
  }
  const flags = new Drawing(KEEP_FLAG.size[0] * KEEP_FLAG.frames, KEEP_FLAG.size[1]);
  for (let i = 0; i < KEEP_FLAG.frames; i++) flags.copy(flag(i), i * KEEP_FLAG.size[0], 0);
  files.set(`${KEEP_FLAG.sheet}.png`, png(flags));
  const scaffold = new Drawing(8, 8);
  scaffold.stamp(["........", ".oooooo.", ".ollllo.", ".ol..do.", ".oll.do.", ".oldddo.", ".oooooo.", "........"], 0, 0,
    { o: "woodDark", l: "woodBright", d: "wood" });
  files.set("v2/defend/scaffold.png", png(scaffold));
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check"), root = new URL("../../public/assets/pixel/", import.meta.url);
  for (const [name, bytes] of buildingPngs()) {
    const file = new URL(name, root);
    if (check) {
      if (!readFileSync(file).equals(bytes)) throw new Error(`Sprite differs: ${name}. Run npm run sprites.`);
    } else { mkdirSync(dirname(fileURLToPath(file)), { recursive: true }); writeFileSync(file, bytes); }
    console.log(`${check ? "Verified" : "Wrote"} ${name}`);
  }
}
