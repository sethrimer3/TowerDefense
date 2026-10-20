/** Editable, native-resolution pixel drawings. Emits real RGBA PNGs without
 * image tools, fonts, resampling or runtime drawing dependencies.
 * Run: node --experimental-transform-types scripts/pixel-art/build.ts
 * --check verifies the committed delivery files byte for byte. */
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILDING_ART, BUILDING_ICON_SIZE, BUILDING_PALETTE, KEEP_FLAG, PALACE_SKY } from "../../src/defend/building-sprite-manifest.ts";

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

type HallKind = "meleeGuild" | "rangedGuild" | "archerBarracks";
type Ramp = readonly [Color, Color, Color];

function hallRoof(kind: HallKind, look: string): Ramp {
  if (kind === "meleeGuild") return ["wood", "woodLight", "woodBright"];
  if (kind === "rangedGuild" || look === "skirmishers") return ["steelDark", "steel", "steelLight"];
  if (look === "rangers") return ["greenDark", "green", "greenLight"];
  return ["woodDark", "wood", "woodLight"];
}

/** Fist, sling and bow emblems identify buildings without drawing people. */
function hallEmblem(p: Drawing, kind: HallKind, cx: number, cy: number) {
  if (kind === "meleeGuild") {
    p.stamp([".oooooo.", "oggggggo", "oglgllgo", "oggggggo", "ooggggoo", ".oggggo.", "..oggo..", "..oooo.."], cx - 4, cy - 4,
      { o: "ink", g: "gold", l: "goldLight" });
  } else if (kind === "rangedGuild") {
    p.stamp(["..oooo..", ".olbbso.", "..osso..", "o......o", ".w....w.", "..w..w..", "...ww...", "...oo..."], cx - 4, cy - 4,
      { o: "ink", l: "steelLight", b: "steelBright", s: "steel", w: "woodBright" });
  } else {
    p.stamp(["..oo....", ".ow.o...", "ow..o...", "ow..o...", "owlllooo", "ow..o...", ".ow.o...", "..oo...."], cx - 4, cy - 4,
      { o: "ink", w: "woodBright", l: "stoneBright" });
  }
}

function target(p: Drawing, x: number, y: number) {
  p.stamp([".ooo.", "ogbgo", "obrbo", "ogbgo", ".ooo."], x, y,
    { o: "ink", g: "woodBright", b: "stoneBright", r: "red" });
}

/** A short hall above an open training yard; source pixels never change
 * size between the roof, facade, fence and equipment. */
function trainingHall(kind: HallKind, look: string) {
  const p = new Drawing(32, 32), roof = hallRoof(kind, look);
  stoneBox(p, 4, 5, 24, 17);
  p.rect(3, 3, 26, 14, "ink"); p.rect(4, 4, 24, 12, roof[0]);
  p.rect(4, 4, 24, 5, roof[2]); p.rect(4, 9, 24, 1, roof[1]);
  // One short roof joint on each side, no noisy stone/tile stippling.
  p.rect(7, 5, 1, 3, roof[1]); p.rect(24, 11, 1, 3, roof[1]);
  p.rect(13, 17, 6, 5, "ink"); p.rect(14, 18, 4, 4, "wood");
  p.rect(14, 18, 4, 1, "woodLight"); p.rect(16, 19, 1, 3, "woodDark");
  for (const x of [7, 22]) { p.rect(x, 18, 3, 2, "ink"); p.dot(x + 1, 18, "stoneBright"); }
  // A quiet open yard and its two posts; the city ground shows through.
  p.rect(3, 22, 2, 7, "woodDark"); p.rect(27, 22, 2, 7, "woodDark");
  p.rect(3, 22, 1, 5, "woodLight"); p.rect(27, 22, 1, 5, "woodLight");
  p.rect(5, 28, 22, 1, "woodDark");
  hallEmblem(p, kind, 16, 10);
  if (kind === "meleeGuild") {
    p.rect(6, 23, 12, 5, "woodDark"); p.rect(7, 24, 10, 3, "stoneDark");
    p.rect(6, 23, 12, 1, "woodBright"); p.rect(6, 24, 1, 3, "woodLight");
    p.stamp(["..o..", ".ooo.", "olwwo", "olwwo", "olwwo", ".ooo.", "....."], 22, 22,
      { o: "ink", l: "woodLight", w: "wood" });
  } else if (kind === "rangedGuild") {
    p.stamp([".oo.oo.", "olboolo", ".oosso.", "..oo..."], 6, 24,
      { o: "ink", l: "stoneLight", b: "stoneBright", s: "stone" });
    p.rect(24, 25, 1, 3, "woodDark");
    p.stamp([".oo.", "owwo", "obwo", ".oo."], 23, 22,
      { o: "ink", w: "woodLight", b: "woodBright" });
  } else {
    // Rangers have two targets; Skirmishers have staggered target stations.
    target(p, look === "rangers" ? 21 : 22, 23);
    if (look === "rangers" || look === "skirmishers") target(p, 6, look === "skirmishers" ? 22 : 23);
    else {
      p.rect(7, 23, 1, 4, "woodDark"); p.rect(11, 23, 1, 4, "woodDark");
      p.rect(7, 24, 5, 1, "woodLight"); p.rect(8, 23, 1, 4, "stoneBright");
    }
    if (look === "skirmishers") { p.rect(16, 24, 2, 1, "stoneLight"); p.rect(19, 26, 2, 1, "stoneLight"); }
  }
  return p;
}

/** Native square parapet, distinct from the beacon tower's central flame. */
function archerTower(look: string) {
  const p = new Drawing(16, 16);
  stoneBox(p, 1, 2, 14, 13);
  p.rect(4, 5, 8, 7, "ink"); p.rect(5, 6, 6, 5, "wood"); p.rect(5, 6, 6, 1, "woodLight");
  for (const x of [2, 6, 10]) { p.rect(x, 1, 3, 2, "ink"); p.rect(x, 2, 2, 1, "stoneBright"); }
  if (look === "sharpshooters") {
    p.stamp(["...oo...", "..ollo..", ".olllmo.", "ollllmmo", "olmmmdmo", ".ommmdo.", "..oddo..", "...oo..."], 4, 4,
      { o: "ink", l: "greenLight", m: "green", d: "greenDark" });
    p.rect(7, 7, 2, 2, "gold"); p.dot(7, 7, "goldLight");
  } else {
    for (const x of [6, 8]) {
      p.rect(x, 7, 1, 4, "woodBright"); p.dot(x, 7, look === "fireArrows" ? "goldLight" : "stoneBright"); p.dot(x, 10, "red");
      if (look === "fireArrows") p.dot(x, 6, "redLight");
    }
    p.rect(10, 8, 1, 3, "woodDark");
    if (look === "fireArrows") {
      p.rect(9, 5, 3, 3, "ink"); p.dot(10, 5, "redLight"); p.dot(10, 6, "goldLight");
    } else {
      p.rect(9, 5, 3, 3, "ink"); p.dot(10, 6, "woodDark");
    }
  }
  return p;
}

/** Circular gun platform with a fixed north-facing carriage, as in the
 * legacy renderer. Twin barrels and the large mortar identify its paths. */
function gunPlatform(p: Drawing, x: number, y: number, size: number) {
  const radius = size / 2;
  for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) {
    const dx = xx + 0.5 - radius, dy = yy + 0.5 - radius, d = Math.hypot(dx, dy);
    if (d > radius) continue;
    p.dot(x + xx, y + yy, d > radius - 1 ? "ink" : d > radius - 3 ? dx + dy < -2 ? "stoneBright" : dx + dy < 2 ? "stoneLight" : "stone" : "stoneDark");
  }
}

function cannonTower(look: string) {
  const p = new Drawing(16, 16);
  gunPlatform(p, 1, 1, 14);
  p.rect(5, 7, 6, 5, "ink"); p.rect(6, 8, 4, 3, "wood"); p.rect(6, 8, 3, 1, "woodLight");
  if (look === "siegeShot") {
    p.stamp([".oooo.", "olllso", "olooso", "olooso", "osssso", ".oooo."], 5, 4,
      { o: "ink", l: "steelLight", s: "steel" });
    p.rect(10, 10, 2, 2, "steelDark"); p.dot(10, 10, "steelLight");
  } else {
    for (const x of look === "gunnery" ? [3, 9] : [6]) {
      p.rect(x, 3, 4, 7, "ink"); p.rect(x + 1, 4, 2, 5, "steel");
      p.rect(x + 1, 4, 1, 5, "steelLight"); p.rect(x + 1, 4, 2, 1, "steelDark");
    }
    p.rect(11, 11, 2, 2, "steelDark"); p.dot(11, 11, "steelLight");
    if (look === "gunnery") { p.dot(4, 11, "steelDark"); p.dot(5, 12, "steelLight"); }
  }
  return p;
}

type Specialist = "assassinDen" | "sniperLodge" | "musketHall";

function specialistRoof(kind: Specialist, look: string): Ramp {
  if (kind === "assassinDen") {
    if (look === "bloodletters") return ["redDark", "red", "redLight"];
    if (look === "venom") return ["greenDark", "green", "greenLight"];
    if (look === "shadowcloak") return ["ink", "steelDark", "steel"];
    return ["steelDark", "steel", "steelLight"];
  }
  if (kind === "sniperLodge") {
    if (look === "deadeye") return ["redDark", "red", "redLight"];
    if (look === "piercing") return ["steelDark", "steel", "steelBright"];
    return look ? ["steelDark", "steel", "steelLight"] : ["greenDark", "green", "greenLight"];
  }
  if (look === "grenadiers") return ["redDark", "red", "redLight"];
  if (look === "volleyFire") return ["steelDark", "steel", "steelLight"];
  if (look === "bayonets") return ["greenDark", "green", "greenLight"];
  if (look === "sharpMuskets") return ["greenDark", "green", "greenLight"];
  return ["woodDark", "wood", "woodLight"];
}

/** Eight-pixel insignia reused at native resolution on the world hall and
 * its separately composed square icon. No labels are baked into images. */
function specialistEmblem(p: Drawing, kind: Specialist, look: string, cx: number, cy: number) {
  const x = cx - 4, y = cy - 4;
  if (kind === "assassinDen") {
    if (look === "shadowcloak") p.stamp(["..oooo..", ".osssso.", "osddddso", "osddddso", "osgddgso", "osddddso", ".osssso.", "..oooo.."], x, y,
      { o: "ink", s: "steel", d: "steelDark", g: "greenLight" });
    else if (look === "venom") p.stamp(["..oooo..", "..obbo..", ".ooggoo.", "oggggggo", "oglllggo", "oglllggo", ".oggggo.", "..oooo.."], x, y,
      { o: "ink", b: "stoneBright", g: "green", l: "greenLight" });
    else if (look === "headhunters") p.stamp(["..oooo..", ".obbbbo.", "obobbobo", "obobbobo", "obbbbbbo", ".obobbo.", "..obbo..", "..oooo.."], x, y,
      { o: "ink", b: "stoneBright" });
    else p.stamp(["...oo...", "..obbo..", "..obbo..", "..obbo..", ".oooooo.", "..oggo..", "..oggo..", "...oo..."], x, y,
      { o: "ink", b: "steelBright", g: "gold" });
  } else if (kind === "sniperLodge") {
    if (look === "deadeye") p.stamp(["........", "..oooo..", ".obbbbo.", "obgoogbo", ".obbbbo.", "..oooo..", "........", "........"], x, y,
      { o: "ink", b: "stoneBright", g: "greenLight" });
    else if (look === "piercing") p.stamp(["....oo..", "...obbo.", "ggggbbbo", "ggggbbbo", "...obbo.", "....oo..", "........", "........"], x, y,
      { o: "ink", b: "steelBright", g: "gold" });
    else if (look === "marksmen") p.stamp(["........", ".oooooo.", "ogggglgo", "ogggglgo", ".oooooo.", "...oo...", "..o..o..", "........"], x, y,
      { o: "ink", g: "gold", l: "goldLight" });
    else if (look === "ricochet") p.stamp(["o......o", ".g....g.", "..g..g..", "...gg...", "..g..g..", ".g....g.", "o......o", "........"], x, y,
      { o: "ink", g: "gold" });
    else p.stamp(["...oo...", "..obbo..", ".ob..bo.", "ob.oo.bo", "ob.oo.bo", ".ob..bo.", "..obbo..", "...oo..."], x, y,
      { o: "ink", b: look === "suppressors" ? "stoneBright" : "gold" });
  } else {
    if (look === "grenadiers") p.stamp([".....y..", "....w...", "..oooo..", ".osssso.", "osllllso", "osssssso", ".osssso.", "..oooo.."], x, y,
      { o: "ink", s: "steelDark", l: "steelLight", y: "goldLight", w: "woodLight" });
    else if (look === "volleyFire") {
      p.line(x + 1, y + 1, x + 6, y + 6, "ink"); p.line(x + 6, y + 1, x + 1, y + 6, "ink");
      p.line(x + 1, y + 1, x + 3, y + 3, "steelLight"); p.line(x + 6, y + 1, x + 4, y + 3, "steelLight");
      p.line(x + 3, y + 3, x + 6, y + 6, "woodLight"); p.line(x + 4, y + 3, x + 1, y + 6, "woodLight"); p.rect(x + 3, y + 3, 2, 1, "gold");
    } else if (look === "sharpMuskets") p.stamp(["...oo...", "..obbo..", ".ob..bo.", "ob.oo.bo", "ob.oo.bo", ".ob..bo.", "..obbo..", "...oo..."], x, y,
      { o: "ink", b: "gold" });
    else if (look === "bayonets") p.stamp(["...oo...", "..obbo..", "..obbo..", "..obbo..", ".oooooo.", "..owwo..", "..owwo..", "...oo..."], x, y,
      { o: "ink", b: "steelBright", w: "woodLight" });
    else p.stamp(["...r....", ".r.y..r.", "..ryyr..", "ryyyyyr.", "..ryyr..", ".r.y..r.", "...r....", "........"], x, y,
      { r: "redLight", y: "goldLight" });
  }
}

/** Explicit world and UI layouts retain one-pixel material edges. Wide
 * musket halls get more yard space rather than stretched square pixels. */
function specialistHall(kind: Specialist, look: string, ui = false) {
  const p = new Drawing(ui ? 24 : kind === "musketHall" ? 48 : 32, ui ? 24 : 32), roof = specialistRoof(kind, look);
  const cx = p.w / 2;
  if (ui) {
    stoneBox(p, 3, 9, 18, 9);
    p.rect(2, 3, 20, 11, "ink"); p.rect(3, 4, 18, 9, roof[0]);
    p.rect(3, 4, 18, 4, roof[2]); p.rect(3, 8, 18, 1, roof[1]);
    p.rect(10, 14, 4, 4, "ink"); p.rect(11, 15, 2, 3, "woodLight");
  } else {
    stoneBox(p, 4, 5, p.w - 8, 17);
    p.rect(3, 3, p.w - 6, 14, "ink"); p.rect(4, 4, p.w - 8, 12, roof[0]);
    p.rect(4, 4, p.w - 8, 5, roof[2]); p.rect(4, 9, p.w - 8, 1, roof[1]);
    p.rect(cx - 3, 17, 6, 5, "ink"); p.rect(cx - 2, 18, 4, 4, "wood");
    p.rect(cx - 2, 18, 4, 1, "woodLight"); p.rect(cx, 19, 1, 3, "woodDark");
    for (const x of [7, p.w - 10]) { p.rect(x, 18, 3, 2, "ink"); p.dot(x + 1, 18, "stoneBright"); }
    p.rect(3, 22, 2, 7, "woodDark"); p.rect(p.w - 5, 22, 2, 7, "woodDark");
    p.rect(5, 28, p.w - 10, 1, "woodDark");
  }
  specialistEmblem(p, kind, look, cx, ui ? 8 : 10);
  const y = ui ? 19 : 24, left = ui ? 4 : 6, right = ui ? 18 : p.w - 9;
  if (kind === "assassinDen") {
    if (look === "venom") {
      p.rect(left, y, 5, 3, "ink"); p.rect(left + 1, y, 3, 1, "greenLight"); p.rect(left + 1, y + 1, 3, 1, "green");
    } else {
      p.rect(left + 2, y - 1, 1, 4, "woodLight"); p.rect(left, y, 5, 1, "woodLight");
      p.dot(left + 2, y, look === "bloodletters" ? "redLight" : "stoneBright");
    }
    p.rect(right, y - 1, 4, 4, "woodDark");
    if (look === "headhunters") { p.rect(right + 1, y, 2, 2, "stoneBright"); p.dot(right + 1, y + 1, "ink"); }
    else { p.rect(right + 1, y, 2, 1, look === "shadowcloak" ? "steel" : "steelBright"); p.rect(right + 1, y + 2, 2, 1, "steelBright"); }
  } else if (kind === "sniperLodge") {
    p.rect(left, y, 5, 2, "woodLight"); p.rect(left, y + 1, 5, 1, "woodDark");
    if (look === "suppressors") p.rect(left + 1, y - 2, 5, 1, "woodLight");
    p.rect(right, y - 1, 3, 3, "ink"); p.dot(right + 1, y, look === "ricochet" ? "steelLight" : "stoneBright");
    if (look === "marksmen") { p.rect(right - 4, y, 3, 3, "ink"); p.dot(right - 3, y + 1, "stoneBright"); }
    if (look === "deadeye") { p.rect(left + 1, y - 2, 3, 1, "woodDark"); p.dot(left + 2, y - 1, "stoneBright"); }
    if (look === "piercing") { p.rect(left, y - 2, 5, 1, "steelLight"); p.dot(left + 2, y - 1, "steelDark"); }
    if (!ui) { p.rect(cx - 2, y + 2, 2, 1, "stoneDark"); p.rect(cx + 2, y + 2, 2, 1, "stoneDark"); }
  } else {
    for (const x of ui ? [left] : [left, left + 6]) {
      p.rect(x, y - 1, 4, 4, "ink"); p.rect(x + 1, y, 2, 2, look === "grenadiers" ? "steelDark" : "woodLight");
      p.rect(x + 1, y, 2, 1, look === "grenadiers" ? "steelLight" : "woodDark");
    }
    if (look === "volleyFire") {
      p.rect(right - 1, y + 1, 6, 1, "woodLight");
      for (const x of [right, right + 2]) p.rect(x, y - 2, 1, 5, "steelLight");
    } else if (look === "sharpMuskets") {
      p.rect(right, y - 1, 4, 4, "ink"); p.rect(right + 1, y, 2, 2, "stoneBright"); p.dot(right + 1, y + 1, "gold");
      p.rect(left + 1, y - 2, 4, 1, "steelLight");
    } else if (look === "bayonets") {
      p.rect(right + 1, y - 1, 1, 4, "woodLight"); p.rect(right - 1, y, 5, 1, "woodLight"); p.dot(right + 1, y, "steelBright");
    } else {
      p.rect(right, y, 4, 2, "ink"); p.rect(right + 1, y, 2, 1, look === "grenadiers" ? "goldLight" : "stoneDark");
    }
  }
  return p;
}

type GunnerBuilding = "gunHall" | "gunNest" | "gatlingNest" | "rocketBattery" | "revolutionary";

function gunnerRoof(kind: GunnerBuilding, look: string): Ramp {
  if (kind === "gunHall") return look === "quickdraw" ? ["redDark", "red", "redLight"] : ["steelDark", "steel", "steelLight"];
  if (kind === "gunNest") return look === "beltFeed" ? ["steelDark", "steel", "steelLight"]
    : look === "tripod" ? ["woodDark", "wood", "woodLight"] : ["greenDark", "green", "greenLight"];
  if (kind === "gatlingNest") return look === "overdrive" ? ["redDark", "red", "redLight"]
    : look === "stoppingPower" ? ["frostDark", "frost", "frostLight"] : look === "gunShield" ? ["steelDark", "steel", "steelLight"] : ["goldDark", "gold", "goldLight"];
  return look === "clusterRockets" ? ["steelDark", "steel", "steelLight"] : look === "salvoRacks" ? ["greenDark", "green", "greenLight"] : ["redDark", "red", "redLight"];
}

/** Small building signs; these are equipment on roofs, never troop art. */
function gunnerSign(p: Drawing, kind: GunnerBuilding, look: string, x: number, y: number) {
  if (kind === "gunHall") {
    p.stamp(["........", ".oooooo.", ".obbbbbo", ".owwooo.", ".owwo...", ".oooo...", "........", "........"], x, y,
      { o: "ink", b: look === "duelists" ? "gold" : "steelLight", w: "woodLight" });
    if (look === "quickdraw") {
      p.rect(x + 5, y + 5, 3, 1, "steelLight"); p.rect(x + 6, y + 6, 2, 1, "woodLight");
    }
  } else if (kind === "gunNest") {
    p.stamp(["........", "...ooo..", ".oobbbbo", "obbbbbbo", ".oowooo.", "...w....", "..w.w...", "........"], x, y,
      { o: "ink", b: "steelLight", w: "woodLight" });
    if (look === "beltFeed") { p.rect(x + 1, y + 4, 2, 3, "gold"); p.dot(x + 2, y + 5, "ink"); }
  } else {
    const rocket = (rx: number, ry: number) => p.stamp([".o.", "obo", "obo", "ogo", ".o."], rx, ry,
      { o: "ink", b: "steelLight", g: "gold" });
    if (look === "clusterRockets") { rocket(x, y + 2); rocket(x + 3, y); rocket(x + 5, y + 2); }
    else rocket(x + 3, y + 1);
  }
}

function sandbagLine(p: Drawing, x: number, y: number, width: number, color: Color = "woodLight") {
  p.rect(x, y, width, 3, "ink"); p.rect(x + 1, y, width - 2, 1, color); p.rect(x + 1, y + 1, width - 2, 1, "woodDark");
  for (let xx = x + 4; xx < x + width - 1; xx += 4) p.dot(xx, y, "woodDark");
}

/** Hall, canvas nest and battery share materials but get distinct roof and
 * yard compositions at 32px world / 24px UI, without shrinking source art. */
function gunnerHall(kind: GunnerBuilding, look: string, ui = false) {
  const p = new Drawing(ui ? 24 : 32, ui ? 24 : 32), edge = ui ? 2 : 3, n = p.w - edge * 2, roof = gunnerRoof(kind, look);
  stoneBox(p, edge + 1, edge + 4, n - 2, ui ? 13 : 18);
  p.rect(edge, edge, n, ui ? 11 : 15, "ink");
  p.rect(edge + 1, edge + 1, n - 2, ui ? 9 : 13, roof[0]);
  p.rect(edge + 1, edge + 1, n - 2, ui ? 4 : 6, roof[2]);
  p.rect(edge + 1, edge + (ui ? 5 : 7), n - 2, 1, roof[1]);
  const doorY = ui ? 14 : 18, yardY = ui ? 20 : 26;
  p.rect(p.w / 2 - 2, doorY, 4, 4, "ink"); p.rect(p.w / 2 - 1, doorY + 1, 2, 3, "woodLight");
  gunnerSign(p, kind, look, p.w / 2 - 4, ui ? 4 : 6);
  if (kind === "gunNest") {
    // A single tent seam and sandbags, keeping the canvas quiet.
    p.rect(edge + 2, edge + 2, 1, ui ? 7 : 11, roof[1]);
    sandbagLine(p, edge, yardY - 1, n);
    if (look === "tripod") {
      p.line(edge + 5, yardY - 4, edge + 3, yardY - 1, "woodLight");
      p.line(edge + 5, yardY - 4, edge + 7, yardY - 1, "woodLight"); p.rect(edge + 3, yardY - 5, 6, 1, "steelLight");
    } else {
      p.rect(edge + 3, yardY - 4, 4, 3, "ink"); p.rect(edge + 4, yardY - 3, 2, 1, "woodLight");
      if (look === "beltFeed") { p.rect(p.w - edge - 7, yardY - 4, 4, 1, "gold"); p.dot(p.w - edge - 5, yardY - 3, "gold"); }
    }
  } else if (kind === "rocketBattery") {
    p.rect(edge + 1, yardY - 4, n - 2, 6, "ink");
    p.rect(edge + 2, yardY - 3, n - 4, 4, "stoneDark");
    for (const offset of look === "salvoRacks" ? [0, 5] : [0]) {
      const x = edge + 3 + offset;
      p.rect(x, yardY - 2, 4, 2, "woodDark");
      p.line(x, yardY - 2, x + 3, yardY - 5, "steelLight"); p.dot(x + 3, yardY - 5, "gold");
    }
    if (look === "clusterRockets") for (const dx of [0, 3, 6]) p.dot(p.w - edge - 8 + dx, yardY, "gold");
  } else {
    p.rect(edge, yardY - 1, n, 2, "woodDark");
    if (look === "duelists") {
      for (const x of [edge + 2, p.w - edge - 3]) { p.rect(x, yardY - 3, 1, 3, "woodLight"); p.dot(x, yardY - 3, "gold"); }
      p.rect(p.w / 2 - 2, yardY - 1, 4, 1, "stoneBright");
    } else for (let x = edge + 3; x < p.w - edge - 3; x += look === "quickdraw" ? 4 : 8) {
      p.rect(x, yardY - 3, 2, 2, "steelLight"); p.dot(x, yardY - 3, "stoneBright");
    }
  }
  return p;
}

/** Open emplacement: broad carriage, a brass base and a multi-barrel gun.
 * The shield is a plate, Overdrive has hot tips, Stopping power a wide muzzle. */
function gatlingEmplacement(look: string, ui = false) {
  const p = new Drawing(ui ? 24 : 32, ui ? 24 : 32), e = ui ? 2 : 3, n = p.w - e * 2, roof = gunnerRoof("gatlingNest", look), cx = p.w / 2, cy = ui ? 11 : 15;
  stoneBox(p, e, e + 2, n, n - 2);
  p.rect(e + 2, e + 4, n - 4, n - 7, roof[0]); p.rect(e + 2, e + 4, n - 4, 2, roof[2]);
  p.rect(e + 2, e + 6, 1, n - 9, roof[1]);
  sandbagLine(p, e, p.h - e - 3, n);
  for (const x of [cx - 6, cx + 3]) { p.rect(x, cy + 1, 3, 5, "ink"); p.rect(x + 1, cy + 2, 1, 3, "woodLight"); }
  p.rect(cx - 5, cy, 10, 4, "ink"); p.rect(cx - 4, cy + 1, 8, 2, "gold");
  for (const dy of [-2, 0, 2]) {
    p.rect(cx - 3, cy + dy - 1, ui ? 11 : 13, 2, "ink");
    p.rect(cx - 2, cy + dy - 1, ui ? 9 : 11, 1, "steelLight");
    if (look === "overdrive") p.dot(cx + (ui ? 6 : 8), cy + dy - 1, "redLight");
  }
  if (look === "gunShield") {
    p.rect(cx + 1, cy - 5, 4, 11, "ink"); p.rect(cx + 2, cy - 4, 2, 9, "steelLight");
    p.rect(cx + 2, cy - 1, 2, 2, "ink");
    for (const y of [cy - 3, cy + 3]) p.dot(cx + 2, y, "gold");
  }
  if (look === "stoppingPower") {
    p.rect(cx + (ui ? 6 : 8), cy - 4, 2, 7, "ink"); p.rect(cx + (ui ? 6 : 8), cy - 3, 1, 5, "steelLight");
  }
  return p;
}

/** Quiet gunmetal roof, inset cyan conduit and sensor with three perches.
 * No baked lasers: those remain existing gameplay overlay effects. */
function revolutionary(ui = false) {
  const p = new Drawing(ui ? 24 : 32, ui ? 24 : 32), e = ui ? 2 : 3, n = p.w - e * 2, cx = p.w / 2, cy = p.h / 2;
  p.rect(e, e, n, n, "ink"); p.rect(e + 1, e + 1, n - 2, n - 2, "steelDark");
  p.rect(e + 1, e + 1, n - 2, 2, "steelLight"); p.rect(e + 1, e + 3, 2, n - 4, "steel");
  const inset = e + 4, span = p.w - inset * 2;
  p.rect(inset, inset, span, span, "frostDark"); p.rect(inset + 1, inset + 1, span - 2, span - 2, "steelDark");
  p.rect(inset, inset, span, 1, "frost"); p.rect(inset, inset, 1, span, "frost");
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1]]) {
    const x = dx < 0 ? e + 3 : p.w - e - 7, y = dy < 0 ? e + 3 : p.h - e - 7;
    p.rect(x, y, 4, 4, "ink"); p.rect(x + 1, y + 1, 2, 2, "steelLight");
    p.line(x + 2, y + 2, x + 2 + dx * 3, y + 2 + dy * 3, "frostLight");
  }
  p.stamp(["..oooo..", ".olllso.", "olsssddo", "olsffddo", "olsffddo", "osdddddo", ".oddddo.", "..oooo.."], cx - 4, cy - 4,
    { o: "ink", l: "steelLight", s: "steel", d: "steelDark", f: "frostLight" });
  p.rect(e + 3, p.h - e - 7, 2, 4, "ink"); p.dot(e + 3, p.h - e - 7, "redLight");
  p.rect(cx - 3, p.h - e - 3, 6, 2, "ink"); p.rect(cx - 2, p.h - e - 3, 4, 1, "frost");
  return p;
}

/** Flat, discrete bands and a one-pixel rim keep rounded masonry clean. */
function oval(p: Drawing, cx: number, cy: number, rx: number, ry: number, ramp: Ramp) {
  for (let y = Math.floor(cy - ry); y < cy + ry; y++) for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx / (rx * rx) + dy * dy / (ry * ry) > 1) continue;
    const rim = dx * dx / ((rx - 1) ** 2) + dy * dy / ((ry - 1) ** 2) > 1;
    p.dot(x, y, rim ? "ink" : dx / rx + dy / ry < -0.35 ? ramp[2] : dx / rx + dy / ry > 0.5 ? ramp[0] : ramp[1]);
  }
}

function palace(compact: boolean, look: string, ui = false) {
  const p = new Drawing(ui ? 24 : compact ? 32 : 48, ui ? 24 : 48), e = ui ? 2 : 3, n = p.w - e * 2;
  stoneBox(p, e, e, n, p.h - e * 2);
  const inner = ui ? 4 : 7;
  p.rect(inner, inner, p.w - inner * 2, p.h - inner * 2, "ink");
  p.rect(inner + 1, inner + 1, p.w - inner * 2 - 2, p.h - inner * 2 - 2, "stoneBright");
  p.rect(inner + 1, inner + 1, p.w - inner * 2 - 2, 1, "goldLight");
  p.rect(p.w - inner - 2, inner + 2, 1, p.h - inner * 2 - 3, "goldDark");
  // Regular columns with quiet gaps; compact has fewer, at the same density.
  if (!ui) for (let y = 10; y < p.h - 9; y += 6) for (const x of [5, p.w - 7]) {
    p.rect(x, y, 2, 3, "stoneDark"); p.rect(x, y, 1, 2, "stoneBright");
  }
  const cx = p.w / 2, cy = ui ? 10 : 21, radius = ui ? 6 : compact ? 9 : 13;
  if (compact && !ui) {
    p.rect(cx - 5, 10, 10, 26, "goldDark"); p.rect(cx - 4, 11, 8, 24, "stoneLight");
    p.rect(cx - 1, 11, 1, 24, "goldLight");
  }
  oval(p, cx, cy, radius, radius, ["stone", "stoneLight", "stoneBright"]);
  p.rect(cx - 1, cy - radius + 2, 1, radius * 2 - 4, "gold");
  p.rect(cx - 1, cy - 1, 2, 2, "goldLight");
  const stepY = ui ? 18 : 38;
  p.rect(cx - (ui ? 5 : 9), stepY, ui ? 10 : 18, ui ? 3 : 5, "stoneLight");
  p.rect(cx - (ui ? 5 : 9), stepY + 1, ui ? 10 : 18, 1, "stoneBright");
  p.stamp(["o.......o", "og.....go", ".oggoggo.", "..ogggo..", "...ooo..."], cx - 4, stepY - 2,
    { o: "ink", g: "gold" });
  const cloudInset = e + (ui ? 3 : 5);
  if (look === "cloudborne") for (const [x, y] of [[cloudInset, e + 4], [p.w - cloudInset, e + 4], [cloudInset, p.h - e - 4], [p.w - cloudInset, p.h - e - 4]]) {
    oval(p, x, y, ui ? 3 : 5, ui ? 3 : 4, ["frost", "frostLight", "bright"]);
  }
  return p;
}

function darkTurret(p: Drawing, x: number, y: number, n: number) {
  p.rect(x, y, n, n, "ink"); p.rect(x + 1, y + 1, n - 2, n - 2, "steelDark");
  p.rect(x + 1, y + 1, n - 2, 1, "steelLight"); p.rect(x + 1, y + 2, 1, n - 3, "steel");
  const c = Math.floor(n / 2);
  p.rect(x + c - 1, y + c - 1, 3, 3, "redDark"); p.dot(x + c, y + c - 1, "redLight"); p.dot(x + c, y + c, "red");
}

function darkKeep(compact: boolean, ui = false) {
  const n = ui ? 24 : compact ? 48 : 96, p = new Drawing(n, n), e = ui ? 2 : 3, wall = ui ? 3 : compact ? 5 : 8;
  p.rect(e, e, n - e * 2, n - e * 2, "ink");
  p.rect(e + 1, e + 1, n - e * 2 - 2, n - e * 2 - 2, "steelDark");
  p.rect(e + 1, e + 1, n - e * 2 - 2, 2, "steelLight"); p.rect(e + 1, e + 3, 2, n - e * 2 - 4, "steel");
  p.rect(e + wall, e + wall, n - (e + wall) * 2, n - (e + wall) * 2, "ink");
  p.rect(e + wall + 1, e + wall + 1, n - (e + wall) * 2 - 2, n - (e + wall) * 2 - 2, "arcaneDark");
  const c = n / 2, r = ui ? 5 : compact ? 11 : 25;
  // Four cardinal ruby marks and a quiet octagonal rune enclosure.
  const corners = [[c - r, c - r / 2], [c - r / 2, c - r], [c + r / 2, c - r], [c + r, c - r / 2], [c + r, c + r / 2], [c + r / 2, c + r], [c - r / 2, c + r], [c - r, c + r / 2]].map(([x, y]) => [Math.round(x), Math.round(y)]);
  for (let i = 0; i < corners.length; i++) { const a = corners[i], b = corners[(i + 1) % corners.length]; p.line(a[0], a[1], b[0], b[1], "redDark"); }
  if (!ui) for (const [dx, dy] of [[0, -r], [r, 0], [0, r], [-r, 0]]) p.rect(c + dx - 1, c + dy - 1, 2, 2, "redLight");
  const spire = ui ? 4 : compact ? 8 : 17;
  for (let y = -spire; y <= spire; y++) for (let x = -spire; x <= spire; x++) {
    const d = Math.abs(x) + Math.abs(y);
    if (d <= spire) p.dot(c + x, c + y, d === spire ? "ink" : x < 0 && y < 0 ? "arcaneLight" : x < 0 ? "arcane" : "steelDark");
  }
  p.rect(c - 1, c - 2, 3, 4, "ink"); p.rect(c, c - 1, 1, 2, "redLight");
  const t = ui ? 5 : compact ? 10 : 18;
  for (const [x, y] of [[e, e], [n - e - t, e], [e, n - e - t], [n - e - t, n - e - t]]) darkTurret(p, x, y, t);
  p.rect(c - (ui ? 2 : 4), n - e - wall, ui ? 4 : 8, wall, "ink");
  p.rect(c - (ui ? 1 : 3), n - e - wall + 1, ui ? 2 : 6, wall - 1, "redDark");
  if (!ui) p.rect(c - 2, n - e - wall + 1, 4, 1, "red");
  return p;
}

/** Native clouds share the palace's center; silhouette is fixed across
 * lots, with sparse bands and no procedural speckle. */
function palaceClouds(w: number, h: number) {
  const p = new Drawing(w, h), ramp: Ramp = ["frost", "frostLight", "bright"];
  oval(p, w / 2, h / 2, w / 2 - 5, h / 2 - 5, ramp);
  for (const [x, y, rx, ry] of [[w / 2 - 13, 18, 12, 11], [w / 2 + 13, 18, 12, 11], [15, h / 2, 11, 14], [w - 15, h / 2, 11, 14], [w / 2 - 12, h - 18, 14, 12], [w / 2 + 12, h - 18, 14, 12]]) oval(p, x, y, rx, ry, ramp);
  return p;
}

function palaceMooring(w: number, h: number) {
  const p = new Drawing(w, h), cx = w / 2, cy = h / 2;
  p.rect(3, 3, w - 6, h - 6, "woodDark"); p.rect(4, 4, w - 8, h - 8, "wood");
  oval(p, cx, cy, w / 2 - 5, h / 2 - 5, ["stone", "stoneLight", "stoneBright"]);
  oval(p, cx, cy, w / 2 - 8, h / 2 - 8, ["woodDark", "wood", "woodLight"]);
  for (let i = -5; i <= 5; i++) { p.dot(cx + i, cy, "gold"); p.dot(cx, cy + i, "gold"); }
  p.rect(cx - 1, cy - 1, 3, 3, "goldLight");
  return p;
}

function wizardRoof(look: string): Ramp {
  return look === "pyromancy" ? ["redDark", "red", "redLight"] : look === "rime" ? ["frostDark", "frost", "frostLight"]
    : look === "storm" ? ["steelDark", "steel", "steelLight"] : ["arcaneDark", "arcane", "arcaneLight"];
}

function wizardTower(look: string, ui = false) {
  const p = new Drawing(ui ? 24 : 16, ui ? 24 : 16), roof = wizardRoof(look);
  gunPlatform(p, ui ? 2 : 1, ui ? 2 : 1, ui ? 20 : 14);
  const edge = ui ? 4 : 3, size = ui ? 16 : 10, cut = ui ? 4 : 2;
  for (let y = 0; y < size; y++) {
    // Rime's diamond, Storm's square and the base octagon are silhouettes,
    // not arbitrary bitmap rotations or per-frame canvas paths.
    const inset = look === "pyromancy" ? Math.floor((Math.abs(y + 0.5 - size / 2) + 0.5) / 2)
      : look === "rime" ? Math.min(size / 2 - 1, Math.abs(y + 0.5 - size / 2) - 0.5)
      : look === "storm" ? 0 : Math.max(0, cut - Math.min(y, size - 1 - y));
    const left = Math.max(0, inset), right = size - 1 - left;
    for (let x = left; x <= right; x++) {
      const border = x === left || x === right || y === 0 || y === size - 1;
      p.dot(edge + x, edge + y, border ? "ink" : x + y < size - 2 ? roof[2] : x < size / 2 ? roof[1] : roof[0]);
    }
  }
  const cx = p.w / 2, cy = p.h / 2;
  if (look === "pyromancy") p.stamp(["..r..", ".rr..", "rryrr", "ryyyr", ".yyy."], cx - 2, cy - 3, { r: "redLight", y: "goldLight" });
  else if (look === "rime") {
    p.rect(cx - 1, cy - 3, 2, 6, "frostLight"); p.rect(cx - 3, cy - 1, 6, 2, "frostLight");
    p.rect(cx - 1, cy - 1, 2, 2, "bright");
  } else if (look === "storm") p.stamp(["..yy.", ".yy..", "yyyy.", "..yy.", ".yy..", ".y..."], cx - 2, cy - 3, { y: "goldLight" });
  else { p.rect(cx - 1, cy - 1, 2, 2, "gold"); p.dot(cx - 1, cy - 1, "goldLight"); }
  p.rect(cx - 1, ui ? 19 : 12, 2, 2, "ink"); p.rect(cx - 1, ui ? 20 : 13, 2, 1, "woodLight");
  return p;
}

function fireWell(p: Drawing, cx: number, cy: number, look: string, ui: boolean) {
  const n = look === "pyroclasm" ? ui ? 10 : 12 : 8, radius = n / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x + 0.5 - radius, y + 0.5 - radius);
    if (d > radius) continue;
    p.dot(cx - radius + x, cy - radius + y, d > radius - 1 ? "ink" : d > radius - 2 ? x + y < n ? "goldLight" : "gold" : "ink");
  }
  if (look === "cinders") {
    for (const [x, y] of [[-2, 0], [1, -1], [0, 2]]) { p.dot(cx + x, cy + y, "redLight"); p.dot(cx + x + 1, cy + y, "goldLight"); }
  } else p.stamp(["..r..", ".rr..", "rryrr", "ryyyr", ".yyy."], cx - 2, cy - 3, { r: "redLight", y: "goldLight" });
}

function mageGuild(look: string, ui = false) {
  const p = new Drawing(ui ? 24 : 32, ui ? 24 : 48), cx = p.w / 2;
  if (ui) {
    stoneBox(p, 3, 9, 18, 13); p.rect(2, 3, 20, 13, "ink");
    p.rect(3, 4, 9, 11, look === "cinders" ? "steel" : look === "pyroclasm" ? "redLight" : "red");
    p.rect(12, 4, 9, 11, look === "cinders" ? "steelDark" : "redDark");
    p.rect(10, 17, 4, 5, "ink"); p.rect(11, 18, 2, 4, "woodLight");
    fireWell(p, 12, 9, look, true);
  } else {
    stoneBox(p, 4, 5, 24, 40); p.rect(3, 3, 26, 33, "ink");
    p.rect(4, 4, 12, 31, look === "cinders" ? "steel" : look === "pyroclasm" ? "redLight" : "red");
    p.rect(16, 4, 12, 31, look === "cinders" ? "steelDark" : "redDark");
    p.rect(13, 37, 6, 7, "ink"); p.rect(14, 38, 4, 6, "woodLight"); p.rect(16, 39, 1, 5, "woodDark");
    fireWell(p, cx, 20, look, false);
    for (const x of [8, 23]) { p.rect(x, 12, 1, 2, "gold"); p.dot(x + (x < cx ? 1 : -1), 13, "redLight"); }
  }
  for (const x of ui ? [5, 17] : [6, 23]) {
    const y = ui ? 17 : 37;
    p.rect(x, y, 3, ui ? 5 : 7, "ink"); p.rect(x + 1, y + 1, 1, ui ? 3 : 5, look === "cinders" ? "steelDark" : "red");
    p.dot(x + 1, y + 2, "goldLight");
  }
  return p;
}

function monsterBait(look: string, ui = false) {
  const p = new Drawing(ui ? 24 : 16, ui ? 24 : 16), x = ui ? 3 : 2, y = ui ? 6 : 3, w = ui ? 18 : 12, h = ui ? 15 : 11;
  p.rect(x, y, w, h, "ink"); p.rect(x + 1, y + 1, w - 2, h - 2, "wood");
  p.rect(x + 1, y + 1, w - 2, 1, "woodBright"); p.rect(x + 1, y + h - 3, w - 2, 2, "woodDark");
  const cx = p.w / 2;
  p.stamp([".rrrr.", "rlllrr", "rllrrr", ".rrr.."], cx - 3, ui ? 8 : 5,
    { r: "redDark", l: "redLight" });
  p.line(cx + 1, ui ? 11 : 8, cx + 4, ui ? 8 : 5, "stoneBright");
  if (look === "fortified") {
    for (const bx of [x + 1, x + w - 3]) { p.rect(bx, y + 1, 2, h - 2, "steelDark"); p.rect(bx, y + 1, 1, h - 3, "steelLight"); }
    p.rect(x + 1, y + h - 4, w - 2, 1, "steelLight");
  } else if (look === "oilSoaked") {
    p.rect(cx, ui ? 13 : 9, ui ? 7 : 5, ui ? 6 : 4, "ink");
    p.rect(cx + 1, ui ? 14 : 10, ui ? 5 : 3, 2, "steelDark");
    p.rect(cx + 1, ui ? 14 : 10, ui ? 4 : 2, 1, "steelLight");
    p.dot(cx + 2, ui ? 12 : 8, "goldLight");
  } else p.line(x + 2, y + h - 4, x + w - 3, y + h - 4, "woodLight");
  return p;
}

function baitRubble() {
  const p = new Drawing(16, 16);
  p.line(3, 8, 12, 12, "ink"); p.line(3, 9, 12, 13, "ink"); p.line(3, 8, 12, 12, "woodLight");
  p.line(6, 13, 10, 6, "ink"); p.line(5, 13, 9, 6, "wood");
  p.rect(6, 11, 4, 2, "redDark"); p.rect(7, 11, 2, 1, "redLight"); p.rect(10, 11, 2, 1, "stoneBright");
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

function rubble(w: number, h: number, roof?: Color) {
  const p = new Drawing(w, h);
  // A low, centered broken foundation plus a few legible clusters.
  p.rect(3, h - 7, w - 6, 3, "ink"); p.rect(4, h - 6, w - 8, 1, "stoneDark");
  for (const [x, y, ww, hh] of [[3, h - 12, 5, 6], [w - 9, h - 11, 6, 5], [w / 2 - 4, h - 14, 7, 8]]) {
    stoneBox(p, x, y, ww, hh);
  }
  p.rect(w / 2 - 5, h - 5, 5, 2, roof ?? "steelDark");
  if (roof) {
    p.line(w / 2 - 6, h - 11, w / 2 + 4, h - 4, "ink");
    p.line(w / 2 - 5, h - 11, w / 2 + 4, h - 5, "wood");
  }
  return p;
}

function trainingIcon(kind: HallKind, look: string) {
  const p = new Drawing(24, 24), roof = hallRoof(kind, look);
  stoneBox(p, 3, 9, 18, 9);
  p.rect(2, 3, 20, 11, "ink"); p.rect(3, 4, 18, 9, roof[0]);
  p.rect(3, 4, 18, 4, roof[2]); p.rect(3, 8, 18, 1, roof[1]);
  p.rect(10, 14, 4, 4, "ink"); p.rect(11, 15, 2, 3, "woodLight");
  hallEmblem(p, kind, 12, 8);
  if (kind === "meleeGuild") {
    p.rect(4, 19, 10, 3, "woodDark"); p.rect(5, 20, 8, 1, "stoneDark");
    p.rect(4, 19, 10, 1, "woodBright"); p.rect(18, 18, 3, 4, "ink");
    p.rect(19, 19, 1, 2, "woodLight");
  } else if (kind === "rangedGuild") {
    p.rect(4, 20, 5, 2, "ink"); p.rect(5, 20, 2, 1, "stoneBright");
    p.rect(18, 18, 3, 4, "ink"); p.rect(18, 19, 2, 2, "woodLight");
  } else {
    target(p, 16, 17);
    if (look === "rangers" || look === "skirmishers") target(p, 3, 17);
    else { p.rect(4, 18, 4, 3, "woodDark"); p.rect(5, 18, 1, 3, "woodBright"); }
  }
  return p;
}

function archerTowerIcon(look: string) {
  const p = new Drawing(24, 24);
  stoneBox(p, 4, 6, 16, 16);
  p.rect(7, 10, 10, 8, "ink"); p.rect(8, 11, 8, 6, "wood");
  p.rect(8, 11, 8, 1, "woodLight");
  for (const x of [4, 10, 16]) { p.rect(x, 4, 4, 3, "ink"); p.rect(x + 1, 5, 2, 1, "stoneBright"); }
  if (look === "sharpshooters") {
    const insets = [4, 3, 2, 1, 0, 0, 1, 2, 3, 4];
    for (let y = 7; y < 17; y++) for (let x = 7 + insets[y - 7]; x <= 16 - insets[y - 7]; x++) {
      const edge = x === 7 + insets[y - 7] || x === 16 - insets[y - 7] || y === 7 || y === 16;
      p.dot(x, y, edge ? "ink" : x + y < 23 ? "greenLight" : "greenDark");
    }
    p.rect(11, 11, 2, 2, "gold");
    p.line(9, 17, 15, 17, "woodLight"); p.dot(15, 17, "stoneBright");
  } else {
    for (const x of [10, 13]) {
      p.rect(x, 11, 1, 7, "woodLight"); p.dot(x, 11, look === "fireArrows" ? "goldLight" : "stoneBright"); p.rect(x - 1, 16, 2, 1, "red");
      if (look === "fireArrows") p.dot(x, 10, "redLight");
    }
    p.rect(8, 8, 4, 3, "ink"); p.rect(9, 9, 2, 1, look === "fireArrows" ? "redLight" : "wood");
    if (look === "fireArrows") p.stamp([".r.", "rrr", "ryr", ".y."], 9, 7, { r: "redLight", y: "goldLight" });
  }
  return p;
}

function cannonTowerIcon(look: string) {
  const p = new Drawing(24, 24);
  gunPlatform(p, 2, 2, 20);
  p.rect(7, 12, 10, 6, "ink"); p.rect(8, 13, 8, 4, "wood"); p.rect(8, 13, 7, 1, "woodLight");
  if (look === "siegeShot") {
    p.stamp(["..oooo..", ".olllso.", "olooooso", "olooooso", "olooooso", "osooooso", ".osssso.", "..oooo.."], 8, 7,
      { o: "ink", l: "steelLight", s: "steel" });
    p.rect(16, 16, 3, 3, "steelDark"); p.rect(16, 16, 2, 1, "steelLight");
  } else {
    const width = look === "gunnery" ? 5 : 6;
    for (const x of look === "gunnery" ? [6, 13] : [9]) {
      p.rect(x, 5, width, 11, "ink"); p.rect(x + 1, 6, width - 2, 9, "steel");
      p.rect(x + 1, 6, 1, 9, "steelLight"); p.rect(x + 1, 6, width - 2, 1, "steelDark");
    }
    p.rect(17, 17, 2, 2, "steelDark"); p.dot(17, 17, "steelLight");
  }
  return p;
}

/** Purpose-drawn 24px UI compositions rather than squashed world frames. */
function icon(kind: string, look: string) {
  if (kind === "valkyriePalace") return palace(false, look, true);
  if (kind === "darkKeep") return darkKeep(false, true);
  if (kind === "gunHall" || kind === "gunNest" || kind === "rocketBattery") return gunnerHall(kind, look, true);
  if (kind === "gatlingNest") return gatlingEmplacement(look, true);
  if (kind === "revolutionary") return revolutionary(true);
  if (kind === "assassinDen" || kind === "sniperLodge" || kind === "musketHall") return specialistHall(kind, look, true);
  if (kind === "wizardTower") return wizardTower(look, true);
  if (kind === "mageGuild") return mageGuild(look, true);
  if (kind === "monsterBait") return monsterBait(look, true);
  if (kind === "meleeGuild" || kind === "rangedGuild" || kind === "archerBarracks") return trainingIcon(kind, look);
  if (kind === "archerTower") return archerTowerIcon(look);
  if (kind === "cannonTower") return cannonTowerIcon(look);
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

const DRAW_BUILDING: Record<keyof typeof BUILDING_ART, (look: string) => Drawing> = {
  keep: () => keep(), barracks: look => barracks(false, look), barracksWide: look => barracks(true, look), watchTower,
  meleeGuild: look => trainingHall("meleeGuild", look), rangedGuild: look => trainingHall("rangedGuild", look),
  archerBarracks: look => trainingHall("archerBarracks", look), archerTower, cannonTower,
  assassinDen: look => specialistHall("assassinDen", look), sniperLodge: look => specialistHall("sniperLodge", look),
  musketHall: look => specialistHall("musketHall", look), wizardTower, mageGuild, monsterBait,
  gunHall: look => gunnerHall("gunHall", look), gunNest: look => gunnerHall("gunNest", look),
  rocketBattery: look => gunnerHall("rocketBattery", look), gatlingNest: gatlingEmplacement, revolutionary: () => revolutionary(),
  valkyriePalace: look => palace(false, look), valkyriePalaceCompact: look => palace(true, look),
  darkKeep: () => darkKeep(false), darkKeepCompact: () => darkKeep(true),
};

function rubbleRoof(kind: string): Color | undefined {
  if (kind === "barracks") return "redDark";
  if (kind === "meleeGuild") return "wood";
  if (kind === "rangedGuild") return "steelDark";
  if (kind === "archerBarracks" || kind === "archerTower") return "woodDark";
  if (kind === "assassinDen") return "steelDark";
  if (kind === "sniperLodge") return "greenDark";
  if (kind === "musketHall") return "woodDark";
  if (kind === "wizardTower") return "arcaneDark";
  if (kind === "mageGuild") return "redDark";
  if (kind === "gunHall" || kind === "revolutionary") return "steelDark";
  if (kind === "gunNest") return "greenDark";
  if (kind === "gatlingNest") return "goldDark";
  if (kind === "rocketBattery") return "redDark";
  if (kind === "valkyriePalace") return "goldDark";
  if (kind === "darkKeep") return "arcaneDark";
}

export function buildingPngs() {
  const files = new Map<string, Buffer>();
  for (const [id, art] of Object.entries(BUILDING_ART)) {
    const [w, h] = art.size, sheet = new Drawing(w * art.looks.length, h * (art.stages + 1));
    const icons = new Drawing(BUILDING_ICON_SIZE * art.looks.length, BUILDING_ICON_SIZE);
    art.looks.forEach((look, col) => {
      const base = DRAW_BUILDING[id as keyof typeof BUILDING_ART](look);
      for (let stage = 0; stage < art.stages; stage++) sheet.copy(damaged(base, stage, id === "keep"), col * w, stage * h);
      sheet.copy(art.kind === "monsterBait" ? baitRubble() : rubble(w, h, rubbleRoof(art.kind)), col * w, art.stages * h);
      icons.copy(icon(art.kind, look), col * BUILDING_ICON_SIZE, 0);
    });
    files.set(`${art.sheet}.png`, png(sheet));
    if (!files.has(`${art.icon}.png`)) files.set(`${art.icon}.png`, png(icons));
  }
  for (const art of PALACE_SKY) {
    const clouds = palaceClouds(...art.size), shadow = new Drawing(...art.size);
    for (let y = 0; y < shadow.h; y++) for (let x = 0; x < shadow.w; x++) if (clouds.data[(y * shadow.w + x) * 4 + 3] && (x + y) % 2 === 0) shadow.dot(x, y, "ink");
    files.set(`${art.clouds}.png`, png(clouds)); files.set(`${art.shadow}.png`, png(shadow));
    files.set(`${art.mooring}.png`, png(palaceMooring(art.footprint[0] * 8, art.footprint[1] * 8)));
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
