/** Cached directional bodies, drawn using the established procedural views. */
import { BODY_FRAMES, bodyKey, type BodyKind, type BodyOptions } from "./melee-body-data.ts";
import type { Facing } from "./melee-facing.ts";

const frames = new Map(BODY_FRAMES.map((frame, i) => [frame.key, { frame, i }]));
const cache = new Map<string, HTMLCanvasElement>();

export function meleeBody(kind: BodyKind, direction: Facing, options: BodyOptions = {}) {
  const key = bodyKey(kind, options), found = frames.get(key)!;
  const id = `${key}:${direction}`;
  let cv = cache.get(id);
  if (cv) return cv;
  const { frame, i } = found, rows = frame.views[direction];
  cv = document.createElement("canvas"); cv.width = rows[0].length; cv.height = rows.length;
  const c = cv.getContext("2d")!;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== ".") { c.fillStyle = frame.palette[ch]; c.fillRect(x, y, 1, 1); }
  }));
  cache.set(id, cv);
  return cv;
}
