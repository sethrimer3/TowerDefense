/** Shared keep-health artwork. No simulation state or random streams. */
export const W = 37, TOP = 3, COURSE = 4, H = TOP + 9 + 6;
export const MORTAR = "#0b0706", HOLE = "#1d1310", FACE = "#a8452e", LIGHT = "#cf6a4c", SHADE = "#6c2819", CRACK = "#2a0f09";
export type Brick = { x: number; y: number; w: number };

/** Ordered from left to right, as in the keep's health bar. */
export const BRICKS: readonly Brick[] = (() => {
  const list: Brick[] = [];
  for (let i = 0; i < 6; i++) list.push({ x: 1 + i * 6, y: TOP + 1, w: 5 });
  list.push({ x: 1, y: TOP + 1 + COURSE, w: 2 });
  for (let i = 0; i < 5; i++) list.push({ x: 4 + i * 6, y: TOP + 1 + COURSE, w: 5 });
  list.push({ x: 34, y: TOP + 1 + COURSE, w: 2 });
  return list.sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
})();

export function paintBrickBed(c: CanvasRenderingContext2D) {
  c.fillStyle = MORTAR;
  c.fillRect(0, TOP, W, COURSE * 2 + 1);
  c.fillStyle = HOLE;
  for (const b of BRICKS) c.fillRect(b.x, b.y, b.w, 3);
}

export function paintBrick(c: CanvasRenderingContext2D, b: Brick) {
  c.fillStyle = FACE;
  c.fillRect(b.x, b.y, b.w, 3);
  c.fillStyle = LIGHT;
  c.fillRect(b.x, b.y, b.w - 1, 1);
  c.fillStyle = SHADE;
  c.fillRect(b.x, b.y + 2, b.w, 1);
  c.fillRect(b.x + b.w - 1, b.y, 1, 3);
}
