/** Cached directional bodies, drawn using the established procedural views. */
import { BODY_FRAMES, bodyKey, type BodyKind, type BodyOptions } from "./melee-body-data.ts";
import type { Facing } from "./melee-facing.ts";

import { meleeFramePixels } from "./unit-body-art.ts";
import { spriteCanvas } from "./damage-art.ts";
import { onPixelArt } from "./pixel-sprites.ts";

const frames = new Map(BODY_FRAMES.map((frame, i) => [frame.key, { frame, i }]));
const cache = new Map<string, HTMLCanvasElement>();

export function meleeBody(kind: BodyKind, direction: Facing, options: BodyOptions = {}) {
  const key = bodyKey(kind, options), found = frames.get(key)!;
  const id = `${key}:${direction}`;
  let cv = cache.get(id);
  if (cv) return cv;
  const p = meleeFramePixels(key, direction);
  cv = spriteCanvas(p.data, p.w, p.h, undefined, false);
  cache.set(id, cv);
  return cv;
}

onPixelArt(() => cache.clear());
