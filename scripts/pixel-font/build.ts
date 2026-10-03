// Builds Alembic, the game's pixel font, from glyphs.txt into TrueType files
// (a regular and a bold, which thickens every stroke a pixel to the right).
// Each glyph's pixels are traced into square-cornered outlines, so the font
// scales crisply at any size that is a whole number of pixels to its pixel.
//
//   node --experimental-transform-types scripts/pixel-font/build.ts
//
// writes assets/fonts/Alembic/Alembic-Regular.ttf and Alembic-Bold.ttf.
// tests/pixel-font.test.ts checks the committed files match this output.

import { readFileSync, writeFileSync } from "node:fs";

/** Font units to a pixel; the em is ten pixels. */
const PX = 100;
const EM = 10 * PX;
/** Pixel rows above the baseline (the cap height). */
const CAP = 7;
/** Line metrics, Cinzel's, so a page laid out for it keeps its line heights. */
const ASCENT = 976, DESCENT = 372;
/** Blank pixels between letters, and the width of a space. */
const GAP = 1, SPACE = 3;

type Glyph = { code: number; rows: boolean[][]; width: number };

/** The glyphs of glyphs.txt. */
export function readGlyphs(text = readFileSync(new URL("./glyphs.txt", import.meta.url), "utf8")): Glyph[] {
  const glyphs: Glyph[] = [];
  let current: Glyph | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("#") && !current) continue;
    if (line.startsWith("= ")) {
      const name = line.slice(2);
      const code = name.startsWith("U+") ? parseInt(name.slice(2), 16) : name.codePointAt(0)!;
      current = { code, rows: [], width: 0 };
      glyphs.push(current);
    } else if (line === "") current = undefined;
    else if (current) {
      if (!/^[#.]+$/.test(line)) throw new Error(`bad row "${line}" in U+${current.code.toString(16)}`);
      current.rows.push([...line].map((c) => c === "#"));
      current.width = Math.max(current.width, line.length);
    }
  }
  return glyphs;
}

/** The bold cut: every inked pixel also inks the one to its right. */
function embolden(g: Glyph): Glyph {
  const width = g.width + 1;
  const rows = g.rows.map((r) => Array.from({ length: width }, (_, x) => !!r[x] || !!r[x - 1]));
  return { code: g.code, rows, width };
}

type Point = [number, number];

/** The outlines of a glyph's pixels in font units, clockwise around ink
 * (TrueType's winding), with straight runs merged into single edges. */
export function trace(rows: boolean[][]): Point[][] {
  const ink = (x: number, y: number) => !!rows[y]?.[x];
  // Directed edges between pixel corners, in a y-down grid: around each
  // inked pixel clockwise on screen, keeping only those on the ink's edge.
  const edges = new Map<string, Point[]>();
  const add = (a: Point, b: Point) => {
    const k = `${a[0]},${a[1]}`;
    (edges.get(k) ?? edges.set(k, []).get(k)!).push(b);
  };
  rows.forEach((row, y) => row.forEach((on, x) => {
    if (!on) return;
    if (!ink(x, y - 1)) add([x, y], [x + 1, y]);
    if (!ink(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
    if (!ink(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
    if (!ink(x - 1, y)) add([x, y + 1], [x, y]);
  }));
  const contours: Point[][] = [];
  const keys = [...edges.keys()].sort();
  for (const start of keys) {
    while (edges.get(start)?.length) {
      const loop: Point[] = [];
      let at = start.split(",").map(Number) as Point, dir: Point | undefined;
      for (;;) {
        const k = `${at[0]},${at[1]}`, outs = edges.get(k);
        if (!outs?.length) break;
        // Where two corners touch, turn right, keeping diagonal pixels apart.
        let i = 0;
        if (outs.length > 1 && dir) {
          const right: Point = [-dir[1], dir[0]];
          i = Math.max(0, outs.findIndex((o) => o[0] - at[0] === right[0] && o[1] - at[1] === right[1]));
        }
        const next = outs.splice(i, 1)[0];
        loop.push(at);
        dir = [next[0] - at[0], next[1] - at[1]];
        at = next;
      }
      // Drop corners in the middle of a straight run.
      const n = loop.length;
      const corners = loop.filter((p, j) => {
        const a = loop[(j + n - 1) % n], b = loop[(j + 1) % n];
        return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
      });
      // Rows count down from the cap line, so clockwise stays clockwise.
      contours.push(corners.map(([x, y]) => [x * PX, (CAP - y) * PX]));
    }
  }
  return contours;
}

/** A big-endian byte writer. */
class Bytes {
  private parts: number[] = [];
  u8(v: number) { this.parts.push(v & 255); return this; }
  u16(v: number) { return this.u8(v >> 8).u8(v); }
  i16(v: number) { return this.u16(v & 0xffff); }
  u32(v: number) { return this.u16(v >>> 16).u16(v & 0xffff); }
  tag(s: string) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
  raw(b: Uint8Array) { for (const v of b) this.u8(v); return this; }
  get length() { return this.parts.length; }
  done() { return Uint8Array.from(this.parts); }
}

function checksum(b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) sum = (sum + ((b[i] << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0))) >>> 0;
  return sum;
}

/** The TrueType font of `glyphs`, regular or bold. */
export function buildFont(source: Glyph[], bold: boolean): Uint8Array {
  const glyphs = [...(bold ? source.map(embolden) : source)].sort((a, b) => a.code - b.code);
  const style = bold ? "Bold" : "Regular", family = "Alembic";
  // Glyph 0 is .notdef, a hollow box; glyph 1 the space.
  const box: boolean[][] = Array.from({ length: CAP }, (_, y) => Array.from({ length: 5 }, (_, x) => y === 0 || y === CAP - 1 || x === 0 || x === 4));
  const all = [{ code: -1, rows: box, width: 5 }, { code: 32, rows: [], width: SPACE - GAP }, ...glyphs.filter((g) => g.code !== 32)];
  const outlines = all.map((g) => trace(g.rows));
  const advance = all.map((g) => (g.width + GAP) * PX);

  // glyf and loca.
  const glyf = new Bytes(), loca: number[] = [];
  let maxPoints = 0, maxContours = 0;
  const box4 = { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  const lsb: number[] = [], extents: number[] = [];
  for (const contours of outlines) {
    loca.push(glyf.length);
    const pts = contours.flat();
    if (!pts.length) { lsb.push(0); extents.push(0); continue; }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
    box4.xMin = Math.min(box4.xMin, xMin); box4.xMax = Math.max(box4.xMax, xMax);
    box4.yMin = Math.min(box4.yMin, yMin); box4.yMax = Math.max(box4.yMax, yMax);
    lsb.push(xMin); extents.push(xMax);
    maxPoints = Math.max(maxPoints, pts.length); maxContours = Math.max(maxContours, contours.length);
    glyf.i16(contours.length).i16(xMin).i16(yMin).i16(xMax).i16(yMax);
    let end = -1;
    for (const c of contours) glyf.u16((end += c.length));
    glyf.u16(0); // no instructions
    for (let i = 0; i < pts.length; i++) glyf.u8(1); // on-curve, full-size deltas
    let px = 0, py = 0;
    for (const [x] of pts) { glyf.i16(x - px); px = x; }
    for (const [, y] of pts) { glyf.i16(y - py); py = y; }
    while (glyf.length % 4) glyf.u8(0);
  }
  loca.push(glyf.length);
  const locaB = new Bytes();
  for (const o of loca) locaB.u32(o);

  const hmtx = new Bytes();
  all.forEach((_, i) => hmtx.u16(advance[i]).i16(lsb[i]));
  const advMax = Math.max(...advance);
  const minRsb = Math.min(...all.map((_, i) => (outlines[i].length ? advance[i] - extents[i] : advance[i])));

  const head = new Bytes()
    .u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5)
    .u16(0x000b).u16(EM)
    .u32(0).u32(0xe0000000).u32(0).u32(0xe0000000) // created, modified: fixed for reproducible builds
    .i16(box4.xMin).i16(box4.yMin).i16(box4.xMax).i16(box4.yMax)
    .u16(bold ? 1 : 0).u16(6).i16(2).i16(1).i16(0);

  const hhea = new Bytes()
    .u32(0x00010000).i16(ASCENT).i16(-DESCENT).i16(0)
    .u16(advMax).i16(Math.min(0, ...lsb)).i16(minRsb).i16(box4.xMax)
    .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(all.length);

  const maxp = new Bytes().u32(0x00010000).u16(all.length).u16(maxPoints).u16(maxContours)
    .u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

  // cmap: format 4, one segment a character.
  const mapped = all.map((g, i) => [g.code, i] as const).filter(([c]) => c >= 0);
  const segs = mapped.length + 1, log2 = Math.floor(Math.log2(segs)), range = 2 * 2 ** log2;
  const sub = new Bytes().u16(4).u16(16 + segs * 8).u16(0).u16(segs * 2).u16(range).u16(log2).u16(segs * 2 - range);
  for (const [c] of mapped) sub.u16(c);
  sub.u16(0xffff).u16(0);
  for (const [c] of mapped) sub.u16(c);
  sub.u16(0xffff);
  for (const [c, i] of mapped) sub.i16((i - c) & 0xffff);
  sub.i16(1);
  for (let i = 0; i < segs; i++) sub.u16(0);
  const cmap = new Bytes().u16(0).u16(2).u16(0).u16(3).u32(20).u16(3).u16(1).u32(20).raw(sub.done());

  const codes = mapped.map(([c]) => c);
  const avg = Math.round(advance.reduce((a, b) => a + b, 0) / advance.length);
  const os2 = new Bytes()
    .u16(4).i16(avg).u16(bold ? 700 : 400).u16(5).u16(0)
    .i16(650).i16(600).i16(0).i16(75).i16(650).i16(600).i16(0).i16(350)
    .i16(PX).i16(3 * PX).i16(0)
    .raw(new Uint8Array([2, 0, bold ? 8 : 6, 0, 0, 0, 0, 0, 0, 0]))
    .u32(0x80000003).u32(0x00002000).u32(0).u32(0).tag("ALMB")
    .u16(128 | (bold ? 32 : 64)).u16(Math.min(...codes)).u16(Math.min(0xffff, Math.max(...codes)))
    .i16(ASCENT).i16(-DESCENT).i16(0).u16(ASCENT).u16(DESCENT)
    .u32(1).u32(0).i16(5 * PX).i16(CAP * PX).u16(0).u16(32).u16(1);

  const strings: [number, string][] = [
    [0, "Made for Tower Defense"], [1, family], [2, style], [3, `${family}-${style} 1.0`],
    [4, `${family} ${style}`], [5, "Version 1.0"], [6, `${family}-${style}`],
  ];
  const storage = new Bytes(), name = new Bytes().u16(0).u16(strings.length).u16(6 + strings.length * 12);
  for (const [id, s] of strings) {
    const at = storage.length;
    for (const ch of s) storage.u16(ch.charCodeAt(0));
    name.u16(3).u16(1).u16(0x409).u16(id).u16(s.length * 2).u16(at);
  }
  name.raw(storage.done());

  const post = new Bytes().u32(0x00030000).u32(0).i16(-PX).i16(PX).u32(0).u32(0).u32(0).u32(0).u32(0);

  const tables: [string, Uint8Array][] = ([
    ["OS/2", os2.done()], ["cmap", cmap.done()], ["glyf", glyf.done()], ["head", head.done()],
    ["hhea", hhea.done()], ["hmtx", hmtx.done()], ["loca", locaB.done()], ["maxp", maxp.done()],
    ["name", name.done()], ["post", post.done()],
  ] as [string, Uint8Array][]);
  const n = tables.length, tlog = Math.floor(Math.log2(n)), trange = 16 * 2 ** tlog;
  const font = new Bytes().u32(0x00010000).u16(n).u16(trange).u16(tlog).u16(n * 16 - trange);
  let offset = 12 + n * 16;
  for (const [tag, data] of tables) {
    font.tag(tag).u32(checksum(data)).u32(offset).u32(data.length);
    offset += Math.ceil(data.length / 4) * 4;
  }
  let headAt = 0;
  for (const [tag, data] of tables) {
    if (tag === "head") headAt = font.length;
    font.raw(data);
    while (font.length % 4) font.u8(0);
  }
  const out = font.done();
  const adjust = (0xb1b0afba - checksum(out)) >>> 0;
  new DataView(out.buffer).setUint32(headAt + 8, adjust);
  return out;
}

export const FONT_FILES = { regular: "assets/fonts/Alembic/Alembic-Regular.ttf", bold: "assets/fonts/Alembic/Alembic-Bold.ttf" };

if (import.meta.url === `file://${process.argv[1]}`) {
  const glyphs = readGlyphs(), root = new URL("../../", import.meta.url);
  writeFileSync(new URL(FONT_FILES.regular, root), buildFont(glyphs, false));
  writeFileSync(new URL(FONT_FILES.bold, root), buildFont(glyphs, true));
  console.log(`Alembic: ${glyphs.length} glyphs`);
}
