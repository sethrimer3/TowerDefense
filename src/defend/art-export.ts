/** Every piece of art an artist can redraw, as the export hands it over
 * (`npm run export-sprites`, `tools/sprite-export.html`): one PNG a piece,
 * one pixel an art pixel (8 a board cell), with no outline (`bare`: the game
 * draws one half an art pixel wide round whatever is there). An artist's
 * PNG saved under `art/sprites/` with the same name stands in for it
 * (`art-overrides.ts`). Only the base art is listed: the game paints
 * damage, rubble and the outline over it. Pure; Node runs it in the tests. */
import { ART_NAMES } from "./art-overrides.ts";
import { BALLISTA, STRUCTURES } from "./catalog.ts";
import { bare } from "./damage-art.ts";
import { GATE_FRAMES, gatePixels } from "./gate-art.ts";
import { gateRect, SIDES } from "./layout.ts";
import { ART } from "./park-art.ts";
import { roofPixels } from "./roof-art.ts";
import { keepPixels, ROOFS } from "./structure-art.ts";
import { KINDS, PATH_LOOKS, structurePixels } from "./tower-art.ts";
import { BALLISTA_ART, BALLISTA_DIRS, ballistaPixels, bastionPixels } from "./wall-defense-art.ts";
import { WOOD_GATE, woodGatePixels } from "./wood-gate-art.ts";

export type ArtPiece = { name: string; w: number; h: number; about: string; pixels: () => Uint32Array };

/** Houses' sizes in cells, the commonest first. */
const HOUSES = [[1, 2], [2, 1], [1, 1], [3, 1], [1, 3], [2, 2]] as const;
const KEEP = 3 * ART;

/** Every piece, its pixels bare of their outline. */
export function artPieces(): ArtPiece[] {
  const out: ArtPiece[] = [];
  const add = (name: string, w: number, h: number, about: string, make: () => Uint32Array) =>
    out.push({ name, w, h, about, pixels: () => bare(make(), w, h) });
  for (const kind of KINDS) {
    const def = STRUCTURES[kind];
    const sizes = [[def.w, def.h], ...(def.compact ? [[def.compact.w, def.compact.h]] : [])];
    for (const [cw, ch] of sizes)
      for (const look of ["", ...(PATH_LOOKS[kind] ?? [])])
        add(ART_NAMES.structure(kind, cw, ch, look), cw * ART, ch * ART, `${def.name}, ${cw} × ${ch} cells${look ? `, ${look} look` : ""}`, () => structurePixels(kind, cw, ch, 0, 0, look));
  }
  add(ART_NAMES.keep, KEEP, KEEP, "The keep", () => keepPixels(0));
  for (let v = 0; v < ROOFS.length; v++)
    for (const [cw, ch] of HOUSES) add(ART_NAMES.roof(v, cw, ch), cw * ART, ch * ART, `A house's roof, colour ${v}, ${cw} × ${ch} cells`, () => roofPixels(cw, ch, v, 0));
  for (const side of SIDES) {
    const r = gateRect({ tx: 0, ty: 0, side });
    for (let f = 0; f < GATE_FRAMES; f++) add(ART_NAMES.gate(side, f), r.w * ART, r.h * ART, `City gate on the ${side} wall, doors ${f ? `open ${f}/${GATE_FRAMES - 1}` : "shut"}`, () => gatePixels(side, f));
    const across = side === "e" || side === "w", u = WOOD_GATE.long * ART, v = WOOD_GATE.deep * ART;
    for (let f = -1; f < GATE_FRAMES; f++)
      add(ART_NAMES.woodGate(side, f), across ? v : u, across ? u : v, `Wooden gate on the ${side} side, ${f < 0 ? "posts only" : f ? `open ${f}/${GATE_FRAMES - 1}` : "shut"}`, () => woodGatePixels(side, f));
  }
  const b = BALLISTA.size * ART;
  add(ART_NAMES.bastion, b, b, "A wall ballista's bastion", () => bastionPixels());
  for (let d = 0; d < BALLISTA_DIRS; d++)
    for (const loaded of [true, false]) add(ART_NAMES.ballista(d, loaded), BALLISTA_ART, BALLISTA_ART, `The ballista, heading ${d}/${BALLISTA_DIRS} clockwise from east, ${loaded ? "loaded" : "slack"}`, () => ballistaPixels(d, loaded));
  return out;
}
