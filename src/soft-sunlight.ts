/** Atmospheric light only: a cached, feathered density field, screen-blended
 * over crisp scene art. No full-scene blur, frame allocations or new clocks. */
export const SUNLIGHT = {
  density: 0.18,
  feather: 0.18,
  spread: 0.85,
  distanceFade: 1.7,
  sway: 0.025,
  swayMs: 28000,
  dustCount: 30,
} as const;

const TINTS = [[255, 244, 222], [226, 239, 255], [255, 238, 202]] as const;

export class SoftSunlight {
  private fields: HTMLCanvasElement[];

  constructor() {
    // Analytic feathering is baked once, including the halo and both ends.
    // Scaling this small field is cheaper than blurring a room every frame.
    this.fields = TINTS.map(tint => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 192;
      const ctx = canvas.getContext("2d")!, image = ctx.createImageData(96, 192);
      for (let y = 0; y < 192; y++) for (let x = 0; x < 96; x++) {
        const along = (y + 0.5) / 192, across = (x + 0.5) / 48 - 1;
        const sigma = SUNLIGHT.feather * (1 + along * SUNLIGHT.spread);
        const start = Math.min(1, along / 0.14);
        const density = Math.exp(-across * across / (2 * sigma * sigma))
          * start * start * (3 - 2 * start) * (1 - along) ** SUNLIGHT.distanceFade;
        const o = (y * 96 + x) * 4;
        image.data[o] = tint[0]; image.data[o + 1] = tint[1]; image.data[o + 2] = tint[2];
        image.data[o + 3] = Math.round(255 * SUNLIGHT.density * density);
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
