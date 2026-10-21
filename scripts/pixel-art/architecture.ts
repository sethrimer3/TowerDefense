/** Authored overhead architecture. Damage belongs to each roof/platform;
 * the ruin retains that building's plan instead of a shared debris icon. */
import { Drawing, type Color, type Ramp } from "./drawing.ts";

type Roof = { x: number; y: number; w: number; h: number; colors: Ramp };

/** Courses follow each roof plane. A whole tile shares its firing/weathering
 * variation; one-pixel overlaps and staggered joints supply the relief.
 * Coordinates belong to the intact roof, so damage never reshuffles texture. */
function roofTile(colors: Ramp, light: number, along: number, slope: number, small = false): Color {
  const course = Math.floor(slope / 3), offset = (course % 2) * 2;
  const tile = Math.floor((along + offset) / 4);
  const variation = (tile * 13 + course * 7 + Math.floor(tile / 3) * 3) % 17;
  const overlap = slope % 3 === 2;
  const joint = (along + offset) % 4 === 0 && slope % 3 === 1;
  if (colors[0] === "redDark") {
    if (small) return joint ? colors[0] : light > 0 ? variation < 4 ? "tileClay" : colors[2] : variation < 5 ? colors[1] : colors[0];
    if (light === 0) return overlap || joint ? colors[0] : variation < 5 ? colors[1] : "tileShade";
    if (overlap || joint) return light === 2 ? "tileClay" : colors[1];
    if (variation === 2) return "tileWorn";
    return light === 2 ? variation < 8 ? "tileSun" : colors[2] : variation < 5 ? "tileSun" : "tileClay";
  }
  if (colors[0] === "woodDark") {
    // Split shakes keep their longitudinal grain and staggered end joints.
    return overlap || joint ? colors[1] : light === 2 ? variation < 4 ? "woodBright" : colors[2] : light === 1 ? variation < 2 ? colors[1] : colors[2] : variation < 2 ? colors[2] : colors[1];
  }
  // Pale stone/slate chapel tiles use the same construction at cooler values.
  return overlap || joint ? "stone" : light > 0 ? variation < 5 ? "stoneLight" : "stoneBright" : variation < 5 ? "stoneLight" : "stone";
}

function wall(p: Drawing, x: number, y: number, w: number, h: number) {
  p.rect(x, y, w, h, "ink");
  if (w > h) { p.rect(x + 1, y, w - 2, 1, "stoneLight"); p.rect(x + 1, y + 1, w - 2, 1, "stoneDark"); }
  else { p.rect(x, y + 1, 1, h - 2, "stoneLight"); p.rect(x + 1, y + 1, 1, h - 2, "stoneDark"); }
}

function tiles(p: Drawing, x: number, y: number, colors: Ramp) {
  p.stamp([".dd..", "dllld", ".dmm.", "..dd."], x, y, { d: colors[0], m: colors[1], l: colors[2] });
}

function beam(p: Drawing, x: number, y: number, x1: number, y1: number) {
  p.line(x, y, x1, y1, "ink"); p.line(x, y - 1, x1, y1 - 1, "woodLight");
}

function roofSection(p: Drawing, x: number, y: number, w: number, h: number, colors: Ramp) {
  // A fallen, skewed panel retains several attached courses of roofing.
  for (let yy = 0; yy < h; yy++) {
    const shift = Math.floor(yy / 3), width = w - Math.floor(yy / 4);
    p.rect(x + shift, y + yy, width, 1, "ink");
    if (yy && yy < h - 1) for (let xx = 1; xx < width - 1; xx++) p.dot(x + shift + xx, y + yy, roofTile(colors, yy < h / 2 ? 1 : 0, xx, yy));
  }
  p.rect(x + 1, y + 1, Math.max(2, w - 3), 1, colors[2]);
}

/** Collapsing from the east eave exposes floorboards and broken rafters.
 * Each next stage grows the same breach, including the outside wall. */
function breach(x: number, y: number, w: number, h: number, stage: number) {
  if (!stage) return false;
  // One failed roof bay grows into an irregular collapse along the ridge.
  // Rotate the construction coordinates for a horizontal longhouse.
  const u = w < h ? x / w : y / h, v = w < h ? y / h : x / w;
  const radius = [0, 0.13, 0.29, 0.46][stage];
  const ragged = ((Math.floor(v * 29) * 7) % 5 - 2) * 0.025;
  return ((u - 0.89) / (radius * 1.65 + ragged)) ** 2 + ((v - 0.56) / radius) ** 2 < 1;

}

function longhouse(p: Drawing, r: Roof, stage: number, ruin: boolean, small = false) {
  const { x, y, w, h, colors } = r, rh = h - 2;
  p.rect(x + 1, y + 1, w - 2, h - 2, "woodDark");
  // Low foundations define the same room after the roof has gone.
  wall(p, x, y, w, 2); wall(p, x, y, 2, h);
  if (stage < 3 && !ruin) wall(p, x, y + h - 2, w, 2);
  else { wall(p, x, y + h - 2, 4, 2); wall(p, x + w - 4, y + h - 2, 4, 2); }
  if (stage < 2 && !ruin) wall(p, x + w - 2, y, 2, h);
  else { wall(p, x + w - 2, y, 2, 4); wall(p, x + w - 2, y + h - 5, 2, 5); }
  if (ruin) {
    p.rect(x + 2, y + 2, w - 4, h - 4, "woodDark");
    // Fallen ridge timbers follow this roof's long axis.
    if (h > w) {
      if (h > 25) {
        roofSection(p, x + 2, y + 3, w - 5, 8, colors);
        roofSection(p, x + 3, y + 17, w - 6, 7, colors);
        roofSection(p, x + 2, y + h - 12, w - 6, 6, colors);
      } else roofSection(p, x + 2, y + 4, Math.max(4, w - 5), 6, colors);
      beam(p, x + 3, y + 5, x + w - 4, y + 11);
      beam(p, x + w - 5, y + 13, x + 4, y + h - 4);
    } else {
      if (w > 25) {
        roofSection(p, x + 3, y + 3, 8, h - 6, colors);
        roofSection(p, x + 17, y + 3, 8, h - 7, colors);
        roofSection(p, x + w - 12, y + 3, 7, h - 7, colors);
      } else roofSection(p, x + 3, y + 3, Math.max(4, w - 7), Math.max(4, h - 6), colors);
      beam(p, x + 4, y + 3, x + 12, y + h - 4);
      beam(p, x + 15, y + h - 4, x + w - 4, y + 4);
    }
    p.clear(x + Math.floor(w / 2), y, 3, 2);
    p.clear(x, y + Math.floor(h * 0.6), 2, 3);
    for (const [dx, dy] of [[3, 3], [w - 7, 5], [Math.floor(w / 2) - 2, h - 6]]) tiles(p, x + dx, y + dy, colors);
    wall(p, x + w - 5, y + Math.floor(h / 2), 3, 2);
    return;
  }
  // Rafters and the floor lie beneath the roof, not painted black on it.
  if (stage) for (let yy = y + 4, k = 0; yy < y + rh - 2; yy += 6, k++) {
    if (stage >= 3 && k % 2) continue;
    p.rect(x + 2, yy, w - 5 - k % 3, 1, "wood"); p.rect(x + 3, yy, 3, 1, "woodLight");
  }
  for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < w; xx++) {
    const corner = (xx === 0 || xx === w - 1) && (yy === 0 || yy === rh - 1);
    if (corner || breach(xx, yy, w, rh, stage)) continue;
    const edge = xx === 0 || yy === 0 || xx === w - 1 || yy === rh - 1;
    // Hip planes run from each corner to a short, raised ridge.
    const left = xx < w / 2, hip = Math.min(xx, w - 1 - xx);
    const north = yy < hip, south = rh - 1 - yy < hip;
    const light = north ? 2 : south ? 0 : left ? 1 : 0;
    const horizontal = north || south || w > rh;
    const along = horizontal ? xx : yy;
    const slope = horizontal ? Math.min(yy, rh - 1 - yy) : Math.min(xx, w - 1 - xx);
    const color = roofTile(colors, light, along, slope, small);
    p.dot(x + xx, y + yy, edge ? "ink" : color);
  }
  if (rh > w) {
    for (let yy = Math.floor(w / 2); yy < rh - Math.floor(w / 2); yy++) if (!breach(w / 2, yy, w, rh, stage)) p.dot(x + Math.floor(w / 2), y + yy, yy % 3 === 0 ? colors[1] : colors[2]);
  } else {
    for (let xx = Math.floor(rh / 2); xx < w - Math.floor(rh / 2); xx++) if (!breach(xx, rh / 2, w, rh, stage)) p.dot(x + xx, y + Math.floor(rh / 2), xx % 3 === 0 ? colors[1] : colors[2]);
  }
  if (stage >= 2) {
    // A jagged wall breach opens to the courtyard instead of retaining an
    // intact outside outline. Debris stays beside the failed eave.
    if (w > h) {
      p.clear(x + Math.floor(w * 0.4), y + h - 2, Math.max(2, Math.floor(w * 0.2)), 2);
      tiles(p, x + Math.floor(w * 0.6), y + h - 6, colors);
    } else {
      p.clear(x + w - 2, y + Math.floor(h * 0.4), 2, Math.max(2, Math.floor(h * 0.2)));
      tiles(p, x + w - 6, y + Math.floor(h * 0.6), colors);
    }
    if (stage >= 3) {
      roofSection(p, x + Math.floor(w * 0.4), y + Math.floor(h * 0.45), Math.max(4, Math.floor(w * 0.4)), 5, colors);
      beam(p, x + Math.floor(w * 0.4), y + Math.floor(h * 0.6), x + w - 4, y + Math.floor(h * 0.75));
    }
  }
}

function rack(p: Drawing, x: number, y: number, count: number, halberds = false) {
  p.rect(x, y + 4, count * 3, 1, "woodDark");
  for (let i = 0; i < count; i++) {
    p.rect(x + i * 3 + 1, y, 1, 5, "woodLight"); p.dot(x + i * 3 + 1, y, "steelLight");
    if (halberds) p.rect(x + i * 3, y + 1, 2, 1, "steelLight");
  }
}

function barracks(wide: boolean, look: string, stage: number, ruin: boolean, ui: boolean) {
  const w = ui ? 24 : wide ? 48 : 32, h = ui ? 24 : wide ? 32 : 48, p = new Drawing(w, h);
  const roof: Ramp = look === "berserkers" ? ["woodDark", "wood", "woodLight"] : ["redDark", "red", "redLight"];
  const main: Roof = ui ? { x: 2, y: 2, w: 8, h: 20, colors: roof }
    : wide ? { x: 3, y: 3, w: 42, h: 12, colors: roof } : { x: 3, y: 3, w: 12, h: 42, colors: roof };
  const annex: Roof = ui ? { x: 10, y: 2, w: 12, h: 8, colors: roof }
    : wide ? { x: 3, y: 15, w: 11, h: 14, colors: roof } : { x: 15, y: 3, w: 14, h: 12, colors: roof };
  const arm: Roof = ui ? { x: 10, y: 16, w: 12, h: 6, colors: roof }
    : wide ? { x: 35, y: 15, w: 10, h: 14, colors: roof } : { x: 15, y: 35, w: 14, h: 10, colors: roof };
  if (look === "crusaders") annex.colors = ["stoneDark", "stoneLight", "stoneBright"];
  // A paved drill yard is part of the compound, with an open gate. Its
  // plane stays visible after destruction; loose terrain is never baked in.
  const yard = ui ? [10, 10, 12, 6] : wide ? [14, 15, 21, 14] : [15, 15, 14, 20];
  const [yx, yy, yw, yh] = yard;
  p.rect(yx, yy, yw, yh, "stoneDark");
  for (let y = yy + 2; y < yy + yh; y += 5) for (let x = yx + 2; x < yx + yw - 1; x += 5) p.rect(x, y, 2, 1, "stone");
  longhouse(p, main, stage, ruin, ui); longhouse(p, annex, Math.max(0, stage - 1), ruin, ui);
  longhouse(p, arm, stage < 2 ? 0 : stage - 1, ruin, ui);
  if (wide) {
    wall(p, 14, 27, 7, 2); wall(p, 29, 27, 6, 2);
    p.rect(22, 27, 6, 2, "woodLight");
  } else if (!ui) {
    wall(p, 27, 15, 2, 6); wall(p, 27, 29, 2, 6);
    p.rect(27, 23, 2, 5, "woodLight");
  }
  if (!ruin) {
    rack(p, ui ? 12 : wide ? 18 : 18, ui ? 11 : wide ? 18 : 18, ui ? 2 : 3, look === "halberdiers");
    // Paired dormers break the long roof plane, not an arbitrary roof badge.
    if (stage < 2) {
      const x = main.x + 3, y = main.y + 5;
      p.rect(x, y, 3, 3, "stoneDark"); p.rect(x, y, 3, 1, "stoneLight"); p.dot(x + 1, y + 1, "ink");
      if (!ui) {
        const dx = wide ? 20 : 0, dy = wide ? 0 : 22;
        p.rect(x + dx, y + dy, 3, 3, "redDark"); p.rect(x + dx, y + dy, 2, 1, "redLight");
      }
    }
    if (look === "crusaders") {
      p.rect(annex.x + 5, annex.y + 3, 1, 4, "redLight"); p.rect(annex.x + 4, annex.y + 4, 3, 1, "redLight");
    } else if (look === "berserkers") {
      p.rect(yx + 3, yy + yh - 4, 4, 2, "wood"); p.rect(yx + 3, yy + yh - 4, 3, 1, "woodLight");
    }
  } else {
    beam(p, yx + 1, yy + 2, yx + 6, yy + 5);
    tiles(p, yx + 3, yy + yh - 5, roof);
  }
  return p;
}

function octagon(x: number, y: number, n: number, cut: number) {
  return x >= 0 && y >= 0 && x < n && y < n && x + y >= cut && n - 1 - x + y >= cut && x + n - 1 - y >= cut && 2 * (n - 1) - x - y >= cut;
}

function guild(stage: number, ruin: boolean, ui: boolean) {
  const n = ui ? 24 : 32, p = new Drawing(n, n), e = ui ? 2 : 3, size = n - e * 2;
  const cut = ui ? 5 : 7, band = ui ? 4 : 5, inner = size - 2 * band;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!octagon(x, y, size, cut)) continue;
    const court = octagon(x - band, y - band, inner, Math.max(2, cut - band));
    if (court) { p.dot(e + x, e + y, "woodLight"); continue; }
    const broken = ruin || stage > 0 && x > size * (stage === 1 ? 0.82 : stage === 2 ? 0.62 : 0.48) && y < size * (stage === 1 ? 0.38 : stage === 2 ? 0.6 : 0.8);
    const outer = !octagon(x - 1, y - 1, size - 2, cut - 1);
    const rim = !octagon(x - 2, y - 2, size - 4, cut - 2);
    if (broken) {
      // The failed east galleries expose plank floors and short radial
      // rafters. Surviving low walls still trace the octagonal plan.
      if (outer && (x + 2 * y) % 7 < 3) continue;
      p.dot(e + x, e + y, outer ? "stoneDark" : "woodDark");
      if (!outer && (x + y * 2) % 9 === 0) p.dot(e + x, e + y, "woodLight");
      continue;
    }
    const light = x + y < size - 1 ? 2 : 0;
    const innerEdge = octagon(x - band + 1, y - band + 1, inner + 2, Math.max(2, cut - band) + 1);
    const horizontal = Math.abs(x - (size - 1) / 2) < Math.abs(y - (size - 1) / 2);
    const along = horizontal ? x : y, slope = horizontal ? Math.min(y, size - 1 - y) : Math.min(x, size - 1 - x);
    p.dot(e + x, e + y, outer ? "ink" : rim ? "stoneLight" : innerEdge ? "redDark" : roofTile(["redDark", "red", "redLight"], light, along, slope, ui));
    // Eight roof planes read as an arena, instead of another rectangular hall.
    if (!rim && (x === y || x + y === size - 1)) p.dot(e + x, e + y, "redDark");
  }
  const c = n / 2;
  // South entry interrupts the roof ring. Ground-level equipment identifies
  // the training court without putting a giant shield on its roof.
  p.rect(c - 2, n - e - band, 4, band, "woodDark");
  p.rect(c - 2, n - e - 1, 4, 1, "stoneLight");
  if (!ruin) {
    for (const [x, y] of [[c - 4, c - 3], [c + 2, c + 2]]) {
      p.rect(x, y, 3, 3, "woodDark"); p.rect(x + 1, y, 1, 2, "gold");
    }
    p.rect(c - 3, e + band - 1, 6, 1, "steelLight");
    if (stage >= 2) { roofSection(p, n - e - band - 3, e + 5, 4, 5, ["redDark", "red", "redLight"]); beam(p, c + 2, c - 6, c + 5, c - 1); }
  } else {
    roofSection(p, e + 3, e + 3, 6, 5, ["redDark", "red", "redLight"]);
    roofSection(p, n - e - 8, c, 5, 5, ["redDark", "red", "redLight"]);
    beam(p, c + 1, e + 2, c + 5, c - 3);
    p.rect(c - 3, c + 3, 3, 1, "gold");
    wall(p, e + 1, c - 1, 2, 4); wall(p, c - 3, e, 5, 2);
  }
  return p;
}

function tower(look: string, stage: number, ruin: boolean, ui: boolean) {
  const n = ui ? 24 : 16, p = new Drawing(n, n), e = ui ? 2 : 1, size = n - 2 * e, cut = ui ? 4 : 3;
  for (let y = e; y < n - e; y++) for (let x = e; x < n - e; x++) {
    const dx = x - e, dy = y - e;
    if (dx + dy < cut || size - 1 - dx + dy < cut || dx + size - 1 - dy < cut || 2 * (size - 1) - dx - dy < cut) continue;
    if ((stage >= 2 || ruin) && dx > size * 0.55 && dy < size * 0.5) continue;
    const rim = Math.min(dx, dy, size - 1 - dx, size - 1 - dy);
    const corner = dx + dy < cut + 2 || size - 1 - dx + dy < cut + 2 || dx + size - 1 - dy < cut + 2 || 2 * (size - 1) - dx - dy < cut + 2;
    p.dot(x, y, rim === 0 || (corner && rim < 2) ? "ink" : rim < 2 ? dx + dy < size ? "stoneBright" : "stoneLight" : "stone");
  }
  const cx = n / 2, cy = n / 2;
  for (let y = e + 4; y < n - e - 3; y += 3) p.rect(e + 3, y, size - 6, 1, "stoneDark");
  if (ruin) {
    p.clear(e + 3, e + 3, size - 6, size - 6);
    beam(p, cx - 3, cy - 2, cx + 2, cy + 3);
    wall(p, e + 1, cy, 3, 2); wall(p, cx + 1, n - e - 4, 3, 2);
    p.rect(cx, cy, 3, 2, look === "spotters" ? "gold" : "steelLight");
    return p;
  }
  // Top-down stair hatch and deck equipment rather than a facade.
  p.rect(e + 3, n - e - 5, 3, 3, "ink"); p.rect(e + 3, n - e - 5, 2, 1, "woodLight");
  if (look === "spotters") {
    if (stage < 3) {
      p.line(cx - 2, cy + 2, cx + 3, cy - 3, "ink"); p.line(cx - 1, cy + 2, cx + 4, cy - 3, "gold"); p.dot(cx + 4, cy - 3, "goldLight");
    } else p.rect(cx, cy, 3, 1, "gold");
  } else {
    const r = look === "signalFires" ? 3 : 2;
    p.rect(cx - r, cy - r, r * 2, r * 2, "ink"); p.rect(cx - r + 1, cy - r + 1, r * 2 - 2, r * 2 - 2, "steelLight");
    p.rect(cx - 1, cy - 1, 2, 2, stage >= 2 ? "wood" : "redLight");
    if (stage < 2) p.dot(cx, cy - 1, "goldLight");
  }
  if (stage === 1) p.clear(n - e - 3, e + 2, 1, 2);
  if (stage >= 3) { p.clear(n - e - 4, cy, 4, 3); beam(p, cx - 2, cy - 2, cx + 1, cy + 2); }
  return p;
}

export function architecturalArt(id: string, look: string, stage = 0, ruin = false): Drawing | undefined {
  if (id === "barracks" || id === "barracksWide") return barracks(id === "barracksWide", look, stage, ruin, false);
  if (id === "meleeGuild") return guild(stage, ruin, false);
  if (id === "watchTower") return tower(look, stage, ruin, false);
}

export function architecturalIcon(kind: string, look: string): Drawing | undefined {
  if (kind === "barracks") return barracks(false, look, 0, false, true);
  if (kind === "meleeGuild") return guild(0, false, true);
  if (kind === "watchTower") return tower(look, 0, false, true);
}
