/** Atmospheric light only: a cached, feathered density field, screen-blended
 * over crisp scene art. No full-scene blur, frame allocations or new clocks. */
export const SUNLIGHT = {
  density: 0.18,
  feather: 0.18,
  spread: 0.85,
  distanceFade: 1.7,
  sway: 0.025,
  swayMs: 28000,
  /** The Tiles hall: denser shafts, a slower, wider sway and more dust. */
  hallDensity: 0.5,
  hallFade: 0.9,
  hallSway: 0.09,
  hallSwayMs: 11000,
  dustCount: 70,
} as const;

const TINTS = [[255, 244, 222], [226, 239, 255], [255, 238, 202]] as const;

/** The baked field's shape, 0 to 1: `along` the shaft from its top (0 to 1),
 * `across` its halo (-1 to 1, the drawn field's full width). */
export function shaftField(along: number, across: number, fade: number = SUNLIGHT.distanceFade) {
  if (along <= 0 || along >= 1 || across <= -1 || across >= 1) return 0;
  const sigma = SUNLIGHT.feather * (1 + along * SUNLIGHT.spread);
  const start = Math.min(1, along / 0.14);
  return Math.exp(-across * across / (2 * sigma * sigma)) * start * start * (3 - 2 * start) * (1 - along) ** fade;
}

/** How bright a shaft `draw` would paint with these arguments is at (px, py),
 * 0 to 1 before its density: the same field, sampled analytically. */
export function shaftAt(px: number, py: number, x: number, y: number, width: number, length: number, tilt: number, fade: number = SUNLIGHT.distanceFade) {
  if (width <= 0 || length <= 0) return 0;
  const v = py - y;
  return shaftField(v / length, (px - x - tilt * v) / (width * 1.8), fade);
}

export class SoftSunlight {
  private fields: HTMLCanvasElement[];

  /** `density` is the field's peak opacity; the Tiles hall's shafts, over its
   * darker shelf, are denser than the Library's. */
  constructor(density: number = SUNLIGHT.density, fade: number = SUNLIGHT.distanceFade) {
    // Analytic feathering is baked once, including the halo and both ends.
    // Scaling this small field is cheaper than blurring a room every frame.
    this.fields = TINTS.map(tint => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 192;
      const ctx = canvas.getContext("2d")!, image = ctx.createImageData(96, 192);
      for (let y = 0; y < 192; y++) for (let x = 0; x < 96; x++) {
        const field = shaftField((y + 0.5) / 192, (x + 0.5) / 48 - 1, fade);
        const o = (y * 96 + x) * 4;
        image.data[o] = tint[0]; image.data[o + 1] = tint[1]; image.data[o + 2] = tint[2];
        image.data[o + 3] = Math.round(255 * density * field);
      }
      ctx.putImageData(image, 0, 0);
      return canvas;
    });
  }

  /** `width` is the aperture, not the halo; coordinates use the caller's
   * scene units. Save/restore preserves its camera, sampling and blend mode. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, length: number, tilt: number, strength: number, tint = 0) {
    if (strength <= 0 || length <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = strength;
    ctx.imageSmoothingEnabled = true;
    ctx.translate(x, y);
    ctx.transform(1, 0, tilt, 1, 0, 0);
    ctx.drawImage(this.fields[tint % this.fields.length], -width * 1.8, 0, width * 3.6, length);
    ctx.restore();
  }
}
