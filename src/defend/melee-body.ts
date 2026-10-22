/** Cached native directional bodies. PNG while Pixel Art is on; matching
 * procedural views keep loading/failure/off rendering complete. */
import { BODY_CELL, BODY_DIRECTIONS, BODY_FRAMES, bodyKey, type BodyKind, type BodyOptions } from "./melee-body-data.ts";
import { pixelKey, pixelSprite } from "./pixel-sprites.ts";
import type { Facing } from "./melee-facing.ts";

const frames = new Map(BODY_FRAMES.map((frame, i) => [frame.key, { frame, i }]));
const cache = new Map<string, HTMLCanvasElement>();
let revision = "";

export function meleeBody(kind: BodyKind, direction: Facing, options: BodyOptions = {}) {
  const key = bodyKey(kind, options), found = frames.get(key)!;
  const sheet = pixelSprite("v2/units/melee-facing"), rev = pixelKey();
  if (revision !== rev) { revision = rev; cache.clear(); }
  const id = `${key}:${direction}`;
  let cv = cache.get(id);
  if (cv) return cv;
  const { frame, i } = found, rows = frame.views[direction];
  cv = document.createElement("canvas"); cv.width = rows[0].length; cv.height = rows.length;
  const c = cv.getContext("2d")!;
  if (sheet) c.drawImage(sheet, BODY_DIRECTIONS.indexOf(direction)*BODY_CELL+1, i*BODY_CELL+1, cv.width, cv.height, 0, 0, cv.width, cv.height);
  else rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== ".") { c.fillStyle = frame.palette[ch]; c.fillRect(x, y, 1, 1); }
  }));
  cache.set(id, cv);
  return cv;
}
