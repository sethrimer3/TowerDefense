/** Every piece of art an artist can redraw, as the export hands it over
 * (`npm run export-sprites`, `tools/sprite-export.html`): one PNG a piece,
 * one pixel an art pixel (8 a board cell), with no baked outline. The shared
 * renderer adds one art pixel outside world art; units use their contours. An artist's
 * PNG saved under `art/sprites/` with the same name stands in for it
 * (`art-overrides.ts`). Base art, rubble, animation and equipment sources are listed. The game
 * applies damage and the shared outline after source replacement. Pure; Node runs it in the tests. */
import { ART_NAMES } from "./art-overrides.ts";
import { BALLISTA, STRUCTURES } from "./catalog.ts";
import { GATE_FRAMES, gatePixels, gateRubblePixels } from "./gate-art.ts";
import { gateRect, SIDES } from "./layout.ts";
import { ART } from "./park-art.ts";
import { houseRubblePixels, roofPixels } from "./roof-art.ts";
import { keepPixels, keepRubblePixels, flagPixels, FLAG_W, FLAG_H, ROOFS } from "./structure-art.ts";
import { KINDS, PATH_LOOKS, structurePixels, structureRubblePixels } from "./tower-art.ts";
import {
  BALLISTA_ART,
  BALLISTA_DIRS,
  ballistaPixels,
  bastionPixels,
  bastionRubblePixels,
  spikePixels,
} from "./wall-defense-art.ts";
import { WOOD_GATE, woodGatePixels, woodGateRubblePixels } from "./wood-gate-art.ts";

import { extraArtPieces } from "./art-export-extra.ts";
import type { ArtPiece } from "./sprite-source.ts";
export type { ArtPiece } from "./sprite-source.ts";

/** Houses' sizes in cells, the commonest first. */
const HOUSES = [
  [1, 2],
  [2, 1],
  [1, 1],
  [3, 1],
  [1, 3],
  [2, 2],
] as const;
const KEEP = 3 * ART;

/** Every piece, its pixels bare of their outline. */
export function artPieces(): ArtPiece[] {
  const out: ArtPiece[] = [];
  const add = (name: string, w: number, h: number, about: string, make: () => Uint32Array) =>
    out.push({ name, w, h, about, pixels: make });
  for (const kind of KINDS) {
    const def = STRUCTURES[kind];
    const sizes = [[def.w, def.h], ...(def.compact ? [[def.compact.w, def.compact.h]] : [])];
    for (const [cw, ch] of sizes)
      add(ART_NAMES.rubble(ART_NAMES.structure(kind, cw, ch)), cw * ART, ch * ART, `${def.name} rubble`, () =>
        structureRubblePixels(kind, cw, ch),
      );
    for (const [cw, ch] of sizes)
      for (const look of ["", ...(PATH_LOOKS[kind] ?? [])])
        add(
          ART_NAMES.structure(kind, cw, ch, look),
          cw * ART,
          ch * ART,
          `${def.name}, ${cw} × ${ch} cells${look ? `, ${look} look` : ""}`,
          () => structurePixels(kind, cw, ch, 0, 0, look),
        );
  }
  add(ART_NAMES.rubble(ART_NAMES.keep), KEEP, KEEP, "The ruined keep", keepRubblePixels);
  for (const blue of [false, true])
    for (let frame = 0; frame < 12; frame++)
      add(ART_NAMES.banner(blue, frame), FLAG_W, FLAG_H, `${blue ? "Rally" : "War"} banner, frame ${frame}`, () =>
        flagPixels(frame / 12, false, blue),
      );
  add(ART_NAMES.keep, KEEP, KEEP, "The keep", () => keepPixels(0));
  for (let v = 0; v < ROOFS.length; v++)
    for (const [cw, ch] of HOUSES)
      add(ART_NAMES.rubble(ART_NAMES.roof(v, cw, ch)), cw * ART, ch * ART, "House rubble", () =>
        houseRubblePixels(cw, ch, v, 0),
      );
  for (let v = 0; v < ROOFS.length; v++)
    for (const [cw, ch] of HOUSES)
      add(ART_NAMES.roof(v, cw, ch), cw * ART, ch * ART, `A house's roof, colour ${v}, ${cw} × ${ch} cells`, () =>
        roofPixels(cw, ch, v, 0),
      );
  for (const side of SIDES) {
    const r = gateRect({ tx: 0, ty: 0, side });
    add(ART_NAMES.rubble(ART_NAMES.gate(side, 0)), r.w * ART, r.h * ART, "Gate rubble", () => gateRubblePixels(side));
    for (let f = 0; f < GATE_FRAMES; f++)
      add(
        ART_NAMES.gate(side, f),
        r.w * ART,
        r.h * ART,
        `City gate on the ${side} wall, doors ${f ? `open ${f}/${GATE_FRAMES - 1}` : "shut"}`,
        () => gatePixels(side, f),
      );
    const across = side === "e" || side === "w",
      u = WOOD_GATE.long * ART,
      v = WOOD_GATE.deep * ART;
    add(ART_NAMES.rubble(ART_NAMES.woodGate(side, 0)), across ? v : u, across ? u : v, "Wooden gate rubble", () =>
      woodGateRubblePixels(side),
    );
    for (let f = -1; f < GATE_FRAMES; f++)
      add(
        ART_NAMES.woodGate(side, f),
        across ? v : u,
        across ? u : v,
        `Wooden gate on the ${side} side, ${f < 0 ? "posts only" : f ? `open ${f}/${GATE_FRAMES - 1}` : "shut"}`,
        () => woodGatePixels(side, f),
      );
  }
  for (const side of SIDES)
    for (let seed = 0; seed < 8; seed++)
      add(ART_NAMES.spike(side, seed), ART, ART, "Wall spikes; ends join neighbouring beams", () =>
        spikePixels(side, seed),
      );
  const b = BALLISTA.size * ART;
  add(ART_NAMES.rubble(ART_NAMES.bastion), b, b, "Bastion rubble", () => bastionRubblePixels());
  add(ART_NAMES.bastion, b, b, "A wall ballista's bastion", () => bastionPixels());
  for (let d = 0; d < BALLISTA_DIRS; d++)
    for (const loaded of [true, false])
      add(
        ART_NAMES.ballista(d, loaded),
        BALLISTA_ART,
        BALLISTA_ART,
        `The ballista, heading ${d}/${BALLISTA_DIRS} clockwise from east, ${loaded ? "loaded" : "slack"}`,
        () => ballistaPixels(d, loaded),
      );
  return [...out, ...extraArtPieces()];
}
